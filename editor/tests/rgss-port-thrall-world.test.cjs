// Thrall (VX) world ports: Ultimate Overlay Mapping, Fog Effects, Thomas Edison VX, Procedural Dungeon Gen.,
// Fast Travel, and Thrall's edits to Game_Map, Game_Character, Game_Event, Game_Player, Sprite_Character,
// Scene_Map and Cache.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));
// Values made in a vm context fail strict equality across realms: compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));

// Snippets of Thrall's own sections (CRLF, as the game's Scripts.rvdata has them).
const crlf = (s) => s.replace(/\n/g, '\r\n');
const GAME_MAP = crlf(`class Game_Map
  def autoplay
    @map.bgm.play if @map.autoplay_bgm and $game_switches[21]
    @map.bgs.play if @map.autoplay_bgs and $game_switches[21]
  end
  def passable?(x, y, flag = 0x01)
    for i in [2, 1, 0]                      # in order from on top of layer
      tile_id = @map.data[x, y, i]          # get tile ID
      if i == 2
        if pass & flag == 0x01
          if $game_switches[36]
            return true
          end
        end
      end
    end
  end
end`);
const GAME_PLAYER = crlf(`class Game_Player < Game_Character
  def change_move(fix, speed, dir = nil)
    @direction_fix = fix
    @direction = dir if dir != nil
    @move_speed = speed
  end
end`);
const SCENE_MAP = crlf(`class Scene_Map < Scene_Base
  def call_battle
    @spriteset.update
    if $game_switches[29] == true
      RPG::BGM.stop
      RPG::BGS.stop
      $game_system.battle_bgm.play
    end
    Sound.play_battle_start
  end
  def perform_battle_transition
    Graphics.transition(20, "Graphics/System/BattleStart", 20)
    Graphics.freeze
  end
end`);
const FOG = crlf(`module Falcao
DinamicScroll = true
end
class Game_Map
  alias falcaofogSini initialize
  def fog(name,opacity,zoom,scroll_x,scroll_y)
    @fog_name = name
  end
end
class Spriteset_Map
  alias falcaofogini initialize
  def update_fog
    if $game_switches[28] #Fog Scroll
      @fog.ox = $game_map.display_x / 4 + $game_map.fog_ox
    end
  end
end`);
const EDISON = crlf(`FIRE = 23
LIGHT = 24
GROUND = 25
TORCH = 26
class Spriteset_Map
  alias bulletxt_spriteset_map_initalize initialize
end
class Light_Effect
	def initialize(event, type)
		@light = Sprite.new
		@light.bitmap = Cache.picture("le.png")
	end
end`);
const UOM = crlf(`module HK_UOM
  Width   = 608
  LightSwitch = 31         #Switch to Activate Light Overlays
  ShadowSwitch = 32        #Switch to Activate Shadow Overlays
  ParSwitch = 33           #Switch to Activate Parallax Overlays
  Par2Switch = 35           #Switch to Activate Parallax Overlays
  GroundSwitch = 34        #Switch to Activate Ground Overlays
  LightMap = "Light"      #The name of the file for Light Overlays
  ShadowMap = "Shadow"    #The name of the file for Shadow Overlays
  ParMap = "Par"          #The name of the file for Parallax Overlays
  Par2Map = "Parall"          #The name of the file for Parallax Overlays
  GroundMap = "Ground"    #The name of the file for Ground Overlays
end`);
const PDG = crlf(`module STRAK
  module PDG
    A2 = ["A","C","D","E","F","H","K","L","P","R","S","T","U","W","Z"]
    B2 = ["B","G","I","J","M","N","O","Q","V","X","Y"]
    X2Y2 = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q",
    "R","S","T","U","V","W","X","Y","Z"]
    FAILSAFE = ["I","B","B","J","C","A","A","E","H","D","D","K"]
    def self.map_settings(id)
      case id
      when 2,3
        room_folder = "BSM/"
        room_w = 9
        room_h = 12
        start_x = 7
        start_y = 7
        overlap = 0
        overwrite = 0
        var_type = 1
        room_size = [50,50]
        l_map = true
        s_map = true
        o_map = true
      when 75,76
        room_folder = "PEAKS/"
        room_w = 9
        room_h = 12
        start_x = 7
        start_y = 7
        overlap = 5
        overwrite = 5
        var_type = 0
        room_size = [50,50]
        l_map = false
        s_map = false
        o_map = false
      end
      return [room_folder,room_w,room_h,start_x,start_y,room_size,l_map,s_map,
      overlap,var_type,o_map,overwrite].compact
    end
  end
end
class Game_Map
  def create_dungeon
    if $game_switches[30] # DEBUG
      @g_floor = 104 # Passable, spawnable for exits, items, etc.
      @r_floor = 105 # Impassable
      @y_floor = 106 # Passable, spawn point for chests
      @b_floor = 107 # Passable, no spawning
      @p_floor = 108 # Passable, spawn point for player and enemies
      @dr_floor = 109 # Passable, spawn point for special event 1
      @db_floor = 110 # Passable, spawn point for special event 2
    else
      @g_floor = 96 # Passable, spawnable for exits, items, etc.
      @r_floor = 97 # Impassable
      @y_floor = 98 # Passable, spawn point for chests
      @b_floor = 99 # Passable, no spawning
      @p_floor = 100 # Passable, spawn point for player and enemies
      @dr_floor = 101 # Passable, spawn point for special event 1
      @db_floor = 102 # Passable, spawn point for special event 2
    end
        room = overrule[$game_variables[160]-1] if $game_variables[160] > 0
    for event_id in 1..65 # MAXIMUM NUMBER OF EVENTS
    end
  end
end`);
const TRAVEL = crlf(`class Window_Travel < Window_Selectable
  def refresh(destination)
    jobs = $game_system.accepted_jobs
    member = $game_variables[1]
    icons = [145,158,164,165,166,167,144,148,159,168]
    case destination
    when 0 #Hollow Keep
      location = 0
    when 1 #Bloodstone Mine
      location = 301
    end
    case member
    when 2 #Mel
      case destination
      when 6 #D'Amico Estate
        location = 306
      end
    end
    for job in jobs
      height += 24 if job[1] == location
    end
  end
end
class Map_Sprite < Sprite
  def initialize(viewport)
    super(viewport)
    self.bitmap = Bitmap.new("Graphics/Pictures/$Map")
  end
  def refresh
    folder = "Graphics/Pictures/"
    regions = $game_variables[118]
    member = $game_variables[1]
    bitmap = Bitmap.new(folder + "$Hollow")
    @bitmap.blt(0,0,bitmap,bitmap.rect)
    for i in 0..regions
      bitmap = nil
      case i
      when 1
        bitmap = Bitmap.new(folder + "$BSM")
      end
      case member
      when 2 #Mel
        case i
        when 6 #D'Amico Estate
          bitmap = Bitmap.new(folder + "$DAMICO")
        end
      end
      @bitmap.blt(0,0,bitmap,bitmap.rect) unless bitmap == nil
    end
  end
end
class Travel_Sprite < Sprite
  def refresh(index)
    folder = "Graphics/Pictures/"
    case index
    when 0
      bitmap = Bitmap.new(folder + "$Hollow2")
    when 1
      bitmap = Bitmap.new(folder + "$BSM2")
    end
    case member
    when 2 #Mel
      case index
      when 6 #D'Amico Estate
        bitmap = Bitmap.new(folder + "$DAMICO2")
      end
    end
  end
end
class Scene_Travel < Scene_Base
  def return_scene
    $game_variables[73] = @destination
    $scene = Scene_Map.new
  end
end`);
const SCRIPTS = [GAME_MAP, GAME_PLAYER, SCENE_MAP, FOG, EDISON, UOM, PDG, TRAVEL];

