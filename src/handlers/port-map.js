import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function loadPortMap(portMapPath) {
  try {
    return JSON.parse(readFileSync(resolve(portMapPath), 'utf8'));
  } catch {
    return {};
  }
}

export function savePortMap(portMapPath, nextPortMap, allowedLogDirs) {
  const validation = validatePortMap(nextPortMap, allowedLogDirs);
  if (!validation.ok) {
    return validation;
  }

  const resolvedPath = resolve(portMapPath);
  mkdirSync(dirname(resolvedPath), { recursive: true });
  writeFileSync(resolvedPath, `${JSON.stringify(validation.portMap, null, 2)}\n`, { mode: 0o600 });

  return validation;
}

export function validatePortMap(portMap, allowedLogDirs) {
  const errors = [];
  const normalized = {};

  if (!portMap || typeof portMap !== 'object' || Array.isArray(portMap)) {
    return { ok: false, errors: ['Port map must be an object'] };
  }

  Object.entries(portMap).forEach(([rawPort, rawEntry]) => {
    const port = String(rawPort).trim();
    const portNumber = Number.parseInt(port, 10);
    const entry = rawEntry && typeof rawEntry === 'object' ? rawEntry : {};
    const name = String(entry.name || '').trim();
    const logPath = String(entry.logPath || '').trim();

    if (!/^\d+$/.test(port) || portNumber < 1 || portNumber > 65535) {
      errors.push(`${port || '(blank)'}: port must be a number from 1 to 65535`);
      return;
    }

    if (!name) {
      errors.push(`${port}: project name is required`);
    }

    if (!logPath) {
      errors.push(`${port}: log path is required`);
    } else if (!isAllowedPath(resolve(logPath), allowedLogDirs)) {
      errors.push(`${port}: log path is outside allowed directories`);
    }

    normalized[port] = {
      name,
      logPath: logPath ? resolve(logPath) : ''
    };
  });

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return { ok: true, portMap: normalized };
}

function isAllowedPath(filePath, allowedDirs) {
  return allowedDirs.some((dir) => {
    const allowedDir = resolve(dir);
    return filePath === allowedDir || filePath.startsWith(`${allowedDir}/`);
  });
}
