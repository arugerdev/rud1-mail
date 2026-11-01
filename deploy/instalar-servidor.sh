#!/usr/bin/env bash
# Prepara el servidor de correo (mail.rud1.es) para rud1 Mail y su agente de
# despliegues. Se ejecuta una vez (y otra si cambia el agente); es idempotente.
#
#   GHCR_TOKEN_FILE=~/ghcr-token AVISOS_CORREOS=a@rud1.es,b@rud1.es deploy/instalar-servidor.sh
#
# Necesita la llave SSH ~/.ssh/rud1-mail. Lo que hace en el servidor:
#   1. Instala el agente (/usr/local/bin/rud1-mail-deploy) y su vigia cada minuto.
#   2. Crea /opt/rud1-mail/.env la primera vez y deja a Mailcow preparado: API
#      abierta a rud1 Mail, Dovecot recibe la IP real de quien entra y el
#      cortafuegos no la bloquea nunca.
#   3. Entra en ghcr.io con un token que solo lee paquetes (de ahi salen las
#      versiones que publica la CI de master).
#   4. Crea la llave del panel: solo desde el servidor web y solo el agente
#      (consultar, ver registros y volver atras desde admin.rud1.es/despliegues).
#   5. Guarda en secretos/correo-despliegues.env (fuera del repositorio) lo que
#      hay que poner en los app.env de la web: la llave del panel y el secreto
#      de los avisos.

set -euo pipefail

HOST="${RUD1_MAIL_HOST:-debian@51.83.131.131}"
KEY="${RUD1_MAIL_KEY:-$HOME/.ssh/rud1-mail}"
# Desde aqui llega admin.rud1.es (servidor web) a pedir el estado.
WEB_IP="${RUD1_WEB_IP:-31.70.110.38}"
IP_A="172.22.1.240"
IP_B="172.22.1.241"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SECRETOS="${RUD1_SECRETOS:-$ROOT/../secretos}"
SSH=(ssh -i "$KEY" -o ServerAliveInterval=30 "$HOST")

echo "==> Instalando el agente en $HOST"
"${SSH[@]}" "sudo install -d -m 700 /etc/rud1-mail-deploy && sudo install -d /var/lib/rud1-mail-deploy /opt/rud1-mail"
"${SSH[@]}" "sudo tee /usr/local/bin/rud1-mail-deploy >/dev/null && sudo chmod 755 /usr/local/bin/rud1-mail-deploy" < "$ROOT/deploy/rud1-mail-deploy"
for unidad in rud1-mail-vigia.service rud1-mail-vigia.timer; do
  "${SSH[@]}" "sudo tee /etc/systemd/system/$unidad >/dev/null" < "$ROOT/deploy/systemd/$unidad"
done
if [ -n "${GHCR_TOKEN_FILE:-}" ]; then
  "${SSH[@]}" "sudo install -m 600 /dev/stdin /etc/rud1-mail-deploy/ghcr-token" < "$GHCR_TOKEN_FILE"
fi

echo "==> Preparando Mailcow"
"${SSH[@]}" "sudo APP_IPS='$IP_A $IP_B' bash -s" <<'REMOTE'
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
for APP_IP in $APP_IPS; do
  if ! grep -q "^API_ALLOW_FROM=.*$APP_IP" mailcow.conf; then
    sed -i -E "s|^(API_ALLOW_FROM=.*)$|\1,$APP_IP|" mailcow.conf
    RESTART_MAILCOW=1
    echo "   API_ALLOW_FROM ampliado ($APP_IP)"
  fi
done

# 3. Dovecot se fía de rud1 Mail para conocer la IP real de quien entra (x-originating-ip).
EXTRA=data/conf/dovecot/extra.conf
TRUSTED="login_trusted_networks = $APP_IPS"
if ! grep -qsx "$TRUSTED" "$EXTRA"; then
  if grep -qs "^login_trusted_networks" "$EXTRA"; then
    sed -i "s|^login_trusted_networks.*|$TRUSTED|" "$EXTRA"
  else
    printf '# rud1 Mail pasa la IP real de quien entra; los bloqueos van a esa IP.\n%s\n' "$TRUSTED" >> "$EXTRA"
  fi
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

