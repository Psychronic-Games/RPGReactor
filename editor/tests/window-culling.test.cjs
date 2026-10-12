const assert = require('node:assert/strict');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const spritesSource = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
const coreSource = runtimeSource('reactor_core.js');

/** The shipped dormancy predicate, lifted so the real rule is what runs. */
function dormancyPredicate() {
    const at = spritesSource.indexOf('Spriteset_Map.prototype._rrWindowDormant = function');
    assert.ok(at >= 0, 'the predicate exists');
    const end = spritesSource.indexOf('\n};', at);
    const body = spritesSource.slice(spritesSource.indexOf('{', at) + 1, end);
    // eslint-disable-next-line no-new-func
    return new Function('child', 'minX', 'maxX', 'minY', 'minYmaxY', body.replace(/maxY/g, 'minYmaxY'));
}

const MARGIN = 384;
const SCREEN = { width: 816, height: 624 };
const BOUNDS = [-MARGIN, SCREEN.width + MARGIN, -MARGIN, SCREEN.height + MARGIN];

function windowAt(overrides) {
    return Object.assign({
        visible: true, x: 0, y: 0, width: 240, height: 120,
        opacity: 255, contentsOpacity: 255, pause: false,
        _clientArea: { children: [] }, _contentsSprite: {}, _contentsBackSprite: {}
    }, overrides);
}

const dormant = (child) => dormancyPredicate()(child, ...BOUNDS);

test('a window is parked once it is fully outside the margin', () => {
    assert.equal(dormant(windowAt({ x: -700, width: 240 })), true, 'far to the left');
    assert.equal(dormant(windowAt({ x: 1300 })), true, 'far to the right');
    assert.equal(dormant(windowAt({ y: -600, height: 120 })), true, 'far above');
    assert.equal(dormant(windowAt({ y: 1200 })), true, 'far below');
    assert.equal(dormant(windowAt({ visible: false })), true, 'hidden');
});

test('a wide window that still overlaps the viewport is not parked', () => {
    // Window.move stores x/y as the TOP-LEFT corner. A point test on the corner
    // parked windows whose body was still on screen, and parked windows are
    // detached from the display tree — so they vanished outright.
    assert.equal(coreSource.includes('Window.prototype.move = function(x, y, width, height) {\n    this.x = x || 0;'),
        true, 'x is the left edge, not a centre');

    assert.equal(dormant(windowAt({ x: -400, width: 816 })), false, 'a full-width banner at x=-400');
    assert.equal(dormant(windowAt({ x: -500, width: 900 })), false, 'wider than the screen');
    assert.equal(dormant(windowAt({ y: -400, height: 624 })), false, 'a tall edge-anchored panel');
    assert.equal(dormant(windowAt({ x: -383, width: 100 })), false, 'just inside the margin');
});

test('the extent test matches the character-sprite branch it was modelled on', () => {
    const at = spritesSource.indexOf('for (const sprite of this._characterSprites)');
    const block = spritesSource.slice(at, at + 900);
    assert.match(block, /Cull on the drawn extent, not the anchor point/,
        'the character branch documents the same correction');
    const predicateAt = spritesSource.indexOf('_rrWindowDormant = function');
    const predicate = spritesSource.slice(predicateAt, predicateAt + 1400);
    assert.match(predicate, /child\.x \+ width < minX/);
    assert.match(predicate, /child\.y \+ height < minY/);
    assert.doesNotMatch(predicate, /if \(child\.x < minX \|\| child\.x > maxX \|\| child\.y < minY \|\| child\.y > maxY\)/,
        'the bare point test is gone');
});

test('a transparent window that still draws through inner sprites stays alive', () => {
    // contentsOpacity only reaches _contentsSprite.alpha. addInnerChild appends
    // to _clientArea, so gauges, names and state icons are independent siblings.
    const invisible = windowAt({ opacity: 0, contentsOpacity: 0 });
    invisible._clientArea.children = [invisible._contentsSprite, invisible._contentsBackSprite];
    assert.equal(dormant(invisible), true, 'nothing but the standard sprites: park it');

    const withGauge = windowAt({ opacity: 0, contentsOpacity: 0 });
    withGauge._clientArea.children = [
        withGauge._contentsSprite, withGauge._contentsBackSprite, { alpha: 1 }
    ];
    assert.equal(dormant(withGauge), false, 'an inner sprite is still drawing');
});

test('a paused window is never parked on opacity', () => {
    assert.equal(dormant(windowAt({ opacity: 0, contentsOpacity: 0, pause: true })), false);
});

test('a window parked this tick is not stepped twice', () => {
    // Spriteset_Base.update cascades update() to every child before culling
    // runs, so a window parked in the first loop has already ticked. The
    // catch-up loop must skip it on the transition frame.
    const at = spritesSource.indexOf('updateOffscreenCulling');
    const block = spritesSource.slice(at, spritesSource.indexOf('\n};', spritesSource.indexOf('_rrCullHolder.children.length - 1')));
    assert.match(block, /child\._rrParkedThisTick = true;/, 'the transition is recorded');
    assert.match(block, /if \(child\._rrParkedThisTick\) \{\s*\n\s*child\._rrParkedThisTick = false;\s*\n\s*continue;/,
        'and consumed exactly once');
});

test('the runtime fix reached the bundled templates', () => {
    const canonical = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'));
    const demo = path.join(repoRoot, 'template', 'Demo', 'js', 'reactor_sprites.js');
    assert.ok(fs.existsSync(demo), 'the Demo ships this file');
    assert.ok(canonical.equals(fs.readFileSync(demo)), 'and it matches runtime/');
});
