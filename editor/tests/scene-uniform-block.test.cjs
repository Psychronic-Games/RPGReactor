/**
 * The scene's values in one uniform block (Reactor3D.SceneUniformBlock).
 *
 * The GLSL cannot be compiled here, so what can go wrong on the CPU side is
 * held instead: the std140 layout packed here against the block's own
 * declaration (worked out again from the rules, independently), the loose
 * declarations it replaces against the block's types, every value packed
 * where the layout says, a buffer sent only where it changed, a program
 * bound before its first draw, and nothing at all while it is off.
 */
const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
require(path.join(root, 'runtime', 'libs', 'three.js'));
const R = require(path.join(root, 'runtime', 'reactor_3d.js'));
const THREE = global.THREE;
const B = R.SceneUniformBlock;

const SAMPLER = /sampler/;

/** std140 from the rules, in bytes, for `highp TYPE NAME[N];` lines: written apart from the runtime's own. */
function std140(glsl) {
    const body = /uniform\s+RRScene\s*\{([\s\S]*?)\};/.exec(glsl);
    assert.ok(body, 'the block is declared');
    const shapes = { float: [1, 1], int: [1, 1], uint: [1, 1], vec2: [2, 1], vec3: [3, 1], vec4: [4, 1], mat4: [4, 4] };
    const out = new Map();
    let offset = 0;
    for (const line of body[1].split('\n').map(s => s.trim()).filter(Boolean)) {
        const m = /^highp\s+(\w+)\s+(\w+)(?:\[(\d+)\])?;$/.exec(line);
        assert.ok(m, 'a member line: ' + line);
        const [, type, name, size] = m;
        const [rows, columns] = shapes[type];
        const count = size ? Number(size) : 0;
        let align, bytes, stride = 0;
        if (columns > 1 || count > 0) {
            // Rules 4-6: an array element, or a matrix column, is a vec4 apart whatever it holds.
            align = 16; stride = 16 * columns; bytes = stride * Math.max(count, 1);
        } else {
            // Rules 1-3: a scalar on its size, a vec2 on 8, a vec3 or vec4 on 16.
            align = rows === 1 ? 4 : rows === 2 ? 8 : 16; bytes = 4 * rows;
        }
        offset = Math.ceil(offset / align) * align;
        assert.ok(!out.has(name), 'one member per name: ' + name);
        out.set(name, { type, count, offset, stride, bytes });
        offset += bytes;
    }
    return { members: out, size: Math.ceil(offset / 16) * 16 };
}

const basic = () => ({ uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.basic.uniforms), vertexShader: THREE.ShaderLib.basic.vertexShader, fragmentShader: THREE.ShaderLib.basic.fragmentShader });

/** A WebGL2 context that records what it is asked: enough for the block's own calls. */
function mockGl(options = {}) {
    const calls = [];
    const gl = {
        calls,
        UNIFORM_BUFFER: 0x8A11, DYNAMIC_DRAW: 0x88E8, MAX_UNIFORM_BUFFER_BINDINGS: 0x8A2F, INVALID_INDEX: 0xFFFFFFFF,
        LINK_STATUS: 0x8B82, UNIFORM_OFFSET: 0x8A3B, UNIFORM_ARRAY_STRIDE: 0x8A3C, UNIFORM_BLOCK_DATA_SIZE: 0x8A40,
        isContextLost: () => false,
        getParameter: p => (p === 0x8A2F ? 24 : 0),
        createBuffer: () => { const buffer = { id: calls.filter(c => c[0] === 'createBuffer').length }; calls.push(['createBuffer', buffer]); return buffer; },
        bindBufferBase: (target, point, buffer) => calls.push(['bindBufferBase', point, buffer]),
        bufferData: (target, data, usage) => calls.push(['bufferData', data.byteLength, Uint32Array.from(data)]),
        bufferSubData: (target, at, data, from, length) => calls.push(['bufferSubData', at, from, length, Uint32Array.from(data.subarray(from, from + length))]),
        getUniformBlockIndex: () => (options.linked === false ? 0xFFFFFFFF : 0),
        uniformBlockBinding: (program, index, point) => calls.push(['uniformBlockBinding', index, point]),
        getProgramParameter: () => options.linked !== false,
        getProgramInfoLog: () => 'ERROR: 0:12: syntax error',
        getShaderInfoLog: () => '',
        getActiveUniformBlockParameter: () => B.layout().bytes,
        getUniformIndices: (program, names) => names.map((n, i) => i),
        getActiveUniforms: (program, indices, what) => indices.map(i => {
            const m = B.layout().members[i];
            if (what === 0x8A3B) return m.offset * 4 + (options.shift && m.name === options.shift ? 4 : 0);
            return m.count ? m.stride * 4 : -1;
        })
    };
    return gl;
}
function mockRenderer(gl) {
    const renderer = { gl, drawn: 0, getContext: () => gl, info: { programs: [] } };
    renderer.render = function() { this.drawn++; if (this.inside) this.inside(); };
    return renderer;
}

