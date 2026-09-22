Architecture overview

Repository: claude-skill-lint (TypeScript, ESM)

High-level style
- Single-package CLI library implemented in TypeScript.
- Source code under src/; compiled output under dist/ (published files listed in package.json `files`).
- Tests live under test/ and use tsx test runner.

Module boundaries and responsibilities
- src/cli.ts: CLI entrypoint and argument parsing (yargs). Responsible for wiring commands to library functions.
- src/index.ts: Public exports and library entrypoints consumed by `bin/cli.js` and programmatic users.
- src/lint.ts: Core linting orchestration and rule application.
- src/validate-frontmatter.ts: Validation logic for skill frontmatter fields and schema checks.
- src/validate-graph.ts / src/graph.ts: Graph-related validation (references, cycles, connectivity).
- src/extract.ts: Extraction and analysis helpers used by various validators.
- src/reporter.ts: Output formatting and reporter utilities used by the CLI and tests.
- src/config.ts: Configuration parsing and defaults.
- src/classify.ts, src/profiles.ts: Higher-level classification utilities (skill-level heuristics, profiles).

Data flow
- CLI parses arguments → loads configuration and target files → invokes lint/validate modules → collects results → reporter formats and exits.

Important concerns location
- Persistence: Not applicable (CLI only; no DB).
- Auth: Not applicable.
- Config: src/config.ts and package.json scripts; runtime flags via CLI arguments.
- Schemas: schemas/*.json define expected skill frontmatter and command schemas.

Build and release
- TypeScript build: tsc (script: npm run build)
- Tests run via tsx (script: npm test)
- Dist artifacts are committed to dist/ and included in published package files.

Observations
- Dist/ is present in the repo; source-of-truth is src/ but dist/ is committed — this is intentional for CLI distribution but increases repo size.
- No runtime secrets or external services detected in source.
