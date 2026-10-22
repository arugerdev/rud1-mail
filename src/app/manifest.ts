import type { MetadataRoute } from "next";

/**
 * Manifiesto de la app instalable: con él, Chrome y Edge (Windows, macOS,
 * Linux, ChromeOS, Android) ofrecen "Instalar rud1 Mail", y Safari la añade a
 * la pantalla de inicio en iPhone y iPad.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "rud1 Mail",
    short_name: "rud1 Mail",
    description: "Correo de rud1",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0e17",
    theme_color: "#0a0e17",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      {
        name: "Redactar",
        short_name: "Redactar",
        url: "/?redactar=1",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "Bandeja de entrada",
        short_name: "Entrada",
        url: "/",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
    // Con la app instalada, Windows y macOS pueden usarla para los enlaces
    // "mailto:" (se elige en la configuración de apps predeterminadas).
    protocol_handlers: [{ protocol: "mailto", url: "/?mailto=%s" }],
  } as MetadataRoute.Manifest;
}
