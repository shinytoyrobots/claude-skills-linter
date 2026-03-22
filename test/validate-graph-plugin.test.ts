import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGraph, extractRefs, extractRelativeRefs } from '../src/validate-graph.js';
import type { ExtractResult, Config } from '../src/types.js';

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
// extractRefs regression guard — ensures legacy pattern behavior is unchanged
// =============================================================================

describe('extractRefs — legacy regression guard', () => {
  it('extracts ~/.claude/commands/ prefixed paths', () => {
    const body = 'Use `~/.claude/commands/context/foo.md` for details.';
    const refs = extractRefs(body);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].raw, '~/.claude/commands/context/foo.md');
    assert.equal(refs[0].normalized, 'context/foo.md');
  });

  it('extracts bare type/filename paths', () => {
    const body = 'See `context/bar.md` and `agents/helper.md` and `commands/run.md`.';
    const refs = extractRefs(body);
    assert.equal(refs.length, 3);
    assert.deepEqual(
      refs.map((r) => r.normalized),
      ['context/bar.md', 'agents/helper.md', 'commands/run.md'],
    );
  });

  it('deduplicates identical references', () => {
    const body = 'See `context/foo.md` and then `context/foo.md` again.';
    const refs = extractRefs(body);
    assert.equal(refs.length, 1);
  });

  it('does NOT match relative paths like ../../context/foo.md', () => {
    const body = 'Read [guide](../../context/foo.md) for details.';
    const refs = extractRefs(body);
    // The legacy pattern should NOT match relative paths.
    // ../../context/foo.md should not be captured by REF_PATTERN.
    const hasRelative = refs.some((r) => r.raw.includes('..'));
    assert.equal(hasRelative, false, 'Legacy extractRefs must not match relative paths');
  });

  it('does NOT match ./helpers.md', () => {
    const body = 'See ./helpers.md for details.';
    const refs = extractRefs(body);
    assert.equal(refs.length, 0);
  });

  it('matches nested type paths like context/context/foo.md', () => {
    const body = 'See `context/context/foo.md`.';
    const refs = extractRefs(body);
    assert.equal(refs.length, 1);
  });

  it('snapshot: known legacy body produces exact refs', () => {
    const body = [
      'This command uses:',
      '- `~/.claude/commands/context/output-patterns.md`',
      '- `agents/code-scanner.md`',
      '- `commands/deploy.md`',
      '',
      'Also see context/shared-rules.md for more.',
    ].join('\n');

    const refs = extractRefs(body);
    assert.deepEqual(
      refs.map((r) => ({ raw: r.raw, normalized: r.normalized })),
      [
        { raw: '~/.claude/commands/context/output-patterns.md', normalized: 'context/output-patterns.md' },
        { raw: 'agents/code-scanner.md', normalized: 'agents/code-scanner.md' },
        { raw: 'commands/deploy.md', normalized: 'commands/deploy.md' },
        { raw: 'context/shared-rules.md', normalized: 'context/shared-rules.md' },
      ],
    );
  });
});

// =============================================================================
// extractRelativeRefs
// =============================================================================

describe('extractRelativeRefs', () => {
  it('extracts ../../context/foo.md from bare text', () => {
    const body = 'Read ../../context/foo.md for context.';
    const refs = extractRelativeRefs(body);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].raw, '../../context/foo.md');
  });

  it('extracts relative path from markdown link syntax', () => {
    const body = 'Read [guide](../../context/ds-context-guide.md) for details.';
    const refs = extractRelativeRefs(body);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].raw, '../../context/ds-context-guide.md');
  });

  it('extracts ./helpers.md (same-directory)', () => {
    const body = 'See ./helpers.md for details.';
    const refs = extractRelativeRefs(body);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].raw, './helpers.md');
  });

  it('extracts ../agents/scanner.md (parent-directory)', () => {
    const body = 'Delegate to ../agents/scanner.md.';
    const refs = extractRelativeRefs(body);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].raw, '../agents/scanner.md');
  });

  it('deduplicates identical relative refs', () => {
    const body = 'See ../../context/foo.md and ../../context/foo.md again.';
    const refs = extractRelativeRefs(body);
    assert.equal(refs.length, 1);
  });

  it('extracts multiple different relative paths', () => {
    const body = [
      'Read [guide](../../context/guide.md)',
      'Delegate to [scanner](../agents/scanner.md)',
    ].join('\n');
    const refs = extractRelativeRefs(body);
    assert.equal(refs.length, 2);
  });

  it('does NOT match non-relative paths like context/foo.md', () => {
    const body = 'See context/foo.md for details.';
    const refs = extractRelativeRefs(body);
    assert.equal(refs.length, 0);
  });
});