/** Each test leaves the switch, the shadows' state and the shared values as it found them. */
function isolated(fn) {
    const saved = { enabled: B.enabled, failed: B.failed, active: R.Shadows._active, renderer: R.Shadows._renderer, viewport: R._viewport };
    try { return fn(); } finally {
        B.enabled = saved.enabled; B.failed = saved.failed; B._current = null;
        R.Shadows._active = saved.active; R.Shadows._renderer = saved.renderer; R._viewport = saved.viewport;
    }
}

/** A lit material compiled as three would, with or without the shadow variant. */
function compileLit(flags, renderer, shadows) {
    R.Shadows._active = !!shadows;
    R.Shadows._renderer = shadows ? renderer : null;
    const material = Object.assign(new THREE.MeshBasicMaterial({ map: new THREE.Texture() }), flags);
    R.litMaterial(material);
    const shader = basic();
    material.onBeforeCompile(shader, renderer);
    return { material, shader, key: material.customProgramCacheKey() };
}

const VARIANTS = [{ __reactorPieces: true }, { __reactorPieces: true, __reactorGhost: true }, { __reactorModel: true }, {}];

test('the std140 layout packed here is the one the block declares', () => {
    const L = B.layout();
    const rules = std140(L.glsl);
    assert.equal(rules.members.size, L.members.length);
    for (const m of L.members) {
        const r = rules.members.get(m.name);
        assert.ok(r, m.name + ' is declared');
        assert.equal(r.type, m.type, m.name + ' type');
        assert.equal(r.count, m.count, m.name + ' length');
        assert.equal(r.offset, m.offset * 4, m.name + ' offset');
        assert.equal(r.stride, m.stride * 4, m.name + ' stride');
    }
    assert.equal(L.bytes, rules.size, 'the buffer is the block\'s size, rounded to a vec4');
    assert.ok(L.bytes <= 16384, 'within the smallest MAX_UNIFORM_BLOCK_SIZE WebGL2 allows');
    // Members never overlap.
    const words = new Int32Array(L.words).fill(-1);
    L.members.forEach((m, k) => {
        for (let e = 0; e < Math.max(m.count, 1); e++) for (let c = 0; c < Math.min(m.comps, m.type === 'mat4' ? 16 : 4); c++) {
            const at = m.offset + e * m.stride + c;
            assert.equal(words[at], -1, m.name + ' overlaps ' + (L.members[words[at]] || {}).name);
            words[at] = k;
        }
    });
    // Every member precision-qualified the same, so the vertex and fragment stages' blocks match.
    assert.ok(L.members.every(m => L.glsl.includes('\thighp ' + m.type + ' ' + m.name)));
});

