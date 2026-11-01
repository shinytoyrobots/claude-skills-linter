import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyFile } from '../src/classify.js';
import { detectFormat } from '../src/detect-format.js';
import { getDefaults } from '../src/config.js';
import { extractAll } from '../src/extract.js';
import { validateGraph } from '../src/validate-graph.js';
import { validateFrontmatter } from '../src/validate-frontmatter.js';
import { getChangedFiles } from '../src/changed-files.js';
import type { Config, ValidationResult } from '../src/types.js';

const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'cli.js');
const CONFIG = 'format: suite-monorepo\nignore:\n  - "**/.claude/**"\n  - "**/reference/**"\n';

type Tree = Record<string, string>;

const skill = (name: string, body = 'Body.', extraFrontmatter = ''): string =>
  `---\nname: ${name}\ndescription: A skill\n${extraFrontmatter}---\n\n${body}\n`;
const command = (body = 'Body.'): string => `---\ndescription: A command\n---\n\n${body}\n`;
const context = (text = 'Context.'): string => `---\ndescription: Context\n---\n\n${text}\n`;

function makeRepo(tree: Tree): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'suite-monorepo-')));
  for (const [path, content] of Object.entries({ '.skill-lint.yaml': CONFIG, ...tree })) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
  return root;
}

async function graph(root: string, format: Config['format'] = 'suite-monorepo'): Promise<ValidationResult[]> {
  const files = await extractAll([`${root}/**/*.md`], ['**/.claude/**', '**/reference/**']);
  return validateGraph(files, { ...getDefaults(), format, ignore: [] }, root);
}

const withRule = (results: ValidationResult[], rule: string): ValidationResult[] =>
  results.filter((r) => r.rule === rule);

const roots: string[] = [];
function repo(tree: Tree): string {
  const root = makeRepo(tree);
  roots.push(root);
  return root;
}
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('classifyFile: references', () => {
  it('classifies files under skills/{name}/references/ as reference', () => {
    assert.equal(classifyFile('suite/skills/foo/references/bar.md', false), 'reference');
    assert.equal(classifyFile('suite/skills/foo/references/nested/bar.md', true), 'reference');
    assert.equal(classifyFile('suite/skills/foo/references/context/bar.md', true), 'reference');
  });

  it('leaves a references/ directory outside a skill as it was', () => {
    assert.equal(classifyFile('docs/references/bar.md', false), 'unknown');
    assert.equal(classifyFile('suite/context/references/bar.md', false), 'context');
  });

  it('keeps README.md as readme', () => {
    assert.equal(classifyFile('suite/skills/foo/references/README.md', false), 'readme');
  });
});

describe('detectFormat: suite-monorepo', () => {
  it('is accepted as an explicit override', () => {
    const root = repo({});
    assert.equal(detectFormat(root, { ...getDefaults(), format: 'suite-monorepo' }), 'suite-monorepo');
  });
});

describe('graph: both path forms', () => {
  const tree: Tree = {
    's/context/shared-a.md': context(),
    's/context/shared-b.md': context('Other context.'),
    's/agents/worker.md': '---\nname: worker\ndescription: An agent\n---\n\nWork.\n',
    's/agents/helper.md': '---\nname: helper\ndescription: An agent\n---\n\nHelp.\n',
  };

  it('resolves old and new forms from a command and a skill, with no orphans', async () => {
    const root = repo({
      ...tree,
      's/commands/old.md': command('Read `~/.claude/commands/context/shared-a.md` and `~/.claude/agents/worker.md`.'),
      's/skills/new/SKILL.md': skill('new', 'Read `~/.claude/context/shared-b.md` and `~/.claude/commands/agents/helper.md`.'),
    });
    assert.deepEqual(await graph(root), []);
  });

  it('counts a skill as the only referrer of a context file', async () => {
    const root = repo({
      's/context/only.md': context(),
      's/skills/new/SKILL.md': skill('new', 'Read `~/.claude/context/only.md`.'),
    });
    assert.deepEqual(withRule(await graph(root), 'orphaned-file'), []);
  });

  it('flags a new-form path whose target is gone', async () => {
    const root = repo({ 's/skills/new/SKILL.md': skill('new', 'Read `~/.claude/context/gone.md`.') });
    const broken = withRule(await graph(root), 'broken-reference');
    assert.equal(broken.length, 1);
    assert.match(broken[0].message, /context\/gone\.md/);
  });

  it('resolves ~/.claude/skills/{name}/SKILL.md, and flags one for a missing skill', async () => {
    const root = repo({
      's/skills/a/SKILL.md': skill('a', 'See `~/.claude/skills/b/SKILL.md` and `~/.claude/skills/gone/SKILL.md`.'),
      's/skills/b/SKILL.md': skill('b'),
    });
    const broken = withRule(await graph(root), 'broken-reference');
    assert.equal(broken.length, 1);
    assert.match(broken[0].message, /skills\/gone/);
  });

  it('does not read ~/.claude/commands/{name}.md as a reference', async () => {
    const root = repo({ 's/skills/a/SKILL.md': skill('a', 'Layout: `~/.claude/commands/x.md`.') });
    assert.deepEqual(await graph(root), []);
  });

  it('leaves new-form paths unread in legacy-commands', async () => {
    const root = repo({ 's/commands/a.md': command('Read `~/.claude/context/gone.md`.') });
    assert.deepEqual(withRule(await graph(root, 'legacy-commands'), 'broken-reference'), []);
  });
});

