/**
 * Manifest validation for plugin.json and marketplace.json.
 * Validates JSON structure, required fields, cross-references, and filesystem consistency.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import type { Config, RepoFormat, ValidationResult } from './types.js';

/** Parsed marketplace.json structure. */
interface MarketplaceManifest {
  name?: unknown;
  owner?: unknown;
  plugins?: unknown;
}

/** A single plugin entry from marketplace.json. */
interface PluginEntry {
  name?: unknown;
  source?: unknown;
}

/** Parsed plugin.json structure. */
interface PluginManifest {
  name?: unknown;
}

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
export function validateManifest(
  rootDir: string,
  format: RepoFormat,
  _config: Config,
): ValidationResult[] {
  // AC-9: Skip manifest validation for legacy-commands format.
  if (format === 'legacy-commands') {
    return [];
  }

  const results: ValidationResult[] = [];
  const marketplacePath = join(rootDir, '.claude-plugin', 'marketplace.json');

  // If no marketplace.json exists, nothing to validate.
  if (!existsSync(marketplacePath)) {
    return results;
  }

  // AC-6b: Parse marketplace.json — invalid JSON stops all downstream checks.
  let marketplace: MarketplaceManifest;
  try {
    const raw = readFileSync(marketplacePath, 'utf-8');
    marketplace = JSON.parse(raw) as MarketplaceManifest;
  } catch {
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
  } else {
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
  } else {
    checkSinglePluginSkillFiles(rootDir, results);
  }

  return results;
}

/**
 * AC-1: Validate marketplace.json has required fields with correct types.
 */
function validateMarketplaceFields(
  manifest: MarketplaceManifest,
  filePath: string,
  results: ValidationResult[],
): void {
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
  } else {
    const owner = manifest.owner as Record<string, unknown>;
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
  } else {
    for (let i = 0; i < manifest.plugins.length; i++) {
      const entry = manifest.plugins[i] as Record<string, unknown>;
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
function getPluginEntries(manifest: MarketplaceManifest): PluginEntry[] {
  if (!Array.isArray(manifest.plugins)) return [];
  return manifest.plugins.filter(
    (entry: unknown) => {
      const e = entry as Record<string, unknown>;
      return typeof e.name === 'string' && typeof e.source === 'string';
    },
  ) as PluginEntry[];
}

/**
 * AC-2, AC-2b: Validate a plugin source path.
 */
function validatePluginSource(
  entry: PluginEntry,
  rootDir: string,
  marketplacePath: string,
  results: ValidationResult[],
): void {
  const source = entry.source as string;
  const name = entry.name as string;

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
function validateMultiPluginManifests(
  rootDir: string,
  pluginEntries: PluginEntry[],
  marketplacePath: string,
  results: ValidationResult[],
): void {
  for (const entry of pluginEntries) {
    const source = entry.source as string;
    const marketplaceName = entry.name as string;
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
    let pluginManifest: PluginManifest;
    try {
      const raw = readFileSync(pluginJsonPath, 'utf-8');
      pluginManifest = JSON.parse(raw) as PluginManifest;
    } catch {
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
function validateSinglePluginManifest(
  rootDir: string,
  results: ValidationResult[],
): void {
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

  let pluginManifest: PluginManifest;
  try {
    const raw = readFileSync(pluginJsonPath, 'utf-8');
    pluginManifest = JSON.parse(raw) as PluginManifest;
  } catch {
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
function checkUnlistedPlugins(
  rootDir: string,
  pluginEntries: PluginEntry[],
  results: ValidationResult[],
): void {
  const pluginsDir = join(rootDir, 'plugins');
  if (!existsSync(pluginsDir)) return;

  let subdirs: string[];
  try {
    subdirs = readdirSync(pluginsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return;
  }

  // Build set of listed source directories (normalized to directory name under plugins/).
  const listedSources = new Set(
    pluginEntries
      .map((e) => e.source as string)
      .filter((s) => s.startsWith('plugins/'))
      .map((s) => {
        // Extract the directory name: "plugins/foo" -> "foo", "plugins/foo/bar" -> "foo"
        const parts = s.replace(/^plugins\//, '').split('/');
        return parts[0];
      }),
  );

  for (const subdir of subdirs) {
    const pluginJsonPath = join(pluginsDir, subdir, '.claude-plugin', 'plugin.json');
    if (!existsSync(pluginJsonPath)) continue;

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
function checkMultiPluginSkillFiles(
  rootDir: string,
  pluginEntries: PluginEntry[],
  results: ValidationResult[],
): void {
  for (const entry of pluginEntries) {
    const source = entry.source as string;
    const skillsDir = join(rootDir, source, 'skills');
    if (!existsSync(skillsDir)) continue;

    let subdirs: string[];
    try {
      subdirs = readdirSync(skillsDir, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
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
function checkSinglePluginSkillFiles(
  rootDir: string,
  results: ValidationResult[],
): void {
  const skillsDir = join(rootDir, 'skills');
  if (!existsSync(skillsDir)) return;

  let subdirs: string[];
  try {
    subdirs = readdirSync(skillsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
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
