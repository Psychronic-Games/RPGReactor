# Claude quality continuation tracker

Audited 2026-10-18 against the current shared working tree. This reconciles all eleven paused agents, the completed lighting and Prop Builder agents, Slimefolk, and the miscellaneous items in `scratchpad/quality-pass-resume.md`. A historical agent report is evidence of what was requested or observed, not proof that the present result passes visually.

Sources: the resume note; thirteen extracted natural-text transcripts at `/tmp/rr-claude-audit/<agent-id>.txt`; original JSONL under `/home/doug/.claude/projects/-mnt-sda1-Dropbox-Family-Room-SharedProduction-RPG-Reactor/4a85b200-b1b3-43cf-ad47-2976dc925de2/subagents/`; current source and tests; [CHARACTER-QUALITY.md](CHARACTER-QUALITY.md), [HANDOFF.md](HANDOFF.md), and the current changelog. Historical screenshots are under the matching Claude session's `scratchpad/` directory in `/tmp/claude-1000/`; current evidence is listed below. Temporary files can disappear; durable test and source references remain.

**Status:** **Fixed** means implemented with the stated verification; **Partial** retains a measured defect; **Verify** means a specific visual or platform gate has no current clearance; **Open** means implementation remains. Work assigned during this audit stays Open until its owner reports validation. Numeric mesh checks do not establish realism, coverage, or absence of self-intersection.

## 1. Poses — `ac68528038191ffbb`

| Original issue | Present state and evidence |
| --- | --- |
| Sitting right hand spins; fighting fingers penetrate palm; walking wrists cock outward | **Fixed.** Shared motion library contains joint/hand limits. `character-3d-poses.test.cjs` explicitly checks sitting spin, every finger range, palm clearance, and walking wrists. |
| Inward heels; backflip ankle reversal; knee/ankle limits | **Fixed for tested rigs.** Runtime `reactor_3d_motions.js`; toe-free rigs preserve limits. Final gait changes checked on fresh human/Grey exports in the actual game; tests include visible heel-to-ball orientation through the stride. Other imported foot shapes still warrant observation. |
| Pistol/rifle aim, sword, guard, flips, prone/crouch/kneel aim, hit/death/jump/cast/throw/dodge/climb/swim | **Fixed inventory.** Shared `POSES`/`GAME_CLIPS` exports and clip tests; saved rig/slot mapping verified. Requested action identity should still be judged on each imported rig. |
| One mocap library for builder/game, lazy load/retarget/cache; model and Motion-editor clips win | **Fixed.** `CharacterPoses.js` shim and `runtime/reactor_3d_motions.{js,bin}`; runtime retarget tests and actual game playback recorded in HANDOFF. |
| Save automatically rigs and maps clips to game slots | **Fixed.** `savedModel` and Builder save write rig sidecar/binary and animation assignments; explicit save/slot test and real exports. |
| Friendly wave and review other gestures | **Verify aesthetic gate.** Wave and other gestures exist; limb safety tests are not proof of the requested relaxed wave, lean/head tilt, or natural pointing/crossed-arms/cheer on average and extreme bodies. No complete current gesture contact-sheet report located. |
| Grey dragging/full rebuild choppy | **Partial.** Shape and catalog workers remove substantial UI work; actual isolated NW measurements in HANDOFF and `scratchpad/preview-perf/worker-post-fixed/`. Repeated choice changes now reuse one warmed preview worker instead of churning native worker allocations: the actual 59-model sequence completes with thumbnails, zero errors and sampled RSS peak2,112MiB/end1,554MiB after two earlier crashes near4GB. Initial selected-model/WebGL startup remains a separate stall. |
| Thrust/bow names for sprite export | **Fixed.** Dedicated `swordThrust` and `bow` one-shot arm IK motions share the guarded stance; they differ from slash/throw and export as Thrust/Bow with action slots. Real wrist displacement and full joint-limit regressions pass; actual marked-sword Thrust preview inspected. |

## 2. Clothing — `a7ce6539a16f0e0f2`