describe('graph: references/', () => {
  it('resolves every local form and credits the file as referenced', async () => {
    const root = repo({
      's/skills/a/SKILL.md': skill('a', [
        'One: `references/one.md`.',
        'Two: `${CLAUDE_SKILL_DIR}/references/two.md`.',
        'Three: `./references/three.md`.',
        'Four: [four](references/four.md#section).',
        'Five: `~/.claude/skills/a/references/five.md`.',
        'Nested: `references/deep/six.md`.',
      ].join('\n')),
      's/skills/a/references/one.md': 'No frontmatter.\n',
      's/skills/a/references/two.md': 'No frontmatter 2.\n',
      's/skills/a/references/three.md': 'No frontmatter 3.\n',
      's/skills/a/references/four.md': 'No frontmatter 4.\n',
      's/skills/a/references/five.md': 'No frontmatter 5.\n',
      's/skills/a/references/deep/six.md': 'No frontmatter 6.\n',
    });
    assert.deepEqual(await graph(root), []);
  });

  it('does not treat a stale ~/.claude/context/ path as the moved file', async () => {
    const root = repo({
      's/skills/a/SKILL.md': skill('a', 'Read `~/.claude/context/canon.md`. Also `references/canon.md`.'),
      's/skills/a/references/canon.md': 'Canon.\n',
    });
    const broken = withRule(await graph(root), 'broken-reference');
    assert.equal(broken.length, 1);
    assert.match(broken[0].message, /context\/canon\.md/);
  });

  it('lets two skills have same-named references', async () => {
    const root = repo({
      's/skills/a/SKILL.md': skill('a', 'See `references/EXAMPLES.md`.'),
      's/skills/a/references/EXAMPLES.md': 'For a.\n',
      't/skills/b/SKILL.md': skill('b', 'See `references/EXAMPLES.md`.'),
      't/skills/b/references/EXAMPLES.md': 'For b.\n',
    });
    assert.deepEqual(await graph(root), []);
  });

  it('reports a reference with no reader as orphaned', async () => {
    const root = repo({
      's/skills/a/SKILL.md': skill('a'),
      's/skills/a/references/unread.md': 'Unread.\n',
    });
    const orphans = withRule(await graph(root), 'orphaned-file');
    assert.equal(orphans.length, 1);
    assert.match(orphans[0].filePath, /unread\.md$/);
  });

  it('flags a missing reference', async () => {
    const root = repo({ 's/skills/a/SKILL.md': skill('a', 'See `references/gone.md`.') });
    assert.equal(withRule(await graph(root), 'broken-reference').length, 1);
  });

  it('flags a stale singular reference/ path', async () => {
    const root = repo({ 's/skills/a/SKILL.md': skill('a', 'See `reference/gone.md`.') });
    assert.equal(withRule(await graph(root), 'broken-reference').length, 1);
  });

  it('does not let another skill reach a reference by its installed path', async () => {
    const root = repo({
      's/skills/a/SKILL.md': skill('a', 'See `references/own.md`.'),
      's/skills/a/references/own.md': 'Own.\n',
      's/skills/b/SKILL.md': skill('b', 'See `~/.claude/skills/a/references/own.md`.'),
      's/commands/c.md': command('See `~/.claude/skills/a/references/own.md`.'),
    });
    const broken = withRule(await graph(root), 'broken-reference');
    assert.equal(broken.length, 2);
    assert.match(broken[0].message, /bundled with skill "a"/);
  });

  it('flags a relative path out of the skill directory, even when the target exists', async () => {
    const root = repo({
      's/skills/a/SKILL.md': skill('a', 'See [x](../../reference/a/x.md) and [y](../b/references/y.md).'),
      's/reference/a/x.md': 'X.\n',
      's/skills/b/SKILL.md': skill('b', 'See `references/y.md`.'),
      's/skills/b/references/y.md': 'Y.\n',
    });
    const broken = withRule(await graph(root), 'broken-reference');
    assert.equal(broken.length, 2);
    assert.match(broken[0].message, /leaves the skill directory/);
  });

  it('does not double-report a broken markdown link', async () => {
    const root = repo({ 's/skills/a/SKILL.md': skill('a', 'See [x](references/gone.md) and [y](${CLAUDE_SKILL_DIR}/references/gone2.md).') });
    assert.equal(withRule(await graph(root), 'broken-reference').length, 2);
  });

  it('credits a reader in a fence, without checking fenced bare paths', async () => {
    const root = repo({
      's/skills/a/SKILL.md': skill('a', '```bash\ncat references/used.md\ncat references/example.md\n```'),
      's/skills/a/references/used.md': 'Used.\n',
    });
    assert.deepEqual(await graph(root), []);
  });

  it('checks ${CLAUDE_SKILL_DIR} paths inside a fence', async () => {
    const root = repo({ 's/skills/a/SKILL.md': skill('a', '```bash\ncat ${CLAUDE_SKILL_DIR}/references/gone.md\n```') });
    assert.equal(withRule(await graph(root), 'broken-reference').length, 1);
  });

  it('ignores syntax illustrations in inline code', async () => {
    const root = repo({
      's/skills/a/SKILL.md': skill('a', 'Relative links like `./sibling.md`, and `[text](note-name.md)`.'),
    });
    assert.deepEqual(await graph(root), []);
  });

  it('skips placeholder paths', async () => {
    const root = repo({ 's/skills/a/SKILL.md': skill('a', 'Look in ./{skill}.md or ./<name>.md or ../*.md.') });
    assert.deepEqual(await graph(root), []);
  });

  it('still checks non-.md bundle files', async () => {
    const root = repo({ 's/skills/a/SKILL.md': skill('a', 'Run `scripts/gone.sh`.') });
    assert.equal(withRule(await graph(root), 'broken-reference').length, 1);
  });
});

