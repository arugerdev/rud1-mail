"use client";

import * as React from "react";
import {
  Check,
  Eye,
  Loader2,
  Maximize2,
  Minimize2,
  Minus,
  Monitor,
  Paperclip,
  Save,
  Send,
  Smartphone,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { discardDraftAction, previewAction, saveDraftAction, sendAction } from "@/app/actions/mail";
import { cn } from "@/lib/utils";
import { RichEditor, type RichEditorHandle } from "@/shared/components/rich-editor";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { useSpring } from "@/shared/hooks/use-spring";

import { formatSize } from "../nav";
import { useSounds } from "../sound-provider";
import type { ComposeState, Identity } from "./compose-provider";
import { RecipientInput, type Recipient } from "./recipient-input";

const MAX_TOTAL = 25 * 1024 * 1024;
/** Tras este rato sin escribir, el borrador se guarda solo. */
const AUTOSAVE_MS = 15_000;

function Row({ label, children, extra }: { label: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 border-b border-border/40 px-4">
      <span className="w-14 shrink-0 pt-2.5 text-sm text-muted-foreground">{label}</span>
      {children}
      {extra && <div className="shrink-0 pt-2">{extra}</div>}
    </div>
  );
}

function PreviewDialog({ document, onClose }: { document: string | null; onClose: () => void }) {
  const [width, setWidth] = React.useState<"desktop" | "mobile">("desktop");
  return (
    <Dialog open={document !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] max-w-4xl gap-3 overflow-hidden">
        <DialogHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <DialogTitle>Así lo recibirá</DialogTitle>
          <div className="mr-8 flex rounded-xl border border-border/50 p-0.5">
            {(["desktop", "mobile"] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setWidth(w)}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs",
                  width === w ? "bg-primary-soft/50 text-primary-foreground dark:text-primary" : "text-muted-foreground",
                )}
              >
                {w === "desktop" ? <Monitor className="size-3.5" /> : <Smartphone className="size-3.5" />}
                {w === "desktop" ? "Ordenador" : "Móvil"}
              </button>
            ))}
          </div>
        </DialogHeader>
        <div className="flex min-h-0 justify-center overflow-auto rounded-xl bg-muted/40 p-3">
          {document && (
            <iframe
              title="Vista previa del mensaje"
              srcDoc={document}
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              className="h-[70dvh] rounded-lg border border-border/40 bg-white shadow-glass-sm transition-[width] duration-300"
              style={{ width: width === "desktop" ? "100%" : 375, maxWidth: "100%" }}
            />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Con tu firma, la cabecera y el pie de rud1 y, si lo has dejado marcado, el mensaje original.
        </p>
      </DialogContent>
    </Dialog>
  );
}

