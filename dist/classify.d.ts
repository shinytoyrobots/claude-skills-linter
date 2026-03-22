import { type FileType } from './types.js';
/**
 * Classify a skill file by its path and frontmatter presence.
 *
 * Classification rules (in priority order):
 * 1. Basename `README.md` (case-insensitive) → readme
 * 2. Rightmost known directory segment → command | agent | context
 * 3. Agent path + hasFrontmatter false → legacy-agent
 * 4. No match → unknown
 */
export declare function classifyFile(filePath: string, hasFrontmatter: boolean): FileType;
//# sourceMappingURL=classify.d.ts.map