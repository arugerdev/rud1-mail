"use client";

import * as React from "react";
import { CalendarDays, Check, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";

import { setAgendaLinkAction } from "@/app/actions/admin";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

/**
 * Qué cuenta de admin.rud1.es es la de este buzón, para su agenda. Solo hace
 * falta cuando no es la misma dirección (p. ej. aruger@rud1.es → aruger.dev@gmail.com).
 */
export function AgendaLinkDialog({
  person,
  onClose,
}: {
  person: { email: string; name: string; link: string | null } | null;
  onClose: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [busy, start] = React.useTransition();
  React.useEffect(() => setValue(person?.link ?? ""), [person]);

  const save = (adminEmail: string | null) =>
    start(async () => {
      if (!person) return;
      const r = await setAgendaLinkAction(person.email, adminEmail);
      if (!r.ok) toast.error(r.error ?? "No se pudo enlazar.");
      else {
        toast.success(adminEmail ? `Agenda de ${person.name} enlazada con la cuenta de ${r.name ?? adminEmail}` : "Enlace quitado");
        onClose();
      }
    });

  return (
    <Dialog open={person !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="size-5 text-primary" /> Cuenta de la agenda
          </DialogTitle>
          <DialogDescription>
            La agenda de rud1 Mail es la de admin.rud1.es. Si <strong>{person?.name}</strong> entra en admin con otro correo, ponlo
            aquí. Si lo dejas vacío, se usa <strong>{person?.email}</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="agenda-admin">Correo de su cuenta de admin.rud1.es</Label>
          <Input
            id="agenda-admin"
            type="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={person?.email}
            autoComplete="off"
            onKeyDown={(e) => e.key === "Enter" && value.trim() && save(value.trim())}
          />
          <p className="text-xs text-muted-foreground">Al guardar se comprueba que esa cuenta existe y está activa.</p>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {person?.link ? (
            <Button variant="ghost" disabled={busy} onClick={() => save(null)}>
              <Unlink /> Quitar enlace
            </Button>
          ) : (
            <span />
          )}
          <Button disabled={busy || !value.trim()} onClick={() => save(value.trim())}>
            {busy ? <Loader2 className="animate-spin" /> : <Check />} Comprobar y guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
