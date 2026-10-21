'use strict';
// The handling step (runtime/reactor_3d_vehicles.js, Reactor3D.Vehicles.step): one logic tick of steering and
// speed, pure arithmetic. The game's tick, the Database page's preview and these tests run the same function. Each
// number of the motorcycle's table is reproduced from it here, to two figures.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'runtime', 'reactor_3d_vehicles.js'), 'utf8');
function load(extra = {}) {
    const sandbox = Object.assign({ console, Math, JSON, Reactor3D: {} }, extra);
    vm.createContext(sandbox);
    vm.runInContext(source, sandbox, { filename: 'reactor_3d_vehicles.js' });
    return sandbox.Reactor3D.Vehicles;
}
const V = load();
const DT = 1 / 60, DEG = Math.PI / 180;
const bike = V.typeOf({ kind: 'motorcycle' });
const ALONE = { alone: true };
const GAS = { gas: 1, brake: 0, steer: 0 }, BRAKE = { gas: 0, brake: 1, steer: 0 }, NONE = { gas: 0, brake: 0, steer: 0 };
/** A motorcycle at a speed, heading north from the origin. */
const at = (v = 0, yaw = 0) => Object.assign(V.newState(yaw), { v });
const run = (state, input, ticks, type = bike, env = ALONE) => { for (let i = 0; i < ticks; i++) V.step(state, input, type, env, DT); return state; };
/** Ticks until `done(state)`, stepping with `input`; -1 if it never is within `most`. */
function until(state, input, done, most = 2000, type = bike, env = ALONE) {
    for (let i = 1; i <= most; i++) { V.step(state, input, type, env, DT); if (done(state)) return i; }
    return -1;
}
const near = (actual, expected, share, what) => assert.ok(Math.abs(actual - expected) <= Math.abs(expected) * share,
    `${what}: ${actual} is not within ${share * 100}% of ${expected}`);
/** Equal to two figures: the same when both are rounded to two significant digits, or within 2.5%. */
const two = (actual, expected, what) => assert.ok(Number(actual.toPrecision(2)) === Number(expected.toPrecision(2)) || Math.abs(actual - expected) <= Math.abs(expected) * 0.025,
    `${what}: ${actual} against ${expected}`);

test('pulling away: a walking pace in 0.28 s, a dash in 0.62 s, then 10.8, 15.7 and 18.0 tiles a second', () => {
    const s = at();
    const walk = until(s, GAS, state => state.v >= 3.75);
    two(walk * DT, 0.28, 'time to a walking pace');
    two(-s.y, 0.6, 'tiles rolled by then');
    const dash = until(at(), GAS, state => state.v >= 7.5);
    two(dash * DT, 0.62, 'time to a dash');
    const t = at();
    run(t, GAS, 60); two(t.v, 10.8, 'after 1 s');
    run(t, GAS, 60); two(t.v, 15.7, 'after 2 s');
    run(t, GAS, 60); two(t.v, 18.0, 'after 3 s');
    // 90% of top speed comes at toTopSpeed seconds, whatever the two numbers are.
    const quick = V.typeOf({ kind: 'motorcycle', handling: { speed: 12, toTopSpeed: 1.5 } });
    near(run(at(), GAS, 90, quick).v, 0.9 * 12, 0.01, '90% at toTopSpeed');
    // It never passes its top speed.
    assert.ok(run(at(), GAS, 3600).v <= 20 && run(at(), GAS, 3600).v > 19.99);
});

test('top speed is 2.7 times a dash', () => {
    two(bike.handling.speed / 7.5, 2.7, 'against a dash');
});

test('the brake stops it from top speed in 0.67 s and 6.7 tiles; with no key it coasts 2.5 s and 25 tiles', () => {
    const b = at(20);
    const stop = until(b, BRAKE, state => state.v === 0);
    two(stop * DT, 0.67, 'braking time');
    two(-b.y, 6.7, 'braking distance');
    const c = at(20);
    const roll = until(c, NONE, state => state.v === 0);
    two(roll * DT, 2.5, 'coasting time');
    two(-c.y, 25, 'coasting distance');
});

