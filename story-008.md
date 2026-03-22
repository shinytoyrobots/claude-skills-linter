---
id: story-008
title: "Wire lint command — end-to-end pipeline integration"
epic: foundation
linear-id: null
sprint: 1
status: drafted
assigned-agent: backend-dev
priority: high
estimated-points: 3
depends-on:
  - story-002
  - story-003
  - story-005
  - story-006
  - story-007
hitl-checkpoint: false
schema-version: "1.0"
---

## Story

As a skill author,
I want to run `skill-lint lint [paths...]` and get validation results,
So that I can validate my skill files end-to-end from the command line.

## Acceptance Criteria

AC-1: WHEN `skill-lint lint test/fixtures/` is executed against the test fixture directory,
      THE SYSTEM SHALL discover all .md files, extract frontmatter, classify by path, validate against Level 0 rules, and report results matching expected error counts.

AC-2: WHEN `--level 0` is specified,
      THE SYSTEM SHALL pass `level: 0` to the validator which filters rules by `x-skill-lint-level`. (Full verification deferred to sprint that introduces Level 1+ rules.)

AC-3: WHEN `--strict` is specified and warnings exist,
      THE SYSTEM SHALL exit with code 1 (treat warnings as errors).

AC-4: WHEN validation finds errors,
      THE SYSTEM SHALL exit with code 1.

AC-5: WHEN validation finds no errors,
      THE SYSTEM SHALL exit with code 0.

AC-6: WHEN config file has errors (ConfigError thrown by config.ts),
      THE SYSTEM SHALL catch the error and exit with code 2 and a descriptive message to stderr.

AC-7: WHEN run against the live `~/Development/claude-skills/` directory,
      THE SYSTEM SHALL complete without throwing an unhandled exception and exit with code 0 or 1 (never code 2 or unhandled crash). **Local-only smoke test — not a CI requirement.**

AC-8: WHEN `--changed-only` is specified,
      THE SYSTEM SHALL print "Not yet implemented" to stderr and exit with code 0. (Stub for Sprint 2.)

AC-9: WHEN `--ratchet` is specified,
      THE SYSTEM SHALL print "Not yet implemented" to stderr and exit with code 0. (Stub for Sprint 3.)

AC-10: WHEN config specifies `ignore` patterns,
       THE SYSTEM SHALL exclude matching files from the lint pipeline before extraction.

AC-11: WHEN the target directory contains zero .md files,
       THE SYSTEM SHALL report "0 files checked" and exit with code 0.

## Technical Context

### Pipeline Flow
```
CLI args → loadConfig → extractAll → classifyFile (each) → validateFrontmatter → reportTerminal → exit code
```

### Module
- `src/lint.ts` — orchestrator that wires all modules together
- Update `src/cli.ts` — connect lint subcommand handler to lint.ts

### Integration Points
- config.ts → provides ignore patterns, default level, file size limits
- extract.ts → provides frontmatter data + synthetic metadata
- classify.ts → provides file type for schema selection
- validate-frontmatter.ts → provides validation results
- reporter.ts → formats output

## Implementation Tasks

- [ ] Task 1: Create src/lint.ts orchestrator: loadConfig → extractAll (with ignore filtering) → classifyFile → validateFrontmatter → reportTerminal (AC: #1, #2, #10)
- [ ] Task 2: Wire lint subcommand in cli.ts to call lint.ts, catch ConfigError for exit code 2 (AC: #1, #6)
- [ ] Task 3: Implement exit code logic for all paths (AC: #3, #4, #5, #6, #11)
- [ ] Task 4: Implement stub handlers for --changed-only, --ratchet, --base flags (AC: #8, #9)
- [ ] Task 5: Write integration test with fixture directory: known file counts, known error counts, exit codes (AC: #1-#6, #10, #11)
- [ ] Task 6: Run local smoke test against ~/Development/claude-skills/ — document results in sprint-notes.md (AC: #7)

## Dev Notes

> This is the integration story — all prior modules come together here.
> The `--level` flag overrides config `default_level` and per-directory levels.
> Stub flags (`--changed-only`, `--base`, `--ratchet`) print "Not yet implemented" to stderr and exit 0. They must not silently succeed — the message prevents user confusion.
> `--format json` is declared in the CLI skeleton (story-001) but NOT implemented in Sprint 1. If specified, print "Not yet implemented" to stderr and fall back to terminal format.
> Ignore pattern enforcement happens here in lint.ts — filter file list before passing to extractAll.
> AC-7 (live smoke test) runs locally only — do not add it to CI. Document approximate error count in sprint-notes.md after first run.

## Definition of Done

- [ ] All acceptance criteria pass QA gate (AC-1 through AC-11)
- [ ] Integration test passes with fixture directory (known error counts asserted)
- [ ] Local smoke test against ~/Development/claude-skills/ completes without crash (local-only, not CI)
- [ ] No TypeScript errors in strict mode
- [ ] Stub flags print "Not yet implemented" (verified in tests)
- [ ] Ignore patterns filter files before extraction (verified in tests)
