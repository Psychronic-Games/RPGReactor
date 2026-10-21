/* The rider on a vehicle: hips on the seat point, hands on the grips, feet on
 * the rests, the arms following the bars.
 *
 * A vehicle model says where its rider touches it (`model.json › vehicle`:
 * a seat point, a grip per hand, a rest per foot, each riding a part). This
 * file holds a humanoid model to those points:
 *
 *   board   once: the joints by rig name, the limbs measured at the rest
 *           pose, the forward lean the arms need (the torso turns at the
 *           hips), every scratch object.
 *   seat    each drawn frame, inside the placement: the rider's world
 *           transform is the vehicle's whole attitude with the Hips joint
 *           over the seat point. The rider is never a child of the vehicle.
 *   update  each drawn frame, after both models were animated: a closed-form
 *           two-bone reach per limb, the chest and the head. It is worked
 *           out only when what it depends on changed; otherwise the joint
 *           turns stored last time are written again. Under a motion that
 *           holds still (the Ride stance) it is worked out at five angles of
 *           the bars once, and steering blends between those: once with both
 *           feet up, once more for a stop with the foot down. At a stop the
 *           stand-side foot goes to the ground read at its own place.
 *   fit     the same arithmetic with no game: what the checker, the script
 *           tools and the Vehicles page print and fit a size with.
 *
 * Every joint is written through a slot (`base` what the motion gave, `out`
 * what was written), so the pose lies over the motion and never winds up.
 * Nothing is created after `board`.
 *
 * Frames. A rider's own frame is x to its left, y up, z ahead (the rig's
 * convention). A vehicle's model space is the model centered on x and z,
 * standing on y = 0, in the file's units; its front is the block's `forward`.
 */
