/**
 * MotionEditor - one motion of a 3D model on one timeline.
 *
 * A motion is every pose rule that shares a name: they fire together, so
 * they are one thing to the person making it. The editor shows them that
 * way: the motion's name and when it plays across the top, then a
 * storyboard: the motion's poses (the whole body at a moment) as cards in a
 * row with the seconds from one to the next between them. A card clicked
 * shows that pose on the model; a body part clicked on the model bends
 * there; + adds the next pose. The per-part timeline (each part's keys on
 * its own row) is a button away for fine timing. It saves back as the same
 * pose rules the game plays, one per part.
 *
 * Rules of other kinds in the motion (a swing, a spin, a bob) ride along
 * untouched and are listed; a held stance (a Guard, an Aim) is a motion
 * whose one key is the pose it takes and keeps.
 */
class RRMotionEditor {
    constructor(host) {
        this.host = host;
        this.motion = null;
        this.playhead = 0;
        this.playing = false;
        this.track = 0;
        this.root = null;
        this._playFrom = null;
        // Key poses (the whole body at a moment) unless the per-part timeline is asked for; a pose copied.
        this.perPart = false;
        this.clipboard = null;
        // The storyboard's selected pose (its index among poseTimes()).
        this.pose = 0;
        // Which sliders show for the part being bent: 'turn' (Bend, Turn, Tilt) or 'move'; the handle grabbed on the model picks it.
        this.handle = 'turn';
        // The storyboard's selected step (the time between pose `step` and the next), or null for a pose.
        this.step = null;
    }

    // ---- Key poses: the whole body at a moment, made, moved, mirrored and copied as one ----

    /** How close two keys' moments are to count as one pose. */
    static get POSE_SNAP() { return 0.015; }

    /** The tracks a pose is made of: every part keyed by pose (not a spin, swing or bob riding along). */
    poseTracks() { return (this.motion ? this.motion.tracks : []).filter(t => !t.other && t.keys); }

    /** The moments the motion has a pose at, from every part's keys, near ones as one: sorted, 0-1. */
    poseTimes() {
        const times = [];
        for (const t of this.poseTracks()) for (const k of t.keys) if (!times.some(at => Math.abs(at - k.at) < RRMotionEditor.POSE_SNAP)) times.push(k.at);
        return times.sort((a, b) => a - b);
    }

    /** The pose at the playhead, when the playhead stands on one. */
    poseHere() { return this.poseTimes().find(at => Math.abs(at - this.playhead) < RRMotionEditor.POSE_SNAP) ?? null; }

    /** A pose at the playhead: every part keyed there as it stands now (moving from one pose to the next). */
    addPose() { for (const t of this.poseTracks()) this.keyAtPlayhead(t, true); }

    /** The pose at `at` taken away from every part (a part keeps at least one key). */
    removePose(at) {
        for (const t of this.poseTracks()) {
            if (t.keys.length <= 1) continue;
            t.keys = t.keys.filter(k => Math.abs(k.at - at) >= RRMotionEditor.POSE_SNAP);
        }
    }

    /** A pose moved to another moment: every part's key there goes with it. */
    movePose(from, to) {
        const at = Math.max(0, Math.min(1, Math.round(to * 1000) / 1000));
        for (const t of this.poseTracks()) {
            for (const k of t.keys) if (Math.abs(k.at - from) < RRMotionEditor.POSE_SNAP) k.at = at;
            t.keys.sort((a, b) => a.at - b.at);
        }
        return at;
    }

    /** A part's other side by its name (LeftUpperLeg and RightUpperLeg, Left_Arm and Right_Arm), or null. */
    static mirrorPart(part) {
        const text = String(part || '');
        const swap = text.replace(/Left|Right|left|right|\bL\b|\bR\b/g, side => ({ Left: 'Right', Right: 'Left', left: 'right', right: 'left', L: 'R', R: 'L' })[side]);
        return swap !== text ? swap : null;
    }

    /** A turn seen in a mirror across the body (left to right): the same bend, the other way round the other two axes. */
    static mirrorTurn(rotate) { return [rotate[0], -rotate[1], -rotate[2]]; }

    /** The pose at the playhead as `{ part: { rotate, move } }`, every part keyed by pose. */
    poseAtPlayhead() {
        const out = {};
        for (const t of this.poseTracks()) out[t.part] = this.sampleTrack(t, this.playhead);
        return out;
    }

    /** Set parts' keys at the playhead to `pose` (`{ part: { rotate, move } }`), adding a part's track when it has none. */
    writePose(pose) {
        const m = this.motion;
        for (const [part, value] of Object.entries(pose)) {
            let t = m.tracks.find(track => track.part === part && !track.other);
            // A part new to the motion rests in every other pose, so setting it here leaves them as they were.
            if (!t) { t = { part, keys: m.hold ? [] : this.poseTimes().map(at => ({ at, rotate: [0, 0, 0], move: [0, 0, 0] })) }; m.tracks.push(t); }
            const stop = this.keyAtPlayhead(t, true);
            stop.rotate = value.rotate.map(v => Math.round(v * 10) / 10);
            stop.move = value.move.slice();
        }
    }

    // ---- The storyboard: poses as cards in a row, the seconds between them the only timing ----

    /** The motion's length in seconds. */
    seconds() { return Math.max(2, this.motion.frames) / 60; }

    /** Change the length to `length` seconds keeping every key where it is in seconds (what lies past it is clipped to the end). */
    _relength(length, shift = null) {
        const old = this.seconds(), next = Math.max(0.1, length);
        for (const t of this.poseTracks()) {
            for (const k of t.keys) {
                let sec = k.at * old;
                if (shift && sec > shift.after + 1e-6) sec += shift.by;
                k.at = Math.max(0, Math.min(1, Math.round(sec / next * 1000) / 1000));
            }
            t.keys.sort((a, b) => a.at - b.at);
        }
        this.motion.frames = Math.max(2, Math.round(next * 60));
    }

    /** The seconds from pose `i` to the next (or from the last pose to the end). */
    gapAfter(i) {
        const times = this.poseTimes(), L = this.seconds();
        return Math.round(((i + 1 < times.length ? times[i + 1] : 1) - times[i]) * L * 100) / 100;
    }

