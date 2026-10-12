'use strict';
// A map's pieces are worked out once per stored list (MapElevation.pieces): every write stores a new
// array, so the same array reads the same. What a caller is handed is still its own to change.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const E = require(path.join(__dirname, '..', 'src', 'utils', 'MapElevation.js'));

const plain = value => JSON.parse(JSON.stringify(value));
function map() {
    const m = { id: 1, width: 30, height: 20, note: '<3d>', reactor3d: { version: 1 } };
    for (let x = 2; x < 8; x++) E.setPiece(m, { kind: 'wall', x, y: 3, z: 0, rot: 0, material: 'Stone' });
    for (let x = 12; x < 15; x++) for (let y = 8; y < 11; y++) E.setPiece(m, { kind: 'floor', x, y, z: 0, rot: 0, material: 'Wood', group: 4 });
    return m;
}

test('a piece handed out is the caller\'s own: changing it changes neither the map nor the next read', () => {
    const m = map();
    const first = E.pieces(m);
    first[0].x = 99; first[0].material = 'Changed'; first.length = 1;
    const second = E.pieces(m);
    assert.equal(second.length, 15);
    assert.deepEqual([second[0].x, second[0].material], [2, 'Stone']);
    assert.notEqual(E.pieces(m)[0], second[0]);
    assert.equal(m.reactor3d.pieces[0].x, 2);
});

test('a read after each kind of write is the map as it stands', () => {
    const m = map();
    E.pieces(m);
    const id = E.setPiece(m, { kind: 'block', x: 20, y: 5, z: 0, rot: 0, material: 'Stone' });
    assert.ok(E.pieces(m).some(piece => piece.id === id && piece.kind === 'block'));
    E.setPiece(m, { kind: 'block', x: 20, y: 5, z: 0, rot: 0, material: 'Wood' });
    assert.equal(E.pieces(m).find(piece => piece.id === id).material, 'Wood', 'the same cell laid again');
    assert.equal(E.removePiece(m, 20, 5, 0), true);
    assert.equal(E.pieces(m).some(piece => piece.id === id), false);
    const snapshot = E.piecesSnapshot(m);
    E.setPiece(m, { kind: 'wall', x: 25, y: 15, z: 0, rot: 0, material: 'Stone' });
    assert.equal(E.pieces(m).length, 16);
    E.restorePieces(m, snapshot);
    assert.equal(E.pieces(m).length, 15);
    // What the next read gives is what a fresh read of the stored list gives.
    const stored = { id: 1, width: 30, height: 20, note: '<3d>', reactor3d: plain(m.reactor3d) };
    assert.deepEqual(plain(E.pieces(m)), plain(E.pieces(stored)));
    // The same list on a map made smaller is read again: a piece past the new border is not kept as it was.
    const small = { id: 1, width: 10, height: 20, note: '<3d>', reactor3d: m.reactor3d };
    assert.deepEqual(plain(E.pieces(small)), plain(E.pieces({ id: 1, width: 10, height: 20, note: '<3d>', reactor3d: plain(m.reactor3d) })));
});

test('the building at a cell: a piece of it there, else the first building whose cells span it', () => {
    const m = map();
    assert.equal(E.pieceGroupAt(m, 13, 9), 4);
    assert.equal(E.pieceGroupAt(m, 3, 3), 0, 'loose pieces are no building');
    assert.equal(E.pieceGroupAt(m, 0, 0), 0);
    // A hollow building: its middle has no piece and is still inside it.
    for (const [x, y] of [[20, 12], [24, 12], [20, 16], [24, 16]]) E.setPiece(m, { kind: 'wall', x, y, z: 0, rot: 0, material: 'Stone', group: 7 });
    assert.equal(E.pieceGroupAt(m, 22, 14), 7);
    assert.deepEqual(plain(E.pieceGroupBounds(m, 7)), { x0: 20, y0: 12, x1: 24, y1: 16 });
});
