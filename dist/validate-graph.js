import { createHash } from 'node:crypto';
import { basename, dirname, resolve, relative } from 'node:path';
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
const REF_PATTERN = /(?<![\w.\-\/])(?:~\/\.claude\/commands\/)?(?:(?:agents|context|commands)\/)+[\w][\w.\-]*\.md/g;
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
const RELATIVE_REF_PATTERN = /\.\.?\/[^\s)]*\.md/g;
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
const BARE_REF_PATTERN = new RegExp(`(?<![.\\w\\-\\/])(?:${BARE_SUBDIRECTORY_PREFIXES.join('|')})\\/[\\w][\\w.\\-/]*\\.md`, 'g');
/**
 * Normalize a raw reference path to repo-relative form.
 *
 * - Strips the `~/.claude/commands/` prefix if present.
 * - The result is relative to the skills root directory.
 */
function normalizePath(raw) {
    if (raw.startsWith(INSTALLED_PREFIX)) {
        return raw.slice(INSTALLED_PREFIX.length);
    }
    return raw;
}
/**
 * Find the 1-based line number where `needle` appears in `text`.
 * Returns undefined if not found.
 */
function findLine(text, needle) {
    const idx = text.indexOf(needle);
    if (idx === -1)
        return undefined;
    // Count newlines before the match.
    let line = 1;
    for (let i = 0; i < idx; i++) {
        if (text[i] === '\n')
            line++;
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
function canonicalName(filePath, fileType) {
    // For skill files (SKILL.md), identity comes from the parent directory name
    // (the skill folder), not the filename — every skill file is named SKILL.md
    // so using the filename would produce collisions in multi-plugin repos.
    const name = fileType === 'skill'
        ? basename(dirname(filePath))
        : basename(filePath);
    // Map fileType to the directory name Claude Code uses on install.
    const typeDir = fileType === 'command' ? 'commands' :
        fileType === 'agent' || fileType === 'legacy-agent' ? 'agents' :
            fileType === 'context' ? 'context' :
                fileType === 'skill' ? 'skills' :
                    fileType; // readme, unknown — won't typically be referenced
    return `${typeDir}/${name}`;
}
function buildCanonicalIndex(files) {
    const nameToPath = new Map();
    const collisions = new Map();
    for (const file of files) {
        if (file.errors.length > 0)
            continue;
        const cn = canonicalName(file.filePath, file.fileType);
        const existing = nameToPath.get(cn);
        if (existing !== undefined) {
            // Collision — track both files.
            const list = collisions.get(cn) ?? [existing];
            list.push(file.filePath);
            collisions.set(cn, list);
        }
        else {
            nameToPath.set(cn, file.filePath);
        }
    }
    return { nameToPath, collisions };
}
/**
 * Build a set of absolute file paths from the extracted file set.
 * Used for relative path resolution in plugin format repos.
 */
function buildFilePathSet(files) {
    const pathSet = new Set();
    for (const file of files) {
        if (file.errors.length > 0)
            continue;
        pathSet.add(file.filePath);
    }
    return pathSet;
}
/**
 * Build a reverse index from absolute file path to its ExtractResult.
 * Used for looking up fileType after resolving a relative path.
 */
function buildPathToFile(files) {
    const map = new Map();
    for (const file of files) {
        if (file.errors.length > 0)
            continue;
        map.set(file.filePath, file);
    }
    return map;
}
/**
 * Extract canonical (non-relative) references from a single file's body text.
 * Returns an array of { raw, normalized } reference objects.
 *
 * This function extracts ONLY the legacy installed-path and type/filename patterns.
 * Relative path extraction is handled separately.
 */
export function extractRefs(bodyText) {
    const refs = [];
    const seen = new Set();
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
export function extractRelativeRefs(bodyText) {
    const refs = [];
    const seen = new Set();
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
export function extractBareRefs(bodyText) {
    const refs = [];
    const seen = new Set();
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
function escapesRepo(resolvedPath, rootDir) {
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
function resolveAllRefs(bodyText, sourceFilePath, format, rootDir, filePathSet, pathToFile, index) {
    const resolved = [];
    const seenNormalized = new Set();
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
            }
            else {
                // Relative path didn't resolve — mark for broken-reference.
                resolved.push({
                    raw: ref.raw,
                    normalized: ref.raw,
                    isRelative: true,
                });
                seenNormalized.add(ref.raw);
            }
        }
    }
    // For plugin/multi-plugin formats, resolve bare subdirectory refs.
    if (isPluginFormat && rootDir) {
        const bareRefs = extractBareRefs(bodyText);
        const sourceDir = dirname(sourceFilePath);
        for (const ref of bareRefs) {
            // Skip if already seen (e.g., matched by RELATIVE_REF_PATTERN).
            if (seenNormalized.has(ref.raw))
                continue;
            // Try relative resolution first.
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
            }
            else {
                // Canonical fallback: check if the raw ref matches a canonical name.
                if (index.nameToPath.has(ref.raw)) {
                    resolved.push({
                        raw: ref.raw,
                        normalized: ref.raw,
                        isRelative: false,
                    });
                    seenNormalized.add(ref.raw);
                }
                else {
                    // Neither relative nor canonical resolved — broken ref.
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
            if (seenNormalized.has(ref.normalized))
                continue;
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
            }
            else {
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
    else {
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
function detectBrokenRefs(files, index, format, rootDir, filePathSet, pathToFile) {
    const results = [];
    for (const file of files) {
        if (file.errors.length > 0)
            continue;
        const bodyText = file.data['___body_text'] ?? '';
        const refs = resolveAllRefs(bodyText, file.filePath, format, rootDir, filePathSet, pathToFile, index);
        for (const ref of refs) {
            if (ref.resolvedPath)
                continue; // Successfully resolved via relative path.
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
            }
            else {
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
/**
 * Detect orphaned files: context or agent files that no command/skill references.
 * Uses canonical names so that references resolve regardless of repo structure.
 *
 * For legacy-commands: only command files are referencing entities.
 * For plugin/multi-plugin: both command and skill files are referencing entities.
 */
function detectOrphans(files, format, rootDir, filePathSet, pathToFile, index) {
    const results = [];
    const isPluginFormat = format === 'plugin' || format === 'multi-plugin';
    // Collect all canonical names referenced from command (and skill) files.
    const referencedCanonical = new Set();
    // Referencing file types: command always, skill for plugin formats.
    const referencingTypes = new Set(['command']);
    if (isPluginFormat) {
        referencingTypes.add('skill');
    }
    for (const file of files) {
        if (file.errors.length > 0)
            continue;
        if (!referencingTypes.has(file.fileType))
            continue;
        const bodyText = file.data['___body_text'] ?? '';
        const refs = resolveAllRefs(bodyText, file.filePath, format, rootDir, filePathSet, pathToFile, index);
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
        if (file.errors.length > 0)
            continue;
        if (file.fileType !== 'context' && file.fileType !== 'agent')
            continue;
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
function detectDuplicates(files) {
    const results = [];
    const hashMap = new Map(); // hash → first file path
    for (const file of files) {
        if (file.errors.length > 0)
            continue;
        // Hash the full raw content: frontmatter + body.
        // We reconstruct from the data fields available.
        // Since we have ___body_text and the original data, use a consistent representation.
        // The simplest approach: hash the body_text + JSON of non-synthetic data keys.
        const bodyText = file.data['___body_text'] ?? '';
        const nonSynthetic = {};
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
        }
        else {
            hashMap.set(hash, file.filePath);
        }
    }
    return results;
}
/**
 * Detect cycles in the reference graph using DFS with WHITE/GRAY/BLACK coloring.
 * Uses canonical names for adjacency so references resolve across any repo structure.
 *
 * AC-9: For plugin format, adjacency uses canonical names derived from resolved
 * relative paths.
 */
function detectCycles(files, index, format, rootDir, filePathSet, pathToFile) {
    const results = [];
    // Build adjacency list using canonical names.
    const adjacency = new Map();
    const keyToFilePath = new Map();
    for (const file of files) {
        if (file.errors.length > 0)
            continue;
        const key = canonicalName(file.filePath, file.fileType);
        keyToFilePath.set(key, file.filePath);
        const bodyText = file.data['___body_text'] ?? '';
        const refs = resolveAllRefs(bodyText, file.filePath, format, rootDir, filePathSet, pathToFile, index);
        const targets = refs
            .map((r) => r.normalized)
            .filter((t) => index.nameToPath.has(t));
        adjacency.set(key, targets);
    }
    // DFS cycle detection.
    const color = new Map();
    const reportedCycles = new Set();
    for (const key of adjacency.keys()) {
        color.set(key, 0 /* Color.WHITE */);
    }
    function dfs(node, path) {
        color.set(node, 1 /* Color.GRAY */);
        const neighbors = adjacency.get(node) ?? [];
        for (const neighbor of neighbors) {
            const neighborColor = color.get(neighbor);
            if (neighborColor === 1 /* Color.GRAY */) {
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
            }
            else if (neighborColor === 0 /* Color.WHITE */ || neighborColor === undefined) {
                dfs(neighbor, [...path, neighbor]);
            }
            // BLACK nodes are fully explored — skip.
        }
        color.set(node, 2 /* Color.BLACK */);
    }
    for (const key of adjacency.keys()) {
        if (color.get(key) === 0 /* Color.WHITE */) {
            dfs(key, [key]);
        }
    }
    return results;
}
/**
 * Detect name collisions: multiple files that would map to the same installed
 * path (same type + basename). These would overwrite each other on install.
 */
function detectNameCollisions(index) {
    const results = [];
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
export function validateGraph(files, config, rootDir) {
    const results = [];
    const format = config.format;
    // Build canonical name index for reference resolution.
    const index = buildCanonicalIndex(files);
    // Build file path set and reverse index for relative path resolution.
    const filePathSet = buildFilePathSet(files);
    const pathToFile = buildPathToFile(files);
    // Name collisions (always checked — these are install-time bugs).
    results.push(...detectNameCollisions(index));
    // Broken references.
    results.push(...detectBrokenRefs(files, index, format, rootDir, filePathSet, pathToFile));
    // Orphaned files (only if enabled).
    if (config.graph.warn_orphans) {
        results.push(...detectOrphans(files, format, rootDir, filePathSet, pathToFile, index));
    }
    // Duplicate content (only if enabled).
    if (config.graph.detect_duplicates) {
        results.push(...detectDuplicates(files));
    }
    // Cycle detection (only if enabled).
    if (config.graph.detect_cycles) {
        results.push(...detectCycles(files, index, format, rootDir, filePathSet, pathToFile));
    }
    return results;
}
//# sourceMappingURL=validate-graph.js.map