    /** The seconds from pose `i` to the next (the last's, to the end) set to `sec`: every pose after it moves, the motion grows or shrinks. */
    setGap(i, sec) {
        const times = this.poseTimes();
        if (i < 0 || i >= times.length) return false;
        const L = this.seconds(), by = Math.max(i + 1 < times.length ? 0.05 : 0, sec) - ((i + 1 < times.length ? times[i + 1] : 1) - times[i]) * L;
        this._relength(L + by, { after: times[i] * L, by });
        return true;
    }

    /** A little picture of how a step goes: progress over time, as an SVG path. */
    static easeCurve(ease) {
        const at = t => ease === 'smooth' ? t * t * (3 - 2 * t) * 0.6 + t * 0.4
            : typeof Reactor3D !== 'undefined' && Reactor3D.keyEase ? Reactor3D.keyEase(ease, t) : t;
        const points = [];
        for (let i = 0; i <= 24; i++) {
            const t = i / 24, v = at(t);
            points.push(`${(2 + t * 28).toFixed(1)},${(17 - v * 13).toFixed(1)}`);
        }
        return `<svg class="r3d-motion-curve" viewBox="0 0 32 20" aria-hidden="true"><path d="M${points.join(' L')}"/></svg>`;
    }

    /** How a step may go (the runtime's key eases), smooth (none) first, with what the storyboard calls each. */
    static get EASES() { return ['steady', 'in', 'out', 'both', 'snap', 'overshoot']; }
    static EASE_CHOICES() {
        return [['smooth', 'Smooth', 'Flows on through the pose'], ['steady', 'Steady', 'One speed all the way'],
            ['in', 'Start slow', 'Starts slow, ends fast'], ['out', 'End slow', 'Starts fast, ends slow'],
            ['both', 'Slow both ends', 'Eases out of one pose and into the next, stopping there'],
            ['snap', 'Snap', 'Gets to the next pose almost at once, then holds it'], ['overshoot', 'Overshoot', 'Goes past the pose and settles back']];
    }

    /** How the step from pose `i` to the next goes: an ease, 'smooth' (none), or 'mixed' when the parts differ. */
    stepEase(i) {
        const times = this.poseTimes();
        if (i < 0 || i + 1 >= times.length) return 'smooth';
        const seen = new Set();
        for (const t of this.poseTracks()) {
            const k = t.keys.find(key => Math.abs(key.at - times[i + 1]) < RRMotionEditor.POSE_SNAP);
            if (k) seen.add(k.ease || 'smooth');
        }
        return seen.size === 1 ? [...seen][0] : seen.size ? 'mixed' : 'smooth';
    }

    /** The step from pose `i` to the next goes as `ease` ('smooth' for none) for every part: each keyed at the next pose. */
    setStepEase(i, ease) {
        const times = this.poseTimes();
        if (i < 0 || i + 1 >= times.length) return false;
        const playhead = this.playhead;
        this.playhead = times[i + 1];
        for (const t of this.poseTracks()) {
            const k = t.keys.find(key => Math.abs(key.at - times[i + 1]) < RRMotionEditor.POSE_SNAP) || this.keyAtPlayhead(t, true);
            if (!k) continue;
            if (RRMotionEditor.EASES.includes(ease)) k.ease = ease; else delete k.ease;
        }
        this.playhead = playhead;
        return true;
    }

    /** Whether the motion plays once (an on-demand motion that does not repeat): it ends on its last pose. */
    playsOnce() { return !!this.motion && this.motion.trigger === 'action' && !this.motion.repeat; }

    /**
     * A new pose after pose `i` (the last when -1 or past it), `gap` seconds on, the same as pose `i`; the motion
     * grows by the gap. A new last pose of a motion played once ends it: the time after the old last pose goes.
     */
    insertPose(i, gap = 0.3) {
        const times = this.poseTimes();
        if (!times.length) { this.playhead = 0; this.addPose(); return 0; }
        const at = i < 0 || i >= times.length ? times.length - 1 : i;
        this.playhead = times[at];
        const copy = this.poseAtPlayhead(), L = this.seconds(), from = times[at] * L;
        if (at === times.length - 1 && this.playsOnce()) {
            // Every key stays where it is in seconds; the new pose is the end.
            this._relength(from + gap);
            this.playhead = 1;
        } else {
            this._relength(L + gap, { after: from, by: gap });
            this.playhead = Math.round((from + gap) / (L + gap) * 1000) / 1000;
        }
        this.writePose(copy);
        return this.playhead;
    }

    /** Pose `i` taken away with the time before it (the first, the time after it), so the rest close up: the undoing of insertPose. */
    deletePose(i) {
        const times = this.poseTimes();
        if (times.length <= 1 || i < 0 || i >= times.length) return false;
        const L = this.seconds(), from = i === 0 ? 0 : times[i - 1] * L;
        const gap = (i === 0 ? times[1] - times[0] : times[i] - times[i - 1]) * L;
        this.removePose(times[i]);
        this._relength(L - gap, { after: from, by: -gap });
        this.playhead = this.poseTimes()[Math.max(0, i - 1)] ?? 0;
        return true;
    }

    /** Whether a pose is shown to bend: not while a step (the time between two poses) is picked, or played. */
    bending() { return !!this.motion && (this.perPart || this.step === null); }

    /**
     * The handles on the model set the part being bent: `field` ('rotate' or 'move') `axis` to `value` in the pose
     * shown, the sliders following as it drags; `final` (the drag let go) saves it. With no field, only saves.
     */
    setPartValue(field, axis, value, final) {
        const m = this.motion, track = m && m.tracks[this.track];
        if (!track || track.other || !this.bending()) return;
        if (field) {
            const stop = this.keyAtPlayhead(track, true);
            if (!stop) return;
            stop[field][axis] = value;
            const cls = field === 'rotate' ? 'r3d-motion-rot' : 'r3d-motion-move';
            if (this.root && this.root.querySelectorAll) this.root.querySelectorAll(`.${cls}[data-axis="${axis}"], .${cls}-num[data-axis="${axis}"]`).forEach(input => { input.value = value; });
            this._dirty = true;
        }
        if (final && this._dirty) { this._dirty = false; this.commit(); this.render(); }
    }

    /** The pose at the playhead mirrored: each side takes the other's turn, seen in a mirror; the middle turns back. */
    mirrorPose() {
        const pose = this.poseAtPlayhead(), next = {};
        // The model's own frames when the host knows them (a part's left and right joints may not be turned alike).
        const flip = (from, to, value) => (this.host._mirrorPartValue && this.host._mirrorPartValue(from, to, value))
            || { rotate: RRMotionEditor.mirrorTurn(value.rotate), move: [-value.move[0], value.move[1], value.move[2]] };
        for (const [part, value] of Object.entries(pose)) {
            const other = RRMotionEditor.mirrorPart(part);
            next[other || part] = flip(part, other || part, value);
        }
        // A side with no partner keyed here goes back to rest when its partner had nothing.
        for (const part of Object.keys(pose)) if (!next[part]) next[part] = { rotate: [0, 0, 0], move: [0, 0, 0] };
        this.writePose(next);
    }

