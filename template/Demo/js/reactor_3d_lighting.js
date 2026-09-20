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
    size: [16, 8, 16],
    step: 4,
    ensure(uniforms) {
        if (!uniforms.rrLightGrid) {
            uniforms.rrLightGrid = { value: null };
            uniforms.rrLightGridEnabled = { value: 0 };
            uniforms.rrLightGridOrigin = { value: new Float32Array(3) };
        }
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
            const y0 = Math.max(0, Math.floor((y - radius - origin[1]) / step));
            const y1 = Math.min(ny - 1, Math.floor((y + radius - origin[1]) / step));
            const z0 = Math.max(0, Math.floor((z - radius - origin[2]) / step));
            const z1 = Math.min(nz - 1, Math.floor((z + radius - origin[2]) / step));
            const kind = color[a + 3], ax = aim[a], ay = aim[a + 1], az = aim[a + 2];
            const length = Math.hypot(ax, ay, az);
            const shaped = kind > 0.5 && Math.abs(length - 1) < 0.0001;
            const cosine = aim[a + 3] / length;
            const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
            for (let iz = z0; iz <= z1; iz++) {
                const dz = origin[2] + (iz + 0.5) * step - z;
                const bz = Math.max(Math.abs(dz) - half, 0);
                for (let iy = y0; iy <= y1; iy++) {
                    const dy = origin[1] + (iy + 0.5) * step - y;
                    const by = Math.max(Math.abs(dy) - half, 0), yz2 = by * by + bz * bz;
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
    },
    glsl(source) {
        return "uniform highp usampler3D rrLightGrid;\nuniform int rrLightGridEnabled;\nuniform vec3 rrLightGridOrigin;\n" + source
            .replace("vec3 sum = rrAmbient;", "vec3 sum = rrAmbient;\n"
                + "\tivec3 cell = ivec3(floor((p - rrLightGridOrigin) * 0.25));\n"
                + "\tbool grid = rrLightGridEnabled != 0 && all(greaterThanEqual(cell, ivec3(0))) && all(lessThan(cell, ivec3(16, 8, 16)));\n"
                + "\tuint mask = grid ? texelFetch(rrLightGrid, cell, 0).r : 0u;\n")
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
};


Reactor3D.lightUniforms = function() {
    if (this._lightUniforms) return this._lightUniforms;
    const n = this.SHADER_LIGHTS;
    this._lightUniforms = {
        rrLightCount: { value: 0 },
        rrLightPos: { value: new Float32Array(n * 4) },     // x, y, z, reach
        rrLightColor: { value: new Float32Array(n * 4) },   // r, g, b (× intensity × gain), spot flag
        rrLightAim: { value: new Float32Array(n * 4) },     // aim x, y, z, cos(half angle)
        rrAmbient: { value: new Float32Array([1, 1, 1]) },
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
        "float rrAtlasShadow(sampler2DShadow atlas, float rowScale, float row, vec3 d, vec4 info) {",
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
        "\tvec2 base = vec2(face * rrShadowGrid.x, row * rowScale);",
        "\tvec2 scale = vec2(rrShadowGrid.x, rowScale);",
        // A tap never leaves its face: the filter's footprint would read the
        // neighbouring face's depth as this one's.
        "\tfloat pad = rrShadowGrid.w;",
        "#if RR_SHADOW_TAPS > 1",
        "\tfloat phi = rrShadowNoise(gl_FragCoord.xy) * 6.283185307179586;",
        "\tfloat s = 0.0;",
        "\tfor (int i = 0; i < 5; i++) {",
        "\t\tvec2 q = clamp(uv + rrShadowTap(i, phi) * info.w, pad, 1.0 - pad);",
        "\t\ts += texture(atlas, vec3(base + q * scale, dp));",
        "\t}",
        "\treturn s * 0.2;",
        "#else",
        "\treturn texture(atlas, vec3(base + clamp(uv, pad, 1.0 - pad) * scale, dp));",
        "#endif",
        "}",
        "float rrShadowAt(int slot, vec3 p) {",
        "\tvec4 info = rrShadowInfo[slot];",
        "\tvec3 d = p - rrShadowPos[slot].xyz;",
        "\tfloat s = rrAtlasShadow(rrShadowAtlas, rrShadowGrid.y, float(slot), d, info);",
        "\tif (info.z >= 0.0) s = min(s, rrAtlasShadow(rrShadowDynAtlas, rrShadowGrid.z, info.z, d, info));",
        "\treturn s;",
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
        "uniform float rrSelfLit;",
        "varying vec3 vRRWorldPos;",
        "vec3 rrLight(vec3 p) {",
        "\tvec3 sum = rrAmbient;",
        "\tfor (int i = 0; i < " + this.SHADER_LIGHTS + "; i++) {",
        "\t\tif (i >= rrLightCount) break;",
        "\t\tvec4 lp = rrLightPos[i];",
        "\t\tvec3 d = p - lp.xyz;",
        // Outside the enclosing cube the spherical falloff is already zero.
        // Reject there before length/division; retain the exact falloff inside.
        "\t\tif (max(max(abs(d.x), abs(d.y)), abs(d.z)) >= max(lp.w, 0.001)) continue;",
        "\t\tfloat dist = length(d);",
        // The same falloff the flat pool's picture carries: (1 - d/r)^2.
        "\t\tfloat fall = 1.0 - dist / max(lp.w, 0.001);",
        "\t\tif (fall <= 0.0) continue;",
        "\t\tfall *= fall;",
        "\t\tvec4 lc = rrLightColor[i];",
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
 */
Reactor3D.packLightUniforms = function(lights, ambient, uniforms = this.lightUniforms()) {
    if (uniforms.rrLightGridEnabled) uniforms.rrLightGridEnabled.value = 0;
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
        col[at + 3] = beam ? 2 : spot ? 1 : 0;
        aim[at] = ax; aim[at + 1] = ay; aim[at + 2] = az; aim[at + 3] = shape;
        count++;
    }
    uniforms.rrLightCount.value = count;
    return count;
};

Reactor3D.injectLightShader = function(shader, renderer) {
    const uniforms = this.lightUniforms();
    this.LightGrid.ensure(uniforms);
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
    shader.fragmentShader = this.LightGrid.glsl(shadows ? this.lightGlsl(true, this.Shadows.quality().taps) : this.LIGHT_GLSL)
        + shader.fragmentShader.replace(
            "vec4 diffuseColor = vec4( diffuse, opacity );",
            "vec4 diffuseColor = vec4( diffuse * mix(rrLight(vRRWorldPos), vec3(1.0), rrSelfLit), opacity );"
        );
};

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
            rrCutRadius: { value: 0 },
            // The footprint the top cut reaches: x0, z0, x1, z1 in world tiles.
            rrCutBox: { value: [0, 0, 0, 0] },
            // Half the width of the see-through corridor: the party's own width and a little.
            rrGhostWidth: { value: Reactor3D.GHOST_WIDTH }
        };
    }
    return this._cutawayUniforms;
};

