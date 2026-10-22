import "server-only";

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";

import { listTeams, storageQuotaBytes, teamsOf } from "@/lib/access";
import { db } from "@/lib/db";
import { deleteObject } from "@/lib/storage";

/**
 * Archivos de rud1 Mail: carpetas y archivos de cada persona, compartidos con
 * personas o equipos (ver / editar) o con un enlace para gente de fuera.
 *
 * Quien tiene acceso a una carpeta lo tiene a todo lo que hay dentro. Lo que
 * se sube a una carpeta ajena cuenta en el espacio de quien lo sube.
 */

export type FileKind = "file" | "folder";

export interface FileItem {
  id: string;
  owner: string;
  parentId: string | null;
  name: string;
  kind: FileKind;
  size: number;
  mime: string;
  createdAt: number;
  updatedAt: number;
  trashedAt: number | null;
}

interface FileRow {
  id: string;
  owner: string;
  parent_id: string | null;
  name: string;
  kind: FileKind;
  size: number;
  mime: string;
  created_at: number;
  updated_at: number;
  trashed_at: number | null;
}

const toItem = (r: FileRow): FileItem => ({
  id: r.id,
  owner: r.owner,
  parentId: r.parent_id,
  name: r.name,
  kind: r.kind,
  size: r.size,
  mime: r.mime,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  trashedAt: r.trashed_at,
});

export function getItem(id: string): FileItem | null {
  const row = db().prepare(`SELECT * FROM files WHERE id = ?`).get(id) as FileRow | undefined;
  return row ? toItem(row) : null;
}

/** El propio y sus carpetas por encima, de dentro hacia fuera. */
export function ancestry(id: string): FileItem[] {
  const out: FileItem[] = [];
  let current = getItem(id);
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    out.push(current);
    current = current.parentId ? getItem(current.parentId) : null;
  }
  return out;
}

// --- Permisos ---

export type Access = "none" | "view" | "edit";

function subjectsOf(email: string): string[] {
  return [`user:${email}`, ...teamsOf(email).map((t) => `team:${t.id}`)];
}

/**
 * Qué puede hacer `email` con el elemento: el dueño (o el de una carpeta que
 * lo contiene) todo; si no, lo que diga lo compartido en él o encima.
 * Lo que está en la papelera solo lo ve su dueño.
 */
export function accessTo(email: string, id: string): Access {
  const chain = ancestry(id);
  if (chain.length === 0) return "none";
  const trashed = chain.some((i) => i.trashedAt !== null);
  if (chain.some((i) => i.owner === email)) return "edit";
  if (trashed) return "none";
  const subjects = subjectsOf(email);
  const placeholders = subjects.map(() => "?").join(",");
  let best: Access = "none";
  for (const item of chain) {
    const rows = db()
      .prepare(`SELECT can_edit FROM file_shares WHERE file_id = ? AND subject IN (${placeholders})`)
      .all(item.id, ...subjects) as { can_edit: number }[];
    for (const r of rows) {
      if (r.can_edit === 1) return "edit";
      best = "view";
    }
  }
  return best;
}

// --- Listados ---

export function listChildren(parentId: string | null, owner: string): FileItem[] {
  const rows = (
    parentId === null
      ? db().prepare(`SELECT * FROM files WHERE parent_id IS NULL AND owner = ? AND trashed_at IS NULL`).all(owner)
      : db().prepare(`SELECT * FROM files WHERE parent_id = ? AND trashed_at IS NULL`).all(parentId)
  ) as FileRow[];
  return rows.map(toItem).sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "es") : a.kind === "folder" ? -1 : 1));
}