    /** Every pose mirrored: a motion made with the left side becomes the same with the right (a left punch a right one). */
    mirrorMotion() {
        const playhead = this.playhead;
        for (const at of this.poseTimes()) { this.playhead = at; this.mirrorPose(); }
        this.playhead = playhead;
    }

    get active() { return !!this.motion; }

    _t(text, params) { return this.host._t(text, params); }

    static TRIGGERS() {
        return [['action', 'On demand'], ['always', 'Always'], ['idle', 'While idle'], ['moving', 'While moving'], ['walking', 'While walking'],
            ['dashing', 'While dashing'], ['jumping', 'While jumping'], ['swimming', 'While swimming'], ['treading', 'While treading water'], ['climbing', 'While climbing'],
            ['riding', 'While riding']];
    }

    /** Pose-rule fields the editor writes; anything else on a rule (effects, cycles) is kept as it was. */
    static get MANAGED() { return ['name', 'part', 'type', 'trigger', 'period', 'keys', 'hold', 'rotate', 'move', 'repeat']; }

    /** Open the motion of this name (its pose rules), or a new one. */
    open(name) {
        const rules = this.host.rawAnimations.filter(raw => raw && raw.name === name && raw.type !== 'clip');
        const first = rules.find(raw => raw.type === 'pose') || rules[0] || {};
        const hold = rules.length > 0 && rules.every(raw => raw.type !== 'pose' || raw.hold);
        // A new motion starts as one pose with a beat after it.
        const frames = rules.length ? Math.max(2, Math.round((Number(first.period) || 30) * (first.type === 'pose' ? 2 : 1))) : 18;
        const tracks = rules.map(raw => {
            if (raw.type !== 'pose') return { part: raw.part || '', other: JSON.parse(JSON.stringify(raw)) };
            // In order and within the motion, as the runtime reads them.
            const keys = Array.isArray(raw.keys) && raw.keys.length
                ? raw.keys.filter(stop => stop && typeof stop === 'object')
                    .map(stop => Object.assign({ at: Math.min(1, Math.max(0, Number(stop.at) || 0)), rotate: RRMotionEditor.vec(stop.rotate), move: RRMotionEditor.vec(stop.move) }, RRMotionEditor.EASES.includes(stop.ease) ? { ease: stop.ease } : {}))
                    .sort((a, b) => a.at - b.at)
                : [{ at: hold ? 1 : 0.5, rotate: RRMotionEditor.vec(raw.rotate), move: RRMotionEditor.vec(raw.move) }];
            const extra = JSON.parse(JSON.stringify(raw));
            for (const field of RRMotionEditor.MANAGED) delete extra[field];
            return { part: raw.part || '', keys, extra };
        });
        this.motion = {
            name: name || this.freshName(),
            // The name its rules are saved under (an unnamed motion's too), or null for a new one.
            original: rules.length ? name : null,
            trigger: first.trigger || 'action',
            frames,
            repeat: !!first.repeat,
            hold,
            tracks
        };
        this.track = 0;
        this.playhead = this.poseTimes()[0] ?? 0;
        this.pose = 0;
        this.step = null;
        this.playing = false;
        this.render();
        this.host.renderRuleList();
    }

    /** A click on the model: that part's track, added when the motion has none. */
    pickPart(part) {
        const m = this.motion;
        let at = m.tracks.findIndex(t => t.part === part && !t.other);
        if (at < 0) {
            // At rest in every pose there is, so bending it in one pose leaves the others as they were.
            const times = this.poseTimes();
            m.tracks.push({ part, keys: m.hold ? [{ at: 1, rotate: [0, 0, 0], move: [0, 0, 0] }] : times.map(t => ({ at: t, rotate: [0, 0, 0], move: [0, 0, 0] })) });
            at = m.tracks.length - 1;
        }
        this.track = at;
        this.render();
    }

    /** A spin, swing or bob in this motion: made on the classic card, under the motion's name. */
    addOther(type) {
        const m = this.motion, host = this.host;
        this.commit();
        this.close();
        host.addSingleRule();
        Object.assign(host._work, { name: m.name, motion: type, trigger: m.trigger });
        host._syncWorkRule();
        host.renderEditCard();
    }

    close() {
        this.motion = null;
        this.playing = false;
        if (this.host._sim.action && this.host._sim.action.name === '__motion') this.host._sim.action = null;
        if (this.root) this.root.remove();
        this.root = null;
        this.host._markMotionPart?.(null);
        this.host.renderRuleList();
    }

    freshName() {
        const taken = new Set(this.host.rawAnimations.map(raw => raw && raw.name));
        let n = 1;
        while (taken.has(`${this._t('Motion')} ${n}`)) n++;
        return `${this._t('Motion')} ${n}`;
    }

    static vec(value) {
        const raw = Array.isArray(value) ? value : [];
        return [0, 1, 2].map(i => Number.isFinite(Number(raw[i])) ? Number(raw[i]) : 0);
    }

    /** A track's pose at a point of the motion, as the runtime samples it. */
    sampleTrack(track, at) {
        if (!track || !track.keys || typeof Reactor3D === 'undefined') return { rotate: [0, 0, 0], move: [0, 0, 0] };
        if (this.motion.hold) return { rotate: track.keys[0].rotate.slice(), move: track.keys[0].move.slice() };
        const keys = track.keys.map(k => ({ at: k.at, rotate: k.rotate, move: k.move, resize: [1, 1, 1], ease: k.ease }));
        const sampled = Reactor3D.sampleModelKeys({ keys, trigger: this.motion.trigger }, Math.max(0, Math.min(1, at)));
        return { rotate: sampled.rotate, move: sampled.move };
    }

