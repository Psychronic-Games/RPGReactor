const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const { runtimeSource } = require('./helpers/runtime-source.cjs');
const core=runtimeSource('reactor_core.js');
function fixture(){
 const start=core.indexOf('function ColorFilter() {'),tail=core.indexOf('ColorFilter.prototype._rebuildColorMatrix = function',start),end=core.indexOf('\n};\n',tail)+4;
 class ColorMatrixFilter{constructor(){this.resources={};Object.assign(this,{enabled:true,alpha:1,blendMode:'normal',resolution:1,antialias:'off',padding:0,blendRequired:false,glProgram:{},gpuProgram:{}});}get matrix(){return this._m;}set matrix(m){this._m=m;} _loadMatrix(m){this._m=m;}}
 const PIXI={GlProgram:class{},ColorMatrixFilter,Filter:class{},Texture:{WHITE:{}}};
 const ctx={PIXI,Array,Object,Number,Math,Error,Proxy,PIXISuper:(C,self,args)=>Object.assign(self,new C(...args))};vm.createContext(ctx);vm.runInContext(core.slice(start,end)+'\nthis.C=ColorFilter;',ctx);const C=ctx.C;
 const node=()=>({visible:true,renderable:true,alpha:1,tint:0xffffff,mask:null,filterArea:null,x:0,y:0,rotation:0,scale:{x:1,y:1},skew:{x:0,y:0},pivot:{x:0,y:0},blendMode:'inherit',children:[]});
 const scene=node(),ss=node(),base=node(),black=node(),graphics=node();scene._spriteset=ss;ss._baseSprite=base;ss._blackScreen=black;black._graphics=graphics;
 scene.children=[ss];ss.children=[base];base.children=[black];black.children=[graphics];
 const transform={a:1,b:0,c:0,d:1,tx:0,ty:0};graphics.context={instructions:[{action:'fill',data:{style:{alpha:1,texture:PIXI.Texture.WHITE},path:{instructions:[{action:'rect',data:[-50000,-50000,100000,100000,transform]}]}}}]};
 const renderer={tick:0,resolution:1,background:{clearBeforeRender:true},renderTarget:{renderTarget:{colorTexture:{source:{antialias:false}}}}};
 ctx.SceneManager={_scene:scene};ctx.Graphics={width:1920,height:1080,_app:{stage:scene,renderer}};
 const filters=[scene,ss,base].map((n,i)=>{const f=new C();n.filters=[f];f.allowNeutralSceneSkip(i===0?scene:ss);return f;});
 return {C,scene,ss,base,black,graphics,renderer,filters,node,draw:()=>{renderer.tick++;return filters.map(f=>f.enabled);}};
}
test('neutral engine passes resume for fades, tint, flashes and direct matrix edits',()=>{
 const x=fixture(),[fade,flash,tone]=x.filters;assert.deepEqual(x.draw(),[false,false,false]);
 fade.setBlendColor([0,0,0,125]);assert.deepEqual(x.draw(),[true,false,false]);fade.setBlendColor([0,0,0,0]);
 flash.setBlendColor([255,80,20,100]);assert.deepEqual(x.draw(),[false,true,false]);flash.setBlendColor([0,0,0,0]);
 tone.setColorTone([20,-30,40,60]);assert.deepEqual(x.draw(),[false,false,true]);tone.setColorTone([0,0,0,0]);
 tone.matrix[4]=.1;assert.deepEqual(x.draw(),[false,false,true]);tone.matrix[4]=0;
 tone.enabled=false;tone.setBrightness(128);assert.equal(x.draw()[2],false,'an explicit disable stays disabled');tone.enabled=true;assert.equal(x.draw()[2],true);
 const ordinary=new x.C();assert.equal(ordinary.enabled,true,'arbitrary sprite filters keep isolation');
});
test('neutral removal preserves compositing isolation for altered backdrops and custom scenes',()=>{
 const cases=[x=>x.ss.alpha=.5,x=>x.ss.scale.x=1.1,x=>x.scene.mask={},x=>x.scene.children.unshift(x.node()),x=>x.black.visible=false,x=>x.graphics.context.instructions=[],x=>x.graphics.context.instructions[0].data.style.alpha=.5,x=>x.graphics.context.instructions[0].data.path.instructions[0].data[2]=10,x=>x.filters[2].matrix[18]=.5,x=>x.renderer.renderTarget.renderTarget.colorTexture.source.antialias=true,x=>{const n=x.node();n.blendMode='erase';x.ss.children.push(n);},x=>x.ss.filters.push({blendMode:'normal'})];
 for(const change of cases){const x=fixture();assert.deepEqual(x.draw(),[false,false,false]);change(x);assert.deepEqual(x.draw(),[true,true,true],String(change));}
});
test('each render rechecks the backdrop and shader overrides keep their own pass',()=>{
 const x=fixture();assert.deepEqual(x.draw(),[false,false,false]);x.black.alpha=.5;assert.deepEqual(x.draw(),[true,true,true]);x.black.alpha=1;assert.deepEqual(x.draw(),[false,false,false]);
 for(const change of [f=>f.glProgram={},f=>f.apply=()=>{},f=>f.resolution=.5,f=>f.antialias='on',f=>f.blendMode='add']){const y=fixture();change(y.filters[0]);assert.equal(y.draw()[0],true);}
 x.C.skipNeutralScenePasses=false;assert.deepEqual(x.draw(),[true,true,true]);
});
