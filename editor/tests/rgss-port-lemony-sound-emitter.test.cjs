const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_LemonySoundEmitter.js'), 'utf8');

function load(random = () => 0.5) {
    const played = [];
    function Game_Event(list) { this._list = list; this._realX = 10; this._realY = 10; }
    Game_Event.prototype.refresh = function() {};
    Game_Event.prototype.update = function() {};
    Game_Event.prototype.page = function() { return this._list ? { list: this._list } : null; };
    const log = (kind) => (s) => played.push(Object.assign({ kind }, s));
    const ctx = { Game_Event, Math: Object.create(Math), $gamePlayer: { _realX: 10, _realY: 10 },
        AudioManager: { playSe: log('se'), playMe: log('me'), playBgs: log('bgs'), playBgm: log('bgm') } };
    ctx.Math.random = random;
    vm.runInNewContext(source, ctx);
    return { ctx, played, Game_Event };
}
const comment = (text) => ({ code: 108, parameters: [text] });
const end = { code: 0, parameters: [] };

test('Lemony sound emitter: detected, no calls', () => {
    assert.ok(C.scriptFamilies(['class Game_Event < Game_Character\n  alias lemony_see_refresh refresh\nend']).has('lemonySoundEmitter'));
});

test('an SE emitter plays on its beat at a volume set by distance, and fades after the player leaves', () => {
    const { ctx, played, Game_Event } = load();
    const e = new Game_Event([comment('<custom light>'), { code: 408, parameters: ['name: "lamp2"'] }, comment('LSEE SE 20 100 100 helicopter 15'), end]);
    e.refresh();
    assert.deepEqual([...e._rrLsee.data.slice(0, 7)], ['SE', '20', 100, '100', 'helicopter', 15, 0]);
    ctx.$gamePlayer._realX = 0;   // 10 tiles away: (20 - 10 + 1) * 100 / 20 = 55
    for (let i = 0; i < 16; i++) e.update();
    assert.deepEqual(played.map(p => ({ ...p })), [{ kind: 'se', name: 'helicopter', volume: 55, pitch: 100, pan: 0 }]);   // 15 + rand(0) frames → 16th
    for (let i = 0; i < 16; i++) e.update();
    assert.equal(played.length, 2);
    // Within a tile it clips at 100.
    ctx.$gamePlayer._realX = 10;
    for (let i = 0; i < 16; i++) e.update();
    assert.equal(played[2].volume, 100);
    // Out of range: the volume drops a step a frame and it keeps playing on its beat until it reaches 0.
    ctx.$gamePlayer._realX = 50;
    for (let i = 0; i < 200; i++) e.update();
    assert.ok(played.slice(3).every(p => p.volume < 100 && p.volume > 0));
    assert.equal(e._rrLsee.data[7], null);
});

test('a BGS emitter replays every frame at the new volume; a page without the comment fades it out and forgets it', () => {
    const { ctx, played, Game_Event } = load();
    const e = new Game_Event([comment('LSEE BGS 6 100 50 johnnythesalesman-geiger-counter'), end]);
    e.refresh();
    ctx.$gamePlayer._realX = 7;   // 3 tiles: (6 - 3 + 1) * 50 / 6 = 33.3
    e.update(); e.update();
    assert.deepEqual(played.map(p => [p.kind, p.volume]), [['bgs', 33], ['bgs', 33]]);
    e._list = [end];
    e.refresh();
    assert.equal(e._rrLsee.out, true);
    for (let i = 0; i < 40; i++) e.update();
    assert.equal(e._rrLsee.data, null);
    assert.equal(played.at(-1).volume, 0);
    // Range 1: Ruby's 1 % 1 is 0, so the volume is (1 - d) × volume.
    const one = new Game_Event([comment('LSEE BGS 1 100 100 server'), end]);
    one.refresh();
    ctx.$gamePlayer._realX = 10.5;
    one.update();
    assert.equal(played.at(-1).volume, 50);
});
