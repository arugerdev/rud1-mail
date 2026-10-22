"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { can } from "@/lib/access";
import { config } from "@/lib/config";
import { learnContacts } from "@/lib/contacts";
import { deleteDraftData, getDraftData, saveDraftData, type DraftData, type DraftRecipient } from "@/lib/drafts";
import { sanitizeAuthoredHtml } from "@/lib/mail/authoring";
import { composeMessage, type ComposeMode } from "@/lib/mail/compose";
import {
  deleteForever,
  getAllAttachments,
  getMessage,
  moveMessages,
  moveToSpecial,
  setFlag,
} from "@/lib/mail/messages";
import { wrap } from "@/lib/mail/render";
import {
  deleteDraft,
  markAnswered,
  saveDraft,
  sendMessage,
  SendError,
  type OutgoingAttachment,
  type OutgoingMessage,
} from "@/lib/mail/send";
import { escapeHtml, isValidEmail } from "@/lib/mail/text";
import { getMailbox, mailcowAvailable } from "@/lib/mailcow";
import { requireUser, type SignedInSession } from "@/lib/session";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

function ok(): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true };
}

function fail(error: unknown, fallback: string): ActionResult {
  console.error("[correo]", error);
  return { ok: false, error: error instanceof SendError ? error.message : fallback };
}

function cleanUids(uids: number[]): number[] {
  return uids.filter((u) => Number.isInteger(u) && u > 0);
}

export async function setSeenAction(folder: string, uids: number[], seen: boolean): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await setFlag(user, folder, cleanUids(uids), "\\Seen", seen);
    return ok();
  } catch (error) {
    return fail(error, "No se pudo marcar el mensaje.");
  }
}

export async function setFlaggedAction(folder: string, uids: number[], flagged: boolean): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await setFlag(user, folder, cleanUids(uids), "\\Flagged", flagged);
    return ok();
  } catch (error) {
    return fail(error, "No se pudo destacar el mensaje.");
  }
}

export async function moveAction(folder: string, uids: number[], destination: string): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await moveMessages(user, folder, cleanUids(uids), destination);
    return ok();
  } catch (error) {
    return fail(error, "No se pudo mover el mensaje.");
  }
}

export async function moveToSpecialAction(
  folder: string,
  uids: number[],
  target: "archive" | "trash" | "junk" | "inbox",
): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await moveToSpecial(user, folder, cleanUids(uids), target);
    return ok();
  } catch (error) {
    return fail(error, "No se pudo mover el mensaje.");
  }
}

export async function deleteForeverAction(folder: string, uids: number[]): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await deleteForever(user, folder, cleanUids(uids));
    return ok();
  } catch (error) {
    return fail(error, "No se pudo borrar el mensaje.");
  }
}

/** 25 MB entre todos los adjuntos: lo que aceptan la mayoría de servidores. */
const MAX_ATTACHMENTS_BYTES = 25 * 1024 * 1024;

const MODES: ComposeMode[] = ["new", "reply", "replyAll", "forward"];

function recipients(formData: FormData, field: string): DraftRecipient[] {
  try {
    const raw = JSON.parse(String(formData.get(field) ?? "[]"));
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((r): r is DraftRecipient => typeof r?.address === "string")
      .map((r) => ({ address: r.address.trim(), name: typeof r.name === "string" ? r.name.trim() : undefined }))
      .slice(0, 100);
  } catch {
    return [];
  }
}

interface ComposeForm {
  draft: DraftData;
  attachments: OutgoingAttachment[];
  draftUid: number | null;
  draftMessageId: string | null;
}

