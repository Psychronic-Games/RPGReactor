const test=require('node:test');
const assert=require('node:assert/strict');
const EventManager=require('../src/EventManager.js');

test('only visible model-bound pages enter the live lighting renderer without changing authored props',()=>{
    const em=Object.create(EventManager.prototype);
    const page={image:{direction:6}};
    const map={events:[null,{id:1,x:2,y:3,pages:[page,page]},{id:2,x:5,y:6,pages:[page]}],reactor3d:{events:{1:{0:{name:'Old'},1:{name:'Model',scale:2}},2:{0:{name:'Second'}}},eventPreviews:{1:1},eventZ:{1:4},props:[{id:1,name:'Prop'}]}};
    em.currentMap=map;const before=JSON.stringify(map);
    const [record,second]=em.modelPreviewProps();
    assert.deepEqual(record,{id:-1,name:'Model',scale:2,size:2,x:2,y:3,z:4,direction:6});
    // A first page given a model stands as it without Preview Event, as in the game.
    assert.deepEqual(second,{id:-2,name:'Second',scale:1,size:2,x:5,y:6,z:0,direction:6});
    assert.equal(JSON.stringify(map),before);
    const names=()=>em.modelPreviewProps().map(prop=>prop.name);
    delete map.reactor3d.eventPreviews[1];assert.deepEqual(names(),['Old','Second']);
    map.reactor3d.eventPreviews[1]=9;assert.deepEqual(names(),['Old','Second']);
    // A page with no model of its own, chosen or first, has none to show.
    map.reactor3d.eventPreviews={2:0};delete map.reactor3d.events[2];map.reactor3d.events[1]={1:{name:'Model'}};assert.deepEqual(names(),[]);
});

test('an event standing as its model draws a faint square, so the model shows through it', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'src', 'EventManager.js'), 'utf8');
    assert.match(source, /const asModel = previewPage !== null && !!this\.previewModelRaw\(event, previewPage\)\?\.name;\s*container\._rrSquareAlpha = asModel \? 0\.15 : \(isDragging \? 0\.9 : 0\.75\);/);
    assert.match(source, /this\._drawEventSquare\(sprite\._rrSquare, isSelected, sprite\._rrSquareAlpha \?\? 0\.75\);/, 'and stays faint when selected');
});
