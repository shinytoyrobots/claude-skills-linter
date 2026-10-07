# Suite Mode

When `$ARGUMENTS` is `suite`:

1. Read `~/.claude/CLAUDE.md` and the project-level CLAUDE.md files
2. Inventory skills: Glob `~/.claude/skills/*/SKILL.md`, `.claude/skills/*/SKILL.md`,
   `~/.claude/commands/*.md`, and `.claude/commands/*.md`
3. Inventory shared context files (e.g., `~/.claude/commands/context/*.md`) and agent files
   (`~/.claude/agents/*.md`, `.claude/agents/*.md`)

Build a dependency map:
- For each skill, extract which context files and agent files it references
- Count how many skills reference each context file (high-fanout files are cache anchors —
  keep them stable and dense; see the Context Anchor Map)
- Measure file sizes as a rough signal, not a verdict — pair size with fanout and volatility

Run the four lint passes at the suite level, then produce the Strategic Assessment.

Use the Agent tool to launch parallel subagents (model: haiku) for structural analysis — one for skills inventory, one for context file analysis, one for CLAUDE.md analysis. Each subagent returns its top 10 findings only — not full analysis. Merge their findings.

## Context Anchor Map

Produce a table of high-fanout context files — the cache anchors:

| Context File | Size (lines) | Loaded By (# skills) | Volatility (recent edits) | Signal Density | Recommendation |
|-------------|-------------|---------------------|---------------------------|----------------|----------------|

These files cache once and are read cheaply by many skills, so the goal is **keep them
stable and dense**, not small. Flag two things: churn (frequent edits bust the shared
cache) and low signal density (noise multiplied across many consumers). A large, stable,
dense anchor is healthy — do not recommend cutting it for size alone.
