/**
 * Auto-detect repository format based on filesystem signals.
 * Determines whether a repo uses legacy-commands, plugin, multi-plugin, or project-skills format.
 */
import type { Config, RepoFormat } from './types.js';
/**
 * Detect the repository format for skill file organization.
 *
 * Priority order (first match wins):
 * 1. Config override (format field in .skill-lint.yaml)
 * 2. multi-plugin: marketplace.json + plugins with plugin.json
 * 3. plugin: marketplace.json + skills/SKILL.md files
 * 4. project-skills: .claude/skills/{name}/SKILL.md
 * 5. legacy-commands: commands/, agents/, or context/ directories
 * 6. Fallback: legacy-commands with stderr warning
 */
export declare function detectFormat(rootDir: string, config: Config): RepoFormat;
//# sourceMappingURL=detect-format.d.ts.map