'use strict';
// Vehicle rider, one of the Rig tool's kinds (Database › 3D Models): a rider's dots (the seat, the two grips, the two
// footrests), which are the first seat of the model's `vehicle` block that the game seats a rider by. They bind
// nothing, so a vehicle keeps its carved parts; left and right mirror across the vehicle's own middle.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const ModelRigger = require('../src/database/ModelRigger.js');
const Editor = require('../src/database/Database3DEditor.js');
const RRVehicles = require('../src/event/VehicleSetup.js');
const root = path.join(__dirname, '..', '..');
const plain = value => JSON.parse(JSON.stringify(value));

test('the rider is a marker-only kind of five dots, listed with the others', () => {
    const rider = ModelRigger.TEMPLATES.rider;
    assert.ok(rider && rider.markersOnly && rider.vehicle);
    assert.deepStrictEqual(rider.markers.map(marker => marker.key), ['seat', 'handL', 'handR', 'footL', 'footR']);
    assert.deepStrictEqual(rider.markers.map(marker => marker.mirror || ''), ['', 'handR', 'handL', 'footR', 'footL']);
    assert.ok(rider.markers.every(marker => marker.surface), 'each lands on the surface under the pointer');
    assert.deepStrictEqual(rider.bones({}), [], 'nothing is bound');
    const listed = ModelRigger.templates();
    assert.deepStrictEqual(listed.filter(entry => entry.vehicle).map(entry => entry.id), ['rider']);
    assert.strictEqual(listed.find(entry => entry.id === 'rider').bones, false);
    assert.strictEqual(listed.find(entry => entry.id === 'humanoid').vehicle, false);
});

test('with only a size to go by, the dots start along the longer side, a pair either side of the middle', () => {
    for (const [size, long, wide] of [[{ x: 4, y: 2, z: 1 }, 0, 2], [{ x: 1, y: 2, z: 4 }, 2, 0]]) {
        const m = ModelRigger.defaultMarkers(size, 'rider');
        assert.strictEqual(m.seat[wide], 0, 'the seat on the middle line');
        assert.ok(m.handL[long] > m.seat[long], 'the grips ahead of the seat');
        assert.strictEqual(m.handL[wide], -m.handR[wide]);
        assert.strictEqual(m.footL[wide], -m.footR[wide]);
        assert.ok(m.footL[1] < m.seat[1] && m.seat[1] < m.handL[1], 'rests below the seat, grips above');
    }
    const links = ModelRigger.previewLinks(ModelRigger.defaultMarkers({ x: 4, y: 2, z: 1 }, 'rider'), 'rider');
    assert.strictEqual(links.length, 4, 'a stick figure: the seat to each hand and each foot');
});

test('a dot\'s twin is across the vehicle\'s own middle, whichever way its file faces', () => {
    const mirror = (self, point) => Editor.prototype._rigMirrorPoint.call(self, point);
    // A motorcycle whose front is along x: left and right are across z.
    assert.deepStrictEqual(mirror({ _rigTemplate: 'rider', _riderLeft: [0, 0, 1] }, { x: -0.46, y: 1.05, z: 0.38 }), [-0.46, 1.05, -0.38]);
    assert.deepStrictEqual(mirror({ _rigTemplate: 'rider', _riderLeft: [-1, 0, 0] }, { x: 0.3, y: 1, z: 2 }), [-0.3, 1, 2]);
    // No left known, and every other template: across x, as a body is.
    assert.deepStrictEqual(mirror({ _rigTemplate: 'rider', _riderLeft: null }, { x: 0.3, y: 1, z: 2 }), [-0.3, 1, 2]);
    assert.deepStrictEqual(mirror({ _rigTemplate: 'humanoid', _riderLeft: [0, 0, 1] }, { x: 0.3, y: 1, z: 2 }), [-0.3, 1, 2]);
});

test('saving sets the five points on the first seat and keeps everything else the block says', () => {
    const block = { forward: '-x', stand: { lean: 10, side: 'left' }, wheels: [{ part: 'Mesh_0009.rip' }],
        seats: [{ posture: 'astride', seat: { at: [0.334, 1.02, 0] }, handL: { at: [-0.458, 1.054, 0.377], part: 'Steering' }, handR: { at: [-0.456, 1.051, -0.375], part: 'Steering' },
            footL: { at: [0.309, 0.489, 0.29] }, footR: { at: [0.309, 0.489, -0.29] } }, { posture: 'pillion' }],
        guessed: ['seats', 'wheels', 'controls'] };
    const before = plain(block);
    const out = Editor.withRiderMarkers(block, { seat: [0.3, 1.0004, 0], handL: [-0.29, 1.1111, 0.2314], handR: [-0.29, 1.1111, -0.2314], footL: [0.3, 0.5, 0.3], footR: [0.3, 0.5, -0.3] });
    assert.deepStrictEqual(block, before, 'the block handed in is left as it was');
    assert.deepStrictEqual(out.seats[0].handL, { at: [-0.29, 1.111, 0.231], part: 'Steering' }, 'rounded to a thousandth; the part a hand rides is kept');
    assert.deepStrictEqual(out.seats[0].seat, { at: [0.3, 1, 0] });
    assert.strictEqual(out.seats[0].posture, 'astride');
    assert.deepStrictEqual(out.seats[1], { posture: 'pillion' }, 'another seat is not touched');
    assert.deepStrictEqual(out.guessed, ['wheels', 'controls'], 'the seat is no longer one the game guessed');
    assert.deepStrictEqual([out.forward, out.stand, out.wheels], [before.forward, before.stand, before.wheels]);
    // A marker that is no place is left as the file had it; the last guess gone takes the list with it.
    const partly = Editor.withRiderMarkers({ seats: [{ seat: { at: [1, 1, 1] } }], guessed: ['seats'] }, { seat: [NaN, 0, 0], handL: [1, 2, 3] });
    assert.deepStrictEqual(partly, { seats: [{ seat: { at: [1, 1, 1] }, handL: { at: [1, 2, 3] } }] });
    // A model with no block yet gets one of just the seat.
    assert.deepStrictEqual(Editor.withRiderMarkers(undefined, { seat: [0, 1, 0] }), { seats: [{ seat: { at: [0, 1, 0] } }] });
});