| Original issue | Present state and evidence |
| --- | --- |
| Missing body chunks under garments; Captain reference | **Partial.** Outward-ray hiding guard restores uncovered skin; topology/backing repairs close sampled large holes. 1,752 equipment cases, 38,656 probes and 260 posed cases documented in CHARACTER-QUALITY. Captain outer-shell folds remain; hiding skin alone is not an acceptable repair. |
| Potato shoes, ankles cut out, trouser layering, ragged rims/coat fronts, sash fragments, collars/pauldrons | **Fixed for catalog checks; extreme appearance remains bounded.** Source geometry improvements in Outfit/Wardrobe/Atlas, footwear/coverage regressions and real NW sample checks. All catalog entries were built; a few isolated motion/boundary risks remain. |
| Full helmet hides skin but leaves mouth interior | **Fixed.** `CharacterExpressions.mouthParts` follows hidden face; explicit full-face helmet regression and actual armor check. |
| Power armor needs closed round helmet, visor recess, layered plates and details | **Fixed implementation.** `CharacterPowerArmor.js`/`powerhelm`, body/armor tests and actual NW checks. This is procedural armor, not exact copies of the imported gauntlets. |
| Owner follow-up: Knight/Dark knight look inflated and clothing-like | **Reworked and inspected.** Formed cuirass, smaller shoulder lames, independent thigh/shin shells, pointed knee shields, hand plates and low sabatons replace inflated cuts; Paladin/Gladiator share the pieces. Seven armor regressions, final1,314 equipment cases/28,416 hiding probes, actual normal/posed/extreme NW captures and eight browser-worker variants pass. Large bust/heavy fits still project prominently; see CHARACTER-QUALITY. Preview revision13. |
| Straight Tie NaNs, proper knot and straight/bow/cravat choices; duplicated legacy tie IDs | **Fixed.** Tie finite/fit regressions and full accessory matrix. Saved-compatible legacy alias remains intentionally; catalog labels are deduplicated. |
| Floral/paisley/plaid and project-picture logo prints, translations | **Fixed.** Atlas motif painters and `emblemPicture` project reference; Builder picker/decoded per-project cache; actual emblem preview/import/lifecycle QA and 17-locale labels. |
| Long hair through jackets; owner's floating root/tip behind female armor | **Reproduced case repaired; dense combinations remain bounded.** Hair now queries actual garment faces and spreads clearance along connected locks, pinning the scalp. The root/tip-only ponytail behind Jolt/Max backpacks is continuous in final NW captures; a broad-backplate regression checks2,379 middle vertices. Fifteen hair checks pass. Sharp bends and small armor-edge overlaps remain; the owner's exact unidentified outfit is not confirmed. See CHARACTER-QUALITY. |
| Fur escaping boot/cuff edges | **Fixed hook.** Both Model `hairStrands` calls use `outfit.noHair || outfit.hidden`; clothing noHair dilation is active. |
| Hats cannot measure real hair | **Fixed.** Actual hair passed to Props and fitted at hat line; current thumbnail camera sweep covers tall/wide hats. |
| Trooper hides whole body | **Fixed regression.** Dark undersuit/armor visibility is tested; coverage guard and current catalog suite pass. Old failure is not an outstanding module-load issue. |
| Summer dress seeds 2/8 balloons sideways in Idle | **Checked current reproduction.** Actual NW front/side/back of both exact random recipes in Idle shows close, even skirts after the posture-specific contact fix. `scratchpad/quality-pass2/gui-17..22` captures and `gui-report.json` retain the cases. Other combined extremes remain bounded by the clothing matrix. |

## 3. Star Shift transfer/importer — `a7cd67b461f425821`

