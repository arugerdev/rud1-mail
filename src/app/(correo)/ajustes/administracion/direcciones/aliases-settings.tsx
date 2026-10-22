"use client";

import * as React from "react";
import { ArrowRight, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createAliasAction, deleteAliasAction, updateAliasAction, type AdminResult } from "@/app/actions/admin";
import type { AliasInfo } from "@/lib/mailcow";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/components/ui/dialog";
import { Label } from "@/shared/components/ui/label";

import { Avatar } from "../../../avatar";

interface Box {
  address: string;
  name: string;
}

function TargetsPicker({ boxes, value, onChange }: { boxes: Box[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="max-h-64 space-y-0.5 overflow-y-auto rounded-xl border border-border/50 p-1">
      {boxes.map((b) => (
        <label key={b.address} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/40">
          <Checkbox
            checked={value.includes(b.address)}
            onChange={(e) => onChange(e.target.checked ? [...value, b.address] : value.filter((v) => v !== b.address))}
          />
          <Avatar email={b.address} name={b.name} className="size-6 text-[9px]" />
          <span className="truncate text-sm">{b.address}</span>
          <span className="truncate text-xs text-muted-foreground">{b.name}</span>
        </label>
      ))}
    </div>
  );
}

function AliasDialog({
  open,
  onOpenChange,
  boxes,
  domain,
  editing,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  boxes: Box[];
  domain: string;
  editing: AliasInfo | null;
}) {
  const [localPart, setLocalPart] = React.useState("");
  const [targets, setTargets] = React.useState<string[]>([]);
  const [busy, start] = React.useTransition();

  React.useEffect(() => {
    if (!open) return;
    setLocalPart(editing ? editing.address.split("@")[0] : "");
    setTargets(editing ? editing.goto : []);
  }, [open, editing]);

  const submit = () =>
    start(async () => {
      const r = editing ? await updateAliasAction(editing.id, { goto: targets }) : await createAliasAction(localPart, targets);
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo guardar.");
        return;
      }
      toast.success(editing ? "Dirección guardada" : "Dirección creada");
      onOpenChange(false);
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? editing.address : "Nueva dirección"}</DialogTitle>
          <DialogDescription>
            Una dirección sin buzón propio: lo que llega a ella se entrega en los buzones que elijas.
          </DialogDescription>
        </DialogHeader>
        {!editing && (
          <div className="space-y-1.5">
            <Label htmlFor="alias">Dirección</Label>
            <div className="flex items-center rounded-xl border border-border/60 bg-background focus-within:ring-2 focus-within:ring-ring">
              <input
                id="alias"
                value={localPart}
                onChange={(e) => setLocalPart(e.target.value.replace(/\s/g, "").toLowerCase())}
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm outline-none"
                placeholder="hola"
                autoFocus
              />
              <span className="pr-3 text-sm text-muted-foreground">@{domain}</span>
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <Label>Entregar en</Label>
          <TargetsPicker boxes={boxes} value={targets} onChange={setTargets} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy || targets.length === 0 || (!editing && !localPart)}>
            {busy ? <Loader2 className="animate-spin" /> : null} {editing ? "Guardar" : "Crear dirección"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AliasesSettings({ aliases, mailboxes, domain }: { aliases: AliasInfo[]; mailboxes: Box[]; domain: string }) {
  const [dialog, setDialog] = React.useState<{ open: boolean; editing: AliasInfo | null }>({ open: false, editing: null });
  const [pending, start] = React.useTransition();

  const run = (work: () => Promise<AdminResult>, success: string) =>
    start(async () => {
      const r = await work();
      if (!r.ok) toast.error(r.error ?? "Algo ha fallado.");
      else toast.success(success);
    });

  return (
    <div className="space-y-4">
      <div className="rud1-in flex items-center gap-3">
        <p className="text-sm text-muted-foreground">
          {aliases.length} direcciones. Sirven para publicar correos (hola@, facturas@…) sin crear buzones.
        </p>
        {pending && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        <Button className="ml-auto" onClick={() => setDialog({ open: true, editing: null })}>
          <Plus /> Nueva dirección
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border/50 bg-surface-1/50 shadow-glass-xs backdrop-blur-xl">
        <ul className="divide-y divide-border/40">
          {aliases.map((a, i) => (
            <li
              key={a.id}
              className={cn("rud1-in flex flex-wrap items-center gap-3 px-4 py-3", !a.active && "opacity-60")}
              style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
            >
              <span className="min-w-[12rem] text-sm font-medium">{a.address}</span>
              <ArrowRight className="size-4 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {a.goto.map((g) => (
                  <span key={g} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface-1/70 py-0.5 pl-0.5 pr-2 text-xs">
                    <Avatar email={g} name={g} className="size-5 text-[9px]" />
                    {g}
                  </span>
                ))}
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={a.active}
                title={a.active ? "Activa" : "Desactivada"}
                onClick={() => run(() => updateAliasAction(a.id, { active: !a.active }), a.active ? "Dirección desactivada" : "Dirección activada")}
                className={cn(
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors",
                  a.active ? "border-primary bg-primary" : "border-border/60 bg-muted",
                )}
              >
                <span className={cn("inline-block size-5 rounded-full bg-white shadow transition-transform", a.active ? "translate-x-5" : "translate-x-0.5")} />
              </button>
              <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setDialog({ open: true, editing: a })}>
                <Pencil className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Borrar"
                onClick={() => {
                  if (window.confirm(`¿Borrar ${a.address}? Lo que llegue a esa dirección se rechazará.`)) {
                    run(() => deleteAliasAction(a.id), "Dirección borrada");
                  }
                }}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      </div>

      <AliasDialog
        open={dialog.open}
        onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))}
        boxes={mailboxes}
        domain={domain}
        editing={dialog.editing}
      />
    </div>
  );
}
