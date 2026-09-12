const test=require('node:test');
const assert=require('node:assert/strict');
const EventManager=require('../src/EventManager.js');

test('only visible model-bound pages enter the live lighting renderer without changing authored props',()=>{
    const em=Object.create(EventManager.prototype);
    const page={image:{direction:6}};
    const map={events:[null,{id:1,x:2,y:3,pages:[page,page]},{id:2,x:5,y:6,pages:[page]}],reactor3d:{events:{1:{0:{name:'Old'},1:{name:'Model',scale:2}},2:{0:{name:'Hidden'}}},eventPreviews:{1:1},eventZ:{1:4},props:[{id:1,name:'Prop'}]}};
    em.currentMap=map;const before=JSON.stringify(map);
    const [record]=em.modelPreviewProps();
    assert.deepEqual(record,{id:-1,name:'Model',scale:2,size:2,x:2,y:3,z:4,direction:6});
    assert.equal(JSON.stringify(map),before);
    delete map.reactor3d.eventPreviews[1];assert.deepEqual(em.modelPreviewProps(),[]);
    map.reactor3d.eventPreviews[1]=9;assert.deepEqual(em.modelPreviewProps(),[]);
});
