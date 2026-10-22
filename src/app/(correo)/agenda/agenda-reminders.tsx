"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { todayAction } from "@/app/actions/agenda";
import type { AgendaOccurrence } from "@/lib/agenda-types";

import { desktopBridge } from "../desktop-bridge";
import { useSounds } from "../sound-provider";
import { browserTimeZone, timeLabel } from "./agenda-utils";

/** Cuánto antes avisa rud1 Mail de una cita de hoy. */
const LEAD_MINUTES = 10;

/**
 * Recordatorios de la agenda con la app abierta: 10 minutos antes de cada cita
 * de hoy suena el sonido de "Recordatorio de la agenda" y sale un aviso. Mira
 * la agenda cada 5 minutos (y al volver a la ventana).
 */
export function AgendaReminders() {
  const router = useRouter();
  const sounds = useSounds();
  const timers = React.useRef(new Map<string, number>());

  React.useEffect(() => {
    const tz = browserTimeZone();
    const done = new Set<string>();
    try {
      for (const k of JSON.parse(sessionStorage.getItem("rud1-agenda-avisadas") ?? "[]") as string[]) done.add(k);
    } catch {
      // Sin almacenamiento: puede repetir un aviso tras recargar, nada más.
    }
    const remember = (key: string) => {
      done.add(key);
      try {
        sessionStorage.setItem("rud1-agenda-avisadas", JSON.stringify([...done].slice(-200)));
      } catch {
        // Igual que arriba.
      }
    };

    const fire = (o: AgendaOccurrence) => {
      if (done.has(o.key)) return;
      remember(o.key);
      sounds.play("recordatorio");
      const title = `${o.title} · ${timeLabel(o.start, tz)}`;
      const body = o.location ? `En ${LEAD_MINUTES} min · ${o.location}` : `Empieza en ${LEAD_MINUTES} minutos`;
      const desktop = desktopBridge();
      if (desktop?.notify) desktop.notify({ title, body, url: "/agenda" });
      else if ("Notification" in window && Notification.permission === "granted") {
        const n = new Notification(title, { body, icon: "/icon-192.png", tag: `rud1-agenda-${o.key}` });
        n.onclick = () => {
          window.focus();
          router.push("/agenda");
        };
      }
    };

    const schedule = (items: AgendaOccurrence[]) => {
      for (const id of timers.current.values()) window.clearTimeout(id);
      timers.current.clear();
      const now = Date.now();
      for (const o of items) {
        if (o.allDay || o.status === "CANCELED" || o.status === "DONE" || done.has(o.key)) continue;
        const at = Date.parse(o.start) - LEAD_MINUTES * 60_000;
        if (Date.parse(o.start) < now) continue;
        const wait = Math.max(0, at - now);
        if (wait > 6 * 60 * 60 * 1000) continue;
        timers.current.set(o.key, window.setTimeout(() => fire(o), wait));
      }
    };

    let stopped = false;
    const check = async () => {
      const r = await todayAction(tz);
      if (!stopped && r.ok) schedule(r.data.today);
    };
    void check();
    const interval = window.setInterval(() => void check(), 5 * 60_000);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    const current = timers.current;
    return () => {
      stopped = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      for (const id of current.values()) window.clearTimeout(id);
    };
  }, [router, sounds]);

  return null;
}
