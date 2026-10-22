import "server-only";

/**
 * La agenda de rud1 Mail es la del equipo en admin.rud1.es: aquí no se guarda
 * nada, se lee y se escribe allí (www.rud1.es/api/v1/correo/agenda) como la
 * persona de admin con el mismo correo. Así las dos están siempre iguales.
 *
 * AGENDA_API_URL y AGENDA_API_SECRET (el mismo secreto que
 * RUD1_MAIL_AGENDA_SECRET en rud1-es). Sin ellos, la agenda no aparece.
 */

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

/** En desarrollo se puede hacer pasar por una persona de la base de pruebas de admin. */
function agendaEmail(email: string): string {
  return process.env.NODE_ENV !== "production" && process.env.AGENDA_DEV_EMAIL ? process.env.AGENDA_DEV_EMAIL : email;
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
      body: JSON.stringify({ email: agendaEmail(email), op, input }),
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

export async function agendaCall<T>(email: string, op: Exclude<Op, "ics">, input?: unknown): Promise<T> {
  return (await (await request(email, op, input)).json()) as T;
}

export async function agendaIcs(email: string): Promise<string> {
  return (await request(email, "ics")).text();
}
