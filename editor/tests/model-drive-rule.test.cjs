/**
 * What a vehicle's own rules ask of the model rule engine (reactor_3d_models.js): a part that follows an input
 * about a line of its own (a `drive` rule), a wheel that rolls with the road by its radius, a rule that reaches
 * its part by the whole name (`exact`), and none of it creating anything per call.
 *
 * Every expected place is worked out here with plain arithmetic (a turn about a line through a point), never by
 * asking the engine twice.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const root = path.resolve(__dirname, '..', '..');
// (VEH_SEAMS_RUNTIME: another copy of the runtime folder, for a check that a test fails when a rule is taken out.)
const runtimeRoot = process.env.VEH_SEAMS_RUNTIME || path.join(root, 'runtime');
const R = require(path.join(runtimeRoot, 'reactor_3d.js'));
global.self = global; global.window = global;
require(path.join(runtimeRoot, 'libs', 'three.js'));
const THREE = global.THREE;

const DEG = Math.PI / 180;

/** `p` turned `degrees` (right-handed) about the line through `at` along `axis` (any length). */
function turned(p, at, axis, degrees) {
    const n = Math.hypot(axis[0], axis[1], axis[2]), k = axis.map(v => v / n);
    const v = [p[0] - at[0], p[1] - at[1], p[2] - at[2]];
    const c = Math.cos(degrees * DEG), s = Math.sin(degrees * DEG);
    const dot = k[0] * v[0] + k[1] * v[1] + k[2] * v[2];
    const cross = [k[1] * v[2] - k[2] * v[1], k[2] * v[0] - k[0] * v[2], k[0] * v[1] - k[1] * v[0]];
    return [0, 1, 2].map(i => at[i] + v[i] * c + cross[i] * s + k[i] * dot * (1 - c));
}

function near(actual, expected, message, epsilon = 1e-9) {
    for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(actual[i] - expected[i]) <= epsilon, `${message}: got [${actual.map(v => v.toFixed(6))}], expected [${expected.map(v => v.toFixed(6))}]`);
    }
}

// The line the bars turn about: through the head of the forks, raked back from the vertical, as a motorcycle's is.
const HEAD = [-0.644, 0.873, 0];
const RAKE = [0.41, 0.91, 0];
const AXLE = [-0.912, 0.383, 0];
const SIDE = [0, 0, 1];
const RADIUS = 0.376;
// Points of the model at rest (model space): the left grip, and a point on the front tire's tread.
const GRIP = [-0.465, 1.037, 0.377];
const TREAD = [AXLE[0] - RADIUS, AXLE[1], 0];
const REAR = [0.9, 0.383, 0];

/**
 * A motorcycle cut into parts, each a mesh whose own frame is the model's. The front wheel is carved inside the
 * steering part (its chain names the wheel first and the steering after), and Wheel10 shares Wheel1's first letters.
 */
function bike() {
    const object = new THREE.Group();
    const part = (name, chain) => {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
        mesh.name = name;
        mesh.userData.parts = chain.map(([partName, pivot]) => ({ name: partName, pivot: pivot.slice() }));
        object.add(mesh);
        return mesh;
    };
    const meshes = {
        frame: part('Frame', [['Frame', [0, 0.6, 0]]]),
        steering: part('Steering', [['Steering', HEAD]]),
        front: part('Front wheel', [['Front wheel', AXLE], ['Steering', HEAD]]),
        wheel1: part('Wheel1', [['Wheel1', REAR]]),
        wheel10: part('Wheel10', [['Wheel10', REAR]])
    };
    const binding = R.prepareModelInstance(object, []);
    /** Where a point of the model at rest is drawn, carried by the part `mesh`. */
    const drawn = (mesh, point) => {
        object.updateMatrixWorld(true);
        return mesh.localToWorld(new THREE.Vector3(...point)).toArray();
    };
    return Object.assign({ object, binding, drawn }, meshes);
}

