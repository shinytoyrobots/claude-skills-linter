import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { extractFile, extractAll } from '../src/extract.js';
import { classifyFile } from '../src/classify.js';

const fixtures = resolve(import.meta.dirname, 'fixtures');
const pluginRoot = resolve(fixtures, 'plugin');
const multiPluginRoot = resolve(fixtures, 'multi-plugin');

// ---------------------------------------------------------------------------
// classify.ts updates
// ---------------------------------------------------------------------------

describe('classifyFile — SKILL.md and CLAUDE.md', () => {
  it('AC-3: SKILL.md basename (case-sensitive) → skill', () => {
    assert.equal(classifyFile('skills/deploy/SKILL.md', true), 'skill');
    assert.equal(classifyFile('plugins/foo/skills/bar/SKILL.md', true), 'skill');
  });

  it('AC-3: skill.md (lowercase) is NOT classified as skill', () => {
    // SKILL.md is case-sensitive — lowercase should not match
    assert.notEqual(classifyFile('skills/deploy/skill.md', true), 'skill');
  });

  it('AC-9: CLAUDE.md → readme (case-insensitive)', () => {
    assert.equal(classifyFile('CLAUDE.md', false), 'readme');
    assert.equal(classifyFile('plugins/foo/claude.md', false), 'readme');
    assert.equal(classifyFile('Claude.md', false), 'readme');
  });

  it('AC-4: context/*.md in plugin → context', () => {
    assert.equal(classifyFile('context/rules.md', true), 'context');
    assert.equal(classifyFile('plugins/foo/context/rules.md', true), 'context');
  });

  it('AC-5: agents/*.md in plugin → agent', () => {
    assert.equal(classifyFile('agents/helper.md', true), 'agent');
    assert.equal(classifyFile('plugins/foo/agents/helper.md', true), 'agent');
  });

  it('Non-SKILL.md markdown in skills/ dir → readme', () => {
    assert.equal(classifyFile('skills/deploy/notes.md', true), 'readme');
    assert.equal(classifyFile('skills/deploy/README.md', false), 'readme');
  });
});

// ---------------------------------------------------------------------------
// extractFile — SKILL.md handling
// ---------------------------------------------------------------------------

describe('extractFile — SKILL.md', () => {
  it('AC-2: SKILL.md with frontmatter injects synthetic metadata', () => {
    const filePath = resolve(pluginRoot, 'skills/deploy/SKILL.md');
    const result = extractFile(filePath);

    assert.equal(result.errors.length, 0);
    assert.equal(result.data['name'], 'deploy');
    assert.equal(result.data['___has_frontmatter'], true);
    assert.equal(typeof result.data['___body_length'], 'number');
    assert.equal(typeof result.data['___file_size'], 'number');
    assert.equal(typeof result.data['___body_text'], 'string');
    assert.equal(result.data['___file_path'], filePath);
    assert.equal(result.data['___file_type'], 'skill');
    assert.equal(result.fileType, 'skill');
  });

  it('AC-8: SKILL.md without frontmatter → parse error with ___has_frontmatter: false', () => {
    const filePath = resolve(pluginRoot, 'skills/no-fm/SKILL.md');
    const result = extractFile(filePath);

    assert.equal(result.data['___has_frontmatter'], false);
    assert.ok(result.errors.length > 0, 'should have at least one error');
    assert.ok(
      result.errors.some((e) => e.message.includes('no frontmatter')),
      'error should mention missing frontmatter',
    );
    assert.equal(result.fileType, 'skill');
  });
});

// ---------------------------------------------------------------------------
// extractAll — plugin format
// ---------------------------------------------------------------------------

