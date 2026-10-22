import { contextBridge, ipcRenderer } from "electron";

/**
 * Puente mínimo con la página: la página sabe que va dentro de la app de
 * escritorio, pide avisos del sistema y que la ventana pase al frente, y
 * maneja los ajustes de actualización.
 * La app, a su vez, le pide abrir el redactor (menú, bandeja, mailto:).
 */
contextBridge.exposeInMainWorld("rud1Desktop", {
  isDesktop: true,
  focus: () => ipcRenderer.send("rud1:focus"),
  /** Aviso del sistema; al pulsarlo se abre `url` (ruta de la app). */
  notify: (payload: { title: string; body?: string; url?: string }) => ipcRenderer.send("rud1:notify", payload),
  /** Si el sistema rechazó el último aviso, por qué. */
  notifyStatus: () => ipcRenderer.invoke("rud1:notify:status"),
  onNotifyFailed: (callback: (error: string) => void) => {
    const listener = (_event: unknown, error: string) => callback(error);
    ipcRenderer.on("rud1:notify-failed", listener);
    return () => ipcRenderer.removeListener("rud1:notify-failed", listener);
  },
  openNotificationSettings: () => ipcRenderer.send("rud1:notify:settings"),
  updates: {
    get: () => ipcRenderer.invoke("rud1:updates:get"),
    check: () => ipcRenderer.invoke("rud1:updates:check"),
    setAuto: (enabled: boolean) => ipcRenderer.invoke("rud1:updates:auto", enabled),
    install: () => ipcRenderer.invoke("rud1:updates:install"),
    onChange: (callback: (info: unknown) => void) => {
      const listener = (_event: unknown, info: unknown) => callback(info);
      ipcRenderer.on("rud1:updates", listener);
      return () => ipcRenderer.removeListener("rud1:updates", listener);
    },
  },
});

ipcRenderer.on("rud1:navigate", (_event, url: string) => {
  window.dispatchEvent(new CustomEvent("rud1-desktop:navigate", { detail: { url } }));
});

ipcRenderer.on("rud1:compose", (_event, mailto: string | null) => {
  window.dispatchEvent(new CustomEvent("rud1-desktop:compose", { detail: { mailto } }));
});