    /** The key a slider edits: the selected part's key at the playhead, made when there is none. */
    keyAtPlayhead(track, create) {
        if (!track || !track.keys) return null;
        if (this.motion.hold) return track.keys[0] || (create ? (track.keys[0] = { at: 1, rotate: [0, 0, 0], move: [0, 0, 0] }) : null);
        let stop = track.keys.find(k => Math.abs(k.at - this.playhead) < 0.006);
        if (!stop && create) {
            const pose = this.sampleTrack(track, this.playhead);
            stop = { at: Math.round(this.playhead * 1000) / 1000, rotate: pose.rotate.map(v => Math.round(v * 10) / 10), move: pose.move.slice() };
            track.keys.push(stop);
            track.keys.sort((a, b) => a.at - b.at);
        }
        return stop || null;
    }

    /** The motion as the pose rules it saves as, one per part. */
    rulesOf(motion, name = motion.name, trigger = motion.trigger) {
        const period = Math.max(1, Math.round(motion.frames / 2));
        return motion.tracks.map(track => {
            if (track.other) return Object.assign(JSON.parse(JSON.stringify(track.other)), { name, trigger });
            const rule = Object.assign(JSON.parse(JSON.stringify(track.extra || {})), { name, part: track.part, type: 'pose', trigger, period });
            if (motion.hold) Object.assign(rule, { hold: true, rotate: track.keys[0].rotate.slice(), move: track.keys[0].move.slice() });
            else rule.keys = track.keys.map(k => Object.assign({ at: Math.round(k.at * 1000) / 1000, rotate: k.rotate.map(v => Math.round(v * 10) / 10), move: k.move.map(v => Math.round(v * 1000) / 1000) }, k.ease ? { ease: k.ease } : {}));
            // An on-demand motion repeats until stopped; a jump's replays through a long fall instead of holding.
            if (motion.repeat && (trigger === 'action' || trigger === 'jumping')) rule.repeat = true;
            return rule;
        });
    }

    /** Write the motion back into the model's rules and save. */
    commit() {
        const motion = this.motion;
        if (!motion) return;
        const host = this.host;
        // Only the rules saved as this motion are replaced; a new one has none yet.
        const ours = raw => raw && raw.type !== 'clip' && motion.original !== null && raw.name === motion.original;
        const at = host.rawAnimations.findIndex(ours);
        const kept = host.rawAnimations.filter(raw => !ours(raw));
        const mine = this.rulesOf(motion);
        const place = at >= 0 ? Math.min(at, kept.length) : kept.length;
        kept.splice(place, 0, ...mine);
        const before = host.rawAnimations;
        host.rawAnimations = kept;
        // Rules after this one moved when its part count changed.
        if (typeof host._followRuleIndexes === 'function') host._followRuleIndexes(before);
        // The list's selection (what Delete removes) follows the motion to where it now stands.
        host.selectedRule = mine.length ? place : -1;
        motion.original = motion.name;
        host.saveRules();
        host.renderRuleList();
    }

    /**
     * The rules the preview plays while the editor is open: the motion
     * stands still at the playhead (or plays through), everything else holds
     * its rest, so only this motion moves the model.
     */
    previewRules(rules, frame) {
        const motion = this.motion;
        if (!motion) return rules;
        const off = rule => ({ ...rule, trigger: 'action', hold: false, name: ' ' });
        const out = rules.map(rule => (rule.type === 'clip' || rule.trigger !== 'action' || rule.name === motion.original || rule.name === motion.name) ? off(rule) : rule);
        const preview = typeof Reactor3D !== 'undefined'
            ? Reactor3D.readModelAnimationRules({ animations: this.rulesOf(Object.assign({}, motion, { hold: false, tracks: motion.tracks.map(t => t.other ? t : (motion.hold ? { part: t.part, keys: [{ at: 0, rotate: t.keys[0].rotate, move: t.keys[0].move }, { at: 1, rotate: t.keys[0].rotate, move: t.keys[0].move }] } : t)) }), '__motion', 'action') })
            : [];
        const frames = Math.max(2, motion.frames);
        if (this.playing) {
            if (this._playFrom === null) this._playFrom = frame - this.playhead * frames;
            let t = (frame - this._playFrom) / frames;
            if (t >= 1) {
                if (motion.trigger !== 'action' || motion.repeat) { this._playFrom = frame; t = 0; }
                else {
                    this.playing = false; this._playFrom = null; t = 1;
                    // The storyboard stays where the motion ended, on its last pose.
                    if (!this.perPart) { const times = this.poseTimes(); this.pose = Math.max(0, times.length - 1); t = times[this.pose] ?? 0; this.playhead = t; this.render(); } else this.renderPlayButton();
                }
            }
            this.playhead = Math.max(0, Math.min(1, t));
            this.drawPlayhead();
        }
        // One frame short of the end, so a key at the very end is shown, not the rest after it.
        const shown = Math.min(this.playhead, 1 - 0.5 / frames);
        this.host._sim.action = { name: '__motion', frame: frame - shown * frames, until: Infinity };
        return out.concat(preview);
    }

    // ---- The panel -------------------------------------------------------

