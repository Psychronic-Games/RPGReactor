/** Procedural hard armor: beveled plates fitted to the body, rigid on the bones that carry them. */
(function(root) {
    'use strict';
    const Outfit = root.RRCharacterOutfit || require('./CharacterOutfit.js');
    const add = (a, b) => a.map((x, i) => x + b[i]);
    const sub = (a, b) => a.map((x, i) => x - b[i]);
    const mul = (a, t) => a.map(x => x * t);
    const dot = (a, b) => a.reduce((n, x, i) => n + x * b[i], 0);
    const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
    const norm = a => mul(a, 1 / (Math.hypot(...a) || 1));
    const lerp = (a, b, t) => add(a, mul(sub(b, a), t));
    const X = [1,0,0], Y = [0,1,0], Z = [0,0,1];
    const OCTAGON = [[-.65,1],[.65,1],[1,.65],[1,-.65],[.65,-1],[-.65,-1],[-1,-.65],[-1,.65]];

    class Mesh {
        constructor() { this.p=[]; this.n=[]; this.c=[]; this.j=[]; this.w=[]; this.i=[]; }
        face(points, color, joint, outward) {
            let n = norm(cross(sub(points[1], points[0]), sub(points[2], points[0])));
            if (outward && dot(n, outward) < 0) { points=points.slice().reverse(); n=mul(n,-1); }
            const base=this.p.length/3;
            for (const p of points) { this.p.push(...p); this.n.push(...n); this.c.push(...color); this.j.push(joint,0,0,0); this.w.push(1,0,0,0); }
            for (let k=1;k+1<points.length;k++) this.i.push(base,base+k,base+k+1);
        }
        /**
         * Rings of points (each the same count, closed round) joined into one smooth surface: shared
         * vertices, normals averaged from the faces round them, facing away from `inside`.
         */
        loft(rings, color, joint, inside, colorAt, open = false) {
            const base = this.p.length / 3, n = rings[0].length, edges = open ? n - 1 : n;
            rings.forEach((ring, r) => ring.forEach((p, k) => { this.p.push(...p); this.n.push(0, 0, 0); this.c.push(...(colorAt ? colorAt(r, k) : color)); this.j.push(joint, 0, 0, 0); this.w.push(1, 0, 0, 0); }));
            const first = this.i.length;
            for (let r = 0; r + 1 < rings.length; r++) for (let k = 0; k < edges; k++) {
                const a = base + r * n + k, b = base + r * n + (k + 1) % n, c = base + (r + 1) * n + k, d = base + (r + 1) * n + (k + 1) % n;
                this.i.push(a, b, d, a, d, c);
            }
            // Wound to face out: test one face against the way out from the inside point.
            const at = q => [this.p[q * 3], this.p[q * 3 + 1], this.p[q * 3 + 2]];
            const mid = Math.floor(rings.length / 2) * edges;
            const t = [this.i[first + mid * 6], this.i[first + mid * 6 + 1], this.i[first + mid * 6 + 2]];
            if (t.every(Number.isFinite)) {
                const fn = cross(sub(at(t[1]), at(t[0])), sub(at(t[2]), at(t[0])));
                if (dot(fn, sub(at(t[0]), inside(at(t[0])))) < 0) for (let q = first; q < this.i.length; q += 3) { const x = this.i[q + 1]; this.i[q + 1] = this.i[q + 2]; this.i[q + 2] = x; }
            }
            for (let q = first; q < this.i.length; q += 3) {
                const [a, b, c] = [this.i[q], this.i[q + 1], this.i[q + 2]];
                const fn = cross(sub(at(b), at(a)), sub(at(c), at(a)));
                for (const v of [a, b, c]) { this.n[v * 3] += fn[0]; this.n[v * 3 + 1] += fn[1]; this.n[v * 3 + 2] += fn[2]; }
            }
            for (let v = base; v < this.p.length / 3; v++) { const l = Math.hypot(this.n[v * 3], this.n[v * 3 + 1], this.n[v * 3 + 2]) || 1; this.n[v * 3] /= l; this.n[v * 3 + 1] /= l; this.n[v * 3 + 2] /= l; }
            return base;
        }
        part(name, material) {
            return Object.assign({ name, positions:Float32Array.from(this.p), normals:Float32Array.from(this.n), colors:Float32Array.from(this.c),
                joints:Uint8Array.from(this.j), weights:Float32Array.from(this.w), index:Uint32Array.from(this.i) },material);
        }
    }

    /** Closed plate, with an inset face and a real bevel instead of a painted edge. */
    function plate(mesh, outline, outward, depth, bevel, color, joint) {
        const center=mul(outline.reduce(add,[0,0,0]),1/outline.length);
        const inset=outline.map(p=>add(p,mul(norm(sub(center,p)),bevel)));
        const rings=[outline.map(p=>sub(p,mul(outward,depth))), outline.map(p=>sub(p,mul(outward,bevel))), inset];
        mesh.face(rings[0],mul(color,.62),joint,mul(outward,-1));
        for(let r=0;r<2;r++) for(let k=0;k<outline.length;k++) {
            const next=(k+1)%outline.length;
            const side=norm(sub(lerp(outline[k],outline[next],.5),center));
            mesh.face([rings[r][k],rings[r][next],rings[r+1][next],rings[r+1][k]],mul(color,r===0?.72:.93),joint,r===0?side:norm(add(side,outward)));
        }
        mesh.face(inset,color,joint,outward);
    }
    function rectangle(mesh, center, a, b, width, height, normal, color, joint, depth=.006, bevel=.002) {
        plate(mesh,[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>add(center,add(mul(a,x*width/2),mul(b,y*height/2)))),normal,depth,bevel,color,joint);
    }

    /** Project a formed shell's silhouette in two planes. The convex outlines
     * bridge skin folds vertically, so neighboring armor rows cannot turn into
     * alternating wide discs and narrow bands on an exaggerated torso. */
    function formedSections(points) {
        const hull=axis=>{
            const list=points.map(p=>[p[1],p[axis]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
            const a=[],b=[];
            for(const p of list){while(a.length>1&&cross(a.at(-2),a.at(-1),p)<=0)a.pop();a.push(p);}
            for(let i=list.length-1;i>=0;i--){const p=list[i];while(b.length>1&&cross(b.at(-2),b.at(-1),p)<=0)b.pop();b.push(p);}
            return a.slice(0,-1).concat(b.slice(0,-1));
        };
        const sides=hull(0),depth=hull(2),low=Math.min(...points.map(p=>p[1])),high=Math.max(...points.map(p=>p[1]));
        const extent=(polygon,y)=>{
            let lo=Infinity,hi=-Infinity;
            for(let i=0;i<polygon.length;i++){
                const a=polygon[i],b=polygon[(i+1)%polygon.length];if(y<Math.min(a[0],b[0])-1e-7||y>Math.max(a[0],b[0])+1e-7)continue;
                if(Math.abs(a[0]-b[0])<1e-9){lo=Math.min(lo,a[1],b[1]);hi=Math.max(hi,a[1],b[1]);continue;}
                const v=a[1]+(b[1]-a[1])*(y-a[0])/(b[0]-a[0]);lo=Math.min(lo,v);hi=Math.max(hi,v);
            }return[lo,hi];
        };
        return y=>{y=Math.max(low+1e-6,Math.min(high-1e-6,y));const[left,right]=extent(sides,y),[back,front]=extent(depth,y);return{left,right,front,back,cx:(left+right)/2,cz:(front+back)/2,width:(right-left)/2};};
    }

    function context(pack,built,item) {
        const an=Outfit.anatomy(pack), P=built.shaped, ids=[...new Set(pack.body.source)];
        const bones=built.bones, bone=name=>bones.find(b=>b.name===name), joint=name=>bones.findIndex(b=>b.name===name);
        const scale=built.height/1.7, bulk=Math.max(0,Math.min(1.5,item.bulk??.6));
        const color=Outfit.linear(item.color||'#606d70'), trim=Outfit.linear(item.trim||'#273137'), accent=Outfit.linear(item.color2||'#e5ad55');
        const shell=new Mesh(), hardware=new Mesh(), indicators=new Mesh();
        const at=(v)=>[P[v*3],P[v*3+1],P[v*3+2]];
        const torsoIds=ids.filter(v=>an.member[v*5]>.55);
        const section=formedSections(torsoIds.filter(v=>an.s[v*5]>.0&&an.s[v*5]<4.05).map(at));
        function envelope(name,family,t0,t1) {
            // Pack tails are drawing handles, not always the next articulation.
            const next=name.replace(/(ForeArm|UpLeg|Arm|Leg)$/, part=>({Arm:'ForeArm',ForeArm:'Hand',UpLeg:'Leg',Leg:'Foot'}[part]));
            const B=bone(name), end=bone(next).head, along=norm(sub(end,B.head));
            const front=norm(sub(Z,mul(along,dot(Z,along)))), side=norm(cross(along,front));
            const length=Math.hypot(...sub(end,B.head));
            let rx=.02*scale,rz=.02*scale;
            for(const v of ids) {
                if(an.member[v*5+family]<.45)continue;
                const q=sub(at(v),B.head),t=dot(q,along)/length;
                if(t<t0||t>t1)continue;
                rx=Math.max(rx,Math.abs(dot(q,side)));rz=Math.max(rz,Math.abs(dot(q,front)));
            }
            return {B,along,front,side,length,rx,rz,point:t=>lerp(B.head,end,t)};
        }
        return {pack,built,item,an,P,ids,bone,joint,scale,bulk,color,trim,accent,shell,hardware,indicators,at,section,envelope};
    }

    /** A rounded section (a squarish ellipse) of `n` points round an axis. */
    function roundSection(center, side, front, rx, rz, n=20, e=3) {
        return Array.from({length:n},(_,k)=>{ const a=k/n*Math.PI*2, ca=Math.cos(a), sa=Math.sin(a), r=1/Math.pow(Math.pow(Math.abs(ca),e)+Math.pow(Math.abs(sa),e),1/e); return add(center,add(mul(front,ca*r*rz),mul(side,sa*r*rx))); });
    }
    /** A smooth tube through points (armored cabling), radius r. */
    function cable(mesh, points, r, color, joint) {
        const rings=points.map((p,i)=>{ const a=points[Math.max(0,i-1)], b=points[Math.min(points.length-1,i+1)], d=norm(sub(b,a)); const x=norm(cross(d,Math.abs(d[1])<.9?Y:X)), y=cross(d,x); return Array.from({length:8},(_,k)=>add(p,add(mul(x,Math.cos(k/8*Math.PI*2)*r),mul(y,Math.sin(k/8*Math.PI*2)*r)))); });
        mesh.loft(rings,color,joint,p=>points.reduce((best,q)=>Math.hypot(...sub(p,q))<Math.hypot(...sub(p,best))?q:best,points[0]));
        // Ribbed sleeves along it.
        for(let i=1;i+1<points.length;i+=2) mesh.loft([0,1].map(t=>rings[i].map(q=>add(q,mul(norm(sub(q,points[i])),r*.35+t*0)))).map((ring,t)=>ring.map(q=>add(q,mul(norm(sub(points[i+1],points[i])),(t-.5)*r*.8)))),mul(color,.8),joint,()=>points[i]);
    }
    /** A bolt head: a short hex on a face. */
    function bolt(mesh, at, normal, r, color, joint) {
        const x=norm(cross(normal,Math.abs(normal[1])<.9?Y:X)), y=cross(normal,x);
        const ring=h=>Array.from({length:6},(_,k)=>add(add(at,mul(normal,h)),add(mul(x,Math.cos(k/6*Math.PI*2)*r),mul(y,Math.sin(k/6*Math.PI*2)*r))));
        mesh.loft([ring(0),ring(r*.6)],color,joint,()=>sub(at,mul(normal,r)));
        mesh.face(ring(r*.6),mul(color,1.15),joint,normal);
    }

    /**
     * A rigid limb housing: a rounded, tapered shell (smooth, many-sided), a raised
     * rim at each end, a recessed seam round its middle, a raised front panel with
     * a reveal, and bolts at its ends.
     */
    function housing(C,name,family,lo,hi,extra=0) {
        const E=C.envelope(name,family,lo,hi), s=C.scale;
        const gap=(.015+.014*C.bulk+extra)*s;
        const radius=[E.rx+gap,E.rz+gap], joint=C.joint(name);
        const taper=/ForeArm$/.test(name)?.68:/UpLeg$/.test(name)?.78:/Leg$/.test(name)?.63:.82;
        const ts=[lo,lo+.02,lo+.05,.5*(lo+hi)-.012,.5*(lo+hi),.5*(lo+hi)+.012,hi-.05,hi-.02,hi];
        const width=t=>1+(taper-1)*(t-lo)/(hi-lo);
        // Rims stand proud, the seam sinks in.
        const swell=[.985,1.02,1,1,.965,1,1,1.02,.985];
        const rings=ts.map((t,r)=>roundSection(E.point(t),E.side,E.front,radius[0]*width(t)*swell[r],radius[1]*width(t)*swell[r]));
        C.shell.loft(rings,C.color,joint,p=>E.point(Math.max(lo,Math.min(hi,dot(sub(p,E.B.head),E.along)/E.length))),(r)=>r===4?mul(C.color,.5):r===1||r===7?mul(C.color,.92):C.color);
        // The ends closed with a dark cap (the undersuit shows through only at the joint).
        for(const [r,dir] of [[0,-1],[ts.length-1,1]]) C.shell.face(rings[r],mul(C.color,.6),joint,mul(E.along,dir));
        // A raised front panel with a narrow reveal.
        const frontCenter=add(E.point((lo+hi)/2-.08*(hi-lo)),mul(E.front,radius[1]*width((lo+hi)/2)+.003*s));
        const w=radius[0]*1.1,h=E.length*(hi-lo)*.42;
        plate(C.shell,OCTAGON.map(([x,y])=>add(frontCenter,add(mul(E.side,x*w/2),mul(E.along,y*h/2)))),E.front,.006*s,.0025*s,mul(C.color,1.05),joint);
        rectangle(C.hardware,add(frontCenter,mul(E.along,-h*.36)),E.side,E.along,w*.55,.006*s,E.front,C.trim,joint,.002*s,.0008*s);
        // Bolts round both rims.
        for(const t of [ts[1],ts[ts.length-2]]) for(const k of [3,8,13,18]) {
            const ring=roundSection(E.point(t),E.side,E.front,radius[0]*width(t)*1.02,radius[1]*width(t)*1.02), p=ring[k], n=norm(sub(p,E.point(t)));
            bolt(C.hardware,p,n,.0035*s,mul(C.trim,1.3),joint);
        }
        return E;
    }

    /** A layered joint guard: a main plate and a smaller one over it. */
    function layeredGuard(C,center,front,side,up,width,height,joint) {
        guard(C,center,front,side,up,width,height,joint);
        guard(C,add(add(center,mul(front,.008*C.scale)),mul(up,height*.12)),front,side,up,width*.62,height*.5,joint);
        bolt(C.hardware,add(add(center,mul(front,.016*C.scale)),mul(up,height*.12)),front,.004*C.scale,mul(C.trim,1.3),joint);
    }

    function guard(C,center,front,side,up,width,height,joint) {
        plate(C.shell,OCTAGON.map(([x,y])=>add(center,add(mul(side,x*width/2),mul(up,y*height/2)))),front,.012*C.scale,.005*C.scale,C.color,joint);
    }

    function torso(C) {
        const s=C.scale, gap=(.022+.018*C.bulk)*s;
        const hip=C.bone('Hips').head[1], neck=C.bone('Neck').head[1];
        const chestLow=C.bone('Spine1').head[1]+.025*s, top=neck-.018*s;
        const mid=(top+chestLow)/2, section=C.section(mid);
        // A housing follows several chest sections instead of a box sized
        // from the widest/deepest sample anywhere between belly and collar.
        // It stays one rigid piece on Spine2; its rest shape is formed metal.
        const chestRings=Array.from({length:9},(_,r)=>{
            const t=r/8,y=chestLow+(top-chestLow)*t,q=C.section(y),axis=[q.cx,y,q.cz];
            let rx=q.width+gap,rz=(q.front-q.back)/2+gap,grow=1;
            for(const v of C.ids)if(C.an.member[v*5]>.55&&Math.abs(C.P[v*3+1]-y)<.025*s){
                grow=Math.max(grow,(Math.abs((C.P[v*3]-q.cx)/rx)**3+Math.abs((C.P[v*3+2]-q.cz)/rz)**3)**(1/3));
            }
            rx*=grow;rz*=grow;
            return roundSection(axis,X,Z,rx,rz,32,3);
        });
        C.shell.loft(chestRings,C.color,C.joint('Spine2'),p=>{const q=C.section(p[1]);return[q.cx,p[1],q.cz];});
        const chestFace=(x,y,side=1)=>{
            const u=Math.max(0,Math.min(7.99999,(y-chestLow)/(top-chestLow)*8)),r=Math.floor(u),t=u-r;
            const ring=chestRings[r].map((p,k)=>lerp(p,chestRings[r+1][k],t));
            let z=side>0?-Infinity:Infinity;
            for(let k=0;k<ring.length;k++){const a=ring[k],b=ring[(k+1)%ring.length];if(x<Math.min(a[0],b[0])||x>Math.max(a[0],b[0])||Math.abs(a[0]-b[0])<1e-9)continue;const d=(x-a[0])/(b[0]-a[0]),v=a[2]+d*(b[2]-a[2]);z=side>0?Math.max(z,v):Math.min(z,v);}
            return Number.isFinite(z)?z:side>0?C.section(y).front+gap:C.section(y).back-gap;
        };
        for(const side of [-1,1]) {
            const normal=[0,0,side];
            // Recessed vent banks, kept low contrast; color is reserved for status lights.
            for(const hand of [-1,1])for(let row=0;row<3;row++){
                const y=mid+.035*s-row*.016*s,q=C.section(y),x=q.cx+hand*q.width*.48;
                rectangle(C.hardware,[x,y,chestFace(x,y,side)+side*.004*s],X,Y,q.width*.3,.007*s,normal,C.trim,C.joint('Spine2'),.002*s,.0008*s);
            }
        }
        const lightY=top-.033*s,lightX=C.section(lightY).cx-C.section(lightY).width*.42;
        rectangle(C.indicators,[lightX,lightY,chestFace(lightX,lightY)+.006*s],X,Y,.035*s,.009*s,Z,C.accent,C.joint('Spine2'),.003*s,.001*s);
        // Rib housings wrap the torso below the arm openings.
        for(const side of [-1,1]) {
            const normal=[side,0,0], y=chestLow+.045*s, q=C.section(y);
            rectangle(C.hardware,[side>0?q.right+gap:q.left-gap,y,q.cz],Z,Y,(q.front-q.back)*.82,.085*s,normal,C.trim,C.joint('Spine1'),.012*s,.005*s);
        }
        // Articulated lames overlap along the actual abdomen. Flat front/back
        // plaques left black steps and floated clear of a broad belly.
        const bottom=hip+.01*s, end=chestLow+.008*s, count=3;
        for(let row=0;row<count;row++) {
            const lo=bottom+(end-bottom)*row/count,hi=bottom+(end-bottom)*(row+1)/count+.008*s;
            const joint=C.joint(row===2?'Spine1':'Spine');
            const rings=Array.from({length:5},(_,r)=>{
                const y=lo+(hi-lo)*r/4,q=C.section(y),lip=r===0?.003*s:0;
                return roundSection([q.cx,y,q.cz],X,Z,q.width+gap+lip,(q.front-q.back)/2+gap+lip,32,3);
            });
            C.shell.loft(rings,mul(C.color,.89),joint,p=>{const q=C.section(p[1]);return[q.cx,p[1],q.cz];},r=>r===0?mul(C.color,.65):mul(C.color,.89));
        }
        // Pelvic armor ends above the hip flexion crease; the dark suit remains visible between pieces.
        const pelvis=C.section(hip-.055*s);
        guard(C,[pelvis.cx,hip-.07*s,pelvis.front+gap],Z,X,Y,pelvis.width*1.45,.13*s,C.joint('Hips'));
        for(const side of [-1,1]) {
            const x=side>0?pelvis.right+gap:pelvis.left-gap;
            rectangle(C.shell,[x,hip-.035*s,pelvis.cz],Z,Y,(pelvis.front-pelvis.back)*.7,.14*s,[side,0,0],C.color,C.joint('Hips'),.018*s,.005*s);
        }
        // A gorget: a raised collar of two overlapping rings round the neck, meeting the helmet's rim.
        {
            const neck=C.bone('Neck').head, joint=C.joint('Spine2');
            const points=C.ids.filter(v=>C.an.s[v*5]>3.9&&C.an.s[v*5]<4.6&&Math.abs(C.P[v*3+1]-neck[1])<.028*s);
            const n=points.length?{width:Math.max(...points.map(v=>Math.abs(C.P[v*3]))),front:Math.max(...points.map(v=>C.P[v*3+2])),back:Math.min(...points.map(v=>C.P[v*3+2])),cx:neck[0]}:C.section(neck[1]);
            const rx=n.width+gap*.8, rz=(n.front-n.back)/2+gap*.8, c=[n.cx,neck[1],(n.front+n.back)/2];
            const rings=[[-.03,1.25],[-.012,1.18],[-.006,1.08],[.012,1.0],[.02,.97]].map(([dy,k])=>roundSection(add(c,[0,dy*s,0]),X,Z,rx*k,rz*k,24,3));
            C.shell.loft(rings,C.color,joint,p=>[c[0],p[1],c[2]],r=>r===2?mul(C.color,.55):C.color);
        }
        // A ridge down the breastplate and seams across it.
        for(let r=0;r<8;r++){
            const a=chestRings[r][0],b=chestRings[r+1][0];
            C.shell.face([add(a,[-.005*s,0,.002*s]),add(a,[.005*s,0,.002*s]),add(b,[.005*s,0,.002*s]),add(b,[-.005*s,0,.002*s])],mul(C.color,1.1),C.joint('Spine2'),Z);
        }
        for(const k of [.3,.62])for(const side of [-1,1]){
            const y=chestLow+(top-chestLow)*k,q=C.section(y),x=q.cx+side*q.width*.55;
            rectangle(C.hardware,[x,y,chestFace(x,y)+.004*s],X,Y,q.width*.38,.0035*s,Z,C.trim,C.joint('Spine2'),.0015*s,.0006*s);
        }
        // A compact power unit sits flush on the back plate.
        rectangle(C.hardware,[section.cx,mid,chestFace(section.cx,mid,-1)-.012*s],X,Y,section.width*.65,(top-chestLow)*.42,mul(Z,-1),C.trim,C.joint('Spine2'),.025*s,.006*s);
        for(const side of [-1,1]){const x=section.cx+side*section.width*.26;rectangle(C.shell,[x,mid,chestFace(x,mid,-1)-.018*s],X,Y,.025*s,(top-chestLow)*.32,mul(Z,-1),mul(C.color,.9),C.joint('Spine2'),.008*s,.003*s);}
    }

    function undersuit(C,hands) {
        const body=C.built.parts[0], source=C.pack.body.source, hidden=new Set(), keep=[];
        // Gauntlets alone (item.only 'hands'): the glove from just above the wrist.
        const onHand=v=>(C.an.member[v*5+1]>.5&&C.an.s[v*5+1]>2.7)||(C.an.member[v*5+2]>.5&&C.an.s[v*5+2]>2.7);
        const cover=hands?onHand:v=>!(C.an.member[v*5]>.5&&C.an.s[v*5]>4.5);
        for(let t=0;t<body.index.length;t+=3) {
            const tri=[body.index[t],body.index[t+1],body.index[t+2]];
            if(!tri.every(v=>cover(source[v])))continue;
            keep.push(...tri);for(const v of tri)hidden.add(source[v]);
        }
        const positions=Float32Array.from(body.positions),colors=new Float32Array(positions.length);
        const rubber=Outfit.linear('#20272c');
        for(let i=0;i<positions.length;i+=3) {
            for(let k=0;k<3;k++)positions[i+k]+=body.normals[i+k]*.009*C.scale;
            colors.set(rubber,i);
        }
        const joints=Uint8Array.from(body.joints),weights=Float32Array.from(body.weights);
        if(!hands&&C.item.rigidFeet!==false)for(let v=0;v<positions.length/3;v++){
            const src=source[v],family=positions[v*3]>0?3:4;
            if(C.an.member[src*5+family]<.5)continue;
            Outfit.rigidFootSkin(C.built,positions.subarray(v*3,v*3+3),{joints:joints.subarray(v*4,v*4+4),weights:weights.subarray(v*4,v*4+4)});
        }
        return {part:Object.assign({},body,{name:'Power armor undersuit',positions,colors,joints,weights,index:Uint32Array.from(keep),texture:null,roughness:.88,metalness:0}),hidden};
    }

    function build(pack,built,item) {
        const C=context(pack,built,item),s=C.scale,hands=item.only==='hands';
        if(!hands)torso(C);
        for(const [side,armFamily,legFamily] of [['Left',1,3],['Right',2,4]]) {
            if(!hands) {
            // Shoulder plates pivot with the upper arm, leaving a clear elbow articulation.
            housing(C,side+'Arm',armFamily,.02,.32,.025);
            housing(C,side+'Arm',armFamily,.43,.84);
            const forearm=housing(C,side+'ForeArm',armFamily,.13,.91);
            const thigh=housing(C,side+'UpLeg',legFamily,.14,.85);
            const shin=housing(C,side+'Leg',legFamily,.15,.86);
            const elbow=add(forearm.B.head,mul(forearm.front,forearm.rz+.027*s));
            layeredGuard(C,elbow,forearm.front,forearm.side,forearm.along,forearm.rx*1.35,.075*s,C.joint(side+'ForeArm'));
            const knee=add(shin.B.head,mul(shin.front,Math.max(thigh.rz,shin.rz)+.026*s));
            layeredGuard(C,knee,shin.front,shin.side,shin.along,shin.rx*1.7,.105*s,C.joint(side+'Leg'));
            // Armored cables from the back unit over the shoulder, and down the outside of the thigh.
            const sx=side==='Left'?1:-1, chestTop=C.bone('Neck').head[1]-.04*s, back=C.section(chestTop).back-(.03+.02*C.bulk)*s;
            const arm=C.bone(side+'Arm').head;
            cable(C.hardware,[[sx*.06*s,chestTop-.06*s,back-.02*s],[sx*.11*s,chestTop+.0*s,back+.01*s],[arm[0]-sx*.02*s,arm[1]+.05*s,arm[2]-.03*s]],.007*s,C.trim,C.joint('Spine2'));
            }
            // Rigid hand back; the fingers stay on the flexible glove and bend freely.
            const hand=C.bone(side+'Hand'),index=C.bone(side+'HandIndex1'),pinky=C.bone(side+'HandPinky1');
            if(index&&pinky) {
                const across=norm(sub(index.head,pinky.head)),along=norm(sub(lerp(index.head,pinky.head,.5),hand.head));
                let normal=norm(cross(across,along));if(dot(normal,Z)>0)normal=mul(normal,-1);
                const center=add(lerp(hand.head,lerp(index.head,pinky.head,.5),.55),mul(normal,.016*s));
                guard(C,center,normal,across,along,Math.hypot(...sub(index.head,pinky.head))*.95,.065*s,C.joint(side+'Hand'));
            }
        }
        const base=undersuit(C,hands);
        const parts=[base.part,C.shell.part('Power armor plating',{roughness:.38,metalness:.65}),C.hardware.part('Power armor hardware',{roughness:.62,metalness:.25}),C.indicators.part('Power armor indicators',{roughness:.3,metalness:.25})];
        return {parts:parts.filter(p=>p.index.length),hidden:base.hidden};
    }

    /**
     * The helmet: a closed, rounded shell from the neck over the crown (each
     * height's section fitted round the head, jaw and chin included), a visor
     * set back into its face, a chin guard with breathing vents, ear modules,
     * a crest along the top and a status light.
     */
    function helmet(pack,built,item) {
        const C=context(pack,built,item),s=C.scale,P=C.P,head=C.joint('Head');
        const ids=C.ids.filter(v=>C.an.member[v*5]>.6&&C.an.s[v*5]>4.2);
        const eyes=built.parts.find(p=>p.name==='Eyes').positions;
        let eyeY=0;for(let i=1;i<eyes.length;i+=3)eyeY+=eyes[i];eyeY/=eyes.length/3;
        const crown=Math.max(...ids.map(v=>P[v*3+1])), neckY=C.bone('Neck').head[1]+.012*s;
        const gap=.016*s, SIDES=44, e=2.6;
        // Section extents at a height: forward, back, out to the sides (ears included), grown to their neighbors'.
        const extent=y=>{
            let f=-Infinity,b=Infinity,w=0,cx=0,n=0;
            for(const v of ids){ if(Math.abs(P[v*3+1]-y)>.014*s)continue; f=Math.max(f,P[v*3+2]); b=Math.min(b,P[v*3+2]); w=Math.max(w,Math.abs(P[v*3])); cx+=P[v*3]; n++; }
            return n?{f,b,w,cx:cx/n}:null;
        };
        // Heights: the neck, the jaw, the visor's edges (a sharp step there), the brow, toward the crown.
        const vLow=eyeY-.03*s, vHigh=eyeY+.026*s;
        const ys=[neckY, neckY+(vLow-neckY)*.3, neckY+(vLow-neckY)*.6, vLow-.008*s, vLow, eyeY, vHigh, vHigh+.008*s, vHigh+(crown-vHigh)*.45, crown-.03*s];
        const secs=ys.map(extent);
        for(let i=0;i<secs.length;i++) if(!secs[i]) secs[i]=Object.assign({},secs[i-1]||secs.find(Boolean));
        for(const k of ['f','w']){ const raw=secs.map(x=>x[k]); secs.forEach((x,i)=>{ x[k]=Math.max(...raw.slice(Math.max(0,i-2),i+3)); }); }
        { const raw=secs.map(x=>x.b); secs.forEach((x,i)=>{ x.b=Math.min(...raw.slice(Math.max(0,i-2),i+3)); }); }
        // The neck ring narrower than the head: the shell closes under the jaw onto the collar.
        secs[0].w*=.92;
        const ringAt=(sec,y,grow,recess)=>Array.from({length:SIDES},(_,k)=>{
            const a=k/SIDES*Math.PI*2, ca=Math.cos(a), sa=Math.sin(a), cz=(sec.f+sec.b)/2;
            const hz=(ca>0?sec.f-cz:cz-sec.b)+gap, hx=sec.w+gap;
            let r=1/Math.pow(Math.pow(Math.abs(ca)/hz,e)+Math.pow(Math.abs(sa)/hx,e),1/e)*grow;
            // The visor's face set back into the shell.
            if(recess&&ca>Math.cos(1.0)) r-=recess*Math.min(1,(ca-Math.cos(1.0))/.12);
            return [sec.cx+sa*r,y,cz+ca*r];
        });
        const rings=ys.map((y,i)=>ringAt(secs[i],y,1,(i>=4&&i<=6)?.009*s:0));
        // Over the crown: rings closing to the top.
        const topSec=secs[secs.length-1], peak=crown+gap;
        for(let k=1;k<=5;k++){ const ph=k/5*Math.PI/2; rings.push(ringAt(topSec,topSec&&ys[ys.length-1]+(peak-ys[ys.length-1])*Math.sin(ph),Math.max(.04,Math.cos(ph)),0)); }
        const center=[0,eyeY,(secs[5].f+secs[5].b)/2];
        const shade=(r,k)=>{ const a=k/SIDES*Math.PI*2; const front=Math.cos(a)>Math.cos(1.0)&&r>=4&&r<=6; return front?mul(C.trim,.7):r===0?mul(C.color,.8):C.color; };
        C.shell.loft(rings,C.color,head,()=>center,shade);
        C.shell.face(rings[rings.length-1],C.color,head,Y);
        // The visor: a curved, dark glass band in the recess, just off its floor.
        const glass=[ringAt(secs[4],vLow+.002*s,1,.006*s),ringAt(secs[5],eyeY,1,.006*s),ringAt(secs[6],vHigh-.002*s,1,.006*s)].map(r=>r.filter((_,k)=>Math.cos(k/SIDES*Math.PI*2)>Math.cos(.95)));
        const order=r=>{ const front=r.map((p,k)=>[p,Math.atan2(p[0],p[2]-center[2])]).sort((a,b)=>a[1]-b[1]); return front.map(x=>x[0]); };
        const strips=glass.map(order);
        for(let r=0;r+1<strips.length;r++) for(let k=0;k+1<strips[r].length;k++) C.hardware.face([strips[r][k],strips[r][k+1],strips[r+1][k+1],strips[r+1][k]],Outfit.linear('#0c141b'),head,sub(lerp(strips[r][k],strips[r+1][k+1],.5),center));
        rectangle(C.indicators,add(strips[1][Math.floor(strips[1].length*.2)],[0,.006*s,.002*s]),X,Y,.03*s,.003*s,Z,C.accent,head,.001*s,.0005*s);
        // The chin guard: vents in a raised block under the visor.
        const chin=ringAt(secs[2],ys[2],1,0)[0];
        rectangle(C.hardware,add(chin,[0,0,.004*s]),X,Y,.05*s,.03*s,Z,C.trim,head,.006*s,.002*s);
        for(let i=-2;i<=2;i++) rectangle(C.shell,add(chin,[i*.009*s,0,.011*s]),X,Y,.004*s,.022*s,Z,mul(C.color,.55),head,.003*s,.001*s);
        // Ear modules: round housings either side.
        for(const side of [-1,1]){
            const ear=ringAt(secs[5],eyeY-.01*s,1,0)[side>0?Math.round(SIDES/4):Math.round(SIDES*3/4)];
            plate(C.hardware,OCTAGON.map(([x,y])=>add(ear,[0,y*.022*s,x*.022*s])),[side,0,0],.012*s,.004*s,C.trim,head);
            plate(C.indicators,OCTAGON.map(([x,y])=>add(ear,[side*.012*s,y*.006*s,x*.006*s])),[side,0,0],.003*s,.001*s,C.accent,head);
        }
        // A crest along the top, front to back.
        const crestPts=rings.slice(7).map(r=>r[0]).concat(rings.slice(7).reverse().map(r=>r[Math.round(SIDES/2)]));
        for(let k=0;k+1<crestPts.length;k++){ const a=crestPts[k],b=crestPts[k+1],up=norm(sub(lerp(a,b,.5),center)); C.shell.face([add(a,[-.006*s,0,0]),add(b,[-.006*s,0,0]),add(add(b,mul(up,.006*s)),[0,0,0]),add(add(a,mul(up,.006*s)),[0,0,0])],mul(C.color,1.08),head,[-1,0,0]); C.shell.face([add(a,[.006*s,0,0]),add(a,mul(up,.006*s)),add(b,mul(up,.006*s)),add(b,[.006*s,0,0])],mul(C.color,1.08),head,[1,0,0]); }
        const hidden=new Set(C.ids.filter(v=>C.an.member[v*5]>.5&&C.an.s[v*5]>4.3));
        return {parts:[C.shell.part('Power helmet plating',{roughness:.38,metalness:.65}),C.hardware.part('Power helmet visor',{roughness:.12,metalness:.6}),C.indicators.part('Power helmet indicators',{roughness:.3,metalness:.25})],hidden};
    }
    /** Medieval plate uses broad formed sheets, rather than the clothing helper's muscle contours. */
    function medieval(pack, built, item, kind, layers=[]) {
        const C=context(pack,built,item), s=C.scale, metal=C.shell, edge=C.hardware;
        const tint=Outfit.linear(item.trim || item.color2 || '#676d75');
        const clearance=.010*s;
        const fitted=C.ids.map(v=>({p:C.at(v),family:Array.from({length:5},(_,f)=>C.an.member[v*5+f]).reduce((a,b,f,all)=>b>all[a]?f:a,0)}));
        for(const layer of layers)for(let v=0;v<(layer.rimStart??layer.positions.length/3);v++) {
            const family=layer.field?.[v]?.fam;
            if(family!=null&&!layer.hang)fitted.push({p:Array.from(layer.positions.subarray(v*3,v*3+3)),family});
        }
        const torsoPoints=fitted.filter(v=>v.family===0).map(v=>v.p);
        const hipY=C.bone('Hips').head[1],neckY=C.bone('Neck').head[1];
        // The fauld overlaps the sewn skirt waist, even though cuisses must
        // fit inside that hanging skirt. Keep these two fitting envelopes separate.
        for(const layer of layers)if(layer.hang)for(let v=0;v<(layer.rimStart??layer.positions.length/3);v++){
            const y=layer.positions[v*3+1];if(y>hipY-.10*s&&y<hipY+.16*s)torsoPoints.push(Array.from(layer.positions.subarray(v*3,v*3+3)));
        }
        const section=formedSections(torsoPoints.filter(p=>p[1]>hipY-.16*s&&p[1]<neckY+.015*s));

        // A formed oval encloses its sampled section. No per-vertex muscle/breast displacement
        // is copied onto the plate; an axial keel gives the front its forged ridge.
        function oval(center, rx, front, back, keel=0, n=32) {
            return Array.from({length:n},(_,k)=>{
                const a=k/n*Math.PI*2, sn=Math.sin(a), cs=Math.cos(a);
                const r=1/Math.pow(Math.abs(sn)**2.3+Math.abs(cs)**2.3,1/2.3);
                return [center[0]+sn*rx*r,center[1],center[2]+cs*r*(cs>=0?front:back)+keel*Math.max(0,cs)**10];
            });
        }
        function rim(ring, joint, inside, amount=.0025*s) {
            const out=ring.map(p=>add(p,mul(norm(sub(p,inside(p))),amount)));
            edge.loft([out.map(p=>add(p,[0,-.0015*s,0])),out.map(p=>add(p,[0,.0015*s,0]))],tint,joint,inside);
        }
        function torsoRing(y, width, front, back, centerZ, keel=0) {
            return oval([0,y,centerZ],width,front,back,keel);
        }
        function cuirass() {
            const hip=C.bone('Hips').head[1], neck=C.bone('Neck').head[1];
            const waist=C.bone('Spine1').head[1]+.015*s, top=neck-.045*s;
            const chest=section(waist+(top-waist)*.65);
            const cx=(chest.front+chest.back)/2;
            // A single convex breast, shared across both sides. The waist is visibly pinched,
            // while the chest is broad and gently keeled, without two inflated breast cups.
            const rings=Array.from({length:13},(_,r)=>{
                const t=r/12;
                const y=waist+(top-waist)*t;
                const q=section(y), center=(q.front+q.back)/2;
                const shoulderCut=Math.max(0,(t-.55)/.45);
                let w=Math.min(q.width,chest.width*(1-.26*shoulderCut))+clearance*.65, front=q.front-center+clearance*.8, back=center-q.back+clearance*.8, grow=1;
                for(const p of torsoPoints)if(Math.abs(p[1]-y)<.025*s&&Math.abs(p[0])<w*.90) {
                    const dz=p[2]-center, depth=dz>0?front:back;
                    grow=Math.max(grow,(Math.abs(p[0]/w)**2.3+Math.abs(dz/depth)**2.3)**(1/2.3)+.015);
                }
                w*=grow;
                const ring=torsoRing(y,w,front*grow,back*grow,center,.024*s);
                if(r===12)ring.forEach((p,k)=>{p[1]-=.048*s*Math.abs(Math.sin(k/ring.length*Math.PI*2))**4;});
                if(r===0)ring.forEach((p,k)=>{p[1]-=.018*s*Math.max(0,Math.cos(k/ring.length*Math.PI*2))**8;});
                return ring;
            });
            const inside=p=>[0,p[1],cx], joint=C.joint('Spine2');
            metal.loft(rings,C.color,joint,inside);
            rim(rings[0],joint,inside);rim(rings.at(-1),joint,inside);
            // Real overlapping fauld lames below the breast, following successive spine bones.
            const low=hip+.025*s, span=waist-low;
            for(let row=0;row<3;row++) {
                const y0=low+span*row/3, y1=low+span*(row+1)/3+.008*s;
                const q=section((y0+y1)/2), cz=(q.front+q.back)/2;
                const rings=Array.from({length:5},(_,r)=>{
                    const y=y0+(y1-y0)*r/4,at=section(y),center=(at.front+at.back)/2;
                    return torsoRing(y,at.width+clearance+.006*s*(2-row)+(r===0?.003*s:0),at.front-center+clearance*2.2,center-at.back+clearance*2.2,center,.008*s);
                });
                const j=C.joint(row===2?'Spine1':'Spine'), axis=p=>[0,p[1],cz];
                metal.loft(rings,C.color,j,axis);rim(rings[0],j,axis,.0015*s);
            }
        }
        function limb(name, family, lo, hi) {
            const E=C.envelope(name,family,lo,hi), joint=C.joint(name);
            const count=17, rings=[];
            for(let r=0;r<count;r++) {
                const t=lo+(hi-lo)*r/(count-1), center=E.point(t), band=(hi-lo)*.12;
                let minX=Infinity,maxX=-Infinity,minZ=Infinity,maxZ=-Infinity,samples=[];
                for(const v of fitted) {
                    if(v.family!==family)continue;
                    const d=sub(v.p,E.B.head),u=dot(d,E.along)/E.length;
                    if(u<lo||u>hi||Math.abs(u-t)>band)continue;
                    const x=dot(d,E.side),z=dot(d,E.front);
                    minX=Math.min(minX,x);maxX=Math.max(maxX,x);minZ=Math.min(minZ,z);maxZ=Math.max(maxZ,z);samples.push([x,z]);
                }
                if(!samples.length){minX=-E.rx;maxX=E.rx;minZ=-E.rz;maxZ=E.rz;}
                const cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
                center.splice(0,3,...add(center,add(mul(E.side,cx),mul(E.front,cz))));
                let rx=(maxX-minX)/2+clearance,rz=(maxZ-minZ)/2+clearance,grow=1;
                for(const [x,z]of samples)grow=Math.max(grow,(Math.abs((x-cx)/rx)**2.5+Math.abs((z-cz)/rz)**2.5)**.4);
                rx*=grow;rz*=grow;
                const ring=roundSection(center,E.side,E.front,rx,rz,40,2.5);
                // A shallow central ridge, rather than an extra bulb over the entire limb.
                ring.forEach((p,k)=>{const cs=Math.cos(k/ring.length*Math.PI*2);if(cs>0)for(let a=0;a<3;a++)p[a]+=E.front[a]*.005*s*cs**8;});
                rings.push(ring);
            }
            const axis=p=>E.point(dot(sub(p,E.B.head),E.along)/E.length);
            // Bridge local muscle fluctuations with one continuous silhouette along each column.
            for(let k=0;k<rings[0].length;k++)for(let pass=0;pass<4;pass++){
                const prev=rings.map(r=>r[k]);
                for(let j=1;j+1<rings.length;j++){
                    const center=axis(prev[j]),v=sub(prev[j],center),radius=Math.hypot(...v),wanted=(Math.hypot(...sub(prev[j-1],axis(prev[j-1])))+2*radius+Math.hypot(...sub(prev[j+1],axis(prev[j+1]))))/4;
                    rings[j][k]=add(center,mul(v,Math.max(radius,wanted)/radius));
                }
            }
            metal.loft(rings,C.color,joint,axis);
            for(const t of [lo+.06*(hi-lo),hi-.06*(hi-lo)])for(const side of [-1,1]){
                const p=add(E.point(t),add(mul(E.side,E.rx*side*.70),mul(E.front,E.rz*.80+clearance*1.5)));
                bolt(edge,p,E.front,.0024*s,tint,joint);
            }
            // Rolled edges are narrow formed metal, not broad inflatable cuffs.
            for(const ring of [rings[0],rings.at(-1)]) {
                const rolled=ring.map(p=>add(p,mul(norm(sub(p,axis(p))),.002*s)));
                edge.loft([rolled.map(p=>sub(p,mul(E.along,.0015*s))),rolled.map(p=>add(p,mul(E.along,.0015*s)))],tint,joint,axis);
            }
            return E;
        }
        function shoulder(name,family) {
            const bulk=C.bulk, E=C.envelope(name,family,-.12,.48), joint=C.joint(name);
            const up=norm(sub(Y,mul(E.along,dot(Y,E.along))));
            const fw=norm(cross(E.along,up));
            let radiusUp=E.rx, radiusFront=E.rz;
            for(const v of fitted) {
                const d=sub(v.p,E.B.head), t=dot(d,E.along)/E.length;
                if(v.family!==family||t<-.12||t>.4||Math.hypot(...d)>.13*s)continue;
                radiusUp=Math.max(radiusUp,dot(d,up));radiusFront=Math.max(radiusFront,Math.abs(dot(d,fw)));
            }
            // One dished shoulder cap, followed by two close overlapping lames.
            // The front/back cut edges remain open over the mail articulation.
            for(let row=0;row<3;row++) {
                const lo=[-.12,.32,.39][row],hi=[.36,.40,.47][row],R=8,K=32;
                const rings=Array.from({length:R+1},(_,j)=>{
                    const t=j/R,along=lo+(hi-lo)*t;
                    const crown=row===0?(.50+.50*Math.sin(Math.PI*t*.82)):1-.10*t;
                    const rx=(radiusUp+(.010+.006*bulk-row*.003)*s)*crown;
                    const rz=(radiusFront+(.009+.005*bulk-row*.003)*s)*crown;
                    return Array.from({length:K+1},(_,k)=>{
                        const angle=-1.72+k/K*3.44;
                        return add(E.point(along),add(mul(up,Math.cos(angle)*rx),mul(fw,Math.sin(angle)*rz)));
                    });
                });
                const axis=p=>E.point(dot(sub(p,E.B.head),E.along)/E.length);
                metal.loft(rings,C.color,joint,axis,null,true);
                // A rolled lower lip and three small attachment rivets resolve the scale of the metal.
                const lip=rings.at(-1),outer=lip.map(p=>add(p,mul(norm(sub(p,axis(p))),.0014*s)));
                edge.loft([outer,outer.map(p=>sub(p,mul(E.along,.0025*s)))],tint,joint,axis,null,true);
                for(const k of [5,16,27]){
                    const p=rings[R-1][k],n=norm(sub(p,axis(p)));
                    bolt(edge,add(p,mul(n,.001*s)),n,.0022*s,tint,joint);
                }
            }
        }
        if(kind==='breastplate')cuirass();
        if(kind==='pauldrons')for(const [side,f]of [['Left',1],['Right',2]]) {
            shoulder(side+'Arm',f);
            limb(side+'Arm',f,.48,.88);
        }
        if(kind==='vambraces')for(const [side,f]of [['Left',1],['Right',2]])limb(side+'ForeArm',f,.16,.96);
        if(kind==='greaves')for(const [side,f]of [['Left',3],['Right',4]]) {
            limb(side+'UpLeg',f,.13,.89);
            const shin=limb(side+'Leg',f,.09,.97);
            const knee=add(shin.B.head,mul(shin.front,shin.rz+.026*s));
            const joint=C.joint(side+'Leg'), width=shin.rx*.92, height=.065*s;
            const shield=[[0,1],[.65,.65],[1,.2],[.8,-.6],[0,-1.2],[-.8,-.6],[-1,.2],[-.65,.65]];
            const rings=[[1,0],[.94,.003],[.65,.012],[.08,.017]].map(([size,lift])=>shield.map(([x,y])=>
                add(add(knee,mul(shin.front,lift*s)),add(mul(shin.side,x*width*size),mul(shin.along,y*height*size)))));
            metal.loft(rings,C.color,joint,()=>sub(knee,mul(shin.front,.02*s)));
            metal.face(rings.at(-1),C.color,joint,shin.front);
        }
        if(kind==='tassets') {
            const hip=C.bone('Hips').head[1], q=C.section(hip), cz=(q.front+q.back)/2;
            const h=(.08+Math.max(0,Math.min(1,item.length??.3))*.22)*s;
            for(const side of [-1,1])for(const face of [-1,1]) {
                const x=side*q.width*.54, z=(face>0?q.front:q.back)+face*.036*s;
                const joint=C.joint(side>0?'LeftUpLeg':'RightUpLeg'), width=q.width*.82;
                const points=[[-.5,0],[.5,0],[.44,-.84],[.24,-1],[-.44,-.94]].map(([u,v])=>[x+u*width,hip+.035*s+v*h,z-face*v*.015*s]);
                plate(metal,points,[0,0,face],.004*s,.002*s,C.color,joint);
            }
        }
        if(kind==='gauntlets')for(const side of ['Left','Right']) {
            const hand=C.bone(side+'Hand'), index=C.bone(side+'HandIndex1'), pinky=C.bone(side+'HandPinky1');
            const across=norm(sub(index.head,pinky.head)), along=norm(sub(lerp(index.head,pinky.head,.5),hand.head));
            let normal=norm(cross(across,along));if(dot(normal,Z)>0)normal=mul(normal,-1);
            const center=add(lerp(hand.head,lerp(index.head,pinky.head,.5),.5),mul(normal,.015*s));
            guard(C,center,normal,across,along,Math.hypot(...sub(index.head,pinky.head))*.9,.062*s,C.joint(side+'Hand'));
        }
        return {parts:[metal.part('Medieval '+kind,{roughness:.34,metalness:.72}),edge.part('Medieval '+kind+' edges',{roughness:.4,metalness:.68})].filter(p=>p.index.length),hidden:new Set()};
    }
    /** Small field equipment and formed recon plates, fitted over the actual clothing surface. */
    function fieldGear(pack, built, item, kind, layers = []) {
        const C = context(pack, built, item), s = C.scale, hip = C.bone('Hips').head[1], neck = C.bone('Neck').head[1];
        const span = Math.max(0.08 * s, neck - hip), chest = C.joint('Spine2'), waist = C.joint('Hips');
        const surfaces = [{ positions: built.parts[0].positions, index: built.parts[0].index }, ...layers];
        const surface=Outfit.projectedSurface(surfaces,{cell:.04*s,accept:(part,ids,p)=>Math.max(...p.map(q=>q[1]))>=hip-.1*s&&Math.min(...p.map(q=>q[1]))<=neck+.04*s});
        const surfaceAt=(x,y,fallback,side=1)=>surface.depth(x,y,fallback,side);
        const frontPlates = [];
        const faceAt = (x,y,lift=0.006*s) => {
            let z = surfaceAt(x,y,C.section(y).front);
            for (const p of frontPlates) if (x >= p.lo[0] && x <= p.hi[0] && y >= p.lo[1] && y <= p.hi[1]) z = Math.max(z,p.height(x,y));
            return [x,y,z+lift];
        };
        // A nonplanar outline cannot be filled with one polygon fan: its
        // triangles cut through a full bust or belly. Fit the entire plate,
        // including its interior and closed back, to the finished fabric.
        function fittedPlate(outline, color, joint, gap = .014 * s, depth = .012 * s, side = 1) {
            const center = mul(outline.reduce(add, [0,0,0]), 1 / outline.length), normal = [0,0,side];
            const lo = [0,1].map(k=>Math.min(...outline.map(p=>p[k]))), hi = [0,1].map(k=>Math.max(...outline.map(p=>p[k])));
            const rx = Math.max((hi[0]-lo[0])/2,.005*s), ry = Math.max((hi[1]-lo[1])/2,.005*s);
            const sample = (x,y) => side*surfaceAt(x,y,side>0?C.section(y).front:C.section(y).back,side);
            // Form the shell over a low-frequency grid. A single quadratic
            // dome extrapolated the belly's slope over the entire chest and
            // lifted whole plates tens of centimetres away from short torsos.
            // Grid spacing limits local folds without importing their creases.
            const cells=8, grid=Array.from({length:cells+1},(_,j)=>Array.from({length:cells+1},(_,i)=>sample(lo[0]+i/cells*rx*2,lo[1]+j/cells*ry*2)));
            for(let pass=0;pass<3;pass++) {
                const next=grid.map(row=>row.slice());
                for(let j=0;j<=cells;j++)for(let i=0;i<=cells;i++) {
                    let sum=0,n=0;
                    for(let v=Math.max(0,j-1);v<=Math.min(cells,j+1);v++)for(let u=Math.max(0,i-1);u<=Math.min(cells,i+1);u++){sum+=grid[v][u];n++;}
                    next[j][i]=Math.max(grid[j][i],sum/n);
                }
                grid.forEach((row,j)=>row.splice(0,row.length,...next[j]));
            }
            const heights=new Map();
            const outer = (x,y) => {
                const key=x+':'+y;if(heights.has(key))return heights.get(key);
                const u=Math.max(0,Math.min(cells-.000001,(x-lo[0])/(rx*2)*cells)),v=Math.max(0,Math.min(cells-.000001,(y-lo[1])/(ry*2)*cells));
                const i=Math.floor(u),j=Math.floor(v),a=u-i,b=v-j;
                const z=(grid[j][i]*(1-a)+grid[j][i+1]*a)*(1-b)+(grid[j+1][i]*(1-a)+grid[j+1][i+1]*a)*b;
                const value=side*(Math.max(z,sample(x,y))+gap);heights.set(key,value);return value;
            };
            const nodes=new Map(),faces=[],borders=[],steps=5;
            const node=p=>{const key=Math.round(p[0]*1e9)+':'+Math.round(p[1]*1e9);if(!nodes.has(key))nodes.set(key,[p[0],p[1],outer(p[0],p[1])]);return nodes.get(key);};
            for(let edge=0;edge<outline.length;edge++){
                const a=outline[edge],b=outline[(edge+1)%outline.length];
                const at=(i,j)=>add(center,add(mul(sub(a,center),i/steps),mul(sub(b,center),j/steps)));
                for(let i=0;i<steps;i++)for(let j=0;j<steps-i;j++){
                    faces.push([at(i,j),at(i+1,j),at(i,j+1)].map(node));
                    if(i+j<steps-1)faces.push([at(i+1,j),at(i+1,j+1),at(i,j+1)].map(node));
                }
                for(let i=0;i<steps;i++)borders.push([node(lerp(a,b,i/steps)),node(lerp(a,b,(i+1)/steps))]);
            }
            // Clear the actual fabric between plate vertices as well. Shared
            // nodes preserve a continuous shell while local corrections lift
            // only the triangles crossing a bust/waist fold.
            for(const face of faces){
                let lift=0;
                for(const weights of [[1/3,1/3,1/3],[.5,.5,0],[.5,0,.5],[0,.5,.5]]){
                    const p=[0,1,2].map(k=>face.reduce((sum,q,i)=>sum+q[k]*weights[i],0));
                    lift=Math.max(lift,sample(p[0],p[1])+depth+.002*s-side*p[2]);
                }
                if(lift>0)for(const p of face)p[2]+=side*lift;
            }
            const vertices=[...nodes.values()],ids=new Map(vertices.map((p,i)=>[p,i]));
            const fitted=Outfit.projectedSurface([{positions:Float64Array.from(vertices.flat()),index:Uint32Array.from(faces.flatMap(f=>f.map(p=>ids.get(p))))}],{cell:.04*s});
            const height=(x,y)=>fitted.depth(x,y,outer(x,y),side);
            const point=(p,inset=0)=>[p[0],p[1],p[2]-side*inset];
            for(const face of faces)for(const back of [false,true]){
                const base=C.shell.p.length;
                C.shell.face(face.map(p=>point(p,back?depth:0)),back?mul(color,.62):color,joint,mul(normal,back?-1:1));
                const h=.006*s;
                for(let i=base;i<C.shell.p.length;i+=3){
                    const x=C.shell.p[i],y=C.shell.p[i+1],dx=(height(x+h,y)-height(x-h,y))/(2*h),dy=(height(x,y+h)-height(x,y-h))/(2*h);
                    const n=mul(norm([-dx,-dy,1]),side*(back?-1:1));C.shell.n.splice(i,3,...n);
                }
            }
            for(const [p,q]of borders){const outward=norm(sub(lerp(p,q,.5),center));C.shell.face([point(p),point(q),point(q,depth),point(p,depth)],mul(color,.78),joint,outward);}
            if(side>0)frontPlates.push({lo,hi,height});
        }
        if (kind === 'recon' || kind === 'vest') {
            const top = neck - span * (kind==='recon'?.22:.09), low = hip + span * 0.40;
            // Separate beveled pectoral plates with real side walls and a breathing gap.
            for (const side of [-1,1]) {
                const outline = [[0.04,0.91],[0.60,1],[0.94,0.80],[0.84,0.12],[0.34,0],[0.05,0.12]].map(([u,v])=>{
                    const y = low + (top-low)*v, q=C.section(y), x=side*u*q.width*(kind==='recon'?.83:1);
                    return faceAt(x,y,0.025*s);
                });
                fittedPlate(outline,C.color,chest,kind==='recon'?.020*s:.014*s);
                for (const k of [1,3]) bolt(C.hardware,faceAt(outline[k][0],outline[k][1],.001*s),Z,.0025*s,C.trim,chest);
                const y = top-(top-low)*.25, q=C.section(y), x=side*q.width*.42;
                for(let row=0;row<3;row++) rectangle(C.hardware,faceAt(x,y-row*.009*s,.003*s),X,Y,q.width*.25,.003*s,Z,C.trim,chest,.001*s,.0004*s);
                rectangle(C.hardware,faceAt(x,y+.010*s,.004*s),X,Y,q.width*.25,.004*s,Z,C.accent,chest,.0015*s,.0005*s);
            }
            // A back shell and independent abdominal lames use their own spine joints.
            const middle=(top+low)/2, q=C.section(middle), z=q.back-.020*s;
            fittedPlate(OCTAGON.map(([x,y])=>[x*q.width*(kind==='recon'?.74:.85),middle+y*(top-low)*.46,z]),C.color,chest,.014*s,.012*s,-1);
            for(let row=0;kind!=='recon'&&row<3;row++) {
                const y=hip+span*(.07+row*.11), q=C.section(y), h=span*.10;
                const outline=OCTAGON.map(([x,v])=>faceAt(x*q.width*.76,y+v*h/2,.019*s));
                fittedPlate(outline,mul(C.color,.87),C.joint(row===2?'Spine1':'Spine'),.011*s,.009*s);
            }
            if (kind === 'recon') for(const side of ['Left','Right']) {
                // A shoulder cup wraps the upper arm. Sample the actual
                // sleeve near each station rather than placing a flat badge
                // at the largest radius found elsewhere on the limb.
                const family=side==='Left'?1:2,E=C.envelope(side+'Arm',family,.12,.48),joint=C.joint(side+'Arm');
                const body=built.parts[0],sections=new Map();
                const at=(t,angle,gap)=>{
                    if(!sections.has(t))sections.set(t,Outfit.crossSection([body,...layers],E.point(t),[E.side,E.along,E.front],
                        (part,v)=>part===body?C.an.member[pack.body.source[v]*5+family]>.45:part.field?.[v]?.fam===family,s));
                    return sections.get(t)(angle,gap);
                };
                // Mirrored arm frames reverse the outer radial direction.
                // Cross the outer shoulder, leaving the armpit half open.
                const angles=Array.from({length:13},(_,k)=>(side==='Left'?1:-1)*(-Math.PI+.15+k/12*(Math.PI-.30)));
                const rings=Array.from({length:5},(_,r)=>angles.map(a=>at(.12+r/4*.30,a,.010*s)));
                C.shell.loft(rings,C.color,joint,p=>E.point(dot(sub(p,E.B.head),E.along)/E.length),undefined,true);
                for(const r of [0,4])for(let k=0;k+1<angles.length;k++){
                    const t=.12+r/4*.30,a=angles[k],b=angles[k+1];
                    C.hardware.face([at(t,a,.010*s),at(t,b,.010*s),at(t,b,.002*s),at(t,a,.002*s)],C.trim,joint,mul(E.along,r===0?-1:1));
                }
            }
        }
        if (kind === 'uniform') {
            const y = hip + span*.77, q=C.section(y), x=q.width*.44;
            const base=faceAt(x,y,.005*s);
            rectangle(C.hardware,base,X,Y,.036*s,.017*s,Z,C.trim,chest,.003*s,.001*s);
            rectangle(C.indicators,add(base,[0,.001*s,.001*s]),X,Y,.025*s,.006*s,Z,C.accent,chest,.0015*s,.0004*s);
            for(let i=0;i<3;i++) rectangle(C.hardware,faceAt(-q.width*.40+i*.007*s,y+.015*s,.004*s),X,Y,.004*s,.012*s,Z,C.accent,chest,.0015*s,.0004*s);
        } else {
            // A compact chest controller, and two closed utility pouches at the hips.
            const y=hip+span*(kind==='recon'?.65:.78), q=C.section(y), x=-q.width*.38, at=faceAt(x,y,(kind==='recon'||kind==='vest')?.004*s:.009*s);
            rectangle(C.hardware,at,X,Y,.043*s,.058*s,Z,C.trim,chest,.006*s,.002*s);
            const glow=Outfit.linear(item.lightColor||'#71cfff');
            rectangle(C.indicators,add(at,[0,.012*s,.001*s]),X,Y,.029*s,.017*s,Z,glow,chest,.002*s,.0006*s);
            for(let row=0;row<2;row++)for(let col=0;col<3;col++)rectangle(C.hardware,add(at,[(col-1)*.009*s,-.010*s-row*.009*s,.002*s]),X,Y,.005*s,.004*s,Z,C.accent,chest,.002*s,.0004*s);
            for(const side of [-1,1]) {
                const y=hip+span*.12, q=C.section(y), x=side*q.width*.66, width=Math.min(.075*s,q.width*.45), height=Math.min(.095*s,span*.19);
                const at=faceAt(x,y,.014*s);
                rectangle(C.shell,at,X,Y,width,height,Z,mul(C.color,.87),waist,.014*s,.003*s);
                rectangle(C.hardware,add(at,[0,height*.31,.001*s]),X,Y,width*.9,height*.18,Z,C.trim,waist,.003*s,.001*s);
                bolt(C.hardware,add(at,[0,height*.31,.004*s]),Z,.002*s,C.accent,waist);
                if(kind==='recon'){
                    // Folded pocket flaps, retaining tapes and pull tabs sit
                    // on the pouch face, with the load carried by the belt.
                    const face=add(at,[0,0,.003*s]);
                    rectangle(C.hardware,add(face,[0,height*.22,.002*s]),X,Y,width*.88,height*.28,Z,mul(C.trim,1.25),waist,.005*s,.001*s);
                    for(const sign of [-1,1])rectangle(C.hardware,add(face,[sign*width*.27,-height*.08,.003*s]),X,Y,width*.10,height*.68,Z,C.trim,waist,.002*s,.0005*s);
                    rectangle(C.hardware,add(face,[0,-height*.23,.007*s]),X,Y,width*.20,height*.18,Z,mul(C.accent,.6),waist,.003*s,.0008*s);
                }
            }
        }
        const parts=[];
        if(C.shell.i.length)parts.push(C.shell.part(kind==='recon'?'Recon formed plating':'Field utility pouches',{roughness:.55,metalness:.15}));
        if(C.hardware.i.length)parts.push(C.hardware.part('Field fasteners and controls',{roughness:.5,metalness:.65}));
        if(C.indicators.i.length)parts.push(C.indicators.part('Field status indicators',{roughness:.35,metalness:.1,emissive:item.lightColor||'#71cfff',emissiveIntensity:item.lightStyle==='none'?0:item.lightIntensity??.25}));
        const construction=kind==='recon'?(root.RRCharacterReconConstruction||require('./CharacterReconConstruction.js')).build(C,layers,surfaceAt):null;
        if(construction)parts.push(...construction.parts);
        return {parts,hidden:new Set(),textures:construction?.textures||[]};
    }

    const api={build,helmet,medieval,fieldGear};
    root.RRCharacterPowerArmor=api;
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