# 3c. acceso.mail.rud1.es (entrar en otros buzones desde Administración): el
#     certificado y Nginx también responden a ese nombre. El registro DNS va
#     aparte, en Cloudflare (sin proxy), apuntando a este servidor.
ACCESS_NAME=acceso.mail.rud1.es
for VAR in ADDITIONAL_SAN ADDITIONAL_SERVER_NAMES; do
  if ! grep -qE "^$VAR=.*$ACCESS_NAME" mailcow.conf; then
    if grep -qE "^$VAR=.+" mailcow.conf; then
      sed -i -E "s|^($VAR=.+)$|\1,$ACCESS_NAME|" mailcow.conf
    else
      sed -i -E "s|^$VAR=.*$|$VAR=$ACCESS_NAME|" mailcow.conf
    fi
    RESTART_MAILCOW=1
    echo "   $VAR: $ACCESS_NAME"
  fi
done

if [ "$RESTART_MAILCOW" = 1 ]; then
  docker compose up -d >/dev/null 2>&1
fi

# 4. El cortafuegos de Mailcow nunca bloquea a rud1 Mail.
# Si Mailcow se acaba de reiniciar, su API tarda un poco en responder.
for i in $(seq 1 60); do
  mc-api GET get/fail2ban 2>/dev/null | jq -e . >/dev/null 2>&1 && break
  sleep 3
done
for APP_IP in $APP_IPS; do
  WL=$(mc-api GET get/fail2ban | jq -r '.whitelist // ""')
  if ! printf '%s' "$WL" | grep -q "$APP_IP"; then
    NEW=$(printf '%s\n%s/32' "$WL" "$APP_IP" | sed '/^$/d' | paste -sd ',' -)
    mc-api POST edit/fail2ban "$(jq -nc --arg wl "$NEW" '{items:["none"],attr:{whitelist:$wl}}')" | jq -r '.[0].type'
    echo "   rud1 Mail ($APP_IP) en la lista blanca del cortafuegos"
  fi
done
REMOTE

echo "==> Configurando el agente"
"${SSH[@]}" "sudo WEB_IP='$WEB_IP' AVISOS_CORREOS='${AVISOS_CORREOS:-}' bash -s" <<'REMOTE'
set -euo pipefail
CONF=/etc/rud1-mail-deploy
ESTADO=/var/lib/rud1-mail-deploy
NGX=/opt/mailcow-dockerized/data/conf/nginx

command -v jq >/dev/null && command -v curl >/dev/null \
  || { apt-get update -qq && apt-get install -y -qq jq curl >/dev/null; }

# Ajustes del agente: el secreto de los avisos se crea una sola vez (el mismo
# valor va en la web como RUD1_MAIL_DEPLOY_EVENTS_SECRET).
if [ ! -f "$CONF/agente.conf" ]; then
  umask 077
  {
    echo "# rud1-mail-deploy: lo lee el agente en cada ejecucion (README, «Despliegue»)."
    echo "AVISOS_SECRETO=$(openssl rand -hex 32)"
    echo "AVISOS_CORREOS=$AVISOS_CORREOS"
  } > "$CONF/agente.conf"
  echo "   agente.conf creado"
elif [ -n "$AVISOS_CORREOS" ]; then
  sed -i "s|^AVISOS_CORREOS=.*|AVISOS_CORREOS=$AVISOS_CORREOS|" "$CONF/agente.conf"
fi

# Las versiones las publica la CI en ghcr.io (repositorio privado).
if ! grep -qs '"ghcr.io"' /root/.docker/config.json; then
  if [ -s "$CONF/ghcr-token" ]; then
    docker login ghcr.io -u arugerdev --password-stdin < "$CONF/ghcr-token" >/dev/null
    echo "   ghcr.io: sesion iniciada"
  else
    echo "   AVISO: falta $CONF/ghcr-token (token de GitHub solo con read:packages): sin el no se descarga ninguna version" >&2
  fi
