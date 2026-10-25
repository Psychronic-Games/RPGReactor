'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { boardWorld, motorcycle, bike, event } = require('./helpers/vehicles-board-world.cjs');
const { runtimeRoot } = require('./helpers/runtime-source.cjs');
const R = require(require('node:path').join(runtimeRoot, 'reactor_3d.js'));
const EventManager = require('../src/EventManager.js');
const MapEditor3D = require('../src/MapEditor3D.js');
const setup = require('../src/event/VehicleSetup.js');
const copy = value => JSON.parse(JSON.stringify(value));
const types = () => [null, motorcycle({classId:1,startMapId:1,startX:10,startY:10,startDirection:6,sheet:{characterName:'Vehicle',characterIndex:0}})];
function transfer(w, mapId, data, x=20,y=10) {
    w.$gamePlayer.reserveTransfer(mapId,x,y,6,0);
    w.$dataMap=copy(data); w.$gamePlayer.performTransfer(); w.V.resume();
}

for (const flat of [true,false]) {
    test(`database vehicle starts independently, travels, parks and survives saves in ${flat?'2D':'3D'}`, () => {
        const w=boardWorld({types:types(),events:[event(1,3,3)],flat});
        const home=copy(w.$dataMap), away=copy(home); away.events=[null,event(1,4,4)];
        const vehicle=w.V.find('0:1');
        assert.ok(vehicle);
        const battler=w.V.battler('0:1');battler.gainHp(-10);const hp=battler.hp;
        assert.deepEqual([vehicle._realX,vehicle._realY,vehicle.direction()],[10,10,6]);
        assert.equal(w.$gameMap.event(1).event().name,home.events[1].name,'authored events retain their IDs');
        w.stand(11,10,4); assert.equal(w.V.getOn(vehicle,{instant:true}),true);
        transfer(w,2,away);
        assert.equal(w.V.idOf(w.V.ridden()),'0:1');
        assert.equal(w.V.getOff({instant:true}),true);
        w.saveAndLoad();w.V.resume();
        assert.equal(w.V.battler('0:1').hp,hp,'the same vehicle keeps its condition after travel and saving');
        assert.equal(w.V.find('0:1')._realX,20);
        transfer(w,1,home);
        assert.equal(w.V.find('0:1'),null,'no duplicate at the starting position');
        transfer(w,2,away);
        assert.equal(w.V.list().filter(e=>w.V.isVehicle(e)).length,1);
        const parked=w.V.find('0:1');
        w.stand(parked._x-1,parked._y,6);assert.equal(w.V.getOn(parked,{instant:true}),true);
        transfer(w,1,home,25,15);
        assert.equal(w.V.idOf(w.V.ridden()),'0:1');
        assert.deepEqual([w.V.ridden()._realX,w.V.ridden()._realY],[25,15]);
        assert.equal(w.V.list().filter(e=>w.V.isVehicle(e)).length,1);
    });
}

test('an unplaced database vehicle creates nothing; legacy vehicle events still board', () => {
    const w=boardWorld({types:[null,motorcycle()],vehicles:[bike(31,10,10)]});
    assert.equal(w.V.find('0:1'),null);
    w.stand(11,10,4);assert.equal(w.board(31),true);
});

test('legacy map setup remains valid without the optional vehicle model module', () => {
    const w=boardWorld({vehicles:[bike(31,10,10)],before:w=>{delete w.Reactor3D.Vehicles;}});
    assert.ok(w.V.find('1:31'));assert.equal(w.V.find('0:1'),null);
});

test('parking on the starting map persists, repeated setup does not accumulate vehicles, removal stays removed', () => {
    const w=boardWorld({types:types()}),home=copy(w.$dataMap),away=copy(home);away.events=[null];
    w.V.setLocation('0:1',15,12,90);
    transfer(w,2,away);transfer(w,1,home);
    assert.deepEqual([w.V.find('0:1')._realX,w.V.find('0:1')._realY],[15,12]);
    for(let i=0;i<4;i++) w.$gameMap.setup(1);
    assert.equal(w.V.list().filter(e=>w.V.isVehicle(e)).length,1);
    assert.ok(w.$dataMap.events.length<=home.events.length);
    assert.equal(w.V.remove('0:1'),true);
    transfer(w,2,away);transfer(w,1,home);
    assert.equal(w.V.find('0:1'),null);
});

test('starting placements validate coordinates and do not mutate their records', () => {
    const catalog=types(),before=copy(catalog);
    const placed=R.Vehicles.startingEvents(catalog,1,40);
    assert.deepEqual([placed[0].id,placed[0]._rrVehicleIdentity,placed[0].rrVehicle.yaw],[40,'0:1',90]);
    assert.deepEqual(catalog,before);
    assert.deepEqual(R.Vehicles.startingEvents(catalog,2),[]);
    catalog[1].startX=-1;assert.deepEqual(R.Vehicles.startingEvents(catalog,1),[]);
    catalog[1].startX=1.5;assert.deepEqual(R.Vehicles.startingEvents(catalog,1),[]);
    const w=boardWorld({types:[null,motorcycle({startMapId:1,startX:999,startY:10})]});
    assert.equal(w.V.find('0:1'),null);
});

