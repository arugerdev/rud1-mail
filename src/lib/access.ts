import "server-only";

import { config } from "@/lib/config";
import { db } from "@/lib/db";
import { closeConnections } from "@/lib/imap";
import {
  addFilter,
  editMailbox,
  listFilters,
  listMailboxes,
  mailcowAvailable,
  setFilterActive,
  type MailboxInfo,
} from "@/lib/mailcow";
import {
  ALL_PERMISSIONS,
  BUILTIN_ROLES,
  DEFAULT_ROLE_ID,
  PERMISSION_KEYS,
  resolvePermissions,
  type PermissionKey,
  type PermissionOverrides,
  type PermissionSet,
  type Role,
} from "@/lib/permissions";
import { getViewers, setViewers, sharedAccessAvailable } from "@/lib/shared-access";

/**
 * Quién puede qué en rud1 Mail: roles, excepciones por persona, equipos y
 * quién ve cada buzón común. Aquí se guarda lo que se quiere y `syncAccess`
 * lo lleva al servidor de correo, que es quien lo hace cumplir de verdad
 * (también desde el móvil u Outlook):
 *
 *  - Entrar → Mailcow active 1 (o 2: recibe, pero nadie entra).
 *  - Enviar → Mailcow smtp_access.
 *  - Recibir → un filtro Sieve que descarta lo que llega.
 *  - Buzones comunes → permisos IMAP (ACL) y "enviar como" (sender_acl).
 */

// --- Propietarios (ADMIN_EMAILS): todo, siempre ---

const OWNERS = (process.env.ADMIN_EMAILS ?? "aruger@rud1.es,mdialop@rud1.es")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isOwner(email: string): boolean {
  return OWNERS.includes(email.toLowerCase());
}

export function owners(): string[] {
  return [...OWNERS];
}

/** Buzones que usa el sistema (la web envía con noreply@): fuera de roles y permisos. */
export function isSystemMailbox(email: string): boolean {
  return email.toLowerCase() === `noreply@${config.domain}`;
}

// --- Roles ---

interface RoleRow {
  id: string;
  name: string;
  description: string;
  color: string;
  permissions: string;
  storage_mb: number;
  builtin: number;
}

function parsePermissions(raw: string, fallback: PermissionSet): PermissionSet {
  try {
    const saved = JSON.parse(raw) as Partial<PermissionSet>;
    return Object.fromEntries(PERMISSION_KEYS.map((k) => [k, typeof saved[k] === "boolean" ? saved[k] : fallback[k]])) as PermissionSet;
  } catch {
    return fallback;
  }
}

