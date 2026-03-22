# skill-lint

A quality and token-efficiency pipeline for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill files. Catches broken references, orphaned context, and dependency problems that silently degrade your skills at runtime.

## Why This Matters

Claude Code skills — commands, agents, and context files — are loaded into the model's context window every time they're invoked. When something is structurally wrong, you don't get an error. You get worse results and higher token costs:

- A **broken reference** to a context file means Claude gets no context and fills the gap with hallucination
- An **orphaned context file** that nothing references is dead weight — tokens loaded for no reason
- **Duplicate skill names** silently overwrite each other on install — the wrong skill runs
- A **dependency cycle** between context files creates unbounded context loading

These bugs are invisible at authoring time. Claude Code tolerates them gracefully — it reads what it can and moves on. But "tolerate" is not "work correctly." skill-lint catches these problems deterministically, before they silently degrade your skills.

## What It Actually Found

Running skill-lint against a real 139-file skill suite with 7 sub-suites:

```
$ skill-lint graph .

✖ 43 errors and 11 warnings in 54 files (139 files checked)
```

### Broken references: 32

```
23x context/cpo-company.md  — referenced by 23 skills, file doesn't exist
 9x context/inv-output-conventions.md  — referenced by 9 skills, file doesn't exist
```

**What happened:** `cpo-company.md` is generated at setup time by a `/cpo-setup` command — it's intentionally not committed (it contains company-specific data). But 23 CPO skills reference it as `context/cpo-company.md`. In the shareable repo, before setup runs, every one of those skills is loading with a broken context reference. Claude doesn't fail — it just has no company context and gives generic answers.

`inv-output-conventions.md` was renamed to `inv-output-patterns.md` at some point. 9 invention skills still reference the old name. They silently get no output formatting guidance.

**Impact:** A real rename bug that would have caused subtle quality degradation in every invention skill. Caught in seconds by `skill-lint graph`.

### Orphaned files: 11

```
shared/context/skill-chains.md
shared/context/output-patterns.md
shared/context/migration-pattern.md
delivery-team/agents/dt-middleware-dev.md
delivery-team/agents/dt-frontend-dev.md
delivery-team/agents/dt-backend-dev.md
...
```

**What happened:** Some of these are agent methodology files that are loaded by skills via the Agent tool at runtime (not via direct references in frontmatter) — so they're not truly orphaned. Others, like `migration-pattern.md`, appear to be genuinely dead context files.

**Impact:** Orphan detection is a starting point for investigation, not a definitive verdict. The linter flags candidates; you decide which are actually dead weight.

### Reference cycle: 1

```
context/dt-pipeline-stages.md → context/dt-hitl-protocol.md → context/dt-pipeline-stages.md
```

**What happened:** Two delivery-team context files reference each other. When a skill loads one, it references the other, which references the first.

**Impact:** Context pollution — both files get pulled into the context window even when only one is relevant.

### What about frontmatter lint?

```
$ skill-lint lint . --level 1

✖ 42 errors and 1 warning in 42 files (139 files checked)
```

The lint pass found 20 `argument-hint` type errors (YAML arrays instead of strings), 14 `tools` type errors (comma-separated strings instead of arrays), and 4 YAML parse errors.

**Honest assessment:** Claude Code tolerates all of the type issues. Skills work fine with `argument-hint: [sprint number]` even though the YAML parses it as an array. The linter is being opinionated about structure — enforcing that frontmatter conforms to a schema. This matters when you're **sharing skills** (other tooling may be stricter), **publishing to a marketplace** (schemas will be enforced), or **building tooling on top of skills** (your code expects consistent types). For personal skills that just work, frontmatter strictness is lower priority than graph validation.

The 4 YAML parse errors, however, are genuinely broken — the frontmatter can't be read at all, so Claude is guessing at the metadata.

## Two Layers of Quality

| Layer | Tool | Speed | When | What It Catches |
|-------|------|-------|------|-----------------|
| **Automated CI** | `skill-lint` | <2s | Every PR | Broken references, orphaned files, cycles, duplicate names, parse errors, file size violations, quality regressions |
| **Deep Audit** | `/te-review` | ~60s | On demand | Token waste patterns, redundant content across files, output format inefficiency, instruction bloat, model routing |

