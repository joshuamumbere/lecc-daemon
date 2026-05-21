import { spawn } from 'node:child_process';

const CACHE_ACTIONS = {
  verify_npm_cache: {
    label: 'Verify npm Cache',
    description: 'Runs npm cache verification for the current user.',
    command: 'npm',
    args: ['cache', 'verify']
  },
  clear_demo_log: {
    label: 'Clear Demo Log',
    description: 'Truncates the default LECC demo log at /tmp/lecc-demo.log.',
    command: 'truncate',
    args: ['-s', '0', '/tmp/lecc-demo.log']
  },
  clear_tmp_lecc_cache: {
    label: 'Clear LECC Temp Cache',
    description: 'Removes files under /tmp/lecc-cache without touching other temp data.',
    command: 'find',
    args: ['/tmp/lecc-cache', '-mindepth', '1', '-maxdepth', '1', '-delete']
  }
};

export function listCacheActions() {
  return Object.entries(CACHE_ACTIONS).map(([id, action]) => ({
    id,
    label: action.label,
    description: action.description
  }));
}

export function runCacheAction(actionId, sendUpdate) {
  const action = CACHE_ACTIONS[actionId];
  if (!action) {
    sendUpdate({ type: 'error', error: 'Cache action is not allow-listed' });
    return null;
  }

  sendUpdate({
    type: 'cache_action_started',
    actionId,
    label: action.label
  });

  const child = spawn(action.command, action.args, {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  child.stdout.on('data', (chunk) => {
    sendUpdate({
      type: 'cache_action_output',
      actionId,
      stream: 'stdout',
      data: chunk.toString()
    });
  });

  child.stderr.on('data', (chunk) => {
    sendUpdate({
      type: 'cache_action_output',
      actionId,
      stream: 'stderr',
      data: chunk.toString()
    });
  });

  child.on('error', (error) => {
    sendUpdate({
      type: 'cache_action_finished',
      actionId,
      ok: false,
      error: error.message
    });
  });

  child.on('close', (code) => {
    sendUpdate({
      type: 'cache_action_finished',
      actionId,
      ok: code === 0,
      code
    });
  });

  return child;
}
