# Story Review — Sprint 1 (Shift-Left)
**Reviewed**: 2026-03-21
**Reviewer**: QA Tester (shift-left mode)
**Sprint**: sprint-01 — Foundation
**Stories reviewed**: 8

---

## Story Review: story-001 — Project scaffold — package.json, tsconfig, bin entry, yargs CLI skeleton
**Verdict**: NEEDS REVISION

### Testability Assessment
| AC | Testable? | Issue | Suggested Revision |
|----|-----------|-------|--------------------|
| AC-1 | Yes | None | None |
| AC-2 | Yes | None | None |
| AC-3 | Yes | "shows options for" could mean flag names vs. full descriptions | Specify: "displays option names `--level`, `--changed-only`, `--base`, `--format`, `--strict`, `--ratchet` in lint --help output" |
| AC-4 | Yes | None | None |
| AC-5 | Partial | Configuration assertion, not behavioral. No AC verifies binary is runnable by name post-install. | Add: "WHEN installed via `npm link`, THE SYSTEM SHALL be invocable as `skill-lint --help`." |

### Missing Edge Cases
- No AC for `node bin/cli.js unknownsubcommand` — yargs behavior is configurable and should be explicit. Add AC-6: "WHEN an unrecognized subcommand is passed, THE SYSTEM SHALL display a usage error and exit with code 1."
- No AC for Node version matrix (Node 18 + 20) given ESM complexity.

### Dependency Issues
- None. Bootstrap story, no dependencies.

### Recommendations
1. Strengthen AC-5 to behavioral verification via `npm link` smoke test.
2. Add AC-6 for unknown subcommand handling.
3. Add Node version matrix to DoD.

---

## Story Review: story-002 — File classifier — path-based type detection
**Verdict**: NEEDS REVISION

### Testability Assessment
| AC | Testable? | Issue | Suggested Revision |
|----|-----------|-------|--------------------|
| AC-1 | Yes | None | None |
| AC-2 | Yes | None | None |
| AC-3 | Yes | None | None |
| AC-4 | Yes | Ambiguous: "matches README.md" — filename only, or path containing readme anywhere? | Specify: "WHEN the **basename** matches `README.md` case-insensitively, THE SYSTEM SHALL classify as `readme`." |
| AC-5 | Partial | `hasFrontmatter` boolean is passed by caller — AC doesn't specify the interface contract clearly | Revise: "WHEN called with path containing `/agents/` and `hasFrontmatter: false`, THE SYSTEM SHALL return `legacy-agent`." |
| AC-6 | Yes | None | None |

### Missing Edge Cases
- No AC for "last-segment wins" on overlapping paths (e.g., `/agents/context/foo.md` → `agent`). The Technical Context specifies this but no AC covers it.
- No AC for absolute path handling with `~/.claude/commands/` prefix — explicitly called out in Technical Context.
- No AC for `hasFrontmatter: true` + `/agents/` path (should be `agent`, not `legacy-agent`).

### Dependency Issues
- Depends on story-001. Correct.
- Implicit cooperative dependency with story-003 (`hasFrontmatter` boolean source) — not a blocking issue but worth noting in dev handoff.

### Recommendations
1. Add AC for "last-segment wins" tie-breaking rule.
2. Clarify AC-4 to basename-only matching.
3. Add AC for absolute path (`~/.claude/...`) handling.
4. Add AC for `hasFrontmatter: true` + `/agents/` combination.

---

## Story Review: story-003 — Frontmatter extractor — gray-matter parse with synthetic metadata
**Verdict**: NEEDS REVISION

### Testability Assessment
| AC | Testable? | Issue | Suggested Revision |
|----|-----------|-------|--------------------|
| AC-1 | Yes | None | None |
| AC-2 | Yes | None | None |
| AC-3 | Yes | Bundles 5 synthetic fields into one criterion — ambiguous failure messages | Consider asserting each field individually in tests |
| AC-4 | Partial | "Error result" is ambiguous — thrown exception vs. structured return? | Revise: "THE SYSTEM SHALL return an ExtractResult where `errors` is non-empty and contains the parse error message and file path." |
| AC-5 | Partial | "All `.md` files matching the glob pattern" underspecifies who provides the pattern | Revise: "WHEN `extractAll` is called with a glob pattern, THE SYSTEM SHALL return one ExtractResult per matching `.md` file." |

