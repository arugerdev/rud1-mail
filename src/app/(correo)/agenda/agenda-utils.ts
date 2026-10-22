import {
  Bell,
  CheckSquare,
  Circle,
  Flag,
  MapPin,
  Phone,
  Plane,
  Presentation,
  RefreshCcw,
  UsersRound,
  type LucideIcon,
} from "lucide-react";

import type { EventType } from "@/lib/agenda-types";

/** Tipos de cita, con el mismo color que en admin.rud1.es para que se reconozcan. */
export const TYPE_STYLE: Record<EventType, { label: string; color: string; icon: LucideIcon }> = {
  MEETING: { label: "Reunión", color: "#8b5cf6", icon: UsersRound },
  CALL: { label: "Llamada", color: "#0ea5e9", icon: Phone },
  VISIT: { label: "Visita", color: "#10b981", icon: MapPin },
  DEMO: { label: "Demo", color: "#d946ef", icon: Presentation },
  TASK: { label: "Tarea", color: "#f59e0b", icon: CheckSquare },
  FOLLOW_UP: { label: "Seguimiento", color: "#14b8a6", icon: RefreshCcw },
  REMINDER: { label: "Recordatorio", color: "#6366f1", icon: Bell },
  DEADLINE: { label: "Fecha límite", color: "#f43f5e", icon: Flag },
  TRAVEL: { label: "Viaje", color: "#06b6d4", icon: Plane },
  OTHER: { label: "Otro", color: "#64748b", icon: Circle },
};

/** Duración al crear, según el tipo (igual que en admin). */
export const DEFAULT_MINUTES: Record<EventType, number> = {
  CALL: 30,
  MEETING: 60,
  VISIT: 90,
  DEMO: 60,
  TASK: 30,
  FOLLOW_UP: 30,
  REMINDER: 15,
  DEADLINE: 30,
  TRAVEL: 120,
  OTHER: 60,
};

export const RECURRENCE_LABELS = {
  NONE: "No se repite",
  DAILY: "Cada día",
  WEEKLY: "Cada semana",
  MONTHLY: "Cada mes",
  YEARLY: "Cada año",
} as const;

export const REMINDER_PRESETS = [0, 10, 30, 60, 1440] as const;

export function reminderLabel(minutes: number): string {
  if (minutes <= 0) return "Al empezar";
  if (minutes % 1440 === 0) return minutes === 1440 ? "1 día antes" : `${minutes / 1440} días antes`;
  if (minutes % 60 === 0) return `${minutes / 60} h antes`;
  return `${minutes} min antes`;
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid";
  } catch {
    return "Europe/Madrid";
  }
}

// --- Días como "YYYY-MM-DD" (sin líos de zona: aritmética en UTC) ---

export function keyToDate(key: string): Date {
  return new Date(`${key}T00:00:00Z`);
}

export function dateToKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(key: string, n: number): string {
  return dateToKey(new Date(keyToDate(key).getTime() + n * 86_400_000));
}

export function addMonths(key: string, n: number): string {
  const d = keyToDate(key);
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d.getUTCDate(), last));
  return dateToKey(target);
}

/** Lunes de la semana del día. */
export function weekStart(key: string): string {
  const dow = (keyToDate(key).getUTCDay() + 6) % 7;
  return addDays(key, -dow);
}

export function monthStart(key: string): string {
  return `${key.slice(0, 7)}-01`;
}

/** Hoy en la zona dada. */
export function todayKey(tz: string): string {
  return instantDayKey(new Date(), tz);
}

export function instantDayKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Minutos desde la medianoche (en la zona) de un instante. */
export function minutesOfDay(iso: string, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

export function timeLabel(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("es-ES", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function hhmm(iso: string, tz: string): string {
  const m = minutesOfDay(iso, tz);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-ES", { ...opts, timeZone: "UTC" });

export function monthTitle(key: string): string {
  const s = fmt({ month: "long", year: "numeric" }).format(keyToDate(key));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function dayTitle(key: string): string {
  const s = fmt({ weekday: "long", day: "numeric", month: "long" }).format(keyToDate(key));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function shortDay(key: string): string {
  return fmt({ weekday: "short" }).format(keyToDate(key)).replace(".", "");
}

export function dayNumber(key: string): number {
  return keyToDate(key).getUTCDate();
}

export function weekRangeTitle(start: string): string {
  const end = addDays(start, 6);
  const a = keyToDate(start);
  const b = keyToDate(end);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}–${b.getUTCDate()} de ${fmt({ month: "long", year: "numeric" }).format(b)}`;
  return `${fmt({ day: "numeric", month: "short" }).format(a)} – ${fmt({ day: "numeric", month: "short", year: "numeric" }).format(b)}`;
}

/** Desfase de una zona en un instante (minutos). */
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
  return (Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - date.getTime()) / 60_000;
}

/** Día y hora locales de una zona → instante ISO. */
export function localToIso(key: string, time: string, tz: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, h, mi));
  const first = new Date(guess.getTime() - offsetMinutes(tz, guess) * 60_000);
  return new Date(guess.getTime() - offsetMinutes(tz, first) * 60_000).toISOString();
}

/** Columnas para citas que se pisan en un mismo día (vista de semana y de día). */
export function layoutColumns<T extends { start: number; end: number }>(items: T[]): (T & { col: number; cols: number })[] {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  const out: (T & { col: number; cols: number })[] = [];
  let group: (T & { col: number; cols: number })[] = [];
  let groupEnd = -1;
  const flush = () => {
    const cols = Math.max(1, ...group.map((g) => g.col + 1));
    for (const g of group) g.cols = cols;
    out.push(...group);
    group = [];
  };
  for (const item of sorted) {
    if (group.length > 0 && item.start >= groupEnd) flush();
    const used = new Set(group.filter((g) => g.end > item.start).map((g) => g.col));
    let col = 0;
    while (used.has(col)) col++;
    group.push({ ...item, col, cols: 1 });
    groupEnd = Math.max(groupEnd, item.end);
  }
  flush();
  return out;
}
