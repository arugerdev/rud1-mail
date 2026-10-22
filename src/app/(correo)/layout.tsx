import { listFolders } from "@/lib/mail/folders";
import { requireUser } from "@/lib/session";

import { ComposeProvider } from "./compose/compose-provider";
import { MailShell } from "./mail-shell";

// Correo de cada persona: nunca se guarda en caché.
export const dynamic = "force-dynamic";

export default async function MailLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const folders = await listFolders(user);

  return (
    <ComposeProvider userEmail={user.email}>
      <MailShell user={{ name: user.name, email: user.email }} folders={folders}>
        {children}
      </MailShell>
    </ComposeProvider>
  );
}
