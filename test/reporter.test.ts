import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import chalk from 'chalk';
import { reportTerminal, reportGitHub, reportJSON } from '../src/reporter.js';
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

describe('reportGitHub', () => {
  const rootDir = '/home/runner/work/skills-repo/skills-repo';

  // AC-1: error annotation format
  it('formats errors as ::error annotations', () => {
    const results: ValidationResult[] = [
      {
        filePath: `${rootDir}/commands/cpo-lno.md`,
        rule: 'required-fields-command',
        severity: 'error',
        message: 'description is required',
      },
    ];
    const output = reportGitHub(results, rootDir);
    assert.equal(
      output,
      '::error file=commands/cpo-lno.md::description is required (required-fields-command)',
    );
  });

  // AC-2: warning annotation format
  it('formats warnings as ::warning annotations', () => {
    const results: ValidationResult[] = [
      {
        filePath: `${rootDir}/agents/dt-backend-dev.md`,
        rule: 'file-size-limit',
        severity: 'warning',
        message: 'file size exceeds 15KB limit',
      },
    ];
    const output = reportGitHub(results, rootDir);
    assert.equal(
      output,
      '::warning file=agents/dt-backend-dev.md::file size exceeds 15KB limit (file-size-limit)',
    );
  });

  // AC-3: zero results → empty string
  it('returns empty string for zero results', () => {
    const output = reportGitHub([], rootDir);
    assert.equal(output, '');
  });

  // AC-4: repo-relative paths (strip rootDir prefix)
  it('strips rootDir prefix to produce repo-relative paths', () => {
    const results: ValidationResult[] = [
      {
        filePath: `${rootDir}/deep/nested/file.md`,
        rule: 'some-rule',
        severity: 'error',
        message: 'some issue',
      },
    ];
    const output = reportGitHub(results, rootDir);
    assert.ok(output.includes('file=deep/nested/file.md'));
    assert.ok(!output.includes(rootDir));
  });

  // AC-6: info → ::notice format
  it('formats info severity as ::notice annotations', () => {
    const results: ValidationResult[] = [
      {
        filePath: `${rootDir}/context/overview.md`,
        rule: 'info-rule',
        severity: 'info',
        message: 'informational note',
      },
    ];
    const output = reportGitHub(results, rootDir);
    assert.equal(
      output,
      '::notice file=context/overview.md::informational note (info-rule)',
    );
  });

  // Line number in annotation when present
  it('includes line number when present in result', () => {
    const results: ValidationResult[] = [
      {
        filePath: `${rootDir}/commands/setup.md`,
        rule: 'required-fields',
        severity: 'error',
        message: 'name is required',
        line: 3,
      },
    ];
    const output = reportGitHub(results, rootDir);
    assert.equal(
      output,
      '::error file=commands/setup.md,line=3::name is required (required-fields)',
    );
  });

  it('omits line parameter when line is not present', () => {
    const results: ValidationResult[] = [
      {
        filePath: `${rootDir}/commands/setup.md`,
        rule: 'required-fields',
        severity: 'error',
        message: 'name is required',
      },
    ];
    const output = reportGitHub(results, rootDir);
    assert.ok(!output.includes(',line='));
  });

  // Special character escaping
  it('escapes special characters in messages', () => {
    const results: ValidationResult[] = [
      {
        filePath: `${rootDir}/commands/test.md`,
        rule: 'test-rule',
        severity: 'error',
        message: '100% complete\nline two\rcarriage',
      },
    ];
    const output = reportGitHub(results, rootDir);
    assert.ok(output.includes('100%25 complete%0Aline two%0Dcarriage'));
    assert.ok(!output.includes('\n'));
    assert.ok(!output.includes('\r'));
  });

  // Multiple results produce multiple lines
  it('outputs multiple annotations separated by newlines', () => {
    const results: ValidationResult[] = [
      {
        filePath: `${rootDir}/commands/a.md`,
        rule: 'rule-a',
        severity: 'error',
        message: 'error a',
      },
      {
        filePath: `${rootDir}/agents/b.md`,
        rule: 'rule-b',
        severity: 'warning',
        message: 'warning b',
      },
    ];
    const output = reportGitHub(results, rootDir);
    const lines = output.split('\n');
    assert.equal(lines.length, 2);
    assert.ok(lines[0].startsWith('::error'));
    assert.ok(lines[1].startsWith('::warning'));
  });

  // rootDir with trailing slash
  it('handles rootDir with trailing slash', () => {
    const results: ValidationResult[] = [
      {
        filePath: `${rootDir}/commands/test.md`,
        rule: 'r',
        severity: 'error',
        message: 'm',
      },
    ];
    const output = reportGitHub(results, rootDir + '/');
    assert.ok(output.includes('file=commands/test.md'));
  });
});

describe('story-024: progressive profiles in reporter', () => {
  beforeEach(() => {
    chalk.level = 1;
  });

  // AC-7: Terminal format includes effective level as [level N] in file header
  it('AC-7: terminal format includes [level N] in file header when effectiveLevel present', () => {
    const results: ValidationResult[] = [
      {
        filePath: 'commands/foo.md',
        rule: 'model-enum',
        severity: 'error',
        message: 'invalid model',
        effectiveLevel: 2,
      },
    ];
    const output = strip(reportTerminal(results, 5));
    assert.ok(output.includes('[level 2]'), `Expected [level 2] in output, got: ${output}`);
    assert.ok(output.includes('commands/foo.md'), 'should include file path');
  });

  it('AC-7: terminal format omits level tag when effectiveLevel not present', () => {
    const results: ValidationResult[] = [
      {
        filePath: 'commands/foo.md',
        rule: 'model-enum',
        severity: 'error',
        message: 'invalid model',
      },
    ];
    const output = strip(reportTerminal(results, 5));
    assert.ok(!output.includes('[level'), `Should not include level tag, got: ${output}`);
  });

  it('AC-7: terminal format shows [level 0] correctly', () => {
    const results: ValidationResult[] = [
      {
        filePath: 'commands/bar.md',
        rule: 'non-empty-body',
        severity: 'error',
        message: 'body is empty',
        effectiveLevel: 0,
      },
    ];
    const output = strip(reportTerminal(results, 3));
    assert.ok(output.includes('[level 0]'), `Expected [level 0] in output, got: ${output}`);
  });

  // AC-8: JSON format includes effectiveLevel in each ValidationResult
  it('AC-8: JSON format includes effectiveLevel when present', () => {
    const results: ValidationResult[] = [
      {
        filePath: 'commands/foo.md',
        rule: 'model-enum',
        severity: 'error',
        message: 'invalid model',
        effectiveLevel: 2,
      },
    ];
    const json = reportJSON(results);
    const parsed = JSON.parse(json);
    assert.equal(parsed[0].effectiveLevel, 2);
  });

  it('AC-8: JSON format omits effectiveLevel when not present', () => {
    const results: ValidationResult[] = [
      {
        filePath: 'commands/foo.md',
        rule: 'model-enum',
        severity: 'error',
        message: 'invalid model',
      },
    ];
    const json = reportJSON(results);
    const parsed = JSON.parse(json);
    assert.equal(parsed[0].effectiveLevel, undefined);
  });
});
