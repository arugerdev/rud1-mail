"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { setAppBadge } from "../pwa";
import { mailHref } from "./nav";

interface InboxState {
  unread: number;
  latest: { uid: number; from: string; subject: string } | null;
}

const POLL_MS = 60_000;

async function notify(state: NonNullable<InboxState["latest"]>) {
  const title = state.from ? `Correo de ${state.from}` : "Correo nuevo";
  const options: NotificationOptions = {
    body: state.subject,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    tag: `rud1-mail-${state.uid}`,
    data: { url: mailHref({ mensaje: state.uid }) },
  };
  // Con el service worker, pulsar el aviso trae la app al frente aunque esté cerrada la pestaña.
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  if (registration) await registration.showNotification(title, options);
  else new Notification(title, options);
}

/**
 * Vigila la bandeja de entrada mientras rud1 Mail está abierto (aunque esté en
 * segundo plano): pone el contador en el icono de la app, avisa del correo
 * nuevo si se han activado los avisos, y refresca la vista si está a la vista.
 */
export function useMailWatcher() {
  const router = useRouter();
  const lastUid = React.useRef<number | null>(null);

  React.useEffect(() => {
    let stopped = false;

    const check = async () => {
      let state: InboxState;
      try {
        const res = await fetch("/api/estado", { cache: "no-store" });
        if (!res.ok) return;
        state = (await res.json()) as InboxState;
      } catch {
        return;
      }
      if (stopped) return;
      setAppBadge(state.unread);

      const latest = state.latest;
      const isNew = latest !== null && lastUid.current !== null && latest.uid > lastUid.current;
      if (latest) lastUid.current = Math.max(lastUid.current ?? 0, latest.uid);

      const visible = document.visibilityState === "visible";
      if (visible) router.refresh();
      if (
        isNew &&
        latest &&
        (!visible || !document.hasFocus()) &&
        "Notification" in window &&
        Notification.permission === "granted"
      ) {
        void notify(latest).catch(() => undefined);
      }
    };

    void check();
    const timer = window.setInterval(check, POLL_MS);
    const onFocus = () => void check();
    window.addEventListener("focus", onFocus);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [router]);
}

export type NotificationState = "unsupported" | "default" | "granted" | "denied";

export function useNotificationPermission(): [NotificationState, () => Promise<void>] {
  const [state, setState] = React.useState<NotificationState>("unsupported");
  React.useEffect(() => {
    if ("Notification" in window) setState(Notification.permission as NotificationState);
  }, []);
  const request = React.useCallback(async () => {
    if (!("Notification" in window)) return;
    setState((await Notification.requestPermission()) as NotificationState);
  }, []);
  return [state, request];
}
