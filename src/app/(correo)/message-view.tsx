"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Download,
  Forward,
  FolderInput,
  ImageOff,
  Loader2,
  Mail,
  MoreHorizontal,
  Paperclip,
  Reply,
  ReplyAll,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";

import {
  deleteForeverAction,
  moveAction,
  moveToSpecialAction,
  setFlaggedAction,
  setSeenAction,
} from "@/app/actions/mail";
import type { Folder, SpecialUse } from "@/lib/mail/folders";
import type { Address, MessageDetail } from "@/lib/mail/messages";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { UserAvatar } from "@/shared/components/ui/user-avatar";

import { useCompose } from "./compose/compose-provider";
import { useMailAction } from "./message-list";
import { MessageFrame } from "./message-frame";
import { formatSize, longDate, mailHref } from "./nav";

function AddressLine({ label, list }: { label: string; list: Address[] }) {
  if (list.length === 0) return null;
  return (
    <p className="truncate text-xs text-muted-foreground">
      <span className="mr-1">{label}</span>
      {list.map((a, i) => (
        <span key={`${a.address}-${i}`} title={a.address}>
          {i > 0 && ", "}
          {a.name || a.address}
        </span>
      ))}
    </p>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
  className,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Button variant="ghost" size="icon" title={label} aria-label={label} onClick={onClick} disabled={disabled} className={className}>
      {children}
    </Button>
  );
}

