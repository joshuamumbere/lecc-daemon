import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { send } from '../router.js';

export function tailLog(ws, { logPath, lines = 80, allowedLogDirs }) {
  const resolvedLogPath = resolve(logPath);

  if (!isAllowedPath(resolvedLogPath, allowedLogDirs)) {
    send(ws, { type: 'error', error: 'Log path is outside allowed directories' });
    return null;
  }

  if (!existsSync(resolvedLogPath)) {
    send(ws, { type: 'error', error: `Log file does not exist: ${resolvedLogPath}` });
    return null;
  }

  const tail = spawn('tail', ['-n', String(lines), '-f', resolvedLogPath], {
    stdio: ['ignore', 'pipe', 'pipe']
  });

  tail.stdout.on('data', (chunk) => {
    send(ws, { type: 'log_line', data: chunk.toString() });
  });

  tail.stderr.on('data', (chunk) => {
    send(ws, { type: 'error', error: chunk.toString().trim() });
  });

  tail.on('close', (code) => {
    send(ws, { type: 'log_closed', code });
  });

  return tail;
}

function isAllowedPath(filePath, allowedDirs) {
  return allowedDirs.some((dir) => {
    const allowedDir = resolve(dir);
    return filePath === allowedDir || filePath.startsWith(`${allowedDir}/`);
  });
}
