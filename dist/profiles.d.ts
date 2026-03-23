/**
 * Progressive quality level resolution for skill files.
 *
 * Priority chain (highest to lowest):
 * 1. File frontmatter `quality_level` (if valid integer 0-3)
 * 2. `.skill-lint.yaml` `levels` section (prefix match, longest prefix wins)
 * 3. `.skill-lint.yaml` `default_level`
 * 4. Hardcoded default: 0
 *
 * CLI `--level` sets a floor: effectiveLevel = max(resolvedLevel, cliLevel)
 */
import type { Config, ExtractResult, ValidationResult } from './types.js';
/**
 * Resolve the effective quality level for a single file.
 *
 * @param filePath - Absolute path to the file being validated.
 * @param frontmatter - Parsed frontmatter data (may include `quality_level`).
 * @param config - Config with `default_level`, `levels`, and `skills_root`.
 * @returns The resolved level:
 *          - 0-3: explicit file frontmatter or directory override
 *          - -1: out-of-range quality_level (caller should warn and use default)
 *          - -2: no explicit override found (fell back to default_level or hardcoded 0)
 */
export declare function resolveLevel(filePath: string, frontmatter: Record<string, unknown>, config: Pick<Config, 'default_level' | 'levels' | 'skills_root'>): number;
/**
 * Anti-regression ratchet: compare each file's raw quality_level frontmatter
 * against the same file in the base ref. If quality_level decreased, report
 * a "quality-level-regression" error.
 *
 * @param files - Extracted file results to check.
 * @param baseRef - Git ref to compare against (e.g. "origin/main").
 * @param gitRoot - Absolute path to the git repository root.
 * @param config - Config with `skills_root`.
 * @returns Validation results for any regressions found.
 */
export declare function checkRatchet(files: ExtractResult[], baseRef: string, gitRoot: string, _config: Pick<Config, 'skills_root'>): Promise<ValidationResult[]>;
//# sourceMappingURL=profiles.d.ts.map