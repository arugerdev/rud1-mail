"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  Bell,
  BellOff,
  ChevronRight,
  Download,
  FileText,
  Folder as FolderIcon,
  HardDrive,
  Inbox,
  KeyRound,
  LogOut,
  Menu,
  PenSquare,
  RefreshCw,
  Search,
  Send,
  Settings,
  Share,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";

import { signOut } from "@/app/actions/auth";
import type { Folder, SpecialUse } from "@/lib/mail/folders";
import { THEME_LABELS } from "@/lib/theme-labels";
import { cn } from "@/lib/utils";
import { Logo } from "@/shared/components/logo";
import { ThemeToggle } from "@/shared/components/theme-toggle";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { useSpring } from "@/shared/hooks/use-spring";

import { setAppBadge, usePwa } from "../pwa";
import { Avatar } from "./avatar";
import { useCompose } from "./compose/compose-provider";
import { useMailWatcher, useNotificationPermission, type LiveState, type WatcherPrefs } from "./mail-watcher";
import { parseMailto } from "./mailto";
import { mailHref } from "./nav";

const FOLDER_ICONS: Record<SpecialUse, LucideIcon> = {
  inbox: Inbox,
  drafts: FileText,
  sent: Send,
  archive: Archive,
  junk: ShieldAlert,
  trash: Trash2,
};

export interface ShellUser {
  name: string;
  email: string;
}

/** Cuántos se señalan junto a cada carpeta: sin leer, salvo en borradores (todos). */
function folderCount(folder: Folder): number {
  if (folder.specialUse === "drafts") return folder.total;
  if (folder.specialUse === "sent" || folder.specialUse === "trash" || folder.specialUse === "archive") return 0;
  return folder.unread;
}

const navClass = (active: boolean) =>
  cn(
    "group flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
    active
      ? "bg-primary-soft/40 text-primary-foreground shadow-glass-xs dark:text-primary"
      : "text-muted-foreground hover:bg-surface-1/50 hover:text-foreground",
  );

function FolderLink({ folder, active, indent = 0 }: { folder: Folder; active: boolean; indent?: number }) {
  const Icon = folder.specialUse ? FOLDER_ICONS[folder.specialUse] : FolderIcon;
  const count = folderCount(folder);
  return (
    <Link
      href={mailHref({ carpeta: folder.path })}
      aria-current={active ? "page" : undefined}
      className={navClass(active)}
      style={indent > 0 ? { paddingLeft: `${0.625 + indent * 0.75}rem` } : undefined}
    >
      <Icon
        className={cn(
          "size-4 shrink-0 transition-transform group-hover:scale-110",
          active ? "text-primary-foreground dark:text-primary" : "text-muted-foreground group-hover:text-foreground",
        )}
      />
      <span className="truncate">{folder.name}</span>
      {count > 0 && (
        <span
          // La cifra "salta" cada vez que cambia.
          key={count}
          className={cn(
            "rud1-pop ml-auto rounded-md px-1.5 text-xs tabular-nums",
            folder.specialUse === "inbox" ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground",
          )}
        >
          {count > 999 ? "999+" : count}
        </span>
      )}
    </Link>
  );
}

