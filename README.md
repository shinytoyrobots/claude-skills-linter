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

## Companion: /te-review

This repo also includes [`/te-review`](skills/te-review.md), an LLM-powered deep audit skill that goes beyond structural validation — analyzing token efficiency, redundancy, output constraints, and instruction quality. It produces a scored assessment (0-24) with estimated token savings per fix.

claude-skill-lint catches structural bugs deterministically in CI. `/te-review` is an on-demand complement for deeper optimization.

```bash
curl -o ~/.claude/commands/te-review.md https://raw.githubusercontent.com/shinytoyrobots/claude-skills-linter/main/skills/te-review.md
```

## What It Actually Found

### Against a 139-file shared skill suite

```
$ claude-skill-lint graph .
✖ 43 errors and 11 warnings in 54 files (139 files checked)
```

The headline: `inv-output-conventions.md` was renamed to `inv-output-patterns.md` at some point. Nine invention skills still referenced the old name. They silently got no output formatting guidance. A rename bug, invisible at authoring time, caught in seconds.

### Against Anthropic's official skills repo (plugin format)

```
$ claude-skill-lint graph ~/Development/anthropic-skills/
✖ 14 errors and 24 warnings in 37 files (72 files checked)
```

Name collisions in the `claude-api` skill — five language-specific `claude-api.md` files (PHP, Java, Ruby, Go, C#) all resolve to the same canonical name, plus Python/TypeScript duplicates for `tool-use.md`, `streaming.md`, `files-api.md`, and `batches.md`. One genuinely broken `./README.md` reference. Orphaned theme files in `theme-factory` (loaded dynamically, not via static references) and shared context files referenced only from other context files. All legitimate structural findings.

### Against a multi-plugin production repo

```
$ claude-skill-lint lint ~/Development/work/ai-plugins/
✖ 3 warnings in 3 files (45 files checked)
```

Three unlisted plugins (valid `plugin.json` but not declared in the root `marketplace.json`). Graph validation: clean — zero errors across 45 files. The multi-plugin format's relative path resolution (`../../context/foo.md`) works correctly.

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
| Command | `description` | `model`, `allowed-tools`, `argument-hint`, `context`, `agent`, `effort`, `hooks`, `compatibility`, `metadata` |
| Agent | `name`, `description` | `model`, `tools`, `context`, `agent`, `effort`, `hooks`, `compatibility`, `metadata` |
| Skill (plugin) | `name`, `description` | `invocable`, `argument-hint`, `user-invocable`, `allowed-tools`, `context`, `agent`, `effort`, `hooks`, `compatibility`, `metadata` |
| Context | *(none)* | — |

#### Modern Frontmatter Fields

These fields are supported across all file types (command, agent, skill):

| Field | Type | Description |
|-------|------|-------------|
| `context` | `string` | Execution context for the skill (e.g. `fork` to run in a separate process) |
| `agent` | `string` | Agent mode or name to delegate execution to |
| `effort` | `string` | Reasoning effort level — controls how much thinking the model applies |
| `hooks` | `object` | Lifecycle hooks triggered before/after skill execution |
| `compatibility` | `string` | Compatibility requirements or version constraints |
| `metadata` | `object` | Arbitrary key-value metadata for tooling and marketplace use |
| `allowed-tools` | `array` or `string` | Tools the skill can use. Supports glob patterns like `mcp__*` and `Bash(*)` for broad matching, or specific tool names for fine-grained control |

At Level 1: model enum validation, known tool verification (including `Bash(python*)` pattern syntax), tool-to-body consistency, file size limits, `effort` value validation, skill name format.

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

claude-skill-lint auto-detects your repository structure. Four formats are supported:

| Format | Structure | Detection Signal |
|--------|-----------|-----------------|
| **legacy-commands** | `commands/`, `agents/`, `context/` at repo root | No `.claude-plugin/` directory |
| **project-skills** | `.claude/skills/{name}/SKILL.md` | `.claude/skills/` with `SKILL.md` files |
| **plugin** | `skills/{name}/SKILL.md` with marketplace manifest | `.claude-plugin/marketplace.json` at root |
| **multi-plugin** | `plugins/{name}/skills/{skill}/SKILL.md` | Plugin subdirectories with `.claude-plugin/plugin.json` |

Detection priority: config override > multi-plugin > plugin > project-skills > legacy-commands. The first match wins.

### project-skills: The `.claude/skills/` Format

The `project-skills` format uses `.claude/skills/{name}/SKILL.md` — the same structure Claude Code uses for project-scoped skills. Each skill lives in its own directory under `.claude/skills/`.

claude-skill-lint discovers skills in nested `.claude/skills/` directories automatically. In monorepo setups where multiple packages each have their own `.claude/skills/` directory, point the linter at the repo root and it finds them all.

Hybrid repos work too. A repo with both `.claude/skills/` and legacy `commands/` directories — or a published plugin that also has project-level skills — gets everything linted in a single run. No configuration needed.

### Migration Note

For repos transitioning from legacy commands to modern skills, claude-skill-lint validates both locations in a single run. Set the format explicitly in `.skill-lint.yaml` if auto-detection picks the wrong one, or omit it and let detection handle the transition — legacy-commands is the fallback when no modern format signals are found.

## Custom Structures

Not every repo follows a standard layout. claude-skill-lint provides three configuration levers for non-standard structures:

### `skills_root`

If your skill files live in a subdirectory rather than the repo root:

```yaml
skills_root: "packages/my-plugin"
```

All path resolution starts from this root. Useful for monorepos where skills are nested deep.

### `format` Override

Auto-detection works for standard layouts. When it doesn't — or when your repo is mid-migration between formats — set the format explicitly:

```yaml
format: plugin          # Force plugin format detection
# format: legacy-commands | plugin | multi-plugin | project-skills
```

### `ignore` Patterns

Exclude paths that look like skills but aren't:

```yaml
ignore:
  - "**/README.md"
  - "**/CLAUDE.md"
  - "node_modules/**"
  - "docs/**/*.md"
  - "archive/**"
```

Glob patterns, matched against file paths relative to `skills_root`. `node_modules/` is always excluded.

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
# format: legacy-commands | plugin | multi-plugin | project-skills

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

### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Clean — no errors (warnings don't fail by default) |
| `1` | Errors found (or warnings with `--strict`) |
| `2` | Configuration or git error |

By default, **warnings are informational** — orphaned files and minor issues appear as annotations but don't fail the build. Add `--strict` to treat warnings as errors and fail on any finding.

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

To fail on warnings too, add `--strict` to any step:

```yaml
      - name: Graph validation (strict)
        run: claude-skill-lint graph . --format github --strict
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

## Programmatic API

All core functions are exported for integration into custom tooling:

```ts
import { runLint, runGraph, loadConfig, validateFrontmatter, extractFile } from 'claude-skill-lint';
```

See the [package exports](src/index.ts) for the full API surface.

## Releases

See [GitHub Releases](https://github.com/shinytoyrobots/claude-skills-linter/releases) for version history and release notes.

## License

MIT