test('both editor views share independent placements and update after location and appearance changes', () => {
    const catalog=types(),map={id:1,width:40,height:30,events:[null,event(1,3,3)]};
    const before=copy(map),catalogBefore=copy(catalog);
    const previous={window:global.window,Reactor3D:global.Reactor3D,EventManager:global.EventManager,RRVehicles:global.RRVehicles};
    global.window={reactor:{databaseManager:{data:{vehicles:catalog}}}};
    global.Reactor3D=R;global.EventManager=EventManager;global.RRVehicles=setup;
    try {
        const preview=EventManager.startingVehicles(map)[0];
        assert.ok(preview.id<0);
        assert.equal(MapEditor3D.previewPageIndex(map,preview),0);
        assert.deepEqual(MapEditor3D.previewEvents(map),EventManager.mapPreviewEvents(map));
        assert.equal(MapEditor3D.previewModelSpec(map,preview,0).name,catalog[1].model.name);
        const editor=Object.create(EventManager.prototype);editor.currentMap=map;
        assert.equal(editor.modelPreviewProps().length,1);
        assert.ok(editor.modelPreviewProps()[0].id<0,'model previews cannot collide with placed props');
        const view=Object.create(MapEditor3D.prototype);
        const first=view._eventIdentity(preview,map);
        catalog[1].model.size=8;
        assert.notEqual(view._eventIdentity(EventManager.startingVehicles(map)[0],map),first);
        assert.deepEqual(map,before);assert.deepEqual(catalogBefore[1].startX,catalog[1].startX);
        catalog[1].startMapId=2;
        assert.equal(EventManager.startingVehicles(map).length,0);
        assert.equal(EventManager.startingVehicles({...map,id:2}).length,1);
        catalog[1].startMapId=0;assert.equal(editor.modelPreviewProps().length,0);
    } finally { Object.assign(global,previous); }
});

test('database placements render their inherited sprite in 2D and load that sheet for 3D', async () => {
    const catalog=types();catalog[1].graphic3d=false;
    const map={id:1,width:40,height:30,events:[null]};
    const previous={window:global.window,Reactor3D:global.Reactor3D,EventManager:global.EventManager,
        RRVehicles:global.RRVehicles,PIXI:global.PIXI,Image:global.Image,RRAssetFiles:global.RRAssetFiles};
    global.window={reactor:{databaseManager:{data:{vehicles:catalog}}}};
    global.Reactor3D=R;global.EventManager=EventManager;global.RRVehicles=setup;
    global.PIXI={Sprite:class { constructor(texture) { this.texture=texture;this.anchor={set(){}}; } }};
    global.RRAssetFiles={imageUrlFor:(dir,name)=>dir+'/'+name};
    const images=[];
    global.Image=class { set src(value) { images.push(value);this.width=144;this.height=192;this.onload(); } };
    try {
        const vehicle=EventManager.startingVehicles(map)[0];
        const editor=Object.create(EventManager.prototype);
        editor.currentMap=map;editor.unitLook=()=>null;editor.tilemapManager={TILE_WIDTH:48,TILE_HEIGHT:48};
        let image;
        editor.characterFrame=value=>{image=value;return {texture:'frame'};};
        const sprite=editor.createEventPreviewSprite(vehicle,vehicle.pages[0]);
        assert.equal(image.characterName,'Vehicle');assert.equal(image.direction,6);
        assert.equal(sprite.texture,'frame');assert.equal(sprite.x,10.5*48);
        const view=Object.create(MapEditor3D.prototype);view.projectPath=()=>'/project';view.path=require('node:path');
        const sheets=await view.loadCharacterSheets(map);
        assert.equal(sheets.Vehicle.width,144);assert.deepEqual(images,['/project/img/characters/Vehicle']);
        assert.deepEqual(map.events,[null]);
    } finally { Object.assign(global,previous); }
});

test('opening a placement selects its database entry instead of creating a map event', () => {
    const catalog=types(),map={id:1,width:40,height:30,events:[null]},opened=[];
    const previous={window:global.window,Reactor3D:global.Reactor3D};
    global.window={reactor:{databaseManager:{data:{vehicles:catalog}},openDatabase:type=>opened.push(type),
        databaseEditorUI:{navigateToDatabaseEntry:(type,id)=>opened.push([type,id])}}};
    global.Reactor3D=R;
    try {
        const editor=Object.create(EventManager.prototype);editor.currentMap=map;editor.eventMode=true;
        editor.createNewEvent=()=>assert.fail('a vehicle is not an authored event');
        assert.equal(editor.activateEventAt(10,10),true);
        assert.deepEqual(opened,['vehicles',['vehicles',1]]);assert.deepEqual(map.events,[null]);
    } finally { Object.assign(global,previous); }
});

