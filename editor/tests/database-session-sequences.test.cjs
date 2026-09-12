const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = file => fs.readFileSync(path.join(__dirname,'../src',file),'utf8');
function fixture() {
    const elements = Object.fromEntries(['database-viewer','database-detail','database-close-btn','database-ok-btn','database-cancel-btn','database-apply-btn'].map(id=>[id,{style:{},innerHTML:'old detail',classList:{remove(){}},querySelectorAll:()=>[]} ]));
    const alerts=[];
    const sandbox={window:{},document:{getElementById:id=>elements[id],removeEventListener(){}},console:{error(){}},alert:x=>alerts.push(x),setTimeout};
    const Editor=vm.runInNewContext(source('DatabaseEditorUI.js')+'\nDatabaseEditorUI',sandbox);
    const editor=Object.create(Editor.prototype);
    Object.assign(editor,{currentProject:{path:'/project-A'},databaseManager:{data:{actors:[null,{id:1,name:'Original',traits:[]}]},dataGeneration:1},callbacks:{},_detailGeneration:0,_listGeneration:0,updateStatus(){}});
    editor.setupDatabaseControls();return {editor,elements,alerts,sandbox};
}
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

test('every detail boundary releases previews, listeners, overlays and outstanding contexts',()=>{
    const {editor,elements}=fixture(),calls=[];
    editor.animationEditor={_previewSetupGeneration:1,_currentEffekseerStop:()=>calls.push('stop'),_runDetailCleanups:()=>calls.push('animation')};
    editor.userInterfaceEditor={detach:()=>calls.push('interface')};
    editor.reactor3dEditor={_disposePreview:()=>calls.push('3d'),_detail:{}};
    editor._textCodeDetach=()=>calls.push('text');
    const modal={isConnected:true,remove(){this.isConnected=false;calls.push('modal');}};
    const current=editor.registerDetailModal(modal);
    assert.equal(current(),true);editor.cleanupDatabaseDetail();
    assert.equal(current(),false);assert.equal(modal.inert,true);
    assert.deepEqual(calls,['text','modal','stop','animation','interface','3d']);
    assert.equal(elements['database-detail'].innerHTML,'');
    assert.equal(editor.reactor3dEditor._detail,null);
    assert.equal(editor.animationEditor._previewSetupGeneration,2);
});

for(const action of ['ok','apply']) {
    test(`${action}: controls and navigation stay frozen until the save settles`,async()=>{
        const {editor,elements}=fixture(),save=deferred();editor.callbacks.saveProject=()=>save.promise;
        const pending=elements[`database-${action}-btn`].onclick();
        assert.equal(elements['database-viewer'].inert,true);
        const generation=editor._detailGeneration;
        editor.openDatabase('items');editor.showDatabaseDetail({id:1},'items');
        assert.equal(editor._detailGeneration,generation);
        save.resolve(true);await pending;
        assert.equal(elements['database-viewer'].inert,false);
        assert.equal(editor._databaseSaveInFlight,false);
    });
    test(`${action}: an old project's save cannot close, unlock or replace a new session's baseline`,async()=>{
        const {editor,elements}=fixture(),old=deferred(),next=deferred();
        editor.callbacks.saveProject=()=>old.promise;
        const pending=elements[`database-${action}-btn`].onclick();
        editor.setCurrentProject({path:'/project-B'});
        editor.databaseManager.data={actors:[null,{id:1,name:'Project B'}]};editor.takeDatabaseSnapshot();
        const baseline=editor._dataSnapshot;
        editor.callbacks.saveProject=()=>next.promise;
        const newSave=elements['database-apply-btn'].onclick();
        old.resolve(true);await pending;
        assert.equal(editor._dataSnapshot,baseline);assert.equal(editor._databaseSaveInFlight,true);
        assert.equal(elements['database-viewer'].inert,true);
        next.resolve(true);await newSave;assert.equal(editor._databaseSaveInFlight,false);
    });
}

