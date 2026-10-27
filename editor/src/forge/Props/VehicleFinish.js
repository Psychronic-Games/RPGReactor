/** Vehicle coatings, physical surface maps and surface-clipped printed artwork.
 * All data is generated locally and exports through ordinary glTF materials. */
(function(root){
    'use strict';
    const need=(n,f)=>root[n]||(typeof require==='function'?require(f):null),CM=need('RRContainerMesh','./ContainerMesh.js'),Paint=need('RRPropPaint','./PropPaint.js'),CP=need('RRContainerPaint','./ContainerPaint.js'),Typeface=need('RRVehicleTypeface','./VehicleTypeface.js'),Panels=need('RRVehiclePanels','./VehiclePanels.js'),Design=need('RRFlagDesign','./FlagDesign.js');
    const {add,sub,scale,dot,norm,cross}=CM.vec,clamp=v=>Math.max(0,Math.min(1,v)),mix=(a,b,t)=>a+(b-a)*t,fract=v=>v-Math.floor(v),mapsCache=new Map();
    const hash=(x,y,z=0)=>fract(Math.sin(x*127.1+y*311.7+z*74.7)*43758.5453),linear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4;
    const rgb=h=>Paint.hex(h).map(v=>v/255),lin=h=>rgb(h).map(linear);
    function maps(role){
        if(mapsCache.has(role))return mapsCache.get(role);
        const size=['enamel','powder','brushed','composite','metal'].includes(role)?512:256,n=size*size,albedo=new Uint8Array(n*4),normal=new Uint8Array(n*4),surface=new Uint8Array(n*4);
        const fields=new Float32Array(n),rough=new Float32Array(n),tone=new Float32Array(n);
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
            const i=y*size+x,u=x/size,v=y/size,a=hash(x,y),coarse=hash(Math.floor(x/4),Math.floor(y/4)),brush=Math.sin(y*Math.PI/2)+.4*Math.sin(y*Math.PI/8),weave=Math.floor(x/12)%4<2?1:0,other=Math.floor(y/12)%4<2?1:0;
            let h=(a-.5)*.035,t=.99,r=.92;
            if(role==='enamel'){h=(a-.5)*.09+(coarse-.5)*.05;r=.78+.20*coarse;t=.97+.03*a;}
            if(role==='powder'){h=(a-.5)*.30+(coarse-.5)*.12;r=.84+.15*a;t=.94+.05*coarse;}
            if(role==='brushed'||role==='metal'){h=brush*.14+(a-.5)*.08;r=.56+.30*hash(0,y);t=.86+.10*hash(0,y)+.03*a;}
            if(role==='composite'){const warp=(weave===other),fiber=warp?Math.sin(x*Math.PI/3):Math.sin(y*Math.PI/3),d=warp?fract(x/24):fract(y/24);h=(warp?.13:-.13)+Math.sin(d*Math.PI)*.14+fiber*.025;t=(warp?.62:.80)+.12*Math.sin(d*Math.PI)+fiber*.035;r=.66+.19*(1-Math.sin(d*Math.PI));}
            if(role==='rubber'){h=(a-.5)*.23;t=.80+.12*coarse;r=.90+.09*a;}
            if(role==='polymer'){h=(a-.5)*.17;t=.91+.06*coarse;r=.86+.12*a;}
            if(role==='fabric'){h=Math.sin(x*Math.PI/2)*Math.sin(y*Math.PI/2)*.20;t=.83+.10*Math.sin(x*Math.PI/2)*Math.sin(y*Math.PI/2);r=.90+.09*a;}
            // Sparse hairline scoring is part of the coating, at a millimeter
            // scale; larger wear is located on actual panel boundaries below.
            const score=hash(Math.floor(x/90),y)>.989&&fract(x/90)<.78;
            if(score&&role!=='fabric'){h-=.07;t*=.88;r=Math.min(1,r+.10);}
            fields[i]=h;rough[i]=r;tone[i]=t;
        }
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
            const at=(xx,yy)=>fields[((yy+size)%size)*size+(xx+size)%size],i=y*size+x,k=i*4,dx=(at(x+1,y)-at(x-1,y))*.60,dy=(at(x,y+1)-at(x,y-1))*.60,l=Math.hypot(dx,dy,1),t=Math.round(255*clamp(tone[i]));
            albedo.set([t,t,t,255],k);normal.set([Math.round(128-dx/l*127),Math.round(128-dy/l*127),Math.round(128+127/l),255],k);surface.set([255,Math.round(rough[i]*255),255,255],k);
        }
        const resource=(suffix,data)=>({name:'vehicle-'+role+'-'+suffix+'.png',width:size,height:size,data,repeat:true}),out={albedo:resource('albedo',albedo),normal:resource('normal',normal),surface:resource('surface',surface)};
        mapsCache.set(role,out);return out;
    }
    /** Average the micro finish over a baked texel's physical footprint.
     * Point-sampling a 2560 texel/m finish into a 180 texel/m atlas turned
     * submillimeter grain into large, aliased dents and stripes. */
    function filteredMaps(role,footprint){
        const m=maps(role),level=Math.max(0,Math.min(6,Math.ceil(Math.log2(Math.max(1,footprint)))));
        if(!m.levels)m.levels=[m];
        while(m.levels.length<=level){const previous=m.levels.at(-1),size=previous.albedo.width/2,next={};
            for(const key of ['albedo','normal','surface']){const source=previous[key],data=new Uint8Array(size*size*4);for(let y=0;y<size;y++)for(let x=0;x<size;x++)for(let c=0;c<4;c++){let sum=0;for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++)sum+=source.data[((y*2+dy)*source.width+x*2+dx)*4+c];data[(y*size+x)*4+c]=Math.round(sum/4);}next[key]={width:size,height:size,data};}m.levels.push(next);
        }
        return m.levels[level];
    }
    /** One projection per triangle. Split only vertices shared by different
     * projections; smoothly curved normals must not change UV axes mid-face. */
    function unwrap(p){
        const attrs=['positions','normals','joints','weights'],out=Object.fromEntries(attrs.filter(k=>p[k]).map(k=>[k,[]])),uv=[],indices=[],seen=new Map(),charts=[];
        for(let k=0;k<p.index.length;k+=3){const ids=Array.from(p.index.subarray(k,k+3)),a=ids.map(i=>Array.from(p.positions.subarray(i*3,i*3+3))),f=cross(sub(a[1],a[0]),sub(a[2],a[0])),axis=f.map(Math.abs).indexOf(Math.max(...f.map(Math.abs))),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1];
            for(const old of ids){const chart=axis*2+(f[axis]<0?0:1),key=old*6+chart;let id=seen.get(key);if(id===undefined){id=uv.length/2;seen.set(key,id);charts.push(chart);for(const [name,data]of Object.entries(out)){const stride=name==='joints'||name==='weights'?4:3;for(let j=0;j<stride;j++)data.push(p[name][old*stride+j]);}uv.push(p.positions[old*3+axes[0]]*5,p.positions[old*3+axes[1]]*5);}indices.push(id);}
        }
        for(const [name,data]of Object.entries(out))p[name]=new p[name].constructor(data);p.uvs=Float32Array.from(uv);p.index=Uint32Array.from(indices);p._surfaceCharts=Uint8Array.from(charts);
    }
    function bounds(p){const lo=[Infinity,Infinity,Infinity],hi=lo.map(()=>-Infinity);for(let i=0;i<p.positions.length;i++) {const k=i%3;lo[k]=Math.min(lo[k],p.positions[i]);hi[k]=Math.max(hi[k],p.positions[i]);}return{lo,hi,mid:lo.map((v,k)=>(v+hi[k])/2)};}
    function fittings(parts,r){
        if(!r.details)return;const steel=[],recesses=[],W=r.width,H=r.height,L=r.length,radius=Math.min(W,H,L)*.004;
        const attach=(p,F,x,y)=>{
            let best=null,depth=-Infinity;
            for(let k=0;k<p.index.length;k+=3){const ids=[p.index[k],p.index[k+1],p.index[k+2]],P=ids.map(i=>Array.from(p.positions.subarray(i*3,i*3+3))),N=ids.map(i=>Array.from(p.normals.subarray(i*3,i*3+3))),uv=P.map(p=>{const d=sub(p,F.o);return[dot(d,F.u),dot(d,F.v),dot(d,F.n)];}),[a,b,c]=uv,den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-10)continue;
                const u=((b[1]-c[1])*(x-c[0])+(c[0]-b[0])*(y-c[1]))/den,v=((c[1]-a[1])*(x-c[0])+(a[0]-c[0])*(y-c[1]))/den,t=1-u-v;if(Math.min(u,v,t)<-.00001)continue;
                const n=norm([0,1,2].map(j=>N[0][j]*u+N[1][j]*v+N[2][j]*t)),d=a[2]*u+b[2]*v+c[2]*t;if(dot(n,F.n)<.28||Math.abs(d)>Math.max(W,H)*.25||d<depth)continue;
                depth=d;best={point:[0,1,2].map(j=>P[0][j]*u+P[1][j]*v+P[2][j]*t),n};
            }
            if(!best)return;const u=norm(sub(F.u,scale(best.n,dot(F.u,best.n)))),v=cross(best.n,u),frame=CM.frame(add(best.point,scale(best.n,.00025)),u,v),R=radius;
            steel.push(CM.revolveOn(frame,0,0,[[R*.76,0],[R*1.20,0],[R*1.20,R*.18],[R*.76,R*.18],[R*.76,0]],20));
            steel.push(CM.revolveOn(frame,0,0,[[0,R*.12],[R*.88,R*.12],[R*.88,R*.54],[R*.48,R*.54],[R*.48,R*.27],[0,R*.27]],12));
            recesses.push(CM.revolveOn(frame,0,0,[[0,R*.18],[R*.47,R*.18],[R*.47,R*.32],[0,R*.32]],6));
        };
        const panel=(name,axis,sign,corners=4)=>{const p=parts.find(p=>p.name===name);if(!p)return;const b=bounds(p),o=b.mid.slice();o[axis]=sign>0?b.hi[axis]:b.lo[axis];const F=CM.frame(o,axis===0?[0,0,-sign]:[1,0,0],axis===1?[0,0,-1]:[0,1,0]),a=axis===0?2:0,d=axis===1?2:1,w=(b.hi[a]-b.lo[a])*.34,h=(b.hi[d]-b.lo[d])*.31;
            for(const x of [-w,w])for(const y of corners===2?[h]:[-h,h])attach(p,F,x,y);
        };
        if(['rover','truck','sport'].includes(r.form))panel('Formed bonnet panel',1,1,r.form==='sport'?2:4);
        if(r.form==='rover')for(const s of [-1,1])panel('Replaceable armor',0,s);
        if(r.form==='motorcycle')for(const s of [-1,1])panel('Side fairings',0,s);
        if(['hover','shuttle'].includes(r.form)){for(const s of [-1,1])panel('Formed side equipment bays',0,s);panel('Rear hatch',2,-1);}
        if(r.form==='drone')panel('Battery cartridge',1,1);
        if(r.form==='walker')panel('Sloped chest plate',2,1);
        for(const [meshes,name,color,role]of [[steel,'Seated panel fasteners','#9ca5a8','metal'],[recesses,'Fastener hex sockets','#20272b','dark']])if(meshes.length){const p=CM.merge(meshes);CM.skin(p,0);parts.push({...p,name,color,surfaceRole:role,roughness:.38,metalness:role==='metal'?.80:0});}
    }
    function colorSurface(p,r){
        const own=lin(p.color),dirt=lin('#625345'),primer=lin('#5c6468'),bare=lin('#8d979b'),b=bounds(p),extent=b.hi.map((v,k)=>v-b.lo[k]),P=p.positions,N=p.normals,C=new Float32Array(P.length),painted=['paint','secondary','armor','cargo'].includes(p.surfaceRole);
        const welded=new Map(),key=i=>[0,1,2].map(k=>Math.round(P[i*3+k]*1e4)).join(',');
        if(painted)for(let i=0;i<P.length/3;i++){const k=key(i);let v=welded.get(k);if(!v){v=[0,0,0,0];welded.set(k,v);}for(let a=0;a<3;a++)v[a]+=N[i*3+a];v[3]++;}
        for(let i=0;i<P.length/3;i++){
            const x=P[i*3],y=P[i*3+1],z=P[i*3+2],n=Array.from(N.subarray(i*3,i*3+3)),axis=n.map(Math.abs).indexOf(Math.max(...n.map(Math.abs))),axes=[0,1,2].filter(a=>a!==axis&&extent[a]>.025),distance=Math.min(...axes.map(a=>Math.min(P[i*3+a]-b.lo[a],b.hi[a]-P[i*3+a]))),edge=clamp(1-distance/.018),v=painted?welded.get(key(i)):null,corner=v?clamp((1-Math.hypot(v[0],v[1],v[2])/v[3])*3):0;
            // A part may carry zones (an armored shell's darker under-frame band).
            const base=p.zone?p.zone(x,y,z)||own:own;
            const a=hash(Math.floor(x*170),Math.floor(y*170),Math.floor(z*170)+r.surfaceSeed),blotch=hash(Math.floor(x*13),Math.floor(y*13),Math.floor(z*13)+r.surfaceSeed),low=clamp(1-y/(r.height*.55)),grime=r.grime*(.08+low*.70+edge*.16)*( .45+.55*blotch),scuff=painted?r.wear*Math.max(corner,edge*.65)*clamp((a-.40)*2):0;
            for(let c=0;c<3;c++){
                let value=base[c]*(1-r.wear*.05*(.3+blotch));
                value=mix(value,mix(primer[c],bare[c],a),scuff*.76);
                value=mix(value,dirt[c]*.55,grime*.62);
                C[i*3+c]=value;
            }
        }
        p.colors=C;
    }
    const coatingKey=r=>JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>!['markings','livery','windowOpacity','seatColor','trim','glass','insignia'].includes(k))));
    function apply(parts,textures,r,cache={},options={}){
        const look=new Set(['paint','secondary','trim','accent','glass','roughness','finish','wear','grime','surfaceSeed','livery','markings','windowOpacity','seatColor','insignia']),geometryKey=JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k])=>!look.has(k))));
        if(cache.vehicleGeometry?.key!==geometryKey)cache.vehicleGeometry={key:geometryKey,parts:new Map()};
        // A window, seat or marking edit can reuse the full coating even
        // while its input is being dragged; only changed paint needs rebaking.
        const sameCoating=cache.vehicleCoating?.key===coatingKey(r),size=sameCoating&&cache.vehicleCoating?.size===1024?1024:options.textureSize===512?512:1024,coatingCached=sameCoating&&cache.vehicleCoating?.size===size;

        for(const p of parts){
            const material=p.surfaceRole;
            if(material==='glass'&&(/glass$|canopy|windscreen/i.test(p.name))&&r.interior)p.opacity=r.windowOpacity;
            if(['glass','light','red','glow'].includes(material))continue;
            const role=['paint','secondary','armor','cargo'].includes(material)?r.finish:material==='frame'?'powder':material==='metal'||material==='accent'?'metal':material==='seat'?'fabric':material==='rubber'?(/seat/i.test(p.name)?'fabric':'rubber'):'polymer',m=maps(role);
            const geometryId=p.name+'|'+material,stored=cache.vehicleGeometry.parts.get(geometryId);
            if(stored){for(const [key,value]of Object.entries(stored))p[key]=key==='uvs'?Float32Array.from(value):value;}
            else{unwrap(p);cache.vehicleGeometry.parts.set(geometryId,Object.fromEntries(['positions','normals','uvs','index','joints','weights','_surfaceCharts'].map(k=>[k,p[k]])));p.uvs=Float32Array.from(p.uvs);}
            const box=bounds(p),extents=box.hi.map((v,k)=>v-box.lo[k]).sort((a,b)=>b-a),large=['paint','secondary','armor','cargo'].includes(material)&&extents[1]>=.085;
            if(!coatingCached||!large)colorSurface(p,r);

            p.texture=m.albedo.name;p.normalTexture=m.normal.name;p.normalScale=role==='powder'?.65:role==='composite'?.75:.40;p.metallicRoughnessTexture=m.surface.name;
            for(const key of ['albedo','normal','surface']){const t=m[key];textures[t.name]=t;}
            if(['paint','secondary','armor','cargo'].includes(material)){p.metalness=r.finish==='brushed'?.78:r.finish==='composite'?.18:.12;p.roughness=Math.max(.18,Math.min(.95,r.roughness+(r.finish==='powder'?.22:r.finish==='composite'?-.08:0)+r.wear*.12));}
        }
        bakePanels(parts,textures,r,cache,size);
    }
    /** Panel kit for one painted part: what the panel layer may draw on it. */
    function kitOf(p,r){
        const n=p.name,style=r.bodyStyle||'rounded',f=r.form;
        if(/wheel arch|divider|mullion|Turbine casings|Lift fan|Access door|Formed bonnet panel|Rear hatch$|Tailgate|Aero rear wing|Cargo|cargo/i.test(n))return null;
        if(/armor plate|Bolted|Replaceable armor|Plate armor/i.test(n))return'plate';
        if(n==='Sculpted body shell')return style==='armored'?'armor':style==='faceted'?'utility':'coach';
        if(n==='Crowned roof panel')return style==='rounded'?null:'roof';
        if(/Formed side equipment bays|Nose access panels/.test(n))return'bay';
        if(['hover','shuttle'].includes(f)&&/hull|keel|spine|Canopy spine/i.test(n))return'hull';
        if(['walker','drone'].includes(f))return'mech';
        return null;
    }
    /** Lettering and artwork regions the panel layer leaves clean: [{o,u,v,n,hw,hh,depth}]. */
    function keepouts(parts,r){
        const out=[],L=r.length;
        for(const s of markingSpecs(parts,r)){
            let F=s.F,w=s.w,h=s.h;
            if(s.type==='equipment'){F={...s.F,o:add(s.F.o,scale(s.F.v,s.h*.22))};w=s.w*.82;h=s.h*.40;
                if(s.p.name==='Formed side equipment bays'){F.o=F.o.slice();F.o[2]=L*.16;w=Math.min(s.w*.42,L*.20);}
                if(s.p.name==='Formed avionics shell'){F.o=F.o.slice();F.o[2]=L*.17;w=r.width*.20;h=L*.10;}
                if(s.p.name==='Side fairings'){F={...s.F,o:add(s.F.o,scale(s.F.v,-s.h*.14))};h=s.h*.36;w=s.w*.78;}
            }
            out.push({o:F.o,u:F.u,v:F.v,n:F.n,hw:w/2+.05,hh:h/2+.04,depth:Math.max(s.depth,.12)});
        }
        for(const s of insigniaSpots(parts,r))out.push({o:s.F.o,u:s.F.u,v:s.F.v,n:s.F.n,hw:s.size/2+.04,hh:s.size/2+.04,depth:Math.max(s.depth,.12)});
        return out;
    }
    /** Bake large panels into individual surface charts. Material variation is
     * evaluated in world meters; opposite sides do not share a repeated stain.
     * Each chart also receives the panel layer (VehiclePanels): seams, rivets,
     * vents, grilles, hatches and stencils as height, AO and roughness, with
     * grime in the cavities and wear on what stands proud. Charts get a
     * bounded atlas; small fittings retain shared micro maps. */
    function bakePanels(parts,textures,r,cache,size){
        const charts=[],chosen=[],slotNames=['vehicle-coating-albedo.png','vehicle-coating-normal.png','vehicle-coating-surface.png'];
        for(const p of parts){
            if(!['paint','secondary','armor','cargo'].includes(p.surfaceRole))continue;
            const b=bounds(p),size=b.hi.map((v,k)=>v-b.lo[k]);if(size.slice().sort((a,b)=>b-a)[1]<.085)continue;
            const byChart=new Map();
            for(let i=0;i<p._surfaceCharts.length;i++){
                const id=p._surfaceCharts[i],axis=Math.floor(id/2),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1];let c=byChart.get(id);
                if(!c){c={p,id,axis,sign:id%2?1:-1,axes,lo:[Infinity,Infinity],hi:[-Infinity,-Infinity],tris:[]};byChart.set(id,c);}
                for(let k=0;k<2;k++){const value=p.positions[i*3+axes[k]];c.lo[k]=Math.min(c.lo[k],value);c.hi[k]=Math.max(c.hi[k],value);}
            }
            for(let k=0;k<p.index.length;k+=3){const id=p._surfaceCharts[p.index[k]];byChart.get(id).tris.push(k);}
            const list=[...byChart.values()].filter(c=>c.hi[0]-c.lo[0]>1e-7&&c.hi[1]-c.lo[1]>1e-7);
            if(!list.length)continue;
            // Undersides are seldom seen: a third of the texel density.
            for(const c of list){c.w=c.hi[0]-c.lo[0];c.h=c.hi[1]-c.lo[1];c.k=c.axis===1&&c.sign<0?.34:1;charts.push(c);}chosen.push({p,byChart,list});
        }
        if(!charts.length)return;
        // Fixed maximum 2048×2048 (512×1024 for quick drags), texel density
        // reduced for very large recipes; tallest charts are shelved first.
        charts.sort((a,b)=>b.h*b.k-a.h*a.k||b.w*b.k-a.w*a.k);
        const quick=size===512,maxW=quick?512:2048,maxH=quick?1024:2048;
        let density=quick?95:330,layout;
        for(let attempt=0;attempt<16;attempt++){
            const a={width:maxW,shelfY:0,shelfH:0,cursorX:0};let used=0;
            for(const c of charts){const w=Math.max(12,Math.min(maxW-16,Math.ceil(c.w*density*c.k))),h=Math.max(12,Math.min(maxH-16,Math.ceil(c.h*density*c.k)));if(a.cursorX+w+8>a.width){a.shelfY+=a.shelfH;a.shelfH=0;a.cursorX=0;}c.rect={x:a.cursorX+4,y:a.shelfY+4,w,h};a.cursorX+=w+8;a.shelfH=Math.max(a.shelfH,h+8);used=Math.max(used,c.rect.y+h+4);if(used>maxH)break;}
            if(used<=maxH){layout={width:maxW,height:used<=maxH/2?maxH/2:maxH};break;}density*=.88;
        }
        if(!layout)throw Error('Vehicle coating atlas could not fit its bounded charts');
        const key=coatingKey(r),previous=cache.vehicleCoating;
        let resources;
        if(previous&&previous.key===key&&previous.layout===JSON.stringify(layout))resources=previous.resources;
        else{
            const {width,height}=layout,count=width*height,albedo=new Uint8Array(count*4),normal=new Uint8Array(count*4),surface=new Uint8Array(count*4);
            for(let i=0;i<count;i++){albedo.set([230,230,230,255],i*4);normal.set([128,128,255,255],i*4);surface.set([255,180,40,255],i*4);}
            const broad=Paint.noise(r.surfaceSeed,32),stain=Paint.noise(r.surfaceSeed+17,64),rgbLinear=lin('#62503b'),sRGB=v=>Math.round(255*clamp(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055));
            const microScale=r.finish==='powder'?.65:r.finish==='composite'?.75:.40,boxes=keepouts(parts,r),style=r.bodyStyle||'rounded',density01=r.details===false?0:r.detailDensity??.6;
            const baseRough=r.roughness+(r.finish==='powder'?.22:r.finish==='composite'?-.08:0),metal=r.finish==='brushed'?.78:r.finish==='composite'?.18:.12;
            const inkLight=[.78,.79,.74].map(linear),inkDark=[.09,.11,.12].map(linear);
            for(const c of charts){
                const p=c.p,q=c.rect,base=lin(p.color),mid=bounds(p).mid,m=c.filtered=filteredMaps(r.finish,512*5*Math.max(c.w/q.w,c.h/q.h)),mw=m.albedo.width,mh=m.albedo.height,[A0,A1]=c.axes;
                // Padded chart background carries the same paint, avoiding a
                // bright border when mipmaps sample past a thin surface edge.
                for(let y=q.y-4;y<q.y+q.h+4;y++)for(let x=q.x-4;x<q.x+q.w+4;x++){
                    const u=clamp((x-q.x)/q.w),v=clamp((y-q.y)/q.h),px=mid[0],tx=((Math.floor(mix(c.lo[0],c.hi[0],u)*5*mw)%mw)+mw)%mw,ty=((Math.floor(mix(c.lo[1],c.hi[1],v)*5*mh)%mh)+mh)%mh,si=(ty*mw+tx)*4,out=(y*width+x)*4,gray=linear(m.albedo.data[si]/255);
                    for(let k=0;k<3;k++)albedo[out+k]=sRGB(base[k]*gray*(1-r.wear*.2));
                    surface.set([255,Math.round(clamp(Math.max(.18,Math.min(.96,baseRough+r.wear*.14))*m.surface.data[si+1]/255)*255),Math.round(metal*255),255],out);void px;
                }
                // 1. Rasterize the surface: position, vertex color and facing per texel.
                const f=new Panels.Field(q.w,q.h,c.w/q.w,c.h/q.h,c.lo[0],c.lo[1]),n=q.w*q.h,PX=new Float32Array(n),PY=new Float32Array(n),PZ=new Float32Array(n),CR=new Float32Array(n),CG=new Float32Array(n),CB=new Float32Array(n);
                for(const k of c.tris){
                    const ids=[p.index[k],p.index[k+1],p.index[k+2]],P=ids.map(i=>Array.from(p.positions.subarray(i*3,i*3+3))),C=ids.map(i=>Array.from(p.colors.subarray(i*3,i*3+3))),Nn=ids.map(i=>Math.abs(p.normals[i*3+c.axis])),uv=P.map(v=>[(v[A0]-c.lo[0])/c.w*q.w,(v[A1]-c.lo[1])/c.h*q.h]),[a,b,d]=uv,den=(b[1]-d[1])*(a[0]-d[0])+(d[0]-b[0])*(a[1]-d[1]);if(Math.abs(den)<1e-7)continue;
                    const x0=Math.max(0,Math.floor(Math.min(a[0],b[0],d[0]))),x1=Math.min(q.w-1,Math.ceil(Math.max(a[0],b[0],d[0]))),y0=Math.max(0,Math.floor(Math.min(a[1],b[1],d[1]))),y1=Math.min(q.h-1,Math.ceil(Math.max(a[1],b[1],d[1])));
                    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
                        const u=((b[1]-d[1])*(x+.5-d[0])+(d[0]-b[0])*(y+.5-d[1]))/den,v=((d[1]-a[1])*(x+.5-d[0])+(a[0]-d[0])*(y+.5-d[1]))/den,w=1-u-v;if(u<-.00001||v<-.00001||w<-.00001)continue;
                        const t=y*q.w+x;f.cover[t]=1;PX[t]=P[0][0]*u+P[1][0]*v+P[2][0]*w;PY[t]=P[0][1]*u+P[1][1]*v+P[2][1]*w;PZ[t]=P[0][2]*u+P[1][2]*v+P[2][2]*w;
                        CR[t]=C[0][0]*u+C[1][0]*v+C[2][0]*w;CG[t]=C[0][1]*u+C[1][1]*v+C[2][1]*w;CB[t]=C[0][2]*u+C[1][2]*v+C[2][2]*w;f.face[t]=Nn[0]*u+Nn[1]*v+Nn[2]*w;
                    }
                }
                // 2. Lettering and artwork stay clean.
                if(boxes.length)for(let t=0;t<n;t++){if(!f.cover[t])continue;const x=PX[t],y=PY[t],z=PZ[t];for(const B of boxes){const dx=x-B.o[0],dy=y-B.o[1],dz=z-B.o[2];if(Math.abs(dx*B.n[0]+dy*B.n[1]+dz*B.n[2])<B.depth&&Math.abs(dx*B.u[0]+dy*B.u[1]+dz*B.u[2])<B.hw&&Math.abs(dx*B.v[0]+dy*B.v[1]+dz*B.v[2])<B.hh){f.keep[t]=1;break;}}}
                // 3. Panel layer. Mirrored sides share a layout.
                const kit=kitOf(p,r);
                if(kit&&density01>0&&c.k===1)Panels.detail(f,{kit,axis:c.axis,sign:c.sign,style,density:density01,seed:Panels.seedOf(p.name+'|'+c.axis+(c.axis===0?'':c.sign)+'|'+r.surfaceSeed%7)});
                // 4. Cavity (blurred height minus height) and distance to the chart edge.
                const H=f.H,blur=new Float32Array(n),tmp=new Float32Array(n),R=2;
                for(let y=0;y<q.h;y++){let s=0,cnt=0;for(let x=-R;x<q.w+R;x++){if(x+R<q.w){s+=H[y*q.w+x+R];cnt++;}if(x-R-1>=0){s-=H[y*q.w+x-R-1];cnt--;}if(x>=0)tmp[y*q.w+x]=s/cnt;}}
                for(let x=0;x<q.w;x++){let s=0,cnt=0;for(let y=-R;y<q.h+R;y++){if(y+R<q.h){s+=tmp[(y+R)*q.w+x];cnt++;}if(y-R-1>=0){s-=tmp[(y-R-1)*q.w+x];cnt--;}if(y>=0)blur[y*q.w+x]=s/cnt;}}
                const edge=new Float32Array(n);for(let t=0;t<n;t++)edge[t]=f.cover[t]?9:0;
                for(let y=0;y<q.h;y++)for(let x=0;x<q.w;x++){const t=y*q.w+x;if(!edge[t])continue;let v=edge[t];if(x>0)v=Math.min(v,edge[t-1]+1);if(y>0)v=Math.min(v,edge[t-q.w]+1);if(x===0||y===0)v=Math.min(v,1);edge[t]=v;}
                for(let y=q.h-1;y>=0;y--)for(let x=q.w-1;x>=0;x--){const t=y*q.w+x;if(!edge[t])continue;let v=edge[t];if(x<q.w-1)v=Math.min(v,edge[t+1]+1);if(y<q.h-1)v=Math.min(v,edge[t+q.w]+1);if(x===q.w-1||y===q.h-1)v=Math.min(v,1);edge[t]=v;}
                // 5. Write albedo, tangent-space normal and packed roughness/metal.
                for(let y=0;y<q.h;y++)for(let x=0;x<q.w;x++){
                    const t=y*q.w+x;if(!f.cover[t])continue;
                    const px=PX[t],py=PY[t],pz=PZ[t],a0=c.axis===0?pz:px,a1=c.axis===1?pz:py;
                    const tx=((Math.floor(a0*5*mw)%mw)+mw)%mw,ty=((Math.floor(a1*5*mh)%mh)+mh)%mh,si=(ty*mw+tx)*4,out=((q.y+y)*width+q.x+x)*4;
                    const variation=broad(px*.11+pz*.07,py*.10+pz*.037),streak=stain(px*.27+pz*.19,py*.025),low=clamp(1-py/(r.height*.72));
                    const cav=blur[t]-H[t],concave=clamp(cav/.0012),convex=clamp(-cav/.0010),rim=clamp(1-(edge[t]-1)/3);
                    const dust=clamp(r.grime*(clamp(low*.75+(streak-.40)*1.3)*.72+concave*.65)),worn=Math.max(rim*.8,convex),chips=r.wear*worn*clamp((hash(Math.floor(px*200+pz*71),Math.floor(py*220),r.surfaceSeed)-.52)*3),pigment=(1-r.wear*(.12+variation*.24))*(1+f.T[t]),gray=linear(m.albedo.data[si]/255);
                    const color=[CR[t],CG[t],CB[t]],luma=color[0]*.21+color[1]*.72+color[2]*.07,inkC=luma>.30?inkDark:inkLight,inkA=f.S[t]*.92*(1-r.wear*.5*clamp((streak+variation)-.6));
                    for(let k=0;k<3;k++){let v=color[k]*gray*pigment;v=mix(v,inkC[k],inkA);v*=f.A[t];v=mix(v,linear(.47+k*.025),chips*.80);v=mix(v,rgbLinear[k]*(.55+streak*.35),dust);albedo[out+k]=sRGB(v);}
                    albedo[out+3]=255;
                    const gx=x>0&&x<q.w-1&&f.cover[t-1]&&f.cover[t+1]?(H[t+1]-H[t-1])/(2*f.m0):0,gy=y>0&&y<q.h-1&&f.cover[t-q.w]&&f.cover[t+q.w]?(H[t+q.w]-H[t-q.w])/(2*f.m1):0;
                    const mx=(m.normal.data[si]-128)/127*microScale,my=(m.normal.data[si+1]-128)/127*microScale,nx=Math.max(-2.5,Math.min(2.5,-gx))+mx,ny=Math.max(-2.5,Math.min(2.5,-gy))+my,l=Math.hypot(nx,ny,1);
                    normal[out]=Math.round(128+nx/l*127);normal[out+1]=Math.round(128+ny/l*127);normal[out+2]=Math.round(128+127/l);normal[out+3]=255;
                    const roughness=Math.max(.16,Math.min(.97,baseRough+r.wear*.14+dust*.30+(variation-.5)*r.wear*.20+f.R[t]-inkA*.05));
                    surface.set([255,Math.round(clamp(roughness*m.surface.data[si+1]/255)*255),Math.round(mix(metal,.80,Math.max(chips,f.M[t]*r.wear))*255),255],out);
                }
            }
            resources=[albedo,normal,surface].map((data,i)=>({name:slotNames[i],width,height,data}));cache.vehicleCoating={key,size,layout:JSON.stringify(layout),resources};
        }
        for(const {p,byChart}of chosen){
            for(let i=0;i<p.positions.length/3;i++){const c=byChart.get(p._surfaceCharts[i]);if(!c.rect)continue;const q=c.rect;p.uvs[i*2]=(q.x+(p.positions[i*3+c.axes[0]]-c.lo[0])/c.w*q.w)/layout.width;p.uvs[i*2+1]=(q.y+(p.positions[i*3+c.axes[1]]-c.lo[1])/c.h*q.h)/layout.height;}
            p.texture=slotNames[0];p.normalTexture=slotNames[1];p.metallicRoughnessTexture=slotNames[2];p.roughness=p.metalness=1;p.normalScale=1;delete p.colors;
        }
        for(const t of resources)textures[t.name]=t;
        for(const p of parts)delete p._surfaceCharts;
        // Omit generic resources no longer used after the chart bake.
        const used=new Set(parts.flatMap(p=>[p.texture,p.normalTexture,p.metallicRoughnessTexture].filter(Boolean)));for(const name of Object.keys(textures))if(!used.has(name))delete textures[name];
    }
    /** Clip actual surface triangles to a decal box. Ink follows curved panels
     * and keeps their holes; a transparent rectangle never hangs off a side. */
    function project(part,F,w,h,depth,uv,offset){
        const g=new CM.Geo(),P=part.positions,N=part.normals;
        const clip=(poly,axis,limit,sign)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],da=sign*a.q[axis]-limit,db=sign*b.q[axis]-limit;if(da<=0)out.push(a);if((da<=0)!==(db<=0)){const t=da/(da-db);out.push({q:a.q.map((v,j)=>mix(v,b.q[j],t)),p:a.p.map((v,j)=>mix(v,b.p[j],t)),n:a.n.map((v,j)=>mix(v,b.n[j],t))});}}return out;};
        for(let k=0;k<part.index.length;k+=3){let poly=[];for(let j=0;j<3;j++){const i=part.index[k+j],p=Array.from(P.subarray(i*3,i*3+3)),n=Array.from(N.subarray(i*3,i*3+3)),d=sub(p,F.o);poly.push({p,n,q:[dot(d,F.u),dot(d,F.v),dot(d,F.n)]});}if(dot(norm(poly.reduce((n,v)=>add(n,v.n),[0,0,0])),F.n)<.22)continue;
            for(const [axis,limit]of [[0,w/2],[1,h/2],[2,depth]])for(const sign of [-1,1]){if(!poly.length)break;poly=clip(poly,axis,limit,sign);}if(poly.length<3)continue;
            const normal=norm(poly.reduce((n,v)=>add(n,v.n),[0,0,0])),points=poly.map(v=>add(v.p,scale(norm(v.n),offset))),tex=poly.map(v=>[mix(uv[0],uv[2],v.q[0]/w+.5),mix(uv[1],uv[3],.5-v.q[1]/h)]);
            const start=g.P.length/3;g.poly(points,tex,normal);for(let i=start;i<g.P.length/3;i++){// preserve interpolated shading across the clipped boundary
                const p=[g.P[i*3],g.P[i*3+1],g.P[i*3+2]];let nearest=0,dist=Infinity;for(let j=0;j<points.length;j++){const d=Math.hypot(...sub(p,points[j]));if(d<dist){dist=d;nearest=j;}}const n=norm(poly[nearest].n);g.N.splice(i*3,3,...n);
            }
        }return g.done();
    }
    /** Glyphs are opaque surface geometry. Their aspect ratio and
     * spacing stay in meters; neither atlas filtering nor alpha thresholds can
     * erase a crossbar or close a counter. Only printable-sized captions exist. */
    function lettering(part,F,text,width,height,offset){
        const characters=Array.from(CP.cleanText(text,22)),advance=characters.reduce((n,ch)=>n+(Typeface[ch]||Typeface[' ']).advance,0),g=new CM.Geo();
        if(!advance)return g.done();
        const size=Math.min(width/(advance+.12),height/1.10);
        if(size<.025)return g.done();
        const faces=[],P=part.positions,N=part.normals;
        for(let k=0;k<part.index.length;k+=3){const ids=Array.from(part.index.subarray(k,k+3)),p=ids.map(i=>Array.from(P.subarray(i*3,i*3+3))),n=ids.map(i=>Array.from(N.subarray(i*3,i*3+3)));
            if(dot(norm(n.reduce((a,b)=>add(a,b),[0,0,0])),F.n)<.45)continue;
            const q=p.map(p=>{const d=sub(p,F.o);return[dot(d,F.u),dot(d,F.v),dot(d,F.n)];});
            if(q.every(p=>Math.abs(p[2])>Math.max(width,height)*.6)||Math.min(...q.map(v=>v[0]))>width/2||Math.max(...q.map(v=>v[0]))<-width/2||Math.min(...q.map(v=>v[1]))>height/2||Math.max(...q.map(v=>v[1]))<-height/2)continue;
            faces.push(p.map((p,i)=>({p,n:n[i],q:q[i]})));
        }
        const outlines=[];let cursor=0;
        for(const ch of characters){const glyph=Typeface[ch]||Typeface[' '];for(let k=0;k<glyph.index.length;k+=3){const outline=Array.from(glyph.index.slice(k,k+3),i=>[(glyph.positions[i*2]+cursor-advance/2)*size,(glyph.positions[i*2+1]-.50)*size]);const [a,b,c]=outline;if((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])<0)outline.reverse();outlines.push(outline);}cursor+=glyph.advance;}
        for(const outline of outlines){
            const lo=[Math.min(...outline.map(p=>p[0])),Math.min(...outline.map(p=>p[1]))],hi=[Math.max(...outline.map(p=>p[0])),Math.max(...outline.map(p=>p[1]))];
            for(const face of faces){if([0,1].some(d=>Math.min(...face.map(p=>p.q[d]))>hi[d]||Math.max(...face.map(p=>p.q[d]))<lo[d]))continue;let poly=face;
                for(let e=0;e<outline.length&&poly.length;e++){
                    const a=outline[e],b=outline[(e+1)%outline.length],dx=b[0]-a[0],dy=b[1]-a[1],inside=v=>dx*(v.q[1]-a[1])-dy*(v.q[0]-a[0]),next=[];
                    for(let j=0;j<poly.length;j++){const p=poly[j],q=poly[(j+1)%poly.length],d=inside(p),dd=inside(q);if(d>=-1e-10)next.push(p);if((d>=0)!==(dd>=0)){const t=d/(d-dd);next.push({q:p.q.map((v,k)=>mix(v,q.q[k],t)),p:p.p.map((v,k)=>mix(v,q.p[k],t)),n:p.n.map((v,k)=>mix(v,q.n[k],t))});}}poly=next;
                }
                if(poly.length<3)continue;const points=poly.map(v=>add(v.p,scale(norm(v.n),offset))),at=g.P.length/3,normal=norm(poly.reduce((a,b)=>add(a,b.n),[0,0,0]));g.poly(points,null,normal);
                for(let i=at;i<g.P.length/3;i++){let nearest=0,best=Infinity;for(let j=0;j<points.length;j++){const d=Math.hypot(...sub(points[j],g.P.slice(i*3,i*3+3)));if(d<best){best=d;nearest=j;}}g.N.splice(i*3,3,...norm(poly[nearest].n));}
            }
        }
        return g.done();
    }
    function artwork(type,w,h,r){
        const light=rgb('#e4e6dc'),dark=rgb('#202b31'),accent=rgb(r.accent),luma=rgb(r.paint).reduce((s,v,i)=>s+v*[.21,.72,.07][i],0),ink=luma>.58?dark:light;
        const rect=(x,y,a,b,c,d)=>x>=a&&x<=c&&y>=b&&y<=d;
        return(u,v,out)=>{
            let color=ink,alpha=0;const edge=Math.min(u,1-u,v,1-v),rule=Math.min(Math.abs(u-.035),Math.abs(u-.965),Math.abs(v-.035),Math.abs(v-.965));
            if(r.livery!=='plain'&&type!=='nameplate'){
                if(type==='hood'){
                    if(r.livery==='stripe'||r.livery==='rally'){
                        if(rect(u,v,.16,.01,.24,.99)||rect(u,v,.76,.01,.84,.99)){color=ink;alpha=.93;}
                        if(rect(u,v,.255,.01,.267,.99)||rect(u,v,.733,.01,.745,.99)){color=accent;alpha=.96;}
                    }else if(rule<.004&&edge>.02){color=ink;alpha=.78;}
                }else{
                    if(type!=='equipment'&&rule<.004&&edge>.02){color=ink;alpha=.78;}
                    if(r.livery!=='rally'&&rect(u,v,.075,.515,.92,.535)){color=accent;alpha=1;}
                    if(type==='hazard'&&v>.75&&v<.94){color=fract((u+v*.17)*8)>.52?accent:dark;alpha=1;}
                    if(r.livery==='stripe'&&rect(u,v,.075,.90,.92,.94)){color=accent;alpha=1;}
                    if(type==='equipment'&&rect(u,v,.74,.87,.92,.93)){color=accent;alpha=fract((u+v*.20)*28)>.5?1:0;}
                }
            }
            // Weathering affects the graphic stripes, never the letter geometry.
            const nick=hash(Math.floor(u*w*.5),Math.floor(v*h*.5),r.surfaceSeed),fade=r.wear*.32*(nick>.93?1:.10);
            out[0]=color[0]*(1-r.grime*.12);out[1]=color[1]*(1-r.grime*.12);out[2]=color[2]*(1-r.grime*.12);out[3]=alpha*(1-fade);
        };
    }
    /** Where paint-scheme artwork and lettering go: [{p, F, w, h, type, depth}].
     * The panel layer reserves the same regions before the coating is baked. */
    function markingSpecs(parts,r){
        const W=r.width,H=r.height,L=r.length,specs=[],find=name=>parts.find(p=>p.name===name);
        const addSpec=(name,F,w,h,type='side',depth=Math.max(W,H)*.20)=>{const p=find(name);if(p&&w>.005&&h>.005)specs.push({p,F,w,h,type,depth});};
        const place=(name,axis,sign,type,wf,hf)=>{
            const p=find(name);if(!p)return;const b=bounds(p),o=b.mid.slice(),u=axis===0?[0,0,-sign]:axis===1?[1,0,0]:[sign,0,0],v=axis===1?[0,0,-1]:[0,1,0];o[axis]=sign>0?b.hi[axis]:b.lo[axis];const a=axis===0?2:0,d=axis===1?2:1;addSpec(name,CM.frame(o,u,v),(b.hi[a]-b.lo[a])*wf,(b.hi[d]-b.lo[d])*hf,type);
        };
        for(const s of [-1,1]){place(find('Door armor plates')?'Door armor plates':'Access door',0,s,'side',.82,.72);place('Formed fuel tank',0,s,'side',.65,.46);place('Side fairings',0,s,'equipment',.73,.62);place('Formed side equipment bays',0,s,'equipment',.83,.73);}
        place('Formed bonnet panel',1,1,'hood',.96,.94);place('Nose access panels',1,1,'hood',.90,.90);place('Formed avionics shell',1,1,'equipment',.70,.67);if(r.form==='walker')addSpec('Sloped chest plate',CM.frame([0,H*.733,L*.33],[1,0,0],[0,1,0]),W*.42,H*.020,'nameplate',H*.08);
        if(r.form==='walker')for(const s of [-1,1]){
            const shoulder=find('Shoulder service plates'),shin=find('Tapered shin armor cover plates');
            if(shoulder){const b=bounds(shoulder);addSpec(shoulder.name,CM.frame([s*W*.40,H*.75,b.hi[2]],[1,0,0],[0,1,0]),W*.11,H*.043,'hazard');}
            if(shin){const b=bounds(shin);addSpec(shin.name,CM.frame([s*W*.22*r.stance,b.mid[1],b.hi[2]],[1,0,0],[0,1,0]),W*.12,(b.hi[1]-b.lo[1])*.66,'hazard',H*.15);}
        }
        if(['hover','shuttle'].includes(r.form))for(const s of [-1,1]){
            const R=H*(r.form==='shuttle'?.18:.17)*r.engineSize,x=s*W*(r.form==='shuttle'?.35:.36)*r.wingSpan;
            addSpec('Turbine casings',CM.frame([x,H*.45+R,-L*.235],[1,0,0],[0,0,-1]),R*1.45,L*.12,'equipment',R*.7);
            const wings=find('Swept airfoil wings');if(wings){const b=bounds(wings);addSpec(wings.name,CM.frame([s*W*.30,H*.49,-L*.06],[1,0,0],[0,0,-1]),W*.12,L*.16,'hazard',H*.12);}
        }
        return specs;
    }
    /** Where the insignia goes: under the name on each door (or fuel tank),
     * ahead of the name on a flight craft's equipment bays, and on the
     * shuttle's fins. [{p, F, size, depth}] */
    function insigniaSpots(parts,r,specs=markingSpecs(parts,r)){
        const out=[],H=r.height,L=r.length,rally=r.livery==='rally';
        for(const s of specs){
            if(s.type==='side'){const size=Math.min(s.h*(rally?.26:.34),s.w*.30);out.push({p:s.p,F:{...s.F,o:add(s.F.o,scale(s.F.v,-s.h*(rally?.36:.20)))},size,depth:s.depth});}
            if(s.p.name==='Formed side equipment bays'){const o=s.F.o.slice();o[2]=-L*.05;out.push({p:s.p,F:{...s.F,o},size:Math.min(s.h*.62,L*.11),depth:s.depth});}
        }
        if(r.form==='shuttle'){const p=parts.find(p=>p.name==='Swept stabilizers');if(p){const b=bounds(p);for(const s of [-1,1])out.push({p,F:CM.frame([s>0?b.hi[0]:b.lo[0],H*.86,-L*.405],[0,0,-s],[0,1,0]),size:H*.15,depth:H*.05});}}
        return out;
    }
    /** The insignia's emblems alone (no field): color and coverage at (u, v),
     * from the design painted over black and over white. */
    function insigniaArt(design,images,r){
        const solid=c=>({...design,field:{...design.field,layout:'solid',colors:[c,c,c,c,c]}}),black=Design.prepare(solid('#000000'),1,images),white=Design.prepare(solid('#ffffff'),1,images),k=[0,0,0,255],w=[0,0,0,255];
        return(u,v,out)=>{Design.colorAt(black,u,v,k);Design.colorAt(white,u,v,w);const a=Math.max(0,Math.min(1,1-(w[0]-k[0])/255));for(let i=0;i<3;i++)out[i]=a>.004?Math.min(1,k[i]/a/255)*(1-r.grime*.12):0;const nick=hash(Math.floor(u*90),Math.floor(v*90),r.surfaceSeed+5);out[3]=a*(1-r.wear*.4*(nick>.9?1:.08));};
    }
    // Hardware lettering and emblems must never be painted across: handles,
    // latches, lamps, mirrors, vents and fasteners standing on the panel.
    const FIXTURE=/handle|latch|lamp|light|mirror|vane|louver|fastener|socket|bolt|rib|grille|vent|filler|hinge|antenna|wiper|marker/i;
    /** Moves (or narrows) a caption of `width` x `height` centred at F.o
     * along F.u into the nearest stretch of the spec's panel that no fixture
     * crosses at the caption's height. Returns the new frame and width. */
    function clearSpan(parts,s,F,width,height,need=width){
        const margin=height*.30,band=height*.62,blocked=[],reach=Math.max(.04,Math.min(s.depth*.5,Math.max(width,height)*.5));
        for(const p of parts){
            if(p===s.p||!FIXTURE.test(p.name))continue;const P=p.positions;
            for(let k=0;k<p.index.length;k+=3){
                let lo=Infinity,hi=-Infinity,vlo=Infinity,vhi=-Infinity,near=false;
                for(let j=0;j<3;j++){const i=p.index[k+j],d=[P[i*3]-F.o[0],P[i*3+1]-F.o[1],P[i*3+2]-F.o[2]],u=dot(d,F.u),v=dot(d,F.v),n=dot(d,F.n);lo=Math.min(lo,u);hi=Math.max(hi,u);vlo=Math.min(vlo,v);vhi=Math.max(vhi,v);if(Math.abs(n)<reach)near=true;}
                if(near&&vhi>-band&&vlo<band&&hi>-width&&lo<width)blocked.push([lo-margin,hi+margin]);
            }
        }
        if(!blocked.length)return{F,width};
        blocked.sort((a,b)=>a[0]-b[0]);const free=[];let at=-width/2-s.w*.04;const end=width/2+s.w*.04;
        for(const [a,b]of blocked){if(a>at)free.push([at,Math.min(a,end)]);at=Math.max(at,b);if(at>=end)break;}
        if(at<end)free.push([at,end]);
        const spans=free.filter(([a,b])=>b-a>1e-6);if(!spans.length)return{F,width:0};
        const fits=spans.filter(([a,b])=>b-a>=need),pick=fits.length?fits.sort((x,y)=>Math.abs(Math.max(x[0]+need/2,Math.min(x[1]-need/2,0)))-Math.abs(Math.max(y[0]+need/2,Math.min(y[1]-need/2,0))))[0]:spans.sort((x,y)=>(y[1]-y[0])-(x[1]-x[0]))[0];
        const room=pick[1]-pick[0],w=Math.min(width,room),c=Math.max(pick[0]+Math.min(need,room)/2,Math.min(pick[1]-Math.min(need,room)/2,0));
        return{F:{...F,o:add(F.o,scale(F.u,c))},width:w};
    }
    /** The width a caption really takes (lettering() scales to fit both limits). */
    function captionWidth(text,width,height){const advance=Array.from(CP.cleanText(text,22)).reduce((n,ch)=>n+(Typeface[ch]||Typeface[' ']).advance,0);if(!advance)return 0;const size=Math.min(width/(advance+.12),height/1.10);return size*(advance+.12);}
    function decorate(parts,textures,r,cache={},images={}){
        const W=r.width,H=r.height,L=r.length,specs=markingSpecs(parts,r);
        const insignia=r.insignia&&r.insignia.layers&&r.insignia.layers.length?r.insignia:null,named=insignia?Design.pictures(insignia):[];
        const key=JSON.stringify([r.livery,r.markings,r.paint,r.secondary,r.accent,r.wear,r.grime,r.surfaceSeed,specs.map(s=>[s.type,Math.round(s.w/s.h*100),s.p.color]),insignia,named.map(n=>images[n]?[n,images[n].width,images[n].height,images[n].version||0]:n)]);
        let kept=cache.vehicleArtwork;
        if(!kept||kept.key!==key){
            const a=CP.atlas(1024,1024,[255,255,255,0]),regions=new Map();
            for(const s of specs){const id=s.type+'|'+Math.round(s.w/s.h*100)+'|'+s.p.color;if(regions.has(id))continue;const aspect=s.w/s.h,w=aspect>=1?512:Math.max(128,Math.round(384*aspect)),h=aspect>=1?Math.max(96,Math.round(512/aspect)):384,region=CP.region(a,w,h);CP.fill(a,region,artwork(s.type,w,h,{...r,paint:s.p.color}));regions.set(id,region);}
            if(insignia){const region=CP.region(a,256,256);CP.fill(a,region,insigniaArt(insignia,images,r));regions.set('insignia',region);}
            kept={key,image:{name:'vehicle-markings.png',width:a.width,height:a.height,data:a.data},regions:[...regions].map(([id,q])=>[id,[(q.x+.5)/a.width,(q.y+.5)/a.height,(q.x+q.w-.5)/a.width,(q.y+q.h-.5)/a.height]])};cache.vehicleArtwork=kept;
        }
        const regions=new Map(kept.regions),meshes=[],offset=Math.min(W,H,L)*.0007;
        for(const s of specs){const uv=regions.get(s.type+'|'+Math.round(s.w/s.h*100)+'|'+s.p.color),m=project(s.p,s.F,s.w,s.h,s.depth,uv,offset);if(m.index.length)meshes.push(m);}
        if(insignia&&regions.has('insignia'))for(const s of insigniaSpots(parts,r,specs)){const spec=specs.find(q=>q.p===s.p&&Math.abs(dot(sub(s.F.o,q.F.o),q.F.n))<1e-6)||{p:s.p,w:s.size,depth:s.depth},clear=clearSpan(parts,spec,s.F,s.size,s.size);if(clear.width<s.size*.999)continue;const m=project(s.p,clear.F,s.size,s.size,s.depth,regions.get('insignia'),offset*1.3);if(m.index.length)meshes.push(m);}
        if(meshes.length){const mesh=CM.merge(meshes);CM.skin(mesh,0);parts.push({...mesh,name:'Vehicle markings',surfaceRole:'ink',texture:kept.image.name,color:'#ffffff',roughness:.76,metalness:0,cutout:true,alphaCutoff:.5});textures[kept.image.name]=kept.image;}
        const letters=[];
        for(const s of specs){
            let text=r.markings,w=s.w*.82,h=s.h*.40,shift=s.h*.22;
            if(r.livery==='rally'&&s.type==='side'){text=(text.match(/\d+/)||[text])[0];w=s.w*.56;h=s.h*(insignia?.50:.68);shift=insignia?s.h*.14:0;}
            if(s.type==='hood'){if(r.livery!=='rally')continue;text=(text.match(/\d+/)||[text])[0];w=s.w*.42;h=s.h*.30;shift=0;}
            if(s.type==='hazard'||s.p.name==='Turbine casings'){text=(text.match(/\d+/)||[])[0]||'';w=s.w*.70;h=s.h*.30;shift=s.h*.12;}
            if(s.type==='nameplate'){w=s.w*.96;h=s.h;shift=0;}
            if(s.p.name==='Formed fuel tank'&&r.fairing!=='naked')continue;
            if(s.p.name==='Side fairings'||s.p.name==='Formed fuel tank'){shift=-s.h*.14;h=s.h*.36;w=s.w*.78;}
            if(!text)continue;
            const F={...s.F,o:add(s.F.o,scale(s.F.v,shift))};
            // The forward flight bay is clear of the central latch, rear
            // cooling ribs and wing root. A generic centered caption was not.
            if(s.p.name==='Formed side equipment bays'){F.o[2]=L*.16;w=Math.min(s.w*.42,L*.20);}
            if(s.p.name==='Formed avionics shell'){F.o[2]=L*.17;w=W*.20;h=L*.10;}
            const clear=clearSpan(parts,s,F,w,h,captionWidth(text,w,h));
            const m=lettering(s.p,clear.F,text,clear.width,h,offset*1.6);if(!m.index.length)continue;
            const ink=rgb(s.p.color).reduce((n,v,i)=>n+v*[.21,.72,.07][i],0)>.58?'#202b31':'#e4e6dc',color=lin(ink);m.colors=Float32Array.from({length:m.positions.length},(_,i)=>color[i%3]);letters.push(m);
        }
        if(letters.length){const mesh=CM.merge(letters);mesh.colors=Float32Array.from(letters.flatMap(m=>Array.from(m.colors)));CM.skin(mesh,0);parts.push({...mesh,name:'Vehicle lettering',surfaceRole:'ink',color:'#ffffff',roughness:.8,metalness:0});}

    }
    const api={maps,apply,bounds,project,lettering,decorate,fittings,markingSpecs,kitOf,keepouts};root.RRVehicleFinish=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
