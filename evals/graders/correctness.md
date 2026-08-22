# Grader: correctness

version: 1.0.0
type: deterministic (finding-set comparison)

## Purpose
Verifies the linter's findings on single-skill fixtures match the SR-defined expectation —
the direct grader for SCN-001..SCN-006 and SR-001..SR-014.

## Input format
```
{ "id": 1, "sr": "SR-001", "valid": true, "fixture": "fixtures/skills/effort-xhigh/SKILL.md",
  "expect": { "errors": [], "warnings": [], "must_not_contain_rule": ["effort-invalid"] } }
```
`must_not_contain_rule` asserts a rule did NOT fire (the false-positive guard);
`must_contain` asserts an expected finding (rule + severity) IS present.

## Checks
- The emitted finding set matches `expect` — no missing expected findings, no unexpected ones.
- Severity is exact (`error` vs `warning` matters: SR-010, SR-011, SR-105 require warnings).
- For `must_not_contain_rule`, the named rule must be absent (guards INV-1).

## Scoring
- Per-task pass/fail; dimension score = fraction passing.
- Adversarial dataset (`correctness-adv-v1`) must ALSO pass for the dimension to count
  (Goodhart mitigation).

## Threshold
1.0 — a currency linter must be exactly right on the currency cases.

## Datasets
- `correctness-real-v1.jsonl` — the 20 tasks enumerated in spec.md scenario "Covered by" lines.
- `correctness-adv-v1.jsonl` — valid-but-unusual skills a naive rule tightening would wrongly
  flag (the INV-1 holdout).
