'use strict';
// DynRPG comment commands → Script calls on the runtime's screen features
// (reactor_screen_fx.js): the parser, the argument forms, each family, and
// the runtime file's place in the loader.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const Dyn = require('../src/legacy/LegacyDynRpg.js');
const C = require('../src/legacy/LegacyCommands.js');

const repo = path.resolve(__dirname, '..', '..');

test('a comment command parses with quoted, numeric, variable and empty arguments', () => {
    assert.deepEqual(Dyn.parse('@write_text "Aktion", V97, V98, "Insane",, 0, V185'), { name: 'write_text', args: ['"Aktion"', 'V97', 'V98', '"Insane"', '', '0', 'V185'] });
    assert.deepEqual(Dyn.parse('@call move_sprite_by, "Kröte", 40, -50, 1000, "quadratic in/out"'), { name: 'move_sprite_by', args: ['"Kröte"', '40', '-50', '1000', '"quadratic in/out"'] });
    assert.deepEqual(Dyn.parse('@pfx_set_texture "aqua", "partikel, aqua",').args, ['"aqua"', '"partikel, aqua"', '']);
    assert.equal(Dyn.parse('plain comment'), null);
    assert.deepEqual([Dyn.expr('"a"'), Dyn.expr('V12'), Dyn.expr('-7'), Dyn.expr('end'), Dyn.expr('')], ['"a"', '$gameVariables.value(12)', '-7', '"end"', 'undefined']);
});

test('every family becomes one $gameScreen call with the plugin’s argument order', () => {
    const c = (s) => Dyn.convert(Dyn.parse(s).name, Dyn.parse(s).args);
    assert.equal(c('@write_text "Aktion", V97, V98, "Insane", "fixed", 3, V185'), '$gameScreen.rrWriteText("Aktion", $gameVariables.value(97), $gameVariables.value(98), "Insane", true, 3, $gameVariables.value(185))');
    assert.equal(c('@append_line "a", "Die Zereo",,'), '$gameScreen.rrAppendLine("a", "Die Zereo")');
    assert.equal(c('@change_text "12", "2x Zauber", 6'), '$gameScreen.rrChangeText("12", "2x Zauber", 6)');
    assert.equal(c('@remove_text "R", end'), '$gameScreen.rrRemoveText("R")');
    assert.equal(c('@add_sprite "HG", "Picture/HEDON/Palast Kampf1.png", "mix", 1, 5, 160, 120, 100, 0'), '$gameScreen.rrSpriteAdd("HG", "Picture/HEDON/Palast Kampf1.png", "mix", 0, 160, 120, 100, 0, 5)');
    assert.equal(c('@set_sprite_z "HG", 3'), '$gameScreen.rrSpriteZ("HG", 3)');
    // one axis only: a hop (move y) must not stop the travel across (move x), as Deep 8's rabbit jumps at the hero
    assert.equal(c('@move_y_sprite_to "PA", V82, 400, "quadratic in"'), '$gameScreen.rrSpriteMoveTo("PA", null, $gameVariables.value(82), 400, "quadratic in")');
    assert.equal(c('@move_x_sprite_to "PA", V81, 800'), '$gameScreen.rrSpriteMoveTo("PA", $gameVariables.value(81), null, 800, "linear")');
    assert.equal(c('@rotate_sprite_to "a", "ccw", 100, 2000'), '$gameScreen.rrSpriteRotateTo("a", "ccw", 100, 2000, "linear")');
    assert.equal(c('@bind_sprite_to "HG", "map"'), '$gameScreen.rrSpriteBind("HG", "map")');
    assert.equal(c('@set_sprite_layer "HG", 1'), '$gameScreen.rrSpriteLayer("HG", 1)');
    assert.equal(c('@call shift_sprite_opacity_to, "Balken", 0, 500'), '$gameScreen.rrSpriteOpacityTo("Balken", 0, 500, "linear")');
    assert.equal(c('@call scale_sprite_to, V215, 200, 3000, "quadratic out"'), '$gameScreen.rrSpriteScaleTo($gameVariables.value(215), 200, 200, 3000, "quadratic out")');
    assert.equal(c('@scale_y_sprite_to "kopf", 200, 3000, "quadratic in/out"'), '$gameScreen.rrSpriteScaleTo("kopf", null, 200, 3000, "quadratic in/out")');
    assert.equal(c('@rotate_sprite_forever "Krone", "ccw", 5000'), '$gameScreen.rrSpriteRotateForever("Krone", "ccw", 5000)');
    assert.equal(c('@call set_sprite_color, "S", 250, 250, 250, 100'), '$gameScreen.rrSpriteColor("S", 250, 250, 250, 100)');
    assert.equal(c('@get_sprite_position "p", 41, 42'), '$gameScreen.rrSpritePosition("p", 41, 42)');
    assert.equal(c('@pfx_create_effect "combo", "burst"'), '$gameScreen.rrPfxCreate("combo", "burst")');
    assert.equal(c('@pfx_set_velocity "combo", 60, 0'), '$gameScreen.rrPfxSet("combo", "velocity", 60, 0)');
    assert.equal(c('@pfx_set_initial_color "combo", 100, 100, 100'), '$gameScreen.rrPfxSet("combo", "color0", 100, 100, 100)');
    assert.equal(c('@pfx_burst "Block", V1204, V1206'), '$gameScreen.rrPfxBurst("Block", $gameVariables.value(1204), $gameVariables.value(1206))');
    assert.equal(c('@pfx_set_gravity_direction "aqua", 90, 5'), '$gameScreen.rrPfxSet("aqua", "gravity", 90, 5)');
    assert.equal(c('@pfx_set_acceleration_point "a", 10, 20, 3'), '$gameScreen.rrPfxSet("a", "acceleration", 10, 20, 3)');
    assert.equal(c('@easyrpg_set_language "english"'), 'if (this.rrSetLanguage) this.rrSetLanguage("english")');
    // with a translator, quoted text arguments are translated; ids, numbers and variables are not
    const tr = (s) => ({ 'Neues Spiel': 'New Game', 'Laden': 'Load' })[s] || s;
    assert.equal(Dyn.convert('write_text', ['"1"', 'V41', 'V42', '"Neues Spiel"', '', '0', '40'], tr), '$gameScreen.rrWriteText("1", $gameVariables.value(41), $gameVariables.value(42), "New Game", false, 0, 40)');
    assert.equal(Dyn.convert('append_line', ['"1"', '"Laden"'], tr), '$gameScreen.rrAppendLine("1", "Load")');
    assert.equal(Dyn.convert('change_text', ['"Laden"', '"Laden"', '3'], tr), '$gameScreen.rrChangeText("Laden", "Load", 3)');
    assert.equal(Dyn.convertComment(['@write_text "1", 1, 2, "Neues Spiel"'], tr).script, '$gameScreen.rrWriteText("1", 1, 2, "New Game", false, 0, 0)');
});