| Original issue | Present state and evidence |
| --- | --- |
| Owner follow-up: Jolt Eagle, Max Triton and Vay Drokan feet escape boots | **Reproduced case repaired and imports generalized.** Sole pitch is preserved while heel/toe heading aligns; foot/toe vertices are excluded from loose cloth. All three packs regenerated. Source-sole,108 posed triangle-depth views and fresh import/encode/decode/wear regressions pass with72 actual NW close-ups. Re-import previously prepared custom outfits and re-save old GLBs. See CHARACTER-QUALITY. |
| Nondeterministic transfer and simplification; slivers/thin edges | **Fixed regression.** Transfer test checks byte-identical rebuild and budgets; `CharacterSimplify.js` protects boundaries. Original paused test failures were cleared. |
| Captain calf/hem/sleeve holes and missing panels | **Partial.** Source topology repair plus exact-weight fabric backing closes sampled skin gaps, including heavy Walking rear-hip hole. Actual NW front/back/moving screenshots in Claude `scratchpad/clothes-agent/shots/` and current transfer artifacts. This does not clear the outer-fabric quality issue below. |
| Contorted fabric; Vay shoulder shards/twisted panels; coherent panel binding/rest lengths/layer order/hanging skirts | **Partial, improved.** Signed radial layer offsets and six fitted lower-panel relaxation passes, tapered below the upper torso, retain rigid Jolt/Max behavior. Small-face guard adds no collapsed faces in the new source/profile comparison. Heavy Captain rear strict crossings85→13, guarded by a permanent regression. Broader tail/chest/arm folds remain. Fresh1,314 static and780 moving equipment cases retain raw coverage diagnostics; see CHARACTER-QUALITY. |
| Original-looking gauntlets and optional helmets | **Partial.** Generic power gauntlets and optional headgear plumbing exist; shipped source outfits still do not supply exact original clawed hands/helmets. Verify source-specific part selection and appearance before claiming original-equivalent equipment. |
| + From model card; thumbnails/search/parts/progress/Keep/Discard; 1366×768 | **Fixed.** Builder importer and worker prepare path; actual editor happy/failure/cancel checks, source thumbnail grid, no text overflow in inspected layout. |
| Delete user outfit, confirmation, directory removal, Undo; protect built-ins | **Fixed.** Actual deletion/Undo and failure lifecycle checks; `character-outfit-importer-lifecycle.test.cjs`. Close, detach, project switch and failed Keep prevent late publication or preview leaks. |
| Recoloring also catches nearby trim; arbitrary hood/high-waist skirt imports | **Verify.** Hue-range recoloring remains source-dependent. Importer tests cover real shipped models and part selection, not every possible source topology/material segmentation. |

## 4. Human body, faces and extreme muscle — `ac0cb93c3ff99bd8d`

| Original issue | Present state and evidence |
| --- | --- |
| Ear/cheek flaps, forehead/cheek blotches, plastic lips, unnatural face defaults, world Heritage choices | **Fixed implementation and prior sampled visuals.** Ear-local target mask, fairing, skin/hair paint and Heritage presets remain; HumanBody/skin/hair/i18n regressions. No claim that every face is aesthetically approved. |
| Extreme muscle folds/spikes, particularly female chest/shoulders | **Fixed bounded deformation; Verify aesthetic breadth.** Natural target-grid muscle weights bounded and extra bulk uses bone-aware shape; root owns current body regression. Final 401-case matrix includes tall/strong and heavy-muscular bodies. This is not an exhaustive independent muscle×weight×sex visual grid. |
| Short/lean combined extremes tear/invert torso/limbs (found during continuation) | **Partial, additional composition fix.** Relative hip/shoulder narrowing and monotone torso/neck compression repair the compact waist/neck collapse. Three meaningful geometry regressions fail on the pre-pass source; fourth checks fixture preservation. Fresh564-case species/head/creature/tail sweep has zero invalid geometry builds. Residual extreme muscle/cup/body surface folds remain visual limits. |
| White-afro hard rim/dark side wedge; grey blotches at back; s3/s11 temple bands | **Partial, visually reproduced.** Actual NW white-afro front/side/back still shows a cap-like mass and hard side/rim. A refined shell/fade trial was rejected and fully removed. Grey bob and long hair with real `mh_jacket_jeans` were inspected at head framing; this does not clear every original seed/temple issue. `scratchpad/quality-pass2/hair-report.json`; original safe source remains. |
| Sideburn edge, curly cards over ears, wizard beard vs long hair, dwarf sideburn gap, random seeds1–24 | **Verify prior visual requests.** Earlier rounds adjusted strands/edges and seed sheets exist; final paused request did not receive a closing report. Current beard finite regression fixes root-only strands, not these aesthetic distinctions. |

