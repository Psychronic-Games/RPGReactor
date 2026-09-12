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
const evidence = option('evidence') || '/tmp/rr-ui-quality';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ui-quality-'));
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

        if(process.argv.includes('--icons-only')||process.argv.includes('--themes-only')){
            const results=[];
            const pause=()=>driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,250);');
            const luminance=color=>{
                const rgb=color.startsWith('#')?[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)):(color.match(/[\d.]+/g)||[]).slice(0,3).map(Number);
                assert.equal(rgb.length,3,color);
                return rgb.map(v=>v/255).map(v=>v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[0.2126,0.7152,0.0722][i],0);
            };
            const contrast=(a,b)=>(Math.max(luminance(a),luminance(b))+0.05)/(Math.min(luminance(a),luminance(b))+0.05);
            for(const palette of ['', 'bubblegum-', 'ocean-', 'cascadia-', 'underworld-', 'creamsicle-', 'royalty-']){
                for(const mode of ['dark','light']){
                    const theme=palette+mode;
                    await driver.execute('reactor.optionsManager.applyTheme(arguments[0]);',[theme]);await pause();
                    const icons=await driver.execute(`return [...document.querySelectorAll('.tool-button:not(:disabled) img')].filter(e=>e.getClientRects().length).map(e=>({src:e.getAttribute('src'),filter:getComputedStyle(e).filter,opacity:getComputedStyle(e).opacity,parentFilter:getComputedStyle(e.parentElement).filter,parentOpacity:getComputedStyle(e.parentElement).opacity}));`);
                    assert.ok(icons.length>10);
                    assert.ok(icons.every(icon=>icon.filter==='none'&&icon.opacity==='1'&&icon.parentFilter==='none'&&icon.parentOpacity==='1'),theme+' icons retain original colors');
                    const row={theme,icons};results.push(row);
                    if(mode==='light'){
                        const colors=await driver.execute(`const c=getComputedStyle(document.documentElement);return Object.fromEntries(['text','text-muted','accent','accent-on','border-input','bg-menubar','bg-toolbar','bg-panel','bg-input','bg-button','bg-button-hover','bg-button-active','bg-selected'].map(k=>[k,c.getPropertyValue('--color-'+k).trim()]));`);
                        const chrome=await driver.execute(`return ['html-menu-bar','toolbar'].map(id=>getComputedStyle(document.getElementById(id)).backgroundColor);`);
                        row.colors=colors;row.contrast=[];
                        assert.ok(contrast(...chrome)>1.2,theme+' menu and toolbar are distinct');
                        for(const surface of ['bg-menubar','bg-toolbar','bg-panel','bg-input','bg-button','bg-button-hover','bg-button-active','bg-selected']){
                            for(const foreground of ['text','text-muted']){
                                const ratio=contrast(colors[foreground],colors[surface]);row.contrast.push({foreground,surface,ratio});
                                assert.ok(ratio>=4.5,theme+' '+foreground+' on '+surface+': '+ratio);
                            }
                        }
                        assert.ok(contrast(colors['border-input'],colors['bg-input'])>=3,theme+' field boundary contrast');
                        assert.ok(contrast(colors['accent-on'],colors.accent)>=4.5,theme+' primary button contrast');
                    }
                    if(mode==='light'||!palette)fs.writeFileSync(evidence+'-'+theme+'-workspace.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
                    if(process.argv.includes('--themes-only')){
                        await driver.execute(`const db=reactor.databaseEditorUI;db.openDatabase('states');const first=document.querySelector('#database-list [data-entry-id]');if(first)db._activeDatabaseList?.selectIds([Number(first.dataset.entryId)],Number(first.dataset.entryId));`);await pause();
                        row.listGutter=await driver.execute(`const list=document.querySelector('#database-list'),item=list.querySelector('.database-list-item'),l=list.getBoundingClientRect(),r=item.getBoundingClientRect();return {left:r.left-l.left-list.clientLeft,right:l.left+list.clientLeft+list.clientWidth-r.right};`);
                        assert.ok(row.listGutter.left>=5.9&&row.listGutter.right>=5.9,theme+' list rows have a scrollbar gutter');
                        row.navigation=await driver.execute(`const nav=document.querySelector('.database-navigation'),last=nav.lastElementChild;last.scrollIntoView({block:'nearest'});const scrolled=nav.scrollTop>0;const active=nav.querySelector('.active');active.scrollIntoView({block:'nearest'});const n=nav.getBoundingClientRect(),a=active.getBoundingClientRect(),c=getComputedStyle(nav);return {left:a.left-n.left-nav.clientLeft,right:n.left+nav.clientLeft+nav.clientWidth-a.right,scrollbarColor:c.scrollbarColor,scrollbarWidth:c.scrollbarWidth,scrolled};`);
                        assert.ok(row.navigation.left>=5.9&&row.navigation.right>=5.9,theme+' categories have a scrollbar gutter');
                        assert.ok(row.navigation.scrolled,theme+' categories can scroll to the last item');
                        assert.equal(row.navigation.scrollbarWidth,'thin');
                        const scrollbarColors=row.navigation.scrollbarColor.match(/rgb\([^)]+\)/g);
                        assert.equal(scrollbarColors?.length,2,theme+' explicit category scrollbar colors');
                        assert.ok(contrast(...scrollbarColors)>=3,theme+' category scrollbar stands out from its track');

                        fs.writeFileSync(evidence+'-'+theme+'-states.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
                        await driver.execute(`document.querySelector('#database-cancel-btn').click();`);await pause();
                    }
                    console.log(theme+' icons and contrast pass');
                }
            }
            assert.deepEqual(await driver.execute('return __interactionErrors;'),[]);
            fs.writeFileSync(evidence+'-result.json',JSON.stringify(results,null,2));
            console.log('Icon colors pass in all 14 theme variants; contrast passes in all seven light palettes.');
            return;
        }

        const result={database:[],dialogs:[],tabs:[],checks:[],errors:[]};
        await driver.execute(`reactor.databaseManager.data.quests=[null,{id:1,name:'Audit Quest',key:'audit',category:'Main',iconIndex:0,difficulty:'Normal',from:'Village Elder',location:'Town',description:'A representative quest with objectives and rewards.',objectives:[{text:'Find the missing item',max:1}],rewards:[],subtext:'',quotes:'',activation:{type:'command'},completion:{type:'command'},note:''}];`);
        await driver.execute('I18n.setLanguage(arguments[0],{persist:false});reactor.optionsManager.applyTheme(arguments[1]);',[option('language')||'en',option('theme')||'dark']);
        const pause=()=>driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(done,180);');
        await driver.execute(`window.__layoutProbe=(selector)=>{
            const root=document.querySelector(selector),rect=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom};};
            const describe=e=>({tag:e.tagName,id:e.id,cls:String(e.className).slice(0,90),text:(e.getAttribute('aria-label')||e.textContent||e.getAttribute('data-field')||'').trim().slice(0,60)});
            if(!root)return {missing:selector};
            const issues=[];
            for(const e of root.querySelectorAll('input,select,textarea,button,.database-section,table')){
                if(!e.getClientRects().length||getComputedStyle(e).visibility==='hidden'||getComputedStyle(e).opacity==='0')continue;
                const r=rect(e),p=rect(e.parentElement);
                if(e.matches('input[type=checkbox]')&&Math.abs(r.w-r.h)>3)issues.push({...describe(e),kind:'stretched-checkbox',rect:r});
                if(e.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]),select')&&r.w<40)issues.push({...describe(e),kind:'cramped-field',rect:r});
                if(r.right>p.right+3&&getComputedStyle(e.parentElement).overflowX==='visible')issues.push({...describe(e),kind:'parent-overflow',excess:Math.round(r.right-p.right)});
            }
            const panes=[root,...root.querySelectorAll('.database-section-content,.database-detail,[class$="columns-grid"]')].map(e=>({...describe(e),width:e.clientWidth,scroll:e.scrollWidth,overflow:getComputedStyle(e).overflowX})).filter(e=>e.scroll>e.width+3);
            const windowElement=root.matches('#database-detail')?null:root.getBoundingClientRect().width>=innerWidth-1?[...root.children].find(e=>e.getClientRects().length):root;
            return {windowRect:windowElement?rect(windowElement):null,rect:rect(root),documentOverflow:document.documentElement.scrollWidth>innerWidth+1,issues,panes};
        };`);
        const types=['actors','classes','skills','items','weapons','armors','enemies','troops','states','animations','tilesets','reactor3d','commonEvents','userInterfaces','actionSequences','quests','system1','system2','types','terms'];
        for(const [width,height] of (option('sizes')||'1920x1080,1366x768,1280x720,1024x768').split(',').map(s=>s.split('x').map(Number))){
            // Below the desktop minimum is a layout stress test, not a changed app preference.
            await driver.execute('nw.Window.get().setMinimumSize(800,600);nw.Window.get().unmaximize();');
            await driver.sessionRequest('POST','/window/rect',{width,height});await pause();
            assert.deepEqual(await driver.execute('return [innerWidth,innerHeight];'),[width,height]);
            for(const type of types){
                await driver.execute(`const db=reactor.databaseEditorUI;db.openDatabase(arguments[0]);const first=document.querySelector('#database-list [data-entry-id]');if(first)db._activeDatabaseList?.selectIds([Number(first.dataset.entryId)],Number(first.dataset.entryId));`,[type]);await pause();
                const row=await driver.execute('return __layoutProbe("#database-detail");');
                const listGutters=await driver.execute(`return [...document.querySelectorAll('.database-list')].filter(e=>e.getClientRects().length).flatMap(list=>{const r=list.getBoundingClientRect(),left=r.left+list.clientLeft,right=left+list.clientWidth;return [...list.querySelectorAll('.database-list-item')].filter(e=>e.getClientRects().length).map(e=>{const row=e.getBoundingClientRect();return {left:row.left-left,right:right-row.right};});});`);
                assert.ok(listGutters.every(g=>g.left>=5.9&&g.right>=5.9),type+' rows have space beside the scrollbar at '+width);
                result.database.push({type,width,height,...row,listGutters});
                if(!option('no-screenshots'))fs.writeFileSync(evidence+'-'+width+'-'+type+'.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
                console.log(type,width,row.issues.length,row.panes.length);
                const pairs=await driver.execute(`return [...document.querySelectorAll('#database-detail .db-row-pair')].map(row=>{const c=[...row.children].filter(e=>e.tagName!=='LABEL'&&e.getClientRects().length);return c.length===2?Math.abs(c[0].getBoundingClientRect().width-c[1].getBoundingClientRect().width):0;});`);
                assert.ok(pairs.every(difference=>difference<1.1),type+' paired field widths at '+width+': '+pairs.join(','));
                if(pairs.length)result.checks.push(type+' paired field widths align at '+width);
                if(type==='commonEvents'){
                    for(const value of ['1','0']){
                        await driver.execute(`const e=document.getElementById('common-event-trigger-select');e.value=arguments[0];e.dispatchEvent(new Event('change'));`,[value]);await pause();
                        assert.equal(await driver.execute(`const e=document.getElementById('common-event-switch-input').parentElement;return e.getClientRects().length>0;`),value==='1');
                    }
                    result.checks.push('Common Event spinner visibility follows trigger at '+width);
                }
                if(type==='actors'){
                    assert.ok(await driver.execute(`return document.querySelector('textarea[data-field="profile"]').getBoundingClientRect().height<200;`));
                    const levels=await driver.execute(`return ['initialLevel','maxLevel'].map(field=>{const r=document.querySelector('input[data-field="'+field+'"]').parentElement.getBoundingClientRect();return {y:r.y,width:r.width};});`);
                    assert.ok(Math.abs(levels[0].y-levels[1].y)<1.1&&Math.abs(levels[0].width-levels[1].width)<1.1,'Actor level fields share a row and width at '+width);
                    result.checks.push('Actor profile keeps natural height and levels align at '+width);
                }
                if(type==='system2'){
                    assert.ok(await driver.execute(`const r=document.querySelector('[data-advanced-field="pixelatedRendering"]').getBoundingClientRect();return r.width===r.height&&r.width<=16;`));
                    result.checks.push('Pixelated Rendering stays square at '+width);
                }
            }
            await driver.execute('document.querySelector("#database-cancel-btn").click();');
        const dialogs = [
            ['Plugin manager','#plugin-manager-modal','reactor.pluginManager.show();reactor.pluginManager.selectPluginFromEvent(0);','reactor.pluginManager.hide();'],
            ['Resource manager','#resource-manager-modal','reactor.resourceManager.show();','reactor.resourceManager.close();'],
            ['Options','.options-modal-overlay','reactor.optionsManager.show();','reactor.optionsManager.close();'],
            ['About','#about-modal','reactor.showAbout();',`document.getElementById('about-modal').style.display='none';`],
            ['Command picker','.event-command-picker-modal','window.__auditPicker=new EventCommandPicker();__auditPicker.show(()=>{});','__auditPicker.close();__auditPicker.modal.remove();'],
            ['Switch picker','.switch-variable-picker-modal',`window.__auditSwitch=new SwitchVariablePicker(reactor.databaseManager,reactor.projectController);__auditSwitch.show('switch',1,()=>{});`,'__auditSwitch.close();__auditSwitch.modal?.remove();'],
            ['Confirmation','#rr-themed-dialog',`reactor.uiManager.openThemedDialog({title:'Audit',message:'No project changes',okLabel:'OK',cancelLabel:'Cancel'});`,`document.querySelector('#rr-themed-dialog-cancel')?.click();`],
            ['Audio picker','.rr-audio-picker-modal',`RRAudioPickerModal.open({title:'Audit',files:[],onConfirm:()=>{}});`,`document.querySelector('.rr-audio-picker-modal button')?.click();`],
            ['System sound','.rr-system-sound-modal',`RRSystemSoundSlotModal.open({slot:{name:'',volume:90,pitch:100,pan:0},files:[],onOk:()=>{}});`,`document.querySelector('.rr-system-sound-modal .rr-modal-close')?.click();`],
            ['Database','#database-viewer',`reactor.databaseEditorUI.openDatabase('actors');`,`document.querySelector('#database-cancel-btn').click();`],
            ['Trait','.trait-editor-modal',`reactor.databaseEditorUI.openDatabase('actors');reactor.databaseEditorUI.actorEditor.traitEditor.showTraitEditorModal(structuredClone(reactor.databaseManager.data.actors[1]));`,`document.querySelector('.trait-editor-modal .close-btn').click();document.querySelector('#database-cancel-btn').click();`],
            ['Effect','.effect-editor-modal',`reactor.databaseEditorUI.openDatabase('items');reactor.databaseEditorUI.itemEditor.effectEditor.showEffectEditorModal(structuredClone(reactor.databaseManager.data.items[1]));`,`document.querySelector('.effect-editor-modal .close-btn').click();document.querySelector('#database-cancel-btn').click();`]
        ];
            dialogs.push(['Audio Player','#audio-player-modal','reactor.audioPlayer.showAudioPlayer();',`document.querySelector('#audio-player-modal .modal-close').click();`]);
            dialogs.push(
                ['Deploy','#build-modal','reactor.buildManager.open();','reactor.buildManager.close();'],
                ['Map Properties','#map-properties-modal',`reactor.projectController.openMapPropertiesModal(reactor.tilemapManager.currentMap);`,`document.querySelector('#map-properties-close-btn').click();`],
                ['Event Editor','#event-editor-modal',`reactor.eventManager.editEvent({id:900,name:'Layout audit',x:0,y:0,note:'',pages:[]});`,`document.querySelector('#event-editor-close-btn').click();`],
                ['Show Text','.message-command-editor-modal',`window.__form=new MessageCommandEditor(reactor.databaseManager,reactor.projectController);__form.show({code:101,parameters:['',0,0,2,'']},()=>{});`,`__form.close();__form.modal.remove();`],
                ['Choices','.choices-command-editor-modal',`window.__form=new ShowChoicesCommandEditor();__form.show(null,()=>{});`,`__form.close();__form.modal.remove();`],
                ['Variables','.control-variables-editor-modal',`window.__form=new ControlVariablesEditor(reactor.databaseManager,reactor.projectController);__form.show(null,()=>{});`,`__form.close();__form.modal.remove();`],
                ['Conditional','.conditional-branch-editor-modal',`window.__form=new ConditionalBranchEditor(reactor.databaseManager,reactor.projectController);__form.show(null,()=>{});`,`__form.close();__form.modal.remove();`],
                ['Picture','.show-picture-editor-modal',`window.__form=new ShowPictureEditor(reactor.databaseManager,reactor.projectController);__form.show(null,()=>{});`,`__form.close();__form.modal.remove();`],
                ['Color','.rr-color-picker-overlay',`RRColorPickerModal.open({onPick:()=>{}});`,`document.querySelector('.rr-color-picker-overlay button').click();`]
            );
            for(const [name,selector,open,close] of dialogs){
                await driver.execute(open);await pause();
                const row=await driver.execute('return __layoutProbe(arguments[0]);',[selector]);
                result.dialogs.push({name,width,height,...row});
                if(!option('no-screenshots'))fs.writeFileSync(evidence+'-'+width+'-'+name.replaceAll(' ','-')+'.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
                const tabs=await driver.execute('return document.querySelector(arguments[0]).querySelectorAll(".trait-tab,.effect-tab,.rr-cb-tab").length;',[selector]);
                for(let tab=0;tab<tabs;tab++){
                    await driver.execute('document.querySelector(arguments[0]).querySelectorAll(".trait-tab,.effect-tab,.rr-cb-tab")[arguments[1]].click();',[selector,tab]);await pause();
                    result.tabs.push({name,width,height,tab,...await driver.execute('return __layoutProbe(arguments[0]);',[selector])});
                }
                fs.writeFileSync(evidence+'-result.json',JSON.stringify(result,null,2));
                await driver.execute(close);await pause();
                console.log(name,width,row.issues?.length);
            }
        }
        result.errors=await driver.execute('return __interactionErrors;');
        fs.writeFileSync(evidence+'-result.json',JSON.stringify(result,null,2));
        assert.deepEqual(result.errors,[]);
        if(!process.argv.includes('--probe')){
            for(const row of [...result.database,...result.dialogs,...result.tabs]){
                const context=(row.type||row.name)+' '+row.width+(row.tab===undefined?'':' tab '+row.tab);
                assert.deepEqual(row.issues,[],context+' controls fit');
                assert.deepEqual(row.panes,[],context+' panes fit');
                if(row.windowRect){const r=row.windowRect;assert.ok(r.x>=-1&&r.y>=-1&&r.right<=row.width+1&&r.bottom<=row.height+1,context+' window stays on screen');}
            }
        }
    } finally {await driver.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
