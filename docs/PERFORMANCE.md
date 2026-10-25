# Performance checks

## Border crossing (2026-10-23)

Walking between North Haven (Map005) and Forest Road (Map008), measured in the game with held arrow keys (`editor/tests/perf/nw-border-crossing.cjs`), both directions and both starting maps. Figures are the longest frame of the crossing and the frames after it; the walk itself runs at 16.7 ms (RTX) and 16.7 to 33 ms (Radeon iGPU, GPU-bound).

| Change | Switch | Result |
| --- | --- | --- |
| The light's full-screen combines (four water and sheen variants) compiled ahead while a neighbor stands beside the map | `HalfLight.expect`, `warmAhead` | 48 ms of program waits gone from the iGPU crossing frame |
| The haze's and the halo's programs compiled ahead against stand-in targets when the map ahead has lamps or water | `HalfHaze.expect`, `warmAhead` | entering North Haven compiles no program |
| A material whose program changed while out of sight waits for its compile when it comes back into a view drawn all along (game only); the unlit twin keeps its own warmup record | `ShaderWarmup.SEEN_MS` | no compile inside the crossing draw |
| The crossing update shows the passes' last picture instead of drawing the world; the scene start does not update the spriteset made in the same update | `Neighbors.KEEP_PICTURE` (0: draw) | one world draw less in the crossing frame |
| The map left becomes a neighbor from the map the game held; the copy entered takes the world's cell index; rock columns kept per map at a chunk place | none | the 45 to 100 ms frame four frames after a crossing gone |
| Neighbor upkeep one piece a frame; models join a few a frame while worlds stand beside; the glowing water picture made in idle time ahead | `Neighbors.upkeep`, `ModelJoins` | |

| Crossing | RTX before | RTX after | iGPU before | iGPU after |
| --- | --- | --- | --- | --- |
| North Haven to Forest Road | 67, then 83 | 17 to 33 | 67 to 133, then 83 to 100 | 33 to 50 |
| Forest Road to North Haven | 83 to 167 | 33 | 100 to 150 | 33 to 50 |
| Forest Road to North Haven, CPU throttled 4x | 1434 | 300 | | |

Steady North Haven walk and arrival unchanged (same draw calls; GPU 13.4 vs 13.7 ms a frame on the iGPU). What is left in the crossing frame is the new Scene_Map: spriteset, windows and plugins, 25 to 40 ms on this CPU.

## Quadruped preview build (2026-10-23)

The 768-pixel preview coat (384 before 2026-10-20) had tripled a dog, horse or drake preview build on this machine, from about 120 to 470 ms. Coat painting now produces the identical picture in about half the time: the timed builds average about 280 ms, under the 400 ms gate. While a slider is dragged the coat is painted at half size (384, cats 512); releasing the slider and saving paint the full picture. Creature parts again use their own tessellation, which restores the 65,000-triangle starting-type budget ([corrections](CHARACTER-QUALITY.md)).

## Prop construction (2026-10-22, preview revision 47)

Detail now has a larger explicit geometry budget. Native defaults range from 2,282–64,634 triangles for furniture, 17,439–167,496 for vehicles (preview47 formed apertures, shaped tires and outline lettering), 5,628–17,056 for firearms and 2,416–35,420 for swords; standalone equipment reaches 20,672. These are selected-view generated counts, not FPS. Family regression bounds are 180k furniture/180k vehicle/80k equipment/50k sword/45k gun. Exports and winding checks cover all defaults and 450 scoped random recipes; broader endpoint tests include rounded picture edges and smooth pole/container hardware. The increased bounds accommodate curved surfaces and modeled fittings.

Preview45 vehicle generation measures 14–106 ms warmed median locally (five warm builds per default), versus 5–87 ms for the preview44 snapshots. Flight and walker construction costs more with the additional surfaces and assemblies. This is synchronous Node model generation, excluding GPU upload, rendering and cold app startup. Exact per-model triangle/part/buffer counts and before/after times are in `scratchpad/vehicle-design-20261022/performance-{before,after}.json`. The vehicle follow-up captures 25 configurations/225 views, audits 162 model controls and 325 native UI input samples, and exports all nine defaults. That historical pass retained the 160k regression bound; no hardware-FPS improvement is claimed.

Preview47 filters micro maps over each coating texel footprint to avoid large aliased dents/streaks. Lettering uses opaque outline geometry rather than an alpha atlas. Filleted boxes devote samples to curved edges/corners instead of grids over flat faces, retaining the 180k vehicle bound. Preview47 defaults range from 17,439 to 167,496 triangles. Local first builds measure 263–1220 ms, immediate cached revisits 40–311 ms, and changed-paint 512 px builds 105–563 ms. The serial timing process peaked at 343 MiB RSS. Current measurements are retained in `scratchpad/vehicle-corrections-20261022/performance.json`; these are local synchronous builds, not GPU or cold app startup measurements.

Preview46 adds a bounded 1024×2048 maximum coating atlas (color, normal and packed metallic/roughness), 512 px during dragging, plus a cutout marking atlas and shared 256–512 px material-role maps. Painted surfaces receive individual projection charts; lettering is separate from coating pixels. The geometry and last coating/artwork are cached per builder; changing only window opacity or marking text reuses the coating. Local synchronous Node generation measures 268–1090 ms on each form’s first build, 30–232 ms on the immediate cached revisit, and 104–483 ms for a changed-paint 512 px drag build. Full-resolution active texture pixels total 20.5–33.25 MiB; the nine-form serial timing process peaked at 336 MiB RSS. This excludes texture upload, rendering and cold app startup. Exact runs: `scratchpad/vehicle-surface-20261022/performance.json`. The 180k vehicle regression bound allows fitted cabins/fasteners; the workstation cgroup and heap limits are unchanged. Software captures record appearance; technical passes establish neither visual acceptance nor hardware FPS.

Shared 256 px periodic normal and packed material maps cost 512 KiB raw per active material role; optional wood albedo adds 256 KiB. They are reused by role, not allocated for every bolt or key. Keyboard legends share one 512×256 alpha atlas. Container atlas height grows when the complete packing requires it: some complex 1024 px canisters use 1024×2048 instead of silently discarding late regions. Character equipment passes the same maps through page and workers. Existing body/garment atlas budgets remain separate.

The final native audit captures 122 defaults, 82 style/detail recipes and two character fittings in isolated software-renderer browsers, max four fixtures per batch. Individual controls and actual UI/history are audited separately; every slider combination is not rendered. The actual Node-disabled HTTP character worker covers 30 recipes. Exact heartbeat timing, counts and source hashes are retained in `scratchpad/prop-depth-20261022/verification.json`. These checks do not establish hardware frame rates, cold startup or a speed improvement. [Construction and limits](PROP-BUILDER.md).

## Outfit preview fitting (2026-10-22, preview revision 40)

Armor fitting and sewn details previously scanned entire garment meshes for every surface query. A bounded 2D triangle index now returns the same outer front/back intersection and barycentric address. Cross-sections fit bands and shoulder cups to the actual clothing rather than enclosing ellipses. Short hair entirely above the clothing-contact region skips constructing its unused outfit grid. Species tiles depend on project and gender, so unrelated weight, skin and outfit edits retain those pictures; outfit tiles still use their relevant body settings.

The retained local Node profiler uses warm body assets, static 128-pixel skin/256-pixel garment budgets, three rounds, and the same four outfits. For the original Recon recipe, warm round 3 falls from 1,480 to 340 ms after indexing alone (armor fitting 1,290 to 154 ms), with identical triangle counts. This diagnostic isolates the scan improvement; the richer revised Recon has additional carrier/knee geometry and a different recipe. Main-view atlas budgets remain 2,048 pixels. Source/profile logs and native counts are in `scratchpad/character-tabs-speed-20261022/`; these measurements do not establish hardware frame rates or whole-editor startup time.

The final richer Recon ensemble measures **388 ms warmed median** locally, versus **1,509 ms** before this follow-up; Flight crew is **236 vs 219 ms**, Courier **334 vs 313 ms**, and Viking **73 vs 72 ms**. These are medians of only two warm rounds, not statistical release gates. The new Recon static fixture has 63,529 triangles versus 48,952 previously. Full main-view native fixtures, including crew hair, contain 89,240 triangles for Recon male, 89,312 female, 94,789 fuller female and 77,270 for Flight crew, all 52 bones. Full main-view builds still take roughly 3.0–3.5 seconds locally; warmed thumbnail generation is a different budget. All 26 real browser-worker recipes pass with Node disabled and an 11.3 ms maximum page heartbeat gap. [Visual coverage and limits](CHARACTER-QUALITY.md).

## Pose and garment construction (2026-10-22, preview revision 39)

New clothing detail is bounded geometry fitted to existing garment triangles, with interpolated skin weights. It adds no cloth bones; apron panels use the existing bounded cloth rig. Coat tails retain the same baked playback path. Joint bellows are shallow tubes around existing pressure-suit sections. Armor adds one shared 128-pixel normal/material pair (128 KiB raw RGBA total), with physically tiled UVs; existing clothing atlas sizes remain unchanged. No reference GLB data is included in generated models.

Full selected-view examples: Courier 84,697 triangles / 88 bones, Pathfinder 83,905 / 71, Gladiator 80,852 / 68, Recon 74,616 / 52 and Power armor 37,310 / 52, including the selected hair and face detail. Static bald test fixtures use smaller budgets and are not these native counts. The Node-disabled 24-recipe browser-worker smoke passes with a 10.8 ms maximum page heartbeat gap. Native build/triangle counts and the browser report are retained in `scratchpad/character-followup-20261022/`. Render checks are serialized under the local resource wrapper and close NW.js between batches of four. These software-renderer diagnostics do not establish hardware FPS. [Coverage and limits](CHARACTER-QUALITY.md).

## Fitting follow-up (2026-10-21, preview revision 38)

Broad-body tailoring caches the reference body's sections and builds target sections once per outfit build. Exact layer probes use spatial bins and run on the affected broad-body path. Fitted lower garments retain skin topology. Medieval breastplates increase from five to 13 axial sections; torso lames and 64-column collar bands add geometry locally. Texture atlas budgets remain the existing 2,048-pixel color/normal pair (32 MiB raw).

Sewn details retain source references in the editor. Their weights export with the garment, and the cloth worker receives their collision probes once per rig. They participate in contact checks without contributing extra cloth bones or biasing rest-shape sampling. Playback still uses baked bone keys. The targeted native review uses disposable batches; small-map geometry checks are separate from material appearance and hardware frame rates. [Coverage, regressions and limits](CHARACTER-QUALITY.md).

The real browser-worker smoke passes all 21 recipes with Node disabled. Its maximum heartbeat gap is 85 ms in the isolated final run, below the unchanged 120 ms limit. A concurrent render/simulation run measured 129 ms and failed that timing check; its raw log is retained alongside the isolated rerun. These measurements do not establish weaker-hardware frame rates.

## Catalog detail (2026-10-21, preview revision 37)

The full humanoid fur coat omits the redundant coarse hair layer and uses 55% of the former tuft budget with wider roots to retain coverage. Reviewed bare beastfolk fall from roughly 246–335 thousand triangles to 114–151 thousand; these are geometry counts, not measured FPS. Narrow six-sided garment bindings generally add 2–7 thousand triangles per outfit; sewn buttons are bounded by style and hidden under outer layers. Animal cape grids increase from 12×21 to 25×49, adding 3,892 triangles to resolve visible shoulder clipping. New garments reuse the existing 2,048-pixel color/normal pair (32 MiB raw); no larger atlas is introduced. [Catalog coverage and fitting limits](CHARACTER-QUALITY.md).

The actual Node-disabled browser-worker smoke covers 21 recipes, including new clothing, animal companion gear and humanoid fur. The final retained run has an 18.8 ms maximum page heartbeat gap. Cloth rig shape sampling ignores redundant UV-seam and decorative binding samples while binding those vertices to the same rig. Native appearance review runs disposable batches of four; separate geometry/species-item matrices use small maps and do not establish material appearance or hardware frame rates. The earlier unchanged-HEAD quadruped timing limitation remains recorded below.

