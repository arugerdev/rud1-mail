import "server-only";

/**
 * La agenda de rud1 Mail es la del equipo en admin.rud1.es: aquí no se guarda
 * nada, se lee y se escribe allí (www.rud1.es/api/v1/correo/agenda) como la
 * persona de admin con el mismo correo. Así las dos están siempre iguales.
 *
 * AGENDA_API_URL y AGENDA_API_SECRET (el mismo secreto que
 * RUD1_MAIL_AGENDA_SECRET en rud1-es). Sin ellos, la agenda no aparece.
 */

import { db } from "@/lib/db";
import type { AgendaEventDetail, AgendaMe, AgendaOccurrence, AgendaPersonOption } from "@/lib/agenda-types";

export * from "@/lib/agenda-types";
export type { AgendaEventDetail, AgendaMe, AgendaOccurrence, AgendaPersonOption };

export class AgendaApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AgendaApiError";
  }
}

export function agendaConfigured(): boolean {
  return Boolean(process.env.AGENDA_API_URL && process.env.AGENDA_API_SECRET);
}

type Op = "me" | "people" | "range" | "today" | "event" | "save" | "move" | "delete" | "cancel" | "complete" | "reopen" | "ics";

// --- Qué cuenta de admin.rud1.es es cada buzón ---

/**
 * La cuenta de admin de un buzón: la enlazada en Usuarios (p. ej.
 * aruger@rud1.es → aruger.dev@gmail.com) o, si no hay, la misma dirección.
 */
export function adminEmailFor(email: string): string {
  const row = db().prepare(`SELECT admin_email FROM agenda_links WHERE email = ?`).get(email.toLowerCase()) as
    | { admin_email: string }
    | undefined;
  if (row) return row.admin_email;
  // En desarrollo, sin enlace, se puede hacer pasar por una persona de la base de pruebas de admin.
  if (process.env.NODE_ENV !== "production" && process.env.AGENDA_DEV_EMAIL) return process.env.AGENDA_DEV_EMAIL;
  return email;
}

export function agendaLinks(): Map<string, string> {
  const rows = db().prepare(`SELECT email, admin_email FROM agenda_links`).all() as { email: string; admin_email: string }[];
  return new Map(rows.map((r) => [r.email, r.admin_email]));
}

export function setAgendaLink(email: string, adminEmail: string | null, by: string): void {
  if (!adminEmail) {
    db().prepare(`DELETE FROM agenda_links WHERE email = ?`).run(email.toLowerCase());
    return;
  }
  db()
    .prepare(
      `INSERT INTO agenda_links (email, admin_email, set_by, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET admin_email = excluded.admin_email, set_by = excluded.set_by, updated_at = excluded.updated_at`,
    )
    .run(email.toLowerCase(), adminEmail.toLowerCase(), by, Date.now());
}

async function request(email: string, op: Op, input?: unknown): Promise<Response> {
  const url = process.env.AGENDA_API_URL;
  const secret = process.env.AGENDA_API_SECRET;
  if (!url || !secret) throw new AgendaApiError("La agenda no está conectada.", "not_configured", 503);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, op, input }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new AgendaApiError("admin.rud1.es no responde. Inténtalo en un momento.", "unreachable", 503);
  }
  // 404 sin código propio: admin.rud1.es aún no tiene esta conexión (o no tiene el secreto puesto).
  if (res.status === 404) {
    const body = (await res.clone().json().catch(() => ({}))) as { code?: string };
    if (body.code !== "no_admin" && body.code !== "not_found") {
      throw new AgendaApiError("La conexión con la agenda de admin.rud1.es aún no está activa.", "not_enabled", 404);
    }
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    throw new AgendaApiError(body.error ?? "No se ha podido completar.", body.code ?? "error", res.status);
  }
  return res;
}

/** `email`: el buzón de rud1 Mail; se habla con admin como su cuenta enlazada. */
export async function agendaCall<T>(email: string, op: Exclude<Op, "ics">, input?: unknown): Promise<T> {
  return (await (await request(adminEmailFor(email), op, input)).json()) as T;
}

export async function agendaIcs(email: string): Promise<string> {
  return (await request(adminEmailFor(email), "ics")).text();
}

/** Comprueba una cuenta de admin (para enlazarla): de quién es, o error si no existe. */
export async function checkAdminAccount(adminEmail: string): Promise<AgendaMe> {
  return (await (await request(adminEmail.toLowerCase(), "me")).json()) as AgendaMe;
}
