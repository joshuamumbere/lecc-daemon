import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import { validatePortMap } from './port-map.js';

const allowedDirs = ['/tmp/lecc-tests'];

describe('validatePortMap', () => {
  it('accepts a valid port map', () => {
    const result = validatePortMap({
      3000: {
        name: 'Frontend',
        logPath: '/tmp/lecc-tests/frontend.log'
      }
    }, allowedDirs);

    assert.equal(result.ok, true);
    assert.deepEqual(result.portMap, {
      3000: {
        name: 'Frontend',
        logPath: resolve('/tmp/lecc-tests/frontend.log')
      }
    });
  });

  it('rejects an invalid port', () => {
    const result = validatePortMap({
      99999: {
        name: 'Bad',
        logPath: '/tmp/lecc-tests/bad.log'
      }
    }, allowedDirs);

    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /port must be a number/);
  });

  it('rejects an empty project name', () => {
    const result = validatePortMap({
      3000: {
        name: '',
        logPath: '/tmp/lecc-tests/app.log'
      }
    }, allowedDirs);

    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /project name is required/);
  });

  it('rejects a log path outside allowed directories', () => {
    const result = validatePortMap({
      3000: {
        name: 'Frontend',
        logPath: '/etc/passwd'
      }
    }, allowedDirs);

    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /outside allowed directories/);
  });
});
