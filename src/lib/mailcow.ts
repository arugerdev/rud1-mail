import "server-only";

import https from "node:https";
import http from "node:http";

import { config } from "@/lib/config";

/**
 * Cliente mínimo de la API de Mailcow.
 *
 * La API solo responde desde el propio servidor de correo (API_ALLOW_FROM), y
 * su clave da control total: nunca sale de aquí ni se usa con datos que no se
 * hayan comprobado antes.
 */

export class MailcowUnavailableError extends Error {
  constructor() {
    super("La API de Mailcow no está configurada");
    this.name = "MailcowUnavailableError";
  }
}

export function mailcowAvailable(): boolean {
  return Boolean(config.mailcow.url && config.mailcow.key);
}

function request<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const { url, key, insecureTls } = config.mailcow;
  if (!url || !key) return Promise.reject(new MailcowUnavailableError());
  const target = new URL(`${url.replace(/\/$/, "")}/${path}`);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const transport = target.protocol === "http:" ? http : https;

  return new Promise<T>((resolve, reject) => {
    const req = transport.request(
      target,
      {
        method,
        headers: {
          "X-API-Key": key,
          Accept: "application/json",
          ...(payload ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) } : {}),
        },
        ...(target.protocol === "https:" ? { rejectUnauthorized: !insecureTls, servername: config.mailcow.servername } : {}),
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if ((res.statusCode ?? 500) >= 400) {
            reject(new Error(`Mailcow respondió ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(text) as T);
          } catch {
            reject(new Error("Respuesta de Mailcow no válida"));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Mailcow no responde")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

interface MailcowResult {
  type: "success" | "danger" | "error" | "warning";
  msg: unknown;
}

/** Mailcow responde 200 incluso cuando algo falla: el resultado va dentro. */
function assertSuccess(results: MailcowResult[] | MailcowResult): void {
  const list = Array.isArray(results) ? results : [results];
  const failed = list.find((r) => r.type !== "success");
  if (failed) {
    const msg = Array.isArray(failed.msg) ? failed.msg.join(" ") : String(failed.msg);
    throw new MailcowError(msg);
  }
}

export class MailcowError extends Error {
  constructor(public readonly code: string) {
    super(`Mailcow: ${code}`);
    this.name = "MailcowError";
  }
}

/** Los buzones comunes llevan la etiqueta "comun" en Mailcow; el resto son personales. */
export const SHARED_TAG = "comun";

export interface MailboxInfo {
  username: string;
  name: string;
  /** No está desactivado (puede estar activo o con la entrada bloqueada). */
  active: boolean;
  /** Recibe correo pero no puede entrar en ningún sitio (Mailcow active = 2). */
  loginBlocked: boolean;
  /** Puede enviar (Mailcow smtp_access). */
  smtpAccess: boolean;
  forcePasswordUpdate: boolean;
  quotaBytes: number;
  usedBytes: number;
  messages: number;
  shared: boolean;
  /** Última entrada por IMAP (ms), si la hubo. */
  lastLogin: number | null;
  /** Direcciones en cuyo nombre puede enviar. */
  sendAs: string[];
}

interface RawMailbox {
  username?: string;
  name?: string;
  active?: number | string;
  active_int?: number | string;
  quota?: number;
  quota_used?: number;
  messages?: number;
  tags?: string[];
  last_imap_login?: number | string;
  sender_acl?: string[];
  attributes?: { force_pw_update?: string | number; smtp_access?: string | number };
}

function toMailbox(box: RawMailbox & { username: string }): MailboxInfo {
  const last = Number(box.last_imap_login ?? 0);
  return {
    username: box.username,
    name: box.name || box.username,
    active: String(box.active_int ?? box.active) !== "0",
    loginBlocked: String(box.active_int ?? box.active) === "2",
    smtpAccess: String(box.attributes?.smtp_access ?? "1") === "1",
    forcePasswordUpdate: String(box.attributes?.force_pw_update ?? "0") === "1",
    quotaBytes: Number(box.quota ?? 0),
    usedBytes: Number(box.quota_used ?? 0),
    messages: Number(box.messages ?? 0),
    shared: (box.tags ?? []).includes(SHARED_TAG),
    lastLogin: last > 0 ? last * 1000 : null,
    sendAs: Array.isArray(box.sender_acl) ? box.sender_acl : [],
  };
}

export async function getMailbox(email: string): Promise<MailboxInfo | null> {
  const raw = await request<RawMailbox | RawMailbox[] | Record<string, never>>(
    "GET",
    `get/mailbox/${encodeURIComponent(email)}`,
  );
  const box = Array.isArray(raw) ? raw[0] : raw;
  if (!box || !("username" in box) || !box.username) return null;
  return toMailbox(box as RawMailbox & { username: string });
}

export async function listMailboxes(domain: string): Promise<MailboxInfo[]> {
  const raw = await request<RawMailbox[] | Record<string, never>>("GET", `get/mailbox/all/${encodeURIComponent(domain)}`);
  const list = Array.isArray(raw) ? raw : [];
  const boxes = list.filter((b): b is RawMailbox & { username: string } => Boolean(b.username)).map(toMailbox);
  return boxes.sort((a, b) => Number(a.shared) - Number(b.shared) || a.username.localeCompare(b.username));
}

export interface NewMailbox {
  localPart: string;
  domain: string;
  name: string;
  quotaMb: number;
  password: string;
  shared: boolean;
}

export async function createMailbox(box: NewMailbox): Promise<void> {
  const results = await request<MailcowResult[]>("POST", "add/mailbox", {
    local_part: box.localPart,
    domain: box.domain,
    name: box.name,
    quota: String(box.quotaMb),
    password: box.password,
    password2: box.password,
    active: "1",
    // Los personales eligen su contraseña al entrar; los comunes no se usan para entrar.
    force_pw_update: box.shared ? "0" : "1",
    pop3_access: "0",
    imap_access: "1",
    smtp_access: "1",
    sieve_access: "1",
    tags: box.shared ? [SHARED_TAG] : [],
    authsource: "mailcow",
  });
  assertSuccess(results);
}

export async function editMailbox(
  email: string,
  attr: Partial<{
    active: boolean;
    /** 0 desactivado, 1 activo, 2 recibe pero no puede entrar. Gana a `active`. */
    activeState: 0 | 1 | 2;
    smtpAccess: boolean;
    name: string;
    quotaMb: number;
    password: string;
    forcePasswordUpdate: boolean;
    sendAs: string[];
  }>,
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (attr.active !== undefined) body.active = attr.active ? "1" : "0";
  if (attr.activeState !== undefined) body.active = String(attr.activeState);
  if (attr.smtpAccess !== undefined) body.smtp_access = attr.smtpAccess ? "1" : "0";
  if (attr.name !== undefined) body.name = attr.name;
  if (attr.quotaMb !== undefined) body.quota = String(attr.quotaMb);
  if (attr.password !== undefined) {
    body.password = attr.password;
    body.password2 = attr.password;
  }
  if (attr.forcePasswordUpdate !== undefined) body.force_pw_update = attr.forcePasswordUpdate ? "1" : "0";
  if (attr.sendAs !== undefined) body.sender_acl = attr.sendAs;
  assertSuccess(await request<MailcowResult[]>("POST", "edit/mailbox", { items: [email], attr: body }));
}

export async function deleteMailbox(email: string): Promise<void> {
  assertSuccess(await request<MailcowResult[]>("POST", "delete/mailbox", [email]));
}

export interface AliasInfo {
  id: number;
  address: string;
  goto: string[];
  active: boolean;
}

interface RawAlias {
  id?: number;
  address?: string;
  goto?: string;
  active?: number | string;
  active_int?: number | string;
  domain?: string;
}

export async function listAliases(domain: string): Promise<AliasInfo[]> {
  const raw = await request<RawAlias[] | Record<string, never>>("GET", "get/alias/all");
  const list = Array.isArray(raw) ? raw : [];
  return list
    .filter((a) => a.address && a.id && (a.domain === domain || a.address.endsWith(`@${domain}`)))
    .map((a) => ({
      id: Number(a.id),
      address: a.address!,
      goto: (a.goto ?? "").split(",").map((g) => g.trim()).filter(Boolean),
      active: String(a.active_int ?? a.active) === "1",
    }))
    .sort((a, b) => a.address.localeCompare(b.address));
}

export async function createAlias(address: string, goto: string[]): Promise<void> {
  assertSuccess(await request<MailcowResult[]>("POST", "add/alias", { address, goto: goto.join(","), active: "1" }));
}

export async function editAlias(id: number, attr: Partial<{ active: boolean; goto: string[] }>): Promise<void> {
  const body: Record<string, unknown> = {};
  if (attr.active !== undefined) body.active = attr.active ? "1" : "0";
  if (attr.goto !== undefined) body.goto = attr.goto.join(",");
  assertSuccess(await request<MailcowResult[]>("POST", "edit/alias", { items: [String(id)], attr: body }));
}

export async function deleteAlias(id: number): Promise<void> {
  assertSuccess(await request<MailcowResult[]>("POST", "delete/alias", [String(id)]));
}

/** Pone la contraseña del buzón y quita la marca de contraseña provisional. */
export async function setMailboxPassword(email: string, password: string): Promise<void> {
  const results = await request<MailcowResult[]>("POST", "edit/mailbox", {
    items: [email],
    attr: { password, password2: password, force_pw_update: "0" },
  });
  assertSuccess(results);
}

// --- Filtros Sieve (para "no recibe correo") ---

export interface SieveFilter {
  id: number;
  username: string;
  type: "prefilter" | "postfilter";
  description: string;
  active: boolean;
}

export async function listFilters(): Promise<SieveFilter[]> {
  const raw = await request<
    Array<{ id: number | string; username: string; filter_type: string; script_desc: string; active: number | string }> | Record<string, never>
  >("GET", "get/filters/all");
  if (!Array.isArray(raw)) return [];
  return raw.map((f) => ({
    id: Number(f.id),
    username: f.username,
    type: f.filter_type === "postfilter" ? "postfilter" : "prefilter",
    description: f.script_desc,
    active: String(f.active) === "1",
  }));
}

export async function addFilter(username: string, description: string, script: string, active: boolean): Promise<void> {
  assertSuccess(
    await request<MailcowResult[]>("POST", "add/filter", {
      username,
      filter_type: "prefilter",
      script_desc: description,
      script_data: script,
      active: active ? "1" : "0",
    }),
  );
}

export async function setFilterActive(id: number, active: boolean): Promise<void> {
  assertSuccess(await request<MailcowResult[]>("POST", "edit/filter", { items: [String(id)], attr: { active: active ? "1" : "0" } }));
}
