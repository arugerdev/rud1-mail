"use client";

import { useTheme } from "next-themes";
import { Toaster as SonnerToaster, toast } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <SonnerToaster
      theme={(resolvedTheme ?? "system") as "light" | "dark" | "system"}
      richColors
      closeButton
      position="top-right"
      // Por debajo de las cabeceras (56–64 px): así no tapan la campana ni los iconos de arriba.
      offset={{ top: 76, right: 24, bottom: 24, left: 24 }}
      mobileOffset={{ top: 68, right: 12, bottom: 12, left: 12 }}
      expand
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:glass group-[.toaster]:rounded-2xl group-[.toaster]:text-foreground",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:rounded-lg group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
    />
  );
}

export { toast };
