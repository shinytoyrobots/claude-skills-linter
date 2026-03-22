---
id: story-007
title: "Terminal reporter — human-readable lint output"
epic: foundation
linear-id: null
sprint: 1
status: drafted
assigned-agent: backend-dev
priority: medium
estimated-points: 2
depends-on:
  - story-005
hitl-checkpoint: false
schema-version: "1.0"
---

## Story

As a skill author running `skill-lint lint`,
I want clear, colorized terminal output showing validation results,
So that I can quickly identify and fix issues in my skill files.

## Acceptance Criteria

AC-1: WHEN validation produces errors,
      THE SYSTEM SHALL display each error with file path, rule name, severity, and message.

AC-2: WHEN validation produces warnings (severity: warning),
      THE SYSTEM SHALL display each warning with file path, rule name, severity (yellow), and message.

AC-3: WHEN validation produces zero errors and zero warnings,
      THE SYSTEM SHALL display a success summary with the count of files checked.

AC-4: WHEN `--format terminal` is specified (or default),
      THE SYSTEM SHALL use chalk for colorized output (red for errors, yellow for warnings, green for pass).

AC-5: WHEN output is piped (not a TTY),
      THE SYSTEM SHALL produce output with no ANSI color codes (chalk's built-in TTY detection — do not override with `force: true`).

AC-6: WHEN multiple files have errors,
      THE SYSTEM SHALL group errors by file path for readability.

AC-7: WHEN displaying the summary line,
      THE SYSTEM SHALL use correct singular/plural forms (e.g., "1 error in 1 file" vs. "3 errors in 2 files") and include total files checked in parentheses: `"{N} errors in {M} files ({T} files checked)"`.

## Technical Context

### Dependencies
- chalk ^5.3.0 (terminal colors, auto-detects TTY)

### Module
- `src/reporter.ts` — exports `reportTerminal(results: ValidationResult[], totalFiles: number): string`
- Import ValidationResult from `src/types.ts` (story-001) — do not redefine

### Output Format
```
  src/commands/foo.md
    error  description is required  (required-field)
    error  body is empty            (non-empty-body)

  src/agents/bar.md
    error  name is required         (required-field)

  3 errors in 2 files (15 files checked)
```

## Implementation Tasks

- [ ] Task 1: Import ValidationResult from src/types.ts (story-001) — do not redefine the type (AC: n/a)
- [ ] Task 2: Implement reportTerminal(results, totalFiles) with grouped output, error + warning display, and singular/plural summary (AC: #1, #2, #3, #6, #7)
- [ ] Task 3: Add chalk colorization — rely on chalk's built-in TTY detection, do not force color (AC: #4, #5)
- [ ] Task 4: Write unit tests: errors only, warnings only, mixed, zero results, singular/plural, multi-file grouping (AC: #1-#7)

## Dev Notes

> chalk v5 is ESM-only, which aligns with our project setup.
> Severity levels: error, warning, info (only error and warning in Sprint 1).
> Keep the reporter stateless — it receives results and returns formatted strings.
> Import ValidationResult from src/types.ts — it is defined in story-001 as the canonical shared type. Do NOT define a local version.
> Summary line format is required (not illustrative): `"{N} {error|errors} in {M} {file|files} ({T} files checked)"`
> For tests: force chalk.level = 1 in test setup to assert color output, or test without color and verify the text content.

## Definition of Done

- [ ] All acceptance criteria pass QA gate (AC-1 through AC-7)
- [ ] Unit test coverage >= 80% for reporter.ts
- [ ] No TypeScript errors in strict mode
- [ ] ValidationResult imported from src/types.ts (not redefined)
- [ ] Singular/plural summary line verified in tests
