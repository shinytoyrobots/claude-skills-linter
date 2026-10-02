import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFrontmatter } from '../src/validate-frontmatter.js';
import type { ExtractResult } from '../src/types.js';

function skill(name: string, fileType: ExtractResult['fileType'] = 'skill'): ExtractResult {
  return {
    filePath: '/test/SKILL.md',
    fileType,
    errors: [],
    data: {
      '___body_length': 100,
      '___has_frontmatter': true,
      '___file_size': 200,
      '___body_text': 'Body.',
      '___file_path': '/test/SKILL.md',
      '___file_type': fileType,
      name,
      description: 'A valid skill',
    },
  };
}

const rules = (rs: Awaited<ReturnType<typeof validateFrontmatter>>) => rs.map((r) => r.rule);

describe('skill-name-length', () => {
  it('passes at exactly 64 characters', async () => {
    const results = await validateFrontmatter([skill('a'.repeat(64))], 1);
    assert.ok(!rules(results).includes('skill-name-length'));
  });

  it('warns at 65 characters', async () => {
    const results = await validateFrontmatter([skill('a'.repeat(65))], 1);
    const hit = results.find((r) => r.rule === 'skill-name-length');
    assert.ok(hit, JSON.stringify(results));
    assert.equal(hit.severity, 'warning');
  });

  it('is a Level 1 rule (silent at Level 0)', async () => {
    const results = await validateFrontmatter([skill('a'.repeat(65))], 0);
    assert.ok(!rules(results).includes('skill-name-length'));
  });
});

describe('non-portable-name (--portable only)', () => {
  const portable = { portable: true };

  for (const name of ['claude-helper', 'my-claude-tool', 'anthropic-tools', 'Claude-Thing']) {
    it(`warns on "${name}" in portable mode`, async () => {
      const results = await validateFrontmatter([skill(name)], 0, undefined, portable);
      const hit = results.find((r) => r.rule === 'non-portable-name');
      assert.ok(hit, JSON.stringify(results));
      assert.equal(hit.severity, 'warning');
    });
  }

  it('is silent without --portable (Claude Code loads these names)', async () => {
    const results = await validateFrontmatter([skill('claude-api')], 1);
    assert.ok(!rules(results).includes('non-portable-name'));
  });

  it('does not warn on an ordinary name', async () => {
    const results = await validateFrontmatter([skill('pdf-extractor')], 1, undefined, portable);
    assert.ok(!rules(results).includes('non-portable-name'));
  });

  it('does not apply to commands', async () => {
    const results = await validateFrontmatter([skill('claude-helper', 'command')], 1, undefined, portable);
    assert.ok(!rules(results).includes('non-portable-name'));
  });
});