    render() {
        const wrap = this.host._detail && this.host._detail.querySelector('.r3d-model-workspace');
        if (!wrap || !this.motion) return;
        if (!this.root) {
            this.root = document.createElement('div');
            this.root.className = 'r3d-motion';
            wrap.appendChild(this.root);
        }
        const m = this.motion, tt = text => this._t(text);
        // (A name its file damaged is shown without the damage; the stored name is the part's identity and stays.)
        const partName = part => part === '' ? tt('Whole model') : typeof RRPartNames !== 'undefined' ? RRPartNames.readable(part) : part;
        const used = new Set(m.tracks.map(t => t.part));
        const addable = [''].concat(this.host.partNames || []).filter(part => !used.has(part));
        const track = m.tracks[this.track];
        const pose = track && !track.other ? this.sampleTrack(track, this.playhead) : null;
        const keyed = track && !track.other ? this.keyAtPlayhead(track, false) : null;
        const slider = (cls, axis, value, min, max, step, label, color) => `
            <label class="r3d-motion-slider${color ? ` axis-${color}` : ''}"><span>${label}</span>
                <input type="range" class="${cls}" data-axis="${axis}" min="${min}" max="${max}" step="${step}" value="${value}">
                <input type="number" class="database-field-value ${cls}-num" data-axis="${axis}" min="${min}" max="${max}" step="${step}" value="${Math.round(value * 100) / 100}"></label>`;
        this.root.innerHTML = `
            <div class="lit-section-header r3d-motion-head">
                <button type="button" class="rr-btn-chip r3d-motion-play" data-rr-i18n-skip="1"></button>
                <input type="text" class="database-field-value r3d-motion-name" value="${rrEscapeHtml(m.name)}" title="${rrEscapeHtml(tt('Name'))}">
                <select class="database-field-value r3d-motion-trigger" title="${rrEscapeHtml(tt('Play when'))}">${RRMotionEditor.TRIGGERS().map(([v, l]) => `<option value="${v}"${v === m.trigger ? ' selected' : ''}>${rrEscapeHtml(tt(l))}</option>`).join('')}</select>
                ${this.perPart ? `<label class="r3d-motion-field">${rrEscapeHtml(tt('Length'))} <input type="number" class="database-field-value r3d-motion-length" min="0.1" max="60" step="0.1" value="${(m.frames / 60).toFixed(2)}"> s</label>` : m.hold ? '' : `<span class="r3d-motion-field" title="${rrEscapeHtml(tt('Length'))}">${(m.frames / 60).toFixed(2)} s</span>`}
                ${m.trigger === 'action' || m.trigger === 'jumping' ? `<label class="r3d-motion-field"><input type="checkbox" class="r3d-motion-repeat"${m.repeat ? ' checked' : ''}> ${rrEscapeHtml(tt('Repeat'))}</label>
                ${m.trigger === 'action' ? `<label class="r3d-motion-field" title="${rrEscapeHtml(tt('Held until another stance moves the same parts.'))}"><input type="checkbox" class="r3d-motion-hold"${m.hold ? ' checked' : ''}> ${rrEscapeHtml(tt('Stance'))}</label>` : ''}` : ''}
                <span style="flex:1"></span>
                <button type="button" class="r3d-motion-close" title="${rrEscapeHtml(tt('Close'))}">×</button>
            </div>
            ${this.perPart ? '' : this.poseBody(partName, track, pose, slider)}
            ${this.perPart ? `            <div class="r3d-motion-body">
                <div class="r3d-motion-tracks">
                    ${m.tracks.map((t, i) => `<div class="r3d-motion-track${i === this.track ? ' active' : ''}" data-i="${i}"><span>${rrEscapeHtml(partName(t.part))}${t.other ? ` <em>· ${rrEscapeHtml(tt(t.other.type === 'spin' ? 'Spin' : t.other.type === 'swing' ? 'Swing' : 'Bob'))}</em>` : ''}</span><button type="button" class="r3d-motion-track-remove" data-i="${i}" title="${rrEscapeHtml(tt('Remove'))}">×</button></div>`).join('')}
                    <select class="database-field-value r3d-motion-add"><option value="">${rrEscapeHtml(tt('+ Part…'))}</option>${addable.map(p => `<option value="${rrEscapeHtml(p)}">${rrEscapeHtml(partName(p))}</option>`).join('')}${m.hold ? '' : `<optgroup label="${rrEscapeHtml(tt('Other motion'))}">${['spin', 'swing', 'bob'].map(type => `<option value="@${type}">${rrEscapeHtml(tt(type === 'spin' ? 'Spin' : type === 'swing' ? 'Swing' : 'Bob'))}</option>`).join('')}</optgroup>`}</select>
                </div>
                <div class="r3d-motion-timeline r3d-motion-parts">
                    <button type="button" class="rr-btn-chip r3d-motion-backtoposes">${rrEscapeHtml(tt('← Storyboard'))}</button>
                    <div class="r3d-motion-ruler">${[0, 0.25, 0.5, 0.75, 1].map(f => `<span style="left:${f * 100}%">${(f * m.frames / 60).toFixed(1)}s</span>`).join('')}</div>
                    ${m.tracks.map((t, i) => `<div class="r3d-motion-row${i === this.track ? ' active' : ''}" data-i="${i}">${(t.keys || []).map((k, j) => `<span class="r3d-motion-key${m.hold ? ' stance' : ''}" data-i="${i}" data-k="${j}" style="left:${(m.hold ? 1 : k.at) * 100}%"></span>`).join('')}</div>`).join('')}
                    <div class="r3d-motion-playhead"></div>
                </div>
                <div class="r3d-motion-pose">
                    ${track && !track.other ? `
                        <div class="r3d-motion-pose-title">${rrEscapeHtml(partName(track.part))} · ${m.hold ? rrEscapeHtml(tt('Stance')) : `${Math.round(this.playhead * 100)}%`}${keyed || m.hold ? '' : ` <em>${rrEscapeHtml(tt('(between keys)'))}</em>`}</div>
                        ${slider('r3d-motion-rot', 0, pose.rotate[0], -180, 180, 1, 'X')}
                        ${slider('r3d-motion-rot', 1, pose.rotate[1], -180, 180, 1, 'Y')}
                        ${slider('r3d-motion-rot', 2, pose.rotate[2], -180, 180, 1, 'Z')}
                        ${track.part === '' ? slider('r3d-motion-move', 1, pose.move[1], -1, 1, 0.01, tt('Lift')) : ''}
                        ${!m.hold ? `<div class="r3d-motion-pose-actions">${keyed ? `<button type="button" class="rr-btn-chip r3d-motion-key-delete">${rrEscapeHtml(tt('Delete key'))}</button>` : `<button type="button" class="rr-btn-chip r3d-motion-key-set">${rrEscapeHtml(tt('Add key'))}</button>`}</div>` : ''}`
                        : `<div class="r3d-motion-pose-title">${rrEscapeHtml(track ? tt('Edited on its own card.') : tt('Add a part to move it.'))}</div>${track && track.other ? `<button type="button" class="rr-btn-chip r3d-motion-other">${rrEscapeHtml(tt('Edit'))}</button>` : ''}`}
                </div>
` : ''}
            </div>`;
        this.renderPlayButton();
        this.drawPlayhead();
        this.bind();
        if (!this.perPart) this.bindPoses();
        // The part being bent lit on the model (none while a step is picked).
        this.host._markMotionPart?.(track && !track.other && this.bending() ? track.part : null);
    }