const STEER = { name: 'Bars', type: 'drive', trigger: 'always', part: 'Steering', input: 'steer', axisVector: RAKE, degrees: 30, exact: true };
const ROLL = { name: 'Front', type: 'spin', trigger: 'always', part: 'Front wheel', radius: RADIUS, axisVector: SIDE, exact: true };
const rules = list => R.readModelAnimationRules({ animations: list });
const frameState = (frame, extra) => Object.assign({ frame, moving: false, dashing: false, distance: 0, scale: 1 }, extra);

/** Both ways the engine finds a rule's parts: the kept table, and the search made every frame. */
function eachMatcher(run) {
    const kept = R.AnimationMatches.enabled;
    try {
        for (const enabled of [true, false]) {
            R.AnimationMatches.enabled = enabled;
            run(enabled ? 'kept table' : 'per-frame search');
        }
    } finally {
        R.AnimationMatches.enabled = kept;
    }
}

test('the rule reader keeps what a vehicle rule carries, and reads every other rule as it did', () => {
    const [drive, wheel, fan, hand] = rules([
        { type: 'drive', part: 'Steering', input: 'steer', axisVector: [0, 2, 0], degrees: -30, exact: true },
        { type: 'spin', part: 'Wheel1', radius: 0.376, axisVector: [3, 0, 4], exact: true },
        { type: 'spin', part: 'Fan', axis: 'z', speed: 120 },
        { type: 'swing', part: 'Hand', degrees: -8, exact: 1, axisVector: [0, 0, 0], radius: -2, input: '' }
    ]);
    assert.equal(drive.type, 'drive');
    assert.equal(drive.exact, true);
    assert.equal(drive.input, 'steer');
    assert.equal(drive.degrees, -30, 'a drive rule keeps the sign of its turn');
    assert.deepEqual(Array.from(drive.axisVector), [0, 1, 0], 'the axis is kept at unit length');
    assert.ok(Array.isArray(drive.axisVector));
    assert.equal(wheel.type, 'spin');
    assert.equal(wheel.radius, 0.376);
    near(Array.from(wheel.axisVector), [0.6, 0, 0.8], 'a wheel axis of any length is made a unit');
    // A rule that has none of them gains no key: it is the object it always was.
    for (const key of ['exact', 'axisVector', 'radius', 'input']) assert.equal(key in fan, false, `a plain spin has no ${key}`);
    assert.equal(fan.degrees, 15);
    // Only `true` is exact; a zero axis, a radius that is no size and an empty input are not kept.
    for (const key of ['exact', 'axisVector', 'radius', 'input']) assert.equal(key in hand, false, `a swing with an unusable ${key} has none`);
    assert.equal(hand.degrees, 15, 'every other rule keeps a size for its degrees');
    // An input is what a drive rule follows: no other rule has one, whatever its entry says (nothing would read it).
    for (const type of ['spin', 'swing', 'bob', 'pose', 'clip']) {
        const [other] = rules([{ type, part: 'Fan', clip: 'Fan', input: 'throttle' }]);
        assert.deepEqual([other.type, 'input' in other], [type, false], `a ${type} has no input`);
    }
    // A drive rule may turn nothing, and one with no degrees takes the default.
    const [none, plain] = rules([{ type: 'drive', part: 'a', degrees: 0 }, { type: 'drive', part: 'b' }]);
    assert.equal(none.degrees, 0);
    assert.equal(none.input, '');
    assert.equal(plain.degrees, 15);
    // What reactor_3d_vehicles.js asks before it adds a vehicle's rules.
    const probe = rules([{ type: 'drive', part: 'x', input: 'steer', axisVector: [0, 1, 0], degrees: 30, exact: true }])[0];
    assert.ok(probe.type === 'drive' && Array.isArray(probe.axisVector) && probe.exact === true);
});

