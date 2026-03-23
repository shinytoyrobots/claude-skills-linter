/**
 * Orchestrator — wires the full graph validation pipeline end-to-end.
 * CLI args → loadConfig → detectFormat → extractAll → validateGraph → report → exit code
 */

import { resolve } from 'node:path';
import { loadConfig } from './config.js';
import { detectFormat } from './detect-format.js';
import { extractAll } from './extract.js';
import { validateGraph } from './validate-graph.js';
import { reportTerminal, reportGitHub, reportJSON } from './reporter.js';
import { minimatch } from 'minimatch';

/** Options passed from the CLI to the graph orchestrator. */
export interface GraphOptions {
  paths?: string[];
  format: 'terminal' | 'json' | 'github';
  strict: boolean;
}

/**
 * Run the graph validation pipeline and return an exit code.
 *
 * Exit codes:
 *   0 — no errors (or only warnings without --strict)
 *   1 — validation errors found (or warnings with --strict)
 *
 * ConfigError is NOT caught here — the caller (cli.ts) handles it for exit code 2.
 */
export async function runGraph(options: GraphOptions): Promise<number> {
  // Determine root directory from the first path argument or cwd.
  const rootDir = options.paths?.[0]
    ? resolve(options.paths[0])
    : process.cwd();

  // (a) Load config — may throw ConfigError, handled by caller.
  const config = loadConfig(rootDir);

  // (a2) Auto-detect repository format and store in config for graph validation.
  const format = detectFormat(rootDir, config);
  config.format = format;

  // (b) Build glob patterns from paths (default to config.skills_root).
  const rawPaths =
    options.paths && options.paths.length > 0
      ? options.paths
      : [config.skills_root];

  const patterns = rawPaths.map((p) => {
    const resolved = resolve(p);
    if (!resolved.endsWith('.md')) {
      return `${resolved}/**/*.md`;
    }
    return resolved;
  });

  // (c) Extract all files, passing format for structured format discovery.
  const isStructuredFormat = format === 'plugin' || format === 'multi-plugin' || format === 'project-skills';
  let results = await extractAll(patterns, config.ignore, isStructuredFormat ? format : undefined);

  // (d) Apply ignore patterns from config.
  if (config.ignore.length > 0) {
    results = results.filter((r) => {
      for (const pattern of config.ignore) {
        if (minimatch(r.filePath, pattern, { matchBase: true })) {
          return false;
        }
      }
      return true;
    });
  }

  // (e) Zero files found — report and exit 0.
  if (results.length === 0) {
    if (options.format === 'json') {
      process.stdout.write('[]\n');
    } else {
      process.stdout.write('0 files checked\n');
    }
    return 0;
  }

  // (f) Validate graph.
  const validationResults = validateGraph(results, config, rootDir);

  // (g) Format and print report.
  if (options.format === 'json') {
    process.stdout.write(reportJSON(validationResults) + '\n');
  } else {
    const output =
      options.format === 'github'
        ? reportGitHub(validationResults, rootDir)
        : reportTerminal(validationResults, results.length);

    // (h) Print to stdout (skip empty output for clean CI).
    if (output.length > 0) {
      process.stdout.write(output + '\n');
    }
  }

  // (i) --strict: warnings count as errors.
  if (options.strict) {
    const hasWarnings = validationResults.some((r) => r.severity === 'warning');
    if (hasWarnings) return 1;
  }

  // (j) Errors → exit 1.
  const hasErrors = validationResults.some((r) => r.severity === 'error');
  if (hasErrors) return 1;

  // (k) All clear → exit 0.
  return 0;
}
