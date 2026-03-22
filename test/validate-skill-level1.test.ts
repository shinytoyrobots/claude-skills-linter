import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFrontmatter } from '../src/validate-frontmatter.js';
import type { ExtractResult } from '../src/types.js';

/**
 * Helper: build a skill ExtractResult with sensible defaults.
 */
function makeSkillResult(overrides: Partial<ExtractResult> & { data?: Record<string, unknown> }): ExtractResult {
  return {
    filePath: overrides.filePath ?? '/test/SKILL.md',
    fileType: overrides.fileType ?? 'skill',
    errors: overrides.errors ?? [],
    data: {
      '___body_length': 100,
      '___has_frontmatter': true,
      '___file_size': 200,
      '___body_text': 'Some skill body content.',
      '___file_path': overrides.filePath ?? '/test/SKILL.md',
      '___file_type': overrides.fileType ?? 'skill',
      name: 'my-skill',
      description: 'A valid skill',
      ...overrides.data,
    },
  };
}

/**
 * Helper: build a command ExtractResult with sensible defaults.
 */
function makeCommandResult(overrides: Partial<ExtractResult> & { data?: Record<string, unknown> }): ExtractResult {
  return {
    filePath: overrides.filePath ?? '/test/command.md',
    fileType: overrides.fileType ?? 'command',
    errors: overrides.errors ?? [],
    data: {
      '___body_length': 100,
      '___has_frontmatter': true,
      '___file_size': 200,
      '___body_text': 'Some command body content.',
      '___file_path': overrides.filePath ?? '/test/command.md',
      '___file_type': overrides.fileType ?? 'command',
      description: 'A valid command',
      ...overrides.data,
    },
  };
}

/**
 * Helper: build an agent ExtractResult with sensible defaults.
 */
function makeAgentResult(overrides: Partial<ExtractResult> & { data?: Record<string, unknown> }): ExtractResult {
  return {
    filePath: overrides.filePath ?? '/test/agent.md',
    fileType: overrides.fileType ?? 'agent',
    errors: overrides.errors ?? [],
    data: {
      '___body_length': 100,
      '___has_frontmatter': true,
      '___file_size': 200,
      '___body_text': 'Some agent body content.',
      '___file_path': overrides.filePath ?? '/test/agent.md',
      '___file_type': overrides.fileType ?? 'agent',
      name: 'my-agent',
      description: 'A valid agent',
      ...overrides.data,
    },
  };
}

