# Sprint 3 Handoff — skill-lint

## Current State (after Sprint 2 + fixes)

**Working features:**
- `skill-lint lint [paths...]` — Level 0+1 frontmatter validation
- `skill-lint graph [paths...]` — broken refs, orphans, duplicates, cycles (canonical name resolution)
- `--changed-only --base origin/main` — git diff-based file filtering
- `--format github` — GitHub Actions PR annotations
- `--format terminal` — colorized terminal output
- `--strict` — treat warnings as errors
- `.skill-lint.yaml` config with deep-merge defaults
- Pre-commit hook + CI workflow in claude-skills repo

**Test suite:** 163 tests, 0 failures

**Live results against claude-skills (168 files):**
- Lint: 0 issues
- Graph: 2 errors (1 broken ref, 1 cycle) + 5 warnings (4 orphans, 1 duplicate)

## Sprint 3 Scope — Plugin Format + Profiles

### Priority 1: Plugin format support

The Anthropic plugin ecosystem uses a different format than Robin's legacy commands structure. The linter should support both.

**Three formats to support:**

| Format | Detection Signal | Skill File | References |
|--------|-----------------|------------|------------|
| Legacy commands | No `.claude-plugin/`, has `commands/`/`agents/`/`context/` dirs | Frontmatter `.md` | Installed paths: `~/.claude/commands/...` |
| Simple plugin (Anthropic) | `.claude-plugin/marketplace.json`, `skills/` with `SKILL.md` | `SKILL.md` with YAML frontmatter | Minimal cross-refs |
| Multi-plugin (Knapsack) | `.claude-plugin/marketplace.json`, `plugins/` with `plugin.json` | `SKILL.md` with YAML frontmatter | Relative paths: `../../context/foo.md` |

**Research sources:**
- Anthropic official: https://github.com/anthropics/skills
- Notion partner: https://github.com/makenotion/claude-code-notion-plugin
- Knapsack production: `~/Development/work/ai-plugins/`
- Knapsack schema reference: `~/Development/work/ai-plugins/docs/skill-format-reference.md`

**Stories needed:**
1. **Auto-detect repo format** — check for `.claude-plugin/`, `skills/`, `plugins/`, `commands/` to determine format
2. **SKILL.md extraction** — extend `extract.ts` to handle `SKILL.md` format (different frontmatter fields: `name`, `description`, `invocable`, `argument-hint`, `user-invocable`, `disable-model-invocation`)
3. **SKILL.md schema** — new `schemas/skill.schema.json` for the plugin skill format
4. **Plugin manifest validation** — validate `plugin.json` and `marketplace.json` structure, verify all declared plugins/skills exist on disk
5. **Relative path reference resolution** — for Knapsack format, resolve `../../context/foo.md` style references in graph validator
6. **Config: format field** — add `format: auto | legacy-commands | plugin | multi-plugin` to `.skill-lint.yaml`

### Priority 2: Progressive profiles (PLAN.md Phase 3)

1. **`src/profiles.ts`** — `quality_level` enforcement + ratchet comparison
2. **Level 2-3 Spectral rules** — no fluff phrases, emphasis limit, output format constraints
3. **`--ratchet` flag** — fail if `quality_level` decreased vs base branch
4. **`promote` subcommand** — find/apply quality level promotions with `--dry-run` and `--apply`

### Priority 3: Output + Polish

1. **`--format json`** — structured JSON output for programmatic consumption
2. **`init` subcommand** — generate `.skill-lint.yaml` with interactive prompts
3. **README.md** — usage docs for open-source readiness

### Priority 4: Publish (PLAN.md Phase 4)

1. npm publish
2. Update claude-skills to use npm version instead of `github:` dep
3. `npx skill-lint init` onboarding flow

## Known Issues

- `dist/` is tracked in git (needed for `github:` dependency installs) — will be unnecessary after npm publish
- Graph cycle between `dt-pipeline-stages.md` ↔ `dt-hitl-protocol.md` is a real issue in claude-skills to fix
- 4 orphaned context files in claude-skills may be intentional (shared copies superseded by suite-specific aliases)
- `CLAUDE.md` references `commands/skill.md` which doesn't exist

## Architecture Notes

- **Canonical name resolution**: Graph validator uses `{type}/{basename}` as the file identity, matching how Claude Code flattens files on install. This works across all repo structures.
- **Name collision detection**: Files with the same canonical name are flagged — they'd overwrite each other on install.
- **Spectral programmatic API**: Rules are built as JS objects, not from YAML files. Config values (models, tools, limits) are passed into the rule builder.
- **extractAll accepts ignore patterns**: Passed through to glob to prevent `node_modules/` traversal.
