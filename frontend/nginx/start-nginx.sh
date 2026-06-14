#!/bin/sh
set -e
DOMAIN="${DOMAIN:-localhost}"
CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
CONF="/etc/nginx/conf.d/default.conf"
if [ -f "$CERT" ]; then
  echo "[nginx] HTTPS mode"
  envsubst '${DOMAIN}' < /etc/nginx/templates/default-https.conf.template > "$CONF"
else
  echo "[nginx] HTTP mode"
  envsubst '${DOMAIN}' < /etc/nginx/templates/default-http.conf.template > "$CONF"
fi
exec nginx -g 'daemon off;'
