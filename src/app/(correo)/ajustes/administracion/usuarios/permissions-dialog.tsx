"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { saveUserAccessAction } from "@/app/actions/admin";
import {
  PERMISSION_GROUPS,
  PERMISSIONS,
  resolvePermissions,
  type PermissionKey,
  type PermissionOverrides,
  type Role,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";

export interface AccessInfo {
  roleId: string;
  overrides: PermissionOverrides;
  storageMb: number | null;
}

type Choice = "rol" | "si" | "no";

function Segmented({ value, onChange, inherited }: { value: Choice; onChange: (v: Choice) => void; inherited: boolean }) {
  const options: [Choice, string][] = [
    ["rol", `Del rol (${inherited ? "sí" : "no"})`],
    ["si", "Sí"],
    ["no", "No"],
  ];
  return (
    <div className="flex shrink-0 rounded-lg border border-border/50 p-0.5" role="radiogroup">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "rounded-md px-2 py-1 text-xs font-medium transition-colors",
            value === v
              ? v === "no"
                ? "bg-destructive/15 text-destructive"
                : v === "si"
                  ? "bg-success/15 text-success"
                  : "bg-primary-soft/60 text-primary-foreground dark:text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const gb = (mb: number) => (mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${mb} MB`);

/** Rol de una persona y sus excepciones (solo para los propietarios). */
export function PermissionsDialog({
  person,
  roles,
  onClose,
}: {
  person: { email: string; name: string; access: AccessInfo } | null;
  roles: Role[];
  onClose: () => void;
}) {
  const [roleId, setRoleId] = React.useState("equipo");
  const [overrides, setOverrides] = React.useState<PermissionOverrides>({});
  const [customStorage, setCustomStorage] = React.useState<number | null>(null);
  const [saving, start] = React.useTransition();

  React.useEffect(() => {
    if (!person) return;
    setRoleId(person.access.roleId);
    setOverrides(person.access.overrides);
    setCustomStorage(person.access.storageMb);
  }, [person]);

  const role = roles.find((r) => r.id === roleId) ?? roles[0];
  const effective = role ? resolvePermissions(role, overrides) : null;

  const choice = (key: PermissionKey): Choice => (overrides[key] === undefined ? "rol" : overrides[key] ? "si" : "no");
  const setChoice = (key: PermissionKey, v: Choice) => {
    const next = { ...overrides };
    if (v === "rol") delete next[key];
    else next[key] = v === "si";
    setOverrides(next);
  };

  return (
    <Dialog open={person !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rol y permisos de {person?.name}</DialogTitle>
          <DialogDescription>
            El rol da los permisos de base; abajo puedes hacer excepciones solo para esta persona. Se aplica también en el móvil y en
            Outlook.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 sm:grid-cols-3">
          {roles.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRoleId(r.id)}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                roleId === r.id ? "border-primary bg-primary-soft/30 shadow-glass-xs" : "border-border/60 hover:bg-accent/40",
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className="size-2.5 rounded-full" style={{ background: r.color }} />
                {r.name}
              </span>
              <span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">{r.description}</span>
            </button>
          ))}
        </div>

        {PERMISSION_GROUPS.map((group) => (
          <div key={group} className="space-y-1">
            <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</p>
            <ul className="divide-y divide-border/40 rounded-xl border border-border/50">
              {PERMISSIONS.filter((p) => p.group === group).map((p) => (
                <li key={p.key} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm font-medium", effective && !effective[p.key] && "text-muted-foreground line-through")}>
                      {p.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{p.description}</p>
                  </div>
                  <Segmented value={choice(p.key)} onChange={(v) => setChoice(p.key, v)} inherited={Boolean(role?.permissions[p.key])} />
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/50 px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Espacio para archivos</p>
            <p className="text-xs text-muted-foreground">Del rol: {role ? gb(role.storageMb) : "—"}</p>
          </div>
          <select
            value={customStorage === null ? "rol" : String(customStorage)}
            onChange={(e) => setCustomStorage(e.target.value === "rol" ? null : Number(e.target.value))}
            className="rounded-lg border border-border/60 bg-background px-2 py-1.5 text-sm"
          >
            <option value="rol">El del rol</option>
            {[0, 1024, 2048, 5120, 10240, 20480, 51200, 102400].map((mb) => (
              <option key={mb} value={mb}>
                {mb === 0 ? "Sin espacio" : gb(mb)}
              </option>
            ))}
          </select>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !person}
            onClick={() =>
              start(async () => {
                if (!person) return;
                const r = await saveUserAccessAction(person.email, { roleId, overrides, storageMb: customStorage });
                if (!r.ok) toast.error(r.error ?? "No se pudo guardar.");
                else {
                  toast.success(`Permisos de ${person.name} guardados`);
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
