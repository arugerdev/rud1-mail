"use server";

import { revalidatePath } from "next/cache";

import { can, isSystemMailbox, listTeams } from "@/lib/access";
import { config } from "@/lib/config";
import {
  accessTo,
  ancestry,
  cleanName,
  createFolder,
  createLink,
  deleteForever,
  disableLink,
  getItem,
  getLink,
  linksOf,
  listFolders,
  listTrash,
  moveItem,
  renameItem,
  restoreItem,
  setShares,
  sharesOf,
  trashItem,
  type FileLink,
  type Share,
} from "@/lib/files";
import { listMailboxes, mailcowAvailable } from "@/lib/mailcow";
import { requireUser } from "@/lib/session";

export interface FilesResult {
  ok: boolean;
  error?: string;
}

class FilesError extends Error {}

async function filesUser() {
  const user = await requireUser();
  if (!can(user.email, "archivos.usar")) throw new FilesError("No tienes acceso a Archivos.");
  return user;
}

function needEdit(email: string, id: string) {
  const item = getItem(id);
  if (!item || accessTo(email, id) !== "edit") throw new FilesError("No tienes permiso para cambiar eso.");
  return item;
}

/** Compartir, enlaces y borrar del todo: solo su dueño. */
function needOwner(email: string, id: string) {
  const item = getItem(id);
  if (!item || item.owner !== email) throw new FilesError("Solo quien lo subió puede hacer eso.");
  return item;
}

async function guarded(work: () => Promise<void> | void, fallback: string): Promise<FilesResult> {
  try {
    await work();
    revalidatePath("/archivos", "layout");
    return { ok: true };
  } catch (error) {
    if (error instanceof FilesError) return { ok: false, error: error.message };
    if (error instanceof Error && error.message.startsWith("No se puede mover")) return { ok: false, error: error.message };
    console.error("[archivos]", error);
    return { ok: false, error: fallback };
  }
}

export async function createFolderAction(parentId: string | null, name: string): Promise<FilesResult> {
  return guarded(async () => {
    const user = await filesUser();
    const clean = cleanName(name);
    if (!clean) throw new FilesError("Ponle un nombre a la carpeta.");
    if (parentId) {
      const parent = needEdit(user.email, parentId);
      if (parent.kind !== "folder") throw new FilesError("Eso no es una carpeta.");
    }
    createFolder(user.email, parentId, clean);
  }, "No se pudo crear la carpeta.");
}

export async function renameAction(id: string, name: string): Promise<FilesResult> {
  return guarded(async () => {
    const user = await filesUser();
    needEdit(user.email, id);
    const clean = cleanName(name);
    if (!clean) throw new FilesError("El nombre no puede quedar vacío.");
    renameItem(id, clean);
  }, "No se pudo cambiar el nombre.");
}

export async function moveAction(ids: string[], parentId: string | null): Promise<FilesResult> {
  return guarded(async () => {
    const user = await filesUser();
    if (parentId) {
      const parent = needEdit(user.email, parentId);
      if (parent.kind !== "folder") throw new FilesError("Eso no es una carpeta.");
    }
    for (const id of ids) {
      const item = needEdit(user.email, id);
      // A la raíz de cada uno solo va lo propio.
      if (parentId === null && item.owner !== user.email) throw new FilesError("Solo puedes llevar a tu carpeta lo que es tuyo.");
      moveItem(id, parentId);
    }
  }, "No se pudo mover.");
}

export async function trashAction(ids: string[]): Promise<FilesResult> {
  return guarded(async () => {
    const user = await filesUser();
    for (const id of ids) {
      needEdit(user.email, id);
      trashItem(id);
    }
  }, "No se pudo llevar a la papelera.");
}

export async function restoreAction(id: string): Promise<FilesResult> {
  return guarded(async () => {
    const user = await filesUser();
    needOwner(user.email, id);
    restoreItem(id);
  }, "No se pudo recuperar.");
}

export async function deleteForeverAction(id: string): Promise<FilesResult> {
  return guarded(async () => {
    const user = await filesUser();
    needOwner(user.email, id);
    await deleteForever(id);
  }, "No se pudo borrar.");
}

export async function emptyTrashAction(): Promise<FilesResult> {
  return guarded(async () => {
    const user = await filesUser();
    for (const item of listTrash(user.email)) await deleteForever(item.id);
  }, "No se pudo vaciar la papelera.");
}

// --- Compartir ---

export interface ShareOption {
  subject: string;
  label: string;
  detail: string;
}

export interface ShareDetails {
  shares: Share[];
  links: FileLink[];
  options: ShareOption[];
  owner: boolean;
  path: string;
}

/** Con quién está compartido y con quién se puede compartir. */
export async function shareDetailsAction(id: string): Promise<ShareDetails | null> {
  const user = await filesUser().catch(() => null);
  if (!user) return null;
  const item = getItem(id);
  if (!item || accessTo(user.email, id) === "none") return null;
  const people = mailcowAvailable() ? await listMailboxes(config.domain).catch(() => []) : [];
  const options: ShareOption[] = [
    ...listTeams().map((t) => ({ subject: `team:${t.id}`, label: `Equipo ${t.name}`, detail: `${t.members.length} personas` })),
    ...people
      .filter((b) => !b.shared && b.active && !isSystemMailbox(b.username) && b.username !== item.owner)
      .map((b) => ({ subject: `user:${b.username}`, label: b.name, detail: b.username })),
  ];
  const owner = item.owner === user.email;
  return {
    shares: sharesOf(id),
    links: owner ? linksOf(id) : [],
    options,
    owner,
    path: ancestry(id)
      .reverse()
      .map((a) => a.name)
      .join(" / "),
  };
}

export async function setSharesAction(id: string, shares: { subject: string; canEdit: boolean }[]): Promise<FilesResult> {
  return guarded(async () => {
    const user = await filesUser();
    needOwner(user.email, id);
    const teams = new Set(listTeams().map((t) => `team:${t.id}`));
    const valid = shares.filter((s) => teams.has(s.subject) || /^user:[^@\s]+@[^@\s]+$/.test(s.subject));
    setShares(id, valid, user.email);
  }, "No se pudo compartir.");
}

export async function createLinkAction(
  id: string,
  opts: { days: number | null; password: string | null },
): Promise<FilesResult & { link?: FileLink }> {
  try {
    const user = await filesUser();
    needOwner(user.email, id);
    const password = opts.password?.trim() || null;
    if (password && password.length < 4) return { ok: false, error: "La contraseña del enlace necesita al menos 4 caracteres." };
    const days = opts.days && opts.days > 0 ? Math.min(365, opts.days) : null;
    const link = createLink(id, user.email, { expiresAt: days ? Date.now() + days * 86_400_000 : null, password });
    revalidatePath("/archivos", "layout");
    return { ok: true, link };
  } catch (error) {
    if (error instanceof FilesError) return { ok: false, error: error.message };
    console.error("[archivos] enlace", error);
    return { ok: false, error: "No se pudo crear el enlace." };
  }
}

export async function disableLinkAction(token: string): Promise<FilesResult> {
  return guarded(async () => {
    const user = await filesUser();
    const link = getLink(token);
    if (!link) throw new FilesError("Ese enlace no existe.");
    needOwner(user.email, link.fileId);
    disableLink(token);
  }, "No se pudo desactivar el enlace.");
}

/** Carpetas a las que se puede mover algo: las propias y las compartidas para editar. */
export async function folderTreeAction(): Promise<{ id: string; path: string }[]> {
  const user = await filesUser().catch(() => null);
  if (!user) return [];
  return listFolders(user.email);
}