/** Un buzón común: su bandeja (con contador) y, desplegadas, sus demás carpetas. */
function SharedMailbox({
  owner,
  name,
  folders,
  current,
}: {
  owner: string;
  name: string;
  folders: Folder[];
  current: string | null;
}) {
  const inbox = folders.find((f) => f.specialUse === "inbox");
  const rest = folders.filter((f) => f !== inbox);
  const containsCurrent = folders.some((f) => f.path === current);
  const storageKey = `rud1mail:comun:${owner}`;
  const [open, setOpen] = React.useState(containsCurrent);
  React.useEffect(() => {
    try {
      if (localStorage.getItem(storageKey) === "1") setOpen(true);
    } catch {
      // sin almacenamiento: plegado
    }
  }, [storageKey]);
  React.useEffect(() => {
    if (containsCurrent && current !== inbox?.path) setOpen(true);
  }, [containsCurrent, current, inbox?.path]);
  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(storageKey, next ? "1" : "0");
    } catch {
      // nada
    }
  };
  const unread = inbox?.unread ?? 0;
  const active = inbox ? inbox.path === current : false;

  return (
    <div>
      <div className="flex items-center">
        <button
          type="button"
          onClick={toggle}
          aria-label={open ? `Plegar ${owner}` : `Desplegar ${owner}`}
          className="rounded p-1 text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
        {inbox ? (
          <Link href={mailHref({ carpeta: inbox.path })} className={cn(navClass(active), "min-w-0 flex-1 pl-1")} title={owner}>
            <Avatar email={owner} name={name} className="size-5 text-[8px]" />
            <span className="truncate">{name}</span>
            {unread > 0 && (
              <span key={unread} className="rud1-pop ml-auto rounded-md bg-primary/15 px-1.5 text-xs font-semibold tabular-nums text-primary">
                {unread > 999 ? "999+" : unread}
              </span>
            )}
          </Link>
        ) : (
          <span className="truncate px-2 text-sm text-muted-foreground">{name}</span>
        )}
      </div>
      {open && (
        <div className="rud1-in space-y-0.5 pb-1">
          {rest.map((f) => (
            <FolderLink key={f.path} folder={f} active={f.path === current} indent={1 + f.depth} />
          ))}
        </div>
      )}
    </div>
  );
}

function FolderNav({ folders, current, sharedNames }: { folders: Folder[]; current: string | null; sharedNames: Record<string, string> }) {
  const own = folders.filter((f) => !f.owner);
  const owners = [...new Set(folders.filter((f) => f.owner).map((f) => f.owner!))];
  return (
    <>
      <nav className="space-y-0.5" aria-label="Carpetas">
        <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Carpetas</p>
        {own.map((folder) => (
          <FolderLink key={folder.path} folder={folder} active={folder.path === current} indent={folder.depth} />
        ))}
      </nav>
      {owners.length > 0 && (
        <nav className="space-y-0.5" aria-label="Buzones comunes">
          <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Buzones comunes</p>
          {owners.map((owner) => (
            <SharedMailbox
              key={owner}
              owner={owner}
              name={sharedNames[owner] ?? owner}
              folders={folders.filter((f) => f.owner === owner)}
              current={current}
            />
          ))}
        </nav>
      )}
    </>
  );
}

/** En iPhone y iPad no hay botón de instalar: se explica cómo hacerlo desde Safari. */
function IosInstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Instalar rud1 Mail</DialogTitle>
          <DialogDescription>En el iPhone o el iPad, desde Safari:</DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-2 pl-5 text-sm">
          <li>
            Pulsa <Share className="inline size-4 align-text-bottom" /> <strong>Compartir</strong>, abajo en la pantalla.
          </li>
          <li>
            Elige <strong>Añadir a pantalla de inicio</strong>.
          </li>
          <li>
            Pulsa <strong>Añadir</strong>. rud1 Mail aparecerá como una app más.
          </li>
        </ol>
      </DialogContent>
    </Dialog>
  );
}

