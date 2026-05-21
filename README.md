I'll help you build this. Let me first read the frontend design skill to ensure quality implementation guidance.This is a meaty system to design — let me map out the full architecture and then give you a visual guide.Here's a comprehensive implementation guide for the **Local Environment Command Center**.Here's everything you need to build this, broken into the three layers from the diagram.

---

## 1. The Local Daemon (`lecc-daemon`)

This is the heart of the system — a lightweight server that runs on your machine and is the *only* component that touches the OS.

**Tech stack:** Node.js with `ws` (WebSocket server) + `child_process`. Python is also viable, but Node keeps it close to the browser ecosystem.

**Security model — this is critical:**
- Bind exclusively to `127.0.0.1`, never `0.0.0.0`. This prevents any external machine from connecting.
- On first launch, generate a cryptographically random one-time token (e.g. via `crypto.randomUUID()`), write it to `~/.config/lecc/token` with `chmod 600`, and also log it to the terminal. The extension reads it once during setup.
- Every incoming WebSocket message must include this token. Reject silently (don't reveal *why*) if it doesn't match.
- Maintain an **allow-list** of commands the daemon can execute. Never pass raw shell strings from the extension into `exec()`. Map string identifiers like `"flush_nginx_cache"` to hardcoded function calls on the daemon side.

**Core daemon responsibilities:**

```
lecc-daemon/
├── index.js          ← WebSocket server, auth middleware
├── router.js         ← Maps command IDs to handler functions
├── handlers/
│   ├── logs.js       ← tail -f via spawn, streams lines over WS
│   ├── permissions.js← chown/chmod with path validation
│   ├── users.js      ← useradd/userdel/usermod wrappers
│   └── cache.js      ← project-specific flush scripts
└── port-map.json     ← user-editable: { "3000": "my-app", "8080": "api" }
```

**Log streaming handler sketch:**

```js
// handlers/logs.js
const { spawn } = require('child_process');

function tailLog(ws, { logPath, lines = 50 }) {
  // SECURITY: validate logPath is within allowed directories
  const allowed = ['/var/log', process.env.HOME + '/projects'];
  if (!allowed.some(dir => logPath.startsWith(dir))) {
    ws.send(JSON.stringify({ error: 'Path not permitted' }));
    return;
  }

  const tail = spawn('tail', ['-n', lines, '-f', logPath]);
  tail.stdout.on('data', data => {
    ws.send(JSON.stringify({ type: 'log_line', data: data.toString() }));
  });
  ws.on('close', () => tail.kill()); // clean up on disconnect
}
```

---

## 2. The Browser Extension

A Manifest V3 extension with three parts:

**`manifest.json` key permissions:**
```json
{
  "permissions": ["activeTab", "storage", "scripting"],
  "host_permissions": ["http://localhost/*", "https://localhost/*"],
  "action": { "default_popup": "popup.html" },
  "background": { "service_worker": "background.js" }
}
```

**Background service worker (`background.js`):** Manages the single persistent WebSocket connection to the daemon. When the active tab changes, it reads the tab's URL, extracts the port, looks it up in your `port-map`, and sends a `{ cmd: "set_context", port: 3000 }` message to the daemon to switch which log is being tailed.

**The panel UI (`popup.html`):** This is what developers actually see. Design it around three tabs:

- **Logs tab** — a virtual-scrolling terminal window streaming lines from the daemon. Include a filter/grep input and log-level badges (ERROR in red, WARN in amber, INFO muted). Show which file is being tailed at the top.
- **Controls tab** — a GUI for the allow-listed commands. Group them: *Permissions* (chown/chmod with a path picker and a permission matrix), *Cache* (per-project flush buttons), *Users* (list local users, create/delete with a form).
- **Settings tab** — where the user pastes their auth token, configures allowed log directories, and edits the port-to-project map.

---

## 3. Security Checklist

Before shipping anything, walk through each of these:

| Risk | Mitigation |
|---|---|
| Another process on the machine hijacking the daemon | localhost-only bind + per-session token |
| The extension leaking the token | Store it in `chrome.storage.local` (encrypted by the browser), never in `localStorage` |
| Arbitrary shell injection via commands | Strict allow-list; no `exec(userInput)` ever |
| Path traversal in log/file ops | Validate all paths against an allowed-directories list before any fs call |
| A malicious website talking to the daemon | `Origin` header check in the WS handshake — only accept `chrome-extension://` origins |
| Daemon left running with stale token | Auto-generate a new token on each daemon start |

---

## 4. Build Order

1. **Daemon first** — get the WebSocket server running, hardcode a test token, write a single log-tail handler. Test with `wscat` from the terminal before touching the extension.
2. **Extension skeleton** — get the popup opening, the WS connection establishing, and raw log lines rendering in a `<pre>` tag.
3. **Tab context detection** — read `chrome.tabs.query` on focus change, extract port, send to daemon.
4. **Layer in controls** — add permission/user/cache handlers one at a time, each with its own allow-list entry.
5. **Polish the UI** — virtual scrolling for logs, log-level coloring, the controls panel layout.
6. **Packaging** — a simple install script (`install.sh`) that runs the daemon as a `systemd --user` service so it auto-starts with the desktop session.

The daemon running as a `systemd --user` unit (not root) is the right privilege model — it has the same permissions as your normal user account, which is exactly what you need for developer tasks like `chown`-ing project files or managing local user accounts.