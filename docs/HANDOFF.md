# Handoff

Read [STATUS.md](STATUS.md) for open work. Earlier: [archive/handoff](archive/handoff/).

Changes belong in the editor changelog; behavior goes in the commit message and the guides. Size limits and the rollover are in [README.md](README.md#keeping-status-and-handoff-short); `docs-budget.test.cjs` enforces them.

## Where things stand (2026-11-17)

- **Development:** 0.99.7 is open since 2026-11-16 (runtime **20261117.11**, synced into all 17 bundled projects on 2026-11-17; NW.js **0.120.0** pinned and in `nwjs-win` and `nwjs-linux`; `nwjs-mac` still 0.107), committed on 2026-11-17 (`ff1a7339`), not pushed. 0.99.6 was released on 2026-11-16. CI is green on GitHub since 2026-11-16. What 0.99.6 still needs seen: [OPEN-ITEMS](OPEN-ITEMS.md) items 22, 24, 26 and 27. The Demo in the tree is single player with the creator off, its backend Auto (the owner's): say so before a deploy.
- **Windows machines:** two laptops work in this folder: the Iris Xe one (i5-1145G7) and an MSI with an RTX 3060 Laptop beside an Intel UHD (i5-10500H). Both now hold all 17 bundled projects, so the sync can run on either. The Iris Xe's games start on OpenGL by its own record (11-10); Vulkan shows there since 11-16, and on the RTX 3060 since 11-17.
- **Published:** [0.99.6](https://github.com/Psychronic-Games/RPGReactor/releases/tag/v0.99.6) is the Latest source release, with six pictures. Its itch.io devlog is drafted ([Markdown](posts/itch-devlog-0.99.6.md), [plain text](posts/itch-devlog-0.99.6-plain.txt)) and not posted: posting it is the owner's. Signed native binaries remain a separate pipeline.
- **Verification:** the whole suite on the desktop on 2026-11-13, before the day's second commit: 9,793 of 9,804 passed, 11 skipped, none failed (5.8 minutes). Substantial checks go through `codex-check`.
- **Live demo:** demo.rpgreactor.org is the owner's new VPS since 2026-11-15 (Debian 13, Node and `proxy_wstunnel` on: the live Engine runs), at runtime 20261115.12, a fresh world: the owner's account and one kept test account, `E2EChat1`. Admin: `/reactor-online/admin`, password in the server's `reactor-online/config.php`. Deploy from the desktop: `deploy-vps.cjs`, about a minute.
- **Forge:** Character Preview **98**, Props **62**, clothing Preview 61. Appearance remains under review. [Face handoff](HUMAN-FACE-HANDOFF.md#current-candidate--preview-98).
- **Faces:** the owner works on them in a separate session with another model, which may edit this tree. Leave face code alone unless asked, and check `git status` before scripted edits.
- **Resume:** use [OPEN-ITEMS.md](OPEN-ITEMS.md) and [STATUS.md](STATUS.md#open-work). Preserve fixed gameplay timing. V-Sync is on by default since 2026-11-17, a project setting; F2 still shows what the machine could draw.

## 2026-11-17 (desktop) — Pull requests 87 and 88 merged

Runtime **20261117.11**, synced into all 17. Xehanort88's `.opus` audio (87) and never downgrading a project's runtime unasked (88), merged from GitHub into the local work: the format lists keep both `.opus` and `.jxl`, and their entries moved from `editor/CHANGELOG.md` (now an index) into the 0.99.7 changelog, without a stray branch name line 88 left there. Not pushed.

## 2026-11-17 (desktop) — Event borders and names at every zoom

Editor only, not committed. Names are fitted to their square too (`eventNameText`): as large as the tile allows, smaller for long names, an ellipsis only past the smallest size; seen on the Demo's map 7 (`event-zoom.cjs --names`). The owner's report: zoomed out, event borders drew on some sides only. They are one screen pixel at any zoom now (`pixelLine`, as the grid). Measured before and after in the editor (`event-zoom.cjs`, `--old`). [Changelog](../editor/changelog/0.99.7.md).

## 2026-11-17 (desktop) — Hendrix lighting stops the game

Runtime **20261117.10**, synced into all 17, not committed. [Changelog](../editor/changelog/0.99.7.md).

- **Players' report:** `Cannot read properties of null (reading 'indexOf')` from Hendrix 3D Light and Shadow's `_syncRim`. PIXI 8 throws when filters or a mask are set on a destroyed object; PIXI 5 did nothing. `pixi_compat.js` now does nothing too. Seen on a destroyed sprite in the game; not reproduced through the plugin (its rim light needs light shafts nearby).

## 2026-11-17 (desktop) — JPEG XL pictures

Runtime **20261117.9**, synced into all 17, not committed. [Changelog](../editor/changelog/0.99.7.md).

- **The owner's request:** `.jxl` usable now that NW.js decodes it, for the future (old plugins do not matter). Taken wherever `.webp` is, in the runtime, the editor and the builds; not for 3D model textures (GLB), materials or Effekseer.
- **Seen:** a `.jxl` shown by Show Picture in a copy of the Demo, the same as its PNG. Lossless JXL is exact; Chromium rounds semi-transparent pixels by at most one level.
- **Harness, new:** `~/.cache/rr-tests/jxl-game.cjs` (under `nw-hidden.cjs`, `RR_RUNTIME=1`).

## 2026-11-17 (desktop) — Rebellion's Moletown: drift, stray tiles, a slow map

Runtime **20261117.8**, synced into all 17, not committed. Causes and numbers: [changelog](../editor/changelog/0.99.7.md).

- **Events off their tiles** (the owner's report, back since the 11-01 fix): sprites are placed before the game moves, and the frames between updates moved them from the wrong place. Fixed (`FramePacing.posed`), with a one-pixel rounding fix in `screenX`/`screenY`. Measured: none off in about 7,000 frames.
- **Stray and missing map pieces:** a likely cause found by reading and fixed (a tile block's buffer sent short); not reproduced, so the owner's play decides.
- **The slow map:** 134 hidden event labels each drew a filter pass; they are parked now. 210 to over 1,000 frames a second in the copy.
- **Harness, new:** `rebel-drift.cjs` under `nw-hidden.cjs` with `RR_PROJECT="Star Shift Rebellion"` (`--prof`, `--ab`, `--warm`, `--order`). It copies the owner's saves into the copy: Rebellion stops on a start without them.
- **For the owner:** Moletown on the real screen.

## 2026-11-17 (desktop) — V-Sync as a project setting

Runtime **20261117.7**, synced into all 17, not committed. [Changelog](../editor/changelog/0.99.7.md).

- **The owner's request:** players report tearing; vsync back without losing F2's count of what the machine could do. Built as Database > System 2 > Advanced Settings > V-Sync, **on by default** (the owner, after seeing it); with it on the frame limit's clock stands aside and F2 shows the capable figure.
- **Seen by the owner** in Star Shift Rebellion on the desktop's 180 Hz monitor: more even, the real frames still on F2. Not seen: the Demo with it (its manifest's no-vsync switches taken out by hand, as the editor does at the next open), either laptop, a 3D map under load. Every project loses the switches at its next open or playtest unless V-Sync is unticked.
- **Tests:** `gpu-switches.test.cjs`, `frame-limit.test.cjs`.

## 2026-11-17 (desktop) — Rebellion stopped at start

Runtime **20261117.5**, synced into all 17, not committed. [Changelog](../editor/changelog/0.99.7.md).

- **The owner's report:** Star Shift Rebellion stopped at its first Conditional Branch. YEP_CoreEngine calls the command it replaced with no arguments, and the vehicles' branch wrap read `params[0]`. Twelve Reactor command wraps now fall back to `this._params`. Not seen: Rebellion starting.
- **Tests:** `vehicles-plugin-surface.test.cjs`.

## 2026-11-17 (RTX 3060 laptop) — mirrors, map loads, F2

Runtime **20261117.4**, synced into all 17, not committed. Detail in the [changelog](../editor/changelog/0.99.7.md).

- **Mirrors (.3, .4):** the Mirror Room (map 2) now repeats without end, darkening each reflection; no sky or black walls. Past the depth, each mirror shows its last frame's whole picture; walls seen in a mirror get slots; the capture sees mirrors too. For the owner to see: the room in play, a mirror beside water, the Iris Xe.
- **Map loads (.2):** a loading map's Builder characters send their texture layers 8 ms a frame instead of one a frame; they are done before the map shows. The load itself (8 s, North Haven) is its main thread's work; next to try: the warm-up's reflection captures (0.7 s).
- **F2 (.1):** the number centred. Processor pressure was tried and taken out: Chromium sends none to a busy page.
- **Traps:** the first launch after a runtime sync failed four times today (a grey or black window): launch once to waste. `readRenderTargetPixels` on a mirror target read all black here. In the harness, `--user-data-dir` is what moves a browser profile; `LOCALAPPDATA` moves only Node's.
- **Harness, new:** `vk3060\mirror.cjs` (`--face=8`, `--evalfile`), `loadprof.cjs` (`--map --trace --keep --d3d11 --nolimit --fsread`), `trace-sum.cjs`, `prof-inclusive.cjs`, patches `arrival-patch.js`, `finger-patch.js`.

## 2026-11-17 (RTX 3060 laptop) — NW.js 0.120.0

The owner's request: the editor and games on the newest NW.js with its proprietary codecs. Pins, provenance and what was seen: [changelog](../editor/changelog/0.99.7.md). Not committed.

- **Done:** every pin moved to 0.120.0 (Chromium 157, Node 26.12.1), the codec provenance recorded, `nwjs-win` here replaced (0.107.0 kept at `%LOCALAPPDATA%\rr-tests\nw120\backup-nwjs-win-0.107.0`). Seen: the editor's welcome page, the Demo on Vulkan, video as before, no frame-rate change past the spread.
- **Linux, done on the desktop (2026-11-17):** `nwjs-linux` is the 0.120.0 SDK with the codec build's `libffmpeg.so`, both downloads hash-checked. Seen on the hidden display: a real H.264 and AAC file plays to its end (60 frames, sound decoded) where the stock library stops with a decode error; Rebellion boots and walks. The old folder is at `/mnt/sda1/rr-nw-backup/nwjs-linux-0.107.0` (outside Dropbox). The editor runs from the same folder: `nw-editor-save` and `nw-keyboard-menus` pass on it (hidden display, Chromium 157). The owner's editor profile as 0.107 left it is at `/mnt/sda1/rr-nw-backup/rpg-reactor-profile-0.107`. Not done: the whole suite on it; the owner's editor seen on the real desktop.
- **Mac, still to do:** `nwjs-mac` is 0.107 (Chromium 144). `nwjs-sdk-v0.120.0-osx-arm64.zip` (sha256 `09f1ff602fd0ba4aa5e8d48818f56096713787ef0210cfefbdc446ce16255364`) and `0.120.0-osx-arm64.zip` (`3b6d0a6bc6789f1128426d8a3047810ae6056620d11fbd638620762f99d41ac5`), unzipped with a tool that keeps links (`unzip` or `ditto`), the dylib where `nw-codec-utils` puts it.
- **Harness (desktop), new:** `~/.cache/rr-tests/nw120/` holds the downloads and `app/` (plays `test.mp4` and writes what was decoded).
- **For the owner:** the editor from the folder keeps one profile (`%LOCALAPPDATA%\rpg-reactor`); after its first start on 0.120, 0.107 cannot open it. Pointer lock in the 3D camera and action battles: Escape may no longer release the mouse (NW.js 0.112).
- **Harness:** `%LOCALAPPDATA%\rr-tests\nw120\`: `fetch.sh` (downloads, hash-checked), `editor-smoke.cjs`; `vk3060\vbench.cjs` takes `RR_NW` to run another NW.js. A run's browser profile needs `--user-data-dir`: `LOCALAPPDATA` in the environment reaches Node only.

## 2026-11-17 (RTX 3060 laptop) — Vulkan's black window on NVIDIA, and video decoding

Editor and Demo manifest only, runtime unchanged (20261116.4), not committed. Causes, numbers and method: [changelog](../editor/changelog/0.99.7.md).

- **The owner's report:** the Demo on Vulkan, which had drawn on this machine, opened a black window. The graphics process crashed at the window's first resize (the game sizes its window at start) and could not take the window back. A bare WebGL page does the same; it is ANGLE's swapchain maintenance extension. A Vulkan manifest's switch is now `--disable-angle-features=supportsGraphicsPipelineLibrary,supportsSwapchainMaintenance1`, and yesterday's narrower switch is widened at the next playtest.
- **Seen:** the Demo's manifest as it stands, on a copy: the title, the first map and a resize in play, on the real window, in three runs. Not seen: the Iris Xe with the wider switch, Linux, an editor set to Vulkan, the owner's own playtest.
- **Video:** on Windows, Vulkan decodes video in software whatever the switch (Chromium picks `FFmpegVideoDecoder`); hardware decoding is Direct3D 11's alone here. The CPU cost of that was not measured.
- **Harness (RTX 3060 laptop), new:** `%LOCALAPPDATA%\rr-tests\vk3060\`: `run.cjs name [--asis] [--backend=] [--play] [--video] [--series] [--bare=resize|maximize]` (a copy of the Demo with its own `LOCALAPPDATA`, so the owner's record is untouched; window pictures by `shot.ps1`, `PrintWindow`), `gpu-engines.ps1` (GPU engine use by adapter and process), `videos-patch.js`.
- **Tests:** `gpu-switches.test.cjs`, `graphics-backend.test.cjs`, the docs pair.

## 2026-11-16 (laptop) — Vulkan shows on the laptop

Runtime 20261116.4, synced into the laptop's Demo only (run the sync on the desktop), not committed. Causes, numbers and method: [changelog](../editor/changelog/0.99.7.md).

- **The owner's report:** the Demo set to Vulkan opened a blank window. Two causes. (1) Under Windows nothing of a Vulkan window reaches the screen through DirectComposition: a Vulkan project's manifest now carries `--disable-direct-composition` (`ProjectManager.WINDOW_PRESENT_ARG`; the editor's launcher too). (2) three.js's one upload of a mesh's morph targets lost the device: on Vulkan an array texture is filled a layer at a call (`Graphics.LayerUploads`, `reactor_core.js`). The Demo's setting is Vulkan (the owner's); the new switch in its manifest was written by hand, as the editor would.
- **Then snow over the lights** (the owner, once the window showed): Vulkan's pipeline libraries fill the pixels on a shared triangle edge twice on this card, so the lights' glow, drawn small and blended, showed its triangles as blotches. A Vulkan manifest now also carries `--disable-angle-features=supportsGraphicsPipelineLibrary` (`ProjectManager.PIPELINE_LIBRARY_ARG`; the Demo's by hand): the glow's small picture then counts the same as OpenGL's, and the first room ran no slower. The desktop's Vulkan gets the switch too, not measured there.
- **Seen:** the Demo's manifest on a copy, started as the editor starts a playtest: the title and the first room on the real screen, no loss in 50 s. Not seen: the owner's own playtest, an editor set to Vulkan.
- **Measured, first room, same fixed levels, warm, picture on the screen:** Direct3D 11 44.5 and 45.0 frames a second, Vulkan 42.2, 42.5 and 40.9, OpenGL 38.5 and 37.9, Direct3D 11 on 12 39.4 with many long gaps. **North Haven** (a new game started there, `nh-batch.sh`): standing, Vulkan 39 to 46, OpenGL 37 to 40, Direct3D 11 40 to 41 with many long gaps (10 on a first start); walking with Auto, Vulkan 59 with one long gap, OpenGL 54 and 58, Direct3D 11 43.5. Pipeline libraries off cost no stutter there.
- **Audit, North Haven at the full picture** ([changelog](../editor/changelog/0.99.7.md)): the card 21 ms a frame, half of it geometry, the page thread 18. Two of five things left to try are built: with nothing known of the card, Intel's integrated graphics starts on OpenGL (`ReactorBackend.startOf`, .2); the light split on the Xe is found by a trial in play (`HalfLight.Trial`, .3), which left it out here (a trade with Auto). A closer off-screen test for characters is built, left off (.4).
- **Corrected:** "the picture on screen" after the first fix, and 11-15's "a bare page draws on Vulkan", came from the debugger's picture, which reads the page inside the browser; the screen showed nothing. Direct3D 11, which stopped starting in the harness earlier that day, started again later without a restart; cause not found.
- **Harness (laptop), new:** `real-look.cjs name` (the game as the editor starts it, the window off the screen); `perf-run.cjs backend [--profile] [--auto] [--real]`; `nh-batch.sh` (North Haven); `first-start.cjs` (an empty record); `vk-go.sh`, `vk-block.sh name 'regex'` (WebGL calls left out by name), `vk-morph.sh` (the bare page), `vk-features.cjs`, `vk-snow.sh name [features,off]` (the glow's picture counted); `cold.cjs --steps=file.cjs` (one thing switched at a time). `Demo-cold` is laid by `cold.cjs prepare`.
- **Traps:** a screen picture holds whatever window lies on top (the owner's, twice). A fault in two stages of a frame is not found by eye one switch at a time: count the first stage's own picture. WebGL's `finish()` is a flush in Chromium and a lost device shows only at the next submit, so a wait after each call names the wrong call. Files in `rr-tests` are written with node or the Write tool, not a shell here-document (quotes and backslashes are lost).
- **Tests:** `layer-uploads.test.cjs`, `gpu-switches.test.cjs`, the docs pair.
