"use client";

import * as React from "react";
import { MapPin, Repeat, Video } from "lucide-react";

import type { AgendaOccurrence } from "@/lib/agenda-types";
import { cn } from "@/lib/utils";

import {
  addDays,
  dayNumber,
  dayTitle,
  hhmm,
  layoutColumns,
  minutesOfDay,
  shortDay,
  timeLabel,
  TYPE_STYLE,
  weekStart,
} from "./agenda-utils";

export interface ViewProps {
  items: AgendaOccurrence[];
  today: string;
  tz: string;
  onOpen: (o: AgendaOccurrence) => void;
  onCreate: (day: string, minutes?: number) => void;
}

const muted = (o: AgendaOccurrence) => o.status === "CANCELED" || o.status === "DONE";

/** Días que ocupa una cita (las de varios días salen en cada uno). */
function spansDay(o: AgendaOccurrence, day: string): boolean {
  return o.dayKey <= day && o.endDayKey >= day;
}

function byStart(a: AgendaOccurrence, b: AgendaOccurrence) {
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
  return Date.parse(a.start) - Date.parse(b.start);
}

export function EventChip({ o, tz, onOpen, compact }: { o: AgendaOccurrence; tz: string; onOpen: (o: AgendaOccurrence) => void; compact?: boolean }) {
  const style = TYPE_STYLE[o.type];
  const color = o.color ?? style.color;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen(o);
      }}
      title={o.title}
      className={cn(
        "group flex w-full min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[11px] leading-tight transition-all hover:brightness-110 active:scale-[0.98]",
        muted(o) && "opacity-55",
      )}
      style={
        o.allDay
          ? { background: color, color: "#fff" }
          : { background: `${color}1f`, boxShadow: `inset 2px 0 0 ${color}` }
      }
    >
      {!o.allDay && !compact && <span className="shrink-0 tabular-nums text-muted-foreground">{hhmm(o.start, tz)}</span>}
      <span className={cn("truncate font-medium", o.status === "CANCELED" && "line-through")}>{o.title}</span>
    </button>
  );
}

// --- Mes ---

