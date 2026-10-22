"use client";

import * as React from "react";
import { BellOff, BellRing, Download, Loader2, MonitorDown, RefreshCw, RotateCw } from "lucide-react";

import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ToggleSwitch } from "@/shared/components/ui/toggle-switch";

import { desktopBridge, type DesktopUpdateInfo } from "../desktop-bridge";

const DOWNLOAD = "https://github.com/arugerdev/rud1-mail/releases/latest";

function statusText(info: DesktopUpdateInfo): string {
  const s = info.status;
  switch (s.state) {
    case "checking":
      return "Buscando actualizaciones…";
    case "up-to-date":
      return "Tienes la última versión.";
    case "available":
      return info.canInstall ? `Hay una versión nueva: ${s.version}.` : `Hay una versión nueva: ${s.version}. Descárgala para instalarla.`;
    case "downloading":
      return `Descargando la versión ${s.version}… ${s.percent} %`;
    case "ready":
      return info.autoUpdate
        ? `La versión ${s.version} está lista: se instalará sola en cuanto dejes de usar la app.`
        : `La versión ${s.version} está lista para instalar.`;
    case "error":
      return "No se ha podido comprobar ahora. Se reintentará más tarde.";
    default:
      return "Se comprueba sola al abrir la app y cada cuatro horas.";
  }
}

/** Solo dentro de la app de escritorio: versión y actualizaciones. */
export function DesktopSettings({ delay = 0 }: { delay?: number }) {
  const [info, setInfo] = React.useState<DesktopUpdateInfo | null>(null);
  const [legacy, setLegacy] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [notifyError, setNotifyError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    void bridge.notifyStatus?.().then((s) => setNotifyError(s?.error ?? null));
    const offFailed = bridge.onNotifyFailed?.(setNotifyError);
    if (!bridge.updates) {
      // Versión anterior a la 0.2.0: no sabe actualizarse sola.
      setLegacy(true);
      return;
    }
    void bridge.updates.get().then((i) => i && setInfo(i));
    const offChange = bridge.updates.onChange(setInfo);
    return () => {
      offChange();
      offFailed?.();
    };
  }, []);

  const testNotification = () => {
    setNotifyError(null);
    desktopBridge()?.notify?.({ title: "Así se verán los avisos", body: "Cuando llegue correo y no estés mirando rud1 Mail.", url: "/" });
  };

  if (!info && !legacy) return null;

  const run = async (fn: () => Promise<DesktopUpdateInfo | null>) => {
    setBusy(true);
    try {
      const next = await fn();
      if (next) setInfo(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rud1-in" style={{ animationDelay: `${delay}ms` }}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MonitorDown className="size-5 text-primary" /> App de escritorio
        </CardTitle>
        <CardDescription>{info ? `Versión ${info.version}` : "Versión antigua"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {legacy || !info ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              Esta versión no se actualiza sola. Instala la nueva una vez y a partir de ahí se actualizará automáticamente.
            </p>
            <Button asChild>
              <a href={DOWNLOAD} target="_blank" rel="noreferrer">
                <Download /> Descargar la última versión
              </a>
            </Button>
          </div>
        ) : (
          <>
            {notifyError && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3">
                <p className="flex items-start gap-2 text-sm">
                  <BellOff className="mt-0.5 size-4 shrink-0 text-amber-500" />
                  El sistema tiene los avisos desactivados, así que no puede enseñarte el correo nuevo. Actívalos en la
                  configuración de notificaciones (para todo el equipo y para rud1 Mail).
                </p>
                <Button variant="outline" size="sm" onClick={() => desktopBridge()?.openNotificationSettings?.()}>
                  Abrir la configuración
                </Button>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Comprueba que los avisos del sistema te llegan.</p>
              <Button variant="outline" onClick={testNotification}>
                <BellRing /> Probar un aviso
              </Button>
            </div>
            <ToggleSwitch
              checked={info.autoUpdate}
              onChange={(v) => void run(() => desktopBridge()!.updates!.setAuto(v))}
              label="Actualizar automáticamente"
              description={
                info.canInstall
                  ? "Descarga e instala las versiones nuevas sin preguntar, cuando no estás usando la app."
                  : "En este sistema no puede instalarse sola: te avisará y te llevará a la descarga."
              }
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">{statusText(info)}</p>
              {info.status.state === "ready" || info.status.state === "available" ? (
                <Button disabled={busy} onClick={() => void run(() => desktopBridge()!.updates!.install())}>
                  {busy ? <Loader2 className="animate-spin" /> : info.canInstall ? <RotateCw /> : <Download />}
                  {info.status.state === "ready" ? "Reiniciar y actualizar" : info.canInstall ? "Instalar ahora" : "Descargar"}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={busy || info.status.state === "checking" || info.status.state === "downloading"}
                  onClick={() => void run(() => desktopBridge()!.updates!.check())}
                >
                  {busy || info.status.state === "checking" ? <Loader2 className="animate-spin" /> : <RefreshCw />} Buscar actualizaciones
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
