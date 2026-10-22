"use client";

/** Lo que expone la app de escritorio a la página (desktop/src/preload.ts). */

export type DesktopUpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "up-to-date"; checkedAt: number }
  | { state: "available"; version: string }
  | { state: "downloading"; version: string; percent: number }
  | { state: "ready"; version: string }
  | { state: "error"; message: string };

export interface DesktopUpdateInfo {
  version: string;
  autoUpdate: boolean;
  canInstall: boolean;
  status: DesktopUpdateStatus;
}

export interface DesktopBridge {
  isDesktop: true;
  focus: () => void;
  /** Desde la 0.2.0: avisos del sistema mostrados por la propia app. */
  notify?: (payload: { title: string; body?: string; url?: string }) => void;
  notifyStatus?: () => Promise<{ error: string | null } | null>;
  onNotifyFailed?: (callback: (error: string) => void) => () => void;
  openNotificationSettings?: () => void;
  updates?: {
    get: () => Promise<DesktopUpdateInfo | null>;
    check: () => Promise<DesktopUpdateInfo | null>;
    setAuto: (enabled: boolean) => Promise<DesktopUpdateInfo | null>;
    install: () => Promise<DesktopUpdateInfo | null>;
    onChange: (callback: (info: DesktopUpdateInfo) => void) => () => void;
  };
}

export function desktopBridge(): DesktopBridge | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { rud1Desktop?: DesktopBridge }).rud1Desktop;
}
