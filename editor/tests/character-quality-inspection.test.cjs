'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { inspect } = require('./helpers/character-quality-matrix.cjs');
test('quality inspection distinguishes unused source vertices from missing rendered normals', () => {
    const part = { name: 'panel', positions: Float32Array.of(0,0,0, 1,0,0, 0,1,0, 0,0,0),
        normals: Float32Array.of(0,0,1, 0,0,1, 0,0,1, 0,0,0), index: Uint32Array.of(0,1,2),
        joints: new Uint8Array(16), weights: Float32Array.of(1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0) };
    const result = { height: 1, parts: [part], bones: [{ name:'Root',parent:-1,head:[0,0,0],tail:[0,1,0] }], textures:{} };
    assert.deepEqual(inspect(result,{recipe:{}},{}).issues,[]);
    part.normals[2] = 0;
    assert.ok(inspect(result,{recipe:{}},{}).issues.some(issue=>issue.kind==='zero-normal'), 'referenced missing normals still fail');
});
