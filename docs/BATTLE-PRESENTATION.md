# Battle Rooms and Action Sequences

Current implementation: runtime **20260911.6**, editor **0.98.6**. See the [phase/graphics guide](ACTION-SEQUENCE-EXPANSION-2026-09-11.md) and [held-item/throw guide](HELD-ITEMS-AND-THROWS-2026-09-11.md) for the September 11 expansion. Existing projects continue to use their battlebacks and existing action behavior until a creator assigns the new presentation. Battle rules, damage formulas, skill costs, targeting and repeats remain in the normal battle system.

## Battle party size

Open **Database → System 1 → Starting Party → Max Battle Members** to set the battle-party capacity (1–99). Battle Room Setup uses that many party slots, including slots not occupied by the starting party; additional party members remain reserves. Editing the value stores `System.json.maxBattleMembers`. The runtime uses this explicit limit even when a party-size plugin is installed. Scripted `setMaxBattleMembers` changes remain supported and persist with the game party.

Old projects retain their existing runtime behavior until the field is edited. The editor recognizes enabled PSYCHRONIC Party System, MOG Battle HUD and YEP Party System limits in plugin order; otherwise it starts from four. **Use Existing Limit** removes the database override. Demo’s current plugin configuration supplies seven slots. Custom/dynamic plugin limits cannot be inferred by the editor; set an explicit database limit for those projects. HUD layouts remain separately authored.

## Set up a Battle Room

1. Open **Database → Troops** and select a troop.
2. In **Battle Scene**, choose **Battle Room**, then select the map. Demo map 004, **Reactor Room - Battle Map**, is the initial authored arena.
3. Open **Set Up Room**. Select a party slot or enemy member, drag its marker, or enter exact X/Y/Z and facing values. Reset restores the default opposing formations. Positions belong to this troop; they do not edit the map or the old battleback positions.
4. **Use Map Camera** inherits the map's camera preset and angles, including isometric, third-person and first-person modes for 3D maps. Third/first-person cameras follow the first party slot. Choose **Override This Troop** for a different camera. Ordinary 2D rooms use a top-down orthographic view. While dragging a marker, the setup camera stays fixed so following the marker cannot change the picking ray. On release, third-person framing eases back behind the first party slot.
5. Apply the setup, save the database and use the existing Battle Test. Switching back to **Battleback** restores conventional presentation.

As of runtime **20260906.8**, room battles skip unused battleback files while keeping the background sprites expected by battle plugins. Map props retain the map editor’s authored direction, rotation and scale. Conventional battles keep their existing background loading.

The Troops **Battle Preview** renders the selected room live with its saved camera and starting formation. Applying Room Setup refreshes it. Battleback controls are hidden in room mode and return when switching back. The existing **Show Battle UI** overlay remains available. The preview shows initial placement and model/effect playback; running room events still belongs to Battle Test.

The Troops preview fits its available pane while preserving its aspect ratio. Battle Events remains visible below it; long command lists and the room/member sidebar scroll independently. The layout is verified at 2560×1440, 1920×1080 and 1280×720.

With **Override for This Troop**, navigate directly in the setup preview:

- Drag empty space to orbit; Ctrl-drag forces orbit even over markers.
- Shift-drag, right-drag or middle-drag pans; scroll zooms.
- Focus the preview and use WASD/arrow keys to move, Q/E for height, and Shift to move faster. While moving, the pointer turns the camera, as in the map editor. Editing inspector fields does not fly the camera.

Navigating captures the current view as **Free Camera**, independent of the party. In **Cinematic Cuts**, navigation instead edits the saved overview and retains cinematic mode. Choose a third/first-person preset again to restore party following. Camera fields update with navigation, and formation positions stay fixed. **Use Map Camera** keeps the inherited view and disables camera gestures. Apply saves the troop override; Cancel discards the draft. The setup preview fills the dialog height, the inspector scrolls separately, and Apply/Cancel stay visible.

The room keeps Scene_Battle and its battle windows. Its tiles, props, battler models, billboard sprites, light fields and attached Effekseer playback have their own scene and lifetime. Exploration map objects and player coordinates stay in place while the battle runs.

