"use client";

import * as React from "react";

import type { DraftContent } from "@/app/actions/mail";
import type { MessageDetail } from "@/lib/mail/messages";
import { forwardSubject, replySubject } from "@/lib/mail/text";

import { Composer } from "./composer";
import type { Recipient } from "./recipient-input";

export type ComposeRequest =
  | { mode: "new"; to?: string; cc?: string; bcc?: string; subject?: string; text?: string }
  | { mode: "reply" | "replyAll" | "forward"; source: MessageDetail }
  | { mode: "draft"; draft: DraftContent };

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export interface Identity {
  address: string;
  name: string;
}

export interface ComposeState {
  /** Cambia en cada apertura para que el redactor empiece de cero. */
  key: number;
  /** Dirección desde la que se envía (la propia o un buzón común permitido). */
  from: string;
  /** Con qué se monta el mensaje (cita, cabecera…). Un borrador conserva el suyo. */
  mode: ComposeMode;
  title: string;
  to: Recipient[];
  cc: Recipient[];
  bcc: Recipient[];
  subject: string;
  bodyHtml: string;
  inReplyTo: string | null;
  references: string[];
  source: { folder: string; uid: number } | null;
  /** Resumen del mensaje al que se responde o que se reenvía. */
  quoteSummary: string | null;
  includeQuote: boolean;
  /** Adjuntos del original que se pueden reenviar. */
  forwardAttachments: number;
  keepAttachments: boolean;
  draftUid: number | null;
  draftMessageId: string | null;
}

interface ComposeContextValue {
  open: (request: ComposeRequest) => void;
}

const ComposeContext = React.createContext<ComposeContextValue | null>(null);

export function useCompose(): ComposeContextValue {
  const ctx = React.useContext(ComposeContext);
  if (!ctx) throw new Error("useCompose fuera de ComposeProvider");
  return ctx;
}

function uniqueExcept(list: Recipient[], exclude: string[]): Recipient[] {
  const seen = new Set(exclude.map((e) => e.toLowerCase()));
  return list.filter((r) => {
    const key = r.address.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function fromList(raw: string | undefined): Recipient[] {
  return (raw ?? "")
    .split(/[,;]+/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(.*)<\s*([^>]+)\s*>$/);
      return m ? { name: m[1].trim().replace(/^"|"$/g, ""), address: m[2].trim() } : { address: p };
    });
}

function textToParagraphs(text: string): string {
  if (!text) return "";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split(/\n{2,}/)
    .map((block) => `<p>${esc(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function shortDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(iso));
}

let counter = 0;

/** Buzón común de una carpeta "Shared/<buzón>/…", si lo es. */
function ownerOf(folder: string): string | null {
  const m = folder.match(/^Shared\/([^/]+)\//);
  return m ? m[1].toLowerCase() : null;
}

function stateFor(request: ComposeRequest, userEmail: string, identities: Identity[]): ComposeState {
  const allowed = new Set(identities.map((i) => i.address));
  const base = {
    key: ++counter,
    from: userEmail,
    to: [] as Recipient[],
    cc: [] as Recipient[],
    bcc: [] as Recipient[],
    subject: "",
    bodyHtml: "",
    inReplyTo: null,
    references: [] as string[],
    source: null,
    quoteSummary: null,
    includeQuote: true,
    forwardAttachments: 0,
    keepAttachments: false,
    draftUid: null,
    draftMessageId: null,
  };

  if (request.mode === "new") {
    return {
      ...base,
      mode: "new",
      title: "Mensaje nuevo",
      to: fromList(request.to),
      cc: fromList(request.cc),
      bcc: fromList(request.bcc),
      subject: request.subject ?? "",
      bodyHtml: textToParagraphs(request.text ?? ""),
    };
  }

  if (request.mode === "draft") {
    const d = request.draft;
    return {
      ...base,
      mode: d.mode,
      title: "Borrador",
      from: d.from && allowed.has(d.from) ? d.from : userEmail,
      to: d.to,
      cc: d.cc,
      bcc: d.bcc,
      subject: d.subject,
      bodyHtml: d.bodyHtml,
      inReplyTo: d.inReplyTo,
      references: d.references,
      source: d.source,
      quoteSummary: d.source ? "Mensaje original" : null,
      includeQuote: d.includeQuote,
      keepAttachments: d.keepAttachments,
      draftUid: d.uid,
      draftMessageId: d.messageId,
    };
  }

  const src = request.source;
  const who = src.from ? src.from.name || src.from.address : "alguien";
  const quoteSummary = `${who} · ${shortDate(src.date)} · ${src.subject || "(sin asunto)"}`;
  const source = { folder: src.folder, uid: src.uid };
  // Si se responde desde un buzón común y se puede enviar como él, sale desde él.
  const sharedOwner = ownerOf(src.folder);
  const from = sharedOwner && allowed.has(sharedOwner) ? sharedOwner : userEmail;
  const threading = {
    inReplyTo: src.messageId,
    references: [...src.references, ...(src.messageId ? [src.messageId] : [])],
  };

  if (request.mode === "forward") {
    return {
      ...base,
      mode: "forward",
      title: "Reenviar",
      from,
      subject: forwardSubject(src.subject),
      source,
      quoteSummary,
      forwardAttachments: src.attachments.length,
      keepAttachments: src.attachments.length > 0,
    };
  }

  const replyTarget: Recipient[] = (src.replyTo.length > 0 ? src.replyTo : src.from ? [src.from] : []).map((a) => ({
    address: a.address,
    name: a.name,
  }));
  if (request.mode === "reply") {
    return {
      ...base,
      ...threading,
      mode: "reply",
      title: "Responder",
      from,
      to: uniqueExcept(replyTarget, []),
      subject: replySubject(src.subject),
      source,
      quoteSummary,
    };
  }

  // Responder a todos: el remitente y todos los destinatarios, menos uno mismo (y el buzón común desde el que se responde).
  const me = [userEmail, from];
  const to = uniqueExcept([...replyTarget, ...src.to.map((a) => ({ address: a.address, name: a.name }))], me);
  const cc = uniqueExcept(
    src.cc.map((a) => ({ address: a.address, name: a.name })),
    [...me, ...to.map((a) => a.address)],
  );
  return {
    ...base,
    ...threading,
    mode: "replyAll",
    title: "Responder a todos",
    from,
    to,
    cc,
    subject: replySubject(src.subject),
    source,
    quoteSummary,
  };
}

export function ComposeProvider({
  userEmail,
  identities,
  children,
}: {
  userEmail: string;
  identities: Identity[];
  children: React.ReactNode;
}) {
  const [state, setState] = React.useState<ComposeState | null>(null);
  const dirtyRef = React.useRef(false);

  const open = React.useCallback(
    (request: ComposeRequest) => {
      if (state && dirtyRef.current && !window.confirm("Ya estás escribiendo un mensaje. ¿Descartarlo y empezar otro?")) {
        return;
      }
      dirtyRef.current = false;
      setState(stateFor(request, userEmail, identities));
    },
    [state, userEmail, identities],
  );

  const value = React.useMemo(() => ({ open }), [open]);

  return (
    <ComposeContext.Provider value={value}>
      {children}
      {state && (
        <Composer
          key={state.key}
          initial={state}
          identities={identities}
          onDirtyChange={(dirty) => {
            dirtyRef.current = dirty;
          }}
          onClose={() => {
            dirtyRef.current = false;
            setState(null);
          }}
        />
      )}
    </ComposeContext.Provider>
  );
}