test('a part turns about a raked axis by an input', () => {
    eachMatcher(matcher => {
        const model = bike(), list = rules([STEER]);
        const at = steer => {
            R.applyModelAnimation(model.binding, list, frameState(1, { inputs: { steer } }));
            return model.drawn(model.steering, GRIP);
        };
        near(at(1), turned(GRIP, HEAD, RAKE, 30), `${matcher}: full lock one way`);
        near(at(-1), turned(GRIP, HEAD, RAKE, -30), `${matcher}: full lock the other way`);
        near(at(0.5), turned(GRIP, HEAD, RAKE, 15), `${matcher}: half the input is half the turn`);
        near(at(0), GRIP, `${matcher}: no input, at rest`);
        // The grip moved a real distance, and about the raked line, not about the vertical.
        const moved = Math.hypot(...at(1).map((v, i) => v - GRIP[i]));
        assert.ok(moved > 0.15 && moved < 0.25, `the grip travels ${moved.toFixed(3)} model units at full lock`);
        const upright = turned(GRIP, HEAD, [0, 1, 0], 30);
        assert.ok(Math.hypot(...at(1).map((v, i) => v - upright[i])) > 0.03, 'a turn about the vertical would put the grip somewhere else');
        // Nothing is kept between frames: the turn is the input's, in any order.
        near(at(0.4), turned(GRIP, HEAD, RAKE, 12), `${matcher}: after other angles`);
        assert.equal(0 in model.binding.angles, false, 'a drive rule keeps no angle');
        // What the frame does not turn stays where it was.
        near(model.drawn(model.frame, [0.2, 0.7, 0.1]), [0.2, 0.7, 0.1], `${matcher}: the frame`);
    });
});

test('a drive rule with no inputs, an unknown input or a broken one leaves its part at rest', () => {
    const model = bike(), list = rules([STEER]);
    for (const [label, extra] of [['no inputs', {}], ['null inputs', { inputs: null }], ['another input', { inputs: { throttle: 1 } }],
        ['not a number', { inputs: { steer: NaN } }], ['not finite', { inputs: { steer: Infinity } }], ['a string', { inputs: { steer: '1' } }]]) {
        R.applyModelAnimation(model.binding, list, frameState(1, { inputs: { steer: 1 } }));
        R.applyModelAnimation(model.binding, list, frameState(2, extra));
        near(model.drawn(model.steering, GRIP), GRIP, label);
    }
    // A rule with no axis of its own turns about its named axis, as a spin does.
    const upright = rules([{ type: 'drive', part: 'Steering', input: 'steer', axis: 'y', degrees: 20, exact: true }]);
    R.applyModelAnimation(model.binding, upright, frameState(3, { inputs: { steer: 1 } }));
    near(model.drawn(model.steering, GRIP), turned(GRIP, HEAD, [0, 1, 0], 20), 'about the named axis');
});

test('a part nested in the steered part turns with it and spins on its own axle by its radius', () => {
    eachMatcher(matcher => {
        const model = bike(), list = rules([STEER, ROLL]);
        // A quarter turn of the wheel is a quarter of its circumference on the road.
        const quarter = (Math.PI / 2) * RADIUS;
        R.applyModelAnimation(model.binding, list, frameState(1, { inputs: { steer: 0 }, travel: quarter }));
        near(model.drawn(model.front, TREAD), turned(TREAD, AXLE, SIDE, 90), `${matcher}: rolled a quarter turn, bars centered`);
        // The bars turn: the wheel keeps its roll and goes round with the steering, about the steered axle.
        R.applyModelAnimation(model.binding, list, frameState(2, { inputs: { steer: 1 }, travel: 0 }));
        const rolled = turned(TREAD, AXLE, SIDE, 90);
        near(model.drawn(model.front, TREAD), turned(rolled, HEAD, RAKE, 30), `${matcher}: the rolled wheel carried by the steering`);
        // The axle itself only goes round with the steering: the wheel spins about it, wherever it is.
        near(model.drawn(model.front, AXLE), turned(AXLE, HEAD, RAKE, 30), `${matcher}: the axle`);
        // And rolls on from there, a call at a time.
        for (let i = 0; i < 9; i++) R.applyModelAnimation(model.binding, list, frameState(3 + i, { inputs: { steer: 1 }, travel: quarter / 9 }));
        near(model.drawn(model.front, TREAD), turned(turned(TREAD, AXLE, SIDE, 180), HEAD, RAKE, 30), `${matcher}: half a turn of the wheel at full lock`, 1e-8);
        // The steering part's own mesh does not spin with the wheel.
        near(model.drawn(model.steering, GRIP), turned(GRIP, HEAD, RAKE, 30), `${matcher}: the grip`);
    });
});

