/**
 * Sonidos de rud1 Mail: los nombres y grupos (los comparten servidor y
 * página). El sonido en sí se genera en el navegador (app/(correo)/sounds.ts),
 * sin archivos: así no pesa ni depende de licencias.
 */

export const SOUND_GROUPS = ["Moderno", "Estilo Apple", "Retro", "Clásico", "Natural"] as const;
export type SoundGroup = (typeof SOUND_GROUPS)[number];

export const SOUNDS = [
  { id: "destello", name: "Destello", group: "Moderno" },
  { id: "burbuja", name: "Burbuja", group: "Moderno" },
  { id: "pulso", name: "Pulso", group: "Moderno" },
  { id: "brillo", name: "Brillo", group: "Moderno" },
  { id: "envio", name: "Envío", group: "Moderno" },
  { id: "cristal", name: "Cristal", group: "Estilo Apple" },
  { id: "campanita", name: "Campanita", group: "Estilo Apple" },
  { id: "nota", name: "Nota suave", group: "Estilo Apple" },
  { id: "tres-notas", name: "Tres notas", group: "Estilo Apple" },
  { id: "aviso-suave", name: "Aviso suave", group: "Estilo Apple" },
  { id: "moneda", name: "Moneda", group: "Retro" },
  { id: "arcade", name: "Arcade", group: "Retro" },
  { id: "bip", name: "Bip bip", group: "Retro" },
  { id: "power-up", name: "Power-up", group: "Retro" },
  { id: "error-retro", name: "Error", group: "Retro" },
  { id: "timbre", name: "Timbre", group: "Clásico" },
  { id: "campana", name: "Campana", group: "Clásico" },
  { id: "maquina", name: "Máquina de escribir", group: "Clásico" },
  { id: "gota", name: "Gota", group: "Natural" },
  { id: "madera", name: "Madera", group: "Natural" },
  { id: "clic", name: "Clic", group: "Natural" },
  { id: "vibracion", name: "Vibración", group: "Natural" },
] as const satisfies readonly { id: string; name: string; group: SoundGroup }[];

export type SoundId = (typeof SOUNDS)[number]["id"] | "personalizado" | "ninguno";

export const SOUND_IDS = new Set<string>([...SOUNDS.map((s) => s.id), "personalizado", "ninguno"]);

export const SOUND_EVENTS = [
  { key: "nuevo", label: "Correo nuevo", description: "En tu bandeja de entrada." },
  { key: "comun", label: "Correo en un buzón común", description: "contact@, support@… los que ves." },
  { key: "enviado", label: "Mensaje enviado", description: "Al salir bien un envío." },
  { key: "error", label: "Algo ha fallado", description: "Un envío o una acción que no se ha podido hacer." },
  { key: "recordatorio", label: "Recordatorio de la agenda", description: "Cuando llega la hora de un evento." },
] as const;

export type SoundEvent = (typeof SOUND_EVENTS)[number]["key"];

export interface SoundSetting {
  sound: SoundId;
  /** 0–100, sobre el volumen general. */
  volume: number;
}

export interface SoundPrefs {
  /** Volumen general, 0–100. */
  volume: number;
  /** También cuando estás mirando rud1 Mail (si no, solo con la ventana en segundo plano). */
  whenFocused: boolean;
  events: Record<SoundEvent, SoundSetting>;
  /** Sonido subido por la persona (tipo de archivo y versión, para no usar uno viejo en caché). */
  custom: { type: string; name: string; version: number } | null;
}

export const DEFAULT_SOUND_PREFS: SoundPrefs = {
  volume: 70,
  whenFocused: true,
  events: {
    nuevo: { sound: "destello", volume: 100 },
    comun: { sound: "campanita", volume: 90 },
    enviado: { sound: "envio", volume: 60 },
    error: { sound: "error-retro", volume: 80 },
    recordatorio: { sound: "tres-notas", volume: 100 },
  },
  custom: null,
};

/** Une lo guardado con los valores por defecto, descartando lo que no exista. */
export function normalizeSoundPrefs(raw: unknown): SoundPrefs {
  const input = (raw && typeof raw === "object" ? raw : {}) as Partial<SoundPrefs>;
  const clamp = (n: unknown, fallback: number) =>
    typeof n === "number" && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : fallback;
  const events = {} as Record<SoundEvent, SoundSetting>;
  for (const { key } of SOUND_EVENTS) {
    const saved = (input.events as Partial<Record<SoundEvent, Partial<SoundSetting>>> | undefined)?.[key];
    const fallback = DEFAULT_SOUND_PREFS.events[key];
    events[key] = {
      sound: saved?.sound && SOUND_IDS.has(saved.sound) ? (saved.sound as SoundId) : fallback.sound,
      volume: clamp(saved?.volume, fallback.volume),
    };
  }
  const custom = input.custom;
  return {
    volume: clamp(input.volume, DEFAULT_SOUND_PREFS.volume),
    whenFocused: typeof input.whenFocused === "boolean" ? input.whenFocused : DEFAULT_SOUND_PREFS.whenFocused,
    events,
    custom:
      custom && typeof custom.type === "string" && typeof custom.version === "number"
        ? { type: custom.type, name: String(custom.name ?? "Mi sonido").slice(0, 80), version: custom.version }
        : null,
  };
}
