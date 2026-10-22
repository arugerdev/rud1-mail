import "server-only";

import https from "node:https";
import http from "node:http";

import { config } from "@/lib/config";

/**
 * Cliente mínimo de la API de Mailcow.
 *
 * La API solo responde desde el propio servidor de correo (API_ALLOW_FROM), y
 * su clave da control total: nunca sale de aquí ni se usa con datos que no se
 * hayan comprobado antes.
 */

export class MailcowUnavailableError extends Error {
  constructor() {
    super("La API de Mailcow no está configurada");
    this.name = "MailcowUnavailableError";
  }
}

export function mailcowAvailable(): boolean {
  return Boolean(config.mailcow.url && config.mailcow.key);
}

function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const { url, key, insecureTls } = config.mailcow;
  if (!url || !key) return Promise.reject(new MailcowUnavailableError());
  const target = new URL(`${url.replace(/\/$/, "")}/${path}`);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const transport = target.protocol === "http:" ? http : https;

  return new Promise<T>((resolve, reject) => {
    const req = transport.request(
      target,
      {
        method,
        headers: {
          "X-API-Key": key,
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        ...(target.protocol === "https:" ? { rejectUnauthorized: !insecureTls } : {}),
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`Mailcow respondió ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch {
            reject(new Error("Respuesta de Mailcow no válida"));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Mailcow no responde")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

interface MailcowResult {
  type: "success" | "danger" | "error" | "warning";
  msg: unknown;
}

/** Mailcow responde 200 incluso cuando algo falla: el resultado va dentro. */
function assertSuccess(results: MailcowResult[] | MailcowResult): void {
  const list = Array.isArray(results) ? results : [results];
  const failed = list.find((r) => r.type !== "success");
  if (failed) {
    const msg = Array.isArray(failed.msg) ? failed.msg.join(" ") : String(failed.msg);
    throw new MailcowError(msg);
  }
}

export class MailcowError extends Error {
  constructor(public readonly code: string) {
    super(`Mailcow: ${code}`);
    this.name = "MailcowError";
  }
}

export interface MailboxInfo {
  username: string;
  name: string;
  active: boolean;
  forcePasswordUpdate: boolean;
  quotaBytes: number;
  usedBytes: number;
}

interface RawMailbox {
  username?: string;
  name?: string;
  active?: number | string;
  quota?: number;
  quota_used?: number;
  attributes?: { force_pw_update?: string | number };
}

export async function getMailbox(email: string): Promise<MailboxInfo | null> {
  const raw = await request<RawMailbox | RawMailbox[] | Record<string, never>>(
    "GET",
    `get/mailbox/${encodeURIComponent(email)}`,
  );
  const box = Array.isArray(raw) ? raw[0] : raw;
  if (!box || !("username" in box) || !box.username) return null;
  return {
    username: box.username,
    name: box.name || box.username,
    active: String(box.active) === "1",
    forcePasswordUpdate: String(box.attributes?.force_pw_update ?? "0") === "1",
    quotaBytes: Number(box.quota ?? 0),
    usedBytes: Number(box.quota_used ?? 0),
  };
}

/** Pone la contraseña del buzón y quita la marca de contraseña provisional. */
export async function setMailboxPassword(email: string, password: string): Promise<void> {
  const results = await request<MailcowResult[]>("POST", "edit/mailbox", {
    items: [email],
    attr: { password, password2: password, force_pw_update: "0" },
  });
  assertSuccess(results);
}
