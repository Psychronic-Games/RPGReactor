/**
 * A parallax map's picture is its ground.
 *
 * On a parallax map the art is the parallax and the tile layers are
 * scaffolding: a blank tile for passability and a handful of real tiles for the
 * things that stand up. The 3D view read only the tiles, so a room drawn as a
 * 3,504 x 1,392 painting came out as whatever its filler tile happened to be —
 * on Star Shift Freelancers, one opaque black autotile across the whole floor.
 * A map that renders perfectly and shows nothing.
 */
const { source3D } = require('./helpers/runtime-3d-source.cjs');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

const map = (over) => Object.assign({
    parallaxName: '', parallaxLoopX: false, parallaxLoopY: false, note: ''
}, over);

test('a map-pinned parallax is ground; a moving one is scenery', () => {
    // `!` is what MZ calls a zero parallax: `Game_Map.parallaxOx` returns a
    // plain multiple of the tile size for those, so the image sits on the map
    // at one image pixel per map pixel and the placement is exact.
    assert.equal(Reactor3D.parallaxIsGround(map({ parallaxName: '!Room' })), true);
    // Anything that scrolls or loops is a backdrop. Nailing the sky to the map
    // would be a worse bug than leaving it alone.
    assert.equal(Reactor3D.parallaxIsGround(map({ parallaxName: 'Sky' })), false);
    assert.equal(Reactor3D.parallaxIsGround(
        map({ parallaxName: '!Room', parallaxLoopX: true })), false);
    assert.equal(Reactor3D.parallaxIsGround(map({ parallaxName: '' })), false);
});

test('MultiParallax declares its layers in the map note, so they can be read', () => {
    const note = [
        '<3d>',
        '<MultiParallax>',
        'image: !Floor-Decals',
        'z: 2',
        'opacity: 128',
        '</MultiParallax>',
        '<MultiParallax>',
        'image: Starfield',
        'z: -1',
        '</MultiParallax>',
        '<MultiParallax>',
        'image: !Drifting-Fog',
        'scrollX: 2',
        '</MultiParallax>'
    ].join('\n');

    const layers = Reactor3D.noteParallaxLayers(map({ note }));
    assert.equal(layers.length, 3, 'every block is read');
    assert.deepEqual(layers.map(l => l.name),
        ['!Floor-Decals', 'Starfield', '!Drifting-Fog']);
    assert.equal(layers[0].z, 2);
    assert.equal(layers[0].opacity, 128);

    const ground = Reactor3D.parallaxGroundLayers(map({ parallaxName: '!Room', note }));
    assert.deepEqual(ground.map(l => l.name), ['!Room', '!Floor-Decals'],
        'the map’s own and the pinned layer, and neither the starfield nor the fog');
    // Stacked the way the plugin stacks them, so a decal declared over a floor
    // is drawn over that floor here too.
    assert.ok(ground[0].z < ground[1].z, 'in the author’s order');
});

test('a map with no parallax lays down no ground', () => {
    assert.deepEqual(Reactor3D.parallaxGroundLayers(map()), []);
    assert.deepEqual(Reactor3D.noteParallaxLayers(map({ note: '<3d>' })), []);
});

test('a block with no image is not a layer', () => {
    const note = '<MultiParallax>\nz: 3\nopacity: 200\n</MultiParallax>';
    assert.deepEqual(Reactor3D.noteParallaxLayers(map({ note })), []);
});

test('the editor supplies its own loader, having no ImageManager', () => {
    // The runtime reaches for ImageManager; the editor draws this same scene
    // with no game running, so the pictures come off disk instead. Without it
    // a parallax-mapped map previewed as its bare tile layers, which on a
    // parallax map is very close to nothing at all.
    assert.equal(typeof Reactor3D.defaultParallaxLoader, 'function');
    assert.equal(Reactor3D.defaultParallaxLoader('anything'), null,
        'and outside a game it declines rather than throwing');

    const editor = fs.readFileSync(
        path.join(repoRoot, 'editor', 'src', 'MapEditor3D.js'), 'utf8');
    assert.match(editor, /loadParallax: name => parallaxes\[name\] \|\| null/,
        'the editor hands the scene a loader');
    assert.match(editor, /async loadParallaxes\(mapData\)/);
    assert.match(editor, /this\.parallaxImages = \{\};/,
        'and drops the cache when the project changes');
});

test('layers a plugin command creates are knowingly out of reach', () => {
    // They do not exist until an event runs, so there is nothing to read when
    // the map is built. Recorded here so the absence reads as a decision
    // rather than as an oversight.
    const runtime = source3D();
    assert.match(runtime, /plugin \*command\* are deliberately absent/);
});

test('a parallax the ground was built from is not also pasted flat over it', () => {
    /*
     * A parallax plugin adds a TilingSprite per layer to the tilemap, and the
     * 3D ground pass sits inside the tilemap too — sorted above them, so a
     * backdrop stays a backdrop. Right for a starfield, wrong for the layer the
     * ground was *built from*: the same picture is then on screen twice, once
     * laid on the world and once pasted flat over it.
     */
    const sprites = fs.readFileSync(
        path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    const suppress = sprites.slice(
        sprites.indexOf('Spriteset_Map.prototype.suppressReactor3DGroundParallaxes'));
    const body = suppress.slice(0, suppress.indexOf('\n};'));

    // Only the ones the ground took, which is the same list it was built from.
    assert.match(body, /Reactor3D\.parallaxNameOf\(child\.bitmap\)/);
    assert.match(body, /if \(name && taken\.has\(name\)\) child\.renderable = false;/);
    // A scrolling or looping layer is never in that list, so it is untouched.
    assert.match(sprites,
        /for \(const layer of Reactor3D\.parallaxGroundLayers\(\$dataMap\)\) names\.add\(layer\.name\)/);
    // `renderable`, and every frame, because the plugin owns `visible` and
    // rebuilds its layers on its own schedule.
    assert.match(sprites, /this\.suppressReactor3DGroundParallaxes\(true\);/);
    // And handed back when the scene fails or the map stops being 3D.
    assert.match(sprites, /this\.suppressReactor3DGroundParallaxes\(false\);/);
});

test('a bitmap is traced back to the parallax it came from', () => {
    // A sprite holds a Bitmap, and the URL it was loaded from is the only
    // thread back to the name an author wrote.
    const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
    assert.equal(Reactor3D.parallaxNameOf({ _url: 'img/parallaxes/!Valiant-Bridge.png' }),
        '!Valiant-Bridge');
    // Percent-encoded, which is how a path with a space or an accent arrives.
    assert.equal(Reactor3D.parallaxNameOf({ _url: 'img/parallaxes/%21Aeheri%20Room.png' }),
        '!Aeheri Room');
    assert.equal(Reactor3D.parallaxNameOf({ _url: 'Starfield.png' }), 'Starfield');
    for (const bad of [null, undefined, {}, { _url: '' }, { _url: 42 }]) {
        assert.equal(Reactor3D.parallaxNameOf(bad), null, JSON.stringify(bad));
    }
    // A malformed escape costs the decode, not the name.
    assert.equal(Reactor3D.parallaxNameOf({ _url: 'img/parallaxes/100%.png' }), '100%');
});
