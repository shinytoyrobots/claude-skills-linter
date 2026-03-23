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

describe('story-034: modern Claude Code frontmatter fields', () => {
  // AC-1: context: fork accepted without error
  it('AC-1: context field accepted as valid string (command)', async () => {
    const input = makeResult({
      fileType: 'command',
      data: { description: 'A command', context: 'fork' },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  it('AC-1: context field accepted as valid string (agent)', async () => {
    const input = makeResult({
      fileType: 'agent',
      data: { name: 'my-agent', description: 'An agent', context: 'fork' },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  it('AC-1: context field accepted as valid string (skill)', async () => {
    const input = makeResult({
      fileType: 'skill',
      data: { name: 'my-skill', description: 'A skill', context: 'fork' },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  // AC-2: agent field accepted without error
  it('AC-2: agent: "Explore" accepted (command)', async () => {
    const input = makeResult({
      fileType: 'command',
      data: { description: 'A command', agent: 'Explore' },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  it('AC-2: agent: "Plan" accepted (agent)', async () => {
    const input = makeResult({
      fileType: 'agent',
      data: { name: 'my-agent', description: 'An agent', agent: 'Plan' },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  it('AC-2: agent: "general-purpose" accepted (skill)', async () => {
    const input = makeResult({
      fileType: 'skill',
      data: { name: 'my-skill', description: 'A skill', agent: 'general-purpose' },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  // AC-3: effort: high (valid values) accepted without error
  for (const value of ['low', 'medium', 'high', 'max']) {
    it(`AC-3: effort: "${value}" accepted without error`, async () => {
      const input = makeResult({
        fileType: 'command',
        data: { description: 'A command', effort: value },
      });
      const results = await validateFrontmatter([input], 1);
      const effortErrors = results.filter((r) => r.rule === 'effort-invalid');
      assert.equal(effortErrors.length, 0, `Expected no effort-invalid for "${value}", got: ${JSON.stringify(effortErrors)}`);
    });
  }

  // AC-3b: effort: turbo (invalid) produces effort-invalid WARNING
  it('AC-3b: effort: "turbo" produces effort-invalid warning', async () => {
    const input = makeResult({
      fileType: 'command',
      data: { description: 'A command', effort: 'turbo' },
    });
    const results = await validateFrontmatter([input], 1);
    const effortWarnings = results.filter((r) => r.rule === 'effort-invalid');
    assert.ok(effortWarnings.length > 0, `Expected effort-invalid warning, got: ${JSON.stringify(results)}`);
    assert.equal(effortWarnings[0].severity, 'warning');
    assert.ok(effortWarnings[0].message.includes('turbo'));
  });

  // AC-3b: effort-invalid is a Level 1 rule (excluded at level 0)
  it('AC-3b: effort-invalid excluded at level 0', async () => {
    const input = makeResult({
      fileType: 'command',
      data: { description: 'A command', effort: 'turbo' },
    });
    const results = await validateFrontmatter([input], 0);
    const effortWarnings = results.filter((r) => r.rule === 'effort-invalid');
    assert.equal(effortWarnings.length, 0, `Expected no effort-invalid at level 0, got: ${JSON.stringify(effortWarnings)}`);
  });

  // AC-3b: effort-invalid absent field is skipped
  it('AC-3b: absent effort field is skipped', async () => {
    const input = makeResult({
      fileType: 'command',
      data: { description: 'A command' },
    });
    const results = await validateFrontmatter([input], 1);
    const effortWarnings = results.filter((r) => r.rule === 'effort-invalid');
    assert.equal(effortWarnings.length, 0, `Expected no effort-invalid when field absent, got: ${JSON.stringify(effortWarnings)}`);
  });

  // AC-3b: effort-invalid works on agent files
  it('AC-3b: effort: "turbo" produces warning on agent file', async () => {
    const input = makeResult({
      fileType: 'agent',
      data: { name: 'my-agent', description: 'An agent', effort: 'turbo' },
    });
    const results = await validateFrontmatter([input], 1);
    const effortWarnings = results.filter((r) => r.rule === 'effort-invalid');
    assert.ok(effortWarnings.length > 0, `Expected effort-invalid on agent, got: ${JSON.stringify(results)}`);
    assert.equal(effortWarnings[0].severity, 'warning');
  });

  // AC-3b: effort-invalid works on skill files
  it('AC-3b: effort: "turbo" produces warning on skill file', async () => {
    const input = makeResult({
      fileType: 'skill',
      data: { name: 'my-skill', description: 'A skill', effort: 'turbo' },
    });
    const results = await validateFrontmatter([input], 1);
    const effortWarnings = results.filter((r) => r.rule === 'effort-invalid');
    assert.ok(effortWarnings.length > 0, `Expected effort-invalid on skill, got: ${JSON.stringify(results)}`);
    assert.equal(effortWarnings[0].severity, 'warning');
  });

  // AC-4: hooks object accepted without error
  it('AC-4: hooks object accepted (command)', async () => {
    const input = makeResult({
      fileType: 'command',
      data: { description: 'A command', hooks: { pre: 'lint', post: 'test' } },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  it('AC-4: hooks object accepted (agent)', async () => {
    const input = makeResult({
      fileType: 'agent',
      data: { name: 'my-agent', description: 'An agent', hooks: { setup: 'init' } },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  it('AC-4: hooks object accepted (skill)', async () => {
    const input = makeResult({
      fileType: 'skill',
      data: { name: 'my-skill', description: 'A skill', hooks: { before: 'check' } },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  // AC-5: compatibility string accepted without error
  it('AC-5: compatibility string accepted (command)', async () => {
    const input = makeResult({
      fileType: 'command',
      data: { description: 'A command', compatibility: 'Requires Python 3.8+' },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  it('AC-5: compatibility string accepted (agent)', async () => {
    const input = makeResult({
      fileType: 'agent',
      data: { name: 'my-agent', description: 'An agent', compatibility: 'Node 20+' },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  // AC-6: metadata object accepted without error
  it('AC-6: metadata object accepted (command)', async () => {
    const input = makeResult({
      fileType: 'command',
      data: { description: 'A command', metadata: { author: 'name' } },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  it('AC-6: metadata object accepted (skill)', async () => {
    const input = makeResult({
      fileType: 'skill',
      data: { name: 'my-skill', description: 'A skill', metadata: { version: '1.0', tags: ['util'] } },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  // AC-7: unknown fields still pass via additionalProperties: true
  it('AC-7: unknown fields still pass via additionalProperties: true', async () => {
    const input = makeResult({
      fileType: 'command',
      data: { description: 'A command', 'totally-custom-field': 'some value' },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  // All modern fields combined should pass
  it('all modern fields combined pass validation', async () => {
    const input = makeResult({
      fileType: 'command',
      data: {
        description: 'A fully-loaded command',
        context: 'fork',
        agent: 'Explore',
        effort: 'high',
        hooks: { pre: 'lint' },
        compatibility: 'Requires Python 3.8+',
        metadata: { author: 'name' },
      },
    });
    const results = await validateFrontmatter([input], 1);
    assert.equal(results.length, 0, `Expected 0 errors, got: ${JSON.stringify(results)}`);
  });

  // effort-invalid rule metadata
  it('effort-invalid rule has x-skill-lint-level: 1', () => {
    const rules = getRuleset();
    const rule = rules['effort-invalid'];
    assert.ok(rule, 'effort-invalid rule must exist');
    assert.equal(rule.extensions['x-skill-lint-level'], 1);
    assert.equal(rule.severity, 1, 'effort-invalid should have warning severity');
  });
});