### Missing Edge Cases
- No AC for empty files (0 bytes).
- No AC for `extractAll` receiving a glob that matches zero files.
- No AC specifying `___file_type` value for unclassifiable files.
- No AC for file size interaction with config limit.

### Dependency Issues
- **BLOCKING GAP**: `depends-on` only lists story-001, but the `___file_type` synthetic metadata injection requires classify.ts (story-002). **Add story-002 to `depends-on`.**

### Recommendations
1. **Add story-002 to `depends-on`** — required for `___file_type` injection.
2. Clarify AC-4 error return structure.
3. Add AC for empty glob match behavior.
4. Add AC specifying `___file_type` for unclassifiable files.

---

## Story Review: story-004 — JSON Schemas for command and agent frontmatter
**Verdict**: NEEDS REVISION

### Testability Assessment
| AC | Testable? | Issue | Suggested Revision |
|----|-----------|-------|--------------------|
| AC-1 | Yes | None | None |
| AC-2 | Partial | "validate their types correctly" is vague | Specify exact types: `argument-hint` = string, `model` = string, `allowed-tools` = array of strings |
| AC-3 | Yes | None | None |
| AC-4 | Partial | `tools` vs `allowed-tools` on agent schema — both exist but semantics are unspecified | Clarify distinction: `tools` = agent execution tools (system), `allowed-tools` = user-visible tool list |
| AC-5 | Yes | "identifying the missing field" — format unspecified | Specify: "error message or path contains the name of the missing field" |

### Missing Edge Cases
- No AC for `additionalProperties` behavior — are extra frontmatter fields allowed or rejected?
- No AC verifying schemas are valid JSON Schema draft-07 (Task 3 mentions this but no AC).
- No AC for `context` file type reaching schema validation (no schema exists for it).
- No AC for type coercion edge cases (`description: 123`).

### Dependency Issues
- Depends on story-001. Correct.

### Recommendations
1. Add AC specifying `additionalProperties` behavior.
2. Elevate Task 3 to an AC: "THE SYSTEM SHALL validate each schema against JSON Schema draft-07 meta-schema without errors."
3. Clarify `tools` vs `allowed-tools` distinction for agent schema.
4. Add AC for `context` type file handling (skip schema validation).

---

## Story Review: story-005 — Spectral ruleset and frontmatter validator — Level 0 rules
**Verdict**: NEEDS REVISION

### Testability Assessment
| AC | Testable? | Issue | Suggested Revision |
|----|-----------|-------|--------------------|
| AC-1 | Yes | "Level 0 rules" implies filter is active — test must verify filter, not just zero errors | Specify: "returns an empty results array when run against valid command fixture with level=0 filter active" |
| AC-2 | Yes | Strong AC — all 4 output fields named | None |
| AC-3 | Yes | Weaker than AC-2 — does not require all 4 fields | Align with AC-2: require rule name, severity, file path, and message |
| AC-4 | Yes | None | None |
| AC-5 | Yes | None | None |
| AC-6 | Hard | "No temp files" is not automatically assertable | Reframe as code review DoD item: "no `fs.writeFile` calls in validate-frontmatter.ts" |
| AC-7 | Partial | `x-skill-lint-level` presence can only be asserted by parsing .spectral.yaml at test time | Add a test that reads `.spectral.yaml` and asserts every rule has `x-skill-lint-level` key |

### Missing Edge Cases
- No AC for `ExtractResult` with pre-existing errors (invalid YAML) passing into validator.
- No AC for `legacy-agent` or `unknown` file type reaching validation.
- No AC for `context` file type.
- **High risk**: Spectral API uncertainty is flagged in Dev Notes but has no HITL checkpoint or spike task.

### Dependency Issues
- **BLOCKING GAP**: `depends-on` lists story-003 and story-004 but not story-002. File type selection for schema routing requires classify.ts. **Add story-002 to `depends-on`.**

