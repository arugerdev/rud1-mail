import "server-only";

import { db } from "@/lib/db";
import { sanitizeAuthoredHtml } from "@/lib/mail/authoring";
import { escapeHtml } from "@/lib/mail/text";
import { fullName, type Profile } from "@/lib/profiles";

/**
 * Cabecera y pie corporativos: los define administración (Álvaro y Manuel) y
 * se añaden a los correos de todo el equipo, con los datos de cada persona.
 */

export interface TemplateBlock {
  enabled: boolean;
  html: string;
}

export interface OrgTemplates {
  header: TemplateBlock;
  footer: TemplateBlock;
  /** También en respuestas y reenvíos (si no, solo en mensajes nuevos). */
  inReplies: boolean;
}

/** Imágenes de marca servidas por rud1 Mail; al enviar van dentro del correo (lib/mail/inline-images.ts). */
export const BRAND_ASSETS = "https://mail.rud1.es/marca";

const FONT = "-apple-system,'Segoe UI',Inter,Arial,sans-serif";

/** Firma de marca (brand/05-aplicaciones/firma-email/firma.html) con los datos de cada persona. */
export const DEFAULT_FOOTER = `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:${FONT};color:#161e31">
<tr>
<td style="padding-right:18px;border-right:1px solid #dcdfe5;vertical-align:middle"><img src="${BRAND_ASSETS}/rud1-firma.png" alt="rud1" width="84" height="120" style="display:block;width:84px;height:120px"></td>
<td style="padding-left:18px;vertical-align:middle">
<div style="font-size:16px;font-weight:700">{{nombre_completo}}</div>
<div style="font-size:13px;color:#6b7a90;padding-top:2px">{{puesto_empresa}}</div>
<div style="font-size:13px;padding-top:10px"><a href="mailto:{{correo}}" style="color:#3d99f5;text-decoration:none">{{correo}}</a></div>
<div style="font-size:12px;color:#6b7a90;padding-top:2px">{{telefono}}</div>
<div style="font-size:12px;color:#8b97ab;padding-top:2px"><a href="https://www.rud1.es" style="color:#8b97ab;text-decoration:none">rud1.es</a> · {{ubicacion}}</div>
</td>
</tr>
</table>`;

/** Cabecera como la hoja de carta (brand/05-aplicaciones/papeleria): logo y una línea fina. */
export const DEFAULT_HEADER = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-family:${FONT};border-bottom:1px solid #e5e7eb">
<tr>
<td style="padding:0 0 12px;vertical-align:bottom"><img src="${BRAND_ASSETS}/rud1-cabecera.png" alt="rud1" width="87" height="32" style="display:block;width:87px;height:32px"></td>
<td align="right" style="padding:0 0 14px;vertical-align:bottom;font-size:12px;color:#8b97ab">Acceso remoto industrial</td>
</tr>
</table>`;

export const DEFAULT_TEMPLATES: OrgTemplates = {
  header: { enabled: false, html: DEFAULT_HEADER },
  footer: { enabled: true, html: DEFAULT_FOOTER },
  inReplies: true,
};

/** Variables que se pueden usar en la cabecera, el pie y las firmas. */
export const TEMPLATE_VARIABLES: { key: string; label: string; example: string }[] = [
  { key: "nombre", label: "Nombre", example: "Álvaro" },
  { key: "apellidos", label: "Apellidos", example: "Rüger Chambra" },
  { key: "nombre_completo", label: "Nombre y apellidos", example: "Álvaro Rüger Chambra" },
  { key: "correo", label: "Dirección de correo", example: "aruger@rud1.es" },
  { key: "puesto", label: "Puesto", example: "Director técnico" },
  { key: "puesto_empresa", label: "Puesto · rud1", example: "Director técnico · rud1" },
  { key: "departamento", label: "Departamento", example: "Ingeniería" },
  { key: "telefono", label: "Teléfono", example: "+34 600 000 000" },
  { key: "empresa", label: "Empresa", example: "rud1" },
  { key: "web", label: "Web", example: "www.rud1.es" },
  { key: "ubicacion", label: "Ubicación", example: "Écija, Sevilla" },
  { key: "fecha", label: "Fecha de hoy", example: "22 de octubre de 2026" },
];

const KEY = "templates";

export function getOrgTemplates(): OrgTemplates {
  const row = db().prepare(`SELECT value FROM org_settings WHERE key = ?`).get(KEY) as { value: string } | undefined;
  if (!row) return DEFAULT_TEMPLATES;
  try {
    const saved = JSON.parse(row.value) as Partial<OrgTemplates>;
    return {
      header: { ...DEFAULT_TEMPLATES.header, ...saved.header },
      footer: { ...DEFAULT_TEMPLATES.footer, ...saved.footer },
      inReplies: saved.inReplies ?? DEFAULT_TEMPLATES.inReplies,
    };
  } catch {
    return DEFAULT_TEMPLATES;
  }
}

export function saveOrgTemplates(templates: OrgTemplates, by: string): void {
  const clean: OrgTemplates = {
    header: { enabled: templates.header.enabled, html: sanitizeAuthoredHtml(templates.header.html) },
    footer: { enabled: templates.footer.enabled, html: sanitizeAuthoredHtml(templates.footer.html) },
    inReplies: templates.inReplies,
  };
  db()
    .prepare(
      `INSERT INTO org_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
    )
    .run(KEY, JSON.stringify(clean), Date.now(), by);
}

export function variablesFor(profile: Profile): Record<string, string> {
  return {
    nombre: profile.firstName,
    apellidos: profile.lastName,
    nombre_completo: fullName(profile),
    correo: profile.email,
    puesto: profile.position,
    puesto_empresa: profile.position ? `${profile.position} · rud1` : "rud1",
    departamento: profile.department,
    telefono: profile.phone,
    empresa: "rud1",
    web: "www.rud1.es",
    ubicacion: "Écija, Sevilla",
    fecha: new Intl.DateTimeFormat("es-ES", { dateStyle: "long", timeZone: "Europe/Madrid" }).format(new Date()),
  };
}

/**
 * Sustituye las {{variables}}. Los valores se escapan (son datos de la
 * persona, no HTML) y las líneas que solo tenían una variable vacía
 * desaparecen, para no dejar huecos en la firma.
 */
export function renderTemplate(html: string, vars: Record<string, string>): string {
  const filled = html.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_m, key: string) => escapeHtml(vars[key] ?? ""));
  return filled
    .replace(/(<br\s*\/?>\s*){2,}/gi, "<br>")
    .replace(/<td([^>]*)>\s*<br\s*\/?>/gi, "<td$1>")
    .replace(/<br\s*\/?>\s*<\/td>/gi, "</td>")
    .replace(/<p[^>]*>\s*<\/p>/gi, "")
    .replace(/<div[^>]*>\s*<\/div>/gi, "");
}
