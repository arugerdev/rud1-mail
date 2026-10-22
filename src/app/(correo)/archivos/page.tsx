import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { can } from "@/lib/access";
import { accessTo, ancestry, getItem, listChildren, listTrash, purgeOldTrash, quota, search, sharedWithMe, type FileItem } from "@/lib/files";
import { fullName, getProfile } from "@/lib/profiles";
import { requireUser } from "@/lib/session";

import { FilesBrowser, type BrowserItem, type FilesView } from "./files-browser";

export const metadata: Metadata = { title: "Archivos" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ carpeta?: string; vista?: string; buscar?: string }>;
}

let lastPurge = 0;

export default async function FilesPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (!can(user.email, "archivos.usar")) redirect("/");
  const params = await searchParams;

  // La papelera se vacía sola (lo de más de 30 días), como mucho una vez por hora.
  if (Date.now() - lastPurge > 3_600_000) {
    lastPurge = Date.now();
    void purgeOldTrash().catch((error) => console.error("[archivos] papelera", error));
  }

  const query = (params.buscar ?? "").trim().slice(0, 100);
  let view: FilesView = params.vista === "compartido" ? "compartido" : params.vista === "papelera" ? "papelera" : "mios";
  let folder: FileItem | null = null;
  let items: (FileItem & { canEdit?: boolean })[];

  if (query) {
    view = "buscar";
    items = search(user.email, query);
  } else if (params.carpeta) {
    folder = getItem(params.carpeta);
    if (!folder || folder.kind !== "folder" || accessTo(user.email, folder.id) === "none") redirect("/archivos");
    items = listChildren(folder.id, user.email);
    if (folder.owner !== user.email) view = "compartido";
  } else if (view === "compartido") {
    items = sharedWithMe(user.email);
  } else if (view === "papelera") {
    items = listTrash(user.email);
  } else {
    items = listChildren(null, user.email);
  }

  const names = new Map<string, string>();
  const nameOf = (email: string) => {
    if (!names.has(email)) {
      const p = getProfile(email, email);
      names.set(email, fullName(p) !== email ? fullName(p) : email.split("@")[0]);
    }
    return names.get(email)!;
  };

  const toBrowser = (i: FileItem & { canEdit?: boolean }): BrowserItem => ({
    id: i.id,
    name: i.name,
    kind: i.kind,
    size: i.size,
    mime: i.mime,
    updatedAt: i.updatedAt,
    trashedAt: i.trashedAt,
    owner: i.owner,
    ownerName: nameOf(i.owner),
    mine: i.owner === user.email,
    canEdit: i.owner === user.email || accessTo(user.email, i.id) === "edit",
  });

  const crumbs = folder
    ? ancestry(folder.id)
        .reverse()
        .filter((a) => accessTo(user.email, a.id) !== "none")
        .map((a) => ({ id: a.id, name: a.name }))
    : [];

  return (
    <FilesBrowser
      key={`${view}:${folder?.id ?? ""}:${query}`}
      view={view}
      folder={folder ? { id: folder.id, name: folder.name, canEdit: accessTo(user.email, folder.id) === "edit", mine: folder.owner === user.email } : null}
      crumbs={crumbs}
      items={items.map(toBrowser)}
      quota={quota(user.email)}
      query={query}
    />
  );
}
