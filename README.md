# skill-lint

A quality and token-efficiency pipeline for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill files. Catches structural bugs in CI, prevents context bloat, and enforces progressive quality standards — so your skills load faster and cost less per invocation.

## Why This Matters

Claude Code skills — commands, agents, and context files — are loaded into the model's context window every time they're invoked. Every byte counts:

- A **broken reference** to a context file means Claude loads nothing and hallucinates instead
- An **orphaned context file** (referenced by zero skills) is dead weight loaded into context for no reason
- **Duplicate skill names** silently overwrite each other on install
- A **15KB skill file** that could be 5KB costs 3x more tokens on every invocation — and output tokens cost 5x input

skill-lint catches these problems deterministically in CI, before they reach production. It's the fast, automated layer of a two-layer quality pipeline.

### Two Layers of Quality

| Layer | Tool | Speed | When | What It Catches |
|-------|------|-------|------|-----------------|
| **Automated CI** | `skill-lint` | <2s | Every PR | Broken frontmatter, missing fields, orphaned refs, duplicate names, cycles, file size violations, quality regressions |
| **Deep Audit** | `/te-review` | ~60s | On demand | Token waste patterns, redundant content across files, output format inefficiency, instruction bloat, architecture-level optimization |

**skill-lint** runs in CI on every pull request. It's deterministic, fast, and free (no LLM calls). It enforces the structural foundation that makes skills work correctly.

**`/te-review`** is a Claude Code skill (included in [`skills/te-review.md`](skills/te-review.md)) that performs LLM-powered deep analysis. It scores token efficiency across four passes — structural audit, redundancy detection, output efficiency, instruction quality — and produces a prioritized optimization plan with estimated token savings. Run it when you want to actively reduce cost, not just prevent regressions.

Together, they ensure your skills are both **correct** (skill-lint) and **efficient** (te-review).

## Installation

```bash
npm install -g skill-lint
```

Or use directly with npx:

```bash
npx skill-lint lint .
```

To install the `/te-review` deep audit skill, copy it into your Claude Code commands directory:

```bash
cp node_modules/skill-lint/skills/te-review.md ~/.claude/commands/te-review.md
```

Then invoke it in any Claude Code session with `/te-review suite` or `/te-review audit <skill-name>`.

**Requires Node.js 20 or later.**

## Quick Start

```bash
# 1. Initialize config (auto-detects your repo format)
skill-lint init

# 2. Lint all skill files
skill-lint lint .

# 3. Check cross-file references and detect orphans
skill-lint graph .
```

## Real-World Example

Running skill-lint against a 139-file skill suite with 7 sub-suites (CPO, delivery-team, PM, invention, etc.):

```
$ skill-lint lint . --level 1

  delivery-team/commands/dt-status.md [level 1]
    error  "argument-hint" property type must be string  (required-fields-command)

  delivery-team/agents/dt-scrum-master.md [level 1]
    error  "tools" property type must be array  (required-fields-agent)
    warning  file size 21379 bytes exceeds limit of 15360 bytes  (file-size-limit)

  cpo-skills/commands/cpo-setup.md
    error  YAML parse error: can not read a block mapping entry  (parse-error)

✖ 42 errors and 1 warning in 42 files (139 files checked)
```

Two systemic issues found across the entire suite:

| Issue | Count | Root Cause | Fix |
|-------|-------|------------|-----|
| `argument-hint` type error | 20 | `[sprint number]` parsed as YAML array | Quote the value: `"[sprint number]"` |
| `tools` type error | 14 | `tools: Read, Write, Glob` is a string | Use YAML list format with `- Read` entries |
| YAML parse error | 4 | Multiline values without quoting | Quote or use `\|` block scalar |
| file-size-limit | 1 | 21KB agent file (limit: 15KB) | Split or compress |

These are exactly the kind of issues that work fine when Claude is tolerant of malformed frontmatter but break on install, in stricter tooling, or when shared with other users.

```
$ skill-lint graph .

  delivery-team/context/dt-pipeline-stages.md
    error  Reference cycle detected: context/dt-pipeline-stages.md →
           context/dt-hitl-protocol.md → context/dt-pipeline-stages.md  (reference-cycle)

✖ 43 errors and 11 warnings in 54 files (139 files checked)
```

| Issue | Count | Impact |
|-------|-------|--------|
| broken-reference | 32 | Skills reference context files that don't exist — Claude gets no context and hallucinates |
| orphaned-file | 11 | Context/agent files loaded into context but referenced by zero skills — pure token waste |
| name-collision | 10 | Multiple files resolve to the same install path — one silently overwrites the other |
| reference-cycle | 1 | Two context files reference each other — creates unbounded context loading |

## What It Checks

### Frontmatter Validation (`lint`)

Validates YAML frontmatter against schemas that match the file type:

| File Type | Required Fields | Optional Fields |
|-----------|----------------|-----------------|
| Command (`.md` in `commands/`) | `description` | `model`, `allowed-tools`, `argument-hint` |
| Agent (`.md` in `agents/`) | `name`, `description` | `model`, `tools` |
| Skill (`SKILL.md` in plugins) | `name`, `description` | `invocable`, `argument-hint`, `user-invocable`, `disable-model-invocation` |
| Context (`.md` in `context/`) | *(none — no frontmatter)* | — |

At higher quality levels, additional checks apply: model enum validation, known tool verification, tool-to-body consistency, and file size limits.

### Graph Validation (`graph`)

Builds a dependency graph from cross-file references and checks for:

- **Broken references** — a skill references `context/foo.md` but the file doesn't exist
- **Orphaned files** — a context or agent file that no skill references (wasted tokens if loaded)
- **Name collisions** — two files resolve to the same canonical name (one overwrites the other on install)
- **Dependency cycles** — circular references between files

