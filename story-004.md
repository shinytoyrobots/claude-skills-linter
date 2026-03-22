---
id: story-004
title: "JSON Schemas for command and agent frontmatter"
epic: foundation
linear-id: null
sprint: 1
status: drafted
assigned-agent: backend-dev
priority: high
estimated-points: 2
depends-on:
  - story-001
hitl-checkpoint: false
schema-version: "1.0"
---

## Story

As the Spectral validation engine,
I want JSON Schema definitions for command and agent frontmatter,
So that Level 0 rules can validate required fields and basic structure.

## Acceptance Criteria

AC-1: WHEN a command file is validated against command.schema.json,
      THE SYSTEM SHALL require `description` as a string field.

AC-2: WHEN a command file has optional fields `argument-hint` (string), `model` (string), or `allowed-tools` (array of strings),
      THE SYSTEM SHALL validate each field's type and reject type mismatches (e.g., `description: 123` → error).

AC-3: WHEN an agent file is validated against agent.schema.json,
      THE SYSTEM SHALL require `name` and `description` as string fields.

AC-4: WHEN an agent file has optional fields `tools` (array of strings — system execution tools) or `model` (string),
      THE SYSTEM SHALL validate their types. Note: agents use `tools` for system tool declarations; `allowed-tools` is command-only.

AC-5: WHEN a file has an empty or missing required field,
      THE SYSTEM SHALL produce a validation error whose message or JSON path contains the name of the missing field.

AC-6: WHEN a file contains additional frontmatter fields not defined in the schema,
      THE SYSTEM SHALL allow them without error (`additionalProperties: true`). Skill authors may add custom fields.

AC-7: WHEN each schema file is parsed,
      THE SYSTEM SHALL validate against the JSON Schema draft-07 meta-schema without errors.

AC-8: WHEN a `context` type file reaches schema validation,
      THE SYSTEM SHALL skip schema validation (no schema exists for context files). Context files are validated only at the graph level.

## Technical Context

### Files
- `schemas/command.schema.json` — JSON Schema draft-07 for command frontmatter
- `schemas/agent.schema.json` — JSON Schema draft-07 for agent frontmatter

### Schema Fields (from PLAN.md)
- Command: description (required), argument-hint (optional string), model (optional string), allowed-tools (optional array of strings)
- Agent: name (required), description (required), tools (optional array of strings — system execution tools), model (optional string)
- Context: no schema — skip validation, context files are graph-only
- Note: `allowed-tools` is command-specific (user-visible tool permissions). `tools` is agent-specific (system execution tools). They are distinct fields on different schemas.

### Usage
These schemas are referenced by the Spectral ruleset (`.spectral.yaml`) for structural validation.

## Implementation Tasks

- [ ] Task 1: Create command.schema.json with required/optional fields, additionalProperties: true (AC: #1, #2, #5, #6)
- [ ] Task 2: Create agent.schema.json with required/optional fields, additionalProperties: true (AC: #3, #4, #5, #6)
- [ ] Task 3: Validate both schemas against draft-07 meta-schema (AC: #7)
- [ ] Task 4: Write unit tests for type mismatches, missing required fields, extra fields, and context type skip behavior (AC: #1-#8)

## Dev Notes

> Examine actual skill files in `~/Development/claude-skills/` to verify field names match reality.
> Level 0 = structural validity only. Type checking and enum validation are Level 1+.
> These schemas feed into Spectral rules, not direct ajv validation.

## Definition of Done

- [ ] All acceptance criteria pass QA gate (AC-1 through AC-8)
- [ ] Both schemas validate against JSON Schema draft-07 meta-schema
- [ ] No TypeScript errors in strict mode
- [ ] `additionalProperties: true` confirmed in both schemas
- [ ] `tools` vs `allowed-tools` distinction verified against live skill files in ~/Development/claude-skills/