    /**
     * The storyboard: the motion's poses as cards in a row, the seconds from one to the next between them
     * (the only timing); what to do with the pose shown as a few buttons; and the body part clicked on the
     * model, to bend. The per-part timeline is a button away.
     */
    poseBody(partName, track, pose, slider) {
        const m = this.motion, tt = text => this._t(text);
        const times = this.poseTimes(), parts = this.poseTracks().length;
        const button = (cls, label, title, disabled) => `<button type="button" class="rr-btn-chip ${cls}"${title ? ` title="${rrEscapeHtml(title)}"` : ''}${disabled ? ' disabled' : ''}>${rrEscapeHtml(label)}</button>`;
        const count = Math.max(1, times.length);
        const card = i => `<button type="button" class="r3d-motion-card${i === this.pose && this.step === null ? ' on' : ''}" data-i="${i}" title="${rrEscapeHtml(tt('Show this pose'))}"><b>${i + 1}</b><span>${rrEscapeHtml(m.hold ? tt('Stance') : tt('Pose'))}</span></button>`;
        // After the last pose: the time it takes to go back to the first (a loop) or to rest (a one-off).
        const loops = m.trigger !== 'action' || m.repeat;
        const choices = RRMotionEditor.EASE_CHOICES();
        const easeName = ease => ease === 'mixed' ? tt('Mixed') : tt((choices.find(c => c[0] === ease) || choices[0])[1]);
        // A step between two poses as a card of its own: its seconds, and how it goes as a little curve.
        const stepCard = i => {
            const last = i === times.length - 1, ease = last ? 'smooth' : this.stepEase(i);
            const label = last ? (loops ? tt('↻ to 1') : tt('→ rest')) : easeName(ease);
            return `<button type="button" class="r3d-motion-step${last ? ' r3d-motion-tail' : ''}${this.step === i ? ' on' : ''}" data-step="${i}" title="${rrEscapeHtml(last ? (loops ? tt('Seconds back to the first pose') : tt('Seconds back to rest as part of the motion (0: it ends on the last pose, then eases back)')) : tt('The time to the next pose, and how it goes'))}">
                <b>${this.gapAfter(i).toFixed(2)}s</b>${last ? '' : RRMotionEditor.easeCurve(ease)}<span>${rrEscapeHtml(label)}</span></button>`;
        };
        const board = `<div class="r3d-motion-board">
                ${Array.from({ length: count }, (_, i) => card(i) + (!m.hold && i < count - 1 ? stepCard(i) : '')).join('')}
                ${m.hold ? '' : `<button type="button" class="r3d-motion-card r3d-motion-card-add" title="${rrEscapeHtml(tt('The next pose: a copy of this one, to change'))}"${parts ? '' : ' disabled'}><b>+</b><span>${rrEscapeHtml(tt('Next pose'))}</span></button>${times.length ? stepCard(times.length - 1) : ''}`}
            </div>`;
        // A step picked: its timing in place of the pose's buttons.
        if (this.step !== null && (this.step >= times.length || m.hold)) this.step = null;
        const step = this.step;
        const timing = step === null ? '' : `<div class="r3d-motion-timing">
                <label class="r3d-motion-seconds">${rrEscapeHtml(tt('Seconds'))}
                    <button type="button" class="rr-btn-chip r3d-motion-sec-less" title="−0.05 s">−</button>
                    <input type="number" class="database-field-value r3d-motion-gap-sec" data-i="${step}" min="${step === times.length - 1 ? 0 : 0.05}" max="30" step="0.05" value="${this.gapAfter(step)}">
                    <button type="button" class="rr-btn-chip r3d-motion-sec-more" title="+0.05 s">+</button></label>
                ${step === times.length - 1 ? `<span class="r3d-motion-hint">${rrEscapeHtml(loops ? tt('Seconds back to the first pose') : tt('Seconds back to rest as part of the motion (0: it ends on the last pose, then eases back)'))}</span>`
                    : `<div class="r3d-motion-eases" role="group">${choices.map(([id, label, title]) => `<button type="button" class="r3d-motion-ease${this.stepEase(step) === id ? ' on' : ''}" data-ease="${id}" title="${rrEscapeHtml(tt(title))}">${RRMotionEditor.easeCurve(id)}<span>${rrEscapeHtml(tt(label))}</span></button>`).join('')}</div>`}
            </div>`;
        const actions = step !== null ? timing : `<div class="r3d-motion-strip-actions">
                ${button('r3d-motion-pose-mirror', tt('Flip pose ⇆'), tt('Swap the left and right sides of this pose, as in a mirror'), !parts)}
                ${m.hold ? '' : button('r3d-motion-mirror-all', tt('Flip motion ⇆'), tt('Swap left and right in every pose: a left punch becomes a right one'), !parts)}
                ${button('r3d-motion-pose-copy', tt('Copy'), tt('Copy the whole body\'s pose here'), !parts)}
                ${button('r3d-motion-pose-paste', tt('Paste'), tt('Put the copied pose here'), !this.clipboard)}
                ${m.hold ? '' : button('r3d-motion-pose-remove', tt('Delete pose'), '', times.length <= 1)}
                <span class="r3d-motion-spacer"></span>
                ${m.hold ? '' : `<button type="button" class="r3d-motion-link r3d-motion-perpart" title="${rrEscapeHtml(tt('Time each part on its own row'))}">${rrEscapeHtml(tt('Fine timing…'))}</button>`}
            </div>`;
        const move = this.handle === 'move';
        const handles = `<div class="r3d-motion-handles" role="group">
                <button type="button" class="r3d-motion-handle${move ? '' : ' on'}" data-handle="turn" title="${rrEscapeHtml(tt('Rings on the model turn the part'))}">⟳ ${rrEscapeHtml(tt('Rotate'))}</button>
                <button type="button" class="r3d-motion-handle${move ? ' on' : ''}" data-handle="move" title="${rrEscapeHtml(tt('Arrows on the model move the part'))}">✥ ${rrEscapeHtml(tt('Move'))}</button></div>`;
        const part = step !== null ? `<div class="r3d-motion-pose-empty">${rrEscapeHtml(this._t(step === times.length - 1 ? (loops ? 'The time from pose {from} back to pose 1.' : 'The time from pose {from} back to rest.') : 'The time from pose {from} to pose {to}.', { from: step + 1, to: step + 2 }))}<br>${rrEscapeHtml(tt('Click a pose card to bend it.'))}</div>`
            : track && !track.other ? `<div class="r3d-motion-pose-title">${rrEscapeHtml(partName(track.part))}</div>
                ${handles}
                ${move ? `${slider('r3d-motion-move', 0, pose.move[0], -1, 1, 0.01, tt('Side'), 'x')}
                ${slider('r3d-motion-move', 1, pose.move[1], -1, 1, 0.01, tt('Up'), 'y')}
                ${slider('r3d-motion-move', 2, pose.move[2], -1, 1, 0.01, tt('Forward'), 'z')}`
                : `${slider('r3d-motion-rot', 0, pose.rotate[0], -180, 180, 1, tt('Bend'), 'x')}
                ${slider('r3d-motion-rot', 1, pose.rotate[1], -180, 180, 1, tt('Turn'), 'y')}
                ${slider('r3d-motion-rot', 2, pose.rotate[2], -180, 180, 1, tt('Tilt'), 'z')}`}
                <div class="r3d-motion-pose-actions">${button('r3d-motion-part-reset', tt('Reset'), tt('This part back to its rest in this pose'))}</div>`
            : `<div class="r3d-motion-pose-empty">${rrEscapeHtml(tt('Click a body part on the model to bend it.'))}</div>`;
        return `<div class="r3d-motion-body r3d-motion-posebody">
                <div class="r3d-motion-main">${board}${actions}
                    ${step !== null ? '' : `<div class="r3d-motion-hint">${rrEscapeHtml(m.hold ? tt('A stance is one pose, held. Click a body part on the model to bend it.') : parts ? tt('Click a pose to see it, click a body part to bend it there, click the time between two poses to change how it goes. + adds the next pose.') : tt('Click a body part on the model to bend it into the first pose.'))}</div>`}
                </div>
                <div class="r3d-motion-pose">${part}</div>
            </div>`;
    }

