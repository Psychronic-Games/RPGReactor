# Rigging a 3D model

Database › 3D Models › **Rig** fits a skeleton to a static model so motions and Pose Parts work on it. Models that ship their own skeleton (Mixamo, VRM) map the rig onto their bones instead.

## Markers

Pick a template (Humanoid, Quadruped, and others), then drag each marker onto the joint it names. Left and right markers mirror. The yellow chain draws marker to marker so the skeleton reads as connected. **Save rig** writes the markers and, with a skeleton, computes skin weights so the bones become poseable parts; **Reset markers** and **Remove rig** do what they say. Unsaved markers, face points and effects are marked on their Save button and in the status line; OK and Apply save them, Cancel and leaving ask first.

The humanoid template marks the head, chin, hips, shoulders, elbows, wrists, knees and ankles, and on each hand a **palm** centre plus a **base** and **tip** for the thumb and each finger. Held weapons sit at the palm; the finger markers say where the hand ends and which way it closes. A rig saved before these markers existed keeps what was placed and derives the hand from its own elbow and wrist.

A humanoid with no saved rig opens with its markers already placed: on its own skeleton's bones when it has one (Mixamo, VRM, VRoid, Unreal, Rigify, Daz, Biped names), else read from its shape, fingers and thumb included. **Auto-place markers** does it again at any time and asks before replacing markers you placed. The status line names the parts it guessed, and those markers have a white rim until you move them. A saved rig is never changed unless you press Auto-place markers and save.

## Things held in a hand

A sword, a tool or a gun takes a rig of markers only: no bones, nothing to bind. The **Blade or tool** template marks **Grip top**, **Grip bottom**, **Tip** and **Edge**; the **Gun** template marks **Grip top**, **Grip bottom**, **Trigger finger**, **Muzzle**, **Rear**, **Fore grip** and **Stock**. Muzzle, Rear and Stock snap to the model's middle plane. Saved as `rig: { template, markers }`.

A marked model is held by what its markers say instead of by its shape: the hand closes between Grip bottom and Grip top, the blade runs to Tip with Edge leading, a gun points from Rear to Muzzle and the index finger rests at Trigger finger. A model without markers is still read by its shape.

## Placing markers precisely

- The model holds its rest pose in rig mode. Markers describe the bind pose, so an idle clip does not play while they are placed.
- The wheel zooms toward whatever is under the pointer, close enough to fill the view with a fingertip. Shift-drag or the middle button pans. Markers keep one size on screen; their names grow as the camera comes in.
- A dragged marker snaps into the model under the pointer, at the middle of the limb or body the pointer's ray passes through, so its depth is right from every angle. Off the model it slides across the camera plane.
- A marker inside the model draws solid; one floating outside draws faint. The marker under the pointer swells before you grab it.
- Finger names show once the camera is close and never draw over one another; hover a marker to see its name whenever it is hidden.

## What the runtime reads

The rig lives in the model's sidecar (`model.json`) as `rig: { template, markers, bones, weights }`. The game uses the markers for the hand: the palm point is where a held weapon's grip goes, and the finger bases and tips give the knuckle line and fingertips. Each finger and thumb with a base and a tip marker also becomes two joints, made when the model loads, which close on what the hand holds. A finger is the mesh surface that grows from its tip, and fingers the mesh does not separate close as one. Without markers those come from the hand and forearm joints. See [BATTLE-PRESENTATION.md](BATTLE-PRESENTATION.md) for how sequences hold, aim and pose a rigged model.

## Motions a rig gives a model

A rigged humanoid plays a built-in motion for every movement state it has no animation of its own for: Breathe when idle, Walk, Run while dashing, Jump in the air, Swim (a front crawl) through deep water, Tread Water when still in it, and Climb on a ladder. A quadruped gets an idle sway and a walk. The Animations list shows which ones are in use ("Rig defaults: …"), and its switch turns them off (`defaultMotions: false` in `model.json`). A clip in the model's file named for a state plays in it without being added, rigged or not: Walk or Walking, Run, Running or Sprint, Idle or Breathe, Jump, Swim, Tread, Climb, Ride (a trailing number, "Loop" or "In Place" may follow, as in Idle_9). Its row under Embedded clips says when it plays. An animation in the list set for a state wins over both.

**+** (Animations) and **Motions…** open **Add a motion**. For a rigged humanoid it leads with the motion capture of Forge › 3D Character Builder (the shared motion library: Walking, Running, Jumping, Falling, Rolling, flips, climbing, swimming, fighting stances and strikes, sitting, lying, waving...), fitted to the character with nothing to animate. Each says when it plays (its state, suggested; a click on that line changes it), ▶ plays it on the model beside the panel, and one button adds it; for a state that already has an animation it reads **Use instead of …** and replaces it (a hand-keyed Jump gives way to the captured one). The preview turns to that state. A hand-keyed motion in a state the capture covers says so in its row ("in place of the motion capture"). **Make your own** below (**+ Pose it yourself**) opens a new motion in the Motion editor.

On a model with no motion capture, Motions… opens the hand-keyed starting points instead: ready-made motions for the model's template. For a humanoid: the movement states above, gestures (Wave, Take a Bow, Nod, Shake Head, Hop), stances that hold until another stance replaces them (Guard, Aim Rifle, Aim Pistol, Dual Wield, Lower Arms, Sit) and strikes (Overhead Strike, Slash, Thrust). Quadrupeds, plants and vehicles have their own (Pounce, Wind Sway, Rustle, Roll, Bounce). Each lands as one editable motion.