export function MessageView({
  detail,
  document,
  hasRemoteContent,
  remoteAllowed,
  specialUse,
  folders,
  page,
  query,
}: {
  detail: MessageDetail;
  document: string;
  hasRemoteContent: boolean;
  remoteAllowed: boolean;
  specialUse: SpecialUse | null;
  folders: Folder[];
  page: number;
  query: string;
}) {
  const router = useRouter();
  const compose = useCompose();
  const { pending, run } = useMailAction();
  const [flagged, setFlagged] = React.useState(detail.flagged);
  const folder = detail.folder;
  const listHref = mailHref({ carpeta: folder, pagina: page, buscar: query || undefined });
  const backToList = () => router.push(listHref);
  const inTrash = specialUse === "trash";
  const inJunk = specialUse === "junk";
  const uids = [detail.uid];

  // Al abrir uno sin leer, el contador de la carpeta (en el menú) baja.
  const refreshed = React.useRef(false);
  React.useEffect(() => {
    if (detail.wasUnseen && !refreshed.current) {
      refreshed.current = true;
      router.refresh();
    }
  }, [detail.wasUnseen, router]);

  // Con `mensaje` la dirección ya lleva parámetros: se añade uno más.
  const showImagesHref = `${mailHref({ carpeta: folder, pagina: page, buscar: query || undefined, mensaje: detail.uid })}&imagenes=1`;

  return (
    <article className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-0.5 border-b border-border/40 px-2">
        <Button variant="ghost" size="icon" asChild aria-label="Volver a la lista" title="Volver a la lista">
          <Link href={listHref}>
            <ArrowLeft />
          </Link>
        </Button>
        <div className="mx-1 h-5 w-px bg-border/50" />
        <ToolbarButton label="Responder" onClick={() => compose.open({ mode: "reply", source: detail })}>
          <Reply />
        </ToolbarButton>
        <ToolbarButton label="Responder a todos" onClick={() => compose.open({ mode: "replyAll", source: detail })}>
          <ReplyAll />
        </ToolbarButton>
        <ToolbarButton label="Reenviar" onClick={() => compose.open({ mode: "forward", source: detail })}>
          <Forward />
        </ToolbarButton>
        <div className="mx-1 h-5 w-px bg-border/50" />
        {specialUse !== "archive" && !inTrash && (
          <ToolbarButton
            label="Archivar"
            disabled={pending}
            onClick={() => run(() => moveToSpecialAction(folder, uids, "archive"), "Archivado", backToList)}
          >
            <Archive />
          </ToolbarButton>
        )}
        {inJunk ? (
          <ToolbarButton
            label="No es spam"
            disabled={pending}
            onClick={() => run(() => moveToSpecialAction(folder, uids, "inbox"), "Movido a la bandeja de entrada", backToList)}
          >
            <ShieldCheck />
          </ToolbarButton>
        ) : (
          !inTrash && (
            <ToolbarButton
              label="Es spam"
              disabled={pending}
              onClick={() => run(() => moveToSpecialAction(folder, uids, "junk"), "Movido a spam", backToList)}
            >
              <ShieldAlert />
            </ToolbarButton>
          )
        )}
        {inTrash || inJunk ? (
          <ToolbarButton
            label="Borrar para siempre"
            disabled={pending}
            onClick={() => {
              if (!window.confirm("¿Borrar este mensaje para siempre? No se puede deshacer.")) return;
              run(() => deleteForeverAction(folder, uids), "Mensaje borrado", backToList);
            }}
          >
            <Trash2 className="text-destructive" />
          </ToolbarButton>
        ) : (
          <ToolbarButton
            label="Mover a la papelera"
            disabled={pending}
            onClick={() => run(() => moveToSpecialAction(folder, uids, "trash"), "En la papelera", backToList)}
          >
            <Trash2 />
          </ToolbarButton>
        )}
        {pending && <Loader2 className="mx-1 size-4 animate-spin text-muted-foreground" />}

        <div className="ml-auto flex items-center gap-0.5">
          <ToolbarButton
            label={flagged ? "Quitar destacado" : "Destacar"}
            onClick={() => {
              setFlagged(!flagged);
              run(() => setFlaggedAction(folder, uids, !flagged));
            }}
            className={cn(flagged && "text-warning")}
          >
            <Star className={cn(flagged && "fill-current")} />
          </ToolbarButton>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Más acciones" title="Más acciones">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem onClick={() => run(() => setSeenAction(folder, uids, false), "Marcado como no leído", backToList)}>
                <Mail className="size-4" /> Marcar como no leído
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                <FolderInput className="size-3.5" /> Mover a
              </DropdownMenuLabel>
              {folders
                .filter((f) => f.path !== folder && f.specialUse !== "drafts")
                .map((f) => (
                  <DropdownMenuItem
                    key={f.path}
                    onClick={() => run(() => moveAction(folder, uids, f.path), `Movido a ${f.name}`, backToList)}
                  >
                    <span style={{ paddingLeft: `${f.depth * 0.75}rem` }}>{f.name}</span>
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl space-y-4 p-4 md:p-6">
          <h2 className="text-xl font-semibold leading-snug">{detail.subject || "(sin asunto)"}</h2>

          <div className="flex items-start gap-3">
            <UserAvatar
              name={detail.from?.name || detail.from?.address || "?"}
              image={null}
              seed={detail.from?.address ?? "?"}
              className="size-10"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium">{detail.from?.name || detail.from?.address || "(sin remitente)"}</span>
                {detail.from?.name && <span className="truncate text-sm text-muted-foreground">&lt;{detail.from.address}&gt;</span>}
                <time className="ml-auto shrink-0 text-xs text-muted-foreground">{longDate(detail.date)}</time>
              </div>
              <AddressLine label="Para:" list={detail.to} />
              <AddressLine label="CC:" list={detail.cc} />
              {detail.bcc.length > 0 && <AddressLine label="CCO:" list={detail.bcc} />}
            </div>
          </div>

          {hasRemoteContent && !remoteAllowed && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/50 bg-surface-1/60 px-4 py-2.5 text-sm">
              <ImageOff className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-muted-foreground">
                Las imágenes externas están bloqueadas para que el remitente no sepa si lo has abierto.
              </span>
              <Link href={showImagesHref} scroll={false} className="font-medium text-primary hover:underline">
                Mostrar imágenes
              </Link>
            </div>
          )}

          <MessageFrame document={document} title={detail.subject || "Mensaje"} />

          {detail.attachments.length > 0 && (
            <div className="space-y-2">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <Paperclip className="size-4" />
                {detail.attachments.length === 1 ? "1 adjunto" : `${detail.attachments.length} adjuntos`}
              </p>
              <ul className="flex flex-wrap gap-2">
                {detail.attachments.map((att) => (
                  <li key={att.index}>
                    <a
                      href={`/api/adjunto?${new URLSearchParams({ carpeta: folder, uid: String(detail.uid), i: String(att.index) })}`}
                      className="flex max-w-xs items-center gap-2 rounded-xl border border-border/50 bg-surface-1/60 px-3 py-2 text-sm shadow-glass-xs transition-colors hover:bg-surface-1"
                      download={att.filename}
                    >
                      <Download className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 truncate">{att.filename}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatSize(att.size)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" onClick={() => compose.open({ mode: "reply", source: detail })}>
              <Reply /> Responder
            </Button>
            <Button variant="outline" onClick={() => compose.open({ mode: "replyAll", source: detail })}>
              <ReplyAll /> Responder a todos
            </Button>
            <Button variant="outline" onClick={() => compose.open({ mode: "forward", source: detail })}>
              <Forward /> Reenviar
            </Button>
          </div>
        </div>
      </div>
    </article>
  );
}
