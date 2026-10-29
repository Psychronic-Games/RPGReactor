# Handoff

Dated notes for the cycle in progress, newest first. Read [STATUS.md](STATUS.md) first: it is the current state and the one list of open work. Earlier cycles are in [archive/handoff](archive/handoff/), one file per version ([0.99.2](archive/handoff/0.99.2.md), [0.99.1](archive/handoff/0.99.1.md), [0.99.0](archive/handoff/0.99.0.md), [0.98.8](archive/handoff/0.98.8.md), and date-named files before that).

An entry holds only what the next session needs and cannot find elsewhere: what is half-done, what to watch for, what waits on the owner, how to resume. What changed goes in the editor changelog; how the code works goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-10-28)

- **0.99.3 source release:** runtime **20261028.11**, [release notes](posts/release-notes-0.99.3.md) and [editor changelog](../editor/changelog/0.99.3.md). **0.99.4** is open after the release push; binary publishing is separate.
- **CI:** the eight-shard workflow is pushed; check the latest `main` run in GitHub Actions.
- **Today:** Tactical grapple, worn equipment, height reach, Q/E through key config, GL fixes, Builder metal/filtering; Demo Builder heroes 7-10, raiders and militia.
- **Builder/export audit:** GLB images/PBR settings survive loading; Database inspection shares the Builder studio. Orbit zoom keeps its centre; chibi sheets survive rebuilds; faces keep studio colors. Rhea's GLB and four face sheets are refreshed. Native: `smoke/nw-builder-export-parity.cjs`; evidence: `scratchpad/builder-parity-20261028/`.
- **Database audit:** saved model thumbnails load first; only missing pictures render. Structures expand the complete preview into editable pieces and retain child content on save. Both builders share tool controls; help clears the bar. Native: `smoke/nw-database-assets.cjs`; evidence: `scratchpad/database-assets-20261028/`.
- **Remaining work:** [OPEN-ITEMS.md](OPEN-ITEMS.md), including optional distance/night readability tuning; game and Builder lighting intentionally follow their own scene.
- **Older threads:** Unused files and the playtest record (a Demo playtest with the record on is still owed); Braver's corescript port; the detached editor windows (Linux transparency); Savior & Religion (not in git) boots and plays.
- **0.99.4 priority:** improve chibi visual quality. The current appearance was rejected; review proportions, hair, outfits and faces in complete exported sheets at native size. [Details](OPEN-ITEMS.md).
- **Owner questions:** [OWNER-QUESTIONS.md](OWNER-QUESTIONS.md).
