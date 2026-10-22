"use client";

import * as React from "react";
import { X } from "lucide-react";

import { isValidEmail, parseAddressList } from "@/lib/mail/text";
import { cn } from "@/lib/utils";

import { Avatar } from "../avatar";

export interface Recipient {
  address: string;
  name?: string;
}

interface Suggestion {
  address: string;
  name: string;
  team: boolean;
  position?: string;
  avatarVersion?: number;
}

function label(r: Recipient): string {
  return r.name || r.address;
}

/**
 * Destinatarios como chips: se escribe, se elige de la lista (el equipo de
 * rud1 y la gente con la que más se escribe) y cada dirección queda como una
 * pastilla. Acepta pegar varias de golpe; las que no son válidas salen en rojo.
 */
export function RecipientInput({
  value,
  onChange,
  inputRef,
  placeholder,
  autoFocus,
  ariaLabel,
}: {
  value: Recipient[];
  onChange: (next: Recipient[]) => void;
  inputRef?: React.Ref<HTMLInputElement>;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel: string;
}) {
  const [text, setText] = React.useState("");
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>([]);
  // Para qué texto son las sugerencias: si se ha seguido escribiendo, ya no valen.
  const [suggestionsFor, setSuggestionsFor] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const localRef = React.useRef<HTMLInputElement>(null);
  const listId = React.useId();

  React.useImperativeHandle(inputRef, () => localRef.current as HTMLInputElement);

  // Sugerencias, con una pequeña espera para no pedir en cada tecla.
  React.useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/contactos?q=${encodeURIComponent(text)}`, { signal: controller.signal });
        if (!res.ok) return;
        const all = (await res.json()) as Suggestion[];
        const taken = new Set(value.map((v) => v.address.toLowerCase()));
        setSuggestions(all.filter((s) => !taken.has(s.address.toLowerCase())));
        setSuggestionsFor(text);
        setActive(0);
      } catch {
        // cancelada o sin red: sin sugerencias
      }
    }, 120);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [text, open, value]);

  const add = (items: Recipient[]) => {
    const taken = new Set(value.map((v) => v.address.toLowerCase()));
    const fresh = items.filter((i) => i.address && !taken.has(i.address.toLowerCase()));
    if (fresh.length) onChange([...value, ...fresh]);
    setText("");
  };

  const commitText = () => {
    const parsed = parseAddressList(text);
    if (parsed.length) add(parsed.map((p) => ({ address: p.address, name: p.name })));
  };

  const pick = (s: Suggestion) => {
    add([{ address: s.address, name: s.name }]);
    setSuggestions([]);
    localRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const showing = open && suggestions.length > 0 && text.trim() !== "" && suggestionsFor === text;
    if (e.key === "ArrowDown" && showing) {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp" && showing) {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if ((e.key === "Enter" || e.key === "Tab") && showing) {
      e.preventDefault();
      pick(suggestions[active]);
    } else if (e.key === "Enter" || e.key === "," || e.key === ";") {
      if (text.trim()) {
        e.preventDefault();
        commitText();
      }
    } else if (e.key === "Backspace" && text === "" && value.length) {
      onChange(value.slice(0, -1));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const showList = open && suggestions.length > 0 && text.trim() !== "" && suggestionsFor === text;

  return (
    <div className="relative min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-1 py-1.5" onClick={() => localRef.current?.focus()}>
        {value.map((r, i) => {
          const valid = isValidEmail(r.address);
          return (
            <span
              key={`${r.address}-${i}`}
              title={r.name ? `${r.name} <${r.address}>` : r.address}
              className={cn(
                "rud1-pop inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border py-0.5 pl-0.5 pr-1.5 text-xs",
                valid
                  ? "border-border/60 bg-surface-1/70 text-foreground"
                  : "border-destructive/50 bg-destructive-soft/30 text-destructive-foreground dark:text-destructive",
              )}
            >
              <Avatar email={r.address} name={label(r)} className="size-5 text-[9px]" />
              <span className="truncate">{label(r)}</span>
              <button
                type="button"
                aria-label={`Quitar ${r.address}`}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(value.filter((_, j) => j !== i));
                }}
              >
                <X className="size-3" />
              </button>
            </span>
          );
        })}
        <input
          ref={localRef}
          value={text}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-expanded={showList}
          role="combobox"
          placeholder={value.length === 0 ? placeholder : undefined}
          className="min-w-[8rem] flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/60"
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // Lo escrito sin confirmar se convierte en chip al salir del campo.
            window.setTimeout(() => setOpen(false), 150);
            if (text.trim()) commitText();
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            if (/[,;\n]/.test(pasted)) {
              e.preventDefault();
              add(parseAddressList(pasted).map((p) => ({ address: p.address, name: p.name })));
            }
          }}
          spellCheck={false}
          autoComplete="off"
        />
      </div>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="rud1-in absolute left-0 right-0 top-full z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border/50 bg-popover/95 p-1 shadow-glass-lg backdrop-blur-xl"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.address}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm",
                i === active ? "bg-primary-soft/40" : "hover:bg-accent/50",
              )}
            >
              <Avatar email={s.address} name={s.name || s.address} version={s.avatarVersion} className="size-7 text-[10px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{s.name || s.address}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {s.address}
                  {s.team && (s.position ? ` · ${s.position}` : " · rud1")}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