export function MonthView({ cursor, items, today, tz, onOpen, onCreate, onPickDay }: ViewProps & { cursor: string; onPickDay: (day: string) => void }) {
  const first = weekStart(`${cursor.slice(0, 7)}-01`);
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const month = cursor.slice(0, 7);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="grid grid-cols-7 border-b border-border/40 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {days.slice(0, 7).map((d) => (
          <div key={d} className="py-2">
            {shortDay(d)}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6">
        {days.map((day, i) => {
          const list = items.filter((o) => spansDay(o, day)).sort(byStart);
          const out = day.slice(0, 7) !== month;
          const isToday = day === today;
          return (
            <div
              key={day}
              role="button"
              tabIndex={0}
              onClick={() => onCreate(day)}
              onKeyDown={(e) => e.key === "Enter" && onCreate(day)}
              className={cn(
                "rud1-in group relative flex min-h-[84px] cursor-pointer flex-col gap-0.5 overflow-hidden border-b border-r border-border/30 p-1 transition-colors hover:bg-accent/25",
                out && "bg-muted/20",
                (i + 1) % 7 === 0 && "border-r-0",
              )}
              style={{ animationDelay: `${Math.min(i, 20) * 8}ms` }}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPickDay(day);
                }}
                className={cn(
                  "mb-0.5 flex size-6 items-center justify-center self-start rounded-full text-xs font-medium transition-colors",
                  isToday ? "bg-primary text-primary-foreground shadow-glass-xs" : out ? "text-muted-foreground/60 hover:bg-accent" : "hover:bg-accent",
                )}
              >
                {dayNumber(day)}
              </button>
              <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                {list.slice(0, 3).map((o) => (
                  <EventChip key={`${o.key}:${day}`} o={o} tz={tz} onOpen={onOpen} />
                ))}
                {list.length > 3 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPickDay(day);
                    }}
                    className="px-1.5 text-left text-[11px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    +{list.length - 3} más
                  </button>
                )}
              </div>
              {/* En el móvil, puntos de color en lugar de títulos. */}
              <div className="flex flex-wrap gap-0.5 sm:hidden">
                {list.slice(0, 5).map((o) => (
                  <span key={o.key} className="size-1.5 rounded-full" style={{ background: o.color ?? TYPE_STYLE[o.type].color }} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Semana y día (rejilla de horas) ---

const HOUR_PX = 52;

export function TimeGrid({ days, items, today, tz, onOpen, onCreate }: ViewProps & { days: string[] }) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const [now, setNow] = React.useState(() => minutesOfDay(new Date().toISOString(), tz));

  React.useEffect(() => {
    // Al abrir, a las 7:30 (o a la hora actual si es más tarde).
    const target = Math.max(7.5 * 60, now - 90);
    scroller.current?.scrollTo({ top: (target / 60) * HOUR_PX });
    const timer = window.setInterval(() => setNow(minutesOfDay(new Date().toISOString(), tz)), 60_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tz]);

  const allDay = days.map((d) => items.filter((o) => (o.allDay || o.dayKey !== o.endDayKey) && spansDay(o, d)));
  const hasAllDay = allDay.some((l) => l.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex border-b border-border/40 pr-2">
        <div className="w-14 shrink-0" />
        {days.map((d) => (
          <div key={d} className="flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{shortDay(d)}</span>
            <span
              className={cn(
                "flex size-8 items-center justify-center rounded-full text-sm font-semibold",
                d === today ? "bg-primary text-primary-foreground shadow-glass-xs" : "text-foreground",
              )}
            >
              {dayNumber(d)}
            </span>
          </div>
        ))}
      </div>
      {hasAllDay && (
        <div className="flex border-b border-border/40 pr-2">
          <div className="w-14 shrink-0 py-1 pr-2 text-right text-[10px] text-muted-foreground">Todo el día</div>
          {allDay.map((list, i) => (
            <div key={days[i]} className="flex min-w-0 flex-1 flex-col gap-0.5 border-l border-border/30 p-0.5">
              {list.map((o) => (
                <EventChip key={o.key} o={o} tz={tz} onOpen={onOpen} compact />
              ))}
            </div>
          ))}
        </div>
      )}
      <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto pr-2">
        <div className="relative flex" style={{ height: 24 * HOUR_PX }}>
          <div className="w-14 shrink-0">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="relative text-right text-[10px] text-muted-foreground" style={{ height: HOUR_PX }}>
                {h > 0 && <span className="absolute -top-2 right-2 tabular-nums">{String(h).padStart(2, "0")}:00</span>}
              </div>
            ))}
          </div>
          {days.map((day) => {
            const timed = items
              .filter((o) => !o.allDay && o.dayKey === o.endDayKey && o.dayKey === day)
              .map((o) => {
                const start = minutesOfDay(o.start, tz);
                const end = Math.max(start + 20, minutesOfDay(o.end, tz) || 24 * 60);
                return { o, start, end };
              });
            return (
              <div
                key={day}
                className={cn("relative min-w-0 flex-1 border-l border-border/30", day === today && "bg-primary/[0.03]")}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const minutes = Math.floor(((e.clientY - rect.top) / HOUR_PX) * 2) * 30;
                  onCreate(day, Math.max(0, Math.min(23 * 60 + 30, minutes)));
                }}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="border-b border-border/25" style={{ height: HOUR_PX }}>
                    <div className="h-1/2 border-b border-dashed border-border/15" />
                  </div>
                ))}
                {layoutColumns(timed).map(({ o, start, end, col, cols }) => {
                  const color = o.color ?? TYPE_STYLE[o.type].color;
                  const Icon = TYPE_STYLE[o.type].icon;
                  const height = ((end - start) / 60) * HOUR_PX;
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpen(o);
                      }}
                      className={cn(
                        "rud1-pop absolute overflow-hidden rounded-lg px-1.5 py-1 text-left text-[11px] leading-tight shadow-glass-xs transition-all hover:z-10 hover:shadow-glass-sm hover:brightness-105",
                        muted(o) && "opacity-60",
                      )}
                      style={{
                        top: (start / 60) * HOUR_PX + 1,
                        height: Math.max(height - 2, 18),
                        left: `calc(${(col / cols) * 100}% + 2px)`,
                        width: `calc(${100 / cols}% - 4px)`,
                        background: `linear-gradient(180deg, ${color}2e, ${color}1a)`,
                        boxShadow: `inset 3px 0 0 ${color}`,
                      }}
                    >
                      <span className={cn("flex items-center gap-1 font-semibold", o.status === "CANCELED" && "line-through")}>
                        <Icon className="size-3 shrink-0" style={{ color }} />
                        <span className="truncate">{o.title}</span>
                      </span>
                      {height > 34 && (
                        <span className="block truncate text-muted-foreground">
                          {timeLabel(o.start, tz)} – {timeLabel(o.end, tz)}
                          {o.location ? ` · ${o.location}` : ""}
                        </span>
                      )}
                    </button>
                  );
                })}
                {day === today && (
                  <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: (now / 60) * HOUR_PX }}>
                    <span className="-ml-1 size-2.5 rounded-full bg-rose-500 shadow" />
                    <span className="h-0.5 flex-1 bg-rose-500/80" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- Lista (agenda) ---

