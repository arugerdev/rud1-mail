import "server-only";

import { createHash } from "node:crypto";
import { ImapFlow } from "imapflow";

import { config } from "@/lib/config";

/**
 * Conexiones IMAP reutilizadas entre peticiones.
 *
 * Abrir una conexión (TLS + login) cuesta más que la propia consulta, así que
 * cada buzón mantiene una abierta mientras se usa y se cierra sola tras unos
 * minutos sin actividad. La clave incluye un resumen de la contraseña: si se
 * cambia, la conexión vieja no se reutiliza.
 */

const IDLE_CLOSE_MS = 5 * 60 * 1000;

interface PooledClient {
  client: ImapFlow;
  ready: Promise<void>;
  lastUsed: number;
}

// En desarrollo Next recarga los módulos: el almacén cuelga de globalThis
// para no dejar conexiones huérfanas en cada recarga.
const globalPool = globalThis as unknown as { __rud1MailPool?: Map<string, PooledClient> };
const pool = (globalPool.__rud1MailPool ??= new Map<string, PooledClient>());

function poolKey(email: string, password: string): string {
  return `${email}:${createHash("sha256").update(password).digest("hex").slice(0, 16)}`;
}

export interface Credentials {
  email: string;
  password: string;
}

function newClient({ email, password }: Credentials, clientIp?: string): ImapFlow {
  return new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.port === 993,
    servername: config.imap.servername,
    auth: { user: email, pass: password },
    logger: false,
    // Dovecot apunta la IP real de quien entra (para los bloqueos por fuerza
    // bruta) si la red de la aplicación está entre sus redes de confianza.
    clientInfo: {
      name: "rud1 Mail",
      ...(clientIp ? { "x-originating-ip": clientIp } : {}),
    },
    emitLogs: false,
    disableAutoIdle: true,
  });
}

export class ImapAuthError extends Error {
  constructor() {
    super("Usuario o contraseña incorrectos");
    this.name = "ImapAuthError";
  }
}

function isAuthFailure(error: unknown): boolean {
  const e = error as { authenticationFailed?: boolean; serverResponseCode?: string; responseText?: string };
  return (
    e?.authenticationFailed === true ||
    e?.serverResponseCode === "AUTHENTICATIONFAILED" ||
    /authentication failed/i.test(e?.responseText ?? "")
  );
}

/**
 * Comprueba usuario y contraseña con una conexión de un solo uso.
 * Lanza ImapAuthError si son incorrectos y el error original si el servidor
 * no responde, para no confundir "contraseña mal" con "servidor caído".
 */
export async function verifyCredentials(credentials: Credentials, clientIp?: string): Promise<void> {
  const client = newClient(credentials, clientIp);
  try {
    await client.connect();
  } catch (error) {
    if (isAuthFailure(error)) throw new ImapAuthError();
    throw error;
  } finally {
    await client.logout().catch(() => client.close());
  }
}

async function getClient(credentials: Credentials): Promise<ImapFlow> {
  const key = poolKey(credentials.email, credentials.password);
  const existing = pool.get(key);
  if (existing && existing.client.usable) {
    await existing.ready;
    existing.lastUsed = Date.now();
    return existing.client;
  }
  if (existing) pool.delete(key);

  const client = newClient(credentials);
  const entry: PooledClient = { client, ready: client.connect(), lastUsed: Date.now() };
  pool.set(key, entry);
  client.on("close", () => {
    if (pool.get(key)?.client === client) pool.delete(key);
  });
  client.on("error", () => {
    if (pool.get(key)?.client === client) pool.delete(key);
  });
  try {
    await entry.ready;
  } catch (error) {
    pool.delete(key);
    if (isAuthFailure(error)) throw new ImapAuthError();
    throw error;
  }
  return client;
}

/** Ejecuta `fn` con la conexión del buzón (sin carpeta abierta). */
export async function withImap<T>(credentials: Credentials, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = await getClient(credentials);
  return fn(client);
}

/**
 * Ejecuta `fn` con una carpeta abierta y bloqueada para esta operación: si dos
 * peticiones tocan carpetas distintas a la vez, la segunda espera su turno.
 */
export async function withMailbox<T>(
  credentials: Credentials,
  path: string,
  fn: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = await getClient(credentials);
  const lock = await client.getMailboxLock(path);
  try {
    return await fn(client);
  } finally {
    lock.release();
  }
}

/** Cierra la conexión del buzón (al salir o cambiar la contraseña). */
export async function closeConnections(email: string): Promise<void> {
  for (const [key, entry] of pool) {
    if (key.startsWith(`${email}:`)) {
      pool.delete(key);
      await entry.client.logout().catch(() => entry.client.close());
    }
  }
}

const sweeper = globalThis as unknown as { __rud1MailSweeper?: NodeJS.Timeout };
sweeper.__rud1MailSweeper ??= setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of pool) {
    if (now - entry.lastUsed > IDLE_CLOSE_MS) {
      pool.delete(key);
      entry.client.logout().catch(() => entry.client.close());
    }
  }
}, 60 * 1000).unref();
