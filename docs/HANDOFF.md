# Handoff

Read [STATUS.md](STATUS.md) for open work. Earlier: [archive/handoff](archive/handoff/).

Changes belong in the editor changelog; behavior goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-11-13)

- **Development:** 0.99.6 is open since 2026-11-12 (runtime **20261112.5** in `runtime/` and the desktop's 17 bundled projects) and committed on 2026-11-13, with pull request 81 merged in; not pushed ([changelog](../editor/changelog/0.99.6.md), entries below). Little of it is seen in the game: [OPEN-ITEMS](OPEN-ITEMS.md) item 22 lists what to look at. Not deployed: demo.rpgreactor.org runs **20261110.12**, online with the creator on. The Demo in the tree is single player, creator off, committed as the owner has it: switch both for a deploy and put them back. Release pictures: `~/.cache/rr-tests/release-0995/`.
- **Laptop:** `template/` there holds only the Demo since 2026-11-08; the sync finds 1 bundled project there and 17 on the desktop (the folders still on their own engine are left alone), so run the sync on the desktop. The laptop's games start on OpenGL, chosen by its own record (11-10).
- **Published:** [0.99.5](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.99.5) is the regular Latest source release, with six pictures. The itch.io devlog is drafted ([Markdown](posts/itch-devlog-0.99.5.md), [plain text](posts/itch-devlog-0.99.5-plain.txt)) and not posted: posting it is the owner's. Signed native binaries remain a separate pipeline.
- **Verification:** the whole suite on the desktop on 2026-11-13, before the commit: 9,768 of 9,781 passed, 11 skipped, 2 failed, both only because nothing was staged yet (a new file not added, a deleted Demo file still tracked); both pass on the commit. CI was last green on run 41513263959 (2026-11-02); the 0.99.5 push's run failed with the seven tests fixed since. Substantial checks go through `codex-check`.
- **Live demo:** demo.rpgreactor.org runs the Demo of 11-10 (online, creator on). It still holds test sleepers and chat; keep the `E2E…` accounts, which are planned as extra battle participants.
- **Forge:** Character Preview **98**, Props **62**, clothing Preview 61. Appearance remains under review. [Face handoff](HUMAN-FACE-HANDOFF.md#current-candidate--preview-98).
- **Faces:** the owner works on them in a separate session with another model, which may edit this tree. Leave face code alone unless asked, and check `git status` before scripted edits.
- **Resume:** use [OPEN-ITEMS.md](OPEN-ITEMS.md) and [STATUS.md](STATUS.md#open-work). Preserve fixed gameplay timing and uncapped rendering.

## 2026-11-13 — the documents brought up to date, a whole run, the commit

- **Documents:** the guides now cover what 0.99.6 added: the Sprite view, faces with frames and the Character Groups page as it is now ([CHARACTER-BUILDER.md](CHARACTER-BUILDER.md#sprite-sheets)), how the game plays a face set with frames ([AUTHORING.md](AUTHORING.md#face-sets-with-frames)), the Audio Player's window (`editor/README.md`). Open items 21 (clothes on extreme bodies) and 22 (what of 0.99.6 is not yet seen) are new.
- **Tests:** one whole run, 6 minutes: the numbers are under Verification above. Log: `~/.cache/rr-tests/runs/all-20261113.log`.
- **Commit:** all of 0.99.6 so far, the Demo as the owner has it (a changed design, the group page's last description), then `origin/main` merged for pull request 81. Not pushed.
- **Next:** a session with the game on screen (item 22), and a deploy: the server's PHP changed (party places held for accounts, a closed battle's log kept a minute) and has only been through a parser; after it, `~/.cache/rr-tests/server-test.cjs`.

## 2026-11-12 — the seven test failures, the audits' answers, the builder's Sprite view and groups

- **Tests:** the seven standing failures are fixed, and time budgets allow double in a run of many files.
- **Audits:** both pages are rewritten in plainer words with a recommendation under each of the 64 decisions. The owner answered "all as recommended". The runtime and server answers were done by the lead, the editor ones by three workers on separate areas, each diff read against a snapshot (logs: `~/.cache/rr-tests/decisions-20261112/`). What is still open is listed at the top of each page's decisions.
- **Pull request 81** (Xehanort88: `Game_Enemy.rrActionPatterns` and `rrEquipSource`) is merged on GitHub; its code and test were applied onto the working tree by hand before the merge.
- **Owner's notes the same day, all in the [changelog](../editor/changelog/0.99.6.md):** face sets with frames that talk or sweep (runtime 20261112.5); the builder's Sprite view (game timing, zoom, frame edges, soft outline, shadow with a dial); Character Groups (plain wording, ranges for every slider, a picture catalog of outfits, pieces, accessories and cyber limbs, 3D models from a group); Database pages that scroll as one; the Audio Player as a window of its own. Seen in the real editor on the hidden display, with the gaps each entry names.
- **Clothes on extreme bodies:** plate armor fixed to about 300% weight; cloth diagnosed only (open item 21).
- **Seen running:** only a boot. The Demo under NW.js on the hidden display reached its first map at 20261112.2, 58 fps, walked, opened Options and came back, with the same four console lines as 0.99.5 (a context dropped on purpose by a probe). The screenshot came out white on that display, so the picture is not confirmed. `~/.cache/rr-tests/boot-0996.cjs`.
- **The 2D Character Generator is retired** (owner): its folder, tests and web-bundle scripts are gone, half the editor's lines. A project's `forge/character_generator/` folder and the tool's translation entries are left.
- **For the owner:** the Demo's Options plugin hides the new Battle Camera row.
