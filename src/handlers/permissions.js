import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const PERMISSION_ACTIONS = {
  chmod_project_path: {
    label: 'Apply Mode',
    description: 'Applies a safe non-recursive chmod mode to an allowed project path.',
    command: 'chmod'
  },
  chown_project_path: {
    label: 'Apply Owner',
    description: 'Applies a non-recursive owner or owner:group to an allowed project path.',
    command: 'chown'
  }
};

const PERMISSION_PRESETS = {
  web_writable_dirs: {
    label: 'Web Writable Dirs',
    mode: '775',
    description: 'Shared write access for runtime storage, uploads, and cache directories.'
  },
  config_files: {
    label: 'Config Files',
    mode: '664',
    description: 'Readable and editable by owner/group for non-secret configuration files.'
  },
  public_assets: {
    label: 'Public Assets',
    mode: '755',
    description: 'Readable and traversable public directories and deployed static assets.'
  },
  private_env: {
    label: 'Private Env',
    mode: '600',
    description: 'Owner-only access for .env files and local secrets.'
  }
};

const SAFE_MODES = new Set(['600', '640', '644', '660', '664', '700', '750', '755', '770', '775']);
const OWNER_PATTERN = /^[a-z_][a-z0-9_-]*(\$)?(:[a-z_][a-z0-9_-]*(\$)?)?$/i;

export function listPermissionActions() {
  return Object.entries(PERMISSION_ACTIONS).map(([id, action]) => ({
    id,
    label: action.label,
    description: action.description
  }));
}

export function listPermissionPresets() {
  return Object.entries(PERMISSION_PRESETS).map(([id, preset]) => ({
    id,
    label: preset.label,
    mode: preset.mode,
    description: preset.description
  }));
}

export function runPermissionAction(actionId, requestId, params, allowedDirs, sendUpdate) {
  const action = PERMISSION_ACTIONS[actionId];
  if (!action) {
    sendFailure(sendUpdate, requestId, actionId, 'Permission action is not allow-listed');
    return null;
  }

  const validation = validatePermissionParams(actionId, params, allowedDirs);
  if (!validation.ok) {
    sendFailure(sendUpdate, requestId, actionId, validation.error, validation);
    return null;
  }

  const args = actionId === 'chmod_project_path'
    ? [validation.mode, validation.targetPath]
    : [validation.owner, validation.targetPath];

  sendUpdate({
    type: 'permission_action_started',
    requestId,
    actionId,
    label: action.label,
    targetPath: validation.targetPath,
    command: action.command,
    args
  });

  const child = spawn(action.command, args, {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => {
    sendUpdate({
      type: 'permission_action_output',
      requestId,
      actionId,
      stream: 'stdout',
      data: chunk.toString()
    });
  });

  child.stderr.on('data', (chunk) => {
    sendUpdate({
      type: 'permission_action_output',
      requestId,
      actionId,
      stream: 'stderr',
      data: chunk.toString()
    });
  });

  child.on('error', (error) => {
    sendFailure(sendUpdate, requestId, actionId, error.message, {
      label: action.label,
      targetPath: validation.targetPath
    });
  });

  child.on('close', (code) => {
    sendUpdate({
      type: 'permission_action_finished',
      requestId,
      actionId,
      label: action.label,
      targetPath: validation.targetPath,
      ok: code === 0,
      code
    });
  });

  return child;
}

export function runPermissionPreset(presetId, requestId, params, allowedDirs, sendUpdate) {
  const preset = PERMISSION_PRESETS[presetId];
  const actionId = `permission_preset:${presetId}`;

  if (!preset) {
    sendFailure(sendUpdate, requestId, actionId, 'Permission preset is not allow-listed');
    return null;
  }

  const validation = validatePermissionParams('chmod_project_path', {
    ...params,
    mode: preset.mode
  }, allowedDirs);

  if (!validation.ok) {
    sendFailure(sendUpdate, requestId, actionId, validation.error, {
      ...validation,
      label: preset.label
    });
    return null;
  }

  sendUpdate({
    type: 'permission_action_started',
    requestId,
    actionId,
    presetId,
    label: preset.label,
    targetPath: validation.targetPath,
    command: 'chmod',
    args: [preset.mode, validation.targetPath]
  });

  const child = spawn('chmod', [preset.mode, validation.targetPath], {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => {
    sendUpdate({
      type: 'permission_action_output',
      requestId,
      actionId,
      presetId,
      stream: 'stdout',
      data: chunk.toString()
    });
  });

  child.stderr.on('data', (chunk) => {
    sendUpdate({
      type: 'permission_action_output',
      requestId,
      actionId,
      presetId,
      stream: 'stderr',
      data: chunk.toString()
    });
  });

  child.on('error', (error) => {
    sendFailure(sendUpdate, requestId, actionId, error.message, {
      label: preset.label,
      targetPath: validation.targetPath
    });
  });

  child.on('close', (code) => {
    sendUpdate({
      type: 'permission_action_finished',
      requestId,
      actionId,
      presetId,
      label: preset.label,
      targetPath: validation.targetPath,
      ok: code === 0,
      code
    });
  });

  return child;
}

function validatePermissionParams(actionId, params = {}, allowedDirs) {
  const targetPath = resolve(String(params.targetPath || '').trim());

  if (!String(params.targetPath || '').trim()) {
    return { ok: false, error: 'Target path is required' };
  }

  if (!isAllowedPath(targetPath, allowedDirs)) {
    return { ok: false, error: 'Target path is outside allowed permission directories', targetPath };
  }

  if (actionId === 'chmod_project_path') {
    const mode = String(params.mode || '').trim();
    if (!SAFE_MODES.has(mode)) {
      return { ok: false, error: 'Mode must be one of 600, 640, 644, 660, 664, 700, 750, 755, 770, 775', targetPath };
    }
    return { ok: true, targetPath, mode };
  }

  if (actionId === 'chown_project_path') {
    const owner = String(params.owner || '').trim();
    if (!OWNER_PATTERN.test(owner)) {
      return { ok: false, error: 'Owner must be user or user:group with safe characters only', targetPath };
    }
    return { ok: true, targetPath, owner };
  }

  return { ok: false, error: 'Permission action is not supported', targetPath };
}

function sendFailure(sendUpdate, requestId, actionId, error, details = {}) {
  sendUpdate({
    type: 'permission_action_failed',
    requestId,
    actionId,
    label: details.label || PERMISSION_ACTIONS[actionId]?.label || actionId,
    targetPath: details.targetPath || '',
    ok: false,
    error
  });
}

function isAllowedPath(filePath, allowedDirs) {
  return allowedDirs.some((dir) => {
    const allowedDir = resolve(dir);
    return filePath === allowedDir || filePath.startsWith(`${allowedDir}/`);
  });
}
