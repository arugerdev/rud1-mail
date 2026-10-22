"use client";

import * as React from "react";
import { Check, Eye, Loader2, Pencil, Plus, RefreshCw, Save, Send, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { deleteRoleAction, deleteTeamAction, resyncAccessAction, saveRoleAction, saveTeamAction } from "@/app/actions/admin";
import type { Team, TeamGrant } from "@/lib/access";
import { PERMISSION_GROUPS, PERMISSIONS, ROLE_COLORS, type PermissionSet, type Role } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { ToggleSwitch } from "@/shared/components/ui/toggle-switch";

import { Avatar } from "../../../avatar";

interface Person {
  email: string;
  name: string;
  /** null: propietario (tiene todo). */
  roleId: string | null;
}

interface SharedBox {
  address: string;
  name: string;
}

const gb = (mb: number) => (mb === 0 ? "Sin espacio" : mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${mb} MB`);

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ROLE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Color ${c}`}
          onClick={() => onChange(c)}
          className={cn("flex size-7 items-center justify-center rounded-full transition-transform hover:scale-110", value === c && "ring-2 ring-ring ring-offset-2 ring-offset-background")}
          style={{ background: c }}
        >
          {value === c && <Check className="size-3.5 text-white" />}
        </button>
      ))}
    </div>
  );
}

// --- Roles ---

type RoleDraft = { id: string | null; name: string; description: string; color: string; permissions: PermissionSet; storageMb: number };

