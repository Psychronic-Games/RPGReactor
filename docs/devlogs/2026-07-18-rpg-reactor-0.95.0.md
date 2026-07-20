# RPG Reactor 0.95.0: A More Complete Editor

## Bundled Forge content

Psychronic and Looseleaf are bundled Character Generator styles, with
Psychronic selected by default. Ordinary project PNG style folders remain
supported, and project JavaScript styles load automatically. Portal is available
in both animation generators. The Forge registries contain 76 Animation
Generator recipes and 106 Effekseer recipes, including 15 Energy recipes.

RPG Reactor-owned code is MIT-licensed. Bundled third-party components retain
their respective licenses as recorded in `THIRD_PARTY_NOTICES.md`; the project
does not claim one uniform license for third-party or user/project content.

The current unpublished RPG Reactor 0.95.0 development cycle fills in major parts of the editing and compatibility surface rather than centering on one subsystem. The database now uses the available screen more effectively, Types and Terms have dedicated workspaces, Conditional Branch covers the complete MZ condition model, advanced event commands go beyond the stock MV/MZ authoring surface without abandoning its data format, localization is source-audited across every supported language, and MV save and plugin compatibility received targeted runtime repairs. The cycle also retains the large-map, structural editing, preview cleanup, and deep-audit work completed so far. This document remains a draft until 0.95.0 is tagged and published.

## Localization checked against the editor source

The editor supports 18 languages: English, Japanese, Spanish, Traditional Chinese, Simplified Chinese, Russian, Portuguese, German, French, Greek, Korean, Arabic, Italian, Polish, Indonesian, Vietnamese, Thai, and Turkish. Localization coverage is now checked against statically routed text in the editor source, including labels and hints supplied through UI schemas, instead of relying only on dictionary key parity. Tests also verify that every locale carries the same literal, event-command, and section-name keys and preserves interpolation placeholders. The Options Palette picker now has localized theme names and descriptions instead of silently inheriting English in seven locale tables, and high-visibility tests guard every palette description. Last Action Data choices and Troop Lower/Upper Layer labels have explicit translations with no-English-fallback checks in every non-English locale. Arabic sets the document to right-to-left layout while the other supported languages remain left-to-right.

## Two project windows can exchange authored data

Like MZ, Reactor can keep two different projects open and copy authored data from one into the other. Its typed cross-instance clipboard now carries whole maps; single or multi-selected batches from every top-level database category from Actors through Common Events and Tilesets; individual trait/effect rows; whole map events; event pages; command blocks shared among map, Common, and Troop events; troop battle pages; movement-route commands; and plugin groups. Database rows support Ctrl/Cmd toggles, Shift ranges, Select All, and ordered batch Cut/Copy/Paste. A batch fills consecutive destination slots and retains those slots' IDs, while list refresh preserves selection and viewport position. Category and payload types prevent an Actor from being pasted into Skills or a movement command from being treated as an event page. Trait/effect references to database entries and project-defined Types resolve by unique exact name in the receiving project, and a missing or duplicate match rejects the paste rather than silently keeping an unrelated source ID. The newest shared payload takes priority over stale clipboard state in the receiving window.

The transfer is intentionally data-oriented. Outside the trait/effect references described above, numeric references and asset names remain exactly as authored, so the destination project must contain the matching switches, variables, database IDs, graphics, audio, and other resources. Reactor still prevents opening the same project in two processes; this workflow is for exchanging data between separately opened projects.

## Project paths and filenames are Unicode-safe

International projects exposed two asset-browser assumptions. The compact Tileset editor could lose its project path when no map renderer had initialized, then report that every A-E tab had no assigned images. Its image paths also used raw `file://` strings. The editor now retains a dynamic project context and routes every Tileset thumbnail, tab, canvas, and full preview through encoded native or Web asset URLs, including Unicode, spaces, `#`, and other URL-significant characters.

