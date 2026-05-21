const DEFAULT_SETTINGS = {
  daemonUrl: 'ws://127.0.0.1:17324',
  token: ''
};
const COMMAND_HISTORY_KEY = 'commandHistory';
const COMMAND_HISTORY_LIMIT = 20;
const EXPECTED_PROTOCOL = 'lecc.v1';

const state = {
  daemonState: 'disconnected',
  connectionStatus: {
    state: 'disconnected',
    daemonUrl: DEFAULT_SETTINGS.daemonUrl,
    message: 'Not connected.',
    closeCode: null,
    closeReason: '',
    protocol: '',
    daemonVersion: '',
    capabilities: []
  },
  capabilities: new Set(),
  logLines: [],
  pendingLogLines: [],
  isLogPaused: false,
  isLogStreaming: false,
  commandLines: [],
  commandHistory: [],
  cacheActions: [],
  permissionActions: [],
  permissionPresets: [],
  processActions: [],
  allowedServices: [],
  portMap: {},
  runningActions: new Set(),
  context: null
};

const elements = {
  status: document.querySelector('#status'),
  contextName: document.querySelector('#contextName'),
  contextPath: document.querySelector('#contextPath'),
  logStatus: document.querySelector('#logStatus'),
  logOutput: document.querySelector('#logOutput'),
  logFilter: document.querySelector('#logFilter'),
  pauseLogs: document.querySelector('#pauseLogs'),
  clearLogs: document.querySelector('#clearLogs'),
  restartLogs: document.querySelector('#restartLogs'),
  daemonUrl: document.querySelector('#daemonUrl'),
  token: document.querySelector('#token'),
  connectButton: document.querySelector('#connectButton'),
  retryButton: document.querySelector('#retryButton'),
  testConnection: document.querySelector('#testConnection'),
  toggleToken: document.querySelector('#toggleToken'),
  echoButton: document.querySelector('#echoButton'),
  connectionDiagnostics: document.querySelector('#connectionDiagnostics'),
  diagnosticMessage: document.querySelector('#diagnosticMessage'),
  diagnosticUrl: document.querySelector('#diagnosticUrl'),
  diagnosticClose: document.querySelector('#diagnosticClose'),
  cacheActions: document.querySelector('#cacheActions'),
  permissionPath: document.querySelector('#permissionPath'),
  permissionMode: document.querySelector('#permissionMode'),
  permissionOwner: document.querySelector('#permissionOwner'),
  permissionPreset: document.querySelector('#permissionPreset'),
  applyPreset: document.querySelector('#applyPreset'),
  useLogDirectory: document.querySelector('#useLogDirectory'),
  applyMode: document.querySelector('#applyMode'),
  applyOwner: document.querySelector('#applyOwner'),
  serviceSelect: document.querySelector('#serviceSelect'),
  startService: document.querySelector('#startService'),
  stopService: document.querySelector('#stopService'),
  restartService: document.querySelector('#restartService'),
  commandHistory: document.querySelector('#commandHistory'),
  commandOutput: document.querySelector('#commandOutput'),
  portMapRows: document.querySelector('#portMapRows'),
  addProject: document.querySelector('#addProject'),
  savePortMap: document.querySelector('#savePortMap'),
  reloadPortMap: document.querySelector('#reloadPortMap'),
  portMapStatus: document.querySelector('#portMapStatus'),
  serviceRows: document.querySelector('#serviceRows'),
  addService: document.querySelector('#addService'),
  saveServices: document.querySelector('#saveServices'),
  reloadServices: document.querySelector('#reloadServices'),
  servicesStatus: document.querySelector('#servicesStatus'),
  saveSettings: document.querySelector('#saveSettings')
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindTabs();
  bindActions();
  await loadSettings();
  await loadCommandHistory();
  const status = await chrome.runtime.sendMessage({ type: 'status' });
  updateStatus(status.status || status.state || 'disconnected');
}

function bindTabs() {
  document.querySelectorAll('.tab').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('is-active', item === button));
      document.querySelectorAll('.panel').forEach((panel) => {
        panel.classList.toggle('is-active', panel.id === button.dataset.tab);
      });
    });
  });
}

function bindActions() {
  elements.connectButton.addEventListener('click', async () => {
    if (state.daemonState === 'connected' || state.daemonState === 'connecting') {
      await chrome.runtime.sendMessage({ type: 'disconnect' });
    } else {
      await chrome.runtime.sendMessage({ type: 'connect' });
    }
  });

  elements.retryButton.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'connect' });
  });

  elements.testConnection.addEventListener('click', async () => {
    await saveConnectionSettings();
    await chrome.runtime.sendMessage({ type: 'settings_updated' });
  });

  elements.toggleToken.addEventListener('click', () => {
    const isHidden = elements.token.type === 'password';
    elements.token.type = isHidden ? 'text' : 'password';
    elements.toggleToken.textContent = isHidden ? 'Hide Token' : 'Reveal Token';
  });

  elements.echoButton.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({
      type: 'send',
      payload: { cmd: 'echo', data: `Popup check at ${new Date().toLocaleTimeString()}` }
    });
  });

  elements.saveSettings.addEventListener('click', async () => {
    await saveConnectionSettings();
    await chrome.runtime.sendMessage({ type: 'settings_updated' });
  });

  elements.addProject.addEventListener('click', () => {
    const rows = readPortMapRows();
    rows.push({ port: '', name: '', logPath: '' });
    renderPortMapRows(rows);
    setPortMapStatus('');
  });

  elements.reloadPortMap.addEventListener('click', requestPortMap);
  elements.savePortMap.addEventListener('click', savePortMap);
  elements.addService.addEventListener('click', () => {
    const rows = readServiceRows();
    rows.push({ serviceId: '', label: '' });
    renderServiceRows(rows);
    setServicesStatus('');
  });
  elements.reloadServices.addEventListener('click', requestServicesConfig);
  elements.saveServices.addEventListener('click', saveServices);
  elements.applyMode.addEventListener('click', () => runPermissionAction('chmod_project_path'));
  elements.applyOwner.addEventListener('click', () => runPermissionAction('chown_project_path'));
  elements.applyPreset.addEventListener('click', runPermissionPreset);
  elements.useLogDirectory.addEventListener('click', useCurrentLogDirectory);
  elements.permissionPath.addEventListener('input', renderPermissionActions);
  elements.permissionMode.addEventListener('input', renderPermissionActions);
  elements.permissionOwner.addEventListener('input', renderPermissionActions);
  elements.permissionPreset.addEventListener('change', renderPermissionActions);
  elements.serviceSelect.addEventListener('change', renderProcessActions);
  elements.startService.addEventListener('click', () => runProcessAction('start_user_service'));
  elements.stopService.addEventListener('click', () => runProcessAction('stop_user_service'));
  elements.restartService.addEventListener('click', () => runProcessAction('restart_user_service'));
  elements.logFilter.addEventListener('input', renderLogs);
  elements.pauseLogs.addEventListener('click', toggleLogPause);
  elements.clearLogs.addEventListener('click', clearLogView);
  elements.restartLogs.addEventListener('click', restartCurrentLog);
}

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  elements.daemonUrl.value = settings.daemonUrl;
  elements.token.value = settings.token;
  state.connectionStatus.daemonUrl = settings.daemonUrl;
  renderDiagnostics();
}