export function Composer({
  initial,
  identities,
  onClose,
  onDirtyChange,
}: {
  initial: ComposeState;
  identities: Identity[];
  onClose: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [from, setFrom] = React.useState(initial.from);
  const [to, setTo] = React.useState<Recipient[]>(initial.to);
  const [cc, setCc] = React.useState<Recipient[]>(initial.cc);
  const [bcc, setBcc] = React.useState<Recipient[]>(initial.bcc);
  const [showCopies, setShowCopies] = React.useState(initial.cc.length + initial.bcc.length > 0);
  const [subject, setSubject] = React.useState(initial.subject);
  const [bodyHtml, setBodyHtml] = React.useState(initial.bodyHtml);
  const [includeQuote, setIncludeQuote] = React.useState(initial.includeQuote);
  const [keepAttachments, setKeepAttachments] = React.useState(initial.keepAttachments);
  const [files, setFiles] = React.useState<File[]>([]);
  // En refs: el envío tiene que ver el último borrador guardado, aunque el
  // guardado automático haya terminado un instante antes.
  const draftUid = React.useRef<number | null>(initial.draftUid);
  const draftMessageId = React.useRef<string | null>(initial.draftMessageId);
  const savingRef = React.useRef<Promise<unknown> | null>(null);
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [minimized, setMinimized] = React.useState(false);
  const [maximized, setMaximized] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [sending, startSending] = React.useTransition();
  const [saving, startSaving] = React.useTransition();
  const [previewing, startPreview] = React.useTransition();
  const [dragging, setDragging] = React.useState(false);
  const sounds = useSounds();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const editorRef = React.useRef<RichEditorHandle>(null);
  const toRef = React.useRef<HTMLInputElement>(null);
  const [version, setVersion] = React.useState(0);
  const savedVersion = React.useRef(0);

  // Entra deslizándose desde abajo con un muelle.
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => setShown(true), []);
  const { valor } = useSpring(shown ? 1 : 0, { rigidez: 320, amortiguacion: 30 });

  // Cualquier cambio sube la versión; lo que no esté guardado es "sucio".
  const touch = React.useCallback(() => setVersion((v) => v + 1), []);
  const dirty = version !== savedVersion.current;
  React.useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  React.useEffect(() => {
    if (initial.mode === "reply" || initial.mode === "replyAll") editorRef.current?.focus();
    else if (initial.to.length === 0) toRef.current?.focus();
  }, [initial.mode, initial.to.length]);

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  function formData(): FormData {
    const fd = new FormData();
    fd.set("from", from);
    fd.set("to", JSON.stringify(to));
    fd.set("cc", JSON.stringify(cc));
    fd.set("bcc", JSON.stringify(bcc));
    fd.set("subject", subject);
    fd.set("bodyHtml", editorRef.current?.getHtml() ?? bodyHtml);
    fd.set("mode", initial.mode);
    fd.set("references", JSON.stringify(initial.references));
    if (initial.inReplyTo) fd.set("inReplyTo", initial.inReplyTo);
    if (initial.source) {
      fd.set("sourceFolder", initial.source.folder);
      fd.set("sourceUid", String(initial.source.uid));
    }
    if (includeQuote) fd.set("includeQuote", "1");
    if (keepAttachments) fd.set("keepAttachments", "1");
    if (draftUid.current) fd.set("draftUid", String(draftUid.current));
    if (draftMessageId.current) fd.set("draftMessageId", draftMessageId.current);
    for (const f of files) fd.append("attachments", f);
    return fd;
  }

  function send() {
    if (to.length + cc.length + bcc.length === 0) {
      toast.error("Añade al menos un destinatario.");
      toRef.current?.focus();
      return;
    }
    if (!subject.trim() && !window.confirm("El mensaje no tiene asunto. ¿Enviarlo igualmente?")) return;
    startSending(async () => {
      // Si se está guardando el borrador, se espera: así se borra al enviar y no queda huérfano.
      await savingRef.current?.catch(() => undefined);
      const result = await sendAction(formData());
      if (!result.ok) {
        sounds.play("error");
        toast.error(result.error ?? "No se pudo enviar el mensaje.");
        return;
      }
      sounds.play("enviado");
      toast.success("Mensaje enviado");
      onClose();
    });
  }

  function saveDraft({ closeAfter = false, quiet = false } = {}) {
    const at = version;
    if (savingRef.current) return;
    startSaving(async () => {
      const pending = saveDraftAction(formData());
      savingRef.current = pending;
      const result = await pending.finally(() => {
        savingRef.current = null;
      });
      if (!result.ok) {
        if (!quiet) toast.error(result.error ?? "No se pudo guardar el borrador.");
        if (closeAfter && window.confirm("No se pudo guardar el borrador. ¿Cerrar y perder el mensaje?")) onClose();
        return;
      }
      if (result.uid) draftUid.current = result.uid;
      if (result.messageId) draftMessageId.current = result.messageId;
      savedVersion.current = at;
      setSavedAt(new Date());
      if (!quiet) toast.success("Guardado en Borradores");
      if (closeAfter) onClose();
    });
  }

  // Guardado automático: tras un rato sin cambios, si hay algo que guardar.
  React.useEffect(() => {
    if (!dirty || sending) return;
    const hasSomething = to.length + cc.length + bcc.length > 0 || subject.trim() !== "" || /[^\s]/.test(bodyHtml.replace(/<[^>]+>/g, ""));
    if (!hasSomething) return;
    const timer = window.setTimeout(() => saveDraft({ quiet: true }), AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, dirty, sending]);

  function showPreview() {
    startPreview(async () => {
      const result = await previewAction(formData());
      if (!result.ok || !result.document) {
        toast.error(result.error ?? "No se pudo preparar la vista previa.");
        return;
      }
      setPreview(result.document);
    });
  }

  function close() {
    if (dirty) saveDraft({ closeAfter: true });
    else onClose();
  }

  function discard() {
    if (dirty && !window.confirm("¿Descartar este mensaje?")) return;
    if (draftUid.current) void discardDraftAction(draftUid.current, draftMessageId.current);
    onClose();
  }

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)];
    if (next.reduce((sum, f) => sum + f.size, 0) > MAX_TOTAL) {
      toast.error("Los adjuntos no pueden pasar de 25 MB en total.");
      return;
    }
    setFiles(next);
    touch();
  }

  const busy = sending;
  const mobileFull = !maximized && !minimized;

  return (
    <>
      <div
        role="dialog"
        aria-label={initial.title}
        className={cn(
          "fixed z-50 flex flex-col overflow-hidden border border-border/50 bg-background shadow-glass-xl",
          maximized
            ? "inset-2 rounded-2xl md:inset-8"
            : minimized
              ? "bottom-0 right-4 h-12 w-72 rounded-t-2xl"
              : "inset-0 md:inset-auto md:bottom-0 md:right-6 md:h-[min(720px,90dvh)] md:w-[740px] md:rounded-t-2xl",
          dragging && "ring-2 ring-primary/60",
        )}
        style={{
          transform: mobileFull || minimized ? `translateY(${(1 - Math.min(1, valor)) * 40}px)` : undefined,
          opacity: Math.min(1, Math.max(0, valor * 1.4)),
        }}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            send();
          }
        }}
        data-rud1-composer=""
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            setDragging(true);
          }
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (e.dataTransfer.files.length) {
            e.preventDefault();
            addFiles(e.dataTransfer.files);
          }
          setDragging(false);
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
          <span className="hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
            {saving ? (
              <>
                <Loader2 className="size-3 animate-spin" /> Guardando…
              </>
            ) : savedAt && !dirty ? (
              <>
                <Check className="size-3" /> Guardado{" "}
                {savedAt.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
              </>
            ) : null}
          </span>
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
            {identities.length > 1 && (
              <Row label="De">
                <select
                  aria-label="De"
                  value={from}
                  onChange={(e) => {
                    setFrom(e.target.value);
                    touch();
                  }}
                  className="min-w-0 flex-1 cursor-pointer bg-transparent py-2.5 text-sm outline-none"
                >
                  {identities.map((i) => (
                    <option key={i.address} value={i.address} className="bg-background">
                      {i.name} &lt;{i.address}&gt;
                    </option>
                  ))}
                </select>
              </Row>
            )}
            <Row
              label="Para"
              extra={
                !showCopies && (
                  <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowCopies(true)}>
                    CC / CCO
                  </button>
                )
              }
            >
              <RecipientInput
                value={to}
                onChange={(v) => {
                  setTo(v);
                  touch();
                }}
                inputRef={toRef}
                ariaLabel="Para"
                placeholder="Nombre o dirección"
              />
            </Row>
            {showCopies && (
              <>
                <Row label="CC">
                  <RecipientInput
                    value={cc}
                    onChange={(v) => {
                      setCc(v);
                      touch();
                    }}
                    ariaLabel="Con copia"
                  />
                </Row>
                <Row label="CCO">
                  <RecipientInput
                    value={bcc}
                    onChange={(v) => {
                      setBcc(v);
                      touch();
                    }}
                    ariaLabel="Con copia oculta"
                  />
                </Row>
              </>
            )}
            <Row label="Asunto">
              <input
                aria-label="Asunto"
                className="min-w-0 flex-1 bg-transparent py-2.5 text-sm outline-none"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  touch();
                }}
              />
            </Row>

            <RichEditor
              ref={editorRef}
              initialHtml={initial.bodyHtml}
              placeholder="Escribe tu mensaje…"
              className="min-h-0 flex-1"
              onChange={(html) => {
                setBodyHtml(html);
                touch();
              }}
            />

            {(initial.quoteSummary || initial.forwardAttachments > 0 || files.length > 0) && (
              <div className="max-h-36 shrink-0 space-y-1.5 overflow-y-auto border-t border-border/40 px-4 py-2">
                {initial.quoteSummary && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={includeQuote}
                      onChange={(e) => {
                        setIncludeQuote(e.target.checked);
                        touch();
                      }}
                    />
                    <span className="min-w-0 truncate">
                      Incluir el mensaje original <span className="opacity-70">({initial.quoteSummary})</span>
                    </span>
                  </label>
                )}
                {initial.forwardAttachments > 0 && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Checkbox
                      checked={keepAttachments}
                      onChange={(e) => {
                        setKeepAttachments(e.target.checked);
                        touch();
                      }}
                    />
                    Incluir {initial.forwardAttachments === 1 ? "el adjunto" : `los ${initial.forwardAttachments} adjuntos`} del mensaje original
                  </label>
                )}
                {files.length > 0 && (
                  <ul className="flex flex-wrap gap-1.5">
                    {files.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="rud1-pop flex max-w-[16rem] items-center gap-1.5 rounded-lg border border-border/50 bg-surface-1/60 py-1 pl-2 pr-1 text-xs"
                      >
                        <Paperclip className="size-3 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 truncate">{f.name}</span>
                        <span className="shrink-0 text-muted-foreground">{formatSize(f.size)}</span>
                        <button
                          type="button"
                          aria-label={`Quitar ${f.name}`}
                          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setFiles(files.filter((_, j) => j !== i));
                            touch();
                          }}
                        >
                          <X className="size-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
              <Button variant="ghost" size="icon" aria-label="Adjuntar archivos" title="Adjuntar archivos (o arrástralos aquí)" onClick={() => fileInput.current?.click()} disabled={busy}>
                <Paperclip />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Vista previa" title="Ver cómo lo recibirá" onClick={showPreview} disabled={busy || previewing}>
                {previewing ? <Loader2 className="animate-spin" /> : <Eye />}
              </Button>
              <Button variant="ghost" size="icon" aria-label="Guardar borrador" title="Guardar borrador" onClick={() => saveDraft()} disabled={busy}>
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
      <PreviewDialog document={preview} onClose={() => setPreview(null)} />
    </>
  );
}
