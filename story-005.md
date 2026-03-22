---
id: story-005
title: "Spectral ruleset and frontmatter validator — Level 0 rules"
epic: foundation
linear-id: null
sprint: 1
status: drafted
assigned-agent: backend-dev
priority: high
estimated-points: 5
depends-on:
  - story-002
  - story-003
  - story-004
hitl-checkpoint: false
schema-version: "1.0"
---

## Story

As the lint command,
I want to validate extracted frontmatter against Spectral rules using the programmatic API,
So that Level 0 structural errors are caught before commit.

## Acceptance Criteria

AC-1: WHEN a command file has valid frontmatter with all required fields and a non-empty body,
      THE SYSTEM SHALL return an empty ValidationResult array when run with level=0 filter active.

AC-2: WHEN a command file is missing the `description` field,
      THE SYSTEM SHALL report a ValidationResult with rule name, severity, file path, and message.

AC-3: WHEN an agent file is missing the `name` field,
      THE SYSTEM SHALL report a ValidationResult with rule name, severity, file path, and message (same structure as AC-2).

AC-4: WHEN a file has a non-empty body (> 0 characters after frontmatter),
      THE SYSTEM SHALL pass the "non-empty body" Level 0 rule.

AC-5: WHEN a file has an empty body (0 characters after frontmatter),
      THE SYSTEM SHALL report an error for the "non-empty body" rule.

AC-6: WHEN an ExtractResult arrives with pre-existing errors (e.g., invalid YAML from gray-matter),
      THE SYSTEM SHALL skip Spectral validation for that file and pass through the existing errors as ValidationResults.

AC-7: WHEN a `legacy-agent` file type is validated,
      THE SYSTEM SHALL skip frontmatter schema validation (no frontmatter to validate) and apply only body-level rules (non-empty body).

AC-8: WHEN a `context` or `unknown` file type is validated,
      THE SYSTEM SHALL skip schema validation and apply only body-level rules.

AC-9: WHEN `.spectral.yaml` is parsed,
      EVERY rule entry SHALL have an `x-skill-lint-level` integer field indicating its minimum profile level.

## Technical Context

### Dependencies
- @stoplight/spectral-core ^1.18.0 (programmatic API)
- @stoplight/spectral-parsers ^1.0.0 (JSON parser for in-memory docs)

### Modules
- `spectral/.spectral.yaml` — ruleset with Level 0 rules + x-skill-lint-level tags
- `src/validate-frontmatter.ts` — wraps Spectral programmatic API

### Spectral Programmatic API (to verify)
```typescript
import { Spectral } from '@stoplight/spectral-core';
const spectral = new Spectral();
spectral.setRuleset(ruleset);
const results = await spectral.run(document);
```

### Level 0 Rules
1. Valid YAML frontmatter (parse succeeds)
2. Required fields present (per schema type)
3. Non-empty body

## Implementation Tasks

- [ ] Task 0: **SPIKE (2hr time-box)**: Verify Spectral programmatic API surface against current npm. Write a minimal script that imports Spectral, loads a ruleset, and validates an in-memory JSON document. If the API differs significantly from the assumed interface, STOP and escalate via HITL. Document findings in sprint-notes.md.
- [ ] Task 1: Create .spectral.yaml with Level 0 rules and x-skill-lint-level tags (AC: #9)
- [ ] Task 2: Implement validate-frontmatter.ts — load ruleset, run against extracted data, handle pre-existing errors and file type routing (AC: #1-#8)
- [ ] Task 3: Write unit tests: valid command, missing required fields, empty body, pre-existing errors, legacy-agent skip, context skip, unknown skip, x-skill-lint-level presence in YAML (AC: #1-#9)

## Dev Notes

> **HIGHEST-RISK STORY** — Spectral's programmatic API needs verification before any other task.
> Task 0 is a mandatory spike, executed as the **first development activity of the sprint** (Day 1, before story-001). If the API differs significantly, the fallback is direct JSON Schema validation via ajv. If the API is partially compatible (works but requires workarounds), also escalate via HITL — partial compatibility can introduce hidden tech debt. Document the spike outcome in sprint-notes.md.
> PLAN.md references `@stoplight/spectral-core` and `@stoplight/spectral-parsers`.
> The validator receives ExtractResult objects from extract.ts, not raw files.
> Import ValidationResult from src/types.ts (story-001) — do not redefine.
> File type routing: command/agent → schema validation + body rules. legacy-agent/context/unknown → body rules only.
> Code review DoD: validate-frontmatter.ts must not call `fs.writeFile` or create temporary files.

## Definition of Done

- [ ] All acceptance criteria pass QA gate (AC-1 through AC-9)
- [ ] Unit test coverage >= 80% for validate-frontmatter.ts
- [ ] No TypeScript errors in strict mode
- [ ] Spectral API spike completed and findings documented in sprint-notes.md
- [ ] Code review: no fs.writeFile or temp file creation in validate-frontmatter.ts
- [ ] Every rule in .spectral.yaml has x-skill-lint-level key (verified by test parsing YAML)
