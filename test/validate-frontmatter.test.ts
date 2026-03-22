import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFrontmatter, getRuleset } from '../src/validate-frontmatter.js';
import type { ExtractResult } from '../src/types.js';

/**
 * Helper: build an ExtractResult with sensible defaults.
 */
function makeResult(overrides: Partial<ExtractResult> & { data?: Record<string, unknown> }): ExtractResult {
  return {
    filePath: overrides.filePath ?? '/test/file.md',
    fileType: overrides.fileType ?? 'command',
    errors: overrides.errors ?? [],
    data: {
      '___body_length': 100,
      '___has_frontmatter': true,
      '___file_size': 200,
      '___body_text': 'Some body content.',
      '___file_path': overrides.filePath ?? '/test/file.md',
      '___file_type': overrides.fileType ?? 'command',
      ...overrides.data,
    },
  };
}

describe('validateFrontmatter', () => {
  // AC-1: Valid command with all required fields and non-empty body returns zero errors.
  it('AC-1: valid command file returns empty ValidationResult array', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A valid command description',
      },
    });

    const results = await validateFrontmatter([input], 0);
    assert.equal(results.length, 0, `Expected 0 errors, got ${results.length}: ${JSON.stringify(results)}`);
  });

  // AC-2: Missing description in a command file reports an error.
  it('AC-2: command missing description reports error with rule, severity, filePath, message', async () => {
    const input = makeResult({
      filePath: '/commands/broken.md',
      fileType: 'command',
      data: {
        name: 'no-desc',
      },
    });

    const results = await validateFrontmatter([input], 0);
    assert.ok(results.length > 0, 'Expected at least one error');

    const descError = results.find((r) => r.message.includes('description'));
    assert.ok(descError, `Expected an error about "description", got: ${JSON.stringify(results)}`);
    assert.equal(descError.filePath, '/commands/broken.md');
    assert.equal(descError.rule, 'required-fields-command');
    assert.equal(descError.severity, 'error');
    assert.ok(descError.message.length > 0);
  });

  // AC-3: Missing name in an agent file reports an error.
  it('AC-3: agent missing name reports error with rule, severity, filePath, message', async () => {
    const input = makeResult({
      filePath: '/agents/no-name.md',
      fileType: 'agent',
      data: {
        description: 'An agent description',
      },
    });

    const results = await validateFrontmatter([input], 0);
    assert.ok(results.length > 0, 'Expected at least one error');

    const nameError = results.find((r) => r.message.includes('name'));
    assert.ok(nameError, `Expected an error about "name", got: ${JSON.stringify(results)}`);
    assert.equal(nameError.filePath, '/agents/no-name.md');
    assert.equal(nameError.rule, 'required-fields-agent');
    assert.equal(nameError.severity, 'error');
    assert.ok(nameError.message.length > 0);
  });

  // AC-4: Non-empty body passes the body rule.
  it('AC-4: file with non-empty body passes non-empty-body rule', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'Valid command',
        '___body_length': 50,
      },
    });

    const results = await validateFrontmatter([input], 0);
    const bodyErrors = results.filter((r) => r.rule === 'non-empty-body');
    assert.equal(bodyErrors.length, 0, `Expected no body errors, got: ${JSON.stringify(bodyErrors)}`);
  });

  // AC-5: Empty body reports an error.
  it('AC-5: file with empty body reports non-empty-body error', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'Valid command',
        '___body_length': 0,
        '___body_text': '',
      },
    });

    const results = await validateFrontmatter([input], 0);
    const bodyErrors = results.filter((r) => r.rule === 'non-empty-body');
    assert.ok(bodyErrors.length > 0, `Expected a non-empty-body error, got: ${JSON.stringify(results)}`);
    assert.equal(bodyErrors[0].severity, 'error');
    assert.ok(bodyErrors[0].message.includes('empty'));
  });

  // AC-6: Pre-existing errors are passed through, Spectral skipped.
  it('AC-6: pre-existing errors passed through as ValidationResults', async () => {
    const input = makeResult({
      filePath: '/broken/invalid.md',
      fileType: 'command',
      errors: [
        { message: 'YAML parse error: something broke', filePath: '/broken/invalid.md' },
      ],
    });

    const results = await validateFrontmatter([input], 0);
    assert.equal(results.length, 1);
    assert.equal(results[0].rule, 'parse-error');
    assert.equal(results[0].severity, 'error');
    assert.equal(results[0].filePath, '/broken/invalid.md');
    assert.ok(results[0].message.includes('YAML parse error'));
  });

  // AC-7: legacy-agent skips schema validation, only body rules.
  it('AC-7: legacy-agent skips schema validation, applies body rules only', async () => {
    const input = makeResult({
      fileType: 'legacy-agent',
      data: {
        '___body_length': 100,
      },
    });

    const results = await validateFrontmatter([input], 0);
    // Should have no schema errors (no name/description required).
    const schemaErrors = results.filter(
      (r) => r.rule === 'required-fields-command' || r.rule === 'required-fields-agent',
    );
    assert.equal(schemaErrors.length, 0, `Expected no schema errors for legacy-agent, got: ${JSON.stringify(schemaErrors)}`);
  });

  // AC-8: context and unknown skip schema validation, only body rules.
  it('AC-8: context file skips schema validation, applies body rules only', async () => {
    const input = makeResult({
      fileType: 'context',
      data: {
        '___body_length': 100,
      },
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter(
      (r) => r.rule === 'required-fields-command' || r.rule === 'required-fields-agent',
    );
    assert.equal(schemaErrors.length, 0, `Expected no schema errors for context, got: ${JSON.stringify(schemaErrors)}`);
  });

  it('AC-8: unknown file skips schema validation, applies body rules only', async () => {
    const input = makeResult({
      fileType: 'unknown',
      data: {
        '___body_length': 100,
      },
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter(
      (r) => r.rule === 'required-fields-command' || r.rule === 'required-fields-agent',
    );
    assert.equal(schemaErrors.length, 0, `Expected no schema errors for unknown, got: ${JSON.stringify(schemaErrors)}`);
  });

  // AC-9: Every rule has x-skill-lint-level extension.
  it('AC-9: every rule in the ruleset has x-skill-lint-level extension', () => {
    const rules = getRuleset();

    assert.ok(Object.keys(rules).length > 0, 'Ruleset must have at least one rule');

    for (const [name, rule] of Object.entries(rules)) {
      assert.ok(
        rule.extensions,
        `Rule "${name}" is missing extensions property`,
      );
      assert.ok(
        typeof rule.extensions['x-skill-lint-level'] === 'number',
        `Rule "${name}" is missing x-skill-lint-level in extensions`,
      );
    }
  });

  // Additional: level filtering works (rules with level > requested are excluded).
  it('level filtering: rules above requested level are excluded', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        // Missing description — would normally trigger error.
        name: 'test',
      },
    });

    // With level -1, all level 0 rules should be excluded.
    const results = await validateFrontmatter([input], -1);
    assert.equal(results.length, 0, `Expected 0 errors with level -1, got: ${JSON.stringify(results)}`);
  });
});