test('how fast it turns at each speed, the circle it makes and the lean it shows', () => {
    // Steady steering at a held speed. The steering is held at 0.6 of lock, the most that sheds no speed, and the
    // throttle holds the speed (each tick is taken back what it adds): the turn and the lean at full lock are
    // those divided by 0.6.
    const held = { gas: 1, brake: 0, steer: 0.6, analog: true };
    const steady = v => {
        // The speed the throttle takes to `v` in one tick: u + launch x (1 - u / top) x dt = v.
        const from = v >= 20 ? v : (v - bike.k.launch * DT) / (1 - bike.k.launch * DT / 20);
        const s = at(v);
        for (let i = 0; i < 120; i++) { s.v = from; V.step(s, held, bike, null, DT); }
        assert.ok(Math.abs(s.v - v) < 1e-9, `held at ${v}: ${s.v}`);
        return { rate: s.rate / 0.6 / DEG, across: 2 * s.v / (s.rate / 0.6), lean: s.roll / 0.6 / DEG };
    };
    const rows = [[2, 76, 3, 3], [3.9, 150, 3, 13], [7.5, 150, 5.8, 25], [12.2, 150, 9.4, 40], [20, 92, 25, 40]];
    for (const [v, rate, across, lean] of rows) {
        const got = steady(v);
        two(got.rate, rate, `degrees a second at ${v}`);
        near(got.across, across, 0.03, `circle at ${v}`);
        assert.ok(Math.abs(got.lean - lean) <= 0.6, `lean at ${v}: ${got.lean} against ${lean}`);
    }
});

test('D held at 20: full lock at 0.18 s, 36 degrees of lean at 0.43 s, upright 0.4 s after letting go', () => {
    const s = at(20), right = { gas: 1, brake: 0, steer: 1 };
    run(s, right, 2);
    assert.ok(s.steer > 0.17 && s.steer <= 0.2, `a fifth of its travel at tick 2: ${s.steer}`);
    assert.ok(s.roll > 0, 'the lean has begun by tick 2');
    const lock = 2 + until(s, right, state => state.steer === 1);
    two(lock * DT, 0.18, 'full lock');
    run(s, right, 26 - lock);
    two(s.roll / DEG, 36, 'lean at 0.43 s');
    assert.ok(s.roll / DEG < 40);
    run(s, right, 60);
    two(s.roll / DEG, 40, 'the lean it is on its way to');
    run(s, GAS, 24);
    assert.equal(s.steer, 0);
    assert.ok(Math.abs(s.roll / DEG) < 4.5, `upright 0.4 s after letting go: ${s.roll / DEG}`);
});

test('an 8-tick tap of D at 20: 7 degrees of heading, a lean that peaks at 13, 3.5 tiles to the right after 1.5 s', () => {
    const s = at(20);
    let peak = 0;
    for (let i = 1; i <= 90; i++) { V.step(s, { gas: 1, brake: 0, steer: i <= 8 ? 1 : 0 }, bike, ALONE, DT); peak = Math.max(peak, s.roll); }
    two(s.yaw / DEG, 7, 'heading');
    two(peak / DEG, 13, 'peak lean');
    two(s.x, 3.5, 'tiles to the right');
    assert.ok(s.v > 19.5, 'a tap keeps its speed');
});

