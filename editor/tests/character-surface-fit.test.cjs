'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),O=require('../src/forge/Character3D/CharacterOutfit.js');
const part=(z=0)=>({positions:Float32Array.of(-1,-1,z,1,-1,z,-1,1,z,1,1,z),index:Uint32Array.of(0,1,2,1,3,2)});
test('indexed garment surface queries preserve exact front/back intersections and barycentric addresses',()=>{
 const front=part(.2),back=part(-.3),surface=O.projectedSurface([front,back],{cell:.12});
 for(const [x,y]of [[0,0],[.31,-.72],[-.9,.8],[1,1]]){const a=surface.sample(x,y),b=surface.sample(x,y,-1);assert.ok(a.part===front);assert.ok(b.part===back);assert.ok(Math.abs(a.depth-.2)<1e-7);assert.ok(Math.abs(b.depth+.3)<1e-7);assert.ok(Math.abs(a.bary.reduce((s,v)=>s+v,0)-1)<1e-12);}
 assert.equal(surface.sample(2,0),null);assert.equal(surface.depth(2,0,7),7);
});
test('surface queries support limb-local projection and bounded large-triangle indexing',()=>{
 const p=part(.2),surface=O.projectedSurface([p],{axes:[[0,1,0],[1,0,0],[0,0,-1]],cell:.005});
 const hit=surface.sample(.3,.7,-1);assert.ok(hit.part===p);assert.ok(Math.abs(hit.depth+.2)<1e-7);
 const excluded=O.projectedSurface([p],{accept:()=>false});assert.equal(excluded.sample(0,0),null);
});
test('cross sections fit rectangular fabric instead of an oversized enclosing ellipse',()=>{
 const box={positions:Float32Array.of(-1,-1,-2,1,-1,-2,1,1,-2,-1,1,-2,-1,-1,2,1,-1,2,1,1,2,-1,1,2),
  index:Uint32Array.of(0,1,2,0,2,3,4,6,5,4,7,6,0,4,5,0,5,1,3,2,6,3,6,7,0,3,7,0,7,4,1,5,6,1,6,2)};
 const other={positions:Float32Array.from(box.positions,v=>v*3),index:box.index};
 const ring=O.crossSection([box,other],[0,.3,0],[[1,0,0],[0,1,0],[0,0,1]],p=>p===box);
 for(const a of [0,.3,1.2,2.6,4.2,5.9]){
  const x=Math.sin(a),z=Math.cos(a),r=Math.min(1/Math.abs(x),2/Math.abs(z)),p=ring(a,.01);
  assert.ok(Math.abs(p[0]-x*(r+.01))<1e-10);assert.equal(p[1],.3);assert.ok(Math.abs(p[2]-z*(r+.01))<1e-10);
 }
});
