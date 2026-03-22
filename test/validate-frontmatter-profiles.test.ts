import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFrontmatter } from '../src/validate-frontmatter.js';
import type { ExtractResult, Config } from '../src/types.js';

/**
 * Helper: build an ExtractResult with sensible defaults.
 */
function makeResult(overrides: Partial<ExtractResult> & { data?: Record<string, unknown> }): ExtractResult {
  return {
    filePath: overrides.filePath ?? '/project/.claude/commands/file.md',
    fileType: overrides.fileType ?? 'command',
    errors: overrides.errors ?? [],
    data: {
      '___body_length': 100,
      '___has_frontmatter': true,
      '___file_size': 200,
      '___body_text': 'Some body content with Read tool.',
      '___file_path': overrides.filePath ?? '/project/.claude/commands/file.md',
      '___file_type': overrides.fileType ?? 'command',
      ...overrides.data,
    },
  };
}

/** Full config for profile tests. */
function makeConfig(overrides: Partial<Config> = {}): Pick<Config, 'models' | 'tools' | 'limits' | 'default_level' | 'levels' | 'skills_root'> {
  return {
    models: overrides.models ?? ['opus', 'sonnet', 'haiku'],
    tools: overrides.tools ?? { mcp_pattern: 'mcp__*', custom: [] },
    limits: overrides.limits ?? { max_file_size: 15360 },
    default_level: overrides.default_level ?? 0,
    levels: overrides.levels ?? {},
    skills_root: overrides.skills_root ?? '/project/.claude',
  };
}