function ensureRoles(): void {
  const count = (db().prepare(`SELECT COUNT(*) AS n FROM roles`).get() as { n: number }).n;
  if (count > 0) return;
  const insert = db().prepare(
    `INSERT INTO roles (id, name, description, color, permissions, storage_mb, builtin, position) VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
  );
  BUILTIN_ROLES.forEach((r, i) => insert.run(r.id, r.name, r.description, r.color, JSON.stringify(r.permissions), r.storageMb, i));
}

export function listRoles(): Role[] {
  ensureRoles();
  const rows = db().prepare(`SELECT * FROM roles ORDER BY position, name`).all() as RoleRow[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    color: r.color,
    permissions: parsePermissions(r.permissions, BUILTIN_ROLES.find((b) => b.id === r.id)?.permissions ?? ALL_PERMISSIONS),
    storageMb: r.storage_mb,
    builtin: r.builtin === 1,
  }));
}

export function getRole(id: string): Role {
  const roles = listRoles();
  return roles.find((r) => r.id === id) ?? roles.find((r) => r.id === DEFAULT_ROLE_ID) ?? BUILTIN_ROLES[0];
}

export function saveRole(role: Omit<Role, "builtin">): void {
  ensureRoles();
  const existing = db().prepare(`SELECT builtin FROM roles WHERE id = ?`).get(role.id) as { builtin: number } | undefined;
  if (existing) {
    db()
      .prepare(`UPDATE roles SET name = ?, description = ?, color = ?, permissions = ?, storage_mb = ? WHERE id = ?`)
      .run(role.name, role.description, role.color, JSON.stringify(role.permissions), role.storageMb, role.id);
  } else {
    const position = (db().prepare(`SELECT COALESCE(MAX(position), 0) + 1 AS p FROM roles`).get() as { p: number }).p;
    db()
      .prepare(`INSERT INTO roles (id, name, description, color, permissions, storage_mb, builtin, position) VALUES (?, ?, ?, ?, ?, ?, 0, ?)`)
      .run(role.id, role.name, role.description, role.color, JSON.stringify(role.permissions), role.storageMb, position);
  }
}

/** Borra un rol propio; quien lo tenía pasa al de por defecto. */
export function deleteRole(id: string): void {
  const role = db().prepare(`SELECT builtin FROM roles WHERE id = ?`).get(id) as { builtin: number } | undefined;
  if (!role || role.builtin === 1) throw new Error("Los roles de serie no se pueden borrar.");
  db().transaction(() => {
    db().prepare(`UPDATE user_access SET role_id = ? WHERE role_id = ?`).run(DEFAULT_ROLE_ID, id);
    db().prepare(`DELETE FROM roles WHERE id = ?`).run(id);
  })();
}

// --- Permisos de cada persona ---

export interface UserAccess {
  email: string;
  roleId: string;
  overrides: PermissionOverrides;
  /** Espacio para archivos propio (MB); null = el de su rol. */
  storageMb: number | null;
}

export function getUserAccess(email: string): UserAccess {
  const row = db().prepare(`SELECT role_id, overrides, storage_mb FROM user_access WHERE email = ?`).get(email.toLowerCase()) as
    | { role_id: string; overrides: string; storage_mb: number | null }
    | undefined;
  if (!row) return { email, roleId: DEFAULT_ROLE_ID, overrides: {}, storageMb: null };
  let overrides: PermissionOverrides = {};
  try {
    const parsed = JSON.parse(row.overrides) as Record<string, unknown>;
    overrides = Object.fromEntries(
      Object.entries(parsed).filter(([k, v]) => (PERMISSION_KEYS as string[]).includes(k) && typeof v === "boolean"),
    ) as PermissionOverrides;
  } catch {
    // Excepciones ilegibles: las del rol.
  }
  return { email, roleId: row.role_id, overrides, storageMb: row.storage_mb };
}

export function setUserAccess(access: UserAccess): void {
  db()
    .prepare(
      `INSERT INTO user_access (email, role_id, overrides, storage_mb, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(email) DO UPDATE SET role_id = excluded.role_id, overrides = excluded.overrides,
         storage_mb = excluded.storage_mb, updated_at = excluded.updated_at`,
    )
    .run(access.email.toLowerCase(), access.roleId, JSON.stringify(access.overrides), access.storageMb, Date.now());
}

export function permissionsFor(email: string): PermissionSet {
  if (isOwner(email)) return ALL_PERMISSIONS;
  const access = getUserAccess(email);
  return resolvePermissions(getRole(access.roleId), access.overrides);
}

export function can(email: string, permission: PermissionKey): boolean {
  return permissionsFor(email)[permission];
}

/** Espacio para archivos de una persona, en bytes (0 si no puede usarlos). */
export function storageQuotaBytes(email: string): number {
  if (!can(email, "archivos.usar")) return 0;
  const access = getUserAccess(email);
  const mb = access.storageMb ?? getRole(access.roleId).storageMb;
  return (isOwner(email) ? Math.max(mb, 20_480) : mb) * 1024 * 1024;
}

// --- Equipos ---

export interface TeamGrant {
  owner: string;
  view: boolean;
  send: boolean;
}

export interface Team {
  id: number;
  name: string;
  description: string;
  color: string;
  members: string[];
  grants: TeamGrant[];
}

export function listTeams(): Team[] {
  const teams = db().prepare(`SELECT id, name, description, color FROM teams ORDER BY name`).all() as Omit<Team, "members" | "grants">[];
  const members = db().prepare(`SELECT team_id, email FROM team_members ORDER BY email`).all() as { team_id: number; email: string }[];
  const grants = db()
    .prepare(`SELECT owner, subject, can_view, can_send FROM shared_grants WHERE subject LIKE 'team:%'`)
    .all() as { owner: string; subject: string; can_view: number; can_send: number }[];
  return teams.map((t) => ({
    ...t,
    members: members.filter((m) => m.team_id === t.id).map((m) => m.email),
    grants: grants
      .filter((g) => g.subject === `team:${t.id}`)
      .map((g) => ({ owner: g.owner, view: g.can_view === 1, send: g.can_send === 1 })),
  }));
}

export function teamsOf(email: string): Team[] {
  return listTeams().filter((t) => t.members.includes(email.toLowerCase()));
}

export function saveTeam(team: Omit<Team, "id"> & { id: number | null }): number {
  const database = db();
  return database.transaction(() => {
    let id = team.id;
    if (id === null) {
      id = Number(database.prepare(`INSERT INTO teams (name, description, color) VALUES (?, ?, ?)`).run(team.name, team.description, team.color).lastInsertRowid);
    } else {
      database.prepare(`UPDATE teams SET name = ?, description = ?, color = ? WHERE id = ?`).run(team.name, team.description, team.color, id);
    }
    database.prepare(`DELETE FROM team_members WHERE team_id = ?`).run(id);
    const addMember = database.prepare(`INSERT INTO team_members (team_id, email) VALUES (?, ?)`);
    for (const email of new Set(team.members.map((m) => m.toLowerCase()))) addMember.run(id, email);
    database.prepare(`DELETE FROM shared_grants WHERE subject = ?`).run(`team:${id}`);
    const addGrant = database.prepare(`INSERT INTO shared_grants (owner, subject, can_view, can_send) VALUES (?, ?, ?, ?)`);
    for (const g of team.grants) {
      if (g.view || g.send) addGrant.run(g.owner, `team:${id}`, g.view || g.send ? 1 : 0, g.send ? 1 : 0);
    }
    return id;
  })();
}

export function deleteTeam(id: number): void {
  db().transaction(() => {
    db().prepare(`DELETE FROM shared_grants WHERE subject = ?`).run(`team:${id}`);
    db().prepare(`DELETE FROM teams WHERE id = ?`).run(id);
  })();
}

// --- Buzones comunes: permisos directos ---

export interface PersonGrant {
  email: string;
  view: boolean;
  send: boolean;
}

export function directGrants(owner: string): PersonGrant[] {
  const rows = db()
    .prepare(`SELECT subject, can_view, can_send FROM shared_grants WHERE owner = ? AND subject LIKE 'user:%'`)
    .all(owner) as { subject: string; can_view: number; can_send: number }[];
  return rows.map((r) => ({ email: r.subject.slice(5), view: r.can_view === 1, send: r.can_send === 1 }));
}

export function setDirectGrants(owner: string, grants: PersonGrant[]): void {
  const database = db();
  database.transaction(() => {
    database.prepare(`DELETE FROM shared_grants WHERE owner = ? AND subject LIKE 'user:%'`).run(owner);
    const add = database.prepare(`INSERT INTO shared_grants (owner, subject, can_view, can_send) VALUES (?, ?, ?, ?)`);
    for (const g of grants) {
      // Enviar como un buzón sin verlo no tiene sentido: enviar incluye ver.
      if (g.view || g.send) add.run(owner, `user:${g.email.toLowerCase()}`, 1, g.send ? 1 : 0);
    }
  })();
}

/** Lo que de verdad tiene cada persona en cada buzón común (directo + equipos, si puede ver comunes). */
export function effectiveShared(people: string[], sharedOwners: string[]): Map<string, { viewers: Set<string>; senders: Set<string> }> {
  const teams = listTeams();
  const result = new Map(sharedOwners.map((o) => [o, { viewers: new Set<string>(), senders: new Set<string>() }]));
  const allowed = new Set(people.filter((p) => can(p, "correo.comunes")));
  const canSend = new Set(people.filter((p) => can(p, "correo.enviar")));
  for (const owner of sharedOwners) {
    const entry = result.get(owner)!;
    const add = (email: string, send: boolean) => {
      if (!allowed.has(email)) return;
      entry.viewers.add(email);
      if (send && canSend.has(email)) entry.senders.add(email);
    };
    for (const g of directGrants(owner)) add(g.email, g.send);
    for (const team of teams) {
      const grant = team.grants.find((g) => g.owner === owner);
      if (grant) for (const m of team.members) add(m, grant.send);
    }
  }
  return result;
}

// --- Primera vez: lo que ya había en el servidor pasa a ser el permiso directo ---

const IMPORTED_KEY = "access_imported_v1";

async function importExisting(boxes: MailboxInfo[]): Promise<void> {
  const done = db().prepare(`SELECT 1 FROM org_settings WHERE key = ?`).get(IMPORTED_KEY);
  if (done) return;
  const people = boxes.filter((b) => !b.shared);
  for (const shared of boxes.filter((b) => b.shared && !b.username.startsWith("noreply@"))) {
    const viewers = await getViewers(shared.username).catch(() => [] as string[]);
    const grants = new Map<string, PersonGrant>();
    for (const v of viewers) grants.set(v, { email: v, view: true, send: false });
    for (const p of people) {
      if (p.sendAs.includes(shared.username)) grants.set(p.username, { email: p.username, view: true, send: true });
    }
    setDirectGrants(shared.username, [...grants.values()]);
  }
  db()
    .prepare(`INSERT INTO org_settings (key, value, updated_at, updated_by) VALUES (?, '1', ?, 'rud1-mail')`)
    .run(IMPORTED_KEY, Date.now());
}

/** Asegura que los permisos guardados existen (la primera vez, a partir del servidor). */
export async function ensureAccessImported(): Promise<void> {
  if (!mailcowAvailable() || !sharedAccessAvailable()) return;
  await importExisting(await listMailboxes(config.domain));
}

// --- Llevarlo al servidor de correo ---

const NO_RECEIVE_FILTER = "rud1: no recibe correo";
const NO_RECEIVE_SCRIPT = `# rud1 Mail: este buzón no recibe correo (Ajustes → Administración → Usuarios).
discard;
stop;`;

/**
 * Aplica en Mailcow y Dovecot lo que dicen los permisos, solo donde no
 * coincide. Devuelve las personas cuyo acceso a buzones comunes ha cambiado
 * (se les renueva la conexión para que lo vean al momento).
 */
export async function syncAccess(): Promise<{ changed: string[] }> {
  if (!mailcowAvailable()) return { changed: [] };
  const boxes = await listMailboxes(config.domain);
  await importExisting(boxes);
  // noreply@ lo usa la web para enviar: nunca se le tocan los permisos.
  const people = boxes.filter((b) => !b.shared && !isSystemMailbox(b.username));
  const sharedBoxes = boxes.filter((b) => b.shared && !b.username.startsWith("noreply@"));
  const sharedOwners = sharedBoxes.map((b) => b.username);
  const changed = new Set<string>();

  // 1. Entrar, enviar y recibir (cada persona).
  const filters = await listFilters().catch(() => []);
  for (const person of people) {
    const perms = permissionsFor(person.username);
    // Un buzón desactivado sigue desactivado: eso es su estado, no un permiso.
    if (person.active) {
      const wantState: 1 | 2 = perms["correo.entrar"] ? 1 : 2;
      const hasState = person.loginBlocked ? 2 : 1;
      if (wantState !== hasState) {
        await editMailbox(person.username, { activeState: wantState });
        if (wantState === 2) await closeConnections(person.username);
      }
    }
    if (person.smtpAccess !== perms["correo.enviar"]) {
      await editMailbox(person.username, { smtpAccess: perms["correo.enviar"] });
    }
    const filter = filters.find((f) => f.username === person.username && f.description === NO_RECEIVE_FILTER);
    const blockReceive = !perms["correo.recibir"];
    if (filter && filter.active !== blockReceive) {
      await setFilterActive(filter.id, blockReceive);
    } else if (!filter && blockReceive) {
      await addFilter(person.username, NO_RECEIVE_FILTER, NO_RECEIVE_SCRIPT, true);
    }
  }

  // 2. Buzones comunes: quién los ve (ACL) y quién envía como ellos (sender_acl).
  const wanted = effectiveShared(
    people.map((p) => p.username),
    sharedOwners,
  );
  if (sharedAccessAvailable()) {
    for (const owner of sharedOwners) {
      const want = wanted.get(owner)!.viewers;
      const have = new Set(await getViewers(owner).catch(() => [] as string[]));
      const differs = want.size !== have.size || [...want].some((e) => !have.has(e));
      if (!differs) continue;
      await setViewers(owner, [...want]);
      for (const e of new Set([...want, ...have])) if (want.has(e) !== have.has(e)) changed.add(e);
    }
  }
  const sharedSet = new Set(sharedOwners);
  for (const person of people) {
    // Se respetan las entradas que no son buzones comunes (otras direcciones permitidas).
    const keep = person.sendAs.filter((a) => !sharedSet.has(a));
    const want = sharedOwners.filter((o) => wanted.get(o)!.senders.has(person.username));
    const next = [...keep, ...want];
    const current = new Set(person.sendAs);
    if (next.length !== current.size || next.some((a) => !current.has(a))) {
      await editMailbox(person.username, { sendAs: next });
    }
  }

  await Promise.all([...changed].map((e) => closeConnections(e)));
  return { changed: [...changed] };
}
