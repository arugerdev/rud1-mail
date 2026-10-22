import type { Metadata } from "next";

import { requireAdmin } from "@/lib/admin";
import { config } from "@/lib/config";
import { listAliases, listMailboxes, mailcowAvailable } from "@/lib/mailcow";

import { AliasesSettings } from "./aliases-settings";

export const metadata: Metadata = { title: "Direcciones" };
export const dynamic = "force-dynamic";

export default async function AliasesPage() {
  await requireAdmin();
  if (!mailcowAvailable()) return <p className="text-sm text-muted-foreground">La administración no está disponible ahora mismo.</p>;
  const [aliases, boxes] = await Promise.all([listAliases(config.domain), listMailboxes(config.domain)]);
  return (
    <AliasesSettings
      aliases={aliases}
      mailboxes={boxes.filter((b) => b.active).map((b) => ({ address: b.username, name: b.name }))}
      domain={config.domain}
    />
  );
}
