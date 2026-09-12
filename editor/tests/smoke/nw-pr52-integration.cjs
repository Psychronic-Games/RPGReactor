#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-pr52-native-'));
const driver = new WebDriverClient(path.join(root, 'nwjs-linux/chromedriver'));

(async () => {
    try {
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': {
            args: [`nwapp=${path.join(root, 'editor')}`, `user-data-dir=${temp}/profile`, 'no-first-run']
        } });
        await driver.waitForScript('return !!window.reactor?.databaseEditorUI && getComputedStyle(document.getElementById("splash-screen")).display === "none";', [], { timeout: 90000 });
        const ui = await driver.execute(`
            I18n.setLanguage('en',{persist:false});
            const checks=[],check=(name,ok)=>{if(!ok)throw new Error(name);checks.push(name);};
            window.__pr52Errors=[];addEventListener('error',e=>__pr52Errors.push(String(e.error||e.message)));
            const host=document.createElement('div');host.style.cssText='position:fixed;inset:20px;z-index:999999;overflow:auto;background:var(--color-bg-panel);padding:20px;';document.body.appendChild(host);
            const list=[
                {code:357,indent:0,parameters:['Probe','Command','Probe command',{roundCount:'1'}]},
                {code:657,indent:0,parameters:['Round Count = 1']},
                {code:108,indent:0,parameters:['Comment first line']},
                {code:408,indent:0,parameters:['Comment second line']},
                {code:0,indent:0,parameters:[]}
            ];
            const map=new EventCommandList({databaseManager:reactor.databaseManager,projectController:reactor.projectController});
            for(const [name,editor] of [['map',map],['troop',reactor.databaseEditorUI.troopEditor],['common',reactor.databaseEditorUI.commonEventEditor]]){
                const page={list:JSON.parse(JSON.stringify(list))},before=JSON.stringify(page);
                const container=document.createElement('div');host.replaceChildren(container);
                if(name==='map')editor.refreshCommandList=()=>editor.renderCommandList(container,page,0);
                const render=()=>editor.renderCommandList(container,page,0);render();
                check(name+' collapsed arguments',!container.textContent.includes('Round Count = 1'));
                check(name+' named comment continuation',container.textContent.includes('Comment second line')&&!container.textContent.includes('Unknown (408)'));
                const toggle=()=>name==='map'?[...container.querySelectorAll('span')].find(e=>e.textContent==='▶'||e.textContent==='▼'):container.querySelector('.plugin-args-toggle');
                toggle().click();
                check(name+' expanded arguments exactly once',container.textContent.split('Round Count = 1').length===2&&!container.textContent.includes('roundCount:'));
                toggle().click();check(name+' collapse again',!container.textContent.includes('Round Count = 1'));
                check(name+' preserves commands',JSON.stringify(page)===before);
            }
            const container=document.createElement('div');host.replaceChildren(container);
            const music=new RRBgmSequenceEditor({container,tt:t=>I18n.tText(t),t:(k,p)=>I18n.t(k,p)});
            music.load({enabled:true,entries:[{type:'palette',layers:[{pool:[{type:'track',name:'Probe'}]}]}]});
            const edit=(suffix,value,checkbox=false)=>{const input=container.querySelector('[data-path$=".'+suffix+'"]');if(!input)throw new Error('Missing '+suffix);if(checkbox)input.checked=value;else input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));};
            edit('fadeIn',2.5);edit('once',true,true);edit('single',true,true);edit('order','shuffle');
            const trim=container.querySelector('[data-path$="pool.0.volume"]');trim.value='65';trim.dispatchEvent(new Event('change',{bubbles:true}));
            const saved=music.value(),entry=saved.entries[0];
            check('music values accepted',entry.fadeIn===2.5&&entry.once&&entry.single&&entry.layers[0].order==='shuffle'&&entry.layers[0].pool[0].volume===65);
            music.load(saved);check('music form roundtrip',JSON.stringify(music.value())===JSON.stringify(saved));
            return {checks,errors:__pr52Errors};
        `);
        assert.deepEqual(ui.errors, []);
        const core = fs.readFileSync(path.join(root, 'runtime/reactor_core.js'), 'utf8');
        const webAudio = core.slice(core.indexOf('function WebAudio()'), core.indexOf('function Video()'));
        const audio = await driver.executeAsync(`const source=arguments[0],done=arguments[arguments.length-1];(async()=>{
            const W=new Function(source+';return WebAudio;')(),results=[];
            for(const kind of ['interrupt','volume']){
                const ctx=new OfflineAudioContext(1,48000*3,48000);W._context=ctx;
                const track=Object.create(W.prototype);track._volume=1;track._pannerNode=ctx.createGain();track._pannerNode.connect(ctx.destination);track._createGainNode();track.isReady=()=>true;
                const tone=ctx.createConstantSource();tone.connect(track._fadeGainNode);tone.start();track.fadeIn(2);
                const paused=ctx.suspend(0.5);const rendering=ctx.startRendering();await paused;
                if(kind==='interrupt')track.fadeOut(2);else track.volume=0.25;
                await ctx.resume();const rendered=await rendering,data=rendered.getChannelData(0);
                results.push({kind,values:[0.75,1,2,2.75].map(t=>data[Math.floor(t*48000)])});
            }return results;
        })().then(done,e=>done({error:String(e.stack)}));`, [webAudio]);
        assert.ok(!audio.error, JSON.stringify(audio));
        const expected = [[0.21875, 0.1875, 0.0625, 0], [0.09375, 0.125, 0.25, 0.25]];
        audio.forEach((result, i) => result.values.forEach((value, j) => {
            assert.ok(Math.abs(value - expected[i][j]) < 0.005, JSON.stringify(result));
        }));
        console.log(JSON.stringify({ ui, audio }, null, 2));
    } finally {
        await driver.close();
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
