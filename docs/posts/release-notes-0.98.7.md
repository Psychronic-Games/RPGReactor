# RPG Reactor 0.98.7 — Build the World by Hand

0.98.7 puts a world builder in the map view. Walls, floors, stairs, shapes and whole buildings go down with a snapping ghost, the ground is shaped with brushes, water pours into the hollows, and the party walks inside what you built with the roof lifted away. A Sun light, four collapse effects and a run of fixes come with it.

[Download the binaries on itch.io](https://psychronic.itch.io/rpg-reactor). GitHub provides the source release. A 2D project stays a 2D project until a map is switched to 3D.

## Building

- **Build bar.** A Build button in the toolbar opens a bar over the 3D view: Floor, Wall, Doorway, Window, Glass, Stairs, Ramp, Roof, Pillar, Fence and Block, then Shape, Screen, Light, Hammer and Blueprint. A ghost snaps to what is there; click to place, drag for a row, Ctrl-drag for a box; R turns, Q and E change the level, the Hammer or a right-click removes, Ctrl+Z undoes. Number keys pick slots.
- **Select.** Pick a piece up and a specs panel beside the map sets its facing, material, size and settings; drag it to a new cell, R turns it, Delete removes it. Drag a box on the ground to select many and paint, move, turn or remove them together. A shape wears the arrows, rings and size cubes the 3D models have.
- **Shapes.** Box, wedge, prism, hull, spike, cylinder, capsule, tube, cone, dome, sphere, dish, fin, arch, tunnel and ring, each with a size, turn, tilt and roll and its own settings. Arches and tunnels are hollow. A material named *Glass…* is translucent; one ending *…Glow* lights itself.
- **Materials** are tileable images in `img/materials`, shown as swatches.
- **Blueprints.** Database › Structures lists saved buildings as cards, one JSON file each under `3d/Structures`, with rooms, doors, windows, stairs, roof, parts, paths, spots, people, screens and lights. The Blueprint slot stamps one; a stamped building moves, turns and scales as one and keeps its people. Plans can hold other plans.
- **Screens and lights** go on a building through the Media Surfaces and Lighting panels, which dock beside the map; the bar's Screen and Light slots open them and stay up.

## Ground, water and sky

- **Terrain.** The 3D-T tab shapes rolling ground with Raise, Lower, Smooth and Flatten.
- **Water is poured.** Point at a hollow and a ghost shows what a click would fill; the water rises to the rim, one pond per hollow. Remove takes the sheet you click. Sheets have waves, a shore where the ground crosses the level, and shallows you can wade; deeper water blocks.
- **Sky.** Map Properties › 3D gains a Parallax Sky with scroll speeds.

## Walking inside

- Under a roof, everything above your storey in that building is cut away and every sliced wall wears a top in its own material. A wall between the camera and anyone in the party, or the people in the room, goes see-through; floors stay solid. In first person, or a third-person camera under the ceiling, nothing is cut.
- Two walkable floors: stairs climb a storey along their run and nothing else, followers keep the leader's floor, a transfer lands on the ground floor, and the camera keeps out of the walls.
- Buildings show on the flat map as a plan from above. Pieces are laid in chunks, so big maps stay quick.
- `validate-map.cjs` reports a 3D map's health from a shell; `docs/AUTHORING.md` says where every part of a 3D map lives and which tool edits it.

## Lighting

- A **Sun** preset: warm, map-wide, one set of long shadows. Any single-light preset can be picked from a placed light's Type dropdown.

## Battles and database

- **Collapse effects:** Ash, Ember, Wisp and Shatter, tunable spark layers, an enemy's own collapse sound, and Ash and Ember on 3D battlers in a battle room.
- A held weapon can be drawn behind its holder.
- Class curves and the EXP table work to a target level, and the curve dialog is the RPG Maker one again, past level 99.
- An enemy action condition can name several states. Add Buff and Add Debuff can say how strong a stack is (PR #66).
- Music sequences have a library, and a map, a troop or Change Battle BGM can play one. The editor shows the parameter names the project chose. Database › Quests chooses Reactor's or VisuStella's quest log.

## Fixed

- Delete with an event picked in the events column deleted the map. A building past six storeys lost its top. A band of floorboard round the foot of every building, a missing ceiling from inside, roof shadows falling into a cut room, sawtooth seams along cut walls and windows, missing window sides and door jambs, a wall walked past outside going see-through, and drifting up the stairs while crossing a hall in isometric.
- The 3D sky ran out when the view pulled back, stuttered in the editor and ignored scroll speeds under a pixel a frame. Enlarging a map lost its 3D work. Shaping terrain rebuilt the scene on every dab. A big light's glow was a half circle; lights in the editor stopped following the camera; a spot light's guideline pointed the wrong way.
- Apply in the database locked the editor with a sequence open; clicking a record is four times faster on a large project. The flat preview stood a held weapon too high; sequence audio steps use the audio picker; additive animations carried a black square; the preview shows a flat battle the way the game plays it.
- Projects stopped taking a new runtime. A save taken as a battle ends threw and went missing. The Options dialog, the Video toggle, the tileset palette and six Reactor event commands in every language. A passive state answers both sides of an enemy state condition.
- Several enemies of the same kind collapsing at once stalled the game (PR #67). A state's icon opened two pickers and could write the state into the Skills table (PR #66). Database › Quests takes a value in every field.

## Known limits

- Windows and doors are cell-wide; a wall is one tile thick. Materials are flat images: no normal or roughness maps yet, so a built interior reads simpler than a modelled one.
- A stamped building edited by hand detaches from its plan: the edit stays and the building still moves as one, but scaling is off.
- The Demo's Hamlet on North Haven stands on sloped ground; re-stamping levels it.

## Validation

- 3,366 Node tests pass, in the working tree and in a fresh clone with `npm ci --ignore-scripts`. Runtime revision 20260920.24; all thirteen bundled project runtimes match.
- Live checks in the game on a Demo copy: the Manor walked in isometric and third person, the stairs, the hall, the west wing and the window wall; water poured, previewed and removed in the editor; the build bar driven by real clicks.
