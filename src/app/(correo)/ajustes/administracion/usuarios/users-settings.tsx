"use client";

import * as React from "react";
import {
  Copy,
  DoorOpen,
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  CalendarDays,
  Send,
  ShieldCheck,
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import { toast } from "sonner";

import {
  createMailboxAction,
  deleteMailboxAction,
  enterMailboxAction,
  resetPasswordAction,
  setMailboxActiveAction,
  type AdminResult,
} from "@/app/actions/admin";
import { desktopBridge } from "@/app/(correo)/desktop-bridge";
import type { MailboxInfo } from "@/lib/mailcow";
import type { PermissionSet, Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

import { Avatar } from "../../../avatar";
import { formatSize } from "../../../nav";
import { AgendaLinkDialog } from "./agenda-link-dialog";
import { PermissionsDialog, type AccessInfo } from "./permissions-dialog";

export interface UserRow extends MailboxInfo {
  displayName: string;
  position: string;
  /** Solo en personas: rol, excepciones, equipos y lo que de verdad puede hacer. */
  access?: AccessInfo & { owner: boolean; system: boolean; effective: PermissionSet; teams: { name: string; color: string }[] };
  /** Cuenta de admin.rud1.es para su agenda, si no es la misma dirección. */
  agendaLink?: string | null;
}

function relative(ms: number | null): string {
  if (!ms) return "Nunca";
  const diff = Date.now() - ms;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 2) return "Ahora";
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 30) return `Hace ${days} d`;
  return new Intl.DateTimeFormat("es-ES", { dateStyle: "medium" }).format(new Date(ms));
}

function StateBadge({ row }: { row: UserRow }) {
  if (!row.active) return <Badge variant="destructive">Desactivado</Badge>;
  if (row.loginBlocked) return <Badge variant="warning">Sin entrada</Badge>;
  if (row.forcePasswordUpdate) return <Badge variant="warning">Pendiente de entrar</Badge>;
  return <Badge variant="success">Activo</Badge>;
}

function QuotaBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  return (
    <div className="w-28 space-y-1" title={`${formatSize(used)} de ${formatSize(total)}`}>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-[width] duration-700", pct > 90 ? "bg-destructive" : pct > 70 ? "bg-warning" : "bg-primary")}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <p className="text-[11px] text-muted-foreground">
        {formatSize(used)} / {formatSize(total)}
      </p>
    </div>
  );
}

/** La contraseña provisional se enseña una sola vez, con botón de copiar. */
/**
 * Abre el buzón en una pestaña nueva, en la dirección de acceso: la sesión de
 * aquí no cambia. La pestaña se abre al pulsar (si no, el navegador la
 * bloquearía) y luego se le da el enlace de un solo uso.
 */
function EnterButton({ row }: { row: UserRow }) {
  const [busy, setBusy] = React.useState(false);
  const enter = async () => {
    const desktop = desktopBridge();
    // En la app de escritorio, el enlace se abre en el navegador.
    const tab = desktop ? null : window.open("", "_blank");
    if (tab) {
      tab.opener = null;
      tab.document.title = "Entrando…";
    }
    setBusy(true);
    try {
      const r = await enterMailboxAction(row.username);
      if (!r.ok || !r.url) {
        tab?.close();
        toast.error(r.error ?? "No se pudo entrar en el buzón.");
      } else if (tab) {
        tab.location.href = r.url;
      } else {
        window.open(r.url, "_blank", "noopener");
      }
    } catch {
      tab?.close();
      toast.error("No se pudo entrar en el buzón.");
    } finally {
      setBusy(false);
    }
  };
  const label = row.active ? `Entrar en el buzón de ${row.displayName} (pestaña nueva)` : "El buzón está desactivado";
  return (
    <Button variant="ghost" size="icon" disabled={busy || !row.active} onClick={() => void enter()} aria-label={label} title={label}>
      {busy ? <Loader2 className="animate-spin" /> : <DoorOpen />}
    </Button>
  );
}

