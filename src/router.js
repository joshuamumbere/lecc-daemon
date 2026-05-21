import { listCacheActions, runCacheAction } from './handlers/cache.js';
import { listPermissionActions, listPermissionPresets, runPermissionAction, runPermissionPreset } from './handlers/permissions.js';
import { listAllowedServices, listProcessActions, loadAllowedServices, runProcessAction, saveAllowedServices } from './handlers/processes.js';
import { tailLog } from './handlers/logs.js';
import { loadPortMap, savePortMap } from './handlers/port-map.js';

const activeTails = new WeakMap();
const activeCacheActions = new WeakMap();
const activePermissionActions = new WeakMap();
const activeProcessActions = new WeakMap();

export function createRouter(config) {
  const state = {
    portMap: loadPortMap(config.portMapPath),
    services: loadAllowedServices(config.servicesPath)
  };

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
        setContext(ws, config, state.portMap, message);
        break;

      case 'get_port_map':
        send(ws, { type: 'port_map', portMap: state.portMap });
        break;

      case 'reload_port_map':
        state.portMap = loadPortMap(config.portMapPath);
        send(ws, { type: 'port_map', portMap: state.portMap });
        break;

      case 'save_port_map':
        saveNextPortMap(ws, config, state, message);
        break;

      case 'stop_log':
        stopTail(ws);
        send(ws, { type: 'log_stopped' });
        break;

      case 'stop_actions':
        stopCacheActions(ws);
        stopPermissionActions(ws);
        stopProcessActions(ws);
        send(ws, { type: 'actions_stopped' });
        break;

      case 'list_cache_actions':
        send(ws, { type: 'cache_actions', actions: listCacheActions() });
        break;

      case 'run_cache_action':
        runAllowedCacheAction(ws, message);
        break;

      case 'list_permission_actions':
        send(ws, { type: 'permission_actions', actions: listPermissionActions() });
        break;

      case 'list_permission_presets':
        send(ws, { type: 'permission_presets', presets: listPermissionPresets() });
        break;

      case 'run_permission_action':
        runAllowedPermissionAction(ws, config, message);
        break;

      case 'run_permission_preset':
        runAllowedPermissionPreset(ws, config, message);
        break;

      case 'list_process_actions':
        send(ws, { type: 'process_actions', actions: listProcessActions() });
        break;

      case 'list_allowed_services':
        state.services = loadAllowedServices(config.servicesPath);
        send(ws, { type: 'allowed_services', services: listAllowedServices(state.services) });
        break;

      case 'get_services':
        send(ws, { type: 'services_config', services: state.services });
        break;

      case 'reload_services':
        state.services = loadAllowedServices(config.servicesPath);
        send(ws, { type: 'services_config', services: state.services });
        send(ws, { type: 'allowed_services', services: listAllowedServices(state.services) });
        break;

      case 'save_services':
        saveNextServices(ws, config, state, message);
        break;

      case 'run_process_action':
        runAllowedProcessAction(ws, state, message);
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

function runAllowedCacheAction(ws, message) {
  const actionId = String(message.actionId || '');
  const requestId = String(message.requestId || `${Date.now()}-${actionId || 'cache-action'}`);
  const child = runCacheAction(actionId, requestId, (payload) => send(ws, payload));
  if (!child) return;

  const actions = activeCacheActions.get(ws) || new Set();
  actions.add(child);
  activeCacheActions.set(ws, actions);

  child.on('close', () => {
    actions.delete(child);
    if (actions.size === 0) {
      activeCacheActions.delete(ws);
    }
  });
}

function stopCacheActions(ws) {
  const actions = activeCacheActions.get(ws);
  if (!actions) return;

  actions.forEach((child) => {
    if (!child.killed) {
      child.kill();
    }
  });
  activeCacheActions.delete(ws);
}

function runAllowedPermissionAction(ws, config, message) {
  const actionId = String(message.actionId || '');
  const requestId = String(message.requestId || `${Date.now()}-${actionId || 'permission-action'}`);
  const child = runPermissionAction(
    actionId,
    requestId,
    message.params || {},
    config.allowedPermissionDirs,
    (payload) => send(ws, payload)
  );
  if (!child) return;

  const actions = activePermissionActions.get(ws) || new Set();
  actions.add(child);
  activePermissionActions.set(ws, actions);

  child.on('close', () => {
    actions.delete(child);
    if (actions.size === 0) {
      activePermissionActions.delete(ws);
    }
  });
}

function runAllowedPermissionPreset(ws, config, message) {
  const presetId = String(message.presetId || '');
  const requestId = String(message.requestId || `${Date.now()}-${presetId || 'permission-preset'}`);
  const child = runPermissionPreset(
    presetId,
    requestId,
    message.params || {},
    config.allowedPermissionDirs,
    (payload) => send(ws, payload)
  );
  if (!child) return;

  const actions = activePermissionActions.get(ws) || new Set();
  actions.add(child);
  activePermissionActions.set(ws, actions);

  child.on('close', () => {
    actions.delete(child);
    if (actions.size === 0) {
      activePermissionActions.delete(ws);
    }
  });
}

function stopPermissionActions(ws) {
  const actions = activePermissionActions.get(ws);
  if (!actions) return;

  actions.forEach((child) => {
    if (!child.killed) {
      child.kill();
    }
  });
  activePermissionActions.delete(ws);
}

function runAllowedProcessAction(ws, state, message) {
  const actionId = String(message.actionId || '');
  const requestId = String(message.requestId || `${Date.now()}-${actionId || 'process-action'}`);
  const child = runProcessAction(
    actionId,
    requestId,
    message.serviceId,
    state.services,
    (payload) => send(ws, payload)
  );
  if (!child) return;

  const actions = activeProcessActions.get(ws) || new Set();
  actions.add(child);
  activeProcessActions.set(ws, actions);

  child.on('close', () => {
    actions.delete(child);
    if (actions.size === 0) {
      activeProcessActions.delete(ws);
    }
  });
}

function stopProcessActions(ws) {
  const actions = activeProcessActions.get(ws);
  if (!actions) return;

  actions.forEach((child) => {
    if (!child.killed) {
      child.kill();
    }
  });
  activeProcessActions.delete(ws);
}

function saveNextPortMap(ws, config, state, message) {
  const result = savePortMap(config.portMapPath, message.portMap, config.allowedLogDirs);

  if (!result.ok) {
    send(ws, { type: 'port_map_error', errors: result.errors });
    return;
  }

  state.portMap = result.portMap;
  send(ws, { type: 'port_map_saved', portMap: state.portMap });

  if (ws.leccContext?.port) {
    setContext(ws, config, state.portMap, { port: ws.leccContext.port });
  }
}

function saveNextServices(ws, config, state, message) {
  const result = saveAllowedServices(config.servicesPath, message.services);

  if (!result.ok) {
    send(ws, { type: 'services_error', errors: result.errors });
    return;
  }

  state.services = result.services;
  send(ws, { type: 'services_saved', services: state.services });
  send(ws, { type: 'allowed_services', services: listAllowedServices(state.services) });
}
