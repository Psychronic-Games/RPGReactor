'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const Q = require('./helpers/character-quality-matrix.cjs'), Forms = require('../src/forge/Character3D/CreatureForms.js'), Cloth = require('../src/forge/Character3D/CharacterCloth.js');
const build = r => Q.Model.build(null, r, {}, { quality: 'preview' });
const variant = (kind, key, value) => Q.Creature.withVariant(Q.Creature.kindRecipe(kind), key, value);
const span = (p, axis) => { let low=Infinity, high=-Infinity;for(let i=axis;i<p.positions.length;i+=3){low=Math.min(low,p.positions[i]);high=Math.max(high,p.positions[i]);}return high-low; };
const hash = a => crypto.createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');

test('aquatic type selectors persist, reject unknown values, retain custom controls and randomize deterministically', () => {
    for(const [key,def] of Object.entries(Forms.MARINE_TYPES))for(const [type]of def.choices){
        const r=variant(def.kind,key,type);assert.equal(r[key],type);assert.deepEqual(Q.Model.normalize(JSON.parse(JSON.stringify(r))),r);
        const custom=Q.Model.normalize({...r,colors:{...r.colors,coat:'#123456'},jawOpen:.8,toothSize:1.4});assert.equal(custom.colors.coat,'#123456');assert.equal(custom.jawOpen,.8);
        assert.equal(Q.Creature.normalizeRecipe({...r,[key]:'unknown'})[key],def.choices[0][0]);
    }
    assert.equal(Forms.variantsFor({...Q.Creature.kindRecipe('shark'),morphology:'worm'}).length,0);
    for(const kind of ['shark','whale','fish'])for(const seed of [7,81,653])assert.deepEqual(Q.Creature.randomRecipe(seed,kind),Q.Creature.randomRecipe(seed,kind));
    assert.equal(Q.Creature.normalizeRecipe({kind:'shark',jawOpen:0,toothSize:0}).jawOpen,0);
    assert.equal(Q.Creature.normalizeRecipe({kind:'shark',dorsalHeight:99}).dorsalHeight,2);
});

test('all thirteen marine variants have distinct valid bounded surfaces in preview and save', () => {
    for(const [key,def]of Object.entries(Forms.MARINE_TYPES)){
        const silhouettes=new Set();
        for(const [type]of def.choices)for(const quality of ['preview','save']){
            const r=variant(def.kind,key,type),b=Q.Model.build(null,r,{}, {quality}),report=Q.inspect(b,{recipe:r});
            assert.deepEqual(report.issues,[],type+'/'+quality);assert.ok(report.summary.triangles<65000,type+' mesh budget');assert.ok(b.bones.length<128);
            assert.ok(b.parts.some(p=>p.name==='Mouth interior'));assert.ok(b.bones.some(b=>b.name==='Jaw'));
            if(quality==='preview')silhouettes.add(hash(b.parts.find(p=>p.name==='Body').positions)+':'+hash(b.parts.find(p=>p.name==='Fluke1').positions));
        }
        assert.equal(silhouettes.size,def.choices.length,'types change anatomy, not only their name');
    }
});

test('great white upper and lower serrated teeth are embedded in the jaws and follow the lower-jaw rig', () => {
    const r=variant('shark','sharkType','greatWhite'),b=build(r),teeth=b.parts.find(p=>p.name==='Teeth'),jaw=b.bones.findIndex(b=>b.name==='Jaw'),head=b.bones.findIndex(b=>b.name==='Head');
    assert.ok(teeth && teeth.index.length/3>5000);assert.ok(!teeth.texture,'teeth have actual silhouette geometry');
    let onJaw=0,onHead=0;for(let i=0;i<teeth.weights.length;i+=4){let j=0,h=0;for(let k=0;k<4;k++){if(teeth.joints[i+k]===jaw)j+=teeth.weights[i+k];if(teeth.joints[i+k]===head)h+=teeth.weights[i+k];}if(j>.5)onJaw++;if(h>.5)onHead++;}
    assert.ok(onJaw>500&&onHead>500,'two differently bound jaws');
    const clip=Q.Creature.poseClip(b.bones,'attack',r),start=Cloth.skin(teeth,b.bones,Cloth.pose(b.bones,clip,0)),end=Cloth.skin(teeth,b.bones,Cloth.pose(b.bones,clip,clip.times.at(-1)*.25));
    let movement=0;for(let i=0;i<start.length;i++)movement=Math.max(movement,Math.abs(start[i]-end[i]));assert.ok(movement>.005);
    assert.ok(!build({...r,jawOpen:0}).parts.some(p=>p.name==='Teeth'));
    assert.ok(!build(variant('shark','sharkType','whaleShark')).parts.some(p=>p.name==='Teeth'),'filter feeder has no predator fangs');
    assert.ok(build(variant('shark','sharkType','whaleShark')).parts.some(p=>p.name==='Spotted skin'),'filter feeder has distinct fitted spot markings');
    assert.ok(teeth.positions.length/3>3000,'individual volumetric teeth, not one zig-zag strip');
});

