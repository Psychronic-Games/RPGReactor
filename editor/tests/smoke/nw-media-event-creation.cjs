const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),source=path.join(root,'template/Demo'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-media-events-')),project=path.join(temp,'Demo');let driver;
(async()=>{try{
 fs.mkdirSync(project);for(const n of ['data','js','icon'])fs.cpSync(path.join(source,n),path.join(project,n),{recursive:true});for(const n of ['img','3d','effects','audio','fonts','movies','css'])if(fs.existsSync(path.join(source,n)))fs.symlinkSync(path.join(source,n),path.join(project,n));for(const n of ['index.html','package.json','project.rpgreactor'])fs.copyFileSync(path.join(source,n),path.join(project,n));
 driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${path.join(root,'editor')}`,`user-data-dir=${temp}/profile`,'no-first-run']}});await driver.setScriptTimeout(90000);
 await driver.waitForScript('return !!window.reactor?.projectController && getComputedStyle(document.getElementById("splash-screen")).display==="none";',[],{timeout:90000});
 assert.equal(await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{const pc=reactor.projectController;pc.currentProject=await reactor.projectManager.loadProject(arguments[0]);pc.projectLoaded=true;nw.Window.get().resizeTo(1920,1080);await reactor.uiManager.showEditorUI();await pc.populateProjectUI();await reactor.applyMap3DViewPreference(true);return true;})().then(done,e=>done(String(e.stack)));`,[project]),true);
 await driver.waitForScript('return !!reactor.projectController.mapEditor3D?.mapScene;',[],{timeout:90000});

 assert.equal(await driver.executeAsync(`const done=arguments[arguments.length-1];reactor.projectController.loadMap(2).then(done,e=>done(String(e)));`),true);
 await driver.waitForScript('return reactor.mapEditor3D.currentMap()?.id===2&&!!reactor.mapEditor3D.mapScene;',[],{timeout:30000});
 await driver.execute(`reactor.mediaSurfaceManager.open();const row=reactor.mediaSurfaceManager.rows()[0];reactor.mediaSurfaceManager.duplicate(Number(row.id));`);
 await driver.waitForScript(`return !!reactor.mediaSurfacePreviewManager.authoring;`,[],{timeout:10000});
 await driver.execute(`document.getElementById('toolbar-event-manager-btn').click();`);
 const state=await driver.execute(`return {mode:reactor.eventManager.eventMode,authoring:!!reactor.mediaSurfacePreviewManager.authoring,panel:!!reactor.mediaSurfaceManager.panel,selected:!!reactor.mediaSurfaceManager.panel,map:reactor.eventManager.currentMap.id};`);
 const mediaBefore=await driver.execute('return reactor.mediaSurfaceManager.rows();');
 assert.equal(mediaBefore.length,5);
 console.log('Event mode after media:',state);
 const point=await driver.execute(`const m=reactor.mapEditor3D,r=(m.inputSurface||m.canvas).getBoundingClientRect();for(let y=.25;y<.8;y+=.1)for(let x=.2;x<.8;x+=.1){const px=Math.round(r.left+x*r.width),py=Math.round(r.top+y*r.height),tile=m.tileAt(px,py);if(tile&&!m.eventAt(px,py))return {x:px,y:py,tile};}return null;`);assert.ok(point);
 await driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:'new-event',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,x:point.x,y:point.y},{type:'pointerDown',button:0},{type:'pointerUp',button:0},{type:'pause',duration:100},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});
 const editorState=()=>driver.execute(`const e=reactor.eventManager.eventEditor;return {visible:getComputedStyle(document.getElementById('event-editor-modal')).display!=='none',event:e?.currentEvent?{id:e.currentEvent.id,x:e.currentEvent.x,y:e.currentEvent.y}:null};`);
 const checkOpened=async(label)=>{await driver.waitForScript(`return getComputedStyle(document.getElementById('event-editor-modal')).display!=='none';`,[],{timeout:10000});const value=await editorState();assert.equal(value.event.x,point.tile.x);assert.equal(value.event.y,point.tile.y);console.log(label,value);};
 assert.deepEqual(state,{authoring:false,map:2,mode:true,panel:false,selected:false});
 await checkOpened('Double-click creates on the clicked tile');
 await driver.execute('reactor.eventManager.eventEditor.cancelChanges();');
 assert.equal(await driver.execute('return reactor.eventManager.currentMap.events.filter(Boolean).length;'),0);
 // An unfinished Place gesture must also release input when Event mode is selected.
 await driver.execute(`reactor.mediaSurfaceManager.open();reactor.mediaSurfaceManager.place();document.getElementById('toolbar-event-manager-btn').click();`);
 assert.equal(await driver.execute('return !!reactor.mediaSurfaceManager.cancelPlacement;'),false);
 await driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:'new-event',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,x:point.x,y:point.y},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});
 assert.deepEqual(await driver.execute('return [reactor.eventManager.selectedTileX,reactor.eventManager.selectedTileY];'),[point.tile.x,point.tile.y]);
 await driver.sessionRequest('POST','/actions',{actions:[{type:'key',id:'enter-event',actions:[{type:'keyDown',value:'\uE007'},{type:'keyUp',value:'\uE007'}]}]});
 await checkOpened('Click then Enter creates on the selected tile');await driver.execute('reactor.eventManager.eventEditor.cancelChanges();');
 await driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:'new-event',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,x:point.x,y:point.y},{type:'pointerDown',button:2},{type:'pointerUp',button:2}]}]});
 await driver.waitForScript('return !!document.getElementById("event-context-menu");',[],{timeout:5000});
 assert.equal(await driver.execute(`const row=[...document.querySelectorAll('#event-context-menu .context-menu-item')].find(e=>/New Event/i.test(e.textContent));if(!row)return false;row.click();return true;`),true);
 await checkOpened('Right-click New Event opens on the clicked tile');
 const saved=await driver.execute(`const manager=reactor.eventManager;manager.eventEditor.currentEvent.name='Media Event Check';document.getElementById('event-editor-ok-btn').click();return {saved:reactor.tilemapManager.saveMap(),events:manager.currentMap.events.filter(Boolean).map(e=>({id:e.id,name:e.name,x:e.x,y:e.y})),surfaces:reactor.mediaSurfaceManager.rows().length};`);
 assert.equal(saved.saved,true);assert.equal(saved.events.length,1);assert.equal(saved.events[0].name,'Media Event Check');assert.equal(saved.events[0].x,point.tile.x);assert.equal(saved.events[0].y,point.tile.y);
 const disk=JSON.parse(fs.readFileSync(path.join(project,'data/Map002.json'),'utf8'));assert.equal(disk.events.filter(Boolean).length,1);assert.equal(disk.events.find(Boolean).name,'Media Event Check');
 assert.deepEqual(await driver.execute('return reactor.mediaSurfaceManager.rows();'),mediaBefore);
 const sidecar=JSON.parse(fs.readFileSync(path.join(project,'data/Map002.r3d.json'),'utf8'));assert.deepEqual(sidecar.mediaSurfaces,mediaBefore);
 const logs=await driver.sessionRequest('POST','/log',{type:'browser'});assert.deepEqual(logs.filter(e=>/ERR_FILE_NOT_FOUND|does not belong|GL_INVALID|TypeError/.test(e.message)),[]);
 console.log('Event saved; existing media retained:',saved);

}finally{await driver?.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