The Audio Player's left filename rail is Unicode-aware as well. Normalized initials such as `É`, `Ü`, `Ω`, `Ж`, `不`, `あ`, and `한` receive their own sections with locale-aware ordering. Canonically equivalent composed and decomposed accents share one section, while numeric and punctuation prefixes remain under `#`.

## Asset folders can be organized recursively

Project assets no longer have to sit directly in the standard RPG Maker folders for the editor to find them. One shared recursive index now backs BGM, BGS, ME, and SE browsers; animation sheets, Effekseer effects, and timing sounds; character, face, battler, tileset, battleback, parallax, and title-image pickers; movement-route sounds; and plugin file parameters. A nested file such as `audio/bgm/Boss/Phase 2.ogg` is stored as the RPG Maker-compatible name `Boss/Phase 2`, without its extension and with forward slashes even on Windows.

The index uses deterministic extension priority when several plugin-file formats share one relative name, does not follow symbolic-link directories, and retains the actual discovered filename for previews. Core RPG Maker selectors expose lowercase `.ogg` and `.png` files because those are the extensions the runtime reconstructs on every platform. Encoded asset URLs keep Unicode, spaces, and `#` working in both desktop and browser-hosted editor surfaces, and the Web overlay reports the correct MIME types for supported image and audio responses.

Character-sheet markers are path-safe too. The editor now checks the final filename rather than the beginning of the whole relative path, so `People/$Giant` and `Doors/!$Iron Gate` retain the same single-character 3x4 frame layout as root-level `$` and `!$` sheets. The shared rule covers frame selection, actor and event previews, map sprites, charset-backed enemies, troop previews, animation targets, and balloon previews.

## Character and image pickers are searchable

Large character libraries no longer require scrolling one filename at a time. The shared actor character, face, SV battler, enemy battler, vehicle, and animation-image picker; the event character-frame picker; and the Show Text faceset picker now filter live by the complete relative path. Matching ignores case and accent marks, so a plain query can find a decorated Latin filename, while nested folder names remain searchable too.

The same Unicode grapheme grouping used by the Audio Player now appears as a narrow clickable rail beside these lists. Latin, Greek, Cyrillic, CJK, kana, Hangul, and other letter initials receive their own locale-ordered sections, while numeric, punctuation, emoji, `$`, and `!$` entries use `#`. Sticky headers and active-section tracking preserve context while scrolling, and every result is keyboard-selectable. Reopening an event character also restores its exact character index, pattern, and direction; stale image loads are generation-guarded so rapid file changes cannot attach an old frame to a new filename.

System 1 now uses these shared tools in two more places. Its Title Screen selector has searchable Unicode sections beside a large preview, and the Player, Boat, Ship, and Airship starting positions can be chosen directly on the Transfer Player map canvas. The original numeric Map/X/Y fields remain available; visual changes stay local until OK and then commit as one triplet. Nested map expansion and search work across the hierarchy, while generation-guarded offscreen rendering prevents a slower previous map load from replacing the current preview.

Plugin Help & Documentation is searchable as well. Large source-derived `@help` guides highlight every literal case-insensitive match, report the active and total result count, and navigate in either direction with buttons, Enter/Shift+Enter, F3/Shift+F3, or a Plugin Manager-scoped Ctrl/Cmd+F. Navigation wraps at either end, nested Plugin Manager dialogs suspend the shortcuts, and highlights are built from text nodes so documentation can never become executable markup.

Complex plugin parameters no longer collapse into numbered JSON blobs. Reactor parses each MV/MZ struct definition through its own closing comment, carries the complete schema into nested editors, and presents struct and scalar arrays as named records with Add, Edit, Delete, button ordering, double-click editing, and direct full-row drag-and-drop ordering. Group headings and fields share stable grid columns, note/code values use multiline editors, and Text-tab edits are applied before returning to the form. Decoding follows the declared schema rather than repeatedly parsing every string, so values such as `"true"` or JSON-looking note text stay strings. Nested Cancel works on a cloned draft, and OK recursively rebuilds the array-of-JSON-strings representation RPG Maker plugins expect. A tracked real-world nested `YEP_OptionsCore` fixture resolves both `Categories` and `Options`, exposes the nested option names, and round-trips byte-for-byte.