(function(root) {
    "use strict";
    // An extension of Reactor3D (reactor_3d.js). Node alone takes the core
    // from require; the NW.js page and the editor find it on the global.
    const node = typeof process !== "undefined" && process.versions && process.versions.node
        && !process.versions.nw && typeof require === "function";
    const R = node ? require("./reactor_3d.js") : root.Reactor3D;
    if (!R) return;

    const DEG = Math.PI / 180;
    const clamp = (value, low, high) => value < low ? low : value > high ? high : value;
    const smooth = t => t * t * (3 - 2 * t);
    const finite = value => typeof value === "number" && value === value && value !== Infinity && value !== -Infinity;

    const Rider = {
        /** The Hips joint sits this share of the rider's height over the seat point. */
        HIPS_OVER: 0.06,
        /** A body that cannot sit stands with this share of its height under the seat point. */
        PERCH: 0.47,
        /** A shoulder is within this share of the arm (shoulder to palm) of its grip: bars centered, and at full lock. */
        REACH: 0.92,
        REACH_LOCK: 0.97,
        /** The torso never leans further forward than this for reach, in degrees; a fitted size asks for no more than FIT_LEAN. */
        LEAN_MAX: 50,
        FIT_LEAN: 45,
        /** The Ride stance's own forward lean, in degrees: where the fit starts when no motion is playing. */
        STANCE_LEAN: 30,
        /**
         * How a forward lean is shared by the joints that carry the torso, lowest first: the hips, then the spine's.
         * The hips take all of it (shared with the spine, the Demo hero's hands fall short of a bike over 2.6 tiles);
         * a row keeps a place for each joint the chest's turn with the bars is laid over.
         */
        LEAN_SHARE: [[1], [1, 0], [1, 0, 0]],
        /** The head tips back up by this share of the torso's lean. */
        HEAD_BACK: 0.8,
        /** The chest turns by this share of the bars' angle; the head counters this share of the vehicle's lean. */
        CHEST_TURN: 0.3,
        HEAD_LEVEL: 0.5,
        /** The head looks this far into a turn (degrees) at LEAN_FULL degrees of lean. */
        HEAD_LOOK: 25,
        LEAN_FULL: 40,
        /** A hop's arc rises this many tiles; the limbs close on their points from tick HOLD_FROM of a 14-tick hop. */
        HOP_HEIGHT: 0.5,
        HOLD_FROM: 8,
        /** The foot comes down this far out from the seat (tiles), with the vehicle tipped this far onto it (degrees). */
        FOOT_OUT: 0.55,
        FOOT_TIP: 5,
        /** Ground this far over the vehicle's own (tiles: a ledge, a wall's top) is no place for the foot. */
        FOOT_RISE: 0.3,
        /**
         * The ground under the foot is read again once its place has moved this far (tiles), and the leg is worked
         * out again once that ground stands this much higher or lower against the vehicle's own: a bike walked
         * round on a slope asks for a few solves a second, and the sole stays within a hundredth of a tile of the ground.
         */
        FOOT_MOVED: 0.01,
        FOOT_STEP: 1 / 128,
        /** The foot comes down, and goes back up, by this share a tick of the game's clock. */
        FOOT_EASE: 0.1,
        /** The palm lies this far off the grip's middle line (tiles): on the tube, not in it. */
        PALM_OVER: 0.015,
        /** The bars' angle is followed to this many degrees. */
        BAR_STEP: 0.25,
        /** Elbows point down and this much out; knees ahead, this much out and this much up. */
        ELBOW_OUT: 0.35,
        KNEE_OUT: 0.3,
        KNEE_UP: 0.2,
        /**
         * The bars' angles the limbs are worked out at once the motion under them holds still (shares of full lock):
         * between two of them the stored turns are blended, and nothing is worked out while the rider steers.
         */
        SAMPLES: [-1, -0.5, 0, 0.5, 1],
        /**
         * Frames the motion must hold still before the samples are made (and, for the samples of a stop, frames
         * the foot, the ground under it and the vehicle's attitude must have stayed as they are), and how far
         * (degrees) its lean may drift before the reach is looked for again.
         */
        STILL: 2,
        LEAN_DRIFT: 0.25,
        /**
         * A joint the motion hands back this near what it gave before (the differences of the four parts of its
         * turn, summed) has not moved: a motion that holds still is worked out again each frame to its last digits.
         */
        SAME: 1e-6,
        /** How many times the limbs were worked out (a test reads it; a repeated frame must not raise it). */
        solves: 0
    };

    const SIDES = ["Left", "Right"];
    const NEEDED = ["Hips", "LeftUpperArm", "LeftLowerArm", "LeftHand", "RightUpperArm", "RightLowerArm", "RightHand",
        "LeftUpperLeg", "LeftLowerLeg", "LeftFoot", "RightUpperLeg", "RightLowerLeg", "RightFoot"];
    const NAMED = new Set(NEEDED.concat(["Spine", "Chest", "Neck", "Head"]));

    //-------------------------------------------------------------------------
    // The block's own arithmetic (model space, plain numbers).

    const AXES = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };
    const unit3 = (v, fallback) => {
        const x = Number(v && v[0]) || 0, y = Number(v && v[1]) || 0, z = Number(v && v[2]) || 0, length = Math.hypot(x, y, z);
        return length > 1e-9 ? [x / length, y / length, z / length] : fallback;
    };
    const frames = new WeakMap();
    /** A block's front, left (up x front) and up, as unit vectors in model space; kept per block. */
    function frameOf(block) {
        if (!block || typeof block !== "object") return FRAME_Z;
        let frame = frames.get(block);
        if (frame) return frame;
        const forward = Array.isArray(block.f) ? block.f : typeof block.forward === "string" ? AXES[block.forward] : block.forward;
        const f = unit3(forward, [0, 0, 1]);
        const l = Array.isArray(block.left) ? unit3(block.left, null) : null;
        // left = up x front, so nothing on the model has to face +Z.
        frame = { f, l: l || unit3([f[2], 0, -f[0]], [1, 0, 0]), u: [0, 1, 0] };
        frames.set(block, frame);
        return frame;
    }
    const FRAME_Z = { f: [0, 0, 1], l: [1, 0, 0], u: [0, 1, 0] };

    /**
     * The control a rider point moves with: the one whose input its `follows` names, else the one whose part it
     * rides; a hand follows the steering unless it says otherwise.
     */
    function controlOf(block, point, name) {
        const controls = block && Array.isArray(block.controls) ? block.controls : null;
        if (!controls || !controls.length || !point) return null;
        const follows = typeof point.follows === "string" ? point.follows : "";
        let byInput = null, byPart = null, steering = null;
        for (let i = 0; i < controls.length; i++) {
            const control = controls[i];
            if (!control) continue;
            if (follows && !byInput && control.input === follows) byInput = control;
            if (point.part && !byPart && control.part === point.part) byPart = control;
            if (!steering && control.input === "steer") steering = control;
        }
        if (follows) return byInput;
        return byPart || (name === "handL" || name === "handR" ? steering : null);
    }

    const pivots = new WeakMap();
    /** A point on a control's line, in model space: its own `at`, else the middle of the two hands it carries. */
    function controlAt(block, control) {
        if (Array.isArray(control.at) && control.at.length >= 3) return control.at;
        let at = pivots.get(control);
        if (at) return at;
        const seat = block.seats && block.seats[0], l = seat && seat.handL && seat.handL.at, r = seat && seat.handR && seat.handR.at;
        at = l && r ? [(l[0] + r[0]) / 2, (l[1] + r[1]) / 2, (l[2] + r[2]) / 2] : l || r || [0, 0, 0];
        pivots.set(control, at);
        return at;
    }

    const axes = new WeakMap();
    /** A control's line as a unit vector pointing up, so "to the right" turns every control the same way. */
    function controlAxis(control) {
        let axis = axes.get(control);
        if (axis) return axis;
        axis = unit3(control.axis, [0, 1, 0]);
        if (axis[1] < 0) axis = [-axis[0], -axis[1], -axis[2]];
        axes.set(control, axis);
        return axis;
    }

    /** Turns a point (or, with no `at`, a direction) about a line by radians, right-handed. Writes x, y, z of `out`. */
    function turnAbout(out, at, axis, radians) {
        const px = out.x - (at ? at[0] : 0), py = out.y - (at ? at[1] : 0), pz = out.z - (at ? at[2] : 0);
        const c = Math.cos(radians), s = Math.sin(radians), k = (axis[0] * px + axis[1] * py + axis[2] * pz) * (1 - c);
        out.x = px * c + (axis[1] * pz - axis[2] * py) * s + axis[0] * k + (at ? at[0] : 0);
        out.y = py * c + (axis[2] * px - axis[0] * pz) * s + axis[1] * k + (at ? at[1] : 0);
        out.z = pz * c + (axis[0] * py - axis[1] * px) * s + axis[2] * k + (at ? at[2] : 0);
        return out;
    }

    /**
     * A rider point of a block in MODEL space at a drawn steer (-1 full left to 1 full right): `name` is `seat`,
     * `handL`, `handR`, `footL` or `footR`. A point that follows a control is turned about the control's line by
     * the drawn angle (steering right swings the left grip ahead). `out` takes x, y, z. Null when the block has
     * no such point.
     */
    Rider.point = function(block, seatIndex, name, steer, out) {
        const seat = block && Array.isArray(block.seats) ? block.seats[seatIndex || 0] : null, point = seat ? seat[name] : null;
        if (!point || !Array.isArray(point.at) || point.at.length < 3 || !out) return null;
        out.x = Number(point.at[0]) || 0; out.y = Number(point.at[1]) || 0; out.z = Number(point.at[2]) || 0;
        if (steer) {
            const control = controlOf(block, point, name);
            if (control) turnAbout(out, controlAt(block, control), controlAxis(control), -steer * (Number(control.degrees) || 0) * DEG);
        }
        return out;
    };

    //-------------------------------------------------------------------------
    // The joints.

    /** The joints of a model by rig name, as the ragdoll finds them: from a holder's binding, else from the nodes themselves. */
    Rider.joints = function(holder) {
        const object = holder && holder.isObject3D ? holder : holder && holder.object, binding = holder && !holder.isObject3D ? holder.binding : null;
        if (!object) return null;
        const table = {};
        if (binding && binding.meshes) {
            for (const entry of binding.meshes) for (const part of entry.parts) if (NAMED.has(part.name) && !table[part.name] && R.isRigJoint && R.isRigJoint(entry.mesh)) table[part.name] = entry.mesh;
        } else {
            object.traverse(nodeIn => {
                const parts = nodeIn.userData && nodeIn.userData.parts, name = parts && parts[0] && parts[0].name;
                if (name && NAMED.has(name) && !table[name] && (nodeIn.isBone || (nodeIn.userData && nodeIn.userData.__reactorClipBone))) table[name] = nodeIn;
            });
        }
        return table;
    };

    /** Whether a model has the joints a seated rider is held by: hips, and each side's arm, hand, leg and foot. */
    Rider.canSit = function(holder) {
        if (typeof THREE === "undefined") return false;
        const table = Rider.joints(holder);
        if (!table) return false;
        for (const name of NEEDED) if (!table[name]) return false;
        return true;
    };

    /** The scratch a two-bone reach works in. */
    Rider.scratch = function() {
        const T = THREE;
        return { S: new T.Vector3(), E: new T.Vector3(), H: new T.Vector3(), dir: new T.Vector3(), pole: new T.Vector3(), elbow: new T.Vector3(),
            goal: new T.Vector3(), a: new T.Vector3(), b: new T.Vector3(), t1: new T.Vector3(), t2: new T.Vector3(),
            qU: new T.Quaternion(), qL: new T.Quaternion(), qP: new T.Quaternion(), q: new T.Quaternion(), endParent: new T.Quaternion(), share: 0 };
    };

    /** A joint turned by a turn given in the world, on top of the pose it has; `parent` is its parent's world turn now. */
    function turnJoint(joint, turn, parent, q) {
        joint.quaternion.premultiply(q.copy(parent).invert().multiply(turn).multiply(parent));
    }

    /**
     * A two-bone reach in closed form: `upper` and `lower` turn so `end` (the wrist, the ankle) lands on `target`,
     * the middle joint off the line toward `pole`. Reads the world matrices of the three joints and their parents
     * as they are (the caller keeps them current) and writes only the two joints' own turns; afterwards
     * `scratch.endParent` is the world turn of `end`'s parent, `scratch.elbow` where the middle joint is and
     * `scratch.share` the distance asked for as a share of the limb. Answers false when the target lies farther
     * than the limb (which is then straight along the line to it) or nearer than it folds. Creates nothing.
     */
    Rider.reachLimb = function(upper, lower, end, target, pole, scratch) {
        const s = scratch;
        if (!upper || !lower || !end || !target || !s || !upper.parent || !lower.parent || !end.parent) return false;
        const S = s.S.setFromMatrixPosition(upper.matrixWorld), E = s.E.setFromMatrixPosition(lower.matrixWorld), H = s.H.setFromMatrixPosition(end.matrixWorld);
        const a = S.distanceTo(E), b = E.distanceTo(H), whole = a + b;
        s.share = 0;
        if (!(a > 1e-6) || !(b > 1e-6)) return false;
        const dir = s.dir.copy(target).sub(S), asked = dir.length();
        if (!(asked > 1e-7)) return false;
        dir.multiplyScalar(1 / asked);
        s.share = asked / whole;
        const far = whole * 0.9999, near = Math.abs(a - b) + whole * 0.0001;
        const reached = asked <= far && asked >= near, d = clamp(asked, near, far);
        // The middle joint's side of the line: the pole, squared to the line; else where the limb already bends.
        const p = s.pole.copy(pole);
        p.addScaledVector(dir, -p.dot(dir));
        if (p.lengthSq() < 1e-10) { p.copy(E).sub(S); p.addScaledVector(dir, -p.dot(dir)); }
        if (p.lengthSq() < 1e-10) { p.set(dir.y, dir.z, dir.x); p.addScaledVector(dir, -p.dot(dir)); }
        p.normalize();
        const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
        const elbow = s.elbow.copy(S).addScaledVector(dir, a * cosA).addScaledVector(p, a * sinA);
        s.a.copy(E).sub(S).normalize(); s.b.copy(elbow).sub(S).normalize();
        s.qU.setFromUnitVectors(s.a, s.b);
        upper.parent.matrixWorld.decompose(s.t1, s.qP, s.t2);
        turnJoint(upper, s.qU, s.qP, s.q);
        // Where the end joint is once the upper has turned, and the lower's turn from there to the target.
        s.a.copy(H).sub(S).applyQuaternion(s.qU).add(S).sub(elbow).normalize();
        s.goal.copy(S).addScaledVector(dir, d);
        s.b.copy(s.goal).sub(elbow).normalize();
        s.qL.setFromUnitVectors(s.a, s.b);
        lower.parent.matrixWorld.decompose(s.t1, s.qP, s.t2);
        s.qP.premultiply(s.qU);
        turnJoint(lower, s.qL, s.qP, s.q);
        end.parent.matrixWorld.decompose(s.t1, s.endParent, s.t2);
        s.endParent.premultiply(s.qU).premultiply(s.qL);
        return reached;
    };

    //-------------------------------------------------------------------------
    // Measuring a rider at its rest pose (once, at boarding).

    let W = null;
    /** Scratch for everything this file works out; made the first time a rider boards. */
    function work() {
        if (W) return W;
        const T = THREE, v = () => new T.Vector3(), q = () => new T.Quaternion();
        W = { limb: Rider.scratch(), v0: v(), v1: v(), v2: v(), v3: v(), v4: v(), v5: v(), v6: v(), L: v(), U: v(), F: v(), p0: v(), s0: v(), p1: v(), s1: v(),
            grip: [v(), v()], tube: [v(), v()], rest: [v(), v()], gm: v(), ankle: v(), hip: v(), ball: v(), land: v(), flatL: v(), flatF: v(),
            q0: q(), q1: q(), q2: q(), q3: q(), qObj: q(), qVeh: q(), qSeat: q(), frame: q(), frameInv: q(), turn: q(), half: q(), qFoot: q(), qHand: q(), qFlat: q(),
            m0: new T.Matrix4(), vInv: new T.Matrix4(), dummy: new T.Object3D() };
        return W;
    }

    /** A model's box as the placement reads it. */
    const extentOf = object => (object && object.userData && object.userData.glbSize) || { x: 1, y: 1, z: 1 };

    /** The turn a model's own art correction gives it when it faces south (dir8 2), and that turn's yaw. */
    function baseTurnOf(character, holder, out) {
        const w = work(), dummy = w.dummy;
        dummy.rotation.set(0, 0, 0);
        let spec = holder && holder.riderSpec ? holder.riderSpec : null;
        if (!spec && character && typeof R.characterModelSpec === "function" && typeof character.isTransparent === "function") {
            try { spec = R.characterModelSpec(character); } catch (error) { spec = null; }
        }
        if (spec && typeof R.applyEventModelPose === "function") R.applyEventModelPose(dummy, spec, 2);
        out.copy(dummy.quaternion);
        return dummy.rotation.y;
    }

    /**
     * Measures a rider at the rest pose in its own frame, in tiles: the joints, the limbs, the palms and the soles.
     * The bound joints are put at rest for the measure and given back.
     */
    function measure(state, holder, character) {
        const T = THREE, w = work(), object = state.object, joints = state.joints;
        const binding = holder && holder.binding, saved = [];
        if (binding && binding.meshes) {
            for (const entry of binding.meshes) {
                saved.push(entry.mesh, entry.mesh.quaternion.clone(), entry.mesh.position.clone());
                entry.mesh.quaternion.copy(entry.baseQuaternion); entry.mesh.position.copy(entry.basePosition);
            }
            if (binding.root) { saved.push(binding.root, binding.root.quaternion.clone(), binding.root.position.clone()); binding.root.quaternion.identity(); binding.root.position.set(0, 0, 0); }
        }
        object.updateMatrixWorld(true);
        state.baseYaw = baseTurnOf(character, holder, state.baseTurn);
        state.baseTurnInv.copy(state.baseTurn).invert();
        state.leftLocal.set(1, 0, 0).applyQuaternion(state.baseTurnInv);
        const inverse = new T.Matrix4().copy(object.matrixWorld).invert(), objectQ = new T.Quaternion(), tp = new T.Vector3(), ts = new T.Vector3();
        object.matrixWorld.decompose(tp, objectQ, ts);
        // A world place in the rider's own frame, in tiles.
        const own = (world, out) => out.copy(world).applyMatrix4(inverse).multiply(object.scale).applyQuaternion(state.baseTurn);
        const place = name => joints[name] ? own(new T.Vector3().setFromMatrixPosition(joints[name].matrixWorld), new T.Vector3()) : null;
        // A joint's world turn at rest, in the rider's own frame.
        const turnOf = nodeIn => {
            const q = new T.Quaternion();
            nodeIn.matrixWorld.decompose(tp, q, ts);
            return q.premultiply(new T.Quaternion().copy(objectQ).invert()).premultiply(state.baseTurn);
        };
        const extent = extentOf(object);
        state.height = Math.max(0.1, extent.y * Math.abs(object.scale.y));
        const m = state.measure = { height: state.height, hips: place("Hips").toArray(), torso: [], arms: [], legs: [], head: null };
        // The torso's two joints, the lower first (a mapped file skeleton may name them the other way up).
        const torso = [joints.Spine, joints.Chest].filter(Boolean);
        const under = (a, b) => { for (let n = a.parent; n; n = n.parent) if (n === b) return true; return false; };
        if (torso.length === 2 && under(torso[0], torso[1])) torso.reverse();
        state.torso = torso;
        for (const joint of torso) m.torso.push(own(new T.Vector3().setFromMatrixPosition(joint.matrixWorld), new T.Vector3()).toArray());
        // What a forward lean turns about, lowest first: the hips, then the torso's joints.
        m.pivots = [m.hips].concat(m.torso);
        state.leaners = [joints.Hips].concat(torso);
        state.neck = joints.Neck || null;
        state.head = joints.Head || joints.Neck || null;
        if (state.neck === state.head) state.neck = null;
        if (state.head) { state.headRest.copy(turnOf(state.head)); state.headLocal.copy(state.head.quaternion); m.head = place(joints.Head ? "Head" : "Neck").toArray(); }
        state.arms.length = 0; state.legs.length = 0;
        for (const side of SIDES) {
            const sign = side === "Left" ? 1 : -1;
            const upper = joints[side + "UpperArm"], lower = joints[side + "LowerArm"], hand = joints[side + "Hand"];
            const S = place(side + "UpperArm"), E = place(side + "LowerArm"), H = place(side + "Hand");
            const grip = R._handGrips && R._handGrips.get ? R._handGrips.get(hand) : null, layout = grip ? grip.layout : null;
            const palmLocal = new T.Vector3(), basis = new T.Quaternion();
            let oriented = false;
            const raw = (layout && layout.palm) || (hand.userData && hand.userData.__reactorPalm) || null;
            if (raw) palmLocal.fromArray(raw);
            if (layout && layout.along && layout.across) {
                // The palm's own frame in the hand joint: along the hand, across the knuckles, and their cross.
                const along = new T.Vector3().fromArray(layout.along).normalize(), across = new T.Vector3().fromArray(layout.across);
                across.addScaledVector(along, -across.dot(along));
                if (across.lengthSq() > 1e-10) {
                    across.normalize();
                    basis.setFromRotationMatrix(new T.Matrix4().makeBasis(along, across, new T.Vector3().crossVectors(along, across))).invert();
                    oriented = true;
                }
            }
            const handScale = new T.Vector3().setFromMatrixScale(hand.matrixWorld).x || 1;
            const palm = palmLocal.length() * handScale;
            const arm = { side, sign, upper, lower, hand, grip, oriented, palmLocal, palmBasis: basis, handScale, upperLength: S.distanceTo(E), foreLength: E.distanceTo(H), palm,
                name: side === "Left" ? "handL" : "handR", point: null, reached: true, share: 0, has: false,
                slots: [] };
            arm.length = arm.upperLength + arm.foreLength + palm;
            state.arms.push(arm);
            m.arms.push({ shoulder: S.toArray(), upper: arm.upperLength, fore: arm.foreLength, palm, length: arm.length });

            const upperLeg = joints[side + "UpperLeg"], lowerLeg = joints[side + "LowerLeg"], foot = joints[side + "Foot"];
            const hip = place(side + "UpperLeg"), knee = place(side + "LowerLeg"), ankle = place(side + "Foot");
            // The ball of the foot: a toe joint under the ankle when the file has one, else a way ahead of it.
            let toe = null;
            for (const child of foot.children) if (!toe && (child.isBone || (child.userData && child.userData.__reactorClipBone)) && !(child.userData && child.userData.__reactorFinger)) toe = child;
            const ball = toe ? own(new T.Vector3().setFromMatrixPosition(toe.matrixWorld), new T.Vector3()) : new T.Vector3(ankle.x, 0, ankle.z + Math.max(0.05, ankle.y) * 0.7);
            const contact = new T.Vector3(ball.x, 0, ball.z);
            // The same point in the foot joint's own frame (what a test reads back in the world).
            const contactWorld = contact.clone().applyQuaternion(state.baseTurnInv).divide(object.scale).applyMatrix4(object.matrixWorld);
            const soleLocal = foot.worldToLocal(contactWorld.clone());
            const leg = { side, sign, upper: upperLeg, lower: lowerLeg, foot, thigh: hip.distanceTo(knee), shin: knee.distanceTo(ankle), ankleHeight: Math.max(0, ankle.y),
                sole: contact.clone().sub(ankle), soleLocal, footRest: turnOf(foot), name: side === "Left" ? "footL" : "footR", point: null, reached: true, share: 0, has: false,
                slots: [] };
            leg.ball = leg.sole.length();
            leg.length = leg.thigh + leg.shin;
            state.legs.push(leg);
            m.legs.push({ hip: hip.toArray(), thigh: leg.thigh, shin: leg.shin, ankleHeight: leg.ankleHeight, sole: leg.sole.toArray(), ball: leg.ball, length: leg.length });
        }
        for (let i = 0; i < saved.length; i += 3) { saved[i].quaternion.copy(saved[i + 1]); saved[i].position.copy(saved[i + 2]); }
        object.updateMatrixWorld(true);
        return m;
    }

    //-------------------------------------------------------------------------
    // The fit arithmetic: a measured rider against a block at a size, in the seat's frame (x left, y up, z ahead; tiles).

    /** A model-space point as a place in the seat's frame at a scale (tiles per model unit). */
    function toSeat(block, at, scale, out) {
        const frame = frameOf(block), seat = block.seats[0].seat.at;
        const x = (at.x - seat[0]) * scale, y = (at.y - seat[1]) * scale, z = (at.z - seat[2]) * scale;
        out[0] = x * frame.l[0] + y * frame.l[1] + z * frame.l[2];
        out[1] = x * frame.u[0] + y * frame.u[1] + z * frame.u[2];
        out[2] = x * frame.f[0] + y * frame.f[1] + z * frame.f[2];
        return out;
    }

    /**
     * A point the torso carries, after the chest has turned by `yaw` radians about the highest pivot's upright
     * (toward the rider's left is positive) and the torso has leaned forward by `lean` radians, shared by the
     * pivots (lowest first, each its share). The first `levels` pivots carry the point.
     */
    function leanPoint(at, pivots, levels, lean, yaw, out) {
        let x = at[0], y = at[1], z = at[2];
        if (yaw && levels === pivots.length && levels > 1) {
            const pivot = pivots[levels - 1], c = Math.cos(yaw), s = Math.sin(yaw), px = x - pivot[0], pz = z - pivot[2];
            x = pivot[0] + px * c + pz * s;
            z = pivot[2] - px * s + pz * c;
        }
        if (lean) {
            const shares = Rider.LEAN_SHARE[pivots.length - 1];
            for (let i = levels - 1; i >= 0; i--) {
                const pivot = pivots[i], part = lean * shares[i], c = Math.cos(part), s = Math.sin(part), py = y - pivot[1], pz = z - pivot[2];
                y = pivot[1] + py * c - pz * s;
                z = pivot[2] + py * s + pz * c;
            }
        }
        out[0] = x; out[1] = y; out[2] = z;
        return out;
    }

    /** A rest-pose place of the rider in the seat's frame, the torso leaned forward by radians; `levels` pivots carry it (the hips alone carry a leg). */
    function seated(m, at, lean, levels, yaw, out) {
        leanPoint(at, m.pivots, levels, lean, yaw, out);
        out[0] -= m.hips[0]; out[1] += Rider.HIPS_OVER * m.height - m.hips[1]; out[2] -= m.hips[2];
        return out;
    }

    const FIT = { a: [0, 0, 0], b: [0, 0, 0], p: { x: 0, y: 0, z: 0 } };
    const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    /** The chest's turn (radians, to the rider's left positive) with the bars at a steer: CHEST_TURN of their angle, toward the hand that goes ahead. */
    function chestYaw(block, steer) {
        if (!steer || !block || !Array.isArray(block.controls)) return 0;
        for (const control of block.controls) if (control && control.input === "steer") return -steer * (Number(control.degrees) || 0) * DEG * Rider.CHEST_TURN;
        return 0;
    }

    /** How far a shoulder is from its grip, as a share of the arm, with the torso at a lean and the bars at a steer; -1 with no grip. */
    function armShare(m, index, block, scale, lean, steer) {
        const at = Rider.point(block, 0, index === 0 ? "handL" : "handR", steer, FIT.p);
        if (!at) return -1;
        return gap(seated(m, m.arms[index].shoulder, lean, m.pivots.length, chestYaw(block, steer), FIT.a), toSeat(block, at, scale, FIT.b)) / m.arms[index].length;
    }

    /** The least lean (degrees, from `from` up to `most`) at which both shoulders are within reach, bars centered and at both locks. */
    function reserveLean(m, block, scale, from, most) {
        let lean = from;
        const ok = degrees => {
            const radians = degrees * DEG;
            for (let i = 0; i < 2; i++) {
                const share = armShare(m, i, block, scale, radians, 0);
                if (share < 0) continue;
                if (share > Rider.REACH || armShare(m, i, block, scale, radians, 1) > Rider.REACH_LOCK || armShare(m, i, block, scale, radians, -1) > Rider.REACH_LOCK) return false;
            }
            return true;
        };
        for (; lean < most; lean += 1) if (ok(lean)) return { lean, limited: false };
        return { lean: most, limited: !ok(most) };
    }

    /**
     * Whether the stand-side foot reaches level ground at a stop, the vehicle tipped onto it and the torso leaned
     * forward by `lean` radians (the hips carry the leg's joint): the ball of the foot on the ground FOOT_OUT out
     * from the seat, the leg at most straight. Answers how far short it is (0 when it reaches).
     */
    function footShort(m, block, scale, side, lean) {
        const leg = m.legs[side === "right" ? 1 : 0], sign = side === "right" ? -1 : 1, tip = Rider.FOOT_TIP * DEG * sign;
        const seatHeight = block.seats[0].seat.at[1] * scale;
        const hip = seated(m, leg.hip, lean || 0, 1, 0, FIT.a);
        // The seat's frame tips about the line the tires stand on; the hip goes with it.
        const hx = hip[0], hy = hip[1] + seatHeight, c = Math.cos(tip), s = Math.sin(tip);
        const x = hx * c + hy * s, y = -hx * s + hy * c, seatX = seatHeight * s;
        const reach = Math.hypot(x - (seatX + sign * Rider.FOOT_OUT), y, 0);
        return Math.max(0, reach - (leg.length * 0.998 + leg.ball));
    }

    const boxSpan = thing => {
        if (!thing) return 0;
        const size = thing.userData && thing.userData.glbSize ? thing.userData.glbSize : thing.glbSize || null;
        if (size) return Math.max(size.x, size.y, size.z);
        if (Array.isArray(thing.size)) return Math.max(thing.size[0], thing.size[1], thing.size[2]);
        if (Array.isArray(thing.min) && Array.isArray(thing.max)) return Math.max(thing.max[0] - thing.min[0], thing.max[1] - thing.min[1], thing.max[2] - thing.min[2]);
        return 0;
    };

    /** A rider measured for the fit: from a holder or a built instance (at rest), kept per object. */
    const measured = new WeakMap();
    function measureOf(rider) {
        if (typeof THREE === "undefined" || !rider) return null;
        const object = rider.isObject3D ? rider : rider.object;
        if (!object) return null;
        if (measured.has(object)) return measured.get(object);
        let m = null;
        const holder = rider.isObject3D ? { object, binding: null } : rider;
        if (Rider.canSit(holder)) {
            const state = newState(object, Rider.joints(holder));
            m = measure(state, holder, null);
        }
        measured.set(object, m);
        return m;
    }

    /** The nearest the vehicle's surface comes to a model-space point, in model units; null with no mesh to read. */
    function surfaceGap(vehicle, at) {
        if (typeof THREE === "undefined" || !vehicle || !vehicle.isObject3D) return null;
        const T = THREE, inverse = new T.Matrix4(), rel = new T.Matrix4(), p = new T.Vector3(), scaleOf = new T.Vector3();
        vehicle.updateMatrixWorld(true);
        const back = new T.Matrix4().copy(vehicle.matrixWorld).invert();
        let best = Infinity;
        vehicle.traverse(mesh => {
            const position = mesh.isMesh && mesh.geometry && mesh.geometry.getAttribute ? mesh.geometry.getAttribute("position") : null;
            if (!position || mesh.isSkinnedMesh) return;
            rel.multiplyMatrices(back, mesh.matrixWorld);
            const units = scaleOf.setFromMatrixScale(rel).x || 1;
            p.set(at[0], at[1], at[2]).applyMatrix4(inverse.copy(rel).invert());
            const sphere = mesh.geometry.boundingSphere || (mesh.geometry.computeBoundingSphere(), mesh.geometry.boundingSphere);
            if (sphere && (p.distanceTo(sphere.center) - sphere.radius) * units >= best) return;
            const array = position.array, stride = position.isInterleavedBufferAttribute ? position.data.stride : 3, offset = position.isInterleavedBufferAttribute ? position.offset : 0;
            const index = mesh.geometry.index ? mesh.geometry.index.array : null, count = index ? index.length : position.count;
            const range = mesh.geometry.drawRange || { start: 0, count: Infinity }, from = Math.max(0, range.start || 0), to = Math.min(count, from + (range.count === undefined ? Infinity : range.count));
            const limit = best / units;
            let least = limit * limit;
            const px = p.x, py = p.y, pz = p.z;
            for (let i = from - from % 3; i + 2 < to; i += 3) {
                const ia = (index ? index[i] : i) * stride + offset, ib = (index ? index[i + 1] : i + 1) * stride + offset, ic = (index ? index[i + 2] : i + 2) * stride + offset;
                const d = pointTriangle(px, py, pz, array[ia], array[ia + 1], array[ia + 2], array[ib], array[ib + 1], array[ib + 2], array[ic], array[ic + 1], array[ic + 2]);
                if (d < least) least = d;
            }
            const found = Math.sqrt(least) * units;
            if (found < best) best = found;
        });
        return best === Infinity ? null : best;
    }

    /** The squared distance from a point to a triangle (the nearest of its face, edges and corners). */
    function pointTriangle(px, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz) {
        const abx = bx - ax, aby = by - ay, abz = bz - az, acx = cx - ax, acy = cy - ay, acz = cz - az;
        const apx = px - ax, apy = py - ay, apz = pz - az;
        const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
        let qx, qy, qz;
        if (d1 <= 0 && d2 <= 0) { qx = ax; qy = ay; qz = az; }
        else {
            const bpx = px - bx, bpy = py - by, bpz = pz - bz;
            const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
            if (d3 >= 0 && d4 <= d3) { qx = bx; qy = by; qz = bz; }
            else {
                const vc = d1 * d4 - d3 * d2;
                if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v; }
                else {
                    const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
                    const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
                    if (d6 >= 0 && d5 <= d6) { qx = cx; qy = cy; qz = cz; }
                    else {
                        const vb = d5 * d2 - d1 * d6;
                        if (vb <= 0 && d2 >= 0 && d6 <= 0) { const t = d2 / (d2 - d6); qx = ax + acx * t; qy = ay + acy * t; qz = az + acz * t; }
                        else {
                            const va = d3 * d6 - d5 * d4;
                            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
                                const t = (d4 - d3) / ((d4 - d3) + (d5 - d6));
                                qx = bx + (cx - bx) * t; qy = by + (cy - by) * t; qz = bz + (cz - bz) * t;
                            } else {
                                const sum = va + vb + vc, v = sum ? vb / sum : 0, t = sum ? vc / sum : 0;
                                qx = ax + abx * v + acx * t; qy = ay + aby * v + acy * t; qz = az + abz * v + acz * t;
                            }
                        }
                    }
                }
            }
        }
        const dx = px - qx, dy = py - qy, dz = pz - qz;
        return dx * dx + dy * dy + dz * dz;
    }

    const round3 = value => Math.round(value * 1000) / 1000;

    /** The fit of one measured rider on a block at a scale; `most` is the lean allowed, `surface` a vehicle to measure against. */
    function fitOf(m, block, scale, size, most, surface) {
        const report = { size, seated: !!m, lean: 0, leanLimited: false, hips: { over: 0 }, points: {}, foot: { side: "left", reachesGround: false, short: 0 }, ok: false };
        const seat = block && Array.isArray(block.seats) && block.seats[0] && block.seats[0].seat;
        if (!m || !seat || !Array.isArray(seat.at) || seat.at.length < 3) { report.seated = !!m && !!seat; return report; }
        const frame = frameOf(block), reserve = reserveLean(m, block, scale, Rider.STANCE_LEAN, most), lean = reserve.lean * DEG;
        report.lean = reserve.lean; report.leanLimited = reserve.limited;
        report.hips.over = round3(Rider.HIPS_OVER * m.height);
        const near = at => { const d = surface ? surfaceGap(surface, at) : null; return d === null ? null : round3(d * scale); };
        const model = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [0, 1, 2].map(i => round3((v[0] * frame.l[i] + v[1] * frame.u[i] + v[2] * frame.f[i]) / l)); };
        const seatPoint = block.seats[0];
        report.points.seat = { at: seat.at.slice(0, 3), part: seat.part || "", surface: near(seat.at) };
        let ok = true;
        for (let i = 0; i < 2; i++) {
            const name = i === 0 ? "handL" : "handR", point = seatPoint[name], arm = m.arms[i];
            if (!point || !Array.isArray(point.at)) continue;
            const reach = armShare(m, i, block, scale, lean, 0), lock = Math.max(armShare(m, i, block, scale, lean, 1), armShare(m, i, block, scale, lean, -1));
            const short = Math.max(0, (reach - Rider.REACH) * arm.length, (lock - Rider.REACH_LOCK) * arm.length);
            const shoulder = seated(m, arm.shoulder, lean, m.pivots.length, 0, [0, 0, 0]), grip = toSeat(block, Rider.point(block, 0, name, 0, FIT.p), scale, [0, 0, 0]);
            report.points[name] = { part: point.part || "", surface: near(point.at), reach: round3(reach), reachAtLock: round3(lock), short: round3(short),
                toward: model([shoulder[0] - grip[0], shoulder[1] - grip[1], shoulder[2] - grip[2]]), ok: short <= 1e-6 };
            if (short > 1e-6) ok = false;
        }
        for (let i = 0; i < 2; i++) {
            const name = i === 0 ? "footL" : "footR", point = seatPoint[name], leg = m.legs[i];
            if (!point || !Array.isArray(point.at)) continue;
            const hip = seated(m, leg.hip, lean, 1, 0, [0, 0, 0]), rest = toSeat(block, Rider.point(block, 0, name, 0, FIT.p), scale, [0, 0, 0]);
            const ankle = [rest[0] - leg.sole[0], rest[1] - leg.sole[1], rest[2] - leg.sole[2]], far = gap(hip, ankle);
            const short = Math.max(0, far - leg.length * 0.999);
            const cos = clamp((leg.thigh * leg.thigh + leg.shin * leg.shin - Math.min(far, leg.length) * Math.min(far, leg.length)) / (2 * leg.thigh * leg.shin), -1, 1);
            report.points[name] = { part: point.part || "", surface: near(point.at), reach: round3(far / leg.length), knee: Math.round(Math.acos(cos) / DEG), short: round3(short),
                toward: model([hip[0] - rest[0], hip[1] - rest[1], hip[2] - rest[2]]), ok: short <= 1e-6 };
            if (short > 1e-6) ok = false;
        }
        const side = block.stand && block.stand.side === "right" ? "right" : "left", down = footShort(m, block, scale, side, lean);
        report.foot = { side, reachesGround: down <= 1e-6, short: round3(down) };
        report.ok = ok;
        return report;
    }

    /**
     * The fit of a rider on a vehicle at a size (tiles along its longest side): per point how far it is from the
     * vehicle's surface, the reach as a share of the limb with the bars centered and at full lock, how far short it
     * is and which way (model space) the point would have to move; the torso's lean; whether the stand-side foot
     * reaches the ground at a stop. `riderObject` is a built instance at rest and at its bound size, or a holder
     * `{ object, binding }`; `vehicleObject` a built instance, or a box `{ size: [x, y, z] }` (then no surface is read).
     */
    Rider.fit = function(riderObject, vehicleObject, block, size) {
        const span = boxSpan(vehicleObject), scale = span > 0 && size > 0 ? size / span : 1;
        return fitOf(measureOf(riderObject), block, scale, size, Rider.LEAN_MAX, vehicleObject && vehicleObject.isObject3D ? vehicleObject : null);
    };

    /**
     * The largest size, to a tenth of a tile, at which every rider reaches both grips with the torso leaned no more
     * than FIT_LEAN degrees and, for a kind that leans, puts the stand-side foot on the ground. `limitedBy` is the
     * index in `riderObjects` of the rider that set the limit (-1 when none did) and `reason` what stopped it
     * (`"reach"`, `"foot"`). `kind` is a kind's name or its row of `Reactor3D.Vehicles.KINDS`.
     */
    Rider.fitSize = function(riderObjects, vehicleObject, block, kind) {
        const span = boxSpan(vehicleObject), riders = (riderObjects || []).map(measureOf), result = { size: 0, limitedBy: -1, reason: "", reports: [] };
        const row = kind && typeof kind === "object" ? kind : (R.Vehicles && R.Vehicles.KINDS && R.Vehicles.KINDS[kind]) || null;
        const leans = row ? !!row.leans : (kind === undefined || kind === null || kind === "motorcycle");
        const seat = block && Array.isArray(block.seats) && block.seats[0] && block.seats[0].seat;
        if (!(span > 0) || !seat || !Array.isArray(seat.at) || seat.at.length < 3 || !riders.some(Boolean)) return result;
        const side = block.stand && block.stand.side === "right" ? "right" : "left";
        // Why a rider does not fit at a size, or "".
        const fails = (m, size) => {
            const scale = size / span, reserve = reserveLean(m, block, scale, Rider.STANCE_LEAN, Rider.FIT_LEAN);
            if (reserve.limited) return "reach";
            return leans && footShort(m, block, scale, side, reserve.lean * DEG) > 1e-6 ? "foot" : "";
        };
        let size = Rider.FIT_MIN;
        for (let tenth = Math.round(Rider.FIT_MAX * 10); tenth >= Math.round(Rider.FIT_MIN * 10); tenth--) {
            let stopped = -1, why = "";
            for (let i = 0; i < riders.length && stopped < 0; i++) { const reason = riders[i] ? fails(riders[i], tenth / 10) : ""; if (reason) { stopped = i; why = reason; } }
            if (stopped < 0) { size = tenth / 10; break; }
            result.limitedBy = stopped; result.reason = why;
        }
        result.size = size;
        result.reports = riders.map(m => m ? fitOf(m, block, size / span, size, Rider.LEAN_MAX, null) : null);
        return result;
    };
    Rider.FIT_MIN = 1;
    Rider.FIT_MAX = 40;

    //-------------------------------------------------------------------------
    // Boarding.

    function newState(object, joints) {
        const T = THREE, v = () => new T.Vector3(), q = () => new T.Quaternion();
        return { object, scale: object.scale.clone(), joints, vehicleObject: null, vScale: 0, block: null, control: null, seatPoint: null, names: null,
            baseTurn: q(), baseTurnInv: q(), baseYaw: 0, leftLocal: v(), align: q(), headRest: q(), headLocal: q(), height: 1, measure: null,
            torso: [], neck: null, head: null, arms: [], legs: [], slots: [], bodySlots: [],
            seatPos: v(), seatQuat: q(), seatAt: v(), seatFrame: q(), hasSeat: false, groundY: 0, landX: NaN, landZ: NaN, landY: 0,
            lean: 0, leanLimited: false, footReaches: false, standSide: "left", key: NaN, solved: false, closed: false, fingers: 0, armsFree: false,
            leaners: [], chain: [], more: -1, leanNow: 0, baseLean: 0, searchedLean: NaN, lockYaw: 0, headParentOwn: q(),
            // The foot at a stop: the share that is drawn (what the vehicle tips by), the share the vehicle last drew,
            // whether the leg reaches the ground at the foot's place, that place and the ground read there.
            footDown: 0, footDrawn: 0, footOn: true, footX: NaN, footZ: NaN, footY: NaN, footKey: 0, footFrame: NaN,
            fading: false,
            // The samples: one set with both feet up, one for a stop with the foot down; what each was made for (0: not made).
            still: 0, sampling: false, sampled: false, sampleQ: null, sampleHead: null, sampleFor: [0, 0], stance: 0, stanceStill: 0, live: { pivots: [], shoulders: [[0, 0, 0], [0, 0, 0]], grips: [[[0, 0, 0], [0, 0, 0], [0, 0, 0]], [[0, 0, 0], [0, 0, 0], [0, 0, 0]]], tmp: [0, 0, 0] } };
    }

    /**
     * A joint the pose is laid over: `base` what the motion gave it, `out` what was written, `stood` the turn it had
     * when the rider boarded (the pose he stood in), `kept` the turn it left the seat with.
     */
    const slot = (joint, limb) => ({ node: joint, base: joint.quaternion.clone(), out: joint.quaternion.clone(), stood: joint.quaternion.clone(), kept: joint.quaternion.clone(),
        keep: false, limb: !!limb, set: false, weight: 0 });

    /** The block a vehicle instance carries, as whoever built it left it. */
    function blockOf(vehicleHolder) {
        const object = vehicleHolder && vehicleHolder.object, V = R.Vehicles;
        if (!object) return null;
        return (V && typeof V.blockOf === "function" && V.blockOf(object)) || object.__reactorVehicle || vehicleHolder.vehicleBlock || null;
    }

    /**
     * Once per boarding: the joints by rig name, the limbs measured at rest, the reach in reserve, every scratch
     * object. The state is kept on `holder.rider`. Null for a model that cannot sit (the caller stands it in the seat: `perch`).
     */
    Rider.board = function(holder, character, object, vehicleHolder) {
        if (typeof THREE === "undefined" || !holder || !object) return null;
        if (!Rider.canSit(holder)) { holder.rider = null; holder.riderRefused = object; return null; }
        if (holder.rider) Rider.release(holder);
        const state = newState(object, Rider.joints(holder));
        measure(state, holder, character);
        for (const joint of state.leaners) { state.bodySlots.push(slot(joint)); state.live.pivots.push([0, 0, 0]); }
        if (state.neck) state.bodySlots.push(slot(state.neck));
        if (state.head) state.bodySlots.push(slot(state.head));
        for (const limb of state.arms) limb.slots.push(slot(limb.upper, true), slot(limb.lower, true), slot(limb.hand, true));
        for (const limb of state.legs) limb.slots.push(slot(limb.upper, true), slot(limb.lower, true), slot(limb.foot, true));
        state.slots = state.bodySlots.concat(...state.arms.map(limb => limb.slots), ...state.legs.map(limb => limb.slots));
        // The joints whose world matrices a frame reads: every one between the hips and a hand, a foot or the head, parents first.
        const hips = state.joints.Hips, seen = new Set([hips]), depth = joint => { let n = 0; for (let at = joint; at && at !== hips; at = at.parent) n++; return n; };
        for (const end of [state.head].concat(state.arms.map(limb => limb.hand), state.legs.map(limb => limb.foot))) for (let at = end; at && at !== hips; at = at.parent) seen.add(at);
        state.chain = Array.from(seen).sort((a, b) => depth(a) - depth(b));
        state.sampleQ = new Float64Array(2 * Rider.SAMPLES.length * state.slots.length * 4);
        state.sampleHead = new Float64Array(2 * Rider.SAMPLES.length * 4);
        bind(state, vehicleHolder);
        holder.rider = state;
        holder.riderRefused = null;
        return state;
    };

    /** Ties a boarded rider to a vehicle instance: its block, its points, the reach in reserve at this size. */
    function bind(state, vehicleHolder) {
        const T = THREE, vehicle = vehicleHolder && vehicleHolder.object ? vehicleHolder.object : null, block = vehicle ? blockOf(vehicleHolder) : null;
        state.vehicleObject = vehicle;
        state.vScale = vehicle ? vehicle.scale.x : 0;
        state.block = block;
        const seat = block && Array.isArray(block.seats) ? block.seats[0] : null;
        state.seatPoint = seat && seat.seat && Array.isArray(seat.seat.at) ? seat.seat : null;
        state.names = { seat: "ride.0.seat", handL: "ride.0.handL", handR: "ride.0.handR", footL: "ride.0.footL", footR: "ride.0.footR" };
        const frame = frameOf(block);
        // The rider's own frame laid on the vehicle's: x to its left, y up, z to its front.
        state.align.setFromRotationMatrix(new T.Matrix4().makeBasis(new T.Vector3().fromArray(frame.l), new T.Vector3().fromArray(frame.u), new T.Vector3().fromArray(frame.f)));
        for (const limb of state.arms.concat(state.legs)) {
            const point = seat ? seat[limb.name] : null;
            limb.point = point && Array.isArray(point.at) ? point : null;
            limb.has = !!limb.point;
            limb.control = limb.point ? controlOf(block, limb.point, limb.name) : null;
            limb.along = limb.point && Array.isArray(limb.point.along) ? unit3(limb.point.along, null) : null;
            // A grip with no line of its own lies across the vehicle, inner end to outer end.
            if (limb.point && !limb.along && limb.hand) limb.along = [frame.l[0] * limb.sign, frame.l[1] * limb.sign, frame.l[2] * limb.sign];
        }
        state.control = null;
        if (block && Array.isArray(block.controls)) for (const control of block.controls) if (control && control.input === "steer" && !state.control) state.control = control;
        state.standSide = block && block.stand && block.stand.side === "right" ? "right" : "left";
        state.lean = 0; state.leanLimited = false; state.footReaches = false;
        if (state.seatPoint && state.vScale > 0) {
            const reserve = reserveLean(state.measure, block, state.vScale, Rider.STANCE_LEAN, Rider.LEAN_MAX);
            state.lean = reserve.lean; state.leanLimited = reserve.limited;
            state.footReaches = footShort(state.measure, block, state.vScale, state.standSide, reserve.lean * DEG) <= 1e-6;
        }
        // Where each grip is from the seated Hips joint, in the rider's own frame: bars centered, full right, full left.
        for (let i = 0; i < 2; i++) {
            const arm = state.arms[i];
            if (!arm.has || !state.seatPoint) continue;
            for (let k = 0; k < 3; k++) {
                const at = toSeat(block, Rider.point(block, 0, arm.name, k === 0 ? 0 : k === 1 ? 1 : -1, FIT.p), state.vScale, state.live.grips[i][k]);
                at[1] -= Rider.HIPS_OVER * state.height;
            }
        }
        state.lockYaw = chestYaw(block, 1);
        // The samples are worked out by the block's own arithmetic: every control a hand follows must say where its line is.
        state.sampling = !!state.seatPoint && state.arms.every(arm => !arm.has || !arm.control || (Array.isArray(arm.control.at) && arm.control.at.length >= 3));
        state.key = NaN; state.solved = false; state.more = -1; state.still = 0;
        state.sampled = false; state.sampleFor[0] = 0; state.sampleFor[1] = 0; state.stance = 0; state.stanceStill = 0;
        state.footDown = 0; state.footDrawn = 0; state.footOn = true; state.footX = NaN; state.footZ = NaN; state.footY = NaN; state.footKey = 0; state.footFrame = NaN;
        state.fading = false;
    }

    /** Whether both shoulders are within reach of their grips with this much more lean (radians), bars centered and at both locks. */
    function reachOk(state, lean) {
        const live = state.live, n = live.pivots.length;
        for (let i = 0; i < 2; i++) {
            const arm = state.arms[i];
            if (!arm.has) continue;
            const grips = live.grips[i], lock = Rider.REACH_LOCK * arm.length;
            if (gap(leanPoint(live.shoulders[i], live.pivots, n, lean, 0, live.tmp), grips[0]) > Rider.REACH * arm.length) return false;
            if (gap(leanPoint(live.shoulders[i], live.pivots, n, lean, state.lockYaw, live.tmp), grips[1]) > lock) return false;
            if (gap(leanPoint(live.shoulders[i], live.pivots, n, lean, -state.lockYaw, live.tmp), grips[2]) > lock) return false;
        }
        return true;
    }

    /** The least more lean (degrees, up to `most`) that brings both shoulders within reach, from the pose the motion holds. */
    function liveLean(state, most) {
        if (most <= 0 || reachOk(state, 0)) return 0;
        let low = 0, high = most;
        for (let d = 1; d < most; d++) if (reachOk(state, d * DEG)) { high = d; low = d - 1; break; }
        if (high === most && !reachOk(state, most * DEG)) return most;
        for (let i = 0; i < 4; i++) { const mid = (low + high) / 2; if (reachOk(state, mid * DEG)) high = mid; else low = mid; }
        return high;
    }

    /** Whether the stand-side foot of a boarded rider reaches the ground at a stop (the vehicle then tips onto it). */
    Rider.footReaches = function(holder) {
        return !!(holder && holder.rider && holder.rider.footReaches);
    };

    /** Gives every joint back to the motion, opens the hands and forgets the boarding. */
    Rider.release = function(holder) {
        const state = holder && holder.rider;
        if (!state) return;
        for (const item of state.slots) {
            if (item.set && item.node.quaternion.equals(item.out)) item.node.quaternion.copy(item.base);
            item.set = false;
        }
        fingers(state, false);
        holder.rider = null;
    };

    /** The hands close into a loose fist once the hold is whole, and open when it ends. */
    function fingers(state, close) {
        if (state.closed === close) return;
        state.closed = close;
        const grips = R.HandGrip;
        for (const arm of state.arms) {
            if (!arm.grip || !grips || typeof grips.hold !== "function") continue;
            if (close && arm.has) { grips.hold(arm.hand, null); arm.grip.pinned = true; continue; }
            if (!arm.grip.pinned) continue;
            // Open again at once: nothing eases a hand that nobody updates.
            arm.grip.pinned = false;
            for (const finger of arm.grip.layout.fingers) {
                finger.now[0] = 0; finger.now[1] = 0;
                for (const joint of finger.joints) joint.node.quaternion.copy(joint.rest);
            }
            if (grips.hands && grips.hands.delete) grips.hands.delete(arm.grip);
            arm.grip.thing = undefined; arm.grip.relSet = false;
        }
        // The grip's own update eases the fingers shut; it is called from here while they move.
        state.fingers = close ? 30 : 0;
    }

    //-------------------------------------------------------------------------
    // The seat.

    /** A named rider point of the vehicle in the world: where its part carries it, else by arithmetic from the block. */
    function vehiclePoint(state, vehicle, name, steer, out) {
        const V = R.Vehicles;
        if (V && typeof V.pointWorld === "function") {
            const got = V.pointWorld(vehicle, state.names[name], out);
            if (got) return got;
        }
        if (!Rider.point(state.block, 0, name, steer, out)) return null;
        return out.applyMatrix4(vehicle.matrixWorld);
    }

    /** The Hips joint in the rider object's own frame, as the motion left it this frame. */
    function hipsLocal(state, out) {
        const hips = state.joints.Hips, object = state.object;
        out.copy(hips.position);
        for (let at = hips.parent; at && at !== object; at = at.parent) out.multiply(at.scale).applyQuaternion(at.quaternion).add(at.position);
        return out;
    }

    /** How much of the hold (hands and feet) and of the body's pose shows, by the hop in progress. */
    function weights(character, out) {
        const mount = character ? character._rrMount : null;
        if (mount && mount.n > 0) {
            const n = mount.n, t = clamp(Number(mount.t) || 0, 0, n), from = Math.min(Rider.HOLD_FROM, n - 1);
            out.hold = smooth(mount.on ? clamp((t - from) / (n - from), 0, 1) : clamp(1 - t / (n - from), 0, 1));
            out.body = smooth(mount.on ? t / n : 1 - t / n);
        } else {
            const on = !character || !!character._rrSeated;
            out.hold = on ? 1 : 0; out.body = on ? 1 : 0;
        }
        return out;
    }
    const WEIGHTS = { hold: 1, body: 1 };

    /** The ground a hop off lands on: the height the hop itself names, else the ground read at its tile. */
    function landing(state, character, mount, vehicle) {
        if (finite(mount.tz)) return mount.tz;
        if (state.landX === mount.tx && state.landZ === mount.ty) return state.landY;
        state.landX = mount.tx; state.landZ = mount.ty;
        let y = state.groundY;
        if (typeof $dataMap !== "undefined" && $dataMap && typeof R.groundHeightAt === "function" && finite(mount.tx) && finite(mount.ty)) {
            const near = character && finite(character._reactorGround) ? character._reactorGround : y;
            const ground = R.groundHeightAt($dataMap, mount.tx + 0.5, mount.ty + 0.5, near);
            if (finite(ground)) y = ground;
        }
        return (state.landY = y);
    }

    /**
     * The rider's world transform for this frame: the vehicle's whole attitude times the rider's own base turn,
     * its Hips joint HIPS_OVER of its height over the seat point. While a hop runs (`character._rrMount`) it is
     * the arc between the on-foot place and the seat. Called inside the placement (`Reactor3D.Vehicles.pose`) and
     * again by this file's pass after the sync. True when it wrote the transform.
     */
    Rider.seat = function(holder, character, object, vehicleHolder) {
        if (typeof THREE === "undefined" || !holder || !object) return false;
        const vehicle = vehicleHolder && vehicleHolder.object ? vehicleHolder.object : null;
        let state = holder.rider;
        // (Another model, or the same one at another size: every length was measured at the size it boarded with.)
        if (!state || state.object !== object || !state.scale.equals(object.scale)) {
            if (holder.riderRefused === object) return false;
            state = Rider.board(holder, character, object, vehicleHolder);
            if (!state) return false;
        } else if (vehicle && (state.vehicleObject !== vehicle || state.vScale !== vehicle.scale.x || state.block !== blockOf(vehicleHolder))) bind(state, vehicleHolder);
        const w = work(), mount = character ? character._rrMount : null, hop = !!(mount && mount.n > 0);
        let fresh = false;
        if (vehicle && state.vehicleObject === vehicle && state.seatPoint) {
            vehicle.updateWorldMatrix(true, false);
            const P = vehiclePoint(state, vehicle, "seat", 0, w.v0);
            if (P) {
                vehicle.matrixWorld.decompose(w.p1, w.qVeh, w.s1);
                w.qSeat.copy(w.qVeh).multiply(state.align);
                state.seatQuat.copy(w.qSeat).multiply(state.baseTurn);
                hipsLocal(state, w.v1).multiply(object.scale).applyQuaternion(state.seatQuat);
                w.v2.set(0, 1, 0).applyQuaternion(w.qSeat);
                state.seatPos.copy(P).addScaledVector(w.v2, Rider.HIPS_OVER * state.height).sub(w.v1);
                state.seatAt.copy(P); state.seatFrame.copy(w.qSeat);
                state.groundY = w.p1.y;
                state.hasSeat = true; fresh = true;
            }
        }
        if (!state.hasSeat || (!fresh && !hop)) return false;
        if (!hop) {
            object.position.copy(state.seatPos);
            object.quaternion.copy(state.seatQuat);
            return true;
        }
        // The on-foot end of the hop: upright at the yaw the placement eases, where the hop began or ends.
        const n = mount.n, s = clamp((Number(mount.t) || 0) / n, 0, 1), e = smooth(s);
        const ahead = w.v4.set(0, 0, 1).applyQuaternion(w.q2.copy(state.seatQuat).multiply(state.baseTurnInv));
        const yaw = finite(holder.smoothYaw) ? holder.smoothYaw - state.baseYaw : Math.atan2(ahead.x, ahead.z);
        const foot = w.q1.setFromAxisAngle(w.v2.set(0, 1, 0), yaw).multiply(state.baseTurn), place = w.v3;
        if (mount.on) {
            if (finite(mount.fx) && finite(mount.fy)) place.set(mount.fx + 0.5, finite(mount.fz) ? mount.fz : state.seatPos.y, mount.fy + 0.5);
            else place.copy(object.position);
            object.position.lerpVectors(place, state.seatPos, e);
            object.quaternion.copy(foot).slerp(state.seatQuat, e);
        } else {
            if (finite(mount.tx) && finite(mount.ty)) place.set(mount.tx + 0.5, landing(state, character, mount, vehicle), mount.ty + 0.5);
            else place.copy(object.position);
            object.position.lerpVectors(state.seatPos, place, e);
            object.quaternion.copy(state.seatQuat).slerp(foot, e);
        }
        object.position.y += Rider.HOP_HEIGHT * 4 * s * (1 - s);
        return true;
    };

    //-------------------------------------------------------------------------
    // The limbs, the chest and the head.

    /** The drawn share of full lock, -1 (left) to 1 (right). */
    function drawnSteer(state, vehicleHolder) {
        const V = R.Vehicles, event = vehicleHolder ? vehicleHolder.character : null;
        if (!event) return 0;
        if (V && typeof V.inputs === "function") {
            const inputs = V.inputs(vehicleHolder, event, state.vScale);
            if (inputs && finite(inputs.steer)) return clamp(inputs.steer, -1, 1);
        }
        return finite(event._rrSteer) ? clamp(event._rrSteer, -1, 1) : 0;
    }

    /** Whether a joint's turn is what it was, to within SAME. */
    const sameTurn = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z) + Math.abs(a.w - b.w) <= Rider.SAME;

    /**
     * The ground under the stand-side foot's own place (FOOT_OUT out from the seat point, level), read again only
     * when that place has moved. Answers what of it the pose depends on, as one number over 0: how far that ground
     * is over or under the vehicle's own, and the vehicle's pitch.
     */
    function footGround(state, w) {
        const sign = state.standSide === "right" ? -1 : 1;
        const L = w.v0.set(1, 0, 0).applyQuaternion(state.seatFrame), flat = Math.hypot(L.x, L.z);
        const pitch = Math.asin(clamp(w.v1.set(0, 0, 1).applyQuaternion(state.seatFrame).y, -1, 1)) / DEG;
        if (flat > 1e-4) {
            const x = state.seatAt.x + L.x / flat * sign * Rider.FOOT_OUT, z = state.seatAt.z + L.z / flat * sign * Rider.FOOT_OUT;
            if (!(Math.abs(x - state.footX) < Rider.FOOT_MOVED && Math.abs(z - state.footZ) < Rider.FOOT_MOVED)) {
                state.footX = x; state.footZ = z;
                // (With no map loaded, the editor's canvas: level with the vehicle.)
                let y = NaN;
                if (typeof $dataMap !== "undefined" && $dataMap && typeof R.groundHeightAt === "function") y = R.groundHeightAt($dataMap, x, z, state.groundY);
                state.footY = finite(y) ? y : NaN;
            }
        }
        const over = finite(state.footY) ? clamp(state.footY - state.groundY, -30, 30) : 0;
        return (Math.round(over / Rider.FOOT_STEP) + 8192) * 1024 + Math.round(pitch * 2) + 512;
    }

    /** The drawn share of the foot down, moved toward `target` by FOOT_EASE a tick of the game's clock; at once with no clock. */
    function footStep(state, target) {
        const clock = typeof Graphics !== "undefined" && Graphics && finite(Graphics.frameCount) ? Graphics.frameCount : NaN;
        const was = state.footDown, ticks = clock - state.footFrame;
        state.footFrame = clock;
        // (What the vehicle's own pose tipped by this frame: it read the share before this step.)
        state.footDrawn = was;
        if (was !== target) {
            const step = ticks >= 0 ? ticks * Rider.FOOT_EASE : 1;
            state.footDown = target > was ? Math.min(target, was + step) : Math.max(target, was - step);
        }
        return state.footDown;
    }

    /**
     * Once per drawn frame for a boarded rider, after both models were animated: the hands onto the grips, the
     * feet onto the rests or the stand-side foot onto the ground, the torso's lean, the chest and the head. It is
     * worked out only when the bars' angle, the hold, the foot, the ground under a foot that is down, the vehicle's
     * lean or the motion under it changed; otherwise the turns written last time are written again. True when the
     * pose it wrote changed this frame.
     */
    Rider.update = function(holder, vehicleHolder) {
        const state = holder && holder.rider;
        if (!state || typeof THREE === "undefined") return false;
        const character = holder.character || null, object = state.object;
        // What the motion rewrote since last frame is the new base; what it left alone, or handed back as it was, keeps the base it had.
        let changed = false;
        const slots = state.slots;
        for (let i = 0; i < slots.length; i++) {
            const item = slots[i], q = item.node.quaternion;
            if (item.set && q.equals(item.out)) continue;
            // (The head is set outright: what the motion or the camera's look does to it is kept for leaving, and changes nothing.)
            if (item.node === state.head && item.set) { item.base.copy(q); continue; }
            if (!sameTurn(q, item.base)) { changed = true; item.base.copy(q); }
        }
        if (changed) { state.still = 0; state.sampled = false; state.sampleFor[0] = 0; state.sampleFor[1] = 0; } else if (state.still < 1000) state.still++;
        const share = weights(character, WEIGHTS), hold = share.hold, body = share.body;
        // The arms are let go while the rider has a thing in hand to use (it aims, a sequence shows it) or a battle
        // plays its own action (`_rrArmsFree`): the seat keeps the legs and the torso.
        const inHand = R.MapHeld;
        const free = !!character && (!!character._rrArmsFree || !!(inHand && typeof inHand.inUse === "function" && inHand.inUse(character)));
        if (free !== state.armsFree) { state.armsFree = free; state.key = NaN; state.solved = false; if (free) fingers(state, false); }
        const mount = character ? character._rrMount : null, hop = !!(mount && mount.n > 0);
        const vehicle = vehicleHolder && vehicleHolder.object && vehicleHolder.object === state.vehicleObject ? vehicleHolder.object : null;
        const w = work();
        if (!vehicle && hop && !mount.on) {
            // Only the picture of a hop off still plays (a battle began aboard): the pose he left the seat in eases
            // out as the ordinary hop off lets go, the limbs first. Nothing is worked out.
            if (!state.fading) {
                state.fading = true;
                for (let i = 0; i < slots.length; i++) { const item = slots[i]; item.keep = item.set; if (item.set) item.kept.copy(item.out); }
            }
            for (let i = 0; i < slots.length; i++) {
                const item = slots[i], weight = item.limb ? hold : body;
                if (!item.keep || weight <= 0) { item.set = false; item.node.quaternion.copy(item.base); continue; }
                item.node.quaternion.copy(weight < 1 ? w.q0.copy(item.base).slerp(item.kept, weight) : item.kept);
                item.out.copy(item.node.quaternion); item.set = true;
            }
            fingers(state, false);
            state.key = NaN; state.solved = false; state.footDown = 0;
            return false;
        }
        const steer = vehicle ? drawnSteer(state, vehicleHolder) : 0;
        const drive = character ? character._rrDrive : null;
        // The foot the game asks down, where the leg reaches level ground at this size at all.
        const asked = vehicle && state.footReaches && state.hasSeat && drive && finite(drive.foot) ? clamp(drive.foot, 0, 1) : 0;
        let footKey = 0;
        if (asked > 0) footKey = footGround(state, w);
        // (Up again: the next stop is judged afresh.)
        else state.footOn = true;
        // What is drawn of it, and what the vehicle's own pose tips by: 0 where the sole cannot reach the ground under it.
        const foot = footStep(state, state.footOn ? asked : 0);
        // The vehicle's lean as the rider's own left side rises or falls.
        const roll = Math.asin(clamp(w.v0.copy(state.leftLocal).applyQuaternion(object.quaternion).y, -1, 1)) / DEG;
        const degrees = state.control ? Number(state.control.degrees) || 0 : 30;
        const key = ((((Math.round(steer * degrees / Rider.BAR_STEP) + 1024) * 64 + Math.round(hold * 63)) * 64 + Math.round(body * 63)) * 64 + Math.round(foot * 63)) * 1024
            + Math.round(roll * 2) + 512;
        if (state.fingers > 0) {
            state.fingers--;
            const held = R.MapHeld;
            if (R.HandGrip && typeof R.HandGrip.update === "function" && !(held && held.count)) R.HandGrip.update();
        }
        // What a set of samples is good for: both feet up (1, whatever the vehicle does), or the stand-side foot
        // whole on this ground with the vehicle at this attitude; nothing while the foot is on its way.
        const stance = asked <= 0 && foot <= 0 ? 1 : foot >= 1 ? footKey * 2048 + Math.round(roll * 2) + 512 : 0;
        if (stance !== state.stance) { state.stance = stance; state.stanceStill = 0; } else if (state.stanceStill < 1000) state.stanceStill++;
        if (!changed && state.solved && key === state.key && footKey === state.footKey) {
            for (let i = 0; i < slots.length; i++) if (slots[i].set) slots[i].node.quaternion.copy(slots[i].out);
            return false;
        }
        state.key = key; state.footKey = footKey; state.solved = true; state.fading = false;
        // With the whole hold over a motion that holds still, riding with both feet up or standing with the foot
        // down: the turns worked out at five angles of the bars are blended, and nothing is worked out while the
        // rider steers. (The samples of a stop wait until the foot, the ground and the attitude have stayed.)
        if (vehicle && state.sampling && !free && !changed && state.still >= Rider.STILL && hold >= 1 && body >= 1 && (stance === 1 || (stance && state.stanceStill >= Rider.STILL))) {
            const set = stance === 1 ? 0 : 1;
            if (state.sampleFor[set] !== stance) sample(state, vehicleHolder, set, stance);
            if (state.sampleFor[set] === stance) { blend(state, set, steer, roll, degrees); return true; }
        }
        for (let i = 0; i < slots.length; i++) slots[i].node.quaternion.copy(slots[i].base);
        const any = vehicle && (hold > 0 || body > 0);
        if (any) solve(state, vehicleHolder, steer, foot, roll, hold, body, changed, false, asked > 0);
        // Getting on, the pose he stood in eases into this one by the body's weight: the stance comes in with the hop.
        const on = hop && mount.on && body < 1;
        for (let i = 0; i < slots.length; i++) {
            const item = slots[i], turn = item.node.quaternion, held = any && item.weight > 0;
            if (!held && !on) { item.set = false; turn.copy(item.base); continue; }
            if (!held) turn.copy(item.base);
            else if (item.weight < 1) turn.copy(w.q0.copy(item.base).slerp(turn, item.weight));
            if (on) turn.copy(body > 0 ? w.q0.copy(item.stood).slerp(turn, body) : item.stood);
            item.out.copy(turn); item.set = true;
        }
        fingers(state, hold >= 1 && !!vehicle);
        return !!any;
    };

    /**
     * The limbs worked out at each of SAMPLES, bars by the block's own arithmetic, and kept in a set: `set` 0 with
     * both feet up, 1 with the stand-side foot down as the vehicle stands now. `stance` is what the set is good for.
     */
    function sample(state, vehicleHolder, set, stance) {
        const slots = state.slots, count = slots.length, w = work(), vehicle = vehicleHolder.object, from = set * Rider.SAMPLES.length;
        // The arithmetic must put a grip where the vehicle draws it: else the samples would hold the hands off the bars.
        const now = drawnSteer(state, vehicleHolder);
        vehicle.updateWorldMatrix(true, false);
        for (let i = 0; i < 2; i++) {
            const arm = state.arms[i];
            if (!arm.has) continue;
            if (!vehiclePoint(state, vehicle, arm.name, now, w.v0) || !Rider.point(state.block, 0, arm.name, now, w.v1)) { state.sampling = false; return; }
            if (w.v1.applyMatrix4(vehicle.matrixWorld).distanceToSquared(w.v0) > 1e-4) { state.sampling = false; return; }
        }
        for (let k = 0; k < Rider.SAMPLES.length; k++) {
            for (let i = 0; i < count; i++) slots[i].node.quaternion.copy(slots[i].base);
            solve(state, vehicleHolder, Rider.SAMPLES[k], set, 0, 1, 1, k === 0, true, false);
            for (let i = 0; i < count; i++) {
                const item = slots[i], q = item.weight > 0 ? item.node.quaternion : item.base, at = ((from + k) * count + i) * 4;
                state.sampleQ[at] = q.x; state.sampleQ[at + 1] = q.y; state.sampleQ[at + 2] = q.z; state.sampleQ[at + 3] = q.w;
            }
            state.headParentOwn.toArray(state.sampleHead, (from + k) * 4);
        }
        state.sampleFor[set] = stance;
        state.sampled = true;
    }

    /** The stored turns of a set between the two samples the bars stand between; the head against the vehicle's lean by itself. */
    function blend(state, set, steer, roll, degrees) {
        const slots = state.slots, count = slots.length, samples = Rider.SAMPLES, w = work(), Q = state.sampleQ, from = set * samples.length;
        let k = 0;
        while (k < samples.length - 2 && steer > samples[k + 1]) k++;
        const t = clamp((steer - samples[k]) / (samples[k + 1] - samples[k]), 0, 1);
        for (let i = 0; i < count; i++) {
            const item = slots[i], a = ((from + k) * count + i) * 4, b = a + count * 4;
            if (item.node === state.head) continue;
            w.q0.set(Q[a], Q[a + 1], Q[a + 2], Q[a + 3]);
            if (t > 0) w.q0.slerp(w.q1.set(Q[b], Q[b + 1], Q[b + 2], Q[b + 3]), t);
            item.node.quaternion.copy(w.q0);
            item.out.copy(w.q0); item.set = true;
        }
        if (state.head) {
            // The head is set outright: where it should face in the rider's own frame, against where its parent stands.
            const H = state.sampleHead, h = (from + k) * 4;
            w.q0.set(H[h], H[h + 1], H[h + 2], H[h + 3]);
            if (t > 0) w.q0.slerp(w.q1.set(H[h + 4], H[h + 5], H[h + 6], H[h + 7]), t);
            headOwn(state, roll, steer * degrees * DEG, state.leanNow, w.q2, w);
            const head = state.head;
            head.quaternion.copy(w.q0.invert().multiply(w.q2));
            for (let i = 0; i < state.bodySlots.length; i++) if (state.bodySlots[i].node === head) { state.bodySlots[i].out.copy(head.quaternion); state.bodySlots[i].set = true; }
        }
        fingers(state, true);
    }

    const AXIS_X = { x: 1, y: 0, z: 0 }, AXIS_Y = { x: 0, y: 1, z: 0 }, AXIS_Z = { x: 0, y: 0, z: 1 };
    /**
     * Where the head should face, in the rider's own frame: level against HEAD_LEVEL of the vehicle's lean (`roll`,
     * degrees, to the right positive), up to HEAD_LOOK into the turn (by the lean and by the bars' swing, radians to
     * the right), dipping what HEAD_BACK leaves of the torso's lean.
     */
    function headOwn(state, roll, bars, lean, out, w) {
        const dip = lean * (1 - Rider.HEAD_BACK) * DEG, level = -roll * Rider.HEAD_LEVEL * DEG;
        const look = -clamp(roll / Rider.LEAN_FULL + bars / DEG / 60, -1, 1) * Rider.HEAD_LOOK * DEG;
        return out.setFromAxisAngle(AXIS_Z, level).multiply(w.q3.setFromAxisAngle(AXIS_Y, look)).multiply(w.q3.setFromAxisAngle(AXIS_X, dip)).multiply(state.headRest);
    }

    /** The world matrices of the joints a frame reads, from the hips down, with the turns they have now. */
    function refresh(state) {
        const chain = state.chain;
        for (let i = 0; i < chain.length; i++) {
            const joint = chain[i];
            joint.updateMatrix();
            joint.matrixWorld.multiplyMatrices(joint.parent.matrixWorld, joint.matrix);
        }
    }

    /** A grip's line in the world: its `along`, turned as far as the grip has swung about its control's line. */
    function tube(state, arm, index, vehicle, w) {
        const out = w.tube[index], along = arm.along;
        out.set(along[0], along[1], along[2]);
        const control = arm.control;
        let angle = 0;
        if (control) {
            const at = controlAt(state.block, control), axis = controlAxis(control), rest = arm.point.at, now = w.gm.copy(w.grip[index]).applyMatrix4(w.vInv);
            // The swing of the grip about the line, measured from where it is drawn.
            let ax = rest[0] - at[0], ay = rest[1] - at[1], az = rest[2] - at[2], bx = now.x - at[0], by = now.y - at[1], bz = now.z - at[2];
            const ka = ax * axis[0] + ay * axis[1] + az * axis[2], kb = bx * axis[0] + by * axis[1] + bz * axis[2];
            ax -= axis[0] * ka; ay -= axis[1] * ka; az -= axis[2] * ka; bx -= axis[0] * kb; by -= axis[1] * kb; bz -= axis[2] * kb;
            const cross = axis[0] * (ay * bz - az * by) + axis[1] * (az * bx - ax * bz) + axis[2] * (ax * by - ay * bx);
            angle = Math.atan2(cross, ax * bx + ay * by + az * bz);
            if (angle) turnAbout(out, null, axis, angle);
        }
        arm.swing = angle;
        return out.applyQuaternion(w.qVeh).normalize();
    }

    function solve(state, vehicleHolder, steer, footDown, roll, hold, body, changed, sampled, footAsked) {
        Rider.solves++;
        const w = work(), limb = w.limb, object = state.object, vehicle = vehicleHolder.object, hips = state.joints.Hips;
        hips.parent.updateWorldMatrix(true, false);
        refresh(state);
        vehicle.updateWorldMatrix(true, false);
        object.matrixWorld.decompose(w.p0, w.qObj, w.s0);
        vehicle.matrixWorld.decompose(w.p1, w.qVeh, w.s1);
        w.vInv.copy(vehicle.matrixWorld).invert();
        // The rider's own frame in the world: left, up, ahead.
        const frame = w.frame.copy(w.qObj).multiply(state.baseTurnInv);
        w.frameInv.copy(frame).invert();
        const L = w.L.set(1, 0, 0).applyQuaternion(frame), U = w.U.set(0, 1, 0).applyQuaternion(frame), F = w.F.set(0, 0, 1).applyQuaternion(frame);

        // Where the grips are, and how far the bars have swung (to the right is positive).
        let swing = 0, swung = 0;
        for (let i = 0; i < 2; i++) {
            const arm = state.arms[i];
            // (A sample asks for the bars at an angle they are not drawn at: by the block's own arithmetic.)
            arm.live = arm.has && !!(sampled ? Rider.point(state.block, 0, arm.name, steer, w.grip[i]) && w.grip[i].applyMatrix4(vehicle.matrixWorld) : vehiclePoint(state, vehicle, arm.name, steer, w.grip[i]));
            if (!arm.live) continue;
            tube(state, arm, i, vehicle, w);
            if (arm.control) { swing -= arm.swing; swung++; }
        }
        const bars = swung ? swing / swung : 0;

        // The torso: as far forward as the arms need (shared by the hips and the spine), the chest toward the hand that goes ahead.
        const leaners = state.leaners, count = leaners.length, live = state.live, m = state.measure;
        const origin = w.hip.setFromMatrixPosition(hips.matrixWorld);
        for (let i = 0; i < count; i++) w.v0.setFromMatrixPosition(leaners[i].matrixWorld).sub(origin).applyQuaternion(w.frameInv).toArray(live.pivots[i]);
        for (let i = 0; i < 2; i++) w.v0.setFromMatrixPosition(state.arms[i].upper.matrixWorld).sub(origin).applyQuaternion(w.frameInv).toArray(live.shoulders[i]);
        if (changed || state.more < 0) {
            // How far the motion already leans it: the line from the hips to between the shoulders, against its rest.
            const z = (live.shoulders[0][2] + live.shoulders[1][2]) / 2, y = (live.shoulders[0][1] + live.shoulders[1][1]) / 2;
            const rz = (m.arms[0].shoulder[2] + m.arms[1].shoulder[2]) / 2 - m.hips[2], ry = (m.arms[0].shoulder[1] + m.arms[1].shoulder[1]) / 2 - m.hips[1];
            state.baseLean = (Math.atan2(z, y) - Math.atan2(rz, ry)) / DEG;
            // The reach is looked for again only when the motion's own lean has moved: the arms take up what is less.
            if (state.more < 0 || !(Math.abs(state.baseLean - state.searchedLean) < Rider.LEAN_DRIFT)) {
                state.more = liveLean(state, Math.max(0, Rider.LEAN_MAX - state.baseLean));
                state.searchedLean = state.baseLean;
            }
        }
        // (What the search added stands while the motion's own lean drifts a little, but never past the most.)
        const more = Math.max(0, Math.min(state.more, Rider.LEAN_MAX - state.baseLean)), lean = state.baseLean + more, shares = Rider.LEAN_SHARE[count - 1];
        w.q3.identity();
        for (let i = 0; i < count; i++) {
            const joint = leaners[i];
            w.turn.setFromAxisAngle(L, more * DEG * shares[i]);
            // (The chest's turn is about the frame's up as the whole lean leaves it.)
            if (i > 0 && i === count - 1 && bars) w.turn.premultiply(w.q2.setFromAxisAngle(w.v2.copy(U).applyQuaternion(w.q0.setFromAxisAngle(L, lean * DEG)), -bars * Rider.CHEST_TURN));
            joint.parent.matrixWorld.decompose(limb.t1, w.q1, limb.t2);
            // A parent the turns below have carried is where they left it.
            if (i > 0) w.q1.premultiply(w.q3);
            turnJoint(joint, w.turn, w.q1, w.q0);
            w.q3.premultiply(w.turn);
        }
        refresh(state);
        state.leanNow = lean;
        for (let i = 0; i < state.bodySlots.length; i++) state.bodySlots[i].weight = body;

        // The head: level against half the vehicle's lean, looking into the turn, tipped back up from the torso's lean.
        if (state.head) {
            const head = state.head;
            // Where the head should face, in the world.
            w.q2.copy(frame).multiply(headOwn(state, roll, bars, lean, w.qHand, w));
            if (state.neck) {
                // The neck takes half the turn from where the head would be, at its own rest turn, to where it should be.
                head.parent.matrixWorld.decompose(limb.t1, w.q1, limb.t2);
                w.q1.multiply(state.headLocal);
                w.half.copy(w.q2).multiply(w.q1.invert());
                w.half.copy(w.q3.identity().slerp(w.half, 0.5));
                state.neck.parent.matrixWorld.decompose(limb.t1, w.q1, limb.t2);
                turnJoint(state.neck, w.half, w.q1, w.q0);
                head.parent.matrixWorld.decompose(limb.t1, w.q1, limb.t2);
                if (head.parent === state.neck || isUnder(head.parent, state.neck)) w.q1.premultiply(w.half);
            } else head.parent.matrixWorld.decompose(limb.t1, w.q1, limb.t2);
            // (Where its parent stands, in the rider's own frame: what a blend between samples sets the head against.)
            state.headParentOwn.copy(w.frameInv).multiply(w.q1);
            head.quaternion.copy(w.q1.invert().multiply(w.q2));
        }

        // The arms: the palm on the grip, the knuckles along it, the elbow down and a little out.
        for (let i = 0; i < 2; i++) {
            const arm = state.arms[i], weight = arm.live && !state.armsFree ? hold : 0;
            for (let k = 0; k < 3; k++) arm.slots[k].weight = weight;
            arm.reached = true; arm.share = 0;
            if (!arm.live || weight <= 0) continue;
            const G = w.grip[i], C = w.tube[i], S = w.v0.setFromMatrixPosition(arm.upper.matrixWorld);
            // The hand lies half way between the arm's own line and the rider's front: the palm comes onto the grip from above.
            const A = w.v1.copy(G).sub(S).normalize().add(F);
            A.addScaledVector(C, -A.dot(C));
            let target = w.v3.copy(G), oriented = arm.oriented && A.lengthSq() > 1e-8;
            if (oriented) {
                A.normalize();
                const N = w.v2.crossVectors(A, C);
                w.qHand.setFromRotationMatrix(w.m0.makeBasis(A, C, N)).multiply(arm.palmBasis);
                // The palm faces along the cross for a right hand and against it for a left; it lies on the tube.
                target.addScaledVector(N, (arm.sign < 0 ? -1 : 1) * Rider.PALM_OVER);
                target.sub(w.v4.copy(arm.palmLocal).multiplyScalar(arm.handScale).applyQuaternion(w.qHand));
            } else {
                // A hand with no fingers marked: the wrist short of the grip by the palm, along the line from the shoulder.
                target.addScaledVector(w.v1.copy(G).sub(S).normalize(), -arm.palm);
            }
            const pole = w.v5.copy(U).multiplyScalar(-1).addScaledVector(L, arm.sign * Rider.ELBOW_OUT);
            arm.reached = Rider.reachLimb(arm.upper, arm.lower, arm.hand, target, pole, limb);
            arm.share = limb.share;
            if (oriented) arm.hand.quaternion.copy(w.q0.copy(limb.endParent).invert().multiply(w.qHand));
        }

        // The legs: the sole on the rest, the knee ahead and a little out; the stand-side foot on the ground at a stop.
        const stand = state.standSide === "right" ? 1 : 0;
        for (let i = 0; i < 2; i++) {
            const leg = state.legs[i], judged = i === stand && footAsked;
            let down = i === stand ? footDown : 0;
            leg.live = leg.has && !!vehiclePoint(state, vehicle, leg.name, steer, w.rest[i]);
            const weight = leg.live ? hold : down > 0 ? hold : 0;
            for (let k = 0; k < 3; k++) leg.slots[k].weight = weight;
            leg.reached = true; leg.share = 0;
            if (weight <= 0 && !judged) continue;
            // On the rest: the foot as it stands in the rider's frame, its sole's ball on the point.
            const ankle = w.ankle;
            w.qFoot.copy(frame).multiply(leg.footRest);
            if (leg.live) ankle.copy(w.rest[i]).sub(w.v4.copy(leg.sole).applyQuaternion(frame));
            else ankle.setFromMatrixPosition(leg.foot.matrixWorld);
            if (down > 0 || judged) {
                const hip = w.hip.setFromMatrixPosition(leg.upper.matrixWorld);
                const flatL = w.flatL.set(L.x, 0, L.z), flatF = w.flatF.set(F.x, 0, F.z);
                if (flatL.lengthSq() > 1e-8 && flatF.lengthSq() > 1e-8 && vehiclePoint(state, vehicle, "seat", 0, w.ball)) {
                    flatL.normalize(); flatF.normalize();
                    // The ground under the foot's own place (level with the vehicle where no map says): the ball of
                    // the foot goes there, FOOT_OUT out from the seat.
                    const ground = finite(state.footY) ? state.footY : w.p1.y;
                    if (judged) {
                        // Whether the leg reaches it once the vehicle has tipped onto the foot: the hip and the seat
                        // turned about the line the tires stand on by what is left of the tip.
                        const left = -leg.sign * Rider.FOOT_TIP * (1 - state.footDrawn) * DEG;
                        const hipThen = w.v4.copy(hip).sub(w.p1).applyAxisAngle(F, left).add(w.p1);
                        const ballThen = w.v6.copy(w.ball).sub(w.p1).applyAxisAngle(F, left).add(w.p1).addScaledVector(flatL, leg.sign * Rider.FOOT_OUT);
                        ballThen.y = ground;
                        const reaches = ground - w.p1.y <= Rider.FOOT_RISE && hipThen.distanceTo(ballThen) <= leg.length * 0.998 + leg.ball;
                        // (Judged out of reach before anything was drawn of it: the foot never leaves its rest.)
                        if (!reaches && state.footDrawn <= 0) { down = 0; state.footDown = 0; }
                        state.footOn = reaches;
                    }
                    if (down > 0) {
                        const ball = w.ball.addScaledVector(flatL, leg.sign * Rider.FOOT_OUT);
                        ball.y = ground;
                        w.qFlat.setFromAxisAngle(w.v2.set(0, 1, 0), Math.atan2(flatF.x, flatF.z)).multiply(leg.footRest);
                        const land = w.land.copy(ball).addScaledVector(flatL, -leg.sole.x).addScaledVector(flatF, -leg.sole.z);
                        land.y += leg.ankleHeight;
                        if (hip.distanceTo(land) > leg.length * 0.998) {
                            // On the ball of the foot: the ankle on the line to the hip, the foot turned to it.
                            w.v4.copy(ball).sub(land).normalize();
                            land.copy(hip).sub(ball).normalize().multiplyScalar(leg.ball).add(ball);
                            w.v6.copy(ball).sub(land).normalize();
                            w.qFlat.premultiply(w.q0.setFromUnitVectors(w.v4, w.v6));
                        }
                        ankle.lerp(land, down);
                        w.qFoot.slerp(w.qFlat, down);
                    }
                }
            }
            if (weight <= 0 || !(leg.live || down > 0)) { for (let k = 0; k < 3; k++) leg.slots[k].weight = 0; continue; }
            const pole = w.v5.copy(F).addScaledVector(L, leg.sign * Rider.KNEE_OUT).addScaledVector(U, Rider.KNEE_UP);
            leg.reached = Rider.reachLimb(leg.upper, leg.lower, leg.foot, ankle, pole, limb);
            leg.share = limb.share;
            leg.foot.quaternion.copy(w.q0.copy(limb.endParent).invert().multiply(w.qFoot));
        }
    }

    const isUnder = (nodeIn, above) => { for (let n = nodeIn; n; n = n.parent) if (n === above) return true; return false; };

    /**
     * A body that cannot be posed on a seat (no hips, arms and legs by name) is stood in it instead of sitting: its
     * middle at the seat point, upright, facing as its placement left it. True when it was placed.
     */
    Rider.perch = function(holder, vehicleHolder) {
        const object = holder && holder.object, vehicle = vehicleHolder && vehicleHolder.object, V = R.Vehicles;
        if (typeof THREE === "undefined" || !object || !vehicle) return false;
        const w = work();
        vehicle.updateWorldMatrix(true, false);
        // The seat as the vehicle binds it, else as its block writes it.
        if (!(V && typeof V.pointWorld === "function" && V.pointWorld(vehicle, "ride.0.seat", w.v0))) {
            if (!Rider.point(blockOf(vehicleHolder), 0, "seat", 0, w.v0)) return false;
            w.v0.applyMatrix4(vehicle.matrixWorld);
        }
        const size = object.userData && object.userData.glbSize;
        const tall = (size && finite(size.y) ? size.y : 1.7) * object.scale.y;
        object.position.set(w.v0.x, w.v0.y - Rider.PERCH * tall, w.v0.z);
        object.visible = true;
        return true;
    };

    //-------------------------------------------------------------------------
    // In the game: the pass after the models were synced.

    let aboard = null, rideId = 0, rideKey = "";

    /** After the sync: the player's model seated on what it rides and held to its points. One test on a map with no ride. */
    Rider.pass = function(scene) {
        const player = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
        if (!player || !(player._rrSeated || player._rrMount)) {
            if (aboard) { Rider.release(aboard); aboard = null; }
            if (convoy.length) Rider.passConvoy(null, null);
            return false;
        }
        const instances = scene ? scene._modelInstances : null;
        if (!instances || typeof R.modelInstanceKey !== "function") return false;
        const holder = instances.get(R.modelInstanceKey(player));
        if (!holder || !holder.object) return false;
        const ride = player._rrRide;
        let vehicleHolder = null;
        if (ride && ride.id > 0) {
            if (ride.id !== rideId) { rideId = ride.id; rideKey = "e" + ride.id; }
            vehicleHolder = instances.get(rideKey) || null;
        }
        if (aboard && aboard !== holder) Rider.release(aboard);
        aboard = holder;
        const wrote = Rider.seat(holder, player, holder.object, vehicleHolder);
        if (!holder.rider) {
            // A body that cannot sit stands in the seat; those behind it are seated all the same.
            if (holder.riderRefused === holder.object && player._rrSeated && !player._rrMount) Rider.perch(holder, vehicleHolder);
            Rider.passConvoy(instances, player);
            return false;
        }
        Rider.update(holder, vehicleHolder);
        Rider.passConvoy(instances, player);
        return wrote;
    };

    // The followers that ride vehicles of their own, seated and held to their points as the leader is.
    let convoy = [];
    Rider.passConvoy = function(instances, player) {
        const followers = player && player._followers && Array.isArray(player._followers._data) ? player._followers._data : null;
        const now = [];
        if (followers && instances) for (let i = 0; i < followers.length; i++) {
            const follower = followers[i], ride = follower._rrSeated ? follower._rrRide : null;
            if (!ride) continue;
            const holder = instances.get(R.modelInstanceKey(follower));
            if (!holder || !holder.object) continue;
            const vehicleHolder = instances.get("e" + ride.id) || null;
            now.push(holder);
            Rider.seat(holder, follower, holder.object, vehicleHolder);
            if (holder.rider) Rider.update(holder, vehicleHolder);
            else if (holder.riderRefused === holder.object) Rider.perch(holder, vehicleHolder);
        }
        for (let i = 0; i < convoy.length; i++) if (now.indexOf(convoy[i]) < 0) Rider.release(convoy[i]);
        convoy = now;
    };

    Rider.install = function() {
        const Scene = R.MapScene, proto = Scene && Scene.prototype;
        if (!proto || typeof proto.syncCharacterModels !== "function" || proto.syncCharacterModels.__reactorRider) return false;
        const sync = proto.syncCharacterModels;
        proto.syncCharacterModels = function() {
            const result = sync.apply(this, arguments);
            Rider.pass(this);
            return result;
        };
        proto.syncCharacterModels.__reactorRider = true;
        return true;
    };

    R.Rider = Rider;
    Rider.install();
    if (typeof module !== "undefined" && module.exports) module.exports = R;
})(typeof globalThis !== "undefined" ? globalThis : this);
