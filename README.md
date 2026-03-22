# skill-lint

A CLI tool that validates [Claude Code](https://docs.anthropic.com/en/docs/claude-code) skill files for structural correctness, cross-file references, and quality standards.

Catches broken frontmatter, missing required fields, orphaned references, duplicate names, and dependency cycles — before they break your Claude Code skills in production.

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
# Initialize a config file (auto-detects your repo format)
skill-lint init

# Lint all skill files in the current directory
skill-lint lint .

# Check cross-file references
skill-lint graph .
```

## Commands

### `skill-lint lint [paths...]`

Validate skill files for structural correctness. Checks frontmatter fields, YAML validity, required metadata, and quality standards based on progressive levels.

```bash
# Lint a specific directory
skill-lint lint ./commands

# Lint multiple paths
skill-lint lint ./commands ./agents ./context

# Lint with Level 1 quality checks (description, model fields)
skill-lint lint . --level 1

# Strict mode — treat warnings as errors (exit 1)
skill-lint lint . --strict

# Anti-regression ratchet — prevent quality level from decreasing
skill-lint lint . --ratchet

# Only lint files changed since a base branch
skill-lint lint . --changed-only --base origin/main

# JSON output (for programmatic use)
skill-lint lint . --format json

# GitHub Actions annotations (inline PR comments)
skill-lint lint . --format github
```

**Exit codes:**
- `0` — no errors (warnings may be present)
- `1` — one or more errors found
- `2` — configuration or runtime error

### `skill-lint graph [paths...]`

Validate cross-file references and the dependency graph. Detects broken references, orphaned files, duplicate skill names, and dependency cycles.

```bash
# Analyze the dependency graph
skill-lint graph .

# Graph analysis with JSON output
skill-lint graph . --format json

# Strict mode for graph — treat warnings as errors
skill-lint graph . --strict
```

### `skill-lint init`

Generate a `.skill-lint.yaml` configuration file with sensible defaults. Automatically detects your repository format (legacy-commands, plugin, or multi-plugin).

```bash
# Generate config
skill-lint init

# Overwrite existing config
skill-lint init --force
```

### `skill-lint promote <path>`

Promote a skill file to the next quality level. *(Stub — not yet implemented.)*

## Options Reference

### Lint Options

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--level` | `-l` | number | `0` | Quality level to enforce (0-3) |
| `--changed-only` | | boolean | `false` | Only lint files changed since base ref |
| `--base` | | string | `origin/main` | Git base ref for `--changed-only` |
| `--format` | `-f` | string | `terminal` | Output format: `terminal`, `json`, `github` |
| `--strict` | | boolean | `false` | Treat warnings as errors |
| `--ratchet` | | boolean | `false` | Enforce anti-regression (never go below current level) |

### Graph Options

| Option | Alias | Type | Default | Description |
|--------|-------|------|---------|-------------|
| `--format` | `-f` | string | `terminal` | Output format: `terminal`, `json`, `github` |
| `--strict` | | boolean | `false` | Treat warnings as errors |

### Init Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--force` | boolean | `false` | Overwrite existing `.skill-lint.yaml` |

## Configuration

skill-lint looks for a `.skill-lint.yaml` file in the current working directory. Run `skill-lint init` to generate one with auto-detected defaults.

### Full Config Reference

```yaml
# Root directory containing skill files (relative to config file)
skills_root: "."

# Default quality level for all files (0-3)
default_level: 0

# Per-directory quality level overrides
# Keys are directory paths relative to skills_root
levels:
  commands/: 1
  agents/: 1

# Repository format override (auto-detected if omitted)
# Values: legacy-commands, plugin, multi-plugin
format: plugin

# Accepted model names in frontmatter
models: [opus, sonnet, haiku]

# Tool validation settings
tools:
  # Glob pattern for MCP tool names
  mcp_pattern: "mcp__*"
  # Additional tool names to allow
  custom: []

# File size limits
limits:
  # Maximum file size in bytes (default: 15KB)
  max_file_size: 15360

# Glob patterns for files to ignore
ignore:
  - "**/README.md"
  - "**/CLAUDE.md"
  - "node_modules/**"

# Path to PREFIXES.md or inline prefix map
prefixes: PREFIXES.md

# Graph validation settings
graph:
  # Warn about skill files with no incoming references
  warn_orphans: true
  # Fanout threshold for warnings
  warn_fanout_above: 50000
  # Detect circular dependencies
  detect_cycles: true
  # Detect duplicate skill names
  detect_duplicates: true
```

### Quality Levels

skill-lint uses progressive quality levels (0-3). Higher levels include all checks from lower levels.

- **Level 0** — Valid YAML frontmatter, required `name` field
- **Level 1** — Description field, model validation, structural checks
- **Level 2** — *(Planned)* Tool references, cross-file consistency
- **Level 3** — *(Planned)* Full documentation, test coverage metadata

Use the `levels` config key to set per-directory quality requirements, and the `--level` flag to set a minimum floor across all files.

### Repository Formats

skill-lint supports three repository layouts:

- **legacy-commands** — Flat `.claude/commands/` structure with markdown files
- **plugin** — Single plugin with `SKILL.md` at the root
- **multi-plugin** — Multiple plugins, each with their own `SKILL.md`

The format is auto-detected but can be overridden in config with the `format` key.

## CI Integration

### GitHub Actions

```yaml
name: Skill Lint
on: [pull_request]

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install -g skill-lint
      - run: skill-lint lint . --format github --changed-only --base origin/main
```

The `--format github` flag outputs annotations that appear inline on pull request diffs.

### Strict CI with Ratchet

```yaml
- run: skill-lint lint . --format github --strict --ratchet --changed-only
```

This ensures no file regresses below its current quality level and treats all warnings as errors.

## License

MIT
