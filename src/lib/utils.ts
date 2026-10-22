import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";


export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}


export function formatRelativeTime(
  date: Date | string | null | undefined,
  locale?: string,
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  // Funciona en ambas direcciones: una expiración futura decía "ahora"
  // porque el diff negativo caía en la rama de segundos.
  const diffMs = d.getTime() - Date.now();
  const sign = diffMs > 0 ? 1 : -1;
  const seconds = Math.floor(Math.abs(diffMs) / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (seconds < 60) return rtf.format(0, "second");
  if (minutes < 60) return rtf.format(sign * minutes, "minute");
  if (hours < 24) return rtf.format(sign * hours, "hour");
  if (days < 7) return rtf.format(sign * days, "day");
  return d.toLocaleDateString(locale);
}


export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}


export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}


export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}


export function safeInt(value: unknown, fallback = 0): number {
  const n = typeof value === "number" ? value : parseInt(String(value), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Extracts the user-visible part of the firmware version. CI builds emit
 * `vX.Y.Z-master.<ts>.<fw-sha>.<app-sha>`; operators only need the `vX.Y.Z`
 * prefix in the dashboard. The full string is kept for tooltips/diagnostics
 * and remains the source of truth for updater comparisons on the device.
 *
 *   v0.1.0-master.20260527T183830.2d1493cc.500fa18c → v0.1.0
 *   v0.1.0                                          → v0.1.0
 *   anything else                                   → returned as-is
 */
export function shortenFirmwareVersion(raw: string | null | undefined): string {
  if (!raw) return "";
  const m = /^(v\d+\.\d+\.\d+)/.exec(raw.trim());
  return m ? m[1] : raw;
}

/**
 * Picks the IPv4 to show as the device's reachable address from its reported
 * interface list. Prefers `br-rud1` (the L2 bridge whose value is applied to
 * eth0), then other wired/wireless interfaces, never loopback or modem
 * interfaces (usb0, enx..., wwan...). Returns null when nothing usable exists
 * so callers can hide the IP line instead of printing `127.0.0.1`.
 */
export function selectDeviceDisplayIp(
  interfaces:
    | Array<{
        name?: string | null;
        up?: boolean;
        ipv4?: string[] | null;
        isLoopback?: boolean;
      }>
    | null
    | undefined,
): string | null {
  if (!interfaces || interfaces.length === 0) return null;
  const isModem = (name: string) =>
    /^(usb\d+|enx[0-9a-f]+|wwan\d+)$/i.test(name);
  // El puerto de gestión (rud1-mgmt*) es plano de control, nunca "la IP del equipo".
  const isMgmtPort = (name: string) => name.startsWith("rud1-mgmt");
  const firstIpv4 = (i: { ipv4?: string[] | null }) =>
    i.ipv4?.find((ip) => ip && ip.length > 0) ?? null;
  // Preferred order: the L2 bridge first, then common wired/wireless names.
  for (const wanted of ["br-rud1", "eth0", "wlan0"]) {
    const match = interfaces.find(
      (i) => i.name === wanted && i.up !== false && !i.isLoopback,
    );
    const ip = match ? firstIpv4(match) : null;
    if (ip) return ip;
  }
  // Fallback: first non-loopback, non-modem interface that has an IPv4.
  for (const i of interfaces) {
    const name = i.name ?? "";
    if (i.isLoopback || isModem(name) || isMgmtPort(name)) continue;
    if (i.up === false) continue;
    const ip = firstIpv4(i);
    if (ip) return ip;
  }
  return null;
}
