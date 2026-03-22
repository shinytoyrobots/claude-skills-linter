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

    // Should find: skills/deploy/SKILL.md, skills/deploy/no-frontmatter-skill.md,
    // skills/no-fm/SKILL.md, context/project-rules.md, agents/reviewer.md
    // plus any new subdirectory fixtures (story-028)
    // Should NOT find: CLAUDE.md
    assert.ok(results.length >= 5, `expected >= 5 results, got ${results.length}`);

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

    // Non-SKILL.md in skills/ IS now discovered (story-028: skills/**/*.md glob)
    assert.ok(
      paths.some((p) => p.includes('no-frontmatter-skill.md')),
      'should discover non-SKILL.md files in skills/ subdirectories',
    );

    // Verify no-frontmatter-skill.md is classified as readme
    const noFmResult = results.find((r) => r.filePath.includes('no-frontmatter-skill.md'));
    assert.ok(noFmResult, 'no-frontmatter-skill.md should be in results');
    assert.equal(noFmResult!.fileType, 'readme', 'non-SKILL.md in skills/ should be readme');
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
// story-028: classify subdirectory types
// ---------------------------------------------------------------------------

describe('classifyFile — skill subdirectory classification (story-028)', () => {
  it('AC-2: files in agents/ subdirectory of a skill → agent', () => {
    assert.equal(
      classifyFile('skills/skill-creator/agents/research.md', true),
      'agent',
    );
    assert.equal(
      classifyFile('plugins/foo/skills/bar/agents/helper.md', true),
      'agent',
    );
  });

  it('AC-3: files in context/ subdirectory of a skill → context', () => {
    assert.equal(
      classifyFile('skills/my-skill/context/notes.md', true),
      'context',
    );
  });

  it('AC-3: files in reference/ subdirectory of a skill → context', () => {
    assert.equal(
      classifyFile('skills/mcp-builder/reference/mcp_best_practices.md', true),
      'context',
    );
  });

  it('AC-3: files in shared/ subdirectory of a skill → context', () => {
    assert.equal(
      classifyFile('skills/deploy/shared/common_utils.md', true),
      'context',
    );
  });

  it('AC-3: files in examples/ subdirectory of a skill → context', () => {
    assert.equal(
      classifyFile('skills/mcp-builder/examples/example_server.md', true),
      'context',
    );
  });

  it('AC-4: files in templates/ subdirectory of a skill → context', () => {
    assert.equal(
      classifyFile('skills/deploy/templates/deploy_template.md', true),
      'context',
    );
  });

  it('AC-4: files in themes/ subdirectory of a skill → context', () => {
    assert.equal(
      classifyFile('skills/deploy/themes/dark_theme.md', true),
      'context',
    );
  });

  it('AC-5: files in unknown subdirectory → unknown', () => {
    assert.equal(
      classifyFile('skills/deploy/unknown-subdir/mystery.md', true),
      'unknown',
    );
    assert.equal(
      classifyFile('skills/deploy/custom-stuff/notes.md', true),
      'unknown',
    );
  });

  it('agents/ subdirectory without frontmatter → legacy-agent', () => {
    assert.equal(
      classifyFile('skills/skill-creator/agents/research.md', false),
      'legacy-agent',
    );
  });
});

// ---------------------------------------------------------------------------
// story-028: plugin format discovers skill subdirectories
// ---------------------------------------------------------------------------

