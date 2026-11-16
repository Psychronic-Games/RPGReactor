# Handoff

Read [STATUS.md](STATUS.md) for open work. Earlier: [archive/handoff](archive/handoff/).

Changes belong in the editor changelog; behavior goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-11-15)

- **Development:** 0.99.6 was released on 2026-11-16 (runtime **20261115.12**); everything is pushed. 0.99.7 opens when its work starts. What 0.99.6 still needs seen: [OPEN-ITEMS](OPEN-ITEMS.md) items 22, 24, 26 and 27. The Demo in the tree is online with the creator on, as deployed.
- **Laptop:** `template/` there holds only the Demo since 2026-11-08; the sync finds 1 bundled project there and 17 on the desktop (the folders still on their own engine are left alone), so run the sync on the desktop. The laptop's games start on OpenGL, chosen by its own record (11-10).
- **Published:** [0.99.6](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.99.6) is the Latest source release, with six pictures. Its itch.io devlog is drafted ([Markdown](posts/itch-devlog-0.99.6.md), [plain text](posts/itch-devlog-0.99.6-plain.txt)) and not posted: posting it is the owner's. Signed native binaries remain a separate pipeline.
- **Verification:** the whole suite on the desktop on 2026-11-13, before the day's second commit: 9,793 of 9,804 passed, 11 skipped, none failed (5.8 minutes). CI was last green on run 41513263959 (2026-11-02); the 0.99.5 push's run failed with the seven tests fixed since. Substantial checks go through `codex-check`.
- **Live demo:** demo.rpgreactor.org is the owner's new VPS since 2026-11-15 (Debian 13, Node and `proxy_wstunnel` on: the live Engine runs), at runtime 20261115.12, a fresh world: the owner's account and one kept test account, `E2EChat1`. Admin: `/reactor-online/admin`, password in the server's `reactor-online/config.php`. Deploy from the desktop: `deploy-vps.cjs`, about a minute.
- **Forge:** Character Preview **98**, Props **62**, clothing Preview 61. Appearance remains under review. [Face handoff](HUMAN-FACE-HANDOFF.md#current-candidate--preview-98).
- **Faces:** the owner works on them in a separate session with another model, which may edit this tree. Leave face code alone unless asked, and check `git status` before scripted edits.
- **Resume:** use [OPEN-ITEMS.md](OPEN-ITEMS.md) and [STATUS.md](STATUS.md#open-work). Preserve fixed gameplay timing and uncapped rendering.
