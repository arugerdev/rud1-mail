import "server-only";

import { redirect } from "next/navigation";

import { can, isOwner } from "@/lib/access";
import type { PermissionKey } from "@/lib/permissions";
import { requireUser, type SignedInSession } from "@/lib/session";

/**
 * Quién administra el correo de rud1. Los propietarios (ADMIN_EMAILS: Álvaro
 * y Manuel) lo pueden todo y son los únicos que reparten roles, permisos y
 * buzones comunes; el resto, lo que le den sus permisos (lib/permissions.ts).
 */

export { isOwner };

/** Lo que cada quien ve de Administración. */
export interface AdminAccess {
  owner: boolean;
  mailboxes: boolean;
  templates: boolean;
}

export function adminAccess(email: string): AdminAccess {
  return {
    owner: isOwner(email),
    mailboxes: can(email, "admin.buzones"),
    templates: can(email, "admin.plantillas"),
  };
}

/** ¿Ve el apartado de Administración? */
export function isAdmin(email: string): boolean {
  const a = adminAccess(email);
  return a.owner || a.mailboxes || a.templates;
}

/** Para páginas: sin el permiso, fuera. */
export async function requirePermission(permission: PermissionKey): Promise<SignedInSession> {
  const user = await requireUser();
  if (!can(user.email, permission)) redirect("/");
  return user;
}

/** Para páginas que solo ven los propietarios (roles, permisos, buzones comunes). */
export async function requireOwner(): Promise<SignedInSession> {
  const user = await requireUser();
  if (!isOwner(user.email)) redirect("/");
  return user;
}