## 5. Cloth r2 — `af1d5874abc2ecef5`

| Original issue | Present state and evidence |
| --- | --- |
| `simulateClip` undefined mid-edit | **Fixed.** Named cloth tests pass in resumed full suite; source wrapper restored coherently. |
| Pose-switch main-thread bake | **Fixed.** Dedicated cloth worker, cancellation/cache and async pose swap; worker regressions. Runtime plays baked bones only. |
| Save only Idle; game native motions lack cloth keys | **Fixed for newly saved generated clips.** Save bakes exported motion set; cloth GLB test keys all cloth bones. Older exports require re-save. |
| Sitting robe slides off raised knee | **Fixed reproduced coverage.** Raised-thigh carried-side reference is shared by point and link collisions/final layout, with posture-specific stiffness. Independent fabric rays improve210/360misses→0/360 on Human/Grey, preview/save. Full cloth clip/floor/collider/loop suites and actual NW sitting pass; standing/kneeling behavior is checked separately. |
| Prone/kneel robe under legs; floor sink; cape over robe when bending; walking tail bunching | **Partial, current sampled checks pass.** Full four-body every-clip cloth suite passes after the posture-specific fix, including new actions. Actual NW Grey prone and heavy kneeling robe/cape inspected with zero errors. Existing floor/penetration tolerances remain; arbitrary garments/poses and all overlap boundaries are not certified. |
| Summer dress seeds2/8 balloon; key jitter; lean keys +3.5MB/34clips | **Partial.** Exact seeds2/8 Idle pass actual front/side/back review. Worker cache, bounded velocity, temporal smoothing and key thinning remain; no new all34-clip storage/jitter measurement. This is separate from worker responsiveness. |

## 6. Species r4 — `a92eb923e8bd177d3`

| Original issue | Present state and evidence |
| --- | --- |
| Chest dark band, rear minotaur/rabbit seams, thin neck, oversized source nape/torso; skull bends open | **Fixed tested integration.** `CreatureBody.build({headOnly:true})` keeps a closed skull; Model reuses exact human neck boundary, rounds/tapers continuation inside skull, computes smooth normals; skull rigid Head, neck strip blended. Actual NW closeups and graft tests;401 matrix verifies attachment on all nine heads/profile strata. |
| Sparse rabbit ear fur | **Verify appearance.** Head topology/attachment tests do not establish fur density; low-budget software sheets deliberately reduce strands. |
| Species Head picker, all locales; bird/crow/Birdfolk wiring | **Fixed.** Nine selectable heads and `HEAD_KINDS`; preset/recipe switch and translations. Real editor bird/head checks recorded in HANDOFF; final45-head numerical sweep plus fresh shortlean sheets. |
| Wolf pale muzzle strip; human beak dark eye shadow | **Fixed through graft path.** Hidden human muzzle/beak no longer contributes; source heads carry their own coat. |
| Grey inner lens corners/chin/dome and attractive proportions | **Fixed refinement, sampled visuals.** Current Grey preset/socket fairing/almond surface, actual NW face/back checks and dedicated Grey tests. Parent retained safe dome order; rejected experiments are absent. |

## 7. Expressions/lip sync — `a369f5e4e84310c91`

