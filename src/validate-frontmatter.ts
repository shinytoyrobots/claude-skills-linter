import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import spectralCore from '@stoplight/spectral-core';
import spectralFunctions from '@stoplight/spectral-functions';
import type { ExtractResult, ValidationResult } from './types.js';

const { Spectral } = spectralCore;
const { schema } = spectralFunctions;

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Map Spectral severity numbers to our string severities. */
const SEVERITY_MAP: Record<number, ValidationResult['severity']> = {
  0: 'error',
  1: 'warning',
  2: 'info',
  3: 'info',
};

/** Load a JSON schema from the schemas/ directory. */
function loadSchema(filename: string): Record<string, unknown> {
  const schemaPath = resolve(__dirname, '..', 'schemas', filename);
  return JSON.parse(readFileSync(schemaPath, 'utf-8')) as Record<string, unknown>;
}

const commandSchema = loadSchema('command.schema.json');
const agentSchema = loadSchema('agent.schema.json');

/** A rule definition with the x-skill-lint-level extension. */
export interface LevelRule {
  given: string;
  severity: number;
  message: string;
  then: {
    function: unknown;
    functionOptions?: unknown;
  };
  extensions: { 'x-skill-lint-level': number };
}

/**
 * Build the Level 0 ruleset programmatically.
 *
 * Rules:
 * - required-fields-command: JSON Schema validation for command frontmatter
 * - required-fields-agent: JSON Schema validation for agent frontmatter
 * - non-empty-body: Checks ___body_length > 0
 *
 * Each rule carries `extensions: { 'x-skill-lint-level': 0 }`.
 */
function buildRules(): Record<string, LevelRule> {
  const sharedExtensions = { 'x-skill-lint-level': 0 as const };

  /** Custom inline function: checks ___body_length > 0. */
  const nonEmptyBodyFn = (targetVal: unknown): Array<{ message: string }> => {
    const target = targetVal as Record<string, unknown>;
    const bodyLength = target['___body_length'];
    if (typeof bodyLength === 'number' && bodyLength <= 0) {
      return [{ message: 'File body must not be empty' }];
    }
    return [];
  };

  return {
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
      extensions: sharedExtensions,
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
      extensions: sharedExtensions,
    },

    'non-empty-body': {
      given: '$',
      severity: 0,
      message: 'File body must not be empty',
      then: {
        function: nonEmptyBodyFn,
      },
      extensions: sharedExtensions,
    },
  };
}

/**
 * Determine which rules to enable for a given file type.
 * - command: required-fields-command + non-empty-body
 * - agent: required-fields-agent + non-empty-body
 * - legacy-agent, context, unknown: non-empty-body only
 */
function getRulesForFileType(fileType: string): Set<string> {
  switch (fileType) {
    case 'command':
      return new Set(['required-fields-command', 'non-empty-body']);
    case 'agent':
      return new Set(['required-fields-agent', 'non-empty-body']);
    default:
      return new Set(['non-empty-body']);
  }
}

/**
 * Validate extracted frontmatter against Spectral Level 0 rules.
 *
 * For each ExtractResult:
 * - If it has pre-existing errors, converts them to ValidationResults (skips Spectral).
 * - Otherwise, runs the appropriate Spectral rules based on file type and level filter.
 */
export async function validateFrontmatter(
  results: ExtractResult[],
  level: number,
): Promise<ValidationResult[]> {
  const validationResults: ValidationResult[] = [];
  const allRules = buildRules();

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

    // Determine which rules apply to this file type.
    const enabledRuleNames = getRulesForFileType(result.fileType);

    // Build the filtered ruleset: only include rules matching file type + level.
    // Spectral throws if you set a rule to 'off' that was never defined,
    // so we simply omit non-applicable rules.
    const spectralRules: Record<string, unknown> = {};
    for (const [name, rule] of Object.entries(allRules)) {
      if (!enabledRuleNames.has(name)) continue;
      if (rule.extensions['x-skill-lint-level'] > level) continue;
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
    spectral.setRuleset({ rules: spectralRules } as never);

    const spectralResults = await spectral.run(result.data);

    for (const sr of spectralResults) {
      validationResults.push({
        filePath: result.filePath,
        rule: sr.code as string,
        severity: SEVERITY_MAP[sr.severity] ?? 'info',
        message: sr.message,
      });
    }
  }

  return validationResults;
}

/**
 * Get the full Level 0 rules for inspection (e.g., testing AC-9).
 * Returns the raw rules object with extensions metadata.
 */
export function getRuleset(): Record<string, LevelRule> {
  return buildRules();
}
