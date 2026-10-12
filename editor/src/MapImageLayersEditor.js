/**
 * MapImageLayersEditor - what the Image Layers tool knows, apart from its panel.
 *
 * An image layer is a picture from img/parallaxes drawn with a map ($dataMap.rrImageLayers): a painted map
 * locked to the tiles, fog or clouds repeating across the view, a far background, an overlay that fills the
 * screen, or scenery at the characters' depth that stops movement. The game's rules (defaults, the stored
 * form, picture names, depth, what a 3D map draws, what blocks) are the runtime's
 * (runtime/reactor_image_layers.js, ReactorImageLayers) and are called, never copied. This file holds what
 * the editor adds: the things Add makes, which settings apply to a layer, the words the panel shows, the
 * list's order, and the edits with their undo.
 *
 *   RRMapImageLayers.choices(is3D) → the Add menu        .make(key, picture) → a stored layer
 *   .rows(layer, is3D) → the settings rows that apply    .describe / .conditionWords / .rowLines
 *   .sizeNote / .note3D / .repeatLabel / .repeatHint / .scrollHint → what the panel says
 *   .versionRows / .versionParts / .versionWords / .versionsRest → the pictures a variable chooses, row by row
 *   .setVersion / .moveVersion / .removeVersion / .nextValue → the change that adds, renumbers or removes a row
 *   .versionValue(typed) → the whole number a row can be for (a variable's range), or NaN
 *   .importWords / .found / .listed → an import's name pattern, the files it names, and those files as rows
 *   .lookChoices → the pictures the map can show while the tool is open
 *   .order(layers) → stored indexes, top row first       .canMove / .move / .change / .add / .remove
 *   new RRMapImageLayers.Session() → one map's layers with undo, redo, the eye and the version looked at
 *   .load(layers) / .read() → the stored list as it is (an untouched list reads back unchanged)
 *
 * A sentence that quotes a name marks it with a pair of direction isolates: a picture's name is a file name
 * and keeps its characters in order (.ltr), a switch's or variable's name reads in its own direction (.own).
 * In a right-to-left language "7-1_Ground" would otherwise be shown as "Ground_1-7". .plain(text) takes the
 * marks out again.
 */
