"use client";

import * as React from "react";
import { Braces, Code2, Loader2, RotateCcw, Type } from "lucide-react";

import { cn } from "@/lib/utils";
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

type Mode = "visual" | "html";

/** Lo que el editor visual no sabe conservar: con esto se abre en HTML. */
const NEEDS_HTML = /<(table|td|tr|img)\b/i;

/**
 * Editor de firma, cabecera o pie: formato, datos de la persona como
 * {{variables}} y vista previa (al momento) con los datos reales.
 *
 * Dos modos: el visual, para texto con formato, y el HTML, para diseños con
 * tablas e imágenes como la firma de marca, que el visual desharía.
 */
export function TemplateEditor({
  initialHtml,
  onChange,
  variables,
  preview,
  placeholder,
  minHeight = 180,
  defaultHtml,
}: {
  initialHtml: string;
  onChange: (html: string) => void;
  variables: TemplateVariable[];
  preview: (html: string) => Promise<string>;
  placeholder?: string;
  minHeight?: number;
  /** Plantilla de rud1 a la que se puede volver. */
  defaultHtml?: string;
}) {
  const editorRef = React.useRef<RichEditorHandle>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = React.useState<Mode>(NEEDS_HTML.test(initialHtml) ? "html" : "visual");
  const [html, setHtml] = React.useState(initialHtml);
  // Cambia para que el editor visual vuelva a empezar con otro contenido.
  const [visualKey, setVisualKey] = React.useState(0);
  const [doc, setDoc] = React.useState<string | null>(null);
  const [loading, startLoading] = React.useTransition();

  const update = (next: string) => {
    setHtml(next);
    onChange(next);
  };

  // Vista previa siempre a la vista, al poco de dejar de escribir.
  React.useEffect(() => {
    const timer = window.setTimeout(() => startLoading(async () => setDoc(await preview(html))), 450);
    return () => window.clearTimeout(timer);
  }, [html, preview]);

  const insertVariable = (key: string) => {
    const token = `{{${key}}}`;
    if (mode === "visual") {
      editorRef.current?.insertText(token);
      return;
    }
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? html.length;
    const end = ta.selectionEnd ?? start;
    update(html.slice(0, start) + token + html.slice(end));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const switchTo = (next: Mode) => {
    if (next === mode) return;
    if (
      next === "visual" &&
      NEEDS_HTML.test(html) &&
      !window.confirm("El editor visual no conserva las tablas ni las imágenes de este diseño. ¿Pasar igualmente?")
    ) {
      return;
    }
    if (next === "visual") setVisualKey((k) => k + 1);
    setMode(next);
  };

  const restore = () => {
    if (!defaultHtml || !window.confirm("¿Volver a la plantilla de rud1? Se pierde lo que hayas cambiado.")) return;
    update(defaultHtml);
    setMode(NEEDS_HTML.test(defaultHtml) ? "html" : "visual");
    setVisualKey((k) => k + 1);
  };

  return (
    <div className="space-y-3">
      <div
        className="overflow-hidden rounded-xl border border-border/60 bg-background/60 shadow-glass-xs"
        style={{ ["--min" as string]: `${minHeight}px` }}
      >
        {mode === "visual" ? (
          <RichEditor
            key={visualKey}
            ref={editorRef}
            initialHtml={html}
            placeholder={placeholder}
            onChange={update}
            className="[&_.ProseMirror]:min-h-[var(--min)]"
            contentClassName=""
          />
        ) : (
          <textarea
            ref={textareaRef}
            value={html}
            onChange={(e) => update(e.target.value)}
            spellCheck={false}
            placeholder={placeholder}
            className="block min-h-[var(--min)] w-full resize-y bg-transparent p-3 font-mono text-xs leading-relaxed outline-none"
            style={{ minHeight: Math.max(minHeight, 160) }}
          />
        )}
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
                <DropdownMenuItem key={v.key} onClick={() => insertVariable(v.key)}>
                  <span className="flex-1">{v.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{v.example}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {defaultHtml && (
            <Button variant="ghost" size="sm" className="gap-1.5" onClick={restore}>
              <RotateCcw className="size-4" /> Plantilla de rud1
            </Button>
          )}
          <div className="ml-auto flex rounded-lg border border-border/50 p-0.5" role="group" aria-label="Modo de edición">
            {(
              [
                ["visual", "Visual", Type],
                ["html", "HTML", Code2],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                onClick={() => switchTo(value)}
                aria-pressed={mode === value}
                className={cn(
                  "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  mode === value ? "bg-primary-soft/60 text-primary-foreground dark:text-primary" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="rud1-in relative overflow-hidden rounded-xl border border-border/50 bg-white">
        <span className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-black/5 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500">
          {loading && <Loader2 className="size-3 animate-spin" />} Vista previa
        </span>
        {doc ? (
          <iframe title="Vista previa" srcDoc={doc} sandbox="" className="h-60 w-full" />
        ) : (
          <div className="h-60" />
        )}
      </div>
    </div>
  );
}
