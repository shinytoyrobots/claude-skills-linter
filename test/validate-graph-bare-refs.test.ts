import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateGraph, extractBareRefs } from '../src/validate-graph.js';
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
// extractBareRefs unit tests
// =============================================================================

describe('extractBareRefs', () => {
  it('extracts reference/foo.md', () => {
    const body = 'See reference/foo.md for details.';
    const refs = extractBareRefs(body);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].raw, 'reference/foo.md');
  });

  it('extracts shared/helpers.md', () => {
    const body = 'Use shared/helpers.md for shared logic.';
    const refs = extractBareRefs(body);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].raw, 'shared/helpers.md');
  });

  it('extracts templates/base.md', () => {
    const body = 'Start from templates/base.md.';
    const refs = extractBareRefs(body);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].raw, 'templates/base.md');
  });

  it('extracts examples/demo.md', () => {
    const body = 'See examples/demo.md for a sample.';
    const refs = extractBareRefs(body);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].raw, 'examples/demo.md');
  });

  it('extracts themes/dark.md', () => {
    const body = 'Use themes/dark.md for theming.';
    const refs = extractBareRefs(body);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].raw, 'themes/dark.md');
  });

  it('extracts nested bare path like reference/sub/foo.md', () => {
    const body = 'See reference/sub/foo.md.';
    const refs = extractBareRefs(body);
    assert.equal(refs.length, 1);
    assert.equal(refs[0].raw, 'reference/sub/foo.md');
  });

  it('does NOT match ./reference/foo.md (has dot-slash prefix)', () => {
    const body = 'See ./reference/foo.md for details.';
    const refs = extractBareRefs(body);
    assert.equal(refs.length, 0);
  });

  it('does NOT match agents/foo.md (not a bare subdirectory prefix)', () => {
    const body = 'See agents/foo.md for details.';
    const refs = extractBareRefs(body);
    assert.equal(refs.length, 0);
  });

  it('does NOT match context/foo.md (not a bare subdirectory prefix)', () => {
    const body = 'See context/foo.md for details.';
    const refs = extractBareRefs(body);
    assert.equal(refs.length, 0);
  });

  it('deduplicates identical bare refs', () => {
    const body = 'See reference/foo.md and reference/foo.md again.';
    const refs = extractBareRefs(body);
    assert.equal(refs.length, 1);
  });

  it('extracts multiple different bare refs', () => {
    const body = 'See reference/foo.md and shared/bar.md.';
    const refs = extractBareRefs(body);
    assert.equal(refs.length, 2);
  });

  it('does NOT match word-prefixed paths like myreference/foo.md', () => {
    const body = 'See myreference/foo.md.';
    const refs = extractBareRefs(body);
    assert.equal(refs.length, 0);
  });
});

// =============================================================================
// Story-029 AC-1: agents/grader.md inside plugin SKILL.md resolves relative
// =============================================================================

