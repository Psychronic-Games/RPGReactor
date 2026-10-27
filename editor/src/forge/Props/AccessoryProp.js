/** Character accessories as standalone equipment, using the same procedural geometry. */
(function(root) {
    'use strict';
    const need = (name, file) => root[name] || require(file);
    const Body = need('RRHumanBody', '../Character3D/HumanBody.js');
    const Props = need('RRCharacterProps', '../Character3D/CharacterProps.js');
    const Model = need('RRPropModel', './PropModel.js');
    const Catalog = need('RRPropCatalog', './PropCatalog.js');
    const Surface=need('RRConstructionSurface','../Character3D/ConstructionSurface.js');
    const Rand = need('RRPropRandom', './PropRandom.js');
    const clamp = (n, a, b, fallback) => Number.isFinite(+n) ? Math.max(a, Math.min(b, +n)) : fallback;
    const MATERIALS = { original:null, metal:[.3,.85], leather:[.6,0], plastic:[.4,0], fabric:[.88,0], velvet:[.97,0], glass:[.05,0] };
    const PAIRED=new Set(['hoops','studs','bracelets','nails','claws']);
    const MATERIAL_CHOICES = [['original','Original'],['metal','Metal'],['leather','Leather'],['plastic','Plastic'],['fabric','Fabric'],['velvet','Velvet'],['glass','Glass']];
    let reference = null, loading = null;

    // Load once on first use; a rejected load can be retried without restarting Forge.
    function prepare() {
        if (reference) return Promise.resolve();
        if (!loading) loading = Body.loadPack().then(pack => { reference = { pack, built:Body.build(pack, {}) }; }).finally(() => { loading = null; });
        return loading;
    }
    function normalize(input = {}) {
        const accessory = Props.normalizeProp(input.accessory) || Props.normalizeProp({id:'sword'});
        const def = Props.BY_ID.get(accessory.id);
        if (def.shapes && !def.shapes.some(([id]) => id === accessory.shape)) accessory.shape = def.defaults.shape || def.shapes[0][0];
        return { kind:'accessory', accessory, scale:clamp(input.scale,.1,5,1),pairGap:clamp(input.pairGap,0,.5,.025),
            pivot:['bottom','center','attachment'].includes(input.pivot) ? input.pivot : 'bottom',
            rotation:['x','y','z'].map((_, i) => clamp(input.rotation?.[i],-180,180,0)),
            material:Object.hasOwn(MATERIALS,input.material) ? input.material : 'original',
            materials:Object.fromEntries(Object.entries(input.materials||{}).filter(([k,v])=>typeof k==='string'&&Object.hasOwn(MATERIALS,v))) };
    }
    /** True when a part has open edges beyond tiny seams: a sheet seen from behind would vanish. */
    function sheet(part) {
        const P = part.positions, I = part.index, ids = new Int32Array(P.length / 3), key = new Map(), edges = new Map();
        for (let i = 0; i < ids.length; i++) { const k = Math.round(P[i * 3] * 1e5) + ',' + Math.round(P[i * 3 + 1] * 1e5) + ',' + Math.round(P[i * 3 + 2] * 1e5); if (!key.has(k)) key.set(k, key.size); ids[i] = key.get(k); }
        for (let t = 0; t < I.length; t += 3) for (let e = 0; e < 3; e++) {
            const a = ids[I[t + e]], b = ids[I[t + (e + 1) % 3]]; if (a === b) continue;
            const k = Math.min(a, b) + ':' + Math.max(a, b); edges.set(k, (edges.get(k) || 0) + 1);
        }
        let open = 0; for (const n of edges.values()) if (n === 1) open++;
        return open > edges.size * 0.02;
    }
    function build(input) {
        if (!reference) throw new Error('Accessory reference is not ready. Call prepare() first.');
        const recipe = normalize(input), {pack,built} = reference;
        const generated = Props.build(pack,built,[recipe.accessory],[]);
        if(recipe.accessory.id==='ledMask')generated.parts=ledRegions(generated.parts);
        const low=[Infinity,Infinity,Infinity], high=[-Infinity,-Infinity,-Infinity];
        const angles=recipe.rotation.map(v=>v*Math.PI/180),offsets={};
        if(PAIRED.has(recipe.accessory.id)&&recipe.pivot!=='attachment'){
            const sides={Left:[Infinity,-Infinity],Right:[Infinity,-Infinity]};
            const sideAt=(p,v)=>built.bones[p.joints[v*4]]?.name.startsWith('Left')?'Left':'Right';
            for(const p of generated.parts)for(let v=0;v<p.positions.length/3;v++){const b=sides[sideAt(p,v)],x=p.positions[v*3];b[0]=Math.min(b[0],x);b[1]=Math.max(b[1],x);}
            for(const [side,b]of Object.entries(sides))if(Number.isFinite(b[0]))offsets[side]=(side==='Left'?1:-1)*((b[1]-b[0])/2+recipe.pairGap/2)-(b[0]+b[1])/2;
        }
        const arranged=(p,v)=>{const a=Array.from(p.positions.subarray(v*3,v*3+3)),side=built.bones[p.joints[v*4]]?.name.startsWith('Left')?'Left':'Right';a[0]+=offsets[side]||0;return a;};
        const rotate = p => {
            let [x,y,z]=p;
            const [a,b,c]=angles;
            [y,z]=[y*Math.cos(a)-z*Math.sin(a),y*Math.sin(a)+z*Math.cos(a)];
            [x,z]=[x*Math.cos(b)+z*Math.sin(b),-x*Math.sin(b)+z*Math.cos(b)];
            return [x*Math.cos(c)-y*Math.sin(c),x*Math.sin(c)+y*Math.cos(c),z];
        };
        // The carrying joint is a useful origin for attaching hats, packs, jewelry, etc.
        const scores=new Float64Array(built.bones.length);
        for (const p of generated.parts) for (let k=0;k<p.joints.length;k++) scores[p.joints[k]]+=p.weights[k];
        const joint=scores.indexOf(Math.max(...scores)), bone=built.bones[joint];
        let attachment=bone.head;
        if (Props.BY_ID.get(recipe.accessory.id).slot === 'held') attachment=bone.head.map((v,k)=>v+(bone.tail[k]-v)*.8);
        const anchor=rotate(attachment);
        const textures={...generated.textures};
        const parts=generated.parts.map(p=>{
            const positions=new Float32Array(p.positions.length),normals=new Float32Array(p.normals.length);
            for (let k=0;k<positions.length;k+=3) {
                const point=rotate(arranged(p,k/3));
                const normal=rotate(Array.from(p.normals.subarray(k,k+3)));
                for(let d=0;d<3;d++) { positions[k+d]=point[d];normals[k+d]=normal[d];low[d]=Math.min(low[d],point[d]);high[d]=Math.max(high[d],point[d]); }
            }
            const joints=new Uint8Array(positions.length/3*4),weights=new Float32Array(joints.length);
            for(let k=0;k<weights.length;k+=4)weights[k]=1;
            const part=Object.assign({},p,{positions,normals,joints,weights});
            delete part.cloth;
            // Single-layer pieces (lenses, bands, cups) show from both sides once off the body.
            if (sheet(part)) part.doubleSided = true;
            const material=recipe.materials[p.name]||recipe.material,finish=MATERIALS[material];
            if(finish){[part.roughness,part.metalness]=finish;part.opacity=material==='glass'?.30:1;part.blend=material==='glass';part.kind=material==='fabric'||material==='velvet'?'cloth':material==='glass'?'glass':material==='metal'?'metal':'prop';
                delete part.normalTexture;delete part.metallicRoughnessTexture;
                Surface.apply([part],textures,()=>material==='glass'?null:material==='fabric'?'fabric':material==='velvet'?'velvet':material==='leather'?'leather':material==='metal'?'metal':'rubber');
            }
            return part;
        });
        const pivot=recipe.pivot==='attachment' ? anchor : low.map((v,k)=>k===1&&recipe.pivot==='bottom'?v:(v+high[k])/2);
        for(const p of parts) for(let k=0;k<p.positions.length;k++)p.positions[k]=(p.positions[k]-pivot[k%3])*recipe.scale;
        const referenced=new Set(parts.flatMap(p=>[p.texture,p.normalTexture,p.metallicRoughnessTexture,p.emissiveTexture].filter(Boolean)));for(const name of Object.keys(textures))if(!referenced.has(name))delete textures[name];
        const extent=Math.max(...high.map((v,k)=>(v-low[k])*recipe.scale),.05);
        const sidecarExtra=recipe.accessory.id==='ledMask'?{animations:LED_RULES.filter(r=>parts.some(p=>p.name===r.part)).map(r=>Object.assign({},r))}:undefined;
        return {kind:'accessory',recipe,parts,bones:[{name:'Prop',head:[0,0,0],parent:-1}],clips:[],textures,construction:generated.construction,sidecarExtra,
            height:extent, triangles:parts.reduce((n,p)=>n+p.index.length/3,0)};
    }
    // The LED mask's lights, by where they sit on the face: the eyes, the nose and the mouth each a part of their own
    // (the same material, its triangles split, nothing added), so a saved mask's `glow` rules light them apart.
    const LED_AREAS=[['eyes','LED mask eyes'],['nose','LED mask nose'],['mouth','LED mask mouth']];
    function ledRegions(parts) {
        const L=reference.marks||(reference.marks=Props.landmarks(reference.pack,reference.built)),out=[];
        const eyeY=L.eyeY,mouthY=L.mouth[1],noseY=L.noseTip[1];
        const areaOf=(x,y)=>Math.abs(x)>.05?null:y>eyeY-.02&&y<eyeY+.024?'eyes':y<(noseY+mouthY)/2+.004&&y>mouthY-.06?'mouth':y<eyeY-.02&&y>=(noseY+mouthY)/2+.004&&Math.abs(x)<.024?'nose':null;
        for(const p of parts){
            if(p.name!=='LED mask'||!p.emissiveTexture){out.push(p);continue;}
            const P=p.positions,I=p.index,n=P.length/3,groups={rest:[]};
            for(let t=0;t<I.length;t+=3){const a=I[t],b=I[t+1],c=I[t+2],x=(P[a*3]+P[b*3]+P[c*3])/3,y=(P[a*3+1]+P[b*3+1]+P[c*3+1])/3,z=(P[a*3+2]+P[b*3+2]+P[c*3+2])/3;
                const area=z>L.noseTip[2]-.05?areaOf(x-L.mouth[0],y):null;(groups[area||'rest']||(groups[area]=[])).push(a,b,c);}
            for(const [key,name] of [['rest',p.name],...LED_AREAS]){
                const idx=groups[key];if(!idx||!idx.length)continue;
                const map=new Int32Array(n).fill(-1),keep=[];for(const v of idx)if(map[v]<0){map[v]=keep.length;keep.push(v);}
                const q=Object.assign({},p,{name,index:Uint32Array.from(idx,v=>map[v])});
                for(const [k,arr] of Object.entries(p)){if(!ArrayBuffer.isView(arr)||k==='index'||arr.length%n)continue;const w=arr.length/n,copy=new arr.constructor(keep.length*w);keep.forEach((v,j)=>{for(let d=0;d<w;d++)copy[j*w+d]=arr[v*w+d];});q[k]=copy;}
                delete q.faceFollow;out.push(q);
            }
        }
        return out;
    }
    /** The LED mask's lights as model rules: the eyes breathe, the nose glows slowly, the mouth flickers as if talking. */
    const LED_RULES=[
        {name:'LED eyes',type:'glow',part:'LED mask eyes',trigger:'always',mode:'pulse',period:150,min:.15,max:1.1},
        {name:'LED nose',type:'glow',part:'LED mask nose',trigger:'always',mode:'pulse',period:95,min:.1,max:1},
        {name:'LED mouth',type:'glow',part:'LED mask mouth',trigger:'always',mode:'flicker',period:36,min:.05,max:1.15}];
    /** A random take on the same accessory: 'shape' its style, fit, size and options; 'colors' colors that suit what it is made of. */
    function random(seed,recipe,scope) {
        const R=Rand.roll(seed),r=normalize(recipe),def=Props.BY_ID.get(r.accessory.id),d=def.defaults,a=r.accessory,has=part=>Rand.covers(scope,part);
        if(has('shape')) {
            if(def.shapes)a.shape=R.pick(def.shapes)[0];
            for(const key of ['size','height','length','width']) if(d[key]!=null) a[key]=R.jitter(d[key]||1,key==='size'?0.08:0.2,0.05,3);
            if(d.up!=null)a.up=R.chance(0.3)?R.range(0.2,1):0;
            for(const [key,spec] of Object.entries(def.options||{})) a[key]=spec==='check'?R.chance(0.4):Array.isArray(spec[0])?R.pick(spec)[0]:R.range(spec[0],Math.min(spec[1],spec[0]+(spec[1]-spec[0])*0.6));
        }
        if(has('colors')) {
            const P=Rand.PALETTES,finish=Props.finishOf?Props.finishOf(def,a):def.finish;
            const main=def.group==='Jewelry'&&finish!=='felt'?P.precious:finish==='felt'?P.felt.concat(P.cloth):finish==='leather'?P.leather.concat(P.dark):finish==='plastic'?P.dark.concat(P.paint):finish==='wood'?P.wood:P.precious.concat(P.dark);
            a.color=R.pick(main);
            if(d.color2)a.color2=def.group==='Jewelry'||def.group==='Hats'?R.pick(P.jewel.concat(P.precious)):R.pick(P.cloth.concat(P.paint));
        }
        return normalize(r);
    }
    const api={normalize,prepare,build,random,randomScopes:[Rand.SCOPES.all,Rand.SCOPES.shape,Rand.SCOPES.colors],ready:()=>!!reference};
    root.RRAccessoryProp=api;
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    Model.register({id:'accessory',label:'Equipment',...api});
    // Where each accessory is listed: a group in Wearables, Weapons or Tools & Gear. Swords and daggers
    // are made by the Sword kind, books by Framed, and axes, spears, staffs, bows and shields by the
    // weapon kinds (Hafted, Staff, Bow, Shield), so those stay unlisted (their saved recipes still open).
    const GROUPS={
        hats:['wearables','Hats',61],face:['wearables','Face',62],masks:['wearables','Masks',63],jewelry:['wearables','Jewelry & Ties',64],
        back:['wearables','Capes & Packs',65],hands:['wearables','Nails & Claws',66],melee:['weapons','Axes, Bows & Shields',44],
        bags:['gear','Bags',71],tools:['gear','Tools',72],instruments:['gear','Instruments',73],sports:['gear','Sports',74],other:['gear','Other',79],
        cyber:['wearables','Cyberware',67]
    };
    const FROM_GROUP={Hats:'hats',Face:'face',Masks:'masks',Jewelry:'jewelry',Back:'back','Body details':'hands',Weapons:'melee',Performance:'instruments',Sports:'sports','Cyber faces':'cyber','Cyber masks':'cyber','HUD eyewear':'cyber',Implants:'cyber'};
    const BAGS=new Set(['satchel','beltPouch','canteen','suitcase']),UNLISTED=new Set(['sword','dagger','book','axe','spear','staff','bow','shield']);
    const groupOf=def=>def.group==='Bags and tools'?(BAGS.has(def.id)?'bags':'tools'):(FROM_GROUP[def.group]||'other');
    for(const [id,[parent,label,order]] of Object.entries(GROUPS)) Catalog.category({id:'acc-'+id,label,order,parent});
    for(const def of Props.PROPS) Catalog.add({id:'accessory-'+def.id,category:'acc-'+groupOf(def),label:def.label,hidden:UNLISTED.has(def.id),
        icon:'equipment',kind:'accessory',keywords:'accessory equipment wearable '+def.slot+' '+def.group.toLowerCase(),
        start:()=>normalize({accessory:{id:def.id}}),matches:r=>r.accessory?.id===def.id});
    // What the page shows for an accessory: the material slots its parts have, and whether its accent color shows.
    const slotCache=new Map(),accentCache=new Map();
    function slots(recipe) {
        if(!reference) return [];
        const key=JSON.stringify([recipe.accessory.id,recipe.accessory.shape,recipe.accessory.charm,recipe.accessory.studs]);
        if(!slotCache.has(key)) slotCache.set(key,[...new Set(build(recipe).parts.map(p=>p.name))]);
        return slotCache.get(key);
    }
    function usesAccent(recipe) {
        const id=recipe.accessory.id;
        if(!reference) return !!Props.BY_ID.get(id).defaults.color2;
        const key=JSON.stringify([id,recipe.accessory.shape,recipe.accessory.charm,recipe.accessory.studs]);
        if(!accentCache.has(key)) {
            const colors=c=>build(normalize({accessory:Object.assign({},recipe.accessory,{color2:c})})).parts.flatMap(p=>Array.from(p.colors||[]));
            const a=colors('#000000'),b=colors('#ffffff');
            accentCache.set(key,a.length!==b.length||a.some((v,k)=>Math.abs(v-b[k])>1e-4));
        }
        return accentCache.get(key);
    }
    const OPTION_LABELS={charm:'Charm',studs:'Studs',thick:'Thickness',billLength:'Bill length',pockets:'Pockets',vents:'Vents',style:'Style',wear:'Wear',glow:'Glow',pattern:'Pattern',sides:'Sides',cables:'Cables'};
    api.slots=slots; api.usesAccent=usesAccent;

    Catalog.ui('accessory',{
        placeholder:'Equipment',tabs:[['equipment','Equipment']],reset:r=>normalize({accessory:{id:r.accessory.id}}),
        // An unset color shows what the accessory draws: cyberware its style's plate and glow, the rest their defaults.
        effectiveColor(path) {
            const a=this.recipe.accessory,def=Props.BY_ID.get(a.id),key=path.split('.').pop(),Cyber=root.RRCharacterCyberGear;
            if(def.cyber&&Cyber&&Cyber.paletteOf){const p=Cyber.paletteOf(a);return key==='color2'?p.glowHex:p.plateHex;}
            return (def.defaults||{})[key]||'';
        },
        panel() {
            const r=this.recipe,def=Props.BY_ID.get(r.accessory.id),d=def.defaults,worn=def.slot!=='held';
            let html=this._section('Shape')+this._slider({path:'scale',label:'Overall size',range:[.1,5],step:.05,format:'x'});
            if(PAIRED.has(r.accessory.id))html+=this._slider({path:'pairGap',label:'Pair spacing',range:[0,.5],step:.005,format:'m'});
            if(def.shapes)html+=this._select('accessory.shape','Style',def.shapes);
            for(const key of ['size','height','length','width','up']) if(d[key]!=null) html+=this._slider({path:'accessory.'+key,label:{size:worn?'Fit':'Size',height:'Height',length:'Length',width:'Width',up:'Raised'}[key],range:[key==='up'?0:.05,3],step:.01});
            for(const [key,spec] of Object.entries(def.options||{})) {
                const label=OPTION_LABELS[key]||key;
                if(spec==='check')html+=this._check('accessory.'+key,label);
                else if(Array.isArray(spec[0]))html+=this._select('accessory.'+key,label,spec);
                else html+=this._slider({path:'accessory.'+key,label,range:spec,step:key==='pockets'||key==='vents'?1:.05});
            }
            html+=this._section('Look')+this._color('accessory.color','Color');
            // Cyberware leaves its colors empty for its style's own; its second color is its glow.
            if((d.color2||def.cyber)&&usesAccent(r))html+=this._color('accessory.color2',def.cyber?def.labels.color2:'Accent');
            const names=slots(r),plain=names.filter(n=>n!=='Lenses');
            if(!names.length)html+=this._select('material','Material',MATERIAL_CHOICES);
            for(const name of names) {
                const label=name==='Lenses'?'Lenses':['Material','Second material','Third material'][Math.min(2,plain.indexOf(name))];
                html+=this._select('materials.'+name,label,MATERIAL_CHOICES,r.materials[name]||r.material);
            }
            html+=this._section('Placement')+this._select('pivot','Origin',[['bottom','Bottom'],['center','Center'],['attachment','Attachment point']]);
            if(d.side)html+=this._select('accessory.side','Which side',[['left','Left'],['right','Right']]);
            for(const [i,label] of ['Rotate X','Rotate Y','Rotate Z'].entries())html+=this._slider({path:'rotation.'+i,label,range:[-180,180],step:1,format:'deg'});
            return html;
        }
    });
})(typeof window!=='undefined'?window:globalThis);
