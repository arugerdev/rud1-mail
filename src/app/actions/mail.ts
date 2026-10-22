"use server";

import { revalidatePath } from "next/cache";

import {
  deleteForever,
  getAllAttachments,
  getMessage,
  moveMessages,
  moveToSpecial,
  setFlag,
} from "@/lib/mail/messages";
import { deleteDraft, markAnswered, saveDraft, sendMessage, SendError, type OutgoingMessage } from "@/lib/mail/send";
import { isValidEmail, parseAddressList, type AddressLike } from "@/lib/mail/text";
import { requireUser } from "@/lib/session";

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

function addresses(formData: FormData, field: string): AddressLike[] {
  return parseAddressList(String(formData.get(field) ?? ""));
}

interface Composed {
  message: OutgoingMessage;
  source: { folder: string; uid: number } | null;
  mode: string;
  draftUid: number | null;
}

async function readComposeForm(formData: FormData, name: string): Promise<Composed | string> {
  const to = addresses(formData, "to");
  const cc = addresses(formData, "cc");
  const bcc = addresses(formData, "bcc");
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

  const mode = String(formData.get("mode") ?? "new");
  const sourceFolder = String(formData.get("sourceFolder") ?? "");
  const sourceUid = Number(formData.get("sourceUid") ?? 0);
  const source = sourceFolder && sourceUid > 0 ? { folder: sourceFolder, uid: sourceUid } : null;
  const draftUid = Number(formData.get("draftUid") ?? 0) || null;

  let references: string[] = [];
  try {
    const raw = JSON.parse(String(formData.get("references") ?? "[]"));
    if (Array.isArray(raw)) references = raw.filter((r): r is string => typeof r === "string").slice(-30);
  } catch {
    references = [];
  }

  return {
    message: {
      fromName: name,
      to,
      cc,
      bcc,
      subject: String(formData.get("subject") ?? "").slice(0, 500),
      text: String(formData.get("text") ?? ""),
      attachments,
      inReplyTo: String(formData.get("inReplyTo") ?? "") || null,
      references,
    },
    source,
    mode,
    draftUid,
  };
}

export async function sendAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  const composed = await readComposeForm(formData, user.name);
  if (typeof composed === "string") return { ok: false, error: composed };
  const { message, source, mode, draftUid } = composed;

  if (message.to.length + message.cc.length + message.bcc.length === 0) {
    return { ok: false, error: "Añade al menos un destinatario." };
  }

  try {
    // Al reenviar, los adjuntos del original viajan con el mensaje.
    if (mode === "forward" && source && formData.get("keepAttachments") === "1") {
      message.attachments.unshift(...(await getAllAttachments(user, source.folder, source.uid)));
    }
    const total = message.attachments.reduce((sum, a) => sum + a.content.length, 0);
    if (total > MAX_ATTACHMENTS_BYTES) {
      return { ok: false, error: "Los adjuntos pasan de 25 MB. Quita alguno o compártelo con un enlace." };
    }

    await sendMessage(user, message);
    if ((mode === "reply" || mode === "replyAll") && source) {
      await markAnswered(user, source.folder, source.uid).catch(() => undefined);
    }
    if (draftUid) await deleteDraft(user, draftUid).catch(() => undefined);
    return ok();
  } catch (error) {
    return fail(error, "No se pudo enviar el mensaje. Revisa los destinatarios e inténtalo de nuevo.");
  }
}

export async function saveDraftAction(formData: FormData): Promise<ActionResult & { uid?: number | null }> {
  const user = await requireUser();
  const composed = await readComposeForm(formData, user.name);
  if (typeof composed === "string") return { ok: false, error: composed };
  try {
    const { uid } = await saveDraft(user, composed.message, composed.draftUid);
    revalidatePath("/", "layout");
    return { ok: true, uid };
  } catch (error) {
    return fail(error, "No se pudo guardar el borrador.");
  }
}

export async function discardDraftAction(uid: number): Promise<ActionResult> {
  const user = await requireUser();
  try {
    await deleteDraft(user, uid);
    return ok();
  } catch (error) {
    return fail(error, "No se pudo descartar el borrador.");
  }
}

export interface DraftContent {
  uid: number;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  inReplyTo: string | null;
  references: string[];
}

/** Abre un borrador guardado en el redactor. */
export async function loadDraftAction(folder: string, uid: number): Promise<DraftContent | null> {
  const user = await requireUser();
  const detail = await getMessage(user, folder, uid, { markSeen: false });
  if (!detail) return null;
  const list = (items: { name: string; address: string }[]) =>
    items.map((a) => (a.name ? `${a.name} <${a.address}>` : a.address)).join(", ");
  return {
    uid,
    to: list(detail.to),
    cc: list(detail.cc),
    bcc: list(detail.bcc),
    subject: detail.subject,
    text: detail.text,
    inReplyTo: detail.inReplyTo,
    references: detail.references,
  };
}
