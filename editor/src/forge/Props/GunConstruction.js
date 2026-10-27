/** Machined hardware fitted to the firearm's receiver, grip, stock and sights: pins, the selector, catches, sling mounts, turrets and hoses. */
(function(root){
    'use strict';
    const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null),Patterns=need('RRConstructionPatterns','../Character3D/ConstructionPatterns.js'),CM=need('RRContainerMesh','./ContainerMesh.js'),M=need('RRPropMesh','./PropMesh.js'),HS=need('RRHardSurface','./HardSurface.js');
    const SCIFI=['monocoque','truss','heavy'];
    /** A domed pin head (or a slotted screw) on a side face, both sides. */
    const pin=(P,[x,y,z],r,slotted)=>{for(const s of [-1,1]){P.metal.push(M.lathe([[0,0],[r,0],[r,r*.35],[r*.7,r*.6],[0,r*.7]],16,{base:[x,y,s*z],dir:[0,0,s],sharp:.5}));if(slotted)P.dark.push(M.box([x,y,s*(z+r*.62)],[r*1.5,r*.28,r*.25]));}};
    const rules=[
        {id:'receiver-pins',test:r=>r.fasteners,controls:['fasteners','receiver.length','receiver.height'],build(c){
            // Takedown pins and screws where the style puts them; slotted screws on the old-world styles.
            const {r,P,S,Hr}=c,size=Math.max(.0018,Math.min(.0032,Hr*.055));
            for(const p of S.pins)pin(P,p,size,r.style==='classic'||r.style==='bolt');
        }},
        {id:'fire-selector',test:r=>!SCIFI.includes(r.style)&&r.style!=='classic',controls:['style'],build(c){
            // A selector lever on both sides (or a tang slide on top for a bolt action).
            const {P,S,Hr}=c;if(!S.selector)return;const [x,y,z]=S.selector;
            if(!z){P.metal.push(HS.chamferedBox([x,y+.002,0],[.012,.004,.007],.001));return;}
            for(const s of [-1,1]){P.metal.push(M.lathe([[0,0],[Hr*.09,0],[Hr*.09,.0015],[0,.002]],20,{base:[x,y,s*z],dir:[0,0,s]}));
                const lever=HS.plate([[0,-.0016],[Hr*.32,-.001],[Hr*.34,.001],[0,.0016]],.0016,.0004,{center:s*(z+.0022)});P.metal.push(HS.turn(lever,'z',-.5,[0,0,0]));M.transform(lever,([px,py,pz])=>[px+x,py+y,pz]);}
        }},
        {id:'grip-side-scales',test:r=>(r.style==='classic'||r.style==='bolt')&&r.magazine!=='cylinder',controls:['grip.length','grip.angle','furniture'],build(c){
            // Scales on the rounded grip, held by two screws.
            const {P,gx,gd,back,gl,gw}=c;
            for(const s of [-1,1]){const F=CM.frame([0,0,s*(gw/2+.0004)],[s,0,0],[0,1,0]),outline=[[gx+.004,-gl*.13],[gx+gd-.004,-gl*.13],[gx+gd-back*.86-.004,-gl*.86],[gx-back*.86+.003,-gl*.86]].flatMap(([x,y])=>[x*s,y]);
                P.furniture.push(CM.slab(outline,F,.0018,.0008,true));
                for(const t of [.25,.75])P.metal.push(M.lathe([[0,0],[.0023,0],[.0023,.0007],[0,.001]],16,{base:[gx+gd*.5-back*t,-gl*t,s*(gw/2+.0023)],dir:[0,0,s]}));
            }
        }},
        {id:'magazine-catch',when:{magazine:'box'},controls:['magSize'],build(c){
            // The release button behind the well, on the right.
            const {P,mxs,mw}=c;P.metal.push(M.lathe([[.0032,0],[.0032,.002],[.0026,.003],[0,.003]],16,{base:[mxs-.0085,-.008,mw/2+.002],dir:[0,0,1],sharp:.5}));
        }},
        {id:'handguard-sling-mount',test:r=>r.forend,controls:['forend','barrel.length'],build(c){
            // A sling loop under the front of the forend.
            const {P,f1,fB}=c,x=f1-.03;P.metal.push(M.polyTube([[x-.008,fB+.002,0],[x-.007,fB-.006,0],[x,fB-.01,0],[x+.007,fB-.006,0],[x+.008,fB+.002,0]],.0016,10));
        }},
        {id:'stock-butt-pad',when:{stock:'full'},controls:['stock','receiver.length'],build(c){const {P,xr0,Lr,Hr}=c,x=xr0-.26-Lr*.15-.013;for(let j=0;j<9;j++)P.dark.push(CM.roundedBox([x,Hr*.8-.005-j*(Hr*.8+.06)/9,0],[.004,.0025,.036],.001));}},
        {id:'scope-adjustment-turrets',when:{sight:'scope'},controls:['sight'],build(c){const {P,r,Lr,Lb,xr0,sightBase}=c,sr=.014+Lb*.012,sl=.14+Lb*.18,sx=xr0+Lr*.15,sy=sightBase+sr+.016;
            for(const [base,dir]of [[[sx+sl*.52,sy+sr*.8,0],[0,1,0]],[[sx+sl*.52,sy,sr*.8],[0,0,1]]]){P.metal.push(M.lathe([[0,0],[sr*.65,0],[sr*.65,.007],[sr*.58,.009],[0,.009]],32,{base,dir}));}
            for(const t of [.18,.80])P.dark.push(M.lathe([[sr*1.12,0],[sr*1.12,.003],[sr*.98,.003],[sr*.98,0],[sr*1.12,0]],32,{base:[sx+sl*t,sy,0],dir:[1,0,0]}));void r;}},
        {id:'receiver-hose-sockets',test:r=>r.coils>0,controls:['coils'],build(c){const {P,xr0,Lr,Hr,W,xr1,rb,yb}=c;for(const s of [-1,1]){
            const points=[[xr0+Lr*.5,Hr*.30,s*W*.52],[xr0+Lr*.68,Hr*.12,s*W*.70],[xr1+Lr*.12,yb-rb*1.3,s*W*.63],[xr1+Lr*.16,yb,s*rb*1.5]];
            P.dark.push(M.polyTube(points,.0025,16));for(const point of [points[0],points.at(-1)])P.metal.push(M.sphere(point,.0045,24));
        }}}
    ];
    const api=Patterns.bank(rules);root.RRGunConstruction=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
