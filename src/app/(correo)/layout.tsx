import { can } from "@/lib/access";
import { isAdmin } from "@/lib/admin";
import { teamDirectory } from "@/lib/contacts";
import { listFolders } from "@/lib/mail/folders";
import { getMailbox, mailcowAvailable } from "@/lib/mailcow";
import { avatarVersions, fullName, getProfile } from "@/lib/profiles";
import { requireUser } from "@/lib/session";

import { AvatarProvider } from "./avatar";
import { ComposeProvider } from "./compose/compose-provider";
import { MailShell } from "./mail-shell";
import { SoundProvider } from "./sound-provider";

// Correo de cada persona: nunca se guarda en caché.
export const dynamic = "force-dynamic";

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [folders, directory, box] = await Promise.all([
    listFolders(user),
    teamDirectory(),
    mailcowAvailable() ? getMailbox(user.email).catch(() => null) : Promise.resolve(null),
  ]);
  const profile = getProfile(user.email, user.name);
  const name = fullName(profile) !== user.email ? fullName(profile) : user.name;
  const nameOf = (address: string) => directory.find((d) => d.address === address)?.name ?? address;

  const sharedNames = Object.fromEntries(
    [...new Set(folders.filter((f) => f.owner).map((f) => f.owner!))].map((owner) => [owner, nameOf(owner)]),
  );
  // Direcciones desde las que puede enviar: la suya y los buzones comunes permitidos.
  const identities = [
    { address: user.email, name },
    ...(box?.sendAs ?? []).filter((a) => a !== user.email).map((address) => ({ address, name: nameOf(address) })),
  ];

  return (
    <AvatarProvider versions={avatarVersions()}>
      <SoundProvider enabled={profile.prefs.sound} prefs={profile.prefs.sounds}>
        <ComposeProvider userEmail={user.email} identities={identities}>
          <MailShell
            user={{ name, email: user.email }}
            folders={folders}
            prefs={{ notify: profile.prefs.notify }}
            isAdmin={isAdmin(user.email)}
            apps={{ files: can(user.email, "archivos.usar") }}
            sharedNames={sharedNames}
          >
            {children}
          </MailShell>
        </ComposeProvider>
      </SoundProvider>
    </AvatarProvider>
  );
}
