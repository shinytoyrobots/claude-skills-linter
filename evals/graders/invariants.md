# Grader: invariants (hard-cull)

version: 1.0.0
type: deterministic
non-negotiable: true   # doctrine step 1 — authored before any cull; failure is a hard cut

## Purpose

Enforces INV-1..INV-4 from `spec/spec.md`. Unlike dimension graders, an invariant failure
is not "a lower Pareto rank" — it disqualifies the build outright. These are the guarantees
that make the linter safe to ship to a published package.

## Input format

Each task is a JSONL row:
```
{ "id": "...", "invariant": "INV-1", "fixture": "path/to/fixture-skill-or-repo", "expect": {...} }
```
The grader runs the current linter build against `fixture` and compares emitted findings to
`expect`.

## Checks

### check: no-false-positive-errors (INV-1)
- Run `lint` and `graph` in DEFAULT mode against every fixture in
  `datasets/correctness-real-v1.jsonl` and `datasets/correctness-adv-v1.jsonl` tagged
  `valid: true`.
- PASS iff zero findings of severity `error` are emitted for those fixtures.
- Any error on a valid fixture = FAIL, with the offending finding quoted. This is the
  effort's ordering constraint.

### check: deterministic-offline (INV-2)
- Run the linter twice on the same fixture; byte-identical `--format json` output → PASS.
- Static scan of `src/lint.ts`, `src/validate-graph.ts`, `src/validate-frontmatter.ts`,
  `src/extract.ts` for network/LLM imports (`http`, `https`, `fetch`, `undici`, any
  `@anthropic-ai/*`, any MCP client) → must be absent in the lint/graph path → PASS.

### check: backward-compat-no-new-errors (INV-3)
- Diff current-build findings against the recorded v0.5.1 baseline for each supported-format
  fixture repo (see cross-boundary baselines).
- PASS iff no fixture gains an `error` it did not have under v0.5.1, UNLESS that error is
  produced by a new rule in this effort AND the baseline row records it as intended.

### check: regex-linear-time (INV-4)
- For each reference-extraction regex added in this effort, run it against pathological
  adversarial inputs (long runs of the pattern's ambiguous prefix) with a hard timeout
  (e.g. 100ms for a 100KB input).
- PASS iff every regex completes under the timeout. A timeout = FAIL (ReDoS).

## Scoring
- Binary per check. The dimension score is 1.0 iff ALL checks pass, else 0.0.
- A 0.0 here is a hard cut, not a Pareto demotion.

## Threshold
1.0 (all invariants hold).