describe('Level 1 rules', () => {
  // AC-1: Invalid model produces error.
  it('model-enum: invalid model produces error', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A command with invalid model',
        model: 'gpt-4',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.ok(modelErrors.length > 0, `Expected a model-enum error, got: ${JSON.stringify(results)}`);
    assert.equal(modelErrors[0].severity, 'error');
    assert.ok(modelErrors[0].message.includes('gpt-4'));
  });

  // AC-5: Valid model passes.
  it('model-enum: valid model passes', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A command with valid model',
        model: 'sonnet',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.equal(modelErrors.length, 0, `Expected no model-enum errors, got: ${JSON.stringify(modelErrors)}`);
  });

  // model-enum: absent model field is skipped.
  it('model-enum: absent model field is skipped', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A command without model field',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.equal(modelErrors.length, 0, `Expected no model-enum errors when model is absent, got: ${JSON.stringify(modelErrors)}`);
  });

  // model-enum: works on agent files too.
  it('model-enum: invalid model on agent file produces error', async () => {
    const input = makeResult({
      fileType: 'agent',
      data: {
        name: 'test-agent',
        description: 'An agent with invalid model',
        model: 'gpt-4',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const modelErrors = results.filter((r) => r.rule === 'model-enum');
    assert.ok(modelErrors.length > 0, `Expected a model-enum error on agent, got: ${JSON.stringify(results)}`);
    assert.equal(modelErrors[0].severity, 'error');
  });

  // AC-2: Unknown tool produces warning.
  it('unknown-tool: unrecognized tool produces warning', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A command with unknown tool',
        'allowed-tools': ['Read', 'FakeToolName'],
        '___body_text': 'Use Read and FakeToolName here.',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const toolWarnings = results.filter((r) => r.rule === 'unknown-tool');
    assert.ok(toolWarnings.length > 0, `Expected an unknown-tool warning, got: ${JSON.stringify(results)}`);
    assert.equal(toolWarnings[0].severity, 'warning');
    assert.ok(toolWarnings[0].message.includes('FakeToolName'));
  });

  // unknown-tool: built-in tools pass.
  it('unknown-tool: built-in tools pass', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A command with built-in tools',
        'allowed-tools': ['Read', 'Write', 'Bash'],
        '___body_text': 'Use Read, Write, and Bash tools.',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const toolWarnings = results.filter((r) => r.rule === 'unknown-tool');
    assert.equal(toolWarnings.length, 0, `Expected no unknown-tool warnings, got: ${JSON.stringify(toolWarnings)}`);
  });

  // unknown-tool: mcp__ pattern tools pass.
  it('unknown-tool: mcp__ pattern tools pass', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A command with MCP tools',
        'allowed-tools': ['mcp__myserver__mytool'],
        '___body_text': 'Use mcp__myserver__mytool here.',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const toolWarnings = results.filter((r) => r.rule === 'unknown-tool');
    assert.equal(toolWarnings.length, 0, `Expected no unknown-tool warnings for mcp__ tools, got: ${JSON.stringify(toolWarnings)}`);
  });

  // unknown-tool: custom tools from config pass.
  it('unknown-tool: custom tools from config pass', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A command with custom tools',
        'allowed-tools': ['MyCustomTool'],
        '___body_text': 'Use MyCustomTool here.',
      },
    });

    const config = {
      models: ['opus', 'sonnet', 'haiku'],
      tools: { mcp_pattern: 'mcp__*', custom: ['MyCustomTool'] },
      limits: { max_file_size: 15360 },
    };

    const results = await validateFrontmatter([input], 1, config);
    const toolWarnings = results.filter((r) => r.rule === 'unknown-tool');
    assert.equal(toolWarnings.length, 0, `Expected no unknown-tool warnings for custom tools, got: ${JSON.stringify(toolWarnings)}`);
  });

  // AC-3: Declared but unused tools produce warning.
  it('tools-not-in-body: declared but unused tools produce warning', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A command with tools not in body',
        'allowed-tools': ['Bash', 'Grep'],
        '___body_text': 'This body mentions nothing about the tools.',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const bodyWarnings = results.filter((r) => r.rule === 'tools-not-in-body');
    assert.ok(bodyWarnings.length > 0, `Expected a tools-not-in-body warning, got: ${JSON.stringify(results)}`);
    assert.equal(bodyWarnings[0].severity, 'warning');
  });

  // tools-not-in-body: at least one tool in body passes.
  it('tools-not-in-body: at least one tool in body passes', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A command with tools in body',
        'allowed-tools': ['Read', 'Write'],
        '___body_text': 'Use the Read tool to read files.',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const bodyWarnings = results.filter((r) => r.rule === 'tools-not-in-body');
    assert.equal(bodyWarnings.length, 0, `Expected no tools-not-in-body warnings, got: ${JSON.stringify(bodyWarnings)}`);
  });

  // AC-4: Oversized file produces warning.
  it('file-size-limit: oversized file produces warning', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'An oversized command',
        '___file_size': 20000,
      },
    });

    const results = await validateFrontmatter([input], 1);
    const sizeWarnings = results.filter((r) => r.rule === 'file-size-limit');
    assert.ok(sizeWarnings.length > 0, `Expected a file-size-limit warning, got: ${JSON.stringify(results)}`);
    assert.equal(sizeWarnings[0].severity, 'warning');
    assert.ok(sizeWarnings[0].message.includes('20000'));
  });

  // file-size-limit: file within limit passes.
  it('file-size-limit: file within limit passes', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A normal-sized command',
        '___file_size': 1000,
      },
    });

    const results = await validateFrontmatter([input], 1);
    const sizeWarnings = results.filter((r) => r.rule === 'file-size-limit');
    assert.equal(sizeWarnings.length, 0, `Expected no file-size-limit warnings, got: ${JSON.stringify(sizeWarnings)}`);
  });

  // file-size-limit: works on agent files too.
  it('file-size-limit: oversized agent file produces warning', async () => {
    const input = makeResult({
      fileType: 'agent',
      data: {
        name: 'test-agent',
        description: 'An oversized agent',
        '___file_size': 20000,
      },
    });

    const results = await validateFrontmatter([input], 1);
    const sizeWarnings = results.filter((r) => r.rule === 'file-size-limit');
    assert.ok(sizeWarnings.length > 0, `Expected a file-size-limit warning on agent, got: ${JSON.stringify(results)}`);
  });

  // AC-7: --level 0 excludes Level 1 rules.
  it('level filtering: --level 0 excludes Level 1 rules', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A command with invalid model',
        model: 'gpt-4',
        'allowed-tools': ['FakeToolName'],
        '___file_size': 20000,
        '___body_text': 'No tools mentioned.',
      },
    });

    const results = await validateFrontmatter([input], 0);
    const level1Rules = results.filter(
      (r) => ['model-enum', 'unknown-tool', 'tools-not-in-body', 'file-size-limit'].includes(r.rule),
    );
    assert.equal(level1Rules.length, 0, `Expected no Level 1 rules at level 0, got: ${JSON.stringify(level1Rules)}`);
  });

  // AC-8: --level 1 includes both Level 0 and Level 1 rules.
  it('level filtering: --level 1 includes both Level 0 and Level 1 rules', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        // Missing description triggers Level 0 error.
        model: 'gpt-4',
        '___file_size': 20000,
        '___body_text': 'No tools mentioned.',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const level0Rules = results.filter((r) => r.rule === 'required-fields-command');
    const level1Rules = results.filter(
      (r) => ['model-enum', 'file-size-limit'].includes(r.rule),
    );
    assert.ok(level0Rules.length > 0, `Expected Level 0 rules at level 1, got: ${JSON.stringify(results)}`);
    assert.ok(level1Rules.length > 0, `Expected Level 1 rules at level 1, got: ${JSON.stringify(results)}`);
  });

  // AC-9: Absent allowed-tools skips tool checks.
  it('absent allowed-tools: skip tool checks', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A command without allowed-tools',
        // No allowed-tools field.
      },
    });

    const results = await validateFrontmatter([input], 1);
    const toolRules = results.filter(
      (r) => r.rule === 'unknown-tool' || r.rule === 'tools-not-in-body',
    );
    assert.equal(toolRules.length, 0, `Expected no tool-related warnings when allowed-tools is absent, got: ${JSON.stringify(toolRules)}`);
  });

  // AC-10: Empty allowed-tools skips tool checks.
  it('empty allowed-tools: skip tool checks', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A command with empty allowed-tools',
        'allowed-tools': [],
      },
    });

    const results = await validateFrontmatter([input], 1);
    const toolRules = results.filter(
      (r) => r.rule === 'unknown-tool' || r.rule === 'tools-not-in-body',
    );
    assert.equal(toolRules.length, 0, `Expected no tool-related warnings when allowed-tools is empty, got: ${JSON.stringify(toolRules)}`);
  });

  // AC-11: Context file is exempt from Level 1 rules.
  it('context file: exempt from Level 1 rules', async () => {
    const input = makeResult({
      fileType: 'context',
      data: {
        '___body_length': 100,
        model: 'gpt-4',
        '___file_size': 20000,
        'allowed-tools': ['FakeToolName'],
        '___body_text': 'No tools mentioned.',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const level1Rules = results.filter(
      (r) => ['model-enum', 'unknown-tool', 'tools-not-in-body', 'file-size-limit'].includes(r.rule),
    );
    assert.equal(level1Rules.length, 0, `Expected no Level 1 rules on context file, got: ${JSON.stringify(level1Rules)}`);
  });

  // AC-11: legacy-agent file is exempt from Level 1 rules.
  it('legacy-agent file: exempt from Level 1 rules', async () => {
    const input = makeResult({
      fileType: 'legacy-agent',
      data: {
        '___body_length': 100,
        model: 'gpt-4',
        '___file_size': 20000,
      },
    });

    const results = await validateFrontmatter([input], 1);
    const level1Rules = results.filter(
      (r) => ['model-enum', 'unknown-tool', 'tools-not-in-body', 'file-size-limit'].includes(r.rule),
    );
    assert.equal(level1Rules.length, 0, `Expected no Level 1 rules on legacy-agent file, got: ${JSON.stringify(level1Rules)}`);
  });

  // AC-11: readme file is exempt from Level 1 rules.
  it('readme file: exempt from Level 1 rules', async () => {
    const input = makeResult({
      fileType: 'readme',
      data: {
        '___body_length': 100,
        model: 'gpt-4',
        '___file_size': 20000,
      },
    });

    const results = await validateFrontmatter([input], 1);
    const level1Rules = results.filter(
      (r) => ['model-enum', 'unknown-tool', 'tools-not-in-body', 'file-size-limit'].includes(r.rule),
    );
    assert.equal(level1Rules.length, 0, `Expected no Level 1 rules on readme file, got: ${JSON.stringify(level1Rules)}`);
  });

  // AC-6: All Level 1 rules have x-skill-lint-level: 1.
  it('all Level 1 rules have x-skill-lint-level: 1', () => {
    const rules = getRuleset();
    const level1RuleNames = ['model-enum', 'unknown-tool', 'tools-not-in-body', 'file-size-limit'];

    for (const name of level1RuleNames) {
      const rule = rules[name];
      assert.ok(rule, `Rule "${name}" must exist in ruleset`);
      assert.equal(
        rule.extensions['x-skill-lint-level'], 1,
        `Rule "${name}" must have x-skill-lint-level: 1`,
      );
    }
  });

  // unknown-tool: does not apply to agent files (agents use 'tools', not 'allowed-tools').
  it('unknown-tool: does not apply to agent files', async () => {
    const input = makeResult({
      fileType: 'agent',
      data: {
        name: 'test-agent',
        description: 'An agent with allowed-tools (should be ignored)',
        'allowed-tools': ['FakeToolName'],
        '___body_text': 'No tools mentioned.',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const toolRules = results.filter(
      (r) => r.rule === 'unknown-tool' || r.rule === 'tools-not-in-body',
    );
    assert.equal(toolRules.length, 0, `Expected no tool rules on agent file, got: ${JSON.stringify(toolRules)}`);
  });
});
