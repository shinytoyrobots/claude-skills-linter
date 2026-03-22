import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInit, buildConfigYaml } from '../src/init.js';
import { loadConfig } from '../src/config.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'skill-lint-init-'));
}

/** Create directories without files. */
function createDirs(root: string, dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(root, d), { recursive: true });
  }
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

describe('buildConfigYaml', () => {
  it('legacy-commands format omits format key', () => {
    const yaml = buildConfigYaml('legacy-commands');
    assert.ok(yaml.includes('# Detected format: legacy-commands'));
    assert.ok(yaml.includes('skills_root: "."'));
    assert.ok(yaml.includes('default_level: 0'));
    // Must not have a top-level "format:" key (comment lines don't count)
    assert.ok(!yaml.split('\n').some((line) => /^format:/.test(line)));
  });

  it('plugin format includes format key', () => {
    const yaml = buildConfigYaml('plugin');
    assert.ok(yaml.includes('# Detected format: plugin'));
    assert.ok(yaml.includes('format: plugin'));
  });

  it('multi-plugin format includes format key', () => {
    const yaml = buildConfigYaml('multi-plugin');
    assert.ok(yaml.includes('# Detected format: multi-plugin'));
    assert.ok(yaml.includes('format: multi-plugin'));
  });

  it('includes all expected config sections', () => {
    const yaml = buildConfigYaml('legacy-commands');
    assert.ok(yaml.includes('models: [opus, sonnet, haiku]'));
    assert.ok(yaml.includes('mcp_pattern: "mcp__*"'));
    assert.ok(yaml.includes('max_file_size: 15360'));
    assert.ok(yaml.includes('**/README.md'));
    assert.ok(yaml.includes('**/CLAUDE.md'));
    assert.ok(yaml.includes('node_modules/**'));
    assert.ok(yaml.includes('warn_orphans: true'));
    assert.ok(yaml.includes('detect_cycles: true'));
    assert.ok(yaml.includes('detect_duplicates: true'));
  });
});

