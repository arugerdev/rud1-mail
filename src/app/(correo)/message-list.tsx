"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
  Mail,
  MailOpen,
  Paperclip,
  SearchX,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  deleteForeverAction,
  loadDraftAction,
  moveToSpecialAction,
  setFlaggedAction,
  setSeenAction,
  type ActionResult,
} from "@/app/actions/mail";
import type { SpecialUse } from "@/lib/mail/folders";
import type { MessagePage, MessageSummary } from "@/lib/mail/messages";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";

import { Avatar } from "./avatar";
import { useCompose } from "./compose/compose-provider";
import { mailHref, shortDate } from "./nav";

function displayName(a: { name: string; address: string } | null | undefined): string {
  if (!a) return "(sin remitente)";
  return a.name || a.address;
}

/** Dirección cuya foto se enseña en la fila: el destinatario en Enviados y Borradores. */
function counterpartAddress(msg: MessageSummary, specialUse: SpecialUse | null): string | null {
  if (specialUse === "sent" || specialUse === "drafts") return msg.to[0]?.address ?? null;
  return msg.from?.address ?? null;
}

/** En Enviados y Borradores interesa a quién va, no quién lo manda. */
function counterpart(msg: MessageSummary, specialUse: SpecialUse | null): string {
  if (specialUse === "sent" || specialUse === "drafts") {
    const names = msg.to.map(displayName);
    return names.length > 0 ? `Para: ${names.join(", ")}` : "(sin destinatario)";
  }
  return displayName(msg.from);
}

export function useMailAction() {
  const [pending, startTransition] = React.useTransition();
  const run = React.useCallback(
    (work: () => Promise<ActionResult>, success?: string, after?: () => void) => {
      startTransition(async () => {
        const result = await work();
        if (!result.ok) {
          toast.error(result.error ?? "Algo ha fallado.");
          return;
        }
        if (success) toast.success(success);
        after?.();
      });
    },
    [],
  );
  return { pending, run };
}

