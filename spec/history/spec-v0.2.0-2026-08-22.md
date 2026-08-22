---
version: "0.2.0"
parent: "0.1.0"
changed-at: "2026-08-22"
change-type: minor
change-summary: "Add SCN-007 + SR-015/SR-016 — accepted-value-form tolerance (boolean forms; Bash-pattern allowed-tools)"
diff-summary: |
  + SCN-007: Author lints a skill using accepted-but-non-canonical value forms
  + SR-015: boolean-typed fields accept true/false/yes/no/on/off/1/0 without a type error
  + SR-016: allowed-tools string tokenized without splitting inside Bash(...) patterns
  ~ Traceability table: SCN-007 → SR-015, SR-016
  ~ Conformance tests: adv-1/adv-2 named as acceptance tests for SR-015/SR-016
seed-source: >
  flow-eval (2026-08-22) — the correctness adversarial holdouts (correctness-adv-v1 tasks
  adv-1, adv-2) surfaced two false positives absent from the v0.1.0 SR list: a boolean field
  written `off` errored as "must be boolean", and an allowed-tools string was whitespace-split
  so `Bash(git status:*)` yielded a bogus tool `status:*)`. Both violate INV-1.
---

# Spec v0.2.0 — 2026-08-22

Minor, additive. No existing scenario or requirement modified. Closes the two suite-gap
findings routed from flow-eval by making them requirements with existing adversarial
acceptance tests. See `spec/spec.md` for current authoritative content.
