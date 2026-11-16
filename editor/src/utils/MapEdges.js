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
        { id: 'cliffs', label: 'Cliffs', icon: '<path d="M2 18h4l1-11h3l1 4h3l1-6h3l1 13h3"/>' },
        { id: 'plateau', label: 'Plateau', icon: '<path d="M2 8h9v9h11"/>' },
        { id: 'void', label: 'Floating island', icon: '<path d="M4 9h16l-3 5-5 5-5-5z"/>' }
    ];
    const SIDES = ['north', 'east', 'south', 'west'];
    const SIDE_LABEL = { north: 'North', east: 'East', south: 'South', west: 'West' };
    const OPPOSITE = { north: 'south', east: 'west', south: 'north', west: 'east' };
    // The maps over and under this one (`surround.levels`): not sides of the border, so not in SIDES.
    const LEVELS = ['above', 'below'];
    const LEVEL_LABEL = { above: 'Above', below: 'Below' };
    const LEVEL_OPPOSITE = { above: 'below', below: 'above' };
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
        STYLES, SIDES, SIDE_LABEL, NUMBERS, OPPOSITE, LEVELS, LEVEL_LABEL, LEVEL_OPPOSITE,
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
            if (normal.levels && Object.keys(normal.levels).length) out.levels = normal.levels;
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
            // The map over and the map under (`{ map, x, y, gap }`), null where there is none.
            view.levels = {};
            for (const side of LEVELS) { const n = kept && kept.levels && kept.levels[side]; view.levels[side] = n ? { map: n.map, x: n.x || 0, y: n.y || 0, gap: n.gap, lining: n.lining || 'walls', openings: (n.openings || []).map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h })) } : null; }
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
                rough: island || sides.some(style => style === 'continue' || style === 'mountains' || style === 'cliffs' || style === 'plateau'),
                seed: any,
                level: !island && sides.includes('ocean'),
                height: !island && (sides.includes('mountains') || sides.includes('cliffs')),
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
                else if (key === 'levels') {
                    raw.levels = Object.assign({}, raw.levels);
                    for (const side of LEVELS) if (side in (value || {})) {
                        const entry = value[side];
                        // (`lining`: what the openings' sides wear; the room's walls are the usual one and are not written.)
                        if (entry && Number(entry.map) > 0) raw.levels[side] = { map: Number(entry.map), x: Number(entry.x) || 0, y: Number(entry.y) || 0, gap: Number(entry.gap) || undefined, lining: entry.lining && entry.lining !== 'walls' ? entry.lining : undefined, openings: Array.isArray(entry.openings) ? entry.openings : undefined };
                        else delete raw.levels[side];
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
        //---------------------------------------------------------------------
        // Where an opening comes out
        //
        // The two maps are placed by `x`, `y`: the tile of this map the other map's first tile lies under. That is
        // hard to think in ("Down 23" was read as "lands on row 23", owner, 2026-11-13), so the panel asks the
        // other way round: which tile of the other map the first opening comes out at. These turn one into the other.

        /** The tile of the other map a level's first opening comes out at; null with no opening. */
        landing(level) {
            const o = level && level.openings && level.openings[0];
            return o ? { x: o.x - (level.x || 0), y: o.y - (level.y || 0) } : null;
        },

        /** `land` held inside the other map, so that the whole opening comes out in it (`size`: `{ width, height }`, or none known). */
        heldLanding(land, opening, size) {
            if (!size || !(size.width > 0) || !(size.height > 0)) return { x: Math.round(land.x), y: Math.round(land.y) };
            const most = (span, part) => Math.max(0, span - Math.max(1, part || 1));
            return { x: Math.max(0, Math.min(most(size.width, opening && opening.w), Math.round(land.x))), y: Math.max(0, Math.min(most(size.height, opening && opening.h), Math.round(land.y))) };
        },

        /** The level placed so that its first opening comes out at `land` of the other map. */
        withLanding(level, land, size) {
            const o = level && level.openings && level.openings[0];
            if (!o) return level;
            const held = this.heldLanding(land, o, size);
            return Object.assign({}, level, { x: o.x - held.x, y: o.y - held.y });
        },

        /**
         * A number of an opening changed. Moving the first opening keeps where it comes out (the other map moves
         * with it); the others are places on this map and move alone.
         */
        withOpening(level, index, key, value, size) {
            const openings = level.openings.map(o => Object.assign({}, o)), o = openings[index];
            if (!o) return level;
            const land = this.landing(level);
            o[key] = value;
            const next = Object.assign({}, level, { openings });
            return index === 0 && land ? this.withLanding(next, land, size) : next;
        },

        /** An opening added at `at`. The first one comes out in the middle of the other map until said otherwise. */
        withNewOpening(level, at, size) {
            const openings = level.openings.map(o => Object.assign({}, o));
            openings.push({ x: at.x, y: at.y, w: 1, h: 1 });
            const next = Object.assign({}, level, { openings });
            if (openings.length > 1) return next;
            return this.withLanding(next, size && size.width > 0 ? { x: Math.floor(size.width / 2), y: Math.floor(size.height / 2) } : { x: at.x - (level.x || 0), y: at.y - (level.y || 0) }, size);
        },

        linkBack(fs, path, projectPath, mapData, write) {
            const linked = [];
            const mine = R()?.neighborsOf ? R().neighborsOf(mapData) : {};
            const id = Number(mapData && mapData.id);
            if (!fs || !path || !projectPath || !(id > 0)) return linked;
            const stringify = sidecar => (root.RRMapElevation && root.RRMapElevation.stringifySidecar ? root.RRMapElevation.stringifySidecar(sidecar) : JSON.stringify(sidecar));
            // The map over or under gets this one under or over it, the same distance apart and the same tiles matched.
            const levels = R()?.levelsOf ? R().levelsOf(mapData) : {};
            for (const side of LEVELS) {
                const level = levels[side];
                if (!level || level.map === id) continue;
                const stem = path.join(projectPath, 'data', 'Map' + String(level.map).padStart(3, '0'));
                if (!fs.existsSync(stem + '.json')) continue;
                const filePath = stem + '.r3d.json';
                let sidecar = { version: 1 };
                try {
                    if (fs.existsSync(filePath)) sidecar = (root.RRJson ? root.RRJson.parse(fs.readFileSync(filePath)) : JSON.parse(fs.readFileSync(filePath, 'utf8')));
                } catch (error) { continue; }
                if (!sidecar || typeof sidecar !== 'object' || Array.isArray(sidecar)) continue;
                const theirs = R().normalizeLevels(sidecar.surround && sidecar.surround.levels), back = LEVEL_OPPOSITE[side];
                // A map there that is another map's is left alone; this map's own entry there is kept in step (the gap, the place, the openings).
                if (theirs[back] && theirs[back].map !== id) continue;
                const surround = sidecar.surround && typeof sidecar.surround === 'object' ? sidecar.surround : { style: 'none' };
                const entry = { map: id, gap: level.gap };
                if (level.x) entry.x = -level.x;
                if (level.y) entry.y = -level.y;
                // The same openings, in the other map's own tiles.
                if (level.openings) entry.openings = level.openings.map(o => ({ x: o.x - (level.x || 0), y: o.y - (level.y || 0), w: o.w, h: o.h }));
                if (level.lining) entry.lining = level.lining;
                if (theirs[back] && JSON.stringify(R().normalizeLevels({ [back]: entry })[back]) === JSON.stringify(theirs[back])) continue;
                surround.levels = Object.assign({}, theirs, { [back]: entry });
                sidecar.surround = surround;
                try {
                    const text = stringify(sidecar);
                    if (typeof write === 'function') write(filePath, text); else fs.writeFileSync(filePath, text, 'utf8');
                    linked.push(level.map);
                } catch (error) { console.warn('Map above or below:', error); }
            }
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
