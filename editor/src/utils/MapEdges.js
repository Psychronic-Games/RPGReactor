/**
 * MapEdges - what lies past a map's border.
 *
 * The Terrain tools' "Beyond the Border" (BuildHotbar) gets its form logic from
 * here: the styles and their pictures, the map's surroundings as the panel
 * shows them (`read`, `shown`), which settings the chosen styles use (`uses`),
 * how far this computer shows the land (`reach`), the `surround` a change
 * leaves stored (`patch`), and the land laid again in the 3D view once a frame
 * (`lay`). The map view's Surroundings tick is here too, and the maps past the
 * border (`neighbors` in the same `surround`): the way back a save writes into
 * a neighbor that has none (`linkBack`).
 *
 * The data rules are the runtime's own (Reactor3D.normalizeSurround:
 * runtime/reactor_3d_surround.js).
 */
(function(root) {
    'use strict';

    const STYLES = [
        { id: 'none', label: 'Nothing', icon: '<path d="M3 15h18" stroke-dasharray="2 3"/>' },
        { id: 'continue', label: 'Land', icon: '<path d="M2 16c3-5 5-5 8-1s5 2 7-2 3-2 5 1"/>' },
        { id: 'ocean', label: 'Ocean', icon: '<path d="M2 10c4 0 5 6 9 6"/><path d="M11 14c2-2 3 0 5-1s3-1 6 0M12 18c2-2 3 0 5-1s3-1 5 0"/>' },
        { id: 'mountains', label: 'Mountains', icon: '<path d="M2 18l6-10 4 6 3-4 7 8z"/>' },
        { id: 'plateau', label: 'Plateau', icon: '<path d="M2 8h9v9h11"/>' },
        { id: 'void', label: 'Floating island', icon: '<path d="M4 9h16l-3 5-5 5-5-5z"/>' }
    ];
    const SIDES = ['north', 'east', 'south', 'west'];
    const SIDE_LABEL = { north: 'North', east: 'East', south: 'South', west: 'West' };
    const OPPOSITE = { north: 'south', east: 'west', south: 'north', west: 'east' };
    /** The numbers under Advanced: the key in `surround`, the label, the range, and the use (see `uses`) that shows the field. */
    const NUMBERS = [
        { key: 'seed', label: 'Seed', min: 0, max: 99999, step: 1, use: 'seed' },
        { key: 'level', label: 'Sea Level', min: -200, max: 200, step: 0.5, use: 'level' },
        { key: 'height', label: 'Mountain Height', min: 4, max: 160, step: 1, use: 'height' },
        { key: 'drop', label: 'Drop', min: 4, max: 200, step: 1, use: 'drop' },
        { key: 'haze', label: 'Far Haze', min: 0, max: 1, step: 0.1, use: 'haze' }
    ];
    const R = () => root.Reactor3D;
    const blank = value => value === null || value === undefined || value === '';

    const api = {
        STYLES, SIDES, SIDE_LABEL, NUMBERS, OPPOSITE,
        /** The animation frame the land waits for; 0 when none does. */
        _layFrame: 0,
        /** The view and the map the waiting frame lays. */
        _layFor: null,

        /** A style's picture. */
        icon(id, width = 30, height = 24) {
            const style = STYLES.find(s => s.id === id) || STYLES[0];
            return `<svg viewBox="0 0 24 24" width="${width}" height="${height}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${style.icon}</svg>`;
        },

        //---------------------------------------------------------------------
        // The form: what the panel shows, and what a change stores

        /** A `surround` as it is stored: checked by the runtime's rules, only what was said kept; null when nothing lies past the border. */
        stored(raw) {
            const normal = R()?.normalizeSurround ? R().normalizeSurround(raw) : null;
            if (!normal) return null;
            const out = { style: normal.style };
            if (Object.keys(normal.edges).length) out.edges = normal.edges;
            if (normal.distance !== null) out.distance = normal.distance;
            const D = R().SURROUND_DEFAULTS;
            for (const key of ['rough', 'seed', 'height', 'drop', 'haze']) if (normal[key] !== D[key]) out[key] = normal[key];
            if (normal.level !== null) out.level = normal.level;
            if (normal.water) out.water = normal.water;
            if (normal.neighbors && Object.keys(normal.neighbors).length) out.neighbors = normal.neighbors;
            return out;
        },

        /**
         * A map's surroundings as the panel shows them: the style past every side, each side's own
         * (`''` is the map's), and every number, null where the map does not say (Automatic, or the default).
         */
        read(mapData) {
            const raw = (mapData && mapData.reactor3d && mapData.reactor3d.surround) || null;
            const kept = this.stored(raw);
            const D = R()?.SURROUND_DEFAULTS || { rough: 0.5 };
            const view = { style: kept ? kept.style : 'none', edges: {}, distance: kept && kept.distance !== undefined ? kept.distance : null, rough: kept && kept.rough !== undefined ? kept.rough : D.rough };
            for (const side of SIDES) view.edges[side] = (kept && kept.edges && kept.edges[side]) || '';
            for (const field of NUMBERS) view[field.key] = kept && kept[field.key] !== undefined ? kept[field.key] : null;
            // The map past each side (`{ map, shift }`), null where the border is the world's end.
            view.neighbors = {};
            for (const side of SIDES) { const n = kept && kept.neighbors && kept.neighbors[side]; view.neighbors[side] = n ? { map: n.map, shift: n.shift || 0 } : null; }
            return view;
        },

        /** The number an Advanced field shows: what the map says, else the default in use ('' for a sea level left Automatic). */
        shown(view, field) {
            const said = view ? view[field.key] : null;
            if (!blank(said)) return said;
            const D = R()?.SURROUND_DEFAULTS || {};
            return field.key in D ? D[field.key] : '';
        },

        /**
         * How far the land reaches on this computer, in tiles: the slider's ends (`min`, `max`), what Automatic
         * picks (`auto`) and the most that is shown (`shown`: weak graphics stop short of the slider's far end).
         */
        reach() {
            const range = R()?.SURROUND_DISTANCE || { full: 160, weak: 96, min: 24, max: 320 };
            const weak = !!(R()?.isWeakGpu && R().isWeakGpu());
            return { min: range.min, max: range.max, auto: weak ? range.weak : range.full, shown: weak ? Math.max(range.weak, range.min) : range.max };
        },

        /** Which settings the styles in `view` read: a setting none of them reads does nothing. */
        uses(view) {
            const island = view.style === 'void';
            const sides = SIDES.map(side => (!island && view.edges[side]) || view.style);
            const any = sides.some(style => style !== 'none');
            return {
                sides: !island,
                distance: any && !island,
                rough: island || sides.some(style => style === 'continue' || style === 'mountains' || style === 'plateau'),
                seed: any,
                level: !island && sides.includes('ocean'),
                height: !island && sides.includes('mountains'),
                drop: island || sides.includes('plateau'),
                haze: any && !island
            };
        },

        /**
         * What is stored after one change to a map's `surround`: `change` names what was set
         * (`style`, `edges: { side: style }`, `neighbors: { side: { map, shift } }` (no map: the side
         * has none), `distance`, `rough`, a number of NUMBERS); a number set to null or '' is no longer
         * said (Automatic, or the default). Null when nothing is left past the border.
         */
        patch(current, change) {
            const raw = Object.assign({}, current && typeof current === 'object' ? current : { style: 'none' });
            raw.edges = Object.assign({}, raw.edges);
            const numbers = ['distance', 'rough'].concat(NUMBERS.map(field => field.key));
            for (const [key, value] of Object.entries(change || {})) {
                if (key === 'edges') { for (const side of SIDES) if (side in (value || {})) { if (value[side]) raw.edges[side] = value[side]; else delete raw.edges[side]; } }
                else if (key === 'neighbors') {
                    raw.neighbors = Object.assign({}, raw.neighbors);
                    for (const side of SIDES) if (side in (value || {})) {
                        const entry = value[side];
                        if (entry && Number(entry.map) > 0) raw.neighbors[side] = { map: Number(entry.map), shift: Number(entry.shift) || 0 };
                        else delete raw.neighbors[side];
                    }
                }
                else if (key === 'style') raw.style = value;
                else if (!numbers.includes(key)) continue;
                else if (blank(value) || !Number.isFinite(Number(value))) delete raw[key];
                else raw[key] = Number(value);
            }
            return this.stored(raw);
        },

        //---------------------------------------------------------------------
        // The maps past the border

        /**
         * The way back, written as a map is saved: each neighbor whose facing side names no map gets this
         * map there, so a border crossed one way is crossed back the other. A neighbor that already names
         * a map there, this map itself, or a neighbor whose file cannot be read is left alone. `write`
         * (filePath, text) writes a file. Answers the ids of the maps written.
         */
        linkBack(fs, path, projectPath, mapData, write) {
            const linked = [];
            const mine = R()?.neighborsOf ? R().neighborsOf(mapData) : {};
            const id = Number(mapData && mapData.id);
            if (!fs || !path || !projectPath || !(id > 0)) return linked;
            const stringify = sidecar => (root.RRMapElevation && root.RRMapElevation.stringifySidecar ? root.RRMapElevation.stringifySidecar(sidecar) : JSON.stringify(sidecar));
            for (const side of SIDES) {
                const neighbor = mine[side];
                if (!neighbor || neighbor.map === id) continue;
                const stem = path.join(projectPath, 'data', 'Map' + String(neighbor.map).padStart(3, '0'));
                if (!fs.existsSync(stem + '.json')) continue;
                const filePath = stem + '.r3d.json';
                let sidecar = { version: 1 };
                try {
                    if (fs.existsSync(filePath)) sidecar = (root.RRJson ? root.RRJson.parse(fs.readFileSync(filePath)) : JSON.parse(fs.readFileSync(filePath, 'utf8')));
                } catch (error) { continue; }
                if (!sidecar || typeof sidecar !== 'object' || Array.isArray(sidecar)) continue;
                const theirs = R().normalizeNeighbors(sidecar.surround && sidecar.surround.neighbors), back = OPPOSITE[side];
                if (theirs[back]) continue;
                const surround = sidecar.surround && typeof sidecar.surround === 'object' ? sidecar.surround : { style: 'none' };
                surround.neighbors = Object.assign({}, theirs, { [back]: neighbor.shift ? { map: id, shift: -neighbor.shift } : { map: id } });
                sidecar.surround = surround;
                try {
                    const text = stringify(sidecar);
                    if (typeof write === 'function') write(filePath, text); else fs.writeFileSync(filePath, text, 'utf8');
                    linked.push(neighbor.map);
                } catch (error) { console.warn('Neighboring map:', error); }
            }
            return linked;
        },

        //---------------------------------------------------------------------
        // The 3D view

        /**
         * The land past the border laid again from the map as it stands: once a frame, however
         * fast a slider is dragged, and by the view's own next draw.
         */
        lay(editor, map) {
            this._layFor = { editor, map };
            if (this._layFrame) return;
            const run = () => {
                this._layFrame = 0;
                const waiting = this._layFor;
                this._layFor = null;
                // Another map came up since: its scene lays its own land.
                if (!waiting || !waiting.map || (waiting.editor?.currentMap && waiting.editor.currentMap() !== waiting.map)) return;
                this.redraw3D(waiting.editor, waiting.map);
            };
            if (typeof requestAnimationFrame === 'function') this._layFrame = requestAnimationFrame(run);
            else run();
        },

        /** A lay still waiting for its frame is dropped (another map came up). */
        drop() {
            if (this._layFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this._layFrame);
            this._layFrame = 0;
            this._layFor = null;
        },

        /**
         * The land laid again; the view draws it on its next frame. The maps past the border follow the change
         * first (RRMapNeighborView): one that was moved or taken away has laid this map's land itself.
         */
        redraw3D(editor, map) {
            const scene = editor?.mapScene;
            if (!editor?.enabled || !scene?.addSurround) return;
            try {
                if (!root.RRMapNeighborView?.sync(editor)) scene.addSurround(editor.currentMap?.() || map);
            } catch (error) { console.warn('Surroundings:', error); }
            editor.requestRender?.();
        },

        /** The toolbar's tick, for a scene built before or after it was set. */
        syncView(editor) {
            const box = document.getElementById('map-surround-view');
            if (!box || !R() || !editor?.mapScene) return;
            R().SURROUND_VISIBLE = box.checked;
            editor.mapScene.setSurroundVisible?.(box.checked);
        },

        /** Whether the 3D view shows the land past the border (the toolbar's tick). */
        visible() { return !R() || R().SURROUND_VISIBLE !== false; },

        /** The toolbar's tick: the surroundings shown in the 3D view, or left out for work at the border. The tick and whoever listens follow. */
        setVisible(visible) {
            const editor = root.reactor?.mapEditor3D;
            if (R()) R().SURROUND_VISIBLE = !!visible;
            editor?.mapScene?.setSurroundVisible?.(!!visible);
            // The maps past the border show and hide with the land.
            if (editor) root.RRMapNeighborView?.setVisible(editor, !!visible);
            if (editor) { editor._lastActiveAt = performance.now(); editor.render?.(performance.now()); }
            try { root.localStorage?.setItem('rr.surroundView', visible ? '1' : '0'); } catch (error) { /* a preference only */ }
            if (typeof document === 'undefined') return;
            const box = document.getElementById('map-surround-view');
            if (box && box.checked !== !!visible) box.checked = !!visible;
            if (typeof CustomEvent === 'function' && document.dispatchEvent) document.dispatchEvent(new CustomEvent('rr-surround-view', { detail: { visible: !!visible } }));
        },

        init() {
            const box = document.getElementById('map-surround-view');
            if (!box || box._rrBound) return;
            box._rrBound = true;
            let shown = true;
            try { shown = root.localStorage?.getItem('rr.surroundView') !== '0'; } catch (error) { shown = true; }
            box.checked = shown;
            if (R()) R().SURROUND_VISIBLE = shown;
            box.addEventListener('change', () => this.setVisible(box.checked));
        }
    };

    root.RRMapEdges = api;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => api.init());
        else api.init();
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
