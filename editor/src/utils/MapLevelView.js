/**
 * MapLevelView - the map over or under a map, and the openings between them, in the map views.
 *
 * A map names the map above and below it in its `surround.levels` (RRMapEdges), each with the
 * openings through which the party passes and sees (Reactor3D.Levels, runtime/
 * reactor_3d_surround.js). The 3D map view shows what the game shows, by the same steps: the
 * other map's world stands under (or over) the one being edited, read from the project's files
 * as last saved, and the ground is not drawn inside an opening. The map above is shown only
 * around its openings (`OVER_MARGIN` tiles), not as a lid over the whole map. Each opening is
 * outlined, with a shaft to where it comes out in the other map.
 *
 * The 2D map view outlines each opening and names the map it leads to.
 *
 * It is scenery: nothing here is picked or writes a file. The Surroundings tick hides the other
 * map's world; the outlines stay.
 */
(function(root) {
    'use strict';

    const SIDES = ['below', 'above'];
    const R = () => root.Reactor3D;
    const frame = fn => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 0));

    const api = {
        SIDES,
        /** The outlines' colors: the way down, the way up. */
        COLORS: { below: 0x58b4ff, above: 0xffd84a },
        /** Tiles of the map above shown around each of its openings. */
        OVER_MARGIN: 3,
        /** How far under its own height the map above is cut to that margin. */
        OVER_UNDER: 2,

        //---------------------------------------------------------------------
        // The rules

        /** The levels of a map that have openings: `{ below?, above? }`, each Reactor3D.normalizeLevels'. */
        open(mapData) {
            const E = R(), levels = E && E.levelsOf ? E.levelsOf(mapData) : {}, out = {};
            for (const side of SIDES) if (levels[side] && levels[side].openings && levels[side].openings.length) out[side] = levels[side];
            return out;
        },

        /** What a level's world is built from: another string when its map, its place or its files change. */
        keyOf(level, stamp, rise) {
            return `${level.map}:${level.x || 0}:${level.y || 0}:${rise}|${stamp}`;
        },

        /**
         * The lines of an opening's mark, as pairs of points `[x, y, z, …]`: its outline at `ground`, the same
         * `rise` away (where it comes out in the other map) and the four corners between.
         */
        lines(opening, ground, rise) {
            const x0 = opening.x, z0 = opening.y, x1 = x0 + opening.w, z1 = z0 + opening.h, out = [];
            const corners = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
            for (const y of [ground, ground + rise]) {
                for (let i = 0; i < 4; i++) { const a = corners[i], b = corners[(i + 1) % 4]; out.push(a[0], y, a[1], b[0], y, b[1]); }
            }
            for (const c of corners) out.push(c[0], ground, c[1], c[0], ground + rise, c[1]);
            return out;
        },

        /** The height above which the map over this one is shown only around its openings. */
        cropAt(mapData, level, other) {
            const E = R(), rise = E.levelRise(mapData, 'above', level, other), base = other && level.openings && level.openings.length ? E.levelBase(other, 'above', level) : 0;
            return Math.max((rise === null ? E.levelTop(mapData) : rise + base) - this.OVER_UNDER, E.levelTop(mapData) - 0.05);
        },

        /** The highest ground of a map within an opening (its own ground: an opening has none in the game). */
        groundIn(mapData, opening) {
            const E = R();
            let high = -Infinity;
            for (let cz = 0; cz <= opening.h; cz++) for (let cx = 0; cx <= opening.w; cx++) {
                const x = Math.min(opening.x + cx, opening.x + opening.w - 0.001), z = Math.min(opening.y + cz, opening.y + opening.h - 0.001);
                const g = E.ownGroundAt(mapData, x, z);
                if (g > high) high = g;
            }
            return Number.isFinite(high) ? high : 0;
        },

        //---------------------------------------------------------------------
        // The 3D view

        state(editor) {
            return editor._levelView || (editor._levelView = { frame: 0, marks: null, marksKey: '' });
        },

        shown() { return !root.RRMapEdges || root.RRMapEdges.visible(); },

        /**
         * Bring the worlds over and under the map in line with it as it stands: one the map no longer names or
         * opens onto goes, one whose map, place or files changed is built again, one kept from the scene before
         * stands in this one. A world is built on a later frame (`building`: this is that frame) and laid a part
         * a frame after. The openings are cut and outlined at once.
         */
        sync(editor, building = false) {
            const E = R(), L = E && E.Levels, N = E && E.Neighbors, view = root.RRMapNeighborView;
            const scene = editor && editor.mapScene, map = editor && editor.currentMap && editor.currentMap();
            if (!L || !N || !view || !editor.enabled || !scene || !scene._scene || !map) return;
            view.own(editor, map);
            const cut = L.cutUniforms(), open = this.open(map), shown = this.shown(), bodies = L.bodies || (L.bodies = {});
            cut.rrLvlCount.value = 0;
            cut.rrLvlOver.value[0] = L.NO_CROP;
            cut.rrLvlTop.value = -1e9;
            let again = false, changed = false;
            const rises = {};
            for (const side of SIDES) {
                const level = open[side] || null, record = level ? view.record(editor, level.map) : null;
                const ready = !!record && record.state === 'ready';
                let body = bodies[side] || null;
                const rise = level && ready ? E.levelRise(map, side, level, record.map) : null;
                // Where the opening comes out, in this map's heights: the floor of the map under, the ground of the map over.
                if (rise !== null) rises[side] = side === 'below' ? -rise : rise + E.levelBase(record.map, side, level);
                const key = level && ready ? this.keyOf(level, record.stamp, rise) : '';
                // (A map being read again keeps the world that stands until it is read.)
                if (body && (!level || !record || record.state === 'failed' || (ready && body.viewKey !== key))) { this.leave(editor, side); body = null; changed = true; }
                if (!level || !record || record.state === 'failed') continue;
                if (!ready) { again = true; continue; }
                if (!body && shown) {
                    if (!building) { again = true; continue; }
                    body = L.add(scene, map, side, level, record, record.bitmaps, record.host);
                    if (!body) continue;
                    body.viewKey = key;
                    changed = true;
                    again = true;
                } else if (body && body.stage && shown) {
                    if (building) { try { N.stage(body); } catch (error) { body.stage = 0; } changed = true; }
                    again = again || !!body.stage;
                }
                if (body) {
                    // Kept from the scene before: into this one.
                    if (body.group.parent !== scene._scene) { scene._scene.add(body.group); body.group.updateMatrixWorld(true); changed = true; }
                    body.group.visible = shown;
                    if (body.scene._sky) body.scene._sky.visible = false;
                }
                // The ground is open where the other map is there to be seen.
                if (body && shown) {
                    L.cutFor(cut, map, side, level, record.map);
                    if (side === 'below') L.under(cut, body, record.map);
                    if (side === 'above') { cut.rrLvlOver.value[0] = this.cropAt(map, level, record.map); cut.rrLvlOver.value[1] = this.OVER_MARGIN; }
                }
            }
            if (this.mark(editor, scene, map, open, rises)) changed = true;
            if (again) this.soon(editor);
            if (changed) editor.requestRender?.();
        },

        /** The outlines of the openings, made again when the openings or the scene change. True when they were. */
        mark(editor, scene, map, open, rises) {
            const state = this.state(editor), parts = [];
            for (const side of SIDES) {
                const level = open[side];
                if (!level) continue;
                // (Until the map under is read, how far down it lies is not known: the outline alone.)
                const far = rises && Number.isFinite(rises[side]) ? rises[side] : null;
                for (const o of level.openings) { const ground = this.groundIn(map, o) + 0.06; parts.push({ side, o, ground, rise: far === null ? 0 : far - ground }); }
            }
            const key = JSON.stringify(parts);
            if (state.marks && state.marksKey === key && state.marks.parent === scene._scene) return false;
            this.unmark(editor);
            state.marksKey = key;
            if (!parts.length || typeof THREE === 'undefined') return true;
            const group = new THREE.Group();
            group.name = 'level-marks';
            for (const side of SIDES) {
                const points = [];
                for (const part of parts) if (part.side === side) points.push(...this.lines(part.o, part.ground, part.rise));
                if (!points.length) continue;
                const geometry = new THREE.BufferGeometry();
                geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
                const lines = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: this.COLORS[side], transparent: true, opacity: 0.9, depthTest: false, depthWrite: false }));
                lines.renderOrder = 9990;
                lines.frustumCulled = false;
                group.add(lines);
            }
            scene._scene.add(group);
            state.marks = group;
            return true;
        },

        unmark(editor) {
            const state = this.state(editor), group = state.marks;
            state.marks = null;
            state.marksKey = '';
            if (!group) return;
            group.parent?.remove(group);
            for (const child of group.children) { child.geometry?.dispose?.(); child.material?.dispose?.(); }
        },

        /** A world is let go. */
        leave(editor, side) {
            const L = R()?.Levels;
            if (L) L.remove(side);
        },

        /** The scene is about to be destroyed: the worlds leave it whole, to stand in the next one; the outlines go. */
        hold(editor) {
            const L = R()?.Levels, bodies = L && L.bodies;
            if (bodies) for (const side of Object.keys(bodies)) bodies[side].group.parent?.remove(bodies[side].group);
            this.unmark(editor);
        },

        /** Every world is let go and nothing is cut (the view closes, or shows another map). */
        dispose(editor) {
            const L = R()?.Levels;
            if (L) {
                L.drop();
                const cut = L.cutUniforms();
                cut.rrLvlCount.value = 0;
                cut.rrLvlOver.value[0] = L.NO_CROP;
                cut.rrLvlTop.value = -1e9;
            }
            if (editor) this.unmark(editor);
        },

        /** The frame after next: what is still to read, build or lay is worked on then, once the view has drawn. */
        soon(editor) {
            const state = this.state(editor);
            if (state.frame) return;
            state.frame = frame(() => {
                state.frame = frame(() => {
                    state.frame = 0;
                    try { this.sync(editor, true); } catch (error) { console.warn('Maps above and below:', error); }
                });
            });
        },

        /** The Surroundings tick. */
        setVisible(editor) {
            if (editor?.mapScene) { try { this.sync(editor); } catch (error) { console.warn('Maps above and below:', error); } }
        },

        /** A pass that clears depth and draws over the frame leaves the worlds and the outlines out; `on` puts them back. */
        pass(editor, on) {
            const L = R()?.Levels, bodies = L && L.bodies, visible = !!on && this.shown(), marks = editor._levelView && editor._levelView.marks;
            if (bodies) for (const side in bodies) bodies[side].group.visible = visible;
            if (marks) marks.visible = !!on;
        },

        //---------------------------------------------------------------------
        // The 2D view

        /** What an opening is called in the 2D view: an arrow and the map it leads to. */
        label(side, level, infos) {
            const info = Array.isArray(infos) ? infos.find(entry => entry && entry.id === level.map) : null, name = info && info.name ? ': ' + info.name : '';
            return (side === 'below' ? '▼ ' : '▲ ') + String(level.map).padStart(3, '0') + name;
        },

        /** The openings of the map outlined over its tiles, each named; drawn again when they change. */
        sync2D(tm) {
            if (!tm || tm.destroyed || !tm.container || typeof PIXI === 'undefined') return;
            const state = tm._levelMarks || (tm._levelMarks = { layer: null, key: '' });
            const map = tm.currentMap, open = map && !map.rrWorkshop ? this.open2D(map) : {};
            const infos = tm.databaseManager?.getMapInfos?.() || null;
            const parts = [];
            for (const side of SIDES) if (open[side]) for (const o of open[side].openings) parts.push({ side, o, text: this.label(side, open[side], infos) });
            const key = JSON.stringify(parts) + '|' + tm.TILE_WIDTH + 'x' + tm.TILE_HEIGHT;
            const alive = state.layer && !state.layer.destroyed;
            if (alive && state.key === key && state.layer.parent === tm.container) return;
            if (alive) this.unlayer(state.layer);
            state.layer = null;
            state.key = key;
            if (!parts.length) { tm.requestRender?.(); return; }
            const layer = state.layer = new PIXI.Container();
            layer.label = 'Openings above and below';
            layer.eventMode = 'none';
            layer.interactiveChildren = false;
            const tw = tm.TILE_WIDTH, th = tm.TILE_HEIGHT;
            for (const part of parts) {
                const color = this.COLORS[part.side], o = part.o, box = new PIXI.Graphics();
                box.rect(o.x * tw, o.y * th, o.w * tw, o.h * th);
                box.fill({ color, alpha: 0.16 });
                box.stroke({ width: Math.max(2, Math.round(tw * 0.08)), color, alpha: 0.95 });
                layer.addChild(box);
                const label = this.labelSprite(part.text, Math.max(10, Math.round(th * 0.36)));
                if (!label) continue;
                label.x = o.x * tw + 2;
                label.y = o.y * th - label.height - 1;
                if (label.y < 0) label.y = (o.y + o.h) * th + 1;
                layer.addChild(label);
            }
            tm.container.addChild(layer);
            tm.requestRender?.();
        },

        /**
         * The outlines' layer is let go: each label's own picture with it, and nothing else (a shape's fill is the
         * view's shared white picture, which is not this layer's to destroy).
         */
        unlayer(layer) {
            layer.parent?.removeChild(layer);
            for (const child of layer.children.slice()) {
                if (!child.rrLabel) continue;
                layer.removeChild(child);
                child.destroy({ texture: true, textureSource: true });
            }
            layer.destroy({ children: true });
        },

        /** A label as a picture of its own (drawn once on a canvas: white on a dark outline). */
        labelSprite(words, size) {
            if (typeof document === 'undefined') return null;
            const canvas = document.createElement('canvas'), font = `600 ${size}px sans-serif`;
            let ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.font = font;
            canvas.width = Math.max(4, Math.ceil(ctx.measureText(words).width) + 8);
            canvas.height = Math.ceil(size * 1.4) + 4;
            ctx = canvas.getContext('2d');
            ctx.font = font;
            ctx.textBaseline = 'middle';
            ctx.lineJoin = 'round';
            ctx.lineWidth = 4;
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
            ctx.strokeText(words, 4, canvas.height / 2);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(words, 4, canvas.height / 2);
            const sprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
            sprite.eventMode = 'none';
            sprite.rrLabel = true;
            return sprite;
        },

        /** A map's open levels with no 3D runtime loaded (a 2D session): read off the map as RRMapEdges stores them. */
        open2D(mapData) {
            if (R()?.levelsOf) return this.open(mapData);
            const raw = mapData?.reactor3d?.surround?.levels, out = {};
            if (!raw || typeof raw !== 'object') return out;
            for (const side of SIDES) {
                const level = raw[side];
                if (!level || !(Number(level.map) > 0) || !Array.isArray(level.openings)) continue;
                const openings = level.openings.filter(o => o && Number.isFinite(Number(o.x)) && Number.isFinite(Number(o.y)))
                    .map(o => ({ x: Math.round(o.x), y: Math.round(o.y), w: Math.max(1, Math.round(o.w || 1)), h: Math.max(1, Math.round(o.h || 1)) }));
                if (openings.length) out[side] = { map: Math.round(Number(level.map)), openings };
            }
            return out;
        },

        /** The map's container is about to be destroyed: the outlines go with it and are drawn again in the next. */
        detach(tm) {
            const state = tm && tm._levelMarks;
            if (!state) return;
            if (state.layer && !state.layer.destroyed) this.unlayer(state.layer);
            state.layer = null;
            state.key = '';
        },

        init() {
            if (typeof document === 'undefined' || this._bound) return;
            this._bound = true;
            const again = () => {
                const tm = root.reactor?.projectController?.tilemapManager;
                if (tm && tm.currentMap) { try { this.sync2D(tm); } catch (error) { console.warn('Maps above and below:', error); } }
                const editor = root.reactor?.mapEditor3D;
                if (editor?.enabled && editor.mapScene) { try { this.sync(editor); } catch (error) { console.warn('Maps above and below:', error); } }
            };
            // An opening added, moved or taken away in the Terrain tools, an undo of one, the tick, files written by another window.
            document.addEventListener('rr-map-edited', event => { if (!event.detail || event.detail.surround) again(); });
            document.addEventListener('rr-surround-view', again);
            if (typeof window !== 'undefined') window.addEventListener('focus', again);
        }
    };

    root.RRMapLevelView = api;
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => api.init());
        else api.init();
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
