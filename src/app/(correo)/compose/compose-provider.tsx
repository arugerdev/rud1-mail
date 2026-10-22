"use client";

import * as React from "react";

import type { DraftContent } from "@/app/actions/mail";
import type { MessageDetail } from "@/lib/mail/messages";
import {
  formatAddress,
  forwardSubject,
  quoteForForward,
  quoteForReply,
  replySubject,
  type AddressLike,
} from "@/lib/mail/text";

import { Composer } from "./composer";

export type ComposeRequest =
  | { mode: "new"; to?: string }
  | { mode: "reply" | "replyAll" | "forward"; source: MessageDetail }
  | { mode: "draft"; draft: DraftContent };

export interface ComposeState {
  /** Cambia en cada apertura para que el redactor empiece de cero. */
  key: number;
  mode: "new" | "reply" | "replyAll" | "forward" | "draft";
  title: string;
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  text: string;
  inReplyTo: string | null;
  references: string[];
  source: { folder: string; uid: number } | null;
  /** Adjuntos del original que se pueden reenviar. */
  forwardAttachments: number;
  draftUid: number | null;
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

function list(addresses: AddressLike[]): string {
  return addresses.map(formatAddress).join(", ");
}

function uniqueExcept(addresses: AddressLike[], exclude: string[]): AddressLike[] {
  const seen = new Set(exclude.map((e) => e.toLowerCase()));
  return addresses.filter((a) => {
    const key = a.address.toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

let counter = 0;

function stateFor(request: ComposeRequest, userEmail: string): ComposeState {
  const base = {
    key: ++counter,
    cc: "",
    bcc: "",
    inReplyTo: null,
    references: [] as string[],
    source: null,
    forwardAttachments: 0,
    draftUid: null,
  };

  if (request.mode === "new") {
    return { ...base, mode: "new", title: "Mensaje nuevo", to: request.to ?? "", subject: "", text: "" };
  }

  if (request.mode === "draft") {
    const d = request.draft;
    return {
      ...base,
      mode: "draft",
      title: "Borrador",
      to: d.to,
      cc: d.cc,
      bcc: d.bcc,
      subject: d.subject,
      text: d.text,
      inReplyTo: d.inReplyTo,
      references: d.references,
      draftUid: d.uid,
    };
  }

  const src = request.source;
  const source = { folder: src.folder, uid: src.uid };
  const threading = {
    inReplyTo: src.messageId,
    references: [...src.references, ...(src.messageId ? [src.messageId] : [])],
  };

  if (request.mode === "forward") {
    return {
      ...base,
      mode: "forward",
      title: "Reenviar",
      to: "",
      subject: forwardSubject(src.subject),
      text: quoteForForward(src),
      source,
      forwardAttachments: src.attachments.length,
    };
  }

  const replyTarget = src.replyTo.length > 0 ? src.replyTo : src.from ? [src.from] : [];
  if (request.mode === "reply") {
    return {
      ...base,
      ...threading,
      mode: "reply",
      title: "Responder",
      to: list(uniqueExcept(replyTarget, [])),
      subject: replySubject(src.subject),
      text: quoteForReply(src),
      source,
    };
  }

  // Responder a todos: el remitente y todos los destinatarios, menos uno mismo.
  const to = uniqueExcept([...replyTarget, ...src.to], [userEmail]);
  const cc = uniqueExcept(src.cc, [userEmail, ...to.map((a) => a.address)]);
  return {
    ...base,
    ...threading,
    mode: "replyAll",
    title: "Responder a todos",
    to: list(to),
    cc: list(cc),
    subject: replySubject(src.subject),
    text: quoteForReply(src),
    source,
  };
}

export function ComposeProvider({ userEmail, children }: { userEmail: string; children: React.ReactNode }) {
  const [state, setState] = React.useState<ComposeState | null>(null);
  const dirtyRef = React.useRef(false);

  const open = React.useCallback(
    (request: ComposeRequest) => {
      if (state && dirtyRef.current && !window.confirm("Ya estás escribiendo un mensaje. ¿Descartarlo y empezar otro?")) {
        return;
      }
      dirtyRef.current = false;
      setState(stateFor(request, userEmail));
    },
    [state, userEmail],
  );

  const value = React.useMemo(() => ({ open }), [open]);

  return (
    <ComposeContext.Provider value={value}>
      {children}
      {state && (
        <Composer
          key={state.key}
          initial={state}
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
