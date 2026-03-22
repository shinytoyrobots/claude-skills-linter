# Dependency Map — Sprint 1

## Story Dependency Graph

```
story-001 (scaffold + types)
├── story-002 (classify)     ──┐
├── story-004 (schemas)      ──┤
├── story-006 (config)       ──┤
│                               │
│   story-001 + story-002 ──── story-003 (extract — needs classify for ___file_type)
│                               │
│   story-002 + story-003      │
│   + story-004 ───────────── story-005 (spectral + validate)
│                               │
│   story-005 ──────────────── story-007 (reporter)
│                               │
│   story-002 + story-003      │
│   + story-005 + story-006    │
│   + story-007 ───────────── story-008 (wire lint)
```

## Critical Path

```
story-001 → story-002 → story-003 → story-005 → story-007 → story-008
                         story-004 ↗
```

**Critical path length**: 6 stories (story-001 → 002 → 003 → 005 → 007 → 008)

Note: Critical path is longer than before because story-003 now depends on story-002.

## Parallelization Opportunities

| Phase | Stories | Can Run In Parallel |
|-------|---------|---------------------|
| 1 | story-001 | No — bootstrap + types, everything depends on it |
| 2 | story-002, story-004, story-006 | Yes — all depend only on story-001 |
| 3 | story-003 | No — needs story-001 + story-002 |
| 4 | story-005 | No — needs story-002 + story-003 + story-004 |
| 5 | story-007 | No — needs story-005 |
| 6 | story-008 | No — integration, needs all prior stories |

## Execution Order (Optimal)

1. **story-001** (scaffold + types) — unlocks everything
2. **story-002** (classify) + **story-004** (schemas) + **story-006** (config) — all parallel
3. **story-003** (extract) — blocked by story-002
4. **story-005** (spectral validate) — blocked by story-002, story-003, story-004. **Start with Task 0 spike.**
5. **story-007** (reporter) — blocked by story-005
6. **story-008** (wire lint) — blocked by all others

## Key Changes from QA Review

- story-003 now depends on story-002 (classify.ts needed for `___file_type` injection)
- story-005 now depends on story-002 (file type needed for schema routing)
- story-001 now produces `src/types.ts` (shared types for all stories)
- Critical path increased from 5 to 6 stories due to story-003 → story-002 dependency
