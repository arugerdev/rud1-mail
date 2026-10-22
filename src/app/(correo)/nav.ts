/** Direcciones de la bandeja: todo el estado de la vista vive en la URL. */

export interface MailView {
  carpeta?: string;
  pagina?: number;
  buscar?: string;
  mensaje?: number;
}

export function mailHref({ carpeta = "INBOX", pagina, buscar, mensaje }: MailView): string {
  const sp = new URLSearchParams();
  if (carpeta && carpeta !== "INBOX") sp.set("carpeta", carpeta);
  if (buscar) sp.set("buscar", buscar);
  if (pagina && pagina > 1) sp.set("pagina", String(pagina));
  if (mensaje) sp.set("mensaje", String(mensaje));
  const qs = sp.toString();
  return qs ? `/?${qs}` : "/";
}

const TZ = "Europe/Madrid";

/** Fecha corta de la lista: la hora si es de hoy, el día si es de este año. */
export function shortDate(iso: string | null, now = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  const day = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: TZ, dateStyle: "short" }).format(d);
  if (day(date) === day(now)) {
    return new Intl.DateTimeFormat("es-ES", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(date);
  }
  const year = (d: Date) => new Intl.DateTimeFormat("es-ES", { timeZone: TZ, year: "numeric" }).format(d);
  if (year(date) === year(now)) {
    return new Intl.DateTimeFormat("es-ES", { timeZone: TZ, day: "numeric", month: "short" }).format(date);
  }
  return new Intl.DateTimeFormat("es-ES", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit" }).format(date);
}

export function longDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("es-ES", { timeZone: TZ, dateStyle: "full", timeStyle: "short" }).format(new Date(iso));
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;
}
