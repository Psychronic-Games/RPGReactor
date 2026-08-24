# RPG Reactor 0.98.3: Rig It Yourself

RPG Reactor-owned code is MIT-licensed. Bundled third-party components retain
their respective licenses as recorded in `THIRD_PARTY_NOTICES.md`; the project
does not claim one uniform license for third-party or user/project content.

0.98.3 is the release where Reactor's 3D stopped being a place you put finished
models and became a place you make them move. You can now drop a static model
into your project, fit a skeleton to it with a handful of draggable markers,
press Bind, and walk away with a rigged character that plays a library of
ready-made motions — all inside the editor, no Blender, no Mixamo, no
round-trips. The weekend that closed the cycle also wired 3D through the whole
database, taught the engine to load models before you can notice, and fixed a
long list of the small frictions that make a feature feel finished.

The full detail is in the changelog; this is the tour.

## Rigging, in the editor

The Database 3D section grew a Rig tool. Pick a template — Humanoid (17
bones), Quadruped, Plant/Tree, or Vehicle — and the viewport shows labeled
joint markers you drag onto your model's joints; left and right sides mirror
automatically. Bind computes skin weights on the spot: a 30k-vertex character
binds in a fraction of a second, and a 1.6-million-vertex stress-test
character from an AI generator binds in six and previews its walk at full
frame rate.

Every bone becomes an ordinary part on the pose card, which means everything
Reactor's animation system already did — poses, swings, held stances, timed
effects, undo — now drives skeletons too. On top of that sits the **Preset
Motions** library: Walk and Run with proper counter-swinging gaits, Breathe,
Wave, Nod, Sit, Jump with real airtime, Swim and Float, Slash, Thrust and
Overhead Strike, held Aim Rifle / Aim Pistol / Dual Wield / Guard stances with
Lower Arms to stand down — plus quadruped, plant, and vehicle sets. Applying
one drops plain, editable rules into your model, and on-demand poses can carry
keyframe timelines captured straight from the sliders.

Models that ship their own animations join in too. A GLB's embedded clips are
now listed right in the Animations panel — playable with one click, adoptable
as ordinary animations with a speed control. A skinning fix along the way
means centimetre-rigged exports (the Meshy/Mixamo convention) play cleanly
instead of shredding, and a properly exported model needs no facing marks at
all: the engine reads its export orientation, and the marks remain as a manual
override.

## 3D through the whole database

Events could already carry models. Now the database can. Actors bind a model
**per surface**: the map character, the face portrait, and the side-view
battler are each independently 2D or 3D — a game can keep painted faces over a
3D world, or go all-in. Bound enemies render as live 3D battlers in battle. A
3D face is framed with zoom and height sliders right in the picker and drawn
as a lit portrait wherever that actor's face appears. Weapons, armor, and
items take bindings too, with a mini model preview beside their icon.

All of it lives in `data/Database.r3d.json` next to the MZ files — the same
sidecar pattern as maps — so an RPG Maker editor opening the project never
sees a field it doesn't know. A bound actor or enemy needs no 2D art on disk
at all.

The model library itself got room to breathe: the `3d/` folder nests freely
(`3d/Weapons/long-sword/…`), and model lists show collapsible folders so a
large library stays scannable.

## Fast enough that you don't see it

A performance program closed the cycle. Every model a map can show now loads
during the loading fade — the scene waits for them, the renderer pre-compiles
their shaders and uploads their textures behind the fade, and GLB parsing plus
texture decoding run in a background worker so even huge files never freeze
the game or the editor. Rig weights moved out of `model.json` into a compact
binary sidecar, turning what was once a 16MB JSON parse into effectively
nothing. The result is simple to describe: models are just *there* when the
map appears, and the first seconds of play don't stutter.

## Not just 3D

- **Audio formats**: BGM, SEs and the rest can ship as MP3, WAV, or FLAC
  alongside OGG, with per-format loop tags and album art. Every audio picker
  was rebuilt in the Audio Player's interface, and deployment compresses all
  formats through one checkbox and a quality choice.
- **Editor quality-of-life**: class parameter curves author the full 1–999
  level range; an app-wide pass tightened modals, responsiveness, and layout
  gaps; the event editor got themed fields and clearer controls; image pickers
  gained a (None) choice; the deploy dialogs follow the editor language; the
  map grid stays complete at every zoom.
- **PixiJS 8.20** across the editor and runtime, verified against
  plugin-heavy MV-compatibility projects.

## What's next

The 3D suite is not finished — a weight-painting brush, more skeleton
templates, clip retargeting, and texture compression are all on the board.
But the distance covered this cycle is the difference between "Reactor can
display models" and "Reactor is where you make them yours." If you try the
rigging on your own models, I'd genuinely like to hear how it holds up.

Downloads are at <https://psychronic.itch.io/rpg-reactor>, source and issues
at <https://github.com/Psychronic-Games/RPGReactor>.
