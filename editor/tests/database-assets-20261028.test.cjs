'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function load() {
    const c = { console, require, process, Buffer, setTimeout, clearTimeout, performance, module: {exports:{}}, document: {} };
    c.window = c; vm.createContext(c);
    for (const file of ['utils/MapElevation', 'utils/StructurePlan', 'utils/StructureFloors', 'BuildHotbar', 'StructureWorkshop', 'database/Database3DEditor', 'database/DatabaseStructureEditor']) {
        vm.runInContext(read('editor/src/' + file + '.js') + (/utils\//.test(file) ? '' : '\nglobalThis.' + file.split('/').pop() + '=' + file.split('/').pop() + ';'), c);
    }
    return c;
}
const png = fs.readFileSync(path.join(root, 'template/Demo/3d/Actors/Rhea Voss/thumbnail.png'));
function thumbnails(t) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-thumbnails-')); t.after(() => fs.rmSync(temp, {recursive:true,force:true}));
    const c = load(), e = new c.Database3DEditor(null, null), project = {path:temp}, icons = new Map();
    e._project = () => project; e._ensureProjectCaches = () => {}; e._detail = {isConnected:true};
    e._thumbRow = name => { if (!icons.has(name)) icons.set(name, {style:{}}); return icons.get(name); };
    e._thumbnailCachePath = entry => path.join(temp, 'cache', entry.name.replaceAll('/', '-') + (entry.worn ? '-worn' : '') + '.png');
    e._whenPreviewIdle = async () => {};
    const entry = name => {
        fs.mkdirSync(path.join(temp, '3d', name, 'source'), {recursive:true});
        return {name, file:name.split('/').pop(), ext:'.glb'};
    };
    return {c,e,temp,icons,entry};
}
test('all saved thumbnails appear before the first missing model renders, and warm opens render nothing', async t => {
    const {e,temp,icons,entry} = thumbnails(t), missing = entry('Actors/Missing'), saved = entry('Actors/Saved'), cached = entry('Actors/Cached');
    const file = path.join(temp,'3d',saved.name,'thumbnail.png'); fs.writeFileSync(file,png);
    fs.mkdirSync(path.dirname(e._thumbnailCachePath(cached)), {recursive:true}); fs.writeFileSync(e._thumbnailCachePath(cached),png);
    let rendered = []; e._templates = {};
    e._renderThumbnail = async row => { rendered.push(row.name); assert.ok(icons.get(saved.name).style.backgroundImage); assert.ok(icons.get(cached.name).style.backgroundImage); e._templates[row.name]={userData:{glbTextures:[]}}; return 'data:image/png;base64,'+png.toString('base64'); };
    const pending = e._fillThumbnails([missing,saved,cached]);
    assert.ok(icons.get(saved.name).style.backgroundImage, 'saved folder picture is set synchronously');
    assert.ok(icons.get(cached.name).style.backgroundImage, 'disk cache picture is also set synchronously');
    await pending; assert.deepEqual(rendered,[missing.name]);
    assert.equal(fs.readFileSync(path.join(temp,'3d',missing.name,'thumbnail.png')).equals(png),true,'missing picture is persisted beside the model');
    assert.equal(fs.readFileSync(path.join(temp,'3d',cached.name,'thumbnail.png')).equals(png),true,'a machine cache supplies a portable thumbnail too');
    e._thumbs = {}; rendered=[]; await e._fillThumbnails([missing,saved,cached]); assert.equal(rendered.length,0);
});
test('existing project artwork wins over old caches and generation never overwrites it, including hosts without write flags', t => {
    const {c,e,temp,entry} = thumbnails(t), row=entry('Props/Crate'), file=path.join(temp,'3d',row.name,'thumbnail.png');
    c.require = name => name === 'fs' ? { ...fs, writeFileSync: (file, bytes) => fs.writeFileSync(file, bytes) } : require(name);
    fs.writeFileSync(file,png); const custom=fs.readFileSync(file);
    e._writeCachedThumbnail(row,'data:image/png;base64,'+Buffer.alloc(400,7).toString('base64'));
    assert.equal(fs.readFileSync(file).equals(custom),true);
    assert.equal(e._readProjectThumbnail(row),'data:image/png;base64,'+png.toString('base64'));
    assert.equal(e._projectThumbnailPath({...row,worn:{effects:[]}}),null,'variant never borrows the base image');
    assert.equal(e._projectThumbnailPath({name:'../outside'}),null);
});
test('an obsolete thumbnail queue stops when the list changes and render jobs do not overlap', async t => {
    const {e,entry} = thumbnails(t), a=entry('A'), b=entry('B');
    let release; const gate=new Promise(r=>release=r); let active=0,max=0; const calls=[]; e._templates={};
    e._renderThumbnail=async row=>{ calls.push(row.name); active++;max=Math.max(max,active);if(row===a) await gate;active--;return null; };
    const first=e._fillThumbnails([a,b]);
    await new Promise(r=>setTimeout(r,10)); const second=e._fillThumbnails([b]);release(); await Promise.all([first,second]);
    assert.deepEqual(calls,['A','B']); assert.equal(max,1);
});
function compound(c) {
    const E=c.DatabaseStructureEditor;
    const child=E.normalizePlan({name:'Child',size:[4,4],storey:5,height:1,pieces:[{kind:'floor',x:1,y:1,z:0},{kind:'wall',x:1,y:0,z:0}],lights:[{id:'light1',x:1,y:1,height:48}],surfaces:[{id:1,target:'map',x:1,y:1,z:1,movie:'News'}],props:[{name:'Props/Crate',x:2,y:2}],water:[{x0:0,y0:0,x1:1,y1:1,level:0.5}],spots:{entry:[1,2]},events:[{spot:'entry',template:'Door',name:'Door'}],effects:[{type:'animation',at:[1,1],animation:1,name:'Spark'}]});
    const parent=E.normalizePlan({name:'Compound',size:[14,14],storey:5,height:1,pieces:[{kind:'fence',x:0,y:0}],floors:[{rooms:{room:[1,1,4,4]}}],roof:{pitch:0},paths:[[0,5,5,5]],parts:[{name:'annex',plan:'Child',at:[7,7],rot:1}]});
    return {parent,child};
}
function geometry(c,pieces) {
    return JSON.stringify(pieces.map(p=>c.RRMapElevation.normalizePiece(p,null)).map(p=>{delete p.id;delete p.group;return p;}));
}
test('the workshop expands mixed pieces, rooms, paths and children exactly as the preview does', () => {
    const c=load(),{parent,child}=compound(c),record={id:1,name:'Compound',file:'Compound.json',plan:parent};
    const db={data:{structures:[null,record,{id:2,name:'Child',file:'Child.json',plan:child}]}};
    const workshop=new c.StructureWorkshop({databaseManager:db});
    const before=JSON.stringify(parent),expected=c.RRStructurePlan.build(parent,0,0,1,0,()=>child),plot=workshop.plotMap(record);
    assert.equal(geometry(c,c.RRMapElevation.pieces(plot)),geometry(c,expected));
    assert.equal(JSON.stringify(parent),before,'opening does not mutate the database');
    for (const key of ['lights','mediaSurfaces','props','water']) assert.equal(plot.reactor3d[key].length,1,key);
    assert.ok(plot.rrWorkshop.spots['annex.entry']); assert.equal(plot.rrWorkshop.events[0].spot,'annex.entry');
    assert.equal(plot.rrWorkshop.effects[0].type,'animation');
    workshop.tilemap=()=>({currentMap:plot});workshop.session={structureId:1};workshop.writeFile=()=>true;workshop.flash=()=>{};
    assert.equal(workshop.save(),true);
    const reopened=c.DatabaseStructureEditor.normalizePlan(JSON.parse(JSON.stringify(c.DatabaseStructureEditor.trimPlan(record.plan))));
    assert.equal(geometry(c,c.RRStructurePlan.build(reopened)),geometry(c,expected),'saving does not drop or duplicate generated geometry');
    assert.equal(reopened.props.length,1);assert.equal(reopened.water.length,1);assert.equal(reopened.events[0].spot,'annex.entry');assert.equal(reopened.effects[0].type,'animation');
});
test('nested geometry can be selected and erased after materialization, and repeated expansion is idempotent',()=>{
    const c=load(),{parent,child}=compound(c),F=c.RRStructureFloors,SP=c.RRStructurePlan;
    const expected=geometry(c,SP.build(parent,0,0,1,0,()=>child));
    assert.equal(F.materialize(parent,SP,()=>child),true);assert.equal(geometry(c,SP.build(parent)),expected);
    const count=parent.pieces.length;assert.equal(F.materialize(parent,SP,()=>child),false);assert.equal(parent.pieces.length,count);
    const p=parent.pieces.find(p=>p.x>=7&&p.kind==='wall');assert.ok(p);
    assert.ok(F.selectAt(parent,0,p.x,p.y).length);F.erase(parent,0,[[p.x,p.y]]);
    assert.equal(F.selectAt(parent,0,p.x,p.y).length,0);assert.ok(SP.build(parent).length<count);
});
test('every bundled blueprint retains the preview geometry through workshop save and reopen',()=>{
    const c=load(),dir=path.join(root,'template/Demo/3d/Structures');
    const records=fs.readdirSync(dir).filter(file=>file.endsWith('.json')).map((file,i)=>({id:i+1,file,name:file.slice(0,-5),plan:c.DatabaseStructureEditor.normalizePlan(JSON.parse(fs.readFileSync(path.join(dir,file))))}));
    const resolve=name=>records.find(row=>row.file===name||row.file===name+'.json'||row.name===name)?.plan;
    const db={data:{structures:[null,...records]}},workshop=new c.StructureWorkshop({databaseManager:db});
    workshop.writeFile=()=>true;workshop.flash=()=>{};
    for(const entry of records){
        const expected=geometry(c,c.RRStructurePlan.build(entry.plan,0,0,1,0,resolve)),map=workshop.plotMap(entry);
        assert.equal(geometry(c,c.RRMapElevation.pieces(map))===expected,true,entry.file+' opens with all geometry');
        // Save a detached record so parent references continue resolving the original fixtures.
        const saved={...entry,plan:JSON.parse(JSON.stringify(entry.plan))};workshop.record=()=>saved;
        workshop.session={structureId:entry.id};workshop.tilemap=()=>({currentMap:map});assert.equal(workshop.save(),true);
        const reopened=c.DatabaseStructureEditor.normalizePlan(JSON.parse(JSON.stringify(c.DatabaseStructureEditor.trimPlan(saved.plan))));
        assert.equal(geometry(c,c.RRStructurePlan.build(reopened,0,0,1,0,resolve))===expected,true,entry.file+' survives saving');
    }
});
test('both builders render and activate the same accessible tool buttons',()=>{
    const {BuildHotbar:B}=load();const markup=B.slotsHtml([{id:'wall',label:'Wall <stone>',icon:B.icon('wall'),key:'2'}],'wall');
    assert.match(markup,/aria-pressed="true"/);assert.match(markup,/Wall &lt;stone>/);assert.match(markup,/title="Wall &lt;stone> \(2\)"/);
    let click,picked;B.bindSlots({querySelectorAll:()=>[{dataset:{slot:'wall'},addEventListener:(type,fn)=>click=fn}]},slot=>picked=slot);click();assert.equal(picked,'wall');
});
