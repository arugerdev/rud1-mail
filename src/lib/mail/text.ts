/**
 * Utilidades de texto sin dependencias de servidor: las usan tanto el
 * redactor (navegador) como el envío (servidor).
 */

export interface AddressLike {
  name?: string;
  address: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Convierte en enlace las direcciones web de un texto ya escapado. */
export function linkify(escaped: string): string {
  return escaped.replace(
    /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/g,
    (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`,
  );
}

export function formatAddress(a: AddressLike): string {
  return a.name ? `${a.name} <${a.address}>` : a.address;
}

const PREFIX = /^\s*((re|rv|fw|fwd|aw|tr)\s*(\[\d+\])?\s*:\s*)+/i;

export function replySubject(subject: string): string {
  const clean = subject.replace(PREFIX, "").trim();
  return `Re: ${clean}`.trim();
}

export function forwardSubject(subject: string): string {
  const clean = subject.replace(PREFIX, "").trim();
  return `Fwd: ${clean}`.trim();
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-ES", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Madrid",
  }).format(new Date(iso));
}

export interface QuotableMessage {
  from: AddressLike | null;
  to: AddressLike[];
  cc?: AddressLike[];
  date: string | null;
  subject: string;
  text: string;
}

/** Texto citado al responder: "El …, Fulano escribió:" y el original con ">". */
export function quoteForReply(msg: QuotableMessage): string {
  const who = msg.from ? formatAddress(msg.from) : "alguien";
  const header = `El ${formatDate(msg.date)}, ${who} escribió:`;
  const quoted = msg.text
    .replace(/\r\n/g, "\n")
    .trimEnd()
    .split("\n")
    .map((line) => (line.startsWith(">") ? `>${line}` : `> ${line}`))
    .join("\n");
  return `\n\n${header}\n${quoted}\n`;
}

/** Cabecera del mensaje reenviado, como la ponen los clientes de correo habituales. */
export function quoteForForward(msg: QuotableMessage): string {
  const lines = [
    "---------- Mensaje reenviado ----------",
    `De: ${msg.from ? formatAddress(msg.from) : ""}`,
    `Fecha: ${formatDate(msg.date)}`,
    `Asunto: ${msg.subject}`,
    `Para: ${msg.to.map(formatAddress).join(", ")}`,
  ];
  if (msg.cc && msg.cc.length > 0) lines.push(`CC: ${msg.cc.map(formatAddress).join(", ")}`);
  return `\n\n${lines.join("\n")}\n\n${msg.text.replace(/\r\n/g, "\n").trimEnd()}\n`;
}

/**
 * Versión HTML del texto escrito en el redactor: párrafos, enlaces y las
 * líneas citadas con ">" agrupadas en un bloque de cita.
 */
export function textToHtml(text: string): string {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let quote: string[] = [];
  const flush = () => {
    if (quote.length === 0) return;
    const inner = quote.map((l) => l.replace(/^>\s?/, "")).join("\n");
    out.push(
      `<blockquote style="margin:0 0 0 .8ex;border-left:2px solid #ccc;padding-left:1ex;color:#555">${textToHtml(inner)}</blockquote>`,
    );
    quote = [];
  };
  for (const line of lines) {
    if (line.startsWith(">")) {
      quote.push(line);
      continue;
    }
    flush();
    out.push(line ? linkify(escapeHtml(line)) : "");
  }
  flush();
  return out.join("<br>\n").replace(/<br>\n(<blockquote)/g, "\n$1").replace(/(<\/blockquote>)<br>\n/g, "$1\n");
}

/** Separa una lista "a@x.com, Nombre <b@y.com>; c@z.com" en direcciones. */
export function parseAddressList(value: string): AddressLike[] {
  return value
    .split(/[,;\n]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*)<\s*([^>]+)\s*>$/);
      if (match) return { name: match[1].trim().replace(/^"|"$/g, ""), address: match[2].trim() };
      return { address: part };
    });
}

const EMAIL = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;

export function isValidEmail(address: string): boolean {
  return EMAIL.test(address);
}
