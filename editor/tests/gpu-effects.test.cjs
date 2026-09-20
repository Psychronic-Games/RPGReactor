const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=require('./helpers/runtime-3d-source.cjs').source3D();
function setup(){
 const timers=[],deleted=[],readings=[],releases=[];let now=0,result=1,readFB='previous',pack='pack';
 const gl={READ_FRAMEBUFFER_BINDING:10,PIXEL_PACK_BUFFER_BINDING:11,READ_FRAMEBUFFER:12,PIXEL_PACK_BUFFER:13,
  TIMEOUT_EXPIRED:1,ALREADY_SIGNALED:2,CONDITION_SATISFIED:3,WAIT_FAILED:4,STREAM_READ:20,RGBA:21,UNSIGNED_BYTE:22,
  SYNC_GPU_COMMANDS_COMPLETE:23,getParameter:k=>k===10?readFB:pack,createBuffer:()=>({buffer:true}),
  bindFramebuffer:(k,v)=>{readFB=v;},bindBuffer:(k,v)=>{pack=v;},bufferData(){},readPixels(){},fenceSync:()=>({fence:true}),flush(){},
  clientWaitSync:()=>result,isContextLost:()=>false,deleteSync:v=>deleted.push(v),deleteBuffer:v=>deleted.push(v),
  getBufferSubData(k,o,bytes){readings.push(true);bytes.fill(27);}};
 const context={Reactor3D:{},performance:{now:()=>now},setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},
  effekseer:{releaseContext:c=>releases.push(c)},Uint8Array,Set,Map,console};
 vm.createContext(context);vm.runInContext(source.slice(source.indexOf('Reactor3D.GpuEffects ='),source.indexOf('/** Effect coverage is advisory;')),context);
 const G=context.Reactor3D.GpuEffects,entry={gl,renderer:{properties:{get:()=>({__webglFramebuffer:'effect'})},resetState(){}},context:{_makeContextCurrent(){}},targets:new Set(),cache:new Map(),loading:0};
 return {G,entry,context,timers,deleted,readings,releases,advance:t=>{now=t;},signal:r=>{result=r;},bindings:()=>[readFB,pack]};
}
test('coverage timeout cancels without synchronously reading unfinished GPU work',()=>{
 const s=setup();let value='pending';assert.equal(s.G.read(s.entry,{width:4,height:2},p=>value=p),true);
 assert.deepEqual(s.bindings(),['previous','pack']);s.timers.shift()();assert.equal(s.readings.length,0);
 s.advance(2001);s.timers.shift()();assert.equal(value,null);assert.equal(s.readings.length,0);assert.equal(s.deleted.length,2);assert.equal(s.G._reads.size,0);
});
test('completed coverage restores both buffer bindings and releases the fence once',()=>{
 const s=setup();let value;s.G.read(s.entry,{width:4,height:2},(p,w,h)=>value={p,w,h});s.signal(2);s.timers.shift()();
 assert.equal(value.p.length,32);assert.equal(value.p[0],27);assert.equal(value.w,4);assert.equal(value.h,2);
 assert.deepEqual(s.bindings(),['previous','pack']);assert.equal(s.deleted.length,2);assert.equal(s.readings.length,1);
});
test('disposing an effect context cancels readbacks and defers native release through outstanding asset loads',()=>{
 const s=setup();s.entry.loading=1;let calls=0;s.G.read(s.entry,{width:4,height:2},p=>{assert.equal(p,null);calls++;});
 s.G._runtime.set(s.entry.renderer,s.entry);s.G.release(s.entry);assert.equal(calls,1);assert.equal(s.releases.length,0);assert.equal(s.G._runtime.size,0);
 const replacement={};s.G._runtime.set(s.entry.renderer,replacement);s.G.loaded(s.entry);s.G.loaded(s.entry);
 assert.equal(s.releases.length,1);assert.equal(s.G._runtime.get(s.entry.renderer),replacement);s.timers.shift()();assert.equal(calls,1);assert.equal(s.readings.length,0);
});
test('GPU context loss drops a coverage result instead of learning false empty bounds',()=>{
 const s=setup();let result;s.G.read(s.entry,{width:4,height:2},p=>result=p);s.entry.gl.isContextLost=()=>true;s.timers.shift()();
 assert.equal(result,null);assert.equal(s.readings.length,0);assert.equal(s.G._reads.size,0);
});
test('map cleanup stops only that map and releases every effect even after a native stop failure',()=>{
 const s=setup(),start=source.indexOf('Reactor3D.EffekseerScene =');vm.runInContext(source.slice(start,source.indexOf('/** The longest side of a model instance',start)),s.context);
 const E=s.context.Reactor3D.EffekseerScene,scene={},other={},freed=[];
 const make=(owner,id,fail)=>({scene:owner,done:false,track:{},sprite:{_playing:true,_effectContext:{context:{_makeContextCurrent(){}}},_handle:{stop(){if(fail)throw Error('lost');}}},
  _gpuEffectTarget:{dispose(){freed.push(id);}},quad:{mesh:{geometry:{dispose(){}}},material:{dispose(){}},texture:{dispose(){}}}});
 const a=make(scene,1,true),b=make(scene,2,false),c=make(other,3,false);E._live.push(a,b,c);E.stopScene(scene);
 assert.deepEqual(freed,[1,2]);assert.equal(E._live.length,1);assert.equal(E._live[0],c);assert.equal(a.sprite._handle,null);assert.equal(b.sprite._playing,false);
});
