#!/usr/bin/env bash
set -euo pipefail

SERVICE_NAME="${LECC_SERVICE_NAME:-lecc-daemon}"
INSTALL_DIR="${LECC_INSTALL_DIR:-$HOME/.local/share/lecc-daemon}"
CONFIG_DIR="${LECC_CONFIG_DIR:-$HOME/.config/lecc}"
SYSTEMD_USER_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
UNIT_PATH="$SYSTEMD_USER_DIR/$SERVICE_NAME.service"

usage() {
  cat <<USAGE
Usage: scripts/uninstall.sh [--purge-config]

Stops and removes the LECC systemd user service.

Options:
  --purge-config          Also remove ~/.config/lecc or LECC_CONFIG_DIR
  -h, --help              Show this help
USAGE
}

PURGE_CONFIG=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --purge-config)
      PURGE_CONFIG=1
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

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user disable --now "$SERVICE_NAME.service" >/dev/null 2>&1 || true
fi

rm -f "$UNIT_PATH"

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload || true
fi

rm -rf "$INSTALL_DIR"

if [[ "$PURGE_CONFIG" -eq 1 ]]; then
  rm -rf "$CONFIG_DIR"
  echo "Removed service, install directory, and config directory."
else
  echo "Removed service and install directory."
  echo "Config preserved at: $CONFIG_DIR"
fi
