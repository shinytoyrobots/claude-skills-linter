# Plan: skill-lint — CI Test Suite for Claude Code Skills

## Context

No testing or linting tool exists for Claude Code skills. The `~/Development/claude-skills` repo has ~167 markdown files (106 commands, 23 agents, 26 context files) with zero automated validation. Research found 7 broken agent references in the live system that would cause runtime failures. This tool catches structural bugs deterministically in CI, while the existing `/te-review` skill remains the on-demand deep audit for LLM-dependent checks.

## Architecture

Two automated layers + on-demand audit:

```
Pre-commit (<2s)  → frontmatter validation (gray-matter + Spectral)
CI pipeline (~30s) → cross-file graph validation (custom Node script)
On-demand          → /te-review for LLM-dependent checks (unchanged)
```

Progressive profiles (`quality_level` 0-3 in frontmatter) with anti-regression ratchet.

## Repo Strategy

**Separate repo from day one**: `~/Development/skill-lint` as a standalone npm package. The `claude-skills` repo consumes it as a devDependency and provides `.skill-lint.yaml` config + Husky pre-commit hook. This makes the tool open-source-ready from the start.

```
~/Development/skill-lint/              # the tool (standalone, npm-publishable)
  package.json                         # bin: skill-lint
  bin/cli.js                           # entry point
  src/
    classify.js                        # path-based file type detection
    extract.js                         # gray-matter parse → in-memory array
    validate-frontmatter.js            # Spectral programmatic API wrapper
    validate-graph.js                  # cross-file reference validator
    profiles.js                        # quality_level enforcement + ratchet
    reporter.js                        # terminal, JSON, GitHub annotation formats
    config.js                          # loads .skill-lint.yaml, merges defaults
  spectral/
    .spectral.yaml                     # custom ruleset with x-skill-lint-level per rule
    functions/
      known-tools.js                   # validate tool names against configurable registry
      tools-in-body.js                 # verify allowed-tools appear in body text
  schemas/
    command.schema.json                # JSON Schema: description, argument-hint, model, allowed-tools
    agent.schema.json                  # JSON Schema: name, description, tools, model + optionals
  test/
    fixtures/                          # sample valid/invalid skill files
      valid-command.md
      valid-agent.md
      missing-model.md
      broken-reference.md
      legacy-agent.md
    extract.test.js
    classify.test.js
    validate-frontmatter.test.js
    validate-graph.test.js
  README.md
  LICENSE

~/Development/claude-skills/           # the consumer (existing repo)
  package.json                         # devDeps: skill-lint, husky
  .skill-lint.yaml                     # repo-specific config
  .husky/pre-commit                    # runs skill-lint on staged files
  .github/workflows/validate-skills.yml
```

## Key Design Decisions

### 1. In-memory extraction, no temp files
`extract.js` reads markdown → gray-matter parses → injects synthetic metadata (`___body_length`, `___file_size`, `___body_text`) → feeds JSON objects to Spectral's programmatic API. Fast.

### 2. File classification is path-based
`/commands/` → command, `/agents/` → agent, `/context/` → context, `README.md` → readme. Agents without frontmatter (shared legacy format) classified as "legacy-agent" and exempt from frontmatter rules.

### 3. Spectral rules tagged with `x-skill-lint-level`
Each rule declares its minimum profile level. The runner filters rules based on each file's `quality_level`. One ruleset, not four configs.

### 4. Known tool registry is configurable
Built-in Claude tools hardcoded. MCP tools matched via `mcp__*` glob pattern. Users extend via `.skill-lint.yaml` `tools.custom` array.

### 5. Anti-regression ratchet
CI compares `quality_level` in PR branch vs base branch via `git show`. Level can never decrease. New files default to 0.

## Progressive Profile Levels

| Level | Rules added |
|-------|------------|
| 0 (min) | Valid YAML frontmatter, required fields present, non-empty body |
| 1 (basic) | + model enum valid, tools recognized, file size limits |
| 2 (moderate) | + reference integrity, tool-declaration-to-body consistency |
| 3 (strict) | + no fluff phrases, emphasis limit, output format constraints |

## CLI Interface

```
skill-lint lint [paths...]       # default: lint skill files
skill-lint graph [paths...]      # cross-file graph validation
skill-lint promote [--dry-run]   # find/apply quality level promotions
skill-lint init                  # create .skill-lint.yaml

Options:
  --level <n>        Override quality level (0-3)
  --changed-only     Only lint files changed vs base branch
  --base <ref>       Base ref for ratchet (default: origin/main)
  --format <fmt>     terminal | json | github
  --strict           Treat warnings as errors
  --ratchet          Fail if quality_level decreased
```

Exit codes: 0 = pass, 1 = errors, 2 = config error.

## Graph Validator Checks

1. **Broken references** — context/agent paths that don't resolve to existing files
2. **Orphaned files** — context/agent files referenced by zero commands
3. **Duplicate content** — SHA-256 hash comparison for byte-identical files
4. **Cycle detection** — DFS on adjacency list
5. **Fanout report** — context file × referencing skill count × size (informational)
6. **Prefix consistency** — commands use their suite's registered prefix from PREFIXES.md

Reference extraction normalizes both `~/.claude/commands/` (installed path) and repo-relative paths to canonical form.

## Configuration File (`.skill-lint.yaml`)

