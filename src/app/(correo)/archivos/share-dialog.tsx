"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Link2, Loader2, Lock, Plus, Trash2, UsersRound, X } from "lucide-react";
import { toast } from "sonner";

import { createLinkAction, disableLinkAction, setSharesAction, shareDetailsAction, type ShareDetails } from "@/app/actions/files";
import { cn } from "@/lib/utils";
import { Button } from "@/shared/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";

import { Avatar } from "../avatar";

type ShareRow = { subject: string; canEdit: boolean; label: string };

function linkUrl(token: string): string {
  return `${window.location.origin}/f/${token}`;
}

/** Compartir con personas o equipos del equipo, y enlaces para gente de fuera. */
export function ShareDialog({ item, onClose }: { item: { id: string; name: string } | null; onClose: () => void }) {
  const router = useRouter();
  const [details, setDetails] = React.useState<ShareDetails | null>(null);
  const [shares, setShares] = React.useState<ShareRow[]>([]);
  const [adding, setAdding] = React.useState("");
  const [days, setDays] = React.useState<number | null>(7);
  const [password, setPassword] = React.useState("");
  const [busy, start] = React.useTransition();

  const load = React.useCallback(async (id: string) => {
    const d = await shareDetailsAction(id);
    setDetails(d);
    setShares(d?.shares ?? []);
  }, []);

  React.useEffect(() => {
    if (!item) return;
    setDetails(null);
    setAdding("");
    setPassword("");
    void load(item.id);
  }, [item, load]);

  const owner = details?.owner ?? false;
  const available = (details?.options ?? []).filter((o) => !shares.some((s) => s.subject === o.subject));
  const dirty = JSON.stringify(shares.map((s) => [s.subject, s.canEdit])) !== JSON.stringify((details?.shares ?? []).map((s) => [s.subject, s.canEdit]));

  return (
    <Dialog open={item !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">Compartir «{item?.name}»</DialogTitle>
          <DialogDescription>{details?.path}</DialogDescription>
        </DialogHeader>

        {!details ? (
          <Loader2 className="mx-auto my-8 size-5 animate-spin text-muted-foreground" />
        ) : (
          <>
            <section className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <UsersRound className="size-4 text-primary" /> Con el equipo
              </p>
              {shares.length === 0 && <p className="text-sm text-muted-foreground">Solo lo ves tú.</p>}
              <ul className="space-y-1">
                {shares.map((s) => (
                  <li key={s.subject} className="flex items-center gap-2 rounded-lg px-1 py-1">
                    {s.subject.startsWith("user:") ? (
                      <Avatar email={s.subject.slice(5)} name={s.label} className="size-7 text-[10px]" />
                    ) : (
                      <span className="flex size-7 items-center justify-center rounded-full bg-primary-soft/50 text-primary">
                        <UsersRound className="size-3.5" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate text-sm">{s.label}</span>
                    {owner ? (
                      <>
                        <select
                          value={s.canEdit ? "editar" : "ver"}
                          onChange={(e) => setShares(shares.map((x) => (x.subject === s.subject ? { ...x, canEdit: e.target.value === "editar" } : x)))}
                          className="rounded-lg border border-border/60 bg-background px-2 py-1 text-xs"
                        >
                          <option value="ver">Puede ver</option>
                          <option value="editar">Puede editar</option>
                        </select>
                        <Button variant="ghost" size="icon" aria-label={`Dejar de compartir con ${s.label}`} onClick={() => setShares(shares.filter((x) => x.subject !== s.subject))}>
                          <X className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{s.canEdit ? "Puede editar" : "Puede ver"}</span>
                    )}
                  </li>
                ))}
              </ul>
              {owner && available.length > 0 && (
                <div className="flex gap-2">
                  <select
                    value={adding}
                    onChange={(e) => setAdding(e.target.value)}
                    className="min-w-0 flex-1 rounded-lg border border-border/60 bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="">Añadir persona o equipo…</option>
                    {available.map((o) => (
                      <option key={o.subject} value={o.subject}>
                        {o.label} — {o.detail}
                      </option>
                    ))}
                  </select>
                  <Button
                    variant="outline"
                    disabled={!adding}
                    onClick={() => {
                      const o = available.find((x) => x.subject === adding);
                      if (o) setShares([...shares, { subject: o.subject, canEdit: false, label: o.label }]);
                      setAdding("");
                    }}
                  >
                    <Plus /> Añadir
                  </Button>
                </div>
              )}
              {owner && dirty && (
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      start(async () => {
                        const r = await setSharesAction(item!.id, shares);
                        if (!r.ok) toast.error(r.error ?? "No se pudo compartir.");
                        else {
                          toast.success("Compartido");
                          await load(item!.id);
                          router.refresh();
                        }
                      })
                    }
                  >
                    {busy && <Loader2 className="animate-spin" />} Guardar
                  </Button>
                </div>
              )}
            </section>

            {owner && (
              <section className="space-y-2 border-t border-border/40 pt-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Link2 className="size-4 text-primary" /> Enlace para gente de fuera
                </p>
                <p className="text-xs text-muted-foreground">Quien tenga el enlace puede descargarlo sin entrar en rud1 Mail.</p>
                <ul className="space-y-1.5">
                  {details.links.map((l) => {
                    const expired = l.expiresAt !== null && l.expiresAt < Date.now();
                    const off = l.disabled || expired;
                    return (
                      <li key={l.token} className={cn("flex items-center gap-2 rounded-lg border border-border/50 px-2 py-1.5", off && "opacity-50")}>
                        {l.hasPassword && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">{`/f/${l.token}`}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {l.disabled
                            ? "Desactivado"
                            : expired
                              ? "Caducado"
                              : l.expiresAt
                                ? `Hasta ${new Date(l.expiresAt).toLocaleDateString("es-ES")}`
                                : "Sin caducidad"}{" "}
                          · {l.downloads} desc.
                        </span>
                        {!off && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Copiar el enlace"
                              onClick={() => void navigator.clipboard.writeText(linkUrl(l.token)).then(() => toast.success("Enlace copiado"))}
                            >
                              <Copy className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Desactivar el enlace"
                              onClick={() =>
                                start(async () => {
                                  const r = await disableLinkAction(l.token);
                                  if (!r.ok) toast.error(r.error ?? "No se pudo.");
                                  else await load(item!.id);
                                })
                              }
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={days === null ? "nunca" : String(days)}
                    onChange={(e) => setDays(e.target.value === "nunca" ? null : Number(e.target.value))}
                    className="rounded-lg border border-border/60 bg-background px-2 py-1.5 text-sm"
                    aria-label="Caducidad del enlace"
                  >
                    <option value="1">Caduca en 1 día</option>
                    <option value="7">Caduca en 7 días</option>
                    <option value="30">Caduca en 30 días</option>
                    <option value="nunca">No caduca</option>
                  </select>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Contraseña (opcional)"
                    className="h-9 min-w-0 flex-1"
                    autoComplete="new-password"
                  />
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      start(async () => {
                        const r = await createLinkAction(item!.id, { days, password: password || null });
                        if (!r.ok || !r.link) toast.error(r.error ?? "No se pudo crear el enlace.");
                        else {
                          await navigator.clipboard.writeText(linkUrl(r.link.token)).catch(() => undefined);
                          toast.success("Enlace creado y copiado");
                          setPassword("");
                          await load(item!.id);
                        }
                      })
                    }
                  >
                    <Link2 /> Crear enlace
                  </Button>
                </div>
              </section>
            )}
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
