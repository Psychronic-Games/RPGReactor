'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
require(path.join(root, 'runtime/libs/three.js'));
const R = require(path.join(root, 'runtime/reactor_3d.js'));

function triangle(metal, roughness, builder, coat) {
    const bin = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const json = {
        asset: { version: '2.0', generator: builder ? 'RPG Reactor Character Builder' : 'external' },
        buffers: [{ byteLength: bin.byteLength }], bufferViews: [{ buffer: 0, byteLength: bin.byteLength }],
        accessors: [{ bufferView: 0, componentType: 5126, type: 'VEC3', count: 3 }],
        materials: [{ pbrMetallicRoughness: { metallicFactor: metal, roughnessFactor: roughness }, ...(coat ? { extensions: { KHR_materials_clearcoat: coat } } : {}) }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
        nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
    };
    const object = R.buildGlbTemplate(json, new Uint8Array(bin.buffer), '');
    R.applyModelSurface(object, null);
    let material;
    object.traverse(node => { if (node.isMesh) material = node.material; });
    return { object, material };
}

test('rough Builder metal retains a metallic surface; cloth stays diffuse', () => {
    for (const [metal, roughness] of [[.9, .27], [.4, .8]]) {
        const { object, material } = triangle(metal, roughness, true);
        const shine = R.shineOf(material);
        assert.ok(shine, 'a rough metal must not become diffuse-only');
        assert.ok(Math.abs(shine.vector.z - metal) < .001);
        assert.ok(Math.abs(shine.vector.y - roughness) < .01);
        assert.equal(shine.albedo.value, 1);
        if (metal > .8) assert.ok(R.mirrorOf(object) >= .5, 'armor qualifies for a local reflection probe');
        material.dispose();
    }
    assert.equal(R.shineOf(triangle(0, .7, true).material), null);
    assert.equal(R.shineOf(triangle(.9, .27, false).material), null, 'external files retain the authored Surface workflow');
});

test('exported armor retains its clearcoat independently of base-metal roughness', () => {
    const { material } = triangle(.9, .27, true, { clearcoatFactor: .3, clearcoatRoughnessFactor: .12 });
    assert.equal(material.userData.rrClearcoat.factor, .3);
    assert.equal(material.userData.rrClearcoat.roughness, .12);
    const shader = { uniforms: {}, vertexShader: 'void main() {\n#include <project_vertex>\n}', fragmentShader: 'void main() {\n#include <opaque_fragment>\n}' };
    R.injectShine(material, shader);
    assert.equal(shader.uniforms.rrModelCoat.value.x, .3);
    assert.equal(shader.uniforms.rrModelCoat.value.y, .12);
});
