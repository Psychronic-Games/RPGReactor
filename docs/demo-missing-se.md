# Demo: assets not on disk

Re-verified 2026-09-04 against `template/Demo`: 121 distinct animation SE
names missing, 75 SE files on disk. The owner is replacing stock assets with originals as they are
made; keep this list current rather than restoring stock files.

## Character and battler art

- `img/characters/Actor1` — actors 2–8 (Carol Everson, Chase, Karen, Herbert,
  Katie, Elija, Rosanna)
- `img/sv_actors/Actor1_2` … `Actor1_8` — actors 2–8; `Actor2_2` — actor 1
  (Fleagus Gustafario)
- All five enemies have no battler art in `img/enemies` or `img/sv_enemies`

Actors 1–2 carry `Database.r3d.json` model bindings, so their map sprites are
3D regardless; the remaining references only matter where a 2D sprite is drawn.

## Animation sounds

Resolved 2026-09-13. Animations the Demo shares with Star Shift Rebellion keep that project's own sounds, copied over: Push, Thunder11-long, Railgun-01, swipe, blaster_16, blaster_14 (Gamma Ray Pulse and Graviton Shot fire their blasters, the Demo's Graviton Shot had no sound at all, Shoot Normal its railgun, Thunder All 1 its long thunder, Shoot Special its swipe). A stock sound name the Demo does not carry (the owner replaces stock assets with originals as they are made) names a Demo sound of its family instead: slashes and swords to slash-01/02, blows and earth to hit-01..03, thunder to blaster-05/02, fire and explosions to the Single Blast, wind, water, ice and jumps to whoosh-01..05, buffs, flashes and holy light to powerup-01..03, curses, darkness, roars and war cries to drone-01, guns to gun-shot-01. A missing sound stopped the browser build with a load error. When an original replaces one of these, re-pick it in the animation.

Stock names on the family fallback: Absorb2 → drone-01, Attack2 → hit-02, Attack3 → hit-03, Battle3 → drone-01, Blind → drone-01, Blow1 → hit-01, Blow2 → hit-02, Blow3 → hit-03, Break → hit-01, Crash → hit-01, Crossbow → gun-shot-01, Damage2 → hit-02, Damage4 → hit-01, Darkness1 → drone-01, Darkness2 → drone-01, Darkness3 → drone-01, Darkness4 → drone-01, Darkness5 → drone-01, Darkness7 → drone-01, Darkness8 → drone-01, Dive → whoosh-01, Down2 → drone-01, Earth1 → hit-01, Earth2 → hit-02, Earth3 → hit-03, Earth4 → hit-01, Earth5 → hit-02, Evasion1 → whoosh-01, Evasion2 → whoosh-02, Explosion1 → EVFX06_01_SingleBlast, Explosion2 → EVFX06_01_SingleBlast, Explosion4 → EVFX06_01_SingleBlast, Fire1 → EVFX06_01_SingleBlast, Fire2 → EVFX06_01_SingleBlast, Fire3 → EVFX06_01_SingleBlast, Fire6 → EVFX06_01_SingleBlast, Fire7 → EVFX06_01_SingleBlast, Fire8 → EVFX06_01_SingleBlast, Fire9 → EVFX06_01_SingleBlast, Flash1 → powerup-01, Flash2 → powerup-02, Float1 → whoosh-01, Float2 → whoosh-02, Gun1 → gun-shot-01, Gun2 → gun-shot-01, Gun3 → gun-shot-01, Ice1 → whoosh-01, Ice10 → whoosh-05, Ice11 → whoosh-01, Ice3 → whoosh-03, Ice5 → whoosh-05, Laser1 → blaster-01, Magic1 → powerup-01, Magic10 → powerup-01, Magic12 → powerup-03, Magic2 → powerup-02, Magic5 → powerup-02, Monster1 → drone-01, Paralyze1 → blaster-05, Paralyze2 → blaster-02, Paralyze3 → blaster-05, Particles1 → blaster-01, Particles4 → blaster-04, Phone → select-03, Poison → drone-01, Raise2 → powerup-02, Reflection → powerup-01, Saint4 → powerup-01, Sand → whoosh-01, Silence → drone-01, Skill1 → powerup-01, Skill2 → powerup-02, Skill3 → powerup-03, Slash1 → slash-01, Slash2 → slash-02, Slash3 → slash-01, Slash4 → slash-02, Slash5 → slash-01, Slash8 → slash-02, Sleep → drone-01, Sound2 → bell-01, Sound3 → bell-01, Stare → whoosh-01, Starlight → powerup-01, Sword1 → slash-01, Sword2 → slash-02, Sword4 → slash-02, Sword5 → slash-01, Teleport → whoosh-01, Thunder1 → blaster-05, Thunder10 → blaster-02, Thunder2 → blaster-02, Thunder3 → blaster-05, Thunder4 → blaster-02, Thunder5 → blaster-05, Thunder6 → blaster-02, Thunder8 → blaster-02, Thunder9 → blaster-05, Twine → drone-01, Up3 → powerup-03, Up4 → powerup-01, Water1 → whoosh-01, Water2 → whoosh-02, Water4 → whoosh-04, Water5 → whoosh-05, Wind1 → whoosh-01, Wind2 → whoosh-02, Wind3 → whoosh-03, Wind4 → whoosh-04, Wind5 → whoosh-05, Wind6 → whoosh-01, Wind7 → whoosh-02.

Also replaced: the boat, ship and airship music to Psychronic tracks (Call Of The Horizon, Cybertech Flight, Harmonic Nebula); the level-up sound of MegaVictory to powerup-02. The defeat and game over jingles are blank: the Demo ships no ME besides Victory1, and a blank name plays nothing rather than stopping the game on a missing file.

System sounds replaced: Miss → Miss1, Reflection → powerup-01, Shop1 → select-03, Item3 → powerup-03.
