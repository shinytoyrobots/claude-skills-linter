# Sprint 1 Plan
**Goal**: Deliver a working `skill-lint lint` command that validates Level 0 frontmatter rules against skill files
**Duration**: 2026-03-21 — 2026-03-26 (5 days)
**Stories**: 8 (22 points)
**Critical path**: story-001 → story-002 → story-003 → story-005 → story-007 → story-008

## Story Sequence
| Order | Story | Agent | Points | Blocked By | Parallel? |
|-------|-------|-------|--------|------------|-----------|
| 1 | story-001: Project scaffold + shared types | backend-dev | 3 | — | No |
| 2 | story-002: File classifier | backend-dev | 2 | story-001 | Yes (with 004, 006) |
| 2 | story-004: JSON Schemas | backend-dev | 2 | story-001 | Yes (with 002, 006) |
| 2 | story-006: Config loader | backend-dev | 2 | story-001 | Yes (with 002, 004) |
| 3 | story-003: Frontmatter extractor | backend-dev | 3 | story-001, story-002 | No |
| 4 | story-005: Spectral validator (Task 0 spike first) | backend-dev | 5 | story-002, 003, 004 | No |
| 5 | story-007: Terminal reporter | backend-dev | 2 | story-005 | No |
| 6 | story-008: Wire lint command | backend-dev | 3 | story-002, 003, 005, 006, 007 | No |

## Risk Assessment
- **Spectral programmatic API** (Medium → mitigated): story-005 Task 0 is a mandatory 2-hour spike before any other task. If the API differs significantly, fallback is direct JSON Schema validation via ajv. HITL escalation if spike fails.
- **Longer critical path** (Low): QA review added story-002 as a dependency for story-003 and story-005 (needed for `___file_type` and schema routing). Critical path increased from 5 to 6 stories. Mitigated by story-002 being only 2 points.
- **ESM compatibility** (Low): All deps claim ESM support. story-001 validates the full build chain first.
- **Single agent** (Low): All stories assigned to backend-dev. Sequential execution, no parallelization risk.

## Agent Activation Timeline
- Day 1: **Spectral spike first** (story-005 Task 0, 2hr time-box), then backend-dev starts story-001 (scaffold + types incl. fixture spec), story-002 (classify), story-004 (schemas), story-006 (config)
- Day 2: backend-dev works story-003 (extract), then continues story-005 (Tasks 1-3)
- Day 3: backend-dev finishes story-005 (Spectral validator), starts story-007 (reporter)
- Day 4: backend-dev works story-008 (integration + smoke test)
- Day 5: QA tester runs full validation, smoke test against claude-skills, fixes

## QA Review Changes Applied
- story-001: added AC-6 (unknown subcommand), Task 5 (src/types.ts), strengthened AC-5 (npm link)
- story-002: added AC-6 (hasFrontmatter:true), AC-7 (rightmost segment), AC-8 (absolute paths)
- story-003: **added story-002 to depends-on**, added AC-6 (empty glob), AC-7 (unknown file type), clarified AC-4 (structured error return)
- story-004: added AC-6 (additionalProperties:true), AC-7 (meta-schema validation), AC-8 (context skip), clarified tools vs allowed-tools
- story-005: **added story-002 to depends-on**, added AC-6 (error passthrough), AC-7/8 (legacy-agent/context/unknown handling), reframed AC-6→DoD (no temp files), added mandatory Task 0 spike
- story-006: specified deep merge (AC-3), split AC-4 (config exposes, lint.ts enforces), clarified AC-5 (throws, not exits), added AC-6/7 (empty config, unknown keys)
- story-007: added AC-2 (warnings), AC-7 (singular/plural), added totalFiles param, established types.ts ownership
- story-008: revised AC-7 (concrete pass/fail), added AC-8/9 (stub flags), AC-10 (ignore patterns), AC-11 (empty directory), flagged AC-7 as local-only
