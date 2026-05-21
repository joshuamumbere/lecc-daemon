# Local Environment Command Center

LECC is a local-only developer control surface made of two pieces:

- A Node.js daemon bound to `127.0.0.1` that owns all host access.
- A Manifest V3 browser extension that connects to the daemon over WebSocket.

This repository currently contains the first implementation slice: authenticated daemon messaging, port-based project context, safe log tailing, and a loadable extension popup.

## Project Layout

```text
.
├── src/
│   ├── index.js              # WebSocket daemon entrypoint
│   ├── config.js             # token/config helpers
│   ├── router.js             # allow-listed daemon commands
│   └── handlers/logs.js      # validated tail -f log streaming
├── extension/
│   ├── manifest.json
│   ├── background/service-worker.js
│   └── popup/
│       ├── popup.html
│       ├── popup.css
│       └── popup.js
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
LECC_ALLOWED_LOG_DIRS=/var/log,/tmp,/home/me/projects
LECC_ALLOWED_ORIGINS=chrome-extension://<extension-id>
```

## Load The Extension

1. Open `chrome://extensions`.
2. Enable Developer Mode.
3. Click **Load unpacked**.
4. Select the `extension/` directory.
5. Open the extension popup, paste the daemon token, and save.

Open a localhost tab such as `http://localhost:3000`. If the port exists in `port-map.json`, the extension sends that context to the daemon and streams the mapped log file.

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
- The current extension command surface is intentionally minimal: connect, disconnect, context detection, log streaming, and echo.

## Checks

```sh
npm run check
```
