import { createHash } from 'node:crypto';
import type { ExtractResult, Config, ValidationResult } from './types.js';

/**
 * Installed-path prefix used by Claude Code for skill files.
 * Stripped during normalization to produce repo-relative paths.
 */
const INSTALLED_PREFIX = '~/.claude/commands/';

/**
 * Regex to extract file-path references from body text.
 *
 * Matches patterns like:
 *   ~/.claude/commands/context/foo.md
 *   ~/.claude/commands/agents/bar.md
 *   ~/.claude/commands/commands/baz.md
 *   context/foo.md
 *   agents/bar.md
 *   commands/baz.md
 *
 * Captures the full match. Handles paths embedded in backticks, prose,
 * or standalone. The filename portion allows word chars, hyphens, and dots.
 */
const REF_PATTERN =
  /(?:~\/\.claude\/commands\/)?(?:(?:agents|context|commands)\/)+[\w][\w.\-]*\.md/g;

/**
 * Normalize a raw reference path to repo-relative form.
 *
 * - Strips the `~/.claude/commands/` prefix if present.
 * - The result is relative to the skills root directory.
 */
function normalizePath(raw: string): string {
  if (raw.startsWith(INSTALLED_PREFIX)) {
    return raw.slice(INSTALLED_PREFIX.length);
  }
  return raw;
}

/**
 * Find the 1-based line number where `needle` appears in `text`.
 * Returns undefined if not found.
 */
function findLine(text: string, needle: string): number | undefined {
  const idx = text.indexOf(needle);
  if (idx === -1) return undefined;
  // Count newlines before the match.
  let line = 1;
  for (let i = 0; i < idx; i++) {
    if (text[i] === '\n') line++;
  }
  return line;
}

/**
 * Build a repo-relative key from an absolute file path by stripping skills_root.
 */
function repoRelativeKey(filePath: string, skillsRoot: string): string {
  const root = skillsRoot.endsWith('/') ? skillsRoot : skillsRoot + '/';
  if (filePath.startsWith(root)) {
    return filePath.slice(root.length);
  }
  return filePath;
}

/**
 * Build a canonical name from a file's type and basename.
 *
 * Claude Code installs skills into a flat `~/.claude/commands/{type}/{filename}`
 * structure regardless of repo organization. So the canonical identity of any
 * skill file is `{type}/{basename}` — e.g., `context/output-patterns.md`.
 *
 * This allows reference resolution across any repo structure: flat, suite-based,
 * plugin-based, or deeply nested.
 */
function canonicalName(filePath: string, fileType: string): string {
  const basename = filePath.split('/').pop() ?? filePath;
  // Map fileType to the directory name Claude Code uses on install.
  const typeDir =
    fileType === 'command' ? 'commands' :
    fileType === 'agent' || fileType === 'legacy-agent' ? 'agents' :
    fileType === 'context' ? 'context' :
    fileType === 'skill' ? 'skills' :
    fileType; // readme, unknown — won't typically be referenced
  return `${typeDir}/${basename}`;
}

/**
 * Canonical name index: maps canonical names to actual file paths.
 * Detects name collisions (multiple files with the same canonical name).
 */
interface CanonicalIndex {
  /** canonical name → absolute file path (first seen) */
  nameToPath: Map<string, string>;
  /** canonical names that have collisions */
  collisions: Map<string, string[]>;
}

function buildCanonicalIndex(files: ExtractResult[]): CanonicalIndex {
  const nameToPath = new Map<string, string>();
  const collisions = new Map<string, string[]>();

  for (const file of files) {
    if (file.errors.length > 0) continue;
    const cn = canonicalName(file.filePath, file.fileType);
    const existing = nameToPath.get(cn);
    if (existing !== undefined) {
      // Collision — track both files.
      const list = collisions.get(cn) ?? [existing];
      list.push(file.filePath);
      collisions.set(cn, list);
    } else {
      nameToPath.set(cn, file.filePath);
    }
  }

  return { nameToPath, collisions };
}

/**
 * Extract references from a single file's body text.
 * Returns an array of { raw, normalized } reference objects.
 */
