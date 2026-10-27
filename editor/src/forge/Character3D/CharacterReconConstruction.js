/** Original load-bearing textile carrier and articulated knee equipment.
 * Construction cues come from reference photography/models; all surfaces,
 * stitching, fasteners and material tiles are generated on the current body. */
(function(root){
    'use strict';
    const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null);
    const O=need('RRCharacterOutfit','./CharacterOutfit.js'),Props=need('RRCharacterProps','./CharacterProps.js');
    const {add,sub,mul,dot,norm,cross,lerp}=Props.vec;
    const rigid=j=>({joints:[j,0,0,0],weights:[1,0,0,0]});
    const X=[1,0,0],Y=[0,1,0],Z=[0,0,1];
    let maps;
    function textileMaps(){
        if(maps)return maps;
        const size=128,normal=new Uint8Array(size*size*4),finish=new Uint8Array(size*size*4);
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
            const i=(y*size+x)*4,warp=Math.sin(x*Math.PI/2),weft=Math.sin(y*Math.PI/2),over=((x>>1)+(y>>1))%2;
            const n=norm([warp*(over?.20:.07),weft*(over?.07:.20),1]);
            normal.set(n.map(v=>Math.round(128+v*127)).concat(255),i);finish.set([255,Math.round(235+12*Math.cos(x*Math.PI/2)*Math.cos(y*Math.PI/2)),0,255],i);
        }
        return maps=[{name:'recon-textile-normal.png',width:size,height:size,data:normal,repeat:true},{name:'recon-textile-finish.png',width:size,height:size,data:finish,repeat:true}];
    }
    function finishTextile(part,s){
        part.uvs=new Float32Array(part.positions.length/3*2);
        for(let v=0;v<part.positions.length/3;v++){
            const N=part.normals.subarray(v*3,v*3+3),axis=Math.abs(N[0])>Math.abs(N[2])?2:0;
            part.uvs[v*2]=part.positions[v*3+axis]*18/s;part.uvs[v*2+1]=part.positions[v*3+1]*18/s;
        }
        part.normalTexture='recon-textile-normal.png';part.normalScale=.38;part.metallicRoughnessTexture='recon-textile-finish.png';return part;
    }
    /** A flat webbing strip with its cut edges enclosed. */
    function ribbon(mesh,path,width,thickness,color,skin,widthAxis,fit){
        const rows=path.map((p,i)=>{
            const along=norm(sub(path[Math.min(path.length-1,i+1)],path[Math.max(0,i-1)]));
            const axis=widthAxis||cross(Z,along),across=norm(sub(Math.hypot(...axis)>.01?axis:X,mul(along,dot(Math.hypot(...axis)>.01?axis:X,along)))),normal=norm(cross(across,along));
            return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{
                const q=add(p,add(mul(across,a*width/2),mul(normal,b*thickness/2)));
                return mesh.vertex(fit?fit(q,normal,b):q,normal,color,skin);
            });
        });
        for(let i=0;i+1<rows.length;i++)for(let k=0;k<4;k++){const j=(k+1)%4;mesh.tri(rows[i][k],rows[i+1][k],rows[i][j]);mesh.tri(rows[i][j],rows[i+1][k],rows[i+1][j]);}
        for(const [row,reverse] of [[rows[0],false],[rows.at(-1),true]]){const [a,b,c,d]=reverse?row.slice().reverse():row;mesh.tri(a,b,c);mesh.tri(a,c,d);}
    }
    const section=O.crossSection;
    function build(C,layers,surfaceAt){
        const s=C.scale,hip=C.bone('Hips').head[1],neck=C.bone('Neck').head[1],span=neck-hip;
        const fabric=new Props.Mesh(),binding=new Props.Mesh(),shells=new Props.Mesh(),fasteners=new Props.Mesh();
        const clothColor=C.color.map((v,k)=>v*.50+C.trim[k]*.20),edgeColor=clothColor.map(v=>v*.65),thread=C.color.map(v=>v*.8+.012);
        const spine=['Hips','Spine','Spine1','Spine2'].map(n=>({joint:C.joint(n),y:C.bone(n).head[1]}));
        const body=C.built.parts[0],surfaces=[body,...layers];
        const waistSurface=(part,v)=>part===body?C.an.member[C.pack.body.source[v]*5+1]+C.an.member[C.pack.body.source[v]*5+2]<.45:part.field?.[v]?.fam!==1&&part.field?.[v]?.fam!==2;
        const crest=O.projectedSurface(surfaces,{cell:.04*s,axes:[X,Z,Y],accept:(part,ids,p)=>p.every(q=>q[2]<neck+.02*s)&&p.some(q=>q[2]>neck-span*.3)});
        const spineSkin=p=>{
            let i=0;while(i+1<spine.length-1&&p[1]>spine[i+1].y)i++;
            const a=spine[i],b=spine[Math.min(i+1,spine.length-1)],u=Math.max(0,Math.min(1,(p[1]-a.y)/(b.y-a.y||1)));
            return {joints:[a.joint,b.joint,0,0],weights:[1-u,u,0,0]};
        };
        const front=(x,y,face=1,lift=.006*s)=>[x,y,surfaceAt(x,y,face>0?C.section(y).front:C.section(y).back,face)+face*lift];
        const clearFabric=(mesh,ids,face,gap)=>{
            let lift=0;
            for(const weights of [[1/3,1/3,1/3],[.5,.5,0],[.5,0,.5],[0,.5,.5]]){
                const p=[0,1,2].map(k=>ids.reduce((sum,v,i)=>sum+mesh.p[v*3+k]*weights[i],0));
                const z=surfaceAt(p[0],p[1],NaN,face);
                if(Number.isFinite(z))lift=Math.max(lift,face*(z-p[2])+gap);
            }
            if(lift>0)for(const v of ids)mesh.p[v*3+2]+=face*lift;
        };
        // The plate sits in a textile envelope, supported by broad shoulder
        // webbing and a waist cummerbund. Front/back panels retain torso skin.
        for(const face of [1,-1]){
            // (12 by 12 follows the torso as closely as 16 by 16 did; the saving keeps the recon kit under its budget.)
            const rows=[],R=12,K=12,low=hip+span*.28,high=neck-span*.105;
            for(let j=0;j<=R;j++){
                const u=j/R,y=low+(high-low)*u,q=C.section(y),half=q.width*(.90-.03*Math.sin(u*Math.PI)),row=[];
                for(let k=0;k<=K;k++){
                    const x=q.cx+(k/K*2-1)*half,p=front(x,y,face);
                    row.push(fabric.vertex(p,[0,0,face],clothColor,spineSkin));
                }rows.push(row);
            }
            for(let j=0;j<R;j++)for(let k=0;k<K;k++){
                const [a,b,c,d]=[rows[j][k],rows[j][k+1],rows[j+1][k],rows[j+1][k+1]];
                clearFabric(fabric,[a,b,c],face,.006*s);clearFabric(fabric,[b,d,c],face,.006*s);
                if(face>0){fabric.tri(a,b,c);fabric.tri(b,d,c);}else{fabric.tri(a,c,b);fabric.tri(b,c,d);}
            }
            const edge=rows[0].concat(rows.slice(1).map(r=>r[K]),rows.at(-1).slice(0,-1).reverse(),rows.slice(1,-1).reverse().map(r=>r[0]));
            const path=edge.map(v=>Array.from(fabric.p.slice(v*3,v*3+3)));path.push(path[0]);
            ribbon(binding,path,.003*s,.002*s,edgeColor,spineSkin);
            // Interrupted lock-stitches follow the panel's finished boundary.
            for(let i=0;i+1<path.length;i+=2){const a=add(path[i],[0,0,face*.0015*s]),b=add(lerp(path[i],path[i+1],.68),[0,0,face*.0015*s]);ribbon(binding,[a,b],.0007*s,.0005*s,thread,spineSkin);}
        }
        // Padded shoulder straps follow the torso up and over each shoulder.
        for(const sign of [-1,1]){
            const sh=C.bone(sign>0?'LeftArm':'RightArm').head,x=sh[0]*.62,high=sh[1],low=neck-span*.30,path=[];
            for(let j=0;j<=8;j++)path.push(front(x,low+(high-.018*s-low)*j/8,1,.010*s));
            const a=path.at(-1),b=front(x,high-.018*s,-1,.010*s);
            for(let j=1;j<=12;j++){const u=j/12,z=a[2]*(1-u)+b[2]*u;path.push([x,Math.max(high-.018*s+.025*s*Math.sin(Math.PI*u),crest.depth(x,z,high)+.010*s),z]);}
            for(let j=1;j<=8;j++)path.push(front(x,high-.018*s+(low-high+.018*s)*j/8,-1,.010*s));
            // Fit both edges of the padding. A centerline can clear the
            // shirt while the far edge disappears into a sloping shoulder.
            const fit=(p,n)=>{
                if(Math.abs(n[2])>.35){const face=Math.sign(n[2]),z=front(p[0],p[1],face,.008*s)[2];p[2]=face*Math.max(face*p[2],face*z);}
                if(n[1]>.35)p[1]=Math.max(p[1],crest.depth(p[0],p[2],p[1]-.008*s)+.008*s);
                return p;
            };
            ribbon(fabric,path,.041*s,.006*s,clothColor,spineSkin,X,fit);
            const at=front(x,neck-span*.18,1,.017*s),skin=spineSkin(at);
            for(const dx of [-.019,.019])fasteners.box(add(at,[dx*s,0,0]),[X,Y,Z],[.002*s,.018*s,.003*s],C.trim,skin);
            for(const dy of [-.018,.018])fasteners.box(add(at,[0,dy*s,0]),[X,Y,Z],[.020*s,.002*s,.003*s],C.trim,skin);
        }
        // Three flat webbing courses carry the lower pockets and close at the
        // sides. Their rear surface is visible, rather than an unsupported box.
        // The hip pivot sits behind some waist sections. Center each band
        // inside its own torso section, so radial rays cover the entire back.
        const waistOrigin=y=>{const q=C.section(y);return[q.cx,y,(q.front+q.back)/2];};
        const beltRows=[],beltR=5,beltK=64;
        for(let row=0;row<=beltR;row++){
            const y=hip+span*(.095+.20*row/beltR),origin=waistOrigin(y),ring=section(surfaces,origin,[X,Y,Z],waistSurface,s),ids=[];
            for(let j=0;j<=beltK;j++){const p=ring(j/beltK*Math.PI*2,.009*s);ids.push(fabric.vertex(p,norm(sub(p,origin)),clothColor,spineSkin));}beltRows.push(ids);
        }
        for(let r=0;r<beltR;r++)for(let k=0;k<beltK;k++){
            const a=beltRows[r][k],b=beltRows[r][k+1],c=beltRows[r+1][k],d=beltRows[r+1][k+1];
            const face=Math.sign(Math.cos((k+.5)/beltK*Math.PI*2))||1;
            clearFabric(fabric,[a,b,c],face,.003*s);clearFabric(fabric,[b,d,c],face,.003*s);
            fabric.tri(a,b,c);fabric.tri(b,d,c);
        }
        for(let course=0;course<3;course++){
            const y=hip+span*(.12+.065*course),origin=waistOrigin(y),ring=section(surfaces,origin,[X,Y,Z],waistSurface,s);
            const edges=[-1,1].map(sign=>section(surfaces,waistOrigin(y+sign*.008*s),[X,Y,Z],waistSurface,s));
            const fit=(p,n,b)=>edges[p[1]>y?1:0](Math.atan2(p[0]-origin[0],p[2]-origin[2]),(.013-b*.001)*s);
            ribbon(fabric,Array.from({length:65},(_,j)=>ring(j/64*Math.PI*2,.013*s)),.016*s,.002*s,edgeColor,spineSkin,Y,fit);
        }
        // Knee pads are shallow, closed cups formed on the actual trouser
        // surface. Each follows the lower leg; separate straps flex on each
        // side of the knee, so the shell never rides a distant thigh frame.
        for(const side of ['Left','Right']){
            const fam=side==='Left'?3:4,E=C.envelope(side+'Leg',fam,0,.23),joint=C.joint(side+'Leg'),skin=rigid(joint),body=C.built.parts[0];
            const parts=[body,...layers],surface=O.projectedSurface(parts,{cell:.025*s,origin:E.B.head,axes:[E.side,E.along,E.front],accept:(part,ids,p)=>{
                if(p.every(q=>q[1]<-.10*s)||p.every(q=>q[1]>.17*s))return false;
                return ids.every(v=>part===body?C.an.member[C.pack.body.source[v]*5+fam]>.5:part.field?.[v]?.fam===fam);
            }});
            const points=[];
            for(let v=0;v<body.positions.length/3;v++)if(C.an.member[C.pack.body.source[v]*5+fam]>.5){const p=sub(Array.from(body.positions.subarray(v*3,v*3+3)),E.B.head);if(Math.abs(dot(p,E.along))<.07*s)points.push([dot(p,E.side),dot(p,E.along)]);}
            let width=.035*s;for(const p of points)width=Math.max(width,Math.abs(p[0]));
            const R=12,K=16,frontRows=[],backRows=[],world=(x,y,z)=>add(E.B.head,add(mul(E.side,x),add(mul(E.along,y),mul(E.front,z))));
            for(let j=0;j<=R;j++){
                const v=j/R,y=(-.036+.125*v)*s,row=[],back=[];
                const upper=.45*Math.max(0,1-v/.36),rimSkin={joints:[joint,C.joint(side+'UpLeg'),0,0],weights:[1-upper,upper,0,0]};
                let half=width*(.72+.20*Math.sin(v*Math.PI));
                for(let k=0;k<=K;k++){
                    const u=k/K*2-1;let x=u*half,hit=surface.sample(x,y);
                    for(let retry=0;!hit&&retry<8;retry++){x*=.9;hit=surface.sample(x,y);}
                    const z=hit?.depth??E.rz,relief=(.008+.006*(1-u*u)*Math.sin(v*Math.PI))*s;
                    const color=Math.abs(u)>.86||v<.09||v>.91?C.trim.map(q=>q*1.6):C.color;
                    row.push(shells.vertex(world(x,y,z+relief),E.front,color,rimSkin));back.push(shells.vertex(world(x,y,z+.002*s),mul(E.front,-1),mul(C.color,.55),rimSkin));
                }frontRows.push(row);backRows.push(back);
            }
            for(let j=0;j<R;j++)for(let k=0;k<K;k++){
                for(const [rows,reverse]of [[frontRows,false],[backRows,true]]){
                    const [a,b,c,d]=[rows[j][k],rows[j][k+1],rows[j+1][k],rows[j+1][k+1]];
                    if(reverse){shells.tri(a,c,b);shells.tri(b,c,d);}else{shells.tri(a,b,c);shells.tri(b,d,c);}
                }
            }
            const edge=frontRows[0].map((v,k)=>[v,backRows[0][k]]).concat(frontRows.slice(1).map((r,j)=>[r[K],backRows[j+1][K]]),frontRows.at(-1).slice(0,-1).reverse().map((v,k)=>[v,backRows.at(-1)[K-1-k]]),frontRows.slice(1,-1).reverse().map((r,j)=>[r[0],backRows[R-1-j][0]]));
            for(let i=0;i<edge.length;i++){const [a,b]=edge[i],[c,d]=edge[(i+1)%edge.length];shells.tri(a,b,c);shells.tri(b,d,c);}
            for(const [name,t]of [[side+'UpLeg',.94],[side+'Leg',.22]]){
                const L=C.envelope(name,fam,Math.max(0,t-.05),Math.min(1,t+.05)),at=L.point(t),bandSkin=rigid(C.joint(name));
                const ring=section(parts,at,[L.side,L.along,L.front],(part,v)=>part===body?C.an.member[C.pack.body.source[v]*5+fam]>.45:part.field?.[v]?.fam===fam,s);
                const path=Array.from({length:49},(_,k)=>ring(k/48*Math.PI*2,.004*s));
                ribbon(fabric,path,.014*s,.003*s,edgeColor,bandSkin,L.along);
                for(const sign of [-1,1]){
                    const a=ring(sign*.7,.005*s),row=name.endsWith('UpLeg')?frontRows[0]:frontRows.at(-1),v=row[sign>0?K-3:3];
                    const b=Array.from(shells.p.slice(v*3,v*3+3)),axis=sub(b,a),den=dot(axis,axis)||1;
                    const jointA=C.joint(name),blend=p=>{
                        const u=Math.max(0,Math.min(1,dot(sub(p,a),axis)/den)),weights=new Map([[jointA,1-u]]);
                        for(let k=0;k<4;k++){const q=shells.j[v*4+k],w=shells.w[v*4+k];if(w)weights.set(q,(weights.get(q)||0)+w*u);}
                        const entries=[...weights];return {joints:Array.from({length:4},(_,k)=>entries[k]?.[0]||0),weights:Array.from({length:4},(_,k)=>entries[k]?.[1]||0)};
                    };
                    ribbon(fabric,[a,add(lerp(a,b,.5),mul(E.front,.002*s)),b],.012*s,.002*s,edgeColor,blend,E.side);
                }
                const outer=ring(side==='Left'?-Math.PI/2:Math.PI/2,.008*s);
                fasteners.box(outer,[L.front,L.along,L.side],[.009*s,.012*s,.003*s],C.trim,bandSkin);
            }
        }
        const parts=[];
        for(const [mesh,name,material]of [[fabric,'Recon textile carrier',{kind:'cloth',clothDetail:true,roughness:.94,metalness:0}],[binding,'Recon bindings and stitching',{kind:'cloth',clothDetail:true,roughness:.95,metalness:0}],[shells,'Recon knee shells',{roughness:.58,metalness:.22}],[fasteners,'Recon strap adjusters',{roughness:.52,metalness:.55}]]){
            if(mesh.empty)continue;mesh.computeNormals();const part=mesh.part(name,material);parts.push(material.kind==='cloth'?finishTextile(part,s):part);
        }
        return {parts,textures:textileMaps()};
    }
    const api={build};root.RRCharacterReconConstruction=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
