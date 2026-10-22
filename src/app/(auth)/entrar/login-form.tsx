"use client";

import * as React from "react";
import { ArrowRight, Loader2, Mail } from "lucide-react";

import { signIn, type FormState } from "@/app/actions/auth";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";

import { FormError, PasswordInput } from "../password-input";

export function LoginForm({ domain }: { domain: string }) {
  const [state, action, pending] = React.useActionState<FormState, FormData>(signIn, {});

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Dirección de correo</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder={`nombre@${domain}`}
            className="pl-10"
            // Tras un error el formulario se vacía: se vuelve a poner la dirección.
            key={state.email ?? ""}
            defaultValue={state.email ?? ""}
            disabled={pending}
            autoFocus
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <PasswordInput id="password" name="password" autoComplete="current-password" disabled={pending} />
      </div>

      <FormError message={state.error} />

      <Button type="submit" className="w-full" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <ArrowRight />}
        Entrar
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        ¿No recuerdas tu contraseña? Pídesela a quien administra el correo.
      </p>
    </form>
  );
}