## Clothing fitting (2026-10-21, preview revision 36)

Power chest shells use nine 32-point sections and remain rigid on Spine2; local recon plate grids keep their existing tessellation. Animal grooming queries a spatial grid over actual gear triangles before generating fur, reducing covered fibers without adding render geometry or maps. Cloth fitting and preview-only gear shadow bias retain revision-35 texture budgets. The actual 18-recipe browser-worker smoke has a 27.1 ms maximum page heartbeat gap. Native review uses 39 full-quality models in disposable batches of four; the separate 149-case geometry sweep uses small static atlases and does not measure material appearance or hardware frame rates. [Coverage and remaining defects](CHARACTER-QUALITY.md).

## Neck, breed and material corrections (2026-10-21, preview revision 35)

Final native main-view previews use the real default quality: Hydrata 66,540 triangles, Dragonborn 44,776, Lizardfolk 41,712 and Vampire 59,892. Cat defaults range from 42,176 to 78,200; all seven breeds still pass the 100,000-triangle preview/save bound. Fine tapered fur uses at most 1,000 fibers per group in preview and 1,400 on save, over continuous coat volume. No triangle count is added by the animal-gear UV charts; shared vertices are split only where projection charts meet.

Garment color/normal atlases default to 2,048 pixels, **32 MiB raw RGBA together**, replacing the old 1,024-pixel color-only atlas (4 MiB). Weak-mode main views keep 1,024-pixel atlases; small thumbnails omit the relief map. Main shoe/helmet pictures use 1,024 pixels. Cat color atlases use 1,024/2,048 pixels (4/16 MiB) instead of 768/1,536. Shared 512-pixel neck color/relief maps total 2 MiB. Body scale normals add 4 MiB in a standard 1,024-pixel preview and 16 MiB in a 2,048-pixel save. Animal cloth/leather tiles use 256-pixel color/normal pairs, 0.5 MiB per finish. Cached pictures are reused across shape changes.

The final actual HTTP browser-worker smoke passes 18 recipes: maximum page heartbeat gap 59.1 ms; diagnostic worker builds include Maine Coon 3,015 ms, Hydrata 1,496 ms, Vampire 294 ms, 1,024-pixel garment relief 894 ms and animal cloth 1,265 ms. Those explicitly small worker fixtures use 128-pixel body skin and are separate from the full-quality native views above. These are local diagnostics, not hardware FPS or comparative speed claims. [Coverage, reference photographs and remaining fitting limits](CHARACTER-QUALITY.md).

## Cat breeds, animal refinements and Hydrata (2026-10-21, preview revision 34)

Default native previews: Tick 28,120 triangles, Fly 25,576, Eagle 62,210; seven cat breeds range from 41,699 to 58,522. Cat previews use finer facial sampling with a 38,000-triangle body decimation target while retaining facial locks; other parts add to that target. All seven breeds remain below 100,000 triangles in preview/save checks. New/rebuilt insects, crustaceans, birds and bats retain their 65,000-triangle/128-bone gates. Hydrata adds four bones for its two neck/head chains and duplicates the closed dragon head at bounded scale, reaching 36,644 triangles/61 bones male and 36,544/61 female in preview. Its forked necks rebuild on body edits rather than using the ordinary shape-only path.

The final HTTP browser-worker smoke passes 15 recipes with Node disabled and a 25.0 ms maximum page heartbeat gap. Example builds: Maine Coon 3,559 ms, Hydrata 2,114 ms, Tick 464 ms and Bat 258 ms. These are isolated local diagnostics, not hardware FPS or a speed claim. Geometry tests, multi-angle captures, reference direction and fitting limits are in [CHARACTER-QUALITY.md](CHARACTER-QUALITY.md). Runtime is unchanged; the older quadruped timing limitation below remains recorded.

## Insects, birds, bats and crustaceans (2026-10-21, preview revision 33)

New anatomy uses direct bounded meshes in `CreatureArthropods.js` and `CreatureFlyers.js`, shared by the page, Node worker and browser worker. The 30 new/rebuilt starting type combinations remain below 65,000 triangles and 128 bones in preview/save checks. Preview examples: Tick 12,672 triangles, ground beetle 18,100, Ladybird 22,568, Bee 48,448, American lobster 29,388, Owl 55,886, Eagle 61,930 and Bat 29,306. Separate flight feathers retain a rachis and bounded barbs; fitted contour plumage supplements fine tiled relief. Insect wing veins, leg setae and eye facets are bounded geometry; translucent wings/membranes skip opaque shell maps. Complex local meshes calculate normals once after construction rather than repeating a full normal traversal after each hair/tube. Creature color/normal/material maps remain 512 px in preview and 1,024 px on save, shared between applicable parts. Existing thumbnail workers and caches remain in use.

Actual Windows NW.js six-angle/head/motion captures run four fixtures per hidden disposable app. The real HTTP browser-worker smoke exercises 13 recipes with Node disabled; new-family build examples are 164 ms Bee, 142 ms Lobster, 254 ms Owl and 233 ms Bat in the final run, with a maximum page heartbeat gap of 95.5 ms. These are isolated diagnostics, not hardware FPS or an exhaustive extreme fitting check. Geometry/coverage and local evidence: [CHARACTER-QUALITY.md](CHARACTER-QUALITY.md). The unrelated existing quadruped preview timing gate exceeds 400 ms on this machine on both unchanged HEAD (1,066.5 ms/model) and the working tree (961.9 ms/model), measured over dog/horse/drake. This single comparison is diagnostic, not a claimed speed improvement; the timing gate remains unchanged.

## Shark fin roots and worm variants (2026-10-20, preview revision 29)

Median-fin foundations sample the existing loft triangles at each root point; a fixed chord frame avoids twist without extra mesh subdivisions. Tooth counts remain bounded; arc-length distribution replaces the side-only layout. Anterior shark mouth/nose patches add a small local closure. Tapeworm rows are at most 32 segments × 8/10 samples in preview/save, with 20/32 cross-section vertices. Leech grids use at most 32 × 6/8 axial samples and 32/40 sides. Four recessed scolex patches share one 24×48/32×64 head sphere; splitting their indexed surface regions adds no triangles. Other natural worm variants reuse the bounded segment chain; bristle tufts use three/five short fibers per side per segment. Goa'uld has the existing bounded segment chain plus Head/Jaw, three lofted head sails and bounded teeth/palps. Its wrinkle maps use 256/512 pixels and the existing 12-entry shared surface cache. All selected type/default/contrasting cases are checked against 65,000 triangles and 128 bones. [Appearance and validation](CHARACTER-QUALITY.md).

## Marine anatomy (2026-10-20, preview revision 28)

Marine bodies use separate longitudinal half-lofts for upper skin and lower jaw, with shared rear boundaries and a native Jaw joint. Preview body grids use 72 axial steps and 24 half-ring intervals (40 for whale pleats); saves use 100 and 32/64. Rounded swept fins blend their roots into body bindings. Small surface details sample exact triangles in the loft chart instead of scanning the entire body with rays. Great-white serrations are actual bounded tooth meshes. Default reviewed previews have 15,244–29,056 triangles; all 13 type variants remain below 65,000 in preview and save and below 128 bones. Whale throat detail replaces indexed body faces and retains their boundary weights.

Fine pore/scale color and normal maps are 256 px in preview (0.5 MiB together), 512 on save (2 MiB). Bony fish add a separate fin-ray pair, doubling those totals; sharks/cetaceans share their smooth-skin pair with fins. The shared picture cache retains at most 12 style/size entries. Native NW.js reviews run at most four fixtures per browser: final static, closeout and shark-polish batches peaked at 1.69, 1.68 and 1.69 GiB respectively. These are llvmpipe appearance/resource checks, not hardware FPS measurements. [Coverage and references](CHARACTER-QUALITY.md).

## Non-humanoid and fitted surface details (2026-10-20, preview revision 27)

The 14 new aquatic/invertebrate presets use direct, bounded meshes and native chains, without a quadruped surface-net build. Shared fine color/normal tiles use 256 pixels each in preview (0.5 MiB together), 512 on save (2 MiB); the cache retains at most 12 family/size combinations. UV charts duplicate boundary vertices without adding triangles. Static thumbnails omit these tiles. Reviewed previews range from 3,256 triangles for the worm to 17,064 for the squid; new-body regressions keep preview/save/default/extreme cases below 65,000 triangles and 256 bones. Counts are clamped: at most 16 flexible appendages, 12 leg pairs, 32 axial segments and 12 eyes. Each flexible appendage has six bones. At most 2,048 small support samples per built rig bound pose-floor estimation; no mesh buffers are retained in those samples. Saved clips carry the correction as root translation. Body type controls select the relevant dimensions, keeping incompatible gear out of these builds. Page, browser worker and Node worker share the generator. Surface transfer still excludes rig internals and compares bounded hashes in worker parity checks.

Royal horse gear adds about 30,000 triangles across materials; war gear about 26,000, including fitted trim and rivets. Gear has no new texture allocations. Insectfolk add eight bones for the second arm pair. Android crowns keep compact source-addressed vertices; recessed panels and circuitry add geometry without a new image atlas. Ferengi nose/brow refinement stays below 12,800 triangles; earlier ridge-only patches retain their 6,400 cap. Selected quadruped coat pictures increase from 384/1,024 to 768/1,536 pixels, plus 256/512 normal maps. Raw RGBA cost is 2.5 MiB in preview, 10 MiB on save per coat; static pictures retain the conditional coat path. Androids and extra-arm bodies take full shape rebuilds instead of the ordinary fast-drag path. Changes to reused position buffers invalidate geometry and skinned-mesh bounds, and substantially changed extents reframe the preview.

Native captures run through `codex-check`, one batch at a time with a fresh browser and at most four fixtures. Final batches peak at roughly 1.58–1.69 GiB for the whole software-GPU cgroup. These figures bound the audited workload; they are not hardware performance measurements or a proof of every possible 16-arm/high-detail combination. Existing chest-map costs below are unchanged.

## Local chest surfaces (2026-10-20, preview revision 24)

The selected character has a tessellated chest-skin patch and a matching pigment overlay. Default native fixtures use 4,992 triangles per part on the male and 7,424 per part on the female, replacing the coarse skin faces below them. Larger source patches use a lower subdivision factor; the contrasting-size regression keeps each part below 24,000 triangles. The pigment borrows the skin's ambient occlusion instead of participating twice. Minimum-size boundaries stay on the source body. Fine smoothing stays within 3 mm of the existing skin at ordinary projection; extreme bust growth does not multiply the independent areola diameter. Four cached source layouts bound retention as the areola slider changes.

Selected pigment/normal maps remain 512 pixels (2 MiB of raw RGBA together). Saved maps increase from 512 to 1,024 pixels (8 MiB together, 6 MiB more); the body atlas and genital maps are separate. Static catalog pictures keep their cheaper geometry/maps. The male helper remains 5,824 triangles; paired anatomy adds only the second shaft, reaching 7,845 in the normal Klingon fixture rather than duplicating the scrotum.

Isolated native batches contain at most four models and close the browser between batches under `codex-check`. Earlier final-view batches peak at 1.6–1.7 GiB for the whole cgroup using llvmpipe. These are resource/appearance checks, not hardware-GPU timings or a whole-editor performance comparison. Evidence is in ignored `scratchpad/character-refinement/`.

## Character detail budgets (2026-10-19, preview revision 20)

The local anatomy/areola pass spends geometry and texture memory only on uncovered detail. The example bald female/male models total 38,930 / 39,152 triangles, with 5,654 / 5,824 in the genital part. Areola normal maps add no geometry; cranial ridges deform the existing head. Static catalog builds omit anatomical normal maps and preserve the coarse helper budgets.

