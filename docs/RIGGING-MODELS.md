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
