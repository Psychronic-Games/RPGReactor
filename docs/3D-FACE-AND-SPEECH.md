# Model face points, speech and prop playback

Existing projects receive runtime updates through the normal project runtime
sync.

## First-person characters

First-person cameras use the player's model eye point, including its height,
scale, facing and animated bone position. Without an eye point, the camera uses
an estimate near the top/front of the fitted model. Without a model, it retains
the standard character eye-height fallback. The player's 3D body and followers
remain visible; looking down reveals the body.

In **Database → 3D Models**, select a model and click the **eye icon** for
**Face points**. Choose **Eyes / camera** or **Mouth**. **Follow** chooses the
bone or part the point follows. **Save face points** saves both. Editing uses
the rest pose and preserves the skeleton, weights, carved parts and other
sidecar fields.

Eyes is one marker: drag it, drag its axis arrows, or open **Advanced** for
X/Y/Z.

Mouth is a ring of eight markers around the lips, with the lip line drawn
across it. Drag a marker onto the lip edge; it lands on the model's surface.
The left and right sides mirror; hold **Alt** to move one side alone. Drag the
middle dot to move the whole mouth. **Shift**-drag a marker to resize the ring.
Only what lies inside the ring moves, so the ring sets the mouth's size: the
lower markers set how far down the lower lip can travel. **Mouth opening**
scales how far it opens. **Mouth interior** and its color fill the opening.
**Preview mouth** shows the result with the same geometry the game uses.

A model saved before outlines shows a ring worked out from its three points.
It is not saved until **Save face points**.

The optional top-level `model.json` field uses bone/part-local coordinates:

```json
"landmarks": {
  "eyes": { "part": "Head", "offset": [0, 0.1, 0.08] },
  "mouth": { "part": "Head", "offset": [0, 0, 0.1], "interior": "dark", "interiorColor": "#080808", "open": 1,
    "outline": { "cornerL": [0.03, 0, 0.09], "upperL": [0.015, 0.008, 0.1], "upperM": [0, 0.01, 0.1], "upperR": [-0.015, 0.008, 0.1],
                 "cornerR": [-0.03, 0, 0.09], "lowerR": [-0.015, -0.008, 0.1], "lowerM": [0, -0.01, 0.1], "lowerL": [0.015, -0.008, 0.1] } },
  "upperLip": { "part": "Head", "offset": [0, 0.01, 0.1] },
  "lowerLip": { "part": "Head", "offset": [0, -0.01, 0.1] }
}
```

`outline` is in the mouth part's coordinates; left and right are the
character's own. `open` is 0 to 2 and may be omitted. `offset`, `upperLip` and
`lowerLip` are written from the ring. A model with no `outline` uses the three
points.

Those numbers are examples, not defaults for every model. Bone coordinate
units differ between imported assets. Missing named bones are ignored rather
than reinterpreting their offsets at the model's feet.

## Spoken dialogue

Use **Events → Reactor 3D → Speak 3D Dialogue**. Select the speaking event,
player or follower and choose a voice clip under `audio/se`. Volume, pitch and
pan are edited in the voice picker; reopening it preserves all three values.
The command controls voice playback and mouth animation only. For dialogue,
uncheck **Wait for voice to finish**, then add a normal **Show Text** command
with the speaker and message. The voice can play alongside that message;
closing the message does not stop the voice. With waiting enabled, the next
event command runs after audio ends. **Stop** ends the target's voice and
resets its mouth. Scene exit also cleans up speech.

Legacy `speaker`/`text` arguments are ignored at runtime and removed when the
command is edited and accepted. Move any previously embedded dialogue into
Show Text. Existing project event data is not rewritten automatically.

Speech prefers an existing `mouthOpen`, `jawOpen` or `viseme_a`/`viseme_aa` morph,
then a Jaw/LowerJaw bone. Otherwise the mouth outline generates a lip morph on
that model instance: triangles are split along the lip line, the lower lip
drops and the upper lip rises a quarter as far, and nothing outside the ring
moves. A dark, inset lining fills the opening; **None** leaves it unfilled.
The morph is generated once per instance; the source model stays unchanged. A
model with three points and no outline uses the older fallback.

Preview the
result: a ring on the chin opens the chin, and a point in empty space cannot
find a mouth surface. The generated opening is a stylized fallback for ordinary
front-facing character meshes, not an anatomical reconstruction. It does not
generate teeth or a tongue, infer the intended gum line from a texture, or
replace a properly authored human mouth. For close-up human characters, supply
an open-mouth morph or jaw rig with teeth, tongue and inner-mouth geometry in
the asset. Existing mouth morphs and jaw rigs retain their own interiors.

The September 6 fix refreshes skinned bind transforms before capturing the
speech rest pose. Previously the mascot's fresh imported mesh was sampled at
the wrong scale, selecting no mouth vertices even with saved face points.

Movement follows the audio's amplitude envelope, closing during silence and
following playback pitch and the audio clock. It is **not phoneme recognition**.
PCM analysis and fallback morph creation happen once; each frame samples the
cached envelope and changes the morph weight or jaw angle. Current speech
animation integration targets models rendered in the 3D map scene.

For a separate voiceover system, attach its actual WebAudio buffer:

```js
Reactor3D.Speech.attach(character, voiceBuffer);
Reactor3D.Speech.play(character, { name: "voices/hello", volume: 90, pitch: 100, pan: 0 });
Reactor3D.Speech.stop(character);
```

`attach` does not take ownership of external audio playback. Arbitrary sound
effects do not make every character talk.

## Prop playback in either map mode

Placed prop animation sequences and active light effects survive main-menu
return. Playback pauses across reconstruction; completed one-shot animations
and explicit stops stay stopped. The 2D model sprites use the same action,
repeat and timed-effect driver as the 3D scene.

A placed model's **Playback** card (Build bar › Models) includes **Speed (%)**: 100 is normal,
50 is half speed, 200 is double. Values range from 1 to 1000. Speed belongs to
the placement, so it does not change the model's shared animation definition.
Use **Set Model Animation Speed** to select a map prop and change its speed
during play without restarting its current action. The override also applies
to subsequent animations on that instance and is stored on the character.
The scripting equivalent is `Reactor3D.setModelAnimationSpeed(character, 175)`.
Old placements without `animationSpeed` use 100%.

2D maps show orthographic model sprites, anchored effects and carried lights.
Ambient tint is converted into display brightness. Point/spot/beam overlays
use soft, translucent falloff; 2D cones include their own tapered silhouette.
This is a flat approximation, not the 3D renderer's surface lighting or shadow
atlases. Native and carried lights retain color, direction, flicker and pulse.

On supported shared WebGL contexts, 2D model sprites sample GPU render targets
directly. Canvas copying remains a compatibility fallback. Offscreen models
keep their playback/effect state but skip bitmap drawing, and catch-up game
ticks skip redundant draws. Model texture size and animation speed are retained.


Animated 2D models use cached part/bone bounds to grow their render area when
needed. Growth preserves the ground anchor and pixel density until the GPU's
texture-size limit (capped at 4096); exceptionally large extents fit within
that limit. Bounds do not shrink again during the instance's lifetime.
This avoids repeated allocation while limbs move. Offscreen culling includes
the sprite's centered frame and lift. Raised model sprites have a separate
height-aware drawing depth, including when a plugin replaces tile sorting.
Normal tile/event priority layers still take precedence.