async function loadCommandHistory() {
  const result = await chrome.storage.local.get({ [COMMAND_HISTORY_KEY]: [] });
  const storedHistory = Array.isArray(result[COMMAND_HISTORY_KEY]) ? result[COMMAND_HISTORY_KEY] : [];
  state.commandHistory = storedHistory.map((run) => {
    if (run.status !== 'running') return run;
    return {
      ...run,
      status: 'failed',
      endedAt: new Date().toISOString(),
      error: 'Popup closed before completion'
    };
  });
  state.runningActions = new Set();
  persistCommandHistory();
  renderCommandHistory();
}

async function saveConnectionSettings() {
  const settings = {
    daemonUrl: elements.daemonUrl.value.trim() || DEFAULT_SETTINGS.daemonUrl,
    token: elements.token.value.trim()
  };

  await chrome.storage.local.set(settings);
  state.connectionStatus.daemonUrl = settings.daemonUrl;
  renderDiagnostics();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'daemon_status') {
    updateStatus(message.status || message.state);
  }

  if (message.type === 'daemon_message') {
    handleDaemonMessage(message.payload);
  }
});

function handleDaemonMessage(payload) {
  if (payload.type === 'context') {
    state.context = payload.context;
    state.isLogStreaming = Boolean(payload.context?.logPath);
    renderContext();
    renderLogStatus();
  }

  if (payload.type === 'log_line') {
    appendLogLines(payload.data.split(/\r?\n/).filter(Boolean));
  }

  if (payload.type === 'error') {
    appendLogLines([`[ERROR] ${payload.error}`]);
    state.isLogStreaming = false;
    renderLogStatus('error');
  }

  if (payload.type === 'command_error') {
    appendLogLines([`[ERROR] ${payload.cmd || 'command'}: ${payload.error}`]);
  }

  if (payload.type === 'echo') {
    appendLogLines([`[ECHO] ${payload.data}`]);
  }

  if (payload.type === 'log_stopped' || payload.type === 'log_closed') {
    state.isLogStreaming = false;
    renderLogStatus();
  }

  if (payload.type === 'cache_actions') {
    state.cacheActions = payload.actions || [];
    renderCacheActions();
  }

  if (payload.type === 'cache_action_started') {
    state.runningActions.add(getCommandKey('cache', payload.actionId));
    upsertCommandRun({
      type: 'cache',
      requestId: payload.requestId,
      actionId: payload.actionId,
      label: payload.label,
      status: 'running',
      startedAt: new Date().toISOString(),
      endedAt: '',
      code: null,
      error: '',
      command: payload.command,
      args: payload.args || []
    });
    appendCommandLine(`[${payload.requestId}] [START] ${payload.label}`);
    renderCacheActions();
  }

  if (payload.type === 'cache_action_output') {
    payload.data.split(/\r?\n/).filter(Boolean).forEach((line) => {
      appendCommandLine(`[${payload.requestId}] [${payload.stream}] ${line}`);
    });
  }

  if (payload.type === 'cache_action_finished') {
    state.runningActions.delete(getCommandKey('cache', payload.actionId));
    upsertCommandRun({
      type: 'cache',
      requestId: payload.requestId,
      actionId: payload.actionId,
      label: payload.label || getActionLabel(payload.actionId),
      status: payload.ok ? 'succeeded' : 'failed',
      endedAt: new Date().toISOString(),
      code: payload.code ?? null,
      error: payload.error || ''
    });
    appendCommandLine(payload.ok ? `[${payload.requestId}] [DONE] ${payload.actionId}` : `[${payload.requestId}] [FAILED] ${payload.actionId} (${payload.code ?? payload.error})`);
    renderCacheActions();
  }

  if (payload.type === 'cache_action_failed') {
    state.runningActions.delete(getCommandKey('cache', payload.actionId));
    upsertCommandRun({
      type: 'cache',
      requestId: payload.requestId,
      actionId: payload.actionId,
      label: payload.label || getActionLabel(payload.actionId),
      status: 'failed',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      code: null,
      error: payload.error || 'Command failed'
    });
    appendCommandLine(`[${payload.requestId}] [FAILED] ${payload.actionId}: ${payload.error}`);
    renderCacheActions();
  }

  if (payload.type === 'permission_actions') {
    state.permissionActions = payload.actions || [];
    renderPermissionActions();
  }

  if (payload.type === 'permission_presets') {
    state.permissionPresets = payload.presets || [];
    renderPermissionPresets();
    renderPermissionActions();
  }

  if (payload.type === 'permission_action_started') {
    const key = getCommandKey('permission', payload.actionId, payload.targetPath);
    state.runningActions.add(key);
    upsertCommandRun({
      type: 'permission',
      requestId: payload.requestId,
      actionId: payload.actionId,
      label: payload.label,
      targetPath: payload.targetPath,
      status: 'running',
      startedAt: new Date().toISOString(),
      endedAt: '',
      code: null,
      error: '',
      command: payload.command,
      args: payload.args || []
    });
    appendCommandLine(`[${payload.requestId}] [START] ${payload.label} ${payload.targetPath}`);
    renderPermissionActions();
  }

  if (payload.type === 'permission_action_output') {
    payload.data.split(/\r?\n/).filter(Boolean).forEach((line) => {
      appendCommandLine(`[${payload.requestId}] [${payload.stream}] ${line}`);
    });
  }

  if (payload.type === 'permission_action_finished') {
    const key = getCommandKey('permission', payload.actionId, payload.targetPath);
    state.runningActions.delete(key);
    upsertCommandRun({
      type: 'permission',
      requestId: payload.requestId,
      actionId: payload.actionId,
      label: payload.label || getPermissionActionLabel(payload.actionId),
      targetPath: payload.targetPath,
      status: payload.ok ? 'succeeded' : 'failed',
      endedAt: new Date().toISOString(),
      code: payload.code ?? null,
      error: payload.error || ''
    });
    appendCommandLine(payload.ok ? `[${payload.requestId}] [DONE] ${payload.actionId}` : `[${payload.requestId}] [FAILED] ${payload.actionId} (${payload.code ?? payload.error})`);
    renderPermissionActions();
  }

  if (payload.type === 'permission_action_failed') {
    const key = getCommandKey('permission', payload.actionId, payload.targetPath);
    state.runningActions.delete(key);
    upsertCommandRun({
      type: 'permission',
      requestId: payload.requestId,
      actionId: payload.actionId,
      label: payload.label || getPermissionActionLabel(payload.actionId),
      targetPath: payload.targetPath,
      status: 'failed',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      code: null,
      error: payload.error || 'Command failed'
    });
    appendCommandLine(`[${payload.requestId}] [FAILED] ${payload.actionId}: ${payload.error}`);
    renderPermissionActions();
  }

  if (payload.type === 'process_actions') {
    state.processActions = payload.actions || [];
    renderProcessActions();
  }

  if (payload.type === 'allowed_services') {
    const previousService = elements.serviceSelect.value;
    state.allowedServices = payload.services || [];
    renderAllowedServices(previousService);
    renderProcessActions();
  }

  if (payload.type === 'services_config') {
    state.allowedServices = listServicesFromConfig(payload.services || {});
    renderServiceConfig(payload.services || {});
    renderAllowedServices(elements.serviceSelect.value);
    renderProcessActions();
    setServicesStatus('Services loaded.', 'success');
  }

  if (payload.type === 'services_saved') {
    state.allowedServices = listServicesFromConfig(payload.services || {});
    renderServiceConfig(payload.services || {});
    renderAllowedServices(elements.serviceSelect.value);
    renderProcessActions();
    setServicesStatus('Services saved.', 'success');
  }

  if (payload.type === 'services_error') {
    setServicesStatus((payload.errors || ['Services config is invalid.']).join(' '), 'error');
  }

  if (payload.type === 'process_action_started') {
    const key = getCommandKey('process', payload.actionId, payload.serviceId);
    state.runningActions.add(key);
    upsertCommandRun({
      type: 'process',
      requestId: payload.requestId,
      actionId: payload.actionId,
      label: payload.label,
      serviceId: payload.serviceId,
      status: 'running',
      startedAt: new Date().toISOString(),
      endedAt: '',
      code: null,
      error: '',
      command: payload.command,
      args: payload.args || []
    });
    appendCommandLine(`[${payload.requestId}] [START] ${payload.label}`);
    renderProcessActions();
  }

  if (payload.type === 'process_action_output') {
    payload.data.split(/\r?\n/).filter(Boolean).forEach((line) => {
      appendCommandLine(`[${payload.requestId}] [${payload.stream}] ${line}`);
    });
  }

  if (payload.type === 'process_action_finished') {
    const key = getCommandKey('process', payload.actionId, payload.serviceId);
    state.runningActions.delete(key);
    upsertCommandRun({
      type: 'process',
      requestId: payload.requestId,
      actionId: payload.actionId,
      label: payload.label || getProcessActionLabel(payload.actionId),
      serviceId: payload.serviceId,
      status: payload.ok ? 'succeeded' : 'failed',
      endedAt: new Date().toISOString(),
      code: payload.code ?? null,
      error: payload.error || ''
    });
    appendCommandLine(payload.ok ? `[${payload.requestId}] [DONE] ${payload.actionId} ${payload.serviceId}` : `[${payload.requestId}] [FAILED] ${payload.actionId} ${payload.serviceId} (${payload.code ?? payload.error})`);
    renderProcessActions();
  }

  if (payload.type === 'process_action_failed') {
    const key = getCommandKey('process', payload.actionId, payload.serviceId);
    state.runningActions.delete(key);
    upsertCommandRun({
      type: 'process',
      requestId: payload.requestId,
      actionId: payload.actionId,
      label: payload.label || getProcessActionLabel(payload.actionId),
      serviceId: payload.serviceId,
      status: 'failed',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      code: null,
      error: payload.error || 'Command failed'
    });
    appendCommandLine(`[${payload.requestId}] [FAILED] ${payload.actionId}: ${payload.error}`);
    renderProcessActions();
  }

  if (payload.type === 'port_map') {
    state.portMap = payload.portMap || {};
    renderPortMap();
    setPortMapStatus('Project mappings loaded.', 'success');
  }

  if (payload.type === 'port_map_saved') {
    state.portMap = payload.portMap || {};
    renderPortMap();
    setPortMapStatus('Project mappings saved.', 'success');
  }

  if (payload.type === 'port_map_error') {
    setPortMapStatus((payload.errors || ['Project mappings are invalid.']).join(' '), 'error');
  }
}