## More of the screen belongs to the database

The database window now expands to nearly the full viewport, with scrolling owned by its list and detail panes instead of the outer window. This provides more usable space on desktop and gives the Web editor a true full-size database view without changing the underlying project data.

## Database maximums are explicit and safe

Change Maximum previously accepted any positive number, then synchronously cloned and rendered every requested record. Entering 99,999 could lock the editor. The dialog and data layer now enforce explicit workload-based ceilings without reducing MZ's capacity: major records and Common Events retain 9,999 slots, while Animations and Tilesets retain 1,000. Reactor's Type limits go farther: 512 Elements, 128 Skill Types, 256 Weapon and Armor Types, and 128 Equipment Types. Existing projects above a ceiling remain readable and can be reduced without an automatic destructive rewrite.

Large databases remain one continuous list rather than splitting into pages. The first 250 rows render immediately; nearing the bottom appends the next batch in place, so opening the Database stays responsive while normal scrolling can reach every entry. Expansion serializes its template once instead of once per slot. Tileset flags are not loaded on row selection: RPG Maker stores all 8,192 flags for every Tileset together in `Tilesets.json`, so the file is parsed as a unit when the project opens. Reactor now stores the Database Cancel baseline as compact JSON rather than duplicating those arrays into a second live object graph. Common Event trigger subsets are similarly cached instead of filtering the complete list on every idle map frame.

Limits that prevent actual multiplied work remain, but MZ-only scalar restrictions do not. Actors can reach level 999; standard level-99 Class curves extrapolate safely without expanding every Class record, Battle Test uses the same values, and the EXP preview follows the runtime formula through level 999. Skill/Item Repeats and Attack Times+ support 100 with a final runtime cap. Prices, costs, action speed, success, gain, and variance remain unrestricted because their magnitude does not increase iteration count. Animation transforms stay bounded before reaching live renderers.

Map IDs were never restricted to three digits: padding is a minimum width, so ID 1000 correctly loads `Map1000.json`. Reactor now explicitly supports 2,000 live maps across IDs through 9,999, reuses deleted ID holes, and indexes the Transfer Player hierarchy once instead of rescanning the full map list for each row. Copying and pasting a map now inserts the copy directly after the selected map at the same hierarchy level, rather than sending every paste to the bottom of the root list.

## Types and Terms have purpose-built workspaces

Types is now a dense five-panel workspace for Elements, Skill Types, Weapon Types, Armor Types, and Equipment Types. Each panel has an explicit maximum control, and reducing a maximum requires confirmation because entries beyond it will be discarded. Rows support keyboard and pointer multiselect, Cut, Copy, Paste, Clear, and a custom context menu. Clearing an interior row blanks it instead of splicing the array, so every later numeric ID remains stable; paste grows a list only when required, and the reserved ID 0 slot remains intact.

Terms now uses a compact full-width workspace for the editor's Basic Statuses, Parameters, Commands, and Messages groups. The message fields are arranged in scrollable columns, and normal text selection, clipboard commands, and the editor's text context menu remain available throughout.

## Conditional Branch now covers the complete MZ model

Conditional Branch supports MZ condition types 0 through 13: Switch, Variable, Self Switch, Timer, Actor, Enemy, Character, Gold, Item, Weapon, Armor, Button, Script, and Vehicle. Their MZ subtypes are represented as well, including variable-to-variable comparisons, actor and enemy predicates, equipped-item checks, button modes, and all three vehicles. Existing parameter arrays round-trip exactly when unchanged, while newly configured conditions serialize in MZ's canonical shapes; legacy Button conditions without a mode are preserved and gain the MZ Pressed mode when edited.

## Advanced event commands without a new project format

