// Native integration: controlled display clocks verify presentation cadence, not physical monitor throughput.
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../../..'),out=path.resolve(process.argv[2]||path.join(root,'scratchpad/runtime-presentation-20261028'));
fs.mkdirSync(out,{recursive:true});
const {WebDriverClient}=require(path.join(root,'editor/tests/smoke/webdriver-client.cjs'));
const copyPath=process.env.RR_PRESENTATION_COPY==='1';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-parity-game-')),project=path.join(temp,'Game'),demo=path.join(root,'template/Demo');
fs.mkdirSync(project);
for(const name of ['index.html','package.json','project.rpgreactor'])fs.copyFileSync(path.join(demo,name),path.join(project,name));
for(const name of ['data','js','icon','css'])if(fs.existsSync(path.join(demo,name)))fs.cpSync(path.join(demo,name),path.join(project,name),{recursive:true});
for(const name of ['img','audio','fonts','effects'])fs.symlinkSync(path.join(demo,name),path.join(project,name));
for(const entry of fs.readdirSync(path.join(root,'runtime'),{withFileTypes:true}))if(entry.isFile()&&entry.name.endsWith('.js')&&entry.name!=='reactor_plugins.js')fs.copyFileSync(path.join(root,'runtime',entry.name),path.join(project,'js',entry.name));
fs.symlinkSync(path.join(demo,'3d'),path.join(project,'3d'));
const write=(name,data)=>fs.writeFileSync(path.join(project,'data',name),JSON.stringify(data));
const system=JSON.parse(fs.readFileSync(path.join(project,'data/System.json')));system.startMapId=1;system.startX=10;system.startY=10;system.partyMembers=[9];system.rrSkipTitle=false;write('System.json',system);
const map=JSON.parse(fs.readFileSync(path.join(project,'data/Map008.json')));map.width=map.height=20;map.data=new Array(20*20*6).fill(0);map.events=[null];map.note='<3d>';map.autoplayBgm=false;write('Map001.json',map);
const sidecar=JSON.parse(fs.readFileSync(path.join(project,'data/Map008.r3d.json')));
Object.assign(sidecar,{width:20,height:20,terrainWidth:20,elevation:new Array(400).fill(0),terrain:new Array(400).fill(0),props:[],pieces:[],foliage:{},surround:{},water:[],events:{},lighting:{ambient:.6,ambientColour:'#ffffff'},camera:{mode:'fixed',yaw:0,pitch:20,distance:12,fov:30},lights:[{id:'sun',type:'sun',x:10,y:10,height:150,radius:150,color:'#fff3e8',intensity:.7,shadow:false,on:true,daylight:'fixed',pitch:40,yaw:20}]});
write('Map001.r3d.json',sidecar);

