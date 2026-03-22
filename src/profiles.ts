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

import { relative } from 'node:path';
import type { Config } from './types.js';

/** Valid range for quality_level values. */
const MIN_LEVEL = 0;
const MAX_LEVEL = 3;

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
export function resolveLevel(
  filePath: string,
  frontmatter: Record<string, unknown>,
  config: Pick<Config, 'default_level' | 'levels' | 'skills_root'>,
): number {
  // Priority 1: File frontmatter quality_level
  const fileLevel = frontmatter['quality_level'];
  if (fileLevel !== undefined && fileLevel !== null) {
    const parsed = Number(fileLevel);
    if (Number.isInteger(parsed) && parsed >= MIN_LEVEL && parsed <= MAX_LEVEL) {
      return parsed;
    }
    // Out of range — signal to caller with -1
    return -1;
  }

  // Priority 2: Directory-level override from config.levels (longest prefix wins)
  const dirLevel = matchDirectoryLevel(filePath, config);
  if (dirLevel !== undefined) {
    return dirLevel;
  }

  // Priority 3+4: No explicit file or directory override.
  // Return -2 to signal that the caller should use cliLevel directly
  // (preserving backward compatibility with the global --level flag).
  return -2;
}

/**
 * Match a file path against the `levels` config section using prefix matching.
 * Paths in the config are relative to `skills_root`. Longest prefix wins.
 * Trailing slashes are normalized (both "cpo-skills" and "cpo-skills/" match).
 *
 * @returns The matched level, or undefined if no prefix matches.
 */
function matchDirectoryLevel(
  filePath: string,
  config: Pick<Config, 'levels' | 'skills_root'>,
): number | undefined {
  const levels = config.levels;
  if (!levels || Object.keys(levels).length === 0) {
    return undefined;
  }

  // Compute the file path relative to skills_root
  const relPath = relative(config.skills_root, filePath);

  let bestMatch: string | undefined;
  let bestLevel: number | undefined;

  for (const [prefix, level] of Object.entries(levels)) {
    // Normalize: strip trailing slash for comparison
    const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;

    // Check if relative path starts with this prefix
    // Must match at a directory boundary: "cpo-skills" matches "cpo-skills/foo.md"
    // but not "cpo-skills-extra/foo.md"
    if (
      relPath === normalizedPrefix ||
      relPath.startsWith(normalizedPrefix + '/')
    ) {
      // Longest prefix wins
      if (bestMatch === undefined || normalizedPrefix.length > bestMatch.length) {
        bestMatch = normalizedPrefix;
        bestLevel = level;
      }
    }
  }

  return bestLevel;
}
