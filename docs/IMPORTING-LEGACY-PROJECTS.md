# Importing an RPG Maker 2000/2003 project

Reactor does not open a 2000/2003 project in place: the formats are
different engines. It imports one into a **new Reactor project** whose
framework matches the old engine (320×240, 16 px tiles, 48 px faces), with
the data and images converted. The old project is never written to.

## Running it

In the editor: **File › Import Project…**, choose the folder that holds `RPG_RT.ldb`, where to create the new project and its name, and press Import. The dialog shows the importer's log and opens the project when it is done. From a shell:

```bash
# What the project holds and what an import will do with it; writes nothing
node editor/build-scripts/import-legacy-project.cjs <source> --report [--json report.json]

# Write a new Reactor project
node editor/build-scripts/import-legacy-project.cjs <source> <destination> [--maps 1,2,3] [--skip-assets] [--force] [--encoding 932] [--language english]
```

`<source>` is the folder holding `RPG_RT.ldb`. Text is read in the code
page `RPG_RT.ini` names, or guessed (Shift_JIS for Japanese games,
Windows-1252 otherwise); `--encoding` overrides it. `--maps` writes only
those maps and `--skip-assets` skips the image and audio copy, for a quick
look. `--language` (the dialog's Language field) takes one of the
translations an EasyRPG game ships in its `Language` folder and bakes it
into every text: messages, choices, plugin texts, names, descriptions and
terms; the original text stays where the translation has no entry. The new
project carries `import-report.json`, which says what was approximated and
which files were skipped. Both run the same importer,
`editor/src/legacy/LegacyImporter.js`; the editor runs it in a worker.
To import again into the same folder, run with `--force` (the dialog asks):
files are overwritten in place. Do not delete the folder first when it sits
in a synced directory such as Dropbox; the sync client can put the old files
back underneath the new import.

## What converts today

| 2000/2003 | Reactor | Notes |
| --- | --- | --- |
| Chipset (480×256) | Four tileset sheets per chipset: A1 (water, three frames), A2 (terrain autotiles), B (lower tiles), C (upper tiles) at 16 px | The 47 autotile variants are MZ's 48 shapes, so autotiles stay autotiles and can be repainted in the editor |
| Map lower and upper layers | MZ layers 0 (autotiles), 1 (lower tiles), 2 (upper tiles) | Upper tiles marked "above hero" get MZ's star |
| Passability, counter, terrain bush and damage | Tileset flags | 2003 terrain ids do not fit MZ's eight terrain tags and are not carried |
| Map tree | MapInfos.json with the same ids, parents and order | Areas have no MZ counterpart and are dropped |
| Map music, parallax, encounters, scroll type | Map properties | Inherited music is resolved up the tree |
| Events: position, graphic, direction, movement, move route, trigger, priority, page conditions, commands | Events with pages | Timer conditions and variable comparisons other than "at least" on a page are noted in the report |
| Event commands | MZ commands, one for one where MZ has one | Messages with their face and options, choices with their cancel branch, battles with their handlers, shops with their transaction branch, inns as message, choice, payment and heal. Control Variables operands MZ lacks (equipment ids, dates, frames) are Script operands. See the runtime equivalents below |
| Actors | Actors, each with its own class (id = actor id) carrying curves, learnings and the exact 2003 EXP table | The 2003 classes follow after the actors' classes, offset by the actor count, for Change Class |
| Stats | Attack, Defense, Spirit, Agility → Attack, Defense, M.Attack and M.Defense (both from Spirit), Agility; Luck 50 | State and attribute ranks become state and element rate traits |
| Skills | Skills with formula strings that reproduce the 2003 arithmetic: power + atk·phys/20 + spi·mag/40 − def·phys/40 − spi·mag/80, variance in tenths | Skills that target allies heal; a switch skill calls a generated common event; percent MP costs and teleport skills are noted |
| Items | Items, Weapons and Armors, keeping the 2003 item id in whichever table | Medicine recovers and cures, books teach, materials grow, special items borrow their skill, switch items call a generated common event, common goods are key items |
| Enemies, troops, states | The matching MZ records; troop pages with their conditions and commands | Basic attack and defend are skills 1 and 2; transform actions are noted |
| Battle animations | MV-style sheet animations; the sheets are scaled to MZ's 192 px cells and the cells scaled back | Cell tones and screen shake timings have no MZ field |
| Terms and system | Terms, element, skill, weapon, armor and equipment type names, vehicles, battle and title music, system sounds | Battle system is TPB active for 2003 and turn-based for 2000 |
| System graphic | Window.png: background, frame (kept at its 8 px thickness inside MZ's 24 px frame cell), cursor, the pause arrow and text colours laid over the stock skin; windows are opaque as 2003 drew them | The parts 2003 had no equivalent of stay stock |
| Game font (`RM2000.fon` or `RMG2000.fon`, whichever the game picked, when the project ships it) | `fonts/RM2000.ttf`, a TrueType file whose outlines are the bitmap's pixels at the engine's 6 px and 12 px pitch, set as the main and number font at its pixel size (13) | Without the file the template font stands in |
| Text metrics | `advanced.lineHeight` 16, `windowPadding` 8, `windowMargin` 0, `textOutlineWidth` 1: 2003's 16 px lines, 8 px window borders, no outer margin and a 1 px shadow; the runtime reads all four from System.json | An MZ project keeps 36, 12, 4 and 3 |
| Scaling | System 2's **Pixelated Rendering** is on: the 320×240 frame scales up with nearest-neighbour sampling | Off, the stock smoothing blurs every pixel |
| Terms the author never touched | RPG Maker's Japanese defaults, read through a Western code page, are mojibake; MZ's stock word stays for those | |
| Terrain backgrounds | Each map's battleback is the background its most common terrain names | 2003 chose it per tile |
| Picture ids | The game's own ids stay (2003 allowed 1000); `advanced.picturesUpperLimit` is set past the highest id used plus 400 slots, and named sprites take the slots above the game's ids (`advanced.rrNamedSpriteBase`) | |
| Picture effects | Rotation (power/256 of a turn a frame) and the scanline wave (four times the power in pixels, phase advancing 8/256 of a turn a frame) as `$gameScreen.rrPictureEffect(id, mode, power)`; the wave is a WebGL filter | The wave stays still on a renderer without PIXI's GlProgram |
| Music and sound files named `Song.ogg.ogg` | Copied as `Song.ogg` | The old engine tried extensions; the runtime wants one |
| Title screen | The title image, or none when the game hides its title screen (`rrSkipTitle` in System.json boots straight into a new game, the way 2003 did for games that draw their own title from events) | A title image the game names but does not ship is left blank and noted |
| CharSet (288×256, rows up/right/down/left) | img/characters, rows reordered to MZ's down/left/right/up, named with a leading `!` so sprites stand on their tile | A leading `$` is removed: MZ reads it as a single-character sheet |
| FaceSet, Panorama, Picture (with subfolders), Monster, Battle, Backdrop, Title, GameOver, System | The matching img folders, palette entry 0 made transparent where the old engine did | Show Picture chose per call whether palette entry 0 is transparent: a picture only ever shown opaque is written opaque, one shown both ways gets a second `Name (opaque).png` that those calls name |
| Music and Sound | audio/bgm and audio/se | MIDI files are copied but the runtime does not play them |
| System: start position, party, title, title and battle music, system sounds, switch and variable names | System.json | 2003 had no icon set: every icon index is 0 and MZ's stock IconSet.png comes with the project at 32 px cells, for authors who add icons later |

## Runtime equivalents

Six 2003 commands have no MZ command. The importer emits Script calls to
engine methods that the runtime carries for any project:

| 2003 command | Call |
| --- | --- |
| Call Event (map event, page) | `this.rrCallMapEvent(eventId, page)` |
| Key Input Processing | `this.rrKeyInput(variableId, keys, wait, timeVariableId)`; keys are 1 down, 2 left, 3 right, 4 up, 5 decision, 6 cancel, 7 shift |
| Proceed with Movement | `this.rrWaitForAllMoves()` |
| Halt All Movement | `this.rrHaltAllMoves()` |
| Flash Sprite | `this.rrFlashCharacter(characterId, [r, g, b, strength], frames, wait)` |
| Store Terrain ID | `this.rrTerrainId(x, y)`, from the terrain table the importer writes into the tileset note |
| Pan Screen: reset | `this.rrPanReset()` |
| Shop transaction branches | condition on `$gameTemp._rrShopTransaction` |

A class with an `expTable` array uses it instead of the four EXP parameters.

## DynRPG comment commands

A 2003 game patched with DynRPG drives plugins through comments that start
with `@`. Three plugin families convert into Script calls on Reactor's
screen features (`runtime/reactor_screen_fx.js`), which are ordinary engine
features any project can use:

| Plugin | Commands | Reactor |
| --- | --- | --- |
| Text plugin | write_text, append_line, append_text, change_text, change_position, set_text_alignment, remove_text, remove_all | `$gameScreen.rrWriteText(id, x, y, text, fixed, color, layer)` and the rrAppendLine, rrAppendText, rrChangeText, rrMoveText, rrTextAlign, rrRemoveText, rrRemoveAllTexts family: text at a screen or map position in the game font and a skin text colour, with \V, \N, \P, \G and \C codes; lines stack at the glyph height plus 2, "center" puts the text's middle on x, "right" its end |
| Sprite plugin | add_sprite, remove_sprite, bind_sprite_to, set_sprite_layer, set_sprite_image, set_sprite_position, set_sprite_opacity, shift_sprite_opacity_to, move_sprite_to, move_sprite_by, move_x/y_sprite_by, move_x/y_sprite_to, scale_sprite_to, scale_x/y_sprite_to, rotate_sprite_by, rotate_sprite_to, rotate_sprite_forever, set_sprite_color, shift_sprite_color_to, set_sprite_blend_mode, get_sprite_position | `$gameScreen.rrSpriteAdd(name, image, blend, layer, x, y, scale, angle)` and the rrSprite* family: pictures addressed by name, with the plugin's draw layers 0-9 (0-1 behind the map's parallax, 2 over it and under the tiles, 3 under the characters, 4 over them, 5-9 over the pictures; any other number is 0, which is how Deep 8 uses 10 and up), a map binding that scrolls with the map, and moves, scales, opacity, rotation and colour fades that each run on their own clock, so a fade keeps going under a later move. Times are milliseconds, easing names as the plugin wrote them. When every named slot is taken the oldest invisible, finished sprite gives up its slot |
| Particle Effects V2 | pfx_create_effect, pfx_set_texture, amount, simul_effects, velocity, angle, secondary_angle, initial_color, final_color, growth, random_position, timeout, layer, gravity_direction, acceleration_point, generating_function, radius, random_radius, interval, use_screen_relative, pfx_burst, pfx_start, pfx_stop, pfx_stopall, pfx_set_position, pfx_destroy_effect, pfx_destroy_all, pfx_does_effect_exist | `$gameScreen.rrPfxCreate(name, "burst" or "stream")`, `rrPfxSet(name, setting, …)`, `rrPfxBurst(name, x, y)`, `rrPfxStart`, `rrPfxStop`, `rrPfxStopAll`, `rrPfxSetPosition`, `rrPfxDestroy`: bursts and streams of textured particles with velocity, spread, colour fade, growth, timeout, gravity and an acceleration point |

An argument written `Vn` reads variable n at run time. A comment that is
not one of these commands stays a comment and is counted in the report
(on Deep 8: EasyRPG's own language switch, and one event on an older
particle plugin). The sprite plugin's argument order is read from how
games use it, since its documentation is not published; the text plugin's
follows EasyRPG Player's native implementation and the particle plugin's
its published reference. Particle motion is visual, not a physics match:
velocity is pixels per second, gravity and acceleration are scaled to look
right rather than measured against the original.

## What the format cannot hold exactly

- **Outer corners.** A 2003 autotile block has twelve tiles, MZ's has six,
  so MZ draws an edge's halves and a corner's edge halves from the same
  pixels. Every block is therefore written twice: kind *k* composed from
  the edge tiles, and kind *12 + k* from the corner tiles, and each map
  tile points at the one that reproduces it. Painting new tiles in the
  editor uses whichever of the two you pick.
- **Edge tiles' inner halves.** An artist may draw the inner half of an
  edge tile differently from the centre tile; MZ always draws the centre
  there. On Deep 8 this touches about 2% of terrain tiles by a few pixels.
- **Two water types in one tile.** 2003 could show the coast of one water
  kind inside another. MZ has one autotile per tile; the tile keeps its
  main water kind. About 2% of Deep 8's water tiles.
- **Animated tiles.** The three animated chipset tiles are placed as their
  first frame in sheet B. They do not animate.
- **Commands with no equivalent** become comments naming the original:
  Tile Substitution, Teleport and Escape targets, Change System Graphics,
  Change Screen Transitions, Change Battle Commands, the video options.
  Pictures fixed to the map, looping flashes and shakes, the second timer
  and the pan lock are noted in the report.

Verification: `editor/tests/legacy-convert.test.cjs` draws Deep 8 maps by
EasyRPG Player's tables from the original chipsets and by MZ's tables from
the converted sheets, and requires every comparable tile to match.

Verification against the shipped game: Deep 8 ships a custom EasyRPG
Player build (`rpg_rt.exe` is the player, the plugins are compiled in). It
runs under Wine with `--window --language english --start-map-id N`, and
a desktop capture of it beside the harness's screenshot of the imported
project settled the picture keying, the wave length, the text alignment,
the sprite layer order and the independent tweens above.

## Still to come

Editor commands on the Reactor tab for the runtime equivalents and the
screen features, so an author can see and edit them without a Script
command. On Deep 8, the playthrough has reached the landing scene and the
first dialogue; the spaceship scenes, the first walkable map and the
picture-built battle system are untested, and `Change System Graphics`
is still a comment. The 2003 text colours are vertical gradients sampled
per glyph row; the runtime draws the cell's middle colour flat. XP and
VX Ace projects are recognised by the dialog and declined for now.
