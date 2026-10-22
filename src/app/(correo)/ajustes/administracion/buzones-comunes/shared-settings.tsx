"use client";

import * as React from "react";
import { Eye, Loader2, Save, Send } from "lucide-react";
import { toast } from "sonner";

import { saveSharedAccessAction } from "@/app/actions/admin";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";

import { Avatar } from "../../../avatar";

interface Person {
  email: string;
  name: string;
  position: string;
}

interface SharedBox {
  address: string;
  name: string;
  active: boolean;
  viewers: string[];
  senders: string[];
}

function Pill({
  on,
  onClick,
  icon: Icon,
  label,
}: {
  on: boolean;
  onClick: () => void;
  icon: typeof Eye;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-all active:scale-95",
        on
          ? "border-primary/40 bg-primary-soft/50 text-primary-foreground shadow-glass-xs dark:text-primary"
          : "border-border/60 text-muted-foreground hover:bg-accent/40",
      )}
    >
      <Icon className="size-3.5" />
      {label}
    </button>
  );
}

function SharedCard({ box, people, index }: { box: SharedBox; people: Person[]; index: number }) {
  const [viewers, setViewers] = React.useState(new Set(box.viewers));
  const [senders, setSenders] = React.useState(new Set(box.senders));
  const [saving, start] = React.useTransition();
  const dirty =
    [...viewers].sort().join() !== [...box.viewers].sort().join() || [...senders].sort().join() !== [...box.senders].sort().join();

  const toggle = (set: Set<string>, update: (s: Set<string>) => void, email: string) => {
    const next = new Set(set);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    update(next);
  };

  return (
    <section
      className="rud1-in overflow-hidden rounded-2xl border border-border/50 bg-surface-1/50 shadow-glass-xs backdrop-blur-xl"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <header className="flex flex-wrap items-center gap-3 border-b border-border/40 px-4 py-3">
        <Avatar email={box.address} name={box.name} className="size-9" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{box.address}</p>
          <p className="truncate text-xs text-muted-foreground">
            {box.name} · lo ven {viewers.size} · envían como él {senders.size}
          </p>
        </div>
        {dirty && <span className="text-xs text-warning">Sin guardar</span>}
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={() =>
            start(async () => {
              const r = await saveSharedAccessAction(box.address, [...viewers], [...senders]);
              if (!r.ok) toast.error(r.error ?? "No se pudo guardar.");
              else toast.success(`Permisos de ${box.address} guardados`);
            })
          }
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar
        </Button>
      </header>
      <ul className="divide-y divide-border/30">
        {people.map((p) => (
          <li key={p.email} className="flex flex-wrap items-center gap-3 px-4 py-2">
            <Avatar email={p.email} name={p.name} className="size-7 text-[10px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{p.name}</p>
              <p className="truncate text-xs text-muted-foreground">{p.position || p.email}</p>
            </div>
            <Pill on={viewers.has(p.email)} onClick={() => toggle(viewers, setViewers, p.email)} icon={Eye} label="Lo ve" />
            <Pill on={senders.has(p.email)} onClick={() => toggle(senders, setSenders, p.email)} icon={Send} label="Envía como" />
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SharedSettings({ people, mailboxes }: { people: Person[]; mailboxes: SharedBox[] }) {
  return (
    <div className="space-y-4">
      <p className="rud1-in text-sm text-muted-foreground">
        <strong className="text-foreground">Lo ve</strong>: el buzón aparece en su barra lateral, en el móvil y en Outlook, y puede
        leer, mover y borrar sus mensajes. <strong className="text-foreground">Envía como</strong>: puede escribir y responder con esa
        dirección.
      </p>
      {mailboxes.map((box, i) => (
        <SharedCard key={box.address} box={box} people={people} index={i} />
      ))}
    </div>
  );
}
