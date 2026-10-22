"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Archive,
  FileText,
  Folder as FolderIcon,
  Inbox,
  KeyRound,
  LogOut,
  Menu,
  PenSquare,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Trash2,
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
import { UserAvatar } from "@/shared/components/ui/user-avatar";
import { useSpring } from "@/shared/hooks/use-spring";

import { useCompose } from "./compose/compose-provider";
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

function FolderNav({ folders, current }: { folders: Folder[]; current: string }) {
  return (
    <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-3 py-2" aria-label="Carpetas">
      <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">Carpetas</p>
      {folders.map((folder) => {
        const Icon = folder.specialUse ? FOLDER_ICONS[folder.specialUse] : FolderIcon;
        const active = folder.path === current;
        const count = folderCount(folder);
        return (
          <Link
            key={folder.path}
            href={mailHref({ carpeta: folder.path })}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-primary-soft/40 text-primary-foreground shadow-glass-xs dark:text-primary"
                : "text-muted-foreground hover:bg-surface-1/50 hover:text-foreground",
            )}
            style={folder.depth > 0 ? { paddingLeft: `${0.625 + folder.depth * 0.75}rem` } : undefined}
          >
            <Icon
              className={cn(
                "size-4 shrink-0",
                active ? "text-primary-foreground dark:text-primary" : "text-muted-foreground group-hover:text-foreground",
              )}
            />
            <span className="truncate">{folder.name}</span>
            {count > 0 && (
              <span
                className={cn(
                  "ml-auto rounded-md px-1.5 text-xs tabular-nums",
                  folder.specialUse === "inbox" ? "bg-primary/15 font-semibold text-primary" : "text-muted-foreground",
                )}
              >
                {count > 999 ? "999+" : count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountMenu({ user }: { user: ShellUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-auto w-full justify-start gap-3 px-2 py-2">
          <UserAvatar name={user.name} image={null} seed={user.email} className="size-8" />
          <span className="flex min-w-0 flex-1 flex-col items-start text-left">
            <span className="w-full truncate text-sm font-medium">{user.name}</span>
            <span className="w-full truncate text-xs text-muted-foreground">{user.email}</span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
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
  );
}

function SidebarBody({ user, folders, current }: { user: ShellUser; folders: Folder[]; current: string }) {
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
        <Button className="w-full justify-start" onClick={() => compose.open({ mode: "new" })}>
          <PenSquare /> Redactar
        </Button>
      </div>
      <FolderNav folders={folders} current={current} />
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
      <div
        className="absolute inset-0 bg-background/60 backdrop-blur-sm"
        style={{ opacity: Math.min(1, Math.max(0, valor)) }}
        onClick={onClose}
      />
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

/** Pide al servidor la bandeja de nuevo cada minuto y al volver a la pestaña. */
function useAutoRefresh(onRefresh: () => void) {
  React.useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") onRefresh();
    };
    const timer = window.setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", tick);
    };
  }, [onRefresh]);
}

export function MailShell({
  user,
  folders,
  children,
}: {
  user: ShellUser;
  folders: Folder[];
  children: React.ReactNode;
}) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const current = params.get("carpeta") ?? "INBOX";
  const folderName = folders.find((f) => f.path === current)?.name ?? current;
  const [open, setOpen] = React.useState(false);
  const [refreshing, startRefresh] = React.useTransition();

  React.useEffect(() => setOpen(false), [pathname, current]);

  const refresh = React.useCallback(() => startRefresh(() => router.refresh()), [router]);
  useAutoRefresh(refresh);

  const inbox = folders.find((f) => f.specialUse === "inbox");
  React.useEffect(() => {
    const unread = inbox?.unread ?? 0;
    document.title = unread > 0 ? `(${unread}) ${folderName} · rud1 Mail` : `${folderName} · rud1 Mail`;
  }, [inbox?.unread, folderName]);

  const body = <SidebarBody user={user} folders={folders} current={current} />;

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
          <SearchBox folder={current} folderName={folderName} />
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="Actualizar" title="Actualizar" onClick={refresh}>
              <RefreshCw className={cn("size-4", refreshing && "animate-spin")} />
            </Button>
            <ThemeToggle labels={THEME_LABELS} />
          </div>
        </header>
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
      className="fixed bottom-5 right-5 z-40 size-14 rounded-2xl shadow-glass-lg lg:hidden"
      aria-label="Redactar"
      onClick={() => compose.open({ mode: "new" })}
    >
      <PenSquare className="!size-5" />
    </Button>
  );
}