// =============================================================================
// AC-1: Relative path reference resolution
// =============================================================================

describe('validateGraph — plugin relative path resolution', () => {
  it('AC-1: resolves ../../context/foo.md relative to referencing file', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read [guide](../../context/project-rules.md) for details.',
    });
    const ctx = makeResult({
      filePath: '/repo/context/project-rules.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, ctx], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Relative path should resolve successfully');
  });

  it('AC-1: resolves bare relative path (no markdown link)', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read ../../context/project-rules.md for details.',
    });
    const ctx = makeResult({
      filePath: '/repo/context/project-rules.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, ctx], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0);
  });

  // AC-2: Resolved relative path that exists is valid
  it('AC-2: resolved relative path to existing file is valid', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Delegate to [reviewer](../../agents/reviewer.md).',
    });
    const agent = makeResult({
      filePath: '/repo/agents/reviewer.md',
      fileType: 'agent',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, agent], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0);
  });

  // AC-3: Resolved relative path that does not exist is broken
  it('AC-3: relative path to non-existent file is broken', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read ../../context/missing.md for details.',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 1);
    assert.ok(broken[0].message.includes('../../context/missing.md'));
  });

  // AC-4: legacy-commands uses canonical name resolution only
  it('AC-4: legacy-commands format ignores relative paths', () => {
    const cmd = makeResult({
      filePath: '/repo/commands/test.md',
      fileType: 'command',
      bodyText: 'See ../../context/foo.md for details.',
    });

    const config = makeConfig({ format: 'legacy-commands' });
    const results = validateGraph([cmd], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    // Should have 0 broken refs because ../../context/foo.md is not matched
    // by the legacy REF_PATTERN.
    assert.equal(broken.length, 0, 'Legacy format should not process relative paths');
  });

  // AC-5: Plugin format tries relative first, skips canonical fallback on success
  it('AC-5: relative resolution skips canonical fallback when successful', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read ../../context/project-rules.md for details.',
    });
    const ctx = makeResult({
      filePath: '/repo/context/project-rules.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, ctx], config, '/repo');

    // Should produce zero errors — relative path resolves.
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  // AC-6: File referenced via relative path is NOT orphaned
  it('AC-6: file referenced via relative path is not orphaned', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read [guide](../../context/project-rules.md).',
    });
    const ctx = makeResult({
      filePath: '/repo/context/project-rules.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, ctx], config, '/repo');
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    assert.equal(orphans.length, 0, 'File referenced via relative path should not be orphaned');
  });

  // AC-7: Path that escapes repo root reports broken-reference with escape message
  it('AC-7: relative path escaping repo root is broken with escape message', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read ../../../../etc/passwd.md for secrets.',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 1);
    assert.ok(
      broken[0].message.includes('escapes the repository root'),
      `Expected escape message, got: "${broken[0].message}"`,
    );
  });

  // AC-8: Same-directory relative path resolves correctly
  it('AC-8: ./helpers.md resolves correctly', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'See ./helpers.md for shared logic.',
    });
    const helper = makeResult({
      filePath: '/repo/skills/deploy/helpers.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, helper], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Same-directory relative path should resolve');
  });

  // AC-9: Cycle detection uses canonical names from resolved relative paths
  it('AC-9: cycle detection works with relative path references in plugin format', () => {
    // skill A references context C, and context C references skill A (via relative path).
    // This creates a cycle: skills/SKILL.md → context/shared.md → skills/SKILL.md
    const skillA = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read ../../context/shared.md for details.',
    });
    const ctxC = makeResult({
      filePath: '/repo/context/shared.md',
      fileType: 'context',
      bodyText: 'See ../skills/deploy/SKILL.md for the skill.',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skillA, ctxC], config, '/repo');
    const cycles = results.filter((r) => r.rule === 'reference-cycle');

    assert.equal(cycles.length, 1, 'Should detect cycle via relative paths');
    assert.ok(cycles[0].message.includes('→'));
  });
});

