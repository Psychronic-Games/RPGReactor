# Changelog

All notable changes to RPG Reactor will be documented in this file.

This root changelog summarizes public release progress for GitHub; larger releases group their fixes by theme. The detailed editor changelog lives at [`editor/CHANGELOG.md`](editor/CHANGELOG.md).

## [Unreleased - 0.98.3]

### Added

- **Audio can ship as MP3, WAV, or FLAC — not just OGG.** Drop any of those formats (plus M4A) into a project's BGM, BGS, ME, or SE folder and it plays in game and lists in every editor picker; nothing changes in the project data, which stays extensionless and MZ-compatible, so an OGG-only RPG Maker project behaves exactly as before and OGG still wins when the same track exists twice. Loop points come from each format's native convention — `LOOPSTART`/`LOOPLENGTH` comments in OGG and FLAC, the same pair as ID3 `TXXX` tags in MP3, and the sampler `smpl` chunk in WAV — and album art displays from MP3 and FLAC tags just like OGG's. Encrypted deployments cover the new formats too (`.mp3_`, `.wav_`, `.flac_`).

- **Every audio picker looks and acts like the Audio Player.** Picking title, battle, or vehicle music, a system sound, audio in an event command, a movement route's SE, or a map's autoplay BGM/BGS now opens the same interface the Audio Player uses: album art beside the selected track, cover thumbnails on every row, the alphabet rail for jumping through long lists, and the styled playback row — with volume, pitch, and pan cards where the surface doesn't already have its own fields. Clicking a track previews it immediately; double-click confirms.

- **The Audio Player shows album art.** A track's embedded cover (including in encrypted `.ogg_` files) appears beside its name in the header and in every track row; tracks without one get a stable per-track tile so the list still reads visually. The Demo's 65-track Psychronic soundtrack now ships with its album covers embedded, so the player shows real art out of the box. The current-track card sits near-black behind an accent border, audio lists scroll with a slim accent-pill scrollbar, and the BGM/BGS/ME/SE tabs render as outlined chips — all themed per palette. The playback buttons and the volume/pitch/pan sliders now share a single row, and the seek bar scrubs in fine steps instead of snapping to whole percents of the track.

### Changed

- **PixiJS updated to 8.20.0** across the editor and the game runtime, verified against the Demo (including 3D maps) and a plugin-heavy MV compatibility project.

### Fixed

- **Light themes are readable everywhere.** A contrast audit across all seven palettes found light modes reusing accent colors tuned for dark backgrounds — gold text on white at 2:1, white button labels on pale accents. Every light palette's accents are darkened to meet the 4.5:1 accessibility bar for text, the toolbar's pixel-art icons tone down from neon to ink on light backgrounds, and dark themes are untouched. The About dialog now credits Three.js alongside NW.js and PixiJS v8.

- **The tileset palette no longer shows another tileset's sheets after switching maps.** The palette's sheet cache is keyed by slot (A1–E), and a slot the new map's tileset leaves empty kept displaying whatever the previous tileset had loaded there. Switching maps now empties every slot before the new tileset fills its own, drops a selection made on the old sheets (its coordinates would paint unrelated tiles), and a slow superseded load can no longer repaint the palette after a newer map switch.

- **Filename-case mismatches are corrected before the request, so fallback plugins can't hide the real art.** Windows-authored games freely request `npc_female2` for a file saved as `NPC_female2`; the runtime used to recover in its error handler, but a plugin that replaces that handler (Haven ships CGMZ_Fallback, which substitutes a placeholder file without calling the original) preempted the recovery — mismatched NPCs silently wore the fallback sprite and the console filled with failed requests on every map. Bitmap and audio loads now resolve the on-disk casing before issuing the request: the real art loads, nothing hits the console, and genuine missing files still reach the plugin's fallback exactly as authored.

- **A 3D-tagged map whose elevation was never painted no longer logs a failed request each time it's entered.** A missing `Map###.r3d.json` sidecar means "render flat" by design, but probing the network for it put an unsuppressible `ERR_FILE_NOT_FOUND` in the console on every visit. The runtime now checks the disk first and only requests a sidecar that exists.

- **Games bundling v5-era pixi-filters no longer crash to a black screen when a screen effect starts.** Haven/Project3's "5 years later" chapter died the moment its filter plugin ran: those filters override `apply` with multi-pass bodies built on PIXI v5's API — the input texture's `_frame`/`filterFrame` rectangle, `getFilterTexture`/`returnFilterTexture` scratch textures, array uniforms sized by shader constants, extra sampler textures assigned as uniforms, `(callback, scope)` ObservablePoints, and shaders that use `finalColor` as their own local variable. PIXI 8 renamed or removed every one of those. The legacy filter bridge now maps them all onto their v8 equivalents; all 41 bundled filter classes construct and render clean in the live runtime.

## [0.98.2] - 2026-08-16

### Added

- **Events can carry a 3D model instead of a walking sheet.** The Event editor's Image section has a 3D checkbox that opens a folder picker under `3d/<name>/source` (GLB, OBJ, FBX, STL, USDZ, 3MF, DXF). Pose, size in tiles, and Front/Back/Left/Right marks are authored in a live preview and stored in `Map###.r3d.json`, not in the event note. In game the mesh follows the event, occupies every tile it covers, and other characters stand in front of or behind it by world depth. A model's collision is its true rotated rectangle at the mesh's real standing yaw — walk right up to an angled vehicle from any side, whatever pose it was authored at. A driving model keeps its trailing tiles solid mid-step, tests both body orientations before a turning step so it cannot sweep through a standing character or event, and turns its mesh at a paced rate instead of pivoting 90 degrees in one frame; a turn must also clear the disc the body's corners sweep, so the swing cannot pass through a bystander in either direction. Character sprites and tile cut-outs lean towards the camera for readability but depth-test as if standing upright at their ground row, so a sprite in front of a model draws fully in front, behind it is hidden, and no part of the art clips into the mesh. Star-flagged tiles join that same depth buffer on model maps, and an event standing on a structure's art snaps to that structure's plane — shown over its own pedestal, occluded by a character who is genuinely nearer, whatever the 2D priority said. Demo Map001 event 22 ships a car.

- **3D models animate.** A model folder can carry animation rules — spin (wheels roll with distance travelled and hold their angle at rest), swing, and bob — authored in a new Database > 3D section: every model folder listed with a rendered thumbnail, its real part names discovered from the mesh (exporter plumbing filtered out, numbered siblings grouped so one rule drives all four wheels), a live preview with a walking simulation, and every change written to the model's own `model.json`. Embedded GLB animation clips play through the same system: an animated GLB keeps its skeleton live on the GPU, clips crossfade between idle, moving, and on-demand states, and a pose-library GLB becomes a pose system. A new Play Model Animation event command — under a Reactor tab of its own in the command picker — triggers a named action on any event or the player; it is stored as an ordinary MZ plugin command, so project data stays loadable everywhere and stock runtimes simply ignore it. The Demo's car rolls its wheels as it drives, and its monster plant sways, pecks, and bites on command.
- **The model picker poses through rings around the model.** Grab the green, red, or blue ring and the model follows the pointer about that one axis — gimbal-nested, occluded honestly behind the model, dim until touched. Free-drag posing used to bleed every drag into all three angles at once. Front/Back/Left/Right dots now land the moment the button goes down, click straight through the floating gizmo, and a near-miss on a sparse mesh still places; a drag that slips past the modal edge no longer cancels the picker.
- **Arrow keys step through asset picker file lists** one file at a time with the preview following, scrolling only at the list's edge instead of scrolling the selection out of view.
- **Large 3D objects that span both halves of a tileset sheet author as one object.** Shift, Ctrl, or Cmd-drag adds the second half to the first, and the merged object highlights across both palette pieces so it visibly reads as a single thing.
- **Passability can be bulk-painted.** In Database > Tilesets, the O/X/★ Key doubles as a palette: pick a mark, then click or drag across the sheet to paint that value directly — the classic click-to-cycle stays the default when no mark is picked. The Key and its tool palettes stay pinned while a tall sheet scrolls.

### Fixed

- **The Web editor bundle fits browser storefronts' 1000-file upload cap again.** Unreferenced library stock — hud face skins for undefined actors, source files, unused stock enemy battlers — is trimmed at packaging time, and the extracted size fits the 500MB cap the same way — unplaced 3D library models and the Character Generator's 76MB bulk style pack stay out of the web bundle while the soundtrack ships untouched at full quality. The build reports its file count and extracted size and warns past the common caps instead of ever blocking.
- **Checking 3D no longer crashes the editor on native Windows.** The editor injected three.js as inline script text, which parses on the main thread — and V8's recursive parser overflows Windows' 1MB main-thread stack on a 2MB bundle, killing the whole process with STATUS_ACCESS_VIOLATION while Linux and Wine never noticed. 3D libraries now load with external-script semantics, compiled off the main thread. Behind it stands a new self-diagnosing recovery system: every 3D activation stage leaves a crash-surviving breadcrumb, the next launch names the stage that died, and the editor automatically switches between its two context strategies — refusing to arm at all rather than crash a third time.
- **Effekseer animations no longer draw black squares or slabs behind themselves.** Effects rendered on a transparent overlay canvas, and each blend mode broke its own way: additive layers with black-backed textures composited as opaque black squares, darkening layers multiplied nothing into solid black, and distortion had no background to sample. While effects play, the overlay now carries a copy of the rendered scene and effects draw on that copy — the stock engine's shared-framebuffer behavior, verified by sweeping all 120 Demo animations.
- **Editing an event no longer strips its 3D model's texture.** Opening the event editor rebuilt the model spec without its texture field, so pressing OK after any change — movement, a switch — left the model gray in game.
- **The map no longer renders black under plugins that replace `Tilemap.update`.** MultiTweaks' animation-speed option substitutes a copy of the stock MZ update body, which was safe on PIXI v5 because PIXI itself ran the tilemap's transform during render. Reactor's PIXI 8 runtime drove tile repainting from its own update tail, so the replacement silently erased it: characters, windows, and pictures drew normally over a fully black tile layer. The tilemap now self-heals from PIXI 8's per-frame render callback — if a frame reaches rendering without its tile preparation having run, it runs there, exactly once, so the existing single-preparation guarantee is preserved.
- **Encrypted RPG Maker games open with their graphics and audio intact.** Deployed MV/MZ projects ship `.png_`/`.ogg_` (or `.rpgmvp`/`.rpgmvo`) assets; the editor now decrypts them on the fly using the project's own encryption key, recovers the key from the PNG header when `System.json` omits it, and lists the files under their plain names in every picker. Both the editor and the runtime also retry a failed asset load once with the real on-disk filename casing, so Windows-authored games that request `bell3` for a file saved as `Bell3` work on case-sensitive platforms.
- **Existing Reactor projects now receive the current runtime when they open.** Updating the editor previously left each project's private `js/reactor_*.js` files untouched, so a 0.98.1 editor could still playtest through 0.98.0's incomplete `filterArea` shader translation and report the same Pixelate errors. The runtime now carries an engine-version marker; opening an older Reactor project refreshes only engine-owned files while preserving its plugin configuration.
- **Database row editing is visible instead of hidden behind right-click menus.** Classes can now add, edit, and delete learnable skills. Skills and Items expose buttons, double-click editing, and keyboard actions for Effects, while Enemies do the same for Action Patterns; adding an enemy action opens an editor before it changes the record, and HP/MP conditions display as percentages.
- **Face sheets can contain more than two rows.** Actor previews and lists, actor selection, Show Text, and Change Actor Images retain RPG Maker's four 144px columns while deriving every available row from the image, so extended face sheets can select indexes beyond 7.
- **MV-style animation records can be created and edited from a blank state.** Switching an animation to Sprite-based now creates a valid first frame with working sheet and frame controls, persists the format change, preserves imported hidden cells, enforces MV's 16-cell runtime limit, and converts flash timing fields without writing malformed data.
- **Troop events open the real Plugin Command editor.** Plugin and command selection now works in Troop battle pages as it already did in map and Common Events, instead of falling through to a raw parameter dialog.
- **Event creation and shortcuts are easier to discover.** Empty map cells still create events by double-click in Event mode, now with a more forgiving interval; Enter creates or edits at the outlined cell, context menus display their keyboard shortcuts, and event clipboard/history shortcuts accept Command on macOS as well as Ctrl. Conditional Branch labels stock MZ conditions separately from Reactor's additional input conditions without changing the command data.
- **MZ-style Quick Event Creation is available from an empty map cell.** The Event-mode context menu can generate Transfer, Door, Treasure, and Inn events. Transfers use the visual map picker; doors and treasure choose project graphics and animate through stock movement routes; treasure supports gold, items, weapons, and armors with an opened self-switch page; and inns check and deduct the configured price before fading and recovering the party. Cancel changes nothing, occupied cells are refused, and creation is one Undo action.
- **Simplified Chinese terminology and database layouts received a correctness pass.** Curated translations now take precedence over the machine-assisted catalog, known mistranslations such as Class, Critical, MP, Common Event, Comment, and Count are corrected, Chinese locale aliases are recognized, and database cards, translated labels, Class curves, Actor panels, and Enemy panels reflow from the width they actually receive instead of clipping inside a nominally wide window.
- **Plugin parameters that put `@param`, `@text`, and `@desc` on one line keep their real names.** MZ3D's spacer rows were shown as `spacer|graphics @text @desc` because the rest of the line was treated as the parameter name. Each annotation on the line is now read separately, and those spacer rows render as a divider instead of an empty field.
- **MZ3D character models no longer draw the 2D walking sprite on top of the model.** The plugin hides the tilemap and renders the world in babylon.js; PIXI 8 could still collect the tilemap's character sprites, so a model and its sheet appeared together (four eyes, doubled faces). Hiding the tilemap now updates the PIXI 8 display status of its subtree, and character sprites stay hidden while their parent is hidden.

## [0.98.1] - 2026-08-11

### Fixed

- **The Web editor's 3D checkbox now opens the 3D viewport.** WebHost loads the canonical `three.js` and `reactor_3d.js` files lazily from the bundled project's URL-addressable runtime instead of asking for a desktop filesystem `runtime/` directory. Failed requests remain retryable, and the Web package verifies that both files ship without adding three.js to startup.

- **Enabling 3D can no longer trap an editor profile in a project-open crash loop.** 0.98.0 saved the global 3D preference before renderer initialization and did not persist failure rollback, so every later project retried the same graphics failure. 0.98.1 clears old saved state before project loading, keeps durable state in 2D until the initial 3D render succeeds, and returns safely to 2D after setup, shader, context, or rebuild errors.

- **Enabling the 3D editor no longer creates a second WebGL2 context that can terminate Windows NW.js.** The native Linux graphics path tolerated the extra renderer, while the Windows ANGLE path could exit the entire process on both Windows and Wine even for the bundled Reactor One map. Three.js now temporarily shares PIXI's existing WebGL2 context and canvas, with an input-only overlay and explicit renderer-state handoff. Returning to 2D disposes only Three-owned resources and never loses PIXI's context.

- **The editor owns and releases one 3D renderer at a time.** Concurrent enables share one activation, disabling cancels pending work, stale asynchronous rebuilds cannot replace a newer map, and project close tears down 3D before the PIXI map. PIXI's ticker pauses while Three owns the shared context and resumes after its state and dimensions are restored. A failed render stops its frame loop instead of throwing again every frame.

- **Unsafe 3D preview allocations are refused before geometry construction.** Maps over 40,000 cells or 400,000 estimated source quads remain in the working 2D view with a clear status. The validated 200x200 production-map size remains supported.

- **Legacy MV/PIXI filters compile correctly on PIXI 8 during snapshots and battle transitions.** The compatibility bridge now maps the removed `filterArea` origin and `filterClamp` uniforms to PIXI 8's filter globals without shadowing those globals with zero-valued plugin uniforms. This fixes Haven/Project3's Pixelate filter shader failure and the resulting repeated `useProgram: program not valid` console errors during battle-background capture.

- **PIXI 8 tilemaps no longer flicker or fold at object seams while the camera pans.** The current camera origin now reaches the tilemap before its update, every repaint synchronizes the lower, upper, and plugin-added meshes before returning, and the complete plugin-wrapped tilemap preparation runs once rather than being repeated while PIXI constructs render groups. This keeps Haven/Project3's independently sorted billboard rows in one atomic frame during diagonal movement.

## [0.98.0] - 2026-08-10

### Added

- **An event can decline to join the object painted over its cell**, with `<3d ground>` in its note. Grouping is right for the things that *are* the building — a sign, a lit window, a shop door — and wrong for a character who merely stops walking on its square.

- **A parallax is chosen by looking at it.** Map Properties offered a dropdown of filenames, and a filename is a poor description of a picture. A **Browse…** button opens the editor's own image picker — the whole folder, searchable, current choice highlighted, full-size preview — and a thumbnail of the current parallax now sits under the dropdown with its pixel dimensions, so "is this the one?" is answered without opening anything.

### Changed

- **The language control now sits at the far right of the menu bar and names the active locale.** The globe stays visually separate from the application menus and carries a compact code such as `EN` or `JA`; narrow Web layouts keep the globe and hide only the code.

### Fixed

- **3D water animates in the running game, and authored cut-outs remain complete without duplicate support artwork.** Runtime water and waterfalls now follow the same clock as their 2D versions. Multi-cell mountain and foliage stamps retain each physical source map layer, emit once at their authored footprint, and reconstruct missing quadrants at ragged fill edges; a separate faint, depthless underlay fills only the transparent gaps that would otherwise reveal a rectangular hole. Declared structures keep one composition frame across layers and incomplete source rows, so crater structures and their flat aprons share the intended pivot and boundary. Starred pieces draw only in the upper pass rather than being copied beneath characters. Fully opaque texels write their colour and depth together before fractional alpha is blended, preventing transparent mesh sorting from cutting holes while preserving soft sheet edges. Flat-row hinges are not shifted into their own footing, and authored map layers remain the coplanar ordering tie-breaker in both runtime and editor.