/** Lo que otros han compartido con `email` (lo de más arriba de cada cosa). */
export function sharedWithMe(email: string): (FileItem & { canEdit: boolean })[] {
  const subjects = subjectsOf(email);
  const placeholders = subjects.map(() => "?").join(",");
  const rows = db()
    .prepare(
      `SELECT f.*, MAX(s.can_edit) AS can_edit FROM file_shares s JOIN files f ON f.id = s.file_id
       WHERE s.subject IN (${placeholders}) AND f.owner <> ? AND f.trashed_at IS NULL GROUP BY f.id`,
    )
    .all(...subjects, email) as (FileRow & { can_edit: number })[];
  const ids = new Set(rows.map((r) => r.id));
  // Si se comparte una carpeta y algo de dentro, solo se enseña la carpeta.
  return rows
    .filter((r) => !ancestry(r.id).slice(1).some((a) => ids.has(a.id)))
    .map((r) => ({ ...toItem(r), canEdit: r.can_edit === 1 }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Todas las carpetas donde `email` puede guardar, con su ruta. */
export function listFolders(email: string): { id: string; path: string }[] {
  const rows = db().prepare(`SELECT * FROM files WHERE kind = 'folder' AND trashed_at IS NULL`).all() as FileRow[];
  return rows
    .filter((r) => accessTo(email, r.id) === "edit")
    .map((r) => ({
      id: r.id,
      path: ancestry(r.id)
        .reverse()
        .map((a) => a.name)
        .join(" / "),
    }))
    .sort((a, b) => a.path.localeCompare(b.path, "es"));
}

export function listTrash(owner: string): FileItem[] {
  const rows = db().prepare(`SELECT * FROM files WHERE owner = ? AND trashed_at IS NOT NULL ORDER BY trashed_at DESC`).all(owner) as FileRow[];
  const ids = new Set(rows.map((r) => r.id));
  // Solo lo que se tiró (no lo que va dentro de una carpeta tirada).
  return rows.filter((r) => !r.parent_id || !ids.has(r.parent_id)).map(toItem);
}

export function search(email: string, query: string): FileItem[] {
  const like = `%${query.replace(/[%_]/g, "")}%`;
  const rows = db().prepare(`SELECT * FROM files WHERE name LIKE ? AND trashed_at IS NULL ORDER BY updated_at DESC LIMIT 200`).all(like) as FileRow[];
  return rows.map(toItem).filter((i) => accessTo(email, i.id) !== "none").slice(0, 60);
}

// --- Espacio ---

export function usedBytes(owner: string): number {
  return (db().prepare(`SELECT COALESCE(SUM(size), 0) AS n FROM files WHERE owner = ? AND kind = 'file'`).get(owner) as { n: number }).n;
}

export function quota(owner: string): { used: number; total: number } {
  return { used: usedBytes(owner), total: storageQuotaBytes(owner) };
}

// --- Cambios ---

export function cleanName(name: string): string {
  const cleaned = name
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f/\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return cleaned === "." || cleaned === ".." ? "" : cleaned;
}

/** Si ya hay uno con ese nombre en la carpeta: "informe (2).pdf". */
export function uniqueName(parentId: string | null, owner: string, name: string, exceptId?: string): string {
  const taken = new Set(listChildren(parentId, owner).filter((i) => i.id !== exceptId).map((i) => i.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const [base, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ""];
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${base} (${randomUUID().slice(0, 8)})${ext}`;
}

export function createFolder(owner: string, parentId: string | null, name: string): FileItem {
  const id = randomUUID();
  const now = Date.now();
  const finalName = uniqueName(parentId, owner, name);
  db()
    .prepare(`INSERT INTO files (id, owner, parent_id, name, kind, size, mime, created_at, updated_at) VALUES (?, ?, ?, ?, 'folder', 0, '', ?, ?)`)
    .run(id, owner, parentId, finalName, now, now);
  return getItem(id)!;
}

/** Registra un archivo ya guardado en el almacén. */
export function addFile(input: { id: string; owner: string; parentId: string | null; name: string; size: number; mime: string }): FileItem {
  const now = Date.now();
  const name = uniqueName(input.parentId, input.owner, input.name);
  db()
    .prepare(`INSERT INTO files (id, owner, parent_id, name, kind, size, mime, created_at, updated_at) VALUES (?, ?, ?, ?, 'file', ?, ?, ?, ?)`)
    .run(input.id, input.owner, input.parentId, name, input.size, input.mime, now, now);
  if (input.parentId) touch(input.parentId);
  return getItem(input.id)!;
}

function touch(id: string): void {
  db().prepare(`UPDATE files SET updated_at = ? WHERE id = ?`).run(Date.now(), id);
}

export function renameItem(id: string, name: string): void {
  const item = getItem(id);
  if (!item) return;
  const finalName = uniqueName(item.parentId, item.owner, name, id);
  db().prepare(`UPDATE files SET name = ?, updated_at = ? WHERE id = ?`).run(finalName, Date.now(), id);
}

export function moveItem(id: string, parentId: string | null): void {
  const item = getItem(id);
  if (!item) return;
  if (parentId && ancestry(parentId).some((a) => a.id === id)) throw new Error("No se puede mover una carpeta dentro de sí misma.");
  const finalName = uniqueName(parentId, item.owner, item.name, id);
  db().prepare(`UPDATE files SET parent_id = ?, name = ?, updated_at = ? WHERE id = ?`).run(parentId, finalName, Date.now(), id);
}

export function trashItem(id: string): void {
  db().prepare(`UPDATE files SET trashed_at = ? WHERE id = ?`).run(Date.now(), id);
}

export function restoreItem(id: string): void {
  const item = getItem(id);
  if (!item) return;
  // Si su carpeta ya no está (o está en la papelera), vuelve a la raíz.
  const parentOk = item.parentId ? ancestry(item.parentId).every((a) => a.trashedAt === null) : true;
  db().prepare(`UPDATE files SET trashed_at = NULL, parent_id = ?, updated_at = ? WHERE id = ?`).run(parentOk ? item.parentId : null, Date.now(), id);
}

function descendants(id: string): FileItem[] {
  const out: FileItem[] = [];
  const queue = [id];
  while (queue.length) {
    const current = queue.shift()!;
    const rows = db().prepare(`SELECT * FROM files WHERE parent_id = ?`).all(current) as FileRow[];
    for (const r of rows) {
      out.push(toItem(r));
      if (r.kind === "folder") queue.push(r.id);
    }
  }
  return out;
}

/** Borra para siempre (con todo lo de dentro) y libera el espacio. */
export async function deleteForever(id: string): Promise<void> {
  const item = getItem(id);
  if (!item) return;
  const all = [item, ...descendants(id)];
  db().prepare(`DELETE FROM files WHERE id = ?`).run(id);
  await Promise.all(all.filter((i) => i.kind === "file").map((i) => deleteObject(i.id)));
}

/** Lo que lleva más de 30 días en la papelera se borra solo. */
export async function purgeOldTrash(): Promise<void> {
  const limit = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const rows = db().prepare(`SELECT id FROM files WHERE trashed_at IS NOT NULL AND trashed_at < ?`).all(limit) as { id: string }[];
  for (const r of rows) await deleteForever(r.id);
}

// --- Compartir con personas y equipos ---

export interface Share {
  subject: string;
  canEdit: boolean;
  label: string;
}

export function sharesOf(id: string): Share[] {
  const teams = new Map(listTeams().map((t) => [`team:${t.id}`, t.name]));
  const rows = db().prepare(`SELECT subject, can_edit FROM file_shares WHERE file_id = ? ORDER BY created_at`).all(id) as {
    subject: string;
    can_edit: number;
  }[];
  return rows.map((r) => ({
    subject: r.subject,
    canEdit: r.can_edit === 1,
    label: r.subject.startsWith("team:") ? `Equipo ${teams.get(r.subject) ?? "borrado"}` : r.subject.slice(5),
  }));
}

export function setShares(id: string, shares: { subject: string; canEdit: boolean }[], by: string): void {
  const database = db();
  database.transaction(() => {
    database.prepare(`DELETE FROM file_shares WHERE file_id = ?`).run(id);
    const add = database.prepare(`INSERT INTO file_shares (file_id, subject, can_edit, created_by, created_at) VALUES (?, ?, ?, ?, ?)`);
    for (const s of shares) add.run(id, s.subject, s.canEdit ? 1 : 0, by, Date.now());
  })();
}

// --- Enlaces para gente de fuera ---

export interface FileLink {
  token: string;
  fileId: string;
  createdBy: string;
  createdAt: number;
  expiresAt: number | null;
  hasPassword: boolean;
  downloads: number;
  disabled: boolean;
}

interface LinkRow {
  token: string;
  file_id: string;
  created_by: string;
  created_at: number;
  expires_at: number | null;
  password_hash: string | null;
  downloads: number;
  disabled: number;
}

const toLink = (r: LinkRow): FileLink => ({
  token: r.token,
  fileId: r.file_id,
  createdBy: r.created_by,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  hasPassword: Boolean(r.password_hash),
  downloads: r.downloads,
  disabled: r.disabled === 1,
});

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString("hex")}:${scryptSync(password, salt, 32).toString("hex")}`;
}

export function checkLinkPassword(token: string, password: string): boolean {
  const row = db().prepare(`SELECT password_hash FROM file_links WHERE token = ?`).get(token) as { password_hash: string | null } | undefined;
  if (!row?.password_hash) return true;
  const [salt, hash] = row.password_hash.split(":");
  const given = scryptSync(password, Buffer.from(salt, "hex"), 32);
  return timingSafeEqual(given, Buffer.from(hash, "hex"));
}

export function createLink(fileId: string, by: string, opts: { expiresAt: number | null; password: string | null }): FileLink {
  const token = randomBytes(24).toString("base64url");
  db()
    .prepare(`INSERT INTO file_links (token, file_id, created_by, created_at, expires_at, password_hash) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(token, fileId, by, Date.now(), opts.expiresAt, opts.password ? hashPassword(opts.password) : null);
  return linksOf(fileId).find((l) => l.token === token)!;
}

export function linksOf(fileId: string): FileLink[] {
  return (db().prepare(`SELECT * FROM file_links WHERE file_id = ? ORDER BY created_at DESC`).all(fileId) as LinkRow[]).map(toLink);
}

export function getLink(token: string): FileLink | null {
  const row = db().prepare(`SELECT * FROM file_links WHERE token = ?`).get(token) as LinkRow | undefined;
  return row ? toLink(row) : null;
}

/** El enlace sirve: existe, no está desactivado ni caducado y el archivo no está en la papelera. */
export function usableLink(token: string): { link: FileLink; item: FileItem } | null {
  const link = getLink(token);
  if (!link || link.disabled || (link.expiresAt !== null && link.expiresAt < Date.now())) return null;
  const chain = ancestry(link.fileId);
  if (chain.length === 0 || chain.some((i) => i.trashedAt !== null)) return null;
  return { link, item: chain[0] };
}

export function countDownload(token: string): void {
  db().prepare(`UPDATE file_links SET downloads = downloads + 1 WHERE token = ?`).run(token);
}

export function disableLink(token: string): void {
  db().prepare(`UPDATE file_links SET disabled = 1 WHERE token = ?`).run(token);
}

/** ¿`id` está dentro de la carpeta del enlace (o es él)? */
export function insideLink(link: FileLink, id: string): boolean {
  return ancestry(id).some((a) => a.id === link.fileId);
}
