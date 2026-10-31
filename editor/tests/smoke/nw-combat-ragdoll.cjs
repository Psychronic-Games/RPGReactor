#!/usr/bin/env node
/** Combat ragdoll contact, settling and revival on a disposable Demo. Run through codex-check on an isolated display. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const { WebDriverClient } = require(path.join(root, 'editor/tests/smoke/webdriver-client.cjs'));
const option = (name, fallback) => process.argv.slice(2).find(a => a.startsWith('--' + name + '='))?.slice(name.length + 3) || fallback;
const out = path.resolve(option('out', 'scratchpad/combat-ragdoll-20261029'));
const renderNode = option('render-node', '');
fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-town-visibility-'));
const project = path.join(temp, 'Demo'), demo = path.join(root, 'template/Demo');
fs.mkdirSync(project);
for (const n of ['index.html', 'package.json', 'project.rpgreactor']) fs.copyFileSync(path.join(demo, n), path.join(project, n));
if (renderNode) {
    const file = path.join(project, 'package.json'), pkg = JSON.parse(fs.readFileSync(file));
    pkg['chromium-args'] = (pkg['chromium-args'] || '').replace('--force-high-performance-gpu', '');
    fs.writeFileSync(file, JSON.stringify(pkg));
}
for (const n of ['data', 'js', 'icon', 'css']) fs.cpSync(path.join(demo, n), path.join(project, n), { recursive: true });
for (const n of ['img', '3d', 'audio', 'effects', 'fonts', 'movies']) if (fs.existsSync(path.join(demo, n))) fs.symlinkSync(path.join(demo, n), path.join(project, n));
for (const n of fs.readdirSync(path.join(root, 'runtime'))) if (n.endsWith('.js') && n !== 'reactor_plugins.js') fs.copyFileSync(path.join(root, 'runtime', n), path.join(project, 'js', n));
if (process.argv.includes('--saved-auto')) {
    // Reproduce the saved profile that hid North Haven's game shadows. Use a
    // fixture so this check also runs in a clean checkout without local saves.
    const config = { graphicsQuality: 'auto', graphicsAuto: { version: 2, gpu: 0, cpu: 2, half: false }, reactor3dSeen: true };
    const zip = require('node:zlib').deflateSync(JSON.stringify(config), { level: 1 }).toString('latin1');
    fs.mkdirSync(path.join(project, 'save'));
    fs.writeFileSync(path.join(project, 'save/config.rmmzsave'), zip, 'utf8');
}
const write = (n, data) => fs.writeFileSync(path.join(project, 'data', n), JSON.stringify(data));
const system = JSON.parse(fs.readFileSync(path.join(project, 'data/System.json')));
Object.assign(system, { startMapId: 5, startX: 80, startY: 58, rrSkipTitle: false });
write('System.json', system);
const driver = new WebDriverClient(path.join(root, 'nwjs-linux/chromedriver'));
const cdp = (cmd, params = {}) => driver.sessionRequest('POST', '/goog/cdp/execute', { cmd, params });
async function snapshot(label) {
 const report=await driver.execute(`const R=Reactor3D,F=ReactorFight,c=window.__koCharacter,h=F.Stage.holderOf(c),o=h.object,held=R.MapHeld.states.get(R.modelInstanceKey(c));
 o.updateWorldMatrix(true,true);const v=new THREE.Vector3();let min=Infinity,max=-Infinity,vertices=0;
 o.traverseVisible(mesh=>{if(!mesh.isMesh||!mesh.geometry||mesh.userData.__reactorOverlay)return;const n=mesh.geometry.attributes.position?.count||0;for(let i=0;i<n;i++){mesh.getVertexPosition(i,v).applyMatrix4(mesh.matrixWorld);min=Math.min(min,v.y);max=Math.max(max,v.y);vertices++;}});
 const entry=name=>h.binding?.meshes.find(e=>e.parts.some(p=>p.name===name));
 return{label:arguments[0],knockedOut:!!c._reactorKnockedOut,pitch:c._reactorPosePitch||0,ground:R.characterGround($dataMap,c),min,max,vertices,lift:h.downedPose?.lift,doll:h.ragdoll?{rigid:!!h.ragdoll.rigid,asleep:!!h.ragdoll.asleep,still:h.ragdoll.still,points:h.ragdoll.points?.map(p=>p.p.toArray()),drive:h.ragdoll.drive?.map(b=>({name:b.name,angle:b.node.getWorldQuaternion(new THREE.Quaternion()).angleTo(b.rest)}))}:null,timing:window.__koTiming,flash:h.flash&&h.flash.t,animationRoot:h.binding?.root.quaternion.toArray(),arm:entry('RightUpperArm')?.mesh.quaternion.toArray(),weapon:held?.record?{stowed:!!held.stowed,visible:held.record.object.visible}:null,errors:__rrErrors,gl:SceneManager._scene._spriteset._reactor3d.viewport.renderer().getContext().getError()};`,[label]);
 report.logs=await driver.sessionRequest('POST','/log',{type:'browser'});
 fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
 console.log(label,JSON.stringify(report));return report;
}
(async()=>{try{
 await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${project}`,`user-data-dir=${temp}/profile`,'no-first-run','disable-backgrounding-occluded-windows','disable-renderer-backgrounding','mute-audio','js-flags=--max-old-space-size=1024']}});
 await driver.setScriptTimeout(90000);await cdp('Emulation.setFocusEmulationEnabled',{enabled:true});
 await driver.waitForScript('return !!window.$dataSystem&&DataManager.isDatabaseLoaded()&&ConfigManager.isLoaded()&&SceneManager._scene?.isStarted()&&!(SceneManager._scene instanceof Scene_Boot)&&!SceneManager.isSceneChanging();',[],{timeout:120000});
 await driver.execute(`window.__rrErrors=[];addEventListener('error',e=>__rrErrors.push(String(e.error?.stack||e.message)));SceneManager.isGameActive=()=>true;DataManager.setupNewGame();SceneManager.goto(Scene_Map);`);
 await driver.waitForScript(`const v=SceneManager._scene?._spriteset?._reactor3d;return !!v&&!v.arrival&&!v.warming&&SceneManager._scene._fadeDuration===0&&[...v.scene._modelInstances.values()].some(h=>h.character===$gamePlayer&&h.object);`,[],{timeout:120000});
 await driver.execute(`$gamePlayer.locate(80,58);$gameSwitches.setValue(1,true);$gameSwitches.setValue(4,true);$gameParty.addActor(9);$gameMap.requestRefresh();`);
 await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),800);');
 await driver.execute(`const i=new Game_Interpreter(),a=$dataMap.events[12].pages[0].list.find(c=>c.code===357&&c.parameters[1]==='StartMapBattle').parameters;PluginManager.callCommand(i,a[0],a[1],{...a[3],wait:false});`);
 await driver.waitForScript(`return $gameFight._act?.player&&$gameFight._act.stage==='pick';`,[],{timeout:45000});
 await driver.execute(`const f=$gameFight,u=f.pendingUnits().find(u=>u.actorId===9);if(!u||!f.commandSelectUnit(u.id))throw Error('Rhea unavailable');`);
 await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),1200);');
 await driver.execute(`const pose=Reactor3D.runRagdoll;window.__koTiming={count:0,total:0,max:0};window.__koPaused=false;window.__koStop=12;Reactor3D.runRagdoll=function(h,c){if(c===window.__koCharacter&&window.__koPaused)return;const start=performance.now();try{return pose.apply(this,arguments);}finally{const ms=performance.now()-start;__koTiming.count++;__koTiming.total+=ms;__koTiming.max=Math.max(__koTiming.max,ms);if(c===window.__koCharacter&&h.ragdoll&&((h.ragdoll.asleep)||++window.__koTicks>=window.__koStop))window.__koPaused=true;}};
 const f=$gameFight;window.__koTicks=0;window.__koEnemy=f._units.find(u=>u.team==='enemy'&&!u.gone);window.__koHero=f._units.find(u=>u.party&&u.actorId);window.__koCharacter=f.character(__koEnemy);__koCharacter.locate(82,64);__koCharacter._reactorGround=Reactor3D.groundHeightAt($dataMap,82.5,64.5,0);
 const b=f.battler(__koEnemy);b._reactorCollapse=8;b.collapseType=()=>8;b.setHp(0);__koEnemy.struck={x:__koCharacter.x-1,y:__koCharacter.y};ReactorFight.Stage.react({targetId:__koEnemy.id,unitId:f.activeUnit().id,defeated:true,hit:1});f.defeat(__koEnemy);f.focusOn(__koCharacter.x,__koCharacter.y);`);
 const reports=[];
 for(const phase of ['enemy-falling','enemy-rest','hero-rest','revived']){
  if(phase==='enemy-rest')await driver.execute('window.__koStop=1200;window.__koPaused=false;');
  if(phase==='hero-rest')await driver.execute(`const f=$gameFight;window.__koCharacter=f.character(__koHero);Game_CharacterBase.prototype.locate.call(__koCharacter,82,68);__koCharacter._reactorGround=Reactor3D.groundHeightAt($dataMap,82.5,68.5,0);__koCharacter._reactorAlt=__koCharacter._reactorGround;__koCharacter._reactorAir=0;window.__koStop=1200;window.__koTicks=0;window.__koPaused=false;f.battler(__koHero).setHp(0);f.defeat(__koHero);f.focusOn(__koCharacter.x,__koCharacter.y);`);
  if(phase==='revived')await driver.execute(`const f=$gameFight;f.battler(__koHero).setHp(Math.max(1,Math.floor(f.battler(__koHero).mhp/2)));f.raise(__koHero);window.__koPaused=true;`);
  if(phase!=='revived')await driver.waitForScript('return window.__koPaused;',[],{timeout:35000});
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),350);');
  reports.push(await snapshot(phase));
 }
 for(const r of reports){assert.equal(r.gl,0);assert.equal(r.errors.length,0);assert.ok(r.min>=r.ground-0.025,'posed skin must remain above the ground: '+r.label+' '+r.min+' / '+r.ground);assert.equal(r.logs.filter(l=>/feedback|GL_INVALID|INVALID_OPERATION/i.test(l.message)).length,0);}
 for(const r of reports.slice(0,3)){assert.ok(r.doll&&!r.doll.rigid,'a humanoid must use limb physics');assert.equal(r.knockedOut,true);if(r.weapon)assert.equal(r.weapon.visible,false);assert.ok(Math.abs(r.animationRoot[3]-1)<1e-6,'the animation cannot apply a second fall');}
 for(const r of [reports[1],reports[2]])assert.equal(r.doll.asleep,true,'settled bodies must stop simulating');
 assert.equal(reports[3].doll,null);assert.equal(reports[3].knockedOut,false);assert.equal(reports[3].pitch,0);if(reports[3].weapon)assert.equal(reports[3].weapon.visible,true);
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(reports,null,2));
 }finally{await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
