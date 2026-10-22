import type { Metadata } from "next";

import { requireAdmin } from "@/lib/admin";
import { config } from "@/lib/config";
import { listMailboxes, mailcowAvailable } from "@/lib/mailcow";
import { fullName, getProfile } from "@/lib/profiles";
import { getOrgTemplates, TEMPLATE_VARIABLES } from "@/lib/templates";

import { TemplatesSettings } from "./templates-settings";

export const metadata: Metadata = { title: "Cabecera y pie" };

export default async function TemplatesPage() {
  const user = await requireAdmin();
  // Personas del equipo (buzones personales), para ver la vista previa con sus datos.
  const boxes = mailcowAvailable() ? await listMailboxes(config.domain).catch(() => []) : [];
  const people = boxes
    .filter((b) => !b.shared)
    .map((b) => {
      const p = getProfile(b.username, b.name);
      return { email: b.username, name: fullName(p) };
    });
  if (!people.some((p) => p.email === user.email)) people.unshift({ email: user.email, name: user.name });
  return <TemplatesSettings templates={getOrgTemplates()} variables={TEMPLATE_VARIABLES} people={people} me={user.email} />;
}
