#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${LECC_SERVICE_NAME:-lecc-daemon}"
INSTALL_DIR="${LECC_INSTALL_DIR:-$HOME/.local/share/lecc-daemon}"
CONFIG_DIR="${LECC_CONFIG_DIR:-$HOME/.config/lecc}"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_PATH="$SYSTEMD_USER_DIR/$SERVICE_NAME.service"
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<USAGE
Usage: scripts/install.sh [--start]

Installs LECC as a systemd user service.

Environment overrides:
  LECC_SERVICE_NAME       Service name, default: lecc-daemon
  LECC_INSTALL_DIR        App install directory, default: ~/.local/share/lecc-daemon
  LECC_CONFIG_DIR         Daemon config directory, default: ~/.config/lecc
  LECC_PORT               Daemon WebSocket port, default: 17324
  LECC_ALLOWED_LOG_DIRS   Comma-separated allowed log directories
  LECC_ALLOWED_PERMISSION_DIRS
                          Comma-separated directories for chmod/chown repairs
  LECC_ALLOWED_ORIGINS    Comma-separated extension origins

Options:
  --start                 Enable and start the service after installation
  -h, --help              Show this help
USAGE
}

START_SERVICE=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --start)
      START_SERVICE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_command node
require_command npm
require_command systemctl
require_command rsync

mkdir -p "$INSTALL_DIR" "$CONFIG_DIR" "$SYSTEMD_USER_DIR"

rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude '.DS_Store' \
  "$SOURCE_DIR/" "$INSTALL_DIR/"

npm --prefix "$INSTALL_DIR" install --omit=dev

cat > "$UNIT_PATH" <<UNIT
[Unit]
Description=Local Environment Command Center daemon
Documentation=file://$INSTALL_DIR/README.md
After=default.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
Environment=NODE_ENV=production
Environment=LECC_CONFIG_DIR=$CONFIG_DIR
Environment=LECC_PORT=${LECC_PORT:-17324}
Environment=LECC_PORT_MAP=$CONFIG_DIR/port-map.json
Environment=LECC_ALLOWED_LOG_DIRS=${LECC_ALLOWED_LOG_DIRS:-/var/log,/tmp,$HOME/projects}
Environment=LECC_ALLOWED_PERMISSION_DIRS=${LECC_ALLOWED_PERMISSION_DIRS:-/tmp,$HOME/projects}
Environment=LECC_ALLOWED_ORIGINS=${LECC_ALLOWED_ORIGINS:-}
ExecStart=$(command -v node) $INSTALL_DIR/src/index.js
Restart=on-failure
RestartSec=2
NoNewPrivileges=true

[Install]
WantedBy=default.target
UNIT

if [[ ! -f "$CONFIG_DIR/port-map.json" ]]; then
  cp "$INSTALL_DIR/port-map.json" "$CONFIG_DIR/port-map.json"
  chmod 600 "$CONFIG_DIR/port-map.json"
fi

systemctl --user daemon-reload

echo "Installed $SERVICE_NAME user service."
echo "Unit: $UNIT_PATH"
echo "Install dir: $INSTALL_DIR"
echo "Config dir: $CONFIG_DIR"

if [[ "$START_SERVICE" -eq 1 ]]; then
  systemctl --user enable --now "$SERVICE_NAME.service"
  echo "Started $SERVICE_NAME.service"
else
  echo "Start it with: systemctl --user enable --now $SERVICE_NAME.service"
fi