test('the held corner: W + D from top speed is a quarter turn in 0.80 s, 9.2 tiles forward by 5.8 sideways, leaving at 12.2', () => {
    const s = at(20);
    const ticks = until(s, { gas: 1, brake: 0, steer: 1 }, state => state.yaw >= Math.PI / 2);
    two(ticks * DT, 0.80, 'time');
    two(-s.y, 9.2, 'forward');
    two(s.x, 5.8, 'sideways');
    two(s.v, 12.2, 'leaving speed');
    // Held on, it settles at the cornering speed and goes no slower.
    run(s, { gas: 1, brake: 0, steer: 1 }, 600);
    near(s.v, 12.2, 0.01, 'the cornering speed');
    // Steering under 0.6 of lock sheds nothing: a lane change is made at full speed.
    const light = at(20);
    for (let i = 0; i < 120; i++) V.step(light, { gas: 1, brake: 0, steer: 0.5, analog: true }, bike, ALONE, DT);
    assert.ok(light.v > 19.9, `half lock keeps top speed: ${light.v}`);
    // Without the throttle the held corner still pulls the speed down, at 20 tiles a second each second and no faster.
    const off = at(20); off.steer = 1;
    V.step(off, { gas: 0, brake: 0, steer: 1, analog: true }, bike, ALONE, DT);
    near(20 - off.v, (20 + 8) * DT, 0.01, 'shed plus coast in one tick');
});

test('walked round at a standstill: a half turn in 1.6 s, the same either way, and not at all with a key on the throttle or the brake', () => {
    const s = at(0);
    const half = until(s, { gas: 0, brake: 0, steer: 1 }, state => state.yaw >= Math.PI);
    two(half * DT, 1.6, 'half turn');
    assert.equal(s.v, 0);
    assert.ok(Math.hypot(s.x, s.y) < 1e-9, 'it turns about its middle');
    const left = at(0);
    until(left, { gas: 0, brake: 0, steer: -1 }, state => state.yaw <= -Math.PI);
    near(left.yaw, -s.yaw, 0.001, 'the other way');
    // Rolling backward under a tile a second it is still walked round the way the key says.
    const back = at(-0.5);
    V.step(back, { gas: 0, brake: 0, steer: 1, analog: true }, bike, null, DT);
    assert.ok(back.turn > 0);
    // The brake held at rest: no walking round.
    const held = at(0);
    V.step(held, { gas: 0, brake: 1, steer: 1, analog: true }, bike, null, DT);
    assert.equal(held.turn, 0);
    // A kind that is not walked round does not turn where it stands.
    const car = V.typeOf({ kind: 'car' });
    const parked = at(0);
    run(parked, { gas: 0, brake: 0, steer: 1 }, 60, car);
    assert.equal(parked.yaw, 0);
});

test('backing up: the brake held 6 ticks at rest, then 3 tiles a second, and it steers the other way', () => {
    const s = at(0);
    run(s, BRAKE, 6);
    assert.equal(s.v, 0, 'six ticks at rest');
    run(s, BRAKE, 1);
    assert.ok(s.v < 0, 'the seventh backs up');
    run(s, BRAKE, 240);
    assert.equal(s.v, -3);
    assert.ok(s.y > 0, 'it went south, heading north');
    // Steering right while backing swings the heading left.
    const b = at(-3);
    run(b, { gas: 0, brake: 1, steer: 1 }, 30);
    assert.ok(b.yaw < 0 && b.turn < 0);
    // Braking from speed stops at zero first: the six ticks start there.
    const moving = at(1);
    const stopped = until(moving, BRAKE, state => state.v === 0);
    run(moving, BRAKE, 6);
    assert.equal(moving.v, 0);
    assert.ok(stopped > 0);
    run(moving, BRAKE, 1);
    assert.ok(moving.v < 0);
    // Rolling back with the brake let go and pressed again, it goes on backing: it does not snap to rest.
    const rolling = at(-2);
    V.step(rolling, BRAKE, bike, null, DT);
    assert.ok(rolling.v < -2 && rolling.v > -2.2);
    // The throttle takes it forward again from a backward roll, and ends the count.
    run(rolling, GAS, 30);
    assert.ok(rolling.v > 0 && rolling.rest === 0);
    // Letting go coasts it back to rest, and a kind with no reverse never backs up.
    run(s, NONE, 60);
    assert.equal(s.v, 0);
    const none = V.typeOf({ kind: 'motorcycle', handling: { reverse: 0 } });
    assert.equal(run(at(0), BRAKE, 120, none).v, 0);
});

