"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { setAppBadge } from "../pwa";
import { desktopBridge } from "./desktop-bridge";
import { useSounds } from "./sound-provider";
import { onServerVersion } from "./version-reload";
import { mailHref } from "./nav";

interface NewMail {
  uid: number | null;
  from: string;
  address: string;
  subject: string;
}

type Counts = Record<string, { unread: number; total: number }>;

export interface WatcherPrefs {
  notify: boolean;
}

async function notify(mail: NewMail, open: (url: string) => void, override?: { title: string; url: string }) {
  const title = override?.title ?? (mail.from ? `Correo de ${mail.from}` : "Correo nuevo");
  const url = override?.url ?? (mail.uid ? mailHref({ mensaje: mail.uid }) : "/");
  const options: NotificationOptions = {
    body: mail.subject,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `rud1-mail-${mail.uid ?? Date.now()}`,
    data: { url },
  };
  // En la app de escritorio el aviso lo muestra la propia app (al pulsarlo
  // trae la ventana al frente y abre el mensaje).
  const desktop = desktopBridge();
  if (desktop?.notify) {
    desktop.notify({ title, body: mail.subject, url });
    return;
  }
  if (desktop) {
    const n = new Notification(title, options);
    n.onclick = () => {
      desktop.focus();
      open(url);
    };
    return;
  }
  // Con el service worker, pulsar el aviso trae la app al frente aunque la pestaña no esté a la vista.
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (registration) await registration.showNotification(title, options);
  else new Notification(title, options);
}

/** En la app de escritorio no hace falta el permiso del navegador. */
function canNotify(): boolean {
  if (desktopBridge()?.notify) return true;
  return "Notification" in window && Notification.permission === "granted";
}

export type LiveState = "conectando" | "en-directo" | "sin-conexion";

/**
 * Mantiene rud1 Mail al día en tiempo real: escucha el canal de eventos del
 * servidor, refresca la vista cuando algo cambia, pone el contador en el icono
 * de la app y avisa del correo nuevo. Si el canal se cae, se reconecta solo
 * (y mientras tanto pregunta cada minuto).
 */
export function useMailWatcher(prefs: WatcherPrefs, sharedNames: Record<string, string> = {}): LiveState {
  const router = useRouter();
  const sounds = useSounds();
  const [state, setState] = React.useState<LiveState>("conectando");
  const prefsRef = React.useRef(prefs);
  prefsRef.current = prefs;
  const namesRef = React.useRef(sharedNames);
  namesRef.current = sharedNames;

  React.useEffect(() => {
    let source: EventSource | null = null;
    let retry: number | undefined;
    let fallback: number | undefined;
    let refreshTimer: number | undefined;
    let lastCounts = "";
    // Sin leer de cada buzón común la última vez: si sube, ha llegado correo ahí.
    let sharedUnread: Record<string, number> | null = null;
    let stopped = false;

    // Varios cambios seguidos (p. ej. marcar diez como leídos) = una sola recarga.
    const refreshSoon = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => router.refresh(), 300);
    };

    const connect = () => {
      if (stopped) return;
      setState("conectando");
      source = new EventSource("/api/eventos");
      source.addEventListener("listo", (event) => {
        onServerVersion((JSON.parse((event as MessageEvent).data) as { version?: string }).version);
        setState("en-directo");
        window.clearInterval(fallback);
      });
      source.addEventListener("nuevo", (event) => {
        const mail = JSON.parse((event as MessageEvent).data) as NewMail;
        refreshSoon();
        const away = document.visibilityState !== "visible" || !document.hasFocus();
        sounds.play("nuevo");
        if (away && prefsRef.current.notify && canNotify()) {
          void notify(mail, (url) => router.push(url)).catch(() => undefined);
        }
      });
      source.addEventListener("cambio", refreshSoon);
      source.addEventListener("contadores", (event) => {
        const raw = (event as MessageEvent).data as string;
        const counts = JSON.parse(raw) as Counts;
        setAppBadge(counts.INBOX?.unread ?? 0);

        const nowShared: Record<string, number> = {};
        for (const [path, c] of Object.entries(counts)) {
          if (/^Shared\/[^/]+\/INBOX$/.test(path)) nowShared[path] = c.unread;
        }
        if (sharedUnread) {
          for (const [path, unread] of Object.entries(nowShared)) {
            if (unread <= (sharedUnread[path] ?? 0)) continue;
            const owner = path.split("/")[1];
            const name = namesRef.current[owner] ?? owner;
            const away = document.visibilityState !== "visible" || !document.hasFocus();
            sounds.play("comun");
            if (away && prefsRef.current.notify && canNotify()) {
              void notify({ uid: null, from: "", address: "", subject: `Ha llegado correo a ${owner}` }, (url) => router.push(url), {
                title: `Correo nuevo en ${name}`,
                url: mailHref({ carpeta: path }),
              }).catch(() => undefined);
            }
          }
        }
        sharedUnread = nowShared;
        if (lastCounts && raw !== lastCounts) refreshSoon();
        lastCounts = raw;
      });
      source.onerror = () => {
        source?.close();
        setState("sin-conexion");
        // Mientras no vuelve el canal, se pregunta cada minuto.
        window.clearInterval(fallback);
        fallback = window.setInterval(() => {
          if (document.visibilityState === "visible") router.refresh();
        }, 60_000);
        retry = window.setTimeout(connect, 5_000);
      };
    };

    connect();
    const onFocus = () => refreshSoon();
    window.addEventListener("focus", onFocus);
    // Al pulsar un aviso de la app de escritorio, abre lo que avisaba.
    const onNavigate = (event: Event) => {
      const url = (event as CustomEvent<{ url?: string }>).detail?.url;
      if (url?.startsWith("/") && !url.startsWith("//")) router.push(url);
    };
    window.addEventListener("rud1-desktop:navigate", onNavigate);
    return () => {
      stopped = true;
      source?.close();
      window.clearTimeout(retry);
      window.clearTimeout(refreshTimer);
      window.clearInterval(fallback);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("rud1-desktop:navigate", onNavigate);
    };
  }, [router, sounds]);

  return state;
}

export type NotificationState = "unsupported" | "default" | "granted" | "denied";

export function useNotificationPermission(): [NotificationState, () => Promise<void>] {
  const [state, setState] = React.useState<NotificationState>("unsupported");
  React.useEffect(() => {
    if (desktopBridge()?.notify) setState("granted");
    else if ("Notification" in window) setState(Notification.permission as NotificationState);
  }, []);
  const request = React.useCallback(async () => {
    if (!("Notification" in window)) return;
    setState((await Notification.requestPermission()) as NotificationState);
  }, []);
  return [state, request];
}