async function readComposeForm(formData: FormData): Promise<ComposeForm | string> {
  const to = recipients(formData, "to");
  const cc = recipients(formData, "cc");
  const bcc = recipients(formData, "bcc");
  const invalid = [...to, ...cc, ...bcc].find((a) => !isValidEmail(a.address));
  if (invalid) return `"${invalid.address}" no es una dirección válida.`;

  const files = formData.getAll("attachments").filter((f): f is File => f instanceof File && f.size > 0);
  const attachments = await Promise.all(
    files.map(async (f) => ({
      filename: f.name,
      contentType: f.type || "application/octet-stream",
      content: Buffer.from(await f.arrayBuffer()),
    })),
  );

  const modeRaw = String(formData.get("mode") ?? "new") as ComposeMode;
  const mode = MODES.includes(modeRaw) ? modeRaw : "new";
  const sourceFolder = String(formData.get("sourceFolder") ?? "");
  const sourceUid = Number(formData.get("sourceUid") ?? 0);

  let references: string[] = [];
  try {
    const raw = JSON.parse(String(formData.get("references") ?? "[]"));
    if (Array.isArray(raw)) references = raw.filter((r): r is string => typeof r === "string").slice(-30);
  } catch {
    references = [];
  }

  return {
    draft: {
      from: String(formData.get("from") ?? "").trim().toLowerCase() || undefined,
      to,
      cc,
      bcc,
      subject: String(formData.get("subject") ?? "").slice(0, 500),
      bodyHtml: String(formData.get("bodyHtml") ?? "").slice(0, 2_000_000),
      mode,
      source: sourceFolder && sourceUid > 0 ? { folder: sourceFolder, uid: sourceUid } : null,
      includeQuote: formData.get("includeQuote") === "1",
      keepAttachments: formData.get("keepAttachments") === "1",
      inReplyTo: String(formData.get("inReplyTo") ?? "") || null,
      references,
    },
    attachments,
    draftUid: Number(formData.get("draftUid") ?? 0) || null,
    draftMessageId: String(formData.get("draftMessageId") ?? "") || null,
  };
}

/**
 * Comprueba desde qué dirección se puede enviar: la propia o un buzón común
 * con permiso ("Enviar como", en Mailcow). Devuelve dirección y nombre.
 */
async function resolveSender(user: SignedInSession, from: string | undefined): Promise<{ address: string; name: string } | string> {
  if (!from || from === user.email) return { address: user.email, name: user.name };
  if (!mailcowAvailable()) return "No se puede comprobar el remitente ahora mismo.";
  const box = await getMailbox(user.email);
  if (!box?.sendAs.includes(from)) return `No tienes permiso para enviar como ${from}.`;
  const shared = await getMailbox(from).catch(() => null);
  return { address: from, name: shared?.name ?? from };
}

async function buildOutgoing(
  user: SignedInSession,
  form: ComposeForm,
  messageId?: string,
): Promise<OutgoingMessage | string> {
  const { draft } = form;
  const sender = await resolveSender(user, draft.from);
  if (typeof sender === "string") return sender;
  const { html, text } = await composeMessage(user, {
    bodyHtml: draft.bodyHtml,
    mode: draft.mode,
    source: draft.source,
    includeQuote: draft.includeQuote,
  });
  return {
    fromName: sender.name,
    ...(sender.address !== user.email ? { fromAddress: sender.address } : {}),
    to: draft.to,
    cc: draft.cc,
    bcc: draft.bcc,
    subject: draft.subject,
    html,
    text,
    attachments: form.attachments,
    inReplyTo: draft.inReplyTo,
    references: draft.references,
    ...(messageId ? { messageId } : {}),
  };
}

