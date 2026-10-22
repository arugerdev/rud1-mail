import { NextResponse, type NextRequest } from "next/server";

import { getAvatar } from "@/lib/profiles";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Foto de una persona del equipo. La versión va en la dirección: se puede guardar en caché para siempre. */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const email = (request.nextUrl.searchParams.get("correo") ?? "").toLowerCase();
  const avatar = email ? getAvatar(email) : null;
  if (!avatar) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(avatar.image), {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
