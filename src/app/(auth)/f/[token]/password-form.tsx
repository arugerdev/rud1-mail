"use client";

import * as React from "react";
import { Loader2, Unlock } from "lucide-react";

import { unlockLinkAction } from "@/app/actions/links";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";

export function LinkPasswordForm({ token }: { token: string }) {
  const [state, action, pending] = React.useActionState(unlockLinkAction, { error: null as string | null });
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      <Input type="password" name="password" placeholder="Contraseña" autoFocus required autoComplete="off" />
      {state.error && <p className="text-sm text-destructive">{state.error}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Unlock />} Abrir
      </Button>
    </form>
  );
}