describe('runInit', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = makeTmpDir();
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  // AC-1: Calls detectFormat and includes detected format as comment
  it('AC-1: detects legacy-commands format and includes as comment', () => {
    createDirs(tmp, ['commands']);
    const exitCode = runInit(tmp);
    assert.equal(exitCode, 0);
    const content = readFileSync(join(tmp, '.skill-lint.yaml'), 'utf-8');
    assert.ok(content.includes('# Detected format: legacy-commands'));
  });

  // AC-1: Detects plugin format
  it('AC-1: detects plugin format', () => {
    createFiles(tmp, [
      '.claude-plugin/marketplace.json',
      'skills/my-skill/SKILL.md',
    ]);
    const exitCode = runInit(tmp);
    assert.equal(exitCode, 0);
    const content = readFileSync(join(tmp, '.skill-lint.yaml'), 'utf-8');
    assert.ok(content.includes('# Detected format: plugin'));
    assert.ok(content.includes('format: plugin'));
  });

  // AC-1: Detects multi-plugin format
  it('AC-1: detects multi-plugin format', () => {
    createFiles(tmp, [
      '.claude-plugin/marketplace.json',
      'plugins/my-plugin/.claude-plugin/plugin.json',
    ]);
    const exitCode = runInit(tmp);
    assert.equal(exitCode, 0);
    const content = readFileSync(join(tmp, '.skill-lint.yaml'), 'utf-8');
    assert.ok(content.includes('# Detected format: multi-plugin'));
    assert.ok(content.includes('format: multi-plugin'));
  });

  // AC-2: Legacy-commands config has skills_root, default_level, no format key
  it('AC-2: legacy-commands config has correct structure', () => {
    createDirs(tmp, ['commands']);
    runInit(tmp);
    const content = readFileSync(join(tmp, '.skill-lint.yaml'), 'utf-8');
    assert.ok(content.includes('skills_root: "."'));
    assert.ok(content.includes('default_level: 0'));
    // Must not have a top-level "format:" key (comment lines don't count)
    assert.ok(!content.split('\n').some((line) => /^format:/.test(line)));
  });

  // AC-3: Plugin/multi-plugin has format field
  it('AC-3: plugin config includes format field', () => {
    createFiles(tmp, [
      '.claude-plugin/marketplace.json',
      'skills/my-skill/SKILL.md',
    ]);
    runInit(tmp);
    const content = readFileSync(join(tmp, '.skill-lint.yaml'), 'utf-8');
    assert.ok(content.includes('format: plugin'));
  });

  // AC-4: Existing config file - warns and does not overwrite
  it('AC-4: warns and does not overwrite existing config', () => {
    const configPath = join(tmp, '.skill-lint.yaml');
    writeFileSync(configPath, 'skills_root: "./custom"\n');

    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      stderrChunks.push(chunk);
      return true;
    }) as typeof process.stderr.write;

    try {
      const exitCode = runInit(tmp);
      assert.equal(exitCode, 0);
      const content = readFileSync(configPath, 'utf-8');
      assert.equal(content, 'skills_root: "./custom"\n');
      assert.ok(stderrChunks.some((c) => c.includes('already exists')));
    } finally {
      process.stderr.write = origWrite;
    }
  });

  // AC-5: --force overwrites existing file
  it('AC-5: --force overwrites existing config', () => {
    const configPath = join(tmp, '.skill-lint.yaml');
    writeFileSync(configPath, 'skills_root: "./custom"\n');
    createDirs(tmp, ['commands']);

    const exitCode = runInit(tmp, { force: true });
    assert.equal(exitCode, 0);
    const content = readFileSync(configPath, 'utf-8');
    assert.ok(content.includes('# .skill-lint.yaml — generated by skill-lint init'));
    assert.ok(!content.includes('./custom'));
  });

  // AC-6: Prints path and next-steps to stderr
  it('AC-6: prints success message to stderr', () => {
    createDirs(tmp, ['commands']);
    const stderrChunks: string[] = [];
    const origWrite = process.stderr.write;
    process.stderr.write = ((chunk: string) => {
      stderrChunks.push(chunk);
      return true;
    }) as typeof process.stderr.write;

    try {
      runInit(tmp);
      const output = stderrChunks.join('');
      assert.ok(output.includes('.skill-lint.yaml'));
      assert.ok(output.includes('Run `skill-lint lint .` to validate your files.'));
    } finally {
      process.stderr.write = origWrite;
    }
  });

  // AC-7: Generated config loads without error via loadConfig (integration test)
  it('AC-7: generated config loads via loadConfig without error', () => {
    createDirs(tmp, ['commands']);
    runInit(tmp);
    const config = loadConfig(tmp);
    assert.equal(config.skills_root, '.');
    assert.equal(config.default_level, 0);
    assert.deepEqual(config.models, ['opus', 'sonnet', 'haiku']);
    assert.deepEqual(config.tools, { mcp_pattern: 'mcp__*', custom: [] });
    assert.deepEqual(config.limits, { max_file_size: 15360 });
    assert.ok(config.ignore.includes('**/README.md'));
    assert.ok(config.ignore.includes('**/CLAUDE.md'));
    assert.ok(config.ignore.includes('node_modules/**'));
    assert.equal(config.graph.warn_orphans, true);
    assert.equal(config.graph.detect_cycles, true);
    assert.equal(config.graph.detect_duplicates, true);
  });

  // AC-7: Generated plugin config loads with format field
  it('AC-7: generated plugin config loads with format field', () => {
    createFiles(tmp, [
      '.claude-plugin/marketplace.json',
      'skills/my-skill/SKILL.md',
    ]);
    runInit(tmp);
    const config = loadConfig(tmp);
    assert.equal(config.format, 'plugin');
  });

  // Fallback detection when no signals found
  it('fallback: defaults to legacy-commands when no signals found', () => {
    runInit(tmp);
    const content = readFileSync(join(tmp, '.skill-lint.yaml'), 'utf-8');
    assert.ok(content.includes('# Detected format: legacy-commands'));
  });
});
