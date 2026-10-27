'use strict';
// RPG Maker 2000/2003 move-route timing (runtime/reactor_objects_legacy.js, EasyRPG's Game_Character::UpdateMoveRoute,
// ForceMoveRoute and CancelMoveRoute): the import keeps a Set Move Route's frequency and an event page's; a route
// waits 2^(9 - f) frames after a step, 2^(8 - f) after a turn and 20 more after a Wait, none at frequency 8; a new
// route replaces an unfinished one; the end or Stop All Movement gives the character its frequency back; nothing on
// the map runs between a Teleport and the new map. Sunset over Imdahl's hero ran a speed step too fast for good after
// the bar's rat hunt: the barkeeper's "turn, speed up" route ran during the teleport, where the old engine never
// reaches it before the rat hunt's first route replaces it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const C = require('../src/legacy/LegacyCommands.js');
const K = require('../src/legacy/LegacyConvert.js');
const { followerWorld, event, page } = require('./helpers/follower-world.cjs');

const repo = path.resolve(__dirname, '..', '..');
const sunset = path.join(repo, 'template', 'Sunset over Imdahl (Reactor)', 'data');
const cmd = (code, parameters = [], string = '', indent = 0) => ({ code, indent, string, parameters });
const END = { code: 0, parameters: [] };
const mark = { code: 45, parameters: ['this._mark = Graphics.frameCount'] };
const route = (list, f, extra = {}) => Object.assign({ list: list.concat([END]), repeat: false, skippable: false, wait: false, rrFrequency: f }, extra);

