import "server-only";

import sanitizeHtml from "sanitize-html";

/**
 * Limpieza del HTML que escribe el equipo (cuerpo del mensaje, firmas,
 * cabecera y pie corporativos). Más estricta que la de los correos que llegan:
 * solo formato que los clientes de correo entienden y nada que ejecute código.
 */

const STYLE = /^[\w\s#%.,()\-/'"]+$/;

export function sanitizeAuthoredHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "del", "a",
      "ul", "ol", "li", "blockquote", "h1", "h2", "h3", "hr", "img",
      "table", "thead", "tbody", "tr", "td", "th", "small", "sup", "sub", "code", "pre",
    ],
    allowedAttributes: {
      "*": ["style", "align"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height", "style"],
      td: ["colspan", "rowspan", "width", "valign", "style", "align", "bgcolor"],
      th: ["colspan", "rowspan", "width", "valign", "style", "align"],
      table: ["width", "cellpadding", "cellspacing", "border", "style", "role"],
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
        display: [/^(block|inline|inline-block|table|none)$/], "letter-spacing": [STYLE],
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
