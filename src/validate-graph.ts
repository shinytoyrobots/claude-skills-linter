import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, dirname, resolve, relative, isAbsolute } from 'node:path';
import type { ExtractResult, Config, RepoFormat, ValidationResult } from './types.js';
import { tokenizeAllowedTools, checkNameDirMismatch } from './validate-frontmatter.js';

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
  /(?<![\w.\-\/])(?:~\/\.claude\/commands\/)?(?:(?:agents|context|commands)\/)+[\w][\w.\-]*\.md/g;

/**
 * Regex to extract relative path references from body text.
 *
 * Matches patterns like:
 *   ../../context/foo.md
 *   ../agents/scanner.md
 *   ./helpers.md
 *
 * Handles both bare text and markdown link syntax [text](path).
 * The path must start with ./ or ../ and end with .md.
 */
const RELATIVE_REF_PATTERN =
  /\.\.?\/[^\s)]*\.md/g;

/**
 * Known subdirectory prefixes for bare references inside plugin skill directories.
 * These match paths like `reference/foo.md`, `shared/bar.md` without a `./` prefix.
 */
const BARE_SUBDIRECTORY_PREFIXES = ['reference', 'shared', 'examples', 'templates', 'themes'];

/**
 * Regex to extract bare subdirectory references from body text.
 *
 * Matches patterns like:
 *   reference/foo.md
 *   shared/helpers.md
 *   templates/base.md
 *
 * The negative lookbehind prevents matching paths that are part of a longer
 * path (e.g., `./reference/foo.md` or `~/.claude/commands/context/foo.md`).
 */
const BARE_REF_PATTERN = new RegExp(
  `(?<![.\\w\\-\\/])(?:${BARE_SUBDIRECTORY_PREFIXES.join('|')})\\/[\\w][\\w.\\-/]*\\.md`,
  'g',
);

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
  // For skill files (SKILL.md), identity comes from the parent directory name
  // (the skill folder), not the filename — every skill file is named SKILL.md
  // so using the filename would produce collisions in multi-plugin repos.
  const name = fileType === 'skill'
    ? basename(dirname(filePath))
    : basename(filePath);
  // Map fileType to the directory name Claude Code uses on install.
  const typeDir =
    fileType === 'command' ? 'commands' :
    fileType === 'agent' || fileType === 'legacy-agent' ? 'agents' :
    fileType === 'context' ? 'context' :
    fileType === 'skill' ? 'skills' :
    fileType; // readme, unknown — won't typically be referenced
  return `${typeDir}/${name}`;
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
 * Build a set of absolute file paths from the extracted file set.
 * Used for relative path resolution in plugin format repos.
 */
function buildFilePathSet(files: ExtractResult[]): Set<string> {
  const pathSet = new Set<string>();
  for (const file of files) {
    if (file.errors.length > 0) continue;
    pathSet.add(file.filePath);
  }
  return pathSet;
}

/**
 * Build a reverse index from absolute file path to its ExtractResult.
 * Used for looking up fileType after resolving a relative path.
 */
function buildPathToFile(files: ExtractResult[]): Map<string, ExtractResult> {
  const map = new Map<string, ExtractResult>();
  for (const file of files) {
    if (file.errors.length > 0) continue;
    map.set(file.filePath, file);
  }
  return map;
}

/**
 * Build a set of skill root directories by scanning for SKILL.md on disk.
 *
 * In plugin/multi-plugin format, each skill lives under a directory containing
 * SKILL.md (e.g., `skills/claude-api/SKILL.md`). Bare references like
 * `shared/prompt-caching.md` are written relative to this skill root, not
 * relative to the referencing file's own directory.
 *
 * We scan disk rather than the error-free file set because SKILL.md may have
 * parse errors but still marks the skill root directory.
 */
function buildSkillRoots(files: ExtractResult[]): Set<string> {
  const roots = new Set<string>();

  // First: add directories of all SKILL.md files found in the extract results
  // (regardless of errors — the file still marks a skill root).
  for (const file of files) {
    if (basename(file.filePath) === 'SKILL.md') {
      roots.add(dirname(file.filePath));
    }
  }

  return roots;
}

/**
 * Find the skill root directory for a given file by walking up to a known root.
 *
 * Returns the directory containing SKILL.md, or undefined if not found
 * before reaching rootDir.
 */