describe('story-023: Level 1 rules for skill FileType', () => {
  // AC-1: SKILL.md with invalid model value -> "model-enum" error at Level 1
  it('AC-1: skill with invalid model reports model-enum error at Level 1', async () => {
    const input = makeSkillResult({
      data: { model: 'gpt-4' },
    });

    const results = await validateFrontmatter([input], 1);
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.ok(modelErrors.length > 0, `Expected model-enum error, got: ${JSON.stringify(results)}`);
    assert.equal(modelErrors[0].severity, 'error');
    assert.ok(modelErrors[0].message.includes('gpt-4'));
  });

  // AC-1 (positive): valid model passes
  it('AC-1: skill with valid model passes model-enum', async () => {
    const input = makeSkillResult({
      data: { model: 'sonnet' },
    });

    const results = await validateFrontmatter([input], 1);
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.equal(modelErrors.length, 0, `Expected no model-enum errors, got: ${JSON.stringify(modelErrors)}`);
  });

  // AC-2: SKILL.md with unknown tool in allowed-tools -> "unknown-tool" warning at Level 1
  it('AC-2: skill with unknown tool reports unknown-tool warning at Level 1', async () => {
    const input = makeSkillResult({
      data: {
        'allowed-tools': ['Read', 'FakeTool'],
        '___body_text': 'Use Read and FakeTool here.',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const toolWarnings = results.filter((r) => r.rule === 'unknown-tool');
    assert.ok(toolWarnings.length > 0, `Expected unknown-tool warning, got: ${JSON.stringify(results)}`);
    assert.equal(toolWarnings[0].severity, 'warning');
    assert.ok(toolWarnings[0].message.includes('FakeTool'));
  });

  // AC-3: SKILL.md with allowed-tools but none in body -> "tools-not-in-body" warning at Level 1
  it('AC-3: skill with allowed-tools none in body reports tools-not-in-body warning', async () => {
    const input = makeSkillResult({
      data: {
        'allowed-tools': ['Read', 'Write'],
        '___body_text': 'This body does not mention any tools.',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const bodyWarnings = results.filter((r) => r.rule === 'tools-not-in-body');
    assert.ok(bodyWarnings.length > 0, `Expected tools-not-in-body warning, got: ${JSON.stringify(results)}`);
    assert.equal(bodyWarnings[0].severity, 'warning');
  });

  // AC-3 (positive): allowed-tools with at least one in body passes
  it('AC-3: skill with allowed-tools found in body passes', async () => {
    const input = makeSkillResult({
      data: {
        'allowed-tools': ['Read', 'Write'],
        '___body_text': 'Use the Read tool to inspect files.',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const bodyWarnings = results.filter((r) => r.rule === 'tools-not-in-body');
    assert.equal(bodyWarnings.length, 0, `Expected no tools-not-in-body warnings, got: ${JSON.stringify(bodyWarnings)}`);
  });

  // AC-4: --level 0 does NOT apply model-enum, unknown-tool, or tools-not-in-body to skill files
  it('AC-4: --level 0 excludes Level 1 rules (model-enum, unknown-tool, tools-not-in-body)', async () => {
    const input = makeSkillResult({
      data: {
        model: 'gpt-4',
        'allowed-tools': ['FakeTool'],
        '___body_text': 'No tools mentioned.',
      },
    });

    const results = await validateFrontmatter([input], 0);
    const level1Rules = results.filter((r) =>
      ['model-enum', 'unknown-tool', 'tools-not-in-body'].includes(r.rule),
    );
    assert.equal(level1Rules.length, 0, `Expected no Level 1 rules at level 0, got: ${JSON.stringify(level1Rules)}`);
  });

  // AC-7: SKILL.md with allowed-tools: ["AskUserQuestion"] -> accepted as known tool
  it('AC-7: AskUserQuestion is accepted as a known tool', async () => {
    const input = makeSkillResult({
      data: {
        'allowed-tools': ['AskUserQuestion'],
        '___body_text': 'Use AskUserQuestion to prompt the user.',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const toolWarnings = results.filter((r) => r.rule === 'unknown-tool');
    assert.equal(toolWarnings.length, 0, `Expected no unknown-tool warnings for AskUserQuestion, got: ${JSON.stringify(toolWarnings)}`);
  });

  // MCP tools (mcp__*) should be accepted
  it('mcp__ prefixed tools are accepted in skill files', async () => {
    const input = makeSkillResult({
      data: {
        'allowed-tools': ['mcp__github__create_pr'],
        '___body_text': 'Use mcp__github__create_pr for PRs.',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const toolWarnings = results.filter((r) => r.rule === 'unknown-tool');
    assert.equal(toolWarnings.length, 0, `Expected no unknown-tool warnings for mcp__ tool`);
  });
});

describe('story-023: quality_level in schemas', () => {
  // AC-5: Any file with quality_level: 2 in frontmatter -> no schema validation error
  it('AC-5: skill with quality_level: 2 passes schema validation', async () => {
    const input = makeSkillResult({
      data: { quality_level: 2 },
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter((r) => r.rule === 'required-fields-skill');
    assert.equal(schemaErrors.length, 0, `Expected no schema errors for quality_level: 2, got: ${JSON.stringify(schemaErrors)}`);
  });

  it('AC-5: command with quality_level: 2 passes schema validation', async () => {
    const input = makeCommandResult({
      data: { quality_level: 2 },
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter((r) => r.rule === 'required-fields-command');
    assert.equal(schemaErrors.length, 0, `Expected no schema errors for quality_level: 2, got: ${JSON.stringify(schemaErrors)}`);
  });

  it('AC-5: agent with quality_level: 2 passes schema validation', async () => {
    const input = makeAgentResult({
      data: { quality_level: 2 },
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter((r) => r.rule === 'required-fields-agent');
    assert.equal(schemaErrors.length, 0, `Expected no schema errors for quality_level: 2, got: ${JSON.stringify(schemaErrors)}`);
  });

  // AC-5: quality_level: 0 and quality_level: 3 are valid boundaries
  it('AC-5: quality_level: 0 passes schema validation', async () => {
    const input = makeSkillResult({
      data: { quality_level: 0 },
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter((r) => r.rule === 'required-fields-skill');
    assert.equal(schemaErrors.length, 0, `Expected no schema errors for quality_level: 0`);
  });

  it('AC-5: quality_level: 3 passes schema validation', async () => {
    const input = makeSkillResult({
      data: { quality_level: 3 },
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter((r) => r.rule === 'required-fields-skill');
    assert.equal(schemaErrors.length, 0, `Expected no schema errors for quality_level: 3`);
  });

  // AC-6: quality_level: "high" -> schema validation error (must be integer)
  it('AC-6: quality_level: "high" reports schema validation error', async () => {
    const input = makeSkillResult({
      data: { quality_level: 'high' },
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter((r) => r.rule === 'required-fields-skill');
    assert.ok(schemaErrors.length > 0, `Expected schema error for quality_level: "high", got: ${JSON.stringify(results)}`);
    assert.equal(schemaErrors[0].severity, 'error');
  });

  it('AC-6: quality_level: "high" in command reports schema error', async () => {
    const input = makeCommandResult({
      data: { quality_level: 'high' },
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter((r) => r.rule === 'required-fields-command');
    assert.ok(schemaErrors.length > 0, `Expected schema error for quality_level: "high" in command`);
  });

  it('AC-6: quality_level: "high" in agent reports schema error', async () => {
    const input = makeAgentResult({
      data: { quality_level: 'high' },
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter((r) => r.rule === 'required-fields-agent');
    assert.ok(schemaErrors.length > 0, `Expected schema error for quality_level: "high" in agent`);
  });

  // Out of range quality_level values
  it('AC-6: quality_level: 4 reports schema validation error', async () => {
    const input = makeSkillResult({
      data: { quality_level: 4 },
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter((r) => r.rule === 'required-fields-skill');
    assert.ok(schemaErrors.length > 0, `Expected schema error for quality_level: 4`);
  });

  it('AC-6: quality_level: -1 reports schema validation error', async () => {
    const input = makeSkillResult({
      data: { quality_level: -1 },
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter((r) => r.rule === 'required-fields-skill');
    assert.ok(schemaErrors.length > 0, `Expected schema error for quality_level: -1`);
  });

  // quality_level is optional — omitting it should be fine
  it('omitting quality_level passes schema validation', async () => {
    const input = makeSkillResult({
      data: {},
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter((r) => r.rule === 'required-fields-skill');
    assert.equal(schemaErrors.length, 0, `Expected no schema errors when quality_level is omitted`);
  });
});
