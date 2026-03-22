/**
 * Integration tests for story-020: Wire plugin format through pipeline + JSON output.
 *
 * Tests the full CLI pipeline end-to-end for plugin, multi-plugin, and legacy formats,
 * including --format json output purity.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type { ValidationResult } from '../src/types.js';

const CLI = resolve(import.meta.dirname, '..', 'bin', 'cli.js');
const FIXTURES = resolve(import.meta.dirname, 'fixtures');
const PLUGIN_FIXTURES = resolve(FIXTURES, 'plugin');
const MULTI_PLUGIN_FIXTURES = resolve(FIXTURES, 'multi-plugin');
const GRAPH_FIXTURES = resolve(FIXTURES, 'graph');

/** Run the CLI and return { stdout, stderr, exitCode }. */
function run(args: string, cwd?: string): { stdout: string; stderr: string; exitCode: number } {
  const argv = args.split(/\s+/).filter(Boolean);
  const result = spawnSync('node', [CLI, ...argv], {
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
    cwd,
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

/** Parse JSON output and return typed array. */
function parseJSON(stdout: string): ValidationResult[] {
  return JSON.parse(stdout.trim()) as ValidationResult[];
}

// ---------------------------------------------------------------------------
// AC-1: lint against plugin-format repo
// ---------------------------------------------------------------------------
describe('AC-1: lint plugin-format repo', () => {
  it('auto-detects plugin format and validates SKILL.md files', () => {
    const { stdout, exitCode } = run(`lint ${PLUGIN_FIXTURES}`);
    // Should detect plugin format and find SKILL.md files.
    // The no-fm/SKILL.md has no frontmatter → parse error.
    assert.equal(exitCode, 1, `expected exit 1, stdout: ${stdout}`);
    assert.ok(stdout.includes('parse-error'), `expected parse-error in output: ${stdout}`);
  });

  it('validates frontmatter against skill schema', () => {
    const { stdout } = run(`lint --format json ${PLUGIN_FIXTURES}`);
    const results = parseJSON(stdout);
    // no-fm/SKILL.md should produce a parse-error
    const parseErrors = results.filter((r) => r.rule === 'parse-error');
    assert.ok(parseErrors.length > 0, 'should find parse-error for SKILL.md with no frontmatter');
  });

  it('reports results and exits 1 when errors exist', () => {
    const { exitCode } = run(`lint ${PLUGIN_FIXTURES}`);
    assert.equal(exitCode, 1);
  });
});

// ---------------------------------------------------------------------------
// AC-2: graph against plugin-format repo
// ---------------------------------------------------------------------------
describe('AC-2: graph plugin-format repo', () => {
  it('validates references in plugin-format repo', () => {
    const { stdout, exitCode } = run(`graph --format json ${PLUGIN_FIXTURES}`);
    const results = parseJSON(stdout);
    // Should produce orphaned-file warnings (context and agents not referenced by skills).
    const orphans = results.filter((r) => r.rule === 'orphaned-file');
    assert.ok(orphans.length > 0, `expected orphaned-file warnings, got: ${JSON.stringify(results)}`);
    // Warnings only → exit 0.
    assert.equal(exitCode, 0, 'orphan warnings should not cause exit 1 without --strict');
  });
});

// ---------------------------------------------------------------------------
// AC-3: lint multi-plugin repo
// ---------------------------------------------------------------------------
describe('AC-3: lint multi-plugin repo', () => {
  it('discovers and validates skills across all plugins', () => {
    const { stdout, exitCode } = run(`lint --format json ${MULTI_PLUGIN_FIXTURES}`);
    const results = parseJSON(stdout);
    // Multi-plugin should find bar SKILL.md (valid) — zero errors expected.
    assert.equal(exitCode, 0, `expected exit 0, results: ${JSON.stringify(results)}`);
  });
});

// ---------------------------------------------------------------------------
// AC-4: lint --format json outputs only valid JSON
// ---------------------------------------------------------------------------
describe('AC-4: lint --format json', () => {
  it('outputs only valid JSON to stdout — no summary lines', () => {
    const { stdout } = run(`lint --format json ${PLUGIN_FIXTURES}`);
    // Must be parseable by JSON.parse
    let parsed: unknown;
    assert.doesNotThrow(() => { parsed = JSON.parse(stdout.trim()); }, 'stdout must be valid JSON');
    assert.ok(Array.isArray(parsed), 'should be an array');
  });

  it('JSON results have correct shape (filePath, rule, severity, message)', () => {
    const { stdout } = run(`lint --format json ${PLUGIN_FIXTURES}`);
    const results = parseJSON(stdout);
    for (const r of results) {
      assert.ok(typeof r.filePath === 'string', 'filePath should be string');
      assert.ok(typeof r.rule === 'string', 'rule should be string');
      assert.ok(['error', 'warning', 'info'].includes(r.severity), `severity should be valid, got: ${r.severity}`);
      assert.ok(typeof r.message === 'string', 'message should be string');
    }
  });
});

// ---------------------------------------------------------------------------
// AC-5: graph --format json outputs only valid JSON
// ---------------------------------------------------------------------------
describe('AC-5: graph --format json', () => {
  it('outputs only valid JSON to stdout', () => {
    const { stdout } = run(`graph --format json ${PLUGIN_FIXTURES}`);
    let parsed: unknown;
    assert.doesNotThrow(() => { parsed = JSON.parse(stdout.trim()); }, 'stdout must be valid JSON');
    assert.ok(Array.isArray(parsed), 'should be an array');
  });

  it('graph JSON results against graph fixtures', () => {
    const { stdout } = run(`graph --format json ${GRAPH_FIXTURES}`);
    const results = parseJSON(stdout);
    // Graph fixtures should produce broken-reference and/or reference-cycle errors.
    const errorRules = results.filter((r) => r.severity === 'error').map((r) => r.rule);
    assert.ok(
      errorRules.includes('broken-reference') || errorRules.includes('reference-cycle'),
      `expected graph errors, got rules: ${errorRules.join(', ')}`,
    );
  });
});

// ---------------------------------------------------------------------------
// AC-6: --format json with zero results outputs empty array
// ---------------------------------------------------------------------------
describe('AC-6: --format json empty results', () => {
  it('lint --format json outputs [] for zero results', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'lint-json-empty-'));
    mkdirSync(resolve(tmp, 'commands'), { recursive: true });
    writeFileSync(
      resolve(tmp, 'commands', 'good.md'),
      '---\nname: good\ndescription: A good file\nmodel: sonnet\n---\n\nSome body.\n',
    );
    const { stdout, exitCode } = run(`lint --format json ${tmp}`);
    assert.equal(stdout.trim(), '[]');
    assert.equal(exitCode, 0);
  });

  it('graph --format json outputs [] for zero results', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'graph-json-empty-'));
    mkdirSync(resolve(tmp, 'commands'), { recursive: true });
    writeFileSync(
      resolve(tmp, 'commands', 'standalone.md'),
      '---\nname: standalone\ndescription: A standalone command\nmodel: sonnet\n---\n\nBody.\n',
    );
    const { stdout, exitCode } = run(`graph --format json ${tmp}`);
    assert.equal(stdout.trim(), '[]');
    assert.equal(exitCode, 0);
  });

  it('lint --format json outputs [] for empty directory', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'lint-json-nofiles-'));
    const { stdout, exitCode } = run(`lint --format json ${tmp}`);
    assert.equal(stdout.trim(), '[]');
    assert.equal(exitCode, 0);
  });

  it('graph --format json outputs [] for empty directory', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'graph-json-nofiles-'));
    const { stdout, exitCode } = run(`graph --format json ${tmp}`);
    assert.equal(stdout.trim(), '[]');
    assert.equal(exitCode, 0);
  });
});

