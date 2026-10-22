"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, Loader2, Save, Send, UsersRound } from "lucide-react";
import { toast } from "sonner";

import { saveSharedAccessAction } from "@/app/actions/admin";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";

import { Avatar } from "../../../avatar";

interface Person {
  email: string;
  name: string;
  position: string;
  sharedAllowed: boolean;
  sendAllowed: boolean;
}

interface Grant {
  email: string;
  view: boolean;
  send: boolean;
}

interface SharedBox {
  address: string;
  name: string;
  grants: Grant[];
  viaTeams: { email: string; team: string; color: string; send: boolean }[];
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

const signature = (grants: Map<string, Grant>) =>
  [...grants.values()]
    .filter((g) => g.view || g.send)
    .map((g) => `${g.email}:${g.send ? "e" : "v"}`)
    .sort()
    .join();

function SharedCard({ box, people, index }: { box: SharedBox; people: Person[]; index: number }) {
  const initial = React.useMemo(() => new Map(box.grants.map((g) => [g.email, g])), [box.grants]);
  const [grants, setGrants] = React.useState(initial);
  const [saving, start] = React.useTransition();
  const dirty = signature(grants) !== signature(initial);
  const viewers = [...grants.values()].filter((g) => g.view || g.send).length;
  const senders = [...grants.values()].filter((g) => g.send).length;
  const byTeam = new Set(box.viaTeams.map((t) => t.email)).size;

  const toggle = (email: string, what: "view" | "send") => {
    const current = grants.get(email) ?? { email, view: false, send: false };
    const next = new Map(grants);
    if (what === "view") {
      // Quitar "lo ve" quita también "envía como".
      const view = !(current.view || current.send);
      next.set(email, { email, view, send: view ? current.send : false });
    } else {
      // Enviar como un buzón incluye verlo.
      const send = !current.send;
      next.set(email, { email, view: send ? true : current.view, send });
    }
    setGrants(next);
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
            {box.name} · lo ven {viewers} · envían como él {senders}
            {byTeam > 0 && ` · y ${byTeam} por equipo`}
          </p>
        </div>
        {dirty && <span className="text-xs text-warning">Sin guardar</span>}
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={() =>
            start(async () => {
              const r = await saveSharedAccessAction(box.address, [...grants.values()]);
              if (!r.ok) toast.error(r.error ?? "No se pudo guardar.");
              else toast.success(`Permisos de ${box.address} guardados`);
            })
          }
        >
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar
        </Button>
      </header>
      <ul className="divide-y divide-border/30">
        {people.map((p) => {
          const g = grants.get(p.email);
          const teams = box.viaTeams.filter((t) => t.email === p.email);
          return (
            <li key={p.email} className={cn("flex flex-wrap items-center gap-3 px-4 py-2", !p.sharedAllowed && "opacity-60")}>
              <Avatar email={p.email} name={p.name} className="size-7 text-[10px]" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{p.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {!p.sharedAllowed ? "Su rol no le deja ver buzones comunes" : p.position || p.email}
                </p>
              </div>
              {teams.map((t) => (
                <span
                  key={t.team}
                  title={`Por el equipo ${t.team}${t.send ? " (también envía)" : ""}`}
                  className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                  style={{ background: t.color }}
                >
                  <UsersRound className="size-3" /> {t.team}
                </span>
              ))}
              <Pill on={Boolean(g?.view || g?.send)} onClick={() => toggle(p.email, "view")} icon={Eye} label="Lo ve" />
              <Pill
                on={Boolean(g?.send)}
                onClick={() => toggle(p.email, "send")}
                icon={Send}
                label={p.sendAllowed ? "Envía como" : "Envía como (no puede enviar)"}
              />
            </li>
          );
        })}
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
        dirección. Para dar acceso a varias personas a la vez, usa los{" "}
        <Link href="/ajustes/administracion/roles" className="font-medium text-primary hover:underline">
          equipos
        </Link>
        .
      </p>
      {mailboxes.map((box, i) => (
        <SharedCard key={box.address} box={box} people={people} index={i} />
      ))}
    </div>
  );
}
