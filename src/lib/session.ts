import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession, type SessionOptions } from "iron-session";

import { config } from "@/lib/config";

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
}

export interface SignedInSession {
  email: string;
  password: string;
  name: string;
  mustChangePassword: boolean;
}

/** 12 horas: una jornada larga sin tener que volver a entrar. */
const SESSION_TTL_SECONDS = 12 * 60 * 60;

function options(): SessionOptions {
  return {
    password: config.sessionSecret,
    cookieName: "rud1mail",
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<MailSession>(await cookies(), options());
}

/**
 * La sesión, si hay alguien dentro y no ha caducado. Se lee una vez por
 * petición: el mismo objeto sirve de clave a las consultas en caché.
 */
export const currentUser = cache(async (): Promise<SignedInSession | null> => {
  const session = await getSession();
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
