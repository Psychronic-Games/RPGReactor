# RPG Reactor 0.94.4: Responsive Web Forge and Reliable Windows Playtests

RPG Reactor 0.94.4 makes the browser editor fit real-world screens, completes persistent Forge exports on the Web, and restores test-only tools in packaged Windows playtests.

## A browser workspace that fits

The Web editor now has browser-only responsive layouts for laptop, narrow, and short viewports. Menus and toolbars scroll instead of clipping, the sidebar becomes fluid and stacks above the workspace on very narrow screens, and the welcome screen, splash screen, status information, save banner, and Playtest window remain inside the visible area.

Database, Event Editor, Map Properties, Image Picker, and general modal layouts also reflow and remain scrollable. These rules are scoped to Web packages, so the established desktop NW.js layout and minimum window sizing do not change. The unsupported Build menu is removed from the browser edition rather than exposing actions it cannot run.

## Forge output that belongs to the project

Forge tools can now write binary and multi-file output through the browser host. With Reactor One or another active browser project, generated files go directly to their normal project locations and flush to IndexedDB:

- Character sheets and generated Outfit/Hair parts
- Animation Generator PNG sheets and animated GIFs
- Sound Effect Generator WAV files
- Effekseer effects with baked, procedural, and user-text textures plus generated models

Those files survive reloads and are available through the same project overlay used by Playtest. When no project destination exists, single-file exports use the browser save picker or download fallback, while multi-file exports use a directory picker and preserve their nested resource paths.

Web editor distributions now also bundle the Outfit Engine, Hair Engine, and every built-in Character Generator style-part script in dependency order. The browser Character Generator can therefore load the complete built-in roster without Node.js module access while still recognizing project-specific parts from the virtual filesystem.

## Saved edits in the first Playtest

The browser editor now waits for the project-overlay service worker to control the page before completing startup. If first-time installation requires it, one guarded reload establishes control without creating a reload loop. This closes the gap where Playtest could start during the first editor session before newly saved IndexedDB files were visible.

## Windows test tools restored

Isolated Chromium profiles prevented RPG Maker from recognizing packaged Windows Test and Battle Test launches. Windows NW.js retained the `--user-data-dir` switch as its first application argument, while RPG Maker only inspected that argument for `test` or `btest`; the separate mode argument was ignored. Test-only plugin interfaces, including Sang Hendrix hover docks, were never created as a result.

Windows profile paths now include a sanitized ampersand-delimited mode token in that first argument. Test and Battle Test retain separate per-project, per-runtime profiles while RPG Maker and test-gated plugins correctly detect the launch mode. Linux and macOS profile naming is unchanged.

Regression coverage now checks responsive Web scoping, browser save destinations and fallbacks, Character Generator asset bundling, service-worker startup control, Forge project paths, and Windows mode-bearing playtest profiles.

## Pick animations by watching them

Skills, Items, and Weapons now assign their animations through a two-column picker: a searchable list on the left and a live playing preview on the right. The preview plays MV sprite-sheet animations and Effekseer effects alike — the same rendering the game uses — so you choose effects by watching them instead of guessing from names. Database entry lists also gained framed mini icons beside every name: item and skill icons, actor face portraits, and enemy battler thumbnails, making long lists scannable at a glance.

## Sturdier MV battles

A day of battle testing against a large commercial MV project closed out a set of runtime issues. Battle Test now launches into battle on every platform (the launch flag was hidden behind Chromium switches on Linux and macOS, the same family of bug as the Windows fix above). MV damage popups no longer black-screen the battle by destroying their shared digit bitmap. Selection cursors clamp to their windows the way MV clamped them, MV battle-window metrics apply to the correct window classes, and the window layer honors the UI box size MV plugins declare — so command highlights stay inside their boxes and windows line up with HUD art again. Effekseer effects also render aspect-correct on widescreen resolutions (spheres are round, not ovals) and survive window focus changes without visual artifacts.

Source and complete release history are available in the [GitHub changelog](../../CHANGELOG.md). The full technical list is in the [editor changelog](../../editor/CHANGELOG.md).
