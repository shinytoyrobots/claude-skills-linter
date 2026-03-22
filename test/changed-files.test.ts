import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { getChangedFiles, ChangedFilesError } from '../src/changed-files.js';

describe('getChangedFiles', () => {
  /**
   * Helper: create a temporary git repo with an initial commit on main,
   * then create a branch with changed .md files.
   */
  function createTestRepo(): { repoDir: string; cleanup: () => void } {
    const repoDir = realpathSync(mkdtempSync(resolve(tmpdir(), 'changed-files-test-')));

    // Initialize git repo with main branch.
    execSync('git init -b main', { cwd: repoDir });
    execSync('git config user.email "test@test.com"', { cwd: repoDir });
    execSync('git config user.name "Test"', { cwd: repoDir });

    // Create initial commit on main.
    writeFileSync(resolve(repoDir, 'existing.md'), '# Existing\n');
    execSync('git add -A && git commit -m "initial"', { cwd: repoDir });

    return { repoDir, cleanup: () => {} };
  }

  it('returns changed .md file paths as absolute paths', () => {
    const { repoDir } = createTestRepo();

    // Create a feature branch with a new .md file.
    execSync('git checkout -b feature', { cwd: repoDir });
    writeFileSync(resolve(repoDir, 'new-skill.md'), '# New Skill\n');
    execSync('git add -A && git commit -m "add skill"', { cwd: repoDir });

    // Mock cwd to be inside the repo.
    const originalCwd = process.cwd();
    process.chdir(repoDir);
    try {
      const files = getChangedFiles('main');
      assert.equal(files.length, 1);
      assert.equal(files[0], resolve(repoDir, 'new-skill.md'));
      // Verify paths are absolute.
      assert.ok(files[0].startsWith('/'), 'path should be absolute');
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('returns empty array when no .md files changed', () => {
    const { repoDir } = createTestRepo();

    // Create a branch with only a non-.md change.
    execSync('git checkout -b feature', { cwd: repoDir });
    writeFileSync(resolve(repoDir, 'readme.txt'), 'text\n');
    execSync('git add -A && git commit -m "add txt"', { cwd: repoDir });

    const originalCwd = process.cwd();
    process.chdir(repoDir);
    try {
      const files = getChangedFiles('main');
      assert.deepEqual(files, []);
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('throws ChangedFilesError for non-git directory', () => {
    const nonGitDir = realpathSync(mkdtempSync(resolve(tmpdir(), 'not-a-repo-')));

    const originalCwd = process.cwd();
    process.chdir(nonGitDir);
    try {
      assert.throws(
        () => getChangedFiles('main'),
        (err: unknown) => {
          assert.ok(err instanceof ChangedFilesError);
          assert.ok(err.message.includes('Not a git repository'));
          return true;
        },
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('throws ChangedFilesError for non-existent base ref', () => {
    const { repoDir } = createTestRepo();

    const originalCwd = process.cwd();
    process.chdir(repoDir);
    try {
      assert.throws(
        () => getChangedFiles('nonexistent-branch'),
        (err: unknown) => {
          assert.ok(err instanceof ChangedFilesError);
          assert.ok(err.message.includes('Failed to get changed files'));
          return true;
        },
      );
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('resolves repo-relative paths to absolute paths', () => {
    const { repoDir } = createTestRepo();

    // Create nested directory structure.
    execSync('git checkout -b feature', { cwd: repoDir });
    mkdirSync(resolve(repoDir, 'commands'), { recursive: true });
    writeFileSync(resolve(repoDir, 'commands', 'deploy.md'), '# Deploy\n');
    execSync('git add -A && git commit -m "add nested"', { cwd: repoDir });

    const originalCwd = process.cwd();
    process.chdir(repoDir);
    try {
      const files = getChangedFiles('main');
      assert.equal(files.length, 1);
      assert.equal(files[0], resolve(repoDir, 'commands', 'deploy.md'));
    } finally {
      process.chdir(originalCwd);
    }
  });

  it('returns multiple changed files', () => {
    const { repoDir } = createTestRepo();

    execSync('git checkout -b feature', { cwd: repoDir });
    writeFileSync(resolve(repoDir, 'a.md'), '# A\n');
    writeFileSync(resolve(repoDir, 'b.md'), '# B\n');
    // Also modify the existing file.
    writeFileSync(resolve(repoDir, 'existing.md'), '# Modified\n');
    execSync('git add -A && git commit -m "add files"', { cwd: repoDir });

    const originalCwd = process.cwd();
    process.chdir(repoDir);
    try {
      const files = getChangedFiles('main');
      assert.equal(files.length, 3);
      // All should be absolute.
      for (const f of files) {
        assert.ok(f.startsWith('/'), `${f} should be absolute`);
      }
    } finally {
      process.chdir(originalCwd);
    }
  });
});