- **Running maps use a native PIXI 8 tile mesh instead of thousands of pooled sprites.** Each physical tile layer keeps RPG Maker's command order in one GPU geometry and samples a shared nearest-neighbour atlas, including animated autotiles and map shadows. Plugin-added tile layers receive the same tileset and synchronization path, unrelated plugin children are left alone, Ultra Mode 7 remains authoritative, and any atlas or mesh failure automatically returns that layer to the proven sprite renderer. `window.$reactorTilemapBackend` can force `"mesh"` or `"sprites"` for diagnosis, with counters in `window.$reactorTilemapStats`. A live Star Shift Rebellion map 596 forced-scroll run held a 5.7ms p99 with the mesh backend; the sprite fallback reached 22.2ms while performing 222,234 pool operations over the same 180 frames.

- **Large maps no longer turn into map-sized GPU textures or hundreds of thousands of JavaScript sprites.** Reactor supports maps through 512×512, four times the area of RPG Maker MZ's 256×256 limit, through a buffered visible-tile window once a map grows large. Neighboring 32-tile chunks are resident before they are needed, pan and zoom add only entering chunks while preserving overlap, and a transform is not committed until its destination is complete, so no blank geometry flashes into view. Tiles and autotile quadrants are merged into typed GPU mesh buffers by source sheet and chunk; even animated A1 water changes UV buffers rather than managing four sprites per cell. Full-map zoom remains available. Star Shift Rebellion map 596's exact data, which would require an estimated 312,141 tile sprites, renders completely through 219 meshes with no WebGL error or context loss. Layer caches are checked against the active GPU and a memory budget before creation or refresh; invalid sizes above 512, malformed pasted maps, and oversized imported files are rejected before allocation instead of soft-locking the editor or losing its WebGL contexts.

- **Map files keep their tile planes compact.** Reactor no longer writes one tile ID per line: the large `data` array follows RPG Maker's inline layout while map properties and events stay readable. The bundled starter map is less than half its previous file size with identical data.

- **Auto-layer autotiles stay with the terrain layer they belong to.** Painting ordinary ground such as sand over water now replaces it on map layer 1 and reconnects the autotile shapes there instead of stacking an isolated strip on layer 2. Decorations and deep-water overlays still stack intentionally.

- **Event mode shows which map cell the pointer or keyboard will act on.** Empty ground and existing events now receive a lightweight tile outline under the cursor, and the first click on empty ground keeps the stronger selected-cell outline visible while waiting for the second click that creates the event. The arrow keys move that target within the map, and Ctrl+V pastes a copied event there instead of silently falling back to the upper-left cell.

- **The map editor draws shadows in RPG Maker's layer order.** Shadows now sit after both base ground planes and before the decoration planes, instead of hiding an authored second ground plane beneath them.

- **PIXI 8 compatibility preserves two mutable legacy APIs plugins still use.** A plugin can assign an empty `filters` array and later push, splice, replace, or clear entries even though PIXI 8 stores an immutable internal list; each mutation is committed through the native setter so the filter effect attaches correctly. The v4 `copy` methods on Point, ObservablePoint, Rectangle, and Matrix are also restored with their original directions.

- **MV plugin windows and fonts retain their authored layout.** MV's `updatePadding()` once again calls a plugin's `standardPadding()` override, so zero-padding windows do not lose most of their client area. Font families declared in `fonts/gamefont.css`, including `GameFont`, are registered through the modern font loader instead of silently falling back to Arial.

- **Windows draw their contents again under a plugin that reimplements window clipping.** Every window clips its contents with a filter, and PIXI v8 reads that filter's rectangle as *local* to the container and applies the world transform itself, where v5, v6 and v7 took it as screen space and used it as given. A plugin's version writes the screen-space rectangle the engine documented — VisuStella's Core Engine among them — so v8 transformed it twice and the captured region fell off the edge of the screen. The filter then resolved to nothing and everything inside the window vanished, while the panel and border kept drawing: a correct, empty box, with no error and nothing in the display tree measuring wrong. A title screen showed its frame and none of its six commands. The rectangle is now written in world space on every version and converted for v8 afterwards, so whichever version ran last, ours or a plugin's, is clipped to the right place.

- **A tile layer that a plugin added to the tilemap can draw again.** Through v5, v6 and v7 the tile textures belonged to a shared renderer plugin, so a layer drew from it whether or not it had ever been handed the tileset — which is what made it reasonable for billboard and overpass plugins to add tile layers of their own. v8 has no shared tile renderer, and a layer that was never given an image list drops every tile it is asked to draw. TF_Billboard puts each ☆ tile that also carries passage flags on a layer of its own; on a wooded map those are the trees, and every tree lost exactly the tiles that plugin had taken — solid holes in the shape of the tiles themselves, a clean console, and an editor that looked perfectly correct, because the editor runs no plugins.

- **A `ParticleContainer` draws the sprites put into it again.** v8 kept the name and renders only the particles handed to `addParticle()`, ignoring ordinary children — so a plugin written against the old API adds its sprites, gets no error, and sees nothing on screen. It is an ordinary container now, which draws them; v8's batching was never reachable from that API in the first place.

- **No plugin's `WindowLayer.render` runs on PIXI 8, and none of them throws either.** That method masks each window with raw GL stencil calls around a global batcher flush, and v8 has neither, so the calls never bracket the draws they were written for. Shimming the missing ones was worse than the error they replaced: the masking then took effect and rejected every window it was meant to reveal.

- **Bitmaps whose canvas has been freed, and tileset images that have not decoded, are no longer sent to the GPU.** The first raised a WebGL error every frame for the life of a map; the second is worse, because the texture source is cached on the image for the session — one built too early stays 1×1 and every tile from that sheet afterwards draws as a single stretched pixel.

- **A plugin whose annotations were stripped out shows its saved parameters, in sections.** A plugin's parameter schema lives entirely in the comment block at the top of its file, and obfuscated releases ship without it — so the plugins carrying the most configuration are the ones that appear to have none, here and in RPG Maker's own Plugin Manager alike. The values survive, and their shape says most of what the annotation would have: an object is a struct, a list of objects is a list of them, `true` is a checkbox. One project's plugins yield 198 nested editors from 306 recovered struct definitions. Because reading a shape is a reading and can be a misreading, each one is checked by performing it — a parameter is offered as structured only when saving it reproduces the stored text exactly, and anything else keeps a plain text box.

- **Object designations can be painted again after switching project or map.** The editor was handed the rebuilt 3D object overlay only when the Objects tab was *clicked*, and a tab already open is never clicked — so the paint path found no manager and returned quietly, producing no mark and no error. Every surface the editor paints through is bound in one place now, and a tab that is already open is re-opened so its panel and overlay are rebuilt with it.

- **An event can say which layer its animations play on**, with `<animation z: 6>` in its note or `<animation over>` for the layer RPG Maker uses — in 2D as well as 3D. Where an animation belongs is a question about the scene, and one map will want a glow behind a table top and a flame over everything. Saying nothing keeps the behaviour that was there before.

- **A tile samples inside its own square of the sheet at every zoom.** Each quad carries the rectangle it is entitled to and the shader clamps to it, which no fixed inset can do: zoomed out, one screen pixel covers many texels and the sample can land in the next tile along.

- **The 3D camera looks at the middle of the view**, rather than half a tile past it.

- **An animation takes its place on the frame it appears**, instead of drawing in front of everything for one frame each time a looping effect restarts.

- **An event that is part of a 3D object sits on it, not half a tile above it.** Cut-outs are stepped half a cell towards the camera and sprites were not, so an event pinned to a painted object floated above the art it belongs to.

- **A parallax the 3D ground was built from is no longer also pasted flat over it**, so the same picture is not on screen twice. Scrolling backdrops are untouched.

- **A new event can be made in the 3D view.** Right-clicking stopped at the event cube, so the only cell you could open a menu on was one that already had an event on it — and *New Event…* lives on the menu for a cell that does not. Bare ground now gets the same menu the 2D map gives it.

- **One click of the shadow pen paints.** The pen paints a *quadrant* of a cell and worked out which one from the last position a mouse *move* had recorded — which a press with no move before it had never set. So a click declined to paint while a drag worked perfectly, the drag's first move having filled the field in.

- **The editor's 3D preview draws the map's parallax**, which it could not before: the runtime asks ImageManager for it and there is no game running in the editor. More than one is honoured, stacked in the author's order — the map's own and any declared in its note.

- **A plugin that renders somewhere else and hands the picture to PIXI as a canvas now shows it.** MZ3D draws its world in babylon.js and passes the result through as a texture; under Reactor it drew nothing and the map was the parallax sky behind it. Two v5-era behaviours are quietly gone in PIXI 8: `Texture.update()` no longer pushes the source to the GPU — which is also where a canvas's current size is read back off the element, so a texture built before its canvas is sized stays at the 300×150 HTML default — and a Sprite only tracks its texture when that texture is flagged `dynamic`, which is a v8 concept no MZ-era plugin knows to set. Neither leaves a mark: nothing throws and the picture is simply absent. Both are restored in the compatibility layer, so the plugin is unmodified.

- **A 3D map lit by PSYCHRONIC_RaveLighting is no longer hidden behind its own darkness, and its lights reach the scene.** A lighting plugin draws in two parts and only one of them is the lights: Reactor put away the glow sprites and left the darkness, a full-screen bitmap filled with the screen tone, which on a night map is opaque black over a world that had already been lit for real. It also has to be told every frame, because the plugin rewrites that visibility from the options setting on every frame of its own update. Separately, the lights themselves were read out of a container the plugin only fills lazily, so a map with five lit braziers put no lights in the 3D scene at all; they are read from the characters that own them now.

- **The audio player's track list fills the dialog.** It was a flat 475px — the height of the A-Z strip standing beside it, 26 tabs at 17px plus padding — so the list was sized to fit the alphabet rather than the window, and everything below it was an empty grey band that could have been holding twice as many track names.

- **Verified release artifacts attach to the source release instead of replacing its notes.** Publication now detects the release created by the tag workflow and uploads candidate files with overwrite-safe attachment semantics; if source publication was interrupted, it can still recover by creating the release. The Web editor also ships an application icon and the bundled MZ starter explicitly disables MV game semantics, eliminating its missing marker and MV-only font requests.

## [0.97.0] - 2026-08-03

### Added

- **A building can be declared on the map, not just in the tileset.** A tileset can say what a *tile* is and nothing more: an autotile id is a corner arrangement shared by forty-eight shapes, so three shops built from one wall kind are indistinguishable to it, and an autotile has no place in a drawing for a declared rectangle to point at. Which cells make up one building is a fact about a *placement*. So there is a new palette tab beside Regions where you paint object numbers onto the map, and cells sharing a number are one object — a building assembled out of bits of three others is one thing and says so. A **Footing** brush marks which of its rows are the ground it stands on rather than courses of its height.

  This is what makes decoration hold still against the thing it is painted on. A flag hung on a shopfront is a picture tile, and picture tiles could never join a wall's facade, so the flag became its own object with its own footing two rows nearer the camera and slid sideways against the wall as you walked. Inside one painted object there is one anchor and one plane, so everything on the building moves with the building.

- **Walls classed Upright are solid too.** Massing raised by the tileset's classes had already gained real sides; a wall stood up as a *cut-out* had not. It was one plane at the southern end of its run — correct from the front and nothing at all from the side, so walking round a shop thinned its front to a line and it vanished. 2D never draws a building's sides so there is no art for them, but the wall's own art is a better answer than a hole. Each is now a box a tile deep, with ends only where the run actually stops, and those ends take their picture from the same shape quadrants the front does rather than from the block's corner piece.

- **Flying the editor's 3D camera** with WASD, Q and E for height and Shift to hurry, alongside a hover outline showing which cell the cursor is over, boxes drawn round events so they read as events, and dragging events in 3D as you can in 2D. Escape now lets go of whatever is held.

- **A page set to Custom movement can finally be given a route.** The type could be set and there was no way to author what it did, so Custom meant "stand still". A Route… button beside the dropdown opens the same dialog the Set Movement Route command uses, minus the two questions a page has already answered.


- **Buildings in 3D are solid boxes rather than a single wall.** A wall run drew one plane at the southern end of itself, so a building was inside-out from the north and a line from the east. Every wall tile on every map already records which of its sides face open air — that is what an autotile's shape *is*, sixteen of them for four neighbours — and the renderer was reading one bit of it and discarding the rest. It now builds each exposed side, one course of wall art per tile of height, with end caps where the run stops and none where it carries on. Nothing is authored and no project data changes: the information has been sitting in the map files the whole time.

- **A raised wall is capped with its roof.** A wall autotile draws a wall *face* and has no top, so a building wore its own front as a hat. A4 pairs a roof with every wall by its own layout — rows alternate, eight kinds to a row — so that pairing is derived. A3 is walls throughout and has none to derive from, so the tileset editor gains a **Roof** tool: click a wall, then click the tile that covers it. The roof picks its corners from the mass it covers exactly as the same roof painted flat would, so a run of wall reads as one continuous surface rather than a row of separate huts.

- **Panel: a 3D shape for things with a front.** A gate, a door, a signpost or a shopfront was drawn as a camera-facing cut-out, so it swung to follow the viewer — right for a bush, absurd for a gate you were walking through. A panel stands still, faces a direction, and has a little depth, so seen from the side it reads as a gate seen from the side instead of vanishing. Which way it faces is worked out rather than authored: a gap in an east-west wall faces south, a gap in a north-south wall faces east, a panel with something solid on one side turns its back to it, and anything else faces the way RPG Maker art is drawn. Set it per tile in the 3D Shape editor beside Flat, Upright, Scenery and Foliage.


- **A 3D map drew in 2D whenever it was the first one entered.** three.js is fetched the moment a 3D map loads, and the spriteset decides which renderer it is building the instant it is created — but the scene started the fetch and built the spriteset in the same tick, so the decision was always made before the two megabytes had arrived, and nothing asked again once they had. The symptom looked impossible from the outside: the library sitting plainly in `js/libs` and the map rendering flat anyway. The scene now waits for the fetch before building anything, and an ordinary 2D map is not delayed by a frame.

- **The 3D view in the editor no longer snaps back while you work.** Every rebuild — and one runs on every edit — re-framed the map, resetting both where the camera was looking and how far it had zoomed. Orbiting or painting threw the view away and put it back at the whole-map framing, which reads as the camera being broken rather than as a reset. The map is framed when it is a *different* map now; double-clicking empty space is still the way to put the whole map back in view, and is now the only thing that moves the camera on your behalf.

- **Editing a map in 3D no longer discards elevation painted since the last save.** The rebuild re-read `Map###.r3d.json` from disk each time, so heights that had not been saved yet were replaced by whatever the file still held.

- **Lights are lights on a 3D map, not pictures of light.** A lighting plugin draws circles and cones onto the screen, which over a 3D world lands flat across it instead of pooling on the ground and climbing walls. Reactor now reads the lights a plugin owns and puts them in the scene: a lantern becomes a sphere, a flashlight a cone down a corridor, and the ground and the buildings respond to both. **MVNovaLighting** and **PSYCHRONIC_RaveLighting** are covered, and both can be installed at once. Neither plugin is modified — its own flat lightmap is hidden while the real lights are drawn, and comes straight back when they are not.

  It is opted into per map with `<3d lights>` in the note, beside the `<3d>` that makes a map 3D at all, because a project already lit to its author's satisfaction should not have that quietly replaced. A map that has not asked keeps exactly what it had. The dimness of an unlit corner is authorable in the map's sidecar; the default is dim rather than black.

  Reading a plugin's internals is the only way to reach its lights, so that reading is quarantined in one small function per plugin, each free to fail: a plugin updated underneath Reactor costs its lights and prints one warning, rather than taking the map down.

  **Lights are drawn rather than simulated.** One `THREE.PointLight` per light is the obvious implementation and does not survive a real map: three.js sizes its light uniform arrays to the number of lights in the scene and compiles that count into *every* material's shader, so a city with a lantern on every corner overruns the fragment shader's uniform budget, the program fails to link, and the map draws nothing at all. Capping the count to fit is no answer either — twelve lights on a street of a hundred is not lighting.

  But a 2D lighting plugin never simulated anything. Its light *is* a shape: a radius, a colour, an alpha — a soft disc it stamps on the screen. So each light becomes a quad lying on the ground, sized to its own radius and tinted by its own colour, added to what is already there; a cone gets a cone. All the lights of one shape share a single geometry and material, so a hundred of them is one draw call and no shader uniforms whatsoever, and the buffers are allocated once and rewritten in place. The only real light in the scene is a single ambient one, which is the darkness the rest are read against.

  The lights are a pass of their own, drawn after the ground and after the tiles that cover characters, and composited by *addition*. Sharing a pass with those tiles will not do — a tree has to cover what is behind it, and light covers nothing — and drawing lights beneath the characters put every sprite, and the whole of the rest of the scene, on top of them. How strongly a light reads is a single number, because the alphas a plugin chose were meant for a flat overlay multiplied into a dark screen rather than a pool added to a lit one.

- **Characters can walk behind things in 3D.** The star flag is what lets the 2D tilemap draw a tree or a doorway *over* a character; in 3D the ground was one picture behind every sprite, so nothing could ever be in front of anyone and a character walked over the front of everything. Star-flagged geometry is now drawn in a second pass laid over the sprites, mirroring the tilemap's own lower and upper layers, so the same tiles occlude the same characters in both views. A map with nothing flagged pays nothing: the second pass only exists when there is something to put in it.

- **Sprites are sized by depth, so the people are in the same perspective as the map.** They were scaled by the projected height of a world-vertical segment, which is the natural measure and the wrong one: a pitched camera foreshortens such a segment, and that foreshortening eases with distance at close to the rate perspective shrinks it. The two cancelled — every sprite came out the same size wherever it stood, and the whole 3D treatment of characters amounted to nothing visible. A billboard turns to face the camera and is never foreshortened, so its size is the plain perspective divide, which is what it now uses.

- The star-flagged pass is drawn inside the tilemap, where the tilemap's own upper layer sat, rather than as a sibling of it — so fog, weather and plugin overlays cover it as they always did. The light pass sits above all of them and is kept there, because plugins add their layers long after the spriteset is built and each one lands on top of whatever is already there.

- A coloured light keeps its colour. The quads are added, so a channel pushed past full clamps while the others carry on climbing, and an amber lamp turned white from the middle outwards; the three are scaled together now, which costs brightness and keeps the hue. A cone fills the wedge it was given, too — both its falloffs were squared, which drew a thin bright plume up the middle of a correctly-sized beam and read as a narrow strip.

