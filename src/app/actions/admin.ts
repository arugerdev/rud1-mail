"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";

import {
  can,
  deleteRole,
  deleteTeam,
  isOwner,
  isSystemMailbox,
  listRoles,
  saveRole,
  saveTeam,
  setDirectGrants,
  setUserAccess,
  syncAccess,
  type PersonGrant,
  type TeamGrant,
} from "@/lib/access";
import { AgendaApiError, checkAdminAccount, setAgendaLink } from "@/lib/agenda";
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
  getMailbox,
  listMailboxes,
  MailcowError,
} from "@/lib/mailcow";
import { createEntryLink, mailboxEntryAvailable } from "@/lib/mailbox-entry";
import { PERMISSION_KEYS, ROLE_COLORS, type PermissionKey, type PermissionOverrides, type PermissionSet } from "@/lib/permissions";
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

class ForbiddenError extends Error {}

/** Para las acciones: sin el permiso, error (no redirección). */
async function allowed(permission: PermissionKey) {
  const user = await requireUser();
  if (!can(user.email, permission)) throw new ForbiddenError("No tienes permiso para hacer esto.");
  return user;
}

/** Los buzones de los propietarios solo los tocan ellos (si no, quien gestiona buzones podría quedarse con su cuenta). */
function guardTarget(user: { email: string }, email: string): void {
  if (isOwner(email) && !isOwner(user.email)) throw new ForbiddenError("Ese buzón solo lo pueden cambiar Álvaro o Manuel.");
}

/** Roles, permisos y buzones comunes: solo los propietarios (Álvaro y Manuel). */
async function owner() {
  const user = await requireUser();
  if (!isOwner(user.email)) throw new ForbiddenError("Solo Álvaro o Manuel pueden cambiar permisos.");
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
  if (error instanceof ForbiddenError) return { ok: false, error: error.message };
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
    const user = await allowed("admin.plantillas");
    saveOrgTemplates(templates, user.email);
    return done();
  } catch (error) {
    return failure(error, "No se pudo guardar.");
  }
}

/** Cómo queda un bloque con los datos de una persona del equipo. */
export async function previewTemplateAction(html: string, forEmail: string): Promise<string> {
  const user = await allowed("admin.plantillas");
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
    await allowed("admin.buzones");
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
    const user = await allowed("admin.buzones");
    guardTarget(user, email);
    if (PROTECTED.has(email)) return { ok: false, error: "Ese buzón lo usa la web para enviar: no se puede desactivar." };
    if (email === user.email && !active) return { ok: false, error: "No puedes desactivar tu propio buzón." };
    await editMailbox(email, { active });
    if (!active) await closeConnections(email);
    // Al activarlo, que vuelva con sus permisos (p. ej. sin entrada si no la tiene).
    else await syncAccess().catch((error) => console.error("[permisos] al activar", error));
    return done();
  } catch (error) {
    return failure(error, "No se pudo cambiar el estado.");
  }
}