export async function sendAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!can(user.email, "correo.enviar")) {
    return { ok: false, error: "Tu cuenta no puede enviar correo ahora mismo. Habla con Álvaro o Manuel." };
  }
  const form = await readComposeForm(formData);
  if (typeof form === "string") return { ok: false, error: form };
  const { draft } = form;

  if (draft.to.length + draft.cc.length + draft.bcc.length === 0) {
    return { ok: false, error: "Añade al menos un destinatario." };
  }

  try {
    const message = await buildOutgoing(user, form);
    if (typeof message === "string") return { ok: false, error: message };
    // Al reenviar, los adjuntos del original viajan con el mensaje.
    if (draft.mode === "forward" && draft.source && draft.keepAttachments) {
      message.attachments.unshift(...(await getAllAttachments(user, draft.source.folder, draft.source.uid)));
    }
    const total = message.attachments.reduce((sum, a) => sum + a.content.length, 0);
    if (total > MAX_ATTACHMENTS_BYTES) {
      return { ok: false, error: "Los adjuntos pasan de 25 MB. Quita alguno o compártelo con un enlace." };
    }

    await sendMessage(user, message);
    learnContacts(user.email, [...draft.to, ...draft.cc, ...draft.bcc]);
    if ((draft.mode === "reply" || draft.mode === "replyAll") && draft.source) {
      await markAnswered(user, draft.source.folder, draft.source.uid).catch(() => undefined);
    }
    if (form.draftUid) await deleteDraft(user, form.draftUid).catch(() => undefined);
    if (form.draftMessageId) deleteDraftData(user.email, form.draftMessageId);
    return ok();
  } catch (error) {
    return fail(error, "No se pudo enviar el mensaje. Revisa los destinatarios e inténtalo de nuevo.");
  }
}

export async function saveDraftAction(
  formData: FormData,
): Promise<ActionResult & { uid?: number | null; messageId?: string }> {
  const user = await requireUser();
  const form = await readComposeForm(formData);
  if (typeof form === "string") return { ok: false, error: form };
  try {
    // Mismo Message-ID en cada guardado: así se reencuentran sus datos al reabrirlo.
    const messageId = form.draftMessageId ?? `<${randomUUID()}@${config.domain}>`;
    const message = await buildOutgoing(user, form, messageId);
    if (typeof message === "string") return { ok: false, error: message };
    const { uid } = await saveDraft(user, message, form.draftUid);
    saveDraftData(user.email, messageId, form.draft);
    revalidatePath("/", "layout");
    return { ok: true, uid, messageId };
  } catch (error) {
    return fail(error, "No se pudo guardar el borrador.");
  }
}

export async function discardDraftAction(uid: number, messageId?: string | null): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await deleteDraft(user, uid);
    if (messageId) deleteDraftData(user.email, messageId);
    return ok();
  } catch (error) {
    return fail(error, "No se pudo descartar el borrador.");
  }
}

export interface DraftContent extends DraftData {
  uid: number;
  messageId: string | null;
}

/** Abre un borrador guardado en el redactor, tal cual se dejó. */
export async function loadDraftAction(folder: string, uid: number): Promise<DraftContent | null> {
  const user = await requireUser();
  const detail = await getMessage(user, folder, uid, { markSeen: false });
  if (!detail) return null;
  const saved = detail.messageId ? getDraftData(user.email, detail.messageId) : null;
  if (saved) return { ...saved, uid, messageId: detail.messageId };
  // Borrador hecho en otro programa: se abre con lo que trae.
  const toRecipients = (list: { name: string; address: string }[]) => list.map((a) => ({ address: a.address, name: a.name }));
  return {
    uid,
    messageId: detail.messageId,
    to: toRecipients(detail.to),
    cc: toRecipients(detail.cc),
    bcc: toRecipients(detail.bcc),
    subject: detail.subject,
    bodyHtml: detail.html ? sanitizeAuthoredHtml(detail.html) : `<p>${escapeHtml(detail.text).replace(/\n/g, "<br>")}</p>`,
    mode: "new",
    source: null,
    includeQuote: false,
    keepAttachments: false,
    inReplyTo: detail.inReplyTo,
    references: detail.references,
  };
}

/** Vista previa: el mensaje exactamente como lo recibirá el destinatario. */
export async function previewAction(formData: FormData): Promise<{ ok: boolean; document?: string; error?: string }> {
  const user = await requireUser();
  const form = await readComposeForm(formData);
  if (typeof form === "string") return { ok: false, error: form };
  try {
    const { html } = await composeMessage(user, {
      bodyHtml: form.draft.bodyHtml,
      mode: form.draft.mode,
      source: form.draft.source,
      includeQuote: form.draft.includeQuote,
    });
    return { ok: true, document: wrap(html, true) };
  } catch (error) {
    console.error("[vista previa]", error);
    return { ok: false, error: "No se pudo preparar la vista previa." };
  }
}
