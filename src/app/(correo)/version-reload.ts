"use client";

import { toast } from "sonner";

/**
 * Versiones nuevas de rud1 Mail: al desplegar, el canal en tiempo real se
 * reconecta a la versión nueva y avisa con su número. Si no coincide con el de
 * esta pestaña (o la app de escritorio), se recarga sola, salvo que se esté
 * escribiendo algo: entonces se espera a que se deje y, mientras, un aviso
 * deja recargar a mano.
 */

const OWN_VERSION = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
let pending = false;

function busy(): boolean {
  // Redactando, con un diálogo abierto o escribiendo en un campo: no se corta.
  if (document.querySelector("[data-rud1-composer], [role='dialog'][data-state='open']")) return true;
  const el = document.activeElement as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
}

export function onServerVersion(version: string | undefined): void {
  if (!version || version === "dev" || OWN_VERSION === "dev" || version === OWN_VERSION || pending) return;
  pending = true;
  if (!busy()) {
    window.location.reload();
    return;
  }
  toast("Hay una versión nueva de rud1 Mail", {
    description: "Se cargará sola en cuanto termines lo que estás haciendo.",
    duration: Infinity,
    action: { label: "Recargar ahora", onClick: () => window.location.reload() },
  });
  const timer = window.setInterval(() => {
    if (!busy()) {
      window.clearInterval(timer);
      window.location.reload();
    }
  }, 5_000);
}