test('a wheel rolls exactly with the road at any bound size, back in reverse, and by the distance covered when nothing says how far it rolled', () => {
    const angle = model => model.binding.angles[0];
    // 10 tiles of road at a scale of 3.5 / 2.07 tiles a model unit.
    const scale = 3.5 / 2.07, list = rules([ROLL]);
    const model = bike();
    for (let i = 0; i < 100; i++) R.applyModelAnimation(model.binding, list, frameState(i, { travel: 0.1, scale }));
    assert.ok(Math.abs(angle(model) * DEG - 10 / (RADIUS * scale)) < 1e-9, '10 tiles turn it 10 / (radius x scale) radians');
    for (let i = 0; i < 100; i++) R.applyModelAnimation(model.binding, list, frameState(100 + i, { travel: -0.1, scale }));
    assert.ok(Math.abs(angle(model)) < 1e-9, '10 tiles in reverse bring it back');
    near(model.drawn(model.front, TREAD), TREAD, 'and the tread is where it started', 1e-9);
    // Twice the size is half the turn for the same road.
    const big = bike();
    R.applyModelAnimation(big.binding, list, frameState(1, { travel: 1, scale: scale * 2 }));
    const small = bike();
    R.applyModelAnimation(small.binding, list, frameState(1, { travel: 1, scale }));
    assert.ok(Math.abs(angle(big) * 2 - angle(small)) < 1e-9);
    // Two wheels of different radius each turn right.
    const pair = bike(), both = rules([ROLL, { name: 'Rear', type: 'spin', trigger: 'always', part: 'Wheel1', radius: RADIUS * 2, axisVector: SIDE, exact: true }]);
    R.applyModelAnimation(pair.binding, both, frameState(1, { travel: 1 }));
    assert.ok(Math.abs(pair.binding.angles[0] - 2 * pair.binding.angles[1]) < 1e-9);
    // Anything that is not a ridden vehicle has no `travel`: its wheels turn by the distance it covered this frame.
    const npc = bike();
    R.applyModelAnimation(npc.binding, list, frameState(1, { distance: 0.25 }));
    assert.ok(Math.abs(angle(npc) * DEG - 0.25 / RADIUS) < 1e-12);
    for (const travel of [undefined, null, NaN, '3']) {
        const other = bike();
        R.applyModelAnimation(other.binding, list, frameState(1, { distance: 0.25, travel }));
        assert.ok(Math.abs(angle(other) * DEG - 0.25 / RADIUS) < 1e-12, `travel ${travel} is no travel`);
    }
    // A travel of none is a real answer: the vehicle stands, whatever its event's distance says.
    const still = bike();
    R.applyModelAnimation(still.binding, list, frameState(1, { distance: 0.25, travel: 0 }));
    assert.equal(angle(still), 0);
    // The road is the judge, not the event's own step: a ridden vehicle is carried along with its event standing
    // (`moving` false), and a wheel that plays While moving rolls by the road all the same, as a Roll always has.
    for (const trigger of ['moving', 'walking', 'dashing', 'always']) {
        const gated = rules([Object.assign({}, ROLL, { trigger })]);
        const carried = bike();
        R.applyModelAnimation(carried.binding, gated, frameState(1, { moving: false, travel: 0.3 }));
        assert.ok(Math.abs(angle(carried) * DEG - 0.3 / RADIUS) < 1e-12, `a wheel set to ${trigger} rolls 0.3 tiles of road while its event stands`);
        near(carried.drawn(carried.front, TREAD), turned(TREAD, AXLE, SIDE, 0.3 / RADIUS / DEG), `and is drawn rolled (${trigger})`);
        R.applyModelAnimation(carried.binding, gated, frameState(2, { moving: false, distance: 0.3 }));
        assert.ok(Math.abs(angle(carried) * DEG - 0.6 / RADIUS) < 1e-12, `and by the distance covered when nothing says how far it rolled (${trigger})`);
    }
});