Control Variables now has an Advanced Expression operand for arithmetic, power, minimum/maximum, `atan2`, random ranges, bitwise operations, absolute value, square root, and degree-based sine/cosine. Its stock Game Data operand now opens an RPG Maker-style nested selector: Item, Weapon, Armor, and Actor entries show database names; Actor, Enemy, Character, Party, Other, and Last Action Data expose their standard properties; and the parent row displays a readable summary. OK preserves the exact stock parameter tuple, while Cancel and Escape leave it unchanged. Loop follows RPG Maker's direct stock Loop/Repeat Above behavior instead of opening a separate configuration dashboard, while existing nested bodies remain intact. Previously generated finite-loop scaffolds are still recognized so existing project data and structural clipboard selections remain safe.

Common Event keeps the direct stock command and adds variable-designated Common Event calls plus direct or variable calls to a page on a current-map event. Conditional Branch also goes beyond MZ's button list with extended keyboard pressed/triggered/repeated/released checks, independent left/middle/right mouse states, wheel directions, and pointer X/Y comparisons against constants or variables. Runtime input aggregation prevents a logical action from releasing while another physical key or gamepad source still holds it.

These additions do not append private fields to RPG Maker command arrays. Portable forms use the exact stock command structures; generated forms use ordinary Script-bearing command codes with a strict, canonical, versioned Reactor tag. The editor reopens a command structurally only when the command layout, tag, metadata, and generated body still agree exactly. A hand-edited body, malformed tag, or future unknown version stays an ordinary Script command, and generated dynamic-picture scripts contain their own stock MV/MZ fallback.

## Dynamic pictures and optional Reactor effects

Show, Move, and Erase Picture can resolve the picture ID from a variable. Move can resolve duration from a variable, while Erase can target one picture, an inclusive range, or every picture, with direct or variable endpoints. Negative scale remains the sole flipping mechanism, now supports `-2000..2000`, and displays correctly in Quick Setting rather than being hidden behind a separate flip control.

Reactor projects can additionally set an initial or tweened picture angle, choose a custom normalized anchor, add independent sine-wave X/Y offsets, and request Overlay blending. This state is isolated in `reactor_picture_extensions.js`, loaded and packaged as part of the Reactor runtime rather than embedded into project JSON. Old saves receive safe defaults and command payloads are validated. Overlay uses the advanced renderer path only when back-buffer support is active; otherwise it quietly behaves as Normal, preserving a warning-free game. Without Reactor's extension, generated Show/Move/Erase commands still perform their stock operation through the fallback body.

## Nested branches edit safely

Editing an If or a Show Choices that contained another If or choice structure inside one of its branches could quietly corrupt the event: the editor treated the nested structure's End marker as its own, removed the wrong range of commands, and left orphaned branch markers behind. Empty branches made it worse: bodies could shift into the branch above them. The event editor now parses branch structures by indent, exactly the way the runtime routes them, so nested structures ride along untouched, empty branches hold their place, the Cancel branch keeps its commands when choices are added or removed, and structures edited deep inside other branches keep their nesting. Conditional Branch also gained MZ's "Create Else Branch" checkbox, so editing an If no longer silently adds an Else you did not request. The same shared logic now backs the common-events editor, with round-trip tests over nested fixtures.

## Event editing is transactional

Event mode now uses the map gesture expected by RPG Maker users without committing data before the dialog is accepted. Double-clicking an empty in-bounds tile opens a detached standard default event. Apply or OK inserts it and records one Undo snapshot; Cancel, X, or backdrop dismissal leaves the map unchanged. Existing-event Apply commits once and refreshes the Cancel baseline, OK commits and closes, and a no-op Apply creates no Undo entry. Double-clicking an occupied tile keeps its existing edit behavior. Central bounds and occupancy checks reject duplicate creation, and a real event drag clears stale double-click timing so the vacated tile cannot accidentally receive a new event.

## System 2 preserves Magic Skills semantics

System 2's Magic Skills setting is an ordered list of Skill Type IDs, not a set of independent checkboxes. The editor now presents fillable Skill Type rows, preserves their order, removes duplicate selections when changed, keeps a missing referenced ID visible until it is edited, and does not initialize a missing field merely by opening the page. Projects therefore retain the runtime ordering and data shape expected by MZ.

