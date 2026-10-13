#!/bin/sh
# Container entrypoint: prepare the Samba state directories, wire the managed
# share fragment into smb.conf, start smbd, then hand over to the web console.
set -e

SAMBA_CONF="${SAMBA_CONF:-/etc/samba/smb.conf}"
MANAGED_CONF="${SAMBA_MANAGER_CONF:-/etc/samba/samba-manager.conf}"

mkdir -p /etc/samba /var/lib/samba/private /var/log/samba /run/samba "${DATA_DIR:-/data}"

if [ ! -f "$SAMBA_CONF" ]; then
  echo "[entrypoint] creating a minimal $SAMBA_CONF"
  cat > "$SAMBA_CONF" <<'EOF'
[global]
   workgroup = WORKGROUP
   server role = standalone server
   map to guest = Bad User
   log file = /var/log/samba/log.%m
   logging = file
   load printers = no
   printing = bsd
   printcap name = /dev/null
   disable spoolss = yes
EOF
fi

# Make sure the console's own share file is included exactly once.
if ! grep -q "include = $MANAGED_CONF" "$SAMBA_CONF" 2>/dev/null; then
  echo "[entrypoint] adding include for $MANAGED_CONF"
  printf '\n[global]\n   include = %s\n' "$MANAGED_CONF" >> "$SAMBA_CONF"
fi

[ -f "$MANAGED_CONF" ] || printf '# Managed by samba-manager.\n' > "$MANAGED_CONF"

echo "[entrypoint] starting smbd"
smbd --daemon --no-process-group --configfile="$SAMBA_CONF"

if command -v nmbd >/dev/null 2>&1; then
  nmbd --daemon --no-process-group --configfile="$SAMBA_CONF" || true
fi

echo "[entrypoint] starting web console on port ${PORT:-5069}"
exec node /app/dist/server/index.js