function updateStatus(nextState) {
  const nextStatus = normalizeStatus(nextState);
  state.connectionStatus = nextStatus;
  state.daemonState = nextStatus.state;
  state.capabilities = new Set(nextStatus.capabilities || []);
  elements.status.dataset.state = nextStatus.state;
  elements.status.textContent = humanizeState(nextStatus.state);
  elements.connectButton.textContent = nextStatus.state === 'connected' ? 'Disconnect' : 'Connect';
  elements.retryButton.disabled = nextStatus.state === 'connected' || nextStatus.state === 'connecting';
  elements.echoButton.disabled = nextStatus.state !== 'connected';
  state.isLogStreaming = nextStatus.state === 'connected' && Boolean(state.context?.logPath);
  renderDiagnostics();
  renderCacheActions();
  renderPermissionActions();
  renderProcessActions();
  renderPortMap();
  renderServicesSettings();
  renderLogStatus();

  if (nextStatus.state === 'connected') {
    if (hasCapability('cache_actions')) requestCacheActions();
    if (hasCapability('permissions')) requestPermissionActions();
    if (hasCapability('permission_presets')) requestPermissionPresets();
    if (hasCapability('process_controls')) {
      requestProcessActions();
      requestAllowedServices();
    }
    if (hasCapability('editable_port_map')) requestPortMap();
    if (hasCapability('editable_services')) requestServicesConfig();
  }
}

