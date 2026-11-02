# Human face: handoff (2026-11-01)

## Current candidate — Preview 98

This face candidate was introduced with runtime **20261101.24**. The release checkpoint uses **20261101.41** for later sprite, camera and online changes; face geometry remains Preview 98. See the [day's checkpoint](archive/handoff/0.99.4.md#2026-11-01--character-and-rebellion-checkpoint) for save/re-export instructions and the remaining review scope.

Preview 98 addresses the angular side-cheek ridge still visible with Cheeks and Cheekbones at −100%. A native side-cheek field now carries the skin behind the replacement face’s join through the same contour change. The replacement transition has bounded clearance above retained native triangles, with a small positive separation to avoid coplanar flicker. It inherits the body’s actual smoothed cheek normals instead of restoring raw cage normals at the edge. The screenshot’s default female side view and minimum settings are the reproduction target; male and saved/blink checks cover the candidate too. Runtime remains **20261101.24**. Full suites stay deferred and overall attractiveness/visual acceptance remain open. [Scope ledger](archive/evidence/cheek-ridge-20261101.json).

## How the current face is built

This describes the code at Preview 98. The sections further down keep older designs for the record.

1. **One sculpt, continuous gender.** `HeadMeshData.js` (version 2) holds one topology with feminine and masculine endpoints, generated from **Woman head** by zhuoyi0904. `setOf` in `CharacterHeadMesh.js` mixes the endpoints by gender, so 0.5 is a real in-between face. The face applies only to the human species with no head of its own (`applies`); `RR_NO_HEAD_MESH` turns it off.
2. **A mask on the native head.** The sculpt covers the face; scalp, ears and neck stay MakeHuman's. Each mask vertex is bound to 12 native skin vertices (`K`), so sliders and expressions reach it through the skin beneath, and `hide` drops the covered skin.
3. **`faceField` at the end of `HumanBody.shape`.** With version 2 data it widens the cranium and ear roots to fit the face, fading into the neck, then runs `cheekSurface` and `sealMouth`. The older path stays in the file but does not run: `FaceFieldData.js`, `seatEyes`, `faceOutline`, `noseWidth` and `eyeSet` are retired, and their tables (`FACE_OUTLINE`, `NOSE_NARROW`, `EYE_IN`) no longer affect the face.
4. **The cheek controls.** `cheekFields` measures ridge and cheek weights once on a reference body, cached per gender, so narrowing a cheek cannot move the field away from its target. `positions` adds **Cheekbones** and **Cheeks** on top of the bound shape; `smoothCheekNormals` softens highlights.
5. **Parts fitted to the mask,** wired in `CharacterModel.build`: `part`, `lidPart`, `sphereEyes`, `lipFit`, `lipPart`, `mouthPart`, `browPart` and `lashRim`.
6. **Shading.** `CharacterShading.headFromBody` blends occlusion into the skin at the mask's edge. It runs in both `CharacterModel` and `Character3DBuilder`. Fields added to a part must also go in `GEOMETRY_FIELDS` and `PART_FIELDS` in `CharacterPreviewBrowserEntry.js`.
7. **Rebuilding.** `HeadMeshData.js` is generated and never edited by hand; see [the tools guide](../editor/tests/tools/face-proportions/README.md). Its source, `scratchpad/Attractive-Models/woman_head.glb`, is not in git, so the data can only be rebuilt where that file exists.

## Previous candidate — Preview 97

Preview 97 addresses the broad anterior cheek bulges marked in the owner’s screenshot, below the outer eyes and beside the nose. The Preview 96 correction covered a smaller, higher ridge. The shared human sculpt now has a broader cheek field with a flatter neutral contour and explicit forward fullness from **Cheeks**; **Cheekbones** retains ridge control and contributes to the adjacent plane. Both fields are cached on reference vertices, so narrowing the cheek cannot move the mask away from its own target. Local normal averaging softens triangle highlights across the corrected cheek while retaining eyelid and seam anchors. Runtime remains **20261101.24**. Focused source measurements cover the saved Athlete and female/intermediate/male defaults; native front/quarter, male and saved/blink views cover the candidate. Full suites remain deferred and overall attractiveness/visual acceptance remain open. [Scope ledger](archive/evidence/cheek-bulges-20261101.json).

## Previous candidate — Preview 96

Preview 96 separates Hamstring stretch’s deep spinal fold from its pelvic hinge, reducing the nearly opposing pelvis/thigh skin rotations that flattened a glute at full reach. Feet and fingertip-to-toe contact remain planted. Lower-bust occlusion gains contrast and gentle downward-facing attenuation within the existing averaged gradient. The human face’s **Cheekbones** control now retracts/projects the visible malar ridge instead of mostly changing native cage width beneath a fixed sculpt; neutral female/male ridges are slightly softer, with local geometric normals following the correction. **Cheeks** remains the fullness control. Runtime **20261101.24**. Focused pose/contact checks, source face/shading measurements and native before/after plus saved-model views cover this candidate. Full suites remain deferred, and face attractiveness/visual acceptance remain open. [Scope ledger](archive/evidence/body-face-refinement-20261101.json).

## Previous candidate — Preview 95

Preview 95 adds collarbone elevation to Jumping jacks and elevation/posterior tilt to Pull-ups, sharing the overhead turn across the shoulder instead of folding the attachment flat. Jumping jacks use a frontal arm-swing reference; Pull-ups keep the elbows outward and ahead of the torso. Hamstring stretch measures the shaped foot’s toe tip and reaches it with extended fingers pointing down; wrist orientation eases from the solved neutral arm so the loop closes smoothly. Runtime **20261101.23**. Focused source checks cover the saved Athlete and default female/male builds, with native shoulder/toe views and actual saved-clip reloads. Full suites remain deferred and visual acceptance stays open. [Scope ledger](archive/evidence/exercise-shoulders-20261101.json).

## Previous candidate — Preview 94

Preview 94 replaces the lower-bust dome approximation with regularized quadratic gradients fitted to regional averages of the actual normals and occlusion. Surrounding chest-detail skin inherits the gradient; only the raised nipple retains local patch normals. Exercise elbow planes follow the torso and bind-pose bend instead of forcing world-front elbows or flipping arm frames. Forearm pronation follows a continuous branch. Jumping jacks take **1.1 seconds** (previously 2.4), with body-sized clearance at the sides. Hamstring reaches target the instep ahead of the shin. Push-ups keep the leg chain straight, the ankle unrolled at about 20 degrees of dorsiflexion, and the toe joint extended onto the floor. Distal forefoot skin/flexible clothing follows the toe bone through the ball transition, with static geometry preserved. Runtime **20261101.22**. Focused pose/clearance, native close-ups and saved-model checks cover this candidate; full suites remain deferred. [Scope ledger](archive/evidence/exercise-repair-20261101.json).

## Previous candidate — Preview 93

Preview 93 adds **Jumping jacks**, alternating **Hamstring stretch** (left hand/right foot, then right hand/left foot), **Sit-ups**, **Pull-ups** and **Push-ups** under Exercises, with saved action clips. Pull-ups use fixed overhead grips for a scene’s bar. Jumping jacks retain their hop; Pull-ups retain their vertical travel. Squat arms swing outward through the descent for leg clearance. **Kneeling** is a stable authored hold with slight head motion, and Upright straddle gains a small nod/turn. Lower-bust normals and occlusion use a broader source-space band with a locally bounded lower-dome gradient; Belly Tone’s analytic normal pass retains that smoothing instead of restoring coarse underside normals. The saved Robust Female Sci-Fi Athlete design was read for native comparisons without overwriting its files. Runtime **20261101.21**. Focused source contact/continuity checks, native views and a saved-model reload cover this iteration; full suites remain deferred. [Scope ledger](archive/evidence/exercise-followup-20261101.json).

## Previous candidate — Preview 92

Preview 92 corrects backward upper-arm roll in **Upright straddle** and **Squat**. These arms swing down directly from the bind pose; bounded forearm rotation brings palms inward while wrists remain neutral. Upright straddle returns farther toward the heels, lowering the decline by about 7–8 cm on the checked bodies while retaining the prior upswing height and anchored knees/feet. Original Straddle and Squat leg/root keys are unchanged. Runtime **20261101.20**. Targeted female/male direction, contact and loop checks plus native views and saved-model reload cover the change; full suites remain deferred. [Scope ledger](archive/evidence/exercise-arms-20261101.json).

## Previous candidate — Preview 91

Preview 91 fixes intermittent saved-design/species preview stalls. Studio creation restores the focus/resume listener removed by its teardown. Preset/open transitions reset canceled slider-settle handles, and detach cancels pending rebuild frames. Saved records retire the previous shape job and caches; “Opened” is shown only after the requested current recipe reaches the view. Runtime remains **20261101.19**. Focused lifecycle regressions and native saved-design/focus/species/reopen checks cover the fix; full suites remain deferred. [Scope ledger](archive/evidence/open-design-20261101.json).

## Previous candidate — Preview 90

Preview 90 gives Straddle’s thigh and shin a shared knee bend plane and reduces its overfolded low point while retaining grounded palms. **Exercises → Upright straddle** adds a separate wide-knee kneeling lift with torso upright and arms at the sides. **Squat** adds a four-second deep squat/full-standing loop with planted feet. Normal saves include both new action clips. Runtime **20261101.19**. Focused male/female pose, anchor, loop and native saved-model checks cover this candidate; full regression suites remain deferred. [Scope ledger](archive/evidence/straddle-squat-20261101.json).

## Previous candidate — Preview 89

Preview 89 smooths the running separation correction that introduced a sharper left-hip turn, then restores clearance with outward swing rather than a new twist. The captured gait is retained; Walking's keys are unchanged. **Body → Build → Fat bounce** adds subtle-to-Extreme movement across belly, side hips, thighs and calves, independent of bust/butt settings. Abdominal bounds follow the shaped whole belly; limb radii are measured from the body so heavier thighs/calves cannot grow outside the influence. Broad central regions move together, with bounded offsets and smooth attachment falloff. Weight, muscle and abdominal tone affect the response. Live sliders reuse calculated motion samples and the active source clip; saved GLBs carry the baked tracks. Runtime **20261101.18**. Targeted female/male gait/clearance inspection, cached-versus-fresh equality checks, native visible-mesh slider measurements, run views and saved-model reload cover this candidate. Regression suites remain deferred. [Scope ledger](archive/evidence/run-fat-bounce-20261101.json).

## Previous candidate — Preview 87

Preview 87 fixes body-slider changes briefly rotating floor poses upright. Complete builds recreate the active animation before drawing; the lightweight drag path preserves posed rotations/animated translations across its temporary bind calculation, including constant mixer tracks. **Exercises → Straddle** adds a forward-facing, wide-knee kneeling exercise with head raised and grounded palms ahead of the body and a two-second lift/return. Normal saves include **Straddle** / **straddle**. The approved fast stretch's original keys remain unchanged. Runtime **20261101.16**. Targeted native slider/render-frame inspection, male/female Straddle views, source contact checks and saved-model reload cover this candidate; regression suites remain deferred. [Scope ledger](archive/evidence/straddle-slider-20261101.json).

## Previous candidate — Preview 86

Preview 86 fixes bounce opening the detailed chest boundary: it removes subdivided boundary T junctions and copies the body's final skin bindings at shared endpoints. The pigment overlay shares the detailed skin's bindings. It also removes a four-influence exclusion that left most uncovered butt skin rigid, and shares glute motion across pelvis/upper-leg child joints instead of driving only a small pelvis-weighted region. Runtime **20261101.15**. Source seam measurements, visible-mesh slider checks, native run/stretch views and a saved-model reload cover the fix. Regression suites remain deferred. [Scope ledger](archive/evidence/bounce-seams-20261101.json).

## Previous candidate — Preview 85

Preview 85 adds independent **Body → Bust → Bust bounce** and **Body → Torso → Butt bounce** controls: subtle 0.15 defaults, 0–1 normal ranges and 0–4 Extreme ranges. Bust and glute joints deform skin and fitted cloth smoothly. Exercises have a stronger response to slower movement and changing torso tilt; the approved walk/run spring behavior is preserved. Slider changes refresh animation keys without rebuilding meshes/textures; re-saved clips carry those keys. Zero stops secondary movement and preserves the original body posing, including bent hips; static holds remain still. Fitted cloth retains its strongest four influences to avoid rigid patches over moving skin. Runtime **20261101.14**. Targeted motion/binding inspection, native independent-slider review and saved-model reload cover the candidate; regression suites remain deferred. [Scope ledger](archive/evidence/soft-tissue-bounce-20261101.json).

## Previous stretch candidate — Preview 83

Preview 83 adds a little more forward travel on the fast stretch’s upswing and shortens the loop from two seconds to 1.75 seconds. The palm-supported chest/head lift and shallower return remain; the standard six-second stretch is unchanged. Palms stay down and knees/feet remain anchored. Runtime **20261101.12**. A targeted native peak view and numerical motion inspection cover this small adjustment; regression suites remain deferred. [Scope ledger](archive/evidence/fast-stretch-finish-20261101.json). [Prior chest-lift adjustment](archive/evidence/fast-stretch-press-20261101.json). Preview 80 below retains the saved-model reload coverage.

## Previous candidate — Preview 80

Preview 80 adds **Exercises → Fast kneeling back stretch** alongside the owner-approved original. The new loop takes four seconds rather than six, reaches farther forward, and returns less deeply. Palms stay down while knees/feet remain anchored. Normal saves include **Fast Kneeling Back Stretch** / **fastKneelingBackStretch**. Runtime **20261101.9**. Targeted native female/male views, saved-model reload and numerical motion inspection cover this variant; regression suites remain deferred. [Scope ledger](archive/evidence/fast-kneeling-stretch-20261101.json).

## Approved standard stretch — Preview 79

Preview 79 extends the stretch upswing a little farther, keeping the same six-second timing and resting keys. Palms stay down and knees/feet remain anchored. Runtime **20261101.8**. The small amplitude adjustment has a native peak view and source contact/loop inspection; regression suites remain deferred. [Scope ledger](archive/evidence/stretch-reach-20261101.json). Preview 78 below records the shared motion's saved-model reload coverage.

## Previous candidate — Preview 78

Preview 78 adds forward bending through the back/shoulders and longer arm reach to the kneeling stretch, following the owner's clarification that palms should stay on the floor. Knees/feet remain anchored and palm height remains constant. The approved resting keys are preserved. Runtime **20261101.7**. Native female/male views, a 25-sample world-position inspection and an actual saved-model reload cover the candidate; regression suites remain deferred. [Scope ledger](archive/evidence/stretch-forward-20261101.json).

## Previous candidate — Preview 77

Preview 77 gives the owner-approved kneeling back stretch a gentle six-second forward reach and return. The resting and final bone keys match the approved hold; knees and feet stay in place while the torso and hands advance. Runtime **20261101.6**. Native rest/reach views and an actual saved-model reload cover the stronger candidate after the owner rejected the initial subtle motion. Regression suites remain deferred at the owner's request. [Scope ledger](archive/evidence/stretch-motion-20261101.json).

## Previous candidate — Preview 76

Preview 76 adds **Exercises → Kneeling back stretch**, a steady knees-apart hold with hips back and hands reaching forward. It is included in normal saves as a named clip/action. Runtime **20261101.5**. Three native body views and an actual saved-model reload cover the candidate; regression suites remain deferred for visual iteration. [Scope ledger](archive/evidence/kneeling-stretch-20261101.json). Earlier face/skin review items remain open.

## Previous candidate — Preview 75

Preview 75 corrects the overextended ankles in Crawl and Hands and knees. The feet follow the shins within the existing 52° ankle-pitch limit instead of being forced to a world-space half-turn; the shins rise slightly toward the ankles for trailing foot clearance. The other floor-pose branches are unchanged. Runtime **20261101.4**. Three short native views cover female/male crawling and a close-up; regression suites and a new export reload are deferred for visual iteration. [Scope ledger](archive/evidence/crawl-ankles-20261101.json).

## Previous candidate — Preview 74

Preview 74 adds a separate knees-up seated hold with feet drawn in, a still Hands and knees pose, and an in-place Crawl loop. The owner asked to keep the earlier legs-apart seating. It and the approved Hip Bridge retain their keys; the existing Sitting correction remains. Runtime **20261101.3**; regression suites remain deferred for visual iteration. Pose scope: [preview and export ledger](archive/evidence/crawl-seated-20261101.json). The face/skin candidates and their open review items remain as recorded below.

## Previous candidate — Preview 73

Preview 73 adds steady back-lying with bent knees apart and sitting with legs apart. The old Sitting no longer receives the sole-leveling correction that amplified left-thigh motion from under 0.9° to about 7.6° between samples on the inspected female body. The owner approved the Hip Bridge's appearance; its 53 tracks compare exactly with Preview 72 after sharing the floor-pose builder. Runtime **20261101.2**; regression suites remain deferred at the owner's request. Face/abdominal geometry and skin controls retain the earlier candidates and their open visual issues. Rest-pose evidence: [preview and export ledger](archive/evidence/rest-poses-20261101.json).

## Previous candidate — Preview 72

Preview 72 adds the Exercises category and floor hip bridge, with dark pose headers, lighter rows and themed scrollbars. The face/abdominal geometry remains the Preview 70 candidate and skin controls remain Preview 71. Runtime is now **20261101.1** for the shared exercise library; generated heads are unchanged. Face attractiveness and the chin-spike report remain open. Regression suites remain deferred at the owner's request. Exercise scope: [native preview and export ledger](archive/evidence/hip-bridge-20261101.json).

## Previous candidate — Preview 71

Preview 71 adds humanoid **Colors → Skin surface** controls for finishes and pore textures; the face and abdominal geometry remain the Preview 70 candidate below. Natural keeps the earlier material defaults. Four short native views include a wet/porous saved model reloaded through the game reader, retaining its coating, pore map and 28 expression morphs. [Scope ledger](archive/evidence/skin-surface-20261101.json); local comparison: `scratchpad/skin-surface-20261101/comparison.html`. Regression suites remain deferred at the owner's request. Face attractiveness and chin-spike reproduction remain open; this addition does not close those reports.

## Previous candidate — Preview 70

The owner rejected Preview 69's pulsing slider transitions and the high, subtle abdominal relief. Preview 70 moves all three abdominal pairs into a bounded region below the bust and around the navel, with stronger, rounded relief. The natural Belly Tone range is unchanged. The middle pair has additional relief so it reads separately from the upper and lower pairs. The appearance remains a visual candidate. Local visual previews are under `scratchpad/face-followup-20261101/review-70/`; the larger-bust placement view is in `final-placement-70/` and predates only the middle-pair strength adjustment.

Live transitions now interpolate the bone rest positions and inverse bindings alongside positions, normals, UVs, weights and camera framing. The active motion clip is refreshed for the changed human dimensions too. Linear interpolation avoids restarting an ease-in at each incoming worker sample. Parts with changed source vertex correspondence switch directly instead of blending unrelated vertices. This is display-only; the recipe/export model remains exact.

**Iteration policy:** at the owner's request, defer regression suites until the owner accepts the visual result. The 87 focused and ten documentation checks below belong to Preview 69, not this candidate. Preview 70 uses short native visual previews only ([scope ledger](archive/evidence/human-face-iteration-20261101-preview70.json)); transition and abdominal regression fixtures still need updating and running at final validation. Runtime remains **20261031.1** and Prop Preview **62**. Restart the editor and regenerate older saved models.

## Previous candidate — Preview 69

The owner rejected Preview 66's square jaws, rough inner eyes and overall appearance, and reported pointy under-chin shadows, coarse underside-bust shading and missing updates during slider drags. **Overall face attractiveness remains open to owner review.** Runtime stays **20261031.1**, Prop Preview **62**. Restart the editor and regenerate older saved models.

The lower face tapers independently of cranial width; mouth width and corner fit are rebalanced with the nose and cheeks. Male jaw expansion and chin projection are reduced; cheek, forehead and nasal treatment are coordinated rather than narrowing the whole head. Broad cheek/forehead normals are softened while eye and mouth folds retain detail. The generator opens the actual source eye sockets before lining them, keeps native eyelids hidden, and parks the separate blink sheet tightly along its rim at rest. Saved blinks still unfold onto the fitted globes.

The bust diagnosis separated coarse preview pore relief from broad surface shading. Preview pore relief is finer and weaker. Source normals are softened locally under the bust, preserving geometry, nipple detail, UV continuity and clothing fit; the fine chest patch inherits the same boundary normals. The shared normals also reach saved models. Extreme bust silhouettes remain polygonal. The two exact chin spikes in the supplied screenshot were not reproduced with the default recipe; low-angle female/male captures are retained, without claiming that report closed.

Live slider builds remain off the UI thread. A cache-ordering bug that cleared the new structure key during model disposal is corrected, so matching samples reuse their meshes, skeleton and attributes. Completed samples can display during the same active slider gesture when every other recipe field still matches. Release, another edit or a new gesture rejects stale samples and schedules the exact current value. Matching displayed geometry now interpolates between worker samples over 100–240 ms, retargeting from the current intermediate shape. Final recipe/export buffers remain exact; topology changes switch directly. Short drags can still wait for the first worker result.

Beyond natural Belly Tone, the flat target stops extrapolating and a cached skin field adds continuous paired rectus columns, three muscle sections and tendon separation, with restrained crease shading. Bust smoothing yields to deliberate abdominal relief; cached analytic gradients preserve the muscle normals instead of averaging them flat. Expression posing carries the same normals. The natural range remains unchanged. This is under visual review after the owner rejected the first cramped relief.

Validation passes 87 focused checks, ten documentation/runtime-copy checks and six saved-quality geometry profiles without issues. Native smoothing reports count interpolated frames and compare settled positions, normals and camera across release. Final Grey checks cover both complete builds and the lightweight shaper; the latter records 23 updates while moving and sub-micron release position differences. The exact chin-spike preset has been requested for reproduction.

Current evidence: `scratchpad/face-followup-20261101/`, with retained renders, continuous pointer-drag reports and a comparison gallery. [Tracked follow-up ledger](archive/evidence/human-face-followup-20261101.json). The older sections and galleries below describe historical candidates, not aesthetic acceptance.

## Previous candidate — Preview 66

Both human defaults have revised proportions and a broader, smoother temple/forehead transition. The owner rejected the previous faces and requested online research as well as reference-model study. **The owner subsequently rejected Preview 66 for square jaws, rough inner eyes and overall appearance.** Runtime stays **20261031.1**, Prop Preview stays **62**. Restart the editor and regenerate older saved characters.

Research, equations, scope and reproduction commands are in [the face tools guide](../editor/tests/tools/face-proportions/README.md#research-and-measurements). Published spacing models informed the changes; they do not establish a universal beauty formula. The model-space ear-root proxy ratio moves from about 0.67–0.70 to 0.50–0.52. Female/male pupil spacing is now about 63/68 mm, and eye-to-mouth distance about 64/72 mm. The proxy is not the photographic measurement in the cited research.

The human native cage widens across the skull and ear roots, fading into the neck. The shared sculpt coordinates closer eye placement, smaller globes/irises, almond lid openings, a shorter nose-to-mouth interval and distinct jaw/brow endpoints. Its transverse map preserves vertex ordering. The forehead fits back toward the crown; constrained fairing and continuous clearance soften the join. Matching chart interpolation and a full-width normal/AO blend replace the earlier abrupt shading handoff. Eye/lip folds, sliders and named expression/speech morphs remain. Other species retain their own heads. Three segments resolve the short human lash curves with fewer exported morph entries; the existing 900,000-byte plain-face morph ceiling remains.

**Slider snap:** reproduced with real held mouse input on Head width, Eye width and Nose width: roughly 12 mm of vertex displacement and a small camera shift between the last fast drag and complete rebuild. The browser shaper omitted `HeadMeshData` and resting-mouth expression data. Its old-binding deformation also could not refit the shared face correctly. Shared human input and release now use the same complete worker build, with stale recipes coalesced. The alternate shaper receives the proper schema and rest units. A busy generator can delay an update; it no longer substitutes an approximate face while dragging.

Eight native drag/release cases pass: Head width, Eye width, Nose width, Chin width, Gender, Age, Height and Head size. Geometry, normals, recipe, topology and camera match exactly across release in these cases. The final 67 focused face, expression, worker, brow, hair and texture checks pass. Four saved-quality geometry profiles report no issues. Fourteen retained native captures cover matching bald views, right profiles, hair/smiles and actual saved female/male GLBs; both exported blinks close and all 28 morphs reload. [Tracked evidence](archive/evidence/human-face-proportions-20261101.json) records the scope; no full suite or Windows/macOS check is claimed.

Local evidence: `scratchpad/face-refinement-20261101/comparison.html`. `before-defaults/` is the unchanged Preview 65 baseline; `candidate-*` and `brow-fair/` include rejected trials. Retained captures are `final-comparison/`, `temple-blend/`, `final-hair-expressions/` and `final-exports/`. The slider reports are `sliders-before/report.json`, `sliders-after-face/report.json` and `sliders-after-body/report.json`. Models and pictures stay local and ignored by Git.

For review, compare both complete faces at matching cameras, then rotate bald profiles and inspect temples, ears and forehead. Exercise expressions, gender between endpoints, age/ancestry and head controls, and compare freshly saved female/male models. Passing checks do not settle attractiveness.

## Previous follow-up — Preview 65

Preview 64 was rejected by the owner for ear coverage and unnatural nostrils. Its front-heavy review missed the bald side-view defects. Its passing checks do not establish visual quality.

The face patch now stops in front of the ears. Native ear vertices are excluded from hidden skin. The seam binds along continuous rays through the native skull rather than switching between unrelated nearest triangles; its larger triangles are refined before fitting. At the join, UVs come from the actual native triangle, including chart splits. The forehead ends below the crown. Extra brow triangles behind the eye plane are excluded so the brow picture does not wrap into bars on the temple. Face shading softens the sculpt before blending with native skin; it must not lighten the inherited shade at the join.

The reference's tall nostril folds are narrowed and their small lower-wall bulges are recessed. Their normals follow the reworked geometry. Bounded local visibility supplements the native cage's occlusion; the interiors retain the skin material, with no near-black depth paint. Experiments that opened separate nasal passages distorted the upper lip and were removed.

Restart the editor and regenerate saved characters for Preview **65**. Runtime stays **20261031.1**. Visual acceptance remains open: the temple blend and nasal folds still warrant close review. This is a targeted follow-up, not a claim that the human faces are finished. Validation covers 24 focused checks, four saved-quality geometry profiles, and eight native captures, including ear controls and one actual saved GLB reopened in two views with a complete blink. No triangle or morph ceilings were relaxed. New captures and checks are recorded in [the follow-up ledger](archive/evidence/human-face-ears-nose-20261031.json); earlier numbered scratch folders are rejected experiments.

<a id="resume-in-the-morning"></a>

## Previous morning checklist (Preview 65)

The owner deferred review and requested this checkpoint. **Preview 65 has not been reviewed or accepted by the owner.** Start with the current follow-up above; the sections below preserve rejected checkpoints and must not be treated as current instructions.

1. Restart the editor, then regenerate characters so cached previews and older saved geometry do not obscure the changes. Inspect female, male and intermediate defaults with their normal hair, then bald from both sides and underneath. Compare with the finished reference models in `scratchpad/Attractive-Models/`. Overall attractiveness remains the goal.
2. Check ears, temples, scalp and under-chin joins through a full turn. Exercise ear size, projection, lobe and pointed-ear controls. Look for covered ears, torn or overlapping skin, color seams and eyebrow bars. The automated follow-up sampled selected ear settings, not every combination.
3. Prioritize the nose: low-angle captures still show rough, pale inner folds and strong recess contrast. Check ordinary front and three-quarter views as well as the underside, on light and dark skin. Neither the nostril shape nor overall face quality is finished. Do not restore the rejected open-passage experiments; they distorted the upper lip.
4. Check full blinks, smiles, surprise, crying and Talk. Look for exposed teeth at rest, mouth-corner spikes, distorted brows and rough tears. Try gender values around 0.5, age, ancestry, head/nose/jaw controls, and skin/eye color changes followed by a return to the original color. Repeat with hair and headwear; the broader Preview 64 audit predates the latest geometry.
5. Save fresh female and male models, reopen them, and compare their materials, blink and speech with the builder. Verify dialogue in an actual game. The current follow-up saved one intermediate model and reopened it in two studio views; it was not a gameplay audit. Windows and macOS remain unchecked.

Local evidence is in `scratchpad/face-ear-nose-20261031/`: `comparison.html` and `comparison.png`, `final-core-4/`, `final-extras-3/`, `focused-final.log`, `quality.json` and `docs.log`. These pictures, reference assets and saved models remain local and ignored by Git; the code, fixtures, attribution and evidence manifests are committed. The earlier `scratchpad/face-recovery-20261031/` gallery records the rejected Preview 64 result.

For automated reproduction, use the tracked recipe and shot files described in [the face tools guide](../editor/tests/tools/face-proportions/README.md). Keep heavy checks inside `codex-check`, one at a time, with at most four captures per browser. Generated `HeadMeshData.js` must be rebuilt through the generator, never edited by hand. Passing tests do not close the visual review.

## Rejected recovery — Preview 64

The shared human sculpt replaces the two unrelated masks described in the historical handoff below. It derives from the licensed finished **Woman head** by zhuoyi0904, reworked into feminine and masculine endpoints on one topology. Gender interpolates continuously, including across 0.5. Original skin, eye, ancestry, slider and expression controls remain in use; other species and animal heads retain their own surfaces. The owner rejected this checkpoint after opening the editor: the ears were obscured and the nostrils looked unnatural.

`build_head.py` retains the reference’s folded eye/lip surfaces and authored shading normals. It removes the closed oral cap and brings the opposing lip rims together at rest; otherwise speech stretches a painted skin panel across the opening. Twelve shared skin bindings per vertex carry the native controls. Upper forehead, temples and under-chin blend back to the native skull. Native skin coverage is measured from actual mask triangles. Separate lids unfold over fitted eye ellipsoids for blinking without dragging the brow. Their base shading normals describe the visible unfolded surface, preventing dark bars in saved position morphs; the named blink and speech units bypass emotion-strength scaling. Fine pores export on UV1. Teeth fit the measured mouth line. Separate upper/lower inner lip folds overlap behind the neutral slit and separate during speech; the rear lining follows expression interpolation.

Default female humans use the long center part; explicit hairstyles are preserved. Eye materials use the same factors in preview and GLB. Full helmets omit their hidden face geometry. Unused native vertices no longer inflate exported morphs. A stale live-worker result can no longer replace a newer recipe. Its skin cache key and pixels update together; the painter uses the same head schema and resting-mouth units as the model worker. Native review waits for painting, the live build and shading before capture.

Rebuild instructions and source/hash provenance are in [the generator guide](../editor/tests/tools/face-proportions/README.md). Attribution is in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md#character-face-base-heads). This is the historical Preview 64 checkpoint; use the Preview 65 instructions above for the current code. Runtime remains **20261031.1**.

Rejected Preview 64 evidence is under ignored `scratchpad/face-recovery-20261031/`. Earlier numbered render folders include rejected experiments; the final folders and comparison gallery record that rejected checkpoint. Validation: **100 focused checks** across 11 files, followed by **22 expression/shared-head checks** after the final lip-root refinement. Five selected catalog/model regressions pass; the corrected crown-surface check also passes. The latter previously merged nearly coincident crown/stitch ray hits and falsely reported a hair leak; cap construction is unchanged. No triangle or morph budgets were relaxed.

The native audit covers **28 control changes** with no problems and **24 final captures**: defaults, intermediate/age/ancestry profiles, expressions, colors, headgear and saved-model views. Two actual saved GLBs reload in four views through the game reader’s studio mode; embedded PNGs decode, 28 morph names survive, and the rendered neutral-mouth/blink checks pass. Four saved-quality geometry profiles have no invalid triangles or normals. The color round trip keeps the skin cache paired; one byte of a 4 MiB picture differs by one level between painting paths. [Provenance and scope](archive/evidence/human-face-recovery-20261031.json).

The local `comparison.html` and `comparison.png` use initial before captures and final defaults at the same front camera. Hair artwork and extreme expression polish remain broader visual work. No new full-repository pass or owner aesthetic approval is claimed. Windows and macOS have not been exercised.

## Historical handoff — previous implementation

The remaining sections preserve the prior assessment and diagnostic record. Their implementation details, defects and test counts describe the earlier checkpoint, not Preview 64.

**State: unfinished, and the owner does not accept the result.** The faces are better than the MakeHuman defaults but still ugly in the owner's judgment. The goal is attractive, natural default human faces (female, male and androgynous) that people want to use, with sliders, expressions, skin tone and eyes still working. Treat everything below as a record of what exists and what was learned, not as a proven approach. Replacing the method outright is a fair option.

## Who did this and how it went

This work was done by Claude Opus 5.5 on 2026-10-31, and it was very bad. It failed the goal: at the end of a full day the faces were still ugly, and the owner stopped the work to hand it to someone else. The day was wasted, out of the limited weekend time the owner had, and the owner is considering cancelling their subscription because of it. A fault the owner had reported would often come back, or a fix would break something else, so the owner spent the day supervising and correcting basic mistakes. It repeatedly reported defects as fixed before checking them, named one cause after another, tuned against the bald base heads instead of the finished references until the end of the day, and held ready fixes back for test runs. The owner found most of the visible faults, not the model. Weigh its conclusions here accordingly, and check them yourself.

The owner's assessment, 2026-10-31: the quality of Anthropic's Opus 5.5 has degraded by a lot compared with earlier work on this project, and today's output was far below what it has delivered before.

## Look at this first

Pictures live in `scratchpad/Face-Experiment-4/` (ignored by git, kept in the owner's Dropbox):

- `compare-references.png`: finished references and ours, one camera, scaled to the same eye spacing. Top row: three female references, then our female. Bottom row: two male references, our male, our gender 0.7.
- `current.png`: ours in several expressions, close-ups and slider cases.
- `working-files/`: the scratch copies of every script, the render shot lists, recipes, reference renders and the depth maps `headmesh.py` reads. `/tmp` is RAM, so this is the only surviving copy of those maps.

The reference models are in `scratchpad/Attractive-Models/` (more are being added; `Anime/` is for a later anime mode).

## How the owner judges

- By eye, in the running editor, from several angles, animated and in expressions. Numbers do not settle it.
- As a whole face. Every time one cause was named ("it's the proportions", "it's the painted color") the owner rejected it as an oversimplification, correctly. Reference faces work as a whole.
- The references are the finished, textured models. Use them as mesh inspiration, not copies: "mesh inspiration… not a direct copy", must connect to the body, keep the sliders and the skin, eye and color logic. Human only; other species keep their own heads.
- Don't report a fix before looking at it close up, from both sides, on in-between bodies. Don't hand over half-finished renders. Keep working while faults are open: a test run is not a reason to wait.

## How it was built before Preview 64

For the current design, see [How the current face is built](#how-the-current-face-is-built).

1. `HumanBody.js` `shape`, in order at the end: `faceField` (per-vertex moves from `FaceFieldData.js`, the female or male set, not a blend), `sealMouth`, `seatEyes`, `faceOutline`, `noseWidth`, `eyeSet`. `FACE_OUTLINE`, `NOSE_NARROW` and `EYE_IN` are the tuning tables.
2. `CharacterHeadMesh.js` plus generated `HeadMeshData.js`: a face **mask** (forehead to under the chin, in front of the ears) from two CC-BY sculpted heads. Each vertex is a weighted sum of six hidden MakeHuman skin vertices plus an offset scaled by eyes-to-chin, so sliders and expressions reach it through the skin (`interpolation`). Scalp, ears and neck stay the body's. `hide` drops the skin under it. `RR_NO_HEAD_MESH` turns the mask off.
3. Everything on the mask is fitted there too: `lipPart`/`lipFit` (lip decal on the measured outline), `browPart`, `lashRim` (lashes on both lid edges), `sphereEyes` (the eyeball is rebuilt as one sphere from the lids on that body, turned to look out of the opening, shaded by the lids), `mouthPart` (dark behind the open mouth). Nostrils and creases darken through `tone`, applied with the baked shade.
4. Shading: `CharacterShading.headFromBody` blends the mask's occlusion into the skin at its edge and applies `lidWall` and `tone`. It runs in `CharacterModel.shade` and separately in `Character3DBuilder.js`. Fields added to a part must also be listed in `GEOMETRY_FIELDS`/`PART_FIELDS` in both preview workers.

## Rebuilding the data before Preview 64

Scripts are in `editor/tests/tools/face-proportions/`; see its README. These older scripts assume one scratch folder holding the scripts and `refs/`: start from `scratchpad/Face-Experiment-4/working-files/`. The generated JS files must not be edited by hand. **Read the generator's output before trusting a render:** one crash left old data in place and the render looked like a result.

## Verified lessons

- Compare with the finished references first (`swap.js` puts a reference on our body at the same eye spacing, `raster.py` draws bare geometry with one camera and light). This found more in minutes than hours of tuning: our head was about 14% narrower and hollow, eye openings about 0.41 of eye spacing against 0.5 to 0.55, irises about two-thirds of the opening against one half, brows low and full on the references. A theory that raised brows would help was simply wrong.
- Reference lids fold back under themselves; the mesh boundary is the hidden inner edge, not the visible one. The fold faces are cut in `headmesh.py`, so the boundary is now the lid edge and lashes root on it.
- `headmesh.py` works in y-down coordinates, so a face's front is -z in the winding.
- Binding to different vertex patterns on either side of a line leaves a crease once the outline deforms the face. Keep bindings continuous.
- Render in-between bodies (gender 0.3 and 0.7, ages 15 and 62). Gender 0 and 1 alone hid eyeballs bursting from their sockets.
- Earlier proportion solving from sparse landmarks was unreliable, and a polynomial muzzle made a plate. Both were dropped.

## Known faults before Preview 64

Worst first, as of that checkpoint's last render. Current faults are in [OPEN-ITEMS.md](OPEN-ITEMS.md).

1. **The overall face is not attractive.** The two heads are bare sculpts. Compared with the references, ours lacks defined sockets and lids, real lip form and highlight, and depth and variation in the skin.
2. **Default hair** sits like a cap with a rough hairline. It was not refitted to the wider head, and only the default style has been looked at. References have hair framing the face.
3. **Rippled creases beside the female's outer eyes.** Cause unknown. A binding fix changed them but did not remove them.
4. **Expressions:** the female's smile leaves dents, her surprised mouth is boxy and rough inside, the male's smile is weak. Expressions were not retuned for the mask.
5. **Male:** thin upper lip, looks older than the references, dark band above the lid (it shows without the skin's normal map and picture, source unknown).
6. **Inner eye corners** have small marks. Lower lashes are still too regular up close.
7. **No neutral face.** The head switches between the female and male sets at gender 0.5, with a visible jump. The androgynous request is unmet.
8. **Skull height:** both crowns are lower than the references'.
9. **Anime eyes, Custom eye type and the eye sliders** have not been checked since `sphereEyes` replaced the ball.
10. **Not verified on the final code:** the real-editor control audit (`tests/smoke/nw-builder-controls.cjs`), blink, saved GLB export, other ancestries, Windows and macOS.

## Licenses

`THIRD_PARTY_NOTICES.md` credits "Woman head" by zhuoyi0904, the source of the current `HeadMeshData.js`, and "Male head base" by alkalor and "Female Elf Head" by Scol3D, the source of the retired `FaceFieldData.js`, which still ships. All are CC-BY 4.0. Do not ship data from other references without checking their licenses: `mita_miside_free.glb` is NC-ND, the saree is Sketchfab Standard, and several show existing characters.

## Test results before Preview 64

Current verification is in [OPEN-ITEMS.md](OPEN-ITEMS.md). This run on 2026-10-31 (`npm run test:all`) covered 9,238 tests, of which 18 failed. A worker crash and a script-order fault were then fixed, and the failed files were rerun: 13 failures remain. These were not repaired or re-baselined; each needs a decision on whether the code or the old expectation is right.

- Fall out of the mask directly: `default brows lie just above the eyes`, `the lips stand forward of the skin`, `eye size reaches big eyes` (`sphereEyes` now sets the eyeball's size), `short torso and neck carry the skull whole` (the skull is reshaped), `Ferengi nose folds refine connected skin`.
- Likely the wider head: `hidden ears leave ear holes`, `cap crown contains sampled crew hair`, `requested cuts have distinct silhouettes`, `a full beard is a soft volume`, `armor presets include the matching helmet`.
- Catalog sweeps: `character accessories face outward` (the monocle is first), `every catalog entry builds whole`, `Randomize: every kind rolls 50 believable recipes`. Hats, eyewear and masks were fitted to the old head.

Passing tests say nothing about how the faces look. The faults above were found by eye.
