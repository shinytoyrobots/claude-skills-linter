---
schema-version: "1.0"
project: "skill-lint"
created: "2026-03-21"
created-by: scrum-master
stack:
  runtime: "Node.js 20+ (ESM)"
  language: "TypeScript (strict mode, ESM)"
  package-manager: "npm"
  key-deps: "gray-matter, @stoplight/spectral-core, yargs, glob, chalk, yaml"
  testing: "node:test (built-in test runner)"
  ci: "GitHub Actions"
  deployment: "npm publish (Phase 4 — not this sprint)"
hitl-level: 2
linear-workspace: null
linear-team: null
---

# Project Kickoff: skill-lint
**Generated**: 2026-03-21
**Skill**: /project-kickoff
---

## Project Overview
- **Description**: A standalone npm CLI tool that validates Claude Code skill files (commands, agents, context) for structural correctness. Catches broken references, invalid frontmatter, unrecognized tools, and other deterministic issues in CI and pre-commit hooks.
- **Target users**: Robin (primary — skill author); potentially other Claude Code users if open-sourced.
- **Spec/PRD**: `PLAN.md` in this repository
- **Launch tier**: Tier 4 (internal/personal tooling) — no external comms needed

## Technical Context
- **Stack**: TypeScript (strict, ESM), Node.js 20+, npm
- **Key dependencies**: gray-matter, @stoplight/spectral-core, @stoplight/spectral-parsers, yargs, glob, chalk, yaml
- **Repository**: `~/Development/personal/skills-linter/` → `github.com/shinytoyrobots/claude-skills-linter` (private)
- **GitHub org**: shinytoyrobots
- **Testing**: `node:test` (built-in runner), fixtures in `test/fixtures/`
- **Validation target**: `~/Development/claude-skills/` (~167 skill files)

## Repository Structure
```
bin/cli.js                    # yargs entry point (shebang wrapper)
src/
  cli.ts                      # yargs setup — subcommands + options
  classify.ts                 # path-based file type detection
  extract.ts                  # gray-matter parse + synthetic metadata
  validate-frontmatter.ts     # Spectral programmatic API wrapper
  validate-graph.ts           # cross-file reference validator (Phase 2)
  profiles.ts                 # quality_level enforcement + ratchet (Phase 3)
  reporter.ts                 # terminal, JSON, GitHub annotation formats
  config.ts                   # .skill-lint.yaml loader
  lint.ts                     # orchestrator — wires pipeline end-to-end
spectral/
  .spectral.yaml              # custom ruleset with x-skill-lint-level per rule
  functions/                  # custom Spectral functions (Phase 2)
schemas/
  command.schema.json         # JSON Schema for command frontmatter
  agent.schema.json           # JSON Schema for agent frontmatter
test/
  fixtures/                   # valid/invalid sample skill files
  *.test.ts                   # unit tests
```

## Code Conventions
- TypeScript strict mode, ESM (`"type": "module"` in package.json)
- Named exports, no default exports
- `bin/cli.js` uses `#!/usr/bin/env node` and imports from `dist/`
- No temp files — entire pipeline is in-memory
- Exit codes: 0 = pass, 1 = errors, 2 = config error

## GitHub Workflow
- **Branch naming**: `{type}/{story-id}-{slug}` (e.g. `feat/story-001-scaffold`)
- **Commit format**: conventional commits — `{type}({scope}): {description}`
- **Merge strategy**: squash-and-merge
- **PR size target**: 150 lines of significant change
- **Main branch**: main
- **CI**: GitHub Actions (to be configured in Phase 2)
- **.gitignore**: verified — covers node_modules, dist, .env, coverage

## Process Configuration
- **HITL level**: 2 — Phase Gates (approve at major transitions, autonomous within phases)
- **Sprint length**: 5 days
- **Auto-escalation triggers**: story stale > 1.7 days, qa-gate blocking failure, spec ambiguity, scope change, unresolved external dependency
- **Linear**: Not used — personal project, stories tracked via local files

## Architecture Constraints
- CLI tool — no server, no database, no auth
- Spectral used via programmatic API (not CLI) for in-memory validation
- File classification is path-based, not content-based
- Progressive quality profiles (levels 0-3) with anti-regression ratchet

## Definition of Done
Standard delivery-team DoD with these overrides:
```yaml
definition-of-done-overrides:
  accessibility-target: "N/A — CLI tool"
  design-spec-adherence: "N/A — no UI"
  api-contract: "N/A — no API"
  linear-issue-updated: "N/A — no Linear"
  pr-reviewed: "Self-review only — solo project"
```

## Agent Activation Plan
| Agent | Active | Rationale |
|-------|--------|-----------|
| Backend Dev | Yes | All implementation (src/*, bin/*, spectral/*, schemas/*) |
| QA Tester | Yes | Test suite, fixtures, qa-gate validation |
| User Researcher | No | Problem validated by prior research (7 broken refs found) |
| Product Designer | No | CLI tool, no UI |
| Adversarial PMs | No | Low-risk personal tooling |
| GTM/Marketing/CX | No | Tier 4 internal tool |

## Open Questions
1. Spectral programmatic API surface — must verify against current npm before implementing (story-005 Task 1)
2. Exact `bin/cli.js` pattern for ESM TypeScript projects — validate in story-001
