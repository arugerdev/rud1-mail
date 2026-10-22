import "server-only";

import type { FetchMessageObject, ImapFlow, MessageStructureObject, SearchObject } from "imapflow";
import { convert } from "html-to-text";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";

import { withImap, withMailbox, type Credentials } from "@/lib/imap";
import { listFolders, specialFolderFor, specialUseOfPath, type SpecialUse } from "@/lib/mail/folders";

export interface Address {
  name: string;
  address: string;
}

export interface MessageSummary {
  uid: number;
  subject: string;
  from: Address | null;
  to: Address[];
  date: string | null;
  seen: boolean;
  flagged: boolean;
  answered: boolean;
  draft: boolean;
  hasAttachments: boolean;
  size: number;
}

export interface MessagePage {
  items: MessageSummary[];
  total: number;
  page: number;
  pages: number;
}

export const PAGE_SIZE = 50;

function hasAttachment(node: MessageStructureObject | undefined): boolean {
  if (!node) return false;
  if (node.disposition === "attachment") return true;
  const named = Boolean(node.dispositionParameters?.filename || node.parameters?.name);
  if (named && !node.type.startsWith("multipart/") && node.disposition !== "inline") return true;
  return (node.childNodes ?? []).some(hasAttachment);
}

function toSummary(msg: FetchMessageObject): MessageSummary {
  const env = msg.envelope;
  const from = env?.from?.[0];
  const flags = msg.flags ?? new Set<string>();
  return {
    uid: msg.uid,
    subject: env?.subject?.trim() || "",
    from: from ? { name: from.name ?? "", address: from.address ?? "" } : null,
    to: (env?.to ?? []).map((a) => ({ name: a.name ?? "", address: a.address ?? "" })),
    date: (env?.date ?? msg.internalDate)
      ? new Date((env?.date ?? msg.internalDate) as Date | string).toISOString()
      : null,
    seen: flags.has("\\Seen"),
    flagged: flags.has("\\Flagged"),
    answered: flags.has("\\Answered"),
    draft: flags.has("\\Draft"),
    hasAttachments: hasAttachment(msg.bodyStructure),
    size: msg.size ?? 0,
  };
}

const SUMMARY_QUERY = { uid: true, envelope: true, flags: true, bodyStructure: true, internalDate: true, size: true };

function searchQuery(text: string): SearchObject {
  return { or: [{ subject: text }, { from: text }, { to: text }, { body: text }] };
}

export async function listMessages(
  credentials: Credentials,
  path: string,
  { page = 1, query = "" }: { page?: number; query?: string },
): Promise<MessagePage> {
  return withMailbox(credentials, path, async (client) => {
    // Si la carpeta ya estaba abierta en esta conexión, el servidor solo
    // cuenta lo que ha llegado desde entonces cuando se le pregunta.
    await client.noop();
    const mailbox = client.mailbox;
    const exists = mailbox ? mailbox.exists : 0;
    const text = query.trim();

    if (!text) {
      // Por orden de llegada, de lo más nuevo a lo más viejo, por tramos de
      // número de secuencia: no hace falta pedir la lista entera de mensajes.
      const pages = Math.max(1, Math.ceil(exists / PAGE_SIZE));
      const current = Math.min(Math.max(1, page), pages);
      if (exists === 0) return { items: [], total: 0, page: 1, pages: 1 };
      const end = exists - (current - 1) * PAGE_SIZE;
      const start = Math.max(1, end - PAGE_SIZE + 1);
      const fetched = await client.fetchAll(`${start}:${end}`, SUMMARY_QUERY);
      const items = fetched.sort((a, b) => b.seq - a.seq).map(toSummary);
      return { items, total: exists, page: current, pages };
    }

    const found = (await client.search(searchQuery(text), { uid: true })) || [];
    const uids = [...found].sort((a, b) => b - a);
    const pages = Math.max(1, Math.ceil(uids.length / PAGE_SIZE));
    const current = Math.min(Math.max(1, page), pages);
    const slice = uids.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
    if (slice.length === 0) return { items: [], total: uids.length, page: current, pages };
    const fetched = await client.fetchAll(slice, SUMMARY_QUERY, { uid: true });
    const items = fetched.sort((a, b) => b.uid - a.uid).map(toSummary);
    return { items, total: uids.length, page: current, pages };
  });
}

