/**
 * MotionEditor - one motion of a 3D model on one timeline.
 *
 * A motion is every pose rule that shares a name: they fire together, so
 * they are one thing to the person making it. The editor shows them that
 * way: the motion's name, when it plays and how long it takes across the
 * top; a row per part it moves, with that part's keyframes on a shared
 * timeline; a playhead to scrub; and the selected part's pose at the
 * playhead as sliders. Moving a slider sets that part's key at that moment
 * (adding one if there is none), and the model shows the motion exactly
 * where the playhead stands. It saves back as the same pose rules the game
 * plays, one per part.
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
    }

    get active() { return !!this.motion; }

    _t(text, params) { return this.host._t(text, params); }

    static TRIGGERS() {
        return [['action', 'On demand'], ['always', 'Always'], ['idle', 'While idle'], ['moving', 'While moving'], ['walking', 'While walking'],
            ['dashing', 'While dashing'], ['jumping', 'While jumping'], ['swimming', 'While swimming'], ['treading', 'While treading water'], ['climbing', 'While climbing']];
    }

    /** Pose-rule fields the editor writes; anything else on a rule (effects, cycles) is kept as it was. */
    static get MANAGED() { return ['name', 'part', 'type', 'trigger', 'period', 'keys', 'hold', 'rotate', 'move', 'repeat']; }

    /** Open the motion of this name (its pose rules), or a new one. */
    open(name) {
        const rules = this.host.rawAnimations.filter(raw => raw && raw.name === name && raw.type !== 'clip');
        const first = rules.find(raw => raw.type === 'pose') || rules[0] || {};
        const hold = rules.length > 0 && rules.every(raw => raw.type !== 'pose' || raw.hold);
        const frames = Math.max(2, Math.round((Number(first.period) || 30) * (first.type === 'pose' || !rules.length ? 2 : 1)));
        const tracks = rules.map(raw => {
            if (raw.type !== 'pose') return { part: raw.part || '', other: JSON.parse(JSON.stringify(raw)) };
            const keys = Array.isArray(raw.keys) && raw.keys.length
                ? raw.keys.map(stop => ({ at: Number(stop.at) || 0, rotate: RRMotionEditor.vec(stop.rotate), move: RRMotionEditor.vec(stop.move) }))
                : [{ at: hold ? 1 : 0.5, rotate: RRMotionEditor.vec(raw.rotate), move: RRMotionEditor.vec(raw.move) }];
            const extra = JSON.parse(JSON.stringify(raw));
            for (const field of RRMotionEditor.MANAGED) delete extra[field];
            return { part: raw.part || '', keys, extra };
        });
        this.motion = {
            name: name || this.freshName(),
            original: name || null,
            trigger: first.trigger || 'action',
            frames,
            repeat: !!first.repeat,
            hold,
            tracks
        };
        this.track = 0;
        this.playhead = 0;
        this.playing = false;
        this.render();
        this.host.renderRuleList();
    }

    /** A click on the model: that part's track, added when the motion has none. */
    pickPart(part) {
        const m = this.motion;
        let at = m.tracks.findIndex(t => t.part === part && !t.other);
        if (at < 0) {
            m.tracks.push({ part, keys: m.hold ? [{ at: 1, rotate: [0, 0, 0], move: [0, 0, 0] }] : [] });
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
        this.fitCanvas();
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
        const keys = track.keys.map(k => ({ at: k.at, rotate: k.rotate, move: k.move, resize: [1, 1, 1] }));
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
            else rule.keys = track.keys.map(k => ({ at: Math.round(k.at * 1000) / 1000, rotate: k.rotate.map(v => Math.round(v * 10) / 10), move: k.move.map(v => Math.round(v * 1000) / 1000) }));
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
        const at = host.rawAnimations.findIndex(raw => raw && raw.name === (motion.original || motion.name) && raw.type !== 'clip');
        const kept = host.rawAnimations.filter(raw => !(raw && raw.type !== 'clip' && (raw.name === motion.original || raw.name === motion.name)));
        const mine = this.rulesOf(motion);
        kept.splice(at >= 0 ? Math.min(at, kept.length) : kept.length, 0, ...mine);
        host.rawAnimations = kept;
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
                else { this.playing = false; this._playFrom = null; t = 1; this.renderPlayButton(); }
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
        const wrap = this.host._detail && this.host._detail.querySelector('.r3d-canvas-wrap');
        if (!wrap || !this.motion) return;
        if (!this.root) {
            this.root = document.createElement('div');
            this.root.className = 'r3d-motion';
            wrap.appendChild(this.root);
        }
        const m = this.motion, tt = text => this._t(text);
        const partName = part => part === '' ? tt('Whole model') : part;
        const used = new Set(m.tracks.map(t => t.part));
        const addable = [''].concat(this.host.partNames || []).filter(part => !used.has(part));
        const track = m.tracks[this.track];
        const pose = track && !track.other ? this.sampleTrack(track, this.playhead) : null;
        const keyed = track && !track.other ? this.keyAtPlayhead(track, false) : null;
        const slider = (cls, axis, value, min, max, step, label) => `
            <label class="r3d-motion-slider"><span>${label}</span>
                <input type="range" class="${cls}" data-axis="${axis}" min="${min}" max="${max}" step="${step}" value="${value}">
                <input type="number" class="database-field-value ${cls}-num" data-axis="${axis}" min="${min}" max="${max}" step="${step}" value="${Math.round(value * 100) / 100}"></label>`;
        this.root.innerHTML = `
            <div class="lit-section-header r3d-motion-head">
                <input type="text" class="database-field-value r3d-motion-name" value="${rrEscapeHtml(m.name)}" title="${rrEscapeHtml(tt('Name'))}">
                <select class="database-field-value r3d-motion-trigger" title="${rrEscapeHtml(tt('Play when'))}">${RRMotionEditor.TRIGGERS().map(([v, l]) => `<option value="${v}"${v === m.trigger ? ' selected' : ''}>${rrEscapeHtml(tt(l))}</option>`).join('')}</select>
                <label class="r3d-motion-field">${rrEscapeHtml(tt('Length'))} <input type="number" class="database-field-value r3d-motion-length" min="0.1" max="60" step="0.1" value="${(m.frames / 60).toFixed(2)}"> s</label>
                ${m.trigger === 'action' || m.trigger === 'jumping' ? `<label class="r3d-motion-field"><input type="checkbox" class="r3d-motion-repeat"${m.repeat ? ' checked' : ''}> ${rrEscapeHtml(tt('Repeat'))}</label>
                ${m.trigger === 'action' ? `<label class="r3d-motion-field" title="${rrEscapeHtml(tt('Held until another stance moves the same parts.'))}"><input type="checkbox" class="r3d-motion-hold"${m.hold ? ' checked' : ''}> ${rrEscapeHtml(tt('Stance'))}</label>` : ''}` : ''}
                <span style="flex:1"></span>
                <button type="button" class="rr-btn-secondary r3d-motion-play"></button>
                <button type="button" class="r3d-motion-close" title="${rrEscapeHtml(tt('Close'))}">×</button>
            </div>
            <div class="r3d-motion-body">
                <div class="r3d-motion-tracks">
                    ${m.tracks.map((t, i) => `<div class="r3d-motion-track${i === this.track ? ' active' : ''}" data-i="${i}"><span>${rrEscapeHtml(partName(t.part))}${t.other ? ` <em>· ${rrEscapeHtml(tt(t.other.type === 'spin' ? 'Spin' : t.other.type === 'swing' ? 'Swing' : 'Bob'))}</em>` : ''}</span><button type="button" class="r3d-motion-track-remove" data-i="${i}" title="${rrEscapeHtml(tt('Remove'))}">×</button></div>`).join('')}
                    <select class="database-field-value r3d-motion-add"><option value="">${rrEscapeHtml(tt('+ Part…'))}</option>${addable.map(p => `<option value="${rrEscapeHtml(p)}">${rrEscapeHtml(partName(p))}</option>`).join('')}${m.hold ? '' : `<optgroup label="${rrEscapeHtml(tt('Other motion'))}">${['spin', 'swing', 'bob'].map(type => `<option value="@${type}">${rrEscapeHtml(tt(type === 'spin' ? 'Spin' : type === 'swing' ? 'Swing' : 'Bob'))}</option>`).join('')}</optgroup>`}</select>
                </div>
                <div class="r3d-motion-timeline">
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
                        ${!m.hold ? `<div class="r3d-motion-pose-actions">${keyed ? `<button type="button" class="rr-btn-secondary r3d-motion-key-delete">${rrEscapeHtml(tt('Delete key'))}</button>` : `<button type="button" class="rr-btn-secondary r3d-motion-key-set">${rrEscapeHtml(tt('Add key'))}</button>`}</div>` : ''}`
                        : `<div class="r3d-motion-pose-title">${rrEscapeHtml(track ? tt('Edited on its own card.') : tt('Add a part to move it.'))}</div>${track && track.other ? `<button type="button" class="rr-btn-secondary r3d-motion-other">${rrEscapeHtml(tt('Edit'))}</button>` : ''}`}
                </div>
            </div>`;
        this.renderPlayButton();
        this.drawPlayhead();
        this.bind();
        this.fitCanvas();
    }

    /** The viewport ends above the panel, so the whole model stays in view while it moves. */
    fitCanvas() {
        const canvas = this.host._detail && this.host._detail.querySelector('.r3d-db-canvas');
        if (!canvas) return;
        canvas.style.height = this.root ? `calc(100% - ${this.root.offsetHeight + 16}px)` : '100%';
    }

    renderPlayButton() {
        const button = this.root && this.root.querySelector('.r3d-motion-play');
        if (button) button.textContent = this.playing ? '❚❚' : '▶';
    }

    drawPlayhead() {
        const head = this.root && this.root.querySelector('.r3d-motion-playhead');
        if (head) head.style.left = `calc(10px + (100% - 20px) * ${this.playhead})`;
    }

    /** The timeline point under a pointer (0-1), snapped to a hundredth. */
    pointAt(event) {
        const rect = this.root.querySelector('.r3d-motion-ruler').getBoundingClientRect();
        const t = (event.clientX - rect.left) / Math.max(1, rect.width);
        return Math.round(Math.max(0, Math.min(1, t)) * 100) / 100;
    }

    bind() {
        const root = this.root, m = this.motion;
        const changed = (rerender = true) => { this.commit(); if (rerender) this.render(); };
        root.querySelector('.r3d-motion-close').addEventListener('click', () => this.close());
        root.querySelector('.r3d-motion-play').addEventListener('click', () => { this.playing = !this.playing; this._playFrom = null; if (this.playing && this.playhead >= 1) this.playhead = 0; this.renderPlayButton(); });
        root.querySelector('.r3d-motion-name').addEventListener('change', event => { const name = event.target.value.trim(); if (name) { m.name = name; changed(); } });
        root.querySelector('.r3d-motion-trigger').addEventListener('change', event => { m.trigger = event.target.value; if (m.trigger !== 'action') m.hold = false; changed(); });
        root.querySelector('.r3d-motion-length').addEventListener('change', event => { const s = Number(event.target.value); if (s > 0) { m.frames = Math.max(2, Math.round(s * 60)); changed(); } });
        root.querySelector('.r3d-motion-repeat')?.addEventListener('change', event => { m.repeat = event.target.checked; changed(); });
        root.querySelector('.r3d-motion-hold')?.addEventListener('change', event => {
            m.hold = event.target.checked;
            // A stance keeps one pose per part: the one at the playhead.
            if (m.hold) for (const t of m.tracks) if (t.keys) { const pose = this.sampleTrack(Object.assign({}, t), this.playhead || 1); t.keys = [{ at: 1, rotate: pose.rotate, move: pose.move }]; }
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
        root.querySelector('.r3d-motion-add').addEventListener('change', event => {
            const part = event.target.value;
            if (event.target.selectedIndex <= 0) return;
            if (part.startsWith('@')) { this.addOther(part.slice(1)); return; }
            m.tracks.push({ part, keys: m.hold ? [{ at: 1, rotate: [0, 0, 0], move: [0, 0, 0] }] : [] });
            this.track = m.tracks.length - 1;
            changed();
        });
        // The timeline: a press sets the playhead (and picks the row); a key drags along it.
        const area = root.querySelector('.r3d-motion-timeline');
        area.addEventListener('pointerdown', event => {
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