### Recommendations
1. **Add story-002 to `depends-on`**.
2. Reframe AC-6 as a code review DoD item.
3. Add AC for error-result passthrough from extractor.
4. Add ACs for `legacy-agent`, `unknown`, and `context` file type handling.
5. **Escalate Spectral API risk**: make Task 1 (API verification) a 2-hour time-boxed spike with a HITL checkpoint if the API differs significantly from the assumed interface.

---

## Story Review: story-006 — Config loader — .skill-lint.yaml with defaults
**Verdict**: NEEDS REVISION

### Testability Assessment
| AC | Testable? | Issue | Suggested Revision |
|----|-----------|-------|--------------------|
| AC-1 | Yes | None | None |
| AC-2 | Yes | "Default configuration values" — tests must assert all defaults, not just that a config object is returned | Specify: "THE SYSTEM SHALL return a Config where each field matches the documented default values (list them)." |
| AC-3 | Partial | Merge strategy unspecified: deep vs. shallow for nested objects | Specify: deep merge (nested keys merged) or shallow (user key replaces default object entirely) |
| AC-4 | Partial | Ignore pattern enforcement happens in the orchestrator (story-008), not config.ts. Unit testing this in story-006 requires mocking the file system layer. | Split: "config.ts exposes ignore patterns" (unit testable here) + "lint.ts filters by ignore patterns" (test in story-008) |
| AC-5 | Yes | Is config.ts responsible for `process.exit(2)` or does it throw? | Specify: "config.ts SHALL throw a ConfigError; the CLI SHALL catch it and exit with code 2." |

### Missing Edge Cases
- No AC for empty config file (0 bytes) — defaults or error?
- No AC for unknown keys in config — ignored, warned, or rejected?
- No AC for `skills_root` pointing to non-existent directory.
- No AC for `models: []` (empty list).

### Dependency Issues
- Depends on story-001. Correct.
- AC-4 has implicit runtime dependency on story-008 — not declared.

### Recommendations
1. Specify merge strategy (deep vs. shallow) in AC-3.
2. Split AC-4 between story-006 and story-008.
3. Clarify AC-5: config.ts throws, CLI catches.
4. Add ACs for empty config and unknown-key behavior.

---

## Story Review: story-007 — Terminal reporter — human-readable lint output
**Verdict**: NEEDS REVISION

### Testability Assessment
| AC | Testable? | Issue | Suggested Revision |
|----|-----------|-------|--------------------|
| AC-1 | Yes | None | None |
| AC-2 | Partial | "Count of files checked" requires total count in function signature — current `reportTerminal(results)` does not carry it | Specify: function signature must include `totalFiles: number` parameter |
| AC-3 | Partial | chalk strips colors in non-TTY CI environments — color presence is hard to assert | Test by forcing chalk level, or verify chalk methods are called (not raw ANSI strings) |
| AC-4 | Partial | Tests chalk's built-in behavior, not reporter's. | Reframe as code review: "no `chalk.level` force override in reporter.ts" |
| AC-5 | Yes | None | None |

### Missing Edge Cases
- No AC for **warning severity** (yellow) output — Dev Notes say warnings are in scope for Sprint 1.
- No AC for mixed results (errors + clean files) combined summary.
- No AC for exact summary line format — is `"3 errors in 2 files (15 files checked)"` required or illustrative?
- No AC for singular vs. plural ("1 error" vs "2 errors", "1 file" vs "2 files").

### Dependency Issues
- Depends on story-005. Correct.
- **Type ownership gap**: `ValidationResult` type is needed by both story-005 and story-007. Without a canonical shared source (e.g., `src/types.ts`), the two stories will define conflicting types that block story-008.

### Recommendations
1. Add AC for warning-severity (yellow) output.
2. Specify `totalFiles` in function signature.
3. Add AC for singular/plural handling in summary.
4. Establish `src/types.ts` as canonical home for `ValidationResult`, `ExtractResult`, `FileType`, `Config` — add as a task to story-001 or as a dedicated story.

---

