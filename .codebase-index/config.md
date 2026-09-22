Configuration and runtime flags

package.json scripts
- build: tsc
- test: tsx --test test/*.test.ts
- prepublishOnly: npm run build && npm test

Node engine
- Node >= 20.0.0 (engines.node in package.json)

Environment variables
- No mandatory runtime environment variables detected in source. The CLI relies on filesystem inputs and flags rather than env configuration.

Config files
- tsconfig.json — TypeScript compiler options
- schemas/*.json — validation schemas used at runtime by validators

Runtime flags
- CLI flags are defined in src/cli.ts (use `node bin/cli.js --help` to enumerate full options).

Recommendations
- If you need runtime feature toggles, consider environment-driven flags, but keep them minimal for a CLI tool.
