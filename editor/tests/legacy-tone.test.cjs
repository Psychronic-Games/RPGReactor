'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),vm=require('node:vm');
const {runtimeSource}=require('./helpers/runtime-source.cjs');
const C=require('../src/legacy/LegacyCommands.js');
const core=runtimeSource('reactor_core.js');
const start=core.indexOf('function ColorFilter() {'),tail=core.indexOf('ColorFilter.prototype._rebuildColorMatrix = function',start),end=core.indexOf('\n};\n',tail)+4;
class Matrix {constructor(){this.resources={};} _loadMatrix(m){this.matrix=m;} apply(manager,input,output){manager.applyFilter(this,input,output);} destroy(){this.destroyed=true;}}
const box={Array,PIXI:{GlProgram:function(){},ColorMatrixFilter:Matrix,Filter:class{}},PIXISuper:(B,o,args)=>Object.assign(o,new B(...args))};
vm.runInNewContext(core.slice(start,end)+'\nthis.ColorFilter=ColorFilter;',box);
const Filter=box.ColorFilter;
function pixel(filter,rgb){const m=filter.matrix;return [0,1,2].map(row=>Math.max(0,Math.min(255,Math.round(m[row*5]*rgb[0]+m[row*5+1]*rgb[1]+m[row*5+2]*rgb[2]+m[row*5+4]*255))));}
const encoded=(r,g,b,sat=100)=>[r,g,b].map(n=>Math.round((n-100)*2.55)).concat(Math.round((100-sat)*2.55));
function tone(filter,arr){filter.setColorTone(arr);}
const original=(pct,p)=>{const t=Math.max(0,Math.min(255,Math.floor(pct*128/100)));return t<=128?Math.floor(2*t*p/255):255-Math.floor(2*(255-t)*(255-p)/255);};
test('legacy screen/picture tone preserves source hard-light shading across dark and bright pixels',()=>{
 const f=new Filter();f.setLegacyTone(true);
 for(const pct of [0,25,50,75,90,110,130,150,175,200])for(const p of [0,16,64,128,192,240,255]){
  tone(f,encoded(pct,pct,pct));const got=pixel(f,[p,p,p])[0],want=original(pct,p);
  assert.ok(Math.abs(got-want)<=2,`tone${pct} pixel${p}: got${got}, source${want}`);
 }
 tone(f,encoded(50,50,50));assert.ok(pixel(f,[64,128,192])[0]>=31 && pixel(f,[64,128,192])[0]<=33);
});
test('legacy neutral is an exact identity; native MZ additive tones stay unchanged',()=>{
 const f=new Filter();f.setLegacyTone(true);tone(f,[0,0,0,0]);assert.deepEqual(pixel(f,[4,88,231]),[4,88,231]);
 f.setLegacyTone(false);tone(f,[77,-10,0,0]);assert.deepEqual(pixel(f,[64,64,64]),[141,54,64]);
});
test('legacy saturation uses source luminance weights and retains saturation above100%',()=>{
 const f=new Filter();f.setLegacyTone(true);tone(f,encoded(100,100,100,0));assert.deepEqual(pixel(f,[255,0,0]),[76,76,76]);
 const ctx={actors:{},notes:{}};const {list}=C.convertList([{code:11120,parameters:[1,0,160,120,0,100,0,0,100,100,100,150,0,0,10,0],string:'',indent:0}],ctx);
 const t=list.find(c=>c.code===234).parameters[1];assert.ok(t[3]<0,'source oversaturation is retained');tone(f,t);assert.ok(f._rrLegacySaturationMatrix,'oversaturation is clamped in its own render target');
});
test('a blocking imported picture move starts colour alongside position and opacity before waiting',()=>{
 const {list}=C.convertList([{code:11120,parameters:[1,0,160,120,0,100,50,0,50,75,130,100,0,0,50,1],string:'',indent:0}],{actors:{},notes:{}});
 const move=list.find(c=>c.code===232),tint=list.find(c=>c.code===234);assert.equal(move.parameters[11],false,'position command does not suspend before tint starts');assert.equal(tint.parameters[3],true,'wait starts once both tweens run');assert.equal(tint.parameters[2],move.parameters[10]);
});

