const test = require('node:test');
const assert = require('node:assert/strict');
require('../../runtime/libs/three.js');
const THREE = global.THREE;
const R = require('../../runtime/reactor_3d.js');
const Effects = require('../src/utils/ModelPropEffects2D.js');

function fixture(t, gpu = true) {
    const keys = ['THREE', 'Reactor3D', 'MapEditor3D'];
    const old = keys.map(k => global[k]);
    Object.assign(global, { THREE, Reactor3D: R, MapEditor3D: { EFFECT_PIXELS: 1920 * 1080 } });
    t.after(() => keys.forEach((k, i) => { if (old[i] === undefined) delete global[k]; else global[k] = old[i]; }));
    const calls = [], renderer = {};
    const layer = { active: false, fx: { gpu: gpu ? {} : null }, fxCanvas: { width: 512, height: 512 },
        setWorld(world) { this.world = world; calls.push('world'); },
        play() { assert.ok(this.world.renderer); this.active = true; calls.push('play'); },
        stop() { this.active = false; calls.push('stop'); },
        drawGpuQuad() { calls.push('gpu'); return this.active; },
        drawNow() { calls.push('canvas'); return this.active; } };
    const object = new THREE.Group(); object.userData.glbSize = { x: 1, y: 4, z: 1 };
    const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, .01, 100);
    camera.position.set(0, 8, 8); camera.lookAt(0, 0, 0);
    const quad = R.EffekseerScene.quadFor(layer.fxCanvas);
    t.after(() => { quad.mesh.geometry.dispose(); quad.material.dispose(); quad.texture.dispose(); });
    const entry = { object, camera, size: 2000 };
    const play = { quad, layer, clip: { style: {} }, record: { effectName: 'Core', scale: 100 },
        effect: { anchor: { offset: [0, 2, 0] }, rotate: [0, 0, 0], scale: [1, 1, 1] }, project: '/fixture' };
    const media = Object.create(Effects.prototype);
    Object.assign(media, { entry, preview: { ensureViewport: () => ({ renderer: () => renderer }) }, plays: [play] });
    return { media, play, entry, calls };
}

test('flat Effekseer enters world mode before playback and follows the final target size', t => {
    const { media, play, entry, calls } = fixture(t);
    assert.equal(media.update(true), true);
    assert.deepEqual(calls, ['world', 'play']);
    assert.equal(play.clip.style.display, 'none');
    assert.deepEqual(play.layer.world.position, [0, 2, 0]);
    assert.ok(play.layer.world.rect.scale < 1, 'uses the existing effect pixel budget');
    entry.size = 700; media.paint();
    assert.equal(play.layer.world.viewWidth, 700);
    assert.equal(play.quad.material.uniforms.resolution.value.x, 700);
    assert.equal(play.quad.mesh.visible, true);
    assert.equal(play.quad.material.depthTest, true);
    assert.equal(play.quad.material.depthWrite, false);
    assert.equal(calls.at(-1), 'gpu');
    media.update(false);
    assert.equal(play.quad.mesh.visible, false); assert.equal(play.layer.active, false);
    media.update(true);
    assert.equal(calls.filter(c => c === 'play').length, 2, 'returning onscreen restarts playback');
    media.suspend();
    assert.equal(play.visible, false); assert.equal(entry.dirty, true);
});

test('the fallback canvas is sampled on the depth-tested quad rather than a map overlay', t => {
    const { media, play, calls } = fixture(t, false);
    media.update(true); media.paint();
    assert.equal(calls.at(-1), 'canvas');
    assert.equal(play.clip.style.display, 'none');
    assert.equal(play.quad.mesh.visible, true);
    assert.equal(play.quad.material.depthTest, true);
    assert.ok(play.quad.texture.version > 0);
    play.layer.active = false; media.paint();
    assert.equal(play.quad.mesh.visible, false, 'finished playback clears the last visible frame');
});

