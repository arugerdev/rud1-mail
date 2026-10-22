import { NextResponse, type NextRequest } from "next/server";

import { listFolders } from "@/lib/mail/folders";
import { getAttachment } from "@/lib/mail/messages";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Nombre de archivo seguro para la cabecera, con la versión UTF-8 aparte. */
function disposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new NextResponse("No autorizado", { status: 401 });

  const params = request.nextUrl.searchParams;
  const folder = params.get("carpeta") ?? "";
  const uid = Number.parseInt(params.get("uid") ?? "", 10);
  const index = Number.parseInt(params.get("i") ?? "", 10);
  if (!folder || !(uid > 0) || !(index >= 0)) return new NextResponse("Petición no válida", { status: 400 });

  const folders = await listFolders(user);
  if (!folders.some((f) => f.path === folder)) return new NextResponse("No encontrado", { status: 404 });

  const att = await getAttachment(user, folder, uid, index);
  if (!att) return new NextResponse("No encontrado", { status: 404 });

  // Siempre como descarga: un HTML o SVG adjunto no se abre nunca dentro de rud1 Mail.
  return new NextResponse(new Uint8Array(att.content), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": disposition(att.filename),
      "Content-Length": String(att.content.length),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
