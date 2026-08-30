# Building 3D worlds from 2D tilesets

Written 2026-08-01; status current as of 2026-08-24. **Phases 1–3 and 8 are
built**, 4 was built and dropped, and 5–7 are still a plan. Models on events and
database records (the last row of the table) shipped separately in 0.98.2–0.98.3. The
diagnosis below is kept in the past tense where it has been fixed, because it
is the reasoning the implementation rests on.

The 3D view shipped in 0.96.0 infers three dimensions from a two-dimensional
map. That was the right way to get something on screen, and it is the wrong way
to build a world: inference cannot be corrected, only fought. This describes
what to replace it with.

## What is actually wrong

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

## The shape of the answer

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

## The primitive set

Five shapes, replacing the current four classes. A tile is assigned one, once,
per tileset.

| Shape | What it is | Right for |
|---|---|---|
| **Ground** | a flat quad on the cell | floors, roads, water, painted markings |
| **Mass** | the cell's ground raised to its height; sides take wall art, top takes roof art | terrain, cliffs, building shells, city blocks |
| **Block** | a free-standing box within the cell, with its own height and per-face art | crates, plinths, low walls, furniture |
| **Panel** | a thin upright quad with a real facing and a little thickness | gates, doors, signs, fences, banners |
| **Billboard** | a camera-facing cut-out | trees, bushes, heaps, rocks, anything amorphous |

Mass and Billboard exist. Ground exists. **Block** and **Panel** are the new
work, and Panel is what a gate has been missing.

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

## Authoring: how a world actually gets built

Four tools, in the order an author would use them.

**1. A height brush, in the map editor.** Paint elevation the way tiles are
painted: a number, a brush size, drag to raise. The 3D view updates live. This
is the single highest-value tool in the plan — with Mass tiles and derived
facing, painting height is enough to build a city, and it is the literal answer
to "build in 3D using the tiles".

**2. Structures: draw once, stamp anywhere.** A structure is a named,
multi-cell 3D object defined against a tileset — footprint, height per cell,
shape per cell, art per face. Define "guard tower" once; stamp it forty times.

The compatibility trick that makes this safe: **stamping writes both.** It
writes ordinary tiles into `Map###.json` — so the map is a valid 2D map, the
passability is real, the events work, RPG Maker itself can open it — *and* an
entry into `Map###.r3d.json` recording that those cells are one structure. The
2D map is not a lossy shadow of the 3D one; it is the same map, and the sidecar
says how to read it in three dimensions.

**3. A shape mode in the tileset editor.** Exists, and gains the two new
shapes, the material slots and the pairing tool. This is the once-per-tileset
setup that everything else rests on.

**4. Direct manipulation in the 3D view.** Select an object, turn it, raise it,
drop it. The 3D view is already interactive — it paints, selects and opens
event menus — so this is an extension of a live surface, not a new one.

## Data and compatibility

Nothing here changes `Map###.json`, `Tilesets.json` or any other RPG Maker
file. That is the constraint the whole design serves.

```
Tilesets.r3d.json     shape + material per tile, structure definitions
Map###.r3d.json       elevation, structure placements, per-placement facing,
                      the room (floor/walls/ceiling parallaxes + height)
```

- A project with no 3D maps gains no files and never downloads three.js.
- The camera is a mode plus overrides (`reactor3d.camera`): fixed (HD-2D),
  top-down, isometric, third person, first person. Fixed follows the display
  like the 2D map, so scroll, zoom and camera plugins keep working; the
  player-relative modes follow the player and turn with them. The mouse
  owns the look in those modes; the third-person camera never goes under
  the floor (it slides in as you look up), and the character looks where
  the camera looks.
- Model props (`reactor3d.props`) are 3D models placed from the palette. The
  game does not learn a second kind of thing: each becomes a model-bound
  event at load (ids from 10000), so drawing, facing and footprint collision
  are the event model's.
- Model effects live in the model's own `model.json` (`effects[]`): a
  database animation or a video surface anchored to a part or bone, scaled
  relative to the model (1 = a frame as tall as the model's longest side, at
  whatever size the instance is placed), played on demand or by state; an
  effect on one face of the model hides when that face turns away. Drawn by
  the game's ordinary animation sprites over the 3D canvas, so plugins that
  touch animations still apply.
- The player start's facing is the one key added to an MZ file:
  `System.json.startDirection`, which MZ ignores and Reactor defaults to down.
- The room is three parallax images and a height. Walls and ceiling show
  their inside face only, so the over-the-shoulder camera looks through the
  near wall and the ceiling into the room; a camera inside sees all of it.
- A 3D map opened in RPG Maker MZ is an ordinary map; the sidecars are ignored.
- Game logic — `Game_Map`, passability, regions, the interpreter — is untouched,
  because 3D remains a *view* of the same six planes.
- Plugins keep working: PIXI still draws every window, picture, animation and
  plugin sprite over the 3D canvas, exactly as it does over the 2D one.
