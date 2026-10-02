/**
 * Opt-in bridge to the official `claude plugin validate` command.
 * The official validator owns the plugin/marketplace schema (name reservation,
 * MCP paths, URLs, dependency sources); we fold its report into ours rather
 * than copying its rules.
 */

import { spawnSync } from 'node:child_process';
import type { ValidationResult } from './types.js';

const RULE = 'claude-plugin-validate';
const UNAVAILABLE_RULE = 'claude-plugin-validate-unavailable';

type Issue = { path?: string; message?: string };
type Report = { file?: string; errors?: Issue[]; warnings?: Issue[] };
type ValidatorOutput = { manifest?: Report | null; contents?: Report[] };

function fromReport(report: Report, fallbackFile: string): ValidationResult[] {
  const filePath = report.file ?? fallbackFile;
  const toResult = (severity: 'error' | 'warning') => (issue: Issue): ValidationResult => ({
    filePath,
    rule: RULE,
    severity,
    message: issue.path ? `${issue.path}: ${issue.message ?? ''}` : (issue.message ?? ''),
  });
  return [
    ...(report.errors ?? []).map(toResult('error')),
    ...(report.warnings ?? []).map(toResult('warning')),
  ];
}

/**
 * Run `claude plugin validate <rootDir> --json` and map its findings.
 * A missing CLI, a timeout, or unparseable output is reported as an error:
 * the flag was requested explicitly, so a silent pass would hide a CI gap.
 */
export function runPluginValidate(rootDir: string, command = 'claude'): ValidationResult[] {
  const proc = spawnSync(command, ['plugin', 'validate', rootDir, '--json'], {
    encoding: 'utf-8',
    timeout: 60_000,
  });

  if (proc.error) {
    const code = (proc.error as NodeJS.ErrnoException).code;
    const why = code === 'ENOENT' ? `"${command}" not found on PATH` : proc.error.message;
    return [{
      filePath: rootDir,
      rule: UNAVAILABLE_RULE,
      severity: 'error',
      message: `--run-plugin-validate requested but the Claude Code CLI could not run: ${why}`,
    }];
  }

  let output: ValidatorOutput;
  try {
    output = JSON.parse(proc.stdout) as ValidatorOutput;
  } catch {
    return [{
      filePath: rootDir,
      rule: UNAVAILABLE_RULE,
      severity: 'error',
      message: `claude plugin validate did not return JSON (exit ${proc.status}): ${(proc.stderr || proc.stdout).trim().slice(0, 200)}`,
    }];
  }

  return [
    ...(output.manifest ? fromReport(output.manifest, rootDir) : []),
    ...(output.contents ?? []).flatMap((c) => fromReport(c, rootDir)),
  ];
}