function findSkillRoot(
  filePath: string,
  skillRoots: Set<string>,
  rootDir: string,
): string | undefined {
  let dir = dirname(filePath);
  while (true) {
    if (skillRoots.has(dir)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    // Don't walk above rootDir.
    if (dir === rootDir) break;
    dir = parent;
  }
  return undefined;
}

/** Reference extracted from body text, with resolution metadata. */
interface ResolvedRef {
  raw: string;
  normalized: string;
  /** Whether this ref was resolved via relative path (vs canonical). */
  isRelative: boolean;
  /** Absolute file path this ref resolves to (only set for relative refs that resolved). */
  resolvedPath?: string;
}

/**
 * Extract canonical (non-relative) references from a single file's body text.
 * Returns an array of { raw, normalized } reference objects.
 *
 * This function extracts ONLY the legacy installed-path and type/filename patterns.
 * Relative path extraction is handled separately.
 */
export function extractRefs(bodyText: string): Array<{ raw: string; normalized: string }> {
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
 * Extract relative path references from body text.
 * Returns raw relative path strings (e.g., "../../context/foo.md", "./helpers.md").
 */
export function extractRelativeRefs(bodyText: string): Array<{ raw: string }> {
  const refs: Array<{ raw: string }> = [];
  const seen = new Set<string>();

  for (const match of bodyText.matchAll(RELATIVE_REF_PATTERN)) {
    const raw = match[0];
    if (!seen.has(raw)) {
      seen.add(raw);
      refs.push({ raw });
    }
  }

  return refs;
}

/**
 * Extract bare subdirectory references from body text.
 * Returns raw path strings (e.g., "reference/foo.md", "shared/helpers.md").
 *
 * These are paths that start with a known subdirectory prefix but have no
 * `./` or `../` prefix and don't match the canonical REF_PATTERN (which only
 * matches agents/, context/, commands/ prefixes).
 */
export function extractBareRefs(bodyText: string): Array<{ raw: string }> {
  const refs: Array<{ raw: string }> = [];
  const seen = new Set<string>();

  for (const match of bodyText.matchAll(BARE_REF_PATTERN)) {
    const raw = match[0];
    if (!seen.has(raw)) {
      seen.add(raw);
      refs.push({ raw });
    }
  }

  return refs;
}

/**
 * Check whether a resolved path escapes the repo root.
 */
function escapesRepo(resolvedPath: string, rootDir: string): boolean {
  const rel = relative(rootDir, resolvedPath);
  // If relative path starts with "..", it's outside the root.
  return rel.startsWith('..');
}

/**
 * Resolve all references from a file's body text, using the appropriate
 * strategy based on repo format.
 *
 * For legacy-commands: canonical name resolution only.
 * For plugin/multi-plugin: relative path resolution first, then canonical fallback.
 */
function resolveAllRefs(
  bodyText: string,
  sourceFilePath: string,
  format: RepoFormat | undefined,
  rootDir: string | undefined,
  filePathSet: Set<string>,
  pathToFile: Map<string, ExtractResult>,
  index: CanonicalIndex,
  skillRoots: Set<string>,
): ResolvedRef[] {
  const resolved: ResolvedRef[] = [];
  const seenNormalized = new Set<string>();

  const isPluginFormat = format === 'plugin' || format === 'multi-plugin';

  // For plugin/multi-plugin formats, try relative paths first.
  if (isPluginFormat && rootDir) {
    const relRefs = extractRelativeRefs(bodyText);
    const sourceDir = dirname(sourceFilePath);

    for (const ref of relRefs) {
      const absPath = resolve(sourceDir, ref.raw);

      // AC-7: Check for path escape.
      if (escapesRepo(absPath, rootDir)) {
        resolved.push({
          raw: ref.raw,
          normalized: ref.raw,
          isRelative: true,
          // No resolvedPath — will be treated as broken with escape message.
        });
        seenNormalized.add(ref.raw);
        continue;
      }

      // Check if the resolved path exists in the file set.
      if (filePathSet.has(absPath)) {
        // Resolve to canonical name for the target file.
        const targetFile = pathToFile.get(absPath);
        const cn = targetFile
          ? canonicalName(targetFile.filePath, targetFile.fileType)
          : ref.raw;

        resolved.push({
          raw: ref.raw,
          normalized: cn,
          isRelative: true,
          resolvedPath: absPath,
        });
        seenNormalized.add(cn);
      } else {
        // File-relative didn't resolve — try skill-root-relative.
        const skillRoot = findSkillRoot(sourceFilePath, skillRoots, rootDir);
        const absFromSkillRoot = skillRoot ? resolve(skillRoot, ref.raw) : undefined;

        if (absFromSkillRoot && !escapesRepo(absFromSkillRoot, rootDir) && filePathSet.has(absFromSkillRoot)) {
          const targetFile = pathToFile.get(absFromSkillRoot);
          const cn = targetFile
            ? canonicalName(targetFile.filePath, targetFile.fileType)
            : ref.raw;

          resolved.push({
            raw: ref.raw,
            normalized: cn,
            isRelative: true,
            resolvedPath: absFromSkillRoot,
          });
          seenNormalized.add(cn);
        } else {
          // Neither file-relative nor skill-root-relative resolved — broken.
          resolved.push({
            raw: ref.raw,
            normalized: ref.raw,
            isRelative: true,
          });
          seenNormalized.add(ref.raw);
        }
      }
    }
  }

  // For plugin/multi-plugin formats, resolve bare subdirectory refs.
  if (isPluginFormat && rootDir) {
    const bareRefs = extractBareRefs(bodyText);
    const sourceDir = dirname(sourceFilePath);

    for (const ref of bareRefs) {
      // Skip if already seen (e.g., matched by RELATIVE_REF_PATTERN).
      if (seenNormalized.has(ref.raw)) continue;

      // Try file-relative resolution first.
      const absPath = resolve(sourceDir, ref.raw);

      if (!escapesRepo(absPath, rootDir) && filePathSet.has(absPath)) {
        const targetFile = pathToFile.get(absPath);
        const cn = targetFile
          ? canonicalName(targetFile.filePath, targetFile.fileType)
          : ref.raw;

        resolved.push({
          raw: ref.raw,
          normalized: cn,
          isRelative: true,
          resolvedPath: absPath,
        });
        seenNormalized.add(cn);
      } else {
        // File-relative didn't resolve — try skill-root-relative.
        const skillRoot = findSkillRoot(sourceFilePath, skillRoots, rootDir);
        const absFromSkillRoot = skillRoot ? resolve(skillRoot, ref.raw) : undefined;
        if (absFromSkillRoot && !escapesRepo(absFromSkillRoot, rootDir) && filePathSet.has(absFromSkillRoot)) {
          const targetFile = pathToFile.get(absFromSkillRoot);
          const cn = targetFile
            ? canonicalName(targetFile.filePath, targetFile.fileType)
            : ref.raw;

          resolved.push({
            raw: ref.raw,
            normalized: cn,
            isRelative: true,
            resolvedPath: absFromSkillRoot,
          });
          seenNormalized.add(cn);
        } else if (index.nameToPath.has(ref.raw)) {
          // Canonical fallback.
          resolved.push({
            raw: ref.raw,
            normalized: ref.raw,
            isRelative: false,
          });
          seenNormalized.add(ref.raw);
        } else {
          // No resolution strategy worked — broken ref.
          resolved.push({
            raw: ref.raw,
            normalized: ref.raw,
            isRelative: true,
          });
          seenNormalized.add(ref.raw);
        }
      }
    }
  }

  // For plugin format, try resolving REF_PATTERN matches as relative paths
  // BEFORE canonical lookup. If relative resolution finds the file, treat as
  // resolved. If not, fall through to canonical.
  if (isPluginFormat && rootDir) {
    const canonicalRefs = extractRefs(bodyText);
    const sourceDir = dirname(sourceFilePath);

    for (const ref of canonicalRefs) {
      // Skip if already resolved via relative or bare ref.
      if (seenNormalized.has(ref.normalized)) continue;

      // Try relative resolution first.
      const absPath = resolve(sourceDir, ref.raw.startsWith(INSTALLED_PREFIX)
        ? ref.raw.slice(INSTALLED_PREFIX.length)
        : ref.raw);

      if (!escapesRepo(absPath, rootDir) && filePathSet.has(absPath)) {
        const targetFile = pathToFile.get(absPath);
        const cn = targetFile
          ? canonicalName(targetFile.filePath, targetFile.fileType)
          : ref.normalized;

        resolved.push({
          raw: ref.raw,
          normalized: cn,
          isRelative: true,
          resolvedPath: absPath,
        });
        seenNormalized.add(cn);
        // Also add the original normalized form to prevent canonical re-processing.
        seenNormalized.add(ref.normalized);
      } else {
        // File-relative didn't resolve — try skill-root-relative.
        const rawPath = ref.raw.startsWith(INSTALLED_PREFIX)
          ? ref.raw.slice(INSTALLED_PREFIX.length)
          : ref.raw;
        const skillRoot = findSkillRoot(sourceFilePath, skillRoots, rootDir);
        const absFromSkillRoot = skillRoot ? resolve(skillRoot, rawPath) : undefined;

        if (absFromSkillRoot && !escapesRepo(absFromSkillRoot, rootDir) && filePathSet.has(absFromSkillRoot)) {
          const targetFile = pathToFile.get(absFromSkillRoot);
          const cn = targetFile
            ? canonicalName(targetFile.filePath, targetFile.fileType)
            : ref.normalized;

          resolved.push({
            raw: ref.raw,
            normalized: cn,
            isRelative: true,
            resolvedPath: absFromSkillRoot,
          });
          seenNormalized.add(cn);
          seenNormalized.add(ref.normalized);
        } else {
          // Fall through to canonical resolution.
          seenNormalized.add(ref.normalized);
          resolved.push({
            raw: ref.raw,
            normalized: ref.normalized,
            isRelative: false,
          });
        }
      }
    }
  } else {
    // Legacy format or no rootDir: canonical resolution only.
    const canonicalRefs = extractRefs(bodyText);
    for (const ref of canonicalRefs) {
      if (!seenNormalized.has(ref.normalized)) {
        seenNormalized.add(ref.normalized);
        resolved.push({
          raw: ref.raw,
          normalized: ref.normalized,
          isRelative: false,
        });
      }
    }
  }

  return resolved;
}

/**
 * Detect broken references: references that don't resolve to any file
 * via canonical name lookup or relative path resolution.
 */
function detectBrokenRefs(
  files: ExtractResult[],
  index: CanonicalIndex,
  format: RepoFormat | undefined,
  rootDir: string | undefined,
  filePathSet: Set<string>,
  pathToFile: Map<string, ExtractResult>,
  skillRoots: Set<string>,
): ValidationResult[] {
  const results: ValidationResult[] = [];

  for (const file of files) {
    if (file.errors.length > 0) continue;

    const bodyText = (file.data['___body_text'] as string) ?? '';
    const refs = resolveAllRefs(
      bodyText, file.filePath, format, rootDir, filePathSet, pathToFile, index, skillRoots,
    );

    for (const ref of refs) {
      if (ref.resolvedPath) continue; // Successfully resolved via relative path.

      if (ref.isRelative) {
        // Relative ref that didn't resolve.
        const line = findLine(bodyText, ref.raw);
        const absPath = rootDir
          ? resolve(dirname(file.filePath), ref.raw)
          : ref.raw;
        const isEscape = rootDir ? escapesRepo(absPath, rootDir) : false;
        const message = isEscape
          ? `Broken reference to "${ref.raw}" — path escapes the repository root`
          : `Broken reference to "${ref.raw}"`;
        results.push({
          filePath: file.filePath,
          rule: 'broken-reference',
          severity: 'error',
          message,
          ...(line !== undefined ? { line } : {}),
        });
      } else {
        // Canonical ref — check against index.
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
  }

  return results;
}

// --- Progressive-disclosure bundle references (SR-006..SR-009) ---

/** Bundle subdirectory prefixes a bare (non-markdown-link) path may start with. */
const BUNDLE_PREFIXES = ['scripts', 'references', 'reference', 'assets', 'examples', 'templates', 'shared', 'docs'];

/** Markdown link: `[text](target)`. Linear-time (no nested quantifiers) — INV-4 safe. */
const MARKDOWN_LINK_PATTERN = /\[[^\]]*\]\(([^)\s]+)\)/g;

/**
 * Bare bundle path starting with a known prefix or a ${CLAUDE_*_DIR} variable.
 * Linear-time, anchored by a negative lookbehind so it never matches mid-path — INV-4 safe.
 */
const BARE_BUNDLE_PATTERN = new RegExp(
  `(?<![\\w./$-])(?:\\$\\{CLAUDE_(?:SKILL|PROJECT)_DIR\\}\\/|(?:${BUNDLE_PREFIXES.join('|')})\\/)[\\w./-]+`,
  'g',
);

/** Fenced code blocks (``` or ~~~). Stripped before reference scanning (adv-3 / INV-1). */
const FENCED_BLOCK_PATTERN = /(^|\n)[ \t]*(```|~~~)[\s\S]*?\2[ \t]*(?=\n|$)/g;

function stripFencedCodeBlocks(text: string): string {
  return text.replace(FENCED_BLOCK_PATTERN, '\n');
}

/** True for references that are external, anchors, or globs — never existence-checked. */
function isSkippableRef(p: string): boolean {
  if (/^(https?:|mailto:|ftp:|tel:|#)/i.test(p)) return true;
  if (/[*?[\]]/.test(p)) return true; // glob patterns are out of scope (D4)
  return false;
}

/** A path whose last segment carries a file extension (e.g. `foo/bar.md`, `x.py`). */
function hasFileExtension(p: string): boolean {
  return /\.[A-Za-z0-9]+$/.test(p);
}

/**
 * Extensions of files a skill typically *writes* at runtime rather than *bundles*.
 * A bare prose mention of such a path ("writes rows to `scripts/gate/out.tsv`") is an
 * output reference, not a progressive-disclosure resource, so it is not existence-checked
 * — checking it would false-positive on a valid skill (INV-1). Explicit references
 * (markdown links, ${CLAUDE_*_DIR}, Bash grants) are still checked regardless.
 */
const OUTPUT_FILE_EXTENSIONS = new Set([
  'tsv', 'csv', 'log', 'lock', 'tmp', 'out', 'cache', 'pid', 'bak', 'db', 'sqlite',
]);

function isLikelyOutputFile(p: string): boolean {
  const m = /\.([A-Za-z0-9]+)$/.exec(p);
  return m ? OUTPUT_FILE_EXTENSIONS.has(m[1].toLowerCase()) : false;
}

/**
 * True when a raw reference is "skill-bundle-shaped" and should be resolved on disk.
 * Bare (non-link) refs must carry a file extension — this rejects directory mentions and
 * truncated captures (e.g. the `shared/managed-agents-` left behind when a `*.md` glob is
 * sliced at the wildcard), keeping the false-positive rate at zero (INV-1).
 */
function isBundleShaped(p: string, fromMarkdownLink: boolean): boolean {
  if (/^\$\{CLAUDE_(?:SKILL|PROJECT)_DIR\}/.test(p)) return hasFileExtension(p);
  if (p.startsWith('./') || p.startsWith('../')) return hasFileExtension(p);
  if (new RegExp(`^(?:${BUNDLE_PREFIXES.join('|')})\\/`).test(p)) {
    // From a markdown link the author committed to the target; a bare prose path must
    // additionally carry an extension to count.
    return fromMarkdownLink || hasFileExtension(p);
  }
  // A bare sibling file (no slash, has an extension) counts only from a markdown link,
  // where the author explicitly linked it — bare prose siblings would over-match.
  if (fromMarkdownLink && !p.includes('/') && hasFileExtension(p)) return true;
  return false;
}

/** Expand ${CLAUDE_SKILL_DIR} / ${CLAUDE_PROJECT_DIR} (SR-008). */
function expandSkillVars(raw: string, skillDir: string, projectRoot: string): string {
  return raw
    .replace(/\$\{CLAUDE_SKILL_DIR\}/g, skillDir)
    .replace(/\$\{CLAUDE_PROJECT_DIR\}/g, projectRoot);
}

/** Pull path-shaped arguments out of Bash(...)/Tool(...) grants in allowed-tools (SR-009). */
function bashGrantPaths(allowedTools: unknown): string[] {
  const tokens: string[] =
    Array.isArray(allowedTools) ? allowedTools.map(String)
    : typeof allowedTools === 'string' ? tokenizeAllowedTools(allowedTools)
    : [];
  const paths: string[] = [];
  for (const tok of tokens) {
    const m = /^\w+\((.*)\)$/.exec(tok);
    if (!m) continue;
    for (const part of m[1].split(/\s+/)) {
      if (part.includes('/') || part.includes('${')) paths.push(part);
    }
  }
  return paths;
}

/**
 * Detect broken progressive-disclosure references in SKILL.md bodies and allowed-tools
 * script grants (SR-006..SR-009). Resolves each reference relative to the skill's own
 * directory and reports `broken-reference` (error) for a target missing on disk. Runs for
 * skill files in every format; kept disjoint from the canonical/plugin resolution above
 * (bundle-shaped refs only) so it never re-reports or regresses existing behavior (INV-3).
 */
function detectSkillBundleRefs(
  files: ExtractResult[],
  format: RepoFormat | undefined,
  rootDir: string | undefined,
  filePathSet: Set<string>,
): ValidationResult[] {
  const results: ValidationResult[] = [];

  // In plugin/multi-plugin format the existing pipeline already resolves `.md`
  // relative/bare references. Defer those to it and handle only the reference kinds
  // it structurally cannot (non-.md bundle files, ${VAR}s, Bash grants) — this keeps
  // the two resolvers disjoint so neither double-reports (INV-3).
  const deferMdRefs = format === 'plugin' || format === 'multi-plugin';

  for (const file of files) {
    if (file.errors.length > 0) continue;
    if (file.fileType !== 'skill') continue;

    const skillDir = dirname(file.filePath);
    const projectRoot = rootDir ?? skillDir;
    const originalBody = (file.data['___body_text'] as string) ?? '';
    const scanBody = stripFencedCodeBlocks(originalBody);

    // Collect (raw, fromMarkdownLink) candidates.
    const candidates: Array<{ raw: string; fromLink: boolean }> = [];
    for (const m of scanBody.matchAll(MARKDOWN_LINK_PATTERN)) candidates.push({ raw: m[1], fromLink: true });
    for (const m of scanBody.matchAll(BARE_BUNDLE_PATTERN)) candidates.push({ raw: m[0], fromLink: false });
    for (const p of bashGrantPaths(file.data['allowed-tools'])) candidates.push({ raw: p, fromLink: false });

    const seen = new Set<string>();
    for (const { raw, fromLink } of candidates) {
      if (seen.has(raw)) continue;
      seen.add(raw);
      if (isSkippableRef(raw)) continue;
      if (!isBundleShaped(raw, fromLink)) continue;
      // A bare prose path to a runtime-output file (e.g. a `.tsv` the skill writes) is a
      // mention, not a bundled resource — skip. Explicit refs (links/${VAR}/Bash) still check.
      const hasVar = raw.includes('${CLAUDE_');
      if (!fromLink && !hasVar && isLikelyOutputFile(raw)) continue;
      // A ${VAR}/Bash-grant ref is always ours; a plain .md ref belongs to the existing
      // resolver in plugin formats.
      if (deferMdRefs && !hasVar && raw.toLowerCase().endsWith('.md')) continue;

      const expanded = expandSkillVars(raw, skillDir, projectRoot);
      const absPath = isAbsolute(expanded) ? expanded : resolve(skillDir, expanded);
      // Resolved if the target is a known extracted file OR exists on disk.
      if (filePathSet.has(absPath) || existsSync(absPath)) continue;

      const line = findLine(originalBody, raw);
      results.push({
        filePath: file.filePath,
        rule: 'broken-reference',
        severity: 'error',
        message: `Broken reference to "${raw}"`,
        ...(line !== undefined ? { line } : {}),
      });
    }
  }

  return results;
}

/**
 * Detect orphaned files: context or agent files that no command/skill references.
 * Uses canonical names so that references resolve regardless of repo structure.
 *
 * For legacy-commands: only command files are referencing entities.
 * For plugin/multi-plugin: both command and skill files are referencing entities.
 */
function detectOrphans(
  files: ExtractResult[],
  format: RepoFormat | undefined,
  rootDir: string | undefined,
  filePathSet: Set<string>,
  pathToFile: Map<string, ExtractResult>,
  index: CanonicalIndex,
  skillRoots: Set<string>,
): ValidationResult[] {
  const results: ValidationResult[] = [];

  const isPluginFormat = format === 'plugin' || format === 'multi-plugin';

  // Collect all canonical names referenced from command (and skill) files.
  const referencedCanonical = new Set<string>();

  // Referencing file types: command always, skill for plugin formats.
  const referencingTypes = new Set<string>(['command']);
  if (isPluginFormat) {
    referencingTypes.add('skill');
  }

  for (const file of files) {
    if (file.errors.length > 0) continue;
    if (!referencingTypes.has(file.fileType)) continue;

    const bodyText = (file.data['___body_text'] as string) ?? '';
    const refs = resolveAllRefs(
      bodyText, file.filePath, format, rootDir, filePathSet, pathToFile, index, skillRoots,
    );
    for (const ref of refs) {
      referencedCanonical.add(ref.normalized);
      // AC-6: If resolved via relative path, also add the canonical name of the target.
      if (ref.resolvedPath) {
        const targetFile = pathToFile.get(ref.resolvedPath);
        if (targetFile) {
          referencedCanonical.add(canonicalName(targetFile.filePath, targetFile.fileType));
        }
      }
    }
  }

  // Check context and agent files by their canonical name.
  for (const file of files) {
    if (file.errors.length > 0) continue;
    if (file.fileType !== 'context' && file.fileType !== 'agent') continue;

    const cn = canonicalName(file.filePath, file.fileType);
    if (!referencedCanonical.has(cn)) {
      const entityLabel = isPluginFormat ? 'command or skill' : 'command';
      results.push({
        filePath: file.filePath,
        rule: 'orphaned-file',
        severity: 'warning',
        message: `File is not referenced by any ${entityLabel}`,
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
 *
 * AC-9: For plugin format, adjacency uses canonical names derived from resolved
 * relative paths.
 */
function detectCycles(
  files: ExtractResult[],
  index: CanonicalIndex,
  format: RepoFormat | undefined,
  rootDir: string | undefined,
  filePathSet: Set<string>,
  pathToFile: Map<string, ExtractResult>,
  skillRoots: Set<string>,
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
    const refs = resolveAllRefs(
      bodyText, file.filePath, format, rootDir, filePathSet, pathToFile, index, skillRoots,
    );
    const targets = refs
      .map((r) => r.normalized)
      .filter((t) => index.nameToPath.has(t));

    adjacency.set(key, targets);
  }

  // DFS cycle detection.
  const color = new Map<string, Color>();
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
 *
 * For plugin/multi-plugin formats, relative path references are also supported.
 * Relative paths are resolved against the referencing file's directory and checked
 * against the extracted file set.
 */
export function validateGraph(
  files: ExtractResult[],
  config: Config,
  rootDir?: string,
): ValidationResult[] {
  const results: ValidationResult[] = [];
  const format = config.format;

  // Build canonical name index for reference resolution.
  const index = buildCanonicalIndex(files);

  // Build file path set and reverse index for relative path resolution.
  const filePathSet = buildFilePathSet(files);
  const pathToFile = buildPathToFile(files);

  // Build skill root directories for skill-root-relative reference resolution.
  const skillRoots = buildSkillRoots(files);

  // Name collisions (always checked — these are install-time bugs).
  results.push(...detectNameCollisions(index));

  // Broken references.
  results.push(...detectBrokenRefs(files, index, format, rootDir, filePathSet, pathToFile, skillRoots));

  // Progressive-disclosure bundle references in SKILL.md bodies + allowed-tools grants.
  results.push(...detectSkillBundleRefs(files, format, rootDir, filePathSet));

  // SR-010: name↔directory mismatch also surfaces from the graph pass (parity with lint).
  for (const file of files) {
    if (file.errors.length > 0) continue;
    const mismatch = checkNameDirMismatch(file, format);
    if (mismatch) results.push(mismatch);
  }

  // Orphaned files (only if enabled).
  if (config.graph.warn_orphans) {
    results.push(...detectOrphans(files, format, rootDir, filePathSet, pathToFile, index, skillRoots));
  }

  // Duplicate content (only if enabled).
  if (config.graph.detect_duplicates) {
    results.push(...detectDuplicates(files));
  }

  // Cycle detection (only if enabled).
  if (config.graph.detect_cycles) {
    results.push(...detectCycles(files, index, format, rootDir, filePathSet, pathToFile, skillRoots));
  }

  return results;
}
