"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, KeyRound, Loader2, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";

import {
  previewSignatureAction,
  removeAvatarAction,
  savePrefsAction,
  saveProfileAction,
  saveSignatureAction,
  uploadAvatarAction,
} from "@/app/actions/profile";
import type { Prefs } from "@/lib/profiles";
import { Button } from "@/shared/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { ToggleSwitch } from "@/shared/components/ui/toggle-switch";

import { Avatar } from "../avatar";
import { useNotificationPermission } from "../mail-watcher";
import { DesktopSettings } from "./desktop-settings";
import { SoundSettings } from "./sound-settings";
import { TemplateEditor, type TemplateVariable } from "./template-editor";

interface ProfileFields {
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  phone: string;
}

function Section({ title, description, children, delay = 0 }: { title: string; description?: string; children: React.ReactNode; delay?: number }) {
  return (
    <Card className="rud1-in" style={{ animationDelay: `${delay}ms` }}>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

function AvatarEditor({ email, name, hasAvatar }: { email: string; name: string; hasAvatar: boolean }) {
  const router = useRouter();
  const input = React.useRef<HTMLInputElement>(null);
  const [busy, start] = React.useTransition();

  const upload = (file: File) => {
    const fd = new FormData();
    fd.set("avatar", file);
    start(async () => {
      const r = await uploadAvatarAction(fd);
      if (!r.ok) toast.error(r.error ?? "No se pudo subir la foto.");
      else {
        toast.success("Foto actualizada");
        router.refresh();
      }
    });
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        className="group relative rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => input.current?.click()}
        aria-label="Cambiar la foto"
      >
        <Avatar email={email} name={name} className="size-20 text-xl" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
        </span>
      </button>
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">Sale en tus mensajes, en los chips de destinatario y en el equipo.</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            <Camera className="size-4" /> {hasAvatar ? "Cambiar foto" : "Subir foto"}
          </Button>
          {hasAvatar && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  await removeAvatarAction();
                  toast.success("Foto quitada");
                  router.refresh();
                })
              }
            >
              <Trash2 className="size-4" /> Quitar
            </Button>
          )}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function ProfileSettings({
  email,
  name,
  profile,
  hasAvatar,
  signatureHtml,
  prefs: initialPrefs,
  variables,
}: {
  email: string;
  name: string;
  profile: ProfileFields;
  avatarVersion: number;
  hasAvatar: boolean;
  signatureHtml: string;
  prefs: Prefs;
  variables: TemplateVariable[];
}) {
  const router = useRouter();
  const [fields, setFields] = React.useState(profile);
  const [signature, setSignature] = React.useState(signatureHtml);
  const [prefs, setPrefs] = React.useState(initialPrefs);
  const [savingProfile, startProfile] = React.useTransition();
  const [savingSignature, startSignature] = React.useTransition();
  const [permission, requestPermission] = useNotificationPermission();

  const field = (key: keyof ProfileFields, label: string, placeholder?: string) => (
    <div className="space-y-1.5">
      <Label htmlFor={key}>{label}</Label>
      <Input id={key} value={fields[key]} placeholder={placeholder} onChange={(e) => setFields({ ...fields, [key]: e.target.value })} />
    </div>
  );

  const setPref = (patch: Partial<Prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    void savePrefsAction(patch).then((r) => {
      if (!r.ok) toast.error("No se pudo guardar la preferencia.");
      else router.refresh();
    });
  };

  return (
    <div className="space-y-6">
      <Section title="Tus datos" description="Con ellos se rellenan tu firma, la cabecera y el pie de rud1.">
        <AvatarEditor email={email} name={name} hasAvatar={hasAvatar} />
        <div className="grid gap-4 sm:grid-cols-2">
          {field("firstName", "Nombre")}
          {field("lastName", "Apellidos")}
          {field("position", "Puesto", "Responsable de soporte")}
          {field("department", "Departamento", "Soporte")}
          {field("phone", "Teléfono", "+34 600 000 000")}
          <div className="space-y-1.5">
            <Label>Dirección</Label>
            <Input value={email} disabled />
          </div>
        </div>
        <div className="flex justify-end">
          <Button
            disabled={savingProfile}
            onClick={() =>
              startProfile(async () => {
                const r = await saveProfileAction(Object.entries(fields).reduce((fd, [k, v]) => (fd.set(k, v), fd), new FormData()));
                if (!r.ok) toast.error(r.error ?? "No se pudo guardar.");
                else toast.success("Datos guardados");
              })
            }
          >
            {savingProfile ? <Loader2 className="animate-spin" /> : <Save />} Guardar datos
          </Button>
        </div>
      </Section>

      <Section
        title="Tu firma"
        description="Va debajo de cada mensaje que escribes, antes del pie de rud1. Puedes usar tus datos como {{nombre}} o {{puesto}}."
        delay={60}
      >
        <TemplateEditor
          initialHtml={signatureHtml}
          onChange={setSignature}
          variables={variables}
          preview={previewSignatureAction}
          placeholder="Un saludo, {{nombre}}"
          minHeight={120}
        />
        <div className="flex justify-end">
          <Button
            disabled={savingSignature}
            onClick={() =>
              startSignature(async () => {
                const r = await saveSignatureAction(signature);
                if (!r.ok) toast.error(r.error ?? "No se pudo guardar la firma.");
                else toast.success("Firma guardada");
              })
            }
          >
            {savingSignature ? <Loader2 className="animate-spin" /> : <Save />} Guardar firma
          </Button>
        </div>
      </Section>

      <Section title="Avisos y lectura" delay={120}>
        <ToggleSwitch
          checked={prefs.notify}
          onChange={(v) => {
            setPref({ notify: v });
            if (v && permission === "default") void requestPermission();
          }}
          label="Avisos de escritorio"
          description={
            permission === "denied"
              ? "El navegador los tiene bloqueados: actívalos en los permisos del sitio."
              : "Un aviso del sistema cuando llega correo y no estás mirando rud1 Mail."
          }
        />
        <ToggleSwitch
          checked={prefs.density === "compacta"}
          onChange={(v) => setPref({ density: v ? "compacta" : "comoda" })}
          label="Lista compacta"
          description="Más mensajes a la vista, con menos espacio entre filas."
        />
        <ToggleSwitch
          checked={prefs.openNext}
          onChange={(v) => setPref({ openNext: v })}
          label="Abrir el siguiente al archivar o borrar"
          description="Si no, vuelves a la lista."
        />
      </Section>

      <Section title="Sonidos" description="Elige cómo suena cada aviso. Pulsa ▶ para escucharlo." delay={140}>
        <SoundSettings enabled={initialPrefs.sound} prefs={initialPrefs.sounds} />
      </Section>

      <DesktopSettings delay={150} />

      <Section title="Seguridad" delay={180}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Cambia tu contraseña. Recuerda ponerla también en el móvil y en Outlook.</p>
          <Button variant="outline" asChild>
            <Link href="/cambiar-contrasena">
              <KeyRound /> Cambiar la contraseña
            </Link>
          </Button>
        </div>
      </Section>
    </div>
  );
}
