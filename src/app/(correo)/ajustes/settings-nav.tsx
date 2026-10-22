"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AtSign, FileSignature, Inbox, ShieldCheck, UserRound, UsersRound } from "lucide-react";

import { cn } from "@/lib/utils";

const PERSONAL = [{ href: "/ajustes", label: "Mi perfil y firma", icon: UserRound }];
/** Qué pestaña de administración ve cada uno (lib/admin.ts → adminAccess). */
type Need = "owner" | "mailboxes" | "templates";
const ADMIN: { href: string; label: string; icon: typeof UserRound; need: Need }[] = [
  { href: "/ajustes/administracion", label: "Cabecera y pie", icon: FileSignature, need: "templates" },
  { href: "/ajustes/administracion/usuarios", label: "Usuarios", icon: UsersRound, need: "mailboxes" },
  { href: "/ajustes/administracion/roles", label: "Roles y equipos", icon: ShieldCheck, need: "owner" },
  { href: "/ajustes/administracion/buzones-comunes", label: "Buzones comunes", icon: Inbox, need: "owner" },
  { href: "/ajustes/administracion/direcciones", label: "Direcciones", icon: AtSign, need: "mailboxes" },
];

/** Pestañas de ajustes; las de administración, según los permisos de cada uno. */
export function SettingsNav({ access }: { access: { owner: boolean; mailboxes: boolean; templates: boolean } }) {
  const pathname = usePathname();
  const need = { owner: access.owner, mailboxes: access.mailboxes, templates: access.templates };
  const items = [...PERSONAL, ...ADMIN.filter((i) => need[i.need])];
  return (
    <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-border/50 bg-surface-1/60 p-1 shadow-glass-xs backdrop-blur-xl">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all",
              active ? "bg-primary-soft/50 text-primary-foreground shadow-glass-xs dark:text-primary" : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
