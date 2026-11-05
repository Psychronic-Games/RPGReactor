'use strict';
// Waking where the player slept on a 3D map: on the floor they slept on (a roof, an upper storey), not on the
// tile's ground floor, where a transfer lands (Game_CharacterBase.locate forgets the floor). Sleepers likewise.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');

test('the wake note carries the floor stood on, and the server keeps it', () => {
    const ui = read('runtime/reactor_online_ui.js');
    const note = ui.slice(ui.indexOf('    wakeNote() {'), ui.indexOf('    /** Where this player stands.'));
    const ctx = { $gameMap: { mapId: () => 5 }, $gamePlayer: { x: 70, y: 58, direction: () => 2, _reactorGround: 3.25 } };
    vm.createContext(ctx);
    const wakeNote = vm.runInContext('({' + note + '}).wakeNote', ctx);
    assert.equal(wakeNote.call({ account: { session: 's' }, slot: 4 }).g, 3.25);
    ctx.$gamePlayer._reactorGround = undefined;
    assert.equal('g' in wakeNote.call({ account: { session: 's' }, slot: 4 }), false, 'no floor known: none sent');
    const api = read('editor/build-scripts/online-server/api.php');
    assert.match(api, /if \(isset\(\$body\['g'\]\) && is_numeric\(\$body\['g'\]\) && is_finite\(\(float\)\$body\['g'\]\)\) \$note\['g'\] = round\(max\(-1000\.0, min\(10000\.0, \(float\)\$body\['g'\]\)\), 3\);/);
    assert.match(api, /noteWake\(\$dir, \(string\)\$account\['key'\], \$note,/, 'into the wake note and the sleeper both');
});

test('a wake puts the floor back after its transfer, only for the place it woke at', () => {
    const ui = read('runtime/reactor_online_ui.js');
    const hook = ui.slice(ui.indexOf('const _reactorOnlinePerformTransfer'), ui.indexOf('// Save in the menu keeps the game'));
    function Game_Player() {}
    Game_Player.prototype.isTransferring = function() { return this._transferring; };
    Game_Player.prototype.performTransfer = function() { this._reactorGround = undefined; this._transferring = false; };
    const ctx = { Game_Player, ReactorOnline: { _wakeGround: { map: 5, x: 70, y: 58, g: 3.25 } } };
    vm.createContext(ctx);
    vm.runInContext(hook, ctx);
    const player = new Game_Player();
    Object.assign(player, { _transferring: true, _newMapId: 5, _newX: 70, _newY: 58 });
    player.performTransfer();
    assert.equal(player._reactorGround, 3.25, 'on the roof again');
    assert.equal(ctx.ReactorOnline._wakeGround, null, 'once');
    ctx.ReactorOnline._wakeGround = { map: 5, x: 70, y: 58, g: 3.25 };
    Object.assign(player, { _transferring: true, _newMapId: 5, _newX: 10, _newY: 10 });
    player.performTransfer();
    assert.equal(player._reactorGround, undefined, 'a transfer somewhere else lands as usual');
    const wake = ui.slice(ui.indexOf('    async wake(account) {'), ui.indexOf('    async signOff() {'));
    assert.match(wake, /this\._wakeGround = place && Number\.isFinite\(place\.g\) \? \{ map, x, y, g: place\.g \} : null;/);
});

test('a sleeper lies on the floor it slept on', () => {
    const online = read('runtime/reactor_online.js');
    const asleep = online.slice(online.indexOf('Game_RemotePlayer.prototype.setAsleep'), online.indexOf('/** Riding and fighting'));
    assert.match(asleep, /this\.locate\(entry\.x, entry\.y\);[\s\S]*if \(Number\.isFinite\(entry\.g\)\) this\._reactorGround = entry\.g;/, 'after locate, which forgets it');
});
