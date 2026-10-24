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
#   4. Construye la imagen nueva y la arranca en la copia que está parada (a o b),
#      junto a la que sirve. Si no llega a responder, se para y no cambia nada.
#   5. Cuando responde, Nginx pasa a ella (recarga sin cortar nada) y la vieja
#      se para. Así nunca hay un momento sin servicio.

set -euo pipefail

HOST="${RUD1_MAIL_HOST:-debian@51.83.131.131}"
KEY="${RUD1_MAIL_KEY:-$HOME/.ssh/rud1-mail}"
# Las dos copias (deploy/docker-compose.yml): a y b.
IP_A="172.22.1.240"
IP_B="172.22.1.241"
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

echo "==> Construyendo la versión nueva"
"${SSH[@]}" "sudo COMMIT=$COMMIT IP_A=$IP_A IP_B=$IP_B bash -s" <<'REMOTE'
set -euo pipefail
cd /opt/rud1-mail
# Qué copia sirve ahora. Sin marca, la de antes de las copias (el contenedor
# "rud1-mail", en la IP de la a): la nueva va a la b.
ACTIVE=$(cat SLOT 2>/dev/null || echo a)
if [ "$ACTIVE" = a ]; then NEXT=b; else NEXT=a; fi
echo "$NEXT" > SLOT.next
docker build --pull -q --build-arg BUILD_ID="$COMMIT" -t "rud1-mail:$NEXT" app >/dev/null
docker compose up -d --no-deps --force-recreate "rud1-mail-$NEXT" 2>&1 | grep -v -i orphan || true
echo "   copia $NEXT arrancando (sirve la $ACTIVE)"
REMOTE

NEXT=$("${SSH[@]}" "cat /opt/rud1-mail/SLOT.next")
echo "==> Esperando a que la copia $NEXT responda"
if ! "${SSH[@]}" "for i in \$(seq 1 60); do sudo docker exec rud1-mail-$NEXT wget -qO- http://127.0.0.1:3100/entrar >/dev/null 2>&1 && echo '   en marcha' && exit 0; sleep 2; done; exit 1"; then
  echo "   La versión nueva no responde: se para y se sigue con la de antes (sin corte)." >&2
  "${SSH[@]}" "sudo docker logs --tail 40 rud1-mail-$NEXT; cd /opt/rud1-mail && sudo docker compose stop rud1-mail-$NEXT >/dev/null 2>&1; rm -f SLOT.next" || true
  exit 1
fi

echo "==> Pasando el tráfico a la copia $NEXT"
"${SSH[@]}" "sudo NEXT=$NEXT IP_A=$IP_A IP_B=$IP_B bash -s" <<'REMOTE'
set -euo pipefail
NGX=/opt/mailcow-dockerized/data/conf/nginx
if [ "$NEXT" = a ]; then IP=$IP_A; else IP=$IP_B; fi
cp "$NGX/rud1mail.destino" "$NGX/rud1mail.destino.antes" 2>/dev/null || true
printf '# Copia de rud1 Mail que sirve ahora (la escribe deploy/desplegar.sh).\nset $rud1mail http://%s:3100;\n' "$IP" > "$NGX/rud1mail.destino"
cp /opt/rud1-mail/app/deploy/site.rud1mail.custom "$NGX/site.rud1mail.custom"
cp /opt/rud1-mail/app/deploy/rud1mail.proxy "$NGX/rud1mail.proxy"
cd /opt/mailcow-dockerized
if docker compose exec -T nginx-mailcow nginx -t </dev/null >/dev/null 2>&1; then
  # Recargar no corta nada: las peticiones en curso terminan en la copia vieja.
  docker compose exec -T nginx-mailcow nginx -s reload </dev/null >/dev/null 2>&1
  echo "   Nginx apunta a la copia $NEXT ($IP)"
else
  echo "   La configuración de Nginx falla: se deja como estaba" >&2
  docker compose exec -T nginx-mailcow nginx -t </dev/null 2>&1 | tail -3 >&2 || true
  mv "$NGX/rud1mail.destino.antes" "$NGX/rud1mail.destino" 2>/dev/null || true
  exit 1
fi

cd /opt/rud1-mail
# Un momento para que terminen las peticiones que iban a la vieja; luego se para.
# El canal en tiempo real de las pestañas abiertas se reconecta solo a la nueva
# y, al ver otra versión, la página se recarga sola.
sleep 8
if docker ps -a --format '{{.Names}}' | grep -qx rud1-mail; then
  docker rm -f rud1-mail >/dev/null
fi
OLD=$([ "$NEXT" = a ] && echo b || echo a)
docker compose stop "rud1-mail-$OLD" >/dev/null 2>&1 || true
mv SLOT.next SLOT
docker image prune -f >/dev/null 2>&1 || true
echo "   copia $OLD parada"
REMOTE

echo "==> Listo: https://mail.rud1.es ($COMMIT)"
