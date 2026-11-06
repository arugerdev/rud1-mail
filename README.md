# rud1 Mail

Bandeja de correo de rud1 en `mail.rud1.es`, con el aspecto del panel de rud1.

Mailcow (en el mismo servidor) hace el trabajo de fondo: recibe, guarda,
filtra el spam y envía. rud1 Mail es solo la cara: habla con los buzones por
IMAP, envía por SMTP con el usuario de cada uno y usa la API de Mailcow para
la contraseña.

Plan completo y fases: `PLAN_CORREO.md` en la carpeta del proyecto rud1.

## Qué hace (fase 2)

- Entrada con dirección y contraseña de correo; solo direcciones `@rud1.es`.
- Contraseña provisional: obliga a cambiarla en la primera entrada.
- Carpetas con contadores, lista paginada, búsqueda.
- Lectura segura de correos HTML: saneados, en un marco sin scripts y sin
  cargar nada de fuera hasta que se pulsa "Mostrar imágenes".
- Redactar, responder, responder a todos, reenviar (con los adjuntos del
  original), adjuntar archivos (hasta 25 MB), borradores.
- Archivar, spam / no es spam, papelera, borrar para siempre, mover, destacar,
  marcar como leído o no leído, acciones sobre varios a la vez.
- Se actualiza sola cada minuto y al volver a la pestaña. Funciona en el móvil.

Además:
- **Tiempo real**: canal de eventos con IMAP IDLE (`/api/eventos`); el correo nuevo
  aparece al momento, con aviso de escritorio y sonido opcional.
- **Redactor con formato** (TipTap): negrita, listas, citas, enlaces, colores,
  alineación; destinatarios como chips con autocompletado (equipo + contactos
  aprendidos), guardado automático y **vista previa** exacta de lo que se envía.
  Modo **HTML** para diseños con tablas (campañas): se pega o se abre un `.html`,
  las imágenes `data:` viajan dentro del correo (cid:) y el borrador se reabre en HTML.
  En cada mensaje se puede **quitar o cambiar la cabecera, la firma y el pie** solo
  para ese envío (botón «Cabecera, firma y pie»), sin tocar los de siempre.
- **Perfil**: nombre, puesto, departamento, teléfono, foto, firma con
  variables y preferencias (avisos, sonido, lista compacta).
- **Administración** (Álvaro y Manuel, `ADMIN_EMAILS`): cabecera y pie
  corporativos con variables, buzones (crear, desactivar, contraseña
  provisional, enviar en nombre de, borrar) y direcciones (alias).

Datos propios (perfiles, fotos, firmas, plantillas, contactos, borradores) en
SQLite: `/data/rud1-mail.db` en el contenedor (volumen `rud1-mail-data`).
En desarrollo, `DATA_DIR` fuera de la carpeta del proyecto.

- **Buzones comunes**: quien tiene permiso los ve en su barra lateral (con
  contador, carpetas y avisos de correo nuevo) y responde como ellos; la copia
  queda en el Enviados del buzón común. Administración → Buzones comunes decide
  quién los ve (permisos IMAP, valen también en el móvil y Outlook) y quién
  envía como ellos. rud1 Mail cambia esos permisos con el usuario maestro de
  Dovecot (`DOVECOT_MASTER_USER/PASS`), que solo existe en el servidor.

## App instalable

rud1 Mail es una PWA: se instala desde el propio navegador, sin tiendas.

| Sistema | Cómo se instala |
|---|---|
| Windows, macOS, Linux, ChromeOS | Chrome o Edge: botón **Instalar** arriba (o el icono de instalar de la barra de direcciones). Queda en el menú Inicio / Launchpad / Dock con su propia ventana. |
| Android | Chrome: **Instalar** (o menú ⋮ → Instalar aplicación). |
| iPhone / iPad | Safari: **Compartir → Añadir a pantalla de inicio** (la app lo explica desde el menú de la cuenta). |

