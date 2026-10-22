import "server-only";

import nodemailer from "nodemailer";
import MailComposer from "nodemailer/lib/mail-composer";

import { config } from "@/lib/config";
import { withImap, withMailbox, type Credentials } from "@/lib/imap";
import { specialFolderPath } from "@/lib/mail/folders";
import type { AddressLike } from "@/lib/mail/text";

export interface OutgoingAttachment {
  filename: string;
  contentType: string;
  content: Buffer;
}

export interface OutgoingMessage {
  fromName: string;
  to: AddressLike[];
  cc: AddressLike[];
  bcc: AddressLike[];
  subject: string;
  /** Mensaje ya montado (compose.ts): HTML y su versión en texto. */
  html: string;
  text: string;
  attachments: OutgoingAttachment[];
  /** Message-ID propio (los borradores lo usan para reencontrar sus datos). */
  messageId?: string;
  inReplyTo?: string | null;
  references?: string[];
}

function composerOptions(from: Credentials & { name: string }, msg: OutgoingMessage) {
  return {
    from: { name: from.name, address: from.email },
    to: msg.to,
    cc: msg.cc,
    bcc: msg.bcc,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
    ...(msg.messageId ? { messageId: msg.messageId } : {}),
    attachments: msg.attachments.map((a) => ({
      filename: a.filename,
      contentType: a.contentType,
      content: a.content,
    })),
    ...(msg.inReplyTo ? { inReplyTo: msg.inReplyTo } : {}),
    ...(msg.references && msg.references.length > 0 ? { references: msg.references } : {}),
  };
}

/**
 * `keepBcc`: el mensaje que viaja no lleva la cabecera de copias ocultas (los
 * destinatarios no deben verlas; van solo en el sobre), pero la copia propia
 * de Enviados y los borradores sí la guardan.
 */
async function build(options: ReturnType<typeof composerOptions>, keepBcc: boolean): Promise<Buffer> {
  const composer = new MailComposer({ ...options, keepBcc } as ConstructorParameters<typeof MailComposer>[0]);
  return composer.compile().build();
}

function transport(credentials: Credentials) {
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    requireTLS: config.smtp.port !== 465,
    auth: { user: credentials.email, pass: credentials.password },
    tls: { servername: config.smtp.servername },
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 60_000,
  });
}

export class SendError extends Error {
  constructor(message: string, public readonly rejected: string[] = []) {
    super(message);
    this.name = "SendError";
  }
}

/**
 * Envía el mensaje con el propio buzón (SMTP con su usuario y contraseña) y
 * guarda una copia en Enviados: Postfix no la guarda por su cuenta.
 */
export async function sendMessage(
  credentials: Credentials,
  msg: OutgoingMessage,
): Promise<{ messageId: string | null }> {
  const options = composerOptions({ ...credentials, name: msg.fromName }, msg);
  const recipients = [...msg.to, ...msg.cc, ...msg.bcc].map((a) => a.address);
  if (recipients.length === 0) throw new SendError("Añade al menos un destinatario");

  const raw = await build(options, false);
  const info = await transport(credentials).sendMail({
    envelope: { from: credentials.email, to: recipients },
    raw,
  });
  const rejected = ((info.rejected ?? []) as Array<string | { address: string }>).map((r) =>
    typeof r === "string" ? r : r.address,
  );
  if (rejected.length === recipients.length) {
    throw new SendError("El servidor rechazó todos los destinatarios", rejected);
  }

  // La copia de Enviados sí lleva las copias ocultas: es del propio remitente.
  const copy = msg.bcc.length > 0 ? await build(options, true) : raw;
  await withImap(credentials, async (client) => {
    const sent = await specialFolderPath(client, "sent");
    if (sent) await client.append(sent, copy, ["\\Seen"]);
  });

  const messageId = raw.toString("utf8", 0, Math.min(raw.length, 8192)).match(/^Message-ID:\s*(<[^>]+>)/im)?.[1] ?? null;
  return { messageId };
}

/** Guarda (o sustituye) un borrador en la carpeta Borradores. */
export async function saveDraft(
  credentials: Credentials,
  msg: OutgoingMessage,
  replaceUid?: number | null,
): Promise<{ uid: number | null }> {
  const raw = await build(composerOptions({ ...credentials, name: msg.fromName }, msg), true);
  return withImap(credentials, async (client) => {
    const drafts = await specialFolderPath(client, "drafts");
    if (!drafts) throw new Error("Este buzón no tiene carpeta de borradores");
    const appended = await client.append(drafts, raw, ["\\Draft", "\\Seen"]);
    if (replaceUid) await deleteDraft(credentials, replaceUid, drafts);
    return { uid: appended && appended.uid ? appended.uid : null };
  });
}

export async function deleteDraft(credentials: Credentials, uid: number, draftsPath?: string): Promise<void> {
  const path = draftsPath ?? (await withImap(credentials, (client) => specialFolderPath(client, "drafts")));
  if (!path) return;
  await withMailbox(credentials, path, async (client) => {
    await client.messageDelete(String(uid), { uid: true });
  });
}

/** Marca el original como respondido. */
export async function markAnswered(credentials: Credentials, path: string, uid: number): Promise<void> {
  await withMailbox(credentials, path, async (client) => {
    await client.messageFlagsAdd(String(uid), ["\\Answered"], { uid: true });
  });
}