function PasswordDialog({ data, onClose }: { data: { email: string; password: string } | null; onClose: () => void }) {
  return (
    <Dialog open={data !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Contraseña provisional</DialogTitle>
          <DialogDescription>
            Pásasela a la persona en privado. Al entrar en mail.rud1.es con <strong>{data?.email}</strong> tendrá que elegir una suya.
            No se volverá a mostrar.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/40 p-3 font-mono text-base tracking-wide">
          <span className="flex-1 select-all">{data?.password}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Copiar"
            onClick={() => data && navigator.clipboard.writeText(data.password).then(() => toast.success("Copiada"))}
          >
            <Copy className="size-4" />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Hecho</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewMailboxDialog({
  open,
  onOpenChange,
  domain,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  domain: string;
  onCreated: (email: string, password: string, shared: boolean) => void;
}) {
  const [shared, setShared] = React.useState(false);
  const [localPart, setLocalPart] = React.useState("");
  const [name, setName] = React.useState("");
  const [quota, setQuota] = React.useState(5120);
  const [busy, start] = React.useTransition();

  React.useEffect(() => {
    if (open) {
      setLocalPart("");
      setName("");
      setShared(false);
      setQuota(5120);
    }
  }, [open]);

  const submit = () =>
    start(async () => {
      const r = await createMailboxAction({ localPart, name, quotaMb: quota, shared });
      if (!r.ok || !r.password) {
        toast.error(r.error ?? "No se pudo crear el buzón.");
        return;
      }
      onOpenChange(false);
      onCreated(`${localPart.trim().toLowerCase()}@${domain}`, r.password, shared);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo buzón</DialogTitle>
          <DialogDescription>Una persona del equipo o un buzón común (como soporte@ o ventas@).</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: false, label: "Persona", icon: UserRound },
            { v: true, label: "Común", icon: UsersRound },
          ].map(({ v, label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setShared(v);
                setQuota(v ? 3072 : 5120);
              }}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-all",
                shared === v ? "border-primary bg-primary-soft/40 shadow-glass-xs" : "border-border/60 hover:bg-accent/40",
              )}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="local">Dirección</Label>
          <div className="flex items-center rounded-xl border border-border/60 bg-background focus-within:ring-2 focus-within:ring-ring">
            <input
              id="local"
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value.replace(/\s/g, "").toLowerCase())}
              className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
              placeholder={shared ? "soporte" : "nombre"}
              autoFocus
            />
            <span className="pr-3 text-sm text-muted-foreground">@{domain}</span>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="name">{shared ? "Nombre que verán al recibir" : "Nombre y apellidos"}</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={shared ? "Rud1 Soporte" : "Nombre Apellido Apellido"} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="quota">Espacio</Label>
          <select
            id="quota"
            value={quota}
            onChange={(e) => setQuota(Number(e.target.value))}
            className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-sm"
          >
            {[1024, 3072, 5120, 10240, 20480].map((mb) => (
              <option key={mb} value={mb}>
                {mb / 1024} GB
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy || !localPart || !name.trim()}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus />} Crear buzón
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({ row, onClose }: { row: UserRow | null; onClose: () => void }) {
  const [typed, setTyped] = React.useState("");
  const [busy, start] = React.useTransition();
  React.useEffect(() => setTyped(""), [row]);
  return (
    <Dialog open={row !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Borrar {row?.username}</DialogTitle>
          <DialogDescription>
            Se borrarán el buzón y <strong>todo su correo</strong>. No se puede deshacer. Si solo quieres que no se use, mejor
            desactívalo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Escribe la dirección para confirmar</Label>
          <Input id="confirm" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={row?.username} autoComplete="off" />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            disabled={busy || typed.trim().toLowerCase() !== row?.username}
            onClick={() =>
              start(async () => {
                if (!row) return;
                const r = await deleteMailboxAction(row.username, typed);
                if (!r.ok) toast.error(r.error ?? "No se pudo borrar.");
                else {
                  toast.success("Buzón borrado");
                  onClose();
                }
              })
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : <Trash2 />} Borrar para siempre
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Rol, equipos y lo que tiene quitado, en una línea. */
function AccessLine({ row, roles }: { row: UserRow; roles: Role[] }) {
  const a = row.access;
  if (!a || a.system) return null;
  const role = roles.find((r) => r.id === a.roleId);
  const missing = [
    !a.effective["correo.enviar"] && "no envía",
    !a.effective["correo.recibir"] && "no recibe",
    !a.effective["correo.comunes"] && "sin buzones comunes",
  ].filter(Boolean);
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1">
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
        style={{ background: a.owner ? "#0f172a" : role?.color ?? "#64748b" }}
      >
        <ShieldCheck className="size-3" /> {a.owner ? "Propietario" : role?.name ?? a.roleId}
      </span>
      {a.teams.map((t) => (
        <span key={t.name} className="rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: t.color, color: t.color }}>
          {t.name}
        </span>
      ))}
      {Object.keys(a.overrides).length > 0 && <span className="text-[11px] text-muted-foreground">con excepciones</span>}
      {missing.length > 0 && <span className="text-[11px] text-warning">· {missing.join(", ")}</span>}
      {row.agendaLink && (
        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" title="Cuenta de admin.rud1.es para la agenda">
          <CalendarDays className="size-3" /> {row.agendaLink}
        </span>
      )}
    </span>
  );
}

export function UsersSettings({
  rows,
  me,
  domain,
  roles,
  canManageAccess,
  agenda,
  canEnter,
}: {
  rows: UserRow[];
  me: string;
  domain: string;
  roles: Role[];
  /** Solo los propietarios reparten roles y permisos. */
  canManageAccess: boolean;
  /** Si la agenda de admin.rud1.es está conectada. */
  agenda: boolean;
  /** Propietario con la entrada en otros buzones configurada: botón de la puerta en cada fila. */
  canEnter: boolean;
}) {
  const [creating, setCreating] = React.useState(false);
  const [password, setPassword] = React.useState<{ email: string; password: string } | null>(null);
  const [editing, setEditing] = React.useState<UserRow | null>(null);
  const [linking, setLinking] = React.useState<UserRow | null>(null);
  const [deleting, setDeleting] = React.useState<UserRow | null>(null);
  const [filter, setFilter] = React.useState<"todos" | "personas" | "comunes">("todos");
  const [pending, start] = React.useTransition();

  const run = (work: () => Promise<AdminResult>, success: string, email?: string) =>
    start(async () => {
      const r = await work();
      if (!r.ok) toast.error(r.error ?? "Algo ha fallado.");
      else if (r.password && email) setPassword({ email, password: r.password });
      else toast.success(success);
    });

  const people = rows.filter((r) => !r.shared);
  const shared = rows.filter((r) => r.shared);
  const visible = filter === "personas" ? people : filter === "comunes" ? shared : rows;

  return (
    <div className="space-y-4">
      <div className="rud1-in flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl border border-border/50 bg-surface-1/60 p-0.5 text-sm">
          {(
            [
              ["todos", `Todos (${rows.length})`],
              ["personas", `Personas (${people.length})`],
              ["comunes", `Comunes (${shared.length})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-lg px-3 py-1.5 transition-colors",
                filter === value ? "bg-primary-soft/50 text-primary-foreground dark:text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <Button className="ml-auto" onClick={() => setCreating(true)}>
          <Plus /> Nuevo buzón
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface-1/50 shadow-glass-xs backdrop-blur-xl">
        <ul className="divide-y divide-border/40">
          {visible.map((row, i) => (
            <li
              key={row.username}
              className={cn("rud1-in flex flex-wrap items-center gap-4 px-4 py-3", !row.active && "opacity-60")}
              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
            >
              <Avatar email={row.username} name={row.displayName} className="size-10" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {row.displayName}
                  {row.username === me && <span className="text-xs font-normal text-muted-foreground">(tú)</span>}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.username}
                  {row.shared ? " · Común" : row.position ? ` · ${row.position}` : ""}
                  {row.sendAs.length > 0 && ` · envía como ${row.sendAs.length}`}
                </p>
                <AccessLine row={row} roles={roles} />
              </div>
              <StateBadge row={row} />
              <div className="hidden text-xs text-muted-foreground md:block md:w-28">
                <p>Último acceso</p>
                <p className="text-foreground/80">{relative(row.lastLogin)}</p>
              </div>
              <QuotaBar used={row.usedBytes} total={row.quotaBytes} />
              {canEnter && row.username !== me && !row.access?.owner && <EnterButton row={row} />}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Acciones de ${row.username}`}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  {!row.shared && canManageAccess && row.access && !row.access.system && (
                    <DropdownMenuItem disabled={row.access.owner || row.username === me} onClick={() => setEditing(row)}>
                      <ShieldCheck className="size-4" /> Rol y permisos…
                    </DropdownMenuItem>
                  )}
                  {!row.shared && canManageAccess && agenda && !row.access?.system && (
                    <DropdownMenuItem onClick={() => setLinking(row)}>
                      <CalendarDays className="size-4" /> Cuenta de la agenda…
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    disabled={row.username === me}
                    onClick={() => run(() => resetPasswordAction(row.username), "Contraseña restablecida", row.username)}
                  >
                    <KeyRound className="size-4" /> Nueva contraseña provisional
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={row.username === me}
                    onClick={() =>
                      run(() => setMailboxActiveAction(row.username, !row.active), row.active ? "Buzón desactivado" : "Buzón activado")
                    }
                  >
                    {row.active ? <Pause className="size-4" /> : <Play className="size-4" />}
                    {row.active ? "Desactivar" : "Activar"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={row.username === me} className="text-destructive" onClick={() => setDeleting(row)}>
                    <Trash2 className="size-4" /> Borrar…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      </div>

      <NewMailboxDialog
        open={creating}
        onOpenChange={setCreating}
        domain={domain}
        onCreated={(email, pw, isShared) => {
          if (isShared) toast.success(`Buzón común ${email} creado. Asigna quién lo ve en Buzones comunes.`);
          setPassword({ email, password: pw });
        }}
      />
      <PasswordDialog data={password} onClose={() => setPassword(null)} />
      <AgendaLinkDialog
        person={linking ? { email: linking.username, name: linking.displayName, link: linking.agendaLink ?? null } : null}
        onClose={() => setLinking(null)}
      />
      <PermissionsDialog
        person={editing?.access ? { email: editing.username, name: editing.displayName, access: editing.access } : null}
        roles={roles}
        onClose={() => setEditing(null)}
      />
      <DeleteDialog row={deleting} onClose={() => setDeleting(null)} />
    </div>
  );
}
