/**
 * Git-aware file filtering for --changed-only mode.
 * Returns absolute paths to .md files changed since a given base ref.
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Error thrown when git operations fail (non-git dir, bad ref, etc.). */
export class ChangedFilesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChangedFilesError';
  }
}

/**
 * Get the list of changed .md files between `base` and HEAD.
 *
 * Runs `git diff --name-only --diff-filter=ACM {base}...HEAD -- '*.md'`
 * and resolves repo-relative paths to absolute paths.
 *
 * @param base - Git ref to diff against (e.g. "origin/main", "main")
 * @returns Array of absolute file paths to changed .md files
 * @throws ChangedFilesError if git commands fail
 */
export function getChangedFiles(base: string): string[] {
  let repoRoot: string;
  try {
    repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf-8',
    }).trim();
  } catch {
    throw new ChangedFilesError(
      'Not a git repository (or git is not installed)',
    );
  }

  let diffOutput: string;
  try {
    diffOutput = execFileSync(
      'git',
      ['diff', '--name-only', '--diff-filter=ACM', `${base}...HEAD`, '--', '*.md'],
      { encoding: 'utf-8', cwd: repoRoot },
    ).trim();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ChangedFilesError(
      `Failed to get changed files (base: ${base}): ${msg}`,
    );
  }

  if (diffOutput === '') {
    return [];
  }

  return diffOutput
    .split('\n')
    .map((relativePath) => resolve(repoRoot, relativePath));
}
