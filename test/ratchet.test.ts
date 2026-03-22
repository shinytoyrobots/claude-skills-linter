import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { checkRatchet } from '../src/profiles.js';
import { createGitFixture, type GitFixture } from './helpers/git-fixture.js';
import type { ExtractResult } from '../src/types.js';

/** Build a minimal ExtractResult for testing. */
function makeExtractResult(
  filePath: string,
  frontmatter: Record<string, unknown>,
): ExtractResult {
  return {
    filePath,
    data: frontmatter,
    errors: [],
    fileType: 'command',
  };
}

describe('checkRatchet', () => {
  let fixture: GitFixture | undefined;

  afterEach(() => {
    fixture?.cleanup();
    fixture = undefined;
  });

  it('AC-2: reports regression when quality_level decreases', async () => {
    fixture = createGitFixture(
      [{ path: '.claude/commands/foo.md', frontmatter: { name: 'foo', quality_level: 2 } }],
      [{ path: '.claude/commands/foo.md', frontmatter: { name: 'foo', quality_level: 1 } }],
    );

    const files = [
      makeExtractResult(join(fixture.repoPath, '.claude/commands/foo.md'), { quality_level: 1 }),
    ];

    const results = await checkRatchet(files, fixture.baseRef, fixture.repoPath, {
      skills_root: join(fixture.repoPath, '.claude'),
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].rule, 'quality-level-regression');
    assert.equal(results[0].severity, 'error');
    assert.match(results[0].message, /decreased from 2 to 1/);
  });

  it('AC-3: no error when quality_level stays equal', async () => {
    fixture = createGitFixture(
      [{ path: '.claude/commands/foo.md', frontmatter: { name: 'foo', quality_level: 2 } }],
    );

    const files = [
      makeExtractResult(join(fixture.repoPath, '.claude/commands/foo.md'), { quality_level: 2 }),
    ];

    const results = await checkRatchet(files, fixture.baseRef, fixture.repoPath, {
      skills_root: join(fixture.repoPath, '.claude'),
    });

    assert.equal(results.length, 0);
  });

  it('AC-3: no error when quality_level increases', async () => {
    fixture = createGitFixture(
      [{ path: '.claude/commands/foo.md', frontmatter: { name: 'foo', quality_level: 1 } }],
      [{ path: '.claude/commands/foo.md', frontmatter: { name: 'foo', quality_level: 2 } }],
    );

    const files = [
      makeExtractResult(join(fixture.repoPath, '.claude/commands/foo.md'), { quality_level: 2 }),
    ];

    const results = await checkRatchet(files, fixture.baseRef, fixture.repoPath, {
      skills_root: join(fixture.repoPath, '.claude'),
    });

    assert.equal(results.length, 0);
  });

  it('AC-4: no error for new file not in base', async () => {
    fixture = createGitFixture(
      [{ path: '.claude/commands/old.md', frontmatter: { name: 'old', quality_level: 1 } }],
      [{ path: '.claude/commands/new.md', frontmatter: { name: 'new', quality_level: 0 } }],
    );

    const files = [
      makeExtractResult(join(fixture.repoPath, '.claude/commands/new.md'), { quality_level: 0 }),
    ];

    const results = await checkRatchet(files, fixture.baseRef, fixture.repoPath, {
      skills_root: join(fixture.repoPath, '.claude'),
    });

    assert.equal(results.length, 0);
  });

  it('AC-5: no quality_level in base treated as 0', async () => {
    fixture = createGitFixture(
      [{ path: '.claude/commands/foo.md', frontmatter: { name: 'foo' } }],
      [{ path: '.claude/commands/foo.md', frontmatter: { name: 'foo', quality_level: 1 } }],
    );

    // Current file has level 1, base had no quality_level (treated as 0)
    const files = [
      makeExtractResult(join(fixture.repoPath, '.claude/commands/foo.md'), { quality_level: 1 }),
    ];

    const results = await checkRatchet(files, fixture.baseRef, fixture.repoPath, {
      skills_root: join(fixture.repoPath, '.claude'),
    });

    assert.equal(results.length, 0);
  });

  it('AC-5: regression from implicit 0 is not possible (current=0, base=0)', async () => {
    fixture = createGitFixture(
      [{ path: '.claude/commands/foo.md', frontmatter: { name: 'foo' } }],
    );

    const files = [
      makeExtractResult(join(fixture.repoPath, '.claude/commands/foo.md'), {}),
    ];

    const results = await checkRatchet(files, fixture.baseRef, fixture.repoPath, {
      skills_root: join(fixture.repoPath, '.claude'),
    });

    assert.equal(results.length, 0);
  });

  it('reports regression when quality_level removed (was 2, now absent → 0)', async () => {
    fixture = createGitFixture(
      [{ path: '.claude/commands/foo.md', frontmatter: { name: 'foo', quality_level: 2 } }],
      [{ path: '.claude/commands/foo.md', frontmatter: { name: 'foo' } }],
    );

    const files = [
      makeExtractResult(join(fixture.repoPath, '.claude/commands/foo.md'), {}),
    ];

    const results = await checkRatchet(files, fixture.baseRef, fixture.repoPath, {
      skills_root: join(fixture.repoPath, '.claude'),
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].rule, 'quality-level-regression');
    assert.match(results[0].message, /decreased from 2 to 0/);
  });

  it('handles multiple files with mixed results', async () => {
    fixture = createGitFixture(
      [
        { path: '.claude/commands/a.md', frontmatter: { name: 'a', quality_level: 2 } },
        { path: '.claude/commands/b.md', frontmatter: { name: 'b', quality_level: 1 } },
        { path: '.claude/commands/c.md', frontmatter: { name: 'c', quality_level: 0 } },
      ],
      [
        { path: '.claude/commands/a.md', frontmatter: { name: 'a', quality_level: 1 } },
        { path: '.claude/commands/b.md', frontmatter: { name: 'b', quality_level: 2 } },
        { path: '.claude/commands/c.md', frontmatter: { name: 'c', quality_level: 0 } },
      ],
    );

    const files = [
      makeExtractResult(join(fixture.repoPath, '.claude/commands/a.md'), { quality_level: 1 }),
      makeExtractResult(join(fixture.repoPath, '.claude/commands/b.md'), { quality_level: 2 }),
      makeExtractResult(join(fixture.repoPath, '.claude/commands/c.md'), { quality_level: 0 }),
    ];

    const results = await checkRatchet(files, fixture.baseRef, fixture.repoPath, {
      skills_root: join(fixture.repoPath, '.claude'),
    });

    // Only 'a' regressed (2 → 1)
    assert.equal(results.length, 1);
    assert.equal(results[0].filePath, join(fixture.repoPath, '.claude/commands/a.md'));
  });

  it('uses raw frontmatter values, not resolved levels', async () => {
    // Verifies the ratchet compares RAW frontmatter, not effective levels
    fixture = createGitFixture(
      [{ path: '.claude/commands/foo.md', frontmatter: { name: 'foo', quality_level: 3 } }],
      [{ path: '.claude/commands/foo.md', frontmatter: { name: 'foo', quality_level: 1 } }],
    );

    const files = [
      makeExtractResult(join(fixture.repoPath, '.claude/commands/foo.md'), { quality_level: 1 }),
    ];

    const results = await checkRatchet(files, fixture.baseRef, fixture.repoPath, {
      skills_root: join(fixture.repoPath, '.claude'),
    });

    assert.equal(results.length, 1);
    assert.match(results[0].message, /decreased from 3 to 1/);
  });
});
