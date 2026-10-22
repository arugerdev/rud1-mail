import "server-only";

import { convert } from "html-to-text";

import type { Credentials } from "@/lib/imap";
import { sanitizeAuthoredHtml, hasContent } from "@/lib/mail/authoring";
import { getMessage, type Address } from "@/lib/mail/messages";
import { sanitizeIncoming } from "@/lib/mail/render";
import { escapeHtml, linkify } from "@/lib/mail/text";
import { getProfile } from "@/lib/profiles";
import { getOrgTemplates, renderTemplate, variablesFor } from "@/lib/templates";

/**
 * Monta el mensaje que se envía, igual para enviar, guardar como borrador y
 * la vista previa: cabecera corporativa, cuerpo, firma personal, pie
 * corporativo y, al responder o reenviar, el mensaje original.
 */

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export interface ComposeInput {
  bodyHtml: string;
  mode: ComposeMode;
  source: { folder: string; uid: number } | null;
  includeQuote: boolean;
}

const FONT = "Inter,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/**
 * Los clientes de correo dan márgenes muy distintos a <p>, listas y citas: se
 * fijan en línea para que se vea igual en Gmail, Outlook y el móvil.
 */
function inlineEmailStyles(html: string): string {
  const add = (tag: string, style: string) =>
    html.replace(new RegExp(`<${tag}(\\s[^>]*)?>`, "gi"), (match: string, attrs: string | undefined) => {
      const a = attrs ?? "";
      if (/style="/i.test(a)) return `<${tag}${a.replace(/style="/i, `style="${style};`)}>`;
      return `<${tag}${a} style="${style}">`;
    });
  html = add("p", "margin:0 0 10px");
  html = add("ul", "margin:0 0 10px;padding-left:24px");
  html = add("ol", "margin:0 0 10px;padding-left:24px");
  html = add("h1", "margin:0 0 10px;font-size:22px;line-height:1.3");
  html = add("h2", "margin:0 0 10px;font-size:18px;line-height:1.35");
  html = add("blockquote", "margin:0 0 10px;padding-left:12px;border-left:3px solid #d1d5db;color:#4b5563");
  return html;
}

function formatAddress(a: Address): string {
  return a.name ? `${escapeHtml(a.name)} &lt;${escapeHtml(a.address)}&gt;` : escapeHtml(a.address);
}

function longDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(iso));
}

async function quoteOf(credentials: Credentials, input: ComposeInput): Promise<string> {
  if (!input.source || !input.includeQuote || input.mode === "new") return "";
  const original = await getMessage(credentials, input.source.folder, input.source.uid, { markSeen: false });
  if (!original) return "";
  let body: string;
  if (original.html) {
    let html = original.html;
    for (const [cid, dataUri] of Object.entries(original.inlineImages)) html = html.split(`cid:${cid}`).join(dataUri);
    body = sanitizeIncoming(html);
  } else {
    body = `<div style="white-space:pre-wrap">${linkify(escapeHtml(original.text))}</div>`;
  }
  const meta = `style="margin:18px 0 6px;color:#6b7280;font-size:13px;font-family:${FONT}"`;
  if (input.mode === "forward") {
    const lines = [
      "---------- Mensaje reenviado ----------",
      `De: ${original.from ? formatAddress(original.from) : ""}`,
      `Fecha: ${escapeHtml(longDate(original.date))}`,
      `Asunto: ${escapeHtml(original.subject)}`,
      `Para: ${original.to.map(formatAddress).join(", ")}`,
      ...(original.cc.length ? [`CC: ${original.cc.map(formatAddress).join(", ")}`] : []),
    ];
    return `<div ${meta}>${lines.join("<br>")}</div><div>${body}</div>`;
  }
  const who = original.from ? formatAddress(original.from) : "alguien";
  return `<div ${meta}>El ${escapeHtml(longDate(original.date))}, ${who} escribió:</div>
<blockquote style="margin:0;padding:0 0 0 12px;border-left:3px solid #d1d5db;color:#374151">${body}</blockquote>`;
}

export interface ComposedMessage {
  html: string;
  text: string;
}

export async function composeMessage(credentials: Credentials & { name: string }, input: ComposeInput): Promise<ComposedMessage> {
  const profile = getProfile(credentials.email, credentials.name);
  const templates = getOrgTemplates();
  const vars = variablesFor(profile);
  const corporate = input.mode === "new" || templates.inReplies;

  const parts: string[] = [];
  if (corporate && templates.header.enabled && hasContent(templates.header.html)) {
    parts.push(`<div style="margin:0 0 16px">${renderTemplate(templates.header.html, vars)}</div>`);
  }
  parts.push(inlineEmailStyles(sanitizeAuthoredHtml(input.bodyHtml)));
  if (hasContent(profile.signatureHtml)) {
    parts.push(`<div style="margin-top:16px">${inlineEmailStyles(renderTemplate(profile.signatureHtml, vars))}</div>`);
  }
  if (corporate && templates.footer.enabled && hasContent(templates.footer.html)) {
    parts.push(`<div style="margin-top:16px">${renderTemplate(templates.footer.html, vars)}</div>`);
  }
  parts.push(await quoteOf(credentials, input));

  const html = `<div style="font-family:${FONT};font-size:14px;line-height:1.55;color:#1f2937">${parts.join("\n")}</div>`;
  const text = convert(html, {
    wordwrap: 78,
    selectors: [
      { selector: "img", format: "skip" },
      { selector: "a", options: { hideLinkHrefIfSameAsText: true } },
      ...["h1", "h2", "h3"].map((selector) => ({ selector, options: { uppercase: false } })),
    ],
  });
  return { html, text };
}
