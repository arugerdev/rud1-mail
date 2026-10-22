import { NextResponse, type NextRequest } from "next/server";

import { searchContacts } from "@/lib/contacts";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Sugerencias para el campo de destinatarios. */
export async function GET(request: NextRequest) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new NextResponse(null, { status: 401 });
  const q = (request.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
  try {
    const contacts = await searchContacts(user, q);
    return NextResponse.json(contacts, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("[contactos]", error);
    return NextResponse.json([], { status: 200 });
  }
}
