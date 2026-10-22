import { contextBridge, ipcRenderer } from "electron";

/**
 * Puente mínimo con la página: la página sabe que va dentro de la app de
 * escritorio y puede pedir que la ventana pase al frente (al pulsar un aviso).
 * La app, a su vez, le pide abrir el redactor (menú, bandeja, mailto:).
 */
contextBridge.exposeInMainWorld("rud1Desktop", {
  isDesktop: true,
  focus: () => ipcRenderer.send("rud1:focus"),
});

ipcRenderer.on("rud1:compose", (_event, mailto: string | null) => {
  window.dispatchEvent(new CustomEvent("rud1-desktop:compose", { detail: { mailto } }));
});
