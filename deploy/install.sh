#!/usr/bin/env bash
# Host installation for samba-manager: installs Samba and Node.js, builds the
# console, and registers it as a systemd service.
#
#   sudo ./deploy/install.sh
#
# Environment overrides:
#   INSTALL_DIR   where the app is deployed      (default /opt/samba-manager)
#   SERVICE_USER  account the service runs as    (default root)
#   PORT          web console port               (default 5069)
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-/opt/samba-manager}"
SERVICE_USER="${SERVICE_USER:-root}"
PORT="${PORT:-5069}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ "$(id -u)" -ne 0 ]; then
  echo "This script must run as root (try: sudo $0)" >&2
  exit 1
fi

echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y --no-install-recommends samba samba-common-bin curl ca-certificates

# Node.js 20+ is required; install from NodeSource when the distro package is
# missing or too old.
need_node=1
if command -v node >/dev/null 2>&1; then
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if [ "$major" -ge 20 ]; then need_node=0; fi
fi
if [ "$need_node" -eq 1 ]; then
  echo "==> Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Build as the invoking user, not as root: npm leaves root-owned files in
# node_modules otherwise, and a later rebuild as a normal user then fails with
# EACCES on node_modules/.vite-temp.
BUILD_USER="${SUDO_USER:-}"
if [ -n "$BUILD_USER" ] && [ "$BUILD_USER" != "root" ]; then
  echo "==> Building the application (as $BUILD_USER)"
  chown -R "$BUILD_USER":"$BUILD_USER" "$REPO_DIR"
  sudo -u "$BUILD_USER" bash -lc "cd '$REPO_DIR' && npm ci && npm run build"
else
  echo "==> Building the application"
  cd "$REPO_DIR"
  npm ci
  npm run build
fi
cd "$REPO_DIR"

echo "==> Installing to $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
rm -rf "$INSTALL_DIR/dist" "$INSTALL_DIR/node_modules"
cp -r dist node_modules package.json "$INSTALL_DIR/"
mkdir -p "$INSTALL_DIR/data"

echo "==> Writing environment file"
if [ ! -f /etc/samba-manager.env ]; then
  cat > /etc/samba-manager.env <<EOF
PORT=$PORT
DATA_DIR=$INSTALL_DIR/data
SAMBA_CONF=/etc/samba/smb.conf
SAMBA_MANAGER_CONF=/etc/samba/samba-manager.conf
# Set a strong password, or leave unset to have one generated in the log.
ADMIN_PASSWORD=
EOF
  chmod 600 /etc/samba-manager.env
  echo "    created /etc/samba-manager.env"
else
  echo "    /etc/samba-manager.env already exists, leaving it untouched"
fi

echo "==> Registering the systemd unit"
sed -e "s|/opt/samba-manager|$INSTALL_DIR|g" -e "s|^User=.*|User=$SERVICE_USER|" \
  "$REPO_DIR/deploy/samba-manager.service" > /etc/systemd/system/samba-manager.service

systemctl daemon-reload
systemctl enable samba-manager.service
systemctl restart samba-manager.service

# Make sure the console's share file is included from the main config.
if ! grep -q "include = /etc/samba/samba-manager.conf" /etc/samba/smb.conf 2>/dev/null; then
  printf '\n[global]\n   include = /etc/samba/samba-manager.conf\n' >> /etc/samba/smb.conf
  echo "    added include line to /etc/samba/smb.conf"
fi

systemctl reload smbd 2>/dev/null || systemctl restart smbd || true

echo
echo "Done. Open http://$(hostname -I | awk '{print $1}'):$PORT"
echo "If ADMIN_PASSWORD was left empty, the generated password is in:"
echo "    journalctl -u samba-manager | grep -i password"
