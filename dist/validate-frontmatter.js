import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import spectralCore from '@stoplight/spectral-core';
import spectralFunctions from '@stoplight/spectral-functions';
import { resolveLevel } from './profiles.js';
const { Spectral } = spectralCore;
const { schema } = spectralFunctions;
const __dirname = dirname(fileURLToPath(import.meta.url));
/** Map Spectral severity numbers to our string severities. */
const SEVERITY_MAP = {
    0: 'error',
    1: 'warning',
    2: 'info',
    3: 'info',
};
/** Load a JSON schema from the schemas/ directory. */
function loadSchema(filename) {
    const schemaPath = resolve(__dirname, '..', 'schemas', filename);
    return JSON.parse(readFileSync(schemaPath, 'utf-8'));
}
const commandSchema = loadSchema('command.schema.json');
const agentSchema = loadSchema('agent.schema.json');
const skillSchema = loadSchema('skill.schema.json');
/** Known built-in Claude Code tools (PascalCase, case-sensitive). */
const BUILTIN_TOOLS = new Set([
    'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep', 'Agent',
    'WebSearch', 'WebFetch', 'AskUserQuestion', 'TodoRead', 'TodoWrite', 'NotebookEdit',
]);
/** Default config values used when no config is provided. */
const DEFAULT_CONFIG = {
    models: ['opus', 'sonnet', 'haiku'],
    tools: { mcp_pattern: 'mcp__*', custom: [] },
    limits: { max_file_size: 15360 },
};
/**
 * Build the complete ruleset (Level 0 + Level 1) programmatically.
 *
 * Level 0 rules:
 * - required-fields-command: JSON Schema validation for command frontmatter
 * - required-fields-agent: JSON Schema validation for agent frontmatter
 * - required-fields-skill: JSON Schema validation for skill (SKILL.md) frontmatter
 * - non-empty-body: Checks ___body_length > 0
 *
 * Level 1 rules:
 * - model-enum: Checks model value is in config.models list
 * - unknown-tool: Checks allowed-tools entries are known
 * - tools-not-in-body: Checks at least one allowed tool appears in body
 * - file-size-limit: Checks ___file_size <= config.limits.max_file_size
 * - skill-name-format: Checks skill name matches kebab-case pattern
 */