- **Characters are scaled by distance on a 3D map.** They were positioned by the projection but never sized by it, so a figure at the far end of a street was drawn exactly as large as one at your feet — the map was in perspective and the people on it were not. One tile of world height is the reference, so a character keeps its size relative to the ground it stands on.

- **Everything standing in 3D now shares one idea of where the ground is.** RPG Maker puts the foot of anything standing on the *bottom edge* of its cell — `screenY` is `scrolledY * tileHeight + tileHeight`, not the middle — and the 3D anchors used the cell's centre. Half a tile, on every prop and every character, which is why a street light sat short of the plate it stands on however its own height was measured. Props, character sprites, and the position plugins are told all use the same edge now.

- Event previews in the editor could show the previous map's art. An event whose graphic is a *tile* is drawn from the tile palette's sheets, and those load asynchronously when a map opens — so a preview drawn before they arrived used whatever tileset the last map left behind, until something forced a redraw. Those events are re-rendered once the palette has its sheets, and only on maps that have any.

- The editor allocated a fresh GPU texture for every event's character sheet on every rebuild of the event layer, and freed none of them — and each image that finished loading triggered another rebuild. Sheets are cached by path now, and dropped when the project changes.

- **Tall props stood halfway up their own height.** A standing cut-out uses its map rows as *height* — that is the whole idea of standing a drawing up — but anchored itself on the middle of those rows as though they were a footprint. So a four-tile street light planted its feet two tiles north of the tile it belongs to, which at a pitched camera reads as floating above the ground; the taller the prop, the further off it sat. Cut-outs now stand on their southern row, which is the row the player walks on and the row their base height was already taken from. Columns are genuinely width, so an object still turns about its own middle rather than swinging around a corner.

- An object could not be declared if it reached the top-left corner of a sheet. That cell is tile 0, which is also the engine's "no tile", so the declaration was refused — silently, since the two meanings had been conflated into one rule. They are separate questions now: tile 0 is a real *place* on a sheet and can be an object's corner, while a *lookup* for it is still refused, because an empty map cell reads as 0 and must not match anything. Overlap between objects is judged as rectangles on the sheet rather than by the tile ids they cover, which could not tell a real tile 0 from the 0 meaning "off the edge".

- The tileset editor's 3D Shape key gains entries for the **Roof** tool, and the pairing it records is drawn: a wall that has been given a roof is marked, and so is the tile serving as that roof. The tool could set a pairing that nothing showed, so there was no way to see it or find it again.

- The tileset editor's **Remove** appeared to do nothing. It removed the object, but the selection had been taken from that object a moment earlier and was still drawn — a box the exact size of the thing just deleted, which looks identical to it still being there. The selection now shrinks to what was dragged, the removal is saved, and it says what it did.

- A prop too wide for one drag can be declared in pieces. A B–G sheet is sixteen columns shown as two eight-column halves stacked, so a tower or smoke stack crossing the middle appears as two pieces on different rows of the palette and cannot be dragged out in one go — though it is a single rectangle on the sheet itself. **Shift-drag** now adds a piece to the object just declared, merging them in sheet coordinates.

- **The 3D ground is drawn into the game's own scene rather than on a canvas behind it.** Stacked canvases put the map outside the display list, and everything a game draws *over* the map assumes it is in there: a fog or lighting overlay set to MULTIPLY had nothing to multiply against and composited as a flat wash, so fog read heavier in 3D than in 2D; and the screen tone, which is a filter on the spriteset, never reached the ground at all. The 3D render is now a sprite where the tilemap's ground used to be, so tone, fog, blend modes and overlays reach it exactly as they reach a 2D map. It also removes the three separate opaque layers that had to be got out of the way to see it.

- Characters report where they actually appear on a 3D map. `screenX`/`screenY` returned the scroll-based 2D position, which on a 3D map is nowhere in particular — the ground is projected through a camera with pitch and yaw. Reactor's own character sprites already projected themselves, but everything else that asks a character where it is — lighting plugins, pop-ups, mini labels — was told the 2D answer, which is why a light sat somewhere other than the thing it belonged to.

- Going fullscreen left a 3D map drawn as a small rectangle in the middle of a black screen. The 3D canvas is a sibling of the game canvas rather than one of `Graphics`' own elements, so every rescale missed it and it kept the size it was built at. It now follows the game canvas through every resize, including entering and leaving fullscreen.

- **A full-screen black sprite was painted over the 3D map before anything else.** `Spriteset_Base` puts a `ScreenSprite` at opacity 255 — an opaque black rectangle covering the whole screen — at the very bottom of every scene, so the page cannot show through where the map does not reach. On a 3D map the map reaches everywhere and the 3D canvas *is* what should show, so PIXI was covering it before drawing a single tile. It is hidden while a 3D map draws, alongside the parallax, and restored for everything else. Together with the canvas alpha channel below, these were three separate opaque layers between the 3D ground and the eye, each one enough on its own to hide it completely.

- **The game canvas had no alpha channel, so nothing could ever be seen behind it.** PIXI decides whether the drawing buffer carries alpha *once*, when the renderer is created, from whether the background is already translucent — and never again. At the default it asks the browser for `alpha: false`, which makes the canvas opaque at the compositor level no matter what the clear colour says afterwards. A 3D map draws on a canvas underneath, so the ground was built, textured, aimed and rendered correctly every frame, and then composited away. The channel is requested at startup and the opaque default restored immediately, so a 2D map looks exactly as it did.

- **The 3D ground was drawn and then painted over, every frame.** The two canvases are stacked — 3D underneath, the game canvas above — so PIXI can keep drawing windows, pictures and every plugin sprite on top. That only works if the game canvas is transparent where nothing is drawn, and PIXI clears to opaque black. So the 3D scene built correctly, hid the 2D tiles as intended, and was then covered by the very canvas it was meant to show through: characters visible, no tiles, no 3D. The canvas is made transparent while a 3D map is drawn and opaque again for everything else — a 2D map, a failed build, or leaving the map for a menu or a battle.

- A parallax is no longer drawn on a 3D map. It is drawn on the game canvas, so it sat *over* the 3D ground and hid the world behind a sky. 3D maps do not draw a parallax yet; this is now why, rather than an oversight.

- **Asking whether WebGL works cost a WebGL context, every time it was asked.** Both capability probes — `Reactor3D.isSupported` and `Utils.canUseWebGL` — created a canvas and took a real context to find out, then dropped it on the floor. A browser's budget is about sixteen. `shouldRender3D` calls the first one, and *every character sprite calls that on every frame*, so a 3D map with a hundred events took a hundred contexts a frame; MV compat exposes the second as `Graphics.hasWebGL()`, which MV plugins call freely. The browser began evicting live contexts, which took out the game's own renderer and left PIXI compiling shaders against a dead context — a white screen, from a question with a fixed answer. Both are answered once now, and hand the probe context straight back.

- **A 3D map could take the whole game down with it.** The 3D scene is built inside `createTilemap`, inside `onMapLoaded`, which the scene calls from `isReady` — and `isReady` only marks the map loaded *after* that returns. So anything that threw while building left the scene reloading the map every frame forever: a white screen, and a fresh WebGL context each time until the browser began evicting live ones ("Too many active WebGL contexts", thousands of times). 3D is a *view* of the map; it can fail, and the map still has to draw. A failure now falls back to the 2D ground with the error printed once, and is not retried.

- **The 3D scene was built before the tileset sheets had loaded.** `createTilemap` starts the sheet loads and built the scene in the same breath, so its textures were read from bitmaps that were still empty. It waits for them now, retrying from the frame update — a sheet that never arrives leaves a 2D map rather than a hung game.

- A 3D map that renders flat now says why. Every gate between "the note says `<3d>`" and "the scene is built" — the note, WebGL support, three.js being present — could fail without a word, leaving an ordinary 2D map on screen that looks exactly like the feature not existing. The reason is printed once, and only for maps that asked for 3D.

- `node editor/build-scripts/sync-runtime.cjs` copies the canonical runtime into every bundled project, with `--check` to report drift without changing anything. Each project keeps its own copy of the runtime in `js/`, as a real project does, and they had drifted silently — a runtime fix verified against a stale copy has not been verified. A test now holds every project present to the canonical version.

- **The 3D view is framed and proportioned like the 2D one.** The camera sat at a fixed distance that showed about a quarter of the map, so everything arrived at twice its flat size: sprites upscaled past the resolution their art was drawn at, and every light twice the size its author chose. The distance is now derived rather than tuned — the point at which a tile under the focus covers the same pixels it would on a flat map — so it stays right on a project with a different tile size, resolution or field of view.

- **Cut-outs face the camera, so art keeps the proportions it was painted at.** Standing them bolt upright is the honest reading and the wrong one for flat art: a pitched camera foreshortens a vertical plane to about six tenths, so every character came out squat and every sign shorter than it was drawn. It also meant the two ends of a wide sign leaned by angles some fourteen degrees apart, which no sprite can reproduce, being a rectangle. Facing the camera removes all three at once — a quad parallel to the image plane projects to a plain scaled rectangle. The trade is that a cut-out leans back with the camera rather than standing in the world; it is authorable per map with `billboardTilt` in the sidecar, and props and sprites both read the one number so they cannot disagree.

- **Anything hung on a wall follows its art onto that wall.** A cell whose picture is stood up is no longer where the map says it is: it has moved onto a vertical plane at the wall's footing, some courses up. Signs, doors and the animations played on them stayed on the floor at their own row, so they sat at the wrong height *and* the wrong depth — and depth is what made them slide against their own building as the camera panned, because two surfaces at different distances do not move together. The lights a plugin owns follow the same rule, so a shopfront's glow lights the shopfront rather than the pavement.

- **Events that place a tile become part of the world.** A door, a sign, a chest or a barrel is usually an event with a tile graphic rather than painted art, and the scene was built from the tile layers alone — so those stayed flat while the identical tile painted one cell over stood up properly. A classified event tile is now built into the scene as a prop, and its flat sprite stands down so the thing is not drawn twice. Events that move keep their sprites, since a prop is baked in at build time and cannot follow anything about.

### Changed

- The tileset editor's **3D Shape** mode says more clearly what it has recorded. Selecting a declared object drew three boxes at once — the object's own outline, the selection tracing the same rectangle a pixel inside it, and the single-cell highlight the other edit modes use, sitting on whichever square was clicked. That last one made a click look as though it had picked one square out of the object, which is the opposite of what declaring an object is for. A selected object now carries one box and a wash across the whole rectangle, and the cell highlight is left to the modes that work a cell at a time.
- A declared object's class is drawn in the middle of the object rather than in its top-left corner, where it read as one cell standing up while the rest of the picture lay flat. Where the middle of an object is a cell that has been laid flat, the class rises clear of that cell's own bar instead of printing on top of it.
- The 3D selection is forgotten when you change tileset or leave the mode. It was a rectangle on one sheet of one tileset and was kept regardless, so it came back as a box around whatever art now occupied those cells — including on sheets it was never made on.
- The current development version is 0.97.0.

### Fixed

- **Grouping a building, saving, and reopening the project lost the grouping.** It was written to disk correctly and never read back: the map's 3D sidecar was attached only when the 3D view opened, which held while everything in it was something only that view could show. Painting again over an unread sidecar and saving would have written one built from nothing.

- **A whole structure vanished while it was still on screen.** A cut-out is not where its vertices say it is — its quad is built in the vertex shader, so every vertex of one object sits at the same anchor and the corners are carried out from it by a separate attribute. Three.js measures the bounding sphere from the positions, so it measured the anchors and nothing else: a six-by-six building had every anchor at a single point while its art reached almost seven tiles away, and it was culled the moment that point left the frustum.

- **Things drew over things they were standing behind.** A cut-out is drawn without writing depth, because its soft edges have to blend with what is behind them, so within one merged buffer the last thing written is the thing you see — and the order was whatever the grouping passes happened to produce. 2D never has this problem because it draws row by row. Cut-outs and wall runs are now emitted north to south, so whatever stands further north goes down first.

- **An animation played over the entire map however far away it was.** An animation carries no depth of its own, so it was left in front of everything — the convention in 2D, and fine there, but 3D draws the world in two passes and an animation floating over both is in front of the whole world. One played on a target now takes that target's place, so whatever covers the character covers its animation; one set to Screen is untouched, because it was never on the map to begin with.

- **A scenery event with a move route stood on the ground rather than on its building.** Pinning a walking event to a wall would carry it up the facade as it crossed, so having a route ruled the facade out flatly — but most routes on scenery do not walk. They turn, wait, or animate in place, and the event stands where the author put it for the whole game. The question is now whether the event has left home, not whether it has a route.


- **Chunks were missing out of mountain ranges in 3D on maps that look solid in 2D.** Where a tileset says one picture is drawn across several tiles, the 3D view was building it at the size of a single tile — so the art came out squashed and, being narrower than the ground it stood on, left bare strips beside it that read as bites taken out of the range. Cut-outs are now built at the size of the art they are drawn from, and never narrower than the cell they stand on.

- **A tile marked ☆ is drawn in front of ordinary tiles sharing its square in 3D, as it is in 2D.** The top of a column could appear behind a plate of food resting against it.

- **Objects turn about their own centre when the 3D camera is orbited, and stand where the 2D map draws them.** A column in the middle of a pool drifted to its edge as the view came round. Standing art now pivots on the middle of its square, while its visible base sits on whichever edge of that square is nearest the camera — which is where a real object's base reads from, and what keeps it seated at every angle.

- **An object no longer disappears in 3D when something is placed on top of it.** A plate set down on a column made the column vanish: a cell can hold several standing tiles, as it does in 2D where they are drawn one over the other, but the 3D view was taking only the topmost and discarding the rest. All of them are drawn now, in the same order 2D draws them.

- **A column with something resting on it no longer comes apart in 3D.** Its two halves were being treated as belonging to whatever was set down on them rather than to each other, so they drifted and turned as separate pieces. An object's parts are kept together, and anything sharing its square is its own object.

- **Painting a 3D shape onto a tile now takes effect straight away.** The Roof, Clear and Object tools saved the change; painting Flat, Upright, Scenery, Foliage or Panel did not, so it showed on the map only after switching the 3D view off and on.

- The 3D view no longer sometimes comes up blank until the mouse is moved over it.

- **Editing a tileset in the Database now shows up on the map straight away.** Changing passability, the star flag or a tile's 3D shape left the map editor using the old settings until the project was closed and reopened — the map keeps the tileset it read when it was opened, and nothing told it otherwise.

- **Opening a project with the 3D box ticked now gives you a 3D map.** The box stayed ticked from the previous project while the map came up in 2D, and had to be unticked and reticked before it agreed.

- **Tiles no longer take their layer from the tab they came from.** A tile from the B tab was placed lower than one from C, which was lower than one from D, purely because of the letter — so the same object sat at a different depth depending on which tab you happened to take it from. Tiles from every picture tab now go to the top of the stack, with whatever was already in the cell moving down beneath them — so something painted over another thing is the thing you see. Checked against nearly 300,000 authored tiles in the bundled projects. To put a tile *under* what is already there, choose the layer by hand. Tiles marked with a star — the ones drawn over characters, like a tree canopy or the top of a doorway — keep their place instead: a plain tile painted into the same cell goes underneath them, as it does in RPG Maker.

- **A tileset sheet added in the Database can be used immediately.** Adding one to the E, F or G slots left it missing from those tabs until you pressed Save beside the tileset's name, and a tile placed from one in the meantime disappeared, because the sheet had never been loaded. Assigning a sheet now tells the map and the palette straight away.

- **Walls cast shadows now, and lose them when erased.** Placing a wall left no shadow beside it, and erasing one left any shadow that was there behind — so a wall removed from a map still had its shadow sitting on the floor. Walls now shade the cell to their east as RPG Maker does, from the brush, the rectangle and circle tools, bucket fill, the eraser and a pasted stamp alike, and a shadow you painted yourself with the shadow pen is left alone.

- **A piece of map copied with a right-drag now comes down as a finished piece.** Pasting kept the exact tiles it was lifted from, so a stretch taken out of the middle of a wall arrived with no ends on it and read as a wall with a slice cut out. Autotiles are rebuilt where they land, the way RPG Maker does it, and a copy pasted against an existing wall joins it. Hold **Shift** to put the tiles down exactly as they were lifted instead.

- **Painting a tile over another one wiped it out, and left the new tile unable to join its neighbours.** A table set down on a floor erased the floor; a stretch of road erased and painted back came out with hard ends instead of rejoining the road either side. The editor chose which of the two ground layers a tile belonged on by looking at whether its artwork had transparent pixels, and that is not what decides it — a tile goes above what is already there when it is a *different* terrain, whatever it is drawn with. A tile also joins whichever layer the same terrain is already using right beside it, so a stroke continues the run it is touching rather than starting a second one underneath it. Checked against every autotile in the bundled projects' maps, nearly two million of them, the old reading agreed with how RPG Maker itself laid them out 84% of the time; the new one agrees on all but two. Bucket fill is unchanged: filling grass with dirt still gives dirt, rather than dirt on top of grass.

- **The front row of a mountain range floated above the ground in 3D.** Standing art that touches shares one base, so a wall with an uneven bottom does not tear apart — but that base was also being used to decide how high each part of it sat, and a range's southern edge steps back a tile at a time. Every column that stopped short was drawn hanging, with a gap underneath where the ground should meet it, which read as chunks bitten out of the front of the range. Over ten thousand columns across the bundled project's maps, some of them twenty-one tiles up. Standing art now comes down to the ground unless something is genuinely holding it up — an archway keeps its opening, because it has posts either side — and nothing about the depth it is drawn at changes.

- **The map jittered and snapped back when you panned past its edge.** Holding the scroll wheel and dragging moved the view immediately but only corrected it once a frame, so pulling past the edge drew the map outside itself and hauled it back a moment later, over and over. A pan now stops at the edge and stays there, and moving back the other way picks up straight away instead of having to undo the overshoot first.

- **A 3D map was darker than the same map in 2D.** The ground was shaded with a Lambert material under an ambient light on the assumption that full-white ambient equals unlit. It does not: three divides diffuse by pi, so "ambient 1" is nowhere near "unlit", and the exact factor moves between releases. Nothing here needs a light model — the lights are additive quads in a pass of their own — so the scene is now shaded the one way guaranteed to match the 2D tilemap pixel for pixel: not at all, with the ambient applied as a plain multiplier.

