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
 * - Otherwise, runs the appropriate Spectral rules based on file type and level filter.
 *
 * @param results - Extracted frontmatter results to validate.
 * @param level - Maximum rule level to include (0 = Level 0 only, 1 = Level 0 + Level 1).
 * @param config - Optional config for model list, tool registry, and limits.
 */
export declare function validateFrontmatter(results: ExtractResult[], level: number, config?: Pick<Config, 'models' | 'tools' | 'limits'>): Promise<ValidationResult[]>;
/**
 * Get the full ruleset for inspection (e.g., testing).
 * Returns the raw rules object with extensions metadata.
 */
export declare function getRuleset(config?: Pick<Config, 'models' | 'tools' | 'limits'>): Record<string, LevelRule>;
//# sourceMappingURL=validate-frontmatter.d.ts.map