/** A vm context with just enough of MZ for the world ports to load and run. */
function world(names, parameters = {}) {
    const cls = () => function() {};
    const ctx = { console, Math, JSON };
    for (const name of ['Game_Map', 'Game_CharacterBase', 'Game_Event', 'Game_Player', 'Spriteset_Map', 'Scene_Map', 'Sprite_Balloon', 'Sprite', 'Scene_Base', 'Window_Selectable', 'Bitmap']) ctx[name] = cls();
    ctx.Game_Character = cls();
    Object.setPrototypeOf(ctx.Game_Character.prototype, ctx.Game_CharacterBase.prototype);
    Object.setPrototypeOf(ctx.Game_Event.prototype, ctx.Game_Character.prototype);
    Object.setPrototypeOf(ctx.Game_Player.prototype, ctx.Game_Character.prototype);
    Object.assign(ctx.Game_Map.prototype, { setup(id) { this._mapId = id; }, update() {}, mapId() { return this._mapId; } });
    Object.assign(ctx.Game_CharacterBase.prototype, { canPass: () => 'mz', isMapPassable: () => true, updateMove() {} });
    Object.assign(ctx.Game_Event.prototype, { update() { this.updated = true; }, checkEventTriggerTouch() {} });
    Object.assign(ctx.Game_Player.prototype, { startMapEvent() { this.mzStart = true; } });
    for (const m of ['createLowerLayer', 'createUpperLayer', 'update', 'updateParallax', 'createBalloon', 'removeBalloon']) ctx.Spriteset_Map.prototype[m] = function() {};
    for (const m of ['start', 'onMapLoaded', 'stopAudioOnBattleStart']) ctx.Scene_Map.prototype[m] = function() { this['did_' + m] = true; };
    ctx.Sprite_Balloon.prototype.updateFrame = function() {};
    ctx.Math.randomInt = (n) => Math.floor(Math.random() * n);
    ctx.ImageManager = { _cache: {}, _system: {}, clear() { this._cache = {}; }, loadBitmap: (f, n) => ({ folder: f, name: n }) };
    ctx.SceneManager = { _scene: null };
    ctx.BattleManager = { playBattleBgm() { this.played = true; }, isBattleTest: () => false };
    ctx.PluginManager = { parameters: (name) => parameters[name] || {} };
    ctx.window = ctx;
    for (const name of names) vm.runInNewContext(plugin(name), ctx);
    return ctx;
}