- **Signs crept against their own buildings while walking.** Three separate causes, each measured against the running game rather than inferred. The camera was aimed *after* the sprites had projected through it, leaving them a frame behind the world — invisible standing still, and worst for whatever sat furthest from the focus. A sprite's size was measured across one tile and multiplied by its height, which is wrong because perspective is not linear: a three-tile sign landed its top edge twenty pixels out at the near end of a street and fifty-six at the far end. And a cell's height was recorded as a single world number, when a cut-out's courses are stacked along an axis that leans with the camera; the wall's footing and the lift up it are now kept apart, with one helper turning them back into a world point so nothing works it out for itself.

- **Flashlights were the wrong size and hard-edged.** A cone's size is neither its `scale` nor its bitmap: `Sprite_Light.refresh` draws it at `scale / bitmap.resolution` times the bitmap, and `scale` for a cone holds a fallback the plugin never fills in. Reading either alone gave a ten-tile wedge or a two-tile needle. Lights are also built on the same camera-facing axes as everything else rather than lying flat on the floor, where the camera's pitch shortened them to about six tenths, and their pictures are drawn at four times the resolution with a softer shoulder so the edge fades rather than steps.

- **You walked in front of things you should have walked behind.** The tilemap re-sorts its children by `z` every frame, so the pass carrying star-flagged geometry — added last, with no `z` — sorted as 0, under every character at 3. Only two of the seven geometry primitives were asking whether a tile draws above characters, as well; all of them do now.

- **Doors and braziers trailed the party across the map.** An event whose tile is built into the scene has its flat sprite hidden, but the hide was applied while positioning and `update` settles visibility afterwards, so it was undone a moment later. The sprite was drawn a second time and never repositioned, and a stale sprite under a moving camera reads exactly like something following you.

- **Animations played at flat size over a 3D map.** An animation is not a child of the sprite it plays on — it lives in the spriteset's effects container — so it never inherited the scaling that puts a character in proportion with the world.

- The 3D preview in the tileset editor showed an empty box instead of the tile. Every path that renders a tileset layer caches its work under the file named the way it was loaded, with its extension; the preview looked the same layer up under the bare name held in the tileset record, missed every time, and fell back to drawing a blank placeholder. All of them now build that key one way. The test covering this had been written against the failing lookup, so it agreed with the preview and with nothing that fills the cache.

- The 3D preview drew every unclassified tile standing up. A tile's class was read for the tint on the sheet but not for the preview beside it, which always gave a single tile a standing role — so Flat, Upright, Scenery and Foliage all previewed identically, and the one decision the panel exists to show could not be checked in it. The preview now lies a Flat tile down, and names the class under the picture.

- A 3D tool that cannot apply now says why. Declaring an object on an A1–A4 autotile is refused by design — an autotile id is a corner arrangement rather than a place in a drawing, so a rectangle of the sheet means nothing there — but the refusal only reached the console, so the button appeared to be broken. It is written in the tool panel now, with what to use instead.

- Opening a second project kept the first one's tile size in the tile palette. The map canvas is rebuilt for each project and reads the size on the way up, but the palette is built once and kept for the life of the editor, so it never re-read it. Opening a 32-pixel project from a 48-pixel one therefore drew a correct map beside a palette whose grid lines and selection box were half again too big for the art under them. Every map load re-reads it now, which is also what an open project's Database change already went through.

- Event graphics on the map were drawn at 48 pixels regardless of the project's tile size, so on a 32-pixel project every event sprite overflowed its own tile by half and spilled across its neighbours. The same fixed 48 was in the event page editor's graphic preview and in the Transfer Player map picker, where it also put the grid and the click target out of step with the map being previewed.

- An event whose graphic is a tile took that tile from the wrong place on the sheet. B–E sheets are 256 tiles arranged as two halves of 128 drawn side by side; both surfaces that draw an event's tile graphic read them as one 8-wide grid instead, so any tile past the 128th sampled off the bottom of the sheet, and the F and G sheets added in 0.96.0 were mistaken for E. They now share the definition the map canvas uses.

- Projects that use a tile size other than 48 rendered as a mosaic of the wrong art. RPG Maker MZ lets a project choose 48, 32, 24 or 16 pixels and records the choice in `System.json`, and Reactor's own Database has always offered the setting — but the editor's map view, tile palette and tileset editor were written when 48 was the only answer, and sampled every sheet in 48-pixel steps regardless. On a 32-pixel project each read landed one and a half tiles further along than it should and the error accumulated, so the map drew as repeating fragments of unrelated tiles. The game itself was fine: the runtime already read the setting. Every surface that measures in pixels reads it now — the map view, the tile palette, the tileset editor, the hover preview and the 3D view — and changing the setting in the Database redraws the open map instead of waiting for the next launch.

- The tileset editor's marks did not fit a tile smaller than 32. The passage arrows sit a fixed distance in from each edge, so on a 16-pixel tile the left and right ones landed on the same point and every direction read alike; a ladder icon ran into the tile beneath it; and the 3D class marks came out a negative width, which a canvas draws *backwards*, into the neighbouring tile, rather than not at all. The marks now come in with the cell below 32 and are untouched at 48 and 32, where they are deliberately kept full size rather than shrunk to something nobody can read.

- The web editor did not start at all. It stopped on `Node module "os" is unavailable in RPG Reactor Web` before drawing anything. The component that launches extra editor windows on desktop asked for `os` and `child_process` while being constructed, and the web build has neither — it already knew to decline once it saw they were missing, but it never got that far, because asking was itself the error. It now asks in a way that can come back empty. **Not yet run against the web build** — `docs/HANDOFF.md` records what to check.

Next up is the unfinished 3D work listed under 0.96.0: wall tops, the forest
arrangement, parallax and sky, and incremental rebuild while painting.

## [0.96.0] - 2026-07-27

0.95.1 was an internal development version and was never published; its changes ship in 0.96.0.

### Still in progress

3D maps are new in this cycle and are honestly described as a first pass. What
follows is known to be unfinished — it is listed so nobody has to discover it
themselves. Everything here is opt-in: a map is only 3D if its note says `<3d>`,
and a project with no 3D maps is untouched by all of it.

- **Terrain needs authoring to look its best.** Which tiles stand up cannot be
  derived from a tileset — a shopfront wall and a forest are both simply
  impassable — so it is set per tile in the 3D Shape editor, and objects that
  span several tiles are declared there too. `derive-tileset-3d-classes.cjs`
  fills in a reasonable starting point from how your maps are already painted;
  expect to correct it rather than accept it.
- **Forests read as dense cover rather than as individual trees**, and a
  mountain range reads as one texture rather than as peaks. Both are drawn from
  the terrain's own lone variant, which is the right source; the arrangement is
  not settled.
- **Interior walls show the wrong art on top.** A wall autotile is a wall
  *face* and has no top, so a raised wall is capped with its own side art. The
  fix is to pair a wall with the roof drawn for it, which is not implemented.
- **Pits and craters stand up.** Their art blocks movement exactly like a rock
  does, and nothing in the tileset distinguishes a hole from an object. Set
  those tiles to Flat in the 3D Shape editor, once per tileset.
- **No parallax or sky.** A 3D map draws a flat backdrop; `parallaxName` is
  ignored. Battles are 2D, unchanged.
- **Editing a large 3D map is slower than editing it in 2D.** Every paint
  stroke rebuilds the whole scene. Fine at 100x50, noticeable at 200x200.
- The 3D Shape key and preview panels are English-only for now, pending a
  translation pass.

### Added

- **3D maps (HD-2D).** A map can be drawn in 3D: the ground lies flat, walls and buildings stand up, and characters stay as 2D sprites moving on the grid. It is opt-in per map — a map is 3D only if its note contains `<3d>` — and nothing else changes. Event commands, passability, regions and movement keep working on the same grid, and `Map###.json` stays standard RPG Maker data; elevation and camera live in a `Map###.r3d.json` beside it. A project with no 3D maps behaves exactly as before and never downloads the 3D library. Battles are still 2D.

- **Tileset 3D shapes.** Which tiles stand up cannot be derived from map data — a shop wall and a cliff face are both simply impassable — so it is authored. The tileset editor has a new **3D Shape** mode beside passability and terrain: click a tile to cycle it through **Flat**, **Upright** and **Scenery**. Upright treats a column of tiles as one picture and stands it at full height, which suits a building drawn as a single tall prop; Scenery raises the ground instead, which suits a forest or a mountain range, where the same tile repeats across an area. Autotiles are classified once and apply to all their shapes. Stored per tileset in `Tilesets.r3d.json`; a project that never classifies a tile never gets the file, and an unclassified map renders flat rather than guessing.

- **A 3D view in the map editor.** A **3D** checkbox beside the A1 toggle swaps the map canvas for a 3D view of the same map. Drag to orbit, Shift or right-drag to pan, scroll to zoom, and double-click empty space to put the whole map back in view. Events appear as their character graphic on a standing sprite with number and name above, or a coloured cube when they have no graphic. Click to select, double-click to edit, right-click for the same menu the 2D map gives you; selection stays in step with the events panel in both directions. A1 water animates, following the same A1 checkbox as the 2D canvas.

- **Painting works in 3D.** With tiles selected in the palette, dragging paints them exactly as in 2D — same brush, same autotiles, same undo — and the tile under the cursor is reported in the map bar. Without a selection, dragging orbits instead; Ctrl always orbits. Painting shares one implementation with the 2D canvas, so the two views cannot drift apart.


- Two more tileset sheets, **F** and **G**, giving 512 extra tiles on top of B–E's 1,024. They work exactly like B–E — same grid, same passability, ladder, counter and terrain tag settings, same layer stacking — and appear as tabs in the tile palette and slots in the tileset database. They use a range of tile numbers RPG Maker leaves empty, so importing an MZ or MV project can never conflict with them, and a project that doesn't use them saves exactly the same data as before. Maps that do use them still save in the standard format; only the two new sheets would be missing if the project were opened in RPG Maker itself.

- Event editor: Conditional Branch, Show Choices, and Loop can be folded away with the arrow beside them, so a long event no longer has to be scrolled past in full. A folded block shows how many lines it is hiding, nested blocks remember their own state while an outer one is closed, and folding follows the block if you edit commands above it. Folds are remembered per event page and survive closing the editor or restarting, so a page comes back the way you left it. Everything starts expanded, and a page you have never folded stays that way.
- Map properties: resizing a map now warns before it discards anything. Shrinking a map tells you exactly how many tiles will be removed and lists the events that will be deleted, and nothing is changed unless you confirm. Previously both were discarded silently, and events outside the new bounds were left behind invisibly.
- Map properties: a new anchor picker chooses which corner or edge your existing content stays attached to, so a map can grow from the top or left instead of only the bottom-right. Tiles and events move together, Set Event Location commands on the map follow, and the player and vehicle start positions are updated when they are on that map. Reactor also finds Transfer Player and Set Vehicle Location commands elsewhere in the project that jump to fixed coordinates on the resized map, and offers to update them so they still arrive in the right place. Top-left remains the default and behaves exactly as before.

### Removed

- An old tileset editor screen that could never actually open — it tried to build itself from a class that no longer exists, and nothing in the editor linked to it. About 1,300 lines went with it, including a passability overlay that read its markings from the wrong tiles on every sheet. The tileset editor you use in the Database is unaffected.

### Changed

- Bumped the current development version to RPG Reactor 0.96.0.
- The tileset screen in the Database shows all eleven layer slots without scrolling, and an unassigned layer now offers a **Choose Image** button where its tiles would be, instead of empty space. Double-clicking a layer row still works as before.
- Picking a tileset image uses the same modal styling as the rest of the editor, with a proper header and footer, and its file list is searchable like the other image pickers. It opens on the layer's current sheet, offers **(None)** at the top to clear a layer, and Escape, the close button, the footer, and clicking outside all dismiss it.
- Every tileset layer row has a **+** button that opens the picker for that slot, so a sheet can be swapped without hunting for the double-click.
- Every marking in the tileset editor is readable over any artwork. They are drawn straight onto the tiles, so a pale marker on pale ground — or a red X on red brickwork — could disappear into it. The O, X, star, damage and terrain-tag markings now carry a dark outline; the four-direction arrows and blocked dots, the ladder, the bush and the counter bar carry a dark edge. Colours are unchanged, just less washed out.
- Assigning or changing a tileset image now updates the map and the tile palette straight away instead of needing the editor restarted. Only the sheets that actually changed are reloaded, and the map is only redrawn if something on it uses them — adding a new sheet costs nothing.
- Map editing previews are cheaper: the preview used to create a fresh drawing object for every tile under the cursor, every time the mouse moved, on top of a layer type PIXI no longer supports for this. Most noticeable when dragging a large stamp or a wide circle brush across a big map.
- Map Properties now says which map you are editing: the header reads **Map Properties | 0211: Canite City** instead of just "Map Properties", and it updates as you type in the Map Name field. Renaming still only takes effect when you press OK.
- The Tileset dropdown in Map Properties now shows each tileset's number beside its name, so you can tell which database entry you are picking. It matches the numbering the Change Tileset event command already used.
- Map Properties now sizes itself to its contents and rearranges to fit the window. Map Name and Display Name share a row, as do Tileset and Scroll Type, and the panels pack into two balanced columns, dropping to one on a narrow window. The dialog no longer reserves a fixed height with empty space below it, and the whole thing stays visible without scrolling even with the BGM, BGS, and Battleback sections expanded. The Note box can also be dragged taller.

### Changed

- **Standing things in 3D are cut-outs that turn to face you.** They used to be fixed panels facing south, which is only correct from one direction: off that axis a structure read as a sheet of card folded up off the floor, and edge-on it vanished to a line. (A second panel crossing the first used to cover that, and it showed as a seam through the middle of the art.) A cut-out stays upright and spins to face you, exactly as the event sprites always have. Leaning it back towards the camera was tried, to stop cut-outs going edge-on as the camera climbs, and it cost far more than it bought: a leaning cut-out's art tips towards the viewer, so an object hangs off the point it stands on and that overhang swings as you orbit — at a 45 degree camera the top of a six-tile object sat 3.4 tiles from its anchor and travelled 4.8 tiles through a quarter turn. That was the drift, and the same overhang is why things looked lifted off the ground. Upright, the displacement is zero at every angle. Going edge-on is the camera's problem instead: the orbit stops at 72 degrees, short of the angle where standing art has nothing left to show, which is why an HD-2D game does not let you look straight down either. A whole object turns as one piece, about the middle of the row it stands in: a five-wide structure is a single cut-out, not five that fan apart as the camera moves, and it neither drifts off its cells as you orbit nor hangs above the ground in front of it. Walls are the exception and stay fixed, because a wall belongs to a building and faces a particular way.

- **Walls in 3D are solid mass, not standing panels.** A dungeon's walls were each drawn as a panel on the south face of their run, which was wrong in both directions at once: from above the walls vanished and a maze read as open floor, and from an angle a block of wall eight cells deep became an eight-tile tower. A walled area now raises the ground it covers, so the corridors are carved out of it and the wall art reaches the vertical faces through the same code that draws a cliff. Seen from overhead a dungeon matches its 2D map.

- **Almost everything on a B–E sheet stands up now.** A tile that blocks movement or draws above the character is a thing in the world — a tree, a peak, a landed ship, a shrub — not a marking on the floor. Requiring the ★ flag was far too strict, because an author sets it only where a character can walk *behind* something: a lone tree, a mountain and a ship all lay flat on the map while the forest beside them stood up. What stays flat is what is genuinely painted onto the ground — roads, cracks, scorch marks, anything walkable and unstarred. A pit or a crater is the case this gets wrong, since its art blocks the way like an object while being a hole in the ground; set those to Flat in the 3D Shape editor, once per tileset.

- Standing objects turn where they stand. The point a cut-out spins on was the middle of its front row, so a deep object swung around its own front edge as the camera went round instead of turning on the spot. It is the middle of the footprint now; the height it stands at still comes from the ground at its front row, so it stays planted.

- **A prop stands as a whole**, decided per piece of art rather than per tile, so one blocking or starred piece raises the whole picture. The launch gantry in the bundled project is three rows tall and only its top row is starred; read per tile, that stood its head up and left its legs lying on the ground.

- **A forest is drawn as trees now, not as terrain.** A tileset that paints a forest or a mountain range as a repeating texture almost always draws the single tree or the single peak as well — for an autotile that is shape 46, the piece it uses for one isolated cell, and on a B–E sheet it is usually the block directly above the tiling art. Reactor stands *that* on the cell instead of extruding the tiling art, which gave a wall of bark, or raising it, which gave a plateau of bark. Each cell carries one, sized and nudged off centre by a hash of its position, on a forest floor that rises slightly above the land around it, so a wood reads as a wood rather than as an orchard planted on a grid. The tiling art is not also laid flat under them: it is that terrain seen from above, so drawing both draws every cell twice, and at ground level the second copy showed as a mat of canopy around the feet of the trees growing out of it. The scatter is fixed per cell, so it never shifts when you paint elsewhere. Tiles carry a new **Foliage** class in the 3D Shape editor beside Flat, Upright and Scenery, and the stand-in is recorded per tile so it can be pointed somewhere else.

### Fixed

- Trees and mountains in 3D came out darker than the same art on the ground. The cut-outs were drawn by a shader written for them, which skipped the conversion three.js does from the texture's colour space to the screen's — and the fog with it, so distance never faded them either. They use the same material as the flat tiles now, with only the vertex position replaced, so a tree is the colour of the ground it stands on.

- Cliff and step faces in 3D were see-through. A face took its art from the topmost layer of the cell above it, which is usually a decoration — grass over dirt, a tree over grass — and a decoration's art is transparent everywhere the decoration is not, so a raised forest stood on a rim of holes with the sky showing through. Faces now take layer zero, the terrain, which is what the side of a step is made of.

- 3D maps stood forests and mountains on end as walls across the map. Which tiles stand up is authored per tileset, and a project's file could be filled in from the tileset flags — but impassable means a shopfront wall and a forest alike, and a column of forest cells collapses into one facade as tall as the run. On a 200x200 world map that turned a 58x39 forest into facades sixteen tiles high, with 68% of everything standing being terrain that should have been lying down. `editor/build-scripts/derive-tileset-3d-classes.cjs` now fills the file in from the maps instead: a building is one picture spread across its cells, so its tiles are mostly distinct, while a forest is a few tiles repeated over covered ground. Craters and rubble lie flat, water lies flat, blocked ground rises as a mass, and starred tiles stand. Run it per project and commit the result.

