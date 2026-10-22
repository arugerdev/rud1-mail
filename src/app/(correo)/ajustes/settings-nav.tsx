"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AtSign, FileSignature, UserRound, UsersRound } from "lucide-react";

import { cn } from "@/lib/utils";

const PERSONAL = [{ href: "/ajustes", label: "Mi perfil y firma", icon: UserRound }];
const ADMIN = [
  { href: "/ajustes/administracion", label: "Cabecera y pie", icon: FileSignature },
  { href: "/ajustes/administracion/usuarios", label: "Usuarios", icon: UsersRound },
  { href: "/ajustes/administracion/direcciones", label: "Direcciones", icon: AtSign },
];

/** Pestañas de ajustes; las de administración solo para quien administra. */
export function SettingsNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...PERSONAL, ...ADMIN] : PERSONAL;
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
