import chalk from 'chalk';
/**
 * Escape special characters in a message for GitHub Actions annotation format.
 * Per GitHub docs: % → %25, \r → %0D, \n → %0A
 */
function escapeMessage(msg) {
    return msg.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}
/**
 * Map severity to GitHub Actions annotation command.
 */
function severityToCommand(severity) {
    if (severity === 'info')
        return 'notice';
    return severity;
}
/**
 * Format validation results as GitHub Actions workflow annotations.
 * Each result becomes a ::error, ::warning, or ::notice annotation
 * that GitHub renders inline on PR diffs.
 */
export function reportGitHub(results, rootDir) {
    if (results.length === 0) {
        return '';
    }
    // Normalize rootDir to end with /
    const prefix = rootDir.endsWith('/') ? rootDir : rootDir + '/';
    const lines = [];
    for (const r of results) {
        const command = severityToCommand(r.severity);
        // Strip rootDir prefix to produce repo-relative path
        const relPath = r.filePath.startsWith(prefix)
            ? r.filePath.slice(prefix.length)
            : r.filePath;
        const escapedMessage = escapeMessage(r.message);
        const lineParam = r.line !== undefined ? `,line=${r.line}` : '';
        lines.push(`::${command} file=${relPath}${lineParam}::${escapedMessage} (${r.rule})`);
    }
    return lines.join('\n');
}
/**
 * Format validation results as human-readable terminal output.
 * Groups results by file path, colorizes by severity, and includes a summary line.
 */
export function reportTerminal(results, totalFiles) {
    if (results.length === 0) {
        return chalk.green(`\u2713 ${totalFiles} files checked \u2014 no issues found`);
    }
    // Group results by filePath
    const grouped = new Map();
    for (const result of results) {
        const existing = grouped.get(result.filePath);
        if (existing) {
            existing.push(result);
        }
        else {
            grouped.set(result.filePath, [result]);
        }
    }
    const lines = [];
    for (const [filePath, fileResults] of grouped) {
        lines.push(`  ${chalk.underline(filePath)}`);
        for (const r of fileResults) {
            const severityLabel = r.severity === 'error'
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
        if (r.severity === 'error')
            errorCount++;
        else if (r.severity === 'warning')
            warningCount++;
    }
    const filesWithIssues = grouped.size;
    // Build summary parts
    const parts = [];
    if (errorCount > 0) {
        parts.push(`${errorCount} ${errorCount === 1 ? 'error' : 'errors'}`);
    }
    if (warningCount > 0) {
        parts.push(`${warningCount} ${warningCount === 1 ? 'warning' : 'warnings'}`);
    }
    const issuesSummary = parts.join(' and ');
    const fileWord = filesWithIssues === 1 ? 'file' : 'files';
    const summary = `\u2716 ${issuesSummary} in ${filesWithIssues} ${fileWord} (${totalFiles} files checked)`;
    lines.push(chalk.red(summary));
    return lines.join('\n');
}
//# sourceMappingURL=reporter.js.map