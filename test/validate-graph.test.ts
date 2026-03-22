import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGraph } from '../src/validate-graph.js';
import type { ExtractResult, Config } from '../src/types.js';

/** Default graph config with all checks enabled. */
function makeConfig(overrides?: Partial<Config['graph']>): Config {
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
      ...overrides,
    },
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

describe('validateGraph', () => {
  // AC-1: Broken reference to context file
  it('AC-1: reports broken-reference for missing context file', () => {
    const command = makeResult({
      filePath: '/repo/commands/my-command.md',
      fileType: 'command',
      bodyText: 'Use `~/.claude/commands/context/does-not-exist.md` for details.',
    });

    const results = validateGraph([command], makeConfig());
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 1);
    assert.equal(broken[0].filePath, '/repo/commands/my-command.md');
    assert.ok(broken[0].message.includes('does-not-exist.md'));
    assert.equal(broken[0].severity, 'error');
  });

  // AC-1: Broken reference includes line number
  it('AC-1: broken-reference includes line number', () => {
    const command = makeResult({
      filePath: '/repo/commands/my-command.md',
      fileType: 'command',
      bodyText: 'Line one.\nLine two.\nUse `context/missing.md` here.\nLine four.',
    });

    const results = validateGraph([command], makeConfig());
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 1);
    assert.equal(broken[0].line, 3);
  });

  // AC-2: Broken reference to agent file
  it('AC-2: reports broken-reference for missing agent file', () => {
    const command = makeResult({
      filePath: '/repo/commands/my-command.md',
      fileType: 'command',
      bodyText: 'Delegate to `~/.claude/commands/agents/ghost-agent.md`.',
    });

    const results = validateGraph([command], makeConfig());
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 1);
    assert.ok(broken[0].message.includes('ghost-agent.md'));
  });

  // AC-3: Orphaned context file
  it('AC-3: reports orphaned-file for unreferenced context file', () => {
    const orphan = makeResult({
      filePath: '/repo/context/orphan.md',
      fileType: 'context',
      bodyText: 'I am unreferenced context.',
    });
    const command = makeResult({
      filePath: '/repo/commands/some-command.md',
      fileType: 'command',
      bodyText: 'No references here.',
    });

    const results = validateGraph([orphan, command], makeConfig());
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].filePath, '/repo/context/orphan.md');
    assert.equal(orphans[0].severity, 'warning');
  });

  // AC-3: Orphaned agent file
  it('AC-3: reports orphaned-file for unreferenced agent file', () => {
    const agent = makeResult({
      filePath: '/repo/agents/lonely.md',
      fileType: 'agent',
      bodyText: 'I am unreferenced agent.',
    });

    const results = validateGraph([agent], makeConfig());
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    assert.equal(orphans.length, 1);
    assert.equal(orphans[0].filePath, '/repo/agents/lonely.md');
  });

  // AC-3: Referenced context is NOT orphaned
  it('AC-3: referenced context file is not reported as orphaned', () => {
    const ctx = makeResult({
      filePath: '/repo/context/used.md',
      fileType: 'context',
      bodyText: 'Context info.',
    });
    const command = makeResult({
      filePath: '/repo/commands/cmd.md',
      fileType: 'command',
      bodyText: 'Refer to `context/used.md` for details.',
    });

    const results = validateGraph([ctx, command], makeConfig());
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    assert.equal(orphans.length, 0);
  });

  // AC-3: References from context/agent files do NOT prevent orphan status
  it('AC-3: references from non-command files do not prevent orphan detection', () => {
    const ctx1 = makeResult({
      filePath: '/repo/context/a.md',
      fileType: 'context',
      bodyText: 'See `context/b.md`.',
    });
    const ctx2 = makeResult({
      filePath: '/repo/context/b.md',
      fileType: 'context',
      bodyText: 'Some content.',
    });

    const results = validateGraph([ctx1, ctx2], makeConfig());
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    // Both should be orphaned — only command references count.
    assert.equal(orphans.length, 2);
  });

  // AC-4: Duplicate content detection
  it('AC-4: reports duplicate-content for files with identical content', () => {
    const fileA = makeResult({
      filePath: '/repo/commands/dup-a.md',
      fileType: 'command',
      bodyText: 'Identical body content here.',
      data: { description: 'same desc' },
    });
    const fileB = makeResult({
      filePath: '/repo/commands/dup-b.md',
      fileType: 'command',
      bodyText: 'Identical body content here.',
      data: { description: 'same desc' },
    });

    const results = validateGraph([fileA, fileB], makeConfig());
    const dupes = results.filter((r) => r.rule === 'duplicate-content');

    assert.equal(dupes.length, 1);
    assert.equal(dupes[0].severity, 'warning');
    assert.ok(dupes[0].message.includes('dup-a.md'));
  });

  // AC-4: Different content is not flagged
  it('AC-4: different content is not flagged as duplicate', () => {
    const fileA = makeResult({
      filePath: '/repo/commands/a.md',
      fileType: 'command',
      bodyText: 'Content A.',
      data: { description: 'A' },
    });
    const fileB = makeResult({
      filePath: '/repo/commands/b.md',
      fileType: 'command',
      bodyText: 'Content B.',
      data: { description: 'B' },
    });

    const results = validateGraph([fileA, fileB], makeConfig());
    const dupes = results.filter((r) => r.rule === 'duplicate-content');

    assert.equal(dupes.length, 0);
  });

  // AC-5: Two-node cycle
  it('AC-5: detects 2-node cycle (A→B→A)', () => {
    const a = makeResult({
      filePath: '/repo/commands/a.md',
      fileType: 'command',
      bodyText: 'See `commands/b.md`.',
    });
    const b = makeResult({
      filePath: '/repo/commands/b.md',
      fileType: 'command',
      bodyText: 'See `commands/a.md`.',
    });

    const results = validateGraph([a, b], makeConfig());
    const cycles = results.filter((r) => r.rule === 'reference-cycle');

    assert.equal(cycles.length, 1);
    assert.equal(cycles[0].severity, 'error');
    assert.ok(cycles[0].message.includes('→'));
  });

  // AC-5: Three-node cycle
  it('AC-5: detects 3-node cycle (A→B→C→A)', () => {
    const a = makeResult({
      filePath: '/repo/commands/a.md',
      fileType: 'command',
      bodyText: 'See `commands/b.md`.',
    });
    const b = makeResult({
      filePath: '/repo/commands/b.md',
      fileType: 'command',
      bodyText: 'See `commands/c.md`.',
    });
    const c = makeResult({
      filePath: '/repo/commands/c.md',
      fileType: 'command',
      bodyText: 'See `commands/a.md`.',
    });

    const results = validateGraph([a, b, c], makeConfig());
    const cycles = results.filter((r) => r.rule === 'reference-cycle');

    assert.equal(cycles.length, 1);
    assert.ok(cycles[0].message.includes('→'));
  });

  // AC-5: Self-reference
  it('AC-5: detects self-reference cycle', () => {
    const self = makeResult({
      filePath: '/repo/commands/self.md',
      fileType: 'command',
      bodyText: 'See `commands/self.md` for recursion.',
    });

    const results = validateGraph([self], makeConfig());
    const cycles = results.filter((r) => r.rule === 'reference-cycle');

    assert.equal(cycles.length, 1);
    assert.ok(cycles[0].message.includes('commands/self.md'));
  });

  // AC-6: Normalize installed path prefix
  it('AC-6: normalizes ~/.claude/commands/ prefix to repo-relative', () => {
    const ctx = makeResult({
      filePath: '/repo/context/info.md',
      fileType: 'context',
      bodyText: 'Context info.',
    });
    const command = makeResult({
      filePath: '/repo/commands/cmd.md',
      fileType: 'command',
      bodyText: 'Use `~/.claude/commands/context/info.md` for details.',
    });

    const results = validateGraph([ctx, command], makeConfig());
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Normalized path should resolve correctly');
  });

  // AC-7: Repo-relative paths resolve against skills root
  it('AC-7: repo-relative paths resolve against skills root', () => {
    const agent = makeResult({
      filePath: '/repo/agents/helper.md',
      fileType: 'agent',
      bodyText: 'Agent instructions.',
    });
    const command = makeResult({
      filePath: '/repo/commands/cmd.md',
      fileType: 'command',
      bodyText: 'Delegate to `agents/helper.md`.',
    });

    const results = validateGraph([agent, command], makeConfig());
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Repo-relative path should resolve');
  });

  // AC-8: Clean set reports zero errors
  it('AC-8: all-clean set reports zero graph errors', () => {
    const ctx = makeResult({
      filePath: '/repo/context/info.md',
      fileType: 'context',
      bodyText: 'Context info.',
    });
    const agent = makeResult({
      filePath: '/repo/agents/helper.md',
      fileType: 'agent',
      bodyText: 'Agent content.',
    });
    const command = makeResult({
      filePath: '/repo/commands/cmd.md',
      fileType: 'command',
      bodyText: 'Use `context/info.md` and `agents/helper.md`.',
    });

    const results = validateGraph([ctx, agent, command], makeConfig());

    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  // AC-9: Orphan detection disabled
  it('AC-9: skips orphan detection when warn_orphans is false', () => {
    const orphan = makeResult({
      filePath: '/repo/context/orphan.md',
      fileType: 'context',
      bodyText: 'Unreferenced.',
    });

    const config = makeConfig({ warn_orphans: false });
    const results = validateGraph([orphan], config);
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    assert.equal(orphans.length, 0);
  });

  // AC-10: Cycle detection disabled
  it('AC-10: skips cycle detection when detect_cycles is false', () => {
    const a = makeResult({
      filePath: '/repo/commands/a.md',
      fileType: 'command',
      bodyText: 'See `commands/b.md`.',
    });
    const b = makeResult({
      filePath: '/repo/commands/b.md',
      fileType: 'command',
      bodyText: 'See `commands/a.md`.',
    });

    const config = makeConfig({ detect_cycles: false });
    const results = validateGraph([a, b], config);
    const cycles = results.filter((r) => r.rule === 'reference-cycle');

    assert.equal(cycles.length, 0);
  });

  // AC-11: Duplicate detection disabled
  it('AC-11: skips duplicate detection when detect_duplicates is false', () => {
    const fileA = makeResult({
      filePath: '/repo/commands/a.md',
      fileType: 'command',
      bodyText: 'Same content.',
      data: { description: 'same' },
    });
    const fileB = makeResult({
      filePath: '/repo/commands/b.md',
      fileType: 'command',
      bodyText: 'Same content.',
      data: { description: 'same' },
    });

    const config = makeConfig({ detect_duplicates: false });
    const results = validateGraph([fileA, fileB], config);
    const dupes = results.filter((r) => r.rule === 'duplicate-content');

    assert.equal(dupes.length, 0);
  });

  // AC-12: Files with extract errors are skipped
  it('AC-12: skips files with extract errors', () => {
    const errored = makeResult({
      filePath: '/repo/commands/bad.md',
      fileType: 'command',
      bodyText: 'See `context/missing.md`.',
      errors: [{ message: 'YAML parse error', filePath: '/repo/commands/bad.md' }],
    });

    const results = validateGraph([errored], makeConfig());

    assert.equal(results.length, 0, 'Errored files should be completely skipped');
  });

  // AC-12: Errored files not included in adjacency list for cycle detection
  it('AC-12: errored files excluded from cycle detection', () => {
    const a = makeResult({
      filePath: '/repo/commands/a.md',
      fileType: 'command',
      bodyText: 'See `commands/b.md`.',
    });
    const b = makeResult({
      filePath: '/repo/commands/b.md',
      fileType: 'command',
      bodyText: 'See `commands/a.md`.',
      errors: [{ message: 'YAML error', filePath: '/repo/commands/b.md' }],
    });

    const results = validateGraph([a, b], makeConfig());
    const cycles = results.filter((r) => r.rule === 'reference-cycle');

    // No cycle because b is excluded.
    assert.equal(cycles.length, 0);
  });

  // AC-12: Errored files not in file set, so references to them are broken
  it('AC-12: references to errored files are broken references', () => {
    const command = makeResult({
      filePath: '/repo/commands/cmd.md',
      fileType: 'command',
      bodyText: 'See `context/bad.md`.',
    });
    const bad = makeResult({
      filePath: '/repo/context/bad.md',
      fileType: 'context',
      bodyText: 'Bad yaml.',
      errors: [{ message: 'YAML error', filePath: '/repo/context/bad.md' }],
    });

    const results = validateGraph([command, bad], makeConfig());
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 1);
    assert.ok(broken[0].message.includes('bad.md'));
  });

  // Edge case: empty file set
  it('returns empty results for empty file set', () => {
    const results = validateGraph([], makeConfig());
    assert.equal(results.length, 0);
  });

  // Edge case: command files are not flagged as orphaned
  it('command files are never flagged as orphaned', () => {
    const command = makeResult({
      filePath: '/repo/commands/standalone.md',
      fileType: 'command',
      bodyText: 'No references.',
    });

    const results = validateGraph([command], makeConfig());
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    assert.equal(orphans.length, 0);
  });
});
