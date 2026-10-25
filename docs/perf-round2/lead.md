# Perf round 2: lead checkpoint (paused 2026-10-14, night)

**Update 2026-10-15: merged.** The code work, the merge checklist (fixes, runtime 20261014.4 synced to all 16 projects, docs, changelogs, full suite) and the commit were finished on the Windows machine with Node tests only. What is left is measuring in the game on Linux: PERFORMANCE.md › "Still to measure", with each item's steps in its own file's Next steps. The sections below are the overnight state, kept for the harness recipes. Delete this folder once the measurements are done.

The owner paused for the night after ~4 h of agents. Resume in the morning. Everything is in local WIP commit bf2b82bc on `main` (parent d249fad2), plus a second commit adding these notes; nothing pushed. Follow them with the real commit after the merge checklist.

**Where things are (all inside the project folder, so Dropbox carries them to another machine):**
- These notes: `docs/perf-round2/` (tracked in git). Start with this file, then the agent's own file.
- Evidence, scripts, logs, screenshots, baseline runtime copies: `scratchpad/perf-round2-checkpoint/` (gitignored, Dropbox only). Subfolders `2d-path/`, `frame-pacing/`, `startup-memory-scripts/`, `threads-evidence/`.
- Paths under `/tmp/claude-1000/...` in the agent files were on the Linux dev machine and are gone after a reboot; anything essential was copied into the scratchpad folder above.
- Delete `docs/perf-round2/` in the real commit once the round lands (fold what matters into PERFORMANCE.md, STATUS, HANDOFF, changelogs).