export function ListView({ from, days, items, today, tz, onOpen, onCreate }: ViewProps & { from: string; days: number }) {
  const keys = Array.from({ length: days }, (_, i) => addDays(from, i));
  const groups = keys.map((d) => ({ day: d, list: items.filter((o) => spansDay(o, d)).sort(byStart) })).filter((g) => g.list.length > 0);
  if (groups.length === 0) {
    return (
      <div className="rud1-in flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
        <p className="text-sm">Nada en estas fechas.</p>
        <button type="button" onClick={() => onCreate(from)} className="text-sm font-medium text-primary hover:underline">
          Crear una cita
        </button>
      </div>
    );
  }
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 md:px-6">
      {groups.map(({ day, list }, gi) => (
        <section key={day} className="rud1-in py-2" style={{ animationDelay: `${Math.min(gi, 10) * 30}ms` }}>
          <h3 className={cn("sticky top-0 z-10 -mx-1 mb-1 bg-background/80 px-1 py-1 text-xs font-semibold uppercase tracking-wide backdrop-blur", day === today ? "text-primary" : "text-muted-foreground")}>
            {day === today ? "Hoy · " : day === addDays(today, 1) ? "Mañana · " : ""}
            {dayTitle(day)}
          </h3>
          <ul className="space-y-1.5">
            {list.map((o) => {
              const style = TYPE_STYLE[o.type];
              const color = o.color ?? style.color;
              const Icon = style.icon;
              return (
                <li key={`${o.key}:${day}`}>
                  <button
                    type="button"
                    onClick={() => onOpen(o)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl border border-border/40 bg-surface-1/50 p-2.5 text-left shadow-glass-xs transition-all hover:-translate-y-px hover:bg-surface-1 hover:shadow-glass-sm",
                      muted(o) && "opacity-60",
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${color}22`, color }}>
                      <Icon className="size-4" />
                    </span>
                    <span className="hidden w-24 shrink-0 text-xs tabular-nums text-muted-foreground sm:block">
                      {o.allDay ? "Todo el día" : `${timeLabel(o.start, tz)} – ${timeLabel(o.end, tz)}`}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("flex items-center gap-1.5 truncate text-sm font-medium", o.status === "CANCELED" && "line-through")}>
                        {o.title}
                        {o.recurring && <Repeat className="size-3 shrink-0 text-muted-foreground" />}
                      </span>
                      <span className="flex items-center gap-2 truncate text-xs text-muted-foreground">
                        <span className="shrink-0 tabular-nums sm:hidden">
                          {o.allDay ? "Todo el día" : `${timeLabel(o.start, tz)} – ${timeLabel(o.end, tz)}`}
                        </span>
                        {o.location && (
                          <span className="flex items-center gap-0.5 truncate">
                            <MapPin className="size-3" /> {o.location}
                          </span>
                        )}
                        {o.meetingUrl && (
                          <span className="flex items-center gap-0.5">
                            <Video className="size-3" /> Videollamada
                          </span>
                        )}
                        {o.people.length > 1 && <span>{o.people.length} personas</span>}
                      </span>
                    </span>
                    <span className="hidden -space-x-1.5 sm:flex">
                      {o.people.slice(0, 4).map((p) => (
                        <span
                          key={p.id}
                          title={p.name}
                          className="flex size-6 items-center justify-center rounded-full border-2 border-background text-[9px] font-semibold text-white"
                          style={{ background: p.color ?? "#64748b" }}
                        >
                          {p.name
                            .split(/\s+/)
                            .map((w) => w[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// --- Calendario pequeño del lateral ---

export function MiniMonth({ cursor, today, marked, onPick }: { cursor: string; today: string; marked: Set<string>; onPick: (day: string) => void }) {
  const [month, setMonth] = React.useState(cursor.slice(0, 7));
  React.useEffect(() => setMonth(cursor.slice(0, 7)), [cursor]);
  const first = weekStart(`${month}-01`);
  const days = Array.from({ length: 42 }, (_, i) => addDays(first, i));
  const title = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const shift = (n: number) => {
    const d = new Date(`${month}-01T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setMonth(d.toISOString().slice(0, 7));
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold capitalize">{title}</p>
        <div className="flex gap-0.5">
          <button type="button" aria-label="Mes anterior" onClick={() => shift(-1)} className="rounded-md px-1.5 text-muted-foreground hover:bg-accent">
            ‹
          </button>
          <button type="button" aria-label="Mes siguiente" onClick={() => shift(1)} className="rounded-md px-1.5 text-muted-foreground hover:bg-accent">
            ›
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-0.5 text-center text-[11px]">
        {days.slice(0, 7).map((d) => (
          <span key={d} className="font-medium uppercase text-muted-foreground/80">
            {shortDay(d).slice(0, 1)}
          </span>
        ))}
        {days.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => onPick(d)}
            className={cn(
              "relative mx-auto flex size-7 items-center justify-center rounded-full transition-colors",
              d === today ? "bg-primary font-semibold text-primary-foreground" : d === cursor ? "bg-primary-soft/60 font-semibold" : "hover:bg-accent",
              d.slice(0, 7) !== month && d !== today && "text-muted-foreground/50",
            )}
          >
            {dayNumber(d)}
            {marked.has(d) && d !== today && <span className="absolute bottom-0.5 size-1 rounded-full bg-primary" />}
          </button>
        ))}
      </div>
    </div>
  );
}
