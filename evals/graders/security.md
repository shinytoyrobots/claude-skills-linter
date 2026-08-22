# Grader: security

version: 1.0.0
type: deterministic

## Purpose
The linter is a CLI that reads untrusted repo content and runs regexes over it. Security is
NOT vestigial here (constitution override): reference-extraction adds a ReDoS surface, and
the tool has a prior shell-injection defect (fixed Sprint 7).

## Checks
- **ReDoS (INV-4):** every reference-extraction regex completes under a hard timeout on
  pathological input. Shared with `graders/invariants.md check: regex-linear-time`.
- **No shell interpolation:** git and any subprocess calls use `execFileSync` with an args
  array, never a template-literal shell string (static scan of `src/changed-files.ts` and any
  new subprocess call sites).
- **Path traversal:** reference resolution of `../` and `${CLAUDE_*_DIR}` does not read
  outside the project root when resolving graph nodes.
- **No secret exfiltration path:** offline guarantee (INV-2) means no channel to leak repo
  content.

## Scoring
Binary per check; dimension score 1.0 iff all pass.

## Threshold
1.0.

## Datasets
- `security-real-v1.jsonl` — normal repos (no findings expected).
- `security-adv-v1.jsonl` — ReDoS payloads + path-traversal reference fixtures.
