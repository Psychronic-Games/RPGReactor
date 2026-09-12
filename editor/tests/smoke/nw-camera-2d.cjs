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
const evidence = option('evidence') || '/tmp/rr-camera2d';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-camera2d-'));
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
        require('node:child_process').execFileSync('python3',[path.join(__dirname,'resize-tiles-fixture.py'),path.join(root,'template/Demo'),project,option('tile-size')||'16']);
        for(const file of ['reactor_3d.js','reactor_core.js','reactor_scenes.js','reactor_main.js','reactor_objects.js','reactor_sprites.js']) fs.copyFileSync(path.join(root,'runtime',file),path.join(project,'js',file));
        const tilesets=JSON.parse(fs.readFileSync(path.join(project,'data/Tilesets.json')));tilesets[2].flags[2816]=0;
        fs.writeFileSync(path.join(project,'data/Tilesets.json'),JSON.stringify(tilesets));
        for(const id of ['001','002']) {
            const file=path.join(project,'data/Map'+id+'.json'),map=JSON.parse(fs.readFileSync(file));
            map.width=map.height=80;map.parallaxName='';map.scrollType=0;map.data=new Array(80*80*6).fill(0);map.events=[null];
            map.data.fill(2816,0,80*80);
            for(let x=20;x<40;x++) map.data[80*80+25*80+x]=x%2?1025:1281;
            fs.writeFileSync(file,JSON.stringify(map));
        }
        const system=JSON.parse(fs.readFileSync(path.join(project,'data/System.json')));system.startX=system.startY=30;
        fs.writeFileSync(path.join(project,'data/System.json'),JSON.stringify(system));
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
        const checks=[];
        const check=(name,value,expected=true)=>{assert.deepEqual(value,expected,name);checks.push(name);console.log('PASS',name);};
        const pause=()=>driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,180);');
        const click=async(point,touch=false)=>{
            await driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:touch?'finger':'mouse',parameters:{pointerType:touch?'touch':'mouse'},actions:[
                {type:'pointerMove',duration:0,origin:'viewport',x:Math.round(point.x),y:Math.round(point.y)},
                {type:'pause',duration:80},{type:'pointerDown',button:0},{type:'pause',duration:100},{type:'pointerUp',button:0}]}]});
            await pause();
        };
        await driver.execute(`reactor.databaseEditorUI.openDatabase('system2');`);
        check('System 2 exposes camera defaults',await driver.execute(`return ['camera2DZoom','camera2DOffsetX','camera2DOffsetY'].map(key=>document.querySelector('[data-advanced-field="'+key+'"]').value);`),['1','0','0']);
        await driver.execute(`const input=document.querySelector('[data-advanced-field="camera2DZoom"]');input.value='20';input.dispatchEvent(new Event('change'));`);
        check('editor clamps camera zoom',await driver.execute(`return reactor.databaseManager.getSystem().advanced.camera2DZoom;`),8);
        await driver.execute(`for(const [key,value] of Object.entries({camera2DZoom:2,camera2DOffsetX:-32,camera2DOffsetY:48})) {const input=document.querySelector('[data-advanced-field="'+key+'"]');input.value=value;input.dispatchEvent(new Event('change'));}document.getElementById('database-apply-btn').click();`);
        await driver.waitForScript(`const fs=require('fs'),path=require('path');const s=JSON.parse(fs.readFileSync(path.join(reactor.projectController.currentProject.path,'data/System.json')));return s.advanced.camera2DZoom===2&&s.advanced.camera2DOffsetX===-32&&s.advanced.camera2DOffsetY===48;`);
        checks.push('camera settings save to the project');
        fs.writeFileSync(evidence+'-settings.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        await driver.sessionRequest('DELETE','');
        await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${project}`,`user-data-dir=${temp}/game-profile`,'no-first-run']}});
        await driver.waitForScript('return !!window.SceneManager?._scene && window.DataManager?.isDatabaseLoaded();',[],{timeout:90000});
        await driver.execute(`window.__cameraErrors=[];addEventListener('error',e=>__cameraErrors.push(String(e.error||e.message)));addEventListener('unhandledrejection',e=>__cameraErrors.push(String(e.reason)));ConfigManager.touchUI=true;DataManager.setupNewGame();SceneManager.goto(Scene_Map);`);
        const ready='return SceneManager._scene instanceof Scene_Map && SceneManager._scene.isStarted() && !SceneManager.isSceneChanging() && SceneManager._scene._fadeDuration===0;';
        await driver.waitForScript(ready,[],{timeout:60000});
        await driver.execute(`window.__destinations=[];const set=$gameTemp.setDestination;$gameTemp.setDestination=function(x,y){__destinations.push([x,y]);return set.call(this,x,y);};
            window.__cameraPoint=(x,y)=>{const s=SceneManager._scene._spriteset,p=s._baseSprite.toGlobal(new PIXI.Point(($gameMap.adjustX(x)+.5)*$gameMap.tileWidth(),($gameMap.adjustY(y)+.5)*$gameMap.tileHeight())),r=Graphics._canvas.getBoundingClientRect();return {x:r.left+p.x*r.width/Graphics.width,y:r.top+p.y*r.height/Graphics.height};};
            window.__cameraFraming=()=>{const p=SceneManager._scene._spriteset._baseSprite.toGlobal(new PIXI.Point(($gamePlayer.scrolledX()+.5)*$gameMap.tileWidth(),($gamePlayer.scrolledY()+.5)*$gameMap.tileHeight()));return [Math.round(p.x),Math.round(p.y)];};`);
        check('zoomed player framing matches X/Y offsets',await driver.execute('return __cameraFraming();'),[376,360]);
        check('map and weather zoom together',await driver.execute('const s=SceneManager._scene._spriteset;return [s._baseSprite.scale.x,s._weather.scale.x];'),[2,2]);
        check('pictures and timer keep screen scale',await driver.execute('const s=SceneManager._scene._spriteset;return [s._pictureContainer.toGlobal(new PIXI.Point(100,100)).x,s._timerSprite.toGlobal(new PIXI.Point(1,0)).x-s._timerSprite.toGlobal(new PIXI.Point(0,0)).x];'),[100,1]);
        for(const [name,x,y,touch] of [['mouse',33,31,false],['touch',31,29,true]]) {
            await driver.execute('__destinations.length=0;window.__pointerTrace=[];if(!window.__tracingPointer){window.__tracingPointer=true;for(const type of ["mousedown","mousemove","touchstart"])document.addEventListener(type,e=>__pointerTrace.push({type:e.type,x:e.clientX,y:e.clientY,pageX:e.pageX,pageY:e.pageY}),true);}');
            const target=await driver.execute('return __cameraPoint(arguments[0],arguments[1]);',[x,y]);
            await click(target,touch);
            if(JSON.stringify(await driver.execute('return __destinations[0];'))!==JSON.stringify([x,y])) console.log('Pointer failure',target,await driver.execute('return {events:__pointerTrace,dest:__destinations,touch:[TouchInput.x,TouchInput.y],rect:Graphics._canvas.getBoundingClientRect().toJSON(),display:[$gameMap._displayX,$gameMap._displayY]};'));
            check(name+' chooses the drawn tile',await driver.execute('return __destinations[0];'),[x,y]);
            await driver.waitForScript('return $gamePlayer.pos(arguments[0],arguments[1])&&!$gamePlayer.isMoving();',[x,y],{timeout:20000});
            checks.push(name+' navigation arrives');
            check(name+' movement preserves camera offset',await driver.execute('return __cameraFraming();'),[376,360]);
        }
        await driver.execute('$gameScreen.setZoom(200,150,1.5);');await pause();
        await driver.execute('__destinations.length=0;');
        await click(await driver.execute('return __cameraPoint(30,29);'));
        check('event zoom composes with camera picking',await driver.execute('return __destinations[0];'),[30,29]);
        await driver.waitForScript('return $gamePlayer.pos(30,29)&&!$gamePlayer.isMoving();',[],{timeout:20000});
        await driver.execute('$gameScreen.clearZoom();');await pause();
        for(const [x,y,label] of [[0,0,'top-left'],[79,79,'bottom-right']]) {
            await driver.execute('$gamePlayer.locate(arguments[0],arguments[1]);',[x,y]);await pause();
            const bounds=await driver.execute('return [$gameMap._displayX,$gameMap._displayY,$gameMap.width()-$gameMap.screenTileX(),$gameMap.height()-$gameMap.screenTileY()];');
            check(label+' map edge stays within map',label==='top-left'?bounds[0]===0&&bounds[1]===0:Math.abs(bounds[0]-bounds[2])<1e-8&&Math.abs(bounds[1]-bounds[3])<1e-8);
        }
        await driver.execute('$gamePlayer.locate(30,30);$gameMap.setDisplayPos(12,14);');await pause();
        const buttonPoint=expr=>driver.execute(`const b=${expr},p=b.toGlobal(new PIXI.Point(b.width/2,b.height/2)),r=Graphics._canvas.getBoundingClientRect();return {x:r.left+p.x*r.width/Graphics.width,y:r.top+p.y*r.height/Graphics.height};`);
        await click(await buttonPoint('SceneManager._scene._menuButton'));
        await driver.waitForScript('return !(SceneManager._scene instanceof Scene_Map) && !SceneManager.isSceneChanging();');
        checks.push('menu button works with camera enabled');await pause();
        await driver.sessionRequest('POST','/actions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value:'\uE00C'},{type:'pause',duration:120},{type:'keyUp',value:'\uE00C'}]}]});
        await driver.waitForScript(ready);
        check('menu return preserves scripted map scroll',await driver.execute('return [$gameMap._displayX,$gameMap._displayY];'),[12,14]);
        await driver.execute('const saved=JsonEx.stringify(DataManager.makeSaveContents());DataManager.extractSaveContents(JsonEx.parse(saved));SceneManager.goto(Scene_Map);');
        await driver.waitForScript(ready);
        check('save round trip preserves framing and scroll',await driver.execute('return [$gameMap.reactorCameraZoom(),$gameMap._displayX,$gameMap._displayY];'),[2,12,14]);
        await driver.execute(`$gamePlayer.locate(30,30);$dataSystem.advanced.camera2DZoom=4;$dataSystem.advanced.camera2DOffsetX=20;$dataSystem.advanced.camera2DOffsetY=-24;`);await pause();
        check('changed defaults reframe without movement',await driver.execute('return __cameraFraming();'),[428,288]);
        check('3D maps ignore 2D framing settings',await driver.execute(`const note=$dataMap.note;$dataMap.note='<3d>';const result=[$gameMap.reactorCameraZoom(),$gameMap.reactorCameraOffset('y')];$dataMap.note=note;return result;`),[1,0]);
        await driver.execute('$gamePlayer.reserveTransfer(2,30,30,2,0);');
        await driver.waitForScript('return $gameMap.mapId()===2 && SceneManager._scene instanceof Scene_Map && SceneManager._scene.isStarted()&&!SceneManager.isSceneChanging()&&SceneManager._scene._fadeDuration===0;',[],{timeout:60000});
        check('map transfer retains configured framing',await driver.execute('return __cameraFraming();'),[428,288]);
        await driver.execute('$dataMap.scrollType=3;$gamePlayer.locate(79,79);');await pause();
        check('loop seams map visible coordinates back to the wrapped tile',await driver.execute(`const p=SceneManager._scene._spriteset._baseSprite.toGlobal(new PIXI.Point(($gameMap.adjustX(0)+.5)*$gameMap.tileWidth(),($gameMap.adjustY(0)+.5)*$gameMap.tileHeight()));return [$gameMap.canvasToMapX(p.x),$gameMap.canvasToMapY(p.y)];`),[0,0]);
        await driver.execute('$dataMap.scrollType=0;$gamePlayer.locate(30,30);');await pause();
        fs.writeFileSync(evidence+'-map.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        check('runtime has no interaction errors',await driver.execute('return __cameraErrors;'),[]);
        check('runtime has no asset loading error',await driver.execute('return !Graphics._errorPrinter?.textContent?.includes("Failed to load");'));
        check('map atlas uses its normal renderer',await driver.execute('return $reactorTilemapStats.fallbacks;'),0);
        fs.writeFileSync(evidence+'-result.json',JSON.stringify({checks},null,2));
        console.log(JSON.stringify({checks},null,2));
    } catch(error) {
        try {console.log(await driver.execute('return {scene:SceneManager?._scene?.constructor.name,errors:window.__cameraErrors,phase:SceneManager?._scene?._transitionPhase,frame:SceneManager?._scene?._transitionFrame,started:SceneManager?._scene?._started,fade:SceneManager?._scene?._fadeDuration,changing:SceneManager.isSceneChanging(),input:Input._currentState,loading:Graphics._errorPrinter?.textContent};'));} catch(_) {}
        try { fs.writeFileSync(evidence+'-failure.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64')); } catch(_) {}
        throw error;
    } finally {await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