test('Cancel invalidates an in-flight row paste before it can restore a cancelled draft',async()=>{
    const {editor}=fixture();
    const Row=vm.runInNewContext(source('database/DatabaseRowClipboard.js')+'\nDatabaseRowClipboard',{});
    const projectManager={getCurrentProject:()=>editor.currentProject};
    editor.takeDatabaseSnapshot();const actor=editor.databaseManager.data.actors[1];
    const target=Row.capturePasteTarget(editor,projectManager,editor.databaseManager,actor.traits);
    actor.name='Cancelled';editor.revertDatabaseSnapshot();editor.closeDatabaseViewer();
    assert.equal(Row.isPasteTargetCurrent(target,editor,projectManager,editor.databaseManager,actor.traits),false);
    assert.equal(editor.databaseManager.data.actors[1].name,'Original');
});

test('switching projects drops the previous Cancel baseline',()=>{
    const {editor}=fixture();editor.takeDatabaseSnapshot();editor.setCurrentProject({path:'/project-B'});
    editor.databaseManager.data={actors:[null,{id:1,name:'B'}]};editor.takeDatabaseSnapshot();
    editor.databaseManager.data.actors[1].name='Edit';editor.revertDatabaseSnapshot();
    assert.equal(editor.databaseManager.data.actors[1].name,'B');
});

test('model templates and thumbnails with identical names are isolated by project',()=>{
    const Model=require('../src/database/Database3DEditor.js');let project={path:'/A'};
    const editor=new Model({}, {getCurrentProject:()=>project});editor._ensureProjectCaches();
    editor._templates={Hero:{from:'A'}};editor._thumbs={Hero:'A.png'};editor._thumbPromises={Hero:Promise.resolve('A.png')};editor.selectedName='Hero';
    project={path:'/B'};editor._ensureProjectCaches();
    assert.deepEqual(editor._templates,{});assert.deepEqual(editor._thumbs,{});assert.deepEqual(editor._thumbPromises,{});assert.equal(editor.selectedName,'');
});

test('an old thumbnail completion cannot populate or delete a new project cache',async()=>{
    const Bindings=require('../src/database/Database3DBindings.js');let project={path:'/A'};
    const old=deferred(),next=deferred();let render=()=>old.promise;
    const ed={_project:()=>project,_renderThumbnail:()=>render(),projectController:{mapEditor3D:{}}};
    const pendingA=Bindings.modelThumbnail(ed,{name:'Hero'});
    project={path:'/B'};ed._thumbs={};ed._thumbPromises={};render=()=>next.promise;
    const pendingB=Bindings.modelThumbnail(ed,{name:'Hero'});
    old.resolve('A.png');assert.equal(await pendingA,null);
    assert.equal(ed._thumbPromises.Hero,pendingB);assert.equal(ed._thumbs.Hero,undefined);
    next.resolve('B.png');assert.equal(await pendingB,'B.png');assert.equal(ed._thumbs.Hero,'B.png');
});

test('slow tileset loads cannot replace a newer tab or paint after leaving the detail',()=>{
    const images=[],container={isConnected:true,innerHTML:'',classList:{toggle(){}},appendChild(){throw new Error('stale canvas attached');}};
    const sandbox={window:{},console:{debug(){},error(){}},rrEscapeHtml:String,
        document:{getElementById:()=>container,createElement:()=>({style:{}})},
        Image:class {constructor(){images.push(this);}}};
    const Tileset=vm.runInNewContext(source('database/DatabaseTilesetEditor.js')+'\nDatabaseTilesetEditor',sandbox);
    const editor=Object.create(Tileset.prototype);let active=true;
    Object.assign(editor,{path,fs:{existsSync:()=>true},getProjectPath:()=>'/project',assetUrl:x=>x,
        parentEditor:{captureDetailContext:()=>()=>active},currentTileset:{tilesetNames:['A1','A2','','','','B']}});
    editor.renderTabPreview('A');const old=images.slice();
    editor.renderTabPreview('B');const latest=images.at(-1);
    latest.onerror();const current=container.innerHTML;assert.match(current,/B.png/);
    for(const img of old){img.onload();img.onerror();}
    assert.equal(container.innerHTML,current);assert.equal(editor.tabCanvases.length,0);
    editor.renderCompactTilesetCanvas('C',6);active=false;container.innerHTML='New detail';
    images.at(-1).onload();images.at(-1).onerror();assert.equal(container.innerHTML,'New detail');
});

