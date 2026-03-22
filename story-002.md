---
id: story-002
title: "File classifier — path-based type detection for skill files"
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

As the lint command,
I want to classify markdown files by their path into skill types,
So that the correct validation rules are applied to each file.

## Acceptance Criteria

AC-1: WHEN a file path contains `/commands/`,
      THE SYSTEM SHALL classify it as type `command`.

AC-2: WHEN a file path contains `/agents/`,
      THE SYSTEM SHALL classify it as type `agent`.

AC-3: WHEN a file path contains `/context/`,
      THE SYSTEM SHALL classify it as type `context`.

AC-4: WHEN the file's **basename** matches `README.md` (case-insensitive),
      THE SYSTEM SHALL classify it as type `readme`.

AC-5: WHEN `classifyFile` is called with a path containing `/agents/` and `hasFrontmatter: false`,
      THE SYSTEM SHALL return `legacy-agent`.

AC-6: WHEN `classifyFile` is called with a path containing `/agents/` and `hasFrontmatter: true`,
      THE SYSTEM SHALL return `agent` (not `legacy-agent`).

AC-7: WHEN a file path matches multiple known segments (e.g., `/agents/context/foo.md`),
      THE SYSTEM SHALL use the **rightmost** matching directory segment for classification.

AC-8: WHEN a file path uses an absolute path with `~/.claude/commands/` prefix,
      THE SYSTEM SHALL classify it identically to the equivalent repo-relative path.

AC-9: WHEN a file path does not match any known pattern,
      THE SYSTEM SHALL classify it as type `unknown`.

## Technical Context

### Module
- `src/classify.ts` — exports `classifyFile(filePath: string, hasFrontmatter: boolean): FileType`
- FileType enum: `command | agent | legacy-agent | context | readme | unknown`

### Path Normalization
- Must handle both absolute paths (`~/.claude/commands/...`) and repo-relative paths (`commands/...`)
- Classification uses the _last_ matching segment (e.g., `/agents/context/foo.md` → agent, not context)

## Implementation Tasks

- [ ] Task 1: Import FileType from src/types.ts (story-001), implement classifyFile with rightmost-segment logic (AC: #1, #2, #3, #4, #7, #8, #9)
- [ ] Task 2: Add legacy-agent reclassification logic (AC: #5, #6)
- [ ] Task 3: Write unit tests with path fixtures covering all types including absolute paths, overlapping segments, and hasFrontmatter combinations (AC: #1-#9)

## Dev Notes

> PLAN.md specifies path-based classification, not content-based. The only content check is whether frontmatter exists (for legacy-agent detection), which is done by the caller (extract.ts) and passed as a boolean.

## Definition of Done

- [ ] All acceptance criteria pass QA gate (AC-1 through AC-9)
- [ ] Unit test coverage >= 80% for classify.ts
- [ ] No TypeScript errors in strict mode
- [ ] Tests include: overlapping segment paths, absolute paths, hasFrontmatter true/false for agents
