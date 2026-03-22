import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { extractFile, extractAll } from '../src/extract.js';

const fixtures = resolve(import.meta.dirname, 'fixtures');

describe('extractFile', () => {
  it('AC-1: extracts valid YAML frontmatter into data', () => {
    const result = extractFile(resolve(fixtures, 'valid-command.md'));

    assert.equal(result.errors.length, 0);
    assert.equal(result.data['name'], 'test-command');
    assert.equal(result.data['description'], 'A valid test command for fixture testing');
    assert.equal(result.data['model'], 'sonnet');
    assert.equal(result.data['___has_frontmatter'], true);
  });

  it('AC-2: file without frontmatter sets ___has_frontmatter to false', () => {
    const result = extractFile(resolve(fixtures, 'no-frontmatter.md'));

    assert.equal(result.errors.length, 0);
    assert.equal(result.data['___has_frontmatter'], false);
    // Should still have body content
    assert.ok((result.data['___body_length'] as number) > 0);
  });

  it('AC-3: all synthetic metadata fields are present', () => {
    const filePath = resolve(fixtures, 'valid-command.md');
    const result = extractFile(filePath);

    assert.equal(typeof result.data['___has_frontmatter'], 'boolean');
    assert.equal(typeof result.data['___body_length'], 'number');
    assert.equal(typeof result.data['___file_size'], 'number');
    assert.equal(typeof result.data['___body_text'], 'string');
    assert.equal(result.data['___file_path'], filePath);
    assert.ok(result.data['___file_type'] !== undefined);
    assert.ok((result.data['___file_size'] as number) > 0);
  });

  it('AC-4: invalid YAML returns errors array with message and filePath', () => {
    const filePath = resolve(fixtures, 'invalid-yaml.md');
    const result = extractFile(filePath);

    assert.ok(result.errors.length > 0, 'errors array should be non-empty');
    assert.equal(result.errors[0].filePath, filePath);
    assert.ok(
      result.errors[0].message.length > 0,
      'error message should be non-empty',
    );
  });

  it('AC-7: unclassifiable file sets ___file_type to unknown', () => {
    // Fixtures are not inside a commands/ agents/ context/ directory,
    // so classifyFile will return 'unknown'.
    const result = extractFile(resolve(fixtures, 'valid-command.md'));

    assert.equal(result.fileType, 'unknown');
    assert.equal(result.data['___file_type'], 'unknown');
  });
});

describe('extractAll', () => {
  it('AC-5: returns an ExtractResult array for matching files', async () => {
    const pattern = resolve(fixtures, '*.md');
    const results = await extractAll([pattern]);

    assert.ok(Array.isArray(results));
    assert.ok(results.length > 0, 'should match at least one file');

    for (const r of results) {
      assert.ok(r.filePath);
      assert.ok(Array.isArray(r.errors));
      assert.ok(r.data !== undefined);
    }
  });

  it('AC-6: non-matching glob returns empty array', async () => {
    const results = await extractAll([
      resolve(fixtures, 'this-pattern-matches-nothing-*.xyz'),
    ]);

    assert.ok(Array.isArray(results));
    assert.equal(results.length, 0);
  });
});
