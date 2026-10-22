#!/usr/bin/env bash
# Despliega rud1 Mail en el servidor de correo (mail.rud1.es).
#
#   deploy/desplegar.sh            # despliega lo que hay en la rama actual (HEAD)
#
# Necesita la llave SSH ~/.ssh/rud1-mail. Es idempotente: se puede repetir.
# Lo que hace en el servidor:
#   1. Copia el código (git archive, sin node_modules ni secretos) a /opt/rud1-mail/app.
#   2. Crea /opt/rud1-mail/.env la primera vez (clave de sesión nueva y la clave de la API).
#   3. Deja a Mailcow preparado: API abierta a la IP de rud1 Mail, Dovecot confía
#      en ella para conocer la IP real de quien entra, y el cortafuegos no la bloquea.
#   4. Construye la imagen y arranca el contenedor.
#   5. Instala las rutas en el Nginx de Mailcow y lo recarga (comprobando antes la configuración).

set -euo pipefail

HOST="${RUD1_MAIL_HOST:-debian@51.83.131.131}"
KEY="${RUD1_MAIL_KEY:-$HOME/.ssh/rud1-mail}"
APP_IP="172.22.1.240"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH=(ssh -i "$KEY" -o ServerAliveInterval=30 "$HOST")

cd "$ROOT"
if [ -n "$(git status --porcelain)" ]; then
  echo "Hay cambios sin guardar en git: se despliega el último commit, no lo que hay en disco." >&2
fi
COMMIT="$(git rev-parse --short HEAD)"
echo "==> Desplegando rud1 Mail ($COMMIT) en $HOST"

echo "==> Copiando el código"
"${SSH[@]}" "sudo mkdir -p /opt/rud1-mail && sudo rm -rf /opt/rud1-mail/app.new && sudo mkdir -p /opt/rud1-mail/app.new"
git archive --format=tar HEAD -- . ':(exclude)desktop' ':(exclude).github' | "${SSH[@]}" "sudo tar -x -C /opt/rud1-mail/app.new"
"${SSH[@]}" "sudo rm -rf /opt/rud1-mail/app && sudo mv /opt/rud1-mail/app.new /opt/rud1-mail/app && sudo cp /opt/rud1-mail/app/deploy/docker-compose.yml /opt/rud1-mail/docker-compose.yml && echo $COMMIT | sudo tee /opt/rud1-mail/VERSION >/dev/null"

echo "==> Preparando el servidor"
"${SSH[@]}" "sudo APP_IP=$APP_IP bash -s" <<'REMOTE'
set -euo pipefail
MC=/opt/mailcow-dockerized
cd "$MC"

# 1. Variables de rud1 Mail (solo la primera vez: la clave de sesión no cambia en cada despliegue).
if [ ! -f /opt/rud1-mail/.env ]; then
  KEY=$(grep '^API_KEY=' mailcow.conf | cut -d= -f2)
  umask 077
  {
    echo "SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
    echo "MAILCOW_API_KEY=$KEY"
  } > /opt/rud1-mail/.env
  echo "   .env creado"
fi

# 1b. Agenda (la de admin.rud1.es): secreto compartido entre los dos servidores.
#     Se crea una sola vez; el mismo valor va en rud1-es como RUD1_MAIL_AGENDA_SECRET.
if ! grep -q "^AGENDA_API_SECRET=" /opt/rud1-mail/.env; then
  AS=$(openssl rand -base64 64 | tr -dc 'A-Za-z0-9' | head -c 64)
  {
    echo "AGENDA_API_URL=https://www.rud1.es/api/v1/correo/agenda"
    echo "AGENDA_API_SECRET=$AS"
  } >> /opt/rud1-mail/.env
  echo "   Agenda: secreto creado (va también en rud1-es como RUD1_MAIL_AGENDA_SECRET)"
fi

# 2. La API de Mailcow también responde a rud1 Mail.
RESTART_MAILCOW=0
if ! grep -q "^API_ALLOW_FROM=.*$APP_IP" mailcow.conf; then
  sed -i -E "s|^(API_ALLOW_FROM=.*)$|\1,$APP_IP|" mailcow.conf
  RESTART_MAILCOW=1
  echo "   API_ALLOW_FROM ampliado"
fi