// ---------------------------------------------------------------------------
// AC-7: manifest validation errors in lint output
// ---------------------------------------------------------------------------
describe('AC-7: manifest validation in lint output', () => {
  it('includes manifest errors alongside frontmatter errors for plugin format', () => {
    // Create a plugin fixture with bad plugin.json
    const tmp = mkdtempSync(resolve(tmpdir(), 'lint-manifest-'));
    const cpDir = resolve(tmp, '.claude-plugin');
    mkdirSync(cpDir, { recursive: true });
    writeFileSync(resolve(cpDir, 'marketplace.json'), JSON.stringify({
      name: 'test',
      owner: { name: 'Test' },
      plugins: [{ name: 'test', source: '.' }],
    }));
    // plugin.json with missing name field
    writeFileSync(resolve(cpDir, 'plugin.json'), '{}');
    // A valid SKILL.md
    mkdirSync(resolve(tmp, 'skills', 'my-skill'), { recursive: true });
    writeFileSync(
      resolve(tmp, 'skills', 'my-skill', 'SKILL.md'),
      '---\nname: my-skill\ndescription: A skill\nmodel: sonnet\n---\n\nBody.\n',
    );
    const { stdout, exitCode } = run(`lint --format json ${tmp}`);
    const results = parseJSON(stdout);
    // Should include manifest error for missing plugin.json name field.
    const manifestErrors = results.filter((r) => r.rule === 'plugin-manifest-error');
    assert.ok(manifestErrors.length > 0, `expected manifest errors, got: ${JSON.stringify(results)}`);
    // Tests must not assert on error ordering — just check presence.
    assert.equal(exitCode, 1, 'should exit 1 due to manifest errors');
  });

  it('does NOT include manifest errors for legacy format', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'lint-legacy-no-manifest-'));
    mkdirSync(resolve(tmp, 'commands'), { recursive: true });
    writeFileSync(
      resolve(tmp, 'commands', 'cmd.md'),
      '---\nname: cmd\ndescription: A command\nmodel: sonnet\n---\n\nBody.\n',
    );
    const { stdout, exitCode } = run(`lint --format json ${tmp}`);
    const results = parseJSON(stdout);
    const manifestErrors = results.filter((r) =>
      r.rule.includes('manifest') || r.rule.includes('plugin'),
    );
    assert.equal(manifestErrors.length, 0, 'legacy format should have no manifest errors');
    assert.equal(exitCode, 0);
  });
});