describe('validateFrontmatter with progressive profiles', () => {
  // AC-1: File with quality_level: 2 → Level 0 + Level 1 + Level 2 rules applied
  it('AC-1: file with quality_level: 2 gets Level 0 + Level 1 rules applied', async () => {
    const input = makeResult({
      data: {
        description: 'A valid command',
        quality_level: 2,
        model: 'gpt-4', // Invalid model — Level 1 rule
      },
    });

    const results = await validateFrontmatter([input], 0, makeConfig());
    // Level 1 model-enum rule should fire because quality_level: 2 raises effective level to 2
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.ok(modelErrors.length > 0, `Expected model-enum error with quality_level: 2, got: ${JSON.stringify(results)}`);
  });

  // AC-2: Directory level override applies as default
  it('AC-2: directory level from config.levels applies to file', async () => {
    const config = makeConfig({
      levels: { 'commands': 1 },
    });
    const input = makeResult({
      filePath: '/project/.claude/commands/foo.md',
      data: {
        description: 'A valid command',
        model: 'gpt-4', // Invalid model — Level 1 rule
      },
    });

    const results = await validateFrontmatter([input], 0, config);
    // Directory level 1 should enable Level 1 rules
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.ok(modelErrors.length > 0, `Expected model-enum error with directory level 1, got: ${JSON.stringify(results)}`);
  });

  // AC-3: No quality_level and no dir match → uses cliLevel (preserves backward compat)
  it('AC-3: no quality_level uses cliLevel as effective level', async () => {
    const input = makeResult({
      data: {
        description: 'A valid command',
        model: 'gpt-4',
      },
    });

    // cliLevel 0 → Level 1 rules excluded
    const results = await validateFrontmatter([input], 0, makeConfig());
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.equal(modelErrors.length, 0, `Expected no model-enum error at cliLevel 0, got: ${JSON.stringify(results)}`);
  });

  // AC-4: effectiveLevel = max(resolvedLevel, cliLevel) — cliLevel wins
  it('AC-4: effectiveLevel is max of resolved and cli level', async () => {
    const input = makeResult({
      data: {
        description: 'A valid command',
        quality_level: 0,
        model: 'gpt-4',
      },
    });

    // quality_level: 0, cliLevel: 1 → max(0, 1) = 1
    const results = await validateFrontmatter([input], 1, makeConfig());
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.ok(modelErrors.length > 0, `Expected model-enum error with max(0,1)=1, got: ${JSON.stringify(results)}`);
  });

  // AC-5: File declares quality_level: 1, --level 2 → apply Level 2 (max(1,2)=2)
  it('AC-5: quality_level 1 + cliLevel 2 → effective level 2', async () => {
    const input = makeResult({
      data: {
        description: 'A valid command',
        quality_level: 1,
        model: 'gpt-4',
      },
    });

    const results = await validateFrontmatter([input], 2, makeConfig());
    // effectiveLevel should be 2
    assert.ok(results.some((r) => r.effectiveLevel === 2), `Expected effectiveLevel 2, got: ${JSON.stringify(results)}`);
  });

  // AC-6: File declares quality_level: 2, --level 0 → apply Level 2 (max(2,0)=2)
  it('AC-6: quality_level 2 + cliLevel 0 → effective level 2', async () => {
    const input = makeResult({
      data: {
        description: 'A valid command',
        quality_level: 2,
        model: 'gpt-4',
      },
    });

    const results = await validateFrontmatter([input], 0, makeConfig());
    // Level 1 rules should fire because effective level is 2
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.ok(modelErrors.length > 0, `Expected model-enum error with max(2,0)=2, got: ${JSON.stringify(results)}`);
    assert.equal(modelErrors[0].effectiveLevel, 2);
  });

  // AC-8: JSON format includes effectiveLevel in ValidationResult
  it('AC-8: effectiveLevel is included in ValidationResult', async () => {
    const input = makeResult({
      data: {
        description: 'A valid command',
        quality_level: 1,
        model: 'gpt-4',
      },
    });

    const results = await validateFrontmatter([input], 0, makeConfig());
    for (const r of results) {
      assert.equal(r.effectiveLevel, 1, `Expected effectiveLevel 1, got: ${JSON.stringify(r)}`);
    }
  });

  // AC-9: quality_level: 99 (out of range) → warning to stderr, treat as default
  it('AC-9: out-of-range quality_level warns and uses default_level', async () => {
    const input = makeResult({
      data: {
        description: 'A valid command',
        quality_level: 99,
        model: 'gpt-4',
      },
    });

    // Capture stderr
    const originalWrite = process.stderr.write;
    let stderrOutput = '';
    process.stderr.write = ((chunk: string) => {
      stderrOutput += chunk;
      return true;
    }) as typeof process.stderr.write;

    try {
      const config = makeConfig({ default_level: 0 });
      const results = await validateFrontmatter([input], 0, config);

      // Should have warned on stderr
      assert.ok(stderrOutput.includes('quality_level 99'), `Expected stderr warning about quality_level 99, got: "${stderrOutput}"`);
      assert.ok(stderrOutput.includes('out of range'), `Expected "out of range" in stderr, got: "${stderrOutput}"`);

      // Model-enum should NOT fire (effective level is max(default 0, cli 0) = 0)
      const modelErrors = results.filter((r) => r.rule === 'model-enum');
      assert.equal(modelErrors.length, 0, `Expected no model-enum error at effective level 0`);
    } finally {
      process.stderr.write = originalWrite;
    }
  });

  // Backward compatibility: no quality_level + cliLevel controls everything
  it('backward compat: without quality_level, cliLevel 1 enables Level 1 rules', async () => {
    const input = makeResult({
      data: {
        description: 'A valid command',
        model: 'gpt-4',
      },
    });

    const results = await validateFrontmatter([input], 1, makeConfig());
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.ok(modelErrors.length > 0, `Expected model-enum error at cliLevel 1`);
  });

  it('backward compat: without quality_level, cliLevel 0 excludes Level 1 rules', async () => {
    const input = makeResult({
      data: {
        description: 'A valid command',
        model: 'gpt-4',
        '___file_size': 20000,
      },
    });

    const results = await validateFrontmatter([input], 0, makeConfig());
    const level1Rules = results.filter(
      (r) => ['model-enum', 'unknown-tool', 'tools-not-in-body', 'file-size-limit'].includes(r.rule),
    );
    assert.equal(level1Rules.length, 0, `Expected no Level 1 rules at cliLevel 0, got: ${JSON.stringify(level1Rules)}`);
  });

  // Directory level: longest prefix wins
  it('directory level: longest prefix wins', async () => {
    const config = makeConfig({
      levels: {
        'commands': 0,
        'commands/critical': 1,
      },
    });

    const input = makeResult({
      filePath: '/project/.claude/commands/critical/deploy.md',
      data: {
        description: 'A critical command',
        model: 'gpt-4',
      },
    });

    const results = await validateFrontmatter([input], 0, config);
    // Longest prefix "commands/critical" → level 1
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.ok(modelErrors.length > 0, `Expected model-enum error from directory level 1`);
  });

  // File quality_level overrides directory level
  it('file quality_level overrides directory level', async () => {
    const config = makeConfig({
      levels: { 'commands': 1 },
    });

    const input = makeResult({
      filePath: '/project/.claude/commands/foo.md',
      data: {
        description: 'A command',
        quality_level: 0,
        model: 'gpt-4',
      },
    });

    // File says level 0, directory says level 1
    // max(0, cliLevel 0) = 0, so Level 1 rules should NOT fire
    const results = await validateFrontmatter([input], 0, config);
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.equal(modelErrors.length, 0, `Expected no model-enum error when file explicitly sets quality_level: 0`);
  });

  // Multiple files with different quality levels
  it('handles multiple files with different effective levels', async () => {
    const file1 = makeResult({
      filePath: '/project/.claude/commands/low.md',
      data: {
        description: 'Low quality file',
        quality_level: 0,
        model: 'gpt-4',
      },
    });

    const file2 = makeResult({
      filePath: '/project/.claude/commands/high.md',
      data: {
        description: 'High quality file',
        quality_level: 1,
        model: 'gpt-4',
      },
    });

    const results = await validateFrontmatter([file1, file2], 0, makeConfig());

    // file1 (level 0): no model-enum error
    const file1Errors = results.filter((r) => r.filePath.includes('low.md') && r.rule === 'model-enum');
    assert.equal(file1Errors.length, 0, 'Low quality file should not get Level 1 rules');

    // file2 (level 1): model-enum error
    const file2Errors = results.filter((r) => r.filePath.includes('high.md') && r.rule === 'model-enum');
    assert.ok(file2Errors.length > 0, 'High quality file should get Level 1 rules');
  });
});
