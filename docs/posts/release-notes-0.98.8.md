# RPG Reactor 0.98.8: Import Any RPG Maker Game

0.98.8 imports RPG Maker 2000, 2003, XP, VX and VX Ace games into Reactor, lets you design your own menus and battle HUD, and fills 3D maps with jumping, swimming, ladders, a structure builder, chrome and real mirrors. The full technical list is in the [editor changelog](../../editor/changelog/0.98.8.md).

[Download the binaries on itch.io](https://psychronic.itch.io/rpg-reactor). GitHub provides the source release. A 2D project stays a 2D project until a map is switched to 3D.

### Added

**Import from RPG Maker 2000, 2003, XP, VX and VX Ace**

**File › Import Project…** (or `import-legacy-project.cjs <source> <destination>`) turns an older game into a new Reactor project and never changes the original. Maps, events, the database, tilesets, the window skin, graphics, audio and fonts convert at the game's own screen size, packed games (`.rgssad`, `.rgss2a`, `.rgss3a`) included. An Import Report lists anything the game names but never shipped. See [Importing legacy projects](../../docs/IMPORTING-LEGACY-PROJECTS.md).

- **Each engine's rules carry over:** 2003 battle arithmetic, XP's stats, fog and 40 fps pacing, VX's per-class equipment and encounter areas, Ace's parallax layers, name boxes and text codes.
- **2000/2003:** chipsets become MZ tilesets, DynRPG text, sprite and particle plugins become engine features, the bitmap font becomes a pixel-exact TrueType file, and languages the game ships become switchable packs. RTP files are copied from an installed RTP. Hold F or G to fast-forward, as in EasyRPG.
- **Ruby becomes JavaScript.** Script calls in events and VX Ace damage formulas translate, and over 110 published scripts are ported as plugins with the game's own settings (fogs, cameras, lights, menus, quest journals, crafting, stealth, animated titles, skill shops and more). Journal and CSCA quests become Reactor quests.
- **Media converts:** MIDI to looping Ogg, movies to WebM, JPEG and BMP to PNG; 8-bit WAV plays.
- **Nothing is hidden:** image layers are in Map Properties, the window frame is in Database › System 2, and every ported script is a plugin you can configure or turn off.

**User interfaces**

- **Items, Skills, Equipment, Shop and Name Input can be your own screens.** Each has a ready layout to start from (**Stock Layout** in the Layers panel) and a System 2 setting that puts it in the game. Using an item or skill picks its target in a party panel by scope; equipment compares stats before you equip; the shop buys and sells with Shop Processing's goods.
- **Lists follow each other.** A category list chooses what an item list shows, a skill type the skills, a slot the equipment; a stat list shows what a piece of equipment would change. Lists can have columns, and Back can step to another control instead of closing.
- **A battle HUD of your own.** Everything MOG's battle HUD does, built in the interface editor: a party panel with faces that shake when hit and grow when healed or acting (or five-frame portraits per actor), HP/MP/TP and ATB with drawn or picture meters and digit images, states one at a time, a turn marker for the active actor; the command, skill, item and help windows placed, skinned and sliding in; and a target cursor on the target's head, 3D models included. The battle itself stays stock, so battle plugins keep working. Start from **Stock Layout › Battle** (the Demo's HUD, art in `img/system` as `BattleHud_*`) and bind it in System 2. Troops › Show Battle UI draws the project's own HUD.
- **Battle commands of your own.** The Actor and Party Command windows take an ordered command list: Escape for every actor, a single skill type, or a skill used straight from the menu, each with its own label and alignment. A Common Event command runs an event on the spot (a scan, a bestiary, your own screen) and then lets the actor choose again.
- **Text Input fields.** Type a password, a code or a name into a variable or an actor's name, with the stock character grid for gamepads; the field's action can run a common event that checks what was typed.
- **What you set is what you see.** The interface canvas draws battle windows, lists, buttons and window colors as the game does, and settings that did nothing in game (Slide up on full screens, Fit text on inputs, opacity on battle windows) work. Disabled buttons and rows dim by default.

**Controls and physics on 3D maps**

- **Jump, gravity and a Controls page.** Space jumps on 3D maps (and still confirms everywhere else). Database › Controls sets every key and gamepad button, and its **Physics (3D maps)** card sets gravity, jump height and fall damage (Earth, Mars, the Moon or your own); Map Properties can override them per map.
- **Fatal falls go limp, and landings make a sound.** A fall that kills the whole party throws the bodies down as ragdolls, carrying the fall's momentum, limbs flailing as they land, and they lie there for a moment before the game ends. Database › Controls › Physics sets a **Landing sound** and a **Hard landing sound**, and the limp fall can be switched off.
- **Jumping on steps and stepped roofs.** A jump taken while walking up a step no longer stops dead as it meets the step.
- **Swimming and diving.** Deep water is swum: the party floats head-out, swims slower, climbs out onto a low bank or jumps out, and a fall into water splashes in without hurting (float depth and splash sound in Controls, or per map). Dash dives and Jump rises; in third and first person, swimming forward while looking down goes deeper and looking up heads for the surface. Ripples follow swimmers.
- **Water you can see into.** Water is a volume: the pool floor fades with depth from above, and under the surface everything hazes blue, the sky included. The camera no longer goes inside the ground, and the player's model steps aside when the camera is pulled right up against it.
- **Ladders.** Climb by walking into one, step off at the top, grab it from above, or push off with Jump. A ladder placed against a wall faces it, and followers climb after the player.
- **Seeing yourself.** The player's model no longer fades away while jumping, falling or diving, and climbing a ladder no longer turns the building's face see-through.
- **Roofs, ramps and jumps.** No invisible walls on rooftops over things standing below; a crooked ramp, or one laid over a hill, walks like any ramp; looking down from a ramp no longer cuts a hole by your feet. A Jump press that does nothing says why on the playtest console, and a jump key taken away on a 3D map is put back.

**Building 3D worlds**

- **Build structures once, place them anywhere.** Database › Structures › Build opens the structure's plot in the 3D view with the same Build bar as the map: set its size and floors, build, save, then stamp it on as many maps as you like. Undo works while building, with Ctrl+Z or the toolbar.
- **Floor plans and real floors.** Paint rooms, walls, doors, windows and stairs one floor at a time and see it in 3D beside the plan; Floors stacks more of them. The Select tool picks up a piece (stairs come whole) or a box of them to move, nudge, turn or delete.
- **More to build with.** A Ladder slot (up to 240 levels), stairs with a width as well as a number of steps, and a Shape slot offering all seventeen shapes, placed where the pointer is to the quarter tile. Anything placed can be selected and changed later; a ladder is edited whole.
- **Flat roofs.** Structures › Roof chooses Gable or Flat before Rebuild roof; a flat roof is a stone top with a parapet round the edge, walkable, for towers and blocks. The Demo's skyscraper Manor has one.
- **Tall buildings behave.** Roofs stay on top of 24-floor buildings, nothing lifts you onto the roof beside an inner doorway, and big structures open quickly. **Rebuild roof** (Structures) and **Rebuild from plan** (Build bar) mend a roof that was pressed flat, as the Demo's Manor was.
- **Terrain in the Build bar.** The ground's brushes and the water moved from the 3D-T palette tab into the Build bar: switch its left end from Build to Terrain for Raise, Lower, Smooth, Flatten, Pour, Drain and Look, each an icon with its settings in the side panel.
- **A steadier editor.** The tile and event cursor lies on the ground over hollows and stays on target after the sidebar is resized, and the Build panel and Map Properties use the same card style as Lighting and Media Surfaces.
- **A true Sun.** Lights have a Sun type: it lights the ground under it out to its radius however high it hangs, and casts from its height, so raising it lengthens the shadows instead of darkening the map. Its sliders reach 400 tiles high and 500 across, and a new Sun starts at intensity 1.
- **Smaller files.** Map sidecars and structures are written a grid row or a piece per line, and database files a record per line, the way RPG Maker writes them: North Haven's sidecar went from 16.5 MB to 9.3 MB and the Demo's data from 4.5 MB to 1.3 MB. Files shrink the next time they are saved.

**Building in the Build bar**

- **Models in the Build bar.** The 3D-M tab is now the bar's Models group: Select, Hammer, Library, then the models you use as picture slots. Build's Select picks up a placed model too, and its placement, transform and playback settings fill the side panel. The bar opens in Select.
- **Handles all at once.** Shapes and placed models show move arrows, turn rings and size handles together, colored to match their sliders (red X, green up, blue Z). Resizing keeps the far side still, dragging is smooth, and a model can be sized past its current size.
- **Right-click menus.** Copy, Paste here, Duplicate and Delete for models and built pieces, with Ctrl+C, Ctrl+V and Ctrl+D. Delete removes what is selected; a map is deleted with Delete only while the map list has the focus.
- **Stairs and ladders you can resize.** A placed flight takes new Steps and Width; stairs built on a roof stand on the roof. A ladder has a Height and a Width, fractions included (1.5 wide, 5.5 tall), and grows from its middle.
- **Events of any size.** An event can cover several tiles (Size W × H in the event window): touching or facing any of them triggers it, and it blocks them all, on 2D and 3D maps.
- **Liquids.** Terrain › Look offers Water, Mercury, Tar, Lava, Slime or Plain, with your own Color, Clarity, Waves and Glow. Click a pool to pick it; pouring uses the liquid in hand, so tar pours as tar and lava glows in the dark.
- **Panel fixes.** A wider side panel with sliders for size, place and turn; a model's Size updates as you type; placing a model no longer lets the next one's settings change it; no more slot numbers.

**Mirrors, chrome and water**

- **Chrome and gold models.** 3D Models has a **Surface** section: Reflection, Gloss, Metal, Texture and a tint, from presets (Chrome, Gold, Glossy, Brushed, Polished). A model reflects the world around it; Texture keeps its own paint under the shine.
- **Mirror finishes for built pieces.** A piece's Finish (Mirror, Chrome, Polished, Glossy, Gold) fills the same sliders. Gloss, Metal, Texture and Tint keep their values at no reflection and dim until it is raised.
- **Real mirrors.** A mirror wall, floor or model shows you sharp and in place, and two facing mirrors reflect each other. Mirrors stay sharp near or far, up to four at once, chosen by how much of the screen they fill.
- **Water that mirrors.** Reflective water mirrors the world through its ripples, cleanly from the shore or a rooftop, and looking up from under water shows the sky through the surface.
- **Battles look like the map.** A battle room reflects chrome and casts shadows the same way the map does.
- Weak graphics cards keep a fixed studio reflection.

**3D models and motion**

- **Model motions at any size.** A placed model's part moves scale with the model, so a room's door opens all the way, as in the Database preview.
- **Rigged characters move on their own.** A rigged humanoid plays a built-in motion for any state it has no animation for: walking, running, breathing when idle, jumping, swimming and climbing. A model can switch these defaults off.
- **One motion, one timeline.** A motion is one row however many parts it moves. Clicking it opens the Motion editor under the model: a track per part with its keys on a shared timeline, a playhead to scrub or play, and the selected part's pose as sliders that key it at the playhead. Click the model to pick a part.
- **Motion presets that read right.** Each preset is one motion, checked on a real model. Wave raises the arm in front, palm out, and sweeps it side to side without crushing shoulder armor; Guard holds the fists at the chin; Slash sweeps level at the shoulder; the Overhead Strike winds up over the head and comes down in front; Sit sits at chair height with the feet on the floor; Take a Bow bows deeper with a hand on the chest. New presets: Climb and Tread Water.
- **Motions for every state.** A motion or effect can play *While jumping*, *While swimming* or *While climbing*, and the preview offers only the states a model has motions for (a door none, a car Idle and Moving, a person Standing to Swimming).
- **A jump with an arc.** Rigged characters spring off with the arms swinging up, tuck at the top and reach the legs down for the landing, held through a long fall. A motion made *While jumping* plays once from the takeoff the same way, or repeats if set to.
- **Climbing that holds on.** A climber's hands take the rails rung by rung and its feet stand on the rungs; the climb moves only as the character climbs (stopped on a ladder, it holds still) and runs backward on the way down; bodies no longer sink into the wall behind the ladder. Climbing is a little slower, to match.
- **A real swim.** Rigged characters swim a front crawl, lying flat just under the surface with the head out, and tread water upright when they stop. Models can play motions *While treading water* too.
- **Smooth motion.** Keyed motions no longer pause at every key, so breathing, walking and swimming run continuously; a state's motion eases in and out instead of snapping.
- **A calmer 3D Models page.** Wheel zoom is smooth and proportional, with no hitch over rigged characters; rig markers keep one readable size at any zoom; on-demand motions play from their own row; the pose card waits folded until you click a part; the cost notes are shorter.

**Battles and the database**

- **One hit, HP and MP.** Skills and items have a Secondary damage row: Damage, Recover or Drain on the other resource, as a share of the primary or its own formula (HP Damage with an MP Drain, say). Both numbers pop up. (#71)
- **Escape quietly.** System › Options › Show escape messages turns off the "started to escape" and "unable to escape" boxes.
- **Target cursor.** With the Battle HUD's hidden target list, left and right follow the enemies as they stand on screen and keep cycling either way.
- **Database polish:** themed scrollbars in every section, and the whole category list fits on a 1080p screen.

**Quests**

- **A quest tracker on the map.** The tracked quest and its open objectives sit in a corner of the screen, finished ones faded below; it hides while a message is up or a switch you choose is on. A new quest is tracked when none is. Corner, width, background and how many objectives it lists are under Database › Quests › **Tracker and Labels…**, beside the words the quest log uses.
- **Rewards can give things.** Each reward can give gold, an item, a weapon, an armor, EXP to the party or a common event, once, when the quest completes or with Quest Reward › Give now. A reward left blank is named in the log by what it gives.

**Plugin authors**

- The action result reports renewed, newly added and blocked states and whether a hit landed: `isStateRenewed(id)`, `isStateNewlyAdded(id)`, `isStateBlocked(id)`, `isLanded()`. (#69)

### Fixed

- Reflection captures that failed every frame (a WebGL error flood in the console and flickering chrome) are fixed.
- Imported 2000/2003 games play like the original player: walking, passability, move routes, pictures, layers, cameras, battles, saves and the old variable arithmetic were each checked against it. Deep 8 is the proving ground.
- Importing a game with thousands of pictures no longer crashes the editor.
- Imported XP, VX and VX Ace games look and time like the old engines: the title's Shut Down, plain one-line list rows, window seams, menu backgrounds and map names; VX Ace games keep the Windows font they asked for, the 640×480 limit and the old fade timing. A, S and D work as the old engines' X, Y and Z buttons, a held key no longer pages through messages, and a game's own icon set is used. VX Ace games get VX Ace's menu, item, status, equip, save and battle screens, and their weapons can be equipped again.
- Plugins that hand sprites their texture every frame (weather, particles) no longer cost up to 300 ms a frame. (#68)
- Apply, OK and Save write only what changed instead of every database file.
- The editor fits a 1366×768 screen: it opens maximized on small screens instead of reaching under the taskbar, and Action Sequences no longer overlaps its footer.
- System 2 gathers the settings for imported older games under their own **Compatibility** heading, so a new project's settings read plainly.
- Stamped buildings get smooth gable ends and window glass in every wall, and the Build bar turns a plan before stamping it.
- Actors played as 3D models no longer need a walking sheet on disk, and ticking 3D clears the 2D image it replaces.
- Door and Treasure quick events play their opening animation. (#70)
- Open Quest Log on a named quest opened on no quest at all.
- In a custom interface, the highlight in a text list stayed on the first row while the cursor moved.
- Starting on the floor of a deep pool no longer launches the player into the air.
- 3D previews no longer redraw their whole canvas every frame on scaled displays, and the map no longer renders behind the Database window.
- Moving stairs on a floor plan closes their old stairwell and opens a new one, and the plan's drag preview works again.
- A 3D map with no tiles shows its floor in the flat view; event labels stay sharp at any zoom; the menu bar reaches every tool.

### Development

- The web build's zip fits itch's 1,000-entry limit: no folder entries, no leftover playtest data, no unused icons.
- CI's GUI smokes run again on a runner with no GPU.
- `docs/` holds the live guides only; dated material is under `docs/archive/`. Changelogs are one file per release.
