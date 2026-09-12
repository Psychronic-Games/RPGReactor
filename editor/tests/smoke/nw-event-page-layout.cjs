#!/usr/bin/env node
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..'), temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-event-layout-'));
const driver = new WebDriverClient(path.join(root, 'nwjs-linux/chromedriver'));
(async () => {
    try {
        await driver.start();
        await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': { args: [`nwapp=${path.join(root,'editor')}`, `user-data-dir=${temp}/profile`, 'no-first-run'] } });
        await driver.waitForScript('return !!window.reactor?.databaseManager && getComputedStyle(document.getElementById("splash-screen")).display==="none";', [], { timeout: 90000 });
        await driver.execute(`
            const fs=require('fs'),path=require('path');window.__fixture=arguments[0];
            fs.mkdirSync(path.join(__fixture,'img/characters'),{recursive:true});
            const canvas=document.createElement('canvas');canvas.width=576;canvas.height=384;
            const ctx=canvas.getContext('2d');ctx.fillStyle='#f030a0';ctx.fillRect(0,0,576,384);
            for(const name of ['Woman3','女中年3'])fs.writeFileSync(path.join(__fixture,'img/characters',name+'.png'),Buffer.from(canvas.toDataURL().split(',')[1],'base64'));
            const db=reactor.databaseManager;
            db.data.system={switches:['','Switch'],variables:['','Variable']};
            db.data.items=[null,{id:1,name:'Potion'},{id:2,name:'Key'}];db.data.actors=[null,{id:1,name:'Actor'},{id:2,name:'刘备'}];
            const map={width:20,height:20,reactor3d:{}};
            window.__ee=new EventEditor({currentMap:map},db,{getCurrentProject:()=>({path:__fixture}),getTilemapManager:()=>({currentMap:map})});
            window.__event={id:5,name:'EV005',note:'',x:6,y:6,pages:[__ee.createDefaultPage()]};
            Object.assign(__event.pages[0].conditions,{itemId:2,actorId:2});
            Object.assign(__event.pages[0].image,{characterName:'女中年3',characterIndex:0,direction:2,pattern:1});
            document.getElementById('event-editor-modal').style.display='flex';
            window.__errors=[];addEventListener('error',e=>__errors.push(String(e.error||e.message)));
        `, [temp]);
        if(process.argv.includes('--before')){
            const old=require('node:child_process').execFileSync('git',['show','HEAD:editor/src/event/EventPageEditor.js'],{cwd:root,encoding:'utf8'});
            await driver.execute(`const Old=new Function(arguments[0]+';return EventPageEditor;')();for(const key of Object.getOwnPropertyNames(Old.prototype))if(key!=='constructor')EventPageEditor.prototype[key]=Old.prototype[key];`,[old]);
        }
        const results=[];
        for (const language of ['en','zh-Hans','zh-Hant']) for(const theme of ['dark','light']) for(const [width,height] of [[1280,720],[1600,900],[2560,1440]]) {
            await driver.execute(`nw.Window.get().resizeTo(arguments[0],arguments[1]);I18n.setLanguage(arguments[2],{persist:false});document.documentElement.setAttribute('data-theme',arguments[3]);__ee.showEventEditor(document.getElementById('event-editor-content'),__event);`,[width,height,language,theme]);
            await driver.executeAsync('const done=arguments[0];setTimeout(done,250);');
            const result=await driver.execute(`
                const config=document.querySelector('.event-page-config'),canvas=config.querySelector('canvas'),box=canvas.getBoundingClientRect();
                const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
                const select=name=>config.querySelector('select[data-field="'+name+'Id"]');
                return {language:I18n.language,theme:document.documentElement.dataset.theme,size:[innerWidth,innerHeight],height:box.height,width:box.width,
                    drawn:pixels.some((v,i)=>i%4===0&&v===240&&pixels[i+1]===48&&pixels[i+2]===160),
                    overflowX:config.scrollWidth-config.clientWidth,scroll:getComputedStyle(config).overflowY,
                    dropdowns:[...config.querySelectorAll('select')].map(e=>{const trigger=e.parentElement.classList.contains('rr-shim-wrapper')?e.parentElement.querySelector('.rr-shim-trigger'):e;const b=trigger.getBoundingClientRect();return {field:e.dataset.field,width:b.width,height:b.height,text:trigger.textContent,visible:getComputedStyle(trigger).display};}),
                    disabled:['item','actor'].every(n=>select(n).disabled&&select(n).value===''),errors:__errors};
            `);
            if(language==='zh-Hans'&&theme==='light'&&width===1280)fs.writeFileSync('/tmp/rr-event-page-layout.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
            assert.ok(result.dropdowns.every(d=>d.height>=24&&d.width>=100),JSON.stringify(result.dropdowns));
            assert.ok(result.height>=88,JSON.stringify(result));assert.ok(result.drawn,JSON.stringify(result));assert.equal(result.overflowX,0,JSON.stringify(result));assert.equal(result.scroll,'auto');assert.equal(result.disabled,true);assert.deepEqual(result.errors,[]);results.push(result);
            const retained=await driver.execute(`
                const config=document.querySelector('.event-page-config'),before=JSON.stringify(__ee.currentEvent.pages[0].conditions);
                for(const name of ['item','actor']){
                    const check=config.querySelector('[data-field="'+name+'Valid"]'),select=config.querySelector('select[data-field="'+name+'Id"]');
                    check.checked=true;check.dispatchEvent(new Event('change'));
                    if(select.disabled||select.value!=='2')return false;
                    const height=select.getBoundingClientRect().height;
                    check.checked=false;check.dispatchEvent(new Event('change'));
                    if(!select.disabled||select.value!==''||Math.abs(select.getBoundingClientRect().height-height)>1)return false;
                }
                return before===JSON.stringify(__ee.currentEvent.pages[0].conditions);
            `);assert.equal(retained,true);
        }
        // Enabled conditions survive rendering and an off/on toggle with a changed ID.
        assert.equal(await driver.execute(`
            const page=__event.pages[0];page.conditions.itemValid=page.conditions.actorValid=true;
            __ee.showEventEditor(document.getElementById('event-editor-content'),__event);
            const config=document.querySelector('.event-page-config');
            for(const name of ['item','actor']){
                const select=config.querySelector('select[data-field="'+name+'Id"]'),check=config.querySelector('[data-field="'+name+'Valid"]');
                if(select.value!=='2'||select.disabled)return false;
                select.value='1';select.dispatchEvent(new Event('change'));check.checked=false;check.dispatchEvent(new Event('change'));check.checked=true;check.dispatchEvent(new Event('change'));
                if(select.value!=='1'||__ee.currentEvent.pages[0].conditions[name+'Id']!==1)return false;
            }
            return true;`),true);
        console.log(JSON.stringify(results,null,2));console.log('18 event layouts: visible decoded Chinese-named sprite, no horizontal overflow, condition IDs preserved.');
    } finally { await driver.close(); fs.rmSync(temp,{recursive:true,force:true}); }
})().catch(error=>{console.error(error);process.exitCode=1;});
