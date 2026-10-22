"use client";

import * as React from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import { previewTemplateAction, saveTemplatesAction } from "@/app/actions/admin";
import type { OrgTemplates } from "@/lib/templates";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { ToggleSwitch } from "@/shared/components/ui/toggle-switch";

import { TemplateEditor, type TemplateVariable } from "../template-editor";

export function TemplatesSettings({
  templates,
  variables,
  people,
  me,
}: {
  templates: OrgTemplates;
  variables: TemplateVariable[];
  people: { email: string; name: string }[];
  me: string;
}) {
  const [state, setState] = React.useState(templates);
  const [previewFor, setPreviewFor] = React.useState(me);
  const [saving, start] = React.useTransition();
  const preview = React.useCallback((html: string) => previewTemplateAction(html, previewFor), [previewFor]);

  const save = () =>
    start(async () => {
      const r = await saveTemplatesAction(state);
      if (!r.ok) toast.error(r.error ?? "No se pudo guardar.");
      else toast.success("Cabecera y pie guardados. Se aplican desde ya a los correos de todo el equipo.");
    });

  return (
    <div className="space-y-6">
      <Card className="rud1-in">
        <CardHeader>
          <CardTitle className="text-lg">Cómo se aplican</CardTitle>
          <CardDescription>
            La cabecera va encima de cada mensaje y el pie debajo de la firma de cada persona. Los datos entre llaves, como{" "}
            <code className="rounded bg-muted px-1">{"{{nombre_completo}}"}</code>, se cambian por los de quien escribe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleSwitch
            checked={state.inReplies}
            onChange={(v) => setState({ ...state, inReplies: v })}
            label="También en respuestas y reenvíos"
            description="Si lo apagas, solo se añaden en los mensajes nuevos."
          />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Vista previa con los datos de</span>
            <select
              value={previewFor}
              onChange={(e) => setPreviewFor(e.target.value)}
              className="rounded-lg border border-border/60 bg-background px-2 py-1 text-sm"
            >
              {people.map((p) => (
                <option key={p.email} value={p.email}>
                  {p.name} ({p.email})
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card className="rud1-in" style={{ animationDelay: "60ms" }}>
        <CardHeader>
          <CardTitle className="text-lg">Cabecera</CardTitle>
          <CardDescription>Por ejemplo, el logotipo o un aviso. Mejor algo breve.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleSwitch
            checked={state.header.enabled}
            onChange={(v) => setState({ ...state, header: { ...state.header, enabled: v } })}
            label="Añadir cabecera"
          />
          <TemplateEditor
            key={`h-${previewFor}`}
            initialHtml={state.header.html}
            onChange={(html) => setState((s) => ({ ...s, header: { ...s.header, html } }))}
            variables={variables}
            preview={preview}
            placeholder="Texto o imagen que irá encima de cada mensaje"
            minHeight={90}
          />
        </CardContent>
      </Card>

      <Card className="rud1-in" style={{ animationDelay: "120ms" }}>
        <CardHeader>
          <CardTitle className="text-lg">Pie</CardTitle>
          <CardDescription>La firma corporativa: nombre, puesto, contacto, web, aviso legal…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleSwitch
            checked={state.footer.enabled}
            onChange={(v) => setState({ ...state, footer: { ...state.footer, enabled: v } })}
            label="Añadir pie"
          />
          <TemplateEditor
            key={`f-${previewFor}`}
            initialHtml={state.footer.html}
            onChange={(html) => setState((s) => ({ ...s, footer: { ...s.footer, html } }))}
            variables={variables}
            preview={preview}
            minHeight={140}
          />
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" className="shadow-glass-lg" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Save />} Guardar cabecera y pie
        </Button>
      </div>
    </div>
  );
}
