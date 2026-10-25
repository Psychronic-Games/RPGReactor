'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const Q=require('./helpers/character-quality-matrix.cjs'),Cloth=require('../src/forge/Character3D/CharacterCloth.js');
const recipe=()=>Q.Creature.withVariant(Q.Creature.kindRecipe('worm'),'wormType','goauld');
const hash=a=>crypto.createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');

test('worm type retains legacy defaults and persists editable Goa\'uld anatomy through UI choices and recipes',()=>{
    const earth=Q.Creature.kindRecipe('worm'),r=recipe();assert.equal(earth.wormType,'earthworm');assert.equal(earth.eyeCount,0);assert.equal(r.wormType,'goauld');assert.equal(r.eyeCount,2);assert.equal(r.jawOpen,.7);
    assert.deepEqual(Q.Model.normalize(JSON.parse(JSON.stringify(r))),r);assert.deepEqual(Q.Creature.normalizeRecipe({kind:'worm',wormType:'goauld'}),r);
    assert.equal(Q.Creature.normalizeRecipe({...r,wormType:'invalid'}).wormType,'earthworm');
    const custom=Q.Creature.normalizeRecipe({...r,eyeCount:6,finSize:1.7,jawOpen:.25,colors:{...r.colors,coat:'#123456',eye:'#abcdef'}});assert.equal(custom.eyeCount,6);assert.equal(custom.colors.eye,'#abcdef');assert.equal(custom.colors.coat,'#123456');assert.equal(custom.jawOpen,.25);
    for(const key of ['jawOpen','toothSize','finSize','appendageLength']){assert.ok(Q.Creature.slidersFor(r).some(s=>s.key===key));assert.ok(!Q.Creature.slidersFor(earth).some(s=>s.key===key));}
    for(const seed of [1,81,650])assert.deepEqual(Q.Creature.randomRecipe(seed,'worm'),Q.Creature.randomRecipe(seed,'worm'));
    assert.equal(Q.Creature.variantsFor({...r,morphology:'fish'}).length,0);
    // A type choice goes through _selectPreset, which clears pending timers.
    const scope={window:{},console,RRCreatureBody:Q.Creature,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/forge/Character3D/Character3DBuilder.js'),'utf8'),scope);
    const ui=Object.create(scope.window.Character3DBuilder.prototype);Object.assign(ui,{recipe:earth,_t:s=>s,_section:s=>s,_tile:()=>'',_slider:()=>'',_extremeToggle:()=>'',_select:(key,label,choices)=>key+':'+choices.map(c=>c[0]).join(','),_replace(r){this.recipe=r;}});
    assert.ok(ui._bodyTab().includes('wormType:earthworm,tapeworm,leech,roundworm,bristleworm,goauld'));ui._onInput({target:{tagName:'SELECT',dataset:{path:'wormType'},value:'goauld'}},true);assert.equal(ui.recipe.wormType,'goauld');assert.equal(ui.recipe.eyeCount,2);
});

test('Goa\'uld has continuous tapered skin, three head sails, jaws, red eyes and bounded custom surfaces',()=>{
    for(const over of [{},{segments:4,girth:.65,headSize:.7,finSize:.25},{segments:32,girth:1.6,headSize:1.5,finSize:2,eyeCount:6}])for(const quality of ['preview','save']){
        const r={...recipe(),...over},b=Q.Model.build(null,r,{}, {quality}),report=Q.inspect(b,{recipe:r});assert.deepEqual(report.issues,[]);assert.ok(report.summary.triangles<65000);assert.ok(b.bones.length<128);
        for(const name of ['Body','Head frill -1','Head frill 1','Cranial crest','Mouth interior','Gum margins','Teeth','Oral palps'])assert.ok(b.parts.some(p=>p.name===name),name);
        assert.equal(b.parts.filter(p=>p.kind==='eye').length,r.eyeCount);assert.equal(b.bones.filter(b=>b.role==='segment').length,r.segments-1);assert.ok(b.bones.some(b=>b.name==='Jaw'));assert.ok(!b.bones.some(b=>/leg/i.test(b.role)));
        const body=b.parts.find(p=>p.name==='Body'),front=[],back=[];for(let i=0;i<body.positions.length;i+=3){if(body.positions[i+2]>r.size*.2)front.push(Math.abs(body.positions[i]));if(body.positions[i+2]<-r.size*1.2)back.push(Math.abs(body.positions[i]));}assert.ok(Math.max(...front)>Math.max(...back)*2,'fine tapered tail');
        for(const id of ['crawl','attack']){const clip=Q.Creature.poseClip(b.bones,id,r);for(const fraction of [.2,.5,.8]){const pose=Cloth.pose(b.bones,clip,clip.times.at(-1)*fraction);for(const p of b.parts)assert.ok(Cloth.skin(p,b.bones,pose).every(Number.isFinite),p.name);}}
    }
    const closed=Q.Model.build(null,{...recipe(),jawOpen:0},{},{quality:'preview'});assert.ok(!closed.parts.some(p=>p.name==='Teeth'));
    const earth=Q.Model.build(null,Q.Creature.kindRecipe('worm'),{},{quality:'preview'});assert.ok(!earth.parts.some(p=>p.name==='Cranial crest'));
});

test('Goa\'uld survives real worker transfers and GLB skin, jaw and crawling/attack exports',async t=>{
    const {PreviewWorker}=require('../src/forge/Character3D/CharacterPreviewWorker.cjs'),pool=new PreviewWorker();t.after(()=>pool.dispose());pool.configure({});
    const r=recipe(),b=Q.Model.build(null,r,{},{quality:'preview'}),w=await pool.build({key:'goauld',recipe:r,options:{quality:'preview'}});assert.equal(w.parts.length,b.parts.length);
    for(let i=0;i<b.parts.length;i++)assert.equal(hash(w.parts[i].positions),hash(b.parts[i].positions));
    for(const [name,p]of Object.entries(b.textures))assert.equal(hash(w.textures[name].data),hash(p.data));
    const bytes=await Q.Model.toGlb(b,'goauld',()=>Uint8Array.of(137,80,78,71)),n=new DataView(bytes.buffer,bytes.byteOffset).getUint32(12,true),json=JSON.parse(Buffer.from(bytes.subarray(20,20+n)).toString());
    const jaw=json.nodes.findIndex(n=>n.name==='Jaw');assert.ok(json.animations.some(a=>a.name==='Walk'));assert.ok(json.animations.find(a=>a.name==='Attack').channels.some(c=>c.target.node===jaw));assert.ok(json.meshes.find(m=>m.name==='Head frill 1').primitives[0].attributes.JOINTS_0!=null);
});

test('tapeworm, leech, roundworm and bristleworm have distinct bounded anatomy and working shape controls',()=>{
    const variants=new Map();
    for(const type of ['tapeworm','leech','roundworm','bristleworm'])for(const quality of ['preview','save'])for(const over of [{},{segments:32,girth:1.5,chestDepth:.8,appendageLength:1.6}]){
        const r={...Q.Creature.withVariant(Q.Creature.kindRecipe('worm'),'wormType',type),...over},b=Q.Model.build(null,r,{}, {quality}),report=Q.inspect(b,{recipe:r});assert.deepEqual(report.issues,[],type+'/'+quality);assert.ok(report.summary.triangles<65000,type+' budget');assert.ok(b.bones.length<128);
        assert.deepEqual(Q.Model.normalize(JSON.parse(JSON.stringify(r))),r);assert.ok(b.clips.some(c=>c.name==='Walk'));
        const body=b.parts.find(p=>p.name==='Body'),extent=axis=>{let lo=Infinity,hi=-Infinity;for(let i=axis;i<body.positions.length;i+=3){lo=Math.min(lo,body.positions[i]);hi=Math.max(hi,body.positions[i]);}return hi-lo;};
        if(type==='tapeworm'){assert.ok(extent(0)>extent(1)*7,'flat ribbon');assert.equal(b.parts.filter(p=>p.name.startsWith('Scolex sucker')).length,4);assert.ok(b.parts.some(p=>p.name==='Scolex'));assert.ok(!b.parts.some(p=>p.name==='Mouth'));}
        if(type==='leech'){assert.ok(extent(0)>extent(1)*2);for(const n of ['Anterior sucker','Posterior sucker'])assert.ok(b.parts.some(p=>p.name===n));}
        if(type==='roundworm'){assert.ok(extent(2)*r.girth>extent(0)*15);assert.ok(!Q.Creature.slidersFor(r).some(s=>s.key==='segments'));}
        if(type==='bristleworm'){assert.ok(b.parts.find(p=>p.name==='Chaetae').index.length>1000);assert.ok(b.parts.some(p=>p.name==='Parapodia'));assert.ok(Q.Creature.slidersFor(r).some(s=>s.key==='appendageLength'));}
        if(quality==='preview'&&!over.segments)variants.set(type,hash(body.positions));
        const clip=Q.Creature.poseClip(b.bones,'crawl',r),pose=Cloth.pose(b.bones,clip,clip.times.at(-1)*.3);for(const p of b.parts)assert.ok(Cloth.skin(p,b.bones,pose).every(Number.isFinite));
    }
    assert.equal(new Set(variants.values()).size,4);
});

test('tapeworm and leech suckers are joined skin regions with shared posed boundaries',()=>{
    for(const type of ['tapeworm','leech']){
        const r=Q.Creature.withVariant(Q.Creature.kindRecipe('worm'),'wormType',type),b=Q.Model.build(null,r,{}, {quality:'save'}),base=b.parts.find(p=>p.name===(type==='tapeworm'?'Scolex':'Body'));
        const key=(p,i)=>Array.from(p.positions.subarray(i*3,i*3+3),v=>Math.round(v*1e7)).join(':'),vertices=new Map([...new Set(base.index)].map(i=>[key(base,i),i]));
        const patches=b.parts.filter(p=>/sucker/i.test(p.name));assert.equal(patches.length,type==='tapeworm'?4:2);
        for(const p of patches){let shared=0;for(let i=0;i<p.positions.length/3;i++){const j=vertices.get(key(p,i));if(j===undefined)continue;shared++;for(let k=0;k<4;k++){assert.equal(p.joints[i*4+k],base.joints[j*4+k]);assert.equal(p.weights[i*4+k],base.weights[j*4+k]);}}assert.ok(shared>4,p.name+' shares a continuous skin boundary');}
    }
});
