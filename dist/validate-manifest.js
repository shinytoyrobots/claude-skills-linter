/**
 * Manifest validation for plugin.json and marketplace.json.
 * Validates JSON structure, required fields, cross-references, and filesystem consistency.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
/**
 * Validate plugin manifests (marketplace.json and plugin.json files).
 *
 * For legacy-commands format, skips all manifest validation (AC-9).
 * For plugin/multi-plugin formats, validates:
 * - marketplace.json required fields and structure (AC-1)
 * - plugin source paths resolve to existing directories (AC-2)
 * - plugin source paths are relative, not absolute (AC-2b)
 * - plugin name consistency between marketplace.json and plugin.json (AC-3)
 * - all plugin directories are listed in marketplace.json (AC-4)
 * - plugin.json required fields (AC-5)
 * - plugin.json existence and valid JSON (AC-6)
 * - marketplace.json valid JSON (AC-6b)
 * - skills directories contain SKILL.md files (AC-7)
 */
export function validateManifest(rootDir, format, _config) {
    // AC-9: Skip manifest validation for legacy-commands format.
    if (format === 'legacy-commands') {
        return [];
    }
    const results = [];
    const marketplacePath = join(rootDir, '.claude-plugin', 'marketplace.json');
    // If no marketplace.json exists, nothing to validate.
    if (!existsSync(marketplacePath)) {
        return results;
    }
    // AC-6b: Parse marketplace.json — invalid JSON stops all downstream checks.
    let marketplace;
    try {
        const raw = readFileSync(marketplacePath, 'utf-8');
        marketplace = JSON.parse(raw);
    }
    catch {
        results.push({
            filePath: marketplacePath,
            rule: 'marketplace-manifest-error',
            severity: 'error',
            message: 'marketplace.json contains invalid JSON',
        });
        return results;
    }
    // AC-1: Validate marketplace.json required fields.
    validateMarketplaceFields(marketplace, marketplacePath, results);
    // Extract valid plugin entries for cross-reference checks.
    const pluginEntries = getPluginEntries(marketplace);
    // AC-2, AC-2b: Validate plugin source paths.
    for (const entry of pluginEntries) {
        validatePluginSource(entry, rootDir, marketplacePath, results);
    }
    // AC-5, AC-6, AC-3: Validate individual plugin.json files.
    if (format === 'multi-plugin') {
        validateMultiPluginManifests(rootDir, pluginEntries, marketplacePath, results);
    }
    else {
        // Single plugin format — validate root plugin.json.
        validateSinglePluginManifest(rootDir, results);
    }
    // AC-4: Check for unlisted plugins in multi-plugin format.
    if (format === 'multi-plugin') {
        checkUnlistedPlugins(rootDir, pluginEntries, results);
    }
    // AC-7: Check skills directories for SKILL.md files.
    if (format === 'multi-plugin') {
        checkMultiPluginSkillFiles(rootDir, pluginEntries, results);
    }
    else {
        checkSinglePluginSkillFiles(rootDir, results);
    }
    return results;
}
/**
 * AC-1: Validate marketplace.json has required fields with correct types.
 */
