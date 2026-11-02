# Online worlds, collaboration and live editing

Design, 2026-11-01. **Built so far: steps 1 and 2 of the [build order](#build-order), in Lite mode, with project settings, accounts, chat, an admin page, sleeping and waking, and a shared world lane, plus **Character Creation** for single-player and online games.** Everything else here is still a plan. [Measurements](archive/evidence/online-spike-20261101.json).

## Using it today

**Choose the game type.** Open **Database › Online** and choose **Single player** or **Online**. A project starts as single player and runs no online code. Settings live in their own file, `data/ReactorOnline.json`, which exists only once a project has set something; `System.json` and RPG Maker's other data files stay untouched. Character settings are likewise in `data/ReactorCharacters.json`.

| Setting | What it does |
| --- | --- |
| Public address | Where the game is hosted. Desktop builds use it to find the server |
| Most players | The server's limit; takes effect the next time you deploy |
| Updates per second | Default 5. Higher is more responsive and works the server harder |
| Connect during playtest | Off by default, so playtests stay offline |
| Party | Each player alone, or each leading the starting party |
| Show names, connection label | What players see |
| Signing in | Guests only, accounts or guests, or accounts required; whether new accounts are allowed; shortest password; the screen's title |
| Sleeping and waking | Keep progress on the server, seconds between saves, whether players can start over, whether sleepers show, and for how many days |
| Shared with every player | Which switches and variables are world state |
| Chat | On or off, who can chat, a world channel, speech above heads, the chat key, seconds between messages, longest message, messages kept, blocked words |

**Deploy.** In **Deploy Game**, tick **Online Server** and choose the **Server folder**, such as a mounted `public_html`. Files already there stay unless the game replaces them, including `index.html`. Windows, macOS and Linux builds of an Online project connect to the public address, with or without Online Server ticked.

Rebuilding updates the server and keeps its secret and player data. **Pack files into archives** is off by default and only for hosts that limit file counts. It packs a separate copy, then writes the result, so nothing else in the folder is touched.

**In the game.** The game goes online once a player starts or loads a game, so title and intro maps stay offline.

**Accounts.** A project that uses them asks players to sign in, create an account or (if allowed) play as a guest. An account remembers its character, so signing in on another device brings it back and skips creation. Passwords are stored hashed, sent only in request bodies and locked out after repeated failures (8 per name, 40 per address, for 15 minutes). A guest can't take a registered player's name. Use https: the build warns about an `http` address.

**Sleeping and waking.** A player with an account lives on the server, not their device. The whole game saves on the beat (every 60 seconds by default, never during an event), and a small note of where they stand goes up every five seconds and as the game closes. Signing back in on any device offers **Wake up**, which restores everything and returns them to that spot; **Start over** is optional per project. After a sudden crash they may wake a few seconds' walk back. Meanwhile other players see them asleep on the floor where they stopped. Signing in on a second device signs out the first, so one account is only ever one body. Returning to the title signs off. Guests keep their usual local saves.

**The world lane.** Events run on each player's own game exactly as they do in single player, and everything stays personal unless the project shares it. Under **Shared with every player**, list switches and variables (`1-5, 12`); add `<world>` to an event's note to share its self switches, so a chest opens once for everybody. When a shared value changes, it goes to the server, and every other game applies it through the same `setValue` a Control Switches command uses, so event pages respond as usual. No event command changes, and a single-player game is untouched. Several changes in a moment send only the last. The last change to arrive stands, so two players changing one value at once can overwrite each other, and a shared variable must exist in the project.

**Chat.** T (or the project's key) opens it; Enter sends and Escape closes. Map and World channels are chosen beside the input. A sync carries the world's message count, so chat costs no extra requests until there is news. The server enforces who may chat, the wait between messages, length and blocked words. Players type `/block Name` and `/unblock Name` to hide someone on their own device.

**The owner's page.** `reactor-online/admin.php` shows who is playing, accounts and recent chat, and can remove or ban a player, reset a password and take down a message. Its password is generated at the first deploy, printed once in the build log, and kept only in `reactor-online/config.php` on the server, because anything in a project reaches every player. Banning a player bans their account and their address.

**Characters.** **Database › Character Creation** works for single-player and online games alike:

| Setting | What it does |
| --- | --- |
| How players get their character | Off, choose from a list of actors, or build with sliders |
| Open on New Game | Otherwise only the **Character Creation** event command opens it, for a mirror, barber or tailor |
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

A build copies the Forge's files straight from the editor's source into `reactor-builder/` (36 MB), so an update to the Forge reaches games at their next build. A game that doesn't build characters ships none of it.

Unless a project allows anatomical detail, characters start dressed and stay dressed, and the server refuses undressed ones. Player characters are 18 or older in every project.

**Limits of this version:**

- Built characters are 3D models, so a 2D map shows the actor's own sprite.
- The creator's labels are in English, and the model's face is whatever the Forge's current face is.
- Without an account, a character lives on one device, and a player on a new device starts again.
- The server checks a character's recipe and that the file is a self-contained model. It cannot prove the model matches the recipe, so a modified client could upload a different model.
- On polling, the server trusts positions from clients. With the Engine connected it checks them ([below](#engine-mode)), and it still can't prove a save: only a server running game logic could.
- Only position, facing, walking, chat and the world lane are shared: no jumping height, vehicles, followers or shared events. A remote character stands on the ground beneath them, so someone on a roof can appear at street level.
- Engine mode needs the host's WebSocket proxy on: see [Engine mode](#engine-mode). Without it, games use Lite.

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

On the test server, PHP starts Node as the site's own user with no admin step. Plain WebSocket on port 443 needs Apache's `proxy_wstunnel`, which is installed there but not enabled. Once enabled, the folder's own `.htaccess` should be enough; this is not tested. Without it, the client talks to Node through PHP.

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
- **Binary and small:** a player is 7 bytes (ID, position, direction and moving flag). Each is encoded once, then copied to the viewers near it.
- **Nearby only:** a 16-tile grid and a cap on neighbours per player.
- **Sends spread across frames:** a sixth of players each frame, which removed the once-in-six-frames spike.
- **Lite records:** 12 bytes per player (position, facing and flags, server time, sender clock), read as one file per map.
- **Server rules, client smoothness:** clients move at once and correct if the server disagrees.

## Shared and personal state

The runtime assumes one player: `$gamePlayer` is on over 200 lines in ten runtime files, and switches and variables are global. Remote players are added as extra characters, so that code keeps working for the local player.

Each switch, variable and self switch is **personal** by default, so existing games behave, or **world**, set in Database › Online: see [the world lane](#using-it-today). A **party** scope is still to come. In Engine mode the server will run shared events itself; in Lite the last change to arrive stands.

Start with walking and chat, then personal battles, then shared on-map battles. Tactical and Action fights fit best because they already happen on the map.

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
- **Never trust a client:** recipes, moves and admin actions are all checked on the server.

## Engine mode

`reactor-online/engine.cjs` has no dependencies, so a deploy is still one folder. PHP starts it when a player joins, as the site's own user, on a loopback port, and it leaves after ten minutes with nobody connected. It carries movement and the world lane; accounts, chat, saves and characters stay with PHP.

- **Reaching it:** the game tries `wss://<site>/reactor-online/ws`, which the folder's `.htaccess` passes to the Engine when `mod_proxy_wstunnel` is on. Nobody opens a port. Any failure, then or later, leaves the game on polling.
- **On Apache, once, as root:** `a2enmod proxy_wstunnel && systemctl reload apache2`. Without it the Engine is reached by nobody, stops after two minutes, leaves `engine.unreached`, and is not started again until the next build.
- **Mixed players:** Engine and polling players share one world. The Engine writes its players into the map files every 200 ms and reads the others from them, so a polling player sees an Engine player as usual.
- **Rebuilds:** each build changes a stamp, and the next player to join replaces a running Engine with the new one.
- **World lane:** the Engine is the only writer while it runs, and PHP passes polling players' changes to it. Control Variables' Add and Subtract travel as changes rather than results, in both modes, so two players adding at once both count. If PHP has to write the world itself, the Engine adopts that write.
- **Movement** (Database › Online › Fast connection): *Off*, *Speed*, or *Speed and walls*. Speed is a budget in tiles, so many small reports can't add up to a jump. Walls use a passability grid baked at build from the tileset's passage settings, ignored while a player jumps, rides, is moved by a route or walks through. A refused move is passed to nobody, and the player is put back.

**Limits:** only the player's game runs its events, so the server can't tell a real transfer from a claimed one. It limits transfers to one a second. Speed and walls stop a changed speed or a walk through a wall, not a modified game that claims a transfer each second. Walls can't see a plugin's own rules, so that check is off by default.

Evidence for this section and [Voice](#voice): [online-engine-voice-20261101.json](archive/evidence/online-engine-voice-20261101.json).

**Tested:** the Engine's process, sockets and files by `online-engine.test.cjs`. On demo.rpgreactor.org, PHP started it in 228 ms on the first join, later joins took 13 ms, and four added changes summed correctly. Two real game clients on the live site, with sockets pointed at an Engine on this machine, saw no polling while connected. A position cheat was put back and never seen by the other player, a same-map teleport stood, and twenty simultaneous adds all counted. When the Engine was killed, both carried on by polling with no errors.

**Not tested:** WebSocket through Apache, since the proxy module isn't on yet; walking smoothness over a socket, since headless browsers drew too few frames to judge; and this Engine under load.

## Voice

Off until a project turns it on in Database › Online › Voice. Nearby players hear each other from where they stand, and each character's mouth moves with the sound. Audio goes directly between players over WebRTC, so voice adds almost nothing to the server: PHP only passes each pair's connection offer, once a second at most, for players who have voice on.

- **For a player:** the voice key (V by default) asks for the microphone and turns voice on. After that they hold it to speak, or the microphone stays open if the project chose that. `/voice off` ends it, and `/block name` ends a call and refuses new ones.
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
8. **Shared state scopes, then shared battles.**
9. **God mode.**

0.99.4 still needs to be pushed and verified ([open items](OPEN-ITEMS.md)).

## Player-built structures

An idea from the owner, not built. Players could build their own structures in the shared world and set passwords on their doors to keep others out. This rests on what now exists: accounts give a building an owner, and the world lane gives every player the same state. It still needs the 3D Build tools in the game, building rules set per project (where, how much, what), storing structures on the server so every game loads them, and door locks checked by the server rather than the client, which needs a password step like accounts have.

## Group generation

An idea from the owner, not built. A **group** is a way to generate many characters at once for a town, tribe or civilization with its own look. It uses the standard generator (`CharacterModel.random`) with ranges the author sets: which species, body shapes, ages, clothing and colors can appear. An author could fill a village with people of all shapes and sizes within those limits, or give a desert people and a mountain people a different look. It needs a Forge page for the ranges, a way to generate and save the set, and a way to place them on a map. Many unique models on one map also raises the same cost as a crowded online world, so low-detail versions would help both.

## Open questions

- How does Lite perform on a real budget shared host?
- What does `proxy_wstunnel` plus `.htaccess` need on common hosts?
- Which tiles does the Tank event's footprint change? In the full-update test, a few avatars reached tiles around it that the startup scan had marked as unreachable. Lean avatars cannot leave the grid, but the grid must then match how footprints really behave, and doors and moved events must update it.
- How much do lean avatars need to grow for jumping, swimming, ladders and vehicles? They walk tiles only so far, and movement across maps is untested.
