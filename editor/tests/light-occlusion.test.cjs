const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));

test('a rave flashlight points where its character faces, not mirrored', () => {
    // The plugin measures clockwise from south; the scene aims east-positive.
    // West (direction 4, plugin +90) must come out as -90 so sin/cos lands west.
    assert.equal(Reactor3D.raveYaw({ _lightType: 'light' }, { direction: () => 4 }), -90, 'facing west aims west');
    assert.equal(Reactor3D.raveYaw({ _lightType: 'light' }, { direction: () => 6 }), 90, 'facing east aims east');
    assert.equal(Reactor3D.raveYaw({ _lightType: 'light' }, { direction: () => 2 }), -0, 'south stays south');
    const smooth = Reactor3D.raveYaw({ _lightType: 'flashlight', _smoothFlashlightAngle: Math.PI / 2 }, {});
    assert.equal(smooth, -90, 'the smooth tracking angle is negated the same way');
});

test('a wall hides the light behind it, height respected', () => {
    // A 7x7 room, roomHeight 25, with a wall column at x=3.
    const width = 7, height = 7;
    const grid = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) grid[y * width + 3] = 1;
    Reactor3D._lightSolid = { key: 'test', width, height, grid, room: true, roomHeight: 25 };
    Reactor3D._surface = null;
    try {
        assert.equal(Reactor3D.lightSegmentBlocked(0, 3, 1.4, 6, 3, 0.5), true, 'across the wall: blocked');
        assert.equal(Reactor3D.lightSegmentBlocked(0, 3, 1.4, 2, 3, 0.5), false, 'same side: clear');
        assert.equal(Reactor3D.lightSegmentBlocked(0, 3, 30, 6, 3, 30), false, 'a camera above the wall sees over it');
        assert.equal(Reactor3D.lightSegmentBlocked(2.6, 3, 1.4, 3.4, 3, 0.5), false, 'the wall a lamp hangs on never hides that lamp');
        // A beam aimed east from x=0 stops at the wall; aimed west it runs out its length.
        assert.ok(Reactor3D.clampConeReach(0, 3, 0.5, 1, 0, 6) < 3.5, 'the beam stops at the wall');
        assert.equal(Reactor3D.clampConeReach(2, 3, 0.5, -1, 0, 2), 2, 'nothing in the way, full length');
    } finally {
        Reactor3D._lightSolid = null;
        Reactor3D._surface = null;
    }
});

test('the quads still skip and shorten through the occlusion switch', () => {
    const source = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d.js'), 'utf8');
    assert.match(source, /Reactor3D\.LIGHT_OCCLUSION = true;/, 'and it can be turned off in one place');
    assert.match(source, /const beamReach = Reactor3D\.LIGHT_OCCLUSION\n/, 'cones clamp through the switch');
    assert.match(source, /pool\.count--;\n\s*continue;/, 'a hidden light writes no quad at all');
    assert.match(source, /const tipU = alongU \* beamReach, tipV = alongV \* beamReach;/, 'the tip is the clamped reach');
});