An alternating six-sample warm CPU diagnostic, with cached pictures and 128 px body skin, measures selected-model generation at about 48 ms female / 35 ms male, against about 23 ms before. Save generation measures 257 / 281 ms against 212 / 215 ms with cached pictures. Added local color/normal buffers are 3.5 MiB in preview and 8.75 MiB on save (uncompressed RGBA). The body atlas, cold texture painting, GPU upload, cloth baking and whole-scene FPS are separate costs. Shape-only controls reuse pigment/relief maps. Evidence and remaining clipping limits: [Character quality](CHARACTER-QUALITY.md), ignored `scratchpad/genital-refinement/bench.json` and `scratchpad/hair-refinement/audit.json`.

## Coalescing streamed foliage batches (2026-10-19, runtime 20261019.3)

Streaming grass previously merged a region again every time another chunk arrived, copying and uploading growing versions of the same instance buffers. `DrawBatches` now waits until that region's queued foliage chunks finish before merging grass and bushes. Source chunks stay visible meanwhile; an edited old batch is removed and its remaining chunks revealed, so stale geometry is not left on screen. Finished regions merge independently. Queue progress, edits, cancellation and context restoration still trigger updates; an unchanged waiting queue does not repeatedly rescan its chunks. `COALESCE_STREAMING = false` restores immediate merging for comparison. Plain building-piece batching is unchanged.

Native Windows NW.js runs on the local i5-10500H / RTX 3060 boot disposable Demo copies and transfer to North Haven. Both final comparison runs retain batch arrays only for diagnostic hashing; the shipped runtime still releases uploaded arrays as before. Across arrival/streaming:

| Work | Before | After |
| --- | --- | --- |
| Grass region builds | 388 | 55 |
| Newly constructed instance attribute data | 36.93 MB | 6.08 MB |
| Total measured grass-batch construction CPU | 191.6 ms | 56.0 ms |

This removes about 86% of grass merge calls and 84% of the instance-buffer construction data. All 55 completed grass batches have identical bounds/counts and SHA-256 attribute signatures between runs. Timing is one diagnostic pair, not a statistically controlled whole-map loading or visible FPS result; scheduling changes the exact number of redundant baseline builds (another baseline recorded 375). A largest individual build still takes about 8–10 ms in this pair. During arrival the unmerged source chunks temporarily require more draws, so integrated-GPU behavior still needs the owner's weaker-system check. No density, material, texture or final geometry detail is reduced. Evidence: ignored `scratchpad/load-perf/game-stream-{baseline-hash,coalesced}/stream-work.json` and corresponding profiles.

The 160 focused batching, foliage, neighbors, lighting, cache, scheduling, memory and documentation tests pass, including streamed edits, an empty final job, bush shadow casters, context restoration and cancellation. A fresh native map/Forge switching smoke retains the view, makes zero inactive draws/steps, and preserves the earlier light-pixel/camera checks. All 19 bundled projects match runtime. Generic per-object transform caching and a heap-based instance merge were also tested but removed: extra checks/wrappers or small-region overhead did not give consistent CPU wins. Cold shaders, individual large generation/merge jobs and renderer traversal remain separate targets; no low-end hardware claim is made yet.

## Change-driven frame work (2026-10-19, runtime 20261019.2)

Flat light pools now retain each slot's geometry, UVs and color separately. A steady light does not rebuild vertices or mark attributes for GPU upload; brightness/color flicker changes only color, and movement changes only placement. Shape changes update UVs when needed. Terrain/facade placement, moving blockers, view occlusion and light selection still run so cached geometry never hides a dynamic change. Volume lighting is unchanged by this optimization.

Billboard up vectors and facing bases are cached per camera quaternion/tilt, rather than recalculated for every character every frame. Each object copies its facing only when different; alternating cameras retain independent entries, and externally edited rotations are repaired. The Forge main camera similarly re-aims only when its orbit, target, camera/up or actual transform changes. Animation and requested draws are not reduced, and no visual-quality settings change.

Controlled alternating seven-round Node diagnostics on the local i5-10500H, with 60 lights or 60 billboards per update and warm assets, measure median light-update CPU **0.0123 to 0.0069 ms**, and billboard-facing CPU **0.0139 to 0.0025 ms**. These are small isolated update costs, not whole-frame FPS or loading-time claims. More importantly, 60 steady frames mark **360 to zero** pooled attributes for upload. The native NW.js/RTX 3060 smoke confirms zero `bufferSubData` calls for those frames, nine edited/reordered light renders match the preceding implementation byte-for-byte, and a real Forge view performs 60 draws with one camera aim. Workspace switching still produces zero inactive draws/animation steps and retains the loaded view. Evidence: ignored `scratchpad/load-perf/frame-bench.json`, `frame-native.json` and `activity.json`.

A disposable native game copy also boots and transfers to North Haven (45 events), with a controlled 16-ms ticker because hidden-window animation frames are throttled. After 15 seconds settling, a four-second diagnostic records 4.37 ms CPU update and 0.68 ms render submission per tick; GPU median/p95 9.04/18.90 ms. This is a current-state smoke/profile, not a matched before/after benchmark or visible-window frame rate. The 152 targeted lighting, cache, scheduling and documentation tests pass; all 19 bundled projects match runtime. Renderer world-matrix traversal and object projection remain prominent steady CPU costs; cold shader compilation and map/foliage streaming are separate arrival costs. Physical two-monitor use, integrated GPUs and full-game coverage remain unverified.

## Avoiding repeated character texture work (2026-10-19)

The next profile is CPU generation, not rendering: changing hairstyle repainted the whole skin picture, and small UV triangles repeatedly shaded padding pixels that a later triangle overwrote. `CharacterSkin` now determines the final triangle owner first and shades only that owner, preserving the original first-interior/last-padding rule and barycentric arithmetic. Only two small raster plans stay cached per body pack. Reusable base skin noise uses double-precision storage at 256 pixels or below; common 128/256 plans total about 2.3 MB. Larger main-view/export pictures use a temporary ownership map and retain no noise cache. Constant color conversions move out of the pixel loop, and uncovered scalp pixels skip invisible strand noise. No additional texture resolution, geometry or visual detail is reduced.

On the local i5-10500H, three alternating before/after generation rounds after warming assets produce a median **1,149 to 513 ms** for three hairstyle variants (about **55% less generation time**). Each round builds fresh variant pictures rather than reading finished thumbnails; this is not whole Forge startup or frame rate. Separate fresh-process component diagnostics show the first three variants at 2.10 versus 1.48 seconds, but those include JIT/cache warmup and are not the controlled headline. Evidence is in ignored `scratchpad/load-perf/skin-batch.json` and `components-{before,noise}.json`.

All 17 skin patterns, makeup, changing colors/scalps, facial hair, age, anatomy, fur alpha, cache eviction and a larger texture match the original overlapping-triangle painter byte-for-byte. Seven real-GPU body/head, metal, boots, long-hair, slime and creature WebPs also match the preceding renderer exactly (`raster-pixels.json`). Rebuilding catalog HTML keeps the previous picture for the same item/project until its replacement arrives, without marking it current or suppressing its new build; pictures from another project are never borrowed. Main-view shaders and unique garment construction remain separate costs. This does not supersede the earlier cold-driver and low-end-hardware limitations.

## Fixed-size character thumbnails (2026-10-19)

The 96-pixel catalog pictures now have a separate lightweight rendering path: Phong lighting, a tiny procedural reflection cube instead of a GPU-filtered studio, no skin pores/relief/sheen/clearcoat shaders, half the hair/fur strand budget, 128-pixel body skin and 256-pixel close-up skin. Clothing pictures are capped at 256 pixels; eyes are painted at 128. Shoe pictures are generated at thumbnail resolution instead of 512. Large imported pictures are coverage-aware box-filtered once per immutable source, and unused maps are omitted. Preview31 retains explicit relief maps at thumbnail resolution and samples them in the same lightweight Phong material; repeating creature tiles retain their wrapping. Physical roughness/iridescence remain approximated in catalog tiles, with the full finish in the selected view. Body shapes and framing stay intact; a coarser slime silhouette was visibly worse at 96 pixels and is not used. Thumbnails are intentionally approximate, not byte-identical to the full renderer. Choosing an item still builds it in the unchanged full-quality main view, and Save retains its original detail and animation.

Static builds skip generating unused animation clips. Startup loads body/eye assets together and only preloads transferred outfits used by the selected recipe; other outfits load when needed, without rebuilding the main character for an unrelated picture arrival. Thumbnail shader programs prepare with Three's `compileAsync` before drawing, using parallel driver compilation where supported. Shared renders are serialized; switching recipes/windows or closing during compilation discards the result and releases resources after compiler polling finishes. Cached programs and disk pictures are still reused. There is no automatic full-quality second thumbnail pass: it would spend work on detail that the fixed-size image cannot show.

Native Windows NW.js diagnostics on the same i5-10500H / RTX 3060, isolated shader-empty profiles, hidden windows (`scratchpad/load-perf/thumbnail.cjs`, `thumbnail-before-final.json`, `thumbnail-final.json`):

| Work | Before | After |
| --- | --- | --- |
| First default thumbnail render, including renderer setup/compilation/readback | 1,604 ms | 135 ms |
| Largest 10-ms timer gap during that render | 1,605 ms | 45 ms |
| First metal-outfit thumbnail render | 661 ms | 81 ms |
| Default thumbnail transferred render buffers | 6.49 MB | 2.32 MB |
| Long-hair thumbnail triangles | 86,972 | 47,624 |
| Default thumbnail worker generation, cold | 922 ms | 745 ms |

The first render falls by about 92%; this is not the whole editor/Forge opening time. Real-GPU 96-pixel body/head, long-hair, metal, boots, slime and creature pictures were inspected. Worker wall-clock delivery and whole-catalog completion are not compared because hidden-window scheduling varies; some heavy outfit builds still take over a second off-page. This does not remove the main viewport's first physical-material shader compilation, initial model generation or the map's cold shaders. Older GPUs without parallel compilation may still block during driver work; no universal hardware/FPS guarantee is made. Targeted tests cover source/cache isolation, transparent edges, browser/Node parity, stale results, serialized compilation and closing while compilation is pending.

A real Node-disabled browser worker smoke builds eight procedural, imported, modeled, emblem and creature variants with finite geometry and the expected pictures; its page timer's largest gap is 18 ms. The retained-window smoke still finds zero inactive draws/animation steps. The broader creature/slime functional sweep passes 32 checks but its existing 400-ms average creature-build budget fails on this laptop (428 ms in an isolated cold retry); the unmodified HEAD implementation also measures 436 ms cold in an alternating diagnostic (`creature-timing.json`, warmed before/after 385/375 ms). That timing gate is not relaxed. The expensive full character/export sweep is stopped rather than reported as complete; this is not a full-suite pass.

## Active-window previews (2026-10-19)

The 3D map and Forge's 3D Character Builder now share preview time by workspace. Pointer input, keyboard focus and native window activation choose the workspace; leaving the application pauses both. The inactive view cancels its recurring animation-frame callbacks and retains its loaded scene. Returning resets animation clocks before resuming, so the character keeps its pose without simulating the inactive interval or rebuilding merely because focus changed. Opening, hiding, closing and floating windows use the same policy. This is editor-only scheduling; saved models, runtime rendering and visual quality settings are unchanged.

The Builder also suspends thumbnail requests, Talk morph updates and new skin-paint work. Pending rebuilds and shading wait for reactivation, and WebGL setup is deferred if body assets finish loading after the user switches away. An already-running thumbnail worker can finish its current calculation off-page; its obsolete result is discarded and further jobs wait. Input redraws share the animation's next frame instead of scheduling an additional draw, and an empty skin-paint queue no longer creates a worker. Map media surfaces and model-bound videos pause decoding; independently scheduled MV/Effekseer map effects stop their own frame loops. The playtest's five-second graphics-memory release remains a one-shot deadline while map frames are stopped.

