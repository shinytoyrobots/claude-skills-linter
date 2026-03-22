import { createHash } from 'node:crypto';
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
const REF_PATTERN = /(?:~\/\.claude\/commands\/)?(?:(?:agents|context|commands)\/)+[\w][\w.\-]*\.md/g;
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
 * Build a canonical key for looking up files by their repo-relative path.
 * The ExtractResult filePath is absolute; we derive a repo-relative key
 * by stripping the skills_root prefix (with trailing slash).
 */
function fileKey(filePath, skillsRoot) {
    const root = skillsRoot.endsWith('/') ? skillsRoot : skillsRoot + '/';
    if (filePath.startsWith(root)) {
        return filePath.slice(root.length);
    }
    // Fallback: use the full path (shouldn't normally happen).
    return filePath;
}
/**
 * Extract references from a single file's body text.
 * Returns an array of { raw, normalized } reference objects.
 */
function extractRefs(bodyText) {
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
 * Detect broken references: references that don't resolve to any file in the set.
 */
function detectBrokenRefs(files, fileSet, skillsRoot) {
    const results = [];
    for (const file of files) {
        if (file.errors.length > 0)
            continue;
        const bodyText = file.data['___body_text'] ?? '';
        const refs = extractRefs(bodyText);
        for (const ref of refs) {
            if (!fileSet.has(ref.normalized)) {
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
 */
function detectOrphans(files, skillsRoot) {
    const results = [];
    // Collect all references from command files only.
    const referencedKeys = new Set();
    for (const file of files) {
        if (file.errors.length > 0)
            continue;
        if (file.fileType !== 'command')
            continue;
        const bodyText = file.data['___body_text'] ?? '';
        const refs = extractRefs(bodyText);
        for (const ref of refs) {
            referencedKeys.add(ref.normalized);
        }
    }
    // Check context and agent files.
    for (const file of files) {
        if (file.errors.length > 0)
            continue;
        if (file.fileType !== 'context' && file.fileType !== 'agent')
            continue;
        const key = fileKey(file.filePath, skillsRoot);
        if (!referencedKeys.has(key)) {
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
 */
function detectCycles(files, fileSet, skillsRoot) {
    const results = [];
    // Build adjacency list using repo-relative keys.
    const adjacency = new Map();
    const keyToFilePath = new Map();
    for (const file of files) {
        if (file.errors.length > 0)
            continue;
        const key = fileKey(file.filePath, skillsRoot);
        keyToFilePath.set(key, file.filePath);
        const bodyText = file.data['___body_text'] ?? '';
        const refs = extractRefs(bodyText);
        const targets = refs
            .map((r) => r.normalized)
            .filter((t) => fileSet.has(t));
        adjacency.set(key, targets);
    }
    // DFS cycle detection.
    const color = new Map();
    const parent = new Map();
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
 * Validate cross-file references, orphans, duplicates, and cycles.
 *
 * This is the main graph validation entry point. It processes an array
 * of ExtractResults and returns ValidationResults for any issues found.
 */
export function validateGraph(files, config) {
    const results = [];
    const skillsRoot = config.skills_root;
    // Build the set of known file keys (repo-relative paths).
    const validFiles = files.filter((f) => f.errors.length === 0);
    const fileSet = new Set(validFiles.map((f) => fileKey(f.filePath, skillsRoot)));
    // AC-1, AC-2: Broken references.
    results.push(...detectBrokenRefs(files, fileSet, skillsRoot));
    // AC-3: Orphaned files (only if enabled).
    if (config.graph.warn_orphans) {
        results.push(...detectOrphans(files, skillsRoot));
    }
    // AC-4: Duplicate content (only if enabled).
    if (config.graph.detect_duplicates) {
        results.push(...detectDuplicates(files));
    }
    // AC-5: Cycle detection (only if enabled).
    if (config.graph.detect_cycles) {
        results.push(...detectCycles(files, fileSet, skillsRoot));
    }
    return results;
}
//# sourceMappingURL=validate-graph.js.map