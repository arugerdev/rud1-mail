import type { Metadata } from "next";

import { requireAdmin } from "@/lib/admin";
import { config } from "@/lib/config";
import { listMailboxes, mailcowAvailable } from "@/lib/mailcow";
import { fullName, getProfile } from "@/lib/profiles";

import { UsersSettings } from "./users-settings";

export const metadata: Metadata = { title: "Usuarios" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = await requireAdmin();
  if (!mailcowAvailable()) return <p className="text-sm text-muted-foreground">La administración no está disponible ahora mismo.</p>;
  const boxes = await listMailboxes(config.domain);
  const rows = boxes.map((b) => {
    const p = b.shared ? null : getProfile(b.username, b.name);
    return {
      ...b,
      displayName: p && fullName(p) !== b.username ? fullName(p) : b.name,
      position: p?.position ?? "",
    };
  });
  return <UsersSettings rows={rows} me={user.email} domain={config.domain} />;
}
