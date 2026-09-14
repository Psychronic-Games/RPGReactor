/**
 * RRBgmSequenceEditor - the list that edits one BGM sequence.
 *
 * A sequence is `{ enabled, entries }`. It lives in Map###.json as
 * `bgmSequence` (Map Properties), or in System.json's music sequence library
 * (Database > Music Sequences); both surfaces render this same list.
 * Entries play in order and repeat:
 *   { type: 'track', name, volume, pitch, pan, fadeIn }   (any entry may set `once`)
 *   { type: 'silence', duration }
 *   { type: 'palette', duration, fadeIn, fadeOut, single, layers: [{ volume, pitch, pan, order, pool }] }
 * where a pool holds tracks (`{ type: 'track', name, volume }`) and silences.
 *
 * The model functions are static so a save can normalize and validate what
 * the form holds without the DOM; the instance renders one container and
 * edits its copy in place. Tracks are chosen through `pickTrack`, which
 * the caller wires to the shared audio picker. Starters… replaces the list
 * with a ready shape whose track slots come from `listTracks`, the project's
 * BGM folder, so a sequence can be heard before it is authored.
 */
class RRBgmSequenceEditor {
    static TRACK_DEFAULTS = { volume: 100, pitch: 100, pan: 0 };

    /** The ready shapes Starters… offers, in the order it lists them. */
    static STARTERS = [
        { id: 'intro-loop', label: 'Intro, then a loop', hint: 'An opening track plays once, then a second track repeats, crossfading in.' },
        { id: 'playlist', label: 'Shuffled playlist', hint: 'Four tracks in shuffled order, each playing in full and crossfading into the next.' },
        { id: 'battle', label: 'Battle: opening, then a random bed', hint: 'An opening track plays once, then tracks drawn at random carry the fight.' },
        { id: 'one-then-pause', label: 'One track, then a pause', hint: 'Each pass plays one track drawn at random, then 15 seconds of quiet.' },
        { id: 'layered', label: 'Layered ambience', hint: 'Two layers sound together: a bed, and a quieter layer that comes and goes.' }
    ];

    /**
     * A starter's entries in the stored shape, its track slots filled from
     * `tracks` in turn (repeating when there are fewer) or left to be chosen
     * when there are none. Null for an id that names no starter.
     */
    static starter(id, tracks) {
        const names = (Array.isArray(tracks) ? tracks : []).filter(name => typeof name === 'string' && name);
        let next = 0;
        const name = () => (names.length ? names[next++ % names.length] : '');
        const track = extra => Object.assign({ type: 'track', name: name(), fadeIn: 0, once: false }, extra);
        const pool = count => Array.from({ length: count }, () => ({ type: 'track', name: name() }));
        const layer = (extra, items) => Object.assign({ order: 'random' }, extra, { pool: items });
        let entries;
        switch (id) {
            case 'intro-loop':
                entries = [track({ once: true }), track({ fadeIn: 2 })];
                break;
            case 'playlist':
                entries = [{ type: 'palette', duration: 0, fadeIn: 0, fadeOut: 4, layers: [layer({ order: 'shuffle' }, pool(4))] }];
                break;
            case 'battle':
                entries = [track({ once: true }), { type: 'palette', duration: 0, fadeIn: 1, fadeOut: 3, layers: [layer({}, pool(3))] }];
                break;
            case 'one-then-pause':
                entries = [{ type: 'palette', single: true, duration: 0, fadeIn: 2, fadeOut: 4, layers: [layer({}, pool(3))] },
                    { type: 'silence', duration: 15 }];
                break;
            case 'layered': {
                const bed = pool(2);
                const accents = [...pool(1), { type: 'silence', duration: 20 }, ...pool(1)];
                entries = [{ type: 'palette', duration: 0, fadeIn: 3, fadeOut: 4, layers: [layer({}, bed), layer({ volume: 60 }, accents)] }];
                break;
            }
            default:
                return null;
        }
        return RRBgmSequenceEditor.normalize({ enabled: true, entries }).entries;
    }