/**
 * Half the width of the see-through corridor at the party: the body and a
 * little. The corridor narrows to nothing at the camera, so it holds only
 * what the party is hidden behind; a wall beside the line, however near
 * the party, is not in it.
 */
Reactor3D.GHOST_WIDTH = 0.6;

Reactor3D.injectCutaway = function(material, shader) {
    // Pieces take both cuts; a placed model (a tree in front of the door)
    // only thins in the sight line, since it has no storey to cut above.
    if (!material || !shader || !(material.__reactorPieces || material.__reactorModel) || shader.fragmentShader.indexOf("vRRWorldPos") < 0) return;
    const shared = this.cutawayUniforms();
    for (const name of Object.keys(shared)) shader.uniforms[name] = shared[name];
    if (shader.fragmentShader.indexOf("uniform float rrCutTop;") >= 0) return;
    shader.uniforms.rrGhost = { value: material.__reactorGhost ? 1 : 0 };
    shader.fragmentShader = "uniform float rrCutTop;\nuniform vec3 rrCutEye;\nuniform vec3 rrCutFocus;\nuniform float rrCutRadius;\nuniform vec4 rrCutBox;\nuniform float rrGhost;\nuniform float rrGhostWidth;\n" + shader.fragmentShader.replace(
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
            material.__reactorPieces ? [
                "bool rrInWay = false;",
                "if (rrCutRadius > 0.0 && vRRWorldPos.y > rrCutFocus.y - 1.4) {",
                "\tvec2 rrSight2 = rrCutFocus.xz - rrCutEye.xz;",
                "\tfloat rrSight2Length = length(rrSight2);",
                "\tif (rrSight2Length > 0.001) {",
                "\t\tvec2 rrSight2Dir = rrSight2 / rrSight2Length;",
                "\t\tvec2 rrToHere2 = vRRWorldPos.xz - rrCutEye.xz;",
                "\t\tfloat rrAlong2 = dot(rrToHere2, rrSight2Dir);",
                "\t\tif (rrAlong2 > 0.0 && rrAlong2 < rrSight2Length - 0.3) {",
                "\t\t\tfloat rrOff2 = length(rrToHere2 - rrSight2Dir * rrAlong2);",
                "\t\t\tfloat rrLineY = rrCutEye.y + (rrCutFocus.y - rrCutEye.y) * (rrAlong2 / rrSight2Length);",
                "\t\t\trrInWay = rrOff2 < rrGhostWidth * (rrAlong2 / rrSight2Length) && rrLineY - 1.0 < rrCutFocus.y + 3.5;",
                "\t\t}",
                "\t}",
                "}",
                "if (rrGhost > 0.5) { if (!rrInWay) discard; } else if (rrInWay) discard;"
            ].join("\n\t") : "",
            "if (rrCutRadius > 0.0 && vRRWorldPos.y > rrCutFocus.y - 1.2) {",
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
    const cover = stack.find(piece => piece.z >= head - 1e-6 && piece.kind !== "doorway");
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
Reactor3D.MapScene.prototype.updateCutaway = function(camera, mapData, character) {
    const shared = Reactor3D.cutawayUniforms();
    if (!camera || !mapData || !character || !Reactor3D.hasPieces(mapData)) {
        shared.rrCutTop.value = 1e9;
        shared.rrCutRadius.value = 0;
        if (this._cutLook) this.setCutLook(false);
        return;
    }
    const x = (Number.isFinite(character._realX) ? character._realX : character.x || 0) + 0.5;
    const z = (Number.isFinite(character._realY) ? character._realY : character.y || 0) + 0.5;
    const ground = Reactor3D.characterGround(mapData, character);
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
    shared.rrCutRadius.value = Reactor3D.CUTAWAY_RADIUS;
};
Reactor3D.MapScene.prototype.setCutLook = function(on) {
    for (const ghost of this._pieceGhosts || []) ghost.visible = on;
    this._cutLook = on;
};

/**
 * Whether a world point is inside a piece's solid: a wall, block, window,
 * pillar, fence or roof volume on its cell (floors and doorways are open,
 * a stair or ramp counts under its slope). Pieces the cutaway has removed
 * (above `cut.top` inside `cut.box`) are not solid: the camera may sit
 * where a roof was.
 */
Reactor3D.pieceSolidAt = function(mapData, wx, wy, wz, cut) {
    const index = this.pieceIndex(mapData);
    if (!index) return false;
    const x = Math.floor(wx), y = Math.floor(wz);
    const stack = index.cells.get(y * 65536 + x);
    if (!stack) return false;
    if (cut && wy > cut.top && wx >= cut.box[0] && wz >= cut.box[1] && wx <= cut.box[2] && wz <= cut.box[3]) return false;
    const base = this.pieceBaseAt(mapData, x, y);
    const h = wy - base;
    const u = wx - x, v = wz - y;
    for (const piece of stack) {
        if (piece.kind === "floor" || piece.kind === "doorway") continue;
        if (h < piece.z || h > piece.z + this.pieceHeight(piece.kind)) continue;
        if (piece.kind === "stair" || piece.kind === "ramp") { if (h > this.pieceTop(piece, u, v)) continue; }
        return true;
    }
    return false;
};

/**
 * Keep a camera out of the walls. A wall *between* the camera and the
 * player is left alone: the sight-line fade sees through it, and a camera
 * shoved in against every interior wall was a close-up of the player's
 * back. Only a camera that would stand *inside* a solid piece moves: it
 * comes in along its own line of sight until it is out of that solid,
 * plus a margin. Nothing happens on a map without pieces.
 */
Reactor3D.clearCameraPath = function(camera, focus, mapData) {
    if (!camera || !focus || !mapData || !this.hasPieces(mapData)) return false;
    const shared = this._cutawayUniforms;
    const cut = shared && shared.rrCutRadius.value > 0 ? { top: shared.rrCutTop.value, box: shared.rrCutBox.value } : null;
    const to = camera.position;
    if (!this.pieceSolidAt(mapData, to.x, to.y, to.z, cut)) return false;
    const from = focus;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const length = Math.hypot(dx, dy, dz);
    if (length < 0.5) return false;
    const step = 0.2;
    let free = 0.5;
    for (let d = length - step; d >= 0.5; d -= step) {
        const t = d / length;
        if (!this.pieceSolidAt(mapData, from.x + dx * t, from.y + dy * t, from.z + dz * t, cut)) { free = Math.max(0.5, d - 0.3); break; }
    }
    const t = free / length;
    camera.position.set(from.x + dx * t, from.y + dy * t, from.z + dz * t);
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

Reactor3D.litMaterial = function(material) {
    if (!material || material.__reactorLit) return material;
    material.__reactorLit = true;
    const earlier = material.onBeforeCompile;
    material.onBeforeCompile = function(shader, renderer) {
        if (typeof earlier === "function") earlier.call(this, shader, renderer);
        Reactor3D.injectLightShader(shader, renderer);
        // A self-lit material (a Glow) ignores the lights: its own uniform, one per material.
        shader.uniforms.rrSelfLit = { value: this.__reactorSelfLit ? 1 : 0 };
        Reactor3D.injectBlendColor(this, shader);
        Reactor3D.injectDissolve(this, shader);
        Reactor3D.injectCutaway(this, shader);
    };
    const earlierKey = material.customProgramCacheKey;
    material.customProgramCacheKey = function() {
        return (typeof earlierKey === "function" ? earlierKey.call(this) : "") + "|reactor3d-lit" + (this.__reactorPieces ? "|cutaway" : this.__reactorModel ? "|sightline" : "") + (this.__reactorGhost ? "|ghost" : "")
            + (Reactor3D.Shadows.active() ? "|shadows" + Reactor3D.Shadows.quality().taps : "");
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
Reactor3D.WEAK_AMD_PATTERN = /\bRadeon(?:\s*\(TM\))?(?:\s+(?:RX\s+)?Vega\s*\d*)?\s+Graphics\b|\bVega\s*\d+\s+Graphics\b|\bAMD Custom GPU\b|\bRadeon\(TM\)\s+R[2-7]\b/i;

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
Reactor3D.SHADOW_LAYER_STATIC = 1;
Reactor3D.SHADOW_LAYER_DYNAMIC = 2;
/** Bumped by every distance-level swap, so a cached map follows the geometry. */
Reactor3D._lodSwaps = 0;

/** Whether this map wants shadows at all: the engine switch, the mode, the sidecar. */
Reactor3D.shadowsWanted = function(mapData) {
    if (this.SHADOWS === "off") return false;
    if (this.lightModeFor(mapData) !== "volume") return false;
    const map = mapData || (typeof $dataMap !== "undefined" ? $dataMap : null);
    const lighting = map && map.reactor3d && map.reactor3d.lighting;
    if (lighting && lighting.shadows === false) return false;
    return true;
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

    /** Every lit program recompiles into the other variant. */
    refreshMaterials(scene) {
        if (!scene) return;
        scene.traverse(object => {
            const mats = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
            for (const mat of mats) if (mat && mat.__reactorLit) mat.needsUpdate = true;
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
        const all = this._generation !== this._seenGeneration || Reactor3D._lodSwaps !== this._seenLodSwaps;
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
    _casterTriangles(root) {
        const data = root.userData || (root.userData = {});
        if (data.rrShadowTris !== undefined && data.rrShadowTrisAt === Reactor3D._lodSwaps) return data.rrShadowTris;
        let total = 0;
        root.traverse(child => {
            if (!child.isMesh || !child.geometry) return;
            const geometry = child.geometry;
            const index = geometry.index;
            const position = geometry.attributes && geometry.attributes.position;
            const count = index ? index.count : (position ? position.count : 0);
            total += count / 3;
        });
        data.rrShadowTris = total;
        data.rrShadowTrisAt = Reactor3D._lodSwaps;
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
            ranked.push({ root, gap: (dx * dx + dy * dy + dz * dz) * bias });
        }
        ranked.sort((a, b) => a.gap - b.gap);

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
            const tris = this._casterTriangles(entry.root);
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
    render(renderer, scene, mapData) {
        if (typeof THREE === "undefined" || !renderer || !scene || typeof renderer.setRenderTarget !== "function") return;
        const uniforms = Reactor3D.lightUniforms();
        const want = Reactor3D.shadowsWanted(mapData);
        if (!want) {
            if (this._active) {
                this._active = false;
                uniforms.rrLightShadow.value.fill(-1);
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
        const focus = this._focusPoint(scene);
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
        const shadowOf = uniforms.rrLightShadow.value;
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
        try {
            this._renderFaces(renderer, scene, target, size, row, origin, camera, mask);
        } finally {
            if (hide) hide.visible = true;
        }
    },

    rowClearEnabled: true,
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
            renderer.render(scene, camera);
        }
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
            renderer.render(scene, camera);
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
    const key = ($gameMap._mapId || 0) + ":" + width + "x" + height;
    if (this._lightSolid && this._lightSolid.key === key) return this._lightSolid;
    const room = this.roomFor(map);
    const grid = new Uint8Array(width * height);
    if (room) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                if (!$gameMap.allTiles(x, y).some(tile => tile > 0)) grid[y * width + x] = 1;
            }
        }
    }
    this._lightSolid = { key, width, height, grid, room: !!room, roomHeight: room && room.height > 0 ? room.height : 25 };
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
                : entry.type === "beam" ? this.LIGHT_BEAM : this.LIGHT_POINT,
            x: number(entry.x, 0, -10000, 10000),
            y: number(entry.y, 0, -10000, 10000),
            height: number(entry.height, 0, 0, 512),
            yaw: number(entry.yaw, 0, -100000, 100000),
            // Degrees above level: a spot on a ceiling aims down at -90.
            pitch: number(entry.pitch, 0, -90, 90),
            radius: number(entry.radius,
                entry.type === "spot" ? this.DEFAULT_CONE_LENGTH
                    : entry.type === "beam" ? this.DEFAULT_BEAM_LENGTH : 3, 0.1, 200),
            angle: number(entry.angle, this.DEFAULT_CONE_ANGLE, 1, 179),
            // A beam's thickness in tiles; a cone and a sphere carry it unused.
            width: number(entry.width, this.DEFAULT_BEAM_WIDTH, 0.005, 5),
            color: this.parseColour(entry.color !== undefined ? entry.color : entry.colour),
            intensity: number(entry.intensity, 1, 0, 4),
            occlude: entry.occlude !== false,
            shadow: entry.shadow !== false,
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
        const animated = this.animateLight(light, frame, i, radius, intensity);
        radius = animated.radius;
        intensity = animated.intensity;
        out.push({
            id: light.id, type: light.type, x: x, y: y, height: height,
            radius: radius, colour: colour, intensity: intensity,
            priorityRadius: animated.priorityRadius, priorityIntensity: animated.priorityIntensity,
            angle: angle, width: width, yaw: -(yaw + facing), pitch: pitch, occlude: light.occlude,
            shadow: light.shadow, body: light.body
        });
    }
    return out;
};

Reactor3D.Lighting = { file: "reactor_3d_lighting.js" };
})(typeof globalThis !== "undefined" ? globalThis : this);
