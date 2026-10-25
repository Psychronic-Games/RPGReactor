'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const A=require('../src/legacy/LegacyArtwork.js');
function fixture(w=256,h=128,fn=(x,y)=>[100,100,100,255]){const data=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(fn(x,y),(y*w+x)*4);return{width:w,height:h,data};}
const hash=a=>crypto.createHash('sha256').update(a).digest('hex');
function error(image,oracle){let sum=0,n=0;for(let y=5;y<image.height-5;y++)for(let x=5;x<image.width-5;x++){sum+=Math.abs(image.data[(y*image.width+x)*4]-oracle(x,y));n++;}return sum/n;}
test('periodic palette dither reconstructs a smooth true-colour ramp without moving pixels',()=>{
 const oracle=(x,y)=>80+Math.floor(x/8)+Math.floor(y/16),src=fixture(256,128,(x,y)=>{const n=oracle(x,y)+((x+y)%2?12:-12);return[n,n,n,255];}),before=hash(src.data);
 const {image,stats}=A.restore(src,'Panorama');assert.equal(hash(src.data),before,'source array is immutable');assert.equal(image.width,256);assert.equal(image.height,128);
 assert.ok(stats.changedPixels>25000);assert.ok(error(image,oracle)<1.1);assert.ok(error(src,oracle)>11.9);assert.equal(image.data.length,src.data.length);
 for(let i=3;i<image.data.length;i+=4)assert.equal(image.data[i],255);
 assert.deepEqual(A.restore(src,'Panorama').image.data,image.data,'no random seed or platform font/rendering dependency');
});
test('ordered quarter-tone dither reconstructs its mean, preserving continuous ramps and stripes',()=>{
 const src=fixture(256,128,(x,y)=>{const v=x%2===0&&y%2===0?124:92;return[v,v,v,255];});
 const out=A.restore(src,'Backdrop');assert.ok(error(out.image,()=>100)<.01);assert.ok(out.stats.periodicPixels>20000);
 for(const input of [fixture(256,128,(x,y)=>[80+Math.floor(x/4),80+Math.floor(x/4),80+Math.floor(x/4),255]),fixture(256,128,(x,y)=>{const v=x%2?96:120;return[v,v,v,255];})])assert.deepEqual(A.restore(input,'Panorama').image.data,input.data,'ordinary gradients and one-direction line art are unchanged');
});
test('low-contrast thin outlines and high-contrast lettering remain registered and intact',()=>{
 const src=fixture(256,128,(x,y)=>{const line=x===y||x===60||y===70;const v=line?70:110;return[v,v,v,255];});
 const out=A.restore(src,'Picture');assert.deepEqual(out.image.data,src.data,'diagonal and orthogonal one-pixel lines are protected');
 const ink=fixture(256,128,(x,y)=>{const v=(x>35&&x<42&&y>20&&y<90)||(y>20&&y<26&&x>35&&x<90)?0:220;return[v,v,v,255];});assert.deepEqual(A.restore(ink,'Picture').image.data,ink.data);
});
test('alpha/keyed boundaries have an unchanged two-pixel safety band and no hidden-colour bleed',()=>{
 const src=fixture(256,128,(x,y)=>{if(x<64)return[255,0,255,0];if(x===64)return[50,200,100,128];const v=(x+y)%2?112:88;return[v,v,v,255];});
 const {image,stats}=A.restore(src,'Picture');assert.ok(stats.changedPixels>10000);
 for(let y=0;y<128;y++)for(let x=0;x<256;x++){const i=(y*256+x)*4;assert.equal(image.data[i+3],src.data[i+3]);if(x<=66)assert.deepEqual(image.data.slice(i,i+4),src.data.slice(i,i+4));}
});
test('small art, text/system art and sprite sheets are categorically protected, with a bounded image budget',()=>{
 const src=fixture();for(const cat of ['System','System2','Frame','CharSet','FaceSet','Title','GameOver','Battle','Battle2','ChipSet','Monster']){const r=A.restore(src,cat);assert.equal(r.image,src);assert.equal(r.stats.reason,'protected-category');}
 const small=fixture(192,80);assert.equal(A.restore(small,'Picture').stats.reason,'small-artwork');
 const huge={width:4096,height:1025,data:new Uint8Array(4096*1025*4)};const r=A.restore(huge,'Panorama');assert.equal(r.image,huge);assert.equal(r.stats.reason,'image-budget');
});

test('an invalid explicit artwork mode is rejected before destination creation',()=>{
 const I=require('../src/legacy/LegacyImporter.js'),root=fs.mkdtempSync(path.join(os.tmpdir(),'rr-artwork-invalid-')),dest=path.join(root,'out');
 try{for(const graphics of ['orginal','painted',null]){assert.throws(()=>I.importProject(path.resolve(__dirname,'../../template/Sunset over Imdahl'),dest,{graphics}),/remaster or original/);assert.equal(fs.existsSync(dest),false);}}finally{fs.rmSync(root,{recursive:true,force:true});}
});
const source=path.resolve(__dirname,'../../template/Sunset over Imdahl');
test('a real import defaults to cleanup, keeps exact converted originals, and can opt out',{skip:!fs.existsSync(path.join(source,'RPG_RT.LDB'))},async()=>{
 const I=require('../src/legacy/LegacyImporter.js'),root=fs.mkdtempSync(path.join(os.tmpdir(),'rr-artwork-')),clean=path.join(root,'clean'),original=path.join(root,'original');
 const native=path.join(source,'Panorama/TownSquareSpring.png'),before=hash(fs.readFileSync(native));
 try{
  const a=await I.importProject(source,clean,{maps:[2]});const b=await I.importProject(source,original,{maps:[2],graphics:'original'});
  assert.equal(a.graphics.mode,'remaster');assert.ok(a.graphics.changedFiles>0);assert.ok(a.graphics.changedPixels>0);assert.equal(a.graphics.preservedFiles,a.graphics.processedFiles);assert.equal(b.graphics.mode,'original');assert.equal(b.graphics.processedFiles,0);
  const asset='img/parallaxes/TownSquareSpring.png';const backup=path.join(clean,'legacy/original-graphics',asset);assert.deepEqual(fs.readFileSync(backup),fs.readFileSync(path.join(original,asset)),'backup is the exact converted PNG, not a reconstruction of it');
  const {PNG}=require('pngjs'),pre=PNG.sync.read(fs.readFileSync(backup)),post=PNG.sync.read(fs.readFileSync(path.join(clean,asset)));assert.deepEqual([post.width,post.height],[pre.width,pre.height]);for(let i=3;i<pre.data.length;i+=4)assert.equal(post.data[i],pre.data[i]);
  for(const file of ['img/pictures/Meny.png','img/system/Window.png','img/characters/!ImdahlCharacters1.png'])if(fs.existsSync(path.join(original,file)))assert.deepEqual(fs.readFileSync(path.join(clean,file)),fs.readFileSync(path.join(original,file)),'protected art '+file);
  assert.equal(hash(fs.readFileSync(native)),before);const project=JSON.parse(fs.readFileSync(path.join(clean,'project.rpgreactor')));assert.equal(project.importedGraphics,'remaster');
  const report=JSON.parse(fs.readFileSync(path.join(clean,'import-report.json')));assert.deepEqual(report.graphics,a.graphics);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