function buildRules(config) {
    const cfg = config ?? DEFAULT_CONFIG;
    const level0Extensions = { 'x-skill-lint-level': 0 };
    const level1Extensions = { 'x-skill-lint-level': 1 };
    /** Custom inline function: checks ___body_length > 0. */
    const nonEmptyBodyFn = (targetVal) => {
        const target = targetVal;
        const bodyLength = target['___body_length'];
        if (typeof bodyLength === 'number' && bodyLength <= 0) {
            return [{ message: 'File body must not be empty' }];
        }
        return [];
    };
    /** Custom inline function: checks model is in the allowed models list. */
    const modelEnumFn = (targetVal) => {
        if (targetVal === undefined || targetVal === null) {
            return [];
        }
        const models = cfg.models;
        if (!models.includes(String(targetVal))) {
            return [{ message: `model "${targetVal}" is not in the allowed list: ${models.join(', ')}` }];
        }
        return [];
    };
    /** Custom inline function: checks each tool in allowed-tools is known. */
    const unknownToolFn = (targetVal) => {
        if (!Array.isArray(targetVal) || targetVal.length === 0) {
            return [];
        }
        const customTools = new Set(cfg.tools.custom);
        const results = [];
        for (const tool of targetVal) {
            const name = String(tool);
            if (BUILTIN_TOOLS.has(name))
                continue;
            if (name.startsWith('mcp__'))
                continue;
            if (customTools.has(name))
                continue;
            results.push({ message: `unknown tool "${name}" in allowed-tools` });
        }
        return results;
    };
    /** Custom inline function: checks at least one allowed tool appears in body text. */
    const toolsNotInBodyFn = (targetVal) => {
        const target = targetVal;
        const allowedTools = target['allowed-tools'];
        if (!Array.isArray(allowedTools) || allowedTools.length === 0) {
            return [];
        }
        const bodyText = String(target['___body_text'] ?? '');
        const anyFound = allowedTools.some((tool) => bodyText.includes(String(tool)));
        if (!anyFound) {
            return [{ message: 'none of the declared allowed-tools appear in the file body' }];
        }
        return [];
    };
    /** Custom inline function: checks file size is within limit. */
    const fileSizeLimitFn = (targetVal) => {
        if (typeof targetVal !== 'number') {
            return [];
        }
        const limit = cfg.limits.max_file_size;
        if (targetVal > limit) {
            return [{ message: `file size ${targetVal} bytes exceeds limit of ${limit} bytes` }];
        }
        return [];
    };
    /** Custom inline function: checks skill name matches kebab-case pattern. */
    const skillNameFormatFn = (targetVal) => {
        if (targetVal === undefined || targetVal === null || typeof targetVal !== 'string') {
            return [];
        }
        const pattern = /^[a-z][a-z0-9-]*$/;
        if (!pattern.test(targetVal)) {
            return [{ message: `skill name "${targetVal}" does not match kebab-case pattern ^[a-z][a-z0-9-]*$` }];
        }
        return [];
    };
    return {
        // Level 0 rules
        'required-fields-command': {
            given: '$',
            severity: 0,
            message: '{{error}}',
            then: {
                function: schema,
                functionOptions: {
                    schema: commandSchema,
                    allErrors: true,
                },
            },
            extensions: level0Extensions,
        },
        'required-fields-agent': {
            given: '$',
            severity: 0,
            message: '{{error}}',
            then: {
                function: schema,
                functionOptions: {
                    schema: agentSchema,
                    allErrors: true,
                },
            },
            extensions: level0Extensions,
        },
        'required-fields-skill': {
            given: '$',
            severity: 0,
            message: '{{error}}',
            then: {
                function: schema,
                functionOptions: {
                    schema: skillSchema,
                    allErrors: true,
                },
            },
            extensions: level0Extensions,
        },
        'non-empty-body': {
            given: '$',
            severity: 0,
            message: 'File body must not be empty',
            then: {
                function: nonEmptyBodyFn,
            },
            extensions: level0Extensions,
        },
        // Level 1 rules
        'skill-name-format': {
            given: '$.name',
            severity: 1,
            message: '{{error}}',
            then: {
                function: skillNameFormatFn,
            },
            extensions: level1Extensions,
        },
        'model-enum': {
            given: '$.model',
            severity: 0,
            message: '{{error}}',
            then: {
                function: modelEnumFn,
            },
            extensions: level1Extensions,
        },
        'unknown-tool': {
            given: '$.allowed-tools',
            severity: 1,
            message: '{{error}}',
            then: {
                function: unknownToolFn,
            },
            extensions: level1Extensions,
        },
        'tools-not-in-body': {
            given: '$',
            severity: 1,
            message: '{{error}}',
            then: {
                function: toolsNotInBodyFn,
            },
            extensions: level1Extensions,
        },
        'file-size-limit': {
            given: '$.___file_size',
            severity: 1,
            message: '{{error}}',
            then: {
                function: fileSizeLimitFn,
            },
            extensions: level1Extensions,
        },
    };
}
/**
 * Determine which rules to enable for a given file type.
 * - command: Level 0 schema + body + all Level 1 rules
 * - agent: Level 0 schema + body + model-enum + file-size-limit (not tool rules)
 * - skill: Level 0 schema + body + skill-name-format + file-size-limit
 * - legacy-agent, context, readme, unknown: Level 0 body only
 */
