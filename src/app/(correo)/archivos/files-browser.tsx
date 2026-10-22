"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  Download,
  Eye,
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  FolderInput,
  FolderPlus,
  HardDrive,
  Loader2,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Search,
  Share2,
  Trash2,
  Upload,
  UsersRound,
  X,
} from "lucide-react";
import { toast } from "sonner";

import {
  createFolderAction,
  deleteForeverAction,
  emptyTrashAction,
  renameAction,
  restoreAction,
  trashAction,
  type FilesResult,
} from "@/app/actions/files";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";

import { Avatar } from "../avatar";
import { formatSize } from "../nav";
import { MoveDialog } from "./move-dialog";
import { ShareDialog } from "./share-dialog";

export type FilesView = "mios" | "compartido" | "papelera" | "buscar";

export interface BrowserItem {
  id: string;
  name: string;
  kind: "file" | "folder";
  size: number;
  mime: string;
  updatedAt: number;
  trashedAt: number | null;
  owner: string;
  ownerName: string;
  mine: boolean;
  canEdit: boolean;
}

interface Upload {
  key: string;
  name: string;
  size: number;
  loaded: number;
  state: "subiendo" | "hecho" | "error";
  error?: string;
}

function iconFor(item: { kind: string; mime: string; name: string }) {
  if (item.kind === "folder") return Folder;
  const m = item.mime;
  if (m.startsWith("image/")) return FileImage;
  if (m.startsWith("video/")) return FileVideo;
  if (m.startsWith("audio/")) return FileAudio;
  if (m === "application/pdf" || m.startsWith("text/") || /\.(docx?|odt|rtf|md)$/i.test(item.name)) return FileText;
  if (/sheet|excel|csv/.test(m) || /\.(xlsx?|ods|csv)$/i.test(item.name)) return FileSpreadsheet;
  if (/zip|compressed|tar|rar|7z/.test(m)) return FileArchive;
  return FileIcon;
}

const previewable = (mime: string) => /^(image\/|video\/|audio\/|application\/pdf$|text\/plain$)/.test(mime);

function when(ms: number): string {
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Madrid" }).format(new Date(ms));
}

function filesHref(params: { carpeta?: string; vista?: string; buscar?: string }): string {
  const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const s = q.toString();
  return s ? `/archivos?${s}` : "/archivos";
}

/** Sube un archivo con XMLHttpRequest para enseñar el progreso. */
function uploadFile(file: File, folderId: string | null, onProgress: (loaded: number) => void): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    const qs = new URLSearchParams({ nombre: file.name, ...(folderId ? { carpeta: folderId } : {}) });
    xhr.open("POST", `/api/archivos/subir?${qs}`);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      let body: { error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText) as { error?: string };
      } catch {
        // Respuesta sin JSON (p. ej. el límite del servidor).
      }
      resolve(xhr.status >= 200 && xhr.status < 300 ? { ok: true } : { ok: false, error: body.error ?? `Error ${xhr.status}` });
    };
    xhr.onerror = () => resolve({ ok: false, error: "Sin conexión" });
    xhr.send(file);
  });
}

