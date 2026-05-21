const DEFAULT_SETTINGS = {
  daemonUrl: 'ws://127.0.0.1:17324',
  token: ''
};

let socket = null;
let socketStatus = {
  state: 'disconnected',
  daemonUrl: DEFAULT_SETTINGS.daemonUrl,
  message: 'Not connected',
  closeCode: null,
  closeReason: ''
};
let reconnectTimer = null;
let sawOpen = false;

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(DEFAULT_SETTINGS);
  await chrome.storage.local.set({ ...DEFAULT_SETTINGS, ...current });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});

chrome.tabs.onActivated.addListener(() => updateActiveTabContext());
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    updateActiveTabContext(tab);
  }
});

async function handleMessage(message) {
  switch (message.type) {
    case 'connect':
      return connect();
    case 'disconnect':
      disconnect();
      return { ok: true, status: socketStatus };
    case 'status':
      return { ok: true, status: socketStatus };
    case 'settings_updated':
      disconnect();
      return connect();
    case 'send':
      return sendToDaemon(message.payload);
    default:
      return { ok: false, error: 'Unknown extension message' };
  }
}

async function connect() {
  const settings = await getSettings();
  updateSocketStatus({
    daemonUrl: settings.daemonUrl,
    closeCode: null,
    closeReason: ''
  });

  if (!settings.token) {
    updateSocketStatus({
      state: 'missing_token',
      message: 'Paste the daemon token from ~/.config/lecc/token before connecting.'
    });
    return { ok: false, status: socketStatus };
  }

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return { ok: true, status: socketStatus };
  }

  sawOpen = false;
  updateSocketStatus({
    state: 'connecting',
    message: `Connecting to ${settings.daemonUrl}.`
  });
  socket = new WebSocket(settings.daemonUrl);

  socket.addEventListener('open', async () => {
    sawOpen = true;
    updateSocketStatus({
      state: 'connected',
      message: `Connected to ${settings.daemonUrl}.`
    });
    await sendToDaemon({ cmd: 'ping' });
    await updateActiveTabContext();
  });

  socket.addEventListener('message', (event) => {
    let payload = null;
    try {
      payload = JSON.parse(event.data);
    } catch {
      payload = { type: 'raw', data: event.data };
    }
    broadcast({ type: 'daemon_message', payload });
  });

  socket.addEventListener('close', (event) => {
    socket = null;
    const detail = classifyClose(event, sawOpen, settings.daemonUrl);
    updateSocketStatus(detail);
  });

  socket.addEventListener('error', () => {
    if (!sawOpen) {
      updateSocketStatus({
        state: 'daemon_unavailable',
        message: `Cannot reach daemon at ${settings.daemonUrl}. Check the user service status.`
      });
    } else {
      updateSocketStatus({
        state: 'error',
        message: 'WebSocket error while connected to the daemon.'
      });
    }
  });

  return { ok: true, status: socketStatus };
}

function disconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;

  if (socket) {
    socket.close();
    socket = null;
  }

  updateSocketStatus({
    state: 'disconnected',
    message: 'Disconnected by user.',
    closeCode: null,
    closeReason: ''
  });
}

async function sendToDaemon(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return { ok: false, error: 'Daemon socket is not connected', status: socketStatus };
  }

  const { token } = await getSettings();
  socket.send(JSON.stringify({ ...payload, token }));
  return { ok: true, status: socketStatus };
}

async function updateActiveTabContext(existingTab) {
  const [activeTab] = existingTab ? [existingTab] : await chrome.tabs.query({ active: true, currentWindow: true });
  if (!activeTab?.url) return;

  const port = extractPort(activeTab.url);
  if (!port) return;

  await sendToDaemon({ cmd: 'set_context', port });
}

function extractPort(tabUrl) {
  try {
    const url = new URL(tabUrl);
    return url.port || (url.protocol === 'https:' ? '443' : '80');
  } catch {
    return '';
  }
}

async function getSettings() {
  return chrome.storage.local.get(DEFAULT_SETTINGS);
}

function broadcast(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

function updateSocketStatus(nextStatus) {
  socketStatus = {
    ...socketStatus,
    ...nextStatus
  };
  broadcast({ type: 'daemon_status', status: socketStatus });
}

function classifyClose(event, opened, daemonUrl) {
  if (event.code === 1008) {
    return {
      state: 'token_rejected',
      daemonUrl,
      message: 'Daemon rejected the token. Paste the current token from ~/.config/lecc/token.',
      closeCode: event.code,
      closeReason: event.reason || ''
    };
  }

  if (!opened) {
    return {
      state: 'daemon_unavailable',
      daemonUrl,
      message: `Cannot reach daemon at ${daemonUrl}. Check whether lecc-daemon.service is running.`,
      closeCode: event.code,
      closeReason: event.reason || ''
    };
  }

  return {
    state: 'disconnected',
    daemonUrl,
    message: 'Daemon connection closed.',
    closeCode: event.code,
    closeReason: event.reason || ''
  };
}
