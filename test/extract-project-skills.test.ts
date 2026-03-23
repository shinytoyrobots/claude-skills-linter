import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { extractAll } from '../src/extract.js';
import { classifyFile } from '../src/classify.js';

const fixtures = resolve(import.meta.dirname, 'fixtures');
const projectSkillsRoot = resolve(fixtures, 'project-skills');
const pluginWithProjectSkillsRoot = resolve(fixtures, 'plugin-with-project-skills');

// ---------------------------------------------------------------------------
// story-032: classifyFile with .claude/skills/ paths
// ---------------------------------------------------------------------------

describe('classifyFile — .claude/skills/ paths (story-032)', () => {
  it('AC-1: SKILL.md in .claude/skills/ → skill', () => {
    assert.equal(
      classifyFile('.claude/skills/deploy/SKILL.md', true),
      'skill',
    );
    assert.equal(
      classifyFile('.claude/skills/review/SKILL.md', true),
      'skill',
    );
  });

  it('AC-2: agents/ in .claude/skills/ skill dir → agent', () => {
    assert.equal(
      classifyFile('.claude/skills/deploy/agents/deployer.md', true),
      'agent',
    );
  });

  it('AC-2: reference/ in .claude/skills/ skill dir → context', () => {
    assert.equal(
      classifyFile('.claude/skills/deploy/reference/guide.md', true),
      'context',
    );
  });

  it('AC-2: non-SKILL.md directly in .claude/skills/name/ → readme', () => {
    assert.equal(
      classifyFile('.claude/skills/deploy/notes.md', true),
      'readme',
    );
  });

  it('AC-2: unknown subdir in .claude/skills/ → unknown', () => {
    assert.equal(
      classifyFile('.claude/skills/deploy/custom-stuff/notes.md', true),
      'unknown',
    );
  });
});

// ---------------------------------------------------------------------------
// story-032 AC-1: project-skills format extraction
// ---------------------------------------------------------------------------

describe('extractAll — project-skills format (story-032)', () => {
  it('AC-1: discovers SKILL.md and supporting files in .claude/skills/', async () => {
    const results = await extractAll(
      [`${projectSkillsRoot}/**/*.md`],
      [],
      'project-skills',
    );

    const paths = results.map((r) => r.filePath);

    // Should discover SKILL.md files
    assert.ok(
      paths.some((p) => p.includes('.claude/skills/deploy/SKILL.md')),
      'should discover .claude/skills/deploy/SKILL.md',
    );
    assert.ok(
      paths.some((p) => p.includes('.claude/skills/review/SKILL.md')),
      'should discover .claude/skills/review/SKILL.md',
    );

    // Should discover supporting files
    assert.ok(
      paths.some((p) => p.includes('.claude/skills/deploy/reference/guide.md')),
      'should discover reference/guide.md',
    );
    assert.ok(
      paths.some((p) => p.includes('.claude/skills/deploy/agents/deployer.md')),
      'should discover agents/deployer.md',
    );
  });

  it('AC-2: supporting files classified same as plugin sub-files', async () => {
    const results = await extractAll(
      [`${projectSkillsRoot}/**/*.md`],
      [],
      'project-skills',
    );

    // SKILL.md → skill
    const skillFile = results.find((r) => r.filePath.includes('deploy/SKILL.md'));
    assert.ok(skillFile, 'should find deploy/SKILL.md');
    assert.equal(skillFile!.fileType, 'skill');

    // reference/ → context
    const refFile = results.find((r) => r.filePath.includes('reference/guide.md'));
    assert.ok(refFile, 'should find reference/guide.md');
    assert.equal(refFile!.fileType, 'context');

    // agents/ → agent
    const agentFile = results.find((r) => r.filePath.includes('agents/deployer.md'));
    assert.ok(agentFile, 'should find agents/deployer.md');
    assert.equal(agentFile!.fileType, 'agent');
  });
});

// ---------------------------------------------------------------------------
// story-032 AC-3: project-skills + legacy dirs → hybrid extraction
// ---------------------------------------------------------------------------

