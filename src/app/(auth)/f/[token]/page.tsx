import type { Metadata } from "next";
import { Download, File as FileIcon, Folder, Link2Off, Lock } from "lucide-react";

import { formatSize } from "@/app/(correo)/nav";
import { ancestry, getItem, listChildren, usableLink } from "@/lib/files";
import { hasLinkAccess } from "@/lib/link-access";
import { fullName, getProfile } from "@/lib/profiles";
import { AuthCard } from "@/shared/components/auth-card";
import { Button } from "@/shared/components/ui/button";

import { LinkPasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Archivo compartido", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ carpeta?: string }>;
}

/** Página pública de un enlace: descargar lo compartido sin cuenta en rud1. */
export default async function SharedLinkPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { carpeta } = await searchParams;
  const found = usableLink(token);
  if (!found) {
    return (
      <AuthCard icon={<Link2Off className="size-6" />} title="Enlace no disponible" subtitle="Ha caducado o quien lo compartió lo ha desactivado." tone="warning" />
    );
  }
  const { link, item } = found;
  const sharer = getProfile(link.createdBy, link.createdBy);
  const sharerName = fullName(sharer) !== link.createdBy ? fullName(sharer) : link.createdBy;

  if (link.hasPassword && !(await hasLinkAccess(token))) {
    return (
      <AuthCard icon={<Lock className="size-6" />} title={item.name} subtitle={`${sharerName} lo ha protegido con una contraseña.`}>
        <LinkPasswordForm token={token} />
      </AuthCard>
    );
  }

  if (item.kind === "file") {
    return (
      <AuthCard icon={<FileIcon className="size-6" />} title={item.name} subtitle={`${formatSize(item.size)} · compartido por ${sharerName}`}>
        <Button asChild className="w-full" size="lg">
          <a href={`/f/${token}/d/${item.id}`}>
            <Download /> Descargar
          </a>
        </Button>
      </AuthCard>
    );
  }

  // Carpeta: se puede entrar en sus subcarpetas, sin salir nunca de ella.
  const current = carpeta ? getItem(carpeta) : item;
  const inside = current && current.kind === "folder" && ancestry(current.id).some((a) => a.id === item.id) ? current : item;
  const children = listChildren(inside.id, item.owner);
  const trail = ancestry(inside.id)
    .reverse()
    .slice(ancestry(item.id).length - 1);

  return (
    <AuthCard icon={<Folder className="size-6" />} title={item.name} subtitle={`Carpeta compartida por ${sharerName}`}>
      <div className="space-y-3">
        {trail.length > 1 && (
          <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            {trail.map((t, i) => (
              <span key={t.id}>
                {i > 0 && " / "}
                <a href={i === 0 ? `/f/${token}` : `/f/${token}?carpeta=${t.id}`} className="hover:underline">
                  {t.name}
                </a>
              </span>
            ))}
          </p>
        )}
        {children.length === 0 && <p className="text-center text-sm text-muted-foreground">La carpeta está vacía.</p>}
        <ul className="max-h-96 divide-y divide-border/40 overflow-y-auto rounded-xl border border-border/50">
          {children.map((c) => (
            <li key={c.id}>
              <a
                href={c.kind === "folder" ? `/f/${token}?carpeta=${c.id}` : `/f/${token}/d/${c.id}`}
                className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-accent/40"
              >
                {c.kind === "folder" ? <Folder className="size-4 shrink-0 text-primary" /> : <FileIcon className="size-4 shrink-0 text-muted-foreground" />}
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                {c.kind === "file" ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                    {formatSize(c.size)} <Download className="size-3.5" />
                  </span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </AuthCard>
  );
}
