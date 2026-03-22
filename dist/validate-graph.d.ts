import type { ExtractResult, Config, ValidationResult } from './types.js';
/**
 * Validate cross-file references, orphans, duplicates, cycles, and name collisions.
 *
 * This is the main graph validation entry point. It processes an array
 * of ExtractResults and returns ValidationResults for any issues found.
 *
 * Reference resolution uses canonical names ({type}/{basename}) so that
 * references resolve regardless of repo directory structure — flat, suite-based,
 * plugin-based, or deeply nested.
 */
export declare function validateGraph(files: ExtractResult[], config: Config): ValidationResult[];
//# sourceMappingURL=validate-graph.d.ts.map