test('a number at the edge of what a number holds turns nothing: the part can be drawn, and the wheel rolls on from where it was', () => {
    const finite = model => [model.front, model.steering, model.wheel1].every(mesh => mesh.quaternion.toArray().concat(mesh.position.toArray()).every(Number.isFinite));
    const byTile = { name: 'Roll', type: 'spin', trigger: 'always', part: 'Front wheel', axis: 'z', perTile: 1e308 };
    // Each: the wheel's rule, and the state of the one call that asks for more than a number holds.
    for (const [label, raw, extra] of [
        ['a radius of nearly nothing', Object.assign({}, ROLL, { radius: 1e-320 }), { travel: 0.3 }],
        ['a travel past any road', ROLL, { travel: 1e308 }],
        ['a travel past any road, backward', ROLL, { travel: -1e308 }],
        ['a bound size of nearly nothing', ROLL, { travel: 0.3, scale: 1e-320 }],
        ['degrees a tile past any turn', byTile, { travel: 1 }],
        ['a distance past any road', ROLL, { distance: 1e308 }]]) {
        eachMatcher(matcher => {
            const model = bike(), list = rules([raw]), sane = rules([ROLL]);
            // A quarter turn first, so there is an angle to keep.
            const quarter = (Math.PI / 2) * RADIUS;
            R.applyModelAnimation(model.binding, sane, frameState(1, { travel: quarter }));
            assert.ok(Math.abs(model.binding.angles[0] - 90) < 1e-9);
            for (let i = 0; i < 3; i++) R.applyModelAnimation(model.binding, list, frameState(2 + i, extra));
            assert.ok(Number.isFinite(model.binding.angles[0]), `${label} (${matcher}): the angle is a number`);
            assert.ok(Math.abs(model.binding.angles[0] - 90) < 1e-9, `${label} (${matcher}): the wheel keeps the angle it had`);
            assert.ok(finite(model), `${label} (${matcher}): every part can be drawn`);
            near(model.drawn(model.front, TREAD), turned(TREAD, AXLE, SIDE, 90), `${label} (${matcher}): the tread stays where it had rolled to`);
            // Sane numbers again: it rolls on.
            R.applyModelAnimation(model.binding, sane, frameState(9, { travel: quarter }));
            near(model.drawn(model.front, TREAD), turned(TREAD, AXLE, SIDE, 180), `${label} (${matcher}): and rolls on`, 1e-8);
        });
    }
    // An angle that is no number (whatever left it there) is not kept either: the wheel starts again from rest.
    for (const broken of [Infinity, -Infinity, NaN]) {
        const model = bike(), list = rules([ROLL]);
        model.binding.angles[0] = broken;
        R.applyModelAnimation(model.binding, list, frameState(1, { travel: (Math.PI / 2) * RADIUS }));
        assert.ok(finite(model), `an angle of ${broken}: the part can be drawn`);
        assert.ok(Math.abs(model.binding.angles[0] - 90) < 1e-9, `an angle of ${broken} starts again from rest`);
    }
    // A steered part: a turn at full input, or an input, past any angle leaves it at rest, and the next sane input turns it.
    for (const [label, degrees, steer] of [['degrees past any turn', 1e308, 1], ['the same the other way', -1e308, 1], ['an input past any stick', 30, 1e307], ['both', 1e200, -1e200]]) {
        eachMatcher(matcher => {
            const model = bike(), list = rules([Object.assign({}, STEER, { degrees }), ROLL]);
            assert.equal(list[0].degrees, degrees, 'the reader keeps the number as written');
            R.applyModelAnimation(model.binding, list, frameState(1, { inputs: { steer }, travel: 0 }));
            assert.ok(finite(model), `${label} (${matcher}): every part can be drawn`);
            near(model.drawn(model.steering, GRIP), GRIP, `${label} (${matcher}): the steered part rests`);
            near(model.drawn(model.front, TREAD), TREAD, `${label} (${matcher}): and so does the wheel it carries`);
        });
    }
    const model = bike(), list = rules([STEER]);
    R.applyModelAnimation(model.binding, list, frameState(1, { inputs: { steer: 1e307 } }));
    R.applyModelAnimation(model.binding, list, frameState(2, { inputs: { steer: 1 } }));
    near(model.drawn(model.steering, GRIP), turned(GRIP, HEAD, RAKE, 30), 'a sane input after a broken one turns the part');
});