fi

# Lo que ya estaba en marcha antes del agente: su version y sus rutas de Nginx,
# para poder volver a ella tal cual.
ACTIVO=$(cat /opt/rud1-mail/SLOT 2>/dev/null || true)
if [ -n "$ACTIVO" ]; then
  [ -f "$ESTADO/release-$ACTIVO" ] || cp /opt/rud1-mail/VERSION "$ESTADO/release-$ACTIVO" 2>/dev/null || true
  if [ ! -d "$ESTADO/nginx-$ACTIVO" ] && [ -f "$NGX/site.rud1mail.custom" ]; then
    mkdir -p "$ESTADO/nginx-$ACTIVO"
    cp "$NGX/site.rud1mail.custom" "$NGX/rud1mail.proxy" "$ESTADO/nginx-$ACTIVO/"
  fi
fi

# Llave del panel: solo desde el servidor web y solo el agente; ni consola ni tuneles.
USUARIO_PANEL=rud1panel
id "$USUARIO_PANEL" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$USUARIO_PANEL"
passwd -l "$USUARIO_PANEL" >/dev/null
[ -f "$CONF/llave-panel" ] || ssh-keygen -q -t ed25519 -N "" -C rud1-mail-panel -f "$CONF/llave-panel"
chmod 600 "$CONF/llave-panel"
CASA_PANEL="$(getent passwd "$USUARIO_PANEL" | cut -d: -f6)"
install -d -o "$USUARIO_PANEL" -g "$USUARIO_PANEL" -m 700 "$CASA_PANEL/.ssh"
printf 'from="%s",command="sudo /usr/local/bin/rud1-mail-deploy panel",restrict %s\n' \
  "$WEB_IP" "$(cat "$CONF/llave-panel.pub")" > "$CASA_PANEL/.ssh/authorized_keys"
chown "$USUARIO_PANEL:$USUARIO_PANEL" "$CASA_PANEL/.ssh/authorized_keys"
chmod 600 "$CASA_PANEL/.ssh/authorized_keys"
cat > /etc/sudoers.d/rud1mailpanel <<SUDO
Defaults:$USUARIO_PANEL env_keep += "SSH_ORIGINAL_COMMAND"
$USUARIO_PANEL ALL=(root) NOPASSWD: /usr/local/bin/rud1-mail-deploy panel
SUDO
chmod 440 /etc/sudoers.d/rud1mailpanel
visudo -c >/dev/null

systemctl daemon-reload
systemctl enable --now rud1-mail-vigia.timer >/dev/null
echo "   vigia en marcha (cada minuto)"
REMOTE

echo "==> Guardando lo que necesita la web en $SECRETOS/correo-despliegues.env"
mkdir -p "$SECRETOS"
umask 077
{
  echo "# En /srv/rud1/admin/app.env (solo admin):"
  echo "RUD1_MAIL_DEPLOY_AGENT_HOST=${HOST#*@}"
} > "$SECRETOS/correo-despliegues.env"
"${SSH[@]}" "sudo bash -s" >> "$SECRETOS/correo-despliegues.env" <<'REMOTE'
set -euo pipefail
CONF=/etc/rud1-mail-deploy
echo "RUD1_MAIL_DEPLOY_AGENT_USER=rud1panel"
echo "RUD1_MAIL_DEPLOY_AGENT_KEY=$(base64 -w0 < "$CONF/llave-panel")"
echo "RUD1_MAIL_DEPLOY_AGENT_HOSTKEY=$(ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub | awk '{print $2}')"
echo "# En /srv/rud1/prod/app.env (www recibe los avisos):"
echo "RUD1_MAIL_DEPLOY_EVENTS_SECRET=$(sed -n 's/^AVISOS_SECRETO=//p' "$CONF/agente.conf")"
REMOTE
echo "==> Listo. El vigia despliega solo cada version nueva de master."