test('in the air it keeps its speed, steers at a quarter of its rate and drops its nose 10 degrees a second', () => {
    const ground = at(12), air = at(12);
    const env = { air: true, alone: true };
    V.step(ground, { gas: 0, brake: 0, steer: 1, analog: true }, bike, ALONE, DT);
    V.step(air, { gas: 0, brake: 0, steer: 1, analog: true }, bike, env, DT);
    near(air.turn, ground.turn / 4, 1e-9, 'a quarter of the turn');
    assert.equal(air.v, 12, 'no key, no brake and no corner changes its speed in the air');
    run(air, BRAKE, 30, bike, env);
    assert.equal(air.v, 12);
    run(air, GAS, 30, bike, env);
    assert.equal(air.v, 12);
    const jump = at(20);
    run(jump, NONE, 36, bike, env);
    two(-jump.pitch / DEG, 6, 'nose down after 0.6 s');
    run(jump, NONE, 600, bike, env);
    assert.ok(jump.pitch / DEG >= -25.001, 'and no further than 25 degrees');
});

test('a slope and water cap the speed; the cap is reached by slowing, not by a jolt', () => {
    const up = at(20);
    V.step(up, GAS, bike, { slope: 0.75 }, DT);
    assert.ok(up.v < 20 && up.v > 19.5, 'one tick takes a little off');
    run(up, GAS, 600, bike, { slope: 0.75 });
    near(up.v, 15, 0.001, 'up the steepest ground walked');
    near(run(at(0), GAS, 3600, bike, { slope: 1.15 }).v, 23, 0.001, 'down it');
    near(run(at(20), GAS, 600, bike, { water: true }).v, 14, 0.001, 'wading: 70%');
    near(run(at(0), GAS, 3600, bike, { water: true, slope: 0.75 }).v, 10.5, 0.001, 'both');
});

test('a stick sets the steering as it comes; a key is ramped', () => {
    const stick = at(10);
    V.step(stick, { gas: 0, brake: 0, steer: 0.4, analog: true }, bike, null, DT);
    assert.equal(stick.steer, 0.4);
    V.step(stick, { gas: 0, brake: 0, steer: -3, analog: true }, bike, null, DT);
    assert.equal(stick.steer, -1, 'held to its range');
    const key = at(10);
    V.step(key, { gas: 0, brake: 0, steer: 1 }, bike, null, DT);
    near(key.steer, DT / 0.18, 1e-9, 'toward lock: 0.18 s');
    key.steer = 1;
    V.step(key, { gas: 0, brake: 0, steer: 0 }, bike, null, DT);
    near(1 - key.steer, DT / 0.10, 1e-9, 'back to the middle: 0.10 s');
    // Lock to lock: back to the middle the fast way, then out the slow way.
    const across = at(10); across.steer = 1;
    const ticks = until(across, { gas: 0, brake: 0, steer: -1 }, state => state.steer === -1);
    assert.ok(ticks * DT >= 0.28 - 1e-9 && ticks * DT <= 0.31, `lock to lock in 0.10 s and 0.18 s: ${ticks * DT}`);
});

test('the nose lifts 2 degrees under the throttle from slow, dips 4 under the brake, and follows the ground it is given', () => {
    const go = at(0);
    run(go, GAS, 2);
    two(go.pitch / DEG, 2 * (1 - go.v / 20), 'two ticks after W');
    assert.ok(go.pitch / DEG > 1.8);
    run(go, GAS, 600);
    assert.ok(Math.abs(go.pitch / DEG) < 0.05, 'at speed the nose is level');
    const stop = at(20);
    run(stop, BRAKE, 6);
    two(stop.pitch / DEG, -4, 'under the brake');
    run(stop, BRAKE, 120);
    assert.ok(Math.abs(stop.pitch) < 1e-9, 'stopped, it is level again');
    const hill = at(5);
    run(hill, NONE, 60, bike, { pitch: 10 * DEG });
    near(hill.pitch / DEG, 10, 0.01, 'the slope under the wheels');
    assert.ok(hill.squat === 0 && Math.abs(hill.tilt - hill.pitch) < 1e-12);
});

