const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { createDocument } = require('./helpers/card-dom.cjs');
const RREquipSlots = require('../src/utils/EquipSlots.js');
const rrEscapeHtml = require('../src/utils/HtmlEscape.js');

function ui(vehicle, classEntry = null, settings = {}) {
    const { document, window, Element } = createDocument();
    Element.prototype.append = function(...children) { for (const child of children) this.appendChild(child); };
    Element.prototype.replaceChildren = function(...children) { this.innerHTML=''; for (const child of children) this.appendChild(child); };
    const pickers = [], dialogs = [];
    const context = vm.createContext({ document, window, require, process, console, structuredClone,
        rrEscapeHtml, RREquipSlots, RRVehicles: require('../src/event/VehicleSetup.js'), RRDatabase3DBindings: { decorateSlot: () => null },
        TransferPlayerEditor: class { showMapPicker(options) {
            pickers.push(options);
            const modal=document.createElement('div'),close=()=>modal.remove();
            return {modal,close};
        } },
        DatabaseTraitEditor: class {}, setTimeout: () => {} });
    const load = name => vm.runInContext(fs.readFileSync(path.join(__dirname, '../src/database', name + '.js'), 'utf8') + '\n' + name + ';', context);
    const Actor = load('DatabaseActorEditor'), Class = load('DatabaseClassEditor'), Vehicle = load('DatabaseVehicleEditor');
    // Keep the trait/skill modal bodies outside this equipment-rendering test.
    Actor.prototype.createTraitsSection = () => document.createElement('div');
    Class.prototype.createLearnableSkillsSection = () => {
        const section = document.createElement('div');
        section.innerHTML = '<div class="database-section-content"></div>';
        return section;
    };
    const weapons = [{ id: 7, name: 'Gun', etypeId: 1, wtypeId: 1, params: [], traits: [] }];
    const armors = [
        { id: 8, name: 'Armor', etypeId: 2, atypeId: 1, params: [], traits: [] },
        { id: 9, name: 'Wheels', etypeId: 3, atypeId: 2, params: [], traits: [] }
    ];
    const manager = { mutationGeneration: 0, getVehicle: () => vehicle, getClass: id => classEntry?.id === id ? classEntry : null,
        getClasses: () => classEntry ? [classEntry] : [], getSystem: () => settings.system || ({ equipTypes: ['', 'Gun', 'Armor', 'Wheels'] }),
        getMapInfos: () => [null,{id:1,name:'North Haven'}],
        getWeapons: () => weapons, getArmors: () => armors };
    const project = { getCurrentProject: () => ({ path: path.resolve(__dirname, '../../template/Demo') }) };
    const parent = { commonUI: {}, captureDetailContext: () => () => true, showDatabaseDetail: record => show(record),
        registerDetailModal: (modal,close) => dialogs.push({modal,close}) };
    const view = new Vehicle(manager, project, parent), container = document.createElement('div');
    document.body.appendChild(container);
    const show = record => settings.stockKey ? view.showStock(container,settings.stockKey) : view.show(container, record);
    show(vehicle);
    const rows = () => container.querySelectorAll('.vehicle-equip').map(select => ({ slot: Number(select.dataset.slot), value: Number(select.value), options: select.querySelectorAll('option').map(option => Number(option.value)) }));
    return { container, rows, view, manager, Class, document, show, pickers, dialogs };
}

const weapon = { code: 51, dataId: 1, value: 1 };
const armor = { code: 52, dataId: 1, value: 1 };
const dual = { code: 55, dataId: 1, value: 1 };
const bike = extras => ({ id: 1, name: 'Bike', kind: 'motorcycle', classId: 0, traits: [], equips: [], ...extras });

test('vehicle equipment shows class-permitted slots and hides unsupported and sealed slots', () => {
    const record = bike({ classId: 1, equips: [7, 8] });
    const cls = { id: 1, name: 'Pilot', traits: [weapon, armor], params: [] };
    const { rows, show, container } = ui(record, cls);
    assert.deepEqual(rows(), [{ slot: 0, value: 7, options: [0, 7] }, { slot: 1, value: 8, options: [0, 8] }]);
    cls.traits.push({ code: 54, dataId: 2, value: 1 });
    show(record);
    assert.deepEqual(rows().map(row => row.slot), [0]);
    assert.equal(container.querySelector('.vehicle-class-slot-rows'), null);
});

test('classless vehicle equipment derives permissions and Dual Wield from its own traits', () => {
    const record = bike({ traits: [weapon, dual], equips: [7, 7] });
    const { rows, container, manager } = ui(record);
    assert.deepEqual(rows(), [{ slot: 0, value: 7, options: [0, 7] }, { slot: 1, value: 7, options: [0, 7] }]);
    const select = container.querySelectorAll('.vehicle-equip')[1];
    select.value = '0';select.onchange({ target: select });
    assert.deepEqual(Array.from(record.equips), [7, 0]);
    assert.equal(manager.mutationGeneration, 1);
});

test('vehicle module slots preserve their equipment index when other slots are hidden', () => {
    const record = bike({ traits: [{ code: 52, dataId: 2, value: 1 }], equips: [0, 0, 9] });
    const { rows, show, container } = ui(record);
    assert.deepEqual(rows(), [{ slot: 2, value: 9, options: [0, 9] }]);
    record.traits=[];record.equips=[];show(record);
    assert.equal(rows().length, 0);
    assert.equal(container.querySelector('.vehicle-equipment-rows').textContent, 'No equipment slots available');
});

