import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { config } from "@/lib/config";
import { BRAND_ASSETS } from "@/lib/templates";

/**
 * Las imágenes de marca (logo de la firma y de la cabecera) y las pegadas en
 * el mensaje viajan dentro del correo (cid:), no como enlaces: así se ven en
 * Outlook, Gmail o el móvil aunque bloqueen las imágenes externas, y Gmail no
 * enseña las data: que deja el editor.
 */

export interface InlineImage {
  filename: string;
  contentType: string;
  content: Buffer;
  cid: string;
}

const MARCA_DIR = path.join(process.cwd(), "public", "marca");
const DATA_URI = /^data:(image\/(?:png|jpe?g|gif|webp));base64,([A-Za-z0-9+/=\s]+)$/i;
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/jpg": "jpg", "image/gif": "gif", "image/webp": "webp" };

async function load(src: string): Promise<{ content: Buffer; contentType: string; name: string } | null> {
  const data = src.match(DATA_URI);
  if (data) {
    const contentType = data[1].toLowerCase();
    return { content: Buffer.from(data[2].replace(/\s/g, ""), "base64"), contentType, name: `imagen.${EXT[contentType] ?? "png"}` };
  }
  if (src.startsWith(`${BRAND_ASSETS}/`)) {
    const name = src.slice(BRAND_ASSETS.length + 1).split(/[?#]/)[0];
    if (!/^[\w.-]+\.(png|jpe?g|gif|webp)$/i.test(name)) return null;
    try {
      const content = await readFile(path.join(MARCA_DIR, name));
      const ext = name.split(".").pop()!.toLowerCase();
      return { content, contentType: ext === "jpg" || ext === "jpeg" ? "image/jpeg" : `image/${ext}`, name };
    } catch {
      return null;
    }
  }
  return null;
}

/** Cambia esas imágenes por cid: y devuelve los adjuntos en línea que necesitan. */
export async function embedImages(html: string): Promise<{ html: string; images: InlineImage[] }> {
  const images = new Map<string, InlineImage>();
  const sources = new Set<string>();
  for (const m of html.matchAll(/<img\b[^>]*?\ssrc="([^"]+)"/gi)) sources.add(m[1]);

  const replacements = new Map<string, string>();
  for (const raw of sources) {
    const src = raw.replace(/&amp;/g, "&");
    const loaded = await load(src);
    if (!loaded) continue;
    // La misma imagen dos veces (p. ej. el logo en cabecera y firma) va una sola vez.
    const hash = createHash("sha1").update(loaded.content).digest("hex").slice(0, 16);
    const cid = `${hash}@${config.domain}`;
    if (!images.has(cid)) images.set(cid, { filename: loaded.name, contentType: loaded.contentType, content: loaded.content, cid });
    replacements.set(raw, `cid:${cid}`);
  }
  if (replacements.size === 0) return { html, images: [] };
  const out = html.replace(/(<img\b[^>]*?\ssrc=")([^"]+)(")/gi, (m, a: string, src: string, b: string) => {
    const cid = replacements.get(src);
    return cid ? `${a}${cid}${b}` : m;
  });
  return { html: out, images: [...images.values()] };
}
