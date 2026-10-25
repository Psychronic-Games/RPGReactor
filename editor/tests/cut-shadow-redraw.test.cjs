/**
 * A roof cut away (the game's cutaway over the player, the editor's Storeys cut) casts no shadow
 * into the storey under it: the pieces' shadow casters discard what lies above the cut, and a
 * change of cut redraws every shadow map it left stale on the next frame, instead of leaving the
 * roof's old shadow for the frames the pacing allows (one sun cascade a frame, a row no more than
 * every SHADOW_STATIC_INTERVAL frames). A frame with the cut unchanged draws nothing more.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
const Reactor3D = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
const lighting = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'), 'utf8');
const editor3D = fs.readFileSync(path.join(repoRoot, 'editor', 'src', 'MapEditor3D.js'), 'utf8');

const sunAt = (x, y, z) => ({ id: 'sun', index: 0, sun: true, x, y, z, lightY: y, strength: 1 });

function planner(quality = Reactor3D.SHADOW_QUALITY.weak) {
    const shadows = Reactor3D.Shadows;
    const saved = { atlas: shadows._atlas, sun: shadows._sun, frame: shadows._frame, rush: shadows._rush, generation: shadows._generation };
    shadows._atlas = { band: quality.sunSize, size: quality.size, rows: quality.slots, height: quality.size * quality.slots + quality.sunSize, width: quality.size * 6 };
    shadows._sun = null;
    shadows._frame = 100;
    const none = { all: false, points: [] };
    const plan = (changes = {}, rush = false) => shadows._planSun(sunAt(40, 150, 30), { x: 10, y: 0, z: 10 }, 'scene', changes.statics || none, none, quality, rush);
    const land = jobs => {
        for (const cascade of jobs.statics) { cascade.pose = cascade.want || cascade.pose; cascade.want = null; cascade.valid = true; cascade.dirty = false; cascade.stamp = shadows._frame; }
        for (const cascade of jobs.dynamics) { cascade.dynValid = cascade.valid; cascade.dynDirty = false; cascade.dynStamp = shadows._frame; }
    };
    const restore = () => Object.assign(shadows, { _atlas: saved.atlas, _sun: saved.sun, _frame: saved.frame, _rush: saved.rush, _generation: saved.generation });
    return { shadows, plan, land, restore };
}

/** Both cascades drawn and settled, the last of them on this frame. */
function settled(p) {
    for (let i = 0; i < 4; i++) { p.land(p.plan()); p.shadows._frame++; }
    p.shadows._frame -= 1;
    assert.ok(p.shadows._sun.cascades.every(c => c.valid && !c.dirty), 'settled');
}

test('a cut changed redraws both sun cascades on the next frame, past the pacing', () => {
    const p = planner();
    try {
        settled(p);
        p.shadows._frame += 2;
        // Without the cut's rush: a change of every static caster waits out the interval, a cascade a frame.
        const paced = p.plan({ statics: { all: true, points: [] } });
        assert.equal(paced.statics.length, 0, 'held back while the cascades are fresh');
        // With it: both, now.
        const rushed = p.plan({ statics: { all: true, points: [] } }, true);
        assert.equal(rushed.statics.length, 2);
        assert.deepEqual(rushed.statics, p.shadows._sun.cascades);
        assert.equal(rushed.dynamics.length, 2, 'each cascade\'s moving half drawn with it, once');
        p.land(rushed);
        p.shadows._frame++;
        // The frame after: nothing left to draw.
        const after = p.plan({}, false);
        assert.equal(after.statics.length + after.dynamics.length, 0);
    } finally { p.restore(); }
});

test('a rush with nothing stale draws nothing', () => {
    const p = planner();
    try {
        settled(p);
        p.shadows._frame += 2;
        const jobs = p.plan({}, true);
        assert.equal(jobs.statics.length, 0);
    } finally { p.restore(); }
});

test('cutChanged marks every static map stale and asks for one rush; render takes it once', () => {
    const S = Reactor3D.Shadows, before = S._generation, rush = S._rush;
    try {
        S.cutChanged();
        assert.equal(S._generation, before + 1);
        assert.equal(S._rush, true);
    } finally { S._rush = rush; }
    // render() reads the rush once, hands it to the sun's plan, and lets the rows past their pacing and per-frame caps.
    assert.match(lighting, /const rush = !!this\._rush;\n\s*this\._rush = false;/);
    assert.match(lighting, /this\._planSun\(sun, focus, scene, staticChange, dynamicChange, quality, rush\)/);
    assert.match(lighting, /t\.dirty && \(rush \|\| !t\.valid \|\| this\._frame - t\.stamp >= interval\)\)[\s\S]{0,120}\.slice\(0, rush \? tiles\.length : quality\.staticPerFrame \|\| 1\)/);
    assert.match(lighting, /\.slice\(0, rush \? dynTiles\.length : quality\.dynamicPerFrame \|\| 1\)/);
});

test('the game\'s cutaway and the editor\'s Storeys cut both report a changed cut', () => {
    // The cutaway: only when its state changes, not every frame.
    assert.match(lighting, /if \(cutState !== this\._cutState\) \{\n\s*this\._cutState = cutState;\n\s*const S = Reactor3D\.Shadows;\n\s*if \(S\) \{ if \(S\.cutChanged\) S\.cutChanged\(\); else if \(S\.invalidate\) S\.invalidate\(\); \}/);
    assert.match(editor3D, /setStoreyCut\(n, cell = null\) \{[\s\S]*?if \(S\) \{ if \(S\.cutChanged\) S\.cutChanged\(\); else if \(S\.invalidate\) S\.invalidate\(\); \}[\s\S]*?this\.requestRender\(\);/);
    // The pieces' casters discard what lies above the cut, inside its box, as the pieces themselves do.
    assert.match(lighting, /if \(vRRCutPos\.y > rrCutTop && vRRCutPos\.x >= rrCutBox\.x && vRRCutPos\.z >= rrCutBox\.y && vRRCutPos\.x <= rrCutBox\.z && vRRCutPos\.z <= rrCutBox\.w\) discard;/);
    // The editor's frame applies its cut before the shadow maps are drawn in it.
    assert.match(editor3D, /const cut = this\.applyStoreyCut\(\);\n\s*try \{\n\s*this\.renderFrame\(scene\);/);
});
