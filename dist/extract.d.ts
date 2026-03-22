import { type ExtractResult, type RepoFormat } from './types.js';
/**
 * Extract frontmatter and synthetic metadata from a single markdown file.
 *
 * Returns a structured ExtractResult — never throws. Parse errors are
 * captured in the `errors` array.
 */
export declare function extractFile(filePath: string): ExtractResult;
/**
 * Extract frontmatter from all markdown files matching the given glob
 * patterns. Returns one ExtractResult per file.
 *
 * When `format` is provided, overrides `patterns` with format-specific
 * discovery globs rooted at `patterns[0]`'s parent (the skills root).
 *
 * Returns an empty array when no files match (AC-6).
 */
export declare function extractAll(patterns: string[], ignore?: string[], format?: RepoFormat): Promise<ExtractResult[]>;
//# sourceMappingURL=extract.d.ts.map