- Painting a wall autotile against the edge of the map cut off its end. A wall one tile in from the edge drew its finished edge; the same wall pushed right up against the boundary lost it. Reactor was treating everything off the map as more of the same tile, which is correct for ground and roofs — they carry on past the edge without drawing a border — but wrong for walls, which RPG Maker closes off. Checked against the maps in the bundled projects: of the 8,455 wall autotiles sitting on a map edge, 91% store the capped shape.

- Right-clicking a single autotile now picks the *kind*, so painting with it continues the pattern and works out its own corners and ends. It used to copy that exact piece, so picking the middle of a wall and painting produced a row of middle pieces with no ends. Right-dragging an area still copies it exactly, which is what makes it useful for duplicating a finished piece of map.


- Tile palette: switching to a different tileset layer kept the tiles you had selected on the previous one. The palette showed nothing highlighted, so it looked like no tiles were selected, but clicking the map painted the old layer's tiles anyway. Switching layers now clears the selection to match what the palette is showing.

- Tileset layers F and G painted as an eraser. They appeared correctly in the palette and the hover preview, but placing one wiped the tiles under it instead. The map editor holds two separate routines for turning a palette click into a tile number, and only one of them had been taught about the new sheets; the other returned tile 0, which is what "empty" means, so painting rubbed tiles out. Both now share one definition.

- Database: skills, weapons, items, and states created in the editor were missing fields the game engine expects every record to have, and each one failed differently in play. A new **skill** could not be used by any actor. A new **weapon** never showed up in the equip list and could not be equipped. Using a new **item** in battle corrupted the user's TP for the rest of the fight. A new **state** showed no battler pose and no overlay graphic. Clearing an existing record produced the same incomplete shape. All four templates now match what RPG Maker itself writes, checked against the records in the bundled projects.

- Event editor: the Scroll Map command had no "Wait for Completion" option, so an event could not wait for a scroll to finish. Worse, opening an imported command that already had it set and pressing OK quietly turned it off. The checkbox is now there and the setting is preserved.

- The title bar showed "RPG Reactor | Reactor One" for every project instead of the project you had open. This only affected the Wine/Proton compatibility mode, where Reactor draws its own title bar — that one was built with the demo project's name baked in and never updated. It now tracks the open project.

- Event commands: "Set Event Location → Exchange with another event" was showing and saving the wrong fields, so it swapped with the wrong event and lost the direction setting. It now matches what the game reads.

- Map export: waterfall tiles came out garbled in "Save Map as Image" and in the map-stamp preview for two of the water types.

- Map editor: choosing the eraser together with the bucket fill erased one tile at a time instead of flood-erasing. Flood erase now works.

- Web editor: keyboard shortcuts (Ctrl+S, Ctrl+Z/Y, copy/cut/paste, Delete) did nothing in the browser version. All of them work now.

- Audio player: turning looping off while a track was playing had no effect until the next track started.

- Sidebar: the divider positions you set were saved but never restored.

- Character Generator: imported sheets whose size isn't a clean multiple of 3x4 could jitter by a pixel on the middle walk frame, and "Normalize All Templates" said it had fixed the sheet when it hadn't. Both fixed.

- Map screen: large or edge-anchored plugin windows (HUDs, banners) could vanish while still partly on screen, because the off-screen check looked at the window's corner instead of its full size. Windows that draw only through gauges, names or state icons could also disappear. Both fixed.

- Event commands: opening any "Entire Party" command — Change HP/MP/TP/EXP/Level/Parameter/State/Skill or Recover All — and pressing OK silently retargeted it at the first actor only. Your inn and church heal events were affected. The setting is preserved now, and **Entire Party** is selectable in the dropdown, which it never was before.

- Event commands: a Show Text set to appear at the **Top** of the screen jumped to the bottom if you reopened it and pressed OK.

- Event commands: Fadeout BGM and Fadeout BGS were saved in the wrong unit, so the default "1 second" fade actually took a full minute in game, and a 5-second setting took five minutes. Existing commands imported from RPG Maker were displayed wrongly too.

- Events: creating an event with a graphic from the **bottom half** of a B/C/D/E tileset page saved the wrong tile, so the event showed a different graphic than the one you picked.

- Plugin Manager: adding certain plugins wrote incorrect default values into `plugins.js`, because settings belonging to a plugin's commands were being applied to the plugin's parameters.

- Database → System: Victory ME, Defeat ME, Game Over ME and the Boat/Ship/Airship music were reading and writing the wrong place, so those six rows always showed "(None)" and picking a track did nothing in game. All eight rows now work.

- Database: newly created animations played once in the middle of the enemy group instead of once per target on all-target skills.

- Database: the Traits and Effects lists in the Skill, Item, Weapon, Armor and State editors never refreshed after you added, edited or deleted a row. Beyond looking stale, deleting twice in a row could remove an entry you hadn't selected.

- Event pages: clearing the variable-threshold box on a page condition saved an empty value that the game read as zero, so the page could start running when it shouldn't. The field now keeps its previous value instead. Actor and Item conditions were also being saved as text rather than numbers, which could confuse plugins that read them.

- The Demo project that ships with the editor was missing two of its startup scripts, which would have left it stuck on the loading spinner for anyone who installed a fresh copy. The files existed but had never been committed. Both are now included, and a test checks the whole startup list so it cannot happen again.

- Tilesets: on some tiles, setting a terrain tag appeared to work in the editor but the game still read the old value. This affected tiles whose flags had been written by third-party tools, and Reactor was only clearing part of the value. The tag now applies, and the palette shows the number the game will actually use.

- Web editor: assets stored in a folder named `project` (for example `img/pictures/project/`) failed to load, because the file lookup matched the wrong part of the path. Fixed.

- Deployment: every released game included a complete second copy of the database. Battle Test leaves `Test_`-prefixed copies of all fourteen database files in `data/`, and the deployment step was copying them along with everything else — 15 MB of dead weight on one of the bundled projects, 13 MB on another, plus your saved test party. They are now skipped.

- Database and battle test: `Tilesets.json` and `System.json` were written by overwriting the existing file in place, so a crash or power loss during the save could take out the old copy as well as the new one. Both now write to a temporary file and swap it in, which is what the rest of the editor already did.

- Event editor: opening a plugin command and pressing OK erased its readable name, so `PSYCHRONIC_PTBS: Start PTBS Battle` became `PSYCHRONIC_PTBS: PTBS_StartBattle` in the event list — permanently, in the saved project. The name is now kept, taken from the plugin's own documentation when available, and the list shows it.

- Event editor: choice branches showed as `Choice 1`, `Choice 2` instead of the choice text, because the text was never stored on the branch. New choice commands record it, and the list shows it.

- Event editor: an event's Name and Note were written into the editor's own interface without escaping. A name or note containing HTML broke the fields it was displayed in, and because the editor runs with full system access, opening someone else's project with a crafted event name could have run their code on your machine. Both are now escaped, and a test checks every interface template for the same mistake.

- Event editor: adding a Play BGM/BGS/ME/SE, Fadeout, or Stop SE command inside a Conditional Branch, Loop, or choice branch placed it outside that branch. In the editor it appeared at the wrong nesting level, and in game it played even when the branch condition was false — along with every command after it in that branch. Existing audio commands were unaffected; only newly added ones.

- Animation timings: setting a sound effect's volume to 0 saved it as 90 instead. A silent timing is a legitimate setting and the slider goes down to 0, but the value was being treated as "nothing entered" and replaced with the default.

- Web editor: a save that browser storage rejected — running out of space is the realistic case — was reported as successful. The file looked saved for the rest of the session and then reverted to its previous contents on reload. Saving now reports the failure and names the files that could not be written.

- Undo after resizing a map could corrupt it. Painting, then changing the map size in Map Properties, then pressing Undo restored tile data sized for the old dimensions — the map rendered as garbage, and saving wrote that mismatched data to disk. Paint and event history are now cleared when a map is resized, and a restored snapshot that no longer fits the map is discarded rather than applied.
- Copying between two open editors now writes the shared clipboard atomically, so a large copy cannot be read half-written by the other instance.

- Tile palette: a tile holding only a thin sliver of art — the few pixels that continue an object from the tile above — could not be painted on its own. It counted as an empty tile, which switches the editor into erase mode, so painting with it rubbed tiles out instead of placing them. Selecting it together with the tile above worked, which is why it looked like the tile simply was not recognised. Genuinely empty tiles still switch to erase mode as before.

- Map Properties: the Tileset dropdown could appear as an empty collapsed sliver until a tileset was picked. It happened whenever the map pointed at a tileset that no longer exists — a cleared database entry, or a new map defaulting to Tileset 1 in a project whose tilesets start higher up. The dropdown now selects the first available tileset instead of nothing, and a project with no tilesets at all shows a normal-height control reading "(None)".

- Map Properties: the Battleback selectors were always visible, ignoring the Specify Battleback checkbox, and lost their two-column alignment when toggled.
- Web editor: the textual File/Database/Plugins/Tools/Forge/Help menu now displays clickable dropdowns. Its web-only horizontal scroll container clipped every submenu outside the bar; the menu now wraps on narrow screens while preserving visible overflow. The separate icon toolbar retains horizontal scrolling.
- Map tree: New Map from a map's context menu now inserts the map immediately after that target as a sibling at the same hierarchy level instead of appending it to the bottom of the root list. Creation without an explicit context target uses the currently highlighted map as its insertion anchor.
- Map editor: Auto-layer paint bucket fills now preserve unrelated upper tile planes. Filling a lower floor beneath Layer 4 walls changes and reconnects only the resolved lower destination layer instead of clearing or reshaping the walls above it; explicit Layer 1-4 and eraser behavior remain unchanged.
- Packaged editor: launching the Windows executable, macOS app, or Linux executable again now opens another isolated RPG Reactor process instead of routing the request back into the first instance. Repeated launches receive atomically leased Chromium profile slots, while existing project locks continue preventing two editors from writing the same project.
- Windows editor deployment: interactive developer builds no longer require `resedit` while finalizing the executable. App-owned PE metadata remains mandatory for release builds, but SDK/normal developer packages can now complete from Linux-hosted NW.js workers as intended.
- Database deletion: the toolbar Delete button now matches keyboard Delete and Cut by clearing records to blank templates in place. Tileset IDs, rows, and maximums remain stable even when clearing trailing records; macOS Backspace is accepted as Delete. Previously toolbar deletion stored hidden `null` slots, making packaged-user results appear different depending on input method. Opening any top-level list — Actors, Items, Skills, Weapons, Armors, Enemies, States, Troops, Classes, Animations, Common Events, and Tilesets — repairs those persisted hidden slots into visible blank same-ID records.
- Localization: seven languages showed large parts of the editor in English. Chinese (Traditional and Simplified), Russian, Portuguese, German, French, and Greek inherited the English table, so roughly a third of the interface — the whole Effekseer Forge, event page fields, and toolbar tooltips — was never translated. All are now complete, and a new test fails the build when a key is added without translations instead of letting it quietly render in English.
- Multiple editor launches: two launches starting at the same moment after a crash could both claim the same Chromium profile, which is exactly the collision the isolated-instance support exists to prevent. Slot takeover is now serialized so only one launch can claim a recovered slot.
- Map tree: a new map whose file could not be written no longer stays in the map list. The list is restored to its previous contents and ordering, so a failed save cannot leave behind a map that does not exist on disk.
- Bundled Demo: Deploy Game on the bundled Reactor One Demo failed with "Project runtime is incomplete". The Demo's engine files had fallen behind the current runtime and were missing the picture extensions and LZString entirely, so the Demo also ran an older engine than the editor shipped — without the level-999 support, gamepad input fixes, and save-path handling. Its runtime now matches the engine exactly.
- Runtime performance: drawing to a bitmap no longer sends the whole image to the graphics card on every single operation. Anything that redraws text or images repeatedly — the victory aftermath EXP count-up most visibly — was uploading its entire window hundreds of times per frame; the uploads are now batched and sent once, just before drawing. This was the actual cause of the aftermath stutter.
- Runtime performance: text colours are now read from the windowskin once per colour instead of on every use. Windows that redraw each frame — the victory aftermath EXP count-up most visibly — were performing thousands of one-pixel image reads per second, whose constant memory churn showed up as stuttering.
- MV compatibility: battle animations played on party members are no longer mirrored. MZ flips every animation shown on an actor; MV never did, so MV animations are drawn to play as-is. The reversal was invisible on symmetrical effects but obvious on any animation containing words — Star Shift Rebellion's "Counter" animation read backwards. MZ-authored projects keep MZ's behavior.
- MV compatibility: showing a choice could crash the game with "Cannot read properties of null (reading 'start')". Plugins and custom battle scenes create extra message windows that the scene never wires up, and a choice arriving on one of those had nowhere to go. Choices now fall back to the scene's real choice window, so they still appear and can be answered. Reported in Star Shift Rebellion.
- MV compatibility: a Set Movement Route with Wait in one event could make a later event's move route finish instantly instead of waiting. The character being watched was remembered but never forgotten, so once an event ended, the next one could check the wrong character — one that had already stopped moving. Reported in Star Shift Rebellion as move routes running all at once.

## [0.95.0] - 2026-07-20

Cycle overview: [RPG Reactor 0.95.0: A More Complete Editor](docs/devlogs/2026-07-18-rpg-reactor-0.95.0.md).

0.94.9 was an internal development version and was never published; its changes ship in 0.95.0.

### Added

- Localization now covers statically routed editor text across all 18 supported languages. A generated deep catalog fills database, event-command, Forge, build, project, and web-host surfaces; source-audit tests enforce locale parity, consumed Terms schemas, interpolation placeholders, and Arabic right-to-left document direction without translating project-authored game content.
- Control Variables now presents Game Data through an RPG Maker-style nested selector instead of raw numeric IDs. Items, weapons, armors, and actors use database names; actor, enemy, character, party, Other, and Last Action Data operands expose their stock property choices; the parent command displays a readable summary; and Cancel/Escape remain transactional. Last Action Data and Troop battleback layer labels are translated across every supported language with explicit no-fallback tests.
- Added reproducible release-candidate and publication workflows for Linux x64, Windows x64, Intel macOS, and Web. Public builds pin NW.js 0.107.0 to trusted SHA-256 values, package the tracked Reactor One Demo starter, bind artifacts to their source commit and hashes, require native signing/notarization for publishable Windows/macOS candidates, and publish the inspected candidate bytes to GitHub and optional itch.io channels without rebuilding.
- Security and project lifecycle hardening escapes project-authored content on privileged editor surfaces, rejects unsafe/non-empty project destinations, uses token-owned exclusive project locks, ignores stale asynchronous map loads, and strengthens atomic writes against temp-file collisions and symlink replacement.
- The Database uses nearly the full viewport and gives scrolling to its child panes. Types now presents Elements, Skill Types, Weapon Types, Armor Types, and Equipment Types together in a dense workspace with keyboard/pointer multiselect, Cut/Copy/Paste, custom context menus, ID-preserving bulk clear, Add, and confirmed Change Maximum controls. Terms presents Basic Statuses, Parameters, Commands, and grouped Messages in one compact workspace with native text clipboard menus. Both reflow in the Web editor.
- Multiple Reactor instances can exchange MZ-style authored data through one typed system/shared-file clipboard. Whole maps; single or multi-selected batches of Actors, Classes, Skills, Items, Weapons, Armors, Enemies, Troops, States, Animations, Common Events, and Tilesets; individual trait/effect rows; whole map events; event and troop pages; map/common/troop event-command blocks; movement-route commands; and Plugin Manager groups can be copied between two open projects. Database batch pastes overwrite consecutive destination slots while retaining each destination ID, list selection/scroll position survives refreshes, incompatible categories are rejected, and the newest shared payload wins over stale in-window clipboard state. Trait/effect references to elements, states, skills, types, equipment slots, and Common Events resolve by unique name in the target project; missing or duplicate targets reject the paste instead of retaining an unsafe source ID.
- Conditional Branch now edits every RPG Maker MZ condition type (0-13), including all Actor/Enemy subconditions, character direction, variable operands, equipped-item checks, button modes, and vehicles. Existing arrays remain byte-identical when unchanged, legacy Button arrays remain readable, and new edits serialize in canonical MZ form.
- Event commands now extend beyond the stock MV/MZ authoring surface without changing the project format. Control Variables can build arithmetic, trigonometric, random, bitwise, and min/max expressions; Common Event calls can use a variable ID or invoke a current-map event page; and Conditional Branch can test expanded keyboard states, mouse buttons/wheel, and pointer coordinates. Loop remains the direct stock Loop/Repeat Above structure. Portable forms remain ordinary stock event commands, while Reactor-generated scripts carry strict versioned metadata so only an exact unmodified command reopens in its structured editor.
- Picture commands now support direct or variable picture IDs, variable Move duration, One/Range/All erasure, initial or tweened angle, custom anchors, sine-wave offsets, and Overlay blending. Negative X/Y scale remains the picture-flipping workflow and now supports the full `-2000..2000` editor range, including Quick Setting preview. Dynamic scripts include stock MV/MZ fallbacks; Reactor-only visual state lives in the isolated `reactor_picture_extensions.js` runtime module, and Overlay safely renders as Normal when renderer back-buffer support is unavailable.
- Show Picture now includes RPG Maker-style Quick Setting placement. A responsive grid marks the project's configured screen resolution inside a larger off-screen workspace; the selected picture can be dragged through and beyond that workspace or positioned numerically across the full command range. The modal measures its controls and scales naturally with window/fullscreen dimensions while preserving the project's exact aspect ratio. Origin, X/Y, width/height scale, and opacity are editable in the modal, while the Quick Setting button shares the image row. Move Picture uses the same surface to animate from the latest preceding Show/Move state with live duration-frame entry and the command's easing; a picture with no preceding visible Show remains absent from the preview.
- Map editing now supports MV/MZ-style rectangular sampling: right-drag over the map to capture all four visual tile planes, shadows, and regions, then left-click or drag to stamp the copied patch. A translucent composite preview follows the cursor, reverse drags and map-edge clipping are supported, transparent source cells intentionally clear destination layers, and each placement stroke is one Undo action. Events remain separate, matching RPG Maker behavior.
- Holding Shift while painting A1-A4 autotiles with the Pencil, Rectangle, or Circle tool now places the selected shape exactly without reconnecting it or reshaping neighboring autotiles. Shift-drag remains map panning for other tile layers and tools.
- Map editing now has a persisted A1 autotile-animation preference, enabled by default and available from both File → Options and a compact synchronized checkbox in the map-info strip. Disabling it removes the editor ticker and holds water and waterfalls on their first frame without changing playtests or deployed games.
- Added stock-MV-compatible LZString runtime support and load-order validation for synchronous MV/YEP saves, plus regression coverage for desktop paths, browser keys, Unicode saves, and real `N4Ig...` save payloads from a large MV compatibility fixture.
- Added focused regressions for Unicode Tileset URLs and Audio Player sections, project lock/BOM/retry diagnostics, transactional Event-mode creation/editing, MV package repair, the PIXI 8 start/stop-before-init race, and the ES5 Filter compatibility source contract.
- Added recursive project-asset discovery across audio, animation sheets, Effekseer effects, characters, faces, battlers, tilesets, battlebacks, parallaxes, title images, and plugin file parameters. Pickers store extensionless forward-slash relative names, keep RPG Maker core assets to runtime-safe lowercase `.ogg`/`.png` files, preserve `$`/`!$` character-sheet classification inside subfolders, and resolve encoded preview URLs on desktop and Web hosts.
- Added live name/path search, Unicode grapheme section rails, sticky headers, and keyboard-selectable results to the shared image picker, event character picker, and Show Text face picker. This covers actor character/face/SV graphics, enemies, vehicles, animation sheets, event frames, and facesets; search is case/accent-insensitive and current event frame restoration is guarded against stale image loads.
- Added visual System 1 starting-position selection for the Player, Boat, Ship, and Airship by reusing the Transfer Player map canvas. Map/X/Y commit together only on OK, manual numeric fields remain available, nested map navigation and overlapping preview loads are guarded, and the Title Screen image chooser now uses the searchable Unicode browser with a side-by-side preview.
- Added searchable Plugin Help & Documentation with safe highlighted matches, active/total counts, wraparound previous/next controls, Enter/Shift+Enter and F3/Shift+F3 navigation, plus Plugin Manager-scoped Ctrl/Cmd+F. The main load-order list filters loaded plugins by name, description, or author, and the Add Plugin dialog filters available filenames. Remove Plugin and Save Changes now share a persistent bottom action bar, with Save on the right and available regardless of selection. Help search state is cleared when plugin/project details reload and cannot steal shortcuts from nested parameter dialogs.
- Reworked complex Plugin Parameters around RPG Maker's metadata model: every independent `/*~struct~Name: ... */` block is parsed, nested struct and simple arrays use named list rows instead of numbered JSON dumps, notes use multiline fields, groups and controls align on stable grids, and nested editors reuse the correct plugin schema. Rows support buttons, double-click editing, and direct full-row drag-and-drop reordering with insertion feedback; alternating surfaces and neutral group headers follow the active theme. Element dialogs use an explicit OK action. Schema-guided decoding preserves JSON-looking string leaves; Cancel and Structure/Text switching are transactional; serialization restores RPG Maker's nested JSON strings. Verified against a real nested `YEP_OptionsCore` fixture with an exact byte-for-byte round trip.

