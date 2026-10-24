import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { headers } from "next/headers";

import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { sharedAccessAvailable } from "@/lib/shared-access";

/**
 * Entrar en el buzón de otra persona (solo los propietarios).
 *
 * Desde Administración → Usuarios se pide un enlace de un solo uso que caduca
 * en un minuto y se abre en una pestaña nueva en otra dirección
 * (config.accessOrigin). Allí la sesión va en su propia cookie, que el
 * navegador borra al cerrarse y que caduca sola en dos horas; la de
 * mail.rud1.es no se toca. El servidor entra en el buzón con el usuario
 * maestro de Dovecot, así que no hace falta (ni se ve) la contraseña de nadie.
 * Cada entrada queda apuntada: quién, en qué buzón, cuándo y desde qué IP.
 */

/** Lo que dura el enlace antes de abrirlo. */
const LINK_TTL_MS = 60_000;
/** Lo que dura la sesión dentro del buzón ajeno, aunque la pestaña siga abierta. */
export const ENTRY_TTL_MS = 2 * 60 * 60 * 1000;

export function mailboxEntryAvailable(): boolean {
  return Boolean(config.accessOrigin) && sharedAccessAvailable();
}

function accessHost(): string | null {
  if (!config.accessOrigin) return null;
  try {
    return new URL(config.accessOrigin).host.toLowerCase();
  } catch {
    return null;
  }
}

/** ¿La petición llega por la dirección de acceso (y no por mail.rud1.es)? */
export async function onAccessHost(): Promise<boolean> {
  const host = accessHost();
  if (!host) return false;
  const h = await headers();
  const requested = (h.get("x-forwarded-host") ?? h.get("host") ?? "").split(",")[0].trim().toLowerCase();
  return requested === host;
}

function hash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Enlace de un solo uso para que `by` entre en el buzón `email`. */
export function createEntryLink(email: string, by: string): string {
  if (!config.accessOrigin) throw new Error("ACCESS_ORIGIN no está configurado");
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  db()
    .prepare(`INSERT INTO mailbox_entries (token_hash, email, by_email, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`)
    .run(hash(token), email.toLowerCase(), by.toLowerCase(), now, now + LINK_TTL_MS);
  return `${config.accessOrigin}/acceder/${token}`;
}

/** Gasta el enlace: vale una sola vez y antes de caducar. */
export function consumeEntryLink(token: string, ip: string | undefined): { email: string; by: string } | null {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return null;
  const now = Date.now();
  const row = db()
    .prepare(
      `UPDATE mailbox_entries SET used_at = ?, ip = ?
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
       RETURNING email, by_email`,
    )
    .get(now, ip ?? null, hash(token), now) as { email: string; by_email: string } | undefined;
  return row ? { email: row.email, by: row.by_email } : null;
}