function normalizeStatus(status) {
  if (typeof status === 'string') {
    return {
      ...state.connectionStatus,
      state: status,
      message: statusMessage(status)
    };
  }

  return {
    ...state.connectionStatus,
    ...status,
    state: status?.state || 'disconnected',
    daemonUrl: status?.daemonUrl || elements.daemonUrl.value || DEFAULT_SETTINGS.daemonUrl,
    message: status?.message || statusMessage(status?.state || 'disconnected'),
    closeCode: status?.closeCode ?? null,
    closeReason: status?.closeReason || '',
    protocol: status?.protocol || '',
    daemonVersion: status?.daemonVersion || '',
    capabilities: Array.isArray(status?.capabilities) ? status.capabilities : []
  };
}

function renderDiagnostics() {
  const status = state.connectionStatus;
  elements.connectionDiagnostics.dataset.state = status.state;
  elements.diagnosticMessage.textContent = status.message;
  const protocol = status.protocol ? ` ${status.protocol}${status.daemonVersion ? ` / ${status.daemonVersion}` : ''}` : '';
  elements.diagnosticUrl.textContent = `${status.daemonUrl || elements.daemonUrl.value || DEFAULT_SETTINGS.daemonUrl}${protocol}`;
  elements.diagnosticClose.textContent = status.closeCode ? `${status.closeCode}${status.closeReason ? ` ${status.closeReason}` : ''}` : '-';
}

function statusMessage(status) {
  if (status === 'connected') return 'Connected to the daemon.';
  if (status === 'connecting') return 'Connecting to the daemon.';
  if (status === 'missing_token') return 'Paste the daemon token from ~/.config/lecc/token before connecting.';
  if (status === 'daemon_unavailable') return 'Cannot reach the daemon. Check the user service status.';
  if (status === 'token_rejected') return 'Daemon rejected the token. Paste the current token from ~/.config/lecc/token.';
  if (status === 'protocol_mismatch') return `Daemon protocol is not compatible with ${EXPECTED_PROTOCOL}.`;
  if (status === 'error') return 'Connection error.';
  return 'Not connected.';
}

function renderContext() {
  if (!state.context) return;
  elements.contextName.textContent = `${state.context.name} :${state.context.port}`;
  elements.contextPath.textContent = state.context.logPath || 'No log file mapped for this port.';
}

function renderLogs() {
  const filter = elements.logFilter.value.trim().toLowerCase();
  const lines = filter
    ? state.logLines.filter((line) => line.toLowerCase().includes(filter))
    : state.logLines;

  elements.logOutput.replaceChildren(...lines.map((line) => createLogRow(line)));
  elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
  renderLogStatus();
}

function appendLogLines(lines) {
  if (lines.length === 0) return;

  if (state.isLogPaused) {
    state.pendingLogLines.push(...lines);
    state.pendingLogLines = state.pendingLogLines.slice(-500);
    renderLogStatus();
    return;
  }

  state.logLines.push(...lines);
  state.logLines = state.logLines.slice(-500);
  renderLogs();
}

function createLogRow(line) {
  const level = detectLogLevel(line);
  const row = document.createElement('div');
  row.className = 'log-line';
  row.dataset.level = level;

  const badge = document.createElement('span');
  badge.className = 'log-badge';
  badge.textContent = level === 'plain' ? '--' : level.toUpperCase();

  const text = document.createElement('span');
  text.className = 'log-text';
  text.textContent = line;

  row.append(badge, text);
  return row;
}

function detectLogLevel(line) {
  if (/\b(error|fatal|exception)\b/i.test(line)) return 'error';
  if (/\b(warn|warning)\b/i.test(line)) return 'warn';
  if (/\b(info|notice)\b/i.test(line)) return 'info';
  if (/\b(debug|trace)\b/i.test(line)) return 'debug';
  return 'plain';
}

