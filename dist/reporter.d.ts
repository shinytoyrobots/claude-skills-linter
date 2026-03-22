import type { ValidationResult } from './types.js';
/**
 * Format validation results as a JSON array.
 * Outputs ONLY valid JSON — no summary lines, no other text.
 * The result is parseable by JSON.parse().
 *
 * When there are zero results, outputs an empty array `[]`.
 */
export declare function reportJSON(results: ValidationResult[]): string;
/**
 * Format validation results as GitHub Actions workflow annotations.
 * Each result becomes a ::error, ::warning, or ::notice annotation
 * that GitHub renders inline on PR diffs.
 */
export declare function reportGitHub(results: ValidationResult[], rootDir: string): string;
/**
 * Format validation results as human-readable terminal output.
 * Groups results by file path, colorizes by severity, and includes a summary line.
 */
export declare function reportTerminal(results: ValidationResult[], totalFiles: number): string;
//# sourceMappingURL=reporter.d.ts.map