/**
 * claude-skill-lint — public API.
 *
 * Re-exports the programmatic surface for consumers who want to
 * integrate skill linting into their own tooling without shelling
 * out to the CLI.
 */

// ── Orchestrators (high-level entry points) ─────────────────────
export { runLint } from './lint.js';
export type { LintOptions } from './lint.js';

export { runGraph } from './graph.js';
export type { GraphOptions } from './graph.js';

export { runInit, buildConfigYaml } from './init.js';
export type { InitOptions } from './init.js';

// ── Config ──────────────────────────────────────────────────────
export { loadConfig, getDefaults, ConfigError } from './config.js';

// ── Format detection ────────────────────────────────────────────
export { detectFormat } from './detect-format.js';

// ── Extraction ──────────────────────────────────────────────────
export { extractFile, extractAll } from './extract.js';

// ── Classification ──────────────────────────────────────────────
export { classifyFile } from './classify.js';

// ── Validation ──────────────────────────────────────────────────
export { validateFrontmatter, getRuleset } from './validate-frontmatter.js';
export type { LevelRule } from './validate-frontmatter.js';

export { validateGraph } from './validate-graph.js';
export { validateManifest } from './validate-manifest.js';

// ── Profiles ────────────────────────────────────────────────────
export { resolveLevel, checkRatchet } from './profiles.js';

// ── Reporters ───────────────────────────────────────────────────
export { reportJSON, reportGitHub, reportTerminal } from './reporter.js';

// ── Git integration ─────────────────────────────────────────────
export { getChangedFiles, ChangedFilesError } from './changed-files.js';

// ── Types ───────────────────────────────────────────────────────
export type {
  RepoFormat,
  FileType,
  ParseError,
  ExtractResult,
  ValidationResult,
  LevelOverrides,
  ToolsConfig,
  LimitsConfig,
  GraphConfig,
  Config,
} from './types.js';
