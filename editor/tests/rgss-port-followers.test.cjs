const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Smart Followers, Follower Event Touch, Follower Move Routes, Disable NPC Lock and Remember Event Position.
const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const plugin = (name) => fs.readFileSync(path.join(legacy, 'plugins', name + '.js'), 'utf8');
const params = (name) => require(path.join(legacy, 'plugins', name + '.params.js'));
const PluginManager = (values = {}) => ({ parameters: () => values });

const SCRIPTS = {
    smart: 'module CPSmartFollowers\n  MoveDelay = 100\nend\n$imported ||= {}\n$imported["CP_SMART_FOLLOWERS"] = 1.0\n',
    touch: '$imported["TH_FollowerEventTouch"] = true\nmodule TH\n  module Follower_Event_Touch\n    Disable_Switch = 0\n  end\nend\n',
    routes: '$imported = {} if $imported.nil?\n$imported[:TH_FollowerMoveRoutes] = true\n',
    nolock: 'class Game_Event\n  alias shaz_nolock_clear_page_settings clear_page_settings\n  alias shaz_nolock_lock                lock\nend\n',
    position: 'class Game_Event\n  alias shaz_mem_position_gcb_init initialize\n  def save_pos(x = @x, y = @y, dir = @direction)\n  end\nend\n'
};

test('the five scripts are detected and their calls translate', () => {
    const fam = C.scriptFamilies(Object.values(SCRIPTS));
    for (const key of ['smartFollowers', 'himeFollowerEventTouch', 'himeFollowerRoutes', 'shazNpcLock', 'shazRememberPosition']) assert.ok(fam.has(key), key);
    assert.equal(C.scriptFamilies(['class Game_Follower < Game_Character\nend']).has('smartFollowers'), false);
    const route = { constants: {}, families: fam, self: 'character' };
    const event = { constants: {}, families: fam };
    // Map 91 event 54's route, as the game wrote it.
    assert.equal(C.ruby('save_pos()', 'statement', route), 'this.rrShazSavePos?.();');
    assert.equal(C.ruby('save_pos(1, 2, 8)', 'statement', route), 'this.rrShazSavePos?.(1, 2, 8);');
    assert.equal(C.ruby('forget_pos', 'statement', route), 'this.rrShazForgetPos?.();');
    assert.equal(C.ruby('$game_map.events[@event_id].save_pos()', 'statement', event), '$gameMap.event(this._eventId)?.rrShazSavePos?.();');
    assert.equal(C.ruby('$game_map.events[3].forget_pos()', 'statement', event), '$gameMap.event(3)?.rrShazForgetPos?.();');
    assert.equal(C.ruby('chase_leader(false)', 'statement', route), 'this.rrChaseLeader?.(false);');
    assert.equal(C.ruby('unsync_from_leader', 'statement', route), 'this.rrUnsyncFromLeader?.();');
    assert.equal(C.ruby('sync_to_leader', 'statement', route), 'this.rrSyncToLeader?.();');
});

test('settings come from the game copies', () => {
    const constants = C.scriptConstants([SCRIPTS.smart, SCRIPTS.touch]);
    assert.deepEqual(params('RR_SmartFollowers').extract({ constants }), { moveDelay: '100' });
    assert.deepEqual(params('RR_FollowerEventTouch').extract({ constants }), { disableSwitch: '0' });
    assert.deepEqual(params('RR_SmartFollowers').extract({ constants: { 'CPSmartFollowers::MoveDelay': 30 } }), { moveDelay: '30' });
    assert.deepEqual(params('RR_FollowerEventTouch').extract({ constants: { 'TH::Follower_Event_Touch::Disable_Switch': 12 } }), { disableSwitch: '12' });
});

function eventWorld() {
    function Game_Event(mapId, eventId, list = [], at = [5, 5]) { this._list = list; this._at = at; this.initialize(mapId, eventId); }
    Game_Event.prototype.initialize = function(mapId, eventId) { this._mapId = mapId; this._eventId = eventId; this._direction = 2; this._stopCount = 9; this.refreshes = 0; this.locate(...this._at); this.refresh(); };
    Game_Event.prototype.locate = function(x, y) { this.x = x; this.y = y; };
    Game_Event.prototype.setDirection = function(d) { if (!this._directionFix && d) this._direction = d; };
    Game_Event.prototype.refresh = function() { this.refreshes++; };
    Game_Event.prototype.list = function() { return this._list; };
    Game_Event.prototype.setupPageSettings = function() {};
    Game_Event.prototype.clearPageSettings = function() {};
    Game_Event.prototype.lock = function() { this._locked = true; this._direction = 8; };
    const ctx = { Game_Event, $gameSystem: {}, PluginManager: PluginManager() };
    return ctx;
}

