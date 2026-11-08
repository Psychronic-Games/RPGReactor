// Perspective clicking, grounded destination marker and arrival with Demo plugins.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),source=path.join(root,'template/Demo');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-click-navigation-')),project=path.join(temp,'Demo');
const driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));
(async()=>{try {
    fs.mkdirSync(project);
    for(const name of ['index.html','package.json','project.rpgreactor'])fs.copyFileSync(path.join(source,name),path.join(project,name));
    for(const name of ['data','js','icon'])fs.cpSync(path.join(source,name),path.join(project,name),{recursive:true});
    for(const name of ['img','audio','fonts','3d','effects','css'])if(fs.existsSync(path.join(source,name)))fs.symlinkSync(path.join(source,name),path.join(project,name));
    const map=JSON.parse(fs.readFileSync(path.join(project,'data/Map001.json')));
    map.events=[null]; // Isolate navigation from the Demo's opening cutscene.
    fs.writeFileSync(path.join(project,'data/Map001.json'),JSON.stringify(map));
    fs.writeFileSync(path.join(project,'data/Map002.json'),JSON.stringify({...map,note:'',reactor3d:{mode:'2d'}}));
    await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${project}`,`user-data-dir=${path.join(temp,'profile')}`,'no-first-run']}});
    await driver.setScriptTimeout(60000);
    await driver.waitForScript('return window.SceneManager?._scene && window.$dataSystem && !SceneManager.isSceneChanging() && (SceneManager._scene instanceof Scene_Title || SceneManager._scene._role === "title");',[],{timeout:90000});
    await driver.execute('nw.Window.get().focus(); DataManager.setupNewGame(); SceneManager.goto(Scene_Map);');
    await driver.waitForScript('return SceneManager._scene instanceof Scene_Map && SceneManager._scene.isStarted() && SceneManager._scene._fadeDuration===0 && !!SceneManager._scene._spriteset?._reactor3d && $gamePlayer.canMove() && !SceneManager._scene.isBusy();',[],{timeout:60000});
    await driver.executeAsync(`const done=arguments[arguments.length-1];$gameMap.setReactorCamera3D({mode:'firstPerson',pitch:20,yaw:0},0,false);Object.assign(Reactor3D.Camera.look,{yaw:0,pitch:20,lastX:null,lastY:null});const start=Graphics.frameCount;setTimeout(function settle(){Graphics.frameCount-start>=5?done():setTimeout(settle,20);},150);`);
    const target=await driver.execute(`
        const camera=SceneManager._scene._spriteset._reactor3d.camera,canvas=Graphics._canvas.getBoundingClientRect();
        const queue=[{x:$gamePlayer.x,y:$gamePlayer.y,d:0}],seen=new Set();
        for(let i=0;i<queue.length;i++){
            const tile=queue[i],key=tile.x+','+tile.y;if(seen.has(key))continue;seen.add(key);
            if(tile.d>=3){
                const p=new THREE.Vector3(tile.x+.5,Reactor3D.elevationAt($dataMap,tile.x,tile.y),tile.y+.5).project(camera);
                if(Math.abs(p.x)<.8 && Math.abs(p.y)<.8)return {tile,x:Math.round(canvas.left+(p.x+1)/2*canvas.width),y:Math.round(canvas.top+(1-p.y)/2*canvas.height)};
            }
            if(tile.d<8)for(const dir of [8,4,6,2])if($gamePlayer.canPass(tile.x,tile.y,dir))queue.push({x:$gameMap.roundXWithDirection(tile.x,dir),y:$gameMap.roundYWithDirection(tile.y,dir),d:tile.d+1});
        }throw Error('No visible walkable destination');
    `);
    await driver.execute('window.__destinations=[];const original=$gameTemp.setDestination;$gameTemp.setDestination=function(x,y){__destinations.push([x,y]);return original.call(this,x,y);};');
    await driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,x:target.x,y:target.y},{type:'pointerDown',button:0},{type:'pause',duration:60},{type:'pointerUp',button:0}]}]});
    const marker=await driver.waitForScript(`const scene=SceneManager._scene,mesh=scene._spriteset._reactor3d.scene._destinationMarker;
        return mesh?.visible && {rotation:mesh.rotation.x,position:mesh.position.toArray(),flat:scene._spriteset._destinationSprite.visible,goal:[$gameTemp.destinationX(),$gameTemp.destinationY()]};`,[],{timeout:5000});
    assert.equal(marker.rotation,-Math.PI/2);assert.equal(marker.flat,false);assert.deepEqual(marker.goal,[target.tile.x,target.tile.y]);
    fs.writeFileSync('/tmp/rr-ground-destination.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
    await driver.waitForScript('return $gamePlayer.x===arguments[0] && $gamePlayer.y===arguments[1] && !$gamePlayer.isMoving();',[target.tile.x,target.tile.y],{timeout:15000});
    await driver.waitForScript('return !$gameTemp.isDestinationValid();',[],{timeout:5000});
    console.log('3D ground click and exact-tile arrival passed:',target.tile,marker);
    const iso=await driver.executeAsync(`
        const done=arguments[arguments.length-1];$gameMap.setReactorCamera3D({mode:'isometric'},0,false);document.exitPointerLock?.();
        setTimeout(()=>{
            const x=$gamePlayer.x,y=$gamePlayer.y;document.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowUp',key:'ArrowUp',keyCode:38,bubbles:true}));
            setTimeout(()=>{document.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowUp',key:'ArrowUp',keyCode:38,bubbles:true}));setTimeout(()=>done({dx:$gamePlayer.x-x,dy:$gamePlayer.y-y}),350);},60);
        },200);
    `);assert.ok(iso.dx>0 && iso.dy<0,'Isometric Up follows the screen: '+JSON.stringify(iso));console.log('Isometric keyboard direction passed',iso);
    await driver.execute(`window.__markerDisposed=0;const mesh=SceneManager._scene._spriteset._reactor3d.scene._destinationMarker;mesh.geometry.addEventListener('dispose',()=>window.__markerDisposed++);mesh.material.addEventListener('dispose',()=>window.__markerDisposed++);$gamePlayer.reserveTransfer(2,$gamePlayer.x,$gamePlayer.y,2,0);`);
    await driver.waitForScript('return $gameMap.mapId()===2 && SceneManager._scene instanceof Scene_Map && SceneManager._scene.isActive() && !SceneManager._scene._spriteset?._reactor3d && !$gamePlayer.isTransferring() && !SceneManager._scene.isBusy() && SceneManager._scene._fadeDuration===0;',[],{timeout:20000});
    assert.equal(await driver.execute('return window.__markerDisposed;'),2);
    await driver.execute('$gamePlayer.setMoveSpeed(3);$gameTemp.setDestination($gamePlayer.x,$gamePlayer.y-6);');
    await driver.waitForScript('return SceneManager._scene._spriteset._destinationSprite.visible;',[],{timeout:5000});
    console.log('2D destination fallback and 3D marker disposal passed');
} catch(e){try{fs.writeFileSync('/tmp/rr-path-failure.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));console.log(await driver.execute('return {scene:SceneManager?._scene?.constructor.name,error:document.body.innerText,focus:document.hasFocus(),view:!!SceneManager._scene._spriteset?._reactor3d,canMove:$gamePlayer.canMove(),busy:SceneManager._scene.isBusy(),fade:SceneManager._scene._fadeDuration,clicks:window.__destinations,touch:[TouchInput.x,TouchInput.y,TouchInput.isTriggered(),TouchInput.isPressed()],player:[$gamePlayer?.x,$gamePlayer?.y],goal:[$gameTemp?.destinationX(),$gameTemp?.destinationY()]};'));}catch(_){}throw e;
} finally {await driver.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
