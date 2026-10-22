"use client";

import * as React from "react";

import type { SoundEvent, SoundPrefs } from "@/lib/sound-catalog";

import { playSound } from "./sounds";

interface SoundContextValue {
  /** Suena lo elegido para `event` (si los sonidos están activados). */
  play: (event: SoundEvent) => void;
}

const SoundContext = React.createContext<SoundContextValue>({ play: () => undefined });

export function useSounds(): SoundContextValue {
  return React.useContext(SoundContext);
}

export function customSoundUrl(prefs: SoundPrefs): string | null {
  return prefs.custom ? `/api/sonido?v=${prefs.custom.version}` : null;
}

/** Sonidos de aviso de cada persona (Ajustes → Sonidos). */
export function SoundProvider({ enabled, prefs, children }: { enabled: boolean; prefs: SoundPrefs; children: React.ReactNode }) {
  const ref = React.useRef({ enabled, prefs });
  ref.current = { enabled, prefs };

  const value = React.useMemo<SoundContextValue>(
    () => ({
      play: (event) => {
        const { enabled: on, prefs: p } = ref.current;
        if (!on) return;
        const looking = document.visibilityState === "visible" && document.hasFocus();
        if (looking && !p.whenFocused) return;
        const setting = p.events[event];
        playSound(setting.sound, (p.volume / 100) * (setting.volume / 100), customSoundUrl(p));
      },
    }),
    [],
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}