Troop event pages remain in Troops. Each map event can be **Called Only**, **On Room Enter**, or **Parallel During Battle**. The room panel can insert a call into the selected troop page. Common events called from a room interpreter inherit that room context. Move routes, event placement, animations, balloons, scrolling and their waits address room events. Room self switches last for that battle; ordinary switches and variables retain their normal shared meaning. Map transfers, vehicles, followers, tileset/parallax replacement and nested battles are skipped with a diagnostic, rather than changing the exploration map or hanging a wait. Plugins or scripts using `$gameMap` directly need a room adapter.

## Cinematic battle camera

Runtime **20260906.14** adds **Troops → Battle Room → Set Up Room → Override for This Troop → Mode: Cinematic Cuts**. Position the overview using the usual preview navigation and camera fields, then Apply and save. The setup preview shows the overview; Battle Test demonstrates the action camera.

The camera eases toward the acting battler over 30 frames, gently orbits, moves toward the target on impact over 24 frames, and returns to the saved overview over 42 frames. Rotations take the shortest arc and the orbit is bounded. Area attacks frame the distinct target group; repeated hits do not restart the camera transition. A new action can smoothly take over during the return. Saved camera values remain unchanged by automatic playback.

This mode hooks ordinary battle actions and built-in action sequences through the existing action/impact lifecycle. Explicit sequence camera keys and Battle Room Camera commands take control of the camera; built-in sequence cleanup restores its original camera configuration. Inherited map cameras and other troop camera modes retain their behavior. The sweeping perspective applies to 3D rooms; 2D rooms retain top-down projection while focus and zoom transition. Automatic obstacle avoidance and battleback cinematic cameras are not implemented, so check the authored room and overview in Battle Test.

## Missing battle assets

Battle Test uses its own selected party, stored in `System.testBattlers`; it can differ from Starting Party. The dialog reports missing 2D battler graphics for the normal side-view path and the supported PSYCHRONIC Charset path. A selected 3D battler takes precedence over its old image filename. Choose a configured actor or assign the intended actor a graphic in Actors; no actor or asset is substituted automatically. Encrypted imports retain runtime validation.

Runtime **20260906.9** skips a known-missing local one-shot sound with one diagnostic per missing reference instead of issuing a failed request for every cue. The reference remains in the database so it can be repaired; importing the intended file allows the next playback to work. Existing formats, case correction and encrypted audio remain supported. Web/remote URLs continue through the ordinary loader.

## Build an Action Sequence

1. Open **Database → Action Sequences**. Use **Add Starter Sequences** to add the 16 editable starters to an existing project, or create an entry. Save the database to persist the library.
2. Choose a template such as **Unarmed Punch**, **Melee Strike**, **Heal**, **Use Item**, **Throw Item**, **Throw Weapon**, or **Boomerang**, and click **Use Template**. Movement and held-item routines provide reusable building blocks.
3. Choose the preview user and target from existing actors/enemies. Their active 2D or 3D graphic is used. Preview casting is temporary; the sequence works with whichever battlers use it in battle. The default formation faces opponents toward one another; **Mirror Formation** reverses the sides.
4. Play, pause, step a frame or scrub the timeline. Select a step to adjust its duration and properties. Drag steps to reorder them, duplicate/delete steps, or add another step. Undo/Redo applies to sequence edits.
5. For movement keys, enter exact position, rotation and scale, or drag the user/target in the preview. Coordinates are relative to home or the current target; X offsets follow the attack direction. The Steps and Timeline buttons show the same ordered sequence.
6. Choose **Impact Behavior** under Options. **One Impact · Skill Repeats** uses one effect cue and the original repeated target occurrences. **Authored Hits · Each Impact Applies Once** lets each effect cue apply once to chosen unique battlers without multiplying skill repeats. Scrubbing the editor never applies gameplay effects.
7. Save, then assign a complete action, matching action phase, or state/reaction sequence in the relevant actor, class, enemy, weapon, skill or item controls.

