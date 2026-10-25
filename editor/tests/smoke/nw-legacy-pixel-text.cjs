#!/usr/bin/env node
'use strict';
// Actual NW canvas/font/window regression; imports only into a disposable directory.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..');const source=process.env.RR_LEGACY_SOURCE||path.join(root,'template/Sunset over Imdahl');
const evidence=path.resolve(process.env.RR_LEGACY_EVIDENCE||path.join(root,'scratchpad/rm2000-text/final'));fs.mkdirSync(evidence,{recursive:true});
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-legacy-text-smoke-'));const project=path.join(temp,'project');
const driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));
(async()=>{try{
    await require('../../src/legacy/LegacyImporter.js').importProject(source,project,{});
    await driver.start();await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${project}`,`user-data-dir=${temp}/profile`,'no-first-run','mute-audio']}});
    await driver.setScriptTimeout(60000);await driver.waitForScript('return !!window.SceneManager?._scene && window.DataManager?.isDatabaseLoaded() && !!window.$gameSystem;',[],{timeout:90000});
    await driver.execute(`window.__legacyErrors=[];addEventListener('error',e=>__legacyErrors.push(e.message));addEventListener('unhandledrejection',e=>__legacyErrors.push(String(e.reason)));nw.Window.get().resizeTo(1280,1000);Graphics._stretchEnabled=true;Graphics._updateAllElements();`);
    const report=await driver.executeAsync(`const done=arguments[arguments.length-1];(async()=>{
        const sample='Sunset over Imdahl. New Game Continue';const results=[];
        const partial=b=>{const p=b.context.getImageData(0,0,b.width,b.height).data;let soft=0,solid=0;for(let i=3;i<p.length;i+=4){if(p[i]>0&&p[i]<255)soft++;if(p[i]===255)solid++;}return {soft,solid};};
        const host=document.createElement('div');host.id='rr-legacy-font-qa';host.style='position:fixed;left:0;top:0;z-index:9999;padding:12px;background:#171a22;color:white;font:16px sans-serif';document.body.append(host);
        for(const [name,legacy,pixelated]of [['Canvas fallback before',false,true],['Legacy pixel text',true,true],['Smoothing enabled',true,false]]){
            const oldLegacy=$dataSystem.rrLegacyWindows,oldPixel=$dataSystem.advanced.pixelatedRendering;$dataSystem.rrLegacyWindows=legacy?2000:undefined;$dataSystem.advanced.pixelatedRendering=pixelated;
            const b=new Bitmap(310,36);b.fontSize=12;b.fontFace=$gameSystem.mainFontFace();b.textColor='#ffffff';b.outlineWidth=0;b.drawText(sample,4,0,300,16);b.drawText('Talan: Where did everybody go? Æ Ö ü',4,16,300,16);
            results.push({name,...partial(b),png:b.canvas.toDataURL()});const label=document.createElement('div');label.textContent=name;host.append(label);const c=document.createElement('canvas');c.width=b.width;c.height=b.height;c.style='display:block;width:1240px;height:144px;image-rendering:pixelated;margin-bottom:8px';c.getContext('2d').drawImage(b.canvas,0,0);host.append(c);
            $dataSystem.rrLegacyWindows=oldLegacy;$dataSystem.advanced.pixelatedRendering=oldPixel;b.destroy();
        }
        return {results,scaling:Graphics.scalingReport(),cache:Bitmap._legacyPixelTextCache.size,cachePixels:Bitmap._legacyPixelTextPixels};
    })().then(done,e=>done({error:String(e.stack)}));`);
    assert.ok(!report.error,report.error);assert.ok(report.results[0].soft>500,'fallback font really had antialiasing');assert.equal(report.results[1].soft,0);assert.ok(report.results[1].solid>300);assert.ok(report.results[2].soft>500,'smoothing opt-out preserved');
    for(const r of report.results){fs.writeFileSync(path.join(evidence,r.name.replaceAll(' ','-')+'.png'),Buffer.from(r.png.split(',')[1],'base64'));delete r.png;}
    fs.writeFileSync(path.join(evidence,'font-comparison.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
    await driver.execute(`document.getElementById('rr-legacy-font-qa').remove();window.__qaWindow=new Window_Base(new Rectangle(0,0,320,80));__qaWindow.contents.drawText('Talan: Where did everybody go?',0,0,304,16);__qaWindow.contents.drawText('A message using the original window.',0,16,304,16);SceneManager._scene.addChild(__qaWindow);`);
    await driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,400);');
    fs.writeFileSync(path.join(evidence,'window-initial.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
    await driver.execute(`window.__skinInterpreter=new Game_Interpreter();__skinInterpreter.rrSystemGraphic('SaveMeny',0,0);`);
    await driver.waitForScript('return ImageManager.isReady() && __qaWindow._rrWindowSkinKey === $gameSystem.windowSkinName()+":0";',[],{timeout:30000});
    const skin=await driver.execute(`__qaWindow.resetFontSettings();__qaWindow.contents.clear();__qaWindow.contents.drawText('Custom save/menu window preserved.',0,0,304,16);return {name:$gameSystem.windowSkinName(),url:__qaWindow.windowskin.url,palette:ColorManager.normalColor(),tiled:__qaWindow._backSprite.children[0].visible,background:__qaWindow.windowskin.getPixel(0,0),wait:__skinInterpreter._waitMode,errors:__legacyErrors};`);
    assert.match(skin.name,/^RR2kWindow_/);assert.equal(skin.background,'#ae9b86');assert.equal(skin.tiled,false);assert.deepEqual(skin.errors,[]);
    report.skin=skin;
    fs.writeFileSync(path.join(evidence,'window-custom-stretched.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
    await driver.execute(`__skinInterpreter.rrSystemGraphic('SaveMeny',1,0);`);
    await driver.waitForScript('return __qaWindow._rrWindowSkinKey === $gameSystem.windowSkinName()+":1";',[],{timeout:10000});
    assert.equal(await driver.execute('return __qaWindow._backSprite.children[0].visible;'),true);
    report.saved=await driver.execute('const restored=JsonEx.parse(JsonEx.stringify($gameSystem));return {name:restored.windowSkinName(),mode:restored.windowBackgroundMode()};');
    assert.equal(report.saved.name,skin.name);assert.equal(report.saved.mode,1);
    fs.writeFileSync(path.join(evidence,'window-custom-tiled.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
    report.errors=await driver.execute('return __legacyErrors;');assert.deepEqual(report.errors,[]);
    fs.writeFileSync(path.join(evidence,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){throw e;}finally{await driver.close().catch(()=>{});fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