function NameDialog({
  open,
  title,
  initial,
  action,
  onClose,
}: {
  open: boolean;
  title: string;
  initial: string;
  action: (name: string) => Promise<FilesResult>;
  onClose: () => void;
}) {
  const [name, setName] = React.useState(initial);
  const [busy, start] = React.useTransition();
  const router = useRouter();
  React.useEffect(() => setName(initial), [initial, open]);
  const submit = () =>
    start(async () => {
      const r = await action(name);
      if (!r.ok) toast.error(r.error ?? "No se pudo.");
      else {
        onClose();
        router.refresh();
      }
    });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && submit()}
          autoFocus
          onFocus={(e) => {
            const dot = e.target.value.lastIndexOf(".");
            e.target.setSelectionRange(0, dot > 0 ? dot : e.target.value.length);
          }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="animate-spin" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewDialog({ item, onClose }: { item: BrowserItem | null; onClose: () => void }) {
  const src = item ? `/api/archivos/${item.id}` : "";
  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-3">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{item?.name}</DialogTitle>
          <DialogDescription>
            {item && `${formatSize(item.size)} · ${item.ownerName} · ${when(item.updatedAt)}`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-black/5 dark:bg-white/5">
          {/* Archivos privados (con sesión): next/image no sirve aquí. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {item?.mime.startsWith("image/") && <img src={src} alt={item.name} className="max-h-[70vh] max-w-full object-contain" />}
          {item?.mime.startsWith("video/") && <video src={src} controls className="max-h-[70vh] max-w-full" />}
          {item?.mime.startsWith("audio/") && <audio src={src} controls className="w-full max-w-md" />}
          {(item?.mime === "application/pdf" || item?.mime === "text/plain") && (
            <iframe title={item.name} src={src} className="h-[70vh] w-full rounded-lg bg-white" />
          )}
        </div>
        <DialogFooter>
          <Button asChild>
            <a href={`${src}?descargar=1`}>
              <Download /> Descargar
            </a>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FilesBrowser({
  view,
  folder,
  crumbs,
  items,
  quota,
  query,
}: {
  view: FilesView;
  folder: { id: string; name: string; canEdit: boolean; mine: boolean } | null;
  crumbs: { id: string; name: string }[];
  items: BrowserItem[];
  quota: { used: number; total: number };
  query: string;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = React.useState<Upload[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [newFolder, setNewFolder] = React.useState(false);
  const [renaming, setRenaming] = React.useState<BrowserItem | null>(null);
  const [preview, setPreview] = React.useState<BrowserItem | null>(null);
  const [sharing, setSharing] = React.useState<BrowserItem | null>(null);
  const [moving, setMoving] = React.useState<BrowserItem[] | null>(null);
  const [search, setSearch] = React.useState(query);
  const [pending, start] = React.useTransition();

  const canUpload = view === "mios" || (folder?.canEdit ?? false);
  const targetFolder = folder?.id ?? null;
  const pct = quota.total > 0 ? Math.min(100, (quota.used / quota.total) * 100) : 100;

  const run = (work: () => Promise<FilesResult>, success?: string) =>
    start(async () => {
      const r = await work();
      if (!r.ok) toast.error(r.error ?? "Algo ha fallado.");
      else {
        if (success) toast.success(success);
        router.refresh();
      }
    });

  const addFiles = React.useCallback(
    async (files: File[]) => {
      if (!canUpload || files.length === 0) return;
      const batch = files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, size: f.size, loaded: 0, state: "subiendo" as const }));
      setUploads((u) => [...u, ...batch]);
      let okCount = 0;
      // De dos en dos: rápido sin saturar la conexión.
      const queue = files.map((f, i) => ({ file: f, key: batch[i].key }));
      const worker = async () => {
        while (queue.length) {
          const { file, key } = queue.shift()!;
          const r = await uploadFile(file, targetFolder, (loaded) =>
            setUploads((u) => u.map((x) => (x.key === key ? { ...x, loaded } : x))),
          );
          if (r.ok) okCount++;
          setUploads((u) => u.map((x) => (x.key === key ? { ...x, loaded: x.size, state: r.ok ? "hecho" : "error", error: r.error } : x)));
        }
      };
      await Promise.all([worker(), worker()]);
      if (okCount > 0) {
        toast.success(okCount === 1 ? "Archivo subido" : `${okCount} archivos subidos`);
        router.refresh();
      }
      // Lo terminado se va de la lista al poco; los errores se quedan para leerlos.
      window.setTimeout(() => setUploads((u) => u.filter((x) => x.state !== "hecho")), 2500);
    },
    [canUpload, targetFolder, router],
  );

  const open = (item: BrowserItem) => {
    if (item.trashedAt) return;
    if (item.kind === "folder") router.push(filesHref({ carpeta: item.id }));
    else if (previewable(item.mime)) setPreview(item);
    else window.location.href = `/api/archivos/${item.id}?descargar=1`;
  };

  const tabs: { v: FilesView; label: string; href: string; icon: typeof Folder }[] = [
    { v: "mios", label: "Mis archivos", href: "/archivos", icon: HardDrive },
    { v: "compartido", label: "Compartido conmigo", href: filesHref({ vista: "compartido" }), icon: UsersRound },
    { v: "papelera", label: "Papelera", href: filesHref({ vista: "papelera" }), icon: Trash2 },
  ];

  return (
    <div
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (canUpload && e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        if (!canUpload) return;
        e.preventDefault();
        setDragging(false);
        void addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="shrink-0 space-y-3 border-b border-border/40 p-3 md:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <nav className="flex rounded-xl border border-border/50 bg-surface-1/60 p-0.5 text-sm">
            {tabs.map((t) => (
              <Link
                key={t.v}
                href={t.href}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-colors",
                  view === t.v && !folder ? "bg-primary-soft/50 text-primary-foreground dark:text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <t.icon className="size-4" /> <span className="hidden sm:inline">{t.label}</span>
              </Link>
            ))}
          </nav>
          <form
            className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border/50 bg-background/60 px-3"
            onSubmit={(e) => {
              e.preventDefault();
              router.push(filesHref({ buscar: search.trim() }));
            }}
          >
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en Archivos"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm outline-none"
            />
            {search && (
              <button type="button" aria-label="Quitar búsqueda" onClick={() => router.push("/archivos")}>
                <X className="size-4 text-muted-foreground" />
              </button>
            )}
          </form>
          {canUpload && (
            <>
              <Button variant="outline" onClick={() => setNewFolder(true)}>
                <FolderPlus /> <span className="hidden md:inline">Carpeta</span>
              </Button>
              <Button onClick={() => inputRef.current?.click()}>
                <Upload /> Subir
              </Button>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  void addFiles(Array.from(e.target.files ?? []));
                  e.target.value = "";
                }}
              />
            </>
          )}
          {view === "papelera" && items.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                if (window.confirm("¿Vaciar la papelera? Se borra todo para siempre.")) run(emptyTrashAction, "Papelera vaciada");
              }}
            >
              <Trash2 /> Vaciar
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-1 text-sm">
            {folder ? (
              <>
                <Link href={folder.mine ? "/archivos" : filesHref({ vista: "compartido" })} className="text-muted-foreground hover:text-foreground">
                  {folder.mine ? "Mis archivos" : "Compartido conmigo"}
                </Link>
                {crumbs.map((c) => (
                  <React.Fragment key={c.id}>
                    <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                    <Link href={filesHref({ carpeta: c.id })} className="truncate font-medium hover:underline">
                      {c.name}
                    </Link>
                  </React.Fragment>
                ))}
              </>
            ) : (
              <span className="font-medium">
                {view === "buscar" ? `Resultados de «${query}»` : tabs.find((t) => t.v === view)?.label}
              </span>
            )}
            {pending && <Loader2 className="ml-2 size-4 animate-spin text-muted-foreground" />}
          </div>
          <div className="w-48 space-y-1" title={`${formatSize(quota.used)} de ${formatSize(quota.total)}`}>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-[width] duration-700", pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary")}
                style={{ width: `${Math.max(pct, 1)}%` }}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {formatSize(quota.used)} de {formatSize(quota.total)} usados
            </p>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <div className="rud1-in flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
            <Folder className="size-10 opacity-40" />
            <p className="text-sm">
              {view === "papelera"
                ? "La papelera está vacía."
                : view === "compartido" && !folder
                  ? "Nadie te ha compartido nada todavía."
                  : view === "buscar"
                    ? "No hay nada con ese nombre."
                    : "Aún no hay nada aquí. Arrastra archivos o pulsa Subir."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/30">
            {items.map((item, i) => {
              const Icon = iconFor(item);
              return (
                <li
                  key={item.id}
                  className="rud1-in group flex items-center gap-3 px-3 py-2 hover:bg-accent/30 md:px-4"
                  style={{ animationDelay: `${Math.min(i, 15) * 18}ms` }}
                >
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onDoubleClick={() => open(item)} onClick={() => open(item)}>
                    {item.kind === "file" && item.mime.startsWith("image/") && !item.trashedAt ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/archivos/${item.id}`} alt="" loading="lazy" className="size-9 shrink-0 rounded-lg object-cover" />
                    ) : (
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg",
                          item.kind === "folder" ? "bg-primary-soft/40 text-primary" : "bg-muted/60 text-muted-foreground",
                        )}
                      >
                        <Icon className="size-5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.kind === "file" ? formatSize(item.size) : "Carpeta"} · {when(item.trashedAt ?? item.updatedAt)}
                        {!item.mine && ` · de ${item.ownerName}`}
                      </span>
                    </span>
                  </button>
                  {!item.mine && <Avatar email={item.owner} name={item.ownerName} className="hidden size-6 text-[9px] sm:flex" />}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" aria-label={`Acciones de ${item.name}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      {item.trashedAt ? (
                        <>
                          <DropdownMenuItem onClick={() => run(() => restoreAction(item.id), "Recuperado")}>
                            <RotateCcw className="size-4" /> Recuperar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => {
                              if (window.confirm(`¿Borrar «${item.name}» para siempre?`)) run(() => deleteForeverAction(item.id), "Borrado");
                            }}
                          >
                            <Trash2 className="size-4" /> Borrar para siempre
                          </DropdownMenuItem>
                        </>
                      ) : (
                        <>
                          {item.kind === "file" && previewable(item.mime) && (
                            <DropdownMenuItem onClick={() => setPreview(item)}>
                              <Eye className="size-4" /> Vista previa
                            </DropdownMenuItem>
                          )}
                          {item.kind === "file" && (
                            <DropdownMenuItem asChild>
                              <a href={`/api/archivos/${item.id}?descargar=1`}>
                                <Download className="size-4" /> Descargar
                              </a>
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setSharing(item)}>
                            <Share2 className="size-4" /> {item.mine ? "Compartir…" : "Con quién está compartido"}
                          </DropdownMenuItem>
                          {item.canEdit && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setRenaming(item)}>
                                <Pencil className="size-4" /> Cambiar nombre
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setMoving([item])}>
                                <FolderInput className="size-4" /> Mover a…
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-destructive" onClick={() => run(() => trashAction([item.id]), "A la papelera")}>
                                <Trash2 className="size-4" /> A la papelera
                              </DropdownMenuItem>
                            </>
                          )}
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {dragging && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-2xl border-2 border-dashed border-primary bg-primary-soft/30 backdrop-blur-sm">
          <p className="rud1-pop flex items-center gap-2 text-base font-semibold">
            <Upload className="size-5" /> Suelta para subir {folder ? `a ${folder.name}` : "a tus archivos"}
          </p>
        </div>
      )}

      {uploads.length > 0 && (
        <div className="rud1-in absolute bottom-4 right-4 z-30 w-80 space-y-2 rounded-2xl border border-border/50 bg-surface-1/95 p-3 shadow-glass-lg backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold">Subidas</p>
            <button type="button" aria-label="Cerrar" onClick={() => setUploads((u) => u.filter((x) => x.state === "subiendo"))}>
              <X className="size-4 text-muted-foreground" />
            </button>
          </div>
          <ul className="max-h-60 space-y-2 overflow-y-auto">
            {uploads.map((u) => (
              <li key={u.key} className="space-y-1">
                <p className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate">{u.name}</span>
                  <span className={cn("shrink-0", u.state === "error" ? "text-destructive" : "text-muted-foreground")}>
                    {u.state === "error" ? u.error : u.state === "hecho" ? "Listo" : `${Math.round((u.loaded / Math.max(u.size, 1)) * 100)} %`}
                  </span>
                </p>
                <div className="h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn("h-full rounded-full transition-[width]", u.state === "error" ? "bg-destructive" : "bg-primary")}
                    style={{ width: `${(u.loaded / Math.max(u.size, 1)) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <NameDialog
        open={newFolder}
        title="Nueva carpeta"
        initial="Carpeta nueva"
        action={(name) => createFolderAction(targetFolder, name)}
        onClose={() => setNewFolder(false)}
      />
      <NameDialog
        open={renaming !== null}
        title="Cambiar nombre"
        initial={renaming?.name ?? ""}
        action={(name) => renameAction(renaming!.id, name)}
        onClose={() => setRenaming(null)}
      />
      <PreviewDialog item={preview} onClose={() => setPreview(null)} />
      <ShareDialog item={sharing} onClose={() => setSharing(null)} />
      <MoveDialog items={moving} onClose={() => setMoving(null)} />
    </div>
  );
}
