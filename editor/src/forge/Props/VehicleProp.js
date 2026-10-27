/** Original procedural transport models. Shared dimensions drive the chassis,
 * wheel arches, suspension and cabin; equipment has actual mounting points.
 * Vehicle metadata reuses the existing game vehicle/rider contract. */
(function(root) {
    'use strict';
    const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null);
    const CM=need('RRContainerMesh','./ContainerMesh.js'),Paint=need('RRPropPaint','./PropPaint.js'),Construction=need('RRVehicleConstruction','./VehicleConstruction.js'),Bodywork=need('RRVehicleBodywork','./VehicleBodywork.js'),HS=need('RRHardSurface','./HardSurface.js'),Design=need('RRFlagDesign','./FlagDesign.js'),Finish=need('RRVehicleFinish','./VehicleFinish.js'),Rig=need('RRVehicleRig','./VehicleRig.js');
    const {add,sub,scale,norm,cross,dot}=CM.vec;
    const FORMS=[
        ['compact','Compact car',1.76,1.50,3.95],['sport','Sports coupe',1.98,1.18,4.50],
        ['truck','Utility truck',2.02,1.92,5.40],['rover','Armored rover',2.55,2.75,6.30],
        ['motorcycle','Motorcycle',.82,1.18,2.18],['hover','Hover transport',2.65,1.45,4.4],
        ['shuttle','Shuttle',4.2,2.1,6.4],['drone','Survey drone',1.45,.65,1.45],['walker','Utility walker',2.7,4.2,1.9]
    ];
    const BY_ID=new Map(FORMS.map(f=>[f[0],f]));
    const clamp=(v,a,b,d)=>Number.isFinite(+v)?Math.max(a,Math.min(b,+v)):d;
    const hex=(v,d)=>/^#[\da-f]{6}$/i.test(v)?v:d;
    const GROUND=new Set(['compact','sport','truck','rover','motorcycle']),TREADS=['road','allTerrain','mud'];
    // Body styles: Rounded (smooth lofted coachwork), Faceted (few stations,
    // flat panels, chamfered creases) and Armored (bolted chamfered plates over
    // a darker under-frame). A recipe saved before styles existed has no
    // bodyStyle and keeps the look it was saved with, which is Rounded; new
    // vehicles start from the per-form default below.
    const STYLES=['rounded','faceted','armored'],STYLE_DEFAULT={compact:'faceted',sport:'rounded',truck:'faceted',rover:'armored',motorcycle:'rounded',hover:'faceted',shuttle:'faceted',drone:'faceted',walker:'armored'};
    const DENSITY_DEFAULT={compact:.45,sport:.4,truck:.6,rover:.75,motorcycle:.5,hover:.6,shuttle:.65,drone:.6,walker:.7};
    function normalize(input={}) {
        const form=BY_ID.has(input.form)?input.form:'compact',f=BY_ID.get(form),r=input;
        return {kind:'vehicle',form,width:clamp(r.width,.5,8,f[2]),height:clamp(r.height,.35,7,f[3]),length:clamp(r.length,1,12,f[4]),
            paint:hex(r.paint,form==='rover'?'#697460':form==='sport'||form==='motorcycle'?'#8c353b':form==='walker'?'#bd8d43':'#426c80'),secondary:hex(r.secondary,form==='rover'?'#475144':form==='walker'?'#48545e':form==='compact'||form==='sport'||form==='motorcycle'?'#303c43':'#b4bdba'),trim:hex(r.trim,'#252c32'),accent:hex(r.accent,'#d0a15c'),glass:hex(r.glass,'#172c36'),
            interior:r.interior!==false,windowOpacity:clamp(r.windowOpacity,.2,.95,.62),seatColor:hex(r.seatColor,'#62717a'),finish:['enamel','powder','brushed','composite'].includes(r.finish)?r.finish:'enamel',wear:clamp(r.wear,0,1,['rover','walker','truck'].includes(form)?.35:.08),grime:clamp(r.grime,0,1,['rover','walker','truck'].includes(form)?.30:.06),surfaceSeed:Math.round(clamp(r.surfaceSeed,1,999999,701)),livery:['plain','stripe','rally','service'].includes(r.livery)?r.livery:['rover','walker','truck','hover','shuttle','drone'].includes(form)?'service':form==='sport'?'rally':'stripe',markings:typeof r.markings==='string'?r.markings.toUpperCase().replace(/[^A-Z0-9 .:/-]/g,'').slice(0,22):({compact:'R-17',sport:'24',truck:'FIELD SERVICE',rover:'RANGER 06',motorcycle:'R-17',hover:'UTILITY 17',shuttle:'EXPEDITION 07',drone:'SURVEY 06',walker:'WORK UNIT 06'}[form]),
            wheelSize:clamp(r.wheelSize,.75,1.3,1),wheelbase:clamp(r.wheelbase,.5,.72,(Bodywork.DESIGN[form]||{}).wheelbase||.62),clearance:clamp(r.clearance,0,1,.4),
            cabinHeight:clamp(r.cabinHeight,.7,1.3,1),cabinLength:clamp(r.cabinLength,.75,1.25,1),axles:Math.round(clamp(r.axles,2,3,form==='rover'?3:2)),
            armor:clamp(r.armor,0,1,form==='rover'?.8:.2),roughness:clamp(r.roughness,.2,.9,{sport:.24,compact:.30,motorcycle:.30,truck:.40,hover:.38,shuttle:.40,drone:.42}[form]??.52),
            spokes:Math.round(clamp(r.spokes,4,10,6)),tread:clamp(r.tread,0,1,form==='rover'||form==='truck'?.8:.25),treadPattern:TREADS.includes(r.treadPattern)?r.treadPattern:form==='rover'?'mud':form==='truck'?'allTerrain':'road',
            roofRack:!!r.roofRack,bumper:r.bumper!==false,lights:r.lights!==false,details:r.details!==false,
            cargo:clamp(r.cargo,0,1,form==='truck'?.5:0),wingSpan:clamp(r.wingSpan,.7,1.4,1),engineSize:clamp(r.engineSize,.7,1.4,1),
            stance:clamp(r.stance,.75,1.3,1),aero:clamp(r.aero,0,1,form==='sport'?.65:0),fairing:['naked','half','full'].includes(r.fairing)?r.fairing:'half',flightFit:['transport','interceptor','cargo'].includes(r.flightFit)?r.flightFit:'transport',rotorGuard:['ring','cage','open'].includes(r.rotorGuard)?r.rotorGuard:'ring',tool:['claw','welder','none'].includes(r.tool)?r.tool:'claw',
            bodyStyle:STYLES.includes(r.bodyStyle)?r.bodyStyle:'rounded',detailDensity:clamp(r.detailDensity,0,1,DENSITY_DEFAULT[form]),
            // Insignia: emblems only (RRFlagDesign layers), painted on doors, flanks and fins. None by default.
            insignia:insigniaOf(r.insignia),
            // Which motion the Prop Builder plays (preview only; the game plays the saved rules).
            motion:['none','doors','drive','gear','fly'].includes(r.motion)?r.motion:'none'};
    }
    function insigniaOf(v){const d=Design.normalize({field:{layout:'solid',colors:['#000000']},layers:v&&Array.isArray(v.layers)?v.layers:[]});return{field:d.field,layers:d.layers};}
    const fromPreset=form=>normalize({form,bodyStyle:STYLE_DEFAULT[BY_ID.has(form)?form:'compact']});
    /** A tandem rear bogie leaves a real access bay ahead of it. Door edges share wheel-clearance anchors. */
    function roadLayout(r){
        const W=r.width,H=r.height,L=r.length,span=L*r.wheelbase;
        const axleZ=r.axles===3?[-span*.5,-span*.17,span*.5]:[-span*.5,span*.5];
        const gap=Math.min(...axleZ.slice(1).map((z,i)=>z-axleZ[i]));
        // Per-class proportions (Bodywork.DESIGN): wheel size, floor, beltline
        // and the glasshouse stations. Clearance lifts the body on its wheels.
        const D=Bodywork.DESIGN[r.form],R=Math.min(H*D.R*r.wheelSize,gap*.44,W*.32),lift=H*.09*(r.clearance-.4),base=Math.max(R*.18,H*D.floor+lift),hood=Math.max(H*D.belt+lift*.6,base+R*1.25,R*2.05);
        const cabinZ=L*(D.cab[0]+D.cab[3])/2,cabinL=L*(D.cab[0]-D.cab[3])*r.cabinLength;
        const bays=axleZ.slice(1).map((z,i)=>[Math.max(axleZ[i]+R*1.14,cabinZ-cabinL*.47),Math.min(z-R*1.14,cabinZ+cabinL*.47)]).sort((a,b)=>(b[1]-b[0])-(a[1]-a[0]));
        const [rear,front]=bays[0],door={rear,front,z:(rear+front)/2,width:Math.max(.02,front-rear),low:base+H*.06,high:hood+H*.055};
        return{R,axleZ,hood,base,cabinZ,cabinL,door,design:D};
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
        const context={recipe:r,r,W,H,L,put,box,tube,sheet,bolt,wheels,bodywork:Bodywork,zones:new Map()};
        const wheel=(x,z,R,width,name)=>{const w=Bodywork.wheel(context,x,z,R,width,name);wheels.push(w);return w.at;};
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
            Object.assign(context,layout,{half});Bodywork.roadBody(context);
            const tireW=W*layout.design.tire,track=layout.design.track;
            for(let i=0;i<axleZ.length;i++)for(const sign of [-1,1]){
                const z=axleZ[i],x=sign*W*track,name=(i===0?'Rear':i===r.axles-1?'Front':'Middle')+(sign>0?' left':' right');
                wheel(x,z,R,tireW,name);
                tube('metal',[[0,R,z],[x,R,z]],H*.035);
                tube('metal',[[sign*W*.28,hood-H*.05,z],[x,R,z]],H*.019);
                // Opening contour: square legs from the sill to the axle, then
                // the arch; [y, z, outward direction in the side plane].
                const inner=R*1.085,outer=R*(r.form==='rover'?1.19:1.15),legs=Math.max(0,R-base),start=legs>0?0:Math.asin(Math.min(.92,(base-R)/inner)),steps=40,path=[];
                if(legs>0)for(let j=0;j<3;j++)path.push([base+legs*j/3,z-inner,[0,-1]]);
                for(let j=0;j<=steps;j++){const a=Math.PI-start-j/steps*(Math.PI-2*start);path.push([R+Math.sin(a)*inner,z+Math.cos(a)*inner,[Math.sin(a),Math.cos(a)]]);}
                if(legs>0)for(let j=2;j>=0;j--)path.push([base+legs*j/3,z+inner,[0,1]]);
                // Each station of the flange sits on the actual flank just outside the opening.
                const flank=path.map(([y,zz,d])=>context.sideAt(zz+d[1]*(outer-inner),y+d[0]*(outer-inner)));
                const point=(k,off,depth)=>{const [y,zz,d]=path[k];return[sign*(flank[k]-.004+depth),y+d[0]*off,zz+d[1]*off];};
                tube('trim',path.map((_,k)=>point(k,0,.010)),H*(.006+r.armor*.003));
                // A formed arch flange has finite width and closed beveled edges.
                const flange=new CM.Geo(),depth=W*.014,ow=outer-inner,bevel=Math.min(W*.0035,ow*.24),profile=[[0,0],[0,depth-bevel],[bevel,depth],[ow-bevel,depth],[ow,depth-bevel],[ow,0]];
                for(let k=0;k+1<path.length;k++){
                    const d=[(path[k][2][0]+path[k+1][2][0])/2,(path[k][2][1]+path[k+1][2][1])/2];
                    for(let j=0;j<profile.length;j++){
                        const p=profile[j],q=profile[(j+1)%profile.length],dr=q[0]-p[0],dd=q[1]-p[1],normal=norm([sign*dr,-d[0]*dd,-d[1]*dd]);
                        flange.poly([point(k,p[0],p[1]),point(k+1,p[0],p[1]),point(k+1,q[0],q[1]),point(k,q[0],q[1])],null,normal);
                    }
                }
                for(const k of [0,path.length-1]){const o=k?k-1:1,t=norm([0,path[k][0]-path[o][0],path[k][1]-path[o][1]]);flange.poly(profile.map(p=>point(k,p[0],p[1])),null,t);}
                put('paint',CM.smoothNormals(flange.done(),.80),'Formed wheel arches');
                // Dark liner inside the opening hides the painted underside.
                const liner=new CM.Geo(),lineIn=W*.44-tireW*.62,at=(k,xx)=>{const [y,zz,d]=path[k];return[sign*xx,y-d[0]*R*.010,zz-d[1]*R*.010];};
                for(let k=0;k+1<path.length;k++){const d=path[k][2],e=path[k+1][2];liner.poly([at(k,flank[k]-.006),at(k+1,flank[k+1]-.006),at(k+1,lineIn),at(k,lineIn)],null,[0,-(d[0]+e[0]),-(d[1]+e[1])]);}
                put('liner',liner.done(),'Wheel arch liners');
            }
            // Glasshouse from the class design: roof at the recipe height, the
            // windscreen and rear glass raked between their stations.
            const D=layout.design,cab=D.cab,roofY=hood+Math.max(H*.12,H*(D.roof-(r.bodyStyle==='rounded'?.058:.03))-hood)*r.cabinHeight,front=cabinZ+cabinL*.50,rear=cabinZ-cabinL*.50,at=t=>rear+cabinL*(t-cab[3])/(cab[0]-cab[3]),rf=at(cab[1]),rr=at(cab[2]),bw=W*D.bw,rw=W*D.rw;
            Object.assign(context,{R,hood,base,half,roofY,rf,rr,rw,bw,cabinZ,cabinL,axleZ,door});
            Bodywork.roadWindows({...context,front,rear,glazing,sheet});
            if(r.bodyStyle==='rounded')put('secondary',Bodywork.shell(Array.from({length:25},(_,i)=>{const t=i/24,crown=Math.sin(t*Math.PI);return[rr+(rf-rr)*t,rw*(1+.012*crown),roofY+H*(.008+.010*crown),H*(.018+.022*crown)];}),2.8,64),'Crowned roof panel');
            else put('secondary',HS.plate(HS.cut(HS.rect(-rw*1.015,-(rf-rr)*.5,rw*1.015,(rf-rr)*.5),H*.02),H*.032,H*.011,{frame:CM.frame([0,roofY+H*.012,(rr+rf)/2],[1,0,0],[0,0,-1])}),'Crowned roof panel');
            for(const sign of [-1,1]){
                tube('trim',[[sign*W*.22,hood+.012,front+.006],[sign*W*.10,hood+H*.10,front-(front-rf)*.25+.006]],W*.004);
                const hz=door.rear+door.width*.23,hy=context.bodyProfile.top(hz)-H*.13,hx=context.sideAt(hz,hy);
                box('trim',[sign*(hx+W*.002),hy,hz],[W*.006,H*.037,Math.min(L*.045,door.width*.32)],.006,'Door handle recess');
                box('metal',[sign*(hx+W*.007),hy,hz],[W*.009,H*.012,Math.min(L*.038,door.width*.27)],.004,'Door latch');
                const mirrorBase=[sign*bw,hood+H*.10,front-L*.035],mirror=[sign*W*.56,hood+H*.11,front-L*.055];
                // A rounded housing on a stalk with the glass on its rear face.
                const ms=[W*.13,H*.075,L*.04];tube('trim',[mirrorBase,mirror],W*.010);put('paint',CM.roundedBox(mirror,ms,Math.min(...ms)*.46,4));
                put('glass',CM.roundedBox([mirror[0]+sign*W*.004,mirror[1],mirror[2]-ms[2]*.5],[ms[0]*.84,ms[1]*.72,.006],.004,2),'Mirror face');

            }
            const fit=Bodywork.cabin({...context,front,rear});
            // The riders sit where the seats are built: the driver first, hands on the wheel rim.
            if(fit){mounts.seats=fit.seats;mounts.controls=fit.controls;}
            Bodywork.roadFace(context);
            if(r.roofRack){for(const x of [-W*.29,W*.29]){for(const z of [rr,rf])tube('trim',[[x,roofY,z],[x,roofY+H*.10,z]],H*.016);tube('metal',[[x,roofY+H*.10,rr],[x,roofY+H*.10,rf]],H*.019);}for(let j=0;j<5;j++){const z=rr+(rf-rr)*j/4;tube('metal',[[-W*.29,roofY+H*.10,z],[W*.29,roofY+H*.10,z]],H*.012);}}
            if(r.form==='truck'){
                // The shell is open over the bed: a real tub with rails and a gate.
                const bed=context.panels.bed,bz=(bed.rear+bed.front)/2,bedL=bed.front-bed.rear;
                for(const x of [-W*.43,W*.43])box('paint',[x,hood+H*.04,bz],[W*.10,H*.22,bedL],.016,'Bed side rails');
                box('paint',[0,hood+H*.04,bed.rear+.0175],[W*.90,H*.22,.035],.016,'Tailgate');
                if(r.cargo>.05)for(let i=0;i<Math.ceil(r.cargo*3);i++)box('cargo',[(i-1)*W*.20,bed.floor+H*.10,bz-bedL*.06],[W*.18,H*.20,Math.min(L*.17,bedL*.8)],.016);
            }else if(r.form==='rover'&&r.armor>.1&&r.bodyStyle!=='armored'){
                for(const sign of [-1,1]){box('armor',[sign*W*.47,hood+H*.08,cabinZ-cabinL*.30],[W*(.02+.025*r.armor),H*.18,cabinL*.26],.020);vent([sign*W*.15,hood-H*.15,-L*.49+H*.0001],[W*.16,H*.15,.015],5,true);}
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
                tube('metal',[[x,H*.30,-L*.09],[sign*W*.38,H*.30,-L*.09]],W*.025);
                tube('metal',[[x,H*.34,-L*.11],[sign*W*.22,H*.27,-L*.25],[sign*W*.24,H*.28,-L*.29]],W*.041,'Exhaust headers');
                if(r.details)for(let j=0;j<6;j++)box('metal',[sign*W*.218,engine[1]+j*H*.015,engine[2]],[W*.055,H*.006,L*.12],.002);
            }
            box('dark',engine,[W*.40,H*.20,L*.21],.035);
            // Tank: from just behind the steering head (its front cap meets the head stock, under the top clamp)
            // back over the frame to the seat, widest over the knees, its underside sitting on the frame rails.
            const tz0=-L*.12,tz1=neck[2]-.028,tw=t=>t<.55?Math.sin(Math.PI/2*t/.55):1-.48*((t-.55)/.45)**2,
                tcy=t=>{const back=seat-H*.025,fr=neck[1]-H*.035,k=Math.max(0,(t-.45)/.55);return back+H*.012*Math.sin(t*Math.PI)+(fr-back)*k*k;},
                th=t=>H*(.006+(t<.55?.135*tw(t)**.75:.135-.06*((t-.55)/.45)**1.4));
            const tank=new CM.Geo(),tankRows=36,tankSides=48,tankRing=i=>{const t=i/tankRows,z=tz0+(tz1-tz0)*t,cy=tcy(t),hw=W*(.004+.225*tw(t)**.65),hh=th(t);return Array.from({length:tankSides},(_,j)=>{const a=j/tankSides*Math.PI*2;return[Math.cos(a)*hw,cy+Math.sin(a)*hh,z];});};
            const tankRings=Array.from({length:tankRows+1},(_,i)=>tankRing(i));
            for(let i=0;i<tankRows;i++)for(let j=0;j<tankSides;j++){const k=(j+1)%tankSides,p=[tankRings[i][j],tankRings[i][k],tankRings[i+1][k],tankRings[i+1][j]],t=(i+.5)/tankRows,center=[0,tcy(t),tz0+(tz1-tz0)*t];let normal=norm(cross(sub(p[1],p[0]),sub(p[3],p[0])));if(dot(normal,sub(scale(add(p[0],p[2]),.5),center))<0)normal=scale(normal,-1);tank.poly(p,null,normal);}
            tank.poly(tankRings[0],null,[0,0,-1]);tank.poly(tankRings.at(-1),null,[0,0,1]);put('paint',CM.smoothNormals(tank.done(),.85),'Formed fuel tank');
            // Steering head: the head stock the tank's nose meets, the top clamp across the fork tops and the bar risers.
            const top=neck[1]+H*.012;
            tube('metal',[[0,neck[1]-H*.11,neck[2]+.022],[0,top,neck[2]-.004]],W*.042,'Head stock');
            box('metal',[0,top,neck[2]],[W*.40,H*.022,W*.10],.008,'Steering');
            const barY=H*.80,gripZ=L*.19,clampZ=neck[2]-.012;
            for(const sx of [-1,1])box('metal',[sx*W*.075,(top+barY)/2,clampZ],[W*.035,barY-top+.01,W*.035],.005,'Steering');
            // Handlebar: one bent tube through the clamps, swept back to the grips.
            const half=[[W*.075,barY,clampZ],[W*.17,barY+H*.004,clampZ-.01],[W*.27,barY+H*.012,gripZ+.012],[W*.33,barY+H*.018,gripZ]];
            tube('metal',[...half.map(([x,y,z])=>[-x,y,z]).reverse(),...half],Math.max(.009,W*.013),'Steering');
            for(const sx of [-1,1]){
                tube('rubber',[[sx*W*.33,barY+H*.018,gripZ],[sx*W*.47,barY+H*.02,gripZ-.004]],Math.max(.014,W*.02),'Steering grips');
                tube('metal',[[sx*W*.47,barY+H*.02,gripZ-.004],[sx*W*.495,barY+H*.02,gripZ-.005]],Math.max(.012,W*.016),'Steering');
                // Lever perch and a blade lever reaching forward of the grip.
                box('trim',[sx*W*.305,barY+H*.018,gripZ],[W*.04,W*.04,W*.045],.006,'Steering perches and mirrors');
                tube('metal',[[sx*W*.31,barY+H*.022,gripZ+.022],[sx*W*.38,barY+H*.026,gripZ+.05],[sx*W*.45,barY+H*.024,gripZ+.045]],Math.max(.004,W*.006),'Steering');
                // Mirror: a thin stalk up from the perch to a small head well above the bar.
                const head=[sx*W*.40,barY+H*.16,gripZ+.01];
                tube('metal',[[sx*W*.30,barY+H*.03,gripZ+.006],[sx*W*.33,barY+H*.10,gripZ+.008],[sx*W*.37,barY+H*.145,gripZ+.01]],Math.max(.004,W*.0055),'Steering');
                put('trim',CM.roundedBox(head,[W*.15,H*.055,W*.035],W*.014,3),'Steering perches and mirrors');
                put('glass',CM.roundedBox([head[0],head[1],head[2]-W*.019],[W*.13,H*.042,.004],.003,2),'Steering mirror glass');
            }
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
            const capT=.5,capZ=tz0+(tz1-tz0)*capT,capY=tcy(capT)+th(capT);
            const cap=CM.frame([0,capY-.002,capZ],[1,0,0],[0,0,-1]);put('metal',CM.revolveOn(cap,0,0,[[0,0],[W*.05,0],[W*.05,.007],[0,.007]],16));
            // Instrument pod on a stem from the top clamp, behind the bars, tipped toward the rider.
            const pod=[0,top+H*.075,neck[2]-.035],dial=CM.frame(pod,[1,0,0],[0,.62,-.78]);
            box('trim',[0,(top+pod[1])/2,neck[2]-.02],[W*.05,pod[1]-top,W*.04],.006,'Instrument stem');
            put('trim',CM.revolveOn(dial,0,0,[[0,-.03],[W*.085,-.03],[W*.09,-.012],[W*.085,.012],[0,.012]],24));put('glass',CM.revolveOn(dial,0,0,[[0,.012],[W*.072,.012],[W*.072,.014],[0,.014]],24));
            put('light',CM.slab(CM.rect(0,0,W*.006,W*.08),{...dial,o:add(dial.o,scale(dial.n,.015))},.001,.0002,true));
            // Headlamp on ears from the fork legs (naked), or the fairing on stays from the head stock.
            const forkZ=y=>front+(neck[2]-front)*(y-R)/(neck[1]-R);
            if(r.fairing==='naked'){lamp([0,H*.70,L*.27],[W*.32,H*.09,.035]);for(const sx of [-1,1])tube('metal',[[sx*W*.16,H*.66,forkZ(H*.66)],[sx*W*.16,H*.70,L*.27-.03]],W*.012,'Headlamp ears');
                // A small fly screen on the lamp's top, braced to it.
                sheet('glass',[[-W*.17,H*.75,L*.255],[W*.17,H*.75,L*.255],[W*.14,H*.90,L*.215],[-W*.14,H*.90,L*.215]]);for(const sx of [-1,1])tube('metal',[[sx*W*.12,H*.745,L*.26],[sx*W*.12,H*.80,L*.24]],W*.006,'Fly screen stays');}
            else for(const sx of [-1,1])tube('metal',[[sx*W*.05,top-H*.03,neck[2]+.02],[sx*W*.10,H*.76,L*.24],[sx*W*.14,H*.77,L*.27]],W*.009,'Fairing stays');
            lamp([0,seat,-L*.31],[W*.20,H*.035,.025],true);
            Bodywork.bike({...context,glazing});
            mounts.seats=[{posture:'astride',seat:{at:[0,seat+.025,-L*.16]},handL:{at:[W*.41,H*.82,L*.188]},handR:{at:[-W*.41,H*.82,L*.188]},footL:{at:[W*.36,H*.30,-L*.09]},footR:{at:[-W*.36,H*.30,-L*.09]}}];
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
            glass:{color:r.glass,roughness:.17,metalness:.38},cargo:{color:r.accent,roughness:.82},light:{color:'#94a7a3',emissive:'#e2eeea',emissiveIntensity:.85,roughness:.25},frame:{color:'#2a3034',roughness:.62,metalness:.55},
            red:{color:'#932d23',emissive:'#c42e20',emissiveIntensity:.9,roughness:.27},liner:{color:'#101417',roughness:.9,doubleSided:true},chrome:{color:'#d3d9dc',roughness:.16,metalness:1},lens:{color:'#e6eef0',roughness:.03,metalness:.10,opacity:.18},redlens:{color:'#b0261c',roughness:.08,metalness:.10,opacity:.62,...(r.lights?{emissive:'#7a1710',emissiveIntensity:.35}:{})},glow:{color:r.accent,emissive:r.accent,emissiveIntensity:r.lights?1.4:0,roughness:.3}};
        const parts=[];
        for(const [key,list]of groups){const [kind,name]=key.split('|'),mesh=CM.merge(list);if(!mesh.index.length)continue;CM.skin(mesh,0);parts.push({...mesh,...materials[kind],metalness:materials[kind].metalness??0,surfaceRole:kind,name:name===kind?BY_ID.get(r.form)[1]+' '+kind:name});}
        if(context.zones)for(const p of parts){const z=context.zones.get(p.name);if(z)p.zone=z;}
        for(const p of parts)CM.mapUv(p,(_,__,i)=>{const n=Array.from(p.normals.subarray(i*3,i*3+3),Math.abs),axis=n.indexOf(Math.max(...n)),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1];return axes.map(k=>p.positions[i*3+k]*5);});
        let low=Infinity,high=-Infinity;for(const p of parts)for(let i=1;i<p.positions.length;i+=3){low=Math.min(low,p.positions[i]);high=Math.max(high,p.positions[i]);}
        for(const p of parts)for(let i=1;i<p.positions.length;i+=3)p.positions[i]-=low;
        for(const w of wheels)w.at[1]-=low;
        for(const seat of mounts.seats||[])for(const key of ['seat','handL','handR','footL','footR'])if(seat[key])seat[key].at[1]-=low;
        for(const c of mounts.controls||[])c.at[1]-=low;
        const textures={};Finish.fittings(parts,r);Finish.apply(parts,textures,r,cache,options);tint(parts,context.tints);Finish.decorate(parts,textures,r,cache,options.images||{});for(const p of parts)delete p.zone;
        const rigged=Rig.pieces(parts,r,context,wheels,low);// tags door, fan and gear pieces; their meshes stay as they were
        const finalParts=consolidate(parts,r,wheels,mounts);
        const motion=Rig.finish(finalParts,rigged,r,wheels);
        const sidecarExtra=GROUND.has(r.form)?{vehicle:{forward:'+z',wheels,...(mounts.seats?{seats:mounts.seats,controls:mounts.controls,...(r.form==='motorcycle'?{stand:{lean:0,side:'left'}}:{})}:{})}}:{};
        // Doors, gear and fans: pivots and rules the game plays (Play Model Animation by name), editable on the 3D Models page.
        if(motion.rules.length)Object.assign(sidecarExtra,{parts:motion.regions,animations:motion.rules});
        // The bars' other parts (grips, perches, mirrors) turn with the bars about the steering head.
        const steerAt=(mounts.controls||[]).find(c=>c.part==='Steering');if(r.form==='motorcycle'&&steerAt){const pv={};for(const p of finalParts)if(/^Steering /.test(p.name))pv[p.name]=steerAt.at.map(v=>Math.round(v*1e4)/1e4);if(Object.keys(pv).length)sidecarExtra.pivots=pv;}
        const missing=r.insignia.layers.length?Design.pictures(r.insignia).find(n=>!(options.images||{})[n])||'':'';
        return {kind:'vehicle',recipe:r,construction,parts:finalParts,bones:motion.bones,clips:[],previewClips:motion.preview(r.motion),motions:motion.clips.map(c=>c.name),textures,height:high-low,sidecarExtra,imageName:missing,imageMissing:!!missing};
    }
    /** Per-vertex color factors after the coating: drilled holes, vent
     * bands and bright fasteners on dark rims. f(position) -> k or [r,g,b]. */
    function tint(parts,tints){
        if(!tints)return;
        for(const p of parts){const f=tints.get(p.name);if(!f||!p.colors)continue;for(let i=0;i<p.positions.length/3;i++){const v=f([p.positions[i*3],p.positions[i*3+1],p.positions[i*3+2]]);if(v===1)continue;for(let k=0;k<3;k++)p.colors[i*3+k]=Array.isArray(v)?v[k]:p.colors[i*3+k]*v;}}
    }
    // Parts the runtime, the finish or saved data address by name stay whole.
    const KEEP=new Set(['Sculpted body shell','Access door','Formed wheel arches','Access step','Step supports','Vehicle markings','Vehicle lettering','Outboard cargo pods','Turbine casings']),KEEP_PATTERN=/divider|mullion|^Steering /i;
    // A merged group takes this name when one of its members has it.
    const ADOPT=['Cabin seat upholstery','Cabin steering wheel','Tail lamp lens'];
    /** Draw-call consolidation: after the coating bake, parts that share one
     * material become one mesh. Wheels, steering and named panels stay apart. */
    function consolidate(parts,r,wheels,mounts){
        const keep=new Set(KEEP);for(const w of wheels){keep.add(w.part);for(const n of w.with)keep.add(n);}for(const c of mounts.controls||[])if(c.part)keep.add(c.part);
        const label=BY_ID.get(r.form)[1],q=v=>v==null?'':Math.round(v*1000)/1000;
        const key=p=>JSON.stringify([p.surfaceRole,p.texture||'',p.normalTexture||'',p.metallicRoughnessTexture||'',q(p.normalScale),p.texture||p.colors?'':p.color,!!p.colors,q(p.roughness),q(p.metalness),q(p.opacity??1),p.emissive||'',q(p.emissiveIntensity),p.emissiveTexture||'',!!p.cutout,q(p.alphaCutoff),!!p.blend,!!p.doubleSided]);
        const out=[],groups=new Map();
        for(const p of parts){if(!p.index.length)continue;if(keep.has(p.name)||KEEP_PATTERN.test(p.name)){out.push(p);continue;}const k=key(p);if(!groups.has(k)){groups.set(k,[]);out.push(k);}groups.get(k).push(p);}
        const used=new Set(parts.map(p=>p.name));
        return out.map(entry=>{
            if(typeof entry!=='string')return entry;const list=groups.get(entry);if(list.length===1)return list[0];
            for(const p of list)delete p.ao;const mesh=CM.merge(list);mesh.uvs=new Float32Array(mesh.positions.length/3*2);let v=0;for(const p of list){if(p.uvs)mesh.uvs.set(p.uvs,v*2);v+=p.positions.length/3;}
            if(list[0].colors){mesh.colors=new Float32Array(mesh.positions.length);v=0;for(const p of list){mesh.colors.set(p.colors,v*3);v+=p.positions.length/3;}}
            delete mesh.ao;const own=list.find(p=>p.name===label+' '+p.surfaceRole)||list.find(p=>ADOPT.includes(p.name));
            let name=own?own.name:label+' '+list[0].surfaceRole;
            if(!own&&used.has(name)&&!list.some(p=>p.name===name)){let n=2;while(used.has(name+' '+n))n++;name+=' '+n;}used.add(name);
            const rest={...list[0]};for(const k of ['positions','normals','uvs','index','joints','weights','colors'])delete rest[k];
            return{...rest,...mesh,name};
        });
    }
    function random(seed,input,scope='all') {
        const r=normalize(input),next=Paint.random(seed),all=scope==='all';
        if(all||scope==='shape'){for(const k of ['width','height','length'])r[k]*=.88+next()*.24;r.cabinHeight=.8+next()*.4;r.cabinLength=.85+next()*.3;r.wheelbase=.52+next()*.16;r.wheelSize=.85+next()*.3;r.stance=.85+next()*.3;r.bodyStyle=STYLES[Math.floor(next()*3)];}
        if(all||scope==='colors'){r.paint=['#426c80','#8c353b','#697460','#b29d78','#aeb8b7','#4f515e'][Math.floor(next()*6)];r.secondary=['#303c43','#b4bdba','#c5ac87','#48545e'][Math.floor(next()*4)];r.accent=['#d0a15c','#82c4ca','#b66d3d'][Math.floor(next()*3)];r.roughness=.3+next()*.4;r.finish=['enamel','powder','brushed','composite'][Math.floor(next()*4)];}
        if(all||scope==='details'){r.roofRack=next()>.55;r.bumper=next()>.2;r.cargo=next();r.armor=next();r.spokes=4+Math.floor(next()*7);r.tread=next();r.treadPattern=TREADS[Math.floor(next()*3)];r.engineSize=.85+next()*.4;r.wear=next()*.7;r.grime=next()*.6;r.surfaceSeed=1+Math.floor(next()*999998);r.livery=['plain','stripe','rally','service'][Math.floor(next()*4)];r.aero=next();r.fairing=['naked','half','full'][Math.floor(next()*3)];r.flightFit=['transport','interceptor','cargo'][Math.floor(next()*3)];r.rotorGuard=['ring','cage','open'][Math.floor(next()*3)];r.tool=['claw','welder','none'][Math.floor(next()*3)];r.detailDensity=.2+next()*.8;}
        return normalize(r);
    }
    const api={roadLayout,FORMS,GROUND,STYLES,STYLE_DEFAULT,normalize,fromPreset,build,random};root.RRVehicleProp=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
    const Model=need('RRPropModel','./PropModel.js'),Catalog=need('RRPropCatalog','./PropCatalog.js');
    Model.register({id:'vehicle',label:'Vehicles',normalize,build,random,randomScopes:[['all','Everything'],['shape','Shape'],['colors','Colors'],['details','Details']]});
    Catalog.category({id:'vehicles',label:'Vehicles',order:55});
    for(const [id,label]of FORMS)Catalog.add({id:'vehicle-'+id,label,kind:'vehicle',category:'vehicles',icon:id==='motorcycle'?'motorcycle':id==='walker'?'walker':id==='drone'||id==='shuttle'||id==='hover'?'aircraft':'car',keywords:'vehicle transport '+id,start:()=>fromPreset(id),matches:r=>r.form===id});
    Catalog.ui('vehicle',{placeholder:'Vehicles',tabs:[['shape','Shape'],['look','Look'],['details','Details']],panel(tab){
        const f=this.recipe.form,ground=GROUND.has(f),car=ground&&f!=='motorcycle',slider=(path,label,range,step=.01)=>this._slider({path,label,range,step});
        if(tab==='shape'){
            let out=this._select('bodyStyle','Body style',[['rounded','Rounded'],['faceted','Faceted'],['armored','Armored']])+this._section('Dimensions')+slider('width','Width',[.5,8])+slider('height','Height',[.35,7])+slider('length','Length',[1,12]);
            if(ground)out+=slider('wheelSize','Wheel size',[.75,1.3]);
            if(car)out+=slider('wheelbase','Wheelbase',[.5,.72])+slider('axles','Axles',[2,3],1)+slider('clearance','Ground clearance',[0,1]);
            if(car||f==='hover'||f==='shuttle')out+=slider('cabinHeight','Cabin height',[.7,1.3]);
            if(car)out+=slider('cabinLength','Cabin length',[.75,1.25]);
            if(['hover','shuttle','drone'].includes(f))out+=slider('engineSize','Engine size',[.7,1.4]);
            if(['hover','shuttle'].includes(f))out+=slider('wingSpan','Wing span',[.7,1.4]);
            if(f==='walker')out+=slider('stance','Stance width',[.75,1.3]);
            return out;
        }
        if(tab==='look')return (car||['hover','shuttle','walker'].includes(f)?this._check('interior','Cabin interior')+(this.recipe.interior?slider('windowOpacity','Window opacity',[.2,.95])+this._color('seatColor','Seat upholstery'):''):'')+this._select('finish','Paint finish',[['enamel','Enamel'],['powder','Powder coat'],['brushed','Brushed alloy'],['composite','Woven composite']])+this._select('livery','Paint scheme',[['plain','Plain'],['stripe','Coach stripe'],['rally','Rally'],['service','Service markings']])+`<label class="rr-c3d-row"><span class="rr-c3d-label">${this._t('Custom marking')}</span><input type="text" class="rr-input rr-prop-text" data-path="markings" maxlength="22" value="${this.recipe.markings}" spellcheck="false"></label>`+slider('wear','Paint wear',[0,1])+slider('grime','Grime',[0,1])+slider('surfaceSeed','Surface variation',[1,999999],1)+this._color('paint','Body color')+this._color('secondary','Secondary body color')+this._color('trim','Trim')+this._color('accent','Accent')+this._color('glass','Glass')+slider('roughness','Roughness',[.2,.9])
            // Insignia: the Design page's emblems-only list (shapes, or a project picture), painted on doors, flanks and fins.
            +(this._designPanel?this._designPanel('insignia',{field:false}):'');
        let out=this._check('details','Details')+(this.recipe.details?slider('detailDensity','Detail density',[0,1]):'')+this._check('lights','Lights');
        if(ground)out+=slider('spokes','Wheel spokes',[4,10],1)+slider('tread','Tire tread',[0,1])+this._select('treadPattern','Tread pattern',[['road','Road'],['allTerrain','All-terrain'],['mud','Mud']]);
        if(car)out+=this._check('roofRack','Roof rack')+this._check('bumper','Bumpers');
        if(f==='truck'||f==='hover'||f==='shuttle')out+=slider('cargo','Cargo load',[0,1]);
        if(f==='rover'||f==='walker')out+=slider('armor','Armor thickness',[0,1]);
        if(['compact','sport'].includes(f))out+=slider('aero','Rear wing height',[0,1]);
        if(f==='motorcycle')out+=this._select('fairing','Fairing',[['naked','Naked'],['half','Half fairing'],['full','Full fairing']]);
        if(['hover','shuttle'].includes(f))out+=this._select('flightFit','Flight equipment',[['transport','Transport'],['interceptor','Interceptor'],['cargo','Cargo hauler']]);
        if(f==='drone')out+=this._select('rotorGuard','Rotor protection',[['ring','Duct ring'],['cage','Safety cage'],['open','Open rotor']]);
        if(f==='walker')out+=this._select('tool','Tool',[['claw','Claw'],['welder','Welder'],['none','None']]);
        // Preview of what moves (the saved model plays its rules in game: Doors open/close, Gear up/down, fans and wheels).
        const motions=[['none','Parked (still)'],...(car?[['doors','Doors swinging open']]:[]),...(ground?[['drive','Wheels rolling']]:[]),...(['hover','shuttle'].includes(f)?[['gear','Landing gear folding']]:[]),...(['hover','drone'].includes(f)?[['fly','Fans and rotors spinning']]:[])];
        if(motions.length>1)out+=this._select('motion','Vehicle motion preview',motions);
        return out;
    },act(act,b){if(this._designAct)this._designAct(act,b);},reset:r=>fromPreset(r.form),moves:()=>false});
})(typeof window!=='undefined'?window:globalThis);
