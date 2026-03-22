---
id: story-006
title: "Config loader — .skill-lint.yaml with defaults"
epic: foundation
linear-id: null
sprint: 1
status: drafted
assigned-agent: backend-dev
priority: medium
estimated-points: 2
depends-on:
  - story-001
hitl-checkpoint: false
schema-version: "1.0"
---

## Story

As the lint command,
I want to load configuration from a `.skill-lint.yaml` file with sensible defaults,
So that users can customize validation behavior per-repo.

## Acceptance Criteria

AC-1: WHEN `.skill-lint.yaml` exists in the target directory,
      THE SYSTEM SHALL load and parse it as the active configuration.

AC-2: WHEN `.skill-lint.yaml` does not exist,
      THE SYSTEM SHALL return a Config object where each field matches the documented default values.

AC-3: WHEN the config specifies `default_level`, `skills_root`, `ignore`, `limits`, or `tools`,
      THE SYSTEM SHALL deep-merge user values over defaults (nested keys are merged, not replaced — e.g., a partial `limits:` in user config merges with default `limits`, not replaces it).

AC-4: WHEN the config specifies `ignore` patterns,
      THE SYSTEM SHALL expose them on the Config object for the orchestrator to use. (Actual file filtering is story-008's responsibility.)

AC-5: WHEN the config file contains invalid YAML,
      THE SYSTEM SHALL throw a ConfigError with a descriptive message. (The CLI catches this and exits with code 2 — exit responsibility is in cli.ts, not config.ts.)

AC-6: WHEN the config file exists but is empty (0 bytes),
      THE SYSTEM SHALL use default configuration values (same as AC-2).

AC-7: WHEN the config file contains unknown keys not in the Config schema,
      THE SYSTEM SHALL ignore them without error (forward-compatibility for future config fields).

## Technical Context

### Dependencies
- yaml ^2.3.0 (YAML parser)

### Module
- `src/config.ts` — exports `loadConfig(rootDir: string): Config`

### Default Config (from PLAN.md)
```yaml
skills_root: .
default_level: 0
levels: {}
tools:
  mcp_pattern: "mcp__*"
  custom: []
models: [opus, sonnet, haiku]
limits:
  max_file_size: 15360
ignore:
  - "**/README.md"
graph:
  warn_orphans: true
  warn_fanout_above: 50000
  detect_cycles: true
  detect_duplicates: true
```

## Implementation Tasks

- [ ] Task 1: Import Config type from src/types.ts (story-001), implement loadConfig with deep-merge logic (AC: #1, #2, #3, #6)
- [ ] Task 2: Implement ConfigError class for invalid YAML (AC: #5)
- [ ] Task 3: Handle unknown keys passthrough (AC: #7)
- [ ] Task 4: Write unit tests: file exists, file missing, deep merge, empty file, invalid YAML, unknown keys, all defaults verified (AC: #1-#7)

## Dev Notes

> Config search: look for `.skill-lint.yaml` in the provided root directory only. Upward directory walking is explicitly **out of scope** for Sprint 1 — do not implement it.
> The `yaml` package is used instead of gray-matter here since this is a pure YAML file, not markdown.
> config.ts throws ConfigError; cli.ts catches it and calls process.exit(2). config.ts never calls process.exit directly.
> Deep merge: use a simple recursive merge. For arrays, user value replaces default (no array concatenation).
> Ignore patterns are exposed on Config but NOT enforced by config.ts — the orchestrator (story-008, lint.ts) applies them.

## Definition of Done

- [ ] All acceptance criteria pass QA gate (AC-1 through AC-7)
- [ ] Unit test coverage >= 80% for config.ts
- [ ] No TypeScript errors in strict mode
- [ ] All default values explicitly asserted in tests
- [ ] Deep merge verified with nested object test case
