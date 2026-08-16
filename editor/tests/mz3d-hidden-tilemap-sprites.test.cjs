const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const compat = fs.readFileSync(path.join(repoRoot, 'runtime', 'libs', 'pixi_compat.js'), 'utf8');
const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
const core = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');

test('MZ3D character/model fixes live in pixi_compat, not corescript', () => {
    assert.match(compat, /window\.installMz3dCompat = function/);
    assert.match(compat, /hideMz3dMapSprites/);
    assert.match(compat, /hidePixi8DisplayObject/);
    assert.match(compat, /fixImportedHairCards/);
    assert.match(compat, /MATERIAL_ALPHATEST/);
    assert.match(compat, /globalDisplayStatus = 0/);
    assert.match(compat, /installMz3dCompat\(\)/);
    assert.doesNotMatch(compat, /__reactorCropsImported/);
    assert.doesNotMatch(sprites, /_mz3dReplacesMapSprites/);
    assert.doesNotMatch(sprites, /_hideMz3dCharacterSprites/);
    assert.doesNotMatch(core, /_syncSubtreeDisplayStatus/);
});

test('char.glb embeds the full Actor1 walking sheet', () => {
    const glbPath = path.join(repoRoot, 'template', 'MZ3D', 'models', 'char.glb');
    if (!fs.existsSync(glbPath)) return;
    const data = fs.readFileSync(glbPath);
    assert.equal(data.slice(0, 4).toString(), 'glTF');
    const chunkLen = data.readUInt32LE(12);
    const json = JSON.parse(data.slice(20, 20 + chunkLen).toString('utf8'));
    assert.equal(json.images[0].name, 'Actor1');
    assert.equal(json.images[0].mimeType, 'image/png');
});

test('MZ3D still hides the tilemap rather than individual sprites', () => {
    const plugin = path.join(repoRoot, 'template', 'MZ3D', 'js', 'plugins', 'mz3d.js');
    if (!fs.existsSync(plugin)) return;
    const source = fs.readFileSync(plugin, 'utf8');
    assert.match(source, /this\._tilemap\.visible = false/);
});
