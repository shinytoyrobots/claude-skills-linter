import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadConfig, ConfigError } from '../src/config.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'skill-lint-test-'));
}

describe('loadConfig', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // AC-1: Config file exists -> loads it
  it('AC-1: loads config when .skill-lint.yaml exists', () => {
    writeFileSync(join(tmp, '.skill-lint.yaml'), 'skills_root: "./skills"\ndefault_level: 2\n');
    const config = loadConfig(tmp);
    assert.equal(config.skills_root, './skills');
    assert.equal(config.default_level, 2);
  });

  // AC-2: Config file missing -> returns defaults with all fields verified
  it('AC-2: returns defaults when .skill-lint.yaml is missing', () => {
    const config = loadConfig(tmp);
    assert.equal(config.skills_root, '.');
    assert.equal(config.default_level, 0);
    assert.deepEqual(config.levels, {});
    assert.deepEqual(config.tools, { mcp_pattern: 'mcp__*', custom: [] });
    assert.deepEqual(config.models, ['opus', 'sonnet', 'haiku']);
    assert.deepEqual(config.limits, { max_file_size: 15360 });
    assert.deepEqual(config.ignore, ['**/README.md']);
    assert.equal(config.prefixes, 'PREFIXES.md');
    assert.deepEqual(config.graph, {
      warn_orphans: true,
      warn_fanout_above: 50000,
      detect_cycles: true,
      detect_duplicates: true,
    });
  });

  // AC-3: Deep merge - partial nested override merges correctly
  it('AC-3: deep-merges partial nested overrides with defaults', () => {
    // Only override max_file_size in limits; tools.custom should merge with mcp_pattern default
    writeFileSync(
      join(tmp, '.skill-lint.yaml'),
      'limits:\n  max_file_size: 30000\ntools:\n  custom:\n    - my_tool\n',
    );
    const config = loadConfig(tmp);

    // limits: user overrode max_file_size
    assert.equal(config.limits.max_file_size, 30000);

    // tools: custom replaced, mcp_pattern kept from defaults
    assert.equal(config.tools.mcp_pattern, 'mcp__*');
    assert.deepEqual(config.tools.custom, ['my_tool']);
  });

  it('AC-3: deep-merges partial graph overrides', () => {
    writeFileSync(
      join(tmp, '.skill-lint.yaml'),
      'graph:\n  warn_orphans: false\n',
    );
    const config = loadConfig(tmp);

    assert.equal(config.graph.warn_orphans, false);
    // Other graph defaults preserved
    assert.equal(config.graph.warn_fanout_above, 50000);
    assert.equal(config.graph.detect_cycles, true);
    assert.equal(config.graph.detect_duplicates, true);
  });

  // AC-4: Ignore patterns exposed on Config object
  it('AC-4: exposes ignore patterns on the Config object', () => {
    writeFileSync(
      join(tmp, '.skill-lint.yaml'),
      'ignore:\n  - "**/*.draft.md"\n  - "tmp/**"\n',
    );
    const config = loadConfig(tmp);
    assert.deepEqual(config.ignore, ['**/*.draft.md', 'tmp/**']);
  });

  // AC-5: Invalid YAML -> throws ConfigError
  it('AC-5: throws ConfigError for invalid YAML', () => {
    writeFileSync(join(tmp, '.skill-lint.yaml'), ':\n  bad: [yaml\n  missing: bracket');
    assert.throws(
      () => loadConfig(tmp),
      (err: unknown) => {
        assert.ok(err instanceof ConfigError);
        assert.ok(err.message.includes('Invalid YAML'));
        return true;
      },
    );
  });

  // AC-6: Empty config file -> returns defaults
  it('AC-6: returns defaults for an empty config file', () => {
    writeFileSync(join(tmp, '.skill-lint.yaml'), '');
    const config = loadConfig(tmp);
    assert.equal(config.skills_root, '.');
    assert.equal(config.default_level, 0);
    assert.deepEqual(config.levels, {});
    assert.deepEqual(config.models, ['opus', 'sonnet', 'haiku']);
  });

  // AC-7: Unknown keys -> ignored without error
  it('AC-7: ignores unknown keys without error', () => {
    writeFileSync(
      join(tmp, '.skill-lint.yaml'),
      'skills_root: "./custom"\nunknown_future_key: true\nanother_unknown:\n  nested: value\n',
    );
    const config = loadConfig(tmp);
    assert.equal(config.skills_root, './custom');
    // Unknown keys should not appear on the returned Config
    assert.equal((config as Record<string, unknown>)['unknown_future_key'], undefined);
    assert.equal((config as Record<string, unknown>)['another_unknown'], undefined);
  });

  // Edge case: YAML with only comments
  it('returns defaults for a file with only comments', () => {
    writeFileSync(join(tmp, '.skill-lint.yaml'), '# This is just a comment\n# No actual config\n');
    const config = loadConfig(tmp);
    assert.equal(config.skills_root, '.');
    assert.equal(config.default_level, 0);
  });

  // Edge case: arrays replace, not concatenate
  it('user array replaces default array entirely', () => {
    writeFileSync(join(tmp, '.skill-lint.yaml'), 'models:\n  - gpt4\n');
    const config = loadConfig(tmp);
    assert.deepEqual(config.models, ['gpt4']);
  });
});
