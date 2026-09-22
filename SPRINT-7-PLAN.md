# Sprint 7: Efficiency Hardening

**Source**: `/dt-efficiency-review` codebase scan (2026-03-23)
**Score**: 36/50 — targeting 42+/50 after this sprint
**Theme**: Fix security defect, eliminate structural waste, tighten compiler checks

---

## Stories

### Story 1: Fix shell injection in `changed-files.ts`
**Priority**: P0 (security)
**Size**: XS
**Files**: `src/changed-files.ts`

Replace `execSync` template-literal shell command with `execFileSync` args array.
Both `git rev-parse` (line 30) and `git diff` (line 41) calls need migration.

**Acceptance Criteria**:
- [ ] AC-1: `getChangedFiles` uses `execFileSync` with an args array for both git calls
- [ ] AC-2: No `execSync` imports remain in the file
- [ ] AC-3: `--changed-only --base "$(malicious)"` does not reach a shell
- [ ] AC-4: Existing `changed-files.test.ts` tests pass
- [ ] AC-5: Manual smoke test: `npm run build && node bin/cli.js lint --changed-only --base origin/main .`

---

### Story 2: Extract shared validation pipeline from `lint.ts`
**Priority**: P1 (structural)
**Size**: M
**Files**: `src/lint.ts`

The `changedOnly` branch (lines 52-115) and normal scan branch (lines 119-209) duplicate ignore filtering, `validateFrontmatter`, ratchet check, report formatting, and exit-code logic. Extract a shared helper.

**Acceptance Criteria**:
- [ ] AC-1: A new `runValidationPipeline(results, options, config, format?)` helper handles: validate → ratchet → report → strict check → exit code
- [ ] AC-2: Both `changedOnly` and normal branches call the shared helper
- [ ] AC-3: `runLint` function is under 80 lines (currently ~170)
- [ ] AC-4: All existing `lint.test.ts` tests pass without modification
- [ ] AC-5: Zero behavioral change — same exit codes, same output for all format modes

---

### Story 3: Deduplicate default config between `config.ts` and `init.ts`
**Priority**: P1 (structural)
**Size**: S
**Files**: `src/config.ts`, `src/init.ts`

`init.ts:defaultConfigForDetection()` is a full copy of `config.ts:getDefaults()`.

**Acceptance Criteria**:
- [ ] AC-1: `getDefaults()` is exported from `config.ts`
- [ ] AC-2: `init.ts` imports and uses `getDefaults()` — no local config literal
- [ ] AC-3: `defaultConfigForDetection` function is removed
- [ ] AC-4: `init.test.ts` tests pass
- [ ] AC-5: `claude-skill-lint init` output is unchanged

---

### Story 4: Remove unnecessary `async` from `checkRatchet`
**Priority**: P2 (runtime)
**Size**: XS
**Files**: `src/profiles.ts`, `src/lint.ts`

`checkRatchet` is `async` but contains zero `await` expressions — all git operations use synchronous `execFileSync`. The `async` keyword adds an unnecessary Promise wrapper and forces `await` at every call site.

**Acceptance Criteria**:
- [ ] AC-1: `checkRatchet` returns `ValidationResult[]` (not `Promise<ValidationResult[]>`)
- [ ] AC-2: `async` keyword removed from function signature
- [ ] AC-3: Call sites in `lint.ts` updated (remove `await`)
- [ ] AC-4: All `profiles.test.ts` and `lint.test.ts` tests pass

---

### Story 5: Parallelize glob patterns in `extractAll`
**Priority**: P2 (runtime)
**Size**: S
**Files**: `src/extract.ts`

The `for` loop at line 191 awaits each `glob()` call sequentially. Plugin/multi-plugin formats generate 4+ patterns — these can run concurrently.

**Acceptance Criteria**:
- [ ] AC-1: `glob()` calls run via `Promise.all` instead of sequential `await`
- [ ] AC-2: Results are flattened and deduplicated as before
- [ ] AC-3: All `extract.test.ts` tests pass
- [ ] AC-4: `npm run build && node bin/cli.js lint .` works on a plugin-format repo

---

### Story 6: Enable strict unused-variable checks in `tsconfig.json`
**Priority**: P2 (tooling)
**Size**: S
**Files**: `tsconfig.json`, then fix any compile errors

**Acceptance Criteria**:
- [ ] AC-1: `noUnusedLocals: true` added to `tsconfig.json`
- [ ] AC-2: `noUnusedParameters: true` added to `tsconfig.json`
- [ ] AC-3: Dead `parent` Map in `validate-graph.ts:662` removed
- [ ] AC-4: Unused `_config` in `validate-manifest.ts:47` either removed or explicitly annotated
- [ ] AC-5: `npm run build` succeeds with zero errors
- [ ] AC-6: `npm test` passes

---

### Story 7: Replace sentinel integers in `resolveLevel`
**Priority**: P3 (cognitive)
**Size**: S
**Files**: `src/profiles.ts`, `src/validate-frontmatter.ts`

`resolveLevel` returns `-1` (out-of-range) and `-2` (no override) as magic sentinel values. Replace with a discriminated union type.

**Acceptance Criteria**:
- [ ] AC-1: New type: `type LevelResult = { kind: 'explicit'; level: number } | { kind: 'out-of-range' } | { kind: 'default' }`
- [ ] AC-2: `resolveLevel` returns `LevelResult` instead of `number`
- [ ] AC-3: `validateFrontmatter` switch on `result.kind` instead of checking `-1`/`-2`
- [ ] AC-4: All `profiles.test.ts` and `validate-frontmatter.test.ts` tests pass (update assertions as needed)
- [ ] AC-5: Zero behavioral change in lint output

---

## Stretch Goals (if capacity permits)

- **Cache Spectral instances** by `(fileType, effectiveLevel)` tuple in `validateFrontmatter` — reduces per-file instantiation overhead for large repos
- **Add `eslint-plugin-security`** or `biome` as a lint baseline — no lint config exists today
- **Add `knip`** for unused export detection across the project

---

## Ordering

```
Story 1 (P0, XS) ──→ Story 2 (P1, M) ──→ Story 3 (P1, S)
                                              │
Story 4 (P2, XS) ─── Story 5 (P2, S) ─── Story 6 (P2, S)
                                              │
                                        Story 7 (P3, S)
```

Stories 1, 4, 5 are independent and can start in parallel.
Story 6 should land before Story 7 (tsconfig changes may surface issues that inform the refactor).
Story 2 is the largest — start early.
