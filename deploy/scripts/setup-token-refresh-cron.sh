#!/bin/sh
set -e

# EagleBABA Upstox Daily Access Token Refresh Pipeline Installer
# Installs and enables the systemd timer (08:30 IST / 03:00 UTC) on Hostinger VPS.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SYSTEMD_DIR="${SCRIPT_DIR}/../systemd"

echo "=== EagleBABA Upstox Token Refresh Automation Installer ==="

# Check root permissions
if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run as root." >&2
  exit 1
fi

# Ensure log file exists with proper permissions
touch /var/log/eaglebaba-token-refresh.log
chmod 0640 /var/log/eaglebaba-token-refresh.log

# 1. Install systemd service and timer
if command -v systemctl >/dev/null 2>&1; then
  echo "[1/3] Copying systemd unit files to /etc/systemd/system/..."
  cp "${SYSTEMD_DIR}/eaglebaba-upstox-refresh.service" /etc/systemd/system/
  cp "${SYSTEMD_DIR}/eaglebaba-upstox-refresh.timer" /etc/systemd/system/

  echo "[2/3] Reloading systemd daemon..."
  systemctl daemon-reload

  echo "[3/3] Enabling and starting eaglebaba-upstox-refresh.timer..."
  systemctl enable --now eaglebaba-upstox-refresh.timer

  echo ""
  echo "=== Systemd Timer Status ==="
  systemctl list-timers eaglebaba-upstox-refresh.timer --no-pager
  echo ""
  echo "SUCCESS: Upstox token refresh timer is active and will fire daily at 08:30 IST (03:00 UTC)."
  echo "Logs will be written to: /var/log/eaglebaba-token-refresh.log"
else
  echo "systemctl not found. Falling back to crontab installation..."
  CRON_JOB="30 3 * * * /bin/sh -c 'CONTAINER=\$(/usr/bin/docker ps -q --filter \"label=coolify.resourceName=eaglebaba\" | head -n1); [ -n \"\$CONTAINER\" ] && /usr/bin/docker exec \$CONTAINER node /app/scripts/refresh-upstox-token.mjs >> /var/log/eaglebaba-token-refresh.log 2>&1'"
  (crontab -l 2>/dev/null | grep -v "refresh-upstox-token.mjs"; echo "$CRON_JOB") | crontab -
  echo "SUCCESS: Crontab entry installed for daily 03:00 UTC (08:30 IST) execution."
fi
