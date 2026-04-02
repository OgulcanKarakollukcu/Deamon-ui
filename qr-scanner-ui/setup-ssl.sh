#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SSL_DIR="${ROOT_DIR}/ssl"
LOCAL_IP="$(hostname -I | awk '{print $1}')"

if [[ -z "${LOCAL_IP}" ]]; then
  echo "Could not detect local IP. Certificate generation aborted."
  exit 1
fi

echo "Setting up SSL certificates for development..."
echo "Detected local IP: ${LOCAL_IP}"

mkdir -p "${SSL_DIR}"

openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout "${SSL_DIR}/key.pem" \
  -out "${SSL_DIR}/cert.pem" \
  -subj "/C=TR/ST=Development/L=Local/O=Dev/CN=localhost" \
  -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:${LOCAL_IP}"

chmod 600 "${SSL_DIR}/key.pem"
chmod 644 "${SSL_DIR}/cert.pem"

echo
echo "SSL certificates generated successfully."
echo "Files created:"
echo "  - ${SSL_DIR}/cert.pem"
echo "  - ${SSL_DIR}/key.pem"
echo
echo "Next steps:"
echo "1. Start Vite dev server (localhost only):"
echo "   npm run dev"
echo
echo "2. Start nginx SSL reverse proxy:"
echo "   sudo nginx -c ${ROOT_DIR}/nginx-dev-ssl.conf -g 'daemon off;'"
echo
echo "3. Access from local network:"
echo "   https://${LOCAL_IP}/qr-demo"
echo "   https://${LOCAL_IP}:8443/qr-demo"
echo
echo "Warning: This is a self-signed certificate; browser warning is expected."