test('every shared value a lit shader declares loosely is a block member of the same type and length', () => isolated(() => {
    B.enabled = false;
    const L = B.layout();
    const seen = new Set();
    for (const shadows of [false, true]) for (const flags of VARIANTS) {
        const { shader } = compileLit(flags, mockRenderer(mockGl()), shadows);
        const sets = [R._lightUniforms, R._cutawayUniforms, R._waterVolumeUniforms];
        for (const stage of [shader.vertexShader, shader.fragmentShader]) {
            for (const [, type, name, size] of stage.matchAll(B.DECLARATION)) {
                const shared = sets.some(set => set && set[name] && set[name] === shader.uniforms[name]);
                if (!shared || SAMPLER.test(type)) {
                    assert.ok(!L.byName[name], name + ' is the material\'s own or a sampler, not a member');
                    continue;
                }
                const m = L.byName[name];
                assert.ok(m, name + ' (' + type + ') is shared and in the block');
                assert.equal(type, m.type, name + ' type');
                assert.equal(size === undefined ? 0 : Number(size), m.count, name + ' length');
                seen.add(name);
            }
        }
    }
    assert.deepEqual(L.members.map(m => m.name).filter(n => !seen.has(n)), [], 'no member no shader declares');
}));

test('turned on, a lit shader reads the block in both stages and keeps its samplers and own values loose', () => isolated(() => {
    for (const shadows of [false, true]) for (const flags of VARIANTS) {
        B.enabled = false;
        const off = compileLit(flags, mockRenderer(mockGl()), shadows);
        B.enabled = true;
        const renderer = mockRenderer(mockGl());
        const on = compileLit(flags, renderer, shadows);
        assert.ok(on.key.endsWith(B.KEY) && !off.key.includes(B.KEY), 'the two kinds never share a program');
        const blocks = [];
        for (const stage of ['vertexShader', 'fragmentShader']) {
            const source = on.shader[stage];
            const loose = [...source.matchAll(B.DECLARATION)].filter(d => B.layout().byName[d[2]]);
            assert.deepEqual(loose.map(d => d[2]), [], stage + ': nothing of the block left loose');
            const count = source.split('uniform RRScene {').length - 1;
            assert.ok(count <= 1, stage + ': declared once');
            if (count) blocks.push(source.slice(source.indexOf('layout(std140)'), source.indexOf('};') + 2));
            // What was not the block's is untouched: the rest of the source is the old one with the declarations gone.
            const stripped = off.shader[stage].replace(B.DECLARATION, (all, type, name) => (B.layout().byName[name] ? '' : all));
            assert.equal(source.replace(B.layout().glsl, ''), stripped, stage + ': only the declarations moved');
        }
        assert.ok(blocks.length >= 1 && blocks.every(b => b === blocks[0]), 'the same block text in each stage that reads it');
        assert.ok(/uniform sampler2DShadow rrShadowAtlas;|uniform highp usampler3D rrLightGrid;/.test(on.shader.fragmentShader), 'samplers stay plain uniforms');
        assert.deepEqual(Object.keys(on.shader.uniforms).sort(), Object.keys(off.shader.uniforms).sort(), 'the material keeps every value it had');
        for (const key of Object.keys(on.shader.uniforms)) {
            const shared = [R._lightUniforms, R._cutawayUniforms, R._waterVolumeUniforms].some(set => set && set[key]);
            if (shared) assert.equal(on.shader.uniforms[key], off.shader.uniforms[key], key + ' is the shared object still');
        }
        assert.ok(renderer.__rrSceneBlock, 'the renderer that compiled it draws the block');
    }
}));

test('off, nothing changes: same source, same values, no renderer touched', () => isolated(() => {
    B.enabled = false;
    const apply = B.apply;
    const renderer = mockRenderer(mockGl());
    const render = renderer.render;
    try {
        for (const flags of VARIANTS) {
            const off = compileLit(flags, renderer, true);
            B.apply = () => false;
            const without = compileLit(flags, renderer, true);
            B.apply = apply;
            assert.equal(off.shader.vertexShader, without.shader.vertexShader);
            assert.equal(off.shader.fragmentShader, without.shader.fragmentShader);
            assert.deepEqual(Object.keys(off.shader.uniforms), Object.keys(without.shader.uniforms));
            assert.ok(!off.key.includes(B.KEY));
            assert.ok(!off.shader.fragmentShader.includes('RRScene'));
        }
    } finally { B.apply = apply; }
    assert.equal(renderer.render, render, 'render is not wrapped');
    assert.equal(renderer.__rrSceneBlock, undefined);
    assert.deepEqual(renderer.gl.calls, [], 'no GL call');
}));

