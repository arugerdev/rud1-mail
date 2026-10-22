/**
 * Reglas puras (sin Electron) de la app de escritorio: qué es de rud1 Mail,
 * qué se abre fuera y cómo se leen los datos que manda la página.
 */

export const DEFAULT_APP_URL = "https://mail.rud1.es";

/** La dirección de la app: variable de entorno, la del empaquetado o la de producción. */
export function resolveAppUrl(fromEnv: string | undefined, fromPackage: string | undefined): string {
  const raw = (fromEnv || fromPackage || DEFAULT_APP_URL).trim();
  const url = new URL(raw);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocalHost(url.hostname))) {
    throw new Error(`La dirección de rud1 Mail tiene que ser https: ${raw}`);
  }
  return url.origin;
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

/** ¿Es una página de la propia app? Solo esas se abren dentro de la ventana. */
export function isAppUrl(candidate: string, appOrigin: string): boolean {
  try {
    return new URL(candidate).origin === appOrigin;
  } catch {
    return false;
  }
}

/** Lo que se puede mandar al navegador del sistema: solo web normal. */
export function isSafeExternal(candidate: string): boolean {
  try {
    const { protocol } = new URL(candidate);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** La página pone "(3) Bandeja de entrada · rud1 Mail" cuando hay 3 sin leer. */
export function unreadFromTitle(title: string): number {
  const match = title.match(/^\((\d+)\)/);
  return match ? Number.parseInt(match[1], 10) : 0;
}

/** Un enlace mailto: entre los argumentos con los que el sistema abre la app. */
export function mailtoFromArgv(argv: readonly string[]): string | null {
  return argv.find((arg) => /^mailto:/i.test(arg)) ?? null;
}

/** Dirección de la app que abre el redactor con los datos del mailto:. */
export function mailtoRoute(appOrigin: string, mailto: string): string {
  return `${appOrigin}/?mailto=${encodeURIComponent(mailto)}`;
}
