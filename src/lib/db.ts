import "server-only";

import { mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Base de datos propia de rud1 Mail (SQLite, un archivo).
 *
 * Solo guarda lo que no es correo: perfiles (nombre, puesto, foto, firma,
 * preferencias), la cabecera y el pie corporativos, los contactos para
 * autocompletar y los datos de los borradores. El correo vive en Dovecot.
 *
 * En producción el archivo está en un volumen de Docker (/data); en
 * desarrollo, en ./data.
 */

const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");

const MIGRATIONS: string[] = [
  // 1: perfiles, ajustes de la organización y contactos
  `
  CREATE TABLE profiles (
    email TEXT PRIMARY KEY,
    first_name TEXT NOT NULL DEFAULT '',
    last_name TEXT NOT NULL DEFAULT '',
    position TEXT NOT NULL DEFAULT '',
    department TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    signature_html TEXT NOT NULL DEFAULT '',
    prefs TEXT NOT NULL DEFAULT '{}',
    avatar BLOB,
    avatar_version INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE org_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    updated_by TEXT NOT NULL DEFAULT ''
  );
  CREATE TABLE contacts (
    owner TEXT NOT NULL,
    address TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    uses INTEGER NOT NULL DEFAULT 0,
    last_used INTEGER NOT NULL,
    PRIMARY KEY (owner, address)
  );
  CREATE INDEX contacts_owner_last ON contacts(owner, last_used DESC);
  `,
  // 2: borradores escritos en rud1 Mail (para reabrirlos tal cual se dejaron)
  `
  CREATE TABLE drafts (
    owner TEXT NOT NULL,
    message_id TEXT NOT NULL,
    data TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (owner, message_id)
  );
  `,
  // 3: sonido propio que sube cada persona para sus avisos
  `
  CREATE TABLE custom_sounds (
    email TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    data BLOB NOT NULL,
    updated_at INTEGER NOT NULL
  );
  `,
  // 4: roles, permisos de cada persona, equipos y quién ve cada buzón común
  `
  CREATE TABLE roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL,
    permissions TEXT NOT NULL,
    storage_mb INTEGER NOT NULL DEFAULT 0,
    builtin INTEGER NOT NULL DEFAULT 0,
    position INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE user_access (
    email TEXT PRIMARY KEY,
    role_id TEXT NOT NULL,
    overrides TEXT NOT NULL DEFAULT '{}',
    storage_mb INTEGER,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL
  );
  CREATE TABLE team_members (
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    PRIMARY KEY (team_id, email)
  );
  -- subject: "user:<correo>" o "team:<id>"
  CREATE TABLE shared_grants (
    owner TEXT NOT NULL,
    subject TEXT NOT NULL,
    can_view INTEGER NOT NULL DEFAULT 0,
    can_send INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (owner, subject)
  );
  `,
];

function open(): Database.Database {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(path.join(DATA_DIR, "rud1-mail.db"));
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  const current = db.pragma("user_version", { simple: true }) as number;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}

// Una sola conexión por proceso (en desarrollo sobrevive a las recargas, así
// que se comprueba si el código trae migraciones nuevas).
const holder = globalThis as unknown as { __rud1MailDb?: Database.Database; __rud1MailDbVersion?: number };

export function db(): Database.Database {
  holder.__rud1MailDb ??= open();
  if (holder.__rud1MailDbVersion !== MIGRATIONS.length) {
    migrate(holder.__rud1MailDb);
    holder.__rud1MailDbVersion = MIGRATIONS.length;
  }
  return holder.__rud1MailDb;
}
