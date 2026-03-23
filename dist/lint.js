/**
 * Orchestrator — wires the full lint pipeline end-to-end.
 * CLI args → loadConfig → detectFormat → extractAll → validateFrontmatter + validateManifest → report → exit code
 */
import { resolve } from 'node:path';
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
/**
 * Run the lint pipeline and return an exit code.
 *
 * Exit codes:
 *   0 — no errors (or only warnings without --strict)
 *   1 — validation errors found (or warnings with --strict)
 *
 * ConfigError is NOT caught here — the caller (cli.ts) handles it for exit code 2.
 */
export async function runLint(options) {
    // Determine root directory from the first path argument or cwd.
    const rootDir = options.paths?.[0]
        ? resolve(options.paths[0])
        : process.cwd();
    // (a) Load config — may throw ConfigError, handled by caller.
    const config = loadConfig(rootDir);
    // (a2) Auto-detect repository format.
    const format = detectFormat(rootDir, config);
    // (b) --changed-only: lint only files changed since base ref.
    //     ChangedFilesError is NOT caught here — the caller (cli.ts) handles it for exit code 2.
    if (options.changedOnly) {
        let changedFiles = getChangedFiles(options.base);
        // Apply ignore patterns from config to the git-derived file list.
        if (config.ignore.length > 0) {
            changedFiles = changedFiles.filter((filePath) => {
                for (const pattern of config.ignore) {
                    if (minimatch(filePath, pattern, { matchBase: true })) {
                        return false;
                    }
                }
                return true;
            });
        }
        // Zero changed files — report and exit 0.
        if (changedFiles.length === 0) {
            if (options.format === 'json') {
                process.stdout.write('[]\n');
            }
            else {
                process.stdout.write('0 files checked\n');
            }
            return 0;
        }
        // Extract each changed file individually.
        let results = changedFiles.map((filePath) => extractFile(filePath));
        // Validate frontmatter.
        const validationResults = await validateFrontmatter(results, options.level, config);
        // Ratchet check (AC-9: additive, AC-10: only changed files).
        if (options.ratchet) {
            try {
                const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
                    encoding: 'utf-8',
                }).trim();
                const ratchetResults = await checkRatchet(results, options.base, gitRoot, config);
                validationResults.push(...ratchetResults);
            }
            catch {
                // AC-7: base ref not fetchable → warning, skip ratchet
                process.stderr.write(`warning: could not read base ref "${options.base}", skipping ratchet\n`);
            }
        }
        // Format and print report.
        if (options.format === 'json') {
            process.stdout.write(reportJSON(validationResults) + '\n');
        }
        else {
            const output = reportTerminal(validationResults, results.length);
            process.stdout.write(output + '\n');
        }
        // --strict: warnings count as errors.
        if (options.strict) {
            const hasWarnings = validationResults.some((r) => r.severity === 'warning');
            if (hasWarnings)
                return 1;
        }
        // Errors -> exit 1.
        const hasErrors = validationResults.some((r) => r.severity === 'error');
        if (hasErrors)
            return 1;
        return 0;
    }
    // (d) Build glob patterns from paths (default to config.skills_root).
    const rawPaths = options.paths && options.paths.length > 0
        ? options.paths
        : [config.skills_root];
    const patterns = rawPaths.map((p) => {
        const resolved = resolve(p);
        // If the path looks like a directory pattern (no extension), add **/*.md
        if (!resolved.endsWith('.md')) {
            return `${resolved}/**/*.md`;
        }
        return resolved;
    });
    // (e) Call extractAll with patterns, passing ignore patterns and format.
    const isStructuredFormat = format === 'plugin' || format === 'multi-plugin' || format === 'project-skills';
    let results = await extractAll(patterns, config.ignore, isStructuredFormat ? format : undefined);
    // (f) Apply ignore patterns from config to filter files (AC-10).
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
    // (g) Zero files found — report and exit 0 (AC-11).
    if (results.length === 0) {
        if (options.format === 'json') {
            process.stdout.write('[]\n');
        }
        else {
            process.stdout.write('0 files checked\n');
        }
        return 0;
    }
    // (h) Validate frontmatter.
    const validationResults = await validateFrontmatter(results, options.level, config);
    // (i) Validate manifests for plugin/multi-plugin formats.
    const isPluginFormat = format === 'plugin' || format === 'multi-plugin';
    if (isPluginFormat) {
        const manifestResults = validateManifest(rootDir, format, config);
        validationResults.push(...manifestResults);
    }
    // (i2) Ratchet check for full-scan path (AC-9: additive).
    if (options.ratchet) {
        try {
            const gitRoot = execFileSync('git', ['rev-parse', '--show-toplevel'], {
                encoding: 'utf-8',
            }).trim();
            const ratchetResults = await checkRatchet(results, options.base, gitRoot, config);
            validationResults.push(...ratchetResults);
        }
        catch {
            // AC-7: base ref not fetchable → warning, skip ratchet
            process.stderr.write(`warning: could not read base ref "${options.base}", skipping ratchet\n`);
        }
    }
    // (j) Format and print report.
    if (options.format === 'json') {
        process.stdout.write(reportJSON(validationResults) + '\n');
    }
    else {
        const output = options.format === 'github'
            ? reportGitHub(validationResults, rootDir)
            : reportTerminal(validationResults, results.length);
        // (k) Print to stdout (skip empty output for clean CI).
        if (output.length > 0) {
            process.stdout.write(output + '\n');
        }
    }
    // (l) --strict: warnings count as errors (AC-3).
    if (options.strict) {
        const hasWarnings = validationResults.some((r) => r.severity === 'warning');
        if (hasWarnings)
            return 1;
    }
    // (m) Errors → exit 1 (AC-4).
    const hasErrors = validationResults.some((r) => r.severity === 'error');
    if (hasErrors)
        return 1;
    // (n) All clear → exit 0 (AC-5).
    return 0;
}
//# sourceMappingURL=lint.js.map