export interface InboxState {
  unread: number;
  latest: { uid: number; from: string; subject: string } | null;
}

/** Lo justo para saber si ha llegado algo: sin leer y el último mensaje. */
export async function inboxState(credentials: Credentials): Promise<InboxState> {
  return withMailbox(credentials, "INBOX", async (client) => {
    await client.noop();
    const status = await client.status("INBOX", { unseen: true });
    const exists = client.mailbox ? client.mailbox.exists : 0;
    if (exists === 0) return { unread: status.unseen ?? 0, latest: null };
    const last = await client.fetchOne("*", { uid: true, envelope: true });
    const from = last && last.envelope?.from?.[0];
    return {
      unread: status.unseen ?? 0,
      latest: last
        ? {
            uid: last.uid,
            from: from ? from.name || from.address || "" : "",
            subject: last.envelope?.subject?.trim() || "(sin asunto)",
          }
        : null,
    };
  });
}

export interface AttachmentInfo {
  index: number;
  filename: string;
  contentType: string;
  size: number;
}

export interface MessageDetail {
  uid: number;
  folder: string;
  subject: string;
  from: Address | null;
  to: Address[];
  cc: Address[];
  bcc: Address[];
  replyTo: Address[];
  date: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
  /** HTML del mensaje tal cual llega; se sanea al pintarlo. */
  html: string | null;
  text: string;
  /** Imágenes incrustadas (cid:) ya convertidas en data: para el HTML. */
  inlineImages: Record<string, string>;
  attachments: AttachmentInfo[];
  flagged: boolean;
  draft: boolean;
  /** Estaba sin leer antes de abrirlo ahora. */
  wasUnseen: boolean;
}

function addresses(value: AddressObject | AddressObject[] | undefined): Address[] {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list.flatMap((group) =>
    group.value.flatMap((a) =>
      a.group
        ? a.group.map((g) => ({ name: g.name ?? "", address: g.address ?? "" }))
        : [{ name: a.name ?? "", address: a.address ?? "" }],
    ),
  );
}

/** Texto de un correo HTML: sin imágenes y sin pasar los títulos a mayúsculas. */
const HTML_TO_TEXT_SELECTORS = [
  { selector: "img", format: "skip" },
  ...["h1", "h2", "h3", "h4", "h5", "h6", "th"].map((selector) => ({
    selector,
    options: { uppercase: false },
  })),
];

/** Imágenes incrustadas de más de esto no se meten en el HTML (salen como adjunto). */
const MAX_INLINE_IMAGE = 3 * 1024 * 1024;

function isInline(att: ParsedMail["attachments"][number]): boolean {
  return Boolean(att.cid) && att.contentType.startsWith("image/") && att.size <= MAX_INLINE_IMAGE;
}

async function fetchParsed(client: ImapFlow, uid: number): Promise<{ parsed: ParsedMail; flags: Set<string> } | null> {
  const msg = await client.fetchOne(String(uid), { uid: true, source: true, flags: true }, { uid: true });
  if (!msg || !msg.source) return null;
  return { parsed: await simpleParser(msg.source), flags: msg.flags ?? new Set() };
}