function extractRefs(bodyText: string): Array<{ raw: string; normalized: string }> {
  const refs: Array<{ raw: string; normalized: string }> = [];
  const seen = new Set<string>();

  for (const match of bodyText.matchAll(REF_PATTERN)) {
    const raw = match[0];
    const normalized = normalizePath(raw);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      refs.push({ raw, normalized });
    }
  }

  return refs;
}

/**
 * Detect broken references: references that don't resolve to any file
 * via canonical name lookup.
 */
function detectBrokenRefs(
  files: ExtractResult[],
  index: CanonicalIndex,
): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const file of files) {
    if (file.errors.length > 0) continue;

    const bodyText = (file.data['___body_text'] as string) ?? '';
    const refs = extractRefs(bodyText);

    for (const ref of refs) {
      // The normalized ref is already in canonical form (e.g., "context/foo.md").
      if (!index.nameToPath.has(ref.normalized)) {
        const line = findLine(bodyText, ref.raw);
        results.push({
          filePath: file.filePath,
          rule: 'broken-reference',
          severity: 'error',
          message: `Broken reference to "${ref.normalized}"`,
          ...(line !== undefined ? { line } : {}),
        });
      }
    }
  }

  return results;
}

/**
 * Detect orphaned files: context or agent files that no command references.
 * Uses canonical names so that references resolve regardless of repo structure.
 */
function detectOrphans(
  files: ExtractResult[],
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Collect all canonical names referenced from command files.
  const referencedCanonical = new Set<string>();

  for (const file of files) {
    if (file.errors.length > 0) continue;
    if (file.fileType !== 'command') continue;

    const bodyText = (file.data['___body_text'] as string) ?? '';
    const refs = extractRefs(bodyText);
    for (const ref of refs) {
      referencedCanonical.add(ref.normalized);
    }
  }

  // Check context and agent files by their canonical name.
  for (const file of files) {
    if (file.errors.length > 0) continue;
    if (file.fileType !== 'context' && file.fileType !== 'agent') continue;

    const cn = canonicalName(file.filePath, file.fileType);
    if (!referencedCanonical.has(cn)) {
      results.push({
        filePath: file.filePath,
        rule: 'orphaned-file',
        severity: 'warning',
        message: `File is not referenced by any command`,
      });
    }
  }

  return results;
}

/**
 * Detect files with byte-identical content using SHA-256 hashing.
 */
function detectDuplicates(files: ExtractResult[]): ValidationResult[] {
  const results: ValidationResult[] = [];
  const hashMap = new Map<string, string>(); // hash → first file path

  for (const file of files) {
    if (file.errors.length > 0) continue;

    // Hash the full raw content: frontmatter + body.
    // We reconstruct from the data fields available.
    // Since we have ___body_text and the original data, use a consistent representation.
    // The simplest approach: hash the body_text + JSON of non-synthetic data keys.
    const bodyText = (file.data['___body_text'] as string) ?? '';
    const nonSynthetic: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(file.data)) {
      if (!k.startsWith('___')) {
        nonSynthetic[k] = v;
      }
    }
    const content = JSON.stringify(nonSynthetic) + '\n' + bodyText;
    const hash = createHash('sha256').update(content).digest('hex');

    const existing = hashMap.get(hash);
    if (existing !== undefined) {
      results.push({
        filePath: file.filePath,
        rule: 'duplicate-content',
        severity: 'warning',
        message: `Duplicate content — identical to "${existing}"`,
      });
    } else {
      hashMap.set(hash, file.filePath);
    }
  }

  return results;
}

/** Color states for DFS cycle detection. */
const enum Color {
  WHITE = 0,
  GRAY = 1,
  BLACK = 2,
}

/**
 * Detect cycles in the reference graph using DFS with WHITE/GRAY/BLACK coloring.
 * Uses canonical names for adjacency so references resolve across any repo structure.
 */
