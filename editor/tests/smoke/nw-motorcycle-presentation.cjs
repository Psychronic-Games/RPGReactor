// Native integration: controlled display clocks verify presentation cadence, not physical monitor throughput.
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),assert=require('assert/strict');
const root=path.resolve(__dirname,'../../..'),out=path.resolve(process.argv[2]||path.join(root,'scratchpad/motorcycle-regressions-20261028'));
fs.mkdirSync(out,{recursive:true});
const {WebDriverClient}=require(path.join(root,'editor/tests/smoke/webdriver-client.cjs'));
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-parity-game-')),project=path.join(temp,'Game'),demo=path.join(root,'template/Demo');
fs.mkdirSync(project);
for(const name of ['index.html','package.json','project.rpgreactor'])fs.copyFileSync(path.join(demo,name),path.join(project,name));
for(const name of ['data','js','icon','css'])if(fs.existsSync(path.join(demo,name)))fs.cpSync(path.join(demo,name),path.join(project,name),{recursive:true});
for(const name of ['img','audio','fonts','effects'])fs.symlinkSync(path.join(demo,name),path.join(project,name));
for(const entry of fs.readdirSync(path.join(root,'runtime'),{withFileTypes:true}))if(entry.isFile()&&entry.name.endsWith('.js')&&entry.name!=='reactor_plugins.js')fs.copyFileSync(path.join(root,'runtime',entry.name),path.join(project,'js',entry.name));
fs.symlinkSync(path.join(demo,'3d'),path.join(project,'3d'));
const write=(name,data)=>fs.writeFileSync(path.join(project,'data',name),JSON.stringify(data));
const system=JSON.parse(fs.readFileSync(path.join(project,'data/System.json')));Object.assign(system,{startMapId:5,startX:189,startY:38,partyMembers:[1],rrSkipTitle:false});write('System.json',system);
const vehicles=JSON.parse(fs.readFileSync(path.join(project,'data/ReactorVehicles.json')));Object.assign(vehicles[1],{startMapId:5,startX:190,startY:38,startDirection:6,copyCount:1,copies:[]});write('ReactorVehicles.json',vehicles);
for(const id of [5,8]){const name='Map'+String(id).padStart(3,'0');const map=JSON.parse(fs.readFileSync(path.join(project,'data',name+'.json')));for(const e of map.events)if(e)for(const p of e.pages)if(p.trigger>=3)p.list=[{code:0,indent:0,parameters:[]}];write(name+'.json',map);const side=JSON.parse(fs.readFileSync(path.join(project,'data',name+'.r3d.json')));side.lighting={ambient:.85,ambientColour:'#ffffff'};side.lights=side.lights.filter(l=>l.type==='sun');for(const light of side.lights){light.daylight='fixed';light.intensity=1;}write(name+'.r3d.json',side);}

