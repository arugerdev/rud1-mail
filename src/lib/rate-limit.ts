import "server-only";

/**
 * Límite de intentos de entrada, en memoria.
 *
 * Por IP y por dirección: 5 fallos en 15 minutos bloquean 15 minutos. Es una
 * capa propia además de la de Mailcow, que bloquea en el cortafuegos.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

interface Bucket {
  failures: number[];
  blockedUntil: number;
}

const store = (globalThis as unknown as { __rud1MailLimits?: Map<string, Bucket> }).__rud1MailLimits ?? new Map<string, Bucket>();
(globalThis as unknown as { __rud1MailLimits?: Map<string, Bucket> }).__rud1MailLimits = store;

function bucket(key: string): Bucket {
  let b = store.get(key);
  if (!b) {
    b = { failures: [], blockedUntil: 0 };
    store.set(key, b);
  }
  return b;
}

/** Minutos que quedan de bloqueo para cualquiera de las claves, o 0 si se puede intentar. */
export function blockedMinutes(keys: string[]): number {
  const now = Date.now();
  const until = Math.max(0, ...keys.map((k) => store.get(k)?.blockedUntil ?? 0));
  return until > now ? Math.ceil((until - now) / 60_000) : 0;
}

export function registerFailure(keys: string[]): void {
  const now = Date.now();
  for (const key of keys) {
    const b = bucket(key);
    b.failures = b.failures.filter((t) => now - t < WINDOW_MS);
    b.failures.push(now);
    if (b.failures.length >= MAX_FAILURES) {
      b.blockedUntil = now + WINDOW_MS;
      b.failures = [];
    }
  }
}

export function registerSuccess(keys: string[]): void {
  for (const key of keys) store.delete(key);
}
