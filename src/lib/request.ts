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

/** Origen de rud1 Mail tal como lo ve el navegador (https://mail.rud1.es en producción). */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "mail.rud1.es";
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
