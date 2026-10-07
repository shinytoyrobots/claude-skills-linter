---
name: sk-review
description: Use when the user wants to audit a Claude Code skill, slash command, agent, prompt, or whole skill suite for context efficiency — signal density, cache-stability, progressive disclosure, output cost, instruction quality, and model/effort routing — or wants to compare the context impact of a skill change. Not for structural or frontmatter validation (that is claude-skill-lint) and not for writing a new skill.
argument-hint: audit <skill-name> | suite | compare <before> <after>
model: sonnet
allowed-tools:
  - Read
  - Glob
  - Grep
  - Bash
  - Agent
  - Write
---

# Context Efficiency Review

## What "efficient" means here

The goal is **signal density under caching**, not fewer tokens. Anthropic's current
guidance (context engineering; prompt caching; Agent Skills) reframes the target:

- **Cached reads are cheap.** A stable prefix (CLAUDE.md, high-fanout context files)
  reads at roughly a tenth of base input price after the first request. So a large
  *stable* file is not the cost sink it once was — churn is. Editing a cached prefix
  forces a re-write at above-base price and pays that cost again on the next miss.
- **Signal density beats brevity.** The win is "the smallest set of high-signal tokens,"
  not the smallest set of tokens. Dropping load-bearing context to hit a line count is a
  regression, not a saving. Context rot (accuracy decay as volume grows) is the real
  ceiling — so cut *noise*, and keep dense, retrieve the rest just in time.
- **Progressive disclosure is the primary lever.** A short entry file (skill body ≤ 500
  lines) that references reference/agent files loaded on demand costs less than one flat
  file, because the referenced files load only when relevant. Reward this structure;
  don't just count lines.

So this review flags: churn in cached prefixes, low-signal content, missing progressive
disclosure, unbounded output, and instruction patterns that misfire on current models —
not raw size. Where a file is large *and stable and dense*, that is a pass, not a finding.

## Input

`$ARGUMENTS` = one of:
- `audit <skill-name>` — review a single skill (e.g., `audit competitive-scan`)
- `suite` — review the full skill suite (CLAUDE.md + all skills + agents + context files)
- `compare <before> <after>` — compare the context impact of a skill change (file paths)

If `$ARGUMENTS` is empty, default to `suite`.

### Where skills live

Look in each of these, in order, and use the first match:

| Layout | Path |
|--------|------|
| Project skill | `.claude/skills/{name}/SKILL.md` |
| User skill | `~/.claude/skills/{name}/SKILL.md` |
| Legacy command | `.claude/commands/{name}.md`, then `~/.claude/commands/{name}.md` |
| Plugin skill | `skills/{name}/SKILL.md` under a directory with `.claude-plugin/` |

A skill's *referenced files* are the supporting files in its own directory and any context
or agent files its body points to by path (e.g., `~/.claude/commands/context/*.md`,
`~/.claude/agents/*.md`).

## Mode: Single Skill Audit

When `$ARGUMENTS` starts with `audit`:

1. Locate and read the target skill (see the table above)
2. Read every file the skill references — supporting files, context files, agent files
3. Read `~/.claude/CLAUDE.md` and the project `CLAUDE.md`, if present (they load every session)
4. Run the four lint passes below against this skill and its loaded files
5. Produce the Strategic Assessment

## Mode: Suite Review

When `$ARGUMENTS` is `suite`, follow `references/suite-mode.md` for inventory, the dependency
map, and the Context Anchor Map, then run the four lint passes at the suite level.

## Mode: Compare

When `$ARGUMENTS` starts with `compare`:

1. Read both files
2. Run lint passes on both
3. Report score delta and specific improvements/regressions
4. Assess the change against cache-stability: does it churn a cached prefix, and does it
   raise or lower signal density? A change that adds dense, stable context can be a net win
   even if it adds tokens.

## Lint Passes

Run these four passes sequentially. Each pass produces findings categorized as Critical (must fix), Recommendation (should fix), or Observation (consider). Limit to top 5 findings per category per pass. Each finding: 1-2 sentences + file:line reference.

### Pass 1 — Architecture & Progressive Disclosure

Check the loading structure, not raw size:

- **Progressive disclosure**: Does the skill keep a lean entry body and push detail into
  referenced files that load on demand? Reward this. Flag skills that inline reference
  material that a large fraction of invocations won't need — it should move to a referenced
  file. This is the highest-leverage structural lever.
- **Skill body size**: Flag skill bodies over 500 lines — but as a prompt to *split into
  reference files*, not to delete content.
