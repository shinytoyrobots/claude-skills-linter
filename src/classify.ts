import { type FileType } from './types.js';

/** Known directory segments that map to file types. */
const SEGMENT_TYPE_MAP: ReadonlyMap<string, FileType> = new Map([
  ['commands', 'command'],
  ['agents', 'agent'],
  ['context', 'context'],
  ['skills', 'skill'],
]);

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
export function classifyFile(
  filePath: string,
  hasFrontmatter: boolean,
): FileType {
  const basename = filePath.split('/').pop() ?? '';

  // AC-3 (story-016): SKILL.md basename (case-sensitive) → skill
  if (basename === 'SKILL.md') {
    return 'skill';
  }

  // AC-9 (story-016): CLAUDE.md (case-insensitive) → readme
  if (basename.toLowerCase() === 'claude.md') {
    return 'readme';
  }

  // AC-4: README.md basename check (case-insensitive)
  if (basename.toLowerCase() === 'readme.md') {
    return 'readme';
  }

  // Split into segments and find the rightmost known directory segment (AC-7).
  const segments = filePath.split('/');
  let matchedType: FileType | undefined;

  for (const segment of segments) {
    const type = SEGMENT_TYPE_MAP.get(segment);
    if (type !== undefined) {
      matchedType = type;
      // Don't break — keep scanning so the rightmost wins.
    }
  }

  if (matchedType === undefined) {
    return 'unknown'; // AC-9
  }

  // AC-5 / AC-6: legacy-agent reclassification
  if (matchedType === 'agent') {
    return hasFrontmatter ? 'agent' : 'legacy-agent';
  }

  // Non-SKILL.md markdown in skills/ dirs → readme
  if (matchedType === 'skill') {
    return 'readme';
  }

  return matchedType;
}