Con la app instalada:
- Contador de correos sin leer en el icono (barra de tareas, Dock; no en Firefox).
- Avisos de correo nuevo mientras la app está abierta, aunque esté en segundo
  plano (se activan desde el menú de la cuenta).
- Accesos directos al pulsar el icono con el botón derecho: Redactar y Bandeja.
- Puede ser la app de correo predeterminada para los enlaces `mailto:`
  (Windows: Configuración → Aplicaciones → Aplicaciones predeterminadas).
- Sin conexión enseña una página propia. El correo **no** se guarda en el
  dispositivo: solo el código y los iconos de la app.

Los iconos salen de `public/favicon.svg` con `node scripts/generate-icons.mjs`.

## App de escritorio con instalador

Además de la PWA, hay instaladores clásicos (`.exe`, `.dmg`, `.AppImage`,
`.deb`) en [`desktop/`](desktop/README.md): una ventana propia que abre
mail.rud1.es, con bandeja del sistema, contador y enlaces `mailto:`. Los
genera GitHub Actions para los tres sistemas.
La instalación necesita HTTPS: funciona en `mail.rud1.es` y en `localhost`.

## Desarrollo

```bash
cp .env.example .env.local   # rellena MAILCOW_API_KEY y SESSION_SECRET
ssh -i ~/.ssh/rud1-mail -N -L 8443:127.0.0.1:443 debian@51.83.131.131   # túnel a la API
npm install
npm run dev                  # http://localhost:3100
```

Para probar hay un buzón `prueba@rud1.es` (su contraseña está en
`secretos/correo-cuentas.txt`). No uses buzones reales para probar.

Comprobaciones: `npm run typecheck`, `npm run lint`, `npm test`.

## Despliegue (mail.rud1.es)

rud1 Mail corre en el servidor de correo (VPS de OVH), dentro de la red interna
de Mailcow, en dos copias que se turnan (`a` en `172.22.1.240`, `b` en
`172.22.1.241`). El Nginx de Mailcow le pasa solo sus rutas
(`deploy/site.rud1mail.custom`); Mailcow sigue sirviendo `/admin`,
`/domainadmin`, `/SOGo`, la API, Autodiscover y ActiveSync.

### Cómo sale una versión

```
push a master ─> CI (tipos, lint, tests) ─> imagen en ghcr.io/arugerdev/rud1-mail
                                                        │
servidor: vigía cada minuto ─ ve la imagen nueva ─ la arranca en la copia libre
   ─ comprueba /api/salud (versión y base de datos) y /entrar ─ aplica sus rutas
   de Nginx y le pasa el tráfico ─ la vigila 5 min con la anterior todavía
   arrancada ─ si algo falla, el tráfico vuelve solo a la anterior
```

| Rama | Qué pasa |
|---|---|
| `develop` | Solo las comprobaciones. No toca el servidor. |
| `master` | Comprobaciones, imagen y publicación automática en mail.rud1.es. |

- **Vuelta atrás automática.** Si la versión nueva no arranca sana en 3 minutos,
  si Nginx rechaza sus rutas, o si durante la vigilancia se cae o deja de
  responder, el tráfico sigue (o vuelve) en la anterior. Esa versión queda
  **retirada**: el vigía no la reinstala. En cuanto se publica otra, sigue solo.
- **Sin cortes.** La versión nueva arranca junto a la que sirve y Nginx pasa a
  ella con una recarga. Las pestañas abiertas se reconectan y, al ver otra
  versión, se recargan solas.
- **Si deja de responder** 3 minutos, el vigía la reinicia; si a los 10 sigue
  igual, avisa para mirarlo a mano.
- **Avisos.** Fallos, vueltas atrás y reinicios llegan a los owners en el panel
  (campana y push) y por correo, a través de www.rud1.es
  (`/api/v1/correo/despliegues`). Si la web no contesta, el servidor manda el
  correo él mismo con el Postfix de Mailcow a `AVISOS_CORREOS`.
