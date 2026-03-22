import { readFileSync } from 'node:fs';
import matter from 'gray-matter';
import { glob } from 'glob';
import { classifyFile } from './classify.js';
import { type ExtractResult, type ParseError, type RepoFormat } from './types.js';

/**
 * Extract frontmatter and synthetic metadata from a single markdown file.
 *
 * Returns a structured ExtractResult — never throws. Parse errors are
 * captured in the `errors` array.
 */
export function extractFile(filePath: string): ExtractResult {
  const errors: ParseError[] = [];
  let raw: string;
  let fileSize: number;

  try {
    const buf = readFileSync(filePath);
    fileSize = buf.byteLength;
    raw = buf.toString('utf-8');
  } catch (err) {
    return {
      data: {},
      errors: [
        {
          message: `Failed to read file: ${(err as Error).message}`,
          filePath,
        },
      ],
      filePath,
      fileType: 'unknown',
    };
  }

  let data: Record<string, unknown> = {};
  let body = '';
  let hasFrontmatter = false;

  try {
    const parsed = matter(raw);
    data = parsed.data as Record<string, unknown>;
    body = parsed.content;
    // gray-matter returns an empty object when there is no frontmatter,
    // but it also returns an empty object for `---\n---`. Detect real
    // frontmatter by checking whether the raw input starts with the
    // delimiter.
    hasFrontmatter = raw.trimStart().startsWith('---');
  } catch (err) {
    // Invalid YAML — capture the error, keep going with body-only result (AC-4).
    errors.push({
      message: `YAML parse error: ${(err as Error).message}`,
      filePath,
    });
    // When gray-matter throws, we still have the raw content as the body.
    body = raw;
    hasFrontmatter = false;
  }

  // AC-8 (story-016): SKILL.md with no frontmatter → parse error
  const basename = filePath.split('/').pop() ?? '';
  if (basename === 'SKILL.md' && !hasFrontmatter && errors.length === 0) {
    errors.push({
      message: 'SKILL.md file has no frontmatter',
      filePath,
    });
  }

  // Inject synthetic metadata (AC-3).
  data['___has_frontmatter'] = hasFrontmatter;
  data['___body_length'] = body.length;
  data['___file_size'] = fileSize!;
  data['___body_text'] = body;
  data['___file_path'] = filePath;

  // Classify the file (AC-7: unknown when unclassifiable).
  const fileType = classifyFile(filePath, hasFrontmatter);
  data['___file_type'] = fileType;

  return { data, errors, filePath, fileType };
}

/**
 * Build glob patterns for plugin format discovery.
 *
 * Plugin format: skills/{name}/**\/*.md (all markdown in skill dirs),
 * context/{name}.md, agents/{name}.md
 */
function pluginPatterns(root: string): string[] {
  return [
    `${root}/skills/**/*.md`,
    `${root}/context/*.md`,
    `${root}/agents/*.md`,
  ];
}

/**
 * Build glob patterns for multi-plugin format discovery.
 *
 * Multi-plugin: plugins/{p}/skills/**\/*.md (all markdown in skill dirs),
 * plugins/{p}/context/{n}.md, plugins/{p}/agents/{n}.md
 */
function multiPluginPatterns(root: string): string[] {
  return [
    `${root}/plugins/*/skills/**/*.md`,
    `${root}/plugins/*/context/*.md`,
    `${root}/plugins/*/agents/*.md`,
  ];
}

/**
 * Extract frontmatter from all markdown files matching the given glob
 * patterns. Returns one ExtractResult per file.
 *
 * When `format` is provided, overrides `patterns` with format-specific
 * discovery globs rooted at `patterns[0]`'s parent (the skills root).
 *
 * Returns an empty array when no files match (AC-6).
 */
export async function extractAll(
  patterns: string[],
  ignore: string[] = [],
  format?: RepoFormat,
): Promise<ExtractResult[]> {
  let effectivePatterns: string[];

  if (format === 'plugin' || format === 'multi-plugin') {
    // For plugin formats, the first pattern is expected to be a glob
    // rooted at the skills root. Extract the root directory from it.
    // Convention: patterns[0] is something like "/path/to/root/**/*.md"
    // We take the root from patterns[0] by stripping the glob suffix.
    const root = extractRoot(patterns);

    effectivePatterns = format === 'plugin'
      ? pluginPatterns(root)
      : multiPluginPatterns(root);
  } else {
    effectivePatterns = patterns;
  }

  const files: string[] = [];

  for (const pattern of effectivePatterns) {
    const matched = await glob(pattern, {
      nodir: true,
      ignore: ['**/node_modules/**', ...ignore],
    });
    files.push(...matched);
  }

  // Deduplicate in case patterns overlap.
  const unique = [...new Set(files)];

  return unique.map((f) => extractFile(f));
}

/**
 * Extract the root directory from a set of glob patterns.
 *
 * Takes the first pattern and strips any glob suffix (everything from
 * the first `*` or `{` character onward), then removes trailing slashes.
 */
function extractRoot(patterns: string[]): string {
  const first = patterns[0] ?? '.';
  // Find the first glob metacharacter
  const globIdx = first.search(/[*?{[]/);
  if (globIdx === -1) {
    // No glob chars — the pattern is a literal path
    return first;
  }
  // Strip from the glob char back to the last directory separator
  const prefix = first.slice(0, globIdx);
  return prefix.replace(/\/+$/, '') || '.';
}