test('the import keeps the frequency of a Set Move Route and of an event page', () => {
    const ctx = { notes: {} };
    const slow = C.convertList([cmd(11330, [10001, 3, 0, 0, 15, 28])], ctx).list[0];
    assert.equal(slow.code, 205);
    assert.equal(slow.parameters[1].rrFrequency, 3);
    assert.equal(C.convertList([cmd(11330, [10005, 0, 0, 0, 15])], ctx).list[0].parameters[1].rrFrequency, 6, 'out of range: 6, as EasyRPG');
    const boat = C.convertList([cmd(11330, [10002, 8, 0, 0, 15])], ctx).list[0];
    assert.match(boat.parameters[0], /forceMoveRoute\(.*"rrFrequency":8/);
    assert.deepEqual(C.convertRoute([{ code: 30 }, { code: 31 }], ctx).list.slice(0, 2).map(m => m.parameters[0]), ['this.rrStepFrequency(1)', 'this.rrStepFrequency(-1)']);
    const pg = K.eventPage({ move_frequency: 7, move_type: 6 }, {});
    assert.equal(pg.rrFrequency, 7);
    assert.equal(pg.moveFrequency, 4);
    assert.equal(K.eventPage({}, {}).rrFrequency, 3);
});

function world(system = { rrLegacyMotion: true }, events = []) {
    const w = followerWorld({ system, party: [1], start: [5, 5], events });
    w.frame = () => { w.run(1); return w.Graphics.frameCount; };
    return w;
}

/** Forces `r` on the player and returns the frames from the first command to the mark (and the mark frame). */
function timeRoute(w, r) {
    const p = w.$gamePlayer;
    p._mark = 0;
    p.forceMoveRoute(r);
    const start = w.Graphics.frameCount + 1;
    for (let i = 0; i < 800 && !p._mark; i++) w.frame();
    assert.ok(p._mark, 'the route reached its mark');
    return p._mark - start;
}

test('a route waits after a step, a turn and a wait by its frequency', () => {
    const w = world();
    const p = w.$gamePlayer;
    p.setMoveSpeed(4);                                   // 2^5 / 256 of a tile a frame: eight frames a step
    for (const f of [3, 5, 7]) {
        assert.equal(timeRoute(w, route([{ code: 17, parameters: [] }, mark], f)), 1 << (8 - f), 'turn at frequency ' + f);
        assert.equal(p.direction(), 4);
        assert.equal(timeRoute(w, route([{ code: 15, parameters: [20] }, mark], f)), 20 + (1 << (8 - f)), 'wait at frequency ' + f);
        const x = p.x;
        assert.equal(timeRoute(w, route([{ code: 3, parameters: [] }, mark], f)), 8 + (1 << (9 - f)), 'step at frequency ' + f);
        assert.equal(p.x, x + 1);
        w.run(300);
    }
    // frequency 8: no wait at all, the turn and what follows run in one frame
    assert.equal(timeRoute(w, route([{ code: 19, parameters: [] }, mark], 8)), 0);
    // instant commands run in the frame of the command before them
    p.forceMoveRoute(route([{ code: 16, parameters: [] }, { code: 45, parameters: ['this.setMoveSpeed(5)'] }, { code: 45, parameters: ['this.setMoveSpeed(6)'] }], 8));
    w.frame();
    assert.equal(p.moveSpeed(), 6);
    assert.equal(p.isMoveRouteForcing(), false, 'and the route is over');
});

test('a route that ends with a step ends as it lands; one that ends with a turn waits it out first', () => {
    const w = world();
    const p = w.$gamePlayer;
    p.setMoveSpeed(4);
    p.forceMoveRoute(route([{ code: 3, parameters: [] }], 4));
    let frames = 0;
    while (p.isMoveRouteForcing() && frames < 200) { w.frame(); frames++; }
    assert.equal(frames, 8, 'over on the frame the step lands');
    p.forceMoveRoute(route([{ code: 16, parameters: [] }], 4));
    frames = 0;
    while (p.isMoveRouteForcing() && frames < 200) { w.frame(); frames++; }
    assert.equal(frames, 1 + 16, 'the turn, then its 2^(8 - 4) frames');
});

test('a new route replaces an unfinished one, and the end or Stop All Movement restores the frequency', () => {
    const w = world();
    const p = w.$gamePlayer;
    p.setMoveSpeed(3);
    p._rrFrequency = 2;
    p.forceMoveRoute(route([{ code: 17, parameters: [] }, { code: 45, parameters: ['this.setMoveSpeed(this.moveSpeed() + 1)'] }], 3));
    w.frame();
    assert.equal(p.rrMoveFrequency(), 3);
    w.run(10);                                           // 32 frames before the speed-up
    p.forceMoveRoute(route([{ code: 16, parameters: [] }], 5));
    assert.equal(p._moveRouteIndex, 0);
    w.run(100);
    assert.equal(p.moveSpeed(), 3, 'the first route\'s speed-up never ran');
    assert.equal(p.isMoveRouteForcing(), false);
    assert.equal(p.rrMoveFrequency(), 2, 'the frequency from before the first route');
    // Increase Frequency within a route shortens its own waits, and is undone with the route
    p.forceMoveRoute(route([{ code: 45, parameters: ['this.rrStepFrequency(1)'] }, { code: 17, parameters: [] }, mark], 4));
    p._mark = 0;
    const start = w.Graphics.frameCount + 1;
    while (!p._mark) w.frame();
    assert.equal(p._mark - start, 1 << (8 - 5));
    w.run(5);
    assert.equal(p.rrMoveFrequency(), 2);
    // Stop All Movement: the route ends there, the frequency comes back
    p.forceMoveRoute(route([{ code: 15, parameters: [20] }, { code: 45, parameters: ['this.setMoveSpeed(6)'] }], 3, { repeat: true }));
    w.run(3);
    new w.Game_Interpreter().rrHaltAllMoves();
    assert.equal(p.isMoveRouteForcing(), false);
    assert.equal(p.rrMoveFrequency(), 2);
    w.run(200);
    assert.equal(p.moveSpeed(), 3);
});

test('an event\'s own custom route keeps its page\'s frequency', () => {
    const turns = { list: [{ code: 17, parameters: [] }, { code: 18, parameters: [] }, END], repeat: true, skippable: false, wait: false };
    const w = world(undefined, [event(1, 8, 8, { pages: [page({ moveType: 3, moveFrequency: 3, rrFrequency: 4, moveRoute: turns })] })]);
    const ev = w.$gameMap.event(1);
    const changes = [];
    let last = ev.direction();
    for (let i = 0; i < 70; i++) { w.frame(); if (ev.direction() !== last) { changes.push(w.Graphics.frameCount); last = ev.direction(); } }
    const gaps = changes.slice(1).map((f, i) => f - changes[i]);
    assert.ok(gaps.length >= 2 && gaps.every(g => g === 16), 'a turn each 2^(8 - 4) frames: ' + gaps);
    // edited in the editor since the import (MZ frequency no longer matches): MZ's own timing
    const w2 = world(undefined, [event(1, 8, 8, { pages: [page({ moveType: 3, moveFrequency: 5, rrFrequency: 4, moveRoute: turns })] })]);
    assert.equal(w2.$gameMap.event(1).rrTimedRoute(), false);
});

test('an MZ game keeps MZ\'s route timing', () => {
    const w = world({});
    assert.equal(timeRoute(w, route([{ code: 17, parameters: [] }, mark], 3)), 1, 'one command a frame');
});

test('Sunset over Imdahl: the hero is as fast after the rat hunt as before it', { skip: !fs.existsSync(path.join(sunset, 'Map047.json')) }, () => {
    if (!Array.prototype.clone) Object.defineProperty(Array.prototype, 'clone', { value() { return this.slice(); } });
    const w = followerWorld({ data: sunset, mapId: 44, start: [5, 10], party: [1] });
    vm.runInContext(`Game_Interpreter.prototype.loadImages = function() {};
        ImageManager.loadPicture = () => ({ addLoadListener() {}, isReady: () => true, width: 1, height: 1 });
        ImageManager.loadCharacter = ImageManager.loadFace = ImageManager.loadSystem = ImageManager.loadPicture;
        if (!Array.prototype.clone) Object.defineProperty(Array.prototype, "clone", { value() { return this.slice(); } });
        Point = function(x, y) { this.x = x || 0; this.y = y || 0; };
        if (!Game_Screen.prototype.rrPictureEffect) Game_Screen.prototype.rrPictureEffect = function() {};`, w);
    const json = name => vm.runInContext('JSON.parse', w)(fs.readFileSync(path.join(sunset, name), 'utf8'));
    const p = w.$gamePlayer;
    // Scene_Map's frame: the map, the player, the timer and screen, and a transfer once one is reserved
    const run = (limit, until) => {
        for (let i = 0; i < limit; i++) {
            if (w.$gameMessage.hasText() || w.$gameMessage.isChoice()) { if (w.$gameMessage.isChoice()) w.$gameMessage.onChoice(0); w.$gameMessage.clear(); }
            w.Graphics.frameCount++;
            w.$gameMap.update(true);
            w.$gamePlayer.update(true);
            w.$gameTimer.update(true);
            w.$gameScreen.update();
            if (p.isTransferring()) {
                w.$dataMap = json('Map' + String(p._newMapId).padStart(3, '0') + '.json');
                vm.runInContext('DataManager.extractMetadata($dataMap); for (const e of $dataMap.events) if (e) DataManager.extractMetadata(e);', w);
                p.performTransfer();
            }
            if (until()) return;
        }
        assert.fail('ran out of frames');
    };
    const before = p.moveSpeed();
    // the barkeeper's "catch the rats": turn the hero, speed him up, teleport to the cellar
    const bar = json('Map044.json').events[2].pages[0].list;
    const at = bar.findIndex(c => c.code === 201 && c.parameters[1] === 47) - 1;
    assert.equal(bar[at].code, 205);
    assert.equal(bar[at].parameters[1].rrFrequency, 8, 'the patched import keeps the route\'s frequency');
    w.$gameMap._interpreter.setup(bar.slice(at), 2);
    run(4000, () => w.$gameMap.mapId() === 47 && !w.$gameMap.isEventRunning() && !p.isMoveRouteForcing());
    assert.equal(p.moveSpeed(), before + 1, 'the hunt\'s own route nets one step faster');
    // the last rat caught (Common Event 6 with the counter one short): turn, slow down, back to the bar
    w.$gameVariables.setValue(5, 8);
    run(600, () => !w.$gameMap.isEventRunning());
    w.$gameMap._interpreter.setup(json('CommonEvents.json')[6].list, 0);
    run(4000, () => w.$gameMap.mapId() === 44 && !w.$gameMap.isEventRunning() && !p.isMoveRouteForcing());
    assert.equal(p.moveSpeed(), before);
});
