/**
 * Orchestrator — wires the full lint pipeline end-to-end.
 * CLI args → loadConfig → detectFormat → extractAll → validateFrontmatter + validateManifest → report → exit code
 */

import { resolve, dirname } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { loadConfig } from './config.js';
import { detectFormat } from './detect-format.js';
import { extractAll, extractFile } from './extract.js';
import { validateFrontmatter } from './validate-frontmatter.js';
import { validateManifest } from './validate-manifest.js';
import { reportTerminal, reportGitHub, reportJSON } from './reporter.js';
import { execFileSync } from 'node:child_process';
import { minimatch } from 'minimatch';
import { getChangedFiles } from './changed-files.js';
import { checkRatchet } from './profiles.js';
import type { ExtractResult, ValidationResult, Config } from './types.js';

/** Options passed from the CLI to the lint orchestrator. */
export interface LintOptions {
  paths?: string[];
  level: number;
  changedOnly: boolean;
  base: string;
  format: 'terminal' | 'json' | 'github';
  strict: boolean;
  ratchet: boolean;
}

/** Input to the shared validation pipeline. */
interface PipelineInput {
  results: ExtractResult[];
  validationResults: ValidationResult[];
  options: LintOptions;
  config: Config;
  rootDir: string;
}

/**
 * Shared validation pipeline: ratchet check → report → strict check → exit code.
 *
 * Note on stdout guard: the normal scan path had an `if (output.length > 0)` guard
 * (to keep CI output clean when no issues are found and github format returns empty string).
 * The changedOnly path did not have this guard (reportTerminal always returns a non-empty
 * summary line). We harmonize here by always applying the guard — this is safe because
 * reportTerminal always returns a non-empty string, so changedOnly behavior is unchanged.
 *
 * Note on --format github + --changed-only: the original changedOnly branch fell through
 * to reportTerminal for github format (not a supported combination). This is preserved here:
 * github format is only used when explicitly handled; the options.format check matches the
 * original behavior.
 */
async function runPipeline(input: PipelineInput): Promise<number> {
  const { results, validationResults, options, config, rootDir } = input;

  // Ratchet check (additive — appends to validationResults).
  if (options.ratchet) {
    try {
      const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        encoding: 'utf-8',
      }).trim();
      const ratchetResults = await checkRatchet(results, options.base, gitRoot, config);
      validationResults.push(...ratchetResults);
    } catch {
      // Base ref not fetchable → warning, skip ratchet.
      process.stderr.write(`warning: could not read base ref "${options.base}", skipping ratchet\n`);
    }
  }

  // Format and print report.
  if (options.format === 'json') {
    process.stdout.write(reportJSON(validationResults) + '\n');
  } else {
    const output =
      options.format === 'github'
        ? reportGitHub(validationResults, rootDir)
        : reportTerminal(validationResults, results.length);

    // Skip empty output for clean CI (e.g. github format with zero results).
    if (output.length > 0) {
      process.stdout.write(output + '\n');
    }
  }

  // --strict: warnings count as errors.
  if (options.strict) {
    const hasWarnings = validationResults.some((r) => r.severity === 'warning');
    if (hasWarnings) return 1;
  }

  // Errors → exit 1.
  const hasErrors = validationResults.some((r) => r.severity === 'error');
  if (hasErrors) return 1;

  // All clear → exit 0.
  return 0;
}

/** Zero-files early-exit helper (shared between both branches). */
function reportZeroFiles(outputFormat: LintOptions['format']): number {
  process.stdout.write(outputFormat === 'json' ? '[]\n' : '0 files checked\n');
  return 0;
}

/** Apply ignore patterns to an array of file paths. */
function applyIgnorePaths(files: string[], ignorePatterns: string[]): string[] {
  if (ignorePatterns.length === 0) return files;
  return files.filter((f) => !ignorePatterns.some((p) => minimatch(f, p, { matchBase: true })));
}

/**
 * Run the lint pipeline and return an exit code.
 * Exit codes: 0 = clean, 1 = errors (or warnings with --strict), 2 = config/git error (caller).
 */
/**
 * Resolve the project root directory from paths or cwd.
 *
 * When a directory is passed (e.g. `lint .` or `lint test/fixtures/plugin`),
 * use it directly as rootDir — this is the existing behavior.
 *
 * When file paths are passed (e.g. from a pre-commit hook like
 * `lint commands/foo.md agents/bar.md`), the first path is a file, not
 * the repo root. In that case, walk up from cwd to find the nearest
 * directory containing .skill-lint.yaml. Falls back to cwd.
 */
function resolveRootDir(firstPath: string | undefined): string {
  if (firstPath) {
    const resolved = resolve(firstPath);
    // If it's a directory, use it directly (existing behavior).
    if (existsSync(resolved) && statSync(resolved).isDirectory()) {
      return resolved;
    }
  }

  // File path or no path — walk up from cwd to find config.
  let dir = process.cwd();
  while (true) {
    if (existsSync(resolve(dir, '.skill-lint.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return process.cwd();
}

export async function runLint(options: LintOptions): Promise<number> {
  const rootDir = resolveRootDir(options.paths?.[0]);
  const config = loadConfig(rootDir);
  const format = detectFormat(rootDir, config);

  // --changed-only branch: lint only files changed since base ref.
  if (options.changedOnly) {
    const changedFiles = applyIgnorePaths(getChangedFiles(options.base), config.ignore);
    if (changedFiles.length === 0) return reportZeroFiles(options.format);

    const results = changedFiles.map((f) => extractFile(f));
    const validationResults = await validateFrontmatter(results, options.level, config);
    return runPipeline({ results, validationResults, options, config, rootDir });
  }

  // Normal scan branch: glob for .md files.
  const rawPaths = options.paths && options.paths.length > 0 ? options.paths : [config.skills_root];
  const patterns = rawPaths.map((p) => {
    const resolved = resolve(p);
    return resolved.endsWith('.md') ? resolved : `${resolved}/**/*.md`;
  });

  const isStructuredFormat = format === 'plugin' || format === 'multi-plugin' || format === 'project-skills';
  let results = await extractAll(patterns, config.ignore, isStructuredFormat ? format : undefined);

  if (config.ignore.length > 0) {
    results = results.filter((r) => !config.ignore.some((p) => minimatch(r.filePath, p, { matchBase: true })));
  }

  if (results.length === 0) return reportZeroFiles(options.format);

  const validationResults = await validateFrontmatter(results, options.level, config);

  // Manifest validation — normal path only.
  if (format === 'plugin' || format === 'multi-plugin') {
    validationResults.push(...validateManifest(rootDir, format, config));
  }

  return runPipeline({ results, validationResults, options, config, rootDir });
}