```yaml
# Where skill files live (relative to this file)
skills_root: .

# Default quality level for files without frontmatter declaration
default_level: 0

# Directory-level overrides
levels:
  cpo-skills/commands: 1
  delivery-team/commands: 1

# Known tool registry
tools:
  mcp_pattern: "mcp__*"
  custom: []                 # additional tool names

# Model enum
models: [opus, sonnet, haiku]

# File size limits (bytes)
limits:
  max_file_size: 15360

# Prefix registry (path to PREFIXES.md or inline map)
prefixes: PREFIXES.md

# Files to skip
ignore:
  - "**/README.md"
  - "shared/automation/**"

# Graph settings
graph:
  warn_orphans: true
  warn_fanout_above: 50000
  detect_cycles: true
  detect_duplicates: true
```

## GitHub Actions Workflow (in claude-skills)

```yaml
name: Validate Skills
on:
  pull_request:
    paths: ['**/*.md', '.skill-lint.yaml']
jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - name: Lint changed skills
        run: npx skill-lint lint --changed-only --base origin/${{ github.base_ref }} --format github --strict
      - name: Graph validation
        run: npx skill-lint graph --format github
      - name: Ratchet check
        run: npx skill-lint lint --ratchet --base origin/${{ github.base_ref }} --format github
```

## Pre-commit Hook (in claude-skills)

```bash
# .husky/pre-commit
STAGED=$(git diff --cached --name-only --diff-filter=ACM -- '*.md' | grep -E '(commands|agents|context)/')
if [ -n "$STAGED" ]; then
  npx skill-lint lint --level 1 $STAGED
fi
```

## Implementation Phases

### Phase 1: Foundation (1 session)
Working in `~/Development/skill-lint/`:
1. `package.json` with bin entry, deps: gray-matter, @stoplight/spectral-core, yargs, glob, chalk
2. `bin/cli.js` — yargs scaffold (lint, graph, promote, init)
3. `src/classify.js` — path-based file type detection
4. `src/extract.js` — gray-matter extraction with synthetic metadata
5. `schemas/command.schema.json` + `schemas/agent.schema.json`
6. `spectral/.spectral.yaml` — Level 0 rules only
7. `src/validate-frontmatter.js` — Spectral programmatic API wrapper
8. `src/reporter.js` — terminal format
9. `src/config.js` — load .skill-lint.yaml with defaults
10. Test by running against `~/Development/claude-skills/`

### Phase 2: Graph + CI (1 session)
1. `src/validate-graph.js` — reference extraction, broken links, orphans, duplicates, cycles
2. Level 1 Spectral rules (model enum, known tools, file size)
3. `spectral/functions/known-tools.js` + `tools-in-body.js`
4. In claude-skills: `.github/workflows/validate-skills.yml`
5. In claude-skills: `package.json` (devDep: skill-lint from local path initially)
6. In claude-skills: Husky pre-commit hook + `.skill-lint.yaml`

### Phase 3: Profiles + Polish (1 session)
1. `src/profiles.js` — quality_level enforcement + ratchet comparison
2. Level 2-3 Spectral rules
3. `--format github` output mode
4. `promote` subcommand with `--dry-run` and `--apply`
5. Unit tests with fixtures (node:test runner)
6. README with usage docs

### Phase 4: Publish
1. Publish to npm
2. Update claude-skills to use npm version instead of local path
3. `npx skill-lint init` onboarding flow

## Verification

```bash
# Phase 1: lint all files at level 0
cd ~/Development/skill-lint
node bin/cli.js lint --level 0 ~/Development/claude-skills

# Phase 2: graph + CI
node bin/cli.js graph ~/Development/claude-skills
node bin/cli.js lint --changed-only --base main ~/Development/claude-skills

# Phase 3: promotions
node bin/cli.js promote --dry-run ~/Development/claude-skills
node bin/cli.js lint --level 3 ~/Development/claude-skills/cpo-skills/commands/cpo-lno.md

# Unit tests
node --test
```

## Dependencies

```json
{
  "gray-matter": "^4.0.3",
  "@stoplight/spectral-core": "^1.18.0",
  "@stoplight/spectral-parsers": "^1.0.0",
  "glob": "^10.0.0",
  "yaml": "^2.3.0",
  "chalk": "^5.3.0",
  "yargs": "^17.7.0"
}
```

Verify Spectral programmatic API against current npm before implementing.

## Edge Cases

- **Legacy agents** (shared/web-researcher.md etc.) — no frontmatter. Classified as "legacy-agent", exempt from frontmatter rules, only body-level checks.
- **Context files** — no frontmatter by design. Only graph-level checks (orphan detection, reference targets).
- **MCP tool names** — matched via `mcp__*` glob. Typos won't be caught. Strict known-MCP-tools mode is a future enhancement.
- **Reference path normalization** — skills use `~/.claude/commands/` paths (installed); graph validator normalizes to repo-relative paths.
- **PREFIXES.md parsing** — regex extraction of the registry table. If format changes, parser needs updating.

## Research Foundation

Full research at: `~/Documents/knowledge-vault/Notes/Reference/Deep-Research/2026-03-21-skill-ci-testing/research-output.md`
Spectral reference: `~/Documents/knowledge-vault/Notes/Reference/Deep-Research/2026-03-21-spectral-custom-rulesets.md`
Dependency graph analysis: `~/Documents/knowledge-vault/Notes/Reference/Deep-Research/2026-03-21-skill-dependency-graph/research-output.md`
