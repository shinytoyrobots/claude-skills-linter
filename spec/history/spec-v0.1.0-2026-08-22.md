---
version: "0.1.0"
parent: null
changed-at: "2026-08-22"
change-type: minor
change-summary: "Initial spec — skills-linter architecture currency update (spec+eval mode)"
diff-summary: |
  + SCN-001..SCN-006 authored (behavioral scenarios)
  + SR-001..SR-014 derived (functional requirements)
  + SR-100..SR-105 (non-functional: determinism, perf, regression, backward-compat)
  + INV-1..INV-4 (no false-positive errors; deterministic/offline; backward compat; no ReDoS)
  + Eval suite wired: 7 dimensions incl. cross-boundary; invariant graders authored
seed-source: >
  Codebase audit of claude-skill-lint @ v0.5.1 + authoritative 2026 Agent Skills spec
  research (code.claude.com/docs/en/skills.md, plugins-reference.md) + the file-level
  change map in SKILLS-ARCHITECTURE-UPDATE.md.
---

# Spec v0.1.0 — 2026-08-22

First version. Bootstrapped by `flow-init` in spec+eval mode after the Step-0 mode gate
recommended against full flow: the effort is mostly spec-clear mechanical currency work on
a published package, with a single design-forky slice (progressive-disclosure reference
tracking, SCN-002) reserved for possible later escalation.

See `spec/spec.md` for the current authoritative content.