test('hammerhead cephalofoil, thresher tail and whale/dolphin anatomy remain recognizable', () => {
    const hammer=build(variant('shark','sharkType','hammerhead')),bar=hammer.parts.find(p=>p.name==='Cephalofoil'),body=hammer.parts.find(p=>p.name==='Body');
    assert.ok(bar&&span(bar,0)>span(body,0)*1.5);assert.ok(span(bar,2)>span(bar,1)*2,'broad flat hammer, not eye stalks');
    const thresher=build(variant('shark','sharkType','thresher'));assert.ok(span(thresher.parts.find(p=>p.name==='Fluke1'),1)>span(thresher.parts.find(p=>p.name==='Fluke-1'),1)*3);
    const hump=build(variant('whale','whaleType','humpback')),blue=build(variant('whale','whaleType','blue'));
    assert.ok(hump.parts.some(p=>p.name==='Rostral tubercles')&&hump.parts.some(p=>p.name==='Ventral pleats'));
    const hb=hump.parts.find(p=>p.name==='Body'),hp=hump.parts.find(p=>p.name==='Ventral pleats'),key=(p,i)=>Array.from(p.positions.subarray(i*3,i*3+3)).join(':'),bodyVertices=new Map([...new Set(hb.index)].map(i=>[key(hb,i),i]));
    let shared=0;for(let i=0;i<hp.positions.length/3;i++){const j=bodyVertices.get(key(hp,i));if(j===undefined)continue;shared++;for(let k=0;k<4;k++){assert.equal(hp.joints[i*4+k],hb.joints[j*4+k]);assert.equal(hp.weights[i*4+k],hb.weights[j*4+k]);}}assert.ok(shared>20,'throat skin shares exact positions and weights at its body boundary');
    assert.ok(span(hump.parts.find(p=>p.name==='Fin1_0'),0)/hump.recipe.size>span(blue.parts.find(p=>p.name==='Fin1_0'),0)/blue.recipe.size*1.5);
    for(const r of [Q.Creature.kindRecipe('dolphin'),hump.recipe,blue.recipe]){
        const b=build(r),fluke=b.parts.find(p=>p.name==='Fluke1');assert.ok(span(fluke,0)>span(fluke,1)*8);
        assert.ok(b.parts.some(p=>p.name==='Gills and facial detail'));
    }
    const tuna=build(variant('fish','fishType','tuna'));assert.equal(tuna.parts.filter(p=>p.name.startsWith('Finlet')).length,12);
    assert.ok(tuna.parts.find(p=>p.name==='Fin1_0').texture==='creature-fin.png','fin rays use a separate picture from scales');
});

test('type-specific controls and the builder selector show only working aquatic options', () => {
    const controls=r=>Q.Creature.slidersFor(r).map(s=>s.key);
    assert.ok(controls(Q.Creature.kindRecipe('shark')).includes('toothSize'));
    assert.ok(!controls(variant('shark','sharkType','whaleShark')).includes('toothSize'));
    assert.ok(!controls(Q.Creature.kindRecipe('stingray')).includes('jawOpen'));
    assert.ok(!controls(Q.Creature.kindRecipe('whale')).includes('snoutLength'));
    // A type choice goes through _selectPreset, which clears pending timers.
    const scope={window:{},console,RRCreatureBody:Q.Creature,setTimeout,clearTimeout};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/forge/Character3D/Character3DBuilder.js'),'utf8'),scope);
    const b=Object.create(scope.window.Character3DBuilder.prototype);Object.assign(b,{recipe:Q.Creature.kindRecipe('shark'),_t:s=>s,_section:s=>s,_tile:()=>'',_slider:()=>'',_extremeToggle:()=>'',_select:(key,label,choices)=>key+':'+choices.map(([id])=>id).join(',')});
    const html=b._bodyTab();assert.ok(html.includes('sharkType:greatWhite,tiger,bull,hammerhead,mako,thresher,whaleShark'));
    b._replace=r=>{b.recipe=r;};const choice={target:{tagName:'SELECT',value:'hammerhead',dataset:{path:'sharkType'}}};b._onInput(choice,false);assert.equal(b.recipe.sharkType,'greatWhite');b._onInput(choice,true);assert.equal(b.recipe.sharkType,'hammerhead');assert.equal(b.recipe.colors.coat,variant('shark','sharkType','hammerhead').colors.coat);
});

