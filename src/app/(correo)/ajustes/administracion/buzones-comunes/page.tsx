import type { Metadata } from "next";

import { requireAdmin } from "@/lib/admin";
import { config } from "@/lib/config";
import { listMailboxes, mailcowAvailable } from "@/lib/mailcow";
import { fullName, getProfile } from "@/lib/profiles";
import { getViewers, sharedAccessAvailable } from "@/lib/shared-access";

import { SharedSettings } from "./shared-settings";

export const metadata: Metadata = { title: "Buzones comunes" };
export const dynamic = "force-dynamic";

export default async function SharedMailboxesPage() {
  await requireAdmin();
  if (!mailcowAvailable() || !sharedAccessAvailable()) {
    return <p className="text-sm text-muted-foreground">La gestión de buzones comunes no está disponible ahora mismo.</p>;
  }
  const boxes = await listMailboxes(config.domain);
  const people = boxes
    .filter((b) => !b.shared && b.active)
    .map((b) => {
      const p = getProfile(b.username, b.name);
      return { email: b.username, name: fullName(p) !== b.username ? fullName(p) : b.name, position: p.position, sendAs: b.sendAs };
    });
  // noreply@ es de la web: no se reparte.
  const shared = boxes.filter((b) => b.shared && b.username !== `noreply@${config.domain}`);
  const viewers = await Promise.all(shared.map((b) => getViewers(b.username).catch(() => [] as string[])));

  return (
    <SharedSettings
      people={people}
      mailboxes={shared.map((b, i) => ({
        address: b.username,
        name: b.name,
        active: b.active,
        viewers: viewers[i],
        senders: people.filter((p) => p.sendAs.includes(b.username)).map((p) => p.email),
      }))}
    />
  );
}
