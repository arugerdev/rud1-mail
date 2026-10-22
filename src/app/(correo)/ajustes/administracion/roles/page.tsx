import type { Metadata } from "next";

import { ensureAccessImported, getUserAccess, isOwner, isSystemMailbox, listRoles, listTeams } from "@/lib/access";
import { requireOwner } from "@/lib/admin";
import { config } from "@/lib/config";
import { listMailboxes, mailcowAvailable } from "@/lib/mailcow";
import { fullName, getProfile } from "@/lib/profiles";

import { RolesSettings } from "./roles-settings";

export const metadata: Metadata = { title: "Roles y equipos" };
export const dynamic = "force-dynamic";

export default async function RolesPage() {
  await requireOwner();
  if (!mailcowAvailable()) return <p className="text-sm text-muted-foreground">La administración no está disponible ahora mismo.</p>;
  await ensureAccessImported();
  const boxes = await listMailboxes(config.domain);
  const people = boxes
    .filter((b) => !b.shared && !isSystemMailbox(b.username))
    .map((b) => {
      const p = getProfile(b.username, b.name);
      return {
        email: b.username,
        name: fullName(p) !== b.username ? fullName(p) : b.name,
        roleId: isOwner(b.username) ? null : getUserAccess(b.username).roleId,
      };
    });
  const shared = boxes.filter((b) => b.shared && !isSystemMailbox(b.username)).map((b) => ({ address: b.username, name: b.name }));
  return <RolesSettings roles={listRoles()} teams={listTeams()} people={people} shared={shared} />;
}
