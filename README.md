# claude-skill-lint

Structural validation and token-efficiency tooling for [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skills. Catches the bugs that Claude tolerates but your users pay for.

## The Problem No One Sees

Claude Code skills load into the context window on every invocation. When a skill references a context file that doesn't exist, Claude doesn't throw an error. It hallucinates the missing context and keeps going. When two skills resolve to the same install path, one silently overwrites the other. When a context file is loaded but nothing references it, you're burning tokens for nothing.

These aren't hypothetical failure modes. They're what we found running claude-skill-lint against a real 139-file production suite:

- **32 broken references.** 23 skills referenced a context file that's generated at setup time — in the shareable repo, before setup runs, those skills have no context at all. 9 more referenced a file that had been renamed months earlier. Every one of those skills was silently degraded.
- **11 orphaned files.** Context and agent files loaded into the window but referenced by zero skills. Dead weight on every invocation.
- **1 dependency cycle.** Two context files referencing each other, pulling both into the window when only one was needed.

Caught in under two seconds. No LLM calls. Deterministic.

"Tolerate" is not "work correctly."

## Two Layers

| | `claude-skill-lint` | `/te-review` |
|-|-------------|-------------|
| **What** | Structural validation | Token efficiency audit |
| **Speed** | <2s, every PR | ~60s, on demand |
| **Approach** | Deterministic CI — no LLM | LLM-powered deep analysis |
| **Catches** | Broken refs, orphans, cycles, collisions, parse errors, size violations, quality regressions | Redundant content, output format waste, instruction bloat, model routing, architecture-level optimization |

claude-skill-lint enforces the structural foundation. `/te-review` (included in [`skills/te-review.md`](skills/te-review.md)) goes deeper — scoring suites across architecture, efficiency, and instruction quality, then producing a prioritized optimization plan with estimated token savings per fix.

Install the deep audit skill:

```bash
cp node_modules/claude-skill-lint/skills/te-review.md ~/.claude/commands/te-review.md
```

Then in any Claude Code session:

```
/te-review suite                    # Full suite audit (scored 0-24)
/te-review audit my-skill           # Single skill deep dive
/te-review compare old.md new.md    # Before/after token impact
```

## What It Actually Found

### Against a 139-file shared skill suite

```
$ claude-skill-lint graph .
✖ 43 errors and 11 warnings in 54 files (139 files checked)
```

The headline: `inv-output-conventions.md` was renamed to `inv-output-patterns.md` at some point. Nine invention skills still referenced the old name. They silently got no output formatting guidance. A rename bug, invisible at authoring time, caught in seconds.

### Against Anthropic's official skills repo

```
$ claude-skill-lint graph ~/Development/anthropic-skills/
```

Name-collision findings in the `claude-api` skill — five language-specific `claude-api.md` files (PHP, Java, Ruby, Go, C#) all resolve to the same canonical name. True findings from Anthropic's own reference implementation. Orphaned theme files in `theme-factory` (loaded dynamically, not via static references). Legitimate structural observations, not false positives.

### Frontmatter lint: honest assessment

The lint pass found 34 type errors across the same 139-file suite — `argument-hint` values parsed as YAML arrays instead of strings, `tools` fields as comma-separated strings instead of arrays.

Claude Code tolerates all of them. Skills work fine. The linter is being opinionated about structure, enforcing that frontmatter conforms to a schema. That matters when you're sharing skills, publishing to a marketplace, or building tooling that expects consistent types. For personal skills that just work, graph validation is where the real value lives.

The 4 YAML parse errors, on the other hand, are genuinely broken. The frontmatter can't be read at all.

## Installation

```bash
npm install -g claude-skill-lint
```

Or directly:

```bash
npx claude-skill-lint lint .
```

Requires Node.js 20+.

## Quick Start

```bash
claude-skill-lint init           # Auto-detect format, generate config
claude-skill-lint graph .        # Cross-file references — the high-value bugs
claude-skill-lint lint .         # Frontmatter structure
```

## What It Checks

### Graph Validation

Builds a dependency graph from cross-file references. Finds:

- **Broken references** — skill says "read context/foo.md," file doesn't exist. Claude hallucinates the gap.
- **Orphaned files** — context or agent files that nothing references. Tokens loaded for nothing.
- **Name collisions** — two files resolve to the same canonical name. One overwrites the other on install.
- **Dependency cycles** — circular references between files. Context pollution.

Resolves both installed paths (`~/.claude/commands/context/foo.md`) and relative paths (`../../context/foo.md`, `./reference/guide.md`, `agents/scanner.md`), with automatic fallback between resolution strategies.

### Frontmatter Validation

Validates YAML frontmatter against file-type schemas:

| File Type | Required Fields | Optional Fields |
|-----------|----------------|-----------------|
| Command | `description` | `model`, `allowed-tools`, `argument-hint` |
| Agent | `name`, `description` | `model`, `tools` |
| Skill (plugin) | `name`, `description` | `invocable`, `argument-hint`, `user-invocable` |
| Context | *(none)* | — |

At Level 1: model enum validation, known tool verification, tool-to-body consistency, file size limits.

### Manifest Validation (plugin format)

Validates `marketplace.json` and `plugin.json` structure, source path resolution, name consistency, and missing skill files.

## Progressive Quality Levels

Skills mature. The quality bar should mature with them.

| Level | What It Adds | When |
|-------|-------------|------|
| **0** | Valid YAML, required fields, non-empty body | New skills, prototyping |
| **1** | Model enum, known tools, tool-in-body check, file size limits | Established skills, shared suites |

Declare per file:

```yaml
---
name: my-skill
description: Does something useful
quality_level: 1
---
```

Or set directory defaults in `.skill-lint.yaml`:

```yaml
default_level: 0
levels:
  commands/: 1
  agents/: 1
```

Effective level: `max(file declaration, directory default, --level flag)`. The highest value wins. You can raise the floor but never lower a file's declared level.

### Ratchet

```bash
claude-skill-lint lint . --ratchet --base origin/main
```

Compares each file's `quality_level` against the base branch. If any level decreased, the build fails. Quality improvements become permanent. That's the point.

## Repository Formats

Auto-detected:

| Format | Structure | Signal |
|--------|-----------|--------|
| **legacy-commands** | `commands/`, `agents/`, `context/` | No `.claude-plugin/` |
| **plugin** | `skills/*/SKILL.md` | Marketplace JSON at root |
| **multi-plugin** | `plugins/*/skills/*/SKILL.md` | Plugin subdirectories with `plugin.json` |

## Commands

### `claude-skill-lint graph [paths...]`

```bash
claude-skill-lint graph .                    # Full graph analysis
claude-skill-lint graph . --format json      # JSON output
claude-skill-lint graph . --format github    # GitHub annotations
claude-skill-lint graph . --strict           # Orphan warnings become errors
```

### `claude-skill-lint lint [paths...]`

```bash
claude-skill-lint lint .                                    # Lint everything
claude-skill-lint lint . --level 1                          # Enforce Level 1
claude-skill-lint lint . --strict                           # Warnings become errors
claude-skill-lint lint . --ratchet                          # Prevent quality regression
claude-skill-lint lint . --changed-only --base origin/main  # Only changed files
claude-skill-lint lint . --format json                      # JSON for tooling
claude-skill-lint lint . --format github                    # GitHub Actions annotations
```

### `claude-skill-lint init`

```bash
claude-skill-lint init           # Auto-detect format, generate config
claude-skill-lint init --force   # Overwrite existing
```

Exit codes: `0` clean, `1` errors found, `2` config error.

## Options

| Option | Default | Description |
|--------|---------|-------------|
| `--level` / `-l` | `0` | Minimum quality level (0-3) |
| `--changed-only` | `false` | Only check files changed since base ref |
| `--base` | `origin/main` | Git ref for `--changed-only` and `--ratchet` |
| `--format` / `-f` | `terminal` | Output: `terminal`, `json`, `github` |
| `--strict` | `false` | Treat warnings as errors |
| `--ratchet` | `false` | Fail if any quality_level decreased vs base |

## Configuration

`claude-skill-lint init` generates this. Or create `.skill-lint.yaml` manually:

```yaml
skills_root: "."
default_level: 0

levels:
  commands/: 1
  agents/: 1

# Auto-detected if omitted
# format: legacy-commands | plugin | multi-plugin

models: [opus, sonnet, haiku]

tools:
  mcp_pattern: "mcp__*"
  custom: []

limits:
  max_file_size: 15360

ignore:
  - "**/README.md"
  - "**/CLAUDE.md"
  - "node_modules/**"

graph:
  warn_orphans: true
  detect_cycles: true
  detect_duplicates: true
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
      - run: npm install -g claude-skill-lint

      - name: Graph validation
        run: claude-skill-lint graph . --format github

      - name: Lint changed skills
        run: claude-skill-lint lint . --format github --changed-only --base origin/${{ github.base_ref }}

      - name: Quality ratchet
        run: claude-skill-lint lint . --ratchet --base origin/${{ github.base_ref }} --format github
```

`--format github` produces annotations that appear inline on PR diffs.

### Pre-commit Hook

```bash
#!/bin/sh
STAGED=$(git diff --cached --name-only --diff-filter=ACM -- '*.md')
if [ -n "$STAGED" ]; then
  npx claude-skill-lint lint $STAGED --level 1
fi
```

## License

MIT
