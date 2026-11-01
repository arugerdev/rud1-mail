import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Salud de esta copia, para el agente de despliegues (deploy/rud1-mail-deploy):
 * qué versión corre y si abre su base de datos. Que Dovecot o Mailcow no
 * respondan no cuenta: no es culpa de la versión y volver atrás no lo
 * arreglaría. Nginx no la publica (site.rud1mail.custom): el agente pregunta
 * dentro de cada copia.
 */
export async function GET() {
  const release = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
  try {
    db().prepare("SELECT 1").get();
  } catch (error) {
    console.error("[salud] la base de datos no abre", error);
    return NextResponse.json({ ok: false, release, error: "base de datos" }, { status: 503, headers: NO_STORE });
  }
  return NextResponse.json({ ok: true, release, servicio: "correo" }, { headers: NO_STORE });
}
