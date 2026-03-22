import type { ValidationResult } from './types.js';
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