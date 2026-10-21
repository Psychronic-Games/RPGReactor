/**
 * MapNeighborView - the maps past a map's border, standing beside it in the 3D map view.
 *
 * A map names the map past a side in its `surround.neighbors` (RRMapEdges). The game builds
 * that map's world past the border as the player nears it (Reactor3D.Neighbors,
 * runtime/reactor_3d_surround.js); the 3D map view shows it in the same place by the same
 * steps: read from the project's files as last saved, built once after the map being edited
 * is up (its floor, then its pieces, then its water, land and plants, a frame each, then its
 * placed models), moved when its shift changes, built again when another map is chosen or
 * its files are written. It stays through every rebuild of the map being edited.
 *
 * It is scenery: it is in none of the view's pick lists, and nothing here writes a file.
 * The view's Surroundings tick hides it with the land past the border.
 */
(function(root) {
    'use strict';

    const SIDES = ['north', 'east', 'south', 'west'];
    const R = () => root.Reactor3D;
    const frame = fn => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(fn) : setTimeout(fn, 0));
    const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const api = {
        SIDES,

        //---------------------------------------------------------------------
        // The rules

        /** What a map's two files are now, from their `fs.Stats` (null: no such file): another string once either is written, '' with no map file. */
        stamp(mapStat, sidecarStat) {
            if (!mapStat) return '';
            const of = stat => (stat ? `${stat.mtimeMs}:${stat.size}` : '-');
            return `${of(mapStat)}|${of(sidecarStat)}`;
        },

        /**
         * What is done about one side. `standing` is the world that stands there (`{ map, stamp, x, z }`, or
         * null), `wanted` the neighbor the map names (`{ map, stamp, x, z }`, its stamp null until its files
         * are read; null when the side names none or its map cannot be read):
         * 'none', 'remove', 'wait' (what stands stays until the files are read), 'build' (what stands goes
         * first), 'move' (the same world at another place) or 'keep'.
         */
        step(standing, wanted) {
            if (!wanted) return standing ? 'remove' : 'none';
            if (!wanted.stamp) return standing && standing.map !== wanted.map ? 'remove' : 'wait';
            if (!standing || standing.map !== wanted.map || standing.stamp !== wanted.stamp) return 'build';
            return standing.x === wanted.x && standing.z === wanted.z ? 'keep' : 'move';
        },

        /**
         * The parts of a map's sides its neighbors stand on, where it lays no land of its own
         * (`{ side: true | { from, to } }`, the scene's `surroundNone`); null when none does.
         * `standing` is `{ side: { width, height, x, z } }`: each neighbor's size and place.
         */
        noneOf(mapData, standing) {
            const N = R()?.Neighbors, none = {};
            if (!N?.shared || !mapData) return null;
            for (const side of SIDES) {
                const there = standing && standing[side];
                if (!there) continue;
                const mine = N.shared(mapData, there, side, there).mine;
                if (mine) none[side] = mine;
            }
            return Object.keys(none).length ? none : null;
        },

        //---------------------------------------------------------------------
        // What is kept for a view

        /** `held`: the worlds taken out of a scene being built again, by side. `records`: the maps read, by id. */
        state(editor) {
            return editor._neighborView || (editor._neighborView = { owner: '', held: {}, records: new Map(), frame: 0 });
        },

        /** The view's state for the map it shows: the worlds and the maps read for another map (or project) go first. */
        own(editor, mapData) {
            const state = this.state(editor), owner = `${editor.projectPath?.() || ''}|${mapData?.id || 0}`;
            if (state.owner !== owner) { this.dispose(editor); state.owner = owner; }
            return state;
        },

        /** Whether the view shows what lies past the border (its Surroundings tick). */
        shown() { return !root.RRMapEdges || root.RRMapEdges.visible(); },

        files(editor, mapId) {
            const projectPath = editor.projectPath?.();
            if (!projectPath || !editor.fs || !editor.path || !(mapId > 0)) return null;
            const stem = editor.path.join(projectPath, 'data', 'Map' + String(mapId).padStart(3, '0'));
            return { map: stem + '.json', sidecar: stem + (R()?.SIDECAR_SUFFIX || '.r3d.json') };
        },

        /**
         * A map past the border: `{ mapId, stamp, state: 'loading' | 'ready' | 'failed', map, bitmaps, host }`, read
         * off disk with its images once, and again once its files are written; null when it has no file.
         */
        record(editor, mapId) {
            const state = this.state(editor), files = this.files(editor, mapId);
            const stat = file => { try { return editor.fs.statSync(file); } catch (error) { return null; } };
            const stamp = files ? this.stamp(stat(files.map), stat(files.sidecar)) : '';
            if (!stamp) { state.records.delete(mapId); return null; }
            let record = state.records.get(mapId);
            if (record && record.stamp === stamp) return record;
            record = { mapId, stamp, state: 'loading', map: null, bitmaps: null, host: null, ms: {} };
            state.records.set(mapId, record);
            const started = now();
            this.load(editor, record, files).then(() => { record.state = 'ready'; record.ms.read = Math.round(now() - started); }, error => {
                record.state = 'failed';
                console.warn(`The neighboring map ${mapId} could not be read.`, error);
            }).then(() => { if (state.records.get(mapId) === record) this.soon(editor); });
            return record;
        },

        /** Read a neighbor's map and 3D notes, and the images its world wears, as the view reads its own map's. */
        async load(editor, record, files) {
            const fs = editor.fs, E = R();
            const parse = data => (root.RRJson ? root.RRJson.parse(data) : JSON.parse(String(data)));
            const map = parse(await fs.promises.readFile(files.map));
            if (!map || !(map.width > 0) || !(map.height > 0) || !Array.isArray(map.data)) throw new Error('Not a map.');
            if (fs.existsSync(files.sidecar)) {
                try { map.reactor3d = parse(await fs.promises.readFile(files.sidecar)); } catch (error) { /* a map with no 3D notes */ }
            }
            const tileset = editor.projectController?.databaseManager?.getTileset?.(map.tilesetId) || null;
            const rockChunkCache = new Map();
            const [bitmaps, parallaxes, materials] = await Promise.all([
                tileset ? editor.loadSheets(tileset) : {},
                editor.loadParallaxes(map),
                editor.loadMaterials(map),
                E.prepareRockChunks ? E.prepareRockChunks(map, rockChunkCache) : null
            ]);
            record.map = map;
            record.bitmaps = bitmaps;
            // What the view hands its own map's scene (MapEditor3D.rebuild): no game is running to load from.
            record.host = {
                flags: tileset ? tileset.flags : null,
                settings: {
                    tileSize: editor.tilePixels(),
                    loadParallax: name => parallaxes[name] || null,
                    loadMaterial: name => materials[name] || null,
                    loadMaterialSettings: name => editor.materialSettings?.[name] || null,
                    rockWorkers: false,
                    rockChunkCache
                }
            };
        },

        //---------------------------------------------------------------------
        // The worlds in the view

        /** Where a world stands, as `step` and `noneOf` read it. */
        placeOf(body) {
            const map = body.record.map;
            return { map: body.mapId, stamp: body.record.stamp, x: body.offset.x, z: body.offset.z, width: map.width, height: map.height };
        },

        /**
         * The parts of the sides the worlds kept from the scene before stand on, for the scene about to be
         * built: its land is laid once, already without them.
         */
        noneFor(editor, mapData) {
            const E = R(), N = E?.Neighbors;
            if (!N?.place || !mapData) return null;
            const state = this.own(editor, mapData), named = E.neighborsOf(mapData), standing = {};
            for (const side of SIDES) {
                const held = state.held[side], entry = named[side];
                if (!held || !entry || entry.map !== held.mapId) continue;
                const map = held.record.map, offset = N.offsetOf(mapData, side, entry, map.width, map.height);
                standing[side] = { width: map.width, height: map.height, x: offset.x, z: offset.z };
            }
            return this.noneOf(mapData, standing);
        },

        /** The scene is about to be destroyed: the worlds beside it leave it whole, to stand in the next one. */
        hold(editor) {
            const N = R()?.Neighbors, scene = editor.mapScene, bodies = scene && scene._neighborBodies;
            if (!N || !bodies) return;
            const state = this.state(editor);
            for (const side of Object.keys(bodies)) {
                const body = N.detach(scene, side);
                if (!body) continue;
                if (state.held[side]) this.destroy(editor, state.held[side]);
                state.held[side] = body;
            }
        },

        /** A world is let go: its placed models, then its scene. */
        destroy(editor, body) {
            if (body.propGroup) {
                for (const child of body.propGroup.children.slice()) editor.disposeModelCopy?.(child);
                body.propGroup.parent?.remove(body.propGroup);
                body.propGroup = null;
            }
            try { body.scene.destroy(); } catch (error) { /* a renderer already gone */ }
        },

        /** Every world and every map read is let go (the view closes, or shows another map). */
        dispose(editor) {
            const N = R()?.Neighbors, state = this.state(editor), scene = editor.mapScene;
            for (const side of Object.keys((N && scene && scene._neighborBodies) || {})) {
                const body = N.detach(scene, side);
                if (body) this.destroy(editor, body);
            }
            for (const side of Object.keys(state.held)) this.destroy(editor, state.held[side]);
            state.held = {};
            state.records.clear();
        },

        /**
         * Bring the worlds past the border in line with the map as it stands: one the map no longer names goes,
         * one whose shift changed is moved, one kept from the scene before stands in this one. A world still to
         * be built is built on a later frame (`building`: this is that frame), and what is left of one to lay
         * (its pieces, its water, its placed models) is laid one part a call. True when this map's land past
         * the border was laid here, from the map as it stands.
         */
        sync(editor, building = false) {
            const E = R(), N = E?.Neighbors, scene = editor?.mapScene, map = editor?.currentMap?.();
            if (!N?.place || !editor.enabled || !scene?._scene || !map) return false;
            const state = this.own(editor, map), named = E.neighborsOf(map), shown = this.shown();
            const bodies = scene._neighborBodies || (scene._neighborBodies = {});
            let changed = false, waiting = false, built = false, relay = false, moved = false;
            for (const side of SIDES) {
                const entry = named[side] || null, record = entry ? this.record(editor, entry.map) : null;
                const ready = !!record && record.state === 'ready';
                const offset = ready ? N.offsetOf(map, side, entry, record.map.width, record.map.height) : null;
                const wanted = record && record.state !== 'failed' ? { map: entry.map, stamp: ready ? record.stamp : null, x: offset ? offset.x : 0, z: offset ? offset.z : 0 } : null;
                const standing = bodies[side] || state.held[side] || null;
                const step = this.step(standing ? this.placeOf(standing) : null, wanted);
                if (step === 'none' || (step === 'wait' && !standing)) continue;
                if (step === 'remove' || step === 'build') {
                    if (standing) { this.leave(editor, scene, side); changed = true; }
                    if (step === 'remove' || !shown) continue;
                    if (!building) { waiting = true; continue; }
                    const started = now(), body = N.addBody(scene, map, side, entry, record, record.bitmaps, record.host);
                    if (!body) continue;
                    record.ms.floor = Math.round(now() - started);
                    changed = built = relay = true;
                    continue;
                }
                // What stands is kept: back into this scene when it was taken out of the one before.
                if (!bodies[side]) { this.stand(scene, side, state); changed = true; }
                if (step === 'move' && N.place(scene, map, side, entry)) changed = moved = true;
            }
            // This map's land has gaps where the worlds stand, and nowhere else: laid from the map as it stands
            // (a move has laid it already).
            const standing = {};
            for (const side of Object.keys(bodies)) standing[side] = this.placeOf(bodies[side]);
            const none = this.noneOf(map, standing);
            let laid = moved;
            if (relay || JSON.stringify(none) !== JSON.stringify(scene._surroundNone || null)) {
                scene._surroundNone = none;
                if (scene.addSurround) { scene.addSurround(map); laid = true; }
            }
            for (const side of Object.keys(bodies)) this.show(bodies[side], shown);
            // One part of one world a call: the rest on the frames after.
            const body = shown ? Object.values(bodies).find(entry => entry.stage || !entry.propsAsked) : null;
            if (body && building && !built) {
                if (body.stage) this.lay(body); else this.props(editor, body);
                changed = true;
            }
            if (waiting || (shown && Object.values(bodies).some(entry => entry.stage || !entry.propsAsked))) this.soon(editor);
            if (changed) editor.requestRender?.();
            return laid;
        },

        /** The next part of a world: its pieces, then its water with its land and plants (Reactor3D.Neighbors.stage). */
        lay(body) {
            const started = now(), stage = body.stage;
            R().Neighbors.stage(body);
            body.record.ms[stage === 1 ? 'pieces' : 'water'] = Math.round(now() - started);
        },

        /** A world kept from the scene before stands in this one, as it was. */
        stand(scene, side, state) {
            const held = state.held[side];
            delete state.held[side];
            const body = R().Neighbors.attach(scene, side, held.scene, held.mapId, held.offset, held.record);
            Object.assign(body, { stage: held.stage, load: held.load, settle: 0, propGroup: held.propGroup, propsAsked: held.propsAsked });
            return body;
        },

        /** The world on a side is taken away, out of the scene or from what was kept for it. */
        leave(editor, scene, side) {
            const state = this.state(editor), body = R().Neighbors.detach(scene, side) || state.held[side];
            delete state.held[side];
            if (body) this.destroy(editor, body);
        },

        /**
         * A neighbor's placed models (its trees, its rocks as models) stand in its world, as the view stands
         * its own map's: each as its file arrives. They are not in the view's own list, so nothing picks them.
         */
        props(editor, body) {
            body.propsAsked = true;
            const E = R(), map = body.record.map, previews = root.RREventPreviewModels;
            const manager = typeof ModelPropsManager !== 'undefined' ? ModelPropsManager : null;
            const props = root.RRMapElevation?.props ? root.RRMapElevation.props(map) : [];
            if (!props.length || !previews || !manager?.specOf || !E.normalizeModelSpec || !body.scene._scene) return;
            const group = new THREE.Group();
            group.name = 'neighbor-props';
            body.propGroup = group;
            body.scene._scene.add(group);
            const project = editor.projectController?.getCurrentProject ? editor.projectController.getCurrentProject() : editor.projectController?.currentProject;
            for (const prop of props) {
                const spec = E.normalizeModelSpec(manager.specOf(prop));
                if (!spec) continue;
                previews.templateFor(project, spec, editor).then(template => {
                    // (Its world was let go while the file was read: the group is out of it.)
                    if (!template || !group.parent || !editor.enabled) return;
                    const object = previews.instance(template, spec, prop.direction);
                    object.userData.modelPreview = true;
                    editor.placeProp(object, prop, map);
                    group.add(object);
                    if (E.Shadows) E.Shadows.markCaster(object, false);
                    editor.requestRender?.();
                }).catch(error => console.warn('A model of a neighboring map could not be shown.', error));
            }
        },

        /** The frame after next: the worlds still to build or to finish are worked on then, once the view has drawn. */
        soon(editor) {
            const state = this.state(editor);
            if (state.frame) return;
            state.frame = frame(() => {
                state.frame = frame(() => {
                    state.frame = 0;
                    try { this.sync(editor, true); } catch (error) { console.warn('Neighboring maps:', error); }
                });
            });
        },

        //---------------------------------------------------------------------
        // The view's own steps

        /** A world shown or hidden whole: its own land past its other borders with it, and never its sky (one sky: the map's own). */
        show(body, visible) {
            body.group.visible = !!visible;
            if (body.scene._sky) body.scene._sky.visible = false;
            body.scene.setSurroundVisible?.(!!visible);
        },

        /** The Surroundings tick: the worlds past the border shown or hidden with the land; one not built yet is built when shown. */
        setVisible(editor, visible) {
            const bodies = editor?.mapScene?._neighborBodies || {};
            for (const side of Object.keys(bodies)) this.show(bodies[side], visible);
            if (visible && editor?.mapScene) { try { this.sync(editor); } catch (error) { console.warn('Neighboring maps:', error); } }
        },

        /** A pass that clears depth and draws over the frame (the star tiles, the overlay) leaves the worlds out; `on` puts them back. */
        pass(editor, on) {
            const bodies = editor.mapScene && editor.mapScene._neighborBodies;
            if (!bodies) return;
            const visible = !!on && this.shown();
            for (const side in bodies) bodies[side].group.visible = visible;
        },

        /** Whether any world past the border has placed models standing. */
        hasProps(editor) {
            const bodies = editor.mapScene && editor.mapScene._neighborBodies;
            if (bodies) for (const side in bodies) if (bodies[side].propGroup && bodies[side].propGroup.children.length) return true;
            return false;
        },

        /** Distance levels for the neighbors' placed models, from the view's eye (in each world's own tiles). */
        lods(editor, eye, screen) {
            const E = R(), bodies = editor.mapScene && editor.mapScene._neighborBodies;
            if (!bodies || !E.pickLod) return;
            const local = this._eye || (this._eye = new THREE.Vector3());
            for (const side in bodies) {
                const body = bodies[side];
                if (!body.propGroup || !body.group.visible) continue;
                local.set(eye.x - body.offset.x, eye.y, eye.z - body.offset.z);
                for (const object of body.propGroup.children) {
                    if (object.userData && object.userData.lodKey) E.pickLod(object, E.instanceSpan(object), local, undefined, screen);
                }
            }
        }
    };

    root.RRMapNeighborView = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
