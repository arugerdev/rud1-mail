import "server-only";

import type { Recurrence } from "@/lib/agenda";

/**
 * Lectura de calendarios .ics (Google Calendar, Outlook, iPhone…) para
 * importarlos en la agenda. Solo lo que la agenda sabe guardar: título,
 * cuándo, dónde, enlace, descripción y repetición sencilla.
 */

export interface IcsEvent {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  url: string | null;
  allDay: boolean;
  /** Instantes en ISO (UTC). En los de todo el día, medianoche de Madrid. */
  startsAt: string;
  endsAt: string;
  timezone: string;
  recurrence: Recurrence;
  recurInterval: number;
  /** Último día (YYYY-MM-DD) o null. */
  recurUntil: string | null;
  canceled: boolean;
}

const DEFAULT_TZ = "Europe/Madrid";

/** Las líneas largas vienen partidas (RFC 5545 §3.1): se vuelven a unir. */
function unfold(text: string): string[] {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function unescape(value: string): string {
  return value.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseLine(line: string): Prop | null {
  // Nombre;PARAM=valor;PARAM="valor:con:dos puntos":VALOR
  let inQuotes = false;
  let colon = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') inQuotes = !inQuotes;
    else if (line[i] === ":" && !inQuotes) {
      colon = i;
      break;
    }
  }
  if (colon < 0) return null;
  const [name, ...rawParams] = line.slice(0, colon).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name.toUpperCase(), params, value: line.slice(colon + 1) };
}

/** Desfase de una zona horaria en un instante (minutos). */
function offsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUtc - date.getTime()) / 60_000;
}

/** Hora local de una zona → instante UTC. */
function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, h, mi, s));
  const first = new Date(guess.getTime() - offsetMinutes(timeZone, guess) * 60_000);
  // Una segunda pasada corrige el cambio de hora.
  return new Date(guess.getTime() - offsetMinutes(timeZone, first) * 60_000);
}

function validZone(tz: string | undefined): string | null {
  if (!tz) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return null;
  }
}

interface ParsedDate {
  date: Date;
  allDay: boolean;
  tz: string;
}

function parseDate(prop: Prop): ParsedDate | null {
  const v = prop.value.trim();
  const dateOnly = v.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly || prop.params.VALUE === "DATE") {
    const m = dateOnly ?? v.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    return { date: zonedToUtc(+m[1], +m[2], +m[3], 0, 0, 0, DEFAULT_TZ), allDay: true, tz: DEFAULT_TZ };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = "0", z] = m;
  if (z) return { date: new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)), allDay: false, tz: validZone(prop.params.TZID) ?? DEFAULT_TZ };
  // Zonas de Outlook ("W. Europe Standard Time") no las entiende Intl: se toma Madrid.
  const tz = validZone(prop.params.TZID) ?? DEFAULT_TZ;
  return { date: zonedToUtc(+y, +mo, +d, +h, +mi, +s, tz), allDay: false, tz };
}

function dayKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function parseRrule(value: string): { recurrence: Recurrence; interval: number; until: string | null } {
  const parts = Object.fromEntries(value.split(";").map((p) => p.split("=") as [string, string]));
  const freq = (parts.FREQ ?? "").toUpperCase();
  const recurrence: Recurrence =
    freq === "DAILY" ? "DAILY" : freq === "WEEKLY" ? "WEEKLY" : freq === "MONTHLY" ? "MONTHLY" : freq === "YEARLY" ? "YEARLY" : "NONE";
  const interval = Math.min(99, Math.max(1, Number(parts.INTERVAL ?? 1) || 1));
  const u = parts.UNTIL?.match(/^(\d{4})(\d{2})(\d{2})/);
  return { recurrence, interval, until: u ? `${u[1]}-${u[2]}-${u[3]}` : null };
}

export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Prop[] | null = null;
  let depth = 0;
  for (const line of unfold(text)) {
    if (/^BEGIN:VEVENT$/i.test(line)) {
      current = [];
      depth = 0;
      continue;
    }
    if (!current) continue;
    // Alarmas y demás bloques dentro del evento: se saltan.
    if (/^BEGIN:/i.test(line)) {
      depth++;
      continue;
    }
    if (/^END:/i.test(line) && depth > 0) {
      depth--;
      continue;
    }
    if (/^END:VEVENT$/i.test(line)) {
      const event = toEvent(current);
      if (event) events.push(event);
      current = null;
      continue;
    }
    if (depth === 0) {
      const prop = parseLine(line);
      if (prop) current.push(prop);
    }
  }
  return events;
}

function toEvent(props: Prop[]): IcsEvent | null {
  const get = (name: string) => props.find((p) => p.name === name);
  // Una ocurrencia cambiada de una serie (RECURRENCE-ID) no se importa aparte.
  if (get("RECURRENCE-ID")) return null;
  const startProp = get("DTSTART");
  if (!startProp) return null;
  const start = parseDate(startProp);
  if (!start) return null;
  const endProp = get("DTEND");
  let end = endProp ? parseDate(endProp) : null;
  if (!end) {
    const duration = get("DURATION")?.value.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
    const ms = duration
      ? ((+(duration[1] ?? 0) * 7 + +(duration[2] ?? 0)) * 1440 + +(duration[3] ?? 0) * 60 + +(duration[4] ?? 0)) * 60_000
      : start.allDay
        ? 86_400_000
        : 3_600_000;
    end = { ...start, date: new Date(start.date.getTime() + ms) };
  }
  // En .ics el final de un día completo es el día siguiente; en la agenda, el último día.
  const endsAt = start.allDay ? new Date(Math.max(start.date.getTime(), end.date.getTime() - 86_400_000)) : end.date;
  const rrule = get("RRULE") ? parseRrule(get("RRULE")!.value) : { recurrence: "NONE" as Recurrence, interval: 1, until: null };
  const title = unescape(get("SUMMARY")?.value ?? "") || "(sin título)";
  const url = get("URL")?.value.trim() || null;
  return {
    uid: get("UID")?.value.trim() || `${title}-${start.date.toISOString()}`,
    title: title.slice(0, 200),
    description: get("DESCRIPTION") ? unescape(get("DESCRIPTION")!.value).slice(0, 8000) || null : null,
    location: get("LOCATION") ? unescape(get("LOCATION")!.value).slice(0, 300) || null : null,
    url: url && /^https?:\/\//i.test(url) ? url : null,
    allDay: start.allDay,
    startsAt: start.date.toISOString(),
    endsAt: endsAt.toISOString(),
    timezone: start.tz,
    recurrence: rrule.recurrence,
    recurInterval: rrule.interval,
    recurUntil: rrule.until,
    canceled: /^CANCELLED$/i.test(get("STATUS")?.value ?? ""),
  };
}

export { dayKey };