## Story Review: story-008 — Wire lint command — end-to-end pipeline integration
**Verdict**: NEEDS REVISION

### Testability Assessment
| AC | Testable? | Issue | Suggested Revision |
|----|-----------|-------|--------------------|
| AC-1 | Partial | "Discover, extract, classify, validate, and report" is high-level — needs fixture with known counts | Specify: "WHEN run against `test/fixtures/`, THE SYSTEM SHALL discover N files, produce M known errors, and exit with code 1." |
| AC-2 | Partial | Cannot be verified in Sprint 1 — no Level 1+ rules exist to prove they are excluded | Defer to sprint that introduces Level 1+ rules, or reframe as "passes `level: 0` to validator which filters by `x-skill-lint-level`" |
| AC-3 | Yes | Requires a warning-producing fixture to exist in `test/fixtures/` | Add fixture note |
| AC-4 | Yes | None | None |
| AC-5 | Yes | None | None |
| AC-6 | Yes | None | None |
| AC-7 | Weak | "Reasonable results" and "sensible error counts" are untestable | Revise: "THE SYSTEM SHALL complete without unhandled exception and exit with code 0 or 1 (never code 2 or crash)." Mark as local-only smoke test. |

### Missing Edge Cases
- No AC for stub flag behavior (`--changed-only`, `--ratchet`, `--base`) — even stubs need specified responses.
- No AC for `--format json` — declared in story-001 CLI but never tested in wire-up.
- No AC for empty target directory (0 files found).
- No AC for file exceeding `max_file_size` config limit.
- No AC for single-file extractor exception not aborting other files.

### Dependency Issues
- All story dependencies declared correctly.
- **AC-7 live directory dependency** (`~/Development/claude-skills/`) must be marked as local-only — will break CI.

### Recommendations
1. Revise AC-7 to concrete pass/fail criteria and flag as local-only.
2. Add ACs for stub flag behaviors.
3. Add AC for `--format json` or explicitly mark as out-of-scope.
4. Add AC for empty directory edge case.
5. Address AC-2 testability gap (no Level 1+ rules in Sprint 1).

---

## Sprint Summary

### Stories READY for Dev
None. All 8 require revisions.

### Stories NEEDING REVISION
| Story | Top Issue |
|-------|-----------|
| story-001 | AC-5 is not behaviorally testable; no unknown subcommand AC |
| story-002 | Missing "last-segment wins" AC; absolute path handling unspecified |
| story-003 | **Missing `depends-on: story-002`**; AC-4 error return structure ambiguous |
| story-004 | `tools` vs `allowed-tools` ambiguity; no `additionalProperties` AC |
| story-005 | **Missing `depends-on: story-002`**; AC-6 not testable; Spectral API risk needs HITL spike |
| story-006 | Merge strategy unspecified; AC-4 belongs in story-008; AC-5 exit responsibility unclear |
| story-007 | No warning AC; `totalFiles` missing from signature; `ValidationResult` type ownership unresolved |
| story-008 | AC-7 untestable; AC-2 unverifiable in Sprint 1; no stub flag ACs |

### Overall Sprint Risk: MEDIUM-HIGH

**Four structural issues require resolution before dev starts:**

1. **Incomplete dependency graph** (BLOCKING): story-003 and story-005 have undeclared runtime dependency on story-002 (classify.ts). Update `depends-on` in both files before implementation.

2. **Spectral API unverified** (HIGH RISK): story-005 is 5 points and the entire approach changes if the Spectral programmatic API differs from assumptions. Recommend a 2-hour time-boxed spike before story-005 begins — escalate to HITL if API is incompatible.

3. **Shared types unowned** (MEDIUM): `ValidationResult`, `ExtractResult`, `FileType`, `Config`, `ParseError` will be needed by multiple stories. No canonical `src/types.ts` is defined — risk of type duplication between story-005 and story-007 blocking story-008 integration. Add a types-scaffold task to story-001.

4. **AC-7 in story-008 is a non-assertion** (MEDIUM): "Reasonable results" cannot be QA-gated. Must be revised to concrete pass/fail criteria before the story can be verified.
