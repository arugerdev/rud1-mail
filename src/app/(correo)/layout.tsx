import { isAdmin } from "@/lib/admin";
import { listFolders } from "@/lib/mail/folders";
import { avatarVersions, fullName, getProfile } from "@/lib/profiles";
import { requireUser } from "@/lib/session";

import { AvatarProvider } from "./avatar";
import { ComposeProvider } from "./compose/compose-provider";
import { MailShell } from "./mail-shell";

// Correo de cada persona: nunca se guarda en caché.
export const dynamic = "force-dynamic";

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const folders = await listFolders(user);
  const profile = getProfile(user.email, user.name);
  const name = fullName(profile) !== user.email ? fullName(profile) : user.name;

  return (
    <AvatarProvider versions={avatarVersions()}>
      <ComposeProvider userEmail={user.email}>
        <MailShell
          user={{ name, email: user.email }}
          folders={folders}
          prefs={{ notify: profile.prefs.notify, sound: profile.prefs.sound }}
          isAdmin={isAdmin(user.email)}
        >
          {children}
        </MailShell>
      </ComposeProvider>
    </AvatarProvider>
  );
}