    /** The storyboard's controls. */
    bindPoses() {
        const root = this.root, m = this.motion;
        const changed = () => { this.commit(); this.render(); };
        const show = i => {
            const times = this.poseTimes();
            this.pose = Math.max(0, Math.min(i, times.length - 1));
            this.playhead = times[this.pose] ?? 0;
            this.playing = false; this._playFrom = null;
        };
        root.querySelector('.r3d-motion-perpart')?.addEventListener('click', () => { this.perPart = true; this.render(); });
        root.querySelectorAll('.r3d-motion-handle').forEach(el => el.addEventListener('click', () => { this.handle = el.dataset.handle; this.render(); }));
        root.querySelectorAll('.r3d-motion-card[data-i]').forEach(el => el.addEventListener('click', () => { this.step = null; show(Number(el.dataset.i)); this.render(); }));
        // A step: its timing below, and the model at the pose it leaves.
        root.querySelectorAll('.r3d-motion-step').forEach(el => el.addEventListener('click', () => {
            const i = Number(el.dataset.step);
            this.step = this.step === i ? null : i;
            show(i);
            this.render();
        }));
        const nudge = by => {
            const input = root.querySelector('.r3d-motion-timing .r3d-motion-gap-sec');
            if (!input) return;
            const sec = Math.max(Number(input.min) || 0, Math.round((Number(input.value) + by) * 100) / 100);
            if (this.setGap(this.step, sec)) { show(this.step); changed(); }
        };
        root.querySelector('.r3d-motion-sec-less')?.addEventListener('click', () => nudge(-0.05));
        root.querySelector('.r3d-motion-sec-more')?.addEventListener('click', () => nudge(0.05));
        // A way for the step to go, chosen: kept, and played from the pose it leaves so it is seen.
        root.querySelectorAll('.r3d-motion-ease').forEach(el => el.addEventListener('click', () => {
            const i = this.step;
            if (i === null || !this.setStepEase(i, el.dataset.ease)) return;
            this.commit();
            show(i);
            this.playing = true;
            this.render();
        }));
        root.querySelector('.r3d-motion-card-add')?.addEventListener('click', () => {
            this.step = null;
            const at = this.insertPose(this.pose, 0.3);
            this.pose = this.poseTimes().findIndex(t => Math.abs(t - at) < RRMotionEditor.POSE_SNAP);
            this.playing = false;
            changed();
        });
        root.querySelectorAll('.r3d-motion-gap-sec').forEach(input => input.addEventListener('change', () => {
            const sec = Number(input.value);
            if (Number.isFinite(sec) && this.setGap(Number(input.dataset.i), sec)) { show(this.pose); changed(); } else this.render();
        }));
        root.querySelector('.r3d-motion-pose-remove')?.addEventListener('click', () => { if (this.deletePose(this.pose)) { this.step = null; show(this.pose - 1); changed(); } });
        root.querySelector('.r3d-motion-pose-mirror')?.addEventListener('click', () => { this.mirrorPose(); changed(); });
        root.querySelector('.r3d-motion-mirror-all')?.addEventListener('click', () => { this.mirrorMotion(); changed(); });
        root.querySelector('.r3d-motion-pose-copy')?.addEventListener('click', () => { this.clipboard = JSON.parse(JSON.stringify(this.poseAtPlayhead())); this.render(); });
        root.querySelector('.r3d-motion-pose-paste')?.addEventListener('click', () => { if (this.clipboard) { this.writePose(JSON.parse(JSON.stringify(this.clipboard))); changed(); } });
        root.querySelector('.r3d-motion-part-reset')?.addEventListener('click', () => {
            const t = m.tracks[this.track];
            if (!t || t.other) return;
            const stop = this.keyAtPlayhead(t, true);
            stop.rotate = [0, 0, 0]; stop.move = [0, 0, 0];
            changed();
        });
    }

    renderPlayButton() {
        const button = this.root && this.root.querySelector('.r3d-motion-play');
        if (button) {
            button.textContent = this.playing ? '❚❚' : '▶';
            button.title = this._t(this.playing ? 'Pause' : 'Play');
        }
    }

    drawPlayhead() {
        if (!this.root) return;
        const heads = this.root.querySelectorAll ? this.root.querySelectorAll('.r3d-motion-playhead') : [this.root.querySelector('.r3d-motion-playhead')];
        for (const head of heads) if (head) head.style.left = `calc(10px + (100% - 20px) * ${this.playhead})`;
        // The storyboard lights the pose being played through.
        if (!this.perPart && this.playing && this.root.querySelectorAll) {
            const times = this.poseTimes();
            let at = 0;
            times.forEach((t, i) => { if (t <= this.playhead + 1e-6) at = i; });
            this.root.querySelectorAll('.r3d-motion-card[data-i]').forEach(card => card.classList.toggle('on', Number(card.dataset.i) === at));
        }
    }

    /** The timeline point under a pointer (0-1), snapped to a hundredth. */
    pointAt(event) {
        const rect = this.root.querySelector('.r3d-motion-parts .r3d-motion-ruler').getBoundingClientRect();
        const t = (event.clientX - rect.left) / Math.max(1, rect.width);
        return Math.round(Math.max(0, Math.min(1, t)) * 100) / 100;
    }

