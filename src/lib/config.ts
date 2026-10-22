import "server-only";

/**
 * Configuración del servidor, leída de las variables de entorno.
 *
 * En producción la aplicación vive junto a Mailcow y habla con él por la red
 * interna de Docker; en desarrollo, contra mail.rud1.es por internet.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function int(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(value) ? value : fallback;
}

export const config = {
  /** Dominio del correo: solo se aceptan direcciones de aquí. */
  domain: process.env.MAIL_DOMAIN ?? "rud1.es",
  imap: {
    host: process.env.IMAP_HOST ?? "mail.rud1.es",
    port: int("IMAP_PORT", 993),
    /** Nombre del certificado cuando se conecta por la red interna (host "dovecot"). */
    servername: process.env.MAIL_TLS_SERVERNAME ?? "mail.rud1.es",
  },
  smtp: {
    host: process.env.SMTP_HOST ?? "mail.rud1.es",
    port: int("SMTP_PORT", 587),
    servername: process.env.MAIL_TLS_SERVERNAME ?? "mail.rud1.es",
  },
  mailcow: {
    /** Sin URL, las funciones de administración y el cambio de contraseña no están disponibles. */
    url: process.env.MAILCOW_API_URL ?? null,
    key: process.env.MAILCOW_API_KEY ?? null,
    /** Solo para el túnel de desarrollo: el certificado no coincide con 127.0.0.1. */
    insecureTls: process.env.MAILCOW_API_INSECURE_TLS === "1",
    /** Nombre del certificado cuando se entra por la red interna (host "nginx"). */
    servername: process.env.MAIL_TLS_SERVERNAME ?? "mail.rud1.es",
  },
  get sessionSecret(): string {
    const secret = required("SESSION_SECRET");
    if (secret.length < 32) throw new Error("SESSION_SECRET debe tener al menos 32 caracteres");
    return secret;
  },
  /** Las cookies solo viajan por https salvo en desarrollo local. */
  secureCookies: process.env.NODE_ENV === "production",
};
