import { NextResponse, type NextRequest } from "next/server";

import { esNombreDeCopia, ipPermitida, leerConfig, secretoCoincide } from "@/lib/copias-bd-reglas";
import { guardarCopia, SinArchivosError } from "@/lib/copias-bd";
import { clientIp } from "@/lib/request";
import { QuotaExceededError } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Entrada de las copias de la base de datos de rud1 (C-21). La llama el
 * servidor de base de datos cada noche con la copia cifrada (.zip AES-256) y
 * queda en la carpeta «Backups BD» de los Archivos de COPIAS_BD_DESTINO, donde
 * se ven y se descargan como cualquier archivo.
 *
 * Es una entrada de máquina, no de persona: su propio secreto
 * (COPIAS_BD_SECRETO) y, en producción, solo desde la IP del servidor de base
 * de datos (COPIAS_BD_IPS). Sin la configuración no existe (404). El destino
 * lo fija la configuración, nunca la petición.
 *
 *   POST /api/archivos/copias-bd?nombre=rud1-AAAAMMDD-HHMM.zip
 *   Authorization: Bearer <COPIAS_BD_SECRETO>
 *   (cuerpo: el .zip)
 */
export async function POST(request: NextRequest) {
  const cfg = leerConfig(process.env);
  if (!cfg) return new NextResponse(null, { status: 404 });

  const ip = await clientIp();
  if (!ipPermitida(ip, cfg.ips)) {
    console.warn(`[copias-bd] rechazada: IP ${ip ?? "desconocida"} no permitida`);
    return NextResponse.json({ error: "No permitido" }, { status: 403 });
  }
  const auth = request.headers.get("authorization") ?? "";
  if (!secretoCoincide(auth.replace(/^Bearer\s+/i, ""), cfg.secreto)) {
    console.warn(`[copias-bd] rechazada: secreto incorrecto desde ${ip ?? "?"}`);
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const nombre = request.nextUrl.searchParams.get("nombre") ?? "";
  if (!esNombreDeCopia(nombre)) return NextResponse.json({ error: "Nombre de copia no válido" }, { status: 400 });
  if (!request.body) return NextResponse.json({ error: "La copia está vacía" }, { status: 400 });

  try {
    const r = await guardarCopia(cfg, nombre, request.body);
    console.info(`[copias-bd] guardada ${nombre} (${r.tamano} bytes) en «${r.carpeta}» de ${cfg.destino}; borradas ${r.borradas} antiguas`);
    return NextResponse.json({ ok: true, nombre, tamano: r.tamano, carpeta: r.carpeta, borradas: r.borradas });
  } catch (error) {
    if (error instanceof SinArchivosError || error instanceof QuotaExceededError) {
      console.error(`[copias-bd] ${nombre}: sin espacio en los Archivos de ${cfg.destino}`);
      return NextResponse.json({ error: "No queda espacio en el destino" }, { status: 507 });
    }
    console.error("[copias-bd] no se pudo guardar", nombre, error);
    return NextResponse.json({ error: "No se pudo guardar la copia" }, { status: 500 });
  }
}
