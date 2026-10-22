import { isAdmin } from "@/lib/admin";
import { requireUser } from "@/lib/session";

import { SettingsNav } from "./settings-nav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-6 p-4 md:p-8">
        <SettingsNav isAdmin={isAdmin(user.email)} />
        {children}
      </div>
    </div>
  );
}
