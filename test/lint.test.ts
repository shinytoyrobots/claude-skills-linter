import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const CLI = resolve(import.meta.dirname, '..', 'bin', 'cli.js');
const FIXTURES = resolve(import.meta.dirname, 'fixtures');

/** Run the CLI and return { stdout, stderr, exitCode }. */
function run(args: string): { stdout: string; stderr: string; exitCode: number } {
  const argv = args.split(/\s+/).filter(Boolean);
  const result = spawnSync('node', [CLI, ...argv], {
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  };
}

describe('lint command — integration', () => {
  // AC-1: Discovers files in fixtures, produces expected results.
  it('discovers .md files and reports validation results', () => {
    const { stdout, exitCode } = run(`lint ${FIXTURES}`);
    // Should report 8 files checked (9 .md files minus README.md ignored by default)
    assert.ok(stdout.includes('8 files checked'), `expected "8 files checked" in: ${stdout}`);
    // Should find errors (invalid-yaml.md parse error, empty-body.md)
    assert.ok(stdout.includes('2 errors'), `expected "2 errors" in: ${stdout}`);
    assert.equal(exitCode, 1, 'should exit 1 when errors exist');
  });

  // AC-4: Errors -> exit code 1.
  it('exits 1 when validation errors exist', () => {
    const { exitCode } = run(`lint ${FIXTURES}`);
    assert.equal(exitCode, 1);
  });

  // AC-5: All valid -> exit code 0.
  it('exits 0 when all files are valid', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'lint-valid-'));
    writeFileSync(
      resolve(tmp, 'good.md'),
      '---\nname: good\ndescription: A good file\nmodel: sonnet\n---\n\nSome body text.\n',
    );
    const { exitCode, stdout } = run(`lint ${tmp}`);
    assert.equal(exitCode, 0, `expected exit 0, got ${exitCode}. stdout: ${stdout}`);
    assert.ok(stdout.includes('1 files checked'), `expected files checked in: ${stdout}`);
  });

  // AC-3: --strict with warnings -> exit 1.
  // Note: Level 0 rules produce errors, not warnings.
  // We test by building a scenario that would normally pass but
  // has a warning. Since current rules only produce errors, we verify
  // the --strict flag is accepted and the pipeline runs.
  it('accepts --strict flag and runs successfully', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'lint-strict-'));
    writeFileSync(
      resolve(tmp, 'ok.md'),
      '---\nname: ok\ndescription: Fine\nmodel: sonnet\n---\n\nBody.\n',
    );
    const { exitCode } = run(`lint --strict ${tmp}`);
    assert.equal(exitCode, 0, 'should exit 0 when no warnings or errors with --strict');
  });

  // AC-8: --changed-only prints stub message and exits 0.
  it('prints "Not yet implemented" for --changed-only and exits 0', () => {
    const { stderr, exitCode } = run(`lint --changed-only ${FIXTURES}`);
    assert.ok(stderr.includes('Not yet implemented'), `expected stub message in stderr: ${stderr}`);
    assert.equal(exitCode, 0);
  });

  // AC-9: --ratchet prints stub message and exits 0.
  it('prints "Not yet implemented" for --ratchet and exits 0', () => {
    const { stderr, exitCode } = run(`lint --ratchet ${FIXTURES}`);
    assert.ok(stderr.includes('Not yet implemented'), `expected stub message in stderr: ${stderr}`);
    assert.equal(exitCode, 0);
  });

  // AC-10: Ignore patterns filter files before extraction.
  it('filters files matching ignore patterns', () => {
    // Default config ignores **/README.md. The fixtures dir has README.md.
    // With 9 .md files, we expect 8 after filtering.
    const { stdout } = run(`lint ${FIXTURES}`);
    assert.ok(stdout.includes('8 files checked'), `expected 8 files (README.md ignored): ${stdout}`);
  });

  // AC-11: Empty directory -> 0 files checked, exit 0.
  it('reports "0 files checked" for empty directory and exits 0', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'lint-empty-'));
    const { stdout, exitCode } = run(`lint ${tmp}`);
    assert.ok(stdout.includes('0 files checked'), `expected "0 files checked" in: ${stdout}`);
    assert.equal(exitCode, 0);
  });

  // AC-6: ConfigError -> exit code 2.
  it('exits 2 with descriptive message for invalid config', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'lint-badconfig-'));
    // Write an invalid .skill-lint.yaml
    writeFileSync(resolve(tmp, '.skill-lint.yaml'), '{ invalid yaml: [');
    writeFileSync(resolve(tmp, 'test.md'), '---\nname: test\n---\n\nBody.\n');
    const { stderr, exitCode } = run(`lint ${tmp}`);
    assert.equal(exitCode, 2, `expected exit 2 for config error, got ${exitCode}`);
    assert.ok(stderr.includes('Invalid YAML'), `expected config error message in stderr: ${stderr}`);
  });

  // Additional: --format json prints stub message but still produces terminal output.
  it('prints stub message for --format json and falls through to terminal', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'lint-format-'));
    writeFileSync(
      resolve(tmp, 'ok.md'),
      '---\nname: ok\ndescription: Fine\nmodel: sonnet\n---\n\nBody.\n',
    );
    const { stderr, stdout, exitCode } = run(`lint --format json ${tmp}`);
    assert.ok(stderr.includes('Not yet implemented'), `expected stub in stderr: ${stderr}`);
    assert.ok(stdout.includes('files checked'), `expected terminal output in stdout: ${stdout}`);
    assert.equal(exitCode, 0);
  });
});
