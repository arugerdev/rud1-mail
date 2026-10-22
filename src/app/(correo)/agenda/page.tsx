import type { Metadata } from "next";
import { CalendarX2 } from "lucide-react";

import { agendaCall, agendaConfigured, AgendaApiError, type AgendaMe, type AgendaPersonOption } from "@/lib/agenda";
import { requireUser } from "@/lib/session";

import { AgendaApp } from "./agenda-app";

export const metadata: Metadata = { title: "Agenda" };
export const dynamic = "force-dynamic";

function Unavailable({ title, text }: { title: string; text: string }) {
  return (
    <div className="rud1-in flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
        <CalendarX2 className="size-6" />
      </span>
      <p className="text-base font-semibold">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export default async function AgendaPage() {
  const user = await requireUser();
  if (!agendaConfigured()) {
    return <Unavailable title="La agenda aún no está conectada" text="Cuando admin.rud1.es tenga activada la conexión con rud1 Mail, aquí verás tu agenda." />;
  }
  let me: AgendaMe;
  let people: AgendaPersonOption[] = [];
  try {
    me = await agendaCall<AgendaMe>(user.email, "me");
    people = await agendaCall<AgendaPersonOption[]>(user.email, "people").catch(() => []);
  } catch (error) {
    if (error instanceof AgendaApiError && error.code === "no_admin") {
      return <Unavailable title="No tienes agenda en admin.rud1.es" text="No encontramos tu cuenta de admin.rud1.es. Si entras allí con otro correo, pide a Álvaro o Manuel que lo enlacen (Administración → Usuarios → Cuenta de la agenda); si no tienes cuenta, que te den de alta." />;
    }
    const text = error instanceof AgendaApiError ? error.message : "No se ha podido abrir la agenda.";
    return <Unavailable title="La agenda no está disponible" text={text} />;
  }
  return <AgendaApp me={me} people={people} />;
}
