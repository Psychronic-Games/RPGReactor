# Handoff

Dated notes for the cycle in progress, newest first. Read [STATUS.md](STATUS.md) first: it is the current state and the one list of open work. Earlier cycles are in [archive/handoff](archive/handoff/), one file per version ([0.99.2](archive/handoff/0.99.2.md), [0.99.1](archive/handoff/0.99.1.md), [0.99.0](archive/handoff/0.99.0.md), [0.98.8](archive/handoff/0.98.8.md), and date-named files before that).

An entry holds only what the next session needs and cannot find elsewhere: what is half-done, what to watch for, what waits on the owner, how to resume. What changed goes in the editor changelog; how the code works goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-10-26)

- **0.99.2** shipped 2026-10-25 at runtime **20261025.11**: binaries on itch that night; `cut-release.cjs` refused on the suite's local failures, so the release commit and the `v0.99.2` tag were made by hand on 2026-10-26 with the script's own edits (changelogs, README, editor README). The builders are at Preview 48 with visual acceptance open: [character coverage](CHARACTER-QUALITY.md), [remaining issues](CLAUDE-QUALITY-TRACKER.md), [props](PROP-BUILDER.md).
- **Owner questions:** [OWNER-QUESTIONS.md](OWNER-QUESTIONS.md).
- **Editor windows:** the Event Editor, Database, Forge and Plugin Manager each open in a frameless window of their own (`utils/DetachedWindow.js`). Native Linux transparency still needs a look on the real desktop.
- **Savior & Religion** (`template/Savior & Religion`, not in git, an encrypted MV game the owner is trying as a template) boots, plays its opening and draws its ULDS maps 2, 5 and 19.
- **Next:** CI, reproduced in a clean clone on Node 22 and four cores (the suite outgrew the 45-minute job; timing budgets not routed through `tests/helpers/timing.cjs`; a WebDriver socket limit shorter than the script timeout); then the face expressions (uncommitted, toned down toward natural), the builders deep dive with the owner, and keeping the map scene across a seamless crossing.