test('a shown picture starts its fade from the authored tone, including older imported event lists',()=>{
 const objects=runtimeSource('reactor_objects.js');
 const pictureSource=objects.slice(objects.indexOf('function Game_Picture() {'),objects.indexOf('function Game_Item() {'));
 const scope={Array};vm.runInNewContext(pictureSource,scope);
 // The engine provides Array.clone; use the same operation for host arrays.
 const cloneTone=a=>Object.assign(a.slice(),{clone(){return cloneTone(this);}});
 const run=(legacy,oldConversion,byVariable=false)=>{
  const params=[1,0,160,0,0,100,0,1,200,200,200,100,0,0,50,0];
  if(byVariable){params.length=18;params[17]=1;}
  const {list}=C.convertList([{code:11110,parameters:params,string:'Roof',indent:0},
   {code:11120,parameters:params.map((v,i)=>[8,9,10].includes(i)?100:v),string:'',indent:0}],{actors:{},notes:{}});
  if(oldConversion)list.find(c=>c.code===234).parameters[2]=1;
  const p=new scope.Game_Picture(),calls=[];
  const box={$dataSystem:{rrLegacyParallax:legacy},Game_Interpreter:function(){},
   $gameVariables:{value:()=>1},$gameScreen:{showPicture(){},movePicture(){},rrKeepPicture(){},tintPicture(id,t,d){calls.push(d);p.tint(cloneTone(t),d);}}};
  box.Game_Interpreter.prototype.command234=function(a){box.$gameScreen.tintPicture(a[0],a[1],a[2]);return true;};
  const source=runtimeSource('reactor_screen_fx.js'),a=source.indexOf('    // Older conversions encoded'),b=source.indexOf('    // Changing a legacy panorama',a);
  vm.runInNewContext('const legacyTone=()=>!!$dataSystem.rrLegacyParallax;'+source.slice(a,b),box);
  const i=new box.Game_Interpreter();i._list=list;
  for(i._index=0;i._index<list.length;i._index++){
   const c=list[i._index];if(c.code===234)i.command234(c.parameters);
   if(c.code===355)vm.runInNewContext(c.parameters[0],box);
  }
  const start=Array.from(p._tone);p.updateTone();return{start,after:Array.from(p._tone),calls,list};
 };
 for(const old of [false,true]){
  const r=run(true,old);assert.deepEqual(r.start,[255,255,255,0]);
  assert.deepEqual(r.after,[254.15,254.15,254.15,0]);assert.deepEqual(r.calls,[0,300]);
 }
 assert.deepEqual(run(true,false,true).start,[255,255,255,0],'variable-number pictures also establish tone immediately');
 assert.deepEqual(run(false,true).start,[0,0,0,0],'native MZ retains its one-frame tween semantics');
});

test('oversaturated legacy tone clamps in a pooled intermediate before hard light and releases it',()=>{
 const f=new Filter();f.setLegacyTone(true);tone(f,encoded(50,50,50,200));
 let returned=0;box.PIXI.TexturePool={getSameSizeTexture:()=>({}),returnTexture:()=>returned++};
 const manager={applyFilter(filter,input,output){output.rgb=pixel(filter,input.rgb);}};const output={};
 f.apply(manager,{rgb:[255,0,0]},output,true);
 assert.ok(output.rgb[0]>=126&&output.rgb[0]<=130);assert.equal(output.rgb[1],0);assert.equal(output.rgb[2],0);assert.equal(returned,1);
 const child=f._rrSaturationPass;f.destroy();assert.equal(child.destroyed,true);
});

test('ColorFilter delegates inherited apply and destroy to plugins installed after runtime load',()=>{
 const f=new Filter(),oldApply=Matrix.prototype.apply,oldDestroy=Matrix.prototype.destroy;let applies=0,destroys=0;
 try {
  Matrix.prototype.apply=function(manager,input,output){applies++;output.lateParent=true;};
  Matrix.prototype.destroy=function(){destroys++;this.lateParentDestroyed=true;};
  const output={};f.apply({}, {}, output, true);assert.equal(applies,1);assert.equal(output.lateParent,true);
  f.destroy();assert.equal(destroys,1);assert.equal(f.lateParentDestroyed,true);
 } finally {Matrix.prototype.apply=oldApply;Matrix.prototype.destroy=oldDestroy;}
});
