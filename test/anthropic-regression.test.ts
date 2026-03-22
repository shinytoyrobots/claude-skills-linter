/**
 * Anthropic skills regression suite — story-030.
 *
 * Exercises the three reference patterns used in Anthropic's skill repos
 * (bare canonical, ./ relative, bare subdirectory), format detection for
 * marketplace-only structure, and orphan detection for referenced sub-files.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateGraph, extractRefs, extractRelativeRefs, extractBareRefs } from '../src/validate-graph.js';
import { detectFormat } from '../src/detect-format.js';
import type { ExtractResult, Config } from '../src/types.js';

const CLI = resolve(import.meta.dirname, '..', 'bin', 'cli.js');
const FIXTURES = resolve(import.meta.dirname, 'fixtures');
const ANTHROPIC_FIXTURES = resolve(FIXTURES, 'plugin-anthropic');

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

/** Default graph config with all checks enabled. */
function makeConfig(overrides?: Partial<Config['graph']> & { format?: Config['format'] }): Config {
  const { format, ...graphOverrides } = overrides ?? {};
  return {
    skills_root: '/repo',
    default_level: 1,
    levels: {},
    tools: { mcp_pattern: '', custom: [] },
    models: [],
    limits: { max_file_size: 100000 },
    prefixes: '',
    ignore: [],
    graph: {
      warn_orphans: true,
      warn_fanout_above: 10,
      detect_cycles: true,
      detect_duplicates: true,
      ...graphOverrides,
    },
    format: format,
  };
}

/** Build an ExtractResult with sensible defaults. */
function makeResult(
  overrides: Partial<ExtractResult> & { bodyText?: string },
): ExtractResult {
  const filePath = overrides.filePath ?? '/repo/commands/test.md';
  const fileType = overrides.fileType ?? 'command';
  const bodyText = overrides.bodyText ?? '';

  return {
    filePath,
    fileType,
    errors: overrides.errors ?? [],
    data: {
      '___body_text': bodyText,
      '___body_length': bodyText.length,
      '___has_frontmatter': true,
      '___file_size': bodyText.length + 50,
      '___file_path': filePath,
      '___file_type': fileType,
      ...overrides.data,
    },
  };
}

// =============================================================================
// AC-1 / AC-2: All three reference patterns resolve with 0 broken-reference errors
// =============================================================================