test('variant skins, teeth and jaw/motion tracks survive GLB and real preview-worker transfers', async t => {
    const {PreviewWorker}=require('../src/forge/Character3D/CharacterPreviewWorker.cjs'),pool=new PreviewWorker();t.after(()=>pool.dispose());pool.configure({});
    for(const [kind,key,type]of [['shark','sharkType','greatWhite'],['fish','fishType','tuna'],['whale','whaleType','orca']]){
        const r=variant(kind,key,type),b=build(r),worker=await pool.build({key:'marine-'+type,recipe:r,options:{quality:'preview'}});
        assert.equal(worker.parts.length,b.parts.length);for(let i=0;i<b.parts.length;i++)assert.equal(hash(worker.parts[i].positions),hash(b.parts[i].positions));
        for(const [name,picture]of Object.entries(b.textures)){assert.equal(hash(worker.textures[name].data),hash(picture.data));assert.equal(worker.textures[name].repeat,picture.repeat);}
        const bytes=await Q.Model.toGlb(b,type,()=>Uint8Array.of(137,80,78,71)),length=new DataView(bytes.buffer,bytes.byteOffset).getUint32(12,true),glb=JSON.parse(Buffer.from(bytes.subarray(20,20+length)).toString());
        const jaw=glb.nodes.findIndex(n=>n.name==='Jaw');assert.ok(jaw>=0);assert.ok(glb.animations.find(a=>a.name==='Attack').channels.some(c=>c.target.node===jaw));
        if(type==='greatWhite')assert.ok(glb.meshes.find(m=>m.name==='Teeth').primitives[0].attributes.JOINTS_0!=null);
    }
});

function bodySupport(body,x,z) {
    let hit=null;
    for(let k=0;k<body.index.length;k+=3){
        const ids=Array.from(body.index.subarray(k,k+3)),p=ids.map(i=>body.positions.subarray(i*3,i*3+3));
        const ax=p[1][0]-p[0][0],az=p[1][2]-p[0][2],bx=p[2][0]-p[0][0],bz=p[2][2]-p[0][2],det=ax*bz-az*bx;
        if(Math.abs(det)<1e-12)continue;
        const u=((x-p[0][0])*bz-(z-p[0][2])*bx)/det,v=(ax*(z-p[0][2])-az*(x-p[0][0]))/det,w=[1-u-v,u,v];
        if(w.some(n=>n<-.00001))continue;
        const y=w.reduce((a,n,i)=>a+n*p[i][1],0);if(hit&&y<=hit.y)continue;
        const weights=new Map();for(let j=0;j<3;j++)for(let q=0;q<4;q++){const joint=body.joints[ids[j]*4+q];weights.set(joint,(weights.get(joint)||0)+body.weights[ids[j]*4+q]*w[j]);}
        hit={y,weights:[...weights].filter(([,w])=>w>1e-7).sort((a,b)=>b[1]-a[1]).slice(0,4)};
    }
    return hit;
}