function validateMarketplaceFields(manifest, filePath, results) {
    if (typeof manifest.name !== 'string') {
        results.push({
            filePath,
            rule: 'marketplace-manifest-error',
            severity: 'error',
            message: 'marketplace.json missing required field "name" (string)',
        });
    }
    if (manifest.owner === null || manifest.owner === undefined || typeof manifest.owner !== 'object') {
        results.push({
            filePath,
            rule: 'marketplace-manifest-error',
            severity: 'error',
            message: 'marketplace.json missing required field "owner" (object)',
        });
    }
    else {
        const owner = manifest.owner;
        if (typeof owner.name !== 'string') {
            results.push({
                filePath,
                rule: 'marketplace-manifest-error',
                severity: 'error',
                message: 'marketplace.json "owner" missing required field "name" (string)',
            });
        }
    }
    if (!Array.isArray(manifest.plugins)) {
        results.push({
            filePath,
            rule: 'marketplace-manifest-error',
            severity: 'error',
            message: 'marketplace.json missing required field "plugins" (array)',
        });
    }
    else {
        for (let i = 0; i < manifest.plugins.length; i++) {
            const entry = manifest.plugins[i];
            if (typeof entry.name !== 'string') {
                results.push({
                    filePath,
                    rule: 'marketplace-manifest-error',
                    severity: 'error',
                    message: `marketplace.json plugins[${i}] missing required field "name" (string)`,
                });
            }
            if (typeof entry.source !== 'string') {
                results.push({
                    filePath,
                    rule: 'marketplace-manifest-error',
                    severity: 'error',
                    message: `marketplace.json plugins[${i}] missing required field "source" (string)`,
                });
            }
        }
    }
}
/**
 * Extract valid plugin entries (those with string name and source) from marketplace.json.
 */
function getPluginEntries(manifest) {
    if (!Array.isArray(manifest.plugins))
        return [];
    return manifest.plugins.filter((entry) => {
        const e = entry;
        return typeof e.name === 'string' && typeof e.source === 'string';
    });
}
/**
 * AC-2, AC-2b: Validate a plugin source path.
 */
function validatePluginSource(entry, rootDir, marketplacePath, results) {
    const source = entry.source;
    const name = entry.name;
    // AC-2b: Check for absolute or home-relative paths.
    if (isAbsolute(source) || source.startsWith('~/')) {
        results.push({
            filePath: marketplacePath,
            rule: 'invalid-source-path',
            severity: 'error',
            message: `plugin "${name}" source "${source}" must be a relative path`,
        });
        return;
    }
    // AC-2: Check that source directory exists.
    const resolved = join(rootDir, source);
    if (!existsSync(resolved)) {
        results.push({
            filePath: marketplacePath,
            rule: 'broken-plugin-source',
            severity: 'error',
            message: `plugin "${name}" source "${source}" points to a directory that does not exist`,
        });
    }
}
/**
 * AC-5, AC-6, AC-3: Validate plugin.json files for multi-plugin format.
 */
function validateMultiPluginManifests(rootDir, pluginEntries, _marketplacePath, results) {
    for (const entry of pluginEntries) {
        const source = entry.source;
        const marketplaceName = entry.name;
        const pluginJsonPath = join(rootDir, source, '.claude-plugin', 'plugin.json');
        // AC-6: Check plugin.json exists.
        if (!existsSync(pluginJsonPath)) {
            results.push({
                filePath: pluginJsonPath,
                rule: 'plugin-manifest-error',
                severity: 'error',
                message: `plugin.json not found for plugin "${marketplaceName}"`,
            });
            continue;
        }
        // AC-6: Parse plugin.json.
        let pluginManifest;
        try {
            const raw = readFileSync(pluginJsonPath, 'utf-8');
            pluginManifest = JSON.parse(raw);
        }
        catch {
            results.push({
                filePath: pluginJsonPath,
                rule: 'plugin-manifest-error',
                severity: 'error',
                message: `plugin.json contains invalid JSON for plugin "${marketplaceName}"`,
            });
            continue;
        }
        // AC-5: Validate required fields.
        if (typeof pluginManifest.name !== 'string') {
            results.push({
                filePath: pluginJsonPath,
                rule: 'plugin-manifest-error',
                severity: 'error',
                message: 'plugin.json missing required field "name" (string)',
            });
            continue;
        }
        // AC-3: Check name consistency.
        if (pluginManifest.name !== marketplaceName) {
            results.push({
                filePath: pluginJsonPath,
                rule: 'plugin-name-mismatch',
                severity: 'warning',
                message: `plugin.json name "${pluginManifest.name}" does not match marketplace.json name "${marketplaceName}"`,
            });
        }
    }
}
/**
 * AC-5, AC-6: Validate plugin.json for single plugin format.
 */
