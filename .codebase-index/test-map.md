Test map: tests → features

Overview
- Test files: ~25 under test/*.test.ts covering frontmatter validation, graph validation, extraction, CLI behaviors, and integration.

Mapping (selected)
- test/validate-frontmatter.test.ts → covers frontmatter schema validation and edge cases (maps to src/validate-frontmatter.ts)
- test/validate-frontmatter-modern-fields.test.ts → modern frontmatter fields
- test/validate-manifest.test.ts → manifest-level validation (src/validate-manifest.ts)
- test/validate-graph.test.ts, test/graph.test.ts, test/validate-graph-plugin.test.ts → graph integrity, cycles, references (src/graph.ts, src/validate-graph.ts)
- test/extract.test.ts, test/extract-plugin.test.ts → extraction utilities (src/extract.ts)
- test/lint.test.ts → high-level lint orchestration (src/lint.ts)
- test/integration.test.ts → combined integration scenarios (exercise multiple modules end-to-end)
- test/anthropic-regression.test.ts → regression test for an external regression case
- test/reporter.test.ts → output formatting and reporter outputs (src/reporter.ts)
- test/config.test.ts → config parsing and defaults (src/config.ts)

Fixtures
- test/fixtures/* — markdown examples used in many tests (valid/invalid cases). Good coverage of input shapes.

Gaps and recommendations
- CLI end-to-end: While bin/cli.js exists, there is limited explicit test coverage that exercises the published binary path end-to-end (spawn the bin as a child process). Consider adding a test that runs the actual CLI binary in a child process to validate shebang/path behaviors.
- Coverage metrics: No coverage numbers are provided. Add nyc/c8 to measure line/branch coverage and detect untested code paths.
- AC-to-test mapping: If you have specific acceptance criteria (story files under sprints/), point me to a story and I will map ACs to the tests and flag missing AC coverage.
