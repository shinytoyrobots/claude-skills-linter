# Grader: performance

version: 1.0.0
type: deterministic (benchmark)

## Purpose
Guards SR-101: the linter stays fast enough to run in a pre-commit hook and CI on real
suites. The new reference-extraction work (globbing non-.md files, more regexes) is the
regression risk this dimension watches.

## Checks
- `graph` + `lint` on a 139-file fixture suite completes within 2000ms wall-clock (median of
  5 runs, warm FS).
- No superlinear blowup: 2× the file count stays under ~2.5× the time.

## Scoring
score = clamp(budget_ms / observed_ms, 0, 1); PASS at ≥ 0.80 (i.e. ≤ 2500ms for the 2000ms
budget task).

## Threshold
0.80.

## Datasets
- `performance-real-v1.jsonl` — the 139-file suite fixture + a 2× scaled variant.

## Status
PLACEHOLDER — flow-eval to wire the benchmark harness and commit the fixture suite.