function validateSinglePluginManifest(rootDir, results) {
    const pluginJsonPath = join(rootDir, '.claude-plugin', 'plugin.json');
    if (!existsSync(pluginJsonPath)) {
        results.push({
            filePath: pluginJsonPath,
            rule: 'plugin-manifest-error',
            severity: 'error',
            message: 'plugin.json not found',
        });
        return;
    }
    let pluginManifest;
    try {
        const raw = readFileSync(pluginJsonPath, 'utf-8');
        pluginManifest = JSON.parse(raw);
    }
    catch {
        results.push({
            filePath: pluginJsonPath,
            rule: 'plugin-manifest-error',
            severity: 'error',
            message: 'plugin.json contains invalid JSON',
        });
        return;
    }
    if (typeof pluginManifest.name !== 'string') {
        results.push({
            filePath: pluginJsonPath,
            rule: 'plugin-manifest-error',
            severity: 'error',
            message: 'plugin.json missing required field "name" (string)',
        });
    }
}
/**
 * AC-4: Check for plugin directories not listed in marketplace.json.
 */
function checkUnlistedPlugins(rootDir, pluginEntries, results) {
    const pluginsDir = join(rootDir, 'plugins');
    if (!existsSync(pluginsDir))
        return;
    let subdirs;
    try {
        subdirs = readdirSync(pluginsDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
    }
    catch {
        return;
    }
    // Build set of listed source directories (normalized to directory name under plugins/).
    const listedSources = new Set(pluginEntries
        .map((e) => e.source)
        .filter((s) => s.startsWith('plugins/'))
        .map((s) => {
        // Extract the directory name: "plugins/foo" -> "foo", "plugins/foo/bar" -> "foo"
        const parts = s.replace(/^plugins\//, '').split('/');
        return parts[0];
    }));
    for (const subdir of subdirs) {
        const pluginJsonPath = join(pluginsDir, subdir, '.claude-plugin', 'plugin.json');
        if (!existsSync(pluginJsonPath))
            continue;
        if (!listedSources.has(subdir)) {
            results.push({
                filePath: pluginJsonPath,
                rule: 'unlisted-plugin',
                severity: 'warning',
                message: `plugin "${subdir}" has a plugin.json but is not listed in marketplace.json`,
            });
        }
    }
}
/**
 * AC-7: Check that skill directories contain SKILL.md files (multi-plugin).
 */
function checkMultiPluginSkillFiles(rootDir, pluginEntries, results) {
    for (const entry of pluginEntries) {
        const source = entry.source;
        const skillsDir = join(rootDir, source, 'skills');
        if (!existsSync(skillsDir))
            continue;
        let subdirs;
        try {
            subdirs = readdirSync(skillsDir, { withFileTypes: true })
                .filter((e) => e.isDirectory())
                .map((e) => e.name);
        }
        catch {
            continue;
        }
        for (const subdir of subdirs) {
            const skillMdPath = join(skillsDir, subdir, 'SKILL.md');
            if (!existsSync(skillMdPath)) {
                results.push({
                    filePath: join(skillsDir, subdir),
                    rule: 'missing-skill-file',
                    severity: 'error',
                    message: `skills directory "${subdir}" does not contain a SKILL.md file`,
                });
            }
        }
    }
}
/**
 * AC-7: Check that skill directories contain SKILL.md files (single plugin).
 */
function checkSinglePluginSkillFiles(rootDir, results) {
    const skillsDir = join(rootDir, 'skills');
    if (!existsSync(skillsDir))
        return;
    let subdirs;
    try {
        subdirs = readdirSync(skillsDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name);
    }
    catch {
        return;
    }
    for (const subdir of subdirs) {
        const skillMdPath = join(skillsDir, subdir, 'SKILL.md');
        if (!existsSync(skillMdPath)) {
            results.push({
                filePath: join(skillsDir, subdir),
                rule: 'missing-skill-file',
                severity: 'error',
                message: `skills directory "${subdir}" does not contain a SKILL.md file`,
            });
        }
    }
}
//# sourceMappingURL=validate-manifest.js.map