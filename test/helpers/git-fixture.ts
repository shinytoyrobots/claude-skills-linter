/**
 * Test helper: creates temporary git repositories with frontmatter files
 * for testing the ratchet feature.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

export interface FileSpec {
  /** Path relative to repo root (e.g. ".claude/commands/foo.md") */
  path: string;
  /** Frontmatter content (will be wrapped in --- delimiters) */
  frontmatter: Record<string, unknown>;
  /** Optional markdown body */
  body?: string;
}

export interface GitFixture {
  /** Absolute path to the git repo root */
  repoPath: string;
  /** The commit ref for the "base" commit (first commit) */
  baseRef: string;
  /** Clean up the temp directory */
  cleanup: () => void;
}

/**
 * Serialize frontmatter + body into a markdown file string.
 */
function toMarkdown(frontmatter: Record<string, unknown>, body?: string): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(frontmatter)) {
    lines.push(`${key}: ${value}`);
  }
  lines.push('---');
  if (body) {
    lines.push('', body);
  }
  return lines.join('\n') + '\n';
}

/**
 * Create a temporary git repo with an initial commit containing the given files,
 * then optionally modify files and create a second commit.
 *
 * @param baseFiles - Files to include in the first (base) commit
 * @param updatedFiles - Files to modify/add in the second commit (optional)
 * @returns GitFixture with repo path, base ref, and cleanup function
 */
export function createGitFixture(
  baseFiles: FileSpec[],
  updatedFiles?: FileSpec[],
): GitFixture {
  const repoPath = mkdtempSync(join(tmpdir(), 'skill-lint-ratchet-'));

  const exec = (args: string[]) =>
    execFileSync('git', args, { cwd: repoPath, encoding: 'utf-8' });

  // Initialize repo
  exec(['init']);
  exec(['config', 'user.email', 'test@test.com']);
  exec(['config', 'user.name', 'Test']);

  // Write base files and commit
  for (const file of baseFiles) {
    const fullPath = join(repoPath, file.path);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, toMarkdown(file.frontmatter, file.body));
  }
  exec(['add', '-A']);
  exec(['commit', '-m', 'base commit']);

  // Capture the base commit ref
  const baseRef = exec(['rev-parse', 'HEAD']).trim();

  // Optionally write updated files and commit
  if (updatedFiles && updatedFiles.length > 0) {
    for (const file of updatedFiles) {
      const fullPath = join(repoPath, file.path);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, toMarkdown(file.frontmatter, file.body));
    }
    exec(['add', '-A']);
    exec(['commit', '-m', 'update commit']);
  }

  return {
    repoPath,
    baseRef,
    cleanup: () => rmSync(repoPath, { recursive: true, force: true }),
  };
}
