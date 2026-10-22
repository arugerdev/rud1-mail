import { NextResponse } from "next/server";

import { agendaConfigured, agendaIcs, AgendaApiError } from "@/lib/agenda";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Exportar la agenda de quien pregunta como .ics (de 60 días atrás a un año adelante). */
export async function GET() {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  if (!agendaConfigured()) return new NextResponse("La agenda no está conectada.", { status: 503 });
  try {
    const body = await agendaIcs(user.email);
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="agenda-rud1-${stamp}.ics"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof AgendaApiError ? error.message : "No se ha podido exportar.";
    return new NextResponse(message, { status: error instanceof AgendaApiError ? error.status : 500 });
  }
}
