#!/usr/bin/env node
'use strict';
// Native compatibility audit. Every run copies writable project state; no source
// maps, plugin lists, saved games or project settings are changed.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..');
const option=(key,fallback)=>process.argv.find(a=>a.startsWith('--'+key+'='))?.slice(key.length+3)||fallback;
const out=path.resolve(option('out','/tmp/rr-template-2d-audit'));fs.mkdirSync(out,{recursive:true});
const selected=option('projects','').split('|').filter(Boolean);
// template/ also holds the original legacy games (RPG Maker 2000-VX Ace) that the
// importer reads, and tool folders; only folders that are game projects are audited.
const projects=fs.readdirSync(path.join(root,'template')).filter(n=>!['Demo','MZ3D'].includes(n)&&fs.existsSync(path.join(root,'template',n,'index.html'))&&(!selected.length||selected.includes(n)));
const report=[];
const battle=process.argv.includes('--battle');
async function audit(name){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-template-audit-')),project=path.join(temp,'project');let driver;
 const row={name,checks:[],warnings:[],errors:[]};const slug=name.replace(/[^a-z0-9]+/gi,'-');
 const save=()=>fs.writeFileSync(path.join(out,slug+'.json'),JSON.stringify(row,null,2));
 try{
  const source=path.join(root,'template',name);fs.mkdirSync(project);
  for(const entry of fs.readdirSync(source,{withFileTypes:true})){
   const src=path.join(source,entry.name),dst=path.join(project,entry.name);
   if(entry.isDirectory()){
    if(['data','js','icon'].includes(entry.name))fs.cpSync(src,dst,{recursive:true,mode:fs.constants.COPYFILE_FICLONE});
    else if(!/save|backup|\.git|node_modules/i.test(entry.name))fs.symlinkSync(src,dst);
   }else fs.copyFileSync(src,dst);
  }
  if(process.argv.includes('--trace-icons'))fs.appendFileSync(path.join(project,'js/reactor_windows.js'),`\n{const draw=Window_Base.prototype.drawIcon;Window_Base.prototype.drawIcon=function(...args){const b=ImageManager.loadSystem('IconSet');(window.__auditIcons||=[]).push({args,ready:b.isReady(),width:b.width,height:b.height});return draw.apply(this,args);};}\n`);
  const index=fs.readFileSync(path.join(project,'index.html'),'utf8');
  row.convertedCopy=!index.includes('reactor_main.js');
  if(row.convertedCopy){
   fs.writeFileSync(path.join(project,'index.html'),'<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="background:black"><script>window.$reactorMvCompat=false;</script><script src="js/reactor_main.js"></script></body></html>');
   fs.copyFileSync(path.join(project,'js/plugins.js'),path.join(project,'js/reactor_plugins.js'));
  }
  if(battle){for(const file of fs.readdirSync(path.join(project,'data')).filter(n=>n.endsWith('.json')&&!n.startsWith('Test_')&&!/^Map\d/.test(n)))fs.copyFileSync(path.join(project,'data',file),path.join(project,'data','Test_'+file));}
  const pkg=JSON.parse(fs.readFileSync(path.join(project,'package.json')));pkg.main=battle?'index.html?btest':'index.html';fs.writeFileSync(path.join(project,'package.json'),JSON.stringify(pkg));
  driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));await driver.start();
  await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${project}`,`user-data-dir=${temp}/profile`,'no-first-run','disable-backgrounding-occluded-windows','disable-renderer-backgrounding','disable-background-timer-throttling']}});
  await driver.setScriptTimeout(40000);
  const run=(script,args=[])=>driver.execute(script,args);
  const delay=ms=>driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),arguments[0]);',[ms]);
  const wait=async(script,timeout=20000)=>driver.waitForScript(script,[],{timeout});
  const state=()=>run(`const scene=window.SceneManager?._scene,ss=scene?._spriteset;return {scene:scene?.constructor.name,stopped:!!window.SceneManager?._stopped,text:document.body.innerText.slice(0,1800),map:window.$gameMap?.mapId?.(),party:window.$gameParty?.members?.().map(a=>a.name()),threeD:!!ss?._reactor3d,room:!!ss?._reactorRoom,frame:window.Graphics?.frameCount,characterSprites:ss?._characterSprites?.length,revision:window.RPG_REACTOR_RUNTIME_REVISION};`);
  const shot=async(label)=>{const f=path.join(out,slug+'-'+label+'.png');fs.writeFileSync(f,Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));return f;};
  await wait(`return !!window.SceneManager?._scene && !(SceneManager._scene instanceof Scene_Boot) && Graphics.width>0 || /Error|Failed to load/.test(document.body.innerText);`,60000);
  await run('nw.Window.get().focus();');await delay(1800);row.boot=await state();if(process.argv.includes('--trace-icons')){row.iconTrace=await run('return window.__auditIcons;');console.log('Icon trace '+JSON.stringify(row.iconTrace));}row.bootShot=await shot('boot');save();
  if(row.boot.stopped||/Error:|Failed to load/.test(row.boot.text))throw Error('Startup failed: '+row.boot.text);
  row.checks.push('startup');
  if(option('setup','')){row.setup=await driver.executeAsync(fs.readFileSync(option('setup',''),'utf8'));console.log('Setup '+name+' '+JSON.stringify(row.setup));save();}
  if(battle){
   await wait('return SceneManager._scene instanceof Scene_Battle && SceneManager._scene.isActive() || SceneManager._stopped;',30000);
   await delay(2000);row.battle=await state();
   if(row.battle.stopped)throw Error('Battle startup: '+row.battle.text);
   row.battlers=await run(`const ss=SceneManager._scene._spriteset;return ss.battlerSprites().map(s=>({name:s._battler?.name(),bitmap:(s._mainSprite||s).bitmap?.isReady(),width:(s._mainSprite||s).bitmap?.width,visible:s.visible}));`);
   row.battleShot=await shot('battle');row.checks.push('configured Battle Test startup');
   for(let step=0;step<20 && await run('return $gameMessage.isBusy();');step++){
    await run(`const scene=SceneManager._scene,w=scene._choiceListWindow||scene._messageWindow?._choiceWindow;const choices=$gameMessage.choices();if(w?.active&&choices.length){const no=choices.findIndex(c=>/^no$/i.test(c));if(no>=0){w.select(no);w.processOk();}}Input._currentState.ok=true;`);
    await delay(150);await run('Input._currentState.ok=false;');await delay(150);
   }
   if(await run('return !!window.Lecode?.S_TBS && $gameSystem.isTBS?.();'))row.warnings.push('Tactical battle deployment: no forced standard action.');
   else {
    row.action=await run(`const a=$gameParty.battleMembers().find(b=>b.isAlive()),target=$gameTroop.aliveMembers()[0];if(!a||!target)return {skipped:true};window.__auditActionSubject=a;window.__auditInvocations=0;const invoke=BattleManager.invokeAction;BattleManager.invokeAction=function(...args){__auditInvocations++;return invoke.apply(this,args);};a.forceAction(a.attackSkillId(),target.index());BattleManager.forceAction(a);if(BattleManager._phase==='input'&&!$gameTroop.isEventRunning())BattleManager.processForcedAction();return {actor:a.name(),target:target.name(),before:target.hp};`);
    await delay(4500);row.actionAfter=await run('return {invocations:window.__auditInvocations,stopped:!!SceneManager._stopped,phase:BattleManager._phase,text:document.body.innerText,reactorSequence:!!BattleManager._reactorSequence};');
    if(row.actionAfter.stopped)throw Error('Battle action: '+row.actionAfter.text);
    if(row.actionAfter.invocations>0)row.checks.push('existing attack invocation observed');else row.warnings.push('Configured battle did not resolve forced attack in the sampled interval.');
   }
  }else{
  if(await run('return SceneManager._scene.constructor.name==="Scene_SplashScreens";')){await run('Input._currentState.ok=true;');await delay(100);await run('Input._currentState.ok=false;');await wait('return SceneManager._scene.constructor.name!=="Scene_SplashScreens";',30000);}
  // Follow the authored New Game handler when the ordinary title owns one.
  const started=await run(`const s=SceneManager._scene;if(s instanceof Scene_Title&&s._commandWindow?.isHandled('newGame')){s._commandWindow.callHandler('newGame');return true;}return false;`);
  if(started)await delay(3000);
  row.authored=await state();row.authoredShot=await shot('authored');save();
  if(row.authored.stopped)throw Error('Authored startup stopped: '+row.authored.text);
  // A controlled map probe is needed for projects with title-map/intro flows.
  // Leave the previous scene BEFORE replacing game objects (HUDs retain them).
  if(!(await run('return SceneManager._scene instanceof Scene_Map && $gameParty.members().length>0 && $gameMap.mapId()>0;'))){
   await run('SceneManager.goto(Scene_Base);');await wait('return SceneManager._scene instanceof Scene_Base&&!(SceneManager._scene instanceof Scene_Map)&&!SceneManager.isSceneChanging();');
   await run('DataManager.setupNewGame();SceneManager.goto(Scene_Map);');
   row.controlledMap=true;
   await wait('return SceneManager._scene instanceof Scene_Map && SceneManager._scene.isActive() && !$gamePlayer.isTransferring() || SceneManager._stopped;',30000);
   await delay(1200);
  }
  if(process.argv.includes('--explore')){
   const samples={'Project3':48,'Project4':7,'Star Shift Freelancers':3,'Star Shift Origins':489,'Star Shift Rebellion':6,'Star-Shift Legacy':6,'Hendrix RPG Maker Action Combat MZ (v166a)':69};
   const mapId=samples[name];if(mapId){
    await run('SceneManager.goto(Scene_Base);');await wait('return !(SceneManager._scene instanceof Scene_Map)&&!SceneManager.isSceneChanging();');
    await run('DataManager.setupNewGame();$gamePlayer.reserveTransfer(arguments[0],10,10,2,0);SceneManager.goto(Scene_Map);',[mapId]);
    await wait('return $gameMap.mapId()==='+mapId+' && !$gamePlayer.isTransferring() && SceneManager._scene instanceof Scene_Map && SceneManager._scene.isActive() || SceneManager._stopped;',30000);
    await delay(1500);
    row.exploredMap=mapId;
    row.placement=await run(`const cx=Math.floor($gameMap.width()/2),cy=Math.floor($gameMap.height()/2);for(let radius=0;radius<15;radius++)for(let y=cy-radius;y<=cy+radius;y++)for(let x=cx-radius;x<=cx+radius;x++)if($gameMap.isValid(x,y)&&[2,4,6,8].every(d=>$gamePlayer.canPass(x,y,d))){$gamePlayer.locate(x,y);return [x,y];}return null;`);
   }
  }
  const first=await state();await delay(1600);const second=await state();row.map={first,second};row.video=await run(`const s=SceneManager._scene._spriteset?._videoParallax,v=s?.texture?.source?.resource;if(!s||!v)return null;const c=Graphics.app.renderer.extract.canvas({target:s}),b=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let color=0,alpha=0;for(let i=0;i<b.length;i+=4){color+=b[i]+b[i+1]+b[i+2];alpha+=b[i+3];}return {time:v.currentTime,paused:v.paused,ready:v.readyState,size:[s.width,s.height],texture:[s.texture.source.pixelWidth,s.texture.source.pixelHeight],resource:[v.videoWidth,v.videoHeight],color,alpha,visible:s.visible,parentVisible:s.parent?.visible};`);row.mapShot=await shot('map');save();
  if(second.stopped)throw Error('Map failed: '+second.text);
  if(second.frame<=first.frame)throw Error('Frame loop is not advancing');
  if(second.threeD||second.room)row.warnings.push('Authored start path is 3D; not a pure 2D map probe.');
  row.checks.push('map frames and character sprites');
  row.layers=await run(`const ss=SceneManager._scene._spriteset;return {fog:ss?._fogEffects?.filter(Boolean).map(s=>({name:s.fogName,origin:[s.origin.x,s.origin.y],tile:[s.tilePosition.x,s.tilePosition.y],opacity:s.opacity})),parallax:ss?._parallax?{origin:[ss._parallax.origin.x,ss._parallax.origin.y],tile:[ss._parallax.tilePosition.x,ss._parallax.tilePosition.y]}:null};`);
  const movable=await run('return SceneManager._scene instanceof Scene_Map && $gamePlayer.canMove();');
  if(movable){row.movement={before:await run('return [$gamePlayer.x,$gamePlayer.y];')};await run('Input._currentState.right=true;');await delay(500);await run('Input._currentState.right=false;');await delay(250);row.movement.after=await run('return [$gamePlayer.x,$gamePlayer.y];');row.checks.push('directional input');}
  else row.warnings.push('Authored event/intro blocks player input at sampled start.');
  if(await run('return $gameParty.members().length>0;')){
   for(const scene of ['Scene_Menu','Scene_Item','Scene_Skill','Scene_Equip','Scene_Status','Scene_Options']){
    await run('SceneManager.push(window[arguments[0]]);',[scene]);await wait('return !SceneManager.isSceneChanging() && SceneManager._scene.isActive() || SceneManager._stopped;');await delay(500);
    const s=await state();row.checks.push({scene,...s});if(s.stopped)throw Error(scene+': '+s.text);
    if(['Scene_Menu','Scene_Equip'].includes(scene))await shot(scene);
    await run('SceneManager.pop();');await wait('return !SceneManager.isSceneChanging()&&SceneManager._scene.isActive() || SceneManager._stopped;');
   }
  }else row.warnings.push('No initialized party: standard menu probes skipped.');
  }
  row.videoUploads=await run('return window.__auditVideoUploads||null;');
  row.status='passed';
 }catch(e){row.status='failed';row.errors.push(String(e.stack||e));}
 finally{
  if(driver?.sessionId){try{const entries=await driver.sessionRequest('POST','/log',{type:'browser'});fs.writeFileSync(path.join(out,slug+'-console.json'),JSON.stringify(entries,null,2));row.consoleFindings=entries.filter(e=>/Error|ERR_FILE_NOT_FOUND|GL_INVALID|does not belong|associated program|Insufficient buffer|failed/i.test(e.message)).slice(0,35);}catch(e){row.warnings.push('Console unavailable: '+e.message);}}
  if(row.status==='passed'&&row.consoleFindings?.length){row.status='findings';row.warnings.push('Review captured console findings before accepting this run.');}
  save();await driver?.close();fs.rmSync(temp,{recursive:true,force:true});
 }
 report.push(row);fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({name,status:row.status,checks:row.checks.length,warnings:row.warnings,errors:row.errors.map(e=>e.split('\n').slice(0,3).join(' ')),console:row.consoleFindings?.length}));
}
(async()=>{for(const name of projects){console.log('Auditing '+name);await audit(name);}console.log('Report: '+out);if(report.some(r=>r.status!=='passed'))process.exitCode=1;})().catch(e=>{console.error(e);process.exitCode=1;});
