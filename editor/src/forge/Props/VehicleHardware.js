/** Hard-surface vehicle assemblies: faceted hull lofts, bolted armor plates
 * over a dark under-frame, a sealed blown canopy for flight craft, mech joint
 * hardware, ducted fans and the greeble/fitting kit behind "Detail density".
 * Everything is built from chamfered plates (RRHardSurface) and turned or
 * swept solids (RRContainerMesh); no reference geometry or texture is used.
 * Dimensions in meters, +z forward, +y up. Builders take the vehicle build
 * context `c` ({r, W, H, L, put, tube, box, ...}). */
(function(root){
    'use strict';
    const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null);
    const CM=need('RRContainerMesh','./ContainerMesh.js'),HS=need('RRHardSurface','./HardSurface.js');
    const {add,sub,scale,norm,cross,dot}=CM.vec,pi=Math.PI,mix=(a,b,t)=>a+(b-a)*t,clamp01=v=>v<0?0:v>1?1:v;
    const fract=v=>v-Math.floor(v),hash=(a,b=0)=>fract(Math.sin(a*127.1+b*311.7)*43758.5453);

    // ── faceted lofts ─────────────────────────────────────────────────────
    /** Wedge hull section, +x half from the keel to the spine, in units of
     * (half width, half height). Paired points are chamfer strips. */
    const HULL_SECTION=[[0,-1],[.46,-1],[.56,-.93],[.93,-.34],[1,-.20],[.985,.24],[.93,.36],[.62,.86],[.50,.97],[0,.97]];
    /** Boxy section for armor castings and limb housings. */
    const BOX_SECTION=[[0,-1],[.78,-1],[1,-.80],[1,.80],[.78,1],[0,1]];
    /** Low ridge section for spines, keels and fairings. */
    const RIDGE_SECTION=[[0,-1],[.92,-1],[1,-.55],[.70,.62],[.38,1],[0,1]];
    function ringOf(section,w,y,h,z){
        const half=section.map(([x,v])=>[x*w,y+v*h,z]),other=section.slice(1,-1).reverse().map(([x,v])=>[-x*w,y+v*h,z]);
        return half.concat(other);
    }
    /** stations: [{z, w, y, h}] in increasing z. Flat quads, welded where
     * neighbouring faces turn less than ~10 degrees; chamfers stay crisp. */
    function facetedLoft(stations,section,o={}){
        const g=new CM.Geo(),rings=stations.map(s=>ringOf(section,s.w,s.y,s.h,s.z)),m=rings[0].length;
        for(let i=0;i+1<rings.length;i++){const cyA=stations[i].y,cyB=stations[i+1].y;for(let j=0;j<m;j++){const k=(j+1)%m,q=[rings[i][j],rings[i][k],rings[i+1][k],rings[i+1][j]],mid=scale(add(add(q[0],q[1]),add(q[2],q[3])),.25);g.poly(q,null,sub(mid,[0,(cyA+cyB)/2,mid[2]]));}}
        if(o.caps!==false){g.poly(rings[0],null,[0,0,-1]);g.poly(rings.at(-1),null,[0,0,1]);}
        return CM.smoothNormals(g.done(),o.weld??.985);
    }
    /** Surface point of a faceted loft at station z, polar angle a (0 = +x,
     * pi/2 = top), pushed out by `offset`: the same contract as the rounded
     * hull's skin(), so patches, lights and fittings sit on either. */
    function loftSkin(stations,section){
        const ring=ringOf(section,1,0,1,0).map(p=>[p[0],p[1]]);
        const at=z=>{let i=0;while(i+1<stations.length-1&&z>stations[i+1].z)i++;const a=stations[i],b=stations[i+1],t=clamp01((z-a.z)/(b.z-a.z||1));return{w:mix(a.w,b.w,t),y:mix(a.y,b.y,t),h:mix(a.h,b.h,t)};};
        const unit=(a)=>{const d=[Math.cos(a),Math.sin(a)];let best=null;for(let j=0;j<ring.length;j++){const p=ring[j],q=ring[(j+1)%ring.length],e=[q[0]-p[0],q[1]-p[1]],den=d[0]*e[1]-d[1]*e[0];if(Math.abs(den)<1e-12)continue;const t=(p[0]*e[1]-p[1]*e[0])/den,u=(p[0]*d[1]-p[1]*d[0])/den;if(t>0&&u>=-1e-9&&u<=1+1e-9&&(!best||t<best))best=t;}return[d[0]*(best||1),d[1]*(best||1)];};
        return(z,a,offset=0)=>{const s=at(z),p=unit(a);return[p[0]*(s.w+offset),s.y+p[1]*(s.h+offset),z];};
    }
    /** Height of a skin's upper surface at (z, x), by bisection on the angle. */
    function topOf(skin,z,x){
        let lo=0,hi=pi/2;const ax=Math.abs(x);if(skin(z,0)[0]<=ax)return skin(z,0)[1];
        for(let k=0;k<28;k++){const m=(lo+hi)/2;if(skin(z,m)[0]>ax)lo=m;else hi=m;}return skin(z,(lo+hi)/2)[1];
    }

    // ── plates, backing and fasteners ─────────────────────────────────────
    /** Hex bolt head with a washer, standing on frame F (n outward). */
    function bolt(c,F,radius,kind='metal',name='Plate bolts'){
        const R=radius,h=R*.75;
        c.put(kind,CM.revolveOn(F,0,0,[[0,0],[R*1.35,0],[R*1.35,R*.18],[R,R*.2],[R,h*.75],[R*.78,h],[0,h]],6,.3),name);
    }
    /** A bolted, chamfered armor plate on four surface corners (in order
     * around), floated just clear of the surface sampled by `probe(u, v)`
     * (u, v in 0..1 across the quad), with a dark under-frame backing plate
     * that fills the gap and shows as a shadow line around the edge.
     * o: {kind, name, thickness, chamfer, cut, gap, bolts, frameName, probe, out} */
    function armorPlate(c,corners,o={}){
        const [a,b,d,e]=corners,u0=norm(sub(b,a));let v0=sub(e,a);v0=norm(sub(v0,scale(u0,dot(v0,u0))));
        let n=norm(cross(u0,v0)),u=u0,v=v0;
        const center=scale(add(add(a,b),add(d,e)),.25);
        if(o.out&&dot(n,o.out)<0){u=scale(u0,-1);n=norm(cross(u,v));}
        const t=o.thickness??.016,ch=o.chamfer??Math.min(.006,t*.4),gap=o.gap??.012;
        let lift=0;
        if(o.probe)for(let i=0;i<=6;i++)for(let j=0;j<=6;j++){const p=o.probe(i/6,j/6);if(p)lift=Math.max(lift,dot(sub(p,center),n));}
        for(const p of corners)lift=Math.max(lift,dot(sub(p,center),n));
        const base=add(center,scale(n,lift+(o.standoff??.003))),F=CM.frame(base,u,v);
        const loc=p=>{const q=sub(p,base);return[dot(q,u),dot(q,v)];};
        let outline=corners.map(loc);
        const inset=o.inset??0;if(inset)outline=HS.offset(outline,inset);
        if(!outline.length)return null;
        const span=Math.min(Math.hypot(outline[1][0]-outline[0][0],outline[1][1]-outline[0][1]),Math.hypot(outline[3][0]-outline[0][0],outline[3][1]-outline[0][1]));
        const cutSize=o.cut??Math.min(.06,span*.16);
        const shape=cutSize>0?HS.cut(outline,cutSize):outline;
        c.put(o.kind||'armor',HS.plate(shape,t,ch,{frame:{...F,o:add(base,scale(n,t/2))}}),o.name||'Bolted armor plates');
        if(o.backing!==false){
            const back=HS.offset(shape,-gap),depth=lift+(o.standoff??.003)+.02;
            if(back.length)c.put('frame',HS.plate(back,depth,0,{frame:{...F,o:add(base,scale(n,-depth/2+.0005))},back:'flat'}),o.frameName||'Armor under-frame');
        }
        if(o.bolts!==false&&c.r.details){
            const inner=HS.offset(shape,Math.max(.022,cutSize*.55));const R=o.boltRadius??Math.max(.0065,Math.min(.012,t*.55));
            const spots=[];for(let k=0;k<inner.length;k++){const p=inner[k],q=inner[(k+1)%inner.length],len=Math.hypot(q[0]-p[0],q[1]-p[1]);const count=Math.max(1,Math.round(len/(o.boltPitch??.24)));for(let j=0;j<count;j++)spots.push([mix(p[0],q[0],j/count),mix(p[1],q[1],j/count)]);}
            const uniq=spots.filter((p,i)=>spots.findIndex(q=>Math.hypot(q[0]-p[0],q[1]-p[1])<R*3)===i);
            for(const [x,y]of uniq)bolt(c,CM.frame(add(base,add(add(scale(u,x),scale(v,y)),scale(n,t))),u,v),R,'metal',o.boltName||'Plate bolts');
        }
        return{F,base,n,u,v,outline:shape,thickness:t};
    }

    // ── sealed flight canopy ──────────────────────────────────────────────
    /** A pressurised one-piece blown canopy faired into the hull top, a seal
     * ring at its sill, framed bows, and a rear spine fairing that closes the
     * back (its front face is the cabin's aft bulkhead).
     * o: {skin, zRear, zFront, zPeak, peakY, width, spineLength, bows, deck} */
    function canopy(c,o){
        const {put,tube}=c,{skin,zRear,zFront,zPeak,peakY,width}=o,rows=26,sides=36,e=2.35,sink=.012;
        const sill=(z,x)=>topOf(skin,z,x)-sink;
        // Plan view: a rounded nose and nearly full width over the seats.
        const halfW=z=>{const t=(z-zRear)/(zFront-zRear);return width*(t<.62?mix(.90,1,Math.sin(Math.min(1,t/.62)*pi/2)):mix(1,.2,((t-.62)/.38)**2.2));};
        const crown=z=>{const base=sill(z,0);if(z>=zPeak){const t=(z-zPeak)/(zFront-zPeak);return mix(peakY,base+.01,t**1.35);}const t=(zPeak-z)/(zPeak-zRear);return mix(peakY,mix(base,peakY,.80),t*t);};
        const point=(z,a,offset=0)=>{const w=halfW(z)+offset,co=Math.cos(a),si=Math.sin(a),x=Math.sign(co)*Math.abs(co)**(2/e)*w,ys=sill(z,Math.max(Math.abs(x),w*.999)*Math.sign(x||1)),top=crown(z)+offset;return[x,ys+(top-ys)*Math.abs(si)**(2/e),z];};
        const Z=Array.from({length:rows+1},(_,i)=>zRear+(zFront-zRear)*(1-(1-i/rows)**1.15));
        const glass=new CM.Geo(),thick=.006;
        const ring=(z,off)=>Array.from({length:sides+1},(_,j)=>point(z,j/sides*pi,off));
        const outer=Z.map(z=>ring(z,0)),inner=Z.map(z=>ring(z,-thick));
        for(let i=0;i<rows;i++)for(let j=0;j<sides;j++){
            const q=[outer[i][j],outer[i][j+1],outer[i+1][j+1],outer[i+1][j]],mid=scale(add(q[0],q[2]),.5),axis=[0,sill(mid[2],0)-.2,mid[2]];
            glass.poly(q,null,sub(mid,axis));const p=[inner[i][j],inner[i][j+1],inner[i+1][j+1],inner[i+1][j]];glass.poly(p,null,sub(axis,mid));
        }
        // Closed thin shell: edge strips join the outer and inner skins at the
        // nose, the aft seal and along both sills.
        for(let j=0;j<sides;j++){glass.poly([outer[rows][j],outer[rows][j+1],inner[rows][j+1],inner[rows][j]],null,[0,0,1]);glass.poly([outer[0][j],outer[0][j+1],inner[0][j+1],inner[0][j]],null,[0,0,-1]);}
        for(let i=0;i<rows;i++)for(const [j,sx]of [[0,1],[sides,-1]])glass.poly([outer[i][j],outer[i+1][j],inner[i+1][j],inner[i][j]],null,[sx,-1,0]);
        put('glass',CM.smoothNormals(glass.done(),.8),'Flight canopy');
        // Seal ring along the sill and around the nose.
        const sillPath=[];for(let i=0;i<=rows;i++)sillPath.push(point(Z[i],0,.004));for(let i=rows;i>=0;i--)sillPath.push(point(Z[i],pi,.004));
        tube('trim',sillPath,o.seal??c.H*.011,'Canopy seal');
        tube('trim',Array.from({length:sides+1},(_,j)=>point(zRear+.004,j/sides*pi,.006)),(o.seal??c.H*.011)*1.15,'Canopy seal');
        for(const zb of o.bows||[])tube('trim',Array.from({length:sides+1},(_,j)=>point(zb,j/sides*pi,.005)),c.H*.0085,'Canopy bow mullion');
        // Rear spine fairing: same section, overlapping the glass, tapering aft
        // into the hull deck; its front cap is the aft pressure bulkhead.
        const len=o.spineLength,S=[];for(let i=0;i<=12;i++){const t=i/12,z=zRear+.02-len*t,w=halfW(zRear)*mix(1.02,.30,t**.8),top=mix(crown(zRear)+.008,sill(z,0)+.02,t**1.5);S.push([z,w,top]);}
        const spine=new CM.Geo(),sp=[];
        for(const [z,w,top]of S){const pts=[];for(let j=0;j<=sides;j++){const a=j/sides*pi,co=Math.cos(a),si=Math.sin(a),x=Math.sign(co)*Math.abs(co)**(2/2.6)*w,ys=topOf(skin,z,Math.max(Math.abs(x),.001))-sink*1.6;pts.push([x,ys+(top-ys)*Math.abs(si)**(2/2.6),z]);}sp.push(pts);}
        sp.reverse();
        for(let i=0;i+1<sp.length;i++)for(let j=0;j<sides;j++){const q=[sp[i][j],sp[i][j+1],sp[i+1][j+1],sp[i+1][j]],mid=scale(add(q[0],q[2]),.5);spine.poly(q,null,sub(mid,[0,mid[1]-.3,mid[2]]));}
        spine.poly(sp.at(-1),null,[0,0,1]);
        put(o.spineKind||'secondary',CM.smoothNormals(spine.done(),.9),'Canopy spine fairing');
        return{point,halfW,crown,sill};
    }

    // ── fittings kit (behind one "Detail density" control) ────────────────
    /** Anchor: {kind(s), F (o on the surface, n outward, u along), size:[w,h], face, priority}.
     * density 0..1 picks a share of anchors, at most `cap` per face, never two
     * whose footprints overlap. Returns the placed anchors. */
    function fittings(c,anchors,density,cap=3){
        if(!c.r.details||density<=0||!anchors.length)return[];
        const order=anchors.map((a,i)=>[(a.priority??.5)+hash(i+1,c.r.surfaceSeed%97)*.12,a]).sort((x,y)=>y[0]-x[0]).map(([,a])=>a);
        const want=Math.round(order.length*Math.min(1,density*1.05)),placed=[],perFace=new Map();
        for(const a of order){
            if(placed.length>=want)break;const face=a.face||'any';if((perFace.get(face)||0)>=cap)continue;
            const r=Math.max(a.size[0],a.size[1])*.5;if(placed.some(p=>Math.hypot(...sub(p.F.o,a.F.o))<r+Math.max(p.size[0],p.size[1])*.5))continue;
            if(KIT[a.kind]){KIT[a.kind](c,a.F,a.size,a);placed.push(a);perFace.set(face,(perFace.get(face)||0)+1);}
        }
        return placed;
    }
    const at=(F,x,y,z=0)=>add(F.o,add(add(scale(F.u,x),scale(F.v,y)),scale(F.n,z)));
    const KIT={
        /** Grab handle: a bent bar on two standoff feet. */
        handle(c,F,[w]){const s=w*.5,h=Math.min(.05,w*.22),r=Math.max(.006,w*.03);c.tube('metal',[at(F,-s,0,0),at(F,-s,0,h*.8),at(F,-s*.85,0,h),at(F,s*.85,0,h),at(F,s,0,h*.8),at(F,s,0,0)],r,'Grab handles');for(const x of [-s,s])c.put('trim',HS.plate(HS.circle(0,0,r*2.2,8),.006,.0015,{frame:CM.frame(at(F,x,0,.003),F.u,F.v)}),'Handle feet');},
        /** Whip antenna on an armored base. */
        antenna(c,F,[w,h]){c.put('trim',HS.plate(HS.cut(HS.rect(-w*.3,-w*.3,w*.3,w*.3),w*.12),w*.18,w*.05,{frame:CM.frame(at(F,0,0,w*.09),F.u,F.v)}),'Antenna bases');c.put('trim',CM.revolveOn(CM.frame(at(F,0,0,w*.18),F.u,F.v),0,0,[[0,0],[w*.12,0],[w*.08,w*.25],[0,w*.25]],8),'Antenna bases');c.tube('metal',[at(F,0,0,w*.3),at(F,0,0,h)],Math.max(.0025,w*.025),'Antenna whips');},
        /** Sensor pod: chamfered housing with a lens. */
        sensor(c,F,[w,h]){const d=Math.min(w,h)*.55;c.put('trim',HS.plate(HS.cut(HS.rect(-w/2,-h/2,w/2,h/2),Math.min(w,h)*.22),d,d*.2,{frame:CM.frame(at(F,0,0,d/2),F.u,F.v)}),'Sensor pods');const L=CM.frame(at(F,0,0,d),F.u,F.v),R=Math.min(w,h)*.26;c.put('metal',CM.revolveOn(L,0,0,[[R*1.25,0],[R*1.25,R*.25],[R,R*.3],[R,0]],20),'Sensor bezels');c.put(c.r.lights?'glow':'glass',CM.revolveOn(L,0,0,[[0,R*.12],[R,R*.12],[R,R*.16],[0,R*.24]],20),'Sensor lenses');},
        /** Louvered vent housing standing on the panel. */
        vent(c,F,[w,h]){const d=Math.min(.05,h*.25);c.put('trim',HS.plate(HS.cut(HS.rect(-w/2,-h/2,w/2,h/2),Math.min(w,h)*.12),d,d*.3,{frame:CM.frame(at(F,0,0,d/2),F.u,F.v)}),'Vent housings');c.put('dark',HS.plate(HS.rect(-w*.40,-h*.40,w*.40,h*.40),.002,0,{frame:CM.frame(at(F,0,0,d+.001),F.u,F.v)}),'Vent housings');const n=Math.max(3,Math.round(h/.03));for(let k=0;k<n;k++){const y=-h*.36+h*.72*(k+.5)/n;const G=CM.frame(at(F,0,y,d+.006),F.u,norm(add(F.v,scale(F.n,.8))));c.put('frame',HS.plate(HS.rect(-w*.38,-h*.36/n,w*.38,h*.36/n),.004,.001,{frame:G}),'Vent louvers');}},
        /** Raised hatch: plate, hinge knuckles and a pull. */
        hatch(c,F,[w,h]){c.put('secondary',HS.plate(HS.cut(HS.rect(-w/2,-h/2,w/2,h/2),Math.min(w,h)*.14),.012,.004,{frame:CM.frame(at(F,0,0,.006),F.u,F.v)}),'Service hatches');for(const x of [-w*.3,w*.3])c.tube('metal',[at(F,x-w*.07,h/2-.012,.012),at(F,x+w*.07,h/2-.012,.012)],.011,'Hatch hinges');KIT.handle(c,CM.frame(at(F,0,-h*.25,.012),F.u,F.v),[Math.min(.16,w*.4)]);},
        /** Roof or deck rack: two rails on feet with cross bars. */
        rack(c,F,[w,h]){const y=Math.min(.07,w*.08);for(const x of [-w*.42,w*.42]){for(const v of [-h*.42,h*.42])c.tube('trim',[at(F,x,v,0),at(F,x,v,y)],.011,'Rack feet');c.tube('metal',[at(F,x,-h*.45,y),at(F,x,h*.45,y)],.012,'Rack rails');}for(let k=0;k<4;k++){const v=-h*.36+h*.72*k/3;c.tube('metal',[at(F,-w*.42,v,y),at(F,w*.42,v,y)],.008,'Rack rails');}},
        /** Cable run: a conduit in clamps along u. */
        cable(c,F,[w]){const pts=[];for(let k=0;k<=8;k++){const t=k/8;pts.push(at(F,-w/2+w*t,Math.sin(t*pi*2)*.008,.014));}c.tube('dark',pts,.0085,'Cable runs');for(const t of [.15,.5,.85])c.put('metal',HS.plate(HS.rect(-.012,-.016,.012,.016),.022,.003,{frame:CM.frame(at(F,-w/2+w*t,0,.011),F.u,F.v)}),'Cable clamps');},
        /** Hydraulic pair between two points (a.from, a.to). */
        hydraulic(c,F,size,a){pistonPair(c,a.from,a.to,a.radius??.016,a.side??[1,0,0]);},
        /** Bolt circle around a boss. */
        boltCircle(c,F,[w]){const R=w*.42;c.put('trim',CM.revolveOn(F,0,0,[[R*1.25,0],[R*1.25,.008],[R*1.1,.012],[0,.012]],24),'Bolted bosses');for(let k=0;k<8;k++){const a=k/8*2*pi;bolt(c,CM.frame(at(F,Math.cos(a)*R,Math.sin(a)*R,.012),F.u,F.v),Math.max(.006,w*.05));}},
        /** Work lamp in a guard cage. */
        lightCage(c,F,[w],a){const R=w*.36,G=CM.frame(at(F,0,0,.02),F.u,F.v);if(a&&a.post)c.tube('trim',[at(F,0,0,R*.6),add(at(F,0,0,R*.6),[0,-a.post-R,0])],Math.max(.008,R*.18),'Lamp brackets');c.put('trim',CM.revolveOn(G,0,0,[[0,0],[R*1.15,0],[R*1.15,R*.7],[R*1.05,R*.9],[R*.95,R*.9],[R*.9,R*.25],[0,R*.25]],24),'Work lamp housings');c.put(c.r.lights?'light':'dark',CM.revolveOn(G,0,0,[[0,R*.6],[R*.9,R*.6],[R*.9,R*.66],[0,R*.70]],24),'Work lamp lenses');for(const t of [-.5,0,.5])c.tube('metal',[at(G,-R*1.1,t*R,R*.05),at(G,-R*1.2,t*R,R*1.05),at(G,R*1.2,t*R,R*1.05),at(G,R*1.1,t*R,R*.05)],Math.max(.003,R*.05),'Lamp guards');},
        /** Jerrycan in a bracket. */
        jerrycan(c,F,[w,h]){const d=Math.min(.17,w*.55),G=CM.frame(at(F,0,0,d/2+.01),F.u,F.v);c.put('accent',HS.plate(HS.cut(HS.rect(-w/2,-h/2,w/2,h*.38),w*.08),d,.012,{frame:G}),'Jerrycans');for(const side of [-1,1])c.put('accent',HS.plate(HS.cut(HS.rect(-w*.30,-h*.34,w*.30,h*.20),w*.05),.008,.003,{frame:CM.frame(at(G,0,0,side*d/2),F.u,side>0?F.v:scale(F.v,-1))}),'Jerrycans');for(const x of [-w*.22,0,w*.22])c.tube('accent',[at(G,x,h*.38,-d*.25),at(G,x,h*.47,-d*.25),at(G,x,h*.47,d*.25),at(G,x,h*.38,d*.25)],.007,'Jerrycans');c.put('metal',CM.revolveOn(CM.frame(at(G,w*.32,h*.42,0),F.u,F.n),0,0,[[0,0],[.016,0],[.016,.03],[0,.03]],10),'Jerrycan caps');for(const y of [-h*.25,h*.15])c.put('frame',HS.plate(HS.rect(-w*.56,-.012,w*.56,.012),d*1.05,.003,{frame:CM.frame(at(F,0,y,d/2+.01),F.u,F.v)}),'Jerrycan straps');},
        /** Spare wheel on a carrier: tire, steel rim and hub nut. */
        spareWheel(c,F,[w]){const R=w*.5,t=R*.42,G=CM.frame(at(F,0,0,t*.5+.03),F.u,F.v);c.put('rubber',CM.revolveOn(G,0,0,[[R*.62,-t*.5],[R*.94,-t*.5],[R,-t*.3],[R,t*.3],[R*.94,t*.5],[R*.62,t*.5],[R*.62,-t*.5]],40,.6),'Spare wheel');for(let k=0;k<22;k++){const a=k/22*2*pi;c.put('rubber',HS.plate(HS.rect(-R*.07,-t*.42,R*.07,t*.42),R*.05,R*.015,{frame:CM.frame(add(G.o,add(scale(G.u,Math.cos(a)*R),scale(G.v,Math.sin(a)*R))),G.n,scale(add(scale(G.u,-Math.sin(a)),scale(G.v,Math.cos(a))),1))}),'Spare wheel');}c.put('metal',CM.revolveOn(G,0,0,[[0,-t*.2],[R*.63,-t*.2],[R*.63,t*.42],[R*.55,t*.38],[R*.3,t*.30],[R*.18,t*.44],[0,t*.44]],32,.6),'Spare wheel rim');c.put('frame',HS.plate(HS.rect(-R*.25,-R*.75,R*.25,R*.1),.03,.006,{frame:CM.frame(at(F,0,0,.015),F.u,F.v)}),'Spare wheel carrier');}
    };
    /** Two hydraulic cylinders side by side between a and b (barrel at a, rod to b). */
    function pistonPair(c,a,b,radius,side=[1,0,0],name='Hydraulic pistons'){
        const d=sub(b,a),axis=norm(d),off=norm(sub(side,scale(axis,dot(side,axis))));
        for(const s of [-1,1]){const o=scale(off,s*radius*1.6),p=add(a,o),q=add(b,o),mid=add(p,scale(d,.58));
            c.tube('trim',[p,mid],radius,name);c.tube('metal',[mid,q],radius*.55,name+' rods');
            c.put('metal',CM.revolveOn(CM.frame(mid,off,cross(axis,off)),0,0,[[0,-radius*.3],[radius*1.18,-radius*.3],[radius*1.18,radius*.05],[radius*.62,radius*.25],[0,radius*.25]],12),name+' glands');
            for(const e of [p,q])c.put('metal',CM.revolveOn(CM.frame(e,axis,cross(off,axis)),0,0,[[0,-radius*.9],[radius*.9,-radius*.9],[radius*.9,radius*.9],[0,radius*.9]],12),name+' eyes');}
    }
    /** A bolt-capped joint drum on axis n at p: housing, bearing ring, cap and a bolt circle. */
    function joint(c,p,n,R,len,o={}){
        const ref=Math.abs(n[1])<.9?[0,1,0]:[1,0,0],u=norm(cross(ref,n)),F=CM.frame(p,u,cross(n,u));
        c.put(o.drumKind||'frame',CM.revolveOn(F,0,0,[[0,-len],[R,-len],[R,len*.15],[R*.96,len*.22],[0,len*.22]],24,.6),o.name||'Joint drums');
        const G=CM.frame(add(p,scale(F.n,len*.22)),F.u,F.v);
        c.put('metal',CM.revolveOn(G,0,0,[[R*.78,0],[R*.92,0],[R*.92,R*.12],[R*.78,R*.14]],24,.6),'Joint bearing rings');
        c.put(o.capKind||'secondary',CM.revolveOn(G,0,0,[[0,0],[R*.74,0],[R*.74,R*.16],[R*.62,R*.22],[0,R*.22]],24,.6),'Joint end caps');
        if(c.r.details)for(let k=0;k<6;k++){const a=k/6*2*pi;bolt(c,CM.frame(at(G,Math.cos(a)*R*.5,Math.sin(a)*R*.5,R*.2),G.u,G.v),Math.max(.006,R*.075),'metal','Joint cap bolts');}
        return F;
    }
    /** A bank of angled louvers on frame F (w along u, h along v). */
    function ventBank(c,F,w,h,count,name='Vent banks'){
        c.put('frame',HS.plate(HS.cut(HS.rect(-w/2,-h/2,w/2,h/2),Math.min(w,h)*.1),.02,.004,{frame:CM.frame(at(F,0,0,.004),F.u,F.v),back:'flat'}),name);
        for(let k=0;k<count;k++){const y=-h*.42+h*.84*(k+.5)/count,G=CM.frame(at(F,0,y,.016),F.u,norm(add(F.v,scale(F.n,-.9))));c.put('trim',HS.plate(HS.rect(-w*.44,-h*.42/count,w*.44,h*.42/count),.005,.0015,{frame:G}),name+' louvers');}
    }
    const api={HULL_SECTION,BOX_SECTION,RIDGE_SECTION,facetedLoft,loftSkin,topOf,armorPlate,bolt,canopy,fittings,KIT,pistonPair,joint,ventBank,at};
    root.RRVehicleHardware=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
