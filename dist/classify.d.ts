import { type FileType } from './types.js';
/**
 * Classify a skill file by its path and frontmatter presence.
 *
 * Classification rules (in priority order):
 * 1. Basename `SKILL.md` (case-sensitive) → skill
 * 2. Basename `README.md` or `CLAUDE.md` (case-insensitive) → readme
 * 3. Rightmost known directory segment → command | agent | context | skill
 * 4. Agent path + hasFrontmatter false → legacy-agent
 * 5. No match → unknown
 */
export declare function classifyFile(filePath: string, hasFrontmatter: boolean): FileType;
//# sourceMappingURL=classify.d.ts.map