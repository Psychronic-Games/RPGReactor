/** Two-legged birds and finger-supported bat wings; no quadruped scaffold. */
(function(root) {
    'use strict';
    const P = root.RRCharacterProps || (typeof require === 'function' ? require('./CharacterProps.js') : null);
    const { add, sub, mul, norm, lerp, cross } = P.vec, rigid = P.rigid;
    const TYPES = {
        birdType: { kind: 'avian', form: 'avian', label: 'Bird type', choices: [['eagle', 'Eagle'], ['owl', 'Owl'], ['crow', 'Crow'], ['sparrow', 'Sparrow'], ['pigeon', 'Pigeon'], ['duck', 'Duck'], ['chicken', 'Chicken'], ['parrot', 'Parrot'], ['flamingo', 'Flamingo'], ['hummingbird', 'Hummingbird'], ['penguin', 'Penguin']] },
        batType: { kind: 'bat', form: 'bat', label: 'Bat type', choices: [['littleBrownBat', 'Little brown bat'], ['flyingFox', 'Flying fox'], ['vampireBat', 'Vampire bat']] }
    };
    const PALETTES = {
        eagle: ['#47372c', '#f0ede4', '#251e19'], owl: ['#8a7051', '#d5c4a1', '#4c3a29'], crow: ['#192329', '#35414b', '#11181c'],
        sparrow: ['#80674c', '#d1bca0', '#47382a'], pigeon: ['#73828c', '#c0c7c9', '#354844'], duck: ['#4a6a50', '#b8b1a0', '#654c35'],
        chicken: ['#ae693a', '#dcba79', '#3c3026'], parrot: ['#39894c', '#d8c841', '#2768a0'], flamingo: ['#e99591', '#f7c9bf', '#2b2b30'],
        hummingbird: ['#2e815d', '#d2c4aa', '#7a3142'], penguin: ['#26313a', '#e7e5d9', '#c79a3f'],
        littleBrownBat: ['#69513d', '#987c60', '#3b302e'], flyingFox: ['#48372d', '#ad7a46', '#241e20'], vampireBat: ['#675b51', '#a18b79', '#362b2c']
    };
    const PROFILES = {
        eagle: { head: .10, neck: .09, bill: .10, hook: true, span: .99, tail: .29, raptor: true },
        owl: { head: .16, neck: .02, bill: .045, hook: true, span: .76, tail: .17, frontEyes: true },
        crow: { head: .105, neck: .07, bill: .15, span: .68, tail: .29 },
        sparrow: { head: .095, neck: .015, bill: .065, span: .48, tail: .23, round: true },
        pigeon: { head: .095, neck: .11, bill: .065, span: .60, tail: .22, round: true },
        duck: { head: .11, neck: .15, bill: .14, span: .64, tail: .13, webbed: true },
        chicken: { head: .09, neck: .14, bill: .06, span: .48, tail: .29, comb: true, legs: .22 },
        parrot: { head: .13, neck: .045, bill: .09, hook: true, span: .59, tail: .40, frontEyes: false },
        flamingo: { head: .085, neck: .56, bill: .13, span: .80, tail: .12, legs: .66, webbed: true },
        hummingbird: { head: .09, neck: .015, bill: .30, span: .46, tail: .20, thinBill: true },
        penguin: { head: .12, neck: .12, bill: .10, span: .27, tail: .10, legs: .09, webbed: true, upright: true }
    };
    function mesh(C, name, draw, material = {}) {
        const m = new P.ExactMesh(), normals=m.computeNormals.bind(m);
        const {keepVertexNormals,...surface}=material;
        m.computeNormals=()=>{}; draw(m); if(!keepVertexNormals)normals();
        return C.finish(m, name, { roughness: .72, ...surface });
    }
    function ellipsoid(C, name, center, scale, color, parent, material) {
        return mesh(C, name, m => m.sphere(center, 1, color, rigid(parent), C.save ? 20 : 14, C.save ? 32 : 24, scale), material);
    }
    function line(C, name, path, radii, color, parent) {
        return mesh(C, name, m => m.tube(path, radii, 8, color, rigid(parent)));
    }
    /** Seat an eye in the actual head ellipsoid, retaining a corneal cap
     * above the lid rather than placing an entire eyeball outside it. */
    function insetEye(C,center,scale,offset,radius,parent,side,color) {
        const t=1/Math.hypot(...offset.map((v,k)=>v/scale[k])),surface=offset.map(v=>v*t),normal=norm(surface.map((v,k)=>v/(scale[k]*scale[k])));
        const eye=add(add(center,surface),mul(normal,-radius*.65));C.eye(eye,radius,rigid(parent),side,normal);
        const a=norm(cross(normal,[0,1,0])),b=cross(normal,a),lidCenter=add(eye,mul(normal,radius*.70));
        mesh(C,'Orbital rim '+side,m=>{const ring=Array.from({length:33},(_,i)=>add(lidCenter,add(mul(a,Math.cos(i/32*Math.PI*2)*radius*.72),mul(b,Math.sin(i/32*Math.PI*2)*radius*.72))));m.tube(ring,radius*.07,6,color,rigid(parent));},{noSurfaceDetail:true});
    }
    function bodyPlumage(C,center,scale,parent,profile){
        const {colors:c,r,L}=C,skin=rigid(parent),darkBody=['eagle','crow','parrot'].includes(r.birdType);
        const colorAt=p=>{
            const y=(p[1]-center[1])/scale[1],z=(p[2]-center[2])/scale[2];
            const under=darkBody?0:Math.max(0,Math.min(1,profile.upright?(z-.32)*3:(-y-.10)*1.8));
            const main=r.birdType==='duck'?c.light.map(v=>v*.58):c.main;
            const streak=r.birdType==='owl'||r.birdType==='sparrow'?Math.max(0,Math.sin(p[0]/L*250+z*7))**12*.23:0;
            return main.map((v,k)=>(v+(c.light[k]-v)*under)*(1-streak));
        };
        const sculpt=p=>{
            if(!profile.raptor)return p;
            const y=(p[1]-center[1])/scale[1],taper=.82+.18*y;
            return [center[0]+(p[0]-center[0])*taper,p[1],center[2]+(p[2]-center[2])*taper+L*.10*y];
        };
        mesh(C,'Body',m=>{
            m.sphere(center,1,(t,a,p)=>colorAt(p),skin,C.save?32:26,48,scale);
            for(let i=0;i<m.p.length;i+=3){const p=sculpt(m.p.slice(i,i+3));m.p.splice(i,3,...p);}
        });
        // Small overlapping vanes follow the actual ellipsoid. Their roots are embedded;
        // their tips add a restrained silhouette rather than hovering above the body.
        mesh(C,'Contour plumage',m=>{
            const point=(z,a,lift=0)=>{const f=Math.sqrt(Math.max(0,1-z*z));return sculpt(add(center,[(scale[0]*f+lift)*Math.cos(a),(scale[1]*f+lift)*Math.sin(a),scale[2]*z]));};
            const rows=profile.raptor?14:11,cols=profile.raptor?28:28,step=1.7/rows;
            for(let row=0;row<rows;row++)for(let j=0;j<cols;j++){
                const z=.90-row*step,angle=(j+(row%2)*.5)/cols*Math.PI*2,grid=[];
                for(let i=0;i<=4;i++){
                    const t=i/4,zz=z-t*step*1.60,w=(profile.raptor?.105:.12)*Math.sin(Math.PI*t)**.6;
                    grid.push([-1,0,1].map(u=>{
                        const p=point(zz,angle+u*w,L*(-.0003+.0018*Math.sin(Math.PI*t)*(1-u*u))),n=norm(sub(p,center));
                        const tint=colorAt(p).map(v=>v*(.985+.010*Math.sin(j*1.8+row)**2+.005*(1-Math.abs(u))));
                        return m.vertex(p,n,tint,skin);
                    }));
                }
                for(let i=0;i<4;i++)for(let k=0;k<2;k++){m.tri(grid[i][k],grid[i+1][k],grid[i][k+1]);m.tri(grid[i][k+1],grid[i+1][k],grid[i+1][k+1]);}
            }
        },{doubleSided:true,noSurfaceDetail:true});
    }
    /** Curved feather vane around a tapered rachis, with a convex upper surface. */
    function feather(m, start, end, width, color, skin, secondary) {
        // A zero wing size or tail length leaves no feather rather than a collapsed one.
        if (!(width > 1e-7) || Math.hypot(...sub(end, start)) < 1e-7) return;
        const d = norm(sub(end, start)), across = norm(cross(d, Math.abs(d[1]) > .999 ? [1, 0, 0] : [0, 1, 0])), normal = norm(cross(across, d));
        const ids = [], rows = 12;
        for (let i = 0; i <= rows; i++) {
            const t = .002 + i / rows * .996, p = lerp(start, end, t), w = Math.sin(Math.PI * t) ** .65 * width;
            ids.push([-1, -.48, 0, .48, 1].map(u => {
                const v = add(add(p, mul(across, w * u * (u < 0 ? .8 : 1))), mul(normal, width * .16 * (1 - u * u) * Math.sin(Math.PI * t)));
                const tint = color.map((c, k) => c * (1 - .10 * Math.abs(u)) + (secondary[k] - c) * Math.max(0, t - .6) * .65);
                return m.vertex(v, normal, tint, skin);
            }));
        }
        for (let i = 0; i < rows; i++) for (let j = 0; j < 4; j++) { m.tri(ids[i][j], ids[i][j + 1], ids[i + 1][j]); m.tri(ids[i][j + 1], ids[i + 1][j + 1], ids[i + 1][j]); }
        const shaft=color.map((v,k)=>v*.8+secondary[k]*.2);
        m.tube([start, lerp(start, end, .5), end], [width * .040, width * .024, width * .002], 5, shaft, skin);
        // Sub-pixel barb tubes produced dark stippling at game scale. The
        // curved vane and its rachis carry the visible feather structure.
    }
    function birdWing(C, s, profile, shoulder) {
        const { r, L, colors: c, rootBone } = C, spread = r.wingSpread;
        const span = profile.span * r.wingSize, outward = .20 + spread * .80;
        const elbow = add(shoulder, [s * L * span * .42 * outward, L * .055, -L * span * (.35 - spread * .20)]);
        const wrist = add(shoulder, [s * L * span * .73 * outward, L * .02, -L * span * (.63 - spread * .45)]);
        const tip = add(shoulder, [s * L * span * outward, -L * .02, -L * span * (.95 - spread * .68)]);
        const a = C.bone('Wing' + s, rootBone, shoulder, elbow, 'wing', s), b = C.bone('Wingtip' + s, a, elbow, wrist, 'wingTip', s);
        const hand=C.bone('Wing hand '+s,b,wrist,tip,'wingHand',s);
        if (profile.upright) {
            mesh(C, 'Flipper ' + s, m => m.loft(22, (i,t) => ({center:add(shoulder,[s*L*span*(.15+t*.65),-L*t*.20,-L*t*.13]),x:[0,0,1],y:[0,1,0],rx:L*(.012+Math.sin(Math.PI*t)*.045),ry:L*(.003+Math.sin(Math.PI*t)*.012)}),18,c.main,rigid(a),true));
            return;
        }
        const skinAt=t=>{const w=Math.max(0,Math.min(1,(t-.50)/.10));return {joints:[a,b,0,0],weights:[1-w,w,0,0]};};
        const leading=t=>t<.55?lerp(shoulder,elbow,t/.55):lerp(elbow,wrist,(t-.55)/.45);
        const chord=t=>L*r.wingSize*(.18+.12*Math.sin(t*Math.PI));
        // A rounded leading edge and a tapered airfoil replace the exposed
        // rectangular arm bars. Feather roots sit inside this continuous web.
        mesh(C,'Wing shoulder '+s,m=>{
            const rows=[];
            for(let i=0;i<=24;i++){
                const t=i/24,p=leading(t),skin=skinAt(t),row=[];
                for(let j=0;j<=12;j++){
                    const a=j/12*Math.PI*2,u=(1-Math.cos(a))*.5;
                    row.push(m.vertex(add(p,[0,L*(.027*(1-t)+.003)*Math.sin(a),-chord(t)*u]),[0,Math.sin(a),Math.cos(a)],c.main,skin));
                }rows.push(row);
            }
            for(let i=0;i<24;i++)for(let j=0;j<12;j++){
                // Mirroring span reverses handedness; both airfoils must keep their exterior outward.
                if(s>0){m.tri(rows[i][j],rows[i+1][j],rows[i][j+1]);m.tri(rows[i][j+1],rows[i+1][j],rows[i+1][j+1]);}
                else{m.tri(rows[i][j],rows[i][j+1],rows[i+1][j]);m.tri(rows[i][j+1],rows[i+1][j+1],rows[i+1][j]);}
            }
        });
        mesh(C,'Flight feathers '+s,m=>{
            for(let j=0;j<10;j++){
                const t=j/9,start=add(lerp(elbow,wrist,.76+t*.24),[0,-L*.006,-L*.025]);
                const end=add(wrist,[s*L*span*(.06+.28*t)*outward,-L*.018,-L*r.wingSize*(.43-.30*t)]);
                feather(m,start,end,L*(.042+.009*(1-t))*r.wingSize,c.main,rigid(hand),c.mark);
            }
            for(let j=0;j<13;j++){
                const t=.04+j/12*.82,start=add(leading(t),[0,-L*.003,-chord(t)*.32]);
                feather(m,start,add(start,[s*L*.024,-L*.012,-L*r.wingSize*(.21+.13*Math.sin(t*Math.PI))]),L*.046*r.wingSize,c.main,skinAt(t),c.mark);
            }
        },{doubleSided:true,noSurfaceDetail:true});
        mesh(C,'Wing coverts '+s,m=>{
            // A continuous covert mantle covers the arm/wrist web. Shallow
            // courses describe overlapping vanes without protruding oval lumps.
            const rows=[],T=48,U=12;
            for(let i=0;i<=T;i++){
                const t=i/T,p=leading(t),skin=skinAt(t),row=[];
                for(let j=0;j<=U;j++){
                    const u=j/U,course=t*18+Math.floor(u*3)*.5,f=course-Math.floor(course);
                    const ridge=Math.sin(Math.PI*f)**2*Math.sin(Math.PI*u)*L*.0015;
                    const at=add(p,[0,L*(.027*(1-t)+.005)*Math.sqrt(Math.max(0,1-(u*.9)**2))+ridge,-chord(t)*u*.85]);
                    const tint=c.main.map(v=>v*(.96+.04*Math.sin(Math.PI*f)**2));
                    row.push(m.vertex(at,[0,1,0],tint,skin));
                }rows.push(row);
            }
            for(let i=0;i<T;i++)for(let j=0;j<U;j++){
                const a=rows[i][j],b=rows[i+1][j],c=rows[i][j+1],d=rows[i+1][j+1];
                if(s>0){m.tri(a,b,c);m.tri(b,d,c);}else{m.tri(a,c,b);m.tri(b,c,d);}
            }
        },{doubleSided:true,noSurfaceDetail:true});
    }
    function eagleHead(C,center,parent){
        const {r,L,colors:c}=C,h=L*r.headSize,skin=rigid(parent),at=(x,y,z)=>add(center,[x*h,y*h,z*h]);
        mesh(C,'Head',m=>m.loft(32,(i,t)=>{
            const w=Math.sin(Math.PI*t)**.48;
            return {center:at(0,t*.012,-.115+t*.23),x:[1,0,0],y:[0,1,0],rx:h*(.001+.079*w*(1-.25*t)),ry:h*(.001+.079*w*(1-.25*t))};
        },28,c.light,skin,true));
        const billScale=r.snoutLength,pts=[[0,-.009,.075],[0,.002,.124],[0,-.009,.174],[0,-.032,.195],[0,-.060,.180]];
        const yellow=[.78,.48,.055],dark=[.18,.105,.02];
        mesh(C,'Beak',m=>{
            m.loft(32,(i,t)=>{const q=t*4,k=Math.min(3,Math.floor(q)),p=lerp(pts[k],pts[k+1],q-k),width=[.031,.028,.019,.009,.0005],height=[.024,.027,.021,.014,.0005];return {center:at(p[0],p[1],.075+(p[2]-.075)*billScale),x:[1,0,0],y:[0,1,0],rx:h*(width[k]+(width[k+1]-width[k])*(q-k))*r.snoutWidth,ry:h*(height[k]+(height[k+1]-height[k])*(q-k))};},24,yellow,skin,true);
            m.tube([at(0,-.030,.078),at(0,-.033,.128),at(0,-.039,.165)],[h*.024,h*.018,h*.002],16,yellow,skin);
            for(const s of [-1,1]){
                m.sphere(at(s*.027,.003,.120),1,dark,skin,6,12,[h*.002,h*.003,h*.008]);
                m.tube([at(s*.024,-.022,.095),at(s*.023,-.024,.13),at(s*.012,-.031,.168)],[h*.0014,h*.0013,h*.0006],5,dark,skin);
            }
        },{noSurfaceDetail:true,roughness:.42});
        for(const s of [-1,1]){
            if(r.eyeCount>0)mesh(C,'Eye '+s,m=>{
                const eye=at(s*.052,.020,.044),d=norm([s*.87,.02,.49]),radius=h*.010*r.eyeSize;
                m.sphere(eye,radius,[.22,.15,.045],skin,10,16);
                m.disk(add(eye,mul(d,radius*1.002)),d,radius*.70,c.eye,skin,24);
                m.disk(add(eye,mul(d,radius*1.005)),d,radius*.34,[.012,.012,.008],skin,24);
            },{kind:'eye',roughness:.22,noSurfaceDetail:true,doubleSided:true});
            mesh(C,'Supraorbital brow '+s,m=>m.tube([at(s*.050,.038,.002),at(s*.054,.040,.036),at(s*.047,.034,.068)],[h*.002,h*.004,h*.0015],8,c.light,skin),{noSurfaceDetail:true});
        }
    }
    function feet(C, profile, hipY, z, bat = false) {
        const { r, L, colors: c, rootBone } = C, length = (profile.legs || .18) * r.legLength;
        for (const s of [-1, 1]) {
            const hip = [s * L * .09 * r.girth, hipY, z], knee = [s * L * .105, hipY - L * length * .40, z + L * .05], ankle = [s * L * .11, hipY - L * length, z - L * .025];
            const a = C.bone('Leg' + s + '_0', rootBone, hip, knee, 'legUpper', s > 0 ? 0 : Math.PI), b = C.bone('Leg' + s + '_1', a, knee, ankle, 'legLower', s > 0 ? 0 : Math.PI);
            C.bones[a].motionScale = .12; C.bones[b].motionScale = .2;
            const color = bat ? c.mark : r.birdType==='parrot'?[.24,.25,.23]:profile.upright ? c.mark : profile.raptor?[.65,.39,.035]:[.45, .28, .08];
            mesh(C, 'Leg and foot ' + s, m => {
                m.tube([hip, knee], [L * (profile.raptor?.034:.025), L * .016], 10, c.main, rigid(a));
                m.tube([knee, ankle], [L * (profile.raptor?.018:.012), L * (profile.raptor?.014:.009)], 12, color, rigid(b));
                for (let j = 1; j < 13; j++) m.sphere(lerp(knee, ankle, j / 14), L * (profile.raptor?.017:.011), color, rigid(b), 4, 8, [1, .24, 1]);
                for (let j = 0; j < (bat ? 5 : 4); j++) {
                    const parrot=r.birdType==='parrot',rear = !bat && (parrot?j>=2:j===3),end = add(ankle, [L * (parrot?(j%2-.5)*.033:rear?-.015:(j - (bat ? 2 : 1)) * .027), -L * .008, L * (rear ? -.065 : .09)*(profile.raptor?1.20:1)]);
                    const scale=profile.raptor?1.5:1;
                    m.tube([ankle, lerp(ankle, end, .6), end], [L * .007*scale, L * .006*scale, L * .004*scale], 10, color, rigid(b));
                    if(!profile.raptor)m.tube([end,add(end,[0,-L*.01,L*(rear?-.014:.014)])],[L*.004,L*.0005],8,color,rigid(b));
                    else {
                        const d=rear?-1:1,path=Array.from({length:9},(_,i)=>{const t=i/8;return add(end,[0,L*(.007*Math.sin(t*Math.PI)-.026*t*t),L*d*(.038*t-.008*t*t)]);});
                        m.tube(path,path.map((_,i)=>L*(.0065*(1-i/8)**.75+.0002)),10,[.028,.023,.016],rigid(b));
                        for(let k=1;k<6;k++)m.sphere(lerp(ankle,end,k/7),L*.0075,color,rigid(b),4,8,[1,.5,.7]);
                    }
                    if (profile.webbed && j < 2) {
                        const next = add(end, [L * .027, 0, 0]), n = [0, 1, 0];
                        const v = [ankle, end, next].map(p => m.vertex(p, n, color, rigid(b))); m.tri(...v);
                    }
                }
            }, { doubleSided: !!profile.webbed,noSurfaceDetail:true });
        }
    }
    /** Distinct hooked seed-cracking and bent filtering bills, with an
     * embedded root, a separate mandible and a continuous gape line. */
    function specializedBill(C,bill,parent) {
        const {r,L}=C,parrot=r.birdType==='parrot',skin=rigid(parent),sx=L*r.snoutWidth,sz=L*r.snoutLength;
        const control=parrot?[[.002,.0],[.026,.031],[.019,.068],[-.017,.087],[-.067,.074]]:[[0,0],[.004,.050],[-.006,.093],[-.048,.127],[-.081,.147]];
        const widths=parrot?[.034,.038,.029,.014,.0005]:[.027,.038,.042,.031,.009],heights=parrot?[.031,.035,.028,.019,.0005]:[.025,.027,.029,.024,.009];
        const at=t=>{const q=t*4,k=Math.min(3,Math.floor(q)),f=q-k;return{p:add(bill,[0,(control[k][0]+(control[k+1][0]-control[k][0])*f)*L,(control[k][1]+(control[k+1][1]-control[k][1])*f)*sz]),w:widths[k]+(widths[k+1]-widths[k])*f,h:heights[k]+(heights[k+1]-heights[k])*f};};
        const horn=parrot?[.80,.35,.045]:[.72,.40,.39],black=[.025,.026,.024];
        mesh(C,'Beak',m=>{
            m.loft(33,(_,t)=>{const q=at(t);return{center:q.p,x:[1,0,0],y:[0,1,0],rx:q.w*sx,ry:q.h*L};},24,(t)=>parrot?horn.map((v,k)=>v+( [.90,.64,.15][k]-v)*t):t>.60?black:horn,skin,true);
            const mandible=[add(bill,[0,-L*.028,0]),add(bill,[0,-L*(parrot?.047:.034),sz*.042]),add(bill,[0,-L*(parrot?.048:.069),sz*(parrot?.064:.124)])];
            m.tube(mandible,[sx*.026,sx*.023,sx*.004],18,parrot?black:horn,skin);
            for(const side of [-1,1]){
                const gape=Array.from({length:19},(_,i)=>{const q=at(i/24);return add(q.p,[side*q.w*sx*.91,-q.h*L*.38,0]);});
                m.tube(gape,L*.0015,5,black,skin);
                const nostril=at(.23);m.sphere(add(nostril.p,[side*nostril.w*sx*.95,nostril.h*L*.15,0]),1,black,skin,6,10,[L*.0015,L*.0022,L*.005]);
                if(!parrot)for(let j=0;j<16;j++){const q=at(.22+j*.036);m.tube([add(q.p,[side*q.w*sx*.94,-q.h*L*.34,0]),add(q.p,[side*q.w*sx*.94,-q.h*L*.56,-sz*.002])],L*.0005,4,black,skin);}
            }
        },{noSurfaceDetail:true,roughness:.5});
    }
    function bird(C) {
        const { r, L, Y, colors: c, rootBone: root, headBone: head } = C, p = PROFILES[r.birdType] || PROFILES.eagle;
        const bodyY = Y + L * (p.upright ? .20 : p.legs ? p.legs * .65 : .07), bodyZ = -L * .04;
        const bodyScale = [L * (p.raptor?.165:p.round ? .17 : .15) * r.girth, L * (p.upright ? .29 : p.raptor ? .29 : .18) * r.chestDepth, L * (p.raptor?.18:p.upright ? .19 : .28)];
        bodyPlumage(C,[0,bodyY,bodyZ],bodyScale,root,p);
        const headCenter = [0, bodyY + L * (p.raptor?.29:p.upright ? .30 : .13 + p.neck) * r.neckLength, L * (p.raptor?.13:p.upright ? .10 : .23 + p.neck * .3)];
        C.bones[head].head = add(headCenter, [0, -L * .04, -L * .02]); C.bones[head].tail = add(headCenter, [0, L * .07, L * .03]);
        if (!p.upright) mesh(C, 'Neck plumage', m => {
            const start = [0, bodyY + L * (p.raptor?.13:.06), L * (p.raptor?.08:.14)], path = Array.from({ length: 16 }, (_, i) => { const t = i / 15; return add(lerp(start, headCenter, t), [0, 0, -Math.sin(Math.PI * t) * L * p.neck * .24]); });
            m.tube(path, path.map((_, i) => L * (.080 - i / 15 * .023) * (p.neck > .3 ? .60 : 1)), 24, (t)=>p.raptor?c.main.map((v,k)=>v+(c.light[k]-v)*Math.max(0,Math.min(1,(t-.20)*4))):c.main, position=>{const t=Math.max(0,Math.min(1,(position[1]-start[1])/(headCenter[1]-start[1])));return {joints:[root,head,0,0],weights:[1-t,t,0,0]};});
        },{normalScale:.05});
        if(p.raptor)mesh(C,'Cervical feather ruff',m=>{
            const start=[0,bodyY+L*.13,L*.08],axis=norm(sub(headCenter,start)),around=[0,-axis[2],axis[1]];
            const point=(t,a,lift)=>{
                const center=add(lerp(start,headCenter,t),[0,0,-Math.sin(Math.PI*t)*L*p.neck*.24]),radius=L*(.080-t*.023)+lift;
                return add(center,add([Math.cos(a)*radius,0,0],mul(around,Math.sin(a)*radius)));
            };
            for(let row=0;row<8;row++)for(let j=0;j<32;j++){
                const t=.98-row*.09,angle=(j+(row%2)*.5)/32*Math.PI*2,grid=[];
                for(let i=0;i<=4;i++){
                    const v=i/4,u=t-v*.105,width=.110*Math.sin(v*Math.PI)**.45;
                    const skin={joints:[root,head,0,0],weights:[1-u,u,0,0]};
                    grid.push([-1,0,1].map(s=>{const a=angle+s*width,pos=point(u,a,L*(.0015+.0008*Math.sin(v*Math.PI)*(1-s*s))),white=Math.max(0,Math.min(1,(u-.20)*4)),normal=add([Math.cos(a),0,0],mul(around,Math.sin(a)));return m.vertex(pos,normal,c.main.map((x,k)=>(x+(c.light[k]-x)*white)*(.985+.01*(1-Math.abs(s)))),skin);}));
                }
                for(let i=0;i<4;i++)for(let k=0;k<2;k++){m.tri(grid[i][k],grid[i][k+1],grid[i+1][k]);m.tri(grid[i][k+1],grid[i+1][k+1],grid[i+1][k]);}
            }
        },{doubleSided:true,noSurfaceDetail:true,keepVertexNormals:true});
        if(p.raptor)eagleHead(C,headCenter,head);
        else {
        ellipsoid(C, 'Head', headCenter, [L * p.head * r.headSize * (p.frontEyes ? 1 : .88), L * p.head * r.headSize * (p.frontEyes ? 1.08 : .86), L * p.head * r.headSize * (p.frontEyes ? 1 : 1.15)], r.birdType === 'eagle' || p.frontEyes ? c.light : c.main, head);
        if (p.frontEyes) for (const s of [-1, 1]) {
            const h=L*r.headSize,center=add(headCenter,[s*h*.065,-h*.012,h*.145]);
            ellipsoid(C,'Facial disk '+s,center,[h*.075,h*.09,h*.025],c.light,head);
            mesh(C,'Facial feather rays '+s,m=>{for(let j=0;j<32;j++){
                const a=j/32*Math.PI*2,points=[.54,.76,.97].map(t=>add(center,[h*.075*t*Math.cos(a),h*.09*t*Math.sin(a),h*(.025*Math.sqrt(1-t*t)+.0007)]));
                m.tube(points,[h*.0003,h*.00065,h*.0001],4,c.light.map(v=>v*.78),rigid(head));
            }},{noSurfaceDetail:true});
        }
        const bill = add(headCenter, [0, -L * p.head * .15, L * p.head * .80 * r.headSize]), billLength = L * p.bill * r.snoutLength;
        const billColor = ['eagle', 'duck', 'parrot', 'penguin'].includes(r.birdType) ? [.58, .36, .05] : c.mark;
        if(['parrot','flamingo'].includes(r.birdType))specializedBill(C,bill,head);
        else mesh(C, 'Beak', m => {
            const width = L * (p.webbed && !p.upright ? .055 : p.thinBill ? .008 : .028) * r.snoutWidth;
            const tip = add(bill, [0, p.hook ? -L * .045 : r.birdType === 'flamingo' ? -L * .07 : 0, billLength]);
            const flat = r.birdType === 'duck';
            m.loft(18,(i,t)=>({center:lerp(bill,tip,t),x:[1,0,0],y:[0,1,0],rx:width*(flat?.9+.12*Math.sin(t*Math.PI):1-t*.98),ry:width*(flat?.22*(1-t*.35):.7*(1-t*.98))}),16,billColor,rigid(head),true);
            if (p.hook) m.tube([lerp(bill,tip,.6),add(tip,[0,-L*.015,0])],[width*.6,width*.02],12,billColor,rigid(head));
            m.tube([add(bill, [0, -L * .012, 0]), add(lerp(bill, tip, .65), [0, -L * .012, 0]), add(tip, [0, -L * .004, -L * .006])], [width * .75, width * .40, width * .02], 12, billColor, rigid(head));
            for (const s of [-1, 1]) m.sphere(add(bill, [s * width * .65, width * .3, billLength * .22]), L * .004, c.dark, rigid(head), 5, 8);
        },{noSurfaceDetail:true,roughness:.42});
        for (const s of [-1, 1]) if (r.eyeCount > 0) {
            const h=L*r.headSize;
            if(p.frontEyes)insetEye(C,add(headCenter,[s*h*.065,-h*.012,h*.145]),[h*.075,h*.09,h*.025],[0,h*.018,h*.025],h*.045*r.eyeSize,head,s,c.light);
            else insetEye(C,headCenter,[h*p.head*.88,h*p.head*.86,h*p.head*1.15],[s*h*p.head*.88,h*p.head*.20,h*p.head*.25],h*.018*r.eyeSize,head,s,c.main);
        }
        }
        if (p.comb) mesh(C, 'Comb and wattles', m => {
            const red = [.55, .018, .012],bill=add(headCenter,[0,-L*p.head*.15,L*p.head*.80*r.headSize]);
            for (let j = 0; j < 5; j++) m.sphere(add(headCenter, [0, L * (.08 + Math.sin(j / 4 * Math.PI) * .04), L * (-.07 + j * .032)]), L * .025, red, rigid(head), 8, 12, [.3, 1.4, 1]);
            for (const s of [-1, 1]) m.sphere(add(bill, [s * L * .018, -L * .05, L * .005]), L * .028, red, rigid(head), 8, 12, [.5, 1.6, .8]);
        });
        // The shoulder joint sits inside the torso's sculpted surface at its height and depth, at any girth or chest depth.
        const shoulderY = bodyY + (p.raptor ? L * .16 * r.chestDepth : Math.min(L * .07, bodyScale[1] * .7)), shoulderZ = L * (p.raptor ? .07 : .035);
        const yN = (shoulderY - bodyY) / bodyScale[1], taper = p.raptor ? .82 + .18 * yN : 1, zN = (shoulderZ - bodyZ - (p.raptor ? L * .10 * yN : 0)) / taper / bodyScale[2];
        const shoulderX = Math.min(L * .16 * r.girth, .85 * bodyScale[0] * taper * Math.sqrt(Math.max(0, 1 - yN * yN - zN * zN)));
        for (const s of [-1, 1]) birdWing(C, s, p, [s * shoulderX, shoulderY, shoulderZ]);
        const tail=C.bone('BirdTail',root,[0,bodyY-L*.18,-L*.08],[0,bodyY-L*.18,-L*.24],'birdTail',0);
        mesh(C, 'Tail feathers', m => {
            for (let j = 0; j < 11; j++) {
                const t = (j - 5) / 5, start = [t * L * .025, bodyY-L*(p.raptor?.15:0), -L * (p.raptor?.10:.24)];
                const end = add(start, [t * L * (p.raptor?.045:.11), L * (p.raptor?-.12:p.comb ? .15 : -.025), -L * p.tail * r.tailLength]);
                feather(m, start, end, L * .035, p.raptor?c.light:c.main, rigid(tail), p.raptor?c.light:p.upright ? c.main : c.mark);
            }
        }, { doubleSided: true, noSurfaceDetail: true });
        feet(C, p, bodyY - L * .11, -L * .02);
    }
    function batWing(C, s, shoulder, hip) {
        const { r, L, colors: c, rootBone } = C, span = r.wingSize, spread = .28 + r.wingSpread * .72;
        const elbow = add(shoulder, [s * L * .24 * spread * span, -L * .01, -L * .10 * span]);
        const wrist = add(shoulder, [s * L * .43 * spread * span, L * .03, L * .09 * span]);
        const a = C.bone('Wing' + s, rootBone, shoulder, elbow, 'wing', s), b = C.bone('Wingtip' + s, a, elbow, wrist, 'wingTip', s);
        line(C, 'Wing arm ' + s, [shoulder, elbow], [L * .025, L * .018], c.main, a);
        line(C, 'Wing forearm ' + s, [elbow, wrist], [L * .017, L * .011], c.main, b);
        const tips = [[.86, .02, .12], [.78, -.015, -.12], [.62, -.035, -.32], [.40, -.055, -.44]].map(p => add(shoulder, [s * p[0] * L * span * spread, p[1] * L, p[2] * L * span]));
        const fingerBones = tips.map((tip, j) => C.bone('Wing finger ' + s + '/' + j, b, wrist, tip, 'wingFinger', s));
        mesh(C, 'Wing fingers ' + s, m => {
            tips.forEach((tip, j) => m.tube([wrist, lerp(wrist, tip, .48), tip], [L * .008, L * .005, L * .002], 8, c.light, rigid(fingerBones[j])));
            const thumb = add(wrist, [s * L * .015, L * .04, L * .07]);
            m.tube([wrist, thumb, add(thumb, [-s * L * .008, -L * .014, L * .012])], [L * .009, L * .006, L * .0005], 8, c.mark, rigid(b));
        });
        const boundary = [shoulder,hip,...tips.slice().reverse()], binding=[rootBone,rootBone,...fingerBones.slice().reverse()],membrane = new P.ExactMesh();
        for (let panel = 0; panel < boundary.length - 1; panel++) {
            const endA = boundary[panel], endB = boundary[panel + 1];
            const grid = [], rows = 16, columns = 16;
            for (let i = 0; i <= rows; i++) grid.push(Array.from({ length: columns + 1 }, (_, j) => {
                const t = i / rows, u = j / columns;
                // Scalloped trailing edges curve inward between the fingers, not across them.
                const edge = lerp(endA, endB, u), scallop = panel > 0 ? .13 * Math.sin(Math.PI * u) : 0;
                const p = lerp(wrist, edge, t * (1 - scallop * t * t));
                p[1] -= L * .018 * Math.sin(Math.PI * t) * Math.sin(Math.PI * u);
                // Adjacent panels share the exact binding on their common finger.
                const wa=binding[panel]===rootBone?t:1,wb=binding[panel+1]===rootBone?t:1;
                const skin = { joints: [binding[panel],binding[panel+1],b,0], weights: [(1-u)*wa,u*wb,1-(1-u)*wa-u*wb,0] };
                const vein=Math.pow(Math.max(0,Math.cos(u*Math.PI*14+t*2)),24)*.045;
                return membrane.vertex(p, [0, 1, 0], c.mark.map(v => v * (.90 + .10 * t+vein)), skin);
            }));
            for (let i = 0; i < rows; i++) for (let j = 0; j < columns; j++) { const x = grid[i][j], y = grid[i + 1][j], z = grid[i][j + 1], v = grid[i + 1][j + 1]; membrane.tri(x, y, z); membrane.tri(z, y, v); }
        }
        membrane.computeNormals(); C.finish(membrane, 'Patagium ' + s, { roughness: .64, doubleSided: true, opacity: .92, noSurfaceDetail: true });
        mesh(C,'Propatagium '+s,m=>{
            const points=[shoulder,elbow,wrist],skins=[rigid(a),rigid(b),rigid(b)];
            const ids=points.map((p,i)=>m.vertex(p,[0,1,0],c.mark,skins[i]));m.tri(...ids);
        },{doubleSided:true,noSurfaceDetail:true});
    }
    function bat(C) {
        const { r, L, Y, colors: c, rootBone: root, headBone: head } = C, fox = r.batType === 'flyingFox', vampire = r.batType === 'vampireBat';
        const body = [0, Y + L * .07, 0], headCenter = [0, Y + L * .16, L * .23];
        ellipsoid(C, 'Body', body, [L * .115 * r.girth, L * .13 * r.chestDepth, L * .25], c.main, root);
        C.bones[head].head = add(headCenter, [0, -L * .03, -L * .03]); C.bones[head].tail = add(headCenter, [0, L * .05, L * .05]);
        mesh(C,'Neck fur',m=>m.tube([add(body,[0,L*.035,L*.13]),headCenter],[L*.07,L*.055*r.headSize],14,c.main,p=>{const t=Math.max(0,Math.min(1,(p[2]/L-.13)/.10));return {joints:[root,head,0,0],weights:[1-t,t,0,0]};}));
        ellipsoid(C, 'Head', headCenter, [L * .085 * r.headSize, L * .085 * r.headSize, L * .09 * r.headSize], c.main, head);
        const snout = add(headCenter, [0, -L * .018, L * (fox ? .09 : .065)]);
        ellipsoid(C, 'Muzzle', snout, [L * (fox ? .035 : .055) * r.snoutWidth, L * .032, L * (fox ? .075 : .04) * r.snoutLength], c.light, head);
        ellipsoid(C, 'Nose', add(snout, [0, L * .005, L * (fox ? .062 : .032)]), [L * .025, L * .016, L * .014], c.dark, head);
        for (const s of [-1, 1]) {
            const ear = add(headCenter, [s * L * .07, L * .07, 0]);
            mesh(C, 'Ear and tragus ' + s, m => {
                m.sphere(add(ear, [s * L * .012, L * .035, 0]), 1, c.main, rigid(head), 14, 20, [L * .043, L * (fox ? .065 : .09), L * .015]);
                m.sphere(add(ear, [s * L * .012, L * .036, L * .013]), 1, c.mark, rigid(head), 12, 18, [L * .031, L * (fox ? .049 : .072), L * .006]);
                m.tube([ear, add(ear, [-s * L * .006, L * .045, L * .012])], [L * .012, L * .002], 10, c.light, rigid(head));
                const rim=Array.from({length:33},(_,j)=>{const a=j/32*Math.PI*2;return add(ear,[s*L*.012+L*.036*Math.cos(a),L*.035+L*(fox?.058:.081)*Math.sin(a),L*.011]);});
                m.tube(rim,L*.0028,6,c.main,rigid(head));
            });
            if (r.eyeCount > 0) insetEye(C,headCenter,[L*.085*r.headSize,L*.085*r.headSize,L*.09*r.headSize],[s*L*.062,L*.018,L*.06],L*r.headSize*(fox?.020:.014)*r.eyeSize,head,s,c.main);
            batWing(C, s, [s * L * .080*r.girth, body[1] + L * .035*r.chestDepth, L * .09], [s * L * .050*r.girth, body[1] - L * .045*r.chestDepth, -L * .20]);
        }
        if (vampire) ellipsoid(C, 'Nasal pad', add(snout, [0, L * .02, L * .035]), [L * .028, L * .025, L * .012], c.mark, head);
        mesh(C,'Facial folds and vibrissae',m=>{
            for(const s of [-1,1]){
                m.tube([add(snout,[s*L*.022,-L*.014,L*.025]),add(snout,[0,-L*.020,L*.037]),add(snout,[-s*L*.013,-L*.015,L*.030])],L*.0018,6,c.dark,rigid(head));
                for(let j=0;j<5;j++)m.tube([add(snout,[s*L*.027,-L*.005+j*L*.003,L*.020]),add(snout,[s*L*(.075+j*.007),L*(.015-j*.008),L*(.035+j*.007)])],[L*.0005,L*.00004],4,c.light,rigid(head));
            }
        },{noSurfaceDetail:true});
        mesh(C, 'Fur', m => {
            const count=C.save?1400:900;
            for (let j = 0; j < count; j++) {
                const a = j * 2.399963, y = 1 - (j + .5) / count * 2, t = Math.sqrt(1 - y * y), n = [Math.cos(a) * t, y, Math.sin(a) * t];
                const p = add(body, [n[0] * L * .113 * r.girth, n[1] * L * .129 * r.chestDepth, n[2] * L * .25]);
                const color = fox && n[2] > .25 ? c.light : c.main;
                m.tube([p, add(p, add(mul(n, L * .012),[0,0,-L*.009]))], [L * .0009, L * .00008], 4, color, rigid(root));
            }
        }, { noSurfaceDetail: true });
        feet(C, { legs: .16 }, body[1] - L * .06, -L * .19, true);
        line(C, 'Tail', [[0, body[1], -L * .22], [0, body[1] - L * .09, -L * .36 * r.tailLength]], [L * .012, L * .002], c.main, root);
    }
    const api = { TYPES, PALETTES, PROFILES, build: C => C.r.morphology === 'bat' ? bat(C) : bird(C) };
    root.RRCreatureFlyers = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