function videoWorld(t) {
    const fs = require('node:fs');
    const path = require('node:path');
    const vm = require('node:vm');
    const videos = [];
    const document = {
        addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], getElementById: () => null,
        createElement() {
            const video = { paused: true, ended: false, readyState: 0, currentTime: 0, plays: 0, pauses: 0, loads: 0,
                play() { this.plays++; this.paused = false; return Promise.resolve(); },
                pause() { this.pauses++; this.paused = true; },
                removeAttribute(name) { if (name === 'src') this.src = ''; },
                load() { this.loads++; } };
            videos.push(video);
            return video;
        }
    };
    const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'MapEditor3D.js'), 'utf8');
    const MapEditor3D = vm.runInNewContext(`${source}\nMapEditor3D;`, {
        console, window: {}, performance: { now: () => 0 }, document, Image: class {}, THREE, Reactor3D: R,
        require, setTimeout, clearTimeout
    });
    const keys = ['THREE', 'Reactor3D', 'MapEditor3D', 'window'];
    const old = keys.map(k => global[k]);
    Object.assign(global, { THREE, Reactor3D: R, MapEditor3D, window: {} });
    t.after(() => {
        keys.forEach((k, i) => { if (old[i] === undefined) delete global[k]; else global[k] = old[i]; });
        Effects.SHARE_VIDEO = true;
    });
    const preview = { manager: { project: () => ({ path: path.join(__dirname, 'fixture') }) } };
    const effect = { type: 'video', name: 'Screen', video: { file: 'screen.mp4', loop: true }, scale: [1, 1, 1], rotate: [0, 0, 0] };
    const prop = () => {
        const object = new THREE.Group(); object.userData.glbSize = { x: 1, y: 2, z: 1 };
        return new Effects(preview, { object, bounds: [] }, [effect]);
    };
    return { MapEditor3D, preview, videos, prop };
}

test('props showing one video file share it in the 2D preview; a hidden plane does not pause a shown one', t => {
    const { preview, videos, prop } = videoWorld(t);
    assert.equal(Effects.SHARE_VIDEO, true);
    const a = prop(), b = prop();
    assert.equal(videos.length, 1, 'one decoder for both screens');
    const video = videos[0];
    assert.equal(a.plays[0].plane.userData.texture, b.plays[0].plane.userData.texture);
    assert.equal(preview._effectMedia.size, 1, 'the preview holds the shared media');
    a.update(true); b.update(false);
    assert.equal(video.paused, false, 'b hidden leaves a\'s video playing');
    assert.equal(video.pauses, 0);
    b.update(true); a.update(false);
    assert.equal(video.paused, false, 'still shown on b');
    a.update(false); b.update(false);
    assert.equal(video.paused, true, 'the last hidden plane pauses it');
    const pauses = video.pauses;
    b.update(false);
    assert.equal(video.pauses, pauses, 'no repeated pauses while hidden');
    a.update(true);
    assert.equal(video.paused, false, 'showing again plays');
    b.update(true);
    a.suspend();
    assert.equal(video.paused, false, 'a suspended prop leaves the other one playing');
    b.suspend();
    assert.equal(video.paused, true, 'suspending every prop pauses it');
    a.update(true); b.update(true);
    let disposed = 0;
    a.plays[0].plane.userData.texture.addEventListener('dispose', () => disposed++);
    a.dispose();
    assert.equal(video.paused, false, 'b still shows it');
    assert.equal(video.loads, 0, 'not unloaded while b holds it');
    assert.equal(disposed, 0);
    b.dispose();
    assert.equal(video.paused, true);
    assert.equal(video.src, '', 'the last prop lets the decoder go');
    assert.equal(disposed, 1);
    assert.equal(preview._effectMedia.size, 0);
});

test('SHARE_VIDEO false gives each prop its own video, paused on its own', t => {
    const { preview, videos, prop } = videoWorld(t);
    Effects.SHARE_VIDEO = false;
    const a = prop(), b = prop();
    assert.equal(videos.length, 2);
    assert.equal(preview._effectMedia, undefined);
    a.update(true); b.update(false);
    assert.equal(videos[0].paused, false);
    assert.equal(videos[1].paused, true, 'a hidden prop pauses its own copy');
    a.dispose();
    assert.equal(videos[0].src, '', 'disposing frees that copy');
    assert.equal(videos[1].loads, 0);
    b.dispose();
    assert.equal(videos[1].src, '');
});