test('the throttle and the brake are held to a full press, and half a press is half the pull', () => {
    // A stick or a plugin handing more than a full press pulls no harder than one.
    const full = at(5), more = at(5);
    V.step(full, GAS, bike, null, DT);
    V.step(more, { gas: 5, brake: 0, steer: 0 }, bike, null, DT);
    assert.equal(more.v, full.v);
    assert.equal(more.squat, full.squat);
    const half = at(5);
    V.step(half, { gas: 0.5, brake: 0, steer: 0 }, bike, null, DT);
    near(half.v - 5, (full.v - 5) / 2, 1e-9, 'half the throttle, half the pull');
    // The brake: a full press takes the brake's own rate off, half a press half of it, more than a press no more.
    const hard = at(20), soft = at(20), over = at(20);
    V.step(hard, BRAKE, bike, null, DT);
    V.step(soft, { gas: 0, brake: 0.5, steer: 0 }, bike, null, DT);
    V.step(over, { gas: 0, brake: 3, steer: 0 }, bike, null, DT);
    near(20 - hard.v, 20 / 0.67 * DT, 1e-9, 'a full press');
    near(20 - soft.v, 20 / 0.67 * DT / 2, 1e-9, 'half a press');
    assert.equal(over.v, hard.v);
});

test('the nose moves no faster than a degree a tick under the throttle, and takes 0.08 s to follow the ground', () => {
    // From rest the throttle asks for 2 degrees of lift: the first tick gives one of them.
    const go = at(0);
    V.step(go, GAS, bike, null, DT);
    near(go.squat / DEG, 1, 1e-9, 'one degree in the first tick');
    near(go.pitch, go.squat, 1e-12, 'on level ground the pitch is the squat');
    // Under the brake from speed it asks for 4 down: one a tick again.
    const stop = at(20);
    V.step(stop, BRAKE, bike, null, DT);
    near(stop.squat / DEG, -1, 1e-9, 'one degree down in the first tick');
    run(stop, BRAKE, 3);
    near(stop.squat / DEG, -4, 1e-9, 'four ticks to the brake\'s dive');
    // The ground's pitch is eased, not copied: 19% of the way in one tick, 63% after 0.08 s.
    const hill = at(5), env = { pitch: 10 * DEG };
    V.step(hill, NONE, bike, env, DT);
    near(hill.tilt / DEG, 10 * (1 - Math.exp(-DT / 0.08)), 1e-9, 'the first tick');
    assert.ok(hill.tilt / DEG > 1.5 && hill.tilt / DEG < 2.5, `a fifth of the way: ${hill.tilt / DEG}`);
    const eased = at(5);
    for (let t = 0; t < 0.08 - 1e-9; t += DT) V.step(eased, NONE, bike, env, DT);
    assert.ok(eased.tilt / DEG > 5.5 && eased.tilt / DEG < 7.5, `about two thirds after 0.08 s: ${eased.tilt / DEG}`);
});

test('ground too steep to climb gives no top speed to pull toward: the speed stays a number', () => {
    // Rolling back down it with the throttle held: nothing divides by the cap of zero.
    const back = at(-2);
    run(back, GAS, 30, bike, { slope: 0 });
    assert.ok(Number.isFinite(back.v) && back.v <= 0 && back.v >= -3, `rolling back: ${back.v}`);
    for (const key of ['x', 'y', 'yaw', 'turn', 'go', 'rate', 'roll', 'pitch', 'squat', 'tilt']) assert.ok(Number.isFinite(back[key]), key);
    // At rest on it the throttle does nothing, and going forward onto it the speed falls to nothing.
    assert.equal(run(at(0), GAS, 30, bike, { slope: 0 }).v, 0);
    const onto = at(10);
    run(onto, GAS, 600, bike, { slope: 0 });
    assert.equal(onto.v, 0);
    // A slope that is not a number is level ground.
    assert.equal(run(at(0), GAS, 60, bike, { slope: NaN }).v, run(at(0), GAS, 60, bike, null).v);
});