/** Pone una contraseña provisional nueva y obliga a cambiarla al entrar. */
export async function resetPasswordAction(email: string): Promise<AdminResult> {
  try {
    const user = await allowed("admin.buzones");
    guardTarget(user, email);
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
  // "Enviar como" se reparte en Buzones comunes (solo los propietarios), no aquí.
  attr: { name?: string; quotaMb?: number },
): Promise<AdminResult> {
  try {
    const user = await allowed("admin.buzones");
    guardTarget(user, email);
    await editMailbox(email, {
      ...(attr.name !== undefined ? { name: attr.name.trim() } : {}),
      ...(attr.quotaMb !== undefined ? { quotaMb: Math.min(20_480, Math.max(256, Math.round(attr.quotaMb))) } : {}),
    });
    return done();
  } catch (error) {
    return failure(error, "No se pudo guardar el buzón.");
  }
}

export async function deleteMailboxAction(email: string, confirmation: string): Promise<AdminResult> {
  try {
    const user = await allowed("admin.buzones");
    guardTarget(user, email);
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
    await allowed("admin.buzones");
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
    await allowed("admin.buzones");
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
    await allowed("admin.buzones");
    await deleteAlias(id);
    return done();
  } catch (error) {
    return failure(error, "No se pudo borrar la dirección.");
  }
}

// --- Permisos: se guardan y se llevan al servidor de correo ---

/** Aplica los permisos en el servidor; si falla, lo guardado sigue y se reintenta en el siguiente cambio. */
async function applyAccess(): Promise<AdminResult> {
  try {
    await syncAccess();
    return done();
  } catch (error) {
    console.error("[permisos] no se pudieron aplicar en el servidor", error);
    return { ok: false, error: "Guardado, pero el servidor de correo no ha respondido: se aplicará en el próximo cambio." };
  }
}

async function personalMailboxes(): Promise<Set<string>> {
  const boxes = await listMailboxes(config.domain);
  return new Set(boxes.filter((b) => !b.shared && !isSystemMailbox(b.username)).map((b) => b.username));
}

// --- Buzones comunes: quién los ve y quién envía como ellos ---

export async function saveSharedAccessAction(ownerEmail: string, grants: PersonGrant[]): Promise<AdminResult> {
  try {
    await owner();
    const boxes = await listMailboxes(config.domain);
    if (!boxes.some((b) => b.username === ownerEmail && b.shared)) return { ok: false, error: "Ese buzón no es un buzón común." };
    const people = await personalMailboxes();
    setDirectGrants(
      ownerEmail,
      grants.filter((g) => people.has(g.email.toLowerCase())).map((g) => ({ email: g.email.toLowerCase(), view: g.view, send: g.send })),
    );
  } catch (error) {
    return failure(error, "No se pudieron guardar los permisos.");
  }
  return applyAccess();
}

// --- Rol y permisos de una persona ---

export async function saveUserAccessAction(
  email: string,
  input: { roleId: string; overrides: PermissionOverrides; storageMb: number | null },
): Promise<AdminResult> {
  try {
    const user = await owner();
    const target = email.toLowerCase();
    if (isOwner(target)) return { ok: false, error: "Álvaro y Manuel tienen siempre todos los permisos." };
    if (target === user.email) return { ok: false, error: "No puedes cambiar tus propios permisos." };
    if (!(await personalMailboxes()).has(target)) return { ok: false, error: "Esa persona no existe." };
    if (!listRoles().some((r) => r.id === input.roleId)) return { ok: false, error: "Ese rol no existe." };
    const overrides = Object.fromEntries(
      Object.entries(input.overrides).filter(([k, v]) => (PERMISSION_KEYS as string[]).includes(k) && typeof v === "boolean"),
    ) as PermissionOverrides;
    const storageMb = input.storageMb === null ? null : Math.min(1_048_576, Math.max(0, Math.round(input.storageMb)));
    setUserAccess({ email: target, roleId: input.roleId, overrides, storageMb });
  } catch (error) {
    return failure(error, "No se pudieron guardar los permisos.");
  }
  return applyAccess();
}

// --- Roles ---

function slug(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "rol"
  );
}

export async function saveRoleAction(input: {
  id: string | null;
  name: string;
  description: string;
  color: string;
  permissions: PermissionSet;
  storageMb: number;
}): Promise<AdminResult & { id?: string }> {
  let id = input.id;
  try {
    await owner();
    const name = input.name.trim().slice(0, 60);
    if (!name) return { ok: false, error: "Ponle un nombre al rol." };
    const roles = listRoles();
    if (id === null) {
      const base = slug(name);
      id = base;
      while (roles.some((r) => r.id === id)) id = `${base}-${randomInt(100, 999)}`;
    } else if (!roles.some((r) => r.id === id)) {
      return { ok: false, error: "Ese rol no existe." };
    }
    const permissions = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, input.permissions[k] === true])) as PermissionSet;
    saveRole({
      id,
      name,
      description: input.description.trim().slice(0, 200),
      color: ROLE_COLORS.includes(input.color) ? input.color : ROLE_COLORS[0],
      permissions,
      storageMb: Math.min(1_048_576, Math.max(0, Math.round(input.storageMb || 0))),
    });
  } catch (error) {
    return failure(error, "No se pudo guardar el rol.");
  }
  return { ...(await applyAccess()), id };
}

export async function deleteRoleAction(id: string): Promise<AdminResult> {
  try {
    await owner();
    deleteRole(id);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Los roles de serie")) return { ok: false, error: error.message };
    return failure(error, "No se pudo borrar el rol.");
  }
  return applyAccess();
}

