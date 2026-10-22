import "server-only";

import { ImapFlow } from "imapflow";

import { config } from "@/lib/config";

/**
 * Quién ve cada buzón común.
 *
 * Se guarda en el propio servidor de correo (permisos IMAP, RFC 4314): así
 * vale igual en rud1 Mail, en el móvil y en Outlook. Para cambiarlos, rud1
 * Mail entra en el buzón común con el usuario maestro de Dovecot (que solo
 * conoce el servidor) y aplica los permisos a todas sus carpetas.
 */

/** Ver, leer, marcar, mover, borrar mensajes y crear carpetas. Sin administrar permisos ("a"). */
export const SHARED_RIGHTS = "lrswipkte";

const MASTER_USER = process.env.DOVECOT_MASTER_USER ?? null;
const MASTER_PASS = process.env.DOVECOT_MASTER_PASS ?? null;

export class SharedAccessUnavailableError extends Error {
  constructor() {
    super("La gestión de buzones comunes no está configurada");
    this.name = "SharedAccessUnavailableError";
  }
}

export function sharedAccessAvailable(): boolean {
  return Boolean(MASTER_USER && MASTER_PASS);
}

/** Entra en el buzón `owner` como su dueño (usuario maestro) solo para esta operación. */
async function asOwner<T>(owner: string, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  if (!MASTER_USER || !MASTER_PASS) throw new SharedAccessUnavailableError();
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.port === 993,
    servername: config.imap.servername,
    auth: { user: `${owner}*${MASTER_USER}`, pass: MASTER_PASS },
    logger: false,
    clientInfo: { name: "rud1 Mail (administración)" },
    disableAutoIdle: true,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

interface UntaggedAttr {
  value?: string;
}

/** Las carpetas propias del buzón (sin el espacio compartido ni las que no se pueden abrir). */
async function ownFolders(client: ImapFlow): Promise<string[]> {
  const list = await client.list();
  return list.filter((f) => !f.flags.has("\\Noselect") && !/^Shared(\/|$)/.test(f.path)).map((f) => f.path);
}

async function getAcl(client: ImapFlow, path: string): Promise<Map<string, string>> {
  const acl = new Map<string, string>();
  // ImapFlow no trae GETACL: se usa su ejecutor de comandos, como hacen sus propios comandos.
  const exec = (client as unknown as {
    exec: (
      cmd: string,
      attrs: { type: string; value: string }[],
      opts?: { untagged?: Record<string, (u: { attributes?: UntaggedAttr[] }) => Promise<void>> },
    ) => Promise<{ next: () => void }>;
  }).exec.bind(client);
  const response = await exec("GETACL", [{ type: "STRING", value: path }], {
    untagged: {
      ACL: async (untagged) => {
        const attrs = (untagged.attributes ?? []).slice(1);
        for (let i = 0; i + 1 < attrs.length; i += 2) {
          const id = attrs[i]?.value;
          const rights = attrs[i + 1]?.value;
          if (id && rights !== undefined) acl.set(id, rights);
        }
      },
    },
  });
  response.next();
  return acl;
}

async function command(client: ImapFlow, cmd: "SETACL" | "DELETEACL", args: string[]): Promise<void> {
  const exec = (client as unknown as {
    exec: (c: string, a: { type: string; value: string }[]) => Promise<{ next: () => void }>;
  }).exec.bind(client);
  const response = await exec(
    cmd,
    args.map((value) => ({ type: "STRING", value })),
  );
  response.next();
}

/**
 * Por IMAP los permisos de una persona salen con su dirección tal cual
 * ("aruger@rud1.es"); los especiales ("anyone", "$grupo", "-negativo") y el
 * propio dueño no cuentan.
 */
function isPersonId(id: string, owner: string): boolean {
  return /^[^\s@$-][^\s@]*@[^\s@]+$/.test(id) && id.toLowerCase() !== owner.toLowerCase();
}

/** Mismos permisos aunque vengan en otro orden o con letras antiguas de más (c, d). */
function hasRights(current: string | undefined, wanted: string): boolean {
  return Boolean(current) && [...wanted].every((r) => current!.includes(r));
}

/** Direcciones que ven el buzón común (tienen lectura en su bandeja de entrada). */
export async function getViewers(owner: string): Promise<string[]> {
  return asOwner(owner, async (client) => {
    const acl = await getAcl(client, "INBOX");
    return [...acl.entries()]
      .filter(([id, rights]) => isPersonId(id, owner) && rights.includes("r"))
      .map(([id]) => id.toLowerCase())
      .sort();
  });
}

/**
 * Deja exactamente a `viewers` con acceso a todas las carpetas del buzón
 * común: da el permiso a quien no lo tenía y se lo quita a quien sobra.
 */
export async function setViewers(owner: string, viewers: string[]): Promise<void> {
  const wanted = new Set(viewers.map((v) => v.toLowerCase()).filter((v) => v !== owner));
  await asOwner(owner, async (client) => {
    for (const folder of await ownFolders(client)) {
      const acl = await getAcl(client, folder);
      const current = new Map(
        [...acl.entries()].filter(([id]) => isPersonId(id, owner)).map(([id, rights]) => [id.toLowerCase(), rights]),
      );
      for (const email of wanted) {
        if (!hasRights(current.get(email), SHARED_RIGHTS)) await command(client, "SETACL", [folder, email, SHARED_RIGHTS]);
      }
      for (const email of current.keys()) {
        if (!wanted.has(email)) await command(client, "DELETEACL", [folder, email]);
      }
    }
  });
}
