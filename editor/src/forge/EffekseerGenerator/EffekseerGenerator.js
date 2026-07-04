/**
 * EffekseerGenerator - Forge tool for generating Effekseer particle effects
 * (.efkefc) without the Effekseer editor.
 *
 * Pipeline: recipe knobs → RR_EfkBuilder node tree → RR_EfkFormat binary
 * (version 1500, byte-validated against the 120 stock MZ effects) → either
 * the live preview (in-memory ArrayBuffer + data-URL textures via
 * loadEffect's redirect hook) or export (project/effects/<Name>.efkefc +
 * effects/Texture/rr_*.png, exactly the layout the engine loads).
 *
 * Preview design:
 *   • ONE persistent RAF loop per mounted preview — it always draws, and
 *     steps the simulation only while playing. Param changes load the new
 *     effect IN THE BACKGROUND and swap seamlessly on load, so the old
 *     effect keeps playing during the rebuild (no pause, no black flash).
 *   • Orbit camera: drag = yaw/pitch, wheel = dolly, Reset View restores
 *     the game-accurate default (same matrices as AnimationPicker).
 *   • The Effekseer context binds to ONE canvas's GL context: renderInto()
 *     rebuilds the DOM, so it must tear down and recreate the context — a
 *     stale context renders into the detached canvas (black square).
 *
 * File structure:
 *   src/forge/EffekseerGenerator/
 *     ├── format/efk_format.js   — .efkefc parser/writer (round-trip proven)
 *     ├── format/efk_builder.js  — defaults + node construction
 *     ├── textures.js            — procedural white-alpha particle textures
 *     ├── recipes/registry.js    — RR_EFK_RECIPE_REGISTRY + param resolution
 *     ├── recipes/*.js           — each pushes one recipe into the registry
 *     └── EffekseerGenerator.js  — THIS FILE: UI + preview loop + export
 */
class EffekseerGenerator {
    constructor() {
        this.projectController = null;
        this.contentEl = null;
        // THE LAYER STACK (like the standard Animation Generator): each
        // layer is a full recipe instance with its own params and a
        // progression window [start, end] on the shared timeline (end 0 =
        // the recipe's natural/endless duration). The stack composes into
        // ONE effect — one .efkefc on export.
        const firstCat = buildEfkRecipeCategories().values().next().value;
        const firstId = firstCat && firstCat[0] ? firstCat[0].id
            : (RR_EFK_RECIPE_REGISTRY[0] ? RR_EFK_RECIPE_REGISTRY[0].id : null);
        this._stack = [{ recipeId: firstId, values: {}, start: 0, end: 0 }];
        this._activeLayer = 0;
        this._effectDuration = 120;   // total frames; 0 = untimed
        this._efkContext = null;
        this._efkEffect = null;
        this._efkHandle = null;
        this._gl = null;
        this._rafId = null;
        this._rebuildTimer = null;
        this._replayTimer = null;
        this._watchdogTimer = null;
        this._generation = 0;
        this._frame = 0;
        this._loopFrames = 0;    // >0 = seamless: replay at exactly this frame
        this._playing = false;
        // Orbit camera (defaults = AnimationPicker's game-accurate view).
        this._camYaw = 0;
        this._camPitch = 0;
        this._camDist = 10;
        // Orientation is PER KEYFRAME (reserved __tiltX/Y/Z keys in each
        // keyframe's values, degrees) and baked into the composed effect
        // by _composeStack. The gizmo edits the active keyframe only.
        // _tiltDelta is transient live-drag feedback: the offset between
        // the active keyframe's tilt and what's baked into the effect
        // currently on screen, applied via handle.setRotation until the
        // debounced rebuild lands and zeroes it.
        this._tiltDelta = { x: 0, y: 0, z: 0 };
        this._displayTilt = { x: 0, y: 0, z: 0 };
        this._gizmo = null;
        this._modelCache = new Map();    // model path → { bytes, dataUrl }
        this._customTexCache = new Map();   // basename → dataUrl (from project file)
        this._bakeCache = new Map();     // baked AG sprite sheets (per layer/params)
        this._updateTick = 0;            // total simulation updates (drives deferred release)
        this._retiredEffects = [];       // [{ effect, tick }] — released ≥2 updates after stop
    }

    /** Step the simulation once (all update() calls go through here). */
    _ctxUpdate() {
        this._efkContext.update();
        this._updateTick++;
    }

    /**
     * Queue a replaced effect for release. StopEffect only FLAGS instances
     * for removal — the runtime destroys them on the next update(), so
     * releasing the effect's WASM memory immediately is a use-after-free
     * that crashes the renderer. That crash was the "changing a slider
     * stops the animation / sticks on loading" bug: with prewarm it fired
     * synchronously inside the load callback and the swap never finished.
     */
    _retireEffect(effect) {
        if (effect && effect.isLoaded) {
            this._retiredEffects.push({ effect, tick: this._updateTick });
        }
    }

    /** Release retired effects whose stopped instances are gone (≥2 updates old). */
    _flushRetired(force = false) {
        if (!this._retiredEffects.length) return;
        const keep = [];
        for (const r of this._retiredEffects) {
            if (force || this._updateTick >= r.tick + 2) {
                try { this._efkContext && this._efkContext.releaseEffect(r.effect); } catch (e) {}
            } else {
                keep.push(r);
            }
        }
        this._retiredEffects = keep;
    }

    _t(key) {
        return window.I18n ? window.I18n.t(key) : key;
    }

    /** Verbatim-label translation (recipe/param names live in data). */
    _tx(label) {
        return window.I18n && window.I18n.tText ? window.I18n.tText(label) : label;
    }

    /** The active layer entry { recipeId, keyframes, activeKf, start, end }. */
    _layer() {
        if (this._activeLayer >= this._stack.length) this._activeLayer = this._stack.length - 1;
        const layer = this._stack[this._activeLayer];
        // Migrate/init the keyframe model: keyframes = [paramSets], values
        // aliases the active keyframe (AG-style).
        if (!Array.isArray(layer.keyframes)) {
            layer.keyframes = [layer.values || {}];
            layer.activeKf = 0;
        }
        if (layer.activeKf >= layer.keyframes.length) layer.activeKf = layer.keyframes.length - 1;
        layer.values = layer.keyframes[layer.activeKf];
        this._normalizeKfTimes(layer);
        return layer;
    }

    /**
     * Each keyframe owns a FRAME position (absolute, on the layer's
     * timeline). Missing entries are spread evenly across the window.
     */
    _normalizeKfTimes(layer) {
        const K = layer.keyframes.length;
        const start = layer.start || 0;
        const span = (layer.end || 0) > start ? layer.end - start : (this._effectDuration || 120);
        if (!Array.isArray(layer.kfTimes)) layer.kfTimes = [];
        for (let i = 0; i < K; i++) {
            if (typeof layer.kfTimes[i] !== 'number') {
                layer.kfTimes[i] = Math.round(start + (K > 1 ? (span * i) / (K - 1) : 0));
            }
        }
        layer.kfTimes.length = K;
    }

    /** The active layer's ACTIVE KEYFRAME values object. */
    _values() {
        return this._layer().values;
    }

    /**
     * A keyframe's orientation (degrees). Stored as reserved __tilt* keys
     * inside the keyframe's values object so duplicate / delete / preset
     * flows carry it automatically (resolveParams ignores unknown keys).
     */
    _kfTilt(kf) {
        return { x: kf.__tiltX || 0, y: kf.__tiltY || 0, z: kf.__tiltZ || 0 };
    }

    _activeTilt() {
        return this._kfTilt(this._values());
    }

    /**
     * Write the active keyframe's orientation and schedule the rebuild
     * that bakes it. _tiltDelta bridges the debounce: the playing effect
     * rotates live by the offset from its baked tilt (approximate when
     * other layers/keyframes carry their own tilt, exact after the swap).
     */
    _setActiveTilt(x, y, z) {
        const vals = this._values();
        vals.__tiltX = x;
        vals.__tiltY = y;
        vals.__tiltZ = z;
        const b = this._displayTilt;
        this._tiltDelta = { x: x - b.x, y: y - b.y, z: z - b.z };
        this._scheduleRebuild();
    }

    /** Point the gizmo (and the live-drag delta) at the active keyframe's
     *  stored orientation — call whenever the active layer/keyframe changes. */
    _syncTiltUI() {
        this._displayTilt = this._activeTilt();
        this._tiltDelta = { x: 0, y: 0, z: 0 };
        if (this._gizmo) {
            const t = this._displayTilt;
            this._gizmo.setRotation(t.x, t.y, t.z);
        }
    }

    _recipeOf(entry) {
        return RR_EFK_RECIPE_REGISTRY.find(r => r.id === entry.recipeId) || null;
    }

    _recipe() {
        return this._recipeOf(this._layer());
    }

    _params() {
        const recipe = this._recipe();
        if (!recipe) return {};
        return RR_EfkRecipeUtil.resolveParams(recipe, this._values());
    }

    /** Stack-wide playback traits: continuous if ANY layer is, max prewarm. */
    _stackMeta() {
        let continuous = false;
        let prewarm = 0;
        for (const entry of this._stack) {
            const r = this._recipeOf(entry);
            if (!r) continue;
            if (r.continuous) continuous = true;
            const w = typeof r.prewarm === 'function'
                ? r.prewarm(RR_EfkRecipeUtil.resolveParams(r, entry.values)) : (r.prewarm || 0);
            prewarm = Math.max(prewarm, w + (entry.start || 0));
        }
        return { continuous, prewarm: Math.min(600, Math.round(prewarm)) };
    }

    // ── Effect construction ──────────────────────────────────────────────

    /** Texture file path (as referenced inside the .efkefc) for a texture name. */
    _texturePath(name) {
        return `Texture/rr_${name}.png`;
    }

    /** Recipe texture list — static array or function of params. */
    _resolveTextures(recipe, params) {
        const t = recipe.textures;
        const list = typeof t === 'function' ? t(params) : t.map(n => this._texturePath(n));
        return list;
    }

    /**
     * Build a recipe's models via its buildModels(params, RR_EfkModel)
     * hook. Serialized bytes + data URLs are cached by path — recipes
     * encode every mesh-affecting param into the path, so a cache hit is
     * always byte-correct.
     * @returns {Array<{path:string, bytes:Uint8Array, dataUrl:string}>}
     */
    _recipeModels(recipe, params) {
        if (!recipe.buildModels) return [];
        return recipe.buildModels(params, RR_EfkModel).map(({ path, mesh }) => {
            if (!this._modelCache.has(path)) {
                const bytes = RR_EfkModel.writeEfkmodel(mesh);
                let bin = '';
                for (let i = 0; i < bytes.length; i += 8192) {
                    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
                }
                this._modelCache.set(path, {
                    bytes,
                    dataUrl: `data:application/octet-stream;base64,${btoa(bin)}`,
                });
            }
            return { path, ...this._modelCache.get(path) };
        });
    }

