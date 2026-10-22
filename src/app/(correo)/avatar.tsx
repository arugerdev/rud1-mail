"use client";

import * as React from "react";

import { UserAvatar } from "@/shared/components/ui/user-avatar";

/**
 * Fotos del equipo: el servidor manda qué direcciones tienen foto (y su
 * versión) y aquí se pinta la foto o, si no hay, las iniciales con su color.
 */
const AvatarContext = React.createContext<Record<string, number>>({});

export function AvatarProvider({ versions, children }: { versions: Record<string, number>; children: React.ReactNode }) {
  return <AvatarContext.Provider value={versions}>{children}</AvatarContext.Provider>;
}

export function avatarUrl(email: string, version: number): string {
  return `/api/avatar?${new URLSearchParams({ correo: email.toLowerCase(), v: String(version) })}`;
}

export function Avatar({
  email,
  name,
  version,
  className,
}: {
  email: string;
  name: string;
  version?: number;
  className?: string;
}) {
  const versions = React.useContext(AvatarContext);
  const v = version ?? versions[email.toLowerCase()];
  return <UserAvatar name={name || email} seed={email.toLowerCase()} image={v ? avatarUrl(email, v) : null} className={className} />;
}
