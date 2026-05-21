const DEFAULT_SETTINGS = {
  daemonUrl: 'ws://127.0.0.1:17324',
  token: ''
};

let socket = null;
let socketState = 'disconnected';
let reconnectTimer = null;

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
      return { ok: true, state: socketState };
    case 'status':
      return { ok: true, state: socketState };
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
  if (!settings.token) {
    socketState = 'missing_token';
    broadcast({ type: 'daemon_status', state: socketState });
    return { ok: false, state: socketState };
  }

  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return { ok: true, state: socketState };
  }

  socketState = 'connecting';
  broadcast({ type: 'daemon_status', state: socketState });
  socket = new WebSocket(settings.daemonUrl);

  socket.addEventListener('open', async () => {
    socketState = 'connected';
    broadcast({ type: 'daemon_status', state: socketState });
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

  socket.addEventListener('close', () => {
    socket = null;
    socketState = 'disconnected';
    broadcast({ type: 'daemon_status', state: socketState });
  });

  socket.addEventListener('error', () => {
    socketState = 'error';
    broadcast({ type: 'daemon_status', state: socketState });
  });

  return { ok: true, state: socketState };
}

function disconnect() {
  clearTimeout(reconnectTimer);
  reconnectTimer = null;

  if (socket) {
    socket.close();
    socket = null;
  }

  socketState = 'disconnected';
  broadcast({ type: 'daemon_status', state: socketState });
}

async function sendToDaemon(payload) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    return { ok: false, error: 'Daemon socket is not connected', state: socketState };
  }

  const { token } = await getSettings();
  socket.send(JSON.stringify({ ...payload, token }));
  return { ok: true, state: socketState };
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
