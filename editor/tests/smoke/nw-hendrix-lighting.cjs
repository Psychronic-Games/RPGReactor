#!/usr/bin/env node
/** The Hendrix lighting project's real fog, shadows and map transfers. Isolated display + codex-check required. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),source=path.join(root,'template/Sang Hendrix - Lighting');
const out=path.resolve('scratchpad/pixi-buffer-20261029/hendrix'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-hendrix-lighting-')),project=path.join(temp,'Lighting');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(project);
for(const name of ['index.html','package.json','project.rpgreactor'])fs.copyFileSync(path.join(source,name),path.join(project,name));
for(const name of ['data','js','icon','css'])fs.cpSync(path.join(source,name),path.join(project,name),{recursive:true});
for(const name of ['img','audio','effects','fonts','movies'])if(fs.existsSync(path.join(source,name)))fs.symlinkSync(path.join(source,name),path.join(project,name));
const pkg=JSON.parse(fs.readFileSync(path.join(project,'package.json')));pkg.main='index.html?test';fs.writeFileSync(path.join(project,'package.json'),JSON.stringify(pkg));
let html=fs.readFileSync(path.join(project,'index.html'),'utf8');html=html.replace('<head>','<head><script>window.__errors=[];addEventListener("error",e=>__errors.push(String(e.error?.stack||e.message)));</script>');fs.writeFileSync(path.join(project,'index.html'),html);
const driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));
async function capture(label){
 const r=await driver.execute(`const ss=SceneManager._scene?._spriteset,l=ss?._threeShadow,gl=Graphics.app?.renderer?.gl;return{label:arguments[0],map:$gameMap?.mapId(),stopped:!!SceneManager._stopped,error:Graphics._errorPrinter?.textContent,errors:window.__errors,layer:!!l,layerKeys:l?Object.keys(l):[],fog:l?{exists:!!l._fog,visible:l._fog?.sprite.visible,uniforms:l._fog?.filter?Object.keys(l._fog.filter.uniforms):null}:null,filters:ss?._baseSprite?.filters?.length||0,gl:gl?.getError(),globals:Object.keys(window).filter(k=>/hendrix|Sparams|shadow3d/i.test(k))};`,[label]);
 r.logs=await driver.sessionRequest('POST','/log',{type:'browser'});fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(r,null,2));fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));console.log(JSON.stringify(r));return r;
}
(async()=>{try{
 await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${project}`,`user-data-dir=${temp}/profile`,'no-first-run','disable-backgrounding-occluded-windows','disable-renderer-backgrounding','mute-audio','js-flags=--max-old-space-size=1024']}});
 await driver.waitForScript('return !!window.$dataSystem&&DataManager.isDatabaseLoaded()&&ConfigManager.isLoaded()&&SceneManager._scene?.isStarted()&&!(SceneManager._scene instanceof Scene_Boot)&&!SceneManager.isSceneChanging();',[],{timeout:120000});
 await driver.execute('SceneManager.isGameActive=()=>true;DataManager.setupNewGame();SceneManager.goto(Scene_Map);');
 const reports=[];
 for(const [label,id,x,y] of [['world',1,155,70],['village',2,15,15],['indoor',3,8,6],['world-return',1,155,70]]){
  if(label!=='world')await driver.execute('$gamePlayer.reserveTransfer(arguments[0],arguments[1],arguments[2],2,2);',[id,x,y]);
  await driver.waitForScript('return SceneManager._stopped||(SceneManager._scene instanceof Scene_Map&&$gameMap.mapId()===arguments[0]&&SceneManager._scene.isStarted()&&!SceneManager.isSceneChanging());',[id],{timeout:45000});
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),1200);');
  const r=await capture(label);reports.push(r);assert.equal(r.stopped,false,r.error||JSON.stringify(r.logs));assert.equal(r.errors.length,0);assert.equal(r.layer,true);assert.equal(r.gl,0);
 }
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(reports,null,2));
 for(const r of reports){assert.equal(r.logs.filter(l=>/TypeError|ReferenceError|GL_INVALID|INVALID_OPERATION|Shader Error/i.test(l.message)).length,0,JSON.stringify(r.logs));}
 assert.equal(reports[0].fog.exists,true);assert.equal(reports[2].fog.exists,false);assert.equal(reports[3].fog.exists,true);
 }catch(e){try{await capture('failure');}catch{}throw e;}finally{await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
