import "server-only";

import sanitizeHtml from "sanitize-html";

import { bodyOf } from "@/lib/mail/parts";

/**
 * Limpieza del HTML que escribe el equipo (cuerpo del mensaje, firmas,
 * cabecera y pie corporativos). Más estricta que la de los correos que llegan:
 * solo formato que los clientes de correo entienden y nada que ejecute código.
 *
 * Admite los diseños de correo hechos con tablas (los de campaña): colores de
 * fondo, degradados, esquinas, sombras y mayúsculas. En los estilos no cabe
 * ":" ni ";", así que ningún `url(...)` puede cargar nada de fuera.
 */

const STYLE = /^[\w\s#%.,()\-/'"]+$/;

export function sanitizeAuthoredHtml(html: string): string {
  // Un documento entero (pegado o abierto desde un archivo): solo cuenta el <body>.
  return sanitizeHtml(bodyOf(html), {
    allowedTags: [
      "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "del", "a",
      "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "hr", "img",
      "table", "thead", "tbody", "tr", "td", "th", "small", "sup", "sub", "code", "pre",
    ],
    // Ni el título ni lo que haya en <head> deben acabar como texto en el mensaje.
    nonTextTags: ["script", "style", "textarea", "option", "noscript", "title", "head"],
    allowedAttributes: {
      "*": ["style", "align"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height", "style", "border"],
      td: ["colspan", "rowspan", "width", "height", "valign", "style", "align", "bgcolor"],
      th: ["colspan", "rowspan", "width", "height", "valign", "style", "align", "bgcolor"],
      table: ["width", "cellpadding", "cellspacing", "border", "style", "role", "bgcolor", "align"],
    },
    allowedStyles: {
      "*": {
        color: [STYLE],
        "background-color": [STYLE],
        "text-align": [/^(left|right|center|justify)$/],
        "font-weight": [/^(normal|bold|[1-9]00)$/],
        "font-style": [/^(normal|italic)$/],
        "text-decoration": [STYLE],
        "font-size": [/^\d+(\.\d+)?(px|em|rem|%)$/],
        "font-family": [STYLE],
        "line-height": [/^[\d.]+(px|em|%)?$/],
        margin: [STYLE], "margin-top": [STYLE], "margin-bottom": [STYLE], "margin-left": [STYLE], "margin-right": [STYLE],
        padding: [STYLE], "padding-top": [STYLE], "padding-bottom": [STYLE], "padding-left": [STYLE], "padding-right": [STYLE],
        border: [STYLE], "border-top": [STYLE], "border-bottom": [STYLE], "border-left": [STYLE], "border-right": [STYLE],
        "border-radius": [STYLE], "border-collapse": [STYLE],
        width: [STYLE], "max-width": [STYLE], height: [STYLE], "vertical-align": [STYLE],
        "min-width": [STYLE], "min-height": [STYLE], "max-height": [STYLE],
        display: [/^(block|inline|inline-block|table|table-cell|none)$/], "letter-spacing": [STYLE],
        background: [STYLE], "background-image": [STYLE],
        "box-shadow": [STYLE],
        "text-transform": [/^(none|uppercase|lowercase|capitalize)$/],
        overflow: [/^(hidden|visible|auto)$/],
        "white-space": [/^(normal|nowrap|pre|pre-wrap|pre-line)$/],
        "word-break": [/^(normal|break-all|keep-all|break-word)$/],
        opacity: [/^(0|1|0?\.\d+)$/],
        "table-layout": [/^(auto|fixed)$/],
        "mso-hide": [/^all$/],
      },
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https", "data"] },
    allowProtocolRelative: false,
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, target: "_blank", rel: "noopener noreferrer" } }),
    },
  });
}

/** ¿El HTML tiene algo de contenido (texto o imagen), o es solo `<p></p>`? */
export function hasContent(html: string): boolean {
  return /<img\b/i.test(html) || sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;|\s/g, "") !== "";
}
