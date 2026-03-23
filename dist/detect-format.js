/**
 * Auto-detect repository format based on filesystem signals.
 * Determines whether a repo uses legacy-commands, plugin, multi-plugin, or project-skills format.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ConfigError } from './config.js';
const VALID_FORMATS = ['legacy-commands', 'plugin', 'multi-plugin', 'project-skills'];
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
export function detectFormat(rootDir, config) {
    // AC-4 / AC-9: Config override takes precedence
    if (config.format !== undefined) {
        if (!VALID_FORMATS.includes(config.format)) {
            throw new ConfigError(`Invalid format "${config.format}" in .skill-lint.yaml. Valid values: ${VALID_FORMATS.join(', ')}`);
        }
        return config.format;
    }
    // Check for .claude-plugin/marketplace.json
    const marketplacePath = join(rootDir, '.claude-plugin', 'marketplace.json');
    const hasMarketplace = existsSync(marketplacePath);
    if (hasMarketplace) {
        // AC-8: Validate marketplace.json is parseable
        let marketplaceValid = true;
        try {
            const raw = readFileSync(marketplacePath, 'utf-8');
            JSON.parse(raw);
        }
        catch {
            process.stderr.write(`Warning: .claude-plugin/marketplace.json contains malformed JSON, skipping plugin detection\n`);
            marketplaceValid = false;
        }
        if (marketplaceValid) {
            // AC-1: Check for multi-plugin (plugins/*/.claude-plugin/plugin.json)
            if (hasMultiPlugin(rootDir)) {
                return 'multi-plugin';
            }
            // AC-2: Check for plugin format (skills/*/SKILL.md)
            if (hasSkillFiles(rootDir)) {
                return 'plugin';
            }
        }
    }
    // project-skills: .claude/skills/*/SKILL.md (priority 3, after plugin formats)
    if (hasProjectSkills(rootDir)) {
        return 'project-skills';
    }
    // AC-3 / AC-7: Legacy commands detection (only when plugin detection didn't match)
    if (hasLegacyDirs(rootDir)) {
        return 'legacy-commands';
    }
    // AC-5: Fallback with warning
    process.stderr.write(`Warning: No recognized repo format signals found, defaulting to legacy-commands\n`);
    return 'legacy-commands';
}
/**
 * Check if any subdirectory of plugins/ contains .claude-plugin/plugin.json.
 */
function hasMultiPlugin(rootDir) {
    const pluginsDir = join(rootDir, 'plugins');
    if (!existsSync(pluginsDir))
        return false;
    let entries;
    try {
        entries = readdirSync(pluginsDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
    }
    catch {
        return false;
    }
    return entries.some((name) => existsSync(join(pluginsDir, name, '.claude-plugin', 'plugin.json')));
}
/** Check if any subdirectory of .claude/skills/ contains a SKILL.md file. */
function hasProjectSkills(rootDir) {
    const skillsDir = join(rootDir, '.claude', 'skills');
    if (!existsSync(skillsDir))
        return false;
    let entries;
    try {
        entries = readdirSync(skillsDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
    }
    catch {
        return false;
    }
    return entries.some((name) => existsSync(join(skillsDir, name, 'SKILL.md')));
}
/** Check if any subdirectory of skills/ contains a SKILL.md file. */
function hasSkillFiles(rootDir) {
    const skillsDir = join(rootDir, 'skills');
    if (!existsSync(skillsDir))
        return false;
    let entries;
    try {
        entries = readdirSync(skillsDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
    }
    catch {
        return false;
    }
    return entries.some((name) => existsSync(join(skillsDir, name, 'SKILL.md')));
}
/**
 * Check if legacy command directories exist at repo root,
 * or nested one level deep inside suite directories (monorepo layout).
 */
function hasLegacyDirs(rootDir) {
    const legacyDirs = ['commands', 'agents', 'context'];
    // Check root-level legacy dirs
    if (legacyDirs.some((dir) => existsSync(join(rootDir, dir)))) {
        return true;
    }
    // Check for suite-monorepo pattern: {suite}/commands|agents|context/
    let entries;
    try {
        entries = readdirSync(rootDir, { withFileTypes: true })
            .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
            .map((e) => e.name);
    }
    catch {
        return false;
    }
    return entries.some((suite) => legacyDirs.some((dir) => existsSync(join(rootDir, suite, dir))));
}
//# sourceMappingURL=detect-format.js.map