test('<nolock> in the opening comments stops the lock; a later page keeps it until no page is active', () => {
    const ctx = eventWorld();
    vm.runInNewContext(plugin('RR_ShazNpcLock'), ctx);
    // Map 73 event 10: the tag is the second comment, after <interact: …>, with a 408 below it.
    const tagged = [{ code: 108, parameters: ['<interact: Atlas Security Guard>'] }, { code: 108, parameters: ['<NoLock>'] }, { code: 408, parameters: ['<lantern: 255>'] }, { code: 101, parameters: [] }];
    const e = new ctx.Game_Event(73, 10, tagged);
    e.setupPageSettings();
    e.lock();
    assert.equal(e._locked, undefined, 'not locked');
    assert.equal(e._direction, 2, 'did not turn');
    // After the first other command the comment no longer counts.
    const late = new ctx.Game_Event(73, 11, [{ code: 101, parameters: [] }, { code: 108, parameters: ['<nolock>'] }]);
    late.setupPageSettings();
    late.lock();
    assert.equal(late._locked, true);
    // The flag survives a switch to a page without it; no active page clears it.
    e._list = [{ code: 101, parameters: [] }];
    e.setupPageSettings();
    e.lock();
    assert.equal(e._locked, undefined);
    e.clearPageSettings();
    e.setupPageSettings();
    e.lock();
    assert.equal(e._locked, true);
});

test('a saved event position is where the event appears when its map next loads', () => {
    const ctx = eventWorld();
    vm.runInNewContext(plugin('RR_ShazRememberPosition'), ctx);
    const e = new ctx.Game_Event(91, 54);
    e.x = 33; e.y = 20; e._direction = 4;
    e.rrShazSavePos();
    assert.deepEqual([...ctx.$gameSystem._rrEventPositions['91,54']], [33, 20, 4]);
    const again = new ctx.Game_Event(91, 54);
    assert.deepEqual([again.x, again.y, again._direction, again._stopCount, again.refreshes], [33, 20, 4, 0, 2]);
    assert.deepEqual([new ctx.Game_Event(90, 54).x, new ctx.Game_Event(91, 53).x], [5, 5], 'other events and maps untouched');
    again.rrShazSavePos(1, 2, 8);
    const moved = new ctx.Game_Event(91, 54);
    assert.deepEqual([moved.x, moved.y, moved._direction], [1, 2, 8]);
    moved.rrShazForgetPos();
    assert.deepEqual([new ctx.Game_Event(91, 54).x, new ctx.Game_Event(91, 54)._direction], [5, 2]);
});

function characterWorld() {
    function Game_Character() {}
    Game_Character.prototype.pos = function(x, y) { return this.x === x && this.y === y; };
    Game_Character.prototype.update = function() { this.baseUpdates = (this.baseUpdates || 0) + 1; };
    function Game_Player() {}
    Game_Player.prototype = Object.create(Game_Character.prototype);
    function Game_Follower(x, y, visible = true) { this.x = x; this.y = y; this.visible = visible; }
    Game_Follower.prototype = Object.create(Game_Character.prototype);
    Game_Follower.prototype.update = function() { this.stockUpdates = (this.stockUpdates || 0) + 1; };
    Game_Follower.prototype.chaseCharacter = function() { this.chased = true; };
    function Game_Interpreter(list = [], index = 0) { this._list = list; this._index = index; }
    Game_Interpreter.prototype.character = function(param) { return param < 0 ? 'player' : 'event ' + param; };
    Game_Interpreter.prototype.command205 = function(params) { this._characterId = params[0]; this.routed = [this.character(params[0]), params[1]]; return true; };
    const followers = [new Game_Follower(1, 1), new Game_Follower(2, 2, false)];
    const switches = {};
    const ctx = { Game_Character, Game_Player, Game_Follower, Game_Interpreter, Game_System: function() {}, $gameSwitches: { value: (id) => !!switches[id] }, $gameParty: { inBattle: () => false } };
    ctx.$gamePlayer = Object.assign(new Game_Player(), { x: 0, y: 0, _followers: { visibleFollowers: () => followers.filter(f => f.visible) }, followers: () => ({ follower: (i) => followers[i] }) });
    ctx.$gameSystem = new ctx.Game_System();
    return { ctx, followers, switches };
}

