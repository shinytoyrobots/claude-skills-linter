# Grader: cross-boundary

version: 1.0.0
type: deterministic
non-negotiable: true   # doctrine step 1 — grades the artifact against its real consumers

## Purpose

The linter's correctness is only observable where it meets its real consumers: whole skill
repositories it lints, and the CI pipelines that consume its exit codes and formatted output.
In-unit tests over synthetic single files cannot see a format-detection regression or a
finding-count drift on a real 139-file suite. This grader is that seam.

## Real consumers (from flow-init Step 2 item 6)
1. **Skill-suite repos** the linter is pointed at:
   - Anthropic official skills repo (plugin format) — baseline: 14 errors / 24 warnings @ v0.5.1
   - A multi-plugin production repo (Knapsack-style, `../../context/foo.md` relative refs)
   - A `project-skills` repo (`.claude/skills/<name>/SKILL.md`)
   - A single-skill plugin with a root-level `SKILL.md` (SCN-006 fixture — must be discovered)
2. **CI pipelines** consuming `--format github` annotations, `--format json`, and exit codes
   (0 clean / 1 findings / 2 config-or-git error).
3. **Programmatic API** consumers importing `runLint` / `runGraph` / `extractFile`.

## Input format
Each task is a JSONL row naming a fixture repo and its expected linter behavior:
```
{ "id": "cb-anthropic", "repo": "fixtures/repos/anthropic-skills", "cmd": "graph",
  "expect": { "exit_code": 1, "errors": 14, "warnings": 24, "format": "detected:plugin" } }
```
Fixture repos live under `fixtures/repos/` (checked-in snapshots or git submodules; a
missing fixture is a `mapping-pending` task, not a pass).

## Checks
- **exit code** matches `expect.exit_code`.
- **finding counts** (errors, warnings) match `expect` exactly, OR differ only by findings
  attributable to a new rule in this effort AND recorded in the updated baseline.
- **format detection** returns the expected format (`plugin` for a root-`SKILL.md` layout —
  SR-013).
- **json output** parses and conforms to the documented `ValidationResult` shape (the API
  contract CI depends on).
- **github format** emits well-formed `::error`/`::warning` annotations with file+line.

## Scoring
- Per-task pass/fail; dimension score = fraction of tasks passing.

## Threshold
1.0 — every consumer contract holds. A drift not traceable to an intended new rule is a
regression (escalation trigger in the constitution).

## Baselines
Recorded per repo in `datasets/cross-boundary-real-v1.jsonl`. When this effort intentionally
adds a rule that changes a count, update the baseline in the same change and note it in the
task row's `baseline-note`.
