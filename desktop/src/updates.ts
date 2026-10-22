import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { app, BrowserWindow, Notification, shell } from "electron";
import { autoUpdater } from "electron-updater";

/**
 * Actualizaciones de la app de escritorio, desde las Releases públicas de
 * GitHub (etiquetas escritorio-vX.Y.Z; ver .github/workflows/escritorio.yml).
 *
 * - Windows (instalador) y Linux (AppImage): con la actualización automática
 *   activada, se descarga sola y se instala sin preguntar en cuanto la ventana
 *   no está en uso (oculta o en segundo plano). La app vuelve a abrirse sola.
 * - macOS (sin firmar, no puede instalarse sola) y Linux .deb: avisa de que
 *   hay versión nueva y lleva a la descarga.
 */

const RELEASES = "https://github.com/arugerdev/rud1-mail/releases/latest";
/** Cada cuánto se mira si hay versión nueva. */
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "up-to-date"; checkedAt: number }
  | { state: "available"; version: string }
  | { state: "downloading"; version: string; percent: number }
  | { state: "ready"; version: string }
  | { state: "error"; message: string };

export interface UpdateInfo {
  version: string;
  autoUpdate: boolean;
  /** false si esta instalación no puede actualizarse sola (macOS, .deb). */
  canInstall: boolean;
  status: UpdateStatus;
}

interface Settings {
  autoUpdate: boolean;
}

const settingsFile = () => path.join(app.getPath("userData"), "ajustes.json");

function loadSettings(): Settings {
  try {
    return { autoUpdate: true, ...(JSON.parse(readFileSync(settingsFile(), "utf8")) as Partial<Settings>) };
  } catch {
    return { autoUpdate: true };
  }
}

function saveSettings(settings: Settings): void {
  try {
    writeFileSync(settingsFile(), JSON.stringify(settings));
  } catch {
    // Sin poder guardarlo, se queda como estaba al abrir.
  }
}

/** Solo el instalador de Windows y el AppImage se pueden sustituir solos. */
function installable(): boolean {
  if (!app.isPackaged) return false;
  if (process.platform === "win32") return true;
  if (process.platform === "linux") return Boolean(process.env.APPIMAGE);
  return false;
}

export class Updates {
  private settings = loadSettings();
  private status: UpdateStatus = { state: "idle" };
  private timer: NodeJS.Timeout | undefined;
  private notifiedVersion: string | null = null;
  private waitingForIdle = false;
  private installing = false;

  constructor(
    private readonly getWindow: () => BrowserWindow | null,
    private readonly onChange: (info: UpdateInfo) => void,
    private readonly beforeInstall: () => void,
  ) {}

  info(): UpdateInfo {
    return {
      version: app.getVersion(),
      autoUpdate: this.settings.autoUpdate,
      canInstall: installable(),
      status: this.status,
    };
  }

  start(): void {
    if (!app.isPackaged) return;
    autoUpdater.autoDownload = installable() && this.settings.autoUpdate;
    autoUpdater.autoInstallOnAppQuit = installable();
    autoUpdater.allowPrerelease = false;
    autoUpdater.allowDowngrade = false;

    autoUpdater.on("checking-for-update", () => this.set({ state: "checking" }));
    autoUpdater.on("update-not-available", () => this.set({ state: "up-to-date", checkedAt: Date.now() }));
    autoUpdater.on("update-available", (info) => {
      this.set({ state: "available", version: info.version });
      if (!installable() || !this.settings.autoUpdate) this.announce(info.version);
    });
    autoUpdater.on("download-progress", (p) => {
      const version = "version" in this.status ? this.status.version : "";
      this.set({ state: "downloading", version, percent: Math.round(p.percent) });
    });
    autoUpdater.on("update-downloaded", (info) => {
      this.set({ state: "ready", version: info.version });
      if (this.settings.autoUpdate) this.installWhenIdle();
    });
    autoUpdater.on("error", (error) => {
      this.set({ state: "error", message: error?.message ?? String(error) });
    });

    // Un poco después de abrir (no compite con la carga del correo) y cada 4 horas.
    setTimeout(() => void this.check(), 15_000);
    this.timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
  }

  stop(): void {
    clearInterval(this.timer);
  }

  async check(): Promise<UpdateInfo> {
    if (!app.isPackaged) {
      this.set({ state: "error", message: "Las actualizaciones solo funcionan en la app instalada" });
      return this.info();
    }
    if (this.status.state === "downloading" || this.status.state === "ready") return this.info();
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      this.set({ state: "error", message: error instanceof Error ? error.message : String(error) });
    }
    return this.info();
  }

  setAutoUpdate(enabled: boolean): UpdateInfo {
    this.settings = { ...this.settings, autoUpdate: enabled };
    saveSettings(this.settings);
    autoUpdater.autoDownload = installable() && enabled;
    if (enabled) {
      if (this.status.state === "ready") this.installWhenIdle();
      else if (this.status.state === "available" && installable()) void autoUpdater.downloadUpdate().catch(() => undefined);
    }
    this.onChange(this.info());
    return this.info();
  }

  /** Instalar ya (botón "Reiniciar y actualizar", o descargar si aún no está). */
  async installNow(): Promise<void> {
    if (!installable()) {
      void shell.openExternal(RELEASES);
      return;
    }
    if (this.status.state === "ready") {
      this.install();
      return;
    }
    if (this.status.state === "available") await autoUpdater.downloadUpdate();
  }

  private set(status: UpdateStatus): void {
    this.status = status;
    this.onChange(this.info());
  }

  private install(): void {
    if (this.installing) return;
    this.installing = true;
    this.beforeInstall();
    // Silencioso y vuelve a abrir la app al terminar.
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  }

  /**
   * Instala sin molestar: si la ventana está oculta o en segundo plano, ya;
   * si se está usando, en cuanto deje de usarse.
   */
  private installWhenIdle(): void {
    const win = this.getWindow();
    const inUse = () => {
      const w = this.getWindow();
      return Boolean(w && w.isVisible() && !w.isMinimized() && w.isFocused());
    };
    if (!inUse()) {
      this.install();
      return;
    }
    if (this.waitingForIdle || !win) return;
    this.waitingForIdle = true;
    const onIdle = () => {
      // Un margen por si solo ha cambiado de ventana un momento.
      setTimeout(() => {
        if (inUse()) return;
        win.removeListener("blur", onIdle);
        win.removeListener("hide", onIdle);
        win.removeListener("minimize", onIdle);
        this.install();
      }, 60_000);
    };
    win.on("blur", onIdle);
    win.on("hide", onIdle);
    win.on("minimize", onIdle);
  }

  /** Aviso de versión nueva cuando no se instala sola. */
  private announce(version: string): void {
    if (this.notifiedVersion === version || !Notification.isSupported()) return;
    this.notifiedVersion = version;
    const n = new Notification({
      title: `rud1 Mail ${version} disponible`,
      body: installable() ? "Pulsa para instalarla ahora." : "Pulsa para descargar la nueva versión.",
    });
    n.on("click", () => void this.installNow());
    n.show();
  }
}