**Standing owner rules the agents follow** (from the previous session's memory, which a new machine won't have): smoothest on weak hardware wins, never put a smoothness trade-off to the owner, pick the smoother option and report it; ask only when authored content or a chosen look changes. Never disable plugins; plugin compat lives in shims, not plugin edits (the owner's own PSYCHRONIC_* plugins may be edited). Changelogs and devlogs: no em dashes, US spelling. No `git stash`/`checkout`/`restore` while agents share the tree. Harness windows never on the owner's desktop. Push or release only on the owner's explicit go. Tests run unpiped (`node --test ... > log 2>&1`, check `# fail`).

## Agents and their checkpoint files (this folder)
| Agent | ID (only resumable in the original session on the dev machine) | State | File |
|---|---|---|---|
| Models/textures | abeb9dc022c19af86 | DONE (all 3 follow-ups) | summary below |
| Frame pacing | a0fa98ec7e13297a0 | first pass DONE; battle-start follow-up paused | frame-pacing.md |
| Startup/GPU/memory | a98e8bba307f90e6d | first pass DONE; 2 memory follow-ups paused | startup-memory.md |
| 2D path | a880b7f37fb10b81c | paused mid-work | 2d-path.md |
| Threads/render-in-worker | a842d5b39f81ffc75 | paused mid-work | threads.md |
On another machine or a new session, start fresh agents with the agent's file plus `rules.md` as the brief. The harness rules (headless KWin display, X11 env) are Linux-only; on Windows, run harness work only on a machine and display the owner isn't using.

## Done earlier today (in the WIP commit, part of the same merge)
- Reactor core effect (fresh project = Demo): editor quad sized to main pass target, blink fix, fallback lit-length. Files: MapEditor3D.js `_placeEffectQuad`, AnimationPreviewLayer.js, reactor_3d_effects.js; test map-effect-loop-and-placement. Needs the Windows tester to confirm.
- Camera aimed once (reactor_sprites.js), TURN_RATE 0.33; test camera-aimed-once.
- Round 1 perf (HalfLight on water, SceneWalk, Shadows.casterOnly, skipUnchangedFrames, SharpUpscale.inComposite, staged Arrival, Battle Room billboards, editor light caps). Docs already written for round 1.
- Harness desktop guard in editor/tests/smoke/webdriver-client.cjs + harness-desktop-guard test.

## Models/textures (DONE) summary
- weakTextureSize 1024 (236→60 MB), GlbCompact + ImageWorker.embeddedBytes (220 ms→0), FingerSkin worker (134 ms→0), banded uploads 4 MB/frame.
- ShaderWarmup.editorResample (editor resample in worker; old way was already ~1 ms).
- `editor/build-scripts/drop-unsampled-images.cjs` run on 13 Demo GLBs: 124.5→69.6 MB, 0 differing pixels.
- KTX2 opt-in: Reactor3D.KTX2 (BC7/ETC2/S3TC, worker transcode), import option + per-model button, RRTextureCompressor; runtime/libs/basis (584 KB), editor/libs/basis (3.4 MB); THIRD_PARTY_NOTICES entry. Memory 236→156 MB at 2048 (6 actors). +3.8–4.9 MB per converted file. Dialogs not clicked through.
- Changelog lines: editor "model sheets over the cap resampled in the image worker (ShaderWarmup.editorResample)"; "KTX2 copies at import or per model; runtime transcodes to BC7/ETC2/S3TC (Reactor3D.KTX2)". User: "Demo models are 55 MB smaller with no visible change"; "optional compressed textures use a quarter of the graphics memory".

## Merge checklist (when every agent is done)
1. Leftover processes: `pgrep -af '[n]wjs-linux/nw'`, `pgrep -af '[c]hromedriver'`, `pgrep -af "kwin_wayland [-]-virtual"`; `git stash list` (4 old Sept stashes are pre-existing); `git status -- template/Demo` (expected: 13 GLBs, MegaSkills plugin if frame-pacing did item 2).
2. `git add` new files: editor/src/utils/TextureCompressor.js, runtime/libs/basis/*, editor/libs/basis/*, editor/build-scripts/drop-unsampled-images.cjs, all new tests (gpu-switches, editor-memory-release, frame-pacing, frame-garbage, compressed-textures, model-memory-uploads, etc.). `git add -A` covers them.
3. Bump RPG_REACTOR_RUNTIME_REVISION in runtime/reactor_main.js (both lines 4 and 7) to 20261014.4 (or next), then `node editor/build-scripts/sync-runtime.cjs` (fixes project-manager "Demo carries the runtime byte for byte").
4. Known failing before merge: shadow-maps #15 and editor-playtest-pause #3 (MapEditor3D.js render code, several agents edited it), reactor-3d-foundation #24. Investigate after sync.
5. Docs: STATUS runtime revision line (says 20261014.3), editor changelog line 3 "Runtime 20261014.3", round-2 entries in editor/changelog/0.99.1.md + changelog/0.99.1.md (no em dashes, US spelling), docs/PERFORMANCE.md round-2 section, STATUS open work, HANDOFF one ≤4 KB dated entry (docs-budget test).
6. Full suite: `cd editor && node --test --test-concurrency=2 > <scratch>/full-suite-N.log 2>&1` (no tail pipe), check `# fail`; `node .github/scripts/check-syntax.cjs`; `git diff --check`.
7. One commit, `git add -A`, message ending `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push.

## Owner checks (real hardware)
1. Windows laptop (i5 + RTX 3060): open a project once, playtest, Task Manager GPU column should show the RTX; editor 3D on the RTX; unplug charger mid-game; playtest 5 s then back to editor, 3D view returns < 1 s.
2. 180 Hz monitor: walking smoothness (Graphics.FramePacing).
3. Black Hole animation model: normals now correct, so it looks different.
4. Discord tester: reactor beam position and blink on Windows.
5. 1024 textures in close/first-person cameras; banded uploads on Windows ANGLE.

## Harness rules (all agents)
Headless display `editor/tests/perf/headless-display.sh`; X11 env `env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 DISPLAY=<:N> XAUTHORITY=`; `flock /tmp/rr-perf.lock`; one NW at a time; never the owner's desktop (webdriver-client now refuses); never edit a script while it runs; no git stash/checkout/restore.

## Lead decisions for the morning
- 2D path: YES, attempt chunk painting when UltraMode7 is installed but inactive on the map (Demo has it enabled, so its 2D maps miss the fast path). Snapshot stock tilemap methods before plugins load and compare; fall back whenever a hook doesn't pass straight through. Also look at VisuMZ CoreEngine's two replaced draw functions (chunk-compatible equivalent?). Never disable plugins.
- Frame pacing: Game_CharacterBase.evenShapes rebuilds loaded characters in one field order; before merging, load real saves with plugin-added fields (Star Shift Rebellion save file11, Demo saves, a 0.99.0 save) and confirm 0.99.0 loads a new save. Items 1-4 still unmeasured.
- Startup/memory: SHARE_EFFECT_MEDIA (MapEditor3D.js) has no test yet; 2 remaining videos ~1.95 GB on Linux (owner checks Task Manager on Windows).
- Threads: hull worker done (Tactical worst frame 337→66 ms); SharedArrayBuffer needs no code; render-thread prototype works, off by default (main thread 5.4→2.7 ms, 26.8→9.5 ms at 4x). Next: draw-on-arrival as prototype default, rerun A/B, gap list. tactical-view.test.cjs:454 breaks on frame-pacing's F.anyEventStarting change (fix at merge).

## Continue tomorrow (all in-progress work, in order per agent; details in each agent's file)
- 2D path (2d-path.md): rerun walk A/B on final code; rerun battle allocation profile; write report; then chunk painting with UltraMode7 installed but inactive (approved above).
- Frame pacing (frame-pacing.md): 4x throttled battle-start spikes run measuring replaceRefs/HUD classes, MegaSkills logging switch, GripMemo + HullWorker.idleCopy; pixel check of Action HUD; live save/load check for evenShapes (incl. SSR file11 and a 0.99.0 save); Node tests for items 1-5; Effekseer shader warm-up not done; final report.
- Startup/memory (startup-memory.md): test for SHARE_EFFECT_MEDIA; measure one video's cost; game vs editor on Reactor Room at weak and 2048 tiers; share videos in the 2D model preview; free 2D PIXI GPU data when 3D takes over and measure the return hitch.
- Threads (threads.md): draw-on-arrival as prototype default; rerun today/prototype A/B; gap list with estimates (draft says 2-3 months to production). Optional worker candidates: neighbor-map building (57 ms, 110-210 throttled), collision masks, foliage chunks.
- Merge (lead): checklist above, plus fix tactical-view.test.cjs:454 (F.anyEventStarting), shadow-maps #15, editor-playtest-pause #3, reactor-3d-foundation #24, map-elevation; runtime sync; docs; full suite; real commit on top of bf2b82bc.
