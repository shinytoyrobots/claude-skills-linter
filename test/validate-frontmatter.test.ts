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
