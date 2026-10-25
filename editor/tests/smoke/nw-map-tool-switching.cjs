const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),source=path.join(root,'template/Demo'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-ux-locale-')),project=path.join(temp,'Demo');let driver;
(async()=>{try{
 fs.mkdirSync(project);for(const n of ['data','js','icon'])fs.cpSync(path.join(source,n),path.join(project,n),{recursive:true});for(const n of ['img','3d','effects','audio','fonts','movies','css'])if(fs.existsSync(path.join(source,n)))fs.symlinkSync(path.join(source,n),path.join(project,n));for(const n of ['index.html','package.json','project.rpgreactor'])fs.copyFileSync(path.join(source,n),path.join(project,n));
 driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${path.join(root,'editor')}`,`user-data-dir=${temp}/profile`,'no-first-run']}});await driver.setScriptTimeout(90000);
 await driver.waitForScript('return !!window.reactor?.projectController && getComputedStyle(document.getElementById("splash-screen")).display==="none";',[],{timeout:90000});
 assert.equal(await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{const pc=reactor.projectController;pc.currentProject=await reactor.projectManager.loadProject(arguments[0]);pc.projectLoaded=true;nw.Window.get().resizeTo(1920,1080);await reactor.uiManager.showEditorUI();await pc.populateProjectUI();await reactor.applyMap3DViewPreference(true);return true;})().then(done,e=>done(String(e.stack)));`,[project]),true);
 await driver.waitForScript('return !!reactor.projectController.mapEditor3D?.mapScene;',[],{timeout:90000});






 // The browser's ResizeObserver notice (a layout change seen the frame after) is not a script error.
 const results=[];await driver.execute(`window.__toolErrors=[];addEventListener('error',e=>{if(!/^ResizeObserver loop/.test(e.message))__toolErrors.push(String(e.error?.stack||e.message));});
 window.__toolActions={tiles:()=>document.querySelector('.tileset-layer-tab[data-layer=A]').click(),region:()=>document.querySelector('.tileset-layer-tab[data-layer=R]').click(),objects:()=>document.querySelector('.tileset-layer-tab[data-layer=O]').click(),models:()=>{if(!reactor.buildHotbar.visible)document.querySelector('.tool-button[data-action="build-tool"]').click();document.querySelector('.rr-build-group[data-group=models]').click();},events:()=>document.getElementById('toolbar-event-manager-btn').click(),media:()=>document.querySelector('.html-menu-option[data-action="media-surfaces"]').click(),lighting:()=>document.querySelector('.html-menu-option[data-action="lighting-tool"]').click(),pencil:()=>reactor.uiManager.setDrawTool('pencil'),rectangle:()=>reactor.uiManager.setDrawTool('rectangle'),fill:()=>reactor.uiManager.setDrawTool('fill'),eraser:()=>document.querySelector('.tool-button[data-action="eraser"]').click(),shadow:()=>document.querySelector('.tool-button[data-action="shadow-pen"]').click()};
 window.__toolState=()=>({owner:reactor.mapTool,events:reactor.eventManager.eventMode,models:reactor.modelPropsManager.active,media:!!reactor.mediaSurfaceManager.panel,lighting:reactor.lightingManager.active,painting:reactor.mapEditor.enabled,layer:reactor.tilesetPaletteViewer.currentLayer,draw:[...document.querySelectorAll('.tool-draw-mode.active')].map(e=>e.dataset.tool),tabs:[...document.querySelectorAll('.tileset-layer-tab.active')].map(e=>e.dataset.layer),mediaSelected:!!reactor.mediaSurfaceManager.panel,eventSelected:document.getElementById('toolbar-event-manager-btn').classList.contains('active'),lightSelected:!!reactor.lightingManager.active,placement:!!reactor.mediaSurfaceManager.cancelPlacement,propsListeners:reactor.modelPropsManager._listeners.length,bar:!!reactor.buildHotbar.visible,barGroup:reactor.buildHotbar.visible?document.querySelector('.rr-build-group[aria-checked=true]')?.dataset.group:null,lightListeners:reactor.lightingManager._listeners?.length||0});`);
 const names=['tiles','region','objects','models','events','media','lighting','pencil','rectangle','fill','eraser','shadow'];
 for(const mode of [false,true]){
  assert.equal(await driver.executeAsync(`const done=arguments[arguments.length-1];reactor.applyMap3DViewPreference(arguments[0]).then(()=>done(true),e=>done(String(e.stack)));`,[mode]),true);
  for(const from of names)for(const to of names){if(from===to)continue;
   const row=await driver.execute(`reactor.mapEditor.setShadowPenMode(false);reactor.mapEditor.setEraserMode(false);__toolActions.tiles();__toolActions[arguments[0]]();if(arguments[0]==='media')reactor.mediaSurfaceManager.place();__toolActions[arguments[1]]();return __toolState();`,[from,to]);
   const owner=['events','models','media','lighting'].includes(to)?to:'paint';
   const label=(mode?'3D':'2D')+' '+from+' → '+to;
   for(const name of ['events','models','media','lighting'])assert.equal(row[name],owner===name,label+' active '+name+' '+JSON.stringify(row));
   assert.equal(row.owner,owner,label+' owner');assert.equal(row.painting,owner==='paint',label+' painting');
   assert.equal(row.mediaSelected,owner==='media',label+' media panel');assert.equal(row.eventSelected,owner==='events',label+' event button');assert.equal(row.lightSelected,owner==='lighting',label+' lighting on');
   if(owner!=='paint')assert.deepEqual(row.draw,[],label+' draw buttons');
   if(owner!=='paint')assert.deepEqual(row.tabs,[],label+' palette highlight');
   // The models tool is the Build bar's Models group.
   if(owner==='models')assert.deepEqual([row.bar,row.barGroup],[true,'models'],label+' Build bar models');
   if(owner!=='models')assert.equal(row.propsListeners,0,label+' stale model handlers');
   assert.equal(row.placement,false,label+' placement handler');results.push({mode:mode?'3D':'2D',from,to,...row});
  }
 }
 // Toggling a panel off restores the prior palette context. Over the Build bar's Models group, Lighting and
 // Media Surfaces open in the bar and give the map back to it; Events puts the bar away.
 for(const context of ['A','R','O','models'])for(const tool of ['events','media','lighting']){
  const row=await driver.execute(`__toolActions.tiles();if(arguments[0]==='models')__toolActions.models();else reactor.tilesetPaletteViewer.selectLayer(arguments[0]);__toolActions[arguments[1]]();__toolActions[arguments[1]]();return __toolState();`,[context,tool]);
  const back=context==='models'&&tool!=='events'?'pieces':'paint';
  assert.equal(row.owner,back,context+' '+tool+' toggle off '+JSON.stringify(row));assert.equal(row.bar,back==='pieces',context+' '+tool+' Build bar');assert.equal(row.media,false);assert.equal(row.events,false);assert.equal(row.lighting,false);
 }
 // Clicking the still-visible palette itself also claims painting.
 for(const [layer,method] of [['A',"reactor.tilesetPaletteViewer.updateTileSelection({x:0,y:0},{x:0,y:0})"],['R',"reactor.projectController.getRegionManager().selectRegion(1)"],['O',"reactor.projectController.getObject3DManager().selectObject(1)"]]) {
  const row=await driver.execute(`reactor.tilesetPaletteViewer.selectLayer(arguments[0]);__toolActions.media();reactor.mediaSurfaceManager.place();${method};return __toolState();`,[layer]);assert.equal(row.owner,'paint');assert.equal(row.placement,false);assert.equal(row.painting,true);assert.equal(row.media,false);
 }
 // Let asynchronous setup settle across renderer switches and actual map reloads.
 for(const tool of ['tiles','models','events','media','lighting']) {
  await driver.execute(`__toolActions.tiles();__toolActions[arguments[0]]();if(arguments[0]==='media')reactor.mediaSurfaceManager.place();`,[tool]);
  for(const enabled of [false,true]) {
   const row=await driver.executeAsync(`const done=arguments[arguments.length-1];reactor.applyMap3DViewPreference(arguments[0]).then(()=>setTimeout(()=>done(__toolState()),100));`,[enabled]);assert.equal(row.owner,tool==='tiles'?'paint':tool,tool+' renderer change');assert.equal(row.painting,tool==='tiles');assert.equal(row.placement,false);
  }
  const row=await driver.executeAsync(`const done=arguments[arguments.length-1],pc=reactor.projectController;pc.loadMap(pc.tilemapManager.currentMap.id,{forceReload:true,skipDirtyCheck:true}).then(()=>setTimeout(()=>done(__toolState()),200),e=>done({error:String(e.stack)}));`);
  const owner=tool==='tiles'||tool==='media'?'paint':tool;assert.equal(row.owner,owner,tool+' map reload '+JSON.stringify(row));assert.equal(row.painting,owner==='paint');
 }
 const errors=await driver.execute('return __toolErrors;');assert.deepEqual(errors,[]);
 fs.writeFileSync('/tmp/rr-map-tool-matrix.json',JSON.stringify(results,null,2));console.log('PASS',results.length,'ordered tool changes in 2D/3D plus 12 return-context toggles, 3 direct palette selections, and 15 renderer/map lifecycle checks');
}finally{await driver?.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