// =============================================================================
// Plugin orphan detection — skill files as referencing entities
// =============================================================================

describe('validateGraph — plugin orphan detection', () => {
  it('skill files act as referencing entities for orphan detection', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read ../../context/project-rules.md for details.',
    });
    const ctx = makeResult({
      filePath: '/repo/context/project-rules.md',
      fileType: 'context',
    });
    const orphanCtx = makeResult({
      filePath: '/repo/context/unused.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, ctx, orphanCtx], config, '/repo');
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    // Only unused.md should be orphaned; project-rules.md is referenced by the skill.
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].filePath, '/repo/context/unused.md');
  });

  it('unreferenced context in plugin format reports orphan with correct message', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'No references here.',
    });
    const ctx = makeResult({
      filePath: '/repo/context/orphan.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, ctx], config, '/repo');
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    assert.equal(orphans.length, 1);
    assert.ok(orphans[0].message.includes('command or skill'));
  });

  it('legacy format orphan detection still checks only command files', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read context/used.md for details.',
    });
    const ctx = makeResult({
      filePath: '/repo/context/used.md',
      fileType: 'context',
    });

    // In legacy-commands format, skill files are NOT referencing entities.
    const config = makeConfig({ format: 'legacy-commands' });
    const results = validateGraph([skill, ctx], config, '/repo');
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    // context/used.md should be orphaned because only commands count in legacy format.
    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].filePath, '/repo/context/used.md');
  });
});

// =============================================================================
// Multi-plugin format
// =============================================================================

describe('validateGraph — multi-plugin format', () => {
  it('resolves relative paths in multi-plugin format', () => {
    const skill = makeResult({
      filePath: '/repo/plugins/foo/skills/bar/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read [rules](../../context/shared-rules.md).',
    });
    const ctx = makeResult({
      filePath: '/repo/plugins/foo/context/shared-rules.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'multi-plugin' });
    const results = validateGraph([skill, ctx], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0);
  });

  it('skill files are referencing entities in multi-plugin format', () => {
    const skill = makeResult({
      filePath: '/repo/plugins/foo/skills/bar/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read ../../context/shared-rules.md.',
    });
    const ctx = makeResult({
      filePath: '/repo/plugins/foo/context/shared-rules.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'multi-plugin' });
    const results = validateGraph([skill, ctx], config, '/repo');
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    assert.equal(orphans.length, 0);
  });
});

// =============================================================================
// Edge cases
// =============================================================================

describe('validateGraph — plugin edge cases', () => {
  it('no rootDir provided: relative paths are not processed', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read ../../context/foo.md for details.',
    });

    const config = makeConfig({ format: 'plugin' });
    // No rootDir passed — relative path extraction should be skipped.
    const results = validateGraph([skill], config);
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Without rootDir, relative refs should not be processed');
  });

  it('format undefined: behaves like legacy (no relative path resolution)', () => {
    const cmd = makeResult({
      filePath: '/repo/commands/test.md',
      fileType: 'command',
      bodyText: 'See context/used.md for details.',
    });
    const ctx = makeResult({
      filePath: '/repo/context/used.md',
      fileType: 'context',
    });

    const config = makeConfig();
    const results = validateGraph([cmd, ctx], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0);
  });

  it('broken-reference from relative path includes line number', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Line one.\nLine two.\nRead ../../context/missing.md here.\nLine four.',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 1);
    assert.equal(broken[0].line, 3);
  });

  it('mixed canonical and relative refs in same file both resolve', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: [
        'Read ../../context/project-rules.md for rules.',
        'Also see `agents/reviewer.md` for review.',
      ].join('\n'),
    });
    const ctx = makeResult({
      filePath: '/repo/context/project-rules.md',
      fileType: 'context',
    });
    const agent = makeResult({
      filePath: '/repo/agents/reviewer.md',
      fileType: 'agent',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, ctx, agent], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Both canonical and relative refs should resolve');
  });

  it('plugin format with canonical-only refs still works (no relative paths)', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'See `context/project-rules.md` for details.',
    });
    const ctx = makeResult({
      filePath: '/repo/context/project-rules.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, ctx], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0);
  });
});

