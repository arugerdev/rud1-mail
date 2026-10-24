import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DoorClosed, Mail } from "lucide-react";

import { config } from "@/lib/config";
import { onAccessHost } from "@/lib/mailbox-entry";
import { currentUser } from "@/lib/session";
import { AuthCard } from "@/shared/components/auth-card";

import { CloseTab } from "./close-tab";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ acceso?: string }> }) {
  const user = await currentUser();
  if (user) redirect(user.mustChangePassword ? "/cambiar-contrasena" : "/");

  // La dirección de acceso no tiene formulario: solo se llega con un enlace de Administración.
  if (await onAccessHost()) {
    const { acceso } = await searchParams;
    const text =
      acceso === "cerrado"
        ? "Has salido del buzón. Puedes cerrar esta pestaña."
        : acceso === "caducado"
          ? "El enlace ya se ha usado o ha caducado (dura un minuto). Vuelve a pulsar el botón de entrar en Administración → Usuarios."
          : "La entrada en este buzón ha terminado. Vuelve a entrar desde Administración → Usuarios.";
    return (
      <AuthCard icon={<DoorClosed className="size-6" />} title="Acceso cerrado" subtitle={text} tone="warning">
        {acceso === "cerrado" && <CloseTab />}
      </AuthCard>
    );
  }

  return (
    <AuthCard icon={<Mail className="size-6" />} title="rud1 Mail" subtitle="Entra con tu dirección de correo de rud1.">
      <LoginForm domain={config.domain} />
    </AuthCard>
  );
}
