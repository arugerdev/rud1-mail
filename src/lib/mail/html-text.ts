import { convert } from "html-to-text";

/**
 * Texto plano de un correo HTML, para los que no traen parte de texto (muchas
 * facturas de proveedores, avisos de bancos y de la Administración): sin
 * imágenes y sin pasar los títulos a mayúsculas.
 *
 * Esto vive aparte de messages.ts (que importa "server-only") para poder
 * probarlo con correos reales.
 */

/**
 * Ojo: html-to-text lanza «Following selectors have no specified format» si una
 * entrada no trae `format` y no es uno de sus selectores por defecto (h1…h6
 * sí lo son, th no). Con `th` aquí, TODO correo solo-HTML daba un 500 al
 * abrirlo y al responderlo citando el original (A-53).
 */
export const HTML_TO_TEXT_SELECTORS = [
  { selector: "img", format: "skip" },
  ...["h1", "h2", "h3", "h4", "h5", "h6"].map((selector) => ({
    selector,
    options: { uppercase: false },
  })),
];

/**
 * Convierte el HTML en texto. Nunca lanza: un HTML que html-to-text no sepa
 * leer no puede tumbar la página del mensaje ni el envío de una respuesta, así
 * que cae al texto que traiga el correo (aunque esté vacío). `run` es para las
 * pruebas.
 */
export function htmlToPlainText(html: string, fallback = "", run: typeof convert = convert): string {
  try {
    return run(html, { wordwrap: false, selectors: HTML_TO_TEXT_SELECTORS });
  } catch (error) {
    console.error("[correo] no se pudo sacar el texto del HTML del mensaje:", error);
    return fallback;
  }
}

/**
 * El texto de un mensaje: el suyo si lo trae y, si no, el sacado de su HTML.
 */
export function messageText(parsed: { text?: string | false | null; html?: string | false | null }): string {
  if (typeof parsed.text === "string" && parsed.text.trim()) return parsed.text;
  const fallback = typeof parsed.text === "string" ? parsed.text : "";
  return typeof parsed.html === "string" ? htmlToPlainText(parsed.html, fallback) : "";
}
