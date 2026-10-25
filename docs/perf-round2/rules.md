# Shared rules for every round-2 performance agent (read fully before starting)

Repo: `/mnt/sda1/Dropbox/Family Room/SharedProduction/RPG Reactor` (quote paths: spaces). Bash is fish; use `bash -c` for bash syntax. Your temp files go in your own folder under `/tmp/claude-1000/-mnt-sda1-Dropbox-Family-Room-SharedProduction-RPG-Reactor/843e7a62-b014-4b5a-b5e7-b4b04322f2d8/scratchpad/<your-agent-name>/`.

## Goal (the owner's words)
"as buttery smooth as possible, even if people are working on shit hardware", "look good, and run good", "anything related to stutters or jitters we want fixed", "Leave no stone unturned." Weak hardware (old iGPUs, 4-core CPUs, 8 GB RAM) is the primary target, editor and games alike. Pick the smoother option yourself; never trade looks silently on a machine that can hold its frame rate; remove waste before lowering quality. Judge success by worst frames and frame-time spread, not only averages.

## Shared working tree (five agents plus one more are editing it at once)
- NEVER run git stash, checkout, restore, reset, commit, add, or anything that changes the index or tree via git. Read-only git (diff, log, show, `git archive` into your folder) is fine.
- Make minimal targeted edits with the Edit tool; never rewrite, reformat or re-save whole files (other agents are editing the same files: `runtime/reactor_3d.js`, `reactor_core.js`, `reactor_sprites.js`, `reactor_managers.js` especially). Re-read the region right before editing.
- Don't edit anything under `template/` (the owner's live Demo), don't run `editor/build-scripts/sync-runtime.cjs`, don't bump the runtime revision in `reactor_main.js`, don't edit docs or changelogs. The lead does those.
- Code style: match surrounding code, comments state behavior and invariants only (no history, no "MZ parity"), US spelling in UI text.
- Every new behavior gets a switch to turn it off (a `Reactor3D.X.enabled`-style flag or similar) and focused `node:test` tests in `editor/tests/` (look at neighbors for style; `editor/tests/helpers/` has worlds and loaders). Run tests with `cd editor && node --test --test-reporter=tap tests/<file>.test.cjs` (never pass an empty file argument; never pipe through tail). Before reporting, run the tests for every file you touched (grep `editor/tests` for the file and function names).

## Measuring (strict)
- Tools: `editor/tests/perf/nw-frame-breakdown.cjs` (modes: walk, load, spikes, passes, frozen; `--map=<id>,<x>,<y>`, `--throttle=<n>` CPU slow-down, `RR_PERF_CHROME_ARGS` passthrough), `nw-game-profile.cjs`, `nw-3d-profile.cjs`. Read them first.
- Display: `editor/tests/perf/headless-display.sh` (run in background, it prints e.g. `:1`); NW as X11: `env -u WAYLAND_DISPLAY XDG_SESSION_TYPE=x11 DISPLAY=<that> XAUTHORITY=`. Default is the Radeon iGPU (weak tier, the primary target); `__NV_PRIME_RENDER_OFFLOAD=1 __GLX_VENDOR_LIBRARY_NAME=nvidia` for the RTX 5070. Never target the owner's desktop (wayland-0 / :0).
- Wrap EVERY NW launch in `flock /tmp/rr-perf.lock <cmd>`: one NW process on the machine at a time (RAM: each harness is 1.5 to 2 GB plus GPU memory taken from system RAM). Keep each held lock short (one measurement, not a whole session), so the others get turns.
- The dev CPU is a Ryzen 9 9950X3D: also measure with `--throttle=4` and say which numbers are throttled.
- Game harnesses run on a disposable COPY of `template/Demo` (or another bundled project) in your folder, with the current `runtime/` synced into the copy's `js/` before each launch (the tools do this; check). Never symlink writable parts (data/, 3d/, css/) of the real Demo; after any run that could write assets, check `git status -- template/Demo` shows nothing new from you.
- Unfocused windows starve updates: the tools force focus emulation; keep that. Judge looks with the clock running (frozen-clock captures lie), and verify pixels against a control by numeric diff, not by eye.
- North Haven: map 5, `--map=5,83,65`. Reactor Room: map 1. Before/after runs alternated, medians of 3.
- Kill every NW/chromedriver you started (only your PIDs) and stop your display when done; leave `/tmp` clean of your copies.

## Report (concise, under ~900 words)
Per item: cause (file:line), change, before/after numbers (weak iGPU first, throttled where relevant), pixel sameness, the switch name, tests added/updated and results, one editor-changelog line (technical, names the switch) and one plain user-changelog line (no em dashes). Then: items not done or not verifiable and why, files you changed, anything the owner must check on real hardware.
