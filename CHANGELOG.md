# Changelog

All notable changes to this project will be documented in this file.

## [0.5.0] - 2026-04-12

Skill-root-relative reference resolution, CI documentation, and programmatic API.

### Added

- **Skill-root-relative resolution** — bare references like `shared/prompt-caching.md` from nested subdirectories now resolve relative to the nearest `SKILL.md` parent directory. Eliminates false-positive broken-reference errors in repos where files cross-reference siblings by skill-root-relative paths (the pattern used by Anthropic's official skills repo).
- **Programmatic API** — all core functions exported via package entry point (`import { runLint, validateFrontmatter } from 'claude-skill-lint'`)
- **CI workflow** — GitHub Actions with tests on Node 20/22 and automated npm publish on version tags
- **CHANGELOG** — version history for npm consumers

### Fixed

- SKILL.md files with YAML parse errors no longer prevent skill root discovery — they still mark the directory boundary for reference resolution
- README te-review install instruction now points to GitHub raw URL (not the npm package, which doesn't include it)

### Changed

- `dist/` no longer tracked in git — built in CI and at publish time
- README CI section now documents exit codes, `--strict` behavior, and when warnings fail the build

## [0.3.0] - 2026-04-12

First npm release. Full structural linting and graph validation for Claude Code skills.

### Added

- **Programmatic API** — all core functions exported from the package entry point for integration into custom tooling
- **Four repository formats** — auto-detection and validation for `legacy-commands`, `plugin`, `multi-plugin`, and `project-skills`
- **Graph validation** — broken references, orphaned files, name collisions, dependency cycles
- **Frontmatter validation** — JSON Schema-based structural checks at progressive quality levels (0-3)
- **Manifest validation** — `marketplace.json` and `plugin.json` structure and consistency checks for plugin formats
- **Progressive quality levels** — per-file `quality_level` frontmatter field with directory-level defaults
- **Anti-regression ratchet** — `--ratchet` flag prevents quality_level from decreasing vs a base branch
- **Three output formats** — `terminal` (human-readable), `json` (machine-parseable), `github` (PR annotations)
- **Git-aware filtering** — `--changed-only` to lint only files changed since a base ref
- **Modern frontmatter fields** — `context`, `agent`, `effort`, `hooks`, `compatibility`, `metadata`
- **`allowed-tools` pattern syntax** — glob patterns like `mcp__*` and `Bash(python*)` validated correctly
- **`init` subcommand** — auto-detect format and generate `.skill-lint.yaml` config
- **Monorepo support** — discovers nested `.claude/skills/` directories and hybrid layouts
- **Relative path resolution** — `../../context/foo.md`, `./reference/guide.md`, and bare `agents/scanner.md` references all resolve correctly
- **Suite-monorepo detection** — recognizes repos with skill suites nested under named directories
- **Security** — `execFileSync` instead of `execSync` to prevent shell injection in git operations

### Changed

- Package renamed from `skill-lint` to `claude-skill-lint` (old binary name still works with deprecation notice)
- `dist/` no longer tracked in git — built in CI and at publish time via `prepublishOnly`

## [0.2.1] - 2026-03-28

### Fixed

- Bare relative path references (`agents/scanner.md`) now resolve correctly in graph validation
- Sub-files in plugin skill directories are discovered during extraction
- Anthropic official skills repo regression tests added

## [0.2.0] - 2026-03-25

### Added

- Anti-regression ratchet for `quality_level`
- Progressive per-file quality level enforcement
- `init` subcommand for config generation
- Level 1 rules applied to skill file type
- `quality_level` field added to all schemas

### Fixed

- SKILL.md canonical names use parent directory name instead of "SKILL"

## [0.1.0] - 2026-03-18

### Added

- Initial release
- Level 0 frontmatter validation (valid YAML, required fields, non-empty body)
- Graph validation (broken references, orphaned files, dependency cycles)
- GitHub Actions output format
- `.skill-lint.yaml` configuration with ignore patterns
- CLI with `lint` and `graph` commands
