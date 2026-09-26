'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const legacy = path.resolve(__dirname, '..', 'src', 'legacy');
const C = require(path.join(legacy, 'RgssConvert.js'));
const source = fs.readFileSync(path.join(legacy, 'plugins', 'RR_GalvItemSounds.js'), 'utf8');
const { extract } = require(path.join(legacy, 'plugins', 'RR_GalvItemSounds.params.js'));

const SCRIPT = `$imported["Menu_Use_SE"] = true
module Menu_Use_SE
  OPTIMIZE_EQUIP_SE = ["", 100, 100]  # Sound for optimize equip. To disable
                                          # set to ["",0,0]
  CLEAR_EQUIP_SE = ["", 100, 100]   # Sound for clear equip. To disable
end
module SE_Stuff
end`;

test('Galv Item Sounds: detected, settings from the game copy', () => {
    assert.ok(C.scriptFamilies([SCRIPT]).has('galvItemSounds'));
    assert.deepEqual(extract({ scripts: [SCRIPT] }), { optimizeSe: '{"name":"","volume":100,"pitch":100}', clearSe: '{"name":"","volume":100,"pitch":100}' });
    const p = extract({ scripts: [SCRIPT.replace('OPTIMIZE_EQUIP_SE = [""', 'OPTIMIZE_EQUIP_SE = ["Equip1"')] });
    assert.equal(p.optimizeSe, '{"name":"Equip1","volume":100,"pitch":100}');
});

function load(parameters = {}) {
    const log = [];
    const scene = (name, own) => { function S() {} S.prototype.playSeForItem = function() { log.push(own); }; S.prototype.item = function() { return this._item; }; return S; };
    function Scene_Equip() {}
    Scene_Equip.prototype.commandOptimize = function() { log.push('optimize'); };
    Scene_Equip.prototype.commandClear = function() { log.push('clear'); };
    Scene_Equip.prototype.onItemOk = function() { this.constructor.SM.playEquip(); log.push('equipped'); };
    const SoundManager = { playEquip: () => log.push('equipSound'), playSystemSound: (n) => log.push('system' + n) };
    Scene_Equip.SM = SoundManager;
    const ctx = {
        Scene_Item: scene('Scene_Item', 'useItem'), Scene_Skill: scene('Scene_Skill', 'useSkill'), Scene_Equip, SoundManager, window: {},
        AudioManager: { playSe: (se) => log.push(`${se.name}/${se.volume}/${se.pitch}/${se.pan}`), stopSe: () => log.push('stop') },
        PluginManager: { parameters: () => Object.assign({ optimizeSe: '{"name":"","volume":100,"pitch":100}', clearSe: '{"name":"","volume":100,"pitch":100}' }, parameters) }
    };
    vm.runInNewContext(source, ctx);
    return { ctx, log };
}

test('Galv Item Sounds: a tagged item or skill plays its own sound in the menu', () => {
    const { ctx, log } = load();
    const item = new ctx.Scene_Item(), skill = new ctx.Scene_Skill();
    item._item = { note: 'Pain relief.\r\n<se: "pills",90,110>\r\n' };
    item.playSeForItem();
    item._item = { note: '' };
    item.playSeForItem();
    item._item = null;
    item.playSeForItem();
    skill._item = { note: '<SE: "Heal7",100,100>' };
    skill.playSeForItem();
    skill._item = { note: '<se: "",100,100>' };   // a tag with no name still replaces the sound
    skill.playSeForItem();
    assert.deepEqual(log, ['pills/90/110/0', 'useItem', 'Heal7/100/100/0', '/100/100/0']);
});

test('Galv Item Sounds: equipping plays the tag or the Equip sound; taking off is silent', () => {
    const { ctx, log } = load();
    const scene = new ctx.Scene_Equip();
    scene._itemWindow = { item: () => ({ note: '<se: "ShotgunCock",100,100>' }) };
    scene.onItemOk();
    scene._itemWindow = { item: () => ({ note: 'plain' }) };
    scene.onItemOk();
    scene._itemWindow = { item: () => null };
    scene.onItemOk();
    assert.deepEqual(log, ['ShotgunCock/100/100/0', 'equipped', 'system4', 'equipped', 'equipped']);
});

test('Galv Item Sounds: optimize and clear stop sounds, then play theirs or the Equip sound', () => {
    const { ctx, log } = load({ clearSe: '{"name":"Equip3","volume":80,"pitch":90}' });
    const scene = new ctx.Scene_Equip();
    scene.commandOptimize();
    scene.commandClear();
    assert.deepEqual(log, ['stop', 'system4', 'optimize', 'stop', 'Equip3/80/90/0', 'clear']);
});