// --- Equipos ---

export async function saveTeamAction(input: {
  id: number | null;
  name: string;
  description: string;
  color: string;
  members: string[];
  grants: TeamGrant[];
}): Promise<AdminResult> {
  try {
    await owner();
    const name = input.name.trim().slice(0, 60);
    if (!name) return { ok: false, error: "Ponle un nombre al equipo." };
    const boxes = await listMailboxes(config.domain);
    const people = new Set(boxes.filter((b) => !b.shared && !isSystemMailbox(b.username)).map((b) => b.username));
    const shared = new Set(boxes.filter((b) => b.shared).map((b) => b.username));
    saveTeam({
      id: input.id,
      name,
      description: input.description.trim().slice(0, 200),
      color: ROLE_COLORS.includes(input.color) ? input.color : ROLE_COLORS[0],
      members: input.members.map((m) => m.toLowerCase()).filter((m) => people.has(m)),
      grants: input.grants.filter((g) => shared.has(g.owner)).map((g) => ({ owner: g.owner, view: g.view || g.send, send: g.send })),
    });
  } catch (error) {
    return failure(error, "No se pudo guardar el equipo.");
  }
  return applyAccess();
}

export async function deleteTeamAction(id: number): Promise<AdminResult> {
  try {
    await owner();
    deleteTeam(id);
  } catch (error) {
    return failure(error, "No se pudo borrar el equipo.");
  }
  return applyAccess();
}

/** Vuelve a aplicar todos los permisos en el servidor (por si algo se cambió por fuera). */
export async function resyncAccessAction(): Promise<AdminResult> {
  try {
    await owner();
  } catch (error) {
    return failure(error, "No se pudo.");
  }
  return applyAccess();
}

// --- Agenda: qué cuenta de admin.rud1.es es cada buzón ---

/**
 * Enlaza un buzón con su cuenta de admin.rud1.es (cuando no es la misma
 * dirección). Solo los propietarios: si no, cualquiera podría usar la agenda
 * de otro. Antes de guardar se comprueba que la cuenta existe y está activa.
 */
export async function setAgendaLinkAction(email: string, adminEmail: string | null): Promise<AdminResult & { name?: string }> {
  try {
    const user = await owner();
    const target = email.toLowerCase();
    if (!(await personalMailboxes()).has(target)) return { ok: false, error: "Esa persona no existe." };
    const clean = adminEmail?.trim().toLowerCase() || null;
    if (!clean) {
      setAgendaLink(target, null, user.email);
      return done();
    }
    if (!isValidEmail(clean)) return { ok: false, error: "Esa dirección no es válida." };
    const me = await checkAdminAccount(clean);
    setAgendaLink(target, clean, user.email);
    return { ...done(), name: me.name ?? clean };
  } catch (error) {
    if (error instanceof AgendaApiError) {
      if (error.code === "no_admin") return { ok: false, error: "No hay ninguna cuenta activa en admin.rud1.es con ese correo." };
      return { ok: false, error: error.message };
    }
    return failure(error, "No se pudo enlazar la cuenta.");
  }
}

// --- Entrar en el buzón de otra persona (lib/mailbox-entry.ts) ---

/**
 * Enlace de un solo uso para abrir el buzón `email` en una pestaña nueva, sin
 * su contraseña. Solo los propietarios, y nunca en el buzón del otro
 * propietario (ni en el propio).
 */
export async function enterMailboxAction(email: string): Promise<AdminResult & { url?: string }> {
  try {
    const user = await owner();
    if (!mailboxEntryAvailable()) return { ok: false, error: "La entrada en otros buzones no está configurada." };
    const target = email.toLowerCase();
    if (target === user.email) return { ok: false, error: "Ese es tu propio buzón." };
    if (isOwner(target)) return { ok: false, error: "En el buzón de otro propietario no se puede entrar." };
    const box = await getMailbox(target);
    if (!box) return { ok: false, error: "Ese buzón no existe." };
    if (!box.active) return { ok: false, error: "El buzón está desactivado: actívalo antes de entrar." };
    console.info(`[acceso] ${user.email} pide entrar en el buzón de ${target}`);
    return { ok: true, url: createEntryLink(target, user.email) };
  } catch (error) {
    return failure(error, "No se pudo preparar la entrada.");
  }
}
