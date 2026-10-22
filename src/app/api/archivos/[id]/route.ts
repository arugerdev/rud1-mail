import { NextResponse, type NextRequest } from "next/server";

import { accessTo, getItem } from "@/lib/files";
import { fileResponse } from "@/lib/file-response";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Descarga (?descargar=1) o vista previa de un archivo al que se tiene acceso. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { id } = await params;
  const item = getItem(id);
  if (!item || item.kind !== "file" || accessTo(user.email, id) === "none") return new NextResponse(null, { status: 404 });
  return fileResponse(item, request, { download: request.nextUrl.searchParams.get("descargar") === "1" });
}
