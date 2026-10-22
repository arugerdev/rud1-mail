"use client";

import * as React from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Palette,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/shared/components/ui/dropdown-menu";

/**
 * Editor con formato para el correo, las firmas y la cabecera y el pie.
 * Produce HTML sencillo que entienden todos los clientes de correo; el
 * servidor lo vuelve a limpiar antes de enviarlo.
 */

const COLORS = [
  { name: "Negro", value: "#111827" },
  { name: "Gris", value: "#6b7280" },
  { name: "Azul rud1", value: "#2f86e8" },
  { name: "Verde", value: "#16a34a" },
  { name: "Naranja", value: "#ea580c" },
  { name: "Rojo", value: "#dc2626" },
  { name: "Morado", value: "#7c3aed" },
];

function ToolButton({
  label,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Que pulsar el botón no le quite el foco (ni la selección) al texto.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:opacity-40",
        active && "bg-primary-soft/40 text-primary-foreground dark:text-primary",
      )}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <span className="mx-0.5 h-5 w-px bg-border/60" aria-hidden />;
}

function setLink(editor: Editor) {
  const previous = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("Dirección del enlace (déjala vacía para quitarlo):", previous ?? "https://");
  if (url === null) return;
  if (url.trim() === "" || url.trim() === "https://") {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    return;
  }
  const href = /^(https?:|mailto:|tel:)/i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
}

export function Toolbar({ editor, compact = false }: { editor: Editor; compact?: boolean }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      quote: e.isActive("blockquote"),
      link: e.isActive("link"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div className="flex flex-wrap items-center gap-0.5">
      <ToolButton label="Negrita (Ctrl+B)" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold className="size-4" />
      </ToolButton>
      <ToolButton label="Cursiva (Ctrl+I)" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic className="size-4" />
      </ToolButton>
      <ToolButton label="Subrayado (Ctrl+U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <UnderlineIcon className="size-4" />
      </ToolButton>
      {!compact && (
        <ToolButton label="Tachado" active={s.strike} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough className="size-4" />
        </ToolButton>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title="Color del texto"
            aria-label="Color del texto"
            onMouseDown={(e) => e.preventDefault()}
            className="inline-flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent/60 hover:text-foreground"
          >
            <Palette className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          {COLORS.map((c) => (
            <DropdownMenuItem key={c.value} onClick={() => chain().setColor(c.value).run()}>
              <span className="size-3.5 rounded-full border border-border/50" style={{ background: c.value }} />
              {c.name}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => chain().unsetColor().run()}>Color normal</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Separator />
      <ToolButton label="Título" active={s.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()}>
        <Heading1 className="size-4" />
      </ToolButton>
      <ToolButton label="Subtítulo" active={s.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()}>
        <Heading2 className="size-4" />
      </ToolButton>
      <ToolButton label="Lista" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List className="size-4" />
      </ToolButton>
      <ToolButton label="Lista numerada" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered className="size-4" />
      </ToolButton>
      <ToolButton label="Cita" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote className="size-4" />
      </ToolButton>
      <ToolButton label="Enlace (Ctrl+K)" active={s.link} onClick={() => setLink(editor)}>
        <Link2 className="size-4" />
      </ToolButton>
      {!compact && (
        <>
          <Separator />
          <ToolButton label="Alinear a la izquierda" active={s.left} onClick={() => chain().setTextAlign("left").run()}>
            <AlignLeft className="size-4" />
          </ToolButton>
          <ToolButton label="Centrar" active={s.center} onClick={() => chain().setTextAlign("center").run()}>
            <AlignCenter className="size-4" />
          </ToolButton>
          <ToolButton label="Alinear a la derecha" active={s.right} onClick={() => chain().setTextAlign("right").run()}>
            <AlignRight className="size-4" />
          </ToolButton>
          <ToolButton label="Línea separadora" onClick={() => chain().setHorizontalRule().run()}>
            <Minus className="size-4" />
          </ToolButton>
        </>
      )}
      <Separator />
      <ToolButton label="Quitar formato" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
        <RemoveFormatting className="size-4" />
      </ToolButton>
      <ToolButton label="Deshacer (Ctrl+Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 className="size-4" />
      </ToolButton>
      <ToolButton label="Rehacer (Ctrl+Y)" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        <Redo2 className="size-4" />
      </ToolButton>
    </div>
  );
}

export interface RichEditorHandle {
  focus: () => void;
  getHtml: () => string;
  setHtml: (html: string) => void;
  insertText: (text: string) => void;
}

export const RichEditor = React.forwardRef<
  RichEditorHandle,
  {
    initialHtml: string;
    placeholder?: string;
    onChange?: (html: string) => void;
    className?: string;
    contentClassName?: string;
    toolbar?: "top" | "bottom" | "none";
    compactToolbar?: boolean;
    autoFocus?: boolean;
  }
>(function RichEditor(
  { initialHtml, placeholder, onChange, className, contentClassName, toolbar = "top", compactToolbar, autoFocus },
  ref,
) {
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    autofocus: autoFocus ? "start" : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
      }),
      TextStyle,
      Color,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({ placeholder: placeholder ?? "" }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: { class: cn("h-full", contentClassName) },
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
          event.preventDefault();
          if (editorRef.current) setLink(editorRef.current);
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor: e }) => onChangeRef.current?.(e.getHTML()),
  });
  const editorRef = React.useRef<Editor | null>(null);
  editorRef.current = editor;

  React.useImperativeHandle(
    ref,
    () => ({
      focus: () => editor?.commands.focus("start"),
      getHtml: () => editor?.getHTML() ?? "",
      setHtml: (html: string) => editor?.commands.setContent(html),
      insertText: (text: string) => editor?.chain().focus().insertContent(text).run(),
    }),
    [editor],
  );

  return (
    <div className={cn("rud1-editor flex min-h-0 flex-col", className)}>
      {editor && toolbar === "top" && (
        <div className="shrink-0 border-b border-border/40 px-2 py-1">
          <Toolbar editor={editor} compact={compactToolbar} />
        </div>
      )}
      <EditorContent editor={editor} className="min-h-0 flex-1 cursor-text overflow-y-auto px-4 py-3" onClick={() => editor?.commands.focus()} />
      {editor && toolbar === "bottom" && (
        <div className="shrink-0 border-t border-border/40 px-2 py-1">
          <Toolbar editor={editor} compact={compactToolbar} />
        </div>
      )}
    </div>
  );
});
