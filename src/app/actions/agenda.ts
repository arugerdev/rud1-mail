"use server";

import {
  agendaCall,
  agendaConfigured,
  AgendaApiError,
  type AgendaEventDetail,
  type AgendaOccurrence,
} from "@/lib/agenda";
import { dayKey, parseIcs } from "@/lib/ics";
import { requireUser } from "@/lib/session";

/**
 * Acciones de la agenda: cada una es una llamada a la agenda de admin.rud1.es
 * como la persona que ha entrado en rud1 Mail (allí se comprueban sus permisos).
 */

export type AgendaResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

async function run<T>(work: (email: string) => Promise<T>): Promise<AgendaResult<T>> {
  const user = await requireUser();
  if (!agendaConfigured()) return { ok: false, error: "La agenda no está conectada.", code: "not_configured" };
  try {
    return { ok: true, data: await work(user.email) };
  } catch (error) {
    if (error instanceof AgendaApiError) return { ok: false, error: error.message, code: error.code };
    console.error("[agenda]", error);
    return { ok: false, error: "No se ha podido completar." };
  }
}

export interface RangeInput {
  from: string;
  to: string;
  timeZone: string;
  personIds?: string[];
}

export async function loadRangeAction(input: RangeInput) {
  return run((email) => agendaCall<{ items: AgendaOccurrence[]; truncated: boolean }>(email, "range", input));
}

export async function getEventAction(eventId: string, occurrenceDay: string | null) {
  return run((email) => agendaCall<AgendaEventDetail>(email, "event", { eventId, occurrenceDay }));
}

/** Lo mismo que acepta la agenda de admin (saveEventSchema). */
export interface SaveEventInput {
  id?: string;
  expectedSequence?: number;
  scope?: "series" | "occurrence";
  occurrenceDay?: string | null;
  type: string;
  status?: string;
  title: string;
  description?: string | null;
  location?: string | null;
  meetingUrl?: string | null;
  allDay: boolean;
  startsAt: string;
  endsAt: string;
  timezone: string;
  recurrence?: string;
  recurInterval?: number;
  recurUntil?: string | null;
  attendeeIds?: string[];
  reminders?: { minutesBefore: number; channel: "IN_APP" | "EMAIL" }[];
}

export async function saveEventAction(input: SaveEventInput) {
  return run((email) => agendaCall<{ id: string }>(email, "save", input));
}

export async function moveEventAction(input: { eventId: string; occurrenceDay: string | null; scope: "series" | "occurrence"; startsAt: string; endsAt: string }) {
  return run((email) => agendaCall<{ id: string }>(email, "move", input));
}

export async function eventCommandAction(
  op: "delete" | "cancel" | "complete" | "reopen",
  input: { eventId: string; occurrenceDay: string | null; scope?: "series" | "occurrence"; outcome?: string | null },
) {
  return run((email) => agendaCall<{ id: string }>(email, op, op === "reopen" ? { eventId: input.eventId, occurrenceDay: input.occurrenceDay } : input));
}

/** Lo de hoy (para los recordatorios con sonido de rud1 Mail). */
export async function todayAction(timeZone: string) {
  return run((email) => agendaCall<{ today: AgendaOccurrence[]; overdue: AgendaOccurrence[] }>(email, "today", { timeZone }));
}

/**
 * Importar un .ics: cada evento se crea en la agenda, salvo los que ya están
 * (mismo título y misma hora de inicio), así importar dos veces no duplica.
 */
export async function importIcsAction(formData: FormData): Promise<AgendaResult<{ created: number; skipped: number; failed: number }>> {
  const file = formData.get("calendario");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elige un archivo .ics." };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: "El calendario pasa de 5 MB." };
  const events = parseIcs(await file.text()).filter((e) => !e.canceled);
  if (events.length === 0) return { ok: false, error: "Ese archivo no tiene eventos que importar." };
  if (events.length > 500) return { ok: false, error: "Son más de 500 eventos: importa un calendario más pequeño." };

  return run(async (email) => {
    let created = 0;
    let skipped = 0;
    let failed = 0;
    // Lo que ya hay en las fechas del archivo, para no duplicar.
    const days = events.map((e) => dayKey(new Date(e.startsAt), e.timezone)).sort();
    const existing = new Set<string>();
    for (let from = days[0]; from <= days[days.length - 1]; ) {
      const to = new Date(Date.parse(`${from}T00:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10);
      const range = await agendaCall<{ items: AgendaOccurrence[] }>(email, "range", { from, to, timeZone: "Europe/Madrid" });
      for (const o of range.items) existing.add(`${o.title.trim().toLowerCase()}|${Date.parse(o.start)}`);
      from = new Date(Date.parse(`${to}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    }
    for (const e of events) {
      if (existing.has(`${e.title.trim().toLowerCase()}|${Date.parse(e.startsAt)}`)) {
        skipped++;
        continue;
      }
      try {
        await agendaCall(email, "save", {
          type: "OTHER",
          status: "CONFIRMED",
          title: e.title,
          description: e.description,
          location: e.location,
          meetingUrl: e.url,
          allDay: e.allDay,
          startsAt: e.startsAt,
          endsAt: e.endsAt,
          timezone: e.timezone,
          recurrence: e.recurrence,
          recurInterval: e.recurInterval,
          recurUntil: e.recurUntil,
        });
        created++;
      } catch (error) {
        console.error("[agenda] importar", e.title, error instanceof Error ? error.message : error);
        failed++;
      }
    }
    return { created, skipped, failed };
  });
}