function toggleLogPause() {
  state.isLogPaused = !state.isLogPaused;

  if (!state.isLogPaused && state.pendingLogLines.length > 0) {
    state.logLines.push(...state.pendingLogLines);
    state.logLines = state.logLines.slice(-500);
    state.pendingLogLines = [];
    renderLogs();
    return;
  }

  renderLogStatus();
}

function clearLogView() {
  state.logLines = [];
  state.pendingLogLines = [];
  renderLogs();
}

async function restartCurrentLog() {
  if (state.daemonState !== 'connected' || !state.context?.port) return;

  await chrome.runtime.sendMessage({
    type: 'send',
    payload: { cmd: 'stop_log' }
  });
  await chrome.runtime.sendMessage({
    type: 'send',
    payload: { cmd: 'set_context', port: state.context.port }
  });
}

function renderLogStatus(forceState = '') {
  const filteredCount = elements.logFilter.value.trim()
    ? state.logLines.filter((line) => line.toLowerCase().includes(elements.logFilter.value.trim().toLowerCase())).length
    : state.logLines.length;
  const pending = state.pendingLogLines.length;

  let statusState = forceState;
  if (!statusState) {
    if (state.isLogPaused) {
      statusState = 'paused';
    } else if (state.daemonState !== 'connected') {
      statusState = 'idle';
    } else if (!state.context?.logPath) {
      statusState = 'idle';
    } else if (state.isLogStreaming) {
      statusState = 'streaming';
    } else {
      statusState = 'idle';
    }
  }

  elements.logStatus.dataset.state = statusState;
  elements.pauseLogs.textContent = state.isLogPaused ? 'Resume' : 'Pause';
  elements.pauseLogs.disabled = state.daemonState !== 'connected' || !state.context?.logPath;
  elements.restartLogs.disabled = state.daemonState !== 'connected' || !state.context?.port;

  const suffix = pending > 0 ? `, ${pending} buffered` : '';
  if (statusState === 'paused') {
    elements.logStatus.textContent = `Paused, ${filteredCount}/500 lines${suffix}`;
  } else if (statusState === 'streaming') {
    elements.logStatus.textContent = `Streaming, ${filteredCount}/500 lines`;
  } else if (statusState === 'error') {
    elements.logStatus.textContent = `Log error, ${filteredCount}/500 lines`;
  } else {
    elements.logStatus.textContent = state.context?.logPath ? `Stopped, ${filteredCount}/500 lines` : 'No log mapped';
  }
}

function renderCacheActions() {
  if (!hasCapability('cache_actions')) {
    elements.cacheActions.innerHTML = '<p class="empty">Daemon does not advertise cache actions.</p>';
    return;
  }

  if (state.daemonState !== 'connected') {
    elements.cacheActions.innerHTML = '<p class="empty">Connect to load actions.</p>';
    return;
  }

  if (state.cacheActions.length === 0) {
    elements.cacheActions.innerHTML = '<p class="empty">No cache actions reported by daemon.</p>';
    return;
  }

  elements.cacheActions.replaceChildren(...state.cacheActions.map((action) => {
    const item = document.createElement('div');
    item.className = 'action-item';

    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = action.label;
    const description = document.createElement('p');
    description.textContent = action.description;
    copy.append(title, description);

    const button = document.createElement('button');
    button.className = 'button secondary';
    button.type = 'button';
    const key = getCommandKey('cache', action.id);
    button.textContent = state.runningActions.has(key) ? 'Running' : 'Run';
    button.disabled = state.daemonState !== 'connected' || state.runningActions.has(key);
    button.addEventListener('click', () => runCacheAction(action.id));

    item.append(copy, button);
    return item;
  }));
}

async function requestCacheActions() {
  if (!hasCapability('cache_actions')) return;
  await chrome.runtime.sendMessage({
    type: 'send',
    payload: { cmd: 'list_cache_actions' }
  });
}

async function runCacheAction(actionId) {
  const key = getCommandKey('cache', actionId);
  if (state.runningActions.has(key)) return;

  const requestId = createRequestId(actionId);
  const action = state.cacheActions.find((item) => item.id === actionId);
  upsertCommandRun({
    type: 'cache',
    requestId,
    actionId,
    label: action?.label || actionId,
    status: 'running',
    startedAt: new Date().toISOString(),
    endedAt: '',
    code: null,
    error: ''
  });
  state.runningActions.add(key);
  renderCacheActions();

  const result = await chrome.runtime.sendMessage({
    type: 'send',
    payload: { cmd: 'run_cache_action', actionId, requestId }
  });

  if (!result?.ok) {
    state.runningActions.delete(key);
    upsertCommandRun({
      type: 'cache',
      requestId,
      actionId,
      label: action?.label || actionId,
      status: 'failed',
      endedAt: new Date().toISOString(),
      error: result?.error || 'Daemon socket is not connected'
    });
    renderCacheActions();
  }
}

async function requestPermissionActions() {
  if (!hasCapability('permissions')) return;
  await chrome.runtime.sendMessage({
    type: 'send',
    payload: { cmd: 'list_permission_actions' }
  });
}

async function requestPermissionPresets() {
  if (!hasCapability('permission_presets')) return;
  await chrome.runtime.sendMessage({
    type: 'send',
    payload: { cmd: 'list_permission_presets' }
  });
}

function renderPermissionPresets() {
  if (state.permissionPresets.length === 0) {
    elements.permissionPreset.replaceChildren(new Option('No presets loaded', ''));
    return;
  }

  elements.permissionPreset.replaceChildren(...state.permissionPresets.map((preset) => (
    new Option(`${preset.label} (${preset.mode})`, preset.id)
  )));
}

