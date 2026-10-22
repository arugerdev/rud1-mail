"use client";

import * as React from "react";
import { Loader2, Maximize2, Minimize2, Minus, Paperclip, Save, Send, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import { discardDraftAction, saveDraftAction, sendAction } from "@/app/actions/mail";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";

import { formatSize } from "../nav";
import type { ComposeState } from "./compose-provider";

const MAX_TOTAL = 25 * 1024 * 1024;

function Field({
  label,
  children,
  extra,
}: {
  label: string;
  children: React.ReactNode;
  extra?: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 border-b border-border/40 px-4">
      <span className="w-12 shrink-0 text-sm text-muted-foreground">{label}</span>
      {children}
      {extra}
    </label>
  );
}

const inputClass =
  "min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none placeholder:text-muted-foreground/60";

export function Composer({
  initial,
  onClose,
  onDirtyChange,
}: {
  initial: ComposeState;
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [to, setTo] = React.useState(initial.to);
  const [cc, setCc] = React.useState(initial.cc);
  const [bcc, setBcc] = React.useState(initial.bcc);
  const [showCopies, setShowCopies] = React.useState(Boolean(initial.cc || initial.bcc));
  const [subject, setSubject] = React.useState(initial.subject);
  const [text, setText] = React.useState(initial.text);
  const [files, setFiles] = React.useState<File[]>([]);
  const [keepAttachments, setKeepAttachments] = React.useState(initial.forwardAttachments > 0);
  const [draftUid, setDraftUid] = React.useState<number | null>(initial.draftUid);
  const [minimized, setMinimized] = React.useState(false);
  const [maximized, setMaximized] = React.useState(false);
  const [sending, startSending] = React.useTransition();
  const [saving, startSaving] = React.useTransition();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const toRef = React.useRef<HTMLInputElement>(null);

  const dirty =
    to !== initial.to ||
    cc !== initial.cc ||
    bcc !== initial.bcc ||
    subject !== initial.subject ||
    text !== initial.text ||
    files.length > 0;
  React.useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  // Al responder se escribe arriba de la cita; si no, se empieza por el destinatario.
  React.useEffect(() => {
    if (initial.mode === "reply" || initial.mode === "replyAll") {
      const el = bodyRef.current;
      el?.focus();
      el?.setSelectionRange(0, 0);
      if (el) el.scrollTop = 0;
    } else {
      toRef.current?.focus();
    }
  }, [initial.mode]);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  function formData(): FormData {
    const fd = new FormData();
    fd.set("to", to);
    fd.set("cc", cc);
    fd.set("bcc", bcc);
    fd.set("subject", subject);
    fd.set("text", text);
    fd.set("mode", initial.mode);
    fd.set("references", JSON.stringify(initial.references));
    if (initial.inReplyTo) fd.set("inReplyTo", initial.inReplyTo);
    if (initial.source) {
      fd.set("sourceFolder", initial.source.folder);
      fd.set("sourceUid", String(initial.source.uid));
    }
    if (keepAttachments) fd.set("keepAttachments", "1");
    if (draftUid) fd.set("draftUid", String(draftUid));
    for (const f of files) fd.append("attachments", f);
    return fd;
  }

  function send() {
    if (!to.trim() && !cc.trim() && !bcc.trim()) {
      toast.error("Añade al menos un destinatario.");
      toRef.current?.focus();
      return;
    }
    if (!subject.trim() && !window.confirm("El mensaje no tiene asunto. ¿Enviarlo igualmente?")) return;
    startSending(async () => {
      const result = await sendAction(formData());
      if (!result.ok) {
        toast.error(result.error ?? "No se pudo enviar el mensaje.");
        return;
      }
      toast.success("Mensaje enviado");
      onClose();
    });
  }

  function saveDraft(closeAfter: boolean) {
    startSaving(async () => {
      const result = await saveDraftAction(formData());
      if (!result.ok) {
        toast.error(result.error ?? "No se pudo guardar el borrador.");
        if (closeAfter && window.confirm("No se pudo guardar el borrador. ¿Cerrar y perder el mensaje?")) onClose();
        return;
      }
      if (result.uid) setDraftUid(result.uid);
      toast.success("Guardado en Borradores");
      if (closeAfter) onClose();
    });
  }

  function close() {
    if (dirty) saveDraft(true);
    else onClose();
  }

  function discard() {
    if (dirty && !window.confirm("¿Descartar este mensaje?")) return;
    if (draftUid) void discardDraftAction(draftUid);
    onClose();
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    if (next.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL) {
      toast.error("Los adjuntos no pueden pasar de 25 MB en total.");
      return;
    }
    setFiles(next);
  }

  const busy = sending || saving;

  return (
    <div
      role="dialog"
      aria-label={initial.title}
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden border border-border/50 bg-background/95 shadow-glass-xl backdrop-blur-2xl",
        maximized
          ? "inset-2 rounded-2xl md:inset-8"
          : minimized
            ? "bottom-0 right-4 h-12 w-72 rounded-t-2xl"
            : "inset-0 md:inset-auto md:bottom-0 md:right-6 md:h-[min(640px,88dvh)] md:w-[600px] md:rounded-t-2xl",
      )}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
          e.preventDefault();
          send();
        }
      }}
    >
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border/40 bg-surface-1/70 pl-4 pr-1">
        <button
          type="button"
          className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
          onClick={() => setMinimized((m) => !m)}
        >
          {subject.trim() || initial.title}
        </button>
        <Button variant="ghost" size="icon" className="size-8" aria-label={minimized ? "Abrir" : "Minimizar"} onClick={() => setMinimized((m) => !m)}>
          <Minus />
        </Button>
        {!minimized && (
          <Button
            variant="ghost"
            size="icon"
            className="hidden size-8 md:inline-flex"
            aria-label={maximized ? "Reducir" : "Ampliar"}
            onClick={() => setMaximized((m) => !m)}
          >
            {maximized ? <Minimize2 /> : <Maximize2 />}
          </Button>
        )}
        <Button variant="ghost" size="icon" className="size-8" aria-label="Cerrar (se guarda como borrador)" title="Cerrar" onClick={close} disabled={busy}>
          <X />
        </Button>
      </div>

      {!minimized && (
        <>
          <Field
            label="Para"
            extra={
              !showCopies && (
                <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowCopies(true)}>
                  CC / CCO
                </button>
              )
            }
          >
            <input
              ref={toRef}
              className={inputClass}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="nombre@empresa.com, otra@empresa.com"
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          {showCopies && (
            <>
              <Field label="CC">
                <input className={inputClass} value={cc} onChange={(e) => setCc(e.target.value)} autoComplete="off" spellCheck={false} />
              </Field>
              <Field label="CCO">
                <input className={inputClass} value={bcc} onChange={(e) => setBcc(e.target.value)} autoComplete="off" spellCheck={false} />
              </Field>
            </>
          )}
          <Field label="Asunto">
            <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} />
          </Field>

          <textarea
            ref={bodyRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="min-h-0 flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed outline-none"
            placeholder="Escribe tu mensaje…"
          />

          {(files.length > 0 || initial.forwardAttachments > 0) && (
            <div className="max-h-28 shrink-0 space-y-1.5 overflow-y-auto border-t border-border/40 px-4 py-2">
              {initial.forwardAttachments > 0 && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={keepAttachments} onChange={(e) => setKeepAttachments(e.target.checked)} />
                  Incluir {initial.forwardAttachments === 1 ? "el adjunto" : `los ${initial.forwardAttachments} adjuntos`} del mensaje original
                </label>
              )}
              <ul className="flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <li
                    key={`${f.name}-${i}`}
                    className="flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-border/50 bg-surface-1/60 py-1 pl-2 pr-1 text-xs"
                  >
                    <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 truncate">{f.name}</span>
                    <span className="shrink-0 text-muted-foreground">{formatSize(f.size)}</span>
                    <button
                      type="button"
                      aria-label={`Quitar ${f.name}`}
                      className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex shrink-0 items-center gap-1 border-t border-border/40 px-3 py-2">
            <Button onClick={send} disabled={busy}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
              Enviar
            </Button>
            <input
              ref={fileInput}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
            />
            <Button variant="ghost" size="icon" aria-label="Adjuntar archivos" title="Adjuntar archivos" onClick={() => fileInput.current?.click()} disabled={busy}>
              <Paperclip />
            </Button>
            <Button variant="ghost" size="icon" aria-label="Guardar borrador" title="Guardar borrador" onClick={() => saveDraft(false)} disabled={busy}>
              {saving ? <Loader2 className="animate-spin" /> : <Save />}
            </Button>
            {totalSize > 0 && <span className="text-xs text-muted-foreground">{formatSize(totalSize)}</span>}
            <span className="ml-auto hidden text-[11px] text-muted-foreground md:inline">Ctrl + Intro para enviar</span>
            <Button variant="ghost" size="icon" aria-label="Descartar" title="Descartar" onClick={discard} disabled={busy}>
              <Trash2 />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