export async function getMessage(
  credentials: Credentials,
  path: string,
  uid: number,
  { markSeen = true }: { markSeen?: boolean } = {},
): Promise<MessageDetail | null> {
  return withMailbox(credentials, path, async (client) => {
    const result = await fetchParsed(client, uid);
    if (!result) return null;
    const { parsed, flags } = result;
    if (markSeen && !flags.has("\\Seen")) {
      await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
    }

    const inlineImages: Record<string, string> = {};
    const attachments: AttachmentInfo[] = [];
    parsed.attachments.forEach((att, index) => {
      // Las imágenes que el HTML usa con cid: se muestran dentro del mensaje;
      // si el HTML no las nombra, se tratan como un adjunto más.
      if (isInline(att) && parsed.html && parsed.html.includes(`cid:${att.cid}`)) {
        inlineImages[att.cid!] = `data:${att.contentType};base64,${att.content.toString("base64")}`;
        return;
      }
      attachments.push({
        index,
        filename: att.filename || `adjunto-${index + 1}`,
        contentType: att.contentType || "application/octet-stream",
        size: att.size,
      });
    });

    const refs = parsed.references;
    return {
      uid,
      folder: path,
      subject: parsed.subject?.trim() || "",
      from: addresses(parsed.from)[0] ?? null,
      to: addresses(parsed.to),
      cc: addresses(parsed.cc),
      bcc: addresses(parsed.bcc),
      replyTo: addresses(parsed.replyTo),
      date: parsed.date ? parsed.date.toISOString() : null,
      messageId: parsed.messageId ?? null,
      inReplyTo: parsed.inReplyTo ?? null,
      references: Array.isArray(refs) ? refs : refs ? [refs] : [],
      html: typeof parsed.html === "string" ? parsed.html : null,
      // Muchos correos solo traen HTML: el texto (para citar al responder)
      // se saca de él.
      text: parsed.text?.trim()
        ? parsed.text
        : typeof parsed.html === "string"
          ? convert(parsed.html, { wordwrap: false, selectors: HTML_TO_TEXT_SELECTORS })
          : "",
      inlineImages,
      attachments,
      flagged: flags.has("\\Flagged"),
      draft: flags.has("\\Draft"),
      wasUnseen: !flags.has("\\Seen"),
    };
  });
}

export interface AttachmentContent {
  filename: string;
  contentType: string;
  content: Buffer;
}

export async function getAttachment(
  credentials: Credentials,
  path: string,
  uid: number,
  index: number,
): Promise<AttachmentContent | null> {
  return withMailbox(credentials, path, async (client) => {
    const result = await fetchParsed(client, uid);
    const att = result?.parsed.attachments[index];
    if (!att) return null;
    return {
      filename: att.filename || `adjunto-${index + 1}`,
      contentType: att.contentType || "application/octet-stream",
      content: att.content,
    };
  });
}

/** Todos los adjuntos de un mensaje, para reenviarlo. */
export async function getAllAttachments(
  credentials: Credentials,
  path: string,
  uid: number,
): Promise<AttachmentContent[]> {
  return withMailbox(credentials, path, async (client) => {
    const result = await fetchParsed(client, uid);
    return (result?.parsed.attachments ?? []).map((att, index) => ({
      filename: att.filename || `adjunto-${index + 1}`,
      contentType: att.contentType || "application/octet-stream",
      content: att.content,
    }));
  });
}

export async function setFlag(
  credentials: Credentials,
  path: string,
  uids: number[],
  flag: "\\Seen" | "\\Flagged",
  on: boolean,
): Promise<void> {
  if (uids.length === 0) return;
  await withMailbox(credentials, path, async (client) => {
    if (on) await client.messageFlagsAdd(uids, [flag], { uid: true });
    else await client.messageFlagsRemove(uids, [flag], { uid: true });
  });
}

export async function moveMessages(credentials: Credentials, path: string, uids: number[], destination: string): Promise<void> {
  if (uids.length === 0 || destination === path) return;
  await withMailbox(credentials, path, async (client) => {
    await client.messageMove(uids, destination, { uid: true });
  });
}

/** Mueve a una carpeta especial (Papelera, Archivo, Spam) de este buzón. */
export async function moveToSpecial(
  credentials: Credentials,
  path: string,
  uids: number[],
  use: SpecialUse,
): Promise<void> {
  // En un buzón común, su propia Papelera/Archivo/Spam; en el propio, los suyos.
  const destination = await withImap(credentials, (client) => specialFolderFor(client, path, use));
  if (!destination) throw new Error(`Este buzón no tiene carpeta "${use}"`);
  await moveMessages(credentials, path, uids, destination);
}

/** Borra para siempre (solo desde la Papelera o el Spam). */
export async function deleteForever(credentials: Credentials, path: string, uids: number[]): Promise<void> {
  if (uids.length === 0) return;
  await withMailbox(credentials, path, async (client) => {
    await client.messageDelete(uids, { uid: true });
  });
}

export async function folderSpecialUse(credentials: Credentials, path: string): Promise<SpecialUse | null> {
  return specialUseOfPath(path, await listFolders(credentials));
}
