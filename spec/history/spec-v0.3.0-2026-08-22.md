---
version: "0.3.0"
parent: "0.2.0"
changed-at: "2026-08-22"
change-type: major
change-summary: "Amend SCN-003/SR-010 (name↔dir surfaces on lint+graph; default when format undetectable) and SCN-005/SR-012/SR-105 (portable findings are warnings) — enacting flow-panel D1 & D2"
version-note: >
  Classified MAJOR (existing scenarios and requirements modified, not merely added). The spec
  is pre-1.0, so this major-semantic change is reflected in the minor position (0.2.0 -> 0.3.0)
  per the 0.x convention rather than jumping to 1.0.0; the leading 0 signals the spec is not
  yet declared stable.
diff-summary: |
  ~ SCN-003: retitled "lints" -> "checks"; When broadened to "via either lint or graph";
    +AC "finding surfaces from BOTH lint and graph"; +AC "undetectable format -> default
    'directory name governs'"
  ~ SR-010: emitted by BOTH lint and graph passes; +default "directory name governs" when
    format cannot be determined
  ~ SCN-005: +AC "each portability finding is a warning (non-portable-field), never an error"
  ~ SR-012: severity pinned to warning (rule non-portable-field)
  ~ SR-105: portable-mode findings added to the warnings-never-errors list
seed-source: >
  flow-panel 2026-08-22 (spec/.staging/panel-2026-08-22.md). D1: all three readers placed the
  name↔dir rule in the graph pass while SCN-003 and eval task 13 use `lint` — a
  spec/test/implementation mismatch that would have kept task 13 permanently red. D2: readers
  split error-vs-warning on portable findings; majority + eval task 18 + INV-1 meaning-
  preservation → warning.
---

# Spec v0.3.0 — 2026-08-22

Major, disambiguating. No new SCN/SR IDs; existing SCN-003/SR-010 and SCN-005/SR-012/SR-105
modified to close the two actionable divergences the interpretation panel located. The three
accepted ambiguities (D3 plugin-detection branch, D4 bare-path grammar, D5 linear tokenizer)
are recorded in the panel record for the implementer's decision ledger and require no spec
change. See `spec/spec.md` for current authoritative content.