- **One real conflict**: a plugin that replaces the tilemap itself — UltraMode7
  is the obvious case, being a renderer of its own. A map should decline 3D
  when such a plugin is active, rather than both fighting for the same view.
  Detection and a clear console note; not an attempt to merge them.

Existing 3D maps keep rendering. The current inference stays as the fallback
for any tile whose shape is unset, so nothing regresses on the day this lands.

## Phasing

Ordered by payoff per unit of work, not by dependency. Each step is shippable.

| # | Work | Buys | Status |
|---|---|---|---|
| 1 | **Faces from autotile shape** — extrude wall runs into boxes, texture the exposed sides | Every existing building stops being one plane. No authoring, no new data, no UI. Largest single improvement available. | **Done** |
| 2 | **Per-face material + A4 roof pairing** | Wall tops stop wearing their own face art. Closes handoff limitation 1. | **Done** |
| 3 | **Panel shape with thickness and derived facing** | Gates, doors and signs stop chasing the camera. Closes the reported bug. | **Done** |
| 4 | ~~Height brush in the map editor~~ | Built, then removed: nothing on a real 3D map used it, because the massing comes from the tileset's 3D classes. | Dropped |
| 5 | **Block shape** | Crates, plinths, furniture — the small stuff. | Open |
| 6 | **Structures: define, stamp, place** | Building a world becomes fast rather than possible. See *Where one structure ends* below. | Open |
| 7 | **Direct manipulation in the 3D view** | Comfort. Everything above is usable without it. | Open |
| 8 | **Lights as 3D lights** | A lantern becomes a sphere, a torch a cone. | **Done** |
| — | **Event and database meshes** (sidecar, not a tileset class) | An event, actor, enemy, weapon, armor, or item can carry a GLB/OBJ/… from `3d/<folder>/source`. Pose and facing live in `Map###.r3d.json` / `Database.r3d.json`; parts, pivots, rigs, and animations in the model's own `model.json`. Footprint collision, turn sweeps, and per-pixel character depth are done. | **Done (0.98.2–0.98.3)** |

Steps 1–3 are corrections to what exists and touch the runtime almost
exclusively. Steps 4–7 are new authoring surface and are mostly editor work.

A reasonable first cycle is 1, 2 and 3: they need no new UI, no new file
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

## Lighting in three dimensions

**Built.** What follows is the reasoning it was built on, kept because the shim
boundary is the part that will need defending.

**The rendering half looked small and the obvious version was wrong.** Adding a
`THREE.PointLight` per light is a contained change and it does not survive a
real map: three.js compiles the scene's light count into every material's
shader, so a city with a lantern on every corner overruns the fragment uniform
budget and nothing draws at all. Capping the count to fit is not a fix — twelve
lights on a street of a hundred is not lighting.

The way out is to notice that a 2D lighting plugin never simulated anything
either. Its light *is* a shape — a radius, a colour, an alpha — so it can be
drawn: a quad on the ground per light, one shared geometry and material for all
of them, one draw call, no uniforms. A single ambient light supplies the
darkness. Cut-outs are dimmed by the ambient level rather than shaded, because
a billboard's normals mean nothing once the shader turns it to face the
camera.

**The hard half is where the lights come from.** A game's lights live in a
third-party plugin's own data — MVNovaLighting, or whatever the project uses —
and Reactor cannot read that without binding itself to one plugin's internals.
The answer is to publish an API and let a shim do the binding:

```
Reactor3D.setLights([
  { type: 'point', x, y, z, radius, colour, intensity },
  { type: 'spot',  x, y, z, yaw, pitch, angle, range, colour, intensity }
])
```

Then a small compat shim per lighting plugin translates its light list into
that call each frame — the same shape as the MV compat layer, and the same
reason: the plugin stays unmodified.

What was actually built follows that plan, with two decisions worth recording.

**Cut-outs are dimmed, not shaded.** A billboard's normals mean nothing — the
shader rewrites its vertices to face the camera — so lighting one by them gives
a tree lit from whichever way its sheet happened to be wound. They take the
ambient level as a flat multiplier, which darkens a wood in a dark place
without pretending it catches a lantern on one side.

**One material, always.** Solid geometry uses `MeshLambertMaterial` even with
no lights, because under a full-white ambient that is pixel for pixel what
`MeshBasicMaterial` gave. So an unlit map is unchanged and a map that acquires
lights needs no rebuild — only different lights.

Still flat: the plugin's own overlays for anything that is not a light, and
light *sprites* do not scale with distance. Both would need the shim to reach
further into the plugin than hiding a container.

## What this does not attempt

- **Sloped or curved geometry.** Everything is axis-aligned boxes and quads.
  Ramps are stepped. This is an HD-2D diorama, not a modelling package.
- **3D battles.** The battle scene stays 2D. A bound enemy or actor renders as
  a live 3D battler on its sprite (0.98.3), but there is no 3D battlefield.
- **Per-vertex authored meshes from tiles.** If a project needs a genuine model,
  the answer is a model — now supported through the event and database
  bindings above — not a tileset.
