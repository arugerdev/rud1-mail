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

Pendiente: buzones comunes (fase 3) y administración (fase 4).

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

## Seguridad

- La sesión va en una cookie cifrada (iron-session) que caduca a las 12 horas.
- 5 intentos fallidos en 15 minutos bloquean 15 minutos, por IP y por
  dirección. Además, Mailcow bloquea en el cortafuegos.
- Los adjuntos siempre se descargan; nunca se abren dentro de la aplicación.
- La API de Mailcow solo responde desde el propio servidor.
