'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),V=require('../src/forge/Props/VehicleProp.js'),Finish=require('../src/forge/Props/VehicleFinish.js'),CM=require('../src/forge/Props/ContainerMesh.js');
const F=CM.frame([0,0,0],[1,0,0],[0,1,0]);
const contains=(mesh,x,y)=>{for(let k=0;k<mesh.index.length;k+=3){const p=Array.from(mesh.index.subarray(k,k+3),i=>[mesh.positions[i*3],mesh.positions[i*3+1]]),s=p.map((a,i)=>{const b=p[(i+1)%3];return(b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0]);});if(s.every(v=>v>=-1e-8)||s.every(v=>v<=1e-8))return true;}return false;};
test('surface lettering preserves open glyph counters and omits physically microscopic captions',()=>{
 const panel=CM.slab(CM.rect(0,0,4,2),F,.002,0,true),word=Finish.lettering(panel,F,'O',1,.6,.001);
 assert.ok(word.index.length>0);assert.ok(!contains(word,0,0),'the O counter must remain open');let right=-Infinity;for(let i=0;i<word.positions.length;i+=3)right=Math.max(right,word.positions[i]);assert.ok(contains(word,right*.9,0),'the outer stroke must remain solid');assert.equal(Finish.lettering(panel,F,'SERVICE',1,.015,.001).index.length,0,'small captions must not turn into fake text noise');
});
test('vehicle captions use opaque filled outlines without a raster alpha threshold',()=>{
 const r=V.build({...V.fromPreset('rover'),markings:'RANGER 17'}),letters=r.parts.find(p=>p.name==='Vehicle lettering');assert.ok(letters&&letters.index.length);assert.ok(!letters.texture&&!letters.cutout&&!letters.blend);assert.equal(letters.colors.length,letters.positions.length);assert.ok(letters.positions.every(Number.isFinite)&&letters.colors.every(Number.isFinite));
});
test('clean coating normals filter sub-texel grain instead of aliasing it into large dents',()=>{
 const panel={...CM.slab(CM.rect(0,0,4,2),F,.01,0,true),name:'Test coating',color:'#ffffff',surfaceRole:'paint',roughness:.3,metalness:.1};CM.skin(panel,0);const textures={};Finish.apply([panel],textures,V.normalize({wear:0,grime:0,finish:'enamel'}),{},{});const image=textures[panel.normalTexture],values=[];
 for(let i=0;i<panel.positions.length/3;i++)if(panel.normals[i*3+2]>.99){const x=Math.min(image.width-1,Math.floor(panel.uvs[i*2]*image.width)),y=Math.min(image.height-1,Math.floor(panel.uvs[i*2+1]*image.height)),at=(y*image.width+x)*4;values.push(image.data[at],image.data[at+1]);}
 assert.ok(values.length>4);assert.ok(Math.max(...values)-Math.min(...values)<=4,'flat enamel has exaggerated baked normal variation');
});
