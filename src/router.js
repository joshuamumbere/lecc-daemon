import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tailLog } from './handlers/logs.js';

const activeTails = new WeakMap();

export function createRouter(config) {
  const portMap = loadPortMap(config.portMapPath);

  return async function route(ws, message) {
    switch (message.cmd) {
      case 'ping':
        send(ws, {
          type: 'pong',
          daemonTime: new Date().toISOString(),
          context: ws.leccContext || null
        });
        break;

      case 'set_context':
        setContext(ws, config, portMap, message);
        break;

      case 'stop_log':
        stopTail(ws);
        send(ws, { type: 'log_stopped' });
        break;

      case 'echo':
        send(ws, { type: 'echo', data: String(message.data || '') });
        break;

      default:
        send(ws, { type: 'error', error: 'Command is not allow-listed' });
    }
  };
}

export function send(ws, payload) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(payload));
  }
}

function setContext(ws, config, portMap, message) {
  const port = String(message.port || '');
  const entry = portMap[port];

  ws.leccContext = entry
    ? { port, name: entry.name, logPath: entry.logPath }
    : { port, name: 'Unmapped port', logPath: null };

  send(ws, { type: 'context', context: ws.leccContext });

  stopTail(ws);
  if (entry?.logPath) {
    const tail = tailLog(ws, {
      logPath: entry.logPath,
      lines: Number.parseInt(message.lines || '80', 10),
      allowedLogDirs: config.allowedLogDirs
    });

    if (tail) {
      activeTails.set(ws, tail);
    }
  }
}

function stopTail(ws) {
  const tail = activeTails.get(ws);
  if (tail) {
    tail.kill();
    activeTails.delete(ws);
  }
}

function loadPortMap(portMapPath) {
  try {
    return JSON.parse(readFileSync(resolve(portMapPath), 'utf8'));
  } catch {
    return {};
  }
}