// =============================================================================
// Story-021: SKILL.md canonical name uses parent dir, not filename
// =============================================================================

describe('validateGraph — story-021: SKILL.md canonical name fix', () => {
  // AC-1: plugins/foo/skills/bar/SKILL.md → canonical name skills/bar
  it('AC-1: SKILL.md canonical name uses parent dir name, not filename', () => {
    const skill = makeResult({
      filePath: '/repo/plugins/foo/skills/bar/SKILL.md',
      fileType: 'skill',
      bodyText: 'A skill.',
    });
    const command = makeResult({
      filePath: '/repo/commands/test.md',
      fileType: 'command',
      bodyText: 'No refs.',
    });

    const config = makeConfig({ format: 'multi-plugin' });
    const results = validateGraph([skill, command], config, '/repo');
    const collisions = results.filter((r) => r.rule === 'name-collision');

    // Single skill file should never produce a name collision.
    assert.equal(collisions.length, 0);
  });

  // AC-2: Two SKILL.md files in different skill dirs → no name collision
  it('AC-2: two SKILL.md files in different skill dirs produce no collision', () => {
    const skillA = makeResult({
      filePath: '/repo/plugins/foo/skills/bar/SKILL.md',
      fileType: 'skill',
      bodyText: 'Skill bar.',
    });
    const skillB = makeResult({
      filePath: '/repo/plugins/foo/skills/baz/SKILL.md',
      fileType: 'skill',
      bodyText: 'Skill baz.',
    });

    const config = makeConfig({ format: 'multi-plugin' });
    const results = validateGraph([skillA, skillB], config, '/repo');
    const collisions = results.filter((r) => r.rule === 'name-collision');

    assert.equal(collisions.length, 0, `Expected no collisions, got: ${JSON.stringify(collisions)}`);
  });

  // AC-2b: Multiple SKILL.md files across plugins → no collision when parent dirs differ
  it('AC-2b: SKILL.md files across different plugins with unique skill dirs produce no collision', () => {
    const skillA = makeResult({
      filePath: '/repo/plugins/alpha/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Deploy skill from alpha.',
    });
    const skillB = makeResult({
      filePath: '/repo/plugins/beta/skills/review/SKILL.md',
      fileType: 'skill',
      bodyText: 'Review skill from beta.',
    });
    const skillC = makeResult({
      filePath: '/repo/plugins/gamma/skills/test/SKILL.md',
      fileType: 'skill',
      bodyText: 'Test skill from gamma.',
    });

    const config = makeConfig({ format: 'multi-plugin' });
    const results = validateGraph([skillA, skillB, skillC], config, '/repo');
    const collisions = results.filter((r) => r.rule === 'name-collision');

    assert.equal(collisions.length, 0);
  });

  // AC-3: Two SKILL.md files with same parent dir name across plugins → report collision
  it('AC-3: same parent dir name across plugins reports name collision', () => {
    const skillA = makeResult({
      filePath: '/repo/plugins/alpha/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Deploy skill from alpha.',
    });
    const skillB = makeResult({
      filePath: '/repo/plugins/beta/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Deploy skill from beta.',
    });

    const config = makeConfig({ format: 'multi-plugin' });
    const results = validateGraph([skillA, skillB], config, '/repo');
    const collisions = results.filter((r) => r.rule === 'name-collision');

    assert.ok(collisions.length > 0, 'Should report collision for same parent dir name');
    assert.ok(collisions[0].message.includes('skills/deploy'));
  });

  // AC-5: Legacy format canonical names unchanged (regression guard)
  it('AC-5: legacy format command canonical names are unchanged', () => {
    const cmdA = makeResult({
      filePath: '/repo/commands/deploy.md',
      fileType: 'command',
      bodyText: 'See `commands/review.md`.',
    });
    const cmdB = makeResult({
      filePath: '/repo/commands/review.md',
      fileType: 'command',
      bodyText: 'See `commands/deploy.md`.',
    });

    const config = makeConfig({ format: 'legacy-commands' });
    const results = validateGraph([cmdA, cmdB], config, '/repo');
    const collisions = results.filter((r) => r.rule === 'name-collision');

    assert.equal(collisions.length, 0, 'Unique command filenames should not collide');
  });

  it('AC-5: legacy format context/agent canonical names unchanged', () => {
    const ctx = makeResult({
      filePath: '/repo/context/rules.md',
      fileType: 'context',
      bodyText: 'Rules.',
    });
    const agent = makeResult({
      filePath: '/repo/agents/helper.md',
      fileType: 'agent',
      bodyText: 'Helper.',
    });
    const cmd = makeResult({
      filePath: '/repo/commands/cmd.md',
      fileType: 'command',
      bodyText: 'See `context/rules.md` and `agents/helper.md`.',
    });

    const config = makeConfig({ format: 'legacy-commands' });
    const results = validateGraph([ctx, agent, cmd], config, '/repo');

    assert.equal(results.length, 0, `Expected clean graph, got: ${JSON.stringify(results)}`);
  });

  // Verify all four graph functions work after the fix
  it('broken-ref detection works with skill files after fix', () => {
    const skill = makeResult({
      filePath: '/repo/plugins/foo/skills/bar/SKILL.md',
      fileType: 'skill',
      bodyText: 'See ../../context/missing.md for details.',
    });

    const config = makeConfig({ format: 'multi-plugin' });
    const results = validateGraph([skill], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 1);
    assert.ok(broken[0].message.includes('missing.md'));
  });

  it('orphan detection works with skill files after fix', () => {
    const skill = makeResult({
      filePath: '/repo/plugins/foo/skills/bar/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read ../../context/used.md for details.',
    });
    const usedCtx = makeResult({
      filePath: '/repo/plugins/foo/context/used.md',
      fileType: 'context',
    });
    const orphanCtx = makeResult({
      filePath: '/repo/plugins/foo/context/unused.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'multi-plugin' });
    const results = validateGraph([skill, usedCtx, orphanCtx], config, '/repo');
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].filePath, '/repo/plugins/foo/context/unused.md');
  });

  it('cycle detection works with skill files after fix', () => {
    const skill = makeResult({
      filePath: '/repo/plugins/foo/skills/bar/SKILL.md',
      fileType: 'skill',
      bodyText: 'Read ../../context/shared.md for details.',
    });
    const ctx = makeResult({
      filePath: '/repo/plugins/foo/context/shared.md',
      fileType: 'context',
      bodyText: 'See ../skills/bar/SKILL.md for the skill.',
    });

    const config = makeConfig({ format: 'multi-plugin' });
    const results = validateGraph([skill, ctx], config, '/repo');
    const cycles = results.filter((r) => r.rule === 'reference-cycle');

    assert.equal(cycles.length, 1, 'Should detect cycle via relative paths');
    assert.ok(cycles[0].message.includes('→'));
  });

  it('name-collision detection works correctly after fix', () => {
    // Same parent dir name = collision
    const skillA = makeResult({
      filePath: '/repo/plugins/alpha/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Alpha deploy.',
    });
    const skillB = makeResult({
      filePath: '/repo/plugins/beta/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Beta deploy.',
    });
    // Different parent dir name = no collision
    const skillC = makeResult({
      filePath: '/repo/plugins/alpha/skills/review/SKILL.md',
      fileType: 'skill',
      bodyText: 'Alpha review.',
    });

    const config = makeConfig({ format: 'multi-plugin' });
    const results = validateGraph([skillA, skillB, skillC], config, '/repo');
    const collisions = results.filter((r) => r.rule === 'name-collision');

    // Only the two deploy skills should collide, not review.
    const collisionPaths = collisions.map((c) => c.filePath);
    assert.ok(collisions.length >= 1, 'Should report collision for deploy skills');
    assert.ok(
      collisions.some((c) => c.message.includes('skills/deploy')),
      'Collision message should mention skills/deploy',
    );
    // review skill should NOT appear in collisions.
    assert.ok(
      !collisionPaths.includes('/repo/plugins/alpha/skills/review/SKILL.md'),
      'Review skill should not be in collisions',
    );
  });
});
