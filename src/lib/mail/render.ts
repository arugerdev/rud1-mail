import "server-only";

import sanitizeHtml from "sanitize-html";

import { escapeHtml, linkify } from "@/lib/mail/text";
import type { MessageDetail } from "@/lib/mail/messages";

/**
 * Convierte un mensaje en el documento que se pinta dentro del marco.
 *
 * Tres capas de protección:
 *  1. sanitize-html quita scripts, formularios, marcos y atributos peligrosos.
 *  2. El marco no permite scripts (sandbox sin allow-scripts).
 *  3. El propio documento lleva una política (CSP) que no deja cargar nada de
 *     fuera: ni imágenes de seguimiento ni hojas de estilo remotas, salvo que la
 *     persona pulse "Mostrar imágenes".
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

function sanitize(html: string): string {
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

function wrap(body: string, allowRemote: boolean): string {
  const remote = allowRemote ? " https: http:" : "";
  const csp = [
    "default-src 'none'",
    `img-src data:${remote}`,
    `style-src 'unsafe-inline'${remote}`,
    `font-src data:${remote}`,
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

export function renderMessage(detail: MessageDetail, { allowRemote = false } = {}): RenderedMessage {
  if (detail.html) {
    let html = detail.html;
    for (const [cid, dataUri] of Object.entries(detail.inlineImages)) {
      html = html.split(`cid:${cid}`).join(dataUri);
    }
    const clean = sanitize(html);
    return { document: wrap(clean, allowRemote), hasRemoteContent: REMOTE_PATTERN.test(clean) };
  }
  const body = `<div style="white-space:pre-wrap">${linkify(escapeHtml(detail.text))}</div>`;
  return { document: wrap(body, allowRemote), hasRemoteContent: false };
}
