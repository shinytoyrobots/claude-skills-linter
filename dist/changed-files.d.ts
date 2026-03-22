/**
 * Git-aware file filtering for --changed-only mode.
 * Returns absolute paths to .md files changed since a given base ref.
 */
/** Error thrown when git operations fail (non-git dir, bad ref, etc.). */
export declare class ChangedFilesError extends Error {
    constructor(message: string);
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
export declare function getChangedFiles(base: string): string[];
//# sourceMappingURL=changed-files.d.ts.map