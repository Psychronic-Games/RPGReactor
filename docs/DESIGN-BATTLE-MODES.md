# Battle modes

Written 2026-10-02 as a proposal; the owner approved it the same day. Phase 1 (the on-map framework) is built; how to use it is in [BATTLE-MODES.md](BATTLE-MODES.md).

The owner's ask: more combat types in one game (tactical, action, first person), switched by an event command, working on 2D and 3D maps with every camera, easy for a human to set up in an interface. The owner added a hard requirement: a tactical (and action) battle uses the whole map and event toolset, seamlessly, with as much power as possible.

## What exists today

| Part | Where | What it does |
| --- | --- | --- |
| Turn-based and time progress (ATB) | `runtime/reactor_managers.js` (`BattleManager.isTpb`, `isActiveTpb`), `reactor_objects_battlers.js`, `reactor_scenes.js` (`Scene_Battle`) | MZ's battle, chosen by `System.json › battleSystem` (0 turn, 1 active TPB, 2 wait TPB). A separate scene: the map stops while it runs. |
| Battlebacks | `Spriteset_Battle` in `reactor_sprites.js` | The 2D presentation. |
| Battle Rooms | `runtime/reactor_battle_room.js`, `reactor_battle_presentation.js`, `reactor_battle_events.js`; guide [BATTLE-PRESENTATION.md](BATTLE-PRESENTATION.md) | A map drawn as the battle's 3D stage inside `Scene_Battle`, with room-local events (`RoomEvent`), the map's camera modes and cinematic cuts. Transfers, vehicles and nested battles are skipped there. |
| Action Sequences | `runtime/reactor_battle_data.js`, `editor/src/battle/BattleData.js`, `DatabaseActionSequenceEditor.js` | Phased motion, held weapons, projectiles, hits on 3D battlers; Skill › Weapon › Class › Actor priority. |
| Battle HUD | `runtime/reactor_ui.js`; [DESIGN-USER-INTERFACES.md](DESIGN-USER-INTERFACES.md) | A `battle` interface record over `Scene_Battle`. |
| Starting a battle | Encounters (`Game_Player.executeEncounter`), Battle Processing (301), Battle Test | Always `Scene_Battle`. |
| 3D map runtime | `runtime/reactor_3d.js` (camera modes `topDown`, `isometric`, `thirdPerson`, `firstPerson`, pointer lock), `reactor_physics.js` (jump, swim, dive, fall, ragdoll), `reactor_3d_doors.js`, `reactor_3d_world.js` (pieces, water, rocks), `reactor_3d_foliage.js`, `reactor_controls.js` (`System.json › reactorControls`) | The live world tactics and action would play in. |
| Map events with models | `reactor_3d_models.js` | Events drawn as 3D models with animation rules. |

Reference systems in the tree:

