import "server-only";

import sanitizeHtml from "sanitize-html";

import { proxyRemoteImages } from "@/lib/image-proxy";
import { escapeHtml, linkify } from "@/lib/mail/text";
import type { MessageDetail } from "@/lib/mail/messages";

/**
 * Convierte un mensaje en el documento que se pinta dentro del marco.
 *
 * Tres capas de protección:
 *  1. sanitize-html quita scripts, formularios, marcos y atributos peligrosos.
 *  2. El marco no permite scripts (sandbox sin allow-scripts).
 *  3. El propio documento lleva una política (CSP) que no deja cargar nada de
 *     fuera. Las imágenes externas se ven siempre, pero pasan por rud1 Mail
 *     (lib/image-proxy.ts): el remitente no ve la IP ni el navegador de nadie.
 */

const REMOTE_PATTERN = /(?:src|background)\s*=\s*["']?\s*https?:|url\(\s*["']?\s*https?:/i;

const ALLOWED_TAGS = [
  ...sanitizeHtml.defaults.allowedTags,
  "img",
  "style",
  "font",
  "center",
  "span",
  "del",
  "ins",
  "s",
  "u",
  "small",
  "big",
  "sup",
  "sub",
  "colgroup",
  "col",
];

/** Limpieza de un correo recibido (para pintarlo o citarlo al responder). */
export function sanitizeIncoming(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    // Los estilos van dentro de un marco aislado y sin acceso a la red: se
    // mantienen para que los correos con diseño se vean como se enviaron.
    allowVulnerableTags: true,
    allowedAttributes: {
      "*": [
        "style",
        "class",
        "id",
        "align",
        "valign",
        "width",
        "height",
        "bgcolor",
        "background",
        "border",
        "cellpadding",
        "cellspacing",
        "color",
        "dir",
        "lang",
        "title",
        "colspan",
        "rowspan",
        "face",
        "size",
      ],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height", "style"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({
        tagName,
        attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" },
      }),
    },
  });
}

export interface RenderedMessage {
  document: string;
  hasRemoteContent: boolean;
}

/**
 * Documento completo para el marco: estilos base y política sin red.
 * `imageOrigin`: el de rud1 Mail, para las imágenes que llegan por el proxy.
 */
export function wrap(body: string, allowRemote: boolean, imageOrigin?: string): string {
  const remote = allowRemote ? " https: http:" : "";
  const own = imageOrigin ? ` ${imageOrigin}` : "";
  const csp = [
    "default-src 'none'",
    `img-src data:${own}${remote}`,
    `style-src 'unsafe-inline'${remote}`,
    `font-src data:${own}${remote}`,
  ].join("; ");
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<base target="_blank">
<style>
  html,body{margin:0;padding:0;background:#fff;color:#1f2937}
  body{padding:20px 24px;font:14px/1.55 Inter,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow-wrap:anywhere}
  img{max-width:100%;height:auto}
  pre{white-space:pre-wrap}
  blockquote{margin:0 0 0 .8ex;border-left:2px solid #d1d5db;padding-left:1ex;color:#4b5563}
  a{color:#2563eb}
</style></head><body>${body}</body></html>`;
}

/** `origin`: el de rud1 Mail tal como lo ve el navegador (https://mail.rud1.es). */
export function renderMessage(detail: MessageDetail, { origin }: { origin: string }): RenderedMessage {
  if (detail.html) {
    let html = detail.html;
    for (const [cid, dataUri] of Object.entries(detail.inlineImages)) {
      html = html.split(`cid:${cid}`).join(dataUri);
    }
    const clean = sanitizeIncoming(html);
    const hasRemoteContent = REMOTE_PATTERN.test(clean);
    return { document: wrap(proxyRemoteImages(clean), false, origin), hasRemoteContent };
  }
  const body = `<div style="white-space:pre-wrap">${linkify(escapeHtml(detail.text))}</div>`;
  return { document: wrap(body, false), hasRemoteContent: false };
}
