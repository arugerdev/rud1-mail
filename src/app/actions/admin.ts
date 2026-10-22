"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";

import { isAdmin } from "@/lib/admin";
import { config } from "@/lib/config";
import { invalidateDirectory } from "@/lib/contacts";
import { closeConnections } from "@/lib/imap";
import {
  createAlias,
  createMailbox,
  deleteAlias,
  deleteMailbox,
  editAlias,
  editMailbox,
  MailcowError,
} from "@/lib/mailcow";
import { sanitizeAuthoredHtml } from "@/lib/mail/authoring";
import { wrap } from "@/lib/mail/render";
import { isValidEmail } from "@/lib/mail/text";
import { getProfile } from "@/lib/profiles";
import { requireUser } from "@/lib/session";
import { renderTemplate, saveOrgTemplates, variablesFor, type OrgTemplates } from "@/lib/templates";

export interface AdminResult {
  ok: boolean;
  error?: string;
  /** Contraseña provisional recién creada: se enseña una sola vez. */
  password?: string;
}

/** Buzones que no se pueden borrar ni desactivar desde aquí (la web envía con noreply@). */
const PROTECTED = new Set([`noreply@${config.domain}`]);

async function admin() {
  const user = await requireUser();
  if (!isAdmin(user.email)) throw new Error("Solo administración puede hacer esto.");
  return user;
}

function done(): AdminResult {
  invalidateDirectory();
  revalidatePath("/ajustes/administracion", "layout");
  return { ok: true };
}

function failure(error: unknown, fallback: string): AdminResult {
  console.error("[administración]", error);
  if (error instanceof MailcowError) {
    if (/object_exists|alias_goto_identical|mailbox_exists|is_alias|is_mailbox/i.test(error.code)) {
      return { ok: false, error: "Esa dirección ya existe (como buzón o como dirección)." };
    }
    if (/quota/i.test(error.code)) return { ok: false, error: "No queda espacio para ese tamaño de buzón." };
  }
  if (error instanceof Error && error.message.startsWith("Solo administración")) return { ok: false, error: error.message };
  return { ok: false, error: fallback };
}

/** Contraseña provisional: 16 caracteres, letras y números, fácil de dictar (sin 0/O ni 1/l). */
function provisionalPassword(): string {
  const letters = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const all = letters + digits;
  let out = "";
  for (let i = 0; i < 16; i++) out += all[randomInt(all.length)];
  return out.replace(/^.{2}/, letters[randomInt(letters.length)] + digits[randomInt(digits.length)]);
}

// --- Cabecera y pie ---

export async function saveTemplatesAction(templates: OrgTemplates): Promise<AdminResult> {
  try {
    const user = await admin();
    saveOrgTemplates(templates, user.email);
    return done();
  } catch (error) {
    return failure(error, "No se pudo guardar.");
  }
}

/** Cómo queda un bloque con los datos de una persona del equipo. */
export async function previewTemplateAction(html: string, forEmail: string): Promise<string> {
  const user = await admin();
  const profile = getProfile(isValidEmail(forEmail) ? forEmail : user.email);
  return wrap(renderTemplate(sanitizeAuthoredHtml(html), variablesFor(profile)), true);
}

// --- Buzones ---

export async function createMailboxAction(input: {
  localPart: string;
  name: string;
  quotaMb: number;
  shared: boolean;
}): Promise<AdminResult> {
  try {
    await admin();
    const localPart = input.localPart.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(localPart)) {
      return { ok: false, error: "La dirección solo puede llevar letras, números, puntos, guiones y guiones bajos." };
    }
    if (!input.name.trim()) return { ok: false, error: "Ponle un nombre al buzón." };
    const quotaMb = Math.min(20_480, Math.max(256, Math.round(input.quotaMb || 3072)));
    const password = provisionalPassword();
    await createMailbox({ localPart, domain: config.domain, name: input.name.trim(), quotaMb, password, shared: input.shared });
    return { ...done(), password };
  } catch (error) {
    return failure(error, "No se pudo crear el buzón.");
  }
}

