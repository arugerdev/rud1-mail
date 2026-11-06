/**
 * Cabecera, firma y pie de cada mensaje.
 *
 * Por defecto un mensaje lleva la cabecera y el pie de rud1 (si administración
 * los tiene activos) y la firma de quien escribe. Al redactar se puede quitar
 * cualquiera de las tres o cambiarla solo para ese mensaje, sin tocar la de
 * siempre. Este módulo no depende del servidor: lo usan el redactor y el
 * montaje del mensaje.
 */

export type PartKey = "header" | "signature" | "footer";

export const PART_KEYS: readonly PartKey[] = ["header", "signature", "footer"];

export const PART_LABELS: Record<PartKey, { title: string; include: string }> = {
  header: { title: "Cabecera", include: "Poner la cabecera de rud1" },
  signature: { title: "Firma", include: "Poner tu firma" },
  footer: { title: "Pie", include: "Poner el pie de rud1" },
};

/** Lo que se ha elegido en un mensaje para una de las tres partes. */
export interface MessagePart {
  include: boolean;
  /** Versión solo para este mensaje; `null` es la de siempre. */
  html: string | null;
}

export type MessageParts = Partial<Record<PartKey, MessagePart>>;

/** Lo que llevaría el mensaje sin tocar nada. */
export interface PartDefault {
  include: boolean;
  html: string;
}

export type PartDefaults = Record<PartKey, PartDefault>;

/** Tope por parte: una firma con logo en base64 cabe de sobra. */
export const MAX_PART_HTML = 300_000;

/**
 * Lee lo que manda el redactor. Cualquier cosa rara se ignora: el mensaje
 * sale entonces con la parte de siempre.
 */
export function parseParts(raw: unknown): MessageParts {
  let value = raw;
  if (typeof value === "string") {
    if (!value.trim()) return {};
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: MessageParts = {};
  for (const key of PART_KEYS) {
    const part = (value as Record<string, unknown>)[key];
    if (!part || typeof part !== "object") continue;
    const { include, html } = part as { include?: unknown; html?: unknown };
    if (typeof include !== "boolean") continue;
    out[key] = {
      include,
      html: typeof html === "string" && html.length <= MAX_PART_HTML ? html : null,
    };
  }
  return out;
}

/** El HTML de la parte que lleva el mensaje, o `null` si no lleva. */
export function resolvePart(fallback: PartDefault, chosen?: MessagePart | null): string | null {
  const include = chosen ? chosen.include : fallback.include;
  if (!include) return null;
  return chosen?.html ?? fallback.html;
}

/** ¿Se ha cambiado algo respecto a lo de siempre? (para marcarlo en el redactor). */
export function partsChanged(defaults: PartDefaults | null, parts: MessageParts): boolean {
  return PART_KEYS.some((key) => {
    const part = parts[key];
    if (!part) return false;
    if (part.html !== null) return true;
    return defaults ? part.include !== defaults[key].include : false;
  });
}

/**
 * Lo que el editor visual no sabe conservar (tablas): un cuerpo así se abre y
 * se edita en HTML para no deshacer el diseño.
 */
export const BODY_NEEDS_HTML = /<(table|tbody|tr|td)\b/i;

/** Del documento HTML completo que se pega o se abre, solo lo que va dentro de <body>. */
export function bodyOf(html: string): string {
  const match = html.match(/<body\b[^>]*>([\s\S]*?)(<\/body>|$)/i);
  return match ? match[1] : html;
}