test('3D placement activation opens Vehicles and clears ordinary event selection without editing map data', () => {
    const map={id:1,width:40,height:30,events:[null]},catalog=types(),opened=[];
    const previous={window:global.window,Reactor3D:global.Reactor3D,EventManager:global.EventManager};
    global.window={reactor:{databaseManager:{data:{vehicles:catalog}},openDatabase:type=>opened.push(type),
        databaseEditorUI:{navigateToDatabaseEntry:(type,id)=>opened.push([type,id])}}};
    global.Reactor3D=R;global.EventManager=EventManager;
    try {
        const picked=EventManager.startingVehicles(map)[0],view=Object.create(MapEditor3D.prototype);
        view.canSelectEvents=()=>true;view.canEditPieces=()=>false;view.canEditTerrain=()=>false;view.canEditProps=()=>false;
        view.eventAt=()=>({userData:{event:picked}});view.select=()=>picked;
        view.onEventActivated=()=>assert.fail('a placement must not open an Event Editor');
        view.onEventSelected=event=>assert.equal(event,null,'old event selection is cleared');
        view.handleClick(0,0);view.handleDoubleClick({clientX:0,clientY:0,preventDefault(){}});
        assert.deepEqual(opened,['vehicles',['vehicles',1]]);assert.deepEqual(map.events,[null]);
        view.dragEventTo({userData:{event:picked}},{x:15,y:15});assert.equal(picked.x,10);
    } finally { Object.assign(global,previous); }
});

test('vehicle validation counts database placements and reports invalid map coordinates in the catalog', () => {
    const check=require('../src/utils/VehicleCheck.js');
    const catalog=types(),project={types:catalog,maps:[{id:1,width:40,height:30,events:[null]}]};
    const lookups={Reactor3D:R};
    assert.equal(check.placed(project,lookups).length,1);
    assert.equal(check.problems(project,lookups).vehicles.length,1);
    catalog[1].startX=99;
    const line=check.problems(project,lookups).lines.find(line=>line.path==='[1].startX');
    assert.equal(line.file,'data/ReactorVehicles.json');assert.equal(line.level,'fix');
    catalog[1].startMapId=99;
    assert.ok(check.problems(project,lookups).lines.some(line=>line.path==='[1].startMapId'));
});

test('map previews resolve the vehicle rules when the app hands over its bare project manager', () => {
    const previous={window:global.window,Reactor3D:global.Reactor3D,EventManager:global.EventManager,DatabaseVehicleEditor:global.DatabaseVehicleEditor};
    const VehicleEditor=require('../src/database/DatabaseVehicleEditor.js'),cached=VehicleEditor._rules;
    VehicleEditor._rules=null;
    // main.js keeps a ProjectManager there: it knows the runtime folder and has no current project.
    global.window={reactor:{databaseManager:{data:{vehicles:types()}},projectManager:{getRuntimePath:()=>runtimeRoot}}};
    global.EventManager=EventManager;global.DatabaseVehicleEditor=VehicleEditor;
    try {
        const placed=EventManager.startingVehicles({id:1,width:40,height:30,events:[null]});
        assert.deepEqual(placed.map(event=>[event.x,event.y]),[[10,10]]);
    } finally {
        VehicleEditor._rules=cached;
        for(const [key,value] of Object.entries(previous))if(value===undefined)delete global[key];else global[key]=value;
    }
});

test('an event with the Vehicle field and no picture of its own draws its vehicle model on the 2D map', () => {
    const catalog=types(),vehicleEvent={...event(2,6,6),rrVehicle:{type:1}};
    vehicleEvent.pages[0].image={tileId:0,characterName:'',direction:2,pattern:0,characterIndex:0};
    const map={id:2,width:40,height:30,events:[null,null,vehicleEvent]};
    const previous={window:global.window,Reactor3D:global.Reactor3D,EventManager:global.EventManager,RRVehicles:global.RRVehicles};
    global.window={reactor:{databaseManager:{data:{vehicles:catalog}}}};
    global.Reactor3D=R;global.EventManager=EventManager;global.RRVehicles=setup;
    try {
        const editor=Object.create(EventManager.prototype);editor.currentMap=map;editor.unitLook=()=>null;
        const previews=editor.modelPreviewProps();
        assert.deepEqual(previews.map(p=>[p.name,p.x,p.y]),[[catalog[1].model.name,6,6]],'the 2D view draws what the 3D view and the game show');
        assert.deepEqual(previews[0].vehicle,{type:1,yaw:180},'drawn at its heading along the model\'s front, as the 3D view poses it');
        assert.equal(MapEditor3D.previewModelSpec(map,vehicleEvent,0).name,previews[0].name);
        map.events.push(null);catalog[1].startMapId=2;catalog[1].startX=12;catalog[1].startY=4;catalog[1].startDirection=6;
        assert.deepEqual(editor.modelPreviewProps().map(p=>[p.x,p.y,p.vehicle&&p.vehicle.yaw]),[[6,6,180],[12,4,90]],'a starting position faces its Direction');
        vehicleEvent.pages[0].image.characterName='Actor1';
        assert.equal(editor.previewModelRaw(vehicleEvent,0),null,'a page with a picture of its own keeps it');
    } finally { for(const [key,value] of Object.entries(previous))if(value===undefined)delete global[key];else global[key]=value; }
});