function renderPermissionActions() {
  if (!hasCapability('permissions')) {
    elements.applyMode.disabled = true;
    elements.applyOwner.disabled = true;
    elements.applyPreset.disabled = true;
    elements.useLogDirectory.disabled = true;
    return;
  }

  const isConnected = state.daemonState === 'connected';
  const targetPath = elements.permissionPath.value.trim();
  const presetId = elements.permissionPreset.value;
  elements.applyMode.disabled = !isConnected || !targetPath || state.runningActions.has(getCommandKey('permission', 'chmod_project_path', targetPath));
  elements.applyOwner.disabled = !isConnected || !targetPath || state.runningActions.has(getCommandKey('permission', 'chown_project_path', targetPath));
  elements.applyPreset.disabled = !isConnected || !targetPath || !presetId || state.runningActions.has(getCommandKey('permission', `permission_preset:${presetId}`, targetPath));
  elements.useLogDirectory.disabled = !state.context?.logPath;
  elements.applyMode.textContent = state.runningActions.has(getCommandKey('permission', 'chmod_project_path', targetPath)) ? 'Applying' : 'Apply Mode';
  elements.applyOwner.textContent = state.runningActions.has(getCommandKey('permission', 'chown_project_path', targetPath)) ? 'Applying' : 'Apply Owner';
  elements.applyPreset.textContent = state.runningActions.has(getCommandKey('permission', `permission_preset:${presetId}`, targetPath)) ? 'Applying' : 'Apply Preset';
}

async function runPermissionAction(actionId) {
  const targetPath = elements.permissionPath.value.trim();
  const mode = elements.permissionMode.value.trim();
  const owner = elements.permissionOwner.value.trim();
  const key = getCommandKey('permission', actionId, targetPath);
  if (state.runningActions.has(key)) return;

  const requestId = createRequestId(actionId);
  const label = getPermissionActionLabel(actionId);
  upsertCommandRun({
    type: 'permission',
    requestId,
    actionId,
    label,
    targetPath,
    status: 'running',
    startedAt: new Date().toISOString(),
    endedAt: '',
    code: null,
    error: ''
  });
  state.runningActions.add(key);
  renderPermissionActions();

  const result = await chrome.runtime.sendMessage({
    type: 'send',
    payload: {
      cmd: 'run_permission_action',
      actionId,
      requestId,
      params: { targetPath, mode, owner }
    }
  });

  if (!result?.ok) {
    state.runningActions.delete(key);
    upsertCommandRun({
      type: 'permission',
      requestId,
      actionId,
      label,
      targetPath,
      status: 'failed',
      endedAt: new Date().toISOString(),
      error: result?.error || 'Daemon socket is not connected'
    });
    renderPermissionActions();
  }
}

async function runPermissionPreset() {
  const targetPath = elements.permissionPath.value.trim();
  const presetId = elements.permissionPreset.value;
  const actionId = `permission_preset:${presetId}`;
  const key = getCommandKey('permission', actionId, targetPath);
  if (!presetId || state.runningActions.has(key)) return;

  const preset = state.permissionPresets.find((item) => item.id === presetId);
  const requestId = createRequestId(actionId);
  const label = preset?.label || presetId;
  upsertCommandRun({
    type: 'permission',
    requestId,
    actionId,
    label,
    targetPath,
    status: 'running',
    startedAt: new Date().toISOString(),
    endedAt: '',
    code: null,
    error: ''
  });
  state.runningActions.add(key);
  renderPermissionActions();

  const result = await chrome.runtime.sendMessage({
    type: 'send',
    payload: {
      cmd: 'run_permission_preset',
      presetId,
      requestId,
      params: { targetPath }
    }
  });

  if (!result?.ok) {
    state.runningActions.delete(key);
    upsertCommandRun({
      type: 'permission',
      requestId,
      actionId,
      label,
      targetPath,
      status: 'failed',
      endedAt: new Date().toISOString(),
      error: result?.error || 'Daemon socket is not connected'
    });
    renderPermissionActions();
  }
}

function useCurrentLogDirectory() {
  if (!state.context?.logPath) return;
  elements.permissionPath.value = parentPath(state.context.logPath);
  renderPermissionActions();
}

function parentPath(pathValue) {
  const normalized = String(pathValue || '').replace(/\/+$/, '');
  const index = normalized.lastIndexOf('/');
  if (index <= 0) return normalized || '/';
  return normalized.slice(0, index);
}

async function requestProcessActions() {
  if (!hasCapability('process_controls')) return;
  await chrome.runtime.sendMessage({
    type: 'send',
    payload: { cmd: 'list_process_actions' }
  });
}

async function requestAllowedServices() {
  if (!hasCapability('process_controls')) return;
  await chrome.runtime.sendMessage({
    type: 'send',
    payload: { cmd: 'list_allowed_services' }
  });
}

function renderAllowedServices(preferredService = '') {
  if (state.allowedServices.length === 0) {
    elements.serviceSelect.replaceChildren(new Option('No services allow-listed', ''));
    return;
  }

  elements.serviceSelect.replaceChildren(...state.allowedServices.map((service) => (
    new Option(`${service.label} (${service.id})`, service.id)
  )));

  if (preferredService && state.allowedServices.some((service) => service.id === preferredService)) {
    elements.serviceSelect.value = preferredService;
  }
}

function renderProcessActions() {
  if (!hasCapability('process_controls')) {
    elements.startService.disabled = true;
    elements.stopService.disabled = true;
    elements.restartService.disabled = true;
    return;
  }

  const isConnected = state.daemonState === 'connected';
  const serviceId = elements.serviceSelect.value;
  setProcessButton(elements.startService, 'start_user_service', serviceId, 'Start', isConnected);
  setProcessButton(elements.stopService, 'stop_user_service', serviceId, 'Stop', isConnected);
  setProcessButton(elements.restartService, 'restart_user_service', serviceId, 'Restart', isConnected);
}

