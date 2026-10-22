"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Music, Play, Trash2, Upload, Volume1, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";

import { removeSoundAction, savePrefsAction, uploadSoundAction } from "@/app/actions/profile";
import { SOUND_EVENTS, SOUND_GROUPS, SOUNDS, type SoundEvent, type SoundId, type SoundPrefs } from "@/lib/sound-catalog";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ToggleSwitch } from "@/shared/components/ui/toggle-switch";

import { customSoundUrl } from "../sound-provider";
import { playSound } from "../sounds";

function VolumeIcon({ value, className }: { value: number; className?: string }) {
  if (value === 0) return <VolumeX className={className} />;
  return value < 50 ? <Volume1 className={className} /> : <Volume2 className={className} />;
}

function Slider({ value, onChange, label, disabled }: { value: number; onChange: (v: number) => void; label: string; disabled?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", disabled && "opacity-50")}>
      <VolumeIcon value={value} className="size-4 shrink-0 text-muted-foreground" />
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer accent-[hsl(var(--primary))]"
      />
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{value}%</span>
    </div>
  );
}

/**
 * Sonidos de aviso: cuál suena con cada cosa y a qué volumen, con un sonido
 * propio si se quiere. Se guarda al momento (los deslizadores, al soltarlos).
 */
export function SoundSettings({ enabled: initialEnabled, prefs: initial }: { enabled: boolean; prefs: SoundPrefs }) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [prefs, setPrefs] = React.useState(initial);
  const [uploading, startUpload] = React.useTransition();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const saveTimer = React.useRef<number | undefined>(undefined);
  const custom = initial.custom;

  // Al subir o quitar el sonido propio, el servidor cambia la lista: se toma la suya.
  const customVersion = initial.custom?.version ?? 0;
  React.useEffect(() => {
    setPrefs(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customVersion]);

  const persist = (patch: { sound?: boolean; sounds?: SoundPrefs }, delay = 0) => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      void savePrefsAction(patch).then((r) => {
        if (!r.ok) toast.error("No se pudo guardar el sonido.");
        else router.refresh();
      });
    }, delay);
  };

  const update = (next: SoundPrefs, delay = 0) => {
    setPrefs(next);
    persist({ sounds: next }, delay);
  };

  const preview = (sound: SoundId, eventVolume: number, master = prefs.volume) =>
    playSound(sound, (master / 100) * (eventVolume / 100), customSoundUrl({ ...prefs, custom }));

  const setEvent = (key: SoundEvent, patch: Partial<SoundPrefs["events"][SoundEvent]>, delay = 0) => {
    const next = { ...prefs, events: { ...prefs.events, [key]: { ...prefs.events[key], ...patch } } };
    update(next, delay);
    return next.events[key];
  };

  const upload = (file: File) => {
    const fd = new FormData();
    fd.set("sonido", file);
    startUpload(async () => {
      const r = await uploadSoundAction(fd);
      if (!r.ok) toast.error(r.error ?? "No se pudo subir el sonido.");
      else {
        toast.success("Sonido subido. Ya puedes elegirlo como «Mi sonido».");
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-5">
      <ToggleSwitch
        checked={enabled}
        onChange={(v) => {
          setEnabled(v);
          persist({ sound: v });
        }}
        label="Sonidos de aviso"
        description="Con la app o la pestaña de rud1 Mail abierta."
      />

      <div className={cn("space-y-5 transition-opacity", !enabled && "pointer-events-none opacity-50")}>
        <div className="space-y-2">
          <p className="text-sm font-medium">Volumen general</p>
          <Slider value={prefs.volume} label="Volumen general" onChange={(v) => update({ ...prefs, volume: v }, 500)} />
        </div>

        <ToggleSwitch
          checked={prefs.whenFocused}
          onChange={(v) => update({ ...prefs, whenFocused: v })}
          label="También mientras miro rud1 Mail"
          description="Si lo apagas, solo suena con la ventana en segundo plano."
        />

        <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/50">
          {SOUND_EVENTS.map((event) => {
            const setting = prefs.events[event.key];
            return (
              <li key={event.key} className="grid gap-3 bg-surface-1/40 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{event.label}</p>
                  <p className="text-xs text-muted-foreground">{event.description}</p>
                </div>
                <div className="flex flex-col gap-2 sm:w-80">
                  <div className="flex items-center gap-2">
                    <Select
                      value={setting.sound}
                      onValueChange={(value) => {
                        const s = setEvent(event.key, { sound: value as SoundId });
                        preview(s.sound, s.volume);
                      }}
                    >
                      <SelectTrigger className="h-9 min-w-0 flex-1 px-3" aria-label={`Sonido para: ${event.label}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ninguno">Sin sonido</SelectItem>
                        {custom && <SelectItem value="personalizado">Mi sonido: {custom.name}</SelectItem>}
                        {SOUND_GROUPS.map((group) => (
                          <SelectGroup key={group}>
                            <SelectSeparator />
                            <SelectLabel className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</SelectLabel>
                            {SOUNDS.filter((s) => s.group === group).map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Escuchar"
                      aria-label={`Escuchar: ${event.label}`}
                      disabled={setting.sound === "ninguno"}
                      onClick={() => preview(setting.sound, setting.volume)}
                    >
                      <Play className="size-4" />
                    </Button>
                  </div>
                  <Slider
                    value={setting.volume}
                    label={`Volumen: ${event.label}`}
                    disabled={setting.sound === "ninguno"}
                    onChange={(v) => setEvent(event.key, { volume: v }, 500)}
                  />
                </div>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border/60 p-3">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <Music className="size-4 shrink-0 text-primary" />
            {custom ? (
              <span className="truncate">
                Tu sonido: <strong>{custom.name}</strong>
              </span>
            ) : (
              <span className="text-muted-foreground">Sube tu propio sonido (MP3, OGG, WAV, M4A… hasta 1 MB).</span>
            )}
          </div>
          <div className="flex gap-2">
            {custom && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  void removeSoundAction().then((r) => {
                    if (!r.ok) toast.error(r.error ?? "No se pudo quitar.");
                    else router.refresh();
                  })
                }
              >
                <Trash2 /> Quitar
              </Button>
            )}
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>
              {uploading ? <Loader2 className="animate-spin" /> : <Upload />} {custom ? "Cambiar" : "Subir sonido"}
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
        </div>
      </div>
    </div>
  );
}
