Dependencies

Package.json runtime dependencies
- @stoplight/spectral-core ^1.21.0 — likely used for schema/rule validation or linting helpers
- @stoplight/spectral-functions ^1.10.1 — supplemental functions for Spectral rules
- chalk ^5.6.2 — terminal color formatting for CLI output
- glob ^13.0.6 — file matching for scanning repository files
- gray-matter ^4.0.3 — parse frontmatter from Markdown files
- minimatch ^10.2.4 — glob pattern matching utility
- yaml ^2.8.3 — YAML parsing
- yargs ^17.7.0 — CLI argument parsing

DevDependencies
- @types/node, @types/yargs — type declarations
- ajv ^8.18.0 — JSON schema validation runtime (used in tests or validation)
- tsx ^4.21.0 — test runner and dev convenience for TypeScript
- typescript ^5.0.0 — compile-time type checking

Notes
- No heavy runtime dependencies; appropriate for a CLI tool.
- Consider adding an explicit test coverage tool (nyc / c8) if you want line/branch coverage reports.