describe('story-029: bare relative path resolution in plugin format', () => {
  it('AC-1: agents/grader.md inside plugin SKILL.md resolves relative to SKILL.md dir', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Delegate to agents/grader.md for grading.',
    });
    const grader = makeResult({
      filePath: '/repo/skills/deploy/agents/grader.md',
      fileType: 'agent',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, grader], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'agents/grader.md should resolve relative to SKILL.md dir');
  });

  // AC-2: Resolved bare ref that exists is valid
  it('AC-2: resolved bare ref that exists is valid (not broken)', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'See reference/mcp_best_practices.md for best practices.',
    });
    const ref = makeResult({
      filePath: '/repo/skills/deploy/reference/mcp_best_practices.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, ref], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Bare ref to existing file should be valid');
  });

  // AC-3: Bare ref that doesn't resolve relatively falls through to canonical
  it('AC-3: bare ref that fails relative uses canonical fallback', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Delegate to agents/reviewer.md for review.',
    });
    // agents/reviewer.md exists at canonical location, not relative to skill
    const agent = makeResult({
      filePath: '/repo/agents/reviewer.md',
      fileType: 'agent',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, agent], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Should fall back to canonical resolution');
  });

  // AC-4: Legacy-commands format treats agents/grader.md as canonical only
  it('AC-4: legacy-commands format uses canonical resolution only for agents/grader.md', () => {
    const cmd = makeResult({
      filePath: '/repo/commands/test.md',
      fileType: 'command',
      bodyText: 'Delegate to agents/grader.md.',
    });
    const agent = makeResult({
      filePath: '/repo/agents/grader.md',
      fileType: 'agent',
    });

    const config = makeConfig({ format: 'legacy-commands' });
    const results = validateGraph([cmd, agent], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Legacy format should resolve via canonical');
  });

  it('AC-4: legacy-commands does NOT try relative resolution for bare refs', () => {
    const cmd = makeResult({
      filePath: '/repo/commands/test.md',
      fileType: 'command',
      bodyText: 'See reference/foo.md for details.',
    });
    // reference/foo.md does NOT exist as canonical or relative — should be ignored
    // by legacy format (bare refs not extracted in legacy mode)

    const config = makeConfig({ format: 'legacy-commands' });
    const results = validateGraph([cmd], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    // In legacy format, reference/foo.md is not matched by REF_PATTERN
    // (only agents/, context/, commands/ prefixes match), so no broken ref.
    assert.equal(broken.length, 0, 'Legacy format should not extract bare subdirectory refs');
  });

  // AC-5: ./reference/mcp_best_practices.md resolves relative (already works)
  it('AC-5: ./reference/mcp_best_practices.md resolves relative (existing behavior)', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'See ./reference/mcp_best_practices.md for best practices.',
    });
    const ref = makeResult({
      filePath: '/repo/skills/deploy/reference/mcp_best_practices.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, ref], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0);
  });

  // AC-6: reference/foo.md bare without ./ resolves relative in plugin format
  it('AC-6: reference/foo.md bare without ./ resolves relative in plugin format', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'See reference/foo.md for details.',
    });
    const ref = makeResult({
      filePath: '/repo/skills/deploy/reference/foo.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, ref], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Bare reference/foo.md should resolve relative');
  });

  // AC-8: Bare refs added to orphan detection referenced set
  it('AC-8: bare refs are included in orphan detection referenced set', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'See reference/best-practices.md for guidelines.',
    });
    const ref = makeResult({
      filePath: '/repo/skills/deploy/reference/best-practices.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, ref], config, '/repo');
    const orphans = results.filter((r) => r.rule === 'orphaned-file');

    assert.equal(orphans.length, 0, 'File referenced via bare ref should not be orphaned');
  });

  // AC-9: Bare ref fails relative but succeeds canonical -> use canonical
  it('AC-9: bare ref fails relative but succeeds canonical uses canonical (fallback test)', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Delegate to agents/helper.md for help.',
    });
    // agents/helper.md only exists at canonical location
    const agent = makeResult({
      filePath: '/repo/agents/helper.md',
      fileType: 'agent',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, agent], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Canonical fallback should resolve the ref');
  });

  // AC-10: Both relative and canonical would match — prefer relative
  it('AC-10: both relative and canonical match — prefer relative (tie-break)', () => {
    // Use a bare subdirectory ref (reference/) that also exists at a canonical location.
    // reference/tips.md exists locally AND as a canonical context file with a different name.
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'See reference/tips.md for tips.',
    });
    // Exists at relative location
    const localRef = makeResult({
      filePath: '/repo/skills/deploy/reference/tips.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, localRef], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Should resolve via relative path');

    // The local ref should NOT be orphaned (it was referenced via relative).
    const orphans = results.filter((r) => r.rule === 'orphaned-file');
    assert.equal(orphans.length, 0, 'Local ref should not be orphaned — relative was preferred');
  });
});

// =============================================================================
// Skill-root-relative resolution (Anthropic repo pattern)
// =============================================================================