### Changed

- Bundled Forge content includes Psychronic and Looseleaf Character Generator styles, with Psychronic as the default. Project JavaScript and PNG styles remain available and load automatically. Portal is available in both animation generators; the registries contain 76 Animation Generator recipes and 106 Effekseer recipes (Energy: 15).
- Bumped RPG Reactor to version 0.95.0.
- System 2 Magic Skills is now an ordered, fillable list of Skill Type IDs, matching MZ's data model and side-view casting behavior instead of presenting independent checkboxes.
- Tightened the Troops and Animations database workspaces for lower-resolution screens. Troops places its runtime-aligned Battle Preview on the left and stacks Battle Test, Members, Battleback, and Note in a compact right sidebar that collapses below the preview on narrow web layouts; Battle Events remains full-width below. Enemy homes, bottom anchors, battle-field offsets, battlebacks, and dragging match runtime screen/UI-area geometry across MZ, converted MV, and widescreen projects. Battle Test equipment follows actor-plus-class equip permissions, omits empty incompatible slots, preserves only actionable stale entries, and leaves scrollbar spacing. The Conditions dialog uses aligned rows with contrasted modal chrome. Animations uses side-by-side sprite properties, a shorter sheet strip, bounded summary/preview surfaces, narrower frame/effect controls, and local scrolling where needed while preserving 960x540 preview data and accurate scaled pointer editing.
- Troop Members now uses the shared searchable Unicode-indexed picker with a battler preview for both Add and Replace. Member rows expose their troop and database numbers, open Replace by double-click or Enter, and support focused Cut/Copy/Paste/Delete shortcuts plus matching right-click actions.

### Fixed

- Editor deployment: ordinary interactive builds no longer apply the immutable public-release hash policy to Latest Stable or user-selected NW.js versions. Windows editor SDK packages can cross-build from Linux without invoking `resedit`'s unsupported ESM loader inside an NW.js worker; app-owned Windows version metadata remains mandatory in the Node-based release pipeline.
- Editor: the File → Options Palette picker no longer falls back to English names and descriptions in Traditional/Simplified Chinese, Russian, Portuguese, German, French, and Greek. Theme choices and the new autotile preference are localized across all 18 supported languages, with regression coverage for every palette description.
- Editor: after selecting an enemy in the Troop preview, Delete now removes that member instead of clearing the entire Troop database entry. The preview owns keyboard focus and consumes Delete even when no member is selected.
- Editor: expanded Plugin Help no longer compresses the Parameters area below the visible detail pane. Documentation remains independently scrollable, can be resized vertically from its lower-right grip like Notes fields, and the overall plugin detail pane scrolls through metadata, help, and every parameter. Help-search navigation uses contrasted theme-aware buttons, while the surrounding search card stays neutral and only the focused text field receives an accent highlight.
- Editor: Actor equipment no longer renders every named global Equipment Type as an unusable row. Actor and Battle Test equipment now treat explicit class slot lists as authoritative, independent of their source, and otherwise use standard engine slots plus actor/class item permissions. Slots without an actor/class-permitted weapon or armor are hidden unless they contain relevant stale data; sparse Weapon/Armor/Equipment Type lists also retain their real IDs when authoring equip traits.
- Runtime: converted MV projects using YEP Save Core load their existing `.rpgsave` files again. The PIXI 8 runtime had retained the LZString fallback code but stopped shipping/loading the decoder, so compressed text reached `JsonEx.parse` unchanged. Reactor now reads and writes stock MV-compatible payloads and honors MV/YEP `localFileDirectoryPath`, `localFilePath`, and `webStorageKey` contracts.
- Runtime: side-view actors in a large MV compatibility fixture now use the same final Victor Engine damage-popup path as enemies. MOG BattleHud had captured the pre-Victor popup method on `Sprite_Actor`, causing actor TP/state/custom popups and some combined results to be consumed without rendering; post-plugin compatibility now delegates dynamically while preserving MOG's front-view face behavior.
- Runtime: MOG Treasure Popup labels and inline icons no longer lose their right and lower portions to MZ's `_clientArea` clip; only that plugin's intentionally full-size contents sprite is restored to MV parentage. Legacy video parallaxes can parent children on PIXI 8 `TilingSprite` without deprecation warnings, and intentional empty-source video teardown no longer logs a false media failure while real missing-video errors remain visible.
- Editor/runtime: Database Change Maximum now displays and enforces workload-aware ceilings instead of accepting values such as 99,999 and synchronously allocating every slot. Reactor retains MZ's 9,999 major-record/Common Event and 1,000 Animation/Tileset capacities; large databases remain one continuous list, rendering the first 250 rows immediately and appending later batches near the bottom. Cancel baselines use compact JSON instead of a duplicate live object graph, and growth reuses one template serialization. Reactor extends Actors to level 999 with finite class-stat extrapolation, raises Skill/Item and Attack Times repeats to 100 with a runtime backstop, supports 2,000 maps across IDs through 9,999, and raises every System Type ceiling above 99. Constant-time numeric fields such as price, costs, speed, success, gain, and variance are no longer clamped merely to match MZ's editor.
- Editor: pasted maps now appear immediately after the currently selected map as its next sibling, preserving that map's hierarchy level and shifting later siblings in place instead of appending every paste to the bottom of the root map list.
- Editor: successful Save All while the Database remains open refreshes the Cancel baseline, so Cancel returns to the latest saved state instead of data from before that save.
- Editor: Tileset A-E previews no longer disappear when the map renderer has not initialized or when project/image paths contain Unicode, spaces, or URL-significant characters. The compact editor now retains its dynamic project context and routes every Tileset image through encoded native/web asset URLs.
- Editor: the Audio Player's left-hand filename index is Unicode-aware. Accented Latin, Greek, Cyrillic, Chinese, Japanese, Korean, and other letter initials receive their own visible sections instead of all falling under `#`; canonically equivalent accents share a section, while numeric and punctuation prefixes remain grouped under `#`.
- Editor: opening a project that is already locked by another Reactor instance now stops after the specific lock warning instead of incorrectly following it with an “invalid project” prompt. Actual project-load failures retry brief partial/locked JSON reads, accept UTF-8 BOMs used by some localized tools, report the failing file/reason, and read controller-owned `MapInfos.json` only once per open.
- Editor: Event Editor sessions now use isolated drafts. Double-clicking an empty in-bounds tile opens a detached default event; Apply or OK inserts it and records one Undo snapshot, while Cancel, X, or backdrop dismissal leaves the map unchanged. Existing-event Apply commits once and refreshes the Cancel baseline, OK commits and closes, and no-op Apply creates no Undo entry.
- Editor: map events visible on the canvas no longer disappear from the left Events list when an imported or third-party map stores a real event at array index 0 instead of RPG Maker's conventional leading null. The sidebar and sprite renderer now use the same truthy-event rule, sparse high IDs remain visible, malformed graphics cannot abort list construction, and creation/deletion safely handles compacted or ID-mismatched arrays.
- Editor: imported MV projects whose existing `package.json` has a missing, non-string, or blank `name` or `main` no longer fail playtest with NW.js's “Required value 'name' is missing or invalid.” Runtime installation and desktop playtest now repair only those launch-critical fields while preserving custom MV window and JavaScript settings; malformed/non-object package files stop before conversion or process launch with the exact path and parse reason.

- Editor: preview surfaces no longer leak browser-capped resources across a long session. Chromium caps live WebGL contexts (~16) and AudioContexts (~6) per page: the animation picker, the Animations database page, and its effect-file picker each created a fresh WebGL + Effekseer context per open and never released it (eventually blanking every 3D preview in the editor), and the System audio picker leaked an AudioContext per open (eventually silencing audio previews). All of them now release their contexts on close. The Animations page also removed none of its document-level keyboard/drag handlers when switching animations — the leaked keyboard handlers kept applying Ctrl+V/Delete shortcuts to previously viewed animations' data — and the actor and event-page character walk previews leaked an animation timer per view, pinning their preview frames in memory forever. The Effekseer Forge's window-level drag handlers similarly retained every discarded preview canvas across remounts.
- Editor: editing an If or Show Choices that contains nested branch structures no longer corrupts the event — the rebuild treated any nested End marker as its own, removing the wrong command range and orphaning markers. Empty branches keep their place so later bodies can't shift into the wrong branch, the cancel-branch body stays bound to the Cancel branch when choices are added or removed, and edited structures keep their indent when nested inside other branches (they were re-inserted at indent 0, which breaks branch routing at runtime). Editing an If also no longer silently adds an Else branch — a new "Create Else Branch" checkbox mirrors the edited command, like MZ. Applies to both the map event editor and the common-events editor, and copy/cut/delete of nested choice structures now selects the correct range.

- Editor: whole-map paint bucket fills apply in a fraction of a second instead of 30-40 seconds — huge tile-update batches now route through the streaming full re-render (which preserves the scroll position) instead of 100k+ incremental sprite updates, and the water-animation bookkeeping in batch updates is no longer quadratic. Undo and redo also keep the current scroll position instead of jumping back to the map origin.

### Fixed — deep audit (editor)

- Critical project writes use randomly named, exclusively created no-follow temporary files, preserve destination permissions, flush file contents before rename, flush the parent directory where supported, and clean failed temporary files. A crash, kill, full disk, stale temp name, or symlink collision can no longer destroy the previous good `project.rpgreactor`, `MapInfos.json`, map, database, or plugin-manifest file.
- Deploying a game saves the project first, like playtest does — builds no longer silently ship whatever was last on disk.
- Editing autotile passability/ladder/counter/terrain flags in the Tileset database works — edits landed on the wrong flag slots (shape slots of the first autotile), so they never took effect in game; they now index by kind and mirror across all 48 shapes like MZ.
- Class parameter curves generate against the right levels (values were shifted one level low, with Lv1 written into an unread slot), enemy action HP/MP conditions survive editing (fractions were truncated to 0 on every OK), and Attack Element traits store the correct element (they were off by one).
- Database Cancel actually reverts everything since the database was opened — switching categories used to re-baseline the snapshot, silently keeping (and later saving) "cancelled" edits.
- Show Choices, If/Else, and inserted/pasted commands get correct MZ indents — branches authored in Reactor previously misrouted at runtime (choice bodies skipped, Else running alongside Then); deleting an If/Loop/Battle header now removes its whole block instead of leaving markers that could loop the interpreter.
- Change Gold wrote its parameters in the wrong order (gaining a variable-amount of gold gave 0), and editing a variable-designated Transfer Player no longer rewrites it into a direct transfer to raw variable IDs.
- Mouse-wheel zoom no longer compounds with every map loaded in the session, middle-mouse/Shift+drag panning works (it was dead code), the region overlay survives map switches, the eraser on the Regions tab erases regions instead of hidden map tiles, and drag-reordering a map "before" a sibling actually reorders it.
- Animation Generator: saved keyframes are no longer wiped on every tool switch (the loader dropped them and the autosave made it permanent), Reset Layer resets the live keyframe instead of orphaning future edits, and a pending autosave can no longer write one project's layers into another.

### Fixed — deep audit (runtime)

- MZ battles show battlers again with the MV-plugin battle-field compatibility active — the early-created battle field rendered UNDER the battlebacks (verified by booting into a battle: field index 1 vs battlebacks 3-4; now above, matching MZ).
- Two unbounded texture leaks fixed: every sprite frame change (walk cycles, blinking pause signs) and every map transfer's tile batch stranded PIXI v8 textures on session-lived texture sources forever; long play sessions now hold steady.
- Balloon cleanup runs again on scene teardown (a duplicate destroy override dropped it), fixing a permanent event soft-lock when a scene change interrupts a balloon wait.
- Event-vs-event collision uses the MZ rule (only normal-priority events block); MV games keep the MV rule via the compat layer.
- Move-route/animation/balloon waits survive save/load in MZ games using MV plugins (a live character reference was being serialized into saves; the loaded clone froze the wait forever), and encrypted MV games detect their encryption again (the flags were captured before encryption info loaded).
- The v8 geometry shim no longer corrupts vertex data on PIXI v5/v6/v7, destroyed audio buffers are no longer re-downloaded ~10s later by the load watchdog, and per-frame sprite refreshes stopped allocating on the unchanged path.

### Fixed — audit backlog cleared

Every remaining Medium and Low finding from the 2026-07-13 deep audit is fixed in this cycle:

- Editor data integrity: audio command editors no longer commit their edits when you press Cancel; Battle Test keeps its preview battlebacks in the Test_ data instead of writing them into the real System.json; removing an interior Element/Skill/Weapon/Armor/Equipment type blanks the entry instead of renumbering every later type reference (the trailing entry still truly removes); clearing an actor's Initial/Max Level or class field no longer writes null into Actors.json; the picture and animation-cell editors preserve legitimate zero opacity/scale values; Show Text keeps interior blank lines; Show Choices remaps its Default/Cancel references when blank choices are filtered out; System 2 Advanced edits work on MV-era projects that have no advanced block; and names, notes, and messages containing quotes, ampersands, or angle brackets survive database editing round-trips (one shared attribute-safe escaper across all database editors — the previous div-based escaping never escaped quotes inside attributes).
- Editor reliability and speed: deleting a map persists MapInfos.json before unlinking the map files, so a failed save can no longer leave phantom entries pointing at deleted maps; the maps sidebar builds its tree in one pass instead of scanning the whole map list per node; saving the database writes System.json once per batch instead of after every single file; the plugin manager no longer writes a manifest (and pops an alert) just from being opened on a manifest-less project, caches plugin metadata by file mtime instead of re-reading and regex-parsing every plugin source on each open, and keeps full @help text out of the boot manifest; palette transparency detection works again, so selecting a transparent B–E tile arms the eraser instead of painting invisible blockers; merged-A palette drags clamp to the sub-layer they started in instead of building out-of-range tile IDs; A1 hover previews show the correct art for kinds 4–7; autotile-graphic event thumbnails render under PIXI v8 instead of blank; opening map properties survives a corrupt map file; playtest survives a failing map-reference repair; and the audio player no longer stacks a scroll listener per tab switch.
- Editor performance: clicking a command in the event editor restyles the selection in place instead of rebuilding the entire list DOM (and re-decoding face thumbnails — those are now cached per face sheet, and the command-name table is built once instead of per row); dragging an event moves its one sprite per tile step instead of rebuilding every event sprite (which also leaked a label texture per rebuild) and no longer resets the sidebar scroll; the Character Generator composes its 12-cell walk sheet once per part change instead of re-rendering all 12 cells on every 170ms animation tick; and Outfit Forge part thumbnails are memoized by spec, so a control change re-renders one thumbnail instead of running the full 12-frame engine ~20 times.
- Forge tools: Outfit/Hair Forge desktop saves land in the project's forge library (they wrote into the editor install tree — lost on packaged installs); direct-to-project part and effect saves ask before overwriting an existing file; the Animation Generator's save dialogs recover from cancel (the GIF button no longer sticks on "Saving…", hidden file inputs no longer orphan); and Character Generator sheet saves fall back to a browser download instead of crashing when no project is open.
- Runtime: the MV-compat battler animation mirror queue stays out of save files and is bounded — saves no longer grow with every battle animation ever played; Window_Command.refresh recreates its contents bitmap only when the window actually changed size (it churned a fresh canvas + texture on every refresh in MZ games); the data-load watchdog can no longer double-fire a live-but-slow download (a generation guard drops superseded arrivals and download progress pushes the stall deadline forward); Ultra Mode 7's v8 renderer reuses scratch uniform buffers instead of allocating ~7 typed arrays per layer per frame; and the texture-compat shim is memoized per texture source instead of building a fresh proxy object on every access. Verified by booting the MZ demo and the 168-plugin MV game to their title scenes on the updated runtime with clean consoles.