    /**
     * Merge every layer's resources into one texture list + one model
     * list (deduped by path) and remap each layer's node indexes onto the
     * merged lists — the mechanics behind "many recipes, one .efkefc".
     */
    _composeStack() {
        const textures = [];
        const models = [];
        const texIndex = new Map();
        const modelIndex = new Map();
        const nodes = [];
        let kfTracks = 0;
        const bindAlways = { translationBindType: 2, rotationBindType: 2, scalingBindType: 2 };
        const { rf, v3 } = RR_EfkBuilder;
        const D2R = Math.PI / 180;

        for (const entry of this._stack) {
            const recipe = this._recipeOf(entry);
            if (!recipe || entry.hidden) continue;
            const params = RR_EfkRecipeUtil.resolveParams(recipe, entry.values);

            const texMap = this._resolveTextures(recipe, params).map((path) => {
                if (!texIndex.has(path)) {
                    texIndex.set(path, textures.length);
                    textures.push(path);
                }
                return texIndex.get(path);
            });
            const layerModels = this._recipeModels(recipe, params);
            const modelMap = layerModels.map((m) => {
                if (!modelIndex.has(m.path)) {
                    modelIndex.set(m.path, models.length);
                    models.push(m);
                }
                return modelIndex.get(m.path);
            });

            // Keyframed layers: topology comes from KEYFRAME 1; the
            // transition to the LAST keyframe is applied natively below
            // (size via eased wrapper scale, opacity via eased colors).
            const kfs = Array.isArray(entry.keyframes) ? entry.keyframes : null;
            const paramsA = kfs && kfs.length > 1 ? RR_EfkRecipeUtil.resolveParams(recipe, kfs[0]) : params;

            // Per-keyframe orientation (degrees) → baked onto the layer
            // wrapper below: fixed rotation when uniform, FCurve tween
            // when keyframes disagree.
            const kfTilts = (kfs && kfs.length ? kfs : [entry.values || {}]).map((kf) => this._kfTilt(kf));
            const tiltVaries = kfTilts.some((t) =>
                t.x !== kfTilts[0].x || t.y !== kfTilts[0].y || t.z !== kfTilts[0].z);
            let wrapperRotation = null;

            // ── CROSS-FADE MODE ──────────────────────────────────────
            // Textures can't tween inside one Effekseer node, but they
            // CAN dissolve: when keyframes differ in a texture param,
            // build one full instance per keyframe and blend them with
            // per-instance alpha envelopes (earth melts into mars).
            const texKeys = recipe.params.filter((s2) => s2.type === 'texture').map((s2) => s2.key);
            let crossfade = false;
            if (kfs && kfs.length > 1 && texKeys.length) {
                crossfade = texKeys.some((k2) => kfs.some((kf) => (kf[k2] || '') !== (kfs[0][k2] || '')));
            }
            let layerNodes;
            if (crossfade) {
                const K = kfs.length;
                const startAbs = entry.start || 0;
                const spanX = (entry.end || 0) > startAbs ? entry.end - startAbs : (this._effectDuration || 120);
                // Indexed over K, not over kfTimes — a missing/short array
                // must still yield one position per keyframe (NaN keys
                // otherwise poison every resampled track).
                const timesRaw = Array.from({ length: K }, (_, i2) => {
                    const t = entry.kfTimes && entry.kfTimes[i2];
                    return typeof t === 'number' ? t : startAbs + (spanX * i2) / (K - 1);
                });
                const orderX = timesRaw.map((t, i2) => i2).sort((a, b) => timesRaw[a] - timesRaw[b]);
                const relX = orderX.map((i2) => Math.max(0, Math.min(spanX, timesRaw[i2] - startAbs)));
                const freqX = Math.max(1, Math.round(spanX / 48));
                const lenX = Math.max(freqX, Math.ceil(spanX / freqX) * freqX);
                const gridX = [];
                for (let f2 = 0; f2 <= lenX; f2 += freqX) gridX.push(f2);
                const lerpX = (valsKf) => {
                    const vals = orderX.map((i2) => valsKf[i2]);
                    return gridX.map((f2) => {
                        if (f2 <= relX[0]) return vals[0];
                        if (f2 >= relX[relX.length - 1]) return vals[vals.length - 1];
                        let j = 1;
                        while (relX[j] < f2) j++;
                        const u = relX[j] > relX[j - 1] ? (f2 - relX[j - 1]) / (relX[j] - relX[j - 1]) : 0;
                        return vals[j - 1] + (vals[j] - vals[j - 1]) * u;
                    });
                };
                const chanX = (keys) => ({ start: 0, end: 0, offsetMax: 0, offsetMin: 0, offset: 0, len: lenX, freq: freqX, keys });

                layerNodes = [];
                for (let ki = 0; ki < K; ki++) {
                    const kp = RR_EfkRecipeUtil.resolveParams(recipe, kfs[ki]);
                    const texMapI = this._resolveTextures(recipe, kp).map((path2) => {
                        if (!texIndex.has(path2)) { texIndex.set(path2, textures.length); textures.push(path2); }
                        return texIndex.get(path2);
                    });
                    const modelsI = this._recipeModels(recipe, kp);
                    const modelMapI = modelsI.map((m) => {
                        if (!modelIndex.has(m.path)) { modelIndex.set(m.path, models.length); models.push(m); }
                        return modelIndex.get(m.path);
                    });
                    const tree = recipe.build(kp);
                    const env = lerpX(kfs.map((kf, j) => (j === ki ? 255 : 0)));
                    (function fadeRemap(list) {
                        for (const n of list) {
                            if (n.rendererCommon && n.rendererCommon.colorTextureIndex >= 0) {
                                n.rendererCommon.colorTextureIndex = texMapI[n.rendererCommon.colorTextureIndex] ?? -1;
                            }
                            if (n.rendererCommon) n.rendererCommon.zWrite = 0;   // depth-writes from an invisible twin would occlude the visible one
                            if (n.type === RR_EfkFormat.NODE_TYPE.MODEL && n.rendererParams) {
                                // 1 = cull the inside — 0 showed the sphere's
                                // INTERIOR (mirrored texture, user-confirmed).
                                n.rendererParams.culling = 1;
                            }
                            if (n.rendererParams && typeof n.rendererParams.modelIndex === 'number') {
                                n.rendererParams.modelIndex = modelMapI[n.rendererParams.modelIndex] ?? 0;
                            }
                            if (n.generationLocation && n.generationLocation.type === 2) {
                                n.generationLocation.modelIndex = modelMapI[n.generationLocation.modelIndex] ?? 0;
                            }
                            const applyEnv = (c) => ({
                                type: 3,
                                fcurve: {
                                    timeline: 0,
                                    r: chanX(gridX.map(() => c.r)),
                                    g: chanX(gridX.map(() => c.g)),
                                    b: chanX(gridX.map(() => c.b)),
                                    a: chanX(env.map((e2) => Math.round((c.a * e2) / 255))),
                                },
                            });
                            if (n.rendererParams && n.rendererParams.allColor && n.rendererParams.allColor.type === 0) {
                                n.rendererParams.allColor = applyEnv(n.rendererParams.allColor.fixed);
                            }
                            for (const key2 of ['outerColor', 'centerColor', 'innerColor']) {
                                const rc = n.rendererParams && n.rendererParams[key2];
                                if (rc && rc.type === 0) n.rendererParams[key2] = applyEnv(rc.fixed);
                            }
                            fadeRemap(n.children || []);
                        }
                    })(tree);
                    // hair-thin scale offset avoids coplanar z-fighting
                    layerNodes.push(RR_EfkBuilder.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                        commonValues: { ...bindAlways, maxGeneration: 1, life: rf(36000) },
                        scaling: { type: 0, refEq: -1, scale: v3(1 + ki * 0.004, 1 + ki * 0.004, 1 + ki * 0.004) },
                        children: tree,
                    }));
                }
                if (tiltVaries) {
                    kfTracks++;
                    wrapperRotation = {
                        type: 5,
                        fcurve: {
                            timeline: 0,
                            x: chanX(lerpX(kfTilts.map((t) => t.x * D2R))),
                            y: chanX(lerpX(kfTilts.map((t) => t.y * D2R))),
                            z: chanX(lerpX(kfTilts.map((t) => t.z * D2R))),
                        },
                    };
                }
            } else {
                layerNodes = recipe.build(paramsA);
            }
            if (!crossfade) (function remap(list) {
                for (const n of list) {
                    if (n.rendererCommon && n.rendererCommon.colorTextureIndex >= 0) {
                        n.rendererCommon.colorTextureIndex = texMap[n.rendererCommon.colorTextureIndex] ?? -1;
                    }
                    if (n.rendererParams && typeof n.rendererParams.modelIndex === 'number') {
                        n.rendererParams.modelIndex = modelMap[n.rendererParams.modelIndex] ?? 0;
                    }
                    if (n.generationLocation && n.generationLocation.type === 2) {
                        n.generationLocation.modelIndex = modelMap[n.generationLocation.modelIndex] ?? 0;
                    }
                    remap(n.children || []);
                }
            })(layerNodes);

            // ── KEYFRAME COMPILER ────────────────────────────────
            // Build the layer once per keyframe and compile the diffs
            // into NATIVE curves: colors (incl. ring colors) become
            // FCurve color tracks with one key per keyframe; the size
            // param becomes an FCurve scale on the wrapper; differing
            // spin velocities become integrated FCurve rotations.
            // Geometry-changing params (meshes, counts) can't tween in
            // the Effekseer format — they take keyframe 1's value.
            const hasKf = kfs && kfs.length > 1 && !crossfade;
            let span = (entry.end || 0) > (entry.start || 0) ? entry.end - (entry.start || 0)
                : (hasKf ? (this._effectDuration || 120) : 36000);
            let wrapperScaling = null;
            if (hasKf) {
                const K = kfs.length;
                // Keyframes sit at USER-CHOSEN frames (entry.kfTimes,
                // absolute) — FCurves are uniformly sampled, so we
                // resample: linear interpolation through the keyframe
                // positions onto a fixed-frequency grid.
                const startAbs = entry.start || 0;
                // Indexed over K, not over kfTimes — a missing/short array
                // must still yield one position per keyframe (NaN keys
                // otherwise poison every resampled track).
                const timesRaw = Array.from({ length: K }, (_, i) => {
                    const t = entry.kfTimes && entry.kfTimes[i];
                    return typeof t === 'number' ? t : startAbs + (span * i) / (K - 1);
                });
                const order = timesRaw.map((t, i) => i).sort((a, b) => timesRaw[a] - timesRaw[b]);
                const rel = order.map((i) => Math.max(0, Math.min(span, timesRaw[i] - startAbs)));
                const freq = Math.max(1, Math.round(span / 48));
                const len = Math.max(freq, Math.ceil(span / freq) * freq);
                const grid = [];
                for (let f2 = 0; f2 <= len; f2 += freq) grid.push(f2);
                const lerpAt = (valsInKfOrder) => {
                    const vals = order.map((i) => valsInKfOrder[i]);
                    return grid.map((f2) => {
                        if (f2 <= rel[0]) return vals[0];
                        if (f2 >= rel[rel.length - 1]) return vals[vals.length - 1];
                        let j = 1;
                        while (rel[j] < f2) j++;
                        const t0 = rel[j - 1], t1 = rel[j];
                        const u = t1 > t0 ? (f2 - t0) / (t1 - t0) : 0;
                        return vals[j - 1] + (vals[j] - vals[j - 1]) * u;
                    });
                };
                const chan = (vals) => ({ start: 0, end: 0, offsetMax: 0, offsetMin: 0, offset: 0, len, freq, keys: lerpAt(vals) });
                // per-keyframe orientation → FCurve rotation on the wrapper
                if (tiltVaries) {
                    kfTracks++;
                    wrapperRotation = {
                        type: 5,
                        fcurve: {
                            timeline: 0,
                            x: chan(kfTilts.map((t) => t.x * D2R)),
                            y: chan(kfTilts.map((t) => t.y * D2R)),
                            z: chan(kfTilts.map((t) => t.z * D2R)),
                        },
                    };
                }
                const kfParams = kfs.map((kf) => RR_EfkRecipeUtil.resolveParams(recipe, kf));
                const kfTrees = [layerNodes, ...kfs.slice(1).map((kf, i) => {
                    try { return recipe.build(kfParams[i + 1]); } catch (e) { return null; }
                })];

                if (!kfTrees.includes(null)) {
                    const differs = (cs) => cs.some((c) => c.r !== cs[0].r || c.g !== cs[0].g || c.b !== cs[0].b || c.a !== cs[0].a);
                    const toFCurve = (cs) => ({
                        type: 3,
                        fcurve: {
                            timeline: 0,
                            r: chan(cs.map((c) => c.r)),
                            g: chan(cs.map((c) => c.g)),
                            b: chan(cs.map((c) => c.b)),
                            a: chan(cs.map((c) => c.a)),
                        },
                    });
                    (function kfWalk(lists) {
                        const base = lists[0];
                        for (let i = 0; i < base.length; i++) {
                            const peers = lists.map((L2) => L2 && L2[i]);
                            if (peers.some((o) => !o || o.type !== base[i].type)) continue;
                            const n = base[i];
                            // allColor (sprites/models/tracks)
                            const acs = peers.map((o) => o.rendererParams && o.rendererParams.allColor);
                            if (acs.every((c) => c && c.type === 0)) {
                                const cs = acs.map((c) => c.fixed);
                                if (differs(cs)) { n.rendererParams.allColor = toFCurve(cs); kfTracks++; }
                            }
                            // ring color trio
                            for (const key of ['outerColor', 'centerColor', 'innerColor']) {
                                const rcs = peers.map((o) => o.rendererParams && o.rendererParams[key]);
                                if (rcs.every((c) => c && c.type === 0)) {
                                    const cs = rcs.map((c) => c.fixed);
                                    if (differs(cs)) { n.rendererParams[key] = toFCurve(cs); kfTracks++; }
                                }
                            }
                            // spin: rotation PVA velocity differences →
                            // integrated FCurve rotation (radian keys)
                            const rots = peers.map((o) => o.rotation);
                            if (rots.every((r2) => r2 && r2.type === 1) &&
                                rots.some((r2) => ['x', 'y', 'z'].some((ax) =>
                                    r2.velocity.max[ax] !== rots[0].velocity.max[ax]))) {
                                const angleChan = (ax) => {
                                    const velGrid = lerpAt(rots.map((r2) => r2.velocity.max[ax]));
                                    const keys = [0];
                                    for (let g2 = 1; g2 < velGrid.length; g2++) {
                                        keys.push(keys[g2 - 1] + velGrid[g2 - 1] * freq);
                                    }
                                    return { start: 0, end: 0, offsetMax: 0, offsetMin: 0, offset: 0, len, freq, keys };
                                };
                                n.rotation = {
                                    type: 5,
                                    fcurve: {
                                        timeline: 0,
                                        x: angleChan('x'),
                                        y: angleChan('y'),
                                        z: angleChan('z'),
                                    },
                                };
                                kfTracks++;
                            }
                            kfWalk(peers.map((o) => o.children || []));
                        }
                    })(kfTrees);

                    // size param → wrapper FCurve scale through EVERY KF
                    if (typeof kfParams[0].size === 'number' && kfParams[0].size > 0 &&
                        kfParams.some((kp) => kp.size !== kfParams[0].size)) {
                        const ratios = kfParams.map((kp) => kp.size / kfParams[0].size);
                        kfTracks++;
                        wrapperScaling = {
                            type: 5,
                            fcurve: {
                                timeline: 0,
                                x: chan(ratios.slice()),
                                y: chan(ratios.slice()),
                                z: chan(ratios.slice()),
                            },
                        };
                    }
                }
            }

            // Uniform tilt (single keyframe, or every keyframe agrees)
            // bakes as a fixed rotation on the layer wrapper.
            if (!wrapperRotation && (kfTilts[0].x || kfTilts[0].y || kfTilts[0].z)) {
                wrapperRotation = {
                    type: 0,
                    refEq: -1,
                    rotation: v3(kfTilts[0].x * D2R, kfTilts[0].y * D2R, kfTilts[0].z * D2R),
                };
            }