function detectCycles(
  files: ExtractResult[],
  index: CanonicalIndex,
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Build adjacency list using canonical names.
  const adjacency = new Map<string, string[]>();
  const keyToFilePath = new Map<string, string>();

  for (const file of files) {
    if (file.errors.length > 0) continue;

    const key = canonicalName(file.filePath, file.fileType);
    keyToFilePath.set(key, file.filePath);

    const bodyText = (file.data['___body_text'] as string) ?? '';
    const refs = extractRefs(bodyText);
    const targets = refs
      .map((r) => r.normalized)
      .filter((t) => index.nameToPath.has(t));

    adjacency.set(key, targets);
  }

  // DFS cycle detection.
  const color = new Map<string, Color>();
  const parent = new Map<string, string | null>();
  const reportedCycles = new Set<string>();

  for (const key of adjacency.keys()) {
    color.set(key, Color.WHITE);
  }

  function dfs(node: string, path: string[]): void {
    color.set(node, Color.GRAY);

    const neighbors = adjacency.get(node) ?? [];
    for (const neighbor of neighbors) {
      const neighborColor = color.get(neighbor);

      if (neighborColor === Color.GRAY) {
        // Found a cycle — extract the cycle path.
        const cycleStart = path.indexOf(neighbor);
        const cyclePath = cycleStart >= 0
          ? [...path.slice(cycleStart), neighbor]
          : [node, neighbor]; // self-reference or neighbor not in path

        // For self-references.
        if (node === neighbor) {
          const cycleKey = `${neighbor}`;
          if (!reportedCycles.has(cycleKey)) {
            reportedCycles.add(cycleKey);
            results.push({
              filePath: keyToFilePath.get(neighbor) ?? neighbor,
              rule: 'reference-cycle',
              severity: 'error',
              message: `Reference cycle detected: ${neighbor} → ${neighbor}`,
            });
          }
          continue;
        }

        // Normalize cycle representation for dedup: sort and join.
        const cycleNodes = cyclePath.slice(0, -1).sort();
        const cycleKey = cycleNodes.join(',');
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          const formatted = cyclePath.join(' → ');
          results.push({
            filePath: keyToFilePath.get(cyclePath[0]) ?? cyclePath[0],
            rule: 'reference-cycle',
            severity: 'error',
            message: `Reference cycle detected: ${formatted}`,
          });
        }
      } else if (neighborColor === Color.WHITE || neighborColor === undefined) {
        dfs(neighbor, [...path, neighbor]);
      }
      // BLACK nodes are fully explored — skip.
    }

    color.set(node, Color.BLACK);
  }

  for (const key of adjacency.keys()) {
    if (color.get(key) === Color.WHITE) {
      dfs(key, [key]);
    }
  }

  return results;
}

/**
 * Detect name collisions: multiple files that would map to the same installed
 * path (same type + basename). These would overwrite each other on install.
 */
function detectNameCollisions(index: CanonicalIndex): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const [cn, paths] of index.collisions) {
    for (const filePath of paths) {
      results.push({
        filePath,
        rule: 'name-collision',
        severity: 'error',
        message: `Name collision — "${cn}" resolves to multiple files: ${paths.join(', ')}`,
      });
    }
  }

  return results;
}

/**
 * Validate cross-file references, orphans, duplicates, cycles, and name collisions.
 *
 * This is the main graph validation entry point. It processes an array
 * of ExtractResults and returns ValidationResults for any issues found.
 *
 * Reference resolution uses canonical names ({type}/{basename}) so that
 * references resolve regardless of repo directory structure — flat, suite-based,
 * plugin-based, or deeply nested.
 */
export function validateGraph(
  files: ExtractResult[],
  config: Config,
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Build canonical name index for reference resolution.
  const index = buildCanonicalIndex(files);

  // Name collisions (always checked — these are install-time bugs).
  results.push(...detectNameCollisions(index));

  // AC-1, AC-2: Broken references.
  results.push(...detectBrokenRefs(files, index));

  // AC-3: Orphaned files (only if enabled).
  if (config.graph.warn_orphans) {
    results.push(...detectOrphans(files));
  }

  // AC-4: Duplicate content (only if enabled).
  if (config.graph.detect_duplicates) {
    results.push(...detectDuplicates(files));
  }

  // AC-5: Cycle detection (only if enabled).
  if (config.graph.detect_cycles) {
    results.push(...detectCycles(files, index));
  }

  return results;
}
