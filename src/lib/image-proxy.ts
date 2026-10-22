import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { config } from "@/lib/config";

/**
 * Imágenes de los correos a través de rud1 Mail: el navegador nunca habla con
 * el servidor del remitente (no ve tu IP ni tu navegador), y así las imágenes
 * se pueden enseñar siempre sin pulsar "Mostrar imágenes".
 *
 * Las direcciones van firmadas: el proxy solo sirve imágenes que rud1 Mail ha
 * puesto en un correo, no cualquier cosa que alguien le pida.
 */

const MAX_BYTES = 15 * 1024 * 1024;
const TIMEOUT_MS = 12_000;
const MAX_REDIRECTS = 4;
const ALLOWED_TYPE = /^(image\/[\w.+-]+|font\/[\w.+-]+|application\/(font-[\w.+-]+|x-font-[\w.+-]+|vnd\.ms-fontobject))$/i;

function signature(url: string): string {
  return createHmac("sha256", config.sessionSecret).update(`imagen:${url}`).digest("base64url").slice(0, 32);
}

/** Ruta del proxy para una imagen externa: /api/imagen/<firma>/<url en base64url>. */
export function proxiedImageUrl(url: string): string {
  return `/api/imagen/${signature(url)}/${Buffer.from(url).toString("base64url")}`;
}

export function verifyProxiedImage(sig: string, encoded: string): string | null {
  let url: string;
  try {
    url = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const expected = Buffer.from(signature(url));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return /^https?:\/\//i.test(url) ? url : null;
}

/** Direcciones de la red interna (Docker, Mailcow, el propio servidor): prohibidas. */
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = address.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);
  return /^(fc|fd|fe[89ab]|ff)/.test(v6);
}

async function assertPublicHost(url: URL): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("protocolo");
  if (url.port && !["80", "443", "8080", "8443"].includes(url.port)) throw new Error("puerto");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateAddress(a.address))) throw new Error("red interna");
}

export interface FetchedImage {
  body: Buffer;
  contentType: string;
}

/**
 * Descarga la imagen, comprobando en cada salto (redirecciones incluidas) que
 * no apunta a la red interna, con tiempo y tamaño máximos.
 */
export async function fetchImage(rawUrl: string): Promise<FetchedImage | null> {
  let url = new URL(rawUrl);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicHost(url);
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        // Algunos servidores de imágenes no responden sin un navegador "normal".
        "user-agent": "Mozilla/5.0 (compatible; rud1Mail-ImageProxy/1.0; +https://mail.rud1.es)",
        accept: "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) return null;
      url = new URL(location, url);
      continue;
    }
    if (!response.ok || !response.body) return null;
    const contentType = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!ALLOWED_TYPE.test(contentType)) return null;
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_BYTES) return null;

    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      size += chunk.length;
      if (size > MAX_BYTES) return null;
      chunks.push(Buffer.from(chunk));
    }
    return { body: Buffer.concat(chunks), contentType };
  }
  return null;
}

/**
 * Cambia las imágenes externas de un correo (ya limpio) por las del proxy:
 * <img src>, el atributo background y url(...) en estilos.
 */
export function proxyRemoteImages(html: string): string {
  const decode = (s: string) => s.replace(/&amp;/g, "&");
  return html
    .replace(/(<img\b[^>]*?\ssrc=")(https?:[^"]+)(")/gi, (_m, a: string, url: string, b: string) => `${a}${proxiedImageUrl(decode(url))}${b}`)
    .replace(/(\sbackground=")(https?:[^"]+)(")/gi, (_m, a: string, url: string, b: string) => `${a}${proxiedImageUrl(decode(url))}${b}`)
    // En atributos style las comillas llegan como &quot;; en <style>, tal cual.
    .replace(/url\(\s*&quot;(https?:.*?)&quot;\s*\)/gi, (_m, url: string) => `url(&quot;${proxiedImageUrl(decode(url.trim()))}&quot;)`)
    .replace(/url\(\s*(["']?)(https?:[^"')]+)\1\s*\)/gi, (_m, q: string, url: string) => `url(${q}${proxiedImageUrl(decode(url.trim()))}${q})`);
}
