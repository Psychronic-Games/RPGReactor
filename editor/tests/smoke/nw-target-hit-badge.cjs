#!/usr/bin/env node
/** Selected attack and skill hit chance badges on a disposable Demo. Run through codex-check on an isolated display. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const { WebDriverClient } = require(path.join(root, 'editor/tests/smoke/webdriver-client.cjs'));
const option = (name, fallback) => process.argv.slice(2).find(a => a.startsWith('--' + name + '='))?.slice(name.length + 3) || fallback;
const out = path.resolve(option('out', 'scratchpad/target-hit-badge-20261029'));
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
 await driver.execute(`const f=$gameFight,u=f.activeUnit(),c=f.character(u);Game_CharacterBase.prototype.locate.call(c,82,64);c._reactorGround=Reactor3D.groundHeightAt($dataMap,82.5,64.5,0);c._reactorAlt=c._reactorGround;c._reactorAir=0;window.__hitEnemy=f._units.find(u=>u.team==='enemy'&&!u.gone);const e=f.character(__hitEnemy);e.locate(86,64);e._reactorGround=Reactor3D.groundHeightAt($dataMap,86.5,64.5,0);f.touch();if(!f.commandMoveTo(82,64))throw Error('cannot open command menu');if(!f.commandAttack())throw Error('cannot choose Attack');f.setCursor(86,64,e._reactorGround);f.focusOn(83,64);`);
 const reports=[];
 for(const phase of ['attack','skill','out-of-range','cancelled']){
  if(phase==='skill')await driver.execute(`const f=$gameFight;if(!f.commandCancel()||!f.commandSkill(249))throw Error('cannot select Crippling Shot '+JSON.stringify({stage:f.tacticalState(),act:f._act,unit:f.activeUnit(),skills:f.battler(f.activeUnit()).skills().map(s=>s.id)}));f.setCursor(86,64);`);
  if(phase==='out-of-range')await driver.execute(`const f=$gameFight,c=f.character(__hitEnemy);c.locate(82,115);c._reactorGround=Reactor3D.groundHeightAt($dataMap,82.5,115.5,0);f.touch();f.setCursor(82,115,c._reactorGround);`);
  if(phase==='cancelled')await driver.execute(`$gameFight.commandCancel();`);
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),800);');
  const r=await driver.execute(`const f=$gameFight,U=ReactorFight.UnitMarks,v=U.forecast,p=f.preview(__hitEnemy);return{phase:arguments[0],visible:!!v?.sprite.visible,text:v?.text,expected:p?'Hit '+ReactorFightHud.percent(p.hit):null,target:f.focusedUnit()?.id,unit:f.activeUnit()?.actorId,acting:f._act,from:f.character(f.activeUnit())?[f.character(f.activeUnit())._realX,f.character(f.activeUnit())._realY]:null,valid:f.targetsAtCursor().some(u=>u.id===__hitEnemy.id),position:v?[v.sprite.x,v.sprite.y]:null,errors:__rrErrors,gl:SceneManager._scene._spriteset._reactor3d.viewport.renderer().getContext().getError()};`,[phase]);
  r.logs=await driver.sessionRequest('POST','/log',{type:'browser'});reports.push(r);console.log(JSON.stringify(r));fs.writeFileSync(path.join(out,phase+'.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
 }
 for(const [i,r]of reports.entries()){assert.equal(r.gl,0);assert.equal(r.errors.length,0);assert.equal(r.visible,i<2);if(i<2){assert.equal(r.text,r.expected);assert.equal(r.valid,true);}assert.equal(r.logs.filter(l=>/feedback|GL_INVALID|INVALID_OPERATION/i.test(l.message)).length,0);}
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(reports,null,2));
 }finally{await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
