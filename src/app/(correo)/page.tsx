import type { Metadata } from "next";

import { folderSpecialUse, getMessage, listMessages } from "@/lib/mail/messages";
import { listFolders } from "@/lib/mail/folders";
import { renderMessage } from "@/lib/mail/render";
import { getProfile } from "@/lib/profiles";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

import { EmptyViewer, MessageList } from "./message-list";
import { MessageView } from "./message-view";
import { PasswordChangedToast } from "./password-changed-toast";

export const metadata: Metadata = { title: "Correo" };

interface PageProps {
  searchParams: Promise<{
    carpeta?: string;
    pagina?: string;
    buscar?: string;
    mensaje?: string;
    imagenes?: string;
    contrasena?: string;
  }>;
}

export default async function MailPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const folders = await listFolders(user);
  const requested = params.carpeta ?? "INBOX";
  // Solo carpetas que existen en el buzón: la URL no puede abrir otra cosa.
  const folder = folders.some((f) => f.path === requested) ? requested : "INBOX";
  const page = Math.max(1, Number.parseInt(params.pagina ?? "1", 10) || 1);
  const query = (params.buscar ?? "").slice(0, 200);
  const selected = Number.parseInt(params.mensaje ?? "", 10) || null;

  // Primero el mensaje abierto (lo marca como leído) y después la lista, para
  // que ya salga leído en ella.
  const detail = selected ? await getMessage(user, folder, selected, { markSeen: true }) : null;
  const [list, specialUse] = await Promise.all([
    listMessages(user, folder, { page, query }),
    folderSpecialUse(user, folder),
  ]);

  const prefs = getProfile(user.email, user.name).prefs;
  // Al archivar o borrar el abierto, se pasa al siguiente de la lista (o al anterior si era el último).
  const index = detail ? list.items.findIndex((m) => m.uid === detail.uid) : -1;
  const nextUid = prefs.openNext && index >= 0 ? (list.items[index + 1] ?? list.items[index - 1])?.uid ?? null : null;

  const rendered = detail ? renderMessage(detail, { allowRemote: params.imagenes === "1" }) : null;

  return (
    <>
      <PasswordChangedToast show={params.contrasena === "cambiada"} />
      <section
        className={cn(
          "flex min-h-0 w-full flex-col border-r border-border/40 lg:w-[380px] lg:shrink-0 xl:w-[440px]",
          detail && "hidden lg:flex",
        )}
      >
        <MessageList
          folder={folder}
          folderName={folders.find((f) => f.path === folder)?.name ?? folder}
          specialUse={specialUse}
          list={list}
          query={query}
          selectedUid={detail?.uid ?? null}
          compact={prefs.density === "compacta"}
        />
      </section>
      <section className={cn("min-h-0 min-w-0 flex-1", !detail && "hidden lg:flex")}>
        {detail && rendered ? (
          <MessageView
            key={`${folder}:${detail.uid}`}
            // El HTML y las imágenes ya van dentro del documento pintado: no
            // hace falta mandarlos dos veces al navegador.
            detail={{ ...detail, html: null, inlineImages: {} }}
            document={rendered.document}
            hasRemoteContent={rendered.hasRemoteContent}
            remoteAllowed={params.imagenes === "1"}
            specialUse={specialUse}
            folders={folders}
            page={page}
            query={query}
            nextUid={nextUid}
          />
        ) : (
          <EmptyViewer notFound={Boolean(selected)} />
        )}
      </section>
    </>
  );
}
