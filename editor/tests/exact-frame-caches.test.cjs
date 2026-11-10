const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'../..');const R=require(path.join(root,'runtime/reactor_3d.js'));require(path.join(root,'runtime/libs/three.js'));
const V=require(path.join(root,'runtime/reactor_media_surfaces.js'));
test('video cache accepts only unchanged canonical descriptors and valid playback-clock changes',()=>{
 const m=new V.VideoSurfaceManager(),raw={id:2,file:'panel.webm',target:'player',anchor:{part:'Screen',offset:[0,1,0],size:[2,3]}};
 const a=m.storedDescriptor(raw);assert.ok(a);assert.equal(m.storedDescriptor(a),a);a.currentTime=4.25;assert.equal(m.storedDescriptor(a),a);
 for(const change of [x=>x.anchor.offset[1]=3,x=>x.corners[0].x=17,x=>x.rotationZ=45,x=>x.opacity=.25,x=>x.anchor.size[1]=7,x=>x.playbackRate=2]){
  const value=m.storedDescriptor(JSON.parse(JSON.stringify(a)));change(value);const expected=V.normalizeShowArgs(value,null);const result=m.storedDescriptor(value);assert.deepEqual(result,expected);assert.notEqual(result,value);assert.equal(m.storedDescriptor(result),result);
 }
 const bad=m.storedDescriptor(a);bad.currentTime=NaN;assert.equal(m.storedDescriptor(bad),null);
 const other=m.storedDescriptor(raw);other.file='../escape.mp4';assert.equal(m.storedDescriptor(other),null);
 const removed=m.storedDescriptor(raw);delete removed.width;assert.deepEqual(m.storedDescriptor(removed),V.normalizeShowArgs(removed,null));
});
test('sparse light updates match a fresh grid through bit 31, removals, shape changes and moving origins',()=>{
 const U=R.lightUniforms(),G=R.LightGrid;let seed=247;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 G.slackEnabled=false;
 try{
 for(let frame=0;frame<170;frame++){
  const count=frame<60?32:frame<100?8:24;U.rrLightCount.value=count;
  const slots=frame%17===0?count:5;
  for(let n=0;n<slots;n++){const i=frame%17===0?n:Math.floor(random()*count),a=i*4;U.rrLightPos.value.set([random()*60,random()*20,random()*60,random()*20],a);U.rrLightColor.value[a+3]=i%3;
   const angle=random()*6.28;U.rrLightAim.value.set([Math.cos(angle),0,Math.sin(angle),i%3===2?random()*3:.7],a);}
  G.updateCached(U,{x:Math.floor(frame/30)*8,y:24,groundY:0});const ref=new Uint32Array(G.size[0]*G.size[1]*G.size[2]);G.fill(ref,U.rrLightGridOrigin.value,count,U.rrLightPos.value,U.rrLightColor.value,U.rrLightAim.value);assert.deepEqual(U.rrLightGrid.value.image.data,ref,'frame '+frame);
  const v=U.rrLightGrid.value.version;U.rrLightColor.value[0]=random();G.updateCached(U,{x:Math.floor(frame/30)*8,y:24,groundY:0});assert.equal(U.rrLightGrid.value.version,v,'colour alone never changes cell masks');
 }
 }finally{G.slackEnabled=true;}
});
test('slack-packed lights never lose a cell they reach, and repack once they leave their slack',()=>{
 const U=R.lightUniforms(),G=R.LightGrid;let seed=91;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 assert.equal(G.slackEnabled,true);
 const count=24;U.rrLightCount.value=count;const focus={x:24,y:24,groundY:0};
 for(let i=0;i<count;i++){const a=i*4;U.rrLightPos.value.set([10+random()*40,random()*12,10+random()*40,2+random()*20],a);U.rrLightColor.value[a+3]=i%3;const t=random()*6.28;U.rrLightAim.value.set([Math.cos(t),-0.3,Math.sin(t),i%3===2?1+random()*2:.8],a);
  if(i%3!==0){const l=Math.hypot(Math.cos(t),-0.3,Math.sin(t));U.rrLightAim.value[a]/=l;U.rrLightAim.value[a+1]/=l;U.rrLightAim.value[a+2]/=l;}}
 const slackOf=()=>{const s=new Float64Array(64);for(let i=0;i<count;i++){s[i*2]=Math.min(G.SLACK_MAX,Math.max(G.SLACK_MIN,Math.abs(U.rrLightPos.value[i*4+3])*G.SLACK_SHARE));s[i*2+1]=G.SLACK_TURN;}return s;};
 const size=G.size[0]*G.size[1]*G.size[2],exact=new Uint32Array(size),padded=new Uint32Array(size);
 G.updateCached(U,focus);
 G.fill(padded,U.rrLightGridOrigin.value,count,U.rrLightPos.value,U.rrLightColor.value,U.rrLightAim.value,-1,null,slackOf());
 assert.deepEqual(U.rrLightGrid.value.image.data,padded,'a fresh grid packs every light with its slack');
 let kept=0;
 for(let frame=0;frame<120;frame++){
  // Small sweeps and flicker (mostly inside the slack), now and then a jump (outside it).
  for(let i=0;i<count;i++){const a=i*4,jump=random()<0.05;U.rrLightPos.value[a]+=jump?3:(random()-0.5)*0.06;U.rrLightPos.value[a+3]=Math.max(0.5,U.rrLightPos.value[a+3]+(random()-0.5)*0.1);
   if(i%3!==0){const t=Math.atan2(U.rrLightAim.value[a+2],U.rrLightAim.value[a])+(jump?0.5:0.004),y=U.rrLightAim.value[a+1],h=Math.sqrt(Math.max(0,1-y*y));U.rrLightAim.value[a]=Math.cos(t)*h;U.rrLightAim.value[a+2]=Math.sin(t)*h;}}
  const before=U.rrLightGrid.value.version;
  G.updateCached(U,focus);if(U.rrLightGrid.value.version===before)kept++;
  G.fill(exact,U.rrLightGridOrigin.value,count,U.rrLightPos.value,U.rrLightColor.value,U.rrLightAim.value);
  const data=U.rrLightGrid.value.image.data;
  for(let cell=0;cell<size;cell++)assert.equal((exact[cell]&~data[cell])>>>0,0,'frame '+frame+' cell '+cell+': a light lost a cell it reaches');
 }
 assert.ok(kept>0,'frames inside the slack keep the grid as it was');
 // Every light far away: all packed afresh, with their slack, where they now stand.
 for(let i=0;i<count;i++)U.rrLightPos.value[i*4+2]+=5;
 G.updateCached(U,focus);
 G.fill(padded,U.rrLightGridOrigin.value,count,U.rrLightPos.value,U.rrLightColor.value,U.rrLightAim.value,-1,null,slackOf());
 assert.deepEqual(U.rrLightGrid.value.image.data,padded,'lights that left their slack are packed again where they stand');
});

test('effect scissors round outward and restore the caller target state',()=>{
 const T=global.THREE,q=R.EffekseerScene.quadFor({}),u=q.material.uniforms;
 u.resolution.value.set(100,80);u.rectMin.value.set(.123,.208);u.rectSize.value.set(.321,.413);
 const target={width:100,height:80,scissorTest:false,scissor:new T.Vector4(0,0,100,80)},rects=[],flags=[];
 const renderer={getRenderTarget:()=>target,getScissorTest:()=>false,state:{scissor:r=>rects.push(r.toArray()),setScissorTest:f=>flags.push(f)}};
 q.mesh.onBeforeRender(renderer);assert.deepEqual(rects[0],[12,16,33,34]);q.mesh.onAfterRender(renderer);
 assert.deepEqual(rects[1],[0,0,100,80]);assert.deepEqual(flags,[true,false]);assert.equal(target.scissorTest,false);
 target.scissorTest=true;q.mesh.onBeforeRender(renderer);q.mesh.onAfterRender(renderer);assert.equal(rects.length,2);
 target.scissorTest=false;target.width=50;q.mesh.onBeforeRender(renderer);q.mesh.onAfterRender(renderer);assert.equal(rects.length,2,'a different pass keeps its own state');
});
