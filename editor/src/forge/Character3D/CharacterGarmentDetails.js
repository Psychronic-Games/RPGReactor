/** Original sewn construction for procedural clothing. Anatomical design
 * paths are fitted to the garment's actual surface triangles.
 * No reference mesh, UV layout or texture is copied into these details. */
(function(root) {
    'use strict';
    const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null);
    const Props=need('RRCharacterProps','./CharacterProps.js'),O=need('RRCharacterOutfit','./CharacterOutfit.js');
    const {add,sub,mul,norm,cross,dot}=Props.vec;
    const TECH=new Set(['starshipUniform','officerJacket','techSuit','explorerSuit','evaSuit','spacesuit','bodysuit']);
    const COATS=new Set(['trenchcoat','fieldCoat','tacvest']);

    /** A triangle's skin and surface point at its barycentric coordinates. */
    function point(laid,ids,bary) {
        const p=[0,0,0],n=[0,0,0],weights=new Map();
        ids.forEach((v,i)=>{
            for(let k=0;k<3;k++){p[k]+=laid.positions[v*3+k]*bary[i];n[k]+=laid.normals[v*3+k]*bary[i];}
            for(let k=0;k<4;k++){const j=laid.joints[v*4+k],w=laid.weights[v*4+k]*bary[i];if(w>0)weights.set(j,(weights.get(j)||0)+w);}
        });
        const skin=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),total=skin.reduce((s,q)=>s+q[1],0)||1;
        return {p,n:norm(n),skin:{joints:Array.from({length:4},(_,k)=>skin[k]?.[0]||0),weights:Array.from({length:4},(_,k)=>(skin[k]?.[1]||0)/total)}};
    }

    function sampler(pack,laid,built,side=1) {
        const an=O.anatomy(pack),hip=built.bones.find(b=>b.name==='Hips').head,neck=built.bones.find(b=>b.name==='Neck').head;
        const scale=built.height/1.7,width=Math.abs(built.bones.find(b=>b.name==='LeftArm').head[0]/an.chains.armL[1][0]);
        // Charts meet across anatomical families at the shoulders and waist.
        // Sampling only all-spine triangles punched staircase gaps through sewn panels.
        const surface=O.projectedSurface([laid],{cell:.04*scale});
        return (x,y)=>{
            x*=Math.max(.5,Math.min(3,width||scale));
            y=hip[1]+(y-an.chains.spine[0][1])/(an.chains.spine[4][1]-an.chains.spine[0][1])*(neck[1]-hip[1]);
            const hit=surface.sample(x,y,side);
            if(!hit||hit.depth*side<.005*scale)return null;
            const fitted=point(laid,hit.ids,hit.bary);
            // A front-projected detail must remain in front of its supporting triangle,
            // including where a smoothed vertex normal turns into the neighboring chart.
            fitted.n=norm([fitted.n[0],fitted.n[1],side*Math.max(.35,fitted.n[2]*side)]);
            fitted.p[2]+=side*.005*scale;
            return fitted;
        };
    }

    /** Small outward cloth folds at supported joints, rather than drawing
     * rigid wrinkles into the color map. The hem fades to its fitted edge. */
    function tailor(entries,built){
        const scale=built.height/1.7;
        for(const e of entries){
            if(!['officerJacket','cargoTrousers'].includes(e.garment)||e.lining||e.skirt)continue;
            const L=e.laid,P=L.positions,N=L.normals;
            for(let v=0;v<L.field.length;v++){
                const f=L.field[v],edge=Math.max(0,Math.min(1,(L.vals?.[v]??1)*8));let amount=0;
                if(e.garment==='officerJacket'){
                    if(f.fam===1||f.fam===2){const elbow=Math.exp(-(((f.s-1.96)/.32)**2)),cuff=Math.exp(-(((f.s-2.81)/.18)**2));amount=(elbow*.003+cuff*.002)*Math.max(0,Math.sin(f.s*28+Math.sin(f.ang*2)*1.3));}
                    if(f.fam===0)amount=.003*Math.exp(-(((f.s-1.1)/.55)**2))*(.5+.5*Math.cos(f.ang*10+f.s))**4;
                }else if(f.fam===3||f.fam===4){const knee=Math.exp(-(((f.s-1.03)/.25)**2)),cuff=Math.exp(-(((f.s-1.84)/.16)**2));amount=(knee*.0035+cuff*.0025)*Math.max(0,Math.sin(f.s*31+Math.sin(f.ang)*1.7));}
                for(let k=0;k<3;k++)P[v*3+k]+=N[v*3+k]*amount*scale*edge;
            }
            L.normals=O.triangleNormals(P,L.index);
        }
    }

    function build(pack,built,entries) {
        const mesh=new Props.Mesh(),hardware=new Props.Mesh(),scale=built.height/1.7;
        const tube=(samples,radius,color)=>{
            for(let i=0;i+1<samples.length;i++){
                const a=samples[i],b=samples[i+1];if(!a||!b||Math.hypot(...sub(a.p,b.p))>scale*.08)continue;
                const tangent=norm(sub(b.p,a.p));if(Math.hypot(...sub(a.p,b.p))<1e-6)continue;
                const rows=[a,b].map(s=>{
                    const x=norm(sub(s.n,mul(tangent,dot(s.n,tangent)))),y=cross(tangent,x),center=add(s.p,mul(s.n,radius*1.35));
                    return Array.from({length:6},(_,k)=>{const angle=k*Math.PI/3,n=add(mul(x,Math.cos(angle)),mul(y,Math.sin(angle)));return mesh.vertex(add(center,mul(n,radius)),n,color,s.skin);});
                });
                for(let k=0;k<6;k++){const j=(k+1)%6;mesh.tri(rows[0][k],rows[0][j],rows[1][k]);mesh.tri(rows[0][j],rows[1][j],rows[1][k]);}
            }
        };
        for(const e of entries){
            if(e.garment==='cargoTrousers'&&!e.lining){
                const L=e.laid,main=O.linear(e.look.color),trim=O.linear(e.look.trim||e.look.color2||e.look.color);
                for(const [side,family,name]of [[1,3,'Left'],[-1,4,'Right']]){
                    const upper=built.bones.find(b=>b.name===name+'UpLeg').head,knee=built.bones.find(b=>b.name===name+'Leg').head;
                    const cy=upper[1]*.53+knee[1]*.47,cz=upper[2]*.8+knee[2]*.2-.015*scale,w=.115*scale,h=.145*scale,R=7,K=7;
                    const surface=O.projectedSurface([L],{cell:.035*scale,axes:[[0,0,1],[0,1,0],[1,0,0]],accept:(part,ids)=>ids.every(v=>part.field[v].fam===family)});
                    const sample=(z,y,flap=false)=>{
                        const hit=surface.sample(z,y,side);if(!hit)return null;
                        const p=point(L,hit.ids,hit.bary),u=Math.max(0,Math.min(1,(z-cz)/w+.5)),v=Math.max(0,Math.min(1,(y-cy)/h+.5));
                        const bellows=Math.pow(Math.max(0,Math.sin(Math.PI*u)*Math.sin(Math.PI*v)),.35);
                        const lift=(.002+.017*bellows+(flap?.003:0))*scale;
                        p.p=add(p.p,mul(p.n,lift));return p;
                    },rows=[];
                    for(let j=0;j<=R;j++){const row=[];for(let k=0;k<=K;k++){
                        const u=k/K,v=j/R,s=sample(cz+(u-.5)*w,cy+(v-.5)*h);if(!s){row.push(-1);continue;}
                        row.push(mesh.vertex(s.p,s.n,main.map(q=>q*(.86+.12*Math.sin(Math.PI*u))),s.skin));
                    }rows.push(row);}
                    for(let j=0;j<R;j++)for(let k=0;k<K;k++){const [a,b,c,d]=[rows[j][k],rows[j][k+1],rows[j+1][k],rows[j+1][k+1]];if(Math.min(a,b,c,d)<0)continue;
                        if(side<0){mesh.tri(a,b,c);mesh.tri(b,d,c);}else{mesh.tri(a,c,b);mesh.tri(b,c,d);}
                    }
                    const path=[];for(let k=0;k<=18;k++)path.push(sample(cz-w/2,cy+h/2-h*k/18));for(let k=1;k<=14;k++)path.push(sample(cz-w/2+w*k/14,cy-h/2));for(let k=1;k<=18;k++)path.push(sample(cz+w/2,cy-h/2+h*k/18));
                    tube(path,.0012*scale,trim);
                    // The flap follows the raised pocket, rather than being
                    // drawn on the trouser surface behind its bellows.
                    const flap=[];
                    for(let j=0;j<=3;j++){const row=[];for(let k=0;k<=K;k++){
                        const u=k/K,v=j/3,z=cz+(u-.5)*w,y=cy+h*(.48-.30*v)-.006*scale*Math.sin(Math.PI*u)*v,p=sample(z,y,true);
                        row.push(p?mesh.vertex(p.p,p.n,main.map(q=>q*.87),p.skin):-1);
                    }flap.push(row);}
                    for(let j=0;j<3;j++)for(let k=0;k<K;k++){const [a,b,c,d]=[flap[j][k],flap[j][k+1],flap[j+1][k],flap[j+1][k+1]];if(Math.min(a,b,c,d)<0)continue;
                        if(side>0){mesh.tri(a,b,c);mesh.tri(b,d,c);}else{mesh.tri(a,c,b);mesh.tri(b,c,d);}
                    }
                    tube(Array.from({length:21},(_,k)=>sample(cz-w/2+w*k/20,cy+h*.18-.006*scale*Math.sin(k/20*Math.PI),true)),.0012*scale,trim);
                }
            }
            if(e.skirt||e.lining||!TECH.has(e.garment)&&!COATS.has(e.garment))continue;
            const sample=sampler(pack,e.laid,built),main=O.linear(e.look.color),trim=O.linear(e.look.trim||e.look.color2||e.look.color),edge=main.map((v,k)=>v*.65+trim[k]*.35);
            const path=(points,radius=.00085,color=edge)=>{
                const samples=[];
                for(let i=0;i+1<points.length;i++){
                    const a=points[i],b=points[i+1],steps=Math.max(2,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.009));
                    for(let j=0;j<steps;j++){const u=j/steps;samples.push(sample(a[0]*(1-u)+b[0]*u,a[1]*(1-u)+b[1]*u));}
                }
                samples.push(sample(...points.at(-1)));tube(samples,radius*scale,color);
            };
            if(TECH.has(e.garment))for(const side of [1,-1]){
                const fit=side===1?sample:sampler(pack,e.laid,built,-1),rows=[],N=24,M=8;
                const panel=O.linear(e.look.color2||e.look.trim||e.look.color);
                // A sewn shoulder yoke has a complete surface, including its interior.
                // Its restrained color block is readable before fine stitch details are visible.
                for(let j=0;j<=M;j++){
                    const row=[];for(let k=0;k<=N;k++){
                        const u=k/N,x=(u-.5)*.35,y=1.292-Math.abs(x)*.16+j/M*.052,p=fit(x,y);
                        row.push(p?mesh.vertex(add(p.p,mul(p.n,.003*scale)),p.n,panel,p.skin):-1);
                    }rows.push(row);
                }
                for(let j=0;j<M;j++)for(let k=0;k<N;k++){
                    const [a,b,c,d]=[rows[j][k],rows[j][k+1],rows[j+1][k],rows[j+1][k+1]];
                    if(Math.min(a,b,c,d)<0)continue;
                    if(side>0){mesh.tri(a,b,c);mesh.tri(b,d,c);}else{mesh.tri(a,c,b);mesh.tri(b,c,d);}
                }
                tube(Array.from({length:49},(_,k)=>{const x=(k/48-.5)*.35;return fit(x,1.292-Math.abs(x)*.16);}),.0013*scale,trim);
            }
            // A real zipped closure and two curved torso seams. Their width
            // stays in millimeters instead of consuming a larger color atlas.
            const zip=e.garment==='fieldCoat'?.040:0;
            for(const side of [-1,1]){
                path([[zip+side*.003,1.00],[zip+side*.003,1.365]],.0010,trim);
                path([[side*.115,1.02],[side*.095,1.16],[side*.145,1.29],[side*.17,1.345]],.0010);
            }
            for(let y=1.015;y<1.36;y+=.006){
                const s=sample(zip+(Math.round(y/.006)%2?.0018:-.0018),y);if(!s)continue;
                const x=norm(cross([0,1,0],s.n)),up=cross(s.n,x),at=add(s.p,mul(s.n,.002*scale));
                const corners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>hardware.vertex(add(at,add(mul(x,a*.0022*scale),mul(up,b*.0014*scale))),s.n,trim,s.skin));
                hardware.tri(corners[0],corners[1],corners[2]);hardware.tri(corners[0],corners[2],corners[3]);
            }
            // Small fitted bellows pockets: surface, raised outer welt and a
            // separate flap, each bound to the actual underlying fabric.
            const pressure=e.garment==='evaSuit'||e.garment==='spacesuit',coat=COATS.has(e.garment);
            const y=coat?1.055:pressure?1.185:1.225,width=coat?.071:.056,height=coat?.083:.058;
            for(const sign of [-1,1]){
                const cx=sign*(coat?.116:.09),rows=[],N=5;
                for(let j=0;j<=N;j++){const row=[];for(let i=0;i<=N;i++){
                    const u=i/N,v=j/N,s=sample(cx+(u-.5)*width,y+(v-.5)*height);if(!s){row.push(-1);continue;}
                    const lift=(.002+.009*Math.sin(Math.PI*u)*Math.sin(Math.PI*v))*scale;
                    row.push(mesh.vertex(add(s.p,mul(s.n,lift)),s.n,main.map(c=>c*.82),s.skin));
                }rows.push(row);}
                for(let j=0;j<N;j++)for(let i=0;i<N;i++){const [a,b,c,d]=[rows[j][i],rows[j][i+1],rows[j+1][i],rows[j+1][i+1]];if(Math.min(a,b,c,d)<0)continue;mesh.tri(a,b,c);mesh.tri(b,d,c);}
                const x0=cx-width/2,x1=cx+width/2,y0=y-height/2,y1=y+height/2;
                path([[x0,y1],[x0,y0],[x1,y0],[x1,y1]],.0011);
                path([[x0,y1-.012],[cx,y1-.016],[x1,y1-.012]],.0016,trim);
            }
            if(pressure){
                // Shallow formed bellows around elbows and knees provide
                // readable relief, sharing the suit's own skin weights.
                for(const fam of [1,2,3,4])for(const at of (fam<3?[1.83,1.94,2.05,2.16]:[.86,.96,1.06,1.16])){
                    const L=e.laid;
                    for(let t=0;t<L.index.length;t+=3){
                        const ids=Array.from(L.index.subarray(t,t+3));if(ids.some(v=>L.field[v].fam!==fam))continue;
                        const values=ids.map(v=>L.field[v].s-at),hits=[];
                        for(let k=0;k<3;k++){const n=(k+1)%3;if((values[k]<0)===(values[n]<0))continue;const u=values[k]/(values[k]-values[n]),bary=[0,0,0];bary[k]=1-u;bary[n]=u;hits.push(point(L,ids,bary));}
                        if(hits.length===2)tube(hits,.0015*scale,main.map(v=>v*.36));
                    }
                }
            }
        }
        const parts=[];
        if(!mesh.empty)mesh.computeNormals();
        if(!mesh.empty)parts.push(mesh.part('Tailored seams and pockets',{kind:'cloth',clothDetail:true,doubleSided:true,roughness:.86,metalness:0}));
        if(!hardware.empty)parts.push(hardware.part('Garment zipper teeth',{kind:'metal',clothDetail:true,doubleSided:true,roughness:.42,metalness:.65}));
        return parts;
    }
    /** A wrapped, overlapping leather skirt measured over its completed
     * undergarment. Each curved tongue has a closed cut edge and a real hem. */
    function apronPanels(pack,built,item,layers=[],lining=layers) {
        const hip=built.bones.find(b=>b.name==='Hips').head,hipBone=built.bones.findIndex(b=>b.name==='Hips'),scale=built.height/1.7;
        let top=hip[1]+.09*scale;for(const p of lining)for(let v=0;v<p.positions.length/3;v++)if(p.field?.[v]?.fam===0)top=Math.max(top,p.positions[v*3+1]-.002*scale);
        const body=built.parts[0],an=O.anatomy(pack),surfaces=[body,...layers],drop=(.08+(item.length??.4)*.62)*scale;
        const accept=(part,v)=>part===body?an.member[pack.body.source[v]*5+1]+an.member[pack.body.source[v]*5+2]<.4:![1,2].includes(part.field?.[v]?.fam);
        let minZ=Infinity,maxZ=-Infinity,minX=Infinity,maxX=-Infinity;
        for(const part of surfaces)for(let v=0;v<part.positions.length/3;v++){
            const y=part.positions[v*3+1];if(Math.abs(y-hip[1])>.09*scale||!accept(part,v))continue;
            minX=Math.min(minX,part.positions[v*3]);maxX=Math.max(maxX,part.positions[v*3]);minZ=Math.min(minZ,part.positions[v*3+2]);maxZ=Math.max(maxZ,part.positions[v*3+2]);
        }
        const origin=[(minX+maxX)/2,top,(minZ+maxZ)/2],axes=[[1,0,0],[0,1,0],[0,0,1]],R=16,K=8,count=10;
        const ring=y=>O.crossSection(surfaces,[origin[0],y,origin[2]],axes,accept,scale),waist=ring(hip[1]+.025*scale),seat=ring(hip[1]-.065*scale);
        const section=Array.from({length:R+1},(_,j)=>ring(top-drop*j/R));
        const fitted=O.projectedSurface(surfaces,{cell:.04*scale});
        const mesh=new Props.Mesh(),binding=new Props.Mesh(),hang=[],color=O.linear(item.color||'#6a4a2a'),edge=color.map(v=>v*.52),skin=rigidSkin(hipBone);
        const radius=p=>Math.hypot(p[0]-origin[0],p[2]-origin[2]);
        for(let panel=0;panel<count;panel++){
            const outer=[],inner=[],center=panel/count*Math.PI*2;
            for(let j=0;j<=R;j++){
                const u=j/R,A=[],B=[];
                for(let k=0;k<=K;k++){
                    const v=k/K*2-1,angle=center+v*Math.PI/count*1.14*(1-.14*u),y=top-drop*u+.016*scale*Math.pow(u,8)*v*v;
                    const support=Math.max(radius(section[j](angle,0)),Math.max(radius(waist(angle,0)),radius(seat(angle,0)))*(1-.02*u)*Math.max(0,Math.min(1,(u-.22)/.22)));
                    const relief=(.004+.016*u+.004*Math.sin(u*Math.PI)*Math.cos(v*Math.PI*2))*scale;
                    for(const [row,inset]of [[A,0],[B,.003*scale]]){
                        const r=support+relief-inset,p=[origin[0]+Math.sin(angle)*r,y,origin[2]+Math.cos(angle)*r],face=Math.cos(angle)>=0?1:-1;
                        const hit=fitted.sample(p[0],y,face);if(hit&&j<R*.5)p[2]=face*Math.max(face*p[2],face*hit.depth+.006*scale-inset);
                        const tint=color.map(q=>q*(inset?.58:.96+.04*Math.sin(panel*2.4)**2));
                        row.push(mesh.vertex(p,[Math.sin(angle),0,Math.cos(angle)],tint,skin));hang.push(u);
                    }
                }outer.push(A);inner.push(B);
            }
            for(let j=0;j<R;j++)for(let k=0;k<K;k++)for(const [rows,back]of [[outer,false],[inner,true]]){
                const [a,b,c,d]=[rows[j][k],rows[j][k+1],rows[j+1][k],rows[j+1][k+1]];
                if(back){mesh.tri(a,b,c);mesh.tri(b,d,c);}else{mesh.tri(a,c,b);mesh.tri(b,c,d);}
            }
            const boundary=outer[0].map((v,k)=>[v,inner[0][k]]).concat(outer.slice(1).map((row,j)=>[row[K],inner[j+1][K]]),outer.at(-1).slice(0,-1).reverse().map((v,k)=>[v,inner.at(-1)[K-1-k]]),outer.slice(1,-1).reverse().map((row,j)=>[row[0],inner[R-1-j][0]]));
            for(let i=0;i<boundary.length;i++){const [a,A]=boundary[i],[b,B]=boundary[(i+1)%boundary.length];mesh.tri(a,b,A);mesh.tri(b,B,A);}
            const path=outer.map(row=>row[0]).concat(outer.at(-1).slice(1),outer.slice(0,-1).reverse().map(row=>row[K])).map(v=>Array.from(mesh.p.slice(v*3,v*3+3)));
            binding.tube(path,.0009*scale,4,edge,skin);
        }
        mesh.computeNormals();binding.computeNormals();
        const panels=mesh.part('Leather apron panels',{kind:'cloth',roughness:.76,metalness:0,doubleSided:false,hang:Float32Array.from(hang),clothStiffness:.26,clothMinHang:.18*scale,keepShape:true});
        const hems=binding.part('Leather apron bindings',{kind:'cloth',clothDetail:true,roughness:.82,metalness:0,hang:Float32Array.from({length:binding.p.length/3},(_,v)=>Math.max(0,Math.min(1,(top-binding.p[v*3+1])/drop))),clothStiffness:.26,clothMinHang:.18*scale,keepShape:true});
        return [panels,hems];
    }
    let leatherMaps;
    function leatherFinish(parts,built){
        const selected=parts.filter(p=>p.name==='Leather apron panels');if(!selected.length)return [];
        if(!leatherMaps){
            const size=128,data=new Uint8Array(size*size*4),height=(x,y)=>{x=(x+size)%size;y=(y+size)%size;let n=Math.imul(x+1,374761393)^Math.imul(y+1,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
            for(let y=0;y<size;y++)for(let x=0;x<size;x++){const n=norm([-(height(x+1,y)-height(x-1,y))*.24,-(height(x,y+1)-height(x,y-1))*.24,1]);data.set(n.map(v=>Math.round(128+v*127)).concat(255),(y*size+x)*4);}
            leatherMaps=[{name:'warrior-leather-normal.png',width:size,height:size,data,repeat:true}];
        }
        for(const p of selected){p.normalTexture=leatherMaps[0].name;p.normalScale=.28;p.uvs=Float32Array.from({length:p.positions.length/3*2},(_,i)=>{const v=Math.floor(i/2),axis=Math.abs(p.normals[v*3])>Math.abs(p.normals[v*3+2])?2:0;return p.positions[v*3+(i%2?1:axis)]*12/(built.height/1.7);});}
        return leatherMaps;
    }
    const rigidSkin=joint=>({joints:[joint,0,0,0],weights:[1,0,0,0]});
    let metalMaps;
    /** Fine, tiled manufacturing grain, independent of a character atlas.
     * Vertex colors still supply the armor color; these maps affect relief
     * and the finish of reflected light, without painting fixed lighting. */
    function armorFinish(parts,built) {
        const armor=parts.filter(p=>/^(Power armor|Power helmet|Recon formed) plating$/.test(p.name)||p.name==='Recon knee shells'||p.name.startsWith('Medieval '));
        if(!armor.length)return [];
        if(!metalMaps){
            const size=128,normal=new Uint8Array(size*size*4),surface=new Uint8Array(size*size*4);
            const noise=(x,y)=>{let n=Math.imul((x+size)%size+1,374761393)^Math.imul((y+size)%size+1,668265263);n=Math.imul(n^(n>>>13),1274126177);return((n^(n>>>16))>>>0)/4294967295;};
            for(let y=0;y<size;y++)for(let x=0;x<size;x++){
                const i=(y*size+x)*4,dx=(noise(x+1,y)-noise(x-1,y))*.22,dy=(noise(x,y+1)-noise(x,y-1))*.08,n=norm([-dx,-dy,1]);
                normal.set([Math.round(128+n[0]*127),Math.round(128+n[1]*127),Math.round(128+n[2]*127),255],i);
                surface.set([255,Math.round(208+noise(x,y)*35),255,255],i);
            }
            metalMaps=[{name:'armor-grain-normal.png',width:size,height:size,data:normal,repeat:true},{name:'armor-finish.png',width:size,height:size,data:surface,repeat:true}];
        }
        const density=10/(built.height/1.7);
        for(const p of armor){
            p.uvs=new Float32Array(p.positions.length/3*2);
            for(let v=0;v<p.positions.length/3;v++){
                const n=Array.from(p.normals.subarray(v*3,v*3+3),Math.abs),axis=n.indexOf(Math.max(...n)),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1];
                p.uvs[v*2]=p.positions[v*3+axes[0]]*density;p.uvs[v*2+1]=p.positions[v*3+axes[1]]*density;
            }
            p.normalTexture=metalMaps[0].name;p.normalScale=.20;p.metallicRoughnessTexture=metalMaps[1].name;
        }
        return metalMaps;
    }
    const api={build,tailor,apronPanels,leatherFinish,armorFinish};root.RRCharacterGarmentDetails=api;
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
