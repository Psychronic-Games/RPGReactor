/** Original procedural transport models. Shared dimensions drive the chassis,
 * wheel arches, suspension and cabin; equipment has actual mounting points.
 * Vehicle metadata reuses the existing game vehicle/rider contract. */
(function(root) {
    'use strict';
    const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null);
    const CM=need('RRContainerMesh','./ContainerMesh.js'),Paint=need('RRPropPaint','./PropPaint.js'),Construction=need('RRVehicleConstruction','./VehicleConstruction.js'),Bodywork=need('RRVehicleBodywork','./VehicleBodywork.js'),Finish=need('RRVehicleFinish','./VehicleFinish.js');
    const {add,sub,scale,norm,cross,dot}=CM.vec;
    const FORMS=[
        ['compact','Compact car',1.75,1.48,3.45],['sport','Sports coupe',1.90,1.25,4.45],
        ['truck','Utility truck',2.05,1.95,5.1],['rover','Armored rover',2.55,2.35,5.6],
        ['motorcycle','Motorcycle',.82,1.18,2.18],['hover','Hover transport',2.65,1.45,4.4],
        ['shuttle','Shuttle',4.2,2.1,6.4],['drone','Survey drone',1.45,.65,1.45],['walker','Utility walker',2.7,4.2,1.9]
    ];
    const BY_ID=new Map(FORMS.map(f=>[f[0],f]));
    const clamp=(v,a,b,d)=>Number.isFinite(+v)?Math.max(a,Math.min(b,+v)):d;
    const hex=(v,d)=>/^#[\da-f]{6}$/i.test(v)?v:d;
    const GROUND=new Set(['compact','sport','truck','rover','motorcycle']);
    function normalize(input={}) {
        const form=BY_ID.has(input.form)?input.form:'compact',f=BY_ID.get(form),r=input;
        return {kind:'vehicle',form,width:clamp(r.width,.5,8,f[2]),height:clamp(r.height,.35,7,f[3]),length:clamp(r.length,1,12,f[4]),
            paint:hex(r.paint,form==='rover'?'#697460':form==='sport'||form==='motorcycle'?'#8c353b':form==='walker'?'#bd8d43':'#426c80'),secondary:hex(r.secondary,form==='rover'?'#475144':form==='walker'?'#48545e':form==='compact'||form==='sport'||form==='motorcycle'?'#303c43':'#b4bdba'),trim:hex(r.trim,'#252c32'),accent:hex(r.accent,'#d0a15c'),glass:hex(r.glass,'#172c36'),
            interior:r.interior!==false,windowOpacity:clamp(r.windowOpacity,.2,.95,.82),seatColor:hex(r.seatColor,'#62717a'),finish:['enamel','powder','brushed','composite'].includes(r.finish)?r.finish:'enamel',wear:clamp(r.wear,0,1,['rover','walker','truck'].includes(form)?.35:.08),grime:clamp(r.grime,0,1,['rover','walker','truck'].includes(form)?.30:.06),surfaceSeed:Math.round(clamp(r.surfaceSeed,1,999999,701)),livery:['plain','stripe','rally','service'].includes(r.livery)?r.livery:['rover','walker','truck','hover','shuttle','drone'].includes(form)?'service':form==='sport'?'rally':'stripe',markings:typeof r.markings==='string'?r.markings.toUpperCase().replace(/[^A-Z0-9 .:/-]/g,'').slice(0,22):({compact:'R-17',sport:'24',truck:'FIELD SERVICE',rover:'RANGER 06',motorcycle:'R-17',hover:'UTILITY 17',shuttle:'EXPEDITION 07',drone:'SURVEY 06',walker:'WORK UNIT 06'}[form]),
            wheelSize:clamp(r.wheelSize,.75,1.3,1),wheelbase:clamp(r.wheelbase,.5,.72,.62),clearance:clamp(r.clearance,0,1,.4),
            cabinHeight:clamp(r.cabinHeight,.7,1.3,1),cabinLength:clamp(r.cabinLength,.75,1.25,1),axles:Math.round(clamp(r.axles,2,3,form==='rover'?3:2)),
            armor:clamp(r.armor,0,1,form==='rover'?.8:.2),roughness:clamp(r.roughness,.2,.9,form==='sport'?.28:.52),
            spokes:Math.round(clamp(r.spokes,4,10,6)),tread:clamp(r.tread,0,1,form==='rover'||form==='truck'?.8:.25),
            roofRack:!!r.roofRack,bumper:r.bumper!==false,lights:r.lights!==false,details:r.details!==false,
            cargo:clamp(r.cargo,0,1,form==='truck'?.5:0),wingSpan:clamp(r.wingSpan,.7,1.4,1),engineSize:clamp(r.engineSize,.7,1.4,1),
            stance:clamp(r.stance,.75,1.3,1),aero:clamp(r.aero,0,1,form==='sport'?.65:0),fairing:['naked','half','full'].includes(r.fairing)?r.fairing:'half',flightFit:['transport','interceptor','cargo'].includes(r.flightFit)?r.flightFit:'transport',rotorGuard:['ring','cage','open'].includes(r.rotorGuard)?r.rotorGuard:'ring',tool:['claw','welder','none'].includes(r.tool)?r.tool:'claw'};
    }
    const fromPreset=form=>normalize({form});
    /** A tandem rear bogie leaves a real access bay ahead of it. Door edges share wheel-clearance anchors. */
    function roadLayout(r){
        const W=r.width,H=r.height,L=r.length,span=L*r.wheelbase;
        const axleZ=r.axles===3?[-span*.5,-span*.17,span*.5]:[-span*.5,span*.5];
        const gap=Math.min(...axleZ.slice(1).map((z,i)=>z-axleZ[i]));
        const R=Math.min(H*.22*r.wheelSize,gap*.44,W*.32),hood=R*2.12+H*(.075+r.clearance*.075),base=R+H*(.055+r.clearance*.07);
        const cabinZ=r.form==='truck'?L*.10:r.form==='compact'?-L*.05:-L*.02,cabinL=L*(r.form==='truck'?.30:r.form==='compact'?.60:r.form==='rover'?.53:.43)*r.cabinLength;
        const bays=axleZ.slice(1).map((z,i)=>[Math.max(axleZ[i]+R*1.14,cabinZ-cabinL*.47),Math.min(z-R*1.14,cabinZ+cabinL*.47)]).sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));
        const [rear,front]=bays[0],door={rear,front,z:(rear+front)/2,width:Math.max(.02,front-rear),low:base+H*.015,high:hood+H*.055};
        return{R,axleZ,hood,base,cabinZ,cabinL,door};
    }

    /** Beveled rectangular cross sections, in z order: [z,halfWidth,bottom,top]. */
    function hull(sections,bevel=.035,crown=0) {
        const g=new CM.Geo(),rings=sections.map(([z,w,low,high])=>{
            const b=Math.min(w*.12,(high-low)*.18,bevel);
            const corners=[[w-b,low+b,-Math.PI/2],[w-b,high-b,0],[-w+b,high-b,Math.PI/2],[-w+b,low+b,Math.PI]];
            return corners.flatMap(([cx,cy,start])=>Array.from({length:5},(_,j)=>{const angle=start+j/4*Math.PI/2;const x=cx+Math.cos(angle)*b,y=cy+Math.sin(angle)*b;return[x,y+(y>=high-b-1e-8?crown*(1-(x/w)**2)**2:0),z];}));
        });
        for(let i=0;i+1<rings.length;i++)for(let j=0;j<rings[i].length;j++){
            const a=rings[i][j],b=rings[i][(j+1)%rings[i].length],c=rings[i+1][(j+1)%rings[i].length],d=rings[i+1][j];
            const center=scale(add(add(a,b),add(c,d)),.25),axis=[0,(sections[i][2]+sections[i][3]+sections[i+1][2]+sections[i+1][3])/4,center[2]];
            let facing=norm(cross(sub(b,a),sub(d,a)));if(dot(facing,sub(center,axis))<0)facing=scale(facing,-1);
            g.poly([a,b,c,d],[[0,0],[1,0],[1,1],[0,1]],facing);
        }
        g.poly(rings[0],null,[0,0,-1]);g.poly(rings.at(-1),null,[0,0,1]);
        return CM.smoothNormals(g.done(),.55);
    }
    /** A closed, thin plate on arbitrary coplanar corners. */
    function panel(points,thickness=.012) {
        const u=norm(sub(points[1],points[0])),n=norm(cross(sub(points[1],points[0]),sub(points[2],points[0]))),v=cross(n,u),F=CM.frame(points[0],u,v);
        const poly=points.flatMap(p=>{const d=sub(p,F.o);return[dot(d,u),dot(d,v)];});return CM.slab(poly,F,thickness,thickness*.25,true);
    }
    /** A laminated pane with a curved front, matching back and closed rim. */
    function glazing(corners,bulge){
        const [a,b,c,d]=corners,n=norm(cross(sub(b,a),sub(d,a))),g=new CM.Geo(),steps=12,thickness=.006;
        const at=(u,v,back=false)=>{const bottom=add(scale(a,1-u),scale(b,u)),top=add(scale(d,1-u),scale(c,u));return add(add(scale(bottom,1-v),scale(top,v)),scale(n,bulge*Math.sin(u*Math.PI)*Math.sin(v*Math.PI)-(back?thickness:0)));};
        for(let j=0;j<steps;j++)for(let i=0;i<steps;i++){const u=i/steps,v=j/steps,uu=(i+1)/steps,vv=(j+1)/steps;const face=[at(u,v),at(uu,v),at(uu,vv),at(u,vv)];let normal=norm(cross(sub(face[1],face[0]),sub(face[3],face[0])));if(dot(normal,n)<0)normal=scale(normal,-1);g.poly(face,null,normal);g.poly([at(u,v,true),at(u,vv,true),at(uu,vv,true),at(uu,v,true)],null,scale(normal,-1));}
        for(let i=0;i<steps;i++)for(const side of [0,1])for(const edge of [0,1]){const t=i/steps,tt=(i+1)/steps,p=edge?[side,t]:[t,side],q=edge?[side,tt]:[tt,side];const out=scale(norm(edge?sub(b,a):sub(d,a)),side?1:-1);g.poly([at(...p),at(...q),at(...q,true),at(...p,true)],null,out);}
        return CM.smoothNormals(g.done(),.9);
    }
    function build(input,cache={},options={}) {
        const r=normalize(input),W=r.width,H=r.height,L=r.length,groups=new Map(),wheels=[],mounts={};
        const put=(kind,m,name=kind)=>{const key=kind+'|'+name;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);return m;};
        const box=(kind,center,size,bevel=.015,name)=>put(kind,Math.min(...size)>.02?Bodywork.filletBox(center,size,bevel):CM.chamferBox(center,size,bevel),name);
        const tube=(kind,points,radius=.018,name)=>put(kind,CM.sweep(points,radius,20,true),name);
        const sheet=(kind,points,thickness=.012,name)=>put(kind,panel(points,thickness),name);
        const bolt=(center,u=[0,0,1],v=[0,1,0])=>{if(r.details)put('metal',CM.revolveOn(CM.frame(center,u,v),0,0,[[0,0],[.014,0],[.014,.008],[0,.009]],8));};
        const context={recipe:r,r,W,H,L,put,box,tube,sheet,bolt,wheels,bodywork:Bodywork};
        const wheel=(x,z,R,width,name)=>{
            const side=x<0?-1:1,F=CM.frame([x,R,z],[0,0,-side],[0,1,0]),tyreName=name+' tire',rimName=name+' rim';
            const bike=r.form==='motorcycle',profile=bike?Array.from({length:33},(_,i)=>{const a=i/32*Math.PI*2;return[R*(.82+.18*Math.cos(a)),width*.55*Math.sin(a)];}):[
                [.57,-.42],[.64,-.51],[.82,-.56],[.92,-.53],[.97,-.45],[.993,-.32],[1,-.15],[1,0],[1,.15],[.993,.32],[.97,.45],[.92,.53],[.82,.56],[.64,.51],[.57,.42],[.57,-.42]
            ].map(([radius,depth])=>[radius*R,depth*width]);
            put('rubber',CM.revolveOn(F,0,0,profile,96,.5),tyreName);
            if(r.details&&!bike)for(const sign of [-1,1])for(const radius of [.72,.86]){
                const depth=sign*width*(radius===.72?.533:.548),ring=Array.from({length:9},(_,i)=>{const a=i/8*Math.PI*2;return[R*(radius+.003*Math.cos(a)),depth+Math.sin(a)*R*.002];});
                put('rubber',CM.revolveOn(F,0,0,ring,96),tyreName);
            }
            const outer=width*.535;
            put('metal',CM.revolveOn(F,0,0,[[R*.61,outer-.012],[R*.67,outer],[R*.57,outer+.008],[R*.53,outer+.008],[R*.53,outer-.012],[R*.61,outer-.012]],64),rimName);
            for(let j=0;j<r.spokes;j++){
                const a=j/r.spokes*Math.PI*2,turn=r.form==='sport'?.23:.08,point=(radius,angle)=>[Math.sin(angle)*radius,Math.cos(angle)*radius];
                const points=[point(R*.16,a-.14),point(R*.56,a+turn-.065),point(R*.57,a+turn+.065),point(R*.19,a+.16)].flat();
                put('metal',CM.slab(points,{...F,o:add(F.o,scale(F.n,outer-.018))},R*.055,R*.008,true),rimName);
            }
            put('dark',CM.revolveOn(F,0,0,[[0,outer-.02],[R*.51,outer-.02],[R*.51,outer-.015],[0,outer-.015]],24),name+' brake');
            put('metal',CM.revolveOn(F,0,0,[[0,outer-.01],[R*.17,outer-.01],[R*.17,outer+.025],[0,outer+.025]],16),rimName);
            if(r.details&&r.tread>0){
                const utility=r.form==='truck'||r.form==='rover',rows=utility?[-.33,-.11,.11,.33]:[-.27,.27],count=utility?24:36;
                for(let j=0;j<count;j++)for(const offset of rows){
                    const a=(j+(offset>0?.45:0))/count*Math.PI*2,T=CM.frame([x+offset*width,R+Math.cos(a)*R*(bike?.986:.994),z+Math.sin(a)*R*(bike?.986:.994)],[-1,0,0],[0,-Math.sin(a),Math.cos(a)]),depth=R*(.003+.020*r.tread),bevel=Math.min(R*.002,depth*.20),hw=width*(utility?.105:.20),hl=R*(utility?.065:.033),slant=width*(utility?.045:.08);
                    put('rubber',CM.slab([-hw,-hl-slant,hw,-hl+slant,hw,hl+slant,-hw,hl-slant],T,depth,bevel,true),tyreName);
                }
            }
            if(r.details){for(let j=0;j<5;j++){const a=j/5*Math.PI*2;put('metal',CM.revolveOn(F,Math.cos(a)*R*.11,Math.sin(a)*R*.11,[[0,outer+.025],[R*.018,outer+.025],[R*.018,outer+.035],[0,outer+.035]],12),rimName);}for(let j=0;j<18;j++){const a=j/18*Math.PI*2;put('metal',CM.revolveOn(F,Math.cos(a)*R*.41,Math.sin(a)*R*.41,[[0,outer-.014],[R*.016,outer-.014],[R*.016,outer-.013],[0,outer-.013]],12),name+' brake');}}
            if(r.details)put('dark',CM.revolveOn(F,R*.48,0,[[0,outer],[R*.013,outer],[R*.013,outer+R*.055],[0,outer+R*.055]],12),rimName);
            if(r.form!=='motorcycle')box('accent',[x+side*(outer-.020),R*1.20,z+R*.40],[width*.14,R*.22,R*.14],R*.025,'Brake calipers');
            let radius=0;for(const mesh of groups.get('rubber|'+tyreName))for(let i=0;i<mesh.positions.length;i+=3)radius=Math.max(radius,Math.hypot(mesh.positions[i+1]-R,mesh.positions[i+2]-z));
            wheels.push({part:tyreName,with:[rimName,name+' brake'],at:[x,R,z],radius,side:side>0?'left':'right'});
            return [x,R,z];
        };
        const vent=(center,size,rows=6,back=false)=>{if(r.details)Bodywork.grille(context,CM.frame(center,[1,0,0],[0,back?-1:1,0]),size[0],size[1],size[2],rows,'Vehicle cooling grille');};
        const lamp=(center,size,back=false)=>{
            box('trim',center,size.map(v=>v*1.16),.012);
            box('glass',[center[0],center[1],center[2]+(back?-1:1)*size[2]*.4],size,.008);
            const F=CM.frame([center[0],center[1],center[2]+(back?-1:1)*size[2]*.92],[1,0,0],[0,back?-1:1,0]);
            if(back){for(let j=0;j<3;j++)put(r.lights?'red':'dark',CM.slab(CM.rect(0,(j-1)*size[1]*.23,size[0]*.85,size[1]*.15),F,.002,.0005,true));}
            else{const radius=Math.min(size[1]*.38,size[0]*.20);for(const sx of [-1,1]){
                put('metal',CM.revolveOn(F,sx*size[0]*.24,0,[[radius,0],[radius,.003],[radius*.72,.005],[radius*.56,.001],[radius,0]],32));
                put(r.lights?'light':'dark',CM.revolveOn(F,sx*size[0]*.24,0,[[0,.001],[radius*.54,.001],[radius*.54,.003],[0,.003]],32));
            }}
        };
        if(['compact','sport','truck','rover'].includes(r.form)) {
            const layout=roadLayout(r),{R,axleZ,hood,base,cabinZ,cabinL,door}=layout,half=W*.49;
            box('dark',[0,base-.045,0],[W*.68,H*.10,L*.91],.03);
            Object.assign(context,layout,{half});Bodywork.roadBody(context);
            for(let i=0;i<axleZ.length;i++)for(const sign of [-1,1]){
                const z=axleZ[i],x=sign*W*.44,name=(i===0?'Rear':i===r.axles-1?'Front':'Middle')+(sign>0?' left':' right');
                wheel(x,z,R,W*(r.form==='rover'?.14:.115),name);
                tube('metal',[[0,R,z],[x,R,z]],H*.035);
                tube('metal',[[sign*W*.28,hood-H*.05,z],[x,R,z]],H*.019);
                const inner=R*1.085,outer=R*(r.form==='rover'?1.19:1.15),start=Math.asin(Math.min(.92,Math.max(0,(base-R)/inner))),steps=40;
                const arc=Array.from({length:steps+1},(_,j)=>{const a=start+j/steps*(Math.PI-2*start);return[sign*(context.bodyProfile.width(z+Math.cos(a)*inner)+.006),R+Math.sin(a)*inner,z+Math.cos(a)*inner];});
                tube('trim',arc,H*(.006+r.armor*.003));
                // A formed arch flange has finite width and closed beveled edges.
                // Its lower ends terminate in the sill, instead of hanging below the body.
                const flange=new CM.Geo(),depth=W*.014,bevel=Math.min(W*.0035,(outer-inner)*.24),profile=[[inner,0],[inner,depth-bevel],[inner+bevel,depth],[outer-bevel,depth],[outer,depth-bevel],[outer,0]];
                const point=(angle,section)=>[sign*(context.bodyProfile.width(z+Math.cos(angle)*section[0])-.004+section[1]),R+Math.sin(angle)*section[0],z+Math.cos(angle)*section[0]];
                for(let j=0;j<steps;j++){
                    const a=start+j/steps*(Math.PI-2*start),b=start+(j+1)/steps*(Math.PI-2*start),mid=(a+b)/2;
                    for(let k=0;k<profile.length;k++){
                        const p=profile[k],q=profile[(k+1)%profile.length],dr=q[0]-p[0],dd=q[1]-p[1],normal=norm([sign*dr,-Math.sin(mid)*dd,-Math.cos(mid)*dd]);
                        flange.poly([point(a,p),point(b,p),point(b,q),point(a,q)],null,normal);
                    }
                }
                for(const [angle,side]of [[start,-1],[Math.PI-start,1]])flange.poly(profile.map(p=>point(angle,p)),null,[0,side*Math.cos(angle),-side*Math.sin(angle)]);
                put('paint',CM.smoothNormals(flange.done(),.80),'Formed wheel arches');
            }
            const roofY=hood+H*(r.form==='sport'?.27:r.form==='rover'?.35:.37)*r.cabinHeight,front=cabinZ+cabinL*.50,rear=cabinZ-cabinL*.50,rf=cabinZ+cabinL*(r.form==='sport'?.10:.20),rr=cabinZ-cabinL*(r.form==='compact'?.38:.32),bw=W*.405,rw=W*(r.form==='sport'?.315:.34);
            Object.assign(context,{R,hood,base,half,roofY,rf,rr,rw,bw,cabinZ,cabinL,axleZ,door});
            Bodywork.roadWindows({...context,front,rear,glazing,sheet});
            put('secondary',Bodywork.shell(Array.from({length:25},(_,i)=>{const t=i/24,crown=Math.sin(t*Math.PI);return[rr+(rf-rr)*t,rw*(1+.012*crown),roofY+H*(.008+.010*crown),H*(.018+.022*crown)];}),2.8,64),'Crowned roof panel');
            for(const sign of [-1,1]){
                tube('trim',[[sign*W*.22,hood+.012,front+.006],[sign*W*.10,hood+H*.10,front-(front-rf)*.25+.006]],W*.004);
                Bodywork.doorSkin(context,sign);
                box('trim',[sign*(context.bodyProfile.width(door.rear+door.width*.23)*.992+W*.013),door.high-H*.043,door.rear+door.width*.23],[W*.006,H*.037,Math.min(L*.045,door.width*.32)],.006,'Door handle recess');
                box('metal',[sign*(context.bodyProfile.width(door.rear+door.width*.23)*.992+W*.019),door.high-H*.043,door.rear+door.width*.23],[W*.009,H*.012,Math.min(L*.038,door.width*.27)],.004,'Door latch');
                const mirrorBase=[sign*bw,hood+H*.10,front-L*.035],mirror=[sign*W*.56,hood+H*.11,front-L*.055];
                tube('trim',[mirrorBase,mirror],W*.010);box('paint',mirror,[W*.13,H*.07,L*.035],.018);

            }
            Bodywork.cabin({...context,front,rear});
            Bodywork.roadFace(context);
            if(r.roofRack){for(const x of [-W*.29,W*.29]){for(const z of [rr,rf])tube('trim',[[x,roofY,z],[x,roofY+H*.10,z]],H*.016);tube('metal',[[x,roofY+H*.10,rr],[x,roofY+H*.10,rf]],H*.019);}for(let j=0;j<5;j++){const z=rr+(rf-rr)*j/4;tube('metal',[[-W*.29,roofY+H*.10,z],[W*.29,roofY+H*.10,z]],H*.012);}}
            if(r.form==='truck'){
                const z=-L*.31,bedL=L*.32;box('dark',[0,hood-H*.05,z],[W*.76,.035,bedL],.01);
                for(const x of [-W*.43,W*.43])box('paint',[x,hood+H*.04,z],[W*.10,H*.22,bedL],.016);
                box('paint',[0,hood+H*.04,-L*.465],[W*.90,H*.22,.035],.016);
                if(r.cargo>.05)for(let i=0;i<Math.ceil(r.cargo*3);i++)box('cargo',[(i-1)*W*.20,hood-.033+H*.10,z],[W*.18,H*.20,L*.17],.016);
            }else if(r.form==='rover'&&r.armor>.1){
                for(const sign of [-1,1]){box('armor',[sign*W*.47,hood+H*.08,cabinZ-cabinL*.30],[W*(.02+.025*r.armor),H*.18,cabinL*.26],.020);vent([sign*W*.26,hood-H*.13,-L*.49+H*.0001],[W*.20,H*.17,.015],5,true);}
            }
        } else if(r.form==='motorcycle') {
            const R=Math.min(H*.29*r.wheelSize,L*.31,W*.55),front=L*.35,rear=-L*.35,seat=H*.67+R*.25,neck=[0,H*.72,front-L*.13];
            wheel(0,rear,R,W*.26,'Rear');wheel(0,front,R,W*.23,'Front');
            const engine=[0,H*.43,-L*.035];
            Object.assign(context,{R,seat,engine});
            for(const sign of [-1,1]){
                const x=sign*W*.16;
                tube('trim',[[x,R,rear],[x,H*.42,-L*.05],[x,seat,-L*.12],[x,R,rear]],W*.035);
                tube('metal',[[x,R,front],[x,neck[1],neck[2]]],W*.037);
                tube('trim',[[x,neck[1],neck[2]],[x,seat,-L*.13],[x,engine[1]-.09,engine[2]],[x,neck[1],neck[2]]],W*.027);
                tube('metal',[[x,neck[1],neck[2]],[sign*W*.47,H*.82,L*.19]],W*.019,'Steering');
                box('metal',[sign*W*.43,H*.82,L*.19],[W*.19,W*.052,W*.065],.012,'Steering');
                tube('metal',[[x,H*.30,-L*.09],[sign*W*.38,H*.30,-L*.09]],W*.025);
                tube('metal',[[x,H*.34,-L*.11],[sign*W*.22,H*.27,-L*.25],[sign*W*.24,H*.28,-L*.29]],W*.041,'Exhaust headers');
                if(r.details)for(let j=0;j<6;j++)box('metal',[sign*W*.218,engine[1]+j*H*.015,engine[2]],[W*.055,H*.006,L*.12],.002);
            }
            box('dark',engine,[W*.40,H*.20,L*.21],.035);
            const tank=new CM.Geo(),tankRows=32,tankSides=48,tankRing=i=>{const t=i/tankRows,shape=Math.sin(t*Math.PI),cy=seat-H*.025+H*.015*shape,z=-L*.11+L*.26*t;return Array.from({length:tankSides},(_,j)=>{const a=j/tankSides*Math.PI*2;return[Math.cos(a)*W*(.004+.225*shape**.65),cy+Math.sin(a)*H*(.003+.137*shape**.75),z];});};
            const tankRings=Array.from({length:tankRows+1},(_,i)=>tankRing(i));
            for(let i=0;i<tankRows;i++)for(let j=0;j<tankSides;j++){const k=(j+1)%tankSides,p=[tankRings[i][j],tankRings[i][k],tankRings[i+1][k],tankRings[i+1][j]],center=[0,seat-H*.025+H*.015*Math.sin((i+.5)/tankRows*Math.PI),-L*.11+L*.26*(i+.5)/tankRows];let normal=norm(cross(sub(p[1],p[0]),sub(p[3],p[0])));if(dot(normal,sub(scale(add(p[0],p[2]),.5),center))<0)normal=scale(normal,-1);tank.poly(p,null,normal);}
            tank.poly(tankRings[0],null,[0,0,-1]);tank.poly(tankRings.at(-1),null,[0,0,1]);put('paint',CM.smoothNormals(tank.done(),.85),'Formed fuel tank');
            put('rubber',hull([[-L*.30,W*.12,seat-H*.045,seat+.015],[-L*.20,W*.20,seat-H*.03,seat+.025],[-L*.08,W*.15,seat-H*.02,seat+.025]]));
            tube('trim',[[0,seat-H*.04,-L*.28],[0,H*.45,-L*.10]],W*.036);
            // Thin formed mudguards follow the tire; a thick round tube
            // here reads as another tire and hides the fork and engine.
            for(const z of [rear,front]){
                const g=new CM.Geo(),radius=R*1.10,thickness=Math.min(.008,R*.035),half=W*.15,rows=32;
                const at=(a,x,rr)=>[x,R+Math.sin(a)*rr,z+Math.cos(a)*rr];
                for(let j=0;j<rows;j++){
                    const a=.48+j/rows*(Math.PI-.96),b=.48+(j+1)/rows*(Math.PI-.96),n=[0,Math.sin((a+b)/2),Math.cos((a+b)/2)];
                    g.poly([at(a,-half,radius),at(a,half,radius),at(b,half,radius),at(b,-half,radius)],null,n);
                    g.poly([at(a,-half,radius-thickness),at(b,-half,radius-thickness),at(b,half,radius-thickness),at(a,half,radius-thickness)],null,scale(n,-1));
                    for(const side of [-1,1])g.poly([at(a,side*half,radius),at(b,side*half,radius),at(b,side*half,radius-thickness),at(a,side*half,radius-thickness)],null,[side,0,0]);
                    if(j===0)g.poly([at(a,-half,radius),at(a,-half,radius-thickness),at(a,half,radius-thickness),at(a,half,radius)],null,[0,-Math.cos(a),Math.sin(a)]);
                    if(j===rows-1)g.poly([at(b,-half,radius),at(b,half,radius),at(b,half,radius-thickness),at(b,-half,radius-thickness)],null,[0,Math.cos(b),-Math.sin(b)]);
                }
                put('paint',CM.smoothNormals(g.done(),.75));
            }
            const capShape=Math.sin((.04+.11)/.26*Math.PI),capY=seat+H*(-.025+.015*capShape+.003+.137*capShape**.75);
            const cap=CM.frame([0,capY+.0004,L*.04],[1,0,0],[0,0,-1]);put('metal',CM.revolveOn(cap,0,0,[[0,0],[W*.05,0],[W*.05,.007],[0,.007]],16));
            const dial=CM.frame([0,H*.80,L*.18],[1,0,0],[0,.6,-.8]);put('trim',CM.revolveOn(dial,0,0,[[0,-.012],[W*.075,-.012],[W*.075,.012],[0,.012]],20));put('glass',CM.revolveOn(dial,0,0,[[0,.012],[W*.064,.012],[W*.064,.014],[0,.014]],20));
            put('light',CM.slab(CM.rect(0,0,W*.006,W*.08),{...dial,o:add(dial.o,scale(dial.n,.015))},.001,.0002,true));
            if(r.fairing==='naked')lamp([0,H*.72,L*.27],[W*.32,H*.09,.035]);lamp([0,seat,-L*.31],[W*.20,H*.035,.025],true);
            if(r.fairing==='naked')sheet('glass',[[-W*.18,H*.75,L*.23],[W*.18,H*.75,L*.23],[W*.15,H*.92,L*.16],[-W*.15,H*.92,L*.16]]);
            Bodywork.bike({...context,glazing});
            mounts.seats=[{posture:'astride',seat:{at:[0,seat+.025,-L*.16]},handL:{at:[W*.42,H*.82,L*.19]},handR:{at:[-W*.42,H*.82,L*.19]},footL:{at:[W*.36,H*.30,-L*.09]},footR:{at:[-W*.36,H*.30,-L*.09]}}];
            mounts.controls=[{input:'steer',shape:'bars',part:'Steering',at:neck,axis:[0,1,0],degrees:25,degreesAtSpeed:7}];
        }
        else if(['hover','shuttle'].includes(r.form)) {
            context.glazing=glazing;
        } else if(r.form==='drone') {
            Bodywork.drone(context);
        } else if(r.form==='walker') {
            Bodywork.walker({...context,glazing});
        }
        const construction=Construction.assemble(context);
        const materials={seat:{color:r.seatColor,roughness:.88,metalness:0},secondary:{color:r.secondary,roughness:Math.min(.90,r.roughness+.08),metalness:.28},paint:{color:r.paint,roughness:r.roughness,metalness:.35},armor:{color:r.paint,roughness:Math.min(.92,r.roughness+.12),metalness:.45},
            accent:{color:r.accent,roughness:.42,metalness:.55},trim:{color:r.trim,roughness:.64,metalness:.20},dark:{color:'#11181d',roughness:.83},rubber:{color:'#202327',roughness:.92},metal:{color:'#a1abb0',roughness:.36,metalness:.78},
            glass:{color:r.glass,roughness:.17,metalness:.38},cargo:{color:r.accent,roughness:.82},light:{color:'#94a7a3',emissive:'#d3e1dd',emissiveIntensity:.20,roughness:.25},
            red:{color:'#932d23',emissive:'#b72b20',emissiveIntensity:.4,roughness:.27},glow:{color:r.accent,emissive:r.accent,emissiveIntensity:r.lights?.6:0,roughness:.3}};
        const parts=[];
        for(const [key,list]of groups){const [kind,name]=key.split('|'),mesh=CM.merge(list);CM.skin(mesh,0);parts.push({...mesh,...materials[kind],metalness:materials[kind].metalness??0,surfaceRole:kind,name:name===kind?BY_ID.get(r.form)[1]+' '+kind:name});}
        for(const p of parts)CM.mapUv(p,(_,__,i)=>{const n=Array.from(p.normals.subarray(i*3,i*3+3),Math.abs),axis=n.indexOf(Math.max(...n)),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1];return axes.map(k=>p.positions[i*3+k]*5);});
        let low=Infinity,high=-Infinity;for(const p of parts)for(let i=1;i<p.positions.length;i+=3){low=Math.min(low,p.positions[i]);high=Math.max(high,p.positions[i]);}
        for(const p of parts)for(let i=1;i<p.positions.length;i+=3)p.positions[i]-=low;
        for(const w of wheels)w.at[1]-=low;
        for(const seat of mounts.seats||[])for(const key of ['seat','handL','handR','footL','footR'])if(seat[key])seat[key].at[1]-=low;
        for(const c of mounts.controls||[])c.at[1]-=low;
        const textures={};Finish.fittings(parts,r);Finish.apply(parts,textures,r,cache,options);Finish.decorate(parts,textures,r,cache);
        const sidecarExtra=GROUND.has(r.form)?{vehicle:{forward:'+z',wheels,...(mounts.seats?{seats:mounts.seats,controls:mounts.controls,stand:{lean:0,side:'left'}}:{})}}:{};
        return {kind:'vehicle',recipe:r,construction,parts,bones:[{name:'Prop',head:[0,0,0],parent:-1}],clips:[],textures,height:high-low,sidecarExtra};
    }
    function random(seed,input,scope='all') {
        const r=normalize(input),next=Paint.random(seed),all=scope==='all';
        if(all||scope==='shape'){for(const k of ['width','height','length'])r[k]*=.88+next()*.24;r.cabinHeight=.8+next()*.4;r.cabinLength=.85+next()*.3;r.wheelbase=.52+next()*.16;r.wheelSize=.85+next()*.3;r.stance=.85+next()*.3;}
        if(all||scope==='colors'){r.paint=['#426c80','#8c353b','#697460','#b29d78','#aeb8b7','#4f515e'][Math.floor(next()*6)];r.secondary=['#303c43','#b4bdba','#c5ac87','#48545e'][Math.floor(next()*4)];r.accent=['#d0a15c','#82c4ca','#b66d3d'][Math.floor(next()*3)];r.roughness=.3+next()*.4;r.finish=['enamel','powder','brushed','composite'][Math.floor(next()*4)];}
        if(all||scope==='details'){r.roofRack=next()>.55;r.bumper=next()>.2;r.cargo=next();r.armor=next();r.spokes=4+Math.floor(next()*7);r.tread=next();r.engineSize=.85+next()*.4;r.wear=next()*.7;r.grime=next()*.6;r.surfaceSeed=1+Math.floor(next()*999998);r.livery=['plain','stripe','rally','service'][Math.floor(next()*4)];r.aero=next();r.fairing=['naked','half','full'][Math.floor(next()*3)];r.flightFit=['transport','interceptor','cargo'][Math.floor(next()*3)];r.rotorGuard=['ring','cage','open'][Math.floor(next()*3)];r.tool=['claw','welder','none'][Math.floor(next()*3)];}
        return normalize(r);
    }
    const api={roadLayout,FORMS,GROUND,normalize,fromPreset,build,random};root.RRVehicleProp=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
    const Model=need('RRPropModel','./PropModel.js'),Catalog=need('RRPropCatalog','./PropCatalog.js');
    Model.register({id:'vehicle',label:'Vehicles',normalize,build,random,randomScopes:[['all','Everything'],['shape','Shape'],['colors','Colors'],['details','Details']]});
    Catalog.category({id:'vehicles',label:'Vehicles',order:55});
    for(const [id,label]of FORMS)Catalog.add({id:'vehicle-'+id,label,kind:'vehicle',category:'vehicles',icon:id==='motorcycle'?'motorcycle':id==='walker'?'walker':id==='drone'||id==='shuttle'||id==='hover'?'aircraft':'car',keywords:'vehicle transport '+id,start:()=>fromPreset(id),matches:r=>r.form===id});
    Catalog.ui('vehicle',{placeholder:'Vehicles',tabs:[['shape','Shape'],['look','Look'],['details','Details']],panel(tab){
        const f=this.recipe.form,ground=GROUND.has(f),car=ground&&f!=='motorcycle',slider=(path,label,range,step=.01)=>this._slider({path,label,range,step});
        if(tab==='shape'){
            let out=this._section('Dimensions')+slider('width','Width',[.5,8])+slider('height','Height',[.35,7])+slider('length','Length',[1,12]);
            if(ground)out+=slider('wheelSize','Wheel size',[.75,1.3]);
            if(car)out+=slider('wheelbase','Wheelbase',[.5,.72])+slider('axles','Axles',[2,3],1)+slider('clearance','Ground clearance',[0,1]);
            if(car||f==='hover'||f==='shuttle')out+=slider('cabinHeight','Cabin height',[.7,1.3]);
            if(car)out+=slider('cabinLength','Cabin length',[.75,1.25]);
            if(['hover','shuttle','drone'].includes(f))out+=slider('engineSize','Engine size',[.7,1.4]);
            if(['hover','shuttle'].includes(f))out+=slider('wingSpan','Wing span',[.7,1.4]);
            if(f==='walker')out+=slider('stance','Stance width',[.75,1.3]);
            return out;
        }
        if(tab==='look')return (car||['hover','shuttle'].includes(f)?this._check('interior','Cabin interior')+(this.recipe.interior?slider('windowOpacity','Window opacity',[.2,.95])+this._color('seatColor','Seat upholstery'):''):'')+this._select('finish','Paint finish',[['enamel','Enamel'],['powder','Powder coat'],['brushed','Brushed alloy'],['composite','Woven composite']])+this._select('livery','Paint scheme',[['plain','Plain'],['stripe','Coach stripe'],['rally','Rally'],['service','Service markings']])+`<label class="rr-c3d-row"><span class="rr-c3d-label">${this._t('Custom marking')}</span><input type="text" class="rr-input rr-prop-text" data-path="markings" maxlength="22" value="${this.recipe.markings}" spellcheck="false"></label>`+slider('wear','Paint wear',[0,1])+slider('grime','Grime',[0,1])+slider('surfaceSeed','Surface variation',[1,999999],1)+this._color('paint','Body color')+this._color('secondary','Secondary body color')+this._color('trim','Trim')+this._color('accent','Accent')+this._color('glass','Glass')+slider('roughness','Roughness',[.2,.9]);
        let out=this._check('details','Details')+this._check('lights','Lights');
        if(ground)out+=slider('spokes','Wheel spokes',[4,10],1)+slider('tread','Tire tread',[0,1]);
        if(car)out+=this._check('roofRack','Roof rack')+this._check('bumper','Bumpers');
        if(f==='truck'||f==='hover'||f==='shuttle')out+=slider('cargo','Cargo load',[0,1]);
        if(f==='rover'||f==='walker')out+=slider('armor','Armor thickness',[0,1]);
        if(['compact','sport'].includes(f))out+=slider('aero','Rear wing height',[0,1]);
        if(f==='motorcycle')out+=this._select('fairing','Fairing',[['naked','Naked'],['half','Half fairing'],['full','Full fairing']]);
        if(['hover','shuttle'].includes(f))out+=this._select('flightFit','Flight equipment',[['transport','Transport'],['interceptor','Interceptor'],['cargo','Cargo hauler']]);
        if(f==='drone')out+=this._select('rotorGuard','Rotor protection',[['ring','Duct ring'],['cage','Safety cage'],['open','Open rotor']]);
        if(f==='walker')out+=this._select('tool','Tool',[['claw','Claw'],['welder','Welder'],['none','None']]);
        return out;
    },reset:r=>fromPreset(r.form),moves:()=>false});
})(typeof window!=='undefined'?window:globalThis);