let driver;
(async()=>{try{
 driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));await driver.start();
 await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${project}`,`user-data-dir=${path.join(temp,'profile')}`,'no-first-run','js-flags=--max-old-space-size=1024']}});
 await driver.setScriptTimeout(120000);
 await driver.waitForScript('return !!window.$dataSystem && !!window.SceneManager?._scene && !SceneManager.isSceneChanging();',[],{timeout:120000});
 await driver.execute(`window.__presentationErrors=[];addEventListener('error',e=>__presentationErrors.push(String(e.error?.stack||e.message)));const error=console.error;console.error=(...a)=>{__presentationErrors.push(a.map(String).join(' ').slice(0,3000));error(...a);};Reactor3D.useSharedContext=!arguments[0];DataManager.setupNewGame();Reactor3D.gpuTierOverride='full';Reactor3D.Quality.enabled=false;Graphics.resize(480,360);SceneManager.goto(Scene_Map);`,[copyPath]);
 await driver.waitForScript(`const v=SceneManager._scene?._spriteset?._reactor3d;return !!v&&!v.arrival&&!v.warming&&SceneManager._scene._fadeDuration===0&&[...v.scene._modelInstances.values()].some(h=>h.character===$gamePlayer&&h.object);`,[],{timeout:120000});
 await driver.execute('Graphics._app.ticker.stop();');
 const library=await driver.execute(`const v=SceneManager._scene._spriteset._reactor3d;return {pixi:PIXI.VERSION,three:THREE.REVISION,revision:RPG_REACTOR_RUNTIME_REVISION,shared:!!v.viewport._shared,writableNamespace:Object.getOwnPropertyDescriptor(THREE,'Mesh').writable,gpu:Graphics.gpuDescription};`);
 const pinned=JSON.parse(fs.readFileSync(path.join(root,'editor/package.json'))).dependencies.three;
 assert.equal(library.pixi,JSON.parse(fs.readFileSync(path.join(root,'editor/package.json'))).dependencies['pixi.js']);
 assert.equal(library.three,pinned.split('.')[1]);assert.equal(library.writableNamespace,true,'classic global retains plugin-compatible writable exports');
 library.pixiBundleSha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(project,'js/libs/pixi.js'))).digest('hex');
 library.bundleSha256=require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(project,'js/libs/three.js'))).digest('hex');assert.equal(library.shared,!copyPath,copyPath?'game uses the canvas-copy fallback':'game uses the shared Pixi/Three WebGL context');
 fs.writeFileSync(path.join(out,'library.json'),JSON.stringify(library,null,2)+'\n');
 const targetPixels=await driver.execute(`
  const r=new THREE.WebGLRenderer({antialias:false,alpha:true}),target=new THREE.WebGLRenderTarget(8,8),scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10),geometry=new THREE.PlaneGeometry(2,2),material=new THREE.MeshBasicMaterial({color:0xff0000});
  scene.add(new THREE.Mesh(geometry,material));camera.position.z=1;r.setPixelRatio(2);r.setSize(8,8,false);r.setClearColor(0,0);
  try{
   r.setRenderTarget(target);r.setViewport(0,0,4,8);r.render(scene,camera);
   const p=new Uint8Array(256);r.readRenderTargetPixels(target,0,0,8,8,p);const sample=()=>[...p.slice(4*1,4*1+4),...p.slice(4*6,4*6+4)];const viewport=sample();
   r.setViewport(0,0,8,8);r.setScissor(4,0,4,8);r.setScissorTest(true);material.color.set(0x0000ff);r.render(scene,camera);r.readRenderTargetPixels(target,0,0,8,8,p);
   return {viewport,scissor:sample(),gl:r.getContext().getError()};
  }finally{r.setRenderTarget(null);target.dispose();geometry.dispose();material.dispose();r.dispose();r.forceContextLoss();}
 `);
 assert.deepEqual(targetPixels.viewport,[255,0,0,255,0,0,0,0],'render-target viewport uses physical pixels at DPR 2');
 assert.deepEqual(targetPixels.scissor,[255,0,0,255,0,0,255,255],'render-target scissor uses physical pixels at DPR 2');assert.equal(targetPixels.gl,0);
 fs.writeFileSync(path.join(out,'target-pixels.json'),JSON.stringify(targetPixels,null,2)+'\n');


 if(process.env.RR_PRESENTATION_METAL==='1'){
  const metal=await driver.execute(`
   const R=Reactor3D,renderer=new THREE.WebGLRenderer({antialias:false});renderer.setSize(96,96);renderer.outputColorSpace=THREE.SRGBColorSpace;
   const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(35,1,.1,20),geometry=new THREE.PlaneGeometry(1,1);
   const material=new THREE.MeshBasicMaterial({color:0x7796b2});material.__reactorModel=true;material.userData.glbShineOwn=true;material.userData.rrClearcoat={factor:.3,roughness:.05};
   R.litMaterial(material);R.setMaterialShine(material,{reflect:1,gloss:.8,metal:1,tint:'#ffffff',texture:.7},true);
   scene.add(new THREE.Mesh(geometry,material));
   const face=document.createElement('canvas');face.width=face.height=1;const cube=new THREE.CubeTexture(Array(6).fill(face));cube.needsUpdate=true;cube.colorSpace=THREE.SRGBColorSpace;
   const target=new THREE.WebGLRenderTarget(96,96),bind=R.Reflections.bind,report=[];
   R.Reflections.bind=function(){const u=this.uniforms();u.rrEnvMap.value=cube;u.rrEnvFlip.value=-1;u.rrEnvMaxLod.value=0;u.rrEnvProbeReach.value=-1;u.rrSkyLight.value.set(1,1,1);};
   try{
    for(const [name,color,x] of [['dark',null,-2],['highlight','#ff0000',-2],['off-axis','#ff0000',2],['blue','#0000ff',-2]]){
     R.packLightUniforms(color?[{type:'point',x:1.5,y:3,height:0,radius:10,colour:Number.parseInt(color.slice(1),16),intensity:1,on:true,shadow:false}]:[],{intensity:0,colour:0xffffff});
     camera.position.set(x,0,4);camera.lookAt(0,0,0);renderer.setRenderTarget(target);renderer.render(scene,camera);
     const pixels=new Uint8Array(96*96*4);renderer.readRenderTargetPixels(target,0,0,96,96,pixels);
     const rgb=[0,0,0];for(let i=0;i<pixels.length;i+=4)for(let c=0;c<3;c++)rgb[c]+=pixels[i+c];
     report.push({name,rgb,gl:renderer.getContext().getError()});
    }
   }finally{R.Reflections.bind=bind;renderer.setRenderTarget(null);geometry.dispose();material.dispose();target.dispose();cube.dispose();renderer.dispose();}
   return report;`);
  console.log(JSON.stringify(metal));
  const [dark,highlight,offAxis,blue]=metal;
  assert.equal(dark.rgb.reduce((a,b)=>a+b,0),0,'metal without light stays dark');
  assert.ok(highlight.rgb[0]>offAxis.rgb[0]*3,'a local lamp produces a view-dependent specular highlight, rather than diffuse paint');
  assert.ok(highlight.rgb[0]>1000&&highlight.rgb[0]>highlight.rgb[2]*10,'red lamp lights the metal red');
  assert.ok(blue.rgb[2]>1000&&blue.rgb[2]>blue.rgb[0]*10,'blue lamp lights the metal blue');
  assert.ok(metal.every(item=>item.gl===0));
  fs.writeFileSync(path.join(out,'metal.json'),JSON.stringify(metal,null,2)+'\n');
 }else{
 const reports=[];
 for(const hz of [50,60,144,180]) {
  const report=await driver.execute(`
   const hz=arguments[0],ss=SceneManager._scene._spriteset,v=ss._reactor3d,p=Graphics.FramePacing;
   const holder=[...v.scene._modelInstances.values()].find(h=>h.character===$gamePlayer&&h.object),object=holder.object;
   $gamePlayer.setThrough(true);$gamePlayer.locate(2,10);Input.clear();Input._currentState.right=true;
   p.enabled=false;ss.updateReactor3DCamera();ss.updateReactor3D();p.enabled=true;
   SceneManager._elapsedTime=0;SceneManager._smoothDeltaTime=60/hz;
   const clock=performance.now.bind(performance),start=clock();let now=start;
   const originalNow=performance.now,draw=ss.drawReactor3D,render=Graphics._app.render,pacedDraw=p.draw,restore=p.restore;
   const pictures=[];let composites=0,restored=true,authoritative=null;
   p.draw=function(){authoritative=[object.position.x,object.position.y,object.position.z,$gamePlayer._realX,$gamePlayer._realY];return pacedDraw.call(this);};
   p.restore=function(){const result=restore.call(this);if(authoritative){const at=[object.position.x,object.position.y,object.position.z,$gamePlayer._realX,$gamePlayer._realY];restored&&=at.every((x,i)=>Math.abs(x-authoritative[i])<1e-8);}return result;};
   p._paced=hz!==60;p._ease=hz!==60?p.EASE_FRAMES:0;p._last=now;p.frameMs=1000/hz;p._intervalCount=0;p._capturedAt=-1;
   const counter=Graphics._fpsCounter;counter._sampleStart=now;counter._presented=0;
   ss.drawReactor3D=function(state){const value=draw.call(this,state);pictures.push({x:object.matrixWorld.elements[12],camera:v.camera.position.x,tick:Graphics.frameCount,real:$gamePlayer._realX,alpha:p.alpha()});return value;};
   Graphics._app.render=function(){composites++;return render.call(this);};
   const frame=Graphics.frameCount,world=Graphics.worldFrameCount||0,frames=Math.round(hz*1.5);
   try{
    performance.now=()=>now;
    for(let i=1;i<=frames;i++){now=start+i*1000/hz;Graphics._onTick(60/hz);}
   }finally{
    performance.now=originalNow;ss.drawReactor3D=draw;Graphics._app.render=render;p.draw=pacedDraw;p.restore=restore;Input.clear();
   }
   const changed=pictures.slice(1).filter((p,i)=>Math.abs(p.x-pictures[i].x)>1e-8).length;
   // Resetting a fixture teleports the character; wait for two real updates to establish pose history.
   const steady=pictures.slice(Math.ceil(hz*.1));
   const steadyChanged=steady.slice(1).filter((item,i)=>Math.abs(item.x-steady[i].x)>1e-8).length;
   return {hz,steady:steady.length,steadyChanged,frames,composites,pictures:pictures.length,world:(Graphics.worldFrameCount||0)-world,updates:Graphics.frameCount-frame,changed,f2:counter.fps,seconds:(now-start)/1000,gameX:$gamePlayer._realX,restored,gl:v.viewport.renderer().getContext().getError(),errors:__presentationErrors};`,[hz]);
  console.log(JSON.stringify(report));reports.push(report);
  assert.equal(report.world,report.frames,'one actual world render per available refresh');
  assert.equal(report.composites,report.frames);
  assert.equal(report.updates,90,'same game time at every refresh rate');
  if(reports.length>1)assert.ok(Math.abs(report.gameX-reports[0].gameX)<1e-6,'same distance travelled at every refresh rate');
  assert.equal(report.steadyChanged,report.steady-1,'every refresh advances the rendered matrix once pose history is available');
  assert.ok(Math.abs(report.f2-hz)<3,'F2 counts actual pictures');
  assert.equal(report.restored,true,'interpolation restores game-owned transforms');
  assert.equal(report.gl,0);assert.equal(report.errors.length,0,report.errors.join('\n'));
 }
 fs.writeFileSync(path.join(out,'cadence.json'),JSON.stringify(reports,null,2)+'\n');
 }
}finally{await driver?.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