            // Progression window / transition / rotation wrapper.
            if ((entry.start || 0) > 0 || (entry.end || 0) > 0 || hasKf || crossfade || wrapperRotation) {
                // EVERY node in the subtree must die with the window —
                // Effekseer children survive their parent's removal unless
                // flagged, so flagging only the top container let the
                // grandchildren (long-lived cores/glows) pile up brighter
                // on every cycle.
                (function flagAll(list) {
                    for (const n of list) {
                        n.commonValues.removeWhenParentIsRemoved = 1;
                        flagAll(n.children || []);
                    }
                })(layerNodes);
                // The window re-spawns every master cycle, so keyframed /
                // delayed layers REPEAT their pattern on every loop of the
                // effect instead of playing once and going dark.
                const cycle = Math.max((entry.start || 0) + span, this._effectDuration || 0) || span;
                if (wrapperRotation) {
                    // Children must follow the rotating wrapper's frame
                    // rigidly, or the baked tilt silently no-ops —
                    // WhenCreating snapshots the parent transform at spawn.
                    for (const n of layerNodes) {
                        if (n.commonValues.translationBindType === 1) n.commonValues.translationBindType = 2;
                        if (n.commonValues.rotationBindType === 1) n.commonValues.rotationBindType = 2;
                    }
                }
                layerNodes = [RR_EfkBuilder.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                    commonValues: {
                        ...bindAlways,
                        maxGeneration: 99999,
                        generationTimeOffset: rf(entry.start || 0),
                        generationTime: rf(cycle),
                        life: rf(span),
                    },
                    ...(wrapperScaling ? { scaling: wrapperScaling } : {}),
                    ...(wrapperRotation ? { rotation: wrapperRotation } : {}),
                    children: layerNodes,
                })];
            }
            // Recipes in the later categories (Energy onward, following
            // the sidebar's alphabetical order) were authored Y-up and
            // render upside-down in MZ's Y-down world — beams pointing
            // down, objects inverted. Flip them upright by default with a
            // π X-rotation wrapper; user tilt keyframes stack on top.
            const FLIP_CATEGORIES = ['Energy', 'Fire', 'Geometric', 'Interface', 'Object', 'Physical', 'Symbolic'];
            if (FLIP_CATEGORIES.includes(recipe.category)) {
                for (const n of layerNodes) {
                    // WhenCreating binds snapshot the parent transform at
                    // spawn — the flip would silently no-op (same rule as
                    // the tilt wrapper above).
                    if (n.commonValues.translationBindType === 1) n.commonValues.translationBindType = 2;
                    if (n.commonValues.rotationBindType === 1) n.commonValues.rotationBindType = 2;
                }
                layerNodes = [RR_EfkBuilder.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                    commonValues: { ...bindAlways, maxGeneration: 1, life: rf(36000) },
                    rotation: { type: 0, refEq: -1, rotation: v3(Math.PI, 0, 0) },
                    children: layerNodes,
                })];
            }

            // Layer opacity (Layers panel slider): scale every alpha in
            // the subtree. All color shapes (fixed/random/easing/fcurve)
            // store alpha as 'a' inside {r,g,b,a} leaves, so a deep walk
            // over the color-bearing keys covers every node type.
            const op = entry.opacity ?? 1;
            if (op < 1) {
                const COLOR_KEYS = ['allColor', 'outerColor', 'centerColor', 'innerColor',
                    'colorLeft', 'colorLeftMiddle', 'colorCenter', 'colorCenterMiddle',
                    'colorRight', 'colorRightMiddle'];
                const scaleA = (obj) => {
                    if (!obj || typeof obj !== 'object') return;
                    if (typeof obj.a === 'number') obj.a = Math.round(obj.a * op);
                    for (const v of Object.values(obj)) scaleA(v);
                };
                (function walkOp(list) {
                    for (const n of list) {
                        if (n.rendererParams) for (const k of COLOR_KEYS) scaleA(n.rendererParams[k]);
                        walkOp(n.children || []);
                    }
                })(layerNodes);
            }
            nodes.push(...layerNodes);
        }
        // Master duration: the WHOLE effect ends at this frame — in the
        // preview (loops there) and in the exported file.
        // Finite BURST stacks get a hard master duration (the exported
        // effect ends there). Continuous stacks stay endless in the sim —
        // "N frames" then means the seamless display loop length.
        if ((this._effectDuration || 0) > 0 && nodes.length && !this._stackMeta().continuous) {
            for (const n of nodes) n.commonValues.removeWhenParentIsRemoved = 1;
            const master = RR_EfkBuilder.makeNode(RR_EfkFormat.NODE_TYPE.NONE, {
                commonValues: { ...bindAlways, maxGeneration: 1, life: rf(this._effectDuration) },
                children: nodes,
            });
            return { textures, models, nodes: [master], kfTracks };
        }
        return { textures, models, nodes, kfTracks };
    }

    /**
     * Build the layer stack into .efkefc bytes. Per-keyframe orientation
     * is baked onto each layer's wrapper by _composeStack, so preview and
     * export share the exact same rotation — no separate bake pass.
     */
    _buildBytes() {
        const composed = this._composeStack();
        this._lastComposed = composed;   // redirect/export reuse the merge
        if (!composed.nodes.length) return null;
        const effect = RR_EfkBuilder.makeEffect({
            textures: composed.textures,
            models: composed.models.map(m => m.path),
            nodes: composed.nodes,
        });
        return RR_EfkFormat.writeEfkefc(effect);
    }

    /** Live-drag feedback: rotate the playing effect by the offset between
     *  the active keyframe's tilt and what's baked into the loaded effect.
     *  Zero at rest — the real rotation lives in the composed file. */
    _applyOrientation() {
        if (!this._efkHandle) return;
        const D2R = Math.PI / 180;
        const d = this._tiltDelta;
        try {
            this._efkHandle.setRotation(d.x * D2R, d.y * D2R, d.z * D2R);
        } catch (e) {}
    }

    // ── UI ───────────────────────────────────────────────────────────────

    renderInto(contentEl, projectController) {
        // Fresh DOM → the old canvas (and its GL context) is going away.
        this._teardownPreview();
        this._closeColorPicker();

        this.projectController = projectController;
        this.contentEl = contentEl;
        // Re-rendering must not jump the recipe list back to the top.
        const prevSidebar = contentEl.querySelector ? contentEl.querySelector('.rr-efk-sidebar') : null;
        this._sidebarScroll = prevSidebar ? prevSidebar.scrollTop : (this._sidebarScroll || 0);
        const categories = buildEfkRecipeCategories();

        let sidebarHtml = `<div style="padding: 8px 10px 2px;">
            <input class="rr-efk-search rr-input" type="text" placeholder="${this._t('efk.search')}"
                   value="${(this._searchTerm || '').replace(/"/g, '&quot;')}"
                   style="width: 100%; box-sizing: border-box; font-size: 11px; padding: 4px 8px;">
        </div>`;
        for (const [category, recipes] of categories) {
            sidebarHtml += `<div class="rr-efk-cat" style="padding: 8px 12px 4px; font-size: 9px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px;">${this._tx(category)}</div>`;
            for (const r of recipes) {
                const active = r.id === this._layer().recipeId;
                sidebarHtml += `
                    <div class="rr-efk-recipe" data-recipe-id="${r.id}" style="display: grid; grid-template-columns: 1fr 22px; align-items: center; gap: 8px; padding: 4px 10px 4px 14px; cursor: pointer; font-size: 12px; color: var(--color-text); background: ${active ? 'var(--color-bg-hover)' : 'transparent'}; border-left: 3px solid ${active ? 'var(--color-accent-bright)' : 'transparent'};">
                        <span style="min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this._tx(r.name)}</span>
                        <button class="rr-efk-addlayer rr-btn-chip" data-recipe-id="${r.id}" title="${this._t('efk.addStackLayer')}" style="width: 22px; height: 20px; padding: 0; font-size: 13px; line-height: 18px; text-align: center;">＋</button>
                    </div>`;
            }
        }

        const playIcon = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><polygon points="5,3 21,12 5,21"/></svg>';

        contentEl.innerHTML = `
            <div style="display: grid; grid-template-columns: 170px 1fr 250px; flex: 1; min-height: 0;">
                <div class="rr-efk-sidebar" style="background: var(--color-bg-panel); border-right: 1px solid var(--color-border); overflow-y: auto; padding-bottom: 8px;">
                    ${sidebarHtml}
                </div>
                <div style="display: flex; flex-direction: column; min-width: 0; background: var(--color-bg-surface); overflow-y: auto;">
                    <div style="flex: 1; display: flex; align-items: center; justify-content: center; min-height: 240px; padding: 12px;">
                        <div style="position: relative;">
                            <canvas class="rr-efk-canvas" width="720" height="720" style="width: min(100%, 74vh); aspect-ratio: 1 / 1; height: auto; border: 1px solid var(--color-border); border-radius: 4px; background: #000; display: block; cursor: grab;" title="${this._t('efk.orbitHint')}"></canvas>
                            <div class="rr-efk-overlay" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--color-text-muted); font-size: 12px; pointer-events: none; text-align: center; padding: 0 20px;"></div>
                        </div>
                    </div>
                    <div class="rr-efk-layerbar" style="padding: 8px 14px; border-top: 1px solid var(--color-border-subtle);"></div>
                    <div style="display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-top: 1px solid var(--color-border-subtle);">
                        <button class="rr-efk-play rr-btn-chip" style="padding: 4px 12px; display: inline-flex; align-items: center; gap: 5px;">${playIcon} ${this._t('efk.play')}</button>
                        <button class="rr-efk-replay rr-btn-chip" style="padding: 4px 12px;">↻ ${this._t('efk.replay')}</button>
                        <button class="rr-efk-resetview rr-btn-chip" style="padding: 4px 12px;">⌂ ${this._t('efk.resetView')}</button>
                        <label style="display: inline-flex; align-items: center; gap: 5px; font-size: 11px; color: var(--color-text-muted);" title="${this._t('efk.effectDurationHint')}">${this._t('efk.framesLabel')}
                            <input class="rr-efk-duration rr-input" type="number" min="0" max="3600" step="10" value="${this._effectDuration || ''}" placeholder="∞" style="width: 64px; font-size: 11px; padding: 3px 5px;">
                        </label>
                        <span class="rr-efk-frame" style="font-size: 11px; color: var(--color-text-muted); min-width: 76px;"></span>
                        <span class="rr-efk-status" style="font-size: 11px; color: var(--color-text-muted); flex: 1; text-align: right;"></span>
                        <input class="rr-efk-name rr-input" type="text" placeholder="${this._t('efk.effectName')}" style="width: 150px; font-size: 12px; padding: 5px 8px;">
                        <button class="rr-efk-export rr-btn-chip" style="padding: 5px 14px; font-size: 12px; font-weight: 700; color: var(--color-accent-bright); border-color: var(--color-accent-border-strong); white-space: nowrap;">${this._t('efk.export')}</button>
                    </div>
                </div>
                <div style="background: var(--color-bg-panel); border-left: 1px solid var(--color-border); overflow-y: auto; display: flex; flex-direction: column;">
                    <div style="padding: 10px 14px 4px; font-size: 9px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px;">${this._t('efk.orientation')}</div>
                    <div style="display: flex; flex-direction: column; gap: 6px; align-items: center; padding: 4px 14px 10px; border-bottom: 1px solid var(--color-border-subtle);">
                        <canvas class="rr-efk-gizmo" width="148" height="148" style="cursor: grab; display: block; touch-action: none;"></canvas>
                        <button class="rr-efk-gizmo-reset rr-btn-chip" style="padding: 3px 10px; font-size: 10px;" title="Reset the active keyframe's orientation (tilts to 0)">Reset</button>
                    </div>
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 14px 4px;">
                        <span style="font-size: 9px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px;">${this._t('efk.parameters')}</span>
                        <button class="rr-efk-randomize rr-btn-chip" style="padding: 3px 10px; font-size: 10px;" title="${this._t('efk.randomize')}">🎲 ${this._t('efk.randomize')}</button>
                    </div>
                    <div style="display: flex; gap: 4px; align-items: center; padding: 2px 14px 6px;">
                        <select class="rr-efk-presets rr-input" style="flex: 1; font-size: 11px; padding: 3px 6px;"></select>
                        <button class="rr-efk-preset-save rr-btn-chip" title="${this._t('efk.savePreset')}" style="padding: 3px 8px; font-size: 10px;">＋</button>
                        <button class="rr-efk-preset-del rr-btn-chip" title="${this._t('efk.deletePreset')}" style="padding: 3px 8px; font-size: 10px;">✕</button>
                    </div>
                    <div class="rr-efk-params" style="padding: 4px 14px 14px; display: flex; flex-direction: column; gap: 10px;"></div>

                </div>
            </div>
        `;

        contentEl.querySelectorAll('.rr-efk-addlayer').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._stack.push({ recipeId: btn.dataset.recipeId, keyframes: [{}], activeKf: 0,
                                   start: 0, end: 0, opacity: 1, hidden: false });
                this._activeLayer = this._stack.length - 1;
                this._refreshAfterLayerChange();
                this._scheduleRebuild();
            });
        });
        contentEl.querySelectorAll('.rr-efk-recipe').forEach(el => {
            el.addEventListener('click', () => {
                const layer = this._layer();
                if (layer.recipeId !== el.dataset.recipeId) {
                    layer.recipeId = el.dataset.recipeId;
                    layer.keyframes = [{}];
                    layer.activeKf = 0;
                    layer.values = layer.keyframes[0];
                }
                this._refreshAfterLayerChange();
                this._scheduleRebuild();
            });
        });
        contentEl.querySelector('.rr-efk-play').addEventListener('click', () => this._togglePause());
        contentEl.querySelector('.rr-efk-replay').addEventListener('click', () => this._play());
        contentEl.querySelector('.rr-efk-resetview').addEventListener('click', () => {
            this._camYaw = 0; this._camPitch = 0; this._camDist = 10;
        });
        contentEl.querySelector('.rr-efk-export').addEventListener('click', () => this._export());
        contentEl.querySelector('.rr-efk-duration').addEventListener('input', (e) => {
            this._effectDuration = Math.max(0, Number(e.target.value) || 0);
            this._scheduleRebuild();
        });
        contentEl.querySelector('.rr-efk-randomize').addEventListener('click', () => this._randomize());
        contentEl.querySelector('.rr-efk-presets').addEventListener('change', (e) => this._applyPreset(e.target.value));
        contentEl.querySelector('.rr-efk-preset-save').addEventListener('click', () => this._savePreset());
        contentEl.querySelector('.rr-efk-preset-del').addEventListener('click', () => this._deletePreset());
        this._refreshPresetList();
        this._bindOrbitControls(contentEl.querySelector('.rr-efk-canvas'));

        const nameInput = contentEl.querySelector('.rr-efk-name');
        const recipe = this._recipe();
        if (recipe) nameInput.value = this._defaultExportName();

        const sidebarEl = contentEl.querySelector('.rr-efk-sidebar');
        if (sidebarEl) sidebarEl.scrollTop = this._sidebarScroll;

        const search = contentEl.querySelector('.rr-efk-search');
        if (search) {
            search.addEventListener('input', () => {
                this._searchTerm = search.value;
                this._filterSidebar();
            });
        }
        this._filterSidebar();

        this._renderLayerBar();
        this._renderParams();
        this._initGizmo();
        this._initPreview();
    }

    /**
     * Refresh everything that depends on the active layer WITHOUT tearing
     * down the preview (layer switches must not restart playback).
     */
    _refreshAfterLayerChange() {
        const layer = this._layer();
        this.contentEl.querySelectorAll('.rr-efk-recipe').forEach(el => {
            const active = el.dataset.recipeId === layer.recipeId;
            el.style.background = active ? 'var(--color-bg-hover)' : 'transparent';
            el.style.borderLeft = `3px solid ${active ? 'var(--color-accent-bright)' : 'transparent'}`;
        });
        this._renderLayerBar();
        this._renderParams();
        this._refreshPresetList();
        const nameInput = this.contentEl.querySelector('.rr-efk-name');
        if (nameInput) nameInput.value = this._defaultExportName();
    }

    /**
     * The LAYERS panel (AG-style, below the preview): one card per layer
     * with visibility, reorder, duplicate, delete, opacity and keyframe
     * chips. Click a card to select it — the right panel edits it.
     */
    _renderLayerBar() {
        const bar = this.contentEl && this.contentEl.querySelector('.rr-efk-layerbar');
        if (!bar) return;
        const header = `<div style="display: flex; justify-content: space-between; align-items: center; padding: 2px 2px 6px;">
            <span style="font-size: 9px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px;">${this._t('efk.layers')}</span>
            <span style="font-size: 10px; color: var(--color-text-muted);">${this._stack.length} ${this._stack.length === 1 ? this._t('efk.layerSingular') : this._t('efk.layerPlural')}</span>
        </div>`;
        const cards = this._stack.map((entry, i) => {
            const r = this._recipeOf(entry);
            const active = i === this._activeLayer;
            const kfs = entry.keyframes || [{}];
            this._normalizeKfTimes(entry);
            const kfChips = kfs.map((kf, k) =>
                `<button class="rr-efk-lp-kf rr-btn-chip" data-i="${i}" data-kf="${k}" title="${this._t('efk.kfAtFrame')} ${entry.kfTimes[k]}" style="padding: 1px 9px; font-size: 10px; ${active && k === (entry.activeKf || 0) ? 'color: var(--color-accent-bright); border-color: var(--color-accent-border-strong); font-weight: 700;' : ''}">${k + 1}</button>`
            ).join('');
            const kfFrameBox = `
                <span style="font-size: 10px; color: var(--color-text-muted);" title="${this._t('efk.kfFrameField')} ${(entry.activeKf || 0) + 1}">@</span>
                <input type="number" class="rr-efk-lp-kfframe rr-input" data-i="${i}" min="0" max="3600" step="1"
                       value="${entry.kfTimes[entry.activeKf || 0]}" title="${this._t('efk.kfFrameField')} ${(entry.activeKf || 0) + 1}"
                       style="width: 56px; font-size: 10px; padding: 1px 4px;">`;
            const btn = (cls, label, title) =>
                `<button class="${cls} rr-btn-chip" data-i="${i}" title="${title}" style="padding: 1px 7px; font-size: 10px;">${label}</button>`;
            return `<div class="rr-efk-lp-card" data-i="${i}" style="border: 1px solid ${active ? 'var(--color-accent-bright)' : 'var(--color-border-subtle)'}; border-radius: 4px; padding: 6px 8px; cursor: pointer; background: ${active ? 'var(--color-bg-hover)' : 'var(--color-bg-input-alt)'}; opacity: ${entry.hidden ? 0.55 : 1}; display: flex; flex-direction: column; gap: 5px;">
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px;">
                    <span style="display: inline-flex; gap: 7px; align-items: center; min-width: 0;">
                        ${btn('rr-efk-lp-eye', entry.hidden
                            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="opacity:.45"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
                            : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>', this._t('efk.layerVisible'))}
                        <span style="font-size: 12px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${entry.hidden ? 'opacity: 0.45;' : ''}">${r ? this._tx(r.name) : '?'}</span>
                        <span style="font-size: 10px; color: var(--color-text-muted); white-space: nowrap;">· ${r ? this._tx(r.category) : ''}</span>
                    </span>
                    <span style="display: inline-flex; gap: 4px; flex-shrink: 0;">
                        ${btn('rr-efk-lp-up', '▲', this._t('efk.moveUp'))}
                        ${btn('rr-efk-lp-down', '▼', this._t('efk.moveDown'))}
                        ${btn('rr-efk-lp-dup', '⧉', this._t('efk.dupLayer'))}
                        ${this._stack.length > 1 ? btn('rr-efk-lp-del', '✕', this._t('efk.removeStackLayer')) : ''}
                    </span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; border-top: 1px solid var(--color-border-subtle); padding-top: 5px;">
                    <span style="font-size: 9px; color: var(--color-text-muted);">α</span>
                    <input type="range" class="rr-efk-lp-alpha" data-i="${i}" min="0" max="1" step="0.01" value="${entry.opacity ?? 1}" style="flex: 1; min-width: 0;">
                    <span style="font-size: 9px; color: var(--color-text-muted); min-width: 32px; text-align: right;">${Math.round((entry.opacity ?? 1) * 100)}%</span>
                    <span style="font-size: 9px; color: var(--color-text-muted);">KF</span>
                    ${kfChips}
                    <button class="rr-efk-lp-kfadd rr-btn-chip" data-i="${i}" title="${this._t('efk.addKeyframe')}" style="padding: 1px 7px; font-size: 9px;">＋</button>
                    ${kfFrameBox}
                </div>
            </div>`;
        }).join('');
        bar.innerHTML = `<div style="max-width: 560px; margin: 0 auto; background: rgba(0, 0, 0, 0.45); border: 1px solid var(--color-border); border-radius: 6px; padding: 10px 12px;">` + header + `<div style="display: flex; flex-direction: column; gap: 6px;">${cards}</div></div>`;

        const stop = (fn) => (e) => { e.stopPropagation(); fn(e); };
        bar.querySelectorAll('.rr-efk-lp-card').forEach(card => {
            card.addEventListener('click', () => {
                this._activeLayer = +card.dataset.i;
                this._refreshAfterLayerChange();
            });
        });
        bar.querySelectorAll('.rr-efk-lp-eye').forEach(b => b.addEventListener('click', stop(() => {
            const e2 = this._stack[+b.dataset.i];
            e2.hidden = !e2.hidden;
            this._renderLayerBar();
            this._scheduleRebuild();
        })));
        const move = (i, d) => {
            const j = i + d;
            if (j < 0 || j >= this._stack.length) return;
            [this._stack[i], this._stack[j]] = [this._stack[j], this._stack[i]];
            if (this._activeLayer === i) this._activeLayer = j;
            else if (this._activeLayer === j) this._activeLayer = i;
            this._refreshAfterLayerChange();
            this._scheduleRebuild();
        };
        bar.querySelectorAll('.rr-efk-lp-up').forEach(b => b.addEventListener('click', stop(() => move(+b.dataset.i, -1))));
        bar.querySelectorAll('.rr-efk-lp-down').forEach(b => b.addEventListener('click', stop(() => move(+b.dataset.i, 1))));
        bar.querySelectorAll('.rr-efk-lp-dup').forEach(b => b.addEventListener('click', stop(() => {
            const src = this._stack[+b.dataset.i];
            this._stack.splice(+b.dataset.i + 1, 0, JSON.parse(JSON.stringify(src)));
            this._activeLayer = +b.dataset.i + 1;
            this._refreshAfterLayerChange();
            this._scheduleRebuild();
        })));
        bar.querySelectorAll('.rr-efk-lp-del').forEach(b => b.addEventListener('click', stop(() => {
            this._stack.splice(+b.dataset.i, 1);
            if (this._activeLayer >= this._stack.length) this._activeLayer = this._stack.length - 1;
            this._refreshAfterLayerChange();
            this._scheduleRebuild();
        })));
        bar.querySelectorAll('.rr-efk-lp-alpha').forEach(sl => {
            sl.addEventListener('click', (e) => e.stopPropagation());
            sl.addEventListener('input', () => {
                this._stack[+sl.dataset.i].opacity = Number(sl.value);
                this._scheduleRebuild();
            });
        });
        bar.querySelectorAll('.rr-efk-lp-kf').forEach(b => b.addEventListener('click', stop(() => {
            this._activeLayer = +b.dataset.i;
            this._layer().activeKf = +b.dataset.kf;
            this._refreshAfterLayerChange();
        })));
        bar.querySelectorAll('.rr-efk-lp-kfframe').forEach(inp => {
            inp.addEventListener('click', (e) => e.stopPropagation());
            inp.addEventListener('input', () => {
                const i = +inp.dataset.i;
                const entry = this._stack[i];
                this._normalizeKfTimes(entry);
                const v = Math.max(0, Number(inp.value) || 0);
                entry.kfTimes[entry.activeKf || 0] = v;
                // A single keyframe's frame IS the layer's entry point:
                // "this part kicks in at frame 100" — sync the delay.
                if (entry.keyframes.length === 1) entry.start = v;
                this._scheduleRebuild();
            });
            inp.addEventListener('change', () => this._renderLayerBar());
        });
        bar.querySelectorAll('.rr-efk-lp-kfadd').forEach(b => b.addEventListener('click', stop(() => {
            this._activeLayer = +b.dataset.i;
            const l = this._layer();
            l.keyframes.push(JSON.parse(JSON.stringify(l.keyframes[l.activeKf])));
            l.activeKf = l.keyframes.length - 1;
            if (!((l.end || 0) > (l.start || 0))) l.end = (l.start || 0) + (this._effectDuration || 120);
            this._refreshAfterLayerChange();
            this._scheduleRebuild();
        })));
    }

    /**
     * The same RotationGizmo3D widget the Animation Generator uses,
     * driving the ACTIVE KEYFRAME's orientation. Live drag shows the
     * change immediately via the handle-rotation delta; the debounced
     * rebuild bakes it into the effect (and tweens between keyframes).
     */
    _initGizmo() {
        if (this._gizmo) { this._gizmo.dispose(); this._gizmo = null; }
        const canvas = this.contentEl.querySelector('.rr-efk-gizmo');
        if (!canvas || typeof RotationGizmo3D === 'undefined') return;
        this._gizmo = new RotationGizmo3D(canvas, {
            onChange: (tx, ty, tz) => this._setActiveTilt(tx, ty, tz)
        });
        this._syncTiltUI();
        const resetBtn = this.contentEl.querySelector('.rr-efk-gizmo-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this._setActiveTilt(0, 0, 0);
                this._gizmo.setRotation(0, 0, 0);
            });
        }
    }

    /** Preview mouse controls: left-drag rotates the effect (synced with
     *  the gizmo), right/Shift-drag orbits the camera, wheel zooms. */
    _bindOrbitControls(canvas) {
        let mode = null, lastX = 0, lastY = 0;
        const wrap180 = (v) => ((v + 180) % 360 + 360) % 360 - 180;
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());
        canvas.addEventListener('mousedown', (e) => {
            mode = (e.button === 2 || e.shiftKey) ? 'camera' : 'effect';
            lastX = e.clientX; lastY = e.clientY;
            canvas.style.cursor = 'grabbing';
        });
        window.addEventListener('mousemove', (e) => {
            if (!mode) return;
            const dx = e.clientX - lastX, dy = e.clientY - lastY;
            lastX = e.clientX; lastY = e.clientY;
            if (mode === 'camera') {
                this._camYaw += dx * 0.01;
                this._camPitch += dy * 0.01;
                this._camPitch = Math.max(-1.55, Math.min(1.55, this._camPitch));
            } else {
                // Rotating the object IS editing the gizmo's orientation —
                // one shared state (the active keyframe), two input surfaces.
                const t = this._activeTilt();
                const tx = wrap180(t.x + dy * 0.5);
                const ty = wrap180(t.y + dx * 0.5);
                if (this._gizmo) this._gizmo.setRotation(tx, ty, t.z);
                this._setActiveTilt(tx, ty, t.z);
            }
        });
        window.addEventListener('mouseup', () => {
            mode = null;
            canvas.style.cursor = 'grab';
        });
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            this._camDist *= e.deltaY > 0 ? 1.1 : 1 / 1.1;
            // Floor keeps the camera OUTSIDE even large shapes — dollying
            // inside a wireframe reads as "rotation/zoom stopped working".
            this._camDist = Math.max(6, Math.min(60, this._camDist));
        }, { passive: false });
    }

    /** Column-major orbit view matrix: T(0,0,-dist) · Rx(pitch) · Ry(yaw). */
    _cameraMatrix() {
        const cy = Math.cos(this._camYaw), sy = Math.sin(this._camYaw);
        const cp = Math.cos(this._camPitch), sp = Math.sin(this._camPitch);
        // R = Rx(pitch) · Ry(yaw), then translate along -Z.
        return [
            cy,        sp * sy,   -cp * sy,  0,
            0,         cp,         sp,       0,
            sy,       -sp * cy,    cp * cy,  0,
            0,         0,         -this._camDist, 1,
        ];
    }

    _renderParams() {
        const recipe = this._recipe();
        const host = this.contentEl.querySelector('.rr-efk-params');
        if (!recipe || !host) return;
        const values = this._params();

        const layer = this._layer();
        const kfChips = layer.keyframes.map((kf, i) =>
            `<button class="rr-efk-kf rr-btn-chip" data-kf="${i}" title="${this._t('efk.kfAtFrame')} ${layer.kfTimes[i]}" style="padding: 2px 10px; font-size: 10px; ${i === layer.activeKf ? 'color: var(--color-accent-bright); border-color: var(--color-accent-border-strong); font-weight: 700;' : ''}">${i + 1}</button>`
        ).join('');
        const kfFrameRow = `
            <div style="display: flex; align-items: center; gap: 8px; margin-top: 5px;">
                <label style="font-size: 10px; color: var(--color-accent-bright); font-weight: 700; flex: 1; white-space: nowrap;">${this._t('efk.kfFrameField')} ${layer.activeKf + 1}:</label>
                <input type="number" class="rr-efk-kf-frame rr-input" min="0" max="3600" step="1" value="${layer.kfTimes[layer.activeKf]}" style="width: 72px; font-size: 11px; padding: 3px 6px;">
            </div>`;
        const dur = (layer.end || 0) > (layer.start || 0) ? layer.end - (layer.start || 0) : 0;
        const timingHtml = `<div style="border: 1px solid var(--color-border-subtle); border-radius: 4px; padding: 8px; display: flex; flex-direction: column; gap: 8px;">
            <span style="font-size: 9px; font-weight: 700; color: var(--color-accent-bright); text-transform: uppercase; letter-spacing: 0.5px;">${this._t('efk.timing')}</span>
            <div style="display: flex; align-items: center; gap: 8px;">
                <label style="font-size: 10px; color: var(--color-text-muted); flex: 1; white-space: nowrap;">${this._t('efk.delay')}</label>
                <input type="number" data-timing="start" min="0" max="600" step="1" value="${layer.start || 0}" class="rr-input" style="width: 72px; font-size: 11px; padding: 3px 6px;">
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <label style="font-size: 10px; color: var(--color-text-muted); flex: 1; white-space: nowrap;">${this._t('efk.durationShort')}</label>
                <input type="number" data-timing="duration" min="0" max="1200" step="1" value="${dur}" class="rr-input" style="width: 72px; font-size: 11px; padding: 3px 6px;">
            </div>
            <div><label style="font-size: 10px; color: var(--color-text-muted); display: block; margin-bottom: 3px;">${this._t('efk.keyframes')}</label>
                <div style="display: flex; gap: 4px; flex-wrap: wrap; align-items: center;">
                    ${kfChips}
                    <button class="rr-efk-kf-add rr-btn-chip" title="${this._t('efk.addKeyframe')}" style="padding: 2px 8px; font-size: 10px;">＋</button>
                    ${layer.keyframes.length > 1 ? `<button class="rr-efk-kf-del rr-btn-chip" title="${this._t('efk.delKeyframe')}" style="padding: 2px 8px; font-size: 10px;">−</button>` : ''}
                </div>
                ${kfFrameRow}
                ${layer.keyframes.length > 1 ? `<div style="font-size: 10px; color: var(--color-accent-bright); margin-top: 4px; font-weight: 700;">${this._t('efk.editingKf')} ${layer.activeKf + 1} / ${layer.keyframes.length}</div>` : ''}
            </div>
        </div>`;

        host.innerHTML = timingHtml + recipe.params.map(s => {
            const v = values[s.key];
            if (s.type === 'layers') return this._renderLayerCards(recipe);
            const label = `<label style="font-size: 11px; color: var(--color-text-muted); display: block; margin-bottom: 3px;">${this._tx(s.label)}</label>`;
            if (s.type === 'color') {
                return `<div>${label}<button type="button" class="rr-color-swatch-btn rr-efk-color" data-ckey="${s.key}" title="Click to choose color" style="background: ${v}; width: 100%; height: 26px; display: block;"></button></div>`;
            }
            if (s.type === 'toggle') {
                return `<div style="display: flex; align-items: center; gap: 8px;"><input type="checkbox" data-param="${s.key}" ${v ? 'checked' : ''} style="cursor: pointer;"><span style="font-size: 11px; color: var(--color-text-muted);">${this._tx(s.label)}</span></div>`;
            }
            if (s.type === 'select') {
                const opts = s.options.map(o => `<option value="${o.value}" ${o.value === v ? 'selected' : ''}>${this._tx(o.label)}</option>`).join('');
                return `<div>${label}<select data-param="${s.key}" class="rr-input" style="width: 100%; font-size: 12px; padding: 4px 6px;">${opts}</select></div>`;
            }
            if (s.type === 'texture') {
                // AG-style texture picker: filename display + pick + clear.
                // The picked file is copied into <project>/effects/Texture/.
                return `<div>${label}
                    <div style="display: flex; gap: 4px; align-items: center;">
                        <div data-tex-name="${s.key}" style="flex: 1; padding: 4px 8px; background: var(--color-bg-input-alt); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 11px; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${v || '(none)'}</div>
                        <button class="rr-efk-tex-pick rr-btn-chip" data-key="${s.key}" title="Pick texture image (copied into effects/Texture/)" style="padding: 4px 10px; font-size: 11px;">…</button>
                        <button class="rr-efk-tex-clear rr-btn-chip" data-key="${s.key}" title="Clear (use built-in texture)" style="padding: 4px 8px; font-size: 11px;">✕</button>
                    </div>
                </div>`;
            }
            return `<div>${label}<div style="display: flex; align-items: center; gap: 8px;"><input type="range" data-param="${s.key}" min="${s.min}" max="${s.max}" step="${s.step || 1}" value="${v}" style="flex: 1;"><span data-param-value="${s.key}" style="font-size: 11px; color: var(--color-text); min-width: 26px; text-align: right;">${v}</span></div></div>`;
        }).join('');

        const kfFrameInput = host.querySelector('.rr-efk-kf-frame');
        if (kfFrameInput) {
            kfFrameInput.addEventListener('input', () => {
                const l = this._layer();
                const v = Math.max(0, Number(kfFrameInput.value) || 0);
                l.kfTimes[l.activeKf] = v;
                if (l.keyframes.length === 1) l.start = v;
                this._renderLayerBar();
                this._scheduleRebuild();
            });
            kfFrameInput.addEventListener('change', () => this._renderParams());
        }
        host.querySelectorAll('.rr-efk-kf').forEach(btn => {
            btn.addEventListener('click', () => {
                this._layer().activeKf = +btn.dataset.kf;
                this._renderParams();   // params panel now edits that keyframe
            });
        });
        const kfAdd = host.querySelector('.rr-efk-kf-add');
        if (kfAdd) kfAdd.addEventListener('click', () => {
            const l = this._layer();
            l.keyframes.push(JSON.parse(JSON.stringify(l.keyframes[l.activeKf])));
            l.activeKf = l.keyframes.length - 1;
            // The transition needs a defined window — surface it in the
            // Duration field; default to the master frame count. The new
            // keyframe lands at the window's end.
            if (!((l.end || 0) > (l.start || 0))) l.end = (l.start || 0) + (this._effectDuration || 120);
            this._normalizeKfTimes(l);
            l.kfTimes[l.activeKf] = l.end;
            this._renderParams();
            this._renderLayerBar();
            this._scheduleRebuild();
        });
        const kfDel = host.querySelector('.rr-efk-kf-del');
        if (kfDel) kfDel.addEventListener('click', () => {
            const l = this._layer();
            if (l.keyframes.length <= 1) return;
            l.keyframes.splice(l.activeKf, 1);
            if (Array.isArray(l.kfTimes)) l.kfTimes.splice(l.activeKf, 1);
            l.activeKf = Math.max(0, l.activeKf - 1);
            // Back to a single keyframe: drop the transition window so the
            // layer is endless again — a leftover window kills/respawns
            // continuous effects every cycle (reads as skipping).
            if (l.keyframes.length === 1 && !(l.start > 0)) l.end = 0;
            this._renderParams();
            this._renderLayerBar();
            this._scheduleRebuild();
        });

        host.querySelectorAll('[data-timing]').forEach(input => {
            input.addEventListener('input', () => {
                const l = this._layer();
                const v = Math.max(0, Number(input.value) || 0);
                if (input.dataset.timing === 'start') {
                    const dur2 = (l.end || 0) > (l.start || 0) ? l.end - (l.start || 0) : 0;
                    l.start = v;
                    if (dur2 > 0) l.end = v + dur2;   // delay shifts the window
                } else {
                    l.end = v > 0 ? (l.start || 0) + v : 0;   // duration (0 = endless)
                }
                this._scheduleRebuild();
            });
        });

        host.querySelectorAll('[data-param]').forEach(input => {
            input.addEventListener('input', () => {
                const key = input.dataset.param;
                const schema = recipe.params.find(s => s.key === key);
                let value;
                if (schema.type === 'toggle') value = input.checked;
                else if (schema.type === 'color' || schema.type === 'select') value = input.value;
                else value = Number(input.value);
                if (schema.type === 'select' || schema.type === 'toggle') {
                    // STRUCTURAL param: keyframes must stay in lockstep or
                    // their node trees can't be paired for transitions.
                    for (const kf of this._layer().keyframes) kf[key] = value;
                } else {
                    this._values()[key] = value;
                }
                const badge = host.querySelector(`[data-param-value="${key}"]`);
                if (badge) badge.textContent = value;
                this._scheduleRebuild();
            });
        });

        host.querySelectorAll('.rr-efk-color').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const key = btn.dataset.ckey;
                this._openColorPicker(btn, this._values()[key] || '#ffffff', (hex) => {
                    this._values()[key] = hex;
                    this._scheduleRebuild();
                });
            });
        });

        this._wireLayerCards(recipe, host);

        host.querySelectorAll('.rr-efk-tex-pick').forEach(btn => {
            btn.addEventListener('click', () => this._pickTexture(btn.dataset.key));
        });
        host.querySelectorAll('.rr-efk-tex-clear').forEach(btn => {
            btn.addEventListener('click', () => {
                this._values()[btn.dataset.key] = '';
                const nameEl = host.querySelector(`[data-tex-name="${btn.dataset.key}"]`);
                if (nameEl) nameEl.textContent = '(none)';
                this._scheduleRebuild();
            });
        });

        // Every path that changes the active layer/keyframe re-renders this
        // panel, so syncing HERE (instead of in each handler) guarantees the
        // gizmo always shows the active keyframe's stored orientation.
        this._syncTiltUI();
    }

    /**
     * AG-style texture pick: copy the chosen image into the project's
     * effects/Texture/ (the engine's texture root for effects) and store
     * the basename as the param value. PNG/JPEG only — those are the
     * formats the Effekseer runtime's image loader accepts.
     */
    _pickTexture(key) {
        const recipe = this._recipe();
        const project = this.projectController && this.projectController.getCurrentProject();
        if (!recipe) return;
        if (!project) { this._status(this._t('efk.noProject'), true); return; }

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/png,image/jpeg';
        input.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            try {
                const fs = require('fs');
                const path = require('path');
                // Hash-stamp the copied filename: the runtime caches
                // textures by PATH, so re-using a name would show the old
                // pixels until restart.
                const raw = fs.readFileSync(file.path);
                let h = 5381;
                for (let i = 0; i < raw.length; i += 997) h = ((h << 5) + h + raw[i]) >>> 0;
                const ext = path.extname(file.path);
                const stem = path.basename(file.path, ext).replace(/[^A-Za-z0-9_-]/g, '');
                const baseName = `${stem}_${h.toString(36)}${ext}`;
                const destDir = path.join(project.path, 'effects', 'Texture');
                fs.mkdirSync(destDir, { recursive: true });
                const destPath = path.join(destDir, baseName);
                if (!fs.existsSync(destPath)) fs.writeFileSync(destPath, raw);
                this._customTexCache.delete(baseName);   // re-read fresh bytes
                // Per-KEYFRAME texture: differing textures across keyframes
                // compile to a cross-fade (earth dissolves into mars).
                this._values()[key] = baseName;
                // A texture only visibly wraps the shape in Solid style —
                // on a wireframe it just tints the struts. Flip the Style
                // dropdown so picking a texture "just works".
                const styleParam = recipe.params.find(s =>
                    s.key === 'style' && s.type === 'select' &&
                    s.options.some(o => o.value === 'solid'));
                if (styleParam) this._values().style = 'solid';
                this._renderParams();   // refresh dropdown + texture name
                this._scheduleRebuild();
            } catch (err) {
                console.error('EffekseerGenerator: texture pick failed:', err);
                this._status(`${this._t('efk.exportFailed')}: ${err.message}`, true);
            }
        });
        input.click();
    }

    /**
     * Interface recipes declare `bake`: the standard Animation Generator's
     * actual render function is rendered frame-by-frame into a sprite-sheet
     * texture, which the effect plays back via UV animation (type 2). That
     * gives pixel parity with the 2D originals for panel/HUD animations.
     * @returns {{canvas, dataUrl}|null} cached by recipe + mapped AG params
     */
    _bakedSheet(recipe, params) {
        if (!recipe.bake || typeof RR_ANIMATION_REGISTRY === 'undefined') return null;
        const bake = recipe.bake;
        const anim = RR_ANIMATION_REGISTRY.find(a => a.id === bake.animationId);
        if (!anim) return null;

        const agParams = {};
        for (const s of anim.params) agParams[s.key] = s.default;
        Object.assign(agParams, bake.map ? bake.map(params) : {});

        const key = `${recipe.id}|${JSON.stringify(agParams)}`;
        if (!(this._bakeCache instanceof Map)) this._bakeCache = new Map();
        if (this._bakeCache.has(key)) return this._bakeCache.get(key);

        const frames = bake.frames || 64;
        const cell = bake.cell || 128;
        const cols = bake.cols || 8;
        const rows = Math.ceil(frames / cols);
        const sheet = document.createElement('canvas');
        sheet.width = cols * cell;
        sheet.height = rows * cell;
        const sctx = sheet.getContext('2d');
        const frameCanvas = document.createElement('canvas');
        frameCanvas.width = cell;
        frameCanvas.height = cell;
        const fctx = frameCanvas.getContext('2d');
        for (let i = 0; i < frames; i++) {
            fctx.clearRect(0, 0, cell, cell);
            try {
                anim.render(fctx, cell, cell, i, frames, agParams);
            } catch (e) {
                console.error(`EffekseerGenerator: bake frame ${i} of ${bake.animationId} failed:`, e);
            }
            sctx.drawImage(frameCanvas, (i % cols) * cell, Math.floor(i / cols) * cell);
        }
        const entry = { key, canvas: sheet, dataUrl: sheet.toDataURL('image/png') };
        this._bakeCache.set(key, entry);
        if (this._bakeCache.size > 8) this._bakeCache.delete(this._bakeCache.keys().next().value);
        return entry;
    }

    /** Data URL for a custom texture living at <project>/effects/Texture/<name>. */
    _customTextureDataUrl(baseName) {
        if (!this._customTexCache.has(baseName)) {
            const project = this.projectController && this.projectController.getCurrentProject();
            if (!project) return null;
            try {
                const fs = require('fs');
                const path = require('path');
                const bytes = fs.readFileSync(path.join(project.path, 'effects', 'Texture', baseName));
                const mime = /\.jpe?g$/i.test(baseName) ? 'image/jpeg' : 'image/png';
                this._customTexCache.set(baseName, `data:${mime};base64,${bytes.toString('base64')}`);
            } catch (e) {
                console.error('EffekseerGenerator: custom texture read failed:', e);
                return null;
            }
        }
        return this._customTexCache.get(baseName);
    }

    /**
     * Randomize the current recipe's parameters (the AG has the same
     * feature). Ranges land on their step grid, colors get a random hue
     * at pleasant saturation/lightness, selects/toggles roll the dice.
     * Texture params and anything in recipe.noRandomize are left alone.
     */
    _randomize() {
        const recipe = this._recipe();
        if (!recipe) return;
        const skip = new Set(recipe.noRandomize || []);
        const layer = this._layer();
        const onLaterKf = layer.keyframes.length > 1 && layer.activeKf > 0;
        const TWEENABLE = new Set(['size', 'opacity', 'spin', 'spinX', 'spinY', 'spinZ']);
        const vals = this._values();
        const hslHex = (h, sat, l) => {
            const f = (n) => {
                const k = (n + h / 30) % 12;
                const a = sat * Math.min(l, 1 - l);
                return Math.round(255 * (l - a * Math.max(-1, Math.min(1, Math.min(k - 3, 9 - k)))))
                    .toString(16).padStart(2, '0');
            };
            return `#${f(0)}${f(8)}${f(4)}`;
        };
        for (const s of recipe.params) {
            if (skip.has(s.key) || s.type === 'texture') continue;
            // On keyframe 2+ only roll values the compiler can TWEEN —
            // randomizing structure desyncs the keyframe trees and kills
            // the transition (looks like "randomize broke the sliders").
            if (onLaterKf && s.type !== 'color' && !(s.type === 'range' && TWEENABLE.has(s.key))) continue;
            if (s.type === 'range') {
                const step = s.step || 1;
                const raw = s.min + Math.random() * (s.max - s.min);
                vals[s.key] = Math.min(s.max, Math.max(s.min, Math.round(raw / step) * step));
                if (step < 1) vals[s.key] = +vals[s.key].toFixed(3);
            } else if (s.type === 'color') {
                vals[s.key] = hslHex(Math.random() * 360, 0.65 + Math.random() * 0.35, 0.5 + Math.random() * 0.25);
            } else if (s.type === 'toggle') {
                vals[s.key] = Math.random() < 0.5;
            } else if (s.type === 'select') {
                vals[s.key] = s.options[Math.floor(Math.random() * s.options.length)].value;
            }
        }
        this._renderParams();
        this._scheduleRebuild();
    }

    /** Filter the recipe sidebar by the search term (like the AG search). */
    _filterSidebar() {
        const sidebar = this.contentEl && this.contentEl.querySelector('.rr-efk-sidebar');
        if (!sidebar) return;
        const term = (this._searchTerm || '').trim().toLowerCase();
        let currentCat = null;
        let catHasMatch = false;
        const flushCat = () => {
            if (currentCat) currentCat.style.display = catHasMatch ? '' : 'none';
        };
        for (const el of sidebar.querySelectorAll('.rr-efk-cat, .rr-efk-recipe')) {
            if (el.classList.contains('rr-efk-cat')) {
                flushCat();
                currentCat = el;
                catHasMatch = false;
            } else {
                const match = !term || el.textContent.toLowerCase().includes(term);
                // 'grid', NOT '' — resetting display to '' erases the row's
                // inline grid layout and the ＋ button collapses onto the
                // text (this silently undid every alignment fix).
                el.style.display = match ? 'grid' : 'none';
                if (match) catHasMatch = true;
            }
        }
        flushCat();
    }

    // ── Composer: layer cards with keyframe timing ───────────────────────

    /** The composer's working layer array (copy-on-write from defaults). */
    _composerLayers(recipe) {
        const vals = this._values();
        if (!Array.isArray(vals.layers)) {
            vals.layers = JSON.parse(JSON.stringify(recipe.composer.defaults));
        }
        return vals.layers;
    }

    /**
     * Themed color picker popup — same look and behavior as the standard
     * Animation Generator page (hex field, saturation/value area, hue
     * strip; styled by the shared .rr-color-popup rules in theme.css).
     * Callback-based: onChange(hex) fires live as the user drags.
     */
    _openColorPicker(swatchEl, initialColor, onChange) {
        this._closeColorPicker();
        initialColor = (initialColor || '#ffffff').toUpperCase();

        const hexToRgb = (h) => {
            const t = h.replace('#', '');
            return [parseInt(t.substr(0, 2), 16), parseInt(t.substr(2, 2), 16), parseInt(t.substr(4, 2), 16)];
        };
        const rgbToHex = (r, g, b) => '#' + [r, g, b].map(c =>
            Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')
        ).join('').toUpperCase();
        const rgbToHsv = (r, g, b) => {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const v = max, d = max - min;
            const sat = max === 0 ? 0 : d / max;
            let h = 0;
            if (d !== 0) {
                if      (max === r) h = ((g - b) / d) % 6;
                else if (max === g) h = (b - r) / d + 2;
                else                h = (r - g) / d + 4;
                h *= 60;
                if (h < 0) h += 360;
            }
            return [h, sat, v];
        };
        const hsvToRgb = (h, sat, v) => {
            const c = v * sat;
            const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
            const m = v - c;
            let r = 0, g = 0, b = 0;
            if      (h < 60)  { r = c; g = x; }
            else if (h < 120) { r = x; g = c; }
            else if (h < 180) { g = c; b = x; }
            else if (h < 240) { g = x; b = c; }
            else if (h < 300) { r = x; b = c; }
            else              { r = c; b = x; }
            return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
        };

        let [r0, g0, b0] = hexToRgb(initialColor);
        let [curH, curS, curV] = rgbToHsv(r0, g0, b0);

        const popup = document.createElement('div');
        popup.className = 'rr-color-popup';
        popup.innerHTML = `
            <div class="rr-color-popup-row">
                <div class="rr-color-popup-preview" style="background: ${initialColor};"></div>
                <input type="text" class="rr-color-popup-hex" value="${initialColor}" maxlength="7" spellcheck="false">
            </div>
            <div class="rr-color-popup-sv">
                <div class="rr-color-popup-sv-cursor"></div>
            </div>
            <div class="rr-color-popup-hue">
                <div class="rr-color-popup-hue-cursor"></div>
            </div>
        `;
        document.body.appendChild(popup);

        const hexInput  = popup.querySelector('.rr-color-popup-hex');
        const preview   = popup.querySelector('.rr-color-popup-preview');
        const svArea    = popup.querySelector('.rr-color-popup-sv');
        const svCursor  = popup.querySelector('.rr-color-popup-sv-cursor');
        const hueStrip  = popup.querySelector('.rr-color-popup-hue');
        const hueCursor = popup.querySelector('.rr-color-popup-hue-cursor');

        const refreshSvBackground = () => {
            svArea.style.background =
                `linear-gradient(to bottom, transparent, #000), ` +
                `linear-gradient(to right, #fff, hsl(${curH}, 100%, 50%))`;
        };
        const positionCursors = () => {
            svCursor.style.left = `${curS * 100}%`;
            svCursor.style.top  = `${(1 - curV) * 100}%`;
            hueCursor.style.left = `${(curH / 360) * 100}%`;
        };
        const commit = (hex, source) => {
            preview.style.background = hex;
            swatchEl.style.background = hex;
            if (source !== 'hex') hexInput.value = hex;
            onChange(hex);
        };
        const applyHsv = (source) => {
            const [r, g, b] = hsvToRgb(curH, curS, curV);
            commit(rgbToHex(r, g, b), source);
        };
        const applyHex = (hex) => {
            if (!/^#[0-9a-f]{6}$/i.test(hex)) return;
            hex = hex.toUpperCase();
            const [r, g, b] = hexToRgb(hex);
            const [h, sat, v] = rgbToHsv(r, g, b);
            if (sat > 0.01) curH = h;   // keep hue steady on grayscale input
            curS = sat; curV = v;
            refreshSvBackground();
            positionCursors();
            commit(hex, 'hex');
        };

        refreshSvBackground();
        positionCursors();

        hexInput.addEventListener('input', () => {
            let v = hexInput.value.trim();
            if (v && v[0] !== '#') v = '#' + v;
            applyHex(v);
        });

        const drag = (area, apply) => {
            area.addEventListener('mousedown', (e) => {
                e.preventDefault();
                apply(e);
                const move = (ev) => apply(ev);
                const up = () => {
                    document.removeEventListener('mousemove', move);
                    document.removeEventListener('mouseup', up);
                };
                document.addEventListener('mousemove', move);
                document.addEventListener('mouseup', up);
            });
        };
        drag(svArea, (e) => {
            const rect = svArea.getBoundingClientRect();
            curS = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            curV = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
            positionCursors();
            applyHsv('sv');
        });
        drag(hueStrip, (e) => {
            const rect = hueStrip.getBoundingClientRect();
            curH = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 360;
            refreshSvBackground();
            positionCursors();
            applyHsv('hue');
        });

        const popW = popup.offsetWidth  || 232;
        const popH = popup.offsetHeight || 220;
        const rect = swatchEl.getBoundingClientRect();
        let px = rect.left + rect.width / 2 - popW / 2;
        let py = rect.bottom + 6;
        px = Math.max(8, Math.min(px, window.innerWidth  - popW - 8));
        py = Math.max(8, Math.min(py, window.innerHeight - popH - 8));
        popup.style.left = `${px}px`;
        popup.style.top  = `${py}px`;

        const closeHandler = (e) => {
            if (popup.contains(e.target) || e.target === swatchEl) return;
            this._closeColorPicker();
        };
        setTimeout(() => document.addEventListener('click', closeHandler), 0);
        popup._closeHandler = closeHandler;
        this._colorPopup = popup;
    }

    _closeColorPicker() {
        if (!this._colorPopup) return;
        if (this._colorPopup._closeHandler) {
            document.removeEventListener('click', this._colorPopup._closeHandler);
        }
        this._colorPopup.remove();
        this._colorPopup = null;
    }

    _renderLayerCards(recipe) {
        const layers = this._composerLayers(recipe);
        const { schemas, labels } = recipe.composer;
        const field = (idx, s, v) => {
            const lab = `<label style="font-size: 10px; color: var(--color-text-muted); display: block; margin-bottom: 2px;">${this._tx(s.label)}</label>`;
            const data = `data-lidx="${idx}" data-lkey="${s.key}"`;
            if (s.type === 'color') {
                return `<div>${lab}<button type="button" class="rr-color-swatch-btn rr-efk-lcolor" data-clidx="${idx}" data-clkey="${s.key}" title="Click to choose color" style="background: ${v}; width: 100%; height: 22px; display: block;"></button></div>`;
            }
            if (s.type === 'toggle') {
                return `<div style="display: flex; align-items: center; gap: 6px; padding-top: 12px;"><input type="checkbox" ${data} ${v ? 'checked' : ''} style="cursor: pointer;"><span style="font-size: 10px; color: var(--color-text-muted);">${this._tx(s.label)}</span></div>`;
            }
            if (s.type === 'select') {
                const opts = s.options.map(o => `<option value="${o.value}" ${o.value === v ? 'selected' : ''}>${this._tx(o.label)}</option>`).join('');
                return `<div>${lab}<select ${data} class="rr-input" style="width: 100%; font-size: 11px; padding: 2px 4px;">${opts}</select></div>`;
            }
            return `<div>${lab}<div style="display: flex; align-items: center; gap: 5px;"><input type="range" ${data} min="${s.min}" max="${s.max}" step="${s.step || 1}" value="${v}" style="flex: 1;"><span data-lval="${idx}:${s.key}" style="font-size: 10px; color: var(--color-text); min-width: 30px; text-align: right;">${v}</span></div></div>`;
        };

        const cards = layers.map((ly, idx) => {
            const schema = schemas[ly.kind];
            if (!schema) return '';
            const fields = schema.map(s => field(idx, s, ly[s.key] ?? s.default)).join('');
            return `<div style="border: 1px solid var(--color-border); border-radius: 4px; padding: 8px; display: flex; flex-direction: column; gap: 6px; background: var(--color-bg-surface);">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 11px; font-weight: 700; color: var(--color-accent-bright);">${idx + 1}. ${this._tx(labels[ly.kind] || ly.kind)}</span>
                    <span style="display: flex; gap: 4px;">
                        <button class="rr-efk-layer-dup rr-btn-chip" data-lidx="${idx}" title="${this._t('efk.dupLayer')}" style="padding: 1px 7px; font-size: 10px;">⧉</button>
                        <button class="rr-efk-layer-del rr-btn-chip" data-lidx="${idx}" title="${this._t('efk.delLayer')}" style="padding: 1px 7px; font-size: 10px;">✕</button>
                    </span>
                </div>
                ${fields}
            </div>`;
        }).join('');

        const addOpts = Object.keys(schemas)
            .map(k => `<option value="${k}">${this._tx(labels[k] || k)}</option>`).join('');
        return `${cards}
            <div style="display: flex; gap: 5px; align-items: center;">
                <select class="rr-efk-layer-add rr-input" style="flex: 1; font-size: 11px; padding: 3px 5px;">
                    <option value="">${this._t('efk.addLayer')}…</option>${addOpts}
                </select>
            </div>`;
    }

    _wireLayerCards(recipe, host) {
        if (!recipe.composer) return;
        const layers = this._composerLayers(recipe);
        const schemas = recipe.composer.schemas;

        host.querySelectorAll('[data-lkey]').forEach(input => {
            input.addEventListener('input', () => {
                const idx = +input.dataset.lidx;
                const key = input.dataset.lkey;
                const schema = (schemas[layers[idx].kind] || []).find(s => s.key === key);
                if (!layers[idx] || !schema) return;
                let value;
                if (schema.type === 'toggle') value = input.checked;
                else if (schema.type === 'color' || schema.type === 'select') value = input.value;
                else value = Number(input.value);
                layers[idx][key] = value;
                const badge = host.querySelector(`[data-lval="${idx}:${key}"]`);
                if (badge) badge.textContent = value;
                this._scheduleRebuild();
            });
        });
        host.querySelectorAll('.rr-efk-lcolor').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idx = +btn.dataset.clidx;
                const key = btn.dataset.clkey;
                if (!layers[idx]) return;
                this._openColorPicker(btn, layers[idx][key] || '#ffffff', (hex) => {
                    layers[idx][key] = hex;
                    this._scheduleRebuild();
                });
            });
        });
        host.querySelectorAll('.rr-efk-layer-del').forEach(btn => {
            btn.addEventListener('click', () => {
                layers.splice(+btn.dataset.lidx, 1);
                this._renderParams();
                this._scheduleRebuild();
            });
        });
        host.querySelectorAll('.rr-efk-layer-dup').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = +btn.dataset.lidx;
                layers.splice(idx + 1, 0, JSON.parse(JSON.stringify(layers[idx])));
                this._renderParams();
                this._scheduleRebuild();
            });
        });
        const add = host.querySelector('.rr-efk-layer-add');
        if (add) {
            add.addEventListener('change', () => {
                const kind = add.value;
                if (!kind || !schemas[kind]) return;
                const layer = { kind };
                for (const s of schemas[kind]) layer[s.key] = s.default;
                layers.push(layer);
                this._renderParams();
                this._scheduleRebuild();
            });
        }
    }

    // ── Presets: named parameter sets, stored per project ────────────────
    // <project>/forge/effekseer_generator/presets.json:
    //   { "<recipeId>": { "<presetName>": { param: value, … } } }

    _presetFile() {
        const project = this.projectController && this.projectController.getCurrentProject();
        if (!project) return null;
        const path = require('path');
        return path.join(project.path, 'forge', 'effekseer_generator', 'presets.json');
    }

    _loadPresets() {
        const file = this._presetFile();
        if (!file) return {};
        try {
            return JSON.parse(require('fs').readFileSync(file, 'utf8'));
        } catch (e) {
            return {};
        }
    }

    _writePresets(all) {
        const file = this._presetFile();
        if (!file) { this._status(this._t('efk.noProject'), true); return false; }
        try {
            const fs = require('fs');
            const path = require('path');
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, JSON.stringify(all, null, 2));
            return true;
        } catch (e) {
            console.error('EffekseerGenerator: preset write failed:', e);
            this._status(String(e.message), true);
            return false;
        }
    }

    _refreshPresetList(selected = '') {
        const sel = this.contentEl && this.contentEl.querySelector('.rr-efk-presets');
        const recipe = this._recipe();
        if (!sel || !recipe) return;
        const names = Object.keys(this._loadPresets()[recipe.id] || {}).sort();
        sel.innerHTML = [
            `<option value="">${this._t('efk.presets')}…</option>`,
            ...names.map((n) => `<option value="${n.replace(/"/g, '&quot;')}" ${n === selected ? 'selected' : ''}>${n}</option>`),
        ].join('');
    }

    _applyPreset(name) {
        const recipe = this._recipe();
        if (!recipe || !name) return;
        const preset = (this._loadPresets()[recipe.id] || {})[name];
        if (!preset) return;
        const target = this._values();
        for (const k of Object.keys(target)) delete target[k];
        Object.assign(target, preset);
        this._renderParams();
        this._scheduleRebuild();
    }

    _savePreset() {
        const recipe = this._recipe();
        if (!recipe) return;
        const name = (prompt(this._t('efk.presetName'), '') || '').trim();
        if (!name) return;
        const all = this._loadPresets();
        if (!all[recipe.id]) all[recipe.id] = {};
        all[recipe.id][name] = { ...this._params() };
        if (this._writePresets(all)) {
            this._refreshPresetList(name);
            this._status(`${this._t('efk.presetSaved')} "${name}"`);
        }
    }

    _deletePreset() {
        const recipe = this._recipe();
        const sel = this.contentEl.querySelector('.rr-efk-presets');
        if (!recipe || !sel || !sel.value) return;
        const all = this._loadPresets();
        if (all[recipe.id]) {
            delete all[recipe.id][sel.value];
            if (this._writePresets(all)) this._refreshPresetList();
        }
    }

    _defaultExportName() {
        const names = this._stack
            .map(e => this._recipeOf(e))
            .filter(Boolean)
            .map(r => r.name.replace(/[^A-Za-z0-9]/g, ''));
        return names.length ? [...new Set(names)].join('_').slice(0, 48) : 'Effect';
    }

    _status(msg, isError = false) {
        const el = this.contentEl && this.contentEl.querySelector('.rr-efk-status');
        if (el) {
            el.textContent = msg;
            el.style.color = isError ? '#ff6666' : 'var(--color-text-muted)';
        }
    }

    /** Message centered on the preview canvas ('' to clear). */
    _overlay(msg, isError = false) {
        const el = this.contentEl && this.contentEl.querySelector('.rr-efk-overlay');
        if (el) {
            el.textContent = msg;
            el.style.color = isError ? '#ff6666' : 'var(--color-text-muted)';
        }
    }

    _updatePlayButton() {
        const btn = this.contentEl && this.contentEl.querySelector('.rr-efk-play');
        if (!btn) return;
        const playIcon = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><polygon points="5,3 21,12 5,21"/></svg>';
        const pauseIcon = '<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><rect x="5" y="4" width="4.5" height="16" rx="0.5"/><rect x="14.5" y="4" width="4.5" height="16" rx="0.5"/></svg>';
        btn.innerHTML = this._playing
            ? `${pauseIcon} ${this._t('efk.pause')}`
            : `${playIcon} ${this._t('efk.play')}`;
    }

    // ── Preview ──────────────────────────────────────────────────────────

    _teardownPreview() {
        this._generation++;
        this._playing = false;
        if (this._gizmo) { this._gizmo.dispose(); this._gizmo = null; }
        if (this._rafId) { cancelAnimationFrame(this._rafId); this._rafId = null; }
        clearTimeout(this._rebuildTimer);
        clearTimeout(this._replayTimer);
        clearTimeout(this._watchdogTimer);
        if (this._efkHandle) {
            try { this._efkHandle.stop(); } catch (e) {}
            this._efkHandle = null;
        }
        if (this._efkContext) {
            // Let the runtime destroy the stopped instances before any
            // effect memory is freed (see _retireEffect).
            try { this._ctxUpdate(); this._ctxUpdate(); } catch (e) {}
            this._retireEffect(this._efkEffect);
            this._efkEffect = null;
            this._flushRetired(true);
            try { this._efkContext.release(); } catch (e) {}
            this._efkContext = null;
        }
        this._retiredEffects = [];
        this._gl = null;
    }

    _initPreview() {
        const canvas = this.contentEl.querySelector('.rr-efk-canvas');
        if (typeof effekseer === 'undefined' || !window._effekseerReady) {
            this._overlay(this._t('efk.runtimeUnavailable'), true);
            // Poll briefly — the runtime finishes init shortly after editor boot.
            const gen = this._generation;
            let retries = 0;
            const poll = () => {
                if (gen !== this._generation) return;
                if (window._effekseerReady) { this._initPreview(); return; }
                if (++retries < 20) setTimeout(poll, 500);
            };
            setTimeout(poll, 500);
            return;
        }
        try {
            const gl = canvas.getContext('webgl', { premultipliedAlpha: false, alpha: false }) ||
                       canvas.getContext('experimental-webgl', { premultipliedAlpha: false, alpha: false });
            if (!gl) { this._overlay('WebGL unavailable', true); return; }
            this._gl = gl;
            this._efkContext = effekseer.createContext();
            this._efkContext.init(gl);
            this._efkContext.setRestorationOfStatesFlag(false);
        } catch (e) {
            console.error('EffekseerGenerator: context init failed:', e);
            this._overlay('Effekseer init failed', true);
            return;
        }
        this._startLoop(canvas);
        this._loadCurrentEffect();
    }

    _scheduleRebuild() {
        clearTimeout(this._rebuildTimer);
        this._rebuildTimer = setTimeout(() => this._loadCurrentEffect(), 180);
    }

    /**
     * Build + load the current recipe in the BACKGROUND and swap it in when
     * loaded. The currently-playing effect keeps running meanwhile, so
     * slider drags read as live regeneration instead of a pause.
     */
    _loadCurrentEffect() {
        if (!this._efkContext) return;
        const recipe = this._recipe();
        if (!recipe) return;

        const gen = ++this._generation;
        clearTimeout(this._watchdogTimer);

        let bytes, params;
        try {
            params = this._params();
            bytes = this._buildBytes();
        } catch (e) {
            console.error('EffekseerGenerator: build failed:', e);
            this._overlay(`${this._t('efk.buildFailed')}: ${e.message}`, true);
            this._status(String(e.message), true);
            return;
        }
        if (!bytes) {
            // Nothing visible (all layers hidden) — clear the stage.
            if (this._efkHandle) {
                try { this._efkHandle.stop(); } catch (e) {}
                this._efkHandle = null;
            }
            this._retireEffect(this._efkEffect);
            this._efkEffect = null;
            this._playing = false;
            this._updatePlayButton();
            return;
        }

        // Stack-wide playback traits (continuous / prewarm) + seamless
        // loop length (only meaningful for a single seamless layer).
        this._stackFlags = this._stackMeta();
        // Windowed / keyframed layers must start from frame 0 — prewarming
        // fast-forwards into the middle of the first transition window, so
        // the first cycle differs from every later one (reads as a skip).
        const anyWindowed = this._stack.some(e =>
            (e.end || 0) > (e.start || 0) || (e.keyframes && e.keyframes.length > 1));
        if (anyWindowed) this._stackFlags.prewarm = 0;
        if ((this._effectDuration || 0) > 0 && !this._stackFlags.continuous) {
            this._loopFrames = this._effectDuration;   // bursts restart at the set length
            this._stackFlags.prewarm = 0;
        } else {
            this._loopFrames = (this._stack.length === 1 && recipe.seamless && params.life) ? params.life : 0;
        }

        // Textures resolve in-memory: the .efkefc references
        // Texture/rr_<name>.png; redirect maps those onto data URLs.
        //
        // The '#.png' fragment is load-bearing: the runtime's _loadResource
        // sniffs the file EXTENSION of the redirected path to pick a loading
        // strategy — no ".png" at the end means it XHRs an ArrayBuffer and
        // hands that to texImage2D, which throws "Overload resolution
        // failed". A URL fragment survives the extension check but is
        // stripped by Chromium before base64 decoding, so the image loads
        // through the proper Image() path.
        // Models redirect to plain binary data URLs — the binary branch is
        // the extension-sniffer's fallback, so no fragment trick needed.
        // Custom (user-uploaded) textures are read from the project's
        // effects/Texture/ and served as data URLs too.
        // Per-layer baked sheets: map each baked texture path to its
        // owning layer's (recipe, params) so redirect can bake the right
        // sheet even when several layers bake.
        const models = (this._lastComposed && this._lastComposed.models) || [];
        const bakeOwners = new Map();
        for (const entry of this._stack) {
            const r = this._recipeOf(entry);
            if (!r || !r.bake) continue;
            const lp = RR_EfkRecipeUtil.resolveParams(r, entry.values);
            for (const t of this._resolveTextures(r, lp)) {
                if (/rr_bake_/.test(t)) bakeOwners.set(t, { recipe: r, params: lp });
            }
        }
        const redirect = (path) => {
            // Baked AG sprite sheets before the generic rr_*.png match —
            // their names are also rr_-prefixed.
            for (const [bakePath, owner] of bakeOwners) {
                if (path.endsWith(bakePath)) {
                    const baked = this._bakedSheet(owner.recipe, owner.params);
                    if (baked) return baked.dataUrl + '#.png';
                }
            }
            const builtin = /rr_([a-z0-9_]+)\.png$/i.exec(path);
            if (builtin) return RR_EfkTextures.dataUrl(builtin[1]) + '#.png';
            const model = models.find(md => path.endsWith(md.path));
            if (model) return model.dataUrl;
            const custom = /Texture\/([^/]+\.(?:png|jpe?g))$/i.exec(path);
            if (custom) {
                const url = this._customTextureDataUrl(custom[1]);
                if (url) return url + '#.png';
            }
            return path;
        };

        if (!this._efkEffect) this._overlay(this._t('efk.loading'));

        // Watchdog: if neither onload nor onerror fires (a texture that
        // never decodes, a runtime stall), say so instead of sitting on
        // "loading effect" forever.
        this._watchdogTimer = setTimeout(() => {
            if (gen === this._generation) {
                this._overlay(this._t('efk.loadFailed'), true);
                this._status('Load timed out — check console, tweak a slider to retry', true);
            }
        }, 8000);

        // CRITICAL timing quirk (headless-harness verified): when every
        // resource path is already cached by the WASM core — the COMMON
        // case for a slider rebuild, since the rebuilt effect reuses the
        // same texture/model paths — the core requests nothing from JS and
        // onload fires SYNCHRONOUSLY inside loadEffect(), before `pending`
        // is assigned. Swapping then installed a null effect and the
        // preview sat on "loading effect" forever ("sliders break the
        // animation"). Handle both timings explicitly.
        let pending = null;
        let syncLoaded = false;
        const finish = () => {
            if (gen !== this._generation) {
                // A newer rebuild superseded this one.
                try { this._efkContext && pending && this._efkContext.releaseEffect(pending); } catch (e) {}
                return;
            }
            clearTimeout(this._watchdogTimer);
            this._swapEffect(pending);
        };
        try {
            pending = this._efkContext.loadEffect(
                bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
                1.0,
                () => { if (pending) finish(); else syncLoaded = true; },
                (msg, p) => {
                    console.error('EffekseerGenerator: effect load failed:', msg, p);
                    if (gen === this._generation) {
                        clearTimeout(this._watchdogTimer);
                        this._overlay(this._t('efk.loadFailed'), true);
                        this._status(String(msg), true);
                    }
                },
                redirect
            );
        } catch (e) {
            console.error('EffekseerGenerator: loadEffect threw:', e);
            clearTimeout(this._watchdogTimer);
            this._overlay(this._t('efk.loadFailed'), true);
            this._status(String(e.message), true);
            return;
        }
        if (syncLoaded) finish();
        const visLayers = this._stack.filter(e => !e.hidden).length;
        const tracks = (this._lastComposed && this._lastComposed.kfTracks) || 0;
        this._status(`${bytes.byteLength} B · ${visLayers}L · ${tracks} KF tracks · r16`);
    }

    /** Retire the old effect and start the new one — mid-playback. */
    _swapEffect(next) {
        if (this._efkHandle) {
            try { this._efkHandle.stop(); } catch (e) {}
            this._efkHandle = null;
        }
        this._retireEffect(this._efkEffect);   // deferred — never free mid-stop
        this._efkEffect = next;
        // The incoming effect has the current tilts baked in — the live
        // drag delta is now covered by the file itself.
        this._displayTilt = this._activeTilt();
        this._tiltDelta = { x: 0, y: 0, z: 0 };
        try {
            this._play();
        } catch (e) {
            // _play runs inside the runtime's load callback; an exception
            // here would otherwise vanish and leave the UI on "loading".
            console.error('EffekseerGenerator: play after swap failed:', e);
            this._status(`Preview error: ${e.message || e}`, true);
        }
    }

    _togglePause() {
        if (this._playing) {
            this._playing = false;
        } else if (this._efkHandle && this._efkHandle.exists) {
            this._playing = true;       // resume mid-effect
        } else {
            this._play();               // restart from frame 0
        }
        this._updatePlayButton();
    }

    _play() {
        if (!this._efkContext || !this._efkEffect || !this._efkEffect.isLoaded) {
            this._overlay(this._t('efk.loading'));
            return;
        }
        clearTimeout(this._replayTimer);
        this._overlay('');
        if (this._efkHandle) {
            try { this._efkHandle.stop(); } catch (e) {}
        }
        this._frame = 0;
        this._efkHandle = this._efkContext.play(this._efkEffect);
        if (this._efkHandle) this._efkHandle.setLocation(0, 0, 0);
        this._applyOrientation();
        // Continuous stacks (steady-state emitters — portals, auras, …)
        // pre-simulate silently so the preview opens mid-flow instead of
        // showing the emitter's ramp-in from zero particles.
        const warm = (this._stackFlags && this._stackFlags.prewarm) || 0;
        for (let i = 0; i < warm; i++) this._ctxUpdate();
        this._frame = warm;
        this._playing = true;
        this._updatePlayButton();
    }

    /**
     * The persistent render loop. Runs from preview init until teardown:
     * always draws (so the last frame persists through pauses/rebuilds),
     * steps the simulation only while playing.
     */
    _startLoop(canvas) {
        const frameLabel = this.contentEl.querySelector('.rr-efk-frame');
        const gen = this._generation;
        let lastTime = Date.now();
        let accumulator = 0;
        const fixedTimeStep = 1000 / 60;

        const render = () => {
            if (!this._efkContext || !this._gl) return;

            // A runtime throw (WASM assert, GL loss) must never kill the
            // RAF loop — a dead loop looks like "the effect never loads".
            // Surface the error, drop the broken handle, keep rendering.
            try {
                this._renderFrame(canvas, frameLabel, () => {
                    const now = Date.now();
                    accumulator += now - lastTime;
                    lastTime = now;
                    const steps = Math.min(5, Math.floor(accumulator / fixedTimeStep));
                    accumulator -= steps * fixedTimeStep;
                    if (accumulator > fixedTimeStep * 5) accumulator = 0;
                    return steps;
                });
            } catch (e) {
                console.error('EffekseerGenerator: render error:', e);
                this._status(`Preview error: ${e.message || e}`, true);
                if (this._efkHandle) {
                    try { this._efkHandle.stop(); } catch (e2) {}
                    this._efkHandle = null;
                }
                this._playing = false;
                this._updatePlayButton();
            }

            this._rafId = requestAnimationFrame(render);
        };
        this._rafId = requestAnimationFrame(render);
    }

    /** One tick of the persistent loop: step (if playing), loop-restart, draw. */
    _renderFrame(canvas, frameLabel, takeSteps) {
        const steps = takeSteps();
        if (this._playing) {
            for (let i = 0; i < steps; i++) {
                // Seamless recipes replay DETERMINISTICALLY at their loop
                // length: pose `life` ≡ pose 0 by construction, while the
                // dying container draws a few blank frames before
                // removeWhenChildrenIsExtinct kicks in — waiting for
                // !handle.exists showed those blanks as a loop flicker.
                if (this._loopFrames > 0 && this._frame >= this._loopFrames) {
                    this._play();
                }
                this._ctxUpdate();
                this._frame++;
            }
            if (frameLabel) {
                const dur = this._effectDuration || 0;
                frameLabel.textContent = dur > 0
                    ? `${this._t('efk.frame')} ${this._frame % dur} / ${dur}`
                    : `${(this._frame / 60).toFixed(1)}s`;
            }

            // Effect finished (burst stacks, or a continuous one that died
            // early) → restart; bursts get a readable beat first.
            if (this._frame > 1 && (!this._efkHandle || !this._efkHandle.exists)) {
                const recipe = this._recipe();
                const gen = this._generation;
                if ((this._stackFlags && this._stackFlags.continuous) ||
                    (recipe && (recipe.seamless || recipe.continuous))) {
                    this._play();
                } else {
                    this._playing = false;
                    clearTimeout(this._replayTimer);
                    this._replayTimer = setTimeout(() => {
                        if (this._efkContext && gen === this._generation) this._play();
                    }, 350);
                }
            }
        }

        this._flushRetired();

        const gl = this._gl;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // MZ-style projection (as AnimationPicker) + orbit camera.
        const p = -((canvas.height * 1.2) / canvas.height);
        this._efkContext.setProjectionMatrix([1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, p, 0, 0, 0, 1]);
        this._efkContext.setCameraMatrix(this._cameraMatrix());

        this._efkContext.beginDraw();
        if (this._efkHandle && this._efkHandle.exists) {
            // Re-assert the live-drag tilt delta every frame: it's a cheap
            // native setter, and applying it here (rather than only on
            // gizmo events) makes the 3D controls realtime regardless
            // of handle swaps, replays, or pause state.
            this._applyOrientation();
            this._efkContext.drawHandle(this._efkHandle);
        }
        this._efkContext.endDraw();
    }

    // ── Export ───────────────────────────────────────────────────────────

    _export() {
        const recipe = this._recipe();
        const project = this.projectController && this.projectController.getCurrentProject();
        if (!recipe) return;
        if (!project) {
            this._status(this._t('efk.noProject'), true);
            return;
        }

        const nameInput = this.contentEl.querySelector('.rr-efk-name');
        const name = (nameInput.value || this._defaultExportName()).replace(/[^A-Za-z0-9_\-]/g, '');
        if (!name) { this._status(this._t('efk.badName'), true); return; }

        try {
            const fs = require('fs');
            const path = require('path');
            const effectsDir = path.join(project.path, 'effects');
            const textureDir = path.join(effectsDir, 'Texture');
            fs.mkdirSync(textureDir, { recursive: true });

            // Built-in procedural textures are written on every export;
            // custom (uploaded) textures were already copied into
            // effects/Texture/ when picked; baked AG sprite sheets are
            // rendered fresh from each layer's current params.
            const bytes = this._buildBytes();   // per-keyframe tilt bakes in _composeStack (also refreshes the merge)
            for (const entry of this._stack) {
                const r = this._recipeOf(entry);
                if (!r) continue;
                const lp = RR_EfkRecipeUtil.resolveParams(r, entry.values);
                for (const texPath of this._resolveTextures(r, lp)) {
                    if (r.bake && /rr_bake_/.test(texPath)) {
                        const baked = this._bakedSheet(r, lp);
                        if (baked) {
                            const b64 = baked.dataUrl.split(',')[1];
                            fs.writeFileSync(path.join(effectsDir, texPath), Buffer.from(b64, 'base64'));
                        }
                        continue;
                    }
                    const builtin = /rr_([a-z0-9_]+)\.png$/i.exec(texPath);
                    if (!builtin) continue;
                    fs.writeFileSync(path.join(effectsDir, texPath), Buffer.from(RR_EfkTextures.pngBytes(builtin[1])));
                }
            }
            const models = (this._lastComposed && this._lastComposed.models) || [];
            if (models.length) {
                fs.mkdirSync(path.join(effectsDir, 'Model'), { recursive: true });
                for (const m of models) {
                    fs.writeFileSync(path.join(effectsDir, m.path), Buffer.from(m.bytes));
                }
            }
            const outPath = path.join(effectsDir, `${name}.efkefc`);
            fs.writeFileSync(outPath, Buffer.from(bytes));
            this._status(`${this._t('efk.exported')} effects/${name}.efkefc`);
        } catch (e) {
            console.error('EffekseerGenerator: export failed:', e);
            this._status(`${this._t('efk.exportFailed')}: ${e.message}`, true);
        }
    }

    detach() {
        this._teardownPreview();
    }
}