test('Classes renders its existing sections without a separate vehicle slots panel', () => {
    const { Class, document, manager } = ui(bike());
    const view = Object.create(Class.prototype);
    view.databaseManager=manager;
    for (const key of ['createGeneralSection','createParameterCurvesSection','createLearnableSkillsSection','createEquipSlotsSection','createTraitsSection','createNoteSection']) {
        view[key] = () => { const section=document.createElement('div'); section.textContent=key; return section; };
    }
    view.attachEventListeners=() => {};
    const host=document.createElement('div');
    view.showClassDetail(host, { id: 1 });
    assert.equal(host.querySelector('.vehicle-custom-slots'), null);
    assert.equal(host.querySelector('[data-section-key="vehicle-equipment-slots"]'), null);
    assert.ok(host.textContent.includes('createTraitsSection'));
});

test('a vehicle has a row for each copy of it: another is added unplaced, placed by its own picker, and deleted without touching the others', () => {
    const record=bike();
    const {container,pickers}=ui(record);
    assert.equal(container.querySelectorAll('.vehicle-location-row').length,1);
    container.querySelector('.vehicle-start-add').onclick();
    container.querySelector('.vehicle-start-add').onclick();
    assert.deepEqual(record.copies.map(copy=>[copy.id,copy.startMapId]),[[2,0],[3,0]]);
    let rows=container.querySelectorAll('.vehicle-location-row');
    assert.equal(rows.length,3);
    assert.deepEqual(Array.from(rows,row=>row.querySelector('.vehicle-start-number').textContent),['1','2','3']);
    rows[2].querySelector('.vehicle-location-browse').onclick();
    pickers[pickers.length-1].onConfirm({mapId:1,x:4,y:5});
    assert.deepEqual([record.startMapId||0,record.copies[0].startMapId,record.copies[1].startMapId,record.copies[1].startX,record.copies[1].startY],[0,0,1,4,5]);
    rows=container.querySelectorAll('.vehicle-location-row');
    assert.equal(rows[2].querySelector('.vehicle-location-browse').textContent,'North Haven (4, 5)');
    // The second is deleted: the third keeps its own number (what a save holds of it stays its own), and the next one added takes a new one.
    rows[1].querySelector('.vehicle-location-clear').onclick();
    assert.deepEqual(record.copies.map(copy=>copy.id),[3]);
    container.querySelector('.vehicle-start-add').onclick();
    assert.deepEqual(record.copies.map(copy=>copy.id),[3,4]);
});

test('vehicle position reuses the map picker, only writes on confirmation, and can be cleared', () => {
    const record=bike(),before=structuredClone(record);
    const {container,view,manager,pickers,dialogs}=ui(record);
    assert.deepEqual(record,before);
    assert.equal(container.querySelector('.vehicle-location-browse').textContent,'(None)');
    container.querySelector('.vehicle-location-browse').onclick();
    assert.equal(pickers.length,1);assert.equal(dialogs.length,1);
    assert.deepEqual(record,before,'opening a picker does not author a location');
    pickers[0].onConfirm({mapId:1,x:12,y:9});
    assert.deepEqual([record.startMapId,record.startX,record.startY],[1,12,9]);
    assert.equal(container.querySelector('.vehicle-location-browse').textContent,'North Haven (12, 9)');
    const direction=container.querySelector('.vehicle-start-direction');
    direction.value='6';direction.onchange({target:direction});assert.equal(record.startDirection,6);
    container.querySelector('.vehicle-location-clear').onclick();
    assert.equal(record.startMapId,0);assert.equal(manager.mutationGeneration,3);
    container.querySelector('.vehicle-location-browse').onclick();view.dispose();
    pickers[1].onConfirm({mapId:1,x:2,y:2});
    assert.equal(record.startMapId,0,'a retired database page cannot be changed by its picker');
});

test('native starting positions stay in System 1 without duplicate controls in Vehicles', () => {
    const system={equipTypes:['','Gun'],boat:{startMapId:1,startX:3,startY:4,characterName:''}};
    const before=structuredClone(system);
    const {container,manager}=ui(bike(),null,{system,stockKey:'boat'});
    assert.equal(container.querySelector('.vehicle-location-browse'),null);
    assert.deepEqual(system,before);assert.equal(manager.mutationGeneration,0);
});

test('the Event Editor renders its usual page controls without a Reactor Vehicle section', () => {
    const {document}=createDocument(), previous=global.document;
    global.document=document;
    try {
        const Page=require('../src/event/EventPageEditor.js'),view=Object.create(Page.prototype);
        const legacy={rrVehicle:{type:1,yaw:90}},before=structuredClone(legacy);
        view.parentEditor={currentEvent:legacy};
        view.createVehicleSection=()=>assert.fail('vehicle placement belongs to the database');
        for (const name of ['Conditions','Image','Movement','Options','Priority','Trigger']) {
            view['create'+name+'Section']=()=>{const section=document.createElement('div');section.textContent=name;return section;};
        }
        const container=document.createElement('div');view.renderPageConfiguration(container,{},0);
        for(const name of ['Conditions','Image','Movement','Options','Priority','Trigger']) assert.ok(container.textContent.includes(name));
        assert.equal(container.querySelector('.vehicle-section'),null);
        assert.deepEqual(legacy,before,'editing the page preserves older vehicle metadata');
    } finally {global.document=previous;}
});