test('a degrees-per-tile spin rolls back in reverse on a ridden vehicle, and is what it was for everything else', () => {
    const list = rules([{ name: 'Roll', type: 'spin', trigger: 'moving', part: 'Wheel1', axis: 'x', perTile: 120 }]);
    const model = bike();
    R.applyModelAnimation(model.binding, list, frameState(1, { moving: true, distance: 0.5, travel: 0.5 }));
    assert.ok(Math.abs(model.binding.angles[0] - 60) < 1e-12);
    R.applyModelAnimation(model.binding, list, frameState(2, { moving: true, distance: 0.5, travel: -0.5 }));
    assert.ok(Math.abs(model.binding.angles[0]) < 1e-12, 'backward on the road, backward on the wheel');
    // With no travel on the state: the distance, as before.
    R.applyModelAnimation(model.binding, list, frameState(3, { moving: true, distance: 0.5 }));
    assert.ok(Math.abs(model.binding.angles[0] - 60) < 1e-12);
    near(model.drawn(model.wheel1, [REAR[0], REAR[1] + 0.3, 0]), turned([REAR[0], REAR[1] + 0.3, 0], REAR, [1, 0, 0], 60), 'about its named axis');
    // A spin by the clock is untouched by any of it.
    const clock = rules([{ name: 'Fan', type: 'spin', trigger: 'always', part: 'Wheel1', axis: 'z', speed: 120 }]);
    const fan = bike();
    R.applyModelAnimation(fan.binding, clock, frameState(1, { travel: 5, distance: 5 }));
    assert.equal(fan.binding.angles[0], 2);
});

test('a wheel on a state that says neither how far it rolled nor how far it went keeps its angle and can still be drawn', () => {
    // A preview that poses a model at one frame (the Action Sequence editor's) hands the pass no distance.
    const posed = extra => Object.assign({ frame: 2, moving: false, scale: 1, action: { name: 'x', frame: 0 }, seek: true }, extra);
    const byTile = { name: 'Roll', type: 'spin', trigger: 'always', part: 'Front wheel', axis: 'z', perTile: 120 };
    for (const [label, raw] of [['by its radius', ROLL], ['by degrees a tile', byTile]]) {
        const model = bike(), list = rules([raw]);
        R.applyModelAnimation(model.binding, list, frameState(1, { distance: 0.1 }));
        const rolled = model.binding.angles[0];
        assert.ok(rolled > 0, label);
        for (const extra of [{}, { distance: undefined }, { distance: NaN }, { distance: null }, { travel: NaN }, { travel: undefined, distance: Infinity }]) {
            R.applyModelAnimation(model.binding, list, posed(extra));
            assert.equal(model.binding.angles[0], rolled, `${label}: the angle is kept (${JSON.stringify(extra)})`);
            assert.ok(model.front.quaternion.toArray().every(Number.isFinite), `${label}: the part can be drawn (${JSON.stringify(extra)})`);
        }
        near(model.drawn(model.front, TREAD), turned(TREAD, AXLE, SIDE, rolled), `${label}: the tread stays where it had rolled to`);
        // The road known again: it rolls on from where it was.
        R.applyModelAnimation(model.binding, list, frameState(3, { distance: 0.1 }));
        assert.ok(Math.abs(model.binding.angles[0] - 2 * rolled) < 1e-9, `${label}: it rolls on`);
    }
});

