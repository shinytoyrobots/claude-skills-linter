Codebase index for claude-skill-lint

commit: 5a5ed1f76dee794993b41cecaf8ba346a6e6e02e
indexed_at: 2026-04-24T18:43:00Z

Summary
- Source files analyzed: ~75 (TypeScript/JS under src/ and dist/)
- Test files discovered: 25 (test/*.test.ts and fixtures)
- Architecture style: Small CLI library (TypeScript ESM), single-repo monolith with a clear src/ → dist/ build and test harness
- Key modules: cli, lint, validate-frontmatter, validate-graph, extract, reporter, config, graph, profiles
- Test coverage: Good unit and integration test presence (25 tests). Integration test exists (test/integration.test.ts); overall coverage not measured here.

Notes and assumptions
- No browser UI components found; this is a CLI library.
- Schemas are present under schemas/*.json and serve as the primary data model for skill validation.
- The indexer did not compute numeric coverage percentages; running the test suite with coverage tooling is recommended for precise metrics.

Files generated:
- architecture.md, api-surface.md, data-model.md, components.md, dependencies.md, test-map.md, config.md, .last-indexed

Next steps
- Run `npm test` and optionally run a coverage tool (nyc/istanbul) to compute line/branch coverage.
- If you want a more granular test-to-AC mapping, point me at a specific story/ready-for-review file and I'll map ACs to tests.
