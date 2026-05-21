import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRouter } from './router.js';
import { CAPABILITIES, DAEMON_VERSION, LECC_PROTOCOL } from './protocol.js';

describe('router protocol and errors', () => {
  it('ping includes protocol metadata', async () => {
    const messages = [];
    const route = createRouter(testConfig());
    const ws = fakeWs(messages);

    await route(ws, { cmd: 'ping' });

    assert.equal(messages.length, 1);
    assert.equal(messages[0].type, 'pong');
    assert.equal(messages[0].protocol, LECC_PROTOCOL);
    assert.equal(messages[0].daemonVersion, DAEMON_VERSION);
    assert.deepEqual(messages[0].capabilities, CAPABILITIES);
  });

  it('unknown command returns structured command_error', async () => {
    const messages = [];
    const route = createRouter(testConfig());
    const ws = fakeWs(messages);

    await route(ws, { cmd: 'nope' });

    assert.deepEqual(messages, [{
      type: 'command_error',
      cmd: 'nope',
      code: 'unknown_command',
      error: 'Command is not allow-listed'
    }]);
  });
});

function fakeWs(messages) {
  return {
    readyState: 1,
    send(payload) {
      messages.push(JSON.parse(payload));
    }
  };
}

function testConfig() {
  const dir = mkdtempSync(join(tmpdir(), 'lecc-router-test-'));
  const portMapPath = join(dir, 'port-map.json');
  const servicesPath = join(dir, 'services.json');
  writeFileSync(portMapPath, '{}\n');
  writeFileSync(servicesPath, '{}\n');

  return {
    portMapPath,
    servicesPath,
    allowedLogDirs: [dir],
    allowedPermissionDirs: [dir]
  };
}
