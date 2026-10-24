import { NextResponse } from "next/server";

import { isOwner } from "@/lib/access";
import { config } from "@/lib/config";
import { consumeEntryLink, mailboxEntryAvailable, onAccessHost } from "@/lib/mailbox-entry";
import { getMailbox } from "@/lib/mailcow";
import { clientIp } from "@/lib/request";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Enlace de un solo uso de Administración → Usuarios: abre el buzón de otra
 * persona en esta pestaña (dirección de acceso, cookie propia).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  if (!mailboxEntryAvailable() || !(await onAccessHost())) return new Response(null, { status: 404 });
  const origin = config.accessOrigin!;
  const { token } = await params;
  const ip = await clientIp();

  const entry = consumeEntryLink(token, ip);
  const box = entry && isOwner(entry.by) ? await getMailbox(entry.email).catch(() => null) : null;
  if (!entry || !box || !box.active) return NextResponse.redirect(`${origin}/entrar?acceso=caducado`, 303);

  // Una entrada sustituye a la anterior en esta dirección.
  const session = await getSession();
  delete session.password;
  session.email = entry.email;
  session.name = box.name || entry.email;
  session.actingBy = entry.by;
  session.mustChangePassword = false;
  session.signedInAt = Date.now();
  await session.save();
  console.info(`[acceso] ${entry.by} entra en el buzón de ${entry.email}${ip ? ` desde ${ip}` : ""}`);

  return NextResponse.redirect(`${origin}/`, 303);
}
