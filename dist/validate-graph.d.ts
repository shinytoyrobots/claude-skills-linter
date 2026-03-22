import type { ExtractResult, Config, ValidationResult } from './types.js';
/**
 * Validate cross-file references, orphans, duplicates, and cycles.
 *
 * This is the main graph validation entry point. It processes an array
 * of ExtractResults and returns ValidationResults for any issues found.
 */
export declare function validateGraph(files: ExtractResult[], config: Config): ValidationResult[];
//# sourceMappingURL=validate-graph.d.ts.map