## Project opening reports the real problem

The generic invalid-project prompt previously covered both an actual load failure and a healthy project rejected by the same-project lock. A lock conflict now stops after its specific warning. Real metadata and database failures retry short-lived partial or locked reads, strip UTF-8 BOMs used by some localization tools, and report the failing file and parse reason. `MapInfos.json` is read once and remains controller-owned rather than being independently parsed twice during the same open.

Imported MV projects have a second desktop-launch hazard: older MV `package.json` files commonly contain an empty `name`, which modern NW.js rejects with `Required value 'name' is missing or invalid.` Install Reactor Runtime and desktop playtest now repair only missing, non-string, or blank `name` and `main` values, preserving custom window dimensions, JavaScript flags, and other NW.js settings. Malformed JSON and non-object package roots fail with an actionable path before old runtime files are archived or a playtest process is spawned.

## Stock MV and YEP saves work again

The PIXI 8 conversion retained MZ's asynchronous save path but had lost the LZString contract used by stock RPG Maker MV and synchronous MV plugins such as YEP Save Core. Reactor once again bundles and loads LZString before the MV compatibility layer, reads stock MV Base64 save payloads, and writes the same encoding for MV synchronous saves. Custom local save contracts continue to use the project's `localFileDirectoryPath` and `localFilePath`, while Web saves honor the project's `webStorageKey`; the asynchronous compatibility fallback can also decode LZString data after rejecting a non-native payload.

## Plugin rendering and compatibility warnings

MOG Treasure Popup's contents sprite was being clipped by MZ's client-area rules even though the plugin positions that contents outside the normal window client. Compatibility setup now moves only that popup contents sprite out of the incompatible clip, restoring the full treasure display without disabling clipping for ordinary windows.

Legacy video parallaxes can attach children to a `TilingSprite`. PIXI 8 still supports that behavior but reported a child-container deprecation unless `allowChildren` was set, so the compatibility layer now enables it on `TilingSprite` without per-instance warning state. Video teardown also intentionally clears a media element's source; those empty-source errors are now ignored while genuine missing or failed media still reach the console.

The existing PIXI 8 boot-race fix is now protected by a focused simulation: when a plugin such as VisuMZ wraps async SceneManager initialization without returning its promise, an early start request remains deferred until `Application.init()` installs the ticker methods, and a later stop request wins safely. The runtime snapshot suite also locks down the function-based ES5 Filter bridge used by legacy `PIXI.Filter.call(...)` and `.apply(...)` construction patterns.

## Whole-map bucket fills in a fraction of a second

Bucket-filling a huge area on a 256x256 map painted correctly after 30 to 40 seconds of frozen editor. The flood fill itself was never the problem, finishing in under 0.2 seconds; the time went to applying 131,000 tile updates one at a time, each one re-walking the water-animation bookkeeping list. Massive updates now take the same streaming path as map loading: the visible viewport repaints immediately, the rest fills in quietly in the background, and the bookkeeping is batched. Measured on the same map, the fill now blocks the editor for about a quarter of a second.

## Copy a rectangular section of the map

Right-dragging in Pencil mode now samples an exact rectangle directly from the map. The stamp retains all four visual tile planes, shadows, and regions rather than flattening the selection through palette placement rules. A composite hover preview follows the cursor, reverse drags and source/destination edge clipping work naturally, and zero-valued cells intentionally clear their matching destination planes. Left-click or drag places the patch, with one Undo snapshot for the complete stroke; sampling itself does not change history. Events remain separate, matching RPG Maker's map-copy behavior.

## Water animation when you want it

A1 water and waterfall animation remains enabled by default, but a new persisted editor preference can pause it when a static map view is easier to work with or lighter on the renderer. File → Options and a compact `A1` checkbox beside the map zoom and coordinates share the same state. Turning it off removes the animation ticker and returns visible A1 tiles to their first frame; it changes only the editor preview, never playtests or deployed games.

## Your scroll position stays put

Undo, redo, and giant fills used to snap the view back to the map's top-left corner after re-rendering. The editor now preserves the scroll position through all of them, so the view stays where the edit occurred.

