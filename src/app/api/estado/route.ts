import { NextResponse } from "next/server";

import { inboxState } from "@/lib/mail/messages";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Estado de la bandeja de entrada, para el contador del icono y los avisos. */
export async function GET() {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  try {
    return NextResponse.json(await inboxState(user), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[estado]", error);
    return new NextResponse(null, { status: 503 });
  }
}
