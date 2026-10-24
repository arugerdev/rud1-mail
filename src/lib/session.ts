import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession, type SessionOptions } from "iron-session";

import { config } from "@/lib/config";
import { ENTRY_TTL_MS, mailboxEntryAvailable, onAccessHost } from "@/lib/mailbox-entry";
import { masterLogin } from "@/lib/shared-access";

/**
 * La sesión vive en una cookie cifrada (AES + firma) que solo entiende el
 * servidor. Lleva la contraseña del buzón porque IMAP y SMTP la piden en cada
 * conexión: nunca llega al navegador en claro ni se guarda en ningún otro sitio.
 */
export interface MailSession {
  email?: string;
  password?: string;
  /** Nombre para mostrar, del buzón en Mailcow. */
  name?: string;
  /** Contraseña provisional: hasta cambiarla no se entra a la bandeja. */
  mustChangePassword?: boolean;
  /** Momento de entrada (ms): la sesión caduca aunque la cookie siga viva. */
  signedInAt?: number;
  /**
   * Propietario que ha entrado en este buzón desde Administración
   * (lib/mailbox-entry.ts). Entonces no hay contraseña: se entra con el
   * usuario maestro, que solo conoce el servidor.
   */
  actingBy?: string;
}

export interface SignedInSession {
  email: string;
  password: string;
  /** Usuario de IMAP/SMTP cuando no es la propia dirección (el maestro, al entrar como otra persona). */
  login?: string;
  name: string;
  mustChangePassword: boolean;
  /** Si es un propietario dentro del buzón de otra persona, quién. */
  actingBy?: string;
}

/** 12 horas: una jornada larga sin tener que volver a entrar. */
const SESSION_TTL_SECONDS = 12 * 60 * 60;

function options(access: boolean): SessionOptions {
  const cookieOptions = { httpOnly: true, secure: config.secureCookies, sameSite: "lax" as const, path: "/" };
  if (access) {
    // En la dirección de acceso, cookie propia y sin fecha: el navegador la
    // borra al cerrarse. Además caduca a las dos horas (ENTRY_TTL_MS).
    return { password: config.sessionSecret, cookieName: "rud1mail_acceso", cookieOptions: { ...cookieOptions, maxAge: undefined } };
  }
  return { password: config.sessionSecret, cookieName: "rud1mail", ttl: SESSION_TTL_SECONDS, cookieOptions };
}

export async function getSession() {
  return getIronSession<MailSession>(await cookies(), options(await onAccessHost()));
}

/**
 * La sesión, si hay alguien dentro y no ha caducado. Se lee una vez por
 * petición: el mismo objeto sirve de clave a las consultas en caché.
 */
export const currentUser = cache(async (): Promise<SignedInSession | null> => {
  const session = await getSession();
  if (session.actingBy) return actingUser(session);
  // En la dirección de acceso solo valen las entradas desde Administración.
  if (await onAccessHost()) return null;
  if (!session.email || !session.password || !session.signedInAt) return null;
  if (Date.now() - session.signedInAt > SESSION_TTL_SECONDS * 1000) return null;
  // Si administración le ha quitado la entrada, la sesión deja de valer al momento.
  const { can } = await import("@/lib/access");
  if (!can(session.email, "correo.entrar")) return null;
  return {
    email: session.email,
    password: session.password,
    name: session.name ?? session.email,
    mustChangePassword: session.mustChangePassword === true,
  };
});

/** Un propietario dentro del buzón de otra persona: vale mientras siga siendo propietario. */
async function actingUser(session: MailSession): Promise<SignedInSession | null> {
  if (!session.email || !session.actingBy || !session.signedInAt) return null;
  if (!(await onAccessHost()) || !mailboxEntryAvailable()) return null;
  if (Date.now() - session.signedInAt > ENTRY_TTL_MS) return null;
  const { isOwner } = await import("@/lib/access");
  if (!isOwner(session.actingBy)) return null;
  const { login, password } = masterLogin(session.email);
  return {
    email: session.email,
    password,
    login,
    name: session.name ?? session.email,
    mustChangePassword: false,
    actingBy: session.actingBy,
  };
}

/**
 * Para las páginas y acciones de la bandeja: sin sesión, a la entrada; con la
 * contraseña provisional, a cambiarla.
 */
export async function requireUser(): Promise<SignedInSession> {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (user.mustChangePassword) redirect("/cambiar-contrasena");
  return user;
}