**skill-lint** is deterministic, fast, and free (no LLM calls). It catches structural problems that affect runtime behavior.

**`/te-review`** is a Claude Code skill (included in [`skills/te-review.md`](skills/te-review.md)) that performs LLM-powered deep analysis. It scores token efficiency across four passes — structural audit, redundancy detection, output efficiency, instruction quality — and produces a prioritized optimization plan with estimated token savings. Use it when you want to actively reduce cost and improve quality, not just prevent regressions.

To install the `/te-review` skill:

```bash
cp node_modules/skill-lint/skills/te-review.md ~/.claude/commands/te-review.md
```

Then invoke it in any Claude Code session:

```
/te-review suite                    # Full suite token audit (score 0-24)
/te-review audit my-skill           # Single skill deep dive
/te-review compare old.md new.md    # Before/after token impact
```

## Installation

```bash
npm install -g skill-lint
```

Or use directly with npx:

```bash
npx skill-lint lint .
```

**Requires Node.js 20 or later.**

## Quick Start

```bash
# 1. Initialize config (auto-detects your repo format)
skill-lint init

# 2. Check cross-file references — this is where the high-value bugs are
skill-lint graph .

# 3. Lint frontmatter structure
skill-lint lint .
```

## What It Checks

### Graph Validation (`graph`) — highest value

Builds a dependency graph from cross-file references and checks for:

- **Broken references** — a skill references `context/foo.md` but the file doesn't exist. Claude gets no context and hallucinates instead.
- **Orphaned files** — a context or agent file that no skill references. If loaded via CLAUDE.md, it's token waste on every invocation.
- **Name collisions** — two files resolve to the same canonical name. One silently overwrites the other on install.
- **Dependency cycles** — circular references between files. Creates context pollution.

Reference resolution works across both installed paths (`~/.claude/commands/context/foo.md`) and relative paths (`../../context/foo.md`), with automatic fallback between resolution strategies.

### Frontmatter Validation (`lint`) — structural correctness

Validates YAML frontmatter against schemas that match the file type:

| File Type | Required Fields | Optional Fields |
|-----------|----------------|-----------------|
| Command (`.md` in `commands/`) | `description` | `model`, `allowed-tools`, `argument-hint` |
| Agent (`.md` in `agents/`) | `name`, `description` | `model`, `tools` |
| Skill (`SKILL.md` in plugins) | `name`, `description` | `invocable`, `argument-hint`, `user-invocable`, `disable-model-invocation` |
| Context (`.md` in `context/`) | *(none — no frontmatter)* | — |

At Level 1, additional checks apply: model enum validation, known tool verification, tool-to-body consistency, and file size limits.

Frontmatter lint is opinionated about structure. Claude Code tolerates most type inconsistencies, so these findings matter most when sharing skills, publishing to marketplaces, or building tooling that expects consistent schemas.

### Manifest Validation (plugin format)

For plugin-format repos, skill-lint also validates:

- `marketplace.json` and `plugin.json` structure
- Source path resolution (do declared plugins exist on disk?)
- Plugin name consistency between marketplace and plugin manifests
- Missing `SKILL.md` files in skill directories

## Progressive Quality Levels

Skills mature over time. skill-lint supports progressive quality enforcement — start permissive, ratchet up as skills stabilize.

| Level | Checks Added | Use Case |
|-------|-------------|----------|
| **0** (default) | Valid YAML, required fields, non-empty body | New skills, rapid prototyping |
| **1** | Model enum, known tools, tool-in-body consistency, file size limits, name format | Established skills, shared suites |

Levels 2-3 are planned for future releases.

### Per-File Declaration

```yaml
---
name: my-skill
description: Does something useful
quality_level: 1
---
```

### Directory Defaults

```yaml
# .skill-lint.yaml
default_level: 0
levels:
  commands/: 1
  agents/: 1
```

The effective level for each file is: `max(file declaration, directory default, --level flag)`.

### Anti-Regression Ratchet

```bash
skill-lint lint . --ratchet --base origin/main
```

Compares each file's `quality_level` against the base branch. If any file's level decreased, the build fails. Quality improvements become permanent.