## The Motion editor

A motion is every pose rule in the Animations list that shares a name: one row, however many parts it moves. Clicking the row opens the Motion editor under the model:

- **Top bar:** ▶ (play from the first pose; ❚❚ pauses back on the card shown), the name, when it plays (On demand, or While idle, walking, dashing, jumping, swimming, treading water, climbing), Repeat, **Stance** (take the pose and keep it), the length it adds up to, and ▶.
- **Storyboard:** the motion's poses as numbered cards in a row, each the whole body at that moment, with a step card between each two: the seconds from one to the next and how that step goes. Click a step for its timing: the seconds (− and + nudge by 0.05; every pose after it moves) and its pace, each with a picture of its curve: **Smooth** (flows on through the pose, the default), **Steady** (one speed), **Start slow**, **End slow**, **Slow both ends** (stops at the pose), **Snap** (gets there almost at once, then holds) and **Overshoot** (goes past and settles back). A pace picked plays the motion from that step. While a step is picked nothing on the body bends (no rings, arrows or part to pick): click a pose card to bend again. It is saved as `ease` on the keys the step arrives at (`steady`, `in`, `out`, `both`, `snap`, `overshoot`). Click a card to see that pose on the model; **+ Next pose** adds a copy of it 0.3 s on, to change. After the last card, the seconds back to the first pose (a repeating or state motion). A one-off motion ends on its last pose (a new last pose is the end) and, in the game, eases back to rest over a fifth of a second after it; the number after its last card is any time spent going back to rest inside the motion, 0 for none. **Flip pose ⇆** swaps left and right in the pose shown, as in a mirror; **Flip motion ⇆** does it to every pose, so a motion made with the left hand becomes the same with the right. A side new to the motion rests in the poses that were not flipped. The flip goes through the model's own joints, so a rig whose right arm is rolled unlike its left still lands mirrored. **Copy**, **Paste** and **Delete pose** work on the pose shown.
- **Bend a part:** click a body part on the model; it lights up with three rings and three arrows on it, red, green and blue. Drag a ring to turn the part about that axis, or an arrow (past the rings) to slide it; the sliders beside the storyboard follow, switching to **Rotate** (Bend red, Turn green, Tilt blue) or **Move** (Side, Up, Forward: the whole model's jump height, say) for what you grabbed, and the switch above them picks either by hand. **Reset** puts it back to rest in that pose. A part first bent in a later pose stays at rest in the earlier ones.
- **Fine timing…** shows the per-part timeline: one row per part with its own keys, to time a part on its own (**+ Part…**, **Add key**, **Delete key**, the length in seconds; a spin, swing or bob in the motion is listed there and opens on its own card). **← Storyboard** goes back.
- With a motion open, a state button under the model shows that state (its own state plays the motion through); picking a motion in the list turns the preview to its state.

Motions save as ordinary pose rules in `model.json` › `animations` (`{ name, part, type: "pose", trigger, period, keys: [{ at, rotate, move }] }`, `period` half the length in frames), so a file written by hand or by a generator opens in the editor the same way.

## Pose axes

Rotations are in degrees about the model's own axes, with the character facing +Z and its right side at -X, applied Z first, then Y, then X. A part's pose is in these axes too, whatever its parent does.

- A limb swings forward on -X; a knee or elbow bends on +X.
- An arm lifts out to the side on -Z (right) or +Z (left). Lifting it far overhead that way folds skinned shoulder armour; raise it forward (-X) instead.
- The torso and head lean forward on +X and turn left on +Y.
- Y turns an arm about its length only if the rest pose hangs it straight down. On an A-pose model, Y also moves the arm, and after a twist no single axis moves the hand straight sideways. Wave's keys are the turn it needs worked out per key.

Between keys a motion follows a smooth curve: it slows only where it turns back or holds, never overshoots a key, and a looping motion runs through its end without pausing.

## Variants

A model can have variants: the same model worn several ways. Database › 3D Models › **Variants** lists **Model's own** and each variant; **+** adds one, and a row opens its card (Color, Texture, Surface, Effects; the name is changed in the card's title, delete is on the row, changes save as they are made). The preview wears the selected variant until the chip under the tools is clicked. Renaming a variant renames it in every effect's list; deleting one removes it, and an effect only it wore shows in no variant until Shown in is changed. In play, changing a model's variant adds and removes its effects. Model's own holds the model's Surface. A variant can change **Color** (Colorize: one color over the model's own light and dark, with Strength and Lightness; Adjust: hue, saturation and brightness of what is there), **Texture** (a picture in the model's `textures` folder), **Surface**, and what each media surface shows (or off). What a variant leaves alone is the model's. Choose the variant where the model is used: an event page, a placed model, a Database binding. One color recolors the whole model; different colors per part need a replacement texture. Scripts: `Reactor3D.setModelVariant(character, "Name")`, `""` for the model's own.

## Surface

The **Surface** section (under Effects) has a Reflections switch; switched on: Reflection (how much of the world it mirrors), Gloss (1 a clean mirror, lower blurs it), Metal (1 reflects as strongly face on as at an angle, as chrome does; 0 only at glancing angles, as paint does), Texture (how much of the model's own texture shows under the reflection: 0 a mirror, 1 a clear lacquer) and a Tint for the reflection. Chrome, Polished, Glossy, Gold and Brushed are starting points. It is saved as `model.json` › `surface` and applies wherever the model is placed. Nothing reflects until it is switched on; a model whose file is polished metal starts from the file's own values.