- **Reference depth**: Flag any skill that references a file which itself references another
  file. Anthropic warns nested references cause partial reads; keep references one level deep.
- **Cache-stability of prefixes**: Flag frequently-edited content in the cached prefix
  (CLAUDE.md, high-fanout context files). Volatility, not size, busts the cache. Stable +
  dense large files are a pass.
- **CLAUDE.md as error-prevention**: Flag drift toward documentation. CLAUDE.md should
  prevent mistakes, not explain the codebase. Content that is reference, not guardrail,
  belongs in a skill or context file that loads on demand.
- **CLAUDE.md @-imports**: Each @-import loads every message. Flag any that could move to a
  skill loaded on demand.
- **Subagent model declaration**: Flag subagents without explicit `model:` in frontmatter
  (defaults to an expensive tier). Match the tier to the task, and consider an `effort:`
  field alongside it (see Model & Effort Routing).
- **Tool declarations**: Compare `allowed-tools` against tools actually referenced in the
  body. Flag declared-but-unused tools — each carries a definition cost.

### Pass 2 — Signal Density & Redundancy

Cut noise, not substance. Flag content that repeats or carries little signal:

- **Skill-context overlap**: Instructions in the skill body that duplicate content in
  context files the skill loads. Grep for similar phrases (3+ word matches).
- **Cross-skill duplication**: Instructions repeated near-verbatim across skills that could
  be extracted to a shared context file (which then caches once) or eliminated.
- **CLAUDE.md-skill overlap**: Instructions in CLAUDE.md also present in individual skills
  (double-loaded on every invocation of that skill).
- **Context file internal redundancy**: The same concept explained multiple times within one
  file.
- **Low-signal padding**: Restatement, throat-clearing, and background that doesn't change
  behavior. This is the cut target — not dense context that happens to be long.

For suite mode, note that a high-fanout context file caches once and is read cheaply by
many skills. So the priority for these files is *signal density and stability*, not size
reduction — a dense, stable, widely-shared file is working as intended.

### Pass 3 — Output Efficiency

Output tokens are not cached and cost several times input — the biggest lever a skill's
*wording* controls. Check for:

- **Missing output format constraints**: Skills that don't specify a structured output
  format (JSON, YAML, markdown template, bullets). Unbounded prose is the most expensive.
- **Missing conciseness directives**: Long output without explicit length guidance (word
  limits, section limits).
- **Subagent return verbosity**: Subagents that return full research rather than summaries
  to the main context.
- **Unbounded output sections**: Template sections without length guidance.
- **Prose where structured would suffice**: Sections whose consumer is another skill or
  code, not a human — convert to a structured format.

### Pass 4 — Instruction Quality

Flag instruction patterns that waste tokens or misfire on current models:

