const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../../runtime/reactor_sprites.js'),'utf8');
function setup(){
 let clears=0,copies=0,draws=0;const Sprite_Animation=function(){};
 Sprite_Animation._pendingRenders=[];
 const gl={viewport(){},clearColor(){},clear(){clears++;},COLOR_BUFFER_BIT:1,DEPTH_BUFFER_BIT:2};
 const context={Sprite_Animation,PIXI:{TextureSource:{}},Graphics:{_effekseerGL:gl,_effekseerCanvas:{width:100,height:100},blitSceneBehindEffects(){copies++;return true;},effekseer:{beginDraw(){},drawHandle(){draws++;},endDraw(){}},settleEffekseerState(){}},console};
 vm.createContext(context);
 for(const name of ['Sprite_Animation.renderActive','Sprite_Animation.prototype._render','Sprite_Animation.prototype._doEffekseerDraw']){
  const start=source.indexOf(name+' = function('),end=source.indexOf('\n};',start)+3;assert.ok(start>=0&&end>start);vm.runInContext(source.slice(start,end),context);
 }
 return {A:Sprite_Animation,context,counts:()=>({clears,copies,draws})};
}
test('hidden 3D effects never enter the 2D overlay queue or its legacy direct draw',()=>{
 const {A,context,counts}=setup(),sprite=new A();Object.assign(sprite,{_reactorInScene:true,visible:false,_targets:[{}],_handle:{exists:true}});
 sprite._render({});assert.equal(A._pendingRenders.length,0);
 sprite._doEffekseerDraw({},true);assert.equal(counts().draws,0);
 context.PIXI.TextureSource=null;sprite._render({});assert.equal(counts().draws,0);
});
test('an animation claimed by the scene after queuing cannot trigger a full-screen copy',()=>{
 const {A,counts}=setup(),sprite=new A();Object.assign(sprite,{_targets:[{}],_handle:{exists:true}});
 sprite._render({});assert.equal(A._pendingRenders.length,1);sprite._reactorInScene=true;
 A.renderActive({});assert.deepEqual(counts(),{clears:1,copies:0,draws:0});assert.equal(A._pendingRenders.length,0);
});
test('mixed queues retain normal 2D effects in order and still clear an empty overlay',()=>{
 const {A,counts}=setup(),order=[],a={_doEffekseerDraw(r,c){assert.equal(c,true);order.push('a');}},b={_doEffekseerDraw(){order.push('b');}};
 A._pendingRenders.push({_reactorInScene:true},a,{_reactorInScene:true},b);A.renderActive({});assert.deepEqual(order,['a','b']);assert.equal(counts().copies,1);assert.equal(A._pendingRenders.length,0);
 A.renderActive({});assert.equal(counts().clears,2);assert.equal(counts().copies,1);
});
test('an overlay that stayed empty is neither cleared again nor shown, and shows while 2D effects draw',()=>{
 const {A,context,counts}=setup();const shown=[];context.Graphics.showEffekseerOverlay=v=>shown.push(v);
 A.renderActive({});A.renderActive({});A.renderActive({});assert.equal(counts().clears,1,'only the first, unknown state is cleared');
 A._pendingRenders.push({_doEffekseerDraw(){}});A.renderActive({});assert.equal(counts().clears,2);
 A.renderActive({});assert.equal(counts().clears,3,'what the effect drew is cleared once');A.renderActive({});assert.equal(counts().clears,3);
 context.Graphics._effekseerOverlayDirty=true;A.renderActive({});assert.equal(counts().clears,4,'an in-scene draw on the overlay marks it for clearing');
 assert.deepEqual(shown,[false,false,false,true,false,false,false]);
});
