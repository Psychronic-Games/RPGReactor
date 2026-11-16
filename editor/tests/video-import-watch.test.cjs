/**
 * A video whose decoded frames this GPU cannot take (decoded on one GPU, drawn
 * on another) fails every upload with INVALID_VALUE and its screen stays
 * black: after a few failed first uploads its texture stops taking frames, so
 * it costs no upload and no GL error each frame; a working one is never stopped.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const runtime = require(path.join(__dirname, '..', '..', 'runtime', 'reactor_media_surfaces.js'));

function fixture(errors) {
    const INVALID_VALUE = 0x0501, queue = [];
    const gl = { INVALID_VALUE, getError: () => (queue.length ? queue.shift() : 0) };
    const video = { currentSrc: 'movies/screen.mp4', cancelled: [], cancelVideoFrameCallback(id) { this.cancelled.push(id); } };
    const texture = { isVideoTexture: true, image: video, userData: {}, _requestVideoFrameCallbackId: 7, update() { this.updated = true; } };
    runtime.watchVideoImport(texture, { getContext: () => gl });
    const upload = list => { queue.push(...list); texture.onUpdate(texture); };
    return { texture, video, upload, INVALID_VALUE, errors };
}

test('a video whose uploads keep failing stops taking frames, and later ones on this GPU stop at once', () => {
    const warn = console.warn; const warned = [];
    console.warn = (...a) => warned.push(a.join(' '));
    try {
        runtime.watchVideoImport.reported = false;
        const f = fixture();
        f.upload([f.INVALID_VALUE]); f.upload([0x0502, f.INVALID_VALUE]);
        assert.equal(f.texture.userData.rrImportFailed, undefined, 'two failures are not proof (another call\'s error read first counts as none)');
        f.upload([f.INVALID_VALUE]);
        assert.equal(f.texture.userData.rrImportFailed, true);
        assert.deepEqual(f.video.cancelled, [7], 'the frame callback that flags each new frame is cancelled');
        assert.equal(f.texture._requestVideoFrameCallbackId, 0);
        f.texture.update(); assert.equal(f.texture.updated, undefined, 'and the per-frame fallback no longer flags uploads');
        assert.equal(warned.length, 1); assert.match(warned[0], /disable-accelerated-video-decode/);
        const next = fixture();
        next.upload([next.INVALID_VALUE]);
        assert.equal(next.texture.userData.rrImportFailed, true, 'once one video failed here, one failure is enough');
        assert.equal(warned.length, 1, 'said once');
    } finally { console.warn = warn; runtime.watchVideoImport.reported = false; }
});

test('a video that uploads cleanly keeps playing, whatever other errors are about', () => {
    runtime.watchVideoImport.reported = false;
    const f = fixture();
    for (let i = 0; i < 20; i++) f.upload(i % 3 === 0 ? [0x0502] : []);
    assert.equal(f.texture.userData.rrImportFailed, undefined);
    assert.deepEqual(f.video.cancelled, [7], 'only the browser\'s frame callback is gone (frames are pulled)');
    // A failure between successes resets the count.
    const g = fixture();
    g.upload([g.INVALID_VALUE]); g.upload([g.INVALID_VALUE]); g.upload([]); g.upload([g.INVALID_VALUE]); g.upload([g.INVALID_VALUE]);
    assert.equal(g.texture.userData.rrImportFailed, undefined);
    // Not a video, or no renderer: left as it was.
    const plain = { isVideoTexture: false };
    assert.equal(runtime.watchVideoImport(plain, { getContext: () => ({}) }), plain);
    assert.equal(plain.onUpdate, undefined);
});

test('a video\'s frames are pulled as the game draws: no browser callback, thirty uploads a second, none while it stands still', () => {
    let frames = 0;
    const video = { readyState: 4, currentTime: 0, cancelled: [], cancelVideoFrameCallback(id) { this.cancelled.push(id); }, getVideoPlaybackQuality: () => ({ totalVideoFrames: frames }) };
    let uploads = 0;
    const texture = { isVideoTexture: true, image: video, userData: {}, _requestVideoFrameCallbackId: 3, version: 0, source: {}, update() { throw new Error('the callback path'); } };
    runtime.watchVideoImport(texture, null);
    Object.defineProperty(texture, 'needsUpdate', { configurable: true, set(v) { if (v === true) uploads++; } });
    assert.deepEqual(video.cancelled, [3]);
    assert.equal(texture._requestVideoFrameCallbackId, 0);
    // The game draws 180 times a second, the video is 24 frames a second.
    const play = (seconds, fps) => { const before = uploads; for (let i = 0; i < seconds * 180; i++) { video.currentTime += 1 / 180; frames = Math.floor(video.currentTime * fps); texture.update(); } return (uploads - before) / seconds; };
    play(3, 24);
    const rate = play(4, 24);
    assert.ok(rate >= 28 && rate <= 31, 'thirty a second for a video of 30 or fewer, got ' + rate);
    play(3, 60);
    const fast = play(4, 60);
    assert.ok(fast >= 50 && fast <= 61, 'a video of 60 a second gets its own rate once counted, got ' + fast);
    // Held still: nothing is sent.
    const held = uploads; for (let i = 0; i < 500; i++) texture.update();
    assert.equal(uploads, held);
    // Back to the start of its loop: a picture at once.
    video.currentTime = 0.01; texture.update();
    assert.equal(uploads, held + 1);
    // Not ready yet: nothing.
    video.readyState = 1; video.currentTime = 5; texture.update();
    assert.equal(uploads, held + 1);
    // The switch off, or a browser without the callback: three's own way is left alone.
    runtime.pullVideoFrames.PULL = false;
    try { const kept = { isVideoTexture: true, image: video, userData: {}, _requestVideoFrameCallbackId: 9, update() { this.own = true; } }; runtime.pullVideoFrames(kept); kept.update(); assert.equal(kept.own, true); assert.equal(kept._requestVideoFrameCallbackId, 9); }
    finally { runtime.pullVideoFrames.PULL = true; }
});
