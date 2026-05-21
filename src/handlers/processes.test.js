import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateService, validateServices } from './processes.js';

describe('validateServices', () => {
  it('accepts valid service config', () => {
    const result = validateServices({
      'vite-app.service': { label: 'Vite App' }
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.services, {
      'vite-app.service': { label: 'Vite App' }
    });
  });

  it('rejects invalid unit names', () => {
    const result = validateServices({
      'bad;unit': { label: 'Bad' }
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /valid \.service unit name/);
  });

  it('rejects empty labels', () => {
    const result = validateServices({
      'api.service': { label: '' }
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /label is required/);
  });
});

describe('validateService', () => {
  it('rejects services not in the allow-list', () => {
    const result = validateService('api.service', {
      'worker.service': { label: 'Worker' }
    });

    assert.equal(result.ok, false);
    assert.match(result.error, /not allow-listed/);
  });
});
