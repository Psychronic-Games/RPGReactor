# Handoff

Read [STATUS.md](STATUS.md) for open work. Earlier: [archive/handoff](archive/handoff/).

Changes belong in the editor changelog; behavior goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-11-10)

- **Development:** 0.99.5 is open, runtime revision **20261110.13** in the tree and the Demo; committed on `main` with the audit's fixes and the merge of `origin/main` (pull request #80), 20 commits ahead of GitHub and not pushed. demo.rpgreactor.org runs **20261110.12**, deployed online with the creator on. The Demo in the tree is single player, creator off, uncommitted on purpose: switch both for a deploy and put them back (the settings as the owner left them are in `~/.cache/rr-tests/server-backup-20261110/demo-settings`).
- **Laptop:** `template/` there holds only the Demo since 2026-11-08; the sync finds 1 bundled project there and 17 on the desktop (the folders still on their own engine are left alone), so run the sync on the desktop. The laptop's games now start on OpenGL: its record in `%LOCALAPPDATA%\RPGReactor\graphics-backend.json` chose it (11-10, runtime .8).
- **Published:** [0.99.4](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.99.4) is the regular Latest source release; the [itch.io devlog](https://psychronic.itch.io/rpg-reactor/devlog/1746509/rpg-reactor-0994-released) is live. Signed native binaries remain a separate pipeline.
- **Verification:** CI was last green on branch `ci/0.99.5-check` (run 41513263959: 9,328 passed, 35 skipped); `main` is 8 commits past it. On the laptop on 11-10 the suite without the heavy sweeps ran 8,942 passed, 49 failed: the known failures and tests that need the desktop's files. Substantial checks go through `codex-check`.
- **Live demo:** demo.rpgreactor.org runs this cycle's Demo, and a playtest of the Demo joins it. It still holds test sleepers and chat; keep the `E2E…` accounts, which are planned as extra battle participants.
- **Forge:** Character Preview **98**, Props **62**, clothing Preview 61. Appearance remains under review. [Face handoff](HUMAN-FACE-HANDOFF.md#current-candidate--preview-98).
- **Faces:** the owner works on them in a separate session with another model, which may edit this tree. Leave face code alone unless asked, and check `git status` before scripted edits.
- **Resume:** use [OPEN-ITEMS.md](OPEN-ITEMS.md) and [STATUS.md](STATUS.md#open-work). Preserve fixed gameplay timing and uncapped rendering.

## 2026-11-10 (desktop) — Runtime synced, the server tested, and an audit of every part

Runtimes 20261110.11 and .12, synced into the 17 bundled projects, deployed (.12; .13 is not), committed as `ca1925bc` and the merge `26f2c45d`. Details in the [changelog](../editor/changelog/0.99.5.md) under "Audit of 2026-11-10".

- **Sync:** the laptop's work (runtimes 20261108.1 to 20261110.10) reached only the Demo there; all 17 projects on the desktop now match `runtime/`.
- **Server:** the PHP and Engine changes of 11-06 and 11-07 were deployed and tested on the live site for the first time: all passed. Test: `node ~/.cache/rr-tests/server-test.cjs` (40 checks over HTTP and the Engine's socket, as `E2E…` accounts and guests on map 9999; it reads the secret from the mount and never prints it). Reading `parties.json` through the sshfs mount right after a write can show it mid-replacement; the test waits for it.
- **Audit:** 21 read-only reviews, about 300 findings; each one fixed was re-read in the code first. Over eighty are fixed, among them a crash after a graphics reset, a join line that stopped a host's game, a message that ended the Engine, saves that carried the common-event database, and the causes of two open reports: white patches on clothing at standard quality (`CharacterFabric`) and the creator showing another outfit than the one picked. The rest, with six decisions for the owner, are in [AUDIT-2026-11-10.md](AUDIT-2026-11-10.md).
- **Not checked by eye:** none of the fixes was seen in the running game or editor. Worth a look: the in-game creator (outfits, Done, the Star Shift presets, white patches gone on a new character), a click on a hillside, a border crossing with grass, a television with sound out of view, hover explanations in the Database window.
- **A crash from .11, found by the owner (fixed in .12):** walking into North Haven's square on a Windows machine stopped the game in PIXI's `SpritePipe.updateRenderable` ("Cannot read properties of null (reading 'updateElement')"): a sprite asked to update that no batch held. The cause is not pinned down. Two of the day's changes bear on it: the Tilemap's `visible` setter marking the draw list only on a real change (taken back out), and the culling sample now reaching sprites it never asked before at two or more updates a frame (kept). `pixi_compat.js` now passes such a sprite over and has the list built again. Not reproduced on the desktop, which never runs two updates a frame; a slow machine is where to look.
- **Tests:** after .13 and the merge, `test:changed` ran 8,429 of 8,447 passing, the 7 known failures only; the same 7 after each of the later speed changes.
- **Pull request #80 (Enemy Equipment, Xehanort88), runtime .13:** merged on GitHub as `e7dcc634`. Its changes were applied to the tree as a patch while the audit's work was uncommitted in the same files, committed with it, and `origin/main` was then merged (`26f2c45d`, no file changed; the revision stamp and the appended translations resolved to the local side, the changelog index kept, its line in the 0.99.5 changelogs). The feature is off by default. Not deployed.
- **Test speed (owner asked again):** `npm run test:changed` goes by what each test process read (`tests/helpers/test-inputs.cjs`): a runtime file's change reruns tens of files, not 782 of 958. The slowest sweeps were profiled and cut with the built models' hashes unchanged: the suite's CPU 3,399 to 2,847 s. A Character Builder change still reruns about 150 files (seven minutes at six workers). Tools: `~/.cache/rr-tests/testspeed`.
- **Left as found:** `reverse_state_effect` on a 2000/2003 skill now follows EasyRPG's rule (cure on allies, inflict on enemies, reversed by the flag); `legacy-commands.test.cjs` held the opposite for an ally skill with the flag and was changed. Re-import a game to pick it up.

## 2026-11-10 (laptop) — Auto's smoothness, sharper small pictures, the backend by measurement, crowds, arrivals, shader changes

Runtimes 20261110.1–.10, synced into the Demo, committed with the work of 11-08 and 11-09. Details and numbers in the [changelog](../editor/changelog/0.99.5.md).

- **Where the frame goes (North Haven, Direct3D 11):** the page's thread and the GPU process are both near their limit; a frame's JavaScript is 23.7 ms there and 14.0 ms on OpenGL.
- **.1–.3:** `CrowdTiers`, the character LOD limits, Auto judging missed frames (target 63), `MipBias` (a picture drawn small reads its textures a level finer).
- **.4: `ReactorBackend`** (reactor_main.js): each Windows machine finds its own backend by playing; a game restarts itself onto its plan (~1.5 s); playtests read the same plan (`PlaytestManager.backendPlan`). A machine that holds its rate near the full picture is left alone.
- **.5, crowds (120 copies of a character: 17-19 -> 22-24 fps):** the shadow budget and the mirror list keep what they worked out per body; joints with nothing to draw leave the visible tree (`BareBones`); a sprite its model draws updates once a drawn frame. Harness: `crowd-stress.js` (`crowd-near.js`, `crowd-rigid.js`, `crowd-spread.js` before it), `crowd-draws.js`, `bare-ab.js`.
- **.6, arrivals (into North Haven, cold: worst frame 5.8 -> 0.7-1.4 s; warm: 50 fps at 22-24 s, not 45 at 43):** three draws built their program on the spot (a disposed material kept its warm marks; the light bake compiled for the screen's output; the haze asked ahead only at borders); built characters' pictures decode in the image worker, their bounds come from the arrays.
- **.7, shader changes without stops:** a program is read only while none is compiling (`readWhenQuiet`); a material in view keeps its program while its next is built (`recompile`: Auto turning shadows off cold, worst frame 0.90 -> 0.23 s, 527 things missing -> 0); a moving caster waits for its depth program. Harness: `windows.cjs`, `incl.cjs`, `arrival-reads.js`, `level-flip.js`, `clocks.js`; `session.cjs --profile=warm` keeps `profiles\kept-warm` (delete when done).
- **.8, the backend sooner:** the laptop walks North Haven at 68 fps on OpenGL against 41 on Direct3D 11 (Auto free: GPU 1 / CPU 0 against GPU 4 / CPU 5). Backends are compared on the maps both were played on; one plainly ahead is chosen at the second launch; OpenGL is tried before 11 on 12. The laptop's record now says OpenGL.
- **.9–.10, weak machines stood in for** (`session.cjs --cpu-throttle=3`; `weak-gpu-log.js` draws every pass with N times the pixels): Auto now steps down for frames that keep stopping (it judged nothing before), has two levels past Low (0.4, 0.33), and rests 5 s at most after a step. A card ten times weaker holds 63-71 fps; a processor a third as fast gets 13-15 fps at the last level. Standing events skip their ground physics; on a 3D map sprites and culling run in a frame's last update.
- **Measured and left out:** WebGPU through three's renderer (slower), an edge-adaptive enlarging filter, matrices recomputed only where moved, half-rate 3D by shifting the last picture (the player's own body judders).
- **Next:** a processor far too slow (North Haven 13-15 fps at a third of the speed: the game's updates, the 3D sync, the draw, a few percent each); cold arrivals' first seconds and the still casters' depth programs; for crowds, the joints' matrices.
- **To check by eye:** the game on OpenGL on the laptop (its restart at launch, the picture); shimmer on fine textures at low Auto levels (`Reactor3D.MipBias.STRENGTH`).

## 2026-11-09 (laptop) — D3D11-on-12, map arrival

Runtimes 20261109.1–.2, synced into the Demo, not committed. Details in the [changelog](../editor/changelog/0.99.5.md).

- **D3D11-on-12** tested on the Iris Xe (+35-50% at the same levels, the same picture, no errors). Playtests on a weak GPU under Windows now launch with it (`PlaytestManager.weakAngleArgs`); exported games do not yet, and need a way to get it on such machines only.
- **Map arrival:** the worst cost was model sheets resized on the main thread (now in the image worker): North Haven crawled at 1-6 fps for 30 s, now ~20 by 13 s and 50-60 by ~40 s. Left: the distance levels' queue, models joining later, built characters' merged textures.
- **Auto:** weak GPUs start at GPU 2 / CPU 2; steps are undone only when clearly worse; the GPU timer is ignored when it reads nonsense (D3D11-on-12).
- **Later (20261109.2):** character parts take distance levels (triangles 400k -> 314k, fps unchanged); the trim drops soft hair again.
- **Correction, from a Chromium trace (North Haven running, D3D11, ~37 fps):** the page's main thread is busy 99% of the time (3D drawing in JavaScript ~11 ms a frame, game and map updates ~10, PIXI ~2.5) and the GPU process's main thread 75% (translating our WebGL to D3D11, ~17 ms a frame). The GPU timer's 18 ms includes waiting for commands, so the earlier "GPU-bound" reading was wrong: the CPU limits, and the D3D11 translation competes for the same power budget. A plain three.js scene runs as fast on D3D11 as on OpenGL, so it is what our engine sends that D3D11 handles slowly.
- **WebGPU, measured (harness `WebGPUProto`, `proto.ps1`):** three.js 0.187's WebGPURenderer ran 30-45% slower than its WebGLRenderer on the same scene (its render call 9-12 ms against 2-9, main thread); PixiJS 8.22 the same on both. Not worth a port now; re-run the proto on new three releases.

## 2026-11-08 (laptop) — The Demo on Intel Iris Xe

Runtimes 20261108.1–.4, synced into the Demo, not committed. Owner's direction (evening): one system that adapts to any machine by what it is short of, looking better or worse by setup, never a laptop fix that costs a desktop; over 60 under load; measure while walking and running. Runtimes .3–.4 rebuild Auto quality that way (GPU timer per frame, six-level GPU and CPU ladders, target 66, steps judged and undone when they buy nothing, the other ladder tried when one is spent). Running with Auto: Reactor Room ~37 → 64-68 fps, North Haven ~39 → 54-55. **Open decision:** Chromium's GPU process is the laptop's hidden limit; `--use-angle=d3d11on12` in the project's `chromium-args` took North Haven 54 → 64-68 with the same picture (Vulkan drew nothing); needs a check on NVIDIA/AMD under Windows before it becomes a default. What changed and the numbers are in the [changelog](../editor/changelog/0.99.5.md). Goal (owner): 60 fps in the Demo on this weak-GPU laptop, with no visible loss.

- **Machine:** HP EliteBook 840 G8, i5-1145G7, Iris Xe (shared memory), 1920×1080 at 60 Hz, Windows 11, Balanced plan on mains. Git 2.56 and Node 26.13 were installed today (winget); global `core.autocrlf false`, `core.longpaths true`. Pushing from here fails: the repo's credential helper is the desktop's `gh` path. `node_modules` holds Linux esbuild and `@node-rs/crc32` only, so packaging builds fail here; never `npm ci` in the shared tree.
- **Where it stands:** Reactor Room ~31 → ~38 fps back to back (.2 against 11-07's .15; p95 ~50 → ~35 ms), North Haven's square ~29 → ~38-40 (.1). Per frame: update ~9-10 ms (1.6 catch-up updates a frame; 1 at 60 fps), 3D draw ~11-12, PIXI ~2. **Correction:** the GPU matters here after all. The CPU holds its 2.4-2.6 GHz base clock at 78 °C and shares one power budget with the Iris Xe: at 0.4 render scale even game updates ran 8% faster and the 3D draw's main-thread time fell 12.3 → 8.5 ms. GPU frame: main pass ~16 ms, PIXI composite ~3, shadows ~2.
- **Next, measured but not done:** per pixel, seven room-wide searchlights sit in every pixel's light loop (a machine prop filling the view costs 1.5 ms for 13k triangles); the party's bodies (morphs, layered parts) and hair cards take no distance levels; three's per-draw cost (~110 draws, ~40 µs each at base clock); `syncCharacterModels` ~2 ms; colour filters' scene walk 0.4 ms (needed every draw). Levers that change the picture (render scale, fewer or shorter searchlights, simpler party models) are the owner's call.
- **Harness (this laptop, outside the repo):** `%LOCALAPPDATA%\rr-tests\harness\run.ps1 -Project Demo|Demo-base [-Extra "--map=5,73,60"] -Probes settle.js,bench.js [-Keep]` boots one muted NW.js window on a copy (`rr-tests\Demo` is the new runtime, `Demo-base` the old), then `ask.cjs <probe.js>`, `ask.cjs --prof 6`, `ask.cjs --shot name`, `ask.cjs quit`. Probes are in `rr-tests\probes` (fps, passes, draws, draw-cpu, function timers, gl-traffic, CPU and GPU A/B, bench). `callers.cjs <cpuprofile> <fn> [--down]` reads a profile.
- **Traps:** chromedriver does not apply a project's `chromium-args`; pass the Demo's (no vsync) or frames are paced. Run `settle.js` first: the geometry worker queues models after the boot looks settled, and a measurement during it reads 14-21 fps. Fps swings ±10% between runs on this laptop (clock and power drift), so compare on and off in turn in one session (`ab-*.js` probes, ABBA rounds, medians) or Demo-base and Demo back to back. A model-drawn sprite still needs its bitmap: GALV's `patternWidth` divides `bitmap.width` (a crash on entering North Haven until fixed).
- **Owner:** check why `template/` here lost every project but the Demo (Dropbox selective sync, or deleted on purpose?), before Dropbox carries it anywhere.

## 2026-11-07 — Review of 11-06, a New Game crash, smoke scripts, languages, test speed

Runtimes 20261107.1–.15, synced, not committed (with all of 11-06's afternoon work). Details in the [changelog](../editor/changelog/0.99.5.md).

- **Review of 11-06's uncommitted work:** nine findings confirmed in the code and fixed: a dropped battle guest resending forever; the Engine relay budget charged per recipient (large real-time battles lost the host's updates); `fairName` re-reading files under the lock; the shown online name lost on a failed `look`; below-character model footprints blocking NPCs; a double build in the 3D event refresh; Resize Map missing unsaved open-map transfers; the Options save's fixed key list; three misplaced doc comments. The PHP still needs a deploy and a server test.
- **New Game crash:** Star Shift Origins, Rebellion and Legacy stopped at New Game since the online party values (a variable read back on every write through their plugins). Fixed in .2; the 2D audit passes on all three.
- **Smoke scripts:** the 24 failures were stale scripts or the hidden display; 18 updated, 13 pass. What is left, and four editor faults they reached, are in [OPEN-ITEMS](OPEN-ITEMS.md) item 17. The language switch fault is fixed.
- **Language pass (afternoon, editor only):** pop-out windows (Database, Forge, Event Editor) now get the language pass the main window has; 459 phrases translated into all 17 languages (Character and Prop Builders, User Interfaces editor, text codes). Harness: `~/.cache/rr-tests/i18n-audit/` (`static.cjs` finds untranslated labels in under a second).
- **Test speed (owner: make tests faster, never hide them; memory test-suite-speed):** profiled per test: the slow files spend their time in builder code. `CharacterFit`'s nearest-point search is faster (identical results) and `Wardrobe.build` honours the test picture sizes: `character-3d-model` 376 → 267 s. Next: the triangle-budget test (186 s; shading, fitting, `HumanBody.relax`), then the prop and species sweeps. Owner questions B4 (shading double count) and B5 (new-map lighting) added.
- **Owner rulings (evening):** B1 height reach to 50, B4 shading key fixed, B5 unlit maps show full light in the Lighting panel; B2 and B3 left as they are. Owner questions list B is empty.
- **Walls through roofs (C4, runtime .3):** at the owner's five houses: wall-top beams and corner posts 0.01 out through the eave boards (thinned and shortened in two plans and four houses), ramps side by side flickering at their seam (hidden side faces, runtime), gable slabs coplanar with the verge board's end (board 0.02 longer, stamper and map). Town: ~4,000 hits → 73. Harness `~/.cache/rr-tests/roofs/seen.cjs`.
- **Frame rate (runtime .4):** games run with no vsync (`UNCAPPED_CHROMIUM_ARGS`, the Demo's `package.json`), and Auto quality rests 2.5 s after a map opens (it had stepped the desktop's CPU level down at North Haven's arrival). Owner's display (RTX 5070): ~530 fps. Vsync proven the stutter (on: 58 held frames a second; off: 0.2). Runtime .5 spreads an update's shadows and reflections over the refreshes after it (update frames 5.1 → 3.8 ms). **Gable light strip (runtime .6):** back-face casters stored the overhang's underside; the sun now draws pieces from both sides and lights only faces turned to it (houses' far sides now in shade). **Vehicle echo (.7):** a moving model's merged still parts stayed at the update's place between updates; they now follow it, and moving shadows are redrawn between updates (.8). Sun facing on pieces only. Riding hitches (.10–.12): 20 ms+ frames 6–7 → 4 a ride; left: the crossing frame. Cliffs edge style on Open Road. Shadows ahead (.13), swim pose kept (.14), camera jitter (.15).
- **Tests:** `test:changed` 8,394 run, the 7 known failures only; again after the evening's changes, 8,332 run, the same 7.

## 2026-11-06 — Audit pass, third splash screen, faster test runs

Runtime 20261106.1, synced, not committed. Eleven read-only reviews covered the runtime and the editor; every finding was re-read in the code before it was changed. About fifty fixes are listed in the [changelog](../editor/changelog/0.99.5.md).

- **Fixed:** the third splash image never showed in NW.js (the page's chrome-extension:// address hid the images folder). The same address mistake meant the Prop Builder's bake worker never ran on the desktop.
- **Highest-impact runtime fixes:** a start stuck on the spinner after a late WebGL; models that ignored an event page's model change outside battles; a menu-open crash with shared muted videos; online tokens that outlived their slot, and JSON writes that could empty `parties.json` or `world.json` (the server changes need a deploy to take effect).
- **Checked:** the whole suite through `run-tier.cjs all` passed 9,472 of 9,489 tests in 596 s. All 7 failures also fail at `e18cd9e2` or come from the Demo's single-player settings. The Demo booted in NW.js on a hidden display on 20261106.1 and on 20261105.18, reached map 1 and opened and closed the menu on both. Both showed the same shader validation error from software GL there. demo.rpgreactor.org did not answer during the session.
- **Follow-up (runtime 20261106.2, same day):** the items the first pass left are fixed: MZ event-priority blocking for one-tile events, Plugin Manager edits counted as unsaved, the open map's transfers shifted on Resize Map, fair names and battle-log membership on the online server, a byte budget on the Engine's relay, checked shots and hits in shared battles, neighbouring maps taking their host's pass, lone foliage chunks culled. Details in the changelog. The PHP was not run here (no PHP on the desktop); it needs a deploy, and a test on the server, before it is trusted.
- **Interaction audit (afternoon, editor only, not committed):** eight reviews traced clicks, drags, keys and OK/Cancel through the event editor, the command dialogs, the Database, the 2D and 3D map editors and the shell; about 75 fixes are in the changelog, the confirmed leftovers in [OPEN-ITEMS](OPEN-ITEMS.md) item 16. The 41 NW.js smoke scripts ran one at a time on a hidden display: 24 fail the same way on `e604e646` (item 17), none newly. Tests reached by the changes: 8,520 run, the 7 known failures only.
- **Documentation pass:** six reviewers checked the living docs (README, editor/README, docs/*.md other than archive, devlogs, posts and the face handoff) against the code and corrected them in place; counts, labels, menu places, file paths and today's online and battle rules now match. Not changed: the Map Properties hint "Database › Controls" (`editor/index.html`), which has translations; the physics cards are in System 2 now.
- **Tests:** `test-tiers.json` now lists every file of 20 s or more (54). The bare `node --test editor/tests/*.test.cjs` that CLAUDE.md named skipped the small-pictures preload and took about 25 minutes; CLAUDE.md now points to `npm run test:changed`, `test:fast` and `test:all`.
- **Harness:** `~/.cache/rr-tests/cdp-game.cjs --nw` now passes `--mute-audio`; two unmuted boot checks played the Demo's music on the owner's speakers.

## 2026-11-05 (laptop) — Why the laptop lost its 144, and lighter moving shadows

Runtime 20261105.10, synced, not committed. Measured on the laptop in NW.js with Demo copies, one muted window at a time; numbers and method are in the [changelog](../editor/changelog/0.99.5.md). The harness is on the laptop in `%LOCALAPPDATA%
r-tests` (`ab.cjs` interleaves variants in one window; `--project`, `--map`, `--start`, `--profile` for a warm browser profile).

- **Cause: the Demo's content, not the runtime.** Whole Demos from git on the same walk: the first room held 142 fps on 15 and 24 Oct and dropped to 78–99 on 28 Oct; the 24 Oct Demo on the 28 Oct runtime still holds 142, the 28 Oct Demo on the 24 Oct runtime does not. On 26–28 Oct the party grew to 7 (Elija, a Builder character) and the `scattered` formation shows all seven; the Grappler is worn by nearly everyone; Builder-made militia and raiders stand in North Haven. Party of 7/6/4/1 in the first room: 116/136/143/144 fps. Single player costs more than online because online the player's own character is the whole party.
- **Fixed (lossless):** rigid parts merge into one shadow stand-in (the parked tank 82 → 4 shadow draws a frame), skeletons checked once per shadow flush, depth materials keyed by morph layout. First room walking: 107 → 128 fps on the laptop.
- **Still slow:** North Haven's square, 55–75 fps on the laptop (about 600 draws, ~15 ms of main thread): the reflection capture draws a cube face every update (~130 draws, 2.5–3.5 ms there), and Builder characters remain 10–15 draws each (three garments of Elija's are not merged, hair is two passes). The motorbike (42 parts) and tank (41) are a draw per part in the main view too.
- **Owner's choice, not taken:** fewer followers (show the battle members only) or a lighter Demo party would bring the first room back to 144 at once.
- **Not machine trouble:** the CPU held ~3.9 GHz under load; Dropbox and other programs were quiet. The GPU process's seven ~20% threads are the driver's and grow with draws.
- **Runtimes .11–.18 (evening):** owner ruling: carry the load, shadows may be rough (memory: performance-program-rulings). In: crowd shadows in one draw a face, merged vehicles and built characters, one moving-shadow row, capture every second update, light volume only where the GPU is the limit, local cut changes at the rows' pace, cached disk checks for sounds, arrival without other actors' models (offline). Fixed a .11 regression (pools disposed every 2 s). First room ~143 fps, North Haven's square ~105–130 walking, full speed ~2 s after arriving. The uniform block is on since .16 (its "vanishing" characters were programs still compiling). Cold shader cache: unready programs held (.17). Harness rounds report `moved`. 2026-11-06: the owner's ~100 fps on the laptop came while playing it through Slipstream Remote (screen streaming: slipstream ~47% of a core, dwm ~34%); the harness drops to ~104 while it streams and holds 144 otherwise. Next, on the desktop: a frame that carries an update costs 8–14 ms (update ~3, shadows and capture, draw) against 6.9 ms at 144 Hz, so spread that work over the refreshes between updates; then the cold-cache first draws (three's first uniform read, ~0.86 s) and North Haven's square (~105–130 walking). Details in the changelog.

## 2026-11-05 — Crowd smoothness, slow first visits, and an open laptop puzzle

Runtimes 20261105.1–.9; what changed and the measurements are in the [changelog](../editor/changelog/0.99.5.md). Committed, not pushed.

- **Laptop puzzle:** traced on the laptop the same day; see the section above.
- **Crowd arrival (.1–.5):** square ~150 fps settled; arrival spread over frames, characters warmed offscreen, sleepers lifted out of the floor (`LyingLift`), no actor stand-ins while a look loads, the name screen wears the new character. First seconds of .5 not yet measured in NW.js.
- **Slow first visit (.6–.8):** 196 s at 8 Mbit/s before the first map; the map's pictures queued behind ~70 model downloads. Other actors' models now come after the map, four model downloads at a time: 57 s. Merged arrays were also sent with PIXI's unpack flags set (WebGL refused them); fixed. Open: a stalled audio retry piles up parallel fetches into one buffer; a first visit is ~220 MB.
- **Auto quality per device (.9):** `save/config.rmmzsave` is shared through Dropbox, so the desktop and laptop loaded each other's levels; now keyed by device.
- **Harness:** `cdp-game.cjs` refuses a busy port and closes its window when no map is reached (stray NW windows were left on the title on the owner's screen); `RR_NW_DIR=` runs another copy; `room-prof`, `proc-cpu`, `room-stats`, `slow-start`, `no-parallel`. The Demo needs `--nw` (a plugin uses `require`). Headless or one NW window at a time while the owner plays.

## 2026-11-04 — Crowd speed, built characters in a few draws

Runtimes 20261104.1–.9, all deployed to demo.rpgreactor.org and committed at the end of the day. What changed is in the [changelog](../editor/changelog/0.99.5.md); the crowd numbers are in [PERFORMANCE.md](PERFORMANCE.md#built-characters-in-a-few-draws-2026-11-04-runtime-202611049).

- **Owner reports fixed:** battle music after waking mid-battle, a shadow flickering behind a running player, waking inside a building after sleeping on its roof, the WebGL start failure (the game waits and retries), and a configurable storage cap (Database › Online, no limit by default).
- **Crowd speed:** online and offline measured the same, and nothing is rebuilt per frame. The real costs were textures uploaded at full size, draws not grouped by shader, two-pass soft hair, and a built character being 17–39 draws. `Reactor3D.LayeredParts` now merges a built character's parts at load: North Haven's square went from 1,080 to 512 draws and 13.4 to 5.2 ms a frame.
- **Open puzzle:** the owner still saw about 30 fps in the square before .9 while the test browser measured about 90 fps of headroom. Ask for their F2 numbers on .9, whether DevTools is open, and their monitor's refresh rate.
- **LayeredParts trap:** with all four picture-array samplers declared, a merged program carrying the metal shine drew cloth washed grey: the water sheen term came out non-zero. Declaring only the arrays a group uses ended it, and metal stays in its own group (`SPLIT_SHINE`). The cause isn't understood; merging metal with cloth (one draw fewer per character) needs it found first. Overlays win depth ties by file order inside one mesh, and merged meshes draw after the body (`renderOrder`).
- **Harness traps:** the runtime turns off three's shader error checks, so a broken debug shader draws nothing silently. A patched shader needs its own program key. `layered-ab.cjs` + `ab-diff.py` compare one character drawn alone, parts apart against merged.
- **GPU:** the NVIDIA driver logged channel failures again at 17:37 and 19:18 (`GspRmAlloc failed`) with none of the test browsers running. A reboot clears the WebGL error if it returns.

**Next (owner's queue):**

1. In-game creator: slow to load, sometimes shows another outfit than the one picked, no previews of species or outfits.
2. A blocky, blurry light outline around characters in front of lights, plainest in the first Reactor room (likely HalfLight's quarter-size light).
3. "Connecting…" stays in the top right while connected.
4. More speed: every material carries 64 uniforms, 60 of them the scene's, walked on every draw. Vehicles (about 40 draws each) are low priority: there are few of them.
5. Resume `build-looks.cjs` for the 22 bots still without a look.

## 2026-11-03 — Online speed, the creator's loading, crowds

The owner saw 20 fps online on a slower machine that ran at 144 offline. Runtime 20261103.8 is deployed and committed, with everything from 2026-11-02. Measurements, the method and what was ruled out are in [PERFORMANCE.md](PERFORMANCE.md#crowds-of-characters-and-online-players-2026-11-03-runtimes-202611031-8).

- **Sleepers:** the nearest 64 are drawn, one to a tile.
- **Crowds:** reflections keep 6 characters. Distance levels run on any GPU once a draw is heavy. Characters out of view or asleep keep their pose and matrices. Reflection passes warm their own shaders. Joins are paced while the map is in view.
- **Creator-built characters:** copies share materials until one changes (`ownModelMaterials`).
- **In-game creator:** downloads in parallel, keeps its build cache, and tries a list's highlighted choice on.
- **Editor builder:** thumbnails show a stand-in wearer, so sliders no longer redraw them.
- **Next:**
  - Fewer draws per built character: 17 materials.
  - GPU-compressed textures.
  - Sleepers lie half under the floor; the knocked-out pose hid them, so it was not used.
  - The in-game creator's try-on and the editor thumbnails are untried by hand.
- **Tools:** the harness is `~/.cache/rr-tests/fps.cjs` and the deploy is `~/.cache/rr-tests/deploy.cjs`, outside the repo. One browser at a time.

## 2026-11-02 — Two-player test fixes

The owner tested on two computers. Runtime 20261102.2 is deployed to demo.rpgreactor.org and was committed on 2026-11-03. The owner's own Demo edits (high quality, longer chat) are in the working tree too.

Verified on the live site in real browsers, with test accounts:

- A character built at high quality has 17 rig bones, 88 clips and mouth shapes, and 14 MB. Earlier ones stay broken until remade.
- A model released from memory came back and drew.
- A player leaving with no save woke on map 5.
- A second player saw the rider's tank and "in battle".
- With a simulated microphone, the speaker's own mouth opened to 0.43 and the listener received sound.

The wake cause is inferred: Zarcoco has one save and no `.save.bak`, which fits leaving before any save, and the failure wasn't reproduced on the old build. Not driven: a real microphone, a motorcycle ride (the tank was), and Search commands in the editor.

**Parties and shared Tactical battles followed**, runtime 20261102.31, also deployed; committed on 2026-11-03. Two browsers on the live site, with on-screen choices taken through the game's input: a party formed and its chat worked. A guest joined on the host's side, the enemies' and its own, took turns through the normal commands, and HP and positions matched on both games. Forced endings finished on both with no stray units. Three players on four sides (host, enemies, two fighting alone) took turns, reinforcements reached every game, HP matched, and the host losing no longer means Game Over. [Design and limits](DESIGN-ONLINE.md#shared-battles).

Then, on the same site: Classic battles on either side with matching HP and a clean return to the map on both games, party values, `/follow` across maps, Watch, a guest's retreat, and a host leaving with a guest taking over and a watcher following. A guest's order was tested through the game's commands, not by hand. The owner enabled `proxy_wstunnel`, so the Engine is live over WebSocket. Action and First Person are shared on all sides at 57 to 61 FPS with HP matching, and riders stay aboard in Tactical, attacking with the vehicle. Later, with real keys and mouse: guard, dodge, blade and pistol work for guests, as do mounting mid-battle, watching a real-time battle and a real-time host hand-over. **Not built:** hitting a guest's vehicle. Not driven by hand: a Tactical guest turn with real keys, and the challenger's Classic screen. Test runs must stay small (memory: resource-limits). Two-player test browsers must use the GPU and be muted: see the deploy memory. The owner wants the `E2E…` test accounts kept: they are planned as extra participants, and only sit as sleepers today. Bots can't yet fight as those accounts.

## 2026-11-02 — Character creation as game windows, sign-in, CI

The owner's New Game error was the worker missing from playtests: only deploys wrote `reactor-builder/`, and a game's page (a `chrome-extension://` origin under NW.js) cannot start a worker from the editor's folder. `stagePlaytestCharacterBuilder` now copies the Forge in when a playtest starts.

The creator and sign-in are now menu scenes, so they take the project's window skin, font and window plugins. `ReactorCharacterStudio` holds the recipe, worker and view and outlives its scene so `Scene_Name` can be visited. How it fits together, and the event command's options, are in [Online worlds](DESIGN-ONLINE.md#after-an-intro).

Traps:

- A temp Demo copy has the Demo's old `js/`: overlay `runtime/` or you test the previous runtime. On the headless display the game runs at about 2 FPS, under 1 with the creator's view, so hold keys until `Graphics.frameCount` advances.
- The Demo's two settings files are tracked, and a new project deletes them (`updateCopiedTemplateProject`), or it would join the demo server.
- `System.json` `versionId` and `project.rpgreactor` churn in the Demo whenever the editor saves. They were left out of these commits.
- `limitLegs` now runs on floor, squat and exercise poses. The kneeling stretches skip it on purpose: bringing them into range moved the approved hold's feet up to 17 cm.

Not done: a real `nwbuild` on the overridden `glob` and `minimatch`, a User Interfaces role for the creator (the same skin and font reach custom menus, their layout does not), translating the creator's in-game labels, and password reset by email (accounts have no email; the owner resets on the admin page). Two owner questions are new: B2 and B3.

## 2026-11-02 — Start 0.99.5 development

The 0.99.4 source release is published as GitHub's regular Latest release and was verified in the repository's Releases sidebar. The owner reports the announcement and pictures uploaded; the live itch.io listing confirms the 0.99.4 devlog. The concise Markdown post now embeds all six versioned screenshots, and its plain-text companion marks each image upload. These prepared copies are included in this checkpoint. Their publication does not establish native-binary validation.

The current development version is 0.99.5 across the package/lock, About/localized version, web host, import skeleton, bundled Demo metadata and runtime headers. Both changelog indexes open a new 0.99.5 file; the released 0.99.4 notes, pictures and tags remain historical. Next feature/fix entries belong under 0.99.5. There are no new user-facing features in the new cycle yet.

Runtime revision 20261101.41 and character/prop preview revisions are unchanged because this checkpoint changes version and documentation metadata. Restart the editor to see 0.99.5. Existing characters do not need regeneration solely for this bump; the 0.99.4 geometry/material/motion changes still require re-saving older generated assets where applicable.

The release CI still fails, including unresolved character checks and five moderate dependency-audit advisories. The exact under-chin shadow report, overall face/body appearance and online real-world testing remain open. Full suites stay deferred locally; version, documentation and runtime-copy checks are the closeout scope. [Checkpoint record](archive/evidence/start-0.99.5-20261102.json). Earlier work and measurements are in [the 0.99.4 handoff archive](archive/handoff/0.99.4.md).

Closeout passes eight documentation/runtime-copy checks, explicit version consistency and changed JavaScript syntax checks, plus whitespace validation. All 20 local bundled projects match the canonical runtime. No full suite, browser sweep or asset regeneration was run for this metadata checkpoint.
