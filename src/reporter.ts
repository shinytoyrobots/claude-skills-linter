import chalk from 'chalk';
import type { ValidationResult } from './types.js';

/**
 * Format validation results as human-readable terminal output.
 * Groups results by file path, colorizes by severity, and includes a summary line.
 */
export function reportTerminal(
  results: ValidationResult[],
  totalFiles: number,
): string {
  if (results.length === 0) {
    return chalk.green(`\u2713 ${totalFiles} files checked \u2014 no issues found`);
  }

  // Group results by filePath
  const grouped = new Map<string, ValidationResult[]>();
  for (const result of results) {
    const existing = grouped.get(result.filePath);
    if (existing) {
      existing.push(result);
    } else {
      grouped.set(result.filePath, [result]);
    }
  }

  const lines: string[] = [];

  for (const [filePath, fileResults] of grouped) {
    lines.push(`  ${chalk.underline(filePath)}`);
    for (const r of fileResults) {
      const severityLabel =
        r.severity === 'error'
          ? chalk.red(r.severity)
          : r.severity === 'warning'
            ? chalk.yellow(r.severity)
            : chalk.blue(r.severity);
      lines.push(`    ${severityLabel}  ${r.message}  (${r.rule})`);
    }
    lines.push('');
  }

  // Count errors and warnings
  let errorCount = 0;
  let warningCount = 0;
  for (const r of results) {
    if (r.severity === 'error') errorCount++;
    else if (r.severity === 'warning') warningCount++;
  }

  const filesWithIssues = grouped.size;

  // Build summary parts
  const parts: string[] = [];
  if (errorCount > 0) {
    parts.push(`${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`);
  }
  if (warningCount > 0) {
    parts.push(
      `${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`,
    );
  }

  const issuesSummary = parts.join(' and ');
  const fileWord = filesWithIssues === 1 ? 'file' : 'files';
  const summary = `\u2716 ${issuesSummary} in ${filesWithIssues} ${fileWord} (${totalFiles} files checked)`;

  lines.push(chalk.red(summary));

  return lines.join('\n');
}