    bind() {
        const root = this.root, m = this.motion;
        const changed = (rerender = true) => { this.commit(); if (rerender) this.render(); };
        root.querySelector('.r3d-motion-close').addEventListener('click', () => this.close());
        root.querySelector('.r3d-motion-play').addEventListener('click', () => {
            this.playing = !this.playing; this._playFrom = null;
            if (this.playing && (this.playhead >= 1 || !this.perPart)) this.playhead = this.perPart ? 0 : (this.poseTimes()[0] ?? 0);
            if (!this.playing && !this.perPart) { this.playhead = this.poseTimes()[this.pose] ?? 0; this.render(); return; }
            this.renderPlayButton();
        });
        root.querySelector('.r3d-motion-name').addEventListener('change', event => {
            const name = event.target.value.trim();
            // Another animation's name would fold it into this motion.
            const taken = name !== m.original && this.host.rawAnimations.some(raw => raw && raw.type !== 'clip' && raw.name === name);
            if (name && !taken) { m.name = name; changed(); } else event.target.value = m.name;
        });
        root.querySelector('.r3d-motion-trigger').addEventListener('change', event => { m.trigger = event.target.value; if (m.trigger !== 'action') m.hold = false; changed(); });
        root.querySelector('.r3d-motion-length')?.addEventListener('change', event => { const s = Number(event.target.value); if (s > 0) { m.frames = Math.max(2, Math.round(s * 60)); changed(); } });
        root.querySelector('.r3d-motion-repeat')?.addEventListener('change', event => { m.repeat = event.target.checked; changed(); });
        root.querySelector('.r3d-motion-hold')?.addEventListener('change', event => {
            // A stance keeps one pose per part: the one at the playhead, sampled before the motion holds.
            if (event.target.checked) for (const t of m.tracks) if (t.keys) { const pose = this.sampleTrack(t, this.playhead || 1); t.keys = [{ at: 1, rotate: pose.rotate, move: pose.move }]; }
            m.hold = event.target.checked;
            changed();
        });
        root.querySelectorAll('.r3d-motion-track').forEach(el => el.addEventListener('click', event => {
            if (event.target.closest('.r3d-motion-track-remove')) return;
            this.track = Number(el.dataset.i); this.render();
        }));
        root.querySelectorAll('.r3d-motion-track-remove').forEach(el => el.addEventListener('click', () => {
            m.tracks.splice(Number(el.dataset.i), 1);
            this.track = Math.max(0, Math.min(this.track, m.tracks.length - 1));
            changed();
        }));
        root.querySelector('.r3d-motion-add')?.addEventListener('change', event => {
            const part = event.target.value;
            if (event.target.selectedIndex <= 0) return;
            if (part.startsWith('@')) { this.addOther(part.slice(1)); return; }
            m.tracks.push({ part, keys: m.hold ? [{ at: 1, rotate: [0, 0, 0], move: [0, 0, 0] }] : [] });
            this.track = m.tracks.length - 1;
            changed();
        });
        root.querySelector('.r3d-motion-backtoposes')?.addEventListener('click', () => { this.perPart = false; this.render(); });
        // The timeline: a press sets the playhead (and picks the row); a key drags along it (a pose moves every part's key with it).
        const area = this.perPart ? root.querySelector('.r3d-motion-parts') : null;
        area?.addEventListener('pointerdown', event => {
            if (event.target.closest('.r3d-motion-backtoposes')) return;
            const keyEl = event.target.closest('.r3d-motion-key');
            const row = event.target.closest('.r3d-motion-row');
            if (row) this.track = Number(row.dataset.i);
            this.playing = false; this.renderPlayButton();
            if (keyEl && !m.hold) {
                const t = m.tracks[Number(keyEl.dataset.i)], stop = t.keys[Number(keyEl.dataset.k)];
                this.playhead = stop.at;
                let moved = false;
                area.setPointerCapture?.(event.pointerId);
                const move = e => { stop.at = this.pointAt(e); this.playhead = stop.at; keyEl.style.left = `${stop.at * 100}%`; this.drawPlayhead(); moved = true; };
                const up = () => { area.removeEventListener('pointermove', move); area.removeEventListener('pointerup', up); t.keys.sort((a, b) => a.at - b.at); if (moved) changed(); else this.render(); };
                area.addEventListener('pointermove', move); area.addEventListener('pointerup', up);
                return;
            }
            this.playhead = this.pointAt(event);
            area.setPointerCapture?.(event.pointerId);
            const scrub = e => { this.playhead = this.pointAt(e); this.drawPlayhead(); };
            const stop = () => { area.removeEventListener('pointermove', scrub); area.removeEventListener('pointerup', stop); this.render(); };
            area.addEventListener('pointermove', scrub); area.addEventListener('pointerup', stop);
            this.drawPlayhead();
        });
        // The pose: a slider sets the selected part's key at the playhead.
        const track = m.tracks[this.track];
        const bindAxis = (cls, field) => {
            root.querySelectorAll(`.${cls}, .${cls}-num`).forEach(input => {
                const apply = commit => {
                    const stop = this.keyAtPlayhead(track, true);
                    const value = Number(input.value);
                    if (!stop || !Number.isFinite(value)) return;
                    stop[field][Number(input.dataset.axis)] = value;
                    const twin = root.querySelector(`.${input.classList.contains(cls) ? cls + '-num' : cls}[data-axis="${input.dataset.axis}"]`);
                    if (twin) twin.value = value;
                    if (commit) changed();
                };
                input.addEventListener('input', () => apply(false));
                input.addEventListener('change', () => apply(true));
            });
        };
        if (track && !track.other) { bindAxis('r3d-motion-rot', 'rotate'); bindAxis('r3d-motion-move', 'move'); }
        root.querySelector('.r3d-motion-key-set')?.addEventListener('click', () => { this.keyAtPlayhead(track, true); changed(); });
        root.querySelector('.r3d-motion-key-delete')?.addEventListener('click', () => {
            const stop = this.keyAtPlayhead(track, false);
            if (stop) track.keys.splice(track.keys.indexOf(stop), 1);
            changed();
        });
        root.querySelector('.r3d-motion-other')?.addEventListener('click', () => {
            const index = this.host.rawAnimations.findIndex(raw => raw && raw.name === m.name && raw.type === track.other.type && (raw.part || '') === track.part);
            this.close();
            if (index >= 0) this.host.editRule(index);
        });
    }
}

if (typeof window !== 'undefined') window.RRMotionEditor = RRMotionEditor;
if (typeof module !== 'undefined' && module.exports) module.exports = RRMotionEditor;
