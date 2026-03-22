import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateManifest } from '../src/validate-manifest.js';
import type { Config, RepoFormat } from '../src/types.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'skill-lint-manifest-'));
}

/** Returns a minimal Config with optional overrides. */
function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    skills_root: '.',
    default_level: 0,
    levels: {},
    tools: { mcp_pattern: 'mcp__*', custom: [] },
    models: ['opus', 'sonnet', 'haiku'],
    limits: { max_file_size: 15360 },
    ignore: [],
    prefixes: 'PREFIXES.md',
    graph: {
      warn_orphans: true,
      warn_fanout_above: 50000,
      detect_cycles: true,
      detect_duplicates: true,
    },
    ...overrides,
  };
}

/** Create a directory structure from a list of file paths. */
function createFiles(root: string, paths: string[], contents?: Record<string, string>): void {
  for (const p of paths) {
    const full = join(root, p);
    const dir = full.substring(0, full.lastIndexOf('/'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(full, contents?.[p] ?? '{}');
  }
}

/** Create directories without files. */
function createDirs(root: string, dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(root, d), { recursive: true });
  }
}

/** Write JSON content to a file path within the root. */
function writeJson(root: string, path: string, data: unknown): void {
  const full = join(root, path);
  const dir = full.substring(0, full.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(full, JSON.stringify(data, null, 2));
}

/** Create a valid marketplace.json with plugins array. */
function createValidMarketplace(
  root: string,
  plugins: Array<{ name: string; source: string }>,
): void {
  writeJson(root, '.claude-plugin/marketplace.json', {
    name: 'test-marketplace',
    owner: { name: 'Test Author' },
    plugins,
  });
}

/** Create a valid plugin.json. */
function createValidPlugin(root: string, pluginPath: string, name: string): void {
  writeJson(root, join(pluginPath, '.claude-plugin/plugin.json'), { name });
}

describe('validateManifest', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // --- AC-9: Skip for legacy-commands ---

  describe('AC-9: skip for legacy-commands', () => {
    it('returns empty results for legacy-commands format', () => {
      createValidMarketplace(tmp, []);
      const results = validateManifest(tmp, 'legacy-commands', makeConfig());
      assert.equal(results.length, 0);
    });

    it('skips even when invalid manifests exist', () => {
      createFiles(tmp, ['.claude-plugin/marketplace.json'], {
        '.claude-plugin/marketplace.json': 'invalid json',
      });
      const results = validateManifest(tmp, 'legacy-commands', makeConfig());
      assert.equal(results.length, 0);
    });
  });

  // --- AC-6b: Invalid marketplace.json ---

  describe('AC-6b: invalid marketplace.json', () => {
    it('reports marketplace-manifest-error for unparseable JSON', () => {
      createFiles(tmp, ['.claude-plugin/marketplace.json'], {
        '.claude-plugin/marketplace.json': '{ bad json {{',
      });

      const results = validateManifest(tmp, 'plugin', makeConfig());
      assert.equal(results.length, 1);
      assert.equal(results[0].rule, 'marketplace-manifest-error');
      assert.equal(results[0].severity, 'error');
      assert.ok(results[0].message.includes('invalid JSON'));
    });

    it('skips all downstream checks when marketplace.json is invalid', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'plugins/foo/.claude-plugin/plugin.json',
      ], {
        '.claude-plugin/marketplace.json': 'not json',
        'plugins/foo/.claude-plugin/plugin.json': '{ "name": "foo" }',
      });

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      // Only the marketplace parse error, no plugin validations
      assert.equal(results.length, 1);
      assert.equal(results[0].rule, 'marketplace-manifest-error');
    });
  });

  // --- AC-1: marketplace.json required fields ---

  describe('AC-1: marketplace.json required fields', () => {
    it('reports error when name is missing', () => {
      writeJson(tmp, '.claude-plugin/marketplace.json', {
        owner: { name: 'Author' },
        plugins: [],
      });

      const results = validateManifest(tmp, 'plugin', makeConfig());
      const nameErrors = results.filter(
        (r) => r.rule === 'marketplace-manifest-error' && r.message.includes('"name"'),
      );
      assert.equal(nameErrors.length, 1);
    });

    it('reports error when owner is missing', () => {
      writeJson(tmp, '.claude-plugin/marketplace.json', {
        name: 'test',
        plugins: [],
      });

      const results = validateManifest(tmp, 'plugin', makeConfig());
      const ownerErrors = results.filter(
        (r) => r.rule === 'marketplace-manifest-error' && r.message.includes('"owner"'),
      );
      assert.equal(ownerErrors.length, 1);
    });

    it('reports error when owner.name is missing', () => {
      writeJson(tmp, '.claude-plugin/marketplace.json', {
        name: 'test',
        owner: {},
        plugins: [],
      });

      const results = validateManifest(tmp, 'plugin', makeConfig());
      const ownerNameErrors = results.filter(
        (r) => r.rule === 'marketplace-manifest-error' && r.message.includes('owner') && r.message.includes('name'),
      );
      assert.equal(ownerNameErrors.length, 1);
    });

    it('reports error when plugins is missing', () => {
      writeJson(tmp, '.claude-plugin/marketplace.json', {
        name: 'test',
        owner: { name: 'Author' },
      });

      const results = validateManifest(tmp, 'plugin', makeConfig());
      const pluginsErrors = results.filter(
        (r) => r.rule === 'marketplace-manifest-error' && r.message.includes('"plugins"'),
      );
      assert.equal(pluginsErrors.length, 1);
    });

    it('reports error when plugins entry missing name', () => {
      writeJson(tmp, '.claude-plugin/marketplace.json', {
        name: 'test',
        owner: { name: 'Author' },
        plugins: [{ source: './plugins/foo' }],
      });

      const results = validateManifest(tmp, 'plugin', makeConfig());
      const entryErrors = results.filter(
        (r) => r.rule === 'marketplace-manifest-error' && r.message.includes('plugins[0]') && r.message.includes('"name"'),
      );
      assert.equal(entryErrors.length, 1);
    });

    it('reports error when plugins entry missing source', () => {
      writeJson(tmp, '.claude-plugin/marketplace.json', {
        name: 'test',
        owner: { name: 'Author' },
        plugins: [{ name: 'foo' }],
      });

      const results = validateManifest(tmp, 'plugin', makeConfig());
      const entryErrors = results.filter(
        (r) => r.rule === 'marketplace-manifest-error' && r.message.includes('plugins[0]') && r.message.includes('"source"'),
      );
      assert.equal(entryErrors.length, 1);
    });

    it('reports multiple missing fields', () => {
      writeJson(tmp, '.claude-plugin/marketplace.json', {});

      const results = validateManifest(tmp, 'plugin', makeConfig());
      const manifestErrors = results.filter((r) => r.rule === 'marketplace-manifest-error');
      assert.ok(manifestErrors.length >= 3, 'expected errors for name, owner, and plugins');
    });
  });

  // --- AC-2: broken-plugin-source ---

  describe('AC-2: broken-plugin-source', () => {
    it('reports error when source directory does not exist', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
      ]);
      // Do NOT create plugins/foo directory

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const broken = results.filter((r) => r.rule === 'broken-plugin-source');
      assert.equal(broken.length, 1);
      assert.ok(broken[0].message.includes('foo'));
      assert.ok(broken[0].message.includes('does not exist'));
    });

    it('does not report error when source directory exists', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
      ]);
      createDirs(tmp, ['plugins/foo']);

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const broken = results.filter((r) => r.rule === 'broken-plugin-source');
      assert.equal(broken.length, 0);
    });
  });

  // --- AC-2b: invalid-source-path ---

  describe('AC-2b: invalid-source-path', () => {
    it('reports error for absolute source path', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: '/usr/local/plugins/foo' },
      ]);

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const invalid = results.filter((r) => r.rule === 'invalid-source-path');
      assert.equal(invalid.length, 1);
      assert.ok(invalid[0].message.includes('relative'));
    });

    it('reports error for home-relative source path', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: '~/plugins/foo' },
      ]);

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const invalid = results.filter((r) => r.rule === 'invalid-source-path');
      assert.equal(invalid.length, 1);
      assert.ok(invalid[0].message.includes('relative'));
    });

    it('does not report error for relative source path', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
      ]);
      createDirs(tmp, ['plugins/foo']);

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const invalid = results.filter((r) => r.rule === 'invalid-source-path');
      assert.equal(invalid.length, 0);
    });
  });

  // --- AC-3: plugin-name-mismatch ---

  describe('AC-3: plugin-name-mismatch', () => {
    it('reports warning when plugin.json name differs from marketplace.json', () => {
      createValidMarketplace(tmp, [
        { name: 'foo-plugin', source: 'plugins/foo' },
      ]);
      createValidPlugin(tmp, 'plugins/foo', 'different-name');

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const mismatch = results.filter((r) => r.rule === 'plugin-name-mismatch');
      assert.equal(mismatch.length, 1);
      assert.equal(mismatch[0].severity, 'warning');
      assert.ok(mismatch[0].message.includes('different-name'));
      assert.ok(mismatch[0].message.includes('foo-plugin'));
    });

    it('does not report warning when names match', () => {
      createValidMarketplace(tmp, [
        { name: 'foo-plugin', source: 'plugins/foo' },
      ]);
      createValidPlugin(tmp, 'plugins/foo', 'foo-plugin');

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const mismatch = results.filter((r) => r.rule === 'plugin-name-mismatch');
      assert.equal(mismatch.length, 0);
    });
  });

  // --- AC-4: unlisted-plugin ---

  describe('AC-4: unlisted-plugin', () => {
    it('reports warning for plugin directory not in marketplace.json', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
      ]);
      createValidPlugin(tmp, 'plugins/foo', 'foo');
      createValidPlugin(tmp, 'plugins/bar', 'bar');

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const unlisted = results.filter((r) => r.rule === 'unlisted-plugin');
      assert.equal(unlisted.length, 1);
      assert.equal(unlisted[0].severity, 'warning');
      assert.ok(unlisted[0].message.includes('bar'));
    });

    it('does not report warning when all plugins are listed', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
        { name: 'bar', source: 'plugins/bar' },
      ]);
      createValidPlugin(tmp, 'plugins/foo', 'foo');
      createValidPlugin(tmp, 'plugins/bar', 'bar');

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const unlisted = results.filter((r) => r.rule === 'unlisted-plugin');
      assert.equal(unlisted.length, 0);
    });

    it('ignores directories without plugin.json', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
      ]);
      createValidPlugin(tmp, 'plugins/foo', 'foo');
      createDirs(tmp, ['plugins/no-plugin-json']);

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const unlisted = results.filter((r) => r.rule === 'unlisted-plugin');
      assert.equal(unlisted.length, 0);
    });
  });

  // --- AC-5: plugin.json required fields ---

  describe('AC-5: plugin.json required fields', () => {
    it('reports error when plugin.json has no name field', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
      ]);
      writeJson(tmp, 'plugins/foo/.claude-plugin/plugin.json', { version: '1.0' });

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const nameErrors = results.filter(
        (r) => r.rule === 'plugin-manifest-error' && r.message.includes('"name"'),
      );
      assert.equal(nameErrors.length, 1);
    });

    it('validates plugin.json for single plugin format', () => {
      createValidMarketplace(tmp, []);
      writeJson(tmp, '.claude-plugin/plugin.json', { version: '1.0' });

      const results = validateManifest(tmp, 'plugin', makeConfig());
      const nameErrors = results.filter(
        (r) => r.rule === 'plugin-manifest-error' && r.message.includes('"name"'),
      );
      assert.equal(nameErrors.length, 1);
    });
  });

  // --- AC-6: plugin.json missing or invalid JSON ---

  describe('AC-6: plugin.json missing or invalid JSON', () => {
    it('reports error when plugin.json is missing (multi-plugin)', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
      ]);
      createDirs(tmp, ['plugins/foo']);

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const errors = results.filter((r) => r.rule === 'plugin-manifest-error');
      assert.ok(errors.length >= 1);
      assert.ok(errors[0].message.includes('not found'));
    });

    it('reports error when plugin.json is missing (single plugin)', () => {
      createValidMarketplace(tmp, []);
      // Do not create .claude-plugin/plugin.json

      const results = validateManifest(tmp, 'plugin', makeConfig());
      const errors = results.filter((r) => r.rule === 'plugin-manifest-error');
      assert.ok(errors.length >= 1);
      assert.ok(errors[0].message.includes('not found'));
    });

    it('reports error when plugin.json contains invalid JSON', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
      ]);
      createFiles(tmp, ['plugins/foo/.claude-plugin/plugin.json'], {
        'plugins/foo/.claude-plugin/plugin.json': '{ not valid json }',
      });

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const errors = results.filter(
        (r) => r.rule === 'plugin-manifest-error' && r.message.includes('invalid JSON'),
      );
      assert.equal(errors.length, 1);
    });

    it('reports error when single plugin.json contains invalid JSON', () => {
      createValidMarketplace(tmp, []);
      createFiles(tmp, ['.claude-plugin/plugin.json'], {
        '.claude-plugin/plugin.json': '{{invalid}}',
      });

      const results = validateManifest(tmp, 'plugin', makeConfig());
      const errors = results.filter(
        (r) => r.rule === 'plugin-manifest-error' && r.message.includes('invalid JSON'),
      );
      assert.equal(errors.length, 1);
    });
  });

  // --- AC-7: missing-skill-file ---

  describe('AC-7: missing-skill-file', () => {
    it('reports error when skills subdirectory has no SKILL.md (multi-plugin)', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
      ]);
      createValidPlugin(tmp, 'plugins/foo', 'foo');
      createDirs(tmp, ['plugins/foo/skills/my-skill']);

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const missing = results.filter((r) => r.rule === 'missing-skill-file');
      assert.equal(missing.length, 1);
      assert.ok(missing[0].message.includes('my-skill'));
      assert.ok(missing[0].message.includes('SKILL.md'));
    });

    it('does not report when skills subdirectory has SKILL.md (multi-plugin)', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
      ]);
      createValidPlugin(tmp, 'plugins/foo', 'foo');
      createFiles(tmp, ['plugins/foo/skills/my-skill/SKILL.md']);

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const missing = results.filter((r) => r.rule === 'missing-skill-file');
      assert.equal(missing.length, 0);
    });

    it('reports error when skills subdirectory has no SKILL.md (single plugin)', () => {
      createValidMarketplace(tmp, []);
      createValidPlugin(tmp, '', 'test-plugin');
      createDirs(tmp, ['skills/my-skill']);

      const results = validateManifest(tmp, 'plugin', makeConfig());
      const missing = results.filter((r) => r.rule === 'missing-skill-file');
      assert.equal(missing.length, 1);
      assert.ok(missing[0].message.includes('my-skill'));
    });

    it('does not report when skills subdirectory has SKILL.md (single plugin)', () => {
      createValidMarketplace(tmp, []);
      createValidPlugin(tmp, '', 'test-plugin');
      createFiles(tmp, ['skills/my-skill/SKILL.md']);

      const results = validateManifest(tmp, 'plugin', makeConfig());
      const missing = results.filter((r) => r.rule === 'missing-skill-file');
      assert.equal(missing.length, 0);
    });

    it('reports multiple missing SKILL.md files', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
      ]);
      createValidPlugin(tmp, 'plugins/foo', 'foo');
      createDirs(tmp, ['plugins/foo/skills/skill-a', 'plugins/foo/skills/skill-b']);

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const missing = results.filter((r) => r.rule === 'missing-skill-file');
      assert.equal(missing.length, 2);
    });
  });

  // --- AC-8: All valid manifests ---

  describe('AC-8: all valid manifests produce zero errors', () => {
    it('returns zero results for fully valid multi-plugin setup', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
        { name: 'bar', source: 'plugins/bar' },
      ]);
      createValidPlugin(tmp, 'plugins/foo', 'foo');
      createValidPlugin(tmp, 'plugins/bar', 'bar');
      createFiles(tmp, [
        'plugins/foo/skills/skill-a/SKILL.md',
        'plugins/bar/skills/skill-b/SKILL.md',
      ]);

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      assert.equal(results.length, 0);
    });

    it('returns zero results for fully valid single plugin setup', () => {
      createValidMarketplace(tmp, []);
      createValidPlugin(tmp, '', 'test-plugin');
      createFiles(tmp, ['skills/my-skill/SKILL.md']);

      const results = validateManifest(tmp, 'plugin', makeConfig());
      assert.equal(results.length, 0);
    });
  });

  // --- Edge cases ---

  describe('Edge cases', () => {
    it('returns empty when no marketplace.json exists', () => {
      const results = validateManifest(tmp, 'plugin', makeConfig());
      assert.equal(results.length, 0);
    });

    it('handles empty plugins array gracefully', () => {
      createValidMarketplace(tmp, []);
      createValidPlugin(tmp, '', 'test-plugin');

      const results = validateManifest(tmp, 'plugin', makeConfig());
      assert.equal(results.length, 0);
    });

    it('handles no plugins/ directory for unlisted check', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
      ]);
      createDirs(tmp, ['plugins/foo']);

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      // Should have plugin-manifest-error (no plugin.json) but not crash on unlisted check
      const unlisted = results.filter((r) => r.rule === 'unlisted-plugin');
      assert.equal(unlisted.length, 0);
    });

    it('does not crash when marketplace.json owner is a non-object type', () => {
      writeJson(tmp, '.claude-plugin/marketplace.json', {
        name: 'test',
        owner: 'string-owner',
        plugins: [],
      });

      const results = validateManifest(tmp, 'plugin', makeConfig());
      const ownerErrors = results.filter(
        (r) => r.rule === 'marketplace-manifest-error' && r.message.includes('"owner"'),
      );
      assert.equal(ownerErrors.length, 1);
    });

    it('validates multiple plugin entries independently', () => {
      createValidMarketplace(tmp, [
        { name: 'foo', source: 'plugins/foo' },
        { name: 'bar', source: 'plugins/bar' },
      ]);
      createValidPlugin(tmp, 'plugins/foo', 'foo');
      // bar has no plugin.json and no directory
      // Note: plugins/bar doesn't exist -> broken-plugin-source

      const results = validateManifest(tmp, 'multi-plugin', makeConfig());
      const broken = results.filter((r) => r.rule === 'broken-plugin-source');
      assert.equal(broken.length, 1);
      assert.ok(broken[0].message.includes('bar'));
    });
  });
});
