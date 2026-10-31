'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),test=require('node:test'),vm=require('node:vm');
const native=require('pixi.js'),compat=fs.readFileSync(path.resolve(__dirname,'../../runtime/libs/pixi_compat.js'),'utf8');
function load(extra={}){const PIXI={...native,...extra},context={PIXI,Float32Array,Uint8Array,ArrayBuffer,console:{log(){},warn(){},error(){}},window:{location:{search:''}}};vm.runInNewContext(compat,context);return{P:PIXI,context};}

test('disposing a legacy base texture unloads GPU storage and preserves reusable pixels',()=>{
 const {P}=load(),bytes=new Uint8Array([12,24,48,255]),base=P.BaseTexture.fromBuffer(bytes,1,1),texture=new P.Texture(base);
 let releases=0;base.source.on('unload',()=>releases++);base.dispose();assert.equal(releases,1);assert.equal(base.valid,true);assert.equal(base.source.destroyed,false);assert.equal(base.source.resource===bytes,true);
 texture.baseTexture.dispose();assert.equal(releases,2);assert.equal(texture.valid,true);assert.equal(texture.baseTexture.resource.data===bytes,true);
 base.destroy();texture.destroy();
});

test('legacy texture revision writes update atlas UVs and notify already-created sprites',()=>{
 const {P}=load(),base=P.BaseTexture.fromBuffer(new Uint8Array(4*2*4),4,2),texture=new P.Texture(base),sprite=new P.Sprite(texture);
 assert.equal(texture.dynamic,true,'legacy sprites subscribe before the first frame change');
 let changes=0;texture.on('update',()=>changes++);texture.frame=new P.Rectangle(2,0,2,1);texture._updateID++;
 assert.equal(texture._updateID,1);assert.equal(texture.noFrame,false);assert.deepEqual([texture.uvs.x0,texture.uvs.x1,texture.uvs.y2],[0.5,1,0.5]);
 assert.deepEqual([texture.width,texture.height,sprite.width,sprite.height],[2,1,2,1]);assert.equal(changes,1);
 texture.frame=new P.Rectangle(0,1,1,1);texture._updateID++;assert.equal(texture._updateID,2);assert.equal(texture.uvs.y0,0.5);assert.equal(sprite.width,1);
 const modern=new P.Texture({source:base.source});assert.equal(modern.dynamic,false,'native v8 textures retain their own update policy');modern.destroy();sprite.destroy();texture.destroy();base.destroy();
});

test('source-in is installed as a native blend and survives context recreation without double wrapping',()=>{
 class GlStateSystem{contextChange(){this.blendModesMap={normal:[1,2]};}}
 const {P,context}=load({GlStateSystem}),gl={ONE:1,ZERO:0,DST_ALPHA:772},state=new GlStateSystem();state.contextChange(gl);
 assert.equal(P.BLEND_MODES.SRC_IN,'source-in');assert.deepEqual(Array.from(state.blendModesMap['source-in']),[772,0]);
 const installed=GlStateSystem.prototype.contextChange;vm.runInNewContext(compat,context);assert.equal(GlStateSystem.prototype.contextChange,installed);
 state.contextChange(gl);assert.deepEqual(Array.from(state.blendModesMap['source-in']),[772,0]);assert.deepEqual(state.blendModesMap.normal,[1,2]);
});

test('legacy constructor frames remain distinct from v8 options and reach the sprite immediately',()=>{
 const {P}=load(),base=P.BaseTexture.fromBuffer(new Uint8Array(32),4,2),frame=new P.Rectangle(1,0,2,1);
 for(const source of [base,base.source,new P.Texture(base).baseTexture]){
  const texture=new P.Texture(source,frame),sprite=new P.Sprite(texture);assert.deepEqual([texture.frame.x,texture.frame.width,texture.width,sprite.width],[1,2,2,2]);assert.equal(texture.dynamic,true);sprite.destroy();texture.destroy();
 }
 const modern=new P.Texture({source:base.source,frame,dynamic:false});assert.equal(modern.dynamic,false);modern.destroy();base.destroy();
});

test('detached source-in roots blend through a neutral parent and are restored even after a render failure',()=>{
 class Renderer{render(options){this.last=options.container;if(this.fail)throw Error('drawing failed');return 14;}}
 const {P}=load({AbstractRenderer:Renderer}),source=new P.TextureSource({width:1,height:1}),texture=new P.Texture({source}),sprite=new P.Sprite(texture);sprite.blendMode=P.BLEND_MODES.SRC_IN;
 const renderer=new Renderer();assert.equal(renderer.render({container:sprite}),14);assert.notEqual(renderer.last,sprite);assert.equal(sprite.parent,null);assert.equal(renderer.last.children.length,0);
 renderer.fail=true;assert.throws(()=>renderer.render({container:sprite}),/drawing failed/);assert.equal(sprite.parent,null);assert.equal(renderer.last.children.length,0);
 sprite.destroy();texture.destroy(true);
});

test('an empty legacy render suppresses only its own quad while ordinary sprites retain their bounds',()=>{
 class SpritePipe{_initGPUSprite(s){return{bounds:s.bounds};}_updateBatchableSprite(s,q){q.bounds=s.bounds;}}
 const {P}=load({SpritePipe}),pipe=new P.SpritePipe(),bounds={minX:0,minY:0,maxX:3,maxY:2};
 const suppressed={bounds,_render:function(){}},quad=pipe._initGPUSprite(suppressed);assert.deepEqual([quad.bounds.maxX,quad.bounds.maxY],[0,0]);
 pipe._updateBatchableSprite(suppressed,quad);assert.equal(quad.bounds.maxX,0);
 for(const ordinary of [{bounds},{bounds,_render(){return 1;}}]){const drawn=pipe._initGPUSprite(ordinary);assert.equal(drawn.bounds===bounds,true);}
 const normal=new P.State(),special=new P.State();special.blendMode=P.BLEND_MODES.SRC_IN;assert.notEqual(special._blendModeId,normal._blendModeId,'source-in has a distinct pipeline cache key');
});
