import type { Config, ExtractResult, ValidationResult } from './types.js';
/** A rule definition with the x-skill-lint-level extension. */
export interface LevelRule {
    given: string;
    severity: number;
    message: string;
    then: {
        function: unknown;
        functionOptions?: unknown;
    };
    extensions: {
        'x-skill-lint-level': number;
    };
}
/**
 * Validate extracted frontmatter against Spectral rules (Level 0 + Level 1).
 *
 * For each ExtractResult:
 * - If it has pre-existing errors, converts them to ValidationResults (skips Spectral).
 * - Otherwise, resolves the effective quality level per file and runs appropriate rules.
 *
 * The `cliLevel` parameter sets a floor: effectiveLevel = max(resolvedLevel, cliLevel).
 * When no files declare `quality_level` and no directory overrides exist,
 * behavior is identical to the previous global-level approach.
 *
 * @param results - Extracted frontmatter results to validate.
 * @param cliLevel - CLI --level flag value (floor for effective level).
 * @param config - Optional config for model list, tool registry, limits, levels, and skills_root.
 */
export declare function validateFrontmatter(results: ExtractResult[], cliLevel: number, config?: Pick<Config, 'models' | 'tools' | 'limits' | 'default_level' | 'levels' | 'skills_root'>): Promise<ValidationResult[]>;
/**
 * Get the full ruleset for inspection (e.g., testing).
 * Returns the raw rules object with extensions metadata.
 */
export declare function getRuleset(config?: Pick<Config, 'models' | 'tools' | 'limits'>): Record<string, LevelRule>;
//# sourceMappingURL=validate-frontmatter.d.ts.map