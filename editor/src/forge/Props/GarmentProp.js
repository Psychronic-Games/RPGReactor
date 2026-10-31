/** Individual wardrobe garments, with their original skinning, as reusable Wearables. */
(function(root) {
    'use strict';
    const need=(name,file)=>root[name]||require(file);
    const Body=need('RRHumanBody','../Character3D/HumanBody.js');
    const Wardrobe=need('RRCharacterWardrobe','../Character3D/CharacterWardrobe.js');
    const Model=need('RRPropModel','./PropModel.js');
    const Catalog=need('RRPropCatalog','./PropCatalog.js');
    const Marks=need('RRCharacterMarks','../Character3D/CharacterMarks.js');
    const Rand=need('RRPropRandom','./PropRandom.js');
    const Transfer=need('RRCharacterOutfitTransfer','../Character3D/CharacterOutfitTransfer.js');
    const Clothes=need('RRCharacterClothes','../Character3D/CharacterClothes.js');
    const BUILTINS=new Set(Wardrobe.GARMENTS.map(g=>g.id));
    let pack,loading,prepared=false;
    function prepare() {
        if(prepared)return Promise.resolve();
        if(!loading)loading=Body.loadPack().then(async p=>{await Body.prepareAuthoring(p);pack=p;await Transfer.preload([...new Set(Wardrobe.GARMENTS.filter(g=>BUILTINS.has(g.id)).map(g=>g.transfer).filter(Boolean))]);prepared=true;}).finally(()=>{loading=null;});
        return loading;
    }
    function normalize(input={}) {
        const garment=Wardrobe.normalizeItem(input.garment)||Wardrobe.normalizeItem({id:'tshirt'});
        Object.assign(garment,Wardrobe.detailsOf(garment));
        const g=Wardrobe.BY_ID.get(garment.id),source=g.transfer&&Transfer.BUILT_IN.includes(g.transfer)?Transfer.load(g.transfer):null,sourceTailoring=!!g.transfer&&Transfer.BUILT_IN.includes(g.transfer)&&input.sourceTailoring!==false;
        return {kind:'garment',garment,sourceTailoring,body:Body.normalizeRecipe(sourceTailoring&&source?source.recipe:input.body||{})};
    }
    // The fallback names let ordinary humanoid rigs wear the same saved garment. Forge's full
    // skeleton is matched by name first, keeping its intermediate spine, shoulder and finger joints.
    const PARTS={Hips:'Hips',Spine:'Spine',Spine1:'Spine',Spine2:'Chest',Neck:'Neck',Head:'Head'};
    for(const side of ['Left','Right'])Object.assign(PARTS,{[side+'Shoulder']:'Chest',[side+'Arm']:side+'UpperArm',[side+'ForeArm']:side+'LowerArm',[side+'Hand']:side+'Hand',[side+'UpLeg']:side+'UpperLeg',[side+'Leg']:side+'LowerLeg',[side+'Foot']:side+'Foot',[side+'ToeBase']:side+'Foot'});
    /** Covered skin in the shared body's UV layout; independent of body proportions and subdivision. */
    function coverage(hidden) {
        const size=256,bits=new Uint8Array(size*size/8),UV=pack.body.uv,I=pack.body.index,src=pack.body.source;
        for(let t=0;t<I.length;t+=3) {
            const ids=[I[t],I[t+1],I[t+2]];
            if(!ids.every(v=>hidden.has(src[v])))continue;
            const [a,b,c]=ids.map(v=>[UV[v*2]*size,UV[v*2+1]*size]);
            const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);
            const area=cross(a,b,c);if(Math.abs(area)<1e-8)continue;
            const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],c[0]))),x1=Math.min(size-1,Math.ceil(Math.max(a[0],b[0],c[0])));
            const y0=Math.max(0,Math.floor(Math.min(a[1],b[1],c[1]))),y1=Math.min(size-1,Math.ceil(Math.max(a[1],b[1],c[1])));
            for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++) {
                const p=[x+.5,y+.5];if(cross(a,b,p)/area<0||cross(b,c,p)/area<0||cross(c,a,p)/area<0)continue;
                const i=y*size+x;bits[i>>3]|=1<<(i&7);
            }
        }
        const data=typeof Buffer!=='undefined'?Buffer.from(bits).toString('base64'):root.btoa(String.fromCharCode(...bits));
        return {layout:'reactor-human-1',size,data};
    }
    function build(input,cache={},options={}) {
        if(!pack)throw new Error('Garment reference is not ready. Call prepare() first.');
        const recipe=normalize(input),key=JSON.stringify(recipe.body);
        if(cache.garmentBody?.key!==key)cache.garmentBody={key,built:Body.build(pack,recipe.body)};
        const built=cache.garmentBody.built;
        const pictures=[recipe.garment.pattern==='emblem'?recipe.garment.emblemPicture:'',recipe.garment.mark?.shape==='picture'?recipe.garment.mark.picture:''].filter(Boolean);
        const picture=pictures.find(name=>!options.images?.[name]&&!cache.emblemPictures?.has(name))||pictures[0];
        for(const picture of pictures)if(picture&&options.images?.[picture]&&cache.emblemPictures?.get(picture)!==options.images[picture]) {
            cache.emblemPictures=cache.emblemPictures||new Map();cache.emblemPictures.set(picture,options.images[picture]);delete cache.atlas;
        }
        cache.atlasSize=cache.atlasSize||2048;
        cache.sourceRest=recipe.sourceTailoring;cache.fullLining=true; // Standalone clothes can be inspected all the way inside.
        const outfit=Wardrobe.build(pack,built,[recipe.garment],cache);
        const parts=outfit.parts.map(p=>Object.assign({},p,{kind:p.kind||(p.metalness>.5?'metal':'cloth')}));
        // Hand armor includes a skin-cut glove outside the ordinary garment entries.
        // Give its open wrist an inward surface too, retaining every finger's skin weights.
        for(const p of parts.slice())if(p.name==='Gauntlet gloves'||p.name==='Power armor undersuit'){
            p.doubleSided=true;const positions=Float32Array.from(p.positions,(x,i)=>x-p.normals[i]*.0008*built.height/1.7),normals=Float32Array.from(p.normals,x=>-x),index=Uint32Array.from(p.index);
            for(let i=0;i<index.length;i+=3)[index[i+1],index[i+2]]=[index[i+2],index[i+1]];
            parts.push({...p,name:p.name+' inner surface',positions,normals,index,rrLining:true,colors:p.colors?Float32Array.from(p.colors,x=>x*.65):p.colors});
        }
        (root.RRPropArmorInterior||require('./PropArmorInterior.js')).apply(parts,built.height/1.7);
        const Fabric=need('RRCharacterFabric','../Character3D/CharacterFabric.js');
        for(const part of parts)if(part.rrLining&&(!part.normalTexture||!part.texture)){
            if(!part.colors){const color=(root.RRCharacterOutfit||require('../Character3D/CharacterOutfit.js')).linear(part.color||'#50545a');part.colors=Float32Array.from({length:part.positions.length},(_,i)=>color[i%3]*.7);}
            Fabric.applyTo(part,part.fabric||(part.metalness>.1?'brushed':'poplin'),outfit.textures,{albedo:true,normalScale:.20,roughness:part.roughness??.85});
        }
        // A stationary clip keeps the file's skin live in the model loader. It is not an
        // outfit animation: once equipped, the wearer's existing skeleton drives the mesh.
        const times=Float32Array.of(0,1),values=Float32Array.of(0,0,0,1,0,0,0,1);
        const clips=[{name:'Wearable bind',times,tracks:[{bone:0,values}]}];
        const wear={mode:'skinned',slot:Wardrobe.BY_ID.get(recipe.garment.id).slot,skin:coverage(outfit.hidden),
            hideHair:Wardrobe.HAIR_COVERS.has(recipe.garment.id),hideBeard:Wardrobe.FACE_COVERS.has(recipe.garment.id)||recipe.garment.id==='gasMask',
            bones:built.bones.map(b=>({name:b.name,part:PARTS[b.name.replace(/(Thumb|Index|Middle|Ring|Pinky)\d$/,'')],head:b.head.slice(),tail:b.tail?.slice(),parent:b.parent}))};
        const textures=Object.fromEntries((outfit.textures||[]).map(t=>[t.name,t]));
        if(outfit.texture)textures[outfit.texture.name]=outfit.texture;
        const used=new Set(parts.flatMap(p=>[p.texture,p.normalTexture,p.metallicRoughnessTexture,p.emissiveTexture].filter(Boolean)));
        for(const name of Object.keys(textures))if(!used.has(name))delete textures[name];
        return {kind:'garment',recipe,parts,bones:built.bones,clips,previewClips:[],textures,height:built.height,
            imageMissing:!!(picture&&!cache.emblemPictures?.has(picture)),imageName:picture||'',
            sidecarExtra:{wear},triangles:parts.reduce((n,p)=>n+p.index.length/3,0)};
    }
    function random(seed,input,scope) {
        const r=normalize(input),g=Wardrobe.BY_ID.get(r.garment.id),R=Rand.roll(seed),has=part=>Rand.covers(scope,part);
        if(has('shape')) {
            for(const key of g.knobs||Object.keys(KNOBS).filter(k=>r.garment[k]!=null))if(KNOBS[key]&&r.garment[key]!=null) {
                const [,a,b]=KNOBS[key],v=r.garment[key],delta=(b-a)*.18;
                r.garment[key]=R.range(Math.max(a,v-delta),Math.min(b,v+delta));
            }
            if(g.styles)r.garment.style=R.pick(g.styles)[0];
            for(const d of g.details||[])r.garment[d.id]=d.toggle?R.chance(.75):R.pick(d.choices)[0];
        }
        if(has('colors')) {
            const palette=r.garment.material==='leather'?Rand.PALETTES.leather:r.garment.material==='metal'?Rand.PALETTES.precious:Rand.PALETTES.cloth;
            r.garment.color=R.pick(palette);r.garment.color2=R.pick(palette);r.garment.trim=R.pick(palette);
        }
        return normalize(r);
    }
    function randomScopes(recipe) {
        const r=normalize(recipe),g=Wardrobe.BY_ID.get(r.garment.id);
        const shape=(g.knobs||Object.keys(KNOBS).filter(k=>r.garment[k]!=null)).some(k=>KNOBS[k])||g.styles?.length||g.details?.length;
        return [Rand.SCOPES.all,...(shape?[Rand.SCOPES.shape]:[]),Rand.SCOPES.colors];
    }
    const api={prepare,normalize,build,random,randomScopes,supports:id=>BUILTINS.has(id),ready:()=>prepared};
    root.RRGarmentProp=api;
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
    Model.register({id:'garment',label:'Clothing',...api});
    const GROUPS={tops:['Tops & Jackets',68],bottoms:['Trousers & Skirts',69],full:['Full outfits',70],dresses:['Dresses & Robes',70.1],armor:['Armor',71],feet:['Footwear',72],hands:['Gloves & Armwear',72.1],layers:['Underlayers',73],swim:['Swimwear',73.1],other:['Belts & Accessories',74]};
    const groupOf=g=>{
        if(['beanie','hood','helm','greathelm','powerhelm','visorhelm','headWrap'].includes(g.id))return 'acc-hats';
        if(g.id==='gasMask')return 'acc-masks';if(g.id==='dustGoggles')return 'acc-face';
        if(['shemagh','shawl','poncho'].includes(g.id))return 'acc-back';
        if(['harness','utilityRig'].includes(g.id))return 'acc-packs';
        if(['mh_sundress','ss_vay_robes'].includes(g.id))return 'garment-dresses';
        if(['swimBriefs','bikiniTop','bikiniBottom','swimsuit','swimTrunks','wetsuit','triathlonSuit'].includes(g.id))return 'garment-swim';
        const group=g.id==='corset'?'tops':['under','underwearBottom','underwearTop','hosiery'].includes(g.slot)?'layers':
            g.slot==='bottom'?'bottoms':g.slot==='dress'?(g.modeled||g.transfer||['starshipUniform','explorerSuit','evaSuit','spacesuit','coveralls','scrubs','uniform'].includes(g.id)?'full':'dresses'):
            ['top','over'].includes(g.slot)?'tops':['armor','mail','legarmor','shoulders','hips','chestRig'].includes(g.slot)?'armor':
            g.slot==='feet'?'feet':['hands','wrists'].includes(g.slot)?'hands':'other';
        return 'garment-'+group;
    };
    for(const [id,[label,order]]of Object.entries(GROUPS))Catalog.category({id:'garment-'+id,label,order,parent:'wearables'});
    for(const g of Wardrobe.GARMENTS)if(BUILTINS.has(g.id))Catalog.add({id:'garment-'+g.id,kind:'garment',category:groupOf(g),genre:g.group==='Sci-fi'||g.group==='Cyberpunk'?'scifi':g.group==='Wasteland'?'wasteland':g.group==='Fantasy'||g.group==='Armor'?'fantasy':'modern',label:g.label,icon:'equipment',
        keywords:'clothing garment outfit wearable equipment '+g.group+' '+g.slot+' '+(g.id==='tacticalTrousers'?'tactical pants combat special forces utility ':g.id==='honeycombShirt'?'hexagonal futuristic hex ':g.id==='circuitShirt'?'circuitry pcb futuristic ':'')+Wardrobe.PRESETS.filter(p=>p.items.some(i=>i.id===g.id)).map(p=>p.label+' '+p.group).join(' '),
        start:current=>normalize({garment:{id:g.id},body:current?.kind==='garment'?current.body:{}}),matches:r=>r.garment?.id===g.id});
    const KNOBS={sleeves:['Sleeves',0,1],length:['Length',0,1.4],fit:['Looseness',0,1.5],flare:['Flare',0,1.5],bell:['Bell sleeves',0,1],open:['Open front',0,1],face:['Covers face',0,1],bulk:['Bulk',0,1.5]};
    const cap=s=>s[0].toUpperCase()+s.slice(1);
    Catalog.ui('garment',{
        placeholder:'Clothing',tabs:[['garment','Garment'],['fit','Body Fit']],reset:r=>normalize({garment:{id:r.garment.id},body:r.body,sourceTailoring:r.sourceTailoring}),
        act(act) {if(act==='garment-emblem')this._choosePicture(this.recipe.garment.emblemPicture,name=>{const next=JSON.parse(JSON.stringify(this.recipe));next.garment.emblemPicture=name;this._replace(next);});},
        panel(tab) {
            if(tab==='fit') {
                let html=this._section('Body Fit');const g=Wardrobe.BY_ID.get(this.recipe.garment.id);if(g.transfer&&Transfer.BUILT_IN.includes(g.transfer)){html+=this._check('sourceTailoring','Preserve original tailoring');if(this.recipe.sourceTailoring)return html+`<p class="rr-c3d-note">${this._t('Uses the authored proportions. Turn this off to fit another body.')}</p>`;}
                for(const [key,label,range]of [['gender','Gender',[0,1]],['height','Height',[0,1]],['weight','Weight',[0,1]],['muscle','Muscle',[0,1]],['cup','Bust',[0,1]]])
                    html+=this._slider({path:'body.'+key,label,range:[Math.min(range[0],this.recipe.body[key]),Math.max(range[1],this.recipe.body[key])],step:.01,ends:key==='gender'?['Female','Male']:key==='weight'?['Thin','Heavy']:undefined});
                return html+`<p class="rr-c3d-note">${this._t('Match the character’s body settings for the closest fit. Saved clothing bends with the wearer when assigned to an Armor model.')}</p>`;
            }
            const item=this.recipe.garment,g=Wardrobe.BY_ID.get(item.id);
            let html=this._section('Shape');
            if(g.styles)html+=this._select('garment.style','Style',g.styles);
            for(const key of g.knobs||Object.keys(KNOBS).filter(k=>item[k]!=null)) {
                if(key==='neckline')html+=this._select('garment.neckline','Neckline',Wardrobe.NECKLINE_CHOICES);
                else if(KNOBS[key]) {const [label,a,b]=KNOBS[key];html+=this._slider({path:'garment.'+key,label,range:[a,b],step:.01});}
            }
            const details=Wardrobe.detailsOf(item);
            for(const d of g.details||[])html+=d.toggle?this._check('garment.'+d.id,d.label,details[d.id]):this._select('garment.'+d.id,d.label,d.choices,details[d.id]);
            html+=this._section('Look')+this._color('garment.color','Color');
            const regions=g.modeled&&pack?Clothes.load(pack).garments.get(g.id)?.regions:0;
            if(!g.modeled||regions>1||g.id==='mh_viking_tunic')html+=this._color('garment.color2',g.id==='mh_viking_tunic'?'Mail color':'Second color');
            if(!g.modeled||g.id==='mh_viking_tunic')html+=this._color('garment.trim',g.id==='mh_viking_tunic'?'Embroidery color':'Trim');
            if(g.id==='mh_viking_tunic')html+=this._slider({path:'garment.textureContrast',label:'Fabric contrast',range:[.5,1.5],step:.01});
            if(!g.modeled&&!g.transfer)html+=this._select('garment.material','Material',Object.keys(Wardrobe.MATERIAL).map(m=>[m,cap(m)]))+
                this._select('garment.pattern','Pattern',Wardrobe.PATTERNS)+
                this._slider({path:'garment.trimWidth',label:'Trim width',range:[0,.25],step:.01})+
                this._slider({path:'garment.wear',label:'Wear',range:[0,1],step:.01});
            if(item.pattern==='emblem')html+=`<button class="rr-btn-chip" data-act="garment-emblem">${this._t('Emblem picture')}: ${root.rrEscapeHtml(item.emblemPicture||this._t('Choose…'))}</button>`;
            if(g.defaults.lightStyle!=null)html+=this._select('garment.lightStyle','Light layout',[['none','None'],['badge','Badge'],['strips','Light strips'],['circuits','Circuit traces']])+
                this._color('garment.lightColor','Light color')+this._slider({path:'garment.lightIntensity',label:'Light brightness',range:[0,1],step:.01})+
                this._slider({path:'garment.lightWidth',label:'Light width',range:[.4,2.5],step:.05});
            if(Marks.supports(g,item))html+=Marks.panel(this,'garment.mark',item.mark,{garment:true});
            return html;
        }
    });
})(typeof window!=='undefined'?window:globalThis);
