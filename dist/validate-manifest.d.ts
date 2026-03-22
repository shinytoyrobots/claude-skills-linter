/**
 * Manifest validation for plugin.json and marketplace.json.
 * Validates JSON structure, required fields, cross-references, and filesystem consistency.
 */
import type { Config, RepoFormat, ValidationResult } from './types.js';
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
export declare function validateManifest(rootDir: string, format: RepoFormat, _config: Config): ValidationResult[];
//# sourceMappingURL=validate-manifest.d.ts.map