- **Lo que viaja con cada versión.** La imagen lleva `deploy/` (rutas de Nginx y
  definición de las copias): una página nueva sale con su ruta. Las variables
  (`/opt/rud1-mail/.env`) no viajan: una nueva se añade a mano antes.

Estado, historial, registros y volver atrás: **admin.rud1.es/despliegues**
(bloque «Correo»).

### Día a día

Todo con `sudo` en el servidor; las respuestas son JSON (`| jq`).

| Para | Orden |
|---|---|
| Ver qué hay en marcha | `rud1-mail-deploy status` |
| Últimos sucesos | `rud1-mail-deploy history 20` |
| Registro de la app | `rud1-mail-deploy logs correo 200` |
| Volver a la versión anterior | `rud1-mail-deploy rollback` |
| Publicar una versión concreta | `rud1-mail-deploy deploy master-<commit>` |
| Pausar / reanudar los automáticos | `rud1-mail-deploy auto off` / `auto on` |
| Permitir otra vez una versión retirada | `rud1-mail-deploy unpin` |

Desde este equipo, `deploy/desplegar.sh [master-<commit>|rollback]` hace lo
mismo por SSH.

### Montar el servidor

Una vez (y otra si cambia el agente; se puede repetir):

```bash
GHCR_TOKEN_FILE=~/ghcr-token AVISOS_CORREOS=a@rud1.es,b@rud1.es bash deploy/instalar-servidor.sh
```

`ghcr-token` es un token de GitHub que solo tiene `read:packages`. El script
instala el agente y su vigía, crea `/opt/rud1-mail/.env` la primera vez (clave
de sesión y clave de la API), deja a Mailcow preparado (API abierta a las IP de
las copias, Dovecot recibe la IP real de quien entra para que los bloqueos
vayan al atacante, y el cortafuegos no bloquea nunca a rud1 Mail) y crea la
llave del panel: solo desde el servidor web y solo para consultar y volver
atrás. Lo que hay que poner en la web lo deja en `secretos/correo-despliegues.env`:
las `RUD1_MAIL_DEPLOY_AGENT_*` en el `app.env` de admin y
`RUD1_MAIL_DEPLOY_EVENTS_SECRET` en el de producción.

| Ruta | Qué es |
|---|---|
| `/usr/local/bin/rud1-mail-deploy` | El agente |
| `/etc/rud1-mail-deploy/agente.conf` | Secreto de los avisos y correos de emergencia |
| `/var/lib/rud1-mail-deploy/historial.jsonl` | Todo lo que ha pasado |
| `/opt/rud1-mail/.env` | Variables de la app (secretos) |
| `/opt/rud1-mail/SLOT` | Copia que sirve ahora (`a` o `b`) |

### Paneles de Mailcow

Cerrados a internet (`deploy/site.rud1mail.custom`): `/admin`, `/domainadmin`
y ActiveSync devuelven 404 y SOGo está desactivado (`SKIP_SOGO=y`). Para entrar en la
administración de Mailcow, por túnel SSH:

```bash
ssh -i ~/.ssh/rud1-mail -N -L 9443:127.0.0.1:443 debian@51.83.131.131
# y en el navegador: https://localhost:9443/admin/ (avisará del certificado)
```

No usar Vercel: la API de Mailcow solo responde desde el propio servidor, los
adjuntos pasan de su límite y las IP compartidas acabarían bloqueadas.

## Seguridad

- La sesión va en una cookie cifrada (iron-session) que caduca a las 12 horas.
- 5 intentos fallidos en 15 minutos bloquean 15 minutos, por IP y por
  dirección. Además, Mailcow bloquea en el cortafuegos.
- Los adjuntos siempre se descargan; nunca se abren dentro de la aplicación.
- La API de Mailcow solo responde desde el propio servidor.