test('written through the shared model merge, the file keeps its other keys, in their places', () => {
    const text = '{\n  "animations": [],\n  "surface": {"reflect":1},\n  "vehicle": {"forward":"-x","seats":[{"seat":{"at":[0,1,0]}}],"guessed":["seats"]},\n  "parts": [\n    {"name":"Steering","pivot":[0,1,0],"meshes":{"3":[[0,4]]}}\n  ]\n}\n';
    const sidecar = JSON.parse(text);
    const merged = JSON.parse(RRVehicles.mergeModel(text, Editor.withRiderMarkers(sidecar.vehicle, { seat: [0.1, 1.2, 0] })));
    assert.deepStrictEqual(Object.keys(merged), ['animations', 'surface', 'vehicle', 'parts']);
    assert.deepStrictEqual(merged.vehicle, { forward: '-x', seats: [{ seat: { at: [0.1, 1.2, 0] } }] });
    assert.deepStrictEqual(merged.parts, sidecar.parts);
});

test('every model opens the Rig tool on the full list of kinds; a skeleton on a model with carved parts is refused at Save, and said in the bar', () => {
    const source = fs.readFileSync(path.join(root, 'editor/src/database/Database3DEditor.js'), 'utf8');
    const enter = source.slice(source.indexOf('    enterRigMode(faceOnly = false) {'), source.indexOf('    /** Whether the model\'s file gives a rider a seat'));
    assert.doesNotMatch(enter, /Remove carved parts before rigging/, 'the tool is not refused for carved parts');
    assert.match(enter, /this\._rigTemplate = saved \|\| \(this\._hasRiderSeat\(\) \? 'rider' : \(this\._rigTemplate \|\| 'humanoid'\)\);/, 'it opens on the kind the model already has');
    const bar = source.slice(source.indexOf('    renderRigBar() {'), source.indexOf('    /**', source.indexOf('    renderRigBar() {') + 10));
    assert.match(bar, /for \(const entry of ModelRigger\.templates\(\)\) \{\s+const option = document\.createElement\('option'\);/, 'no kind is left out of the list for any model');
    assert.match(bar, /bind\.disabled = carved;/);
    // What needs the model uncarved: a kind that binds a skeleton, on a model with carved parts.
    const needs = (template, parts) => Editor.prototype._rigNeedsUncarved.call({ _rigTemplate: template, customParts: parts });
    assert.deepStrictEqual(['humanoid', 'vehicle', 'rider', 'blade', 'gun'].map(kind => needs(kind, [{ name: 'Steering' }])), [true, true, false, false, false]);
    assert.deepStrictEqual(['humanoid', 'vehicle', 'rider'].map(kind => needs(kind, [])), [false, false, false]);
    // A seat in the model's file is what makes it open on the rider.
    const seat = sidecar => Editor.prototype._hasRiderSeat.call({ _sidecarObject: () => sidecar });
    assert.strictEqual(seat({ vehicle: { seats: [{ seat: { at: [0, 1, 0] } }] } }), true);
    assert.strictEqual(seat({ vehicle: { forward: 'x' } }), false);
    assert.strictEqual(seat({ animations: [] }), false);
    assert.strictEqual(seat(null), false);
    // The kind a rider is guessed as: the Vehicles record that wears the model, else a motorcycle.
    const kind = (self) => Editor.prototype._vehicleKind.call(self);
    const records = [null, { id: 1, kind: 'tank', model: { name: 'Vehicles/Consul' } }, { id: 2, model: { name: 'Vehicles/Bike' } }];
    const self = (name, sidecar) => ({ selectedName: name, databaseManager: { data: { vehicles: records } }, _sidecarObject: () => sidecar });
    assert.strictEqual(kind(self('Vehicles/Consul', null)), 'tank');
    assert.strictEqual(kind(self('Vehicles/Bike', null)), 'motorcycle', 'a record with no kind is a motorcycle');
    assert.strictEqual(kind(self('Props/Cart', { vehicle: { forward: 'x' } })), 'motorcycle');
    assert.strictEqual(kind(self('Props/Cart', null)), '');
});
