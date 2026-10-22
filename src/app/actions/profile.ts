"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";

import { invalidateDirectory } from "@/lib/contacts";
import { sanitizeAuthoredHtml } from "@/lib/mail/authoring";
import { editMailbox, mailcowAvailable } from "@/lib/mailcow";
import { wrap } from "@/lib/mail/render";
import {
  DEFAULT_PREFS,
  deleteCustomSound,
  fullName,
  getProfile,
  saveCustomSound,
  setAvatar,
  updatePrefs,
  updateProfile,
  updateSignature,
  type Prefs,
} from "@/lib/profiles";
import { getSession, requireUser } from "@/lib/session";
import { DEFAULT_SOUND_PREFS, normalizeSoundPrefs } from "@/lib/sound-catalog";
import { renderTemplate, variablesFor } from "@/lib/templates";

export interface ProfileResult {
  ok: boolean;
  error?: string;
}

const clean = (v: FormDataEntryValue | null, max = 120) => String(v ?? "").trim().slice(0, max);

export async function saveProfileAction(formData: FormData): Promise<ProfileResult> {
  const user = await requireUser();
  const data = {
    firstName: clean(formData.get("firstName"), 60),
    lastName: clean(formData.get("lastName"), 80),
    position: clean(formData.get("position")),
    department: clean(formData.get("department")),
    phone: clean(formData.get("phone"), 40),
  };
  if (!data.firstName) return { ok: false, error: "Escribe al menos tu nombre." };
  getProfile(user.email, user.name);
  updateProfile(user.email, data);

  // El nombre también es el del buzón: es el que ven los demás al recibir tus correos.
  const name = fullName({ ...data, email: user.email });
  if (mailcowAvailable()) {
    await editMailbox(user.email, { name }).catch((e) => console.error("[perfil] nombre en Mailcow", e));
  }
  const session = await getSession();
  session.name = name;
  await session.save();
  invalidateDirectory();
  revalidatePath("/", "layout");
  return { ok: true };
}

const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

export async function uploadAvatarAction(formData: FormData): Promise<ProfileResult> {
  const user = await requireUser();
  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elige una imagen." };
  if (file.size > MAX_AVATAR_BYTES) return { ok: false, error: "La imagen pasa de 8 MB." };
  try {
    // Cuadrada, centrada, 256 px y en WebP: pesa poco y se ve nítida en todas partes.
    const image = await sharp(Buffer.from(await file.arrayBuffer()), { limitInputPixels: 50_000_000 })
      .rotate()
      .resize(256, 256, { fit: "cover", position: "attention" })
      .webp({ quality: 86 })
      .toBuffer();
    getProfile(user.email, user.name);
    setAvatar(user.email, image);
  } catch (error) {
    console.error("[perfil] foto", error);
    return { ok: false, error: "Esa imagen no se puede usar. Prueba con un JPG o PNG." };
  }
  invalidateDirectory();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeAvatarAction(): Promise<ProfileResult> {
  const user = await requireUser();
  setAvatar(user.email, null);
  invalidateDirectory();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveSignatureAction(html: string): Promise<ProfileResult> {
  const user = await requireUser();
  if (html.length > 200_000) return { ok: false, error: "La firma es demasiado larga." };
  getProfile(user.email, user.name);
  updateSignature(user.email, sanitizeAuthoredHtml(html));
  return { ok: true };
}

/** Cómo queda la firma con tus datos, antes de guardarla. */
export async function previewSignatureAction(html: string): Promise<string> {
  const user = await requireUser();
  const profile = getProfile(user.email, user.name);
  return wrap(renderTemplate(sanitizeAuthoredHtml(html), variablesFor(profile)), true);
}

export async function savePrefsAction(prefs: Partial<Prefs>): Promise<ProfileResult> {
  const user = await requireUser();
  const current = getProfile(user.email, user.name).prefs;
  const next: Prefs = {
    notify: typeof prefs.notify === "boolean" ? prefs.notify : current.notify,
    sound: typeof prefs.sound === "boolean" ? prefs.sound : current.sound,
    // El sonido propio solo cambia al subirlo o quitarlo.
    sounds: prefs.sounds ? { ...normalizeSoundPrefs(prefs.sounds), custom: current.sounds.custom } : current.sounds,
    density: prefs.density === "compacta" || prefs.density === "comoda" ? prefs.density : current.density ?? DEFAULT_PREFS.density,
    openNext: typeof prefs.openNext === "boolean" ? prefs.openNext : current.openNext,
  };
  updatePrefs(user.email, next);
  revalidatePath("/", "layout");
  return { ok: true };
}

// --- Sonido propio para los avisos ---

const MAX_SOUND_BYTES = 1024 * 1024;
const SOUND_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/flac",
]);

export async function uploadSoundAction(formData: FormData): Promise<ProfileResult> {
  const user = await requireUser();
  const file = formData.get("sonido");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elige un archivo de sonido." };
  if (file.size > MAX_SOUND_BYTES) return { ok: false, error: "El sonido pasa de 1 MB: usa uno más corto." };
  if (!SOUND_TYPES.has(file.type)) return { ok: false, error: "Ese formato no vale. Usa MP3, OGG, WAV, M4A, WebM o FLAC." };
  const profile = getProfile(user.email, user.name);
  const name = file.name.replace(/\.[^.]+$/, "").slice(0, 80) || "Mi sonido";
  saveCustomSound(user.email, { type: file.type, name, data: Buffer.from(await file.arrayBuffer()) });
  updatePrefs(user.email, {
    ...profile.prefs,
    sounds: { ...profile.prefs.sounds, custom: { type: file.type, name, version: Date.now() } },
  });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function removeSoundAction(): Promise<ProfileResult> {
  const user = await requireUser();
  const profile = getProfile(user.email, user.name);
  deleteCustomSound(user.email);
  // Lo que usaba el sonido propio vuelve al de siempre.
  const events = { ...profile.prefs.sounds.events };
  for (const key of Object.keys(events) as (keyof typeof events)[]) {
    if (events[key].sound === "personalizado") events[key] = { ...DEFAULT_SOUND_PREFS.events[key], volume: events[key].volume };
  }
  updatePrefs(user.email, { ...profile.prefs, sounds: { ...profile.prefs.sounds, events, custom: null } });
  revalidatePath("/", "layout");
  return { ok: true };
}
