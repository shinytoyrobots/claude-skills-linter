# Skills-Linter — Architecture Currency Update Plan

**Date:** 2026-08-22
**Basis:** Code audit of `claude-skill-lint` @ v0.5.1 vs. current Agent Skills spec
(sources: https://code.claude.com/docs/en/skills.md,
https://code.claude.com/docs/en/plugins-reference.md, as of Aug 2026).

The linter is mature and mostly current (it already knows `SKILL.md` is a
directory-based unit, handles four repo formats, and has a `modern-fields`
test suite). The gaps below are where its model of skills has drifted from the
2026 spec. Ordered by value.

---

## P0 — Correctness bugs (linter emits FALSE POSITIVES on valid 2026 skills)

These make the tool actively wrong on current skills. Fix first.

### P0-1. `effort` enum is missing `xhigh`
- **File:** `src/validate-frontmatter.ts` → `effortInvalidFn`
- **Now:** allows `['low','medium','high','max']`
- **Spec:** `low, medium, high, xhigh, max`
- **Fix:** add `xhigh`. A valid `effort: xhigh` skill is flagged today.

### P0-2. `model: inherit` and full model IDs are flagged
- **File:** `src/validate-frontmatter.ts` → `modelEnumFn`; default `models: [opus, sonnet, haiku]`
- **Spec:** `model` accepts any `/model` value **plus `inherit`**, and full IDs
  (`claude-opus-4-8`, `claude-sonnet-5`, …).
- **Fix:** add `inherit` to the default allow-list; treat any `claude-*` /
  `us.anthropic.*` string as valid (pattern), or downgrade unknown-model to a
  warning. `model-enum` currently runs for `skill` fileType too, so
  `model: inherit` in a SKILL.md is a false error today.

### P0-3. `BUILTIN_TOOLS` set is stale
- **File:** `src/validate-frontmatter.ts` → `BUILTIN_TOOLS`
- **Stale entries:** `TaskCreate, TaskGet, TaskList, TaskUpdate` (retired).
- **Missing current tools:** `SendMessage, Monitor, ScheduleWakeup, SlashCommand,
  BashOutput, KillShell, TaskStop, TaskOutput, Artifact, ReportFindings`,
  `ReadMcpResourceDirTool`, plus review before shipping (tool roster moves).
- **Fix:** refresh the set. Consider downgrading `unknown-tool` to a warning by
  default — the built-in roster changes faster than a release cadence, so a hard
  allow-list guarantees future false positives.

---

## P1 — Progressive-disclosure reference tracking (the graph engine is blind to the modern skill layout)

This is the highest-value *architecture* gap. The graph engine — the linter's
best feature — only understands the legacy `commands/ agents/ context/`
vocabulary and only resolves `*.md`. The 2026 skill bundle is:

```
my-skill/
├── SKILL.md
├── reference.md            # loaded on demand via [link](reference.md)
├── examples.md
└── scripts/helper.py       # executed, referenced in allowed-tools
```

### P1-1. Track markdown-link and non-`.md` references
- **File:** `src/validate-graph.ts` (`REF_PATTERN`, `RELATIVE_REF_PATTERN`,
  `BARE_REF_PATTERN`), `src/extract.ts` (globs are `*.md`-only).
- **Now:** every reference regex matches only `.md` and is anchored on
  `agents|context|commands`. A `SKILL.md` that links `scripts/render.sh`,
  `references/guide.txt`, or `[examples](examples.md)` gets **zero** broken-ref
  detection.
- **Fix:**
  - Add a markdown-link reference pattern: `[text](path)` resolved relative to
    the SKILL.md dir.
  - Resolve non-`.md` bundle targets (`.py`, `.sh`, `.json`, `.txt`, assets) —
    extend `extractAll` to also glob supporting files so they exist as graph
    nodes.
  - Recognize `${CLAUDE_SKILL_DIR}` and `${CLAUDE_PROJECT_DIR}` variables in
    references and resolve them (skill dir / project root).

### P1-2. Verify `allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/x.sh *)` targets exist
- The script path inside a `Bash(...)` grant is a real dependency. Flag when the
  referenced script is missing (broken-ref, high value — silent runtime failure).

### P1-3. Extend `classify.ts` vocabulary
- **File:** `src/classify.ts` → `SEGMENT_TYPE_MAP`
- Add `scripts`, `references` (plural), `assets` as recognized skill-bundle
  segments so supporting files classify correctly instead of `unknown`.

---

## P1 — Schema currency (fields the 2026 spec defines that the schema doesn't know)

**File:** `schemas/skill.schema.json` (and `command`/`agent` where shared).

### P1-4. Add missing frontmatter fields
Currently absent from the skill schema: `when_to_use`, `arguments`,
`disallowed-tools`, `background`, `paths`, `shell`, `license`, `model`.
Add them with correct types:
- `when_to_use`: string
- `arguments`: string OR array
- `disallowed-tools`: string OR array (same shape as `allowed-tools`)
- `background`: boolean (only meaningful with `context: fork`)
- `paths`: string OR array (glob patterns)
- `shell`: enum `["bash","powershell"]`
- `license`: string
- `model`: string

### P1-5. `description` length warning (combined cap 1,536 chars)
- **Spec:** `description` + `when_to_use` are truncated at **1,536 characters** in
  the skill listing Claude scans for auto-invocation.
- **Fix:** new Level-1 warning when `len(description) + len(when_to_use) > 1536`.
  Today the schema only enforces `minLength: 1`.

### P1-6. `compatibility` max 500 chars (per spec); soft-warn.

### P1-7. Remove/verify the spurious `invocable` field
- The skill schema lists `invocable`; the spec has `user-invocable` and
  `disable-model-invocation`, not `invocable`. Confirm and drop if spurious.

### P1-8. `name` ↔ directory relationship — as a WARNING, not an error
- **Nuance from spec:** for **personal/project** skills the *directory* name is
  the invocation name and frontmatter `name` is display-only; for **plugin**
  skills frontmatter `name` *overrides* the directory name. So a mismatch is not
  install-breaking in Claude Code.
- **Fix:** informational warning on `name != dirname` explaining which one wins
  in the detected format (portability/clarity), fitting naturally into the graph
  pass. Do **not** hard-error. Keep the existing kebab-case check; length is
  undocumented, so don't invent a hard cap.

---

## P2 — Agent Skills spec-interop mode (genuinely new, high value)

Outside Claude Code (claude.ai upload, Skills API, `package_skill.py`), **only**
`name, description, license, compatibility, metadata, allowed-tools` are valid —
any other field (e.g. `argument-hint`, `context`, `effort`, `background`,
`paths`, `shell`, `hooks`, `disable-model-invocation`, `user-invocable`,
`arguments`) is a **hard error on upload/packaging**.

- **Fix:** add a `--portable` / `spec-strict` mode (or config flag) that flags
  Claude-Code-only frontmatter fields. This tells authors whether a skill will
  survive upload to claude.ai / the Skills API — a check nothing else does and
  directly tied to the current split between Claude Code and the portable spec.

---

## P2 — Plugin & format detection currency

**Files:** `src/detect-format.ts`, `src/validate-manifest.ts`.

### P2-1. Single-skill plugin with root-level `SKILL.md`
- Spec allows `my-plugin/SKILL.md` + `.claude-plugin/plugin.json` (no `skills/`).
- `detect-format.ts` `hasSkillFiles` only checks `skills/*/SKILL.md` — this layout
  is missed. Add root-`SKILL.md` detection.

### P2-2. `.claude-plugin/` must contain ONLY `plugin.json`
- Structural rule worth enforcing: skills/commands/agents inside `.claude-plugin/`
  is a common mistake that silently breaks loading.

### P2-3. `plugin.json` field currency
- Only `name` is required. Validate optional fields the spec now defines:
  `defaultEnabled` (bool), `dependencies` (array of string|{name,version}),
  `userConfig` (typed map: string/number/boolean/directory/file, `sensitive`),
  component path fields (`skills`, `commands`, `agents`, `hooks`, `mcpServers`,
  `lspServers`, `outputStyles`, `experimental.themes/monitors`).

### P2-4. `skills-dir` plugins
- Recognize `~/.claude/skills/<name>/.claude-plugin/plugin.json` and
  `.claude/skills/<name>/.claude-plugin/plugin.json` (auto-loaded `@skills-dir`).

---

## P3 — Polish

- **Boolean tolerance:** since v2.1.218 booleans accept `yes/no/on/off/1/0`
  (case-insensitive). Schema `type: boolean` may false-flag `1`/`0`; make the
  boolean fields tolerant.
- **README + default config:** refresh "What It Checks", default `models`
  (add `inherit`), and the config example once the above land.
- **`metadata`:** spec says non-map values are dropped; optionally warn when
  `metadata` isn't a map.

---

## Suggested sequencing

1. **Ship P0 immediately** (patch release) — these are false positives on valid
   skills, the most damaging class of linter bug.
2. **P1 schema + description-cap** (minor release) — cheap, high coverage.
3. **P1 progressive-disclosure graph work** (minor release) — the flagship
   feature; most engineering, most differentiated value.
4. **P2 spec-interop mode + plugin currency** (minor release) — new capability.
5. **P3 polish** alongside.

## What is already current (no action)
- Directory-based `SKILL.md` model, four-format detection, `context: fork`,
  `effort` field presence, `metadata`, `compatibility` (as string), the
  canonical-name collision / cycle / orphan graph checks, ratchet & profiles.
