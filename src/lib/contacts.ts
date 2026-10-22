import "server-only";

import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { withImap, withMailbox, type Credentials } from "@/lib/imap";
import { specialFolderPath } from "@/lib/mail/folders";
import { listMailboxes, mailcowAvailable } from "@/lib/mailcow";
import { avatarVersions, listProfiles, fullName } from "@/lib/profiles";

/**
 * Contactos para autocompletar destinatarios: el equipo de rud1 (todos los
 * buzones) y las direcciones con las que cada persona se escribe, ordenadas
 * por uso. Se aprenden al enviar; la primera vez se siembran con los últimos
 * mensajes de Enviados y de la bandeja de entrada.
 */

export interface Contact {
  address: string;
  name: string;
  /** Del equipo de rud1 (sale con su foto y su puesto). */
  team: boolean;
  position?: string;
  avatarVersion?: number;
}

interface DirectoryCache {
  at: number;
  entries: Contact[];
}

const DIRECTORY_TTL = 5 * 60 * 1000;
const cache = globalThis as unknown as { __rud1Directory?: DirectoryCache };

/** Todos los buzones del dominio, con el nombre y el puesto de su perfil. */
export async function teamDirectory(): Promise<Contact[]> {
  if (cache.__rud1Directory && Date.now() - cache.__rud1Directory.at < DIRECTORY_TTL) {
    return cache.__rud1Directory.entries;
  }
  const profiles = new Map(listProfiles().map((p) => [p.email, p]));
  const avatars = avatarVersions();
  let entries: Contact[] = [];
  if (mailcowAvailable()) {
    try {
      const boxes = await listMailboxes(config.domain);
      entries = boxes
        .filter((b) => b.active && b.username !== `noreply@${config.domain}`)
        .map((b) => {
          const p = profiles.get(b.username);
          return {
            address: b.username,
            name: p && fullName(p) !== b.username ? fullName(p) : b.name,
            team: true,
            position: p?.position || undefined,
            avatarVersion: avatars[b.username],
          };
        });
    } catch (error) {
      console.error("[contactos] no se pudo leer el directorio", error);
    }
  }
  cache.__rud1Directory = { at: Date.now(), entries };
  return entries;
}

export function invalidateDirectory(): void {
  cache.__rud1Directory = undefined;
}

/** Suma un uso a cada dirección (al enviar o responder). */
export function learnContacts(owner: string, people: { address: string; name?: string }[]): void {
  const stmt = db().prepare(
    `INSERT INTO contacts (owner, address, name, uses, last_used) VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(owner, address) DO UPDATE SET
       uses = uses + 1,
       last_used = excluded.last_used,
       name = CASE WHEN excluded.name <> '' THEN excluded.name ELSE contacts.name END`,
  );
  const now = Date.now();
  db().transaction(() => {
    for (const p of people) {
      const address = p.address.trim().toLowerCase();
      if (address && address !== owner) stmt.run(owner, address, (p.name ?? "").trim(), now);
    }
  })();
}

function hasContacts(owner: string): boolean {
  return Boolean(db().prepare(`SELECT 1 FROM contacts WHERE owner = ? LIMIT 1`).get(owner));
}

/** Primera vez: aprende de los últimos mensajes enviados y recibidos. */
async function seed(credentials: Credentials): Promise<void> {
  const people: { address: string; name?: string }[] = [];
  const collect = async (path: string | null, field: "to" | "from") => {
    if (!path) return;
    await withMailbox(credentials, path, async (client) => {
      const exists = client.mailbox ? client.mailbox.exists : 0;
      if (exists === 0) return;
      const start = Math.max(1, exists - 199);
      for await (const msg of client.fetch(`${start}:*`, { envelope: true })) {
        const env = msg.envelope;
        const list = field === "to" ? [...(env?.to ?? []), ...(env?.cc ?? [])] : env?.from ?? [];
        for (const a of list) if (a.address) people.push({ address: a.address, name: a.name ?? "" });
      }
    });
  };
  const sent = await withImap(credentials, (client) => specialFolderPath(client, "sent"));
  await collect(sent, "to");
  await collect("INBOX", "from");
  // Lo aprendido de la bandeja de entrada pesa menos que lo enviado: se
  // apunta una sola vez por dirección.
  learnContacts(credentials.email, people.filter((p) => !/no-?reply|mailer-daemon|postmaster/i.test(p.address)));
}

export async function searchContacts(credentials: Credentials, query: string, limit = 8): Promise<Contact[]> {
  if (!hasContacts(credentials.email)) await seed(credentials).catch((e) => console.error("[contactos] semilla", e));
  const q = query.trim().toLowerCase();
  const team = (await teamDirectory()).filter(
    (c) => c.address !== credentials.email && (!q || c.address.includes(q) || c.name.toLowerCase().includes(q)),
  );
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const rows = db()
    .prepare(
      `SELECT address, name FROM contacts WHERE owner = ? AND (address LIKE ? OR lower(name) LIKE ?)
       ORDER BY uses DESC, last_used DESC LIMIT ?`,
    )
    .all(credentials.email, like, like, limit * 2) as { address: string; name: string }[];

  const seen = new Set<string>();
  const out: Contact[] = [];
  // Primero lo más usado; el equipo se mezcla con su foto y su puesto.
  const teamByAddress = new Map(team.map((c) => [c.address, c]));
  for (const r of rows) {
    if (seen.has(r.address)) continue;
    seen.add(r.address);
    out.push(teamByAddress.get(r.address) ?? { address: r.address, name: r.name, team: false });
  }
  for (const c of team) {
    if (!seen.has(c.address)) {
      seen.add(c.address);
      out.push(c);
    }
  }
  return out.slice(0, limit);
}
