"use client";

import * as React from "react";
import { Eye, EyeOff, Lock } from "lucide-react";

import { Input } from "@/shared/components/ui/input";

/** Campo de contraseña con candado y botón para verla. */
export function PasswordInput({
  id,
  name,
  autoComplete,
  disabled,
}: {
  id: string;
  name: string;
  autoComplete: string;
  disabled?: boolean;
}) {
  const [show, setShow] = React.useState(false);
  return (
    <div className="relative">
      <Lock className="absolute left-3 top-1/2 z-10 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        id={id}
        name={name}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        className="pl-10 pr-10"
        disabled={disabled}
        required
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={show ? "Ocultar la contraseña" : "Ver la contraseña"}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive-soft/20 px-3 py-2 text-sm text-destructive-foreground dark:text-destructive">
      {message}
    </p>
  );
}
