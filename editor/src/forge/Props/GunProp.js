/**
 * RRGunProp - Weapons › Firearms and Sci-fi: a gun from its parts and the
 * specs that change its look, saved holdable.
 *
 * Built in gun space: the bore along +x, the top up (+y), the grip down
 * at the rear; sides toward ±z. Every body piece is a side profile made
 * solid with a chamfer, so edges stay crisp; barrels, scopes and drums are
 * turned. The saved model lies on its side on the floor, centered, and
 * carries the runtime's gun markers (gripTop, gripBottom, muzzle, rear,
 * trigger, and foreGrip and stock where it has them) in model.json.
 */
(function(root) {
    'use strict';

    const need = (name, file) => root[name] || (typeof require === 'function' ? require(file) : null);
    const Rand = need('RRPropRandom', './PropRandom.js');
    const Mesh = need('RRPropMesh', './PropMesh.js');
    const Paint = need('RRPropPaint', './PropPaint.js');
    const CM=need('RRContainerMesh','./ContainerMesh.js');
    const Construction=need('RRGunConstruction','./GunConstruction.js'),Surface=need('RRConstructionSurface','../Character3D/ConstructionSurface.js');

    const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
    const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || '')) ? String(v).toLowerCase() : d);
    const pick = (v, list, d) => (list.includes(v) ? v : d);

    const MAGAZINES = [['box', 'Box magazine'], ['drum', 'Drum magazine'], ['cylinder', 'Revolver cylinder'], ['tube', 'Tube under the barrel'], ['cell', 'Energy cell'], ['none', 'None']];
    const STOCKS = [['none', 'None'], ['folding', 'Folding stock'], ['full', 'Full stock']];
    const SIGHTS = [['iron', 'Iron sights'], ['dot', 'Red dot'], ['scope', 'Telescopic sight'], ['none', 'None']];
    const MUZZLES = [['plain', 'Plain'], ['brake', 'Muzzle brake'], ['suppressor', 'Suppressor'], ['emitter', 'Emitter']];
    const FRAMES = [['gunmetal', 'Gunmetal'], ['polymer', 'Polymer'], ['chrome', 'Chrome'], ['painted', 'Painted panels']];
    const FURNITURE = [['polymer', 'Polymer'], ['wood', 'Wood'], ['painted', 'Painted']];
    const LOOK = {
        gunmetal: { color: '#3c3e43', roughness: 0.42, metalness: 0.8 }, polymer: { color: '#26272a', roughness: 0.75, metalness: 0 },
        chrome: { color: '#d4d8de', roughness: 0.12, metalness: 1 }, wood: { color: '#6e4426', roughness: 0.6, metalness: 0 }, painted: { color: null, roughness: 0.45, metalness: 0.25 }
    };

    const PRESETS = [
        ['pistol', 'Pistol', 'firearms', { barrel: { length: 0.11, thickness: 0.012 }, receiver: { length: 0.19, height: 0.034 }, magazine: 'none', magSize: 1, stock: 'none', sight: 'iron', grip: { angle: 18, length: 0.11 }, muzzle: 'plain', rails: false, frame: 'polymer', furniture: 'polymer', slide: true }],
        ['revolver', 'Revolver', 'firearms', { barrel: { length: 0.16, thickness: 0.016 }, receiver: { length: 0.14, height: 0.04 }, magazine: 'cylinder', magSize: 1, stock: 'none', sight: 'iron', grip: { angle: 28, length: 0.12 }, muzzle: 'plain', rails: false, frame: 'chrome', furniture: 'wood' }],
        ['rifle', 'Rifle', 'firearms', { barrel: { length: 0.5, thickness: 0.013 }, receiver: { length: 0.3, height: 0.06 }, magazine: 'box', magSize: 1.2, stock: 'full', sight: 'dot', grip: { angle: 22, length: 0.1 }, muzzle: 'brake', rails: true, frame: 'gunmetal', furniture: 'polymer', forend: true }],
        ['shotgun', 'Shotgun', 'firearms', { barrel: { length: 0.62, thickness: 0.02 }, receiver: { length: 0.24, height: 0.06 }, magazine: 'tube', magSize: 1, stock: 'full', sight: 'iron', grip: { angle: 30, length: 0.1 }, muzzle: 'plain', rails: false, frame: 'gunmetal', furniture: 'wood', forend: true }],
        ['smg', 'Submachine gun', 'firearms', { barrel: { length: 0.2, thickness: 0.012 }, receiver: { length: 0.26, height: 0.055 }, magazine: 'box', magSize: 1.4, stock: 'folding', sight: 'iron', grip: { angle: 14, length: 0.1 }, muzzle: 'suppressor', rails: true, frame: 'gunmetal', furniture: 'polymer' }],
        ['sniper', 'Sniper rifle', 'firearms', { barrel: { length: 0.8, thickness: 0.016 }, receiver: { length: 0.32, height: 0.06 }, magazine: 'box', magSize: 0.8, stock: 'full', sight: 'scope', grip: { angle: 24, length: 0.1 }, muzzle: 'brake', rails: true, frame: 'gunmetal', furniture: 'polymer', forend: true }],
        ['blasterPistol', 'Blaster pistol', 'scifi', { barrel: { length: 0.12, thickness: 0.02 }, receiver: { length: 0.2, height: 0.05 }, magazine: 'cell', magSize: 1, stock: 'none', sight: 'none', grip: { angle: 20, length: 0.11 }, muzzle: 'emitter', rails: false, frame: 'painted', furniture: 'painted', paint: '#d8dce4', coils: 3, vents: true, glow: '#38c8ff' }],
        ['blasterRifle', 'Blaster rifle', 'scifi', { barrel: { length: 0.42, thickness: 0.022 }, receiver: { length: 0.34, height: 0.07 }, magazine: 'cell', magSize: 1.2, stock: 'full', sight: 'dot', grip: { angle: 20, length: 0.1 }, muzzle: 'emitter', rails: true, frame: 'painted', furniture: 'painted', paint: '#3a3f4a', coils: 5, vents: true, glow: '#ff5a3a', forend: true }],
        ['plasma', 'Plasma cannon', 'scifi', { barrel: { length: 0.5, thickness: 0.05 }, receiver: { length: 0.42, height: 0.1 }, magazine: 'drum', magSize: 1.5, stock: 'none', sight: 'scope', grip: { angle: 10, length: 0.1 }, muzzle: 'emitter', rails: false, frame: 'painted', furniture: 'polymer', paint: '#5a6a3a', coils: 6, vents: true, glow: '#7aff6a', forend: true }],
        ['laser', 'Laser rifle', 'scifi', { barrel: { length: 0.55, thickness: 0.011 }, receiver: { length: 0.3, height: 0.055 }, magazine: 'cell', magSize: 0.9, stock: 'full', sight: 'scope', grip: { angle: 18, length: 0.1 }, muzzle: 'emitter', rails: false, frame: 'chrome', furniture: 'painted', paint: '#f0f0f2', coils: 2, vents: false, glow: '#c86aff' }]
    ];
    const PRESET_BY_ID = new Map(PRESETS.map(p => [p[0], p[3]]));

    function normalize(input) {
        const r = input && typeof input === 'object' ? input : {};
        const preset = pick(r.preset, PRESETS.map(p => p[0]), 'pistol'), base = PRESET_BY_ID.get(preset);
        const v = (key, d) => (r[key] !== undefined ? r[key] : base[key] !== undefined ? base[key] : d);
        const barrel = Object.assign({}, base.barrel, r.barrel || {}), receiver = Object.assign({}, base.receiver, r.receiver || {}), grip = Object.assign({}, base.grip, r.grip || {});
        return {
            kind: 'gun', preset,
            barrel: { length: clamp(barrel.length, 0.04, 1.2, 0.2), thickness: clamp(barrel.thickness, 0.006, 0.07, 0.014) },
            receiver: { length: clamp(receiver.length, 0.08, 0.7, 0.2), height: clamp(receiver.height, 0.025, 0.14, 0.05) },
            magazine: pick(v('magazine'), MAGAZINES.map(m => m[0]), 'box'), magSize: clamp(v('magSize', 1), 0.4, 2, 1),
            stock: pick(v('stock'), STOCKS.map(s => s[0]), 'none'), sight: pick(v('sight'), SIGHTS.map(s => s[0]), 'iron'),
            grip: { angle: clamp(grip.angle, 0, 40, 18), length: clamp(grip.length, 0.06, 0.16, 0.1) },
            muzzle: pick(v('muzzle'), MUZZLES.map(m => m[0]), 'plain'), rails: !!v('rails', false),
            frame: pick(v('frame'), FRAMES.map(f => f[0]), 'gunmetal'), furniture: pick(v('furniture'), FURNITURE.map(f => f[0]), 'polymer'),
            paint: color(v('paint', '#3a3f4a'), '#3a3f4a'), coils: Math.round(clamp(v('coils', 0), 0, 8, 0)), vents: !!v('vents', false),
            fasteners:r.fasteners!==false,gripRibs:Math.round(clamp(r.gripRibs,0,16,7)),
            glow: color(v('glow', '#38c8ff'), '#38c8ff'), slide: !!v('slide', false), forend: !!v('forend', false)
        };
    }

    // ── pieces ─────────────────────────────────────────────────────────────
    /** A side profile ([x, y, ...] in gun space) made solid `width` across, centered on z, its edges chamfered. */
    function slab(profile, width, chamfer) { return Mesh.extrude([profile], width, { bevel: chamfer ?? Math.min(width * 0.2, 0.003), round:true }); }
    const rect = (x0, y0, x1, y1) => [x0, y0, x1, y0, x1, y1, x0, y1];
    /** A barrel-like round along +x from `x0` to `x1` at height `y`. */
    const rod = (x0, x1, y, r, seg) => Mesh.lathe([[r, 0], [r, x1 - x0]], seg || 14, { base: [x0, y, 0], dir: [1, 0, 0] });

    function body(r) {
        const P = { frame: [], furniture: [], metal: [], glass: [], glow: [], dark: [] }, marks = {};
        const Lr = r.receiver.length, Hr = r.receiver.height, Lb = r.barrel.length, rb = r.barrel.thickness / 2;
        const W = Math.max(0.022, Hr * 0.55), xr0 = -Lr * 0.45, xr1 = Lr * 0.55, yb = Hr * 0.62;
        // The receiver: a long block, its top a little lower toward the front; a pistol's slide runs over the barrel.
        const front = r.slide ? xr1 + Lb * 0.85 : xr1;
        P.frame.push(slab([xr0, 0, front, 0, front, Hr * 0.92, xr1 - Lr * 0.1, Hr, xr0 + Lr * 0.05, Hr, xr0, Hr * 0.85], W));
        // The barrel out of its front, a muzzle at its end.
        const bx0 = front - 0.005, bx1 = (r.slide ? front + 0.008 : xr1 + Lb);
        const barrelLength=bx1-bx0,boreDepth=Math.min(.025,barrelLength*.7);
        P.metal.push(Mesh.lathe([[0,0],[rb,0],[rb,barrelLength],[rb*.58,barrelLength],[rb*.58,barrelLength-boreDepth],[0,barrelLength-boreDepth]],40,{base:[bx0,yb,0],dir:[1,0,0]}));
        const bore = Mesh.lathe([[rb * 0.55, 0], [rb * 0.55, 0.0015], [0, 0.0015]], 10, { base: [bx1 - boreDepth+.0002, yb, 0], dir: [1, 0, 0] });
        P.dark.push(bore);
        let mx = bx1;
        if (r.muzzle === 'brake') { P.metal.push(slab(rect(bx1, yb - rb * 1.6, bx1 + 0.05, yb + rb * 1.6), rb * 3.2, 0.002)); for (const k of [0.014, 0.028]) P.dark.push(Mesh.box([bx1 + k, yb, 0], [0.006, rb * 2.4, rb * 3.4])); mx = bx1 + 0.05; }
        else if (r.muzzle === 'suppressor') { P.metal.push(Mesh.lathe([[rb * 1.9, 0], [rb * 2.2, 0.01], [rb * 2.2, Lb * 0.6 + 0.08], [rb * 1.7, Lb * 0.6 + 0.09], [0, Lb * 0.6 + 0.09]], 16, { base: [bx1, yb, 0], dir: [1, 0, 0], sharp: 0.5 })); mx = bx1 + Lb * 0.6 + 0.09; }
        else if (r.muzzle === 'emitter') {
            P.metal.push(Mesh.lathe([[rb, 0], [rb * 1.9, 0.02], [rb * 2.2, 0.04], [rb * 1.8, 0.045], [rb * 1.2, 0.035]], 16, { base: [bx1, yb, 0], dir: [1, 0, 0], sharp: 0.5 }));
            P.glow.push(Mesh.lathe([[rb * 1.15, 0], [rb * 1.15, 0.03], [0, 0.031]], 16, { base: [bx1 + 0.008, yb, 0], dir: [1, 0, 0] }));
            mx = bx1 + 0.045;
        }
        marks.muzzle = [mx, yb, 0];
        // The grip, raked back by its angle, under the receiver's rear; the trigger and its guard ahead of it.
        const a = r.grip.angle * Math.PI / 180, gl = r.grip.length, gw = Math.min(0.03, W * 0.9), gx = xr0 + Lr * (r.stock === 'full' ? 0.18 : 0.12);
        const back = Math.tan(a) * gl, gd = 0.03;
        const gripGeo=new CM.Geo(),gripRing=t=>Array.from({length:33},(_,j)=>{const a=j/32*Math.PI*2,bulge=1+.12*Math.sin(t*Math.PI),x=Math.sign(Math.cos(a))*Math.abs(Math.cos(a))**.55,z=Math.sign(Math.sin(a))*Math.abs(Math.sin(a))**.55;return[gx+gd*.5-back*t+x*gd*.5*bulge,-gl*t,z*gw*.5];});
        let previous=gripRing(0);gripGeo.poly(previous.slice(0,-1),null,[0,1,0]);for(let k=1;k<=12;k++){const next=gripRing(k/12);for(let j=0;j<32;j++)gripGeo.poly([previous[j],next[j],next[j+1],previous[j+1]],null,[Math.cos((j+.5)/32*Math.PI*2),0,Math.sin((j+.5)/32*Math.PI*2)]);previous=next;}gripGeo.poly(previous.slice(0,-1),null,[0,-1,0]);P.furniture.push(CM.smoothNormals(gripGeo.done(),.8));
        // Fine construction stays on the actual receiver/grip surfaces.
        for(const side of [-1,1]){
            if(r.fasteners)for(const x of [xr0+Lr*.10,xr1-Lr*.10])for(const y of [Hr*.24,Hr*.74]){
                P.metal.push(Mesh.lathe([[Hr*.047,0],[Hr*.047,.0015],[0,.0015]],10,{base:[x,y,side*(W*.5+.0004)],dir:[0,0,side]}));
                P.dark.push(Mesh.box([x,y,side*(W*.5+.0021)],[Hr*.055,Hr*.009,.0006]));
            }
            P.dark.push(Mesh.box([xr0+Lr*.54,Hr*.63,side*(W*.5+.0006)],[Lr*.17,Hr*.17,.0013]));
            P.metal.push(Mesh.box([xr0+Lr*.54,Hr*.73,side*(W*.5+.0008)],[Lr*.19,Hr*.026,.0018]));
            for(let j=0;j<r.gripRibs;j++){const t=(j+1)/(r.gripRibs+1);P.dark.push(Mesh.box([gx+gd*.40-back*t,-gl*t,side*(gw*.5+.0004)],[gd*.70,.0016,.0014]));}
            if(r.slide)for(let j=0;j<7;j++)P.dark.push(Mesh.box([xr0+Lr*(.06+j*.026),Hr*.54,side*(W*.5+.0006)],[Lr*.010,Hr*.48,.0014]));
        }
        marks.gripTop = [gx + gd / 2, 0, 0]; marks.gripBottom = [gx + gd / 2 - back, -gl, 0];
        const tx = gx + gd + 0.018;
        P.metal.push(Mesh.polyTube([[gx + gd + 0.002, 0, 0], [tx + 0.022, -0.004, 0], [tx + 0.03, -0.022, 0], [tx + 0.012, -0.034, 0], [gx + gd - 0.006, -0.032, 0]], 0.0028, 6));
        P.dark.push(slab([tx, 0, tx + 0.006, 0, tx + 0.002, -0.018, tx - 0.003, -0.018], 0.006, 0.001));
        marks.trigger = [tx, -0.012, 0];
        let rear = [xr0, Hr * 0.5, 0];
        // The magazine.
        const ms = r.magSize, mxs = tx + 0.04;
        if (r.magazine === 'box') {
            const mh = 0.07 * ms + 0.03, md = 0.028 + 0.01 * ms, curve = Lb > 0.3 ? 0.03 * ms : 0;
            P.metal.push(slab([mxs, 0.004, mxs + md, 0.004, mxs + md + curve, -mh, mxs + curve, -mh], Math.min(W * 0.8, 0.026)));
        } else if (r.magazine === 'drum') {
            const R = 0.045 * ms + 0.02;
            P.metal.push(Mesh.lathe([[0, 0], [R, 0], [R * 1.04, 0.004], [R * 1.04, 0.05 * ms + 0.02], [R, 0.054 * ms + 0.024], [0, 0.054 * ms + 0.024]], 20, { base: [mxs + R * 0.6, -R * 0.85, -(0.027 * ms + 0.012)], dir: [0, 0, 1], sharp: 0.5 }));
        } else if (r.magazine === 'cylinder') {
            // Six chambers in a fluted cylinder above the trigger.
            const R = Math.max(Hr * 0.55, 0.018) * ms, len = Math.min(0.05, Lr * 0.35), cx = xr1 - len - 0.005;
            const prof = [[R * 0.85, 0], [R, 0.004], [R, len - 0.004], [R * 0.85, len]];
            const cyl=CM.revolve([[0,0],...prof,[0,len]],72,{radius:(t,y,rad)=>rad*(1-.045*Math.max(0,Math.cos(t*Math.PI*12))**4)});CM.transform(cyl,([x,y,z])=>[cx+y,yb+x,-z],([x,y,z])=>[y,x,-z]);
            P.metal.push(cyl);
            for (let k = 0; k < 6; k++) { const ang = k * Math.PI / 3; P.dark.push(Mesh.lathe([[R * 0.24, 0], [R * 0.24, 0.002], [0, 0.002]], 8, { base: [cx + len - 0.0005, yb + Math.cos(ang) * R * 0.55, Math.sin(ang) * R * 0.55], dir: [1, 0, 0] })); }
        } else if (r.magazine === 'tube') {
            P.metal.push(rod(xr1, xr1 + Lb * 0.8, yb - rb - 0.012, 0.009 * ms + 0.004, 12));
        } else if (r.magazine === 'cell') {
            // A glowing cell set in the receiver's side behind the grip line.
            P.frame.push(Mesh.lathe([[0.013 * ms, 0], [0.015 * ms, 0.004], [0.015 * ms, 0.05 * ms], [0.012 * ms, 0.054 * ms]], 12, { base: [xr0 + Lr * 0.45, Hr * 0.45, W / 2 - 0.002], dir: [0, 0, 1], sharp: 0.5 }));
            P.glow.push(Mesh.lathe([[0.01 * ms, 0], [0.01 * ms, 0.003]], 12, { base: [xr0 + Lr * 0.45, Hr * 0.45, W / 2 + 0.05 * ms], dir: [0, 0, 1] }));
        }
        // A forend under the barrel, for the off hand.
        if (r.forend) {
            // A handguard round the barrel, a little deeper below it, for the off hand.
            const f0 = xr1 + 0.004, f1 = xr1 + Math.min(Lb * 0.6, 0.36), t = yb + rb + 0.012, b2 = yb - rb - 0.03;
            P.furniture.push(slab([f0, b2 - 0.004, f1 - 0.012, b2, f1, b2 + 0.01, f1, t - 0.004, f1 - 0.008, t, f0, t], Math.max(0.03, rb * 3)));
            marks.foreGrip = [(f0 + f1) / 2, yb - rb - 0.018, 0];
        }
        // The stock.
        if (r.stock === 'full') {
            const s0 = xr0 + 0.004, s1 = xr0 - 0.26 - Lr * 0.15, top = Hr * 0.8;
            P.furniture.push(slab([s0, top, s0, Hr * 0.12, s1 + 0.04, -0.07, s1, -0.072, s1, top + 0.012, s1 + 0.06, top + 0.016], Math.min(0.04, W * 1.05)));
            P.dark.push(slab(rect(s1 - 0.012, -0.072, s1, top + 0.012), 0.042, 0.002));
            marks.stock = [s1 - 0.012, (top - 0.06) / 2, 0]; rear = marks.stock;
        } else if (r.stock === 'folding') {
            const s1 = xr0 - 0.22;
            for (const z of [-0.012, 0.012]) P.metal.push(Mesh.polyTube([[xr0, Hr * 0.7, z], [s1, Hr * 0.55, z], [s1, -0.05, z]], 0.004, 6));
            P.metal.push(slab(rect(s1 - 0.01, -0.06, s1 + 0.005, Hr * 0.65), 0.04, 0.002));
            marks.stock = [s1 - 0.01, Hr * 0.3 - 0.03, 0]; rear = marks.stock;
        }
        marks.rear = rear;
        // Sights, a rail along the top.
        const top = Hr;
        if (r.rails) for (let x = xr0 + 0.01; x < xr1 - 0.01; x += 0.012) P.dark.push(Mesh.box([x, top + 0.003, 0], [0.006, 0.006, Math.min(0.022, W)]));
        const sightBase = top + (r.rails ? 0.006 : 0);
        if (r.sight === 'iron') { P.metal.push(Mesh.box([xr0 + 0.012, sightBase + 0.006, 0], [0.008, 0.012, 0.014]), Mesh.box([(r.slide ? front : mx) - 0.012, (r.slide ? Hr : yb + rb) + 0.006, 0], [0.004, 0.012, 0.004])); }
        else if (r.sight === 'dot') { P.metal.push(slab(rect(xr0 + Lr * 0.3, sightBase, xr0 + Lr * 0.3 + 0.05, sightBase + 0.032), 0.03, 0.004)); P.glass.push(Mesh.box([xr0 + Lr * 0.3 + 0.025, sightBase + 0.02, 0], [0.002, 0.018, 0.022])); }
        else if (r.sight === 'scope') {
            const sr = 0.014 + Lb * 0.012, sl = 0.14 + Lb * 0.18, sx = xr0 + Lr * 0.15, sy = sightBase + sr + 0.016;
            P.metal.push(Mesh.lathe([[sr * 1.35, 0], [sr * 1.35, 0.03], [sr, 0.05], [sr, sl - 0.05], [sr * 1.6, sl - 0.02], [sr * 1.6, sl]], 16, { base: [sx, sy, 0], dir: [1, 0, 0], sharp: 0.5 }));
            for (const k of [0.25, 0.7]) P.metal.push(Mesh.box([sx + sl * k, sightBase + 0.008, 0], [0.012, 0.018, 0.016]));
            P.glass.push(Mesh.lathe([[sr * 1.5, 0], [0, 0.001]], 16, { base: [sx + sl, sy, 0], dir: [1, 0, 0] }), Mesh.lathe([[sr * 1.25, 0], [0, 0.001]], 16, { base: [sx, sy, 0], dir: [-1, 0, 0] }));
        }
        // Sci-fi: glowing coils round the barrel, vents in the receiver's sides.
        if(r.coils)P.dark.push(rod(xr1+.006,xr1+Math.max(.02,Lb-.015),yb,rb*1.40,20));
        for (let k = 0; k < r.coils; k++) {
            const x = xr1 + 0.015 + k * Math.max(0.012, (Lb - 0.04) / Math.max(1, r.coils));
            const pts = [];
            for (let s = 0; s <= 16; s++) { const ang = s / 16 * Math.PI * 2; pts.push([x, yb + Math.cos(ang) * rb * 1.6, Math.sin(ang) * rb * 1.6]); }
            P.glow.push(Mesh.polyTube(pts, Math.max(0.0018, rb * 0.25), 5));
        }
        if (r.vents) for (let k = 0; k < 4; k++) for (const z of [-1, 1]) P.dark.push(Mesh.box([xr0 + Lr * (0.45 + k * 0.1), Hr * 0.55, z * W / 2], [0.006, Hr * 0.35, 0.003]));
        const construction=Construction.assemble({recipe:r,r,P,marks,W,xr0,xr1,Lr,Hr,Lb,rb,yb,gx,gd,gw,back,gl,mxs});
        return { P, marks, W, construction };
    }

    // ── the build ──────────────────────────────────────────────────────────
    const rigid = mesh => {
        const n = mesh.positions.length / 3, w = new Float32Array(n * 4);
        for (let i = 0; i < w.length; i += 4) w[i] = 1;
        return Object.assign(mesh, { joints: new Uint16Array(n * 4), weights: w });
    };
    /** Gun space to the world: on its side on the floor, its top away from the viewer. */
    const toWorld = ([x, y, z]) => [x, z, -y];

    function build(recipe, cache) {
        const r = normalize(recipe), c = cache || {}, { P, marks, construction } = body(r), textures = {};
        const frame = LOOK[r.frame], furn = LOOK[r.furniture];
        const parts = [];
        const add = (list, props) => { const m = list.length ? Mesh.merge(list) : null; if (m && m.index.length) parts.push(Object.assign(m, props)); return m; };
        add(P.frame, { name: 'Frame', kind: 'metal', color: frame.color || r.paint, roughness: frame.roughness, metalness: frame.metalness });
        const furniture = add(P.furniture, { name: 'Furniture', kind: 'prop', color: r.furniture === 'painted' ? r.paint : furn.color, roughness: furn.roughness, metalness: furn.metalness });
        if (furniture && r.furniture === 'wood') {
            if (!c.wood) c.wood = Paint.wood('#7a4a28', 21);
            textures['wood.png'] = c.wood; furniture.texture = 'wood.png'; Mesh.planarUv(furniture, 0.25);
        }
        add(P.metal, { name: 'Metal', kind: 'metal', color: r.frame === 'chrome' ? '#d4d8de' : '#2e3034', roughness: r.frame === 'chrome' ? 0.12 : 0.38, metalness: 0.85 });
        add(P.dark, { name: 'Details', kind: 'metal', color: '#141416', roughness: 0.5, metalness: 0.5 });
        add(P.glass, { name: 'Lens', kind: 'glass', color: '#3a5a7a', roughness: 0.05, metalness: 0.2 });
        add(P.glow, { name: 'Glow', kind: 'prop', color: r.glow, roughness: 0.3, metalness: 0, emissive: r.glow });
        Surface.apply(parts,textures,p=>['Frame','Metal','Details'].includes(p.name)?'metal':p.name==='Furniture'?(r.furniture==='wood'?'wood':'rubber'):null);
        for (const p of parts) Mesh.transform(p, toWorld, toWorld);
        let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (const p of parts) for (let i = 0; i < p.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p.positions[i + k]); hi[k] = Math.max(hi[k], p.positions[i + k]); }
        const shift = [-(lo[0] + hi[0]) / 2, -lo[1], -(lo[2] + hi[2]) / 2], move = p => [p[0] + shift[0], p[1] + shift[1], p[2] + shift[2]];
        for (const p of parts) { Mesh.transform(p, move); Object.assign(p, rigid(p)); Mesh.shade(p); }
        const round = v => Math.round(v * 10000) / 10000, markers = {};
        for (const [k, v] of Object.entries(marks)) markers[k] = move(toWorld(v)).map(round);
        let tall = 0;
        for (const p of parts) for (let i = 1; i < p.positions.length; i += 3) tall = Math.max(tall, p.positions[i]);
        return {
            kind: 'gun', recipe: r, construction, parts, bones: [{ name: 'Prop', head: [0, 0, 0], parent: -1 }], clips: [], loop: null, textures, cloth: null,
            height: Math.max(0.05, tall), wall: null, length: round(hi[0] - lo[0]), markers, sidecarExtra: { rig: { template: 'gun', markers } }, holdable: 'gun'
        };
    }

    /**
     * A random firearm of one family (its own when only the shape or details
     * roll): sizes a little off its preset; details swap muzzle, sight, stock,
     * rails and magazine where the family allows; colors the frame, furniture, paint and glow.
     */
    function random(seed, recipe, scope) {
        const R = Rand.roll(seed), cur = normalize(recipe), out = JSON.parse(JSON.stringify(cur)), has = part => Rand.covers(scope, part);
        const family = !scope || scope === 'all' ? R.pick(PRESETS) : PRESETS.find(p => p[0] === cur.preset);
        const base = family[3], scifi = family[2] === 'scifi', long = base.stock !== 'none' || base.barrel.length > 0.3;
        out.preset = family[0];
        if (has('shape')) {
            out.barrel = { length: R.jitter(base.barrel.length, 0.15, 0.04, 1.2), thickness: R.jitter(base.barrel.thickness, 0.12, 0.006, 0.07) };
            out.receiver = { length: R.jitter(base.receiver.length, 0.12, 0.08, 0.7), height: R.jitter(base.receiver.height, 0.12, 0.025, 0.14) };
            out.grip = { angle: Math.max(0, Math.min(40, base.grip.angle + R.range(-5, 5))), length: R.jitter(base.grip.length, 0.1, 0.06, 0.16) };
            out.magSize = R.jitter(base.magSize || 1, 0.2, 0.4, 2);
        }
        if (has('details')) {
            const keep = (key, d) => (base[key] !== undefined ? base[key] : d);
            out.muzzle = scifi ? 'emitter' : R.chance(0.35) ? R.pick(['plain', 'brake', 'suppressor']) : keep('muzzle', 'plain');
            out.sight = R.chance(0.35) ? R.pick(long ? ['iron', 'dot', 'scope'] : ['iron', 'dot', 'none']) : keep('sight', 'iron');
            out.rails = long ? R.chance(0.6) : R.chance(0.2);
            out.stock = base.stock === 'none' ? 'none' : R.chance(0.25) ? R.pick(['folding', 'full']) : base.stock;
            out.magazine = base.magazine === 'cylinder' || base.magazine === 'tube' || base.magazine === 'none' ? base.magazine : scifi ? R.pick(['cell', 'cell', 'drum']) : R.chance(0.2) ? 'drum' : base.magazine;
            if (scifi) { out.coils = Math.max(0, Math.min(8, (base.coils || 0) + R.int(-1, 2))); out.vents = R.chance(0.7); }
            out.forend = long ? R.chance(0.7) : !!base.forend;
        }
        if (has('colors')) {
            if (scifi) { out.frame = R.weighted([['painted', 4], ['chrome', 1], ['gunmetal', 1]]); out.furniture = R.pick(['painted', 'polymer']); out.paint = R.pick(Rand.PALETTES.paint); out.glow = R.pick(Rand.PALETTES.glow); }
            else { out.frame = R.weighted([['gunmetal', 4], ['polymer', base.frame === 'polymer' ? 3 : 1], ['chrome', family[0] === 'revolver' ? 2 : 0.4], ['painted', 0.6]]); out.furniture = R.weighted([['polymer', 3], ['wood', long || family[0] === 'revolver' ? 2.5 : 0.5], ['painted', 0.5]]); out.paint = R.pick(['#5a6a3a', '#3a3f4a', '#7a6a4a', '#1b1b1f', '#8a8a7a']); }
        }
        return normalize(out);
    }

    const api = { MAGAZINES, STOCKS, SIGHTS, MUZZLES, FRAMES, FURNITURE, PRESETS, normalize, build, random };
    root.RRGunProp = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const Model = root.RRPropModel, Catalog = root.RRPropCatalog || (typeof require === 'function' ? require('./PropCatalog.js') : null);
    if (Model && Model.register) Model.register({ id: 'gun', label: 'Firearm', normalize, build, random, randomScopes: [Rand.SCOPES.all, Rand.SCOPES.shape, Rand.SCOPES.details, Rand.SCOPES.colors] });
    if (Catalog) {
        const icon = { pistol: 'pistol', revolver: 'pistol', rifle: 'rifle', shotgun: 'shotgun', smg: 'rifle', sniper: 'rifle', blasterPistol: 'blaster', blasterRifle: 'blaster', plasma: 'cannon', laser: 'blaster' };
        for (const [id, label, category] of PRESETS) Catalog.add({ id: 'gun-' + id, category, label, icon: icon[id], kind: 'gun', keywords: 'gun weapon firearm ranged ' + id, start: () => normalize({ preset: id }), matches: r => r.preset === id });
        Catalog.ui('gun', {
            placeholder: 'Firearm',
            tabs: [['body', 'Body'], ['parts', 'Parts'], ['look', 'Look']],
            reset: recipe => normalize({ preset: recipe.preset }),
            panel(tab) {
                const r = this.recipe;
                if (tab === 'body') {
                    return this._section('Barrel') + this._slider({ path: 'barrel.length', label: 'Length', range: [0.04, 1.2], step: 0.01, format: 'm' })
                        + this._slider({ path: 'barrel.thickness', label: 'Thickness', range: [0.006, 0.07], step: 0.001, format: 'm' }) + this._select('muzzle', 'Muzzle', MUZZLES)
                        + this._section('Receiver') + this._slider({ path: 'receiver.length', label: 'Length', range: [0.08, 0.7], step: 0.01, format: 'm' })
                        + this._slider({ path: 'receiver.height', label: 'Height', range: [0.025, 0.14], step: 0.002, format: 'm' })
                        + this._section('Grip') + this._slider({ path: 'grip.angle', label: 'Angle', range: [0, 40], step: 1, format: 'deg' }) + this._slider({ path: 'grip.length', label: 'Length', range: [0.06, 0.16], step: 0.005, format: 'm' });
                }
                if (tab === 'parts') {
                    return this._section('Parts') + this._select('magazine', 'Magazine', MAGAZINES) + (r.magazine !== 'none' ? this._slider({ path: 'magSize', label: 'Magazine size', range: [0.4, 2], format: 'x' }) : '')
                        + this._check('fasteners','Fasteners') + this._slider({path:'gripRibs',label:'Grip ribs',range:[0,16],step:1}) + this._select('stock', 'Stock', STOCKS) + this._select('sight', 'Sight', SIGHTS) + this._check('rails', 'Rails') + this._check('forend', 'Forend')
                        + this._section('Sci-fi') + this._slider({ path: 'coils', label: 'Glowing coils', range: [0, 8], step: 1, format: 'int' }) + this._check('vents', 'Vents');
                }
                return this._section('Materials') + this._select('frame', 'Body finish', FRAMES) + this._select('furniture', 'Grip and stock', FURNITURE)
                    + (r.frame === 'painted' || r.furniture === 'painted' ? this._color('paint', 'Paint', ['#d8dce4', '#3a3f4a', '#5a6a3a', '#7a2a22', '#1b1b1f']) : '')
                    + (r.coils>0||r.muzzle==='emitter'||r.magazine==='cell'?this._color('glow', 'Glow color', ['#38c8ff', '#ff5a3a', '#7aff6a', '#c86aff', '#ffd24a']):'');
            }
        });
    }
})(typeof window !== 'undefined' ? window : globalThis);
