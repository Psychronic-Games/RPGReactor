# Building 3D worlds from 2D tilesets

Written 2026-08-01; implementation status reviewed 2026-09-21. Everything the
phasing table lists has shipped, in a different shape from the proposal: the
Block primitive became the Build bar's **pieces and shapes**, "structures:
draw once, stamp anywhere" became **blueprints** (`3d/Structures/*.json`,
stamped from the bar), and direct manipulation is the bar's select, box-select,
drag, turn and specs panel. The height brush was built and removed; rolling
ground is the **3D-T** terrain brushes instead. Where each of these lives, and
what checks it, is in [AUTHORING.md](AUTHORING.md); the verified state is in
[STATUS.md](STATUS.md).

The proposal sections below preserve the original problem analysis and intended
authoring model. They are not a list of currently available tools. The phasing
table, current data contract, and lighting section state what exists now.

## Original diagnosis and proposal (2026-08-01)

The 0.96.0 renderer inferred shapes from two-dimensional tiles. The following
problems motivated explicit shape/material authoring. Wall faces, roof pairing,
and Panels have since been implemented; the height-brush proposal was dropped.

### Problems in the original renderer

Not the rendering. The rendering does what it was told; it is being told too
little, and guessing the rest.

**A prop with a facing is drawn as a billboard.** Anything on A5 or B–G that
stands becomes a camera-facing cut-out (`uprightObjects` → billboard group).
That is correct for a rubbish heap, a bush or a boulder, which look much the
same from any side. It is wrong for a gate, a door, a signpost or a shopfront,
which have a front — and the failure is not subtle, because the object rotates
to follow the camera and a gate you were walking *through* turns to face you.

**A building is one plane.** A wall run emits a single quad at the southern end
of the run (`zFace = run.southY + 1`), facing south. From the north a building
is inside-out; from the east or west it is a line. The 0.96.0 note calls this
"walls raise the ground into a mass", which is true of A1–A4 terrain going
through the scenery path, but the wall-run path is still one south-facing
plane.

**There is no way to say what a thing is.** The classification file records four
classes — Flat, Upright, Scenery, Foliage — which describe *how a tile behaves*,
not *what shape it is*. There is no vocabulary for "this is a box two tiles
tall whose top is that roof tile", so there is no way to author one.

The through-line: the tileset says what art exists, the map says where it was
painted, and nothing anywhere says what any of it *is in three dimensions*.

### Proposed separation of massing and dressing

**Separate massing from dressing.**

- **Massing** is the built volume of the world: ground, terraces, cliffs,
  building shells, walls. It comes from a height field, which already exists —
  `sidecar.elevation`, one number per cell. Painted, not inferred.
- **Dressing** is what sits on the massing: props, doors, gates, furniture,
  foliage. Placed per cell, with a shape and a facing.

Today both are inferred from the same signal (impassability), which is why a
crater stands up like a rock and a gate spins like a bush. Separating them is
most of the fix, and it costs little because the height field is already in the
sidecar and already read by the renderer.

### Proposed primitive set

Five shapes, replacing the current four classes. A tile is assigned one, once,
per tileset.

| Shape | What it is | Right for |
|---|---|---|
| **Ground** | a flat quad on the cell | floors, roads, water, painted markings |
| **Mass** | the cell's ground raised to its height; sides take wall art, top takes roof art | terrain, cliffs, building shells, city blocks |
| **Block** | a free-standing box within the cell, with its own height and per-face art | crates, plinths, low walls, furniture |
| **Panel** | a thin upright quad with a real facing and a little thickness | gates, doors, signs, fences, banners |
| **Billboard** | a camera-facing cut-out | trees, bushes, heaps, rocks, anything amorphous |

At proposal time, Mass, Billboard, and Ground already existed; Block and Panel
were new work. Panel is implemented; Block shipped as the Build bar's pieces and shapes in 0.98.7.

A Panel is not a billboard with rotation disabled — that was tried before
0.96.0 and abandoned because a fixed plane vanishes edge-on. It vanishes
because it has no thickness. Give it one (a tenth of a tile is enough), cap the
edges by sampling a column of its own art, and edge-on it reads as a gate seen
side-on, which is what it should look like.

## Where facing comes from

This is the part that decides whether the system is pleasant or a chore. Four
sources, tried in order; the author only ever touches the last one.

