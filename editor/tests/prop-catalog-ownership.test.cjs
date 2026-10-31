'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
for(const [,name]of html.matchAll(/src="(src\/forge\/Props\/[^\"]+\.js)"/g))if(!name.endsWith('/PropBuilder.js'))require(path.join(root,name));
const C=global.RRPropCatalog;
test('every visible prop has one discoverable category and its starting recipe selects that entry',()=>{
    const groups=C.grouped(),types=groups.flatMap(g=>g.types),all=C.TYPES.filter(t=>!t.hidden);
    assert.equal(types.length,all.length);assert.equal(new Set(types.map(t=>t.id)).size,all.length);
    for(const t of all){assert.ok(C.topOf(t.category),t.id+' category');assert.equal(C.typeOf(t.start()).id,t.id,t.id+' start');}
    const siblingNames=new Set();for(const c of C.CATEGORIES){const key=(c.parent||'')+'|'+c.label.toLowerCase();assert.ok(!siblingNames.has(key),key+' duplicate category');siblingNames.add(key);}
});
test('wearables, interior electronics and energy weapon families have consistent ownership; old tie recipes still open',()=>{
    for(const [id,category]of Object.entries({'garment-beanie':'acc-hats','garment-powerhelm':'acc-hats','garment-dustGoggles':'acc-face','garment-gasMask':'acc-masks','garment-gauntlets':'garment-hands','garment-boots':'garment-feet','garment-bikiniTop':'garment-swim','garment-shawl':'acc-back','garment-mh_sundress':'garment-dresses','garment-ss_vay_robes':'garment-dresses','accessory-hudMonocle':'acc-face','accessory-ledMask':'acc-masks','accessory-haloProjector':'acc-hats','accessory-backpack':'acc-packs','furniture-serverRack':'electronics','sword-energy':'swords','gun-laser':'firearms','staff-energy':'staffs','bow-energy':'bows','shield-energy':'shields'})){let c=C.CATEGORIES.find(c=>c.id===C.TYPES.find(t=>t.id===id)?.category);while(c&&c.id!==category)c=C.CATEGORIES.find(p=>p.id===c.parent);assert.equal(c?.id,category,id);};
    const legacy=C.TYPES.find(t=>t.id==='accessory-neckTie');assert.equal(legacy.hidden,true);assert.equal(C.typeOf(legacy.start()).id,legacy.id);
    assert.ok(C.grouped('sci-fi energy').flatMap(g=>g.types).length>=8,'style search survives functional categories');
});

test('genre groups stay inside their functional families and remain searchable without duplicates',()=>{for(const t of C.TYPES.filter(t=>t.genre&&!t.hidden)){const leaf=C.CATEGORIES.find(c=>c.id===t.category);assert.equal(leaf.label,{modern:'Modern',fantasy:'Fantasy',historical:'Historical',scifi:'Sci-fi',wasteland:'Wasteland'}[t.genre]);assert.ok(C.grouped(leaf.label+' '+t.label).flatMap(g=>g.types).some(x=>x.id===t.id),t.id);}assert.equal(C.TYPES.find(t=>t.id==='gun-ionPistol').category,'firearms-scifi');assert.equal(C.TYPES.find(t=>t.id==='vehicle-carriage').category,'vehicles-historical');assert.equal(C.topOf('salvage-machines').id,'salvage');});
