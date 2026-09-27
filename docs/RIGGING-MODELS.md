# Rigging a 3D model

Database › 3D Models › **Rig** fits a skeleton to a static model so motions and Pose Parts work on it. Models that ship their own skeleton (Mixamo, VRM) map the rig onto their bones instead.

## Markers

Pick a template (Humanoid, Quadruped, and others), then drag each marker onto the joint it names. Left and right markers mirror. The yellow chain draws marker to marker so the skeleton reads as connected. **Bind rig** computes skin weights and the bones become poseable parts; **Reset markers** and **Remove rig** do what they say.

The humanoid template marks the head, chin, hips, shoulders, elbows, wrists, knees and ankles, and on each hand a **palm** centre plus a **base** and **tip** for the thumb and each finger. Held weapons sit at the palm; the finger markers say where the hand ends and which way it closes. A rig saved before these markers existed keeps what was placed and derives the hand from its own elbow and wrist.

## Placing markers precisely

- The model holds its rest pose in rig mode. Markers describe the bind pose, so an idle clip does not play while they are placed.
- The wheel zooms toward whatever is under the pointer, close enough to fill the view with a fingertip. Shift-drag or the middle button pans. Markers keep one size on screen; their names grow as the camera comes in.
- A dragged marker snaps into the model under the pointer, at the middle of the limb or body the pointer's ray passes through, so its depth is right from every angle. Off the model it slides across the camera plane.
- A marker inside the model draws solid; one floating outside draws faint. The marker under the pointer swells before you grab it.
- Finger names show once the camera is close and never draw over one another; hover a marker to see its name whenever it is hidden.

## What the runtime reads

The rig lives in the model's sidecar (`model.json`) as `rig: { template, markers, bones, weights }`. The game uses the markers for the hand: the palm point is where a held weapon's grip goes, and the finger bases and tips give the knuckle line and fingertips. Without markers those come from the hand and forearm joints. See [BATTLE-PRESENTATION.md](BATTLE-PRESENTATION.md) for how sequences hold, aim and pose a rigged model.

## Motions a rig gives a model

A rigged humanoid plays a built-in motion for every movement state it has no animation of its own for: Breathe when idle, Walk, Run while dashing, Jump in the air, Swim (a front crawl) through deep water, Tread Water when still in it, and Climb on a ladder. A quadruped gets an idle sway and a walk. The Animations list shows which ones are in use ("Rig defaults: …"), and its switch turns them off (`defaultMotions: false` in `model.json`). A motion or clip the model has for a state always wins.

**Motions…** adds a ready-made motion for the model's template. For a humanoid: the movement states above, gestures (Wave, Take a Bow, Nod, Shake Head, Hop), stances that hold until another stance replaces them (Guard, Aim Rifle, Aim Pistol, Dual Wield, Lower Arms, Sit) and strikes (Overhead Strike, Slash, Thrust). Quadrupeds, plants and vehicles have their own (Pounce, Wind Sway, Rustle, Roll, Bounce). Each lands as one editable motion.

## The Motion editor

A motion is every pose rule in the Animations list that shares a name: one row, however many parts it moves. Clicking the row opens the Motion editor under the model:

- **Top bar:** the name, when it plays (On demand, or While idle, walking, dashing, jumping, swimming, treading water, climbing), its length in seconds, Repeat, and **Stance** (take the pose and keep it).
- **Tracks:** one per part it moves, with its keys on a shared timeline. **+ Part…** adds one, and so does a click on the model. A spin, swing or bob in the motion is listed and opens on its own card.
- **Playhead:** click or drag the timeline to scrub; the model shows that moment. ▶ plays it. Drag a key to retime it.
- **Pose:** X, Y and Z sliders for the selected part at the playhead (Lift too for the whole model). Moving one keys the part there, adding a key between keys if needed; **Delete key** removes it.

Motions save as ordinary pose rules in `model.json` › `animations` (`{ name, part, type: "pose", trigger, period, keys: [{ at, rotate, move }] }`, `period` half the length in frames), so a file written by hand or by a generator opens in the editor the same way.

## Pose axes

Rotations are in degrees about the model's own axes, with the character facing +Z and its right side at -X, applied Z first, then Y, then X. A part's pose is in these axes too, whatever its parent does.

- A limb swings forward on -X; a knee or elbow bends on +X.
- An arm lifts out to the side on -Z (right) or +Z (left). Lifting it far overhead that way folds skinned shoulder armour; raise it forward (-X) instead.
- The torso and head lean forward on +X and turn left on +Y.
- Y turns an arm about its length only if the rest pose hangs it straight down. On an A-pose model, Y also moves the arm, and after a twist no single axis moves the hand straight sideways. Wave's keys are the turn it needs worked out per key.

Between keys a motion follows a smooth curve: it slows only where it turns back or holds, never overshoots a key, and a looping motion runs through its end without pausing.

## Surface

The **Surface** section (under Effects) has a Reflections switch; switched on: Reflection (how much of the world it mirrors), Gloss (1 a clean mirror, lower blurs it), Metal (1 reflects as strongly face on as at an angle, as chrome does; 0 only at glancing angles, as paint does) and a Tint for the reflection. Chrome, Gold, Glossy and Brushed are starting points. It is saved as `model.json` › `surface` and applies wherever the model is placed. Nothing reflects until it is switched on; a model whose file is polished metal starts from the file's own values.