describe('extractAll — plugin format', () => {
  it('AC-1 / AC-7: discovers SKILL.md, context/*.md, agents/*.md in plugin format', async () => {
    const results = await extractAll(
      [`${pluginRoot}/**/*.md`],
      [],
      'plugin',
    );

    // Should find: skills/deploy/SKILL.md, skills/no-fm/SKILL.md,
    // context/project-rules.md, agents/reviewer.md
    // Should NOT find: CLAUDE.md, skills/deploy/no-frontmatter-skill.md
    assert.ok(results.length >= 4, `expected >= 4 results, got ${results.length}`);

    const paths = results.map((r) => r.filePath);
    assert.ok(
      paths.some((p) => p.includes('skills/deploy/SKILL.md')),
      'should discover skills/deploy/SKILL.md',
    );
    assert.ok(
      paths.some((p) => p.includes('skills/no-fm/SKILL.md')),
      'should discover skills/no-fm/SKILL.md',
    );
    assert.ok(
      paths.some((p) => p.includes('context/project-rules.md')),
      'should discover context/project-rules.md',
    );
    assert.ok(
      paths.some((p) => p.includes('agents/reviewer.md')),
      'should discover agents/reviewer.md',
    );

    // CLAUDE.md should NOT be discovered (not matched by plugin patterns)
    assert.ok(
      !paths.some((p) => p.endsWith('CLAUDE.md')),
      'should not discover CLAUDE.md via plugin patterns',
    );

    // Non-SKILL.md in skills/ should NOT be discovered
    assert.ok(
      !paths.some((p) => p.includes('no-frontmatter-skill.md')),
      'should not discover non-SKILL.md files in skills/',
    );
  });

  it('AC-3: SKILL.md files are classified as skill type', async () => {
    const results = await extractAll(
      [`${pluginRoot}/**/*.md`],
      [],
      'plugin',
    );

    const skillFiles = results.filter((r) =>
      r.filePath.split('/').pop() === 'SKILL.md',
    );
    for (const sf of skillFiles) {
      assert.equal(sf.fileType, 'skill', `${sf.filePath} should be skill type`);
    }
  });

  it('AC-4: context/*.md files are classified as context', async () => {
    const results = await extractAll(
      [`${pluginRoot}/**/*.md`],
      [],
      'plugin',
    );

    const contextFiles = results.filter((r) => r.filePath.includes('/context/'));
    assert.ok(contextFiles.length > 0, 'should find context files');
    for (const cf of contextFiles) {
      assert.equal(cf.fileType, 'context', `${cf.filePath} should be context type`);
    }
  });

  it('AC-5: agents/*.md files are classified as agent', async () => {
    const results = await extractAll(
      [`${pluginRoot}/**/*.md`],
      [],
      'plugin',
    );

    const agentFiles = results.filter((r) => r.filePath.includes('/agents/'));
    assert.ok(agentFiles.length > 0, 'should find agent files');
    for (const af of agentFiles) {
      assert.equal(af.fileType, 'agent', `${af.filePath} should be agent type`);
    }
  });
});

// ---------------------------------------------------------------------------
// extractAll — multi-plugin format
// ---------------------------------------------------------------------------

describe('extractAll — multi-plugin format', () => {
  it('AC-6: discovers files within plugins/ subdirectories', async () => {
    const results = await extractAll(
      [`${multiPluginRoot}/**/*.md`],
      [],
      'multi-plugin',
    );

    assert.ok(results.length >= 3, `expected >= 3 results, got ${results.length}`);

    const paths = results.map((r) => r.filePath);
    assert.ok(
      paths.some((p) => p.includes('plugins/foo/skills/bar/SKILL.md')),
      'should discover plugins/foo/skills/bar/SKILL.md',
    );
    assert.ok(
      paths.some((p) => p.includes('plugins/foo/context/shared-rules.md')),
      'should discover plugins/foo/context/shared-rules.md',
    );
    assert.ok(
      paths.some((p) => p.includes('plugins/foo/agents/helper.md')),
      'should discover plugins/foo/agents/helper.md',
    );
  });

  it('AC-6: plugin dir name and skill dir name may differ', async () => {
    // plugins/foo/skills/bar/SKILL.md — foo != bar, both valid
    const results = await extractAll(
      [`${multiPluginRoot}/**/*.md`],
      [],
      'multi-plugin',
    );

    const barSkill = results.find((r) =>
      r.filePath.includes('plugins/foo/skills/bar/SKILL.md'),
    );
    assert.ok(barSkill, 'should find bar skill inside foo plugin');
    assert.equal(barSkill!.fileType, 'skill');
  });
});

// ---------------------------------------------------------------------------
// extractAll — legacy format unchanged
// ---------------------------------------------------------------------------

describe('extractAll — legacy format unchanged', () => {
  it('uses provided patterns when format is undefined (legacy)', async () => {
    const pattern = resolve(fixtures, '*.md');
    const results = await extractAll([pattern]);

    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0, 'should match at least one file');
  });

  it('uses provided patterns when format is legacy-commands', async () => {
    const pattern = resolve(fixtures, '*.md');
    const results = await extractAll([pattern], [], 'legacy-commands');

    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0, 'should match at least one file');
  });
});
