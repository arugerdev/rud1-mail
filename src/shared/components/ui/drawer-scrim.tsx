"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * Velo oscuro de la hoja inferior en móvil. Se monta como hijo del contenido
 * del menú/select —que Radix solo monta mientras está abierto— y se porta al
 * <body> para quedar como capa a pantalla completa por detrás de la hoja
 * (z-40 < z-50). Al cerrarse el menú, el contenido se desmonta y con él este
 * velo: así el fondo solo se ve cuando hay un desplegable abierto.
 */
export function DrawerScrim() {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => setContainer(document.body), []);
  if (!container) return null;
  return createPortal(
    <div
      aria-hidden
      data-rud1-menu-scrim=""
      className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px] animate-in fade-in-0"
    />,
    container,
  );
}

/**
 * Estado abierto/cerrado espejo del que maneja Radix, respetando el modo
 * controlado. Sirve para renderizar el velo SOLO cuando el desplegable está
 * abierto, sin depender de cómo Radix monte su contenido (Select, por
 * ejemplo, renderiza sus hijos en un fragment mientras está cerrado).
 */
export function useControllableOpen(
  openProp: boolean | undefined,
  defaultOpen: boolean | undefined,
  onOpenChange: ((open: boolean) => void) | undefined,
): [boolean, (open: boolean) => void] {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen ?? false);
  const open = openProp ?? uncontrolled;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );
  return [open, setOpen];
}
