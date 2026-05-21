import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

const DEFAULT_CONFIG_DIR = join(homedir(), '.config', 'lecc');
const DEFAULT_PORT = 17324;

export function getDaemonConfig() {
  const configDir = process.env.LECC_CONFIG_DIR || DEFAULT_CONFIG_DIR;
  const tokenPath = process.env.LECC_TOKEN_PATH || join(configDir, 'token');
  const portMapPath = resolve(process.env.LECC_PORT_MAP || 'port-map.json');
  const servicesPath = resolve(process.env.LECC_SERVICES || 'services.json');

  const allowedLogDirs = parseList(process.env.LECC_ALLOWED_LOG_DIRS, ['/var/log', join(homedir(), 'projects'), '/tmp']);

  return {
    host: '127.0.0.1',
    port: Number.parseInt(process.env.LECC_PORT || `${DEFAULT_PORT}`, 10),
    tokenPath,
    portMapPath,
    servicesPath,
    allowedOrigins: parseOrigins(process.env.LECC_ALLOWED_ORIGINS),
    allowedLogDirs,
    allowedPermissionDirs: parseList(process.env.LECC_ALLOWED_PERMISSION_DIRS, allowedLogDirs)
  };
}

export function ensureToken(tokenPath) {
  mkdirSync(dirname(tokenPath), { recursive: true, mode: 0o700 });

  if (existsSync(tokenPath)) {
    return readFileSync(tokenPath, 'utf8').trim();
  }

  const token = randomUUID();
  writeFileSync(tokenPath, `${token}\n`, { mode: 0o600 });
  chmodSync(tokenPath, 0o600);
  return token;
}

export function parseJsonMessage(raw) {
  try {
    return JSON.parse(raw.toString());
  } catch {
    return null;
  }
}

function parseList(value, fallback) {
  if (!value) return fallback;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function parseOrigins(value) {
  if (!value) return [];
  return parseList(value, []);
}
