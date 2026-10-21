const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const elevation = require('../src/utils/MapElevation.js');
const plain = value => JSON.parse(JSON.stringify(value));
function load(name, globals = {}) {
    return vm.runInNewContext(`${fs.readFileSync(path.join(root, 'src', `${name}.js`), 'utf8')};${name};`, {
        console: { log() {}, debug() {}, warn() {}, error() {} }, require, process, nw: {},
        RRJson: require('../src/utils/JsonFiles.js'), alert() {}, confirm: () => true,
        // The editor's themed dialog: a notice goes to the test's `alert`, a question is answered by its `confirm` (yes unless a test says otherwise).
        RRDialog: require('./helpers/dialog-stub.cjs').themedDialogFrom({ confirm: () => true, ...globals }),
        localStorage: { getItem: () => null, setItem() {} }, ...globals
    });
}
function eventHarness(globals) {
    const Type = load('EventManager', globals), manager = Object.create(Type.prototype);
    manager.currentMap = { width: 10, height: 10, events: [null, { id: 1, name: 'Door', x: 1, y: 1, pages: [{}] }], reactor3d: { eventZ: { 1: 2.5 }, eventPreviews: { 1: 0 }, mediaSurfaces: [{ id: 9 }] } };
    Object.assign(manager, { undoStack: [], redoStack: [], maxUndoSteps: 50, notifyUndoStateChange() {}, renderEvents() {}, selectEvent(e) { this.selectedEvent = e; } });
    return manager;
}
test('event copy/paste and delete carry height and preview state without contaminating reused IDs', async () => {
    const manager = eventHarness();
    manager.copyEvent(manager.currentMap.events[1]);await manager.pasteEvent(2, 2);
    const clone = manager.currentMap.events[2];assert.ok(clone);
    assert.equal(manager.currentMap.reactor3d.eventZ[2], 2.5);
    assert.equal(manager.currentMap.reactor3d.eventPreviews[2], 0);
    manager.deleteEvent(clone);
    assert.equal(manager.currentMap.reactor3d.eventZ[2], undefined);
    assert.equal(manager.currentMap.reactor3d.eventPreviews[2], undefined);
    manager.undo();assert.equal(manager.currentMap.reactor3d.eventPreviews[2], 0);
    manager.redo();assert.equal(manager.currentMap.reactor3d.eventPreviews[2], undefined);
    assert.deepEqual(manager.currentMap.reactor3d.mediaSurfaces, [{ id: 9 }]);
});
test('event undo and redo rebind selection to the restored event rather than the detached object', () => {
    const manager = eventHarness(), old = manager.currentMap.events[1];
    manager.selectedEvent = old;manager.saveState();old.x = 4;old.y = 5;
    manager.undo();assert.equal(manager.selectedEvent, manager.currentMap.events[1]);
    assert.equal(manager.selectedTileX, 1);assert.equal(manager.selectedTileY, 1);
    manager.redo();assert.equal(manager.selectedEvent, manager.currentMap.events[1]);
    assert.equal(manager.selectedTileX, 4);assert.equal(manager.selectedTileY, 5);
});
test('a flat map whose only extra data is event height retains its sidecar on save', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-height-only-'));fs.mkdirSync(path.join(dir,'data'));
    try {
        const map = { id: 1, width: 2, height: 2, reactor3d: { eventZ: { 1: 2.5 } } };
        elevation.save(fs,path,dir,map);
        assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'data/Map001.r3d.json'),'utf8')).eventZ[1],2.5);
    } finally { fs.rmSync(dir,{recursive:true,force:true}); }
});
function mapHarness(t, globals = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-map-audit-'));fs.mkdirSync(path.join(dir, 'data'));
    t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    let clipboard;
    const statuses = [], alerts = [];
    const Type = load('ProjectController', { ReactorClipboard: { write: async (_type,payload) => { clipboard = { payload }; return true; }, read: async () => clipboard }, alert: m=>alerts.push(m), ...globals });
    const tileset = { id: 1, name: 'Test', tilesetNames: ['A'], flags: [0,1], mode: 0 };
    const db = { data: { tilesets: [null,tileset] }, getTileset(id) { return this.data.tilesets[id]; },getTilesets(){return this.data.tilesets.filter(Boolean);}, saveJSON: async ()=>true };
    const pc = new Type({ saveMapInfos: (project,maps) => { fs.writeFileSync(path.join(project,'data/MapInfos.json'),JSON.stringify(maps));return true; } },db,{updateStatus:s=>statuses.push(s)});
    pc.currentProject={path:dir,name:'Fixture',maps:[null,{id:1,name:'Original',parentId:0,order:1},{id:2,name:'Other',parentId:0,order:2}]};
    const map={width:2,height:2,data:Array(24).fill(0),events:[null],tilesetId:1,note:'<3d>'};
    const sidecar={version:1,mode:'3d',eventZ:{1:2},mediaSurfaces:[{id:1,movie:'existing.png'}],lighting:{ambient:0.5}};
    for(const id of [1,2])fs.writeFileSync(path.join(dir,`data/Map00${id}.json`),JSON.stringify(map));
    fs.writeFileSync(path.join(dir,'data/Map001.r3d.json'),JSON.stringify(sidecar));
    pc.tilemapManager={currentMap:{...plain(map),id:2},isMapDirty:()=>false};
    pc.renderMapsList=pc.renderQuickAccessList=pc.bumpVersionId=()=>{};
    return {pc,dir,map,sidecar,statuses,alerts,setClipboard:payload=>{clipboard={payload};},getClipboard:()=>clipboard};
}
test('copying an unopened map preserves its sidecar and pastes it separately from MV/MZ map JSON', async t => {
    const h=mapHarness(t);await h.pc.copyMap(1);await h.pc.pasteMap();
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(h.dir,'data/Map003.r3d.json'),'utf8')),h.sidecar);
    assert.equal(JSON.parse(fs.readFileSync(path.join(h.dir,'data/Map003.json'),'utf8')).reactor3d,undefined);
});
test('failed map metadata save rolls back a paste and reports failure', async t => {
    const h=mapHarness(t);await h.pc.copyMap(1);h.pc.projectManager.saveMapInfos=()=>false;await h.pc.pasteMap();
    assert.equal(fs.existsSync(path.join(h.dir,'data/Map003.json')),false);
    assert.equal(fs.existsSync(path.join(h.dir,'data/Map003.r3d.json')),false);
    assert.equal(h.pc.currentProject.maps[3],undefined);
    assert.equal(h.statuses.some(s=>s.startsWith('Pasted map')),false);assert.ok(h.alerts.length);
});
test('deleting a map removes its sidecar along with the map file', async t => {
    const h=mapHarness(t);await h.pc.deleteMap(1);
    assert.equal(fs.existsSync(path.join(h.dir,'data/Map001.r3d.json')),false);
    assert.equal(fs.existsSync(path.join(h.dir,'data/Map001.json')),false);
    assert.equal(fs.existsSync(path.join(h.dir,'data/Map002.json')),true);
});
test('an awaited map paste cannot write into a project opened while the clipboard was pending', async t => {
    let resolve;const pending=new Promise(r=>resolve=r);
    const h=mapHarness(t,{ReactorClipboard:{read:()=>pending}});
    const next={...h.pc.currentProject,maps:plain(h.pc.currentProject.maps)};
    const action=h.pc.pasteMap();h.pc.currentProject=next;resolve({payload:{mapData:h.map}});await action;
    assert.equal(fs.existsSync(path.join(h.dir,'data/Map003.json')),false);
    assert.equal(next.maps[3],undefined);
});
test('tileset import does not reuse a same-name tileset with different art or flags', async t => {
    const h=mapHarness(t),source={id:1,name:'Test',tilesetNames:['B'],flags:[0,7],mode:0};
    const id=await h.pc.importCopiedTileset(source);
    assert.notEqual(id,1);assert.deepEqual(plain(h.pc.databaseManager.data.tilesets[id].flags),[0,7]);
});
test('failed tileset import does not mutate the database or allow map paste to continue', async t => {
    const h=mapHarness(t);h.pc.databaseManager.saveJSON=async()=>false;
    await assert.rejects(h.pc.importCopiedTileset({id:2,name:'Other',tilesetNames:['B'],flags:[]}));
    assert.equal(h.pc.databaseManager.data.tilesets.length,2);
});
test('copying the loaded map preserves unsaved sidecar edits instead of reading the old file', async t => {
    const h=mapHarness(t);h.pc.tilemapManager.currentMap={...plain(h.map),id:1,reactor3d:{...h.sidecar,eventZ:{1:7}}};
    await h.pc.copyMap(1);await h.pc.pasteMap();
    assert.equal(JSON.parse(fs.readFileSync(path.join(h.dir,'data/Map003.r3d.json'),'utf8')).eventZ[1],7);
});
test('an unreadable source sidecar does not replace the previous map clipboard', async t => {
    const h=mapHarness(t);h.setClipboard({sentinel:true});fs.writeFileSync(path.join(h.dir,'data/Map001.r3d.json'),'{broken');
    await h.pc.copyMap(1);assert.equal(h.getClipboard().payload.sentinel,true);assert.ok(h.alerts.length);
});
test('a failed sidecar write rolls back the map copy before publishing metadata', async t => {
    const h=mapHarness(t);await h.pc.copyMap(1);const write=h.pc._writeFileAtomic;
    h.pc._writeFileAtomic=function(io,file,...args){if(file.endsWith('.r3d.json'))throw new Error('disk full');return write.call(this,io,file,...args);};
    await h.pc.pasteMap();assert.equal(fs.existsSync(path.join(h.dir,'data/Map003.json')),false);assert.equal(h.pc.currentProject.maps[3],undefined);
});
test('map ID allocation protects orphaned map and sidecar files from overwrite', async t => {
    const h=mapHarness(t);fs.writeFileSync(path.join(h.dir,'data/Map003.json'),'recover me');fs.writeFileSync(path.join(h.dir,'data/Map004.r3d.json'),'recover sidecar');
    assert.equal(h.pc.getNextAvailableMapId(),5);await h.pc.copyMap(1);await h.pc.pasteMap();
    assert.equal(fs.readFileSync(path.join(h.dir,'data/Map003.json'),'utf8'),'recover me');
    assert.equal(fs.readFileSync(path.join(h.dir,'data/Map004.r3d.json'),'utf8'),'recover sidecar');
    assert.ok(h.pc.currentProject.maps[5]);
});
test('a delete confirmation completing after a project switch cannot delete the next project map', async t => {
    const h=mapHarness(t);let resolve;h.pc.tilemapManager.currentMap.id=1;h.pc.confirmUnsavedChanges=()=>new Promise(r=>resolve=r);
    const next={...h.pc.currentProject,maps:plain(h.pc.currentProject.maps)},action=h.pc.deleteMap(1);
    // The delete question is answered first; the project changes while the unsaved-changes question is up.
    await new Promise(turn=>setImmediate(turn));
    h.pc.currentProject=next;resolve(true);await action;
    assert.ok(next.maps[1]);assert.equal(fs.existsSync(path.join(h.dir,'data/Map001.json')),true);
});
test('a tileset import finishing after a project switch cannot populate the next project database', async t => {
    const h=mapHarness(t);let resolve;h.pc.databaseManager.saveJSON=()=>new Promise(r=>resolve=r);
    const action=h.pc.importCopiedTileset({id:2,name:'Import',flags:[]});
    h.pc.currentProject={path:'/next',maps:[]};h.pc.databaseManager.data={tilesets:[null]};resolve(true);
    await assert.rejects(action,/Project changed/);assert.deepEqual(h.pc.databaseManager.data.tilesets,[null]);
});
test('legacy 2D event clipboard clears orphaned placement and model metadata on a reused ID', async () => {
    const manager=eventHarness({ReactorClipboard:{read:async()=>({payload:{event:{id:9,name:'Plain',pages:[{}]}}})}});
    manager.currentMap.reactor3d.events={2:{0:{name:'Old model'}}};manager.currentMap.reactor3d.eventZ[2]=20;manager.currentMap.reactor3d.eventPreviews[2]=3;
    await manager.pasteEvent(2,2);assert.equal(manager.currentMap.reactor3d.events,undefined);
    assert.equal(manager.currentMap.reactor3d.eventZ[2],undefined);assert.equal(manager.currentMap.reactor3d.eventPreviews[2],undefined);
});
test('failed starting-position repair leaves map metadata and the working System untouched', async t => {
    const h=mapHarness(t);h.pc.databaseManager.data.mapInfos=h.pc.currentProject.maps;
    h.pc.databaseManager.data.system={startMapId:1,startX:4,startY:5};h.pc.databaseManager.saveJSON=async()=>false;
    await h.pc.deleteMap(1);assert.ok(h.pc.currentProject.maps[1]);assert.ok(h.pc.databaseManager.data.mapInfos[1]);
    assert.deepEqual(plain(h.pc.databaseManager.data.system),{startMapId:1,startX:4,startY:5});
    assert.equal(fs.existsSync(path.join(h.dir,'data/Map001.json')),true);
});
test('a rejected map paste restores the database MapInfos alias as well as the project list', async t => {
    const h=mapHarness(t);h.pc.databaseManager.data.mapInfos=h.pc.currentProject.maps;
    await h.pc.copyMap(1);h.pc.projectManager.saveMapInfos=()=>false;await h.pc.pasteMap();
    assert.equal(h.pc.databaseManager.data.mapInfos,h.pc.currentProject.maps);assert.equal(h.pc.databaseManager.data.mapInfos[3],undefined);
});
test('project switching while deleted-map System repair is pending cannot delete the next project map', async t => {
    const h=mapHarness(t);h.pc.databaseManager.data.system={startMapId:1,startX:4,startY:5};
    let resolve;h.pc.databaseManager.saveJSON=()=>new Promise(r=>resolve=r);
    const old=h.pc.currentProject,next={...old,maps:plain(old.maps)};const action=h.pc.deleteMap(1);
    // The delete question is answered first; the project changes while the System repair is being saved.
    await new Promise(turn=>setImmediate(turn));
    h.pc.currentProject=next;h.pc.databaseManager.data={mapInfos:next.maps,system:{startMapId:1}};resolve(true);await action;
    assert.ok(next.maps[1]);assert.ok(old.maps[1]);assert.equal(fs.existsSync(path.join(h.dir,'data/Map001.json')),true);
});
test('failed deletion metadata save restores successfully repaired starting positions', async t => {
    const h=mapHarness(t);h.pc.databaseManager.data.mapInfos=h.pc.currentProject.maps;
    h.pc.databaseManager.data.system={startMapId:1,startX:4,startY:5};
    const writes=[];h.pc.databaseManager.saveJSON=async(_project,file,data)=>{writes.push({file,data:plain(data)});return true;};
    h.pc.projectManager.saveMapInfos=()=>false;await h.pc.deleteMap(1);
    assert.deepEqual(writes.map(w=>w.data.startMapId),[2,1]);
    assert.deepEqual(plain(h.pc.databaseManager.data.system),{startMapId:1,startX:4,startY:5});
    assert.equal(h.pc.databaseManager.data.mapInfos,h.pc.currentProject.maps);assert.ok(h.pc.currentProject.maps[1]);
});
