/** Panel-scale surface detail for the vehicle coating atlas.
 *
 * Game-ready hard-surface models read detailed on simple geometry because
 * their normal, AO and roughness maps carry panel lines, rivet rows, vents,
 * grilles, hatches, access panels and stencil boxes. This module plans that
 * layer for one bake chart (one projection of one painted part) and
 * rasterizes it into per-texel fields, in world meters:
 *
 *   H  height offset (m)        A  ambient occlusion factor (multiplies albedo)
 *   R  roughness offset         T  tone offset (per-panel paint variation)
 *   S  stencil ink (0..1)       M  bare-metal factor
 *
 * The bake (VehicleFinish.bakePanels) turns H into tangent-space normals and
 * a cavity term (grime in the grooves, edge wear on what stands proud).
 * Texels flagged in `keep` (lettering and artwork regions) receive nothing.
 * Layouts are deterministic: a seed from the part name and projection axis,
 * mirrored sides share a layout, so a vehicle stays symmetric.
 * Kits pick the look per part: coach (sparse, road cars), utility, armor,
 * hull (flight), bay, plate (bolted armor), mech (walker, drone) and roof. */
(function(root){
    'use strict';
    const clamp=v=>v<0?0:v>1?1:v,fract=v=>v-Math.floor(v);
    function seedOf(text){let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
    function rng(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296;};}

    /** w×h texels; texel (i, j) covers world [lo0+i*m0, lo0+(i+1)*m0] × [lo1+j*m1, ...]. */
    function Field(w,h,m0,m1,lo0,lo1){
        const n=w*h;Object.assign(this,{w,h,m0,m1,lo0,lo1});
        this.H=new Float32Array(n);this.A=new Float32Array(n).fill(1);this.R=new Float32Array(n);this.T=new Float32Array(n);this.S=new Float32Array(n);this.M=new Float32Array(n);
        this.cover=new Uint8Array(n);this.keep=new Uint8Array(n);this.face=new Float32Array(n);
    }
    /** Visits covered, unreserved texels of a world rectangle grown by `pad`: fn(k, a, b). */
    function each(f,a0,b0,a1,b1,pad,fn){
        const i0=Math.max(0,Math.floor((a0-pad-f.lo0)/f.m0)),i1=Math.min(f.w-1,Math.ceil((a1+pad-f.lo0)/f.m0)),j0=Math.max(0,Math.floor((b0-pad-f.lo1)/f.m1)),j1=Math.min(f.h-1,Math.ceil((b1+pad-f.lo1)/f.m1));
        for(let j=j0;j<=j1;j++){const b=f.lo1+(j+.5)*f.m1;for(let i=i0;i<=i1;i++){const k=j*f.w+i;if(!f.cover[k]||f.keep[k])continue;fn(k,f.lo0+(i+.5)*f.m0,b);}}
    }
    /** Signed distance to a rounded rectangle (negative inside). */
    function sdRect(a,b,ca,cb,ha,hb,r){const qa=Math.abs(a-ca)-(ha-r),qb=Math.abs(b-cb)-(hb-r);return Math.hypot(Math.max(qa,0),Math.max(qb,0))+Math.min(Math.max(qa,qb),0)-r;}
    /** True when a rectangle lies on covered, facing, unreserved surface. */
    function fits(f,a0,b0,a1,b1,minFace=.72){
        const i0=Math.floor((a0-f.lo0)/f.m0),i1=Math.ceil((a1-f.lo0)/f.m0),j0=Math.floor((b0-f.lo1)/f.m1),j1=Math.ceil((b1-f.lo1)/f.m1);
        if(i0<1||j0<1||i1>f.w-2||j1>f.h-2)return false;
        const si=Math.max(1,Math.floor((i1-i0)/6)),sj=Math.max(1,Math.floor((j1-j0)/6));
        for(let j=j0;j<=j1;j+=sj)for(let i=i0;i<=i1;i+=si){const k=j*f.w+i;if(!f.cover[k]||f.keep[k]||f.face[k]<minFace)return false;}
        for(const [i,j]of [[i1,j1],[i0,j1],[i1,j0]]){const k=j*f.w+i;if(!f.cover[k]||f.keep[k]||f.face[k]<minFace)return false;}
        return true;
    }
    // ── rasterized operations (world meters) ──────────────────────────────
    const hwOf=f=>Math.max(.0075,Math.max(f.m0,f.m1)*1.8);
    /** A V-groove along a rounded rectangle outline: a shut line or seam. */
    function groove(f,ca,cb,ha,hb,r,depth,hw=hwOf(f)){
        each(f,ca-ha,cb-hb,ca+ha,cb+hb,hw,(k,a,b)=>{const d=Math.abs(sdRect(a,b,ca,cb,ha,hb,r)),t=1-d/hw;if(t<=0)return;f.H[k]-=depth*t;f.A[k]*=1-.80*t;f.R[k]+=.18*t;});
    }
    /** A straight seam between two points on one axis. */
    function seam(f,a0,b0,a1,b1,depth,hw=hwOf(f)){
        const ca=(a0+a1)/2,cb=(b0+b1)/2,ha=Math.abs(a1-a0)/2,hb=Math.abs(b1-b0)/2;
        each(f,ca-ha,cb-hb,ca+ha,cb+hb,hw,(k,a,b)=>{const d=Math.max(0,sdRect(a,b,ca,cb,ha,hb,0)),t=1-d/hw;if(t<=0)return;f.H[k]-=depth*t;f.A[k]*=1-.86*t;f.R[k]+=.18*t;});
    }
    /** A recess with drafted walls and a darker floor, and a thin raised lip. */
    function recess(f,ca,cb,ha,hb,r,depth,ao=.45){
        const wall=Math.max(f.m0,f.m1)*1.6,lip=wall*.9;
        each(f,ca-ha,cb-hb,ca+ha,cb+hb,lip,(k,a,b)=>{const d=sdRect(a,b,ca,cb,ha,hb,r);if(d<0){const t=clamp(-d/wall);f.H[k]-=depth*t;f.A[k]*=1-ao*t;f.R[k]+=.10*t;}else if(d<lip){f.H[k]+=depth*.12*(1-d/lip);}});
    }
    /** A raised pad (hinge bar, doubler plate). */
    function raised(f,ca,cb,ha,hb,r,height){
        const wall=Math.max(f.m0,f.m1)*1.3;
        each(f,ca-ha,cb-hb,ca+ha,cb+hb,wall,(k,a,b)=>{const d=sdRect(a,b,ca,cb,ha,hb,r);if(d<wall){const t=clamp(-d/wall*.5+.5);f.H[k]+=height*t;if(d>-wall&&d<wall)f.A[k]*=1-.18*(1-Math.abs(d)/wall);}});
    }
    /** Louvers: a recess filled with inclined slats, a shadow gap under each. */
    function louvers(f,ca,cb,ha,hb,depth,alongA){
        recess(f,ca,cb,ha,hb,Math.min(ha,hb)*.18,depth,.25);
        const pitch=Math.max(.018,Math.max(f.m0,f.m1)*3.4);
        each(f,ca-ha,cb-hb,ca+ha,cb+hb,0,(k,a,b)=>{const d=sdRect(a,b,ca,cb,ha,hb,Math.min(ha,hb)*.18);if(d>-Math.max(f.m0,f.m1)*1.5)return;const u=fract(((alongA?a-ca:b-cb))/pitch);f.H[k]+=depth*.82*u;f.A[k]*=.30+.70*u;f.R[k]+=.06*(1-u);});
    }
    /** A perforated grille: a shallow recess and a lattice of dark holes. */
    function grille(f,ca,cb,ha,hb,depth){
        recess(f,ca,cb,ha,hb,Math.min(ha,hb)*.15,depth*.4,.15);
        const pitch=Math.max(.020,Math.max(f.m0,f.m1)*3.2),rad=pitch*.32;
        each(f,ca-ha,cb-hb,ca+ha,cb+hb,0,(k,a,b)=>{if(sdRect(a,b,ca,cb,ha,hb,Math.min(ha,hb)*.15)>-pitch*.6)return;const row=Math.floor((b-cb)/(pitch*.866)),u=(a-ca)/pitch+(row&1?.5:0),v=(b-cb)/(pitch*.866),du=(u-Math.round(u))*pitch,dv=(v-Math.round(v))*pitch*.866,d=Math.hypot(du,dv);if(d<rad){const t=clamp((rad-d)/(rad*.5));f.H[k]-=depth*t;f.A[k]*=1-.80*t;f.R[k]+=.2*t;}});
    }
    /** A domed fastener head with a contact shadow ring. */
    function dome(f,ca,cb,rad,height){
        each(f,ca-rad,cb-rad,ca+rad,cb+rad,rad*.7,(k,a,b)=>{const d=Math.hypot(a-ca,b-cb);if(d<rad){f.H[k]+=height*Math.sqrt(1-(d/rad)**2);f.M[k]=Math.max(f.M[k],.25);}else if(d<rad*1.7)f.A[k]*=1-.30*(1-(d-rad)/(rad*.7));});
    }
    /** Stencil ink: an outline box, or a filled block. */
    function ink(f,ca,cb,ha,hb,thick,fill=false){
        each(f,ca-ha,cb-hb,ca+ha,cb+hb,0,(k,a,b)=>{const d=sdRect(a,b,ca,cb,ha,hb,0);if(fill?d<0:d<0&&d>-thick)f.S[k]=1;});
    }
    function tone(f,a0,b0,a1,b1,dt,dr){each(f,a0,b0,a1,b1,0,(k)=>{f.T[k]+=dt;f.R[k]+=dr;});}

    // ── kits ───────────────────────────────────────────────────────────────
    // grid: [shortest panel, longest panel, row height] in meters; null = no seams.
    const KITS={
        coach:{grid:null,feats:[['fuel',2],['vent',2],['access',1],['stencil',2]],fill:.30,rivets:0,tone:.45,maxFeat:5},
        utility:{grid:[.6,1.15,.55],feats:[['access',3],['vent',2],['stencil',3],['hatch',1],['grille',1]],fill:.42,rivets:0,tone:.9,maxFeat:10},
        armor:{grid:[.5,1.0,.46],feats:[['access',2],['vent',2],['stencil',2],['hatch',2],['grille',2]],fill:.48,rivets:1,tone:1.1,maxFeat:12},
        hull:{grid:[.42,.9,.36],feats:[['access',3],['vent',2],['stencil',2],['hatch',2],['grille',1]],fill:.5,rivets:.35,tone:1,maxFeat:16},
        bay:{grid:[.28,.55,.22],feats:[['vent',3],['access',2],['grille',2],['stencil',1]],fill:.5,rivets:.5,tone:.8,maxFeat:8},
        plate:{grid:null,feats:[['stencil',3],['access',1],['vent',1]],fill:.28,rivets:0,tone:1.4,maxFeat:6},
        mech:{grid:[.30,.62,.28],feats:[['access',3],['vent',3],['stencil',1],['grille',1]],fill:.5,rivets:.5,tone:1,maxFeat:8},
        roof:{grid:null,feats:[['hatch',2],['vent',2],['access',1],['stencil',1]],fill:.5,rivets:0,tone:.6,maxFeat:3}
    };
    /** Draws one feature inside a cell; returns false when it does not fit. */
    function feature(f,kind,cell,next,o){
        const [a0,b0,a1,b1]=cell,ca=(a0+a1)/2,cb=(b0+b1)/2,W=a1-a0,Hh=b1-b0,margin=Math.min(.06,Math.min(W,Hh)*.18);
        const box=(w,h,ax=.5,bx=.5)=>{w=Math.min(w,W-2*margin);h=Math.min(h,Hh-2*margin);if(w<.05||h<.035)return null;const c0=a0+margin+w/2+(W-2*margin-w)*ax,c1=b0+margin+h/2+(Hh-2*margin-h)*bx;return[c0,c1,w/2,h/2];};
        const pos=()=>[.15+.7*next(),.15+.7*next()],deep=o.depth;
        let b;
        if(kind==='access'){b=box(W*(.45+.3*next()),Hh*(.45+.3*next()),...pos());if(!b||!fits(f,b[0]-b[2],b[1]-b[3],b[0]+b[2],b[1]+b[3]))return false;
            groove(f,b[0],b[1],b[2],b[3],Math.min(.025,b[2]*.3,b[3]*.3),deep*.75);
            const s=Math.min(.026,b[2]*.3,b[3]*.3);for(const sa of [-1,1])for(const sb of [-1,1])dome(f,b[0]+sa*(b[2]-s),b[1]+sb*(b[3]-s),.0072,.0013);return true;}
        if(kind==='hatch'){b=box(Math.min(.75,W*.7),Math.min(.6,Hh*.7),...pos());if(!b||b[2]<.07||b[3]<.06||!fits(f,b[0]-b[2],b[1]-b[3],b[0]+b[2],b[1]+b[3]))return false;
            groove(f,b[0],b[1],b[2],b[3],Math.min(.045,b[2]*.35,b[3]*.35),deep);
            // Hinge bar on one edge, a recessed pull on the opposite one.
            const along=b[2]>b[3];if(along){raised(f,b[0],b[1]+b[3]-.022,b[2]*.75,.009,.004,.0022);recess(f,b[0],b[1]-b[3]*.55,.038,.013,.010,.006,.6);}
            else{raised(f,b[0]-b[2]+.022,b[1],.009,b[3]*.75,.004,.0022);recess(f,b[0]+b[2]*.55,b[1],.013,.038,.010,.006,.6);}
            return true;}
        if(kind==='vent'){const along=W>Hh;b=box(along?Math.min(.5,W*.55):Math.min(.2,W*.6),along?Math.min(.18,Hh*.5):Math.min(.42,Hh*.6),...pos());if(!b||!fits(f,b[0]-b[2]-.01,b[1]-b[3]-.01,b[0]+b[2]+.01,b[1]+b[3]+.01))return false;
            louvers(f,b[0],b[1],b[2],b[3],deep*3.2,!along);return true;}
        if(kind==='grille'){b=box(Math.min(.36,W*.5),Math.min(.22,Hh*.5),...pos());if(!b||!fits(f,b[0]-b[2]-.01,b[1]-b[3]-.01,b[0]+b[2]+.01,b[1]+b[3]+.01))return false;
            grille(f,b[0],b[1],b[2],b[3],deep*2.4);return true;}
        if(kind==='fuel'){const rad=.05;const p=pos();const c0=a0+margin+rad+(W-2*margin-2*rad)*p[0],c1=b0+margin+rad+(Hh-2*margin-2*rad)*p[1];if(W<.2||Hh<.2||!fits(f,c0-rad*1.4,c1-rad*1.4,c0+rad*1.4,c1+rad*1.4))return false;
            groove(f,c0,c1,rad,rad,rad,deep*.8);dome(f,c0+rad*.55,c1,.007,.001);return true;}
        if(kind==='stencil'){const w=.08+.12*next(),h=.035+.03*next(),p=pos();const c0=a0+margin+w/2+(W-2*margin-w)*p[0],c1=b0+margin+h/2+(Hh-2*margin-h)*p[1];if(W-2*margin<w||Hh-2*margin<h||!fits(f,c0-w/2,c1-h/2,c0+w/2,c1+h/2,.6))return false;
            const th=Math.max(.004,Math.max(f.m0,f.m1)*.9);ink(f,c0,c1,w/2,h/2,th);
            const bars=h>.05?2:1;for(let j=0;j<bars;j++){const bw=(w-th*6)*(.5+.45*next()),bc=c1+(bars===2?(j?-.25:.25)*h:0);ink(f,c0-(w-th*6-bw)/2,bc,bw/2,Math.max(th*.7,h*.12),th,true);}
            if(next()<.4){const s=Math.min(h*.6,.03);ink(f,c0+w/2+s*.9,c1,s/2,s/2,th,true);}
            return true;}
        return false;
    }
    /** Plans and draws the panel layer for one chart.
     * o: {kit, axis, sign, seed, density, style} */
    function detail(f,o){
        const base=KITS[o.kit];if(!base)return;
        const style=o.style||'rounded',scale=style==='rounded'?1.4:style==='armored'?.88:1,next=rng(o.seed),density=o.density??.6;
        const kit={...base,rivets:style==='armored'?Math.max(base.rivets,.6):style==='rounded'?base.rivets*.3:base.rivets};
        const depth=.007,W=f.w*f.m0,Hh=f.h*f.m1,longA=W>=Hh;
        const shortLo=longA?f.lo1:f.lo0,shortLen=longA?Hh:W,longLo=longA?f.lo0:f.lo1,longLen=longA?W:Hh;
        const cells=[];
        const toAB=(l0,s0,l1,s1)=>longA?[l0,s0,l1,s1]:[s0,l0,s1,l1];
        if(kit.grid){
            const [pMin,pMax,rowH]=kit.grid.map(v=>v*scale),rows=Math.max(1,Math.round(shortLen/rowH)),bounds=[shortLo];
            for(let k=1;k<rows;k++)bounds.push(shortLo+shortLen*(k+(next()-.5)*.35)/rows);bounds.push(shortLo+shortLen);
            for(let k=1;k<rows;k++){const s=bounds[k],[a0,b0,a1,b1]=toAB(longLo,s,longLo+longLen,s);seam(f,a0,b0,a1,b1,depth);
                if(kit.rivets&&next()<kit.rivets){const off=.016+.006*next();for(let t=longLo+.03;t<longLo+longLen-.03;t+=.052){const [ca,cb]=longA?[t,s+off]:[s+off,t];dome(f,ca,cb,.0062,.0014);}}}
            for(let k=0;k<rows;k++){
                let t=longLo+pMin*next()*.8;const s0=bounds[k],s1=bounds[k+1],ends=[longLo];
                while(t<longLo+longLen-pMin*.5){ends.push(t);t+=pMin+(pMax-pMin)*next();}ends.push(longLo+longLen);
                const uniq=ends.filter((v,i)=>i===0||v-ends[i-1]>.05);
                for(let e=1;e<uniq.length-1;e++){const [a0,b0,a1,b1]=toAB(uniq[e],s0,uniq[e],s1);seam(f,a0,b0,a1,b1,depth);}
                for(let e=0;e+1<uniq.length;e++)cells.push(toAB(uniq[e],s0,uniq[e+1],s1));
            }
        }else{
            // No seams: a few loose cells for fittings.
            const n=Math.max(1,Math.round(longLen/.7));for(let e=0;e<n;e++)cells.push(toAB(longLo+longLen*e/n,shortLo,longLo+longLen*(e+1)/n,shortLo+shortLen));
        }
        // Per-panel paint and gloss variation: the strongest cue at distance.
        for(const c of cells)tone(f,c[0],c[1],c[2],c[3],(next()-.5)*.13*kit.tone,(next()-.5)*.18*kit.tone);
        const total=kit.feats.reduce((s,[,w])=>s+w,0),pick=()=>{let x=next()*total;for(const [k,w]of kit.feats){x-=w;if(x<=0)return k;}return kit.feats[0][0];};
        const order=cells.map((c,i)=>[next(),i]).sort((a,b)=>a[0]-b[0]).map(([,i])=>cells[i]);
        let budget=Math.min(kit.maxFeat,Math.round(cells.length*kit.fill*(.35+density*1.3))),placed=0;
        for(const c of order){if(placed>=budget)break;for(let tries=0;tries<3;tries++)if(feature(f,pick(),c,next,{depth})){placed++;break;}}
    }
    const api={Field,detail,KITS,seedOf,each,sdRect,fits,groove,seam,recess,louvers,grille,dome,ink,raised};root.RRVehiclePanels=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
