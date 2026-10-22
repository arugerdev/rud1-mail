import "server-only";

import { headers } from "next/headers";

/**
 * IP de quien hace la petición. Delante siempre hay un proxy (el Nginx de
 * Mailcow), que añade la IP real en X-Real-IP / X-Forwarded-For.
 */
export async function clientIp(): Promise<string | undefined> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || undefined;
}
