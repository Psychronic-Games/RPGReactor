const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const coreSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_core.js'), 'utf8');

// MultiTweaks' animation-speed option replaces Tilemap.prototype.update with a
// copy of the stock MZ body. On PIXI v5 that was harmless because PIXI itself
// invoked updateTransform during render; the v8 runtime drives repaint from
// the update() tail, so a replaced update silently rendered a black map with
// only sprites visible. The onRender fallback prepares the frame at render
// time instead — exactly once, guarded by a frame stamp so the normal path
// does not regress into Project3's double-preparation seams.
test('tilemap preparation survives a plugin replacing Tilemap.prototype.update', () => {
    const initAt = coreSource.indexOf('Tilemap.prototype.initialize = function() {');
    assert.ok(initAt >= 0);
    const initBody = coreSource.slice(initAt, coreSource.indexOf('\n};', initAt));
    assert.match(initBody, /this\.onRender = /, 'initialize installs the render fallback');
    assert.match(initBody, /_v8PreparedFrame !== Graphics\.frameCount/, 'fallback is frame-guarded');
    assert.match(initBody, /_prepareV8Frame\(\)/, 'fallback runs the shared preparation');

    const updateAt = coreSource.indexOf('Tilemap.prototype.update = function() {');
    assert.ok(updateAt >= 0);
    const updateBody = coreSource.slice(updateAt, coreSource.indexOf('\n};', updateAt));
    assert.match(updateBody, /_prepareV8Frame\(\)/, 'update tail uses the shared preparation');

    const prepareAt = coreSource.indexOf('Tilemap.prototype._prepareV8Frame = function() {');
    assert.ok(prepareAt >= 0);
    const prepareBody = coreSource.slice(prepareAt, coreSource.indexOf('\n};', prepareAt));
    assert.match(prepareBody, /_v8PreparedFrame = Graphics\.frameCount/, 'preparation stamps the frame');
    assert.match(prepareBody, /updateTransform\(\)/);
    assert.match(prepareBody, /_syncV8TileLayers\(\)/);
});
