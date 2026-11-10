'use strict';
// Crowd tiers (runtime/reactor_3d_models.js, Reactor3D.CrowdTiers, runtime 20261110.1): a body out of view that is
// not the party is placed every few updates, and its model-drawn sprite updated as rarely; anything acting,
// limp or knocked out keeps every update.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..', '..');
require(path.join(repoRoot, 'runtime', 'libs', 'three.js'));
const R = require(path.join(repoRoot, 'runtime', 'reactor_3d.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_lighting.js'));
require(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'));
const C = R.CrowdTiers;

const body = () => ({ _pageIndex: 0 });
const holder = held => ({ poseHeld: held, object: {} });

test('a body out of view is marked, with what its next sync needs; one in view is not', () => {
    const far = body(), h = holder(true);
    C.note(far, 'k1', h);
    assert.equal(far._rrCrowd.off, true);
    assert.equal(far._rrCrowd.key, 'k1');
    assert.equal(far._rrCrowd.holder, h);
    assert.equal(Object.keys(far).includes('_rrCrowd'), false, 'kept out of a save');
    const near = body();
    C.note(near, 'k2', holder(false));
    assert.equal(near._rrCrowd, undefined);
    // Back in view: every update again.
    h.poseHeld = false;
    C.note(far, 'k1', h);
    assert.equal(far._rrCrowd.off, false);
});

test('a ragdoll, a knocked-out body and one playing an action keep every update', () => {
    for (const change of [c => { c._reactorRagdoll = {}; }, c => { c._reactorKnockedOut = true; }, (c, h) => { h.action = {}; }]) {
        const character = body(), h = holder(true);
        C.note(character, 'k', h);
        change(character, h);
        C.note(character, 'k', h);
        assert.equal(character._rrCrowd.off, false);
    }
});

test('its sprite updates every few updates; switched off, every one', () => {
    const character = body();
    C.note(character, 'k', holder(true));
    assert.equal(C.spriteEvery(character), C.SPRITE_OFF_VIEW_EVERY);
    assert.equal(C.spriteEvery(body()), 1);
    C.enabled = false;
    try { assert.equal(C.spriteEvery(character), 1); } finally { C.enabled = true; }
});

test('the sync leaves such a body out between its beats, and the sprite throttle asks the tiers', () => {
    const models = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_3d_models.js'), 'utf8');
    assert.match(models, /crowd\.off && crowd\.holder\.object && this\._modelInstances\.get\(crowd\.key\) === crowd\.holder\s*&& crowd\.page === character\._pageIndex && \(\(tick \+ crowd\.seed\) % offEvery\) !== 0\) \{ live\.add\(crowd\.key\);/);
    assert.match(models, /if \(offEvery > 1 && character\) crowdTiers\.note\(character, key, holder\);/);
    const sprites = fs.readFileSync(path.join(repoRoot, 'runtime', 'reactor_sprites.js'), 'utf8');
    assert.match(sprites, /Reactor3D\.CrowdTiers\.spriteEvery\(this\._character\)/);
});