1. **Autotile shape.** A wall autotile's shape index *is* an exposed-face mask,
   already stored in every wall tile on every existing map. From
   `calculateWallAutotileShape`, verified against MZ-authored maps:

   | bit | value | meaning |
   |---|---|---|
   | 0 | 1 | no neighbour west |
   | 1 | 2 | no neighbour north |
   | 2 | 4 | no neighbour east |
   | 3 | 8 | no neighbour south |

   `WALL_AUTOTILE_TABLE` has exactly 16 entries because a wall shape is decided
   by four neighbours, one bit each. So every wall cell on every map already
   states which of its sides face open air — precisely what is needed to
   texture a box and skip its interior faces. It needs no authoring, no new
   data and no migration: the information has been sitting in the map files all
   along, and the renderer currently reads one bit's worth of it (the south
   face) and discards the rest.

   One honest caveat: the bits mean "no neighbour *of this kind*", not "exposed
   to air", so a wall meeting a different wall kind reads as exposed. For
   texturing a face that is almost always right — the two kinds are different
   materials and the seam belongs there — but it is a guess at a corner where
   an author butted two building styles together.

2. **The wall it is set into.** A gate in a wall faces the way the wall faces.
   A door in a shopfront likewise. When a Panel's cell abuts a Mass cell, take
   the Mass face's normal.

3. **The open side.** Failing both, face the direction with the most passable
   neighbours — the side you can approach from.

4. **Authored.** A facing handle in the 3D view: select, press a key, it turns
   ninety degrees. Stored per placement in the map sidecar.

Rules 1 and 2 cover the overwhelming majority and cost the author nothing. That
is the difference between "3D works" and "3D is a second map to maintain".

## Per-face art

A Mass or Block needs art for faces the tileset never drew as such. Extend the
classification store — which already has a `standIns` map for "this tile takes
its picture from that tile" — into a small **material** per tile:

```
material: { top: <tileId>, side: <tileId>, edge: <tileId> }
```

