API surface (public functions / CLI entrypoints)

Overall: Primary public surface is the CLI binaries (bin/cli.js) and programmatic exports in src/index.ts → dist/index.js.

Key entrypoints
- bin/cli.js
  - Path: bin/cli.js (calls into dist/ or src compiled code)
  - Role: CLI executable (`claude-skill-lint`, `skill-lint`) used in terminal.

- src/index.ts / dist/index.js
  - Exports: functions used by consumers of the library. Inspect dist/index.d.ts for exact exported types.
  - Notable exported modules (based on source files):
    - lint (core orchestration)
    - validateFrontmatter / validateManifest
    - detectFormat
    - init (project init helpers)
    - config utilities

- src/cli.ts
  - CLI command definitions and yargs wiring. Commands and flags are defined here (see file for exact names and options).

Files for reference
- src/cli.ts: CLI wiring
- src/index.ts: library exports
- bin/cli.js: published CLI wrapper
- dist/*: built JS artifacts and d.ts files for consumers

Remarks
- No HTTP endpoints or server APIs found — this is a local CLI library.
- For precise function signatures consult dist/*.d.ts (types are published in package).