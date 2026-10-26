# Handoff

Dated notes for the cycle in progress, newest first. Read [STATUS.md](STATUS.md) first: it is the current state and the one list of open work. Earlier cycles are in [archive/handoff](archive/handoff/), one file per version ([0.99.2](archive/handoff/0.99.2.md), [0.99.1](archive/handoff/0.99.1.md), [0.99.0](archive/handoff/0.99.0.md), [0.98.8](archive/handoff/0.98.8.md), and date-named files before that).

An entry holds only what the next session needs and cannot find elsewhere: what is half-done, what to watch for, what waits on the owner, how to resume. What changed goes in the editor changelog; how the code works goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-10-26)

- **0.99.2** shipped 2026-10-25 (runtime 20261025.11); the release commit and `v0.99.2` were made by hand on the 26th after `cut-release.cjs` refused on local failures. **0.99.3** is open at runtime **20261026.2**.
- **CI:** branch `ci-shards` (sharded suite, six-way preset sweep, CPU-time budgets, Tactical pacing tests, WebDriver script timeout, the dropdown smoke). Run 2: every Node part green, the GUI job failed once (fixed). Merge into `main` only after a fully green run; never call CI fixed before GitHub shows it.
- **Unused files** (deploy option, game and editor) and the **playtest record** are in; the Demo's web build is under itch's limits without hand trimming. Follow-up: a Demo playtest with the record on, so the record is committed with the Demo.
- **Braver** (template/Project4): its edited `rpg_managers.js` and the rest of `rpg_objects`/`rpg_scenes`/`rpg_windows` are ported in `reactor_mv_compat.js`. Other imported MV games may carry core edits too: comparing a project's `rpgmaker-runtime-backup.zip` against stock MV is how this one was found.
- **Uncommitted:** the face expressions toned toward natural (`CharacterExpressions.js` and its test), not yet rendered for the owner.
- **Editor windows:** the Event Editor, Database, Forge and Plugin Manager each open in a frameless window of their own (`utils/DetachedWindow.js`). Native Linux transparency still needs a look on the real desktop.
- **Savior & Religion** (`template/Savior & Religion`, not in git, an encrypted MV game the owner is trying as a template) boots, plays its opening and draws its ULDS maps 2, 5 and 19.
- **Owner questions:** [OWNER-QUESTIONS.md](OWNER-QUESTIONS.md).
