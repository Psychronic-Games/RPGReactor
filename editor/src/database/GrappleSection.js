/**
 * GrappleSection - an armor's Grapple section (Database › Armors).
 *
 * A grapple pulls its wearer up to a roof's edge or a ledge in a battle on
 * the map: the edges it reaches show in the Tactical move range in their own
 * color, and taking one plays the line, the pull and the climb onto the top
 * (runtime/reactor_fight_tactical.js `F.grappleSpec`,
 * runtime/reactor_physics.js `startGrapple`). Stored on the record as
 *
 *   rrGrapple: { range, height, uses, cooldown, cost: "move" | "action", moveCost, sounds? }
 *
 * `sounds` (kept only while one is set): `{ fire, bite, pull }`, each a sound
 * effect `{ name, volume, pitch, pan }` played as the line is shot, as the hook
 * bites, and as the pull starts.
 *
 * while the section's switch is on; the record has no `rrGrapple` when it is
 * off. `range` is tiles across, `height` the highest edge over the feet,
 * `uses` a battle (0: no limit), `cooldown` turns before the next use, and
 * the cost is `moveCost` move points or the wearer's action.
 *
 * The pure half (read, write) has no DOM and is what the tests drive;
 * createSection builds the section.
 */
(function(root) {
    'use strict';

    const DEFAULTS = Object.freeze({ range: 6, height: 10, uses: 0, cooldown: 2, cost: 'move', moveCost: 2 });
    const COSTS = ['move', 'action'];
    // Each number's lowest, highest and step, as the game takes it.
    const LIMITS = Object.freeze({ range: [1, 30, 1], height: [1, 50, 0.5], uses: [0, 99, 1], cooldown: [0, 99, 1], moveCost: [0, 30, 1] });
    const WHOLE = ['uses', 'cooldown'];
    /** The grapple's beats that can have a sound: shot, the hook biting, the pull. */
    const SOUNDS = ['fire', 'bite', 'pull'];

    /** A sound effect as the game plays it, or null for none. */
    function sound(value) {
        if (!value || typeof value !== 'object' || typeof value.name !== 'string' || !value.name) return null;
        const n = (v, low, high, fallback) => { const x = Number(v); return Number.isFinite(x) ? Math.max(low, Math.min(high, Math.round(x))) : fallback; };
        return { name: value.name, volume: n(value.volume, 0, 100, 90), pitch: n(value.pitch, 50, 150, 100), pan: n(value.pan, -100, 100, 0) };
    }
    function sounds(value) {
        if (!value || typeof value !== 'object') return null;
        const out = {};
        for (const key of SOUNDS) { const one = sound(value[key]); if (one) out[key] = one; }
        return Object.keys(out).length ? out : null;
    }

    function number(key, value) {
        const [low, high] = LIMITS[key];
        const n = value === null || value === '' || typeof value === 'boolean' ? NaN : Number(value);
        if (!Number.isFinite(n)) return DEFAULTS[key];
        const kept = Math.max(low, Math.min(high, n));
        return WHOLE.includes(key) ? Math.floor(kept) : Math.round(kept * 100) / 100;
    }

    /** A record's grapple with every setting filled in and in range, or null when it has none. */
    function read(record) {
        const own = record && record.rrGrapple;
        if (!own || typeof own !== 'object' || own.enabled === false) return null;
        const out = {};
        for (const key of Object.keys(LIMITS)) out[key] = number(key, own[key]);
        out.cost = COSTS.includes(own.cost) ? own.cost : DEFAULTS.cost;
        const heard = sounds(own.sounds);
        if (heard) out.sounds = heard;
        return out;
    }

    /**
     * The record's grapple after a change: `on` false takes it off; otherwise `patch` goes over what it has (the
     * defaults for a record that had none). Returns the new `rrGrapple`, or null when it is off. The record gets a
     * new object, never a changed one.
     */
    function write(record, patch, on = true) {
        if (!record) return null;
        if (!on) { delete record.rrGrapple; return null; }
        const next = Object.assign({}, read(record) || DEFAULTS, patch || {});
        const out = {};
        for (const key of Object.keys(LIMITS)) out[key] = number(key, next[key]);
        out.cost = COSTS.includes(next.cost) ? next.cost : DEFAULTS.cost;
        record.rrGrapple = { range: out.range, height: out.height, uses: out.uses, cooldown: out.cooldown, cost: out.cost, moveCost: out.moveCost };
        const heard = sounds(next.sounds);
        if (heard) record.rrGrapple.sounds = heard;
        return record.rrGrapple;
    }

    const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /**
     * The section for an armor: `{ record, databaseManager }`. A change is kept on the Database's own record
     * (`getArmor`) and reported through `updateArmor`.
     */
    function createSection(options) {
        if (typeof document === 'undefined' || !options || !options.record) return null;
        const tt = t => (root.I18n ? root.I18n.tText(t) : t);
        const manager = options.databaseManager, record = options.record;
        const target = () => (manager && manager.getArmor ? manager.getArmor(record.id) : null) || record;
        const section = document.createElement('div');
        section.className = 'database-section rr-grapple-section';
        const field = (key, unit) => {
            const [low, high, step] = LIMITS[key];
            return `<div class="rr-controls-inline"><input type="number" class="database-field-value rr-grapple-num" data-grapple="${key}" min="${low}" max="${high}" step="${step}"> <span class="rr-controls-unit">${esc(tt(unit))}</span></div>`;
        };
        section.innerHTML = `
            <div class="database-section-header" data-section-key="grapple">${esc(tt('Grapple'))}</div>
            <div class="database-section-content">
                <div class="rr-controls-form">
                    <label class="rr-controls-check"><input type="checkbox" data-grapple="on"> ${esc(tt('Pulls the wearer up to a roof edge or ledge in battles'))}</label>
                    <label>${esc(tt('Reach'))}</label>${field('range', 'tiles')}
                    <label>${esc(tt('Highest edge'))}</label>${field('height', 'tiles up')}
                    <label>${esc(tt('Uses per battle'))}</label>${field('uses', '0 = no limit')}
                    <label>${esc(tt('Cooldown'))}</label>${field('cooldown', 'turns')}
                    <label>${esc(tt('Costs'))}</label>
                    <div class="rr-controls-inline">
                        <select class="database-field-value" data-grapple="cost">
                            <option value="move">${esc(tt('Move points'))}</option>
                            <option value="action">${esc(tt('The action'))}</option>
                        </select>
                        <input type="number" class="database-field-value rr-grapple-num" data-grapple="moveCost" min="${LIMITS.moveCost[0]}" max="${LIMITS.moveCost[1]}" step="1">
                    </div>
                    ${SOUNDS.map(key => `<label>${esc(tt(SOUND_LABELS[key]))}</label><div class="rr-controls-inline"><button type="button" class="database-field-value rr-grapple-sound" data-sound="${key}"></button></div>`).join('')}
                </div>
            </div>`;
        const on = section.querySelector('[data-grapple="on"]'), cost = section.querySelector('[data-grapple="cost"]');
        const inputs = Array.from(section.querySelectorAll('.rr-grapple-num'));
        const soundButtons = Array.from(section.querySelectorAll('.rr-grapple-sound'));
        const show = () => {
            const spec = read(target()), shown = spec || DEFAULTS;
            for (const button of soundButtons) {
                const one = spec && spec.sounds && spec.sounds[button.dataset.sound];
                button.textContent = one ? one.name : tt('(None)');
                button.disabled = !spec;
            }
            on.checked = !!spec;
            for (const input of inputs) { input.value = String(shown[input.dataset.grapple]); input.disabled = !spec; }
            cost.value = shown.cost;
            cost.disabled = !spec;
            section.querySelector('[data-grapple="moveCost"]').hidden = shown.cost !== 'move';
        };
        const save = (patch, keep = true) => {
            const live = target();
            write(live, patch, keep);
            if (live !== record) { if (live.rrGrapple) record.rrGrapple = live.rrGrapple; else delete record.rrGrapple; }
            if (manager && manager.updateArmor) manager.updateArmor(live.id, live);
            show();
        };
        on.addEventListener('change', () => save(null, on.checked));
        cost.addEventListener('change', () => save({ cost: cost.value }));
        for (const input of inputs) input.addEventListener('change', () => save({ [input.dataset.grapple]: input.value }));
        // A sound: the project's sound effects to pick from (None clears it).
        for (const button of soundButtons) button.addEventListener('click', () => {
            const project = root.reactor && root.reactor.projectController && root.reactor.projectController.currentProject;
            if (!project || !project.path || !root.RRAudioPickerModal || !root.RRAssetFiles) return;
            const path = require('path'), fs = require('fs'), folder = path.join(project.path, 'audio', 'se');
            const key = button.dataset.sound, spec = read(target()), current = (spec && spec.sounds && spec.sounds[key]) || {};
            root.RRAudioPickerModal.open({
                title: `${tt('Select')} SE ${tt('File')}`,
                folderLabel: 'SE',
                files: fs.existsSync(folder) ? root.RRAssetFiles.listUnique(folder, root.RRAssetFiles.AUDIO_EXTENSIONS) : [],
                selected: current.name || '',
                levels: { volume: current.volume !== undefined ? current.volume : 90, pitch: current.pitch !== undefined ? current.pitch : 100, pan: current.pan !== undefined ? current.pan : 0 },
                zIndex: 10010,
                onOk: result => {
                    const picked = result && result.name ? { name: result.name, volume: result.volume, pitch: result.pitch, pan: result.pan } : null;
                    const all = Object.assign({}, (read(target()) || {}).sounds || {});
                    if (picked) all[key] = picked; else delete all[key];
                    save({ sounds: all });
                }
            });
        });
        show();
        return section;
    }

    const SOUND_LABELS = { fire: 'Shot sound', bite: 'Hook bites sound', pull: 'Pull sound' };
    const api = { DEFAULTS, COSTS, LIMITS, SOUNDS, read, write, createSection };
    root.RRGrapple = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
