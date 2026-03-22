import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyFile } from '../src/classify.js';

describe('classifyFile', () => {
  // AC-1: /commands/ → command
  it('classifies a path containing /commands/ as command', () => {
    assert.equal(classifyFile('commands/setup.md', false), 'command');
    assert.equal(classifyFile('.claude/commands/deploy.md', true), 'command');
  });

  // AC-2: /agents/ + hasFrontmatter true → agent
  it('classifies a path containing /agents/ with frontmatter as agent', () => {
    assert.equal(classifyFile('agents/reviewer.md', true), 'agent');
  });

  // AC-3: /context/ → context
  it('classifies a path containing /context/ as context', () => {
    assert.equal(classifyFile('context/project-rules.md', false), 'context');
    assert.equal(classifyFile('.claude/context/stack.md', true), 'context');
  });

  // AC-4: README.md basename (case-insensitive) → readme
  it('classifies README.md (case-insensitive) as readme', () => {
    assert.equal(classifyFile('README.md', false), 'readme');
    assert.equal(classifyFile('readme.md', false), 'readme');
    assert.equal(classifyFile('commands/README.md', false), 'readme');
    assert.equal(classifyFile('agents/Readme.md', true), 'readme');
  });

  // AC-5: /agents/ + hasFrontmatter false → legacy-agent
  it('classifies an agent path without frontmatter as legacy-agent', () => {
    assert.equal(classifyFile('agents/old-bot.md', false), 'legacy-agent');
    assert.equal(classifyFile('.claude/agents/legacy.md', false), 'legacy-agent');
  });

  // AC-6: /agents/ + hasFrontmatter true → agent (not legacy-agent)
  it('classifies an agent path with frontmatter as agent', () => {
    assert.equal(classifyFile('agents/new-bot.md', true), 'agent');
  });

  // AC-7: rightmost segment wins for overlapping paths
  it('uses the rightmost matching segment for classification', () => {
    // /agents/ then /context/ → context (rightmost)
    assert.equal(classifyFile('agents/context/foo.md', false), 'context');
    // /context/ then /commands/ → command (rightmost)
    assert.equal(classifyFile('context/commands/bar.md', false), 'command');
    // /commands/ then /agents/ → agent (with frontmatter)
    assert.equal(classifyFile('commands/agents/baz.md', true), 'agent');
    // /commands/ then /agents/ → legacy-agent (without frontmatter)
    assert.equal(classifyFile('commands/agents/baz.md', false), 'legacy-agent');
  });

  // AC-8: absolute path with ~/.claude/commands/ prefix
  it('classifies absolute paths with ~/.claude/ prefix correctly', () => {
    assert.equal(
      classifyFile('/Users/robin/.claude/commands/foo.md', false),
      'command',
    );
    assert.equal(
      classifyFile('/home/user/.claude/agents/bot.md', true),
      'agent',
    );
    assert.equal(
      classifyFile('/home/user/.claude/context/rules.md', false),
      'context',
    );
  });

  // AC-9: no match → unknown
  it('returns unknown for paths that match no known pattern', () => {
    assert.equal(classifyFile('random/folder/notes.md', false), 'unknown');
    assert.equal(classifyFile('foo.md', false), 'unknown');
    assert.equal(classifyFile('', false), 'unknown');
  });
});
