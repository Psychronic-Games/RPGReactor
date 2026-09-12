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
const evidence = option('evidence') || '/tmp/rr-audio-focus';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-audio-focus-'));
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
        // Supply two quiet WAVs in every category, including absent Demo folders.
        const wav=Buffer.alloc(1644);wav.write('RIFF');wav.writeUInt32LE(1636,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(1600,40);
        for(const type of ['bgm','bgs','me','se']) {
            const dir=path.join(project,'audio',type);fs.mkdirSync(dir,{recursive:true});
            for(const name of ['AuditFocus1.wav','AuditFocus2.wav'])fs.writeFileSync(path.join(dir,name),wav);
        }
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
        await driver.execute('I18n.setLanguage(arguments[0],{persist:false});reactor.optionsManager.applyTheme(arguments[1]);',[option('language')||'en',option('theme')||'dark']);
        if (option('size')) {
            const [width,height]=option('size').split('x').map(Number);
            await driver.execute('nw.Window.get().unmaximize();');
            await driver.sessionRequest('POST','/window/rect',{width,height});
            await driver.waitForScript('return innerWidth===arguments[0]&&innerHeight===arguments[1];',[width,height]);
        }
        const checks=[],failures=[];
        const check=(name,actual,expected)=>{checks.push(name);try{assert.deepEqual(actual,expected);}catch(_){failures.push({name,actual,expected});}};
        const key=async value=>{
            await driver.sessionRequest('POST','/actions',{actions:[{type:'key',id:'keyboard',actions:[{type:'keyDown',value},{type:'pause',duration:70},{type:'keyUp',value}]}]});
        };
        await driver.execute('reactor.audioPlayer.showAudioPlayer();');
        for(const type of ['bgm','bgs','me','se']) {
            await driver.execute('reactor.audioPlayer.switchAudioType(arguments[0]);',[type]);
            await driver.waitForScript('return document.querySelectorAll("#audio-track-list .audio-track-item").length>1;');
            await driver.execute('document.getElementById("audio-track-list").focus();');
            await key('\uE011');await key('\uE015');
            const result=await driver.execute(`const l=document.getElementById('audio-track-list'),r=l.querySelector('.playing'),s=getComputedStyle(r);return {focus:document.activeElement.id,selected:r.dataset.track,expected:l.querySelectorAll('.audio-track-item')[1].dataset.track,listOutline:getComputedStyle(l).outlineStyle,rowOutline:s.outlineStyle,rowOffset:s.outlineOffset};`);
            check(type+': arrows select the second track',result.selected,result.expected);
            check(type+': focus stays in the track list',result.focus,'audio-track-list');
            check(type+': no outer browser focus bar',result.listOutline,'none');
            check(type+': selected track has inset keyboard focus',[result.rowOutline,result.rowOffset],['solid','-2px']);
        }
        fs.writeFileSync(evidence+'-player.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        await driver.execute(`reactor.audioPlayer.stopAudio();document.getElementById('audio-player-modal').style.display='none';const folder=require('path').join(reactor.projectController.currentProject.path,'audio/se');RRAudioPickerModal.open({title:'Select SE',folderLabel:'SE',files:RRAssetFiles.listUnique(folder,RRAssetFiles.AUDIO_EXTENSIONS),onOk:()=>{}});`);
        await driver.waitForScript('return document.activeElement?.classList.contains("audio-track-item");');
        await key('\uE015');
        const row=await driver.execute('const e=document.activeElement,s=getComputedStyle(e);return [e.classList.contains("audio-track-item"),s.outlineStyle,s.outlineOffset];');
        check('shared audio picker uses inset row focus',row,[true,'solid','-2px']);
        fs.writeFileSync(evidence+'-picker.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        await key('\uE00C');
        check('no captured application errors',await driver.execute('return __interactionErrors;'),[]);
        const result={checks,failures,theme:option('theme')||'dark'};
        fs.writeFileSync(evidence+'-result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
        if(!process.argv.includes('--probe'))assert.deepEqual(failures,[]);
    } finally {await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
