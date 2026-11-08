const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),source=path.join(root,'template/Demo'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-app-audit-')),project=path.join(temp,'Demo');let driver;
(async()=>{try{
 fs.mkdirSync(project);for(const n of ['data','js','icon'])fs.cpSync(path.join(source,n),path.join(project,n),{recursive:true});for(const n of ['img','3d','effects','audio','fonts','movies','css'])if(fs.existsSync(path.join(source,n)))fs.symlinkSync(path.join(source,n),path.join(project,n));for(const n of ['index.html','package.json','project.rpgreactor'])fs.copyFileSync(path.join(source,n),path.join(project,n));
 driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${path.join(root,'editor')}`,`user-data-dir=${temp}/profile`,'no-first-run']}});await driver.setScriptTimeout(90000);
 await driver.waitForScript('return !!window.reactor?.projectController && getComputedStyle(document.getElementById("splash-screen")).display==="none";',[],{timeout:90000});
 assert.equal(await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{const pc=reactor.projectController;pc.currentProject=await reactor.projectManager.loadProject(arguments[0]);pc.projectLoaded=true;nw.Window.get().resizeTo(1920,1080);await reactor.uiManager.showEditorUI();await pc.populateProjectUI();await reactor.applyMap3DViewPreference(true);return true;})().then(done,e=>done(String(e.stack)));`,[project]),true);
 await driver.waitForScript('return !!reactor.projectController.mapEditor3D?.mapScene;',[],{timeout:90000});




 const loadMap=async id=>{assert.equal(await driver.executeAsync(`const done=arguments[arguments.length-1];reactor.projectController.loadMap(arguments[0]).then(done,e=>done(String(e)));`,[id]),true);};
 await driver.execute(`window.__auditErrors=[];addEventListener('error',e=>__auditErrors.push(String(e.error?.stack||e.message)));addEventListener('unhandledrejection',e=>__auditErrors.push(String(e.reason?.stack||e.reason)));`);
 await loadMap(2);
 const eventResult=await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{const m=reactor.eventManager;m.setEventMode(true);const e=m.createNewEvent(4,4);document.getElementById('event-position-z').value='2.5';m.eventEditor.saveAndClose();m.setEventPreview(e,0);m.copyEvent(e);await m.pasteEvent(5,4);const clone=m.selectedEvent,id=clone.id,placed={height:Reactor3D.eventZAt(m.currentMap,id),preview:m.getEventPreviewPage(clone)};m.saveState();clone.x=6;m.undo();const restored=m.selectedEvent===m.currentMap.events[id]&&m.selectedTileX===5;m.redo();const redone=m.selectedEvent===m.currentMap.events[id]&&m.selectedTileX===6;m.deleteEvent(m.selectedEvent);const removed=!m.currentMap.reactor3d.eventZ?.[id]&&m.currentMap.reactor3d.eventPreviews?.[id]===undefined;m.undo();const undoHeight=Reactor3D.eventZAt(m.currentMap,id);reactor.tilemapManager.saveMap();return {placed,restored,redone,removed,undoHeight};})().then(done,e=>done({error:String(e.stack)}));`);
 assert.deepEqual(eventResult,{placed:{height:2.5,preview:0},restored:true,redone:true,removed:true,undoHeight:2.5});console.log('Event clipboard/delete/undo:',eventResult);
 const expected=JSON.parse(fs.readFileSync(path.join(project,'data/Map001.r3d.json'),'utf8'));
 const mapResult=await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{const pc=reactor.projectController;await pc.copyMap(1);const ids=new Set(pc.currentProject.maps.filter(Boolean).map(m=>m.id));await pc.pasteMap();const added=pc.currentProject.maps.find(m=>m&&!ids.has(m.id));return {id:added?.id,name:added?.name};})().then(done,e=>done({error:String(e.stack)}));`);
 assert.ok(mapResult.id,JSON.stringify(mapResult));const stem='Map'+String(mapResult.id).padStart(3,'0');
 assert.deepEqual(JSON.parse(fs.readFileSync(path.join(project,'data',stem+'.r3d.json'),'utf8')),expected);
 assert.equal(JSON.parse(fs.readFileSync(path.join(project,'data',stem+'.json'),'utf8')).reactor3d,undefined);
 await loadMap(mapResult.id);const loadedSidecar=await driver.execute('return reactor.tilemapManager.currentMap.reactor3d;');assert.deepEqual(loadedSidecar.eventZ,expected.eventZ);assert.deepEqual(loadedSidecar.props,expected.props);assert.deepEqual(loadedSidecar.lighting,expected.lighting);
 await loadMap(2);
 await driver.executeAsync(`const done=arguments[arguments.length-1];window.confirm=()=>true;RRDialog.confirm=async()=>true;reactor.projectController.deleteMap(arguments[0]).then(done,e=>done({error:String(e.stack)}));`,[mapResult.id]);
 assert.equal(fs.existsSync(path.join(project,'data',stem+'.json')),false);assert.equal(fs.existsSync(path.join(project,'data',stem+'.r3d.json')),false);
 console.log('Map copy/load/delete: copied sidecar matches and both new files are removed.');
 // Check the older region tool after map changes, including a destroyed PIXI container.
 await driver.execute(`reactor.tilesetPaletteViewer.selectLayer('R');`);await loadMap(1);await loadMap(2);
 const regions=await driver.execute(`const r=reactor.projectController.regionManager;r.renderRegions();return {enabled:r.enabled,live:!r.regionLayer.destroyed,parent:r.regionLayer.parent===reactor.tilemapManager.container};`);
 assert.deepEqual(regions,{enabled:true,live:true,parent:true});console.log('Region overlay survives map transitions:',regions);
 assert.deepEqual(await driver.execute('return __auditErrors;'),[]);
 const logs=await driver.sessionRequest('POST','/log',{type:'browser'});assert.deepEqual(logs.filter(e=>/does not belong|GL_INVALID|TypeError/.test(e.message)),[]);
}finally{await driver?.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
