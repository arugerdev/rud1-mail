import type { Metadata } from "next";

import {
  getUserAccess,
  isOwner,
  isSystemMailbox,
  listRoles,
  permissionsFor,
  teamsOf,
} from "@/lib/access";
import { requirePermission } from "@/lib/admin";
import { agendaConfigured, agendaLinks } from "@/lib/agenda";
import { config } from "@/lib/config";
import { mailboxEntryAvailable } from "@/lib/mailbox-entry";
import { listMailboxes, mailcowAvailable } from "@/lib/mailcow";
import { fullName, getProfile } from "@/lib/profiles";

import { UsersSettings } from "./users-settings";

export const metadata: Metadata = { title: "Usuarios" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requirePermission("admin.buzones");
  if (!mailcowAvailable())
    return (
      <p className="text-sm text-muted-foreground">
        La administración no está disponible ahora mismo.
      </p>
    );
  const boxes = await listMailboxes(config.domain);
  const links = agendaLinks();
  const rows = boxes.map((b) => {
    const p = b.shared ? null : getProfile(b.username, b.name);
    const access = b.shared
      ? undefined
      : {
          ...getUserAccess(b.username),
          owner: isOwner(b.username),
          system: isSystemMailbox(b.username),
          effective: permissionsFor(b.username),
          teams: teamsOf(b.username).map((t) => ({
            name: t.name,
            color: t.color,
          })),
        };
    return {
      ...b,
      displayName: p && fullName(p) !== b.username ? fullName(p) : b.name,
      position: p?.position ?? "",
      access,
      agendaLink: links.get(b.username) ?? null,
    };
  });
  return (
    <UsersSettings
      rows={rows}
      me={user.email}
      domain={config.domain}
      roles={listRoles()}
      canManageAccess={isOwner(user.email)}
      agenda={agendaConfigured()}
      canEnter={isOwner(user.email) && !user.actingBy && mailboxEntryAvailable()}
    />
  );
}
