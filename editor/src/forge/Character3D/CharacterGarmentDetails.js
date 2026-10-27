/**
 * RRCharacterGarmentDetails - sewn construction for procedural clothing, fitted to each garment's
 * actual (laid and draped) surface triangles. No reference mesh, UV layout or texture is copied.
 *
 * The construction kit (construct): lapels and collars, plackets and buttons, cuffs, waistbands
 * with loops, flies, pockets and flaps, coat belts with buckles and keepers, epaulettes, cuff
 * straps, rib bands, drawstrings, linings; seams sunk as grooves and top-stitching as thread.
 * RRCharacterWardrobe.build calls build() after every soft piece is laid, draped, overlaid and
 * joined, so details sit on the final cloth.
 *
 * A garment opts in with data on its catalog entry (RRCharacterWardrobe GARMENTS), no code:
 *   details: [ { id, label, choices: [[value, label], ...], default } ,
 *              { id, label, toggle: true, default } ]
 *       the few choices its Outfit card shows; each is a key of its own on the outfit item,
 *       saved with it (RRCharacterWardrobe.detailsOf resolves them with their defaults).
 *   construction: { parts: [ ... ], tailored, ... }
 *       `parts` are generic details, each { kind, when, face, piece, mirror, ... }:
 *         when    a detail id (or another item key, a style) that turns it on (a toggle, or a
 *                 choice that is not 'none'; [id, value] for one value); face 1 front, -1 back; piece 'skirt' for a
 *                 garment's skirt piece; mirror (default true) both sides of the center
 *         s, x    where: a spine position (RRCharacterWardrobe header: navel 1, waist 1.2,
 *                 bust 2.8, neck 3.95) and meters from the center line (on a 1.7 m body)
 *       kinds:  patchPocket { s, x, w, h, flap, button, buttonColor }
 *               weltPocket  { s, x, w, lip }
 *               buttons     { at: [[s, x], ...], radius, color, holes, metal }
 *               toggles     { at: [[s, x], ...], length, radius, color }   (wooden toggles)
 *               rivets      { at: [[s, x], ...], radius, color, open }      (eyelets when open)
 *               strap       { from: [s, x], to: [s, x], width, button, color, buttonColor }
 *               epaulettes  { width, color, buttonColor }
 *               belt        { s, width, thickness, color (none: the garment's own cloth),
 *                             buckle, keepers, tail }
 *               placket     { width, to (spine position), buttons, radius, buttonColor, yoke, cuffs }
 *               ribBands    { neck, cuffs, hem }   (widths in meters)
 *               drawstrings {}  pouch {}           (a hoodie's cords and kangaroo pocket)
 *               seam        { path: [[s, x], ...], rows, thread, groove }
 *               lining      { on: 'sleeves' | 'neck', color, reach }
 *               cuffs       { width, buttonColor }                 (buttoned cuffs on long sleeves)
 *               frontPlacket { width, buttons, from, to, radius, buttonColor }  (an open front's button bands)
 *               pocketFlaps { pockets: [index, ...], h, point, button } (flaps over the garment's own
 *                             catalog `pockets`, placed by their rest height y and bearing ang)
 *               stormFlap   { side, x, s, w, h }   throatLatch { s, width, over }
 *       `tailored` and its measures (breakS, gorge, lapelWidth, fall, stand, leaf, buttons,
 *       pocketS/X/W/H, flapH, chestWelt, sleeveButtons, vent, facingKind) cut a jacket's or a
 *       coat's lapels, collar, pockets and buttons to its V front (RRCharacterWardrobe vFront).
 *   A `collar` piece ({ open, stand, fall, point, gap }) gets a stand-and-fall collar.
 *
 * Every construction vertex is bound to a garment triangle (barycentric) with an offset in its
 * frame (`detailAnchors` on the part, 10 numbers a vertex: entry, three corners, three weights,
 * offset along the cloth's up, across and out); follow(parts, entries) re-seats them on cloth
 * that moved. They carry `sewnRefs`/`sewnRoots` (the cloth rig moves them with their fabric
 * vertex) and their garment's skin. Parts: cloth by fabric tile (RRCharacterFabric), 'Garment
 * buttons', 'Garment hardware' (metal), 'Garment seams' and 'Top-stitching' (this file's own
 * cut-out tiles, pictures() lists them). Wear (grime, fray) may darken their vertex `colors`:
 * every construction part keeps its colors (`keepColors` where it is textured).
 */