- **Empty fluff vs. purposeful framing**: Flag content-free filler ("It's important to
  note that," "As we discussed"). Do **not** flag role-setting or constraint rationale —
  Anthropic still endorses giving Claude a role and explaining *why* a constraint exists;
  both improve targeting. The test is whether the phrase carries signal, not whether it
  reads as motivational.
- **Aggressive emphasis backfires**: Current models are highly responsive to the system
  prompt and can *over-trigger* on forceful language. Anthropic's guidance is to dial it
  back: prefer "Use this tool when…" over "CRITICAL: You MUST use this tool when…". Flag
  ALL-CAPS, "IMPORTANT/CRITICAL/YOU MUST" pileups; recommend normal phrasing.
- **Politeness tokens**: "please," "kindly" — no behavioral impact, remove.
- **Default-behavior instructions**: Instructions telling Claude to do what it already does
  by default. Test: "Would removing this change behavior?" If not, cut.
- **Ambiguous instructions**: Directions interpretable multiple ways that cause hedging or
  over-explanation. This includes vague negatives — "avoid a generic look," "don't be
  formulaic" — which swap one default for another. Recommend naming the specific patterns
  to avoid instead.
- **Conflicting constraints**: Contradictory requirements without a stated priority (e.g.,
  "be thorough" + "keep it brief").

If the target runs on Opus 5.5 (declared, or inherited because no `model:` is set), also
apply the checks in `references/opus-5-5-checks.md`.

## Scoring

Score each domain 0-8:

| Domain | 0-2 | 3-5 | 6-8 |
|--------|-----|-----|-----|
| **Architecture** (Pass 1) | Flat files, no progressive disclosure, volatile/bloated cached prefixes, nested refs, no model routing, unused tools | Partial disclosure, some routing, minor churn | Lean entry + on-demand refs, stable dense prefixes, flat refs, proper routing, minimal declarations |
| **Efficiency** (Passes 2-3) | High redundancy, low signal density, unbounded prose output | Some redundancy, partial output constraints | Minimal redundancy, high signal density, structured/bounded output |
| **Quality** (Pass 4) | Aggressive emphasis, empty filler, ambiguity, conflicts | Occasional quality issues | Clean, precise, appropriately calibrated emphasis; every line load-bearing |

**Total: 0-24.** Interpretation:
- 0-8: Significant optimization opportunity
- 9-16: Moderate room for improvement
- 17-24: Well-optimized

## Strategic Assessment

After the lint passes, produce a strategic assessment that goes beyond listing findings:

### Prioritized Optimization Plan

Rank findings by leverage — impact per edit, weighted toward changes that raise signal
density, improve cache-stability, or reduce *output* tokens (output isn't cached). Group into:

1. **Quick wins** (< 5 minutes each): Remove filler and politeness, dial back aggressive
   emphasis, remove think-carefully and reasoning-in-output lines, add conciseness
   directives, declare subagent models, drop unused tools.
2. **Medium effort** (15-30 minutes each): Deduplicate skill-context overlap, add output
   format constraints, move rarely-needed inline detail into on-demand reference files.
3. **Architectural changes** (1+ hours): Introduce progressive disclosure where a skill is a
   flat monolith, restructure CLAUDE.md toward error-prevention, stabilize churny cached
   prefixes, consolidate cross-skill duplication into a shared cached context file.

### Cost Model

The costs that actually move under caching:

- **Uncached input** — content outside the stable prefix, or a prefix just churned. Priced
  at base; a cache write on churn is *above* base.
- **Output** — never cached, several times input price. The highest-value target a skill's
  wording controls.
- **Cached reads** — stable prefix after first request, ~a tenth of base. Near-free; don't
  optimize these by cutting substance.

For each reviewed skill (or the suite aggregate), give a qualitative profile:
- **Cached prefix**: stable & dense / churny / bloated-with-noise
- **Per-invocation uncached input**: low / moderate / high
- **Output profile**: constrained / moderate / unconstrained
- **Projected effect of fixes**: where the leverage is, and roughly how much

Rough sizing only: markdown runs ~4 characters per token, but the tokenizer changed on
recent models (materially more tokens for the same text than older models produced) — treat
any line- or character-based estimate as approximate and re-verify budgets that were set on
an older model. Output budgets shift too: Opus 5.5 tends to finish the same task in fewer
tokens than Opus 5. The only accurate count is the `count_tokens` endpoint; note it estimates
*without* caching logic, so it reports raw input, not what you'll be billed after cache reads.

### Model & Effort Routing Assessment

Review model declarations across skills and subagents against the current lineup (verify
exact IDs and pricing against the live models/pricing docs before hardcoding numbers):

- Skills on the top reasoning tier (Opus-class) — are they genuinely complex reasoning?
- Subagents without a declared model — recommend the smallest tier that fits: a fast/cheap
  tier (Haiku-class) for research and extraction, a mid tier (Sonnet-class) for analysis,
  the top tier only for hard reasoning or long-horizon agentic work.
- Effort is a second routing lever, and on Opus 5.5 the main control over how much it
  thinks. Opus 5.5 at `medium` matches or beats Opus 5 at `high`, and `low` comes close on
  coding work — so Opus at low/medium effort can be the right call where dropping a tier
  would lose quality. Weigh both levers, not tier alone. Skills and subagents set this with
  an `effort:` frontmatter field (`low` | `medium` | `high` | `xhigh` | `max`), which
  overrides the session level only while that file is active. Reserve `xhigh`/`max` for
  work with a measured quality gain.
- Flag prose that tries to control depth ("be thorough," "go deep," "don't overthink")
  where an effort setting would do it. Lowering effort cuts thinking more reliably than
  prompt instructions do.
- Flag any skill that changes effort between requests in a flow — a top-level effort change
  invalidates the prompt cache.
- Estimate the effect of right-sizing routing.

## Output Format

Use the report template in `references/report-template.md`. Return the report in the
response; write it to a file only when the user asks, at the path they give.

## Reference files

| Read | When |
|------|------|
| `references/suite-mode.md` | `$ARGUMENTS` is `suite` |
| `references/opus-5-5-checks.md` | The target skill or agent runs on Opus 5.5 |
| `references/report-template.md` | Writing the final report (every run) |
