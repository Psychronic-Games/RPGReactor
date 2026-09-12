#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..');
const sdkOption = process.argv.find(argument => argument.startsWith('--nw-root='));
const sdkRoot = path.resolve(sdkOption?.slice('--nw-root='.length) || process.env.NWJS_SDK_ROOT || path.join(root, 'nwjs-linux'));
const option = name => process.argv.find(argument => argument.startsWith('--' + name + '='))?.split('=').slice(1).join('=');
const appRoot = path.resolve(option('app-root') || path.join(root, 'editor'));
const iconSize = Number(option('icon-size') || 0);
const faceSize = Number(option('face-size') || 32);
const evidence = option('evidence') || '/tmp/rr-small-tiles-' + (option('tile-size') || '64');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-small-tiles-'));
const project = path.join(temp, 'Demo');
const driver = new WebDriverClient(path.join(sdkRoot, 'chromedriver'));

(async () => {
    try {
        fs.cpSync(path.join(root, 'template/Demo'), project, { recursive: true, dereference: true });
        fs.rmSync(path.join(project, '.rpgreactor.lock'), { force: true });
        // Two flat maps sharing a tileset exercise map changes without depending on 3D assets.
        const map = JSON.parse(fs.readFileSync(path.join(project, 'data/Map001.json'), 'utf8'));
        map.width=map.height=25;map.data=new Array(25*25*6).fill(0);
        map.note = ''; map.events = [null]; delete map.reactor3d;
        for (const id of ['001', '002']) {
            fs.writeFileSync(path.join(project, `data/Map${id}.json`), JSON.stringify(map));
            fs.rmSync(path.join(project, `data/Map${id}.r3d.json`), { force: true });
        }
        require('node:child_process').execFileSync('python3',[path.join(__dirname,'resize-tiles-fixture.py'),path.join(root,'template/Demo'),project,option('tile-size')||'64',String(faceSize),String(iconSize)]);
        for(const file of ['reactor_3d.js','reactor_core.js','reactor_scenes.js','reactor_main.js']) fs.copyFileSync(path.join(root,'runtime',file),path.join(project,'js',file));
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': {
            args: [`nwapp=${appRoot}`, `user-data-dir=${temp}/profile`, 'no-first-run']
        } });
        if (option('size')) {
            const [width, height] = option('size').split('x').map(Number);
            await driver.sessionRequest('POST', '/window/rect', { width, height });
        }
        await driver.setScriptTimeout(120000);
        await driver.waitForScript('return !!window.reactor?.databaseEditorUI && getComputedStyle(document.getElementById("splash-screen")).display === "none";', [], { timeout: 90000 });
        const opened = await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{
            window.__interactionErrors=[];addEventListener('error',e=>__interactionErrors.push(String(e.error||e.message)));
            addEventListener('unhandledrejection',e=>__interactionErrors.push(String(e.reason)));
            const pc=reactor.projectController,loaded=await pc.projectManager.loadProject(arguments[0]);
            if(!loaded||!pc.acquireProjectLock(loaded.path))throw new Error('Could not open disposable project');
            pc.currentProject=loaded;pc.lastLoadedProjectPath=null;pc.rememberMap3DView(1,false);pc.rememberMap3DView(2,false);
            await pc.uiManager.showEditorUI();await pc.populateProjectUI();
            await pc.loadMap(1,{skipDirtyCheck:true});
            reactor.databaseEditorUI.setCurrentProject(loaded);return true;
        })().then(done,e=>done({error:String(e.stack)}));`, [project]);
        assert.equal(opened, true, JSON.stringify(opened));
        const size=Number(option('tile-size')||64),checks=[];
        const check=(name,actual,expected=true)=>{assert.deepEqual(actual,expected,name);checks.push(name);};
        const pause=()=>driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,150);');
        check('editor uses requested tile size',await driver.execute('return reactor.tilemapManager.TILE_SIZE;'),size);
        await driver.execute(`reactor.databaseEditorUI.openDatabase('tilesets');reactor.databaseEditorUI._activeDatabaseList.selectIds([2],2);`);
        await driver.waitForScript('return !!reactor.databaseEditorUI.tilesetEditor.tilesetEditor && !!document.querySelector("#compact-tileset-canvas-container canvas");');
        await driver.execute('window.__tiles=reactor.databaseEditorUI.tilesetEditor.tilesetEditor;__tiles.switchTab("F");');
        await driver.waitForScript('return window.__tiles?.currentCanvas?.imageIndex===9;');
        const actual=await driver.execute(`const c=__tiles.currentCanvas.canvas;return {width:c.width,height:c.height,zoom:parseFloat(c.style.width)/c.width};`);
        check('F sheet split has correct pixel dimensions',[actual.width,actual.height],[8*size,32*size]);
        check('small sheets open enlarged',actual.zoom,Math.max(1,32/size));
        await driver.execute(`const z=document.getElementById('tileset-preview-zoom');z.value='4';z.dispatchEvent(new Event('change'));__tiles.setFlagEditMode(null,{refresh:false});__tiles.currentEditMode='passability';__tiles.currentTileset.flags[1025]=0;`);
        const point=await driver.execute(`const c=__tiles.currentCanvas.canvas;c.scrollIntoView({block:'start',inline:'start'});const r=c.getBoundingClientRect();return {x:r.left+1.5*arguments[0]*4,y:r.top+0.5*arguments[0]*4};`,[size]);
        await driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,origin:'viewport',x:Math.round(point.x),y:Math.round(point.y)},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});
        check('zoomed click changes F tile 1',await driver.execute('return __tiles.currentTileset.flags[1025]&15;'),15);
        check('zoomed click keeps neighbor unchanged',await driver.execute('return __tiles.selectedTile.x;'),1);
        fs.writeFileSync(evidence+'-tileset.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        await driver.execute('document.getElementById("database-cancel-btn").click();reactor.databaseEditorUI.openDatabase("actors");reactor.databaseEditorUI._activeDatabaseList.selectIds([1],1);');
        await pause();
        check('actor preview samples face 5',await driver.execute(`const b=[...document.querySelectorAll('.graphic-preview-box')].find(b=>b.querySelector('.graphic-preview-label')?.textContent==='Face Graphic');return Array.from(b.querySelector('canvas').getContext('2d').getImageData(60,60,1,1).data);`),[150,130,150,255]);
        const clickElement = async selector => {
            const point = await driver.execute('const e=document.querySelector(arguments[0]);e.scrollIntoView({block:"center"});const r=e.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};', [selector]);
            await driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,origin:'viewport',...point},{type:'pause',duration:80},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});
            await pause();
        };
        await driver.execute('reactor.databaseEditorUI.selectFaceImage(reactor.databaseManager.getActor(1));');
        await driver.waitForScript(`return document.querySelectorAll('#image-picker-modal [title^="Index "]').length===8;`);
        await clickElement('#image-picker-modal [title="Index 7"]');
        await clickElement('#image-picker-select-btn');
        check('face picker clicks select the last cell',await driver.execute('return reactor.databaseManager.getActor(1).faceIndex;'),7);
        await driver.execute(`window.__message=new MessageCommandEditor(reactor.databaseManager,reactor.projectController);__message.show({code:101,parameters:['AuditFaces',5,0,2,'']},()=>{});__message.browseFaces();`);
        await driver.waitForScript('return document.querySelectorAll(".face-option").length===8;');
        await clickElement('.face-option[data-index="7"]');
        check('Show Text face picker selects the last cell',await driver.execute('return __message.faceIndex;'),7);
        await driver.waitForScript('return document.querySelector(".face-preview-canvas").getContext("2d").getImageData(140,140,1,1).data[0]===210;');
        check('Show Text preview fills its display with the chosen face',await driver.execute('return Array.from(document.querySelector(".face-preview-canvas").getContext("2d").getImageData(140,140,1,1).data);'),[210,80,190,255]);
        await driver.execute('__message.close();__message.modal.remove();');
        check('configured faces expose all eight cells',await driver.execute('return RRFaceSheet.metrics(arguments[0]*2).count;',[faceSize]),8);
        check('configured face source index 5',await driver.execute('return RRFaceSheet.sourceRect(5,arguments[0]*2);',[faceSize]),{x:faceSize,y:faceSize,width:faceSize,height:faceSize});
        await driver.execute(`document.getElementById('database-cancel-btn').click();reactor.databaseEditorUI.openDatabase('system2');`);
        check('System 2 selects the configured face size',await driver.execute(`return Number(document.querySelector('.sys2-face-size:checked').value);`),faceSize);
        check('System 2 offers 288px faces',await driver.execute(`return !!document.querySelector('.sys2-face-size[value="288"]');`));
        if(iconSize) {
            check('System 2 selects the configured icon size',await driver.execute(`return Number(document.querySelector('.sys2-icon-size:checked').value);`),iconSize);
            await driver.execute(`document.getElementById('database-cancel-btn').click();reactor.databaseEditorUI.openDatabase('items');reactor.databaseEditorUI._activeDatabaseList.selectIds([1],1);`);
            await driver.waitForScript(`const c=document.querySelector('canvas.icon-preview');return c&&c.getContext('2d').getImageData(16,16,1,1).data[0]===217;`);
            checks.push('item preview samples the configured icon cell');
            await driver.execute(`reactor.databaseManager.getItem(1).iconIndex=0;reactor.databaseEditorUI.selectIcon(reactor.databaseManager.getItem(1),'items');`);
            await driver.waitForScript(`const c=document.querySelector('.rr-icon-picker-overlay canvas');return c&&c.width===1024&&c.height===128;`);
            const p=await driver.execute(`const c=document.querySelector('.rr-icon-picker-overlay canvas'),r=c.getBoundingClientRect();return {x:Math.round(r.left+c.clientLeft+c.clientWidth*15.5/16),y:Math.round(r.top+c.clientTop+c.clientHeight*.75)};`);
            await driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,origin:'viewport',...p},{type:'pause',duration:80},{type:'pointerDown',button:0},{type:'pointerUp',button:0}]}]});
            await driver.execute(`document.querySelector('.rr-icon-picker-overlay button:last-child').click();`);
            check('real icon picker click selects the last cell',await driver.execute('return reactor.databaseManager.getItem(1).iconIndex;'),31);
            fs.writeFileSync(evidence+'-icons.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        }
        await driver.execute(`document.getElementById('database-cancel-btn').click();window.__char=new CharacterGraphicPicker(reactor.projectController);__char.show('$AuditTiny',0,1,2,()=>{});`);
        await driver.waitForScript('return !!document.querySelector(".character-preview-zoom");');
        check('8px sprite preview starts at 64px',await driver.execute('return document.querySelector("#char-preview-area canvas").width;'),64);
        await driver.execute(`const z=document.querySelector('.character-preview-zoom');z.value='4';z.dispatchEvent(new Event('change'));`);
        check('character zoom adjusts displayed cell',await driver.execute('return parseFloat(document.querySelector("#char-preview-area canvas").style.width);'),32);
        await driver.execute('document.getElementById("char-picker-close").click();');
        await driver.execute(`reactor.databaseEditorUI.openDatabase('userInterfaces');reactor.databaseEditorUI._activeDatabaseList.selectIds([1],1);`);
        await driver.waitForScript('return !!document.querySelector(".rr-ui-zoom");');
        await driver.execute(`const z=document.querySelector('.rr-ui-zoom');z.value='2';z.dispatchEvent(new Event('change'));`);
        check('interface zoom displays twice the logical width',await driver.execute('const c=document.querySelector(".rr-ui-canvas");return parseFloat(c.style.width)/c.width;'),2);
        check('interface zoom keeps canvas scrollable',await driver.execute('return getComputedStyle(document.querySelector(".rr-ui-canvas-host")).overflowX;'),'auto');
        check('editor has no interaction errors',await driver.execute('return __interactionErrors;'),[]);
        fs.writeFileSync(evidence+'-editor.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        // The disposable project has no plugins; exercise canonical runtime startup and atlas.
        await driver.sessionRequest('DELETE','');
        await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${project}`,`user-data-dir=${temp}/game-profile`,'no-first-run']}});
        await driver.waitForScript('return !!window.SceneManager?._scene && window.DataManager?.isDatabaseLoaded();',[],{timeout:90000});
        await pause();
        const runtime=await driver.execute('return {width:innerWidth,height:innerHeight,tile:$dataSystem.tileSize,three:Reactor3D.currentTileSize(),face:ImageManager.faceWidth,ratio:Graphics.canvasPixelRatio(),filter:Graphics.upscaleFilterInUse()};');
        check('game window honors 816x624',[runtime.width,runtime.height],[816,624]);
        check('runtime and 3D use requested tile size',[runtime.tile,runtime.three],[size,size]);
        check('runtime honors face size',runtime.face,faceSize);
        if(iconSize){
            check('runtime initializes configured icon cells',await driver.execute('return [ImageManager.iconWidth,ImageManager.iconHeight];'),[iconSize,iconSize]);
            await driver.waitForScript(`return ImageManager.loadSystem('IconSet').isReady();`);
            check('runtime draws the final icon cell',await driver.execute(`const s=ImageManager.iconWidth,w=new Window_Base(new Rectangle(0,0,s+24,s+24));w.drawIcon(31,0,0);const p=Array.from(w.contents.context.getImageData(s/2,s/2,1,1).data);w.destroy();return p;`),[217,100,216,255]);
        }
        await driver.waitForScript(`return ImageManager.loadFace('AuditFaces').isReady();`);
        check('runtime draws the correct face cell',await driver.execute(`const size=ImageManager.faceWidth,w=new Window_Base(new Rectangle(0,0,size+24,size+24));w.drawFace('AuditFaces',5,0,0);const pixel=Array.from(w.contents.context.getImageData(size/2,size/2,1,1).data);w.destroy();return pixel;`),[150,130,150,255]);
        check('pixelated rendering uses native resolution and nearest',[runtime.ratio,runtime.filter],[1,'nearest']);
        await driver.execute('DataManager.setupNewGame();SceneManager.goto(Scene_Map);');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_Map && SceneManager._scene._spriteset?._tilemap && SceneManager._scene.isStarted() && !SceneManager.isSceneChanging();',[],{timeout:60000});
        await driver.waitForScript('return SceneManager._scene._fadeDuration===0;');
        check('map renderer uses correct cells',await driver.execute('return SceneManager._scene._spriteset._tilemap.tileWidth;'),size);
        const stats=await driver.execute('return $reactorTilemapStats;');
        check('real map atlas has no fallback',stats.fallbacks,0);
        check('real map submits tile geometry',stats.meshBuilds>0);
        check('no runtime loading error',await driver.execute('return !Graphics._errorPrinter?.textContent?.includes("Failed to load");'));
        fs.writeFileSync(evidence+'-runtime.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        await driver.execute('$dataSystem.advanced.screenWidth=384;$dataSystem.advanced.screenHeight=288;$dataSystem.advanced.screenScale=2;new Scene_Boot().resizeScreen();');
        await driver.waitForScript('return innerWidth===768 && innerHeight===576;');
        checks.push('screen scale 2 opens a 384x288 game at 768x576');
        const result={size,checks,runtime,stats};fs.writeFileSync(evidence+'-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
    } finally {await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
