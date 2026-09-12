/**
 * The 3D database's preview: how a model effect is drawn over it, how
 * thumbnails are made, and how Optimize reaches its dialog.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const editorRoot = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(editorRoot, 'src', file), 'utf8');

test('an Effekseer effect previews from the preview camera on a depth quad, at the view\'s resolution', () => {
    const db = read('database/Database3DEditor.js');
    // The flat overlay was a 1024-pixel square stretched to the zoom: blurred, and past its largest size it could no longer follow the anchor.
    assert.match(db, /if \(record\.effectName && this\._scene && Reactor3D\.EffekseerScene && Reactor3D\.EffekseerScene\.quadFor\) \{\n\s*this\._ensureEffectQuad\(layer\);\n\s*layer\.setWorld\(\{/, 'world mode for an Effekseer record');
    assert.match(db, /\} else \{\n\s*if \(this\._fxQuad\) this\._fxQuad\.mesh\.visible = false;\n\s*layer\.setWorld\(null\);/, 'a sprite-sheet animation keeps the overlay');
    assert.match(db, /if \(layer\.world\) \{\n\s*this\._placeEffectQuad\(layer, def, world\);\n\s*return;\n\s*\}/, 'placed every frame in world mode');
    const at = db.indexOf('_placeEffectQuad(layer, def, world) {');
    const body = db.slice(at, db.indexOf('\n    }', at));
    assert.match(body, /getDrawingBufferSize\(/, 'the canvas is the view\'s own size');
    assert.match(body, /rect, viewWidth: size\.x, viewHeight: size\.y/);
    assert.match(body, /Reactor3D\.EffekseerScene\.standQuad\(mesh, world, camera\);/);
    assert.match(body, /quad\.texture\.needsUpdate = true;/);
    assert.match(db, /quad\.texture\.flipY = false;\n\s*quad\.material\.uniforms\.flip\.value = 1;/, 'a WebGL canvas arrives top-down');
    assert.match(db, /this\._disposeEffectQuad\(\);\n\s*if \(this\._fxPreview\) \{ this\._fxPreview\.dispose\(\); this\._fxPreview = null; \}/, 'the quad goes with the preview');
});

test('a playing effect does not count as input, so thumbnails can still render under it', () => {
    const db = read('database/Database3DEditor.js');
    const at = db.indexOf('_updateEffectPreview() {');
    const body = db.slice(at, db.indexOf('\n    }', at));
    assert.doesNotMatch(body, /_lastInputAt = performance\.now\(\)/, 'an always-on effect used to hold the idle gate for ever');
});

test('a thumbnail waits for the textures, and an empty picture is neither shown nor cached', () => {
    const db = read('database/Database3DEditor.js');
    assert.match(db, /await Database3DEditor\.whenTexturesDecoded\(template\.userData\.glbTextures, 6000\);/, 'decoded before it is drawn');
    assert.match(db, /if \(!Database3DEditor\.canvasHasPixels\(this\._thumbRenderer\.domElement\)\) return null;/, 'nothing drawn is not a thumbnail');
    assert.match(db, /if \(bytes\.length <= Database3DEditor\.EMPTY_THUMBNAIL_BYTES\) return null;/, 'a cached empty one is drawn again');
    assert.match(db, /static EMPTY_THUMBNAIL_BYTES = 320;/);
    assert.match(db, /\|v\$\{Database3DEditor\.THUMBNAIL_CACHE_VERSION\}`\)/, 'the cache key carries a version, so a run of bad icons can be retired at once');
    assert.match(db, /static THUMBNAIL_CACHE_VERSION = 4;/);
});

test('the effect layer makes its own Effekseer context current before updating and drawing', () => {
    // Effekseer switches contexts in draw() and loadEffect() only; the layer
    // uses beginDraw(), so with two layers alive the older drew into the
    // newer's context and every object was refused.
    const layer = read('utils/AnimationPreviewLayer.js');
    assert.match(layer, /const current = \(\) => \{\n\s*if \(fx\.ctx && typeof fx\.ctx\._makeContextCurrent === 'function'\) fx\.ctx\._makeContextCurrent\(\);\n\s*\};/);
    assert.match(layer, /if \(generation !== this\.generation \|\| !fx\.ctx\) return false;\n\s*current\(\);/, 'before the draw');
    assert.match(layer, /if \(acc >= step\) current\(\);\n\s*while \(acc >= step && n < 5\) \{\n\s*fx\.ctx\.update\(\);/, 'before the updates');
});

test('a looping effect starts over at its last lit frame, found at a resolution a thin beam survives', () => {
    const layer = read('utils/AnimationPreviewLayer.js');
    assert.match(layer, /const LIT = 96;/);
    assert.match(layer, /for \(let i = 3; i < data\.length; i \+= 4\) if \(data\[i\] >= 2\) return true;/);
    assert.match(layer, /\} else if \(\+\+dead >= 3\) \{/, 'no grace period of a third of a second');
    assert.match(layer, /if \(this\.loop && this\.visibleFrames > 0 && ticks >= this\.visibleFrames && alive >= 3\) start\(\);/);
});

test('Optimize sits with the cost panel, acts on the selected model, and reaches the dialog from either host', () => {
    const db = read('database/Database3DEditor.js');
    assert.match(db, /What this model costs'\)\}<\/span>\n\s*<button type="button" class="rr-btn-secondary r3d-optimize"/, 'beside the numbers it acts on');
    assert.doesNotMatch(db, /\$\{this\._t\('Models'\)\}<\/span>\n\s*<button/, 'not in the list header, where it read as bulk');
    assert.match(db, /const ui = \(this\.projectController && this\.projectController\.uiManager\)\n\s*\|\| \(typeof window !== 'undefined' && window\.reactor && window\.reactor\.uiManager\);/);
    assert.match(db, /const entry = this\.listModels\(\)\.find\(m => m\.name === this\.selectedName\);\n\s*if \(!entry\) return say\(this\._t\('Select a model first\.'\)\);/, 'one model, the selected one');
    assert.match(db, /stats\.prepend\(line\);/, 'the result is said where the button is');
    const ui = read('DatabaseEditorUI.js');
    assert.match(ui, /uiManager: window\.reactor && window\.reactor\.uiManager,/, 'the shim carries the dialog host');
    assert.match(ui, /refreshMap3DView: \(\) => window\.reactor && window\.reactor\.projectController/, 'and forwards a sidecar save to the map view');
});