Absent entries fall back, in order, to: the paired roof (derivable on A4, where
a wall kind's roof is the kind eight rows above it), the tile's own art, and
finally a shade of the tile's average colour. The wall-top problem in the
handoff is this feature's first customer.

## Authoring proposal and current disposition

Four tools were proposed. The height brush was built and removed; the other
three shipped in 0.98.7 as the Build bar, blueprints and the bar's selection
tools, described in [AUTHORING.md](AUTHORING.md).

**1. A height brush, in the map editor (removed).** The proposal was to paint elevation the way tiles are
painted: a number, a brush size, drag to raise. The 3D view updates live. This
is the single highest-value tool in the plan — with Mass tiles and derived
facing, painting height is enough to build a city, and it is the literal answer
to "build in 3D using the tiles".

**2. Structures: draw once, stamp anywhere (shipped as blueprints, 0.98.7).** A structure is a named,
multi-cell 3D object defined against a tileset — footprint, height per cell,
shape per cell, art per face. Define "guard tower" once; stamp it forty times.

The compatibility trick that makes this safe: **stamping writes both.** It
writes ordinary tiles into `Map###.json` — so the map is a valid 2D map, the
passability is real, the events work, RPG Maker itself can open it — *and* an
entry into `Map###.r3d.json` recording that those cells are one structure. The
2D map is not a lossy shadow of the 3D one; it is the same map, and the sidecar
says how to read it in three dimensions.

**3. A shape mode in the tileset editor.** Tileset classes, Panels, per-face
materials, and roof pairing exist; the Block primitive shipped as the Build bar's pieces and shapes (0.98.7). This is the once-per-tileset
setup that everything else rests on.

**4. Direct manipulation in the 3D view (shipped, 0.98.7).** Models, events and
placed pieces have transform controls; the Build bar selects, box-selects,
drags, turns and paints pieces in place, and a selected shape wears the same
arrows, rings and size cubes the models do.

## Current data and compatibility

Reactor retains RPG Maker's map grid and database organization. Its 3D geometry,
model bindings, and poses primarily live in sidecars:

```text
Tilesets.r3d.json     tile classes, materials, and tileset object definitions
Map###.r3d.json       room, camera, lights, props, event poses, and map 3D data
Database.r3d.json     actor/enemy/weapon/armor/item model bindings
3d/<folder>/model.json      model parts, animations, and named effects
3d/<folder>/model.rig.bin   authored rig data when present
```

Reusable structure stamping is a proposal; the schema sketch in the original
plan is not an implemented structure library. New sidecars do not imply that
all stock JSON is byte-identical: the editor can store a `<3d>` note marker and
`System.json.startDirection`, and other Reactor features have optional stock-data
extensions. Saving a project again in RPG Maker may discard extensions it does
not preserve.

- Three.js loads on demand. A plain 2D game does not need the 3D library;
  opening a model preview in the editor can still load it.
- Camera modes are fixed HD-2D, top-down, isometric, third person, and first
  person, with authored overrides and event-driven transitions.
- Model props become runtime model-bound events with generated IDs, sharing
  character facing and model collision. Height and swept footprints extend
  movement/passability; the game logic is no longer wholly untouched by 3D.
- Named effects can be animations, video/image surfaces, or lights, anchored to
  a model part or bone. In-world animation/video surfaces use scene depth and
  model-relative placement. They are not merely sprites over the finished frame.
- Rooms use floor, wall, and ceiling images; walls and ceiling face inward.
- Stock RPG Maker ignores the sidecars and cannot reproduce Reactor's 3D
  behavior. Ordinary map data remains readable.
- PIXI still owns ordinary game windows, pictures, and plugin sprites. The
  default Three.js viewport shares its WebGL context and must restore state
  before PIXI draws; a canvas-copy fallback remains.
- Renderer-replacing plugins need individual compatibility handling. Running a
  plugin stack on one project is not a blanket guarantee that every renderer
  override composes with a 3D map.

## Phasing

Ordered by payoff per unit of work, not by dependency. Each step is shippable.

| # | Work | Buys | Status |
|---|---|---|---|
| 1 | **Faces from autotile shape** — extrude wall runs into boxes, texture the exposed sides | Every existing building stops being one plane. No authoring, no new data, no UI. Largest single improvement available. | **Done** |
| 2 | **Per-face material + A4 roof pairing** | Wall tops stop wearing their own face art. Closes handoff limitation 1. | **Done** |
| 3 | **Panel shape with thickness and derived facing** | Gates, doors and signs stop chasing the camera. Closes the reported bug. | **Done** |
| 4 | ~~Height brush in the map editor~~ | Built, then removed: nothing on a real 3D map used it, because the massing comes from the tileset's 3D classes. | Dropped |
| 5 | **Block shape** | Crates, plinths, furniture — the small stuff. | **Done** as pieces and sixteen shapes in the Build bar (0.98.7); furniture pieces are queued |
| 6 | **Structures: define, stamp, place** | Building a world becomes fast rather than possible. See *Where one structure ends* below. | **Done** as blueprints (`3d/Structures`, Database › Structures, Blueprint slot), plans of plans included (0.98.7) |
| 7 | **Direct manipulation in the 3D view** | Select, box-select, drag, turn, paint and a specs panel for placed pieces; gizmos on models and events. | **Done** (0.98.7) |
| 8 | **Lights as 3D lights** | A lantern becomes a sphere, a torch a cone. | **Done** |
| — | **Event and database meshes** (sidecar, not a tileset class) | An event, actor, enemy, weapon, armor, or item can carry a GLB/OBJ/… from `3d/<folder>/source`. Pose and facing live in `Map###.r3d.json` / `Database.r3d.json`; parts, pivots, rigs, and animations in the model's own `model.json`. Footprint collision, turn sweeps, and per-pixel character depth are done. Weapon/armor/item bindings are stored but not rendered as equipment. | **Implemented; equipment rendering open** |

Steps 1–3 are corrections to what exists and touch the runtime almost
exclusively. Steps 4–7 are new authoring surface and are mostly editor work.

The first proposed cycle was 1, 2 and 3 (now completed): they need no new UI, no new file
format beyond the material map, and between them they fix every specific
complaint on record — the gate that follows the camera, the building that is a
single plane, and the wall wearing its own face as a hat.

## Where one structure ends

The hardest unsolved question, and the one that ate a day. It is recorded here
because the answer is not another rule.

A tileset object says "this rectangle of the sheet is one picture". Nothing
anywhere says how many were stacked to build a thing, or which way a picture's
rows run. A three-tile pole repeated twice is a six-tile pole, and the tile data
cannot tell that from two poles. A cooling tower drawn in three-quarter view has
rows that are partly footprint and partly height; standing all of them up makes
a sixteen-tile wall out of a building.

The builder therefore has to decide where one standing surface ends and the next
begins, and that decision sets both the *depth* the art is drawn at and how far
*up* each row sits. Get it wrong and the pieces of one wall land on different
planes — which reads as art that will not line up and, worse, slides against
itself as the camera pans, because two surfaces at different distances do not
move together.

Five rules were tried on Moletown. Every one fixed a case and broke another:

| Rule | Fixed | Broke |
|---|---|---|
| Each placement on its own bottom row | everything except gateways | a gateway's sign band and its posts land two planes apart |
| Join anything that touches | the gateway | standing art abuts standing art down a whole street, so the region walks to the map's southern edge and stands every wall thirty-eight tiles up |
| Join east–west only | the gateway | a band still relays southward: rows 12–27 share rows with 20–40, which share rows with 34–50 |
| Join pieces that start on the same row | bounded the runaway | posts start lower than the band they carry, which is what a post is for |
| Join anything touching, bounded by the tallest art in the group | the gateway | swept a shopfront into the cooling towers below it and stacked it six rows up a wall that is not there — windows and counters came out skewed and displaced |
| Join repeated placements of the *same* object | all nine signs on the map | chained through a shared object and took a shopfront's window grid out |

What shipped is the first row: **each placement stands on its own bottom row**,
because it is the only one whose failure is confined to a single sign rather
than to whole buildings. The cost is one map, one sign, one tile of depth.

The conclusion is that no rule over tile data survives this map, and the missing
information is authorial. A map-level control — drag a rectangle, say "these
cells are one object, footed here" or "these cells are a footprint, leave them
down" — was built and proved out on the towers, then removed at the author's
request to keep the tileset route clean. It is the answer if the tileset route
stalls; the shape of it is in the history around this date.

**How to tell whether a change here helps.** Not by screenshot. `Reactor3D` has
`facadeAt(x, y)`, which reports the plane and lift a cell's art was built at,
and `probeEvent(id)`, which reports where an event is being drawn and why. A
structure whose cells report more than one plane is torn. The check that matters
is a *walk*: drive the camera along both axes and watch a sign's top edge
against the wall course it should meet — a gap that changes as you move is the
defect, and a gap that holds is not.

## Current lighting in three dimensions

The original implementation drew flat light pools. The default volume path now
packs up to 32 volume lights (`SHADER_LIGHTS`) into shared shader uniforms. `litMaterial` patches
basic materials to evaluate `rrLight(worldPosition)` from distance, color,
intensity, and point/spot/beam shape. Tiles, room surfaces, models, and character
surfaces receive this field. Surface normals and normal maps do not contribute
an N·L lighting term. The old flat path remains an explicit alternative.

Native map lights, supported plugin adapters (MV Nova Lighting and RaveLighting),
and model-attached light effects supply the field. `Reactor3D.setLights(lights)`
accepts a transient external list; it does not save or author map-sidecar lights.
The current implementation and normalization are in `runtime/reactor_3d.js`;
use the native Lighting tool and effect editor for persistent authored lights.

Shadows use one static and one dynamic depth atlas. Each assigned light gets
six face tiles in a row. Full quality provides 8 static and 3 dynamic rows at
512 pixels per face; weak quality provides 4 and 2 at 256. A light's casting
flag makes it eligible, not guaranteed: row and triangle budgets still apply.
Rows prioritize light incident on the player, skip empty faces, and refresh
when relevant casters or lights move within per-frame limits. Model effect
lights exclude their carrier from their own passes to avoid blocking the light
at its source. The two compare-mode textures are unbound before PIXI draws.

This is shared rendering infrastructure: the game, map editor, and database
previews use related materials and light state, but own different viewport and
resource lifecycles. A successful shader/source test alone cannot establish
that their displayed results agree. See [current validation limits](STATUS.md).

### Historical approach: flat pools

The first light implementation avoided creating a `THREE.PointLight` for every
plugin lamp. It drew ground quads and applied ambient-only dimming to cut-outs;
solid geometry used `MeshLambertMaterial`. That description explains the initial
choice and the retained flat mode, but it does not describe today's default
volume shader or atlas shadows.

## What this does not attempt

- **Sloped or curved terrain from tile primitives.** Tile-derived terrain uses
  boxes and quads; imported models can have arbitrary geometry. This proposal
  does not add a general terrain modeller.
- **3D battles.** The battle scene stays 2D. A bound enemy or actor renders as
  a live 3D battler on its sprite (0.98.3), but there is no 3D battlefield.
- **Per-vertex authored meshes from tiles.** If a project needs a genuine model,
  the answer is a model — now supported through the event and database
  bindings above — not a tileset.


### Navigation and model inspector refinements (2026-09-05)

Click-to-move picks the visible ground plane in perspective, including painted
elevation. Its destination marker lies horizontally on that ground and is owned
by the map scene; switching to a 2D map restores the flat marker. First/third-person
mouse capture retains the initial ground click; subsequent locked clicks aim
through the screen center. Manual movement cancels an active route. Holding a
stationary pointer does not retarget as the camera follows.

Player click routes cache their steps after finding the goal and check collision
before each step. Moving obstacles, changed destinations, map changes and an
unexpected player position cause a new search. Searches have a longer player
horizon with a bounded expansion count; NPC search limits remain unchanged. This
reduces repeated work and route changes, without replacing grid movement itself.
The Demo movement plugin no longer stops on a tile adjacent to the destination.

Isometric keyboard/gamepad directions rotate through the displayed camera yaw:
at the default 45-degree view, Up advances east/north together, and Up+Right
advances east. WASD follows the same mapping. Fixed and top-down controls keep
their existing behavior.

The 3D-M palette inspector groups model selection, Placement, Transform and
Playback into compact themed cards. The 64-pixel model preview and model selector
stay visible above the settings while the settings scroll. Placement, Transform
and Playback open one at a time to fit the limited palette height; the action
buttons stay at the bottom. Animations and Effects use searchable dropdowns with multiple checkboxes; hidden
search results retain their selection. Animations preserve the model's declared
order and effects can run together. Escape, outside clicks and leaving the tab
close the dropdown. Transform changes remain synchronized with the placement
fields so later playback edits do not restore old size or position values.
Rigging spheres use half their previous radius, with a 10-pixel selection radius.

Model-prop input is rebound when map canvases change. The selected palette tool
is restored after the map and event managers bind the new map; Events and 3D-M
keep separate pointer ownership. Returning to a regular tileset restores painting.
Global Delete/Backspace routing gives the active Lights or 3D-M tool priority over
the map tree, including repeated presses after deletion. Form fields and modal
editors keep their own keys. Model and light deletion use their existing undo histories.
The Lights property groups (Light, Position, Rotation, Animation, Grouping) are
collapsible cards with accent-strip headers; the open group survives field edits.

Lighting preset buttons use angular SVG housings and colored emitters. Choosing
a preset arms placement and names the pending type in the status text; only a
click or completed drag over exposed map content creates a record. Drops over
the Lighting panel or other editor surfaces are cancelled. Escape, closing the
tool, and changing maps cancel pending placement. The panel refreshes map-local
selection, list, ambient controls, and pointer bindings in both 2D and 3D views.
Ambient changes synchronize the slider value, filled rail, percentage, and tint
from the map's stored lighting block. New maps and the generated starter map
store Day (1.0 brightness, white tint) in their sidecar; existing authored
lighting and legacy runtime defaults are preserved.

The light tray contains twelve presets in three rows of four, including Compound
Light and Fluorescent. Compound fixtures contain ordinary Point, Spot, and Beam
light records linked by `compoundId` and a shared `compoundName`. The editor
lists each fixture once; its Components section adds/removes parts and selects
which part the normal light controls edit. Editing a component's position changes
that component; dragging a fixture or its translation arrows moves every part by
the same delta. Whole-fixture duplicate/delete preserve relative placement and
remain undoable. New Streetlamp placements use this fixture grouping too.
The runtime receives the existing flat native-light records, so each component
retains its independent type, animation, attachment, and settings. Shared tags
remain available for existing light-event commands; fixture membership is separate
from tags and survives tag edits. New Fluorescent presets use a cool white point
light with seven-tile reach and subtle flicker.