function RoleDialog({ draft, onClose }: { draft: RoleDraft | null; onClose: () => void }) {
  const [state, setState] = React.useState<RoleDraft | null>(draft);
  const [saving, start] = React.useTransition();
  React.useEffect(() => setState(draft), [draft]);
  if (!state) return null;
  return (
    <Dialog open={draft !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{state.id ? `Rol ${state.name}` : "Nuevo rol"}</DialogTitle>
          <DialogDescription>Lo que puede hacer quien tenga este rol. A cada persona se le pueden hacer excepciones.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="role-name">Nombre</Label>
            <Input id="role-name" value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} placeholder="Ventas" />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorPicker value={state.color} onChange={(color) => setState({ ...state, color })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="role-desc">Descripción</Label>
          <Input id="role-desc" value={state.description} onChange={(e) => setState({ ...state, description: e.target.value })} />
        </div>
        {PERMISSION_GROUPS.map((group) => (
          <div key={group} className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
            {PERMISSIONS.filter((p) => p.group === group).map((p) => (
              <ToggleSwitch
                key={p.key}
                checked={state.permissions[p.key]}
                onChange={(v) => setState({ ...state, permissions: { ...state.permissions, [p.key]: v } })}
                label={p.label}
                description={p.description}
              />
            ))}
          </div>
        ))}
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="role-storage">Espacio para archivos</Label>
          <select
            id="role-storage"
            value={state.storageMb}
            onChange={(e) => setState({ ...state, storageMb: Number(e.target.value) })}
            className="rounded-lg border border-border/60 bg-background px-2 py-1.5 text-sm"
          >
            {[0, 1024, 2048, 5120, 10240, 20480, 51200, 102400].map((mb) => (
              <option key={mb} value={mb}>
                {gb(mb)}
              </option>
            ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={() =>
              start(async () => {
                const r = await saveRoleAction(state);
                if (!r.ok) toast.error(r.error ?? "No se pudo guardar.");
                else {
                  toast.success("Rol guardado y aplicado");
                  onClose();
                }
              })
            }
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Equipos ---

type TeamDraft = { id: number | null; name: string; description: string; color: string; members: string[]; grants: TeamGrant[] };

function TeamDialog({ draft, people, shared, onClose }: { draft: TeamDraft | null; people: Person[]; shared: SharedBox[]; onClose: () => void }) {
  const [state, setState] = React.useState<TeamDraft | null>(draft);
  const [saving, start] = React.useTransition();
  React.useEffect(() => setState(draft), [draft]);
  if (!state) return null;

  const grantOf = (owner: string) => state.grants.find((g) => g.owner === owner) ?? { owner, view: false, send: false };
  const setGrant = (owner: string, what: "view" | "send") => {
    const g = grantOf(owner);
    const next =
      what === "view"
        ? { owner, view: !(g.view || g.send), send: g.view || g.send ? false : g.send }
        : { owner, view: !g.send ? true : g.view, send: !g.send };
    setState({ ...state, grants: [...state.grants.filter((x) => x.owner !== owner), next] });
  };

  return (
    <Dialog open={draft !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{state.id ? `Equipo ${state.name}` : "Nuevo equipo"}</DialogTitle>
          <DialogDescription>Quién está y qué buzones comunes ven (y desde cuáles envían) todos sus miembros.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="team-name">Nombre</Label>
            <Input id="team-name" value={state.name} onChange={(e) => setState({ ...state, name: e.target.value })} placeholder="Soporte" />
          </div>
          <div className="space-y-1.5">
            <Label>Color</Label>
            <ColorPicker value={state.color} onChange={(color) => setState({ ...state, color })} />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="team-desc">Descripción</Label>
          <Input id="team-desc" value={state.description} onChange={(e) => setState({ ...state, description: e.target.value })} />
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Miembros</p>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => {
              const on = state.members.includes(p.email);
              return (
                <button
                  key={p.email}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setState({ ...state, members: on ? state.members.filter((m) => m !== p.email) : [...state.members, p.email] })
                  }
                  className={cn(
                    "flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition-all",
                    on ? "border-primary/50 bg-primary-soft/40 shadow-glass-xs" : "border-border/60 text-muted-foreground hover:bg-accent/40",
                  )}
                >
                  <Avatar email={p.email} name={p.name} className="size-6 text-[9px]" />
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Buzones comunes</p>
          <ul className="divide-y divide-border/40 rounded-xl border border-border/50">
            {shared.map((b) => {
              const g = grantOf(b.address);
              return (
                <li key={b.address} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {b.address} <span className="text-xs text-muted-foreground">· {b.name}</span>
                  </span>
                  {(
                    [
                      ["view", "Lo ven", Eye, g.view || g.send],
                      ["send", "Envían como", Send, g.send],
                    ] as const
                  ).map(([what, label, Icon, on]) => (
                    <button
                      key={what}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setGrant(b.address, what)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all",
                        on
                          ? "border-primary/40 bg-primary-soft/50 text-primary-foreground dark:text-primary"
                          : "border-border/60 text-muted-foreground hover:bg-accent/40",
                      )}
                    >
                      <Icon className="size-3.5" /> {label}
                    </button>
                  ))}
                </li>
              );
            })}
          </ul>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={() =>
              start(async () => {
                const r = await saveTeamAction(state);
                if (!r.ok) toast.error(r.error ?? "No se pudo guardar.");
                else {
                  toast.success("Equipo guardado y aplicado");
                  onClose();
                }
              })
            }
          >
            {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RolesSettings({ roles, teams, people, shared }: { roles: Role[]; teams: Team[]; people: Person[]; shared: SharedBox[] }) {
  const [roleDraft, setRoleDraft] = React.useState<RoleDraft | null>(null);
  const [teamDraft, setTeamDraft] = React.useState<TeamDraft | null>(null);
  const [pending, start] = React.useTransition();

  const run = (work: () => Promise<{ ok: boolean; error?: string }>, success: string) =>
    start(async () => {
      const r = await work();
      if (!r.ok) toast.error(r.error ?? "Algo ha fallado.");
      else toast.success(success);
    });

  return (
    <div className="space-y-6">
      <Card className="rud1-in">
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <ShieldCheck className="size-5 text-primary" /> Roles
            </CardTitle>
            <CardDescription>
              Cada persona tiene uno. Álvaro y Manuel son propietarios: lo tienen todo y son los únicos que reparten permisos.
            </CardDescription>
          </div>
          <Button
            onClick={() =>
              setRoleDraft({ id: null, name: "", description: "", color: ROLE_COLORS[2], permissions: { ...roles[0].permissions }, storageMb: 5120 })
            }
          >
            <Plus /> Nuevo rol
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {roles.map((r) => {
            const members = people.filter((p) => p.roleId === r.id);
            const allowed = PERMISSIONS.filter((p) => r.permissions[p.key]);
            return (
              <div key={r.id} className="space-y-3 rounded-xl border border-border/50 bg-surface-1/40 p-4">
                <div className="flex items-start gap-2">
                  <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ background: r.color }} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{r.name}</p>
                    <p className="text-xs text-muted-foreground">{r.description}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${r.name}`}
                    onClick={() => setRoleDraft({ id: r.id, name: r.name, description: r.description, color: r.color, permissions: r.permissions, storageMb: r.storageMb })}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  {!r.builtin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Borrar ${r.name}`}
                      onClick={() => {
                        if (window.confirm(`¿Borrar el rol ${r.name}? Quien lo tenga pasará a Equipo.`)) run(() => deleteRoleAction(r.id), "Rol borrado");
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {allowed.map((p) => (
                    <span key={p.key} className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px]">
                      {p.label}
                    </span>
                  ))}
                  <span className="rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px]">Archivos: {gb(r.storageMb)}</span>
                </div>
                <div className="flex -space-x-2">
                  {members.map((m) => (
                    <Avatar key={m.email} email={m.email} name={m.name} className="size-7 border-2 border-background text-[10px]" />
                  ))}
                  {members.length === 0 && <span className="text-xs text-muted-foreground">Nadie con este rol</span>}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card className="rud1-in" style={{ animationDelay: "60ms" }}>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-lg">
              <UsersRound className="size-5 text-primary" /> Equipos
            </CardTitle>
            <CardDescription>Grupos de personas que comparten buzones comunes. Se suman a lo que cada uno tenga por su cuenta.</CardDescription>
          </div>
          <Button onClick={() => setTeamDraft({ id: null, name: "", description: "", color: ROLE_COLORS[0], members: [], grants: [] })}>
            <Plus /> Nuevo equipo
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {teams.length === 0 && <p className="text-sm text-muted-foreground">Aún no hay equipos. Por ejemplo: Soporte (ve support@ y contact@).</p>}
          {teams.map((t) => (
            <div key={t.id} className="space-y-3 rounded-xl border border-border/50 bg-surface-1/40 p-4">
              <div className="flex items-start gap-2">
                <span className="mt-1.5 size-3 shrink-0 rounded-full" style={{ background: t.color }} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.name}</p>
                  {t.description && <p className="text-xs text-muted-foreground">{t.description}</p>}
                </div>
                <Button variant="ghost" size="icon" aria-label={`Editar ${t.name}`} onClick={() => setTeamDraft({ ...t })}>
                  <Pencil className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Borrar ${t.name}`}
                  onClick={() => {
                    if (window.confirm(`¿Borrar el equipo ${t.name}? Sus miembros dejarán de ver los buzones que les daba.`)) {
                      run(() => deleteTeamAction(t.id), "Equipo borrado");
                    }
                  }}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-1">
                {t.grants.map((g) => (
                  <span key={g.owner} className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px]">
                    {g.send ? <Send className="size-3" /> : <Eye className="size-3" />} {g.owner}
                  </span>
                ))}
                {t.grants.length === 0 && <span className="text-xs text-muted-foreground">Sin buzones comunes</span>}
              </div>
              <div className="flex -space-x-2">
                {t.members.map((email) => {
                  const p = people.find((x) => x.email === email);
                  return <Avatar key={email} email={email} name={p?.name ?? email} className="size-7 border-2 border-background text-[10px]" />;
                })}
                {t.members.length === 0 && <span className="text-xs text-muted-foreground">Sin miembros</span>}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
        <span>Los cambios se aplican en el servidor al guardar. Si algo se cambió por fuera, vuelve a aplicarlos todos.</span>
        <Button variant="outline" size="sm" disabled={pending} onClick={() => run(resyncAccessAction, "Permisos aplicados en el servidor")}>
          {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Volver a aplicar
        </Button>
      </div>

      <RoleDialog draft={roleDraft} onClose={() => setRoleDraft(null)} />
      <TeamDialog draft={teamDraft} people={people} shared={shared} onClose={() => setTeamDraft(null)} />
    </div>
  );
}
