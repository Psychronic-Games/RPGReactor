#!/usr/bin/env node
/** Native grapple poses on a disposable Demo.
 * Run through codex-check on an isolated display. --saved-auto recreates the
 * CPU-2 Auto graphics configuration; --pixels verifies character shadow pixels.
 * --battle checks selected-unit interior policy. The user's project is untouched.
 */
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const { WebDriverClient } = require(path.join(root, 'editor/tests/smoke/webdriver-client.cjs'));
const option = (name, fallback) => process.argv.slice(2).find(a => a.startsWith('--' + name + '='))?.slice(name.length + 3) || fallback;
const out = path.resolve(option('out', 'scratchpad/grapple-motion-20261029'));
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
 const report=await driver.execute(`const R=Reactor3D,F=ReactorFight,f=$gameFight,c=window.__grappleCharacter,h=F.Stage.holderOf(c),object=h.object;
 const record={object,attachmentBones:new Map()},point=node=>node?.getWorldPosition(new THREE.Vector3()).toArray(),hand=side=>R.Held.joint(record,side+'Hand');
 object.updateWorldMatrix(true,true);const right=hand('right'),left=hand('left'),held=R.MapHeld.states.get(R.modelInstanceKey(c));
 return{phase:window.__grappleTarget,g:c._reactorGrapple&&{t:c._reactorGrapple.t,aim:c._reactorGrapple.aim,shot:c._reactorGrapple.shot,tight:c._reactorGrapple.tight,pull:c._reactorGrapple.pull},mantle:c._reactorMantle&&{lip:c._reactorMantle.lip,t:c._reactorMantle.t,over:c._reactorMantle.over,to:c._reactorMantle.to},
 position:[c._realX,c._realY,c._reactorAlt],right:point(right),left:point(left),shoulderRight:point(right?.parent?.parent),shoulderLeft:point(left?.parent?.parent),pose:h.mantlePose&&{w:h.mantlePose.w,lw:h.mantlePose.lw},weapon:held&&{stowed:held.stowed,visible:held.record?.object.visible},errors:__rrErrors,gl:SceneManager._scene._spriteset._reactor3d.viewport.renderer().getContext().getError()};`);
 report.logs=await driver.sessionRequest('POST','/log',{type:'browser'});
 fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(report,null,2));
 fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
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
 await driver.execute(`const f=$gameFight,u=f.activeUnit(),c=f.character(u),b=f.battler(u),item=$dataArmors[114];b.forceChangeEquip(b.equipSlots().indexOf(item.etypeId),item);c.locate(64,49);c._reactorGround=Reactor3D.groundHeightAt($dataMap,64.5,49.5,0);f.focusOn(64,49);f.touch();`);
 await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),1000);');
 await driver.execute(`const f=$gameFight,c=f.character(f.activeUnit()),P=ReactorPhysics;window.__grappleCharacter=c;window.__grappleTarget='aim';window.__grappleFrozen=false;
 const tick=P.updateGrapple,mantle=P.updateMantle,keys=['_realX','_realY','_reactorAlt','_reactorGround','_reactorAir'];
 const frozen=character=>{if(character!==c||!__grappleFrozen)return false;for(const key of keys)c[key]=window.__grappleHold[key];return true;};
 const hold=()=>{window.__grappleHold=Object.fromEntries(keys.map(key=>[key,c[key]]));__grappleFrozen=true;};
 P.updateGrapple=function(character){if(frozen(character))return;tick.apply(this,arguments);if(character!==c)return;const g=c._reactorGrapple;if(g&&(__grappleTarget==='aim'&&g.t>=g.aim||__grappleTarget==='pull'&&g.t>=g.aim+g.shot+g.tight+Math.floor(g.pull*0.4)))hold();};
 P.updateMantle=function(character){if(frozen(character))return;mantle.apply(this,arguments);if(character===c&&__grappleTarget==='ledge'&&c._reactorMantle?.t>=5)hold();};
 if(!f.enterGrapple('move'))throw Error('Grapple unavailable');const cell=f.moveCells().find(p=>p.grapple&&p.h>8);if(!cell||!f.commandMoveTo(cell.x,cell.y,cell.h,true))throw Error('Grapple command rejected');`);
 const reports=[];
 for(const phase of ['aim','pull','ledge','landed']){
  if(phase!=='aim')await driver.execute('window.__grappleTarget=arguments[0];window.__grappleFrozen=false;',[phase]);
  await driver.waitForScript(`const c=window.__grappleCharacter;return arguments[0]==='landed'?!c._reactorGrapple&&!c._reactorMantle&&$gameFight.playerStage('command'):window.__grappleFrozen;`,[phase],{timeout:25000});
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),250);');
  reports.push(await snapshot(phase));
 }
 for(const r of reports){assert.equal(r.gl,0);assert.equal(r.errors.length,0);assert.equal(r.logs.filter(l=>/feedback|GL_INVALID|INVALID_OPERATION/i.test(l.message)).length,0);}
 for(const r of reports.slice(0,3))assert.equal(r.weapon?.visible,false,'the carried rifle is stowed');
 for(const r of reports.slice(0,2))assert.ok(r.right[1]>r.shoulderRight[1]+0.05,'the firing hand stays above its shoulder');
 assert.ok(reports[1].left[1]>reports[1].shoulderLeft[1]+0.05,'the support hand is raised while pulling');
 assert.equal(reports[3].weapon.visible,true,'the rifle returns after the climb');
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(reports,null,2));
 }finally{await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
