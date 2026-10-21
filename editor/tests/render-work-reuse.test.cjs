'use strict';
const assert=require('node:assert/strict'),test=require('node:test'),path=require('node:path');
const repo=path.resolve(__dirname,'../..');
const R=require(path.join(repo,'runtime/reactor_3d.js'));require(path.join(repo,'runtime/libs/three.js'));
const T=global.THREE;
test('unchanged skeletons retain the exact palette and texture upload version across passes',()=>{
 const root=new T.Bone(),child=new T.Bone();root.add(child);child.position.y=2;root.updateMatrixWorld(true);
 const skeleton=new T.Skeleton([root,child]);skeleton.computeBoneTexture();R.SkeletonUpdates.install(skeleton);
 skeleton.update();const version=skeleton.boneTexture.version,initial=skeleton.boneMatrices.slice();
 for(let i=0;i<10;i++)skeleton.update();assert.equal(skeleton.boneTexture.version,version);assert.deepEqual(skeleton.boneMatrices,initial);
 for(let frame=0;frame<20;frame++){
  root.rotation.y=frame*.1;child.rotation.x=frame*.03;root.updateMatrixWorld(true);
  skeleton.update();const actual=skeleton.boneMatrices.slice(),v=skeleton.boneTexture.version;
  skeleton.update();assert.equal(skeleton.boneTexture.version,v);
  T.Skeleton.prototype.update.call(skeleton);assert.deepEqual(actual,skeleton.boneMatrices);
 }
 skeleton.boneInverses[1].elements[12]+=1;skeleton.update();const inverse=skeleton.boneMatrices.slice();T.Skeleton.prototype.update.call(skeleton);assert.deepEqual(inverse,skeleton.boneMatrices);
 skeleton.boneMatrices[0]=100;skeleton.update();assert.notEqual(skeleton.boneMatrices[0],100);
 const v=skeleton.boneTexture.version;skeleton.boneMatrices=skeleton.boneMatrices.slice();skeleton.update();assert.ok(skeleton.boneTexture.version>v);
 skeleton.boneTexture=new T.DataTexture();skeleton.update();assert.equal(skeleton.boneTexture.version,1);
 R.SkeletonUpdates.enabled=false;try{const v=skeleton.boneTexture.version;skeleton.update();skeleton.update();assert.equal(skeleton.boneTexture.version,v+2);}finally{R.SkeletonUpdates.enabled=true;}
 skeleton.update();const v2=skeleton.boneTexture.version;skeleton.update();assert.equal(skeleton.boneTexture.version,v2);
});
test('custom skeleton update implementations are preserved',()=>{
 const skeleton=new T.Skeleton([]),custom=()=>{};skeleton.update=custom;R.SkeletonUpdates.install(skeleton);assert.equal(skeleton.update,custom);
});
test('empty shared targets are cleared once and drawn again as soon as content returns',()=>{
 const renderer={autoClear:true,autoClearColor:true,autoClearDepth:true,autoClearStencil:true,getClearAlpha:()=>0};
 const viewport={_shared:true,_renderer:renderer},target=new T.WebGLRenderTarget(8,8),scene=new T.Scene(),camera=new T.Camera();let draws=0;
 const render=()=>R.EmptyPass.render(viewport,target,scene,camera,()=>draws++);
 render();render();assert.equal(draws,1);
 const mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial());scene.add(mesh);render();assert.equal(draws,2);
 mesh.visible=false;render();render();assert.equal(draws,3);
 mesh.visible=true;mesh.layers.set(2);render();assert.equal(draws,3);camera.layers.enable(2);render();assert.equal(draws,4);
 mesh.visible=false;render();target.setSize(16,16);render();assert.equal(draws,6,'resizing discards the cleared result');
 scene.onBeforeRender=()=>{};render();render();assert.equal(draws,8,'callbacks still run');
 scene.onBeforeRender=T.Object3D.prototype.onBeforeRender;viewport._shared=false;render();render();assert.equal(draws,10,'a canvas overwritten between passes cannot reuse the target');
});
test('a failed empty draw and pending shadows cannot mark a target clear',()=>{
 const viewport={_shared:true,_renderer:{autoClear:true,autoClearColor:true,autoClearDepth:true,autoClearStencil:true,getClearAlpha:()=>0}},target=new T.WebGLRenderTarget(8,8),scene=new T.Scene(),camera=new T.Camera();
 assert.throws(()=>R.EmptyPass.render(viewport,target,scene,camera,()=>{throw Error('draw failed');}));let draws=0;
 R.EmptyPass.render(viewport,target,scene,camera,()=>draws++);assert.equal(draws,1);
 const old=R.Shadows._sentinel,pending=R.Shadows._pending,sentinel=new T.Mesh(new T.BufferGeometry());sentinel.onBeforeRender=()=>{};scene.add(sentinel);R.Shadows._sentinel=sentinel;
 try{R.Shadows._pending=null;assert.equal(R.EmptyPass.hasWork(scene,camera),false);R.Shadows._pending={};assert.equal(R.EmptyPass.hasWork(scene,camera),true);}finally{R.Shadows._sentinel=old;R.Shadows._pending=pending;}
});
test('invisible tile rejection follows material changes and preserves fractional and opaque pixels',()=>{
 const m=new T.MeshBasicMaterial({transparent:true,depthWrite:false}),shader={uniforms:{},fragmentShader:'#include <alphatest_fragment>'};let before=0,compile=0;
 m.onBeforeRender=()=>before++;m.onBeforeCompile=()=>compile++;R.TransparentPixels.install(m);m.onBeforeCompile(shader,null);m.onBeforeRender();assert.equal(compile,1);assert.equal(before,1);assert.equal(shader.uniforms.rrInvisiblePixels.value,1);
 assert.match(shader.fragmentShader,/diffuseColor.a == 0.0/);assert.doesNotMatch(shader.fragmentShader,/>= 1/);
 for(const [key,value]of [['depthWrite',true],['stencilWrite',true],['alphaToCoverage',true],['transparent',false],['blending',T.AdditiveBlending]]){const old=m[key];m[key]=value;m.onBeforeRender();assert.equal(shader.uniforms.rrInvisiblePixels.value,0,key);m[key]=old;}
 R.TransparentPixels.enabled=false;try{m.onBeforeRender();assert.equal(shader.uniforms.rrInvisiblePixels.value,0);}finally{R.TransparentPixels.enabled=true;}
});