test('a follower counts as the leader for touch events unless the switch is on', () => {
    const { ctx, switches } = characterWorld();
    ctx.PluginManager = PluginManager({ disableSwitch: '7' });
    vm.runInNewContext(plugin('RR_FollowerEventTouch'), ctx);
    assert.equal(ctx.$gamePlayer.pos(0, 0), true);
    assert.equal(ctx.$gamePlayer.pos(1, 1), true, 'visible follower');
    assert.equal(ctx.$gamePlayer.pos(2, 2), false, 'hidden follower');
    switches[7] = true;
    assert.equal(ctx.$gamePlayer.pos(1, 1), false);
    assert.equal(ctx.$gamePlayer.pos(0, 0), true);
});

test('<move character: -n> above Set Move Route sends it to a follower', () => {
    const { ctx, followers } = characterWorld();
    vm.runInNewContext(plugin('RR_HimeFollowerRoutes'), ctx);
    const route = { list: [], wait: true };
    // Common event 47 (Party_Disperse): a comment, then the route on the player.
    const list = [{ code: 108, parameters: ['<move character: -3>'] }, { code: 205, parameters: [-1, route] }];
    const it = new ctx.Game_Interpreter(list, 1);
    it.command205(list[1].parameters);
    assert.equal(it.routed[0], followers[1]);
    assert.equal(it._characterId, -3, 'the wait looks the follower up again');
    assert.equal(it.character(-2), followers[0]);
    assert.equal(it.character(-9), null);
    assert.equal(it.character(-1), 'player');
    const plain = new ctx.Game_Interpreter([{ code: 101, parameters: [] }, { code: 205, parameters: [-1, route] }], 1);
    plain.command205([-1, route]);
    assert.equal(plain.routed[0], 'player');
    // A comment of more than one line has a 408 between it and the route, so it does not apply.
    const long = [{ code: 108, parameters: ['<move character: -2>'] }, { code: 408, parameters: ['x'] }, { code: 205, parameters: [-1, route] }];
    const it2 = new ctx.Game_Interpreter(long, 2);
    it2.command205([-1, route]);
    assert.equal(it2.routed[0], 'player');
    ctx.$gameParty.inBattle = () => true;
    assert.equal(it.character(-2), 'player', 'in battle the stock lookup answers');

    const f = followers[0];
    f.rrUnsyncFromLeader();
    f.update();
    assert.deepEqual([f.stockUpdates, f.baseUpdates], [undefined, 1]);
    f.rrSyncToLeader();
    f.update();
    assert.equal(f.stockUpdates, 1);
    f.rrChaseLeader(false);
    f.chaseCharacter();
    assert.equal(f.chased, undefined);
    f.rrChaseLeader(0);   // Ruby truth: 0 is true
    f.chaseCharacter();
    assert.equal(f.chased, true);
});