test('without env.alone the step moves nothing: the turn and the travel are the caller\'s to apply', () => {
    const s = at(10); s.x = 4; s.y = 9; s.yaw = 1; s.travel = 2; s.steer = 1;
    V.step(s, { gas: 1, brake: 0, steer: 1 }, bike, null, DT);
    assert.deepEqual([s.x, s.y, s.yaw, s.travel], [4, 9, 1, 2]);
    assert.ok(s.turn > 0 && s.go > 0);
    near(s.go, s.v * DT, 1e-12, 'go is the speed times the tick');
    // With it, the same turn and travel are applied: north is -y, a turn to the right is clockwise.
    const t = at(10); t.steer = 1;
    V.step(t, { gas: 1, brake: 0, steer: 1 }, bike, ALONE, DT);
    near(t.yaw, t.turn, 1e-12, 'yaw');
    near(t.x, Math.sin(t.yaw) * t.go, 1e-9, 'x');
    near(t.y, -Math.cos(t.yaw) * t.go, 1e-9, 'y');
    near(t.travel, t.go, 1e-12, 'travel');
    const east = at(6, Math.PI / 2);
    run(east, NONE, 1);
    assert.ok(east.x > 0 && Math.abs(east.y) < 1e-9, 'yaw 90 degrees is east');
    // Reverse rolls the travel back.
    const back = at(-3);
    run(back, BRAKE, 60);
    near(back.travel, -3, 0.01, 'travel is signed');
});

test('a travel longer than 0.4 tile is taken in equal parts', () => {
    assert.equal(V.STEP_MAX, 0.4);
    const fast = V.typeOf({ kind: 'motorcycle', handling: { speed: 30, turnRate: 720, grip: 200 } });
    const whole = at(30), parts = at(30);
    whole.steer = 1; parts.steer = 1;
    V.step(whole, { gas: 0, brake: 0, steer: 1, analog: true }, fast, ALONE, DT);
    assert.ok(Math.abs(whole.go) > 0.4);
    // The same tick by hand, in two halves: half the turn, half the travel, twice.
    V.step(parts, { gas: 0, brake: 0, steer: 1, analog: true }, fast, null, DT);
    for (let i = 0; i < 2; i++) { parts.yaw += parts.turn / 2; parts.x += Math.sin(parts.yaw) * parts.go / 2; parts.y -= Math.cos(parts.yaw) * parts.go / 2; }
    near(whole.x, parts.x, 1e-9, 'x');
    near(whole.y, parts.y, 1e-9, 'y');
    near(whole.yaw, parts.yaw, 1e-12, 'yaw');
    // At the motorcycle's own top speed a tick is one part (0.33 tile).
    assert.ok(20 * DT < 0.4);
});

test('a kind that turns on the spot does, at its own rate, and a zero turning circle divides by nothing', () => {
    const tank = V.typeOf({ kind: 'tank' });
    const s = at(0);
    run(s, { gas: 0, brake: 0, steer: 1 }, 60 + 11, tank);
    near(s.yaw / DEG, 50 * (60 + 11) / 60 - 50 * 0.18 / 2, 0.02, 'turning where it stands at 50 degrees a second, after the ramp');
    const moving = at(9);
    run(moving, { gas: 1, brake: 0, steer: 1, analog: true }, 60, tank);
    for (const key of ['x', 'y', 'yaw', 'v', 'rate', 'turn', 'go', 'roll', 'pitch']) assert.ok(Number.isFinite(moving[key]), key);
    two(moving.rate / DEG, 50, 'at speed');
    assert.equal(moving.roll, 0, 'a kind with no lean shows none');
});