function AccountMenu({ user }: { user: ShellUser }) {
  const pwa = usePwa();
  const [notifications, requestNotifications] = useNotificationPermission();
  const [iosHelp, setIosHelp] = React.useState(false);
  const showIosHelp = pwa.isIos && !pwa.standalone;

  return (
    <>
      <IosInstallDialog open={iosHelp} onOpenChange={setIosHelp} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-2">
            <Avatar email={user.email} name={user.name} className="size-8" />
            <span className="flex min-w-0 flex-1 flex-col items-start text-left">
              <span className="w-full truncate text-sm font-medium">{user.name}</span>
              <span className="w-full truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-64">
          <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/ajustes">
              <UserRound className="size-4" /> Mi perfil y firma
            </Link>
          </DropdownMenuItem>
          {pwa.canInstall && (
            <DropdownMenuItem onClick={() => void pwa.install()}>
              <Download className="size-4" /> Instalar la app
            </DropdownMenuItem>
          )}
          {showIosHelp && (
            <DropdownMenuItem onClick={() => setIosHelp(true)}>
              <Download className="size-4" /> Instalar en el iPhone o iPad
            </DropdownMenuItem>
          )}
          {notifications === "default" && (
            <DropdownMenuItem onClick={() => void requestNotifications()}>
              <Bell className="size-4" /> Avisarme del correo nuevo
            </DropdownMenuItem>
          )}
          {notifications === "denied" && (
            <DropdownMenuItem disabled>
              <BellOff className="size-4" /> Avisos bloqueados en el navegador
            </DropdownMenuItem>
          )}
          <DropdownMenuItem asChild>
            <Link href="/cambiar-contrasena">
              <KeyRound className="size-4" /> Cambiar la contraseña
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void signOut()}>
            <LogOut className="size-4" /> Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

export interface ShellApps {
  files: boolean;
}

function SidebarBody({
  user,
  folders,
  current,
  isAdmin,
  apps,
  pathname,
  sharedNames,
}: {
  user: ShellUser;
  folders: Folder[];
  current: string | null;
  isAdmin: boolean;
  apps: ShellApps;
  pathname: string;
  sharedNames: Record<string, string>;
}) {
  const compose = useCompose();
  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 px-4">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <span className="rounded-md border border-border/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Mail
          </span>
        </Link>
      </div>
      <div className="px-3 pb-2 pt-1">
        <Button className="w-full justify-start transition-transform hover:-translate-y-px" onClick={() => compose.open({ mode: "new" })}>
          <PenSquare /> Redactar
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-2">
        <FolderNav folders={folders} current={current} sharedNames={sharedNames} />
        {apps.files && (
          <nav className="space-y-0.5" aria-label="Espacio de trabajo">
            <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Trabajo</p>
            <Link href="/archivos" className={navClass(pathname.startsWith("/archivos"))}>
              <HardDrive className="size-4 shrink-0" />
              <span className="truncate">Archivos</span>
            </Link>
          </nav>
        )}
        <nav className="space-y-0.5" aria-label="Ajustes">
          <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Ajustes</p>
          <Link href="/ajustes" className={navClass(pathname === "/ajustes")}>
            <Settings className="size-4 shrink-0" />
            <span className="truncate">Mi perfil y firma</span>
          </Link>
          {isAdmin && (
            <Link href="/ajustes/administracion" className={navClass(pathname.startsWith("/ajustes/administracion"))}>
              <ShieldCheck className="size-4 shrink-0" />
              <span className="truncate">Administración</span>
            </Link>
          )}
        </nav>
      </div>
      <div className="shrink-0 border-t border-border/40 p-3">
        <AccountMenu user={user} />
      </div>
    </>
  );
}

/** Menú lateral del móvil: entra y sale con muelle, como en el panel de rud1. */
function MobileMenu({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const { valor } = useSpring(open ? 1 : 0, { rigidez: 420, amortiguacion: 38 });
  if (!open && valor < 0.001) return null;
  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menú">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" style={{ opacity: Math.min(1, Math.max(0, valor)) }} onClick={onClose} />
      <aside
        className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-border/40 bg-surface-1/95 backdrop-blur-2xl"
        style={{ transform: `translateX(${(Math.min(1, valor) - 1) * 100}%)` }}
      >
        <Button variant="ghost" size="icon" className="absolute right-2 top-2" aria-label="Cerrar el menú" onClick={onClose}>
          <X className="size-4" />
        </Button>
        {children}
      </aside>
    </div>
  );
}

