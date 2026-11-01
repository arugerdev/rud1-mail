# rud1 Mail — imagen para el servidor de correo (junto a Mailcow).
# Se compila en modo "standalone": la imagen final solo lleva lo necesario.

FROM node:22-alpine AS deps
WORKDIR /app
# Por si better-sqlite3 no trae binario para Alpine: así se compila.
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Versión (el commit): las pestañas abiertas la comparan y se recargan solas al cambiar.
ARG BUILD_ID=dev
ENV NEXT_TELEMETRY_DISABLED=1     NEXT_PUBLIC_BUILD_ID=$BUILD_ID
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/data \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3100 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Lo que el agente de despliegues aplica junto con esta versión: las rutas de
# Nginx y la definición de las dos copias (deploy/rud1-mail-deploy).
COPY --chown=node:node deploy/docker-compose.yml deploy/site.rud1mail.custom deploy/rud1mail.proxy ./deploy/
# Base de datos propia (perfiles, firmas, plantillas, contactos): va en un volumen.
RUN mkdir -p /data /files && chown node:node /data /files
# El commit de la imagen: el agente lo compara con lo que dice /api/salud.
ARG BUILD_ID=dev
LABEL org.opencontainers.image.revision=$BUILD_ID
USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3100/api/salud >/dev/null || exit 1
CMD ["node", "server.js"]
