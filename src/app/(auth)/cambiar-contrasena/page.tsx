import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { currentUser } from "@/lib/session";
import { AuthCard } from "@/shared/components/auth-card";

import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Cambiar la contraseña" };

export default async function ChangePasswordPage() {
  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (user.actingBy) redirect("/");

  return (
    <AuthCard
      icon={<KeyRound className="size-6" />}
      title={user.mustChangePassword ? "Elige tu contraseña" : "Cambiar la contraseña"}
      subtitle={
        user.mustChangePassword
          ? `Es tu primera entrada como ${user.email}. Cambia la contraseña provisional por una tuya.`
          : user.email
      }
      tone={user.mustChangePassword ? "warning" : "primary"}
    >
      <ChangePasswordForm mandatory={user.mustChangePassword} />
    </AuthCard>
  );
}
