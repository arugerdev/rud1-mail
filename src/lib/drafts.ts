import "server-only";

import { db } from "@/lib/db";

/**
 * Datos de los borradores escritos en rud1 Mail. El borrador también se
 * guarda en la carpeta Borradores (para verlo desde el móvil), pero ahí va ya
 * montado con firma, pie y cita: para seguir editándolo tal cual se dejó hace
 * falta el texto original, que se guarda aquí con su Message-ID.
 */

export interface DraftRecipient {
  address: string;
  name?: string;
}

export interface DraftData {
  to: DraftRecipient[];
  cc: DraftRecipient[];
  bcc: DraftRecipient[];
  subject: string;
  bodyHtml: string;
  mode: "new" | "reply" | "replyAll" | "forward";
  source: { folder: string; uid: number } | null;
  includeQuote: boolean;
  keepAttachments: boolean;
  inReplyTo: string | null;
  references: string[];
}

export function saveDraftData(owner: string, messageId: string, data: DraftData): void {
  db()
    .prepare(
      `INSERT INTO drafts (owner, message_id, data, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(owner, message_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(owner, messageId, JSON.stringify(data), Date.now());
}

export function getDraftData(owner: string, messageId: string): DraftData | null {
  const row = db().prepare(`SELECT data FROM drafts WHERE owner = ? AND message_id = ?`).get(owner, messageId) as
    | { data: string }
    | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.data) as DraftData;
  } catch {
    return null;
  }
}

export function deleteDraftData(owner: string, messageId: string): void {
  db().prepare(`DELETE FROM drafts WHERE owner = ? AND message_id = ?`).run(owner, messageId);
}
