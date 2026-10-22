"use client";

import * as React from "react";
import Link from "next/link";
import { KeyRound, Loader2 } from "lucide-react";

import { changePassword, signOut, type FormState } from "@/app/actions/auth";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";

import { FormError, PasswordInput } from "../password-input";

export function ChangePasswordForm({ mandatory }: { mandatory: boolean }) {
  const [state, action, pending] = React.useActionState<FormState, FormData>(changePassword, {});

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="current">{mandatory ? "Contraseña provisional" : "Contraseña actual"}</Label>
        <PasswordInput id="current" name="current" autoComplete="current-password" disabled={pending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña nueva</Label>
        <PasswordInput id="password" name="password" autoComplete="new-password" disabled={pending} />
        <p className="text-xs text-muted-foreground">Al menos 12 caracteres, con letras y números.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Repite la contraseña nueva</Label>
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" disabled={pending} />
      </div>

      <FormError message={state.error} />

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <KeyRound />}
        Guardar la contraseña
      </Button>

      {mandatory ? (
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
        >
          Salir sin cambiarla
        </button>
      ) : (
        <Link href="/" className="block text-center text-xs text-muted-foreground hover:text-foreground">
          Volver al correo
        </Link>
      )}
    </form>
  );
}
