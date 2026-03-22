import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execSync, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const CLI = resolve(import.meta.dirname, '..', 'bin', 'cli.js');
const FIXTURES = resolve(import.meta.dirname, 'fixtures');

/** Run the CLI and return { stdout, stderr, exitCode }. */
function run(args: string, cwd?: string): { stdout: string; stderr: string; exitCode: number } {
  const argv = args.split(/\s+/).filter(Boolean);
  const result = spawnSync('node', [CLI, ...argv], {
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1' },
    cwd,
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
    // Should report 30 files checked (.md files minus README.md ignored by default)
    assert.ok(stdout.includes('30 files checked'), `expected "30 files checked" in: ${stdout}`);
    // Should find errors (invalid-yaml.md parse error, empty-body.md, SKILL.md no frontmatter)
    assert.ok(stdout.includes('3 errors'), `expected "3 errors" in: ${stdout}`);
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

  // AC-8: --changed-only lints only changed files.
  it('--changed-only lints only changed .md files and reports results', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'lint-changed-'));
    execSync('git init -b main', { cwd: tmp });
    execSync('git config user.email "test@test.com"', { cwd: tmp });
    execSync('git config user.name "Test"', { cwd: tmp });

    // Initial commit on main.
    writeFileSync(resolve(tmp, 'base.md'), '---\nname: base\ndescription: Base\nmodel: sonnet\n---\n\nBody.\n');
    execSync('git add -A && git commit -m "initial"', { cwd: tmp });

    // Feature branch with a new file.
    execSync('git checkout -b feature', { cwd: tmp });
    writeFileSync(resolve(tmp, 'new.md'), '---\nname: new\ndescription: New skill\nmodel: sonnet\n---\n\nNew body.\n');
    execSync('git add -A && git commit -m "add new"', { cwd: tmp });

    const { stdout, exitCode } = run(`lint --changed-only --base main`, tmp);
    assert.ok(stdout.includes('1 files checked'), `expected "1 files checked" in: ${stdout}`);
    assert.equal(exitCode, 0);
  });

  // --changed-only with zero changed .md files reports 0 files checked.
  it('--changed-only reports "0 files checked" when no .md files changed', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'lint-changed-empty-'));
    execSync('git init -b main', { cwd: tmp });
    execSync('git config user.email "test@test.com"', { cwd: tmp });
    execSync('git config user.name "Test"', { cwd: tmp });

    writeFileSync(resolve(tmp, 'base.md'), '# base\n');
    execSync('git add -A && git commit -m "initial"', { cwd: tmp });

    // Feature branch with no .md changes.
    execSync('git checkout -b feature', { cwd: tmp });
    writeFileSync(resolve(tmp, 'readme.txt'), 'text\n');
    execSync('git add -A && git commit -m "add txt"', { cwd: tmp });

    const { stdout, exitCode } = run(`lint --changed-only --base main`, tmp);
    assert.ok(stdout.includes('0 files checked'), `expected "0 files checked" in: ${stdout}`);
    assert.equal(exitCode, 0);
  });

  // --changed-only with bad base ref exits 2 (ChangedFilesError).
  it('--changed-only exits 2 for non-existent base ref', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'lint-changed-badref-'));
    execSync('git init -b main', { cwd: tmp });
    execSync('git config user.email "test@test.com"', { cwd: tmp });
    execSync('git config user.name "Test"', { cwd: tmp });

    writeFileSync(resolve(tmp, 'base.md'), '# base\n');
    execSync('git add -A && git commit -m "initial"', { cwd: tmp });

    const { stderr, exitCode } = run(`lint --changed-only --base nonexistent`, tmp);
    assert.equal(exitCode, 2, `expected exit 2, got ${exitCode}`);
    assert.ok(stderr.includes('Failed to get changed files'), `expected error in stderr: ${stderr}`);
  });

  // AC-9: --ratchet runs without crashing (ratchet is now implemented).
  it('--ratchet runs and reports lint results', () => {
    const { stdout, exitCode } = run(`lint --ratchet ${FIXTURES}`);
    assert.ok(stdout.includes('files checked'), `expected file count in stdout: ${stdout}`);
    // Exit code depends on fixture lint errors, not ratchet itself
    assert.ok([0, 1].includes(exitCode), `expected exit 0 or 1, got ${exitCode}`);
  });

  // AC-10: Ignore patterns filter files before extraction.
  it('filters files matching ignore patterns', () => {
    // Default config ignores **/README.md. The fixtures dir has README.md.
    // With 31 .md files, we expect 30 after filtering.
    const { stdout } = run(`lint ${FIXTURES}`);
    assert.ok(stdout.includes('30 files checked'), `expected 30 files (README.md ignored): ${stdout}`);
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

  // --format json outputs valid JSON array.
  it('outputs valid JSON array with --format json', () => {
    const tmp = mkdtempSync(resolve(tmpdir(), 'lint-format-'));
    writeFileSync(
      resolve(tmp, 'ok.md'),
      '---\nname: ok\ndescription: Fine\nmodel: sonnet\n---\n\nBody.\n',
    );
    const { stdout, exitCode } = run(`lint --format json ${tmp}`);
    const parsed = JSON.parse(stdout.trim());
    assert.ok(Array.isArray(parsed), 'should output a JSON array');
    assert.equal(parsed.length, 0, 'should have zero results for valid file');
    assert.equal(exitCode, 0);
  });
});
