const test = require('node:test');
const assert = require('node:assert/strict');
const Preview = require('../src/utils/ModelPreview3D.js');
const Database = require('../src/database/Database3DEditor.js');

function fixture(t) {
    const previous = { Reactor3D: global.Reactor3D, ModelPreview3D: global.ModelPreview3D };
    global.Reactor3D = { SHADER_LIGHTS: 4, lightUniforms() { throw Error('Inspection must not access map lighting'); } };
    global.ModelPreview3D = Preview;
    t.after(() => { for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete global[key]; else global[key] = value;
    } });
    const shared = { rrAmbient: { value: new Float32Array([0.1, 0.2, 0.3]) }, rrLightCount: { value: 4 }, rrLightGridEnabled: { value: 1 } };
    let compiles = 0;
    const material = { __reactorLit: true, onBeforeCompile(shader) { compiles++; shader.uniforms = { ...shared }; }, customProgramCacheKey() { return 'original'; } };
    const object = { traverse(fn) { fn({ isMesh: true, userData: {}, material }); } };
    return { shared, material, object, compiles: () => compiles };
}

test('inspection shaders stay fully illuminated when map ambient, lights and light grid change', t => {
    const f = fixture(t), own = Preview.isolateLighting(f.object), shader = {};
    f.material.onBeforeCompile(shader);
    f.shared.rrAmbient.value.fill(0); f.shared.rrLightCount.value = 99;
    assert.deepEqual(Array.from(shader.uniforms.rrAmbient.value), [1, 1, 1]);
    assert.equal(shader.uniforms.rrLightCount.value, 0);
    assert.equal(shader.uniforms.rrLightGridEnabled.value, 0);
    assert.equal(shader.uniforms.rrAmbient, own.rrAmbient);
    assert.notEqual(shader.uniforms.rrAmbient, f.shared.rrAmbient);
    const rebound = Preview.isolateLighting(f.object);
    const next = {}; f.material.onBeforeCompile(next);
    assert.equal(f.compiles(), 2, 'rebinding does not nest shader hooks');
    assert.equal(next.uniforms.rrAmbient, rebound.rrAmbient);
});

test('stopping a Database light effect restores inspection brightness without restoring stale map state', t => {
    const f = fixture(t), editor = Object.create(Database.prototype);
    assert.equal(editor.LIGHT_PREVIEW_AMBIENT, 1, 'ordinary inspection is full strength');
    editor._cardMode = 'effect'; editor._effectWork = { type: 'light' };
    assert.equal(editor.LIGHT_PREVIEW_AMBIENT, 0.35, 'explicit light editing can show its falloff');
    editor._object = f.object;
    editor._previewLighting = Preview.isolateLighting(f.object);
    const shader = {}; f.material.onBeforeCompile(shader);
    editor._lightPreviewLit(true);
    editor._previewLighting.rrAmbient.value.fill(0.35);
    editor._previewLighting.rrLightCount.value = 1;
    f.shared.rrAmbient.value.fill(0.02); f.shared.rrLightCount.value = 7;
    editor._lightPreviewLit(false);
    assert.deepEqual(Array.from(shader.uniforms.rrAmbient.value), [1, 1, 1]);
    assert.equal(shader.uniforms.rrLightCount.value, 0);
    assert.ok(Array.from(f.shared.rrAmbient.value).every(v => Math.abs(v - 0.02) < 1e-7));
    assert.equal(f.shared.rrLightCount.value, 7);
});