test('in a command list, an @ comment on any line becomes a Script and others stay comments, counted by family', () => {
    const cmd = (code, string, indent = 0) => ({ code, indent, string, parameters: [] });
    const ctx = { itemKind: () => 'items', actors: {}, notes: {} };
    const { list, notes } = C.convertList([cmd(12410, '@write_text "a", 1, 2, "Line one'), cmd(22410, 'still line one"'), cmd(22410, '@remove_text "a", end'), cmd(12410, 'a note'), cmd(22410, 'continued'), cmd(12410, '@easyrpg_set_language "english"')], ctx);
    assert.deepEqual(list.map(c => c.code), [355, 355, 108, 408, 355, 0]);
    assert.equal(list[0].parameters[0], '$gameScreen.rrWriteText("a", 1, 2, "Line one\\nstill line one", false, 0, 0)', 'continuation lines join with a newline inside the string literal');
    assert.equal(list[1].parameters[0], '$gameScreen.rrRemoveText("a")');
    assert.equal(list[4].parameters[0], 'if (this.rrSetLanguage) this.rrSetLanguage("english")', 'EasyRPG\'s language switch goes to RR_Language');
    assert.deepEqual(notes, { 'dynrpg:write_text': 1, 'dynrpg:remove_text': 1, 'dynrpg:easyrpg_set_language': 1 });
});

