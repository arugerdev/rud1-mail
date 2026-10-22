"use client";

import * as React from "react";
import {
  Bell,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  MapPin,
  Pencil,
  Repeat,
  RotateCcw,
  Trash2,
  UsersRound,
  Video,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

import { eventCommandAction, getEventAction, saveEventAction, type SaveEventInput } from "@/app/actions/agenda";
import { EVENT_TYPES, type AgendaEventDetail, type AgendaOccurrence, type AgendaPersonOption, type EventType, type Recurrence } from "@/lib/agenda-types";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { ToggleSwitch } from "@/shared/components/ui/toggle-switch";

import {
  DEFAULT_MINUTES,
  hhmm,
  instantDayKey,
  localToIso,
  RECURRENCE_LABELS,
  REMINDER_PRESETS,
  reminderLabel,
  timeLabel,
  TYPE_STYLE,
} from "./agenda-utils";

type Scope = "series" | "occurrence";

function whenText(detail: { allDay: boolean; start: string; end: string }, tz: string): string {
  const day = (iso: string) =>
    new Intl.DateTimeFormat("es-ES", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
  const sameDay = instantDayKey(new Date(detail.start), tz) === instantDayKey(new Date(detail.end), tz);
  if (detail.allDay) return sameDay ? `${day(detail.start)} · todo el día` : `Del ${day(detail.start)} al ${day(detail.end)}`;
  if (sameDay) return `${day(detail.start)} · ${timeLabel(detail.start, tz)} – ${timeLabel(detail.end, tz)}`;
  return `${day(detail.start)} ${timeLabel(detail.start, tz)} – ${day(detail.end)} ${timeLabel(detail.end, tz)}`;
}

/** Para citas que se repiten: ¿solo esta o toda la serie? */
function ScopeChoice({ value, onChange }: { value: Scope; onChange: (s: Scope) => void }) {
  return (
    <div className="flex rounded-lg border border-border/50 p-0.5 text-xs" role="radiogroup" aria-label="A qué se aplica">
      {(
        [
          ["occurrence", "Solo esta"],
          ["series", "Toda la serie"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn("rounded-md px-2 py-1 font-medium", value === v ? "bg-primary-soft/60 text-primary-foreground dark:text-primary" : "text-muted-foreground")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// --- Ver una cita ---

export function EventDetailDialog({
  occurrence,
  tz,
  onClose,
  onEdit,
  onChanged,
}: {
  occurrence: AgendaOccurrence | null;
  tz: string;
  onClose: () => void;
  onEdit: (detail: AgendaEventDetail, occurrence: AgendaOccurrence) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = React.useState<AgendaEventDetail | null>(null);
  const [scope, setScope] = React.useState<Scope>("occurrence");
  const [busy, start] = React.useTransition();

  React.useEffect(() => {
    if (!occurrence) return;
    setDetail(null);
    setScope("occurrence");
    void getEventAction(occurrence.eventId, occurrence.occurrenceDay).then((r) => {
      if (r.ok) setDetail(r.data);
      else toast.error(r.error);
    });
  }, [occurrence]);

  if (!occurrence) return null;
  const style = TYPE_STYLE[occurrence.type];
  const color = occurrence.color ?? style.color;
  const Icon = style.icon;

  const command = (op: "delete" | "cancel" | "complete" | "reopen", success: string) =>
    start(async () => {
      const r = await eventCommandAction(op, {
        eventId: occurrence.eventId,
        occurrenceDay: occurrence.occurrenceDay,
        scope: occurrence.recurring ? scope : "series",
      });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(success);
        onChanged();
        onClose();
      }
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto p-0">
        <div className="h-2 rounded-t-[inherit]" style={{ background: `linear-gradient(90deg, ${color}, ${color}88)` }} />
        <div className="space-y-4 p-6 pt-4">
          <DialogHeader className="space-y-2 text-left">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium" style={{ background: `${color}22`, color }}>
              <Icon className="size-3.5" /> {style.label}
              {occurrence.status === "TENTATIVE" && " · por confirmar"}
              {occurrence.status === "DONE" && " · hecha"}
              {occurrence.status === "CANCELED" && " · cancelada"}
            </span>
            <DialogTitle className={cn("text-xl", occurrence.status === "CANCELED" && "line-through")}>{occurrence.title}</DialogTitle>
            <DialogDescription className="flex items-center gap-1.5">
              <Clock className="size-4 shrink-0" /> {whenText(occurrence, tz)}
              {occurrence.recurring && <Repeat className="size-3.5 shrink-0" />}
            </DialogDescription>
          </DialogHeader>

          {occurrence.meetingUrl && (
            <Button asChild className="w-full">
              <a href={occurrence.meetingUrl} target="_blank" rel="noreferrer">
                <Video /> Unirse a la videollamada
              </a>
            </Button>
          )}

          <div className="space-y-2 text-sm">
            {occurrence.location && (
              <p className="flex items-start gap-2">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <a href={`https://www.google.com/maps/search/${encodeURIComponent(occurrence.location)}`} target="_blank" rel="noreferrer" className="hover:underline">
                  {occurrence.location}
                </a>
              </p>
            )}
            {occurrence.people.length > 0 && (
              <div className="flex items-start gap-2">
                <UsersRound className="mt-1 size-4 shrink-0 text-muted-foreground" />
                <div className="flex flex-wrap gap-1.5">
                  {occurrence.people.map((p) => (
                    <span key={p.id} className="inline-flex items-center gap-1.5 rounded-full border border-border/50 py-0.5 pl-0.5 pr-2 text-xs">
                      <span className="size-4 rounded-full" style={{ background: p.color ?? "#64748b" }} />
                      {p.name}
                      {occurrence.organizer?.id === p.id && <span className="text-muted-foreground">· organiza</span>}
                    </span>
                  ))}
                  {occurrence.externalCount > 0 && <span className="text-xs text-muted-foreground">+{occurrence.externalCount} de fuera</span>}
                </div>
              </div>
            )}
            {detail && detail.reminders.length > 0 && (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Bell className="size-4 shrink-0" /> {detail.reminders.map((r) => reminderLabel(r.minutesBefore)).join(", ")}
              </p>
            )}
            {detail?.description && <p className="whitespace-pre-wrap rounded-xl bg-muted/40 p-3 text-sm">{detail.description}</p>}
            {detail?.outcome && (
              <p className="rounded-xl border border-success/30 bg-success/10 p-3 text-sm">
                <strong>Resultado:</strong> {detail.outcome}
              </p>
            )}
            {!detail && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
          </div>

          {occurrence.recurring && occurrence.canEdit && (
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>Se repite. Los cambios afectan a:</span>
              <ScopeChoice value={scope} onChange={setScope} />
            </div>
          )}
        </div>
        <DialogFooter className="flex-wrap gap-2 border-t border-border/40 p-4 sm:justify-between">
          <div className="flex gap-1">
            {occurrence.canEdit && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(occurrence.recurring && scope === "series" ? "¿Borrar toda la serie?" : "¿Borrar esta cita?")) command("delete", "Cita borrada");
                  }}
                >
                  <Trash2 /> Borrar
                </Button>
                {occurrence.status !== "CANCELED" && (
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => command("cancel", "Cita cancelada")}>
                    <XCircle /> Cancelar cita
                  </Button>
                )}
              </>
            )}
          </div>
          <div className="flex gap-2">
            {occurrence.canComplete &&
              (occurrence.status === "DONE" ? (
                <Button variant="outline" size="sm" disabled={busy} onClick={() => command("reopen", "Reabierta")}>
                  <RotateCcw /> Reabrir
                </Button>
              ) : (
                occurrence.status !== "CANCELED" && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => command("complete", "Marcada como hecha")}>
                    <CheckCircle2 /> Hecha
                  </Button>
                )
              ))}
            {occurrence.canEdit && (
              <Button size="sm" disabled={!detail || busy} onClick={() => detail && onEdit(detail, occurrence)}>
                {busy ? <Loader2 className="animate-spin" /> : <Pencil />} Editar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Crear o editar ---

export interface EditorSeed {
  detail?: AgendaEventDetail;
  occurrence?: AgendaOccurrence;
  day?: string;
  minutes?: number;
}

interface Draft {
  type: EventType;
  title: string;
  allDay: boolean;
  day: string;
  startTime: string;
  endDay: string;
  endTime: string;
  location: string;
  meetingUrl: string;
  description: string;
  recurrence: Recurrence;
  recurInterval: number;
  recurUntil: string;
  attendeeIds: string[];
  reminders: number[];
  tentative: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const minutesToTime = (m: number) => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;

function draftFrom(seed: EditorSeed, tz: string, meId: string | null): Draft {
  const d = seed.detail;
  if (d) {
    // Si se edita una ocurrencia, sus fechas; si no, las de la serie.
    const start = seed.occurrence?.start ?? d.startsAt;
    const end = seed.occurrence?.end ?? d.endsAt;
    return {
      type: d.type,
      title: d.title,
      allDay: d.allDay,
      day: instantDayKey(new Date(start), d.allDay ? d.timezone : tz),
      startTime: hhmm(start, tz),
      endDay: instantDayKey(new Date(end), d.allDay ? d.timezone : tz),
      endTime: hhmm(end, tz),
      location: d.location ?? "",
      meetingUrl: d.meetingUrl ?? "",
      description: d.description ?? "",
      recurrence: d.recurrence,
      recurInterval: d.recurInterval,
      recurUntil: d.recurUntil ?? "",
      attendeeIds: d.attendees.filter((a) => a.adminUserId).map((a) => a.adminUserId!) as string[],
      reminders: d.reminders.filter((r) => r.channel === "IN_APP").map((r) => r.minutesBefore),
      tentative: d.status === "TENTATIVE",
    };
  }
  const startMin = seed.minutes ?? Math.min(23 * 60, Math.ceil((new Date().getHours() * 60 + new Date().getMinutes() + 1) / 30) * 30);
  const day = seed.day ?? instantDayKey(new Date(), tz);
  return {
    type: "MEETING",
    title: "",
    allDay: false,
    day,
    startTime: minutesToTime(startMin),
    endDay: day,
    endTime: minutesToTime(Math.min(startMin + DEFAULT_MINUTES.MEETING, 23 * 60 + 59)),
    location: "",
    meetingUrl: "",
    description: "",
    recurrence: "NONE",
    recurInterval: 1,
    recurUntil: "",
    attendeeIds: meId ? [meId] : [],
    reminders: [10],
    tentative: false,
  };
}

export function EventEditorDialog({
  seed,
  tz,
  meId,
  people,
  onClose,
  onSaved,
}: {
  seed: EditorSeed | null;
  tz: string;
  meId: string | null;
  people: AgendaPersonOption[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [scope, setScope] = React.useState<Scope>("series");
  const [saving, start] = React.useTransition();
  React.useEffect(() => {
    if (!seed) return;
    setDraft(draftFrom(seed, tz, meId));
    setScope(seed.occurrence?.recurring ? "occurrence" : "series");
  }, [seed, tz, meId]);

  if (!seed || !draft) return null;
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const editing = Boolean(seed.detail);

  // Al cambiar de tipo en una cita nueva, su duración típica.
  const pickType = (type: EventType) => {
    if (editing || draft.allDay) return set({ type });
    const [h, m] = draft.startTime.split(":").map(Number);
    set({ type, endTime: minutesToTime(Math.min(h * 60 + m + DEFAULT_MINUTES[type], 23 * 60 + 59)) });
  };

  const save = () =>
    start(async () => {
      const startsAt = draft.allDay ? localToIso(draft.day, "00:00", "Europe/Madrid") : localToIso(draft.day, draft.startTime, tz);
      const endsAt = draft.allDay ? localToIso(draft.endDay < draft.day ? draft.day : draft.endDay, "00:00", "Europe/Madrid") : localToIso(draft.endDay, draft.endTime, tz);
      if (Date.parse(endsAt) < Date.parse(startsAt)) {
        toast.error("El final no puede ser antes del inicio.");
        return;
      }
      const input: SaveEventInput = {
        ...(seed.detail ? { id: seed.detail.id, expectedSequence: seed.detail.sequence } : {}),
        scope: seed.occurrence?.recurring ? scope : "series",
        occurrenceDay: seed.occurrence?.occurrenceDay ?? null,
        type: draft.type,
        status: draft.tentative ? "TENTATIVE" : seed.detail?.status === "DONE" ? "DONE" : "CONFIRMED",
        title: draft.title.trim(),
        description: draft.description.trim() || null,
        location: draft.location.trim() || null,
        meetingUrl: draft.meetingUrl.trim() || null,
        allDay: draft.allDay,
        startsAt,
        endsAt,
        timezone: draft.allDay ? "Europe/Madrid" : tz,
        recurrence: draft.recurrence,
        recurInterval: draft.recurInterval,
        recurUntil: draft.recurrence !== "NONE" && draft.recurUntil ? draft.recurUntil : null,
        attendeeIds: draft.attendeeIds,
        reminders: draft.reminders.map((m) => ({ minutesBefore: m, channel: "IN_APP" as const })),
      };
      const r = await saveEventAction(input);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(editing ? "Cita guardada" : "Cita creada");
        onSaved();
        onClose();
      }
    });

  const color = TYPE_STYLE[draft.type].color;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar cita" : "Nueva cita"}</DialogTitle>
          <DialogDescription>Se guarda en la agenda de admin.rud1.es: la verás igual en los dos sitios.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {EVENT_TYPES.map((t) => {
            const s = TYPE_STYLE[t];
            const on = draft.type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => pickType(t)}
                className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all active:scale-95", on ? "shadow-glass-xs" : "border-border/50 text-muted-foreground hover:bg-accent/40")}
                style={on ? { background: `${s.color}22`, borderColor: `${s.color}66`, color: s.color } : undefined}
              >
                <s.icon className="size-3.5" /> {s.label}
              </button>
            );
          })}
        </div>

        <Input
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Título"
          className="h-11 text-base font-medium"
          style={{ boxShadow: `inset 3px 0 0 ${color}` }}
          autoFocus
        />

        <div className="space-y-3 rounded-xl border border-border/50 p-3">
          <ToggleSwitch checked={draft.allDay} onChange={(v) => set({ allDay: v })} label="Todo el día" />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="min-w-0 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Empieza</span>
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={draft.day}
                  onChange={(e) => set({ day: e.target.value, endDay: e.target.value > draft.endDay ? e.target.value : draft.endDay })}
                  aria-label="Día de inicio"
                  className="min-w-0 flex-1"
                />
                {!draft.allDay && (
                  <Input type="time" value={draft.startTime} onChange={(e) => set({ startTime: e.target.value })} aria-label="Hora de inicio" className="w-[6.5rem] shrink-0" />
                )}
              </div>
            </div>
            <div className="min-w-0 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Termina</span>
              <div className="flex gap-2">
                <Input type="date" value={draft.endDay} min={draft.day} onChange={(e) => set({ endDay: e.target.value })} aria-label="Día de fin" className="min-w-0 flex-1" />
                {!draft.allDay && (
                  <Input type="time" value={draft.endTime} onChange={(e) => set({ endTime: e.target.value })} aria-label="Hora de fin" className="w-[6.5rem] shrink-0" />
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Repeat className="size-4 text-muted-foreground" />
            <select
              value={draft.recurrence}
              onChange={(e) => set({ recurrence: e.target.value as Recurrence })}
              className="rounded-lg border border-border/60 bg-background px-2 py-1.5 text-sm"
              aria-label="Repetición"
            >
              {(Object.keys(RECURRENCE_LABELS) as Recurrence[]).map((r) => (
                <option key={r} value={r}>
                  {RECURRENCE_LABELS[r]}
                </option>
              ))}
            </select>
            {draft.recurrence !== "NONE" && (
              <>
                <span className="text-muted-foreground">hasta</span>
                <Input type="date" value={draft.recurUntil} min={draft.day} onChange={(e) => set({ recurUntil: e.target.value })} className="w-40" aria-label="Hasta" />
              </>
            )}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ag-loc" className="flex items-center gap-1.5">
              <MapPin className="size-3.5" /> Lugar
            </Label>
            <Input id="ag-loc" value={draft.location} onChange={(e) => set({ location: e.target.value })} placeholder="Oficina, dirección…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ag-url" className="flex items-center gap-1.5">
              <Video className="size-3.5" /> Videollamada
            </Label>
            <Input id="ag-url" value={draft.meetingUrl} onChange={(e) => set({ meetingUrl: e.target.value })} placeholder="https://meet.google.com/…" />
          </div>
        </div>

        {people.length > 0 && (
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <UsersRound className="size-3.5" /> Personas
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {people.map((p) => {
                const on = draft.attendeeIds.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ attendeeIds: on ? draft.attendeeIds.filter((x) => x !== p.id) : [...draft.attendeeIds, p.id] })}
                    className={cn("inline-flex items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-2.5 text-xs transition-all", on ? "border-primary/50 bg-primary-soft/40 shadow-glass-xs" : "border-border/50 text-muted-foreground hover:bg-accent/40")}
                  >
                    <span className="size-5 rounded-full" style={{ background: p.color ?? "#64748b" }} />
                    {p.name}
                    {p.id === meId && " (tú)"}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Bell className="size-3.5" /> Avisos
          </Label>
          <div className="flex flex-wrap gap-1.5">
            {REMINDER_PRESETS.map((m) => {
              const on = draft.reminders.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set({ reminders: on ? draft.reminders.filter((x) => x !== m) : [...draft.reminders, m] })}
                  className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", on ? "border-primary/50 bg-primary-soft/40" : "border-border/50 text-muted-foreground hover:bg-accent/40")}
                >
                  {reminderLabel(m)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ag-desc">Notas</Label>
          <textarea
            id="ag-desc"
            value={draft.description}
            onChange={(e) => set({ description: e.target.value })}
            rows={3}
            className="w-full resize-y rounded-xl border border-border/60 bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            placeholder="Orden del día, detalles…"
          />
        </div>

        <ToggleSwitch checked={draft.tentative} onChange={(v) => set({ tentative: v })} label="Por confirmar" />

        {seed.occurrence?.recurring && (
          <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>Cambiar</span>
            <ScopeChoice value={scope} onChange={setScope} />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || !draft.title.trim()}>
            {saving ? <Loader2 className="animate-spin" /> : <Calendar />} {editing ? "Guardar" : "Crear cita"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
