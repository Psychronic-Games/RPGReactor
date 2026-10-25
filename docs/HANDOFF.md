# Handoff

Dated notes for the cycle in progress, newest first. Read [STATUS.md](STATUS.md) first: it is the current state and the one list of open work. Earlier cycles are in [archive/handoff](archive/handoff/), one file per version ([0.99.1](archive/handoff/0.99.1.md), [0.99.0](archive/handoff/0.99.0.md), [0.98.8](archive/handoff/0.98.8.md), and date-named files before that).

An entry holds only what the next session needs and cannot find elsewhere: what is half-done, what to watch for, what waits on the owner, how to resume. What changed goes in the editor changelog; how the code works goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-10-23)

- **0.99.1** shipped 2026-10-24 (UTC) with release pictures; **0.99.2** is open at runtime **20261023.2**, synced to all 19 projects. The builders are at Preview 47 with visual acceptance open: [character coverage](CHARACTER-QUALITY.md), [remaining issues](CLAUDE-QUALITY-TRACKER.md), [props](PROP-BUILDER.md).
- **Owner questions:** [OWNER-QUESTIONS.md](OWNER-QUESTIONS.md); the web trim waits for the weekend release.
- **Editor windows:** the Event Editor, Database, Forge and Plugin Manager each open in a frameless window of their own (`utils/DetachedWindow.js`). Native Linux transparency still needs a look on the real desktop.
- **Savior & Religion** (`template/Savior & Religion`, not in git, an encrypted MV game the owner is trying as a template) boots, plays its opening and draws its ULDS maps 2, 5 and 19.
- **Next:** keep the map scene across a seamless crossing (the last missed refresh at a border). 0.99.1 and 0.99.2 are announced together at the end of the weekend; a devlog draft for 0.99.1 is in `scratchpad/round2-2026-10-23/release-0.99.1/devlog.md`, and each release gets highlight pictures (RELEASE-CHECKLIST §5).