    static number(value, fallback, min, max) {
        // Number(null) is 0, so a missing value must be caught before it is
        // clamped into a real one (a new track would start at volume 0).
        if (value === null || value === undefined || value === '') return fallback;
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) return fallback;
        return Math.min(max, Math.max(min, Math.round(parsed)));
    }

    static seconds(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 10) / 10 : 0;
    }

    static levels(source) {
        const d = RRBgmSequenceEditor.TRACK_DEFAULTS;
        return {
            volume: RRBgmSequenceEditor.number(source && source.volume, d.volume, 0, 100),
            pitch: RRBgmSequenceEditor.number(source && source.pitch, d.pitch, 50, 150),
            pan: RRBgmSequenceEditor.number(source && source.pan, d.pan, -100, 100)
        };
    }

    static poolEntry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        if (raw.type === 'silence') return { type: 'silence', duration: RRBgmSequenceEditor.seconds(raw.duration) };
        return { type: 'track', name: typeof raw.name === 'string' ? raw.name : '',
                 volume: RRBgmSequenceEditor.number(raw.volume, 100, 0, 100) };
    }

    static layer(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return Object.assign(RRBgmSequenceEditor.levels(source), {
            order: source.order === 'sequential' || source.order === 'shuffle' ? source.order : 'random',
            pool: (Array.isArray(source.pool) ? source.pool : []).map(RRBgmSequenceEditor.poolEntry).filter(Boolean)
        });
    }

    static entry(raw) {
        if (!raw || typeof raw !== 'object') return null;
        switch (raw.type) {
            case 'silence':
                return { type: 'silence', duration: RRBgmSequenceEditor.seconds(raw.duration), once: !!raw.once };
            case 'palette':
                return {
                    type: 'palette',
                    once: !!raw.once,
                    single: !!raw.single,
                    duration: RRBgmSequenceEditor.seconds(raw.duration),
                    fadeIn: RRBgmSequenceEditor.seconds(raw.fadeIn),
                    fadeOut: RRBgmSequenceEditor.seconds(raw.fadeOut),
                    layers: (Array.isArray(raw.layers) ? raw.layers : []).map(RRBgmSequenceEditor.layer)
                };
            default:
                return Object.assign(
                    { type: 'track', name: typeof raw.name === 'string' ? raw.name : '', fadeIn: RRBgmSequenceEditor.seconds(raw.fadeIn), once: !!raw.once },
                    RRBgmSequenceEditor.levels(raw));
        }
    }

    /** A clean copy of whatever the map holds; absent reads as an empty, disabled sequence. */
    static normalize(raw) {
        const source = raw && typeof raw === 'object' ? raw : {};
        return {
            enabled: source.enabled === true,
            entries: (Array.isArray(source.entries) ? source.entries : []).map(RRBgmSequenceEditor.entry).filter(Boolean)
        };
    }

    /** Nothing configured: the key is left off the map file. */
    static isBlank(sequence) {
        return !sequence || (!sequence.enabled && (!sequence.entries || sequence.entries.length === 0));
    }

    /** The first thing wrong with an enabled sequence, as a message, or null. `tt` translates. */
    static validate(sequence, tt) {
        const say = (text, params) => {
            let out = tt ? tt(text) : text;
            for (const [key, value] of Object.entries(params || {})) out = out.split(`{${key}}`).join(String(value));
            return out;
        };
        if (!sequence || !sequence.enabled) return null;
        const entries = sequence.entries || [];
        if (!entries.length) return say('The sequence needs at least one entry.');
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const n = i + 1;
            if (entry.type === 'track') {
                if (!entry.name) return say('Entry {n}: choose a track.', { n });
            } else if (entry.type === 'silence') {
                if (!(entry.duration > 0)) return say('Entry {n}: a silence needs a duration above zero.', { n });
            } else if (entry.type === 'palette') {
                if (!entry.layers.length) return say('Entry {n}: a palette needs at least one layer.', { n });
                if (entry.duration > 0 && entry.fadeOut > entry.duration) return say('Entry {n}: the fade-out cannot be longer than the duration.', { n });
                if (entry.duration > 0 && entry.fadeIn > entry.duration) return say('Entry {n}: the fade-in cannot be longer than the duration.', { n });
                for (let l = 0; l < entry.layers.length; l++) {
                    const layer = entry.layers[l];
                    if (!layer.pool.length) return say('Entry {n}, layer {layer}: the pool needs at least one entry.', { n, layer: l + 1 });
                    for (const item of layer.pool) {
                        if (item.type === 'track' && !item.name) return say('Entry {n}, layer {layer}: choose a track for every pool entry.', { n, layer: l + 1 });
                        if (item.type === 'silence' && !(item.duration > 0)) return say('Entry {n}, layer {layer}: a silence needs a duration above zero.', { n, layer: l + 1 });
                    }
                }
            }
        }
        return null;
    }

    /**
     * @param {object} options
     * @param {HTMLElement} options.container - Where the list renders.
     * @param {function} options.tt - Text translator.
     * @param {function} options.t - Keyed translator, for the shared levels line.
     * @param {function} options.pickTrack - ({ selected, levels, previewLevels }) => Promise
     *   resolving to the picker's { name, volume, pitch, pan }, or null on cancel.
     * @param {function} [options.onEdit] - Receives value() after every edit, for
     *   a host with no OK button of its own to write the sequence back.
     * @param {function} [options.listTracks] - () => the project's BGM track
     *   names, which a starter's track slots are filled from.
     * @param {function} [options.confirm] - (message) => boolean, asked before a
     *   starter replaces entries; the browser's confirm by default.
     */
    constructor(options) {
        this.container = options.container;
        this.tt = options.tt || (text => text);
        this.t = options.t || ((key) => key);
        this.pickTrack = options.pickTrack || (() => Promise.resolve(null));
        this.onEdit = options.onEdit || null;
        this.listTracks = options.listTracks || (() => []);
        this.confirm = options.confirm || (message => (typeof confirm === 'function' ? confirm(message) : true));
        this.sequence = RRBgmSequenceEditor.normalize(null);
        this.container.addEventListener('click', event => this.onClick(event));
        this.container.addEventListener('change', event => this.onChange(event));
    }

    load(raw) {
        this.sequence = RRBgmSequenceEditor.normalize(raw);
        this.render();
    }

    /** A normalized copy of what the form holds now. */
    value() {
        return RRBgmSequenceEditor.normalize(this.sequence);
    }

    setEnabled(enabled) {
        this.sequence.enabled = !!enabled;
    }

    edited() {
        if (this.onEdit) this.onEdit(this.value());
    }

    /**
     * `<option>` markup for a picker of library entries: `noneLabel` as 0, then
     * any `extraOptions` of the host's own ({ value, label }, chosen by value),
     * then each entry as `0001: Name`. An id the library no longer holds stays
     * listed as missing, so opening a form never quietly changes what it names.
     */
    static libraryOptions(entries, selectedId, noneLabel, missingLabel, extraOptions) {
        const escape = text => typeof rrEscapeHtml === 'function' ? rrEscapeHtml(text) : String(text == null ? '' : text);
        const extras = Array.isArray(extraOptions) ? extraOptions : [];
        const extra = extras.find(option => String(option.value) === String(selectedId));
        const selected = extra ? String(extra.value) : (Number(selectedId) || 0);
        const label = (id, name) => `${String(id).padStart(4, '0')}: ${name}`;
        const option = (value, text) => `<option value="${escape(String(value))}"${value === selected ? ' selected' : ''}>${escape(text)}</option>`;
        let html = option(0, noneLabel);
        for (const choice of extras) html += option(String(choice.value), choice.label);
        let found = selected === 0 || !!extra;
        for (const entry of entries || []) {
            if (!entry || !(entry.id > 0)) continue;
            if (entry.id === selected) found = true;
            html += option(entry.id, label(entry.id, entry.name || ''));
        }
        if (!found) html += option(selected, label(selected, missingLabel));
        return html;
    }

    escape(text) {
        return typeof rrEscapeHtml === 'function' ? rrEscapeHtml(text) : String(text == null ? '' : text);
    }

    levelsText(levels) {
        return this.t('mapProps.levels', { volume: levels.volume, pitch: levels.pitch, pan: levels.pan });
    }

    numberInput(path, value, min, max, step, width) {
        return `<input type="number" data-path="${path}" value="${this.escape(value)}" min="${min}" max="${max}" step="${step}" style="width: ${width}px; padding: 3px 4px; font-size: 12px; background: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; box-sizing: border-box;">`;
    }

    /** A themed picker for a layer's draw order. */
    orderSelect(path, value) {
        const option = (v, label) => `<option value="${v}"${value === v ? ' selected' : ''}>${this.escape(label)}</option>`;
        return `<select data-path="${path}" style="padding: 2px 4px; font-size: 12px; background: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px;">`
            + option('random', this.tt('Random')) + option('shuffle', this.tt('Shuffle'))
            + option('sequential', this.tt('In order')) + `</select>`;
    }

    /** Starters…: a themed dropdown of ready shapes, each option saying what it does. */
    starterSelect() {
        const options = RRBgmSequenceEditor.STARTERS.map(starter =>
            `<option value="${starter.id}" title="${this.escape(this.tt(starter.hint))}">${this.escape(this.tt(starter.label))}</option>`).join('');
        return `<select class="bgm-seq-starters" style="padding: 2px 4px; font-size: 11px; background: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px;">`
            + `<option value="" selected title="${this.escape(this.tt('Fill the list with a ready-made shape. Its tracks come from this project’s BGM folder, to swap for your own.'))}">${this.escape(this.tt('Starters…'))}</option>`
            + `${options}</select>`;
    }

    /** Replace the list with a starter, asking first when there are entries to lose. */
    applyStarter(id) {
        const entries = RRBgmSequenceEditor.starter(id, this.listTracks());
        const replacing = this.sequence.entries.length > 0;
        if (entries && (!replacing || this.confirm(this.tt('Replace the entries in this list with the starter?')))) {
            this.sequence.entries = entries;
            this.render();
            this.edited();
            return true;
        }
        // Declined: redraw so the dropdown reads Starters… again.
        this.render();
        return false;
    }

    smallButton(action, path, label, title) {
        return `<button type="button" class="bgm-seq-btn" data-action="${action}" data-path="${path}" title="${this.escape(title || label)}">${this.escape(label)}</button>`;
    }

    rowTools(path, once) {
        return `<span style="display: inline-flex; gap: 6px; align-items: center; flex: 0 0 auto;">`
            + `<label title="${this.escape(this.tt('Plays on the first pass only, then is skipped.'))}" style="display: inline-flex; align-items: center; gap: 3px; font-size: 11px; color: var(--color-text-muted);">`
            + `<input type="checkbox" data-path="${path}.once"${once ? ' checked' : ''}> ${this.escape(this.tt('Intro'))}</label>`
            + this.smallButton('up', path, '▲', this.tt('Move up'))
            + this.smallButton('down', path, '▼', this.tt('Move down'))
            + this.smallButton('remove', path, '×', this.tt('Remove'))
            + `</span>`;
    }

    trackName(name) {
        return name
            ? `<span style="color: var(--color-text);">${this.escape(name)}</span>`
            : `<span style="color: var(--color-text-muted);">${this.escape(this.tt('No track chosen'))}</span>`;
    }

    renderEntry(entry, index) {
        const path = `entries.${index}`;
        const head = `<span style="flex: 0 0 auto; min-width: 16px; color: var(--color-text-muted); font-size: 11px;">${index + 1}</span>`;
        const nameBox = (p, name, levels) => `<span data-action="pick" data-path="${p}" title="${this.escape(this.tt('Choose a track'))}" style="flex: 1; min-width: 0; padding: 4px 6px; background: var(--color-bg-input); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer;">${this.trackName(name)}${levels ? ` <span style="color: var(--color-text-muted); font-size: 11px;">${this.escape(this.levelsText(levels))}</span>` : ''}</span>`;
        if (entry.type === 'track') {
            return `<div class="bgm-seq-row bgm-seq-depth-1" style="display: flex; gap: 6px; align-items: center;">${head}
                <span style="flex: 0 0 52px; font-size: 12px;">${this.escape(this.tt('Track'))}</span>
                ${nameBox(path, entry.name, entry)}
                <label style="flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; font-size: 12px;">${this.escape(this.tt('Fade-in (s)'))} ${this.numberInput(`${path}.fadeIn`, entry.fadeIn, 0, 600, 0.5, 60)}</label>
                ${this.rowTools(path, entry.once)}
            </div>`;
        }
        if (entry.type === 'silence') {
            return `<div class="bgm-seq-row bgm-seq-depth-1" style="display: flex; gap: 6px; align-items: center;">${head}
                <span style="flex: 0 0 52px; font-size: 12px;">${this.escape(this.tt('Silence'))}</span>
                <span style="flex: 1; display: flex; align-items: center; gap: 4px; font-size: 12px;">${this.numberInput(`${path}.duration`, entry.duration, 0, 3600, 0.5, 64)} ${this.escape(this.tt('s'))}</span>
                ${this.rowTools(path, entry.once)}
            </div>`;
        }
        const layers = entry.layers.map((layer, l) => {
            const lp = `${path}.layers.${l}`;
            const pool = layer.pool.map((item, i) => {
                const ip = `${lp}.pool.${i}`;
                const body = item.type === 'silence'
                    ? `<span style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px;">${this.escape(this.tt('Silence'))} ${this.numberInput(`${ip}.duration`, item.duration, 0, 3600, 0.5, 60)} ${this.escape(this.tt('s'))}</span>`
                    : `${nameBox(ip, item.name, null)}<label style="flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px; font-size: 12px;">${this.escape(this.tt('Volume'))} ${this.numberInput(`${ip}.volume`, item.volume, 0, 100, 1, 54)}</label>`;
                return `<div class="bgm-seq-depth-3" style="display: flex; gap: 6px; align-items: center;">${body}${this.smallButton('remove', ip, '×', this.tt('Remove'))}</div>`;
            }).join('');
            // Four controls plus the remove button do not fit the column, the
            // same way the palette's timings did not: the title line keeps the
            // button where every other row keeps it, and the controls get a line.
            return `<div class="bgm-seq-depth-2">
                <div style="display: flex; gap: 8px; align-items: center; font-size: 12px;">
                    <span style="min-width: 52px;">${this.escape(this.tt('Layer {n}').replace('{n}', String(l + 1)))}</span>
                    <span style="flex: 1;"></span>
                    ${this.smallButton('remove', lp, '×', this.tt('Remove'))}
                </div>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; font-size: 12px; padding: 3px 0 0 4px;">
                    <label style="display: inline-flex; align-items: center; gap: 4px;">${this.escape(this.tt('Volume'))} ${this.numberInput(`${lp}.volume`, layer.volume, 0, 100, 1, 54)}</label>
                    <label style="display: inline-flex; align-items: center; gap: 4px;">${this.escape(this.tt('Pitch'))} ${this.numberInput(`${lp}.pitch`, layer.pitch, 50, 150, 1, 54)}</label>
                    <label style="display: inline-flex; align-items: center; gap: 4px;">${this.escape(this.tt('Pan'))} ${this.numberInput(`${lp}.pan`, layer.pan, -100, 100, 1, 54)}</label>
                    <label style="display: inline-flex; align-items: center; gap: 4px;">${this.escape(this.tt('Order'))} ${this.orderSelect(`${lp}.order`, layer.order)}</label>
                </div>
                ${pool}
                <div style="display: flex; gap: 4px; padding: 3px 0 0 14px;">
                    ${this.smallButton('add-pool-track', lp, this.tt('+ Track'))}
                    ${this.smallButton('add-pool-silence', lp, this.tt('+ Silence'))}
                </div>
            </div>`;
        }).join('');
        // Three timing fields plus the row tools need 564px and the dialog gives
        // the column 492, at every window size -- the modal is a fixed 1150 wide.
        // So the fields get their own line rather than pushing the tools onto a
        // second one, which left the arrows orphaned under the row they belong to.
        return `<div class="bgm-seq-row bgm-seq-depth-1">
            <div style="display: flex; gap: 6px; align-items: center;">${head}
                <span style="flex: 0 0 52px; font-size: 12px;">${this.escape(this.tt('Palette'))}</span>
                <span style="flex: 1;"></span>
                ${this.rowTools(path, entry.once)}
            </div>
            <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 3px 0 0 22px;">
                <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px;">${this.escape(this.tt('Duration (s)'))} ${this.numberInput(`${path}.duration`, entry.duration, 0, 36000, 1, 64)}</label>
                <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px;">${this.escape(this.tt('Fade-in (s)'))} ${this.numberInput(`${path}.fadeIn`, entry.fadeIn, 0, 600, 0.5, 60)}</label>
                <label style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px;">${this.escape(this.tt('Fade-out (s)'))} ${this.numberInput(`${path}.fadeOut`, entry.fadeOut, 0, 600, 0.5, 60)}</label>
                <label title="${this.escape(this.tt('Each layer plays one track, then the sequence moves on.'))}" style="display: inline-flex; align-items: center; gap: 4px; font-size: 12px;"><input type="checkbox" data-path="${path}.single"${entry.single ? ' checked' : ''}> ${this.escape(this.tt('Move on after one track'))}</label>
            </div>
            ${layers}
            <div style="padding: 3px 0 0 22px;">${this.smallButton('add-layer', path, this.tt('+ Layer'))}</div>
        </div>`;
    }

    render() {
        const entries = this.sequence.entries;
        const rows = entries.map((entry, index) => this.renderEntry(entry, index)).join('');
        this.container.innerHTML = `
            <div style="font-size: 11px; color: var(--color-text-muted); line-height: 1.5; margin-bottom: 4px;">${this.escape(this.tt('Each layer plays one track at a time from its pool, at random or in order. Loop points are ignored inside a sequence.'))} ${this.escape(this.tt('A fade-in on the next entry crossfades into it.'))} ${this.escape(this.t('mapProps.bgmSequenceDuration'))}</div>
            <div class="bgm-seq-list" style="display: flex; flex-direction: column; gap: 4px;">${rows || `<div style="font-size: 12px; color: var(--color-text-muted); padding: 4px 0;">${this.escape(this.tt('No entries yet.'))}</div>`}</div>
            <div style="display: flex; gap: 4px; margin-top: 6px; align-items: center;">
                ${this.smallButton('add-track', '', this.tt('+ Track'))}
                ${this.smallButton('add-silence', '', this.tt('+ Silence'))}
                ${this.smallButton('add-palette', '', this.tt('+ Palette'))}
                <span style="flex: 1;"></span>
                ${this.starterSelect()}
            </div>`;
    }

    /** The object at a dotted path into the sequence, and the list plus index it sits in. */
    resolve(path) {
        const parts = String(path || '').split('.').filter(Boolean);
        let node = this.sequence;
        let list = null;
        let index = -1;
        for (const part of parts) {
            if (Array.isArray(node)) {
                list = node;
                index = Number(part);
                node = node[index];
            } else {
                list = null;
                node = node ? node[part] : undefined;
            }
        }
        return { node, list, index };
    }

    onClick(event) {
        const target = event.target.closest('[data-action]');
        if (!target || !this.container.contains(target)) return;
        event.preventDefault();
        const action = target.dataset.action;
        const path = target.dataset.path || '';
        const { node, list, index } = this.resolve(path);
        switch (action) {
            case 'add-track':
                this.sequence.entries.push(Object.assign({ type: 'track', name: '', fadeIn: 0 }, RRBgmSequenceEditor.levels(null)));
                break;
            case 'add-silence':
                this.sequence.entries.push({ type: 'silence', duration: 10 });
                break;
            case 'add-palette':
                this.sequence.entries.push({ type: 'palette', duration: 0, fadeIn: 0, fadeOut: 4, layers: [RRBgmSequenceEditor.layer(null)] });
                break;
            case 'add-layer':
                if (node && node.type === 'palette') node.layers.push(RRBgmSequenceEditor.layer(null));
                break;
            case 'add-pool-track':
                if (node && node.pool) node.pool.push({ type: 'track', name: '' });
                break;
            case 'add-pool-silence':
                if (node && node.pool) node.pool.push({ type: 'silence', duration: 10 });
                break;
            case 'remove':
                if (list && index >= 0) list.splice(index, 1);
                break;
            case 'up':
                if (list && index > 0) list.splice(index - 1, 2, list[index], list[index - 1]);
                break;
            case 'down':
                if (list && index >= 0 && index < list.length - 1) list.splice(index, 2, list[index + 1], list[index]);
                break;
            case 'pick':
                this.pick(path, node, list);
                return;
            default:
                return;
        }
        this.render();
        this.edited();
    }

    onChange(event) {
        const input = event.target;
        if (input && input.classList && input.classList.contains('bgm-seq-starters')) {
            if (input.value) this.applyStarter(input.value);
            return;
        }
        const path = input && input.dataset ? input.dataset.path : null;
        if (!path) return;
        const parts = path.split('.');
        const key = parts.pop();
        const { node } = this.resolve(parts.join('.'));
        if (!node) return;
        // An unlisted key is not merely ignored: the write-back below then
        // restores the old value, so the field reads as refusing to be typed in
        // at all. Anything numberInput() renders has to appear here.
        if (key === 'duration' || key === 'fadeOut' || key === 'fadeIn') node[key] = RRBgmSequenceEditor.seconds(input.value);
        else if (key === 'volume') node[key] = RRBgmSequenceEditor.number(input.value, 100, 0, 100);
        else if (key === 'pitch') node[key] = RRBgmSequenceEditor.number(input.value, 100, 50, 150);
        else if (key === 'pan') node[key] = RRBgmSequenceEditor.number(input.value, 0, -100, 100);
        else if (key === 'order') node[key] = input.value === 'sequential' || input.value === 'shuffle' ? input.value : 'random';
        else if (key === 'once' || key === 'single') { node[key] = !!input.checked; this.edited(); return; }
        input.value = node[key];
        this.edited();
    }

    /** A track row carries its own levels; a pool entry previews with its layer's. */
    async pick(path, node, list) {
        if (!node) return;
        const isPoolEntry = /\.pool\.\d+$/.test(path);
        let options;
        if (isPoolEntry) {
            const layer = this.resolve(path.replace(/\.pool\.\d+$/, '')).node;
            options = { selected: node.name, levels: null, previewLevels: RRBgmSequenceEditor.levels(layer) };
        } else {
            options = { selected: node.name, levels: RRBgmSequenceEditor.levels(node) };
        }
        const result = await this.pickTrack(options);
        if (!result || !result.name) return;
        node.name = result.name;
        if (!isPoolEntry) Object.assign(node, RRBgmSequenceEditor.levels(result));
        this.render();
        this.edited();
    }
}

if (typeof globalThis !== 'undefined') globalThis.RRBgmSequenceEditor = RRBgmSequenceEditor;
if (typeof module !== 'undefined' && module.exports) module.exports = RRBgmSequenceEditor;
