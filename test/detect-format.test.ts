import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { detectFormat } from '../src/detect-format.js';
import { ConfigError } from '../src/config.js';
import type { Config } from '../src/types.js';

function makeTmpDir(): string {
  return mkdtempSync(join(tmpdir(), 'skill-lint-detect-'));
}

/** Returns a minimal Config with optional overrides. */
function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    skills_root: '.',
    default_level: 0,
    levels: {},
    tools: { mcp_pattern: 'mcp__*', custom: [] },
    models: ['opus', 'sonnet', 'haiku'],
    limits: { max_file_size: 15360 },
    ignore: ['**/README.md'],
    prefixes: 'PREFIXES.md',
    graph: {
      warn_orphans: true,
      warn_fanout_above: 50000,
      detect_cycles: true,
      detect_duplicates: true,
    },
    ...overrides,
  };
}

/** Create a directory structure from a list of file paths. */
function createFiles(root: string, paths: string[], contents?: Record<string, string>): void {
  for (const p of paths) {
    const full = join(root, p);
    const dir = full.substring(0, full.lastIndexOf('/'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(full, contents?.[p] ?? '{}');
  }
}

/** Create directories without files. */
function createDirs(root: string, dirs: string[]): void {
  for (const d of dirs) {
    mkdirSync(join(root, d), { recursive: true });
  }
}

describe('detectFormat', () => {
  let tmp: string;
  let stderrOutput: string;
  let originalWrite: typeof process.stderr.write;

  beforeEach(() => {
    tmp = makeTmpDir();
    stderrOutput = '';
    originalWrite = process.stderr.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrOutput += String(chunk);
      return true;
    }) as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalWrite;
    rmSync(tmp, { recursive: true, force: true });
  });

  // --- AC-1: multi-plugin detection ---

  describe('AC-1: multi-plugin format', () => {
    it('detects multi-plugin when marketplace.json and plugins with plugin.json exist', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'plugins/foo/.claude-plugin/plugin.json',
      ]);

      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'multi-plugin');
    });

    it('detects multi-plugin with multiple plugin subdirectories', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'plugins/foo/.claude-plugin/plugin.json',
        'plugins/bar/.claude-plugin/plugin.json',
      ]);

      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'multi-plugin');
    });

    it('does not detect multi-plugin when plugins/ has no subdirectory with plugin.json', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
      ]);
      createDirs(tmp, ['plugins/foo']);

      const result = detectFormat(tmp, makeConfig());
      // Should fall through — no plugin.json inside plugins/foo
      assert.notEqual(result, 'multi-plugin');
    });
  });

  // --- AC-2: plugin format ---

  describe('AC-2: plugin format', () => {
    it('detects plugin when marketplace.json and skills/*/SKILL.md exist', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'skills/my-skill/SKILL.md',
      ]);

      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'plugin');
    });

    it('does not detect plugin when skills dir has no SKILL.md files', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'skills/my-skill/other.md',
      ]);

      const result = detectFormat(tmp, makeConfig());
      assert.notEqual(result, 'plugin');
    });

    it('does not detect plugin without marketplace.json', () => {
      createFiles(tmp, [
        'skills/my-skill/SKILL.md',
      ]);

      // Has legacy dirs? No, so fallback
      const result = detectFormat(tmp, makeConfig());
      assert.notEqual(result, 'plugin');
    });
  });

  // --- AC-3: legacy-commands format ---

  describe('AC-3: legacy-commands format', () => {
    it('detects legacy-commands when commands/ exists', () => {
      createDirs(tmp, ['commands']);
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'legacy-commands');
      assert.equal(stderrOutput, '');
    });

    it('detects legacy-commands when agents/ exists', () => {
      createDirs(tmp, ['agents']);
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'legacy-commands');
    });

    it('detects legacy-commands when context/ exists', () => {
      createDirs(tmp, ['context']);
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'legacy-commands');
    });

    it('detects legacy-commands when multiple legacy dirs exist', () => {
      createDirs(tmp, ['commands', 'agents', 'context']);
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'legacy-commands');
    });
  });

  // --- AC-4: config override ---

  describe('AC-4: config override', () => {
    it('uses format from config and skips auto-detection', () => {
      // Set up a multi-plugin repo structure
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'plugins/foo/.claude-plugin/plugin.json',
      ]);

      // But config overrides to legacy-commands
      const result = detectFormat(tmp, makeConfig({ format: 'legacy-commands' }));
      assert.equal(result, 'legacy-commands');
    });

    it('respects plugin format override', () => {
      const result = detectFormat(tmp, makeConfig({ format: 'plugin' }));
      assert.equal(result, 'plugin');
    });

    it('respects multi-plugin format override', () => {
      const result = detectFormat(tmp, makeConfig({ format: 'multi-plugin' }));
      assert.equal(result, 'multi-plugin');
    });
  });

  // --- AC-5: fallback with warning ---

  describe('AC-5: fallback to legacy-commands with warning', () => {
    it('defaults to legacy-commands when no signals found', () => {
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'legacy-commands');
    });

    it('logs a warning to stderr when falling back', () => {
      detectFormat(tmp, makeConfig());
      assert.ok(stderrOutput.includes('No recognized repo format signals found'));
      assert.ok(stderrOutput.includes('defaulting to legacy-commands'));
    });
  });

  // --- AC-6: RepoFormat return type ---

  describe('AC-6: RepoFormat return type', () => {
    it('returns a valid RepoFormat string for multi-plugin', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'plugins/foo/.claude-plugin/plugin.json',
      ]);
      const result = detectFormat(tmp, makeConfig());
      assert.ok(['legacy-commands', 'plugin', 'multi-plugin', 'project-skills'].includes(result));
    });

    it('returns a valid RepoFormat string for legacy-commands', () => {
      createDirs(tmp, ['commands']);
      const result = detectFormat(tmp, makeConfig());
      assert.ok(['legacy-commands', 'plugin', 'multi-plugin', 'project-skills'].includes(result));
    });

    it('returns a valid RepoFormat string for project-skills', () => {
      createFiles(tmp, ['.claude/skills/my-skill/SKILL.md']);
      const result = detectFormat(tmp, makeConfig());
      assert.ok(['legacy-commands', 'plugin', 'multi-plugin', 'project-skills'].includes(result));
    });
  });

  // --- AC-7: hybrid repo ---

  describe('AC-7: hybrid repo prefers plugin format', () => {
    it('prefers multi-plugin over legacy-commands in hybrid repo', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'plugins/foo/.claude-plugin/plugin.json',
      ]);
      createDirs(tmp, ['commands', 'agents']);

      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'multi-plugin');
    });

    it('prefers plugin over legacy-commands in hybrid repo', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'skills/my-skill/SKILL.md',
      ]);
      createDirs(tmp, ['commands']);

      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'plugin');
    });
  });

  // --- AC-8: malformed marketplace.json ---

  describe('AC-8: malformed marketplace.json', () => {
    it('falls through to legacy-commands when marketplace.json is malformed', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'plugins/foo/.claude-plugin/plugin.json',
      ], {
        '.claude-plugin/marketplace.json': '{ bad json {{',
      });
      createDirs(tmp, ['commands']);

      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'legacy-commands');
    });

    it('logs a warning for malformed marketplace.json', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
      ], {
        '.claude-plugin/marketplace.json': 'not json at all',
      });
      createDirs(tmp, ['commands']);

      detectFormat(tmp, makeConfig());
      assert.ok(stderrOutput.includes('malformed JSON'));
    });

    it('does not throw for malformed marketplace.json', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
      ], {
        '.claude-plugin/marketplace.json': '{{{{',
      });

      // Should not throw
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'legacy-commands');
    });
  });

  // --- AC-9: invalid config format value ---

  describe('AC-9: invalid config format value', () => {
    it('throws ConfigError for unrecognized format value', () => {
      assert.throws(
        () => detectFormat(tmp, makeConfig({ format: 'banana' as never })),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.ok(err.message.includes('banana'));
          assert.ok(err.message.includes('Invalid format'));
          return true;
        },
      );
    });

    it('throws ConfigError with valid format options in message', () => {
      assert.throws(
        () => detectFormat(tmp, makeConfig({ format: 'unknown' as never })),
        (err: unknown) => {
          assert.ok(err instanceof ConfigError);
          assert.ok(err.message.includes('legacy-commands'));
          assert.ok(err.message.includes('plugin'));
          assert.ok(err.message.includes('multi-plugin'));
          assert.ok(err.message.includes('project-skills'));
          return true;
        },
      );
    });
  });

  // --- Story-031: project-skills format ---

  describe('story-031 AC-1: .claude/skills/ with SKILL.md detects project-skills', () => {
    it('detects project-skills when .claude/skills/*/SKILL.md exists', () => {
      createFiles(tmp, ['.claude/skills/my-skill/SKILL.md']);
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'project-skills');
    });

    it('detects project-skills with multiple skill subdirectories', () => {
      createFiles(tmp, [
        '.claude/skills/skill-a/SKILL.md',
        '.claude/skills/skill-b/SKILL.md',
      ]);
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'project-skills');
    });
  });

  describe('story-031 AC-2: project-skills wins over legacy dirs', () => {
    it('prefers project-skills over legacy-commands when both exist', () => {
      createFiles(tmp, ['.claude/skills/my-skill/SKILL.md']);
      createDirs(tmp, ['commands', 'agents', 'context']);
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'project-skills');
    });

    it('prefers project-skills over legacy commands/ alone', () => {
      createFiles(tmp, ['.claude/skills/my-skill/SKILL.md']);
      createDirs(tmp, ['commands']);
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'project-skills');
    });
  });

  describe('story-031 AC-3: marketplace wins over project-skills', () => {
    it('prefers plugin over project-skills when marketplace.json exists', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'skills/my-skill/SKILL.md',
        '.claude/skills/my-skill/SKILL.md',
      ]);
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'plugin');
    });

    it('prefers multi-plugin over project-skills when marketplace.json exists', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'plugins/foo/.claude-plugin/plugin.json',
        '.claude/skills/my-skill/SKILL.md',
      ]);
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'multi-plugin');
    });
  });

  describe('story-031 AC-4: .claude/skills/ without SKILL.md falls through', () => {
    it('falls through to legacy-commands when .claude/skills/ has no SKILL.md', () => {
      createDirs(tmp, ['.claude/skills/my-skill']);
      createDirs(tmp, ['commands']);
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'legacy-commands');
    });

    it('falls through to fallback when .claude/skills/ exists but is empty', () => {
      createDirs(tmp, ['.claude/skills']);
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'legacy-commands');
      assert.ok(stderrOutput.includes('No recognized repo format signals found'));
    });

    it('falls through when .claude/skills/ has files but no SKILL.md', () => {
      createFiles(tmp, ['.claude/skills/my-skill/README.md']);
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'legacy-commands');
      assert.ok(stderrOutput.includes('No recognized repo format signals found'));
    });
  });

  describe('story-031 AC-5: config format: project-skills override', () => {
    it('respects project-skills config override', () => {
      const result = detectFormat(tmp, makeConfig({ format: 'project-skills' }));
      assert.equal(result, 'project-skills');
    });

    it('config project-skills override skips filesystem detection', () => {
      // No .claude/skills/ dir at all, but config says project-skills
      const result = detectFormat(tmp, makeConfig({ format: 'project-skills' }));
      assert.equal(result, 'project-skills');
      assert.equal(stderrOutput, '');
    });
  });

  // --- Edge cases ---

  describe('Edge cases', () => {
    it('empty plugins/ directory does not trigger multi-plugin', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
      ]);
      createDirs(tmp, ['plugins']);

      // No plugin subdirs with plugin.json, no skills, no legacy dirs
      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'legacy-commands');
      assert.ok(stderrOutput.includes('No recognized repo format signals found'));
    });

    it('plugins/ with files but no subdirectories does not trigger multi-plugin', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'plugins/readme.txt',
      ]);

      const result = detectFormat(tmp, makeConfig());
      assert.notEqual(result, 'multi-plugin');
    });

    it('marketplace.json with valid JSON but empty object still triggers plugin detection', () => {
      createFiles(tmp, [
        '.claude-plugin/marketplace.json',
        'skills/test-skill/SKILL.md',
      ], {
        '.claude-plugin/marketplace.json': '{}',
      });

      const result = detectFormat(tmp, makeConfig());
      assert.equal(result, 'plugin');
    });

    it('config override prevents any filesystem checks', () => {
      // Empty directory with config override — should work without any filesystem signals
      const result = detectFormat(tmp, makeConfig({ format: 'multi-plugin' }));
      assert.equal(result, 'multi-plugin');
      assert.equal(stderrOutput, '');
    });
  });
});
