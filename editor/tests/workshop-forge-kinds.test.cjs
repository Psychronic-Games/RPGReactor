'use strict';
// The Forge's generators on the Steam Workshop (src/steam/WorkshopItems.js): animations, Effekseer effects and
// sounds share as designs like characters and props, each under its own Type tag; an animation carries the
// texture files its recipe names, and a subscribed one brings them into the project without overwriting another.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const Items = require('../src/steam/WorkshopItems.js');

function tempDir(t) {
    const dir = fs.mkdtempSync(path.join(os.homedir(), '.cache', 'rr-workshop-kinds-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

function writeDesign(project, kind, name, recipe) {
    const dir = Items.designsDir(project, kind);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify({ builder: kind, version: 1, recipe }));
    fs.writeFileSync(path.join(dir, name + '.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
}

test('each generator is a Workshop kind with its own Type tag, Forge tool and designs folder', () => {
    const expect = {
        animation: ['Animation', 'animation-generator', 'animationGenerator', ['forge', 'animation_generator', 'designs']],
        effekseer: ['Effect', 'effekseer-generator', 'effekseerGenerator', ['forge', 'effekseer_generator', 'designs']],
        sound: ['Sound', 'sound-effect-generator', 'soundEffectGenerator', ['forge', 'sound_effect_generator', 'designs']]
    };
    for (const [kind, [tag, tool, getter, folder]] of Object.entries(expect)) {
        const k = Items.KINDS[kind];
        assert.ok(k, kind);
        assert.equal(k.tag, tag);
        assert.equal(k.tool, tool);
        assert.equal(k.getter, getter);
        assert.deepEqual(k.folder, folder);
    }
    // The tags are the ones set up in Steamworks › Workshop › Tags (Type).
    assert.deepEqual(Object.values(Items.KINDS).map(k => k.tag).sort(), ['Animation', 'Character', 'Effect', 'Prop', 'Sound']);
});

test('designs of every generator are listed for sharing', t => {
    const project = tempDir(t);
    writeDesign(project, 'animation', 'Spark', { layers: [] });
    writeDesign(project, 'effekseer', 'Burst', { recipe: 'x' });
    writeDesign(project, 'sound', 'Zap', { archetype: 'laser' });
    assert.deepEqual(Items.listDesigns(project).map(d => d.kind + '/' + d.name).sort(), ['animation/Spark', 'effekseer/Burst', 'sound/Zap']);
});

test('an animation carries its textures; added to a project, a different file of the same name is never overwritten', t => {
    const author = tempDir(t), stageRoot = tempDir(t), other = tempDir(t);
    const textures = path.join(author, ...Items.TEXTURE_FOLDER);
    fs.mkdirSync(textures, { recursive: true });
    fs.writeFileSync(path.join(textures, 'rune.png'), 'the author\'s rune');
    const recipe = {
        layers: [{ categoryId: 'shape', animationId: 'cube', keyframes: [{ params: { texture: 'rune.png' } }, { params: { texture: 'missing.png' } }] }],
        previewSingle: { categoryId: 'shape', animationId: 'cube', params: { texture: 'rune.png' } },
        textures: ['missing.png', 'rune.png']
    };
    writeDesign(author, 'animation', 'Rune Cube', recipe);
    const design = Items.listDesigns(author).find(d => d.name === 'Rune Cube');
    const staged = Items.stage(stageRoot, author, design);
    assert.equal(fs.readFileSync(path.join(staged.contentPath, 'textures', 'rune.png'), 'utf8'), 'the author\'s rune');
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(staged.contentPath, 'item.json'), 'utf8')).textures, ['rune.png'], 'only files that exist');

    const item = Items.readItem(staged.contentPath);
    assert.ok(!(item instanceof Error), String(item && item.message));
    assert.deepEqual(item.textures.map(x => x.name), ['rune.png']);

    // The subscriber already has a rune.png of their own.
    const theirs = path.join(other, ...Items.TEXTURE_FOLDER);
    fs.mkdirSync(theirs, { recursive: true });
    fs.writeFileSync(path.join(theirs, 'rune.png'), 'my own rune');
    const added = Items.importItem(other, item);
    assert.equal(fs.readFileSync(path.join(theirs, 'rune.png'), 'utf8'), 'my own rune', 'theirs untouched');
    assert.equal(fs.readFileSync(path.join(theirs, 'rune 2.png'), 'utf8'), 'the author\'s rune');
    const saved = JSON.parse(fs.readFileSync(path.join(Items.designsDir(other, 'animation'), added.group, added.name + '.json'), 'utf8'));
    assert.equal(saved.recipe.layers[0].keyframes[0].params.texture, 'rune 2.png', 'the recipe follows the new name');
    assert.equal(saved.recipe.previewSingle.params.texture, 'rune 2.png');
    assert.deepEqual(saved.recipe.textures, ['missing.png', 'rune 2.png']);

    // The same texture added again is the same file: no third copy.
    Items.importItem(other, item);
    assert.deepEqual(fs.readdirSync(theirs).sort(), ['rune 2.png', 'rune.png']);
});

test('a subscribed animation cannot bring a file from outside its textures folder or of another kind', t => {
    const folder = tempDir(t);
    fs.mkdirSync(path.join(folder, 'textures'));
    fs.writeFileSync(path.join(folder, 'textures', 'ok.png'), 'ok');
    fs.writeFileSync(path.join(folder, 'textures', 'run.js'), 'code');
    fs.writeFileSync(path.join(folder, 'secret.png'), 'outside');
    fs.writeFileSync(path.join(folder, 'item.json'), JSON.stringify({
        format: Items.FORMAT, version: 1, kind: 'animation', name: 'Odd',
        record: { builder: 'animation', version: 1, recipe: { layers: [] } },
        textures: ['ok.png', '../secret.png', 'run.js', '.hidden.png', 'a/b.png', 'C:x.png', 'ok.png']
    }));
    const item = Items.readItem(folder);
    assert.ok(!(item instanceof Error));
    assert.deepEqual(item.textures.map(x => x.name), ['ok.png']);
    for (const bad of ['../x.png', 'a\\b.png', '.png', 'x.exe', 'x.js', ' x.png', 'x\u0000.png']) assert.equal(Items.textureName(bad), '', bad);
    assert.equal(Items.textureName('Rune Stone (blue).webm'), 'Rune Stone (blue).webm');
});

test('an effect carries its custom textures from effects/Texture the same way', t => {
    const author = tempDir(t), stageRoot = tempDir(t), other = tempDir(t);
    fs.mkdirSync(path.join(author, 'effects', 'Texture'), { recursive: true });
    fs.writeFileSync(path.join(author, 'effects', 'Texture', 'glow.png'), 'author glow');
    fs.writeFileSync(path.join(author, 'effects', 'Texture', 'moon.jpg'), 'author moon');
    const recipe = {
        layers: [{ effect: 'geometric', keyframes: [{ frame: 0, values: { customTex: 'glow.png', size: 3 } }] },
                 { effect: 'interface', keyframes: [{ frame: 0, values: { p1tex: 'moon.jpg', p2tex: '', label: 'glow.png' } }] }],
        textureFiles: ['glow.png', 'moon.jpg']
    };
    writeDesign(author, 'effekseer', 'Glow', recipe);
    const staged = Items.stage(stageRoot, author, Items.listDesigns(author)[0]);
    const item = Items.readItem(staged.contentPath);
    assert.deepEqual(item.textures.map(x => x.name).sort(), ['glow.png', 'moon.jpg']);
    fs.mkdirSync(path.join(other, 'effects', 'Texture'), { recursive: true });
    fs.writeFileSync(path.join(other, 'effects', 'Texture', 'glow.png'), 'their glow');
    const added = Items.importItem(other, item);
    const saved = JSON.parse(fs.readFileSync(path.join(Items.designsDir(other, 'effekseer'), added.group, added.name + '.json'), 'utf8'));
    assert.equal(saved.recipe.layers[0].keyframes[0].values.customTex, 'glow-2.png', 'no space: the effect generator takes letters, digits, _ . - only');
    assert.equal(saved.recipe.layers[1].keyframes[0].values.p1tex, 'moon.jpg');
    assert.equal(saved.recipe.layers[1].keyframes[0].values.label, 'glow.png', 'only texture params follow a rename');
    assert.deepEqual(saved.recipe.textureFiles, ['glow-2.png', 'moon.jpg']);
    assert.equal(fs.readFileSync(path.join(other, 'effects', 'Texture', 'glow.png'), 'utf8'), 'their glow');
    assert.equal(Items.textureName('clip.webm', 'effekseer'), '', 'an effect takes pictures only');
    assert.equal(Items.textureName('my glow.png', 'effekseer'), '', 'nor a name its generator would refuse');
});
