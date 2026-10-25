/** Insect, tick and decapod anatomy. Shared by page, workers and GLB export. */
(function(root) {
    'use strict';
    const P = root.RRCharacterProps || (typeof require === 'function' ? require('./CharacterProps.js') : null);
    const { add, sub, mul, lerp, norm } = P.vec;
    const rigid = P.rigid, tau = Math.PI * 2;
    const INSECTS = ['beetle', 'bee', 'wasp', 'mosquito', 'fly', 'butterfly', 'dragonfly'];
    const TYPES = {
        beetleType: { kind: 'beetle', form: 'arthropod', label: 'Beetle type', choices: [['groundBeetle', 'Ground beetle'], ['stagBeetle', 'Stag beetle'], ['rhinocerosBeetle', 'Rhinoceros beetle'], ['ladybird', 'Ladybird']] },
        crabType: { kind: 'crab', form: 'arthropod', label: 'Crab type', choices: [['shoreCrab', 'Shore crab'], ['fiddlerCrab', 'Fiddler crab'], ['blueCrab', 'Blue crab']] },
        lobsterType: { kind: 'lobster', form: 'arthropod', label: 'Lobster type', choices: [['americanLobster', 'American lobster'], ['spinyLobster', 'Spiny lobster']] }
    };
    const PALETTES = {
        groundBeetle: ['#304e36', '#252a21', '#a58547'], stagBeetle: ['#513127', '#2c201b', '#a16742'],
        rhinocerosBeetle: ['#49392c', '#2b2520', '#876b42'], ladybird: ['#cf3526', '#272422', '#17191a'],
        shoreCrab: ['#79674a', '#b49a70', '#493f2d'], fiddlerCrab: ['#9b633f', '#e6bd80', '#543a27'], blueCrab: ['#49746e', '#b7c8b4', '#365f9b'],
        americanLobster: ['#564c38', '#ad9673', '#243e35'], spinyLobster: ['#9b6246', '#d3b07e', '#4a3830']
    };
    function mesh(C, name, draw, material = {}) {
        const m = new P.ExactMesh(),normals=m.computeNormals.bind(m);
        m.computeNormals=()=>{}; draw(m); normals();
        return C.finish(m, name, { roughness: .48, ...material });
    }
    function ellipsoid(C, name, center, size, color, parent, material = {}) {
        return mesh(C, name, m => m.sphere(center, 1, color, rigid(parent), C.save ? 20 : 14, C.save ? 32 : 24, size), material);
    }
    function tube(C, name, path, radii, color, parent, material = {}) {
        return mesh(C, name, m => m.tube(path, radii, 8, color, rigid(parent)), material);
    }
    // A narrow-rooted membrane with real veins; no opaque shell texture on transparent wings.
    function insectWing(C, sign, pair, small = false) {
        const { r, L, Y, colors: c, rootBone } = C;
        const butterfly = r.kind === 'butterfly', dragonfly = r.kind === 'dragonfly', mosquito = r.kind === 'mosquito';
        const x=sign*L*.06*r.girth,z=L*(.10-pair*.105),rx=L*(r.kind==='wasp'?.085:.105)*r.girth;
        const surfaceY=Y+L*.105*r.chestDepth*Math.sqrt(Math.max(.06,1-(x/rx)**2-((z-L*.07)/(L*.14))**2));
        const origin = [x,Y+(surfaceY-Y)*.90,z];
        const spread = r.wingSpread, span = L * r.wingSize * (butterfly ? (pair ? .49 : .72) : dragonfly ? .69 : .52) * (small ? .72 : 1);
        const width = L * r.wingSize * (butterfly ? (pair ? .27 : .23) : dragonfly ? .055 : mosquito ? .055 : .105) * (small ? .85 : 1);
        const angle = .15 + spread * 1.10 + (pair ? -.30 : .12);
        const point = (t, v) => add(origin, [sign * (Math.sin(angle) * span * t + Math.cos(angle) * width * v), L * .025 * Math.sin(Math.PI * t), -Math.cos(angle) * span * t + Math.sin(angle) * width * v]);
        const bone = C.bone('Wing' + sign + '_' + pair, rootBone, origin, point(.55, 0), 'wing', sign);
        ellipsoid(C,'Wing hinge '+sign+'/'+pair,origin,[L*.020,L*.016,L*.021],c.mark,bone,{roughness:.52});
        const skin = rigid(bone), membrane = new P.ExactMesh(), rows = 20, sides = 10, ids = [];
        for (let i = 0; i <= rows; i++) {
            const t = .002 + i / rows * .996, w = Math.sin(Math.PI * t) ** .65;
            ids.push(Array.from({ length: sides + 1 }, (_, j) => {
                const v = (j / sides * 2 - 1) * w;
                let color = butterfly ? (Math.abs(v) > .78 * w || t > .90 ? c.mark : c.main) : c.light;
                if (butterfly && (Math.abs(v) > .82 * w || t > .90) && Math.sin(t*58+Math.abs(v)*21)>.65) color = c.light;
                return membrane.vertex(point(t, v), [0, 1, 0], color, skin);
            }));
        }
        for (let i = 0; i < rows; i++) for (let j = 0; j < sides; j++) {
            const a = ids[i][j], b = ids[i + 1][j], d = ids[i][j + 1], e = ids[i + 1][j + 1];
            if (sign > 0) { membrane.tri(a, b, d); membrane.tri(d, b, e); } else { membrane.tri(a, d, b); membrane.tri(d, e, b); }
        }
        membrane.computeNormals();
        C.finish(membrane, 'Wing ' + sign + '/' + pair, { kind: 'aquatic', roughness: .36, opacity: butterfly ? 1 : .45, doubleSided: true, noSurfaceDetail: true });
        mesh(C, 'Wing veins ' + sign + '/' + pair, m => {
            const vein = L * (butterfly ? .0018 : .0011), color = butterfly ? c.mark : c.main;
            for (const v of [-1, -.45, .15, .7, 1]) {
                const path = Array.from({ length: 18 }, (_, i) => { const t = .01 + i / 17 * .98; return add(point(t, Math.sin(Math.PI * t) ** .65 * v), [0, L * .001, 0]); });
                m.tube(path, vein, 5, color, skin);
            }
            for (let k = 1; k < 6; k++) {
                const t = k / 7, w = Math.sin(Math.PI * t) ** .65;
                m.tube([point(t, -w), point(t + .035, 0), point(t, w)], vein * .65, 5, color, skin);
            }
        }, { noSurfaceDetail: true });
    }
    function compoundEye(C, name, center, scale, parent) {
        const { L, colors: c } = C;
        ellipsoid(C, name, center, scale, C.r.kind === 'fly' ? c.mark : c.dark, parent, { kind: 'eye', roughness: .22 });
        mesh(C, name + ' facets', m => {
            // Fine raised facets follow the eye, rather than a vertebrate pupil/iris.
            for (let j = 1; j < 8; j++) for (let i = 0; i < 12; i++) {
                const a = tau * (i + (j % 2) * .5) / 12, b = Math.PI * j / 8;
                const n = [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)];
                const p = add(center, n.map((v, k) => v * scale[k] * 1.002));
                m.disk(p, norm(n.map((v, k) => v / scale[k])), L * .0017, c.mark, rigid(parent), 6);
            }
        }, { kind: 'eye', roughness: .3, doubleSided: true, noSurfaceDetail: true });
    }
    function antennae(C, front, parent, long = 1, clubs = false) {
        const { L, Y, r, colors: c } = C;
        mesh(C, 'Antennae', m => {
            for (const s of [-1, 1]) {
                const a = [s * L * .045 * r.headSize, Y + L * .035, front];
                const path = Array.from({ length: 17 }, (_, i) => { const t = i / 16; return add(a, [s * L * (.14 * t + .035 * Math.sin(t * Math.PI)) * long, L * (.06 * t - .02 * t * t) * long, L * .24 * t * long * r.antennaLength]); });
                m.tube(path, path.map((_, i) => L * (.004 * (1 - i / 16) + .001)), 7, c.mark, rigid(parent));
                for (let i = 2; i < 17; i += 2) m.sphere(path[i], L * .004, c.main, rigid(parent), 4, 6, [1, 1, .7]);
                if (clubs) m.sphere(path.at(-1), L * .015, c.mark, rigid(parent), 6, 10, [.7, .7, 1.5]);
            }
        }, { noSurfaceDetail: true });
    }
    /** Muscid antennae originate on the frons, between the eyes, with a plumose arista. */
    function flyAntennae(C,parent){
        const {L,Y,r,colors:c}=C,h=r.headSize;
        const front=Math.max(.245+.079*h,.265+.05*r.eyeSize+.008);
        mesh(C,'Antennae',m=>{
            for(const s of [-1,1]){
                const root=[s*L*.014*h,Y+L*.027*h,L*(.245+.070*h)];
                const pedicel=[s*L*.016*h,Y+L*.009*h,L*front],flagellum=add(pedicel,[s*L*.002,-L*.024*h,L*.010]);
                m.tube([root,pedicel,flagellum],[L*.005,L*.006,L*.004],10,c.dark,rigid(parent));
                m.sphere(flagellum,1,c.main,rigid(parent),8,12,[L*.006,L*.014*h,L*.006]);
                const start=add(pedicel,[0,-L*.005,L*.005]),end=add(start,[s*L*.030*h,L*.045*h,L*.025*r.antennaLength]);
                const path=Array.from({length:12},(_,i)=>lerp(start,end,i/11));
                m.tube(path,path.map((_,i)=>L*(.0018*(1-i/11)+.00015)),5,c.dark,rigid(parent));
                for(let j=1;j<10;j++)for(const side of [-1,1]){
                    const a=lerp(start,end,j/11),b=add(a,[side*L*.009*h,L*.006*h,L*.003]);
                    m.tube([a,b],[L*.00045,L*.00004],4,c.dark,rigid(parent));
                }
            }
        },{noSurfaceDetail:true,roughness:.7});
    }
    /** Front-to-rear fan: the order of roots, knees and feet is identical on each side. */
    function insectLegs(C, tick = false) {
        const { r, L, colors: c, rootBone } = C, Y=tick?C.Y*.4:C.Y,count = r.limbPairs;
        const slender = ['mosquito', 'dragonfly', 'butterfly'].includes(r.kind);
        for (let pair = 0; pair < count; pair++) for (const s of [-1, 1]) {
            const u = count <= 1 ? .5 : pair / (count - 1), fan = 1 - u * 2;
            const z = L * (.145 - u * (tick ? .22 : .19));
            const start = [s * L * (tick ? .10 : .07) * r.girth, Y - L * .035 * r.chestDepth, z];
            const reach = L * r.appendageLength * (slender ? .46 : tick ? .28 : .34);
            const knee = [start[0] + s * reach * .52, Y + L * (tick?-.005:slender ? .018 : .035), z + fan * reach * .40];
            const ankle = [start[0] + s * reach, L * .025, z + fan * reach * .82];
            const toe = add(ankle, [s * L * .055, -L * .015, fan * L * .035]);
            const phase = pair * Math.PI + (s < 0 ? Math.PI : 0);
            const a = C.bone('Leg' + s + '_' + pair + '_0', rootBone, start, knee, 'legUpper', phase);
            const b = C.bone('Leg' + s + '_' + pair + '_1', a, knee, ankle, 'legLower', phase);
            const t = C.bone('Tarsus' + s + '_' + pair, b, ankle, toe, 'tarsus', phase);
            C.bones[a].motionScale = .24; C.bones[b].motionScale = .35;
            const radius = L * (slender ? .005 : tick ? .008 : .012);
            mesh(C, 'Leg ' + s + '/' + pair, m => {
                m.sphere(start, radius * 1.55, c.mark, rigid(a), 6, 10);
                if(tick)m.sphere(add(start,[-s*L*.014,0,0]),1,c.mark,rigid(a),8,12,[L*.029,L*.015,L*.025]);
                m.tube([start, lerp(start, knee, .52), knee], [radius * .85, radius * 1.7, radius], 10, c.main, rigid(a));
                m.sphere(knee, radius * 1.3, c.mark, rigid(b), 6, 10);
                m.tube([knee, lerp(knee, ankle, .68), ankle], [radius, radius * .7, radius * .48], 10, c.main, rigid(b));
                if(tick)for(const t of [.28,.62])m.sphere(lerp(knee,ankle,t),radius*.85,c.mark,rigid(b),5,8,[1,.8,1]);
                // Tibial spurs and separate tarsomeres stay on their own rigid leg segment.
                if (!tick) for (let i = 1; i <= 4; i++) {
                    const p = lerp(knee, ankle, i / 6);
                    m.tube([p, add(p, [s * radius * 2, 0, -radius * 1.5])], [radius * .35, radius * .05], 5, c.mark, rigid(b));
                }
                for(let j=1;j<15;j++){
                    const p=lerp(knee,ankle,j/16),axis=norm(sub(ankle,knee)),side=norm(P.vec.cross(axis,[0,0,1]));
                    for(const sign of [-1,1]){
                        const start=add(p,mul(side,sign*radius*.65));
                        m.tube([start,add(start,add(mul(side,sign*radius*1.6),[0,-L*.002,-L*.003]))],[L*.00055,L*.00006],4,c.mark,rigid(b));
                    }
                }
                for (let i = 0; i < 4; i++) m.tube([lerp(ankle, toe, i / 4), lerp(ankle, toe, (i + 1.02) / 4)], [radius * (.65 - i * .1), radius * (.5 - i * .09)], 7, c.mark, rigid(t));
                for (const fork of [-1, 1]) m.tube([toe, add(toe, [s * L * .012, 0, fork * L * .009]), add(toe, [s * L * .018, -L * .006, fork * L * .005])], [radius * .25, radius * .18, radius * .03], 6, c.dark, rigid(t));
            });
        }
    }
    function beetle(C) {
        const { r, L, Y, rootBone: root, headBone: head, colors: c } = C;
        const lady = r.beetleType === 'ladybird', stag = r.beetleType === 'stagBeetle', rhino = r.beetleType === 'rhinocerosBeetle';
        const length = lady ? .245 : .31, width = (lady ? .255 : .205) * r.girth, depth = (lady ? .19 : .145) * r.chestDepth;
        ellipsoid(C, 'Body', [0, Y, -L * .13], [L * width * .90, L * depth * .70, L * length * .96], c.dark, root);
        ellipsoid(C, 'Pronotum', [0, Y + L * .018, L * .165], [L * .155 * r.girth, L * .12 * r.chestDepth, L * .125], lady ? c.dark : c.main, root);
        ellipsoid(C, 'Head capsule', [0, Y - L * .005, L * .30], [L * .105 * r.headSize, L * .073 * r.headSize, L * .092 * r.headSize], lady ? c.dark : c.main.map(v => v * .72), head);
        // Two complete half-ellipsoids with an actual central separation and fine longitudinal striae.
        for (const s of [-1, 1]) {
            const shell = new P.ExactMesh(), rows = lady ? 49 : 25, sides = lady ? 48 : 20, grid = [];
            const at = (t, a, rise = 0) => {
                const radial = Math.sqrt(Math.max(0, 1 - (2 * t - 1) ** 2)), x = s * (L * .002 + Math.sin(a) * L * width * radial);
                return [x, Y + Math.cos(a) * L * depth * radial + rise, L * (-.13 + length - t * length * 2)];
            };
            for (let j = 0; j <= rows; j++) grid.push(Array.from({ length: sides + 1 }, (_, k) => {
                const t = .001 + j / rows * .998, a = k / sides * Math.PI;
                const p = at(t, a), radial = Math.sqrt(Math.max(.001, 1 - (2*t-1)**2));
                const n = norm([s * Math.sin(a) * radial / width, Math.cos(a) * radial / depth, -(2*t-1) / length]);
                const spotDistance = lady ? Math.min(...[[.27,.65],[.51,.9],[.72,.55]].map(([u,v]) => ((t-u)/.07)**2 + ((a-v)/.20)**2)) : Infinity;
                const ink = Math.max(0, Math.min(1, (1.15 - spotDistance) / .30));
                return shell.vertex(p, n, c.main.map((v,k) => v + (c.mark[k]-v)*ink), rigid(root));
            }));
            for (let j = 0; j < rows; j++) for (let k = 0; k < sides; k++) {
                const a = grid[j][k], b = grid[j + 1][k], d = grid[j][k + 1], e = grid[j + 1][k + 1];
                if (s > 0) { shell.tri(a, b, d); shell.tri(d, b, e); } else { shell.tri(a, d, b); shell.tri(d, e, b); }
            }
            shell.computeNormals(); C.finish(shell, 'Elytron ' + s, { roughness: .3, metalness: lady ? .03 : .18, doubleSided: true });
            mesh(C, 'Wing-case striae ' + s, m => {
                if (!lady) for (let line = 1; line < 8; line++) {
                    const a = .10 + line / 8 * 1.38;
                    const path = Array.from({ length: 21 }, (_, i) => at(.08 + i / 20 * .84, a, L * .0007));
                    m.tube(path, L * .0007, 5, c.main.map((v,k) => v * .75 + c.mark[k] * .25), rigid(root));
                }
            });
        }
        mesh(C, 'Ventral abdominal plates', m => {
            for (let j = 0; j < 6; j++) {
                const z = L * (.03 - j * .068), w = L * width * Math.sin(Math.PI * (.2 + j * .11));
                m.tube([[-w, Y - L * depth * .25, z], [0, Y - L * depth * .88, z], [w, Y - L * depth * .25, z]], L * .003, 7, c.mark, rigid(root));
            }
        });
        mouth(C, L * (.30+.065*r.headSize), stag ? .17 : .04, head);
        if (rhino) tube(C, 'Cephalic horn', [[0, Y, L * .36], [0, Y + L * .12, L * .48], [0, Y + L * .23, L * .43]], [L * .028, L * .018, L * .001], c.mark, head);
        antennae(C, L * .34, head, .8, true);
        for (let i = 0; i < r.eyeCount; i++) {
            const s = i % 2 ? 1 : -1, row = Math.floor(i / 2);
            compoundEye(C, 'Compound eye ' + (row ? s + '/' + row : s), [s * L * .095 * r.headSize, Y + L * (.018 + row * .012), L * (.32 - row * .008)], [L * .026 * r.eyeSize, L * .031 * r.eyeSize, L * .034 * r.eyeSize], head);
        }
        insectLegs(C);
    }
    function mouth(C, z, length, parent) {
        const { L, Y, colors: c } = C;
        mesh(C, 'Mandibles and mouthparts', m => {
            for (const s of [-1, 1]) {
                const a = [s * L * .045, Y - L * .025, z];
                const control=add(a,[s*L*.030,0,L*length*.65]),end=add(a,[-s*L*.022,L*.005,L*length]);
                const at=t=>add(mul(a,(1-t)**2),add(mul(control,2*t*(1-t)),mul(end,t*t)));
                const path=Array.from({length:12},(_,i)=>at(i/11));
                m.tube(path,path.map((_,i)=>L*(.018*(1-i/11)+.001)),10,c.mark,rigid(parent));
                for (let j = 1; j < 4; j++) {
                    const p = at(j/5);
                    m.tube([p, add(p, [-s * L * .018, 0, L * .006])], [L * .005, L * .0005], 6, c.dark, rigid(parent));
                }
            }
        });
    }
    function tick(C) {
        const { r, L, rootBone: root, headBone: head, colors: c } = C,Y=C.Y*.4;
        const profile=z=>{const t=Math.max(.0001,Math.min(.9999,(z+.40)/.62));return {rx:.25*r.girth*Math.sin(Math.PI*t)**.45*(1-.20*t),ry:.075*r.chestDepth*Math.sin(Math.PI*t)**.52};};
        const dorsal=(x,z,raise=0)=>{const p=profile(z);return [L*x,Y+L*(p.ry*Math.sqrt(Math.max(0,1-(x/p.rx)**2))+raise),L*z];};
        mesh(C,'Body',m=>m.loft(C.save?65:49,(i,t)=>{const z=-.40+.62*t,p=profile(z);return {center:[0,Y,L*z],x:[1,0,0],y:[0,1,0],rx:L*p.rx,ry:L*p.ry};},40,(t,a)=>c.main.map(v=>v*(.89+.08*Math.cos(a*2)+.035*Math.sin(t*91))),rigid(root),true));
        mesh(C,'Dorsal shield',m=>{
            const rows=[];
            for(let i=0;i<=30;i++){
                const t=.002+i/30*.996,z=-.105+t*.318,width=.173*r.girth*Math.sin(t*Math.PI)**.58*(.75+.25*t);
                rows.push(Array.from({length:25},(_,j)=>{const x=(j/24*2-1)*width,p=dorsal(x,z,.0012);return m.vertex(p,[0,1,0],c.mark.map(v=>v*(.9+.10*Math.sin(t*55+j*2))),rigid(root));}));
            }
            for(let i=0;i<30;i++)for(let j=0;j<24;j++){m.tri(rows[i][j],rows[i+1][j],rows[i][j+1]);m.tri(rows[i][j+1],rows[i+1][j],rows[i+1][j+1]);}
        });
        mesh(C,'Scutal cervical and marginal grooves',m=>{
            for(const s of [-1,1]){
                const cervical=Array.from({length:22},(_,i)=>{const t=i/21;return dorsal(s*(.032+.045*Math.sin(t*Math.PI))*r.girth,.17-t*.18,.0016);});
                m.tube(cervical,L*.0013,5,c.main.map(v=>v*.55),rigid(root));
                const margin=Array.from({length:36},(_,i)=>{const z=.12-i/35*.46,p=profile(z);return dorsal(s*p.rx*.91,z,.0004);});
                m.tube(margin,L*.0011,5,c.mark,rigid(root));
            }
            for(let j=0;j<160;j++){
                const z=-.37+(j+.5)/160*.55,p=profile(z),x=Math.sin(j*2.399963)*p.rx*.82;
                m.sphere(dorsal(x,z,.0001),L*.0009,c.mark,rigid(root),4,5,[1,.45,1]);
            }
        },{noSurfaceDetail:true});
        mesh(C,'Alloscutal setae',m=>{
            for(let j=0;j<150;j++){
                const z=-.37+(j+.5)/150*.55,q=profile(z),x=Math.sin(j*2.399963)*q.rx*.94,p=dorsal(x,z,-.0002),n=norm([x/q.rx,.5,z]);
                m.tube([p,add(p,mul(norm(n),L*.008))],[L*.00055,L*.00008],4,c.mark,rigid(root));
            }
        },{noSurfaceDetail:true});
        C.bones[head].head=[0,Y,L*.20];C.bones[head].tail=[0,Y,L*.31];
        ellipsoid(C, 'Capitulum', [0, Y, L * .235], [L * .050 * r.headSize, L * .022, L * .055 * r.headSize], c.mark, head);
        mesh(C,'Ventral plates and spiracles',m=>{
            const at=(x,z)=>{const p=profile(z);return [x*L,Y-L*p.ry*Math.sqrt(Math.max(0,1-(x/p.rx)**2)),z*L];};
            for(const s of [-1,1]){
                m.sphere(at(s*.155*r.girth,-.12),1,c.mark,rigid(root),8,14,[L*.018,L*.004,L*.026]);
                const anal=Array.from({length:22},(_,i)=>{const t=i/21*Math.PI;return at(s*.045*Math.sin(t),-.24+.065*Math.cos(t));});
                m.tube(anal,L*.0013,5,c.mark,rigid(root));
            }
            m.sphere(at(0,-.24),1,c.mark,rigid(root),7,12,[L*.013,L*.006,L*.018]);
        });
        mesh(C, 'Palps and barbed hypostome', m => {
            for (const s of [-1, 1]) m.tube([[s * L * .04, Y, L * .27], [s * L * .045, Y, L * .35]], [L * .016, L * .009], 10, c.mark, rigid(head));
            m.tube([[0, Y, L * .28], [0, Y, L * .38]], [L * .015, L * .006], 10, c.dark, rigid(head));
            for (const s of [-1, 1]) for (let j = 0; j < 5; j++) {
                const a = [s * L * .009, Y, L * (.305 + j * .013)];
                m.tube([a, add(a, [s * L * .009, 0, -L * .01])], [L * .003, L * .0003], 5, c.mark, rigid(head));
            }
        });
        insectLegs(C, true);
        for (let i = 0; i < r.eyeCount; i++) {
            const s = i % 2 ? 1 : -1, row = Math.floor(i / 2);
            ellipsoid(C, 'Eye ' + i, [s*L*.155*r.girth,Y+L*(.055*r.chestDepth+row*.005),L*(.12-row*.015)], [L*.009*r.eyeSize,L*.007*r.eyeSize,L*.01*r.eyeSize], c.dark, root, {kind:'eye',roughness:.2});
        }
    }
    function wingedInsect(C) {
        const { r, L, Y, rootBone: root, headBone: head, colors: c } = C;
        const bee = r.kind === 'bee', wasp = r.kind === 'wasp', mosquito = r.kind === 'mosquito', fly = r.kind === 'fly', butterfly = r.kind === 'butterfly', dragonfly = r.kind === 'dragonfly';
        const thin = mosquito || dragonfly, waist = wasp ? .026 : thin ? .035 : .075;
        const thoraxColor=fly?(t,a,p)=>{
            const x=p[0]/(L*r.girth),upper=p[1]>Y,striped=[-.054,-.018,.018,.054].some(v=>Math.abs(x-v)<.0065);
            return upper&&striped?c.dark:c.main;
        }:bee ? c.light : wasp || butterfly ? c.mark : c.main;
        ellipsoid(C, 'Body', [0, Y, L * .07], [L * (wasp ? .085 : .105) * r.girth, L * .105 * r.chestDepth, L * .14], thoraxColor, root);
        ellipsoid(C, 'Thoracic sternum', [0,Y-L*.047*r.chestDepth,L*.045], [L*.09*r.girth,L*.042*r.chestDepth,L*.17], c.mark, root);
        const abdomen = C.bone('Abdomen', root, [0, Y, -L * .05], [0, Y, -L * .34], 'abdomen');
        mesh(C,'Petiole',m=>{
            const end=wasp?.23:.12,path=Array.from({length:9},(_,i)=>[0,Y,-L*end*i/8]);
            m.tube(path,path.map((_,i)=>L*waist*(1-i/8*.25)),12,c.mark,p=>{const t=Math.max(0,Math.min(1,(-p[2]/L-.015)/(wasp?.12:.04)));return {joints:[root,abdomen,0,0],weights:[1-t,t,0,0]};});
        });
        mesh(C, 'Segmented abdomen', m => {
            const segments = dragonfly ? 10 : 7;
            const rows = C.save ? 108 : 84, start = wasp ? .20 : .07, length = dragonfly ? .72 : mosquito ? .48 : wasp ? .37 : .36;
            m.loft(rows, (i,t) => {
                const envelope = Math.sin(Math.PI * (.035 + t * .955)) ** (dragonfly || mosquito ? .35 : .70);
                const groove = 1 - .035 * Math.exp(-(((t * segments % 1) / .12) ** 2));
                const width = L * (thin ? .035 : bee ? .13 : fly ? .12 : butterfly ? .055 : .11) * envelope * groove * r.girth;
                return {center:[0,Y-L*.035*t,-L*(start+t*length)],x:[1,0,0],y:[0,1,0],rx:width,ry:width*r.chestDepth};
            },24,(t) => {
                if (butterfly) return c.mark;
                if (bee || wasp) return Math.floor(t*segments)%2 ? c.mark : c.main;
                return Math.floor(t*segments*2)%2 ? c.main : c.main.map(v=>v*.86);
            },rigid(abdomen),true);
        });
        if (bee || wasp) mesh(C, 'Stinger', m => {
            const end = wasp ? .57 : .43;
            const path = [[0,Y-L*.032,-L*(end-.025)],[0,Y-L*.044,-L*(end+.025)],[0,Y-L*.065,-L*(end+.105)]];
            m.tube(path,[L*.010,L*.006,L*.00045],12,c.dark,rigid(abdomen));
            if (bee) for (let j=1;j<5;j++) for(const s of [-1,1]) {
                const a=lerp(path[1],path[2],j/6);
                m.tube([a,add(a,[s*L*.006,L*.001,L*.007])],[L*.002,L*.0002],5,c.mark,rigid(abdomen));
            }
        });
        // A narrow cervical collar seats the head in the thorax without a floating sphere.
        mesh(C,'Cervical collar',m=>m.tube([[0,Y,L*.17],[0,Y+L*.01,L*.23]],[L*.047*r.headSize,L*.052*r.headSize],12,c.mark,p=>{const t=Math.max(0,Math.min(1,(p[2]/L-.17)/.06));return {joints:[root,head,0,0],weights:[1-t,t,0,0]};}));
        ellipsoid(C, 'Head capsule', [0, Y + L * .015, L * .245], [L * .09 * r.headSize, L * .085 * r.headSize, L * .08 * r.headSize], bee || butterfly ? c.mark : c.main, head);
        for (let i = 0; i < r.eyeCount; i++) {
            const s = i % 2 ? 1 : -1, row = Math.floor(i / 2);
            compoundEye(C, 'Compound eye ' + (row ? s + '/' + row : s), [s * L * (fly?.045*r.headSize+.062*r.eyeSize:.075*r.headSize), Y + L * (.03 + row * .015), L * (.265 - row * .008)], [L * (fly || dragonfly ? .062 : .037) * r.eyeSize, L * .065 * r.eyeSize, L * .05 * r.eyeSize], head);
        }
        if(fly)flyAntennae(C,head);
        else antennae(C, L * (.245+.045*r.headSize), head, butterfly ? 1.2 : mosquito ? .9 : .65, butterfly);
        mesh(C,'Ocelli and facial sutures',m=>{
            const at=(x,y,z)=>[L*x*r.headSize,Y+L*(.015+y*r.headSize),L*(.245+z*r.headSize)];
            for(const x of [-.022,0,.022])m.sphere(at(x,.078,x===0?0:-.017),L*.0045,c.dark,rigid(head),5,8);
            for(const s of [-1,1])m.tube([at(s*.025,.050,.038),at(s*.024,.010,.075),at(s*.017,-.034,.071)],L*.0009,5,c.mark,rigid(head));
        },{noSurfaceDetail:true});
        if (mosquito || butterfly) {
            const a = [0, Y - L * .025, L * (.245+.065*r.headSize)];
            const path = mosquito ? [a, add(a, [0, -L * .025, L * .34 * r.snoutLength])] : Array.from({ length: 24 }, (_, i) => { const t = i / 23, a = t * tau * 1.5; return [Math.sin(a) * L * .035 * t, Y - L * .045 - Math.cos(a) * L * .035 * t, L * .33]; });
            tube(C, 'Proboscis', path, L * .003, c.dark, head);
        } else if(fly)mesh(C,'Sponging labium and labella',m=>{
            const base=[0,Y-L*.037*r.headSize,L*(.245+.047*r.headSize)],tip=add(base,[0,-L*.065*r.headSize,L*.020]);
            m.tube([base,lerp(base,tip,.6),tip],[L*.014,L*.010,L*.012],12,c.dark,rigid(head));
            for(const s of [-1,1]){
                m.sphere(add(tip,[s*L*.009,-L*.002,L*.004]),1,c.light.map(v=>v*.6),rigid(head),10,14,[L*.013,L*.008,L*.018]);
                for(let j=0;j<7;j++)m.tube([add(tip,[s*L*.002,-L*.007,L*(-.008+j*.003)]),add(tip,[s*L*.018,-L*.007,L*(-.007+j*.003)])],L*.00055,4,c.dark,rigid(head));
            }
        },{noSurfaceDetail:true});
        else mouth(C, L * (.245+.065*r.headSize), .025, head);
        if (fly || mosquito) mesh(C, 'Halteres', m => {
            for (const s of [-1, 1]) { const a = [s * L * .08, Y + L * .025, -L * .025], b = add(a, [s * L * .065, L * .025, -L * .04]); m.tube([a, b], L * .003, 6, c.light, rigid(root)); m.sphere(b, L * .009, c.light, rigid(root), 6, 8); }
        });
        for (const s of [-1, 1]) for (let pair = 0; pair < (fly || mosquito ? 1 : 2); pair++) insectWing(C, s, pair, pair === 1 && !dragonfly && !butterfly);
        if (bee || fly) mesh(C, 'Thorax setae', m => {
            const count=bee?(C.save?600:440):220;
            for (let i = 0; i < count; i++) {
                const a = i * 2.399963, y = 1 - (i + .5) / count * 2, rad = Math.sqrt(1 - y * y), n = [Math.cos(a) * rad, y, Math.sin(a) * rad];
                const p = add([0, Y, L * .07], [n[0] * L * .104 * r.girth, n[1] * L * .104 * r.chestDepth, n[2] * L * .14]);
                const tip=add(p,mul(n,L*(bee?.024:.010))),color=bee?c.light.map((v,k)=>v*(.76+.22*Math.sin(i*1.7)**2)):c.mark;
                m.tube([p,tip],[L*.0011,L*.00012],4,color,rigid(root));
                if(bee)for(const s of [-1,1])m.tube([lerp(p,tip,.45),add(lerp(p,tip,.8),[s*L*.004,0,L*.002])],[L*.0005,L*.00007],4,color,rigid(root));
            }
        }, { noSurfaceDetail: true });
        insectLegs(C);
        if(bee)for(const s of [-1,1]) {
            const index=C.bones.findIndex(b=>b.name==='Leg'+s+'_2_1');
            if(index>=0){const b=C.bones[index],p=lerp(b.head,b.tail,.65);ellipsoid(C,'Pollen basket '+s,p,[L*.016,L*.026,L*.018],c.main,index,{roughness:.9});}
        }
    }
    function claw(C, s, a, parent, big) {
        const { L, colors: c } = C, k = big;
        const wrist = add(a, [s * L * .13, -L * .025, L * .10]);
        const palm = add(wrist, [s * L * .055, L * .01, L * .11 * k]);
        const b = C.bone('Chela' + s, parent, wrist, palm, 'claw', s);
        tube(C, 'Cheliped forearm ' + s, [a, wrist], [L * .035, L * .025], c.main, parent);
        // The carpal cup and tapered palm socket overlap both rigid segments. The shared
        // pivot remains coincident when the forearm, palm and movable finger animate.
        ellipsoid(C,'Carpal joint '+s,wrist,[L*.030,L*.027,L*.029],c.mark,b);
        tube(C,'Palm socket '+s,[wrist,lerp(wrist,palm,.55),palm],[L*.026,L*.036*k,L*.046*k],c.main,b);
        ellipsoid(C, 'Claw palm ' + s, palm, [L * .065 * k, L * .043 * k, L * .095 * k], c.main, b);
        for (const fork of [-1, 1]) {
            const start = add(palm, [fork * L * .043 * k, 0, L * .055 * k]);
            const tip = add(palm, [fork * L * .009 * k, 0, L * .225 * k]);
            const moving = fork === s ? C.bone('Dactyl' + s, b, start, tip, 'pincer', s) : b;
            mesh(C, 'Pincer ' + s + '/' + fork, m => {
                const control=add(palm,[fork*L*.075*k,0,L*.15*k]);
                const at=t=>add(mul(start,(1-t)**2),add(mul(control,2*t*(1-t)),mul(tip,t*t)));
                const path=Array.from({length:17},(_,i)=>at(i/16));
                m.tube(path,path.map((_,i)=>L*k*(.028*(1-i/16)**.7+.001)),12,c.main,rigid(moving));
                for (let j = 0; j < 5; j++) {
                    const p = at(.15+j*.14);
                    m.tube([p, add(p, [-fork * L * .018 * k, 0, L * .008])], [L * .006 * k, L * .0005], 6, c.light, rigid(moving));
                }
            });
        }
    }
    function crustacean(C) {
        const { r, L, Y, rootBone: root, headBone: head, colors: c } = C, lobster = r.kind === 'lobster', spiny = lobster && r.lobsterType === 'spinyLobster';
        const width = (lobster ? .15 : .28) * r.girth, depth = (lobster ? .12 : .16) * r.chestDepth, length = lobster ? .28 : .22;
        ellipsoid(C, 'Body', [0, Y, 0], [L * width, L * depth, L * length], c.main, root);
        mesh(C, 'Carapace rim and grooves', m => {
            const path = Array.from({ length: 81 }, (_, i) => { const a = i / 80 * tau, tooth = !lobster ? 1 + .028 * Math.cos(a * 18) : 1; return [Math.cos(a) * L * width * tooth, Y - L * depth * .15, Math.sin(a) * L * length * tooth]; });
            m.tube(path, L * .0045, 8, c.mark, rigid(root));
            for (const s of [-1, 1]) {
                m.tube([[s * L * width * .85, Y + L * depth * .45, -L * .08], [s * L * width * .5, Y + L * depth * .85, L * .02], [s * L * .035, Y + L * depth * .98, L * .08]], L * .002, 6, c.mark, rigid(root));
                for (let j = 0; j < 6; j++) {
                    const z = L * (.14 - j * .047), x = L * width * Math.sqrt(Math.max(.1, 1 - (z / (L * length)) ** 2));
                    m.tube([[s * x, Y, z], [s * (x + L * (r.crabType === 'blueCrab' && j === 3 ? .11 : .025)), Y + L * .012, z - L * .008]], [L * .01, L * .0005], 7, c.main, rigid(root));
                }
            }
            for (let i = 0; i < 90; i++) {
                const a = i * 2.399963, t = Math.sqrt((i + .5) / 90) * .9, x = Math.cos(a) * width * t, z = Math.sin(a) * length * t;
                m.sphere([L * x, Y + L * depth * Math.sqrt(1 - t * t), L * z], L * (spiny ? .006 : .0028), i % 3 ? c.main : c.mark, rigid(root), 4, 6, [1, .65, 1]);
            }
        });
        mesh(C,'Carapace regional sutures',m=>{
            const surface=(x,z)=>[L*x,Y+L*depth*Math.sqrt(Math.max(.01,1-(x/width)**2-(z/length)**2))-L*.0005,L*z];
            for(const s of [-1,1])for(let row=0;row<3;row++){
                const path=Array.from({length:22},(_,i)=>{const t=i/21,x=s*width*(.11+t*.55),z=.105-row*.065-Math.sin(t*Math.PI)*.045;return surface(x,z);});
                m.tube(path,L*.0012,5,c.mark.map((v,k)=>v*.45+c.main[k]*.55),rigid(root));
            }
        });
        const pairs = r.limbPairs;
        for (let pair = 0; pair < pairs; pair++) for (const s of [-1, 1]) {
            const u = pair / Math.max(1, pairs - 1), fan = 1 - 2 * u;
            const z=L*(.16-u*.30), inset=Math.sqrt(Math.max(.05,1-(z/(L*length))**2-(.025/depth)**2));
            const start = [s * L * width * inset * .88, Y - L * .025, z];
            const knee = [s * L * (width + .16 * r.appendageLength), Y - L * .01, start[2] + fan * L * .13];
            const foot = [s * L * (width + .34 * r.appendageLength), L * .02, start[2] + fan * L * .25];
            const phase = pair * Math.PI + (s < 0 ? Math.PI : 0);
            const a = C.bone('Leg' + s + '_' + pair + '_0', root, start, knee, 'legUpper', phase);
            const b = C.bone('Leg' + s + '_' + pair + '_1', a, knee, foot, 'legLower', phase);
            C.bones[a].motionScale = .23; C.bones[b].motionScale = .3;
            if (pair === 0 && !spiny) {
                ellipsoid(C,'Cheliped shoulder '+s,start,[L*.035,L*.032,L*.033],c.main,a);
                tube(C, 'Cheliped upper arm ' + s, [start, knee], [L * .025, L * .035], c.main, a);
                ellipsoid(C,'Cheliped elbow '+s,knee,[L*.038,L*.033,L*.035],c.mark,b);
                claw(C, s, knee, b, r.crabType === 'fiddlerCrab' && s > 0 ? 1.5 : lobster && s < 0 ? 1.25 : 1); continue;
            }
            mesh(C, 'Leg ' + s + '/' + pair, m => {
                m.sphere(start, L * .025, c.mark, rigid(a), 6, 10);
                // Flattened merus, narrow carpus and tapered propodus/dactyl.
                const middle = lerp(start, knee, .5);
                m.tube([start, middle, knee], [L * .018, L * .027, L * .014], 10, c.main, rigid(a));
                m.sphere(knee, L * .017, c.mark, rigid(b), 6, 10);
                m.tube([knee, lerp(knee, foot, .62), foot, add(foot, [s * L * .025, -L * .012, fan * L * .025])], [L * .016, L * .018, L * .007, L * .001], 10, c.main, rigid(b));
                for (let j = 1; j <= 4; j++) { const p = lerp(knee, foot, j / 5); m.tube([p, add(p, [0, L * .012, -L * .008])], [L * .003, L * .0004], 5, c.light, rigid(b)); }
                if (!lobster && r.crabType === 'blueCrab' && pair === pairs - 1) m.sphere(foot, 1, c.mark, rigid(b), 10, 16, [L * .045,L * .009,L * .065]);
            });
        }
        for (let i = 0; i < r.eyeCount; i++) {
            const s = i % 2 ? -1 : 1, row = Math.floor(i / 2), p = [s * L * (.085 + row * .025), Y + L * .12 * r.headSize, L * .205];
            tube(C, 'Eye stalk ' + i, [[s * L * .07, Y + L * .015, L * .17], p], [L * .013, L * .008], c.main, root);
            ellipsoid(C, 'Eye ' + i, p, [L * .018 * r.eyeSize, L * .021 * r.eyeSize, L * .022 * r.eyeSize], c.dark, root, { kind: 'eye', roughness: .16 });
        }
        mesh(C, 'Mouthparts and folded abdomen', m => {
            for (const s of [-1, 1]) for (let j = 0; j < 3; j++) {
                const a = [s * L * (.018 + j * .014), Y - L * .045, L * .18];
                m.tube([a, add(a, [s * L * .018, -L * .035, L * .04]), add(a, [-s * L * .012, -L * .045, L * .07])], [L * .008, L * .007, L * .002], 8, c.mark, rigid(head));
            }
            if (!lobster) for (let j = 0; j < 5; j++) m.sphere([0, Y - L * depth * .9, -L * .08 + j * L * .035], 1, c.light, rigid(root), 5, 12, [L * (.1 - j * .012), L * .014, L * .025]);
        });
        antennae(C, L * (lobster?.21:.19), head, lobster ? (spiny ? 3.2 : 2.1) : .26);
        if (lobster) {
            let parent = root;const tail=[];
            for (let j = 0; j < 6; j++) {
                const z = -L * (.23 + j * .09 * r.tailLength), center = [0, Y - L * .012 * j, z];
                const b = C.bone('Tail segment ' + j, parent, center, add(center, [0, -L * .01, -L * .09]), 'tail'); parent = b;tail.push({center,b});
                ellipsoid(C, 'Abdominal tergite ' + j, center, [L * (.13 - j * .012) * r.girth, L * .075 * r.chestDepth, L * .074 * r.tailLength], j % 2 ? c.main.map((v,k)=>v*.78+c.mark[k]*.22) : c.main, b);
                for (const s of [-1, 1]) {
                    tube(C, 'Swimmeret ' + s + '/' + j, [add(center, [s * L * .055, -L * .04, 0]), add(center, [s * L * .10, -L * .10, -L * .025])], [L * .016, L * .006], c.light, b);
                    if (j === 5) ellipsoid(C, 'Uropod ' + s, add(center, [s * L * .09, -L * .01, -L * .09]), [L * .10, L * .018, L * .12], c.main, b);
                }
                if (j === 5) ellipsoid(C, 'Telson', add(center, [0, -L * .01, -L * .11]), [L * .055, L * .02, L * .12], c.mark, b);
            }
            mesh(C,'Abdominal connecting membrane',m=>{
                for(let j=0;j<tail.length;j++){
                    const a=j?tail[j-1]:{center:[0,Y,-L*.20],b:root},b=tail[j];
                    m.tube([a.center,lerp(a.center,b.center,.5),b.center],[L*(.081-j*.007)*r.girth,L*(.08-j*.007)*r.girth,L*(.079-j*.007)*r.girth],16,c.mark,p=>{const span=b.center[2]-a.center[2],t=Math.abs(span)>1e-9?Math.max(0,Math.min(1,(p[2]-a.center[2])/span)):.5;return {joints:[a.b,b.b,0,0],weights:[1-t,t,0,0]};});// segments at one depth (shortest tail) share the joint evenly
                }
            });
            tube(C, 'Rostrum', [[0, Y + L * .06, L * .20], [0, Y + L * .07, L * .34]], [L * .035, L * .001], c.mark, root);
        }
    }
    function build(C) {
        if (C.r.kind === 'beetle') beetle(C);
        else if (C.r.kind === 'tick') tick(C);
        else if (C.r.kind === 'crab' || C.r.kind === 'lobster') crustacean(C);
        else wingedInsect(C);
    }
    const api = { INSECTS, TYPES, PALETTES, build, handles: kind => INSECTS.includes(kind) || ['tick', 'crab', 'lobster'].includes(kind) };
    root.RRCreatureArthropods = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
