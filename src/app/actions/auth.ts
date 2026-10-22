"use server";

import { redirect } from "next/navigation";

import { config } from "@/lib/config";
import { closeConnections, ImapAuthError, verifyCredentials } from "@/lib/imap";
import { getMailbox, MailcowError, mailcowAvailable, setMailboxPassword } from "@/lib/mailcow";
import { blockedMinutes, registerFailure, registerSuccess } from "@/lib/rate-limit";
import { clientIp } from "@/lib/request";
import { currentUser, getSession } from "@/lib/session";

export interface FormState {
  error?: string;
  /** La dirección escrita, para no tener que repetirla tras un error. */
  email?: string;
}

const GENERIC_LOGIN_ERROR = "La dirección o la contraseña no son correctas.";

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Escribe tu dirección y tu contraseña.", email };
  if (!email.endsWith(`@${config.domain}`)) {
    return { error: `Solo se puede entrar con una dirección @${config.domain}.`, email };
  }

  const ip = await clientIp();
  const keys = [`email:${email}`, ...(ip ? [`ip:${ip}`] : [])];
  const wait = blockedMinutes(keys);
  if (wait > 0) {
    return { error: `Demasiados intentos fallidos. Vuelve a probar dentro de ${wait} min.`, email };
  }

  try {
    await verifyCredentials({ email, password }, ip);
  } catch (error) {
    if (error instanceof ImapAuthError) {
      registerFailure(keys);
      return { error: GENERIC_LOGIN_ERROR, email };
    }
    console.error("[entrar] el servidor de correo no responde", error);
    return { error: "El servidor de correo no responde. Inténtalo en unos minutos.", email };
  }
  registerSuccess(keys);

  // Nombre y estado del buzón: sin la API se entra igual, con la dirección
  // como nombre (solo pasa en desarrollo sin túnel).
  let name = email;
  let mustChangePassword = false;
  if (mailcowAvailable()) {
    try {
      const box = await getMailbox(email);
      if (box) {
        name = box.name;
        mustChangePassword = box.forcePasswordUpdate;
      }
    } catch (error) {
      console.error("[entrar] no se pudo leer el buzón en Mailcow", error);
    }
  }

  const session = await getSession();
  session.email = email;
  session.password = password;
  session.name = name;
  session.mustChangePassword = mustChangePassword;
  session.signedInAt = Date.now();
  await session.save();

  redirect(mustChangePassword ? "/cambiar-contrasena" : "/");
}

export async function signOut(): Promise<void> {
  const session = await getSession();
  if (session.email) await closeConnections(session.email);
  session.destroy();
  redirect("/entrar");
}

const MIN_PASSWORD = 12;

function passwordProblem(password: string, email: string): string | null {
  if (password.length < MIN_PASSWORD) return `Debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (!/[a-zA-Z]/.test(password) || !/\d/.test(password)) return "Debe combinar letras y números.";
  if (password.toLowerCase().includes(email.split("@")[0])) return "No puede contener tu nombre de usuario.";
  return null;
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await currentUser();
  if (!user) redirect("/entrar");

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!current || !next) return { error: "Rellena todos los campos." };
  if (next !== confirm) return { error: "Las dos contraseñas nuevas no coinciden." };
  if (next === current) return { error: "La contraseña nueva tiene que ser distinta de la actual." };
  const problem = passwordProblem(next, user.email);
  if (problem) return { error: problem };
  if (!mailcowAvailable()) return { error: "El cambio de contraseña no está disponible ahora mismo." };

  const ip = await clientIp();
  const keys = [`email:${user.email}`, ...(ip ? [`ip:${ip}`] : [])];
  const wait = blockedMinutes(keys);
  if (wait > 0) return { error: `Demasiados intentos fallidos. Vuelve a probar dentro de ${wait} min.` };

  try {
    await verifyCredentials({ email: user.email, password: current }, ip);
  } catch (error) {
    if (error instanceof ImapAuthError) {
      registerFailure(keys);
      return { error: "La contraseña actual no es correcta." };
    }
    return { error: "El servidor de correo no responde. Inténtalo en unos minutos." };
  }

  try {
    await setMailboxPassword(user.email, next);
  } catch (error) {
    console.error("[contraseña] Mailcow rechazó el cambio", error);
    if (error instanceof MailcowError && /password_complexity/i.test(error.code)) {
      return { error: "El servidor pide una contraseña más compleja." };
    }
    return { error: "No se pudo cambiar la contraseña. Inténtalo de nuevo." };
  }

  await closeConnections(user.email);
  const session = await getSession();
  session.password = next;
  session.mustChangePassword = false;
  session.signedInAt = Date.now();
  await session.save();
  redirect("/?contrasena=cambiada");
}