test('a write_text and the append_lines after it translate as one message, laid back out line by line', () => {
    const cmd = (code, string) => ({ code, indent: 0, string, parameters: [] });
    const tr = (s) => ({ 'Der Grad.\nZeile zwei\nZeile drei': 'The level.\nLine two\nLine three\nLine four', 'Leicht': 'Easy' })[s] || s;
    const { list, notes } = C.convertList([
        cmd(12410, '@write_text "4", V41, V42, "Der Grad.",, 0, 1000'), cmd(12410, '@append_line "4", "Zeile zwei",, '), cmd(12410, '@append_line "4", "Zeile drei",, '),
        cmd(12410, '@write_text "2", 1, 2, "Leicht",, 3, 1000'), cmd(12410, '@append_line "9", "Andere",, ')
    ], { itemKind: () => 'items', actors: {}, notes: {}, translate: tr });
    assert.deepEqual(list.map(c => c.parameters[0]), [
        '$gameScreen.rrWriteText("4", $gameVariables.value(41), $gameVariables.value(42), "The level.", false, 0, 1000)',
        '$gameScreen.rrAppendLine("4", "Line two")', '$gameScreen.rrAppendLine("4", "Line three")', '$gameScreen.rrAppendLine("4", "Line four")',
        '$gameScreen.rrWriteText("2", 1, 2, "Easy", false, 3, 1000)', '$gameScreen.rrAppendLine("9", "Andere")', undefined
    ], 'the block gains a fourth line; a lone line still translates on its own; a different id is not part of the block');
    assert.deepEqual(notes, { 'dynrpg:write_text': 2, 'dynrpg:append_line': 4 });
});

test('the screen-features runtime file is loaded after the picture extensions and copied by every build', () => {
    const main = fs.readFileSync(path.join(repo, 'runtime', 'reactor_main.js'), 'utf8');
    assert.ok(main.indexOf('"js/reactor_picture_extensions.js"') < main.indexOf('"js/reactor_screen_fx.js"'));
    const fx = fs.readFileSync(path.join(repo, 'runtime', 'reactor_screen_fx.js'), 'utf8');
    for (const name of ['rrWriteText', 'rrAppendLine', 'rrChangeText', 'rrRemoveText', 'rrTextAlign', 'rrSpriteAdd', 'rrSpriteBind', 'rrSpriteLayer', 'rrSpriteZ', 'rrSpriteOpacityTo', 'rrSpriteMoveBy', 'rrSpriteScaleTo', 'rrSpriteRotateBy', 'rrSpriteRotateForever', 'rrSpriteColorTo', 'rrSpritePosition', 'rrPfxCreate', 'rrPfxSet', 'rrPfxBurst', 'rrPfxStart', 'rrPfxDestroy', 'rrPictureEffect']) {
        assert.ok(fx.includes(`Game_Screen.prototype.${name} = function`), name);
    }
    assert.doesNotThrow(() => new Function(fx));
    // the rules the shipped Deep 8 player settled: map layers 1-9, no layer = over everything, a 32 px wave, screen text in the game font centred on x
    const fn = (name) => new RegExp(`function ${name}\\([\\s\\S]*?\\n    }\\n|function ${name}\\(.*\\n`).exec(fx)[0];
    const [spriteLayer, layerZ] = new Function(fn('spriteLayer') + fn('layerZ') + 'return [spriteLayer, layerZ];')();
    assert.deepEqual([undefined, 0, 1, 7, 10, 11].map(spriteLayer), [11, 11, 1, 7, 10, 11], 'a sprite never given a layer is over every map layer');
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(layerZ), ['panorama', 0.5, 1.5, 3.5, 4.5, 5.5, null, null, 'top', 'top', 'top']);
    // a picture is ordered by id x 10, a sprite by its z with a lower z in front (the title's letters, z 5, over the glows, z 13)
    assert.match(fx, /const order = p\._rrSprite \? -\(Number\(p\._rrSprite\.z\) \|\| 0\) : \(sprite\._pictureId \|\| 0\) \* 10;/);
    // sprite colours are 2003 picture colours: percent, 100 unchanged
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const toneOf = new Function('clamp', /function toneOf[\s\S]*?\n    }\n/.exec(fx)[0] + 'return toneOf;')(clamp);
    assert.deepEqual(toneOf(100, 100, 100, 100), [0, 0, 0, 0]);
    assert.deepEqual(toneOf(50, 100, 100, 100), [-127, 0, 0, 0]);
    assert.deepEqual(toneOf(0, 0, 0, 0), [-255, -255, -255, 255]);
    assert.match(fx, /uWavelength = 32 \* Math\.abs\(this\.scale\.y \|\| 1\)/);
    assert.match(fx, /const shift = t\.align === "center" \? Math\.round\(this\.bitmap\.width \/ 2\)/);
    assert.match(fx, /measure\.fontFace = fontFace/);
    assert.match(fx, /Game_Picture\.prototype\._rrStepTweens = function/);
    assert.ok(!/_rrSpriteMove\b/.test(fx), 'sprite moves no longer go through the single MZ picture move');
    for (const file of ['build-scripts/build.js', 'build-scripts/build-worker.js', 'build-scripts/dist-editor-worker.js']) assert.ok(fs.readFileSync(path.join(repo, 'editor', file), 'utf8').includes("'reactor_screen_fx.js'"), file);
});
