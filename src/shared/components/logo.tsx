import { cn } from "@/lib/utils";

import { Rud1Logo, type Rud1Variant } from "./rud1-logo";

/**
 * Logo de rud1 en la interfaz.
 *
 * El dibujo real vive en `rud1-logo.tsx`, generado por el kit de marca. Este
 * fichero es la capa de uso: decide qué variante toca según el tamaño y
 * resuelve el tema.
 *
 * El tema se resuelve con clases, no con un prop: `next-themes` pinta la clase
 * `dark` en el `<html>` ya en el cliente, así que un prop obligaría a leer el
 * tema con un hook y el servidor renderizaría el logo equivocado. Se pintan las
 * dos versiones y CSS enseña la que toca — sin parpadeo y sin JavaScript.
 */

interface LogoProps {
  className?: string;
  showWordmark?: boolean;
  size?: number;
  /** Logo propio de la organización; si viene, sustituye al de rud1. */
  src?: string | null;
  alt?: string;
  /**
   * La organización revende rud1 con su marca: sin logo propio no se cae al
   * nuestro, se enseña su nombre. Con logo propio no cambia nada, porque ahí
   * ya no pintábamos el nuestro.
   */
  hideVendor?: boolean;
}

type MarkProps = Omit<LogoProps, "showWordmark" | "src" | "alt">;

/**
 * Por debajo de 24 px el isotipo se emborrona: la marca trae una versión
 * simplificada, con los huecos más abiertos, justo para esos tamaños.
 */
function symbolVariant(size: number): Rud1Variant {
  return size < 24 ? "simplified" : "symbol";
}

/** El logo en sus dos temas; CSS decide cuál se ve. */
function Lockup({
  variant,
  height,
  className,
}: {
  variant: Rud1Variant;
  height: number;
  className?: string;
}) {
  return (
    <>
      <Rud1Logo
        variant={variant}
        height={height}
        theme="light"
        className={cn("block shrink-0 dark:hidden", className)}
      />
      <Rud1Logo
        variant={variant}
        height={height}
        theme="dark"
        className={cn("hidden shrink-0 dark:block", className)}
      />
    </>
  );
}

export function Logo({
  className,
  showWordmark,
  size = 28,
  src,
  alt,
  hideVendor,
}: LogoProps) {
  // Con logo propio de la organización no se añade el logotipo de rud1 al lado:
  // sería poner dos marcas juntas.
  const wordmark = showWordmark ?? !src;

  if (src) {
    return (
      <section className={cn("flex items-center gap-2.5", className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? ""}
          height={size}
          style={{ height: size, width: "auto" }}
          className="max-w-[140px] shrink-0 object-contain"
        />
        {wordmark && <Lockup variant="wordmark" height={size * 0.62} />}
      </section>
    );
  }

  if (hideVendor) {
    return (
      <section className={cn("flex items-center", className)}>
        <span className="truncate text-sm font-semibold">{alt ?? ""}</span>
      </section>
    );
  }

  return (
    <section className={cn("flex items-center", className)}>
      <Lockup
        variant={wordmark ? "compact" : symbolVariant(size)}
        height={size}
      />
    </section>
  );
}

export function LogoMark({ className, size = 28 }: MarkProps) {
  return <Lockup variant={symbolVariant(size)} height={size} className={className} />;
}

export function LogoWordmark({ className, size = 18 }: MarkProps) {
  return <Lockup variant="wordmark" height={size} className={className} />;
}

export function LogoIcon({ className, size = 28 }: MarkProps) {
  return <Lockup variant={symbolVariant(size)} height={size} className={className} />;
}

export function LogoFull({ className, size = 28 }: MarkProps) {
  return (
    <section className={cn("flex items-center", className)}>
      <Lockup variant="horizontal" height={size} />
    </section>
  );
}