test('the world families detect Thrall\'s sections and not their published originals', () => {
    const fam = C.scriptFamilies(SCRIPTS);
    for (const key of ['thrallMap', 'thrallFog', 'thrallEdisonLights', 'thrallOverlays', 'thrallDungeon', 'thrallTravel']) assert.ok(fam.has(key), key);
    // Falcao's fog without Thrall's switch, the overlay script without Thrall's second parallax, a stock Game_Player.
    const originals = C.scriptFamilies([FOG.replace(/\$game_switches\[28\] #Fog Scroll/, 'Falcao::DinamicScroll'), UOM.replace(/\s*Par2Switch.*\r\n/, '\r\n'), 'class Game_Player < Game_Character\r\n  def update\r\n  end\r\nend']);
    for (const key of ['thrallFog', 'thrallOverlays', 'thrallMap']) assert.ok(!originals.has(key), key);
});

test('the events\' calls into the world scripts translate', () => {
    const ctx = { constants: {}, families: C.scriptFamilies(SCRIPTS) };
    const ruby = (s, kind = 'statement') => C.ruby(s, kind, ctx);
    assert.equal(ruby('$game_map.fog("Fog",32,2,1,1)'), '$gameMap.rrFog?.("Fog", 32, 2, 1, 1);');
    assert.equal(ruby('$game_system.dungeon = [[16,50,50],[17,50,50]]'), '$gameSystem._dungeon = [[16, 50, 50], [17, 50, 50]];');
    assert.equal(ruby('r = $game_system.dungeon\nroom = r[r.size-1]\n$game_variables[17] = room[0]'),
        'var r = ($gameSystem._dungeon || ($gameSystem._dungeon = []));\nvar room = r[(r.length - 1)];\n$gameVariables.setValue(17, room[0]);');
    assert.equal(ruby('$game_system.dungeon.size <= 1', 'expression'), '(($gameSystem._dungeon || ($gameSystem._dungeon = [])).length <= 1)');
    assert.equal(ruby('x = $game_player.x; y = $game_player.y\ntileR = [1637,1645]\nif tileR.include?($game_map.data[x,y,0])\n $game_player.change_move(true, 3, 8)\nelse\n $game_player.change_move(false, 4)\nend'),
        'var x = $gamePlayer.x;\nvar y = $gamePlayer.y;\nvar tileR = [1637, 1645];\nif (tileR.includes($gameMap.tileId(x, y, 0))) { $gamePlayer.rrChangeMove?.(true, 3, 8); } else { $gamePlayer.rrChangeMove?.(false, 4); }');
    assert.equal(C.ruby('change_move(true, 3)', 'statement', Object.assign({ self: 'character' }, ctx)), 'this.rrChangeMove?.(true, 3);');
    assert.equal(ruby('$scene = Scene_Travel.new'), '(typeof Scene_RRThrallTravel === "function" && SceneManager.push(Scene_RRThrallTravel));');
    // The "Cache Graphics" common event: each actor's sheet onto $Name, heads onto Expressions.
    assert.equal(ruby('x = 0\nr = Rect.new(0,0,96,192)\nfor i in 1..4\n name1 = $game_actors[i].character_name\n b = Cache.character(name1)\n c = Cache.character("$" + $game_actors[i].name)\n c.blt(x,x,b,r)\nend'),
        'var x = 0;\nvar r = new Rectangle(0, 0, 96, 192);\nfor (var i of Array.from({ length: (4) - (1) + 1 }, (_, i) => (1) + i)) { var name1 = $gameActors.actor(i).characterName(); var b = ImageManager.loadCharacter(name1); var c = ImageManager.loadCharacter(("$" + $gameActors.actor(i).name())); c.rrVxBlt?.(x, x, b, r); }');
    assert.equal(ruby('c = Cache.character("Expressions")\nc.clear_rect(0,0,384,192)\nb = Cache.head("$MelH")\nc.blt(0,0,c,Rect.new(0,192,384,192))'),
        'var c = ImageManager.loadCharacter("Expressions");\nc.rrVxClearRect?.(0, 0, 384, 192);\nvar b = ImageManager.loadBitmap("img/characters/Heads/", "$MelH");\nc.rrVxBlt?.(0, 0, c, new Rectangle(0, 192, 384, 192));');
});

test('settings are read from the game\'s copies', () => {
    assert.deepEqual(params('RR_ThrallMap').extract({ scripts: SCRIPTS }),
        { bgmSwitch: '21', passageSwitch: '36', battleBgmSwitch: '29', transitionDuration: '20', transitionImage: 'BattleStart', transitionVague: '20' });
    assert.deepEqual(params('RR_ThrallFog').extract({ scripts: SCRIPTS }), { scrollSwitch: '28' });
    assert.deepEqual(params('RR_ThrallLights').extract({ scripts: SCRIPTS, constants: C.scriptConstants(SCRIPTS) }),
        { fireSwitch: '23', lightSwitch: '24', groundSwitch: '25', torchSwitch: '26', image: 'le' });
    const shipped = new Set(['Overlays/Ground2.png', 'Overlays/Par2.png', 'Overlays/Parall12.png', 'Overlays/Light1.png']);
    const uom = params('RR_ThrallOverlays').extract({ constants: C.scriptConstants(SCRIPTS), read: (rel) => (shipped.has(rel) ? Buffer.from([1]) : null) });
    assert.deepEqual([uom.lightSwitch, uom.groundSwitch, uom.par2Name, JSON.parse(uom.files)], ['31', '34', 'Parall', ['Ground2', 'Light1', 'Par2', 'Parall12']]);
    const listed = params('RR_ThrallOverlays').extract({ constants: C.scriptConstants(SCRIPTS), list: () => ['Light7.png', 'Par7.png', 'notes.txt', 'Other3.png'] });
    assert.deepEqual(JSON.parse(listed.files), ['Light7', 'Par7']);

    const rooms = { 'Graphics/Rooms/BSM/Ground/A': ['AA1.png', 'BA1.png', 'AA2.png'], 'Graphics/Rooms/PEAKS/Ground/Z': ['CZ3.png'] };
    const pdg = params('RR_ThrallDungeon').extract({ scripts: SCRIPTS, list: (dir) => rooms[dir] || [] });
    assert.deepEqual(plain(JSON.parse(pdg.maps)[3]), { folder: 'BSM/', roomW: 9, roomH: 12, startX: 7, startY: 7, overlap: 0, overwrite: 0, varType: 1, roomSize: [50, 50], lMap: true, sMap: true, oMap: true });
    assert.equal(JSON.parse(pdg.maps)[75].overwrite, 5);
    assert.equal(JSON.parse(pdg.rules).X2Y2.length, 26, 'a rule written over two lines');
    assert.deepEqual([pdg.floors, pdg.debugFloors, pdg.debugSwitch, pdg.overrideVariable, pdg.maxEvents], ['[96,97,98,99,100,101,102]', '[104,105,106,107,108,109,110]', '30', '160', '65']);
    assert.deepEqual(JSON.parse(pdg.rooms), { 'BSM/': { A: ['AA1.png', 'AA2.png', 'BA1.png'] }, 'PEAKS/': { Z: ['CZ3.png'] } });
    // Without a listing, the room names are asked for one by one (numbers may skip: BSM's W rooms start at 2).
    const probed = params('RR_ThrallDungeon').extract({ scripts: SCRIPTS, read: (rel) => (/Rooms\/BSM\/Ground\/W\/(BW2|EW2)\.png$/.test(rel) ? Buffer.from([1]) : null) });
    assert.deepEqual(JSON.parse(probed.rooms)['BSM/'], { W: ['BW2.png', 'EW2.png'] });

    const travel = params('RR_ThrallTravel').extract({ scripts: SCRIPTS });
    assert.deepEqual(JSON.parse(travel.destinations), {
        all: { 0: { location: 0, cursor: '$Hollow2' }, 1: { location: 301, map: '$BSM', cursor: '$BSM2' } },
        members: { 2: { 6: { location: 306, map: '$DAMICO', cursor: '$DAMICO2' } } }
    });
    assert.deepEqual([travel.baseMap, travel.homeMap, travel.regionVariable, travel.memberVariable, travel.resultVariable], ['$Map', '$Hollow', '118', '1', '73']);
});

test('dungeon layout: the room rules, Ruby\'s array indexing, the variants and the room count', () => {
    const ctx = world(['RR_ThrallDungeon']);
    const makeLayout = ctx.Game_Map.rrPdgMakeLayout;
    // rand always 0: each cell takes the first letter its rule leaves.
    const first = makeLayout({ varType: 0 }, () => 0);
    assert.deepEqual(plain(first.layout), ['I', 'B', 'B', 'J', 'C', 'A', 'A', 'E', 'H', 'D', 'D', 'K']);
    assert.deepEqual(plain(first.variants), [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], 'every room reached');
    // Variant type 1: rand(2) = 1 puts the variant at cell 6; rand(5) = 1 makes it B, with C, D and E around it.
    const picks = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1];
    const typed = makeLayout({ varType: 1 }, () => picks.shift() ?? 0);
    assert.deepEqual(plain(typed.variants), [1, 1, 3, 4, 1, 1, 2, 5, 1, 1, 1, 1]);
    // A layout that never connects falls back to the failsafe after 50 tries.
    let calls = 0;
    const stuck = makeLayout({ varType: 0 }, (n) => { calls++; return n - 1; });
    assert.equal(calls, 600);
    assert.deepEqual(plain(stuck.layout), ['I', 'B', 'B', 'J', 'C', 'A', 'A', 'E', 'H', 'D', 'D', 'K']);

    // Plan: rows step by 4 (Integer#size), a picture is not used twice while another is left.
    const settings = { folder: 'BSM/', roomW: 9, roomH: 12, startX: 7, startY: 7, roomSize: [50, 50] };
    const layout = ['A', 'A', 'A', 'A', 'B', 'B', 'B', 'B', 'C', 'C', 'C', 'C'];
    const variants = [1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1];
    const fresh = world(['RR_ThrallDungeon'], { RR_ThrallDungeon: { rooms: JSON.stringify({ 'BSM/': { A: ['AA1.png', 'AA2.png'], B: ['AB1.png', 'BB1.png'], C: ['AC1.png'] } }) } });
    fresh.$gameVariables = { value: () => 0 };
    const plan = fresh.Game_Map.rrPdgMakePlan(settings, layout, variants, () => 0);
    assert.deepEqual(plain(plan.map(p => `${p.room}/${p.file}@${p.x},${p.y}`)), [
        'A/AA1@7,7', 'A/AA2@16,7', 'A/AA1@25,7', 'A/AA1@34,7',
        'B/BB1@7,19', 'B/AB1@16,19', 'B/AB1@25,19', 'B/AB1@34,19',
        'C/AC1@7,31', 'C/AC1@16,31', 'C/AC1@25,31', 'C/AC1@34,31'
    ], 'a third A reuses a picture where the original stopped with an error');
});

test('dungeon floors: the colour strip sets tiles, and the player and events are placed on them', () => {
    const ctx = world(['RR_ThrallDungeon'], { RR_ThrallDungeon: { maps: JSON.stringify({ 2: { folder: 'T/', roomW: 2, roomH: 2, startX: 1, startY: 1, overlap: 0, overwrite: 0, varType: 0, roomSize: [6, 6], lMap: false, sMap: false, oMap: false } }) } });
    const W = 6, H = 6;
    ctx.$dataMap = { data: new Array(W * H * 6).fill(0) };
    ctx.$gameSwitches = { value: () => false };
    const map = new ctx.Game_Map();
    map._mapId = 2;
    Object.assign(map, { width: () => W, height: () => H, tileId: (x, y, z) => ctx.$dataMap.data[(z * H + y) * W + x] });
    // One 2×2 room (64 px wide) at (1, 1): its strip at x 64..65 is magenta, yellow / red, green.
    const colours = { '64,0': [255, 0, 255], '65,0': [255, 255, 0], '64,1': [255, 0, 0], '65,1': [0, 255, 0] };
    const strip = { width: 66, height: 64, isReady: () => true, isError: () => false, context: { getImageData: (x, y, w, h) => {
        const data = new Uint8ClampedArray(w * h * 4);
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) (colours[`${x + i},${y + j}`] || [32, 32, 32]).forEach((v, k) => { data[(j * w + i) * 4 + k] = v; });
        return { data };
    } } };
    const pdg = { mapId: 2, floors: [96, 97, 98, 99, 100, 101, 102], plan: [{ room: 'A', file: 'AA1', x: 1, y: 1 }] };
    const tiles = map.rrPdgCollision(JSON.parse(ctx.PluginManager.parameters('RR_ThrallDungeon').maps)[2], pdg, [strip]);
    assert.deepEqual(plain(tiles), [[7, 1636], [8, 1633], [13, 1634], [14, 1632]], 'start, wall, chest, floor');
    for (const [i, t] of tiles) ctx.$dataMap.data[i] = t;
    const located = [];
    ctx.$gamePlayer = { locate: (x, y) => located.push(['player', x, y]) };
    const events = { 1: 'Chest', 2: 'Lamp', 3: 'Special 1', 4: 'SKIP' };
    map.event = (id) => (events[id] ? { event: () => ({ name: events[id] }), locate: (x, y) => located.push([events[id], x, y]), erase() { located.push([events[id], 'erased']); } } : null);
    ctx.Math.randomInt = () => 0;
    map.rrPdgPlace(pdg);
    assert.deepEqual(plain(located), [['player', 1, 1], ['Chest', 1, 2], ['Lamp', 2, 2], ['Special 1', 'erased']]);
});

test('map rules: the passage switch, events above characters, diagonal slides and change_move', () => {
    const ctx = world(['RR_ThrallMap']);
    const on = new Set();
    ctx.$gameSwitches = { value: (id) => on.has(id) };
    // Passage: layer 2 holds a blocked tile (flag 0x0f), layer 0 an open one.
    const map = new ctx.Game_Map();
    Object.assign(map, { tilesetFlags: () => ({ 5: 0x0f, 9: 0, 0: 0x10 }), tileEventsXy: () => [], tileId: (x, y, z) => (z === 2 ? 5 : z === 0 ? 9 : 0) });
    assert.equal(map.checkPassage(0, 0, 0x01), false);
    on.add(36);
    assert.equal(map.checkPassage(0, 0, 0x01), true, 'reversed while the switch is on');
    assert.equal(map.checkPassage(0, 0, 0x200), false, 'open to a boat: blocks');
    on.delete(36);

    ctx.$gameMap = { isValid: () => true, roundXWithDirection: (x, d) => x + (d === 6 ? 1 : d === 4 ? -1 : 0), roundYWithDirection: (y, d) => y + (d === 2 ? 1 : d === 8 ? -1 : 0), roundX: (x) => x, roundY: (y) => y };
    const above = new ctx.Game_Character();
    above._priorityType = 2;
    assert.equal(above.canPass(0, 0, 2), true);
    above._priorityType = 1;
    assert.equal(above.canPass(0, 0, 2), 'mz');

    // A blocked diagonal slides along the open side; facing across, the side it faces first.
    const moves = [];
    const ch = new ctx.Game_Character();
    Object.assign(ch, { _x: 5, _y: 5, _direction: 4, setDirection(d) { this._direction = d; }, reverseDir: (d) => 10 - d, moveStraight: (d) => moves.push(d), setMovementSuccess() {}, increaseSteps() {} });
    const open = new Set(['5,6', '4,5']);   // down and left open, the corner blocked
    ch.rrVxPassable = (x, y) => open.has(`${x},${y}`);
    ch.moveDiagonally(4, 2);
    assert.deepEqual(moves, [2], 'facing left: down first');
    ch._direction = 2;
    ch.moveDiagonally(4, 2);
    assert.deepEqual(moves, [2, 4], 'facing down: left first');
    open.add('4,6');
    ch.moveDiagonally(4, 2);
    assert.deepEqual([ch._x, ch._y, ch._realX, ch._realY], [4, 6, 5, 5], 'all open: one diagonal step');

    // Toward the player: exactly diagonal goes diagonal.
    const toward = new ctx.Game_Character();
    const diag = [];
    Object.assign(toward, { deltaXFrom: () => 2, deltaYFrom: () => 2, moveDiagonally: (h, v) => diag.push([h, v]) });
    ctx.$gamePlayer = { x: 0, y: 0 };
    toward.moveTowardPlayer();
    assert.deepEqual(diag, [[4, 8]]);

    const player = new ctx.Game_Player();
    player.rrChangeMove(true, 3, 8);
    assert.deepEqual([player._directionFix, player._moveSpeed, player._direction], [true, 3, 8]);
    player.rrChangeMove(false, 4);
    assert.deepEqual([player._directionFix, player._moveSpeed, player._direction], [false, 4, 8], 'no direction keeps the facing');

    // Diagonal steps are three quarters as fast.
    const mover = new ctx.Game_Character();
    Object.assign(mover, { _x: 1, _y: 1, _realX: 0, _realY: 0, distancePerFrame: () => 0.1, isMoving: () => true });
    mover.updateMove();
    assert.deepEqual([mover._realX, mover._realY].map(v => Math.round(v * 1000) / 1000), [0.075, 0.075]);
});

test('map rules: battle music, and a drawn-into sheet survives the transfer cache clear until Cache.clear', () => {
    const ctx = world(['RR_ThrallMap']);
    ctx.$gameSwitches = { value: (id) => id === 29 && ctx.battleMusic };
    const scene = new ctx.Scene_Map();
    ctx.battleMusic = false;
    scene.stopAudioOnBattleStart();
    ctx.BattleManager.playBattleBgm();
    assert.deepEqual([!!scene.did_stopAudioOnBattleStart, !!ctx.BattleManager.played], [false, false], 'the map\'s music plays on');
    ctx.battleMusic = true;
    scene.stopAudioOnBattleStart();
    ctx.BattleManager.playBattleBgm();
    assert.deepEqual([!!scene.did_stopAudioOnBattleStart, !!ctx.BattleManager.played], [true, true]);

    const sheet = { _canvas: {}, isReady: () => true, isError: () => false, width: 96, height: 192, paintOpacity: 255, blt() {}, clearRect() {} };
    Object.setPrototypeOf(sheet, ctx.Bitmap.prototype);
    const other = Object.assign(Object.create(ctx.Bitmap.prototype), { isReady: () => true, isError: () => false, width: 96, height: 192 });
    ctx.ImageManager._cache['img/characters/%24Mel.png'] = sheet;
    sheet.rrVxBlt(0, 0, other, { x: 0, y: 0, width: 96, height: 192 });
    ctx.ImageManager.clear();
    assert.equal(ctx.ImageManager._cache['img/characters/%24Mel.png'], sheet, 'kept through a transfer');
    ctx.ImageManager.rrThrallCacheClear();
    assert.equal(ctx.ImageManager._cache['img/characters/%24Mel.png'], undefined, 'dropped by Cache.clear');
});

test('lights, fog and overlays: comments, placement, the fog\'s drift and the overlay list', () => {
    const ctx = world(['RR_ThrallFog', 'RR_ThrallLights', 'RR_ThrallOverlays'], { RR_ThrallOverlays: { files: '["Ground2","Par2"]' } });
    const event = new ctx.Game_Event();
    Object.assign(event, { page: () => ({}), list: () => [{ code: 108, parameters: ['FIRE'] }, { code: 108, parameters: ['FIRE '] }, { code: 408, parameters: ['TORCH'] }, { code: 108, parameters: ['GROUND5'] }] });
    assert.deepEqual(plain(event.rrEdisonLights()), ['FIRE', 'GROUND5']);
    assert.deepEqual(plain(Object.assign(new ctx.Game_Event(), { page: () => null }).rrEdisonLights()), [], 'an event with no page');

    const map = new ctx.Game_Map();
    map.setup(2);
    map.rrFog('Fog', 32, 2, 1, 1);
    map.update();
    map.update();
    assert.deepEqual(plain(map.rrFogData()), { name: 'Fog', opacity: 32, zoom: 2, sx: 1, sy: 1, ox: -0.25, oy: -0.25 });
    map.setup(3);
    assert.equal(map.rrFogData().name, 'Fog', 'the fog stays from map to map');

    assert.deepEqual([map.rrUomHas('ground'), map.rrUomHas('par'), map.rrUomHas('light')], [false, false, false]);
    map.setup(2);
    assert.deepEqual([map.rrUomHas('ground'), map.rrUomHas('par'), map.rrUomHas('light')], [true, true, false]);
    assert.deepEqual(plain(map.rrUomBitmap('par')), { folder: 'img/overlays/', name: 'Par2' });
});

test('fast travel: each destination is the member\'s own or everyone\'s', () => {
    const destinations = { all: { 0: { location: 0, cursor: '$Hollow2' }, 1: { location: 301, map: '$BSM', cursor: '$BSM2' }, 6: { location: 0 } }, members: { 2: { 6: { location: 306, map: '$DAMICO', cursor: '$DAMICO2' } } } };
    const ctx = world(['RR_ThrallTravel'], { RR_ThrallTravel: { destinations: JSON.stringify(destinations) } });
    const vars = { 118: 6, 1: 2 };
    ctx.$gameVariables = { value: (id) => vars[id] || 0 };
    assert.deepEqual(plain(ctx.Scene_RRThrallTravel.regionPictures()), ['$Hollow', '$BSM', '$DAMICO']);
    vars[1] = 3;
    assert.deepEqual(plain(ctx.Scene_RRThrallTravel.regionPictures()), ['$Hollow', '$BSM'], 'another member has no region there');
});
