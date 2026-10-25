'use strict';
// An Effekseer animation is the size it is in RPG Maker (runtime/reactor_sprites.js, effekseerProjection): RPG
// Maker draws it in a 4096 px square viewport with x = 1, p = -4096 / screen height and the camera 10 units back,
// so one effect unit at its middle is 2048 * h / (h + 40960) pixels on a screen h pixels tall. Reactor draws it in
// a smaller viewport (twice the screen's height) through a projection that gives the same pixels at every depth.
// A battle animation in a Battle Room (runtime/reactor_battle_room.js, cueUnit) is sized to those pixels where it
// starts.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const runtime = path.join(__dirname, '..', '..', 'runtime');
const sprites = fs.readFileSync(path.join(runtime, 'reactor_sprites.js'), 'utf8');
function slice(source, from, to) {
    const start = source.indexOf(from);
    assert.ok(start >= 0, from);
    return source.slice(start, source.indexOf(to, start));
}

const B = require(path.join(runtime, 'reactor_battle_data.js'));

/** Pixels from the viewport's middle of a point (x, y, z) of an effect: camera 10 back, row-vector matrices as Effekseer takes them. */
function pixels(m, width, height, x, y, z) {
    const w = (z - 10) * m[11] + m[15];
    return [x * m[0] / w * width / 2, y * m[5] / w * height / 2];
}
/** The same point in RPG Maker: its 4096 px viewport, x = 1, y = -1 (its frame is drawn upside down), p = -4096 / h. */
function mzPixels(height, x, y, z) {
    const w = (z - 10) * -(4096 / height) + 1;
    return [x / w * 2048, y / w * 2048];
}

test('an effect unit is RPG Maker\'s size on every screen height, at every depth, whatever the viewport', () => {
    for (const height of [624, 720, 1080, 1440]) {
        const side = height * 2, m = B.effekseerProjection(side, side, height, 1, false);
        for (const [x, y, z] of [[1, 0, 0], [0, 3, 0], [2, -1, 4], [-3, 2, -5]]) {
            const ours = pixels(m, side, side, x, y, z), theirs = mzPixels(height, x, y, z);
            assert.ok(Math.abs(ours[0] - theirs[0]) < 1e-6 && Math.abs(ours[1] - theirs[1]) < 1e-6, `${height}: (${x}, ${y}, ${z}) ${ours} against ${theirs}`);
        }
        assert.ok(Math.abs(pixels(m, side, side, 1, 0, 0)[0] - 2048 * height / (height + 40960)) < 1e-6);
    }
    assert.ok(pixels(B.effekseerProjection(2160, 2160, 1080, 1, true), 2160, 2160, 1, 0, 0)[0] < 0, 'mirrored: the other way');
    // The game draws through it, in a viewport twice the screen's height.
    assert.match(sprites, /ReactorBattleData\.effekseerProjection\(side, side, height, 1, mirror\)/);
    assert.ok(slice(sprites, 'Sprite_Animation.effekseerViewportSide = ', 'Sprite_Animation.effekseerProjection').includes('canvas.height * 2'));
    // The editor's copy of the module is the runtime's.
    assert.equal(fs.readFileSync(path.join(__dirname, '..', 'src', 'battle', 'BattleData.js'), 'utf8'), fs.readFileSync(path.join(runtime, 'reactor_battle_data.js'), 'utf8'));
});

test('a preview canvas of any shape shows an effect as the game screen it stands for: round, at the screen\'s size', () => {
    // A 960 x 540 preview of a 1080-tall game: half the game's pixels, the same on both axes, at every depth.
    const m = B.effekseerProjection(960, 540, 1080, 540 / 1080);
    for (const [x, y, z] of [[1, 1, 0], [2, -1, 3]]) {
        const ours = pixels(m, 960, 540, x, y, z), game = mzPixels(1080, x, y, z);
        assert.ok(Math.abs(ours[0] - game[0] / 2) < 1e-6 && Math.abs(ours[1] - game[1] / 2) < 1e-6, `${ours} against half of ${game}`);
    }
    // Every preview draws through it.
    const src = file => fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
    for (const file of ['database/DatabaseAnimationEditor.js', 'database/AnimationPickerModal.js', 'event/AnimationPicker.js']) {
        assert.match(src(file), /ReactorBattleData\.effekseerProjection\(|effekseerPreviewProjection\(/, file);
        assert.doesNotMatch(src(file), /const p = -1\.2|viewportSize \/ (?:preview)?[cC]anvas\.height/, file + ' keeps no older projection');
    }
});

test('a Battle Room sizes a battle animation to the battle screen\'s pixels where it starts', () => {
    global.self = global; global.window = global;
    require(path.join(runtime, 'libs', 'three.js'));
    const THREE = global.THREE;
    const source = fs.readFileSync(path.join(runtime, 'reactor_battle_room.js'), 'utf8');
    const start = source.indexOf('        cueUnit(world) {');
    const body = source.slice(start, source.indexOf('\n        }\n', start) + 10);
    const Room = new Function('root', `return class { ${body} }`)({ THREE });
    for (const [distance, fov, height] of [[20, 40, 1080], [8, 60, 720], [35, 30, 1080]]) {
        const camera = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 500);
        camera.position.set(0, 5, distance); camera.lookAt(0, 1, 0); camera.updateMatrixWorld(true);
        const room = Object.assign(new Room(), { camera, width: Math.round(height * 16 / 9), height });
        const at = new THREE.Vector3(0, 1, 0), unit = room.cueUnit(at);
        // One effect unit, `unit` tiles up from the anchor, as the camera draws it.
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion).multiplyScalar(unit);
        const a = at.clone().project(camera), b = at.clone().add(up).project(camera);
        const drawn = Math.hypot((b.x - a.x) * room.width / 2, (b.y - a.y) * height / 2);
        assert.ok(Math.abs(drawn - 2048 * height / (height + 40960)) < 0.01, `${distance} tiles off: ${drawn}`);
    }
    delete global.THREE;
});
