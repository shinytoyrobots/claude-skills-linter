# Constitution — skills-architecture-update

## Mode
mode: spec+eval
# Chosen at flow-init via the Step-0 mode gate. Rationale: the effort is mostly
# spec-clear mechanical work on a published package where competing implementation
# variants would agree; the linter's correctness is unusually easy to grade against
# real skill repos. One slice (progressive-disclosure reference tracking, SCN-002 /
# SR-006..SR-009) is genuinely design-forky and may be escalated to a single wide-probe
# full-flow generation on its own if it proves so — a class-promotion HITL, never silent.

## Weight class
weight-class: light
# Rationale: existing mature codebase, additive changes, good reversibility (semver +
# npm rollback), no security-bearing scope. Recorded for completeness; spec+eval mode
# does not spawn populations, so the dispatch envelope is inert unless the effort
# escalates the SCN-002 slice to full flow.

## Budgets
token-budget-per-variant: 150000
token-budget-per-generation: 500000
# REQUIRED fields (dispatch Rule 5). Inert in spec+eval mode (no generations); they set
# the envelope for any future full-flow escalation of the SCN-002 slice.

## Prohibitions
- No false-positive ERROR on any skill Claude Code treats as valid (INV-1). A finding
  that fires on working code is worse than a missed finding — this is the effort's
  ordering constraint, not a preference.
- No network calls and no LLM invocation in the `lint` or `graph` passes (INV-2). The
  deterministic, offline character of the tool is load-bearing for CI.
- No breaking change to `.skill-lint.yaml` config validity or to the four supported repo
  formats — all changes additive (SR-103, INV-3).
- No hard maximum length imposed on skill `name` — the 2026 spec does not document one,
  and inventing a cap would itself be a false positive (SR-104).
- No reference-extraction regex vulnerable to catastrophic backtracking (INV-4).
- No dropping to Node < 20 or CommonJS; stays TypeScript ESM.

## Preferences (soft)
- Prefer downgrading a shaky check to `warning` over risking a false-positive `error`.
- Prefer widening the built-in tool registry to a warning-by-default `unknown-tool`
  rule — the roster moves faster than the release cadence, so a hard allow-list
  guarantees future false positives.
- Prefer additive schema fields (`additionalProperties: true` already holds) and
  additive Spectral rules over restructuring the rule builder.
- Prefer resolving new reference forms conservatively (only inside real reference
  contexts) over aggressive matching that trips on prose.

## Escalation triggers (HITL surface)
- The SCN-002 progressive-disclosure slice proves genuinely forky (two defensible,
  materially different resolution strategies) → propose escalating that slice to a single
  full-flow wide-probe generation (class-promotion HITL).
- Any proposed change would newly ERROR a skill that passed under v0.5.1 → preference-
  articulator HITL before proceeding (INV-3).
- The cross-boundary fixture baselines shift for a reason not traceable to an intended new
  rule → halt and surface (possible regression).

## Dispatch overrides
- Security dimension retained despite this being a CLI tool: the effort adds
  reference-extraction regexes (ReDoS surface, INV-4) and the tool already had a
  shell-injection defect (Sprint 7). Security is not vestigial here.
- Accessibility dimension reframed to "output consumability": the artifact has no UI, so
  the dimension grades whether `--format terminal|github|json` output stays clear and
  machine-parseable for its CI consumers. (Doctrine requires an explicit override to
  repurpose or drop accessibility; this is that override.)
- Cross-boundary objective is mandatory (doctrine step 1): the linter's real consumers are
  whole skill repos and CI pipelines — its correctness is only observable at that seam.

## Violation policy
- This constitution may be amended via `flow-spec`. Amendments are versioned and are always
  a major spec increment.
- A change that violates a prohibition halts and surfaces a dissent rather than shipping.
