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
        // Living cuticle is satin rather than lacquered; glossy parts ask for less.
        return C.finish(m, name, { roughness: .62, ...material });
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
        const skin = rigid(bone), membrane = new P.ExactMesh(), rows = butterfly ? 34 : 20, sides = butterfly ? 18 : 10, ids = [];
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
    /** A compound eye: hundreds of hexagonal ommatidia lenses carried by a fine
     * facet picture (RRCreatureForms 'facets'), with a dark pseudopupil and a
     * faint bronze sheen instead of a vertebrate iris or a few raised dots. */
    function compoundEye(C, name, center, scale, parent) {
        const { colors: c } = C, base = C.r.kind === 'fly' ? c.mark : c.dark;
        const part = ellipsoid(C, name, center, scale, base.map(v => v * .9 + .02), parent, { kind: 'eye', roughness: .2, facetSurface: true });
        if (part) for (let i = 0; i < part.positions.length / 3; i++) {
            const n = [0, 1, 2].map(k => (part.positions[i * 3 + k] - center[k]) / scale[k]), side = Math.abs(n[0]);
            const pseudo = Math.exp(-(((1 - side) / .18) ** 2)), k = .8 + .2 * n[1];
            part.colors.set(base.map((v, j) => Math.max(0, v * k * (1 - pseudo * .5) + [.03, .02, .0][j] * (1 - side))), i * 3);
        }
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
    /** Front-to-rear fan: the order of roots, knees and feet is identical on each side.
     * Insects stand low: a short coxa under the thorax, a clubbed femur rising
     * to the knee, a slimmer spined tibia down to the ground and five tarsomeres
     * with paired claws lying on it; segments overlap instead of joint balls. */
    function insectLegs(C, tick = false) {
        if (tick) return tickLegs(C);
        const { r, L, Y, colors: c, rootBone } = C, count = r.limbPairs;
        const slender = ['mosquito', 'dragonfly', 'butterfly'].includes(r.kind), beetle = r.kind === 'beetle';
        const ground = Y - L * (({ beetle: .135, mosquito: .23, butterfly: .17, dragonfly: .13, fly: .145 })[r.kind] ?? .15);
        const legColor = beetle ? c.dark.map((v, k) => v * .7 + c.main[k] * .3) : r.kind === 'bee' || r.kind === 'wasp' ? c.mark.map((v, k) => v * .6 + c.main[k] * .4) : c.main;
        const joint = legColor.map(v => v * .55);
        for (let pair = 0; pair < count; pair++) for (const s of [-1, 1]) {
            const u = count <= 1 ? .5 : pair / (count - 1), fan = 1 - u * 2;
            const z = L * (.145 - u * .19), reach = L * r.appendageLength * (slender ? .44 : .31);
            const start = [s * L * .055 * r.girth, Y - L * .045 * r.chestDepth, z];
            const coxa = add(start, [s * L * .028, -L * .008, fan * L * .006]);
            const knee = add(coxa, [s * reach * .48, L * (slender ? .055 : .04), fan * reach * .34]);
            const ankle = [knee[0] + s * reach * .40, ground + L * .008, knee[2] + fan * reach * .30];
            const toe = add(ankle, [s * L * .05 * (slender ? .8 : 1), ground - ankle[1], fan * L * .045]);
            const phase = pair * Math.PI + (s < 0 ? Math.PI : 0);
            const a = C.bone('Leg' + s + '_' + pair + '_0', rootBone, start, knee, 'legUpper', phase);
            const b = C.bone('Leg' + s + '_' + pair + '_1', a, knee, ankle, 'legLower', phase);
            const t = C.bone('Tarsus' + s + '_' + pair, b, ankle, toe, 'tarsus', phase);
            C.bones[a].motionScale = .24; C.bones[b].motionScale = .35;
            const radius = L * (slender ? .0055 : beetle ? .0125 : .011) * (pair === count - 1 && r.kind === 'bee' ? 1.15 : 1);
            mesh(C, 'Leg ' + s + '/' + pair, m => {
                m.tube([sub(start, [s * radius, 0, 0]), lerp(start, coxa, .5), coxa], [radius * 1.6, radius * 1.75, radius * 1.3], 10, joint, rigid(a));
                const femur = [lerp(coxa, knee, -.05), lerp(coxa, knee, .25), lerp(coxa, knee, .62), lerp(coxa, knee, 1.02)];
                m.tube(femur, [radius * 1.05, radius * 1.45, radius * 1.3, radius * .85], 12, legColor, rigid(a));
                const tibia = [lerp(knee, ankle, -.03), lerp(knee, ankle, .5), ankle];
                m.tube(tibia, [radius * .8, radius * .72, radius * .62], 10, legColor, rigid(b));
                // Rows of tibial spines and a pair of apical spurs, all on the tibia's own segment.
                const axis = norm(sub(ankle, knee)), side = norm(P.vec.cross(axis, [0, 0, 1]));
                for (let j = 1; j < (slender ? 6 : 9); j++) for (const sign of [-1, 1]) {
                    const q = add(lerp(knee, ankle, j / (slender ? 6 : 9)), mul(side, sign * radius * .6));
                    m.tube([q, add(q, add(mul(side, sign * radius * (beetle ? 1.6 : 1.1)), mul(axis, radius * 1.2)))], [radius * (beetle ? .22 : .12), radius * .02], 4, joint, rigid(b));
                }
                for (const sign of [-1, 1]) { const q = add(ankle, mul(side, sign * radius * .4)); m.tube([q, add(q, add(mul(axis, radius * 2.2), mul(side, sign * radius)))], [radius * .25, radius * .03], 5, joint, rigid(b)); }
                // Five tarsomeres, each a little narrower, then two curved claws.
                for (let i = 0; i < 5; i++) {
                    const p0 = lerp(ankle, toe, i / 5), p1 = lerp(ankle, toe, (i + .92) / 5), w = radius * (.55 - i * .05) * (beetle && i < 3 ? 1.35 : 1);
                    m.tube([p0, lerp(p0, p1, .5), p1], [w * .75, w, w * .7], 8, i % 2 ? legColor : joint, rigid(t));
                }
                for (const fork of [-1, 1]) m.tube([toe, add(toe, [s * L * .008, L * .002, fork * L * .006]), add(toe, [s * L * .013, -L * .002, fork * L * .004])], [radius * .22, radius * .16, radius * .03], 6, c.dark, rigid(t));
            });
        }
    }
    /** The tick's eight short legs (unchanged). */
    function tickLegs(C, tick = true) {
        const { r, L, colors: c0, rootBone } = C, c = { ...c0, main: c0.main.map((v, k) => v * .35 + c0.mark[k] * .65) }, Y=tick?C.Y*.4:C.Y,count = r.limbPairs;
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
        const length = lady ? .245 : .31, width = (lady ? .255 : .205) * r.girth, depth = (lady ? .19 : .118) * r.chestDepth;
        ellipsoid(C, 'Body', [0, Y, -L * .13], [L * width * .90, L * depth * .70, L * length * .96], c.dark, root);
        ellipsoid(C, 'Pronotum', [0, Y + L * .012, L * .165], [L * .155 * r.girth, L * (lady ? .12 : .092) * r.chestDepth, L * .125], lady ? c.dark : c.main, root, { roughness: .32, metalness: lady ? .03 : .2 });
        ellipsoid(C, 'Head capsule', [0, Y - L * .008, L * .30], [L * .105 * r.headSize, L * .062 * r.headSize, L * .092 * r.headSize], lady ? c.dark : c.main.map(v => v * .72), head, { roughness: .34, metalness: lady ? .03 : .2 });
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
            shell.computeNormals();
            // Ground and stag beetle wing cases carry a thin-film sheen (KHR_materials_iridescence).
            C.finish(shell, 'Elytron ' + s, { roughness: lady ? .22 : .3, metalness: lady ? .03 : .18, doubleSided: true, ...(lady ? {} : { iridescence: r.beetleType === 'groundBeetle' ? .7 : .35, iridescenceIOR: 1.6, iridescenceThicknessRange: [260, 560] }) });
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
        // Leathery alloscutum: fine longitudinal wrinkles, a marginal groove and
        // eleven festoons notched around the posterior margin.
        const tickSides=C.save?72:56,festoon=(x,z)=>{const phi=Math.atan2(x,-(z+.09)),f=phi/(Math.PI*.62)*5.5+5.5;return Math.abs(phi)<Math.PI*.62&&z<-.05?Math.exp(-(((f-Math.round(f))/.09)**2)):0;};
        const tickPart=mesh(C,'Body',m=>{m.loft(C.save?65:49,(i,t)=>{const z=-.40+.62*t,p=profile(z);return {center:[0,Y,L*z],x:[1,0,0],y:[0,1,0],rx:L*p.rx,ry:L*p.ry};},tickSides,(t,a,q)=>{const z=q[2]/L,x=q[0]/L,wr=Math.sin(a*34+Math.sin(t*9)*2)*.5+.5,groove=festoon(x,z)*ease(.7,.95,Math.abs(Math.cos(a)));return c.main.map((v,k)=>v*(.84+.12*wr*Math.max(0,Math.sin(a)))*(1-groove*.45)+(c.mark[k]-v)*.12*ease(.75,.98,Math.abs(Math.cos(a))));},rigid(root),true);
            for(let i=0;i<m.p.length;i+=3){const x=m.p[i]/L,yy=(m.p[i+1]-Y)/L,z=m.p[i+2]/L,p=profile(z),a=Math.atan2(yy/Math.max(1e-6,p.ry),x/Math.max(1e-6,p.rx)),k=1-(festoon(x,z)*.04*Math.cos(a)**8)+.012*Math.sin(a*34+Math.sin((z+.4)/.62*9)*2)*Math.max(0,Math.sin(a))*ease(-.38,-.1,z);m.p[i]*=k;m.p[i+1]=Y+(m.p[i+1]-Y)*k;}
        },{roughness:.72});
        mesh(C,'Dorsal shield',m=>{
            const rows=[];
            for(let i=0;i<=30;i++){
                const t=.002+i/30*.996,z=-.105+t*.318,width=.173*r.girth*Math.sin(t*Math.PI)**.58*(.75+.25*t);
                rows.push(Array.from({length:25},(_,j)=>{const x=(j/24*2-1)*width,p=dorsal(x,z,.0012+.0022*Math.sin(Math.PI*j/24)**.5*Math.sin(t*Math.PI)**.5);return m.vertex(p,[0,1,0],c.mark.map(v=>v*(.9+.10*Math.sin(t*55+j*2))),rigid(root));}));
            }
            for(let i=0;i<30;i++)for(let j=0;j<24;j++){m.tri(rows[i][j],rows[i+1][j],rows[i][j+1]);m.tri(rows[i][j+1],rows[i+1][j],rows[i+1][j+1]);}
        },{roughness:.24,metalness:.06});
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
        // Basis capituli: a rounded block with two pale porose areas on top.
        mesh(C,'Capitulum',m=>{const h=r.headSize;m.roundedBox([0,Y+L*.002,L*.232],[[1,0,0],[0,1,0],[0,0,1]],[L*.046*h,L*.02,L*.034*h],L*.012,c.mark,rigid(head),3);
            for(const s of [-1,1])m.sphere([s*L*.018*h,Y+L*.0215,L*.232],1,c.light.map(v=>v*.8),rigid(head),6,10,[L*.011*h,L*.0018,L*.016*h]);},{roughness:.3});
        mesh(C,'Ventral plates and spiracles',m=>{
            const at=(x,z)=>{const p=profile(z);return [x*L,Y-L*p.ry*Math.sqrt(Math.max(0,1-(x/p.rx)**2)),z*L];};
            for(const s of [-1,1]){
                m.sphere(at(s*.155*r.girth,-.12),1,c.mark,rigid(root),8,14,[L*.018,L*.004,L*.026]);
                const anal=Array.from({length:22},(_,i)=>{const t=i/21*Math.PI;return at(s*.045*Math.sin(t),-.24+.065*Math.cos(t));});
                m.tube(anal,L*.0013,5,c.mark,rigid(root));
            }
            m.sphere(at(0,-.24),1,c.mark,rigid(root),7,12,[L*.013,L*.006,L*.018]);
        });
        // Mouthparts: flattened three-article palps sheathing a toothed hypostome,
        // with the paired chelicerae above it.
        mesh(C, 'Palps and barbed hypostome', m => {
            const h = r.headSize;
            for (const s of [-1, 1]) {
                m.sphere([s * L * .03 * h, Y + L * .001, L * .282], 1, c.mark, rigid(head), 10, 16, [L * .017 * h, L * .011, L * .036 * h]);
                m.sphere([s * L * .025 * h, Y + L * .001, L * .328], 1, c.mark.map(v => v * .9), rigid(head), 10, 16, [L * .015 * h, L * .01, L * .024 * h]);
                m.tube([[s * L * .006, Y + L * .006, L * .25], [s * L * .006, Y + L * .006, L * .33], [s * L * .004, Y + L * .004, L * .35]], [L * .0055, L * .005, L * .002], 8, c.dark, rigid(head));
            }
            m.sphere([0, Y - L * .006, L * .31], 1, c.light.map(v => v * .75), rigid(head), 10, 16, [L * .011 * h, L * .0045, L * .055 * h]);
            for (const s of [-1, 1]) for (let row = 0; row < 3; row++) for (let j = 0; j < 7; j++) {
                const a = [s * L * (.003 + row * .0028) * h, Y - L * .0098, L * (.278 + j * .0095 + row * .002)];
                m.tube([a, add(a, [s * L * .0015, -L * .0012, -L * .0045])], [L * .0012, L * .0002], 4, c.mark.map(v => v * .7), rigid(head));
            }
        }, { roughness: .35 });
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
    /** A laterally flattened limb segment: its deep axis stays vertical. */
    function flatSegment(m, path, radii, flat, color, skin, sides = 10) {
        const n = path.length; let prev = null;
        m.loft(n, i => {
            const d = norm(sub(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]));
            let x = norm(P.vec.cross(d, [0, 1, 0])); if (Math.hypot(...x) < .1) x = [1, 0, 0];
            if (prev && P.vec.dot(prev, x) < 0) x = mul(x, -1); prev = x;
            const y = P.vec.cross(x, d), rr = Array.isArray(radii) ? radii[i] : radii;
            return { center: path[i], x, y, rx: rr * flat, ry: rr };
        }, sides, color, skin, true);
    }
    /** A cheliped's claw on its own frame: swollen granular palm, fixed finger and a
     * hinged dactyl, both with cutting-edge denticles and darker tips. `dir` is the
     * palm axis: crabs fold theirs across the front, lobsters hold them forward. */
    function claw(C, s, wrist, parent, big, dir) {
        const { L, colors: c, r } = C, k = big, f = norm(dir), up = [0, 1, 0], side = mul(norm(P.vec.cross(up, f)), r.kind === 'lobster' ? s : 1); // a lobster's pair mirror each other
        const palmLength = L * .15 * k, palm = add(wrist, mul(f, palmLength));
        const b = C.bone('Chela' + s, parent, wrist, palm, 'claw', s);
        const tip = r.crabType === 'blueCrab' ? [.62, .12, .1] : c.dark;
        ellipsoid(C, 'Carpal joint ' + s, wrist, [L * .028 * Math.min(1.4, k), L * .026 * Math.min(1.4, k), L * .03 * Math.min(1.4, k)], c.mark, b);
        mesh(C, 'Claw palm ' + s, m => {
            // The palm begins exactly on the carpal pivot the forearm ends on.
            flatSegment(m, [wrist, lerp(wrist, palm, .3), lerp(wrist, palm, .75), add(palm, mul(f, L * .01))], [L * .03 * k, L * .05 * k, L * .052 * k, L * .04 * k], .62, c.main, rigid(b), 14);
            // Granules and a row of crest tubercles along the upper margin.
            for (let i = 0; i < 26; i++) { const t = .15 + (i % 13) / 13 * .75, q = add(lerp(wrist, palm, t), add(mul(up, L * k * (i < 13 ? .048 : .02)), mul(side, (i < 13 ? 0 : 1) * L * .028 * k))); m.sphere(q, L * .0045 * k, c.main.map(v => v * 1.12), rigid(b), 4, 6, [1, .6, 1]); }
        });
        for (const fork of [-1, 1]) {
            const moving = fork > 0 ? C.bone('Dactyl' + s, b, add(palm, mul(up, L * .02 * k)), add(palm, mul(f, L * .12 * k)), 'pincer', s) : b;
            const base = add(palm, mul(up, fork * L * .02 * k)), end = add(add(palm, mul(f, L * .13 * k)), mul(up, -fork * L * .004 * k));
            const control = add(lerp(base, end, .5), mul(up, fork * L * .012 * k));
            const at = t => add(mul(base, (1 - t) ** 2), add(mul(control, 2 * t * (1 - t)), mul(end, t * t)));
            mesh(C, 'Pincer ' + s + '/' + fork, m => {
                const path = Array.from({ length: 13 }, (_, i) => at(i / 12));
                flatSegment(m, path, path.map((_, i) => L * k * (.026 * (1 - i / 12) ** .8 + .0015)), .7, c.main, rigid(moving), 10);
                const cap = Array.from({ length: 4 }, (_, i) => at(.82 + i * .06));
                m.tube(cap, cap.map((_, i) => L * k * (.007 - i * .0017) + L * .0004), 8, tip, rigid(moving));
                // Molariform denticles along the cutting edge.
                for (let j = 0; j < 7; j++) { const q = add(at(.18 + j * .09), mul(up, -fork * L * k * .013)); m.sphere(q, L * k * (.0055 - j * .0004), c.light, rigid(moving), 4, 6, [1, .7, 1]); }
            });
        }
    }
    /** Crab carapace: an outlined dorsal shield (frontal lobes, orbits, anterolateral
     * teeth or the blue crab's lateral spine), gastric and branchial swellings with
     * an H-shaped groove, fine granules, a flatter sternum below. */
    function crabShell(C, W, Lz, D) {
        const { r, L, Y, rootBone: root, colors: c } = C, type = r.crabType;
        const right = type === 'blueCrab' ? [[0,.85],[.1,.88],[.18,.83],[.26,.87],[.5,.72],[.76,.44],[.97,.14],[1.3,.02],[.92,-.08],[.76,-.42],[.46,-.78],[0,-.85]]
            : type === 'fiddlerCrab' ? [[0,.95],[.28,.96],[.58,.93],[.84,.76],[.96,.45],[.92,0],[.76,-.5],[.5,-.85],[0,-.9]]
            : [[0,.92],[.1,.95],[.2,.9],[.3,.94],[.56,.8],[.8,.55],[.95,.25],[1,0],[.9,-.36],[.7,-.66],[.42,-.86],[0,-.9]];
        const pts = right.concat(right.slice(1, -1).reverse().map(([x, z]) => [-x, z])).map(([x, z]) => [x * W, z * Lz]);
        const N = C.save ? 160 : 120, outline = [];
        for (let i = 0; i < N; i++) {
            const q = i / N * pts.length, j = Math.floor(q), u = q - j, at = k => pts[(k + pts.length) % pts.length];
            const a = at(j - 1), b = at(j), cc = at(j + 1), d = at(j + 2);
            outline.push([0, 1].map(k => .5 * (2 * b[k] + (-a[k] + cc[k]) * u + (2 * a[k] - 5 * b[k] + 4 * cc[k] - d[k]) * u * u + (-a[k] + 3 * b[k] - 3 * cc[k] + d[k]) * u ** 3)));
        }
        // Anterolateral teeth: saw-toothed outward bumps between the orbit and the widest point.
        const teeth = type === 'blueCrab' ? 8 : type === 'fiddlerCrab' ? 0 : 5;
        if (teeth) outline.forEach((p, i) => {
            const z = p[1] / Lz, x = Math.abs(p[0]) / W; if (z < .05 || z > .86 || x < .3) return;
            const f = (.86 - z) / .81 * teeth, saw = f % 1;
            const n = norm([p[0] / W, 0, p[1] / Lz * .6]);
            p[0] += n[0] * W * .045 * saw ** 1.5; p[1] += n[2] * Lz * .045 * saw ** 1.5;
        });
        const height = (x, z, rho, upper) => {
            if (!upper) return -D * .42 * (1 - rho ** 3) ** .5 - L * .001 * (1 - rho);
            const bulge = .09 * Math.exp(-((x / (.22 * W)) ** 2) - (((z - .2 * Lz) / (.3 * Lz)) ** 2)) + .06 * Math.exp(-(((Math.abs(x) - .5 * W) / (.24 * W)) ** 2) - (((z + .05 * Lz) / (.35 * Lz)) ** 2));
            const groove = .05 * Math.exp(-(((z - Lz * (.02 + .3 * (x / W) ** 2)) / (.025 * Lz)) ** 2)) * (1 - ease(.35, .5, Math.abs(x) / W)) + .04 * Math.exp(-(((Math.abs(x) - .2 * W) / (.02 * W)) ** 2)) * ease(-.6, -.2, z / Lz) * (1 - ease(-.05, .1, z / Lz));
            return D * ((1 - rho ** 2.2) ** .55 * (1 + bulge - groove)) + L * .002 * (1 - rho);
        };
        const NR = C.save ? 26 : 20, shell = new P.ExactMesh();
        for (const upper of [true, false]) {
            const grid = [];
            for (let i = 0; i <= NR; i++) {
                const rho = i / NR, row = [];
                for (let k = 0; k < (i ? N : 1); k++) {
                    const x = outline[k][0] * rho, z = outline[k][1] * rho, n = fbm(x / L * 14 + 2, z / L * 14, 3);
                    const col = upper ? c.main.map((v, j) => v * (.86 + n * .3) * (1 - ease(.9, 1, rho) * .25) + (c.mark[j] - v) * ease(.6, .75, fbm(x / L * 30, z / L * 30 + 5, 2)) * .25) : mix3(c.light, c.main, ease(.85, 1, rho) * .35);
                    row.push(shell.vertex([x, Y + height(x, z, rho, upper), z], [0, upper ? 1 : -1, 0], col, rigid(root)));
                }
                grid.push(row);
            }
            for (let i = 0; i < NR; i++) for (let k = 0; k < N; k++) {
                const k1 = (k + 1) % N, A = grid[i][i ? k : 0], B = grid[i][i ? k1 : 0], Cc = grid[i + 1][k], Dd = grid[i + 1][k1];
                const tri = (p, q, s2) => upper ? shell.tri(p, s2, q) : shell.tri(p, q, s2);
                if (i) { tri(A, B, Cc); tri(B, Dd, Cc); } else tri(A, Dd, Cc);
            }
        }
        shell.computeNormals();
        const part = C.finish(shell, 'Body', { roughness: .42 });
        for (let i = 0; i < part.positions.length / 3; i++) if ((part.positions[i * 3 + 1] - Y) * part.normals[i * 3 + 1] < 0 && Math.abs(part.positions[i * 3 + 1] - Y) > L * .003) for (let k = 0; k < 3; k++) part.normals[i * 3 + k] *= -1;
        const top = (x, z) => { const th = Math.atan2(x, z); let best = 0, bd = Infinity; outline.forEach((p, k) => { const d = Math.abs(Math.atan2(Math.sin(Math.atan2(p[0], p[1]) - th), Math.cos(Math.atan2(p[0], p[1]) - th))); if (d < bd) { bd = d; best = k; } }); const rho = Math.min(.999, Math.hypot(x, z) / Math.hypot(...outline[best])); return [x, Y + height(x, z, rho, true), z]; };
        mesh(C, 'Carapace granules', m => {
            const count = C.save ? 150 : 110;
            for (let i = 0; i < count; i++) {
                const a = i * 2.399963, t = Math.sqrt((i + .5) / count) * .9, x = Math.sin(a) * W * t, z = Math.cos(a) * Lz * t;
                m.sphere(top(x, z), L * (.0022 + .0016 * hash(i)), c.main.map(v => v * 1.1 + .02), rigid(root), 4, 6, [1, .55, 1]);
            }
        }, { noSurfaceDetail: true });
        return { outline, top };
    }
    const hash = i => { const s = Math.sin(i * 127.1) * 43758.5453; return s - Math.floor(s); };
    const mix3 = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
    const ease = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const fbm = (x, y, o = 3) => { let s = 0, k = 1, n = 0; for (let i = 0; i < o; i++) { s += (Math.sin(x * k * 1.7 + i * 3.1 + Math.sin(y * k * 1.3)) * Math.cos(y * k * 1.9 - i * 1.7 + Math.cos(x * k * .7)) * .5 + .5) / k; n += 1 / k; k *= 2.1; } return s / n; };
    function crustacean(C) {
        const { r, L, Y, rootBone: root, headBone: head, colors: c } = C, lobster = r.kind === 'lobster', spiny = lobster && r.lobsterType === 'spinyLobster';
        const width = (lobster ? .15 : .28) * r.girth, depth = (lobster ? .12 : .16) * r.chestDepth, length = lobster ? .28 : .22;
        let shell = null;
        if (lobster) {
            ellipsoid(C, 'Body', [0, Y, 0], [L * width, L * depth, L * length], c.main, root, { roughness: .4 });
            mesh(C, 'Carapace rim and grooves', m => {
                for (const s of [-1, 1]) m.tube([[s * L * width * .85, Y + L * depth * .45, -L * .08], [s * L * width * .5, Y + L * depth * .85, L * .02], [s * L * .035, Y + L * depth * .98, L * .08]], L * .002, 6, c.mark, rigid(root));
                for (let i = 0; i < 90; i++) {
                    const a = i * 2.399963, t = Math.sqrt((i + .5) / 90) * .9, x = Math.cos(a) * width * t, z = Math.sin(a) * length * t;
                    const p = [L * x, Y + L * depth * Math.sqrt(1 - t * t), L * z];
                    if (spiny && i % 2) m.tube([sub(p, [0, L * .004, 0]), add(p, [0, L * .012, -L * .006])], [L * .0055, L * .0004], 6, c.main.map(v => v * 1.15), rigid(root));
                    else m.sphere(p, L * .0028, i % 3 ? c.main : c.mark, rigid(root), 4, 6, [1, .65, 1]);
                }
            });
        } else shell = crabShell(C, L * width, L * length, L * depth);
        const ground = lobster ? Y - L * (depth + .05) : Y - L * (depth * .42 + .055);
        const pairs = r.limbPairs;
        for (let pair = 0; pair < pairs; pair++) for (const s of [-1, 1]) {
            const u = pair / Math.max(1, pairs - 1), fan = 1 - 2 * u;
            const z = L * (lobster ? .16 - u * .30 : .12 - u * .25);
            // Crab legs root inside the measured outline at their own station.
            const near = shell ? shell.outline.filter(p => Math.abs(p[1] - z) < L * length * .1).reduce((m, p) => Math.max(m, Math.abs(p[0])), 0) : 0;
            const inset = lobster ? Math.sqrt(Math.max(.05, 1 - (z / (L * length)) ** 2 - (.025 / depth) ** 2)) * .85 : .72 * near / (L * width);
            const start = [s * L * width * inset, Y - L * depth * (lobster ? .3 : .22), z];
            const phase = pair * Math.PI + (s < 0 ? Math.PI : 0);
            if (pair === 0 && !spiny) {
                // Cheliped: merus and carpus, then the claw folded across the front (crab) or held forward (lobster).
                // A lobster's two claws are matched in size (only the fiddler crab keeps its one oversized claw).
                const big = r.crabType === 'fiddlerCrab' ? (s > 0 ? 2.1 : .6) : lobster ? 1.2 : 1;
                const knee = add(start, lobster ? [s * L * .09, L * .0, L * .13] : [s * L * .07, -L * .005, L * .11]);
                const wrist = add(knee, lobster ? [s * L * .05, L * .01, L * .11] : [s * L * .015, L * .01, L * .06]);
                const a = C.bone('Leg' + s + '_' + pair + '_0', root, start, knee, 'legUpper', phase), b = C.bone('Leg' + s + '_' + pair + '_1', a, knee, wrist, 'legLower', phase);
                C.bones[a].motionScale = .23; C.bones[b].motionScale = .3;
                mesh(C, 'Cheliped arm ' + s, m => {
                    flatSegment(m, [sub(start, [s * L * .01, 0, 0]), lerp(start, knee, .5), knee], [L * .026, L * .034 * Math.min(1.3, big), L * .028], .7, c.main, rigid(a), 12);
                    flatSegment(m, [lerp(knee, wrist, -.08), lerp(knee, wrist, .5), wrist], [L * .025, L * .03 * Math.min(1.3, big), L * .026], .75, c.main, rigid(b), 12);
                    for (let j = 1; j < 5; j++) { const q = add(lerp(start, knee, j / 5), [0, L * .03, 0]); m.tube([q, add(q, [0, L * .012, L * .004])], [L * .004, L * .0004], 5, c.main.map(v => v * 1.1), rigid(a)); }
                });
                const dir = lobster ? [s * .1, -.02, 1] : r.crabType === 'fiddlerCrab' && s > 0 ? [-s * .35, -.05, 1] : [-s * .8, -.08, .6];
                claw(C, s, wrist, b, big, dir); continue;
            }
            // Walking legs: merus rises to a high knee, carpus and propodus step down,
            // a pointed setose dactyl meets the ground.
            const reach = L * r.appendageLength * (lobster ? .28 : .36);
            const knee = add(start, [s * reach * .48, lobster ? L * .015 : L * .055, fan * reach * .32]);
            const foot = [knee[0] + s * reach * .42, ground, knee[2] + fan * reach * .34];
            const a = C.bone('Leg' + s + '_' + pair + '_0', root, start, knee, 'legUpper', phase);
            const b = C.bone('Leg' + s + '_' + pair + '_1', a, knee, foot, 'legLower', phase);
            C.bones[a].motionScale = .23; C.bones[b].motionScale = .3;
            const paddle = !lobster && r.crabType === 'blueCrab' && pair === pairs - 1, rr = L * (lobster ? .011 : .017);
            mesh(C, 'Leg ' + s + '/' + pair, m => {
                flatSegment(m, [sub(start, [s * rr, 0, 0]), lerp(start, knee, .12)], [rr * 1.3, rr * 1.25], .8, c.mark, rigid(a), 10);
                flatSegment(m, [lerp(start, knee, .08), lerp(start, knee, .55), lerp(knee, start, -.04)], [rr * 1.05, rr * 1.25, rr * .95], .55, c.main, rigid(a), 12);
                const carpus = lerp(knee, foot, .28), propodus = lerp(knee, foot, .72);
                flatSegment(m, [lerp(knee, foot, -.04), carpus], [rr * .9, rr * .85], .6, c.main.map(v => v * .92), rigid(b), 10);
                flatSegment(m, [lerp(knee, foot, .25), lerp(knee, foot, .5), propodus], [rr * .82, rr * .78, rr * .66], .6, c.main, rigid(b), 10);
                if (paddle) { const tipP = add(foot, [s * L * .04, L * .02, 0]); flatSegment(m, [propodus, lerp(propodus, tipP, .5), tipP], [rr * .7, L * .03, L * .006], .18, c.main, rigid(b), 12); }
                else m.tube([lerp(knee, foot, .7), lerp(knee, foot, .87), foot], [rr * .55, rr * .38, rr * .05], 8, c.dark.map((v, k) => v * .6 + c.main[k] * .4), rigid(b));
                for (let j = 1; j <= 5; j++) { const q = lerp(knee, foot, .72 + j * .045); for (const sd of [-1, 1]) m.tube([q, add(q, [sd * L * .004, L * .006, -L * .004])], [L * .0012, L * .0002], 4, c.light, rigid(b)); }
            });
        }
        for (let i = 0; i < r.eyeCount; i++) {
            const s = i % 2 ? -1 : 1, row = Math.floor(i / 2);
            const p = lobster ? [s * L * (.085 + row * .025), Y + L * .12 * r.headSize, L * .205] : [s * L * width * (.24 + row * .07), Y + L * depth * .95 * r.headSize, L * length * .98];
            const from = lobster ? [s * L * .07, Y + L * .015, L * .17] : [s * L * width * .19, Y + L * depth * .35, L * length * .78];
            tube(C, 'Eye stalk ' + i, [from, lerp(from, p, .6), p], [L * .012, L * .01, L * .008], c.main, root);
            ellipsoid(C, 'Eye ' + i, p, [L * .012 * r.eyeSize, L * .016 * r.eyeSize, L * .014 * r.eyeSize], mix3(c.dark, c.main, .25), root, { kind: 'eye', roughness: .2, facetSurface: true });
        }
        mesh(C, 'Mouthparts and folded abdomen', m => {
            // Maxillipeds close over the mouth; the crab's abdomen is a flap tucked under the sternum.
            for (const s of [-1, 1]) for (let j = 0; j < 3; j++) {
                const a = lobster ? [s * L * (.018 + j * .014), Y - L * .045, L * .18] : [s * L * (.012 + j * .012), Y - L * depth * .3, L * length * .78];
                flatSegment(m, [a, add(a, [s * L * .012, -L * .02, L * .03]), add(a, [-s * L * .008, -L * .028, L * .05])], [L * .009, L * .008, L * .003], .5, c.mark, rigid(head), 8);
            }
            if (!lobster) for (let j = 0; j < 5; j++) m.sphere([0, Y - L * depth * .43, -L * length * .55 + j * L * .03], 1, c.light, rigid(root), 5, 12, [L * (.075 - j * .009), L * .008, L * .02]);
        });
        antennae(C, L * (lobster ? .21 : length * .95), head, lobster ? (spiny ? 3.2 : 2.1) : .26);
        if (lobster) {
            let parent = root; const tail = [];
            for (let j = 0; j < 6; j++) {
                const z = -L * (.23 + j * .09 * r.tailLength), center = [0, Y - L * .012 * j, z];
                const b = C.bone('Tail segment ' + j, parent, center, add(center, [0, -L * .01, -L * .09]), 'tail'); parent = b; tail.push({ center, b });
                ellipsoid(C, 'Abdominal tergite ' + j, add(center, [0, L * .005, 0]), [L * (.125 - j * .011) * r.girth, L * .07 * r.chestDepth, L * .062 * r.tailLength], j % 2 ? c.main.map((v, k) => v * .85 + c.mark[k] * .15) : c.main, b, { roughness: .4 });
                // Pleura hang down each side of the tergite; swimmerets beneath.
                for (const s of [-1, 1]) {
                    ellipsoid(C, 'Pleuron ' + s + '/' + j, add(center, [s * L * (.1 - j * .009) * r.girth, -L * .035, -L * .005]), [L * .02, L * .04, L * .045 * r.tailLength], c.main.map(v => v * .9), b, { roughness: .45 });
                    tube(C, 'Swimmeret ' + s + '/' + j, [add(center, [s * L * .045, -L * .05, 0]), add(center, [s * L * .07, -L * .095, -L * .025])], [L * .009, L * .004], c.light, b);
                    if (j === 5) for (const lobe of [0, 1]) ellipsoid(C, (lobe ? 'Exopod ' : 'Uropod ') + s, add(center, [s * L * (.055 + lobe * .05), -L * .012, -L * (.095 + lobe * .01)]), [L * .042, L * .008, L * .1], lobe ? c.main : c.main.map((v, k) => v * .85 + c.mark[k] * .15), b, { roughness: .4 });
                }
                if (j === 5) ellipsoid(C, 'Telson', add(center, [0, -L * .012, -L * .11]), [L * .048, L * .01, L * .11], c.mark, b, { roughness: .4 });
            }
            mesh(C, 'Abdominal connecting membrane', m => {
                for (let j = 0; j < tail.length; j++) {
                    const a = j ? tail[j - 1] : { center: [0, Y, -L * .20], b: root }, b = tail[j];
                    m.tube([a.center, lerp(a.center, b.center, .5), b.center], [L * (.081 - j * .007) * r.girth, L * (.08 - j * .007) * r.girth, L * (.079 - j * .007) * r.girth], 16, c.mark, p => { const span = b.center[2] - a.center[2], t = Math.abs(span) > 1e-9 ? Math.max(0, Math.min(1, (p[2] - a.center[2]) / span)) : .5; return { joints: [a.b, b.b, 0, 0], weights: [1 - t, t, 0, 0] }; });// segments at one depth (shortest tail) share the joint evenly
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