test('step creates no object, adds no field after the first tick and answers the state it was given', () => {
    // A three.js whose every constructor counts: the step touches none of them.
    let made = 0;
    const Counting = function() { made++; };
    const counted = load({ THREE: { Vector3: Counting, Quaternion: Counting, Matrix4: Counting, Euler: Counting, Box3: Counting } });
    const type = counted.typeOf({ kind: 'motorcycle' });
    const state = counted.newState(0), input = { gas: 1, brake: 0, steer: 1 }, env = { alone: true };
    assert.equal(counted.step(state, input, type, env, DT), state);
    const fields = Object.keys(state).sort().join();
    made = 0;
    for (let i = 0; i < 600; i++) counted.step(state, i % 90 < 45 ? input : NONE, type, i % 200 < 100 ? env : null, DT);
    assert.equal(made, 0);
    assert.equal(Object.keys(state).sort().join(), fields);
    assert.deepEqual(Object.keys(input), ['gas', 'brake', 'steer'], 'the input is read, never written');
    assert.deepEqual(Object.keys(env), ['alone']);
    // And nothing in its body can make one: no `new`, no object or array literal, no closure.
    const start = source.indexOf('    function step(state, input, type, env, dt) {');
    const body = source.slice(start + 1, source.indexOf('\n    }\n', start));
    assert.ok(start > 0 && body.length > 2000 && body.includes('state.go = go;'), 'the step was found');
    const code = body.split('\n').slice(1).map(line => line.replace(/\/\/.*$/, '')).join('\n');
    assert.doesNotMatch(code, /\bnew\b/);
    assert.doesNotMatch(code, /[=(,:?]\s*[\[{]/, 'no object or array literal');
    assert.doesNotMatch(code, /=>|\bfunction\b/, 'no closure');
    // A bare object is a state: a missing number reads 0.
    const bare = V.step({}, GAS, bike, ALONE, DT);
    for (const key of ['x', 'y', 'yaw', 'v', 'steer', 'pitch', 'roll', 'travel', 'rest', 'turn', 'go', 'rate']) assert.ok(Number.isFinite(bare[key]), key);
    // No input and no env at all: it coasts.
    assert.ok(V.step(at(5), null, bike, null, DT).v < 5);
});

test('the same inputs give the same state on every run', () => {
    const ride = () => {
        const s = at(0);
        let seed = 12345;
        const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const input = { gas: 0, brake: 0, steer: 0 }, env = { alone: true, air: false, water: false, slope: 1 };
        for (let i = 0; i < 3600; i++) {
            if (i % 20 === 0) {
                input.gas = random() < 0.7 ? 1 : 0; input.brake = !input.gas && random() < 0.5 ? 1 : 0;
                input.steer = [-1, 0, 0, 1][Math.floor(random() * 4)];
                env.air = random() < 0.1; env.water = random() < 0.1; env.slope = 0.75 + random() * 0.4;
            }
            V.step(s, input, bike, env, DT);
        }
        return JSON.stringify(s);
    };
    const first = ride();
    assert.equal(ride(), first);
    assert.equal(ride(), first);
    assert.ok(Object.values(JSON.parse(first)).every(Number.isFinite));
});

test('per tick it costs about a microsecond of the 60 the ride has', () => {
    const s = at(0), input = { gas: 1, brake: 0, steer: 1 };
    for (let i = 0; i < 20000; i++) V.step(s, input, bike, ALONE, DT);
    const start = process.hrtime.bigint();
    for (let i = 0; i < 200000; i++) V.step(s, input, bike, ALONE, DT);
    const each = Number(process.hrtime.bigint() - start) / 200000 / 1000;
    console.log(`    step: ${each.toFixed(3)} microseconds a tick`);
    // 0.8 on a fast desktop. The clock is a measure to read, not a rule: a machine running twenty suites at once
    // measured ten times that. What the step may not do (make an object, grow its state) is counted above.
    assert.ok(each < 200, `${each} microseconds a tick`);
});
