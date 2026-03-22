---
id: story-001
title: "Project scaffold — package.json, tsconfig, bin entry, yargs CLI skeleton"
epic: foundation
linear-id: null
sprint: 1
status: drafted
assigned-agent: backend-dev
priority: high
estimated-points: 3
depends-on: []
hitl-checkpoint: false
schema-version: "1.0"
---

## Story

As a developer setting up the skill-lint project,
I want a working TypeScript ESM project with a yargs CLI skeleton,
So that all subsequent stories have a compilable, runnable foundation to build on.

## Acceptance Criteria

AC-1: WHEN `npm run build` is executed,
      THE SYSTEM SHALL compile TypeScript source to `dist/` without errors in strict mode.

AC-2: WHEN `node bin/cli.js --help` is executed,
      THE SYSTEM SHALL display help text showing `lint`, `graph`, `promote`, and `init` subcommands.

AC-3: WHEN `node bin/cli.js lint --help` is executed,
      THE SYSTEM SHALL display option names `--level`, `--changed-only`, `--base`, `--format`, `--strict`, and `--ratchet` in the output.

AC-4: WHEN `node bin/cli.js lint` is executed with no arguments,
      THE SYSTEM SHALL exit with code 0 (placeholder — no validation logic yet).

AC-5: WHEN installed via `npm link`,
      THE SYSTEM SHALL be invocable as `skill-lint --help` and display the same help text as AC-2.

AC-6: WHEN an unrecognized subcommand is passed (e.g., `node bin/cli.js unknowncommand`),
      THE SYSTEM SHALL display a usage error and exit with code 1.

## Technical Context

### Dependencies
- yargs ^17.7.0 (CLI framework)
- TypeScript ^5.x (dev dependency)
- @types/yargs (dev dependency)

### Build Setup
- `tsconfig.json`: strict mode, ESM, target ES2022, outDir `dist/`
- `package.json`: `"type": "module"`, bin entry, build script

## Implementation Tasks

- [ ] Task 1: Create package.json with name, bin, type, scripts, dependencies (AC: #5)
- [ ] Task 2: Create tsconfig.json with strict + ESM config (AC: #1)
- [ ] Task 3: Create bin/cli.js shebang wrapper importing from dist (AC: #2, #3, #4)
- [ ] Task 4: Create src/cli.ts with yargs setup — 4 subcommands, lint options, strict mode for unknown commands (AC: #2, #3, #6)
- [ ] Task 5: Create src/types.ts with shared types: FileType, ExtractResult, ParseError, ValidationResult, Config (AC: n/a — foundation for all stories)
- [ ] Task 5b: Create test fixture specification in test/fixtures/README.md — list fixture files, their frontmatter, and expected validation outcomes for stories 003-008 (AC: n/a — coordination artifact)
- [ ] Task 6: Verify `npm install && npm run build && node bin/cli.js --help` works (AC: #1, #2)
- [ ] Task 7: Verify `npm link && skill-lint --help` works (AC: #5)

## Dev Notes

> This is the bootstrap story. Keep it minimal — subcommand handlers are stubs that exit 0.
> Use `yargs/yargs` import for ESM compatibility (not `require('yargs')`).
> Verify yargs ESM import path before implementing — `import yargs from 'yargs'` + `import { hideBin } from 'yargs/helpers'`.
> Use yargs `.strict()` to reject unrecognized subcommands (AC-6).
> Create `src/types.ts` as the canonical home for all shared types used across stories. This prevents type duplication between story-005 (validator) and story-007 (reporter).

## Definition of Done

- [ ] All acceptance criteria pass QA gate (AC-1 through AC-6)
- [ ] No TypeScript errors in strict mode
- [ ] `npm run build` succeeds
- [ ] `node bin/cli.js --help` shows all 4 subcommands
- [ ] `skill-lint --help` works after `npm link`
- [ ] `src/types.ts` exports FileType, ExtractResult, ParseError, ValidationResult, Config
- [ ] Verified on Node 20+ (ESM compatibility)