Available commands cover movement, motions, held equipment, textured projectiles, animations, audio/media, action effects, targets, game data and conditional logic. See the [command coverage table](ACTION-SEQUENCE-EXPANSION-2026-09-11.md#command-coverage). Equipment/action icons, pictures and weapon-sheet frames support hand placement; models can use hand bones or a named bone, and sprites have adjustable grip/offset controls. Projectiles support allies, enemies, arcs, spin and return flights.

**Options → projection** selects a 2D or 3D sample view. The preview uses a neutral stage; test final room framing and gameplay commands in Battle Test. Branches use an explicit preview condition result instead of evaluating game scripts. Independently overlapping tracks, automatic notetag conversion and a room selector inside the sequence preview remain outside this workflow. Camera keys move a room camera; battleback camera choreography requires further support.

## Editing and previewing individual steps

Steps and Timeline use descriptions generated from the step’s actual settings. Motion rows identify the battler and motion (for example **User: Punch** or **Target 2: Guard**). Movement rows identify the destination, with **Run/Walk → Target** when that battler has a preceding running/walking motion, **Return Home** for its exact home, and relative offsets/stopping distance where applicable. Sound rows name the clip; animation rows name the database animation; weapon rows distinguish Show/Hide and the icon source. Smaller secondary text retains frame ranges and relevant details. Hovering a row shows its full description.

Descriptions update in place after property, picker and gizmo edits, including subsequent movement rows affected by a changed motion. The same row identity, focus and scroll handling remain in place. Names belong to the reusable battler roles rather than the temporary preview cast, and no extra description fields are stored in sequence data.

New steps, duplicates and pasted steps insert **immediately below the selected step**. Right-click a step for Play Step, Cut, Copy, Paste, Add Step, Duplicate and Delete. Ctrl/Cmd+C, X and V work while the sequence workspace has focus; text fields keep their normal text-editing shortcuts. Undo/Redo includes insertion, removal and reordering. Copy/cut uses the shared typed clipboard and pastes fresh step IDs. Failed clipboard writes do not delete a cut step, and a late paste cannot change a different sequence after navigation.

Drag existing steps to reorder them. A highlighted insertion line shows the exact boundary, including before the first or after the last step, and the list scrolls at its edges. The **Add Step** button is also draggable: choose a step or basic building block, then drag the button to the desired boundary. Clicking it inserts below the current selection.

**Play Step** plays only the selected step, using earlier steps to establish its starting pose without replaying their sound/effect cues. It stops at the end even with Loop enabled and excludes following steps, including zero-duration steps at the same timeline boundary. An instantaneous motion gets a one-second viewing interval; other instantaneous cues get one frame. The time readout shows progress within the selected step. Full **Play / Pause**, scrubbing and frame controls remain available.

**Play Sound** opens the same **Select Sound Effect** picker used elsewhere in the editor. Browse and audition the project’s SE files there, then choose volume, pitch and pan in the picker. The step inspector shows the selected filename and a read-only volume/pitch/pan summary without duplicating the editable level controls. OK saves the sound and all three levels as one undoable edit; Cancel leaves the step unchanged. Reopening retains the selected sound and levels.

## Preview placement and motion transforms

Runtime **20260906.11** removes the fixed 720×340 preview bottleneck. The stage resizes its render buffer with the panel and display density, with supersampling and a 2560-pixel width cap. Zoom In/Out, the wheel and Reset View change the authoring view. Action Steps occupies a full-height left column, with the stage in the center and the inspector on the right. Each scrolling pane fits independently at 1440p, 1080p and 720p. Selecting a step keeps its row and keyboard focus in place; edits that rebuild the list retain its scroll position.

- Choose **Preview Formation**, increase **Targets**, then select **Target 1–4** in the preview toolbar or click a battler/foot marker. Drag the model or translation arrows, or enter X/Y/Z and Facing in the inspector. Reset Formation restores the test layout. These temporary placements do not dirty or save the sequence; set actual battle formations in Troops.
- Choose **Step Transform** to edit a movement key or Battler Motion. The selected movement/motion opens at the end of its duration so the visible pose is the key being edited. Pick **Move** for the shared axis arrows or **Rotate** for the shared pose rings. Dragging changes the saved step, and Undo restores it.
- Under **Battler Motion → Whole Model**, enable **Override Transform**. Position Offset uses map X/Y and Z height. Rotation uses model X/Y/Z in degrees. Scale multiplies all axes; turn off **Proportional** for separate model-axis X/Y/Z multipliers. Axis-colored sliders and precise numeric fields update the model live. Enabling Override Transform shows both the shared rotation rings and the X/Y/Z offset arrows. Both remain available for motion overrides; Move/Rotate chooses which handle takes priority where they overlap. Dragging either a slider or ring updates the numeric values immediately without rebuilding the inspector, and each slider gesture is one Undo step. Double-click a slider to reset that axis. Scale offers a proportional multiplier plus optional per-axis controls. Numeric entries can exceed the initial slider range within the existing transform limits; the slider expands to match. Editing shows this motion’s final pose before any following instantaneous motion; full playback and scrubbing retain their normal sequence timing. Numeric fields and gizmos edit the same data. Changes interpolate over that motion’s duration and remain until the next motion; a motion without an override restores the model transform layer. Movement/home positions and source model assets are preserved. Battle cleanup restores all proportions even if the action is skipped or cancelled.
- **Current Target** addresses the first target, **All Targets** affects the distinct targets together, and **Target 1–4** selects an individual target for movement/motion/effect presentation. Runtime numbering follows the action’s distinct selected targets, not repeated hit occurrences. A slot that does not exist is skipped. The impact cue still resolves all original targets and skill repeats through the battle system.

Existing sequences without the optional motion `transform` and `targetIndex` properties keep their prior behavior. 2D sprites support position, screen rotation and X/Y scale; 3D models also support pitch, yaw and depth scale.

### Weapons in hand

A weapon step shows, moves or hides the equipped weapon (or the skill's item) in the hand for the sequence. Selecting a step in the editor previews the sequence as of that step, so a weapon shown by the next step is not yet in the hand.

### The preview camera

Right-drag orbits the preview, middle-drag or Shift + right-drag pans it, and the wheel zooms; **Reset View** brings it home and **Frame Battler** keeps the selected battler centred. The view is remembered with the other preview choices and never touches the battle's own camera, which stays as the troop's room sets it.

### Phases inside the sequence (2026-09-12)

An action sequence's step list is divided into phase sections: Prepare, Movement, Execute, Return and Finish, each with a numbered head where it begins. The hit is part of Execute: a Show Animation step on the targets and one Apply Action Effect step land it, wherever in the swing the author puts them, and an Execute with no Apply Action Effect of its own gets the built-in animation and hit after its last step. A step belongs to the section it sits in: drag it into another, choose its Phase in the inspector, or press the + on a head to add a step there. A section with no steps can be let go with Inherit; **Phases…** adds one back, or sorts the steps into phases automatically from what they do. The sequence provides exactly the phases it marks. Sequences kept for battler motions or routines say so under Used As at the foot of the editor.

A record (skill or item, weapon, class, actor or enemy) picks one Action Sequence, or **None**, which is read level by level: on an actor or enemy it means the built-in action plays unless a skill, item or weapon brings a sequence; on a class it means the battler's own sequence; on a weapon, the class's or battler's; on a skill or item, the weapon's, class's or battler's. Each phase of the action comes from the first record down the priority chain whose sequence provides it, and the built-in default fills any phase nobody provides. So a sword that only marks Execute and Effect keeps the actor's run-up and return; a gun that marks Movement too replaces the run-up with its own step forward; a starter provides every phase and owns the whole action until you let a phase inherit. Older per-phase assignments still work and show as such.

### Whole Action versus phases (older records)

Resolution is one decision per action, made along the priority chain (skill or item, then weapon, then class, then actor or enemy): the first record with a setting other than Inherit wins. If that setting is a **Whole Action** (a sequence with the Complete Action purpose, such as Railgun Shot on the pistol), the whole sequence plays and the phase settings further down the chain are not consulted at all. If it is **Phases**, each of the six phases is resolved on its own among the records set to Phases, with the built-in default for any phase nobody set. So a pistol that should never charge the target is right to own a Whole Action; a weapon that only changes how the blow lands can set just its Execute phase and let the class or actor keep supplying the run-up and the return.

### One transform card (2026-09-12)

Wherever a step places something, the inspector shows the same card: **Offset**, **Rotate** and **Scale** tabs over axis-coloured sliders with a number beside each, **Reset** for the open tab, one Undo step per drag. Opening a tab picks the matching viewport tool, so the arrows or rings are already on the thing being edited. The card serves a move step's end pose (its offset, turn and scale over the step's frames), a Battler Motion's model transform, and a weapon step's held item.

Held items are edited in the viewport too. Select a Show or Move weapon step and the arrows stand on the held thing: drag them to move it in the hand (X is forward of the hand), drag the rings to **Tilt**, **Turn** and **Roll** it, and the card follows. Turn and Roll only turn a 3D model; an icon has Tilt alone.

A bound 3D model is held at its grip: **Held By** chooses the middle (a pistol), the base (a sword's handle) or the top. The model's size comes from its binding under Database › Weapons or Items; the step's Scale multiplies it. A model with an authored front face points where its holder faces; one without keeps the long-axis assumption. In Advanced, **Bone Name** names a specific bone to attach to (blank finds the hand), and the icon grip fields place a 2D icon.

The **User** and **Target** above the preview are a preview cast only. Nothing about them is stored in the sequence: in battle, whichever battler uses the sequence plays it, with its own equipment and model. ### Pose Parts (2026-09-12)

A Motion step can pose the model's own parts instead of playing a named motion. Every rigged model shows a **Pose Parts** fold on its Motion steps, beside **Whole Model**: click a part on the model in the preview, or choose one in the fold, and the step becomes a pose of that part (its Motion reads Pose Parts; choosing a clip again drops the pose). The chosen part gets rings and arrows at its joint: drag them to bend or slide it, or use the card's Rotate, Offset and Scale tabs. Card sliders and preview gizmos share one colour per axis: X red (forward), Y green (depth), Z blue (up). Elbows and knees show **Bend** first. The pose is reached over the step's frames and kept until a later step moves that part, so a kick is one step raising the thigh and shin and a later step bringing them home; **Start from rest** on a step sends every posed part home first. A plain motion after a pose (Walk, Idle, a clip) brings the posed parts home over its own frames while it plays, and a 0-frame motion snaps them, the same way a Move step travels from the pose before it. Parts are addressed by the rig's names (the humanoid rig's Hips, Spine, Chest, Neck, Head, upper and lower arms, hands, thighs, shins and feet), so the same sequence plays on any model rigged with those names; a model without a part simply skips it. Sprite-sheet battlers wait through a pose step. Authored poses and clips from Database › 3D Models remain in the Motion list and play on command as before.

A model that ships its own skeleton and clips (a Mixamo or VRM character such as the Demo's Carol) keeps that skeleton: its rig names the file's bones instead of binding a second one, so a pose bends the real arm, and it bends it from wherever the playing clip holds it. Posed parts hold the pose over the clip; the other parts keep playing it, and a release eases the part back onto the clip.

### Projectiles (2026-09-12)

A Projectile step's panel names what flies under **Projectile**: a colored dot, the skill or item's icon or 3D model, the equipped weapon's icon or 3D model, a chosen icon, a picture, any **3D Model** in the project, or an **Animation** from the database that rides the flight (played on an invisible carrier, so it follows the arc). **Thrown To** picks the landing battler, **Flight** one way or return, **Starts From** the hand, the body or a position offset. The card's **Start** tab is the launch point: drag the arrows in the preview or slide X (forward of the thrower), Y and Z (height from the hand, or from the feet for a position offset). **Arrive** sets the landing height and the arc, previewed halfway through the flight. **Look** turns, spins and scales it. Graphic Owner, bone name and grip stay under Advanced. In a flat (non-room) battle a 3D model projectile flies as the colored dot.

**Frame Battler** in the preview toolbar keeps the selected battler in the middle of the view while zoomed in. Preview choices (cast, target count, swap sides, preview weapon, skill/item) are remembered per sequence, and projection, scene, zoom and Frame Battler per project, across restarts.

## First unarmed attack

Runtime **20260906.10** adds **Unarmed Punch**: run toward the target for 30 frames, wind up and punch with impact at frame 46, recover, then run home and restore the original facing at frame 96. It contains no image, effect or sound references. **Add Step** also offers **Run to Target**, **Punch**, and **Return Home** building blocks; each expands into ordinary editable steps. Keep one impact cue when using the default Skill Repeats policy; use Authored Hits for deliberate multiple impacts.

**Approach Target** stops on the attacker's side, including diagonal and mirrored formations. **Stop Short (tiles)** controls distance from the target (default 1.2); Y shifts sideways and Z changes height. **Facing** can follow movement, face the target, retain the current direction, or restore home facing. Dragging an approach key edits those same offsets. Adjust distance and duration for differently sized battlers.

3D battlers reuse their configured running/walking clips. An authored action rule named `punch` takes priority; otherwise a compatible humanoid skeleton with a right upper arm, forearm and hand receives a generated short jab on that model instance. This fallback does not alter the model asset and cannot infer limbs for arbitrary creature rigs or static props. Such models need their own named motion rules. Side-view sprites use their thrust motion. Preview scrubbing samples exact clip poses, including backward seeks; game playback retains animation crossfades.

Demo now contains sequence **#1 Unarmed Punch**, assigned under **Actors → Fleagus / Carol → Unarmed Attack Sequence**. Their normal default follows lower-priority defaults (the former **Inherit** option). For Battle Test, choose a configured actor, remove their weapon in the test equipment, then use **Attack**. Starting equipment, the saved test party, map formations and plugin choices were preserved. Explicit skill assignments retain priority.

## Assign action sequences

Action Sequences has its own database list. Troops contains room and battle-event configuration, with no sequence assignment.

Every skill, item, weapon, class, actor and enemy shows the same card: a priority line, a **Whole Action** control, and the five phases (Prepare, Movement, Execute, Return, Finish). Priority follows Victor's Battle Motions: **Skill / Item › Weapon › Class › Actor / Enemy**. A phase assigned on a record overrides that phase on every level after it; a phase left on **Inherit** keeps looking down the chain and ends at the built-in behavior. Weapon assignments apply to normal attacks. An actor's or enemy's own Execute is its default action, an unarmed attack unless something higher assigns one, so there is no separate unarmed override (a saved one from 0.98.5 becomes the actor's Whole Action when the actor had nothing else assigned).

| Whole Action | What happens |
| --- | --- |
| **Use the Phases Below** (default) | Resolve each phase through the priority chain |
| A complete action sequence | That sequence controls the entire action; the phases are not used |
| **Use Engine / Plugin Action** | Stop the lookup here and use the project's existing action presentation |

Weapon steps are **Show**, **Move** or **Hide**: show the equipped weapon (its icon, or its bound 3D model in a battle room) once at a hand offset and rotation, then add Move steps that tween offset, rotation and scale over their frames with easing; Hide puts it away. The sequence editor's Options offer a Preview Weapon so a swing can be authored with any weapon.

States carry a **Reaction Sequence** (a motion-purpose sequence played instead of idle while the state is on the battler; the highest-priority afflicting state with one wins), so poison, sleep and custom states each animate from the State record rather than from every battler. Character-set battlers pick their sheet row from their facing (Facing: Face the Target, or a fixed direction), which is what a vertical formation needs. Weapons and thrown items bound to 3D models are held and thrown as those models in battle rooms.

Each phase can inherit, use its built-in behavior, or reference a sequence with the matching purpose. Battler state/reaction controls separately cover idle, movement, guard, damage and other states; they yield to active actions. Actors/enemies also have an explicit SV/character/static/model graphic selector. See the [assignment and graphics guide](ACTION-SEQUENCE-EXPANSION-2026-09-11.md).

The builder lists **Where Used** references. Referenced sequences cannot be deleted or truncated by Change Maximum until their assignments are removed. Assignments, graphic settings and 3D model bindings travel with copied and duplicated records inside the same project; copying into another project does not carry unrelated sequence IDs.

## Compatibility and storage

Data is optional: `data/ActionSequences.json` is a normal database array with a null entry at index 0 and stable IDs; `data/BattlePresentation.json` holds versioned room configurations and assignments. Saving this pair uses a recovery journal so an interrupted write can restore the previous pair. Ordinary actor/enemy/troop and skill/item/weapon data and legacy note tags remain intact. Newer unsupported sidecar schemas are rejected rather than overwritten.

The initial runtime adapter preserves PSYCHRONIC Battle Engine's combat resolution while giving Reactor ownership of explicitly assigned choreography. Its ATB enemy icon adapter uses the selected 3D model instead of requesting a stale 2D battler filename. 3D battlers retain the loading bitmap expected by state-icon/plugin code. Room textures wait for whole-pixel sprite frames, preventing zero-size GPU uploads during loading.

VE Battle Motions, YEP Battle Engine Core, VisuStella Battle Core and LeTBS retain existing sequence behavior with a diagnostic; they need explicit adapters before Reactor can own their choreography. Their syntax inspired the builder but is not imported. Retaining Scene_Battle helps HUD integration; it does not establish compatibility with every MOG or third-party plugin configuration.

Current room limitations include dynamic shadow integration, plugin fog/overlays, map-dependent plugin commands and full performance profiling. Map and model media surfaces are supported, as described below. A room reproduces the implemented tiles/models/lights/effects, not every exploration renderer extension. The presentation also retains a canvas copy into the battle display; dense-room performance needs measurement.

## Verification

`editor/tests/battle-presentation.test.cjs` covers schemas, save rollback/recovery, assignments, pure evaluation, timing, repeats, cancellation, camera inheritance, facing and invalid loading frames. `editor/tests/smoke/nw-battle-presentation.cjs` runs against a disposable Demo copy and actual assets: editor preview, room setup, assignment layout, save/reopen, the reactor room with the enabled battle/HUD stack, two resolver calls for a two-repeat attack, local room movement/self switches, exploration return/cleanup, and an orthographic room with an actual character sprite and 3D enemy. It rejects missing-file, zero-size texture and WebGL errors.

The complete counter/reflection/substitution and victory/defeat/escape/abort/plugin combinations remain a broader compatibility matrix. The current native test establishes its stated fixtures; it does not establish all of those combinations or a full-game playthrough.

`editor/tests/smoke/nw-unarmed-punch.cjs` exercises real rendered Fleagus skeleton movement, attack-side approach, one impact at contact, return facing/home restoration, exact editor scrubbing and the separate actor assignment in a disposable Demo copy.

`editor/tests/smoke/nw-sequence-authoring.cjs` checks actual canvas resolution and bounded layout at three window sizes, independent target dragging, shared ring pointer gestures, per-axis scale, and save/reload. `RR_SEQUENCE_TRANSFORM=1 node editor/tests/smoke/nw-unarmed-punch.cjs` verifies a rendered stretched/offset punch and restoration after the action.


### Media steps and room presentation (2026-09-06)

**Show Animation** opens the shared searchable animation picker with a live preview. X/Y offsets use map tiles; Z is height and Scale multiplies the animation’s own size. These settings affect the sequence preview and battles, including sprite-sheet fallback animations. The source database animation is unchanged. Hit Physical and other animations play their authored sound timings in the preview as well as battle.

**Play Sound → Choose Sound…** opens the shared audio picker. The inspector shows the filename and a read-only volume/pitch/pan summary; edit all three in the picker. New sound and animation steps start with **Wait (frames): 0**, letting subsequent steps continue immediately. **Wait for Sound / Wait for Animation** optionally holds the sequence until that cue finishes, then applies the specified frame wait. Existing saved durations remain intact. Play Step lets the selected media finish; full preview playback lets trailing media finish even after the final timeline frame. Pause, Reset, selection changes and disposal own their preview media. Skip still applies the action effect exactly once, and cancellation does not apply outstanding hits.

Battle rooms play each prop’s selected animation queue and attached media surfaces, using its saved speed, repeat, anchor, rotation and dimensions. Map and model lights use the shared pulse/flicker calculation. Each room owns and disposes its media; image/video textures attach only after valid dimensions are available. The 3D Models editor now previews additional media surfaces immediately, including PNGs, and follows the selected surface’s unsaved placement.

The embedded Troops preview draws **E1, E2, …** at the same saved positions used by Set Up Room. Drag a marker or enemy model to place it directly. This edits the troop’s Battle Presentation formation, preserving legacy troop image coordinates. Pointer capture and a fixed camera during the drag keep third-person placement stable; pointer cancellation restores the previous position.

In battle, published sprite positions, home positions, dimensions and enemy screen coordinates follow the projected room battler. Source bitmap frames remain intact. The MOG Battle Cursor adapter uses the model’s projected bounds and converts into the cursor’s parent coordinates, including above/center/side alignment and authored cursor offsets. Ordinary battles retain their existing positioning behavior. Other plugins receive standard projected sprite coordinates; plugins that maintain independent private placement caches can still require adapters.
