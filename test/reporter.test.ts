import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import chalk from 'chalk';
import { reportTerminal } from '../src/reporter.js';
import type { ValidationResult } from '../src/types.js';

/** Strip ANSI escape codes for text-content assertions. */
function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

describe('reportTerminal', () => {
  // Ensure chalk colorizes so we can test both colored and stripped output.
  beforeEach(() => {
    chalk.level = 1;
  });

  // AC-1: errors display file path, rule, severity, message
  it('displays errors with file path, rule, severity, and message', () => {
    const results: ValidationResult[] = [
      {
        filePath: 'commands/setup.md',
        rule: 'required-fields-command',
        severity: 'error',
        message: 'description is required',
      },
    ];
    const output = strip(reportTerminal(results, 5));
    assert.ok(output.includes('commands/setup.md'), 'should include file path');
    assert.ok(output.includes('error'), 'should include severity');
    assert.ok(
      output.includes('description is required'),
      'should include message',
    );
    assert.ok(
      output.includes('required-fields-command'),
      'should include rule name',
    );
  });

  // AC-2: warnings display with yellow severity
  it('displays warnings with severity label', () => {
    const results: ValidationResult[] = [
      {
        filePath: 'agents/bot.md',
        rule: 'optional-fields',
        severity: 'warning',
        message: 'model field is recommended',
      },
    ];
    const output = reportTerminal(results, 3);
    // The raw output should contain the word "warning"
    assert.ok(strip(output).includes('warning'), 'should include warning text');
    // Verify yellow ANSI codes are present (chalk level 1)
    assert.ok(
      output.includes('\u001b[33m'),
      'should contain yellow ANSI code for warning',
    );
  });

  // AC-3: zero results -> success summary with file count
  it('displays success summary when there are zero results', () => {
    const output = strip(reportTerminal([], 15));
    assert.ok(
      output.includes('15 files checked'),
      'should include files checked count',
    );
    assert.ok(
      output.includes('no issues found'),
      'should indicate no issues',
    );
    assert.ok(output.includes('\u2713'), 'should include check mark');
  });

  // AC-4: chalk colorization (red for errors, green for pass)
  it('uses red colorization for errors', () => {
    const results: ValidationResult[] = [
      {
        filePath: 'commands/foo.md',
        rule: 'required-fields',
        severity: 'error',
        message: 'name is required',
      },
    ];
    const output = reportTerminal(results, 1);
    // Red ANSI code for error severity
    assert.ok(
      output.includes('\u001b[31m'),
      'should contain red ANSI code for error',
    );
  });

  it('uses green colorization for success', () => {
    const output = reportTerminal([], 10);
    assert.ok(
      output.includes('\u001b[32m'),
      'should contain green ANSI code for success',
    );
  });

  // AC-5: non-TTY detection — verify chalk is not forced
  it('does not force chalk color level', () => {
    // chalk.level is set externally (by chalk's own TTY detection).
    // We verify that the reporter module does not import or set forceColor.
    // Setting chalk.level = 0 should produce no ANSI codes.
    chalk.level = 0;
    const output = reportTerminal([], 5);
    assert.ok(
      !output.includes('\u001b['),
      'should have no ANSI codes when chalk.level is 0',
    );
    // Restore for subsequent tests
    chalk.level = 1;
  });

  // AC-6: multiple files -> grouped by path
  it('groups results by file path', () => {
    const results: ValidationResult[] = [
      {
        filePath: 'commands/a.md',
        rule: 'rule-a',
        severity: 'error',
        message: 'error in a',
      },
      {
        filePath: 'commands/b.md',
        rule: 'rule-b',
        severity: 'error',
        message: 'error in b',
      },
      {
        filePath: 'commands/a.md',
        rule: 'rule-c',
        severity: 'warning',
        message: 'warning in a',
      },
    ];
    const output = strip(reportTerminal(results, 10));
    // Both files should appear
    assert.ok(output.includes('commands/a.md'), 'should include first file');
    assert.ok(output.includes('commands/b.md'), 'should include second file');

    // The two results for commands/a.md should be grouped together
    const aIndex1 = output.indexOf('error in a');
    const aIndex2 = output.indexOf('warning in a');
    const bIndex = output.indexOf('error in b');
    // Both a.md results should appear before (or after) b.md results
    assert.ok(
      (aIndex1 < bIndex && aIndex2 < bIndex) ||
        (aIndex1 > bIndex && aIndex2 > bIndex),
      'results for same file should be grouped together',
    );
  });

  // AC-7: singular/plural forms
  describe('singular/plural summary', () => {
    it('uses singular "error" and "file" for 1 error in 1 file', () => {
      const results: ValidationResult[] = [
        {
          filePath: 'commands/a.md',
          rule: 'r',
          severity: 'error',
          message: 'm',
        },
      ];
      const output = strip(reportTerminal(results, 5));
      assert.ok(
        output.includes('1 error in 1 file'),
        `expected "1 error in 1 file", got: ${output}`,
      );
      assert.ok(
        output.includes('(5 files checked)'),
        'should include total files checked',
      );
    });

    it('uses plural "errors" and "files" for multiple', () => {
      const results: ValidationResult[] = [
        {
          filePath: 'commands/a.md',
          rule: 'r',
          severity: 'error',
          message: 'm1',
        },
        {
          filePath: 'commands/b.md',
          rule: 'r',
          severity: 'error',
          message: 'm2',
        },
        {
          filePath: 'commands/b.md',
          rule: 'r',
          severity: 'error',
          message: 'm3',
        },
      ];
      const output = strip(reportTerminal(results, 20));
      assert.ok(
        output.includes('3 errors in 2 files'),
        `expected "3 errors in 2 files", got: ${output}`,
      );
      assert.ok(output.includes('(20 files checked)'));
    });

    it('includes warnings in summary with "and"', () => {
      const results: ValidationResult[] = [
        {
          filePath: 'commands/a.md',
          rule: 'r',
          severity: 'error',
          message: 'm',
        },
        {
          filePath: 'commands/a.md',
          rule: 'r',
          severity: 'warning',
          message: 'w',
        },
      ];
      const output = strip(reportTerminal(results, 8));
      assert.ok(
        output.includes('1 error and 1 warning in 1 file'),
        `expected error and warning summary, got: ${output}`,
      );
    });

    it('uses plural warnings correctly', () => {
      const results: ValidationResult[] = [
        {
          filePath: 'commands/a.md',
          rule: 'r',
          severity: 'error',
          message: 'm',
        },
        {
          filePath: 'commands/a.md',
          rule: 'r',
          severity: 'warning',
          message: 'w1',
        },
        {
          filePath: 'commands/b.md',
          rule: 'r',
          severity: 'warning',
          message: 'w2',
        },
      ];
      const output = strip(reportTerminal(results, 12));
      assert.ok(
        output.includes('1 error and 2 warnings in 2 files'),
        `expected plural warnings, got: ${output}`,
      );
    });

    it('handles warnings-only (no errors)', () => {
      const results: ValidationResult[] = [
        {
          filePath: 'agents/bot.md',
          rule: 'r',
          severity: 'warning',
          message: 'w',
        },
      ];
      const output = strip(reportTerminal(results, 3));
      assert.ok(
        output.includes('1 warning in 1 file'),
        `expected "1 warning in 1 file", got: ${output}`,
      );
      assert.ok(output.includes('(3 files checked)'));
    });
  });
});