describe('Anthropic regression — three reference patterns', () => {
  const skillBody = [
    '# Test Skill',
    '',
    'Delegate to agents/helper.md for assistance.',
    '',
    'See ./reference/guide.md for the full guide.',
    '',
    'Also check reference/best-practices.md for coding standards.',
  ].join('\n');

  it('AC-1: bare canonical ref (agents/helper.md) is extracted by extractRefs', () => {
    const refs = extractRefs(skillBody);
    const match = refs.find((r) => r.normalized === 'agents/helper.md');
    assert.ok(match, 'Should extract agents/helper.md via canonical pattern');
  });

  it('AC-1: relative ref (./reference/guide.md) is extracted by extractRelativeRefs', () => {
    const refs = extractRelativeRefs(skillBody);
    const match = refs.find((r) => r.raw === './reference/guide.md');
    assert.ok(match, 'Should extract ./reference/guide.md via relative pattern');
  });

  it('AC-1: bare subdirectory ref (reference/best-practices.md) is extracted by extractBareRefs', () => {
    const refs = extractBareRefs(skillBody);
    const match = refs.find((r) => r.raw === 'reference/best-practices.md');
    assert.ok(match, 'Should extract reference/best-practices.md via bare subdirectory pattern');
  });

  it('AC-2: all three patterns resolve with 0 broken-reference errors in plugin format', () => {
    const skill = makeResult({
      filePath: '/repo/skills/test-skill/SKILL.md',
      fileType: 'skill',
      bodyText: skillBody,
    });
    const helper = makeResult({
      filePath: '/repo/skills/test-skill/agents/helper.md',
      fileType: 'agent',
    });
    const guide = makeResult({
      filePath: '/repo/skills/test-skill/reference/guide.md',
      fileType: 'context',
    });
    const bestPractices = makeResult({
      filePath: '/repo/skills/test-skill/reference/best-practices.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, helper, guide, bestPractices], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, `Expected 0 broken refs, got: ${JSON.stringify(broken)}`);
  });

  it('AC-2: referenced sub-files are NOT orphaned', () => {
    const skill = makeResult({
      filePath: '/repo/skills/test-skill/SKILL.md',
      fileType: 'skill',
      bodyText: skillBody,
    });
    const helper = makeResult({
      filePath: '/repo/skills/test-skill/agents/helper.md',
      fileType: 'agent',
    });
    const guide = makeResult({
      filePath: '/repo/skills/test-skill/reference/guide.md',
      fileType: 'context',
    });
    const bestPractices = makeResult({
      filePath: '/repo/skills/test-skill/reference/best-practices.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, helper, guide, bestPractices], config, '/repo');
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    assert.equal(orphans.length, 0, `Expected 0 orphans, got: ${JSON.stringify(orphans)}`);
  });
});

// =============================================================================
// AC-3: Non-existent reference reports broken-reference error
// =============================================================================

describe('Anthropic regression — broken reference detection', () => {
  it('AC-3: reference to non-existent file reports broken-reference error', () => {
    const skill = makeResult({
      filePath: '/repo/skills/test-skill/SKILL.md',
      fileType: 'skill',
      bodyText: 'See ./reference/nonexistent.md for details.',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 1, 'Should report 1 broken reference');
    assert.ok(broken[0].message.includes('nonexistent.md'), 'Should mention the missing file');
  });

  it('AC-3: bare subdirectory ref to non-existent file is broken', () => {
    const skill = makeResult({
      filePath: '/repo/skills/test-skill/SKILL.md',
      fileType: 'skill',
      bodyText: 'Check reference/missing-guide.md for docs.',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 1, 'Should report 1 broken reference for bare subdirectory ref');
    assert.ok(broken[0].message.includes('missing-guide.md'));
  });
});

// =============================================================================
// AC-4: marketplace.json + flat skills/ structure detected as plugin format
// =============================================================================

describe('Anthropic regression — format detection', () => {
  it('AC-4: marketplace.json + flat skills/ structure detected as plugin format', () => {
    const config = makeConfig();
    const format = detectFormat(ANTHROPIC_FIXTURES, config);
    assert.equal(format, 'plugin', 'Should detect plugin format from marketplace.json + skills/');
  });

  it('AC-4: marketplace.json with flat source (no plugins/ dir) is plugin, not multi-plugin', () => {
    const config = makeConfig();
    const format = detectFormat(ANTHROPIC_FIXTURES, config);
    assert.notEqual(format, 'multi-plugin', 'Should NOT detect multi-plugin without plugins/ dir');
  });
});

// =============================================================================
// AC-8: Legacy-format fixtures produce the same results as before
// =============================================================================

describe('Anthropic regression — legacy format unchanged', () => {
  it('AC-8: graph validation on legacy fixtures still finds expected issues', () => {
    const { stdout, exitCode } = run(`graph --format json ${resolve(FIXTURES, 'graph')}`);
    // Legacy graph fixtures should still produce broken refs, orphans, cycles, etc.
    // The exit code should be 1 (errors found).
    assert.equal(exitCode, 1, `Expected exit 1 for legacy graph fixtures, got ${exitCode}`);
  });
});

// =============================================================================
// End-to-end CLI tests against the Anthropic-style fixture
// =============================================================================

describe('Anthropic regression — CLI end-to-end', () => {
  it('lint detects plugin format and reports plugin-manifest-error for missing plugin.json', () => {
    const { stdout, exitCode } = run(`lint --format json ${ANTHROPIC_FIXTURES}`);
    const results = JSON.parse(stdout.trim());
    // Anthropic-style repos have marketplace.json but no plugin.json — this is expected.
    const manifestErrors = results.filter((r: { rule: string }) => r.rule === 'plugin-manifest-error');
    assert.equal(manifestErrors.length, 1, `Expected 1 plugin-manifest-error, got: ${JSON.stringify(manifestErrors)}`);
    assert.equal(exitCode, 1, 'Expected exit 1 due to plugin-manifest-error');
  });

  it('graph produces 0 broken-reference errors for the fixture', () => {
    const { stdout, exitCode } = run(`graph --format json ${ANTHROPIC_FIXTURES}`);
    const results = JSON.parse(stdout.trim());
    const broken = results.filter((r: { rule: string }) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, `Expected 0 broken refs, got: ${JSON.stringify(broken)}`);
  });

  it('graph produces 0 orphaned-file warnings for the fixture', () => {
    const { stdout } = run(`graph --format json ${ANTHROPIC_FIXTURES}`);
    const results = JSON.parse(stdout.trim());
    const orphans = results.filter((r: { rule: string }) => r.rule === 'orphaned-file');

    assert.equal(orphans.length, 0, `Expected 0 orphans, got: ${JSON.stringify(orphans)}`);
  });
});