(function(root) {
    'use strict';
    const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null);
    const Props=need('RRCharacterProps','./CharacterProps.js'),O=need('RRCharacterOutfit','./CharacterOutfit.js');
    const {add,sub,mul,norm,cross,dot}=Props.vec;
    const TECH=new Set(['starshipUniform','officerJacket','techSuit','explorerSuit','evaSuit','spacesuit','bodysuit']);
    const COATS=new Set(['fieldCoat','tacvest']);

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

    /** Joint folds are part of every soft garment's own cut and fold field
     * (RRCharacterOutfit.foldAt): compression at the elbow and knee, drag
     * from the armpit and crotch, stacking over cuffs and hems, hanging
     * flutes. Nothing is added afterwards (a second pass doubled the officer
     * jacket's and cargo trousers' folds). Kept for callers. */
    function tailor(entries,built){}

    function build(pack,built,entries) {
        const mesh=new Props.Mesh(),hardware=new Props.Mesh(),scale=built.height/1.7;
        const tube=(samples,radius,color,sides=6)=>{
            for(let i=0;i+1<samples.length;i++){
                const a=samples[i],b=samples[i+1];if(!a||!b||Math.hypot(...sub(a.p,b.p))>scale*.08)continue;
                const tangent=norm(sub(b.p,a.p));if(Math.hypot(...sub(a.p,b.p))<1e-6)continue;
                const rows=[a,b].map(s=>{
                    const x=norm(sub(s.n,mul(tangent,dot(s.n,tangent)))),y=cross(tangent,x),center=add(s.p,mul(s.n,radius*1.35));
                    return Array.from({length:sides},(_,k)=>{const angle=k*2*Math.PI/sides,n=add(mul(x,Math.cos(angle)),mul(y,Math.sin(angle)));return mesh.vertex(add(center,mul(n,radius)),n,color,s.skin);});
                });
                for(let k=0;k<sides;k++){const j=(k+1)%sides;mesh.tri(rows[0][k],rows[0][j],rows[1][k]);mesh.tri(rows[0][j],rows[1][j],rows[1][k]);}
            }
        };
        for(const e of entries){
            if(e.garment==='cargoTrousers'&&!e.lining&&!construct){
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
            // (A starship uniform's yoke is its own color block, cut and piped in its cloth: a sewn-on yoke over it
            // stood off the chest as a loose flap.)
            if(TECH.has(e.garment)&&e.garment!=='starshipUniform')for(const side of [1,-1]){
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
                // Suits: a sewn-on rubberized waist band (front and back) between piped edges, and on the back a
                // pair of curved panel seams mirroring the front's, so the suit reads as built from panels all round.
                // (Not the EVA undersuit: its crew wear a harness over the waist, and it already carries pressure panels.)
                if(e.garment==='spacesuit'||e.garment==='explorerSuit'){
                    const W=.42,K=22,y0=.985,y1=1.022,bandColor=O.linear(e.look.trim||e.look.color2||e.look.color).map(c=>c*.9),bandRows=[];
                    // Rolled edges and a raised middle: four rows, the outer two tucked back toward the cloth.
                    for(const [j,lift] of [[0,.0012],[.12,.0036],[.5,.0042],[.88,.0036],[1,.0012]]){const row=[];for(let k=0;k<=K;k++){const x=(k/K-.5)*W,p=fit(x,y0+(y1-y0)*j);row.push(p?mesh.vertex(add(p.p,mul(p.n,lift*scale)),p.n,j===.5?bandColor:bandColor.map(c=>c*.8),p.skin):-1);}bandRows.push(row);}
                    for(let j=0;j+1<bandRows.length;j++)for(let k=0;k<K;k++){const [a,b,c,d]=[bandRows[j][k],bandRows[j][k+1],bandRows[j+1][k],bandRows[j+1][k+1]];if(Math.min(a,b,c,d)<0)continue;if(side>0){mesh.tri(a,b,c);mesh.tri(b,d,c);}else{mesh.tri(a,c,b);mesh.tri(b,c,d);}}
                    if(side<0)for(const sx of [-1,1])tube(Array.from({length:17},(_,k)=>{const t=k/16;return fit(sx*(.1+.06*t*t),1.03+.31*t);}),.0012*scale,trim);
                }
            }
            // A real zipped closure and two curved torso seams. Their width
            // stays in millimeters instead of consuming a larger color atlas.
            const zip=e.garment==='fieldCoat'?.040:0;
            for(const side of [-1,1]){
                path([[zip+side*.003,1.00],[zip+side*.003,1.365]],.0010,trim);
                // (A starship uniform's and a bodysuit's panel seams are sewn in their cloth's own picture, level and mirrored.)
                if(e.garment!=='starshipUniform'&&e.garment!=='bodysuit')path([[side*.115,1.02],[side*.095,1.16],[side*.145,1.29],[side*.17,1.345]],.0010);
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
                        if(hits.length===2)tube(hits,.0015*scale,main.map(v=>v*.36),4);
                    }
                }
            }
        }
        // A garment's cloth cut at one spine position of a family (fam, s from its field): crossing segments.
        const levelOn=(L,fam,at)=>{const hits=[];
            for(let t=0;t<L.index.length;t+=3){
                const ids=Array.from(L.index.subarray(t,t+3));if(ids.some(v=>L.field[v]?.fam!==fam))continue;
                const values=ids.map(v=>L.field[v].s-at),seg=[];
                for(let k=0;k<3;k++){const n=(k+1)%3;if((values[k]<0)===(values[n]<0))continue;const u=values[k]/(values[k]-values[n]),bary=[0,0,0];bary[k]=1-u;bary[n]=u;seg.push(point(L,ids,bary));}
                if(seg.length===2)hits.push(seg);
            }return hits;};
        // That level as one closed ring of N points by bearing about an axis through center (k=0 at bearing -pi
        // from x=axis x [0,1,0] or [1,0,0]); null where the cloth does not go all the way round.
        const ringOn=(L,fam,at,axis,center,N)=>{
            const segs=levelOn(L,fam,at);if(segs.length<6)return null;
            const x=norm(cross(axis,Math.abs(axis[1])<.9?[0,1,0]:[1,0,0])),y=cross(axis,x);
            const ang=p=>{const q=sub(p,center);return Math.atan2(dot(q,y),dot(q,x));};
            const out=[];
            for(let k=0;k<N;k++){const a=-Math.PI+2*Math.PI*k/N;let best=null;
                for(const [A,B] of segs){let a0=ang(A.p),a1=ang(B.p),d=a1-a0;if(d>Math.PI)d-=2*Math.PI;if(d<-Math.PI)d+=2*Math.PI;let u=a-a0;if(u>Math.PI)u-=2*Math.PI;if(u<-Math.PI)u+=2*Math.PI;
                    const t=Math.abs(d)<1e-9?0:u/d;if(t<-.001||t>1.001)continue;const p=add(A.p,mul(sub(B.p,A.p),t)),r=Math.hypot(...sub(p,center));
                    if(!best||r>best.r)best={r,p,n:norm(add(mul(A.n,1-t),mul(B.n,t))),skin:t<.5?A.skin:B.skin,dir:add(mul(x,Math.cos(a)),mul(y,Math.sin(a)))};}
                if(!best)return null;out.push(best);}
            return out;};
        // The spine position of a family's cloth nearest a point.
        const sNear=(L,fam,p)=>{let best=Infinity,s=null;for(let v=0;v<L.positions.length/3;v++){if(L.field[v]?.fam!==fam)continue;const d=(L.positions[v*3]-p[0])**2+(L.positions[v*3+1]-p[1])**2+(L.positions[v*3+2]-p[2])**2;if(d<best){best=d;s=L.field[v].s;}}return s;};
        const grid=(target,rows,color,lifts,cols=null)=>{const ids=rows.map((row,r)=>row.map((q,c)=>target.vertex(add(q.p,mul(q.n,(typeof lifts==='function'?lifts(r,c):lifts[r])*scale)),q.n,Array.isArray(color[0])?color[r]:color,q.skin)));
            for(let r=0;r+1<ids.length;r++)for(let c=0;c+1<ids[r].length;c++){target.tri(ids[r][c],ids[r+1][c],ids[r][c+1]);target.tri(ids[r][c+1],ids[r+1][c],ids[r+1][c+1]);}};
        // Suit gloves: a gauntlet cuff lapped over the sleeve (a rolled rubber band in the suit's trim, an ID stripe
        // in its accent) and, on a pressure suit, a hard wrist disconnect ring below it, so the glove reads as its own piece.
        const rings=new Props.Mesh();
        {
            const glove=entries.find(x=>!x.lining&&(x.garment==='gloves'||(x.garment==='techGloves'&&x.look?.style==='full')));
            // Suits with full gloves: the pressure, exploration and flight suits, and an armored compression suit under full tech gloves.
            const suit=entries.find(x=>!x.lining&&(['evaSuit','spacesuit','explorerSuit','bodysuit','techSuit'].includes(x.garment)||(x.garment==='compressionSuit'&&glove?.garment==='techGloves')));
            if(suit&&glove&&glove.laid?.field){
                const L=glove.laid,pressure=suit.garment==='evaSuit'||suit.garment==='spacesuit';
                const band=O.linear(suit.look.trim||suit.look.color2||'#303b47'),stripe=O.linear(suit.look.color2||suit.look.trim||'#d86a2a'),steel=O.linear('#aeb4ba');
                const level=(fam,at)=>levelOn(L,fam,at), N=20, ringAt=(fam,at,axis,center)=>ringOn(L,fam,at,axis,center,N);
                for(const [fam,side] of [[1,'Left'],[2,'Right']]){
                    let s0=Infinity;for(let v=0;v<L.positions.length/3;v++)if(L.field[v]?.fam===fam)s0=Math.min(s0,L.field[v].s);
                    if(!Number.isFinite(s0)||s0>3.05)continue;
                    const fa=built.bones.find(b=>b.name===side+'ForeArm'),hb=built.bones.find(b=>b.name===side+'Hand');if(!fa||!hb)continue;
                    const axis=norm(sub(hb.head,fa.head));
                    // The cuff's profile from its open edge (toward the elbow) down: a rolled lip, a raised band with an ID
                    // stripe (hard color edges from doubled rows), and a taper back onto the glove.
                    const prof=[[0,.0012,band],[.006,.0042,band],[.03,.0046,band],[.03,.0046,stripe],[.046,.0046,stripe],[.046,.0046,band],[.07,.004,band],[.082,.0008,band]];
                    const at=ds=>s0+ds, mid=hb.head.map((c,k)=>fa.head[k]+(c-fa.head[k])*.8);
                    // Sampled just in from the glove's own cut edge, where its ring is whole.
                    const rowsR=prof.map(([ds])=>ringAt(fam,at(ds+.012),axis,mid));
                    if(rowsR.every(Boolean)){
                    const ids=prof.map(([ds,lift,color],r)=>rowsR[r].map(q=>mesh.vertex(add(q.p,mul(q.n,lift*scale)),q.n,color,q.skin)));
                    for(let r=0;r+1<ids.length;r++)for(let k=0;k<N;k++){const j2=(k+1)%N;mesh.tri(ids[r][k],ids[r+1][k],ids[r][j2]);mesh.tri(ids[r][j2],ids[r+1][k],ids[r+1][j2]);}
                    // The cuff's open edge closes down onto the sleeve a little up the arm, a tapered skirt over the
                    // glove's cut edge: no opening between glove and sleeve from any side, inside the wrist included.
                    const sleeve=suit.laid?.field&&ringOn(suit.laid,fam,s0-.025,axis,mid,N);
                    if(sleeve){const skirt=sleeve.map(q=>mesh.vertex(add(q.p,mul(q.n,.0009*scale)),q.n,band.map(c=>c*.85),q.skin));
                        for(let k=0;k<N;k++){const j2=(k+1)%N;mesh.tri(skirt[k],ids[0][k],skirt[j2]);mesh.tri(skirt[j2],ids[0][k],ids[0][j2]);}}}
                    // The disconnect ring: a hard bearing at the wrist, below the cuff.
                    if(pressure){const R=ringAt(fam,Math.min(2.95,s0+.11),axis,mid);if(R){
                        const sec=[[.0004,-.004],[.0045,-.0035],[.0052,0],[.0045,.0035],[.0004,.004]];
                        const rr=sec.map(([lift,dz])=>R.map(q=>rings.vertex(add(add(q.p,mul(q.n,lift*scale)),mul(axis,dz*scale)),q.n,steel,q.skin)));
                        for(let r=0;r+1<rr.length;r++)for(let k=0;k<N;k++){const j2=(k+1)%N;rings.tri(rr[r][k],rr[r+1][k],rr[r][j2]);rings.tri(rr[r][j2],rr[r+1][k],rr[r+1][j2]);}}}
                }
            }
        }
        // Suits: formed pads over the knees and elbows, a neck bearing (pressure suits) or a stand-up collar, and a
        // patch high on the left sleeve, in colors that block against the suit (dark rubber on a light suit, the
        // accent on a dark one), so each suit reads as designed equipment at full-body distance.
        {
            const suit=entries.find(x=>!x.lining&&['evaSuit','spacesuit','explorerSuit','bodysuit'].includes(x.garment));
            if(suit&&suit.laid?.field){
                const L=suit.laid,look=suit.look,main=O.linear(look.color||'#dddddd'),lum=.2126*main[0]+.7152*main[1]+.0722*main[2];
                const lumOf=c=>.2126*c[0]+.7152*c[1]+.0722*c[2],trim0=O.linear(look.trim||'#303b47'),accent=O.linear(look.color2||look.trim||'#d86a2a'),dark=lumOf(trim0)>.15?O.linear('#2b3138'):trim0,pressure=suit.garment==='evaSuit'||suit.garment==='spacesuit';
                const padColor=lum>.3?dark:accent.map(c=>c*.9),bone=n=>built.bones.find(b=>b.name===n),N=24;
                // Pads and collars only where no outer garment (a coat, an armor's textile) lies over the suit.
                const outer=entries.filter(e=>e!==suit&&!e.lining&&!['gloves','boots','magboots'].includes(e.garment)&&e.laid?.field&&(e.laid.layer??0)>(L.layer??0));
                const covered=(fam,at)=>outer.some(e=>e.laid.field.some(f=>f&&f.fam===fam&&Math.abs(f.s-at)<.03));
                // A coat's skirt hangs over the knees from the torso's own family: anything outer reaching below a height.
                const hangsBelow=y=>outer.some(e=>{const P=e.laid.positions;for(let i=1;i<P.length;i+=3)if(P[i]<y)return true;return false;});
                // A pad: rows of the limb's cloth from above the joint to below, the arc facing `face`, domed.
                const pad=(fam,j,next,face,above,below,half,height,color)=>{
                    const J=bone(j),Nx=bone(next);if(!J||!Nx)return;
                    const axis=norm(sub(Nx.head,J.head)),ends=[-above,below].map(d=>sNear(L,fam,add(J.head,mul(axis,d*scale))));
                    if(ends.some(v=>v==null)||covered(fam,(ends[0]+ends[1])/2)||(fam>2&&hangsBelow(J.head[1]+above*scale)))return;
                    // Evenly spaced levels between the pad's ends (the nearest-vertex levels bunch up at the joint).
                    const levels=[0,.25,.5,.75,1].map(t=>ends[0]+(ends[1]-ends[0])*t);
                    const rowsR=levels.map(at=>ringOn(L,fam,at,axis,J.head,N));if(rowsR.some(r=>!r))return;
                    const keep=[];for(let k=0;k<N;k++)if(dot(rowsR[2][k].dir,face)>Math.cos(half))keep.push(k);
                    if(keep.length<3)return;
                    // Keep the arc contiguous (it may wrap past k=0).
                    let startK=keep.find(k=>!keep.includes((k-1+N)%N));if(startK==null)startK=keep[0];
                    const cols=keep.map((_,i)=>(startK+i)%N),edge=(r,c)=>Math.min(r,rowsR.length-1-r,c,cols.length-1-c);
                    grid(mesh,rowsR.map(row=>cols.map(k=>row[k])),color,(r,c)=>{const e=edge(r,c);return e===0?.0045:e===1?height*.9:height;});
                };
                const fwd=[0,0,1],back=[0,0,-1];
                for(const side of ['Left','Right']){
                    const leg=side==='Left'?3:4,arm=side==='Left'?1:2;
                    // (The EVA undersuit's crew wear hard knee shells from the recon kit over it.)
                    if(suit.garment!=='evaSuit')pad(leg,side+'Leg',side+'Foot',fwd,.075,.06,1.05,.011,padColor);
                    pad(arm,side+'ForeArm',side+'Hand',back,.05,.05,1.0,.009,padColor);
                }
                // The mission patch, high on the left sleeve's outside.
                {const A=bone('LeftArm'),F=bone('LeftForeArm');if(A&&F){const axis=norm(sub(F.head,A.head)),c=add(A.head,mul(sub(F.head,A.head),.36)),out=norm(sub([1,0,0],mul(axis,axis[0])));
                    const levels=[0,.035,.07].map(d=>sNear(L,1,add(c,mul(axis,d*scale))));
                    if(levels.every(v=>v!=null)&&!covered(1,levels[1])){const rowsR=levels.map(at=>ringOn(L,1,at,axis,c,N));if(rowsR.every(Boolean)){
                        const cols=[];for(let k=0;k<N;k++)if(dot(rowsR[1][k].dir,out)>Math.cos(.55))cols.push(k);
                        if(cols.length>=2)grid(mesh,rowsR.map(row=>cols.map(k=>row[k])),[accent,O.linear('#f2f0e6'),accent],[.0016,.0019,.0016]);}}}}
                // The neck: a bearing ring (pressure suits) or a stand-up collar in the accent.
                const neck=bone('Neck');
                if(neck){let top=-Infinity;for(let v=0;v<L.positions.length/3;v++)if(L.field[v]?.fam===0&&Math.abs(L.positions[v*3+1]-neck.head[1])<.06*scale)top=Math.max(top,L.field[v].s);
                    if(Number.isFinite(top)&&!covered(0,top-.03)){const lo=ringOn(L,0,top-.06,[0,1,0],neck.head,N),hi=ringOn(L,0,top-.015,[0,1,0],neck.head,N);
                        if(lo&&hi){const up=q=>({...q,p:add(q.p,[0,.018*scale,0])}),close=(row,k)=>row.concat([row[0]]);
                            if(pressure){const R=[lo,hi,hi.map(up),hi.map(q=>({...q,p:add(q.p,[0,.022*scale,0])}))];
                                grid(rings,R.map(r=>close(r)),O.linear('#aeb4ba'),[.002,.0085,.0085,.002]);}
                            else grid(mesh,[lo,hi,hi.map(up),hi.map(q=>({...q,p:add(q.p,[0,.02*scale,0])}))].map(r=>close(r)),[main,accent,accent,accent.map(c=>c*.8)],[.0012,.0035,.004,.0015]);}}}
            }
        }
        const parts=[];
        if(!rings.empty)rings.computeNormals();
        if(!rings.empty)parts.push(rings.part('Suit glove rings',{kind:'metal',clothDetail:true,doubleSided:true,roughness:.3,metalness:.85}));
        if(!mesh.empty)mesh.computeNormals();
        if(!mesh.empty)parts.push(mesh.part('Tailored seams and pockets',{kind:'cloth',clothDetail:true,doubleSided:true,roughness:.86,metalness:0}));
        if(!hardware.empty)parts.push(hardware.part('Garment zipper teeth',{kind:'metal',clothDetail:true,doubleSided:true,roughness:.42,metalness:.65}));
        // The construction kit: lapels, collars, plackets, waistbands, pockets, belts, rib bands, seams.
        parts.push(...construct(pack,built,entries));
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
    /** A fixed random 0..1 for integer coordinates. */
    const hash2=(x,y,s=0)=>{let h=(Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(s|0,1442695041))|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return(h>>>0)/4294967296;};
    const sstep=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
    /** Repeating value noise: `n` cells across a tile of `size` texels. */
    const tileNoise=(x,y,size,n,seed)=>{const fx=x/size*n,fy=y/size*n,ix=Math.floor(fx),iy=Math.floor(fy),u=fx-ix,v=fy-iy,w=a=>((a%n)+n)%n,s=t=>t*t*(3-2*t);
        const a=hash2(w(ix),w(iy),seed),b=hash2(w(ix+1),w(iy),seed),c=hash2(w(ix),w(iy+1),seed),d=hash2(w(ix+1),w(iy+1),seed);return a+(b-a)*s(u)+(c-a)*s(v)+(a-b-c+d)*s(u)*s(v);};
    /** Pictures from a height, a tone and a roughness field: albedo (with alpha), tangent normal, metal-roughness. */
    function finishPictures(prefix,W,H,field,strength,cutout) {
        const h=new Float32Array(W*H),tone=new Float32Array(W*H),rough=new Float32Array(W*H),metal=new Float32Array(W*H),alpha=new Float32Array(W*H),s={};
        for(let y=0;y<H;y++)for(let x=0;x<W;x++){s.h=0;s.t=1;s.r=.5;s.m=1;s.a=1;field(x,y,s);const i=y*W+x;h[i]=s.h;tone[i]=s.t;rough[i]=s.r;metal[i]=s.m;alpha[i]=s.a;}
        const albedo=new Uint8Array(W*H*4),normal=new Uint8Array(W*H*4),surface=new Uint8Array(W*H*4),c=v=>Math.max(0,Math.min(255,Math.round(v*255)));
        for(let y=0;y<H;y++)for(let x=0;x<W;x++){
            const i=y*W+x,dx=(h[y*W+(x+1)%W]-h[y*W+(x+W-1)%W])*strength,dy=(h[((y+1)%H)*W+x]-h[((y+H-1)%H)*W+x])*strength,l=Math.hypot(dx,dy,1);
            albedo.set([c(tone[i]),c(tone[i]),c(tone[i]),cutout?c(alpha[i]):255],i*4);
            normal.set([Math.round(127.5-127.5*dx/l),Math.round(127.5+127.5*dy/l),Math.round(127.5+127.5/l),255],i*4);
            surface.set([255,c(rough[i]),c(metal[i]),255],i*4);
        }
        const pic=(name,data)=>({name,width:W,height:H,data,repeat:true});
        return {albedo:pic(prefix+'-albedo.png',albedo),normal:pic(prefix+'-normal.png',normal),surface:pic(prefix+'-finish.png',surface)};
    }
    let armorTiles=null;
    /**
     * The armor's own tiles (256 texels a side): cast and painted plate (orange peel, sparse chips
     * through to bare metal), hammered steel and pebbled leather where the shared cloth tiles
     * (RRCharacterFabric) are not loaded, and two decorative bands four band-widths long: an
     * etched scroll for steel and running stitches beside a tooled line for leather, both cut out
     * so only the decoration lies over the plate.
     */
    function ownTiles() {
        if(armorTiles)return armorTiles;
        const S=256,cells=(x,y,n,seed)=>{const fx=x/S*n,fy=y/S*n,ix=Math.floor(fx),iy=Math.floor(fy);let f1=9,f2=9,id=0;
            for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const cx=ix+i,cy=iy+j,w=a=>((a%n)+n)%n,px=cx+hash2(w(cx),w(cy),seed)*.9,py=cy+hash2(w(cx),w(cy),seed+1)*.9,d=Math.hypot(fx-px,fy-py);
                if(d<f1){f2=f1;f1=d;id=w(cx)*n+w(cy);}else if(d<f2)f2=d;}return {f1,f2,id};};
        const painted=finishPictures('armor-grain',S,S,(x,y,s)=>{
            // Orange peel and faint sanding marks; chipped paint comes from the form (formWear), at real edges.
            const peel=tileNoise(x,y,S,24,3)*.6+tileNoise(x,y,S,48,4)*.4,mark=tileNoise(x*.2,y*6,S,32,5);
            s.h=.3*peel+.05*mark;s.t=.95+.04*peel;s.r=.6+.14*peel+.06*mark;s.m=.6;},2.2);
        painted.normal.name='armor-grain-normal.png';painted.surface.name='armor-finish.png';
        const steel=finishPictures('armor-steel',S,S,(x,y,s)=>{
            const c=cells(x,y,9,11),d=Math.min(1,c.f1/.62),streak=tileNoise(x,y,S,4,12)*.4+tileNoise(x*.25,y*8,S,64,13)*.6;
            s.h=-(1-d*d)*.9+.25*(1-sstep(0,.1,c.f2-c.f1))+.06*streak;s.t=.9+.07*hash2(c.id,0,14)+.04*streak;s.r=.62+.25*d+.12*streak;s.m=1;},2.4);
        const leather=finishPictures('armor-leather',S,S,(x,y,s)=>{
            const c=cells(x,y,30,21),dome=sstep(0,.3,c.f2-c.f1),crease=(1-sstep(.004,.03,Math.abs(tileNoise(x,y,S,4,22)-.5)))*sstep(.35,.65,tileNoise(x,y,S,3,23));
            s.h=.5*dome-.9*crease;s.t=.9+.08*dome-.12*crease;s.r=.7+.15*(1-dome)+.15*crease;s.m=0;},1.6);
        // Bands: 256 x 64, isotropic (64 texels a band height), repeating along the band.
        const BW=256,BH=64;
        const seg=(px,py,ax,ay,bx,by)=>{const dx=bx-ax,dy=by-ay,t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy)));return Math.hypot(px-ax-t*dx,py-ay-t*dy);};
        const scroll=(x,y)=>{
            let d=Math.min(Math.abs(y-6),Math.abs(y-58))+1.2;                                     // border lines
            const stem=u=>32+13*Math.sin(u/BW*Math.PI*4);
            for(const ox of [-BW,0,BW]){const u=x-ox;if(u<-20||u>BW+20)continue;
                d=Math.min(d,Math.abs(y-stem(u))*.9);
                for(let k=0;k<4;k++){const cu=(k+.5)*BW/4,up=k%2?1:-1,cy=stem(cu)+up*12,r=9,ang=Math.atan2(y-cy,u-cu),rr=Math.hypot(u-cu,y-cy);
                    // A curl: a circle opening into a spiral toward its center.
                    const spiral=r*(1-((ang/(2*Math.PI)+1)%1)*.55);d=Math.min(d,Math.abs(rr-spiral)+(rr<3?3:0));
                    const lx=cu+BW/8,ly=stem(lx)-up*9;d=Math.min(d,Math.max(0,Math.hypot((u-lx)/1.9,(y-ly)/1.0)-4.2));}}
            return d;};
        const etched=finishPictures('armor-etched',BW,BH,(x,y,s)=>{const d=scroll(x+.5,y+.5),stroke=1-sstep(2.8,3.8,d);s.a=stroke;s.h=stroke*(1-sstep(0,3.8,d))*1.6;s.t=.92+.08*stroke;s.r=.4;s.m=1;},1.2,true);
        const tooled=finishPictures('armor-tooled',BW,BH,(x,y,s)=>{
            // Saddle stitches a band-height apart, slanted a little, beside a tooled groove.
            const k=(((x+(y-22)*.35)%32)+32)%32,stitch=k>4&&k<26?1-sstep(4,6,Math.abs(y-22)/(.75+.35*Math.sin((k-4)/22*Math.PI))):0,line=1-sstep(2.2,3.6,Math.abs(y-48));
            s.a=Math.max(stitch,line);s.t=stitch>line?1:.22;s.h=stitch*1.2-line*.8;s.r=stitch>line?.75:.6;s.m=0;},1.4,true);
        return armorTiles={painted,steel,leather,etched,tooled};
    }
    /**
     * Wear by the form, into the vertex colors: convex edges and ridges catch light (lighter,
     * and on painted plate chipped back to bare metal), recesses and lame steps darken. The
     * curvature is measured across the part's welded surface, so seams do not show.
     */
    function formWear(p,finish,scale) {
        const n=p.positions.length/3,q=.00008*scale,ids=new Int32Array(n),key=new Map(),nrm=[];
        for(let v=0;v<n;v++){const k=Math.round(p.positions[v*3]/q)+','+Math.round(p.positions[v*3+1]/q)+','+Math.round(p.positions[v*3+2]/q);let id=key.get(k);if(id==null){id=key.size;key.set(k,id);nrm.push([0,0,0]);}ids[v]=id;for(let c=0;c<3;c++)nrm[id][c]+=p.normals[v*3+c];}
        const m=key.size,pos=new Float32Array(m*3),H=new Float32Array(m),cnt=new Float32Array(m);
        for(let v=0;v<n;v++)pos.set(p.positions.subarray(v*3,v*3+3),ids[v]*3);
        for(const a of nrm){const l=Math.hypot(...a)||1;a[0]/=l;a[1]/=l;a[2]/=l;}
        for(let t=0;t<p.index.length;t+=3)for(let e=0;e<3;e++){
            const a=ids[p.index[t+e]],b=ids[p.index[t+(e+1)%3]];if(a===b)continue;
            const d=[pos[b*3]-pos[a*3],pos[b*3+1]-pos[a*3+1],pos[b*3+2]-pos[a*3+2]],l2=d[0]*d[0]+d[1]*d[1]+d[2]*d[2];if(l2<1e-12)continue;
            const k=((nrm[b][0]-nrm[a][0])*d[0]+(nrm[b][1]-nrm[a][1])*d[1]+(nrm[b][2]-nrm[a][2])*d[2])/l2;
            H[a]+=k;H[b]+=k;cnt[a]++;cnt[b]++;
        }
        const bare=[.42,.43,.46];
        for(let v=0;v<n;v++){
            const id=ids[v],c=cnt[id]?H[id]/cnt[id]*scale:0,convex=sstep(25,150,c),hollow=sstep(10,90,-c);
            for(let k=0;k<3;k++){
                let x=p.colors[v*3+k];
                if(finish==='painted')x=x+(bare[k]-x)*.6*sstep(70,240,c);
                const lift=finish==='steel'?.2:finish==='leather'?.1:.06;
                p.colors[v*3+k]=Math.min(1,x*(1+lift*convex-(finish==='leather'?.26:.22)*hollow));
            }
        }
    }
    /** Steel and leather tiles shared with the cloth (RRCharacterFabric), when that module is loaded. */
    const fabricTiles=()=>root.RRCharacterFabric||(typeof require==='function'?(()=>{try{return require('./CharacterFabric.js');}catch(e){return null;}})():null);
    /**
     * The armor's finish: hammered or brushed steel, cast and painted plate, or leather, each a
     * tiled relief and roughness on the armor's own surface coordinates (in meters from its
     * builder, RRCharacterPowerArmor), worn by the form (formWear); etched and tooled bands get
     * their cut-out decoration. Vertex colors still carry the armor's color. Returns the pictures.
     */
    function armorFinish(parts,built) {
        const scale=built.height/1.7,legacy=p=>/^(Power armor|Power helmet|Recon formed) plating$/.test(p.name)||p.name==='Recon knee shells';
        const chosen=parts.filter(p=>p.finish||legacy(p));
        if(!chosen.length)return [];
        const tiles=ownTiles(),Fabric=fabricTiles(),out=new Map(),use=pic=>{out.set(pic.name,pic);return pic.name;};
        for(const p of chosen){
            // Recon plates are moulded plastic; power armor is painted metal (the shared plastic tile has no metal).
            const finish=p.finish||(/^Recon/.test(p.name)?'plastic':'painted');
            // Surface coordinates in meters from the builder (RRCharacterPowerArmor), shown only with a tiled map.
            if(p.armorUvs){p.uvs=p.armorUvs;p.armorUV=true;delete p.armorUvs;}
            if(finish==='etched'||finish==='tooled'){
                const t=tiles[finish];Object.assign(p,{texture:use(t.albedo),normalTexture:use(t.normal),normalScale:.7,cutout:true,alphaCutoff:.5,keepColors:true});
                continue;
            }
            // Surface coordinates: the builder's own (meters times `uvDensity`), else projected along each vertex's main axis.
            const density=10/scale;
            if(!p.armorUV){
                p.uvs=new Float32Array(p.positions.length/3*2);
                for(let v=0;v<p.positions.length/3;v++){
                    const n=Array.from(p.normals.subarray(v*3,v*3+3),Math.abs),axis=n.indexOf(Math.max(...n)),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1];
                    p.uvs[v*2]=p.positions[v*3+axes[0]]*density;p.uvs[v*2+1]=p.positions[v*3+axes[1]]*density;
                }
            }
            if(p.colors&&!p.edgeWear)formWear(p,finish,scale);
            const perMeter=p.armorUV?(p.uvDensity||8/scale):density;
            const shared=finish==='steel'?(p.edgeWear?'brushed':p.tile||'hammered'):finish==='leather'?'leather':finish==='plastic'?'plastic':null;
            if(Fabric&&shared&&Fabric.tile&&Fabric.tile(shared)){
                const span=Fabric.tile(shared).span,uvs1=new Float32Array(p.uvs.length);
                for(let i=0;i<uvs1.length;i++)uvs1[i]=p.uvs[i]/perMeter/span[i%2];
                const pics={};Fabric.applyTo(p,shared,pics,{uvs1,roughness:p.roughness,normalScale:shared==='hammered'?.38:shared==='brushed'?.45:shared==='plastic'?.6:.7});for(const pic of Object.values(pics))use(pic);
                continue;
            }
            const t=tiles[finish==='steel'?'steel':finish==='leather'?'leather':'painted'];
            Object.assign(p,{texture:use(t.albedo),keepColors:true,normalTexture:use(t.normal),normalScale:finish==='leather'?.5:.35,metallicRoughnessTexture:use(t.surface)});
        }
        return [...out.values()];
    }
    // ══ The construction kit ════════════════════════════════════════════
    /*
     * Garment construction on the finished cloth (the quality plan's P4): lapels and collars that
     * fold and roll with real thickness, plackets, cuffs, waistbands with loops, flies, pockets and
     * flaps, coat belts with buckles and keepers, epaulettes, rib bands, drawstrings; seams sunk
     * into the cloth as grooves and top-stitching as thread dashes (small tiles of this file's own,
     * on narrow ribbons). What a garment carries is data: its catalog entry's `details`
     * (RRCharacterWardrobe), each a choice on the outfit item that the Outfit card shows.
     *
     * Placement is surface-relative. Every vertex is bound to a triangle of its garment's laid
     * cloth (barycentric weights) with an offset in that triangle's own frame, kept on the part as
     * `detailAnchors`; `follow(parts, entries)` puts the details back on cloth that moved after
     * they were made (a drape). The skin of each vertex is its triangle's; `sewnRefs`/`sewnRoots`
     * tie it to the fabric vertex the cloth rig moves (RRCharacterCloth.sewnDetails).
     * Nothing here is taken from a reference model; shapes are drawn from tailoring measures.
     */
    const clamp=(x,a,b)=>x<a?a:x>b?b:x,mix=(a,b,t)=>a+(b-a)*t,ss=(a,b,x)=>sstep(a,b,x);
    const len=v=>Math.hypot(v[0],v[1],v[2]);
    const lerp3=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
    const along=(v,n)=>sub(v,mul(n,dot(v,n)));
    const unit=(v,fallback=[0,1,0])=>{const l=len(v);return l>1e-9?mul(v,1/l):fallback;};
    /** Barycentric weights of the point of triangle abc nearest p. */
    function closestBary(p,a,b,c){
        const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),d1=dot(ab,ap),d2=dot(ac,ap);
        if(d1<=0&&d2<=0)return [1,0,0];
        const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);
        if(d3>=0&&d4<=d3)return [0,1,0];
        const vc=d1*d4-d3*d2;
        if(vc<=0&&d1>=0&&d3<=0){const v=d1/(d1-d3);return [1-v,v,0];}
        const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);
        if(d6>=0&&d5<=d6)return [0,0,1];
        const vb=d5*d2-d1*d6;
        if(vb<=0&&d2>=0&&d6<=0){const w=d2/(d2-d6);return [1-w,0,w];}
        const va=d3*d6-d5*d4;
        if(va<=0&&d4-d3>=0&&d5-d6>=0){const w=(d4-d3)/((d4-d3)+(d5-d6));return [0,1-w,w];}
        const den=1/(va+vb+vc),v=vb*den,w=vc*den;return [1-v-w,v,w];
    }

    /**
     * A garment piece's laid cloth for placing details on: its outer faces (not the turned hem),
     * smooth normals turned out from the body, and a grid of its triangles for nearest-point
     * queries. Positions are read from the laid piece each time, so a moved piece is followed.
     */
    function clothSurface(entry,index,scale){
        const L=entry.laid,n=L.rimStart,I=L.index,tris=[];
        for(let t=0;t<I.length;t+=3)if(I[t]<n&&I[t+1]<n&&I[t+2]<n)tris.push(I[t],I[t+1],I[t+2]);
        const S={entry,index,L,n,tris,scale,N:null,grid:null,cell:.03*scale,stamp:new Int32Array(tris.length/3),query:0};
        S.refresh=()=>{
            const P=L.positions,N=new Float32Array(n*3);
            for(let t=0;t<tris.length;t+=3){
                const a=tris[t]*3,b=tris[t+1]*3,c=tris[t+2]*3;
                const ux=P[b]-P[a],uy=P[b+1]-P[a+1],uz=P[b+2]-P[a+2],vx=P[c]-P[a],vy=P[c+1]-P[a+1],vz=P[c+2]-P[a+2];
                const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;
                for(const s of [a,b,c]){N[s]+=nx;N[s+1]+=ny;N[s+2]+=nz;}
            }
            // Out from the body: the way the piece was lifted off it (most of its vertices agree).
            let vote=0;
            for(let v=0;v<n;v++){const l=Math.hypot(N[v*3],N[v*3+1],N[v*3+2])||1;N[v*3]/=l;N[v*3+1]/=l;N[v*3+2]/=l;
                if(L.base)vote+=Math.sign((P[v*3]-L.base[v*3])*N[v*3]+(P[v*3+1]-L.base[v*3+1])*N[v*3+1]+(P[v*3+2]-L.base[v*3+2])*N[v*3+2]);}
            if(vote<0)for(let k=0;k<N.length;k++)N[k]=-N[k];
            S.N=N;
            const grid=new Map(),cell=S.cell;
            for(let t=0;t<tris.length;t+=3){
                let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
                for(let k=0;k<3;k++)for(let q=0;q<3;q++){const x=P[tris[t+k]*3+q];if(x<lo[q])lo[q]=x;if(x>hi[q])hi[q]=x;}
                for(let x=Math.floor(lo[0]/cell);x<=Math.floor(hi[0]/cell);x++)for(let y=Math.floor(lo[1]/cell);y<=Math.floor(hi[1]/cell);y++)for(let z=Math.floor(lo[2]/cell);z<=Math.floor(hi[2]/cell);z++){
                    const key=x+','+y+','+z;let list=grid.get(key);if(!list)grid.set(key,list=[]);list.push(t/3);
                }
            }
            S.grid=grid;
        };
        S.refresh();
        S.p=v=>[L.positions[v*3],L.positions[v*3+1],L.positions[v*3+2]];
        S.nv=v=>[S.N[v*3],S.N[v*3+1],S.N[v*3+2]];
        /** The nearest point of the cloth to x within `reach` (optionally only triangles `accept` takes). */
        S.closest=(x,reach=.05*scale,accept=null)=>{
            const cell=S.cell,r=Math.max(1,Math.ceil(reach/cell)),cx=Math.floor(x[0]/cell),cy=Math.floor(x[1]/cell),cz=Math.floor(x[2]/cell),stamp=++S.query;
            let best=null,bd=reach*reach;
            for(let i=-r;i<=r;i++)for(let j=-r;j<=r;j++)for(let k=-r;k<=r;k++){
                const list=S.grid.get((cx+i)+','+(cy+j)+','+(cz+k));if(!list)continue;
                for(const f of list){
                    if(S.stamp[f]===stamp)continue;S.stamp[f]=stamp;
                    const ids=[tris[f*3],tris[f*3+1],tris[f*3+2]];if(accept&&!accept(ids))continue;
                    const A=S.p(ids[0]),B=S.p(ids[1]),C=S.p(ids[2]),w=closestBary(x,A,B,C);
                    const q=[A[0]*w[0]+B[0]*w[1]+C[0]*w[2],A[1]*w[0]+B[1]*w[1]+C[1]*w[2],A[2]*w[0]+B[2]*w[1]+C[2]*w[2]],d=(q[0]-x[0])**2+(q[1]-x[1])**2+(q[2]-x[2])**2;
                    if(d<bd){bd=d;best={S,ids,bary:w,d:Math.sqrt(d)};}
                }
            }
            return best;
        };
        return S;
    }
    /** A bound point's place on the cloth now: position, normal and a tangent frame (t1 up the cloth). */
    function frameOf(a){
        const S=a.S,p=[0,0,0],nn=[0,0,0];
        for(let k=0;k<3;k++){const v=a.ids[k],w=a.bary[k];if(!w)continue;const q=S.p(v),m=S.nv(v);for(let c=0;c<3;c++){p[c]+=q[c]*w;nn[c]+=m[c]*w;}}
        const n=unit(nn,[0,0,1]),up=Math.abs(n[1])>.95?[0,0,1]:[0,1,0],t1=unit(along(up,n)),t2=cross(n,t1);
        return {p,n,t1,t2};
    }
    const anchorAt=(S,ids,bary)=>({S,ids,bary});
    const vertexAnchor=(S,v)=>({S,ids:[v,v,v],bary:[1,0,0]});

    /**
     * Geometry by finish: cloth of a kind (its fabric tile), buttons, metal hardware, seam grooves,
     * top-stitching. Each vertex carries its binding, its skin and an outward hint for its normal.
     */
    function makeKit(scale){
        const groups=new Map();
        const kit={scale,groups,
            group(key,props){let g=groups.get(key);if(!g)groups.set(key,g=Object.assign({p:[],h:[],c:[],j:[],w:[],uv:[],uv1:[],refs:[],roots:[],hang:[],anc:[],i:[]},props));return g;},
            /** A vertex at p (world), bound to anchor a, colored, with an outward hint for its normal. */
            v(g,p,hint,color,a,uv,uv1){
                const k=g.p.length/3,S=a.S,L=S.L;
                g.p.push(p[0],p[1],p[2]);g.h.push(hint[0],hint[1],hint[2]);g.c.push(color[0],color[1],color[2]);
                g.uv.push(uv?uv[0]:0,uv?uv[1]:0);g.uv1.push(uv1?uv1[0]:0,uv1?uv1[1]:0);
                const m=new Map();
                for(let q=0;q<3;q++){const v=a.ids[q],b=a.bary[q];if(b<=0)continue;for(let s=0;s<4;s++){const j=L.joints[v*4+s],w=L.weights[v*4+s]*b;if(w>0)m.set(j,(m.get(j)||0)+w);}}
                const top=[...m].sort((x,y)=>y[1]-x[1]).slice(0,4),tot=top.reduce((s,q)=>s+q[1],0)||1;
                for(let q=0;q<4;q++){g.j.push(top[q]?top[q][0]:0);g.w.push(top[q]?top[q][1]/tot:0);}
                let dom=0;for(let q=1;q<3;q++)if(a.bary[q]>a.bary[dom])dom=q;dom=a.ids[dom];
                g.refs.push(L.fabricEntry,dom);g.roots.push(L.positions[dom*3],L.positions[dom*3+1],L.positions[dom*3+2]);g.hang.push(L.hang?.[dom]??-1);
                const f=frameOf(a),q=sub(p,f.p);
                g.anc.push(S.index,a.ids[0],a.ids[1],a.ids[2],a.bary[0],a.bary[1],a.bary[2],dot(q,f.t1),dot(q,f.t2),dot(q,f.n));
                return k;
            },
            /** A triangle, wound so it faces the way its vertices' hints point. */
            t(g,a,b,c){
                if(a<0||b<0||c<0||a===b||b===c||a===c)return;
                const P=g.p,H=g.h,u=[P[b*3]-P[a*3],P[b*3+1]-P[a*3+1],P[b*3+2]-P[a*3+2]],w=[P[c*3]-P[a*3],P[c*3+1]-P[a*3+1],P[c*3+2]-P[a*3+2]],n=cross(u,w);
                const h=[0,1,2].map(k=>H[a*3+k]+H[b*3+k]+H[c*3+k]);
                if(dot(n,h)<0)g.i.push(a,c,b);else g.i.push(a,b,c);
            },
            q(g,a,b,c,d){kit.t(g,a,b,c);kit.t(g,b,d,c);}
        };
        return kit;
    }
    /** Smooth normals from a group's faces, each kept on its hint's side. */
    function groupNormals(g){
        const P=g.p,N=new Float32Array(P.length);
        for(let t=0;t<g.i.length;t+=3){
            const a=g.i[t]*3,b=g.i[t+1]*3,c=g.i[t+2]*3,u=[P[b]-P[a],P[b+1]-P[a+1],P[b+2]-P[a+2]],w=[P[c]-P[a],P[c+1]-P[a+1],P[c+2]-P[a+2]],n=cross(u,w);
            for(const s of [a,b,c]){N[s]+=n[0];N[s+1]+=n[1];N[s+2]+=n[2];}
        }
        for(let k=0;k<N.length;k+=3){
            let l=Math.hypot(N[k],N[k+1],N[k+2]);
            if(l<1e-12){N[k]=g.h[k];N[k+1]=g.h[k+1];N[k+2]=g.h[k+2];l=Math.hypot(N[k],N[k+1],N[k+2])||1;}
            N[k]/=l;N[k+1]/=l;N[k+2]/=l;
        }
        return N;
    }

    let seamTiles=null;
    /**
     * This file's own seam tiles: a sunk seam line (a dark groove with a lit lip on the side the
     * seam allowance is pressed to) and running stitches (four raised thread dashes a tile), both
     * cut out so only the groove and the thread show over the cloth's own picture.
     */
    function seamPictures(){
        if(seamTiles)return seamTiles;
        const groove=finishPictures('garment-seam',32,64,(x,y,s)=>{
            const u=(x+.5)/32-.5,d=Math.abs(u),core=Math.exp(-((u/.09)**2)),lip=Math.exp(-(((u-.16)/.07)**2));
            s.h=-core+.35*lip;s.t=.58+.42*sstep(0,.24,d)+.1*lip;s.a=d<.26?1:0;s.r=.95;s.m=0;},2.2,true);
        const stitch=finishPictures('garment-stitch',16,128,(x,y,s)=>{
            const u=(x+.5)/16-.5,v=((y+.5)/128*4)%1,dash=v>.1&&v<.84?Math.sin((v-.1)/.74*Math.PI):0,across=Math.max(0,1-((u/.34)**2)),thread=Math.sqrt(dash)*across;
            s.a=thread>.3?1:0;s.h=thread*1.3;s.t=.72+.28*thread;s.r=.75;s.m=0;},2.2,true);
        return seamTiles={groove,stitch};
    }
    const pictureSets=new WeakMap();

    /** The kit's groups as parts, with the pictures each needs (`pictures`). */
    function kitParts(kit){
        const Fabric=fabricTiles(),parts=[];
        for(const g of kit.groups.values()){
            if(!g.i.length)continue;
            const pics=[],normals=g.flat?Float32Array.from(g.h,(v,k)=>v):groupNormals(g);
            if(g.flat)for(let k=0;k<normals.length;k+=3){const l=Math.hypot(normals[k],normals[k+1],normals[k+2])||1;normals[k]/=l;normals[k+1]/=l;normals[k+2]/=l;}
            const part={name:g.name,positions:Float32Array.from(g.p),normals,colors:Float32Array.from(g.c),joints:Uint8Array.from(g.j),weights:Float32Array.from(g.w),index:Uint32Array.from(g.i),
                roughness:g.roughness??.88,metalness:g.metalness??0,doubleSided:g.doubleSided!==false,onSkin:true,clothDetail:true,
                sewnRefs:Int32Array.from(g.refs),sewnRoots:Float32Array.from(g.roots),detailAnchors:Float32Array.from(g.anc)};
            if(g.hang.some(h=>h>=0))part.hang=Float32Array.from(g.hang);
            if(g.tile){
                const t=seamPictures()[g.tile];part.uvs=Float32Array.from(g.uv);
                Object.assign(part,{texture:t.albedo.name,normalTexture:t.normal.name,normalScale:g.tile==='groove'?.9:.7,cutout:true,alphaCutoff:.5,keepColors:true});
                pics.push(t.albedo,t.normal);
            }else if(g.fabric&&Fabric&&Fabric.tile&&Fabric.tile(g.fabric)){
                const span=Fabric.tile(g.fabric).span;
                part.uvs1=g.ribbed?Float32Array.from(g.uv1,(v,k)=>v/span[k%2]):Fabric.boxUvs(part.positions,part.normals,span);
                Fabric.applyTo(part,g.fabric,pics,{uvs1:part.uvs1,roughness:g.roughness});
                // Its sheen in its own colors (the cut cloth takes it from its picture).
                if(part.sheen&&!part.sheen.texture){const n=g.c.length/3,m=[0,0,0];for(let k=0;k<g.c.length;k++)m[k%3]+=g.c[k]/n;part.sheen.color=m.map(v=>Math.min(1,v*1.4+.02));}
            }
            pictureSets.set(part,pics);parts.push(part);
        }
        return parts;
    }
    /** The pictures the construction parts among `parts` show. */
    function pictures(parts){
        const out=new Map();
        for(const p of parts)for(const pic of pictureSets.get(p)||[])out.set(pic.name,pic);
        return [...out.values()];
    }

    /**
     * Details put back on cloth that moved after they were made (a drape, a settle): each vertex
     * at its bound triangle's weights and its offset in that triangle's frame now.
     */
    function follow(parts,entries){
        const surfaces=new Map();
        for(const part of parts){
            const A=part.detailAnchors;if(!A)continue;
            for(let v=0;v<A.length/10;v++){
                const e=A[v*10];let S=surfaces.get(e);
                if(!S){const entry=entries[e];if(!entry)continue;S=clothSurface(entry,e,1);surfaces.set(e,S);}
                const f=frameOf({S,ids:[A[v*10+1],A[v*10+2],A[v*10+3]],bary:[A[v*10+4],A[v*10+5],A[v*10+6]]});
                const p=add(f.p,add(add(mul(f.t1,A[v*10+7]),mul(f.t2,A[v*10+8])),mul(f.n,A[v*10+9])));
                part.positions[v*3]=p[0];part.positions[v*3+1]=p[1];part.positions[v*3+2]=p[2];
                if(part.sewnRoots&&part.sewnRefs){const r=part.sewnRefs[v*2+1]*3,P=S.L.positions;part.sewnRoots[v*3]=P[r];part.sewnRoots[v*3+1]=P[r+1];part.sewnRoots[v*3+2]=P[r+2];}
            }
            if(!part.uvs||!part.cutout){const g={p:part.positions,h:part.normals,i:part.index};part.normals=groupNormals(g);}
        }
        return parts;
    }

    // ── kit tools: ribbons, panels, bands, buttons, hardware ──────────────
    /**
     * A ribbon over the cloth along bound points ({a, lift}), `width` across, `offset` to one
     * side: a seam's groove or a line of stitches, its picture repeating every `period` meters.
     */
    function ribbon(kit,g,pts,{width,offset=0,color,period=.016,step=.007}){
        const s=kit.scale,all=pts.map(q=>{const f=frameOf(q.a);return {f,p:add(f.p,mul(f.n,q.lift??.0004*s)),a:q.a};});
        // No finer than `step` along it (an iso line crosses every small face of refined cloth); a gap stays a gap.
        const P=[];
        for(let i=0;i<all.length;i++){const q=all[i],last=P[P.length-1];const brk=i+1<all.length&&len(sub(all[i+1].p,q.p))>.05*s;
            if(!last||i===all.length-1||brk||len(sub(q.p,last.p))>=step*s||len(sub(q.p,last.p))>.05*s)P.push(q);}
        let run=0,prev=null;
        for(let i=0;i<P.length;i++){
            const A=P[Math.max(0,i-1)].p,B=P[Math.min(P.length-1,i+1)].p,t=unit(sub(B,A),P[i].f.t1),b=unit(cross(P[i].f.n,t),P[i].f.t2);
            if(i)run+=len(sub(P[i].p,P[i-1].p));
            const gap=i&&len(sub(P[i].p,P[i-1].p))>.05*s;
            const l=kit.v(g,add(P[i].p,mul(b,offset-width/2)),P[i].f.n,color,P[i].a,[0,run/period]);
            const r=kit.v(g,add(P[i].p,mul(b,offset+width/2)),P[i].f.n,color,P[i].a,[1,run/period]);
            if(prev&&!gap)kit.q(g,prev[0],prev[1],l,r);
            prev=[l,r];
        }
    }
    /** A sunk seam with its top-stitching: a groove, and `rows` lines of thread `gap` apart to one side. */
    function seam(kit,pts,{color,thread,rows=1,gap=.006,side=1,groove=true,first=.0035}){
        const s=kit.scale;
        if(groove)ribbon(kit,kit.group('seam',{name:'Garment seams',tile:'groove',flat:true,roughness:.92}),pts,{width:.0045*s,color:color.map(v=>v*.95)});
        for(let r=0;r<rows;r++)ribbon(kit,kit.group('stitch',{name:'Top-stitching',tile:'stitch',flat:true,roughness:.78}),pts.map(q=>({a:q.a,lift:(q.lift??.0004*s)+.0002*s})),{width:.0018*s,offset:side*(first+r*gap)*s,color:thread,period:.016*s});
    }
    /** Points every `step` meters along a polyline of bound points, each put back on the cloth. */
    function resample(S,pts,step,accept){
        const out=[];if(!pts.length)return out;
        const P=pts.map(a=>frameOf(a).p);
        out.push(pts[0]);
        for(let i=1;i<P.length;i++){
            const L=len(sub(P[i],P[i-1])),n=Math.max(1,Math.ceil(L/step));
            for(let k=1;k<=n;k++){if(k===n){out.push(pts[i]);continue;}const hit=S.closest(lerp3(P[i-1],P[i],k/n),.03*S.scale,accept);if(hit)out.push(anchorAt(S,hit.ids,hit.bary));}
        }
        return out;
    }
    /** World points snapped onto the cloth, as bound points (null where none is near). */
    const snap=(S,pts,accept,reach)=>pts.map(p=>{const hit=S.closest(p,reach??.05*S.scale,accept);return hit?anchorAt(S,hit.ids,hit.bary):null;});

    /**
     * A sewn-on panel (a pocket, a flap, a strap, a tab): `shape(u, v)` gives its local [x, y]
     * (meters) from `origin` along `ex`, `ey` on the cloth for u, v in 0..1; `height(u, v)` how far
     * it stands off the cloth. Its edges turn down to the cloth over `edge` meters (a rolled edge as
     * thick as the panel). Returns its outline's bound points for stitching.
     */
    function panel(kit,g,S,{origin,ex,ey,shape,height,cols=6,rows=6,color,accept,edge,locate=null,shade=null}){
        const s=kit.scale,grid=[];
        for(let j=0;j<=rows;j++){const row=[];for(let i=0;i<=cols;i++){
            const u=i/cols,v=j/rows,[x,y]=shape(u,v);
            let a=null;
            if(locate)a=locate(x,y);
            else{const hit=S.closest(add(origin,add(mul(ex,x),mul(ey,y))),.06*s,accept);if(hit)a=anchorAt(S,hit.ids,hit.bary);}
            if(!a){row.push(null);continue;}
            const f=frameOf(a),h=height(u,v),tint=shade?color.map(c=>c*shade(u,v)):color;
            row.push({a,f,h,k:kit.v(g,add(f.p,mul(f.n,h)),f.n,tint,a,[u,v],[x,y]),x,y});
        }grid.push(row);}
        for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const A=grid[j][i],B=grid[j][i+1],C=grid[j+1][i],D=grid[j+1][i+1];if(A&&B&&C&&D)kit.q(g,A.k,B.k,C.k,D.k);}
        // The rim, all round (or only where `free` says the edge is free to be seen turned).
        const ring=[];
        for(let i=0;i<cols;i++)ring.push([0,i]);for(let j=0;j<rows;j++)ring.push([j,cols]);for(let i=cols;i>0;i--)ring.push([rows,i]);for(let j=rows;j>0;j--)ring.push([j,0]);
        const r=edge??Math.max(.0008*s,Math.min(.003*s,(height(.5,.5))*.8)),rim=[];
        for(const [j,i] of ring){
            const c=grid[j][i];if(!c){rim.push(null);continue;}
            const inner=grid[clamp(j+(j===0?1:j===rows?-1:0),0,rows)][clamp(i+(i===0?1:i===cols?-1:0),0,cols)]||c;
            const outward=unit(along(sub(frameOf(c.a).p,frameOf(inner.a).p),c.f.n),c.f.t1);
            const tint=shade?color.map(q=>q*shade(i/cols,j/rows)):color,mid=add(add(c.f.p,mul(c.f.n,c.h*.55)),mul(outward,r*.75)),low=add(add(c.f.p,mul(c.f.n,.00025*s)),mul(outward,r));
            rim.push({c,m:kit.v(g,mid,add(outward,mul(c.f.n,.5)),tint.map(q=>q*.9),c.a),l:kit.v(g,low,add(outward,mul(c.f.n,.2)),tint.map(q=>q*.8),c.a)});
        }
        for(let k=0;k<rim.length;k++){const A=rim[k],B=rim[(k+1)%rim.length];if(!A||!B)continue;kit.q(g,A.c.k,B.c.k,A.m,B.m);kit.q(g,A.m,B.m,A.l,B.l);}
        return {grid,outline:ring.map(([j,i])=>grid[j][i]).filter(Boolean)};
    }
    /** An inset line round a panel's outline (its stitching), as bound points with their lift. */
    function insetLine(S,P,d,accept,lift,closed=true,from=0,to=null){
        const pts=P.outline.map(c=>[c.x,c.y]),n=pts.length,cen=pts.reduce((m,p)=>[m[0]+p[0]/n,m[1]+p[1]/n],[0,0]),out=[];
        const end=to??(closed?n:n-1);
        for(let k=from;k<=end;k++){
            const c=P.outline[k%n],p=pts[k%n],q=[cen[0]-p[0],cen[1]-p[1]],l=Math.hypot(...q)||1;
            out.push({x:p[0]+q[0]/l*d,y:p[1]+q[1]/l*d,c});
        }
        return out;
    }
    /** A coat button, a shirt button or a shank: a dished disk with its holes, sewn on the cloth. */
    function button(kit,a,{radius,color,holes=4,height,metal=false,dome=false}){
        const s=kit.scale,g=metal?kit.group('metal',{name:'Garment hardware',roughness:.3,metalness:.92}):kit.group('buttons',{name:'Garment buttons',roughness:.38,metalness:0});
        const f=frameOf(a),n=f.n,x=f.t2,y=f.t1,h=height??Math.max(.0018*s,radius*.32),base=add(f.p,mul(n,.0004*s)),N=radius>.007*s?10:8;
        const ring=(r,z,shade,hint)=>Array.from({length:N},(_,k)=>{const t=k/N*Math.PI*2,dir=add(mul(x,Math.cos(t)),mul(y,Math.sin(t)));return kit.v(g,add(add(base,mul(n,z)),mul(dir,r)),hint?add(mul(dir,hint),n):n,color.map(c=>c*shade),a);});
        const side=ring(radius,0,.6,1),rim=ring(radius*.88,h,1.05,.3),dish=ring(radius*.62,dome?h*1.25:h*.72,.92,dome?.4:-.2);
        const center=kit.v(g,add(base,mul(n,dome?h*1.35:h*.68)),n,color.map(c=>c*.9),a);
        for(let k=0;k<N;k++){const j=(k+1)%N;kit.q(g,side[k],side[j],rim[k],rim[j]);kit.q(g,rim[k],rim[j],dish[k],dish[j]);kit.t(g,dish[k],dish[j],center);}
        if(holes){
            const dark=color.map(c=>c*.18),r=radius*(holes===2?.2:.22),hr=radius*.09;
            for(let k=0;k<holes;k++){
                const t=(k+.5)/holes*Math.PI*2,c=add(add(base,mul(n,(dome?h*1.3:h*.7)+.00012*s)),add(mul(x,Math.cos(t)*r),mul(y,Math.sin(t)*r)));
                const q=[[-1,-1],[1,-1],[-1,1],[1,1]].map(([u,v])=>kit.v(g,add(c,add(mul(x,u*hr),mul(y,v*hr))),n,dark,a));kit.q(g,...q);
            }
        }
    }
    /** A jeans rivet or an eyelet: a small domed (or open) metal disk. */
    function rivet(kit,a,{radius,color,open=false}){
        const s=kit.scale,g=kit.group('metal',{name:'Garment hardware',roughness:.3,metalness:.92}),f=frameOf(a),n=f.n,x=f.t2,y=f.t1,N=8,base=add(f.p,mul(n,.0003*s));
        const ring=(r,z,shade,out)=>Array.from({length:N},(_,k)=>{const t=k/N*Math.PI*2,d=add(mul(x,Math.cos(t)),mul(y,Math.sin(t)));return kit.v(g,add(add(base,mul(n,z)),mul(d,r)),add(mul(d,out),n),color.map(c=>c*shade),a);});
        const A=ring(radius,0,.7,1),B=ring(radius*.82,radius*.35,1,.6),C=ring(radius*(open?.55:.4),radius*(open?.38:.5),open?.5:1.1,open?-.5:.2);
        for(let k=0;k<N;k++){const j=(k+1)%N;kit.q(g,A[k],A[j],B[k],B[j]);kit.q(g,B[k],B[j],C[k],C[j]);}
        if(!open){const top=kit.v(g,add(base,mul(n,radius*.55)),n,color,a);for(let k=0;k<N;k++)kit.t(g,C[k],C[(k+1)%N],top);}
        else{const D=ring(radius*.5,0,.15,-1);for(let k=0;k<N;k++){const j=(k+1)%N;kit.q(g,C[k],C[j],D[k],D[j]);}}
    }
    /** A cord along bound points standing `lift` off them (a drawstring): a round tube, its ends capped. */
    function cord(kit,g,pts,{radius,color,lift}){
        const s=kit.scale,N=6,rows=[];let prev=null;
        const P=pts.map(q=>{const f=frameOf(q.a);return {a:q.a,f,p:add(f.p,mul(f.n,(q.lift??lift)))};});
        for(let i=0;i<P.length;i++){
            const t=unit(sub(P[Math.min(P.length-1,i+1)].p,P[Math.max(0,i-1)].p),[0,-1,0]);
            let x=prev?unit(along(prev,t)):unit(along(P[i].f.n,t),[1,0,0]);prev=x;const y=cross(t,x);
            rows.push(Array.from({length:N},(_,k)=>{const th=k/N*Math.PI*2,d=add(mul(x,Math.cos(th)),mul(y,Math.sin(th)));return kit.v(g,add(P[i].p,mul(d,radius)),d,color,P[i].a);}));
        }
        for(let i=0;i+1<rows.length;i++)for(let k=0;k<N;k++){const j=(k+1)%N;kit.q(g,rows[i][k],rows[i][j],rows[i+1][k],rows[i+1][j]);}
        for(const [r,end] of [[rows[0],P[0]],[rows[rows.length-1],P[P.length-1]]]){const c=kit.v(g,end.p,unit(sub(end.p,P[end===P[0]?Math.min(1,P.length-1):Math.max(0,P.length-2)].p)),color,end.a);for(let k=0;k<N;k++)kit.t(g,r[k],r[(k+1)%N],c);}
    }

    /**
     * A band of the cloth itself sewn on as a layer of its own (a waistband, a rib band, a cuff, a
     * placket, a facing): the piece's faces where `value(v)` is at most 0, cut along that line,
     * standing `height` off the cloth, its inner line turned down to it as a step and its cut edge
     * rolled over the hem. `uv1(v)` gives the band's own [along, across] meters for a ribbed tile.
     * Returns the bound points along its inner line, for stitching.
     */
    function band(kit,g,S,{value,height,color,uv1=null,shade=null,turn=true,lineOut=true}){
        const s=kit.scale,L=S.L,keys=new Map(),edges=[],T=S.tris,val=new Float32Array(S.n);
        for(let v=0;v<S.n;v++)val[v]=value(v);
        const vertex=(key,ids,bary,wrap)=>{
            const k=key+(wrap?'+':'');if(keys.has(k))return keys.get(k);
            const a=anchorAt(S,ids,bary),f=frameOf(a),uvs=uv1?ids.map(i=>uv1(i)):null;
            let uv=null;if(uvs){const U=uvs.map(q=>q[0]+(wrap&&q[0]<0?wrap:0));uv=[U[0]*bary[0]+U[1]*bary[1]+U[2]*bary[2],uvs[0][1]*bary[0]+uvs[1][1]*bary[1]+uvs[2][1]*bary[2]];}
            const d=val[ids[0]]*bary[0]+val[ids[1]]*bary[1]+val[ids[2]]*bary[2],h=typeof height==='function'?height(d,ids,bary):height,tint=shade?color.map(c=>c*shade(d)):color;
            const out={a,f,h,k:kit.v(g,add(f.p,mul(f.n,h)),f.n,tint,a,null,uv)};keys.set(k,out);return out;
        };
        const lines=[];
        for(let t=0;t<T.length;t+=3){
            const ids=[T[t],T[t+1],T[t+2]],vs=ids.map(v=>val[v]);if(vs.every(x=>x>0))continue;
            // A band round a body wraps its along coordinate once (its seam behind).
            let wrap=0;if(uv1){const U=ids.map(i=>uv1(i)[0]);const span=Math.max(...U)-Math.min(...U);if(span>uv1.period/2)wrap=uv1.period;}
            const poly=[];
            for(let k=0;k<3;k++){
                const i=ids[k],j=ids[(k+1)%3],a=vs[k],b=vs[(k+1)%3];
                if(a<=0){const bary=[0,0,0];bary[k]=1;poly.push(vertex('v'+i,ids,bary,wrap));}
                if((a<=0)!==(b<=0)){const u=a/(a-b),bary=[0,0,0];bary[k]=1-u;bary[(k+1)%3]=u;const c=vertex('e'+Math.min(i,j)+','+Math.max(i,j),ids,bary,wrap);c.iso=true;poly.push(c);}
            }
            for(let k=1;k+1<poly.length;k++)kit.t(g,poly[0].k,poly[k].k,poly[k+1].k);
            const iso=poly.filter(c=>c.iso);if(iso.length===2)lines.push(iso);
        }
        // The inner line: a step down to the cloth.
        const stepRows=new Map(),step=c=>{
            if(stepRows.has(c.k))return stepRows.get(c.k);
            // Away from the band: down its value.
            const ids=c.a.ids,grad=[0,0,0];const P=ids.map(v=>S.p(v)),V=ids.map(v=>val[v]);
            for(let k=0;k<3;k++){const j=(k+1)%3,e=sub(P[j],P[k]),l2=dot(e,e)||1e-12;for(let q=0;q<3;q++)grad[q]+=e[q]*(V[j]-V[k])/l2;}
            const out=unit(along(grad,c.f.n),c.f.t1),r=Math.min(.0025*s,c.h*.8);
            const m=kit.v(g,add(add(c.f.p,mul(c.f.n,c.h*.5)),mul(out,r*.7)),add(out,c.f.n),color.map(q=>q*.86),c.a);
            const l=kit.v(g,add(add(c.f.p,mul(c.f.n,.0002*s)),mul(out,r)),add(out,mul(c.f.n,.3)),color.map(q=>q*.7),c.a);
            const row=[m,l];stepRows.set(c.k,row);return row;
        };
        if(lineOut)for(const [A,B] of lines){const a=step(A),b=step(B);kit.q(g,A.k,B.k,a[0],b[0]);kit.q(g,a[0],b[0],a[1],b[1]);}
        // The cut edge: rolled over the garment's own turned hem.
        if(turn&&L.hem?.rows){
            const T2=L.hem.thickness||.0012*s,roll=new Map();
            const rolled=v=>{
                if(roll.has(v))return roll.get(v);const c=keys.get('v'+v);if(!c)return null;
                const ids=L.hem.rows.get(v);if(!ids)return null;
                const apex=mul(add(S.p(ids[1]),S.p(ids[2])),.5),under=S.p(ids[L.hem.turn+1]??ids[ids.length-1]);
                const out=unit(along(sub(apex,c.f.p),c.f.n),c.f.t1);
                const m=kit.v(g,add(add(c.f.p,mul(c.f.n,c.h*.6)),mul(out,T2*.5+c.h*.5)),add(out,c.f.n),color.map(q=>q*.92),c.a);
                const l=kit.v(g,add(under,mul(c.f.n,-.0003*s)),add(out,mul(c.f.n,-.6)),color.map(q=>q*.75),c.a);
                const row=[m,l];roll.set(v,row);return row;
            };
            for(const [a,b] of L.piece.border){if(val[a]>0||val[b]>0)continue;const A=keys.get('v'+a),B=keys.get('v'+b),ra=rolled(a),rb=rolled(b);if(!A||!B||!ra||!rb)continue;kit.q(g,A.k,B.k,ra[0],rb[0]);kit.q(g,ra[0],rb[0],ra[1],rb[1]);}
        }
        return {lines,keys};
    }
    /** Ordered runs of an iso line's segments (from band()): chains of bound points. */
    function chains(lines){
        const next=new Map(),deg=new Map(),out=[];const id=c=>c.k;
        for(const [a,b] of lines){for(const [x,y] of [[a,b],[b,a]]){if(!next.has(id(x)))next.set(id(x),[]);next.get(id(x)).push(y);deg.set(id(x),(deg.get(id(x))||0)+1);}}
        const byK=new Map();for(const [a,b] of lines){byK.set(a.k,a);byK.set(b.k,b);}
        const seen=new Set();
        const starts=[...byK.values()].sort((x,y)=>(deg.get(x.k)===1?0:1)-(deg.get(y.k)===1?0:1));
        for(const st of starts){if(seen.has(st.k))continue;const run=[st];seen.add(st.k);let cur=st;
            for(;;){const n=(next.get(cur.k)||[]).find(c=>!seen.has(c.k));if(!n)break;run.push(n);seen.add(n.k);cur=n;}
            if(run.length>1)out.push(run);}
        return out;
    }
    /**
     * The iso line where `value` crosses 0 on the piece's faces that `accept` takes, as ordered
     * runs of bound points (a seam line, a fold line).
     */
    function isoLines(S,value,accept){
        const T=S.tris,val=new Float32Array(S.n),lines=[],keys=new Map();for(let v=0;v<S.n;v++)val[v]=value(v);
        const pt=(i,j,u,ids,k)=>{const key=Math.min(i,j)+','+Math.max(i,j);if(keys.has(key))return keys.get(key);const bary=[0,0,0];bary[k]=1-u;bary[(k+1)%3]=u;const c={k:key,a:anchorAt(S,ids,bary)};keys.set(key,c);return c;};
        for(let t=0;t<T.length;t+=3){
            const ids=[T[t],T[t+1],T[t+2]];if(accept&&!accept(ids))continue;const vs=ids.map(v=>val[v]),hits=[];
            for(let k=0;k<3;k++){const a=vs[k],b=vs[(k+1)%3];if((a<=0)!==(b<=0))hits.push(pt(ids[k],ids[(k+1)%3],a/(a-b),ids,k));}
            if(hits.length===2)lines.push(hits);
        }
        return chains(lines).map(run=>run.map(c=>c.a));
    }
    /** The garment's cut edge as ordered runs of its vertices, where `select(v)` takes them. */
    function borderRuns(S,select){
        const next=new Map(),deg=new Map();
        for(const [a,b] of S.L.piece.border){if(!select(a)||!select(b))continue;for(const [x,y] of [[a,b],[b,a]]){if(!next.has(x))next.set(x,[]);next.get(x).push(y);deg.set(x,(deg.get(x)||0)+1);}}
        const seen=new Set(),out=[];
        const starts=[...next.keys()].sort((x,y)=>(deg.get(x)===1?0:1)-(deg.get(y)===1?0:1));
        for(const st of starts){if(seen.has(st))continue;const run=[st];seen.add(st);let cur=st;
            for(;;){const n=(next.get(cur)||[]).find(v=>!seen.has(v));if(n===undefined)break;run.push(n);seen.add(n);cur=n;}
            if(run.length>1)out.push({run,closed:run.length>2&&(next.get(cur)||[]).includes(st)});}
        return out.sort((a,b)=>b.run.length-a.run.length);
    }

    // ── constructions ────────────────────────────────────────────────────
    /** A front-view (or back-view, side -1) locator on a piece: world x, y to a bound point. */
    function projector(S,side=1,accept=null,axes=null){
        const O=need('RRCharacterOutfit','./CharacterOutfit.js');
        const surface=O.projectedSurface([{positions:S.L.positions,index:Uint32Array.from(S.tris)}],{cell:.03*S.scale,accept:accept?(part,ids)=>accept(ids):null,...(axes?{axes}:{})});
        return (x,y)=>{const hit=surface.sample(x,y,side);return hit?anchorAt(S,hit.ids,hit.bary):null;};
    }
    const bone=(built,name)=>built.bones.find(b=>b.name===name);
    const linearOf=hex=>need('RRCharacterOutfit','./CharacterOutfit.js').linear(hex);
    const tone=(c,k)=>c.map(v=>Math.min(1,v*k));
    /** The thread a garment is top-stitched with: tonal (a shade lighter), or its own (jeans' gold). */
    const threadOf=(look,own)=>own?linearOf(own):tone(linearOf(look.color||'#808080'),1.32).map((v,k)=>Math.min(1,v+.025));
    /** A construction part's cloth: the garment's own tile and finish. */
    function clothGroup(kit,entry,{kind,name='Garment construction',roughness}={}){
        const Fabric=fabricTiles(),fab=kind||(Fabric?Fabric.kindFor(entry.look.material,entry.garment,entry.look.pattern):null);
        const r=roughness??entry.roughness??.88;
        return kit.group('cloth:'+fab+':'+r.toFixed(2),{name,fabric:fab,roughness:r,metalness:entry.metalness||0});
    }
    const trunkOnly=S=>ids=>ids.every(v=>S.L.field[v].fam===0);
    /** The trunk's faces on one side (front 1, back -1): through an open front, never the inside of the back. */
    const facing1=(S,face)=>ids=>ids.every(v=>S.L.field[v].fam===0&&Math.cos(S.L.field[v].spineAng)*face>-.25);
    const famOnly=(S,fam)=>ids=>ids.every(v=>S.L.field[v].fam===fam);

    /**
     * Lapels and a collar, one turned facing along a tailored front: `run` is the cut edge from one
     * break point up the V, round the neck and down to the other (border vertices in order). The
     * lapels lie on the chest outside the roll line (the V's own edge), rolled up off it a little
     * at the top; the collar stands round the neck and falls over its own stand. Notch: the lapel's
     * top cut in toward the roll line and the collar's end a little apart; peak: the lapel's point
     * swept up past the collar's end; shawl: one unbroken curve. Thickness is the cloth's own,
     * doubled where it is folded.
     */
    function facing(kit,S,built,run,o){
        const s=kit.scale,L=S.L,F=L.field,T=o.thickness,color=o.color,g=o.group;
        // The roll line: the cut edge eased along itself (a cut through the cloth's faces steps a little).
        let P=run.map(v=>S.p(v));
        for(let pass=0;pass<(o.ease??24);pass++)P=P.map((p,k)=>k===0||k===P.length-1?p:lerp3(p,mul(add(P[k-1],P[k+1]),.5),.6));
        const X=[0];for(let k=1;k<P.length;k++)X.push(X[k-1]+len(sub(P[k],P[k-1])));
        const total=X[X.length-1];if(total<.05*s)return;
        // Where the V meets the neck on either side: the first and last points high enough.
        let i1=run.findIndex(v=>F[v].s>=o.gorge),i2=run.length-1;while(i2>0&&F[run[i2]].s<o.gorge)i2--;
        const collarOnly=o.collarOnly||i1<0||i2<=i1;
        const g1=collarOnly?0:X[Math.max(0,i1)],g2=collarOnly?total:X[i2];
        const neck=bone(built,'Neck').head,head=bone(built,'Head').head,up=unit(sub(head,neck));
        const interior=v=>{const nb=L.piece.neighbors[v].filter(q=>!L.piece.onBorder[q]&&q<S.n);if(!nb.length)return null;const c=nb.reduce((m,q)=>add(m,S.p(q)),[0,0,0]);return sub(mul(c,1/nb.length),S.p(v));};
        const accept=trunkOnly(S),ds=o.step||.011*s;
        // The style along the edge: [present, width out from the roll line, stand, tilt up, roll].
        const styleAt=(x,tan)=>{
            const st=o.style,W=o.width;
            if(collarOnly){
                const e=Math.min(x,total-x),gapEnd=o.gap||.004*s;if(e<gapEnd)return null;
                const tip=1-ss(0,o.pointReach||.05*s,e-gapEnd),fall=mix(o.fall,o.point||o.fall,tip);
                return {W:fall,stand:o.stand*(1-(o.openFront??.25)*tip),tilt:(o.spread??.4)*tip,roll:0,collar:1,dir:x<total/2?1:-1};
            }
            const left=x<g1,right=x>g2;
            if(left||right){
                const t=left?x/g1:(total-x)/(total-g2),dir=left?1:-1;
                let w=W*Math.pow(ss(0,.72,t),.55),tilt=0,end=1;
                if(st==='notch'){if(t>.86)w*=mix(1,.3,(t-.86)/.14);}
                else if(st==='peak'){w*=1+.22*ss(.68,1,t);tilt=.95*ss(.74,1,t);}
                return {W:Math.max(.003*s,w),stand:0,tilt,roll:o.roll*ss(.15,.95,t),collar:0,dir,end};
            }
            // The collar: from its ends by the gorge round the back of the neck.
            const c=Math.min(x-g1,g2-x),gap=st==='notch'?o.notchGap||.012*s:st==='peak'?.016*s:0;
            if(c<gap)return st==='shawl'?{W:W*.92,stand:0,tilt:0,roll:o.roll,collar:0,dir:x-g1<g2-x?1:-1}:null;
            // It stands where the neckline runs round the neck, and lies on the chest where it runs up the V.
            const k=ss(0,o.standReach||.07*s,c-gap)*ss(.3,.75,1-Math.abs(dot(tan,up)));
            const leaf=st==='shawl'?mix(W*.92,o.fall,ss(0,.08*s,c)):mix(o.leaf||W*.55,o.fall,k);
            return {W:leaf,stand:o.stand*k,tilt:0,roll:o.roll*(1-k),collar:k,dir:x-g1<g2-x?1:-1};
        };
        // Stations every `ds` along the edge; each its section, from under the cut edge round the
        // fold to the outer edge lying on the cloth.
        const stations=[];
        for(let x=0;x<=total+1e-9;x+=Math.min(ds,Math.max(1e-4,total-x)||ds)){
            let k=0;while(k+2<X.length&&X[k+1]<x)k++;
            const t=clamp((x-X[k])/((X[k+1]-X[k])||1),0,1),hit=S.closest(lerp3(P[k],P[k+1],t),.03*s,accept);
            const a=hit?anchorAt(S,hit.ids,hit.bary):anchorAt(S,[run[k],run[k+1],run[k+1]],[1-t,t,0]),f=frameOf(a);
            const tan=unit(sub(P[Math.min(P.length-1,k+2)],P[Math.max(0,k-1)]),f.t1),inside=interior(t<.5?run[k]:run[k+1]);
            let d=unit(along(cross(f.n,tan),f.n),f.t2);if(inside&&dot(d,inside)<0)d=mul(d,-1);
            stations.push({x,a,f,tan,d,style:styleAt(x,tan)});
            if(x>=total-1e-9)break;
        }
        // Directions eased along the edge, so the lapel's outer edge runs clean.
        for(let pass=0;pass<3;pass++){const D=stations.map(q=>q.d);stations.forEach((q,i)=>{const a=D[Math.max(0,i-1)],b=D[Math.min(D.length-1,i+1)];q.d=unit(along(add(add(a,b),mul(D[i],2)),q.f.n),q.d);});}
        const sections=[];
        for(const st of stations){
            const y=st.style;if(!y){sections.push(null);continue;}
            const f=st.f,radial=unit(along(sub(f.p,neck),up),st.d),U=unit(add(mul(mul(st.d,-1),1-y.collar),mul(up,y.collar))),Ov=unit(add(mul(f.n,1-y.collar),mul(radial,y.collar)));
            const r=Math.max(T*1.25,.0028*s)+(1-y.collar)*(o.reach??.004*s),stand=y.stand,flare=o.flare??0,free=(z,o2)=>add(add(f.p,mul(U,z)),mul(Ov,o2));
            // Out along the cloth (tilted up toward the neck for a peak's point), then onto it.
            const dir=unit(add(st.d,mul(st.tan,y.tilt*y.dir)),st.d);
            const surf=(dd,hh)=>{const hit=S.closest(add(f.p,mul(dir,dd)),.05*s,accept);if(!hit)return null;const a=anchorAt(S,hit.ids,hit.bary),q=frameOf(a);return {a,p:add(q.p,mul(q.n,hh)),n:q.n};};
            // The fall stands off its stand a little more toward its edge (a collar's roll).
            const top=dd=>T*1.35+y.roll*(1-dd/y.W)**2+flare*y.collar*(1-dd/Math.max(y.W,1e-4))*.8;
            const pts=[
                {p:free(0,-T*.7),n:mul(U,-1),a:st.a,shade:.6},
                {p:free(stand,-T*.15),n:mul(Ov,-1),a:st.a},
                {p:free(stand+r*.8,T*.55),n:U,a:st.a},
                {p:free(stand,T*1.7+y.roll+flare*y.collar*.3),n:Ov,a:st.a},
                {p:free(stand*.45,T*1.9+y.roll+flare*y.collar*.75),n:Ov,a:st.a},
                surf(0,top(0)),surf(y.W*.35,top(y.W*.35)),surf(y.W*.7,top(y.W*.7)),surf(y.W,top(y.W)),
                surf(y.W+T*.5,T*.7),surf(y.W+T*.35,.00025*s)];
            if(pts.some(q=>!q)){sections.push(null);continue;}
            for(const q of pts)q.n=q.n||Ov;
            sections.push(pts);
        }
        // A facing is canvassed and pressed: it bridges the cloth's small folds instead of following
        // them. Its points are eased along and across it, then kept their height off the cloth.
        for(let pass=0;pass<(o.stiff??16);pass++){
            const next=sections.map((A,i)=>A&&A.map((q,m)=>{
                if(m<5)return q.p;
                const nb=[sections[i-1]?.[m],sections[i+1]?.[m],m>5?A[m-1]:null,m<10?A[m+1]:null].filter(Boolean);
                return nb.length<2?q.p:lerp3(q.p,mul(nb.reduce((acc,r)=>add(acc,r.p),[0,0,0]),1/nb.length),.5);
            }));
            sections.forEach((A,i)=>A&&A.forEach((q,m)=>{if(m<5)return;const f=frameOf(q.a),least=m===10?.0002*s:m===9?T*.55:T*1.2,h=dot(sub(next[i][m],f.p),f.n);q.p=h<least?add(next[i][m],mul(f.n,least-h)):next[i][m];}));
        }
        // A collar worn over another's (a jacket's over a shirt's) stands clear of it.
        const under=kit.collars||(kit.collars=[]);
        if(under.length)for(let i=0;i<sections.length;i++){const A=sections[i],y=stations[i].style;if(!A||!y||y.collar<.05)continue;
            for(const q of A){let push=0;const out=unit(along(sub(q.p,neck),up),stations[i].d);
                for(const c of under){if(c.S===S)continue;const d=sub(q.p,c.p);if(dot(d,d)>.0009*s*s)continue;const gap=dot(d,out),need=T*1.6+.001*s;if(gap<need&&len(along(d,out))<.012*s)push=Math.max(push,need-gap);}
                if(push)q.p=add(q.p,mul(out,push));}}
        for(const A of sections)if(A)for(const q of A)under.push({p:q.p,S});
        for(let i=0;i<sections.length;i++){const A=sections[i];if(A)sections[i]=A.map((q,m)=>({k:kit.v(g,q.p,q.n,m===0||m===1?tone(color,.7):m===9?tone(color,.8):m===10?tone(color,.55):color,q.a),q}));}
        // Faces between neighboring sections; a section next to a gap is an end, closed down to the cloth.
        for(let i=0;i+1<sections.length;i++){const A=sections[i],B=sections[i+1];if(!A||!B)continue;for(let m=0;m+1<A.length;m++)kit.q(g,A[m].k,B[m].k,A[m+1].k,B[m+1].k);}
        for(let i=0;i<sections.length;i++){
            const A=sections[i];if(!A)continue;const prev=sections[i-1],next=sections[i+1];if(prev&&next)continue;
            const away=mul(stations[i].tan,prev?1:-1),low=A.map((c,m)=>m<5?null:kit.v(g,add(sub(c.q.p,mul(c.q.n,Math.max(0,dot(sub(c.q.p,frameOf(c.q.a).p),c.q.n))-.0003*s)),mul(away,T*.4)),away,tone(color,.8),c.q.a));
            for(let m=5;m+1<A.length;m++)kit.q(g,A[m].k,A[m+1].k,low[m],low[m+1]);
            for(let m=0;m<5;m++)kit.t(g,A[m].k,A[m+1].k,low[5]);
        }
        // A pick stitch a little in from the facing's outer edge (lapels and collar), where it lies on the cloth.
        if(o.thread){
            let run=[];
            const flush=()=>{if(run.length>2)ribbon(kit,kit.group('stitch',{name:'Top-stitching',tile:'stitch',flat:true,roughness:.78}),run,{width:.0016*s,color:o.thread,period:.012*s});run=[];};
            for(let i=0;i<stations.length;i++){
                const st=stations[i],y=st.style,A=sections[i];if(!y||!A||y.W<.012*s){flush();continue;}
                const dd=y.W-.0055*s,dir=unit(add(st.d,mul(st.tan,y.tilt*y.dir)),st.d),hit=S.closest(add(st.f.p,mul(dir,dd)),.05*s,accept);if(!hit){flush();continue;}
                const a=anchorAt(S,hit.ids,hit.bary);run.push({a,lift:T*1.35+y.roll*(.0055*s/y.W)**2+.0003*s});
            }
            flush();
        }
        return {stations,sections};
    }

    /** A pocket flap (or a welt, a strap end): a panel with its free edge rolled, top-stitched. */
    function flapPanel(kit,S,{origin,ex,ey,w,h,lift,entry,color,thread,locate,shape,stitch=true,rows=1,accept,cols=6,rowsN=3,edge}){
        const s=kit.scale,g=clothGroup(kit,entry);
        const P=panel(kit,g,S,{origin,ex,ey,cols,rows:rowsN,color,accept,locate,edge,
            shape:shape||((u,v)=>[(u-.5)*w,-v*h]),
            height:(u,v)=>lift+.0004*s*Math.sin(Math.PI*u)*(1-v*.4)});
        if(stitch&&thread){const pts=insetLine(S,P,.004*s,accept,lift);seamFrom(kit,S,pts,{origin,ex,ey,locate,accept,lift:lift+.0003*s,thread,rows,color});}
        return P;
    }
    /** Stitching along local points (from insetLine) of a panel, re-found on the cloth under them. */
    function seamFrom(kit,S,pts,{origin,ex,ey,locate,accept,lift,thread,rows=1,color,groove=false}){
        const s=kit.scale;let bound=[];
        // A point with no cloth under it (across an open front) breaks the line there.
        const flush=()=>{if(bound.length>1)seam(kit,bound,{color:color||thread,thread,rows,groove,first:0,gap:.0055});bound=[];};
        for(const p of pts){const a=locate?locate(p.x,p.y):(()=>{const hit=S.closest(add(origin,add(mul(ex,p.x),mul(ey,p.y))),.05*s,accept);return hit&&anchorAt(S,hit.ids,hit.bary);})();if(a)bound.push({a,lift});else flush();}
        flush();
    }
    /** A frame on the cloth at a bound point: origin, across (ex) and up (ey) the cloth. */
    function localFrame(a,acrossHint=[1,0,0]){
        const f=frameOf(a),ex=unit(along(acrossHint,f.n),f.t2),ey=unit(cross(f.n,ex),f.t1);
        return {origin:f.p,ex:dot(ey,[0,1,0])<0?mul(ex,-1):ex,ey:dot(ey,[0,1,0])<0?mul(ey,-1):ey,n:f.n};
    }
    /** The piece's vertex best matching `score` (largest), among those `take` accepts. */
    function bestVertex(S,take,score){let best=-1,bs=-Infinity;for(let v=0;v<S.n;v++){if(!take(v))continue;const k=score(v);if(k>bs){bs=k;best=v;}}return best;}

    /** A tailored jacket or coat: lapels and collar, pockets, buttons, sleeve buttons, vent. */
    function tailoredFront(kit,S,built,entry,d,spec,skirtS=null){
        const s=kit.scale,L=S.L,F=L.field,look=entry.look,color=linearOf(look.color||'#303030'),thread=threadOf(look),T=Math.max(.0012*s,(L.hem?.thickness||.0025*s));
        const facingColor=spec.facingColor?linearOf(spec.facingColor):color;
        // The V and the neck: the cut edge above the top button.
        const runs=borderRuns(S,v=>F[v].fam===0&&F[v].s>spec.breakS-.2&&Math.cos(F[v].spineAng)>-1.1);
        const neckRun=runs.find(r=>r.run.some(v=>F[v].s>3.8&&Math.cos(F[v].spineAng)<-.5));
        if(neckRun&&d.lapel!=='none'){
            let run=neckRun.run;if(neckRun.closed){let k=0;for(let i=0;i<run.length;i++)if(F[run[i]].s<F[run[k]].s)k=i;run=run.slice(k).concat(run.slice(0,k));}
            if(F[run[0]].spineAng<F[run[run.length-1]].spineAng)run=run.slice().reverse();
            facing(kit,S,built,run,{style:d.lapel||'notch',width:spec.lapelWidth*s,fall:spec.fall*s,stand:spec.stand*s,leaf:spec.leaf*s,roll:.0025*s,flare:.003*s,thickness:T,gorge:spec.gorge,
                color:tone(facingColor,1.07),thread:spec.facingKind?null:threadOf(look),group:spec.facingKind?clothGroup(kit,entry,{kind:spec.facingKind,roughness:spec.facingRoughness}):clothGroup(kit,entry)});
        }
        const front=projector(S,1,facing1(S,1)),back=projector(S,-1);
        const hips=bone(built,'Hips').head,neck=bone(built,'Neck').head,yAt=sv=>hips[1]+(neck[1]-hips[1])*sv/4,cx=hips[0];
        // Buttons down the front, below the break.
        for(const [sv,dx] of spec.buttons||[]){
            const a=front(cx+dx*s,yAt(sv));if(a)button(kit,a,{radius:spec.buttonRadius*s,color:linearOf(spec.buttonColor||'#1d1a18'),holes:4});
        }
        // Hip pockets: a flap over a jetted mouth, a welt, or a patch.
        // (On the skirt of a jacket with one, just under its waist; else on the body.)
        const pocketFront=skirtS?projector(skirtS,1):front,PS=skirtS||S;
        if(d.pockets&&d.pockets!=='none'&&spec.pocketS!=null)for(const side of [-1,1]){
            const x=cx+side*spec.pocketX*s;let y=yAt(spec.pocketS);
            if(skirtS){let hem=Infinity;for(let v=0;v<S.n;v++){if(!L.piece.onBorder[v]||F[v].fam!==0||F[v].s>1.4||Math.cos(F[v].spineAng)<.3)continue;const p=S.p(v);if(Math.abs(p[0]-x)<.03*s)hem=Math.min(hem,p[1]);}if(isFinite(hem))y=hem-.03*s;}
            const a=pocketFront(x,y);if(!a)continue;
            const fr=localFrame(a),W=spec.pocketW*s,lift=T*1.1;
            const locate=(px,py)=>pocketFront(x+px,y+py);
            if(d.pockets==='patch'){
                flapPanel(kit,PS,{origin:fr.origin,ex:[1,0,0],ey:[0,1,0],w:W,h:spec.pocketH*s,lift,entry,color,thread,locate,cols:7,rowsN:6,
                    shape:(u,v)=>{const r=.012*s,yy=-v*spec.pocketH*s,xx=(u-.5)*W;return [xx,yy+(v>.85?Math.max(0,Math.abs(xx)-(W/2-r))*(v-.85)/.15*.6:0)];}});
            }else{
                // The jetted mouth: a dark slit between two narrow lips.
                ribbonLine(kit,PS,[locate(-W/2,0),locate(0,0),locate(W/2,0)],{width:.0035*s,lift:.0005*s,color:tone(color,.25)});
                for(const off of [.0035,-.0035])ribbonLine(kit,PS,[locate(-W/2,off*s),locate(0,off*s),locate(W/2,off*s)],{width:.0034*s,lift:T*.7,color:tone(color,1.04),cloth:entry,kit});
                if(d.pockets==='flap')flapPanel(kit,PS,{origin:fr.origin,ex:[1,0,0],ey:[0,1,0],w:W*1.02,h:spec.flapH*s,lift:lift+.0008*s,entry,color,thread,locate:(px,py)=>locate(px,py+.002*s),cols:7,rowsN:3,stitch:spec.stitchFlaps!==false,
                    shape:(u,v)=>{const xx=(u-.5)*W*1.02,yy=-v*spec.flapH*s,r=.007*s;return [xx*(1-.02*v),yy+(v>.8?Math.max(0,Math.abs(xx)-(W*.51-r))*.9*(v-.8)/.2:0)];}});
            }
        }
        // The breast pocket's welt, rising a little toward the side.
        if(spec.chestWelt&&d.pockets!=='none'){
            const side=1,y=yAt(spec.chestWelt[0]),x=cx+side*spec.chestWelt[1]*s,W=.1*s,H=.022*s,slope=.12;
            const locate=(px,py)=>front(x+px*side,y+py+px*slope);
            flapPanel(kit,S,{origin:[x,y,0],ex:[1,0,0],ey:[0,1,0],w:W,h:H,lift:T*1.1,entry,color,thread,locate:(px,py)=>locate(px,py+H),stitch:false,cols:6,rowsN:2,shape:(u,v)=>[(u-.5)*W,-v*H]});
            ribbonLine(kit,S,[locate(-W/2,H+.001*s),locate(0,H+.001*s),locate(W/2,H+.001*s)],{width:.002*s,lift:.0004*s,color:tone(color,.3)});
        }
        // Sleeve buttons on the back of each cuff, overlapping a little.
        if(spec.sleeveButtons)for(const fam of [1,2]){
            const along=borderRuns(S,v=>F[v].fam===fam).find(r=>r.closed)||borderRuns(S,v=>F[v].fam===fam)[0];if(!along)continue;
            const wrist=bone(built,fam===1?'LeftHand':'RightHand').head,elbow=bone(built,fam===1?'LeftForeArm':'RightForeArm').head,axis=unit(sub(elbow,wrist)),outside=[fam===1?1:-1,0,0];
            const want=unit(add(mul([0,0,-1],1),mul(outside,.8)));
            let best=along.run[0],bs=-Infinity;for(const v of along.run){const k=dot(S.nv(v),want);if(k>bs){bs=k;best=v;}}
            const p0=S.p(best);
            for(let k=0;k<spec.sleeveButtons;k++){
                const target=add(p0,mul(axis,(.03+k*.0155)*s)),hit=S.closest(target,.04*s,famOnly(S,fam));
                if(hit)button(kit,anchorAt(S,hit.ids,hit.bary),{radius:.0068*s,color:linearOf(spec.buttonColor||'#1d1a18'),holes:4,height:.0022*s});
            }
        }
        return {front,back,yAt,cx};
    }
    /** A narrow ribbon of cloth (a jetted lip, a slit) through bound points, drawn as one. */
    function ribbonLine(kit,S,anchors,{width,lift,color,cloth}){
        const pts=resample(S,anchors.filter(Boolean),.006*kit.scale);if(pts.length<2)return;
        const g=cloth?clothGroup(kit,cloth):kit.group('slits',{name:'Garment construction shadows',roughness:.95,metalness:0,flat:true});
        ribbon(kit,g,pts.map(a=>({a,lift})),{width,color});
    }

    /** Trousers: waistband and loops, fly, front and back pockets, yoke, seams, rivets. */
    function trousers(kit,S,built,entry,d){
        const s=kit.scale,L=S.L,F=L.field,look=entry.look,color=linearOf(look.color||'#2f4468'),style=d.trouserStyle||'jeans';
        const jeans=style==='jeans',plain=style==='plain',thread=jeans?linearOf(d.thread||'#c8913e'):threadOf(look),T=Math.max(.0012*s,L.hem?.thickness||.0018*s);
        const waist=v=>F[v].fam===0&&F[v].s>-.1;
        const bandW=(jeans?.038:.034),g=clothGroup(kit,entry);
        // The waistband: the cloth's top, sewn on as a layer of its own.
        band(kit,g,S,{value:v=>waist(v)?L.edge[v]-bandW:1,height:T*.95+.0004*s,color:tone(color,1.03)});
        const stitchAt=e=>isoLines(S,v=>waist(v)?L.edge[v]-e:1,null);
        for(const run of stitchAt(.004))seam(kit,run.map(a=>({a,lift:T*.95+.0008*s})),{color,thread,rows:1,groove:false,first:0});
        for(const run of stitchAt(bandW-.004))seam(kit,run.map(a=>({a,lift:T*.95+.0008*s})),{color,thread,rows:1,groove:false,first:0});
        const hips=bone(built,'Hips').head,cx=hips[0];
        const front=projector(S,1,ids=>ids.every(v=>F[v].fam!==1&&F[v].fam!==2)),back=projector(S,-1);
        // Where the band's lower line runs at the center front and back.
        let zLo=Infinity,zHi=-Infinity;for(let v=0;v<S.n;v++)if(waist(v)&&L.piece.onBorder[v]){const z=S.p(v)[2];zLo=Math.min(zLo,z);zHi=Math.max(zHi,z);}
        const zc=(zLo+zHi)/2,topY=(side,x)=>{let best=-Infinity;for(let v=0;v<S.n;v++){if(!waist(v)||!L.piece.onBorder[v])continue;const p=S.p(v);if(Math.abs(p[0]-x)<.025*s&&Math.sign(p[2]-zc)===side)best=Math.max(best,p[1]);}return best;};
        const yF=topY(1,cx),yB=topY(-1,cx);if(!isFinite(yF)||!isFinite(yB))return;
        const lowF=yF-bandW*s,lowB=yB-bandW*s;
        // The button and the fly: a lap down the front, J-stitched.
        const btn=front(cx,yF-bandW*s*.5);if(btn)(jeans?rivet:button)(kit,btn,jeans?{radius:.0085*s,color:linearOf('#9a8f80')}:{radius:.0075*s,color:tone(color,.6),holes:4});
        if(!plain){
            const flyX=.032*s,flyD=.15*s,J=[];
            for(let k=0;k<=12;k++){const t=k/12,y=lowF-t*(flyD-flyX);J.push(front(cx+flyX,y));}
            for(let k=1;k<=6;k++){const t=k/6*Math.PI/2;J.push(front(cx+flyX*Math.cos(t),lowF-(flyD-flyX)-flyX*Math.sin(t)));}
            const fly=J.filter(Boolean);
            seam(kit,resample(S,fly,.007*s).map(a=>({a})),{color,thread,rows:jeans?2:1,groove:false,first:0,gap:.006,side:-1});
            const edge=[];for(let k=0;k<=10;k++)edge.push(front(cx+.001*s,lowF-flyD*k/10));
            seam(kit,resample(S,edge.filter(Boolean),.008*s).map(a=>({a})),{color,thread,rows:0,groove:true});
        }
        // Front pockets: a scooped mouth (jeans) or a slant (chinos, tailored), its lip standing over the bag.
        if(!plain)for(const side of [-1,1]){
            const start=[cx+side*(jeans?.088:.1)*s,lowF-.002*s],sideX=cx+side*.165*s,drop=(jeans?.075:.16)*s,curve=[];
            for(let k=0;k<=14;k++){const t=k/14,x=jeans?mix(start[0],sideX,Math.sin(t*Math.PI/2)):mix(start[0],sideX-side*.02*s,t),y=jeans?start[1]-drop*(1-Math.cos(t*Math.PI/2)):start[1]-drop*t;curve.push([x,y]);}
            const lip=curve.map(([x,y])=>front(x,y)).filter(Boolean);if(lip.length<4)continue;
            // The mouth's shadow, then the front panel's turned lip over it, stitched.
            ribbonLine(kit,S,lip,{width:.0026*s,lift:.0004*s,color:tone(color,.35)});
            const inward=[-side*.7,-.7],lipIn=curve.map(([x,y])=>front(x+inward[0]*.009*s,y+inward[1]*.009*s));
            const strip=lip.map((a,k)=>lipIn[k]?[a,lipIn[k]]:null).filter(Boolean);
            for(let k=0;k+1<strip.length;k++){
                const q=[strip[k][0],strip[k+1][0],strip[k][1],strip[k+1][1]].map((a,i)=>{const f=frameOf(a);return kit.v(g,add(f.p,mul(f.n,i<2?T*.9:.00035*s)),f.n,tone(color,i<2?1.04:1),a);});
                kit.q(g,q[0],q[1],q[2],q[3]);
            }
            seam(kit,resample(S,lipIn.filter(Boolean),.007*s).map(a=>({a,lift:.0007*s})),{color,thread,rows:jeans?2:1,groove:false,first:0,gap:.006,side:-side});
            if(jeans){const r=front(start[0]+side*.004*s,start[1]-.004*s);if(r)rivet(kit,r,{radius:.0032*s,color:linearOf('#b08d57')});
                const e=front(sideX-side*.004*s,start[1]-drop+.006*s);if(e)rivet(kit,e,{radius:.0032*s,color:linearOf('#b08d57')});}
        }
        // The back: a yoke (jeans), patch or welt pockets, the center seam.
        if(!plain){
            const yoke=jeans?[[-.19,.06],[-.1,.075],[0,.095],[.1,.075],[.19,.06]]:null;
            if(yoke){const pts=[];for(let k=0;k+1<yoke.length;k++)for(let j=0;j<6;j++){const t=j/6;pts.push(back(cx+mix(yoke[k][0],yoke[k+1][0],t)*s,lowB-mix(yoke[k][1],yoke[k+1][1],t)*s));}pts.push(back(cx+.19*s,lowB-.06*s));
                const run=resample(S,pts.filter(Boolean),.008*s);seam(kit,run.map(a=>({a})),{color,thread,rows:2,groove:true,side:-1});}
            const cb=[];for(let k=0;k<=12;k++)cb.push(back(cx,(yoke?lowB-.095*s:lowB)-k/12*.17*s));
            seam(kit,resample(S,cb.filter(Boolean),.008*s).map(a=>({a})),{color,thread,rows:jeans?2:1,groove:true});
            for(const side of [-1,1]){
                const x=cx+side*.078*s,y=lowB-(jeans?.1:.045)*s,a=back(x,y);if(!a)continue;
                const locate=(px,py)=>back(x+px,y+py);
                if(jeans){
                    const W=.135*s,H=.15*s,V=.022*s;
                    const P=panel(kit,g,S,{origin:[x,y,0],ex:[1,0,0],ey:[0,1,0],cols:6,rows:7,color:tone(color,1.02),locate,
                        shape:(u,v)=>{const xx=(u-.5)*W*(1-.08*v);return [xx,-v*(H-V+V*(1-Math.abs(2*u-1)))];},
                        height:(u,v)=>T*1.05+.0006*s*Math.sin(Math.PI*u)*Math.sin(Math.PI*v)});
                    for(const inset of [.003,.009])seamFrom(kit,S,insetLine(S,P,inset*s,null,0),{locate,lift:T*1.05+.0009*s,thread});
                    // A stitched arc across it, and bar tacks at its top corners.
                    const arc=[];for(let k=0;k<=10;k++){const t=k/10,xx=(t-.5)*W*.8;arc.push({x:xx,y:-H*.42+.03*s*Math.sin(t*Math.PI)*(side>0?1:1)-.012*s*Math.sin(t*Math.PI*2)*side});}
                    seamFrom(kit,S,arc,{locate,lift:T*1.05+.0009*s,thread});
                }else{
                    const W=.13*s;
                    ribbonLine(kit,S,[locate(-W/2,0),locate(0,0),locate(W/2,0)],{width:.0028*s,lift:.0004*s,color:tone(color,.28)});
                    for(const off of [.003,-.003])ribbonLine(kit,S,[locate(-W/2,off*s),locate(0,off*s),locate(W/2,off*s)],{width:.003*s,lift:T*.6,color:tone(color,1.03),cloth:entry});
                    if(style==='tailored'){const b=locate(0,-.012*s);if(b)button(kit,b,{radius:.0055*s,color:tone(color,.55),holes:4});}
                }
            }
        }
        // Cargo pockets: bellowed patches on the outside of each thigh, a buttoned flap over each.
        if(entry.garment==='cargoTrousers')for(const [fam,side,name] of [[3,1,'Left'],[4,-1,'Right']]){
            const up=bone(built,name+'UpLeg').head,knee=bone(built,name+'Leg').head,cy=mix(up[1],knee[1],.5),cz=mix(up[2],knee[2],.2)-.01*s;
            const sideP=projector(S,side,famOnly(S,fam),[[0,0,1],[0,1,0],[1,0,0]]),locate=(z,y)=>sideP(cz+z,cy+y);
            // Flat on the thigh's side, following the cloth closely (fine rows, so no chord cuts into the curved leg);
            // only a slight fullness at its middle, under a flap that lies on it.
            const W=.12*s,H=.16*s,lift=T*1.05+.0012*s,full=u=>.004*s*Math.pow(Math.max(0,Math.sin(Math.PI*u)),.6);
            const P=panel(kit,g,S,{cols:12,rows:14,color:tone(color,1.03),locate,shape:(u,v)=>[(u-.5)*W*side,H/2-v*H],height:(u,v)=>lift+full(u)*Math.pow(Math.max(0,Math.sin(Math.PI*v)),.4)});
            seamFrom(kit,S,insetLine(S,P,.004*s,null,0),{locate,lift:lift+.0006*s,thread,rows:1});
            const F2=panel(kit,g,S,{cols:12,rows:3,color,locate:(z,y)=>sideP(cz+z,cy+H/2+.008*s+y),shape:(u,v)=>[(u-.5)*W*1.06*side,-v*.048*s],height:u=>lift+.0026*s+full(u)});
            seamFrom(kit,S,insetLine(S,F2,.004*s,null,0),{locate:(z,y)=>sideP(cz+z,cy+H/2+.008*s+y),lift:lift+.0034*s+.004*s,thread});
            const b=sideP(cz,cy+H/2-.03*s);if(b)button(kit,b,{radius:.006*s,color:tone(color,.45),holes:4,height:lift+.0035*s+.004*s});
        }
        // Belt loops over the band, bar-tacked at both ends.
        if(d.loops!==false&&!plain){
            const loops=jeans?[[1,.1],[1,-.1],[0,1.25],[0,-1.25],[-1,.42],[-1,-.42],[-1,0]]:[[1,.11],[1,-.11],[0,1.2],[0,-1.2],[-1,.4],[-1,-.4]];
            for(const [face,where] of loops){
                const v=bestVertex(S,v=>waist(v)&&Math.abs(L.edge[v]-bandW*.5)<.012,v=>{const p=S.p(v);const ang=Math.atan2(p[0]-cx,p[2]-zc);const want=face===1?Math.atan2(where,1):face===-1?Math.atan2(where,-1):Math.sign(where)*Math.PI/2;let dd=Math.abs(ang-want);if(dd>Math.PI)dd=2*Math.PI-dd;return -dd;});
                if(v<0)continue;
                const fr=localFrame(vertexAnchor(S,v),cross([0,1,0],S.nv(v))),lw=.0105*s,top=bandW*s*.5-.002*s,bottom=-bandW*s*.5-.008*s;
                // The loop's own top: level with the cut edge just under it.
                const P=panel(kit,g,S,{origin:fr.origin,ex:fr.ex,ey:fr.ey,cols:2,rows:5,color:tone(color,1.05),accept:ids=>ids.every(waist),
                    shape:(u,vv)=>[(u-.5)*lw,top-(top-bottom)*vv],
                    height:(u,vv)=>T*.95+.0004*s+.0016*s*Math.sin(Math.PI*clamp((vv-.05)/.9,0,1))});
                for(const at of [.08,.92]){const pts=[];for(let k=0;k<=2;k++)pts.push({x:(k/2-.5)*lw*.8,y:top-(top-bottom)*at});seamFrom(kit,S,pts,{origin:fr.origin,ex:fr.ex,ey:fr.ey,accept:ids=>ids.every(waist),lift:T*.95+.0022*s,thread});}
            }
        }
        // The outside leg seams and the inseams, sunk.
        if(!plain)for(const fam of [3,4]){
            const sideSign=fam===3?-1:1,ok=ids=>{if(!ids.every(v=>F[v].fam===fam&&F[v].s>.15))return false;const a=ids.map(v=>F[v].la);return Math.max(...a)-Math.min(...a)<Math.PI;};
            for(const run of isoLines(S,v=>F[v].la*sideSign-Math.PI/2,ok))if(run.length>3)seam(kit,run.map(a=>({a})),{color,thread,rows:0,groove:true});
            for(const run of isoLines(S,v=>-F[v].la*sideSign-Math.PI/2,ok))if(run.length>3)seam(kit,run.map(a=>({a})),{color,thread,rows:jeans?2:0,groove:true,gap:.006});
        }
        // A pressed crease down the front of each leg (tailored).
        if(style==='tailored')for(const fam of [3,4]){
            const ok=ids=>ids.every(v=>F[v].fam===fam&&F[v].s>.25);
            for(const run of isoLines(S,v=>F[v].la,ok))if(run.length>3)ribbon(kit,kit.group('crease',{name:'Garment creases',flat:true,roughness:.8}),run.map(a=>({a,lift:.0004*s})),{width:.0016*s,color:tone(color,1.25)});
        }
    }

    /**
     * A shirt's front and sleeves: the button placket, the back yoke, buttoned cuffs, a chest
     * pocket. (Its collar is the collar() of its `collar` piece.)
     */
    function shirtFront(kit,S,built,entry,d,o={}){
        const s=kit.scale,L=S.L,F=L.field,look=entry.look,color=linearOf(look.color||'#f2f0ea'),thread=threadOf(look),T=Math.max(.001*s,L.hem?.thickness||.001*s),g=clothGroup(kit,entry);
        const hips=bone(built,'Hips').head,neck=bone(built,'Neck').head,cx=hips[0];
        const frontV=v=>F[v].fam===0&&Math.cos(F[v].spineAng)>.4;
        const W=(o.placket??.017)*s,lo=o.placketTo==null?-Infinity:hips[1]+(neck[1]-hips[1])*o.placketTo/4;
        // The placket: a strip down the center front, stitched along both edges (none: `placket` 0).
        if(o.placket!==0){band(kit,g,S,{value:v=>frontV(v)&&S.p(v)[1]>lo-.01*s?Math.abs(S.p(v)[0]-cx)-W:1,height:T*.9+.0003*s,color:tone(color,1.02),turn:true});
        for(const side of [-1,1]){
            const runs=isoLines(S,v=>frontV(v)&&S.p(v)[1]>lo?(S.p(v)[0]-cx)*side-(W-.0035*s):1,null);
            for(const run of runs)if(run.length>2)seam(kit,run.map(a=>({a,lift:T*.9+.0007*s})),{color,thread,rows:1,groove:false,first:0});
        }
        }
        // Buttons down it.
        const front=projector(S,1,facing1(S,1));
        let top=-Infinity,bottom=Infinity;for(let v=0;v<S.n;v++){if(!L.piece.onBorder[v]||!frontV(v))continue;const p=S.p(v);if(Math.abs(p[0]-cx)>.03*s)continue;if(F[v].s>2.5)top=Math.max(top,p[1]);else bottom=Math.min(bottom,p[1]);}
        if(o.placket!==0&&isFinite(top)&&isFinite(bottom)){
            const first=top-.035*s,last=Math.max(bottom+.06*s,lo+.012*s),count=o.buttons??Math.max(2,Math.round((first-last)/(.085*s))+1);
            for(let k=0;k<count;k++){const y=count>1?mix(first,last,k/(count-1)):first,a=front(cx,y);if(a)button(kit,a,{radius:(o.buttonRadius??.0052)*s,color:linearOf(o.buttonColor||'#efeae0'),holes:4,height:.0016*s});}
        }
        // The back yoke: a sunk seam across the shoulder blades, stitched under.
        if(o.yoke!==false){
            const back=v=>F[v].fam===0&&Math.cos(F[v].spineAng)<-.2;
            const yokeS=3.35;
            for(const run of isoLines(S,v=>back(v)?F[v].s-yokeS:1,ids=>ids.every(back)))if(run.length>3)seam(kit,run.map(a=>({a})),{color,thread,rows:1,groove:true,side:-1});
        }
        // Cuffs, buttoned on the outside of the wrist.
        if(o.cuffs!==false)for(const fam of [1,2]){
            const sleeve=v=>F[v].fam===fam;
            const runs=borderRuns(S,sleeve);if(!runs.length)continue;const end=runs[0].run;
            if(F[end[0]].s<2.6)continue;
            const cuffW=(o.cuffWidth??.06);
            band(kit,g,S,{value:v=>sleeve(v)&&F[v].s>2.2?L.edge[v]-cuffW:1,height:T*1.1+.0004*s,color:tone(color,1.02)});
            for(const e of [.004,cuffW-.004])for(const run of isoLines(S,v=>sleeve(v)&&F[v].s>2.2?L.edge[v]-e:1,null))if(run.length>2)seam(kit,run.map(a=>({a,lift:T*1.1+.0008*s})),{color,thread,rows:1,groove:false,first:0});
            const want=unit([fam===1?.8:-.8,0,-.6]);let best=end[0],bs=-Infinity;for(const v of end){const k=dot(S.nv(v),want);if(k>bs){bs=k;best=v;}}
            const wrist=bone(built,fam===1?'LeftHand':'RightHand').head,elbow=bone(built,fam===1?'LeftForeArm':'RightForeArm').head,axis=unit(sub(elbow,wrist));
            const hit=S.closest(add(S.p(best),mul(axis,cuffW*.5*s)),.04*s,famOnly(S,fam));
            if(hit)button(kit,anchorAt(S,hit.ids,hit.bary),{radius:.0048*s,color:linearOf(o.buttonColor||'#efeae0'),holes:4,height:.0015*s});
        }
        // A chest pocket on the left.
        if(d.chestPocket){
            const x=cx+.095*s,y=hips[1]+(neck[1]-hips[1])*2.95/4,W=.105*s,H=.12*s,locate=(px,py)=>front(x+px,y+py);
            const P=panel(kit,g,S,{origin:[x,y,0],ex:[1,0,0],ey:[0,1,0],cols:5,rows:6,color:tone(color,1.01),locate,
                shape:(u,v)=>{const xx=(u-.5)*W;return [xx,-v*(H-.012*s+.012*s*(1-Math.abs(2*u-1)))];},height:()=>T*1.0+.0003*s});
            seamFrom(kit,S,insetLine(S,P,.003*s,null,0,false,(P.outline.length*0)|0),{locate,lift:T+.0008*s,thread});
        }
    }

    /**
     * A collar on a garment's neckline (its `collar` piece: { stand, fall, point, open, spread }):
     * a stand round the neck, a fall folded over it, the points in front; a band collar has no
     * fall. Polo and knit collars are softer and rounder.
     */
    function collarOn(kit,S,built,entry,spec,d,o={}){
        const s=kit.scale,L=S.L,F=L.field,look=entry.look,color=linearOf(look.color||'#f2f0ea'),T=Math.max(.001*s,L.hem?.thickness||.001*s);
        const style=d.collarStyle||o.style||'point';if(style==='none')return;
        const runs=borderRuns(S,v=>F[v].fam===0&&F[v].s>3.2);const neck=runs.find(r=>r.run.length>6);if(!neck)return;
        let run=neck.run;
        // From the front: split the neckline at its middle in front.
        let k=0;for(let i=0;i<run.length;i++)if(Math.cos(F[run[i]].spineAng)>Math.cos(F[run[k]].spineAng))k=i;
        run=neck.closed?run.slice(k).concat(run.slice(0,k+1)):run;
        if(!neck.closed){if(Math.cos(F[run[0]].spineAng)<Math.cos(F[run[run.length-1]].spineAng))run=run.slice().reverse();}
        const shapes={point:{fall:.012,point:.062,spread:.35,reach:.05},spread:{fall:.012,point:.05,spread:.85,reach:.045},button:{fall:.013,point:.06,spread:.4,reach:.05},band:{fall:0,point:0,spread:0,reach:.04},rib:{fall:.01,point:.05,spread:.55,reach:.045},convertible:{fall:.018,point:.07,spread:.7,reach:.06}};
        const sh=shapes[style]||shapes.point,stand=(spec.stand??(style==='rib'?.024:.03));
        const g=o.kind?clothGroup(kit,entry,{kind:o.kind}):clothGroup(kit,entry);
        const open=spec.open??.2,gap=(spec.gap??.0015)+Math.max(0,open-.06)*.045;
        const made=facing(kit,S,built,run,{collarOnly:true,style:'collar',stand:stand*s,fall:Math.max(.002,sh.fall+(spec.fall??0)*.2)*s,point:(sh.point+(spec.point?spec.point*.6:0))*s,pointReach:sh.reach*s,spread:sh.spread,gap:gap*s,roll:0,openFront:.2+open*1.2,flare:(style==='rib'?.003:.0045)*s,thickness:T*(style==='rib'?1.6:1.15),color,group:g,step:.009*s});
        if(style==='button'&&made){
            // Small buttons under each point.
            for(const end of [0,1]){const st=made.stations[end?made.stations.length-3:2];if(!st)continue;const f=st.f;const tip=S.closest(add(f.p,mul(unit(add(st.d,mul(st.tan,.4*(end?-1:1)))),.05*s)),.04*s);if(tip)button(kit,anchorAt(S,tip.ids,tip.bary),{radius:.0035*s,color:linearOf('#efeae0'),holes:2,height:T*2.4+.0012*s});}
        }
    }

    /** Rib bands: a knit's neckband, cuffs and waistband in a two by two rib, stood off as a layer. */
    function ribBands(kit,S,built,entry,{neck=.016,cuffs=.06,hem=.05}){
        const s=kit.scale,L=S.L,F=L.field,look=entry.look,color=tone(linearOf(look.color||'#7a3b3b'),.96),T=Math.max(.0012*s,L.hem?.thickness||.0018*s);
        const g=kit.group('rib:'+entry.roughness,{name:'Rib knit bands',fabric:'rib',ribbed:true,roughness:entry.roughness??.9,metalness:0});
        const R=.14,period=2*Math.PI*R;
        const trunkUv=v=>[F[v].spineAng*R,L.edge[v]];trunkUv.period=period;
        const limbUv=v=>[F[v].la*.045,L.edge[v]];limbUv.period=2*Math.PI*.045;
        const lines=[];
        if(neck){const from=neck>.04?3.92:3.3,r=band(kit,g,S,{value:v=>F[v].fam===0&&F[v].s>from?L.edge[v]-neck:1,height:T*1.2,color,uv1:trunkUv});lines.push(...r.lines);}
        if(hem){const r=band(kit,g,S,{value:v=>F[v].fam===0&&F[v].s<2.6?L.edge[v]-hem:1,height:T*1.35,color,uv1:trunkUv});lines.push(...r.lines);}
        if(cuffs)for(const fam of [1,2]){const ends=borderRuns(S,v=>F[v].fam===fam);if(!ends.length||F[ends[0].run[0]].s<2.4)continue;band(kit,g,S,{value:v=>F[v].fam===fam&&F[v].s>2.1?L.edge[v]-cuffs:1,height:T*1.3,color,uv1:limbUv});}
    }

    /** A T-shirt's hems: twin-needle stitches a finger's width above the hem and round the sleeves. */
    function twinNeedle(kit,S,entry,{hem=.022,sleeve=.018}={}){
        const s=kit.scale,L=S.L,F=L.field,color=linearOf(entry.look.color||'#3d6fb6'),thread=threadOf(entry.look);
        for(const [take,e] of [[v=>F[v].fam===0&&F[v].s<2.6,hem],[v=>(F[v].fam===1||F[v].fam===2)&&F[v].s>1.1,sleeve]])
            for(const run of isoLines(S,v=>take(v)?L.edge[v]-e:1,null))if(run.length>3)seam(kit,run.map(a=>({a,lift:.0005*s})),{color,thread,rows:2,groove:false,first:-.003,gap:.006});
    }

    /** A hoodie's front: a pouch pocket with slanted openings, drawstrings from eyelets at the neck. */
    function hoodieFront(kit,S,built,entry,d){
        const s=kit.scale,L=S.L,F=L.field,look=entry.look,color=linearOf(look.color||'#4a4f58'),thread=threadOf(look),T=Math.max(.0015*s,L.hem?.thickness||.002*s);
        const hips=bone(built,'Hips').head,neck=bone(built,'Neck').head,cx=hips[0],front=projector(S,1,facing1(S,1)),g=clothGroup(kit,entry);
        if(d.pocket!==false){
            // The pouch: above the waistband, wide at its foot, its sides slanted openings.
            let bottom=Infinity;for(let v=0;v<S.n;v++)if(F[v].fam===0&&L.piece.onBorder[v]&&F[v].s<2&&Math.cos(F[v].spineAng)>.8)bottom=Math.min(bottom,S.p(v)[1]);
            if(isFinite(bottom)){
                const y0=bottom+.065*s,H=.17*s,Wb=.30*s,Wt=.18*s,locate=(px,py)=>front(cx+px,y0+py);
                const shape=(u,v)=>{const w=mix(Wb,Wt,v);return [(u-.5)*w-(v>0?0:0),v*H];};
                const P=panel(kit,g,S,{origin:[cx,y0,0],ex:[1,0,0],ey:[0,1,0],cols:8,rows:6,color:tone(color,1.02),locate,shape,height:(u,v)=>T*1.1+.003*s*Math.sin(Math.PI*u)*Math.sin(Math.PI*clamp(v*1.1,0,1))});
                // Its stitched top and foot; the slanted sides are its open mouths, bound.
                for(const yy of [.004,H-.004*s/s*s]){const pts=[];for(let k=0;k<=8;k++){const v=yy/H,w=mix(Wb,Wt,v)-.012*s;pts.push({x:(k/8-.5)*w,y:yy});}seamFrom(kit,S,pts,{locate,lift:T*1.1+.0035*s*0+.0008*s,thread,rows:2});}
                for(const side of [-1,1]){const pts=[];for(let k=0;k<=8;k++){const v=k/8,w=mix(Wb,Wt,v);pts.push({x:side*(w/2-.008*s),y:v*H});}seamFrom(kit,S,pts,{locate,lift:T*1.1+.0008*s,thread,rows:1});}
            }
        }
        if(d.drawstrings!==false){
            // Eyelets either side of the neck, cords hanging from them to tipped ends.
            let top=-Infinity;for(let v=0;v<S.n;v++)if(F[v].fam===0&&L.piece.onBorder[v]&&F[v].s>3&&Math.cos(F[v].spineAng)>.9)top=Math.max(top,S.p(v)[1]);
            if(isFinite(top))for(const side of [-1,1]){
                const x=cx+side*.042*s,y=top-.025*s,a=front(x,y);if(!a)continue;
                rivet(kit,a,{radius:.0045*s,color:linearOf('#b9b9b9'),open:true});
                const pts=[];for(let k=0;k<=10;k++){const b=front(x+side*.004*s*Math.sin(k/10*Math.PI),y-k/10*.24*s);if(b)pts.push({a:b,lift:.004*s});}
                if(pts.length>2){cord(kit,kit.group('cord',{name:'Drawstrings',roughness:.85,metalness:0}),pts,{radius:.0028*s,color:tone(color,1.25)});
                    cord(kit,kit.group('metal',{name:'Garment hardware',roughness:.3,metalness:.92}),pts.slice(-2),{radius:.0033*s,color:linearOf('#c9c9c9')});}
            }
        }
    }

    /** A strap round a body at a section (a coat belt, a cuff strap): points of the cloth's own outline there. */
    function ring(S,origin,axes,accept,scale){
        const O=need('RRCharacterOutfit','./CharacterOutfit.js');
        return O.crossSection([{positions:S.L.positions,index:Uint32Array.from(S.tris)}],origin,axes,(part,v)=>v<S.n&&accept(v),scale);
    }
    /**
     * A belt round the cloth at height y (a coat's belt, a uniform's): leather or self cloth with
     * its edges stitched, through a buckle in front with its tail laid over, held by keepers.
     */
    function beltAround(kit,S,built,entry,{y,width,thickness,color,buckleColor,accept,keepers=true,self=true,tail=.11}){
        const s=kit.scale,hips=bone(built,'Hips').head,N=56,g=self?clothGroup(kit,entry):kit.group('leather',{name:'Belts',fabric:'leather',roughness:.6,metalness:0});
        const L=S.L,T=Math.max(.0012*s,L.hem?.thickness||.002*s),gap=T*1.05+.0005*s,origin=[hips[0],y,hips[2]];
        const rows=[[y+width/2,gap],[y-width/2,gap]].map(([yy])=>ring(S,[hips[0],yy,hips[2]],[[1,0,0],[0,1,0],[0,0,1]],accept,s));
        // Its outer face and its edges, each point bound to the cloth under it.
        const at=(k,row,lift)=>{const a=k/N*Math.PI*2,p=rows[row](a,gap+lift),hit=S.closest(p,.06*s,ids=>ids.every(accept));return hit?{p,a:anchorAt(S,hit.ids,hit.bary),dir:[Math.sin(a),0,Math.cos(a)]}:null;};
        const face=[],top=[],bot=[];
        for(let k=0;k<=N;k++){
            const A=at(k%N,0,thickness),B=at(k%N,1,thickness),A0=at(k%N,0,0),B0=at(k%N,1,0);
            if(!A||!B||!A0||!B0){face.push(null);continue;}
            const up=unit(sub(A.p,B.p));
            face.push([kit.v(g,A.p,A.dir,color,A.a),kit.v(g,B.p,A.dir,color,B.a)]);
            top.push([kit.v(g,A.p,add(up,mul(A.dir,.3)),tone(color,.95),A.a),kit.v(g,A0.p,up,tone(color,.8),A0.a)]);
            bot.push([kit.v(g,B.p,add(mul(up,-1),mul(A.dir,.3)),tone(color,.9),B.a),kit.v(g,B0.p,mul(up,-1),tone(color,.7),B0.a)]);
        }
        for(let k=0;k<N;k++){const a=face[k],b=face[k+1];if(a&&b)kit.q(g,a[0],b[0],a[1],b[1]);const c=top[k],d=top[k+1];if(c&&d)kit.q(g,c[0],d[0],c[1],d[1]);const e=bot[k],f=bot[k+1];if(e&&f)kit.q(g,e[0],f[0],e[1],f[1]);}
        // Stitching along both edges.
        const thread=threadOf(entry.look);
        for(const off of [width/2-.004*s,-(width/2-.004*s)]){
            const pts=[];for(let k=0;k<=N;k++){const a=k/N*Math.PI*2,p=ring(S,[hips[0],y+off,hips[2]],[[1,0,0],[0,1,0],[0,0,1]],accept,s)(a,gap+thickness+.0003*s),hit=S.closest(p,.06*s,ids=>ids.every(accept));if(hit)pts.push({a:anchorAt(S,hit.ids,hit.bary),lift:dot(sub(p,frameOf(anchorAt(S,hit.ids,hit.bary)).p),frameOf(anchorAt(S,hit.ids,hit.bary)).n)});}
            ribbon(kit,kit.group('stitch',{name:'Top-stitching',tile:'stitch',flat:true,roughness:.78}),pts,{width:.0018*s,color:thread,period:.016*s});
        }
        // The buckle: a frame and its prong, in front, the tail out through it and over the belt.
        const front=at(0,0,thickness),frontB=at(0,1,thickness);if(!front||!frontB)return;
        const center=mul(add(front.p,frontB.p),.5),out=front.dir,side=[1,0,0],upv=[0,1,0];
        const metal=kit.group('metal',{name:'Garment hardware',roughness:.3,metalness:.92}),bc=linearOf(buckleColor||'#8b7d64');
        const bw=width*1.25,bh=width*1.3,bar=.0045*s,depth=.003*s,base=add(center,mul(out,.0012*s));
        const box=(c,hx,hy,hz)=>{const corner=(x,y,z)=>add(c,add(add(mul(side,x*hx),mul(upv,y*hy)),mul(out,z*hz)));
            const faces=[[out,[[-1,-1,1],[1,-1,1],[-1,1,1],[1,1,1]]],[mul(out,-1),[[1,-1,-1],[-1,-1,-1],[1,1,-1],[-1,1,-1]]],[upv,[[-1,1,1],[1,1,1],[-1,1,-1],[1,1,-1]]],[mul(upv,-1),[[-1,-1,-1],[1,-1,-1],[-1,-1,1],[1,-1,1]]],[side,[[1,-1,1],[1,-1,-1],[1,1,1],[1,1,-1]]],[mul(side,-1),[[-1,-1,-1],[-1,-1,1],[-1,1,-1],[-1,1,1]]]];
            for(const [n,cs] of faces){const ids=cs.map(q=>kit.v(metal,corner(...q),n,bc,front.a));kit.q(metal,...ids);}};
        box(add(base,mul(upv,bh/2-bar/2)),bw/2,bar/2,depth);box(add(base,mul(upv,-(bh/2-bar/2))),bw/2,bar/2,depth);
        box(add(base,mul(side,bw/2-bar/2)),bar/2,bh/2,depth);box(add(base,mul(side,-(bw/2-bar/2))),bar/2,bh/2,depth);
        box(add(base,add(mul(side,-bw*.05),mul(out,depth*.9))),bw*.42,.0011*s,.0011*s);
        // The tail: over the belt from the buckle, pointed, with two eyelets.
        const tailPts=[];for(let k=0;k<=8;k++){const a=-(k/8)*tail/.16,p0=rows[0](a,gap+thickness*2.1),p1=rows[1](a,gap+thickness*2.1);tailPts.push([p0,p1,a]);}
        let prev=null;
        for(let k=0;k<tailPts.length;k++){
            const [p0,p1,a]=tailPts[k],m=mul(add(p0,p1),.5),narrow=k===tailPts.length-1?.05:1,q0=lerp3(m,p0,narrow*.95),q1=lerp3(m,p1,narrow*.95),dir=[Math.sin(a),0,Math.cos(a)];
            const hit=S.closest(m,.06*s,ids=>ids.every(accept));if(!hit)continue;const an=anchorAt(S,hit.ids,hit.bary);
            const row=[kit.v(g,q0,dir,tone(color,1.03),an),kit.v(g,q1,dir,tone(color,1.03),an)];
            if(prev)kit.q(g,prev[0],prev[1],row[0],row[1]);prev=row;
        }
        if(keepers)for(const a of [Math.PI*.5,-Math.PI*.5]){
            const A=rows[0](a,gap+thickness+.0018*s),B=rows[1](a,gap+thickness+.0018*s),hit=S.closest(mul(add(A,B),.5),.06*s,ids=>ids.every(accept));if(!hit)continue;
            const an=anchorAt(S,hit.ids,hit.bary),dir=[Math.sin(a),0,Math.cos(a)],along=cross([0,1,0],dir),w=.008*s;
            const A2=add(A,mul([0,1,0],.002*s)),B2=add(B,mul([0,1,0],-.002*s));
            const q=[add(A2,mul(along,-w)),add(A2,mul(along,w)),add(B2,mul(along,-w)),add(B2,mul(along,w))].map(p=>kit.v(g,p,dir,tone(color,1.05),an));kit.q(g,...q);
        }
    }
    /** A strap with a pointed or squared end and a button (an epaulette, a tab): along a line on the cloth. */
    function strap(kit,S,entry,{from,to,width,lift,color,button:btn,accept,pointed=true}){
        const s=kit.scale,g=clothGroup(kit,entry),ex=unit(sub(to,from)),mid=mul(add(from,to),.5),lenS=len(sub(to,from));
        const hit=S.closest(mid,.08*s,accept);if(!hit)return;
        const f=frameOf(anchorAt(S,hit.ids,hit.bary)),ax=unit(along(ex,f.n)),ay=cross(f.n,ax);
        const P=panel(kit,g,S,{origin:f.p,ex:ax,ey:ay,cols:6,rows:2,color,accept,
            shape:(u,v)=>{const x=(u-.5)*lenS,y=(v-.5)*width;return [x+(pointed&&u===0?0:0),y*(pointed?1-ss(.0,.12,.12-u)*.0:1)+(pointed&&u<.1?-y*(1-u/.1)*.55:0)];},
            height:(u,v)=>lift+.0008*s*Math.sin(Math.PI*v)});
        const thread=threadOf(entry.look);seamFrom(kit,S,insetLine(S,P,.0035*s,accept,0),{origin:f.p,ex:ax,ey:ay,accept,lift:lift+.0009*s,thread});
        if(btn){const b=S.closest(add(f.p,mul(ax,-lenS*.36)),.05*s,accept);if(b)button(kit,anchorAt(S,b.ids,b.bary),{radius:btn.radius*s,color:btn.color,holes:4,height:lift+.0018*s});}
    }

    /** A trench coat's own: storm flap, back yoke, belt, epaulettes and cuff straps. */
    function trenchDetails(kit,S,built,entry,d,skirt){
        const s=kit.scale,L=S.L,F=L.field,look=entry.look,color=linearOf(look.color||'#7b6345'),T=Math.max(.0015*s,L.hem?.thickness||.003*s),thread=threadOf(look);
        const hips=bone(built,'Hips').head,neck=bone(built,'Neck').head,cx=hips[0],yAt=sv=>hips[1]+(neck[1]-hips[1])*sv/4,trunk=v=>F[v].fam===0;
        const buttonColor=linearOf('#2a2018');
        if(d.straps!==false){
            // Storm flap on the right breast, its edge on the lapel's; the back yoke, a cape over the shoulder blades.
            const front=projector(S,1,facing1(S,1)),back=projector(S,-1,facing1(S,-1));
            const fx=cx-.13*s,fy=yAt(3.55),locate=(px,py)=>front(fx+px,fy+py);
            const P=panel(kit,clothGroup(kit,entry),S,{cols:6,rows:6,color,locate,shape:(u,v)=>{const W=.12*s,H=.19*s;return [(u-.5)*W,-v*H+(v>.8&&u<.3?(.3-u)*(v-.8)/.2*.06*s:0)];},height:()=>T*1.15+.0006*s});
            seamFrom(kit,S,insetLine(S,P,.005*s,null,0),{locate,lift:T*1.15+.0012*s,thread});
            const fb=locate(-.045*s,-.17*s);if(fb)button(kit,fb,{radius:.0095*s,color:buttonColor,holes:4,height:T*1.2+.003*s});
            const bx=cx,by=yAt(3.7),locB=(px,py)=>back(bx+px,by+py);
            const Y=panel(kit,clothGroup(kit,entry),S,{cols:10,rows:6,color,locate:locB,shape:(u,v)=>{const W=.4*s,H=.2*s;const xx=(u-.5)*W;return [xx,-v*(H-.03*s*Math.abs(2*u-1))];},height:()=>T*1.15+.0006*s});
            seamFrom(kit,S,insetLine(S,Y,.006*s,null,0),{locate:locB,lift:T*1.15+.0012*s,thread});
            // Epaulettes from the neck to the shoulder point.
            for(const side of ['Left','Right']){
                const arm=bone(built,side+'Arm').head,sh=bone(built,side+'Shoulder').head,from=lerp3([neck[0],neck[1],neck[2]],arm,.32),to=lerp3(sh,arm,1.02);
                const lift=.12*s,A=S.closest(add(from,[0,lift,0]),.2*s,trunkOnly(S)),B=S.closest(add(to,[0,lift,0]),.2*s);
                if(A&&B)strap(kit,S,entry,{from:frameOf(anchorAt(S,A.ids,A.bary)).p,to:frameOf(anchorAt(S,B.ids,B.bary)).p,width:.042*s,lift:T*1.25+.0008*s,color:tone(color,1.02),button:{radius:.0085,color:buttonColor}});
            }
            // Cuff straps a hand's breadth up each sleeve, buckled outside.
            for(const fam of [1,2]){
                const side=fam===1?'Left':'Right',wrist=bone(built,side+'Hand').head,elbow=bone(built,side+'ForeArm').head,axis=unit(sub(wrist,elbow));
                const ends=borderRuns(S,v=>F[v].fam===fam);if(!ends.length)continue;
                let tip=-Infinity,end=null;for(const v of ends[0].run){const k=dot(sub(S.p(v),elbow),axis);if(k>tip){tip=k;end=S.p(v);}}
                const at=add(elbow,mul(axis,tip-.075*s)),x0=unit(cross(axis,[0,0,1])),z0=cross(x0,axis);
                const R=ring(S,at,[x0,axis,z0],v=>F[v].fam===fam,s),N=28,w=.032*s,lift=T*1.2+.0004*s,g=clothGroup(kit,entry);
                const rowsP=[-w/2,w/2].map(off=>Array.from({length:N+1},(_,k)=>{const a=k/N*Math.PI*2,p=add(R(a,lift),mul(axis,off));const hit=S.closest(p,.05*s,famOnly(S,fam));return hit?{p,a:anchorAt(S,hit.ids,hit.bary),dir:unit(sub(p,at))}:null;}));
                const rowsL=[-w/2,w/2].map(off=>Array.from({length:N+1},(_,k)=>{const a=k/N*Math.PI*2,p=add(R(a,.0004*s),mul(axis,off));const hit=S.closest(p,.05*s,famOnly(S,fam));return hit?{p,a:anchorAt(S,hit.ids,hit.bary)}:null;}));
                const V=rowsP.map(r=>r.map(q=>q&&kit.v(g,q.p,q.dir,color,q.a))),VL=rowsL.map((r,ri)=>r.map((q,k)=>q&&rowsP[ri][k]&&kit.v(g,q.p,add(mul(axis,ri?1:-1),rowsP[ri][k].dir),tone(color,.8),q.a)));
                for(let k=0;k<N;k++){const a=V[0][k],b=V[0][k+1],c=V[1][k],e=V[1][k+1];if(a!=null&&b!=null&&c!=null&&e!=null)kit.q(g,a,b,c,e);
                    for(const ri of [0,1]){const p=V[ri][k],q=V[ri][k+1],r=VL[ri][k],t=VL[ri][k+1];if(p!=null&&q!=null&&r!=null&&t!=null)kit.q(g,p,q,r,t);}}
                const outside=fam===1?[1,0,0]:[-1,0,0];let bk=0,bs=-Infinity;for(let k=0;k<N;k++){const q=rowsP[0][k];if(!q)continue;const sc=dot(q.dir,outside);if(sc>bs){bs=sc;bk=k;}}
                const q=rowsP[0][bk],q2=rowsP[1][bk];if(q&&q2){const c=mul(add(q.p,q2.p),.5),hit=S.closest(c,.05*s,famOnly(S,fam));if(hit)rivet(kit,anchorAt(S,hit.ids,hit.bary),{radius:.008*s,color:linearOf('#8b7d64'),open:true});}
            }
        }
        if(d.belt!==false){
            const y=yAt(1.15),accept=v=>F[v].fam===0&&v<S.n;
            beltAround(kit,S,built,entry,{y,width:.045*s,thickness:T*1.1+.001*s,color:tone(color,1.0),buckleColor:'#7c705c',accept,self:true});
        }
    }

    /** Princess seams down a fitted bodice, front and back, from the shoulder over the bust to the waist. */
    function princessSeams(kit,S,built,entry){
        const s=kit.scale,L=S.L,F=L.field,color=linearOf(entry.look.color||'#a8324a'),thread=threadOf(entry.look),hips=bone(built,'Hips').head,neck=bone(built,'Neck').head,cx=hips[0];
        const yAt=sv=>hips[1]+(neck[1]-hips[1])*sv/4;
        const curve=y=>{const t=clamp((y-yAt(1))/(yAt(3.7)-yAt(1)),0,1);return (.068+.034*Math.sin(t*Math.PI*.95)-.012*t)*s;};
        for(const face of [1,-1]){
            const take=v=>F[v].fam===0&&Math.cos(F[v].spineAng)*face>.35&&F[v].s>.6;
            for(const side of [-1,1])for(const run of isoLines(S,v=>take(v)?(S.p(v)[0]-cx)*side-curve(S.p(v)[1]):1,ids=>ids.every(take)))if(run.length>3)seam(kit,run.map(a=>({a})),{color,thread,rows:entry.look.material==='silk'?0:1,groove:true,side:-side});
        }
    }
    /** A skirt's waistband: its top, a band of its own, stitched, with a button at the side. */
    function skirtWaistband(kit,S,built,entry,width=.032){
        const s=kit.scale,L=S.L,F=L.field,color=linearOf(entry.look.color||'#5b3a6e'),thread=threadOf(entry.look),T=Math.max(.0012*s,L.hem?.thickness||.0018*s);
        const top=v=>F[v].u<.25;
        band(kit,clothGroup(kit,entry),S,{value:v=>top(v)?L.edge[v]-width:1,height:T+.0004*s,color:tone(color,1.03)});
        for(const e of [.004,width-.004])for(const run of isoLines(S,v=>top(v)?L.edge[v]-e:1,null))if(run.length>3)seam(kit,run.map(a=>({a,lift:T+.0008*s})),{color,thread,rows:1,groove:false,first:0});
    }
    /** A lining inside the cloth where it is seen (a bell sleeve's mouth, an open neckline), in its own color. */
    function lining(kit,S,entry,{color,reach=.09,take}){
        const s=kit.scale,L=S.L,T=Math.max(.001*s,L.hem?.thickness||.002*s);
        const g=kit.group('lining',{name:'Garment lining',fabric:'satin',roughness:.55,metalness:0});
        band(kit,g,S,{value:v=>take(v)?L.edge[v]-reach:1,height:-T*1.3-.0004*s,color,turn:false,lineOut:false});
    }
    /** Patch pockets with flaps on a work garment's chest, buttoned. */
    function chestPockets(kit,S,built,entry,{flap=true,sides=[-1,1],at=2.75,x=.095,W=.12,H=.135,button:btn=true,face=1,buttonColor=null}={}){
        const s=kit.scale,L=S.L,color=linearOf(entry.look.color||'#405a78'),thread=threadOf(entry.look),T=Math.max(.0012*s,L.hem?.thickness||.0018*s);
        const hips=bone(built,'Hips').head,neck=bone(built,'Neck').head,cx=hips[0],front=projector(S,face,facing1(S,face)),y=hips[1]+(neck[1]-hips[1])*at/4,g=clothGroup(kit,entry);
        for(const side of sides){
            const px=cx+side*x*s,locate=(a,b)=>front(px+a,y+b),Wm=W*s,Hm=H*s;
            const P=panel(kit,g,S,{cols:5,rows:6,color:tone(color,1.02),locate,shape:(u,v)=>{const xx=(u-.5)*Wm;return [xx,-v*Hm+(v>.85?Math.max(0,Math.abs(xx)-Wm*.4)*(v-.85)/.15*.5:0)];},height:(u,v)=>T*1.05+.0012*s*Math.sin(Math.PI*u)*Math.sin(Math.PI*v)});
            seamFrom(kit,S,insetLine(S,P,.003*s,null,0),{locate,lift:T*1.05+.0016*s,thread,rows:1});
            if(flap){
                const F2=panel(kit,g,S,{cols:5,rows:2,color:tone(color,1.0),locate:(a,b)=>front(px+a,y+.006*s+b),shape:(u,v)=>{const xx=(u-.5)*Wm*1.04;return [xx,-v*.045*s-(v>.5?(1-Math.abs(2*u-1))*.012*s*(v-.5)*2:0)];},height:()=>T*1.05+.0034*s});
                seamFrom(kit,S,insetLine(S,F2,.003*s,null,0),{locate:(a,b)=>front(px+a,y+.006*s+b),lift:T*1.05+.0038*s,thread});
                if(btn){const b=front(px,y-.03*s);if(b)button(kit,b,{radius:.0062*s,color:buttonColor?linearOf(buttonColor):tone(color,.5),holes:4,height:T*1.05+.0055*s});}
            }
        }
    }

    /** A bound point on a piece at a rest height `y` (meters, average body) and spine bearing `ang` (the catalog's `pockets` measure). */
    function atRest(S,y,ang){
        const F=S.L.field;let best=-1,bs=Infinity;
        for(let v=0;v<S.n;v++){const f=F[v];if(f.fam!==0)continue;let da=Math.abs(f.spineAng-ang);if(da>Math.PI)da=2*Math.PI-da;const k=Math.abs(f.y-y)+da*.15;if(k<bs){bs=k;best=v;}}
        return best<0?null:best;
    }
    /**
     * An open front's button bands: each front edge faced in a band of its own cloth, stitched,
     * buttons down the wearer's left, buttonholes (dark slits) down the right.
     */
    function frontPlacket(kit,S,built,entry,p){
        const s=kit.scale,L=S.L,F=L.field,color=linearOf(entry.look.color||'#56583c'),thread=threadOf(entry.look),T=Math.max(.0012*s,L.hem?.thickness||.0018*s),g=clothGroup(kit,entry);
        const W=p.width??.03,lo=p.from??.5,hi=p.to??3.7;
        const opening=v=>F[v].fam===0&&Math.cos(F[v].spineAng)>.55&&F[v].s>lo&&F[v].s<hi;
        // Its distance from the opening's own edge (not the hem's): the border vertices of the opening only.
        const edge=[...new Set(L.piece.border.flat())].filter(v=>opening(v)&&Math.abs(F[v].spineAng)<.9);if(edge.length<4)return;
        const R=edge.map(v=>S.p(v)),dist=new Float32Array(S.n).fill(1);
        for(let v=0;v<S.n;v++){if(!opening(v))continue;const q=S.p(v);let b=Infinity;for(const r of R){const d=(q[0]-r[0])**2+(q[1]-r[1])**2+(q[2]-r[2])**2;if(d<b)b=d;}dist[v]=Math.sqrt(b)/s;}
        band(kit,g,S,{value:v=>opening(v)?dist[v]-W:1,height:T*.9+.0004*s,color:tone(color,1.03),turn:true});
        for(const run of isoLines(S,v=>opening(v)?dist[v]-(W-.004):1,null))if(run.length>2)seam(kit,run.map(a=>({a,lift:T*.9+.0008*s})),{color,thread,rows:1,groove:false,first:0});
        const n=p.buttons??5,hips=bone(built,'Hips').head;
        for(const side of [1,-1]){
            const run=edge.filter(v=>Math.sign(S.p(v)[0]-hips[0])===side).sort((a,b)=>S.p(b)[1]-S.p(a)[1]);if(run.length<2)continue;
            const top=S.p(run[0])[1]-.03*s,bot=S.p(run[run.length-1])[1]+.05*s;
            for(let k=0;k<n;k++){
                const y=n>1?mix(top,bot,k/(n-1)):top;let e=run[0],bd=Infinity;for(const v of run){const d=Math.abs(S.p(v)[1]-y);if(d<bd){bd=d;e=v;}}
                const at=add(S.p(e),[-side*W*.5*s,0,0]),hit=S.closest(at,.04*s,trunkOnly(S));if(!hit)continue;const a=anchorAt(S,hit.ids,hit.bary);
                if(side>0)button(kit,a,{radius:(p.radius??.0075)*s,color:linearOf(p.buttonColor||'#2a2620'),holes:4,height:T*.9+.0022*s});
                else{const f=frameOf(a),across=unit(along([1,0,0],f.n));ribbonLine(kit,S,[-1,0,1].map(k=>{const h=S.closest(add(f.p,mul(across,k*.008*s)),.03*s,trunkOnly(S));return h&&anchorAt(S,h.ids,h.bary);}),{width:.0024*s,lift:T*.9+.0006*s,color:tone(color,.3)});}
            }
        }
    }
    /** Buttoned flaps over the top of a garment's own sewn pockets (its catalog `pockets`, by index). */
    function pocketFlaps(kit,S,built,entry,p,pockets){
        const s=kit.scale,L=S.L,color=linearOf(entry.look.color||'#56583c'),thread=threadOf(entry.look),T=Math.max(.0012*s,L.hem?.thickness||.0018*s),g=clothGroup(kit,entry),front=projector(S,1,facing1(S,1));
        for(const k of p.pockets||pockets.map((_,i)=>i)){
            const q=pockets[k];if(!q)continue;const v=atRest(S,q.y+q.h/2,q.ang);if(v==null)continue;
            const c=S.p(v),W=q.w*1.08*s,H=(p.h??.045)*s,locate=(x,y)=>front(c[0]+x,c[1]+.006*s+y);
            const P=panel(kit,g,S,{cols:5,rows:2,color,locate,shape:(u,v2)=>{const x=(u-.5)*W;return [x,-v2*H-(v2>.5?(1-Math.abs(2*u-1))*(p.point??.012)*s*(v2-.5)*2:0)];},height:()=>T*1.05+.0038*s});
            seamFrom(kit,S,insetLine(S,P,.004*s,null,0),{locate,lift:T*1.05+.0042*s,thread});
            if(p.button!==false){const b=locate(0,-H*.62);if(b)button(kit,b,{radius:(p.radius??.0065)*s,color:linearOf(p.buttonColor||'#2a2620'),holes:4,height:T*1.05+.006*s});}
        }
    }
    /** A storm (gun) flap on the right breast, from the shoulder seam down, its corner buttoned. */
    function stormFlap(kit,S,built,entry,p){
        const s=kit.scale,L=S.L,color=linearOf(entry.look.color||'#8a7556'),thread=threadOf(entry.look),T=Math.max(.0015*s,L.hem?.thickness||.003*s);
        const hips=bone(built,'Hips').head,neck=bone(built,'Neck').head,yAt=sv=>hips[1]+(neck[1]-hips[1])*sv/4,front=projector(S,1,facing1(S,1));
        const side=p.side??-1,fx=hips[0]+side*(p.x??.12)*s,fy=yAt(p.s??3.6),W=(p.w??.12)*s,H=(p.h??.19)*s,locate=(x,y)=>front(fx+x*(-side),fy+y);
        const P=panel(kit,clothGroup(kit,entry),S,{cols:6,rows:6,color,locate,shape:(u,v)=>[(u-.5)*W,-v*H+(v>.8&&u<.3?(.3-u)*(v-.8)/.2*.06*s:0)],height:()=>T*1.15+.0006*s});
        seamFrom(kit,S,insetLine(S,P,.005*s,null,0),{locate,lift:T*1.15+.0012*s,thread});
        const b=locate(-W*.36,-H*.88);if(b)button(kit,b,{radius:(p.radius??.009)*s,color:linearOf(p.buttonColor||'#2a2018'),holes:4,height:T*1.2+.003*s});
    }
    /**
     * A throat latch: a tab buttoned across the top of an open front, under the collar. Its middle
     * bridges the opening (each point bound to the nearer of its two buttoned ends).
     */
    function throatLatch(kit,S,built,entry,p){
        const s=kit.scale,L=S.L,F=L.field,color=linearOf(entry.look.color||'#8a7556'),thread=threadOf(entry.look),T=Math.max(.0015*s,L.hem?.thickness||.003*s),g=clothGroup(kit,entry);
        const hips=bone(built,'Hips').head;
        // The opening's two edges at the latch's height: the front border vertices either side, just under the collar.
        const sv=p.s??3.62,edge=[...new Set(L.piece.border.flat())].filter(v=>F[v].fam===0&&Math.cos(F[v].spineAng)>.6&&Math.abs(F[v].s-sv)<.25);
        const ends=[1,-1].map(side=>{let best=null,bs=Infinity;for(const v of edge){const q=S.p(v);if(Math.sign(q[0]-hips[0])!==side)continue;const k=Math.abs(F[v].s-sv);if(k<bs){bs=k;best=v;}}return best;});
        if(ends.some(v=>v==null))return;
        const over=(p.over??.028)*s,A=ends.map((v,i)=>{const q=S.p(v),out=[(i?-1:1)*over,0,0],hit=S.closest(add(q,out),.04*s,trunkOnly(S));return hit&&anchorAt(S,hit.ids,hit.bary);});if(!A[0]||!A[1])return;
        const FA=A.map(frameOf),Wd=(p.width??.032)*s,lift=T*1.3+.002*s,N=10,rows=[];
        const up=unit(add(along([0,1,0],FA[0].n),along([0,1,0],FA[1].n)));
        for(let k=0;k<=N;k++){
            const t=k/N,base=lerp3(add(FA[0].p,mul(FA[0].n,lift)),add(FA[1].p,mul(FA[1].n,lift)),t),n=unit(lerp3(FA[0].n,FA[1].n,t)),a=A[t<.5?0:1];
            // Pointed ends; it stands a little proud across the gap.
            const w=Wd*(k===0||k===N?.45:1)/2,bow=n.map(c=>c*.003*s*Math.sin(Math.PI*t));
            rows.push([kit.v(g,add(add(base,bow),mul(up,w)),n,color,a),kit.v(g,add(add(base,bow),mul(up,-w)),n,color,a),kit.v(g,add(add(base,mul(n,-T)),mul(up,w)),mul(n,-1),tone(color,.7),a),kit.v(g,add(add(base,mul(n,-T)),mul(up,-w)),mul(n,-1),tone(color,.7),a)]);
        }
        for(let k=0;k<N;k++){const [a,b,c,d]=rows[k],[e,f,h,i]=rows[k+1];kit.q(g,a,e,b,f);kit.q(g,c,h,d,i);kit.q(g,a,e,c,h);kit.q(g,b,f,d,i);}
        for(const a of A)button(kit,a,{radius:(p.radius??.0075)*s,color:linearOf(p.buttonColor||'#2a2018'),holes:4,height:lift+.002*s});
        void thread;
    }

    /**
     * Details a garment declares as data (its catalog entry's `construction.parts`), placed by
     * spine position `s` (see RRCharacterWardrobe's header) and meters `x` from the center line,
     * on its front (`face` 1) or back (-1). See this file's header for the list of kinds.
     */
    function declared(kit,S,built,entry,d,list){
        const W=need('RRCharacterWardrobe','./CharacterWardrobe.js'),s=kit.scale,L=S.L,F=L.field,color=linearOf(entry.look.color||'#808080'),thread=threadOf(entry.look),T=Math.max(.0012*s,L.hem?.thickness||.0018*s);
        const hips=bone(built,'Hips').head,neck=bone(built,'Neck').head,cx=hips[0],yAt=sv=>hips[1]+(neck[1]-hips[1])*sv/4,proj={};
        const at=(face,x,sv)=>(proj[face]||(proj[face]=projector(S,face,facing1(S,face))))(cx+x*s,yAt(sv));
        // `when`: a detail choice, or any of the item's own keys (a style), by name or [name, value].
        const val=k=>d[k]!==undefined?d[k]:(entry.item||{})[k],on=p=>p.when==null||(Array.isArray(p.when)?val(p.when[0])===p.when[1]:val(p.when)!==false&&val(p.when)!=='none');
        const hex=(h,fallback)=>h?linearOf(h):fallback;
        for(const p of list||[]){
            if(!on(p))continue;const face=p.face??1,mirror=p.mirror!==false;
            switch(p.kind){
                case 'patchPocket':chestPockets(kit,S,built,entry,{flap:!!p.flap,sides:mirror?[-1,1]:[Math.sign(p.x??1)||1],at:p.s??2.75,x:Math.abs(p.x??.095),W:p.w??.12,H:p.h??.135,button:p.button!==false&&!!p.flap,face,buttonColor:p.buttonColor});break;
                case 'weltPocket':for(const side of mirror?[-1,1]:[1]){const x=(p.x??.1)*side,W=(p.w??.12)*s,loc=dx=>at(face,x+dx/s,p.s??1.2);ribbonLine(kit,S,[loc(-W/2),loc(0),loc(W/2)],{width:.0028*s,lift:.0004*s,color:tone(color,.3)});const lip=(p.lip??.008)*s;ribbonLine(kit,S,[-W/2,0,W/2].map(dx=>(proj[face]||(proj[face]=projector(S,face,facing1(S,face))))(cx+x*s+dx,yAt(p.s??1.2)-lip*.6)),{width:lip,lift:T*.8,color:tone(color,1.04),cloth:entry});}break;
                case 'buttons':for(const [sv,x] of p.at||[]){const a=at(face,x,sv);if(a)button(kit,a,{radius:(p.radius??.007)*s,color:hex(p.color,tone(color,.45)),holes:p.holes??4,metal:!!p.metal,dome:!!p.metal});}break;
                case 'toggles':for(const [sv,x] of p.at||[]){const a=at(face,x,sv),b=at(face,x+(p.length??.035)*.5*Math.sign(x||1),sv);if(a&&b)cord(kit,kit.group('buttons',{name:'Garment buttons',roughness:.38,metalness:0}),[{a,lift:T+.004*s},{a:b,lift:T+.004*s}],{radius:(p.radius??.005)*s,color:hex(p.color,linearOf('#5a3e26'))});}break;
                case 'rivets':for(const [sv,x] of p.at||[]){const a=at(face,x,sv);if(a)rivet(kit,a,{radius:(p.radius??.004)*s,color:hex(p.color,linearOf('#b08d57')),open:!!p.open});}break;
                case 'strap':for(const side of mirror?[1,-1]:[1]){const A=at(face,p.from[1]*side,p.from[0]),B=at(face,p.to[1]*side,p.to[0]);if(A&&B)strap(kit,S,entry,{from:frameOf(A).p,to:frameOf(B).p,width:(p.width??.035)*s,lift:T*1.2+.0008*s,color:hex(p.color,tone(color,1.03)),button:p.button===false?null:{radius:p.buttonRadius??.007,color:hex(p.buttonColor,tone(color,.45))},accept:null});}break;
                case 'epaulettes':for(const side of ['Left','Right']){const arm=bone(built,side+'Arm').head,sh=bone(built,side+'Shoulder').head,from=lerp3(neck,arm,.32),to=lerp3(sh,arm,1.02),A=S.closest(add(from,[0,.12*s,0]),.2*s,trunkOnly(S)),B=S.closest(add(to,[0,.12*s,0]),.2*s);if(A&&B)strap(kit,S,entry,{from:frameOf(anchorAt(S,A.ids,A.bary)).p,to:frameOf(anchorAt(S,B.ids,B.bary)).p,width:(p.width??.04)*s,lift:T*1.2+.0008*s,color:hex(p.color,tone(color,1.03)),button:{radius:.0068,color:hex(p.buttonColor,tone(color,.45))}});}break;
                case 'belt':beltAround(kit,S,built,entry,{y:yAt(p.s??1.1),width:(p.width??.04)*s,thickness:(p.thickness??.003)*s,color:hex(p.color,tone(color,1)),buckleColor:p.buckle||'#8b7d64',accept:v=>F[v].fam===0,keepers:p.keepers!==false,self:!p.color,tail:p.tail??.08});break;
                case 'placket':shirtFront(kit,S,built,entry,{},{placket:(p.width??.034)/2,placketTo:p.to??.6,buttons:p.buttons??0,yoke:!!p.yoke,cuffs:!!p.cuffs,buttonRadius:p.radius??.006,buttonColor:p.buttonColor});break;
                case 'ribBands':ribBands(kit,S,built,entry,{neck:p.neck??0,cuffs:p.cuffs??0,hem:p.hem??0});break;
                case 'drawstrings':hoodieFront(kit,S,built,entry,{pocket:false,drawstrings:true});break;
                case 'pouch':hoodieFront(kit,S,built,entry,{pocket:true,drawstrings:false});break;
                case 'seam':{const pts=(p.path||[]).map(([sv,x])=>at(face,x,sv)).filter(Boolean);if(pts.length>1)seam(kit,resample(S,pts,.008*s).map(a=>({a})),{color,thread:hex(p.thread,thread),rows:p.rows??1,groove:p.groove!==false});break;}
                case 'cuffs':shirtFront(kit,S,built,entry,{},{placket:0,yoke:false,cuffs:true,cuffWidth:p.width??.06,buttonColor:p.buttonColor||'#2a2620'});break;
                case 'frontPlacket':frontPlacket(kit,S,built,entry,p);break;
                case 'pocketFlaps':pocketFlaps(kit,S,built,entry,p,W.BY_ID.get(entry.garment)?.pockets||[]);break;
                case 'stormFlap':stormFlap(kit,S,built,entry,p);break;
                case 'throatLatch':throatLatch(kit,S,built,entry,p);break;
                case 'lining':lining(kit,S,entry,{color:hex(p.color,tone(color,.5)),reach:p.reach??.06,take:v=>p.on==='sleeves'?(F[v].fam===1||F[v].fam===2)&&F[v].s>1.6:F[v].fam===0&&F[v].s>2.4});break;
            }
        }
    }

    /**
     * Every construction detail of an outfit's cut garments, on their finished cloth. Each
     * garment's `details` choices come from its outfit item (RRCharacterWardrobe.detailsOf).
     */
    function construct(pack,built,entries){
        if(root.RR_DETAILS_OFF)return [];
        const W=need('RRCharacterWardrobe','./CharacterWardrobe.js'),s=built.height/1.7,kit=makeKit(s),surfaces=new Map();
        const surf=i=>{let S=surfaces.get(i);if(!S){S=clothSurface(entries[i],i,s);surfaces.set(i,S);}return S;};
        for(let i=0;i<entries.length;i++){
            const e=entries[i];if(e.lining||!e.item||!W.detailsOf)continue;
            const d=W.detailsOf(e.item),id=e.garment,g=W.BY_ID.get(id);if(!d||!g)continue;
            const spec=g.construction;
            try{
                const S=surf(i),bodice=!e.skirt;
                if(spec&&spec.tailored&&bodice){
                    const skirt=entries.findIndex(q=>q.garment===id&&q.skirt&&!q.lining);
                    tailoredFront(kit,S,built,e,d,spec,skirt>=0?surf(skirt):null);
                    if(id==='trenchcoat')trenchDetails(kit,S,built,e,d);
                }
                if(spec&&spec.tailored&&e.skirt&&d.vent!==false&&spec.vent){
                    const L=S.L,F=L.field,color=linearOf(e.look.color),back=projector(S,-1),hips=bone(built,'Hips').head;
                    let bottom=Infinity,top=-Infinity;for(let v=0;v<S.n;v++){if(Math.cos(F[v].spineAng)>-.9)continue;const y=S.p(v)[1];bottom=Math.min(bottom,y);top=Math.max(top,y);}
                    if(isFinite(bottom)){const pts=[];for(let k=0;k<=10;k++)pts.push(back(hips[0],bottom+.004*s+k/10*Math.min(spec.vent*s,top-bottom-.01*s)));
                        const run=resample(S,pts.filter(Boolean),.008*s);seam(kit,run.map(a=>({a})),{color,thread:threadOf(e.look),rows:0,groove:true});
                        ribbonLine(kit,S,pts.filter(Boolean),{width:.0018*s,lift:.0004*s,color:tone(color,.35)});
                        const lap=[];for(let k=0;k<=6;k++){const y=bottom+.003*s+k/6*Math.min(spec.vent*s,top-bottom-.01*s);lap.push(back(hips[0]+.012*s,y));}
                        ribbonLine(kit,S,lap.filter(Boolean),{width:.022*s,lift:Math.max(.0012*s,L.hem?.thickness||.002*s)*.9,color:tone(color,1.02),cloth:e});}
                }
                switch(id){
                    case 'shirt':shirtFront(kit,S,built,e,d,{});break;
                    case 'polo':shirtFront(kit,S,built,e,{},{placket:.016,placketTo:3.05,buttons:2,yoke:false,cuffs:false,buttonRadius:.0048});ribBands(kit,S,built,e,{neck:0,cuffs:(e.item.sleeves??.3)<.8?.022:.05,hem:0});break;
                    case 'tshirt':case 'cropTop':if(d.ribs!==false)ribBands(kit,S,built,e,{neck:.016,cuffs:0,hem:0});twinNeedle(kit,S,e);break;
                    case 'tanktop':if(d.ribs!==false)ribBands(kit,S,built,e,{neck:.012,cuffs:0,hem:0});twinNeedle(kit,S,e,{sleeve:0});break;
                    case 'sweater':if(d.ribs!==false)ribBands(kit,S,built,e,{neck:e.item.neckline==='turtle'?.06:.022,cuffs:.065,hem:.055});break;
                    case 'hoodie':if(d.ribs!==false)ribBands(kit,S,built,e,{neck:0,cuffs:.06,hem:.06});hoodieFront(kit,S,built,e,d);break;
                    case 'cardigan':if(d.ribs!==false)ribBands(kit,S,built,e,{neck:0,cuffs:.045,hem:.04});
                        {const L=S.L,F=L.field;band(kit,kit.group('rib:'+e.roughness,{name:'Rib knit bands',fabric:'rib',ribbed:true,roughness:e.roughness??.9,metalness:0}),S,{value:v=>F[v].fam===0&&Math.cos(F[v].spineAng)>.2&&F[v].s>.3?L.edge[v]-.022:1,height:Math.max(.0015*s,L.hem?.thickness||.002*s)*1.2,color:tone(linearOf(e.look.color),.96)});}
                        if(d.pockets==='patch')chestPockets(kit,S,built,e,{flap:false,at:1.1,x:.1,W:.13,H:.14});break;
                    case 'jeans':case 'shorts':case 'capri':case 'flaredTrousers':case 'cargoTrousers':case 'swimTrunks':trousers(kit,S,built,e,d);break;
                    case 'skirt':case 'pleatedSkirt':case 'pencilSkirt':case 'kilt':if(d.waistband!==false&&e.skirt)skirtWaistband(kit,S,built,e);break;
                    case 'dress':case 'gown':case 'ballGown':case 'eveningGown':case 'qipao':case 'tennisDress':case 'balletDress':if(bodice&&d.seams!==false)princessSeams(kit,S,built,e);break;
                    case 'robe':if(bodice&&d.lining!==false){const F=S.L.field,lc=linearOf(e.item.color2||shadeLining(e.item.color));lining(kit,S,e,{color:lc,reach:.12,take:v=>(F[v].fam===1||F[v].fam===2)&&F[v].s>1.6});lining(kit,S,e,{color:lc,reach:.05,take:v=>F[v].fam===0&&F[v].s>2.4});}break;
                    case 'coveralls':{const F=S.L.field;for(const fam of [3,4]){const sideSign=fam===3?-1:1,ok=ids=>ids.every(v=>F[v].fam===fam&&F[v].s>.15)&&Math.max(...ids.map(v=>F[v].la))-Math.min(...ids.map(v=>F[v].la))<Math.PI;for(const run of isoLines(S,v=>F[v].la*sideSign-Math.PI/2,ok))if(run.length>3)seam(kit,run.map(a=>({a})),{color:linearOf(e.look.color),thread:threadOf(e.look),rows:1,groove:true});}break;}
                    case 'vest':if(d.pockets!=='none'){const front=projector(S,1,facing1(S,1)),hips=bone(built,'Hips').head,neck=bone(built,'Neck').head,y=hips[1]+(neck[1]-hips[1])*1.25/4,color=linearOf(e.look.color);for(const side of [-1,1]){const x=hips[0]+side*.1*s,W=.085*s;ribbonLine(kit,S,[front(x-W/2,y),front(x,y),front(x+W/2,y)],{width:.0026*s,lift:.0004*s,color:tone(color,.3)});ribbonLine(kit,S,[front(x-W/2,y-.005*s),front(x,y-.005*s),front(x+W/2,y-.005*s)],{width:.008*s,lift:.0016*s,color:tone(color,1.04),cloth:e});}}break;
                }
                // What the garment declares as data (`construction.parts`), on its body or its skirt.
                if(g.construction?.parts)declared(kit,S,built,e,d,g.construction.parts.filter(p=>(p.piece==='skirt')===!!e.skirt));
                // A collar piece of the garment's own: a stand and a fall.
                const collar=bodice?g.pieces(e.item).find(p=>p.collar):null;
                if(collar)collarOn(kit,S,built,e,collar.collar,d,{style:id==='polo'?'rib':id==='fieldCoat'?'convertible':undefined,kind:id==='polo'?'rib':undefined});
            }catch(err){if(root.RR_DETAILS_STRICT)throw err;}
        }
        hidden(kit,entries,surf);
        return kitParts(kit);
    }
    /**
     * Details out of sight under an outer garment are left out (a shirt's yoke and placket under a
     * jacket, trousers' pockets under a long coat): a face is dropped when the cloth of a garment
     * worn over it lies just outside it.
     */
    function hidden(kit,entries,surf){
        const s=kit.scale;
        for(const g of kit.groups.values()){
            if(!g.i.length)continue;
            const keep=[],A=g.anc,P=g.p,H=g.h;
            for(let t=0;t<g.i.length;t+=3){
                const ids=[g.i[t],g.i[t+1],g.i[t+2]],e=A[ids[0]*10],own=entries[e];
                let covered=false;
                if(own){
                    const c=[0,1,2].map(k=>(P[ids[0]*3+k]+P[ids[1]*3+k]+P[ids[2]*3+k])/3),n=unit([0,1,2].map(k=>H[ids[0]*3+k]+H[ids[1]*3+k]+H[ids[2]*3+k]));
                    for(let j=0;j<entries.length&&!covered;j++){
                        const o=entries[j];if(j===e||o.lining||!(o.laid.layer>own.laid.layer)||o.garment===own.garment)continue;
                        // Over it, or so close it would show through the outer cloth: under it either way.
                        const hit=surf(j).closest(add(c,mul(n,.01*s)),.02*s);if(!hit)continue;
                        const q=sub(frameOf(anchorAt(surf(j),hit.ids,hit.bary)).p,c),up=dot(q,n);
                        if(up>-.004*s&&up<.03*s&&len(sub(q,mul(n,up)))<.008*s)covered=true;
                    }
                }
                if(!covered)keep.push(ids[0],ids[1],ids[2]);
            }
            g.i=keep;
        }
    }
    /** A robe's lining: its own color a deep shade richer. */
    const shadeLining=hex=>{const c=linearOf(hex||'#2e3f8a');const l=.2126*c[0]+.7152*c[1]+.0722*c[2];const k=l>.25?.45:2.2;const rgb=c.map(v=>Math.max(0,Math.min(1,v*k)));const to=v=>Math.round(255*(v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055)).toString(16).padStart(2,'0');return '#'+rgb.map(to).join('');};

    const api={build,tailor,apronPanels,leatherFinish,armorFinish,construct,follow,pictures};root.RRCharacterGarmentDetails=api;
    if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
