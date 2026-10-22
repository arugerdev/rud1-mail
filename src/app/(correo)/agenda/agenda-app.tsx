"use client";

import * as React from "react";
import { CalendarDays, CalendarRange, ChevronLeft, ChevronRight, List, Loader2, Plus, Square } from "lucide-react";
import { toast } from "sonner";

import { loadRangeAction } from "@/app/actions/agenda";
import type { AgendaEventDetail, AgendaMe, AgendaOccurrence, AgendaPersonOption, EventType } from "@/lib/agenda-types";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";

import {
  addDays,
  addMonths,
  browserTimeZone,
  dayTitle,
  monthTitle,
  timeLabel,
  todayKey,
  TYPE_STYLE,
  weekRangeTitle,
  weekStart,
} from "./agenda-utils";
import { ListView, MiniMonth, MonthView, TimeGrid } from "./agenda-views";
import { EventDetailDialog, EventEditorDialog, type EditorSeed } from "./event-dialogs";

type View = "mes" | "semana" | "dia" | "lista";

const VIEWS: { v: View; label: string; icon: typeof CalendarDays }[] = [
  { v: "dia", label: "Día", icon: Square },
  { v: "semana", label: "Semana", icon: CalendarRange },
  { v: "mes", label: "Mes", icon: CalendarDays },
  { v: "lista", label: "Lista", icon: List },
];

const LIST_DAYS = 30;

function rangeFor(view: View, cursor: string): { from: string; to: string } {
  if (view === "mes") {
    const from = weekStart(`${cursor.slice(0, 7)}-01`);
    return { from, to: addDays(from, 41) };
  }
  if (view === "semana") {
    const from = weekStart(cursor);
    return { from, to: addDays(from, 6) };
  }
  if (view === "dia") return { from: cursor, to: cursor };
  return { from: cursor, to: addDays(cursor, LIST_DAYS - 1) };
}

