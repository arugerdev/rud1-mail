import "server-only";

import { cache } from "react";
import type { ImapFlow, ListResponse } from "imapflow";

import { withImap, type Credentials } from "@/lib/imap";

export type SpecialUse = "inbox" | "drafts" | "sent" | "archive" | "junk" | "trash";

export interface Folder {
  path: string;
  name: string;
  specialUse: SpecialUse | null;
  unread: number;
  total: number;
  /** Nivel de anidamiento, para sangrar las subcarpetas (dentro de su buzón). */
  depth: number;
  /** Buzón común al que pertenece (contact@rud1.es…), o null si es del propio buzón. */
  owner: string | null;
}

const SPECIAL_USE: Record<string, SpecialUse> = {
  "\\Inbox": "inbox",
  "\\Drafts": "drafts",
  "\\Sent": "sent",
  "\\Archive": "archive",
  "\\Junk": "junk",
  "\\Trash": "trash",
};

/** En los buzones comunes, las carpetas especiales se reconocen por el nombre (Mailcow las crea en inglés). */
const SPECIAL_BY_NAME: Record<string, SpecialUse> = {
  INBOX: "inbox",
  DRAFTS: "drafts",
  SENT: "sent",
  ARCHIVE: "archive",
  JUNK: "junk",
  TRASH: "trash",
};

const SPECIAL_NAMES: Record<SpecialUse, string> = {
  inbox: "Bandeja de entrada",
  drafts: "Borradores",
  sent: "Enviados",
  archive: "Archivo",
  junk: "Spam",
  trash: "Papelera",
};

const SPECIAL_ORDER: SpecialUse[] = ["inbox", "drafts", "sent", "archive", "junk", "trash"];

/** Espacio donde Dovecot enseña los buzones de otros: "Shared/<buzón>/<carpeta>". */
const SHARED_NAMESPACE = /^Shared(\/|$)/;
const SHARED_PATH = /^Shared\/([^/]+)\/(.+)$/;

/** Buzón común y carpeta dentro de él, si la ruta es de un buzón común. */
export function sharedPart(path: string): { owner: string; inner: string } | null {
  const m = path.match(SHARED_PATH);
  return m ? { owner: m[1].toLowerCase(), inner: m[2] } : null;
}

function specialUseOf(entry: ListResponse): SpecialUse | null {
  const shared = sharedPart(entry.path);
  if (shared) return SPECIAL_BY_NAME[shared.inner.toUpperCase()] ?? null;
  if (entry.path.toUpperCase() === "INBOX") return "inbox";
  return entry.specialUse ? SPECIAL_USE[entry.specialUse] ?? null : null;
}

function toFolder(entry: ListResponse): Folder {
  const specialUse = specialUseOf(entry);
  const shared = sharedPart(entry.path);
  return {
    path: entry.path,
    name: specialUse ? SPECIAL_NAMES[specialUse] : entry.name,
    specialUse,
    unread: entry.status?.unseen ?? 0,
    total: entry.status?.messages ?? 0,
    depth: shared ? shared.inner.split("/").length - 1 : entry.parent.length,
    owner: shared?.owner ?? null,
  };
}

function sortFolders(folders: Folder[]): Folder[] {
  return folders.sort((a, b) => {
    // Primero las propias; luego cada buzón común, en orden alfabético.
    if ((a.owner ?? "") !== (b.owner ?? "")) return (a.owner ?? "").localeCompare(b.owner ?? "");
    const ia = a.specialUse ? SPECIAL_ORDER.indexOf(a.specialUse) : SPECIAL_ORDER.length;
    const ib = b.specialUse ? SPECIAL_ORDER.indexOf(b.specialUse) : SPECIAL_ORDER.length;
    if (ia !== ib) return ia - ib;
    return a.path.localeCompare(b.path, "es");
  });
}

async function listEntries(client: ImapFlow, withStatus: boolean, includeShared: boolean): Promise<ListResponse[]> {
  const entries = await client.list(withStatus ? { statusQuery: { messages: true, unseen: true } } : undefined);
  return entries.filter(
    (e) => !e.flags.has("\\Noselect") && (includeShared ? !/^Shared\/?[^/]*$/.test(e.path) : !SHARED_NAMESPACE.test(e.path)),
  );
}

/**
 * Carpetas propias y de los buzones comunes que se pueden ver. Una sola
 * consulta por petición aunque la pidan el marco y la página.
 */
export const listFolders = cache(async (credentials: Credentials): Promise<Folder[]> => {
  return withImap(credentials, async (client) => sortFolders((await listEntries(client, true, true)).map(toFolder)));
});

/** Rutas de las carpetas especiales (Enviados, Papelera…) del propio buzón. */
export async function specialFolders(client: ImapFlow): Promise<Partial<Record<SpecialUse, string>>> {
  const map: Partial<Record<SpecialUse, string>> = { inbox: "INBOX" };
  for (const entry of await listEntries(client, false, false)) {
    const use = specialUseOf(entry);
    if (use && !map[use]) map[use] = entry.path;
  }
  return map;
}

export async function specialFolderPath(client: ImapFlow, use: SpecialUse): Promise<string | null> {
  return (await specialFolders(client))[use] ?? null;
}

/**
 * La carpeta especial que corresponde a `path`: si `path` es de un buzón
 * común, la de ese buzón (archivar un mensaje de soporte@ lo archiva en
 * soporte@); si no, la propia.
 */
export async function specialFolderFor(client: ImapFlow, path: string, use: SpecialUse): Promise<string | null> {
  const shared = sharedPart(path);
  if (!shared) return specialFolderPath(client, use);
  const entries = await listEntries(client, false, true);
  const match = entries.find((e) => {
    const s = sharedPart(e.path);
    return s && s.owner === shared.owner && specialUseOf(e) === use;
  });
  return match?.path ?? null;
}

export function specialUseOfPath(path: string, folders: Folder[]): SpecialUse | null {
  return folders.find((f) => f.path === path)?.specialUse ?? null;
}

export function displayFolderName(path: string, folders: Folder[]): string {
  return folders.find((f) => f.path === path)?.name ?? path.split("/").pop() ?? path;
}
