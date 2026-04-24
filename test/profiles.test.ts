import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLevel } from '../src/profiles.js';

/** Minimal config for resolveLevel tests. */
function makeConfig(overrides: {
  default_level?: number;
  levels?: Record<string, number>;
  skills_root?: string;
} = {}) {
  return {
    default_level: overrides.default_level ?? 0,
    levels: overrides.levels ?? {},
    skills_root: overrides.skills_root ?? '/project/.claude',
  };
}

describe('resolveLevel', () => {
  describe('Priority 1: File frontmatter quality_level', () => {
    it('returns 0 for quality_level: 0', () => {
      const level = resolveLevel('/project/.claude/commands/foo.md', { quality_level: 0 }, makeConfig());
      assert.deepEqual(level, { kind: 'explicit', level: 0 });
    });

    it('returns 1 for quality_level: 1', () => {
      const level = resolveLevel('/project/.claude/commands/foo.md', { quality_level: 1 }, makeConfig());
      assert.deepEqual(level, { kind: 'explicit', level: 1 });
    });

    it('returns 2 for quality_level: 2', () => {
      const level = resolveLevel('/project/.claude/commands/foo.md', { quality_level: 2 }, makeConfig());
      assert.deepEqual(level, { kind: 'explicit', level: 2 });
    });

    it('returns 3 for quality_level: 3', () => {
      const level = resolveLevel('/project/.claude/commands/foo.md', { quality_level: 3 }, makeConfig());
      assert.deepEqual(level, { kind: 'explicit', level: 3 });
    });

    it('returns out-of-range for out-of-range quality_level: 99', () => {
      const level = resolveLevel('/project/.claude/commands/foo.md', { quality_level: 99 }, makeConfig());
      assert.deepEqual(level, { kind: 'out-of-range' });
    });

    it('returns out-of-range for negative quality_level: -1', () => {
      const level = resolveLevel('/project/.claude/commands/foo.md', { quality_level: -1 }, makeConfig());
      assert.deepEqual(level, { kind: 'out-of-range' });
    });

    it('returns out-of-range for quality_level: 4 (above max)', () => {
      const level = resolveLevel('/project/.claude/commands/foo.md', { quality_level: 4 }, makeConfig());
      assert.deepEqual(level, { kind: 'out-of-range' });
    });

    it('returns out-of-range for non-integer quality_level: 1.5', () => {
      const level = resolveLevel('/project/.claude/commands/foo.md', { quality_level: 1.5 }, makeConfig());
      assert.deepEqual(level, { kind: 'out-of-range' });
    });

    it('returns out-of-range for string quality_level: "high"', () => {
      const level = resolveLevel('/project/.claude/commands/foo.md', { quality_level: 'high' }, makeConfig());
      assert.deepEqual(level, { kind: 'out-of-range' });
    });


    it('file quality_level overrides directory level', () => {
      const config = makeConfig({
        levels: { 'commands': 1 },
      });
      const level = resolveLevel('/project/.claude/commands/foo.md', { quality_level: 2 }, config);
      assert.equal(level, 2);
    });

    it('file quality_level overrides default_level', () => {
      const config = makeConfig({ default_level: 1 });
      const level = resolveLevel('/project/.claude/commands/foo.md', { quality_level: 0 }, config);
      assert.equal(level, 0);
    });
  });

  describe('Priority 2: Directory-level overrides', () => {
    it('matches simple directory prefix', () => {
      const config = makeConfig({
        levels: { 'commands': 2 },
      });
      const level = resolveLevel('/project/.claude/commands/foo.md', {}, config);
      assert.equal(level, 2);
    });

    it('matches directory prefix with trailing slash', () => {
      const config = makeConfig({
        levels: { 'commands/': 2 },
      });
      const level = resolveLevel('/project/.claude/commands/foo.md', {}, config);
      assert.equal(level, 2);
    });

    it('matches nested directory prefix', () => {
      const config = makeConfig({
        levels: { 'commands/sub': 3 },
      });
      const level = resolveLevel('/project/.claude/commands/sub/foo.md', {}, config);
      assert.equal(level, 3);
    });

    it('longest prefix wins', () => {
      const config = makeConfig({
        levels: {
          'commands': 1,
          'commands/sub': 2,
          'commands/sub/deep': 3,
        },
      });
      const level = resolveLevel('/project/.claude/commands/sub/deep/foo.md', {}, config);
      assert.equal(level, 3);
    });

    it('does not match partial directory names', () => {
      const config = makeConfig({
        levels: { 'commands': 2 },
      });
      // "commands-extra" should NOT match "commands" prefix
      const level = resolveLevel('/project/.claude/commands-extra/foo.md', {}, config);
      assert.deepEqual(level, { kind: 'default' }); // Falls through to default
    });

    it('no match returns -2 (default fallback)', () => {
      const config = makeConfig({
        levels: { 'agents': 2 },
      });
      const level = resolveLevel('/project/.claude/commands/foo.md', {}, config);
      assert.equal(level, -2);
    });

    it('empty levels object returns -2', () => {
      const config = makeConfig({ levels: {} });
      const level = resolveLevel('/project/.claude/commands/foo.md', {}, config);
      assert.equal(level, -2);
    });
  });

  describe('Priority 3+4: Default fallback', () => {
    it('returns -2 when no file/dir override and default_level is set', () => {
      const config = makeConfig({ default_level: 1 });
      const level = resolveLevel('/project/.claude/commands/foo.md', {}, config);
      assert.equal(level, -2);
    });

    it('returns -2 when no config overrides exist at all', () => {
      const config = makeConfig();
      const level = resolveLevel('/project/.claude/commands/foo.md', {}, config);
      assert.equal(level, -2);
    });
  });
});
