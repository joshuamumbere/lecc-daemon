const DEFAULT_SETTINGS = {
  daemonUrl: 'ws://127.0.0.1:17324',
  token: ''
};

const state = {
  daemonState: 'disconnected',
  logLines: [],
  context: null
};

const elements = {
  status: document.querySelector('#status'),
  contextName: document.querySelector('#contextName'),
  contextPath: document.querySelector('#contextPath'),
  logOutput: document.querySelector('#logOutput'),
  logFilter: document.querySelector('#logFilter'),
  daemonUrl: document.querySelector('#daemonUrl'),
  token: document.querySelector('#token'),
  connectButton: document.querySelector('#connectButton'),
  echoButton: document.querySelector('#echoButton'),
  saveSettings: document.querySelector('#saveSettings')
};

document.addEventListener('DOMContentLoaded', init);

async function init() {
  bindTabs();
  bindActions();
  await loadSettings();
  const status = await chrome.runtime.sendMessage({ type: 'status' });
  updateStatus(status.state || 'disconnected');
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

  elements.echoButton.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({
      type: 'send',
      payload: { cmd: 'echo', data: `Popup check at ${new Date().toLocaleTimeString()}` }
    });
  });

  elements.saveSettings.addEventListener('click', async () => {
    await chrome.storage.local.set({
      daemonUrl: elements.daemonUrl.value.trim() || DEFAULT_SETTINGS.daemonUrl,
      token: elements.token.value.trim()
    });
    await chrome.runtime.sendMessage({ type: 'settings_updated' });
  });

  elements.logFilter.addEventListener('input', renderLogs);
}

async function loadSettings() {
  const settings = await chrome.storage.local.get(DEFAULT_SETTINGS);
  elements.daemonUrl.value = settings.daemonUrl;
  elements.token.value = settings.token;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'daemon_status') {
    updateStatus(message.state);
  }

  if (message.type === 'daemon_message') {
    handleDaemonMessage(message.payload);
  }
});

function handleDaemonMessage(payload) {
  if (payload.type === 'context') {
    state.context = payload.context;
    renderContext();
  }

  if (payload.type === 'log_line') {
    state.logLines.push(...payload.data.split(/\r?\n/).filter(Boolean));
    state.logLines = state.logLines.slice(-500);
    renderLogs();
  }

  if (payload.type === 'error') {
    state.logLines.push(`[ERROR] ${payload.error}`);
    renderLogs();
  }

  if (payload.type === 'echo') {
    state.logLines.push(`[ECHO] ${payload.data}`);
    renderLogs();
  }
}

function updateStatus(nextState) {
  state.daemonState = nextState;
  elements.status.dataset.state = nextState;
  elements.status.textContent = humanizeState(nextState);
  elements.connectButton.textContent = nextState === 'connected' ? 'Disconnect' : 'Connect';
  elements.echoButton.disabled = nextState !== 'connected';
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

  elements.logOutput.textContent = lines.join('\n');
  elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
}

function humanizeState(value) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