// ---------------------------------------------------------------------------
// AC-8: --format json exit codes
// ---------------------------------------------------------------------------
describe('AC-8: --format json exit codes', () => {
  it('exits 1 when JSON array contains errors', () => {
    const { stdout, exitCode } = run(`lint --format json ${PLUGIN_FIXTURES}`);
    const results = parseJSON(stdout);
    const hasErrors = results.some((r) => r.severity === 'error');
    assert.ok(hasErrors, 'should contain errors');
    assert.equal(exitCode, 1);
  });

  it('exits 0 when JSON array is clean', () => {
    const { stdout, exitCode } = run(`lint --format json ${MULTI_PLUGIN_FIXTURES}`);
    const results = parseJSON(stdout);
    const hasErrors = results.some((r) => r.severity === 'error');
    assert.ok(!hasErrors, `should not contain errors, got: ${JSON.stringify(results)}`);
    assert.equal(exitCode, 0);
  });
});

// ---------------------------------------------------------------------------
// AC-9: committed plugin-format fixture produces expected results
// ---------------------------------------------------------------------------
describe('AC-9: plugin fixture known error profile', () => {
  it('plugin fixture: 1 parse-error from SKILL.md with no frontmatter', () => {
    const { stdout } = run(`lint --format json ${PLUGIN_FIXTURES}`);
    const results = parseJSON(stdout);
    const errors = results.filter((r) => r.severity === 'error');
    assert.equal(errors.length, 1, `expected 1 error, got ${errors.length}: ${JSON.stringify(errors)}`);
    assert.equal(errors[0].rule, 'parse-error');
    assert.ok(errors[0].filePath.includes('no-fm/SKILL.md'));
  });

  it('multi-plugin fixture: zero errors', () => {
    const { stdout, exitCode } = run(`lint --format json ${MULTI_PLUGIN_FIXTURES}`);
    const results = parseJSON(stdout);
    const errors = results.filter((r) => r.severity === 'error');
    assert.equal(errors.length, 0, `expected 0 errors, got: ${JSON.stringify(errors)}`);
    assert.equal(exitCode, 0);
  });
});

// ---------------------------------------------------------------------------
// AC-10: legacy-format regression test
// ---------------------------------------------------------------------------
describe('AC-10: legacy-format regression', () => {
  it('full fixtures dir produces expected results (48 files, 3 errors)', () => {
    const { stdout, exitCode } = run(`lint ${FIXTURES}`);
    assert.ok(stdout.includes('48 files checked'), `expected "48 files checked" in: ${stdout}`);
    assert.ok(stdout.includes('3 errors'), `expected "3 errors" in: ${stdout}`);
    assert.equal(exitCode, 1);
  });

  it('graph fixtures produce errors (broken refs / cycles)', () => {
    const { stdout, exitCode } = run(`graph ${GRAPH_FIXTURES}`);
    assert.equal(exitCode, 1, `expected exit 1 for graph fixtures, stdout: ${stdout}`);
    assert.ok(
      stdout.includes('broken-reference') || stdout.includes('reference-cycle'),
      `expected graph error rules in: ${stdout}`,
    );
  });
});

// ---------------------------------------------------------------------------
// reportJSON unit coverage
// ---------------------------------------------------------------------------
describe('reportJSON', () => {
  // Import dynamically to test the function directly.
  it('serializes ValidationResult[] to JSON string', async () => {
    const { reportJSON } = await import('../src/reporter.js');
    const results: ValidationResult[] = [
      { filePath: 'test.md', rule: 'test-rule', severity: 'error', message: 'test message' },
    ];
    const json = reportJSON(results);
    const parsed = JSON.parse(json) as ValidationResult[];
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].rule, 'test-rule');
  });

  it('returns [] for empty results', async () => {
    const { reportJSON } = await import('../src/reporter.js');
    const json = reportJSON([]);
    assert.equal(json, '[]');
  });
});
