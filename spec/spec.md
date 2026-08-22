---
version: "0.4.0"
status: active
last-amended: "2026-08-22"
amendments-pending: 0
mode: spec+eval
---

# Specification — Skills-Linter Architecture Currency Update

## Purpose

`claude-skill-lint` validates Claude Code skill files for structural correctness and
token efficiency. Its internal model of "a skill" has drifted from the 2026 Agent Skills
spec in ways that make it emit false positives on valid current skills and stay blind to
the modern skill-bundle layout (progressive disclosure). This effort re-anchors the linter
to the current spec (sources: https://code.claude.com/docs/en/skills.md,
https://code.claude.com/docs/en/plugins-reference.md, as of Aug 2026) without breaking the
formats and configs it already supports. The worst linter bug is a false positive on
working code; that risk orders everything below.

## Scope

**In scope**
- Correctness fixes where the linter flags valid 2026 frontmatter (`effort` enum,
  `model: inherit` / full model IDs, stale built-in tool registry).
- Schema currency: recognize current frontmatter fields (`when_to_use`, `arguments`,
  `disallowed-tools`, `background`, `paths`, `shell`, `license`, `model`).
- Description-listing-budget warning (1536-char combined cap).
- `name` ↔ directory-name relationship as an informational warning.
- Progressive-disclosure reference tracking: markdown-link and non-`.md` bundled-resource
  references, `${CLAUDE_SKILL_DIR}` / `${CLAUDE_PROJECT_DIR}` expansion, `Bash(...)` script
  targets.
- Agent Skills spec-interop ("portable") mode flagging Claude-Code-only fields.
- Plugin-format currency: root-level single-skill plugins, `.claude-plugin/`-contents rule.

**Out of scope**
- The `/te-review` LLM audit skill (separate deliverable).
- Any network- or LLM-backed linting (the lint/graph passes stay deterministic and offline).
- Rewriting the four-format detection model — it is current and stays.
- A hard maximum length for skill `name` (undocumented in the spec — must NOT be invented).

## Behavioral scenarios (primary)

### SCN-001: Author lints a skill using current 2026 frontmatter
**Given** a `SKILL.md` whose frontmatter uses fields and values valid in the 2026 spec
(e.g. `effort: xhigh`, `model: inherit`, `when_to_use:`, `disallowed-tools:`)
**When** the author runs `claude-skill-lint lint` on it
**Then** the linter shall complete with no ERROR findings attributable to those fields or values

**Acceptance criteria:**
- `effort: xhigh` produces no `effort-invalid` finding
- `model: inherit` produces no `model-enum` finding
- `model: claude-opus-4-8` (a full model ID) produces no `model-enum` finding
- `when_to_use`, `arguments`, `disallowed-tools`, `background`, `paths`, `shell`, `license`
  are each accepted without a schema or field-level finding
- A skill declaring a current tool (e.g. `allowed-tools: [SendMessage]`) produces no
  `unknown-tool` finding

**Derived requirements:** SR-001, SR-002, SR-003, SR-004, SR-005
**Covered by:** `evals/datasets/correctness-real-v1.jsonl` (tasks 1–6)

### SCN-002: Author lints a skill that references a bundled resource
**Given** a `SKILL.md` that references supporting files — a markdown link `[examples](examples.md)`,
a relative path `references/guide.txt`, a script `scripts/render.sh`, or a
`${CLAUDE_SKILL_DIR}/scripts/x.py` path
**When** the author runs `claude-skill-lint graph` on the skill directory
**Then** the linter shall report a broken-reference finding for any referenced file that does
not exist on disk, and no finding for one that does

**Acceptance criteria:**
- A markdown link to a sibling `examples.md` that exists → no finding; if missing → broken-ref
- A reference to `scripts/render.sh` that is missing → broken-ref; if present → no finding
- A non-`.md` target (`.py`, `.sh`, `.json`, an asset) is resolved as a graph node
- `${CLAUDE_SKILL_DIR}/scripts/x.py` expands to the skill dir before resolution
- A script named inside an `allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/x.sh *)` grant
  is checked for existence
- A prose path that is not a real reference (e.g. inside a fenced code block illustrating
  output) does NOT produce a broken-ref (no new false positives — see INV-1)

**Derived requirements:** SR-006, SR-007, SR-008, SR-009
**Covered by:** `evals/datasets/correctness-real-v1.jsonl` (tasks 7–12),
`evals/datasets/cross-boundary-real-v1.jsonl`

### SCN-003: Author checks a skill whose frontmatter name differs from its directory
**Given** a skill at `skills/deploy/SKILL.md` whose frontmatter declares `name: shipit`
**When** the author runs the linter over it — via either `lint` or `graph`
**Then** the linter shall emit a WARNING (never an error) that names which identifier
governs invocation in the detected format

**Acceptance criteria:**
- The finding surfaces from **both** the `lint` and the `graph` command (the check needs
  only the SKILL.md's own directory, which a lone-file `lint` already has)
- Personal/project-skills format: warning states the directory name governs invocation
- Plugin format: warning states the frontmatter `name` overrides the directory name
- When the repo format cannot be determined (a lone SKILL.md with no discoverable format
  context), the warning still fires with the default "directory name governs" wording
- The finding severity is `warning`, and its absence when name == dirname
- No warning is emitted for a personal/project skill that omits `name` entirely (directory
  name is authoritative and sufficient)

**Derived requirements:** SR-010
**Covered by:** `evals/datasets/correctness-real-v1.jsonl` (tasks 13–15)
**Amendment (v0.3.0):** command-surface and undetectable-format criteria added — flow-panel
D1 found all readers placed the rule in the graph pass while this scenario and task 13 use
`lint`, a spec/test/implementation mismatch that would have kept task 13 permanently red.

### SCN-004: Author lints a skill with an over-budget description
**Given** a `SKILL.md` whose `description` plus `when_to_use` together exceed 1536 characters
**When** the author lints it
**Then** the linter shall emit a WARNING that the combined text exceeds the listing budget
Claude scans for auto-invocation

**Acceptance criteria:**
- Combined length > 1536 → one `description-budget` warning
- Combined length ≤ 1536 → no finding
- The finding is a warning, never an error (SR-105)

**Derived requirements:** SR-011
**Covered by:** `evals/datasets/correctness-real-v1.jsonl` (tasks 16–17)

### SCN-005: Author checks a skill for Agent Skills spec portability
**Given** a skill using Claude-Code-only frontmatter (e.g. `argument-hint`, `context`, `effort`)
**When** the author runs the linter in portable / spec-strict mode
**Then** the linter shall flag each field outside the portable set
{`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`} as
non-portable to the Agent Skills spec (claude.ai upload / Skills API)

**Acceptance criteria:**
- Portable mode flags `argument-hint`, `context`, `effort`, `background`, `paths`, `shell`,
  `hooks`, `disable-model-invocation`, `user-invocable`, `arguments`
- Portable mode does NOT flag `name`, `description`, `license`, `compatibility`, `metadata`,
  `allowed-tools`
- Default (non-portable) mode emits none of these portability findings
- Portability findings are their own rule/category, distinct from correctness errors
- Each portability finding is a `warning` (rule `non-portable-field`), never an error — a
  Claude-Code-only field is valid in Claude Code, so `error` (which elsewhere means "won't
  work in Claude Code") would blur that meaning

**Derived requirements:** SR-012
**Covered by:** `evals/datasets/correctness-real-v1.jsonl` (tasks 18–20)

### SCN-006: Author lints a single-skill plugin with a root-level SKILL.md
**Given** a plugin laid out as `my-plugin/SKILL.md` + `my-plugin/.claude-plugin/plugin.json`
(no `skills/` subdirectory)
**When** the author lints the plugin
**Then** the linter shall detect the plugin format and validate the root `SKILL.md` rather
than skipping it

**Acceptance criteria:**
- Format detection returns `plugin` for a root-`SKILL.md` layout, even with no `marketplace.json`
- The root `SKILL.md` is discovered and validated (not orphaned or ignored)
- A `.claude-plugin/` directory containing any entry other than `plugin.json` or
  `marketplace.json` produces an error (rule `claude-plugin-contents`)

**Derived requirements:** SR-013, SR-014
**Covered by:** `evals/datasets/cross-boundary-real-v1.jsonl`
**Amendment (v0.4.0):** SR-013 detection must not require `marketplace.json` (single plugins
omit it); SR-014 must allow `marketplace.json` alongside `plugin.json` (it lives in the
marketplace's `.claude-plugin/`) — otherwise every marketplace repo false-positives (INV-1).

### SCN-007: Author lints a skill using accepted-but-non-canonical value forms
**Given** a `SKILL.md` whose frontmatter is valid to Claude Code but written in a form the
linter's naive parsing mishandles — a boolean field in an extended truthy form
(`disable-model-invocation: off`), or an `allowed-tools` string containing a `Bash(...)`
pattern with an internal space (`allowed-tools: "Bash(git status:*) Read"`)
**When** the author runs `claude-skill-lint lint` on it
**Then** the linter shall report no finding attributable to the accepted form

**Acceptance criteria:**
- A boolean-typed field (`disable-model-invocation`, `user-invocable`, `background`) written
  as `true`/`false`/`yes`/`no`/`on`/`off`/`1`/`0` (case-insensitive) produces no type error
  (2026 spec, v2.1.218+)
- An `allowed-tools` string is tokenized without splitting inside a `Bash(...)` pattern, so
  `Bash(git status:*)` resolves to one tool grant, not a bogus tool `status:*)`
- Neither form produces an `error` (INV-1)

**Derived requirements:** SR-015, SR-016
**Covered by:** `evals/datasets/correctness-adv-v1.jsonl` (tasks adv-1, adv-2)
**Provenance:** surfaced by the adversarial holdouts during flow-eval (2026-08-22); both were
false positives absent from the initial SR list.

## Requirements (derived)

### Functional requirements
- SR-001: Where a skill declares `effort`, the linter shall accept the values `low`,
  `medium`, `high`, `xhigh`, `max`.                                             # ← SCN-001
- SR-002: If a skill or command declares `model: inherit`, then the linter shall not report
  it as an invalid model.                                                       # ← SCN-001
- SR-003: The linter shall accept full model identifiers matching `claude-*` (and
  `us.anthropic.*`) as valid `model` values.                                    # ← SCN-001
- SR-004: The linter shall recognize the frontmatter fields `when_to_use`, `arguments`,
  `disallowed-tools`, `background`, `paths`, `shell`, and `license` without emitting a
  schema or field-level finding.                                               # ← SCN-001
- SR-005: The linter's built-in tool registry shall include the current Claude Code tools
  and shall not require retired names (`TaskCreate`, `TaskGet`, `TaskList`, `TaskUpdate`). # ← SCN-001
- SR-006: When a `SKILL.md` references a bundled file via a markdown link or relative path,
  the linter shall resolve the reference relative to the skill directory and report a broken
  reference if the target does not exist.                                       # ← SCN-002
- SR-007: The linter shall resolve references to non-`.md` bundled resources (e.g. `.py`,
  `.sh`, `.json`, assets) as graph nodes.                                       # ← SCN-002
- SR-008: Where a reference contains `${CLAUDE_SKILL_DIR}` or `${CLAUDE_PROJECT_DIR}`, the
  linter shall expand it to the skill directory or project root before resolution. # ← SCN-002
- SR-009: When an `allowed-tools` `Bash(...)` grant names a script path, the linter shall
  report a broken reference if that script does not exist.                      # ← SCN-002
- SR-010: If a skill's frontmatter `name` differs from its parent directory name, then both
  the `lint` and `graph` passes shall emit a warning naming which identifier governs
  invocation in the detected format; where the format cannot be determined, the warning
  shall default to "directory name governs".                                    # ← SCN-003
- SR-011: If the combined length of `description` and `when_to_use` exceeds 1536 characters,
  then the linter shall emit a warning.                                         # ← SCN-004
- SR-012: Where portable mode is enabled, the linter shall flag any frontmatter field
  outside {`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`}
  as non-portable to the Agent Skills spec, at `warning` severity (rule
  `non-portable-field`).                                                        # ← SCN-005
- SR-013: When a plugin places `SKILL.md` at the plugin root alongside
  `.claude-plugin/plugin.json` (with or without a `marketplace.json`), the linter shall
  detect the plugin format and discover and validate the root `SKILL.md`.       # ← SCN-006
- SR-014: If a `.claude-plugin/` directory contains any entry other than `plugin.json` or
  `marketplace.json`, then the linter shall report an error (rule `claude-plugin-contents`). # ← SCN-006
- SR-015: Where a skill declares a boolean-typed frontmatter field
  (`disable-model-invocation`, `user-invocable`, `background`) using any spec-accepted form
  (`true`/`false`/`yes`/`no`/`on`/`off`/`1`/`0`, case-insensitive), the linter shall not
  report a type error.                                                          # ← SCN-007
- SR-016: When `allowed-tools` is given as a space- or comma-separated string, the linter
  shall tokenize it without splitting inside a `Bash(...)` (or other `Tool(...)`) pattern, so
  a pattern containing spaces resolves to a single tool grant.                  # ← SCN-007

### Non-functional requirements
- SR-100: The linter's `lint` and `graph` passes shall make no network calls and invoke no
  LLM.                                                                          # non-functional
- SR-101: The linter shall process a 139-file skill suite within 2 seconds on commodity
  developer hardware.                                                           # non-functional
- SR-102: The linter shall not introduce findings against the Anthropic skills baseline
  beyond the recorded 14 errors / 24 warnings, except a finding produced intentionally by a
  new rule in this effort and re-recorded in the baseline.                      # non-functional
- SR-103: A `.skill-lint.yaml` configuration valid under v0.5.1 shall remain valid; schema
  and rule changes introduced by this effort shall be additive.                 # non-functional
- SR-104: The `name` kebab-case check shall not impose a hard maximum length.   # non-functional
- SR-105: The description-length threshold (1536), the name↔directory check, and portable-
  mode field findings shall be warnings, never errors.                          # non-functional

## Traceability: scenario → requirement

| Scenario | Derived SR | Notes |
|----------|-----------|-------|
| SCN-001 | SR-001, SR-002, SR-003, SR-004, SR-005 | The false-positive correctness cluster (P0 + schema) |
| SCN-002 | SR-006, SR-007, SR-008, SR-009 | Progressive-disclosure graph tracking (the one design-forky slice) |
| SCN-003 | SR-010 | Warning, not error |
| SCN-004 | SR-011 | Warning, not error |
| SCN-005 | SR-012 | New portable mode |
| SCN-006 | SR-013, SR-014 | Plugin-format currency |
| SCN-007 | SR-015, SR-016 | Accepted-value-form tolerance; surfaced by flow-eval adversarial holdouts |
| — | SR-100..SR-105 | Non-functional; no scenario parent |

## Invariants

- INV-1: No skill accepted by Claude Code as valid is reported as a lint ERROR by the linter
  in its default mode. (No false-positive errors — the effort's ordering constraint.)
- INV-2: The `lint` and `graph` passes remain deterministic and offline — no network, no LLM,
  identical output for identical input.
- INV-3: A skill in any currently-supported format that validated clean under v0.5.1 does not
  newly ERROR after this effort, unless the effort proves it was genuinely broken (recorded).
- INV-4: New reference-extraction regexes are not vulnerable to catastrophic backtracking
  (ReDoS) — every pattern runs in linear time on adversarial input.

## Conformance tests

- `evals/datasets/correctness-real-v1.jsonl` + `evals/graders/correctness.md` cover
  SR-001 through SR-014.
- `evals/datasets/correctness-adv-v1.jsonl` holds the false-positive holdouts for INV-1;
  tasks adv-1 and adv-2 are the acceptance tests for SR-015 and SR-016.
- `evals/datasets/cross-boundary-real-v1.jsonl` + `evals/graders/cross-boundary.md` run the
  linter against whole real skill repos and assert exit codes + finding counts (INV-3, SR-102).
- `evals/graders/invariants.md` enforces INV-1..INV-4 as hard-cull constraints.
- `evals/graders/security.md` includes ReDoS checks for INV-4.

## Glossary

- "skill" = a directory containing a `SKILL.md` file, per the 2026 Agent Skills spec.
- "finding" = one `ValidationResult` emitted by the linter (`error` | `warning` | `info`).
- "false positive" = a finding reported against input that Claude Code treats as valid.
- "portable mode" = a linter mode that enforces the Agent Skills spec's portable field set
  (valid outside Claude Code: claude.ai upload, Skills API, `package_skill.py`).
- "bundled resource" = a supporting file in a skill directory (script, reference, asset)
  loaded via progressive disclosure, not itself a `SKILL.md`.
- "baseline" = the recorded expected finding set for a fixture repo (e.g. Anthropic skills
  repo: 14 errors / 24 warnings under v0.5.1).

## Architectural context

TypeScript (ESM), Node ≥ 20. Two engines: `graph` (cross-file references — broken refs,
orphans, collisions, cycles) and `lint` (Spectral-based frontmatter rules against
`schemas/{skill,command,agent}.schema.json`, built programmatically in
`src/validate-frontmatter.ts`). Format detection (`src/detect-format.ts`) covers
`legacy-commands | plugin | multi-plugin | project-skills`. Reference extraction lives in
`src/validate-graph.ts` (`REF_PATTERN`, `RELATIVE_REF_PATTERN`, `BARE_REF_PATTERN`) and file
discovery in `src/extract.ts` (currently `*.md`-only globs). Classification in
`src/classify.ts`. The full audit and file-level change map is in
`SKILLS-ARCHITECTURE-UPDATE.md` at repo root.
