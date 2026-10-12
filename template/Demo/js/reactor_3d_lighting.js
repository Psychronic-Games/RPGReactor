//=============================================================================
// reactor_3d_lighting.js — RPG Reactor 3D lighting and shadows
//=============================================================================
/*
 * An extension of Reactor3D (reactor_3d.js): the lights of a 3D map and the
 * shadows they cast. Loaded right after the core, in the game from
 * scriptUrls, in the editor from Reactor3D.EXTENSIONS, and in Node by the
 * core's own tail so require("./reactor_3d.js") returns the whole API.
 *
 * Four parts, in order: the light model and its shader (light kinds, the
 * light grid, the lit-material shader injection, the cutaway and dissolve
 * that share it, GPU tiering); the shadow atlas; the shims that read a 2D
 * lighting plugin's lights; and the native lights a map carries in its
 * sidecar, with the event commands that switch and move them.
 */

(function(root) {
    // Node alone takes the core from require; the NW.js page and the browser
    // find it on the global object, booted from scriptUrls.
    const node = typeof process !== "undefined" && process.versions && process.versions.node
        && !process.versions.nw && typeof require === "function";
    const Reactor3D = node ? require("./reactor_3d.js") : root.Reactor3D;
    if (!Reactor3D) return;

//-----------------------------------------------------------------------------
// Lighting
//
// A 2D lighting plugin draws circles and cones onto the screen, which on a 3D
// map is a picture of light rather than light: it lands flat over the world
// instead of pooling on the ground and climbing walls. The geometry is here to
// be lit, so it is lit.
//
// Reactor cannot read a plugin's lights directly without binding itself to one
// plugin's internals, so it publishes a shape and a shim translates. Positions
// are map cells — the same coordinates everything else in this file uses — so a
// shim never has to know about the camera.

Reactor3D.LIGHT_POINT = "point";
Reactor3D.LIGHT_SPOT = "spot";
// A laser: a constant-width cylinder of light `radius` tiles long and
// `width` tiles across, aimed by yaw and pitch exactly as a spot is.
Reactor3D.LIGHT_BEAM = "beam";
// A sun: high over the map, lighting the ground under it to its radius
// whatever its height (its reach is measured across the ground), casting
// from where it really is.
Reactor3D.LIGHT_SUN = "sun";
Reactor3D.DEFAULT_BEAM_LENGTH = 8;
// A beam's full thickness in tiles: the shader and the body take half.
Reactor3D.DEFAULT_BEAM_WIDTH = 0.08;
// Where a beam lands: the dot's size and the little light's reach, as
// multiples of the beam's width, and how much brighter than the beam.
Reactor3D.BEAM_DOT_SIZE = 4;
Reactor3D.BEAM_DOT_REACH = 8;
Reactor3D.BEAM_DOT_GAIN = 1.5;
// The size the 3D database previews every model at: its longest side in
// tiles. A light effect's reach and width are authored against that, and
// grow with the placed instance.
Reactor3D.EFFECT_PREVIEW_SPAN = 1.6;

/** Whether a light has a direction to aim: a cone or a beam. */
Reactor3D.lightIsAimed = function(light) {
    return !!light && (light.type === this.LIGHT_SPOT || light.type === this.LIGHT_BEAM);
};

/** The spread of a cone whose plugin does not say, in degrees. */
Reactor3D.DEFAULT_CONE_ANGLE = 70;

/** And how far it reaches, in tiles, when that is not known either. */
Reactor3D.DEFAULT_CONE_LENGTH = 6;

/*
 * Lights are drawn, not simulated.
 *
 * The obvious implementation — one `THREE.PointLight` per light — does not
 * survive contact with a real map. three.js sizes its light uniform arrays to
 * the number of lights in the scene and compiles that count into *every*
 * material's shader, so a city with a lantern on every corner overruns the
 * fragment shader's uniform budget, the program fails to link, and the map
 * draws nothing at all. Capping the count to fit is not a fix either: twelve
 * lights on a street of a hundred is not lighting.
 *
 * But a 2D lighting plugin never simulated anything. Its light *is* a shape: a
 * radius, a colour, an alpha — a soft disc it stamps on the screen. That shape
 * is what has to end up on the ground in 3D, and a shape can simply be drawn.
 *
 * So every light becomes a quad lying on the ground, sized to its own radius,
 * tinted by its own colour, added to what is already there. All of them share
 * one geometry and one material, so a hundred lights is one draw call and no
 * shader uniforms whatsoever. The only real light in the scene is a single
 * ambient one, which is the darkness the lights are read against.
 */

/** How many light quads the pool can hold. Far past any real map. */
Reactor3D.MAX_LIGHTS = 512;

/*
 * Lights in volume.
 *
 * The ground quads above are a picture of a pool of light: a disc on the
 * floor, a wedge along it, drawn in a pass of their own and added over the
 * frame. Seen from a ground camera the disc is a slice, a wall beside a lamp
 * stays dark, a lamp on a ceiling lights nothing, and the light's own height
 * has nowhere to go. "Volume" mode makes the light a field instead: every map
 * material — tiles, cut-outs, room walls, models, characters — takes the
 * map's lights as shader uniforms and lights each pixel by its distance from
 * every source, in three dimensions. A point light is a sphere of reach that
 * falls on the floor below it, the wall beside it and the ceiling above; a
 * spotlight is a cone with a yaw *and a pitch*. The source itself is shown
 * as a faint glowing body (a sphere, or the cone) that walls hide, because it
 * is geometry in the world like everything else.
 *
 * The uniform-budget argument against `THREE.PointLight` still holds, so the
 * list is capped per shader: the nearest `SHADER_LIGHTS` to the focus are
 * uploaded each frame, once, into value objects every lit material shares.
 * A map can keep the flat quads with `lighting.mode = "flat"` in its sidecar,
 * and `Reactor3D.LIGHT_MODE = "flat"` restores them everywhere.
 */
Reactor3D.LIGHT_MODE = "volume";

/** How many lights one material's shader loops over. */
Reactor3D.SHADER_LIGHTS = 32;

/**
 * The flat quads were added to the frame twice (see `lightPool`), so an
 * authored intensity of one brought a channel to full from nothing. A field
 * that multiplies a texel adds `colour * intensity * gain` to the ambient it
 * is read against; two keeps the Demo's rig at about the brightness it was
 * tuned to.
 */
Reactor3D.VOLUME_LIGHT_GAIN = 2;

/** How strongly a light's own body glows, before its intensity. */
Reactor3D.VOLUME_GLOW = 0.55;
/** The largest glow ball a point light's body grows to, in tiles. */
Reactor3D.LIGHT_HAZE_MAX = 10;

/** A plugin light says nothing about height: carried at waist level. */
Reactor3D.PLUGIN_LIGHT_HEIGHT = 0.5;

Reactor3D.lightModeFor = function(mapData) {
    const map = mapData || (typeof $dataMap !== "undefined" ? $dataMap : null);
    const lighting = map && map.reactor3d && map.reactor3d.lighting;
    if (lighting && lighting.mode === "flat") return "flat";
    return this.LIGHT_MODE === "flat" ? "flat" : "volume";
};

/**
 * The uniform values every lit material shares. One set of typed arrays,
 * written once a frame by `syncVolumeLights`; three uploads them per program.
 * Plain arrays rather than THREE vectors so they exist before three loads.
 */
/**
 * Conservative cells of light indices. This only rejects lights whose sphere,
 * cone or beam cannot touch a cell; the fragment keeps the authored falloff and
 * shadow calculation. Outside this small window the original loop is used.
 * Packing stays synchronous: yesterday's mask would lose moving lights.
 */
Reactor3D.LightGrid = {
    enabled: true,
    // 64 x 64 x 64 world units around the focus, from 8 below the ground:
    // tall enough for a room's ceiling and upper walls. A fragment outside the
    // grid is lit only by the lights that reach out of it (`spill`).
    size: [16, 16, 16],
    step: 4,
    ensure(uniforms) {
        if (!uniforms.rrLightGrid) {
            uniforms.rrLightGrid = { value: null };
            uniforms.rrLightGridEnabled = { value: 0 };
            uniforms.rrLightGridOrigin = { value: new Float32Array(3) };
        }
        if (!uniforms.rrLightGridSpill) uniforms.rrLightGridSpill = { value: 0 };
        if (!uniforms.rrLightGrid.value && typeof THREE !== "undefined" && THREE.Data3DTexture) {
            const [nx, ny, nz] = this.size;
            const texture = new THREE.Data3DTexture(new Uint32Array(nx * ny * nz), nx, ny, nz);
            texture.format = THREE.RedIntegerFormat;
            texture.type = THREE.UnsignedIntType;
            texture.minFilter = texture.magFilter = THREE.NearestFilter;
            texture.generateMipmaps = false;
            texture.needsUpdate = true;
            uniforms.rrLightGrid.value = texture;
        }
        return uniforms.rrLightGrid.value;
    },
    /** Pure array packer, also used by geometry/light-intersection regressions. */
    fill(data, origin, count, pos, color, aim, slot = -1, cells = null) {
        const [nx, ny, nz] = this.size, step = this.step, half = step / 2;
        const cellRadius = Math.sqrt(3) * half;
        if (data) data.fill(0);
        if (cells) cells.length = 0;
        const begin = slot < 0 ? 0 : slot, end = slot < 0 ? count : slot + 1;
        for (let i = begin; i < end; i++) {
            const a = i * 4, x = pos[a], y = pos[a + 1], z = pos[a + 2];
            // Padding covers Float32 shader arithmetic at cell/cone boundaries.
            const pad = 0.002 + (Math.abs(x) + Math.abs(y) + Math.abs(z) + Math.abs(pos[a + 3])) * 0.000002;
            const radius = Math.max(pos[a + 3], 0.001) + pad;
            const r2 = radius * radius, sr = cellRadius + pad, bit = (1 << i) >>> 0;
            const x0 = Math.max(0, Math.floor((x - radius - origin[0]) / step));
            const x1 = Math.min(nx - 1, Math.floor((x + radius - origin[0]) / step));
            const kind = color[a + 3];
            // A sun covers the whole column under it, however high it hangs.
            const column = kind > 2.5;
            const y0 = column ? 0 : Math.max(0, Math.floor((y - radius - origin[1]) / step));
            const y1 = column ? ny - 1 : Math.min(ny - 1, Math.floor((y + radius - origin[1]) / step));
            const z0 = Math.max(0, Math.floor((z - radius - origin[2]) / step));
            const z1 = Math.min(nz - 1, Math.floor((z + radius - origin[2]) / step));
            const ax = aim[a], ay = aim[a + 1], az = aim[a + 2];
            const length = Math.hypot(ax, ay, az);
            const shaped = kind > 0.5 && kind < 2.5 && Math.abs(length - 1) < 0.0001;
            const cosine = aim[a + 3] / length;
            const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
            for (let iz = z0; iz <= z1; iz++) {
                const dz = origin[2] + (iz + 0.5) * step - z;
                const bz = Math.max(Math.abs(dz) - half, 0);
                for (let iy = y0; iy <= y1; iy++) {
                    const dy = origin[1] + (iy + 0.5) * step - y;
                    const by = column ? 0 : Math.max(Math.abs(dy) - half, 0), yz2 = by * by + bz * bz;
                    if (yz2 > r2) continue;
                    const row = (iz * ny + iy) * nx;
                    for (let ix = x0; ix <= x1; ix++) {
                        const dx = origin[0] + (ix + 0.5) * step - x;
                        const bx = Math.max(Math.abs(dx) - half, 0);
                        if (bx * bx + yz2 > r2) continue;
                        if (shaped) {
                            const along = (dx * ax + dy * ay + dz * az) / length;
                            const perp = Math.sqrt(Math.max(0, dx * dx + dy * dy + dz * dz - along * along));
                            if (kind > 1.5) {
                                // A tiny aim-length error must not narrow the shader's beam.
                                const beamPad = sr + radius * Math.abs(length - 1) * 2;
                                if (along + beamPad < 0 || along - beamPad > radius || perp - beamPad > aim[a + 3]) continue;
                            } else if (cosine > 0 && cosine < 1 && perp * cosine - along * sine > sr) continue;
                        }
                        if (cells) cells.push(row + ix);
                        else data[row + ix] |= bit;
                    }
                }
            }
        }
    },
    /**
     * The lights that can reach a point outside the grid's box, as a mask.
     * Every kind but the sun is cut off at its enclosing cube, so a light
     * whose cube lies inside the box never lights anything outside it; a sun
     * lights whole columns, so it always spills. A fragment outside the grid
     * (the ceiling of a tall room, the far side of a big map) loops over these
     * alone instead of every light, which on a 1080p frame of the Demo was
     * most of what the lights cost. The kill switch spills every light.
     */
    spill(origin, count, pos, color) {
        const all = count >= 32 ? 0xffffffff : ((1 << count) - 1) >>> 0;
        if (!this.spillEnabled) return all;
        const [nx, ny, nz] = this.size, step = this.step, margin = 0.05;
        const max = [origin[0] + nx * step, origin[1] + ny * step, origin[2] + nz * step];
        let mask = 0;
        for (let i = 0; i < count; i++) {
            const a = i * 4, r = Math.max(pos[a + 3], 0.001) + margin;
            let out = color[a + 3] > 2.5;
            for (let k = 0; !out && k < 3; k++) out = pos[a + k] - r < origin[k] || pos[a + k] + r > max[k];
            if (out) mask |= 1 << i;
        }
        return mask >>> 0;
    },
    update(uniforms, focus) {
        if (this.cacheEnabled) return this.updateCached(uniforms, focus);
        const texture = this.ensure(uniforms);
        if (texture) this._cells.delete(texture);
        uniforms.rrLightGridEnabled.value = 0;
        const count = uniforms.rrLightCount.value;
        if (!this.enabled || !texture || count < 8) return;
        const origin = uniforms.rrLightGridOrigin.value;
        origin[0] = Math.floor(((focus?.x || 0) - 32) / 8) * 8;
        origin[1] = Math.floor(((focus?.groundY || 0) - 4) / 8) * 8;
        origin[2] = Math.floor(((focus?.y || 0) - 32) / 8) * 8;
        this.fill(texture.image.data, origin, count, uniforms.rrLightPos.value, uniforms.rrLightColor.value, uniforms.rrLightAim.value);
        texture.needsUpdate = true;
        uniforms.rrLightGridEnabled.value = 1;
        uniforms.rrLightGridSpill.value = this.spill(origin, count, uniforms.rrLightPos.value, uniforms.rrLightColor.value);
    },
    glsl(source) {
        const out = this.gridGlsl(source);
        return Reactor3D.LightVolume ? Reactor3D.LightVolume.glsl(out) : out;
    },
    gridGlsl(source) {
        return "uniform highp usampler3D rrLightGrid;\nuniform int rrLightGridEnabled;\nuniform uint rrLightGridSpill;\nuniform vec3 rrLightGridOrigin;\n" + source
            .replace("vec3 sum = rrAmbient;", "vec3 sum = rrAmbient;\n"
                + "\tivec3 cell = ivec3(floor((p - rrLightGridOrigin) * " + (1 / this.step).toFixed(6) + "));\n"
                + "\tbool grid = rrLightGridEnabled != 0 && all(greaterThanEqual(cell, ivec3(0))) && all(lessThan(cell, ivec3(" + this.size.join(", ") + ")));\n"
                + "\tuint mask = grid ? texelFetch(rrLightGrid, cell, 0).r : 0u;\n"
                // Outside the grid: only the lights that reach out of it.
                + "\tif (!grid && rrLightGridEnabled != 0) { grid = true; mask = rrLightGridSpill; }\n")
            .replace("for (int i = 0; i < 32; i++) {\n\t\tif (i >= rrLightCount) break;",
                "for (int j = 0; j < 32; j++) {\n\t\tint i = j;\n"
                + "\t\tif (grid) {\n\t\t\tif (mask == 0u) break;\n"
                // A power of two is represented exactly, including bit 31.
                // log2 avoids scanning all the zero bits between nearby lights.
                + "\t\t\tuint bit = mask & (~mask + 1u);\n"
                + "\t\t\ti = int(log2(float(bit)) + 0.5);\n\t\t\tmask ^= bit;\n\t\t}\n"
                + "\t\tif (i >= rrLightCount) break;");
    }
};



/** Repack only lights whose exact intersection inputs changed. */
Reactor3D.LightGrid.cacheEnabled = true;
Reactor3D.LightGrid._cells = new WeakMap();
/** Update only cells entered or left by a light; intersection maths is shared with fill(). */
Reactor3D.LightGrid.updateCached = function(uniforms, focus) {
    const texture = this.ensure(uniforms), count = uniforms.rrLightCount.value;
    uniforms.rrLightGridEnabled.value = 0;
    if (!this.enabled || !texture || count < 8) { if (texture) this._cells.delete(texture); return; }
    const origin = uniforms.rrLightGridOrigin.value;
    origin[0] = Math.floor(((focus?.x || 0) - 32) / 8) * 8;
    origin[1] = Math.floor(((focus?.groundY || 0) - 4) / 8) * 8;
    origin[2] = Math.floor(((focus?.y || 0) - 32) / 8) * 8;
    const data = texture.image.data, pos = uniforms.rrLightPos.value, color = uniforms.rrLightColor.value, aim = uniforms.rrLightAim.value;
    let state = this._cells.get(texture), changed = false;
    if (!state || !state.cellLists || state.data !== data || state.step !== this.step
        || state.size.some((value, i) => value !== this.size[i]) || state.origin.some((value, i) => value !== origin[i])) {
        state = { cellLists: true, data, origin: origin.slice(), step: this.step, size: this.size.slice(), entries: [], scratch: [], generation: 0, mask: new Uint32Array(data.length), dirty: [] };
        this._cells.set(texture, state); data.fill(0); changed = true;
    }
    const dirty = state.dirty; dirty.length = 0;
    for (let i = 0; i < count; i++) {
        const at = i * 4;
        let entry = state.entries[i], key = entry?.key;
        if (key && key[0] === pos[at] && key[1] === pos[at+1] && key[2] === pos[at+2] && key[3] === pos[at+3]
            && key[4] === color[at+3] && key[5] === aim[at] && key[6] === aim[at+1] && key[7] === aim[at+2] && key[8] === aim[at+3]) continue;
        if (!entry) { entry = state.entries[i] = { key: new Float64Array(9), cells: [], generation: state.generation }; key = entry.key; }
        key[0] = pos[at]; key[1] = pos[at+1]; key[2] = pos[at+2]; key[3] = pos[at+3]; key[4] = color[at+3];
        key[5] = aim[at]; key[6] = aim[at+1]; key[7] = aim[at+2]; key[8] = aim[at+3];
        dirty.push(i);
    }
    if (dirty.length > count * 0.75) {
        this.fill(state.mask, origin, count, pos, color, aim);
        for (let cell = 0; cell < data.length; cell++) if (data[cell] !== state.mask[cell]) { data[cell] = state.mask[cell]; changed = true; }
        state.generation++;
    } else for (const i of dirty) {
        const entry = state.entries[i], cells = state.scratch, previous = entry.cells, bit = 1 << i;
        // After a bulk rebuild, reconstruct only a changed light's old cells.
        if (entry.generation !== state.generation) {
            previous.length = 0;
            for (let cell = 0; cell < data.length; cell++) if (data[cell] & bit) previous.push(cell);
            entry.generation = state.generation;
        }
        this.fill(null, origin, count, pos, color, aim, i, cells);
        let same = cells.length === previous.length;
        for (let j = 0; same && j < cells.length; j++) if (cells[j] !== previous[j]) same = false;
        if (same) continue;
        for (const cell of previous) data[cell] &= ~bit;
        for (const cell of cells) data[cell] |= bit;
        entry.cells = cells; state.scratch = previous; changed = true;
    }
    if (count < state.entries.length) {
        const valid = count === 32 ? 0xffffffff : (1 << count) - 1;
        for (let cell = 0; cell < data.length; cell++) { const value = (data[cell] & valid) >>> 0; if (data[cell] !== value) { data[cell] = value; changed = true; } }
    }
    state.entries.length = count;
    if (changed) texture.needsUpdate = true;
    uniforms.rrLightGridEnabled.value = 1;
    uniforms.rrLightGridSpill.value = this.spill(origin, count, pos, color);
};
/** The kill switch for the out-of-grid mask (see `spill`): false spills every light. */
Reactor3D.LightGrid.spillEnabled = true;


Reactor3D.lightUniforms = function() {
    if (this._lightUniforms) return this._lightUniforms;
    const n = this.SHADER_LIGHTS;
    this._lightUniforms = {
        rrLightCount: { value: 0 },
        rrLightPos: { value: new Float32Array(n * 4) },     // x, y, z, reach
        rrLightColor: { value: new Float32Array(n * 4) },   // r, g, b (× intensity × gain), spot flag
        rrLightAim: { value: new Float32Array(n * 4) },     // aim x, y, z, cos(half angle)
        rrAmbient: { value: new Float32Array([1, 1, 1]) },
        // The light a material's relief is shaded against: the map's sun where it stands (w 1),
        // else a direction from above (w 0).
        rrKeyLight: { value: new Float32Array(Reactor3D.KEY_LIGHT_DEFAULT) },
        // Which shadow tile each light samples, -1 for none.
        rrLightShadow: { value: new Float32Array(n).fill(-1) },
        // Per tile: near, far, its dynamic tile (-1 for none), softness (in face units).
        rrShadowInfo: { value: new Float32Array(this.SHADOW_SLOTS * 4).fill(-1) },
        // Per tile: where the strip was rendered from (a floor light's is lifted).
        rrShadowPos: { value: new Float32Array(this.SHADOW_SLOTS * 4) },
        rrShadowBias: { value: this.SHADOW_BIAS },
        // The static atlas and the dynamic atlas: every casting light's six
        // faces live in one texture each, so a program carries two samplers
        // however many lights cast.
        rrShadowAtlas: { value: null },
        rrShadowDynAtlas: { value: null },
        // 1/faces across, 1/rows in the static atlas, 1/rows in the dynamic
        // one, and one texel in face units.
        rrShadowGrid: { value: new Float32Array([1 / 6, 1, 1, 1 / 512]) }
    };
    return this._lightUniforms;
};

/**
 * The shadow term, when a program carries one. Every casting light owns a
 * row of the atlas: six 90-degree faces side by side, rendered from the
 * light (see `Reactor3D.Shadows`) and sampled with hardware depth
 * comparison. A light with a tile multiplies its falloff by the visibility
 * of the fragment from the source: the static atlas holds the props and
 * the map's models, the dynamic one whoever moved this frame, and the
 * darker of the two wins. The face is chosen from the major axis of the
 * light-to-fragment vector exactly as a cube map would choose it, then
 * projected onto that face and offset into the row.
 */
Reactor3D.shadowGlsl = function(taps) {
    const slots = this.SHADOW_SLOTS;
    const lines = [
        "#define RR_SHADOW_TAPS " + (taps > 1 ? 5 : 1),
        "uniform float rrLightShadow[" + this.SHADER_LIGHTS + "];",
        "uniform vec4 rrShadowInfo[" + slots + "];",
        "uniform vec4 rrShadowPos[" + slots + "];",
        "uniform float rrShadowBias;",
        "uniform sampler2DShadow rrShadowAtlas;",
        "uniform sampler2DShadow rrShadowDynAtlas;",
        "uniform vec4 rrShadowGrid;",
        "float rrShadowNoise(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }",
        "vec2 rrShadowTap(int i, float phi) {",
        "\tfloat r = sqrt((float(i) + 0.5) / 5.0);",
        "\tfloat t = float(i) * 2.399963229728653 + phi;",
        "\treturn vec2(cos(t), sin(t)) * r;",
        "}",
        // The stored depth is the face camera's projected depth (a 90-degree
        // frustum per face), so the compare value is rebuilt the same way
        // from the major axis of the light-to-fragment vector. The face's
        // right and up match the cameras in Reactor3D.SHADOW_FACES.
        // One face, one projection, two samples: the static atlas and, where
        // the slot has one, the dynamic atlas share everything but the row.
        // Computed once instead of once per atlas: inlined twice into the
        // light loop, the whole lookup made every lit pixel slower, shadowed
        // or not (a fifth of a 1080p frame on an integrated GPU).
        "float rrShadowAt(int slot, vec3 p) {",
        "\tvec4 info = rrShadowInfo[slot];",
        "\tvec3 d = p - rrShadowPos[slot].xyz;",
        "\tvec3 a = abs(d);",
        "\tfloat z = max(max(a.x, a.y), a.z);",
        "\tif (z < info.x || z > info.y) return 1.0;",
        "\tfloat dp = (info.y * (z - info.x)) / (z * (info.y - info.x)) + rrShadowBias;",
        "\tfloat face;",
        "\tvec2 uv;",
        "\tif (a.x >= a.y && a.x >= a.z) { face = d.x > 0.0 ? 0.0 : 1.0; uv = vec2(d.z * sign(d.x), d.y); }",
        "\telse if (a.y >= a.z) { face = d.y > 0.0 ? 2.0 : 3.0; uv = vec2(d.x, d.z * sign(d.y)); }",
        "\telse { face = d.z > 0.0 ? 4.0 : 5.0; uv = vec2(-d.x * sign(d.z), d.y); }",
        "\tuv = uv / z * 0.5 + 0.5;",
        "\tbool dynamic = info.z >= 0.0;",
        "\tvec2 base = vec2(face * rrShadowGrid.x, float(slot) * rrShadowGrid.y);",
        "\tvec2 scale = vec2(rrShadowGrid.x, rrShadowGrid.y);",
        "\tvec2 dynBase = vec2(face * rrShadowGrid.x, info.z * rrShadowGrid.z);",
        "\tvec2 dynScale = vec2(rrShadowGrid.x, rrShadowGrid.z);",
        // A tap never leaves its face: the filter's footprint would read the
        // neighbouring face's depth as this one's.
        "\tfloat pad = rrShadowGrid.w;",
        "#if RR_SHADOW_TAPS > 1",
        "\tfloat phi = rrShadowNoise(gl_FragCoord.xy) * 6.283185307179586;",
        "\tfloat s = 0.0, sd = 0.0;",
        "\tfor (int i = 0; i < 5; i++) {",
        "\t\tvec2 q = clamp(uv + rrShadowTap(i, phi) * info.w, pad, 1.0 - pad);",
        "\t\ts += texture(rrShadowAtlas, vec3(base + q * scale, dp));",
        "\t\tif (dynamic) sd += texture(rrShadowDynAtlas, vec3(dynBase + q * dynScale, dp));",
        "\t}",
        "\treturn dynamic ? min(s * 0.2, sd * 0.2) : s * 0.2;",
        "#else",
        "\tvec2 q = clamp(uv, pad, 1.0 - pad);",
        "\tfloat s = texture(rrShadowAtlas, vec3(base + q * scale, dp));",
        "\tif (dynamic) s = min(s, texture(rrShadowDynAtlas, vec3(dynBase + q * dynScale, dp)));",
        "\treturn s;",
        "#endif",
        "}"
    ];
    return lines.join("\n") + "\n";
};

/** The light term, with or without the shadow lookup inside its loop. */
Reactor3D.lightGlsl = function(shadows, taps) {
    return (shadows ? this.shadowGlsl(taps) : "") + [
        "uniform int rrLightCount;",
        "uniform vec4 rrLightPos[" + this.SHADER_LIGHTS + "];",
        "uniform vec4 rrLightColor[" + this.SHADER_LIGHTS + "];",
        "uniform vec4 rrLightAim[" + this.SHADER_LIGHTS + "];",
        "uniform vec3 rrAmbient;",
        "uniform vec4 rrKeyLight;",
        "uniform float rrSelfLit;",
        "varying vec3 vRRWorldPos;",
        "vec3 rrLight(vec3 p) {",
        "\tvec3 sum = rrAmbient;",
        "\tfor (int i = 0; i < " + this.SHADER_LIGHTS + "; i++) {",
        "\t\tif (i >= rrLightCount) break;",
        "\t\tvec4 lp = rrLightPos[i];",
        "\t\tvec3 d = p - lp.xyz;",
        "\t\tvec4 lc = rrLightColor[i];",
        "\t\tfloat fall;",
        // A sun: full over the middle of the ground it covers, fading at its
        // edge, measured across the ground so its height never dims it.
        "\t\tif (lc.w > 2.5) {",
        "\t\t\tfall = smoothstep(lp.w, lp.w * 0.6, length(d.xz));",
        "\t\t\tif (fall <= 0.0) continue;",
        "\t\t} else {",
        // Outside the enclosing cube the spherical falloff is already zero.
        // Reject there before length/division; retain the exact falloff inside.
        "\t\tif (max(max(abs(d.x), abs(d.y)), abs(d.z)) >= max(lp.w, 0.001)) continue;",
        "\t\tfloat dist = length(d);",
        // The same falloff the flat pool's picture carries: (1 - d/r)^2.
        "\t\tfall = 1.0 - dist / max(lp.w, 0.001);",
        "\t\tif (fall <= 0.0) continue;",
        "\t\tfall *= fall;",
        "\t\tif (lc.w > 1.5) {",
        // A beam: how far along the axis the point sits and how far off it.
        // Inside the width it is lit at full, out to the length, with only a
        // gentle fade along — a laser stays bright to its end.
        "\t\t\tvec4 aim = rrLightAim[i];",
        "\t\t\tfloat t = dot(d, aim.xyz);",
        "\t\t\tif (t < 0.0 || t > lp.w) continue;",
        "\t\t\tfloat perp = length(d - aim.xyz * t);",
        "\t\t\tfall = smoothstep(aim.w, aim.w * 0.35, perp) * sqrt(max(0.0, 1.0 - t / max(lp.w, 0.001)));",
        "\t\t\tif (fall <= 0.0) continue;",
        "\t\t} else if (lc.w > 0.5) {",
        "\t\t\tvec4 aim = rrLightAim[i];",
        "\t\t\tfloat c = dot(d / max(dist, 0.0001), aim.xyz);",
        // Soft at the rim rather than a cut-out cone: full inside the inner
        // third of the spread, fading to nothing at the authored edge.
        "\t\t\tfall *= smoothstep(aim.w, mix(aim.w, 1.0, 0.35), c);",
        // Outside the cone the contribution is exactly zero; avoid fetching
        // both shadow atlases for a light that cannot affect this fragment.
        "\t\t\tif (fall <= 0.0) continue;",
        "\t\t}",
        "\t\t}",
        shadows ? "\t\tfloat sh = rrLightShadow[i];\n\t\tif (sh >= 0.0) fall *= rrShadowAt(int(sh + 0.5), p);" : "",
        "\t\tsum += lc.rgb * fall;",
        "\t}",
        "\treturn sum;",
        "}"
    ].filter(line => line !== "").join("\n") + "\n";
};

Reactor3D.LIGHT_GLSL = Reactor3D.lightGlsl(false);

/**
 * Teach a compiled program about the map's lights: the world position of
 * every fragment, and the diffuse colour multiplied by ambient plus every
 * light in reach — before the texel, so `texel * base * (ambient + lights)`.
 */
/**
 * Pack compositor lights straight into the shared uniforms: no map, no
 * facades, no view culling. What a preview outside a MapScene needs — the
 * 3D database lights a model with the game's own shader this way. Lights
 * are placed by the scene packer's rule (x + 0.5, ground + height, y + 1),
 * with `groundY` absolute. An optional private uniform set lets retained
 * previews pack lights without changing another viewport. Returns how many
 * were packed; shared-uniform callers restore their previous state as needed.
 * `shadows`, when given, is `{ candidates: [], focus }` (focus a world point):
 * each light that may cast is added to `candidates` for `Shadows`.
 */
Reactor3D.packLightUniforms = function(lights, ambient, uniforms = this.lightUniforms(), shadows = null) {
    if (uniforms.rrLightGridEnabled) uniforms.rrLightGridEnabled.value = 0;
    // The map's light volume holds the map's lights, not these; nor does the map's glowing water light a preview.
    if (uniforms.rrVolumeOn) uniforms.rrVolumeOn.value = 0;
    if (uniforms.rrDynOn) uniforms.rrDynOn.value = 0;
    if (uniforms.rrWaterFarEdge) uniforms.rrWaterFarEdge.value = 0;
    const pos = uniforms.rrLightPos.value;
    const col = uniforms.rrLightColor.value;
    const aim = uniforms.rrLightAim.value;
    uniforms.rrLightShadow.value.fill(-1);
    const level = ambient && ambient.intensity !== undefined ? ambient.intensity : 1;
    const colour = ambient && ambient.colour !== undefined ? ambient.colour : 0xffffff;
    const shared = uniforms.rrAmbient.value;
    shared[0] = (((colour >> 16) & 255) / 255) * level;
    shared[1] = (((colour >> 8) & 255) / 255) * level;
    shared[2] = ((colour & 255) / 255) * level;
    let count = 0;
    for (const light of Array.isArray(lights) ? lights : []) {
        if (!light || !(light.radius > 0) || count >= this.SHADER_LIGHTS) continue;
        const spot = light.type === this.LIGHT_SPOT;
        const beam = light.type === this.LIGHT_BEAM;
        const x = light.x + 0.5;
        const y = (light.groundY || 0) + (light.height || 0);
        const z = light.y + 1;
        const rgb = light.colour === undefined ? 0xffffff : light.colour;
        const gain = (light.intensity === undefined ? 1 : light.intensity) * this.LIGHT_GAIN * this.VOLUME_LIGHT_GAIN;
        let ax = 0, ay = -1, az = 0, shape = -1;
        if (spot || beam) {
            const yaw = ((light.yaw || 0) * Math.PI) / 180;
            const pitch = ((light.pitch || 0) * Math.PI) / 180;
            ax = Math.sin(yaw) * Math.cos(pitch);
            ay = Math.sin(pitch);
            az = Math.cos(yaw) * Math.cos(pitch);
            shape = beam
                ? (light.width === undefined ? this.DEFAULT_BEAM_WIDTH : light.width) * 0.5
                : Math.cos((Math.min(light.angle === undefined ? this.DEFAULT_CONE_ANGLE : light.angle, 178) * Math.PI) / 360);
        }
        const at = count * 4;
        pos[at] = x; pos[at + 1] = y; pos[at + 2] = z; pos[at + 3] = light.radius;
        col[at] = (((rgb >> 16) & 255) / 255) * gain;
        col[at + 1] = (((rgb >> 8) & 255) / 255) * gain;
        col[at + 2] = ((rgb & 255) / 255) * gain;
        col[at + 3] = light.type === this.LIGHT_SUN ? 3 : beam ? 2 : spot ? 1 : 0;
        aim[at] = ax; aim[at + 1] = ay; aim[at + 2] = az; aim[at + 3] = shape;
        if (shadows && light.shadow !== false) {
            const sun = light.type === this.LIGHT_SUN;
            const height = light.height || 0;
            const castReach = sun ? Math.hypot(light.radius, height) : light.radius;
            const focus = shadows.focus;
            shadows.candidates.push({
                index: count,
                id: light.id !== undefined && light.id !== null ? String(light.id) : "#" + count,
                x, y: y + Math.max(0, this.SHADOW_LIFT - height), z, radius: castReach,
                gap: focus ? Math.hypot(x - focus.x, z - focus.z) - light.radius : 0,
                lightY: y, spot: spot || beam, beam, ax, ay, az, cosHalf: spot ? shape : -1,
                width: beam ? shape * 2 : 0,
                priorityRadius: sun ? castReach : light.radius,
                strength: (light.intensity === undefined ? 1 : light.intensity) * (((rgb >> 16) & 255) + ((rgb >> 8) & 255) + (rgb & 255)) / 765,
                carrier: light.carrier || null
            });
        }
        count++;
    }
    uniforms.rrLightCount.value = count;
    this.setKeyLight(uniforms, count);
    return count;
};

/** From above and a little from +x and +z, as the pieces' facing shade is lit, when no sun is packed. */
Reactor3D.KEY_LIGHT_DEFAULT = [0.35, 1, 0.3, 0];
/** The key light from the packed lights: the first sun's place, else the default direction. */
Reactor3D.setKeyLight = function(uniforms, count) {
    const key = uniforms.rrKeyLight && uniforms.rrKeyLight.value;
    if (!key) return;
    const pos = uniforms.rrLightPos.value, col = uniforms.rrLightColor.value;
    for (let i = 0; i < count; i++) {
        if (col[i * 4 + 3] > 2.5) { key[0] = pos[i * 4]; key[1] = pos[i * 4 + 1]; key[2] = pos[i * 4 + 2]; key[3] = 1; return; }
    }
    key.set(this.KEY_LIGHT_DEFAULT);
};

/**
 * three.js skips a plain uniform whose value is what the program already
 * holds, but sends a uniform ARRAY every time a material is bound: every
 * lit material re-sent all the lights (three arrays of SHADER_LIGHTS vec4s,
 * the shadow tables) on every switch, most of a frame's CPU on a map of many
 * materials. Each program's number arrays get the same rule here: kept per
 * program (GL holds uniform values per program), compared with the last
 * values sent, sent only when they differ. Sampler arrays are left alone
 * (their texture units are handed out afresh each draw). Programs compiled
 * since the last call are taken on the next; call once a frame per renderer.
 */
/** The kill switch: false sends every array on every bind again, as three does. */
Reactor3D.uniformArrayCache = true;
/**
 * A cached array uniform's `setValue` (the uniform is `this`; what three's own
 * sends with and the last values sent are kept on it). One function for every
 * uniform of every program: a closure apiece ran hundreds of cold copies of
 * the compare, each boxing every number it read.
 */
Reactor3D.sendUniformArray = function(gl, v, textures) {
    // Only flat number arrays are compared (three also takes arrays of vectors, sent as they come).
    if (Reactor3D.uniformArrayCache !== false && v && typeof v.length === "number" && (ArrayBuffer.isView(v) || typeof v[0] === "number")) {
        const last = this.__rrLast;
        if (last && last.length === v.length) {
            // Each kind of array through a loop of its own: one loop reading all three kinds
            // read every number through the slow path, which makes a number object per read.
            if (v instanceof Float32Array ? Reactor3D.sameAsFloat32(last, v) : Array.isArray(v) ? Reactor3D.sameAsArray(last, v) : Reactor3D.sameAsOther(last, v)) return;
            last.set(v);
        } else this.__rrLast = Float64Array.from(v);
    } else this.__rrLast = null;
    this.__rrSend(gl, v, textures);
};
Reactor3D.sameAsFloat32 = function(last, v) { for (let i = 0; i < v.length; i++) if (last[i] !== v[i]) return false; return true; };
Reactor3D.sameAsArray = function(last, v) { for (let i = 0; i < v.length; i++) if (last[i] !== v[i]) return false; return true; };
Reactor3D.sameAsOther = function(last, v) { for (let i = 0; i < v.length; i++) if (last[i] !== v[i]) return false; return true; };
Reactor3D.CACHED_UNIFORM_TYPES = new Set([0x1406, 0x8B50, 0x8B51, 0x8B52, 0x1404, 0x8B53, 0x8B54, 0x8B55, 0x8B5A, 0x8B5B, 0x8B5C]);
Reactor3D.cacheUniformArrays = function(renderer) {
    const programs = renderer && renderer.info && renderer.info.programs;
    if (!programs || renderer.__rrCachedPrograms === programs.length && programs.every(program => program.__rrArraysCached)) return;
    renderer.__rrCachedPrograms = programs.length;
    const wrap = uniform => {
        if (uniform.__rrCached || typeof uniform.setValue !== "function" || !this.CACHED_UNIFORM_TYPES.has(uniform.type)) return;
        uniform.__rrCached = true;
        uniform.__rrSend = uniform.setValue;
        uniform.__rrLast = null;
        uniform.setValue = Reactor3D.sendUniformArray;
    };
    const visit = list => { for (const uniform of list || []) { if (uniform.seq) visit(uniform.seq); else if (uniform.size !== undefined) wrap(uniform); } };
    for (const program of programs) {
        if (program.__rrArraysCached) continue;
        // A program still compiling on the driver's threads is taken on a
        // later call: reading its uniforms now would wait for the compile.
        if (typeof program.isReady === "function" && !program.isReady()) { renderer.__rrCachedPrograms = -1; continue; }
        program.__rrArraysCached = true;
        try { visit(program.getUniforms().seq); } catch (error) { /* a program that failed to link has none */ }
    }
};

Reactor3D.injectLightShader = function(shader, renderer) {
    const uniforms = this.lightUniforms();
    this.LightGrid.ensure(uniforms);
    if (this.LightVolume) this.LightVolume.uniforms();
    for (const key of Object.keys(uniforms)) shader.uniforms[key] = uniforms[key];
    // After projection, where `transformed` is final: skinned, billboarded,
    // or plain. (Anchored on the include, which every three material has;
    // the billboard's own patch keeps the include inside its replacement.)
    shader.vertexShader = "varying vec3 vRRWorldPos;\n"
        + shader.vertexShader.replace(
            "#include <project_vertex>",
            "#include <project_vertex>\n\tvRRWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;"
        );
    // Only the renderer that owns the maps takes the shadow variant. The
    // editor draws the same lit materials from several renderers - the map
    // view, the 3D database preview, the model pickers - and a depth cube
    // belongs to the context that rendered it: another renderer handed the
    // same texture object uploads it afresh as an empty colour cube, which a
    // shadow sampler cannot be bound to, and every draw there is dropped.
    const shadows = this.Shadows.appliesTo(renderer);
    const glsl = this.LightGrid.glsl(shadows ? this.lightGlsl(true, this.Shadows.quality().taps) : this.LIGHT_GLSL);
    // The light term multiplies the colour AFTER every discard (the alpha
    // test, the zero-alpha skip, dissolve, the cutaway), not where the colour
    // is first set: a fragment about to be thrown away never pays for the
    // light loop. The product is the same, taken in another order. A
    // self-lit material (a Glow) skips the loop outright: its term is 1.
    if (this.lateLighting !== false && shader.fragmentShader.indexOf("#include <alphahash_fragment>") >= 0
        && shader.fragmentShader.indexOf("vec4 diffuseColor = vec4( diffuse, opacity );") >= 0) {
        shader.fragmentShader = glsl + shader.fragmentShader.replace(
            "#include <alphahash_fragment>",
            "#include <alphahash_fragment>\n\tif (rrSelfLit < 1.0) diffuseColor.rgb *= mix(rrLight(vRRWorldPos), vec3(1.0), rrSelfLit);\n\t" + this.LIT_MARK
        );
        return;
    }
    shader.fragmentShader = glsl + shader.fragmentShader.replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        "vec3 rrLightTerm = mix(rrLight(vRRWorldPos), vec3(1.0), rrSelfLit);\n\tvec4 diffuseColor = vec4( diffuse * rrLightTerm, opacity );"
    );
};
/** Where the lit colour is final, for what blends over it (see injectBlendColor). */
Reactor3D.LIT_MARK = "/* rr:lit */";
/** The kill switch: false lights the colour where it is first set, before the discards. */
Reactor3D.lateLighting = true;

/**
 * A blend colour on a lit material, the way a sprite's colour filter blends
 * one over its pixels: a damage flash, an animation's flash on its targets,
 * the red of a collapse. `material.userData.rrBlend.value` is {x,y,z,w} in
 * 0..1 (w the strength), created here or by whoever sets it first; a plain
 * object so a material cloned through JSON still owns one the shader reads.
 */
Reactor3D.injectBlendColor = function(material, shader) {
    if (!material || !shader) return;
    material.userData = material.userData || {};
    const blend = material.userData.rrBlend || (material.userData.rrBlend = { value: { x: 0, y: 0, z: 0, w: 0 } });
    shader.uniforms.rrBlend = blend;
    if (shader.fragmentShader.indexOf("uniform vec4 rrBlend;") >= 0) return;
    // Over a colour lit late (injectLightShader), after the light: the flash
    // stays unlit, and takes the vertex colour as it did when mixed before it.
    if (shader.fragmentShader.indexOf(Reactor3D.LIT_MARK) >= 0) {
        shader.fragmentShader = "uniform vec4 rrBlend;\n" + shader.fragmentShader.replace(Reactor3D.LIT_MARK, [
            Reactor3D.LIT_MARK,
            "if (rrBlend.a > 0.0) {",
            "\tvec3 rrBlendRgb = rrBlend.rgb;",
            "\t#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )",
            "\t\trrBlendRgb *= vColor.rgb;",
            "\t#endif",
            "\tdiffuseColor.rgb = mix(diffuseColor.rgb, rrBlendRgb, rrBlend.a);",
            "}"
        ].join("\n\t"));
        return;
    }
    shader.fragmentShader = "uniform vec4 rrBlend;\n" + shader.fragmentShader.replace(
        "#include <map_fragment>",
        "#include <map_fragment>\n\tdiffuseColor.rgb = mix(diffuseColor.rgb, rrBlend.rgb, rrBlend.a);"
    );
};

/**
 * A dissolve threshold on a lit material: pixels whose world height lies
 * below `material.userData.rrDissolve.value` are discarded, so a model can
 * be eaten from the feet up while shards stream off it (an Ash or Ember
 * collapse in a battle room). A plain {value} object in userData, as the
 * blend colour is, so a cloned material owns one and the shader reads it.
 */
/**
 * The cutaway: what a player inside a building must not have in the way.
 * Two cuts, both in the pieces' fragment shader so a merged wall mesh
 * needs no splitting: everything above `rrCutTop` (the storey the player
 * stands in, so the roof and the floors above go), and everything inside
 * a tube of `rrCutRadius` around the line from the eye to the player, so
 * a wall the camera looks through is opened where it hides the party.
 * One set of values for every piece material, written once a frame by
 * `updateCutaway`; 1e9 and 0 mean no cut, which is what the editor shows.
 */
Reactor3D.cutawayUniforms = function() {
    if (!this._cutawayUniforms) {
        this._cutawayUniforms = {
            rrCutTop: { value: 1e9 },
            rrCutEye: { value: [0, 0, 0] },
            rrCutFocus: { value: [0, 0, 0] },
            // Everyone a wall must not hide: the player, the followers, the nearest events; x, y, z each.
            rrCutFoci: { value: new Float32Array(3 * Reactor3D.CUTAWAY_FOCI) },
            rrCutFocusCount: { value: 0 },
            rrCutRadius: { value: 0 },
            // 1 while a battle runs on the map: only then is a character's own model a body the fades pass by.
            rrCutBattle: { value: 0 },
            // The footprint the top cut reaches: x0, z0, x1, z1 in world tiles.
            rrCutBox: { value: [0, 0, 0, 0] },
            // Half the width of the see-through corridor: the party's own width and a little.
            rrGhostWidth: { value: Reactor3D.GHOST_WIDTH },
            // A battle's ground nothing may hide (reactor_fight_tactical.js): its box in world tiles
            // (x0, z0, x1, z1; empty is off), the ground it lies on and the height a wall keeps over it.
            rrFightBox: { value: [0, 0, 0, 0] },
            rrFightLevel: { value: [0, 0] },
            // What a Tactical battle has opened to show its units: boxes of the map in world tiles (x0, z0, x1, z1
            // each) and the height everything built inside each is cut away above. A count of 0 opens nothing.
            // `rrOpenAll` is the one box they all lie in and `rrOpenLow` the lowest of the heights: a piece
            // outside the one or under the other asks about no box at all. The first `rrOpenFeet` boxes are the
            // buildings' footprints and every other box lies inside one of them: a piece in no footprint asks
            // about none of the rest.
            rrOpenBox: { value: new Float32Array(4 * Reactor3D.CUTAWAY_OPENINGS) },
            rrOpenTop: { value: new Float32Array(Reactor3D.CUTAWAY_OPENINGS) },
            rrOpenCount: { value: 0 },
            rrOpenFeet: { value: 0 },
            rrOpenAll: { value: [-1e9, -1e9, 1e9, 1e9] },
            rrOpenLow: { value: -1e9 }
        };
    }
    return this._cutawayUniforms;
};
/**
 * How many boxes a battle's openings may be made of (a house is its footprint and each run of wall cut low). A
 * piece asks only as many as are in use, and none outside `rrOpenAll` or under `rrOpenLow`.
 */
Reactor3D.CUTAWAY_OPENINGS = 24;

/**
 * Half the width of the see-through corridor at the party: the body and a
 * little. The corridor narrows to nothing at the camera, so it holds only
 * what the party is hidden behind; a wall beside the line, however near
 * the party, is not in it.
 */
Reactor3D.GHOST_WIDTH = 0.6;

/** How many characters the see-through corridor follows at once. */
Reactor3D.CUTAWAY_FOCI = 8;
/** How far from the player, in tiles, an event is still kept in sight through a wall. */
Reactor3D.CUTAWAY_COMPANY_REACH = 12;
/** How far below the player, in tiles, an event is no longer kept in sight: under the floor or the roof the player stands on. */
Reactor3D.CUTAWAY_COMPANY_BELOW = 3;

Reactor3D.injectCutaway = function(material, shader) {
    // Pieces take both cuts; a placed model (a tree in front of the door)
    // only thins in the sight line, since it has no storey to cut above.
    if (!material || !shader || !(material.__reactorPieces || material.__reactorModel) || shader.fragmentShader.indexOf("vRRWorldPos") < 0) return;
    const shared = this.cutawayUniforms();
    for (const name of Object.keys(shared)) shader.uniforms[name] = shared[name];
    if (shader.fragmentShader.indexOf("uniform float rrCutTop;") >= 0) return;
    shader.uniforms.rrGhost = { value: material.__reactorGhost ? 1 : 0 };
    // Scenery in the way of a Tactical battle's units (a tree, a prop) is cut off at a height, whole above it and
    // gone over it: one height per material, a model's materials being its own. A unit's own model never is.
    material.userData = material.userData || {};
    shader.uniforms.rrFightStump = material.userData.rrFightStump || (material.userData.rrFightStump = { value: 1e9 });
    // In a battle a character's own model (who fights, who walks with the player, who stands by) fades neither in
    // the sight line nor over the battle's ground: characters are not cover. One flag per material, counted only
    // while a battle runs here (rrCutBattle), so the map's own fade is the map's again when it is over.
    shader.uniforms.rrCutBody = material.userData.rrCutBody || (material.userData.rrCutBody = { value: 0 });
    const openings = Reactor3D.CUTAWAY_OPENINGS;
    shader.fragmentShader = "uniform float rrFightStump;\nuniform float rrCutBody;\nuniform float rrCutBattle;\nuniform float rrCutTop;\nuniform vec3 rrCutEye;\nuniform vec3 rrCutFocus;\nuniform float rrCutRadius;\nuniform vec4 rrCutBox;\nuniform float rrGhost;\nuniform float rrGhostWidth;\nuniform vec3 rrCutFoci[" + Reactor3D.CUTAWAY_FOCI + "];\nuniform int rrCutFocusCount;\n"
        + (material.__reactorPieces ? "uniform vec4 rrOpenBox[" + openings + "];\nuniform float rrOpenTop[" + openings + "];\nuniform int rrOpenCount;\nuniform int rrOpenFeet;\nuniform vec4 rrOpenAll;\nuniform float rrOpenLow;\n" : "") + shader.fragmentShader.replace(
        "#include <map_fragment>",
        [
            material.__reactorPieces ? "if (vRRWorldPos.y > rrCutTop && vRRWorldPos.x >= rrCutBox.x && vRRWorldPos.z >= rrCutBox.y && vRRWorldPos.x <= rrCutBox.z && vRRWorldPos.z <= rrCutBox.w) discard;" : "",
            // A wall in the way is seen through, not cut: the columns of pieces
            // within a corridor the party's width from the camera to the
            // player, where the sight line at that column is low enough to
            // pass through a storey standing there, leave the solid pass and
            // are drawn by the translucent ghost pass instead (the same chunk
            // again with `rrGhost`), so the wall is still there to see. A
            // wall beside the party is not in the way, however near. Never a
            // floor. A placed model fades in the sight line with an ordered
            // dither, which needs no blending.
            // One corridor per character the wall must not hide: the player,
            // the followers and the nearest events (rrCutFoci).
            material.__reactorPieces ? [
                "bool rrInWay = false;",
                // Nothing walked on is in the way: a ramp or floor seen between the eye and the feet
                // was ghosted, a hole in the ground at the party's feet. Its facing from the screen.
                "vec3 rrFaceN = normalize(cross(dFdx(vRRWorldPos), dFdy(vRRWorldPos)));",
                "if (rrCutRadius > 0.0) {",
                "\tfor (int rrI = 0; rrI < " + Reactor3D.CUTAWAY_FOCI + "; rrI++) {",
                "\t\tif (rrI >= rrCutFocusCount) break;",
                "\t\tvec3 rrF = rrCutFoci[rrI];",
                "\t\tif (vRRWorldPos.y <= rrF.y - 1.4) continue;",
                // Ground about the character's own height (it faces up) is walked on, never in the way.
                "\t\tif (abs(rrFaceN.y) >= 0.55 && vRRWorldPos.y <= rrF.y + 0.5) continue;",
                "\t\tvec2 rrSight2 = rrF.xz - rrCutEye.xz;",
                "\t\tfloat rrSight2Length = length(rrSight2);",
                "\t\tif (rrSight2Length <= 0.001) continue;",
                "\t\tvec2 rrSight2Dir = rrSight2 / rrSight2Length;",
                "\t\tvec2 rrToHere2 = vRRWorldPos.xz - rrCutEye.xz;",
                "\t\tfloat rrAlong2 = dot(rrToHere2, rrSight2Dir);",
                "\t\tif (rrAlong2 <= 0.0 || rrAlong2 >= rrSight2Length - 0.3) continue;",
                "\t\tfloat rrOff2 = length(rrToHere2 - rrSight2Dir * rrAlong2);",
                "\t\tfloat rrLineY = rrCutEye.y + (rrF.y - rrCutEye.y) * (rrAlong2 / rrSight2Length);",
                "\t\tif (rrOff2 < rrGhostWidth * (rrAlong2 / rrSight2Length) && rrLineY - 1.0 < rrF.y + 3.5) { rrInWay = true; break; }",
                "\t}",
                "}",
                // What a Tactical battle has opened is cut at a level, whole under it and gone over it: the storey
                // above its floor over a house, a wall in the way down to its foot. A face is asked a hair inside
                // the cell it belongs to, so a wall's own face on a box's edge goes with its wall. What lies under
                // the lowest cut, or outside the one box everything open lies in, asks about no box: a floor, the
                // rest of the map. The buildings' footprints are asked first, and the walls cut low only by what
                // lies in one: a building that is not open asks about a handful of boxes, not all of them.
                "if (rrOpenCount > 0 && vRRWorldPos.y > rrOpenLow) {",
                "\tvec2 rrOpenAt = vRRWorldPos.xz - rrFaceN.xz * 0.02;",
                "\tif (rrOpenAt.x >= rrOpenAll.x && rrOpenAt.y >= rrOpenAll.y && rrOpenAt.x <= rrOpenAll.z && rrOpenAt.y <= rrOpenAll.w) {",
                "\t\tfloat rrOpenCut = 1e9;",
                "\t\tfor (int rrJ = 0; rrJ < " + openings + "; rrJ++) {",
                "\t\t\tif (rrJ >= rrOpenFeet) break;",
                "\t\t\tvec4 rrOpen = rrOpenBox[rrJ];",
                "\t\t\tif (rrOpenAt.x >= rrOpen.x && rrOpenAt.y >= rrOpen.y && rrOpenAt.x <= rrOpen.z && rrOpenAt.y <= rrOpen.w) rrOpenCut = min(rrOpenCut, rrOpenTop[rrJ]);",
                "\t\t}",
                "\t\tif (rrOpenCut < 1e8) {",
                "\t\t\tfor (int rrJ = 0; rrJ < " + openings + "; rrJ++) {",
                "\t\t\t\tif (rrJ >= rrOpenCount) break;",
                "\t\t\t\tif (rrJ < rrOpenFeet) continue;",
                "\t\t\t\tvec4 rrOpen = rrOpenBox[rrJ];",
                "\t\t\t\tif (rrOpenAt.x >= rrOpen.x && rrOpenAt.y >= rrOpen.y && rrOpenAt.x <= rrOpen.z && rrOpenAt.y <= rrOpen.w) rrOpenCut = min(rrOpenCut, rrOpenTop[rrJ]);",
                "\t\t\t}",
                "\t\t\tif (vRRWorldPos.y > rrOpenCut) discard;",
                "\t\t}",
                "\t}",
                "}",
                "if (rrGhost > 0.5) { if (!rrInWay) discard; } else if (rrInWay) discard;"
            ].join("\n\t")
                // Scenery in the way of a battle's units is cut off above its foot; a body never is.
                : "if (max(rrCutBody * rrCutBattle, rrCutBody - 1.0) < 0.5 && vRRWorldPos.y > rrFightStump) discard;",
            "if (rrCutRadius > 0.0 && max(rrCutBody * rrCutBattle, rrCutBody - 1.0) < 0.5 && vRRWorldPos.y > rrCutFocus.y - 1.2) {",
            "\tvec3 rrSight = rrCutFocus - rrCutEye;",
            "\tfloat rrSightLength = length(rrSight);",
            "\tif (rrSightLength > 0.001) {",
            "\t\tvec3 rrSightDir = rrSight / rrSightLength;",
            "\t\tvec3 rrToHere = vRRWorldPos - rrCutEye;",
            "\t\tfloat rrAlong = dot(rrToHere, rrSightDir);",
            // A model stops well short of the party: the party's own models
            // stand around the focus and must never thin. A wall stops short
            // by a hair, since a wall the party stands against is in the way.
            material.__reactorPieces ? "\t\tif (false) {" : "\t\tif (rrAlong > 0.0 && rrAlong < rrSightLength - 3.5) {",
            "\t\t\tfloat rrOff = length(rrToHere - rrSightDir * rrAlong);",
            "\t\t\tfloat rrThin = (1.0 - smoothstep(rrCutRadius * 0.6, rrCutRadius, rrOff)) * 0.92;",
            "\t\t\tif (rrThin > 0.0) {",
            "\t\t\t\tvec2 rrPx = floor(gl_FragCoord.xy);",
            "\t\t\t\tfloat rrA = mod(rrPx.x, 2.0), rrB = mod(rrPx.y, 2.0);",
            "\t\t\t\tfloat rrC = mod(floor(rrPx.x * 0.5), 2.0), rrD = mod(floor(rrPx.y * 0.5), 2.0);",
            "\t\t\t\tfloat rrBayer = (4.0 * (2.0 * rrA + rrB * (3.0 - 4.0 * rrA)) + (2.0 * rrC + rrD * (3.0 - 4.0 * rrC)) + 0.5) / 16.0;",
            "\t\t\t\tif (rrBayer < rrThin) discard;",
            "\t\t\t}",
            "\t\t}",
            "\t}",
            "}",
            "#include <map_fragment>",
            ""
        ].join("\n\t")
    );
};

/**
 * What stands over a character's head on its cell — a roof, a floor above —
 * as the footprint the cut should reach: the building it belongs to, or
 * a stretch of map around the cell for pieces laid by hand. Null in the open.
 */
Reactor3D.pieceCoverAt = function(mapData, wx, wz, near) {
    const index = this.pieceIndex(mapData);
    if (!index) return null;
    const x = Math.floor(wx), y = Math.floor(wz);
    const stack = index.cells.get(y * 65536 + x);
    if (!stack) return null;
    const base = this.elevationAt(mapData, x, y) + this.terrainHeightAt(mapData, wx, wz);
    const head = (Number.isFinite(near) ? near : 0) - base + this.PIECE_STOREY - 0.5;
    // A ladder going up past a climber is not a roof over it.
    const cover = stack.find(piece => piece.z >= head - 1e-6 && piece.kind !== "doorway" && piece.kind !== "ladder");
    if (!cover) return null;
    const box = cover.group ? index.groups.get(cover.group) : null;
    // A hair past the outer faces: a face on the box's own edge interpolates
    // a whisker outside it and escaped the cut (the whole upper west wall,
    // seen from the west, dithered into a mess).
    // The building's own box and a stretch of map around the player, whichever
    // reaches further each way: pieces laid by hand beside a building, or the
    // next building over, stood uncut in the picture otherwise.
    const m = this.CUTAWAY_MARGIN, r = this.CUTAWAY_REACH;
    const reach = { x0: x - r, y0: y - r, x1: x + r + 1, y1: y + r + 1 };
    return box ? { x0: Math.min(box.x0 - m, reach.x0), y0: Math.min(box.y0 - m, reach.y0), x1: Math.max(box.x1 + 1 + m, reach.x1), y1: Math.max(box.y1 + 1 + m, reach.y1) } : reach;
};
Reactor3D.CUTAWAY_MARGIN = 0.05;
/** How far under the storey's top the cut plane sits: under a doorway's header. */
Reactor3D.CUTAWAY_DROP = 0.65;
/** How far, in tiles, the top cut reaches around a player under hand-laid pieces. */
Reactor3D.CUTAWAY_REACH = 24;

/**
 * Each frame in the game: the cut follows the player and the camera. A
 * player under a roof loses everything above the storey they stand in,
 * but only while the camera looks in from above that cut: a camera that
 * is itself under the ceiling (first person, a low third-person orbit)
 * has nothing overhead in its way, and cutting the ceiling from it would
 * show the sky through the room. A wall between the camera and the
 * player is opened whether they are inside or out.
 */
/**
 * `others`: the characters beside the player a wall must not hide either
 * (followers, the nearest events), up to CUTAWAY_FOCI in all.
 */
Reactor3D.MapScene.prototype.updateCutaway = function(camera, mapData, character, others) {
    const shared = Reactor3D.cutawayUniforms();
    const frame = (this._cutFrame = (this._cutFrame || 0) + 1);
    Reactor3D._cutFrameNow = frame;
    // A placed model thins where it stands near the line from the eye to the player (a bough, a cart), and over a
    // tactical battle's ground. In a battle characters stand all along that line and all over that ground, and each
    // was drawn as a dithered ghost: characters are not cover. Theirs are marked as the battle begins and a few
    // times a second after, and the fades pass them by while the battle runs. (Before anything returns: a map with
    // nothing built has bodies too.)
    const battle = !!camera && Reactor3D.cutawayInBattle();
    if (battle && (!shared.rrCutBattle.value || frame % Reactor3D.CUTAWAY_BODY_FRAMES === 1)) Reactor3D.cutawayMarkBodies(character);
    shared.rrCutBattle.value = battle ? 1 : 0;
    if (!camera || !mapData || !character || !Reactor3D.hasPieces(mapData)) {
        shared.rrCutTop.value = 1e9;
        shared.rrCutRadius.value = 0;
        if (this._cutLook) this.setCutLook(false);
        return;
    }
    const x = (Number.isFinite(character._realX) ? character._realX : character.x || 0) + 0.5;
    const z = (Number.isFinite(character._realY) ? character._realY : character.y || 0) + 0.5;
    // Where the character is, not the ground under it: in a jump, a fall, on a
    // ladder or diving, the ground is far below, and a corridor aimed there ran
    // through the character itself (its model dithered away) and down through
    // whatever stood below (a whole building's face seen through).
    const standing = c => Reactor3D.characterGround(mapData, c) + (Number(c._reactorAir) || 0);
    const ground = standing(character);
    const covered = Reactor3D.pieceCoverAt(mapData, x, z, ground);
    const eye = camera.getWorldPosition(Reactor3D._cutEye || (Reactor3D._cutEye = new THREE.Vector3()));
    // Below a doorway's header (the top 0.6 of the storey), which a cut through it left as a floating sliver.
    const cutTop = covered ? Math.floor(ground + 1e-6) + Reactor3D.PIECE_STOREY - Reactor3D.CUTAWAY_DROP : 1e9;
    shared.rrCutTop.value = eye.y > cutTop ? cutTop : 1e9;
    if (covered) { shared.rrCutBox.value[0] = covered.x0; shared.rrCutBox.value[1] = covered.y0; shared.rrCutBox.value[2] = covered.x1; shared.rrCutBox.value[3] = covered.y1; }
    // The see-through pass is live whenever the corridor is: a wall between
    // the camera and the party is seen through inside a building or out.
    if (!this._cutLook) this.setCutLook(true);
    const cutState = shared.rrCutTop.value === 1e9 ? "none" : shared.rrCutTop.value + ":" + shared.rrCutBox.value.join(",");
    if (cutState !== this._cutState) {
        this._cutState = cutState;
        if (Reactor3D.Shadows && Reactor3D.Shadows.invalidate) Reactor3D.Shadows.invalidate();
        if (this.updateCutCaps) this.updateCutCaps(mapData, shared.rrCutTop.value, cutState === "none" ? null : shared.rrCutBox.value);
    }
    shared.rrCutEye.value[0] = eye.x; shared.rrCutEye.value[1] = eye.y; shared.rrCutEye.value[2] = eye.z;
    shared.rrCutFocus.value[0] = x; shared.rrCutFocus.value[1] = ground + 1.5; shared.rrCutFocus.value[2] = z;
    const foci = shared.rrCutFoci.value;
    if (battle) {
        // The fade stops CUTAWAY_PARTY_ROOM short of the line's end, so the party standing there never thins. With
        // the party marked, a battle needs no such room, and its camera can stand nearer than that: the line is
        // carried on past the player, so a bough right behind the player's back thins too. Not for an eye in or
        // over the player's head (first person, a camera hard against a wall): that line points at the ground.
        const focus = shared.rrCutFocus.value, dx = focus[0] - eye.x, dy = focus[1] - eye.y, dz = focus[2] - eye.z;
        if (Math.hypot(dx, dz) >= 1) {
            const on = (Reactor3D.CUTAWAY_PARTY_ROOM - Reactor3D.CUTAWAY_BATTLE_ROOM) / Math.hypot(dx, dy, dz);
            focus[0] += dx * on; focus[1] += dy * on; focus[2] += dz * on;
        }
    }
    // A corridor only for who something built really hides: a rim, a bench or a counter the eye sees over is not
    // cover, and a corridor through it was a box cut out of it at the character's feet.
    let count = 0;
    if (Reactor3D.cutawayHides(mapData, eye, character, x, ground, z, true, frame)) { foci[0] = x; foci[1] = ground + 1.5; foci[2] = z; count = 1; }
    let slot = 0;
    for (const other of others || []) {
        if (count >= Reactor3D.CUTAWAY_FOCI) break;
        if (!other) continue;
        slot++;
        const ox = (Number.isFinite(other._realX) ? other._realX : other.x || 0) + 0.5;
        const oz = (Number.isFinite(other._realY) ? other._realY : other.y || 0) + 0.5;
        const og = standing(other);
        // One of the company is looked at afresh each frame, in turn; the rest keep their last answer.
        if (!Reactor3D.cutawayHides(mapData, eye, other, ox, og, oz, slot % Reactor3D.CUTAWAY_FOCI === frame % Reactor3D.CUTAWAY_FOCI, frame)) continue;
        foci[count * 3] = ox; foci[count * 3 + 1] = og + 1.5; foci[count * 3 + 2] = oz;
        count++;
    }
    shared.rrCutFocusCount.value = count;
    shared.rrCutRadius.value = Reactor3D.CUTAWAY_RADIUS;
    this.cullCutGhosts(eye, foci, count, shared.rrGhostWidth.value);
};

/** The kill switch: false shows every ghost while the cut is on, as before. */
Reactor3D.CUT_GHOST_CULL = true;
/**
 * The ghosts this frame draws: those whose chunk a corridor crosses. A ghost
 * shows only inside a corridor (its shader discards the rest), and with every
 * ghost shown the whole of the pieces was drawn a second time each frame to be
 * thrown away, corridor or none. Nobody hidden shows none.
 */
Reactor3D.MapScene.prototype.cullCutGhosts = function(eye, foci, count, width) {
    const ghosts = this._pieceGhosts || [];
    if (Reactor3D.CUT_GHOST_CULL === false) {
        if (this._cutGhostsCulled) { this._cutGhostsCulled = false; this._cutGhostsHidden = null; for (const ghost of ghosts) ghost.visible = true; }
        return;
    }
    this._cutGhostsCulled = true;
    if (!(count > 0)) {
        // Hidden once, and again when chunks were laid since.
        if (this._cutGhostsHidden !== ghosts || this._cutGhostsHiddenCount !== ghosts.length) {
            for (const ghost of ghosts) ghost.visible = false;
            this._cutGhostsHidden = ghosts;
            this._cutGhostsHiddenCount = ghosts.length;
        }
        return;
    }
    this._cutGhostsHidden = null;
    const reach = (Number(width) || 0) + 0.1;
    for (const ghost of ghosts) {
        // The chunk's footprint in the world, measured once (a chunk laid again is a new mesh).
        const geometry = ghost.geometry;
        // One that cannot be measured stays shown.
        if (!geometry || !ghost.userData) { ghost.visible = true; continue; }
        let box = ghost.userData.rrGhostBox;
        if (!box) {
            if (!geometry.boundingBox) geometry.computeBoundingBox();
            ghost.updateWorldMatrix(true, false);
            const bounds = Reactor3D._ghostBounds || (Reactor3D._ghostBounds = new THREE.Box3());
            bounds.copy(geometry.boundingBox).applyMatrix4(ghost.matrixWorld);
            box = ghost.userData.rrGhostBox = [bounds.min.x, bounds.min.z, bounds.max.x, bounds.max.z];
        }
        let crossed = false;
        for (let i = 0; i < count && !crossed; i++) {
            crossed = Reactor3D.segmentCrossesRect(eye.x, eye.z, foci[i * 3], foci[i * 3 + 2], box[0] - reach, box[1] - reach, box[2] + reach, box[3] + reach);
        }
        ghost.visible = crossed;
    }
};

/** Whether the segment (ax, ay) to (bx, by) touches the rectangle (x0, y0) to (x1, y1). */
Reactor3D.segmentCrossesRect = function(ax, ay, bx, by, x0, y0, x1, y1) {
    if (!(x0 <= x1) || !(y0 <= y1)) return false;
    const dx = bx - ax, dy = by - ay;
    let t0 = 0, t1 = 1;
    if (dx === 0) { if (ax < x0 || ax > x1) return false; }
    else {
        let a = (x0 - ax) / dx, b = (x1 - ax) / dx;
        if (a > b) { const swap = a; a = b; b = swap; }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) return false;
    }
    if (dy === 0) { if (ay < y0 || ay > y1) return false; }
    else {
        let a = (y0 - ay) / dy, b = (y1 - ay) / dy;
        if (a > b) { const swap = a; a = b; b = swap; }
        if (a > t0) t0 = a;
        if (b < t1) t1 = b;
        if (t0 > t1) return false;
    }
    return true;
};

/** Whether a battle runs on the map being played (never in the editor, which has no game). */
Reactor3D.cutawayInBattle = function() {
    const fight = typeof $gameFight !== "undefined" ? $gameFight : null;
    return !!(fight && typeof fight.isHere === "function" && fight.isHere());
};
/** How often, in frames, a battle's characters are looked over for models not yet marked as bodies. */
Reactor3D.CUTAWAY_BODY_FRAMES = 30;
/** How far short of the player the model fade stops, in tiles: the shader's own number, and a battle's. */
Reactor3D.CUTAWAY_PARTY_ROOM = 3.5;
Reactor3D.CUTAWAY_BATTLE_ROOM = 0.6;

/**
 * Marks the models of everyone in a battle's picture as bodies the fades leave whole: the player, the followers,
 * the battle's units, and every other character on the map (scenery, the placed models, is not one). A model
 * instance is marked once; one that arrives later is found on a later look. The mark stays on the material and
 * counts only while a battle runs here (`rrCutBattle`): nothing is walked again to take it off.
 */
Reactor3D.cutawayMarkBodies = function(player) {
    this.cutawayMarkBody(player);
    if (typeof $gamePlayer !== "undefined" && $gamePlayer) {
        // A tactical view follows the unit whose turn it is: the player is a body whoever that is.
        if ($gamePlayer !== player) this.cutawayMarkBody($gamePlayer);
        if ($gamePlayer.followers) for (const follower of $gamePlayer.followers().visibleFollowers()) this.cutawayMarkBody(follower);
    }
    if (typeof $gameMap === "undefined" || !$gameMap || !$gameMap.events) return;
    const scenery = this.PROP_EVENT_BASE || 10000;
    for (const event of $gameMap.events()) {
        if (event && typeof event.eventId === "function" && event.eventId() < scenery) this.cutawayMarkBody(event);
    }
};
Reactor3D.cutawayMarkBody = function(character) {
    const holder = character && this.modelHolderFor ? this.modelHolderFor(character) : null;
    const object = holder && holder.object;
    if (!object || typeof object.traverse !== "function") return false;
    // What the character holds is part of its body: a weapon comes to the hand after the body was marked.
    const held = this.MapHeld && this.MapHeld.count ? this.MapHeld.states.get(this.modelInstanceKey(character)) : null;
    const thing = held && held.character === character && held.record ? held.record.object : null;
    if (thing && !thing.__rrCutBody && typeof thing.traverse === "function") { thing.__rrCutBody = true; this.cutawayMarkMaterials(thing); }
    if (object.__rrCutBody) return false;
    object.__rrCutBody = true;
    this.cutawayMarkMaterials(object);
    return true;
};
/**
 * A ridden vehicle is its rider's body, battle or none (`on`), and scenery again when it is left: the fades that
 * thin what stands between the eye and the party pass it by, however far behind its rider it reaches. Instances of
 * one model share their materials, so each material counts who rides.
 */
Reactor3D.cutawayMarkRide = function(object, on) {
    if (!object || typeof object.traverse !== "function" || !!object.__rrCutRide === !!on) return false;
    object.__rrCutRide = !!on;
    object.traverse(node => {
        const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : null;
        if (!materials) return;
        for (const material of materials) {
            material.userData = material.userData || {};
            const mark = material.userData.rrCutBody || (material.userData.rrCutBody = { value: 0 });
            const rides = material.userData.rrCutRides = Math.max(0, (material.userData.rrCutRides || 0) + (on ? 1 : -1));
            // (2: a body always. 1: a body while a battle runs, as it was marked.)
            if (rides > 0) { if (mark.value < 2) { material.userData.rrCutWas = mark.value; mark.value = 2; } }
            else if (mark.value >= 2) mark.value = material.userData.rrCutWas || 0;
        }
    });
    return true;
};
/** Every material of a model is told it is a body's. */
Reactor3D.cutawayMarkMaterials = function(object) {
    object.traverse(node => {
        const materials = Array.isArray(node.material) ? node.material : node.material ? [node.material] : null;
        if (!materials) return;
        for (const material of materials) {
            material.userData = material.userData || {};
            // (A ridden vehicle's is a body already, and stays one when the battle is over.)
            if (material.userData.rrCutBody) { if (material.userData.rrCutBody.value < 2) material.userData.rrCutBody.value = 1; else material.userData.rrCutWas = 1; }
            else material.userData.rrCutBody = { value: 1 };
        }
    });
    return true;
};

/**
 * Whether something built stands between the eye and a character: on the line to its chest or to its head. The
 * answer is kept per character and looked at again when `fresh`, or when it is `CUTAWAY_FOCI` frames old.
 */
Reactor3D.cutawayHides = function(mapData, eye, character, x, ground, z, fresh, frame) {
    const memo = this._cutHides || (this._cutHides = new WeakMap());
    let kept = memo.get(character);
    if (!kept) memo.set(character, kept = { frame: -1e9, hides: false, last: -1e9, open: -1e9 });
    else if (!fresh && frame - kept.frame < this.CUTAWAY_FOCI && frame >= kept.frame) { if (kept.hides) kept.open = frame; return kept.hides; }
    if (frame < kept.last) kept.last = -1e9;
    kept.frame = frame;
    const to = this._cutTo || (this._cutTo = { x: 0, y: 0, z: 0 });
    to.x = x; to.z = z;
    let hides = false;
    for (let i = 0; i < 2 && !hides; i++) {
        to.y = ground + (i ? this.CUTAWAY_HEAD : 1.5);
        const length = Math.hypot(to.x - eye.x, to.y - eye.y, to.z - eye.z);
        // Up to the character itself: what it stands against (a wall at its back) hides nothing of it.
        hides = length > 0.6 && this.sightBuilt(mapData, eye, to, length - 0.5);
    }
    if (hides) kept.last = frame;
    // A corridor stays open a moment after its wall was last met: a line that grazes a corner does not flicker.
    kept.hides = hides || frame - kept.last < this.CUTAWAY_HOLD;
    if (kept.hides) kept.open = frame;
    return kept.hides;
};

/**
 * Whether what is built is opened for a character standing at a point of the map: a corridor is being held open
 * to it, or it stands on a battle's ground, which nothing built may hide (reactor_fight_tactical.js). Who the
 * picture shows through a wall is in plain view: a number or an animation on it is shown too.
 */
Reactor3D.cutawayShows = function(character, wx, wz) {
    const shared = this._cutawayUniforms;
    if (!shared) return false;
    const box = shared.rrFightBox.value;
    if (box[2] > box[0] && wx >= box[0] && wz >= box[1] && wx <= box[2] && wz <= box[3]) return true;
    if (!(shared.rrCutRadius.value > 0) || !character || !this._cutHides) return false;
    const kept = this._cutHides.get(character), age = kept ? this._cutFrameNow - kept.open : -1;
    return age >= 0 && age <= 1;
};
/** How high over its feet a character's head is taken to be when asking whether a wall hides it, in tiles. */
Reactor3D.CUTAWAY_HEAD = 2.6;
/** Frames a corridor stays open after the last frame something was found in the way. */
Reactor3D.CUTAWAY_HOLD = 20;

/** Whether a piece stands on the first `reach` tiles of the line from one point to another (posts and rails aside). */
Reactor3D.sightBuilt = function(mapData, from, to, reach) {
    if (!this.hasPieces(mapData)) return false;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    if (!(length > 1e-6) || !(reach > 0)) return false;
    const end = Math.min(reach, length), thin = this.CAMERA_ARM_THIN;
    for (let d = 0.15; d < end; d += 0.3) {
        const t = d / length;
        if (this.pieceSolidAt(mapData, from.x + dx * t, from.y + dy * t, from.z + dz * t, null, thin)) return true;
    }
    return false;
};
Reactor3D.MapScene.prototype.setCutLook = function(on) {
    for (const ghost of this._pieceGhosts || []) ghost.visible = on;
    this._cutLook = on;
    this._cutGhostsHidden = null;
};

/**
 * Whether a world point is inside something built. A wall, block, window,
 * pane or pillar fills its cell to its height (a floor is open; a stair or
 * ramp counts under its slope); a doorway is open under its lintel; a shape
 * is its own outline at its own height (a lamp post is its post, not its
 * cell; a cone narrows to its point; a slab laid at a tilt is where it
 * lies); a rock is solid up to its surface; a door is solid while its leaf
 * stands shut. Pieces the cutaway has removed (above `cut.top` inside
 * `cut.box`) are not solid: the camera may sit where a roof was. With
 * `thin`, what is narrower than that many tiles (a post, a rail, a pillar)
 * is let through: a camera does not come in for it. `doors` says how a
 * way through counts: `DOORS_OPEN`, a doorway and a door are open air at
 * every height, lintel and all (the map's own camera trails its player
 * through them); `DOORS_CLOSING`, a door on its way shut is shut already.
 */
Reactor3D.DOORS_OPEN = 1;
Reactor3D.DOORS_CLOSING = 2;
Reactor3D.pieceSolidAt = function(mapData, wx, wy, wz, cut, thin, doors) {
    const index = this.pieceIndex(mapData);
    if (!index) return false;
    const x = Math.floor(wx), y = Math.floor(wz);
    const stack = index.cells.get(y * 65536 + x);
    if (!stack) return false;
    if (cut && wy > cut.top && wx >= cut.box[0] && wz >= cut.box[1] && wx <= cut.box[2] && wz <= cut.box[3]) return false;
    const base = this.pieceBaseAt(mapData, x, y);
    const h = wy - base;
    const u = wx - x, v = wz - y;
    const slim = thin > 0 ? thin : 0;
    for (const piece of stack) {
        const kind = piece.kind;
        if (kind === "floor") continue;
        if (kind === "doorway") {
            if (doors !== 1 && h >= piece.z + this.PIECE_STOREY - this.DOORWAY_LINTEL && h <= piece.z + this.PIECE_STOREY) return true;
            continue;
        }
        if (kind === "door") { if (doors !== 1 && this.doorSolidAt(piece, h, doors === 2)) return true; continue; }
        if (Number.isFinite(piece.rockTop)) { if (h >= piece.z && h <= piece.rockTop) return true; continue; }
        if (this.isShapeKind(kind)) { if (this.shapeHolds(mapData, piece, wx, wy, wz, base, slim)) return true; continue; }
        if (slim && (kind === "pillar" || kind === "fence" || kind === "ladder")) continue;
        if (h < piece.z || h > piece.z + this.pieceHeight(kind)) continue;
        if (kind === "stair" || kind === "ramp") { if (h > this.pieceTop(piece, u, v)) continue; }
        return true;
    }
    return false;
};
/** How deep a doorway's lintel hangs under the top of its storey, in tiles (the band `pieceShapes` draws). */
Reactor3D.DOORWAY_LINTEL = 0.6;

/**
 * Whether a height over a door's cell is in the door: the wall over its
 * leaves always, and the leaves themselves while they stand across the
 * doorway (`doorShut`: what stops a shot or a look stops a camera). A gate
 * has nothing over it. With `closing`, leaves on their way shut count from
 * the moment they begin to swing: a camera starts in before they meet.
 */
Reactor3D.doorSolidAt = function(piece, h, closing) {
    if (h < piece.z) return false;
    const leaf = this.doorLeafHeight ? this.doorLeafHeight(piece) : 3.6;
    if (h > piece.z + leaf) return piece.style !== "gate" && h <= piece.z + this.PIECE_STOREY;
    if (closing && this.doorClosing(piece)) return true;
    return !!this.doorShut && this.doorShut(piece);
};
/** Whether a door is shut or swinging shut (the game's doors only: nothing swings in the editor). */
Reactor3D.doorClosing = function(piece) {
    const state = this._doorStates && piece ? this._doorStates.get(piece.id) : null;
    return !!state && !state.open;
};

/**
 * A shape's own frame, kept per piece: its middle, its size, the turn that
 * takes a world offset into it, and for one laid at a tilt or a roll how
 * high its middle stands over its foot.
 */
Reactor3D.shapeFrame = function(piece) {
    const memo = this._shapeFrameMemo || (this._shapeFrameMemo = new WeakMap());
    let frame = memo.get(piece);
    if (frame) return frame;
    const [w, h, d] = this.shapeSize(piece);
    const [cx, cz] = this.shapeCentre(piece);
    const rad = deg => (Number(deg) || 0) * Math.PI / 180;
    const yaw = rad((Number(piece.angle) || 0) + (Number(piece.rot) || 0) * 90), tilt = rad(piece.tilt), roll = rad(piece.roll);
    const params = this.shapeParams(piece);
    frame = { w, h, d, cx, cz, cos: Math.cos(yaw), sin: Math.sin(yaw), turned: this.shapeTurned(piece), lift: 0,
        ct: Math.cos(tilt), st: Math.sin(tilt), cr: Math.cos(roll), sr: Math.sin(roll),
        sweep: params.sweep, thick: params.thick, taper: params.taper === undefined ? 1 : params.taper, narrow: Math.max(w, d) };
    if (frame.turned) {
        // Its lowest corner rests at its height (`shapePlacer`): its middle stands this far over that.
        frame.lift = this.shapePlacer(piece, 0)(0.5, 0.5, 0.5)[1] - (Number(piece.z) || 0);
        // A post lying down is still a post: the two lesser sides say how thin it is.
        frame.narrow = [w, h, d].sort((a, b) => a - b)[1];
    }
    memo.set(piece, frame);
    return frame;
};

/** Whether a world point is inside a shape (see `pieceSolidAt`). `cellBase` is the ground of the cell the point is in. */
Reactor3D.shapeHolds = function(mapData, piece, wx, wy, wz, cellBase, slim) {
    const f = this.shapeFrame(piece);
    if (slim && f.narrow < slim) return false;
    // A shape is drawn from the ground of the cell it stands on, whichever of its cells the point is over.
    const base = Array.isArray(piece.anchor) ? this.pieceBaseAt(mapData, piece.anchor[0], piece.anchor[1]) : cellBase;
    const px = wx - f.cx, pz = wz - f.cz;
    let lx = px * f.cos + pz * f.sin, lz = -px * f.sin + pz * f.cos;
    const hw = f.w / 2, hd = f.d / 2, kind = piece.kind;
    if (f.turned) {
        // Back through the tilt and the roll, about its middle.
        const qy = wy - base - (Number(piece.z) || 0) - f.lift;
        const y1 = qy * f.ct + lz * f.st;
        lz = -qy * f.st + lz * f.ct;
        const x0 = lx * f.cr + y1 * f.sr, y0 = -lx * f.sr + y1 * f.cr;
        if (Math.abs(y0) > f.h / 2) return false;
        return this.shapeSolidAt(kind, x0, lz, hw, hd, 0, f.sweep, f.thick);
    }
    const t = (wy - base - (Number(piece.z) || 0)) / f.h;
    if (!(t >= 0 && t <= 1)) return false;
    // How much of its outline is left at this height.
    let k = 1;
    switch (kind) {
        case "cone": case "pyramid": k = 1 - t; break;
        case "hull": case "spike": k = 1 + (f.taper - 1) * t; break;
        case "dome": k = Math.sqrt(Math.max(0, 1 - t * t)); break;
        case "sphere": k = Math.sqrt(Math.max(0, 1 - (2 * t - 1) * (2 * t - 1))); break;
        case "wedge": return Math.abs(lx) <= hw && Math.abs(lz) <= hd && t <= lz / f.d + 0.5;
        case "prism": return Math.abs(lx) <= hw && Math.abs(lz) <= hd && t <= 1 - Math.abs(2 * lz / f.d);
        case "arch": case "tunnel": {
            if (Math.abs(lx) > hw || Math.abs(lz) > hd) return false;
            // The opening `pieceShapes` cuts: 0.7 of the width, round-topped from half the height.
            const du = lx / f.w;
            return !(Math.abs(du) < 0.35 && t < 0.5 + Math.sqrt(Math.max(0, 0.1225 - du * du)));
        }
        default: break;
    }
    if (!(k > 0)) return false;
    return this.shapeSolidAt(kind, lx, lz, hw * k, hd * k, 0, f.sweep, f.thick);
};

/**
 * How far a camera may stand from what it looks at. The way out from
 * `focus` toward `to` is walked in short steps (shorter where something is
 * built), and the first point under the ground or inside a piece ends it:
 * the answer is the distance to that point less a margin, never under
 * `least`, or the whole way when nothing is met. Posts and rails are
 * walked past (`CAMERA_ARM_THIN`): a camera that came in for each lamp
 * post would jump as it passed one. `Reactor3D.cameraArmHit` says whether
 * the last answer was cut short. `how`: "ground", only the ground counts
 * (what is built has been opened for what is looked at); "closing", a door
 * on its way shut counts as shut.
 */
Reactor3D.CAMERA_ARM_STEP = 0.2;
Reactor3D.CAMERA_ARM_MARGIN = 0.3;
Reactor3D.CAMERA_ARM_THIN = 0.8;
Reactor3D.cameraArmHit = false;
Reactor3D.cameraArm = function(mapData, focus, to, least, margin, step, how) {
    this.cameraArmHit = false;
    const dx = to.x - focus.x, dy = to.y - focus.y, dz = to.z - focus.z;
    const length = Math.hypot(dx, dy, dz);
    if (!mapData || !(length > 1e-6)) return length || 0;
    const built = how !== "ground" && this.hasPieces(mapData), thin = this.CAMERA_ARM_THIN, doors = how === "closing" ? this.DOORS_CLOSING : 0;
    const shared = this._cutawayUniforms;
    const cut = built && shared && shared.rrCutRadius.value > 0 ? this._armCut || (this._armCut = { top: 0, box: null }) : null;
    if (cut) { cut.top = shared.rrCutTop.value; cut.box = shared.rrCutBox.value; }
    const stride = step > 0 ? step : this.CAMERA_ARM_STEP;
    let clear = 0, d = Math.min(stride, length);
    for (;;) {
        if (this.cameraArmBlocked(mapData, focus, dx, dy, dz, d / length, built, cut, thin, doors)) {
            // Between the last clear point and this one, to a hair: a camera sliding along a wall does not step.
            let lo = clear, hi = d;
            for (let i = 0; i < 5; i++) {
                const mid = (lo + hi) / 2;
                if (this.cameraArmBlocked(mapData, focus, dx, dy, dz, mid / length, built, cut, thin, doors)) hi = mid; else lo = mid;
            }
            this.cameraArmHit = true;
            return Math.max(least || 0, lo - (margin >= 0 ? margin : this.CAMERA_ARM_MARGIN));
        }
        if (d >= length) return length;
        clear = d;
        // Half the stride where something is built: a slab a fifth of a tile thick is not stepped over.
        const here = built ? this.piecesAt(mapData, Math.floor(focus.x + dx * d / length), Math.floor(focus.z + dz * d / length)) : null;
        d = Math.min(length, d + (here ? stride / 2 : stride));
    }
};
/** One point of `cameraArm`'s way: under the ground (and a margin over it), or inside a piece. */
Reactor3D.cameraArmBlocked = function(mapData, focus, dx, dy, dz, t, built, cut, thin, doors) {
    const x = focus.x + dx * t, y = focus.y + dy * t, z = focus.z + dz * t;
    if (x >= 0 && z >= 0 && x < mapData.width && z < mapData.height && this.terrainHeightAt && this.elevationAt
        && y < this.elevationAt(mapData, Math.floor(x), Math.floor(z)) + this.terrainHeightAt(mapData, x, z) + this.CAMERA_GROUND_MARGIN) return true;
    return built && this.pieceSolidAt(mapData, x, y, z, cut, thin, doors);
};

/**
 * Keep a camera out of the walls. A wall *between* the camera and the
 * player is left alone: the sight-line fade sees through it, and a camera
 * shoved in against every interior wall was a close-up of the player's
 * back. Only a camera that would stand *inside* a solid piece moves: it
 * comes in along its own line of sight until it is out of that solid,
 * plus a margin. A doorway and a door are no solid to it, lintel and all:
 * a camera trailing its player out of a house passes over the door, and
 * coming in for that one cell was a jump. Nothing happens on a map without
 * pieces.
 */
Reactor3D.clearCameraPath = function(camera, focus, mapData) {
    if (!camera || !focus || !mapData || !this.hasPieces(mapData)) return false;
    const shared = this._cutawayUniforms;
    const cut = shared && shared.rrCutRadius.value > 0 ? { top: shared.rrCutTop.value, box: shared.rrCutBox.value } : null;
    const to = camera.position;
    if (!this.pieceSolidAt(mapData, to.x, to.y, to.z, cut, 0, this.DOORS_OPEN)) return false;
    const from = focus;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 0.5) return false;
    const step = 0.2;
    let free = 0.5;
    for (let d = length - step; d >= 0.5; d -= step) {
        const t = d / length;
        if (!this.pieceSolidAt(mapData, from.x + dx * t, from.y + dy * t, from.z + dz * t, cut, 0, this.DOORS_OPEN)) { free = Math.max(0.5, d - 0.3); break; }
    }
    const t = free / length;
    camera.position.set(from.x + dx * t, from.y + dy * t, from.z + dz * t);
    camera.updateMatrixWorld();
    return true;
};

/**
 * Keep a camera out of the ground. The terrain is drawn one-sided, so a
 * camera below its surface (a third-person camera swung behind a pond's
 * bank while its swimmer dives) sees through it: the sky, the underside of
 * the map. It comes in along its line of sight to where the line leaves the
 * ground, plus a margin. Pieces are `clearCameraPath`'s.
 */
Reactor3D.CAMERA_GROUND_MARGIN = 0.35;
Reactor3D.clearCameraGround = function(camera, focus, mapData) {
    if (!camera || !focus || !mapData || !this.terrainHeightAt || !this.elevationAt) return false;
    const ground = (x, z) => this.elevationAt(mapData, Math.floor(x), Math.floor(z)) + this.terrainHeightAt(mapData, x, z);
    const inside = (x, y, z) => x >= 0 && z >= 0 && x < mapData.width && z < mapData.height && y < ground(x, z) + this.CAMERA_GROUND_MARGIN;
    const to = camera.position;
    if (!inside(to.x, to.y, to.z)) return false;
    const dx = to.x - focus.x, dy = to.y - focus.y, dz = to.z - focus.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 0.5) return false;
    // The first point out from the focus that is in the ground: the camera stops short of it.
    let free = length;
    for (let d = 0.2; d <= length; d += 0.1) {
        const t = d / length;
        if (inside(focus.x + dx * t, focus.y + dy * t, focus.z + dz * t)) { free = Math.max(0.3, d - 0.2); break; }
    }
    const t = free / length;
    camera.position.set(focus.x + dx * t, focus.y + dy * t, focus.z + dz * t);
    camera.updateMatrixWorld();
    return true;
};

/**
 * Keep a camera over the roof its player stands on. A roof is a shell: under its tiles there is
 * nothing solid, so a camera behind a player coming down a pitch sank through them and looked at the
 * roof from inside. The surface is followed out from the player's feet toward the camera (up the
 * pitch, over the ridge, down the far side; a wall standing over the roof is not part of it), and
 * the camera is lifted until its whole line to the player clears that surface, still looking where
 * it looked. Only for a body on built pieces under the open sky, and never an eye in the head.
 */
Reactor3D.CAMERA_ROOF_MARGIN = 0.6;
Reactor3D.CAMERA_ROOF_LIFT = 10;
Reactor3D.clearCameraRoof = function(camera, focus, mapData, feet) {
    if (!camera || !focus || !mapData || !Number.isFinite(feet) || !this.hasPieces(mapData)) return false;
    const to = camera.position;
    const dx = to.x - focus.x, dy = to.y - focus.y, dz = to.z - focus.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 1.5) return false;
    // On something built, with nothing over it.
    if (feet - this.pieceBaseAt(mapData, Math.floor(focus.x), Math.floor(focus.z)) < 0.5) return false;
    if (this.pieceCoverAt(mapData, focus.x, focus.z, feet)) return false;
    let surface = feet, lift = 0;
    const step = 0.25;
    for (let d = step; d <= length + 1e-6; d += step) {
        const t = Math.min(1, d / length);
        const x = focus.x + dx * t, z = focus.z + dz * t;
        if (x < 0 || z < 0 || x >= mapData.width || z >= mapData.height) break;
        const here = this.groundHeightAt(mapData, x, z, surface);
        // More than a roof's pitch up in one stride is a wall over the roof: clearCameraPath's.
        if (here - surface > step * this.ROOF_SLOPE_LIMIT + 0.6) break;
        surface = here;
        const short = surface + this.CAMERA_ROOF_MARGIN - (focus.y + dy * t);
        if (short > 0) lift = Math.max(lift, short / t);
    }
    if (!(lift > 0.01)) return false;
    lift = Math.min(lift, this.CAMERA_ROOF_LIFT);
    // What it looked at, it looks at still.
    const ahead = camera.getWorldDirection(this._roofAhead || (this._roofAhead = new THREE.Vector3()));
    const ax = to.x + ahead.x * length, ay = to.y + ahead.y * length, az = to.z + ahead.z * length;
    camera.position.set(to.x, to.y + lift, to.z);
    camera.lookAt(ax, ay, az);
    camera.updateMatrixWorld();
    return true;
};

/**
 * Whether a world point is in the hollow of a roof: under its tiles (a ramp, a slab laid at a tilt,
 * the ridge's strip of floor) and over the ceiling below them, where nothing is solid and a camera
 * would look at the roof from inside. A room is not one, up to its ceiling: that is a storey over
 * its floor. Nor is the open air under an eave, which has only the ground below it.
 */
Reactor3D.inRoofVoid = function(mapData, wx, wy, wz) {
    const index = this.pieceIndex(mapData);
    if (!index) return false;
    const x = Math.floor(wx), y = Math.floor(wz);
    const stack = index.cells.get(y * 65536 + x);
    if (!stack) return false;
    const base = this.pieceBaseAt(mapData, x, y), h = wy - base, u = wx - x, v = wz - y;
    // What is built under the point: the ceiling a hollow lies on.
    let under = 0;
    for (const piece of stack) {
        if (piece.kind === "ladder" || piece.kind === "doorway" || piece.kind === "door") continue;
        const slab = piece.kind === "box" && this.shapeTurned(piece);
        let top = this.pieceTop(piece, u, v);
        if (slab && Array.isArray(piece.anchor)) top += this.pieceBaseAt(mapData, piece.anchor[0], piece.anchor[1]) - base;
        if (top <= h + 0.05) { under = Math.max(under, top); continue; }
        // The first thing over the point, from the ground up.
        if (under <= 0.5) return false;
        if (piece.kind === "ramp" || slab) return true;
        return piece.kind === "floor" && piece.z > h && piece.z - under < this.PIECE_STOREY - 0.5;
    }
    return false;
};

/**
 * Keep a camera out of a roof's hollow, wherever its player is: it rises over the tiles above it,
 * still looking where it looked. A roof the cutaway has taken off (the player is under it) is left.
 */
Reactor3D.clearCameraAttic = function(camera, focus, mapData) {
    if (!camera || !focus || !mapData || !this.hasPieces(mapData)) return false;
    const to = camera.position;
    const shared = this._cutawayUniforms;
    if (shared && shared.rrCutRadius.value > 0 && to.y > shared.rrCutTop.value) {
        const box = shared.rrCutBox.value;
        if (to.x >= box[0] && to.z >= box[1] && to.x <= box[2] && to.z <= box[3]) return false;
    }
    if (!this.inRoofVoid(mapData, to.x, to.y, to.z)) return false;
    const over = this.groundHeightAt(mapData, to.x, to.z, 1e6) + this.CAMERA_ROOF_MARGIN;
    if (!(over > to.y) || over - to.y > this.CAMERA_ROOF_LIFT) return false;
    const length = Math.hypot(to.x - focus.x, to.y - focus.y, to.z - focus.z);
    const ahead = camera.getWorldDirection(this._roofAhead || (this._roofAhead = new THREE.Vector3()));
    const ax = to.x + ahead.x * length, ay = to.y + ahead.y * length, az = to.z + ahead.z * length;
    camera.position.set(to.x, over, to.z);
    camera.lookAt(ax, ay, az);
    camera.updateMatrixWorld();
    return true;
};

/** How wide the opening in a wall between the camera and the player is, in tiles. */
Reactor3D.CUTAWAY_RADIUS = 4.5;

Reactor3D.injectDissolve = function(material, shader) {
    if (!material || !shader || shader.fragmentShader.indexOf("vRRWorldPos") < 0) return;
    material.userData = material.userData || {};
    const dissolve = material.userData.rrDissolve || (material.userData.rrDissolve = { value: -1e9 });
    shader.uniforms.rrDissolve = dissolve;
    if (shader.fragmentShader.indexOf("uniform float rrDissolve;") >= 0) return;
    shader.fragmentShader = "uniform float rrDissolve;\n" + shader.fragmentShader.replace(
        "#include <map_fragment>",
        "if (vRRWorldPos.y < rrDissolve) discard;\n\t#include <map_fragment>"
    );
};

/**
 * Make a map material take the lights. Composes with whatever the material
 * already injects (UV clamps, billboard quads, straightened depth), and
 * extends its program cache key so a lit program is never shared with an
 * unlit one. A lit material's `color` stays its base colour: ambient reaches
 * it through the uniform, not through `syncLights`'s multiply.
 */
/** Zero-alpha blended tile pixels cannot affect colour or depth. */
Reactor3D.TransparentPixels = {
    enabled: true,
    install(material) {
        if (!material || material.__rrInvisiblePixels) return material;
        const flag = { value: 0 };
        material.__rrInvisiblePixels = flag;
        const compile = material.onBeforeCompile, key = material.customProgramCacheKey;
        const before = material.onBeforeRender;
        material.onBeforeRender = function(...args) {
            before.apply(this, args);
            flag.value = Reactor3D.TransparentPixels.enabled && this.transparent && !this.depthWrite
                && !this.stencilWrite && !this.alphaToCoverage && this.blending === THREE.NormalBlending ? 1 : 0;
        };
        material.onBeforeCompile = function(shader, renderer) {
            compile.call(this, shader, renderer);
            shader.uniforms.rrInvisiblePixels = flag;
            shader.fragmentShader = 'uniform int rrInvisiblePixels;\n' + shader.fragmentShader.replace(
                '#include <alphatest_fragment>',
                '#include <alphatest_fragment>\nif (rrInvisiblePixels != 0 && diffuseColor.a == 0.0) discard;');
        };
        material.customProgramCacheKey = function() { return key.call(this) + '|invisible-pixels'; };
        material.needsUpdate = true;
        return material;
    }
};

/**
 * Water as a volume, not a sheet: whatever is seen through water fades to
 * the water's colour by how much water lies between it and the eye. From
 * above, a pond's floor dims with depth; with the eye under the surface,
 * everything hazes with distance, the world above included. Each sheet has
 * its own colour and thickness (`fog`: the liquid's colour, how clear it is,
 * its glow lighting it from within; plain water its blue-green), so a dive
 * into a purple lake is purple. Up to four sheets (their box, level and
 * fog), per scene: `renderScene` loads the values a MapScene left in
 * `scene.userData.rrWater`, and a scene without any (a model preview)
 * clears them.
 */
Reactor3D.WATER_VOLUME_MAX = 4;
Reactor3D.waterVolumeUniforms = function() {
    if (!this._waterVolumeUniforms) {
        const max = this.WATER_VOLUME_MAX;
        this._waterVolumeUniforms = {
            rrWaterCount: { value: 0 },
            rrWaterBox: { value: Array.from({ length: max }, () => new THREE.Vector4()) },
            rrWaterLevel: { value: new Array(max).fill(-1e9) },
            // Per sheet: r, g, b and density. One flat array, so a frame that changes nothing sends nothing.
            rrWaterFog: { value: new Float32Array(max * 4) }
        };
    }
    return this._waterVolumeUniforms;
};

/**
 * Load a scene's water into the shared uniforms before it draws. The shader
 * lays the volumes on in the order they are loaded, and that order is the
 * same whatever order the map lists its sheets in: the larger boxes first
 * (where two boxes claim the same stretch of a line of sight, the smaller,
 * a pond in the corner of a lake's box, is laid over the larger), and the
 * sheet `camera`'s eye is in (waterEyeSheet) last of all, its colour being
 * the one nearest the eye. With the eye in a sheet, another sheet's volume
 * whose box holds the eye is left out: the eye is in one body of water, and
 * what is round it is that body's (the lake whose box takes in the pond
 * being dived in is not round the diver; where a river runs into a lake the
 * swimmer and all that is near are in the one the eye is in, not both).
 */
Reactor3D.useSceneWater = function(scene, camera) {
    if (typeof THREE === "undefined") return;
    const uniforms = this.waterVolumeUniforms();
    const water = scene && scene.userData && scene.userData.rrWater;
    const count = water ? Math.min(this.WATER_VOLUME_MAX, water.length) : 0;
    const eye = count > 1 && camera ? this.waterEyeSheet(water, count, camera) : null;
    const order = this._waterOrder || (this._waterOrder = new Int8Array(this.WATER_VOLUME_MAX));
    const ranks = this._waterRanks || (this._waterRanks = new Float64Array(this.WATER_VOLUME_MAX));
    let loaded = 0;
    for (let i = 0; i < count; i++) {
        const entry = water[i], own = eye !== null && entry.region === eye;
        if (eye !== null && !own && entry._rrAside) continue;
        const rank = own ? -1 : (entry.x1 - entry.x0) * (entry.z1 - entry.z0);
        let at = loaded++;
        for (; at > 0 && ranks[at - 1] < rank; at--) { order[at] = order[at - 1]; ranks[at] = ranks[at - 1]; }
        order[at] = i; ranks[at] = rank;
    }
    uniforms.rrWaterCount.value = loaded;
    // A volume that names no fog of its own is plain water (Reactor3D.WATER_FOG).
    const fogs = uniforms.rrWaterFog.value, plain = this.WATER_FOG;
    for (let slot = 0; slot < loaded; slot++) {
        const entry = water[order[slot]], fog = entry.fog;
        uniforms.rrWaterBox.value[slot].set(entry.x0, entry.z0, entry.x1, entry.z1);
        uniforms.rrWaterLevel.value[slot] = entry.level;
        fogs[slot * 4] = fog ? fog.x : plain[0]; fogs[slot * 4 + 1] = fog ? fog.y : plain[1]; fogs[slot * 4 + 2] = fog ? fog.z : plain[2]; fogs[slot * 4 + 3] = fog ? fog.w : plain[3];
    }
};

/**
 * The sheet the camera's eye is in, of the first `count` volumes: the one
 * whose water covers the eye's own cell with its surface above the eye. A
 * volume's box holds dry land too (a lake's box takes in its banks and
 * whatever pond lies in a corner of it), so the sheet is asked, not the box.
 * Where two sheets cover the cell (a river running into a lake) the higher
 * surface wins: it is the one a swimmer is at and the one seen from above.
 * Null when the eye is in none. Each volume is marked `_rrAside` when its
 * box holds the eye under its level.
 */
Reactor3D.waterEyeSheet = function(water, count, camera) {
    const world = this._waterEyeWorld || (this._waterEyeWorld = new THREE.Vector3());
    const point = this._waterEyePoint || (this._waterEyePoint = new THREE.Vector3());
    // A camera with no parent stands where its position says (its world matrix is written as it draws).
    if (camera.parent) world.setFromMatrixPosition(camera.matrixWorld); else world.copy(camera.position);
    let best = null, top = -Infinity;
    for (let i = 0; i < count; i++) {
        const entry = water[i], region = entry.region;
        entry._rrAside = world.y < entry.level && world.x >= entry.x0 && world.x <= entry.x1 && world.z >= entry.z0 && world.z <= entry.z1;
        if (!region || !entry.inverse) continue;
        point.copy(world).applyMatrix4(entry.inverse);
        const x = Math.floor(point.x), y = Math.floor(point.z);
        if (!this.waterCovers(region, x, y)) continue;
        const level = region.path ? this.riverCellLevel(region, x, y) : region.level;
        if (point.y < level && level > top) { best = region; top = level; }
    }
    return best;
};

/** Whether a world point is under one of the scene's water sheets (the eye, for the underwater wash). */
Reactor3D.underWaterAt = function(scene, x, y, z) {
    const water = scene && scene.userData && scene.userData.rrWater;
    if (!water) return null;
    for (const sheet of water) if (y < sheet.level && x >= sheet.x0 && x <= sheet.x1 && z >= sheet.z0 && z <= sheet.z1) return sheet;
    return null;
};

Reactor3D.WATER_VOLUME_GLSL = [
    "uniform int rrWaterCount;",
    "uniform vec4 rrWaterBox[" + 4 + "];",
    "uniform float rrWaterLevel[" + 4 + "];",
    "uniform vec4 rrWaterFog[" + 4 + "];",
    "varying vec3 vRRWaterPos;",
    "vec3 rrWaterTint(vec3 color) {",
    "	if (rrWaterCount == 0) return color;",
    "	vec3 P = vRRWaterPos, C = cameraPosition;",
    // In the order loaded (useSceneWater): the sheet the eye is in comes last, so its colour is the one seen.
    "	for (int i = 0; i < 4; i++) {",
    "		if (i >= rrWaterCount) break;",
    "		float yc = C.y - rrWaterLevel[i], yp = P.y - rrWaterLevel[i];",
    "		if (yc >= 0.0 && yp >= 0.0) continue;",
    // A to B: the stretch of the line of sight under this sheet's level.
    "		vec3 A = C, B = P;",
    "		if (yc >= 0.0) A = mix(C, P, yc / (yc - yp));",
    "		else if (yp >= 0.0) B = mix(C, P, yc / (yc - yp));",
    // Of that, only what lies over the sheet's own box is in its water: another sheet's water beside it is not.
    "		vec4 b = rrWaterBox[i];",
    "		vec2 d = B.xz - A.xz;",
    "		d = mix(d, vec2(1e-5), step(abs(d), vec2(1e-5)));",
    "		vec2 lo = (b.xy - A.xz) / d, hi = (b.zw - A.xz) / d;",
    "		vec2 rrIn = min(lo, hi), rrOut = max(lo, hi);",
    "		float span = min(min(rrOut.x, rrOut.y), 1.0) - max(max(rrIn.x, rrIn.y), 0.0);",
    "		if (span <= 0.0) continue;",
    "		vec4 rrFog = rrWaterFog[i];",
    "		color = mix(color, rrFog.rgb, 1.0 - exp(-length(B - A) * span * rrFog.a));",
    "	}",
    "	return color;",
    "}"
].join("\n");

/** The water volume on a material: its fragments dim through the water in front of them. The water sheet itself is exempt. */
Reactor3D.injectWaterVolume = function(material, shader) {
    if (!shader || (material && material.__reactorWater) || shader.fragmentShader.indexOf("#include <opaque_fragment>") < 0) return;
    const uniforms = this.waterVolumeUniforms();
    for (const key of Object.keys(uniforms)) shader.uniforms[key] = uniforms[key];
    shader.vertexShader = "varying vec3 vRRWaterPos;\n" + shader.vertexShader.replace(
        "#include <project_vertex>",
        "#include <project_vertex>\n\tvRRWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    // A lit surface also takes glowing water's sheen (its program has the light's own reading of that water), under the water's tint.
    const sheen = this.WaterLight && shader.fragmentShader.indexOf("vec3 rrWaterShone") >= 0 ? this.WaterLight.SHEEN_GLSL + "\n" : "";
    shader.fragmentShader = this.WATER_VOLUME_GLSL + "\n" + shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        sheen + "outgoingLight = rrWaterTint(outgoingLight);\n#include <opaque_fragment>");
};

/** The water volume on a material that is not lit (the sky). */
Reactor3D.waterVolumeMaterial = function(material) {
    if (!material || material.__reactorWaterVolume) return material;
    material.__reactorWaterVolume = true;
    const earlier = material.onBeforeCompile;
    material.onBeforeCompile = function(shader, renderer) {
        if (typeof earlier === "function") earlier.call(this, shader, renderer);
        Reactor3D.injectWaterVolume(this, shader);
    };
    const earlierKey = material.customProgramCacheKey;
    material.customProgramCacheKey = function() { return (typeof earlierKey === "function" ? earlierKey.call(this) : "") + "|water-volume"; };
    return material;
};

//-----------------------------------------------------------------------------
// Reflections
//
// A shiny surface (chrome, polished metal, glossy paint, mercury water)
// mirrors the world around it. The world is captured into a small cube
// map, one face a frame so the cost is spread thin: from inside the nearest
// mirror-bright model when there is one (so it shows what stands before
// it, the party too), else from the camera. The face that looks back toward
// the camera, the one a mirror shows, is taken every other frame; the rest
// in turn between. While a face is drawn, anything shiny in it reads the
// fixed studio gradient, so no draw reads the cube it is writing. Rougher
// surfaces read a blurrier mip level. Until the first capture completes, and
// on a weak GPU always, the studio gradient stands in.

/** The cube capture's face size: sharp enough to read a room in chrome (half on a middling GPU, see `reflectionSize`). */
Reactor3D.REFLECTION_SIZE = 512;
Reactor3D.reflectionSize = function() { return this.tier() === "full" ? this.REFLECTION_SIZE : this.REFLECTION_SIZE / 2; };

Reactor3D.Reflections = {
    _target: null,
    _camera: null,
    _face: 0,
    _tick: 0,
    _uniforms: null,
    _capturing: false,
    /** Set when something shiny is in the scene; a scene with none never captures. */
    wanted: false,
    // Frames counted by the capture's step, and the last one whose main draw showed anything shiny.
    _frame: 0,
    _shownFrame: -1,

    uniforms() {
        if (!this._uniforms) {
            // rrEnvProbe: where the live capture stood (xyz) and how far off its world is taken
            // to lie (w, 0 for infinitely far: the studio, or a capture from the camera).
            // rrSkyLight: the studio gradient's tint at the map's time of day (a live capture sees the dome itself).
            this._uniforms = { rrEnvMap: { value: null }, rrEnvMaxLod: { value: 0 }, rrEnvFlip: { value: -1 }, rrEnvProbe: { value: new THREE.Vector4(0, 0, 0, 0) }, rrEnvProbeReach: { value: 0 }, rrSkyLight: { value: new THREE.Vector3(1, 1, 1) } };
        }
        if (!this._uniforms.rrEnvMap.value && Reactor3D.studioEnvMap) {
            this._uniforms.rrEnvMap.value = Reactor3D.studioEnvMap();
            this._uniforms.rrEnvFlip.value = -1;
            this._uniforms.rrEnvMaxLod.value = 0;
        }
        return this._uniforms;
    },

    enabled() {
        return this.wanted && typeof THREE !== "undefined" && !(Reactor3D.isWeakGpu && Reactor3D.isWeakGpu());
    },

    _ensure() {
        if (this._target) return;
        this._target = new THREE.WebGLCubeRenderTarget(Reactor3D.reflectionSize(), {
            generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter
        });
        Reactor3D.sharePassOutput(this._target);
        this._camera = new THREE.CubeCamera(0.1, 400, this._target);
    },

    /** The cube face (three's order: +x, -x, +y, -y, +z, -z) that looks along `d`. */
    faceToward(d) {
        const ax = Math.abs(d.x), ay = Math.abs(d.y), az = Math.abs(d.z);
        if (ax >= ay && ax >= az) return d.x >= 0 ? 0 : 1;
        if (ay >= az) return d.y >= 0 ? 2 : 3;
        return d.z >= 0 ? 4 : 5;
    },

    /**
     * One face of the capture from `position`. `hidden` stays out of it (the
     * model the capture stands in, or the characters when it stands at the
     * camera) along with the shadow pass's sentinel: drawing it here ran the
     * shadow maps mid-face and lost which face was bound (the old flicker).
     * `toward`, a point (the camera), picks the face taken every other frame.
     * `radius`, when given, is how far off the captured world is taken to lie
     * (the party's distance from a mirror), so a flat mirror shows it in place.
     */
    update(renderer, scene, position, hidden, toward, radius, reach) {
        if (!this.enabled() || !renderer || !scene || !position) return;
        this._ensure();
        const cube = this._camera;
        // three turns a cube camera's six faces only inside its own update(), which this
        // capture does not call (it draws one face a frame): turned here, or all six look one way.
        if (cube.coordinateSystem !== renderer.coordinateSystem && cube.updateCoordinateSystem) {
            cube.coordinateSystem = renderer.coordinateSystem;
            cube.updateCoordinateSystem();
        }
        cube.position.set(position.x, position.y, position.z);
        cube.updateMatrixWorld(true);
        // Another renderer (the battle room after the map): its copy of the cube starts empty.
        if (this._renderer && this._renderer !== renderer) { this._ready = false; this._tick = 0; this._face = 0; }
        this._tick++;
        let face;
        if (toward && this._ready && this._tick % 2 === 0) {
            face = this.faceToward({ x: toward.x - position.x, y: toward.y - position.y, z: toward.z - position.z });
        } else {
            face = this._face;
            this._face = (this._face + 1) % 6;
        }
        const camera = cube.children[face];
        const previous = renderer.getRenderTarget();
        const autoClear = renderer.autoClear;
        renderer.autoClear = true;
        const shadowSentinel = Reactor3D.Shadows && Reactor3D.Shadows._sentinel;
        const hide = (hidden || []).concat(shadowSentinel ? [shadowSentinel] : []).filter(object => object && object.visible);
        for (const object of hide) object.visible = false;
        this._capturing = true;
        renderer.setRenderTarget(this._target, face);
        try {
            Reactor3D.withSkyAt(scene, position, () => renderer.render(scene, camera));
        } finally {
            this._capturing = false;
            for (const object of hide) object.visible = true;
            renderer.setRenderTarget(previous);
        }
        renderer.autoClear = autoClear;
        this._renderer = renderer;
        this._probe = this._probe || new THREE.Vector4();
        this._probe.set(position.x, position.y, position.z, Number(radius) > 0 ? Number(radius) : 0);
        // How far from the capture the correction holds: the model it stands in. Beyond, direction only.
        this._probeReach = Number(reach) > 0 ? Number(reach) : 0;
        if (this._face === 0 && !this._ready && this._tick >= 6) this._ready = true;
    },

    /**
     * What a shiny material reflects in the renderer about to draw it: the
     * capture in the renderer that made it, the studio gradient anywhere else
     * (a preview, a battle room). A cube drawn in one context is nothing in another.
     */
    bind(renderer) {
        const uniforms = this.uniforms();
        if (Reactor3D.daylight && Reactor3D._skyFollows) { const sky = Reactor3D.daylight().skyLinear; uniforms.rrSkyLight.value.set(sky[0], sky[1], sky[2]); }
        else uniforms.rrSkyLight.value.set(1, 1, 1);
        // Something shiny is on screen this frame (its own draw, not a capture or a mirror picture).
        if (!this._capturing && !(Reactor3D.Mirrors && Reactor3D.Mirrors._rendering)) this._shownFrame = this._frame;
        // While a face is being drawn the cube is the target: whatever shines in that face reads the studio.
        const live = this._ready && this._target && renderer === this._renderer && !this._capturing;
        const texture = live ? this._target.texture : (Reactor3D.studioEnvMap ? Reactor3D.studioEnvMap() : null);
        if (live && this._probe) uniforms.rrEnvProbe.value.copy(this._probe); else uniforms.rrEnvProbe.value.set(0, 0, 0, 0);
        // Negative: no live capture (the studio), direction only. Else the capture's own model within
        // its reach uses the measured radius, and everything else a sphere past itself.
        uniforms.rrEnvProbeReach.value = live ? (this._probeReach || 0) : -1;
        // The mirror pictures: the main draw of the renderer that made them only (a mirror's own
        // draws set their slots themselves; a capture and any other renderer see none).
        const mirrors = Reactor3D.Mirrors;
        if (mirrors && !mirrors._rendering) mirrors.apply(renderer === mirrors._renderer && !this._capturing);
        if (uniforms.rrEnvMap.value === texture) return;
        uniforms.rrEnvMap.value = texture;
        uniforms.rrEnvFlip.value = live ? 1 : -1;
        uniforms.rrEnvMaxLod.value = live ? Math.log2(Reactor3D.reflectionSize()) : 0;
    },

    /**
     * Whether this frame's capture can wait: once the cube is whole, a frame
     * after one that showed nothing shiny takes no face (the capture was most
     * of the reflection cost on a map whose chrome is off screen). The frame
     * something shiny shows, the capture goes on.
     */
    idle() {
        return !!this._ready && this._shownFrame < this._frame - 1;
    },

    /** A material that reads the reflections picks them per renderer as it draws. */
    hook(material) {
        if (!material || material.__reactorReflects) return;
        material.__reactorReflects = true;
        const before = material.onBeforeRender;
        material.onBeforeRender = function(renderer) {
            if (typeof before === "function") before.apply(this, arguments);
            Reactor3D.Reflections.bind(renderer);
        };
    },

    /** A new map: no capture carries over, and nothing is known to shine yet. */
    reset() {
        this.wanted = false;
        this._face = 0;
        this._tick = 0;
        this._frame = 0;
        this._shownFrame = -1;
        this._ready = false;
        if (this._uniforms) this._uniforms.rrEnvMap.value = null;
        if (Reactor3D.Mirrors) Reactor3D.Mirrors.reset();
    }
};

//-----------------------------------------------------------------------------
// Mirrors
//
// A mirror finish (a model reflecting fully and perfectly smooth) shows the
// world as a mirror does, sharp and in place, the party included: the flat
// panel of it that faces the camera is a plane, the scene is drawn again
// from the camera reflected in that plane (clipped at the plane, so nothing
// behind the panel shows), and the panel's fragments read that picture at
// their own place on screen. Two mirror models facing each other reflect
// each other, and each other's reflections, MIRROR_DEPTH times over (a
// house of mirrors), each level at half the size of the last. Surfaces off
// the panel keep the cube capture. Only near the camera, never on a weak GPU.

/**
 * Draw with the sky dome around `position` (a mirror's or the capture's eye), then put it back:
 * the dome follows the main camera, and a reflected eye stood outside it looking at nothing.
 */
Reactor3D.withSkyAt = function(scene, position, draw) {
    // The underwater wash is judged from the eye: a mirror's eye stands under the lake it is
    // for, and the whole picture came back as murky water. A capture sees none.
    const volume = this.waterVolumeUniforms ? this.waterVolumeUniforms() : null;
    const count = volume ? volume.rrWaterCount.value : 0;
    if (volume) volume.rrWaterCount.value = 0;
    // Nor is anything cut away for it: the cut is judged from the player's camera, and from a mirror's
    // eye (under a lake) it opened the buildings' storeys in the picture.
    const cut = this._cutawayUniforms || null;
    const cutTop = cut ? cut.rrCutTop.value : 0, cutRadius = cut ? cut.rrCutRadius.value : 0;
    if (cut) { cut.rrCutTop.value = 1e9; cut.rrCutRadius.value = 0; }
    const restore = () => { if (volume) volume.rrWaterCount.value = count; if (cut) { cut.rrCutTop.value = cutTop; cut.rrCutRadius.value = cutRadius; } };
    const dome = scene && scene.userData && scene.userData.rrSkyDome;
    if (!dome || !dome.parent || !position) {
        try { return draw(); } finally { restore(); }
    }
    const saved = dome.position.clone();
    dome.position.set(position.x, position.y, position.z);
    dome.updateMatrix(); dome.updateMatrixWorld(true);
    try { return draw(); }
    finally { dome.position.copy(saved); dome.updateMatrix(); dome.updateMatrixWorld(true); restore(); }
};

/** How many reflections deep two facing mirrors go (each level another, smaller draw of the scene). */
Reactor3D.MIRROR_DEPTH = 2;
/** How far off a panel's plane (tiles) a fragment still takes the mirror picture. */
Reactor3D.MIRROR_TOLERANCE = 0.3;
/**
 * A picture the world is drawn into for a surface to reflect (a mirror's,
 * the reflection cube) is written as the main passes are: sRGB, in plain
 * RGBA8 (see `Viewport.createTarget`). Output colour space is part of a
 * program's identity, and a pass drawn linear made three look every
 * material's program up again on each change of pass. The shaders reading
 * these pictures decode them (`SRGB_DECODE_GLSL`); the studio cube, an sRGB
 * image the GPU decodes itself, is read as it is.
 */
Reactor3D.sharePassOutput = function(target) {
    target.texture.colorSpace = THREE.SRGBColorSpace;
    target.texture.internalFormat = "RGBA8";
    target.isXRRenderTarget = true;
    return target;
};
/** sRGB bytes to linear light, declared once however many snippets ask for it. */
Reactor3D.SRGB_DECODE_GLSL = [
    "#ifndef RR_SRGB_DECODE",
    "#define RR_SRGB_DECODE",
    "vec3 rrSRGBToLinear(vec3 c) { return mix(c * 0.0773993808, pow(c * 0.9478672986 + vec3(0.0521327014), vec3(2.4)), vec3(greaterThan(c, vec3(0.04045)))); }",
    "#endif"
].join("\n");

/** The mirror slots' uniforms, declared for a fragment shader. */
Reactor3D.mirrorUniformDeclarations = function() {
    const lines = [this.SRGB_DECODE_GLSL];
    for (let slot = 0; slot < this.MIRROR_SLOTS; slot++) lines.push("uniform float rrMirrorOn" + slot + ";", "uniform vec4 rrMirrorPlane" + slot + ";", "uniform mat4 rrMirrorMatrix" + slot + ";", "uniform sampler2D rrMirrorMap" + slot + ";");
    return lines.join("\n");
};

/**
 * The fragment code that takes the first mirror slot this fragment lies on
 * (`on(slot)` says whether it does) and writes its picture into `target`,
 * the lookup nudged by `offset` (water's ripple) and scaled by `scale`.
 */
Reactor3D.mirrorLookup = function(target, on, offset, scale) {
    const lines = [];
    for (let slot = 0; slot < this.MIRROR_SLOTS; slot++) {
        lines.push((slot ? "\t} else if (" : "\tif (") + "rrMirrorOn" + slot + " > 0.5 && " + on(slot) + ") {",
            "\t\tvec4 rrMC = rrMirrorMatrix" + slot + " * vec4(vRRWorldPos, 1.0); vec2 rrMU = rrMC.xy / rrMC.w" + (offset ? " + " + offset : "") + ";",
            "\t\tif (rrMC.w > 0.0 && rrMU.x > 0.0 && rrMU.y > 0.0 && rrMU.x < 1.0 && rrMU.y < 1.0) " + target + " = rrSRGBToLinear(textureLod(rrMirrorMap" + slot + ", rrMU, 0.0).rgb) * " + scale + ";");
    }
    lines.push("\t}");
    return lines.join("\n");
};

/** A model with a flat face this share of its surface or more can be a planar mirror (see `mirrorPanels`). */
Reactor3D.MIRROR_FLAT_SHARE = 0.15;
/** How close (tiles) a mirror must stand to the camera: off screen (the one another reflects), and in view. */
Reactor3D.MIRROR_PLANE_REACH = 60;
Reactor3D.MIRROR_VIEW_REACH = 250;
/** How many mirror planes a frame draws: the first two reflect each other (a house of mirrors), the rest once, at half size. */
Reactor3D.MIRROR_SLOTS = 4;
/** Mirror pictures at the view's render scale; false draws them at the screen's size whatever the view is drawn at. */
Reactor3D.MIRROR_AT_VIEW_SCALE = true;

/**
 * Whether a water sheet put a pixel on screen in the game's own draw, from an
 * occlusion query round each sheet's draw. A sheet's mirror picture is another
 * draw of the whole scene, and a lake behind a hill or a house took one on
 * every frame its bounds touched the view (North Haven's village square, no
 * water in sight: three pictures a frame, half the frame's CPU). The answer
 * comes a frame or two after the draw, so a sheet keeps its picture for HOLD
 * frames after its last pixel. Only in a game: the editor draws a frame when
 * something changes, and an answer would wait for the next one.
 */
Reactor3D.WaterSight = {
    /** The kill switch: false gives every sheet in the view its picture, as before. */
    enabled: true,
    HOLD: 30,
    _frame: 0,
    _camera: null,

    active() {
        return this.enabled !== false && typeof Graphics !== "undefined" && typeof SceneManager !== "undefined";
    },

    /** A frame's reflections begin: `camera` is the one whose draws are asked about. */
    begin(camera) {
        this._frame++;
        this._camera = camera;
    },

    /** The sheet's draws ask from now on; it counts as seen until the first answers are in. */
    watch(mesh) {
        const sight = this;
        mesh.userData.rrSight = { seen: this._frame, query: null, open: null, gl: null, generation: -1 };
        mesh.onBeforeRender = function(renderer, scene, camera) { sight._before(this, renderer, camera); };
        mesh.onAfterRender = function() { sight._after(this); };
    },

    /** Whether the sheet showed within the last HOLD frames. */
    seen(mesh) {
        const state = mesh && mesh.userData && mesh.userData.rrSight;
        return !state || !this.active() || this._frame - state.seen <= this.HOLD;
    },

    _before(mesh, renderer, camera) {
        const state = mesh.userData.rrSight;
        if (!state || camera !== this._camera || !this.active()) return;
        // The frame's own draw only: a mirror's eye and the capture's see other things.
        if (Reactor3D.Mirrors._rendering || (Reactor3D.Reflections && Reactor3D.Reflections._capturing)) return;
        const gl = renderer.getContext();
        if (!gl || typeof gl.beginQuery !== "function" || gl.isContextLost()) return;
        // A query belongs to the context that made it (and a restored context made none of these).
        if (state.gl !== gl || state.generation !== Reactor3D.contextGeneration) { state.query = null; state.gl = gl; state.generation = Reactor3D.contextGeneration; }
        if (state.query) {
            // One question at a time: the next is asked when this one is answered.
            if (!gl.getQueryParameter(state.query, gl.QUERY_RESULT_AVAILABLE)) return;
            if (gl.getQueryParameter(state.query, gl.QUERY_RESULT)) state.seen = this._frame;
            gl.deleteQuery(state.query);
        }
        state.query = gl.createQuery();
        gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, state.query);
        state.open = gl;
    },

    _after(mesh) {
        const state = mesh.userData.rrSight;
        if (!state || !state.open) return;
        const gl = state.open;
        state.open = null;
        gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
    }
};

/** Whether a model is a mirror finish: some lit material reflecting fully and nearly perfectly smooth. */
Reactor3D.isMirrorFinish = function(object) {
    let mirror = false;
    object.traverse(node => {
        if (mirror || !node.isMesh || !node.material) return;
        for (const material of [].concat(node.material)) {
            const shine = this.shineOf(material);
            // Gloss 0.85 and up (gold's 0.85 is 1 - 0.85 = 0.15000000000000002 rough, so the
            // bound leaves room), reflecting nearly fully, keeping little of its paint.
            if (shine && shine.vector.x >= 0.85 && shine.vector.y <= 0.2 && (shine.vector.w || 0) <= 0.5) { mirror = true; break; }
        }
    });
    return mirror;
};

/**
 * A model's flat panels, largest first, in its own frame: `{ normal, d, area }`
 * with the plane dot(x, normal) = d. Worked out once from its triangles
 * (normals and offsets gathered into bins), kept on the model. Models made
 * of the same geometry (three motorcycles of one file) share one answer: each
 * weighs every triangle, a tenth of a second for a detailed vehicle.
 */
Reactor3D._mirrorPanelsOf = new WeakMap();
Reactor3D.mirrorPanels = function(object) {
    if (object.userData.__rrPanels) return object.userData.__rrPanels;
    const meshes = [];
    object.traverse(node => { if (node.isMesh && !node.isSkinnedMesh && node.geometry && node.geometry.attributes.position) meshes.push(node); });
    if (!meshes.length) return [];
    // (Told by its first geometry and every part's size: a vehicle's carved parts are geometry of each model's own.)
    const made = meshes.map(mesh => mesh.geometry.attributes.position.count).join("|"), shared = this._mirrorPanelsOf.get(meshes[0].geometry);
    if (shared && shared.made === made) return (object.userData.__rrPanels = shared.panels);
    object.updateMatrixWorld(true);
    const toLocal = new THREE.Matrix4().copy(object.matrixWorld).invert();
    const box = new THREE.Box3();
    const bins = new Map();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (const mesh of meshes) { mesh.geometry.computeBoundingBox?.(); const bb = mesh.geometry.boundingBox; if (bb) box.union(bb.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld))); }
    const step = Math.max(1e-4, box.getSize(new THREE.Vector3()).length() * 0.004);
    for (const mesh of meshes) {
        const m = new THREE.Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld);
        const pos = mesh.geometry.attributes.position, index = mesh.geometry.index;
        const count = index ? index.count : pos.count;
        for (let i = 0; i + 2 < count; i += 3) {
            const i0 = index ? index.getX(i) : i, i1 = index ? index.getX(i + 1) : i + 1, i2 = index ? index.getX(i + 2) : i + 2;
            a.fromBufferAttribute(pos, i0).applyMatrix4(m); b.fromBufferAttribute(pos, i1).applyMatrix4(m); c.fromBufferAttribute(pos, i2).applyMatrix4(m);
            n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
            const twice = n.length();
            if (twice < 1e-12) continue;
            n.divideScalar(twice);
            const d = n.dot(a);
            const key = Math.round(n.x * 20) + "," + Math.round(n.y * 20) + "," + Math.round(n.z * 20) + "," + Math.round(d / step);
            let bin = bins.get(key);
            if (!bin) bins.set(key, bin = { nx: 0, ny: 0, nz: 0, d: 0, area: 0, box: new THREE.Box3() });
            const area = twice / 2;
            bin.nx += n.x * area; bin.ny += n.y * area; bin.nz += n.z * area; bin.d += d * area; bin.area += area;
            bin.box.expandByPoint(a); bin.box.expandByPoint(b); bin.box.expandByPoint(c);
        }
    }
    // Each panel keeps where it lies (its box in the model's frame), so a mirror can pick the one your reflection falls in.
    let total = 0;
    for (const bin of bins.values()) total += bin.area;
    const panels = [...bins.values()].sort((p, q) => q.area - p.area).slice(0, 48).map(bin => {
        const normal = new THREE.Vector3(bin.nx, bin.ny, bin.nz).normalize();
        return { normal, d: bin.d / bin.area, area: bin.area, box: bin.box.expandByScalar(step * 2) };
    });
    // How much of the whole surface its largest flat panel is: a mirror wall is nearly all panel,
    // a faceted hull (a tank) none worth a planar mirror.
    panels.flatShare = total > 0 && panels.length ? panels[0].area / total : 0;
    object.userData.__rrPanels = panels;
    this._mirrorPanelsOf.set(meshes[0].geometry, { made, panels });
    return panels;
};

Reactor3D.Mirrors = {
    _targets: new Map(),
    _cameras: [],
    _dummy: null,
    _uniforms: null,
    active: false,

    uniforms() {
        if (!this._uniforms) {
            this._uniforms = {};
            for (let slot = 0; slot < Reactor3D.MIRROR_SLOTS; slot++) {
                this._uniforms["rrMirrorOn" + slot] = { value: 0 };
                this._uniforms["rrMirrorPlane" + slot] = { value: new THREE.Vector4(0, 1, 0, -1e6) };
                this._uniforms["rrMirrorMatrix" + slot] = { value: new THREE.Matrix4() };
                this._uniforms["rrMirrorMap" + slot] = { value: this.dummy() };
            }
            this._uniforms.rrMirrorTolerance = { value: Reactor3D.MIRROR_TOLERANCE };
        }
        return this._uniforms;
    },

    dummy() {
        if (!this._dummy) { this._dummy = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this._dummy.needsUpdate = true; }
        return this._dummy;
    },

    /** A new map: the pictures' targets let go (a full-size colour and depth buffer each), nothing kept from the last map's planes. */
    reset() {
        for (const target of this._targets.values()) target.dispose();
        this._targets.clear();
        this._live = null;
        this._applied = null;
        this.active = false;
        if (this._uniforms) this.clear();
    },

    /** Every slot off: nothing reads a mirror picture (a preview, a capture, the edge of the recursion). */
    clear() {
        const u = this.uniforms();
        for (let slot = 0; slot < Reactor3D.MIRROR_SLOTS; slot++) { u["rrMirrorOn" + slot].value = 0; u["rrMirrorMap" + slot].value = this.dummy(); }
    },

    target(slot, level, width, height) {
        const key = slot + ":" + level;
        let target = this._targets.get(key);
        if (!target) {
            target = new THREE.WebGLRenderTarget(width, height, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
            Reactor3D.sharePassOutput(target);
            this._targets.set(key, target);
        } else if (target.width !== width || target.height !== height) target.setSize(width, height);
        return target;
    },

    /** The camera `camera` reflected in the plane (normal n, point p), with its near plane on the mirror, and the picture's lookup matrix; false when the camera is behind it. */
    reflect(camera, n, p, out, matrix) {
        const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
        const view = new THREE.Vector3().subVectors(p, camPos);
        if (view.dot(n) > 0) return false;
        view.reflect(n).negate().add(p);
        const rotation = new THREE.Matrix4().extractRotation(camera.matrixWorld);
        const look = new THREE.Vector3(0, 0, -1).applyMatrix4(rotation).add(camPos);
        const target = new THREE.Vector3().subVectors(p, look).reflect(n).negate().add(p);
        out.position.copy(view);
        out.up.set(0, 1, 0).applyMatrix4(rotation).reflect(n);
        out.lookAt(target);
        out.near = camera.near; out.far = camera.far;
        out.updateMatrixWorld(true);
        out.projectionMatrix.copy(camera.projectionMatrix);
        out.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
        matrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(out.projectionMatrix).multiply(out.matrixWorldInverse);
        // An oblique near plane on the mirror: what stands behind the glass is not drawn.
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, p).applyMatrix4(out.matrixWorldInverse);
        const clip = new THREE.Vector4(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
        const e = out.projectionMatrix.elements;
        const q = new THREE.Vector4((Math.sign(clip.x) + e[8]) / e[0], (Math.sign(clip.y) + e[9]) / e[5], -1, (1 + e[10]) / e[14]);
        clip.multiplyScalar(2 / clip.dot(q));
        e[2] = clip.x; e[6] = clip.y; e[10] = clip.z + 1 - 0.003; e[14] = clip.w;
        return true;
    },

    /**
     * The mirror pictures seen from `camera`, `level` reflections deep: for
     * each plane in front of it, the view from its reflection (with the
     * other plane's own picture from there drawn first), into a target of
     * its own. Returns the slots' pictures and matrices as seen from `camera`.
     */
    renderLevel(renderer, scene, camera, planes, level, width, height, hidden, base = 0) {
        const seen = [];
        if (level < 0 || width < 16 || height < 16) return seen;
        for (let i = 0; i < planes.length; i++) {
            const slot = base + i, plane = planes[i];
            const out = this._cameras[slot * 8 + level] || (this._cameras[slot * 8 + level] = new THREE.PerspectiveCamera());
            const matrix = new THREE.Matrix4();
            const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
            if (camPos.clone().sub(plane.point).dot(plane.normal) <= 0.01) continue;
            if (!this.reflect(camera, plane.normal, plane.point, out, matrix)) continue;
            // The other mirrors as seen in this one, first.
            // (This plane is behind its own reflected camera, so only the others come back.)
            const others = planes.length > 1 ? this.renderLevel(renderer, scene, out, planes, level - 1, width >> 1, height >> 1, hidden, base).filter(entry => entry.slot !== slot) : [];
            this.clear();
            const u = this.uniforms();
            for (const entry of others) {
                const other = planes[entry.slot - base];
                u["rrMirrorOn" + entry.slot].value = 1;
                u["rrMirrorPlane" + entry.slot].value.set(other.normal.x, other.normal.y, other.normal.z, other.d);
                u["rrMirrorMatrix" + entry.slot].value.copy(entry.matrix);
                u["rrMirrorMap" + entry.slot].value = entry.texture;
            }
            const target = this.target(slot, level, width, height);
            const previous = renderer.getRenderTarget();
            // A lake is left out of its own picture: its wave crests stand above the level the glass
            // clips at, and their undersides showed in the reflection as a grid of dark blots.
            const own = plane.object && plane.object.userData && plane.object.userData.water && plane.object.visible ? [plane.object] : [];
            for (const object of own) object.visible = false;
            for (const object of hidden) object.visible = false;
            renderer.setRenderTarget(target);
            try { Reactor3D.withSkyAt(scene, out.position, () => renderer.render(scene, out)); }
            finally { for (const object of hidden) object.visible = true; for (const object of own) object.visible = true; renderer.setRenderTarget(previous); }
            seen.push({ slot, texture: target.texture, matrix });
        }
        return seen;
    },

    /**
     * This frame's mirrors, before the main draw: up to two mirror-finish
     * models near `camera` (`candidates`, their objects), the panel of each
     * facing the camera, drawn MIRROR_DEPTH deep. With none, every slot off.
     */
    update(renderer, scene, camera, candidates, hidden, subject, scale) {
        this.clear();
        this._applied = null;
        this.active = false;
        if (!renderer || !scene || !camera || !camera.isPerspectiveCamera || (Reactor3D.isWeakGpu && Reactor3D.isWeakGpu())) return;
        // Nothing mirrors here (most maps, every frame): nothing to weigh, and no earlier plane held on to.
        if (!candidates || !candidates.length) { this._live = null; return; }
        camera.updateMatrixWorld(true);
        const camPos = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
        // Every panel of every candidate facing the camera, scored: first by how much of the party
        // its mirror shows on screen, then by how much of it is in view (area and facing).
        const scored = [];
        const toLocal = new THREE.Matrix4();
        const onScreen = point => { const v = point.clone().project(camera); return v.z < 1 && v.z > -1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1; };
        // In view is any of it in the camera's frustum (a long wall's middle can be off screen while it fills the view).
        const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        // How much of the screen a box covers, 0..1: its projected corners' rectangle, clipped to the view.
        // (A distance falloff had judged a wall 150 tiles off, plain on screen, as filling nothing.)
        const corner = new THREE.Vector3();
        const cover = box => {
            let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
            for (let i = 0; i < 8; i++) {
                corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z);
                corner.applyMatrix4(camera.matrixWorldInverse);
                if (corner.z > -camera.near) return 1; // reaches behind the eye: all about it
                corner.applyMatrix4(camera.projectionMatrix);
                x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x); y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y);
            }
            const w = Math.min(1, x1) - Math.max(-1, x0), h = Math.min(1, y1) - Math.max(-1, y0);
            return w > 0 && h > 0 ? (w * h) / 4 : 0;
        };
        for (const object of candidates || []) {
            // A water sheet names its own plane: level, facing up.
            const own = object.userData && object.userData.rrMirrorPlane;
            if (own) {
                // A sheet with no pixel on screen has nothing to show a picture in.
                if (Reactor3D.WaterSight && !Reactor3D.WaterSight.seen(object)) continue;
                if (camPos.clone().sub(own.point).dot(own.normal) > 0.05) {
                    // Water competes on what it fills of the view, like any mirror.
                    const bounds = new THREE.Box3().setFromObject(object);
                    const inView = frustum.intersectsBox(bounds);
                    const share = 1000 * cover(bounds);
                    scored.push({ normal: own.normal.clone(), point: own.point.clone(), d: own.normal.dot(own.point), score: (inView ? 1e3 : 0) + share, share: inView ? share : 0, primary: inView, object });
                }
                continue;
            }
            const panels = Reactor3D.mirrorPanels(object);
            if (!panels.length) continue;
            // A model is a planar mirror only when it has a real flat face; else its cube reflection
            // stands alone (a faceted hull's facets flicker as the chosen plane jumps between them).
            if (object.userData.pieceChunk === undefined && panels.flatShare < Reactor3D.MIRROR_FLAT_SHARE) continue;
            const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
            toLocal.copy(object.matrixWorld).invert();
            for (const panel of panels) {
                const normal = panel.normal.clone().applyMatrix3(normalMatrix).normalize();
                const point = panel.normal.clone().multiplyScalar(panel.d).applyMatrix4(object.matrixWorld);
                // Facing and view are judged from the panel's own middle (a plane's point at the
                // origin can lie tiles away, where the panel looks edge-on).
                const middle = panel.box.getCenter(new THREE.Vector3()).applyMatrix4(object.matrixWorld);
                const facing = normal.dot(camPos.clone().sub(middle).normalize());
                if (facing <= 0.15) continue;
                const worldBox = panel.box.clone().applyMatrix4(object.matrixWorld);
                const inView = frustum.intersectsBox(worldBox);
                let shows = 0;
                for (const s of subject || []) {
                    const side = s.clone().sub(point).dot(normal);
                    if (side <= 0) continue;
                    const image = s.clone().addScaledVector(normal, -2 * side);
                    const ray = image.clone().sub(camPos);
                    const along = normal.dot(ray);
                    if (Math.abs(along) < 1e-6) continue;
                    const t = normal.dot(point.clone().sub(camPos)) / along;
                    if (t <= 0 || t >= 1) continue;
                    const cross = camPos.clone().addScaledVector(ray, t);
                    if (onScreen(cross) && panel.box.containsPoint(cross.clone().applyMatrix4(toLocal))) shows++;
                }
                // Off screen and showing nothing it can still be the second mirror: the one the first reflects.
                // How much of the view it fills (per mille of the screen), as squarely as it faces.
                const share = 1000 * cover(worldBox) * facing;
                scored.push({ normal, point, d: normal.dot(point), score: shows * 1e6 + (inView ? 1e3 : 0) + share, share: inView ? share : 0, primary: shows > 0 || inView, object });
            }
        }
        // The mirror kept last frame stays unless another clearly wins: no flicker between near equals.
        for (const entry of scored) {
            if ((this._live || []).some(live => live.plane.object === entry.object && live.plane.normal.dot(entry.normal) > 0.999 && Math.abs(live.plane.d - entry.d) < 0.05)) entry.score *= 1.5;
        }
        scored.sort((a, b) => b.score - a.score);
        // What this frame weighed, for a look from the console (Reactor3D.Mirrors.lastChoice).
        this.lastChoice = { candidates: (candidates || []).length, scored: scored.slice(0, 8).map(p => ({ n: [p.normal.x, p.normal.y, p.normal.z].map(v => Math.round(v * 100) / 100), d: Math.round(p.d * 10) / 10, score: Math.round(p.score), primary: p.primary })) };
        const planes = [];
        // The first is the best plane in view (something off screen can only be the second: the one it reflects).
        const first = scored.find(p => p.primary);
        if (first) {
            planes.push(first);
            // The second: one facing the first (a house of mirrors) before any other.
            const facingFirst = scored.find(p => p !== first && p.normal.dot(first.normal) < -0.9 && Math.abs(p.d + first.d) > 0.2);
            // Never the first plane again from another chunk (one long wall is one mirror: the shader
            // takes every fragment on the plane, whichever chunk drew it).
            const samePlane = p => p.normal.dot(first.normal) > 0.999 && Math.abs(p.d - first.d) < 0.05;
            const next = facingFirst || scored.find(p => p !== first && p.primary && !samePlane(p) && (p.object !== first.object || Math.abs(p.normal.dot(first.normal)) < 0.9));
            if (next) planes.push(next);
            // Then the next largest in view, each plane once (a long wall is one mirror whatever its chunks).
            const known = p => planes.some(q => p.normal.dot(q.normal) > 0.999 && Math.abs(p.d - q.d) < 0.05);
            for (const p of scored) {
                // A middling GPU draws the first two only (each plane is another draw of the scene).
                if (planes.length >= (Reactor3D.tier() === "full" ? Reactor3D.MIRROR_SLOTS : 2)) break;
                // Past the first two, only what fills a real share of the view (half a percent: not a wall's top strip).
                // Read from the share itself: last frame's 1.5x on the score passed any kept plane.
                if (p.primary && !known(p) && p.share >= 5) planes.push(p);
            }
        }
        if (!planes.length) { this._live = null; return; }
        const size = renderer.getDrawingBufferSize(new THREE.Vector2());
        // At the size the frame itself is drawn at (`scale`: the view's render scale): its fragments
        // read the picture at their own place on screen, and more texels than fragments are never read.
        const height = Math.max(16, Math.round(Math.min(1080, size.y) * (Reactor3D.MIRROR_AT_VIEW_SCALE !== false && scale > 0 && scale < 1 ? scale : 1))), width = Math.round(height * (camera.aspect || size.x / size.y));
        const shadowSentinel = Reactor3D.Shadows && Reactor3D.Shadows._sentinel;
        const hide = (hidden || []).concat(shadowSentinel ? [shadowSentinel] : []).filter(object => object && object.visible);
        this._rendering = true;
        let seen;
        try {
            // The first two reflect each other; the rest once, at half size.
            seen = this.renderLevel(renderer, scene, camera, planes.slice(0, 2), Reactor3D.MIRROR_DEPTH, width, height, hide, 0);
            if (planes.length > 2) seen = seen.concat(this.renderLevel(renderer, scene, camera, planes.slice(2), 0, width >> 1, height >> 1, hide, 2));
        } finally { this._rendering = false; }
        this._live = seen.map(entry => Object.assign({ plane: planes[entry.slot] }, entry));
        this._renderer = renderer;
        this.active = seen.length > 0;
        this._applied = null;
        this.apply(true);
    },

    /** The main draw's pictures into the slots (on), or every slot off (a capture, another renderer). */
    apply(on) {
        const want = on && this.active;
        if (this._applied === want) return;
        this._applied = want;
        this.clear();
        if (!want) return;
        const u = this.uniforms();
        for (const entry of this._live || []) {
            const plane = entry.plane;
            u["rrMirrorOn" + entry.slot].value = 1;
            u["rrMirrorPlane" + entry.slot].value.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.d);
            u["rrMirrorMatrix" + entry.slot].value.copy(entry.matrix);
            u["rrMirrorMap" + entry.slot].value = entry.texture;
        }
    }
};

/**
 * How a material shines: its `rrShine` of `{ vector: (reflect, roughness,
 * metal, texture kept), tint }`, or null for a plain surface. Set by
 * `applyModelSurface` (a model's own settings, or its file's metal).
 */
Reactor3D.shineOf = function(material) {
    const shine = material && material.userData && material.userData.rrShine;
    if (!shine || !shine.vector) return null;
    // A cloned material copies its userData through JSON: the vector and the
    // colour arrive as plain objects, and a uniform needs the real things.
    if (!shine.vector.isVector4 && typeof THREE !== "undefined") {
        const v = shine.vector, t = shine.tint || {};
        shine.vector = new THREE.Vector4(Number(v.x) || 0, Number(v.y) || 0, Number(v.z) || 0, Number(v.w) || 0);
        shine.tint = new THREE.Color(Number.isFinite(t.r) ? t.r : 1, Number.isFinite(t.g) ? t.g : 1, Number.isFinite(t.b) ? t.b : 1);
    }
    return shine.vector.x > 0 ? shine : null;
};

/**
 * The reflection term for a shiny lit material: the world in the capture,
 * mirrored about the surface normal, blurred by roughness, stronger at a
 * glancing angle (fresnel) unless it is metal, which reflects as strongly
 * face on, in the surface's tint (white chrome, yellow gold). A mirror-bright
 * metal is almost all reflection.
 */
Reactor3D.injectShine = function(material, shader) {
    const shine = this.shineOf(material);
    if (!shine) return;
    const env = this.Reflections.uniforms();
    shader.uniforms.rrEnvMap = env.rrEnvMap;
    shader.uniforms.rrEnvMaxLod = env.rrEnvMaxLod;
    shader.uniforms.rrEnvFlip = env.rrEnvFlip;
    shader.uniforms.rrEnvProbe = env.rrEnvProbe;
    shader.uniforms.rrEnvProbeReach = env.rrEnvProbeReach;
    shader.uniforms.rrSkyLight = env.rrSkyLight;
    const mirror = this.Mirrors.uniforms();
    for (const name of Object.keys(mirror)) shader.uniforms[name] = mirror[name];
    shader.uniforms.rrShine = { value: shine.vector };
    shader.uniforms.rrShineTint = { value: shine.tint };
    shader.vertexShader = "varying vec3 vRRWorldNormal;\n" + shader.vertexShader.replace(
        "#include <project_vertex>",
        [
            "#include <project_vertex>",
            "{",
            "#ifdef USE_SKINNING",
            "\tvec3 rrObjN = objectNormal;",
            "#else",
            "\tvec3 rrObjN = normal;",
            "#endif",
            "#ifdef USE_INSTANCING",
            "\trrObjN = mat3(instanceMatrix) * rrObjN;",
            "#endif",
            "\tvRRWorldNormal = normalize(mat3(modelMatrix) * rrObjN);",
            "}"
        ].join("\n")
    );
    shader.fragmentShader = [
        "uniform samplerCube rrEnvMap;",
        "uniform float rrEnvMaxLod;",
        "uniform float rrEnvFlip;",
        "uniform vec4 rrEnvProbe;",
        "uniform float rrEnvProbeReach;",
        "uniform vec3 rrSkyLight;",
        Reactor3D.mirrorUniformDeclarations(),
        "uniform float rrMirrorTolerance;",
        "uniform vec4 rrShine;",
        "uniform vec3 rrShineTint;",
        "varying vec3 vRRWorldNormal;"
    ].join("\n") + "\n" + shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        [
            "{",
            "\tvec3 rrN = normalize(vRRWorldNormal);",
            "\tvec3 rrV = normalize(cameraPosition - vRRWorldPos);",
            // Toward the eye whichever way the file wound it: an inward normal
            // reads as grazing everywhere and glazes the whole surface over.
            "\trrN = dot(rrN, rrV) < 0.0 ? -rrN : rrN;",
            "\tvec3 rrR = reflect(-rrV, rrN);",
            // A capture taken close by (inside a mirror-bright model): its world is taken to lie on
            // a sphere about it, and the lookup aims where the reflected ray meets that sphere, so each
            // point of a flat panel sees its own part of the room and the party stands where a mirror
            // would show them. Far captures (w = 0) look up by direction alone.
            // Only on the model the capture stands in: anything else shiny, far off, reflects by direction
            // (bent around another model's sphere, it came out magnified and blurred).
            // Any live capture: a flat surface looked up by direction alone sampled one patch of the cube
            // and blew it up (zoomed and blurred); on a sphere past it, each point sees its own part.
            "\tif (rrEnvProbeReach >= 0.0) {",
            "\t\tvec3 rrL = vRRWorldPos - rrEnvProbe.xyz;",
            "\t\tfloat rrRadius = rrEnvProbe.w > 0.0 && length(rrL) < rrEnvProbeReach ? rrEnvProbe.w : length(rrL) + 15.0;",
            "\t\tfloat rrB = dot(rrL, rrR);",
            "\t\tfloat rrH = rrB * rrB - (dot(rrL, rrL) - rrRadius * rrRadius);",
            "\t\tif (rrH > 0.0) rrR = normalize(rrL + rrR * (-rrB + sqrt(rrH)));",
            "\t}",
            "\trrR.x *= rrEnvFlip;",
            "\tvec3 rrEnv = textureLod(rrEnvMap, rrR, rrShine.y * rrEnvMaxLod).rgb;",
            // A live capture holds sRGB (flip 1); the studio cube is decoded by the GPU (flip -1).
            "\tif (rrEnvFlip > 0.0) rrEnv = rrSRGBToLinear(rrEnv);",
            // The studio is a noon sky: dimmed and tinted to the map's time of day.
            "\telse rrEnv *= rrSkyLight;",
            // On a mirror panel (facing the plane's way and lying on it) the mirror picture, sharp, at this
            // fragment's own place in the reflected view.
            Reactor3D.mirrorLookup("rrEnv", slot => "dot(rrN, rrMirrorPlane" + slot + ".xyz) > 0.92 && abs(dot(vRRWorldPos, rrMirrorPlane" + slot + ".xyz) - rrMirrorPlane" + slot + ".w) < rrMirrorTolerance", "", "1.0"),
            "\tfloat rrF0 = mix(0.04, 1.0, rrShine.z);",
            "\tfloat rrFres = rrF0 + (1.0 - rrF0) * pow(1.0 - clamp(dot(rrN, rrV), 0.0, 1.0), 5.0);",
            // How much of the texture stays (w): the rest is mirrored over, and what stays
            // takes the reflection as a glaze (a screen blend) of its bright parts only
            // (cubed): crisp highlights over the paint, never a milky wash.
            "\tvec3 rrRefl = rrEnv * rrShineTint;",
            "\tfloat rrA = clamp(rrShine.x * rrFres, 0.0, 1.0);",
            "\tvec3 rrMirror = mix(outgoingLight, rrRefl, rrA * (1.0 - rrShine.w));",
            "\tvec3 rrGlaze = clamp(rrRefl * rrRefl * rrRefl * 1.6 * rrA * rrShine.w, 0.0, 1.0);",
            "\toutgoingLight = rrMirror + rrGlaze - rrMirror * rrGlaze;",
            "}",
            "#include <opaque_fragment>"
        ].join("\n")
    );
};

Reactor3D.litMaterial = function(material) {
    if (!material || material.__reactorLit) return material;
    material.__reactorLit = true;
    const earlier = material.onBeforeCompile;
    material.onBeforeCompile = function(shader, renderer) {
        if (typeof earlier === "function") earlier.call(this, shader, renderer);
        Reactor3D.injectLightShader(shader, renderer);
        if (Reactor3D.injectMaterialDetail) Reactor3D.injectMaterialDetail(this, shader);
        // A self-lit material (a Glow) ignores the lights: its own uniform, one per material.
        shader.uniforms.rrSelfLit = { value: this.__reactorSelfLit ? 1 : 0 };
        Reactor3D.injectBlendColor(this, shader);
        Reactor3D.injectDissolve(this, shader);
        Reactor3D.injectCutaway(this, shader);
        Reactor3D.injectWaterVolume(this, shader);
        Reactor3D.injectShine(this, shader);
        // A model variant's color adjustment, last: the texel is adjusted before anything above mixes over it.
        if (Reactor3D.injectLook) Reactor3D.injectLook(this, shader);
    };
    const earlierKey = material.customProgramCacheKey;
    material.customProgramCacheKey = function() {
        return (typeof earlierKey === "function" ? earlierKey.call(this) : "") + "|reactor3d-lit" + (this.__reactorPieces ? "|cutaway" : this.__reactorModel ? "|sightline" : "") + (this.__reactorGhost ? "|ghost" : "")
            + (Reactor3D.Shadows.active() ? "|shadows" + Reactor3D.Shadows.quality().taps : "")
            + (Reactor3D.shineOf(this) ? "|shine" : "")
            + (Reactor3D.lookOf && Reactor3D.lookOf(this) ? "|look" : "")
            + (Reactor3D.detailProgramKey ? Reactor3D.detailProgramKey(this) : "");
    };
    return material;
};

//-----------------------------------------------------------------------------
// Shadows
//
// Every casting light renders six 90-degree faces of depth from where it
// stands into a row of a shared atlas, and the lit materials sample that
// atlas with hardware depth comparison inside their light loop. Two
// atlases: a STATIC one, holding the props and placed models, whose rows
// are rendered only when a light arrives or moves or a prop in its reach
// does, at the coarsest distance level a model has; and a smaller DYNAMIC
// one, holding the characters, whose rows are rendered only when a
// character in that light's reach has moved. A program carries two
// samplers however many lights cast, so the atlas — not the sampler limit
// — says how many may: eight rows at 512 with five taps on a capable GPU,
// four at 256 with one tap on a weak one. Lights with nothing in reach
// need no row at all. The work is spread: a few rows a frame, nearest to
// the player first, and a row keeps its last rendering until the new one
// is drawn.

/**
 * The GPU's class as the 3D code sees it.
 *
 * `Graphics.gpuTier` is the game's answer, read once from the renderer
 * string when the app starts — but the editor's 3D map view loads
 * `reactor_3d.js` on its own, with no `reactor_core.js` and so no
 * `Graphics` at all. Every tier-aware choice in here would quietly take the
 * full-power branch there: the editor's own viewport would run four shadow
 * slots at 512 with five taps on the same laptop the game had just been
 * tuned down to two at 256. So the tier is asked for through here, and the
 * editor sets `gpuTierOverride` from its own renderer once it has one.
 */
Reactor3D.gpuTierOverride = null;

/** Renderers that want the cheap path. `Graphics` owns the canonical pair. */
Reactor3D.WEAK_GPU_PATTERN = /\b(Intel|UHD|Iris|HD Graphics|Mali|Adreno|PowerVR|VideoCore|SwiftShader|llvmpipe|Software|Microsoft Basic Render|Mesa)\b/i;
Reactor3D.WEAK_AMD_PATTERN = /\bRadeon(?:\s*\(TM\))?(?:\s+(?:RX\s+)?Vega\s*\d*)?\s+Graphics\b|\bVega\s*\d+\s+Graphics\b|\bAMD Custom GPU\b|\bRadeon\(TM\)\s+R[2-7]\b|\bRyzen\b[^()]*\bProcessor\b/i;

/** "weak", "full" or "unknown" for a renderer description. */
Reactor3D.classifyGpu = function(description) {
    if (!description) return "unknown";
    // A project may have replaced the patterns on Graphics; honour that.
    const weak = (typeof Graphics !== "undefined" && Graphics.weakGpuPattern) || this.WEAK_GPU_PATTERN;
    const amd = (typeof Graphics !== "undefined" && Graphics.weakAmdPattern) || this.WEAK_AMD_PATTERN;
    return weak.test(description) || amd.test(description) ? "weak" : "full";
};

/** Read the renderer's own name out of a live context, or "" if it will not say. */
Reactor3D.rendererDescription = function(gl) {
    try {
        if (!gl) return "";
        const info = gl.getExtension("WEBGL_debug_renderer_info");
        return String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || "");
    } catch (e) {
        return "";
    }
};

/**
 * The tier every cost decision in this file asks for: an explicit override
 * first, then the game's, and "full" when nobody knows — an unknown GPU is
 * left sharp rather than quietly demoted.
 */
Reactor3D.tier = function() {
    if (this.gpuTierOverride) return this.gpuTierOverride;
    if (typeof Graphics !== "undefined" && Graphics.gpuTier && Graphics.gpuTier !== "unknown") {
        return Graphics.gpuTier;
    }
    return "full";
};

Reactor3D.isWeakGpu = function() {
    return this.tier() === "weak";
};

/**
 * The camera the frame is being drawn from, for anything that culls.
 *
 * A host without a `Reactor3D.Viewport` — the editor's map view, which
 * builds its own renderer and camera — sets `cullCamera` instead. Reaching
 * straight for the viewport is the mistake that has now been made three
 * times in this file; go through here.
 */
Reactor3D.cullCamera = null;

Reactor3D.activeCamera = function() {
    if (this.cullCamera) return this.cullCamera;
    try {
        const viewport = this.viewport ? this.viewport() : null;
        return viewport && viewport.camera ? viewport.camera() : null;
    } catch (e) {
        return null;
    }
};

/**
 * The view frustum, rebuilt at most once a frame.
 *
 * A light whose sphere of reach does not touch the frustum cannot light a
 * single fragment anyone can see — every visible fragment is inside the
 * frustum by definition — so dropping it changes no pixel. On the Demo's
 * start map **nine of the ten lights are off screen at any moment**, and
 * every lit pixel was running the distance and falloff maths for all ten.
 * Null when there is no camera to ask, in which case nothing is culled.
 */
Reactor3D.viewFrustum = function() {
    if (typeof THREE === "undefined") return null;
    const camera = this.activeCamera();
    if (!camera) return null;
    // The game stamps frames with Graphics; the editor has no Graphics and
    // counts its own drawn frames in `cullFrame`. Without either the frustum
    // was built once for the first camera pose and every light was culled
    // against it for the rest of the session.
    const stamp = (typeof Graphics !== "undefined" && Graphics.frameCount) || this.cullFrame || 0;
    if (this._frustumAt === stamp && this._frustumCamera === camera && this._frustum) {
        return this._frustum;
    }
    const frustum = this._frustum || (this._frustum = new THREE.Frustum());
    const matrix = this._frustumMatrix || (this._frustumMatrix = new THREE.Matrix4());
    camera.updateMatrixWorld();
    matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(matrix);
    this._frustumAt = stamp;
    this._frustumCamera = camera;
    return frustum;
};

/** Whether a sphere of `radius` at (x, y, z) can reach anything on screen. */
/** Where the drawing camera stands, in world units, or null with no viewport. */
Reactor3D.viewEye = function() {
    const viewport = this.viewport();
    const camera = viewport && viewport.camera ? viewport.camera() : null;
    if (!camera || typeof THREE === "undefined") return null;
    return camera.getWorldPosition(this._viewEye || (this._viewEye = new THREE.Vector3()));
};

Reactor3D.sphereInView = function(x, y, z, radius) {
    const frustum = this.viewFrustum();
    if (!frustum) return true;
    const sphere = this._cullSphere || (this._cullSphere = new THREE.Sphere());
    sphere.center.set(x, y, z);
    sphere.radius = radius;
    return frustum.intersectsSphere(sphere);
};

/** "auto" follows the GPU tier; "off" draws none anywhere. */
Reactor3D.SHADOWS = "auto";
/**
 * The most rows either atlas may hold: the uniform arrays are declared this
 * long, and a tier uses up to this many.
 */
Reactor3D.SHADOW_SLOTS = 8;
/**
 * `slots` is the static atlas's rows — how many lights may cast at once —
 * and `dynamicSlots` the dynamic atlas's, how many of those may also carry
 * moving characters. `staticPerFrame` and `dynamicPerFrame` cap how many
 * rows are rendered in one frame; the rest wait, nearest to the player
 * first, and keep their last rendering meanwhile.
 *
 * `dynamicTriangles` is the ceiling on the geometry the moving casters may
 * put into ONE row, and `dynamicInterval` the fewest frames between two
 * renderings of the same row. The ceiling is real: a character is drawn
 * once per face it stands in, per row it stands in, every time it moves.
 * When the cube maps redrew every character six faces a frame into every
 * slot, ten casters totalling 1.93M triangles cost 289 ms of a 392 ms
 * frame on an integrated Radeon, and that GPU set the old budget of 30k.
 * A row now redraws only the faces a caster occupies (one or two), only
 * when it has moved, one row a frame on that tier, at half rate: the same
 * GPU draws a reduced character (about 150k, what the import optimizer
 * makes of one) in a few milliseconds on the frames it moves. The weak
 * budget takes one such character, the full tier a party of them.
 */
Reactor3D.SHADOW_QUALITY = {
    full: { slots: 8, dynamicSlots: 3, size: 512, taps: 5, dynamicTriangles: 600000, staticPerFrame: 2, dynamicPerFrame: 2, dynamicInterval: 1 },
    weak: { slots: 4, dynamicSlots: 2, size: 256, taps: 1, dynamicTriangles: 200000, staticPerFrame: 1, dynamicPerFrame: 1, dynamicInterval: 2 }
};
/**
 * The six faces of a row, in atlas order: the direction each camera looks
 * and its up. `shadowGlsl` picks the face from the major axis of the
 * light-to-fragment vector and projects with the matching right and up, so
 * the two tables must agree (right = cross(dir, up), as three's lookAt has it).
 */
Reactor3D.SHADOW_FACES = [
    { dir: [1, 0, 0], up: [0, 1, 0] }, { dir: [-1, 0, 0], up: [0, 1, 0] },
    { dir: [0, 1, 0], up: [0, 0, 1] }, { dir: [0, -1, 0], up: [0, 0, -1] },
    { dir: [0, 0, 1], up: [0, 1, 0] }, { dir: [0, 0, -1], up: [0, 1, 0] }
];
/** The cube camera's near plane, in tiles; far is the light's reach. */
Reactor3D.SHADOW_NEAR = 0.1;
/**
 * How far a casting light may drift before its maps are rendered again
 * from the new place, in tiles. A light riding an animated part (a screen
 * glow on a monitor arm that keeps extending) moves a hair every frame,
 * and a map keyed on the exact position redrew the reactor and three
 * consoles six faces each, every frame, for a shadow nobody could tell
 * from the last one. The maps hold, and are read from where they were
 * rendered, until the light has moved this far.
 */
Reactor3D.SHADOW_STATIC_MOVE = 0.25;
/**
 * The fewest frames between two renderings of the same row while it still
 * shows something. Bounds what a drifting light costs: a torch in the
 * player's hand, or a screen glow on an arm that keeps extending, redraws
 * the props around it at most this often, and is read from its last
 * rendering meanwhile.
 */
Reactor3D.SHADOW_STATIC_INTERVAL = 10;
/** A challenger must beat a held row's priority by this fraction to replace it. */
Reactor3D.SHADOW_PRIORITY_HYSTERESIS = 0.25;
/**
 * And must keep beating it for this many frames. A screen swinging on an
 * arm sweeps its cone over the focus and back in under a second; rows
 * that chased every sweep traded shadows constantly between lights of
 * near-equal claim, and every model under them blinked. A light that has
 * left reach altogether still loses its row at once.
 */
Reactor3D.SHADOW_ROW_DWELL = 90;
/**
 * How much of each frame's incident light moves a candidate's ranked
 * value: an exponential average about two seconds long. The cone of a
 * screen on a swinging arm lands on the focus tenfold brighter for a
 * moment and then not at all; ranked on the moment, rows chased it.
 */
Reactor3D.SHADOW_RANK_SMOOTHING = 0.01;
/** A challenger this many times stronger than a held row takes it without waiting out the dwell. */
Reactor3D.SHADOW_ROW_TAKEOVER = 2;
/**
 * A spot aimed away from the focus keeps this much of its claim on a row,
 * so where a light stands decides the row and where it points only tips
 * the balance. At 0.8 the aim is worth a quarter at most — exactly the
 * hysteresis a held row enjoys — so a sweep alone can never trade a row
 * between two lights of equal standing.
 */
Reactor3D.SHADOW_AIM_FLOOR = 0.8;
/**
 * How far a casting character, or one of its bones, must move before the
 * rows it stands in are drawn again, in tiles. An idle animation breathes
 * a hand's width and back; redrawing every frame for that was the whole
 * per-frame cost of shadows on a still map.
 */
Reactor3D.SHADOW_DYNAMIC_MOVE = 0.03;
/** Added to the compare depth, over and above the slope offset below. */
Reactor3D.SHADOW_BIAS = 0.0004;
/**
 * Casters are drawn into the maps with a slope-scaled depth offset (factor,
 * units), so a surface at a grazing angle to its light does not shade
 * itself into acne, and a light a hand's width from a console still lights
 * the face it looks at.
 */
Reactor3D.SHADOW_SLOPE_BIAS = [2, 4];
/** The filter's spread, in texels of the map. */
Reactor3D.SHADOW_SOFTNESS = 1.5;
/**
 * The lowest a shadow source hangs above where its light stands, in tiles.
 * A light in the floor plane puts the foot of everything on the cube map's
 * equator, where the floor's own compare comes out half lit; lifted a
 * little, a lamp on the ground throws whoever walks past it in a long
 * streak across the floor, which is what a lamp on the ground does. The
 * light itself stays where it was authored.
 */
Reactor3D.SHADOW_LIFT = 0.25;
/**
 * How far past `dynamicTriangles` the single nearest caster may go before it
 * is refused outright. Multiplied by the tier's budget, so it scales with
 * the machine rather than naming a number twice.
 */
Reactor3D.SHADOW_DYNAMIC_CEILING = 4;
/** How far off a light is taken to be when a caster's cost is counted with no light known, in tiles. */
Reactor3D.SHADOW_BUDGET_DISTANCE = 3;
Reactor3D.SHADOW_LAYER_STATIC = 1;
Reactor3D.SHADOW_LAYER_DYNAMIC = 2;
/** Bumped by every distance-level swap, so a cached map follows the geometry. */
Reactor3D._lodSwaps = 0;

/** Whether this map wants shadows at all: the engine switch, the mode, the sidecar. */
Reactor3D.shadowsWanted = function(mapData) {
    if (this.SHADOWS === "off" || (this.Quality && !this.Quality.shadows())) return false;
    if (this.lightModeFor(mapData) !== "volume") return false;
    const map = mapData || (typeof $dataMap !== "undefined" ? $dataMap : null);
    const lighting = map && map.reactor3d && map.reactor3d.lighting;
    if (lighting && lighting.shadows === false) return false;
    return true;
};

/**
 * Whether `renderer` may draw the shared shadow rows this frame: they hold
 * one renderer's depth at a time. The map takes them whenever it draws; a
 * second owner (a battle room, or its preview in the editor) only once no
 * other renderer has drawn them for a moment.
 */
Reactor3D.SHADOW_CLAIM_IDLE_MS = 400;
Reactor3D.claimShadows = function(renderer) {
    const shadows = this.Shadows;
    if (!shadows || !renderer) return false;
    if (!shadows._renderer || shadows._renderer === renderer) return true;
    // The map draws them only while its scene runs: once a battle or any other
    // scene has the stage they are free at once, so a room compiles its lit
    // programs once, shadowed, instead of again when the idle time runs out.
    if (this.mapRowsIdle(shadows._renderer)) return true;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    return now - (shadows.lastRenderAt || 0) > this.SHADOW_CLAIM_IDLE_MS;
};

/** Whether `owner` is the game map's renderer while a scene other than the map runs (it draws nothing then). */
Reactor3D.mapRowsIdle = function(owner) {
    if (typeof SceneManager === "undefined" || typeof Scene_Map === "undefined") return false;
    const scene = SceneManager._scene;
    if (!scene || scene instanceof Scene_Map) return false;
    const viewport = this._viewport;
    const mapRenderer = viewport && (typeof viewport.renderer === "function" ? viewport.renderer() : viewport._renderer);
    return !!mapRenderer && mapRenderer === owner;
};

Reactor3D.Shadows = {
    _active: false,
    _renderer: null,
    _atlas: null,
    _dynAtlas: null,
    _tiles: null,
    _dynTiles: null,
    _sentinel: null,
    _pending: null,
    _quality: null,
    _camera: null,
    _static: new Set(),
    _dynamic: new Set(),
    /** Optional: where the eye rests, for an owner whose camera is not the point of interest. */
    focus: null,
    _candidates: [],
    _generation: 0,
    _seenGeneration: NaN,
    _seenLodSwaps: NaN,
    _staticHash: NaN,
    _dynamicHash: NaN,
    _casting: null,
    _castChanges: [],
    _frame: 0,
    /** The light set an owner with its own lights passed to `render`, else null (the shared one). */
    _lightSet: null,
    /** When `render` last ran, for owners taking turns (`Reactor3D.claimShadows`). */
    lastRenderAt: 0,
    backlog: 0,

    quality() {
        if (this._quality) return this._quality;
        this._quality = Reactor3D.SHADOW_QUALITY[Reactor3D.isWeakGpu() ? "weak" : "full"];
        return this._quality;
    },

    active() {
        return this._active;
    },

    /**
     * Whether a program compiled for `renderer` should carry the shadow
     * samplers: only while shadows are on, and only in the renderer whose
     * context the atlas was rendered in. Programs are cached per renderer,
     * so the same material compiles plain elsewhere under the same key.
     */
    appliesTo(renderer) {
        return this._active && (renderer == null || renderer === this._renderer);
    },

    /** Something in the static rows changed in a way the transform hash cannot see. */
    invalidate() {
        this._generation++;
    },

    /**
     * Make an object cast. Dynamic casters are the characters — anything
     * that moves by itself each frame; everything else is static and cached.
     */
    markCaster(root, dynamic) {
        if (!root || typeof THREE === "undefined") return root;
        const layer = dynamic ? Reactor3D.SHADOW_LAYER_DYNAMIC : Reactor3D.SHADOW_LAYER_STATIC;
        const other = dynamic ? Reactor3D.SHADOW_LAYER_STATIC : Reactor3D.SHADOW_LAYER_DYNAMIC;
        root.traverse(child => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.layers.enable(layer);
            child.layers.disable(other);
            child.customDepthMaterial = this.casterMaterialFor(child.material, !!child.isSkinnedMesh);
        });
        root.userData.reactorShadowCaster = dynamic ? "dynamic" : "static";
        (dynamic ? this._dynamic : this._static).add(root);
        (dynamic ? this._static : this._dynamic).delete(root);
        this._generation++;
        return root;
    },

    /**
     * What a caster is drawn with into a row: a depth material with the
     * slope offset and no colour write. Plain surfaces share one per side
     * (and skinned meshes their own, so a program is never re-fetched as a
     * shared material alternates between skinned and rigid draws); a
     * cut-out gets its own, because the map is part of its program, and
     * follows the source's map as it animates. Front faces are drawn from
     * the back, as three's shadow pass draws them, so a surface does not
     * shade itself into acne.
     */
    casterMaterialFor(material, skinned) {
        const first = Array.isArray(material) ? material[0] : material;
        const side = first && first.side !== undefined ? first.side : THREE.FrontSide;
        const flipped = side === THREE.FrontSide ? THREE.BackSide : side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide;
        const make = () => {
            const depth = new THREE.MeshDepthMaterial();
            depth.polygonOffset = true;
            depth.polygonOffsetFactor = Reactor3D.SHADOW_SLOPE_BIAS[0];
            depth.polygonOffsetUnits = Reactor3D.SHADOW_SLOPE_BIAS[1];
            depth.colorWrite = false;
            depth.side = flipped;
            depth.__rrCaster = true;
            return depth;
        };
        if (first && first.__reactorPieces) {
            // Pieces: the storey cut applies in the shadow pass too, else a roof the
            // player stands under, gone from the picture, still darkens the room.
            const pool = this._casterMaterials || (this._casterMaterials = {});
            const key = "pieces" + flipped;
            if (!pool[key]) {
                const depth = make();
                const shared = Reactor3D.cutawayUniforms();
                depth.onBeforeCompile = function(shader) {
                    for (const name of ["rrCutTop", "rrCutBox"]) shader.uniforms[name] = shared[name];
                    shader.vertexShader = "varying vec3 vRRCutPos;\n" + shader.vertexShader.replace("#include <project_vertex>", "#include <project_vertex>\n\tvRRCutPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
                    shader.fragmentShader = "uniform float rrCutTop;\nuniform vec4 rrCutBox;\nvarying vec3 vRRCutPos;\n" + shader.fragmentShader.replace("#include <alphatest_fragment>",
                        "if (vRRCutPos.y > rrCutTop && vRRCutPos.x >= rrCutBox.x && vRRCutPos.z >= rrCutBox.y && vRRCutPos.x <= rrCutBox.z && vRRCutPos.z <= rrCutBox.w) discard;\n\t#include <alphatest_fragment>");
                };
                depth.customProgramCacheKey = function() { return "reactor3d-caster-pieces"; };
                pool[key] = depth;
            }
            return pool[key];
        }
        if (first && first.alphaTest > 0) {
            if (!first.__reactorCasterMaterial) {
                const cutout = make();
                cutout.__rrCutout = true;
                cutout.map = first.map || null;
                cutout.alphaTest = first.alphaTest;
                first.__reactorCasterMaterial = cutout;
            }
            return first.__reactorCasterMaterial;
        }
        const pool = this._casterMaterials || (this._casterMaterials = {});
        const key = (skinned ? "skinned" : "rigid") + flipped;
        return pool[key] || (pool[key] = make());
    },

    /** This frame's lights that may cast, from `syncVolumeLights`. */
    setCandidates(list) {
        this._candidates = Array.isArray(list) ? list : [];
    },

    /**
     * Which candidate takes which row: the best-ranked `count` (nearest to
     * the focus, by `gap` when nothing ranked them), each kept in the row
     * it already had so its rendering survives. An incumbent gets a small
     * priority margin: flicker and near ties must not trade shadows each frame.
     */
    assign(candidates, count, previous, scope) {
        const held = new Set((previous || []).slice(0, count).filter(Boolean).map(p => p.id));
        const rankOf = c => {
            const rank = c.rank !== undefined ? c.rank : c.gap;
            return held.has(c.id) ? rank - Math.max(Math.abs(rank), 0.001) * Reactor3D.SHADOW_PRIORITY_HYSTERESIS : rank;
        };
        const chosen = (candidates || []).slice().sort((a, b) => rankOf(a) - rankOf(b)
            || String(a.id).localeCompare(String(b.id))).slice(0, count);
        // Dwell: an incumbent outranked but still wanting a row keeps it
        // until the challenge has lasted SHADOW_ROW_DWELL frames, taking
        // back the seat of the newest arrival. One that no longer wants a
        // row (nothing in reach) goes at once.
        const dwell = Reactor3D.SHADOW_ROW_DWELL;
        if (held.size && dwell > 0) {
            const losing = (this._losing || (this._losing = {}))[scope || "rows"] || (this._losing[scope || "rows"] = {});
            const wants = new Map((candidates || []).map(c => [c.id, c]));
            const seated = new Set(chosen.map(c => c.id));
            const plain = c => (c.rank !== undefined ? c.rank : c.gap);
            const takeover = Reactor3D.SHADOW_ROW_TAKEOVER;
            // A challenger materially stronger than the incumbent — landing
            // that many times more light on the focus — is not a sweep.
            const outclasses = (challenger, incumbent) => {
                const a = plain(challenger), b = plain(incumbent);
                if (a >= 0) return false;
                return b >= 0 || a <= b * takeover;
            };
            for (const id of held) {
                if (seated.has(id) || !wants.has(id)) { delete losing[id]; continue; }
                if (losing[id] === undefined) losing[id] = this._frame;
                if (this._frame - losing[id] >= dwell) { delete losing[id]; continue; }
                for (let k = chosen.length - 1; k >= 0; k--) {
                    if (held.has(chosen[k].id) || outclasses(chosen[k], wants.get(id))) continue;
                    seated.delete(chosen[k].id);
                    chosen[k] = wants.get(id);
                    seated.add(id);
                    break;
                }
                if (!seated.has(id)) delete losing[id];
            }
            for (const id of Object.keys(losing)) if (!held.has(id)) delete losing[id];
        }
        const result = [];
        for (let k = 0; k < count; k++) result.push(null);
        const pending = [];
        for (const candidate of chosen) {
            const at = previous ? previous.findIndex(p => p && p.id === candidate.id) : -1;
            if (at >= 0 && at < count && !result[at]) result[at] = candidate;
            else pending.push(candidate);
        }
        for (const candidate of pending) {
            const free = result.indexOf(null);
            if (free >= 0) result[free] = candidate;
        }
        return result;
    },

    /**
     * The far plane a row is rendered to. A light's reach breathes with
     * flicker and pulse, and a row rendered to one far plane is read
     * against that same plane, so the row keeps a plane a little past the
     * reach and moves it only when the reach leaves the band — otherwise a
     * candle would re-render every prop in the room sixty times a second.
     */
    farFor(radius, previous) {
        if (previous > 0 && radius <= previous && radius >= previous * 0.6) return previous;
        return Math.ceil((radius * 1.15) / 0.5) * 0.5;
    },

    /**
     * An atlas: `rows` strips of six `size`-pixel faces, a depth texture in
     * compare mode (what a `sampler2DShadow` must be bound to) behind a
     * one-byte colour attachment nothing writes to. Cleared once here, so
     * every row reads as fully lit until it is rendered, and so the depth
     * texture exists before any program names it — a shadow sampler bound
     * to three's empty fallback texture fails the draw outright.
     */
    _makeAtlas(renderer, size, rows) {
        const width = size * 6;
        const height = size * rows;
        const target = new THREE.WebGLRenderTarget(width, height, {
            format: THREE.RedFormat,
            type: THREE.UnsignedByteType,
            minFilter: THREE.NearestFilter,
            magFilter: THREE.NearestFilter,
            generateMipmaps: false,
            depthBuffer: true,
            stencilBuffer: false
        });
        target.texture.name = "shadow-atlas";
        const depth = new THREE.DepthTexture(width, height, THREE.UnsignedIntType);
        depth.format = THREE.DepthFormat;
        depth.compareFunction = THREE.LessEqualCompare;
        depth.minFilter = THREE.LinearFilter;
        depth.magFilter = THREE.LinearFilter;
        depth.generateMipmaps = false;
        depth.name = "shadow-atlas-depth";
        target.depthTexture = depth;
        const was = renderer.getRenderTarget();
        target.scissorTest = false;
        target.viewport.set(0, 0, width, height);
        renderer.setRenderTarget(target);
        renderer.clear(true, true, false);
        renderer.setRenderTarget(was);
        return { target, size, rows };
    },

    /**
     * The sentinel is drawn first in every pass and draws nothing: its
     * `onBeforeRender` is the one hook three fires with a render in
     * progress, which is when the rows are rendered — after every group's
     * visibility for the frame is settled, before the first lit draw reads
     * the atlas.
     */
    _makeSentinel() {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(0), 3));
        const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.name = "shadow-sentinel";
        mesh.frustumCulled = false;
        mesh.renderOrder = -1e9;
        mesh.matrixAutoUpdate = false;
        mesh.onBeforeRender = () => this._flush();
        return mesh;
    },

    _makeTile() {
        // `origin`, `far` and `key` describe what the row holds (or, before
        // its first render, what was asked for); `want` a newer request the
        // row has not been rendered to yet, while the old rendering is
        // still read from where it was made.
        return { id: null, key: "", far: 0, origin: null, want: null, candidate: null, gap: 0, dirty: false, valid: false, stamp: 0, tile: -1 };
    },

    /**
     * The two atlases, the rows that book them, and the camera that draws
     * them, for this renderer. The row count bends to the context's largest
     * texture; a face never does, so a cramped GPU gets fewer lights, not
     * blurrier shadows.
     */
    _ensureAtlas(renderer) {
        if (this._atlas && this._renderer === renderer) return;
        this.disposeSlots();
        this._renderer = renderer;
        const quality = this.quality();
        const max = (renderer.capabilities && renderer.capabilities.maxTextureSize) || 4096;
        let size = quality.size;
        while (size * 6 > max && size > 64) size >>= 1;
        const rows = Math.max(1, Math.min(quality.slots, Reactor3D.SHADOW_SLOTS, Math.floor(max / size)));
        const dynRows = Math.max(1, Math.min(quality.dynamicSlots, Reactor3D.SHADOW_SLOTS, Math.floor(max / size)));
        this._atlas = this._makeAtlas(renderer, size, rows);
        this._dynAtlas = this._makeAtlas(renderer, size, dynRows);
        this._tiles = [];
        for (let k = 0; k < rows; k++) this._tiles.push(this._makeTile());
        this._dynTiles = [];
        for (let j = 0; j < dynRows; j++) this._dynTiles.push(this._makeTile());
        this._camera = new THREE.PerspectiveCamera(90, 1, Reactor3D.SHADOW_NEAR, 1);
        this._sentinel = this._makeSentinel();
        this._frame = 0;
        this._seenGeneration = NaN;
        this._seenLodSwaps = NaN;
        this._bindMaps(Reactor3D.lightUniforms());
    },

    disposeSlots() {
        for (const atlas of [this._atlas, this._dynAtlas]) {
            if (!atlas) continue;
            if (atlas.target.depthTexture) atlas.target.depthTexture.dispose();
            atlas.target.dispose();
        }
        if (this._sentinel) {
            if (this._sentinel.parent) this._sentinel.parent.remove(this._sentinel);
            this._sentinel.geometry.dispose();
            this._sentinel.material.dispose();
        }
        this._atlas = null;
        this._dynAtlas = null;
        this._tiles = null;
        this._dynTiles = null;
        this._camera = null;
        this._sentinel = null;
        this._pending = null;
        this._renderer = null;
        this._staticHash = NaN;
        // The rows are gone, so nothing may be judged unchanged against them.
        this._dynamicHash = NaN;
        this._seenGeneration = NaN;
        this._seenLodSwaps = NaN;
        for (const root of this._static) delete root.userData.rrShadowHash;
        for (const root of this._dynamic) { delete root.userData.rrShadowHash; delete root.userData.rrShadowPose; }
        const uniforms = Reactor3D.lightUniforms();
        uniforms.rrShadowAtlas.value = null;
        uniforms.rrShadowDynAtlas.value = null;
        uniforms.rrShadowInfo.value.fill(-1);
    },

    dispose() {
        this.disposeSlots();
        this._static.clear();
        this._dynamic.clear();
        this._casting = null;
        this._castChanges = [];
        this._dynamicHash = NaN;
        this._candidates = [];
        this._active = false;
        this.backlog = 0;
        Reactor3D.lightUniforms().rrLightShadow.value.fill(-1);
    },

    /**
     * Every lit program recompiles into the other variant. Shadows switch on
     * inside a pass, while HalfLight has its unlit twins in the scene: the
     * original is the one refreshed (its twin follows its version), or the
     * original kept its program without the shadow lookup.
     */
    refreshMaterials(scene) {
        if (!scene) return;
        scene.traverse(object => {
            const mats = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
            for (const mat of mats) if (mat && mat.__reactorLit) (mat.__rrTwinOf || mat).needsUpdate = true;
        });
    },

    /** A number that changes when a static root moves, hides, or appears. */
    _staticHashOf(root) {
        if (!root.visible) return 0.11;
        const e = root.matrixWorld.elements;
        return e[12] * 1.7 + e[13] * 2.3 + e[14] * 3.1 + e[0] * 0.7 + e[5] * 1.1 + e[10] * 1.3 + e[1] * 0.3 + e[8] * 0.5 + 1;
    },

    /**
     * Whether a casting character has moved or animated since its rows were
     * last told so. Root transforms alone are not enough: a character
     * animating on the spot never moves its root, and freezing its shadow
     * while it moved would be the very artefact the dynamic row exists to
     * avoid — so a skinned caster also watches two of its bones. Each point
     * must travel SHADOW_DYNAMIC_MOVE from where it was last reported: an
     * idle animation sways less than that and back, and never adds up.
     */
    _dynamicMoved(root) {
        const data = root.userData;
        const pose = data.rrShadowPose || (data.rrShadowPose = new Float32Array(10).fill(NaN));
        const points = this._posePoints;
        const e = root.matrixWorld.elements;
        points[0] = e[12]; points[1] = e[13]; points[2] = e[14];
        const skeleton = data.rrShadowSkeleton !== undefined
            ? data.rrShadowSkeleton
            : (data.rrShadowSkeleton = this._firstSkeleton(root));
        const bones = skeleton && skeleton.bones.length ? skeleton.bones : null;
        for (let i = 0; i < 2; i++) {
            const bone = bones ? bones[i === 0 ? 0 : bones.length >> 1] : null;
            const b = bone ? bone.matrixWorld.elements : e;
            points[3 + i * 3] = b[12]; points[4 + i * 3] = b[13]; points[5 + i * 3] = b[14];
        }
        points[9] = root.visible ? 1 : 0;
        const limit = Reactor3D.SHADOW_DYNAMIC_MOVE * Reactor3D.SHADOW_DYNAMIC_MOVE;
        let moved = pose[9] !== points[9];
        for (let i = 0; i < 9 && !moved; i += 3) {
            const dx = points[i] - pose[i];
            const dy = points[i + 1] - pose[i + 1];
            const dz = points[i + 2] - pose[i + 2];
            const d = dx * dx + dy * dy + dz * dz;
            if (!(d <= limit)) moved = true;
        }
        if (moved) pose.set(points);
        return moved;
    },
    _posePoints: new Float32Array(10),

    /**
     * Which roots of a set changed since the last look, as the places they
     * were and the places they are, each with the root's span — so a row
     * can tell whether the change was in its reach. A root that left the
     * scene reports where it stood. `all` says every row is stale: a
     * caster was added or re-marked, or a model swapped its distance level.
     */
    _changedRoots(set, dynamic) {
        const points = [];
        for (const root of set) {
            if (!root.parent) {
                set.delete(root);
                if (dynamic && this._casting) this._casting.delete(root);
                if (root.userData.rrShadowAt) points.push(root.userData.rrShadowAt);
                delete root.userData.rrShadowHash;
                delete root.userData.rrShadowPose;
                continue;
            }
            if (dynamic && root.userData.rrShadowCasts === false) continue;
            if (dynamic) {
                if (!this._dynamicMoved(root)) continue;
            } else {
                const hash = this._staticHashOf(root);
                if (hash === root.userData.rrShadowHash) continue;
                root.userData.rrShadowHash = hash;
            }
            const e = root.matrixWorld.elements;
            const now = { x: e[12], y: e[13], z: e[14], r: Reactor3D.instanceSpan(root) };
            if (root.userData.rrShadowAt) points.push(root.userData.rrShadowAt);
            points.push(now);
            root.userData.rrShadowAt = now;
        }
        return points;
    },

    _changedStatics() {
        const points = this._changedRoots(this._static, false);
        // A distance-level swap in the view is not a change here: static rows
        // are always drawn at each model's coarsest level (`withOriginal`),
        // whatever level the view shows. Counting swaps re-rendered every
        // static row about once a frame while the party walked past props.
        const all = this._generation !== this._seenGeneration
            || (this.lodSwapsDirtyStatic && Reactor3D._lodSwaps !== this._seenLodSwaps);
        this._seenGeneration = this._generation;
        this._seenLodSwaps = Reactor3D._lodSwaps;
        return { all, points };
    },

    _changedDynamics() {
        const points = this._changedRoots(this._dynamic, true);
        for (const at of this._castChanges) points.push(at);
        this._castChanges.length = 0;
        return { all: false, points };
    },

    /**
     * How much of a light lands on a point: its brightness through its
     * falloff, and for a spot or a beam, whether the point is inside the
     * cone or the beam at all (a little outside still counts for a tenth,
     * so a character on the edge of a screen's glow is not forgotten).
     * Measured a little above the feet, where a character's body is.
     */
    _incident(candidate, focus) {
        if (!focus) return 0;
        const dx = focus.x - candidate.x;
        const dy = focus.y + 0.7 - (candidate.lightY !== undefined ? candidate.lightY : candidate.y);
        const dz = focus.z - candidate.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const radius = Math.max(0, candidate.priorityRadius === undefined ? candidate.radius : candidate.priorityRadius);
        let fall = 1 - dist / Math.max(radius, 0.001);
        if (fall <= 0) return 0;
        fall *= fall;
        if (candidate.spot && dist > 0.001) {
            const along = (dx * candidate.ax + dy * candidate.ay + dz * candidate.az);
            let inside;
            if (candidate.beam) {
                const off = Math.sqrt(Math.max(0, dist * dist - along * along));
                inside = along > 0 && off <= (candidate.width || 0.08) + 0.5;
                if (!inside) fall *= 0.1;
            } else {
                // Match the cone's soft edge in the priority too. The old
                // inside/outside test jumped tenfold at a single angle.
                // The aim counts for less than the distance: a screen on
                // a swinging arm sweeps its cone over the focus and away
                // every few seconds, and rows that followed the aim
                // traded between near-equal screens on every sweep, each
                // trade blinking every shadow under them.
                const edge = candidate.cosHalf === undefined ? -1 : candidate.cosHalf;
                const inner = edge + (1 - edge) * 0.35;
                const t = Math.max(0, Math.min(1, (along / dist - (edge - 0.08)) / (inner - edge + 0.08)));
                fall *= Reactor3D.SHADOW_AIM_FLOOR + (1 - Reactor3D.SHADOW_AIM_FLOOR) * t * t * (3 - 2 * t);
            }
        }
        return fall * (candidate.strength === undefined ? 1 : candidate.strength);
    },

    /**
     * A row's priority, lower first: the lights that land on the player,
     * brightest first — the screen shining on them before the torch in
     * their hand lighting the floor — then the ones that reach the player
     * without landing, nearest first, then the rest by how far they stop
     * short.
     */
    _rankFor(candidate, focus, incident) {
        if (incident === undefined) incident = this._incident(candidate, focus);
        if (incident > 0) return -incident;
        return candidate.gap <= 0 ? 1e4 + candidate.gap + candidate.radius : 2e4 + candidate.gap;
    },

    /**
     * The incident light a candidate is ranked on: this frame's, eased
     * towards over SHADOW_RANK_SMOOTHING, kept per light id and dropped
     * for a light that stops being offered.
     */
    _smoothedIncident(candidate, focus) {
        const now = this._incident(candidate, focus);
        const rate = Reactor3D.SHADOW_RANK_SMOOTHING;
        if (!(rate > 0) || rate >= 1) return now;
        const store = this._smooth || (this._smooth = new Map());
        const entry = store.get(candidate.id);
        const value = entry === undefined ? now : entry.value + (now - entry.value) * rate;
        store.set(candidate.id, { value, frame: this._frame });
        if (store.size > this._candidates.length * 2 + 8) {
            for (const [id, kept] of store) if (kept.frame !== this._frame) store.delete(id);
        }
        return value;
    },

    /** Whether any of the reported places lies within a row's reach. */
    _touches(points, origin, far) {
        for (const p of points) {
            const reach = far + (p.r || 0);
            const dx = p.x - origin.x;
            const dy = p.y - origin.y;
            const dz = p.z - origin.z;
            if (dx * dx + dy * dy + dz * dz <= reach * reach) return true;
        }
        return false;
    },

    /** Something in the static rows changed since the last look. */
    _staticChanged() {
        const change = this._changedStatics();
        return change.all || change.points.length > 0;
    },

    /** A casting character moved or animated since the last look. */
    _dynamicChanged() {
        return this._changedDynamics().points.length > 0;
    },

    /**
     * Where the budget measures "near" from: the eye, because the shadow a
     * player notices is the one in front of them. Falls back to the first
     * casting light, and finally to nothing — in which case `_budgetDynamic`
     * lets everything cast, exactly as it did before the budget existed.
     */
    _focusPoint(scene) {
        // The player's own model first: in third person the camera stands
        // behind the party, so a follower is nearer the eye than the player
        // and a budget measured from the eye spends itself on the follower
        // and refuses the one shadow the player is actually looking at.
        for (const root of this._dynamic) {
            if (!root.userData || !root.userData.reactorPlayer || !root.parent) continue;
            const e = root.matrixWorld.elements;
            return { x: e[12], y: e[13], z: e[14] };
        }
        // An owner with a better idea of where the eye rests — the editor's
        // orbit target — says so here; its camera itself hangs well above
        // and behind that point.
        if (typeof this.focus === "function") {
            try {
                const point = this.focus();
                if (point && Number.isFinite(point.x)) return point;
            } catch (e) {
                // The candidates below still stand.
            }
        }
        try {
            // The camera actually drawing this frame: the editor registers
            // its own (`cullCamera`), and the game's viewport answers.
            // Asking the viewport alone found nothing in the editor, so the
            // rows went to the first light in the list, wherever it stood.
            const camera = Reactor3D.activeCamera ? Reactor3D.activeCamera() : null;
            if (camera && camera.position) return camera.position;
        } catch (e) {
            // Fall through to the light below.
        }
        const first = this._candidates && this._candidates[0];
        return first ? { x: first.x, y: first.y, z: first.z } : null;
    },

    /**
     * A root's triangles, cached against the distance-level counter so a
     * model that swapped its level is counted again.
     */
    /**
     * What a caster costs a row: the triangles it draws into a face. Shadow
     * faces draw each caster at the simplified level their resolution
     * allows (`GeometryDetail.shadowLevel`), so that level is counted, seen
     * from the nearest light that may cast (`distance`, whole tiles), not
     * the full model: counted whole, a 149k-triangle party filled the weak
     * tier's budget with its leader, and the followers cast no shadow.
     */
    /** Whether a caster is a skinned character (whose shadow is its outline). */
    _isCharacter(root) {
        const data = root.userData || (root.userData = {});
        if (data.rrShadowCharacter === undefined) {
            let skinned = false;
            root.traverse(child => { if (child.isSkinnedMesh) skinned = true; });
            data.rrShadowCharacter = skinned;
        }
        return data.rrShadowCharacter;
    },

    _casterTriangles(root, distance = Reactor3D.SHADOW_BUDGET_DISTANCE) {
        const data = root.userData || (root.userData = {});
        const detail = Reactor3D.GeometryDetail, stamp = Reactor3D._lodSwaps + "/" + (detail ? detail.levelsReady : 0) + "/" + distance;
        if (data.rrShadowTris !== undefined && data.rrShadowTrisAt === stamp) return data.rrShadowTris;
        let total = 0;
        if (detail && detail.shadowTriangles) total = detail.shadowTriangles(root, this.quality().size, distance, Reactor3D.SHADOW_NEAR);
        else root.traverse(child => {
            if (!child.isMesh || !child.geometry) return;
            const geometry = child.geometry;
            const index = geometry.index;
            const position = geometry.attributes && geometry.attributes.position;
            total += (index ? index.count : (position ? position.count : 0)) / 3;
        });
        data.rrShadowTris = total;
        data.rrShadowTrisAt = stamp;
        return total;
    },

    /**
     * Which characters may cast this frame: nearest the focus first, until
     * the tier's triangle budget is spent. Returns what it decided, or null
     * when there was nothing to decide.
     */
    _budgetDynamic(focus) {
        const budget = this.quality().dynamicTriangles;
        const casting = this._casting || (this._casting = new Set());
        if (!focus || !(budget > 0)) {
            // No budget: everything casts again. `_casting` must still list
            // them, because it is what the dynamic rows draw.
            const all = new Set();
            for (const root of this._dynamic) {
                if (!root.parent) { this._dynamic.delete(root); continue; }
                if (!casting.has(root)) this._setCasts(root, true);
                all.add(root);
            }
            this._casting = all;
            return null;
        }
        const ranked = [];
        for (const root of this._dynamic) {
            if (!root.parent) { this._dynamic.delete(root); casting.delete(root); continue; }
            if (!root.visible) continue;
            const e = root.matrixWorld.elements;
            const dx = e[12] - focus.x;
            const dy = e[13] - focus.y;
            const dz = e[14] - focus.z;
            // A caster already chosen is held slightly closer than it is, so
            // a tie at the budget's edge does not alternate frame to frame.
            const bias = casting.has(root) ? 0.75 : 1;
            // The nearest light that may cast, in whole tiles: what the caster costs a face.
            let near = Infinity;
            for (const c of this._candidates) {
                const d = Math.hypot(c.x - e[12], c.y - e[13], c.z - e[14]);
                if (d < c.radius && d < near) near = d;
            }
            ranked.push({ root, gap: (dx * dx + dy * dy + dz * dz) * bias, light: Number.isFinite(near) ? Math.max(1, Math.floor(near)) : Reactor3D.SHADOW_BUDGET_DISTANCE,
                character: this._isCharacter(root) });
        }
        // Characters first (their shadows are outlines, and cheap), then props, nearest first.
        ranked.sort((a, b) => (b.character - a.character) || (a.gap - b.gap));

        // The nearest caster is allowed past the budget, because a rule that
        // could refuse the only shadow on screen is worse than one frame of
        // honest cost — but only so far past it. A row is six faces, so a
        // caster costs six times its triangles every time its row is redrawn:
        // an unreduced 595k-triangle character is 3.6M a redraw, and no
        // shadow is worth that on an integrated GPU. Past the ceiling it
        // casts nothing and the model wants reducing instead.
        const ceiling = budget * Reactor3D.SHADOW_DYNAMIC_CEILING;
        let spent = 0;
        const wanted = new Set();
        for (const entry of ranked) {
            const tris = this._casterTriangles(entry.root, entry.light);
            if (!wanted.size) {
                if (tris <= ceiling) { wanted.add(entry.root); spent += tris; }
                continue;
            }
            if (spent + tris > budget) continue;
            wanted.add(entry.root);
            spent += tris;
        }
        // Every considered root, not just the ones casting last frame:
        // `markCaster` enables the layer as it registers a caster, so a
        // model that appears mid-frame would otherwise cast straight past
        // the budget until it happened to be chosen once.
        for (const entry of ranked) if (!wanted.has(entry.root)) this._setCasts(entry.root, false);
        for (const root of wanted) if (!casting.has(root)) this._setCasts(root, true);
        this._casting = wanted;
        return { casters: wanted.size, considered: ranked.length, triangles: Math.round(spent) };
    },

    /**
     * Put a root's meshes on or off the dynamic depth layer. Either way is
     * a change the rows in its reach must see: a character refused by the
     * budget leaves a shadow behind otherwise, and one admitted has none.
     */
    _setCasts(root, on) {
        const layer = Reactor3D.SHADOW_LAYER_DYNAMIC;
        const was = root.userData.rrShadowCasts;
        root.traverse(child => {
            if (!child.isMesh) return;
            if (on) child.layers.enable(layer);
            else child.layers.disable(layer);
        });
        root.userData.rrShadowCasts = on;
        if (was === on || (was === undefined && on)) return;
        const e = root.matrixWorld ? root.matrixWorld.elements : null;
        if (e) this._castChanges.push({ x: e[12], y: e[13], z: e[14], r: Reactor3D.instanceSpan(root) });
        delete root.userData.rrShadowHash;
        delete root.userData.rrShadowPose;
    },

    _firstSkeleton(root) {
        let found = null;
        root.traverse(child => {
            if (!found && child.isSkinnedMesh && child.skeleton) found = child.skeleton;
        });
        return found;
    },

    /** Whether any casting character stands within a light's reach. */
    _dynamicWithin(candidate, far) {
        const reachBase = far || candidate.radius;
        for (const root of this._dynamic) {
            if (!root.parent) { this._dynamic.delete(root); continue; }
            if (!root.visible || root.userData.rrShadowCasts === false || root === candidate.carrier) continue;
            const e = root.matrixWorld.elements;
            const span = Reactor3D.instanceSpan(root) || 1;
            const reach = reachBase + span;
            const dx = e[12] - candidate.x;
            const dy = e[13] - candidate.y;
            const dz = e[14] - candidate.z;
            if (dx * dx + dy * dy + dz * dz <= reach * reach) return true;
        }
        return false;
    },

    /** Whether any prop stands within a light's reach. */
    _staticWithin(candidate, far) {
        const reachBase = far || candidate.radius;
        for (const root of this._static) {
            if (!root.parent) { this._static.delete(root); continue; }
            if (!root.visible || root === candidate.carrier) continue;
            const e = root.matrixWorld.elements;
            const reach = reachBase + (Reactor3D.instanceSpan(root) || 1);
            const dx = e[12] - candidate.x;
            const dy = e[13] - candidate.y;
            const dz = e[14] - candidate.z;
            if (dx * dx + dy * dy + dz * dz <= reach * reach) return true;
        }
        return false;
    },

    /**
     * Whether a light has anything to shadow at all. One with nothing in
     * reach takes no row: its falloff already says everything.
     */
    _castersWithin(candidate, far) {
        return this._staticWithin(candidate, far) || this._dynamicWithin(candidate, far);
    },

    /** Static casters at their coarsest level for the duration of `fn`. */
    _atCoarsestLod(fn) {
        return Reactor3D.GeometryDetail.withOriginal(() => this._atAuthoredCoarsestLod(fn));
    },

    _atAuthoredCoarsestLod(fn) {
        const swapped = [];
        const cache = Reactor3D._lodCache;
        if (cache) {
            for (const root of this._static) {
                const key = root.userData && root.userData.lodKey;
                const entry = key && cache[key];
                if (!entry || !entry.levels || entry.levels.length < 2) continue;
                const coarse = entry.levels[entry.levels.length - 1];
                const current = entry.levels[root.userData.lodLevel || 0];
                if (coarse === current) continue;
                root.traverse(child => {
                    if (!child.isMesh || child.userData.lodIndex === undefined) return;
                    const geometry = coarse[child.userData.lodIndex];
                    if (geometry && child.geometry !== geometry) {
                        swapped.push([child, child.geometry]);
                        child.geometry = geometry;
                    }
                });
            }
        }
        try {
            fn();
        } finally {
            for (const [child, geometry] of swapped) child.geometry = geometry;
        }
    },

    /**
     * The frame's shadow work, decided before the first pass: which light
     * takes which row, which rows need rendering, and the uniforms that
     * say so. The rendering itself waits for the sentinel, inside the pass.
     */
    /**
     * `options` is for an owner with its own light set (the battle room):
     * `lights`, the uniforms whose `rrLightShadow` says which light reads
     * which row, and `focus`, the world point the rows go to first.
     */
    render(renderer, scene, mapData, options) {
        if (typeof THREE === "undefined" || !renderer || !scene || typeof renderer.setRenderTarget !== "function") return;
        const uniforms = Reactor3D.lightUniforms();
        this._lightSet = options && options.lights || null;
        this.lastRenderAt = typeof performance !== "undefined" ? performance.now() : Date.now();
        const want = Reactor3D.shadowsWanted(mapData);
        if (!want) {
            if (this._active) {
                this._active = false;
                (this._lightSet || uniforms).rrLightShadow.value.fill(-1);
                this.refreshMaterials(scene);
            }
            if (this._sentinel && this._sentinel.parent) this._sentinel.parent.remove(this._sentinel);
            return;
        }
        const fresh = !this._atlas || this._renderer !== renderer;
        this._ensureAtlas(renderer);
        if (this._sentinel.parent !== scene) scene.add(this._sentinel);
        if (scene.matrixWorldAutoUpdate !== false) scene.updateMatrixWorld();
        const quality = this.quality();
        const tiles = this._tiles;
        const dynTiles = this._dynTiles;
        this._frame++;
        const staticChange = this._changedStatics();
        // Which characters can afford to cast, and whether any of them has
        // moved or animated since the rows were drawn. Both must run before
        // the row loop: the budget decides what the change list even holds.
        const focus = (options && options.focus) || this._focusPoint(scene);
        this.lastBudget = this._budgetDynamic(focus);
        const dynamicChange = this._changedDynamics();

        // Only a light with something in reach wants a row, and the rows go
        // first to the lights that actually land on the player.
        const farById = new Map();
        for (const tile of tiles) if (tile.id !== null) farById.set(tile.id, tile.far);
        const wanted = [];
        for (const candidate of this._candidates) {
            candidate.far = this.farFor(candidate.radius, farById.get(candidate.id) || 0);
            candidate.rank = this._rankFor(candidate, focus, this._smoothedIncident(candidate, focus));
            if (this._castersWithin(candidate, candidate.far)) wanted.push(candidate);
        }
        const assigned = this.assign(wanted, tiles.length, tiles.map(t => (t.id === null ? null : { id: t.id })), "static");
        const dynWanted = [];
        for (let k = 0; k < tiles.length; k++) {
            const tile = tiles[k];
            const candidate = assigned[k] || null;
            if (!candidate) {
                tile.id = null;
                tile.key = "";
                tile.candidate = null;
                tile.valid = false;
                tile.dirty = false;
                continue;
            }
            const far = candidate.far;
            const keyFor = (origin, plane) => candidate.id + "|" + origin.x.toFixed(3) + "," + origin.y.toFixed(3) + ","
                + origin.z.toFixed(3) + "|" + plane;
            tile.candidate = candidate;
            tile.gap = candidate.gap;
            if (tile.id !== candidate.id || fresh) {
                // Another light's rendering, or none: this light casts
                // nothing until its own row is drawn.
                tile.id = candidate.id;
                tile.origin = { x: candidate.x, y: candidate.y, z: candidate.z };
                tile.far = far;
                tile.key = keyFor(tile.origin, far);
                tile.want = null;
                tile.valid = false;
                tile.dirty = true;
            } else {
                // The row is rendered from, and read from, one origin: it
                // follows the light only once the light has drifted past
                // SHADOW_STATIC_MOVE or the reach band moved — and even
                // then the old rendering is read from its own origin until
                // the new one lands, rather than the light losing its
                // shadows for the frames in between.
                const held = tile.far === far
                    && Math.hypot(candidate.x - tile.origin.x, candidate.y - tile.origin.y, candidate.z - tile.origin.z) <= Reactor3D.SHADOW_STATIC_MOVE;
                if (held) {
                    tile.want = null;
                } else {
                    const origin = { x: candidate.x, y: candidate.y, z: candidate.z };
                    tile.want = { origin, far, key: keyFor(origin, far) };
                    tile.dirty = true;
                }
                if (staticChange.all || this._touches(staticChange.points, tile.origin, tile.far)) tile.dirty = true;
            }
            if (this._dynamicWithin(candidate, far)) dynWanted.push({ id: candidate.id, gap: candidate.gap, rank: candidate.rank, tile: k });
        }
        // The dynamic rows go to the best-ranked of those lights with a
        // character in reach, and follow their light's static row.
        const dynAssigned = this.assign(dynWanted, dynTiles.length, dynTiles.map(d => (d.id === null ? null : { id: d.id })), "dynamic");
        for (let j = 0; j < dynTiles.length; j++) {
            const row = dynTiles[j];
            const chosen = dynAssigned[j] || null;
            if (!chosen) {
                row.id = null;
                row.key = "";
                row.tile = -1;
                row.valid = false;
                row.dirty = false;
                continue;
            }
            const tile = tiles[chosen.tile];
            row.tile = chosen.tile;
            if (row.id !== chosen.id || row.key !== tile.key) {
                row.id = chosen.id;
                row.key = tile.key;
                row.valid = false;
                row.dirty = true;
            } else if (dynamicChange.points.length && this._touches(dynamicChange.points, tile.origin, tile.far)) {
                row.dirty = true;
            }
        }
        // This frame's share of the work: rows with nothing to show yet
        // first, then the nearest; dynamic rows the longest unrefreshed
        // first. A row that already shows something is redrawn no more
        // often than SHADOW_STATIC_INTERVAL allows, so a light riding an
        // animated part, or a torch in the player's hand, redraws the props
        // around it a few times a second rather than every frame.
        const interval = Reactor3D.SHADOW_STATIC_INTERVAL;
        let staticJobs = tiles.filter(t => t.id !== null && t.dirty && (!t.valid || this._frame - t.stamp >= interval))
            .sort((a, b) => (a.valid - b.valid) || (a.gap - b.gap))
            .slice(0, quality.staticPerFrame || 1);
        // A new origin/far plane changes how BOTH atlases are sampled. Queue
        // its dynamic partner too, even if the characters stood still.
        for (const row of dynTiles) {
            const tile = tiles[row.tile];
            if (row.id !== null && tile && tile.id === row.id && tile.want && staticJobs.includes(tile)) row.dirty = true;
        }
        const dynInterval = quality.dynamicInterval || 1;
        const dynJobs = dynTiles.filter(d => d.id !== null && d.dirty && (!d.valid || this._frame - d.stamp >= dynInterval))
            .sort((a, b) => (a.valid - b.valid) || (a.stamp - b.stamp))
            .slice(0, quality.dynamicPerFrame || 1);
        // Keep the old, matching pair until both rows fit this frame's
        // budgets. Publishing just the new static origin would hide the old
        // dynamic shadow for a frame (or longer on the weak tier).
        staticJobs = staticJobs.filter(tile => !tile.want || !dynTiles.some(row =>
            row.id === tile.id && row.valid && !dynJobs.includes(row)));
        this.backlog = tiles.filter(t => t.id !== null && t.dirty).length - staticJobs.length
            + dynTiles.filter(d => d.id !== null && d.dirty).length - dynJobs.length;
        this._publish(uniforms);
        this._pending = { renderer, scene, statics: staticJobs, dynamics: dynJobs, activate: !this._active };
        this.lastFrame = {
            statics: staticJobs.length, dynamics: dynJobs.length,
            slots: assigned.filter(Boolean).length, dynamicSlots: dynAssigned.filter(Boolean).length,
            candidates: this._candidates.length, wanted: wanted.length, backlog: this.backlog
        };
        if (!this._reported) {
            // Once, so a "why does X cast no shadow" report carries the tier,
            // the row counts and the moving-caster budget it was made under.
            this._reported = true;
            console.info("RPG Reactor shadows: " + Reactor3D.tier() + " tier, " + tiles.length + " casting light row(s), "
                + dynTiles.length + " moving-caster row(s), " + quality.dynamicTriangles + " moving-caster triangles per row, faces "
                + this._atlas.size + "px");
        }
    },

    /**
     * The uniforms that say which light reads which row: only a row whose
     * rendering matches its light is offered, and a dynamic row only while
     * its static row is.
     */
    _publish(uniforms) {
        const shadowOf = (this._lightSet || uniforms).rrLightShadow.value;
        const info = uniforms.rrShadowInfo.value;
        const pos = uniforms.rrShadowPos.value;
        shadowOf.fill(-1);
        const tiles = this._tiles || [];
        const dynTiles = this._dynTiles || [];
        const size = this._atlas ? this._atlas.size : 512;
        for (let k = 0; k < tiles.length; k++) {
            const tile = tiles[k];
            const at = k * 4;
            info[at + 2] = -1;
            if (tile.id === null || !tile.candidate) continue;
            pos[at] = tile.origin.x;
            pos[at + 1] = tile.origin.y;
            pos[at + 2] = tile.origin.z;
            info[at] = Reactor3D.SHADOW_NEAR;
            info[at + 1] = tile.far;
            info[at + 3] = Reactor3D.SHADOW_SOFTNESS / size;
            if (tile.valid) shadowOf[tile.candidate.index] = k;
        }
        for (let j = 0; j < dynTiles.length; j++) {
            const row = dynTiles[j];
            if (row.id === null || !row.valid || row.tile < 0) continue;
            const tile = tiles[row.tile];
            if (!tile || !tile.valid || tile.id !== row.id || tile.key !== row.key) continue;
            info[row.tile * 4 + 2] = j;
        }
    },

    /**
     * Which of a row's six faces have any caster in them: a face looking at
     * the ceiling over a lamp has nothing to draw, and a strip of empty
     * faces is most of what a light standing among a few props renders.
     * The test is the caster's centre against the face's 90-degree frustum
     * with the caster's span as slack.
     */
    _faceMask(origin, far, roots, exclude) {
        let mask = 0;
        const p = [0, 0, 0];
        for (const root of roots) {
            if (!root.parent || !root.visible || root.userData.rrShadowCasts === false || root === exclude) continue;
            const e = root.matrixWorld.elements;
            const r = Reactor3D.instanceSpan(root) || 1;
            p[0] = e[12] - origin.x;
            p[1] = e[13] - origin.y;
            p[2] = e[14] - origin.z;
            const d = Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]);
            if (d - r > far) continue;
            if (d <= r) return 63;
            for (let axis = 0; axis < 3; axis++) {
                const o1 = Math.abs(p[(axis + 1) % 3]) - r;
                const o2 = Math.abs(p[(axis + 2) % 3]) - r;
                const forward = p[axis] + r;
                if (forward > 0 && o1 <= forward && o2 <= forward) mask |= 1 << (axis * 2);
                const back = -p[axis] + r;
                if (back > 0 && o1 <= back && o2 <= back) mask |= 1 << (axis * 2 + 1);
            }
            if (mask === 63) return mask;
        }
        return mask;
    },

    /**
     * Casters drawn with their depth materials instead of their own, for
     * the duration of a pass; returns what to hand `_unswap`. A cut-out's
     * caster follows the source's map, which a sprite sheet swaps as it
     * animates.
     */
    _swapCasters(roots) {
        const swapped = [];
        for (const root of roots) {
            if (!root.parent || !root.visible) continue;
            root.traverse(child => {
                const caster = child.isMesh ? child.customDepthMaterial : null;
                if (!caster || !caster.__rrCaster) return;
                const source = child.material;
                if (caster.__rrCutout && source && !Array.isArray(source)) {
                    const map = source.map || null;
                    if (caster.map !== map) {
                        caster.map = map;
                        caster.needsUpdate = true;
                    }
                    caster.alphaTest = source.alphaTest;
                }
                child.material = caster;
                swapped.push(child, source);
            });
        }
        return swapped;
    },

    _unswap(swapped) {
        for (let i = 0; i < swapped.length; i += 2) swapped[i].material = swapped[i + 1];
    },

    /**
     * One row: six faces of depth from `origin`, each cleared and, when a
     * caster stands in it, drawn through three's ordinary render with the
     * camera's layers set to the casters' layer — so it culls to the face,
     * skins, and honours cut-outs as the main pass does. The scene's world
     * matrices are already this frame's; the nested renders must not walk
     * them six times over. `exclude` is the light's own carrier: a model
     * whose surface the light sits on would otherwise shadow the whole
     * room from a hand's width away.
     */
    _renderTile(renderer, scene, atlas, row, origin, far, layer, roots, exclude) {
        const size = atlas.size;
        const target = atlas.target;
        const camera = this._camera;
        camera.layers.set(layer);
        camera.near = Reactor3D.SHADOW_NEAR;
        camera.far = far;
        camera.updateProjectionMatrix();
        camera.position.set(origin.x, origin.y, origin.z);
        const mask = this._faceMask(origin, far, roots, exclude);
        const hide = exclude && exclude.parent && exclude.visible ? exclude : null;
        if (hide) hide.visible = false;
        const detail = Reactor3D.GeometryDetail, swapped = detail && detail.forShadow ? detail.forShadow(roots, origin, size, camera.near) : null;
        try {
            this._renderFaces(renderer, scene, target, size, row, origin, camera, mask);
        } finally {
            if (swapped) detail.end(swapped);
            if (hide) hide.visible = true;
        }
    },

    rowClearEnabled: true,
    // The kill switch: true re-renders every static row on any distance-level swap, as before.
    lodSwapsDirtyStatic: false,
    _renderFaces(renderer, scene, target, size, row, origin, camera, mask) {
        if (!this.rowClearEnabled) return this._renderFacesOriginal(renderer, scene, target, size, row, origin, camera, mask);
        target.viewport.set(0, row * size, size * 6, size);
        target.scissor.copy(target.viewport);
        target.scissorTest = true;
        renderer.setRenderTarget(target);
        // Disjoint faces share one depth clear; excluded faces still become empty.
        renderer.clear(false, true, false);
        for (let face = 0; face < 6; face++) {
            if (!(mask & (1 << face))) continue;
            target.viewport.set(face * size, row * size, size, size);
            target.scissor.copy(target.viewport);
            renderer.setRenderTarget(target);
            const spec = Reactor3D.SHADOW_FACES[face];
            camera.up.set(spec.up[0], spec.up[1], spec.up[2]);
            camera.lookAt(origin.x + spec.dir[0], origin.y + spec.dir[1], origin.z + spec.dir[2]);
            camera.updateMatrixWorld(true);
            Reactor3D.Shadows.renderFace(renderer, scene, camera);
        }
    },

    /** One face of a row: characters the face cannot see are not skinned into it (InstanceCull). */
    renderFace(renderer, scene, camera) {
        const cull = Reactor3D.InstanceCull, hidden = cull ? cull.hide(scene, camera) : null;
        try { renderer.render(scene, camera); } finally { if (hidden) cull.show(hidden); }
    },

    _renderFacesOriginal(renderer, scene, target, size, row, origin, camera, mask) {
        for (let face = 0; face < 6; face++) {
            target.viewport.set(face * size, row * size, size, size);
            target.scissor.set(face * size, row * size, size, size);
            target.scissorTest = true;
            renderer.setRenderTarget(target);
            renderer.clear(false, true, false);
            if (!(mask & (1 << face))) continue;
            const spec = Reactor3D.SHADOW_FACES[face];
            camera.up.set(spec.up[0], spec.up[1], spec.up[2]);
            camera.lookAt(origin.x + spec.dir[0], origin.y + spec.dir[1], origin.z + spec.dir[2]);
            camera.updateMatrixWorld(true);
            Reactor3D.Shadows.renderFace(renderer, scene, camera);
        }
    },

    /**
     * The depth passes, from the sentinel's hook. On the frame shadows come
     * on, the atlas is bound before any program declares a sampler for it,
     * and only then do the lit materials switch to the shadow variant — a
     * shadow sampler bound to no depth texture fails the draw outright.
     */
    _flush() {
        return Reactor3D.GeometryDetail.withOriginal(() => this._flushOriginal());
    },

    _flushOriginal() {
        const pending = this._pending;
        if (!pending) return;
        this._pending = null;
        const { renderer, scene, statics, dynamics } = pending;
        if (statics.length || dynamics.length) {
            const target = renderer.getRenderTarget();
            const autoClear = renderer.autoClear;
            const autoUpdate = scene.matrixWorldAutoUpdate;
            const background = scene.background;
            renderer.autoClear = false;
            scene.matrixWorldAutoUpdate = false;
            scene.background = null;
            try {
                if (statics.length) {
                    const swapped = this._swapCasters(this._static);
                    try {
                        this._atCoarsestLod(() => {
                            for (const tile of statics) {
                                const to = tile.want || tile;
                                this._renderTile(renderer, scene, this._atlas, this._tiles.indexOf(tile), to.origin, to.far,
                                    Reactor3D.SHADOW_LAYER_STATIC, this._static, tile.candidate && tile.candidate.carrier);
                            }
                        });
                    } finally {
                        this._unswap(swapped);
                    }
                    for (const tile of statics) {
                        if (tile.want) {
                            tile.origin = tile.want.origin;
                            tile.far = tile.want.far;
                            tile.key = tile.want.key;
                            tile.want = null;
                        }
                        tile.valid = true;
                        tile.dirty = false;
                        tile.stamp = this._frame;
                    }
                }
                if (dynamics.length) {
                    const roots = this._casting || this._dynamic;
                    const swapped = this._swapCasters(roots);
                    try {
                        for (const row of dynamics) {
                            const tile = this._tiles[row.tile];
                            if (!tile || tile.id !== row.id) continue;
                            this._renderTile(renderer, scene, this._dynAtlas, this._dynTiles.indexOf(row), tile.origin, tile.far,
                                Reactor3D.SHADOW_LAYER_DYNAMIC, roots, tile.candidate && tile.candidate.carrier);
                        }
                    } finally {
                        this._unswap(swapped);
                    }
                    for (const row of dynamics) {
                        const tile = this._tiles[row.tile];
                        if (tile) row.key = tile.key;
                        row.valid = true;
                        row.dirty = false;
                        row.stamp = this._frame;
                    }
                }
            } finally {
                renderer.setRenderTarget(target);
                renderer.autoClear = autoClear;
                scene.matrixWorldAutoUpdate = autoUpdate;
                scene.background = background;
            }
        }
        const uniforms = Reactor3D.lightUniforms();
        this._bindMaps(uniforms);
        this._publish(uniforms);
        if (pending.activate) {
            this._active = true;
            this.refreshMaterials(scene);
        }
    },

    /**
     * Take the atlases off every 2D texture unit of a context another
     * library is about to draw through (see `Viewport._resetPixi`). Nothing
     * to do while no atlas exists.
     */
    unbindFrom(renderer) {
        if (!this._atlas || !renderer || this._renderer !== renderer || typeof renderer.getContext !== "function") return;
        const gl = renderer.getContext();
        const units = (renderer.capabilities && renderer.capabilities.maxTextures) || 16;
        for (let unit = 0; unit < units; unit++) {
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(gl.TEXTURE_2D, null);
        }
        gl.activeTexture(gl.TEXTURE0);
    },

    _bindMaps(uniforms) {
        const atlas = this._atlas;
        const dyn = this._dynAtlas;
        uniforms.rrShadowAtlas.value = atlas ? atlas.target.depthTexture : null;
        uniforms.rrShadowDynAtlas.value = dyn ? dyn.target.depthTexture : null;
        const grid = uniforms.rrShadowGrid.value;
        grid[0] = 1 / 6;
        grid[1] = atlas ? 1 / atlas.rows : 1;
        grid[2] = dyn ? 1 / dyn.rows : 1;
        grid[3] = atlas ? 1 / atlas.size : 1 / 512;
    }
};

/**
 * How strongly a light reads, over and above the alpha the plugin gave it.
 *
 * One by default, and raising it is not free: the quads are added, so a channel
 * pushed past full clamps while the others carry on climbing, and an amber lamp
 * turns white from the middle outwards. The colour is normalised below to hold
 * its hue, but brightness is better found by *darkening* — the ambient level in
 * the map's sidecar — than by pushing light past what a channel can hold.
 */
Reactor3D.LIGHT_GAIN = 1;

Reactor3D._lights = [];
Reactor3D._ambient = null;

/**
 * Declare the lights on the map this frame.
 *
 * Each entry: `{ type, x, y, height, radius, colour, intensity, angle, yaw }`.
 * `x`/`y` are map cells and `radius` is in tiles; `angle` and `yaw` are degrees
 * and only mean anything for a spot. Everything but a position has a sensible
 * default, so the smallest useful light is `{ x, y, radius }`.
 *
 * Called every frame by a shim. Cheap to call: the descriptors are compared
 * against what is already in the scene, and only a change of count or kind
 * rebuilds anything.
 */
Reactor3D.setLights = function(lights) {
    this._lights = Array.isArray(lights) ? lights : [];
};

Reactor3D.lights = function() {
    return this._lights;
};

/**
 * The light everything gets regardless.
 *
 * A lighting plugin's darkness is the absence of its lights, so without an
 * ambient floor an unlit corner of a 3D map is pure black rather than dim.
 * `null` means "no lighting at all" — the unlit look, which is what a map with
 * no lighting plugin should keep.
 */
Reactor3D.setAmbient = function(ambient) {
    this._ambient = ambient || null;
};

Reactor3D.ambient = function() {
    return this._ambient;
};

//-----------------------------------------------------------------------------
// Time of day
//
// The map's ambient says what time it is: bright and white is day, middling
// and warm is dusk (or dawn), low and cool is night. A sun follows it unless
// it says `daylight: "fixed"`: full at day, low and amber at dusk, and at
// night a dim pale-blue moon that still casts. On a map with a sky image the
// dome and the studio reflection follow too, so a lake does not mirror a noon
// sky at midnight. A map with neither a sun nor a sky (indoors) is unchanged;
// an indoor map lit by the Indoor preset with a sun overhead should fix that sun.

/** The night sun's share of its authored brightness, and its colour. */
Reactor3D.MOONLIGHT = 0.07;
Reactor3D.MOON_COLOUR = 0xa9bde6;
/** A twilight sun's share of its brightness, and the amber it turns. */
Reactor3D.DUSK_SUN = 0.5;
Reactor3D.DUSK_SUN_COLOUR = 0xffa964;
/** The sky dome's tint at night, at a warm dusk and at a grey (cool or neutral) twilight, as seen (sRGB). */
Reactor3D.NIGHT_SKY = [0.14, 0.18, 0.33];
Reactor3D.DUSK_SKY = [1.0, 0.74, 0.56];
Reactor3D.GREY_SKY = [0.62, 0.64, 0.7];

/**
 * The time of day an ambient `{ intensity, colour }` stands for, written into
 * `out` (made once when absent): `day`, `twilight` and `night` (weights summing
 * to 1), `warm` (0-1, how amber the twilight is), `sun` (a following sun's
 * brightness factor), `sunMix`/`amberMix`/`moonMix` (how its colour is made:
 * authored, amber, moon), `sky` ([r, g, b] as seen) and `skyLinear` (the same in
 * light, what the dome and the studio reflection are multiplied by). No ambient
 * (an unlit map) is full day.
 */
Reactor3D.daylightOf = function(ambient, out) {
    out = out || { sky: [1, 1, 1], skyLinear: [1, 1, 1] };
    const level = ambient && Number.isFinite(ambient.intensity) ? Math.max(0, ambient.intensity) : 1;
    const colour = ambient && ambient.colour !== undefined ? ambient.colour : 0xffffff;
    const r = ((colour >> 16) & 255) / 255, b = (colour & 255) / 255;
    const step = (lo, hi, v) => { const t = Math.max(0, Math.min(1, (v - lo) / (hi - lo))); return t * t * (3 - 2 * t); };
    const night = ambient ? 1 - step(0.15, 0.5, level) : 0;
    const bright = ambient ? step(0.35, 1.0, level) : 1;
    const day = (1 - night) * bright, twilight = (1 - night) * (1 - bright);
    const warm = Math.max(0, Math.min(1, (r - b) / 0.35));
    out.day = day; out.twilight = twilight; out.night = night; out.warm = warm;
    out.sun = day + twilight * this.DUSK_SUN + night * this.MOONLIGHT;
    out.amberMix = twilight * warm;
    out.moonMix = night;
    out.sunMix = Math.max(0, 1 - out.amberMix - out.moonMix);
    const sky = out.sky || (out.sky = [1, 1, 1]), linear = out.skyLinear || (out.skyLinear = [1, 1, 1]);
    for (let i = 0; i < 3; i++) {
        sky[i] = day + twilight * (warm * this.DUSK_SKY[i] + (1 - warm) * this.GREY_SKY[i]) + night * this.NIGHT_SKY[i];
        linear[i] = Math.pow(sky[i], 2.2);
    }
    return out;
};

/** The time of day of the current ambient (`setAmbient`), worked out again only when it changes. */
Reactor3D.daylight = function(ambient = this._ambient) {
    const cache = this._daylightCache || (this._daylightCache = { level: NaN, colour: NaN, unlit: null, value: { sky: [1, 1, 1], skyLinear: [1, 1, 1] } });
    const unlit = !ambient;
    const level = ambient ? ambient.intensity : 1, colour = ambient ? ambient.colour : 0xffffff;
    if (cache.unlit !== unlit || cache.level !== level || cache.colour !== colour) {
        cache.unlit = unlit; cache.level = level; cache.colour = colour;
        this.daylightOf(ambient || null, cache.value);
    }
    return cache.value;
};

/**
 * A sun's colour and brightness at this time of day (`day` from `daylight`),
 * into `out`: as authored for a fixed sun or anything that is not a sun.
 */
Reactor3D.sunAtDaylight = function(light, colour, intensity, day, out) {
    out = out || {};
    out.colour = colour; out.intensity = intensity;
    if (!light || light.type !== this.LIGHT_SUN || light.daylight === "fixed" || !day) return out;
    const c = colour === undefined || colour === null ? 0xffffff : colour;
    const channel = shift => Math.round(Math.min(255,
        ((c >> shift) & 255) * day.sunMix + ((this.DUSK_SUN_COLOUR >> shift) & 255) * day.amberMix + ((this.MOON_COLOUR >> shift) & 255) * day.moonMix));
    out.colour = (channel(16) << 16) | (channel(8) << 8) | channel(0);
    out.intensity = (intensity === undefined ? 1 : intensity) * day.sun;
    return out;
};

/**
 * The lights worth carrying, nearest a point first.
 *
 * A light is only worth a slot if it can be seen from where the camera is
 * looking, so the budget goes to the closest — and a light whose radius does
 * not reach the focus at all is dropped before the sort, which on a city map
 * removes most of them for nothing.
 */
Reactor3D.nearestLights = function(lights, focus) {
    if (!Array.isArray(lights)) return [];
    if (lights.length <= this.MAX_LIGHTS) return lights;
    if (!focus) return lights.slice(0, this.MAX_LIGHTS);

    const reach = [];
    for (const light of lights) {
        const dx = (light.x || 0) - focus.x;
        const dy = (light.y || 0) - focus.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        // Its own radius plus a screenful: a lantern well off the side of the
        // view lights nothing that can be seen, however bright it is.
        if (distance > (light.radius || 0) + this.LIGHT_CULL_MARGIN) continue;
        reach.push({ light, distance });
    }
    reach.sort((a, b) => a.distance - b.distance);
    return reach.slice(0, this.MAX_LIGHTS).map(entry => entry.light);
};

/** How far past its own reach a light is still considered, in tiles. */
Reactor3D.LIGHT_CULL_MARGIN = 20;

/*
 * What a wall hides.
 *
 * The light quads deliberately draw with depth-testing off — light falls on
 * sprites, and a doorpost must not slice a bite out of its own lamp's pool.
 * The price was that nothing hid them at all: a lamp in the next room glowed
 * through the wall, and a torch aimed at a wall painted its full beam up the
 * wall's face. So what a wall should hide is decided here instead, with a
 * height-aware march over map cells — no triangles, no raycasts, cheap enough
 * for a lantern on every corner.
 */
Reactor3D.LIGHT_OCCLUSION = true;

/**
 * Whether the camera stands in the walkable interior, where hiding a lamp
 * behind a wall means something. Outside the grid, or embedded in a cell the
 * solid grid calls wall (a room's unpainted shell), the eye is a cinematic
 * viewpoint: it sees the interior the renderer draws regardless, so its
 * sight-lines must not be marched through the shell.
 */
Reactor3D.lightEyeInterior = function(eye) {
    const mapData = typeof $dataMap !== "undefined" ? $dataMap : null;
    if (!mapData || !eye) return false;
    const x = Math.round(eye.x - 0.5);
    const y = Math.round(eye.z - 1);
    if (x < 0 || y < 0 || x >= mapData.width || y >= mapData.height) return false;
    return eye.y >= this.lightBlockHeightAt(x, y);
};

/** Where a room map has no floor tile at all it is wall, cached per map. */
Reactor3D.lightSolidGrid = function() {
    if (typeof $gameMap === "undefined" || !$gameMap || !$gameMap.width) return this._lightSolid || null;
    const map = typeof $dataMap !== "undefined" ? $dataMap : null;
    const width = $gameMap.width();
    const height = $gameMap.height();
    if (!(width > 0) || !(height > 0)) return null;
    // Asked once per sample of every light's march, so the cache is matched
    // on its numbers; the string key is only for reading in a console.
    const mapId = $gameMap._mapId || 0;
    const known = this._lightSolid;
    if (known && known.mapId === mapId && known.width === width && known.height === height) return known;
    const key = mapId + ":" + width + "x" + height;
    const room = this.roomFor(map);
    const grid = new Uint8Array(width * height);
    if (room) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!$gameMap.allTiles(x, y).some(tile => tile > 0)) grid[y * width + x] = 1;
            }
        }
    }
    this._lightSolid = { key, mapId, width, height, grid, room: !!room, roomHeight: room && room.height > 0 ? room.height : 25 };
    return this._lightSolid;
};

/** How high the world stands at a cell, as far as light is concerned. */
Reactor3D.lightBlockHeightAt = function(x, y) {
    const solid = this.lightSolidGrid ? this.lightSolidGrid() : null;
    const cx = Math.round(x);
    const cy = Math.round(y);
    if (solid) {
        if (cx < 0 || cy < 0 || cx >= solid.width || cy >= solid.height) {
            return solid.room ? solid.roomHeight : 0;
        }
        if (solid.room && solid.grid[cy * solid.width + cx]) return solid.roomHeight;
    }
    const map = typeof $dataMap !== "undefined" ? $dataMap : null;
    return this.surfaceHeightAt(map, cx, cy);
};

/**
 * Whether a straight line between two heighted points crosses something
 * taller than itself. Neither endpoint's own cell may block: the wall a lamp
 * hangs on is not between the lamp and anything.
 */
Reactor3D.lightSegmentBlocked = function(x0, y0, h0, x1, y1, h1) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const span = Math.hypot(dx, dy);
    if (!(span > 1.5)) return false;
    const steps = Math.ceil(span * 2);
    for (let i = 1; i < steps; i++) {
        const t = i / steps;
        const d = t * span;
        if (d < 0.75 || span - d < 0.75) continue;
        const height = h0 + (h1 - h0) * t;
        if (this.lightBlockHeightAt(x0 + dx * t, y0 + dy * t) > height + 0.3) return true;
    }
    return false;
};

/**
 * Where a laser lands: how far along its aim the first surface stops it,
 * in tiles, or null when nothing within reach does. The ground, roofs, a
 * room's shell and its walls are the map's light-block heights, marched a
 * sixth of a tile at a time in three dimensions; placed models are their
 * world bounds, and a model the beam starts inside (the one carrying it)
 * never stops its own beam. `x, y` are the packer's tile coordinates, `h`
 * the world height the beam leaves from, `length` its reach.
 */
Reactor3D.BEAM_MARCH_STEP = 1 / 6;
Reactor3D.beamHit = function(x, y, h, ax, ay, az, length, scene, bounds) {
    let best = null;
    const step = this.BEAM_MARCH_STEP;
    for (let d = step; d <= length; d += step) {
        const py = h + ay * d;
        if (py <= this.lightBlockHeightAt(x + ax * d, y + az * d)) { best = d; break; }
    }
    const instances = scene && scene._modelInstances;
    if (instances && typeof THREE !== "undefined") {
        const ray = this._beamRay || (this._beamRay = new THREE.Ray());
        const box = this._beamBox || (this._beamBox = new THREE.Box3());
        const hit = this._beamPoint || (this._beamPoint = new THREE.Vector3());
        ray.origin.set(x + 0.5, h, y + 1);
        ray.direction.set(ax, ay, az).normalize();
        for (const holder of instances.values()) {
            const object = holder && holder.object;
            if (!object || !object.visible) continue;
            let worldBox = bounds && bounds.get(object);
            if (!worldBox) {
                worldBox = bounds ? new THREE.Box3() : box;
                worldBox.setFromObject(object);
                if (bounds) bounds.set(object, worldBox);
            }
            if (worldBox.isEmpty() || worldBox.containsPoint(ray.origin)) continue;
            if (!ray.intersectBox(worldBox, hit)) continue;
            const d = hit.distanceTo(ray.origin);
            if (d > 0.05 && d < length && (best === null || d < best)) best = d;
        }
    }
    return best;
};

/** How far a beam gets before the first wall in its way, in tiles. */
Reactor3D.clampConeReach = function(x, y, h, ax, az, radius) {
    for (let d = 0.75; d < radius; d += 0.5) {
        if (this.lightBlockHeightAt(x + ax * d, y + az * d) > h + 0.75) return Math.max(0.5, d);
    }
    return radius;
};

/** Whether anything has asked for lighting on this map. */
Reactor3D.isLit = function() {
    return !!this._ambient || this._lights.length > 0;
};

//-----------------------------------------------------------------------------
// Lighting shims
//
// A lighting plugin owns its lights and knows nothing about a third dimension.
// Reading its internals is the only way to reach them, so that reading is
// quarantined here: one small function per plugin, each free to fail, and the
// plugin itself is never modified. A project running neither is untouched.

Reactor3D.LightShims = {};

/**
 * MVNovaLighting.
 *
 * Its manager hands out the lights on the current map, each already carrying a
 * map-cell position, a radius in pixels, a tint and an alpha. `flashlight` is
 * its cone; `fire` is a point that flickers, which three.js gives for free
 * because the plugin animates the values this reads.
 */
Reactor3D.LightShims.nova = function() {
    const nova = typeof Anisoft !== "undefined" && Anisoft.Nova;
    const manager = nova && nova.LightManager;
    if (!manager || typeof manager.currentMapLights !== "function") return null;

    const tile = typeof $gameMap !== "undefined" && $gameMap.tileWidth
        ? $gameMap.tileWidth() : 48;
    const lights = [];
    for (const light of manager.currentMapLights()) {
        if (!light || light.active === false) continue;
        const at = light.position;
        if (!at) continue;

        const spot = light.type === "flashlight";
        let radius, angle;
        if (spot) {
            // A flashlight's size is neither its scale nor its bitmap alone.
            // `Sprite_Light.refresh` draws the cone at
            //
            //     scale.set(data.scale.x / bitmap.resolution)
            //
            // so what reaches the screen is the bitmap times that factor.
            // Reading `scale` on its own gave a ten-tile beam built out of the
            // 512 fallback Nova leaves in `radius` for cones; reading the
            // bitmap on its own dropped the 8x factor and gave a needle. Both
            // together are the beam the player actually sees.
            const bitmap = light.bitmap;
            const scale = light.scale && light.scale.x !== undefined
                ? light.scale.x : light.scale;
            const resolution = bitmap && bitmap.resolution ? bitmap.resolution : 1;
            const factor = (Number(scale) || 0) / resolution;
            const length = bitmap && bitmap.height ? (bitmap.height * factor) / tile : 0;
            const across = bitmap && bitmap.width ? (bitmap.width * factor) / tile : 0;
            radius = length > 0 ? length : Reactor3D.DEFAULT_CONE_LENGTH;
            angle = across > 0 && length > 0
                ? (Math.atan2(across / 2, length) * 360) / Math.PI
                : Reactor3D.DEFAULT_CONE_ANGLE;
        } else {
            // A round light's scale *is* its radius, in pixels.
            const scale = light.scale && light.scale.x !== undefined ? light.scale.x : light.scale;
            radius = (Number(scale) || 0) / tile;
        }
        if (!(radius > 0)) continue;

        lights.push({
            type: spot ? Reactor3D.LIGHT_SPOT : Reactor3D.LIGHT_POINT,
            x: at.x, y: at.y,
            radius,
            angle,
            colour: light.tint === undefined ? 0xffffff : light.tint,
            intensity: light.alpha === undefined ? 1 : light.alpha,
            // Nova's rotation is clockwise from south, which is the direction
            // a character faces; the scene's yaw is measured the same way.
            yaw: light.rotation === undefined ? 0 : (-light.rotation * 180) / Math.PI
        });
    }
    return lights;
};

/**
 * PSYCHRONIC_RaveLighting.
 *
 * A light belongs to a *character*, as a parsed config on `_lights`, and that
 * is the only place it certainly exists. The plugin also builds additive glow
 * sprites from those configs into the spriteset's `_lightContainer`, and
 * reading those instead is a mistake: they are pooled, created lazily, left
 * invisible when unused, and skipped entirely on a map whose overlay pass
 * returns early — so a fully lit map can present an empty container and Reactor
 * would find no lights at all while the plugin drew a dozen.
 *
 * The character also answers the question a sprite cannot. A sprite's x/y are
 * screen pixels, which mean nothing once the ground is projected; the character
 * knows which cell it is standing in.
 */
Reactor3D.LightShims.rave = function() {
    if (typeof $gameMap === "undefined" || !$gameMap) return null;
    const characters = Reactor3D.litCharacters();
    if (!characters.length) return null;

    const tile = $gameMap.tileWidth ? $gameMap.tileWidth() : 48;
    const on = typeof $gameSystem !== "undefined" && $gameSystem
        && typeof $gameSystem.isLightOn === "function"
        ? (id) => $gameSystem.isLightOn(id)
        : () => true;

    const lights = [];
    for (const character of characters) {
        for (const cfg of character._lights) {
            if (!cfg || !on(cfg._lightId)) continue;
            const cone = cfg._lightType === "flashlight" || cfg._lightType === "beam";
            // Each shape keeps its reach in its own field, and pulsate's radius
            // is the one it is currently at rather than the one it reaches.
            let pixels;
            if (cfg._lightType === "beam") {
                pixels = Number(cfg._beamLength) || Number(cfg._coneLengthPx) || 0;
            } else if (cone) {
                pixels = Number(cfg._coneLengthPx) || 0;
            } else if (cfg._lightType === "pulsate") {
                pixels = Math.max(Number(cfg._lightRadius) || 0,
                    Number(cfg._pulsateMaxRadius) || 0);
            } else {
                pixels = Number(cfg._lightRadius) || 0;
            }
            const radius = pixels / tile;
            if (!(radius > 0)) continue;

            const offset = Reactor3D.raveOffset(cfg);
            const width = Number(cfg._coneWidthPx) || Number(cfg._beamWidth) || 0;
            lights.push({
                type: cone ? Reactor3D.LIGHT_SPOT : Reactor3D.LIGHT_POINT,
                x: character._realX + offset.x / tile,
                y: character._realY + offset.y / tile,
                radius,
                colour: Reactor3D.parseColour(cfg._lightColor),
                intensity: 1,
                // A cone's spread is authored as a width at its far end, which
                // is the angle it subtends from where it stands.
                angle: cone && width
                    ? (Math.atan2((width / tile) / 2, radius) * 360) / Math.PI
                    : undefined,
                yaw: Reactor3D.raveYaw(cfg, character)
            });
        }
    }
    return lights;
};

/** Every character on the map that carries a RaveLighting config. */
Reactor3D.litCharacters = function() {
    const found = [];
    const consider = (character) => {
        if (character && character._lights && character._lights.length) {
            found.push(character);
        }
    };
    if (typeof $gamePlayer !== "undefined" && $gamePlayer) {
        consider($gamePlayer);
        const followers = $gamePlayer.followers && $gamePlayer.followers();
        if (followers && followers._data) followers._data.forEach(consider);
    }
    if ($gameMap.events) $gameMap.events().forEach(consider);
    if ($gameMap.vehicles) $gameMap.vehicles().forEach(consider);
    return found;
};

/** Where a light sits relative to its character, in pixels. Per shape. */
Reactor3D.raveOffset = function(cfg) {
    const at = (x, y) => ({ x: Number(x) || 0, y: Number(y) || 0 });
    switch (cfg._lightType) {
        case "fire": return at(cfg._fireOffsetX, cfg._fireOffsetY);
        case "beam": return at(cfg._beamOffsetX, cfg._beamOffsetY);
        case "pulsate": return at(cfg._pulsateOffsetX, cfg._pulsateOffsetY);
        case "light": return at(cfg._lightOffsetX, cfg._lightOffsetY);
        case "flicker": return at(cfg._flickerOffsetX, cfg._flickerOffsetY);
        // A flashlight is lifted half a tile up the sprite in 2D, which is a
        // fact about where the art's hand is and not about the ground.
        case "flashlight": return at(cfg._offsetX, cfg._offsetY);
        default: return at(cfg._offsetX, cfg._offsetY);
    }
};

/** Which way a cone points, in degrees, with south at zero. */
Reactor3D.raveYaw = function(cfg, character) {
    // A flashlight turns smoothly and can track a target, so the plugin's own
    // running angle is the truthful answer where it has one. It is measured in
    // radians clockwise from south, which is this function's own convention.
    // Both are measured clockwise from south (PIXI screen rotation), and the
    // scene's aim is anticlockwise from south (east positive: sin/cos of the
    // yaw). Negated, exactly as the nova shim negates its rotation — passed
    // through raw, west and east swap and a flashlight lights what is beside
    // it instead of what it points at.
    if (cfg._lightType === "flashlight" && cfg._smoothFlashlightAngle != null) {
        return (-Number(cfg._smoothFlashlightAngle) * 180) / Math.PI;
    }
    return -Reactor3D.facingYaw(character.direction ? character.direction() : 2);
};

/** `#rrggbb` or a number, to a number. White for anything unreadable. */
Reactor3D.parseColour = function(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return 0xffffff;
    const hex = value.replace("#", "").trim();
    const parsed = parseInt(hex, 16);
    return Number.isFinite(parsed) && hex.length >= 3 ? parsed : 0xffffff;
};

/**
 * Record the heading a character's model is drawn at this frame, in scene
 * radians. Facing itself is discrete, but the mesh eases between compass
 * points over about a quarter second, and anything riding the character -
 * a carried spotlight above all - should swing with the mesh rather than
 * jump ahead of it.
 */
Reactor3D.noteModelFacing = function(character, radians) {
    if (!character || !Number.isFinite(radians)) return;
    character._reactorModelYaw = radians;
    character._reactorModelYawAt = typeof Graphics !== "undefined" && Graphics.frameCount
        ? Graphics.frameCount : 0;
};

/**
 * Which way a carrier is facing, in degrees, for a light that rides it.
 * The drawn model's heading when there is one and it is being kept up to
 * date; the discrete facing otherwise, which is all a character drawn as a
 * sprite has. A stale reading is refused so a model that stopped updating
 * cannot pin a light to a heading its owner left long ago.
 */
Reactor3D.CARRIER_FACING_STALE_FRAMES = 30;

Reactor3D.carrierFacingYaw = function(carrier) {
    const stamp = carrier._reactorModelYawAt;
    if (stamp != null && carrier._reactorModelYaw != null) {
        const now = typeof Graphics !== "undefined" && Graphics.frameCount ? Graphics.frameCount : 0;
        if (now - stamp <= this.CARRIER_FACING_STALE_FRAMES) {
            // Scene yaw is anticlockwise from south; this convention is
            // clockwise. Same negation the scene's own lights use.
            return (-carrier._reactorModelYaw * 180) / Math.PI;
        }
    }
    return this.facingYaw(carrier.direction ? carrier.direction() : 2);
};

/** RPG Maker's direction numbers as a yaw in degrees: 2 is south, 8 north. */
Reactor3D.facingYaw = function(direction) {
    switch (direction) {
        case 4: return 90;      // west
        case 6: return -90;     // east
        case 8: return 180;     // north
        default: return 0;      // south, and anything unrecognised
    }
};

/**
 * Hide a lighting plugin's own 2D overlay.
 *
 * Its lightmap is a picture of light drawn over the map. With real lights in
 * the scene the two would both apply — a dark wash from the plugin and a lit
 * world underneath it — so the plugin's is put away while 3D lighting is on.
 * Hidden, never modified: turning 3D lighting off brings it straight back.
 */
Reactor3D.LightShims.nova.suppress = function(hide) {
    const nova = typeof Anisoft !== "undefined" && Anisoft.Nova;
    const container = nova && nova.lightMapContainer;
    // `renderable`, for the same reason as the rave shim below: suppression is
    // re-applied every frame, and writing `visible` every frame would overrule
    // the plugin's own reasons for hiding its lightmap rather than merely
    // adding ours.
    if (container) container.renderable = !hide;
};

/*
 * RaveLighting draws in two parts and only one of them is the lights.
 *
 * `_lightContainer` holds additive glow sprites. `_toneSprite` is the darkness:
 * a full-screen bitmap filled with the screen tone, with light-shaped holes
 * punched through it. On a night or interior map the tone is [-255,-255,-255],
 * so that sprite is opaque black over the entire screen — including over a 3D
 * ground that has already been lit for real. Hiding only the container left the
 * black wash in place, which is a 3D map that renders perfectly and cannot be
 * seen: black, with the seams of the geometry seeping through the punched holes
 * and the lights apparently floating on top of nothing.
 *
 * `renderable` rather than `visible`, and *only* `renderable`. The plugin
 * rewrites `_lightContainer.visible` from the options setting on every single
 * frame of `Spriteset_Map.update`, so a one-shot `visible = false` is undone
 * before it is ever drawn — and writing `visible` back ourselves would be worse
 * than useless, because it would overrule the player turning lighting effects
 * off. `visible` is the plugin's to own and `renderable` is nobody's; taking
 * only the second suppresses the overlay without having an opinion about the
 * first, and restoring it gives back exactly what was there.
 */
Reactor3D.LightShims.rave.suppress = function(hide) {
    const scene = typeof SceneManager !== "undefined" && SceneManager._scene;
    const spriteset = scene && scene._spriteset;
    if (!spriteset) return;
    for (const part of [spriteset._lightContainer, spriteset._toneSprite]) {
        if (part) part.renderable = !hide;
    }
};

/** Put every plugin's 2D lightmap away, or bring them all back. */
Reactor3D.suppressFlatLighting = function(hide) {
    for (const name of Object.keys(this.LightShims)) {
        const shim = this.LightShims[name];
        if (typeof shim.suppress !== "function") continue;
        try {
            shim.suppress(hide);
        } catch (error) {
            /* A plugin that has moved on is not worth a broken frame. */
        }
    }
};

/**
 * Whether this map wants its lights in three dimensions.
 *
 * Off unless asked for. A project already lit to its author's satisfaction in
 * 2D should not have that quietly replaced by something that looks different,
 * so it is opted into per map with `<3d lights>` in the note, beside the `<3d>`
 * that made it a 3D map at all.
 */
Reactor3D.wantsLights3D = function(mapData) {
    if (!this.isMap3D(mapData)) return false;
    const sidecar = mapData && mapData.reactor3d;
    if (sidecar && sidecar.lighting && sidecar.lighting.enabled !== undefined) {
        return !!sidecar.lighting.enabled;
    }
    // Native lights placed on the map are themselves the opt-in: an author
    // who put a lamp somewhere wants to see it lit.
    if (this.readMapLights(mapData).length) return true;
    if (mapData && mapData.meta && mapData.meta["3d lights"]) return true;
    // So is a placed model whose light effect is burning right now.
    return this.hasLiveEffectLights();
};

/** How dark an unlit corner of a lit map is. */
Reactor3D.ambientFor = function(mapData) {
    const sidecar = mapData && mapData.reactor3d;
    const lighting = (sidecar && sidecar.lighting) || {};
    const authored = {
        intensity: lighting.ambient === undefined ? 0.25 : lighting.ambient,
        // The sidecar stores "#rrggbb"; the compositors bit-shift a number.
        // Passed through raw, the string shifted as NaN and the ambient
        // multiplied the whole world by black.
        colour: this.parseColour(
            lighting.ambientColour === undefined ? 0xffffff : lighting.ambientColour)
    };
    // An AmbientLight command eases the map away from what it authored.
    const override = this.currentLightOverrides() && $gameMap._reactorAmbientOverride;
    if (!override || override.mapId !== this.currentLightMapId()) return authored;
    const frame = typeof Graphics !== "undefined" && Graphics.frameCount ? Graphics.frameCount : 0;
    const t = this.overrideProgress(override, frame);
    const from = override.from || {};
    const to = override.to || {};
    const fromI = from.intensity === undefined ? authored.intensity : from.intensity;
    const toI = to.intensity === undefined ? fromI : to.intensity;
    const fromC = from.colour === undefined ? authored.colour : from.colour;
    const toC = to.colour === undefined ? fromC : to.colour;
    return {
        intensity: fromI + (toI - fromI) * t,
        colour: this.mixColour(fromC, toC, t)
    };
};

/** Display-space ambient tint for the flat multiply overlay. */
Reactor3D.flatAmbientTint = function(ambient) {
    const level = Math.max(0, Number(ambient.intensity) || 0);
    const channel = shift => {
        const linear = Math.min(1, ((ambient.colour >> shift) & 255) / 255 * level);
        const display = linear <= 0.0031308 ? linear * 12.92 : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
        return Math.round(display * 255);
    };
    return (channel(16) << 16) | (channel(8) << 8) | channel(0);
};

/**
 * Collect this frame's lights from whichever lighting plugin is present.
 *
 * Each shim is tried and each may fail without taking the frame with it: a
 * plugin can be updated underneath this at any time, and a 3D map going black
 * because a shim threw would be a poor trade for lighting.
 */
Reactor3D.collectLights = function() {
    const found = [];
    // The map's own lights first: native, no plugin involved.
    try {
        const native = this.nativeLights();
        if (native.length) found.push(...native);
    } catch (error) {
        if (!this._nativeWarned) {
            this._nativeWarned = true;
            console.warn("Reactor3D: the map's native lights failed to resolve.", error);
        }
    }
    // Then the lights placed models carry as effects, at their anchors.
    try {
        const carried = this.modelEffectLights();
        if (carried.length) found.push(...carried);
    } catch (error) {
        if (!this._effectLightWarned) {
            this._effectLightWarned = true;
            console.warn("Reactor3D: a model's light effects failed to resolve.", error);
        }
    }
    for (const name of Object.keys(this.LightShims)) {
        try {
            const lights = this.LightShims[name]();
            if (lights && lights.length) found.push(...lights);
        } catch (error) {
            if (!this._shimWarned) this._shimWarned = {};
            if (!this._shimWarned[name]) {
                this._shimWarned[name] = true;
                console.warn(`Reactor3D: the ${name} lighting shim failed; `
                    + "its lights will not be in 3D.", error);
            }
        }
    }
    return found;
};

//-----------------------------------------------------------------------------
// Native lights
//
// The lights a map carries itself: placed visually in the editor, stored in
// the map's sidecar as `reactor3d.lights`, and fed to the same compositor the
// plugin shims feed — but first-class. No plugin, no note tags, one schema
// driving the 2D and 3D renderers both.
//
// An authored light:
//   { id, type: "point"|"spot", x, y,      // fractional tiles (offsets when attached)
//     height,                              // tiles off the ground
//     yaw,                                 // degrees clockwise from south (facingYaw's convention)
//     radius,                              // reach in tiles, for both shapes
//     angle,                               // spot spread in degrees
//     color, intensity, occlude, on, tag,
//     attach: null | { event: id } | { player: true },
//     followFacing,                        // attached cones aim where the carrier looks
//                                          // (yaw is then an offset); false keeps a bearing
//     body,                                // draw the source as a glowing shape in the
//                                          // world; defaults off for an attached light
//     flicker: 0..1,                       // candle jitter on intensity
//     pulse: { min, max, period } }        // radius breathing, period in frames

Reactor3D.readMapLights = function(mapData) {
    const sidecar = mapData && mapData.reactor3d;
    const raw = sidecar && Array.isArray(sidecar.lights) ? sidecar.lights : null;
    if (!raw || !raw.length) return [];
    if (this._nativeNorm && this._nativeNorm.source === raw) return this._nativeNorm.list;
    const number = (value, fallback, min, max) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return fallback;
        return Math.min(max, Math.max(min, n));
    };
    const list = [];
    for (let i = 0; i < raw.length; i++) {
        const entry = raw[i];
        if (!entry || typeof entry !== "object") continue;
        list.push({
            id: entry.id ? String(entry.id) : "light" + (i + 1),
            type: entry.type === "spot" ? this.LIGHT_SPOT
                : entry.type === "beam" ? this.LIGHT_BEAM
                    : entry.type === "sun" ? this.LIGHT_SUN : this.LIGHT_POINT,
            x: number(entry.x, 0, -10000, 10000),
            y: number(entry.y, 0, -10000, 10000),
            height: number(entry.height, 0, 0, 512),
            yaw: number(entry.yaw, 0, -100000, 100000),
            // Degrees above level: a spot on a ceiling aims down at -90.
            pitch: number(entry.pitch, 0, -90, 90),
            radius: number(entry.radius,
                entry.type === "spot" ? this.DEFAULT_CONE_LENGTH
                    : entry.type === "beam" ? this.DEFAULT_BEAM_LENGTH : 3, 0.1, entry.type === "sun" ? 2000 : 200),
            angle: number(entry.angle, this.DEFAULT_CONE_ANGLE, 1, 179),
            // A beam's thickness in tiles; a cone and a sphere carry it unused.
            width: number(entry.width, this.DEFAULT_BEAM_WIDTH, 0.005, 5),
            color: this.parseColour(entry.color !== undefined ? entry.color : entry.colour),
            intensity: number(entry.intensity, 1, 0, 4),
            occlude: entry.occlude !== false,
            shadow: entry.shadow !== false,
            // A sun follows the map's time of day (its ambient) unless fixed.
            daylight: entry.daylight === "fixed" ? "fixed" : "auto",
            on: entry.on !== false,
            tag: entry.tag ? String(entry.tag) : "",
            attach: entry.attach && typeof entry.attach === "object"
                ? (entry.attach.player ? { player: true }
                    : Number(entry.attach.event) > 0
                        ? { event: Math.floor(Number(entry.attach.event)) } : null)
                : null,
            // A spot riding a character aims where that character is facing
            // unless it says otherwise, its own yaw read as an offset from
            // that. Off, it keeps a fixed compass bearing while it travels.
            followFacing: entry.followFacing !== false,
            // Whether the source is drawn as a glowing body in the world.
            // A lamp on a wall should be visible; a torch carried by a
            // character should not, because the character is what you are
            // meant to see holding it — drawn anyway it is a bright blob
            // sitting on the floor at their feet, which is what the Demo's
            // torch looked like. So an attached light defaults to no body
            // and anything standing on its own defaults to having one.
            body: entry.body !== undefined
                ? !!entry.body
                : !(entry.attach && typeof entry.attach === "object"
                    && (entry.attach.player || Number(entry.attach.event) > 0)),
            flicker: number(entry.flicker, 0, 0, 1),
            pulse: entry.pulse && typeof entry.pulse === "object" ? {
                min: number(entry.pulse.min, 0.6, 0, 10),
                max: number(entry.pulse.max, 1, 0, 10),
                period: number(entry.pulse.period, 90, 2, 100000)
            } : null
        });
    }
    this._nativeNorm = { source: raw, list };
    return list;
};

/**
 * Whether this map has native lighting at all, in either renderer.
 *
 * The sidecar's word is final when it says anything; otherwise placed lights
 * mean yes, and the map notes can ask for it by hand.
 */
Reactor3D.lightingEnabled = function(mapData) {
    const sidecar = mapData && mapData.reactor3d;
    if (sidecar && sidecar.lighting && sidecar.lighting.enabled !== undefined) {
        return !!sidecar.lighting.enabled;
    }
    if (this.readMapLights(mapData).length) return true;
    const meta = mapData && mapData.meta;
    return !!(meta && (meta["3d lights"] || meta.lighting)) || this.hasLiveEffectLights();
};

/**
 * Runtime on/off overrides, carried on Game_Map so a save keeps them.
 * Stored sparsely — only lights a command has touched appear here. Keys are
 * a light's id, or "#tag" to speak to every light sharing a tag.
 */
Reactor3D.setLightOn = function(key, on) {
    if (typeof $gameMap === "undefined" || !$gameMap || !key) return;
    if (!$gameMap._reactorLightStates) $gameMap._reactorLightStates = {};
    $gameMap._reactorLightStates[String(key)] = !!on;
};

/**
 * Runtime overrides from the TransformLight and AmbientLight commands: a
 * light (by id or "#tag") or the map's ambient eased from where it was to
 * where the command sent it. Carried on Game_Map as plain objects so a save
 * keeps a half-finished ease; stamped with the map they were made on, so a
 * block from another map is ignored rather than applied to a light that
 * happens to share the id.
 */
Reactor3D.LIGHT_OVERRIDE_FIELDS = ["x", "y", "height", "yaw", "pitch", "radius", "angle", "width", "intensity", "color"];

Reactor3D.currentLightMapId = function() {
    return typeof $gameMap !== "undefined" && $gameMap && $gameMap.mapId ? $gameMap.mapId() : 0;
};

Reactor3D.currentLightOverrides = function() {
    if (typeof $gameMap === "undefined" || !$gameMap) return null;
    if (!$gameMap._reactorLightOverrides) $gameMap._reactorLightOverrides = {};
    return $gameMap._reactorLightOverrides;
};

Reactor3D.overrideProgress = function(block, frame) {
    if (!block) return 1;
    const duration = Number(block.duration) || 0;
    if (duration <= 0) return 1;
    return Math.max(0, Math.min(1, (frame - (Number(block.start) || 0)) / duration));
};

Reactor3D.mixColour = function(a, b, t) {
    if (t >= 1) return b;
    if (t <= 0) return a;
    const ch = shift => {
        const from = (a >> shift) & 255;
        const to = (b >> shift) & 255;
        return Math.round(from + (to - from) * t) & 255;
    };
    return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};

/** The override block a light reads: its own id first, then its tag's. */
Reactor3D.lightOverrideFor = function(light) {
    const overrides = this.currentLightOverrides();
    if (!overrides) return null;
    const mapId = this.currentLightMapId();
    const own = overrides[light.id];
    const tagged = light.tag ? overrides["#" + light.tag] : null;
    const ownOk = own && own.mapId === mapId ? own : null;
    const tagOk = tagged && tagged.mapId === mapId ? tagged : null;
    if (!ownOk && !tagOk) return null;
    return { own: ownOk, tag: tagOk };
};

/**
 * A light's overridden fields at this frame, eased; fields no command has
 * touched are absent. Colour eases per channel.
 */
Reactor3D.liveLightValues = function(light, frame) {
    const blocks = this.lightOverrideFor(light);
    if (!blocks) return {};
    const out = {};
    // The tag's values first, then the light's own on top: id wins per field.
    for (const block of [blocks.tag, blocks.own]) {
        if (!block) continue;
        const t = this.overrideProgress(block, frame);
        const from = block.from || {};
        const to = block.to || {};
        for (const key of this.LIGHT_OVERRIDE_FIELDS) {
            if (to[key] === undefined) continue;
            const start = from[key] === undefined ? light[key] : from[key];
            out[key] = key === "color"
                ? this.mixColour(start, to[key], t)
                : start + (to[key] - start) * t;
        }
    }
    return out;
};

/** Every authored light a command target names: one id, or all of a tag. */
Reactor3D.lightsTargeted = function(target) {
    const key = String(target || "").trim();
    if (!key) return [];
    const map = typeof $dataMap !== "undefined" ? $dataMap : null;
    const authored = this.readMapLights(map);
    if (key.charAt(0) === "#") {
        const tag = key.slice(1);
        return authored.filter(light => light.tag === tag);
    }
    return authored.filter(light => light.id === key);
};

/** Turn a light, or every light of a tag, on, off or over. */
Reactor3D.switchLight = function(target, state) {
    const key = String(target || "").trim();
    if (!key) return;
    const mode = String(state || "on").toLowerCase();
    if (mode === "toggle") {
        const first = this.lightsTargeted(key)[0];
        this.setLightOn(key, first ? !this.lightIsOn(first) : true);
        return;
    }
    this.setLightOn(key, mode !== "off");
};

/**
 * Ease a light, or every light of a tag, to new values over `duration`
 * frames. `values` holds any of LIGHT_OVERRIDE_FIELDS; a field left out is
 * left alone. Colour may be "#rrggbb" or a number. `values === null`
 * clears the target's overrides.
 */
Reactor3D.transformLight = function(target, values, duration) {
    const key = String(target || "").trim();
    const overrides = this.currentLightOverrides();
    if (!key || !overrides) return;
    if (values === null) {
        delete overrides[key];
        return;
    }
    const frame = typeof Graphics !== "undefined" && Graphics.frameCount ? Graphics.frameCount : 0;
    const previous = overrides[key] && overrides[key].mapId === this.currentLightMapId() ? overrides[key] : null;
    const byId = key.charAt(0) !== "#";
    const sample = byId ? this.lightsTargeted(key)[0] || null : null;
    const live = sample ? this.liveLightValues(sample, frame) : null;
    const from = {};
    const to = {};
    for (const field of this.LIGHT_OVERRIDE_FIELDS) {
        if (!values || values[field] === undefined || values[field] === null || values[field] === "") continue;
        const value = field === "color" ? this.parseColour(values[field]) : Number(values[field]);
        if (field !== "color" && !Number.isFinite(value)) continue;
        to[field] = value;
        // Where the ease starts. One light: exactly what it shows now, its
        // tag's override included. A tag: wherever this tag's previous ease
        // had reached, so a re-aimed ease continues rather than snaps; a
        // field no previous ease touched starts from each light's own
        // authored value, which `liveLightValues` reads when `from` is absent.
        if (live && live[field] !== undefined) {
            from[field] = live[field];
        } else if (previous && previous.to && previous.to[field] !== undefined) {
            const t = this.overrideProgress(previous, frame);
            const start = previous.from && previous.from[field] !== undefined ? previous.from[field] : undefined;
            if (start !== undefined) {
                from[field] = field === "color"
                    ? this.mixColour(start, previous.to[field], t)
                    : start + (previous.to[field] - start) * t;
            } else if (t >= 1) {
                from[field] = previous.to[field];
            }
        }
    }
    if (!Object.keys(to).length) return;
    overrides[key] = {
        mapId: this.currentLightMapId(),
        from, to, start: frame,
        duration: Math.max(0, Math.round(Number(duration) || 0))
    };
};

/** Ease the map's ambient light to a new level and colour; `values === null` restores the authored ambient. */
Reactor3D.setMapAmbient = function(values, duration) {
    if (typeof $gameMap === "undefined" || !$gameMap) return;
    if (values === null) {
        delete $gameMap._reactorAmbientOverride;
        return;
    }
    const map = typeof $dataMap !== "undefined" ? $dataMap : null;
    const current = this.ambientFor(map);
    const frame = typeof Graphics !== "undefined" && Graphics.frameCount ? Graphics.frameCount : 0;
    const to = {};
    if (values && values.intensity !== undefined && values.intensity !== null && values.intensity !== "") {
        const n = Number(values.intensity);
        if (Number.isFinite(n)) to.intensity = Math.max(0, Math.min(1, n));
    }
    if (values && values.color !== undefined && values.color !== null && values.color !== "") {
        to.colour = this.parseColour(values.color);
    }
    if (!Object.keys(to).length) return;
    $gameMap._reactorAmbientOverride = {
        mapId: this.currentLightMapId(),
        from: { intensity: current.intensity, colour: current.colour },
        to, start: frame,
        duration: Math.max(0, Math.round(Number(duration) || 0))
    };
};

Reactor3D.lightIsOn = function(light) {
    const states = typeof $gameMap !== "undefined" && $gameMap
        && $gameMap._reactorLightStates;
    if (states) {
        if (states[light.id] !== undefined) return states[light.id];
        if (light.tag && states["#" + light.tag] !== undefined) return states["#" + light.tag];
    }
    return light.on;
};

/**
 * This frame's native lights, resolved into the compositor's shape.
 *
 * Animation is arithmetic on the frame counter — deterministic, allocation-
 * light, identical in both renderers. A light attached to an event or the
 * player rides its carrier, its x/y read as offsets in tiles. Yaw flips sign
 * on the way out because the scene aims anticlockwise from south while the
 * schema (and the screen) run clockwise — the same flip the shims make.
 */
/**
 * A light's pulse and flicker for one frame: arithmetic on the frame
 * counter, deterministic, so a save replays identically and both the map's
 * lights and a model's anchored lights breathe the same way. Two
 * incommensurate sines beat irregularly enough to read as flame without a
 * random source. Returns the radius and intensity to draw.
 */
Reactor3D.animateLight = function(spec, frame, seedIndex, radius, intensity) {
    const scratch = this._animateLightScratch || (this._animateLightScratch = { radius: 0, intensity: 0 });
    if (spec.pulse) {
        const t = (frame % spec.pulse.period) / spec.pulse.period;
        const breathe = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
        radius *= spec.pulse.min + (spec.pulse.max - spec.pulse.min) * breathe;
    }
    // Flicker changes the light, not who owns a cached shadow row. Keep the
    // pre-flicker values for ranking; deliberate fades/pulses still apply.
    scratch.priorityRadius = radius;
    scratch.priorityIntensity = intensity;
    if (spec.flicker) {
        const seed = (seedIndex || 0) * 13.7;
        const jitter = Math.sin(frame * 0.31 + seed) * Math.sin(frame * 0.127 + seed * 1.7);
        intensity *= 1 - spec.flicker * (0.25 + 0.25 * jitter);
        radius *= 1 - spec.flicker * 0.06 * jitter;
    }
    scratch.radius = radius;
    scratch.intensity = intensity;
    return scratch;
};

Reactor3D.nativeLights = function(mapData) {
    const map = mapData || (typeof $dataMap !== "undefined" ? $dataMap : null);
    const authored = this.readMapLights(map);
    if (!authored.length) return [];
    const out = [];
    const frame = typeof Graphics !== "undefined" && Graphics.frameCount
        ? Graphics.frameCount : 0;
    for (let i = 0; i < authored.length; i++) {
        const light = authored[i];
        if (!this.lightIsOn(light)) continue;
        let x = light.x;
        let y = light.y;
        // Extra yaw from the carrier this light rides, if it rides one.
        let facing = 0;
        if (light.attach) {
            let carrier = null;
            if (light.attach.player) {
                carrier = typeof $gamePlayer !== "undefined" ? $gamePlayer : null;
            } else if (typeof $gameMap !== "undefined" && $gameMap && $gameMap.event) {
                carrier = $gameMap.event(light.attach.event);
            }
            if (!carrier) continue;
            x += carrier._realX + 0.5;
            y += carrier._realY + 0.5;
            // A cone carried by a character points where that character is
            // looking. Attachment moved the light and stopped there, so a
            // torch on the player lit one fixed compass bearing however they
            // turned — a wedge on the floor that swung with nothing. The
            // authored yaw stays meaningful as an offset from the carrier's
            // facing (90 for a lamp held out to the left), and a light that
            // genuinely wants a fixed bearing while it travels sets
            // `followFacing: false`. Only cones care: a point light has no
            // direction to get wrong.
            if (this.lightIsAimed(light) && light.followFacing && carrier.direction) {
                facing = this.carrierFacingYaw(carrier);
            }
        }
        // An event command may have moved, turned, resized or recoloured
        // the light since it was authored; the override eases in over its
        // duration and the flicker and pulse ride on top of the result.
        const live = this.liveLightValues(light, frame);
        if (live.x !== undefined) x = live.x + (x - light.x);
        if (live.y !== undefined) y = live.y + (y - light.y);
        const height = live.height !== undefined ? live.height : light.height;
        const yaw = live.yaw !== undefined ? live.yaw : light.yaw;
        const pitch = live.pitch !== undefined ? live.pitch : light.pitch;
        const angle = live.angle !== undefined ? live.angle : light.angle;
        const width = live.width !== undefined ? live.width : light.width;
        const colour = live.color !== undefined ? live.color : light.color;
        let radius = live.radius !== undefined ? live.radius : light.radius;
        let intensity = live.intensity !== undefined ? live.intensity : light.intensity;
        // A pulse breathes the radius on a fixed cycle; the light volume keeps
        // the distance field and applies this frame's radius (baseRadius).
        const baseRadius = light.pulse ? radius : undefined;
        const animated = this.animateLight(light, frame, i, radius, intensity);
        radius = animated.radius;
        intensity = animated.intensity;
        // A sun at the map's time of day (the flicker's base scaled alike, so it reads as no flicker).
        let lit = colour, priorityIntensity = animated.priorityIntensity;
        if (light.type === this.LIGHT_SUN && light.daylight !== "fixed") {
            const day = this.daylight(this.ambientFor(map));
            const sun = this.sunAtDaylight(light, colour, intensity, day, this._sunScratch || (this._sunScratch = {}));
            lit = sun.colour; intensity = sun.intensity;
            if (priorityIntensity !== undefined) priorityIntensity *= day.sun;
        }
        out.push({
            id: light.id, type: light.type, x: x, y: y, height: height,
            radius: radius, colour: lit, intensity: intensity,
            priorityRadius: animated.priorityRadius, priorityIntensity: priorityIntensity,
            angle: angle, width: width, yaw: -(yaw + facing), pitch: pitch, occlude: light.occlude,
            shadow: light.shadow, body: light.body, baseRadius: baseRadius
        });
    }
    return out;
};

//-----------------------------------------------------------------------------
// Light volume
//
// Lights that hold still are baked once into a 3D texture over the map and
// read back with one lookup, instead of being worked out again for every
// pixel of every frame; only lights that move stay in the per-pixel loop.
// The volume path lights by world position alone (no normals, no view), so a
// light's contribution to a point is a pure field of the point and can be
// kept. A flickering light keeps its shape and only its brightness changes,
// so it is baked unlit into one of four channels of a second volume and its
// colour times this frame's flicker is applied per pixel. A light is cached
// once its settings and its static shadow row have held for STABLE_FRAMES;
// a moving, pulsing, carried or beam light, or one with a moving-caster
// shadow row (the party's shadows), stays live and sharp. Shadows baked into
// the volume are as soft as its voxels (half a tile): approved as a trade.
//
// The bake runs on the GPU a few layers a frame into a back buffer and
// swaps in when whole; while a cached light changes, the volume is set
// aside (everything live) until the new one is ready.
Reactor3D.LightVolume = {
    enabled: true,
    VOXEL: 0.5,
    BELOW: 4,
    HEIGHT: 32,
    MAX_SIDE: 128,
    STABLE_FRAMES: 30,
    LAYERS_PER_FRAME: 8,
    FLICKER_SLOTS: 4,
    // Pulsing point lights: the volume keeps each one's distance, and the
    // pixel applies this frame's radius with the loop's own falloff.
    PULSE_SLOTS: 4,
    // How far a lookup steps off the surface toward the viewer, so it reads
    // the air in front of a wall or prop and not its shadowed inside.
    OFFSET: 0.35,
    _records: new Map(),
    _front: null,
    _back: null,
    _frame: 0,
    _scene: null,
    _generation: -1,

    uniforms() {
        const u = Reactor3D.lightUniforms();
        if (!u.rrVolumeOn) {
            u.rrVolumeOn = { value: 0 };
            u.rrVolumeStatic = { value: null };
            u.rrVolumeFlicker = { value: null };
            u.rrVolumeOrigin = { value: new Float32Array(3) };
            u.rrVolumeInvSize = { value: new Float32Array([1, 1, 1]) };
            u.rrVolumeOffset = { value: this.OFFSET };
            u.rrVolumeFlickerColor = { value: new Float32Array(3 * this.FLICKER_SLOTS) };
            u.rrVolumePulse = { value: null };
            u.rrVolumePulseColor = { value: new Float32Array(3 * this.PULSE_SLOTS) };
            u.rrVolumePulseRadius = { value: new Float32Array(this.PULSE_SLOTS) };
            u.rrLightCached = { value: 0 };
            u.rrDynOn = { value: 0 };
            u.rrDynAtlas = { value: null };
            u.rrDynOrigin = { value: new Float32Array(3) };
            u.rrDynCells = { value: new Float32Array([1, 1, 1]) };
            u.rrDynTiles = { value: new Float32Array([1, 1]) };
            u.rrDynVoxel = { value: this.VOXEL };
            u.rrLightDynamic = { value: 0 };
            u.rrLightAll = { value: 0 };
            u.rrDynAtlasSize = { value: new Float32Array([1, 1]) };
            // Glowing water where the volume does not hold its light (WaterLight.loadFar): the water's picture,
            // the map's size and the reach over and under, the box the volume holds it whole in, and the tiles
            // it fades over past that box (0: no water glows).
            u.rrWaterFar = { value: null };
            u.rrWaterFarMap = { value: new Float32Array(4) };
            u.rrWaterFarBox = { value: new Float32Array(4) };
            u.rrWaterFarEdge = { value: 0 };
            // How much of that water's light a surface takes as a sheen in the water's own colour (WaterLight.SHEEN).
            u.rrWaterSheen = { value: 0 };
        }
        return u;
    },

    /** The GLSL the light loop gains: read the volume, drop the cached lights from the loop. */
    glsl(source) {
        const slots = this.FLICKER_SLOTS;
        const flick = [];
        for (let k = 0; k < slots; k++) flick.push("rrVolumeFlickerColor[" + k + "] * rrVF[" + k + "]");
        const pulse = [];
        for (let k = 0; k < this.PULSE_SLOTS; k++) pulse.push("\t\t\t{ float rrPF = max(0.0, 1.0 - rrVP[" + k + "] / max(rrVolumePulseRadius[" + k + "], 0.001)); sum += rrVolumePulseColor[" + k + "] * rrPF * rrPF; }\n");
        return source
            .replace("uniform uint rrLightGridSpill;", "uniform uint rrLightGridSpill;\n"
                + "uniform int rrVolumeOn;\nuniform highp sampler3D rrVolumeStatic;\nuniform highp sampler3D rrVolumeFlicker;\n"
                + "uniform vec3 rrVolumeOrigin;\nuniform vec3 rrVolumeInvSize;\nuniform float rrVolumeOffset;\n"
                + "uniform vec3 rrVolumeFlickerColor[" + slots + "];\nuniform uint rrLightCached;\nuniform uint rrLightAll;\n"
                + "uniform highp sampler3D rrVolumePulse;\nuniform vec3 rrVolumePulseColor[" + this.PULSE_SLOTS + "];\nuniform float rrVolumePulseRadius[" + this.PULSE_SLOTS + "];\n"
                + "uniform int rrDynOn;\nuniform highp sampler2D rrDynAtlas;\nuniform vec3 rrDynOrigin;\nuniform vec3 rrDynCells;\nuniform vec2 rrDynTiles;\nuniform float rrDynVoxel;\nuniform uint rrLightDynamic;\n"
                + "uniform vec2 rrDynAtlasSize;\n"
                + "uniform highp sampler2D rrWaterFar;\nuniform vec4 rrWaterFarMap;\nuniform vec4 rrWaterFarBox;\nuniform float rrWaterFarEdge;\nuniform float rrWaterSheen;\n"
                // What the light came to at the last point asked, and the glowing water's part of it, for the
                // sheen a surface takes of that water's light (WaterLight.SHEEN_GLSL).
                + "vec3 rrLitBy = vec3(1.0);\nvec3 rrWaterShone = vec3(0.0);")
            .replace("\treturn sum;\n}", "\trrLitBy = sum;\n\treturn sum;\n}")
            .replace("vec3 sum = rrAmbient;\n", "vec3 sum = rrAmbient;\n"
                // Derivatives before any branch; the face's normal, turned to the eye.
                + "\tvec3 rrVN = cross(dFdx(p), dFdy(p));\n")
            .replace("if (!grid && rrLightGridEnabled != 0) { grid = true; mask = rrLightGridSpill; }\n",
                "if (!grid && rrLightGridEnabled != 0) { grid = true; mask = rrLightGridSpill; }\n"
                + "\tfloat rrVL = length(rrVN);\n"
                + "\tvec3 rrVNn = rrVL > 0.0 ? rrVN / rrVL : vec3(0.0);\n"
                + "\tif (dot(rrVNn, cameraPosition - p) < 0.0) rrVNn = -rrVNn;\n"
                + "\tvec3 rrVP0 = p + rrVNn * rrVolumeOffset;\n"
                + "\tif (rrVolumeOn != 0) {\n"
                + "\t\tvec3 rrQ = (rrVP0 - rrVolumeOrigin) * rrVolumeInvSize;\n"
                + "\t\tif (all(greaterThanEqual(rrQ, vec3(0.0))) && all(lessThanEqual(rrQ, vec3(1.0)))) {\n"
                + "\t\t\tsum += texture(rrVolumeStatic, rrQ).rgb;\n"
                + "\t\t\tvec4 rrVF = texture(rrVolumeFlicker, rrQ);\n"
                + "\t\t\tsum += " + flick.join(" + ") + ";\n"
                + "\t\t\tvec4 rrVP = texture(rrVolumePulse, rrQ);\n"
                + pulse.join("")
                + "\t\t\tif (grid) mask &= ~rrLightCached; else { grid = true; mask = rrLightAll & ~rrLightCached; }\n"
                + "\t\t}\n"
                + "\t}\n"
                // Glowing water's light where the volume does not hold it: past the volume's box on a map
                // larger than it (the far banks of a lake), over or under it, or with the volume set aside.
                // The volume's share (as its bake faded it toward its edge) and this one make one light.
                + "\tif (rrWaterFarEdge > 0.0) {\n"
                + "\t\tfloat rrWB = 0.0;\n"
                + "\t\tif (rrVolumeOn != 0) {\n"
                + "\t\t\tvec3 rrWQ = (rrVP0 - rrVolumeOrigin) * rrVolumeInvSize;\n"
                + "\t\t\tif (all(greaterThanEqual(rrWQ, vec3(0.0))) && all(lessThanEqual(rrWQ, vec3(1.0))))\n"
                + "\t\t\t\trrWB = clamp(1.0 + min(min(rrVP0.x - rrWaterFarBox.x, rrWaterFarBox.z - rrVP0.x), min(rrVP0.z - rrWaterFarBox.y, rrWaterFarBox.w - rrVP0.z)) / rrWaterFarEdge, 0.0, 1.0);\n"
                + "\t\t}\n"
                + "\t\tvec2 rrWU = rrVP0.xz * rrWaterFarMap.xy;\n"
                // The picture is read wherever water glows on the map, the volume's box included: all of the water's
                // light at the point is kept for the sheen, and the share the volume does not hold joins the sum.
                + "\t\tif (all(greaterThanEqual(rrWU, vec2(0.0))) && all(lessThanEqual(rrWU, vec2(1.0)))) {\n"
                + "\t\t\tvec4 rrWL = textureLod(rrWaterFar, rrWU, 0.0);\n"
                + "\t\t\tfloat rrWY = rrVP0.y - rrWL.a;\n"
                + "\t\t\trrWaterShone = rrWL.rgb * pow(max(0.0, 1.0 - (rrWY >= 0.0 ? rrWY / rrWaterFarMap.z : -rrWY / rrWaterFarMap.w)), 1.5);\n"
                + "\t\t\tsum += rrWaterShone * (1.0 - rrWB);\n"
                + "\t\t}\n"
                + "\t}\n"
                // The moving lights, baked this frame into slices laid side by side:
                // two neighbouring slices, each filtered, blended by depth.
                + "\tif (rrDynOn != 0) {\n"
                + "\t\tvec3 rrC = (rrVP0 - rrDynOrigin) / rrDynVoxel;\n"
                + "\t\tif (all(greaterThanEqual(rrC, vec3(0.0))) && all(lessThanEqual(rrC, rrDynCells))) {\n"
                + "\t\t\tfloat rrZ = clamp(rrC.z - 0.5, 0.0, rrDynCells.z - 1.0), rrZ0 = floor(rrZ), rrZ1 = min(rrZ0 + 1.0, rrDynCells.z - 1.0);\n"
                + "\t\t\tvec2 rrXY = clamp(rrC.xy, vec2(0.5), rrDynCells.xy - 0.5), rrSize = rrDynAtlasSize;\n"
                + "\t\t\tvec2 rrT0 = vec2(mod(rrZ0, rrDynTiles.x), floor(rrZ0 / rrDynTiles.x)) * rrDynCells.xy;\n"
                + "\t\t\tvec2 rrT1 = vec2(mod(rrZ1, rrDynTiles.x), floor(rrZ1 / rrDynTiles.x)) * rrDynCells.xy;\n"
                + "\t\t\tsum += mix(texture(rrDynAtlas, (rrT0 + rrXY) / rrSize).rgb, texture(rrDynAtlas, (rrT1 + rrXY) / rrSize).rgb, rrZ - rrZ0);\n"
                + "\t\t\tif (grid) mask &= ~rrLightDynamic; else { grid = true; mask = rrLightAll & ~rrLightDynamic; }\n"
                + "\t\t}\n"
                + "\t}\n");
    },

    /**
     * What makes a light the same light from one frame to the next, before
     * view culling: its settings at base brightness and radius (a flicker's
     * jitter is not a change), and whether it may cast. Null: never cached.
     */
    keyOf(light) {
        // A carried light (a model's effect light) counts too: where it
        // stands and aims is in the key, so one on a model that holds still
        // is cached and one on a model that moves stays live.
        if (!light || light.id === undefined || light.id === null) return null;
        if (light.type === Reactor3D.LIGHT_BEAM) return null;
        const radius = light.baseRadius !== undefined ? light.baseRadius : light.priorityRadius !== undefined ? light.priorityRadius : light.radius;
        const intensity = light.priorityIntensity !== undefined ? light.priorityIntensity : light.intensity;
        return [light.type, light.x, light.y, light.height, light.groundY, light.yaw, light.pitch, light.angle,
            light.width, light.colour, radius, intensity, light.shadow, light.occlude].join("|");
    },

    /**
     * Called by syncVolumeLights: every declared light (`list`) and the packed
     * index of those drawn this frame (`seen`: light, index pairs).
     */
    observe(list, seen, focus) {
        if (!this.enabled) return;
        this._focus = focus || null;
        const frame = ++this._frame;
        const u = Reactor3D.lightUniforms();
        const pos = u.rrLightPos.value, col = u.rrLightColor.value, aim = u.rrLightAim.value;
        for (const light of list) {
            const key = this.keyOf(light);
            if (key === null) continue;
            const id = String(light.id);
            let record = this._records.get(id);
            if (!record) {
                this._records.set(id, record = { id, key, since: frame, packed: null, packedKey: null, index: -1, present: -1, flicker: 1, flickers: false });
                this._settleUntil = frame + this.STABLE_FRAMES + 2;
            }
            if (record.key !== key) {
                // A light that had held still and changed: the volume will bake again once it holds.
                if (frame - record.since >= this.STABLE_FRAMES) this._settleUntil = frame + this.STABLE_FRAMES + 2;
                record.key = key; record.since = frame;
            }
            record.declared = frame;
            const base = light.priorityIntensity !== undefined ? light.priorityIntensity : light.intensity;
            const now = light.intensity === undefined ? 1 : light.intensity;
            record.flicker = base > 0 ? now / base : 1;
            if (record.flicker !== 1) record.flickers = true;
            record.pulses = light.baseRadius !== undefined;
            record.radius = light.radius;
        }
        for (let s = 0; s < seen.length; s += 2) {
            const light = seen[s], index = seen[s + 1];
            const record = light && light.id !== undefined && light.id !== null ? this._records.get(String(light.id)) : null;
            if (!record) continue;
            record.index = index;
            record.present = frame;
            if (record.packedKey !== record.key) {
                // Kept at base brightness: the flicker is this frame's multiplier.
                const at = index * 4, k = record.flicker > 0 ? 1 / record.flicker : 1;
                record.packed = {
                    pos: [pos[at], pos[at + 1], pos[at + 2], pos[at + 3]],
                    col: [col[at] * k, col[at + 1] * k, col[at + 2] * k, col[at + 3]],
                    aim: [aim[at], aim[at + 1], aim[at + 2], aim[at + 3]]
                };
                record.packedKey = record.key;
            }
        }
        // Lights gone from the map are forgotten.
        for (const [id, record] of this._records) if (record.declared !== frame) this._records.delete(id);
    },

    /**
     * Whether the volume is waiting for new or changed lights to hold still,
     * or baking: a view that draws only when something changes (the
     * editor's) keeps drawing until it is done. A light that never holds
     * still does not keep it drawing.
     */
    _settleUntil: 0,
    baking() {
        return this.enabled && (!!this._back || this._frame < this._settleUntil);
    },

    /** A light's shadow state: its static row and when it was last drawn; null for a moving-caster row. */
    shadowKey(id) {
        const S = Reactor3D.Shadows, tiles = S._tiles || [], dyn = S._dynTiles || [];
        for (const row of dyn) if (row && row.id === id && row.valid) return null;
        for (let k = 0; k < tiles.length; k++) {
            const tile = tiles[k];
            if (tile && tile.id === id && tile.valid) return "row" + k + ":" + tile.stamp + ":" + tile.key;
        }
        return "none";
    },

    /** The cached set this frame asks for, with its signature. */
    desired() {
        const frame = this._frame, statics = [], flickers = [], pulses = [];
        for (const record of this._records.values()) {
            // The shadow row is watched from the start, alongside the light.
            const shadow = this.shadowKey(record.id);
            if (record.shadow !== shadow) { record.shadow = shadow; record.shadowSince = frame; }
            if (shadow === null || !record.packed || record.packedKey !== record.key) continue;
            if (frame - record.since < this.STABLE_FRAMES || frame - record.shadowSince < this.STABLE_FRAMES) continue;
            // A snapshot: what is baked is checked against what the light is later.
            const snap = { id: record.id, key: record.key, shadow, packed: record.packed };
            if (record.pulses) {
                // A point with no shadow row: its distance is all the volume keeps.
                if (record.packed.col[3] === 0 && shadow === "none" && pulses.length < this.PULSE_SLOTS) pulses.push(snap);
            } else if (record.flickers) { if (flickers.length < this.FLICKER_SLOTS) flickers.push(snap); }
            else statics.push(snap);
        }
        statics.sort((a, b) => (a.id < b.id ? -1 : 1));
        flickers.sort((a, b) => (a.id < b.id ? -1 : 1));
        pulses.sort((a, b) => (a.id < b.id ? -1 : 1));
        const list = records => records.map(r => r.id + "=" + r.key + "@" + r.shadow).join(";");
        const signature = list(statics) + "#" + list(flickers) + "#" + list(pulses);
        return { statics, flickers, pulses, signature };
    },

    region(mapData, focus) {
        const v = this.VOXEL, side = this.MAX_SIDE * v;
        const w = mapData && mapData.width ? mapData.width : 64, h = mapData && mapData.height ? mapData.height : 64;
        const ground = focus && Number.isFinite(focus.groundY) ? focus.groundY : 0;
        const y0 = Math.floor((ground - this.BELOW) / 4) * 4;
        let x0 = 0, z0 = 0, sx = w, sz = h;
        if (w > side) { x0 = Math.max(0, Math.min(w - side, Math.floor(((focus && focus.x) || 0) - side / 2))); sx = side; }
        if (h > side) { z0 = Math.max(0, Math.min(h - side, Math.floor(((focus && focus.y) || 0) - side / 2))); sz = side; }
        return { origin: [x0, y0, z0], dims: [Math.ceil(sx / v), Math.ceil(this.HEIGHT / v), Math.ceil(sz / v)] };
    },

    supported(renderer) {
        if (this._supported !== undefined) return this._supported;
        const gl = renderer && renderer.getContext && renderer.getContext();
        this._supported = !!(gl && typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext
            && gl.getExtension("EXT_color_buffer_float") && THREE.WebGL3DRenderTarget);
        return this._supported;
    },

    /** A volume being filled or shown: two 3D targets, its region and the lights it holds. */
    makeVolume(region, want) {
        const [nx, ny, nz] = region.dims;
        const make = () => {
            const target = new THREE.WebGL3DRenderTarget(nx, ny, nz, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false });
            target.texture.minFilter = target.texture.magFilter = THREE.LinearFilter;
            target.texture.generateMipmaps = false;
            target.texture.wrapS = target.texture.wrapT = target.texture.wrapR = THREE.ClampToEdgeWrapping;
            return target;
        };
        return { static: make(), flicker: make(), pulse: make(), region, want, layer: 0, ready: false };
    },

    dispose(volume) {
        if (!volume) return;
        volume.static.dispose();
        volume.flicker.dispose();
        if (volume.pulse) volume.pulse.dispose();
    },

    reset() {
        this.dispose(this._front); this.dispose(this._back);
        if (this._dynAtlas) { this._dynAtlas.dispose(); this._dynAtlas = null; }
        this._dynSig = null; this._dynAtlasBaked = null;
        this._front = this._back = null;
        this._records.clear();
        const u = this.uniforms();
        u.rrVolumeOn.value = 0;
        u.rrVolumeStatic.value = u.rrVolumeFlicker.value = u.rrVolumePulse.value = null;
        u.rrDynOn.value = 0; u.rrDynAtlas.value = null;
        u.rrWaterFarEdge.value = 0;
    },

    /** The bake: one full-screen draw per layer, the cached lights at each voxel's centre. */
    bakeMaterial(shadows) {
        const cache = this._bakes || (this._bakes = {});
        if (cache[shadows ? 1 : 0]) return cache[shadows ? 1 : 0];
        const n = Reactor3D.SHADER_LIGHTS, slots = this.FLICKER_SLOTS;
        const light = Reactor3D.lightGlsl(!!shadows, 1);
        const start = light.indexOf("vec4 lp = rrLightPos[i];"), end = light.indexOf("sum += lc.rgb * fall;");
        if (start < 0 || end < 0) return null;
        const body = light.slice(start, end)
            .replace(/rrLightPos\[i\]/g, "rrBakePos[i]").replace(/rrLightColor\[i\]/g, "rrBakeColor[i]")
            .replace(/rrLightAim\[i\]/g, "rrBakeAim[i]").replace(/rrLightShadow\[i\]/g, "rrBakeShadow[i]");
        const shadowPart = shadows ? Reactor3D.shadowGlsl(1).replace("uniform float rrLightShadow[" + n + "];", "") : "";
        const fragment = [
            shadowPart,
            "uniform vec4 rrBakePos[" + n + "];",
            "uniform vec4 rrBakeColor[" + n + "];",
            "uniform vec4 rrBakeAim[" + n + "];",
            "uniform float rrBakeShadow[" + n + "];",
            "uniform int rrBakeCount;",
            "uniform int rrBakeFlick[" + slots + "];",
            "uniform int rrBakePulse[" + this.PULSE_SLOTS + "];",
            "uniform int rrBakeMode;",
            "uniform vec3 rrBakeOrigin;",
            "uniform float rrBakeVoxel;",
            "uniform float rrBakeLayer;",
            "uniform vec3 rrBakeCells;",
            "uniform vec2 rrBakeTiles;",
            Reactor3D.WaterLight.BAKE_GLSL,
            // `continue` inside the light's own code leaves this one-pass loop: no light.
            "float rrBakeScalar(int i, vec3 p) {",
            "\tfloat result = 0.0;",
            "\tfor (int once = 0; once < 1; once++) {",
            "\t\t" + body,
            "\t\tresult = fall;",
            "\t}",
            "\treturn result;",
            "}",
            "void main() {",
            "\tvec3 p = rrBakeOrigin + (vec3(floor(gl_FragCoord.xy), rrBakeLayer) + 0.5) * rrBakeVoxel;",
            // Mode 3: the whole volume in one draw, its slices laid out as tiles.
            "\tif (rrBakeMode == 3) {",
            "\t\tvec2 fc = floor(gl_FragCoord.xy), tile = floor(fc / rrBakeCells.xy), local = fc - tile * rrBakeCells.xy;",
            "\t\tfloat z = tile.y * rrBakeTiles.x + tile.x;",
            "\t\tif (z >= rrBakeCells.z) { gl_FragColor = vec4(0.0); return; }",
            "\t\tp = rrBakeOrigin + (vec3(local, z) + 0.5) * rrBakeVoxel;",
            "\t}",
            "\tif (rrBakeMode == 0 || rrBakeMode == 3) {",
            "\t\tvec3 s = vec3(0.0);",
            "\t\tfor (int i = 0; i < " + n + "; i++) { if (i >= rrBakeCount) break; s += rrBakeColor[i].rgb * rrBakeScalar(i, p); }",
            // The glowing water's light, in the still lights' volume only.
            "\t\tif (rrBakeMode == 0 && rrBakeWaterEdge > 0.0) s += rrBakeWaterLight(p);",
            "\t\tgl_FragColor = vec4(s, 1.0);",
            "\t} else if (rrBakeMode == 2) {",
            "\t\tvec4 d = vec4(0.0);",
            ...Array.from({ length: this.PULSE_SLOTS }, (_, k) => "\t\tif (rrBakePulse[" + k + "] >= 0) d[" + k + "] = length(p - rrBakePos[rrBakePulse[" + k + "]].xyz);"),
            "\t\tgl_FragColor = d;",
            "\t} else {",
            "\t\tvec4 f = vec4(0.0);",
            ...Array.from({ length: slots }, (_, k) => "\t\tif (rrBakeFlick[" + k + "] >= 0) f[" + k + "] = rrBakeScalar(rrBakeFlick[" + k + "], p);"),
            "\t\tgl_FragColor = f;",
            "\t}",
            "}"
        ].join("\n");
        const shared = Reactor3D.lightUniforms();
        const uniforms = {
            rrBakePos: { value: new Float32Array(n * 4) }, rrBakeColor: { value: new Float32Array(n * 4) },
            rrBakeAim: { value: new Float32Array(n * 4) }, rrBakeShadow: { value: new Float32Array(n).fill(-1) },
            rrBakeCount: { value: 0 }, rrBakeFlick: { value: new Int32Array(slots).fill(-1) }, rrBakeMode: { value: 0 },
            rrBakePulse: { value: new Int32Array(this.PULSE_SLOTS).fill(-1) },
            rrBakeOrigin: { value: new Float32Array(3) }, rrBakeVoxel: { value: this.VOXEL }, rrBakeLayer: { value: 0 },
            rrBakeCells: { value: new Float32Array(3) }, rrBakeTiles: { value: new Float32Array(2) }
        };
        Object.assign(uniforms, Reactor3D.WaterLight.bakeUniforms());
        if (shadows) for (const key of ["rrShadowInfo", "rrShadowPos", "rrShadowBias", "rrShadowAtlas", "rrShadowDynAtlas", "rrShadowGrid"]) uniforms[key] = shared[key];
        const material = new THREE.ShaderMaterial({
            uniforms, fragmentShader: fragment,
            vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
            depthTest: false, depthWrite: false, blending: THREE.NoBlending
        });
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        mesh.frustumCulled = false;
        const scene = new THREE.Scene();
        scene.add(mesh);
        cache[shadows ? 1 : 0] = { material, scene, camera: new THREE.Camera(), uniforms };
        return cache[shadows ? 1 : 0];
    },

    /** Load a volume's lights into the bake's own arrays (they need not be in view). */
    loadBake(bake, volume) {
        const u = bake.uniforms, all = volume.want.statics.concat(volume.want.flickers, volume.want.pulses || []);
        const shadowOf = id => {
            const tiles = Reactor3D.Shadows._tiles || [];
            for (let k = 0; k < tiles.length; k++) if (tiles[k] && tiles[k].id === id && tiles[k].valid) return k;
            return -1;
        };
        for (let i = 0; i < all.length; i++) {
            const p = all[i].packed;
            u.rrBakePos.value.set(p.pos, i * 4); u.rrBakeColor.value.set(p.col, i * 4); u.rrBakeAim.value.set(p.aim, i * 4);
            u.rrBakeShadow.value[i] = shadowOf(all[i].id);
        }
        u.rrBakeCount.value = volume.want.statics.length;
        u.rrBakeFlick.value.fill(-1);
        for (let k = 0; k < volume.want.flickers.length; k++) u.rrBakeFlick.value[k] = volume.want.statics.length + k;
        u.rrBakePulse.value.fill(-1);
        for (let k = 0; k < (volume.want.pulses || []).length; k++) u.rrBakePulse.value[k] = volume.want.statics.length + volume.want.flickers.length + k;
        u.rrBakeOrigin.value.set(volume.region.origin);
        // The moving lights' bake shares these uniforms on its own, coarser grid.
        u.rrBakeVoxel.value = this.VOXEL;
        Reactor3D.WaterLight.loadBake(u, volume);
    },

    /** Bake a few more layers of the back volume; true when it is whole. */
    bakeSome(renderer, volume) {
        const S = Reactor3D.Shadows, bake = this.bakeMaterial(!!(S && S.appliesTo && S.appliesTo(renderer) && S.active && S.active()));
        if (!bake) return false;
        // The bake's own program compiles on the driver's threads first:
        // its first draw would otherwise wait for it (a second, measured).
        if (!bake.compiled && renderer.compileAsync && renderer.extensions && renderer.extensions.has("KHR_parallel_shader_compile")) {
            if (!bake.compiling) {
                const previous = renderer.getRenderTarget();
                renderer.setRenderTarget(volume.static, 0);
                try { bake.compiling = renderer.compileAsync(bake.scene, bake.camera).then(() => { bake.compiled = true; }, () => { bake.compiled = true; }); }
                catch (error) { bake.compiled = true; }
                finally { renderer.setRenderTarget(previous); }
            }
            if (!bake.compiled) return false;
        }
        this.loadBake(bake, volume);
        const previous = renderer.getRenderTarget(), nz = volume.region.dims[2];
        const autoClear = renderer.autoClear;
        renderer.autoClear = false;
        try {
            for (let n = 0; n < this.LAYERS_PER_FRAME && volume.layer < nz; n++, volume.layer++) {
                bake.uniforms.rrBakeLayer.value = volume.layer;
                bake.uniforms.rrBakeMode.value = 0;
                renderer.setRenderTarget(volume.static, volume.layer);
                renderer.render(bake.scene, bake.camera);
                bake.uniforms.rrBakeMode.value = 1;
                renderer.setRenderTarget(volume.flicker, volume.layer);
                renderer.render(bake.scene, bake.camera);
                bake.uniforms.rrBakeMode.value = 2;
                renderer.setRenderTarget(volume.pulse, volume.layer);
                renderer.render(bake.scene, bake.camera);
            }
        } finally {
            renderer.autoClear = autoClear;
            renderer.setRenderTarget(previous);
        }
        return volume.layer >= nz;
    },

    /**
     * Once a frame from prepareWorldFrame, after the shadow rows are chosen:
     * keep, bake or set aside the volume, then say to the shader which
     * lights it holds this frame.
     */
    frame(renderer, mapScene, mapData, focus = this._focus) {
        // PIXI drew since three last did and cleared every texture unit
        // behind its back (Viewport._resetPixi). The bakes sample the shadow
        // atlases: three must forget what it thinks is bound first, or a
        // shadow sampler meets PIXI's texture and the driver drops the draw
        // (INVALID_OPERATION), leaving the volume unlit.
        if (this.enabled && renderer && typeof renderer.resetState === "function") renderer.resetState();
        this.frameStatic(renderer, mapScene, mapData, focus);
        Reactor3D.WaterLight.loadFar(this.uniforms(), mapData, this);
        this.frameDynamic(renderer, mapData, focus);
    },

    /**
     * The lights that are not cached (moving, or not yet still long enough),
     * baked every frame into their own volume in one draw: the whole volume's
     * cells are fewer than the screen's pixels and most of them leave each
     * cone at once, so a swinging searchlight's reach costs a fraction of
     * working it out per pixel (the start map: 3.5 ms for nine lights that
     * cost 17 ms per pixel on an integrated GPU). A beam (it stops where it
     * lands) stays in the loop. A light holding a moving-caster shadow row
     * (the party's shadows) has only its reach baked, into a channel of its
     * own, and each pixel multiplies it by the loop's own shadow lookup, so
     * every shadow stays as sharp as the loop drew it.
     *
     * Only what the camera sees is baked: the box of the visible meshes,
     * cut to the frustum's footprint on it, on the volume's own voxel grid
     * (a region that follows the view never shifts a sample). The start
     * map's whole volume was 128 by 64 by 128 voxels, most of it air above
     * the room or out of view. Nothing moved, nothing is baked: at a frame
     * rate above the game's, most frames reuse the last.
     */
    dynamicEnabled: true,
    frameDynamic(renderer, mapData, focus) {
        const u = this.uniforms();
        u.rrDynOn.value = 0;
        u.rrLightDynamic.value = 0;
        if (!this.enabled || !this.dynamicEnabled || !this._scene || !this.supported(renderer)) return;
        const count = u.rrLightCount.value, cached = u.rrLightCached.value >>> 0;
        const pos = u.rrLightPos.value, col = u.rrLightColor.value, aim = u.rrLightAim.value, shadowOf = u.rrLightShadow.value, info = u.rrShadowInfo.value;
        const S = Reactor3D.Shadows, shadows = !!(S && S.appliesTo && S.appliesTo(renderer) && S.active && S.active());
        const bake = this.bakeMaterial(shadows);
        if (!bake || (!bake.compiled && !this.bakeReady(renderer, bake))) return;
        const b = bake.uniforms;
        let n = 0, mask = 0;
        const v = this.DYNAMIC_VOXEL;
        for (let i = 0; i < count && n < Reactor3D.SHADER_LIGHTS; i++) {
            if (cached & (1 << i)) continue;
            const kind = col[i * 4 + 3];
            if (kind > 1.5) continue;
            const slot = shadowOf[i];
            if (slot >= 0 && (info[slot * 4 + 2] >= 0 || !this.dynamicShadowRows)) continue;
            // A light a few voxels across would be smeared: the loop draws it.
            if (pos[i * 4 + 3] < this.DYNAMIC_MIN_VOXELS * v) continue;
            b.rrBakePos.value.set(pos.subarray(i * 4, i * 4 + 4), n * 4);
            b.rrBakeColor.value.set(col.subarray(i * 4, i * 4 + 4), n * 4);
            b.rrBakeAim.value.set(aim.subarray(i * 4, i * 4 + 4), n * 4);
            b.rrBakeShadow.value[n] = shadows ? slot : -1;
            mask |= 1 << i;
            n++;
        }
        if (!n) return;
        const region = this.dynamicRegion(this._front ? this._front.region : this.region(mapData, focus), v);
        if (!region) return;
        const [nx, ny, nz] = region.dims, tx = Math.ceil(Math.sqrt(nz)), ty = Math.ceil(nz / tx), w = nx * tx, h = ny * ty;
        // Grown, never shrunk: a region that follows the view changes size every frame.
        const grow = target => {
            if (target && target.width >= w && target.height >= h) return target;
            const width = Math.max(w, target ? target.width : 0, Math.ceil(w / 128) * 128), height = Math.max(h, target ? target.height : 0, Math.ceil(h / 128) * 128);
            if (target) target.dispose();
            const made = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false });
            made.texture.minFilter = made.texture.magFilter = THREE.LinearFilter;
            made.texture.generateMipmaps = false;
            return made;
        };
        const atlas = this._dynAtlas = grow(this._dynAtlas);
        // What this bake depends on; the same as last time, the atlas holds it.
        const S2 = Reactor3D.Shadows, tiles = (S2 && S2._tiles) || [];
        const sig = this._dynSigNext || (this._dynSigNext = []);
        sig.length = 0;
        sig.push(region.origin[0], region.origin[1], region.origin[2], nx, ny, nz, n, atlas.width, atlas.height, v);
        for (let k = 0; k < n; k++) {
            for (let j = 0; j < 4; j++) sig.push(b.rrBakePos.value[k * 4 + j], b.rrBakeColor.value[k * 4 + j], b.rrBakeAim.value[k * 4 + j]);
            const slot = b.rrBakeShadow.value[k], tile = slot >= 0 ? tiles[slot] : null;
            sig.push(slot, tile ? tile.stamp : -1);
        }
        const last = this._dynSig;
        let same = !!last && last.length === sig.length && this._dynAtlasBaked === atlas;
        for (let k = 0; same && k < sig.length; k++) if (last[k] !== sig[k]) same = false;
        if (!same) {
            this._dynSigNext = last || [];
            this._dynSig = sig;
            b.rrBakeCount.value = n; b.rrBakeMode.value = 3;
            b.rrBakeOrigin.value.set(region.origin); b.rrBakeVoxel.value = v;
            b.rrBakeCells.value[0] = nx; b.rrBakeCells.value[1] = ny; b.rrBakeCells.value[2] = nz;
            b.rrBakeTiles.value[0] = tx; b.rrBakeTiles.value[1] = ty;
            const previous = renderer.getRenderTarget(), autoClear = renderer.autoClear;
            renderer.autoClear = false;
            try {
                atlas.viewport.set(0, 0, w, h);
                renderer.setRenderTarget(atlas); renderer.render(bake.scene, bake.camera);
            } finally { renderer.autoClear = autoClear; renderer.setRenderTarget(previous); }
            this._dynAtlasBaked = atlas;
            this.dynamicBakes = (this.dynamicBakes || 0) + 1;
        }
        u.rrDynAtlas.value = atlas.texture;
        u.rrDynAtlasSize.value[0] = atlas.width; u.rrDynAtlasSize.value[1] = atlas.height;
        u.rrDynOrigin.value.set(region.origin);
        u.rrDynCells.value[0] = nx; u.rrDynCells.value[1] = ny; u.rrDynCells.value[2] = nz;
        u.rrDynTiles.value[0] = tx; u.rrDynTiles.value[1] = ty;
        u.rrDynVoxel.value = v;
        u.rrLightAll.value = (count >= 32 ? 0xffffffff : (1 << count) - 1) >>> 0;
        u.rrLightDynamic.value = mask >>> 0;
        u.rrDynOn.value = 1;
    },

    /**
     * The part of `base` the camera can see, on base's voxel grid: the
     * height of the visible meshes, and across, where the frustum meets
     * that slab (and the visible meshes reach). A voxel of margin all round
     * for the filter. Null when nothing is in view; `base` without a camera.
     */
    DYNAMIC_MARGIN: 2,
    /**
     * The moving lights' own grid, in tiles. A light without a shadow row
     * falls off smoothly over its whole reach (the start map's swinging
     * screen glows reach 75 tiles), so a tile a voxel draws it as the loop
     * does, for an eighth of the half-tile grid's work. A light with a
     * static shadow row stays in the loop (its shadow edges are sharp), as
     * does one a few voxels across.
     */
    DYNAMIC_VOXEL: 1,
    DYNAMIC_MIN_VOXELS: 4,
    dynamicShadowRows: false,
    dynamicRegion(base, voxel = this.VOXEL) {
        const camera = Reactor3D.activeCamera(), frustum = Reactor3D.viewFrustum();
        const scene = this._scene && this._scene.scene ? this._scene.scene() : null;
        if (!camera || !frustum || !scene || typeof THREE === "undefined") return voxel === this.VOXEL ? base : { origin: base.origin.slice(), dims: base.dims.map(d => Math.ceil(d * this.VOXEL / voxel)) };
        const v = voxel, [bx, by, bz] = base.origin;
        // The base's extent, counted in this grid's voxels.
        const bnx = Math.ceil(base.dims[0] * this.VOXEL / v), bny = Math.ceil(base.dims[1] * this.VOXEL / v), bnz = Math.ceil(base.dims[2] * this.VOXEL / v);
        const box = this._viewBox || (this._viewBox = { sphere: new THREE.Sphere(), a: new THREE.Vector3(), c: new THREE.Vector3() });
        // The lit meshes' box is kept for REGION_FRAMES (walking every mesh's
        // bounds each frame was a traversal of its own); the frustum is taken
        // every frame. A view the box once covered but a mesh has since left
        // bakes a little more than it needs to, not less.
        const kept = this._regionBox;
        if (kept && kept.scene === scene && this._frame - kept.frame < this.REGION_FRAMES && kept.children === scene.children.length) {
            return this.dynamicClip(base, kept.box, camera, voxel);
        }
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        const sphere = box.sphere;
        // Only what the lights reach: a lit material that is not self-lit
        // (a light's own glowing body is neither).
        const lit = material => { if (Array.isArray(material)) { for (const m of material) if (m && m.__reactorLit && !m.__reactorSelfLit) return true; return false; }
            return !!(material && material.__reactorLit && !material.__reactorSelfLit); };
        const visit = object => {
            if (!object.visible) return;
            const g = object.geometry;
            if (object.isMesh && g && g.boundingSphere && lit(object.material)) {
                {
                    // Its box, not its sphere: a floor or a wall is flat.
                    if (!g.boundingBox) g.computeBoundingBox();
                    const bb = g.boundingBox, e = object.matrixWorld.elements;
                    const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
                    const hx = (bb.max.x - bb.min.x) / 2, hy = (bb.max.y - bb.min.y) / 2, hz = (bb.max.z - bb.min.z) / 2;
                    const wx = e[0] * cx + e[4] * cy + e[8] * cz + e[12], wy = e[1] * cx + e[5] * cy + e[9] * cz + e[13], wz = e[2] * cx + e[6] * cy + e[10] * cz + e[14];
                    const ex = Math.abs(e[0]) * hx + Math.abs(e[4]) * hy + Math.abs(e[8]) * hz;
                    const ey = Math.abs(e[1]) * hx + Math.abs(e[5]) * hy + Math.abs(e[9]) * hz;
                    const ez = Math.abs(e[2]) * hx + Math.abs(e[6]) * hy + Math.abs(e[10]) * hz;
                    if (wx - ex < x0) x0 = wx - ex; if (wx + ex > x1) x1 = wx + ex;
                    if (wy - ey < y0) y0 = wy - ey; if (wy + ey > y1) y1 = wy + ey;
                    if (wz - ez < z0) z0 = wz - ez; if (wz + ez > z1) z1 = wz + ez;
                }
            }
            const children = object.children;
            for (let i = 0; i < children.length; i++) visit(children[i]);
        };
        visit(scene);
        const union = [x0, y0, z0, x1, y1, z1];
        this._regionBox = { scene, frame: this._frame, children: scene.children.length, box: union };
        return this.dynamicClip(base, union, camera, voxel);
    },
    REGION_FRAMES: 30,

    /** The lit meshes' box (`lit`), cut to where the frustum meets its slab, on base's grid of `voxel`. */
    dynamicClip(base, lit, camera, voxel) {
        let [x0, y0, z0, x1, y1, z1] = lit;
        const v = voxel, [bx, by, bz] = base.origin;
        const bnx = Math.ceil(base.dims[0] * this.VOXEL / v), bny = Math.ceil(base.dims[1] * this.VOXEL / v), bnz = Math.ceil(base.dims[2] * this.VOXEL / v);
        const box = this._viewBox;
        if (!(x1 > x0)) return null;
        y0 = Math.max(y0, by); y1 = Math.min(y1, by + bny * v);
        if (!(y1 > y0)) return null;
        // Where the frustum's four edges cross the slab.
        let fx0 = Infinity, fz0 = Infinity, fx1 = -Infinity, fz1 = -Infinity;
        const a = box.a, c = box.c, take = (x, z) => { if (x < fx0) fx0 = x; if (x > fx1) fx1 = x; if (z < fz0) fz0 = z; if (z > fz1) fz1 = z; };
        for (let k = 0; k < 4; k++) {
            const nxd = k & 1 ? 1 : -1, nyd = k & 2 ? 1 : -1;
            a.set(nxd, nyd, -1).unproject(camera); c.set(nxd, nyd, 1).unproject(camera);
            if (a.y >= y0 && a.y <= y1) take(a.x, a.z);
            if (c.y >= y0 && c.y <= y1) take(c.x, c.z);
            const dy = c.y - a.y;
            if (dy !== 0) for (const plane of [y0, y1]) {
                const t = (plane - a.y) / dy;
                if (t >= 0 && t <= 1) take(a.x + (c.x - a.x) * t, a.z + (c.z - a.z) * t);
            }
        }
        if (fx1 >= fx0) { x0 = Math.max(x0, fx0); x1 = Math.min(x1, fx1); z0 = Math.max(z0, fz0); z1 = Math.min(z1, fz1); }
        const m = this.DYNAMIC_MARGIN;
        const lo = (value, origin, count) => Math.max(0, Math.min(count, Math.floor((value - origin) / v) - m));
        const hi = (value, origin, count) => Math.max(0, Math.min(count, Math.ceil((value - origin) / v) + m));
        const i0 = lo(x0, bx, bnx), i1 = hi(x1, bx, bnx), j0 = lo(y0, by, bny), j1 = hi(y1, by, bny), k0 = lo(z0, bz, bnz), k1 = hi(z1, bz, bnz);
        if (i1 <= i0 || j1 <= j0 || k1 <= k0) return null;
        return { origin: [bx + i0 * v, by + j0 * v, bz + k0 * v], dims: [i1 - i0, j1 - j0, k1 - k0] };
    },

    /** Whether a bake program is compiled, starting its compile on the driver's threads if not. */
    bakeReady(renderer, bake) {
        if (bake.compiled) return true;
        if (!(renderer.compileAsync && renderer.extensions && renderer.extensions.has("KHR_parallel_shader_compile"))) { bake.compiled = true; return true; }
        if (!bake.compiling) {
            try { bake.compiling = renderer.compileAsync(bake.scene, bake.camera).then(() => { bake.compiled = true; }, () => { bake.compiled = true; }); }
            catch (error) { bake.compiled = true; }
        }
        return !!bake.compiled;
    },

    frameStatic(renderer, mapScene, mapData, focus) {
        const u = this.uniforms();
        u.rrVolumeOn.value = 0;
        u.rrLightCached.value = 0;
        if (!this.enabled || !renderer || !mapScene || !this.supported(renderer)) return;
        if (this._scene !== mapScene || this._generation !== Reactor3D.contextGeneration) {
            this.reset();
            this._scene = mapScene;
            this._generation = Reactor3D.contextGeneration;
            return;
        }
        const want = this.desired();
        // Glowing water is light this volume holds too: the volume then stands where that water can be in it.
        const water = Reactor3D.WaterLight.describe(mapData);
        if (water) focus = Reactor3D.WaterLight.focus(focus, mapData);
        const region = this.region(mapData, focus);
        if (water) Reactor3D.WaterLight.fit(region, water, focus);
        const regionKey = region.origin.join(",") + "/" + region.dims.join(",");
        const base = want.signature + "/" + regionKey;
        let signature = base + (water ? "/" + water.signature : "");
        // A bake under way for an earlier look of the water is let finish (a slider being dragged changes the
        // look every frame, and a bake started again every frame would never show): the next one takes the newest.
        if (this._back && this._back.base === base && this._back.water && water && this._back.signature !== signature) signature = this._back.signature;
        const hasLights = want.statics.length + want.flickers.length + (want.pulses || []).length > 0 || !!water;
        if (!(this._front && this._front.signature === signature) && hasLights) {
            if (!this._back || this._back.signature !== signature) {
                this.dispose(this._back);
                this._back = this.makeVolume(region, want);
                this._back.signature = signature;
                this._back.base = base;
                this._back.water = water;
                this._back.waterMap = water ? mapData : null;
            }
            if (this.bakeSome(renderer, this._back)) {
                this.dispose(this._front);
                this._front = this._back;
                this._back = null;
            }
        }
        const front = this._front;
        if (!front) return;
        // Water that glowed when the front was baked and glows no longer: its light goes with the volume.
        if (front.water && !water) return;
        // Every light the front holds must still be what was baked; else the
        // volume sits out (all lights live) until the new one is ready.
        const count = u.rrLightCount.value, held = front.want.statics.concat(front.want.flickers, front.want.pulses || []);
        let cached = 0;
        for (const record of held) {
            const now = this._records.get(record.id);
            if (!now || now.key !== record.key || now.shadow !== record.shadow) return;
            if (now.present === this._frame && now.index >= 0 && now.index < count) cached |= 1 << now.index;
        }
        const colours = u.rrVolumeFlickerColor.value;
        colours.fill(0);
        for (let k = 0; k < front.want.flickers.length; k++) {
            const record = front.want.flickers[k], now = this._records.get(record.id), c = record.packed.col, f = now ? now.flicker : 1;
            colours[k * 3] = c[0] * f; colours[k * 3 + 1] = c[1] * f; colours[k * 3 + 2] = c[2] * f;
        }
        const pulseColours = u.rrVolumePulseColor.value, radii = u.rrVolumePulseRadius.value;
        pulseColours.fill(0); radii.fill(0);
        const pulses = front.want.pulses || [];
        for (let k = 0; k < pulses.length; k++) {
            const now = this._records.get(pulses[k].id), c = pulses[k].packed.col, f = now ? now.flicker : 1;
            pulseColours[k * 3] = c[0] * f; pulseColours[k * 3 + 1] = c[1] * f; pulseColours[k * 3 + 2] = c[2] * f;
            radii[k] = now && now.radius > 0 ? now.radius : 0;
        }
        const [ox, oy, oz] = front.region.origin, [nx, ny, nz] = front.region.dims, v = this.VOXEL;
        u.rrVolumeOrigin.value[0] = ox; u.rrVolumeOrigin.value[1] = oy; u.rrVolumeOrigin.value[2] = oz;
        u.rrVolumeInvSize.value[0] = 1 / (nx * v); u.rrVolumeInvSize.value[1] = 1 / (ny * v); u.rrVolumeInvSize.value[2] = 1 / (nz * v);
        u.rrVolumeStatic.value = front.static.texture;
        u.rrVolumeFlicker.value = front.flicker.texture;
        u.rrVolumePulse.value = front.pulse ? front.pulse.texture : null;
        u.rrLightCached.value = cached >>> 0;
        u.rrLightAll.value = (count >= 32 ? 0xffffffff : (1 << count) - 1) >>> 0;
        u.rrVolumeOn.value = 1;
    }
};

//-----------------------------------------------------------------------------
// The water's light
//
// A sheet that glows lights what stands round it: the shore, the ground,
// walls, pieces, plants and whoever walks by take its colour, less with
// distance. It is not a ring of lamps. The glowing water of a map is laid
// out as one small picture of the map (a texel a tile): each glowing sheet's
// wet cells spread outward a few tiles and coloured by the sheet, with the
// water's height beside it. The light volume's bake reads that picture at
// every voxel and fades it with height over (and under) the water, so the
// light stands in the same baked volume as the still lamps: a frame pays
// nothing for it once it is baked, it casts no shadows, and it is baked
// again only when a sheet's look, shape or level changes. However many
// sheets glow, the bake reads one texel.
Reactor3D.WaterLight = {
    enabled: true,
    /** How far the light spreads from the water's edge: three passes of a box this many tiles each way. */
    SPREAD: 3,
    /**
     * A thin sheet (a well, a crack of lava, a stream) has little water under
     * so wide a spread and would light nothing. Spread as widely, the most
     * water any cell of it has round it tells how thin it is: under THIN[0]
     * the box is one tile each way, under THIN[1] two, and what is found is
     * raised until its middle has as much as SHORE (a little under a
     * straight shore's half), never more than GAIN times. So a small pool
     * lights its rim about as a lake lights its bank, but only a few tiles
     * out: the reach goes with the size.
     */
    THIN: [0.08, 0.3],
    SHORE: 0.4,
    GAIN: 8,
    /**
     * A wide sheet (a lake) lights further than a pond: its water is spread
     * with a wider box, up to this many tiles each way a pass, for as long as
     * its middle still has water all round it at that width.
     */
    WIDE: 5,
    /**
     * The share of the water's light a surface takes as a sheen in the
     * water's own colour, whatever colour the surface is. Light falls on a
     * surface through the surface's colour: under a purple lake's light green
     * grass (which has no purple in it) only goes grey, and nothing on the
     * bank looks lit by the lake. A lighter surface takes more of it, a
     * black one a quarter.
     */
    SHEEN: 0.3,
    /** The sheen, before `#include <opaque_fragment>` of a lit material (injectWaterVolume): `rrLitBy` and `rrWaterShone` are what `rrLight` left. */
    SHEEN_GLSL: [
        "{",
        // How light the surface is: what it shows over the light that fell on it, by its strongest channel.
        "\tvec3 rrOwn = outgoingLight / max(rrLitBy, vec3(0.001));",
        "\toutgoingLight += rrWaterShone * (rrWaterSheen * (0.25 + 0.75 * clamp(max(rrOwn.r, max(rrOwn.g, rrOwn.b)), 0.0, 1.0)));",
        "}"
    ].join("\n"),
    /** How far over and under the surface it reaches, in tiles (a basin's slopes and a cave's roof take it). */
    ABOVE: 14,
    BELOW: 14,
    /** How many tiles from the volume's edge it fades out over, on a map larger than the volume. */
    EDGE: 6,
    /** The most sheets a map's light is made of: the brightest, then the largest. */
    MAX_SHEETS: 32,
    _memo: new WeakMap(),
    _spreads: new Map(),
    _serial: 0,
    _lastKey: "",

    /** What a sheet's spread depends on: where its water lies. */
    shapeKey(region) {
        return region.x0 + "," + region.y0 + "," + region.x1 + "," + region.y1 + "," + region.level + "," + (region.mask || "")
            + (region.path ? "," + JSON.stringify(region.path) : "");
    },

    /**
     * The glowing sheets of a map, or null when none glows: `{ signature, sheets,
     * width, height }`, each sheet `{ region, shade, low }` (`low` its lowest
     * surface). Worked out once per stored water list (an edit writes a new
     * list); the signature changes only when what the light depends on does.
     */
    describe(mapData) {
        if (!this.enabled) return null;
        const raw = mapData && mapData.reactor3d && mapData.reactor3d.water;
        if (!Array.isArray(raw) || !raw.length || typeof Reactor3D.waterOf !== "function" || typeof Reactor3D.waterShade !== "function") return null;
        if (this._memo.has(raw)) return this._memo.get(raw);
        const sheets = [];
        for (const region of Reactor3D.waterOf(mapData)) {
            if (!(region.glow > 0)) continue;
            const shade = Reactor3D.waterShade(region);
            if (!(shade.light > 0)) continue;
            let low = region.level;
            if (region.path) for (const point of region.path) low = Math.min(low, point[2]);
            sheets.push({ region, shade, low, cells: (region.x1 - region.x0 + 1) * (region.y1 - region.y0 + 1) });
        }
        let info = null;
        if (sheets.length) {
            sheets.sort((a, b) => b.shade.light - a.shade.light || b.cells - a.cells);
            sheets.length = Math.min(sheets.length, this.MAX_SHEETS);
            const key = mapData.width + "x" + mapData.height + ";" + sheets.map(sheet => this.shapeKey(sheet.region) + "|" + sheet.region.glow + "|" + (sheet.region.colour || "")).join(";");
            if (key !== this._lastKey) { this._lastKey = key; this._serial++; }
            info = { signature: "water" + this._serial, sheets, width: mapData.width, height: mapData.height };
        }
        this._memo.set(raw, info);
        return info;
    },

    /** A running box of half-width `r` along the rows (`stride` 1) or the columns (`stride` w) of a w x h field, in place; past the field counts as dry. */
    box(field, w, h, stride, r, scratch) {
        const rows = stride === 1, lines = rows ? h : w, length = rows ? w : h, span = 2 * r + 1;
        for (let line = 0; line < lines; line++) {
            const start = rows ? line * w : line;
            let sum = 0;
            for (let i = 0; i < length; i++) scratch[i] = field[start + i * stride];
            for (let i = 0; i <= r && i < length; i++) sum += scratch[i];
            for (let i = 0; i < length; i++) {
                field[start + i * stride] = sum / span;
                if (i + r + 1 < length) sum += scratch[i + r + 1];
                if (i - r >= 0) sum -= scratch[i - r];
            }
        }
    },

    /**
     * How much of a sheet's water lies round each cell (`cover`, 1 well inside
     * it, a half at a straight shore, nothing a few tiles off), and the height
     * of that water as seen from the cell (`level`: a river's runs downhill),
     * over the sheet's box grown by the spread and cut to the map. A thin
     * sheet is spread less far and raised (THIN, SHORE, GAIN; `reach` and
     * `gain` say how). Kept per shape: a look that changes does not spread
     * the water again.
     */
    spread(region, mapData) {
        const key = this.shapeKey(region) + "@" + mapData.width + "x" + mapData.height;
        const known = this._spreads.get(key);
        if (known) return known;
        const pad = Math.max(this.SPREAD, this.WIDE) * 3 + 1;
        const x0 = Math.max(0, region.x0 - pad), y0 = Math.max(0, region.y0 - pad);
        const x1 = Math.min(mapData.width - 1, region.x1 + pad), y1 = Math.min(mapData.height - 1, region.y1 + pad);
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        const cover = new Float32Array(w * h), level = new Float32Array(w * h), scratch = new Float32Array(Math.max(w, h));
        // `level` holds each wet cell's height; spread like the cover, their ratio is the height seen from a cell.
        const lay = reach => {
            cover.fill(0); level.fill(0);
            for (let y = Math.max(y0, region.y0); y <= Math.min(y1, region.y1); y++) for (let x = Math.max(x0, region.x0); x <= Math.min(x1, region.x1); x++) {
                if (!Reactor3D.waterCovers(region, x, y)) continue;
                const at = (y - y0) * w + (x - x0);
                cover[at] = 1;
                level[at] = region.path && Reactor3D.riverCellLevel ? Reactor3D.riverCellLevel(region, x, y) : region.level;
            }
            for (const field of [cover, level]) for (let pass = 0; pass < 3; pass++) { this.box(field, w, h, 1, reach, scratch); this.box(field, w, h, w, reach, scratch); }
            let most = 0;
            for (let i = 0; i < cover.length; i++) if (cover[i] > most) most = cover[i];
            return most;
        };
        let reach = this.SPREAD, most = lay(reach);
        if (most > 0 && most < this.THIN[1]) { reach = most < this.THIN[0] ? 1 : 2; most = lay(reach); }
        // A wide sheet reaches further, a tile at a time, while its middle is still whole.
        else while (most > 0.98 && reach < this.WIDE) {
            const wider = lay(reach + 1);
            if (wider <= 0.98) { most = lay(reach); break; }
            reach++; most = wider;
        }
        const gain = most > 0 ? Math.max(1, Math.min(this.GAIN, this.SHORE / most)) : 1;
        for (let i = 0; i < cover.length; i++) {
            level[i] = cover[i] > 1e-5 ? level[i] / cover[i] : region.level;
            cover[i] = Math.min(1, cover[i] * gain);
        }
        const made = { x0, y0, w, h, cover, level, reach, gain };
        if (this._spreads.size >= 48) this._spreads.clear();
        this._spreads.set(key, made);
        return made;
    },

    /**
     * The map's glowing water as a picture, a texel a tile, into `out` when it
     * fits: r, g, b the light the water gives a point at its own height
     * there, a the height of that water.
     */
    build(mapData, info, out) {
        const W = info.width, H = info.height, n = W * H;
        const data = out && out.length === n * 4 ? out : new Float32Array(n * 4);
        data.fill(0);
        const weight = this._weights && this._weights.length === n ? this._weights : (this._weights = new Float32Array(n));
        weight.fill(0);
        for (const sheet of info.sheets) {
            const s = this.spread(sheet.region, mapData), shade = sheet.shade;
            const r = shade.neon[0] * shade.light, g = shade.neon[1] * shade.light, b = shade.neon[2] * shade.light;
            for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
                const cover = s.cover[y * s.w + x];
                if (cover <= 1e-4) continue;
                // A faint glow stays close to its water; a strong one reaches out.
                const f = Math.pow(cover, shade.shape), at = (s.y0 + y) * W + s.x0 + x;
                data[at * 4] += r * f; data[at * 4 + 1] += g * f; data[at * 4 + 2] += b * f;
                data[at * 4 + 3] += s.level[y * s.w + x] * f;
                weight[at] += f;
            }
        }
        for (let i = 0; i < n; i++) if (weight[i] > 0) data[i * 4 + 3] /= weight[i];
        return data;
    },

    /** The picture as the texture the bake reads (half floats, filtered), written again only for another `info`. */
    texture(mapData, info) {
        if (typeof THREE === "undefined") return null;
        let held = this._texture;
        if (held && held.signature === info.signature && held.width === info.width && held.height === info.height) return held.texture;
        const data = this._field = this.build(mapData, info, this._field);
        const n = info.width * info.height * 4;
        if (!held || held.width !== info.width || held.height !== info.height) {
            if (held) held.texture.dispose();
            const texture = new THREE.DataTexture(new Uint16Array(n), info.width, info.height, THREE.RGBAFormat, THREE.HalfFloatType);
            texture.minFilter = texture.magFilter = THREE.LinearFilter;
            texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
            texture.generateMipmaps = false;
            held = this._texture = { texture, width: info.width, height: info.height, signature: "" };
        }
        const half = held.texture.image.data;
        for (let i = 0; i < n; i++) half[i] = THREE.DataUtils.toHalfFloat(data[i]);
        held.texture.needsUpdate = true;
        held.signature = info.signature;
        return held.texture;
    },

    /** How high the focus may stand before the volume is raised with it: under this the volume stays where every map's does. */
    RISE: 12,

    /**
     * Where the volume is centred on a map whose water glows: the view's own
     * focus when its owner names one (the editor's orbit target, in steps of
     * eight tiles so a pan does not bake at every tile), else the focus given
     * (the player). `standY` is the height of the ground there. `groundY`,
     * which the volume is hung from, is 0 (where a map without glowing water
     * hangs it, so its lamps are cached the same) until the focus stands more
     * than RISE over that: the water's light exists only in the volume, and
     * high ground would otherwise be out of the top of it.
     */
    focus(given, mapData) {
        const out = this._focus || (this._focus = { x: 0, y: 0, groundY: 0, standY: 0 });
        const S = Reactor3D.Shadows;
        let point = null;
        if (S && typeof S.focus === "function") { try { point = S.focus(); } catch (error) { point = null; } }
        if (point && Number.isFinite(point.x) && Number.isFinite(point.z)) {
            out.x = Math.round(point.x / 8) * 8; out.y = Math.round(point.z / 8) * 8;
            out.standY = Number.isFinite(point.y) ? point.y : 0;
        } else {
            if (!given) return given;
            out.x = given.x; out.y = given.y;
            out.standY = Number.isFinite(given.groundY) ? given.groundY
                : typeof Reactor3D.terrainHeightAt === "function" && mapData ? Reactor3D.terrainHeightAt(mapData, (given.x || 0) + 0.5, (given.y || 0) + 0.5) || 0 : 0;
        }
        out.groundY = Math.max(0, out.standY - this.RISE);
        return out;
    },

    /**
     * Lower a volume's floor so the glowing sheets inside its box are in it
     * (a lake in a basin lies under the ground the volume is hung from),
     * never so far that the focus's own ground and a storey over it leave
     * the top.
     */
    fit(region, info, focus) {
        const v = Reactor3D.LightVolume.VOXEL, x0 = region.origin[0], z0 = region.origin[2];
        const x1 = x0 + region.dims[0] * v, z1 = z0 + region.dims[2] * v;
        let low = Infinity;
        for (const sheet of info.sheets) {
            const r = sheet.region;
            if (r.x1 + 1 < x0 || r.x0 > x1 || r.y1 + 1 < z0 || r.y0 > z1) continue;
            if (sheet.low < low) low = sheet.low;
        }
        if (low === Infinity) return region;
        const ground = focus && Number.isFinite(focus.standY) ? focus.standY : focus && Number.isFinite(focus.groundY) ? focus.groundY : 0;
        const floor = Math.floor((low - 2) / 4) * 4, least = Math.ceil((ground + 12 - region.dims[1] * v) / 4) * 4;
        region.origin[1] = Math.max(least, Math.min(region.origin[1], floor));
        return region;
    },

    /** The bake's uniforms for the water: the picture, the map's size and the reach over and under, the box the light is whole in, and the tiles it fades out over past that box (0: no water glows). */
    bakeUniforms() {
        return { rrBakeWater: { value: null }, rrBakeWaterMap: { value: new Float32Array(4) }, rrBakeWaterBox: { value: new Float32Array(4) }, rrBakeWaterEdge: { value: 0 } };
    },

    BAKE_GLSL: [
        "uniform highp sampler2D rrBakeWater;",
        "uniform vec4 rrBakeWaterMap;",
        "uniform vec4 rrBakeWaterBox;",
        "uniform float rrBakeWaterEdge;",
        "vec3 rrBakeWaterLight(vec3 p) {",
        "\tvec4 e = texture2D(rrBakeWater, p.xz * rrBakeWaterMap.xy);",
        "\tfloat dy = p.y - e.a;",
        "\tfloat f = pow(max(0.0, 1.0 - (dy >= 0.0 ? dy / rrBakeWaterMap.z : -dy / rrBakeWaterMap.w)), 1.5);",
        // Toward the edge of a volume that does not hold the whole map the light fades out rather than stop at a line.
        "\tfloat edge = min(min(p.x - rrBakeWaterBox.x, rrBakeWaterBox.z - p.x), min(p.z - rrBakeWaterBox.y, rrBakeWaterBox.w - p.z));",
        "\treturn e.rgb * (f * clamp(1.0 + edge / rrBakeWaterEdge, 0.0, 1.0));",
        "}"
    ].join("\n"),

    /** Before a volume's layers are baked: its water (`volume.water`, from describe) into the bake's uniforms. */
    loadBake(uniforms, volume) {
        const info = volume && volume.water, texture = info ? this.texture(volume.waterMap, info) : null;
        uniforms.rrBakeWaterEdge.value = texture ? this.EDGE : 0;
        if (!texture) return;
        uniforms.rrBakeWater.value = texture;
        const map = uniforms.rrBakeWaterMap.value;
        map[0] = 1 / info.width; map[1] = 1 / info.height; map[2] = this.ABOVE; map[3] = this.BELOW;
        this.wholeBox(volume.region, info, uniforms.rrBakeWaterBox.value);
    },

    /**
     * The box of the map (x0, z0, x1, z1) a volume holds the water's light
     * whole in, into `box`: its own box drawn in by EDGE on each side that
     * does not lie on the map's edge. Past it the bake fades the light out
     * over EDGE tiles, and the lit shader fades the far light in the same.
     */
    wholeBox(region, info, box) {
        const v = Reactor3D.LightVolume.VOXEL, x0 = region.origin[0], z0 = region.origin[2];
        const x1 = x0 + region.dims[0] * v, z1 = z0 + region.dims[2] * v;
        box[0] = x0 > 0 ? x0 + this.EDGE : -1e6; box[1] = z0 > 0 ? z0 + this.EDGE : -1e6;
        box[2] = x1 < info.width ? x1 - this.EDGE : 1e6; box[3] = z1 < info.height ? z1 - this.EDGE : 1e6;
        return box;
    },

    /**
     * Each frame, after the volume shown is settled: the water's light for
     * the lit shader to read where that volume does not hold it. The volume
     * is a box round the focus (64 tiles on a larger map), and a glowing lake
     * is seen from much further: past the box, over or under it, and while
     * the volume is set aside or cannot be made on this renderer, a surface
     * reads the same picture the bake does, one texel, with the bake's own
     * falloff. `uniforms` are the light's, `volumes` the LightVolume. The
     * picture is the one the newest bake reads; it is made here only when no
     * bake is there to make it (a bake keeps the picture it began with).
     */
    loadFar(uniforms, mapData, volumes) {
        const info = this.describe(mapData);
        if (!info) { uniforms.rrWaterFarEdge.value = 0; return; }
        let held = this._texture;
        let fits = !!held && held.width === info.width && held.height === info.height;
        if (!volumes._back && !(fits && held.signature === info.signature)) {
            this.texture(mapData, info);
            held = this._texture;
            fits = !!held && held.width === info.width && held.height === info.height;
        }
        if (!fits) { uniforms.rrWaterFarEdge.value = 0; return; }
        uniforms.rrWaterFar.value = held.texture;
        if (uniforms.rrWaterSheen) uniforms.rrWaterSheen.value = this.SHEEN;
        const map = uniforms.rrWaterFarMap.value, box = uniforms.rrWaterFarBox.value;
        map[0] = 1 / info.width; map[1] = 1 / info.height; map[2] = this.ABOVE; map[3] = this.BELOW;
        uniforms.rrWaterFarEdge.value = this.EDGE;
        // Where the volume shown holds the light whole; nowhere when it is off or was baked before the water glowed.
        const front = volumes._front;
        if (uniforms.rrVolumeOn.value && front && front.water) this.wholeBox(front.region, front.water, box);
        else { box[0] = box[1] = 1e6; box[2] = box[3] = -1e6; }
    }
};

//-----------------------------------------------------------------------------
// The halo
//
// A thing that shines brightly bleeds light into the picture round it: the
// rim of a glowing lake lies over its bank, over the reeds and over whoever
// stands in front of it. Only what feeds the halo is drawn for it, so the
// rest of the picture is left exactly as it was: each feeder is a mesh of a
// shining surface (`feed`), drawn alone into a target a quarter the pass's
// size each way, in the colour and strength it gives, behind whatever the
// pass's depth has in front of it (the haze's own test). That small picture
// is halved LEVELS times and gathered back up, each size a wider and softer
// copy, and the sum is laid over the pass as a screen: a dark bank takes all
// of it, a sunlit one a little, nothing goes past white, and a pixel the sum
// does not reach is not written. Drawn with the lights' haze
// (`HalfHaze.take` / `draw`), so it is in the game's passes and the
// editor's view alike and off wherever the haze's quarter-size pass is. A
// map where nothing feeds it draws no pass and holds no target.
//
// Glowing liquids feed it (MapScene.addWaterHaze; the strength is
// waterShade's `halo`). Anything else that shines can: make a mesh of its
// surface with `surfaceMaterial({ colour, strength })`, or with any material
// built through `HalfHaze.shader` that writes the light it gives, hand it to
// `feed` with the scene's light bodies group, and show it while it shines.
Reactor3D.Halo = {
    /** A quality switch, with the lights' others (HalfHaze, HalfLight, SHADOWS): false draws no halo and keeps no target. */
    enabled: true,
    /** The most the halo adds where a feeder at full strength fills the view (as drawn, 0-1), before the screen. */
    STRENGTH: 0.9,
    /** How many times the quarter-size picture is halved; the widest copy spreads about a tenth of the picture's height. */
    LEVELS: 4,
    /** Each size's share of the halo, tightest first (one per level; they sum to 1). */
    SHARES: [0.2, 0.25, 0.27, 0.28],
    /** Frames without a feeder before the targets are let go. */
    IDLE_FRAMES: 120,
    _targets: null,
    _idle: 0,
    _passes: 0,
    _draws: 0,

    /**
     * A mesh of `geometry` standing at `matrix` (world) that feeds the halo,
     * kept with `bodies` (a scene's light bodies group) in a group of its own
     * that no draw of the scene shows: only `draw` does. Returns the mesh;
     * its `visible` says whether it shines now.
     */
    feed(bodies, geometry, material, matrix) {
        let group = bodies.userData.rrHalo;
        if (!group) {
            group = bodies.userData.rrHalo = new THREE.Group();
            group.name = "halo-feeders";
            group.visible = false;
            bodies.add(group);
        }
        const mesh = new THREE.Mesh(geometry, material);
        if (matrix) mesh.matrix.copy(matrix);
        mesh.matrixAutoUpdate = false;
        group.add(mesh);
        return mesh;
    },

    /**
     * A shining surface as the halo takes it: one flat colour times its
     * strength (`shared`: `{ colour: { value: Color }, strength: { value } }`,
     * the owner's live values), gone where the surface meets the shore (a
     * sheet's `rrDepth`; a surface without one gives everywhere).
     */
    surfaceMaterial(shared) {
        const haze = Reactor3D.HalfHaze.uniforms();
        const material = new THREE.ShaderMaterial({
            uniforms: {
                rrHazeDepth: haze.rrHazeDepth, rrHazeDepthScale: haze.rrHazeDepthScale, rrHazeDepthPick: haze.rrHazeDepthPick, rrHazeDepthOn: haze.rrHazeDepthOn,
                colour: shared.colour, strength: shared.strength
            },
            vertexShader: [
                "attribute float rrDepth;",
                "varying float vRRDepth;",
                "void main() {",
                "\tvRRDepth = rrDepth;",
                "\tgl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);",
                "}"
            ].join("\n"),
            fragmentShader: Reactor3D.HalfHaze.shader([
                "uniform vec3 colour;",
                "uniform float strength;",
                "varying float vRRDepth;",
                "void main() {",
                "\tgl_FragColor = vec4(colour * (strength * smoothstep(0.0, 0.3, vRRDepth)), 1.0);",
                "}"
            ].join("\n")),
            blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false,
            side: THREE.DoubleSide, forceSinglePass: true, fog: false
        });
        // A surface with no depth of its own under it (no `rrDepth`) gives everywhere.
        material.defaultAttributeValues = { rrDepth: [1] };
        material.userData.rrHaloFeeder = true;
        return material;
    },

    /**
     * What feeds the halo from a scene's light bodies this frame: the
     * feeders' group when the halo is on and one of them shines, else null.
     * Asked once a pass; after IDLE_FRAMES passes with nothing, the targets go.
     */
    sources(bodies) {
        const group = this.enabled && bodies ? bodies.userData.rrHalo : null;
        if (group) {
            const list = group.children;
            for (let i = 0; i < list.length; i++) if (list[i].visible) { this._idle = 0; return group; }
        }
        if (this._targets && ++this._idle > this.IDLE_FRAMES) this.dispose();
        return null;
    },

    /** The quarter-size picture and its halvings, made for the size asked. */
    targets(w, h) {
        let list = this._targets;
        if (list && list[0].width === w && list[0].height === h && list.length === this.LEVELS + 1) return list;
        this.dispose();
        list = this._targets = [];
        for (let i = 0; i <= this.LEVELS; i++) {
            const target = new THREE.WebGLRenderTarget(Math.max(1, Math.ceil(w / (1 << i))), Math.max(1, Math.ceil(h / (1 << i))), {
                type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
                minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
            list.push(target);
        }
        return list;
    },

    dispose() {
        for (const target of this._targets || []) target.dispose();
        this._targets = null;
        this._idle = 0;
    },

    /** What it holds and did last, for a test or a measurement. */
    state() {
        return { enabled: this.enabled, targets: this._targets ? this._targets.length : 0, size: this._targets ? [this._targets[0].width, this._targets[0].height] : null,
            passes: this._passes, draws: this._draws };
    },

    /** The full-screen programs: halve, gather up (added to what a size already holds), the last gather (written), and the screen onto the pass. */
    quads() {
        if (this._quads) return this._quads;
        const vertex = "varying vec2 vUv;\nvoid main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }";
        const quad = (fragment, uniforms, blend) => {
            const material = new THREE.ShaderMaterial(Object.assign({ uniforms, vertexShader: vertex, fragmentShader: fragment, depthTest: false, depthWrite: false }, blend));
            const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
            mesh.frustumCulled = false;
            const scene = new THREE.Scene();
            scene.add(mesh);
            return { material, scene, uniforms };
        };
        // Halved: the texel under each pixel and its four diagonal neighbours (each a filtered four), so a thin feeder does not flicker.
        const down = [
            "uniform sampler2D map;",
            "uniform vec2 texel;",
            "varying vec2 vUv;",
            "void main() {",
            "\tvec3 c = texture2D(map, vUv).rgb * 4.0 + texture2D(map, vUv + texel).rgb + texture2D(map, vUv - texel).rgb",
            "\t\t+ texture2D(map, vUv + vec2(texel.x, -texel.y)).rgb + texture2D(map, vUv - vec2(texel.x, -texel.y)).rgb;",
            "\tgl_FragColor = vec4(c * 0.125, 1.0);",
            "}"
        ].join("\n");
        // Gathered up: a tent over the smaller size, so no texel of it shows as a block.
        const up = [
            "uniform sampler2D map;",
            "uniform vec2 texel;",
            "uniform float weight;",
            "varying vec2 vUv;",
            "void main() {",
            "\tvec3 c = texture2D(map, vUv + vec2(-2.0, 0.0) * texel).rgb + texture2D(map, vUv + vec2(2.0, 0.0) * texel).rgb",
            "\t\t+ texture2D(map, vUv + vec2(0.0, -2.0) * texel).rgb + texture2D(map, vUv + vec2(0.0, 2.0) * texel).rgb",
            "\t\t+ 2.0 * (texture2D(map, vUv + vec2(-1.0, -1.0) * texel).rgb + texture2D(map, vUv + vec2(1.0, -1.0) * texel).rgb",
            "\t\t+ texture2D(map, vUv + vec2(-1.0, 1.0) * texel).rgb + texture2D(map, vUv + vec2(1.0, 1.0) * texel).rgb);",
            "\tgl_FragColor = vec4(c * (weight / 12.0), 1.0);",
            "}"
        ].join("\n");
        // Onto the pass: nothing where the halo does not reach (the pixel is not written), a grain under one
        // step of the screen elsewhere so a wide dim halo over a dark bank does not band.
        const screen = [
            "uniform sampler2D map;",
            "uniform float strength;",
            "varying vec2 vUv;",
            "void main() {",
            "\tvec3 h = min(texture2D(map, vUv).rgb * strength, vec3(1.0));",
            "\tif (max(h.r, max(h.g, h.b)) < 0.002) discard;",
            "\tfloat grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) - 0.5;",
            "\tgl_FragColor = vec4(max(h + grain / 255.0, vec3(0.0)), 0.0);",
            "}"
        ].join("\n");
        const added = { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
            blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, transparent: true };
        const sample = () => ({ map: { value: null }, texel: { value: new THREE.Vector2() }, weight: { value: 1 } });
        this._quads = {
            camera: new THREE.Camera(),
            down: quad(down, sample(), { blending: THREE.NoBlending }),
            up: quad(up, sample(), added),
            last: quad(up, sample(), { blending: THREE.NoBlending }),
            // A screen: what is there plus the halo's share of what is left to white; the pass's alpha as it was.
            screen: quad(screen, { map: { value: null }, strength: { value: this.STRENGTH } }, { blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
                blendSrc: THREE.OneMinusDstColorFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor, transparent: true })
        };
        return this._quads;
    },

    /**
     * The halo of `feeders` (from `sources`) onto `target`, the pass just
     * drawn: called by `HalfHaze.draw` while the haze's depth uniforms hold
     * the pass's depth at `w` by `h`, its own size.
     */
    draw(renderer, target, camera, feeders, w, h) {
        const levels = this.targets(w, h), quads = this.quads(), shares = this.SHARES, n = this.LEVELS;
        const autoClear = renderer.autoClear, clearColour = renderer.getClearColor(this._clear || (this._clear = new THREE.Color())), clearAlpha = renderer.getClearAlpha();
        let passes = 0;
        try {
            renderer.setRenderTarget(levels[0]);
            renderer.setClearColor(0x000000, 0);
            renderer.clear(true, false, false);
            renderer.autoClear = false;
            feeders.visible = true;
            try { renderer.render(feeders, camera); } finally { feeders.visible = false; }
            for (let i = 1; i <= n; i++) {
                const from = levels[i - 1], u = quads.down.uniforms;
                u.map.value = from.texture; u.texel.value.set(1 / from.width, 1 / from.height);
                renderer.setRenderTarget(levels[i]);
                renderer.render(quads.down.scene, quads.camera); passes++;
            }
            // Each size takes the wider ones, weighted so the sizes end with their shares.
            for (let i = n - 1; i >= 1; i--) {
                const from = levels[i + 1], u = quads.up.uniforms;
                u.map.value = from.texture; u.texel.value.set(0.5 / from.width, 0.5 / from.height); u.weight.value = shares[i] / shares[i - 1];
                renderer.setRenderTarget(levels[i]);
                renderer.render(quads.up.scene, quads.camera); passes++;
            }
            const first = levels[1], lu = quads.last.uniforms;
            lu.map.value = first.texture; lu.texel.value.set(0.5 / first.width, 0.5 / first.height); lu.weight.value = shares[0];
            renderer.setRenderTarget(levels[0]);
            renderer.render(quads.last.scene, quads.camera); passes++;
            quads.screen.uniforms.map.value = levels[0].texture;
            quads.screen.uniforms.strength.value = this.STRENGTH;
            renderer.setRenderTarget(target);
            renderer.render(quads.screen.scene, quads.camera); passes++;
        } finally {
            renderer.autoClear = autoClear;
            renderer.setClearColor(clearColour, clearAlpha);
            this._passes = passes;
            this._draws++;
        }
    }
};

//-----------------------------------------------------------------------------
// Half-size lighting
//
// The light a surface takes is a function of where it stands (the loop, the
// volumes, the shadow rows: `rrLight(p)`), with no texture in it, so it can
// be worked out on a coarser grid than the picture without anyone seeing the
// seams, and once per pixel rather than once per surface drawn over it. The
// map's pass is drawn in two: first every surface whose colour is simply
// its picture times that light, unlit (`twin`); then the light,
// from the depth those surfaces left, at a quarter size each way; then
// the pass multiplied by it; then everything else, lit as before (a
// reflective finish, a flash, a glow, glass and haze, anything that does
// not write depth). A tree's leaves lie six deep on the start map: the loop
// ran for all six.
//
// The unlit surfaces go to a target of their own sharing the pass's depth
// (`albedoFor`); the pass stores sRGB bytes, so the combine takes each
// back to linear, multiplies, and encodes again into the pass, as the lit
// program did. The light is a quarter of the size each way: at the edge of
// a model it is filtered from its neighbours.
const HALF_LIGHT_SRGB = [
    "vec3 rrToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c)); }",
    "vec3 rrToSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c)); }"
].join("\n");
Reactor3D.HalfLight = {
    enabled: true,
    // A quarter each way: measured beside the full-size light, only the rim
    // of a model against a much brighter or darker ground tells them apart.
    SCALE: 0.25,
    _programs: {},
    _twinId: 1e9,

    /** Whether a material's colour is its picture times the light, so it can take the light afterwards. */
    deferrable(material) {
        if (!material || !material.__reactorLit || material.__reactorSelfLit || !material.visible) return false;
        // Foliage with a glowing tip adds its own colour over the light (reactor_3d_foliage.js).
        if (material.colorWrite === false || material.__reactorGhost || material.__reactorWater || material.__reactorGlowTip) return false;
        if (material.blending !== THREE.NormalBlending) return false;
        // Translucent surfaces that do not write depth sit over what is behind them.
        if (material.transparent && !material.depthWrite) return false;
        if (Reactor3D.shineOf(material)) return false;
        const blend = material.userData && material.userData.rrBlend;
        if (blend && blend.value && blend.value.w > 0) return false;
        return true;
    },

    /**
     * The same material without the light: a program of its own (a uniform
     * switch left the whole loop's cost in the program, measured), sharing
     * everything else by inheritance: its picture, colour, flags, version
     * (so it recompiles with the original), its per-material uniforms.
     */
    twin(material) {
        const known = material.__rrUnlitTwin;
        if (known && known.__rrTwinOf === material) return known;
        const twin = Object.create(material);
        Object.defineProperty(twin, "id", { value: this._twinId++ });
        // The original's version, read and written through: `needsUpdate` on
        // the twin (`this.version++`) would otherwise give it a version of its
        // own, and it would stop recompiling with the original.
        Object.defineProperty(twin, "version", { get() { return material.version; }, set(value) { material.version = value; } });
        twin.uuid = THREE.MathUtils.generateUUID();
        twin._listeners = {};
        twin.__rrTwinOf = material;
        twin.customProgramCacheKey = function() { return material.customProgramCacheKey.call(this) + "|unlit"; };
        twin.onBeforeCompile = function(shader, renderer) {
            material.onBeforeCompile.call(this, shader, renderer);
            shader.fragmentShader = shader.fragmentShader
                .replace("if (rrSelfLit < 1.0) diffuseColor.rgb *= mix(rrLight(vRRWorldPos), vec3(1.0), rrSelfLit);", "")
                .replace("vec3 rrLightTerm = mix(rrLight(vRRWorldPos), vec3(1.0), rrSelfLit);", "vec3 rrLightTerm = vec3(1.0);");
        };
        material.__rrUnlitTwin = twin;
        return twin;
    },

    /**
     * Before the pass's draw: the surfaces that will take the light
     * afterwards are drawn alone and unlit. Returns the split, or null to
     * draw the pass as it was.
     */
    begin(renderer, scene, target) {
        if (!this.enabled || !target || !target.depthTexture || target.samples > 0 || !scene || !scene.isScene) return null;
        if (!Reactor3D.LightVolume || !Reactor3D.LightVolume.supported(renderer)) return null;
        // The water's tint is laid over the lit colour: that map draws as before.
        const water = scene.userData && scene.userData.rrWater;
        if (water && water.length) return null;
        // Only materials shown now are hidden and shown again: one a pass hid
        // (setPass) must stay hidden when the rest of the pass is drawn.
        const deferred = new Set(), forward = new Set(), swapped = [], sentinel = Reactor3D.Shadows && Reactor3D.Shadows._sentinel;
        // A leaf with one material leaves the half it has no part in as a
        // whole object: three otherwise culled and updated it there only to
        // find its material hidden (both halves visit the whole scene).
        const leafForward = [], leafDeferred = [];
        const visit = object => {
            if (!object.visible) return;
            const material = object.material;
            if (material && object !== sentinel && !Array.isArray(material) && !object.children.length) {
                if (this.deferrable(material)) {
                    deferred.add(material);
                    swapped.push(object, material);
                    object.material = this.twin(material);
                    leafDeferred.push(object);
                } else if (material.visible) {
                    forward.add(material);
                    leafForward.push(object);
                }
                return;
            }
            if (material && object !== sentinel) {
                if (Array.isArray(material)) {
                    let twins = null;
                    for (let i = 0; i < material.length; i++) {
                        const m = material[i];
                        if (!m) continue;
                        if (this.deferrable(m)) { deferred.add(m); (twins || (twins = material.slice()))[i] = this.twin(m); }
                        else if (m.visible) forward.add(m);
                    }
                    if (twins) { swapped.push(object, material); object.material = twins; }
                } else if (this.deferrable(material)) {
                    deferred.add(material);
                    swapped.push(object, material);
                    object.material = this.twin(material);
                } else if (material.visible) forward.add(material);
            }
            const children = object.children;
            for (let i = 0; i < children.length; i++) visit(children[i]);
        };
        visit(scene);
        const split = { deferred, forward, swapped, sentinel, albedo: null, leafForward, leafDeferred };
        if (!deferred.size) { this.unswap(split); return null; }
        for (const m of forward) m.visible = false;
        for (const object of leafForward) object.visible = false;
        split.albedo = this.albedoFor(target);
        return split;
    },

    /**
     * Where the unlit surfaces are drawn: a target of the pass's size and
     * format sharing the pass's depth, so the combine writes the pass from
     * it (no copy of the pass) and the rest of the pass draws against the
     * depth it left. The caller draws into it (`Viewport.renderInto`).
     */
    albedoFor(target) {
        let albedo = this._albedo;
        if (!albedo || albedo.width !== target.width || albedo.height !== target.height || albedo.depthTexture !== target.depthTexture) {
            // The depth is the pass's to dispose, not this target's.
            if (albedo) { albedo.depthTexture = null; albedo.dispose(); }
            albedo = this._albedo = new THREE.WebGLRenderTarget(target.width, target.height, {
                depthBuffer: true, stencilBuffer: false, depthTexture: target.depthTexture,
                colorSpace: THREE.SRGBColorSpace, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, generateMipmaps: false
            });
            // Encoded in the shader and stored as bytes, as the pass is (Viewport.createTarget).
            albedo.isXRRenderTarget = true;
            albedo.texture.internalFormat = "RGBA8";
        }
        return albedo;
    },

    unswap(split) {
        const list = split.swapped;
        for (let i = 0; i < list.length; i += 2) list[i].material = list[i + 1];
        list.length = 0;
    },

    /** After the unlit draw: the light, the combine, then the rest of the pass. */
    finish(renderer, scene, target, camera, split) {
        this.unswap(split);
        for (const m of split.forward) m.visible = true;
        for (const object of split.leafForward) object.visible = true;
        const w = Math.max(1, Math.ceil(target.width * this.SCALE)), h = Math.max(1, Math.ceil(target.height * this.SCALE));
        let light = this._target;
        if (!light || light.width !== w || light.height !== h) {
            if (light) light.dispose();
            light = this._target = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
                minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
        }
        const pass = this.program(renderer);
        const autoClear = renderer.autoClear;
        try {
            renderer.autoClear = false;
            const pu = pass.material.uniforms;
            pu.rrLightDepth.value = target.depthTexture;
            pu.rrLightInvViewProj.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse);
            pu.rrLightStep.value.set(target.width / w, target.height / h);
            pu.rrLightView.value.copy(camera.matrixWorldInverse);
            // The light faces each surface toward the eye (the volume's step
            // off the face reads cameraPosition): the full-screen camera
            // stands where the pass's does, or every face turned toward the
            // world's origin and read the volume from its far side.
            camera.getWorldPosition(pass.camera.position);
            renderer.setRenderTarget(light);
            renderer.render(pass.scene, pass.camera);
            split.light = light;
            // Every pixel of the pass written: the unlit colour, lit. Matched
            // to the surfaces the light falls on, the pass's depth is read,
            // so the colour is written through a target without it.
            const view = this.matchSurfaces ? Reactor3D.colourOnly(renderer, target) : null;
            if (view) {
                const up = this.upsampleProgram(renderer), uu = up.material.uniforms;
                uu.unlit.value = split.albedo.texture;
                uu.light.value = light.texture;
                uu.rrLightDepth.value = target.depthTexture;
                uu.rrLightInvViewProj.value.copy(pu.rrLightInvViewProj.value);
                uu.rrLightStep.value.copy(pu.rrLightStep.value);
                uu.rrLightView.value.copy(pu.rrLightView.value);
                // The view distance from a depth: the z and w rows of the inverse projection.
                const pi = camera.projectionMatrixInverse.elements;
                uu.rrLightZ.value.set(pi[10], pi[14], pi[11], pi[15]);
                uu.rrSameSurface.value = this.SAME_SURFACE;
                uu.rrExactBelow.value = this.EXACT_BELOW;
                uu.rrPlainSpread.value = this.PLAIN_SPREAD;
                uu.rrPlainBend.value = this.PLAIN_BEND;
                up.camera.position.copy(pass.camera.position);
                renderer.setRenderTarget(view);
                renderer.render(up.scene, up.camera);
                renderer.setRenderTarget(target);
            } else {
                renderer.setRenderTarget(target);
                const combine = this.combineQuad();
                combine.material.uniforms.unlit.value = split.albedo.texture;
                combine.material.uniforms.light.value = light.texture;
                renderer.render(combine.scene, combine.camera);
            }
            // Everything else, lit as it always was, over the lit surfaces.
            for (const m of split.deferred) m.visible = false;
            for (const object of split.leafDeferred) object.visible = false;
            const sentinelMaterial = split.sentinel && split.sentinel.material;
            if (sentinelMaterial) sentinelMaterial.visible = false;
            // A background colour makes three clear the target whatever
            // autoClear says (the editor's view has one): it was drawn with
            // the unlit surfaces already.
            const background = scene.background;
            scene.background = null;
            try { Reactor3D.renderScene(renderer, scene, camera); }
            finally { if (sentinelMaterial) sentinelMaterial.visible = true; scene.background = background; }
        } finally {
            renderer.autoClear = autoClear;
        }
    },

    restore(split) {
        this.unswap(split);
        for (const m of split.forward) m.visible = true;
        for (const m of split.deferred) m.visible = true;
        for (const object of split.leafForward) object.visible = true;
        for (const object of split.leafDeferred) object.visible = true;
        if (split.sentinel && split.sentinel.material) split.sentinel.material.visible = true;
    },

    /** The light's GLSL and uniforms for a full-screen program: shadows as the renderer has them, the light at any pixel of the pass. */
    _lightKey(renderer) {
        const S = Reactor3D.Shadows;
        return S && S.appliesTo(renderer) ? "s" + S.quality().taps : "n";
    },

    _lightSource(renderer) {
        const key = this._lightKey(renderer), shadows = key !== "n", taps = shadows ? Number(key.slice(1)) : 0;
        // The face a point lies on comes from the full-size depth around it:
        // derivatives across a half-size grid step over leaves and edges.
        const glsl = Reactor3D.LightGrid.glsl(shadows ? Reactor3D.lightGlsl(true, taps) : Reactor3D.LIGHT_GLSL)
            .replace("varying vec3 vRRWorldPos;", "vec3 rrPassNormal;")
            .replace("vec3 rrVN = cross(dFdx(p), dFdy(p));", "vec3 rrVN = rrPassNormal;") + "\n" + [
            "uniform highp sampler2D rrLightDepth;",
            "uniform mat4 rrLightInvViewProj;",
            "uniform vec2 rrLightStep;",
            "uniform mat4 rrLightView;",
            "vec3 rrLightWorld(ivec2 texel, ivec2 size) {",
            "\tvec2 uv = (vec2(texel) + 0.5) / vec2(size);",
            "\tvec4 world = rrLightInvViewProj * vec4(uv * 2.0 - 1.0, texelFetch(rrLightDepth, texel, 0).r * 2.0 - 1.0, 1.0);",
            "\treturn world.xyz / world.w;",
            "}",
            // Each way, the step to the nearer neighbour: the one on the same surface.
            "vec3 rrLightStepTo(vec3 p, ivec2 a, ivec2 b, ivec2 size) {",
            "\tvec3 pa = rrLightWorld(clamp(a, ivec2(0), size - 1), size) - p;",
            "\tvec3 pb = p - rrLightWorld(clamp(b, ivec2(0), size - 1), size);",
            "\treturn dot(pa, pa) < dot(pb, pb) ? pa : pb;",
            "}",
            // The light at one pixel of the pass, standing at p.
            "vec3 rrLightAtTexel(vec3 p, ivec2 texel, ivec2 size) {",
            "\trrPassNormal = cross(rrLightStepTo(p, texel + ivec2(1, 0), texel - ivec2(1, 0), size), rrLightStepTo(p, texel + ivec2(0, 1), texel - ivec2(0, 1), size));",
            "\treturn max(rrLight(p), vec3(0.0));",
            "}"
        ].join("\n");
        Reactor3D.LightGrid.ensure(Reactor3D.lightUniforms());
        if (Reactor3D.LightVolume) Reactor3D.LightVolume.uniforms();
        const uniforms = {};
        const shared = Reactor3D.lightUniforms();
        for (const name of Object.keys(shared)) uniforms[name] = shared[name];
        uniforms.rrSelfLit = { value: 0 };
        uniforms.rrLightDepth = { value: null };
        uniforms.rrLightInvViewProj = { value: new THREE.Matrix4() };
        uniforms.rrLightStep = { value: new THREE.Vector2(2, 2) };
        uniforms.rrLightView = { value: new THREE.Matrix4() };
        return { key, glsl, uniforms };
    },

    _fullScreen(material) {
        const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
        mesh.frustumCulled = false;
        const scene = new THREE.Scene();
        scene.add(mesh);
        return { material, scene, camera: new THREE.Camera() };
    },

    /** The light at half size: each texel's world point from the pass's depth, lit as a surface there would be. */
    program(renderer) {
        const cached = this._programs[this._lightKey(renderer)];
        if (cached) return cached;
        const source = this._lightSource(renderer);
        const material = new THREE.ShaderMaterial({
            uniforms: source.uniforms,
            vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
            fragmentShader: source.glsl + "\n" + [
                "void main() {",
                // One of the pixels this texel covers, and where it stands.
                "\tivec2 size = textureSize(rrLightDepth, 0);",
                "\tivec2 texel = min(ivec2(floor(gl_FragCoord.xy * rrLightStep)), size - 1);",
                "\tfloat depth = texelFetch(rrLightDepth, texel, 0).r;",
                // Nothing drawn here: the combine leaves the pixel as it is.
                "\tif (depth >= 1.0) { gl_FragColor = vec4(1.0, 1.0, 1.0, 60000.0); return; }",
                "\tvec3 p = rrLightWorld(texel, size);",
                // Alpha: the distance from the eye, for the combine and the haze (Reactor3D.HalfHaze).
                "\tgl_FragColor = vec4(rrLightAtTexel(p, texel, size), -(rrLightView * vec4(p, 1.0)).z);",
                "}"
            ].join("\n"),
            depthTest: false, depthWrite: false, blending: THREE.NoBlending
        });
        return (this._programs[source.key] = this._fullScreen(material));
    },

    /**
     * How near, as a fraction of a pixel's distance from the eye, a sample
     * of the small light must stand to the pixel's surface carried on to
     * where the sample was taken, to light it. Across a silhouette the
     * samples behind belong to another surface; filtered in plainly, they
     * left a blocky rim of the ground's light on every model.
     */
    SAME_SURFACE: 0.01,
    /** Off: the small light filtered up plainly, one full-size pass fewer, a blocky rim of the ground's light on models. */
    matchSurfaces: true,
    /** Below this match no sample stands on the pixel's surface: its light is worked out at full size. */
    EXACT_BELOW: 0.3,
    /**
     * Four samples whose distances differ by less than this fraction, and
     * lie in a plane within PLAIN_BEND, are one surface: the pixels between
     * them take the light plainly filtered and skip reading the depth (most
     * of the frame). Zero sends every pixel through the match.
     */
    PLAIN_SPREAD: 0.02,
    PLAIN_BEND: 0.002,

    /**
     * The light at full size, filtered up from the four nearest samples
     * that stand on the pixel's own surface (each sample keeps its distance
     * from the eye in alpha); where none does (the rim of a model, a thin
     * part) the pixel is lit at full size, as the lit program would. A
     * target of its own: the pass's depth is read here, and the pass itself
     * holds that depth.
     */
    upsampleProgram(renderer) {
        const known = this._upsamples || (this._upsamples = {});
        const exact = this.exactEdges !== false, key = this._lightKey(renderer) + (exact ? "" : "-x");
        const cached = known[key];
        if (cached) return cached;
        const source = this._lightSource(renderer);
        const uniforms = source.uniforms;
        uniforms.unlit = { value: null };
        uniforms.light = { value: null };
        uniforms.rrLightZ = { value: new THREE.Vector4() };
        uniforms.rrSameSurface = { value: this.SAME_SURFACE };
        uniforms.rrExactBelow = { value: this.EXACT_BELOW };
        uniforms.rrPlainSpread = { value: this.PLAIN_SPREAD };
        uniforms.rrPlainBend = { value: this.PLAIN_BEND };
        const material = new THREE.ShaderMaterial({
            uniforms,
            vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
            fragmentShader: source.glsl + "\n" + [
                "uniform sampler2D unlit;",
                "uniform highp sampler2D light;",
                "uniform float rrSameSurface;",
                "uniform float rrExactBelow;",
                "uniform vec4 rrLightZ;",
                "uniform float rrPlainSpread;",
                "uniform float rrPlainBend;",
                HALF_LIGHT_SRGB,
                // The unlit colour (sRGB bytes) back to linear, times the light, encoded again: the lit program's arithmetic, in its order.
                "vec4 rrLit(ivec2 px, vec3 l) { vec4 s = texelFetch(unlit, px, 0); return vec4(rrToSrgb(clamp(rrToLinear(s.rgb) * l, 0.0, 1.0)), s.a); }",
                // A pixel's distance from the eye, from the depth alone.
                "float rrDist(ivec2 t, ivec2 size) { float z = texelFetch(rrLightDepth, clamp(t, ivec2(0), size - 1), 0).r * 2.0 - 1.0; return -(rrLightZ.x * z + rrLightZ.y) / (rrLightZ.z * z + rrLightZ.w); }",
                // Each way, the change of distance per pixel toward the nearer neighbour: the pixel's own surface.
                "float rrSlope(float d, float a, float b) { return abs(a - d) < abs(d - b) ? a - d : d - b; }",
                "void main() {",
                "\tivec2 px = ivec2(gl_FragCoord.xy);",
                // Light texel i was taken at pixel floor((i + 0.5) * step).
                "\tivec2 top = textureSize(light, 0) - 1;",
                "\tvec2 at = vec2(px) / rrLightStep - 0.5, base = floor(at), f = at - base;",
                "\tivec2 b = ivec2(base);",
                "\tivec2 i0 = clamp(b, ivec2(0), top), i1 = clamp(b + ivec2(1, 0), ivec2(0), top), i2 = clamp(b + ivec2(0, 1), ivec2(0), top), i3 = clamp(b + ivec2(1, 1), ivec2(0), top);",
                "\tvec4 a = texelFetch(light, i0, 0), c = texelFetch(light, i1, 0), e = texelFetch(light, i2, 0), g = texelFetch(light, i3, 0);",
                "\tvec4 bilinear = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);",
                // The four samples on one flat surface (close together, and in a plane): the pixel between them
                // is on it too, bar something thinner than their spacing. Filtered plainly, the depth unread.
                "\tvec4 dist = vec4(a.a, c.a, e.a, g.a);",
                "\tfloat lo = min(min(dist.x, dist.y), min(dist.z, dist.w)), hi = max(max(dist.x, dist.y), max(dist.z, dist.w));",
                "\tif (hi - lo < lo * rrPlainSpread && abs(dist.x + dist.w - dist.y - dist.z) < lo * rrPlainBend) {",
                "\t\tgl_FragColor = rrLit(px, a.rgb * bilinear.x + c.rgb * bilinear.y + e.rgb * bilinear.z + g.rgb * bilinear.w);",
                "\t\treturn;",
                "\t}",
                "\tivec2 size = textureSize(rrLightDepth, 0);",
                "\tif (texelFetch(rrLightDepth, px, 0).r >= 1.0) { gl_FragColor = rrLit(px, vec3(1.0)); return; }",
                "\tfloat d = rrDist(px, size);",
                "\tvec2 slope = vec2(rrSlope(d, rrDist(px + ivec2(1, 0), size), rrDist(px - ivec2(1, 0), size)), rrSlope(d, rrDist(px + ivec2(0, 1), size), rrDist(px - ivec2(0, 1), size)));",
                // Where the pixel's surface would stand at each sample: a sample nowhere near it lies on something else.
                "\tvec2 o0 = floor((vec2(i0) + 0.5) * rrLightStep) - vec2(px), o1 = floor((vec2(i1) + 0.5) * rrLightStep) - vec2(px);",
                "\tvec2 o2 = floor((vec2(i2) + 0.5) * rrLightStep) - vec2(px), o3 = floor((vec2(i3) + 0.5) * rrLightStep) - vec2(px);",
                "\tvec4 r = (dist - (d + vec4(dot(slope, o0), dot(slope, o1), dot(slope, o2), dot(slope, o3)))) / (d * rrSameSurface);",
                "\tvec4 same = max(exp(-r * r), 1e-5);",
                // No sample on the pixel's surface (the rim of a model, a thin part): lit at full size.
                "\tif (max(max(same.x, same.y), max(same.z, same.w)) < rrExactBelow) { gl_FragColor = rrLit(px, " + (exact ? "rrLightAtTexel(rrLightWorld(px, size), px, size)" : "vec3(1.0, 0.0, 1.0)") + "); return; }",
                "\tvec4 w = (bilinear + 0.001) * same;",
                "\tgl_FragColor = rrLit(px, (a.rgb * w.x + c.rgb * w.y + e.rgb * w.z + g.rgb * w.w) / (w.x + w.y + w.z + w.w));",
                "}"
            ].join("\n"),
            depthTest: false, depthWrite: false, blending: THREE.NoBlending
        });
        return (known[key] = this._fullScreen(material));
    },

    /**
     * The combine: each unlit pixel (sRGB bytes, as the pass stores them)
     * back to linear, times the full-size light, and encoded again; its
     * alpha as it was. The same arithmetic as the lit program's, in its order.
     */
    combineQuad() {
        if (this._combine) return this._combine;
        const material = new THREE.ShaderMaterial({
            uniforms: { unlit: { value: null }, light: { value: null } },
            vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
            fragmentShader: [
                "uniform sampler2D unlit;",
                "uniform sampler2D light;",
                HALF_LIGHT_SRGB,
                "void main() {",
                "\tivec2 px = ivec2(gl_FragCoord.xy);",
                "\tvec4 s = texelFetch(unlit, px, 0);",
                "\tvec3 l = texture2D(light, gl_FragCoord.xy / vec2(textureSize(unlit, 0))).rgb;",
                "\tgl_FragColor = vec4(rrToSrgb(clamp(rrToLinear(s.rgb) * l, 0.0, 1.0)), s.a);",
                "}"
            ].join("\n"),
            depthTest: false, depthWrite: false, blending: THREE.NoBlending
        });
        return (this._combine = this._fullScreen(material));
    }
};

Reactor3D.Lighting = { file: "reactor_3d_lighting.js" };
})(typeof globalThis !== "undefined" ? globalThis : this);
