"use client";

import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/shared/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Tonos pastel del sistema, elegidos por id para que cada persona sea siempre del mismo color. */
const TONES = [
  "bg-sky-200/80 text-sky-900 dark:bg-sky-400/25 dark:text-sky-100",
  "bg-violet-200/80 text-violet-900 dark:bg-violet-400/25 dark:text-violet-100",
  "bg-emerald-200/80 text-emerald-900 dark:bg-emerald-400/25 dark:text-emerald-100",
  "bg-amber-200/80 text-amber-900 dark:bg-amber-400/25 dark:text-amber-100",
  "bg-rose-200/80 text-rose-900 dark:bg-rose-400/25 dark:text-rose-100",
  "bg-teal-200/80 text-teal-900 dark:bg-teal-400/25 dark:text-teal-100",
  "bg-fuchsia-200/80 text-fuchsia-900 dark:bg-fuchsia-400/25 dark:text-fuchsia-100",
  "bg-cyan-200/80 text-cyan-900 dark:bg-cyan-400/25 dark:text-cyan-100",
];

function toneFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return TONES[Math.abs(hash) % TONES.length];
}

export function initialsOf(name: string): string {
  // Solo letras y números: «Verificación (temporal)» → «VT», no «V(».
  const parts = name
    .trim()
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface UserAvatarProps {
  name: string;
  image?: string | null;
  /** Semilla del color; por defecto el propio nombre. */
  seed?: string;
  className?: string;
}

export function UserAvatar({ name, image, seed, className }: UserAvatarProps) {
  return (
    <Avatar className={cn("size-8", className)}>
      {image ? <AvatarImage src={image} alt="" /> : null}
      <AvatarFallback
        className={cn("text-[11px] font-semibold", toneFor(seed ?? name))}
      >
        {initialsOf(name)}
      </AvatarFallback>
    </Avatar>
  );
}

export interface AvatarStackItem {
  id: string;
  name: string;
  image?: string | null;
}

/**
 * Grupo compacto: se solapan y los de atrás caen unos píxeles, para que la pila
 * se lea como un grupo y no como una fila de círculos sueltos.
 */
export function AvatarStack({
  items,
  max = 5,
  size = "size-8",
  overlap = "-ml-2.5",
  className,
}: {
  items: AvatarStackItem[];
  max?: number;
  size?: string;
  /** Margen negativo entre avatares; menos solape deja leer las iniciales enteras. */
  overlap?: string;
  className?: string;
}) {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;

  return (
    <div className={cn("flex items-center", className)}>
      {shown.map((item, i) => (
        <div
          key={item.id}
          className={cn("relative transition-transform", i > 0 && overlap)}
          style={{ zIndex: shown.length - i, transform: `translateY(${i}px)` }}
          title={item.name}
        >
          <UserAvatar
            name={item.name}
            image={item.image}
            seed={item.id}
            className={cn(size, "ring-2 ring-card")}
          />
        </div>
      ))}
      {rest > 0 && (
        <div
          className={cn("relative", overlap)}
          style={{ zIndex: 0, transform: `translateY(${shown.length}px)` }}
        >
          <div
            className={cn(
              size,
              "flex items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground ring-2 ring-card",
            )}
          >
            +{rest}
          </div>
        </div>
      )}
    </div>
  );
}
