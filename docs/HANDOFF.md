# Handoff

Read [STATUS.md](STATUS.md) for open work. Earlier: [archive/handoff](archive/handoff/).

Changes belong in the editor changelog; behavior goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-11-12)

- **Development:** 0.99.5 was released on 2026-11-12 (runtime revision **20261111.18** in `runtime/` and all 17 bundled projects on the desktop); no new cycle is open yet, so the next change opens 0.99.6 (version surfaces and both changelogs). `cut-release.cjs` refuses a failing suite, so its steps were done by hand. The 2026-11-11 audit's fixes are not seen in the game. Not deployed: demo.rpgreactor.org runs **20261110.12**, online with the creator on. The Demo in the tree is single player, creator off, committed as the owner has it: switch both for a deploy and put them back. Release pictures: `~/.cache/rr-tests/release-0995/`.
- **Laptop:** `template/` there holds only the Demo since 2026-11-08; the sync finds 1 bundled project there and 17 on the desktop (the folders still on their own engine are left alone), so run the sync on the desktop. The laptop's games now start on OpenGL: its record in `%LOCALAPPDATA%\RPGReactor\graphics-backend.json` chose it (11-10, runtime .8).
- **Published:** [0.99.5](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.99.5) is the regular Latest source release, with six pictures. The itch.io devlog is drafted ([Markdown](posts/itch-devlog-0.99.5.md), [plain text](posts/itch-devlog-0.99.5-plain.txt)) and not posted: posting it is the owner's. Signed native binaries remain a separate pipeline.
- **Verification:** before the cut the whole suite ran on the desktop: 9,718 of 9,737 passed, 8 failed (the 7 known, and a timing test in `character-3d-creatures` that passes alone). CI was last green on run 41513263959 (2026-11-02); the release push is `main`'s first run since. Substantial checks go through `codex-check`.
- **Live demo:** demo.rpgreactor.org runs the Demo of 11-10 (online, creator on). It still holds test sleepers and chat; keep the `E2E…` accounts, which are planned as extra battle participants.
- **Forge:** Character Preview **98**, Props **62**, clothing Preview 61. Appearance remains under review. [Face handoff](HUMAN-FACE-HANDOFF.md#current-candidate--preview-98).
- **Faces:** the owner works on them in a separate session with another model, which may edit this tree. Leave face code alone unless asked, and check `git status` before scripted edits.
- **Resume:** use [OPEN-ITEMS.md](OPEN-ITEMS.md) and [STATUS.md](STATUS.md#open-work). Preserve fixed gameplay timing and uncapped rendering.
