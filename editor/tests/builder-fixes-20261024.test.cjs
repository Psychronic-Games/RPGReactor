'use strict';
// Builder fixes (2026-10-24): a building selected or grouped by touch leaves the rocks beside it alone (a finish
// given to a mirror wall's building mirrored the cliff behind it); the editor's reflection capture goes round
// every face after the view moves (a mirror caught up late); no number badges on some slots and not others; a
// detached window is drawn whole after it moves.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const repoRoot = path.resolve(__dirname, '..', '..');
const read = p => fs.readFileSync(path.join(repoRoot, p), 'utf8');
const quiet = { log() {}, warn() {}, error() {}, debug() {} };

function load() {
    const context = { console: quiet };
    context.window = context;
    vm.runInNewContext(read('editor/src/utils/MapElevation.js'), context);
    vm.runInNewContext(read('editor/src/utils/StructureCapture.js'), context);
    return { E: context.RRMapElevation, C: context.RRStructureCapture };
}
const mapOf = () => ({ id: 1, width: 20, height: 20, data: [], reactor3d: { version: 1, mode: '3d' } });
const ids = list => Array.from(list).sort((a, b) => a - b);

test('a building selected by touch leaves the rocks it touches; a rock selected takes its rocks only', () => {
    const { E, C } = load();
    const map = mapOf();
    for (let x = 4; x <= 7; x++) E.setPiece(map, { kind: 'wall', x, y: 5, z: 0, rot: 0, finish: 'mirror' });
    E.setPiece(map, { kind: 'rock', x: 8, y: 5, z: 0, rot: 0, size: [2, 2, 2] });
    E.setPiece(map, { kind: 'rock', x: 10, y: 5, z: 0, rot: 0, size: [2, 2, 2] });
    const pieces = E.pieces(map), wall = pieces.find(p => p.kind === 'wall'), rock = pieces.find(p => p.kind === 'rock');
    const fromWall = C.connected(pieces, wall.id), fromRock = C.connected(pieces, rock.id);
    assert.deepEqual(ids(fromWall.map(id => pieces.find(p => p.id === id).kind)), ['wall', 'wall', 'wall', 'wall']);
    assert.ok(fromRock.every(id => pieces.find(p => p.id === id).kind === 'rock') && fromRock.length === 2, 'the rocks, together');
    // Grouped by touch (Move picking a loose wall up), the rocks stay out of the building too.
    const group = E.groupConnectedPieces(map, 5, 5);
    assert.ok(group > 0);
    assert.deepEqual(Array.from(E.pieces(map).filter(p => p.group === group), p => p.kind).sort(), ['wall', 'wall', 'wall', 'wall']);
    // A building grouped before this, rocks and all, is still selected without them.
    const old = E.pieces(map).map(p => Object.assign({}, p, { group: 7 }));
    assert.equal(C.connected(old, old.find(p => p.kind === 'wall').id).length, 4);
});

test('the editor\'s reflection capture keeps the view drawing until it has gone round every face since the view last moved', () => {
    const src = read('editor/src/MapEditor3D.js');
    assert.match(src, /static PROBE_SETTLE_FACES = 12;/);
    assert.match(src, /if \(key !== this\._probeKey\) \{ this\._probeKey = key; this\._probeOwed = MapEditor3D\.PROBE_SETTLE_FACES; \}/);
    assert.match(src, /if \(this\._probeOwed > 0 && reflections\.enabled\(\) && !reflections\.idle\(\)\) this\.requestRender\(\);/);
    assert.match(src, /reflections\.update\(this\.renderer, scene, p, this\.mapScene\.reflectionHidden\?\.\(\), behind\);/, 'the face behind the camera every other capture');
});

test('no slot shows a key badge; the key is in its tooltip', () => {
    const bar = read('editor/src/BuildHotbar.js'), css = read('editor/css/styles.css');
    assert.doesNotMatch(bar, /rr-build-slot-key/);
    assert.doesNotMatch(css, /rr-build-slot-key/);
    assert.match(bar, /title="\$\{escape\(this\.label\(slot\) \+ \(key \? ' \(' \+ key \+ '\)' : ''\)\)\}"/);
});

test('a detached window is drawn whole after it moves or is sized, its clear corners too', () => {
    const src = read('editor/src/utils/DetachedWindow.js'), css = read('editor/css/styles.css');
    assert.match(src, /win\.on\('move', \(\) => \{ if \(popped === state && state\.ready\) \{ keepWindowRect\(win\); repaint\(\); \} \}\);/);
    assert.match(src, /html\.classList\.toggle\('rr-repaint'\)/);
    assert.match(css, /html\.rr-detached-window\.rr-repaint \{ clip-path: inset\(0 round calc\(var\(--radius-lg\) \+ 0\.01px\)\); \}/);
});
