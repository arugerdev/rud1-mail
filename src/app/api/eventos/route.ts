import { ImapFlow } from "imapflow";

import { config } from "@/lib/config";
import { clientIp } from "@/lib/request";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Canal en tiempo real (Server-Sent Events).
 *
 * Mientras rud1 Mail está abierto, el servidor mantiene una conexión IMAP en
 * espera (IDLE) sobre la bandeja de entrada y avisa al momento de lo que
 * cambia: correo nuevo, leídos, borrados. Además, cada 30 s manda los
 * contadores de todas las carpetas, para lo que cambia desde otros clientes
 * (el móvil, Outlook).
 */

const HEARTBEAT_MS = 25_000;
const COUNTS_MS = 30_000;

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response(null, { status: 401 });

  const ip = await clientIp();
  const encoder = new TextEncoder();
  let closed = false;
  const timers: NodeJS.Timeout[] = [];
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.port === 993,
    servername: config.imap.servername,
    auth: { user: user.email, pass: user.password },
    logger: false,
    clientInfo: { name: "rud1 Mail (tiempo real)", ...(ip ? { "x-originating-ip": ip } : {}) },
  });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };

      const cleanup = () => {
        if (closed) return;
        closed = true;
        timers.forEach(clearInterval);
        client.logout().catch(() => client.close());
        try {
          controller.close();
        } catch {
          // ya cerrado
        }
      };
      request.signal.addEventListener("abort", cleanup);

      try {
        await client.connect();
        await client.mailboxOpen("INBOX", { readOnly: true });
      } catch {
        send("error", { message: "No se pudo abrir el canal en tiempo real" });
        cleanup();
        return;
      }

      // Correo nuevo en la bandeja de entrada.
      client.on("exists", async (info: { count: number; prevCount: number }) => {
        if (info.count <= info.prevCount) return;
        try {
          const last = await client.fetchOne("*", { uid: true, envelope: true });
          const from = last ? last.envelope?.from?.[0] : undefined;
          send("nuevo", {
            uid: last ? last.uid : null,
            from: from ? from.name || from.address || "" : "",
            address: from?.address ?? "",
            subject: last ? last.envelope?.subject?.trim() || "(sin asunto)" : "",
          });
        } catch {
          send("cambio", { motivo: "nuevo" });
        }
      });
      // Leídos, destacados o borrados (desde aquí o desde otro dispositivo).
      client.on("flags", () => send("cambio", { motivo: "marcas" }));
      client.on("expunge", () => send("cambio", { motivo: "borrado" }));
      client.on("close", cleanup);
      client.on("error", cleanup);

      const counts = async () => {
        try {
          const list = await client.list({ statusQuery: { unseen: true, messages: true } });
          send(
            "contadores",
            Object.fromEntries(list.filter((f) => f.status).map((f) => [f.path, { unread: f.status!.unseen ?? 0, total: f.status!.messages ?? 0 }])),
          );
        } catch {
          // Si falla una vuelta, la siguiente lo intenta otra vez.
        }
      };
      // La versión del servidor: si la pestaña es de otra, se recarga sola (version-reload.ts).
      send("listo", { email: user.email, version: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" });
      await counts();
      timers.push(setInterval(() => send("latido", Date.now()), HEARTBEAT_MS));
      timers.push(setInterval(counts, COUNTS_MS));
      // ImapFlow entra solo en IDLE cuando la conexión queda libre.
    },
    cancel() {
      closed = true;
      timers.forEach(clearInterval);
      client.logout().catch(() => client.close());
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Que el Nginx de Mailcow no retenga los eventos.
      "X-Accel-Buffering": "no",
    },
  });
}