test('a material with lights of its own (the battle room) keeps the loose uniforms', () => isolated(() => {
    B.enabled = true;
    const renderer = mockRenderer(mockGl());
    R.Shadows._active = false;
    const material = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
    material.__battleRoomLight = true;
    R.litMaterial(material);
    const shader = basic();
    material.onBeforeCompile(shader, renderer);
    assert.ok(!material.customProgramCacheKey().includes(B.KEY));
    assert.ok(!shader.fragmentShader.includes('RRScene'));
    assert.ok(shader.fragmentShader.includes('uniform vec4 rrLightPos[' + R.SHADER_LIGHTS + '];'));
    // A private value under a shared name, set before the block is asked: loose too.
    const own = basic();
    const plain = R.litMaterial(new THREE.MeshBasicMaterial({ map: new THREE.Texture() }));
    const before = plain.onBeforeCompile;
    plain.onBeforeCompile = function(s, r) {
        const apply = B.apply;
        B.apply = function(m, sh, rr) { sh.uniforms.rrAmbient = { value: new Float32Array(3) }; B.apply = apply; return apply.call(B, m, sh, rr); };
        before.call(this, s, r);
    };
    plain.onBeforeCompile(own, renderer);
    assert.ok(!own.fragmentShader.includes('RRScene'), 'a value not the shared one keeps its material loose');
}));

test('every value is packed where the layout says, as WebGL would convert it', () => {
    const L = B.layout();
    const light = R.lightUniforms();
    R.LightGrid.ensure(light);
    R.LightVolume.uniforms();
    const cut = R.cutawayUniforms(), water = R.waterVolumeUniforms();
    const sets = { light, cut, water };
    const saved = new Map();
    let seed = 1;
    const next = () => (seed = (seed * 16807) % 2147483647) / 2147483647 * 200 - 100;
    const expected = new Map();
    try {
        for (const m of L.members) {
            const u = sets[m.set][m.name];
            assert.ok(u, m.name + ' exists in its set');
            saved.set(m.name, u.value);
            if (m.comps === 1 && !m.count) {
                const v = m.kind === 'u' ? 0xfffffff0 + (seed++ % 15) : m.kind === 'i' ? -7 - (seed++ % 20) : next();
                u.value = v;
                expected.set(m.name, [m.kind === 'u' ? v >>> 0 : m.kind === 'i' ? v | 0 : Math.fround(v)]);
                continue;
            }
            const n = m.comps * Math.max(m.count, 1);
            const flat = Array.from({ length: n }, next);
            expected.set(m.name, flat.map(Math.fround));
            if (m.name === 'rrWaterBox') u.value = Array.from({ length: m.count }, (_, e) => new THREE.Vector4(...flat.slice(e * 4, e * 4 + 4)));
            else if (m.name === 'rrCutEye' || m.name === 'rrWaterLevel') u.value = flat.slice();
            else if (m.name === 'rrDynTiles') u.value = new THREE.Vector2(flat[0], flat[1]);
            else u.value = Float32Array.from(flat);
        }
        B.pack();
        const used = new Uint8Array(L.words);
        for (const m of L.members) {
            const want = expected.get(m.name);
            const view = m.kind === 'u' ? L.u32 : m.kind === 'i' ? L.i32 : L.f32;
            for (let e = 0, k = 0; e < Math.max(m.count, 1); e++) for (let c = 0; c < m.comps; c++, k++) {
                const at = m.offset + e * m.stride + c;
                used[at] = 1;
                assert.equal(view[at], want[k], m.name + '[' + e + '].' + c);
            }
        }
        // Padding is never written: a vec3's fourth place and the rest of an array element's vec4.
        for (let w = 0; w < L.words; w++) if (!used[w]) assert.equal(L.u32[w], 0, 'padding word ' + w);
    } finally {
        for (const m of L.members) sets[m.set][m.name].value = saved.get(m.name);
        B.pack();
    }
});

