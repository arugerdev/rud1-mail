import type { Metadata } from "next";

import { can, directGrants, ensureAccessImported, isSystemMailbox, listTeams } from "@/lib/access";
import { requireOwner } from "@/lib/admin";
import { config } from "@/lib/config";
import { listMailboxes, mailcowAvailable } from "@/lib/mailcow";
import { fullName, getProfile } from "@/lib/profiles";
import { sharedAccessAvailable } from "@/lib/shared-access";

import { SharedSettings } from "./shared-settings";

export const metadata: Metadata = { title: "Buzones comunes" };
export const dynamic = "force-dynamic";

export default async function SharedMailboxesPage() {
  await requireOwner();
  if (!mailcowAvailable() || !sharedAccessAvailable()) {
    return <p className="text-sm text-muted-foreground">La gestión de buzones comunes no está disponible ahora mismo.</p>;
  }
  await ensureAccessImported();
  const boxes = await listMailboxes(config.domain);
  const people = boxes
    .filter((b) => !b.shared && b.active && !isSystemMailbox(b.username))
    .map((b) => {
      const p = getProfile(b.username, b.name);
      return {
        email: b.username,
        name: fullName(p) !== b.username ? fullName(p) : b.name,
        position: p.position,
        // Sin este permiso, lo que se le dé aquí no tiene efecto.
        sharedAllowed: can(b.username, "correo.comunes"),
        sendAllowed: can(b.username, "correo.enviar"),
      };
    });
  // noreply@ es de la web: no se reparte.
  const shared = boxes.filter((b) => b.shared && !isSystemMailbox(b.username));
  const teams = listTeams();

  return (
    <SharedSettings
      people={people}
      mailboxes={shared.map((b) => ({
        address: b.username,
        name: b.name,
        grants: directGrants(b.username),
        // Lo que viene de equipos (se cambia en Roles y equipos).
        viaTeams: teams.flatMap((t) => {
          const g = t.grants.find((x) => x.owner === b.username);
          return g ? t.members.map((email) => ({ email, team: t.name, color: t.color, send: g.send })) : [];
        }),
      }))}
    />
  );
}