test('predator sharks have visible anterior teeth in both jaws and closed shared lip boundaries', () => {
    for(const type of ['greatWhite','tiger','bull','hammerhead','mako','thresher'])for(const quality of ['preview','save']){
        const r=variant('shark','sharkType',type),b=Q.Model.build(null,r,{}, {quality}),L=r.size*2.4,teeth=b.parts.find(p=>p.name==='Teeth');
        const head=b.bones.findIndex(b=>b.name==='Head'),jaw=b.bones.findIndex(b=>b.name==='Jaw'),front={upper:0,lower:0};
        for(let i=0;i<teeth.positions.length/3;i++)if(Math.abs(teeth.positions[i*3])<L*.012&&teeth.positions[i*3+2]>L*.43){
            let h=0,j=0;for(let k=0;k<4;k++){if(teeth.joints[i*4+k]===head)h+=teeth.weights[i*4+k];if(teeth.joints[i*4+k]===jaw)j+=teeth.weights[i*4+k];}if(h>.9)front.upper++;if(j>.9)front.lower++;
        }
        assert.ok(front.upper>30&&front.lower>30,type+'/'+quality+': anterior teeth exist across both centerlines');
        const body=b.parts.find(p=>p.name==='Body'),mouth=b.parts.find(p=>p.name==='Mouth interior'),sides=quality==='save'?32:24;
        const key=(p,i)=>Array.from(p.positions.subarray(i*3,i*3+3),x=>Math.round(x/L*1e7)).join(':'),indexed=new Map([...new Set(body.index)].map(i=>[key(body,i),i]));
        for(let half=0;half<2;half++){
            let shared=0;for(let k=0;k<=sides;k++){const i=half*33*(sides+1)+k,j=indexed.get(key(mouth,i));if(j===undefined)continue;shared++;if(half===1&&Math.abs(mouth.positions[i*3])<L*.008)assert.ok(body.normals[j*3+2]>0,'anterior lower jaw faces outward');for(let q=0;q<4;q++){assert.equal(mouth.joints[i*4+q],body.joints[j*4+q]);assert.equal(mouth.weights[i*4+q],body.weights[j*4+q]);}}
            assert.ok(shared>=sides*.8,type+': front lip shares body positions and bindings');
        }
    }
});

test('dorsal fins fit across the full back without twisted sections, detached bases or pose gaps', () => {
    for(const [type,over]of [['greatWhite',{}],['hammerhead',{dorsalHeight:2,girth:1.5,chestDepth:.7}],['thresher',{dorsalHeight:.3,girth:.65,chestDepth:1.5}],['whaleShark',{}]]){
        const r={...variant('shark','sharkType',type),...over},b=build(r),L=r.size*2.4,fin=b.parts.find(p=>p.name==='Dorsal fin'),body=b.parts.find(p=>p.name==='Body'),sides=16;
        const sample={positions:new Float32Array(sides*3),joints:new Uint16Array(sides*4),weights:new Float32Array(sides*4)};
        for(let i=0;i<sides;i++){
            const p=fin.positions.subarray(i*3,i*3+3),hit=bodySupport(body,p[0],p[2]);assert.ok(hit,type+': entire root has body beneath it');
            const depth=(hit.y-p[1])/L;assert.ok(depth>.001&&depth<.005,type+': entire base embeds in the back ('+depth.toFixed(5)+')');
            sample.positions.set([p[0],hit.y,p[2]],i*3);hit.weights.forEach(([j,w],k)=>{sample.joints[i*4+k]=j;sample.weights[i*4+k]=w;});
        }
        for(let row=10;row<24;row++){
            let lo=Infinity,hi=-Infinity;for(let k=0;k<sides;k++){const y=fin.positions[(row*sides+k)*3+1];lo=Math.min(lo,y);hi=Math.max(hi,y);}assert.ok(hi-lo<L*.00001,type+': chord does not rotate into a kink');
        }
        for(const id of ['swim','turn','attack']){
            const clip=Q.Creature.poseClip(b.bones,id,r);
            for(const fraction of [.2,.5,.8]){
                const pose=Cloth.pose(b.bones,clip,clip.times.at(-1)*fraction),fp=Cloth.skin(fin,b.bones,pose),bp=Cloth.skin(sample,b.bones,pose);
                if(id==='attack')for(let i=10*sides*3;i<24*sides*3;i++)assert.ok(Math.abs(fp[i]-fin.positions[i])<L*.00001,'head motion does not pull a notch into the upper dorsal outline');
                for(let i=0;i<sides;i++){const distance=Math.hypot(...Array.from(fp.subarray(i*3,i*3+3),(v,k)=>v-bp[i*3+k]));assert.ok(distance<L*.006,type+'/'+id+': root stays attached in motion');}
            }
        }
    }
});
