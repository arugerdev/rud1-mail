import "server-only";

import { redirect } from "next/navigation";

import { requireUser, type SignedInSession } from "@/lib/session";

/**
 * Quién administra el correo de rud1: crear buzones y direcciones, y definir
 * la cabecera y el pie corporativos. Se configura con ADMIN_EMAILS.
 */
const ADMINS = (process.env.ADMIN_EMAILS ?? "aruger@rud1.es,mdialop@rud1.es")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdmin(email: string): boolean {
  return ADMINS.includes(email.toLowerCase());
}

/** Para las páginas y acciones de administración: si no es de administración, fuera. */
export async function requireAdmin(): Promise<SignedInSession> {
  const user = await requireUser();
  if (!isAdmin(user.email)) redirect("/");
  return user;
}
