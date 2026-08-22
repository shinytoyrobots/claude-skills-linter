---
version: "0.4.0"
parent: "0.3.0"
changed-at: "2026-08-22"
change-type: major
change-summary: "Refine SCN-006/SR-013/SR-014 (plugin-format currency) before building: detection must not require marketplace.json; .claude-plugin/ contents rule must allow marketplace.json"
version-note: >
  MAJOR (existing SCN-006/SR-013/SR-014 modified). Pre-1.0, reflected in the minor position
  (0.3.0 -> 0.4.0) per the 0.x convention.
diff-summary: |
  ~ SR-013: detection explicitly independent of marketplace.json (single plugins omit it)
  ~ SR-014: allow BOTH plugin.json and marketplace.json in .claude-plugin/ (rule
    claude-plugin-contents); the prior "only plugin.json" wording would false-positive on
    every marketplace repo (INV-1), incl. work/ai-plugins whose .claude-plugin/ holds
    marketplace.json
  ~ SCN-006 acceptance criteria updated to match
seed-source: >
  Pre-implementation review of the plugin-format slice against validate-manifest.ts and the
  real work/ai-plugins layout (root .claude-plugin/marketplace.json + plugins/*/.claude-plugin/
  plugin.json). Caught the marketplace.json false-positive before writing code.
---

# Spec v0.4.0 — 2026-08-22

Major, disambiguating. Refines the plugin-format-currency requirements (SR-013/SR-014)
before implementation so the SR-014 contents rule cannot false-positive on marketplace
repos. See `spec/spec.md` for current authoritative content.
