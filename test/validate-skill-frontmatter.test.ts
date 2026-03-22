import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFrontmatter, getRuleset } from '../src/validate-frontmatter.js';
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
      ...overrides.data,
    },
  };
}

describe('SKILL.md frontmatter validation (story-017)', () => {
  // AC-1: Valid SKILL.md with name and description passes Level 0.
  it('AC-1: valid skill file with name and description passes Level 0', async () => {
    const input = makeSkillResult({
      data: {
        name: 'my-skill',
        description: 'A valid skill description',
      },
    });

    const results = await validateFrontmatter([input], 0);
    assert.equal(results.length, 0, `Expected 0 errors, got ${results.length}: ${JSON.stringify(results)}`);
  });

  // AC-2: Missing name reports required-fields-skill error.
  it('AC-2: skill missing name reports required-fields-skill error', async () => {
    const input = makeSkillResult({
      filePath: '/skills/no-name/SKILL.md',
      data: {
        description: 'A skill without a name',
      },
    });

    const results = await validateFrontmatter([input], 0);
    assert.ok(results.length > 0, 'Expected at least one error');

    const nameError = results.find((r) => r.message.includes('name'));
    assert.ok(nameError, `Expected an error about "name", got: ${JSON.stringify(results)}`);
    assert.equal(nameError.filePath, '/skills/no-name/SKILL.md');
    assert.equal(nameError.rule, 'required-fields-skill');
    assert.equal(nameError.severity, 'error');
  });

  // AC-3: Missing description reports required-fields-skill error.
  it('AC-3: skill missing description reports required-fields-skill error', async () => {
    const input = makeSkillResult({
      filePath: '/skills/no-desc/SKILL.md',
      data: {
        name: 'no-desc',
      },
    });

    const results = await validateFrontmatter([input], 0);
    assert.ok(results.length > 0, 'Expected at least one error');

    const descError = results.find((r) => r.message.includes('description'));
    assert.ok(descError, `Expected an error about "description", got: ${JSON.stringify(results)}`);
    assert.equal(descError.filePath, '/skills/no-desc/SKILL.md');
    assert.equal(descError.rule, 'required-fields-skill');
    assert.equal(descError.severity, 'error');
  });

  // AC-4: Valid optional fields are accepted.
  it('AC-4: valid optional boolean/string fields are accepted', async () => {
    const input = makeSkillResult({
      data: {
        name: 'my-skill',
        description: 'A skill with optional fields',
        invocable: true,
        'argument-hint': 'some hint',
        'disable-model-invocation': false,
        'user-invocable': true,
      },
    });

    const results = await validateFrontmatter([input], 0);
    assert.equal(results.length, 0, `Expected 0 errors, got ${results.length}: ${JSON.stringify(results)}`);
  });

  // AC-4b: Invalid type for invocable (string instead of boolean) reports error.
  it('AC-4b: invocable with string value reports required-fields-skill error', async () => {
    const input = makeSkillResult({
      data: {
        name: 'my-skill',
        description: 'A skill with bad invocable',
        invocable: 'yes',
      },
    });

    const results = await validateFrontmatter([input], 0);
    assert.ok(results.length > 0, 'Expected at least one error');

    const typeError = results.find((r) => r.rule === 'required-fields-skill');
    assert.ok(typeError, `Expected a required-fields-skill error, got: ${JSON.stringify(results)}`);
    assert.equal(typeError.severity, 'error');
  });

  // AC-4b: Invalid type for disable-model-invocation reports error.
  it('AC-4b: disable-model-invocation with string value reports error', async () => {
    const input = makeSkillResult({
      data: {
        name: 'my-skill',
        description: 'A skill with bad disable-model-invocation',
        'disable-model-invocation': 'no',
      },
    });

    const results = await validateFrontmatter([input], 0);
    const typeError = results.find((r) => r.rule === 'required-fields-skill');
    assert.ok(typeError, `Expected a required-fields-skill error, got: ${JSON.stringify(results)}`);
  });

  // AC-4b: Invalid type for user-invocable reports error.
  it('AC-4b: user-invocable with number value reports error', async () => {
    const input = makeSkillResult({
      data: {
        name: 'my-skill',
        description: 'A skill with bad user-invocable',
        'user-invocable': 1,
      },
    });

    const results = await validateFrontmatter([input], 0);
    const typeError = results.find((r) => r.rule === 'required-fields-skill');
    assert.ok(typeError, `Expected a required-fields-skill error, got: ${JSON.stringify(results)}`);
  });

  // AC-5: Additional unknown fields are allowed.
  it('AC-5: additional unknown frontmatter fields are allowed', async () => {
    const input = makeSkillResult({
      data: {
        name: 'my-skill',
        description: 'A skill with extra fields',
        'custom-field': 'some value',
        version: '1.0.0',
      },
    });

    const results = await validateFrontmatter([input], 0);
    assert.equal(results.length, 0, `Expected 0 errors with additional fields, got: ${JSON.stringify(results)}`);
  });

  // AC-5b: Empty string name reports error.
  it('AC-5b: empty string name reports required-fields-skill error', async () => {
    const input = makeSkillResult({
      data: {
        name: '',
        description: 'A skill with empty name',
      },
    });

    const results = await validateFrontmatter([input], 0);
    assert.ok(results.length > 0, 'Expected at least one error for empty name');

    const nameError = results.find((r) => r.rule === 'required-fields-skill');
    assert.ok(nameError, `Expected a required-fields-skill error, got: ${JSON.stringify(results)}`);
    assert.equal(nameError.severity, 'error');
  });

  // AC-5b: Empty string description reports error.
  it('AC-5b: empty string description reports required-fields-skill error', async () => {
    const input = makeSkillResult({
      data: {
        name: 'my-skill',
        description: '',
      },
    });

    const results = await validateFrontmatter([input], 0);
    assert.ok(results.length > 0, 'Expected at least one error for empty description');

    const descError = results.find((r) => r.rule === 'required-fields-skill');
    assert.ok(descError, `Expected a required-fields-skill error, got: ${JSON.stringify(results)}`);
    assert.equal(descError.severity, 'error');
  });

  // AC-6: Non-kebab-case name reports skill-name-format warning at Level 1.
  it('AC-6: non-kebab-case name reports skill-name-format warning', async () => {
    const input = makeSkillResult({
      data: {
        name: 'MySkill',
        description: 'A skill with PascalCase name',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const nameWarnings = results.filter((r) => r.rule === 'skill-name-format');
    assert.ok(nameWarnings.length > 0, `Expected a skill-name-format warning, got: ${JSON.stringify(results)}`);
    assert.equal(nameWarnings[0].severity, 'warning');
    assert.ok(nameWarnings[0].message.includes('MySkill'));
  });

  // AC-6: Name with underscores reports warning.
  it('AC-6: name with underscores reports skill-name-format warning', async () => {
    const input = makeSkillResult({
      data: {
        name: 'my_skill',
        description: 'A skill with underscored name',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const nameWarnings = results.filter((r) => r.rule === 'skill-name-format');
    assert.ok(nameWarnings.length > 0, `Expected a skill-name-format warning for underscored name`);
  });

  // AC-6: Name starting with a number reports warning.
  it('AC-6: name starting with number reports skill-name-format warning', async () => {
    const input = makeSkillResult({
      data: {
        name: '1-skill',
        description: 'A skill starting with a number',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const nameWarnings = results.filter((r) => r.rule === 'skill-name-format');
    assert.ok(nameWarnings.length > 0, `Expected a skill-name-format warning for numeric start`);
  });

  // AC-6: Valid kebab-case name passes.
  it('AC-6: valid kebab-case name passes skill-name-format', async () => {
    const input = makeSkillResult({
      data: {
        name: 'my-cool-skill',
        description: 'A valid skill',
      },
    });

    const results = await validateFrontmatter([input], 1);
    const nameWarnings = results.filter((r) => r.rule === 'skill-name-format');
    assert.equal(nameWarnings.length, 0, `Expected no skill-name-format warnings, got: ${JSON.stringify(nameWarnings)}`);
  });

  // AC-7: skill FileType uses skill schema, not command or agent.
  it('AC-7: skill file uses required-fields-skill, not command or agent rules', async () => {
    const input = makeSkillResult({
      data: {
        // Missing both name and description — should trigger skill rule only
      },
    });

    const results = await validateFrontmatter([input], 0);
    const skillErrors = results.filter((r) => r.rule === 'required-fields-skill');
    const commandErrors = results.filter((r) => r.rule === 'required-fields-command');
    const agentErrors = results.filter((r) => r.rule === 'required-fields-agent');

    assert.ok(skillErrors.length > 0, 'Expected required-fields-skill errors');
    assert.equal(commandErrors.length, 0, 'Expected no required-fields-command errors on skill file');
    assert.equal(agentErrors.length, 0, 'Expected no required-fields-agent errors on skill file');
  });

  // AC-8: --level 0 applies Level 0 rules to skill files.
  it('AC-8: --level 0 applies Level 0 rules (required fields, non-empty body)', async () => {
    const input = makeSkillResult({
      data: {
        // Missing name and description
        '___body_length': 0,
        '___body_text': '',
      },
    });

    const results = await validateFrontmatter([input], 0);
    const schemaErrors = results.filter((r) => r.rule === 'required-fields-skill');
    const bodyErrors = results.filter((r) => r.rule === 'non-empty-body');
    assert.ok(schemaErrors.length > 0, 'Expected required-fields-skill errors at level 0');
    assert.ok(bodyErrors.length > 0, 'Expected non-empty-body errors at level 0');
  });

  // AC-8: --level 0 excludes Level 1 rules for skill files.
  it('AC-8: --level 0 excludes Level 1 skill rules', async () => {
    const input = makeSkillResult({
      data: {
        name: 'MyBadName',
        description: 'A skill',
        '___file_size': 20000,
      },
    });

    const results = await validateFrontmatter([input], 0);
    const level1Rules = results.filter(
      (r) => ['skill-name-format', 'file-size-limit'].includes(r.rule),
    );
    assert.equal(level1Rules.length, 0, `Expected no Level 1 rules at level 0, got: ${JSON.stringify(level1Rules)}`);
  });

  // AC-9: --level 1 applies Level 0 + Level 1 rules for skill files.
  it('AC-9: --level 1 applies both Level 0 and Level 1 rules', async () => {
    const input = makeSkillResult({
      data: {
        // Missing description triggers Level 0
        name: 'BadName',
        '___file_size': 20000,
      },
    });

    const results = await validateFrontmatter([input], 1);
    const level0Rules = results.filter((r) => r.rule === 'required-fields-skill');
    const nameFormatRules = results.filter((r) => r.rule === 'skill-name-format');
    const sizeRules = results.filter((r) => r.rule === 'file-size-limit');

    assert.ok(level0Rules.length > 0, 'Expected Level 0 rules at level 1');
    assert.ok(nameFormatRules.length > 0, 'Expected skill-name-format at level 1');
    assert.ok(sizeRules.length > 0, 'Expected file-size-limit at level 1');
  });

  // AC-10: default level (0) applies Level 0 only (tested via level parameter).
  it('AC-10: default level 0 applies Level 0 rules only', async () => {
    const input = makeSkillResult({
      data: {
        name: 'BadName',
        description: 'A skill',
      },
    });

    // Level 0 = default — should not trigger name format warning
    const results = await validateFrontmatter([input], 0);
    const nameFormatRules = results.filter((r) => r.rule === 'skill-name-format');
    assert.equal(nameFormatRules.length, 0, 'Expected no skill-name-format at default level 0');
  });

  // Ruleset metadata: skill rules have correct x-skill-lint-level.
  it('required-fields-skill has x-skill-lint-level: 0', () => {
    const rules = getRuleset();
    assert.ok(rules['required-fields-skill'], 'required-fields-skill must exist');
    assert.equal(rules['required-fields-skill'].extensions['x-skill-lint-level'], 0);
  });

  it('skill-name-format has x-skill-lint-level: 1', () => {
    const rules = getRuleset();
    assert.ok(rules['skill-name-format'], 'skill-name-format must exist');
    assert.equal(rules['skill-name-format'].extensions['x-skill-lint-level'], 1);
  });

  // skill-name-format severity is warning (severity 1).
  it('skill-name-format has warning severity', () => {
    const rules = getRuleset();
    assert.equal(rules['skill-name-format'].severity, 1, 'skill-name-format severity should be 1 (warning)');
  });

  // Skill file with both name and description missing reports both errors.
  it('missing both name and description reports multiple errors', async () => {
    const input = makeSkillResult({
      data: {},
    });

    const results = await validateFrontmatter([input], 0);
    const skillErrors = results.filter((r) => r.rule === 'required-fields-skill');
    assert.ok(skillErrors.length >= 2, `Expected at least 2 required-fields-skill errors, got ${skillErrors.length}: ${JSON.stringify(skillErrors)}`);
  });

  // Pre-existing parse errors pass through for skill files.
  it('pre-existing errors pass through for skill files', async () => {
    const input = makeSkillResult({
      filePath: '/skills/broken/SKILL.md',
      errors: [
        { message: 'YAML parse error: bad frontmatter', filePath: '/skills/broken/SKILL.md' },
      ],
    });

    const results = await validateFrontmatter([input], 0);
    assert.equal(results.length, 1);
    assert.equal(results[0].rule, 'parse-error');
    assert.equal(results[0].severity, 'error');
    assert.equal(results[0].filePath, '/skills/broken/SKILL.md');
  });
});
