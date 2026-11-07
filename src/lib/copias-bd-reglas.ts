import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Reglas de las copias de la base de datos de rud1 que llegan a Archivos
 * (C-21). Sin E/S, para poder probarlas solas; la entrada está en
 * src/app/api/archivos/copias-bd/route.ts y el guardado en lib/copias-bd.ts.
 *
 * El servidor de base de datos sube cada noche la copia como un .zip cifrado
 * (AES-256, se abre con 7-Zip y la contraseña de los owners) a la carpeta de
 * Archivos de una persona, y aquí se guardan las de los últimos días.
 */

/** Nombre de una copia: rud1-AAAAMMDD-HHMM.zip, el mismo de la copia local con .zip. */
export const NOMBRE_COPIA = /^rud1-\d{8}-\d{4}\.zip$/;

export function esNombreDeCopia(nombre: string): boolean {
  return NOMBRE_COPIA.test(nombre);
}

export interface ConfigCopiasBd {
  /** Secreto compartido con el servidor de base de datos (32 caracteres o más). */
  secreto: string;
  /** IP desde las que se acepta (vacío = cualquiera; en producción, la del servidor de base de datos). */
  ips: string[];
  /** Buzón en cuyos Archivos se guardan. */
  destino: string;
  /** Carpeta, en la raíz de sus Archivos. */
  carpeta: string;
  /** Cuántas copias se guardan; las más antiguas se borran solas. */
  guardar: number;
}

/** La configuración, o null si no está completa: sin ella la entrada no existe. */
export function leerConfig(env: Record<string, string | undefined>): ConfigCopiasBd | null {
  const secreto = (env.COPIAS_BD_SECRETO ?? "").trim();
  const destino = (env.COPIAS_BD_DESTINO ?? "").trim().toLowerCase();
  if (secreto.length < 32 || !/^[^@\s]+@[^@\s]+$/.test(destino)) return null;
  const ips = (env.COPIAS_BD_IPS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const carpeta = (env.COPIAS_BD_CARPETA ?? "").trim() || "Backups BD";
  const n = Number.parseInt(env.COPIAS_BD_GUARDAR ?? "", 10);
  const guardar = Number.isFinite(n) && n >= 1 ? Math.min(n, 365) : 14;
  return { secreto, ips, destino, carpeta, guardar };
}

/** Comparación sin pistas de tiempo, sea cual sea la longitud. */
export function secretoCoincide(dado: string | null | undefined, secreto: string): boolean {
  if (!dado) return false;
  const a = createHash("sha256").update(dado).digest();
  const b = createHash("sha256").update(secreto).digest();
  return timingSafeEqual(a, b);
}

export function ipPermitida(ip: string | undefined, ips: readonly string[]): boolean {
  if (ips.length === 0) return true;
  return Boolean(ip) && ips.includes(ip!);
}

/**
 * Qué copias sobran: de los archivos de la carpeta con nombre de copia, se
 * quedan las `guardar` más recientes (el nombre lleva la fecha). Lo demás que
 * haya en la carpeta no se toca nunca.
 */
export function copiasABorrar(
  hijos: readonly { id: string; name: string; kind: "file" | "folder" }[],
  guardar: number,
): string[] {
  return hijos
    .filter((h) => h.kind === "file" && esNombreDeCopia(h.name))
    .sort((a, b) => b.name.localeCompare(a.name))
    .slice(guardar)
    .map((h) => h.id);
}
