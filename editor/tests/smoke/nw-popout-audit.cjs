'use strict';
// Real NW.js detached-window authoring audit. Only disposable project files are edited.
// Run through codex-check on an isolated display (tests/perf/headless-display.sh):
// node nw-popout-audit.cjs <mode> <start=0> <count=4> [output] [--compact]
// Modes: database, commands, common[-all], troop[-all], nested, workflows,
// placement, windows, branches. Start with small batches and close each browser.
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { isDeepStrictEqual } = require('node:util');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..');
const compact = process.argv.includes('--compact');
const mode = process.argv[2] || 'database', start = Number(process.argv[3] || 0), count = Number(process.argv[4] || 4);
const output = path.resolve((process.argv[5]&&!process.argv[5].startsWith('--')?process.argv[5]:null) || `scratchpad/popout-audit-20261029/${mode}-${start}${compact?'-compact':''}`);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-popout-audit-')), project = path.join(temp, 'Demo');
const driver = new WebDriverClient(path.join(root, 'nwjs-linux/chromedriver'));
const results = [];
let timedOut=false;
fs.mkdirSync(output, {recursive:true});
const pause = ms => new Promise(r => setTimeout(r,ms));
// Compile in the application's realm even while WebDriver is targeting its child window.
const run = (script,args=[]) => driver.execute('const h=window.__rrAuditHost||window;return h.Function(arguments[0]).apply(h,arguments[1]);',[script,args]);
const asyncRun = (script,args=[]) => driver.executeAsync('const h=window.__rrAuditHost||window;h.Function(arguments[0]).apply(h,[...arguments[1],arguments[arguments.length-1]]);',[script,args]);
const check = (ok,message) => { if(!ok)throw new Error(message); };
async function child(kind) {
 await run('for(const w of RRPopoutBridge.windows())if(!w.__rrAuditHost){w.__rrAuditHost=window;window.__listenAudit?.(w);}');
 const handles = await driver.sessionRequest('GET','/window/handles');
 for(const handle of handles){
  await driver.sessionRequest('POST','/window',{handle});
  if(await driver.execute('const e=document.getElementById(arguments[0]);return !!e&&e.ownerDocument===document;',[kind])){if(compact){await run('const api=arguments[0]==="database-viewer"?RRDatabaseWindow:RREventEditorWindow;api.popoutWindow().resizeTo(1000,650);',[kind]);await pause(200);}return;}
 }
 throw new Error(`No native child containing ${kind}`);
}
async function click(script,args=[]) {
 const rect=await run(`const el=(()=>{${script}})();if(!el)throw Error('Click target missing');el.scrollIntoView({block:'nearest',inline:'nearest'});const r=el.getBoundingClientRect();const x=Math.round(r.x+r.width/2),y=Math.round(r.y+r.height/2);const hit=el.ownerDocument.elementFromPoint(x,y);if(!r.width||!r.height||!(el===hit||el.contains(hit)))throw Error('Click target hidden/covered: '+el.outerHTML.slice(0,250)+' hit '+hit?.outerHTML.slice(0,150));return{x,y};`,args);
 await driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:'auditMouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,x:rect.x,y:rect.y},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});
 await pause(80);
}
async function text(script,value) {
 await click(script);
 await driver.sessionRequest('POST','/actions',{actions:[{type:'key',id:'auditKeys',actions:[{type:'keyDown',value:'\uE009'},{type:'keyDown',value:'a'},{type:'keyUp',value:'a'},{type:'keyUp',value:'\uE009'},{type:'keyDown',value:'\uE003'},{type:'keyUp',value:'\uE003'}]}]});
 await driver.sessionRequest('POST','/goog/cdp/execute',{cmd:'Input.insertText',params:{text:value}});
 await driver.sessionRequest('POST','/actions',{actions:[{type:'key',id:'auditKeys',actions:[{type:'keyDown',value:'\uE004'},{type:'keyUp',value:'\uE004'}]}]});
}
async function authored(row,item,expression) {
 const c=await run(`return ${expression}.list[0];`);
 row.authoredCode=c.code;
 if(item.reactor)row.authoredOperation=c.parameters?.[1];
 check((c.code===item.code||(item.code===356&&c.code===357))&&(!item.reactor||(c.parameters?.[0]==='RPGReactor'&&c.parameters?.[1]===item.reactor)),'Picker inserted a different command: '+JSON.stringify(c));
}
async function snapshot(name) {
 const png=await driver.sessionRequest('GET','/screenshot');
 fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(png,'base64'));
}
async function database(type) {
 const row={type};results.push(row);
 await run('reactor.databaseEditorUI.openDatabase(arguments[0]);',[type]);await pause(500);
 await child('database-viewer');await pause(400);
 row.window=await driver.execute('return {title:document.title,width:innerWidth,height:innerHeight};');
 await click('return document.querySelector(`.database-nav-item[data-type="${arguments[0]}"]`);',[type]);
 await pause(250);
 row.page=await run(`const d=document.getElementById('database-detail');return {children:d.children.length,text:d.textContent.trim().slice(0,150),controls:d.querySelectorAll('input,select,textarea,button').length,owner:d.ownerDocument===RRDatabaseWindow.popoutWindow().window.document,active:document.querySelector('.database-nav-item.active')?.dataset.type};`);
 check(row.page.owner&&row.page.active===type&&row.page.children>0,'Database page failed to render in child');
 const name=await run(`const record=reactor.databaseManager.data[arguments[0]]?.find?.(e=>e?.id>0);const field=record&&[...document.querySelectorAll('#database-detail input')].find(e=>e.type==='text'&&e.value===record.name&&e.getClientRects().length);if(!field)return null;field.dataset.auditName='1';return {id:record.id,name:record.name};`,[type]);
 if(name){
  const changed=`Audit ${type}`;
  await text('return document.querySelector("[data-audit-name]");',changed);
  check(await run('return reactor.databaseManager.data[arguments[0]][arguments[1]].name===arguments[2];',[type,name.id,changed]),'Typing failed to update record');
  await click('return document.querySelector(`.database-nav-item[data-type="${arguments[0]}"]`);',[type==='items'?'actors':'items']);
  await click('return document.querySelector(`.database-nav-item[data-type="${arguments[0]}"]`);',[type]);
  row.editRetained=await run('return [...document.querySelectorAll("#database-detail input")].some(e=>e.value===arguments[0]);',[changed]);check(row.editRetained,'Edit lost on section switch');
 }
 await snapshot(type);
 // Use the application's Cancel flow, choosing Discard in its confirmation below.
 await click('return document.getElementById("database-cancel-btn");');
 await pause(100);
 row.confirm=await run(`return [...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&/^(Discard|Don't Save|Yes)$/.test(e.textContent.trim())).map(e=>e.textContent.trim());`);
 if(row.confirm.length)await click(`return [...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&/^(Discard|Don't Save|Yes)$/.test(e.textContent.trim())).at(-1);`);
 await pause(200);
 row.closed=await run('return !document.getElementById("database-viewer").classList.contains("active");');check(row.closed,'Cancel did not close Database');
 if(name){row.cancelRestored=await run('return reactor.databaseManager.data[arguments[0]][arguments[1]].name===arguments[2];',[type,name.id,name.name]);check(row.cancelRestored,'Cancel did not restore original');}
 return row;
}
async function command(item,index) {
 const row={index,...item};results.push(row);
 await run(`const e=reactor.eventManager.eventEditor;window.__auditList=e.commandList;window.__auditPage=e.currentEvent.pages[0];__auditPage.list=[{code:0,indent:0,parameters:[]}];__auditList.selectedIndices=[];window.__opened=null;__auditList.newCommand(__auditPage,0);`);
 await text('return document.querySelector(".command-picker-search");',item.name);
 await click('return [...document.querySelectorAll("[data-command-pick]")].find(e=>e.textContent.trim()===arguments[0]);',[item.name]);
 await pause(100);
 row.opened=await run('return __opened?.key||null;');
 row.direct=await run('return __auditPage.list.length>1;');
 if(row.opened&&!row.direct){
  row.dialog=await run(`const m=[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&!e.closest('#event-editor-modal')).at(-1);return m?{owner:m.ownerDocument===RREventEditorWindow.popoutWindow().window.document,visible:true}:null;`);
  if(row.dialog)check(row.dialog.owner&&row.dialog.visible,'Command dialog misplaced/hidden');
  // Minimal authoring inputs for commands that intentionally reject an empty payload.
  await run(`const e=__opened.editor;if(arguments[0]==='ShowVideoSurface')e.data.movie='img/system/IconSet.png';`,[item.reactor]);
  const okScript=`return [...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&!e.disabled&&/^(OK|Insert)$/.test(e.textContent.trim())&&!e.closest('#event-editor-modal')).at(-1);`;
  await click(okScript);
  row.inserted=await run('return __auditPage.list.length>1;');
  if(!row.inserted){row.visible=await run(`return [...document.querySelectorAll('button')].filter(e=>e.getClientRects().length).map(e=>e.textContent.trim()).slice(-20);`);throw new Error('Command OK did not insert command');}
  await authored(row,item,'__auditPage');
  const saved=await run('return JSON.stringify(__auditPage.list);');
  await run('__auditList.editCommand(0,__auditPage,0);');await pause(80);
  await click(okScript);
  row.roundTrip=isDeepStrictEqual(JSON.parse(await run('return JSON.stringify(__auditPage.list);')),JSON.parse(saved));check(row.roundTrip,'Command changed on unchanged edit/OK');
  await run('__auditList.editCommand(0,__auditPage,0);');await pause(50);
  await click(`return [...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&!e.disabled&&e.textContent.trim()==='Cancel'&&!e.closest('#event-editor-modal')).at(-1);`);
  row.cancelUnchanged=await run('return JSON.stringify(__auditPage.list)===arguments[0];',[saved]);check(row.cancelUnchanged,'Command Cancel changed data');
 }else{row.inserted=await run('return __auditPage.list.length>1;');check(row.inserted,'No command dialog or inserted command');await authored(row,item,'__auditPage');}
 return row;
}
async function dbcommand(item,index) {
 const row={index,...item};results.push(row);
 await run(`const h=window.__dbCommandHost;window.__dbCommandPage=arguments[0]==='common'?h.currentEvent:h.currentTroop.pages[0];__dbCommandPage.list=[{code:0,indent:0,parameters:[]}];h.selectedCommandIndices=[];h.insertNewCommand(__dbCommandPage,0);`,[mode.startsWith('common')?'common':'troop']);
 await text('return document.querySelector(".command-picker-search");',item.name);
 await click('return [...document.querySelectorAll("[data-command-pick]")].find(e=>e.textContent.trim()===arguments[0]);',[item.name]);
 const direct=await run('return __dbCommandPage.list.length>1;');
 const ok=`return [...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&!e.disabled&&e.textContent.trim()==='OK'&&!e.closest('#database-viewer')).at(-1);`;
 if(!direct){if(item.reactor==='ShowVideoSurface')await run('__dbCommandHost._editors.videoSurface.data.movie="img/system/IconSet.png";');await click(ok);}
 row.inserted=await run('return __dbCommandPage.list.length>1;');check(row.inserted,'Database command did not insert');
 await authored(row,item,'__dbCommandPage');
 const saved=await run('return JSON.stringify(__dbCommandPage.list);');
 if(!direct||[205,302].includes(item.code)){
  const edit=mode.startsWith('common')?'__dbCommandHost.editCommand(0,__dbCommandPage);':'__dbCommandHost.editCommandSimple(__dbCommandPage.list[0],0,__dbCommandPage);';
  await run(edit);await click(ok);
  row.roundTrip=isDeepStrictEqual(JSON.parse(await run('return JSON.stringify(__dbCommandPage.list);')),JSON.parse(saved));if(!row.roundTrip){row.before=JSON.parse(saved);row.after=await run('return __dbCommandPage.list;');}check(row.roundTrip,'Database command changed on reopen');
  await run(edit);
  await click(`return [...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&!e.disabled&&e.textContent.trim()==='Cancel'&&!e.closest('#database-viewer')).at(-1);`);
  row.cancelUnchanged=await run('return JSON.stringify(__dbCommandPage.list)===arguments[0];',[saved]);check(row.cancelUnchanged,'Database command Cancel mutated data');
 }
 return row;
}
async function branches(item,index) {
 const row={index,name:'Common Event battle result branches'};results.push(row);
 await run('reactor.databaseEditorUI.openDatabase("commonEvents");');await pause(250);await child('database-viewer');
 await run('window.__branchHost=reactor.databaseEditorUI.commonEventEditor;window.__branchPage=__branchHost.currentEvent;__branchPage.list=[{code:0,indent:0,parameters:[]}];__branchHost.insertNewCommand(__branchPage,0);');
 await text('return document.querySelector(".command-picker-search");','Battle Processing');
 await click('return [...document.querySelectorAll("[data-command-pick]")].find(e=>e.textContent.trim()==="Battle Processing");');
 await click('return document.getElementById("battle-can-escape");');await click('return document.getElementById("battle-can-lose");');
 const ok=`return [...document.querySelectorAll('.battle-processing-editor-modal button')].find(e=>e.textContent.trim()==='OK');`;
 await click(ok);
 row.created=await run('return [601,602,603,604].every(code=>__branchPage.list.filter(c=>c.code===code).length===1);');check(row.created,'Missing battle result branches');
 await run(`for(const code of [601,603]){const at=__branchPage.list.findIndex(c=>c.code===code);__branchPage.list.splice(at+1,0,{code:118,indent:1,parameters:[code===601?'win body':'lose body']});}__branchHost.editCommand(0,__branchPage);`);
 await click(ok);
 row.preserved=await run('return __branchPage.list.filter(c=>c.code===118).length===2&&[601,602,603,604].every(code=>__branchPage.list.filter(c=>c.code===code).length===1);');check(row.preserved,'Battle edit lost or duplicated branch content');
 await run('__branchHost.editCommand(0,__branchPage);');await click('return document.getElementById("battle-can-lose");');await click(ok);
 row.asked=await run('return !!document.querySelector(".rr-dialog-danger")&&__branchPage.list.some(c=>c.code===603);');check(row.asked,'Removing nonempty result branch did not ask');
 await click('return document.querySelector(".rr-dialog-danger .rr-btn-secondary");');
 row.cancelKept=await run('return __branchPage.list.some(c=>c.code===118&&c.parameters[0]==="lose body");');check(row.cancelKept,'Cancelled branch removal lost content');
 await click(ok);await click('return document.querySelector(".rr-dialog-danger .rr-button-danger");');
 row.removed=await run('return !__branchPage.list.some(c=>c.code===603||(c.code===118&&c.parameters[0]==="lose body"))&&__branchPage.list.some(c=>c.code===118&&c.parameters[0]==="win body");');check(row.removed,'Confirmed removal affected wrong result body');return row;
}
async function windows(item,index) {
 const row={index,...item};results.push(row);
 await run('if(reactor.eventManager.eventEditor?.isOpen())reactor.eventManager.eventEditor.cancelChanges();');
 await run('reactor.eventManager.setEventMode(true);reactor.eventManager.createNewEvent(4,4);');await pause(350);await child('event-editor-modal');
 if(item.kind==='menu'){
  await run('RREventEditorWindow.popoutWindow().resizeTo(1000,650);');await pause(150);
  row.bounds=await run(`const e=reactor.eventManager.eventEditor,w=RREventEditorWindow.popoutWindow().window;e.commandList.showContextMenu(w.innerWidth-8,w.innerHeight-8,e.currentEvent.pages[0],0);const r=document.querySelector('.command-context-menu').getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,viewportWidth:w.innerWidth,viewportHeight:w.innerHeight};`);
  await snapshot('event-menu');check(row.bounds.right<=row.bounds.viewportWidth&&row.bounds.bottom<=row.bounds.viewportHeight,'Event command menu outside native window');return row;
 }
 if(item.kind==='picture'){
  await run(`RREventEditorWindow.popoutWindow().resizeTo(1000,650);const e=reactor.eventManager.eventEditor.commandList.showPictureEditor;e.show(null,()=>{});const names=require('fs').readdirSync(require('path').join(reactor.projectController.currentProject.path,'img/pictures'));e.pictureName=names.find(n=>/\.png$/i.test(n)).replace(/\.png$/i,'');e.renderContent();`);await pause(100);
  await click('return document.querySelector(".show-picture-quick-setting-btn");');await pause(200);
  row.bounds=await run(`const e=document.querySelector('.show-picture-quick-setting-modal .rr-modal'),r=e.getBoundingClientRect(),w=e.ownerDocument.defaultView;return{width:r.width,height:r.height,right:r.right,bottom:r.bottom,x:r.x,y:r.y,viewportWidth:w.innerWidth,viewportHeight:w.innerHeight};`);
  await snapshot('picture-quick');check(row.bounds.x>=0&&row.bounds.y>=0&&row.bounds.right<=row.bounds.viewportWidth&&row.bounds.bottom<=row.bounds.viewportHeight,'Picture Quick Setting outside window');
  await click(`return [...document.querySelectorAll('.show-picture-quick-setting-modal button')].find(e=>e.textContent.trim()==='Cancel');`);return row;
 }
 const database=item.kind==='database',api=database?'RRDatabaseWindow':'RREventEditorWindow';
 if(database){await run('reactor.databaseEditorUI.openDatabase("actors");');await pause(300);await child('database-viewer');}
 const field=database?'#database-detail input[data-field="name"]':'#event-name-field';
 const before=await run('return document.querySelector(arguments[0]).value;',[field]);
 await text(`return document.querySelector(${JSON.stringify(field)});`,'Unsaved native close audit');
 await run(`${api}.popoutWindow().close();`);await pause(150);
 row.questionOwner=await run(`const e=document.getElementById('rr-unsaved-discard')||document.querySelector('.rr-dialog-danger');return !!e&&e.ownerDocument===${api}.popoutWindow().window.document;`);check(row.questionOwner,'Native close question opened in another window');
 const cancel=database?`return document.querySelector('.rr-dialog-danger .rr-btn-secondary');`:`return document.getElementById('rr-unsaved-cancel');`;
 await click(cancel);
 row.cancelKept=await run(`return ${database?'document.getElementById("database-viewer").classList.contains("active")':'reactor.eventManager.eventEditor.isOpen()'}&&document.querySelector(arguments[0]).value==='Unsaved native close audit';`,[field]);check(row.cancelKept,'Cancel did not keep native editor draft');
 await run(`${api}.popoutWindow().close();`);await pause(100);
 await click(database?`return [...document.querySelectorAll('.rr-dialog-danger button')].find(e=>e.textContent.trim()==='Discard');`:`return document.getElementById('rr-unsaved-discard');`);
 row.closed=await run(`return ${database?'!document.getElementById("database-viewer").classList.contains("active")':'!reactor.eventManager.eventEditor.isOpen()'};`);check(row.closed,'Native Discard did not close editor');
 if(database){await run('reactor.databaseEditorUI.openDatabase("actors");');await pause(150);await child('database-viewer');row.reopened=await run('return document.querySelector(arguments[0]).value===arguments[1];',[field,before]);check(row.reopened,'Reopen retained discarded Database edit');}
 else{row.discarded=await run('return reactor.eventManager.currentMap.events.filter(Boolean).length===0;');check(row.discarded,'Discard inserted a new event');}
 return row;
}
async function placement(item,index) {
 const row={index,...item};results.push(row);
 await run('reactor.databaseEditorUI.openDatabase(arguments[0]);',[item.type]);await pause(250);await child('database-viewer');
 await run('RRDatabaseWindow.popoutWindow().resizeTo(1000,650);');await pause(250);
 await click('return document.querySelector(`.database-nav-item[data-type="${arguments[0]}"]`);',[item.type]);
 await run(item.prepare||'');
 if(item.selector){
  await run('document.querySelector(arguments[0]).scrollIntoView({block:"end"});',[item.selector]);
  await click('return document.querySelector(arguments[0]);',[item.selector]);
 }else await run(item.show);
 row.bounds=await run(`const e=document.querySelector(arguments[0]),r=e.getBoundingClientRect(),w=e.ownerDocument.defaultView;return{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,viewportWidth:w.innerWidth,viewportHeight:w.innerHeight};`,[item.popup]);
 await snapshot('placement-'+index+'-'+item.type);
 check(row.bounds.x>=0&&row.bounds.y>=0&&row.bounds.right<=row.bounds.viewportWidth&&row.bounds.bottom<=row.bounds.viewportHeight,'Popup extends beyond its native window');
 await run(item.close);return row;
}
async function workflow(item,index) {
 const row={index,...item};results.push(row);
 await run('reactor.databaseEditorUI.openDatabase(arguments[0]);',[item.type]);await pause(250);await child('database-viewer');
 await click('return document.querySelector(`.database-nav-item[data-type="${arguments[0]}"]`);',[item.type]);
 const input=()=>`return document.querySelector(${JSON.stringify(item.selector)});`;
 await run('window.__workflowBefore=JSON.stringify(reactor.databaseManager.data);');
 const edit=async suffix=>{
  if(item.key){await click(input());await driver.sessionRequest('POST','/actions',{actions:[{type:'key',id:'auditKeys',actions:[{type:'keyDown',value:suffix?'k':'j'},{type:'keyUp',value:suffix?'k':'j'}]}]});}
  else if(item.toggle)await click(input());
  else await text(input(),'Audit '+item.type+(suffix||''));
 };
 await edit('');
 row.changed=await run('return JSON.stringify(reactor.databaseManager.data)!==__workflowBefore;');check(row.changed,'Editing did not change database');
 await click('return document.getElementById("database-apply-btn");');
 await driver.waitForScript('const h=window.__rrAuditHost||window;return !h.reactor.databaseEditorUI._databaseSaveInFlight;',[],{timeout:30000});
 row.applied=await run(`window.__workflowApplied=JSON.stringify(reactor.databaseManager.data);return reactor.databaseEditorUI._dataSnapshot===__workflowApplied;`);check(row.applied,'Apply did not advance baseline');
 row.disk=await run(`const file=arguments[0],dm=reactor.databaseManager,p=require('path').join(reactor.projectController.currentProject.path,'data',file),f=require('fs'),key=dm.dataFiles.find(([,name])=>name===file)?.[0];return f.existsSync(p)&&JSON.stringify(JSON.parse(f.readFileSync(p,'utf8')))===JSON.stringify(dm.fileContent(file,dm.data[key]));`,[item.file||'System.json']);check(row.disk,'Apply did not write database file');
 await edit(' second');
 await click('return document.getElementById("database-cancel-btn");');
 await click(`return [...document.querySelectorAll('button')].find(e=>e.getClientRects().length&&e.textContent.trim()==='Discard');`);
 row.cancelAfterApply=await run('return JSON.stringify(reactor.databaseManager.data)===__workflowApplied;');check(row.cancelAfterApply,'Cancel did not restore Apply baseline');
 await run('reactor.databaseEditorUI.openDatabase(arguments[0]);',[item.type]);await pause(150);await child('database-viewer');
 await click('return document.getElementById("database-ok-btn");');await pause(200);
 row.okClosed=await run('return !document.getElementById("database-viewer").classList.contains("active");');check(row.okClosed,'Database OK did not close');
 return row;
}
async function nested(item,index) {
 const row={index,...item};results.push(row);
 await run('reactor.databaseEditorUI.openDatabase(arguments[0]);',[item.type]);await pause(200);await child('database-viewer');
 await click('return document.querySelector(`.database-nav-item[data-type="${arguments[0]}"]`);',[item.type]);
 await run(`window.__nestedSaved=false;const db=reactor.databaseEditorUI,dm=reactor.databaseManager;window.__nestedRecord=JSON.parse(JSON.stringify(dm.data[arguments[0]].find(e=>e?.id>0)));const r=__nestedRecord,cb=()=>{__nestedSaved=true;};${item.show}`,[item.type,item.code]);
 await pause(100);
 row.owner=await run(`const m=[...document.querySelectorAll('[class*="modal"], [id$="-modal"]')].filter(e=>e.getClientRects().length&&!e.closest('#database-viewer')).at(-1);return !!m&&m.ownerDocument===RRDatabaseWindow.popoutWindow().window.document;`);check(row.owner,'Nested dialog outside Database window');
 const button=save=>`return [...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&!e.disabled&&${save?'/^(OK|Save|Apply)$/':'/^(Cancel|Close)$/'}.test(e.textContent.trim())&&!e.closest('#database-viewer')).at(-1);`;
 await click(button(true));
 row.saved=await run('return __nestedSaved;');
 row.closed=await run(`return ![...document.querySelectorAll('button')].some(e=>e.getClientRects().length&&!e.closest('#database-viewer')&&e.textContent.trim()==='OK');`);check(row.closed,'Nested OK did not close dialog');
 await run(`window.__nestedBefore=JSON.stringify(__nestedRecord);window.__nestedSaved=false;const db=reactor.databaseEditorUI,r=__nestedRecord,cb=()=>{__nestedSaved=true;};${item.show}`,[item.type,item.code]);
 await click(button(false));
 row.cancelUnchanged=await run('return !__nestedSaved&&JSON.stringify(__nestedRecord)===__nestedBefore;');check(row.cancelUnchanged,'Nested dialog Cancel changed record');
 await pause(1000);
 await click('return document.getElementById("database-cancel-btn");');
 if(await run('return !!document.querySelector(".rr-dialog-danger");'))await click(`return [...document.querySelectorAll('.rr-dialog-danger button')].find(e=>e.textContent.trim()==='Discard');`);
 return row;
}
(async()=>{try{
 fs.mkdirSync(project);
 for(const n of ['data','js','icon','3d'])fs.cpSync(path.join(root,'template/Demo',n),path.join(project,n),{recursive:true,mode:fs.constants.COPYFILE_FICLONE});
 for(const n of ['img','audio','effects','fonts','movies','css'])if(fs.existsSync(path.join(root,'template/Demo',n)))fs.symlinkSync(path.join(root,'template/Demo',n),path.join(project,n));
 for(const n of ['index.html','package.json','project.rpgreactor'])fs.copyFileSync(path.join(root,'template/Demo',n),path.join(project,n));
 const mapFile=path.join(project,'data/Map001.json'),map=JSON.parse(fs.readFileSync(mapFile));map.width=25;map.height=25;map.events=[null];map.data=Array(25*25*6).fill(0);fs.writeFileSync(mapFile,JSON.stringify(map));fs.rmSync(path.join(project,'data/Map001.r3d.json'),{force:true});
 await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${path.join(root,'editor')}`,`user-data-dir=${temp}/profile`,'no-first-run','js-flags=--max-old-space-size=1024','disable-backgrounding-occluded-windows']}});await driver.setScriptTimeout(90000);
 await driver.waitForScript('return !!window.reactor?.projectController&&getComputedStyle(document.getElementById("splash-screen")).display==="none";',[],{timeout:90000});
 check(await asyncRun(`const done=arguments[arguments.length-1];(async()=>{window.__auditErrors=[];const listen=w=>{w.addEventListener('error',e=>{if(e.error||!String(e.message).includes('ResizeObserver'))__auditErrors.push(String(e.error?.stack||e.message));});w.addEventListener('unhandledrejection',e=>__auditErrors.push(String(e.reason?.stack||e.reason)));};listen(window);window.__listenAudit=listen;const pc=reactor.projectController,loaded=await pc.projectManager.loadProject(arguments[0]);if(!pc.acquireProjectLock(loaded.path))throw Error('Lock failed');pc.currentProject=loaded;pc.lastLoadedProjectPath=null;pc.projectLoaded=true;pc.rememberMap3DView(1,false);nw.Window.get().resizeTo(1920,1080);await pc.uiManager.showEditorUI();await pc.populateProjectUI();await pc.loadMap(1,{skipDirtyCheck:true});reactor.databaseEditorUI.setCurrentProject(loaded);reactor.modelPropsManager?.preview2D?.suspend();reactor.modelPropsManager?.preview2D?.app?.ticker?.stop();return true;})().then(done,e=>done(String(e.stack)));`,[project])===true,'Project initialization failed');
 await run(`const dm=reactor.databaseManager;if(!dm.getQuests().some(e=>e?.id>0))dm.data.quests=[null,DatabaseQuestEditor.normalize({id:1,name:'Audit quest',objectives:[{text:'Audit objective'}],rewards:[{text:'Audit reward'}]})];`);
 let catalog;
 if(mode==='branches')catalog=[{}];
 else if(mode.startsWith('common')||mode.startsWith('troop')){
  const type=mode.startsWith('common')?'commonEvents':'troops';await run('reactor.databaseEditorUI.openDatabase(arguments[0]);',[type]);await pause(500);await child('database-viewer');
  catalog=await run(`window.__dbCommandHost=arguments[0]==='common'?reactor.databaseEditorUI.commonEventEditor:reactor.databaseEditorUI.troopEditor;const p=new EventCommandPicker();return Object.values(p.commandData).flatMap(t=>t.columns.flatMap(c=>c.sections.flatMap(s=>s.commands))).filter(c=>arguments[1]||[101,102,111,112,117,121,122,205,230,231,232,241,301,302,337,339,355,356].includes(c.code));`,[mode.startsWith('common')?'common':'troop',mode.endsWith('-all')]);
 }
 else if(mode==='windows')catalog=[{kind:'database'},{kind:'event'},{kind:'picture'},{kind:'menu'}];
 else if(mode==='placement')catalog=[
  {type:'skills',selector:'.rr-elements-field',popup:'.rr-elements-popover',close:'ActionElements.close();'},
  {type:'troops',show:'const w=RRDatabaseWindow.popoutWindow().window;reactor.databaseEditorUI.troopEditor.showMemberContextMenu(w.innerWidth-8,w.innerHeight-8);',popup:'.troop-member-context-menu',close:'document.querySelector(".troop-member-context-menu").remove();'},
  {type:'actors',show:'const w=RRDatabaseWindow.popoutWindow().window;reactor.databaseEditorUI.showDatabaseActionMenu(w.innerWidth-8,w.innerHeight-8,[{label:"Audit action",action:()=>{}},{label:"Another action",action:()=>{}}]);',popup:'.rr-database-action-menu',close:'reactor.databaseEditorUI.closeDatabaseActionMenu();'},
  {type:'actors',show:'const db=reactor.databaseEditorUI,w=RRDatabaseWindow.popoutWindow().window;db.showListContextMenu(w.innerWidth-8,w.innerHeight-8,reactor.databaseManager.data.actors[1],reactor.databaseManager.data.actors,"actors",()=>{},null,document.getElementById("database-detail"));',popup:'#database-list-context-menu',close:'document.getElementById("database-list-context-menu").remove();'},
  {type:'structures',selector:'.rr-structures-mat',popup:'.rr-material-popup',close:'RRMaterialPopup.close();'}
 ];
 else if(mode==='workflows'){
  await run(`const dm=reactor.databaseManager;if(!dm.getQuests().some(e=>e?.id>0))dm.data.quests=[null,DatabaseQuestEditor.normalize({id:1,name:'Audit quest'})];if(!dm.getMusicSequences().some(e=>e?.id>0))dm.data.system.reactorMusicSequences=[null,DatabaseMusicSequenceEditor.normalize({id:1,name:'Audit music'})];`);
  catalog=[{type:'quests',selector:'#database-detail input[data-field="name"]',file:'ReactorQuests.json'},
   {type:'musicSequences',selector:'.music-sequence-name'},
   {type:'vehicles',selector:'.vehicle-name',file:'System.json'},
   {type:'system1',selector:'[data-system-field="gameTitle"]'},
   {type:'system2',selector:'.sys2-menu-cmd',toggle:true},
   {type:'types',selector:'.rr-types-name-editor'},
   {type:'terms',selector:'#database-detail input[type="text"]'},
   {type:'controls',selector:'.rr-controls-add[data-kind="key"][data-action="ok"]',key:true},
   {type:'online',selector:'input[name="online-type"]',toggle:true},
   {type:'characterCreation',selector:'#character-mode',toggle:false},
   {type:'reactorFeatures',selector:'.rr-feature-toggle',toggle:true},
   {type:'actors',selector:'#database-detail input[data-field="name"]',file:'Actors.json'},
   {type:'classes',selector:'#database-detail input[data-field="name"]',file:'Classes.json'},
   {type:'items',selector:'#database-detail input[data-field="name"]',file:'Items.json'}];
 }
 else if(mode==='nested')catalog=[
 ...[11,12,13,14,15,21,22,23,31,32,33,34,35,41,42,43,44,51,52,53,54,55,61,62,63,64].map(code=>({name:'Trait '+code,type:'classes',code,callback:true,show:'r.traits=[{code:arguments[1],dataId:1,value:1}];db.classEditor.traitEditor.showTraitEditorModal(r,0,cb);'})),
 ...[11,12,13,21,22,31,32,33,34,41,42,43,44].map(code=>({name:'Effect '+code,type:'items',code,callback:true,show:'r.effects=[{code:arguments[1],dataId:1,value1:1,value2:0}];db.itemEditor.effectEditor.showEffectEditorModal(r,0,cb);'})),
 ...Array.from({length:8},(_,code)=>({name:'Parameter curve '+code,type:'classes',code,show:"db.classEditor.showParameterCurveModal(r,arguments[1],'Parameter','#cf5f5f');"})),
 {name:'EXP curve',type:'classes',show:'db.classEditor.showExpCurveModal(r);'},
 {name:'Class learning',type:'classes',show:'db.classEditor.showLearningEditorModal(r,-1);'},
 ...Array.from({length:7},(_,code)=>({name:'Enemy condition '+code,type:'enemies',code,show:'db.enemyEditor.showActionEditorModal(r,-1,{skillId:1,rating:5,conditionType:arguments[1],conditionParam1:0,conditionParam2:0});'})),
 {name:'Troop conditions',type:'troops',show:'db.troopEditor.currentTroop=r;db.troopEditor.showConditionsModal(r.pages[0]);'},
 {name:'Animation cell',type:'animations',show:"Object.assign(r,{animation1Name:'',animation2Name:'',frames:[[[0,0,0,100,0,0,255,0]]],timings:[]});db.animationEditor.showCellPropertiesModal(r,0,0,cb);"},
 {name:'Animation effect browser',type:'animations',show:'db.animationEditor.showEffectFilePicker(r,document.getElementById("database-detail"));'}
 ];
 else if(mode==='database')catalog=await run('return DatabaseEditorUI.NAV_SECTIONS.flatMap(s=>s.pages).map(p=>p.type);');
 else {
  await run('reactor.eventManager.setEventMode(true);reactor.eventManager.createNewEvent(4,4);');await pause(500);await child('event-editor-modal');
  catalog=await run(`const list=reactor.eventManager.eventEditor.commandList;for(const [key,e]of Object.entries(list))if(e&&typeof e.show==='function'&&key!=='commandPicker'){const show=e.show;e.show=function(...args){window.__opened={key,editor:e};return show.apply(this,args);};}return Object.values(list.commandPicker.commandData).flatMap(t=>t.columns.flatMap(c=>c.sections.flatMap(s=>s.commands)));`);
 }
 fs.writeFileSync(path.join(output,'catalog.json'),JSON.stringify(catalog,null,2));
 for(let i=start;i<Math.min(start+count,catalog.length);i++){
  try{const row=mode==='database'?await database(catalog[i]):mode==='nested'?await nested(catalog[i],i):mode==='workflows'?await workflow(catalog[i],i):mode==='placement'?await placement(catalog[i],i):mode==='windows'?await windows(catalog[i],i):mode==='branches'?await branches(catalog[i],i):(mode.startsWith('common')||mode.startsWith('troop'))?await dbcommand(catalog[i],i):await command(catalog[i],i);console.log('PASS',JSON.stringify(row));}
  catch(e){const row=results.at(-1)||{};row.error=String(e.stack);console.log('FAIL',JSON.stringify(row));if(/no answer|timed out/i.test(String(e))){timedOut=true;fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));}else await snapshot(`failure-${i}`).catch(()=>{});break;}
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
 }
 const errors=timedOut?['Native automation timed out; inspect the failing step.']:await run('return __auditErrors;');fs.writeFileSync(path.join(output,'errors.json'),JSON.stringify(errors,null,2));
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(results,null,2));
 console.log('AUDIT',JSON.stringify({mode,start,count,total:catalog.length,completed:results.length,errors,output}));
 if(results.some(r=>r.error)||errors.length)process.exitCode=1;
 }finally{await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