/** A grid world for Smart Followers: a step takes `frames` updates; through-followers always pass. */
function smartWorld(delay = 100, count = 3) {
    const frames = 4;
    function Game_Character() { this.x = 0; this.y = 0; this._direction = 2; this.left = 0; this._jumpCount = 0; }
    const step = { 2: [0, 1], 4: [-1, 0], 6: [1, 0], 8: [0, -1] };
    Object.assign(Game_Character.prototype, {
        isMoving() { return this.left > 0; },
        direction() { return this._direction; },
        setDirection(d) { if (!this._directionFix && d) this._direction = d; },
        setDirectionFix(v) { this._directionFix = v; },
        moveStraight(d) { this.setDirection(d); if (this.blocked) return; this.x += step[d][0]; this.y += step[d][1]; this.left = frames; },
        moveDiagonally(h, v) { this.x += step[h][0]; this.y += step[v][1]; this.left = frames; },
        jump(x, y) { this.x += x; this.y += y; this.left = frames; },
        update() { if (this.left > 0) this.left--; },
        setMoveSpeed(v) { this.speed = v; }, setTransparent() {}, setWalkAnime() {}, setStepAnime() {}, setOpacity() {}, setBlendMode() {}
    });
    function Game_Player() { Game_Character.call(this); this._followers = new Game_Followers(); }
    Game_Player.prototype = Object.create(Game_Character.prototype);
    Object.assign(Game_Player.prototype, {
        canPass() { return !this.blocked; },
        canPassDiagonally() { return true; },
        realMoveSpeed() { return 5; }, isTransparent() { return false; }, hasWalkAnime() { return true; }, hasStepAnime() { return false; }, opacity() { return 255; }, blendMode() { return 0; },
        updateDashing() {},
        moveByInput() { if (this.isMoving()) return; const d = this.input.shift(); if (d) this.moveStraight(d); },
        update(sceneActive) { if (sceneActive) this.moveByInput(); Game_Character.prototype.update.call(this); this._followers.update(); },
        moveStraight(d) { this._followers.updateMove(); Game_Character.prototype.moveStraight.call(this, d); }
    });
    function Game_Follower() { Game_Character.call(this); }
    Game_Follower.prototype = Object.create(Game_Character.prototype);
    Game_Follower.prototype.update = function() { Game_Character.prototype.update.call(this); };
    function Game_Followers() { this._data = Array.from({ length: count }, () => new Game_Follower()); this._gathering = false; }
    Object.assign(Game_Followers.prototype, {
        update() {}, updateMove() { this.chased = true; },
        synchronize(x, y, d) { for (const f of this._data) { f.x = x; f.y = y; f.setDirection(d); } },
        areGathering() { return this._gathering; },
        areGathered() { return this._data.every(f => !f.isMoving() && f.x === ctx.$gamePlayer.x && f.y === ctx.$gamePlayer.y); }
    });
    const ctx = { Game_Character, Game_Player, Game_Follower, Game_Followers, PluginManager: PluginManager({ moveDelay: String(delay) }) };
    vm.runInNewContext(plugin('RR_SmartFollowers'), ctx);
    const player = ctx.$gamePlayer = new Game_Player();
    player.input = [];
    const run = (n) => { for (let i = 0; i < n; i++) player.update(true); };
    const at = () => [player, ...player._followers._data].map(c => c.x + ',' + c.y).join(' ');
    return { ctx, player, run, at, frames };
}

test('followers retrace the leader, each waiting for the one ahead to stop, one tile behind', () => {
    const { player, run, at } = smartWorld();
    player.input = [6, 6, 6, 2];
    run(4 * 4);
    // The leader walked on without a pause; the line waits while the character ahead is moving.
    assert.equal(at(), '3,1 0,0 0,0 0,0');
    assert.equal(player._followers.chased, undefined, 'the stock chase never runs');
    run(40);
    assert.equal(at(), '3,1 3,0 2,0 1,0');
    assert.equal(player._followers._data[0].direction(), 6, 'faces as the leader did on that tile');
    // The queue drops a step once the last follower is two past it; here it is one in.
    assert.equal(player._followers._rrSmartQueue.length, 4);
    // A step into a wall is not queued; the leader only turns.
    player.blocked = true;
    player.input = [8];
    run(10);
    assert.equal(player._followers._rrSmartQueue.length, 4);
    assert.equal(player.direction(), 8);
    player.blocked = false;
    // A transfer (synchronize) clears the queue and the line starts from the leader's tile.
    player._followers.synchronize(9, 9, 4);
    assert.deepEqual([player._followers._rrSmartQueue.length, player._followers._data.map(f => f._rrSmartIndex)], [0, [0, 0, 0]]);
});

test('a long walk lets the first follower close up after the delay; gathering walks everyone onto the leader', () => {
    const { player, run, at } = smartWorld(6);
    player.input = Array(8).fill(6);
    run(8 * 4);
    // With a 6-frame delay the first follower starts before the leader stops.
    const [f0] = player._followers._data;
    assert.ok(f0.x > 0, 'first follower moved while the leader walked: ' + at());
    run(60);
    assert.equal(at(), '8,0 7,0 6,0 5,0');
    player._followers._gathering = true;
    run(40);
    assert.equal(at(), '8,0 8,0 8,0 8,0');
    assert.equal(player._followers._gathering, false);
});

test('followers take the leader settings before moving, with their facing fixed', () => {
    const { player, run } = smartWorld();
    const f = player._followers._data[0];
    player.input = [6];
    run(1);
    assert.deepEqual([f._directionFix, f.speed], [true, 5]);
    // A turn in a follower's move route does nothing: the fix is set again every frame.
    f.setDirection(8);
    assert.equal(f.direction(), 2);
    // Every jump is queued, even one in place.
    player.jump(0, 0);
    assert.deepEqual([...player._followers._rrSmartQueue[player._followers._rrSmartQueue.length - 1]], [0, 0, 6, 'jum']);
});
