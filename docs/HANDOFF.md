# Handoff

Read [STATUS.md](STATUS.md) for open work. Earlier: [archive/handoff](archive/handoff/).

Changes belong in the editor changelog; behavior goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-11-20)

- **Development:** 0.99.7 open since 2026-11-16, runtime **20261121.6**, synced into all 17 on the desktop. The owner's next upload: the end of the weekend of 2026-11-22 (issue 90 closed 11-21). NW.js **0.120.0** in `nwjs-win` and `nwjs-linux`; `nwjs-mac` still 0.107. Committed to 2026-11-21 (`e3f024dc`), not pushed (`main` six ahead). **Steam:** release 21 January 2027, $9.99; kit in `docs/steam/`. CI: GUI smokes started by hand since 11-21; main's next run is the proof. 0.99.6 still to see: [OPEN-ITEMS](OPEN-ITEMS.md) 22, 24, 26, 27. The Demo: single player, creator off, its committed Graphics Backend is Auto (`System.json`): say so before a deploy.
- **Windows machines:** the Iris Xe laptop (i5-1145G7), which holds only the Demo in `template/` (2026-11-18), and an MSI, RTX 3060 Laptop and Intel UHD (i5-10500H), which held all 17 on 11-17. The Iris Xe's games start on OpenGL by its record; Vulkan shows on both.
- **Published:** [0.99.6](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.99.6), the Latest source release. Its itch.io devlog is drafted ([Markdown](posts/itch-devlog-0.99.6.md), [plain text](posts/itch-devlog-0.99.6-plain.txt)); posting it is the owner's.
- **Verification:** the whole suite on the desktop on 2026-11-13, before the day's second commit: 9,793 of 9,804 passed, 11 skipped, none failed (5.8 minutes). Substantial checks go through `codex-check`.
- **Live demo:** demo.rpgreactor.org is the owner's new VPS since 2026-11-15 (Debian 13, Node and `proxy_wstunnel` on: the live Engine runs), at runtime 20261115.12, a fresh world: the owner's account and one kept test account, `E2EChat1`. Admin: `/reactor-online/admin`, password in the server's `reactor-online/config.php`. Deploy from the desktop: `deploy-vps.cjs`, about a minute.
- **Forge:** Character Preview **98**, Props **62**, clothing Preview 61. Appearance remains under review. [Face handoff](HUMAN-FACE-HANDOFF.md#current-candidate--preview-98).
- **Faces:** the owner works on them in a separate session with another model, which may edit this tree. Leave face code alone unless asked, and check `git status` before scripted edits.
- **Resume:** use [OPEN-ITEMS.md](OPEN-ITEMS.md) and [STATUS.md](STATUS.md#open-work). Preserve fixed gameplay timing. V-Sync is on by default since 2026-11-17, a project setting; F2 still shows what the machine could draw.
