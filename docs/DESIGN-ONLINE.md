# Online worlds, collaboration and live editing

Design, 2026-11-01. **Built so far: steps 1 to 4, 7 and 8 of the [build order](#build-order), in Lite and Engine modes, with project settings, accounts, chat, an admin page, sleeping and waking, a shared world lane, parties and shared battles, plus **Character Creation** for single-player and online games.** Everything else here is still a plan. [Measurements](archive/evidence/online-spike-20261101.json).

## Using it today

**The Demo is set up for this.** The bundled Demo is an Online project pointed at demo.rpgreactor.org, with accounts or guests, chat, voice, sleeping and waking, four shared values and **Connect during playtest** on, so a playtest of it joins the live world. A new project made from it starts single player and leaves those settings behind.

**Choose the game type.** Open **Database › Online** and choose **Single player** or **Online**. A project starts as single player and runs no online code. Settings live in their own file, `data/ReactorOnline.json`, which exists only once a project has set something; `System.json` and RPG Maker's other data files stay untouched. Character settings are likewise in `data/ReactorCharacters.json`.

| Setting | What it does |
| --- | --- |
| Public address | Where the game is hosted. Desktop builds use it to find the server |
| Most players | The server's limit; takes effect the next time you deploy |
| Largest character, room for characters | Limits on built characters stored on the server, in MB and GB; 0, the default, is no limit |
| Updates per second | Default 5. Higher is more responsive and works the server harder |
| Connect during playtest | Off by default, so playtests stay offline |
| Party, get up after a defeat | Each player alone, or each leading the starting party; whether a defeat sends a player back to where they entered the map instead of Game Over |
| Show names, connection label | What players see |
| Signing in | Guests only, accounts or guests, or accounts required; whether new accounts are allowed; shortest password; the screen's title |
| Sleeping and waking | Keep progress on the server, seconds between saves, whether players can start over, whether sleepers show, and for how many days |
| Shared with every player | Which switches and variables are world state, and which are shared within a party |
| Chat | On or off, who can chat, a world channel, speech above heads, the chat key, seconds between messages, longest message, messages kept, blocked words |

**Deploy.** In **Deploy Game**, tick **Online Server** and choose the **Server folder**, such as a mounted `public_html`. Files already there stay unless the game replaces them, including `index.html`. Windows, macOS and Linux builds of an Online project connect to the public address, with or without Online Server ticked.

Rebuilding updates the server and keeps its secret and player data. **Pack files into archives** is off by default and only for hosts that limit file counts. It packs a separate copy, then writes the result, so nothing else in the folder is touched.

**In the game.** The game goes online once a player starts or loads a game, so title and intro maps stay offline.

**How players are kept.** There is no database. A server holds plain files in a data folder above the web root, and each player's game is a full copy of the game. See [Where players live](#where-players-live).

**Accounts.** New Game asks a new player what they want: **Create an account**, **I have an account** or (if allowed) **Play as a guest**. Creating one asks for a name of 3 to 20 letters or numbers and the password twice; the page states the shortest password the project allows. There is no email, so a lost password is reset by the owner on the admin page, and the sign-in page says so. A device that remembers an account greets it by name with **Wake up** or **Continue**, and **Sign out** for someone else on that device. These are game windows, so they wear the project's window skin and font. An account remembers its character, so signing in on another device brings it back and skips creation. Passwords are stored hashed, sent only in request bodies and locked out after repeated failures (8 per name, 40 per address, for 15 minutes). A registered name is its account's: anyone else who picks it is shown as "Name (guest)", and no two players online share a name (a number is added), at joining and at every change of look (`fairName` in `common.php`). Use https: the build warns about an `http` address.

**Sleeping and waking.** A player with an account lives on the server, not their device. The whole game saves on the beat (every 60 seconds by default, ten seconds after entering the first time, never in the middle of an event or a battle's action, though a battle waiting on its next move saves), and a small note of where they stand goes up every five seconds, in events and battles too, and as the game closes. Someone who leaves before their first save still wakes where they stopped, in a new game. Signing back in on any device offers **Wake up**, which restores everything and returns them to that spot; **Start over** is optional per project. After a sudden crash they may wake a few seconds' walk back. Meanwhile other players see them asleep on the floor where they stopped: each game draws the 64 nearest, one to a tile, so a pile of sleepers on one spot shows as one body. Signing in on a second device signs out the first, so one account is only ever one body. Returning to the title signs off. Guests keep their usual local saves.

**The world lane.** Events run on each player's own game exactly as they do in single player, and everything stays personal unless the project shares it. Under **Shared with every player**, list switches and variables (`1-5, 12`); add `<world>` to an event's note to share its self switches, so a chest opens once for everybody. When a shared value changes, it goes to the server, and every other game applies it through the same `setValue` a Control Switches command uses, so event pages respond as usual. No event command changes, and a single-player game is untouched. Several changes in a moment send only the last. The last change to arrive stands, so two players changing one value at once can overwrite each other, and a shared variable must exist in the project.

**Chat.** A line in the corner of the map always shows the chat and voice keys. T (or the project's key) opens it; Enter sends and Escape closes. Map and World channels are chosen beside the input. A sync carries the world's message count, so chat costs no extra requests until there is news. The server enforces who may chat, the wait between messages, length and blocked words. Players type `/block Name` and `/unblock Name` to hide someone on their own device.

**The owner's page.** `reactor-online/admin.php` shows who is playing, accounts and recent chat, and can remove or ban a player, ban, unban or delete an account, lift an address ban, reset a password and take down a message. Its password is generated at the first deploy, printed once in the build log, and kept only in `reactor-online/config.php` on the server, because anything in a project reaches every player. Banning a player bans their account and their address.

**Characters.** **Database › Character Creation** works for single-player and online games alike:

| Setting | What it does |
| --- | --- |
| How players get their character | Off, choose from a list of actors, or build with sliders |
| When players get their character | As a new game starts, or when an event calls it: see [below](#after-an-intro) |
| Screen title, ask for a name, longest name | The creator's wording and rules |
| Characters to choose from | The list, and for built characters the actor they play as (its class and stats) |
| What players can change | Body, face, hair, outfit, colors, species, extreme proportions, anatomical detail |
| Model quality | Standard (about 11 MB) or high |

A built character works like this:

1. The game opens the creator, whose controls come from the Forge's own data through `CharacterControls.js`.
2. `CharacterGameWorker.js` builds the character with the Forge's modules in the background.
3. Done packs the model, its motions, rig and recipe into one file.
4. A single-player game keeps that file on the player's machine (`save/characters/` on desktop, IndexedDB in a browser), linked from the save file.
5. An online game also uploads it to the server in 1 MB pieces, so a host's upload limit doesn't matter. The server checks it and stores it under a hash of its contents, and everyone who meets that player downloads it once.

A build copies the Forge's files straight from the editor's source into `reactor-builder/` (36 MB), so an update to the Forge reaches games at their next build. A game that doesn't build characters ships none of it. A playtest needs the same files beside the game, because a game's page can only start a worker from its own folder: the editor copies them into the project's `reactor-builder/` when a playtest starts, only when the Forge has changed, and leaves that folder out of builds.

The creator is a menu scene of game windows: tabs, a list of controls, and the 3D view in a window's frame. It wears the project's window skin and font, follows anything a plugin changes about windows, and works by keys, gamepad, mouse and touch. Left and right move a slider (Shift for fine steps) or step through a list, OK opens a whole list or a color, Q and W change tabs, and dragging a slider's bar or the character works too. A name is typed on the project's own Name Input screen. A character starts in everyday clothes even where a project allows anatomical detail, and Back warns once before leaving a character behind. Done takes the character's portrait from the 3D view, framed as the Forge frames a face sheet, and it replaces the actor's face in every window and travels in the character's file. It is one neutral face, not the Forge's eight expressions.

<a id="after-an-intro"></a>**After an intro.** Set **When players get their character** to **When an event calls it**, then put the **Character Creation** event command where the intro hands over. Sign-in still comes first, because New Game is when a player's account is needed; the map and its intro follow, with the player as the first actor until they choose. The command's options:

| Option | What it does |
| --- | --- |
| Only if the player has no character yet | Skips it for someone who already has one, such as an account coming back, so a replayed intro doesn't ask twice |
| The player must finish it | Takes away the way back, for an intro that can't go on without a character |
| Switch set when it ends | On if the player has their character, off if they backed out, so the event can branch |

The same command with none of these is a mirror, barber or tailor.

Unless a project allows anatomical detail, characters start dressed and stay dressed, and the server refuses undressed ones. Player characters are 18 or older in every project.

**Limits of this version:**

- Built characters are 3D models, so a 2D map shows the actor's own sprite.
- The creator's labels are in English, and the model's face is whatever the Forge's current face is. A project whose menus are custom User Interfaces gets the same window skin and font as those menus, but not their layout: the creator has no User Interfaces role yet.
- Without an account, a character lives on one device, and a player on a new device starts again.
- The server checks a character's recipe and that the file is a self-contained model. It cannot prove the model matches the recipe, so a modified client could upload a different model.
- On polling, the server trusts positions from clients. With the Engine connected it checks them ([below](#engine-mode)), and it still can't prove a save: only a server running game logic could.
- Position, facing, walking, chat, the world lane, what a player rides and whether they are in a battle are shared; jumping height, followers, events and the battles themselves are not. Each game runs its own events, so a battle is shared by joining it: see [Shared battles](#shared-battles). Another player's vehicle is a model that follows them, turning in four directions, with the rider upright on it. A remote character stands on the ground beneath them, so someone on a roof can appear at street level.
- Engine mode needs the host's WebSocket proxy on: see [Engine mode](#engine-mode). Without it, games use Lite, and Action and First Person battles play poorly when shared.

**Measured:** on this desktop, in software-rendered browsers, a clothed character built in 7–8 seconds and uploaded in about a second. Packages were 11–12 MB, about 9 MB compressed for download (measured on one 12.8 MB package). Crowds of custom characters have not been load tested.

**Smooth movement.** Reports carry the sender's clock, so a watcher replays the walk as it happened, about 400 ms behind. Reports go out on the beat without waiting for the last answer. After a stall a character hurries to catch up at up to 13 tiles a second instead of jumping; only a move no runner could make, or falling more than 12 tiles behind, is shown at once. Measured on the demo server at 60 fps over 30 seconds: fastest frame 7.6 tiles a second at a running speed of 7.5, no frame over the limit. No stall happened in that run; a stall is covered by `online.test.cjs`. Some reports on the test server take about a second, which fits `mod_fcgid` starting a process but isn't confirmed. WebSocket mode would avoid that path.

RPG Reactor is open source, so this is built for creators who run their own worlds. Five features share one foundation:

1. **Online worlds:** many players on one map, with no router setup.
2. **Collaboration:** several authors on one project at once, without corrupting its JSON.
3. **Live editing:** editing a game while it plays.
4. **God mode:** an admin's editor connected to a running world, seeing players and adding events.
5. **Voice as your avatar:** your microphone moves your character's mouth and comes from where your character stands.

The foundation is a **project server** and a **stream of changes**. An editor, a running game and a remote player are all clients of the same server. God mode is an editor and a player connected at once.

## Principles

- **Cheap and easy first.** One build option writes one folder, and the world is live. Lowest latency and the most players on the fewest resources decide every trade-off.
- **A bigger world needs a bigger server, not a different setup.** The same folder runs at every size.
- **The server handles information; it draws nothing.** All graphics, audio and input stay on each player's machine.
- **Each client runs the whole game.** Online play is added on top of the normal single-player game, which is what lets existing plugin-heavy games work. Plugins keep running on the client and need no server support. Plugins that assume one player will be dealt with as they appear.
- **Every creator decides for themselves.** Rules, scale and hosting are theirs.

## What was measured

Real runtime in plain Node on Demo North Haven (200×200 tiles, 14,153 pieces, 19 events), real sockets, bots walking at random, 10 snapshots a second, at most 64 neighbours per player. Every player was on one map in one thread, a worst case. "Server" is the owner's AMD EPYC 7401P (2017, Node 20); the desktop is a Ryzen 9 9950X3D (Node 26). The engine was started from PHP as the site's own user, and bots ran on the same machine.

| Design | Machine | Players | One core | Frames over budget | Lag (p50 / p99) |
| --- | --- | --- | --- | --- | --- |
| Full character update every frame | Server | 200 | 68% | 6.9% | 61 / 115 ms |
| Full character update every frame | Server | 500 | Saturated | 55% | Failed |
| Lean avatars | Desktop | 1,000 | 10% | 0% | 51 / 101 ms |
| Lean avatars | Desktop | 8,000 | 47% | 16.6% (before sends were spread) | 76 / 128 ms |
| Lean avatars, sends spread | Server | 1,000 | 48% | 0% | 57 / 103 ms |
| Lean avatars, sends spread | Server | 2,000 | 81% | 0.33% | 57 / 107 ms |

About 150 MB of memory per world, and 4.4 KB/s to each player. Lag includes waiting for the next snapshot, so most of it is the 10-a-second rate, which can be raised.

**Lite (PHP alone), one file of fixed-size records, no database, 5 updates a second, over the LAN to the same server:**

| Players | Requests/s | Median | p99 | Requests over 100 ms | Errors |
| --- | --- | --- | --- | --- | --- |
| 100 | 491 | 0.9 ms | 6.7 ms | 24 | 0 |
| 200 | 996 | 0.9 ms | 7 ms | 39 of about 12,000 | 0 |
| 400 | 1,376 | 0.9 ms | 1,005 ms | 454 | 372 |

The wall is at about 1,400 requests a second. The roughly 1-second outliers look like Apache's `mod_fcgid` starting another PHP process, which is not confirmed.

**What made the difference:** the runtime's character update is built for one player at 60 frames a second, and its collision check costs about 0.14 ms on this map. A walking player needs one decision a tile, about four a second. Lean avatars make that one decision on a collision grid and interpolate between tiles, for the same amount of walking at about a sixth of the CPU on the desktop (59% of a core down to 10% at 1,000 players). On this map the 2D tile layer is empty, so a tile-only check calls every tile walkable: collision lives in the 3D pieces and is reached through `canPass`.

**Not measured:** real internet latency and player connections, TLS cost on WebSockets, a real shared host, 4,000 players on the server (the run timed out), chat, shared events, battles, saves or plugins under load. The test server is also much stronger than a typical cheap VPS, so expect lower capacity there.

## How it runs

### One folder, three modes

The build writes one folder, and the game picks the best mode it can find on first contact. Nobody chooses.

| Mode | Needs | Rough capacity | What it adds |
| --- | --- | --- | --- |
| **Lite** | Any PHP host | About 200 on the test server; less on a budget shared host, to be measured | Accounts, saves, collaboration, positions, chat |
| **Engine** | PHP that can start Node, and a WebSocket proxy | Up to about 2,000 per map on the test server, measured with the spike server, not this Engine | Pushed updates, movement checks, and one writer for the world lane |
| **Game on the server** | Not built | | Shared events and proof of what a player did |

On the test server, PHP starts Node as the site's own user with no admin step. Plain WebSocket on port 443 needs Apache's `proxy_wstunnel`, which is on there since 2026-11-02; with it, the folder's own `.htaccess` is enough ([Engine mode](#engine-mode)). Without it, the client talks to Node through PHP.

**Self-hosting:** the same folder runs on the author's own PC with `node server/start.cjs`, or a Host button in the editor. That is immediate on a LAN. Reaching the internet from home needs port forwarding, so a later option is a home machine connecting outward to a small relay on any web server.

### Scaling up

Each active map gets its own Node worker, so capacity follows cores. An EPYC-class server has room for thousands in total across maps, though only the single-map figure is measured. Players see only those near them, so traffic per player stays flat as a world grows.

### Build › Online Server

Beside Windows, macOS, Linux and Web in Deployment, using the existing remembered output folder:

- **Choose a folder:** a mounted web folder or a local path. Deploying is writing that folder. SFTP and FTP can come later.
- **Tied to the project:** each server records its project ID, runtime revision and protocol version, so a rebuild updates the world from the project that owns it.
- **Updates are atomic:** new files go in beside the old ones and swap at the end. Accounts, characters and saves are kept in a data folder a build never replaces, above the web root where the host allows it.
- **Baked at build:** the collision grid per map (a slow scan done once), so the server only reads it. Lite can check steps too.

## Protocol

- **Transport-neutral:** the same messages over polling or WebSocket. [WebTransport](https://web-platform-dx.github.io/web-features-explorer/features/webtransport) reached all major browsers in 2026 and can be added behind the same layer when it is worth it.
- **Binary and small:** in the Engine a player is 11 bytes (slot, position, flags and the sender's clock); the spike's was 7. Each is encoded once, then copied to the viewers near it.
- **Nearby only:** a 16-tile grid and a cap on neighbours per player.
- **Sends spread across frames:** in the spike server, a sixth of players each frame, which removed the once-in-six-frames spike. The Engine sends to everyone on each snapshot (15 a second by default) and skips a beat for a connection that is backed up.
- **Lite records:** 12 bytes per player (position, facing and flags, server time, sender clock), read as one file per map.
- **Server rules, client smoothness:** clients move at once and correct if the server disagrees.

## Shared and personal state

The runtime assumes one player: `$gamePlayer` is on over 200 lines in ten runtime files, and switches and variables are global. Remote players are added as extra characters, so that code keeps working for the local player.

Each switch, variable and self switch is **personal** by default, so existing games behave, or **world**, set in Database › Online: see [the world lane](#using-it-today). **Party** values are [listed alongside them](#parties). In Engine mode the server will run shared events itself; in Lite the last change to arrive stands.

Start with walking and chat, then personal battles, then shared on-map battles. Tactical and Action fights fit best because they already happen on the map.

### Where players live

| What | Where | Lasts |
| --- | --- | --- |
| Account: name, password hash, character's name, actor and model | `accounts/<hash of name>.json` | Until removed |
| Progress: the whole game's save | `accounts/<hash>.save`, one step back in `.save.bak` | Replaced each save |
| Where they stopped | `accounts/<hash>.wake`, and `sleep/m<map>/` for others to see | Replaced every 5 seconds |
| Built character | `models/<hash of contents>.rrch` | Shared by content |
| Who is online: slot, name, actor, model, ride, battle | `names.json` | Until the slot is reused |
| Each slot's current visit, which its token must match | `nonce.bin`: 8 bytes per slot | Until the slot is reused |
| Parties and invitations | `parties.json` | Until the party empties |
| Running battles and their messages | `battles.json`, `battles/<id>.log` | Removed 5 minutes after they stop |
| Where they stand | `p2m<map>.bin`: 12 bytes per slot, one file per map | About 5 seconds stale |
| Shared switches and variables | `world.json` | Until changed |

**In the running game**, a player is `$gamePlayer`, `$gameParty` and `$gameActors`, as in single player, restored from their own save. Everyone else is a `Game_RemotePlayer`: a drawn character with a name and a model, and no battler, no party and no events of its own. It isn't in `$gameMap.events()`, so event commands and Conditional Branches can't see it, and a Show Text can't name it. In a shared battle a player's actors also stand as units, with a copy of their stats.

**Events** run on each player's own game. A chest, a quest or Rhea's raid happens only for the player who triggered it, unless the project shares the switch or variable it uses. Then the others' events respond through the ordinary `setValue`. Nothing on the server runs an event.

### What each player has to themselves

Every game runs the whole game for its own player, so most of the Database and most event commands work as in single player, separately for each person. This is the list to check when designing an online game.

| Feature | Online |
| --- | --- |
| Actors, party, levels, items, gold, equipment, skills | Each player's own. There is no trading yet. |
| Switches, variables, self switches | Each player's own, unless listed as world or party values, or marked `<world>` |
| Event pages, Erase Event, Transfer Player, Show Text, choices | Run on the game of the player who triggered them |
| NPC movement, weather, tint, timers, music | Each player's own; two players see the same NPC in different places |
| Random encounters, Battle Processing | The player's own battle, which others nearby can join |
| Troop and battle pages | Run only on the hosting game; guests see their results |
| Experience, gold and drops from a battle | Each player gains them on their own game |
| Game Over | The player gets up where they last entered a map, fully recovered (Database › Online › Get up after a defeat). Off: the title screen, which signs them out |
| Save in the menu | Also saves to the server for an account, so Wake up finds it |
| Shop, Name Input, menus | Pause only that player's game. In a shared battle the host's menu still pauses the battle for everyone |
| A message on the host's screen | Holds a shared Tactical or Classic battle until answered; a real-time one carries on |
| Fighting another player | Join their battle against them, or challenge them with `/duel Name` |

### Parties

**Challenges.** `/duel Name` asks another player on screen. If they accept, the challenger's game starts a battle on the map, in the mode the map or game uses (Tactical where that would be Classic), and holds it for up to a minute until the other player arrives on the other side.

Type `/invite Name` in chat; the other player is asked on screen. `/accept`, `/decline`, `/leave` and `/party` do the rest. A party has up to eight players and a leader, listed in the corner of the screen, with a Party channel beside the chat box and `[Party]` on its members' names. Everyone keeps their own game, actors and save. A party member in a battle is the first choice offered to anyone who joins it. The list is `parties.json`, by name, since a slot lasts one visit.

- **Party switches and variables:** Database › Online lists them under Shared with every player, beside the world's. A change reaches the other members within a few seconds through the ordinary `setValue`, so event pages respond as usual. The last change to arrive stands. The Demo shares switch 13 and variable 16.
- **Following:** `/follow` walks after the leader, or `/follow Name` after anyone in the party, across maps too. `/stop` or walking by hand ends it; events and battles only pause it.

### Shared battles

**Tactical battles are shared.** Walking within 12 tiles of one offers **Join _name_'s side**, **Join the enemies**, **Fight for myself**, **Watch** or **Retreat** (and **Join _friend_** first, if a party member is in it). Asked once, until the player has gone 20 tiles away.

- **The player whose game started a battle hosts it.** Their game rolls every hit and moves every enemy. Lite has no game on the server, and two games rolling separately would disagree.
- **The server lists battles and carries messages.** `battles.json` holds each one's map, place, host, sides and members: the players the host's game has let in, which its beats carry. Each listed battle has a log, `battles/<id>.log`; only its host and members write to it, and anyone else may only ask to join or leave. Players in a battle read it about three times a second; everyone else hears of battles every 3 seconds, with party news.
- **Guests mirror it.** A guest's game runs the same battle screen in `reactor_online_battle.js`, with no queue, AI, pages or outcome of its own. It plays what the host reports: walks, actions with their results already rolled, and corrections to the numbers. On a guest's turn the normal menus work, and the finished order goes to the host. The guest's own units are its real party, so wounds last after the battle.
- **On the host,** a guest's actors are event units with a `Game_RemoteActor` battler, built from a copy of their stats. Their turn waits where an enemy would think, and the host takes orders only from the player whose units they are. After 90 seconds without orders they decide for themselves. A joiner gets a turn before the round ends.
- **Sides** are team names. Targeting only compares names, so someone fighting for themselves is a third name with its own turn. On a mirror the names are turned so its own side is `ally`, and every side but a player's own wears the enemy color (`F.isFoeTeam`) on the turn strip, rings and goal count.
- **Ending:** with other players in it, a Defeat All battle lasts until one side stands, even if the host's party falls. Other goals end as they would alone. A guest who leaves is removed; if the host leaves, [another player takes it on](#shared-battles).
- **Rewards and consequences stay personal.** Each game applies its own experience, gold and event results. Only the host's events run in the battle, and a host's Show Text holds the battle until they answer it.
- **Saving is off during a shared battle,** since half of it is on another machine. Where a player stands is still noted.

**Classic battles** are shared the same way, in `reactor_online_classic.js`. Coming near one offers **Join _name_'s side**, **Fight _name_** or **Retreat**, since the screen has two sides.

- **Joining the host's side:** each game adds the other's actors to its party for the battle as temporary actors, and both face the same troop.
- **Fighting them:** each sees the other's party in the troop, wearing their character. The host's monsters are on a challenger's side, so a challenger's screen doesn't show them; what they do is told in the battle log.
- **Turns:** the host's clock decides when an order is wanted, whichever battle system the project uses, and takes orders only for the sender's own battlers. A mirror always runs turn by turn. After 60 seconds without orders a player's battler guards.
- **Ending:** a shared Classic battle can't be a Game Over. Fighting the host, one side's win is the other's loss.
- **Battle screen details:** other players' numbers come from a copy of their stats and last until the battle ends.

**Watching.** A Tactical battle (and an Action or First Person one) also offers **Watch**: the same mirror with no units of your own, seen from the host's side. Cancel leaves. A Classic battle can't be watched, because its screen is built around a party.

**When a host leaves** a Tactical battle, the lowest-numbered player left in it takes it on after about 12 to 20 seconds. Their game already holds every unit and number, so it starts thinking for itself from the next round and announces a new battle, naming the old one, which the others follow. The leaving host's units go with them. If only watchers remain, it ends. A Classic battle ends as an escape for its guests.

**Action and First Person battles** are shared in `reactor_online_action.js`. Coming near one offers the same choices as Tactical, **Watch** included. A player joins as their leader alone.

- **Each player moves on their own game.** Their body reaches the others as anyone's does, and their unit stands on that body, so enemies chase it and shots stop on it.
- **The host runs the enemies.** Guests see them walk, from ten reports a second, and see shots as pictures that land on nothing.
- **A guest's own weapon decides what it hit**, because a shooter should hit what they saw, and reports that to the host, which rolls the damage and tells everyone. The host accepts shots, motions and hits only for the sender's own unit, holds a shot's numbers to what a weapon can have (`fairShot`) and a hit's share to 0–1. A modified game could still claim hits it didn't make.
- **Guard and dodge** are reported as they start, so they count on the host.
- **Messages** go straight through the Engine's relay, which only carries them and says who sent them. Each sender may put 256 KB a second on the wire, and a recipient whose connection is backed up misses messages rather than being cut off. A player without the Engine reads the battle's log, about three times a second, which works but plays badly.
- **Every side** counts through `F.isSide`, so a third side works as it does in Tactical.

**Vehicles.** A player who joins a Tactical battle riding stays aboard, with the vehicle's move range. Everyone sees the vehicle, and attacking with it works: the guest's game sends the vehicle's numbers as they join, and the host uses them. Action and First Person battles take riders off their vehicles as they start, as they do alone.

**Not built:**

- **Hitting a guest's vehicle.** Blows aimed at a guest land on the rider, and the host doesn't track that vehicle's HP.
- **Mounting or dismounting partway through a shared battle** isn't tested.

## Collaboration

There is no central edit log today: map undo (`MapHistory`), events and the Database each keep their own, and saves write whole files, up to 1.7 MB for North Haven's sidecar.

- **Sync per record:** one actor, one event, one map region, compared against a common base with a three-way merge at save points.
- **Presence and soft locks:** see who is where, and who is editing what. Two people changing different fields of one record merge; the same field asks.
- **The server validates and writes atomically,** so JSON cannot be corrupted, and it keeps a history for rollback.
- **Assets are stored by content hash,** and only changed files move.
- **This suits Lite:** it works over plain HTTP.

[Yjs](https://npmjs.com/package/y-websocket)-style merging could come later for fine-grained live editing, but it would change how the editor holds its data.

## Live editing and god mode

A playtest is a separate process with no link back to the editor. The record-level change stream gives it one, so editing a map or event can apply to the running game. This needs no server and proves the change format, so it comes first. God mode is the same stream pointed at a world, with an admin login and players drawn in the editor's map view in real time.

## Character creation in game

Built: see [Using it today](#using-it-today). Players upload finished **models**, not recipes, so only the person creating a character pays for building it and everyone else just downloads it.

- **Size:** about 36 MB of Forge files, loaded only by someone creating a character.
- **Crowds:** characters are about 40,000–80,000 triangles and the Builder's guide lists crowds as not yet supported. Busy maps will need low-detail versions or baked sprites.
- **Anatomical detail** is off and locked unless the server's creator allows it.

## Security

- **Remote code is the largest risk.** Script commands and plugins are JavaScript with full Node access on desktop builds. Anything that can push an event to a desktop client could run code on that PC. Online play uses the browser or a Node-disabled client.
- **Collaborators are trusted like developers.** Changes containing code (plugins, Script commands) need approval before they run.
- **Server uploads** never land where PHP would execute them, and are stored by hash outside the web root where possible.
- **Never trust a client:** recipes, moves and admin actions are all checked on the server, and a value JSON can't hold is refused rather than written over a good file (`jsonText`).
- **A token is good for one visit.** Joining gives the slot a new nonce (`nonce.bin`), and the API and the Engine refuse a token from an earlier visit. Once a player is removed or signs in elsewhere, everything that token asks is refused.

## Engine mode

`reactor-online/engine.cjs` has no dependencies, so a deploy is still one folder. PHP starts it when a player joins, as the site's own user, on a loopback port, and it leaves after ten minutes with nobody connected. It carries movement and the world lane; accounts, chat, saves and characters stay with PHP.

- **Reaching it:** the game tries `wss://<site>/reactor-online/ws`, which the folder's `.htaccess` passes to the Engine when `mod_proxy_wstunnel` is on. Nobody opens a port. Any failure, then or later, leaves the game on polling.
- **On Apache, once, as root:** `a2enmod proxy_wstunnel && systemctl reload apache2`. Without it the Engine is reached by nobody, stops after two minutes, leaves `engine.unreached`, and is not started again until the next build, so deploy again after turning it on.
- **Mixed players:** Engine and polling players share one world. The Engine writes its players into the map files every 200 ms and reads the others from them, so a polling player sees an Engine player as usual.
- **Rebuilds:** each build changes a stamp, and the next player to join replaces a running Engine with the new one.
- **World lane:** the Engine is the only writer while it runs, and PHP passes polling players' changes to it. Control Variables' Add and Subtract travel as changes rather than results, in both modes, so two players adding at once both count. If PHP has to write the world itself, the Engine adopts that write.
- **Movement** (Database › Online › Fast connection): *Off*, *Speed*, or *Speed and walls*. Speed is a budget in tiles, so many small reports can't add up to a jump. Walls use a passability grid baked at build from the tileset's passage settings, ignored while a player jumps, rides, is moved by a route or walks through. A refused move is passed to nobody, and the player is put back.

**Limits:** only the player's game runs its events, so the server can't tell a real transfer from a claimed one. It limits transfers to one a second. Speed and walls stop a changed speed or a walk through a wall, not a modified game that claims a transfer each second. Walls can't see a plugin's own rules, so that check is off by default.

Evidence for this section and [Voice](#voice): [online-engine-voice-20261101.json](archive/evidence/online-engine-voice-20261101.json).

**Tested:** the Engine's process, sockets and files by `online-engine.test.cjs`. On demo.rpgreactor.org, PHP started it in 228 ms on the first join, later joins took 13 ms, and four added changes summed correctly. Two real game clients on the live site, with sockets pointed at an Engine on this machine, saw no polling while connected. A position cheat was put back and never seen by the other player, a same-map teleport stood, and twenty simultaneous adds all counted. When the Engine was killed, both carried on by polling with no errors.

WebSocket through Apache now works on the test server, opening in 13 ms, and real-time battles run over it. **Not tested:** walking smoothness judged by eye, and this Engine under load.

## Voice

Off until a project turns it on in Database › Online › Voice. Nearby players hear each other from where they stand, and each character's mouth moves with the sound. Audio goes directly between players over WebRTC, so voice adds almost nothing to the server: PHP only passes each pair's connection offer, once a second at most, for players who have voice on.

- **For a player:** the voice key (V by default) asks for the microphone and turns voice on. After that they hold it to speak, or the microphone stays open if the project chose that. The line in the corner says which, and how many can hear: both players must have turned voice on and be in range. `/voice off` ends it, and `/block name` ends a call and refuses new ones.
- **The mouth:** live loudness and pitch drive the same mouth shapes a Show Text uses, on the same rig, with each speaker keeping their own state. A character talking in a Show Text keeps its mouth until that ends. In 2D, or on a model with no mouth shapes, a ♪ shows beside the name.
- **Reach:** each player connects to their eight nearest speakers within hearing range, with volume falling off over distance and panning left or right by position.

**Limits:** a direct call shows each player the other's internet address, so nobody connects until they press the voice key, and the setting's help says so. The default connection server is a public Google one, which sees that the two players are connecting but carries no sound. Without a TURN server, players behind some home routers will not connect ([about 10–25% of connections](https://getstream.io/resources/projects/webrtc/advanced/stun-turn/) need a relay), and they are retried every 20 seconds. Eight listeners is a guess at a home upload, not a measurement; hundreds of people in one place would need a media server. Mute, block and hold-to-talk are in; reporting a player is not. Models built before runtime 20261101.40 have no mouth shapes until rebuilt.

**Tested:** on demo.rpgreactor.org, two browsers with simulated microphones connected in 4–11 seconds. Each heard the other, a block ended the call, unblocking reconnected it, and turning voice off ended it at both ends. A character built in the game and uploaded to the server moved a remote player's real mouth shapes on every drawn frame, opening up to 0.58 with changing shapes.

**Not tested:** real microphones and speech, two different networks or home routers, a TURN server, and how natural it looks: the test sound was Chromium's beep.

## Build order

Each step is usable and fun on its own, and demo.rpgreactor.org hosts each one.

1. **Two players on one map:** built, in Lite and [Engine mode](#engine-mode).
2. **Build › Online Server:** built. One click deploys it, with updates.
3. **Accounts, chat, server saves and the world lane:** built.
4. **Voice as your avatar:** [built](#voice).
5. **Local live editing.**
6. **Project server and collaboration.**
7. **Character creation with server rules:** built, including uploading characters to the server.
8. **[Parties, shared state scopes and shared battles of every mode](#shared-battles):** built.
9. **God mode.**

Steps 1 to 4 and 7 shipped in 0.99.4, and step 8 is in 0.99.5 (in development), with [real-world testing still open](OPEN-ITEMS.md).

## Player-built structures

An idea from the owner, not built. Players could build their own structures in the shared world and set passwords on their doors to keep others out. This rests on what now exists: accounts give a building an owner, and the world lane gives every player the same state. It still needs the 3D Build tools in the game, building rules set per project (where, how much, what), storing structures on the server so every game loads them, and door locks checked by the server rather than the client, which needs a password step like accounts have.

## Group generation

Built on 2026-11-10 as Forge › Character Groups ([guide](CHARACTER-BUILDER.md#character-groups)); placing a group on a map is not. The idea as first written: a **group** is a way to generate many characters at once for a town, tribe or civilization with its own look. It uses the standard generator (`CharacterModel.random`) with ranges the author sets: which species, body shapes, ages, clothing and colors can appear. An author could fill a village with people of all shapes and sizes within those limits, or give a desert people and a mountain people a different look. It needs a Forge page for the ranges, a way to generate and save the set, and a way to place them on a map. Many unique models on one map also raises the same cost as a crowded online world, so low-detail versions would help both.

## Open questions

- How does Lite perform on a real budget shared host?
- What does `proxy_wstunnel` plus `.htaccess` need on common hosts?
- Which tiles does the Tank event's footprint change? In the full-update test, a few avatars reached tiles around it that the startup scan had marked as unreachable. Lean avatars cannot leave the grid, but the grid must then match how footprints really behave, and doors and moved events must update it.
- How much do lean avatars need to grow for jumping, swimming, ladders and vehicles? They walk tiles only so far, and movement across maps is untested.
