/**
 * Convierte un enlace "mailto:" (RFC 6068) en los campos del redactor.
 * Llega así cuando rud1 Mail es la app de correo predeterminada del sistema.
 */
export interface MailtoFields {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
}

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, "%20"));
  } catch {
    return value;
  }
}

export function parseMailto(raw: string): MailtoFields | null {
  const value = raw.trim();
  if (!/^mailto:/i.test(value)) return null;
  const rest = value.slice("mailto:".length);
  const [address = "", query = ""] = rest.split("?", 2);
  const fields: MailtoFields = { to: decode(address), cc: "", bcc: "", subject: "", text: "" };
  for (const pair of query.split("&")) {
    if (!pair) continue;
    const [key = "", val = ""] = pair.split("=", 2);
    const k = key.toLowerCase();
    const v = decode(val);
    if (k === "to") fields.to = [fields.to, v].filter(Boolean).join(", ");
    else if (k === "cc") fields.cc = v;
    else if (k === "bcc") fields.bcc = v;
    else if (k === "subject") fields.subject = v;
    else if (k === "body") fields.text = v;
  }
  return fields;
}
