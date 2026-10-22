/**
 * Permisos de rud1 Mail (los comparten servidor y página).
 *
 * Cada persona tiene un rol (con sus permisos) y, si hace falta, excepciones
 * solo para ella. Quien figura en ADMIN_EMAILS (Álvaro y Manuel) es
 * propietario: tiene todo, siempre, y es el único que reparte permisos, roles
 * y equipos. Nadie puede darse a sí mismo más de lo que tiene.
 */

export const PERMISSIONS = [
  {
    key: "correo.entrar",
    label: "Entrar y ver su buzón",
    description: "En rud1 Mail y en cualquier app (móvil, Outlook…). Si no, el buzón sigue recibiendo pero nadie entra.",
    group: "Correo",
  },
  {
    key: "correo.enviar",
    label: "Enviar correo",
    description: "Desde rud1 Mail y desde cualquier app. Tarda hasta 5 minutos en aplicarse.",
    group: "Correo",
  },
  {
    key: "correo.recibir",
    label: "Recibir correo",
    description: "Si no, lo que llegue a su dirección se descarta.",
    group: "Correo",
  },
  {
    key: "correo.comunes",
    label: "Ver buzones comunes",
    description: "Los que tenga asignados (a él o a sus equipos). Sin esto, ninguno.",
    group: "Correo",
  },
  {
    key: "archivos.usar",
    label: "Archivos compartidos",
    description: "Subir, guardar y compartir archivos, con su espacio.",
    group: "Archivos",
  },
  {
    key: "admin.buzones",
    label: "Crear y gestionar buzones y direcciones",
    description: "Dar de alta personas y buzones, activarlos, cambiar contraseñas y crear direcciones.",
    group: "Administración",
  },
  {
    key: "admin.plantillas",
    label: "Editar la cabecera y el pie de rud1",
    description: "Las plantillas corporativas que llevan los correos de todo el equipo.",
    group: "Administración",
  },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];
export const PERMISSION_KEYS = PERMISSIONS.map((p) => p.key) as PermissionKey[];
export const PERMISSION_GROUPS = ["Correo", "Archivos", "Administración"] as const;

export type PermissionSet = Record<PermissionKey, boolean>;
/** Excepciones de una persona sobre su rol: true/false, o nada (lo del rol). */
export type PermissionOverrides = Partial<Record<PermissionKey, boolean>>;

export const ALL_PERMISSIONS: PermissionSet = Object.fromEntries(PERMISSION_KEYS.map((k) => [k, true])) as PermissionSet;

export interface Role {
  id: string;
  name: string;
  description: string;
  color: string;
  permissions: PermissionSet;
  /** Espacio para archivos de quien tiene este rol (MB). */
  storageMb: number;
  /** Los de serie no se pueden borrar (sí cambiar). */
  builtin: boolean;
}

export const DEFAULT_ROLE_ID = "equipo";

const only = (keys: PermissionKey[]): PermissionSet =>
  Object.fromEntries(PERMISSION_KEYS.map((k) => [k, keys.includes(k)])) as PermissionSet;

export const BUILTIN_ROLES: Role[] = [
  {
    id: "equipo",
    name: "Equipo",
    description: "Lo normal: su correo, los buzones comunes que tenga y archivos.",
    color: "#3d99f5",
    permissions: only(["correo.entrar", "correo.enviar", "correo.recibir", "correo.comunes", "archivos.usar"]),
    storageMb: 5120,
    builtin: true,
  },
  {
    id: "gestion",
    name: "Gestión",
    description: "Como Equipo, y además crea buzones y direcciones y edita la cabecera y el pie.",
    color: "#7c3aed",
    permissions: ALL_PERMISSIONS,
    storageMb: 10240,
    builtin: true,
  },
  {
    id: "limitado",
    name: "Limitado",
    description: "Lee y recibe, pero no envía ni tiene archivos. Para cuentas de prueba o de paso.",
    color: "#ea580c",
    permissions: only(["correo.entrar", "correo.recibir", "correo.comunes"]),
    storageMb: 0,
    builtin: true,
  },
];

export const ROLE_COLORS = ["#3d99f5", "#7c3aed", "#16a34a", "#ea580c", "#dc2626", "#0891b2", "#db2777", "#64748b"];

export function resolvePermissions(role: Role, overrides: PermissionOverrides): PermissionSet {
  const out = { ...role.permissions };
  for (const key of PERMISSION_KEYS) {
    if (typeof overrides[key] === "boolean") out[key] = overrides[key]!;
  }
  return out;
}
