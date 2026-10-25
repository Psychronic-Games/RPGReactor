// Inspector editing and actual title-menu focus on a disposable project.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { WebDriverClient } = require('./webdriver-client.cjs');
const root = path.resolve(__dirname, '../../..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-ui-quality-'));
const project = path.join(temp, 'Demo');
const source = path.join(root, 'template/Demo');
const driver = new WebDriverClient(path.join(process.env.NWJS_SDK_ROOT || path.join(root, 'nwjs-linux'), 'chromedriver'));

async function launch(app, profile) {
    await driver.start();
    await driver.createSession({ browserName: 'chrome', 'goog:chromeOptions': { args: [
        `nwapp=${app}`, `user-data-dir=${path.join(temp, profile)}`, 'no-first-run'
    ] } });
    await driver.setScriptTimeout(60000);
}

(async () => {
    try {
        fs.mkdirSync(project);
        for (const file of ['index.html', 'package.json', 'project.rpgreactor']) fs.copyFileSync(path.join(source, file), path.join(project, file));
        for (const folder of ['data', 'js']) fs.cpSync(path.join(source, folder), path.join(project, folder), { recursive: true });
        for (const folder of ['img', 'audio', 'fonts', 'icon', 'effects', '3d', 'css']) {
            if (fs.existsSync(path.join(source, folder))) {
                if (folder === 'icon') fs.cpSync(path.join(source, folder), path.join(project, folder), { recursive: true });
                else fs.symlinkSync(path.join(source, folder), path.join(project, folder));
            }
        }
        const records = JSON.parse(fs.readFileSync(path.join(project, 'data/UserInterfaces.json')));
        const title = records.find(r => r?.stock === 'title');
        assert.ok(title);
        const systemPath = path.join(project, 'data/System.json');
        fs.copyFileSync(path.join(root, 'runtime/reactor_ui.js'), path.join(project, 'js/reactor_ui.js'));
        const system = JSON.parse(fs.readFileSync(systemPath));
        system.reactorTitleInterfaceId = title.id;
        fs.writeFileSync(systemPath, JSON.stringify(system));
        await launch(path.join(root, 'editor'), 'editor-profile');
        await driver.waitForScript('return !!window.reactor?.databaseEditorUI;', [], { timeout: 90000 });
        const result = await driver.executeAsync(`
            const projectPath = arguments[0], done = arguments[arguments.length - 1];
            (async () => {
                const app = reactor, project = await app.projectManager.loadProject(projectPath);
                await app.databaseManager.loadAllData(projectPath);
                app.projectController.currentProject = project;
                app.projectController.projectLoaded = true;
                app.openDatabase('userInterfaces');
                const record = app.databaseManager.getUserInterfaces().find(r => r?.stock === 'title');
                app.databaseEditorUI.showDatabaseDetail(record, 'userInterfaces');
                const ui = app.databaseEditorUI.userInterfaceEditor;
                const button = ui.current.nodes.find(n => n.type === 'button');
                ui.select(button.id);
                const panel = ui.wrapper.querySelector('.rr-ui-props');
                nw.Window.get().resizeTo(1920,1080);
                const before = ui.snapshot();
                const siblings = ui.current.nodes.filter(n => n.type === 'button');
                const row = id => panel.closest('.rr-ui-workspace').querySelector('.rr-ui-tree-row[data-id="' + id + '"]');
                row(siblings[0].id).dispatchEvent(new MouseEvent('click', { bubbles: true }));
                row(siblings[1].id).dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
                if (ui.selectedNodes().length !== 2) throw Error('Ctrl-click did not select two layers');
                await new Promise(resolve => setTimeout(resolve, 150));
                ui.fitCanvas();
                const start = siblings.slice(0,2).map(n => ({x:n.x,y:n.y}));
                const bounds = ui.rects().get(siblings[0].id), canvas = ui.canvas.getBoundingClientRect();
                const x = canvas.left + (bounds.x + bounds.width/2)*ui.scale;
                const y = canvas.top + (bounds.y + bounds.height/2)*ui.scale;
                ui.canvas.dispatchEvent(new MouseEvent('mousedown', {bubbles:true, button:0, clientX:x, clientY:y}));
                window.dispatchEvent(new MouseEvent('mousemove', {clientX:x+16*ui.scale, clientY:y+8*ui.scale, altKey:true}));
                window.dispatchEvent(new MouseEvent('mouseup'));
                const dx=siblings[0].x-start[0].x, dy=siblings[0].y-start[0].y;
                if(Math.abs(dx-16)>2 || Math.abs(dy-8)>2 || siblings[1].x-start[1].x!==dx || siblings[1].y-start[1].y!==dy) throw Error('Group drag lost spacing');
                ui.undo();
                if (ui.snapshot()!==before) throw Error('Group undo failed');
                row(siblings[2].id).dispatchEvent(new MouseEvent('click', {bubbles:true, shiftKey:true}));
                if (ui.selectedNodes().length !== 2) throw Error('Shift-click range failed');
                ui.restore(before);
                // Exercise the normal dialog commit and native project save.
                const menu = app.databaseManager.getUserInterfaces().find(r => r?.stock === 'menu');
                app.databaseEditorUI.showDatabaseDetail(menu, 'userInterfaces');
                const panelEditor = app.databaseEditorUI.userInterfaceEditor;
                const actorPanel = panelEditor.current.nodes.find(n => n.rowLayout === 'actorPanel');
                if (!actorPanel) throw Error('Main Menu has no editable Actor Panel');
                panelEditor.select(actorPanel.id);
                const properties = panelEditor.wrapper.querySelector('.rr-ui-props');
                let hp = properties.querySelector('.p-actorField-hp');
                hp.checked = false; hp.dispatchEvent(new Event('change', {bubbles:true}));
                if (actorPanel.actorFields.includes('hp')) throw Error('Actor Panel HP toggle failed');
                hp = properties.querySelector('.p-actorField-hp');
                hp.checked = true; hp.dispatchEvent(new Event('change', {bubbles:true}));
                const selectPart=key=>{const input=properties.querySelector('.p-actorElement'); input.value=key;input.dispatchEvent(new Event('change',{bubbles:true}));};
                selectPart('hp');
                let input=properties.querySelector('.p-element-shape');input.value='chamfer';input.dispatchEvent(new Event('change',{bubbles:true}));
                input=properties.querySelector('.p-element-height');input.value='8';input.dispatchEvent(new Event('change',{bubbles:true}));
                selectPart('hpValue');
                input=properties.querySelector('.p-element-fontSize');input.value='16';input.dispatchEvent(new Event('change',{bubbles:true}));
                if(actorPanel.actorElements.hp.shape!=='chamfer' || actorPanel.actorElements.hpValue.fontSize!==16) throw Error('Actor element controls did not save');
                // Custom parts are edited through the same controls and saved.
                const setPart=(prop,value)=>{const input=properties.querySelector('.p-element-'+prop);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));};
                for(const kind of ['box','label','value','gauge']) {
                    properties.querySelector('.p-customElementKind').value=kind;
                    properties.querySelector('.p-element-add').click();
                    setPart('x',kind==='gauge'?20:110);setPart('y',204);
                    if(kind==='gauge') {setPart('shape','circular');setPart('width',32);setPart('height',32);setPart('thickness',4);setPart('variableId',4);setPart('max',100);}
                    if(kind==='value') setPart('variableId',4);
                    if(kind==='label') setPart('text','Energy');
                    if(kind==='box') {properties.querySelector('.p-element-remove').click();}
                }
                const customs=Object.values(actorPanel.actorElements).filter(e=>e.kind);
                if(customs.length!==3 || !customs.some(e=>e.shape==='circular')) throw Error('Custom parts did not persist');
                selectPart('states');setPart('iconSize',24);setPart('iconGap',6);
                const reset=properties.querySelector('.p-element-reset');
                if(reset.textContent!=='Reset Element' || getComputedStyle(reset).justifyContent!=='center') throw Error('Reset Element alignment');
                // Exercise all shapes on actual Canvas pixels.
                const gaugeCanvas=document.createElement('canvas');gaugeCanvas.width=gaugeCanvas.height=80;
                const gc=gaugeCanvas.getContext('2d'),sample=(x,y)=>gc.getImageData(x,y,1,1).data[3];
                for(const shape of ['rectangle','rounded','chamfer','circular']) {
                    gc.clearRect(0,0,80,80);DatabaseUserInterfaceEditor.drawActorGauge(gc,{x:0,y:0,width:80,height:80},{shape,corner:20,thickness:8},.65,['#fff','#fff','#555']);
                    if(shape==='rectangle' && !sample(0,0)) throw Error('Rectangle missing');
                    if(shape!=='rectangle' && sample(0,0)) throw Error('Gauge corners ignored: '+shape);
                    if(shape==='circular' && (sample(40,40) || !sample(40,3))) throw Error('Circular gauge is not a ring');
                }
                const equip=panelEditor.current.nodes.find(n=>n.action?.type==='personalEquip');
                const originalAction=JSON.parse(JSON.stringify(equip.action));
                panelEditor.select(equip.id);
                input=properties.querySelector('.p-action-type');input.value='script';input.dispatchEvent(new Event('change',{bubbles:true}));
                const script=properties.querySelector('.p-action-script');script.style.height='230px';
                await new Promise(resolve=>requestAnimationFrame(resolve));
                if(script.getBoundingClientRect().height<225) throw Error('Script textarea still shrinks');
                script.parentElement.querySelector('.rr-ui-expand-script').click();
                let dialog=document.querySelector('.rr-ui-script-dialog');
                dialog.querySelector('textarea').value='const actorId = actor.actorId();'+String.fromCharCode(10)+'$gameVariables.setValue(4, actorId);';
                dialog.querySelector('footer button:last-child').click();
                if(!equip.action.script.includes(String.fromCharCode(10))) throw Error('Expanded script did not apply multiline text');
                const applied=equip.action.script;
                script.parentElement.querySelector('.rr-ui-expand-script').click();dialog=document.querySelector('.rr-ui-script-dialog');
                dialog.querySelector('textarea').value='cancelled';dialog.querySelector('footer button').click();
                if(equip.action.script!==applied) throw Error('Cancel applied script');
                equip.action=originalAction;panelEditor.select(actorPanel.id);
                console.log('Custom parts, States, gauge pixels, script expansion and reset controls passed');
                const pluginButton=JSON.parse(JSON.stringify(equip));
                pluginButton.id=Math.max(...panelEditor.current.nodes.map(n=>n.id))+1;
                pluginButton.y=Math.max(...panelEditor.current.nodes.filter(n=>n.parent===equip.parent).map(n=>n.y+n.height));
                pluginButton.text='Skill Tree';pluginButton.labelScript="'Skill Tree'";
                pluginButton.action={...DatabaseUserInterfaceEditor.defaultAction('pluginScene'),sceneClass:'Scene_SkillTree',argsExpression:'[actor.actorId()]',actorFirst:true,contextName:'selectedActor'};
                panelEditor.current.nodes.push(pluginButton);
                // Bright adjacent tiles must not bleed into an icon when the
                // preview zoom or a gauge places it between physical pixels.
                const sheet = document.createElement('canvas'); sheet.width=512; sheet.height=64;
                const sc=sheet.getContext('2d'); sc.fillStyle='#fff'; sc.fillRect(0,0,512,64);
                sc.clearRect(32,32,32,32); sc.fillStyle='#c02020'; sc.fillRect(36,36,24,24);
                const tile=panelEditor.iconTile(sheet,17);
                const output=document.createElement('canvas'); output.width=output.height=40;
                const oc=output.getContext('2d'); oc.drawImage(tile,2.4,2.4,30,30);
                const pixels=oc.getImageData(0,0,40,40).data;
                for(let p=0;p<pixels.length;p+=4) {
                    if(pixels[p+3] && pixels[p]>220 && pixels[p+1]>220 && pixels[p+2]>220) throw Error('Editor icon has atlas bleed');
                }
                document.getElementById('database-ok-btn').click();
                return await app.projectController.saveProject();
            })().then(done, error => done({ error: String(error.stack) }));
        `, [project]);
        assert.equal(result, true);
        await driver.close();
        await launch(project, 'game-profile');
        await driver.waitForScript('return window.SceneManager?._scene?._nodeWindows?.some(w => w._uiFocused);', [], { timeout: 90000 });
        await driver.waitForScript('return SceneManager._scene._fadeDuration === 0;', [], { timeout: 10000 });
        const party = await driver.execute(`DataManager.setupNewGame(); return $gameParty.members().map(actor=>({id:actor.actorId(),name:actor.name()}));`);
        assert.ok(party.length >= 2, 'Demo starting party supplies real actors');
        console.log('Demo party:', party);
        await driver.execute('SceneManager.push(Scene_Menu);');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_ReactorUI && SceneManager._scene._role === "menu" && SceneManager._scene.acceptsInput();', [], {timeout:30000});
        const liveParts=await driver.executeAsync(`
            const done=arguments[arguments.length-1];
            const scene=SceneManager._scene,win=scene._nodeWindows.find(w=>w.node().rowLayout==='actorPanel');
            const actor=$gameParty.members()[0],state=$dataStates.find(s=>s && s.id>1 && s.iconIndex>0);
            const node=win.node();
            if(!Object.values(node.actorElements).some(e=>e.shape==='circular' && e.variableId===4)) throw Error('Saved custom gauge missing after reload');
            let draws=0;const original=win.drawActorPanelRow;win.drawActorPanelRow=function(...args){draws++;return original.apply(this,args);};
            $gameVariables.setValue(4,25);if(state)actor.addState(state.id);
            setTimeout(()=>{
                const result={draws,icons:actor.allIcons(),states:node.actorFields.includes('states'),rate:ReactorUI.actorGaugeData(actor,'variable',{variableId:4,max:100}).rate};
                if(state)actor.removeState(state.id);win.drawActorPanelRow=original;done(result);
            },700);
        `);
        assert.ok(liveParts.draws>0,'variable/state changes repaint without moving selection');assert.ok(liveParts.icons.length>0);assert.equal(liveParts.states,true);assert.equal(liveParts.rate,.25);
        console.log('Live custom gauge and actor States refresh passed');
        const command = async (type, sceneName) => {
            const point = await driver.execute(`
                const scene=SceneManager._scene;
                const win=scene._nodeWindows.find(w=>w.node().action?.type===arguments[0] && (!arguments[1] || w.node().action.scene===arguments[1]));
                if(!win || !win.isEnabled()) throw Error('Command disabled: '+arguments[0]+'/'+arguments[1]+' '+JSON.stringify(scene._nodeWindows.filter(w=>w.node().type==='button').map(w=>({text:w.node().text,action:w.node().action,enabled:w.isEnabled()}))));
                const p=win.toGlobal(new Point(win.width/2,win.height/2));
                const canvas=Graphics._canvas.getBoundingClientRect();
                return {x:Math.round(canvas.left+p.x*canvas.width/Graphics.width),y:Math.round(canvas.top+p.y*canvas.height/Graphics.height),hit:win.containsPoint(p.x,p.y)};
            `,[type,sceneName||'']);
            assert.equal(point.hit,true,'Pointer hit testing uses the rendered window position');
            await driver.sessionRequest('POST','/actions',{actions:[{type:'pointer',id:'mouse',parameters:{pointerType:'mouse'},actions:[
                {type:'pointerMove',duration:0,x:point.x,y:point.y},{type:'pointerDown',button:0},{type:'pause',duration:60},{type:'pointerUp',button:0}
            ]}]});
        };
        const key = async name => {
            await driver.executeAsync(`const done=arguments[arguments.length-1], key=arguments[0]; Input._currentState[key]=true; setTimeout(()=>{Input._currentState[key]=false; setTimeout(done,80);},60);`,[name]);
        };
        assert.equal(await driver.execute(`
            const node=ReactorUI.normalizeNode({type:'gauge',gauge:'exp',width:300,height:32,label:'\\\\i[305] Knowledge'});
            const gauge=new (ReactorUI.gaugeSpriteClass())(node);
            gauge.setup($gameParty.members()[0],'exp');
            const renderer=ReactorUI.gaugeLabelRenderer(gauge), original=renderer.processDrawIcon;
            let icons=0;
            renderer.processDrawIcon=function(...args){icons++;return original.apply(this,args);};
            gauge.drawLabel(); node.label='\\\\I[305] Knowledge'; gauge.drawLabel();
            gauge.destroy(); return icons;
        `),2,'Gauge labels render both lowercase and uppercase icon codes');
        assert.equal(await driver.execute(`
            const sheet=new Bitmap(512,64); sheet.fillAll('#ffffff');
            sheet.clearRect(32,32,32,32); sheet.fillRect(36,36,24,24,'#c02020');
            const output=new Bitmap(40,40);
            const whitePixels=()=>{
                const p=output.context.getImageData(0,0,40,40).data;
                let count=0; for(let i=0;i<p.length;i+=4) if(p[i+3] && p[i]>220 && p[i+1]>220 && p[i+2]>220) count++;
                return count;
            };
            output.blt(sheet,32,32,32,32,2.4,2.4);
            if(!whitePixels()) throw Error('Fixture must reproduce fractional atlas bleed');
            output.clear();
            const load=ImageManager.loadSystem;
            ImageManager.loadSystem=function(name){return name==='IconSet'?sheet:load.call(this,name);};
            let count;
            try {
                ReactorUI.drawWindowIcon.call({contents:output},17,2.4,2.4);
                count=whitePixels(); output.clear();
                const gauge={bitmap:output,textHeight:()=>31.2};
                ReactorUI.gaugeLabelRenderer(gauge).processDrawIcon(17,{drawing:true,x:0.4,y:0.4});
                count+=whitePixels();
            } finally { ImageManager.loadSystem=load; ReactorUI.iconBitmap(sheet,17).destroy(); sheet.destroy(); output.destroy(); }
            return count;
        `),0,'Window and gauge icons exclude neighboring white atlas pixels');
        await command('formation');
        await driver.waitForScript('return !!SceneManager._scene._actorSelection && SceneManager._scene.focusedWindow().active;',[],{timeout:10000});
        const beforeOrder=await driver.execute('return $gameParty.members().map(a=>a.actorId());');
        await key('ok');
        assert.equal(await driver.execute('return !!SceneManager._scene._actorSelection.pending;'),true);
        await key('down');await key('ok');
        assert.deepEqual(await driver.execute('return $gameParty.members().map(a=>a.actorId());'),[beforeOrder[1],beforeOrder[0],...beforeOrder.slice(2)]);
        await key('ok');await key('up');await key('ok');
        assert.deepEqual(await driver.execute('return $gameParty.members().map(a=>a.actorId());'),beforeOrder);
        await key('ok');await key('cancel');
        assert.equal(await driver.execute('return !!SceneManager._scene._actorSelection && !SceneManager._scene._actorSelection.pending;'),true);
        await key('cancel');
        assert.equal(await driver.execute('return !SceneManager._scene._actorSelection;'),true);
        console.log('Formation swap and two-stage cancel passed');
        const windowCount = await driver.execute('return SceneManager._scene._nodeWindows.length;');
        await command('personalEquip');
        await driver.waitForScript('return !!SceneManager._scene._actorSelection && SceneManager._scene.focusedWindow().active;',[],{timeout:10000});
        assert.equal(await driver.execute('return SceneManager._scene._nodeWindows.length;'),windowCount, 'Actor selection adds no second list');
        assert.equal(await driver.execute('return SceneManager._scene.focusedWindow().node().rowLayout;'),'actorPanel');
        assert.ok(await driver.execute('return SceneManager._scene.focusedWindow()._cursorRect.height >= 180;'),'Portrait and stats share the selection highlight');
        await key('down');
        const chosen=await driver.execute('return SceneManager._scene.focusedWindow().selectedRow().id;');
        fs.writeFileSync('/tmp/rr-ui-actor-panel-game.png',Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
        await key('ok');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_Equip && SceneManager._scene.isActive();',[],{timeout:10000});
        assert.equal(await driver.execute('return $gameParty.menuActor().actorId();'),chosen);
        await key('cancel');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_ReactorUI && SceneManager._scene.acceptsInput();',[],{timeout:10000});
        assert.equal(await driver.execute('return SceneManager._scene.focusedWindow().node().action.type;'),'personalEquip');
        await command('personalSkill');
        await driver.waitForScript('return !!SceneManager._scene._actorSelection;',[],{timeout:10000});
        await key('cancel');
        assert.equal(await driver.execute('return SceneManager._scene instanceof Scene_ReactorUI && !SceneManager._scene._actorSelection && !SceneManager._scene._closing;'),true);
        console.log('Equipment choice and Skill cancel passed');
        await command('pluginScene');
        await driver.waitForScript('return !!SceneManager._scene._actorSelection && SceneManager._scene.focusedWindow().active;',[],{timeout:10000});
        const pluginActor=await driver.execute('return SceneManager._scene.focusedWindow().selectedRow().id;');
        await key('ok');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_SkillTree && SceneManager._scene.isActive();',[],{timeout:20000});
        assert.equal(await driver.execute('return SceneManager._scene._actorId;'),pluginActor);
        await key('cancel');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_ReactorUI && SceneManager._scene.acceptsInput();',[],{timeout:10000});
        assert.equal(await driver.execute('return SceneManager._scene.focusedWindow().node().action.type;'),'pluginScene');
        console.log('Actual Demo skill-tree plugin scene, selected actor and return passed');
        await command('scene','options');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_Options && SceneManager._scene.isActive();',[],{timeout:10000});
        await key('cancel');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_ReactorUI && SceneManager._scene.acceptsInput();',[],{timeout:10000});
        console.log('Options and return passed');
        await command('scene','item');
        await driver.waitForScript('return !!SceneManager._scene._actorSelection && SceneManager._scene.focusedWindow().active;',[],{timeout:10000});
        await key('ok');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_Item;',[],{timeout:10000});
        await key('cancel');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_ReactorUI && SceneManager._scene.acceptsInput();',[],{timeout:10000});
        await command('scene','save');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_Save && SceneManager._scene.isActive();',[],{timeout:10000});
        await key('cancel');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_ReactorUI && SceneManager._scene.acceptsInput();',[],{timeout:10000});
        await command('personalSkill');
        await driver.waitForScript('return !!SceneManager._scene._actorSelection && SceneManager._scene.focusedWindow().active;',[],{timeout:10000});
        assert.equal(await driver.execute('return SceneManager._scene.focusedWindow().node().rowLayout;'),'actorPanel');
        if(await driver.execute('return SceneManager._scene.focusedWindow().index() > 0;')) await key('up');
        await key('ok');
        await driver.waitForScript('return SceneManager._scene instanceof Scene_Skill;',[],{timeout:10000});
        assert.equal(await driver.execute('return $gameParty.menuActor().name();'),party[0].name);
        console.log('Interaction smoke passed: multi-select, group drag/undo, integrated portrait selection/return/cancel, mouse commands, Options and Items.');
    } catch (error) {
        try { console.log(await driver.execute('return {scene:SceneManager?._scene?.constructor?.name,role:SceneManager?._scene?._role,error:document.body.innerText};')); } catch (_) {}
        throw error;
    } finally {
        await driver.close();
        fs.rmSync(temp, { recursive: true, force: true });
    }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
