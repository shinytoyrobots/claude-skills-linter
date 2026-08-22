# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.0] - 2026-08-22

Skills architecture currency update — re-anchors the linter to the 2026 Agent Skills spec. Verified against three real repos (anthropics/skills, a 958-file legacy suite, a multi-plugin production repo, ~1,150 skill files total) with zero new false-positive errors.

### Added

- **Progressive-disclosure reference tracking** — `graph` now resolves references to bundled resources from `SKILL.md` bodies: markdown links (`[text](path)`), bare relative paths, non-`.md` files (`scripts/*.sh`, `references/*.txt`, assets), `${CLAUDE_SKILL_DIR}` / `${CLAUDE_PROJECT_DIR}` variables, and script paths inside `allowed-tools: Bash(...)` grants. Fenced code blocks are stripped first; runtime-output files and glob patterns are not existence-checked (false-positive guards).
- **`--portable` mode** — flags Claude-Code-only frontmatter fields that are not portable to the Agent Skills spec (claude.ai upload / Skills API), which accepts only `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`.
- **`name-dir-mismatch`** warning — when a skill's frontmatter `name` differs from its directory, naming which identifier governs invocation in the detected format (surfaces on both `lint` and `graph`).
- **`description-budget`** warning — when `description` + `when_to_use` exceeds the 1536-character listing budget.
- **Single-plugin format detection** — a repo with `.claude-plugin/plugin.json` and a root-level `SKILL.md` (or `skills/`) is detected as a plugin even without `marketplace.json`, and the root `SKILL.md` is discovered and validated.
- **`claude-plugin-contents`** error — a `.claude-plugin/` directory must contain only `plugin.json` and/or `marketplace.json`; a stray file or subdirectory (skills/, commands/) there silently breaks plugin loading.
- Schema: recognizes current frontmatter fields `when_to_use`, `arguments`, `disallowed-tools`, `background`, `paths`, `shell`, `license`, `model`.

### Fixed

- **False positives on valid 2026 skills** (the priority): `effort: xhigh` now accepted; `model: inherit` and full model IDs (`claude-*`, `us.anthropic.*`) accepted; refreshed the built-in tool registry (dropped retired `TaskCreate`/`TaskGet`/`TaskList`/`TaskUpdate`, added `SendMessage`, `Monitor`, `SlashCommand`, `ScheduleWakeup`, and others).
- Boolean frontmatter fields (`disable-model-invocation`, `user-invocable`, `background`) accept the extended forms `yes`/`no`/`on`/`off`/`1`/`0` (v2.1.218+).
- `allowed-tools` string parsing no longer splits inside a `Bash(...)` pattern that contains spaces (e.g. `Bash(git status:*)`).
- File discovery is now sorted, making `duplicate-content`, `name-collision`, and `reference-cycle` reporting deterministic.

### Removed

- The spurious `invocable` frontmatter field (not part of the spec; `user-invocable` and `disable-model-invocation` are the real fields).

## [0.5.1] - 2026-04-12

### Changed

- CI now auto-creates GitHub Releases with changelog notes after npm publish
- Added Releases link to README for npm page visitors

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