test('a rule on Wheel1 with exact leaves Wheel10 still; without it the name is a prefix as before', () => {
    const point = [REAR[0], REAR[1] + 0.3, 0];
    eachMatcher(matcher => {
        const exact = bike();
        R.applyModelAnimation(exact.binding, rules([{ name: 'Rear', type: 'spin', trigger: 'always', part: 'Wheel1', radius: RADIUS, axisVector: SIDE, exact: true }]), frameState(1, { travel: 0.3 }));
        const rolledBy = 0.3 / RADIUS / DEG;
        near(exact.drawn(exact.wheel1, point), turned(point, REAR, SIDE, rolledBy), `${matcher}: Wheel1 rolls`);
        near(exact.drawn(exact.wheel10, point), point, `${matcher}: Wheel10 is still`);
        // The whole name, whatever its case.
        const cased = bike();
        R.applyModelAnimation(cased.binding, rules([{ name: 'Rear', type: 'spin', trigger: 'always', part: 'wheel1', radius: RADIUS, axisVector: SIDE, exact: true }]), frameState(1, { travel: 0.3 }));
        near(cased.drawn(cased.wheel1, point), turned(point, REAR, SIDE, rolledBy), `${matcher}: wheel1 names Wheel1`);
        near(cased.drawn(cased.wheel10, point), point, `${matcher}: and not Wheel10`);
        // An exact rule on a part's first letters reaches nothing.
        const short = bike();
        R.applyModelAnimation(short.binding, rules([{ name: 'Rear', type: 'spin', trigger: 'always', part: 'Wheel', radius: RADIUS, axisVector: SIDE, exact: true }]), frameState(1, { travel: 0.3 }));
        near(short.drawn(short.wheel1, point), point, `${matcher}: "Wheel" is nobody's whole name`);
        // An exact rule on the steering still carries the wheel nested in it: the chain is searched by whole names.
        const nested = bike();
        R.applyModelAnimation(nested.binding, rules([STEER]), frameState(1, { inputs: { steer: 1 } }));
        near(nested.drawn(nested.front, TREAD), turned(TREAD, HEAD, RAKE, 30), `${matcher}: the wheel inside the steering part`);
        // Without `exact` a rule reaches every part whose name starts with it, as it always has.
        const prefix = bike();
        R.applyModelAnimation(prefix.binding, rules([{ name: 'Rear', type: 'spin', trigger: 'always', part: 'Wheel1', radius: RADIUS, axisVector: SIDE }]), frameState(1, { travel: 0.3 }));
        near(prefix.drawn(prefix.wheel1, point), turned(point, REAR, SIDE, rolledBy), `${matcher}: Wheel1 by prefix`);
        near(prefix.drawn(prefix.wheel10, point), turned(point, REAR, SIDE, rolledBy), `${matcher}: Wheel10 by prefix`);
    });
});