The original deferred findings and their resolutions are preserved in [docs/AUDIT-BACKLOG-2026-07-13.md](docs/AUDIT-BACKLOG-2026-07-13.md); all are fixed.

Validation at the 0.95.0 release: **350 passing tests and no failures**.

## [0.94.8] - 2026-07-13

Release overview: [RPG Reactor 0.94.8: Big Maps Without the Wait](docs/devlogs/2026-07-13-rpg-reactor-0.94.8.md).

### Changed

- Bumped RPG Reactor to version 0.94.8.

### Fixed

- Editor: large maps load and edit much faster — a 256×256 compatibility-project map now fully loads in ~2.5s instead of ~10s, and the editor runs at full frame rate afterwards instead of stuttering on maps with water. Off-viewport tiles now stream into detached containers (the growing half-loaded map was re-rendered every frame while loading, which is where the time went), and animated water tiles moved to small dedicated overlay layers so the big static layers can always be cached as textures.
- Editor: repainting shadows no longer stacks invisible duplicate shadow sprites that darkened the quadrants slightly with every paint.
- Editor: animation previews (the Animations database page, the animation picker, and the event editor's picker) play smoothly — playback was paced by a timer that drifted and fired late whenever the editor was busy, reading as judder; it now steps at the exact MV 15fps cadence against the display clock.
- Editor: region painting no longer freezes on large maps — bucket-filling a region across a 256×256 map stalled ~5 seconds because the whole overlay (a fresh number label per cell) was rebuilt after every paint; region cells now share one texture per region ID and paints update only the touched cells.
- Editor: the rectangle and circle tools show a live region-color preview while dragging on the Regions tab (the circle tool previously showed no preview at all).

## [0.94.7] - 2026-07-13

Release overview: [RPG Reactor 0.94.7: Map Editing You Can Trust](docs/devlogs/2026-07-13-rpg-reactor-0.94.7.md). (0.94.6 was an internal development version and was never published; its changes ship here.)

### Changed

- Bumped RPG Reactor to version 0.94.7.

### Fixed

- Editor: the rectangle, circle, and paint bucket tools paint regions when the Regions tab is selected — previously only the pencil handled the region layer, and the area tools painted tiles from the previous palette tab's selection instead.

- Runtime: games no longer crash at startup with `this._app.start is not a function` or hang on a black screen when plugins alias `SceneManager.run`/`initialize` with non-async wrappers (VisuMZ Core Engine among them) — such wrappers drop the promise from PIXI v8's async graphics initialization, letting the game-loop start be reached mid-init; the loop start is now deferred until the renderer is ready, whatever the plugin wrapper timing.
- Runtime: MV-era plugins that construct filters ES5-style (`PIXI.Filter.call(this, vertex, fragment, uniforms)`) work under PIXI v8 instead of throwing "class constructor cannot be invoked without new".
- Web editor: database entry lists show their mini preview icons (skill/item/weapon/armor/state icons, actor face portraits, enemy battler thumbnails) in the browser edition — the renderer bailed without NW.js and painted via CSS `file://` backgrounds the browser host's URL bridge does not rewrite; icons now resolve through the host's project URLs. The character/face/SV-battler/icon picker dialogs also open in the browser edition instead of alerting that NW.js is required.
- Runtime: sprites using multiply or screen blending render correctly under PIXI v8 instead of covering the scene with an opaque quad (reported as the whole screen going dark when toggling Sang Hendrix's parallax collision overlay, alongside a flood of "Blend filter requires backBuffer" warnings). PIXI v8 supports these modes natively; the compat layer's filter-based registration was overriding that native path with a filter that cannot run while the back buffer is off.
- Editor: the paint bucket fills the whole connected region of an autotile terrain instead of stopping at shape variants (edges/corners), and recomputes autotile borders after the fill so filled areas connect cleanly. The eraser's fill mode matches terrain the same way.
- Editor: manual layer selection (L1–L4) strictly confines painting and fill to the chosen layer — ground autotiles previously ignored the layer picker and always cleared layers 2–4 at the painted cell. Auto mode keeps the MZ-style stacking rules.
- Editor: the playtest button saves the project (current map, database, map list) before launching, so playtests run the map as it looks in the editor.
- Runtime: the DevTools Issues tab is clean again — the deprecated `unload` listener is now `pagehide`, and the compat layer no longer touches `window.sharedStorage` while scanning globals (which tripped Chromium's Shared Storage deprecation report).

## [0.94.5] - 2026-07-12

Release overview: [RPG Reactor 0.94.5: The Performance Release](docs/devlogs/2026-07-12-rpg-reactor-0.94.5.md).

### Added

- Runtime: built-in frame profiler on F10 — records per-phase timings for every slow frame and writes `save/reactor-profile.json`; free until activated. Companion console helpers `$reactorAnimStats()` and `$reactorAnimWatch(id)` diagnose live animation sprites across all hosts.
- Build menu: "Install Reactor Runtime..." converts imported RPG Maker projects to the Reactor engine — the old corescript, libs, and `index.html` are archived to `rpgmaker-runtime-backup.zip` in the project root, and the plugin manifest is seeded from `plugins.js`.

### Changed

- Game deployment downloads the FFmpeg optimizer and the NW.js proprietary codec from direct release URLs instead of the GitHub API, eliminating unauthenticated rate-limit (HTTP 403) build failures. Downloads remain verified (pinned SHA-256 hashes for FFmpeg, structural archive validation for the codec).
- The shipped runtime plugin manifest is empty instead of containing development plugin entries.
- Runtime: games boot with a clean console — the compat layers' informational install banners are gated behind a debug switch (`window.$reactorDebugLogs`, `localStorage reactorDebugLogs`, or `?debuglogs`), legacy positional `PIXI.BlurFilter(...)` construction no longer triggers a PixiJS deprecation warning, and the "Save data is too big." web-storage warning no longer fires on desktop.
- Bumped RPG Reactor to version 0.94.5.

### Fixed — performance

- Runtime: object-heavy maps (hundreds of events plus plugin overlay windows) run at full speed again under PIXI v8 — far-offscreen character sprites and dormant plugin windows are detached from the display tree instead of merely hidden (measured 30 → 180 FPS on the heaviest profiled map). Set `window.$reactorDisableCulling = true` to disable for debugging.
- Runtime: scrolling across the tilemap's repaint boundary no longer hitches (was a 77ms spike from rebuilding ~2,000 tile sprites) and no longer leaves bands of stale garbage tiles at the viewport edge — tile sprites are pooled detached between repaints, so only freshly painted tiles are ever in the display tree.
- Runtime: LeTBS enemy AI turns no longer freeze the frame — the compat layer memoizes the AI's AoE evaluation (identical scopes were rebuilt with per-entity `eval()`s for every move-cell × action-cell combination; profiled at 80–146ms per skill) and replaces pathfinding that ran inside a sort comparator (~1,200 whole-map A* runs per move decision) with a single BFS flood fill.
- Runtime: Ultra Mode 7 runs at full speed on large maps (GPU vertex buffers now upload only when geometry changes — was ~135MB re-uploaded per frame on a 256×256 map, 36.8ms → 4ms median) and honors the plugin's `TILEMAP_PIXELATED` setting, removing tile seams in pixel-art games.

### Fixed — Ultra Mode 7 and plugin detection

- Runtime: `Utils.RPGMAKER_NAME` reports `"MZ"` (Reactor's identity moved to `Utils.REACTOR_NAME`) — multi-engine plugins branch on that exact string, and "Reactor" sent them down MV/dead-fallback paths: Ultra Mode 7 rendered nothing, and the Cyclone suite, DK Video Player, and others took wrong branches.
- Runtime: Ultra Mode 7 works with pre-2.2.0 plugin releases — `pixi_compat` supplies the `Tilemap.CombinedLayer` bridge (addRect animation-coordinate forwarding + animationFrame fan-out) that Blizzard added in v2.2.0.
- Runtime: Ultra Mode 7 maps no longer crash the scene — the tilemap's direct `updateTransform` drive now tolerates plugin transform chains ending in the legacy PIXI call (expected to throw on v8), matching the onRender bridge's behavior; the MV project-marker probe also stops logging file-not-found noise in MZ projects.

### Fixed — MV compatibility

- Runtime: the MV compatibility layer is now two-tier. MV plugin API support (the mix-and-match machinery) installs for every game, so MZ projects can use MV plugins; MV game semantics (window geometry, scene layout, battle flow) activate only for games authored in RPG Maker MV. Previously the whole layer applied to MZ projects, squeezing command windows and washing out window backgrounds.
- Runtime: "Set Movement Route" waits work again when an MV plugin overrides the route command (MV's interpreter watches `this._character`, MZ's `this._characterId`; the compat layer now honors both), fixing cutscene move routes that silently did nothing — e.g. YEP Move Route Core's `MOVE TO` marches.
- Runtime: looping MV-format animations (waving flags retriggered every pass) no longer blink out for a frame at the loop point — finished animation sprites get MV's one-tick removal grace, and fresh sprites draw their first frame at creation when their sheets are cached.
- Runtime: LeTBS battle animations no longer ghost — finished/orphaned animation sprites leaked on LeTBS's shared layer (frozen on their last frame, so looping state animations played exactly on top of their own ghost); the compat layer now sweeps the layer every battle tick.
- Runtime: victory triggers immediately when the last enemy falls in MV games; MZ's eager `BattleManager.endAction` cleanup let ATB systems open an actor command window over the dead troop, stalling battle end until one more attack.
- Runtime: MV window contents and main-menu window sizing are MV-verbatim under the MV compatibility layer, so layout plugins (YEP_MainMenuManager, YEP_PartySystem) measure the geometry they were written against; verified against the same game running its genuine MV corescript.
- Runtime: MV plugins customizing menu status drawing (gauges, hidden levels, class rows) apply again — MZ's `Window_StatusBase` intermediate class was shadowing their `Window_Base` patches.
- Runtime: MZ games show their saves again when leftover MV-era `.rpgsave` files sit beside the real `.rmmzsave` saves — save-format resolution is now native-first per game type instead of always preferring `.rpgsave`.
- Runtime: MV games no longer freeze when a plugin's promise rejects unhandled (failing `video.play()` was fatal under MZ semantics; MV ignored it — now logged and play continues).

### Fixed — rendering, effects, and editor

- Runtime: Effekseer battle animations stay round/undistorted at every screen position (off-center targets previously stretched effects radially), and "screen center" animations position correctly under PIXI v8.
- Runtime: plugins that read `PIXI.settings` (removed in PIXI v8) no longer crash the game on startup — a compat bridge maps the common settings to their v8 equivalents.
- Runtime: window skins no longer tile the whole skin sheet (including the text-color palette) behind window contents under PIXI v8; the background pattern quadrant renders correctly again.
- Runtime: the FPS counter (F2) renders with MZ's stock look in every project — its CSS previously only existed in RPG Maker's own `index.html`.
- Forge Effekseer Generator: the frame-count setting now caps exported effects (continuous-spin recipes included) so battle animations end when the Forge says they do; blank duration still exports endless ambience effects.
- Deploying an imported RPG Maker MV/MZ project that still runs on its original corescript no longer fails with "Project runtime is incomplete"; the check now follows what `index.html` boots, and its error explains how to install the Reactor runtime.

## [0.94.4] - 2026-07-11

Release overview: [RPG Reactor 0.94.4: Responsive Web Forge and Reliable Windows Playtests](docs/devlogs/2026-07-11-rpg-reactor-0.94.4.md).

### Added

- Skills, Items, and Weapons assign animations through a searchable picker modal with a live playing preview of both MV sprite-sheet animations and Effekseer effects.
- Database entry lists show a framed mini icon beside each name: database icons for skills, items, weapons, armors, and states; face portraits for actors; battler thumbnails for enemies.

### Changed

- Bumped RPG Reactor to version 0.94.4.

### Fixed

- The Web editor now adapts its sidebar, workspace, toolbars, status bar, database, event editor, image picker, map properties, splash screen, save banner, and Playtest window across desktop, laptop, narrow, and short browser viewports without changing the desktop NW.js layout. Unsupported deployment controls are removed from the Web menu.
- Web Forge tools now bundle their Character Generator engines and built-in style library, then save character sheets, animation sheets/GIFs, sound effects, complete Effekseer effects/resources, outfits, and hair into the active browser project. The files persist across reloads; projectless exports use browser file/directory pickers or a download fallback.
- Browser Playtest now waits for the project-overlay service worker to control the page, using one guarded startup reload when required so edits saved during the first Web-editor session are immediately available.
- Windows playtests now remain detectable as Test or Battle Test when isolated profiles are enabled. Windows NW.js retains `--user-data-dir` as its first application argument, which previously hid the later `test` token from RPG Maker and prevented test-only plugin overlays such as Sang Hendrix editor docks from being created.
- Runtime: battle test launches are now detected when Chromium switches occupy the first application argument on Linux and macOS — `Utils.isOptionValid` scans every argument instead of only the first. Previously Battle Test booted to the title screen.
- Runtime: MV-style damage popups no longer destroy the shared system Damage bitmap when a popup is removed, which crashed the PIXI v8 render pass and blacked out the battle. The renderer also skips live sprites whose texture source has been destroyed, logging the offending class instead of aborting the frame.
- Runtime: window selection cursors are clamped to the window's inner rect (MV behavior), MV battle-window metrics such as `windowWidth` and `numVisibleRows` now gap-fill correctly on subclasses, and the UI box size honors `SceneManager._boxWidth`/`_boxHeight` set by MV plugins so the window layer aligns at the origin as in MV. Together these keep battle command highlights inside their windows and align all windows with screen-anchored HUD art.
- Runtime: Effekseer effects render aspect-correct on widescreen canvases (the projection previously stretched effects horizontally, turning spheres into ovals), and the overlay GL context now re-asserts its render state around every draw so effects survive window blur/focus without back-face artifacts.
- Runtime: `Sprite.setFrame` always refreshes its texture, healing sprites whose shared bitmap had its base texture replaced by image-processing plugins, and windowskin refreshes tolerate MV-style window part structures instead of crashing during bitmap load.

## [0.94.3] - 2026-07-10

Release overview: [RPG Reactor 0.94.3: Web Editor and Reliable Downloads](docs/devlogs/2026-07-10-rpg-reactor-0.94.3.md).

### Added

- Added a provider-neutral Web editor package with Reactor One bundled and opened automatically. Browser edits persist locally, can be reset to the bundled project, and are used by the in-page Playtest.

### Changed

- Bumped RPG Reactor to version 0.94.3.
- AppImage output is now presented as a conditional sub-option directly beneath Linux in both deployment dialogs.

### Fixed

- Large NW.js SDK downloads now tolerate temporary `dl.nwjs.io` stalls, retry transient failures, and clean incomplete cache files instead of failing after 30 seconds.
- Deployment logs now keep a live inline progress bar visible during runtime and tool downloads, including transferred MiB for servers that do not report a total size and retry/completion state in the same row.
- Deployment downloads now prefer native curl when available, avoiding an NW.js worker-thread HTTPS stall where a valid runtime URL opened but delivered no bytes; the Node HTTPS path remains available as fallback.

## [0.94.2] - 2026-07-10

Release overview: [RPG Reactor 0.94.2: Safer Saves and Better Deployments](docs/devlogs/2026-07-10-rpg-reactor-0.94.2.md).

### Added

- The RPG Maker MV compatibility layer (`reactor_mv_compat.js`) now ships in the runtime folder and loads in every project. Previously it lived only in a local test project, so the 0.94.1 MV compatibility work was not actually included in new projects or the public runtime. It is inert in pure-MZ projects: every API it provides is gap-filled only when missing.
- Outfit Forge now always shows part options as permanent dropdowns (and always-visible thumbnail lists), matching Procedural-tab discoverability for materials, accents, and style presets.
- Added clean-checkout GitHub Actions coverage, runtime-manifest checks, generated-project smoke tests, save-safety tests, editor-distribution staging checks, and a no-NW.js web deployment smoke test.
- Added File-menu Save Project and Playtest commands plus visible shortcut indicators and application shortcuts for New (`Ctrl+N`), Open (`Ctrl+O`), Save (`Ctrl+S`), and Playtest (`Ctrl+R`).
- Added `F5` for a confirmed uncached editor reload and `F11` for native NW.js fullscreen.
- Added optional desktop runtime locale filtering with an English fallback, reducing packaged game size without changing project translations.
- Added optional deployment-time asset optimization: staged-only lossless Oxipng recompression and explicit-quality OGG Vorbis re-encoding, with smaller-valid-file replacement, loop-metadata preservation, per-file progress, and pinned SHA-256-verified FFmpeg acquisition.
- Added optional Linux x86_64 AppImage output for both games and the editor. Existing Linux folders and ZIP archives remain available; AppImage tooling and its Type 2 runtime are pinned, verified, cached, and used only when requested on a Linux x86_64 build host.

### Changed

- Bumped RPG Reactor to version 0.94.2.
- Save now persists the current map, all database files, project metadata, and the authoritative map list; map and project transitions prompt to save, discard, or cancel when changes are pending.
- New-project fallback scaffolding is deterministic and runtime-valid, with complete display/font settings and an empty plugin configuration instead of inheriting demo plugins.
- Deployment dialogs now provide themed searchable NW.js release selection, remember game and editor output directories independently, persist asset settings, and use consistent **ZIP archive** labels.

### Fixed

- Character Generator **Parts (PNG)** now scans both `forge/character_generator/styles/<style>/parts/` and the legacy Complex-template `forge/character_generator/parts/` path, with clearer empty-state copy and an Open Folder button.
- Forge tools no longer keep a stale project path after switching or closing projects, so bake/save dialogs (including Animation Generator GIF export) default to the currently open project.
- Hair Forge lower banding and scraggle sliders produce much larger, more visible pixel changes.
- Windows splash startup no longer performs repeated one-pixel window-height nudges, which could appear as a several-pixel bounce after native frame and DPI rounding; Wine also avoids relaunching an already-frameless packaged window.
- Fixed the Demo's New Game crash introduced by MV RenderTexture compatibility forwarding `resolution: undefined` into PixiJS 8.14, producing `NaN` snapshot dimensions and an incomplete framebuffer during `Scene_Title.terminate()`.
- Database and project save failures now propagate to the UI instead of reporting false success, and database saves can no longer overwrite newer `MapInfos.json` data.
- Editor distributions now include the GIF encoder, worker, and decoder dependency closure used by Animation Generator import/export, and fail packaging when required runtime files are absent.
- Game deployment now validates the complete Reactor runtime and excludes development saves and backup directories from packaged output.
- Valid RPG Maker MZ **Skip** commands (`code 109`) now display correctly in Common Events and troop events instead of appearing as unknown commands.
- NW.js deployment now reuses packaged and cached runtimes consistently, searches every cache root before downloading, and supports latest-stable, editor-matched, or manually pinned runtime versions.
- Game and full editor deployments can optionally install a SHA-256-verified, exact-version `nwjs-ffmpeg-prebuilt` codec overlay for additional H.264/AAC playback support.
- Linux editor distributions are now produced as symlink-preserving `.zip` archives instead of `.tar.gz`.
- Effekseer Layers now adapt beside or below the preview, animated opacity is applied correctly, and keyframe selection, add/delete, frame, Start Frame, and layer-timing edits remain synchronized.
- Playtests now use Reactor-owned profiles isolated by project and NW.js version on Windows, macOS, and Linux, so deployed games and other projects cannot block launch.
- Oxipng now initializes its supported single-thread WASM codec directly in NW.js workers instead of selecting an unavailable browser-thread build and reporting every PNG as unsupported.
- Localized About dialogs now display the shared current application version instead of stale hard-coded version text.

## [0.94.1] - 2026-07-05

### Added

- The Effekseer Animation Generator's **Interface** category was rebuilt as true 3D instruments and grown to **21 recipes**, every panel is now world-fixed geometry that rotates truthfully with the orientation gizmo instead of a flat billboard. New instruments include a build-your-own **Orbital Survey** solar system (per-planet sizes and custom planet-texture uploads), a wireframe **Starship Analysis** hull with tracking callouts, a **Reactor Core** wireframe torus, **Circular Gauge** and **Bar Meter** LED meters, a **Behavior Matrix** ternary plot, **Flight Prediction**, a living **Composite Waveform** oscilloscope, and a 3D **Battery** cell, and every interface can now display **user-typed text** (single-line Display Text or scrolling/blinking Paragraph Text) so one recipe reuses across many meanings.
- A full Effekseer **Physical** attack pack for battle effects - Slash, Bite, Punch, Impale, Claw Rake, Crush, Arrow Hit, Parry, Whip Crack, and Blood (with Burst/Spray/Drip splatter patterns and full color control), plus new **Energy** spell effects (Energy Boost, Energy Column, Binding Circle, Hex Forcefield) and **Christian Cross** variants (Latin, Orthodox, Greek, Celtic).
- **MZ-style tile-layer dimming** in the map editor: selecting layer 1–4 fades the other layers so it's obvious which tiles live on the active layer.

### Changed

- Bumped current development version to RPG Reactor 0.94.1.
- Sharpened the Effekseer Magic Circle (legible runes, crisp inner star) and moved the Explosion recipe into the Physical category.

### Fixed

- Fixed Effekseer preview loading in the Database and Event animation pickers, rotation-gizmo jump/reset issues, and several beam/column rendering problems (hollow beam cores, half-circle columns, oversized bases).
- **RPG Maker MV compatibility:** the PIXI8 runtime now boots and plays a large commercial MV project's full 168-plugin stack, intro cutscenes, save/load through the game's own load menu, event-choice menus, and the LeTBS tactical battle system verified all the way into rendered combat turns (positioning, movement grid, turn order, battle HUD). The MV compatibility layer gained MV's `Spriteset_Battle` battleback chain, MV window-internal sprite aliases, MV's battle-field creation order, MV's cell-sheet animation engine restored on `Sprite_Animation` for plugins that subclass it, message sub-window creation chains (run exactly once per scene), character balloons and sprite-hosted animations as functional ports, `ToneFilter`, MV `Bitmap` tone/hue manipulation, the MV gauge/color API on `Window_Base`, `Game_Followers.forEach`, MV save-backup APIs, and ~25 more scan-driven gap-fills, each preserving MV's argument guards verbatim so plugin feature-detection keeps working.
- **Runtime resilience:** resource loads that silently die (no onload, no onerror, common on slow or syncing disks) previously hung the game forever with a black screen and zero console errors. The runtime now watchdogs every database JSON, image, and audio load from the engine's own frame tick, retries stalls in parallel indefinitely, revives buffers that plugin caches still gate on after MZ code destroyed them, and degrades genuinely missing audio/images to silence/blank with a loud console error instead of deadlocking scene startup.
- **PIXI v8:** `getBounds()` returns a `Bounds` object in v8 (v5–v7 returned a `Rectangle`); a `contains()` delegate keeps plugin hit tests working.

## [0.94] - 2026-06-27

### Added

- Effekseer Animation Generator grew into a full composition tool: an Animation-Generator-style **layer system** (stack any animations into one exported .efkefc, with per-layer visibility, opacity, ordering and timing windows) and **keyframes**, parameter states pinned to chosen frames, compiled to native Effekseer curves (colors, size, spin) with **texture cross-fades** between keyframes; plus a master frame-count control, an AG-style layers panel, corrected solid-surface texturing with proper backface culling, and a broad recipe library. The format engine now reads Effekseer binary versions up to 1710.

### Changed

- Bumped current development version to RPG Reactor 0.94.

### Fixed

- Fixed Outfit Forge Mini Skirt cleanup so side-view frames no longer leave orphan leg-palette outline/bridge pixels below the skirt hem.
- Fixed Outfit Forge Mini Skirt `Knee plates` so it now renders separate knee pads at the anatomical knees above the boot/shin band instead of being an ignored segmented-pants-only toggle; the skirt waistband is constrained to one visible row so it cannot consume most of a short skirt.
- Fixed Psychronic Mini Skirt placement by rejecting classifier rows above the real legs anchor, preventing torso/belt rows from being painted as skirt cloth.
- Fixed Forge card number fields feeling laggy while typing by avoiding full preview regeneration on every numeric keystroke.

## [0.93.1] - 2026-06-21

### Changed

- Bumped current development version to RPG Reactor 0.93.1.
- Reworked macOS editor distribution output into a self-contained `RPG Reactor.app` archive with no loose Chromium sidecar files at the zip root.
- Windows editor distribution packages now strip noisy Chromium `--enable-logging` from the packaged editor payload.

### Fixed

- Fixed macOS packaged editor launch and playtest by putting the editor payload in `Contents/Resources/app.nw` and adding an internal clean playtest runtime that symlinks to the bundled NW.js framework instead of duplicating it.
- Fixed macOS playtest runtime resolution across NW.js helper-process paths by searching from `process.execPath`, `__dirname`, `process.cwd()`, and `nw.App.startPath`.
- Fixed Windows playtest selection to prefer the clean adjacent `nw.exe` before stale `nwjs-win` folders, and hid spawned Windows playtest console flicker.
- Fixed erasing imported RPG Maker maps by making auto erase target the topmost actual tile layer instead of depending on the current palette tab.
- Fixed rectangle, circle, fill, and pencil eraser behavior so eraser mode remains active when changing drawing tools, never requires selected palette tiles, and shows outline-only previews while erasing.
- Fixed Plugin Manager saves for existing RPG Maker MV/MZ projects so `js/plugins.js` is written in RPG Maker-compatible four-field format instead of including Reactor-only metadata such as parsed help, author, and URL.
- Fixed the top Database menu's System entry so it opens System 1/System 2 sections instead of dispatching the obsolete `system` database type.

## [0.93.0] - 2026-06-21

### Changed

- Bumped current development version to RPG Reactor 0.93.
- Continued UI polish with a distinct themed Audio Player control card for Volume, Pitch, and Pan.
- Added the Rarely Typical Players Podcast YouTube channel to the Help/About links.
- Updated the editor window title to use `RPG Reactor | <Game Title>` and refresh on project load, close, language changes, and System 1 game-title edits.
- Reworked Windows and Linux platform editor packages so the editor payload is appended to the branded executable while the plain NW.js executable remains clean for playtesting, avoiding duplicate full runtime copies.
- Windows editor packages now use a frameless compatibility mode with RPG Reactor's own title controls, centered startup, and manual maximize/restore behavior for cleaner Proton/Wine behavior on Linux.
- Replaced emoji language flags in Options with SVG flag badges so Windows/Chromium displays real flag icons instead of regional-letter abbreviations.

### Fixed

- Fixed playtest launch from final Windows editor builds by avoiding the editor `package.nw` runtime when opening game projects.
- Fixed macOS editor distribution packaging to keep a clean `nwjs-mac/nwjs.app` runtime for playtesting separate from the editor `.app` bundle.
- Fixed Windows taskbar/app icon handling in packaged editor builds by resolving icons from packaged paths and improving multi-size ICO embedding.
- Fixed Windows editor builds under Proton/Wine showing a white native client-area band and offset mouse hit-testing by using frameless compatibility mode.
- Fixed final editor startup positioning so the splash/editor window opens centered instead of crammed into the upper-left corner.
- Fixed Forge launcher tiles losing their themed title/description styling when the generic localization text pass flattened complex button markup.
- Fixed database list rows not updating live while editing an entry name in the detail panel.
- Fixed actor image preview cards overflowing outside the Images section in the database modal.
- Fixed the actor Traits empty row alignment so it no longer protrudes into the indicator gutter.
- Fixed Forge Character Generator imported body sheets being shifted by procedural body-centering; bulk-imported/custom bodies now preserve their authored cell position. Also fixed normal RPG Maker 12x8 sheet detection.
- Fixed Psychronic female Outfit Forge armor generation with female-specific head/torso/shoulders/arms/hands/gauntlet/belt/legs/boots zone masks, female-safe mask coordinates, normalized Forge gender tags, and Zone Edit reload/export support so male bodies are unaffected.
- Replaced deprecated Pixi `cacheAsBitmap` map-editor cache calls with Pixi v8 `cacheAsTexture` calls.
- Improved procedural Outfit Forge pants and boots shading with pants underfill to prevent skin-colored cracks, plus broader natural shadow/light patches on pants and boots instead of dot-like striping.
- Improved procedural Outfit Forge helmet, torso armor, shoulders, and arms with connected metal volume shading while preserving seams, glow accents, and hard bevel details.
- Refined Psychronic helmet rendering with lower female visor/open-face placement, side respirator grill detail, and reduced isolated bright edge artifacts.
- Refined Outfit Forge pants and armor visuals with tighter front pants upper highlights, added Psychronic side-view helmet/torso panel detail, and stronger outer separation strokes for pauldrons and gauntlets.
- Refined Psychronic torso, arm, and helmet armor with structured panel shading and boundary-only outline strokes.
- Refined Psychronic back torso armor so the center highlight continues upward and paired panel lines arc into the shoulders.
- Updated the Nova Sentinel belt default material/accent pairing to gold/gold.
- Added an initial Hair Forge tab with anchor-based procedural hair generation, shared Forge walk-preview playback, live preview, save-to-library support, and generated hair regression coverage.
- Improved Hair Forge output with layered crown clumps, carved part lines, tapered bangs, side locks, and back-view flow strands instead of a single smooth hair mass.
- Refined Hair Forge internal hair seams to use shaded pixels instead of transparent cuts that created noisy black holes after outlining.
- Refined Hair Forge hair patterns with connected mirrored highlight/shadow lanes and exterior-only outlining for cleaner pixel-art flow.
- Refined Hair Forge long hair with a coherent panel overlay that connects crown shading into bangs, side curtains, and back locks.
- Stabilized Hair Forge side-view animation by anchoring crown/root pixels to the body frame and moving only lower hair tips subtly; side-view long hair now hangs from the back of the head with only short face-side bangs.
- Refined Hair Forge bangs and temple areas with larger polished hair panels, stronger side-lock connectors, and continuity smoothing for less sloppy strand patterns.
- Refined Hair Forge side bangs into shorter tapered clumps and filled small enclosed hair gaps so strands read as connected hair instead of blocky panels with holes.
- Refined Hair Forge silhouettes by trimming blocky side-bang faces and tapering/rounding long back-hair curtains for a more natural hair shape.
- Refined Hair Forge long hair with pixel-fur style finishing: scalloped exterior tuft edges plus connected V-shaped highlight and shadow flows.
- Refined Hair Forge tuft details to stay clipped inside the hair mass and added front-view crown/bang flow lines for less blocky bangs.
- Lowered and softened Hair Forge side-view front hairlines with connected tapered tufts instead of a square forehead edge.
- Reworked Hair Forge side-view bangs into swept overlapping locks and relaxed the forehead carve to avoid exposed bald-looking side hairline gaps.
- Refined Hair Forge side-view silhouettes with a forward-swept forelock, broader light/shadow shapes, and a preserved eye window so side eyes remain visible.
- Lowered Hair Forge side-view hair mass slightly while keeping the side eye-window anchored to the real eye line.
- Refined Hair Forge front-view layered hair with wider wavy side curtains, swept bang clusters, and a cleaner face opening based on imported Psychronic reference-hair flow.
- Fixed Hair Forge side-view hair by replacing the rectangular eye cutout with a tapered slit, filling the rear scalp cap, and removing disconnected lower hair islands.
- Fixed Hair Forge side-view bangs so the Bangs checkbox controls the swept forelock, fills the forward forehead area, and visibly changes side frames.
- Fixed Hair Forge side-view outlines and side locks so late side-only hair additions receive exterior strokes, side locks anchor from the sideburn/temple area, and the Side Locks checkbox visibly changes side frames.
- Fixed Hair Forge frame selection so frame 0 previews correctly, and moved hair color swatches into the color dropdown option rows.
- Stabilized Hair Forge side-view hair horizontally while preserving the intended 1px side walk-frame vertical bob and subtle hair-flow variation.
- Increased Hair Forge side/back walk-frame hair flow and tightened front-view eye-only clearing against visible eye pixels so animated bangs do not cover the eyes without cutting a forehead strip.
- Added an explicit anchor-based front-view eye protection zone for Hair Forge so Psychronic female frame 2 outline spikes do not cover the eye without cutting a rectangular bang hole.
- Added Hair Forge Eye Zone controls for front-view hair protection, with X/Y/width/height adjustment and a lower default Y offset for eye placement.
- Updated the default Hair Forge Eye Zone to X 1, Y 7, Width 3, Height 5 based on visual calibration.
- Added Hair Forge Hair Pattern controls for lower-hair banding and scraggle, with smoother default side-view lower hair and tunable shading variety.
- Strengthened Hair Forge Hair Pattern controls so lower banding and scraggle visibly affect front, side, and back lower hair instead of only subtly changing side strands.
- Added a Short Spiky Hair Forge style with raised crown spikes and a shorter side/front/back silhouette.
- Reworked Short Spiky Hair Forge generation into its own all-around spiky cap/fringe/sideburn style, with length scaling longer spikes instead of falling back to layered-bob locks.
- Fixed Short Spiky front hair so it keeps the central face open and uses short angular sideburn spikes instead of a face-covering lower curtain.
- Made Short Spiky more aggressively spiky all around by breaking up the front brow band, side lower mass, and back lower block into jagged spike teeth.
- Simplified Short Spiky into a head-local spiky style by removing lower tendrils/pattern passes and trimming excess side/back length.
- Simplified Short Spiky further into a compact cap/fringe/sideburn shape, removing the aggressive jagged-teeth experiments that made it visually noisy.
- Refined Short Spiky with style-specific front/side/back spike silhouettes, connected back-view spike roots, side-view spiky bangs, removed horizontal ponytail-like side spikes, and Short Spiky-specific triangular texture controls.
- Added a Center Part Long Hair Forge style with orderly long straight strands, a visible middle part, smooth side-view bangs, an open face-framing front silhouette, rounded long back curtain, and subtle walk-frame hair sway.
- Expanded Hair Forge colors with auburn, platinum, rose, violet, navy, and emerald palettes.
- Shifted right-facing Hair Forge side hair slightly back so rear scalp coverage matches the left-facing side view.
- Recalibrated Psychronic female Outfit Forge side-frame zone masks for the updated horizontal body-frame alignment.
- Added explicit eye-line anchor metadata for generated outfit placement without turning eyes into a paint-blocking clothing zone.

## [0.91] - 2026-06-18

### Added

- Expanded editor localization to ten languages: English, Japanese, Spanish, Traditional Chinese, Simplified Chinese, Russian, Portuguese, German, French, and Greek.
- Added immediate language switching through Options and the top-menu language button.
- Added broad localization coverage for editor chrome, Options, About, Forge, Audio Player, database/event editor surfaces, many fixed event-command forms, and common alert/status text.
- Added root release documentation so GitHub visitors can see progress without opening the editor subfolder.
- Added i18n regression coverage for dictionary completeness, localized key references, and high-visibility labels that should not fall back to English.

### Changed

- Updated RPG Reactor to version 0.91 for this release cycle.
- Improved the Options Palette picker with visible color swatches, high-contrast themed dropdown rows, and selected/hover highlighting that matches the Language dropdown styling.
- Renamed the bundled Pixi runtime path to the canonical `runtime/libs/pixi.js` and updated packaging/runtime references accordingly.
- Refreshed documentation for current localization, theming, Forge, runtime, and test coverage.

### Fixed

- Fixed language-change handling for dynamic editor text and generated modal/chrome surfaces.
- Fixed Palette dropdown swatches being removed by the generic localization text pass.
- Fixed Palette dropdown light/gray-on-gray contrast by moving styling to theme tokens.
- Fixed missing bundled script references for Pixi/GIF loaders in the editor shell.
- Fixed several low-risk Pixi v8 deprecation warnings in editor/runtime code paths.

## [0.9.0] - 2026-05-31

- Completed the major Pixi v8 migration pass, including compatibility shims and visual-fidelity fixes.
- Added the theme token system and broad editor UI token migration.
- Added database, animation, map-editor, and runtime compatibility polish described in the detailed editor changelog.
