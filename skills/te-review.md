---
description: Review skills, prompts, or full suite for token efficiency — multi-pass audit with strategic optimization plan
argument-hint: "audit <skill-name> | suite | compare <before> <after>"
model: sonnet
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Agent
  - Write
---

# Token Efficiency Review

## Input

`$ARGUMENTS` = one of:
- `audit <skill-name>` — review a single skill file (e.g., `audit competitive-scan`)
- `suite` — review the full skill suite (CLAUDE.md + all skills + agents + context files)
- `compare <before> <after>` — compare token impact of a skill change (file paths)

If `$ARGUMENTS` is empty, default to `suite`.

## Mode: Single Skill Audit

When `$ARGUMENTS` starts with `audit`:

1. Read the target skill file from `~/.claude/commands/{skill-name}.md`
2. Read all context files the skill references (lines matching `~/.claude/commands/context/`)
3. Read any agent methodology files the skill references (lines matching `~/.claude/commands/agents/`)
4. Read `~/.claude/CLAUDE.md` (global instructions that load every session)
5. Run the four lint passes below against this skill and its loaded files
6. Produce the Strategic Assessment

## Mode: Suite Review

When `$ARGUMENTS` is `suite`:

1. Read `~/.claude/CLAUDE.md`
2. Read all project-level CLAUDE.md files (Glob for `**/CLAUDE.md` in common project directories)
3. Glob `~/.claude/commands/*.md` to inventory all skills
4. Glob `~/.claude/commands/context/*.md` to inventory all context files
5. Glob `~/.claude/commands/agents/*.md` to inventory all agent files

Build a dependency map:
- For each skill, extract which context files and agent files it references
- Count how many skills reference each context file (high-fanout files are highest ROI to optimize)
- Measure file sizes (line count as proxy for token cost)

Run the four lint passes at the suite level, then produce the Strategic Assessment.

Use the Agent tool to launch parallel subagents (model: haiku) for structural analysis — one for skills inventory, one for context file analysis, one for CLAUDE.md analysis. Merge their findings.

## Mode: Compare

When `$ARGUMENTS` starts with `compare`:

1. Read both files
2. Run lint passes on both
3. Report score delta and specific improvements/regressions
4. Estimate token savings from the changes

## Lint Passes

Run these four passes sequentially. Each pass produces findings categorized as Critical (must fix), Recommendation (should fix), or Observation (consider).

### Pass 1 — Structural Audit

Check for architectural token waste:

- **CLAUDE.md size**: Line count vs 500-line target. Flag if over 500.
- **CLAUDE.md @-imports**: Each @-import loads every message. Flag any that could move to skills.
- **Skill file size**: Flag skills over 500 lines.
- **Context file fan-out**: Context files loaded by 5+ skills — flag sections that may be irrelevant to some consumers.
- **Reference depth**: Flag any skill that references a file which itself references another file (nested references cause partial reads).
- **Subagent model declaration**: Flag subagents without explicit `model:` in frontmatter (defaults to most expensive).
- **MCP tool declarations**: Compare `allowed-tools` list against tools actually referenced in the skill body. Flag declared-but-unused tools.
- **Agent methodology file size**: Flag agent files over 200 lines.

### Pass 2 — Redundancy Detection

Check for duplicated content:

- **Skill-context overlap**: Instructions in the skill body that duplicate content in context files the skill loads. Grep for similar phrases (3+ word matches).
- **Cross-skill duplication**: Instructions repeated verbatim or near-verbatim across multiple skills that could be extracted to a shared context file or eliminated.
- **CLAUDE.md-skill overlap**: Instructions in CLAUDE.md that are also present in individual skills (double-loading on every invocation of that skill).
- **Context file internal redundancy**: The same concept explained multiple times within a single context file.

For suite mode, prioritize high-fanout context files — redundancy in a file loaded by 20 skills costs 20x more than redundancy in a file loaded by 1 skill.

### Pass 3 — Output Efficiency

Check for output token waste (output tokens cost 5x input):

- **Missing output format constraints**: Skills that don't specify a structured output format (JSON, YAML, markdown template, bullet points). Prose output is the most expensive format.
- **Missing conciseness directives**: Skills that generate long output without explicit length guidance (word limits, section limits, "be concise").
- **Subagent return verbosity**: Subagents that return full research rather than summaries to the main context.
- **Unbounded output sections**: Template sections without length guidance (e.g., "## Analysis" with no word limit).
- **Prose where structured would suffice**: Sections where the consumer is another skill or code, not a human — flag for structured format conversion.

### Pass 4 — Instruction Quality

Check for token-wasting instruction patterns:

- **Motivational fluff**: Phrases like "You are an expert," "You are a world-class," "Think carefully." Research shows these are often net-negative in complex system prompts.
- **Politeness tokens**: "please," "kindly," "I would appreciate" — zero behavioral impact, pure token waste.
- **Filler phrases**: "It's important to note that," "As we discussed," "In order to" — compress or remove.
- **Default-behavior instructions**: Instructions that tell Claude to do something it already does by default. Test: "Would removing this change Claude's behavior?" If not, it's waste.
- **Ambiguous instructions**: Directions interpretable in multiple ways that may cause Claude to hedge or over-explain.
- **Conflicting constraints**: Contradictory requirements within a skill (e.g., "be thorough" + "keep responses brief" without specifying which takes priority).
- **Emphasis overuse**: Excessive CAPS, bold, "IMPORTANT," "CRITICAL," "YOU MUST." When everything is emphasized, nothing is. Flag skills with more than 3 emphasis markers.