All 199 targeted checks pass. Behavioral tests advance 60 refreshes with each workspace active: the inactive map performs zero renders, animation steps or layout checks; the inactive character performs zero renders or mixer updates. Repeated character redraw requests still produce only one render per refresh. Tests cover app focus, native window handoff, retained pose time, deferred startup/shading, late startup cancellation, effects, video readiness events and teardown.

A real NW.js check with the editor and Forge in separate hidden native-window documents alternates Forge → map → Forge. Across each 2.6-second sample the inactive view has **zero renders and animation steps**, and the Character Builder retains the same view object; closing Forge resumes the map. No unexpected console errors. Evidence: ignored `scratchpad/load-perf/activity.cjs` and `activity.json`. Hidden-window frame pacing prevents an FPS or GPU-percentage claim; physical two-monitor interaction and sustained low-end-hardware measurements remain open.

## Map models and Character Builder previews (2026-10-19, runtime 20261019.1)

Windows NW.js on the i5-10500H / RTX 3060 laptop, with isolated fresh profiles and hidden harness windows. These are local loading/render diagnostics, not whole-editor FPS measurements or a guarantee for other hardware. Raw profiles, scripts and reports are in ignored `scratchpad/load-perf/` (`map-{before,after}-partial.json`, `builder-before-partial.json`, `builder-after.json`).

| Work | Before | After |
| --- | --- | --- |
| North Haven, first geometry/event build | 5.06 s | 3.98 s |
| North Haven, three retained-map rebuilds, median | 1.42 s | 0.64 s |
| Events within those rebuilds, median | 865 ms | 62 ms |
| Twelve Outfit pictures read from disk and decoded | 454 ms | 66 ms |
| Repeated identical thumbnail render, last three of four, median | 70.6 ms | 13.6 ms |
| Shader programs created per identical thumbnail after warming | 7 | 0 |

Model materials carried their normal and emissive textures in `userData`. Three's material clone serializes that data through JSON, which encoded those images to data URLs on every instance. `cloneSurfaceMaterial` excludes the shared textures from that serialization, then restores their references and copies independent glow/normal-scale state. It also covers vertex-colored glTF material clones. The main-thread profile's 3.37 seconds of image encoding across the measured map sequence is removed.

The thumbnail renderer keeps the preceding picture's materials alive until the next picture has rendered, so matching shader programs remain referenced. Geometry and GPU textures are still freed after each picture; only one picture's materials remain, and closing the Builder releases them. Four repeated real-GPU renders produce identical encoded pictures within each run. A separate real-GPU comparison against the previous renderer produces byte-identical WebP pictures for the default character's body, head, face, feet and back framings (`pixel-comparison.json`). Cached visible pictures are read together, can appear before the main character is ready, and bypass an unrelated pending build. Refreshing an active tile no longer queues it again. Stale disk results, recipe changes, hidden tiles and teardown have behavioral regression coverage.

Cold work remains: the initial map frame still takes about seven seconds in these shader-empty profiles, and first-use character setup and uncached character generation are not eliminated. The hidden windows also pace animation frames differently from a visible editor, so whole cold-catalog completion times are deliberately not compared. This earlier pass reduced no geometry, image resolution, lighting, antialiasing or saved-character settings; the later fixed-size thumbnail pass above deliberately uses cheaper catalog pictures only. The 141 targeted model, worker, scheduling, resource-release, manifest and documentation checks pass; this is not a fresh full-suite or visible-screen interaction sweep.

## Legacy artwork cleanup during import (2026-10-18)

Dither cleanup runs once in the existing import worker and adds no gameplay
filter. Each eligible image is capped at4,194,304 pixels; larger images stay
unchanged, and processing holds one image at a time. A local worst-size
2048×2048 checkerboard diagnostic takes1.56s with peak90MB; a640×480 image
is about125ms in that isolated helper measurement. These are CPU diagnostics,
not whole-editor frame measurements. A real NW worker import of Sunset's65
maps and217 eligible artwork files finishes the asset/data stage in4.37s
(104 files/12,389 pixels changed). The disposable UI fixture excludes Music
to avoid measuring MIDI conversion; source and original graphics are retained.
No baseline speedup is claimed. Evidence: `scratchpad/rm2000-artwork-ui/` and
`scratchpad/rm2000-text/artwork/`.

## Shared asset picker sorting (2026-10-18)

`PickerIndex.js` feeds image, audio and resource browsers. Previously every sorting comparison constructed grapheme segmenters and locale collation work, then repeated section and basename calculation. The helpers now live once per module; name metadata lives only within the current grouping/tree operation, so old libraries do not accumulate in a global name cache.

Five warmed alternating before/after runs on the local Ryzen 9 9950X3D, with exact tree output checked each time:

| Folder tree | Before median | After median |
| --- | --- | --- |
| Demo's 442 actual image names | 7.55 ms | 0.99 ms |
| 5,000 mixed Unicode/numeric asset names | 689.78 ms | 32.58 ms |

The old comparator remains in the optional benchmark as an executable reference: `node editor/tests/perf/picker-index.cjs`. Regression tests compare pairwise sorting, groups and folder trees against it, including NFC/NFD, multi-codepoint graphemes, numeric names, accent/case ties and missing Intl helpers. Ordering and search behavior remain the same; the work per operation is reduced.

## Character Builder catalog pictures (2026-10-18)

The Bikini redesign adds real narrow cords: standard worn geometry rises from 2,366 to5,674 triangles. Static triangle/skin bindings are reused while positions are evaluated against the current body; a nine-sample warmed local diagnostic changes15.32→9.51ms median, with no whole-editor FPS claim. The final eight-variant browser-worker smoke, including Bikini and both knight presets, peaks at11.2ms on the independent heartbeat. Evidence: `scratchpad/bikini-quality/bench.json`.

The medieval armor follow-up replaces body-following metal cuts with formed rigid sheets. On the same standard male Knight, worn outfit geometry falls from25,750 to21,851 triangles (15%); a small nine-sample warmed generation diagnostic is effectively unchanged at132.32→132.12ms median. This is not a whole-editor/FPS result. Local evidence: `scratchpad/knight-quality/bench.json`. The expanded eight-variant browser-worker smoke, including Knight/Dark knight, peaks at11.4ms on its independent heartbeat.

Fresh isolated NW.js profiles, empty thumbnail caches, the same copied project and default character, 1366×900 window, Ryzen 9 9950X3D with AMD integrated graphics. Each phase also observes three seconds after the visible pictures finish, catching hidden work. Frame gaps, an independent 16 ms heartbeat and browser long tasks were recorded; images count only after decoding. These are single local before/after runs, not a hardware-wide guarantee.

| Phase | All visible pictures, before → after | Worst frame, before → after | Hidden builds, before → after |
| --- | --- | --- | --- |
| First Species, 12 pictures | 7.19 → 4.55 s | 567 → 457 ms | 6 → 0 |
| First Outfit, 15 pictures | 5.45 → 3.57 s | 467 → 34 ms | 8 → 0 |
| Cached Species | 16 → 18 ms | 450 → 17 ms | 2 → 0 |
| Cached Outfit | 15 → 14 ms | 334 → 17 ms | 3 → 0 |
| Bottom Outfit, 13 pictures including imports | 20.12 → 10.38 s | 5,764 → 67 ms | 3 → 0 |

The bottom-Outfit heartbeat gap fell from 5,771 to 95 ms. First Outfit has no long tasks after the change; bottom Outfit has two small 54–58 ms tasks. The first Species phase includes initial selected-character/model/WebGL setup, whose early main-thread stalls remain. The first small GPU preview render costs about 81 ms; later renders peak at 26–33 ms. Both successful runs have no unexpected console errors.

Full character generation runs in one background worker; only visible tiles are requested. The Builder reads its desktop cache asynchronously, avoids duplicate jobs and discards stale results before GPU uploads. Recipe/choice changes cancel queued jobs while reusing the warmed worker; an already running build finishes off the page before the latest request. Hiding/closing the tool and timeouts still release the worker. Static arrays cross NW's Node/browser boundary as local typed views over the same buffers. Desktop source outfit textures, user imports and emblems are supplied as resource snapshots. Web builds load packs and decode images inside their dedicated worker.

The second quality pass found a sustained-switching failure: terminating/recreating desktop workers on each obsolete preview drove renderer RSS toward 4 GB and crashed two isolated runs after 42–44 models. The same 59-model sequence completed with thumbnails disabled. Reusing one worker then completed all 59 with thumbnails enabled, 118 actual front/back renders and zero console/GL errors: sampled process RSS peaked at 2,112 MiB and ended at 1,554 MiB. This is one local stress run, not a memory guarantee for every project or platform. Reports, exact recipes and captures live in ignored `scratchpad/quality-pass2/catalog-gpu-{no-thumbs,reuse}/`; scheduler regressions verify reuse, stale-result rejection and disposal on teardown.

Regression tests are `character-preview-{worker,browser-worker,scheduling}.test.cjs`. The real browser smoke `editor/tests/smoke/character-browser-preview.cjs` builds six variants, including heavy Captain, modeled clothes, a custom import and an emblem with no Node or Model on the page; its main heartbeat peaked at 10.1 ms while the heavy builds took about one second off the page. Disposable NW benchmark scripts, source hashes, screenshots and raw measurements are in `scratchpad/preview-perf/` locally.

## Draw batches, per-pixel light on a discrete GPU, the light volume's steps (2026-10-15, runtime 20261015.2)

Same laptop, panel and walk as the section below. After that round the game still held only 72 to 90 fps there, main-thread bound: about 600 draw calls a frame across the passes, three's cost per draw (its walk, the program, the uniforms) rather than the GPU's. A census of every draw by pass: the main view (both halves of the quarter-size light) and the water mirror about 350, the capture's face 155, the shadow rows 47; most of them static map pieces and plants, one mesh per material per 16-cell chunk.

| Change | Switch | Result |
| --- | --- | --- |
| Pieces and plants are still laid and edited a 16-cell chunk at a time, and drawn a 64-cell region at a time: a region's chunks of one material copied end to end into one mesh in the same group, the chunks hidden and kept (the editor picks them, the ghosts share their geometry, an edit relays one), the plants' instances merged in order of their thinning share. Remade from the arrays when a chunk under it comes or goes; looked at only when a chunk was laid or a group's count moved, and once a second. A finish, a textured see-through and an animated part keep their own draws; glass merges (one colour, no picture, no depth written: its layers blend alike in any order). The region's arrays are let go of once uploaded and remade from the chunks if the context comes back. | `Reactor3D.DrawBatches.enabled` (`REGION`, `FREE_ARRAYS`) | Draws a frame 639 → 298; frame median 13.9 → 7.0 ms; frozen frames on maps 5, 9, 11 and 12: 0 channels differ. A 64-cell build chunk measured the same draws but meshed rocks and relaid edits 16 times larger; 128 drew more than it saved |
| The quarter-size light only on the weak tier: a discrete GPU lights per pixel in one draw, faster than the split's second walk and draw cost the CPU | `Reactor3D.HalfLight.WEAK_ONLY` | Standing still: refresh with an update 12.3 → 10.3 ms, frame median 13.8 → 6.9 ms, draws 259 → 167; GPU 3.0 → about 4 ms |
| The light volume stays where it was laid until the focus strays 8 tiles (it was laid again for every tile walked, three new 8 MB targets each time); a retired volume's targets are filled again by the next of its size | `Reactor3D.LightVolume.REGION_STEP` | Bakes in 5 s of walking 283 → 48; the grid is the world's, so no sample moves |
| PIXI v8 asks every window each frame: a hidden one, and a closed one once laid out closed, are passed over | `Window.SKIP_UNSEEN_LAYOUT` | 0.28 ms a refresh on the map |