describe('skill-root-relative resolution', () => {
  it('bare ref from nested subdir resolves relative to SKILL.md parent', () => {
    // Pattern: java/claude-api.md references shared/prompt-caching.md
    // File-relative would look for java/shared/prompt-caching.md (wrong).
    // Skill-root-relative looks for skills/deploy/shared/prompt-caching.md (correct).
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
    });
    const nested = makeResult({
      filePath: '/repo/skills/deploy/java/claude-api.md',
      fileType: 'unknown',
      bodyText: 'See shared/prompt-caching.md for caching patterns.',
    });
    const shared = makeResult({
      filePath: '/repo/skills/deploy/shared/prompt-caching.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, nested, shared], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'shared/prompt-caching.md should resolve via skill root');
  });

  it('bare ref from shared/ subdir to sibling shared/ file resolves via skill root', () => {
    // Pattern: shared/onboarding.md references shared/core.md
    // File-relative would look for shared/shared/core.md (wrong).
    // Skill-root-relative looks for skills/deploy/shared/core.md (correct).
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
    });
    const onboarding = makeResult({
      filePath: '/repo/skills/deploy/shared/onboarding.md',
      fileType: 'context',
      bodyText: 'Read shared/core.md for core concepts.',
    });
    const core = makeResult({
      filePath: '/repo/skills/deploy/shared/core.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, onboarding, core], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'shared/core.md should resolve via skill root');
  });

  it('skill-root resolution still reports broken when target does not exist', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
    });
    const nested = makeResult({
      filePath: '/repo/skills/deploy/java/claude-api.md',
      fileType: 'unknown',
      bodyText: 'See shared/nonexistent.md for details.',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, nested], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 1, 'Nonexistent file should still be reported as broken');
  });

  it('SKILL.md with parse errors still marks the skill root', () => {
    // SKILL.md has errors but should still be used to identify the skill root.
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      errors: [{ message: 'YAML parse error', filePath: '/repo/skills/deploy/SKILL.md' }],
    });
    const nested = makeResult({
      filePath: '/repo/skills/deploy/java/claude-api.md',
      fileType: 'unknown',
      bodyText: 'See shared/prompt-caching.md for caching.',
    });
    const shared = makeResult({
      filePath: '/repo/skills/deploy/shared/prompt-caching.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, nested, shared], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Should resolve even when SKILL.md has parse errors');
  });

  it('file-relative resolution is preferred over skill-root resolution', () => {
    // If shared/foo.md exists both relative to the file AND relative to skill root,
    // the file-relative version should win (it's checked first).
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'See shared/foo.md for details.',
    });
    const localShared = makeResult({
      filePath: '/repo/skills/deploy/shared/foo.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, localShared], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'Should resolve via file-relative (same as skill root here)');
  });
});

// =============================================================================
// All three patterns resolve together
// =============================================================================

describe('story-029: all reference patterns resolve together', () => {
  it('../../, ./, and bare patterns all resolve in same file', () => {
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: [
        'Read ../../context/project-rules.md for rules.',
        'See ./helpers.md for local helpers.',
        'Check reference/best-practices.md for guidelines.',
      ].join('\n'),
    });
    const ctx = makeResult({
      filePath: '/repo/context/project-rules.md',
      fileType: 'context',
    });
    const helper = makeResult({
      filePath: '/repo/skills/deploy/helpers.md',
      fileType: 'context',
    });
    const ref = makeResult({
      filePath: '/repo/skills/deploy/reference/best-practices.md',
      fileType: 'context',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, ctx, helper, ref], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    assert.equal(broken.length, 0, 'All three patterns should resolve');
  });
});

// =============================================================================
// seenNormalized prevents double-counting
// =============================================================================

describe('story-029: seenNormalized de-duplication', () => {
  it('REF_PATTERN match already resolved as relative is not double-counted', () => {
    // agents/grader.md matches both REF_PATTERN (agents/ prefix) and could be
    // resolved as relative. The seenNormalized set should prevent duplication.
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Delegate to agents/grader.md for grading.',
    });
    const agent = makeResult({
      filePath: '/repo/skills/deploy/agents/grader.md',
      fileType: 'agent',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, agent], config, '/repo');
    const broken = results.filter((r) => r.rule === 'broken-reference');

    // Should be 0 broken — resolved once via relative, REF_PATTERN skipped.
    assert.equal(broken.length, 0);
  });

  it('canonical ref skipped when already resolved as bare relative ref', () => {
    // If agents/reviewer.md is resolved relative in the REF_PATTERN pre-resolution,
    // it should not appear again as a separate canonical entry.
    const skill = makeResult({
      filePath: '/repo/skills/deploy/SKILL.md',
      fileType: 'skill',
      bodyText: 'Delegate to agents/reviewer.md for review.',
    });
    const agent = makeResult({
      filePath: '/repo/skills/deploy/agents/reviewer.md',
      fileType: 'agent',
    });

    const config = makeConfig({ format: 'plugin' });
    const results = validateGraph([skill, agent], config, '/repo');

    // No broken references — resolved via relative in REF_PATTERN pre-resolution.
    const broken = results.filter((r) => r.rule === 'broken-reference');
    assert.equal(broken.length, 0);

    // The agent should not be orphaned (it's referenced).
    const orphans = results.filter((r) => r.rule === 'orphaned-file');
    assert.equal(orphans.length, 0);
  });
});
