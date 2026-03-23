/**
 * Config loader for .skill-lint.yaml files.
 * Loads user configuration and deep-merges with defaults.
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import type { Config } from './types.js';

const CONFIG_FILENAME = '.skill-lint.yaml';

/** Error thrown when the config file contains invalid YAML. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** Returns a fresh copy of the default configuration. */
export function getDefaults(): Config {
  return {
    skills_root: '.',
    default_level: 0,
    levels: {},
    tools: { mcp_pattern: 'mcp__*', custom: [] },
    models: ['opus', 'sonnet', 'haiku'],
    limits: { max_file_size: 15360 },
    ignore: ['**/README.md'],
    prefixes: 'PREFIXES.md',
    graph: {
      warn_orphans: true,
      warn_fanout_above: 50000,
      detect_cycles: true,
      detect_duplicates: true,
    },
  };
}

/**
 * Deep-merge source into target.
 * For objects: recursively merge nested keys.
 * For arrays: source value replaces target (no concatenation).
 */
function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];

    if (
      sourceVal !== null &&
      typeof sourceVal === 'object' &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === 'object' &&
      !Array.isArray(targetVal)
    ) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else {
      result[key] = sourceVal;
    }
  }

  return result;
}

/**
 * Load configuration from .skill-lint.yaml in the given root directory.
 * Returns defaults if the file is missing or empty.
 * Throws ConfigError if the file contains invalid YAML.
 * Unknown keys are silently ignored.
 */
export function loadConfig(rootDir: string): Config {
  const defaults = getDefaults();
  const configPath = join(rootDir, CONFIG_FILENAME);

  if (!existsSync(configPath)) {
    return defaults;
  }

  const stat = statSync(configPath);
  if (stat.size === 0) {
    return defaults;
  }

  const raw = readFileSync(configPath, 'utf-8');

  let parsed: unknown;
  try {
    parsed = parse(raw);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new ConfigError(`Invalid YAML in ${CONFIG_FILENAME}: ${msg}`);
  }

  // parse() returns null for empty documents (e.g., only comments)
  if (parsed == null || typeof parsed !== 'object') {
    return defaults;
  }

  const merged = deepMerge(
    defaults as unknown as Record<string, unknown>,
    parsed as Record<string, unknown>,
  );

  // Pick only known Config keys from the merged result
  return {
    skills_root: merged.skills_root as Config['skills_root'],
    default_level: merged.default_level as Config['default_level'],
    levels: merged.levels as Config['levels'],
    tools: merged.tools as Config['tools'],
    models: merged.models as Config['models'],
    limits: merged.limits as Config['limits'],
    ignore: merged.ignore as Config['ignore'],
    prefixes: merged.prefixes as Config['prefixes'],
    graph: merged.graph as Config['graph'],
    ...(merged.format !== undefined ? { format: merged.format as Config['format'] } : {}),
  };
}