describe('graph: unmigrated commands', () => {
  it('does not resolve relative links from a command', async () => {
    const root = repo({
      's/commands/a.md': command('See [x](../reference/a/GONE.md) and `references/gone.md`.'),
    });
    assert.deepEqual(await graph(root), []);
  });

  it('flags a reference from a reference file to a missing context file', async () => {
    const root = repo({
      's/skills/a/SKILL.md': skill('a', 'See `references/r.md`.'),
      's/skills/a/references/r.md': 'Read `~/.claude/context/gone.md`.\n',
    });
    assert.equal(withRule(await graph(root), 'broken-reference').length, 1);
  });

  it('counts a reference file as a referrer', async () => {
    const root = repo({
      's/context/c.md': context(),
      's/skills/a/SKILL.md': skill('a', 'See `references/r.md`.'),
      's/skills/a/references/r.md': 'Read `~/.claude/context/c.md`.\n',
    });
    assert.deepEqual(await graph(root), []);
  });

  it('does not resolve relative links from a reference file', async () => {
    const root = repo({
      's/skills/a/SKILL.md': skill('a', 'See `references/r.md`.'),
      's/skills/a/references/r.md': 'Syntax: [x](./example.md).\n',
    });
    assert.deepEqual(await graph(root), []);
  });
});

describe('name must equal directory', () => {
  const file = (name: string) => ({
    filePath: '/repo/s/skills/real/SKILL.md',
    fileType: 'skill' as const,
    errors: [],
    data: {
      name,
      description: 'A skill',
      '___body_length': 5,
      '___has_frontmatter': true,
      '___file_size': 50,
      '___body_text': 'Body.',
      '___file_path': '/repo/s/skills/real/SKILL.md',
      '___file_type': 'skill',
    },
  });

  it('is an error at Level 0 in suite-monorepo', async () => {
    const results = await validateFrontmatter([file('other')], 0, undefined, { format: 'suite-monorepo' });
    const hit = withRule(results, 'name-dir-mismatch');
    assert.equal(hit.length, 1);
    assert.equal(hit[0].severity, 'error');
  });

  it('passes when they match', async () => {
    const results = await validateFrontmatter([file('real')], 0, undefined, { format: 'suite-monorepo' });
    assert.deepEqual(results, []);
  });

  it('stays quiet at Level 0 in other formats', async () => {
    const results = await validateFrontmatter([file('other')], 0, undefined, { format: 'project-skills' });
    assert.deepEqual(withRule(results, 'name-dir-mismatch'), []);
  });

  it('is an error from the graph pass too', async () => {
    const root = repo({ 's/skills/real/SKILL.md': skill('other') });
    const hit = withRule(await graph(root), 'name-dir-mismatch');
    assert.equal(hit[0].severity, 'error');
  });
});

