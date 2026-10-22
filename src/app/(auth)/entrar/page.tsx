import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Mail } from "lucide-react";

import { config } from "@/lib/config";
import { currentUser } from "@/lib/session";
import { AuthCard } from "@/shared/components/auth-card";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  const user = await currentUser();
  if (user) redirect(user.mustChangePassword ? "/cambiar-contrasena" : "/");

  return (
    <AuthCard icon={<Mail className="size-6" />} title="rud1 Mail" subtitle="Entra con tu dirección de correo de rud1.">
      <LoginForm domain={config.domain} />
    </AuthCard>
  );
}
