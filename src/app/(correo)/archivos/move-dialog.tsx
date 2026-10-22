"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Folder, HardDrive, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { folderTreeAction, moveAction } from "@/app/actions/files";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";

/** Elegir carpeta de destino: las propias y las compartidas para editar. */
export function MoveDialog({ items, onClose }: { items: { id: string; name: string; kind: string }[] | null; onClose: () => void }) {
  const router = useRouter();
  const [folders, setFolders] = React.useState<{ id: string; path: string }[] | null>(null);
  const [target, setTarget] = React.useState<string | null>(null);
  const [busy, start] = React.useTransition();

  React.useEffect(() => {
    if (!items) return;
    setTarget(null);
    setFolders(null);
    void folderTreeAction().then(setFolders);
  }, [items]);

  // Una carpeta no puede ir dentro de sí misma.
  const moving = new Set(items?.map((i) => i.id));
  const options = (folders ?? []).filter((f) => !moving.has(f.id));

  return (
    <Dialog open={items !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mover {items?.length === 1 ? `«${items[0].name}»` : `${items?.length} elementos`}</DialogTitle>
          <DialogDescription>Elige dónde dejarlo.</DialogDescription>
        </DialogHeader>
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {folders === null ? (
            <Loader2 className="mx-auto my-6 size-5 animate-spin text-muted-foreground" />
          ) : (
            <>
              <button
                type="button"
                onClick={() => setTarget(null)}
                className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm", target === null ? "bg-primary-soft/50" : "hover:bg-accent/40")}
              >
                <HardDrive className="size-4 text-muted-foreground" /> Mis archivos
              </button>
              {options.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setTarget(f.id)}
                  className={cn("flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm", target === f.id ? "bg-primary-soft/50" : "hover:bg-accent/40")}
                >
                  <Folder className="size-4 shrink-0 text-primary" /> <span className="truncate">{f.path}</span>
                </button>
              ))}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={busy || !items}
            onClick={() =>
              start(async () => {
                const r = await moveAction(items!.map((i) => i.id), target);
                if (!r.ok) toast.error(r.error ?? "No se pudo mover.");
                else {
                  toast.success("Movido");
                  onClose();
                  router.refresh();
                }
              })
            }
          >
            {busy && <Loader2 className="animate-spin" />} Mover aquí
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
