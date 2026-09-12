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
const evidence = option('evidence') || '/tmp/rr-keyboard-menu-audit';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-keyboard-menu-audit-'));
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
        // Observational audit: missing behavior is recorded, not asserted as a regression.
        const result = { menus: [], dialogs: [], dropdowns: [], fields: [], errors: [] };
        const key = async (value, shift = false) => {
            const actions = [];
            if (shift) actions.push({type:'keyDown', value:'\uE008'});
            actions.push({type:'keyDown',value},{type:'keyUp',value});
            if (shift) actions.push({type:'keyUp',value:'\uE008'});
            await driver.sessionRequest('POST','/actions',{actions:[{type:'key',id:'audit-keyboard',actions}]});
        };
        const pause = () => driver.executeAsync('const done=arguments[arguments.length-1];setTimeout(()=>done(true),100);');
        await driver.execute(`
            window.__auditVisible = el => !!el && el.getClientRects().length>0 && getComputedStyle(el).visibility!=='hidden';
            window.__auditFields = el => Array.from(el.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')).filter(e=>__auditVisible(e)&&!e.disabled&&e.tabIndex>=0);
            window.__auditDescribe = el => el ? {tag:el.tagName,id:el.id,cls:String(el.className),text:(el.innerText||el.value||'').slice(0,60)} : null;
            const opener=document.createElement('button');opener.id='audit-opener';opener.textContent='Audit opener';opener.style.cssText='position:fixed;bottom:0;left:0;z-index:1';document.body.appendChild(opener);
        `);
        for (const name of await driver.execute('return [...document.querySelectorAll(".html-menu-item")].map(e=>e.dataset.menu);')) {
            await driver.execute(`document.getElementById('audit-opener').focus();document.querySelector('.html-menu-item[data-menu="'+arguments[0]+'"]').click();`,[name]);
            await key('\uE015');
            const row = await driver.execute(`const menu=document.getElementById('submenu-'+arguments[0]);return {name:arguments[0],focusableEntries:__auditFields(menu).length,arrowEntersMenu:menu.contains(document.activeElement),headingTabIndex:document.querySelector('.html-menu-item[data-menu="'+arguments[0]+'"]').tabIndex};`,[name]);
            await key('\uE00C');
            row.escapeCloses = await driver.execute('return !__auditVisible(document.getElementById("submenu-"+arguments[0]));',[name]);
            result.menus.push(row);
            await driver.execute('document.querySelectorAll(".html-submenu").forEach(e=>e.style.display="none");');
        }
        const contexts = [
            ['Map context','#map-context-menu',`reactor.projectController.showContextMenuItems(50,50,[{label:'Audit A',action:()=>{}},{label:'Audit B',action:()=>{}}]);`,`reactor.projectController.hideMapContextMenu();`],
            ['Event context','#event-context-menu',`reactor.eventManager.showContextMenu(50,50,0,0,null);`,`reactor.eventManager.hideContextMenu();`],
            ['Database context','.rr-database-action-menu',`reactor.databaseEditorUI.showDatabaseActionMenu(50,50,[{label:'Audit A',action:()=>{}},{label:'Audit B',action:()=>{}}]);`,`reactor.databaseEditorUI.closeDatabaseActionMenu();`],
            ['Text context','.rr-text-code-menu',`RRTextCodeMenu.showMenu(50,50,[{label:'Audit A',action:()=>{}},{label:'Audit B',action:()=>{}}]);`,`RRTextCodeMenu.closeMenu();`],
            ['Plugin context','#plugin-context-menu',`reactor.pluginManager._showPluginContextMenu(50,50,0,{pasteOnly:true});`,`reactor.pluginManager._hidePluginContextMenu();`]
        ];
        for (const [name,selector,open,close] of contexts) {
            await driver.execute(`document.getElementById('audit-opener').focus();${open}`);await pause();
            const row=await driver.execute('const m=document.querySelector(arguments[0]);return {focusableEntries:__auditFields(m).length,initialFocusInside:m.contains(document.activeElement)};',[selector]);
            row.name=name;await key('\uE015');
            row.arrowEntersMenu=await driver.execute('return document.querySelector(arguments[0]).contains(document.activeElement);',[selector]);
            await key('\uE00C');
            row.escapeCloses=await driver.execute('return !__auditVisible(document.querySelector(arguments[0]));',[selector]);
            result.menus.push(row);await driver.execute(close);
        }
        const dialogs = [
            ['Plugin manager','#plugin-manager-modal','reactor.pluginManager.show();','reactor.pluginManager.hide();'],
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
        for (const [name,selector,open,close] of dialogs) {
            await driver.execute(`document.getElementById('audit-opener').focus();${open}`);await pause();
            const row=await driver.execute(`const m=document.querySelector(arguments[0]);if(!__auditVisible(m))throw Error('Dialog not visible '+arguments[0]);return {initialFocusInside:m.contains(document.activeElement),initialFocus:__auditDescribe(document.activeElement),focusableCount:__auditFields(m).length};`,[selector]);
            row.name=name;
            if(row.focusableCount) {
                await driver.execute('window.__auditFirst=__auditFields(document.querySelector(arguments[0]))[0];__auditFirst.focus();',[selector]);
                await key('\uE004',true);
                row.shiftTabContained=await driver.execute('return document.querySelector(arguments[0]).contains(document.activeElement);',[selector]);
                row.shiftTabDestination=await driver.execute('return __auditDescribe(document.activeElement);');
                await driver.execute('window.__auditLast=__auditFields(document.querySelector(arguments[0])).at(-1);__auditLast.focus();',[selector]);
                await key('\uE004');
                row.tabContained=await driver.execute('return document.querySelector(arguments[0]).contains(document.activeElement);',[selector]);
                row.tabDestination=await driver.execute('return __auditDescribe(document.activeElement);');
                await driver.execute('__auditFirst.focus();');
            }
            await key('\uE00C');
            row.escapeCloses=await driver.execute('return !__auditVisible(document.querySelector(arguments[0]));',[selector]);
            row.escapeRestoresOpener=await driver.execute('return document.activeElement.id==="audit-opener";');
            result.dialogs.push(row);fs.writeFileSync(evidence+'-result.json',JSON.stringify(result,null,2));console.log(name,JSON.stringify(row));
            await driver.execute(close);
        }
        await driver.execute('reactor.optionsManager.show();');
        for(const name of ['language','palette']) {
            const trigger='.rr-opt-'+name+'-trigger',menu='.rr-opt-'+name+'-menu';
            await driver.execute('document.querySelector(arguments[0]).focus();',[trigger]);await key('\uE007');
            const row={name,enterOpens:await driver.execute('return __auditVisible(document.querySelector(arguments[0]));',[menu])};
            await key('\uE015');
            row.arrowEnters=await driver.execute('return document.querySelector(arguments[0]).contains(document.activeElement);',[menu]);
            await key('\uE00C');
            row.escapeCloses=await driver.execute('return !__auditVisible(document.querySelector(arguments[0]));',[menu]);
            result.dropdowns.push(row);
            if(!row.escapeCloses) await driver.execute('document.querySelector(arguments[0]).click();',[trigger]);
        }
        await driver.execute(`reactor.optionsManager.close();reactor.databaseEditorUI.openDatabase('actors');reactor.databaseEditorUI._activeDatabaseList.selectIds([1],1);reactor.databaseEditorUI.showDatabaseDetail(reactor.databaseManager.data.actors[1],'actors');`);await pause();
        result.databaseCategories=await driver.execute(`return [...document.querySelectorAll('.database-nav-item')].map(e=>({label:e.textContent,tabIndex:e.tabIndex,tag:e.tagName}));`);
        const fields=await driver.execute(`window.__auditFormFields=[...document.querySelectorAll('#database-viewer input,#database-viewer textarea')].filter(e=>__auditVisible(e)&&!e.disabled&&e.tabIndex>=0).slice(0,8);return __auditFormFields.map((e,index)=>({index,id:e.id,type:e.type}));`);
        assert.ok(fields.length>0,'Expected visible database fields');
        for (const field of fields) {
            await driver.execute('__auditFormFields[arguments[0]].focus();',[field.index]);await key('\uE004');
            const destination=await driver.execute('return __auditDescribe(document.activeElement);');await key('\uE004',true);
            result.fields.push({...field,tabDestination:destination,shiftTabReturns:await driver.execute('return document.activeElement===__auditFormFields[arguments[0]];',[field.index])});
        }
        // Exercise native Enter and Tab with actual picker controls and no-op callbacks.
        await driver.execute(`document.querySelector('#database-cancel-btn').click();window.__auditSelected=null;window.__auditSwitch=new SwitchVariablePicker(reactor.databaseManager,reactor.projectController);__auditSwitch.show('switch',1,id=>window.__auditSelected=id);`);await pause();
        await key('\uE015');
        result.switchArrow=await driver.execute('return __auditDescribe(document.activeElement);');
        await key('\uE004');
        result.switchTab=await driver.execute('return __auditDescribe(document.activeElement);');
        await key('\uE007');
        result.switchEnterSelected=await driver.execute('return __auditSelected;');
        await driver.execute(`__auditSwitch.close();window.__auditActivated=false;reactor.databaseEditorUI.showDatabaseActionMenu(50,50,[{label:'First',action:()=>{}},{label:'Disabled',enabled:false},{label:'Last',action:()=>{window.__auditActivated=true;}}]);document.querySelector('.rr-database-action-item').focus();`);
        await key('\uE004');
        result.disabledSkipped=await driver.execute('return document.activeElement.textContent;');
        await key('\uE007');
        result.contextEnterActivates=await driver.execute('return __auditActivated;');
        result.errors=await driver.execute('return __interactionErrors;');
        fs.writeFileSync(evidence+'-result.json',JSON.stringify(result,null,2));
        fs.writeFileSync(evidence+'-after.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        console.log(JSON.stringify(result,null,2));
        assert.deepEqual(result.errors,[]);
    } finally {
        await driver.close();
        fs.rmSync(temp,{recursive:true,force:true});
    }
})().catch(error=>{console.error(error);process.exitCode=1;});
