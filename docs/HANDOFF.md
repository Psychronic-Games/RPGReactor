# Handoff

Read [STATUS.md](STATUS.md) for open work. Earlier: [archive/handoff](archive/handoff/).

Changes belong in the editor changelog; behavior goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-11-15)

- **Development:** 0.99.6 is open since 2026-11-12 (runtime **20261115.12**, synced into the desktop's 17 projects). Everything through 2026-11-15 is committed, not pushed: pull requests 84 and 85 as a merge, then the ladder work of 11-14 and the laptop's and the desktop's of 11-15 in one commit ([changelog](../editor/changelog/0.99.6.md), entries below). Little of it is seen in the game: [OPEN-ITEMS](OPEN-ITEMS.md) items 22, 24, 26 and 27 list what to look at. The Demo in the tree is online with the creator on, as the owner has it and as it is deployed.
- **Laptop:** `template/` there holds only the Demo since 2026-11-08; the sync finds 1 bundled project there and 17 on the desktop (the folders still on their own engine are left alone), so run the sync on the desktop. The laptop's games start on OpenGL, chosen by its own record (11-10).
- **Published:** [0.99.5](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.99.5) is the regular Latest source release, with six pictures. The itch.io devlog is drafted ([Markdown](posts/itch-devlog-0.99.5.md), [plain text](posts/itch-devlog-0.99.5-plain.txt)) and not posted: posting it is the owner's. Signed native binaries remain a separate pipeline.
- **Verification:** the whole suite on the desktop on 2026-11-13, before the day's second commit: 9,793 of 9,804 passed, 11 skipped, none failed (5.8 minutes). CI was last green on run 41513263959 (2026-11-02); the 0.99.5 push's run failed with the seven tests fixed since. Substantial checks go through `codex-check`.
- **Live demo:** demo.rpgreactor.org is the owner's new VPS since 2026-11-15 (Debian 13, Node and `proxy_wstunnel` on: the live Engine runs), at runtime 20261115.12, a fresh world: the owner's account and one kept test account, `E2EChat1`. Admin: `/reactor-online/admin`, password in the server's `reactor-online/config.php`. Deploy from the desktop: `deploy-vps.cjs`, about a minute.
- **Forge:** Character Preview **98**, Props **62**, clothing Preview 61. Appearance remains under review. [Face handoff](HUMAN-FACE-HANDOFF.md#current-candidate--preview-98).
- **Faces:** the owner works on them in a separate session with another model, which may edit this tree. Leave face code alone unless asked, and check `git status` before scripted edits.
- **Resume:** use [OPEN-ITEMS.md](OPEN-ITEMS.md) and [STATUS.md](STATUS.md#open-work). Preserve fixed gameplay timing and uncapped rendering.
