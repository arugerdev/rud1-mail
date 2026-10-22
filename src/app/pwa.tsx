"use client";

import * as React from "react";

/**
 * Todo lo de la app instalable: registrar el service worker, ofrecer
 * "Instalar rud1 Mail" cuando el navegador lo permite, y saber si ya se está
 * usando como app.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaContextValue {
  /** El navegador deja instalarla con un clic (Chrome, Edge…). */
  canInstall: boolean;
  /** Ya se está usando como app instalada. */
  standalone: boolean;
  /** iPhone o iPad: allí se instala a mano desde el menú Compartir de Safari. */
  isIos: boolean;
  install: () => Promise<void>;
}

const PwaContext = React.createContext<PwaContextValue>({
  canInstall: false,
  standalone: false,
  isIos: false,
  install: async () => undefined,
});

export function usePwa(): PwaContextValue {
  return React.useContext(PwaContext);
}

function detectStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function PwaProvider({ children }: { children: React.ReactNode }) {
  const [promptEvent, setPromptEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  const [standalone, setStandalone] = React.useState(false);
  const [isIos, setIsIos] = React.useState(false);

  React.useEffect(() => {
    setStandalone(detectStandalone());
    setIsIos(/iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

    // En desarrollo no: el código cambia en cada guardado y la caché lo estropearía.
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((error) => {
        console.warn("[pwa] no se pudo registrar el service worker", error);
      });
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setStandalone(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = React.useCallback(async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => undefined);
    setPromptEvent(null);
  }, [promptEvent]);

  const value = React.useMemo(
    () => ({ canInstall: Boolean(promptEvent) && !standalone, standalone, isIos, install }),
    [promptEvent, standalone, isIos, install],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

/** Número de correos sin leer en el icono de la app (barra de tareas, Dock). */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  if (count > 0) nav.setAppBadge?.(count).catch(() => undefined);
  else nav.clearAppBadge?.().catch(() => undefined);
}
