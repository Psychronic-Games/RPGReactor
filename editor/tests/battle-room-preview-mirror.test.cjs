const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// The Troops page's room preview draws a battler's picture flipped by its facing, and Mirror
// (Battler Options) reverses that flip, as the game's Battle Room does (P.updateRoom).

const B = require('../../runtime/reactor_battle_data.js');
const source = fs.readFileSync(path.join(__dirname, '../src/battle/BattlePresentationEditor.js'), 'utf8');
const Editor = vm.runInNewContext(`${source}\nBattlePresentationEditor;`, { ReactorBattleData: B, console, window: {}, document: {} });

function flips(graphic) {
    const drawn = {};
    const view = { billboard: (key, image, frame, position) => { drawn[key] = position.flipX; }, place() {} };
    const room = B.room({ id: 1, width: 20, height: 20 });
    const cast = ['actors', 'enemies'].map(side => ({ key: side, side, index: 0, bitmap: { image: {} }, frame: { width: 48, height: 48 }, graphic }));
    Editor.prototype.drawRoomCast.call({}, view, room, cast);
    return drawn;
}

test('Mirror reverses the flip of a picture in the room preview', () => {
    const normal = flips({ scale: 1 }), mirrored = flips({ scale: 1, mirror: true }), none = flips(undefined);
    for (const side of ['actors', 'enemies']) {
        assert.equal(typeof normal[side], 'boolean');
        assert.equal(mirrored[side], !normal[side], `${side}: Mirror reverses the flip`);
        assert.equal(none[side], normal[side], `${side}: no Battler Options draws as before`);
    }
});