test('a renderer packs as each render begins and sends only the stretch that changed', () => isolated(() => {
    B.enabled = true;
    const gl = mockGl(), renderer = mockRenderer(gl);
    const light = R.lightUniforms(), L = B.layout();
    compileLit({}, renderer, false);
    const st = renderer.__rrSceneBlock;
    assert.equal(gl.calls.filter(c => c[0] === 'createBuffer').length, 1);
    const data = gl.calls.find(c => c[0] === 'bufferData');
    assert.equal(data[1], L.bytes, 'the whole block, at once');
    assert.equal(st.point, 23, 'the highest binding point');
    gl.calls.length = 0;
    renderer.render();
    assert.equal(renderer.drawn, 1);
    assert.deepEqual(gl.calls.map(c => c[0]), ['bindBufferBase'], 'nothing changed: bound, not sent');
    const count = light.rrLightCount.value;
    try {
        gl.calls.length = 0;
        light.rrLightCount.value = count + 3;
        renderer.render();
        const sent = gl.calls.find(c => c[0] === 'bufferSubData');
        assert.deepEqual(sent.slice(1, 4), [L.byName.rrLightCount.offset * 4, L.byName.rrLightCount.offset, 1], 'one word');
        assert.equal(sent[4][0], count + 3);
        // A value swapped for another object (a portrait's), and back: sent both ways.
        const ambient = light.rrAmbient.value;
        gl.calls.length = 0;
        light.rrAmbient.value = new Float32Array([1, 1, 1]);
        renderer.render();
        light.rrAmbient.value = ambient;
        renderer.render();
        const subs = gl.calls.filter(c => c[0] === 'bufferSubData');
        if (ambient[0] !== 1 || ambient[1] !== 1 || ambient[2] !== 1) assert.equal(subs.length, 2);
        // Two members far apart: one stretch from the first to the last.
        gl.calls.length = 0;
        const pos = light.rrLightPos.value, was = pos[0];
        pos[0] = was + 1;
        light.rrLightCount.value = count;
        renderer.render();
        const both = gl.calls.filter(c => c[0] === 'bufferSubData');
        assert.equal(both.length, 1);
        assert.equal(both[0][2], L.byName.rrLightPos.offset);
        assert.equal(both[0][2] + both[0][3] - 1, L.byName.rrLightCount.offset);
        pos[0] = was;
        renderer.render();
    } finally { light.rrLightCount.value = count; }
    // A restored context: three's programs are a new list, and the buffer is made again.
    gl.calls.length = 0;
    renderer.info.programs = [];
    renderer.render();
    assert.equal(gl.calls.filter(c => c[0] === 'createBuffer').length, 1);
    assert.equal(typeof Object.getOwnPropertyDescriptor(renderer.info.programs, 'push').value, 'function', 'the new list is watched');
}));