function setProcessButton(button, actionId, serviceId, label, isConnected) {
  const key = getCommandKey('process', actionId, serviceId);
  const isRunning = state.runningActions.has(key);
  button.disabled = !isConnected || !serviceId || isRunning;
  button.textContent = isRunning ? 'Running' : label;
}

async function runProcessAction(actionId) {
  const serviceId = elements.serviceSelect.value;
  const key = getCommandKey('process', actionId, serviceId);
  if (!serviceId || state.runningActions.has(key)) return;

  const requestId = createRequestId(actionId);
  const service = state.allowedServices.find((item) => item.id === serviceId);
  const actionLabel = getProcessActionLabel(actionId);
  const label = `${actionLabel}: ${service?.label || serviceId}`;

  upsertCommandRun({
    type: 'process',
    requestId,
    actionId,
    label,
    serviceId,
    status: 'running',
    startedAt: new Date().toISOString(),
    endedAt: '',
    code: null,
    error: ''
  });
  state.runningActions.add(key);
  renderProcessActions();

  const result = await chrome.runtime.sendMessage({
    type: 'send',
    payload: {
      cmd: 'run_process_action',
      actionId,
      requestId,
      serviceId
    }
  });

  if (!result?.ok) {
    state.runningActions.delete(key);
    upsertCommandRun({
      type: 'process',
      requestId,
      actionId,
      label,
      serviceId,
      status: 'failed',
      endedAt: new Date().toISOString(),
      error: result?.error || 'Daemon socket is not connected'
    });
    renderProcessActions();
  }
}

async function requestServicesConfig() {
  if (!hasCapability('editable_services')) return;
  if (state.daemonState !== 'connected') return;
  setServicesStatus('Loading services.');
  await chrome.runtime.sendMessage({
    type: 'send',
    payload: { cmd: 'get_services' }
  });
}

function renderServicesSettings() {
  if (!hasCapability('editable_services')) {
    elements.serviceRows.innerHTML = '<p class="empty">Daemon does not advertise editable services.</p>';
    elements.addService.disabled = true;
    elements.saveServices.disabled = true;
    elements.reloadServices.disabled = true;
    return;
  }

  if (state.daemonState !== 'connected') {
    elements.serviceRows.innerHTML = '<p class="empty">Connect to load services.</p>';
    elements.addService.disabled = true;
    elements.saveServices.disabled = true;
    elements.reloadServices.disabled = true;
    return;
  }

  elements.addService.disabled = false;
  elements.saveServices.disabled = false;
  elements.reloadServices.disabled = false;
}

function renderServiceConfig(services) {
  const rows = Object.entries(services).map(([serviceId, service]) => ({
    serviceId,
    label: service.label || ''
  }));
  renderServiceRows(rows);
}

function renderServiceRows(rows) {
  if (rows.length === 0) {
    elements.serviceRows.innerHTML = '<p class="empty">No services allow-listed yet.</p>';
    return;
  }

  elements.serviceRows.replaceChildren(...rows.map((row) => createServiceRow(row)));
}

function createServiceRow(row) {
  const wrapper = document.createElement('div');
  wrapper.className = 'service-row';

  const serviceId = createInputField('Service', 'serviceId', row.serviceId, 'my-app.service');
  const label = createInputField('Label', 'label', row.label, 'My App');
  const remove = document.createElement('button');
  remove.className = 'icon-button';
  remove.type = 'button';
  remove.title = 'Remove service';
  remove.textContent = 'X';
  remove.addEventListener('click', () => {
    wrapper.remove();
    if (elements.serviceRows.children.length === 0) {
      renderServiceRows([]);
    }
  });

  wrapper.append(serviceId, label, remove);
  return wrapper;
}

function readServiceRows() {
  return [...elements.serviceRows.querySelectorAll('.service-row')].map((row) => ({
    serviceId: row.querySelector('[data-key="serviceId"]').value.trim(),
    label: row.querySelector('[data-key="label"]').value.trim()
  }));
}

async function saveServices() {
  if (!hasCapability('editable_services')) return;
  const rows = readServiceRows();
  const services = {};

  rows.forEach((row) => {
    if (!row.serviceId && !row.label) return;
    services[row.serviceId] = { label: row.label };
  });

  setServicesStatus('Saving services.');
  await chrome.runtime.sendMessage({
    type: 'send',
    payload: { cmd: 'save_services', services }
  });
}

function listServicesFromConfig(services) {
  return Object.entries(services).map(([id, service]) => ({
    id,
    label: service.label || id
  }));
}

function setServicesStatus(message, tone = '') {
  elements.servicesStatus.textContent = message;
  if (tone) {
    elements.servicesStatus.dataset.tone = tone;
  } else {
    delete elements.servicesStatus.dataset.tone;
  }
}

function upsertCommandRun(nextRun) {
  const existing = state.commandHistory.find((run) => run.requestId === nextRun.requestId);

  if (existing) {
    Object.assign(existing, nextRun);
  } else {
    state.commandHistory.unshift(nextRun);
  }

  state.commandHistory = state.commandHistory.slice(0, COMMAND_HISTORY_LIMIT);
  persistCommandHistory();
  renderCommandHistory();
}

function renderCommandHistory() {
  if (state.commandHistory.length === 0) {
    elements.commandHistory.innerHTML = '<p class="empty">No command runs yet.</p>';
    return;
  }

  elements.commandHistory.replaceChildren(...state.commandHistory.map((run) => {
    const item = document.createElement('div');
    item.className = 'history-item';

    const copy = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = run.label || run.actionId;
    const meta = document.createElement('div');
    meta.className = 'history-meta';
    meta.textContent = formatCommandMeta(run);
    copy.append(title, meta);

    const status = document.createElement('span');
    status.className = 'history-status';
    status.dataset.status = run.status;
    status.textContent = run.status;

    item.append(copy, status);
    return item;
  }));
}