function SearchBox({ folder, folderName }: { folder: string; folderName: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const [value, setValue] = React.useState(params.get("buscar") ?? "");
  React.useEffect(() => setValue(params.get("buscar") ?? ""), [params]);

  return (
    <form
      role="search"
      className="relative w-full max-w-xl"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(mailHref({ carpeta: folder, buscar: value.trim() || undefined }));
      }}
    >
      <Search className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={`Buscar en ${folderName}`}
        aria-label="Buscar"
        className="h-9 pl-10"
      />
    </form>
  );
}

/** Punto verde: el correo llega al instante. Ámbar: reconectando. */
function LiveIndicator({ state }: { state: LiveState }) {
  const label = state === "en-directo" ? "En directo" : state === "conectando" ? "Conectando…" : "Reconectando…";
  return (
    <span className="hidden items-center gap-1.5 rounded-full px-2 py-1 text-[11px] text-muted-foreground sm:flex" title={label}>
      <span className="relative flex size-2">
        {state === "en-directo" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success/60" />}
        <span className={cn("relative inline-flex size-2 rounded-full", state === "en-directo" ? "bg-success" : "bg-warning")} />
      </span>
      {label}
    </span>
  );
}

/** Botón visible para instalar, mientras no se haya instalado. */
function InstallButton() {
  const pwa = usePwa();
  if (!pwa.canInstall) return null;
  return (
    <Button variant="ghost" size="sm" className="gap-1.5 px-2.5" onClick={() => void pwa.install()} title="Instalar rud1 Mail como app">
      <Download className="size-4" />
      <span className="hidden sm:inline">Instalar</span>
    </Button>
  );
}

/** La primera vez, una franja invita a activar los avisos de escritorio. */
function NotificationBanner({ enabled }: { enabled: boolean }) {
  const [permission, request] = useNotificationPermission();
  const [dismissed, setDismissed] = React.useState(true);
  React.useEffect(() => {
    try {
      setDismissed(localStorage.getItem("rud1mail:avisos-banner") === "1");
    } catch {
      setDismissed(false);
    }
  }, []);
  if (!enabled || permission !== "default" || dismissed) return null;
  const hide = () => {
    setDismissed(true);
    try {
      localStorage.setItem("rud1mail:avisos-banner", "1");
    } catch {
      // sin almacenamiento: vuelve a salir la próxima vez
    }
  };
  return (
    <div className="rud1-in flex shrink-0 items-center gap-3 border-b border-primary/20 bg-primary-soft/20 px-4 py-2 text-sm">
      <Bell className="size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">Activa los avisos de escritorio para enterarte del correo nuevo al momento.</span>
      <Button size="sm" onClick={() => void request().then(hide)}>
        Activar
      </Button>
      <button type="button" aria-label="Ahora no" className="rounded p-1 text-muted-foreground hover:text-foreground" onClick={hide}>
        <X className="size-4" />
      </button>
    </div>
  );
}

/**
 * Abre el redactor cuando la app se lanza con "Redactar" (acceso directo del
 * icono) o desde un enlace mailto: del sistema, y limpia la dirección.
 */
function useComposeFromUrl() {
  const params = useSearchParams();
  const router = useRouter();
  const compose = useCompose();
  const handled = React.useRef<string | null>(null);

  React.useEffect(() => {
    const mailto = params.get("mailto");
    const redactar = params.get("redactar");
    if (!mailto && !redactar) return;
    const key = `${mailto}|${redactar}`;
    if (handled.current === key) return;
    handled.current = key;
    const fields = mailto ? parseMailto(mailto) : null;
    compose.open(fields ? { mode: "new", ...fields } : { mode: "new" });
    const rest = new URLSearchParams(params);
    rest.delete("mailto");
    rest.delete("redactar");
    const qs = rest.toString();
    router.replace(qs ? `/?${qs}` : "/");
  }, [params, router, compose]);

  // La app de escritorio pide abrir el redactor (menú, bandeja, mailto:) sin recargar.
  React.useEffect(() => {
    const onCompose = (event: Event) => {
      const mailto = (event as CustomEvent<{ mailto: string | null }>).detail?.mailto;
      const fields = mailto ? parseMailto(mailto) : null;
      compose.open(fields ? { mode: "new", ...fields } : { mode: "new" });
    };
    window.addEventListener("rud1-desktop:compose", onCompose);
    return () => window.removeEventListener("rud1-desktop:compose", onCompose);
  }, [compose]);
}

export function MailShell({
  user,
  folders,
  prefs,
  isAdmin,
  apps,
  sharedNames,
  children,
}: {
  user: ShellUser;
  folders: Folder[];
  prefs: WatcherPrefs;
  isAdmin: boolean;
  apps: ShellApps;
  sharedNames: Record<string, string>;
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  // Ajustes y Archivos no son carpetas de correo: llevan su título en vez del buscador.
  const section = pathname.startsWith("/ajustes") ? "Ajustes" : pathname.startsWith("/archivos") ? "Archivos" : null;
  const inSettings = section !== null;
  const current = inSettings ? null : params.get("carpeta") ?? "INBOX";
  const currentFolder = folders.find((f) => f.path === (current ?? "INBOX"));
  // En un buzón común, el nombre del buzón delante: "Rud1 Support · Enviados".
  const folderName = currentFolder
    ? currentFolder.owner
      ? `${sharedNames[currentFolder.owner] ?? currentFolder.owner} · ${currentFolder.name}`
      : currentFolder.name
    : current ?? "";
  const [open, setOpen] = React.useState(false);
  const [refreshing, startRefresh] = React.useTransition();

  React.useEffect(() => setOpen(false), [pathname, current]);

  const refresh = React.useCallback(() => startRefresh(() => router.refresh()), [router]);
  const live = useMailWatcher(prefs, sharedNames);
  useComposeFromUrl();

  const inbox = folders.find((f) => f.specialUse === "inbox" && !f.owner);
  React.useEffect(() => {
    const unread = inbox?.unread ?? 0;
    const place = section ?? folderName;
    document.title = unread > 0 ? `(${unread}) ${place} · rud1 Mail` : `${place} · rud1 Mail`;
    setAppBadge(unread);
  }, [inbox?.unread, folderName, section]);

  const body = (
    <SidebarBody user={user} folders={folders} current={current} isAdmin={isAdmin} apps={apps} pathname={pathname} sharedNames={sharedNames} />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-muted/20">
      <aside className="hidden h-dvh w-64 shrink-0 flex-col border-r border-border/40 bg-surface-1/75 backdrop-blur-2xl backdrop-saturate-[180%] lg:flex">
        {body}
      </aside>

      <MobileMenu open={open} onClose={() => setOpen(false)}>
        {body}
      </MobileMenu>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/40 bg-surface-1/60 px-3 backdrop-blur-2xl md:px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Abrir el menú" onClick={() => setOpen(true)}>
            <Menu className="size-5" />
          </Button>
          {inSettings ? (
            <h1 className="truncate text-sm font-semibold">{section}</h1>
          ) : (
            <SearchBox folder={current ?? "INBOX"} folderName={folderName} />
          )}
          <div className="ml-auto flex items-center gap-1">
            <LiveIndicator state={live} />
            <InstallButton />
            <Button variant="ghost" size="icon" aria-label="Actualizar" title="Actualizar" onClick={refresh}>
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            </Button>
            <ThemeToggle labels={THEME_LABELS} />
          </div>
        </header>
        <NotificationBanner enabled={prefs.notify} />
        <main className="flex min-h-0 flex-1">{children}</main>
      </div>
      <ComposeFab />
    </div>
  );
}

/** En el móvil, el botón de redactar queda siempre a mano. */
function ComposeFab() {
  const compose = useCompose();
  return (
    <Button
      size="icon"
      className="fixed bottom-5 right-5 z-40 size-14 rounded-2xl shadow-glass-lg transition-transform active:scale-95 lg:hidden"
      aria-label="Redactar"
      onClick={() => compose.open({ mode: "new" })}
    >
      <PenSquare className="!size-5" />
    </Button>
  );
}
