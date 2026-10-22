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
  /** Nivel de anidamiento, para sangrar las subcarpetas. */
  depth: number;
}

const SPECIAL_USE: Record<string, SpecialUse> = {
  "\\Inbox": "inbox",
  "\\Drafts": "drafts",
  "\\Sent": "sent",
  "\\Archive": "archive",
  "\\Junk": "junk",
  "\\Trash": "trash",
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

/** Los buzones compartidos llegan en su propio espacio y van en la fase 3. */
const SHARED_NAMESPACE = /^Shared(\/|$)/;

function specialUseOf(entry: ListResponse): SpecialUse | null {
  if (entry.path.toUpperCase() === "INBOX") return "inbox";
  return entry.specialUse ? SPECIAL_USE[entry.specialUse] ?? null : null;
}

function toFolder(entry: ListResponse): Folder {
  const specialUse = specialUseOf(entry);
  return {
    path: entry.path,
    name: specialUse ? SPECIAL_NAMES[specialUse] : entry.name,
    specialUse,
    unread: entry.status?.unseen ?? 0,
    total: entry.status?.messages ?? 0,
    depth: entry.parent.length,
  };
}

function sortFolders(folders: Folder[]): Folder[] {
  return folders.sort((a, b) => {
    const ia = a.specialUse ? SPECIAL_ORDER.indexOf(a.specialUse) : SPECIAL_ORDER.length;
    const ib = b.specialUse ? SPECIAL_ORDER.indexOf(b.specialUse) : SPECIAL_ORDER.length;
    if (ia !== ib) return ia - ib;
    return a.path.localeCompare(b.path, "es");
  });
}

async function listEntries(client: ImapFlow, withStatus: boolean): Promise<ListResponse[]> {
  const entries = await client.list(
    withStatus ? { statusQuery: { messages: true, unseen: true } } : undefined,
  );
  return entries.filter((e) => !e.flags.has("\\Noselect") && !SHARED_NAMESPACE.test(e.path));
}

/** Una sola consulta por petición aunque la pidan el marco y la página. */
export const listFolders = cache(async (credentials: Credentials): Promise<Folder[]> => {
  return withImap(credentials, async (client) => sortFolders((await listEntries(client, true)).map(toFolder)));
});

/** Rutas de las carpetas especiales (Enviados, Papelera…) de este buzón. */
export async function specialFolders(client: ImapFlow): Promise<Partial<Record<SpecialUse, string>>> {
  const map: Partial<Record<SpecialUse, string>> = { inbox: "INBOX" };
  for (const entry of await listEntries(client, false)) {
    const use = specialUseOf(entry);
    if (use && !map[use]) map[use] = entry.path;
  }
  return map;
}

export async function specialFolderPath(client: ImapFlow, use: SpecialUse): Promise<string | null> {
  return (await specialFolders(client))[use] ?? null;
}

export function displayFolderName(path: string, folders: Folder[]): string {
  return folders.find((f) => f.path === path)?.name ?? path.split("/").pop() ?? path;
}