test('late troop battleback and enemy loads cannot clear or populate the next preview',()=>{
    const images=[];let generation=1,draws=0;
    const Troop=vm.runInNewContext(source('database/DatabaseTroopEditor.js')+'\nDatabaseTroopEditor',{
        require,Image:class {constructor(){images.push(this);}},
        RRAssetFiles:{imageUrlFor:()=>'',findImage:()=>({absolutePath:'/enemy.png'}),toUrl:x=>x}});
    const editor=Object.create(Troop.prototype);
    Object.assign(editor,{projectManager:{getCurrentProject:()=>({path:'/project'})},
        parentEditor:{captureDetailContext:()=>{const at=generation;return ()=>at===generation;}},
        databaseManager:{getEnemies:()=>[{id:1,battlerName:'Enemy'}]},currentTroop:{members:[{enemyId:1}]},
        battleback1Name:'Field',battleback2Name:'',renderCanvas:()=>draws++});
    editor.loadAndRenderCanvas();const old=images.slice();generation++;
    editor.loadAndRenderCanvas();const currentBack=editor.battleback1Img,currentEnemy=editor.enemySpriteImages.Enemy;
    old[0].onerror();old[1].onload();
    assert.equal(editor.battleback1Img,currentBack);assert.equal(editor.enemySpriteImages.Enemy,currentEnemy);assert.equal(draws,0);
    images[2].onload();images[3].onload();assert.equal(draws,1);
});

for(const kind of ['common','troop']) test(`${kind} command dialog cannot write after its detail is retired`,()=>{
    let active=true,callback,writes=0;
    const common=kind==='common';const name=common?'DatabaseCommonEventEditor':'DatabaseTroopEditor';
    const Editor=vm.runInNewContext(source(`database/${name}.js`)+`\n${name}`,{
        window:{},PluginCommandEditor:class {},WaitCommandEditor:class {},document:{getElementById:()=>null}});
    const editor=Object.create(Editor.prototype),dialog={show:(command,cb)=>{callback=cb;}};
    const ECL=require('../src/event/EventCommandList.js');
    Object.assign(editor,{parentEditor:{captureDetailContext:()=>()=>active},
        _eventCommandListClass:()=>ECL,getEditor:()=>dialog,getCommandEditor:()=>dialog,
        persistEvent:()=>writes++,persistTroop:()=>writes++});
    const command=common?{code:230,indent:0,parameters:[60]}:{code:357,indent:0,parameters:['Example','Command','',{}]};
    const page={list:[command,{code:0,indent:0,parameters:[]}]};const before=JSON.stringify(page);
    if(common)editor.editCommand(0,page);else editor.editCommandSimple(command,0,page);
    active=false;callback(common?{...command,parameters:[120]}:[{...command,parameters:['Changed']}]);
    assert.equal(JSON.stringify(page),before);assert.equal(writes,0);
});

test('Effekseer texture callbacks cannot touch a released effect or WebGL context',()=>{
    let updates=0,loads=0,errors=0,cleared=0;
    const loader=vm.runInNewContext(source('database/DatabaseAnimationEditor.js')+'\nRR_loadEffekseerEffectFromFile',{
        require:name=>name==='fs'?{readFileSync:()=>Buffer.from([1])}:require(name),Buffer,
        setTimeout:()=>1,clearTimeout:()=>cleared++,console:{warn(){}}});
    let onLoad,onError;
    const context={nativeptr:1,loadEffect(bytes,scale,load,error){onLoad=load;onError=error;return {nativeptr:2,_update(){updates++;}};}};
    const effect=loader(context,'/effect.efkefc',1,()=>loads++,()=>errors++);
    effect._update();assert.equal(updates,1);onLoad();assert.equal(loads,1);
    context.nativeptr=null;effect._update();onLoad();onError();
    assert.equal(updates,1);assert.equal(loads,1);assert.equal(errors,0);assert.ok(cleared>0);
    context.nativeptr=1;effect.nativeptr=null;effect._update();assert.equal(updates,1);
});