## About those undo reports

We traced the "paint bucket doesn't undo" reports to their root: on 0.94.5 through 0.94.7, pressing undo while a large map was still streaming in let the in-flight background fill repaint pre-undo tiles over the restored map. Undo had applied to the map data, but the screen showed stale tiles until the map was reloaded. The 0.94.8 loading rework already eliminated this generation race. This release adds a related safeguard so full re-renders always rebuild their layer caches from scratch.

## Marathon sessions stay healthy

Browsers cap how many live WebGL contexts and audio contexts a page can hold, and the editor's preview surfaces were spending that budget without releasing it. Repeated animation picker opens, visits to the Animations database page, and audio picker sessions could eventually leave 3D previews blank and audio previews silent. The Animations page also left keyboard shortcuts wired to previously viewed animations, so Ctrl+V or Delete could affect data that was no longer on screen. These surfaces now release and force-lose contexts on close, remove global listeners when views switch, and stop walking-character preview timers when their canvases leave the document. The Effekseer Forge performs the same teardown for its preview context and window-level orbit handlers.

## A deep audit, top to bottom

The seven-subsystem audit covered the editor, runtime, and compatibility layers, with each finding checked against the code before it was changed. Its first set of fixes made project writes atomic, made deployment save before building, corrected autotile flag indexing, restored correct runtime routing for If/Else and Show Choices, made database Cancel restore the session snapshot, closed two unbounded texture leaks, and restored MZ battler ordering when MV plugin compatibility is active. The final hardening pass moved critical writes to exclusive random temporary files with no-follow creation, file and directory flushing, and safe cleanup; escaped project-authored text across privileged editor HTML surfaces; strengthened token-owned project locks and project-creation path validation; and prevented stale asynchronous map loads from replacing current state.

## The audit backlog is cleared

The remaining Medium and Low findings recorded on July 13 are also resolved in 0.95.0. Audio command Cancel no longer commits slider changes, Battle Test keeps preview battlebacks out of the real `System.json`, database text containing quotes or ampersands survives editing, transparent B-E tile selection arms auto-erase again, and map deletion saves its metadata before removing files. MV compatibility saves no longer accumulate the battler animation mirror queue, command windows recreate contents only when their size changes, and Ultra Mode 7 reuses its per-layer scratch buffers. The editor also removes repeated list scans, excess database writes, stale listeners, and redundant preview rendering identified by the audit. Both the MZ demo and the 168-plugin MV project booted to their expected opening scenes with clean consoles.

Save All now forces a fresh database snapshot after successful persistence. This makes the just-saved state the Cancel baseline for any database window that remains open, rather than allowing Cancel to restore data from before the save.

## Reproducible release candidates

The release pipeline now distinguishes ordinary development packages from authenticated public candidates. Interactive editor builds can acquire Latest Stable or a selected NW.js version and clearly warn when that developer runtime is not authenticated. Public builds instead pin NW.js 0.107.0 to trusted hashes, reject dirty source trees, package the tracked Reactor One Demo starter, and write manifests that bind each artifact to its source commit, target, signing state, size, and SHA-256. Windows candidates require verified Authenticode signing; macOS candidates require hardened-runtime signing, notarization, and stapling. GitHub and optional itch publication consume the inspected Linux, Windows, macOS, and Web candidate bytes without rebuilding them.

Current cycle history is available in the [GitHub changelog](../../CHANGELOG.md). The full technical list is in the [editor changelog](../../editor/CHANGELOG.md), the public release procedure is in the [release checklist](../RELEASE-CHECKLIST.md), and the [audit disposition](../AUDIT-BACKLOG-2026-07-13.md) preserves the original findings.

Current Node validation: 350 passing, 0 failures. Major coverage includes cross-instance clipboard transport, database and event-command serialization, localization no-fallback checks, map sampling, exact Shift autotile placement, transactional event editing, project lifecycle and atomic-write safety, runtime compatibility, deployment, and release policy/signing gates.
