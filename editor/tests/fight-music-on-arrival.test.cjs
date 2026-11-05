'use strict';
// Arriving on a map whose battle plays the battle music (runtime/reactor_fight.js's Game_Map.autoplay): a load
// that reloads the map, an online wake, a transfer within the battle's map. The map's own music used to play over
// the battle's. And an online save keeps the music playing, and a wake plays it on (reactor_online_ui.js).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { fightWorld, event } = require('./helpers/fight-world.cjs');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');

const TOWN = { name: 'Town', volume: 90, pitch: 100, pan: 0 };
const BATTLE = { name: 'Battle1', volume: 90, pitch: 100, pan: 0 };

/** A world whose map plays Town on arrival, with the music played kept in `played`. */
function world(options = {}) {
    const w = fightWorld(Object.assign({ system: { battleBgm: BATTLE }, events: [event(1, 8, 8, { note: '<unit: enemy 1>' })] }, options));
    Object.assign(w.$dataMap, { autoplayBgm: true, bgm: TOWN, autoplayBgs: true, bgs: { name: 'Wind', volume: 80, pitch: 100, pan: 0 } });
    w.played = [];
    w.sounds = [];
    w.AudioManager.playBgm = bgm => w.played.push(bgm && bgm.name);
    w.AudioManager.replayBgm = bgm => w.played.push(bgm && bgm.name);
    w.AudioManager.playBgs = bgs => w.sounds.push(bgs && bgs.name);
    return w;
}

/** The game saved and loaded again, as a save file or the online server keeps it. */
function reload(w) {
    vm.runInContext(`
        const kept = JsonEx.stringify(DataManager.makeSaveContents());
        DataManager.createGameObjects();
        DataManager.extractSaveContents(JsonEx.parse(kept));
    `, w);
}

test('arriving on the map of a battle that plays the battle music keeps the battle music, and its end gives back the map\'s', () => {
    const w = world();
    w.$gameFight.start({ mode: 'tactical' });
    assert.equal(w.played.at(-1), 'Battle1', 'the battle began with its music');
    reload(w);
    assert.ok(w.$gameFight.isHere(), 'the battle came back with the save');
    w.played.length = 0;
    w.$gameMap.autoplay();
    assert.deepEqual(w.played, ['Battle1'], 'the map\'s music did not play over the battle\'s');
    assert.deepEqual(w.sounds, ['Wind'], 'the map\'s background sound still plays');
    w.$gameFight.finishAround(1);
    assert.equal(w.played.at(-1), 'Town', 'the battle\'s end plays the map\'s music');
});

test('a battle that keeps the map\'s music, or no battle at all, leaves arriving as it was', () => {
    const kept = world();
    kept.$gameFight.start({ mode: 'tactical', bgm: 'map' });
    kept.played.length = 0;
    kept.$gameMap.autoplay();
    assert.deepEqual(kept.played, ['Town']);

    const none = world();
    none.$gameMap.autoplay();
    assert.deepEqual(none.played, ['Town']);
});

test('with the vehicle files loaded, the battle music still holds on arrival', () => {
    const w = world({ vehicles: true });
    w.$gameFight.start({ mode: 'tactical' });
    w.played.length = 0;
    w.$gameMap.autoplay();
    assert.deepEqual(w.played, ['Battle1']);
});

test('an online save keeps the music playing and the clock, and a wake plays them on as a load does', () => {
    const ui = read('runtime/reactor_online_ui.js');
    const save = ui.slice(ui.indexOf('async saveProgress()'), ui.indexOf('wakeNote()'));
    assert.ok(save.indexOf('_bgmOnSave = AudioManager.saveBgm()') > 0, 'the music playing is kept');
    assert.ok(save.indexOf('_bgsOnSave = AudioManager.saveBgs()') > 0, 'the background sound playing is kept');
    assert.ok(save.indexOf('_framesOnSave = Graphics.frameCount') > 0, 'the play time is kept');
    assert.ok(save.indexOf('_bgmOnSave') < save.indexOf('makeSaveContents'), 'before the game is written');
    assert.ok(!/_saveCount/.test(save), 'a save on the beat is not counted as the player\'s save');
    const wake = ui.slice(ui.indexOf('async wake(account)'), ui.indexOf('async signOff()'));
    assert.ok(wake.indexOf('$gameSystem.onAfterLoad()') > wake.indexOf('extractSaveContents'), 'a wake plays on from the save');
});
