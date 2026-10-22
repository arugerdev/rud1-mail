"use client";

import * as React from "react";
import { CalendarDays, Download, ExternalLink, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";

import { importIcsAction } from "@/app/actions/agenda";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";

/** Importar y exportar la agenda (la de admin.rud1.es, que es la misma). */
export function AgendaSettings({ delay = 0 }: { delay?: number }) {
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, start] = React.useTransition();

  const importFile = (file: File) => {
    const fd = new FormData();
    fd.set("calendario", file);
    start(async () => {
      const r = await importIcsAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const { created, skipped, failed } = r.data;
      const parts = [`${created} ${created === 1 ? "cita importada" : "citas importadas"}`];
      if (skipped > 0) parts.push(`${skipped} ya estaban`);
      if (failed > 0) parts.push(`${failed} no se pudieron importar`);
      if (failed > 0) toast.warning(parts.join(" · "));
      else toast.success(parts.join(" · "));
    });
  };

  return (
    <Card className="rud1-in" style={{ animationDelay: `${delay}ms` }}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <CalendarDays className="size-5 text-primary" /> Agenda
        </CardTitle>
        <CardDescription>
          Es la misma agenda de admin.rud1.es: lo que cambies en un sitio aparece en el otro. Aquí puedes traer citas de otro
          calendario o llevarte las tuyas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Importar un calendario</p>
            <p className="text-xs text-muted-foreground">Un archivo .ics de Google Calendar, Outlook o el iPhone. Lo que ya esté no se duplica.</p>
          </div>
          <Button variant="outline" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Importar .ics
          </Button>
          <input
            ref={input}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) importFile(file);
              e.target.value = "";
            }}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/50 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Exportar tu agenda</p>
            <p className="text-xs text-muted-foreground">Tus citas de los últimos 60 días y del próximo año, en .ics.</p>
          </div>
          <Button variant="outline" asChild>
            <a href="/api/agenda/exportar" download>
              <Download /> Exportar .ics
            </a>
          </Button>
        </div>
        <p className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          ¿La quieres en el móvil, siempre al día? Saca tu enlace de suscripción en
          <a href="https://admin.rud1.es/cuenta" target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">
            tu cuenta de admin.rud1.es <ExternalLink className="size-3" />
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
