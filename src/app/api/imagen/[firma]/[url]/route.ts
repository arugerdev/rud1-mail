import { fetchImage, verifyProxiedImage } from "@/lib/image-proxy";

/**
 * Imágenes externas de los correos, servidas por rud1 Mail (ver
 * lib/image-proxy.ts). No pide sesión: el marco del correo no tiene origen
 * propio y no envía la cookie; la firma de la dirección hace de permiso.
 */

export const runtime = "nodejs";

const SAFE_HEADERS = {
  // Aunque alguien abra la imagen suelta (un SVG, por ejemplo), no ejecuta nada.
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "x-content-type-options": "nosniff",
  "cross-origin-resource-policy": "cross-origin",
  "referrer-policy": "no-referrer",
};

export async function GET(_request: Request, { params }: { params: Promise<{ firma: string; url: string }> }) {
  const { firma, url } = await params;
  const target = verifyProxiedImage(firma, url);
  if (!target) return new Response("No encontrada", { status: 404, headers: SAFE_HEADERS });

  const image = await fetchImage(target).catch(() => null);
  if (!image) {
    // Hueco transparente de 1×1 (como haría el cliente de correo con una imagen rota), cacheado poco.
    const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
    return new Response(new Uint8Array(pixel), {
      status: 200,
      headers: { ...SAFE_HEADERS, "content-type": "image/gif", "cache-control": "public, max-age=300" },
    });
  }
  return new Response(new Uint8Array(image.body), {
    status: 200,
    headers: {
      ...SAFE_HEADERS,
      "content-type": image.contentType,
      "content-length": String(image.body.length),
      "cache-control": "public, max-age=604800, immutable",
    },
  });
}
