import { randomUUID } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { can } from "@/lib/access";
import { accessTo, addFile, cleanName, getItem, quota } from "@/lib/files";
import { currentUser } from "@/lib/session";
import { deleteObject, putObject, QuotaExceededError } from "@/lib/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Un archivo por petición, sin pasar entero por la memoria: va directo al almacén. */
const MAX_FILE_BYTES = 4 * 1024 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "Tu sesión ha caducado." }, { status: 401 });
  if (!can(user.email, "archivos.usar")) return NextResponse.json({ error: "No tienes acceso a Archivos." }, { status: 403 });

  const params = request.nextUrl.searchParams;
  const name = cleanName(params.get("nombre") ?? "");
  if (!name) return NextResponse.json({ error: "El archivo no tiene nombre." }, { status: 400 });
  const parentId = params.get("carpeta") || null;
  if (parentId) {
    const parent = getItem(parentId);
    if (!parent || parent.kind !== "folder" || accessTo(user.email, parentId) !== "edit") {
      return NextResponse.json({ error: "No puedes subir a esa carpeta." }, { status: 403 });
    }
  }
  if (!request.body) return NextResponse.json({ error: "El archivo está vacío." }, { status: 400 });

  const { used, total } = quota(user.email);
  const free = Math.max(0, total - used);
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > free) return NextResponse.json({ error: "No te queda espacio para este archivo." }, { status: 413 });
  if (declared > MAX_FILE_BYTES) return NextResponse.json({ error: "Un archivo no puede pasar de 4 GB." }, { status: 413 });

  const id = randomUUID();
  try {
    const size = await putObject(id, request.body, Math.min(free, MAX_FILE_BYTES));
    const mime = (request.headers.get("content-type") ?? "").split(";")[0].trim() || "application/octet-stream";
    const item = addFile({ id, owner: user.email, parentId, name, size, mime });
    return NextResponse.json({ ok: true, item });
  } catch (error) {
    await deleteObject(id).catch(() => undefined);
    if (error instanceof QuotaExceededError) return NextResponse.json({ error: "No te queda espacio para este archivo." }, { status: 413 });
    console.error("[archivos] subida", error);
    return NextResponse.json({ error: "No se pudo subir el archivo." }, { status: 500 });
  }
}