test('a program with the block is bound before its first draw, and its members leave its table', () => isolated(() => {
    B.enabled = true;
    const gl = mockGl(), renderer = mockRenderer(gl);
    compileLit({ __reactorPieces: true }, renderer, true);
    const table = () => {
        const seq = [{ id: 'rrLightPos', addr: null }, { id: 'rrSelfLit', addr: {} }, { id: 'rrLightGrid', addr: {} }, { id: 'rrCutTop', addr: null }];
        return { seq, map: Object.fromEntries(seq.map(u => [u.id, u])) };
    };
    const made = table();
    let reads = 0;
    const program = { cacheKey: 'x,y|reactor3d-lit' + B.KEY, program: {}, getUniforms() { reads++; return made; } };
    const plain = { cacheKey: 'x,y|reactor3d-lit', program: {}, getUniforms: () => table() };
    const plainRead = plain.getUniforms;
    renderer.info.programs.push(program, plain);
    assert.equal(renderer.info.programs.length, 2, 'pushed as three pushes them');
    assert.equal(plain.getUniforms, plainRead, 'a program without the block is left alone');
    gl.calls.length = 0;
    const uniforms = program.getUniforms();
    assert.equal(reads, 1);
    assert.deepEqual(gl.calls.filter(c => c[0] === 'uniformBlockBinding'), [['uniformBlockBinding', 0, 23]]);
    assert.deepEqual(uniforms.seq.map(u => u.id), ['rrSelfLit', 'rrLightGrid'], 'a bind walks only the material\'s own and its samplers');
    assert.ok(!('rrLightPos' in uniforms.map) && 'rrSelfLit' in uniforms.map);
    assert.equal(B.failed, null, 'the driver\'s offsets agree');
    program.getUniforms();
    assert.equal(gl.calls.filter(c => c[0] === 'uniformBlockBinding').length, 1, 'bound once');
}));

test('a driver laying the block out otherwise, or a program that fails to link, turns it off with the reason', () => isolated(() => {
    const warn = console.warn;
    const warned = [];
    console.warn = message => warned.push(message);
    try {
        for (const options of [{ shift: 'rrKeyLight' }, { linked: false }]) {
            B.enabled = true; B.failed = null;
            const gl = mockGl(options), renderer = mockRenderer(gl);
            compileLit({}, renderer, false);
            const program = { cacheKey: 'k' + B.KEY, program: {}, getUniforms: () => ({ seq: [], map: {} }) };
            renderer.info.programs.push(program);
            program.getUniforms();
            assert.equal(B.enabled, false);
            assert.match(B.failed, options.linked === false ? /did not link[\s\S]*syntax error/ : /rrKeyLight at/);
            const material = R.litMaterial(new THREE.MeshBasicMaterial());
            assert.ok(!material.customProgramCacheKey().includes(B.KEY), 'materials compile loose again');
        }
        assert.equal(warned.length, 2);
    } finally { console.warn = warn; }
}));

test('shadow tables published from inside a draw are sent before the draws after them', () => isolated(() => {
    const shadows = R.Shadows, publish = shadows._publish, hooked = shadows.__rrSceneBlockHooked;
    const light = R.lightUniforms(), bias = light.rrShadowBias.value;
    try {
        shadows.__rrSceneBlockHooked = false;
        shadows._publish = function(uniforms) { uniforms.rrShadowBias.value = bias + 0.25; };
        B.enabled = true;
        const gl = mockGl(), renderer = mockRenderer(gl);
        compileLit({}, renderer, false);
        // The sentinel's onBeforeRender, inside the draw.
        renderer.inside = () => { gl.calls.length = 0; R.Shadows._publish(light); };
        renderer.render();
        const sent = gl.calls.find(c => c[0] === 'bufferSubData');
        assert.ok(sent, 'sent inside the draw');
        assert.equal(sent[2], B.layout().byName.rrShadowBias.offset);
        assert.equal(B._current, null, 'nothing is drawing after the draw');
        // Outside any draw it waits for the next render.
        gl.calls.length = 0;
        R.Shadows._publish(light);
        assert.equal(gl.calls.length, 0);
    } finally {
        shadows._publish = publish; shadows.__rrSceneBlockHooked = hooked;
        light.rrShadowBias.value = bias;
    }
}));

test('PIXI is told to bind its own buffer on the block\'s point again', () => isolated(() => {
    B.enabled = true;
    const renderer = mockRenderer(mockGl());
    compileLit({}, renderer, false);
    const pixi = { buffer: { _boundBufferBases: { 23: { mine: true }, 0: { theirs: true } } } };
    B.releaseTo(pixi, renderer);
    assert.equal(pixi.buffer._boundBufferBases[23], null);
    assert.deepEqual(pixi.buffer._boundBufferBases[0], { theirs: true });
}));
