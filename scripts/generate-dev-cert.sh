#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p nginx/certs
command -v openssl >/dev/null 2>&1 || { echo "OpenSSL is required" >&2; exit 1; }
umask 077
openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 365 \
  -keyout nginx/certs/nginx.key \
  -out nginx/certs/nginx.crt \
  -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"
chmod 600 nginx/certs/nginx.key
echo "Generated a local-only self-signed certificate in nginx/certs/."
echo "Do not use this certificate or key in production."