test('a combined attachment frame equals the original queries through moving and reflected parents',()=>{
 const root=new T.Group(),object=new T.Group(),part=new T.Group();root.add(object);object.add(part);part.name='anchor';part.userData.__restQuaternion=new T.Quaternion().setFromEuler(new T.Euler(.2,.3,.1));
 const effect={anchor:{part:'anchor',offset:[.3,1.4,-.5]}};let frame;
 for(let i=0;i<30;i++){
  root.rotation.set(.03*i,.01*i,.07*i);root.scale.set(i%2?-1.5:1.5,1+i*.02,.8);object.rotation.set(.2,.04*i,-.1);part.rotation.set(.06*i,-.3,.5);part.position.y=i*.1;
  frame=R.effectAnchorTransform(object,effect,frame);
  const equal=(a,b)=>assert.ok(a.toArray().every((x,j)=>Math.abs(x-b.toArray()[j])<1e-12));
  equal(frame.world,R.effectAnchorWorld(object,effect));equal(frame.turn,object.getWorldQuaternion(new T.Quaternion()));equal(frame.scale,object.getWorldScale(new T.Vector3()));equal(frame.pose,R.effectAnchorQuaternion(object,effect));
 }
 object.remove(part);frame=R.effectAnchorTransform(object,effect,frame);assert.deepEqual(frame.pose.toArray(),[0,0,0,1]);assert.ok(frame.world.distanceTo(R.effectAnchorWorld(object,effect))<1e-12);
});
test('incremental light masks match a full pack as lights move, reorder, resize and disappear',()=>{
 const D=R.LightGrid,u={rrLightCount:{value:32},rrLightPos:{value:new Float32Array(128)},rrLightColor:{value:new Float32Array(128)},rrLightAim:{value:new Float32Array(128)}};
 let seed=71;const random=()=>((seed=Math.imul(seed,1664525)+1013904223)>>>0)/4294967296;
 for(let i=0;i<32;i++){const a=i*4;u.rrLightPos.value.set([random()*50,random()*10,random()*50,2+random()*15],a);u.rrLightColor.value.set([1,1,1,i%3],a);u.rrLightAim.value.set([0,0,1,.4],a);}
 const expected=new Uint32Array(D.size[0]*D.size[1]*D.size[2]),focus={x:24,y:24};
 for(let frame=0;frame<60;frame++){
  u.rrLightCount.value=8+frame%25;
  for(let i=0;i<frame%33;i++){const a=i*4;u.rrLightPos.value[a]+=.13;u.rrLightPos.value[a+3]=.01+random()*20;u.rrLightAim.value[a]=Math.sin(frame*.1);u.rrLightAim.value[a+2]=Math.cos(frame*.1);}
  if(frame%8===0)focus.x+=9;
  D.update(u,focus);D.fill(expected,u.rrLightGridOrigin.value,u.rrLightCount.value,u.rrLightPos.value,u.rrLightColor.value,u.rrLightAim.value);
  assert.deepEqual(u.rrLightGrid.value.image.data,expected);
  const version=u.rrLightGrid.value.version;D.update(u,focus);assert.equal(u.rrLightGrid.value.version,version);
  u.rrLightColor.value[0]+=.1;D.update(u,focus);assert.equal(u.rrLightGrid.value.version,version,'RGB changes do not change intersections');
 }
 D.cacheEnabled=false;try{D.update(u,focus);}finally{D.cacheEnabled=true;}D.update(u,focus);assert.deepEqual(u.rrLightGrid.value.image.data,expected);
 u.rrLightCount.value=0;D.update(u,focus);assert.equal(u.rrLightGridEnabled.value,0);u.rrLightGrid.value.dispose();
});
test('one row clear covers all six shadow faces while only selected faces draw',()=>{
 const target={viewport:new T.Vector4(),scissor:new T.Vector4()},camera=new T.PerspectiveCamera(90,1,.1,20),scene=new T.Scene(),origin=new T.Vector3();let current;
 for(const mask of [0,1,0b010101,63]){
  const clears=[],draws=[];const renderer={setRenderTarget(t){current=t;},clear(c,d,s){assert.deepEqual([c,d,s],[false,true,false]);clears.push(current.scissor.toArray());},render(){draws.push(current.viewport.toArray());}};
  R.Shadows._renderFaces(renderer,scene,target,32,2,origin,camera,mask);
  assert.deepEqual(clears,[[0,64,192,32]]);
  assert.deepEqual(draws,Array.from({length:6},(_,face)=>face).filter(face=>mask&(1<<face)).map(face=>[face*32,64,32,32]));
 }
});