All together, North Haven walk at 144 Hz: frame median / p95 13.9 / 20.8 → 6.9 / 7.2 ms, draws 601 → 181, refresh with an update 13.3 → 8.7 ms (median). With the profiler on, 1,665 frames: median 6.9, p95 7.1, no spike, 1.7 ms idle a frame. Weak tier forced on the same machine (`Reactor3D.gpuTierOverride`): draws 505 → 122, frame p95 14.0 → 7.2 ms. Editor orbit: 12.1 → 7.9 ms a draw, frame median 13.9 → 7.0 ms. Smaller maps (1, 12) were at 144 Hz before and stay there with fewer draws.

Measured and left alone: hiding model branches with nothing drawn in them (six skeletons, 290 nodes) from the passes' walks, no difference; marking static chunks so three's matrix pass skips them (this three stops their world matrices too, and the saving is about 0.1 ms). Seen and not changed: chunk and region meshes stand at the map's corner with their vertices in world space, so the shadow rows' face mask (a caster's position and span) never counts map pieces; that was so before this round.

## Reflections and the editor's 3D view on a laptop (2026-10-15, runtime 20261015.1)

The owner felt jitter in 3D, in the game and the editor. Measured on the owner's Windows laptop, i5-10500H with the RTX 3060 (full tier), its panel at 144 Hz, 1920x1080 game window; the NW harnesses ran on the desktop with the owner's leave. North Haven walking the village square loop (`--map=5,83,65`), runs interleaved, medians of rounds.

The game was main-thread bound, busy 16 ms of each 13.9 ms frame. A refresh with no update cost 5.7 ms, one with an update 14 ms, so frames slipped between one, two and three refreshes. Turning both reflections off gave a steady 144 fps; reflections were a third of the frame.

| Change | Switch | Result |
| --- | --- | --- |
| A water mirror draws only the part of its picture that water at its level can show on screen (8-tile blocks, refined tile by tile near the eye, widened by the ripple's reach), at the same pixels as the whole picture; its eye is narrowed to that part, so what lies outside is culled. A lookup outside the drawn part keeps the capture (`rrMirrorArea`). Mirror-finish models keep the whole picture. | `Reactor3D.Mirrors.WATER_AREA` | Draw calls a frame 816 → 615, GPU median 9.2 → 5.6 ms; frozen frame by the fountain: 0 channels differ |
| The reflection capture's face for an update waits for the next refresh with no update; with none before the next update, that update draws it. At most one face an update, as before. | `Reactor3D.Reflections.SPARE_REFRESH` | Update tick median / p95 13.8 / 20.4 → 12.6 / 16.0 ms; frame p95 20.8 → 14.0 ms; frames over 1.5x the median 8.7% → 3.5% |
| Editor: world matrices once a frame before the shadow rows and the reflections (each of their draws recomposed the whole graph) | none | Render while orbiting North Haven 14.4 → 12.4 ms |
| Editor: while the view moves, the capture takes a face every other draw; the draws after it stops fill the cube. A frame after one that showed nothing shiny takes none, as in the game. | `MapEditor3D.PROBE_HALF_WHILE_MOVING` | Render 11.5 → 9.75 ms; orbit frame p95 20.9 → 14.0 ms (a steady 72 fps on the 144 Hz panel) |

Measured and left alone: culling objects too small to show in the capture's 512 faces (walking the scene cost more than it saved; North Haven has few small things); a fixed every-other-refresh draw at 144 Hz and a time-based one (both put a fifth to a third of draws three refreshes apart, worse than drawing on every refresh); the quality levels (they held level 0 throughout and do not switch under play). Effect readbacks are asynchronous already.

Left, all main thread on this CPU: three's own walk and per-draw work (`projectObject`, `renderBufferDirect`, `setProgram`, about 0.3 ms per hundred draws); the quarter-size light's split (`HalfLight.begin`, 0.4 to 0.9 ms a pass); about 57 foliage, 54 piece and 30 model and character draws in the main view. The UHD 630 was not measured: Windows keeps NW on the RTX whatever the manifest says, and the weak tier draws neither the capture nor the mirrors.

## Frame pacing, 2D maps, models, memory and workers (2026-10-14 to 15, runtime 20261014.4)

Measured on the Linux dev machine, Ryzen integrated Radeon (weak tier) on a headless display, CPU throttled 4x where marked (t4); medians of 3 alternated runs. Items marked *unmeasured* were finished on 2026-10-15 on the Windows machine with Node tests only; their checks are listed under Still to measure.

| Change | Switch | Result |
| --- | --- | --- |
| Interpolated drawing when updates land unevenly (144, 165, 100, 50 Hz; 180 Hz at 90 fps); one update a frame only when the frame is itself a tick long (irregular frames had run the game at 80% speed) | `Graphics.FramePacing` | Emulated 144 Hz camera speed variation 0.36 to 0.46 → 0.009 (RTX) / 0.02 (iGPU); no cost at t4 |
| Garbage: normals computed over the index (three's math had boxed every number), glTF arrays repacked, `IntegerSort`, `Shadows.sortFaces`, `DoorRest`, reused split and depth-first lists | `Reactor3D.DoorRest.enabled` and others | North Haven walk, iGPU: main thread 6.78 → 5.41 ms, garbage 875 → 346 KB a frame, frame p95 / sd 18.9 / 1.27 → 17.3 / 0.31 ms |
| A new program's uniforms read between frames | `ShaderWarmup.readEarly`, `Reactor3D.lazyUniformArrays` | Arrival in-frame reads 96 → 36 ms, worst frame 37 to 48 → 21 ms |
| Battle on the map asked every one of 10,000 event slots whether it was starting | none | 2 to 3 ms a battle frame; battle-start worst (t4) 344 → 316 ms |
| One object shape per kind of character, also after a load (saves unchanged) | `Game_CharacterBase.evenShapes` | Hidden classes 16 → 4; logic 1.10 → 0.95 ms |
| A map's effects load behind the fade; grips cached; hull meshes copied in idle time; Reactor UI windows built through the upgraded classes | `EffectManager.preloadWithMap`, `Reactor3D.GripMemo`, `HullWorker.idleCopy` | *unmeasured* (expected PIXISuper 3.4 → 0.2 ms at an Action start) |
| Battle line-of-sight hulls built in a worker, bit-identical | `ReactorFight.Action.HullWorker.enabled` | Tactical worst frame 337 → 66 ms (t4 1368 → 336); Action 383 → 67 ms |
| 2D tilemap painted in 8x8-tile chunks built once, water frames by a UV patch; any plugin hook on the paint path keeps the full repaint, which is itself cheaper | `Tilemap.ChunkPaint.enabled` | Big water map, t4: tick p95 / max 6.1 / 9.4 → 1.4 / 2.8 ms; with VisuMZ (fallback) 19.1 / 24.6 → 12.8 / 18.3 ms; pixels identical |
| Chunks also while UltraMode7 is installed but not drawing the map (its hooks checked against the stock methods) | `Tilemap.ChunkPaint.passThrough` | *unmeasured*; the Demo's 2D maps were on the fallback |
| Tile atlas packed to its sheets, CPU copy freed after upload | `Tilemap.Layer.v8AtlasPacked`, `v8AtlasDropsCanvas` | Full MZ tileset 48 + 48 MB → 18.6 MB |
| Bitmap draws upload only the changed area (WebGL 2) | `Bitmap.partialUploads` | Letter-by-letter message 455 → 21 KB a frame |
| Neutral sprite colour filter skipped; per-frame update walks, gamepad polling and wheel checks allocate nothing | `ColorFilter.skipNeutralSpritePasses` | 2 s walk allocation 128.9 → 10.2 MB (with the chunks) |
| Model textures capped at 1024 on the weak tier, GLB images decoded in a worker, finger skinning in a worker, uploads in 4 MB bands | `weakTextureSize`, `GlbCompact`, `ImageWorker.embeddedBytes` | Textures 236 → 60 MB; 220 ms and 134 ms main-thread stalls → 0 |
| Optional KTX2 copies of model textures (BC7 / ETC2 / S3TC, transcoded in a worker) | `Reactor3D.KTX2` | 236 → 156 MB at 2048; +3.8 to 4.9 MB a file |
| Demo GLBs stripped of images no material samples | build script `drop-unsampled-images.cjs` | 124.5 → 69.6 MB, 0 pixels differ |
| Games and the editor ask for the discrete GPU and past the blocklist | `"reactorHighPerformanceGpu": false` opts out | Verified on the GPU process command line |
| Editor: shadow lists forgot old scenes (leak ~31 MB a rebuild); models swept on map change; scene parked during a playtest | `SWEEP_MODELS_ON_MAP_CHANGE`, `PARK_AFTER_MS` | 20 rebuilds 1882 → 2508 MB PSS before, flat after; park frees GPU 631 → 276 MB |
| Editor: video effect planes share one video per file, in the 3D view and the 2D model preview | `MapEditor3D.SHARE_EFFECT_MEDIA`, `ModelPropEffects2D.SHARE_VIDEO` | Reactor Room 3D: 10 decoders → 2, GPU 3123 → 2455 MB; 2D preview *unmeasured* |
| Editor: the 2D map's GPU data released when 3D takes over (PIXI collects only after a 2D draw) | `MapEditor3D.RELEASE_2D_GRAPHICS` | *unmeasured* (140 to 180 MB seen freed by a manual collect) |

Measured and left alone: parallel Effekseer loading (no boot gain), dropping 3D files from 2D boots (0 to 30 ms), saves in a worker (5 ms whole), neighbor JSON in a worker (structured clone costs as much as the parse), a memo on battle gauge `param()` (no change hook to make it safe). SharedArrayBuffer works in NW (not on plain web builds) and nothing needs it yet. A render-thread prototype (`editor/tests/perf/render-thread/`, loaded by nothing) drew North Haven in a worker: main thread 26.8 → 9.5 ms at t4, but without models, shadows or effects; production would take an estimated 2 to 3 months.

**Still to measure (Linux harnesses):** battle-start spikes at t4 with the round-2b changes; Action HUD pixels with `built()`; live save and load with `evenShapes` (a 0.99.0 save, Star Shift Rebellion file11); the Demo's Map007 with `passThrough` on and off (chunked, pixels, timing) and a map that turns UltraMode7 on and off; the 2D release (GPU memory 5 s after 3D on, and the first 2D frame on return, t4); Reactor Room with 3D off; one video's decoder cost; the game against the editor on Reactor Room at both tiers.

## CPU and GPU waste, second pass (2026-10-14, runtime 20261014.4)

Measured on this machine's two GPUs, Ryzen integrated Radeon (weak tier) and RTX 5070, 1920x1080 on the 60 Hz headless display. Main-thread figures moved 0.5 to 2.5 ms between identical runs while other harnesses ran; the same-session switch toggles are the firmer numbers.

| Change | Switch | What it stops |
| --- | --- | --- |
| Quarter-size light on maps with water: the unlit twin draws without tint and sheen, the light pass writes a glowing lake's share to a second small target, the combine adds sheen then tint per pixel | `Reactor3D.HalfLight.enabled` | Full-size lighting on every map with water (North Haven). Fixed on the way: shadow rows drawn during a split pass missed every caster lit at full size (the party's and props' shadows); the lake halo stopping at reeds; the shade change at a water/no-water border (`Neighbors.mixedWater` removed). |
| One walk of the visible scene per pass draw, shared by every reader | `Reactor3D.SceneWalk.enabled` | Five walks of the tree (warmup, skeletons, geometry detail, depth-first, quarter light), twice with the split. |
| Shadow faces hide subtrees holding none of their row kind's casters | `Reactor3D.Shadows.casterOnly` | Every face testing the whole scene object by object. |
| A refresh with no game update skips the composite and the Effekseer overlay unless something changed (texture source, queued render work, render-to-texture, resize, new stage, context restore) | `Graphics.skipUnchangedFrames` | The same picture composited again on every refresh above 60 Hz. |
| The sharpening upscale is drawn in the PIXI composite where a screen pixel is one target pixel | `Reactor3D.SharpUpscale.inComposite` | A full-size copy of the 3D picture each frame. |
| Map arrival laid over the loading frames: rock columns and nearby rock chunks in the rock workers, then pieces a chunk at a time (10 ms), water, land past the border, foliage, the models asked for, and unseen draws until shaders are ready (1.5 s at most); neighbors lay pieces in 8 ms parts | `Reactor3D.Arrival.enabled`, `WARM_MS` | The whole map built in one frame on arrival. |
| A Battle Room billboard is copied only when its frame, canvas or bitmap changed; a room-drawn sprite keeps the empty texture | none | Every 2D battler uploaded each update, and a new texture made (and leaked) each update. |
| Editor 3D view: animated lights draw every 45 ms with flicker read from the clock; media, effects, animated models and baking at most 60 a second | none | Full-rate drawing for any flickering light, and flicker speed tied to the draw rate. |
| The map camera is aimed once per update | none | A second aim that stepped camera transitions and the turn ease twice per update (a 60-frame Change Camera took 30). `TURN_RATE` 0.18 → 0.33 keeps the turn feel. |

| | Before | After |
| --- | --- | --- |
| North Haven walk, Radeon iGPU, GPU median / p95 | 15.1 / 19.1 ms | 11.4 / 12.9 ms |
| North Haven walk, Radeon iGPU, frames over 25 ms per 20 s | 2 to 6 | 0 |
| North Haven walk, main thread per frame, Radeon / RTX | 8.57 / 7.81 ms | 7.84 / 7.96 ms |
| North Haven, Radeon iGPU, frozen frame, full vs quarter light: square / fountain / purple lake / river | 14.2 / 13.8 / 20.7 / 13.1 ms | 10.9 / 9.8 / 12.9 / 9.0 ms |
| Upscale in the composite, Radeon iGPU, North Haven cas / crisp / Reactor Room | 11.1 / 10.8 / 10.4 ms | 10.3 / 9.5 / 9.6 ms (0 channels differ) |
| A refresh with no update, main thread / iGPU GPU | 0.27 / 1.1 to 1.3 ms | 0.02 ms / none |
| North Haven arrival, Radeon worst frame / worst shown | 584 / 251 to 300 ms | 153 to 184 (in the black wait) / 67 to 84 ms |
| North Haven arrival, RTX worst shown | 434 to 467 ms | 83 to 100 ms |
| Arriving beside rocks (60, 150), Radeon worst | 836 to 985 ms | 150 to 154 ms |
| Battle Room with 2D battlers, uploads per frame Radeon / RTX | 14.7 (0.91 MB) / 11.8 (0.82 MB) | 7.0 to 7.7 (0.14 MB) / 5.2 (0.058 MB) |
| Editor, Static Room with one flickering light | 60 draws/s, 17.7 to 19.1% CPU | 20 draws/s, 12.6 to 14.1% (7.7% with no light) |

Arrival trade-off: the black loading wait is about 0.8 s longer at normal speed (1.2 → 2.0 s on the Radeon), closing the menu 0.65 to 0.83 s instead of 0.45 s; nothing pops in and the fade runs at full rate. New Game to a fully bright map is +0.5 s at normal speed, unchanged at 4x. `Reactor3D.Arrival.WARM_MS = 0` gives the old wait with pop-in. The RTX's worst arrival frame (634 to 667 ms) is now the first unseen draw: shader builds and about 264 MB of texture uploads.

Sameness: quarter light against full-size, pixels 24+ levels off are 0 to 112 on North Haven (the Reactor Room, always drawn this way: 4,330); after arrival every mesh, vertex and index count and a hash of every piece position matched the one-frame build.

Not done, measured: an event collision index (North Haven's 45 events cost 0.02 ms a frame; 150 wandering events 0.21 ms). Still open: model rigging (`fingerSkinWeights`, 100 to 170 ms each, now inside the wait), the first shader build on the RTX, and the 70 to 85 ms `onMapLoaded` frame.

## Draws thrown away each frame (2026-10-09, runtime 20261009.1)

The owner reported lag spikes and uneven frame pacing on every map, worst on North Haven, on an RTX 5070 with a Ryzen 9 9950X3D and a 180 Hz monitor. The frame was bound by the main thread, not the GPU: standing in North Haven's village square, with no water in sight, the scene was drawn three more times a frame for its lakes' mirror pictures, and every piece chunk a second time for the see-through pass.

| Change | Switch | What it stops |
| --- | --- | --- |
| A water sheet takes a mirror picture only while it has a pixel on screen | `Reactor3D.WaterSight.enabled` (`HOLD`: 30 frames) | A whole draw of the scene per lake whose bounds touch the view, up to four. Asked with an occlusion query round each sheet's draw; in a game only. |
| Mirror pictures at the view's render scale | `Reactor3D.MIRROR_AT_VIEW_SCALE` | Pictures drawn at 1920x1080 for a frame drawn at 1440x810. |
| Only the ghost chunks a see-through corridor crosses are drawn | `Reactor3D.CUT_GHOST_CULL` | Every piece chunk drawn twice (462 ghosts on North Haven; 3 to 11 with a corridor, none without). |
| Light arrays compared in one shared function, one loop per array kind | none | Hundreds of cold closures, 160 KB of number objects a frame. |
| A door's reach asked without making records | none | About 60 KB a frame for 39 doors against every character. |

North Haven, a 45 s walk round a 60-tile square from the fountain (83, 65), 1920x1080, a 60 Hz headless output:

| | Before | After |
| --- | --- | --- |
| RTX 5070, main thread per frame | 12.87 ms | 5.37 ms |
| RTX 5070, frames over 25 ms | 10 (33 ms each) | 0 |
| RTX 5070, standing in the square, tick to composite | 11.2 ms | 5.2 ms |
| RTX 5070, main thread slowed four times | 15.9 fps, median frame 66.7 ms | 41.5 fps, median 16.7 ms |
| Radeon iGPU (weak tier), main thread per frame | 5.62 ms | 4.59 ms |
| Radeon iGPU, GPU median / p95 | 14.5 / 19.1 ms | 14.1 / 17.8 ms |
| Radeon iGPU, main thread slowed four times, standing in the square | 49 to 50 fps, 72 to 87 frames over 25 ms in 8 s | 55 to 59 fps, 9 to 34 |
| Garbage made per frame (RTX walk) | 1,155 KB | 937 KB |

The Reactor Room on the RTX after the changes: 6.42 ms a frame, no long frame in 30 s. The picture was compared with each switch on and off with the game running: the fountain's and the lake's reflections, and a wall seen through at three places (differences were the idle animation and the grass's sway only). Full Node suite: **6,743 tests; 6,733 passed, 10 skipped, zero failed** (127.9 s).

Still open, measured:

- **The weak tier is GPU-bound on North Haven:** 12.1 ms median over an 81-point grid of the map on the Radeon iGPU, about 14 ms in the village, with nothing wasted found: ground 1.4 ms, the party's four models 2.5 ms (one is 149,000 triangles), pieces 3.5 ms. A frame past 16.7 ms is shown for two refreshes; `Reactor3D.adaptiveResolution` is the existing answer and is off by the owner's choice.
- **Refresh rates that 60 does not divide:** the game runs 60 updates a second, and the 3D world is drawn on update frames. At 180 Hz that is every third refresh; at 144 Hz and 100 Hz the updates fall on uneven refreshes (2, 2, 3 at 144), which reads as judder however fast the frame is. Not addressed.
- **The reflection capture** draws a cube face every frame on the full tier: 1.2 ms of main thread on North Haven (about 220 draws).
- **Garbage left:** most is three.js's own render lists and matrix math; `LightVolume.dynamicRegion` recomputes some geometry's bounding box on each walk of the scene (45 KB a frame), and a visible lake's bounds are measured afresh each frame.
- **Arriving on North Haven** (measured before these changes, not again after): the first second holds one frame of 0.5 to 0.85 s (the build) and about a dozen of 50 to 300 ms.

Method: `editor/tests/perf/headless-display.sh` starts a headless display on the real GPUs (the integrated GPU by default, the NVIDIA card with the offload variables it names), and `nw-frame-breakdown.cjs` took `--map=<id>,<x>,<y>`, `--walk-size` and `--throttle`. A whole-frame GPU timer query on the RTX measures the main thread's submission, not GPU work (0.7 ms with the capture off, 12 ms with it on, the same scene): read per-pass sums and the CPU profile there.

## Editor map loading (2026-10-07)

Runtime **20261007.2**: the editor prepares rock geometry using the existing runtime workers while tileset, parallax and material images load together. It waits for every rock chunk before constructing the scene; individual rock/terrain edits still use the same signatures and meshing program. The two most recently visited maps retain CPU arrays within a 64 MiB budget (16 MiB on low-memory hosts), cleared when the project changes. Deleted chunks are removed; concurrent rebuilds share matching jobs and discard obsolete results.

North Haven on a disposable Demo copy (NW.js, RTX 5070, Node suite run separately):

| Map build | Before | After |
| --- | --- | --- |
| First visit | 3.15–3.28 s | 1.99–2.93 s |
| Return after another map | 2.41–2.61 s | 0.39–0.49 s |
| Piece geometry on the main thread | about 2.2 s | about 0.12–0.16 s |

These are map-build timings, not a guarantee of click-to-visible latency. Image uploads and first-time shader compilation add work. The GUI harness lost its WebGL context with both the original rebuild and the optimization, on shared and separate contexts; it therefore did not establish a successful visual or 2D/3D toggle smoke. A subsequent session sandbox change denied the harness's local TCP listener (`EPERM`), preventing further GUI investigation. The North Haven cache holds 44,431,068 bytes in this fixture, with 171 rock meshes prepared before scene construction.

Six functional regression tests cover exact worker/synchronous arrays (positions, UVs, normals and colours), reuse, rock/ground invalidation, deleted rocks, overlapping preparation and undo, worker failure/fallback, map eviction, memory limits and project isolation. Full Node suite: **6,712 tests; 6,702 passed, 10 skipped, zero failed** (131.4 s). Evidence: `/tmp/rr-northhaven-load.cjs`, `/tmp/rr-northhaven-control-results.json`, `/tmp/rr-northhaven-opengl-results.json`, `/tmp/rr-northhaven-final-results.json`, `/tmp/rr-northhaven-full-suite.log`.

## Quality levels (2026-10-09, runtime 20261009.2)

The owner's rule: a game runs well on any hardware, looks good on the weakest and better on the best. Level 0 is the picture as it has always been drawn, and a machine that holds its frame rate never leaves it. `Reactor3D.Quality` (in `runtime/reactor_3d.js`) steps a machine that does not hold it down a level at a time, along what its frames wait for, and never along the other:

| Kind | Level 1 | Level 2 | Level 3 |
| --- | --- | --- | --- |
| GPU (the graphics card) | world drawn at 0.83 of the project's `renderScale` | 0.67 of it, models a level coarser (`pixelError` x2) | shadows off, `pixelError` x3 |
| CPU (the main thread) | no depth-first draw, foliage at 0.65 of its distances and 0.7 of its clumps | foliage at 0.45 and 0.5, shadows off | |
| Either, its levels spent and still a quarter short | the world drawn on every other update: 30 pictures a second under 60 updates | | |

- **What is measured:** the world frames a second of play delivers, against the screen's own refresh (read from the game's quickest frames, so a 50 Hz panel showing 50 is not short). A two-second window short by 12% twice running, or by 40% once, takes a step. The main thread is the cause when its work fills 60% of the frame or 75% of a refresh's budget, the graphics card otherwise. Loading, a window out of focus and the two seconds after a step are not judged.
- **Back up:** only as another map opens, after ten calm seconds, one step; a step that does not hold is not tried again that session.
- **Kept:** the levels a machine settles at are saved with the player's options (`ConfigManager.graphicsAuto`) and start its next session.
- **The player's say:** Options, Graphics: Auto (the default), High, Medium, Low (`ConfigManager.graphicsQuality`; High is level 0, Medium is GPU 1 and CPU 1, Low is GPU 3 and CPU 2). The row appears once the machine has drawn a 3D map. A project whose options plugin builds its own list adds the entry there: the Demo's is in the Visual category. `Window_Options.GRAPHICS_TEXT` holds the words.
- **Switches:** `Reactor3D.Quality.enabled = false` draws level 0 always; `Reactor3D.Quality.reset()` returns the automatic levels to the top.

Measured on the Radeon iGPU (weak tier), North Haven, runtime 20261009.2:

| Case | Without | With |
| --- | --- | --- |
| Main thread slowed four times, the 60-tile walk | 29 to 38 world frames a second, uneven | CPU 1 in 4 s (45 to 52), CPU 2 in 10 s, then a steady 30 at the full picture size |
| The world drawn at full 1080p (a GPU pushed past its budget) | 45 to 50 a second | GPU 1 and GPU 2 within 16 s, then a steady 60 |
| Normal walk, and the RTX 5070 | 60 | 60, level 0 throughout |

What each setting buys there, standing in the square (GPU ms per frame; main thread ms with it slowed four times): the defaults 14.0 and 16.2; scale 0.6, 11.6; scale 0.5, 9.6; shadows off, 13.0; no depth-first draw, 14.9 and 14.1; thinner foliage, 13.8 and 14.9; the light at an eighth, 14.0 (nothing). High, Medium and Low were looked at side by side on the weak tier: Medium is a little softer, Low softer and without shadows, both clean.

Not covered: a Classic battle's room is not measured (it keeps the levels the map left), and a 2D map has nothing to step.

### Game speed below 60 frames a second

`SceneManager.determineRepeatNumber` rounded the smoothed frame interval to a whole number of updates, which is one update a frame all the way from 60 down to 40 frames a second: a machine at 45 ran the game at three quarters of its speed. It now adds the time up and makes the updates as they come due (up to four a frame), with one a frame kept for a screen within 3% of 60 Hz. `SceneManager.trueSpeed = false` rounds as before.

| Frames a second | 180 to 62 | 60 | 55 | 50 | 45 | 40 | 30 | 24 | 20 | 15 | 10 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Updates a second, before | 60 (62 at 62) | 60 | 55 | 50 | 45 | 72 | 60 | 48 | 40 | 30 | 20 |
| Updates a second, now | 60 | 60 | 60 | 60 | 60 | 60 | 60 | 60 | 60 | 60 | 40 |

Live on the weak tier, the party walking North Haven (tiles a second; 3.73 on an unslowed machine): main thread slowed four times 3.11 before and 3.67 now; slowed six times 2.49 and 3.67. A 60 Hz screen with its frames 6% off never gets a frame with no update or two. A 50 Hz screen now plays at full speed (six updates in five frames) where it played at five sixths.

## Quality settings

The levels above move a few of these; all remain engine defaults a script call or plugin can change at any time. Figures: Intel UHD 630, 1080p, the Demo's start map, frozen GPU frame unless noted (runtime 20260930.9).

| Setting | Default | What it trades | Measured |
| --- | --- | --- | --- |
| `Reactor3D.renderScale` | 0.75 | The 3D is drawn at this fraction of the screen each way and enlarged. The saving is the pixels not drawn (0.75 draws 56% of them); fine texture softens a little. 1 = native. | native 11.2 ms, 0.75 9.3 ms; walking about 100 → 117 fps |
| `Reactor3D.SharpUpscale.mode` | `"cas"` | How the smaller picture is enlarged: `"crisp"` keeps each pixel flat with a hard, slightly stepped edge; `"cas"` filters and sharpens within each pixel's neighbours (softer, no steps). `enabled = false` lets PIXI enlarge it pixel for pixel (blocky). | crisp 9.3, cas 9.4, PIXI nearest 8.3 ms |
| `Reactor3D.SharpUpscale.sharpness` | 0.5 | 0–1. Crisp: how hard the edge blend is (1: half a screen pixel). CAS: how strongly it sharpens. | no cost difference |
| `Reactor3D.HalfLight.SCALE` | 0.25 | The size the lighting and shadows are worked out at, each way, before being filtered up. Surfaces keep their full detail; only the light is coarser. 0.125 and below put light rims on models against much brighter or darker ground. `enabled = false` lights every pixel (the old way). | full 20.3, 1/4 10.6, 1/8 9.9, 1/16 9.8 ms (three places, before `renderScale`) |
| `Reactor3D.HalfLight.matchSurfaces` | true | The small light is filtered up from the samples on each pixel's own surface, and a pixel with none (a rim, a thin part) is lit at full size. `false` filters plainly: a blocky rim of the ground's light on models. `PLAIN_SPREAD` (0.02) lets pixels whose four samples agree skip the depth read; `exactEdges = false` drops the full-size fallback. | harness iGPU, 0.75 of 1080p: combine 0.48 → 1.1 ms; pixels 24+ levels off full-size light 9,139 → 538 |
| `Reactor3D.HalfHaze.SCALE` | 0.25 | The size the lights' haze (cones, balls) is drawn at. `enabled = false` draws it full size. | 3.8 → about 0.8 ms for eleven cones |
| `Reactor3D.GeometryDetail.pixelError` | 1 | How far, in screen pixels, a simplified model may stray from the full one before the finer level is drawn. | 0.35 → 1: 0.85 ms, single texels moved |
| `Reactor3D.SHADOWS`, `Reactor3D.SHADOW_QUALITY` | `"auto"`, weak/full tiers | Shadow rows, their size and filtering. The tier is picked from the GPU. | rows about 1.3 ms walking |
| `Reactor3D.LightVolume.dynamicEnabled` | true | Moving lights baked once a frame instead of per pixel. Evens out on average, saves up to 3.5 ms where many swing across the view. | |
| `Reactor3D.FOLIAGE_LOD` | full: near 22, far 64, scale 1; weak: near 12, far 38, scale 0.5 | Grass, flowers, ferns and reeds: tiles from the eye where the field starts to thin and where it is gone, and the share drawn at all. Chunks past `far` are not drawn; the blades are drawn before the ground (whatever they hide is never shaded) and stay out of reflections. | harness iGPU (weak tier), North Haven with about 100,000 clumps painted, 3D update with `gl.finish`: +0.2 to +1 ms across meadow, cliff, wide and high views (runtime 20261002.6 + foliage) |
| `Reactor3D.adaptiveResolution` | false | Let the scale fall when frames run long and climb back when calm. Off: a scale that moves reads as the picture changing under the player. | |

A menu would most naturally offer presets over these (for example Low: renderScale 0.6, lighting 1/8; Medium: 0.75, 1/4; High: 1, 1/4; Ultra: 1 with `HalfLight` and `HalfHaze` off and pixelError 0.35), saved per player with the other options.

## Editor memory

Editor previews hold only what they show. A model loaded to draw a thumbnail is released as soon as the picture exists, and the thumbnail renderer is dropped with its WebGL context four seconds after its last use. The 3D Models page keeps the model on screen and the one before it; closing the page releases every model and both renderers. The 3D map view frees its models' graphics-card copies before its renderer is disposed, because a renderer's own dispose leaves them behind on the context it shares with the 2D view. On North Haven (video memory / ArrayBuffers, MB): closing the Database after eight previews ended at 804, 978, 975 / 323, 351, 351 over three rounds before and 502, 475, 477 / 207, 219, 219 after; three 2D/3D toggles went 1103, 1179, 1256 before and 471, 484, 482 after. Switching maps releases the models the new map does not use (`MapEditor3D.SWEEP_MODELS_ON_MAP_CHANGE`, on since the shadow lists forget old scenes, runtime 20261014.4). Still open: the builder's 50-step undo can hold about 97 MB on North Haven. Measure with `scratchpad/memory/ed-mem.cjs <out> 5 --loops`: three rounds of each open-and-close loop should end where the first ended.

## Battle start on the map (runtime 20261003.29, weak tier, 1080p, one window)

What a battle can play is readied with the map: each unit's and party member's sequences, pictures, effects and projectile models (one action a frame, once a session), a collision footprint for every size a model stands at, every model's bounds, and the Tactical HUD (hidden until the battle takes it, made again a second after a battle ends). Units that join a running battle are built inside 4 ms a frame (`Reactor3D.ModelJoins.BUDGET`), and carried weapons are taken up one unit a frame.

First five seconds, frames over 33 / 50 / 66 ms and the worst frame; "4x" is with the CPU throttled four times (`Emulation.setCPUThrottlingRate`), the nearer picture of a low-end PC:

| Battle | Before | After | 4x before | 4x after |
| --- | --- | --- | --- | --- |
| Tactical raid, 11 units | 50/5/1, 68 ms | 60/10/0, 65 | 98/24/13, 300 | 69 to 100/11 to 14/7 to 8, 141 to 165 |
| Raid, second start | 53/9/0, 57 | 49/3/0, 55 | 89/7/3, 104 | 31 to 89/5 to 6/2, 96 to 102 |
| Action skirmish | 17/2/0, 66 | 19/0/0, 49 | 33 to 79/8 to 12/7 to 8, 232 | 83 to 101/10 to 11/6, 212 to 218 |
| First Person | 29/4/0, 65 | 15/0/0, 44 | 50/9/6, 274 | 58 to 81/10/6, 151 |
| Army drill, 43 units | 46/11/2, 92 | 22/2/0, 60 | 72/56/35, 264 | 78/63/33, 161 |
| 2D Deck Drill | 1/0/0, 37 | 1/0/0, 46 | 12/8/7, 123 | 14/7/6, 205 |

Unthrottled, no CPU hitch is left at a raid's start: the remaining long frames are GPU wait (the tactical view is GPU-bound at about 22 ms a frame here). Throttled, the worst frames are the fight's first frame (turn order, `Game_Fight.start`, unit model builds), one grip solve a frame (30 to 40 ms each), the HUD's first uploads and portrait painting. New shader programs still compile at a battle's start (7 for the raid, 5 for Action, 33 for the army after its Transfer Player rebuilds the scene). Measure with `scratchpad/perf/battle-perf.cjs <out> begin` (`MENU=0..4`, `THROTTLE=4`, `SECOND=1`, `PROF=start`, `NOCHECK=1` for a shipped game's shader checks).

## Memory (runtime 20261003.27 to .30, weak tier, 1080p)

Since .30 a model stays loaded while the map being played, a battle on it, its encounters or its events name it. When another map opens, unclaimed models are released; the newest stay while they fit 96 MB (32 MB on low-memory machines). `Reactor3D.ModelUse.enabled = false` keeps every model for the session. A model's embedded pictures are decoded once (the GLB worker decoded and dropped them, and the main thread decoded them again). North Haven straight from the title now takes about 1.4 GB of process memory (1.3 GB on a low-memory machine; 1.9 GB before today) plus 0.6 to 0.8 GB of video memory, and plays with a battle inside a 1.6 GB limit on the low tier; at 1.5 GB it loads and walks and is killed when a battle starts. Arriving through the Reactor Room still needs 2 GB: that room's pictures are each held as a decoded image, a canvas and a texture, and one 2400x2400 wall picture is uploaded three times.

Since .31 a picture used by several surfaces (walls, floor, a poster) is uploaded once per sampling (`Reactor3D.ScenePictures`), with no canvas copy; large pictures cost width x height x 4 bytes of video memory (a 4000x2250 poster: 34 MB), and machines reporting 4 GB or less keep them at 2048 on the longest side (`Reactor3D.ScenePictures.LOW_MEMORY_SIZE`). A hidden tile layer builds no 2D atlas. The Reactor Room went from 1,853 to about 1,440 MB of process memory. The Demo walk (title, Static Room, Reactor Room, North Haven, a battle) passes inside 2 GB with no reclaim; inside 1.5 GB it is killed loading North Haven after the Reactor Room. The editor on North Haven in the 3D view takes about 1.75 GB plus 0.7 GB of video memory; its model thumbnails and previews are not yet released (video memory 838 to 1,017 MB over two rounds of previews).

The figures below are from .27.

A 2D game takes about 0.5 GB and runs inside a 1 GB limit. A large 3D map takes 1.6 to 1.8 GB of process memory plus about 0.8 GB of video memory, which is system RAM on integrated graphics. Each 2048 model texture costs 21 MB of video memory; 1024 costs 5 MB. Machines reporting 4 GB or less load model textures at 1024 (`Reactor3D.memoryTier`: `"auto"`, `"low"`, `"normal"`; `Reactor3D.lowMemoryTextureSize`). Music is decoded whole: about 22 MB per minute.

| Stage (all processes, PSS) | MB | Video memory |
| --- | --- | --- |
| Title | 730 | 236 |
| Small 2D map | 1,266 | 436 |
| North Haven, straight from the title | 1,944 before, 1,625 to 1,805 after the cuts | 760 to 811 (619 on the low tier) |
| North Haven, arriving through two other 3D maps | 2,562 | 783 |

Cuts in this revision: a decoded bitmap is closed once its texture is on the GPU (145 to 209 MB; `Reactor3D.ShaderWarmup.releaseImages`), workers end after 8 s idle (`Reactor3D.IdleWorkers.REST_MS`), the 2D tile atlas is made by the first tile drawn (48 MB each side). Inside a hard limit with no swap: North Haven plays in 2 GB (peak 1,958 during the load) and is killed during the load at 1.5 GB; an imported 2003 game peaks at 371 to 497 MB. Largest thing left: `Reactor3D._glbCache` keeps every model and its textures for the session, so each 3D map visited adds to the next (about 620 MB at North Haven after two others). Measure with `scratchpad/memory/mem.cjs` and `limited.sh`.

## World and models on weak graphics (runtime 20261003.26, Ryzen integrated Radeon, 1080p, frozen frames, one window)

| Change | Measured | Picture |
| --- | --- | --- |
| `Reactor3D.DepthFirst` (pieces, floor; the sky tests depth) | isometric 20.69 to 18.42 ms, third person 12.82 to 11.39, first person at the map edge 23.23 to 19.70 | identical (0 channels differ, including the indoor cutaway) |
| `GeometryDetail` shared per model, index lists kept | 43.8 to 22 ms for 40 standing units while levels arrive | same levels |
| A skinned body's distance taken from its joints | 691k to 599k triangles, 22.75 to 21.98 ms | mean 0.18 of a level |
| Model sprites on flat maps take detail levels | Deck Drill 13.46 to 6.0 ms GPU | within `pixelError` |
| Ground edge noise only where paint is part-way | 8 types 2.14 to 1.72 ms (3 types 0.9 ms) | identical |
| Battle models and weapons readied at map load; a weapon measured once per model | tactical start: frames over 50 ms 12 to 8, over 33 ms 59 to 28 | none |

Surroundings cost 0.0 to 0.05 ms out of view; a map-wide glowing foliage layer costs what a plain one does. A profile of the party walking North Haven with weapons shows none of the roof, climbing or held-weapon helpers above 0.1% of the frame. North Haven holds 726 geometries and 67 textures after each of three round trips (no leak): model textures 133 MB, piece buffers 66 MB, piece textures 28 MB, model buffers 23 MB. Still over budget: isometric on North Haven at 18.4 ms GPU (the tank's 20 double-sided meshes are about 3.3 ms of it); battle start still has frames over 50 ms (an effect model loaded by the sequence warm-up, a GPU wait of 16 to 28 ms, the first grip solves).

## Battles on the map (runtime 20261003.24, Ryzen integrated Radeon, 1080p, one window)

| Scene | Frame | CPU | Battle code |
|---|---|---|---|
| Exploring, before any battle | 16.7 ms (capped) | 4.0 | 0 |
| Tactical, 14 units, at rest | 23.8 ms | 7.0 | 0.11 ms |
| Tactical, enemy phase | 28.3 | 8.2 | 0.24, worst 8.1 |
| Action, third person, 8 enemies | 22.4 | 8.2 | 0.64 |
| First Person, 8 enemies | 26.5 | 9.1 | 0.71 |
| Army of 61, at rest / enemy phase | 34.0 / 48.0 | 13.1 / 18.3 | 0.25 / 1.64, worst 20 |
| 2D battle, 11 units | 16.7 (capped) | 4.2 | 0.11 |

The battle's own code is a small share; the frame is the world and the models. A unit's AI thinks within `ReactorFight.AI_BUDGET_MS` (4) a frame, shared by every unit deciding in that frame (three times that above 20 units); its floods and its weighing yield to the clock. Model portraits are fetched from the graphics card without waiting and kept for the session. Battle start still has about ten frames over 50 ms (the worst 90 to 105 ms at raid size, 340 ms for an army): the first carry of each weapon model, a model's first load, new texture uploads and shader compiles. The 2D battle row is with flat-map models sharing their detail levels (20.6 ms before). Measure with `scratchpad/harness-slot.sh -x node scratchpad/perf/battle-perf.cjs <out> tactical|army|action3|action1|drill` (`NODRAIN=1` for frame times, `PROFILE=1`, `ALLOC=1`, `LEAKS=10`).

## Edges and beams — runtime 20260930.12

Harness iGPU (Ryzen 9 9950X3D's Radeon, radeonsi on X11, weak tier since this runtime), 1920×1080, the start map near the Psychronic mascot (37,11) and the start area (24,47). Looks were judged with game updates stopped and the clock running, each variant drawn for a second first; the frozen mode's stopped clock can hold programs a variant never compiled and drew a wrong reference.

| Change | Cost | What it fixed |
| --- | --- | --- |
| The small light's passes stand at the camera (`cameraPosition`) | none | the volume read from the far side of faces: dark floors, bright model faces, in quarter-size blocks |
| Shadows switching on refresh the originals, not the twins | none | start-map floor compiled without the shadow lookup (full-size path only) |
| Light filtered up by surface, full-size at rims | about +0.6 ms | blocky rims of the ground's light on models (24+ level errors 9,139 → 538) |
| Haze filtered up by surface | +0.16 ms | haze bleeding across silhouettes |
| Beams in the pass at full size | negligible | a laser drawn as a row of soft blocks |
| Ryzen APUs on Linux weak tier | −15 ms here | full-tier reflection capture (6.2 ms) and full-detail meshes on a 2-CU iGPU |

Weak tier, start map, GPU per frame: 7.95 ms at the defaults, 9.28 at `renderScale = 1`, 7.58 with `SharpUpscale.mode = "crisp"`.

## Intel UHD 630 pass — runtimes 20260930.2–.6

Laptop: i5-10500H with its integrated Intel UHD 630 forced on (the RTX 3060 idle), 1920×1080, ANGLE/D3D11, weak tier. Tool: `editor/tests/perf/nw-frame-breakdown.cjs` on a disposable Demo copy: `--mode=passes` (GPU per three.js pass and PIXI composite), `--mode=draws` (GPU per draw call, for ranking only), `--mode=spikes` (every long frame with the CPU samples and the GL traffic inside it), `--mode=frozen` (clocks, tickers and videos stopped; the same frame drawn under a timer per variant; pixels compared with the baseline's own noise; variants from a `--setup` script's `window.__rrVariants`). The harness waits for the geometry worker before measuring: until it has simplified the dense models the full geometry is drawn.

Findings that shaped the pass:

- The frame is GPU-bound: the main thread idled for most of every long frame while the GPU ran 40–90 ms. Spikes were GPU back-pressure, not script, GC or shader compiles.
- On a frozen start-map frame the light loop was about 12 ms of 30, but not for its arithmetic: the inlined double shadow lookup slowed every lit pixel (removing its code, with no pixel change, saved 8 ms). Merged, the frame went 29.8 to 23.9 ms. A loop indexed identically across pixels and a depth pre-pass measured no gain; drawing the room's walls as opaque made it slower (they are rejected behind props only as late, transparent draws).
- Of 23 lights on the start map only 6 are unchanged from frame to frame (seven sweeping searchlights, flicker), so caching the summed light across frames does not pay there.
- Remaining weight on that frame: lighting about 11 ms, vertex and fixed work about 11 ms (three 488k-triangle props, 149k-triangle characters), PIXI composite 2 ms.

Walking route (20 s, same start, collision off), before → after this pass (before the merged shadow lookup): median frame 48.7 → 34.7 ms, p95 124.8 → 69 ms, worst 368 → 264 ms, long frames 46 → 30. The changes are listed in the 0.98.9 editor changelog, Performance.

Runtime 20260930.6, the second round (measured with frozen frames drawn back to back, which an integrated GPU needs: timed with gaps between draws it dropped its clock, and the same frame read 12.9 to 20.4 ms):

- Frozen, three places along the walk: 24.8 ms before the round, 11.0 ms after. Walking, 20 s: about 95 to 100 fps (it began the day near 40), the median frame on the 144 Hz display's 7 ms refresh.
- Largest steps: the light at a quarter size from the pass's depth (`HalfLight`; in the view with the most lights 23.1 → 12.5 ms); the haze at a quarter size (`HalfHaze`, 3.8 → about 0.8 ms); an opaque game canvas (the browser's blend of an alpha canvas pushed most frames past the refresh: 91 → 101 fps); distance levels at a pixel of error (0.85 ms); the moving lights' bake on a one-tile grid.
- Where the remaining frame goes (live, per pass): the unlit surfaces about 5 ms (757k triangles, 83 draws; the three dense props alone 1.2 ms of vertex work), PIXI's composite 1.3 ms, the combine 1 ms, the shadow rows 1.3 ms, surfaces lit as before (49 reflective meshes, 328k triangles) 1.1 ms, the light pass 0.8 ms. At a quarter of the resolution the frame still costs about 5 ms: 144 fps at 1080p on this GPU needs the fixed costs cut as well as the pixels.
- Fixed on the way: the light volume's bakes were refused by the driver whenever PIXI had drawn since three (a shadow sampler met PIXI's texture), so some earlier volume measurements included lights that were not being drawn; the figures above are after the fix.

Later the same day (runtimes 20260930.3–.5), the light volume and loading:

- Baked light volume: still, flickering and pulsing lights read from half-tile 3D textures (15 of 23 on the start map); moving lights without their own shadow row are gathered once a frame into a view atlas. Frozen: 8.3 ms saved by the baked lights; walking, 20 s: 699/703 → 755/778 frames, GPU median about 23 ms, p95 41 → 33 ms. The frame is still GPU-bound at about 40 FPS on this GPU; the per-pixel cost left is the texture shading every pixel pays (about 6 ms at 1080p), the party's sharp shadows, and vertex work on dense models.
- Loading: shader compiles on the driver's threads with meshes shown when ready, pictures decoded in a worker and uploaded under a budget. Fresh profile, New Game, 15 s: 298 → 453 frames, worst frame 2.4 → 0.62 s. Left: Effekseer's WebAssembly start (0.3–0.6 s once) and single large texture uploads (about 70 ms each).


### Character Body settings audit — 2026-10-20

Preview revision 30 groups creature types and part controls in Body, using the existing preview scheduler. The 3,782-case control audit runs serially in fresh 32-case Node processes with a 1,024 MiB heap. Native checks close each browser after at most four recipes; the main 189-case catalog capture and correction/detail/UI/gear sets retain source hashes. All substantial commands ran through `codex-check`, one at a time. No runtime revision or owner session restart was needed. Evidence: `scratchpad/body-settings-audit/` and the coverage limits in [CHARACTER-QUALITY.md](CHARACTER-QUALITY.md). These software-GPU checks do not establish hardware frame rates.

### Interior prop budgets — 2026-10-22

The sixteen FurnitureProp forms stay below 12,000 triangles per generated object in all three tested styles. Defaults range from 452 triangles (table) to 9,314 (sofa). Surface maps are cached per builder: 128 px fabric/normal, 256 px wood, and a 512×288 screen. Settings reuse these maps unless their inputs change. Native checks close the browser after four models. These are bounded geometry/resource checks, not hardware frame-rate measurements.