## Scoring

Score each domain 0-8:

### Architecture (Pass 1) — 0-8
| Score | Criteria |
|-------|----------|
| 0-2 | CLAUDE.md bloated, no model routing, unused MCP tools, deep references |
| 3-5 | Some issues — CLAUDE.md moderate, partial model routing, minor structural waste |
| 6-8 | Lean CLAUDE.md, proper model routing, minimal tool declarations, flat references |

### Efficiency (Passes 2-3) — 0-8
| Score | Criteria |
|-------|----------|
| 0-2 | Significant redundancy, no output format constraints, verbose subagent returns |
| 3-5 | Some redundancy, partial output constraints, moderate verbosity |
| 6-8 | Minimal redundancy, structured output everywhere, concise subagent contracts |

### Quality (Pass 4) — 0-8
| Score | Criteria |
|-------|----------|
| 0-2 | Frequent fluff, politeness tokens, ambiguity, conflicting constraints |
| 3-5 | Occasional quality issues, some default-behavior instructions |
| 6-8 | Clean, precise instructions; every line is load-bearing |

**Total: 0-24.** Interpretation:
- 0-8: Significant optimization opportunity
- 9-16: Moderate room for improvement
- 17-24: Well-optimized

## Strategic Assessment

After the lint passes, produce a strategic assessment that goes beyond listing findings:

### Prioritized Optimization Plan

Rank all findings by estimated token impact (savings per invocation x invocation frequency where known). Group into:

1. **Quick wins** (< 5 minutes each, immediate savings): Remove fluff, add conciseness directives, declare subagent models, disable unused MCP tools
2. **Medium effort** (15-30 minutes each, significant savings): Deduplicate skill-context overlap, add output format constraints, split high-fanout context files
3. **Architectural changes** (1+ hours, structural improvement): Restructure CLAUDE.md, redesign context file loading strategy, implement hooks for data preprocessing

### Token Budget Estimate

For each reviewed skill (or the suite aggregate):
- **Current estimated input tokens per invocation**: Sum of CLAUDE.md + skill body + loaded context files + agent methodology files + MCP tool definitions (estimate at ~400 tokens per declared tool)
- **Current estimated output token profile**: Qualitative assessment (constrained/moderate/unconstrained) based on output format instructions
- **Projected tokens after fixes**: Estimate after applying all recommendations
- **Projected savings**: Absolute and percentage

Use line count x 3.5 as a rough tokens-per-line estimate for markdown content.

### Context Loading Analysis (Suite Mode Only)

Produce a table showing:

| Context File | Size (lines) | Loaded By (# skills) | Effective Token Cost (size x frequency) | Recommendation |
|-------------|-------------|---------------------|----------------------------------------|----------------|

Sort by Effective Token Cost descending. The top entries are the highest-ROI optimization targets.

### Model Routing Assessment

Review current model declarations across skills and subagents:
- Skills using `model: opus` — are they all genuinely complex reasoning tasks?
- Subagents without model declarations — recommend `model: haiku` for research/extraction, `model: sonnet` for analysis
- Estimate cost reduction from optimal routing

## Output Format

```markdown
# Token Efficiency Review: {skill-name or "Full Suite"}
**Generated**: {YYYY-MM-DD HH:MM}
**Scope**: {single skill | suite (N skills, N context files, N agents) | comparison}
---

## Score: {N}/24
**Architecture**: {n}/8 | **Efficiency**: {n}/8 | **Quality**: {n}/8

## Critical Findings
{Findings that represent significant token waste — each with specific file:line reference and fix}

## Recommendations
{Should-fix findings with specific suggestions}

## Observations
{Lower-priority findings worth considering}

## Strategic Assessment

### Prioritized Optimization Plan
**Quick Wins**
- {finding → fix → estimated savings}

**Medium Effort**
- {finding → fix → estimated savings}

**Architectural Changes**
- {finding → fix → estimated savings}

### Token Budget
| Component | Current (est. tokens) | After Fixes (est.) | Savings |
|-----------|----------------------|--------------------| --------|
| CLAUDE.md | {n} | {n} | {n} ({x}%) |
| Skill body | {n} | {n} | {n} ({x}%) |
| Context files | {n} | {n} | {n} ({x}%) |
| Tool definitions | {n} | {n} | {n} ({x}%) |
| **Total input** | **{n}** | **{n}** | **{n} ({x}%)** |

### Context File Heat Map (suite mode)
{Table sorted by effective token cost}

### Model Routing Assessment
{Current vs recommended model assignments}

## Methodology
Lint passes: Structural Audit, Redundancy Detection, Output Efficiency, Instruction Quality.
Scoring: 0-24 across Architecture, Efficiency, Quality domains.
Token estimates use line_count x 3.5 heuristic (markdown). Actual counts require Anthropic count_tokens() API.
```
