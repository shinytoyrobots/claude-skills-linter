# Opus 5.5 Checks (Pass 4 addendum)

The checks below describe Opus 5.5 behavior. Apply them only to skills and agents that run
on Opus 5.5 — declared, or inherited from the session because no `model:` is set. Skip them
for Sonnet- and Haiku-routed files.

- **Thinking instructions**: Flag lines telling Claude to "think carefully" or "think step by
  step" before answering. Thinking is always on and effort is the control; removing such
  lines makes replies start sooner with no clear quality loss. Flag harder any instruction
  to write out reasoning in the response — it costs output tokens, and it can be declined
  under the `reasoning_extraction` refusal category.
- **Unattended early stops**: For skills that run without a human answering (execution
  engines, long research loops, scheduled or looped runs), Opus 5.5 may end a turn with a
  progress summary that an unattended run treats as done. Flag skills missing any of: a
  stated completion condition, a checklist file the run updates as parts finish, the
  specific early stops to avoid (a summary that announces the next step instead of taking
  it, an offer to continue, a list of non-blocking decisions), and the stops that *are*
  wanted (nothing can move without the user; a risky or irreversible action needs
  confirmation). Don't flag human-in-the-loop skills — there, checking in is correct.
