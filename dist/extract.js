import { readFileSync, existsSync } from 'node:fs';
import matter from 'gray-matter';
import { glob } from 'glob';
import { join } from 'node:path';
import { classifyFile } from './classify.js';
/**
 * Extract frontmatter and synthetic metadata from a single markdown file.
 *
 * Returns a structured ExtractResult — never throws. Parse errors are
 * captured in the `errors` array.
 */
export function extractFile(filePath) {
    const errors = [];
    let raw;
    let fileSize;
    try {
        const buf = readFileSync(filePath);
        fileSize = buf.byteLength;
        raw = buf.toString('utf-8');
    }
    catch (err) {
        return {
            data: {},
            errors: [
                {
                    message: `Failed to read file: ${err.message}`,
                    filePath,
                },
            ],
            filePath,
            fileType: 'unknown',
        };
    }
    let data = {};
    let body = '';
    let hasFrontmatter = false;
    try {
        const parsed = matter(raw);
        data = parsed.data;
        body = parsed.content;
        // gray-matter returns an empty object when there is no frontmatter,
        // but it also returns an empty object for `---\n---`. Detect real
        // frontmatter by checking whether the raw input starts with the
        // delimiter.
        hasFrontmatter = raw.trimStart().startsWith('---');
    }
    catch (err) {
        // Invalid YAML — capture the error, keep going with body-only result (AC-4).
        errors.push({
            message: `YAML parse error: ${err.message}`,
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
    data['___file_size'] = fileSize;
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
function pluginPatterns(root) {
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
function multiPluginPatterns(root) {
    return [
        `${root}/plugins/*/skills/**/*.md`,
        `${root}/plugins/*/context/*.md`,
        `${root}/plugins/*/agents/*.md`,
    ];
}
/**
 * Build glob patterns for project-skills format discovery.
 *
 * Project-skills: **\/.claude/skills/{name}/**\/*.md (all markdown in skill dirs)
 * The ** prefix matches zero or more path segments, so this discovers BOTH
 * root-level .claude/skills/ AND nested monorepo .claude/skills/ directories
 * (e.g. packages/frontend/.claude/skills/). node_modules exclusion in the
 * glob ignore list prevents discovery there.
 */
function projectSkillsPatterns(root) {
    return [
        `${root}/**/.claude/skills/**/*.md`,
    ];
}
/**
 * Build glob patterns for legacy directory discovery.
 *
 * Legacy: commands/**\/*.md, agents/**\/*.md, context/**\/*.md
 */
function legacyPatterns(root) {
    return [
        `${root}/commands/**/*.md`,
        `${root}/agents/**/*.md`,
        `${root}/context/**/*.md`,
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
export async function extractAll(patterns, ignore = [], format) {
    let effectivePatterns;
    if (format === 'plugin' || format === 'multi-plugin' || format === 'project-skills') {
        // For structured formats, the first pattern is expected to be a glob
        // rooted at the skills root. Extract the root directory from it.
        // Convention: patterns[0] is something like "/path/to/root/**/*.md"
        // We take the root from patterns[0] by stripping the glob suffix.
        const root = extractRoot(patterns);
        if (format === 'plugin') {
            effectivePatterns = pluginPatterns(root);
            // AC-3b (story-032): plugin format + .claude/skills/ → also extract project-skills
            if (existsSync(join(root, '.claude', 'skills'))) {
                effectivePatterns.push(...projectSkillsPatterns(root));
            }
        }
        else if (format === 'multi-plugin') {
            effectivePatterns = multiPluginPatterns(root);
            // AC-3b (story-032): multi-plugin format + .claude/skills/ → also extract project-skills
            if (existsSync(join(root, '.claude', 'skills'))) {
                effectivePatterns.push(...projectSkillsPatterns(root));
            }
        }
        else {
            // project-skills format
            effectivePatterns = projectSkillsPatterns(root);
            // AC-3 (story-032): project-skills + legacy dirs → extract from BOTH
            if (existsSync(join(root, 'commands')) ||
                existsSync(join(root, 'agents')) ||
                existsSync(join(root, 'context'))) {
                effectivePatterns.push(...legacyPatterns(root));
            }
        }
    }
    else {
        effectivePatterns = patterns;
    }
    const files = [];
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
function extractRoot(patterns) {
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
//# sourceMappingURL=extract.js.map