describe('extractAll — project-skills hybrid with legacy dirs (story-032)', () => {
  it('AC-3: extracts from BOTH .claude/skills/ AND legacy dirs', async () => {
    const results = await extractAll(
      [`${projectSkillsRoot}/**/*.md`],
      [],
      'project-skills',
    );

    const paths = results.map((r) => r.filePath);

    // .claude/skills/ files
    assert.ok(
      paths.some((p) => p.includes('.claude/skills/deploy/SKILL.md')),
      'should include .claude/skills/ files',
    );

    // Legacy dir files
    assert.ok(
      paths.some((p) => p.includes('commands/build.md')),
      'should include legacy commands/ files',
    );
    assert.ok(
      paths.some((p) => p.includes('agents/helper.md')),
      'should include legacy agents/ files',
    );
  });

  it('AC-3: legacy files retain their correct classification', async () => {
    const results = await extractAll(
      [`${projectSkillsRoot}/**/*.md`],
      [],
      'project-skills',
    );

    const buildCmd = results.find((r) => r.filePath.includes('commands/build.md'));
    assert.ok(buildCmd, 'should find commands/build.md');
    assert.equal(buildCmd!.fileType, 'command');

    const helperAgent = results.find((r) => r.filePath.includes('agents/helper.md'));
    assert.ok(helperAgent, 'should find agents/helper.md');
    assert.equal(helperAgent!.fileType, 'agent');
  });
});

// ---------------------------------------------------------------------------
// story-032 AC-3b: plugin format + .claude/skills/ → hybrid extraction
// ---------------------------------------------------------------------------

describe('extractAll — plugin + project-skills hybrid (story-032)', () => {
  it('AC-3b: plugin format also extracts .claude/skills/ files', async () => {
    const results = await extractAll(
      [`${pluginWithProjectSkillsRoot}/**/*.md`],
      [],
      'plugin',
    );

    const paths = results.map((r) => r.filePath);

    // Plugin files should be discovered
    assert.ok(
      paths.some((p) => p.includes('skills/build/SKILL.md')),
      'should include plugin skills/build/SKILL.md',
    );
    assert.ok(
      paths.some((p) => p.includes('context/rules.md')),
      'should include plugin context/rules.md',
    );
    assert.ok(
      paths.some((p) => p.includes('agents/reviewer.md')),
      'should include plugin agents/reviewer.md',
    );

    // .claude/skills/ files should ALSO be discovered
    assert.ok(
      paths.some((p) => p.includes('.claude/skills/local-skill/SKILL.md')),
      'should include .claude/skills/local-skill/SKILL.md',
    );
  });

  it('AC-3b: .claude/skills/ files in plugin hybrid have correct types', async () => {
    const results = await extractAll(
      [`${pluginWithProjectSkillsRoot}/**/*.md`],
      [],
      'plugin',
    );

    const localSkill = results.find((r) =>
      r.filePath.includes('.claude/skills/local-skill/SKILL.md'),
    );
    assert.ok(localSkill, 'should find .claude/skills/local-skill/SKILL.md');
    assert.equal(localSkill!.fileType, 'skill');
  });
});

// ---------------------------------------------------------------------------
// story-032 AC-4: relative reference resolution from .claude/skills/ SKILL.md
// ---------------------------------------------------------------------------

describe('extractAll — project-skills reference resolution (story-032)', () => {
  it('AC-4: SKILL.md body contains relative references to supporting files', async () => {
    const results = await extractAll(
      [`${projectSkillsRoot}/**/*.md`],
      [],
      'project-skills',
    );

    const deploySkill = results.find((r) =>
      r.filePath.includes('.claude/skills/deploy/SKILL.md'),
    );
    assert.ok(deploySkill, 'should find deploy SKILL.md');

    const body = deploySkill!.data['___body_text'] as string;
    assert.ok(body.includes('agents/deployer.md'), 'body should reference agents/deployer.md');
    assert.ok(body.includes('reference/guide.md'), 'body should reference reference/guide.md');
  });
});

// ---------------------------------------------------------------------------
// story-032: no files scenario
// ---------------------------------------------------------------------------

describe('extractAll — project-skills with no matching files', () => {
  it('returns empty array when .claude/skills/ is empty', async () => {
    // Use a pattern that won't match anything
    const results = await extractAll(
      [`${fixtures}/nonexistent/**/*.md`],
      [],
      'project-skills',
    );
    assert.equal(results.length, 0);
  });
});

// ---------------------------------------------------------------------------
// story-032: deduplication
// ---------------------------------------------------------------------------

describe('extractAll — project-skills deduplication (story-032)', () => {
  it('does not produce duplicate entries when patterns overlap', async () => {
    const results = await extractAll(
      [`${projectSkillsRoot}/**/*.md`],
      [],
      'project-skills',
    );

    const paths = results.map((r) => r.filePath);
    const uniquePaths = [...new Set(paths)];
    assert.equal(paths.length, uniquePaths.length, 'no duplicate file paths');
  });
});
