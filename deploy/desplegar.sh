#!/usr/bin/env bash
# Publica a mano una versión de rud1 Mail en el servidor de correo (mail.rud1.es).
#
# Normalmente no hace falta: cada push a master pasa las comprobaciones de la
# CI, sale su imagen y el agente del servidor (deploy/rud1-mail-deploy) la
# publica solo en el minuto siguiente, con vuelta atrás automática si falla.
#
#   deploy/desplegar.sh                     # la última de master (si no está retirada)
#   deploy/desplegar.sh master-<commit>     # una versión concreta (etiqueta de ghcr.io)
#   deploy/desplegar.sh rollback            # volver a la anterior
#
# Para dejar fija una versión concreta, pausa antes los automáticos:
#   ssh -i ~/.ssh/rud1-mail debian@51.83.131.131 sudo rud1-mail-deploy auto off
#
# Necesita la llave SSH ~/.ssh/rud1-mail. El servidor se prepara una sola vez
# con deploy/instalar-servidor.sh.

set -euo pipefail

HOST="${RUD1_MAIL_HOST:-debian@51.83.131.131}"
KEY="${RUD1_MAIL_KEY:-$HOME/.ssh/rud1-mail}"
SSH=(ssh -i "$KEY" -o ServerAliveInterval=30 "$HOST")
REF="${1:-master}"

if [ "$REF" = rollback ]; then
  echo "==> Volviendo a la versión anterior en $HOST"
  "${SSH[@]}" "sudo rud1-mail-deploy rollback"
  exit
fi

[[ "$REF" =~ ^[A-Za-z0-9._-]{1,128}$ ]] || { echo "Versión no válida: $REF" >&2; exit 1; }
echo "==> Publicando $REF en $HOST (descarga, arranque, cambio de tráfico y 5 min de vigilancia)"
"${SSH[@]}" "sudo rud1-mail-deploy deploy $REF"
