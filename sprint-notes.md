# Sprint Notes — skill-lint Sprint 1

## Phase 1: Discovery (2026-03-21)

### Problem Assessment

**Problem**: No testing or linting tool exists for Claude Code skills. The `~/Development/claude-skills` repo has ~167 markdown files (106 commands, 23 agents, 26 context files) with zero automated validation. Research found 7 broken agent references in the live system that cause runtime failures.

**Why it matters**: Structural bugs in skills (broken references, invalid frontmatter, unrecognized tool names) are deterministic — they can be caught mechanically. Currently they're only found at runtime when a skill fails. The existing `/te-review` is an LLM-dependent on-demand audit; it doesn't run in CI and can't be a pre-commit gate.

**Users**: Robin (primary — skill author), potentially other Claude Code users if open-sourced.

### Proposed Solution

A standalone npm CLI tool (`skill-lint`) with two automated validation layers:
1. **Pre-commit (<2s)**: Frontmatter validation via gray-matter + Spectral programmatic API
2. **CI pipeline (~30s)**: Cross-file graph validation (broken refs, orphans, duplicates, cycles)

Progressive quality profiles (`quality_level` 0-3) with anti-regression ratchet prevent quality backsliding.

### Scope — Sprint 1 (Phase 1 of PLAN.md)

Sprint 1 targets PLAN.md Phase 1 (Foundation):
- CLI scaffold with yargs (lint, graph, promote, init subcommands)
- File classification (path-based type detection)
- Frontmatter extraction (gray-matter + synthetic metadata)
- JSON Schemas for command and agent frontmatter
- Spectral ruleset (Level 0 rules only)
- Frontmatter validation (Spectral programmatic API)
- Terminal reporter
- Config loader (.skill-lint.yaml)
- Verification against live claude-skills repo

### Out of Scope (Sprint 1)

- Graph validation (Phase 2)
- Level 1-3 Spectral rules (Phases 2-3)
- GitHub Actions workflow (Phase 2)
- Husky pre-commit hook (Phase 2)
- Profile ratchet enforcement (Phase 3)
- npm publish (Phase 4)
- `--format github` and `--format json` output modes (Phase 3)

### Constraints

- Must be ESM (`"type": "module"`)
- Spectral programmatic API — verify against current npm before implementing
- gray-matter for frontmatter parsing (handles YAML frontmatter in markdown)
- No temp files — in-memory extraction pipeline

### Feasibility Assessment

**Risk: Low**. All dependencies are mature npm packages. The architecture is straightforward — read files, parse, validate, report. No network calls, no state, no concurrency concerns.

**Key technical risk**: Spectral's programmatic API surface. PLAN.md notes to verify against current npm. This should be validated in the first story.

### Open Questions

1. Should `bin/cli.js` be TypeScript compiled or plain JS? (PLAN.md shows `.js` extensions — likely compiled from TS)
2. Exact Spectral programmatic API for in-memory document validation (needs verification)

### PM Vault Context

- No pm-skills outputs found relevant to this personal project
- Backlog health (2026-03-16) is Knapsack-scoped, not applicable

### Agent Activation Plan

| Agent | Needed | Rationale |
|-------|--------|-----------|
| User Researcher | No | Problem is well-understood from personal experience + prior research |
| Product Designer | No | CLI tool, no UI |
| Codebase Indexer | No | Greenfield repo, nothing to index |
| Backend Dev | Yes | All implementation |
| QA Tester | Yes | Test suite + validation |
| Adversarial PMs | No | Low-risk personal tooling project |
| GTM/Marketing/CX | No | Internal tool |

## Phase 2: Design Intent (2026-03-21)

### Launch Tier

**Tier 4 — Internal/Personal tooling**. No external comms, no marketing, no support docs needed. Future open-source publish (Phase 4) would bump to Tier 3.

### Design Decisions

1. **TypeScript source, compiled to JS**: Source in `src/*.ts`, compiled to `dist/`. `bin/cli.js` is a thin wrapper importing from `dist/`. This matches the ESM + TypeScript convention from the shared personal projects CLAUDE.md.
2. **Spectral programmatic API over CLI**: In-memory validation avoids temp files and is faster. Story 1 must verify the exact API surface.
3. **Level 0 rules only in Sprint 1**: Ship a working foundation; higher-level rules build on proven infrastructure.
4. **Terminal reporter only in Sprint 1**: JSON and GitHub annotation formats deferred to Phase 3.
5. **No Linear integration this sprint**: Personal project, no team workspace configured. Stories tracked via local files only.

### Gate Review (1→2): Skipped

Low-risk personal tooling — adversarial PM review not warranted. Problem is validated by the 7 broken references found in prior research.

## Spectral API Spike Results (2026-03-21)

**Verdict: PROCEED WITH SPECTRAL**

- `@stoplight/spectral-core` v1.21.0 — API matches assumed interface
- In-memory validation confirmed: `spectral.run(jsObject)` works directly
- `@stoplight/spectral-parsers` NOT needed (remove from dependencies)
- ESM interop: Use `esModuleInterop: true` + `module: "Node16"` in tsconfig
- Custom extensions (`x-skill-lint-level`): first-class on `Rule.extensions`
- Built-in `schema` function handles JSON Schema validation with `allErrors: true`
- Spectral bundles ajv internally — no separate ajv dependency needed
- Built-in functions available: `truthy`, `falsy`, `pattern`, `schema`, `defined`, `length`, `enumeration`, etc.
- Custom inline functions supported: `(targetVal, opts, context) => IFunctionResult[]`
- Node.js requirement: `^16.20 || ^18.18 || >= 20.17`

### Impact on stories
- story-005: Proceed as planned, no fallback needed
- Remove `@stoplight/spectral-parsers` from dependencies (project-kickoff.md, story-005)
- Add `@stoplight/spectral-functions` to dependencies (provides `truthy`, `schema`, `pattern`)
- tsconfig: Use `module: "Node16"` instead of generic ESM target