## Repository Formats

skill-lint auto-detects your repository layout:

| Format | Structure | Detection Signal |
|--------|-----------|-----------------|
| **legacy-commands** | `commands/`, `agents/`, `context/` directories | No `.claude-plugin/` directory |
| **plugin** | `.claude-plugin/marketplace.json` + `skills/*/SKILL.md` | Marketplace JSON at root |
| **multi-plugin** | `plugins/*/skills/*/SKILL.md` | Plugin subdirectories with `plugin.json` |

Override in config: `format: multi-plugin`

## Commands

### `skill-lint graph [paths...]`

Validate cross-file references and the dependency graph.

```bash
skill-lint graph .                    # Full graph analysis
skill-lint graph . --format json      # JSON output
skill-lint graph . --format github    # GitHub annotations
skill-lint graph . --strict           # Treat orphan warnings as errors
```

### `skill-lint lint [paths...]`

Validate skill file structure and frontmatter.

```bash
skill-lint lint .                                    # Lint everything
skill-lint lint . --level 1                          # Enforce Level 1 checks
skill-lint lint . --strict                           # Warnings become errors
skill-lint lint . --ratchet                          # Prevent quality regression
skill-lint lint . --changed-only --base origin/main  # Only lint changed files
skill-lint lint . --format json                      # JSON output for tooling
skill-lint lint . --format github                    # GitHub Actions annotations
```

### `skill-lint init`

Generate a `.skill-lint.yaml` with sensible defaults.

```bash
skill-lint init           # Auto-detect format and generate config
skill-lint init --force   # Overwrite existing config
```

**Exit codes:** `0` = no errors, `1` = errors found, `2` = config/runtime error.

## Options

### Graph

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--format` | `-f` | `terminal` | Output: `terminal`, `json`, `github` |
| `--strict` | | `false` | Treat warnings as errors |

### Lint

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--level` | `-l` | `0` | Minimum quality level to enforce (0-3) |
| `--changed-only` | | `false` | Only lint files changed since base ref |
| `--base` | | `origin/main` | Git ref for `--changed-only` and `--ratchet` |
| `--format` | `-f` | `terminal` | Output: `terminal`, `json`, `github` |
| `--strict` | | `false` | Treat warnings as errors |
| `--ratchet` | | `false` | Fail if any file's quality_level decreased vs base |

## Configuration

Run `skill-lint init` to generate a config file, or create `.skill-lint.yaml` manually:

```yaml
# Where skill files live (relative to this file)
skills_root: "."

# Default quality level for files without a declaration
default_level: 0

# Per-directory quality level overrides (prefix match, longest wins)
levels:
  commands/: 1
  agents/: 1

# Repository format (auto-detected if omitted)
# format: legacy-commands | plugin | multi-plugin

# Accepted model names
models: [opus, sonnet, haiku]

# Tool validation
tools:
  mcp_pattern: "mcp__*"   # MCP tools matched by prefix
  custom: []               # Additional tool names to allow

# File size limits (bytes)
limits:
  max_file_size: 15360     # 15KB default

# Files to skip
ignore:
  - "**/README.md"
  - "**/CLAUDE.md"
  - "node_modules/**"

# Graph validation
graph:
  warn_orphans: true       # Flag unreferenced context/agent files
  detect_cycles: true      # Detect circular dependencies
  detect_duplicates: true  # Flag duplicate canonical names
```

## CI Integration

### GitHub Actions

```yaml
name: Skill Lint
on:
  pull_request:
    paths: ['**/*.md', '.skill-lint.yaml']

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g skill-lint

      - name: Graph validation (highest value — catches broken refs)
        run: skill-lint graph . --format github

      - name: Lint changed skills
        run: skill-lint lint . --format github --changed-only --base origin/${{ github.base_ref }}

      - name: Quality ratchet
        run: skill-lint lint . --ratchet --base origin/${{ github.base_ref }} --format github
```

### Pre-commit Hook

```bash
#!/bin/sh
# .husky/pre-commit
STAGED=$(git diff --cached --name-only --diff-filter=ACM -- '*.md')
if [ -n "$STAGED" ]; then
  npx skill-lint lint $STAGED --level 1
fi
```

## License

MIT
