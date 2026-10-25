/**
 * The editor's animation previews have no HDR pipeline, so an HDR effect
 * previews as the normally graded twin its `.hdr.json` sidecar names — and
 * where the game would refuse to play it, the preview refuses too. Every
 * preview loads through RR_loadEffekseerEffectFromFile, so that is where the
 * swap happens.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const editorSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'src', 'database', 'DatabaseAnimationEditor.js'), 'utf8');
const runtimeSource = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'runtime', 'reactor_hdr_overlay.js'), 'utf8');

const sidecar = {
    version: 1, gradeInput: 'hdr', grade: 'vec3 tmOut = hdr / (hdr + vec3(1.0));', fallback: 'Fire-ldr',
    bloom: { intensity: 0.675, radiusScale: 2.4, sizes: [0.3, 1, 2, 10, 30, 64], tints: [0.3465, 0.138, 0.1176, 0.066, 0.066, 0.061] }
};

function extract(name) {
    const start = editorSource.indexOf(`function ${name}(`);
    const end = editorSource.indexOf('\n}\n', start) + 3;
    assert.ok(start >= 0 && end > start, `${name} can be extracted`);
    return editorSource.slice(start, end);
}

function editorFunctions() {
    const context = {
        require: name => ({ fs, path })[name],
        console, setTimeout: () => 0, clearTimeout: () => {}, ArrayBuffer, Uint8Array, Buffer
    };
    vm.runInNewContext(
        ['RR_isValidHdrSidecar', 'RR_resolveHdrPreviewTwin', 'RR_loadEffekseerEffectFromFile'].map(extract).join('\n')
        + ';globalThis.api = { valid: RR_isValidHdrSidecar, resolve: RR_resolveHdrPreviewTwin, load: RR_loadEffekseerEffectFromFile };',
        context);
    return context.api;
}

function project(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-hdr-preview-'));
    for (const [rel, contents] of Object.entries(files)) {
        const file = path.join(root, 'effects', ...rel.split('/'));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, typeof contents === 'string' ? contents : JSON.stringify(contents));
    }
    return { effects: path.join(root, 'effects'), done: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const refused = error => error.rrHdrRefused === true;

test('an ordinary effect is not an HDR effect', () => {
    const { resolve } = editorFunctions();
    const p = project({ 'Fire/Fire.efkefc': 'plain' });
    try {
        assert.equal(resolve(path.join(p.effects, 'Fire', 'Fire.efkefc')), null);
    } finally { p.done(); }
});

test('a valid sidecar names the twin beside the effect, or under effects/ when it has a slash', () => {
    const { resolve } = editorFunctions();
    const p = project({
        'Fire/Fire-hdr.efkefc': 'hdr', 'Fire/Fire-hdr.hdr.json': sidecar,
        'Ice/Ice-hdr.efkefc': 'hdr', 'Ice/Ice-hdr.hdr.json': { ...sidecar, fallback: 'Shared/Ice-ldr' }
    });
    try {
        const beside = resolve(path.join(p.effects, 'Fire', 'Fire-hdr.efkefc'));
        assert.equal(beside.twinPath, path.join(p.effects, 'Fire', 'Fire-ldr.efkefc'));
        assert.equal(beside.twinName, 'Fire-ldr');
        const rooted = resolve(path.join(p.effects, 'Ice', 'Ice-hdr.efkefc'));
        assert.equal(rooted.twinPath, path.join(p.effects, 'Shared', 'Ice-ldr.efkefc'));
    } finally { p.done(); }
});

test('the preview refuses what the game refuses', () => {
    const { resolve } = editorFunctions();
    const p = project({
        'A/A-hdr.efkefc': 'hdr',
        'B/B.efkefc': 'x', 'B/B.hdr.json': '{ not json',
        'C/C.efkefc': 'x', 'C/C.hdr.json': { ...sidecar, bloom: { ...sidecar.bloom, sizes: [1, 2, 3] } }
    });
    try {
        assert.throws(() => resolve(path.join(p.effects, 'A', 'A-hdr.efkefc')), refused, '-hdr with no sidecar');
        assert.throws(() => resolve(path.join(p.effects, 'B', 'B.efkefc')), refused, 'unreadable sidecar');
        assert.throws(() => resolve(path.join(p.effects, 'C', 'C.efkefc')), refused, 'invalid sidecar');
    } finally { p.done(); }
});

test('the loader hands Effekseer the twin, marks the effect, and loads nothing it refuses', () => {
    const { load } = editorFunctions();
    const p = project({
        'Fire/Fire-hdr.efkefc': 'HDR-BYTES', 'Fire/Fire-hdr.hdr.json': sidecar, 'Fire/Fire-ldr.efkefc': 'TWIN-BYTES',
        'Bad/Bad-hdr.efkefc': 'HDR-BYTES'
    });
    const loaded = [];
    const context = {
        nativeptr: 1,
        loadEffect(buffer) { loaded.push(Buffer.from(buffer).toString()); return {}; }
    };
    try {
        const effect = load(context, path.join(p.effects, 'Fire', 'Fire-hdr.efkefc'), 1, null, null);
        assert.deepEqual(loaded, ['TWIN-BYTES']);
        assert.equal(effect.rrHdrTwin.twinName, 'Fire-ldr');
        assert.throws(() => load(context, path.join(p.effects, 'Bad', 'Bad-hdr.efkefc'), 1, null, null), refused);
        assert.deepEqual(loaded, ['TWIN-BYTES'], 'a refused effect never reaches Effekseer');
        const plain = load(context, path.join(p.effects, 'Fire', 'Fire-ldr.efkefc'), 1, null, null);
        assert.equal(plain.rrHdrTwin, undefined);
    } finally { p.done(); }
});

test('the editor accepts exactly the sidecars the runtime accepts', async () => {
    const { valid } = editorFunctions();
    const cases = [
        sidecar,
        { ...sidecar, version: 2 },
        { ...sidecar, gradeInput: 'ldr' },
        { ...sidecar, grade: 'vec3 x = hdr;' },
        { ...sidecar, grade: 'vec3 tmOut = vec3(1.0);' },
        { ...sidecar, fallback: '' },
        { ...sidecar, fallback: 7 },
        { ...sidecar, bloom: { ...sidecar.bloom, sizes: [0.3, 1, 2, 10, 30, 0] } },
        { ...sidecar, bloom: { ...sidecar.bloom, tints: [0, 0, 0, 0, 0, -1] } },
        { ...sidecar, bloom: { ...sidecar.bloom, intensity: -1 } },
        { ...sidecar, bloom: { ...sidecar.bloom, intensity: 0 } },
        { ...sidecar, bloom: { ...sidecar.bloom, radiusScale: 0 } },
        { ...sidecar, bloom: undefined },
        {}
    ];
    const metadata = new Map(cases.map((c, i) => [`effects/Case${i}.hdr.json`, c]));
    const c = {
        AbortController, setTimeout, clearTimeout, performance,
        EffectManager: { makeUrl: name => 'effects/' + name + '.efkefc' },
        fetch: async url => ({ status: 200, ok: true, json: async () => metadata.get(url) }),
        console: { warn() {}, info() {} }
    };
    c.window = c;
    vm.runInNewContext(runtimeSource, c);
    for (let i = 0; i < cases.length; i++) {
        const entry = c.ReactorHdrOverlay.request(`Case${i}`);
        await entry.promise;
        assert.equal(valid(cases[i]), !!entry.sidecar, `case ${i}: editor and runtime agree`);
    }
});