function BulkBar({
  folder,
  specialUse,
  selected,
  allSeen,
  onDone,
}: {
  folder: string;
  specialUse: SpecialUse | null;
  selected: number[];
  allSeen: boolean;
  onDone: () => void;
}) {
  const { pending, run } = useMailAction();
  const n = selected.length;
  const plural = n === 1 ? "mensaje" : "mensajes";
  const inTrash = specialUse === "trash";
  const inJunk = specialUse === "junk";

  return (
    <div className="flex items-center gap-0.5">
      {pending && <Loader2 className="mx-1 size-4 animate-spin text-muted-foreground" />}
      <Button
        variant="ghost"
        size="icon"
        disabled={pending}
        title={allSeen ? "Marcar como no leído" : "Marcar como leído"}
        aria-label={allSeen ? "Marcar como no leído" : "Marcar como leído"}
        onClick={() => run(() => setSeenAction(folder, selected, !allSeen), undefined, onDone)}
      >
        {allSeen ? <Mail /> : <MailOpen />}
      </Button>
      {specialUse !== "archive" && !inTrash && (
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          title="Archivar"
          aria-label="Archivar"
          onClick={() => run(() => moveToSpecialAction(folder, selected, "archive"), `${n} ${plural} archivados`, onDone)}
        >
          <Archive />
        </Button>
      )}
      {inJunk ? (
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          title="No es spam"
          aria-label="No es spam"
          onClick={() => run(() => moveToSpecialAction(folder, selected, "inbox"), "Movidos a la bandeja de entrada", onDone)}
        >
          <ShieldCheck />
        </Button>
      ) : (
        !inTrash && (
          <Button
            variant="ghost"
            size="icon"
            disabled={pending}
            title="Es spam"
            aria-label="Es spam"
            onClick={() => run(() => moveToSpecialAction(folder, selected, "junk"), "Movidos a spam", onDone)}
          >
            <ShieldAlert />
          </Button>
        )
      )}
      {inTrash || inJunk ? (
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          title="Borrar para siempre"
          aria-label="Borrar para siempre"
          onClick={() => {
            if (!window.confirm(`¿Borrar para siempre ${n} ${plural}? No se puede deshacer.`)) return;
            run(() => deleteForeverAction(folder, selected), `${n} ${plural} borrados`, onDone);
          }}
        >
          <Trash2 className="text-destructive" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          title="Mover a la papelera"
          aria-label="Mover a la papelera"
          onClick={() => run(() => moveToSpecialAction(folder, selected, "trash"), `${n} ${plural} en la papelera`, onDone)}
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}

function Row({
  msg,
  folder,
  specialUse,
  page,
  query,
  active,
  checked,
  onCheck,
  isNew,
  index,
  compact,
}: {
  compact: boolean;
  isNew: boolean;
  index: number;
  msg: MessageSummary;
  folder: string;
  specialUse: SpecialUse | null;
  page: number;
  query: string;
  active: boolean;
  checked: boolean;
  onCheck: (checked: boolean) => void;
}) {
  const compose = useCompose();
  const { run } = useMailAction();
  const [flagged, setFlagged] = React.useState(msg.flagged);
  React.useEffect(() => setFlagged(msg.flagged), [msg.flagged]);
  const unread = !msg.seen;
  const isDraft = specialUse === "drafts" || msg.draft;
  const href = mailHref({ carpeta: folder, pagina: page, buscar: query || undefined, mensaje: msg.uid });

  const openDraft = async (e: React.MouseEvent) => {
    e.preventDefault();
    const draft = await loadDraftAction(folder, msg.uid);
    if (!draft) {
      toast.error("No se encontró el borrador.");
      return;
    }
    compose.open({ mode: "draft", draft });
  };

  return (
    <li
      className={cn(
        "rud1-in group relative flex items-start gap-3 border-b border-border/30 px-3 transition-colors",
        compact ? "py-1.5" : "py-2.5",
        active ? "bg-primary-soft/30" : "hover:bg-surface-1/60",
        checked && !active && "bg-surface-2/50",
        isNew && "rud1-new",
      )}
      // Entrada escalonada, solo las primeras filas (las demás ya están fuera de la vista).
      style={{ animationDelay: index < 14 ? `${index * 18}ms` : undefined }}
    >
      {/* Por encima del enlace de la fila, que ocupa toda la fila. */}
      <div className="relative z-10 flex flex-col items-center gap-2 pt-0.5">
        <Checkbox checked={checked} onChange={(e) => onCheck(e.target.checked)} aria-label="Seleccionar" />
        <button
          type="button"
          aria-label={flagged ? "Quitar destacado" : "Destacar"}
          title={flagged ? "Quitar destacado" : "Destacar"}
          className={cn(
            "rounded p-0.5 transition-colors",
            flagged ? "text-warning" : "text-muted-foreground/40 hover:text-muted-foreground",
          )}
          onClick={() => {
            setFlagged(!flagged);
            run(() => setFlaggedAction(folder, [msg.uid], !flagged));
          }}
        >
          <Star className={cn("size-4", flagged && "fill-current")} />
        </button>
      </div>
      <Link
        href={href}
        onClick={isDraft ? openDraft : undefined}
        className="min-w-0 flex-1 focus-visible:outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring"
        scroll={false}
      >
        <div className="flex items-center gap-2">
          {unread && <span className="size-2 shrink-0 rounded-full bg-primary" aria-label="Sin leer" />}
          {counterpartAddress(msg, specialUse) && (
            <Avatar
              email={counterpartAddress(msg, specialUse)!}
              name={counterpart(msg, specialUse).replace(/^Para: /, "")}
              className="size-6 text-[9px]"
            />
          )}
          <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-semibold text-foreground" : "text-foreground/80")}>
            {isDraft && <span className="mr-1 text-destructive">Borrador</span>}
            {counterpart(msg, specialUse)}
          </span>
          <time className={cn("shrink-0 text-xs tabular-nums", unread ? "font-semibold text-primary" : "text-muted-foreground")}>
            {shortDate(msg.date)}
          </time>
        </div>
        <div className="mt-0.5 flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-medium text-foreground" : "text-muted-foreground")}>
            {msg.subject || "(sin asunto)"}
          </span>
          {msg.hasAttachments && <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-label="Con adjuntos" />}
        </div>
      </Link>
    </li>
  );
}

export function MessageList({
  folder,
  folderName,
  specialUse,
  list,
  query,
  selectedUid,
  compact = false,
}: {
  compact?: boolean;
  folder: string;
  folderName: string;
  specialUse: SpecialUse | null;
  list: MessagePage;
  query: string;
  selectedUid: number | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = React.useState<number[]>([]);
  // Al cambiar de carpeta, página o búsqueda, la selección se vacía.
  React.useEffect(() => setSelected([]), [folder, list.page, query]);

  const uids = list.items.map((m) => m.uid);

  // Los que llegan con la bandeja abierta se iluminan un momento.
  const maxSeen = React.useRef<{ key: string; uid: number } | null>(null);
  const listKey = `${folder}|${query}|${list.page}`;
  const previousMax = maxSeen.current?.key === listKey ? maxSeen.current.uid : Infinity;
  React.useEffect(() => {
    maxSeen.current = { key: listKey, uid: Math.max(0, ...uids) };
  });
  const allChecked = selected.length > 0 && selected.length === uids.length;
  const someChecked = selected.length > 0 && !allChecked;
  const allSeen = list.items.filter((m) => selected.includes(m.uid)).every((m) => m.seen);
  const from = list.total === 0 ? 0 : (list.page - 1) * 50 + 1;
  const to = Math.min(list.total, list.page * 50);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/40 px-3">
        <Checkbox
          checked={allChecked}
          indeterminate={someChecked}
          onChange={(e) => setSelected(e.target.checked ? uids : [])}
          aria-label="Seleccionar todos"
          disabled={uids.length === 0}
        />
        {selected.length > 0 ? (
          <>
            <span className="text-sm text-muted-foreground">{selected.length} seleccionados</span>
            <div className="ml-auto">
              <BulkBar
                folder={folder}
                specialUse={specialUse}
                selected={selected}
                allSeen={allSeen}
                onDone={() => {
                  setSelected([]);
                  if (selectedUid && selected.includes(selectedUid)) {
                    router.push(mailHref({ carpeta: folder, pagina: list.page, buscar: query || undefined }));
                  }
                }}
              />
            </div>
          </>
        ) : (
          <>
            <h1 className="min-w-0 truncate text-sm font-semibold">
              {query ? (
                <span className="flex items-center gap-1.5">
                  Resultados de «{query}»
                  <Link
                    href={mailHref({ carpeta: folder })}
                    className="rounded p-0.5 text-muted-foreground hover:text-foreground"
                    aria-label="Quitar la búsqueda"
                  >
                    <X className="size-3.5" />
                  </Link>
                </span>
              ) : (
                folderName
              )}
            </h1>
            <div className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
              <span className="tabular-nums">{list.total > 0 ? `${from}–${to} de ${list.total}` : ""}</span>
              <Button variant="ghost" size="icon" className="size-8" disabled={list.page <= 1} asChild={list.page > 1} aria-label="Página anterior">
                {list.page > 1 ? (
                  <Link href={mailHref({ carpeta: folder, pagina: list.page - 1, buscar: query || undefined })}>
                    <ChevronLeft />
                  </Link>
                ) : (
                  <ChevronLeft />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={list.page >= list.pages}
                asChild={list.page < list.pages}
                aria-label="Página siguiente"
              >
                {list.page < list.pages ? (
                  <Link href={mailHref({ carpeta: folder, pagina: list.page + 1, buscar: query || undefined })}>
                    <ChevronRight />
                  </Link>
                ) : (
                  <ChevronRight />
                )}
              </Button>
            </div>
          </>
        )}
      </div>

      {list.items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
          {query ? <SearchX className="size-10 opacity-40" /> : <Inbox className="size-10 opacity-40" />}
          <p className="text-sm">{query ? "No hay mensajes que coincidan con la búsqueda." : "No hay mensajes en esta carpeta."}</p>
        </div>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {list.items.map((msg, i) => (
            <Row
              key={msg.uid}
              msg={msg}
              folder={folder}
              specialUse={specialUse}
              page={list.page}
              query={query}
              active={msg.uid === selectedUid}
              isNew={msg.uid > previousMax}
              compact={compact}
              index={i}
              checked={selected.includes(msg.uid)}
              onCheck={(checked) =>
                setSelected((prev) => (checked ? [...prev, msg.uid] : prev.filter((u) => u !== msg.uid)))
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export function EmptyViewer({ notFound }: { notFound: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
      <MailOpen className="size-12 opacity-30" />
      <p className="text-sm">{notFound ? "Ese mensaje ya no está en esta carpeta." : "Elige un mensaje para leerlo."}</p>
    </div>
  );
}
