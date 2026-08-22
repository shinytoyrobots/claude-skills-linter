# Grader: maintainability

version: 1.0.0
type: deterministic (complexity) + LLM-judge (readability)

## Purpose
Keeps the linter's own source healthy as it grows — the reference-extraction and portable-mode
work touches the most intricate files (`validate-graph.ts`, `validate-frontmatter.ts`).

## Checks
- Cyclomatic complexity p95 of changed functions stays within the current repo distribution.
- New reference-resolution logic is unit-testable in isolation (no hidden coupling to CLI
  argv or FS globals).
- Rule additions go through the existing `buildRules` factory rather than a parallel path.

## Scoring
Weighted blend of complexity delta and an LLM-judge readability pass on the diff.

## Threshold
0.70.

## Datasets
- `maintainability-real-v1.jsonl` — the changed-files diff of the effort.

## Status
PLACEHOLDER — flow-eval to wire cyclomatic tooling + judge prompt.
