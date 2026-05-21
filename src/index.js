import { WebSocketServer } from 'ws';
import { createRouter, send } from './router.js';
import { ensureToken, getDaemonConfig, parseJsonMessage } from './config.js';

const config = getDaemonConfig();
const token = ensureToken(config.tokenPath);
const route = createRouter(config);

const server = new WebSocketServer({
  host: config.host,
  port: config.port,
  verifyClient: ({ origin }, done) => {
    if (config.allowedOrigins.length === 0) {
      done(true);
      return;
    }

    done(config.allowedOrigins.includes(origin));
  }
});

server.on('connection', (ws) => {
  ws.isAuthed = false;

  ws.on('message', async (raw) => {
    const message = parseJsonMessage(raw);
    if (!message || message.token !== token) {
      ws.close(1008);
      return;
    }

    ws.isAuthed = true;
    await route(ws, message);
  });

  ws.on('close', () => {
    route(ws, { cmd: 'stop_log', token });
  });

  send(ws, { type: 'hello', protocol: 'lecc.v1' });
});

server.on('listening', () => {
  console.log(`LECC daemon listening on ws://${config.host}:${config.port}`);
  console.log(`Token path: ${config.tokenPath}`);
  console.log(`Token: ${token}`);
});