# 3. Dovecot se fía de rud1 Mail para conocer la IP real de quien entra (x-originating-ip).
EXTRA=data/conf/dovecot/extra.conf
if ! grep -qs "login_trusted_networks.*$APP_IP" "$EXTRA"; then
  printf '# rud1 Mail pasa la IP real de quien entra; los bloqueos van a esa IP.\nlogin_trusted_networks = %s\n' "$APP_IP" >> "$EXTRA"
  docker compose restart dovecot-mailcow >/dev/null
  echo "   Dovecot: rud1 Mail como red de confianza"
fi

# 3a. Usuario maestro de Dovecot: rud1 Mail lo usa para decidir quién ve cada
#     buzón común (permisos IMAP). Mailcow lo guarda como <usuario>@mailcow.local.
if ! grep -qE "^DOVECOT_MASTER_USER=.+" mailcow.conf; then
  MP=$(tr -dc A-Za-z0-9 </dev/urandom | head -c 40)
  sed -i "s/^DOVECOT_MASTER_USER=.*/DOVECOT_MASTER_USER=rud1mail/; s/^DOVECOT_MASTER_PASS=.*/DOVECOT_MASTER_PASS=$MP/" mailcow.conf
  RESTART_MAILCOW=1
  echo "   Usuario maestro de Dovecot creado"
fi
if ! grep -q "^DOVECOT_MASTER_USER=" /opt/rud1-mail/.env; then
  MU=$(grep "^DOVECOT_MASTER_USER=" mailcow.conf | cut -d= -f2)
  MP=$(grep "^DOVECOT_MASTER_PASS=" mailcow.conf | cut -d= -f2)
  printf "DOVECOT_MASTER_USER=%s@mailcow.local\nDOVECOT_MASTER_PASS=%s\n" "$MU" "$MP" >> /opt/rud1-mail/.env
fi

# 3b. Sin SOGo: no se usa (rud1 Mail es el webmail) y es superficie de ataque.
if ! grep -q "^SKIP_SOGO=y" mailcow.conf; then
  sed -i "s/^SKIP_SOGO=.*/SKIP_SOGO=y/" mailcow.conf
  RESTART_MAILCOW=1
  echo "   SOGo desactivado"
fi

if [ "$RESTART_MAILCOW" = 1 ]; then
  docker compose up -d >/dev/null 2>&1
fi

# 4. El cortafuegos de Mailcow nunca bloquea a rud1 Mail.
WL=$(mc-api GET get/fail2ban | jq -r '.whitelist // ""')
if ! printf '%s' "$WL" | grep -q "$APP_IP"; then
  NEW=$(printf '%s\n%s/32' "$WL" "$APP_IP" | sed '/^$/d' | paste -sd ',' -)
  mc-api POST edit/fail2ban "$(jq -nc --arg wl "$NEW" '{items:["none"],attr:{whitelist:$wl}}')" | jq -r '.[0].type'
  echo "   rud1 Mail en la lista blanca del cortafuegos"
fi
REMOTE

echo "==> Construyendo y arrancando el contenedor"
"${SSH[@]}" "cd /opt/rud1-mail && sudo docker compose build --pull -q && sudo docker compose up -d --remove-orphans"

echo "==> Esperando a que responda"
"${SSH[@]}" 'for i in $(seq 1 30); do sudo docker exec rud1-mail wget -qO- http://127.0.0.1:3100/entrar >/dev/null 2>&1 && echo "   en marcha" && exit 0; sleep 2; done; echo "   no responde" >&2; sudo docker logs --tail 40 rud1-mail; exit 1'

echo "==> Conectando el Nginx de Mailcow"
"${SSH[@]}" "sudo bash -s" <<'REMOTE'
set -euo pipefail
NGX=/opt/mailcow-dockerized/data/conf/nginx
cp /opt/rud1-mail/app/deploy/site.rud1mail.custom "$NGX/site.rud1mail.custom"
cp /opt/rud1-mail/app/deploy/rud1mail.proxy "$NGX/rud1mail.proxy"
cd /opt/mailcow-dockerized
if docker compose exec -T nginx-mailcow nginx -t </dev/null 2>&1 | tail -2; then
  docker compose exec -T nginx-mailcow nginx -s reload </dev/null
  echo "   Nginx recargado"
else
  echo "   La configuración de Nginx falla: se retiran las rutas de rud1 Mail" >&2
  rm -f "$NGX/site.rud1mail.custom"
  exit 1
fi
REMOTE

echo "==> Listo: https://mail.rud1.es ($COMMIT)"