Reference resolution works across both installed paths (`~/.claude/commands/context/foo.md`) and relative paths (`../../context/foo.md`), with automatic fallback between resolution strategies.

### Manifest Validation (plugin format)

For plugin-format repos, skill-lint also validates:

- `marketplace.json` structure and required fields
- `plugin.json` per-plugin manifests
- Source path resolution (do declared plugins exist on disk?)
- Plugin name consistency between marketplace and plugin manifests
- Missing `SKILL.md` files in skill directories

## Progressive Quality Levels

Skills mature over time. skill-lint supports progressive quality enforcement — start permissive, ratchet up as skills stabilize.

### Levels

| Level | Checks Added | Use Case |
|-------|-------------|----------|
| **0** (default) | Valid YAML, required fields, non-empty body | New skills, rapid prototyping |
| **1** | Model enum, known tools, tool-in-body consistency, file size limits, name format | Established skills in active use |

Levels 2-3 are planned for future releases (cross-file consistency, documentation standards).

### Per-File Declaration

Declare a skill's quality level in its frontmatter:

```yaml
---
name: my-skill
description: Does something useful
quality_level: 1
---
```

### Directory Defaults

Set quality floors per directory in `.skill-lint.yaml`:

```yaml
default_level: 0

levels:
  commands/: 1      # All commands must pass Level 1
  agents/: 1        # All agents must pass Level 1
```

The effective level for each file is: `max(file declaration, directory default, --level flag)`. The highest value wins — you can raise the floor but never lower a file's declared level.

### Anti-Regression Ratchet

Once a file declares `quality_level: 1`, it can never go back to 0:

```bash
skill-lint lint . --ratchet --base origin/main
```

The `--ratchet` flag compares each file's `quality_level` against the base branch. If any file's level decreased, the build fails. This makes quality improvements permanent — teams can progressively promote files knowing the bar will hold.

## Repository Formats

skill-lint auto-detects your repository layout:

| Format | Structure | Detection Signal |
|--------|-----------|-----------------|
| **legacy-commands** | `commands/`, `agents/`, `context/` directories | No `.claude-plugin/` directory |
| **plugin** | `.claude-plugin/marketplace.json` + `skills/*/SKILL.md` | Marketplace JSON at root |
| **multi-plugin** | `plugins/*/skills/*/SKILL.md` | Plugin subdirectories with `plugin.json` |

Override auto-detection in config:

```yaml
format: multi-plugin
```

## Commands

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

### `skill-lint graph [paths...]`

Validate cross-file references and the dependency graph.

```bash
skill-lint graph .                    # Full graph analysis
skill-lint graph . --format json      # JSON output
skill-lint graph . --format github    # GitHub annotations
skill-lint graph . --strict           # Treat orphan warnings as errors
```

### `skill-lint init`

Generate a `.skill-lint.yaml` with sensible defaults.

```bash
skill-lint init           # Auto-detect format and generate config
skill-lint init --force   # Overwrite existing config
```

**Exit codes:** `0` = no errors, `1` = errors found, `2` = config/runtime error.

## Options

### Lint

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--level` | `-l` | `0` | Minimum quality level to enforce (0-3) |
| `--changed-only` | | `false` | Only lint files changed since base ref |
| `--base` | | `origin/main` | Git ref for `--changed-only` and `--ratchet` |
| `--format` | `-f` | `terminal` | Output: `terminal`, `json`, `github` |
| `--strict` | | `false` | Treat warnings as errors |
| `--ratchet` | | `false` | Fail if any file's quality_level decreased vs base |

### Graph

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--format` | `-f` | `terminal` | Output: `terminal`, `json`, `github` |
| `--strict` | | `false` | Treat warnings as errors |

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
  max_file_size: 15360     # 15KB default — keeps skills lean

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
          fetch-depth: 0    # Required for --changed-only and --ratchet
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g skill-lint

      - name: Lint changed skills
        run: skill-lint lint . --format github --changed-only --base origin/${{ github.base_ref }}

      - name: Graph validation
        run: skill-lint graph . --format github

      - name: Quality ratchet
        run: skill-lint lint . --ratchet --base origin/${{ github.base_ref }} --format github
```

The `--format github` flag outputs annotations that appear inline on pull request diffs.

### Pre-commit Hook

```bash
#!/bin/sh
# .husky/pre-commit
STAGED=$(git diff --cached --name-only --diff-filter=ACM -- '*.md')
if [ -n "$STAGED" ]; then
  npx skill-lint lint $STAGED --level 1
fi
```

## The Token Efficiency Case

Claude Code skills load into the context window on every invocation. Structural problems don't just cause errors — they waste tokens:

| Problem | Token Impact |
|---------|-------------|
| Orphaned context file (loaded, never used) | ~350 tokens/KB wasted per invocation |
| Broken reference (Claude hallucinates instead) | Unpredictable output token waste |
| Duplicate skill names (silent overwrite) | Correct skill never loads |
| Oversized file (15KB when 5KB would do) | 3x token cost, every invocation |
| Circular dependency (A loads B loads A) | Context pollution, confused output |

skill-lint catches these in CI. For deeper optimization — finding redundant content across files, scoring output format efficiency, and identifying instruction bloat — use [`/te-review`](skills/te-review.md) as the on-demand complement:

```
# In any Claude Code session:
/te-review suite                    # Full suite token audit (score 0-24)
/te-review audit my-skill           # Single skill deep dive
/te-review compare old.md new.md    # Before/after token impact
```

`/te-review` produces a prioritized optimization plan with estimated token savings per fix, a context file heat map (highest-ROI optimization targets), and model routing recommendations.

## License

MIT
