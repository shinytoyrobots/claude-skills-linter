# Report Template

Fill every section; omit "Context Anchor Map" outside suite mode.

```markdown
# Context Efficiency Review: {skill-name or "Full Suite"}
**Generated**: {YYYY-MM-DD HH:MM}
**Skill**: /sk-review
**Scope**: {single skill | suite (N skills, N context files, N agents) | comparison}
---

## Score: {N}/24
**Architecture**: {n}/8 | **Efficiency**: {n}/8 | **Quality**: {n}/8

## Critical Findings
{Findings representing real waste or misfiring instructions — each with file:line + fix}

## Recommendations
{Should-fix findings with specific suggestions}

## Observations
{Lower-priority findings worth considering}

## Strategic Assessment

### Prioritized Optimization Plan
**Quick Wins**
- {finding → fix → leverage}

**Medium Effort**
- {finding → fix → leverage}

**Architectural Changes**
- {finding → fix → leverage}

### Cost Model
| Component | Profile | Leverage of fixes |
|-----------|---------|-------------------|
| Cached prefix (CLAUDE.md + context) | {stable&dense / churny / noisy} | {…} |
| Per-invocation uncached input | {low / moderate / high} | {…} |
| Output | {constrained / moderate / unconstrained} | {…} |

### Context Anchor Map (suite mode)
{Table of high-fanout files by fanout, with volatility + signal density}

### Model & Effort Routing Assessment
{Current vs recommended model and effort assignments}

## Methodology
Lint passes: Architecture & Progressive Disclosure, Signal Density & Redundancy, Output
Efficiency, Instruction Quality. Scoring: 0-24 across Architecture, Efficiency, Quality.
Grounded in Anthropic's current guidance (context engineering, prompt caching, Agent Skills,
Prompting Claude Opus 5.5).
Size estimates are approximate (~4 chars/token, tokenizer varies by model); accurate counts
require the count_tokens endpoint, which does not model caching.
```
