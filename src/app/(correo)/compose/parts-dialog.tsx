"use client";

import * as React from "react";
import { Loader2, Pencil, RotateCcw } from "lucide-react";

import { previewSignatureAction } from "@/app/actions/profile";
import { PART_KEYS, PART_LABELS, type MessagePart, type MessageParts, type PartDefaults, type PartKey } from "@/lib/mail/parts";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Checkbox } from "@/shared/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";

import { TemplateEditor, type TemplateVariable } from "../ajustes/template-editor";

/** Lo que se dice de cada parte según cómo esté en este mensaje. */
function status(key: PartKey, fallback: PartDefault, part: MessagePart | undefined): string {
  const include = part ? part.include : fallback.include;
  const label = PART_LABELS[key].title.toLowerCase();
  if (!include) return `Este mensaje sale sin ${label}.`;
  if (part?.html != null) return `Lleva una ${label} cambiada solo para este mensaje.`;
  if (!fallback.html.trim()) return `Todavía no tienes ${label}: escribe una para este mensaje.`;
  return `Lleva la ${label} de siempre.`;
}

type PartDefault = PartDefaults[PartKey];

/**
 * Cabecera, firma y pie de un mensaje: se pueden quitar o cambiar solo para
 * este envío. Lo de siempre (Ajustes) no se toca.
 */
export function PartsDialog({
  open,
  onOpenChange,
  defaults,
  variables,
  parts,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults: PartDefaults | null;
  variables: TemplateVariable[];
  parts: MessageParts;
  onChange: (parts: MessageParts) => void;
}) {
  const [editing, setEditing] = React.useState<PartKey | null>(null);
  const preview = React.useCallback((html: string) => previewSignatureAction(html), []);

  const set = (key: PartKey, next: MessagePart | null) => {
    const copy = { ...parts };
    if (next) copy[key] = next;
    else delete copy[key];
    onChange(copy);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setEditing(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[92dvh] max-w-3xl gap-4 overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Cabecera, firma y pie</DialogTitle>
          <DialogDescription>
            Solo para este mensaje. La cabecera, la firma y el pie de siempre se cambian en Ajustes.
          </DialogDescription>
        </DialogHeader>

        {!defaults ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Cargando…
          </div>
        ) : (
          <div className="space-y-3">
            {PART_KEYS.map((key) => {
              const fallback = defaults[key];
              const part = parts[key];
              const include = part ? part.include : fallback.include;
              const changed = part?.html != null;
              const isEditing = editing === key && include;
              return (
                <section
                  key={key}
                  className={cn(
                    "rounded-2xl border border-border/50 bg-surface-1/40 p-3 transition-colors",
                    !include && "bg-transparent",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <label className="flex min-w-0 flex-1 items-center gap-2 text-sm font-medium">
                      <Checkbox
                        checked={include}
                        onChange={(e) => {
                          const on = e.target.checked;
                          // Volver a lo de siempre si coincide: así el mensaje no guarda nada de más.
                          if (on === fallback.include && !changed) set(key, null);
                          else set(key, { include: on, html: part?.html ?? null });
                          if (!on && editing === key) setEditing(null);
                        }}
                      />
                      {PART_LABELS[key].include}
                    </label>
                    {include && (
                      <div className="flex items-center gap-1">
                        {changed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="gap-1.5"
                            onClick={() => {
                              set(key, include === fallback.include ? null : { include, html: null });
                              if (editing === key) setEditing(null);
                            }}
                          >
                            <RotateCcw className="size-3.5" /> La de siempre
                          </Button>
                        )}
                        <Button
                          variant={isEditing ? "secondary" : "outline"}
                          size="sm"
                          className="gap-1.5"
                          onClick={() => setEditing(isEditing ? null : key)}
                        >
                          <Pencil className="size-3.5" /> {isEditing ? "Listo" : "Cambiar en este mensaje"}
                        </Button>
                      </div>
                    )}
                  </div>
                  <p className="mt-1 pl-7 text-xs text-muted-foreground">{status(key, fallback, part)}</p>
                  {isEditing && (
                    <div className="mt-3">
                      <TemplateEditor
                        initialHtml={part?.html ?? fallback.html}
                        onChange={(html) => set(key, { include: true, html })}
                        variables={variables}
                        preview={preview}
                        defaultHtml={fallback.html || undefined}
                        minHeight={140}
                        placeholder={`Escribe la ${PART_LABELS[key].title.toLowerCase()} de este mensaje…`}
                      />
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