| Original issue | Present state and evidence |
| --- | --- |
| Expressions/visemes, face-following hair, named sparse GLB morphs | **Fixed.** `CharacterExpressions.js`, expression pack and GLB reader; expression/lip/lid/neutral/sparse-morph tests. Grafted animal mouths are outside humanoid expression coverage. |
| Embarrassed is a red mask | **Fixed sampled rendering.** Soft cheek/nose flush adjusted during continuation; portrait/speech checks. Keep dark/light skin portrait comparison as an ongoing cosmetic gate. |
| Mouth interior under face-covering helmets | **Fixed.** Hidden-mouth regression and actual armor checks; no floating teeth/tongue on tested full helmets. |
| Builder Talk; text/voice-driven game lip sync; final dressed game report | **Fixed checked paths.** Actual dressed game speech reached visemes and reset after text; speech tests and HANDOFF. This does not establish arbitrary external audio phoneme alignment. |

## 8. Merfolk — `a364c79475bbbd720`

| Original issue | Present state and evidence |
| --- | --- |
| Fan/veil outline test and final fins/colors/swim/land report | **Fixed tests and sampled game/editor checks.** All11 Merfolk tests pass; both sexes exported and played in game. Current30-case fin×palette×length matrix verifies actual mesh joins. Sitting/lying/propped were also previously inspected. |
| Pale scale-line waistband | **Fixed paint treatment.** Tail-colored decal/softened transition remains; final software rendering preserves vertex tint. |
| Deep hip folds crash; short-leg tail NaNs; tail minimum ignores body scale (new sweep findings) | **Fixed.** Guaranteed slab interval, interior section reach and scaled tail minimum; current401 matrix and31 Merfolk/Creature tests pass. |

## 9. Containers — `aa599140d82f50689`

| Original issue | Present state and evidence |
| --- | --- |
| Files missing from page | **Fixed.** `editor/index.html` loads ContainerPaint/Mesh/Prop before PropBuilder. |
| Single-sided crate planks; Glow inconsistent edges; overly bright drum interior | **Fixed sampled geometry.** Resumed container source/test corrections; catalog winding tests plus actual container checks in HANDOFF. A full manifold certificate is not implied by winding tests. |
| Randomize scopes | **Fixed.** Explicit shape/colors/details source-preservation regression in `prop-containers.test.cjs`; guide documents scope behavior. |
| Blinking lights/display clips, emissive in game | **Fixed.** Runtime emissive and instance glow; actual game Lights clips verified, clip/display/GLB tests. |

## 10. Chibi/sprite export — `a04377e26acbc42dc`

| Original issue | Present state and evidence |
| --- | --- |
| Chibi recipe test fails mid-edit; temporary export copy must not mutate model | **Fixed.** Final head scaling uses export copy; sprite suite and actual exports passed. |
| Cute/anime face, ~2.7 heads, broader body, stock Actor1 comparison on four characters | **Partial aesthetic gate.** Chibi/pixel styles and softened export face implemented; root inspected exported sheets. Historical report still noted narrow48px bodies/odd hands; retain comparison with stock art rather than claiming exact art equivalence. |
| Dark outfits, dashed outline, sharp pixel mode, skin protected in grade | **Fixed implementation.** Export lighting/grade, alpha edges/palette; sprite-neutral-color tests and actual sheets. |
| [8D], four-direction, side-view, face sheets play correctly | **Fixed tested formats.** Prior real game sheets/battle/message checks and runtime8D support. |
| Dedicated thrust/bow; eight-character sheets; first cloth export slow | **Thrust/bow fixed.** Dedicated motion IDs and useful exported clips/action slots now exist. Eight-character sheets and eliminating first-build/bake cost remain future limitations, not regressions of supported single-character formats. |

## 11. Creatures r6 — `a2278e427faae8202`

| Original issue | Present state and evidence |
| --- | --- |
| Bird heads real builder; fuller crest; raptor eyes forward; crow too dark; rabbit pig snout; cat ears too large; stripe stair-steps | **Verify exact r6 cosmetic gates.** Source has bird/crow heads, crest cards, animal-specific snouts/ears and antialiased coat painting. Some changes predate the pausedr6 brief. Current84-creature/45-head matrix and actual head renders prove functioning geometry, not clearance of each requested silhouette/color adjustment. Retain direct front/profile comparisons. |
| Closed eyes and shared wing roots (new sweep) | **Fixed.** One vertex per eye pole, closed fan topology, shared membrane wrist roots; no zero normals/collapsed eye faces. Explicit topology test and401 matrix. |
| All kinds/every slider/sex, gear and anatomical detail | **Fixed bounded coverage.** All14 selectable kinds×six profiles, all33 slider endpoints; existing detail/gear tests. Full bird/serpent/insect body plans remain unimplemented; bird/crow are head-only choices. |