let driver;
const snap=`const ss=SceneManager._scene._spriteset,v=ss._reactor3d,Q=Reactor3D.Quality,S=Reactor3D.Shadows,bike=ReactorVehicles.ridden(),rows=[];
for(const holder of v.scene._modelInstances.values())if(holder.character===$gamePlayer||holder.character===bike){const o=holder.object;if(o)rows.push({who:holder.character===bike?'bike':'rider',event:holder.character.eventId?.(),moving:S._dynamic.has(o),static:S._static.has(o),casting:S._casting?.has(o),primary:!!(o.userData.reactorPlayer||o.userData.reactorRidden),visible:o.visible,shadow:o.userData.reactorShadowCaster,triangles:S._casterTriangles(o),children:o.children.length});}
return {map:$gameMap.mapId(),x:$gamePlayer._realX,speed:$gamePlayer._rrDrive?.v,quality:{g:Q.g,c:Q.c,scale:Q.scale(),shadows:Q.shadows(),setting:Q.setting(),profile:ConfigManager.graphicsAuto},active:S.active(),sun:S._sun?.cascades.map(c=>({valid:c.valid,dynamic:c.hasDyn,dynValid:c.dynValid})),cameraFov:v.camera.fov,rows,errors:__rideErrors,gl:v.viewport.renderer().getContext().getError()};`;
(async()=>{try{
 driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));await driver.start();
 await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${project}`,`user-data-dir=${path.join(temp,'profile')}`,'no-first-run','js-flags=--max-old-space-size=1024']}});await driver.setScriptTimeout(120000);
 const execute=driver.execute.bind(driver);
 driver.execute=async function(script,args=[]){const result=await execute('try{'+script+'}catch(e){return {nativeFailure:String(e.stack||e)}}',args);if(result?.nativeFailure)throw Error(result.nativeFailure);return result;};
 await driver.waitForScript('return !!window.$dataSystem && !!window.SceneManager?._scene && !!window.DataManager && DataManager.isDatabaseLoaded() && ConfigManager.isLoaded() && SceneManager._scene.isStarted() && !(SceneManager._scene instanceof Scene_Boot) && !SceneManager.isSceneChanging();',[],{timeout:120000});
 await driver.execute(`window.__rideErrors=[];addEventListener('error',e=>__rideErrors.push(String(e.error?.stack||e.message)));SceneManager.isGameActive=()=>true;ConfigManager.graphicsQuality='auto';ConfigManager.graphicsAuto={gpu:3,cpu:2,half:false};Reactor3D.Quality._loaded=false;Reactor3D.gpuTierOverride='full';Graphics.resize(640,360);DataManager.setupNewGame();SceneManager.goto(Scene_Map);`);
 await driver.waitForScript(`const v=SceneManager._scene?._spriteset?._reactor3d;return !!v&&!v.arrival&&!v.warming&&SceneManager._scene._fadeDuration===0&&[...v.scene._modelInstances.values()].some(h=>h.character?._rrVehicle===1&&h.object);`,[],{timeout:120000});
 await driver.execute(`const e=ReactorVehicles.list().find(e=>e._rrVehicle===1);if(!ReactorVehicles.getOn(e,{instant:true}))throw Error('Could not board motorcycle');window.__boardAt=Graphics.frameCount;`);
 await driver.waitForScript(`return $gamePlayer._vehicleType==='reactor'&&!$gamePlayer._rrMount&&Graphics.frameCount>__boardAt+20;`,[],{timeout:90000});
 const reports=[];reports.push(await driver.execute(snap));console.log(JSON.stringify(reports.at(-1)));

 const projection=await driver.execute(`
  Graphics._app.ticker.stop();const p=Graphics.FramePacing,v=SceneManager._scene._spriteset._reactor3d,nowReal=performance.now;
  let now=nowReal.call(performance);const start=now,samples=[];
  const bike=ReactorVehicles.ridden(),object=[...v.scene._modelInstances.values()].find(h=>h.character===bike).object;
  const note=()=>samples.push({tick:Graphics.frameCount,fov:v.camera.fov,zoom:v.camera.zoom,projection:v.camera.projectionMatrix.elements[5],x:object.matrixWorld.elements[12],z:object.matrixWorld.elements[14]});
  p._paced=true;p._ease=p.EASE_FRAMES;p._last=now;p._intervalCount=0;p.frameMs=1000/180;
  SceneManager._elapsedTime=0;SceneManager._smoothDeltaTime=1/3;Input._currentState.up=true;Graphics._reactorBeforeRender.add(note);
  try{performance.now=()=>now;for(let i=1;i<=90;i++){now=start+i*1000/180;Graphics._onTick(1/3);}}
  finally{performance.now=nowReal;Graphics._reactorBeforeRender.delete(note);Graphics._app.ticker.start();}
  const steady=samples.slice(18);let intermediate=0,moving=0,pairs=0;for(let i=1;i<steady.length;i++)if(steady[i].tick===steady[i-1].tick){pairs++;if(Math.hypot(steady[i].x-steady[i-1].x,steady[i].z-steady[i-1].z)>1e-8)moving++;if(Math.abs(steady[i].fov-steady[i-1].fov)>1e-6)intermediate++;}
  return {frames:samples.length,pairs,intermediate,moving,correctProjection:samples.every(s=>Math.abs(s.projection-s.zoom/Math.tan(s.fov*Math.PI/360))<1e-5),quality:{g:Reactor3D.Quality.g,c:Reactor3D.Quality.c}};`);
 console.log(JSON.stringify({projection}));assert.ok(projection.intermediate>5&&projection.intermediate>=projection.pairs*.9,'acceleration changes projection on intermediate refreshes');assert.equal(projection.correctProjection,true);assert.ok(projection.moving>=projection.pairs*.9,'a bike thawed from parking moves on intermediate refreshes');
 await driver.execute(`Input._currentState.up=true;window.__driveAt=Graphics.frameCount;`);
 await driver.waitForScript(`return ($gamePlayer._rrDrive?.v||0)>5||$gameMap.mapId()===8;`,[],{timeout:90000});
 reports.push(await driver.execute(snap));console.log(JSON.stringify(reports.at(-1)));
 await driver.waitForScript(`if($gamePlayer._vehicleType==='reactor')Input._currentState.up=true;return $gameMap.mapId()===8&&$gamePlayer._realX>2&&!SceneManager.isSceneChanging();`,[],{timeout:90000});
 await driver.execute('Input.clear();');reports.push(await driver.execute(snap));console.log(JSON.stringify(reports.at(-1)));

 for(const report of reports){assert.ok(report.quality.profile?.version>0,'old Auto profile is migrated');assert.equal(report.quality.scale,1,'Auto must not downscale a healthy ride');assert.equal(report.quality.shadows,true);assert.equal(report.active,true);assert.ok(report.rows.some(r=>r.who==='bike'&&r.casting));assert.ok(report.rows.some(r=>r.who==='rider'&&r.casting));assert.equal(report.gl,0);assert.equal(report.errors.length,0);}
 const pixels=await driver.execute(`
  Graphics._app.ticker.stop();
  const ss=SceneManager._scene._spriteset,v=ss._reactor3d,R=Reactor3D,S=R.Shadows,renderer=v.viewport.renderer(),bike=ReactorVehicles.ridden();
  const rows=[...v.scene._modelInstances.values()].filter(h=>h.character===$gamePlayer||h.character===bike).map(h=>({root:h.object,name:h.character===bike?'bike':'rider'}));
  const box=new THREE.Box3();for(const row of rows)box.union(new THREE.Box3().setFromObject(row.root));
  const projected=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])projected.push(new THREE.Vector3(x,y,z).project(v.camera));
  const bounds={left:Math.min(...projected.map(p=>(p.x+1)/2)),right:Math.max(...projected.map(p=>(p.x+1)/2)),bottom:Math.min(...projected.map(p=>(p.y+1)/2)),top:Math.max(...projected.map(p=>(p.y+1)/2))};
  function draw(){for(let i=0;i<3;i++){v.viewport._matrixFrame=-1;ss.drawReactor3D(v);}const target=v.viewport.upscaled()&&v.viewport.enlargedInComposite('below')?v.viewport._workTarget('below'):v.viewport._target('below'),data=new Uint8Array(target.width*target.height*4);renderer.readRenderTargetPixels(target,0,0,target.width,target.height,data);return {data,w:target.width,h:target.height};}
  function set(name,on){for(const row of rows)if(name==='all'||row.name===name){if(on)S.markCaster(row.root,true);else{S._setCasts(row.root,false);S._dynamic.delete(row.root);S._casting.delete(row.root);}}}
  function compare(a,b){let changed=0,ground=0;for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){const i=(y*a.w+x)*4,d=Math.max(Math.abs(a.data[i]-b.data[i]),Math.abs(a.data[i+1]-b.data[i+1]),Math.abs(a.data[i+2]-b.data[i+2]));if(d>5){changed++;if(x/a.w<bounds.left||x/a.w>bounds.right||y/a.h<bounds.bottom||y/a.h>bounds.top)ground++;}}return {changed,ground};}
  function png(image){const c=document.createElement('canvas');c.width=image.w;c.height=image.h;const ctx=c.getContext('2d'),im=ctx.createImageData(image.w,image.h);for(let y=0;y<image.h;y++)im.data.set(image.data.subarray(y*image.w*4,(y+1)*image.w*4),(image.h-y-1)*image.w*4);ctx.putImageData(im,0,0);return c.toDataURL('image/png');}
  const lit=draw();let bikeOnly,riderOnly,none,without;
  try{set('bike',false);bikeOnly=compare(lit,draw());set('bike',true);set('rider',false);riderOnly=compare(lit,draw());set('bike',false);without=draw();none=compare(lit,without);}
  finally{set('all',true);draw();}
  return {bike:bikeOnly,rider:riderOnly,combined:none,width:lit.w,height:lit.h,gl:renderer.getContext().getError(),images:{on:png(lit),off:png(without)}};`);
 for(const [name,image] of Object.entries(pixels.images))fs.writeFileSync(path.join(out,'field-shadows-'+name+'.png'),Buffer.from(image.split(',')[1],'base64'));
 delete pixels.images;
 console.log(JSON.stringify({shadowPixels:pixels}));
 assert.ok(pixels.bike.changed>10,'motorcycle contributes real shadow pixels');
 assert.ok(pixels.rider.changed>10,'rider contributes real shadow pixels');
 assert.ok(pixels.combined.ground>0,'their shadows reach the ground after the border crossing');assert.equal(pixels.gl,0);
 fs.writeFileSync(path.join(out,'shadow-pixels.json'),JSON.stringify(pixels,null,2)+'\n');
 fs.writeFileSync(path.join(out,'projection.json'),JSON.stringify(projection,null,2)+'\n');
 fs.writeFileSync(path.join(out,'ride-report.json'),JSON.stringify(reports,null,2)+'\n');
}finally{await driver?.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
