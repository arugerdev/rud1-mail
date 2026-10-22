import "server-only";

import { db } from "@/lib/db";
import { DEFAULT_SOUND_PREFS, normalizeSoundPrefs, type SoundPrefs } from "@/lib/sound-catalog";

/** Lo que cada persona cuenta de sí misma: sale en su firma y en la cabecera y el pie. */
export interface Profile {
  email: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  phone: string;
  signatureHtml: string;
  prefs: Prefs;
  avatarVersion: number;
}

export interface Prefs {
  /** Avisos del sistema con el correo nuevo. */
  notify: boolean;
  /** Sonidos de aviso (con la app abierta), sí o no. */
  sound: boolean;
  /** Qué sonido y a qué volumen para cada cosa. */
  sounds: SoundPrefs;
  /** Lista compacta o cómoda. */
  density: "comoda" | "compacta";
  /** Abrir el siguiente mensaje al archivar o borrar el actual. */
  openNext: boolean;
}

export const DEFAULT_PREFS: Prefs = { notify: true, sound: true, sounds: DEFAULT_SOUND_PREFS, density: "comoda", openNext: true };

interface Row {
  email: string;
  first_name: string;
  last_name: string;
  position: string;
  department: string;
  phone: string;
  signature_html: string;
  prefs: string;
  avatar_version: number;
}

function parsePrefs(raw: string): Prefs {
  try {
    const saved = JSON.parse(raw) as Partial<Prefs>;
    return { ...DEFAULT_PREFS, ...saved, sounds: normalizeSoundPrefs(saved.sounds) };
  } catch {
    return DEFAULT_PREFS;
  }
}

function toProfile(row: Row): Profile {
  return {
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    position: row.position,
    department: row.department,
    phone: row.phone,
    signatureHtml: row.signature_html,
    prefs: parsePrefs(row.prefs),
    avatarVersion: row.avatar_version,
  };
}

/** Separa "Álvaro Rüger Chambra" en nombre y apellidos para el primer perfil. */
export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] ?? "", lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

const SELECT = `SELECT email, first_name, last_name, position, department, phone, signature_html, prefs, avatar_version FROM profiles`;

/** El perfil de una dirección; si no existe todavía, se crea con el nombre del buzón. */
export function getProfile(email: string, mailboxName?: string): Profile {
  const row = db().prepare(`${SELECT} WHERE email = ?`).get(email) as Row | undefined;
  if (row) return toProfile(row);
  const { firstName, lastName } = splitName(mailboxName && mailboxName !== email ? mailboxName : "");
  db()
    .prepare(`INSERT OR IGNORE INTO profiles (email, first_name, last_name, updated_at) VALUES (?, ?, ?, ?)`)
    .run(email, firstName, lastName, Date.now());
  return getProfile(email);
}

export function listProfiles(): Profile[] {
  return (db().prepare(`${SELECT} ORDER BY email`).all() as Row[]).map(toProfile);
}

export interface ProfileUpdate {
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  phone: string;
}

export function updateProfile(email: string, data: ProfileUpdate): void {
  db()
    .prepare(
      `UPDATE profiles SET first_name = ?, last_name = ?, position = ?, department = ?, phone = ?, updated_at = ? WHERE email = ?`,
    )
    .run(data.firstName, data.lastName, data.position, data.department, data.phone, Date.now(), email);
}

export function updateSignature(email: string, html: string): void {
  db().prepare(`UPDATE profiles SET signature_html = ?, updated_at = ? WHERE email = ?`).run(html, Date.now(), email);
}

export function updatePrefs(email: string, prefs: Prefs): void {
  db().prepare(`UPDATE profiles SET prefs = ?, updated_at = ? WHERE email = ?`).run(JSON.stringify(prefs), Date.now(), email);
}

export function setAvatar(email: string, image: Buffer | null): void {
  db()
    .prepare(`UPDATE profiles SET avatar = ?, avatar_version = avatar_version + 1, updated_at = ? WHERE email = ?`)
    .run(image, Date.now(), email);
}

export function getAvatar(email: string): { image: Buffer; version: number } | null {
  const row = db().prepare(`SELECT avatar, avatar_version FROM profiles WHERE email = ? AND avatar IS NOT NULL`).get(email) as
    | { avatar: Buffer; avatar_version: number }
    | undefined;
  return row ? { image: row.avatar, version: row.avatar_version } : null;
}

/** Versión de la foto de cada dirección que la tiene (para pedirla con caché). */
export function avatarVersions(): Record<string, number> {
  const rows = db().prepare(`SELECT email, avatar_version FROM profiles WHERE avatar IS NOT NULL`).all() as {
    email: string;
    avatar_version: number;
  }[];
  return Object.fromEntries(rows.map((r) => [r.email, r.avatar_version]));
}

export function fullName(p: Pick<Profile, "firstName" | "lastName" | "email">): string {
  return `${p.firstName} ${p.lastName}`.trim() || p.email;
}

// --- Sonido propio ---

export interface CustomSound {
  type: string;
  name: string;
  data: Buffer;
}

export function getCustomSound(email: string): CustomSound | null {
  const row = db().prepare(`SELECT type, name, data FROM custom_sounds WHERE email = ?`).get(email) as CustomSound | undefined;
  return row ?? null;
}

export function saveCustomSound(email: string, sound: CustomSound): void {
  db()
    .prepare(
      `INSERT INTO custom_sounds (email, type, name, data, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET type = excluded.type, name = excluded.name, data = excluded.data, updated_at = excluded.updated_at`,
    )
    .run(email, sound.type, sound.name, sound.data, Date.now());
}

export function deleteCustomSound(email: string): void {
  db().prepare(`DELETE FROM custom_sounds WHERE email = ?`).run(email);
}