test('the kept table and the per-frame search draw the same model, frame after frame', () => {
    const list = rules([STEER, ROLL, { name: 'Rear', type: 'spin', trigger: 'always', part: 'Wheel1', radius: RADIUS, axisVector: SIDE, exact: true },
        { name: 'Idle', type: 'bob', trigger: 'always', part: 'Frame', axis: 'y', amount: 0.01, period: 30 }]);
    const kept = R.AnimationMatches.enabled;
    const run = enabled => {
        R.AnimationMatches.enabled = enabled;
        const model = bike(), frames = [];
        for (let i = 0; i < 40; i++) {
            R.applyModelAnimation(model.binding, list, frameState(i, { inputs: { steer: Math.sin(i / 5) }, travel: 0.3 * Math.cos(i / 9), scale: 1.7 }));
            model.object.updateMatrixWorld(true);
            frames.push(model.binding.meshes.map(entry => entry.mesh.matrixWorld.elements.slice()));
        }
        return frames;
    };
    try {
        assert.deepEqual(run(true), run(false));
    } finally {
        R.AnimationMatches.enabled = kept;
    }
});

test('applyModelAnimation creates no object for a wheel or a steered part: no vector, quaternion or matrix, and its pool does not grow', () => {
    const model = bike();
    const list = rules([STEER, ROLL, { name: 'Rear', type: 'spin', trigger: 'always', part: 'Wheel1', radius: RADIUS, axisVector: SIDE, exact: true }]);
    // One state for the whole ride, as the test must make nothing itself.
    const inputs = { steer: 0 }, state = frameState(0, { inputs, travel: 0, scale: 1.69 });
    const frame = i => {
        state.frame = i;
        inputs.steer = ((i % 200) - 100) / 100;
        state.travel = ((i % 7) - 2) * 0.05;
        R.applyModelAnimation(model.binding, list, state);
    };
    for (let i = 0; i < 4; i++) frame(i);
    // Every three.js constructor the pass could reach counts while the frames run.
    const names = ['Vector3', 'Quaternion', 'Matrix4', 'Euler'], real = {};
    let made = 0;
    for (const name of names) {
        real[name] = THREE[name];
        const Counted = function(...args) { made++; return Reflect.construct(real[name], args, new.target || Counted); };
        Counted.prototype = real[name].prototype;
        THREE[name] = Counted;
    }
    const pool = R._animPool, sizes = () => [pool.vec.length, pool.quat.length, pool.mat.length, pool.action.length, pool.match.length];
    const before = sizes();
    try {
        for (let i = 4; i < 604; i++) frame(i);
        assert.ok(new THREE.Vector3().isVector3 && made === 1, 'the count sees a vector made through the namespace');
        made = 0;
        for (let i = 604; i < 1204; i++) frame(i);
    } finally {
        for (const name of names) THREE[name] = real[name];
    }
    assert.equal(made, 0, 'no three.js object is made after the first frames');
    assert.deepEqual(sizes(), before, 'the per-call pool does not grow');

    // And the two branches a vehicle's rules run are written with nothing that makes an object: no constructor,
    // no array or object written out, no function, no copied list. (The heap cannot be the judge here: the
    // pass's own loops make iterator objects until the engine has compiled it.)
    const source = require('node:fs').readFileSync(path.join(runtimeRoot, 'reactor_3d_models.js'), 'utf8');
    const from = source.indexOf('if (rule.type === "spin") {', source.indexOf('Reactor3D.applyModelAnimation = function'));
    const to = source.indexOf('} else if (rule.type === "swing") {', from);
    assert.ok(from > 0 && to > from);
    const branches = source.slice(from, to).replace(/\/\/.*$/gm, '');
    assert.match(branches, /rule\.type === "drive"/, 'the drive branch is in the text read');
    for (const [what, pattern] of [['a constructor', /\bnew\b/], ['an array written out', /[=(,:?]\s*\[/], ['an object written out', /[=(,:?]\s*\{/],
        ['a function', /=>|\bfunction\b/], ['a copied list', /\.(?:slice|map|concat|filter|clone)\(/], ['a built string', /`/]]) {
        assert.doesNotMatch(branches, pattern, `the spin and drive branches hold ${what}`);
    }
});
