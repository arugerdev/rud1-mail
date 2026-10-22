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
- **Perfil**: nombre, puesto, departamento, teléfono, foto, firma con
  variables y preferencias (avisos, sonido, lista compacta).
- **Administración** (Álvaro y Manuel, `ADMIN_EMAILS`): cabecera y pie
  corporativos con variables, buzones (crear, desactivar, contraseña
  provisional, enviar en nombre de, borrar) y direcciones (alias).

Datos propios (perfiles, fotos, firmas, plantillas, contactos, borradores) en
SQLite: `/data/rud1-mail.db` en el contenedor (volumen `rud1-mail-data`).
En desarrollo, `DATA_DIR` fuera de la carpeta del proyecto.

Pendiente: ver los buzones comunes dentro de rud1 Mail según permisos (fase 3).

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

rud1 Mail corre en el servidor de correo (VPS de OVH), en un contenedor dentro
de la red interna de Mailcow (IP fija `172.22.1.240`). El Nginx de Mailcow le
pasa solo sus rutas (`deploy/site.rud1mail.custom`); Mailcow sigue sirviendo
`/admin` (administración), `/domainadmin`, `/SOGo`, la API, Autodiscover y
ActiveSync.

```bash
bash deploy/desplegar.sh     # despliega el último commit de la rama actual
```

El script copia el código, construye la imagen en el servidor, arranca el
contenedor y recarga Nginx (comprobando antes la configuración). La primera
vez crea `/opt/rud1-mail/.env` (clave de sesión y clave de la API) y deja a
Mailcow preparado: API abierta a esa IP, Dovecot recibe la IP real de quien
entra (para que los bloqueos vayan al atacante) y el cortafuegos no bloquea
nunca a rud1 Mail.

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
