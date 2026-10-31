#!/usr/bin/env node
/** Tactical status opacity across selection, movement and map overlap. Run through codex-check + headless-native.cjs. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const { WebDriverClient } = require(path.join(root, 'editor/tests/smoke/webdriver-client.cjs'));
const option = (name, fallback) => process.argv.slice(2).find(a => a.startsWith('--' + name + '='))?.slice(name.length + 3) || fallback;
const out = path.resolve(option('out', 'scratchpad/tactical-panel-20261030/fixed'));
const renderNode = option('render-node', '');
fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-tactical-opacity-'));
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

 const reports=[];
 async function capture(label){
  await driver.waitForScript(`const w=SceneManager._scene?._reactorFightHud?._nodeWindows.find(w=>w.node().fightUnit==='active');return !!w&&w.visible&&w._fightShown;`,[],{timeout:45000});
  // Keep the sampled alpha and screenshot on the same presented frame.
  await driver.execute(`window.__opacityTickerStarted=Graphics._app.ticker.started;Graphics._app.ticker.stop();Graphics._app.render();`);
  const report=await driver.execute(`const scene=SceneManager._scene,hud=scene._reactorFightHud,f=$gameFight;return {label:arguments[0],phase:f.tacticalState(),shot:hud._shotAlpha,cursor:f._tac.cursor,panels:hud._nodeWindows.filter(w=>w.node().type==='fightUnit').map(w=>({name:w.node().name,visible:w.visible,shown:w._fightShown,alpha:w.alpha,opacity:w.opacity,contents:w.contentsOpacity,back:w.backOpacity,cover:w._coverAlpha,covers:ReactorFight.UnitMarks.covers(f,w.x+scene._windowLayer.x,w.y+scene._windowLayer.y,w.width*w.scale.x,w.height*w.scale.y),banner:w._fightAlpha,transition:w._uiTransitionAlpha,rect:[w.x,w.y,w.width,w.height]})),errors:__rrErrors,gl:Graphics._app.renderer.gl.getError()};`,[label]);reports.push(report);console.log(JSON.stringify(report));fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
  await driver.execute('if(__opacityTickerStarted)Graphics._app.ticker.start();');
 }
 await capture('selected');
 const move=await driver.execute(`const f=$gameFight,u=f.activeUnit(),c=f.character(u);const p=f.moveCells().filter(p=>!p.grapple&&Math.abs(p.x-c.x)+Math.abs(p.y-c.y)===1).sort((a,b)=>a.cost-b.cost)[0];if(!p)throw Error('No movement cell');return {accepted:f.commandMoveTo(p.x,p.y,p.h,true),from:[c.x,c.y],to:[p.x,p.y]};`);console.log('move',JSON.stringify(move));
 await driver.waitForScript(`const f=$gameFight,c=f.character(f.activeUnit());return f._act?.stage==='command'&&!c.isMoving();`,[],{timeout:45000});
 await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),1200);');await capture('moved');
 // Hold the camera steady while parking the pointer behind a panel.
 const cursor=await driver.execute(`Graphics._app.ticker.stop();const f=$gameFight,scene=SceneManager._scene,w=scene._reactorFightHud._nodeWindows.find(w=>w.node().fightUnit==='active'),camera=scene._spriteset._reactor3d.camera,c=f.character(f.activeUnit()),out={},px=w.x+scene._windowLayer.x,py=w.y+scene._windowLayer.y;
  for(let y=Math.max(0,c.y-30);y<Math.min($gameMap.height(),c.y+30);y++)for(let x=Math.max(0,c.x-30);x<Math.min($gameMap.width(),c.x+30);x++){
   const h=Reactor3D.groundHeightAt($dataMap,x+.5,y+.5,0),p=Reactor3D.projectToScreen(camera,x+.5,h,y+.5,out);if(!p||p.x<px+30||p.x>px+w.width-30||p.y<py+30||p.y>py+w.height-30)continue;
   const input=ReactorFight.Input,was=input._pointing;try{input._pointing=true;f.setCursor(x,y,h);}finally{input._pointing=was;}for(let frame=0;frame<30;frame++)ReactorUI.updateFightScene(scene);return {x,y,h};
  }throw Error('No map cell projects behind the status panel');`);console.log('overlap cursor',JSON.stringify(cursor));
 await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),800);');await capture('cursor-under-panel');
 await driver.execute(`$gameFight._tac.cursor.on=false;$gameFight.touch();ReactorUI.updateFightScene(SceneManager._scene);`);await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),800);');await capture('cursor-away');
 assert.equal(move.accepted,true);
 for(const report of reports){assert.equal(report.errors.length,0);assert.equal(report.gl,0);const active=report.panels.find(p=>p.name==='Active Unit');assert.equal(active.visible,true);assert.equal(active.alpha,1,report.label+' keeps status readable');assert.equal(active.contents,255);}
 assert.equal(reports[2].panels.find(p=>p.name==='Active Unit').covers,true,'map cursor remains behind the status panel after movement');
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(reports,null,2));
 }finally{await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
