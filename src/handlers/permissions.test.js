import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { resolve } from 'node:path';
import { validatePermissionParams } from './permissions.js';

const allowedDirs = ['/tmp/lecc-tests'];

describe('validatePermissionParams', () => {
  it('accepts a safe chmod mode', () => {
    const result = validatePermissionParams('chmod_project_path', {
      targetPath: '/tmp/lecc-tests/storage',
      mode: '775'
    }, allowedDirs);

    assert.equal(result.ok, true);
    assert.equal(result.mode, '775');
    assert.equal(result.targetPath, resolve('/tmp/lecc-tests/storage'));
  });

  it('rejects an unsafe chmod mode', () => {
    const result = validatePermissionParams('chmod_project_path', {
      targetPath: '/tmp/lecc-tests/storage',
      mode: '777'
    }, allowedDirs);

    assert.equal(result.ok, false);
    assert.match(result.error, /Mode must be/);
  });

  it('rejects an unsafe owner value', () => {
    const result = validatePermissionParams('chown_project_path', {
      targetPath: '/tmp/lecc-tests/storage',
      owner: 'root;rm -rf /'
    }, allowedDirs);

    assert.equal(result.ok, false);
    assert.match(result.error, /Owner must be/);
  });

  it('rejects paths outside allowed directories', () => {
    const result = validatePermissionParams('chmod_project_path', {
      targetPath: '/etc/passwd',
      mode: '644'
    }, allowedDirs);

    assert.equal(result.ok, false);
    assert.match(result.error, /outside allowed permission directories/);
  });
});
