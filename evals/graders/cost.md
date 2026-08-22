# Grader: cost

version: 1.0.0
type: deterministic (token counter)

## Purpose
In spec+eval mode there is no generation cost. This dimension tracks only the eval-run cost
(LLM-judge passes in maintainability) so the suite itself stays cheap to run in CI. Carried at
weight 0.0 for reporting.

## Checks
- Total judge tokens per full suite run stay under a modest ceiling (deterministic graders are
  free; only maintainability's readability pass and any future LLM-judge cost counts).

## Threshold
0.50.

## Datasets
- (none)

## Status
PLACEHOLDER — largely inert in spec+eval mode; kept for schema completeness.