describe('extractAll — plugin subdirectory discovery (story-028)', () => {
  it('AC-1: discovers .md files in skill subdirectories', async () => {
    const results = await extractAll(
      [`${pluginRoot}/**/*.md`],
      [],
      'plugin',
    );

    const paths = results.map((r) => r.filePath);

    // reference/ files
    assert.ok(
      paths.some((p) => p.includes('mcp-builder/reference/mcp_best_practices.md')),
      'should discover reference/mcp_best_practices.md',
    );
    assert.ok(
      paths.some((p) => p.includes('mcp-builder/reference/server_patterns.md')),
      'should discover reference/server_patterns.md',
    );

    // examples/ files
    assert.ok(
      paths.some((p) => p.includes('mcp-builder/examples/example_server.md')),
      'should discover examples/example_server.md',
    );

    // agents/ inside skill dir
    assert.ok(
      paths.some((p) => p.includes('skill-creator/agents/research.md')),
      'should discover skill-creator/agents/research.md',
    );
    assert.ok(
      paths.some((p) => p.includes('skill-creator/agents/writer.md')),
      'should discover skill-creator/agents/writer.md',
    );
    assert.ok(
      paths.some((p) => p.includes('skill-creator/agents/skill-reviewer.md')),
      'should discover skill-creator/agents/skill-reviewer.md',
    );
  });

  it('AC-2: agents/ in skill dir classified as agent', async () => {
    const results = await extractAll(
      [`${pluginRoot}/**/*.md`],
      [],
      'plugin',
    );

    const skillAgents = results.filter(
      (r) => r.filePath.includes('skill-creator/agents/'),
    );
    assert.equal(skillAgents.length, 3, 'should find 3 agent files in skill-creator/agents/');
    for (const a of skillAgents) {
      assert.equal(a.fileType, 'agent', `${a.filePath} should be agent`);
    }
  });

  it('AC-3: reference/ and examples/ classified as context', async () => {
    const results = await extractAll(
      [`${pluginRoot}/**/*.md`],
      [],
      'plugin',
    );

    const refFiles = results.filter((r) => r.filePath.includes('/reference/'));
    assert.ok(refFiles.length >= 2, 'should find reference files');
    for (const rf of refFiles) {
      assert.equal(rf.fileType, 'context', `${rf.filePath} should be context`);
    }

    const exFiles = results.filter((r) => r.filePath.includes('/examples/'));
    assert.ok(exFiles.length >= 1, 'should find example files');
    for (const ef of exFiles) {
      assert.equal(ef.fileType, 'context', `${ef.filePath} should be context`);
    }
  });

  it('AC-4: templates/ and themes/ classified as context', async () => {
    const results = await extractAll(
      [`${pluginRoot}/**/*.md`],
      [],
      'plugin',
    );

    const templateFiles = results.filter((r) => r.filePath.includes('/templates/'));
    assert.ok(templateFiles.length >= 1, 'should find template files');
    for (const tf of templateFiles) {
      assert.equal(tf.fileType, 'context', `${tf.filePath} should be context`);
    }

    const themeFiles = results.filter((r) => r.filePath.includes('/themes/'));
    assert.ok(themeFiles.length >= 1, 'should find theme files');
    for (const tf of themeFiles) {
      assert.equal(tf.fileType, 'context', `${tf.filePath} should be context`);
    }
  });

  it('AC-5: unknown subdirectory classified as unknown', async () => {
    const results = await extractAll(
      [`${pluginRoot}/**/*.md`],
      [],
      'plugin',
    );

    const unknownFile = results.find((r) =>
      r.filePath.includes('unknown-subdir/mystery.md'),
    );
    assert.ok(unknownFile, 'should discover file in unknown subdirectory');
    assert.equal(unknownFile!.fileType, 'unknown', 'unknown subdir → unknown type');
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

    assert.ok(results.length >= 4, `expected >= 4 results, got ${results.length}`);

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

  it('AC-6: discovers skill subdirectory files in multi-plugin format', async () => {
    const results = await extractAll(
      [`${multiPluginRoot}/**/*.md`],
      [],
      'multi-plugin',
    );

    const paths = results.map((r) => r.filePath);
    assert.ok(
      paths.some((p) => p.includes('plugins/foo/skills/bar/reference/api_docs.md')),
      'should discover reference file in multi-plugin skill subdirectory',
    );

    const refFile = results.find((r) =>
      r.filePath.includes('bar/reference/api_docs.md'),
    );
    assert.ok(refFile, 'should find api_docs.md');
    assert.equal(refFile!.fileType, 'context', 'reference file should be context');
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
