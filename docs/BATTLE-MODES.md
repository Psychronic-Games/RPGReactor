# Battle modes

A battle is **Classic** (the separate battle screen: front or side view, turn or time progress, battlebacks or a Battle Room) or happens **on the map**: Tactical, Action or First Person. On-map battles keep the map and its events running; every unit is a character on the map carrying a Database battler. The design and the phases still to come are in [DESIGN-BATTLE-MODES.md](DESIGN-BATTLE-MODES.md).

What works today: the mode switch, units, damage, skills, items and states through the stock battle math, outcomes into Battle Processing's branches and the rewards, hooks, saving mid-battle, and **Tactical**, **Action** and **First Person** battles played by the player on 2D and 3D maps (below).

## Choosing the mode

| Where | Set by | Data |
| --- | --- | --- |
| The game | Database › System 1 › Battles | `System.json › reactorBattle: { mode, turns }` |
| A map | a 3D map's sidecar, or a note tag on any map | `MapNNN.r3d.json › battle: { mode }`, `<battle mode: tactical>` |
| A troop | the troop record | `Troops.json › [id].reactorBattle: { mode }` |
| During play | the **Change Battle Mode** command (the whole game, this map, or the next battle) | `$gameSystem._rrBattle` (saved) |

The first that names a mode wins: the next-battle command, the troop, the map (a command for this map, then the map's own), the game (a command, then System). Unset everywhere, battles are Classic. `mode` is `classic`, `tactical`, `action` or `firstPerson`; `turns` is `team` (allies, then enemies) or `initiative` (everyone by AGI).

Battle Processing and random encounters on a map whose mode is on the map fight there; If Win / If Escape / If Lose follow the result.

## A tactical battle in five steps

1. Database › System 1 › Battles: choose **Tactical**.
2. Click **Battle Setup** there (it opens when the Database closes), or in Event mode right-click a tile › Battle Setup.
3. Pick **Enemy** and a record, then click empty tiles. Do the same under **Ally** for allies who join only this battle; the party fights without being placed.
4. Choose when the battle starts and its goal, click **Place battle start**, then a tile.
5. Click **Test battle** (`fight` on the game's launch line starts in the game's own on-map mode; `fightmode=<mode>` names one).

While Battle Setup is open the units stand on the map as their models or characters, colored by side, with a faint preview under the pointer. R (or the card's arrows) turns the selected unit, drag moves it, right-click removes it; each is one undo step. A placed unit has no model of its own and wears whatever its Database record is bound to, in the editor and the game, on 2D and 3D maps.

Skills, items and weapons work untouched. To change its target distance or affected area, open its **Combat** section, **Targeting**; the grid previews Tactical targeting. Move range and Climb are under **Tactical Battles** for actors, classes and enemies; weapons, armor and states can add to them. AI behavior and an enemy's picture on the map are under **Behavior**, since Action and First Person battles use them too. The settings are stored in the record itself ([A record's battle settings](#a-records-battle-settings)).

## An action battle in five steps

1. Database › System 1 › Battles: choose **Action** (or **First Person**).
2. Click **Battle Setup** there (it opens when the Database closes), or in Event mode right-click a tile › Battle Setup.
3. Pick **Enemy** and a record, then click empty tiles. The party fights without being placed.
4. Choose when the battle starts and its goal, click **Place battle start**, then a tile. Or skip the start: Map Properties › Battle › **Battle on sight** starts it when the party comes within that many tiles of an enemy it can see.
5. Click **Test battle**. Left button (F) attacks, right button (G) aims, C dodges, V guards, R reloads.

Weapons work untouched: what a weapon is comes from its type's name. To change it, open the weapon's **Action and First Person Battles** card: what it fires, attack rate, magazine, reload and spread for a gun, combo for a blade. Skills and items set their hotbar cooldown there. The settings are stored in the record itself ([A record's battle settings](#a-records-battle-settings)).

## A record's battle settings

Each record page has one **Combat** section, with these groups:

| Group | Settings | Records |
| --- | --- | --- |
| **Targeting** / **Behavior** | Target range, area of effect and line of sight; AI behavior; enemy appearance on the map | Skills, items and weapons for targeting; actors and enemies for behavior; enemies for appearance |
| **Tactical Battles** | Move range per turn and Climb; movement bonuses and penalties | Actors, classes and enemies; weapons, armor and states |
| **Action and First Person Battles** | Projectile, attack rate, magazine, reload, spread and combo; hotbar cooldown | Weapons; skills and items |

Each group's **Automatic** button resets only its own fields. The section opens when the project fights in a way one of its groups is for, or when the record sets a value in it; folded, its title line says what the record sets. A fold chosen by hand is remembered.

**Target range** is the distance at which a target can be selected, with minimum and maximum values in tiles. Attack and physical skills can **Uses equipped weapon’s range**; the Database shows that as one choice, since each actor may equip a different weapon. Choose **Custom range** to enter distances; choosing weapon range again clears only the range override.

**Area of effect** sets the shape of the affected area. Scope on the skill or item selects who can be affected. A circle, square or cross has a **Radius** in tiles; a line or cone has a **Length**. Single-target, user-only and whole-side effects have no size field. Editing a default radius or length creates an area override directly. Physical skills can also inherit the weapon’s area. The Automatic option shows the actual default, even while a custom shape is selected.

The grid is labeled **Tactical targeting preview**. When it inherits weapon settings, it says **Preview without an equipped weapon**; the actor’s equipped weapon supplies the distances and area during play.

The targeting grid represents Tactical distances. Action reads the same targeting settings, with ranged reach scaled by 2.5; melee weapons use their Action profile's reach. Tactical Move range and Climb do not set real-time movement speed or the map's physical jump height. Ordinary stats, damage, traits, equipment and Action Sequences remain common to all modes. First Person shares Action's combat rules and changes the view.

A record of the Database keeps its battle settings in `rrBattle`, each key there only while the record sets it. The Database's battle cards write it; a script writes the same object:

```json
"rrBattle": {
  "range": { "min": 2, "max": 6 },
  "area": { "shape": "cone", "size": 3 },
  "los": false,
  "move": 5, "jump": 2,
  "ai": "ranged",
  "fireRate": 2.5, "magazine": 10, "reload": 1.6, "spread": 1.5, "combo": 4,
  "projectile": "rocket",
  "cooldown": 6,
  "character": { "name": "Monster", "index": 3 }
}
```

| Key | On | Says |
| --- | --- | --- |
| `range` | skills, items, weapons | reach in tiles; `min` left out is 1 |
| `area` | skills, items, weapons | `shape`: `self`, `single`, `circle`, `square`, `line`, `cone`, `cross` or `all`; `size` for a circle, square, line, cone or cross |
| `los` | skills, items, weapons | `false`: needs no line of sight |
| `move`, `jump` | actors, classes, enemies; weapons, armors, states | Move range and Climb: set on a unit, added (may be negative) by equipment and states |
| `ai` | actors, enemies | `aggressive`, `ranged` or `support` |
| `fireRate`, `magazine`, `reload`, `spread`, `combo`, `projectile` | weapons | Action and First Person battles: shots or swings a second, shots in the magazine, seconds to reload, degrees of spread, swings in a combo; `bullet`, `arrow`, `bolt`, `rocket` or `none` |
| `cooldown` | skills, items | Action and First Person battles: seconds on the hotbar |
| `character` | enemies | its picture on the map: a character sheet's `name` and the `index` (0 to 7) of the character on it. Without it an enemy stands as the 3D model bound to it, else its battler picture (a creature drawn high over its own shadow stands just over it), else a plain figure in its side's color |

In a running game, change a setting by giving the record a new object: `$dataSkills[5].rrBattle = { ...$dataSkills[5].rrBattle, range: { min: 1, max: 3 } }`. A value changed in place (`$dataSkills[5].rrBattle.range.max = 3`) is not seen by a running game.

Tags in a record's Note are also read, for notes typed by hand and imported games, each where the record sets nothing itself: `<range: N>` or `<range: MIN-MAX>`, `<area: self | single | circle N | square N | line N | cone N | cross N | all>`, `<los: no>`, `<move: N>`, `<jump: N>`, `<ai: aggressive | ranged | support>`, `<fire rate: N>`, `<magazine: N>`, `<reload: N>`, `<spread: N>`, `<combo: N>`, `<projectile: bullet | arrow | bolt | rocket | none>`, `<cooldown: N>`, `<unit character: Name, index>`. A battle card shows a record's tags as its settings; the first change in a card moves that card's tags of the record into `rrBattle`. A tag one of the project's own enabled plugins also reads (`<cooldown: N>` in a game with Yanfly's Skill Cooldowns) stays in the Note for the plugin: the card writes the setting, which the game reads first, and the row says the tag stays. `node editor/build-scripts/battle-tags-to-fields.cjs <project folder>` lists every tag of a project it would move and every tag it leaves for a plugin, and moves them with `--write`.

Each of range, area and sight is the record's own, else the equipped weapon's (Attack and physical skills aimed at enemies), else the default. With nothing set: move 4, jump 1; Attack reaches 1, or 2-5 for bows, guns, crossbows and launchers, 2-7 for rifles and cannons, 1-4 for pistols; other skills reach by Scope (one enemy 1-4; all enemies 1-4 over a circle of 2; one ally 0-3; all allies a circle of 3 round the user). PSYCHRONIC_PTBS blocks are read as the same things.

## Tactical

In a Tactical battle the player orders the party's actors; everyone else decides for itself. Team turns (the default): pick any unit that has not acted, in any order; End Turn passes to the other side. Initiative: units act one at a time by Agility.

A unit's turn: its move range shows. OK on a cell walks there, OK on its own cell stays. Then Attack, Skills, Items, Wait (and End Turn). An action shows its range; the cursor shows where it lands and the forecast. OK confirms. Cancel steps back one level and undoes the move until the unit acts. Shift goes to the next unit or target. The mouse hovers and clicks; touch is tap, then tap again.

A blow from the side deals 1.2 times the damage, from behind 1.5. Each level of height adds or takes 10%, up to 30%. Half cover (a counter, a low wall, a bush) leaves 75% of the hit chance, full cover 50%; cover counts from two tiles away and not for an action that needs no line of sight. On a 2D map a cell nobody can walk onto hides what is behind it, unless it is water or a counter; a 3D map adds its walls, rocks, hills and shut doors, and its models where their mesh is (a line passes under a tree's crown). A skill's Repeats and Attack Times+ land as in a Classic battle.

Units that fight by themselves never pass a turn: with nothing worth using they close in, take cover, and keep watch if they can shoot. Units that fight from a distance or support allies (`ai`: `ranged`, `support`) stay behind the ones that close in, and shooters take high ground that gives them a shot. The other side's units that only move walk together; hold the dash key to double the pace of anything the battle plays by itself. **Auto** (when three or more units are still to act) lets the rest of your turn play by each unit's preset.

Armies: there is no cap on units. Database › System 1 › Battles › Party members in battle (`reactorBattle.partySize`; 4 without it) sets how many party members fight and follow, in every battle mode. With more than 16 units standing, units that decide for themselves act at the same time where their actions do not meet; a blow that would fell a party member or badly hurt the leader is shown on its own. With 17 to 20 units standing, actions played side by side keep their Action Sequence at double pace; above 20 they play quick.

Levels: a cell can hold more than one place to stand: the ground under an eave and the eave, a room and its roof, a path and the bridge over it. Each is its own cell to move to, and two units may share a cell at different levels. The path preview shows the climb. Control moves the cursor to the cell's next level; the mouse takes the level its pointer meets. A roof the cursor or a unit is on is kept whole in the view. Cells on a roof the view cannot see from its quarter are shown through it as flat marks, and the view turns to show the cursor's cell when the cursor goes there. A unit event raised onto a roof or a deck in the map view starts the battle standing on it.

Overwatch: a unit whose attack reaches two tiles or more can end its turn on watch. While someone keeps watch, only a walk that comes under that watch is taken one at a time; the rest of the side still moves together. The first enemy that steps into its reach and sight takes one attack at 70% of the hit chance.

Big units: an event with a size covers every cell of it. It blocks them, is hit once by an area, and moves only where all of it fits.

Height: a blow from beside its target lands only within 2 levels of height; a ladder or a mantle costs extra move and the path preview shows the climb.

Up and down: a unit climbs a wall too high to pull itself onto, without a ladder, up to the climb height (Database › System 2 › Physics: **Battlers climb walls without a ladder**, **Highest wall climbed**, 6 tiles; **Climb cost**, 0.75 move per tile climbed, never less than a mantle). It jumps down any height, over an eave or a verge if one is in the way; past **Safe fall** it loses **Damage per tile beyond** of its max HP for each tile, and the path preview shows that HP in red under the move cost. **Long falls in battles** chooses: hurt past the safe fall (the default), unhurt, or no deeper than the safe fall. A fall that would leave the unit with no HP is marked **Fatal fall** under its HP; **Lethal jumps** says what happens: Ask first (the default: a Jump / Stay question before the move, Stay leaves the unit where it was with its move unspent), Allowed without asking, or Not allowed (not offered). Taken, the unit is knocked out on landing. Units that decide for themselves never take one and weigh what any fall costs. The question and the cue are battle words in Database › Terms (`fallAsk`, `fallYes`, `fallNo`, `fallLethal`).

Grapple: an armor whose **Grapple** section is on (Database › Armors) pulls its wearer up to a roof edge or a ledge in sight within its **Reach** and **Highest edge**. Those edges show in the move range in teal; taking one fires a line, pulls the wearer up and climbs it onto the top, and it may walk on with the move it has left. **Uses per battle** (0: no limit), **Cooldown** in turns, and **Costs**: move points, or the action (the move is free, the turn ends on arriving). Units that decide for themselves use theirs. Only actors wear one. A weapon that shoots reaches one tile further for every two levels its user stands above the target, up to three. From two levels up, half cover does not count.

Facing: a unit ends its turn facing the nearest enemy. Left and Right on the command menu turn it first.

View: walls and roofs over the battle are cut away and trees fade, so every unit and marked cell stays in sight. On a 3D map the battle uses the isometric camera and gives the map's camera back at the end; `view: "map"` on Start Battle on Map (or System `reactorBattle.view`) keeps the map's camera. Q / E (and Page Up / Page Down) turn it a quarter, W A S D move it across the screen, the wheel zooms, the mouse at the screen's edge pans, Tab returns to the unit. On a 2D map the display follows the cursor and the unit that acts.

**The fallen.** A party member who falls lies where it fell until it is revived, and so does an ally an event stands for. An enemy goes as its Collapse Effect says: Corpse falls and stays for the battle (anyone can walk over it, and it gets up if revived), No Disappear stays standing, Instant is gone at once, and every other effect falls, lies a moment and fades. Whoever is felled goes over away from the blow: from the attacker, or outward from the middle of a blast. Bodies leave the map when the battle ends.

**Vehicles.** A party that rides land vehicles into a Tactical battle fights from them: a mounted unit moves the vehicle's range and has Dismount in its menu; Attack asks whose attack it is to be when the vehicle can attack, and Skills lists the vehicle's after the unit's own. A unit on foot beside a free vehicle has Mount. The vehicle can be struck, wrecked and revived. See [Authoring vehicles](AUTHORING.md#authoring-vehicles).

**Tactical controls** can be rebound in Database › Controls › Tactical Battles. They are stored in `System.json` as `reactorControls.tacticalKeys` and `reactorControls.tacticalButtons`, mapping a key code or gamepad button to one of `viewLeft`, `viewRight`, `panUp`, `panDown`, `panLeft`, `panRight`, `level`, `unit`, `skip`. Unchanged, they follow the ordinary Page Up, Page Down, Control, Tab and Shift bindings, W A S D move the view and E turns it right (a project that walks with W A S D keeps those keys for the cursor); on a gamepad R3 is next level and L3 is back to the unit. The bindings apply only while a Tactical battle runs.

**Set Terrain Cost** (Battles on the Map in the command picker; `RPGReactor` / `SetTerrainCost`: `type` region or terrain, `id`, `cost`) makes a region or terrain tag blocked (0), slow (2 or more) or normal (1). **Tactical view** in Database › System 1 › Battles or on Start Battle on Map keeps the map's own camera instead of the isometric view. A map with `<battle trigger: N>` in its note starts its battle when the party is within N tiles and in sight of an enemy unit. Transfer Player to another spot of the same map keeps the battle, each party member on its own cell; to another map it ends as an escape unless started with "keep". A kept battle ends as an escape when another battle starts. After a battle that was not lost, the enemies placed on the map that fell in it stay off the map when it is entered again, in every mode: the event's In battle row says Comes back, else its enemy does (Database › Enemies › Combat › Behavior), else it stays gone. A party member added during a battle joins it on a cell beside the leader. A party defeated in a battle that can be lost takes the Lose branch.

## Action and First Person

An Action battle has no turns. The player walks, dashes and jumps as on the map and attacks in real time; everyone else decides for itself. First Person is the same battle seen through the eyes. Left button (F) attacks: a gun fires where the crosshair points while held, a blade chains its combo click by click. Right button (G) aims: less spread, the camera over the shoulder or down the sights. C dodges, V guards, R reloads, Q or the wheel takes the next weapon, Tab locks on, 1-8 use the actor's skills and items. In third and first person the crosshair is the middle of the screen; in isometric, top-down and on 2D maps the weapon points at the pointer. On a gamepad: RT attacks, LT aims, B dodges, RB guards, Y reloads, LB takes the next weapon, R3 locks on.

A First Person battle is seen through the leader's eyes whatever camera the map has, with the weapon in view; the map's camera returns when it ends. In third and first person the mouse is the look: taken when the battle starts, given back for a message, the menu and the end. A guard raised just as a blow lands turns it aside and staggers the attacker. Look speed and direction: `reactorControls.lookSensitivity`, `lookInvert`.

A blow at arm's length lands only on someone within about a tile and a half of the striker's height: nobody is struck through the roof they stand on. A unit that fights hand to hand climbs after a target above it where a ledge, a ladder or a climbable wall is within reach; one that shoots backs off until it can see. Jump against a wall too high to mantle climbs it, up to the climb height. A unit's own fall past the safe fall costs it the same share of max HP as in Tactical (**Long falls in battles**), and nobody else. Lock-on tips the look up or down to a target on another level.

If the mouse gets away during a battle (another window, the browser), nothing opens: a line says "Click to take the mouse" and the next click takes it back. Escape opens the menu. The line is `reactorBattle.terms.takeMouse`.

A weapon is what its type's name says (pistol, rifle, gun, shotgun, cannon, launcher, bow, crossbow shoot; the rest swing) unless it says otherwise itself: `fireRate`, `magazine`, `reload`, `spread`, `projectile`, `combo`; `cooldown` on a skill or item ([A record's battle settings](#a-records-battle-settings)). A shot carries 2.5 times the weapon's tactical range. Every hit is the stock battle math; a gun deals about one attack's damage per second of held fire, a combo's steps 0.5, 0.6 and then a whole attack, and the party takes 0.85 of each blow.

Units notice an opponent in front of them within 9 tiles or beside them within 3, close in or keep their distance by their `ai` preset, flash as they wind up, strike, and rest. The leader opens the fight: the party's other members hold back until the leader attacks or aims a skill or item at the other side; one that is struck fights back at once, and all of them come to a leader under half its HP. At most three wind up on one opponent at a time. A "turn" for hooks, states and a Survive goal passes every 4 seconds. Goals, hooks, sides and the Win / Escape / Lose branches are as in Tactical. A battle that can be escaped is escaped by running: once an enemy has come within 15 tiles, the leader gets further than that from every enemy for a second and a half.

## Units

The party's battle members are units: the leader is the player, the others the followers, who walk on their own during the fight. An event is a unit by:

- its **In battle** row in the event editor (side, Database record, move range), stored as `rrUnit` on the event. This is the way to make one; the Demo's units are all rows;
- in imported or hand-typed data, a note tag: `<unit: enemy 5>`, `<unit: actor 3>`, `<unit: ally 2>` (actor 2 on the allies' side), `<unit: ally enemy 4>`, `<unit: neutral>`, with `move N` for its move range (default 4);
- a `<unit: …>` comment on its current page, or a PSYCHRONIC_PTBS comment (`PTBS_Actor: X`, `PTBS_PartyActor: X`, `PTBS_Enemy: Y`).

The event editor shows a tag unit in the In battle row like any other; changing the row stores it there and takes the tag out. An event that fights only after a switch is one page with that switch and the row: while it shows no page it is no unit.

A unit event keeps its pages, triggers and move routes; it stops wandering on its own while it fights. Its side is the event's, the same on every page: a page change changes how the event looks and acts, not whose side it is on. **Change Unit Side** changes it. On a 3D map, a unit event with no model of its own wears the model the Database binds to its record.

**HUD.** A Tactical battle shows the acting unit lower left, the unit under the cursor lower right (with the forecast while aiming) and the turn order across the top. A panel over a unit or the cursor (on a small map) lets it show through. The Action and First Person HUD leaves the screen while a message or the battle's results are shown. It is its own record, separate from the Classic Battle HUD. Change it in Database › User Interfaces: Stock Layout › Tactical Battle, then Use As › Tactical Battle.

**Action Sequences.** Actions on the map play their Action Sequence, the one a Classic battle would play for the same skill, weapon, class or actor. A unit never leaves its cell: moves change where it is drawn and it is back on its cell when the action ends. Distances are read for the grid: a move to the target stops where the unit's reach (its arm, and the weapon in it) meets the target's body, never inside either; two that already stand closer do not close in: the attacker takes half a pace back and strikes from there. Steps forward, back and aside are half length along the line to the target, and a screen position means home. A skill's Repeats land one after another a few frames apart, each with its own number; a sequence set to land its own hits lands one per Apply Action Effect step. On a 3D map a thrown or fired model flies in the scene and a plain shot is a tracer; animations play at the muzzle and where the shot struck. An action with no sequence plays a built-in one by kind: melee, ranged, magic, item, recovery or area. Camera steps go to the battle's cinematic camera. Not played on the map: Set Home, Hold Sprite Pose, Scrolling Plane, and the battle status, log and background steps.

**Cinematic camera.** In a Tactical battle the camera moves down from the map view for short shots and back: a sweep at battle start, over the shoulder on an aim, a cut to the target on the hit, the round followed on a long shot, slow motion on a kill. Letterbox bars come in and the HUD fades while a shot plays. Database › System 1 › Battles › Cinematic camera: Off; Some actions (default: long shots, area attacks and kills are filmed, other actions only lean the map view toward them); Every action. Slow motion on kills can be turned off. OK or Cancel skips a shot. On a 2D map the shots are pans and zooms. An Action Sequence with Camera steps uses those in place of the automatic shots. `System.json › reactorBattle.cinematic`: `{ "level": "off" | "some" | "every", "slowMotion": true, "skip": true }`.

**Weapons in hand.** A unit with a 3D model carries its equipped weapon between actions: a blade low at its side, a pistol lowered, a long gun in both hands at the ready. Taking aim brings a gun onto the line to the target. A sequence's weapon steps (Show, Move, Hide) hold it as the Battle Room does, and Hide eases back to the carry. A unit drawn as a sprite holds nothing.

## Commands

On the event command picker's Reactor tab, under **Battles on the Map**:

| Command | Does |
| --- | --- |
| Change Battle Mode | The mode for the whole game, this map, or the next battle; "As set" clears it. |
| Start Battle on Map | A battle here: a troop (its members appear round the party when the map has no enemy units of its own) or the map's units, the turn order, the goal, and what leaving the map does (end as an escape, or keep the battle for the party's return). The music is the game's battle BGM (Change Battle BGM sets it). **Pause this event until the battle ends** holds the event's next commands until the battle is over and can put the result (0 win, 1 escape, 2 lose) in a variable; without it the event carries on while the battle runs. |
| Change Battle Goal | A new goal for the battle that is running, judged at once. |
| Change Unit Side | An event (0 is the one running the command) fights as an ally, an enemy or a bystander from now on: at once in a running battle, and in later battles on this map. "As set" gives it back its own side. A bystander with no Database record cannot be made to fight. |
| Spawn Unit | An actor or enemy as a new unit, at a cell, next to an event, or at the cell in two variables; it can look like an existing event. |
| Remove Unit | A unit leaves the battle and the map (or stays as a bystander); no reward. |
| End Battle on Map | Ends it as a win (with rewards), an escape or a loss. |

The goal is what wins: defeat every enemy, survive N turns, defeat one unit, a switch is ON, or a variable is at least a value. A switch or a variable goal is met the moment any event sets it, so a game's own conditions (reach a place, talk to someone, hold out until a counter fills) are goals too. The party falling loses the battle under every goal.

**Troop pages.** A battle a troop comes to (Battle Processing, an encounter, Start Battle on Map naming a troop) runs that troop's pages as the battle screen does, between actions: the same conditions (turn ending, turn A + B * X, an enemy's HP by its place in the troop, an actor's HP, a switch) and spans. Turn 0 is the battle's start and turn 1 its first round; in Action and First Person a turn passes every 4 seconds.

Started by Battle Processing, the battle holds the map's event interpreter, so touch, action and autorun events wait until it ends; parallel events and hooks run. A battle meant to be interrupted by them is started with Start Battle on Map, which does not wait.

## Hooks

A page with **In a battle, runs when** set (Conditions, in the event page editor; a battle hook) runs when its moment comes, if its other conditions hold, and is never the page the event shows: battle starts; turn starts or ends (a turn number, 0 for every turn, and a side); unit defeated (any, an ally, an enemy, this event); a unit enters an area (a region). Stored as `rrFightHook` on the page, or written as a first-line comment such as `<fight hook: turnStart turn=2 team=enemy>`. The battle waits while a hook runs, and for any message, choice or event the map is running.

## Scripts and plugins

`$gameFight` is the battle: `isActive()`, `turn()`, `units({ team, alive })`, `unitOfEvent(id)`, `spawn({...})`, `objective()`, `setObjective({...})`, `setEventSide(eventId, team)`, `end(result)`, `resultOf(serial)`. `ReactorFight.resolveMode(troopId)` and `ReactorFight.changeMode(mode, scope)` work the mode. The [runtime events](RUNTIME-EVENTS.md) feed reports `mapBattleStart`, `mapBattleTurnStart`, `unitDefeated` and `mapBattleEnd`. Classic battles are untouched: plugins that patch `Scene_Battle` or `BattleManager` never run during an on-map battle.
