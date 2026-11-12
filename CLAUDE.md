# Working on RPG Reactor

Standing instructions for Claude Code sessions in this folder, on any machine. The owner works from more than one computer (a Linux desktop and a Windows laptop) through one Dropbox-shared folder, and other agents (Codex, a separate model for faces) work in it too.

## Start here

1. `docs/HANDOFF.md`: where things stand and what is open, newest day first.
2. `docs/OPEN-ITEMS.md` and `docs/STATUS.md#open-work`: the working list.
3. `git status` and `git log -5`: other sessions may have changed or committed things since the handoff was written.

## Rules the owner has set

- **Git:** stage named files only, never `git add -A` or `git commit -a`, and read `git diff --cached --stat` before committing. Commit only when asked; a commit request does not include a push. The Demo (`template/Demo`) is the editor's stock project and showcase: the owner switches its settings and content as the work needs, and what they have set there is committed with everything else (owner, 2026-11-11: no reason to hide it or to overthink the Demo). Look at its diff first all the same: a change there that came from a test or a probe and not from the owner is not committed.
- **Faces:** human face work belongs to another model. Stay out of the face files in `editor/src/forge/Character3D/` (`CharacterHeadMesh.js`, `HeadMeshData.js`, the face parts of `HumanBody.js`) unless asked.
- **Accounts on the live demo:** never sign in as, or act on, the owner's own accounts. Test bots use `E2E…` accounts only; keep those accounts.
- **Never print the online server's secret.**
- **No 1.0 definition:** don't suggest a 1.0 scope, gate or checklist.
- **Resources:** tests and builds must never exhaust RAM or CPU. One heavy job at a time, at low priority; at most two browsers, on the GPU, muted. Browser profiles and game copies go in a cache folder and are deleted when the browser closes, never in a RAM-backed temp folder.
- **The owner's screen:** don't open game or browser windows while the owner is playing unless they said to; prefer headless runs, one window at a time, and close every window a run opens, including when it fails.
- **Deploying to demo.rpgreactor.org** needs no confirmation (a development server). But a deploy builds from the Demo as it stands, including its current settings: if the owner has switched the Demo (single player, creator off), say so before deploying.

## How the work is done

- **Runtime:** `runtime/` is the source; `node editor/build-scripts/sync-runtime.cjs` copies it into the 20 bundled projects (`--check` verifies). Bump `RPG_REACTOR_RUNTIME_REVISION` in `runtime/reactor_main.js` (YYYYMMDD.N) for each change the owner will test. Each sync rewrites about 40 files across the bundled projects, which Dropbox then syncs to the other machine: batch changes rather than syncing after each small one.
- **Tests:** one file: `node --test editor/tests/<name>.test.cjs`. From `editor/`, at low priority (`nice -n 19`): `npm run test:changed` reruns only the test files that read something changed since they last passed. Each test process records what it reads, lists and asks after (`tests/helpers/test-inputs.cjs`, since 2026-11-10), so a runtime line reruns the tests of that file, not the Forge sweeps: `reactor_sprites.js` 73 files and 21 CPU-seconds, where the guess from names reran 782 files and 48 CPU-minutes. A change in the Character Builder still reruns its sweeps (`HumanBody.js`: 119 files, 41 CPU-minutes). Use it after each batch, not a whole run; `npm run test:fast` skips the heavy sweeps in `tests/test-tiers.json`, and `npm run test:all` is the whole suite (5.4 minutes on the desktop at 14 workers, 9,628 tests, 2026-11-10; the runner picks the worker count from the threads and the memory it may use, so pass no `--concurrency`, and under the desktop's `codex-check` wrapper set `CODEX_CHECK_MEMORY_HIGH=14G CODEX_CHECK_MEMORY_MAX=16G` or its 6 GB cap leaves six workers), for before a commit or a release, not between tasks. Run the whole suite through `run-tier.cjs` or `npm test`, not a bare `node --test editor/tests/*.test.cjs`: that skips `tests/helpers/small-pictures.cjs` and paints full-size pictures, about 25 minutes. Known failures predating 2026-11-05: `fight-seams`, `speaker-face` (the creator overrides `ImageManager.loadFace`), `model-effects` (transform count), `reactor-3d-foundation` (root file count); also failing at `e18cd9e2`: `encrypted-assets` (filename case), `reflection-costs` (owed capture face); `online` fails while the Demo is switched to single player. On the Windows laptop a whole run without the heavy sweeps had 49 failures on 2026-11-10: these and tests that need the desktop's files.
- **Docs:** changes go in `editor/changelog/<version>.md` (developer detail) and `changelog/<version>.md` (player-facing); `docs/HANDOFF.md` keeps a short entry per day, and `editor/tests/docs-budget.test.cjs` enforces its size limits.
- **Measuring the game:** the Demo only runs under NW.js (a plugin uses `require`), not in a plain browser. F2 in game shows FPS, ms (the game's own work per frame) and the graphics device. The game's automatic quality levels are saved in the Demo's `save/config.rmmzsave`, per device since runtime 20261105.9. On Windows a game may restart itself once at launch onto the graphics backend its record chose (`ReactorBackend`; `%LOCALAPPDATA%\RPGReactor\graphics-backend.json`, since runtime 20261110.4), and the Direct3D 11 path differs by up to 20% between sessions: compare within one session. Time frames with `performance.now()`, not the time a frame callback is handed.
- **The test harnesses** live outside the repo, one per machine. The Linux desktop's (CDP scripts that drive NW.js or headless Chromium, the deploy script) is in `~/.cache/rr-tests`. The Windows laptop's (PowerShell and CDP scripts that drive NW.js on a copy of the Demo; no deploy script) is in `%LOCALAPPDATA%\rr-tests`. Their notes are in the handoff's harness lines.

## Writing for the owner

Plain, direct language. Say what was measured and how; say when something is a guess. When an earlier explanation turns out wrong, correct it plainly.
