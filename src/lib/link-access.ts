import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import { config } from "@/lib/config";

/**
 * Enlaces con contraseña: tras escribirla bien, una cookie (solo para ese
 * enlace, 12 horas) deja descargar sin volver a pedirla.
 */

const cookieName = (token: string) => `rud1f_${token.slice(0, 12)}`;
const proof = (token: string) => createHmac("sha256", config.sessionSecret).update(`enlace:${token}`).digest("base64url");

export async function grantLinkAccess(token: string): Promise<void> {
  (await cookies()).set(cookieName(token), proof(token), {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "lax",
    path: `/f/${token}`,
    maxAge: 12 * 60 * 60,
  });
}

export async function hasLinkAccess(token: string): Promise<boolean> {
  const value = (await cookies()).get(cookieName(token))?.value;
  if (!value) return false;
  const a = Buffer.from(value);
  const b = Buffer.from(proof(token));
  return a.length === b.length && timingSafeEqual(a, b);
}
