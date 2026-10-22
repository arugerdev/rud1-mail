import { NextResponse } from "next/server";

import { getCustomSound } from "@/lib/profiles";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** El sonido propio de quien pregunta. La versión va en la dirección: se puede guardar en caché. */
export async function GET() {
  const user = await currentUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const sound = getCustomSound(user.email);
  if (!sound) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(sound.data), {
    headers: {
      "Content-Type": sound.type,
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
