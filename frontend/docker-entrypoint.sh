#!/bin/sh
set -e

# Use PORT from environment (Railway, etc.) or default to 80 for local Docker
PORT="${PORT:-80}"

# Substitute PORT into nginx config
sed "s/\${PORT}/$PORT/g" /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'