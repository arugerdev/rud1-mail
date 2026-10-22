import { NextResponse, type NextRequest } from "next/server";

import { countDownload, getItem, insideLink, usableLink } from "@/lib/files";
import { fileResponse } from "@/lib/file-response";
import { hasLinkAccess } from "@/lib/link-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Descarga desde un enlace compartido: solo lo que hay dentro de lo compartido. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const found = usableLink(token);
  if (!found) return new NextResponse("Enlace no disponible", { status: 404 });
  if (found.link.hasPassword && !(await hasLinkAccess(token))) return NextResponse.redirect(new URL(`/f/${token}`, request.url));
  const item = getItem(id);
  if (!item || item.kind !== "file" || item.trashedAt !== null || !insideLink(found.link, id)) {
    return new NextResponse("Archivo no disponible", { status: 404 });
  }
  // Una descarga = la primera petición (no cada trozo de un vídeo o reanudación).
  if (!request.headers.get("range")) countDownload(token);
  return fileResponse(item, request, { download: true });
}
