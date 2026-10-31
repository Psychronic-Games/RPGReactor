#!/usr/bin/env node
/** The Hendrix lighting project's real fog, shadows and map transfers. Isolated display + codex-check required. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),source=path.join(root,'template/Sang Hendrix - Lighting');
const out=path.resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)||'scratchpad/hendrix-pixi-audit-20261029/project'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-hendrix-lighting-')),project=path.join(temp,'Lighting');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(project);
for(const name of ['index.html','package.json','project.rpgreactor'])fs.copyFileSync(path.join(source,name),path.join(project,name));
for(const name of ['data','js','icon','css'])fs.cpSync(path.join(source,name),path.join(project,name),{recursive:true});
for(const name of ['img','audio','effects','fonts','movies'])if(fs.existsSync(path.join(source,name)))fs.symlinkSync(path.join(source,name),path.join(project,name));
const pkg=JSON.parse(fs.readFileSync(path.join(project,'package.json')));pkg.main='index.html?test';fs.writeFileSync(path.join(project,'package.json'),JSON.stringify(pkg));
let html=fs.readFileSync(path.join(project,'index.html'),'utf8');html=html.replace('<head>','<head><script>window.__errors=[];addEventListener("error",e=>__errors.push(String(e.error?.stack||e.message)));</script>');fs.writeFileSync(path.join(project,'index.html'),html);
// Instrument a disposable plugin copy so the audit can exercise its own settings.
for(const n of fs.readdirSync(path.join(root,'runtime')))if(n.endsWith('.js')&&n!=='reactor_plugins.js')fs.copyFileSync(path.join(root,'runtime',n),path.join(project,'js',n));
fs.copyFileSync(path.join(root,'runtime/libs/pixi_compat.js'),path.join(project,'js/libs/pixi_compat.js'));
const plugin=path.join(project,'js/plugins/Hendrix_3D_Light_and_Shadow.js');let code=fs.readFileSync(plugin,'utf8');const end=code.lastIndexOf('\n})();');code=code.slice(0,end)+'\nwindow.__rrHX={params:SparamsH,open:SopenEditorH,editor:()=>editorWindow};\n'+code.slice(end);fs.writeFileSync(plugin,code);
const mapFile=path.join(project,'data/Map002.json'),map=JSON.parse(fs.readFileSync(mapFile));const event=map.events.find(e=>e&&e.pages.some(p=>p.image?.characterName));if(event){event.note+=' <light3D>';fs.writeFileSync(mapFile,JSON.stringify(map));}
const driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));
async function capture(label){
 const r=await driver.execute(`const ss=SceneManager._scene?._spriteset,l=ss?._threeShadow,gl=Graphics.app?.renderer?.gl;return{label:arguments[0],map:$gameMap?.mapId(),stopped:!!SceneManager._stopped,error:Graphics._errorPrinter?.textContent,errors:window.__errors,layer:!!l,counts:window.__hxCounts,clock:window.clockHour?.(),lamps:l?{count:l._lamps?.length,sources:l._sources?.size}:null,debug:typeof l?._debug?.text==='string'?l._debug.text:l?._debug?.text?.text,settings:Object.fromEntries(Object.entries(window.__rrHX?.params||{}).filter(([k,v])=>/quality|resolution|dayNight|sun|ambient|billboard|tileObject/i.test(k)&&typeof v!=='object')),editorInputs:__rrHX.editor()?.document.querySelectorAll('input,select').length||0,fog:l?{exists:!!l._fog,visible:l._fog?.sprite.visible,uniforms:l._fog?.filter?Object.keys(l._fog.filter.uniforms):null}:null,filters:ss?._baseSprite?.filters?.length||0,gl:gl?.getError(),globals:Object.keys(window).filter(k=>/hendrix|Sparams|shadow3d/i.test(k))};`,[label]);
 r.logs=await driver.sessionRequest('POST','/log',{type:'browser'});fs.writeFileSync(path.join(out,label+'.json'),JSON.stringify(r,null,2));fs.writeFileSync(path.join(out,label+'.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));console.log(JSON.stringify(r));return r;
}
(async()=>{try{
 await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${project}`,`user-data-dir=${temp}/profile`,'no-first-run','disable-backgrounding-occluded-windows','disable-renderer-backgrounding','mute-audio','js-flags=--max-old-space-size=1024']}});
 await driver.waitForScript('return !!window.$dataSystem&&DataManager.isDatabaseLoaded()&&ConfigManager.isLoaded()&&SceneManager._scene?.isStarted()&&!(SceneManager._scene instanceof Scene_Boot)&&!SceneManager.isSceneChanging();',[],{timeout:120000});
 await driver.execute('SceneManager.isGameActive=()=>true;DataManager.setupNewGame();SceneManager.goto(Scene_Map);');
 await driver.execute(`window.__hxCounts={disposes:0,frames:0,sourceIn:0};const proto=PIXI.BaseTexture.prototype,dispose=proto.dispose;proto.dispose=function(){__hxCounts.disposes++;return dispose.apply(this,arguments);};const frame=Object.getOwnPropertyDescriptor(PIXI.Texture.prototype,'_updateID');Object.defineProperty(PIXI.Texture.prototype,'_updateID',{...frame,set(v){__hxCounts.frames++;frame.set.call(this,v);}});const state=Graphics.app.renderer.state,blend=state.setBlendMode;state.setBlendMode=function(v){if(v==='source-in')__hxCounts.sourceIn++;return blend.apply(this,arguments);};`);
 const reports=[];
 for(const label of ['day','resize','night-lamps','editor']){
  if(label==='resize')await driver.execute('Graphics.resize(1024,768);');
  if(label==='night-lamps')await driver.execute(`const p=__rrHX.params;p.dayNight=true;p.ambient=true;p.nightDarkness=80;PluginManager.callCommand(new Game_Interpreter(),'Hendrix_3D_Light_and_Shadow','SkipTime',{skipTo:'22:00',fastForward:'false'});$gamePlayer.reserveTransfer(2,15,15,2,2);`);
  if(label==='editor')await driver.execute('__rrHX.open();');
  await driver.waitForScript('return SceneManager._stopped||(SceneManager._scene instanceof Scene_Map&&SceneManager._scene.isStarted()&&!SceneManager.isSceneChanging());',[],{timeout:45000});
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),1500);');
  const r=await capture(label);reports.push(r);assert.equal(r.stopped,false,r.error||JSON.stringify(r.logs));assert.equal(r.errors.length,0);assert.equal(r.layer,true);assert.equal(r.gl,0);
 }
 fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(reports,null,2));
 for(const r of reports)assert.equal(r.logs.filter(l=>/TypeError|ReferenceError|GL_INVALID|INVALID_OPERATION|Shader Error/i.test(l.message)).length,0,JSON.stringify(r.logs));
 assert.ok(reports[1].counts.disposes>0,'resizing uses the plugin disposal path');assert.ok(reports[3].editorInputs>0,'the visual editor opens');
 }catch(e){try{await capture('failure');}catch{}throw e;}finally{await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
