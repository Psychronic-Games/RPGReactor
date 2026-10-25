/** Machined assemblies fitted to the firearm's receiver, grip and barrel. */
(function(root){
    'use strict';
    const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null),Patterns=need('RRConstructionPatterns','../Character3D/ConstructionPatterns.js'),CM=need('RRContainerMesh','./ContainerMesh.js'),M=need('RRPropMesh','./PropMesh.js');
    const rules=[
        {id:'receiver-side-plates',controls:['receiver.length','receiver.height','frame'],build(c){
            const {r,P,xr0,xr1,Lr,Hr,W}=c;
            for(const s of [-1,1]){
                const F=CM.frame([0,0,s*(W/2+.0005)],[s,0,0],[0,1,0]);
                const a=(xr0+Lr*.27)*s,b=(xr0+Lr*.82)*s;
                P.frame.push(CM.slab([a,Hr*.14,b,Hr*.14,b,Hr*.49,a,Hr*.49],F,.0016,.0007,true));
                P.dark.push(CM.slab(CM.rect((xr0+Lr*.55)*s,Hr*.30,Lr*.38,Hr*.08),{...F,o:[0,0,s*(W/2+.0022)]},.0004,.0002,true));
                if(r.fasteners)for(const x of [xr0+Lr*.31,xr0+Lr*.77])P.metal.push(M.lathe([[0,0],[.0019,0],[.0019,.0007],[0,.0009]],16,{base:[x,Hr*.20,s*(W/2+.0023)],dir:[0,0,s]}));
                // Safety paddle is seated on the upper rear wall, not in free space.
                const x=xr0+Lr*.18;P.metal.push(M.lathe([[0,0],[Hr*.09,0],[Hr*.09,.002],[0,.0025]],24,{base:[x,Hr*.48,s*(W/2+.0005)],dir:[0,0,s]}));
                P.metal.push(CM.roundedBox([x+Hr*.08,Hr*.47,s*(W/2+.003)],[Hr*.23,Hr*.055,.002],.0006));
            }
        }},
        {id:'grip-side-scales',controls:['grip.length','grip.angle','furniture'],build(c){
            const {P,gx,gd,back,gl,gw}=c;
            for(const s of [-1,1]){const F=CM.frame([0,0,s*(gw/2+.0004)],[s,0,0],[0,1,0]),outline=[[gx+.004,-gl*.13],[gx+gd-.004,-gl*.13],[gx+gd-back*.86-.004,-gl*.86],[gx-back*.86+.003,-gl*.86]].flatMap(([x,y])=>[x*s,y]);
                P.furniture.push(CM.slab(outline,F,.0018,.0008,true));
                for(const t of [.25,.75])P.metal.push(M.lathe([[0,0],[.0023,0],[.0023,.0007],[0,.001]],16,{base:[gx+gd*.5-back*t,-gl*t,s*(gw/2+.0023)],dir:[0,0,s]}));
            }
        }},
        {id:'magazine-stamping',when:{magazine:'box'},controls:['magSize'],build(c){const {r,P,mxs,W,Lb}=c,ms=r.magSize,mh=.07*ms+.03,md=.028+.01*ms,curve=Lb>.3?.03*ms:0;
            for(const s of [-1,1])for(let k=0;k<3;k++){const t=(k+1)/4;P.dark.push(M.polyTube([[mxs+md*t+curve*.10,-mh*.13,s*(Math.min(W*.8,.026)/2+.0005)],[mxs+md*t+curve*.85,-mh*.85,s*(Math.min(W*.8,.026)/2+.0005)]],.0008,12));}
            P.metal.push(CM.roundedBox([mxs+md/2+curve,-mh+.002,0],[md+.005,.006,Math.min(W*.8,.026)+.004],.001));}},
        {id:'forend-cooling-slots',test:r=>r.forend,controls:['forend','barrel.length','barrel.thickness'],build(c){const {P,xr1,Lb,rb,yb}=c,f0=xr1+.004,f1=xr1+Math.min(Lb*.6,.36),width=Math.max(.03,rb*3);
            for(const s of [-1,1])for(let k=0;k<8;k++){const x=f0+(f1-f0)*(.12+k*.1);P.dark.push(CM.roundedBox([x,yb,s*(width/2+.0006)],[(f1-f0)*.044,Math.max(.006,rb*.6),.0014],.0006));}
            for(const x of [f0+.003,f1-.006])P.metal.push(M.lathe([[rb*1.5,0],[rb*1.5,.004],[rb*1.25,.004],[rb*1.25,0],[rb*1.5,0]],32,{base:[x,yb,0],dir:[1,0,0]}));}},
        {id:'stock-butt-pad',when:{stock:'full'},controls:['stock','receiver.length'],build(c){const {P,xr0,Lr,Hr}=c,x=xr0-.26-Lr*.15-.013;for(let j=0;j<9;j++)P.dark.push(CM.roundedBox([x,Hr*.8-.005-j*(Hr*.8+.06)/9,0],[.004,.0025,.039],.001));}},
        {id:'scope-adjustment-turrets',when:{sight:'scope'},controls:['sight'],build(c){const {P,r,Hr,Lr,Lb,xr0}=c,sr=.014+Lb*.012,sl=.14+Lb*.18,sx=xr0+Lr*.15,sy=Hr+(r.rails?.006:0)+sr+.016;
            for(const [base,dir]of [[[sx+sl*.52,sy+sr*.8,0],[0,1,0]],[[sx+sl*.52,sy,sr*.8],[0,0,1]]]){P.metal.push(M.lathe([[0,0],[sr*.65,0],[sr*.65,.007],[sr*.58,.009],[0,.009]],32,{base,dir}));}
            for(const t of [.18,.80])P.dark.push(M.lathe([[sr*1.12,0],[sr*1.12,.003],[sr*.98,.003],[sr*.98,0],[sr*1.12,0]],32,{base:[sx+sl*t,sy,0],dir:[1,0,0]}));}},
        {id:'receiver-hose-sockets',test:r=>r.coils>0,controls:['coils'],build(c){const {P,xr0,Lr,Hr,W,xr1,rb,yb}=c;for(const s of [-1,1]){
            const points=[[xr0+Lr*.5,Hr*.30,s*W*.52],[xr0+Lr*.68,Hr*.12,s*W*.70],[xr1+Lr*.12,yb-rb*1.3,s*W*.63],[xr1+Lr*.16,yb,s*rb*1.5]];
            P.dark.push(M.polyTube(points,.0025,16));for(const point of [points[0],points.at(-1)])P.metal.push(M.sphere(point,.0045,24));
        }}}
    ];
    const api=Patterns.bank(rules);root.RRGunConstruction=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
