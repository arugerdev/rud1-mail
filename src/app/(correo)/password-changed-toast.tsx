"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

/** Aviso tras cambiar la contraseña; quita la marca de la URL para no repetirlo. */
export function PasswordChangedToast({ show }: { show: boolean }) {
  const router = useRouter();
  const shown = React.useRef(false);
  React.useEffect(() => {
    if (!show || shown.current) return;
    shown.current = true;
    toast.success("Contraseña cambiada. Úsala también en el móvil y en Outlook.", { id: "password-changed" });
    router.replace("/");
  }, [show, router]);
  return null;
}