## Completed agents with inherited issues

### Lighting/shadows — `ae463073e69443612`

| Original issue | Present state and evidence |
| --- | --- |
| Outdoor sun shadows/angles, acne, stacked-party black reflections, rough metals, normal maps, emissive | **Fixed.** Runtime lighting/reflection code, focused regressions and original weak/full map sweeps;19 runtime copies synced at last reported freeze. |
| Weak-tier point/spot lamps add no facing | **Fixed bounded approximation.** Packed sun/point/spot/beam light moments are evaluated at model vertices, interpolated to the normal-mapped facing term; HalfLight remains active. Actual isolated NW probes verify local-light contrast, weak/full model/floor/wall/third-party draws and quarter-light fullscreen compilation. Multiple opposing lights use an averaged direction; this is not full per-light normal shading. |
| Brows/lashes get hair sheen | **Fixed.** Material strand tagging now matches Hair/Beard only; Brows/Lashes keep ordinary lighting. Model-facing regression covers the material rule. Exact brow appearance remains a sampled visual gate. |
| Battle Room video bypasses failed-upload watcher | **Fixed.** Battle Room video textures use the shared upload watcher; confirmed failures hide/pause once and do not recreate. Tests cover zero-sized readiness, repeated GPU failures, working uploads and late-ready disposal. No claim of cross-GPU decode recovery. |
| Weak close-up blocky sun shadows | **Verify / resolution limit.** Current cascade/filter quality is performance-bounded; no current close-up improvement proof. |
| Grass blades, terrain heightfield, shader billboards do not cast; no shadows beyond far cascade | **Open renderer limits.** Original report states them explicitly; not covered by character catalog tests. |
| RTX cross-GPU video decode | **Partial platform workaround.** Runtime stops repeated failed uploads; `--disable-accelerated-video-decode` worked in original probe. This does not prove automatic decoder recovery on the owner's RTX machine. |

### 3D Prop Builder — `a1fe2efabf36e16d3`

| Original issue | Present state and evidence |
| --- | --- |
| Inside-out top hat/vase/microphone, rope/blades/container solids; rear sheets disappear | **Fixed.** Primitive winding/caps/mirrored axes and appropriate thickness/double sides; all catalog/accessories build and saved-GLB winding tests. |
| Collapse blocked on current category; duplicate equipment/catalog labels; empty choker controls | **Fixed.** Fold/search keyboard/session behavior, deduplicated registry, meaningful size/material/options and choker settings; catalog regressions and original actual UI checks. |
| Randomize every kind/scope/Undo;17-locale prop labels | **Fixed.** Fifty-seed catalog checks, scoped container test and translations. |
| Saved weapon parented to Character RightHand via rig markers | **Fixed for pose preview.** Accessories › Preview › Weapon lists marked project Blade/Gun GLBs, fits authored grip into the right palm, and parents to RightHand through poses/rebuilds. Async stale loads/detach dispose their own resources. Two regressions cover multiple body/pose transforms and clearing during load; actual NW sword/pistol Thrust/aim/walk checked. Game equipment remains separate from saved character geometry. |
| Remove old directional vertex shade now game lights facing | **Implemented by root during audit; validation pending.** Fixed directional `PropMesh.shade` removed while preserving material/detail albedo. Root owns the prop albedo regression and final source check. |
| Flag shadow does not wave | **Fixed classification.** Continuously animated placed props use the dynamic shadow budget in map and Battle Room; still props keep cached rows. A Wave/always classification regression passes. Actual moving-shadow pixels still require a game visual gate. |
| Crude eagle emblem/finial | **Verify / cosmetic work remaining.** No closing comparison located. |
| Wall bracket has no wall, fixed2.4m mount | **Fixed current behavior.** Studio wall already existed; bracket Placement height is now editable0.3–8m, old recipes default2.4m. Actual geometry and saved origin move together in a regression. Surrounding wall remains a preview fixture rather than exported geometry. |
| Background-color cutout keeps enclosed holes solid | **Implemented by root during audit; validation pending.** Background-color removal now includes enclosed matching islands. Root owns enclosed-hole fixture and compatibility checks. |

