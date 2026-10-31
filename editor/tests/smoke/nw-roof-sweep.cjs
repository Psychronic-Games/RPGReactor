#!/usr/bin/env node
/** North Haven roof inspection at four houses on a disposable Demo. Run through codex-check on an isolated display. */
'use strict';
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../../..');
const { WebDriverClient } = require(path.join(root, 'editor/tests/smoke/webdriver-client.cjs'));
const option = (name, fallback) => process.argv.slice(2).find(a => a.startsWith('--' + name + '='))?.slice(name.length + 3) || fallback;
const out = path.resolve(option('out', 'scratchpad/roof-refinement-20261029'));
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
 await driver.execute(`$gamePlayer.locate(64,49);const e=$gameMap.event(12);e.locate(65,60);e.setThrough(true);e._reactorGround=10;e._reactorAlt=10;e._reactorAir=0;`);
 for(const [label,x,y,yaw] of [['inn',65,60,45],['north',91,31,135],['south',92,80,225],['west',25,52,315]]){
  await driver.execute('const e=$gameMap.event(12);e.locate(arguments[0],arguments[1]);e.setThrough(true);',[x,y]);
  await driver.execute(`Reactor3D.Camera.change({mode:'isometric',focus:'event',eventId:12,yaw:arguments[0],pitch:60,distance:48},0,false);`,[yaw]);
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),1200);');
  const report=await driver.execute(`const v=SceneManager._scene._spriteset._reactor3d,R=Reactor3D;return{camera:v.camera.position.toArray(),cut:R.cutawayUniforms().rrCutTop.value,batches:R.DrawBatches?.enabled,depthFirst:R.DepthFirst?.last,gl:v.viewport.renderer().getContext().getError(),errors:__rrErrors};`);
  report.logs=await driver.sessionRequest('POST','/log',{type:'browser'});
  fs.writeFileSync(path.join(out,'roof-'+label+'.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(out,'roof-'+label+'.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
  console.log(label,JSON.stringify(report));assert.equal(report.gl,0);assert.equal(report.errors.length,0);
 }
 }finally{await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