describe('skill schema', () => {
  const file = (data: Record<string, unknown>) => ({
    filePath: '/repo/s/skills/real/SKILL.md',
    fileType: 'skill' as const,
    errors: [],
    data: {
      name: 'real',
      description: 'A skill',
      '___body_length': 5,
      '___has_frontmatter': true,
      '___file_size': 50,
      '___body_text': 'Body.',
      '___file_path': '/repo/s/skills/real/SKILL.md',
      '___file_type': 'skill',
      ...data,
    },
  });

  it('accepts custom frontmatter keys', async () => {
    const results = await validateFrontmatter(
      [file({ 'capability-class': 'x', tier: 2, 'works-with': ['a'], 'requires-context': ['b.md'] })],
      0,
    );
    assert.deepEqual(results, []);
  });

  it('accepts a model string, and rejects a non-string', async () => {
    assert.deepEqual(await validateFrontmatter([file({ model: 'sonnet' })], 0), []);
    const bad = await validateFrontmatter([file({ model: 3 })], 0);
    assert.equal(withRule(bad, 'required-fields-skill').length, 1);
  });
});

describe('CLI against a repo on disk', () => {
  const run = (cwd: string, ...args: string[]) =>
    spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf-8' });

  it('sees no duplicates through .claude/skills directory symlinks', () => {
    const root = repo({
      's/skills/a/SKILL.md': skill('a', 'See `references/r.md`.'),
      's/skills/a/references/r.md': 'R.\n',
    });
    mkdirSync(join(root, '.claude', 'skills'), { recursive: true });
    symlinkSync('../../s/skills/a', join(root, '.claude', 'skills', 'a'));
    for (const cmd of ['lint', 'graph']) {
      const result = run(root, cmd, '--strict');
      assert.equal(result.status, 0, result.stdout + result.stderr);
      assert.match(result.stdout, /2 files checked/);
    }
  });

  it('--fail-on-empty fails lint and graph with no files, and only with the flag', () => {
    const root = repo({});
    for (const cmd of ['lint', 'graph']) {
      assert.equal(run(root, cmd).status, 0);
      const failed = run(root, cmd, '--fail-on-empty');
      assert.equal(failed.status, 1);
      assert.match(failed.stderr, /--fail-on-empty/);
    }
  });

  it('--fail-on-empty passes when files were checked', () => {
    const root = repo({ 's/skills/a/SKILL.md': skill('a') });
    for (const cmd of ['lint', 'graph']) {
      assert.equal(run(root, cmd, '--fail-on-empty').status, 0);
    }
  });

  it('--changed-only reports a nonzero count on a rename with an edit', () => {
    const root = repo({ 's/commands/a.md': command('A body long enough to be detected as a rename of the same file.') });
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git('init', '-b', 'main');
    git('config', 'user.email', 'test@test.com');
    git('config', 'user.name', 'Test');
    git('add', '-A');
    git('commit', '-m', 'base');
    git('checkout', '-b', 'move');
    mkdirSync(join(root, 's/skills/a'), { recursive: true });
    git('mv', 's/commands/a.md', 's/skills/a/SKILL.md');
    writeFileSync(
      join(root, 's/skills/a/SKILL.md'),
      skill('a', 'A body long enough to be detected as a rename of the same file.').replace('A skill', 'A command'),
    );
    git('add', '-A');
    git('commit', '-m', 'move');

    const status = execFileSync('git', ['diff', '--name-status', 'main...HEAD'], { cwd: root, encoding: 'utf-8' });
    assert.match(status, /^R/, 'fixture must be a rename');

    const cwd = process.cwd();
    process.chdir(root);
    try {
      assert.deepEqual(getChangedFiles('main'), [join(root, 's/skills/a/SKILL.md')]);
    } finally {
      process.chdir(cwd);
    }

    const result = run(root, 'lint', '--changed-only', '--base', 'main', '--fail-on-empty');
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /1 files? checked/);
  });
});
