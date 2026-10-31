#!/usr/bin/env node
'use strict';
// Real editor layout with deterministic messages and one disposable real-worker import.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),source=path.join(root,'template/Sunset over Imdahl');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-import-progress-'));
const out=path.resolve(process.env.RR_IMPORT_PROGRESS_EVIDENCE||path.join(root,'scratchpad/import-progress'));
const baseline=process.argv.includes('--baseline'),driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));
const option=name=>process.argv.find(a=>a.startsWith('--'+name+'='))?.slice(name.length+3);
const sizes=(option('sizes')||'1920x1080,1280x720,1024x600').split(',').map(s=>s.split('x').map(Number));
const themes=(option('themes')||'dark,light').split(',');
const report=[];let reviewFlow=null;fs.mkdirSync(out,{recursive:true});
(async()=>{try{
 await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${path.join(root,'editor')}`,`user-data-dir=${temp}/profile`,'no-first-run','mute-audio']}});
 await driver.waitForScript('return !!window.reactor?.projectController && typeof RRLegacyImportDialog!=="undefined" && getComputedStyle(document.getElementById("splash-screen")).display==="none";',[],{timeout:90000});
 await driver.execute(`window.__progressErrors=[];addEventListener('error',e=>__progressErrors.push(e.message));addEventListener('unhandledrejection',e=>__progressErrors.push(String(e.reason)));
  window.__realWorker=require('worker_threads').Worker;window.__workers=[];
  require('worker_threads').Worker=class extends require('events').EventEmitter {constructor(){super();__workers.push(this);}terminate(){return Promise.resolve(0);}postMessage(){this.emit('message',{type:'cancelled'});}};
  window.__fileClick=HTMLInputElement.prototype.click;HTMLInputElement.prototype.click=function(){if(this.type==='file'){Object.defineProperty(this,'files',{value:[{path:__pickFolder}],configurable:true});this.dispatchEvent(new Event('change'));}else __fileClick.call(this);};
  RRDialog.confirm=async()=>true;`);
 const state=()=>driver.execute(`const track=document.querySelector('#rr-legacy-import-dialog [role=progressbar]'),bar=document.getElementById('rr-legacy-import-bar'),status=document.getElementById('rr-legacy-import-status'),rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
  const r=track.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
  return{viewport:[innerWidth,innerHeight],track:rect(track),bar:rect(bar),status:status.textContent,value:track.getAttribute('aria-valuenow'),visible:r.height>=8&&r.top>=0&&r.bottom<=innerHeight&&!!hit&&(hit===track||track.contains(hit)),open:getComputedStyle(document.getElementById('rr-legacy-import-open')).display!=='none'};`);
 for(const [width,height]of sizes)for(const theme of themes){
  await driver.execute('nw.Window.get().resizeTo(arguments[0],arguments[1]);document.documentElement.dataset.theme=arguments[2];',[width,height,theme]);
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,250);');
  await driver.execute('window.__pickFolder=arguments[0];RRLegacyImportDialog.show({});',[source]);
  await driver.execute("document.getElementById('rr-legacy-import-source-browse').click();window.__pickFolder=arguments[0];document.getElementById('rr-legacy-import-parent-browse').click();document.getElementById('rr-legacy-import-run').click();",[temp]);
  await driver.waitForScript('return __workers.length && document.getElementById("rr-legacy-import-run").disabled;',[],{timeout:10000});
  await driver.execute("__workers.at(-1).emit('message',{type:'progress',fraction:.55,status:'Converting maps'});");
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,250);');
  await driver.waitForScript(`const t=document.querySelector('#rr-legacy-import-dialog [role=progressbar]'),b=document.getElementById('rr-legacy-import-bar');return Math.abs(b.getBoundingClientRect().width-t.clientWidth*.55)<2;`,[],{timeout:10000});
  const start=await state();
  await driver.execute("document.querySelector('#rr-legacy-import-dialog .rr-modal-body').scrollTop=100000;");
  const scrolled=await state();
  const reviewFixture=!baseline&&report.length===0;
  if(reviewFixture)await driver.execute(`const fs=require('fs'),path=require('path'),dest=document.getElementById('rr-legacy-import-destination').value;const summary={missingFiles:['img/pictures/Portrait'],music:{failed:[{name:'Song.mid',error:'Fixture converter unavailable'}]}};fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'import-report.json'),JSON.stringify(summary));__workers.at(-1).emit('message',{type:'done',success:true,summary});`);
  else await driver.execute("__workers.at(-1).emit('message',{type:'done',success:true});");
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,250);');
  await driver.waitForScript(`const t=document.querySelector('#rr-legacy-import-dialog [role=progressbar]'),b=document.getElementById('rr-legacy-import-bar');return b.getBoundingClientRect().width>=t.clientWidth-1;`,[],{timeout:10000});
  const done=await state();report.push({width,height,theme,start,scrolled,done});
  fs.writeFileSync(path.join(out,`${width}x${height}-${theme}.png`),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
  if(!baseline){assert.ok(start.visible,JSON.stringify(report.at(-1)));assert.ok(start.bar.width>start.track.width*.5&&start.bar.width<start.track.width*.6,'the fill reflects intermediate progress');assert.ok(scrolled.visible,'scrolling must not hide progress');assert.ok(done.visible&&done.open,'completion bar and Open project remain visible');assert.ok(done.bar.width>=done.track.width-3,'completion fills the track');assert.equal(start.value,'55');assert.equal(done.value,'100');assert.equal(done.status,reviewFixture?'Import complete. Review the import report.':'Import complete.');}
  if(reviewFixture){
   await driver.execute("document.getElementById('rr-legacy-import-report').click();");
   await driver.waitForScript('return !!document.getElementById("rr-legacy-report-dialog");');
   reviewFlow=await driver.execute(`const report=document.getElementById('rr-legacy-report-dialog');return {missing:report.textContent.includes('Portrait'),media:report.textContent.includes('Song.mid'),buttonVisible:getComputedStyle(document.getElementById('rr-legacy-import-report')).display!=='none'};`);
   assert.ok(reviewFlow.missing&&reviewFlow.media&&reviewFlow.buttonVisible);
   fs.writeFileSync(path.join(out,'review-report.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
   await driver.execute(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));`);
   assert.equal(await driver.execute('return !document.getElementById("rr-legacy-report-dialog")&&!!document.getElementById("rr-legacy-import-dialog");'),true,'Escape closes the report and retains the import result');
  }
  await driver.execute("document.getElementById('rr-legacy-import-cancel').click();");
 }
 let realImport=null;
 if(!baseline&&!process.argv.includes('--layout-only')){
  await driver.execute('window.__pickFolder=arguments[0];RRLegacyImportDialog.show({});',[source]);
  await driver.execute("document.getElementById('rr-legacy-import-source-browse').click();window.__pickFolder=arguments[0];document.getElementById('rr-legacy-import-parent-browse').click();document.getElementById('rr-legacy-import-run').click();",[temp]);
  await driver.waitForScript('return document.getElementById("rr-legacy-import-run").disabled;',[],{timeout:10000});
  await driver.execute("__workers.at(-1).emit('message',{type:'done',success:false,error:'Fixture failure'});");
  const failed=await state();assert.ok(failed.visible);assert.match(failed.status,/failed/i);
  await driver.execute("document.getElementById('rr-legacy-import-run').click();");
  await driver.waitForScript('return document.getElementById("rr-legacy-import-run").disabled;',[],{timeout:10000});
  await driver.execute("__workers.at(-1).emit('message',{type:'done',success:true});document.getElementById('rr-legacy-import-cancel').click();require('worker_threads').Worker=__realWorker;");
  const fixture=path.join(temp,'source');fs.cpSync(source,fixture,{recursive:true,filter:p=>{const rel=path.relative(source,p);return rel!=='Music'&&!rel.startsWith('Music'+path.sep);}});
  await driver.execute('window.__pickFolder=arguments[0];RRLegacyImportDialog.show({});',[fixture]);
  await driver.execute("document.getElementById('rr-legacy-import-source-browse').click();window.__pickFolder=arguments[0];document.getElementById('rr-legacy-import-parent-browse').click();window.__progressSamples=[];window.__sampleTimer=setInterval(()=>{const t=document.querySelector('#rr-legacy-import-dialog [role=progressbar]');if(!t)return;const r=t.getBoundingClientRect();__progressSamples.push({value:t.getAttribute('aria-valuenow'),height:r.height,visible:r.height>=8&&r.top>=0&&r.bottom<=innerHeight});},30);document.getElementById('rr-legacy-import-run').click();",[temp]);
  await driver.waitForScript('return getComputedStyle(document.getElementById("rr-legacy-import-open")).display!=="none" || document.querySelector("#rr-legacy-import-dialog [role=alert]").textContent;',[],{timeout:120000});
  await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,250);');
  realImport=await state();realImport.samples=await driver.execute('clearInterval(__sampleTimer);return __progressSamples;');
  assert.ok(realImport.open&&realImport.visible,'real import completed with visible progress');
  assert.ok(realImport.samples.some(s=>Number(s.value)>0&&Number(s.value)<100),'the actual worker delivered intermediate progress');
  assert.ok(realImport.samples.filter(s=>s.value!==null).every(s=>s.visible),'progress stays visible throughout the real worker import');
  fs.writeFileSync(path.join(out,'real-import.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
  await driver.execute("document.getElementById('rr-legacy-import-cancel').click();");
 }
 const errors=await driver.execute('return __progressErrors;');assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({baseline,cases:report,reviewFlow,realImport,errors},null,2));console.log(JSON.stringify({cases:report.length,realImport:realImport&&{open:realImport.open,visible:realImport.visible,samples:realImport.samples.length},errors,visible:report.map(r=>({size:[r.width,r.height],theme:r.theme,start:r.start.visible,scrolled:r.scrolled.visible,done:r.done.visible,height:r.start.track.height}))}));
}finally{await driver.execute("require('worker_threads').Worker=window.__realWorker;HTMLInputElement.prototype.click=window.__fileClick;").catch(()=>{});await driver.close().catch(()=>{});fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