export function AgendaApp({ me, people }: { me: AgendaMe; people: AgendaPersonOption[] }) {
  const [tz, setTz] = React.useState("Europe/Madrid");
  const [today, setToday] = React.useState(() => todayKey("Europe/Madrid"));
  const [view, setView] = React.useState<View>("semana");
  const [cursor, setCursor] = React.useState(today);
  const [items, setItems] = React.useState<AgendaOccurrence[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [personIds, setPersonIds] = React.useState<string[]>([me.id]);
  const [hiddenTypes, setHiddenTypes] = React.useState<Set<EventType>>(new Set());
  const [opened, setOpened] = React.useState<AgendaOccurrence | null>(null);
  const [editor, setEditor] = React.useState<EditorSeed | null>(null);
  const requestId = React.useRef(0);

  // Zona y vista según el dispositivo (en el móvil, la lista; recordada entre visitas).
  React.useEffect(() => {
    const zone = browserTimeZone();
    setTz(zone);
    setToday(todayKey(zone));
    setCursor(todayKey(zone));
    let saved: View | null = null;
    try {
      saved = localStorage.getItem("rud1-agenda-vista") as View | null;
    } catch {
      // Sin almacenamiento, la vista por defecto.
    }
    if (saved && VIEWS.some((v) => v.v === saved)) setView(saved);
    else if (window.matchMedia("(max-width: 767px)").matches) setView("lista");
  }, []);

  const changeView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem("rud1-agenda-vista", v);
    } catch {
      // Sin almacenamiento no pasa nada.
    }
  };

  const { from, to } = rangeFor(view, cursor);

  const load = React.useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    const r = await loadRangeAction({ from, to, timeZone: tz, personIds: me.canSeeTeam ? personIds : [] });
    if (id !== requestId.current) return;
    setLoading(false);
    if (r.ok) setItems(r.data.items);
    else toast.error(r.error);
  }, [from, to, tz, personIds, me.canSeeTeam]);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Al volver a la pestaña o cada 2 minutos: lo que se haya cambiado en admin.rud1.es aparece solo.
  React.useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const timer = window.setInterval(() => document.visibilityState === "visible" && void load(), 120_000);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearInterval(timer);
    };
  }, [load]);

  const shift = (dir: -1 | 1) => {
    if (view === "mes") setCursor(addMonths(cursor, dir));
    else if (view === "semana") setCursor(addDays(cursor, dir * 7));
    else if (view === "dia") setCursor(addDays(cursor, dir));
    else setCursor(addDays(cursor, dir * LIST_DAYS));
  };

  const title =
    view === "mes" ? monthTitle(cursor) : view === "semana" ? weekRangeTitle(weekStart(cursor)) : view === "dia" ? dayTitle(cursor) : `Desde ${dayTitle(cursor).toLowerCase()}`;

  const visible = items.filter((o) => !hiddenTypes.has(o.type));
  const marked = new Set(items.map((o) => o.dayKey));
  const upcoming = items
    .filter((o) => Date.parse(o.end) >= Date.now() && o.status !== "CANCELED")
    .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    .slice(0, 5);

  const viewProps = {
    items: visible,
    today,
    tz,
    onOpen: setOpened,
    onCreate: (day: string, minutes?: number) => setEditor({ day, minutes }),
  };

  // Atajos: ← → para moverse, T para hoy, N para nueva cita.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable], [role=dialog]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") shift(-1);
      else if (e.key === "ArrowRight") shift(1);
      else if (e.key.toLowerCase() === "t") setCursor(today);
      else if (e.key.toLowerCase() === "n") setEditor({ day: cursor });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <aside className="hidden w-64 shrink-0 flex-col gap-5 overflow-y-auto border-r border-border/40 p-4 xl:flex">
        <Button className="w-full justify-start shadow-glass-xs" onClick={() => setEditor({ day: cursor })}>
          <Plus /> Nueva cita
        </Button>
        <MiniMonth
          cursor={cursor}
          today={today}
          marked={marked}
          onPick={(d) => {
            setCursor(d);
            if (view === "lista") changeView("dia");
          }}
        />
        {me.canSeeTeam && people.length > 1 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Agendas</p>
            {people.map((p) => {
              const on = personIds.includes(p.id);
              return (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-sm hover:bg-accent/40">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setPersonIds(on ? personIds.filter((x) => x !== p.id) : [...personIds, p.id])}
                    className="size-3.5 accent-[hsl(var(--primary))]"
                  />
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: p.color ?? "#64748b" }} />
                  <span className="truncate">{p.id === me.id ? "La mía" : p.name}</span>
                </label>
              );
            })}
          </div>
        )}
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tipos</p>
          <div className="flex flex-wrap gap-1">
            {(Object.keys(TYPE_STYLE) as EventType[]).map((t) => {
              const s = TYPE_STYLE[t];
              const off = hiddenTypes.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    const next = new Set(hiddenTypes);
                    if (off) next.delete(t);
                    else next.add(t);
                    setHiddenTypes(next);
                  }}
                  className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-all", off && "opacity-35")}
                  style={{ background: `${s.color}1f`, color: s.color }}
                >
                  <s.icon className="size-3" /> {s.label}
                </button>
              );
            })}
          </div>
        </div>
        {upcoming.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próximo</p>
            {upcoming.map((o) => (
              <button key={o.key} type="button" onClick={() => setOpened(o)} className="flex w-full items-start gap-2 rounded-lg p-1.5 text-left hover:bg-accent/40">
                <span className="mt-1 size-2 shrink-0 rounded-full" style={{ background: o.color ?? TYPE_STYLE[o.type].color }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{o.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {o.dayKey === today ? "Hoy" : dayTitle(o.dayKey)}
                    {!o.allDay && ` · ${timeLabel(o.start, tz)}`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border/40 px-3 py-2 md:px-4">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={() => setCursor(today)}>
              Hoy
            </Button>
            <Button variant="ghost" size="icon" aria-label="Anterior" onClick={() => shift(-1)}>
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Siguiente" onClick={() => shift(1)}>
              <ChevronRight />
            </Button>
          </div>
          {/* En el móvil el título va en su propia línea, entero. */}
          <h2 className="order-first w-full truncate text-base font-semibold md:order-none md:w-auto md:min-w-0 md:flex-1 md:text-lg">{title}</h2>
          {loading && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          <div className="ml-auto flex rounded-xl border border-border/50 bg-surface-1/60 p-0.5 text-sm md:ml-0">
            {VIEWS.map(({ v, label, icon: Icon }) => (
              <button
                key={v}
                type="button"
                onClick={() => changeView(v)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 transition-colors",
                  view === v ? "bg-primary-soft/50 text-primary-foreground shadow-glass-xs dark:text-primary" : "text-muted-foreground hover:text-foreground",
                  v === "semana" && "hidden md:flex",
                )}
              >
                <Icon className="size-4" /> <span className="hidden sm:inline">{label}</span>
              </button>
            ))}
          </div>
          <Button size="sm" className="xl:hidden" onClick={() => setEditor({ day: cursor })} aria-label="Nueva cita">
            <Plus /> <span className="hidden sm:inline">Nueva</span>
          </Button>
        </header>

        {view === "mes" && (
          <MonthView
            {...viewProps}
            cursor={cursor}
            onPickDay={(d) => {
              setCursor(d);
              changeView("dia");
            }}
          />
        )}
        {view === "semana" && <TimeGrid {...viewProps} days={Array.from({ length: 7 }, (_, i) => addDays(weekStart(cursor), i))} />}
        {view === "dia" && <TimeGrid {...viewProps} days={[cursor]} />}
        {view === "lista" && <ListView {...viewProps} from={cursor} days={LIST_DAYS} />}
      </section>

      <EventDetailDialog
        occurrence={opened}
        tz={tz}
        onClose={() => setOpened(null)}
        onChanged={() => void load()}
        onEdit={(detail: AgendaEventDetail, occurrence) => {
          setOpened(null);
          setEditor({ detail, occurrence });
        }}
      />
      <EventEditorDialog seed={editor} tz={tz} meId={me.id} people={people} onClose={() => setEditor(null)} onSaved={() => void load()} />
    </div>
  );
}
