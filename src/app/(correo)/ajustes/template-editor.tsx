"use client";

import * as React from "react";
import { Braces, Eye, Loader2 } from "lucide-react";

import { RichEditor, type RichEditorHandle } from "@/shared/components/rich-editor";
import { Button } from "@/shared/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

export interface TemplateVariable {
  key: string;
  label: string;
  example: string;
}

/**
 * Editor de firma, cabecera o pie: formato, datos de la persona como
 * {{variables}} y vista previa con los datos reales.
 */
export function TemplateEditor({
  initialHtml,
  onChange,
  variables,
  preview,
  placeholder,
  minHeight = 180,
}: {
  initialHtml: string;
  onChange: (html: string) => void;
  variables: TemplateVariable[];
  preview: (html: string) => Promise<string>;
  placeholder?: string;
  minHeight?: number;
}) {
  const editorRef = React.useRef<RichEditorHandle>(null);
  const [doc, setDoc] = React.useState<string | null>(null);
  const [loading, startLoading] = React.useTransition();

  const refreshPreview = React.useCallback(() => {
    startLoading(async () => setDoc(await preview(editorRef.current?.getHtml() ?? "")));
  }, [preview]);

  return (
    <div className="space-y-3">
      <div
        className="overflow-hidden rounded-xl border border-border/60 bg-background/60 shadow-glass-xs"
        style={{ ["--min" as string]: `${minHeight}px` }}
      >
        <RichEditor
          ref={editorRef}
          initialHtml={initialHtml}
          placeholder={placeholder}
          onChange={onChange}
          className="[&_.ProseMirror]:min-h-[var(--min)]"
          contentClassName=""
        />
        <div className="flex flex-wrap items-center gap-2 border-t border-border/40 px-2 py-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <Braces className="size-4" /> Insertar un dato
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Se cambia por el dato de cada persona</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {variables.map((v) => (
                <DropdownMenuItem key={v.key} onClick={() => editorRef.current?.insertText(`{{${v.key}}}`)}>
                  <span className="flex-1">{v.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{v.example}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={refreshPreview} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Eye className="size-4" />} Vista previa
          </Button>
        </div>
      </div>
      {doc && (
        <div className="rud1-in overflow-hidden rounded-xl border border-border/50 bg-white">
          <iframe title="Vista previa" srcDoc={doc} sandbox="" className="h-56 w-full" />
        </div>
      )}
    </div>
  );
}