export async function setMailboxActiveAction(email: string, active: boolean): Promise<AdminResult> {
  try {
    const user = await admin();
    if (PROTECTED.has(email)) return { ok: false, error: "Ese buzón lo usa la web para enviar: no se puede desactivar." };
    if (email === user.email && !active) return { ok: false, error: "No puedes desactivar tu propio buzón." };
    await editMailbox(email, { active });
    if (!active) await closeConnections(email);
    return done();
  } catch (error) {
    return failure(error, "No se pudo cambiar el estado.");
  }
}

/** Pone una contraseña provisional nueva y obliga a cambiarla al entrar. */
export async function resetPasswordAction(email: string): Promise<AdminResult> {
  try {
    const user = await admin();
    if (email === user.email) return { ok: false, error: "Tu propia contraseña cámbiala desde tu perfil." };
    if (PROTECTED.has(email)) return { ok: false, error: "Ese buzón lo usa la web: cambiar su contraseña la dejaría sin enviar." };
    const password = provisionalPassword();
    await editMailbox(email, { password, forcePasswordUpdate: true });
    await closeConnections(email);
    return { ...done(), password };
  } catch (error) {
    return failure(error, "No se pudo restablecer la contraseña.");
  }
}

export async function updateMailboxAction(
  email: string,
  attr: { name?: string; quotaMb?: number; sendAs?: string[] },
): Promise<AdminResult> {
  try {
    await admin();
    const sendAs = attr.sendAs?.filter((a) => isValidEmail(a) && a.endsWith(`@${config.domain}`));
    await editMailbox(email, {
      ...(attr.name !== undefined ? { name: attr.name.trim() } : {}),
      ...(attr.quotaMb !== undefined ? { quotaMb: Math.min(20_480, Math.max(256, Math.round(attr.quotaMb))) } : {}),
      ...(sendAs !== undefined ? { sendAs } : {}),
    });
    return done();
  } catch (error) {
    return failure(error, "No se pudo guardar el buzón.");
  }
}

export async function deleteMailboxAction(email: string, confirmation: string): Promise<AdminResult> {
  try {
    const user = await admin();
    if (confirmation.trim().toLowerCase() !== email) return { ok: false, error: "Escribe la dirección exacta para confirmar." };
    if (email === user.email) return { ok: false, error: "No puedes borrar tu propio buzón." };
    if (PROTECTED.has(email)) return { ok: false, error: "Ese buzón lo usa la web para enviar: no se puede borrar." };
    await closeConnections(email);
    await deleteMailbox(email);
    return done();
  } catch (error) {
    return failure(error, "No se pudo borrar el buzón.");
  }
}

// --- Direcciones (alias) ---

export async function createAliasAction(localPart: string, goto: string[]): Promise<AdminResult> {
  try {
    await admin();
    const lp = localPart.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(lp)) {
      return { ok: false, error: "La dirección solo puede llevar letras, números, puntos, guiones y guiones bajos." };
    }
    const targets = goto.map((g) => g.trim().toLowerCase()).filter(Boolean);
    if (targets.length === 0) return { ok: false, error: "Elige al menos un buzón donde entregar." };
    const bad = targets.find((t) => !isValidEmail(t));
    if (bad) return { ok: false, error: `"${bad}" no es una dirección válida.` };
    await createAlias(`${lp}@${config.domain}`, targets);
    return done();
  } catch (error) {
    return failure(error, "No se pudo crear la dirección.");
  }
}

export async function updateAliasAction(id: number, attr: { active?: boolean; goto?: string[] }): Promise<AdminResult> {
  try {
    await admin();
    if (attr.goto) {
      const bad = attr.goto.find((t) => !isValidEmail(t));
      if (bad) return { ok: false, error: `"${bad}" no es una dirección válida.` };
      if (attr.goto.length === 0) return { ok: false, error: "Tiene que entregar en al menos un buzón." };
    }
    await editAlias(id, attr);
    return done();
  } catch (error) {
    return failure(error, "No se pudo guardar la dirección.");
  }
}

export async function deleteAliasAction(id: number): Promise<AdminResult> {
  try {
    await admin();
    await deleteAlias(id);
    return done();
  } catch (error) {
    return failure(error, "No se pudo borrar la dirección.");
  }
}
