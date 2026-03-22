import type { ExtractResult, Config, ValidationResult } from './types.js';
/**
 * Extract canonical (non-relative) references from a single file's body text.
 * Returns an array of { raw, normalized } reference objects.
 *
 * This function extracts ONLY the legacy installed-path and type/filename patterns.
 * Relative path extraction is handled separately.
 */
export declare function extractRefs(bodyText: string): Array<{
    raw: string;
    normalized: string;
}>;
/**
 * Extract relative path references from body text.
 * Returns raw relative path strings (e.g., "../../context/foo.md", "./helpers.md").
 */
export declare function extractRelativeRefs(bodyText: string): Array<{
    raw: string;
}>;
/**
 * Validate cross-file references, orphans, duplicates, cycles, and name collisions.
 *
 * This is the main graph validation entry point. It processes an array
 * of ExtractResults and returns ValidationResults for any issues found.
 *
 * Reference resolution uses canonical names ({type}/{basename}) so that
 * references resolve regardless of repo directory structure — flat, suite-based,
 * plugin-based, or deeply nested.
 *
 * For plugin/multi-plugin formats, relative path references are also supported.
 * Relative paths are resolved against the referencing file's directory and checked
 * against the extracted file set.
 */
export declare function validateGraph(files: ExtractResult[], config: Config, rootDir?: string): ValidationResult[];
//# sourceMappingURL=validate-graph.d.ts.map