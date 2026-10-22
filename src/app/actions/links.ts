"use server";

import { redirect } from "next/navigation";

import { checkLinkPassword, usableLink } from "@/lib/files";
import { grantLinkAccess } from "@/lib/link-access";
import { blockedMinutes, registerFailure, registerSuccess } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";

/** Contraseña de un enlace compartido (página pública /f/…), con freno a los intentos. */
export async function unlockLinkAction(_prev: { error: string | null }, formData: FormData): Promise<{ error: string | null }> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (!usableLink(token)) return { error: "El enlace ya no está disponible." };
  const ip = await clientIp();
  const keys = [`enlace:${token}`, ...(ip ? [`enlace-ip:${ip}`] : [])];
  const wait = blockedMinutes(keys);
  if (wait > 0) return { error: `Demasiados intentos. Vuelve a probar dentro de ${wait} min.` };
  if (!checkLinkPassword(token, password)) {
    registerFailure(keys);
    return { error: "Esa no es la contraseña." };
  }
  registerSuccess(keys);
  await grantLinkAccess(token);
  redirect(`/f/${token}`);
}