(function (root) {
    'use strict';
    const tt = (text) => (root.I18n ? root.I18n.tText(text) : text);
    const KEYED = { 'event.belowCharacters': 'Below Characters', 'event.sameAsCharacters': 'Same as Characters', 'event.aboveCharacters': 'Above Characters', 'imageLayers.repeats': 'Repeats' };
    const keyed = (key) => (root.I18n ? root.I18n.t(key) : KEYED[key]);
    /** A sentence with its {names} filled in, once, literally. */
    const fill = (text, values) => String(text).replace(/\{(\w+)\}/g, (token, name) => (Object.hasOwn(values, name) ? String(values[name]) : token));
    const runtime = () => root.ReactorImageLayers || null;
    /** A picture's name inside a sentence: left to right, as one piece. */
    const ltr = (text) => `\u2066${text}\u2069`;
    /** A name the author gave, inside a sentence: in its own direction, as one piece. */
    const own = (text) => `\u2068${text}\u2069`;
    /** The words without the marks around names. */
    const plain = (text) => String(text).replace(/[\u2066-\u2069]/g, '');
    const isLayer = (layer) => !!layer && typeof layer === 'object';

    // What Add makes. Each is a layer that works before a setting is touched; a 3D map is offered only those it draws.
    const CHOICES = [
        { key: 'painted', label: 'Painted map picture', hint: 'One picture as large as the map, under the characters (parallax mapping).', spec: { layer: 'ground', fit: 'map' } },
        { key: 'fog', label: 'Fog or clouds', hint: 'Repeats across the view and scrolls above the characters.', spec: { layer: 'over', fit: 'repeat', drift: [12, 4], opacity: 128 } },
        { key: 'far', label: 'Far background', hint: 'Repeats behind the map, where it has no tiles, and moves slower than it.', spec: { layer: 'back', fit: 'repeat', repeat: 'x', follow: 0.5 } },
        { key: 'overlay', label: 'Screen overlay', hint: 'Fills the screen: a vignette or a light.', spec: { layer: 'over', fit: 'fill' } },
        { key: 'solid', label: 'Solid scenery', hint: 'Trees, fences and houses the characters cannot walk through.', spec: { layer: 'same', fit: 'map' } }
    ];
    const DEPTH_KEYS = { ground: 'event.belowCharacters', same: 'event.sameAsCharacters', over: 'event.aboveCharacters' };
    const FIT_LABELS = { map: 'Locked to the map', repeat: 'Repeating', fill: 'Fills the screen' };
    const FIT_HINTS = {
        map: 'One picture as large as the map. It scrolls with the tiles.',
        repeat: 'Repeats across the view and can scroll: fog, clouds, rain, a far background.',
        fill: 'Stretched over the screen and fixed to it: a vignette, a light.'
    };
    // A few words for each placement in the list it is chosen from, short enough that the list needs no scrollbar.
    const FIT_WORDS = {
        map: 'For a painted map and scenery.',
        repeat: 'For fog, clouds, rain and far backgrounds. It can scroll.',
        fill: 'For a vignette, a light or a frame.'
    };
    const REPEAT_LABELS = { both: 'Across and down', x: 'Across only', y: 'Down only' };
    const REPEAT_HINTS = {
        both: 'The picture repeats in every direction: fog, clouds, a starry sky.',
        x: 'The picture repeats sideways and keeps its own height: a far mountain strip, a horizon.',
        y: 'The picture repeats downward and keeps its own width: streaks of rain, a waterfall.'
    };
    const SCROLL_HINTS = {
        both: 'Pixels per second, right and down. Negative numbers go left and up.',
        x: 'Pixels per second to the right. A negative number goes left.',
        y: 'Pixels per second downward. A negative number goes up.'
    };
    const BLEND_LABELS = { normal: 'Normal', add: 'Add: light', multiply: 'Multiply: shadow', screen: 'Screen: soft light' };
    const OP_LABELS = { '=': 'is exactly', '>=': 'is at least', '<=': 'is at most' };
    const WHEN_WORDS = { '=': 'While {name} is {value}', '>=': 'While {name} is at least {value}', '<=': 'While {name} is at most {value}' };

    /** The Add menu: on a 3D map, only what a 3D map draws. */
    function choices(is3D = false) {
        const R = runtime();
        return CHOICES.filter(choice => !is3D || (R && R.drawnOn3D(R.normalize(choice.spec))))
            .map(choice => ({ key: choice.key, label: tt(choice.label), hint: tt(choice.hint) }));
    }

    /** The stored layer an Add choice makes for a picture. */
    function make(key, picture) {
        const R = runtime(), choice = CHOICES.find(entry => entry.key === key) || CHOICES[0];
        return R.write(R.normalize(Object.assign({ name: String(picture || '') }, choice.spec)));
    }

    const depthLabel = (position) => (DEPTH_KEYS[position] ? keyed(DEPTH_KEYS[position]) : tt('Behind the map'));
    const fitLabel = (fit) => tt(FIT_LABELS[fit]) || fit;
    const fitHint = (fit) => tt(FIT_HINTS[fit]) || '';
    const fitWords = (fit) => tt(FIT_WORDS[fit]) || '';
    /** Why a placement cannot be chosen at the characters' depth, in one line for the list. */
    const fitBlocked = () => fill(tt('{depth} needs a picture locked to the map.'), { depth: depthLabel('same') });
    /** The label of the row that says which way a layer repeats. A keyed word: the plain phrase means a count elsewhere in the editor. */
    const repeatsLabel = () => keyed('imageLayers.repeats');
    const repeatLabel = (repeat) => tt(REPEAT_LABELS[repeat] || REPEAT_LABELS.both);
    const repeatHint = (repeat) => tt(REPEAT_HINTS[repeat] || REPEAT_HINTS.both);
    /** What the Scroll Speed numbers mean for the directions a layer repeats in. */
    const scrollHint = (repeat) => tt(SCROLL_HINTS[repeat] || SCROLL_HINTS.both);
    const blendLabel = (name) => tt(BLEND_LABELS[name]) || name;
    const opLabel = (op) => tt(OP_LABELS[op]) || op;

    /** The settings rows that apply to a layer, top to bottom. */
    function rows(layer, is3D = false) {
        const r = runtime().normalize(layer), out = ['picture', 'depth', 'placement'];
        if (r.layer === 'same') out.push('solid');
        // A 3D map draws a repeating layer on the screen, so how far it follows the map has nothing to say there.
        if (r.fit === 'repeat') { out.push('repeats', 'drift'); if (!is3D) out.push('follow'); }
        out.push('opacity', 'blend', 'shown');
        if (r.switch || r.when) out.push('fade');
        out.push('versions');
        return out;
    }

    /** Whether a placement can be chosen for a layer at this depth. */
    const fitAllowed = (position, fit) => position !== 'same' || fit === 'map';

    /**
     * What a layer is, in the words of its two selects: "Above Characters, Repeating". A layer whose file
     * gives it a depth of its own (z) is sorted by that depth, so its row says that depth and not the select's.
     */
    function describe(layer) {
        const r = runtime().normalize(layer);
        const depth = typeof r.z === 'number' ? fill(tt('Custom depth {z}'), { z: r.z }) : depthLabel(r.layer);
        return `${depth}, ${fitLabel(r.fit)}`;
    }

    /** For the Depth row of a layer with a depth of its own: what that is, and what choosing a depth does to it. */
    function depthNote(layer) {
        const r = runtime().normalize(layer);
        return typeof r.z === 'number' ? fill(tt('The map file gives this layer its own depth, {z}. Choosing a depth here replaces it.'), { z: r.z }) : null;
    }

    const pad = (id) => String(id).padStart(4, '0');
    /** Switch and variable names from System.json; an unnamed one is called by its number. */
    function namesFrom(system) {
        const name = (list, id, word) => {
            const given = list && typeof list[id] === 'string' ? list[id].trim() : '';
            return given || `${tt(word)} ${pad(id)}`;
        };
        return {
            switchName: (id) => name(system && system.switches, id, 'Switch'),
            variableName: (id) => name(system && system.variables, id, 'Variable'),
            /** What a picker field shows: "0012: Chapter". */
            switchLabel: (id) => `${pad(id)}: ${name(system && system.switches, id, 'Switch')}`,
            variableLabel: (id) => `${pad(id)}: ${name(system && system.variables, id, 'Variable')}`
        };
    }

    /** The conditions a layer is shown under, one sentence each; none when it is always shown. */
    function conditionWords(layer, names = namesFrom(null)) {
        const r = runtime().normalize(layer), out = [];
        if (r.switch) out.push(fill(tt('While {name} is ON'), { name: own(names.switchName(r.switch)) }));
        if (r.when) out.push(fill(tt(WHEN_WORDS[r.when.op]) || WHEN_WORDS['>='], { name: own(names.variableName(r.when.variable)), value: r.when.value }));
        return out;
    }

    /** A 3D map draws only layers placed on the screen above characters: what to say of one it does not draw. */
    function note3D(layer, is3D) {
        const R = runtime();
        if (!is3D || R.drawnOn3D(R.normalize(layer))) return null;
        const fix = fill(tt('Set {placement} to {repeating} or {fills}, and {depth} to {above}.'), {
            placement: tt('Placement'), repeating: fitLabel('repeat'), fills: fitLabel('fill'), depth: tt('Depth'), above: depthLabel('over')
        });
        return { row: tt('Not drawn on a 3D map'), text: `${tt('A 3D map shows layers placed on the screen, above characters.')} ${fix}` };
    }

    /** A row of the list: the picture's name and the lines under it. */
    function rowLines(layer, names, is3D = false) {
        const r = runtime().normalize(layer), note = note3D(layer, is3D);
        return { title: r.name || tt('(None)'), lines: [describe(layer), ...conditionWords(layer, names)], warning: note ? note.row : '' };
    }

    /** What changing the picture with a variable is for, in one line. */
    const versionsIntro = () => tt('For day and night, seasons, or a bridge that breaks. It never hides the layer.');

    /** The pictures a layer lists by its variable's value, lowest value first: [{ value, name }]. */
    function versionRows(layer) {
        const listed = runtime().normalize(layer).versions || {};
        return Object.keys(listed).map(key => ({ value: Number(key), name: listed[key] })).sort((a, b) => a.value - b.value);
    }

    /**
     * A row's sentence around its two controls, in the order the language puts them:
     * [{ text }, { slot: 'value' }, { text }, { slot: 'picture' }]. A comma or a colon that follows a control
     * is a piece of its own ({ text, mark: true }): the panel sets it against the control, where the gap
     * between the pieces would leave it standing alone.
     */
    function versionParts() {
        const out = [];
        for (const part of tt('When it is {value} show {picture}').split(/(\{value\}|\{picture\})/)) {
            if (part === '{value}' || part === '{picture}') { out.push({ slot: part.slice(1, -1) }); continue; }
            const mark = out.length && out[out.length - 1].slot ? /^[,;:.!?،؛、。，：；]+/.exec(part) : null;
            if (mark) out.push({ text: mark[0], mark: true });
            const text = (mark ? part.slice(mark[0].length) : part).trim();
            if (text) out.push({ text });
        }
        return out;
    }

    /** A row's sentence whole: "When it is 2 show Town_winter". */
    const versionWords = (value, name) => fill(tt('When it is {value} show {picture}'), { value, picture: ltr(name) });

    /** What every value without a row shows; with no row yet, that the layer's own picture is all there is. */
    function versionsRest(layer) {
        const r = runtime().normalize(layer);
        const text = r.versions || r.variantName ? tt('Any other value shows the layer\'s own picture, {picture}.')
            : tt('No picture is listed yet: the layer shows its own picture, {picture}.');
        return fill(text, { picture: ltr(r.name) });
    }

    // A variable holds a whole number from -99999999 to 99999999, and a row can be for any of them.
    const VALUE_LIMIT = 99999999;
    /** The whole number a row can be for that is nearest to what was typed; NaN when that is no number. */
    function versionValue(typed) {
        const text = String(typed).trim(), n = text === '' ? NaN : Math.round(Number(text));
        return Number.isFinite(n) ? Math.max(-VALUE_LIMIT, Math.min(VALUE_LIMIT, n)) : NaN;
    }

    /** The value Add gives a new row: one more than the highest listed, 1 for the first. */
    function nextValue(layer) {
        const rows = versionRows(layer);
        return rows.length ? Math.max(1, rows[rows.length - 1].value + 1) : 1;
    }

    const versionsPatch = (listed) => ({ versions: Object.keys(listed).length ? listed : null });
    /** The patch that lists `name` for `value` (a new row, or another picture for a row there is). */
    function setVersion(layer, value, name) {
        const listed = Object.assign({}, runtime().normalize(layer).versions);
        listed[String(Math.round(value))] = String(name);
        return versionsPatch(listed);
    }
    /** The patch that takes the row of `value` away. */
    function removeVersion(layer, value) {
        const listed = Object.assign({}, runtime().normalize(layer).versions);
        delete listed[String(value)];
        return versionsPatch(listed);
    }
    /**
     * The row of `from` given the value `to`: { value, patch }. A value another row has is not taken: a typed
     * number is refused (null); `stepped` says the field's arrow made it, and one step up or down then goes
     * on to the next free value.
     */
    function moveVersion(layer, from, to, stepped = false) {
        const listed = Object.assign({}, runtime().normalize(layer).versions), name = listed[String(from)];
        let target = versionValue(to);
        if (!name || !Number.isFinite(target) || target === from) return null;
        const step = target - from;
        if (stepped && Math.abs(step) === 1) while (Math.abs(target) <= VALUE_LIMIT && Object.hasOwn(listed, String(target))) target += step;
        if (Math.abs(target) > VALUE_LIMIT || Object.hasOwn(listed, String(target))) return null;
        delete listed[String(from)];
        listed[String(target)] = name;
        return { value: target, patch: versionsPatch(listed) };
    }

    /** The name numbered pictures of `name` usually have: "43_Ground" gives "43-%1_Ground", "Town" gives "Town-%1". */
    function numberedPattern(name) {
        const text = String(name || ''), numbered = /^(\d+)(_.*)$/.exec(text);
        return numbered ? `${numbered[1]}-%1${numbered[2]}` : `${text}-%1`;
    }

    /** The files a name pattern names, lowest number first: [{ value, name }]. `files` are the names in img/parallaxes. */
    function matching(pattern, files) {
        const parts = String(pattern || '').split('%1');
        if (parts.length < 2) return [];
        const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // The number once, and the same number wherever the pattern asks for it again.
        const test = new RegExp('^' + parts.map((part, at) => (at === 0 ? '' : at === 1 ? '(\\d+)' : '\\1') + escape(part)).join('') + '$');
        const out = [], seen = new Set();
        for (const name of files || []) {
            const hit = test.exec(name);
            // The number as the game writes it: a file numbered "01" is never asked for.
            if (!hit || String(Number(hit[1])) !== hit[1] || seen.has(hit[1])) continue;
            seen.add(hit[1]);
            out.push({ value: Number(hit[1]), name });
        }
        return out.sort((a, b) => a.value - b.value);
    }

    /** An imported layer's name pattern in words: "From an import: while the variable is N, the layer shows 43-N_Ground." Null without one. */
    function importWords(layer) {
        const r = runtime().normalize(layer);
        if (!r.variable || !r.variantName) return null;
        return fill(tt('From an import: while the variable is N, the layer shows {picture}.'), { picture: ltr(r.variantName.split('%1').join('N')) });
    }

    /**
     * The numbered pictures in img/parallaxes that are not rows yet: those an import's pattern names, or,
     * for a layer with no row and no pattern, those named after the layer's own picture ("Town-1", "7-2_Ground").
     * { imported, files: [{ value, name }], words } or null when the layer has no variable.
     */
    function found(layer, files) {
        const r = runtime().normalize(layer);
        if (!r.variable) return null;
        const imported = !!r.variantName, listed = r.versions || {};
        if (!imported && r.versions) return { imported, files: [], words: '' };
        const hits = matching(imported ? r.variantName : numberedPattern(r.name), files).filter(hit => !Object.hasOwn(listed, String(hit.value)));
        const names = hits.map(hit => ltr(hit.name)).join(', ');
        const words = hits.length ? fill(tt(imported ? 'In img/parallaxes now: {files}.' : 'Found in img/parallaxes: {files}.'), { files: names })
            : imported && !r.versions ? tt('None of these numbered pictures is in img/parallaxes yet.') : '';
        return { imported, files: hits, words };
    }

    /**
     * The patch of "List the pictures": every file found becomes a row (a row that is there stays), and the
     * pattern is taken out, so the rows are all the layer shows. Null when no file was found.
     */
    function listed(layer, files) {
        const hits = found(layer, files);
        if (!hits || !hits.files.length) return null;
        const rows = Object.assign({}, runtime().normalize(layer).versions);
        for (const hit of hits.files) rows[String(hit.value)] = hit.name;
        return { versions: rows, variantName: '' };
    }

    /**
     * What the map can show while the tool is open: the layer's own picture, then each value that has a
     * picture (a row, or a file an import's pattern names), lowest first. [{ value, label }]. The layer's
     * own picture is value 0, where play starts; when 0 has a row, 0 is that row and the layer's own picture
     * is value null, so it can still be looked at. A label is the text of a list entry, so a picture's name
     * keeps its marks there: they are what holds a file name in order in a right-to-left language.
     */
    function lookChoices(layer, files) {
        const R = runtime(), r = R.normalize(layer);
        const values = new Set(versionRows(layer).map(row => row.value));
        if (r.variantName) for (const hit of matching(r.variantName, files)) values.add(hit.value);
        const zero = R.pictureName(r, 0) !== r.name;
        if (zero) values.add(0); else values.delete(0);
        const at = (value) => `${value}: ${ltr(R.pictureName(r, value))}`;
        const own = { value: zero ? null : 0, label: fill(tt('The layer\'s own picture: {picture}'), { picture: ltr(r.name) }) };
        return [own].concat([...values].sort((a, b) => a - b).map(value => ({ value, label: at(value) })));
    }

    /**
     * A picture locked to the map must be the map's size in pixels: the map's size, or a warning with both
     * sizes when the picture's differs. Null for a layer that is not locked to the map.
     */
    function sizeNote(layer, picture, map) {
        const r = runtime().normalize(layer);
        if (r.fit !== 'map' || !map || !(map.width > 0) || !(map.height > 0)) return null;
        const sizes = { mw: map.width, mh: map.height, pw: picture ? picture.width : 0, ph: picture ? picture.height : 0 };
        if (picture && picture.width > 0 && (picture.width !== map.width || picture.height !== map.height)) {
            return { warning: true, text: fill(tt('This picture is {pw} × {ph}. The map is {mw} × {mh}.'), sizes) };
        }
        return { warning: false, text: fill(tt('The map is {mw} × {mh} pixels.'), sizes) };
    }

    /**
     * Stored indexes in the order the list shows them: the top row is drawn on top. An entry that is no
     * layer (a null that a script or a hand edit left in the file) has no row and keeps its place in the file.
     */
    function order(layers) {
        const R = runtime(), out = [];
        (layers || []).forEach((layer, index) => { if (isLayer(layer)) out.push({ index, depth: R.depth(R.normalize(layer), index) }); });
        return out.sort((a, b) => (b.depth - a.depth) || (b.index - a.index)).map(entry => entry.index);
    }

    /** The stored index a row swaps with when moved (-1 up, 1 down): its neighbor in the list, of the same depth. */
    function neighbor(layers, index, direction) {
        const R = runtime(), listed = order(layers), other = listed[listed.indexOf(index) + direction];
        if (other === undefined || !layers[index]) return -1;
        return R.depth(R.normalize(layers[index]), 0) === R.depth(R.normalize(layers[other]), 0) ? other : -1;
    }
    const canMove = (layers, index, direction) => neighbor(layers, index, direction) >= 0;

    /** The list with a row moved one place up or down; the same list when it cannot move. */
    function move(layers, index, direction) {
        const other = neighbor(layers, index, direction);
        if (other < 0) return layers;
        const next = layers.slice();
        next[index] = layers[other];
        next[other] = layers[index];
        return next;
    }

    /**
     * The list with one layer changed. Only that layer is written again, through the runtime's stored form;
     * every other layer stays the object it was. `loaded` is the layer as the map file had it: an import's
     * name pattern belongs to the picture it was loaded with, and comes back with the variable for that picture.
     */
    function change(layers, index, patch, loaded = null) {
        const R = runtime(), before = R.normalize(layers[index]), next = Object.assign({}, before, patch);
        // A depth chosen in the tool is the layer's depth: one the file set by number gives way to it.
        if (patch && 'layer' in patch && !('z' in patch)) next.z = null;
        if (next.layer === 'same') next.fit = 'map';
        // The stored form keeps `repeat` only for a repeating layer and `versions` only with a variable.
        if (next.fit !== 'repeat') { next.drift = R.DEFAULTS.drift.slice(); next.follow = R.DEFAULTS.follow; }
        // A layer scrolls only in a direction it repeats in: the other speed is not kept in the file.
        else if (next.repeat === 'x') next.drift = [next.drift[0], 0];
        else if (next.repeat === 'y') next.drift = [0, next.drift[1]];
        if (!next.switch && !next.when) next.fade = R.DEFAULTS.fade;
        // Without the variable nothing chooses a picture: the pattern goes with it.
        if (!next.variable) next.variantName = '';
        else if (next.name !== before.name || !before.variable) {
            next.variantName = loaded && loaded.variantName && loaded.name === next.name ? String(loaded.variantName) : '';
        }
        const out = layers.slice();
        out[index] = R.write(R.normalize(next));
        return out;
    }
    const add = (layers, layer) => (layers || []).concat([layer]);
    const remove = (layers, index) => layers.filter((layer, at) => at !== index);
    /** Whether two lists would be the same in the map file. */
    const sameStored = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

    /**
     * One map's image layers while the editor has it open. A layer is never changed in place: an edit
     * replaces the list (and the one layer written), so an undo step is the list as it was, and a map nobody
     * edited keeps the very objects it was read with. Each layer has a number for this session that follows
     * it through edits and undo: the eye and the version looked at are kept by it and never saved.
     */
    class Session {
        constructor() {
            this.map = null;
            this.undoStack = [];
            this.redoStack = [];
            this.hidden = new Set();
            this.looking = new Map();
            this._ids = new WeakMap();
            this._loaded = new Map();
            this._nextId = 1;
            this._gesture = null;
            this._emptyForm = undefined;
        }

        /** Another map: its steps, eyes and looks start empty. */
        bind(map) {
            if (map === this.map) return false;
            this.map = map || null;
            this.undoStack.length = 0;
            this.redoStack.length = 0;
            this.hidden.clear();
            this.looking.clear();
            this._loaded.clear();
            this._gesture = null;
            // A map stored with an empty list keeps it when its last layer is removed again.
            this._emptyForm = map && Array.isArray(map.rrImageLayers) && !map.rrImageLayers.length ? map.rrImageLayers : undefined;
            return true;
        }

        layers() {
            return this.map && Array.isArray(this.map.rrImageLayers) ? this.map.rrImageLayers : [];
        }

        idOf(layer) {
            if (!layer || typeof layer !== 'object') return 0;
            let id = this._ids.get(layer);
            if (!id) {
                id = this._nextId++;
                this._ids.set(layer, id);
                this._loaded.set(id, layer);
            }
            return id;
        }

        indexOf(id) {
            return id ? this.layers().findIndex(layer => this.idOf(layer) === id) : -1;
        }

        /** How many layers the map has; an entry of the list that is no layer is not one. */
        count() {
            let count = 0;
            for (const layer of this.layers()) if (isLayer(layer)) count++;
            return count;
        }

        layer(id) {
            return this.layers()[this.indexOf(id)] || null;
        }

        isHidden(layer) { return this.hidden.has(this.idOf(layer)); }
        setHidden(id, hidden) { if (hidden) this.hidden.add(id); else this.hidden.delete(id); }
        /**
         * The value of the versions variable the author is looking at: 0 is the picture at the start of play,
         * null the layer's own picture where 0 has a row of its own (see lookChoices).
         */
        lookAt(layer) { const id = this.idOf(layer); return this.looking.has(id) ? this.looking.get(id) : 0; }
        setLookAt(id, value) {
            const n = value === null ? null : Math.trunc(Number(value) || 0);
            if (n === 0) this.looking.delete(id); else this.looking.set(id, n);
        }

        _write(list) {
            if (list && list.length) this.map.rrImageLayers = list;
            else if (this._emptyForm) this.map.rrImageLayers = this._emptyForm;
            else delete this.map.rrImageLayers;
        }

        /**
         * Put a new list on the map as one step; a drag (`gesture`) is one step from its first change to its
         * last. A list that would save as the one already there is no step, and the map keeps the objects it
         * has; a drag that comes back to where it began takes its step away, so no step is left that undoes nothing.
         */
        _commit(list, gesture = null) {
            if (!this.map) return false;
            const stored = this.map.rrImageLayers;
            if (gesture && this._gesture === gesture && this.undoStack.length) {
                const began = this.undoStack[this.undoStack.length - 1].layers;
                if (!sameStored(list, began)) { this._write(list); return true; }
                this.undoStack.pop();
                this._gesture = null;
                if (began === undefined) delete this.map.rrImageLayers; else this.map.rrImageLayers = began;
                return true;
            }
            if (sameStored(list, stored)) return false;
            this.undoStack.push({ layers: stored });
            if (this.undoStack.length > 100) this.undoStack.shift();
            this.redoStack.length = 0;
            this._gesture = gesture;
            this._write(list);
            return true;
        }

        /** The drag is over: the next change is a step of its own. With a name, only the drag of that name is ended. */
        endGesture(name = null) { if (!name || this._gesture === name) this._gesture = null; }

        add(layer) {
            const id = this.idOf(layer);
            this._loaded.delete(id);
            return this._commit(add(this.layers(), layer)) ? id : 0;
        }

        change(id, patch, gesture = null) {
            const index = this.indexOf(id);
            if (index < 0) return false;
            const list = change(this.layers(), index, patch, this._loaded.get(id) || null);
            this._ids.set(list[index], id);
            return this._commit(list, gesture);
        }

        remove(id) {
            const index = this.indexOf(id);
            return index >= 0 && this._commit(remove(this.layers(), index));
        }

        canMove(id, direction) { return canMove(this.layers(), this.indexOf(id), direction); }
        move(id, direction) {
            const layers = this.layers(), list = move(layers, this.indexOf(id), direction);
            return list !== layers && this._commit(list);
        }

        canUndo() { return this.undoStack.length > 0; }
        canRedo() { return this.redoStack.length > 0; }
        undo() { return this._step(this.undoStack, this.redoStack); }
        redo() { return this._step(this.redoStack, this.undoStack); }

        _step(from, to) {
            if (!this.map || !from.length) return false;
            this._gesture = null;
            to.push({ layers: this.map.rrImageLayers });
            const entry = from.pop();
            if (entry.layers === undefined) delete this.map.rrImageLayers;
            else this.map.rrImageLayers = entry.layers;
            if (this.onStep) this.onStep();
            return true;
        }
    }

    // The stored list as it is, for scripts and tests: nothing is rewritten on the way through.
    let held = [];
    function load(layers) { held = Array.isArray(layers) ? layers.filter(Boolean) : []; }
    function read() { return held.slice(); }

    const api = {
        CHOICES, choices, make, rows, fitAllowed, describe, depthNote, depthLabel, fitLabel, fitHint, fitWords, fitBlocked, blendLabel, opLabel,
        repeatsLabel, repeatLabel, repeatHint, scrollHint,
        namesFrom, conditionWords, note3D, rowLines, sizeNote,
        versionsIntro, versionRows, versionParts, versionWords, versionsRest, versionValue, nextValue, setVersion, removeVersion, moveVersion,
        numberedPattern, matching, importWords, found, listed, lookChoices,
        order, neighbor, canMove, move, change, add, remove, Session, load, read, fill, ltr, own, plain, isLayer
    };
    root.RRMapImageLayers = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
