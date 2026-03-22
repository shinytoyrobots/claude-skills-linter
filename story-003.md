---
id: story-003
title: "Frontmatter extractor — gray-matter parse with synthetic metadata"
epic: foundation
linear-id: null
sprint: 1
status: drafted
assigned-agent: backend-dev
priority: high
estimated-points: 3
depends-on:
  - story-001
  - story-002
hitl-checkpoint: false
schema-version: "1.0"
---

## Story

As the lint pipeline,
I want to extract YAML frontmatter from skill markdown files and enrich it with synthetic metadata,
So that Spectral can validate the extracted data without reading files directly.

## Acceptance Criteria

AC-1: WHEN a markdown file with valid YAML frontmatter is processed,
      THE SYSTEM SHALL return an ExtractResult containing all frontmatter fields in `data`.

AC-2: WHEN a markdown file without frontmatter is processed,
      THE SYSTEM SHALL return an ExtractResult with `data.___has_frontmatter: false` and body-only synthetic fields.

AC-3: WHEN any file is processed,
      THE SYSTEM SHALL inject synthetic metadata: `___body_length` (character count), `___file_size` (bytes), `___body_text` (full body content), `___file_path` (source path), `___file_type` (from classify.ts).

AC-4: WHEN frontmatter contains invalid YAML,
      THE SYSTEM SHALL return an ExtractResult where `errors` is non-empty and contains the parse error message and file path (not throw an exception).

AC-5: WHEN `extractAll` is called with a glob pattern,
      THE SYSTEM SHALL return an ExtractResult array with one entry per matching `.md` file.

AC-6: WHEN `extractAll` is called with a glob pattern that matches zero files,
      THE SYSTEM SHALL return an empty array (not throw an exception).

AC-7: WHEN a file cannot be classified by classify.ts,
      THE SYSTEM SHALL set `___file_type` to `unknown`.

## Technical Context

### Dependencies
- gray-matter ^4.0.3 (YAML frontmatter parser)
- glob ^10.0.0 (file discovery)

### Module
- `src/extract.ts` — exports `extractFile(filePath: string): ExtractResult` and `extractAll(patterns: string[]): ExtractResult[]`
- ExtractResult: `{ data: Record<string, unknown>, errors: ParseError[] }`

### In-Memory Pipeline
No temp files. Read file → gray-matter parse → inject synthetic fields → return JSON objects.

## Implementation Tasks

- [ ] Task 1: Import ExtractResult, ParseError from src/types.ts (story-001), implement extractFile with gray-matter (AC: #1, #2, #4)
- [ ] Task 2: Implement synthetic metadata injection including classify.ts integration for ___file_type (AC: #3, #7)
- [ ] Task 3: Implement extractAll with glob-based file discovery and empty-match handling (AC: #5, #6)
- [ ] Task 4: Write unit tests with fixtures: valid frontmatter, no frontmatter, invalid YAML, empty glob, unclassifiable file (AC: #1-#7)

## Dev Notes

> The synthetic metadata fields use `___` prefix to avoid collision with user-defined frontmatter.
> gray-matter returns `{ data, content, excerpt }` — we need `data` (frontmatter) and `content` (body).
> File type comes from classify.ts — call it after extraction to handle legacy-agent detection (needs to know if frontmatter exists).

## Definition of Done

- [ ] All acceptance criteria pass QA gate (AC-1 through AC-7)
- [ ] Unit test coverage >= 80% for extract.ts
- [ ] No TypeScript errors in strict mode
- [ ] Error cases return structured ExtractResult (no thrown exceptions reaching caller)