function persistCommandHistory() {
  chrome.storage.local.set({
    [COMMAND_HISTORY_KEY]: state.commandHistory.slice(0, COMMAND_HISTORY_LIMIT)
  }).catch(() => {});
}

function formatCommandMeta(run) {
  const started = run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : 'unknown';
  const ended = run.endedAt ? new Date(run.endedAt).toLocaleTimeString() : '';
  const code = run.code === null || run.code === undefined ? '' : ` code ${run.code}`;
  const error = run.error ? ` ${run.error}` : '';
  const request = run.requestId ? ` ${run.requestId}` : '';
  const target = run.targetPath ? ` ${run.targetPath}` : '';
  const service = run.serviceId ? ` ${run.serviceId}` : '';
  const type = run.type ? `${run.type} ` : '';
  return ended ? `${type}${started} -> ${ended}${code}${error}${request}${target}${service}` : `${type}${started}${request}${target}${service}`;
}

function createRequestId(actionId) {
  const random = crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
  return `${Date.now().toString(36)}-${actionId}-${random}`;
}

function getActionLabel(actionId) {
  return state.cacheActions.find((action) => action.id === actionId)?.label || actionId || 'Cache action';
}

function getPermissionActionLabel(actionId) {
  return state.permissionActions.find((action) => action.id === actionId)?.label || actionId || 'Permission action';
}

function getProcessActionLabel(actionId) {
  return state.processActions.find((action) => action.id === actionId)?.label || actionId || 'Service action';
}

function hasCapability(capability) {
  return state.capabilities.has(capability);
}

function getCommandKey(type, actionId, targetPath = '') {
  return `${type}:${actionId}:${targetPath}`;
}

function renderPortMap() {
  if (!hasCapability('editable_port_map')) {
    elements.portMapRows.innerHTML = '<p class="empty">Daemon does not advertise editable project mappings.</p>';
    elements.savePortMap.disabled = true;
    elements.reloadPortMap.disabled = true;
    elements.addProject.disabled = true;
    return;
  }

  if (state.daemonState !== 'connected') {
    elements.portMapRows.innerHTML = '<p class="empty">Connect to load project mappings.</p>';
    elements.savePortMap.disabled = true;
    elements.reloadPortMap.disabled = true;
    elements.addProject.disabled = true;
    return;
  }

  elements.savePortMap.disabled = false;
  elements.reloadPortMap.disabled = false;
  elements.addProject.disabled = false;

  const rows = Object.entries(state.portMap).map(([port, entry]) => ({
    port,
    name: entry.name || '',
    logPath: entry.logPath || ''
  }));

  renderPortMapRows(rows);
}

function renderPortMapRows(rows) {
  if (rows.length === 0) {
    elements.portMapRows.innerHTML = '<p class="empty">No projects mapped yet.</p>';
    return;
  }

  elements.portMapRows.replaceChildren(...rows.map((row) => createProjectRow(row)));
}

function createProjectRow(row) {
  const wrapper = document.createElement('div');
  wrapper.className = 'project-row';

  const port = createInputField('Port', 'port', row.port, '3000');
  const name = createInputField('Name', 'name', row.name, 'Frontend');
  const logPath = createInputField('Log Path', 'logPath', row.logPath, '/tmp/lecc-demo.log');
  const remove = document.createElement('button');
  remove.className = 'icon-button';
  remove.type = 'button';
  remove.title = 'Remove project mapping';
  remove.textContent = 'X';
  remove.addEventListener('click', () => {
    wrapper.remove();
    if (elements.portMapRows.children.length === 0) {
      renderPortMapRows([]);
    }
  });

  wrapper.append(port, name, logPath, remove);
  return wrapper;
}

function createInputField(label, key, value, placeholder) {
  const field = document.createElement('label');
  field.className = 'field';

  const text = document.createElement('span');
  text.textContent = label;

  const input = document.createElement('input');
  input.dataset.key = key;
  input.value = value;
  input.placeholder = placeholder;

  field.append(text, input);
  return field;
}

function readPortMapRows() {
  return [...elements.portMapRows.querySelectorAll('.project-row')].map((row) => ({
    port: row.querySelector('[data-key="port"]').value.trim(),
    name: row.querySelector('[data-key="name"]').value.trim(),
    logPath: row.querySelector('[data-key="logPath"]').value.trim()
  }));
}

async function requestPortMap() {
  if (!hasCapability('editable_port_map')) return;
  if (state.daemonState !== 'connected') return;
  setPortMapStatus('Loading project mappings.');
  await chrome.runtime.sendMessage({
    type: 'send',
    payload: { cmd: 'get_port_map' }
  });
}

async function savePortMap() {
  if (!hasCapability('editable_port_map')) return;
  const rows = readPortMapRows();
  const portMap = {};

  rows.forEach((row) => {
    if (!row.port && !row.name && !row.logPath) return;
    portMap[row.port] = {
      name: row.name,
      logPath: row.logPath
    };
  });

  setPortMapStatus('Saving project mappings.');
  await chrome.runtime.sendMessage({
    type: 'send',
    payload: { cmd: 'save_port_map', portMap }
  });
}

function setPortMapStatus(message, tone = '') {
  elements.portMapStatus.textContent = message;
  if (tone) {
    elements.portMapStatus.dataset.tone = tone;
  } else {
    delete elements.portMapStatus.dataset.tone;
  }
}

function appendCommandLine(line) {
  state.commandLines.push(line);
  state.commandLines = state.commandLines.slice(-120);
  elements.commandOutput.textContent = state.commandLines.join('\n');
  elements.commandOutput.scrollTop = elements.commandOutput.scrollHeight;
}

function humanizeState(value) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
