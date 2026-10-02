import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runPluginValidate } from '../src/run-plugin-validate.js';

let dir: string;

/** Write an executable stand-in for the `claude` CLI that prints fixed stdout. */
function fakeCli(name: string, stdout: string, exit = 0): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\ncat <<'EOF'\n${stdout}\nEOF\nexit ${exit}\n`);
  chmodSync(path, 0o755);
  return path;
}

describe('runPluginValidate', () => {
  before(() => { dir = mkdtempSync(join(tmpdir(), 'rpv-')); });
  after(() => { rmSync(dir, { recursive: true, force: true }); });

  it('maps manifest and content errors/warnings, ignoring notes', () => {
    const cli = fakeCli('ok', JSON.stringify({
      manifest: {
        file: '/p/.claude-plugin/plugin.json',
        errors: [{ path: 'name', message: 'reserved' }],
        warnings: [{ path: 'author', message: 'missing author' }],
        notes: [{ message: 'fyi' }],
      },
      contents: [{ file: '/p/skills/a/SKILL.md', errors: [], warnings: [{ path: 'description', message: 'none' }] }],
    }), 1);
    const results = runPluginValidate('/p', cli);
    assert.deepEqual(
      results.map((r) => [r.filePath, r.severity, r.message]),
      [
        ['/p/.claude-plugin/plugin.json', 'error', 'name: reserved'],
        ['/p/.claude-plugin/plugin.json', 'warning', 'author: missing author'],
        ['/p/skills/a/SKILL.md', 'warning', 'description: none'],
      ],
    );
    assert.ok(results.every((r) => r.rule === 'claude-plugin-validate'));
  });

  it('returns nothing for a clean report', () => {
    const cli = fakeCli('clean', JSON.stringify({ manifest: null, contents: [] }));
    assert.deepEqual(runPluginValidate('/p', cli), []);
  });

  it('errors when the CLI is missing', () => {
    const results = runPluginValidate('/p', join(dir, 'does-not-exist'));
    assert.equal(results.length, 1);
    assert.equal(results[0].rule, 'claude-plugin-validate-unavailable');
    assert.equal(results[0].severity, 'error');
    assert.match(results[0].message, /not found/);
  });

  it('errors when output is not JSON', () => {
    const cli = fakeCli('garbage', 'not json', 2);
    const results = runPluginValidate('/p', cli);
    assert.equal(results[0].rule, 'claude-plugin-validate-unavailable');
    assert.match(results[0].message, /exit 2/);
  });
});
