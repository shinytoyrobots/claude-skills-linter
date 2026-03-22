import { readFileSync } from 'node:fs';
import matter from 'gray-matter';
import { glob } from 'glob';
import { classifyFile } from './classify.js';
import { type ExtractResult, type ParseError } from './types.js';

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
 * Extract frontmatter from all markdown files matching the given glob
 * patterns. Returns one ExtractResult per file.
 *
 * Returns an empty array when no files match (AC-6).
 */
export async function extractAll(
  patterns: string[],
  ignore: string[] = [],
): Promise<ExtractResult[]> {
  const files: string[] = [];

  for (const pattern of patterns) {
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
