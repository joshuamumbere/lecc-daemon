# Local Environment Command Center

LECC is a local-only developer control surface made of two pieces:

- A Node.js daemon bound to `127.0.0.1` that owns all host access.
- A Manifest V3 browser extension that connects to the daemon over WebSocket.

This repository currently contains authenticated daemon messaging, editable port-based project context, safe log tailing, allow-listed cache actions, and a loadable extension popup.

## Project Layout

```text
.
├── src/
│   ├── index.js              # WebSocket daemon entrypoint
│   ├── config.js             # token/config helpers
│   ├── router.js             # allow-listed daemon commands
│   └── handlers/
│       ├── cache.js          # allow-listed cache command execution
│       ├── logs.js           # validated tail -f log streaming
│       └── port-map.js       # project mapping load/save validation
├── extension/
│   ├── manifest.json
│   ├── background/service-worker.js
│   └── popup/
│       ├── popup.html
│       ├── popup.css
│       └── popup.js
├── scripts/
│   ├── install.sh            # installs systemd --user service
│   └── uninstall.sh          # removes systemd --user service
├── services.json             # allow-listed systemd user services
└── port-map.json             # maps localhost ports to project names/logs
```

## Run The Daemon

Install dependencies:

```sh
npm install
```

Start the daemon:

```sh
npm start
```

The daemon binds to `ws://127.0.0.1:17324`, creates an auth token at `~/.config/lecc/token`, and prints the token on startup.

Useful environment overrides:

```sh
LECC_PORT=17324
LECC_TOKEN_PATH=/path/to/token
LECC_PORT_MAP=/path/to/port-map.json
LECC_SERVICES=/path/to/services.json
LECC_ALLOWED_LOG_DIRS=/var/log,/tmp,/home/me/projects
LECC_ALLOWED_PERMISSION_DIRS=/tmp,/home/me/projects
LECC_ALLOWED_ORIGINS=chrome-extension://<extension-id>
```

## Install As A User Service

Install the daemon as a `systemd --user` service:

```sh
npm run install:service
```

This copies the app to `~/.local/share/lecc-daemon`, installs production dependencies there, writes `~/.config/systemd/user/lecc-daemon.service`, and copies the default `port-map.json` to `~/.config/lecc/port-map.json` if one does not already exist.

Start it:

```sh
systemctl --user enable --now lecc-daemon.service
```

Install and start in one step:

```sh
scripts/install.sh --start
```

Check status and logs:

```sh
systemctl --user status lecc-daemon.service
journalctl --user -u lecc-daemon.service -f
```

Remove the service and installed app files:

```sh
npm run uninstall:service
```

Remove service, installed app files, and config:

```sh
scripts/uninstall.sh --purge-config
```

## Load The Extension

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click **Load unpacked**.
4. Select the `extension/` directory.
5. Open the extension popup, paste the daemon token, and save.

The token is stored at `~/.config/lecc/token` by default. The popup Settings tab includes a token reveal toggle and a connection test button. The Controls tab shows connection diagnostics, including the daemon URL, WebSocket close code, and useful service commands when the daemon is unavailable.

Open a localhost tab such as `http://localhost:3000`. If the port exists in `port-map.json`, the extension sends that context to the daemon and streams the mapped log file.

The Logs tab supports pausing display updates, clearing the extension-side view, restarting the current stream, filtering lines, and highlighting common log levels.

The Controls tab also lists cache actions reported by the daemon. Each action maps to a fixed command and argument list in `src/handlers/cache.js`; the extension only sends an action ID.

Cache command runs use request IDs and are tracked in a recent command history. The popup persists the last 20 command runs in `chrome.storage.local`, including status, timestamps, exit code, and failure details.

The Permissions Repair section supports non-recursive `chmod` and `chown` operations on paths inside `LECC_ALLOWED_PERMISSION_DIRS`. Modes are restricted to a small safe set, and owner values must be plain `user` or `user:group` strings.

Permission presets are daemon-owned allow-list entries. The extension sends a preset ID and target path; the daemon maps the preset to a fixed mode such as `775`, `664`, `755`, or `600`.

Service controls use `systemctl --user` and only operate on services listed in `services.json`. Service names must be valid `.service` unit names and are never executed through a shell.

Use the Settings tab to edit the service allow-list without restarting the daemon. Saved services immediately refresh the Controls service dropdown.

Use the Settings tab to edit project mappings without restarting the daemon. Ports must be numeric, project names are required, and log paths must resolve inside `LECC_ALLOWED_LOG_DIRS`.

## Demo Log

The default `port-map.json` points to `/tmp/lecc-demo.log`. Create it before testing log streaming:

```sh
touch /tmp/lecc-demo.log
printf 'INFO demo log ready\n' >> /tmp/lecc-demo.log
```

## Security Baseline

- The daemon listens only on `127.0.0.1`.
- Every command must include the daemon token.
- Commands are routed through a fixed allow-list in `src/router.js`.
- Log paths are resolved and checked against allowed directories before `tail` is started.
- The current extension command surface is intentionally small: connect, disconnect, context detection, log streaming, echo, cache action listing/execution, and validated project mapping edits.

## Checks

```sh
npm run check
```