function getRulesForFileType(fileType) {
    switch (fileType) {
        case 'command':
            return new Set([
                'required-fields-command', 'non-empty-body',
                'model-enum', 'unknown-tool', 'tools-not-in-body', 'file-size-limit',
            ]);
        case 'agent':
            return new Set([
                'required-fields-agent', 'non-empty-body',
                'model-enum', 'file-size-limit',
            ]);
        case 'skill':
            return new Set([
                'required-fields-skill', 'non-empty-body',
                'skill-name-format', 'model-enum', 'unknown-tool', 'tools-not-in-body', 'file-size-limit',
            ]);
        default:
            return new Set(['non-empty-body']);
    }
}
/**
 * Validate extracted frontmatter against Spectral rules (Level 0 + Level 1).
 *
 * For each ExtractResult:
 * - If it has pre-existing errors, converts them to ValidationResults (skips Spectral).
 * - Otherwise, resolves the effective quality level per file and runs appropriate rules.
 *
 * The `cliLevel` parameter sets a floor: effectiveLevel = max(resolvedLevel, cliLevel).
 * When no files declare `quality_level` and no directory overrides exist,
 * behavior is identical to the previous global-level approach.
 *
 * @param results - Extracted frontmatter results to validate.
 * @param cliLevel - CLI --level flag value (floor for effective level).
 * @param config - Optional config for model list, tool registry, limits, levels, and skills_root.
 */
export async function validateFrontmatter(results, cliLevel, config) {
    const validationResults = [];
    const allRules = buildRules(config);
    // Build profile config for resolveLevel — use defaults if not provided.
    const profileConfig = {
        default_level: config?.default_level ?? 0,
        levels: config?.levels ?? {},
        skills_root: config?.skills_root ?? '.',
    };
    for (const result of results) {
        // AC-6: Pre-existing errors pass through, skip Spectral.
        if (result.errors.length > 0) {
            for (const err of result.errors) {
                validationResults.push({
                    filePath: err.filePath,
                    rule: 'parse-error',
                    severity: 'error',
                    message: err.message,
                });
            }
            continue;
        }
        // Resolve per-file quality level.
        // resolveLevel returns:
        //   -1  → out-of-range quality_level (warn, fall back to cliLevel)
        //   -2  → no file/dir override, used default_level (cliLevel wins)
        //   0-3 → explicit file or directory override
        const resolvedLevel = resolveLevel(result.filePath, result.data, profileConfig);
        let effectiveLevel;
        if (resolvedLevel === -1) {
            // Out-of-range quality_level — warn and use default.
            const badValue = result.data['quality_level'];
            process.stderr.write(`warning: ${result.filePath}: quality_level ${badValue} is out of range (0-3), using default_level ${profileConfig.default_level}\n`);
            effectiveLevel = Math.max(profileConfig.default_level, cliLevel);
        }
        else if (resolvedLevel === -2) {
            // No explicit file or directory override — cliLevel is the effective level.
            // This preserves backward compatibility: when no files declare quality_level,
            // the global --level flag behavior is unchanged.
            effectiveLevel = cliLevel;
        }
        else {
            // Explicit file or directory level — apply max(resolved, cliLevel).
            effectiveLevel = Math.max(resolvedLevel, cliLevel);
        }
        // Determine which rules apply to this file type.
        const enabledRuleNames = getRulesForFileType(result.fileType);
        // Build the filtered ruleset: only include rules matching file type + effective level.
        const spectralRules = {};
        for (const [name, rule] of Object.entries(allRules)) {
            if (!enabledRuleNames.has(name))
                continue;
            if (rule.extensions['x-skill-lint-level'] > effectiveLevel)
                continue;
            spectralRules[name] = {
                given: rule.given,
                severity: rule.severity,
                message: rule.message,
                then: rule.then,
            };
        }
        const spectral = new Spectral();
        // Use type assertion — Spectral's RulesetDefinition type is complex but
        // this shape is valid at runtime (confirmed in spike).
        spectral.setRuleset({ rules: spectralRules });
        const spectralResults = await spectral.run(result.data);
        for (const sr of spectralResults) {
            validationResults.push({
                filePath: result.filePath,
                rule: sr.code,
                severity: SEVERITY_MAP[sr.severity] ?? 'info',
                message: sr.message,
                effectiveLevel,
            });
        }
    }
    return validationResults;
}
/**
 * Get the full ruleset for inspection (e.g., testing).
 * Returns the raw rules object with extensions metadata.
 */
export function getRuleset(config) {
    return buildRules(config);
}
//# sourceMappingURL=validate-frontmatter.js.map