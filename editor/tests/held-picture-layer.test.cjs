// Flat projection: a battler picture stands with its feet on its pose (the
// flat battle's anchor) so a held picture attached at hand height lands in the
// hand, and a Show weapon step can be drawn behind its holder in the game's
// flat battlefield, in a 2D room, and in the preview alike.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const read = p => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf8');

test('a flat battler picture stands on its pose and a held picture sits on its point', () => {
    const room = read('runtime/reactor_battle_room.js');
    assert.match(room, /const flat = this\.settings\?\.projection === '2d' && record\.billboard;/);
    assert.match(room, /p\.y \+ \.5 - \(flat \? \(p\.z \|\| 0\) \+ record\.height\/2 : 0\)\)/);
    // sequenceBillboard still takes half the height off z, which the fold above gives back.
    assert.match(room, /z:point\.z-height\/2,rotateZ:-\(step\.rotation\|\|0\),flipX:!!step\.flipX,behind:step\.layer==='behind',ownerKey:step\.ownerKey\|\|null/);
});

test('a held picture can be drawn behind its holder everywhere it is drawn', () => {
    const data = read('editor/src/battle/BattleData.js');
    assert.match(data, /pick\('layer','Layer',\['front','behind'\]\)/);
    assert.match(data, /front:'In front of the battler',behind:'Behind the battler'/);
    assert.equal(data, read('runtime/reactor_battle_data.js'), 'battle data is shared byte for byte');
    const presentation = read('runtime/reactor_battle_presentation.js');
    assert.match(presentation, /const holder=step\.type==='weapon'&&step\.layer==='behind'\?ss\.findTargetSprite\(battler\):null;/);
    assert.match(presentation, /ss\._battleField\.addChildAt\(graphic,ss\._battleField\.getChildIndex\(holder\)\)/);
    assert.match(presentation, /ownerKey:entry\.owner\?\._reactorRoomKey\|\|null/);
    const room = read('runtime/reactor_battle_room.js');
    assert.match(room, /const owner=r\.position\?\.behind&&r\.position\.ownerKey\?this\.billboards\.get\(r\.position\.ownerKey\):null;/);
    assert.match(room, /owner\?standing\(owner\)-1:1e6\+/);
    const editor = read('editor/src/database/DatabaseActionSequenceEditor.js');
    assert.match(editor, /view\.sequenceBillboard\(id,img\.source,img\.frame,this\.liftPose\(view\)\(p\),\{\.\.\.step,ownerKey:key\}\)/);
    // The choice sits with the other Show options, and is hidden for Move and Hide.
    assert.match(editor, /\.\.\.\(step\.type==='weapon'\?\['layer'\]:\[\]\)\]\.includes\(field\.key\)/);
    assert.match(editor, /'weaponGraphic','attachment','bone','gripX','gripY','equipIndex','layer'\]\.includes\(field\.key\)\)continue;/);
    const manager = read('editor/src/I18nManager.js');
    assert.equal((manager.match(/\{"In front of the battler": /g) || []).length, 17);
});
