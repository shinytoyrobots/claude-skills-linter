# Grader: accessibility → output consumability

version: 1.0.0
type: deterministic

## Purpose
CONSTITUTION OVERRIDE: the artifact is a CLI with no UI, so WCAG does not apply. This
dimension is repurposed (with rationale, per doctrine) to grade whether the linter's OUTPUT
stays clear and machine-parseable for its consumers — the "accessibility" of the findings to
the humans and pipelines reading them.

## Checks
- `--format json` output validates against the documented `ValidationResult` shape for every
  finding a new rule can emit (new rules include a stable `rule` code).
- `--format github` annotations for new findings carry file + line + message.
- `--format terminal` output for new findings is not color-only (message text conveys the
  finding without ANSI), so it survives log capture / no-color terminals.
- Every new finding message names the field/reference at fault and, where actionable, what to
  do (e.g. "which name governs invocation").

## Scoring
Binary per check; dimension score 1.0 iff all pass.

## Threshold
1.0.

## Datasets
- `accessibility-real-v1.jsonl` — one fixture per new rule, checked across all three formats.