- **PSYCHRONIC_PTBS** (the owner's own, v1.0.4, 11,352 lines; enabled in the Demo and Project4): `template/Demo/js/plugins/PSYCHRONIC_PTBS.js`. Grid battles on the live map; `PTBS_Actor: X` / `PTBS_Enemy: Y` comments make events battlers; `<PTBS>` note blocks give skills `scope: circle(max,min)`, `aoe:`, `scope_select:`, action sequences; front/side/back damage multipliers; blocked regions; win conditions (defeat all, switch, variable, turn count) with commands. The closest match to this design and the likely "basic tactical battle plugin".
- **LeTBS** (Star Shift Rebellion, about 30 add-ons): `template/Star Shift Rebellion/js/plugins/LeTBS*.js`. Battles on the map with turn order, line of sight, summoning, marks and auras, win conditions.
- **GubiD GTBS** port (Pinnacle): `editor/src/legacy/plugins/RR_PinnacleGtbs*.js` (8,109 lines). Team turns, ranges, facing, terrain, knockback, armies, AI.
- **Hendrix Action Combat MZ** (real-time, event-driven): `template/Hendrix RPG Maker Action Combat MZ (v166a)/js/plugins/Hendrix_Action_Engine.js` and its hotbar, animation and pixel-movement plugins. A reference for action combat built on events.

## Positions taken

**1. Two kinds of battle scene.** The owner's split: **Classic** is the separate battle scene; **Tactical, Action and First Person** take place on the actual map. A game may use all of them and switch between them.

| | Classic | Tactical | Action | First Person |
| --- | --- | --- | --- | --- |
| Where | `Scene_Battle` (map stops) | the live map | the live map | the live map |
| Turns | turn, active or wait ATB | team or initiative turns | real time | real time |
| Camera | front/side view, battleback or Battle Room camera | map camera or tactical orbit | map camera (third person, top-down, isometric) | first person |
| Input | battle command windows | cursor, unit menu | attack, dodge, guard, hotbar | aim, fire, hotbar |

**2. Classic keeps `Scene_Battle`.** Turn, active TPB and wait TPB stay exactly as they are, with battlebacks or a Battle Room. Plugins that patch `Scene_Battle`, `BattleManager` or the battle windows keep working there, because nothing about Classic moves.

**3. One on-map battle framework under the three map modes.** Units, battlers with damage, skills, items and states from the Database, victory, defeat and escape, rewards, objectives, event hooks and commands, save and load mid-battle are written once. Tactical, Action and First Person differ only in turn structure, camera and input, each a small driver on the framework.

**4. On-map battles happen on the live map.** No separate scene and no frozen map: the battle is a state object beside `$gameMap`, and `Scene_Map` keeps running. This is the owner's hard requirement. Everything the map can do keeps working during a fight:

- Map events keep running: parallel, autorun, player/event touch and action triggers, page conditions, switches, variables, self switches, move routes, common events.
- The 3D world is the battlefield: terrain and `elevation` give height, pieces and rocks give walls and cover, water is wading and swimming (`ReactorPhysics`), doors open and lock (`Reactor3D.Doors`), foliage can hide, lights and time of day apply.
- Scripted battles work through ordinary event commands mid-fight (below).

**5. Units are events and party members.** A unit is either:

- a party member (the leader and followers on the map become units), or
- an event bound to a Database record: the event's Unit card (or a note tag `<unit: enemy 5>`, `<unit: actor 3>`, `<unit: ally 2>`, `<unit: neutral>`) gives it a `Game_Enemy` or `Game_Actor` battler, HP, states and skills, while it remains an ordinary event with pages, move routes and triggers; or
- a troop member spawned as an event at a spot (from the troop's own map layout, or by the Spawn Unit command).

PTBS's `PTBS_Actor:` / `PTBS_Enemy:` comments are read too, so the Demo's PTBS maps convert without rework.

**6. Shared outcomes.** Victory, defeat, escape, rewards (EXP, gold, drops), level-ups and the Battle Processing branch (win / escape / lose) behave the same in every mode, Classic included; a mode supplies only how the fight runs.

## How an on-map battle lives beside the map

- `$gameFight` (one object for all three map modes, with a `mode` and its driver) is created when a fight starts and saved with the map in `Game_Map`'s save data, so **saving mid-battle and loading resumes it**: units' battlers, turn order or timers, objectives, AI memory. Each unit's battler is a `Game_Battler` kept on the unit (`event._rrUnit`); party units point at the real `Game_Actor`s, so damage and states carry over after the fight.
- `Scene_Map` updates the battle in its frame loop. While a fight is on, the player's map controls go to the battle (cursor and menus for Tactical, attack and dodge for Action); Classic encounters are suppressed on that map.
- **Event interpreters and turns.** The map interpreter and parallel events run as usual. In Tactical, a turn waits while the map interpreter is busy (`$gameMap.isEventRunning()`), a message, choice or number input is open, a move route with Wait is running, a camera cut or transfer fade is running, or a battle hook is still executing. So Show Text, choices, cutscenes and scrolling all pause the fight naturally. In Action, the same conditions freeze AI and attacks (the world pauses for dialogue) unless a page sets "Keep fighting during this event".
- **Event commands during a fight.** All stock commands work. Those with battle meaning gain it: Change HP/MP/TP/State/Enemy HP act on units; Show Animation and Action Sequences play on units; Set Event Location moves a unit; Erase Event removes a unit (no reward unless defeated); Transfer Player ends or suspends the fight per a setting (default: ends it as an escape); Battle Processing during a tactical fight starts a nested Classic battle only if the author allows it.
- **New commands** (Reactor tab, also plugin commands so plugins and scripts can call them):
  - Change Battle Mode (System default, this map, or the next battle)
  - Start Battle on Map (mode, troop or tagged units, deployment area, objectives)
  - Spawn Unit (troop member, actor or enemy at a spot or region, with team and AI), Remove Unit, Change Unit Team (built 2026-10-03 as Change Unit Side), Move Unit, Unit Waits / Ends Turn
  - Change Objective (built 2026-10-03 as Change Battle Goal: defeat all, defeat a unit, survive N turns, a switch, a variable; reach an area, protect a unit and seconds are still to come, and a switch covers them meanwhile), End Battle (win / lose / escape)
  - Set Terrain Cost (region or tile), Focus Camera on Unit
- **New page conditions and hooks** (the event editor's Conditions, plus "battle hook" pages that run when their condition fires): battle turn start / end (team or unit), unit defeated, unit HP below N%, unit enters / leaves an area (region, rectangle or spot), unit adjacent to this event, objective changed. Tile and region triggers are the existing region-check pattern with a unit-aware condition.
- **Scripts:** `$gameFight.unit(eventId)`, `.units({ team })`, `.spawn(...)`, `.end(result)`, and the runtime events feed (`battleTurnStarted`, `unitDefeated`, `unitMoved`) for plugins.

## Tactical mode

- **Grid and movement:** one map tile per cell. Move range from the battler's Move (a new actor/class/enemy parameter, default 4) with costs: plain 1, rough terrain and foliage as set, stairs and ramps by height, water by depth (wade 2, swim if allowed), doors cost 1 and open as the unit passes, locked doors block. Height: a step up costs more and is limited by Jump (default 1 storey level); falling is allowed down to a limit. Pathfinding is A* over the cell graph the 3D sidecar already defines (`groundHeightAt`, piece collision, water), cached per turn.
- **Turn order:** team turns (all allies, then enemies) or initiative (AGI order, CTB-style), chosen per battle.
- **Facing and height:** front/side/back multipliers (PTBS's defaults: 1 / 1.2 / 1.5) and a height bonus; line of sight through the 3D world for ranged skills (rocks, walls and closed doors block; foliage gives cover, -20% hit).
- **Skills just work:** a skill with no tactical settings takes a range from its scope (single enemy: melee 1; for all: area round the target 2; ranged weapon: 4-6) and a default AoE from its scope. Authors can set range and area shapes (circle, square, line, cone, cross, self, min and max) in the Database. PTBS's `<PTBS>` note blocks are read.
- **AI:** per enemy and team presets: aggressive, defensive, support (heal, buff), ranged keeps distance, guard a spot or area, follow a leader. The plan for one turn: reachable cells × usable skills scored by damage, risk and objectives, with a time budget.
- **Presentation:** on 2D maps the existing sprite characters; on 3D maps the event models. Cursor, range and AoE highlights drawn on the ground (decals over the terrain mesh), the map camera in any mode, with a tactical camera option (isometric orbit around the cursor). Action Sequences play the attacks in place. The Battle HUD record gains tactical nodes (turn order, unit card, objective line).

## Action mode

- **Real time on the map:** units fight where they stand. Attack on a key or button (weapon attack style: swing, thrust, ranged, cast), dodge roll with brief invulnerability, guard, skills on a hotbar (MP and TP costs, cooldowns), lock-on (nearest in front, cycle), knockback, hit pause, damage popups.
- **Hitboxes:** characters' footprints and heights (sized events already have footprints); weapons give an arc or a reach; projectiles fly through the 3D world and stop at pieces, rocks and closed doors.
- **Enemies:** behavior presets (melee chaser, ranged kiter, charger, caster, turret, swarm), sight cones and aggro radius, return home; their pages can override.
- **Party:** followers fight as AI allies (follow, attack the leader's target, heal) or the leader swaps to another member with a key.
- **2D and 3D:** top-down 2D on pixel movement where the map allows it (pixel movement is new for 2D maps; a phase-3 question); 3D maps in third person, top-down or isometric.
- **Action Sequences** become the attack animations (the phases already exist), driven in real time rather than by the battle's queue.

## First-person mode

Action mode with the `firstPerson` camera and pointer lock: crosshair, aim by mouse or right stick, hitscan or projectile weapons from weapon data (rate, spread, range, optional ammo item), melee as a short-range arc. Enemies use the same presets. Same data, so a game can switch between third and first person mid-fight.

## Where the mode is chosen

- System default: Database › System 1, a Battle Mode card (Classic, Tactical, Action, First Person; Classic default).
- Per map: Map Properties › Battle (inherit, or a mode, plus whether encounters on this map are Classic battles or on-map fights).
- Per troop: Troops › Battle Mode (inherit or a mode; tactical deployment; objectives).
- Per encounter: the Change Battle Mode command, or a Battle Processing option "Use mode".
- Precedence: the command's next-battle setting, then troop, then map, then System.
- Stored as `System.json › reactorBattle`, map sidecar `battle`, troop `reactorBattle`; `$gameSystem` keeps the current override so it saves. Stock MZ ignores all of it and plays Classic.

## Editor for beginners

- One Battle Mode card in System with a picture of each mode and two lines on what it plays like.
- An **event Unit card** (Map events): Team (Ally / Enemy / Neutral), Database record, AI preset, Move. Sensible defaults, advanced folded away (the Build bar pattern).
- **Skills and items:** a Range card with a small grid picker (click cells to paint the range and the area; presets: melee, line, circle, cone, cross); hidden behind "Tactical" when the project never uses Tactical.
- **Weapons:** Attack Style (swing, thrust, bow, gun, staff) with reach and speed, used by Action and First Person.
- **Terrain costs:** on the Build bar's Terrain group a Cost brush; regions keep working.
- **Previews:** the Troops Battle Preview shows a tactical deployment on the map; Battle Test runs any mode on a copy of the map.
- New event commands and conditions appear on the Reactor tab with plain-language labels; every one has a hand-written translation in all 17 locales.

## Performance (weak tier)

- Tactical: pathfinding only on a unit's turn, cached; AI with a 4 ms per-frame budget, spread over frames; highlights are one instanced decal mesh.
- Action: AI at 10 Hz (staggered), hit checks on a spatial grid, 24 active enemies as the design budget (more are idle until near), projectiles pooled, no per-frame allocation.
- First person: hitscan on the existing piece and rock BVHs, at most a few casts per shot.

## Phases

1. **The on-map battle framework** (built 2026-10-02, `runtime/reactor_fight.js`; the turn driver moves every unit itself, the player's controls come with phase 2). The mode switch (System, map, troop, Change Battle Mode), `$gameFight` beside the map with save and load mid-battle, events and party members as units with Database battlers, damage, skills, items and states applied on the map, victory, defeat and escape into the existing rewards and the Battle Processing branch, objectives, the pause rules for messages and events, the first commands and conditions (Start Battle on Map, Spawn Unit, Remove Unit, End Battle, unit defeated, turn start, unit enters area), and a minimal turn driver to exercise it. PTBS tags read. Classic untouched. *Playable:* a scripted fight on a Demo map with a reinforcement, saved and loaded mid-fight.
2. **Tactical** (first version built 2026-10-03, `runtime/reactor_fight_tactical.js`). Grid movement and ranges, team or initiative turns, default skill ranges, simple AI, then the 3D world's height, line of sight, cover, water, doors and foliage costs, facing, the Range grid editor, AI presets, the tactical camera, HUD nodes. *Playable:* a fight across North Haven's square and lanes.
3. **Action on 3D maps** (third person, top-down, isometric; first version built 2026-10-03, `runtime/reactor_fight_action.js`, switching the controlled character not built). Attack, dodge, guard, hotbar, lock-on, enemy presets, followers as allies, Action Sequences in real time. 2D action deferred. *Playable:* clearing the gorge.
4. **First person** (first version built 2026-10-03). Crosshair, weapons, projectiles, aim, on the same framework and Action data. *Playable:* the same fight in first person.
5. **2D action and polish.** Pixel movement for 2D action, controller tuning, accessibility (slow time, auto-target), more AI presets, tutorials in the Demo.

Deferred throughout: networked play, mounted combat, destructible pieces.

## Decisions (owner, 2026-10-02)

1. Tactical reads `PSYCHRONIC_PTBS.js`'s tags and comments (`PTBS_Actor`/`PTBS_Enemy`, `<PTBS>` skill ranges and areas), so existing PTBS maps keep working.
2. Turns: team turns or initiative order, chosen per battle, with a project default.
3. Fights start from events and encounters; a map may also opt in to starting one when the player walks into an enemy unit's range. *Replaced 2026-10-04, see below.*
4. Action and First Person: followers fight as AI allies, and the player can switch which character they control.
5. Every on-map mode uses the game's own actors, enemies, classes, stats, equipment, skills and states; attacks play through Action Sequences with the equipped weapon held (a character draws and aims the equipped rifle, then fires).
6. Not yet asked, defaults until the owner says otherwise: a Transfer Player during a fight ends it as an escape unless the command's event sets "keep fight"; 2D action with pixel movement stays in phase 5.

## Decisions (owner, 2026-10-04)

These replace decision 3 above. They are being built in the 0.98.9 cycle; STATUS.md says what has landed.

1. Fight on sight is the default. Enemy units placed on a map start their fight when the party comes within 6 tiles and can see them. A map that has a Start Battle on Map command waits for its events instead. The start is held while an event runs, a message is open, the party is in a vehicle, swimming or moved by a route, while encounters are off, and after a battle until the leader has left every enemy's start distance once.
2. The same holds on a Classic map: walking up to placed enemies opens a Classic battle against the placed enemies the start rule takes (at most eight, the nearest first), as a troop made for that battle from those units' records. Placing enemies never changes a map's mode.
3. Enemy units placed on a map stay defeated once beaten. "Comes back" on a unit brings it back when the map is entered again.
4. The Demo ships in Classic mode with no test units by North Haven's fountain.