### Slimefolk

**Fixed delivered feature.** Resume note says done and no separate transcript was supplied among the thirteen agent extracts. `SlimeBody.js`, species switching/hat-only behavior and native motions are covered by existing Slimefolk tests and18 new form×size×feeler cases. Software translucency is approximate; the numerical matrix is not a material-quality certification. Reopen specific defects only with a reproducible case.

## Miscellaneous and audit follow-through

| Item | Present state and next action |
| --- | --- |
| Everything reads Greek in every locale; German Saving means rescuing; missing Density/Frizz/Lock thickness/Apply skin finish/prop labels | **Fixed effective tables.** Later overrides at `I18nManager.js` `RR_CHARACTER_3D_*` blocks replace stale original entries; source grep alone falsely reports the old values. Final i18n tests passed. |
| Snu-Snu gold authored gloss1 instead of~.85 | **Not reproduced in current bundled data.** Current Snu-Snu sidecar has rig/animations but no surface/variant override; Database bindings have no gold surface. Original probe concerns an owner-specific perfect-mirror variant. Do not blanket-rewrite model materials; its exact authored variant needs identification before a data-only change. |
| Harness lock split (`harness.lock` versus `harness-slot.sh`) | **Open tooling cleanup.** Resumed work used explicit single-GPU ownership and unique profiles; original scripts still differ. A current test pass does not fix old lock helpers. |
| Old missing page-order/module tests, necktie NaNs, chibi fixture failures | **Fixed superseded failures.** Resumed full suite7,746 passed/9 skipped/0 failed and later focused suites passed; do not keep paused failures as current bugs. |
| Exhaustive quality language | **Bounded coverage only.**401 species/heads/body-plan builds,1,752 equipment builds,260 moving garment cases,48 transferred source fits. No Cartesian product of all sliders, hair, expressions, equipment and motion frames has been evaluated. |

Lighting verification:137/137 focused Node tests; actual NW smoke `editor/tests/smoke/nw-model-facing.cjs`, evidence `scratchpad/lighting-audit/smoke/`. Its first candidate exposed a varying-link failure on nonmodel floor/walls; the model-only preprocessor guard fixes it, and the permanent smoke asserts visible pixels as well as no shader/GL errors. Reload an owner process that compiled the rejected program before judging the new source.

Current final species evidence: `scratchpad/species-quality/latest-frozen/report.json`; paginated256px software sheets in `frozen-species-views/species-{preset-female,preset-male,short-lean}-labelled-01..05.png` and `frozen-heads-shortlean/heads-short-lean-labelled-01..02.png`. All401 builds pass seven durable tests after the final body freeze; Merfolk/Creature focused suites31/31. Software rendering intentionally flat-shades and reduces hair budget; it cannot clear translucent/PBR/hair-density gates.

New work should update the matching row with its exact regression and visual evidence. Preserve the known source-fold and seated-cloth limitations until an actual before/after clears them.

Second-pass freeze: runtime20261018.9 matches all19 bundled copies. Fresh564 model,1,314 static equipment and780 moving garment reports are recorded in CHARACTER-QUALITY. Core136, motion/cloth/species42 and lighting/media/shadow137 focused checks pass, plus the new strict panel regression. Actual Reactor Room floor/walls are visible with GLerror0 and no console errors after the candidate shader was corrected. Initial failing candidate programs require an editor reload; owner profiles/processes were untouched.
