import "server-only";

import { Readable } from "node:stream";

import type { FileItem } from "@/lib/files";
import { getObject, objectSize } from "@/lib/storage";

/**
 * Respuesta con el contenido de un archivo: descarga o vista previa, con
 * trozos (Range) para poder ver vídeos y reanudar descargas.
 */

/** Lo que se puede ver en el navegador sin riesgo (nada que ejecute código en mail.rud1.es). */
const INLINE = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|application\/pdf|video\/(mp4|webm|ogg)|audio\/[\w.+-]+|text\/plain)$/i;

function disposition(kind: "inline" | "attachment", name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export async function fileResponse(item: FileItem, request: Request, { download }: { download: boolean }): Promise<Response> {
  const size = await objectSize(item.id);
  if (size === null) return new Response("El archivo ya no está disponible.", { status: 404 });
  const inline = !download && INLINE.test(item.mime);
  const headers: Record<string, string> = {
    "Content-Type": inline ? item.mime : "application/octet-stream",
    "Content-Disposition": disposition(inline ? "inline" : "attachment", item.name),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=0, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    // Aunque se abra suelto, no puede ejecutar nada (el visor de PDF de Chrome no abre en "sandbox").
    "Content-Security-Policy": `default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'${
      inline && item.mime === "application/pdf" ? "" : "; sandbox"
    }`,
  };

  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start);
    end = Math.min(size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const body = Readable.toWeb(getObject(item.id, { start, end })) as ReadableStream;
    return new Response(body, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const body = Readable.toWeb(getObject(item.id)) as ReadableStream;
  return new Response(body, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
}
