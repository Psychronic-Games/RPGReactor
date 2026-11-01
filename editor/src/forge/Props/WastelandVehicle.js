/** Salvaged transport: original chassis, occupied cabins and repair assemblies.
 * Dimensions are meters; +z is forward. Shared running gear uses VehicleBodywork. */
(function(root){
    'use strict';
    const need=(n,f)=>root[n]||(typeof require==='function'?require(f):null);
    const CM=need('RRContainerMesh','./ContainerMesh.js'),Paint=need('RRPropPaint','./PropPaint.js');
    const {add,sub,scale,norm,cross}=CM.vec,TAU=Math.PI*2;
    const FORMS=[
        ['scrapBuggy','Scavenger buggy',2.10,2.05,3.80],
        ['scrapInterceptor','Raider interceptor',2.14,1.82,4.85],
        ['scrapPickup','Salvage pickup',2.30,2.36,5.85],
        ['scrapHauler','Six-wheel scrap hauler',2.65,2.95,7.70],
        ['scrapTanker','Wasteland water tanker',2.65,3.10,8.20],
        ['warBus','Fortified survivor bus',2.65,3.35,9.70],
        ['scrapBike','Scrambler motorcycle',.92,1.42,2.55],
        ['scrapCrawler','Tracked recovery crawler',2.95,2.95,5.70]
    ];
    const IDS=new Set(FORMS.map(f=>f[0]));
    const DEFAULTS={paint:'#777355',secondary:'#456e73',accent:'#a25d36',trim:'#282b29',seatColor:'#4b493d',finish:'powder',wear:.67,grime:.62,corrosion:.58,tread:.94,treadPattern:'mud',detailDensity:.8,livery:'plain',markings:'',armor:.65,cargo:.65,bodyStyle:'armored',roofRack:true};

    /** Mechanical kit shared by the salvaged vehicles and the modern minivan. */
    function kit(c){
        const {r,W,H,L,put,box,tube,sheet,bodywork:B}=c,random=Paint.random(r.salvageSeed||1701);
        let panelIndex=0;
        const ring=(kind,p,R,t,axis='z',name='Machined collars')=>{
            const F=CM.frame(p,axis==='x'?[0,0,-1]:[1,0,0],axis==='y'?[0,0,-1]:[0,1,0]);
            return put(kind,CM.revolveOn(F,0,0,[[R-t,-t/2],[R,-t/2],[R,t/2],[R-t,t/2],[R-t,-t/2]],40),name);
        };
        const fastener=(p,u=[1,0,0],v=[0,1,0],radius=.010)=>{
            if(!r.details)return;
            put('metal',CM.revolveOn(CM.frame(p,u,v),0,0,[[0,0],[radius*1.35,0],[radius*1.35,.003],[radius,.004],[radius,.011],[0,.011]],6),'Repair bolt heads');
        };
        function plate(kind,points,name='Salvaged body panel',thickness=.032){
            const id=++panelIndex,n=norm(cross(sub(points[1],points[0]),sub(points[2],points[0])));
            sheet(kind,points,thickness,name+' '+id);
            if(r.details){
                const center=scale(points.reduce((sum,p)=>add(sum,p),[0,0,0]),1/points.length);
                for(const p of points){const at=add(add(scale(p,.86),scale(center,.14)),scale(n,thickness*.65));fastener(at,norm(sub(points[1],points[0])),norm(cross(n,sub(points[1],points[0]))));}
            }
        }
        function patch(points){
            if(!r.details)return;
            const a=points[0],b=points[1],d=points.at(-1),u=.17+random()*.20,v=.16+random()*.16;
            const at=(x,y)=>add(a,add(scale(sub(b,a),x),scale(sub(d,a),y)));
            const n=norm(cross(sub(b,a),sub(d,a))),corners=[[u,v],[u+.28,v],[u+.28,v+.25],[u,v+.25]].map(([x,y])=>add(at(x,y),scale(n,.029)));
            plate(random()>.5?'secondary':'accent',corners,'Welded donor patch',.012);
            for(let j=0;j<4;j++){
                const p=corners[j],q=corners[(j+1)%4],len=Math.hypot(...sub(q,p));
                const count=Math.min(20,Math.ceil(len/.035));
                for(let k=0;k<count;k++){const t=(k+.5)/count,pt=add(add(p,scale(sub(q,p),t)),scale(n,.011));put('metal',CM.sweep([add(pt,scale(sub(q,p),-.20/count)),add(pt,scale(sub(q,p),.20/count))],.004,8,true),'Stitch weld beads');}
            }
        }
        function wheel(x,z,R,width,name,yOffset=0){
            const before=new Map([...c.groups].map(([k,v])=>[k,v.length]));
            const w=B.wheel(c,x,z,R,width,name);
            if(yOffset)for(const [key,list]of c.groups)for(const m of list.slice(before.get(key)||0))CM.transform(m,p=>[p[0],p[1]+yOffset,p[2]]);
            w.at[1]+=yOffset;c.wheels.push(w);return w;
        }
        function suspension(z,R,track){
            tube('frame',[[-track,R,z],[track,R,z]],.055,'Live axles');
            box('frame',[0,R,z],[.31,.25,.25],.065,'Differential housings');
            for(const s of [-1,1]){
                tube('metal',[[s*W*.24,R*1.1,z-.32],[s*track,R,z]],.035,'Suspension links');
                const low=[s*W*.32,R,z],high=[s*W*.31,R*1.95,z-.12],d=sub(high,low),u=norm(cross(norm(d),[1,0,0])),v=cross(norm(d),u);
                tube('metal',[low,high],.022,'Shock piston rods');tube('accent',[add(low,scale(d,.48)),high],.045,'Shock cylinders');
                if(r.details)tube('trim',Array.from({length:65},(_,i)=>{const t=i/64,a=t*TAU*7;return add(add(low,scale(d,.12+t*.65)),add(scale(u,Math.cos(a)*.065),scale(v,Math.sin(a)*.065)));}),.010,'Suspension coil springs');
            }
        }
        function chassis(R,axles){
            const deck=R*(r.form==='scrapInterceptor'?1.15:1.55);
            for(const s of [-1,1])box('frame',[s*W*.27,deck-.10,0],[.13,.20,L*.88],.022,'Chassis rails');
            for(let j=0;j<6;j++)tube('frame',[[-W*.28,deck-.10,-L*.40+j*L*.16],[W*.28,deck-.10,-L*.40+j*L*.16]],.045,'Frame crossmembers');
            for(const z of axles)suspension(z,R,W*.42);
            tube('metal',[[0,R*.96,axles[0]],[0,R*.96,axles.at(-1)]],.040,'Propeller shaft');
            return deck;
        }
        function seat(at,driver=false,posture='seated'){
            B.seatUnit(c,at,{width:.49,floor:Math.max(.12,at[1]-.38),recline:.18});
            const item={posture,seat:{at:at.slice()},handL:{at:add(at,[.14,.09,.26])},handR:{at:add(at,[-.14,.09,.26])},footL:{at:add(at,[.13,-.34,.60])},footR:{at:add(at,[-.13,-.34,.60])}};
            (c.mounts.seats||(c.mounts.seats=[])).push(item);
            // Belts stay against the backrest and cushion rather than crossing empty air.
            for(const s of [-1,1])tube('trim',[add(at,[s*.20,.45,-.15]),add(at,[-s*.13,.02,.13])],.016,'Reclaimed seat harnesses');
            if(driver)controls(at,item);return item;
        }
        function controls(at,item){
            const center=add(at,[0,.28,.48]),F=CM.frame(center,[1,0,0],[0,.80,-.60]);
            put('trim',CM.revolveOn(F,0,0,[[.145,-.012],[.178,-.012],[.178,.012],[.145,.012],[.145,-.012]],48),'Cabin steering wheel');
            for(let j=0;j<3;j++){const a=j/3*TAU;tube('metal',[center,add(center,add(scale(F.u,Math.cos(a)*.15),scale(F.v,Math.sin(a)*.15)))],.014,'Steering wheel spokes');}
            tube('frame',[add(at,[0,-.18,.72]),center],.033,'Steering column');
            item.handL={at:add(center,scale(F.u,.16))};item.handR={at:add(center,scale(F.u,-.16))};
            c.mounts.controls=[{input:'steer',shape:'wheel',part:'Cabin steering wheel',at:center,axis:F.n,degrees:90,degreesAtSpeed:65}];
        }
        function lamp(p,R=.095,rear=false){
            const F=CM.frame(p,[1,0,0],[0,rear?-1:1,0]);
            put('trim',CM.revolveOn(F,0,0,[[0,-.035],[R*1.2,-.035],[R*1.2,.010],[R,.025],[0,.025]],40),'Lamp housings');
            put('metal',CM.revolveOn(F,0,0,[[R*.80,.025],[R,.025],[R,.033],[R*.80,.033],[R*.80,.025]],40),'Lamp bezels');
            put(r.lights?(rear?'red':'light'):'glass',CM.revolveOn(F,0,0,[[0,.034],[R*.79,.034],[R*.79,.038],[0,.038]],40),rear?'Sealed tail lamp lenses':'Sealed lamp lenses');
            if(r.details)for(const s of [-1,1])tube('frame',[[p[0]+s*R*.55,p[1]-R,p[2]+.05],[p[0]+s*R*.55,p[1]+R,p[2]+.05]],.009,'Lamp guards');
        }
        function engine(center,size=1){
            const P=p=>add(center,scale(p,size));
            box('frame',P([0,0,0]),scale([.55,.32,.74],size),.045,'Exposed engine block');
            for(const s of [-1,1]){
                const head=box('metal',P([s*.26,.22,0]),scale([.22,.23,.69],size),.04,'Cylinder head castings');
                const turn=CM.yaw(s*.10);CM.transform(head,p=>add(center,turn.point(sub(p,center))),turn.normal);
                for(let j=0;j<4;j++){
                    tube('metal',[P([s*.24,.16,(j-1.5)*.16]),P([s*.42,.10,(j-1.5)*.16]),P([s*.48,-.13,(j-1.5)*.16])],.027*size,'Exhaust header pipes');
                    tube('trim',[P([s*.23,.36,(j-1.5)*.16]),P([s*.04,.43,(j-1.5)*.13]),P([0,.44,-.30])],.008*size,'Ignition leads');
                }
                tube('frame',[P([s*.48,-.13,-.32]),P([s*.48,-.13,.32])],.045*size,'Exhaust collectors');
            }
            box('secondary',P([0,.38,0]),scale([.29,.12,.50],size),.035,'Intake manifold');
            ring('metal',P([0,.49,0]),.17*size,.035*size,'y','Air cleaner rim');
            box('accent',P([0,.48,0]),scale([.22,.08,.22],size),.03,'Air filter housing');
            for(const s of [-1,1])tube('trim',[P([s*.18,-.05,.37]),P([s*.32,.12,.49]),P([s*.18,.25,.57])],.025*size,'Cooling hoses');
            for(let j=0;j<11;j++)box('metal',P([0,-.10+j*.035,.57]),scale([.51,.014,.045],size),.003,'Radiator fins');
            return center;
        }
        function can(p,s=1){
            box('accent',p,scale([.23,.38,.15],s),.035*s,'Jerry cans');
            tube('frame',[add(p,[-.07*s,.19*s,0]),add(p,[-.07*s,.25*s,0]),add(p,[.07*s,.25*s,0]),add(p,[.07*s,.19*s,0])],.012*s,'Jerry can handles');
            for(const sign of [-1,1])tube('metal',[add(p,[-.075*s,-.12*s,sign*.078*s]),add(p,[.075*s,.12*s,sign*.078*s])],.007*s,'Pressed can stiffeners');
        }
        function bed(deck,z0,z1){
            for(let j=0;j<10;j++)box(j%3?'secondary':'paint',[(j-4.5)*W*.075,deck,(z0+z1)/2],[W*.071,.055,z1-z0],.008,'Mismatched load-bed boards');
            for(const s of [-1,1]){
                box('frame',[s*W*.39,deck+.24,(z0+z1)/2],[.065,.48,z1-z0],.014,'Load-bed sides');
                for(const z of [z0,z1])tube('metal',[[s*W*.36,deck,z],[s*W*.36,deck+.55,z]],.024,'Bed corner stakes');
            }
            if(r.cargo>0)for(let j=0;j<Math.ceil(r.cargo*5);j++){
                const x=(j%2?1:-1)*W*.19,z=z0+.28+Math.floor(j/2)*Math.min(.50,(z1-z0-.5)/3),y=deck+.20;
                if(j%3===0)can([x,y+.02,z]);else{box('cargo',[x,y,z],[.42,.34,.42],.025,'Scavenged cargo cases');for(const dx of [-.13,.13])tube('trim',[[x+dx,deck+.03,z-.22],[x+dx,deck+.38,z-.22],[x+dx,deck+.38,z+.22],[x+dx,deck+.03,z+.22]],.013,'Cargo tie-down straps');}
            }
        }
        return {ring,fastener,plate,patch,wheel,suspension,chassis,seat,controls,lamp,engine,can,bed};
    }

    function build(c){
        const {r,W,H,L,put,box,tube,sheet,bodywork:B}=c;if(!IDS.has(r.form))return false;
        const k=kit(c),bike=r.form==='scrapBike',crawler=r.form==='scrapCrawler',buggy=r.form==='scrapBuggy',interceptor=r.form==='scrapInterceptor',bus=r.form==='warBus',tanker=r.form==='scrapTanker',heavy=['scrapHauler','scrapTanker','warBus'].includes(r.form);
        c.craft={family:'wasteland',form:r.form};
        if(bike){
            const R=.36*r.wheelSize,seat=H*.55,front=L*.34,rear=-L*.34;
            // The wheel helper chooses its motorcycle carcass by form.
            const original=r.form;r.form='motorcycle';for(const [z,name]of [[rear,'Rear wheel'],[front,'Front wheel']])k.wheel(0,z,R,.16,name);r.form=original;
            for(const s of [-1,1]){
                tube('frame',[[s*.14,R,rear],[s*.18,seat-.13,-.10],[s*.12,seat+.16,L*.19],[s*.15,R,front]],.032,'Welded motorcycle cradle');
                tube('metal',[[s*.10,R,front],[s*.10,H*.81,L*.19]],.027,'Long-travel fork tubes');
                tube('frame',[[s*.15,R,rear],[s*.16,seat-.05,-L*.12]],.034,'Rear swingarms');
                box('secondary',[s*.29,seat-.15,-L*.25],[.22,.30,.42],.04,'Pannier salvage cases');
                tube('metal',[[s*.14,seat-.20,-L*.02],[s*.35,seat-.20,-L*.02]],.019,'Rider footpegs');
            }
            k.engine([0,R+.20,0],.56);box('seat',[0,seat,-L*.12],[.31,.12,.53],.05,'Reupholstered saddle');
            put('paint',B.shell([[-.05,.17,seat+.02,.16],[.12,.21,seat+.07,.20],[.33,.14,seat+.04,.13]],2.8,40),'Donor fuel tank');
            const bars=[[W*.38,H*.83,L*.15],[W*.28,H*.85,L*.21],[-W*.28,H*.85,L*.21],[-W*.38,H*.83,L*.15]];tube('metal',bars,.023,'Steering');
            k.lamp([0,H*.73,L*.30],.11);k.can([W*.50,seat-.15,-L*.26],.65);tube('frame',[[W*.35,seat-.28,-L*.26],[W*.60,seat-.28,-L*.26],[W*.60,seat-.10,-L*.26]],.014,'Jerry can carrier');
            c.mounts.seats=[{posture:'astride',seat:{at:[0,seat+.02,-L*.12]},handL:{at:bars[0]},handR:{at:bars.at(-1)},footL:{at:[W*.35,seat-.2,-L*.02]},footR:{at:[-W*.35,seat-.2,-L*.02]}}];
            c.mounts.controls=[{input:'steer',shape:'bars',part:'Steering',at:[0,H*.81,L*.19],axis:[0,1,0],degrees:25,degreesAtSpeed:8}];return true;
        }
        const R=(heavy?.48:interceptor?.37:buggy?.40:.46)*r.wheelSize;
        const axles=heavy?[-L*.34,-L*.17,L*.34]:[-L*.32,L*.32],deck=k.chassis(R,axles);
        if(crawler){
            const z0=-L*.32,z1=L*.32,rr=.33;
            for(const side of [-1,1]){
                for(let j=0;j<5;j++)k.wheel(side*W*.38,z0+(z1-z0)*j/4,.26,.26,(j===4?'Front':'Rear')+' bogie '+side+' '+j,.12);
                const points=[];for(let j=0;j<=20;j++){const a=j/20*Math.PI;points.push([rr*Math.cos(a)+.39,Math.sin(a)*rr+z1]);}for(let j=0;j<=20;j++){const a=Math.PI+j/20*Math.PI;points.push([rr*Math.cos(a)+.39,Math.sin(a)*rr+z0]);}
                // Arc-length placement keeps pad pitch constant on straights and sprockets.
                const loop=points.map(([y,z])=>[side*W*.38,y,z]),lengths=[0];for(let j=1;j<=loop.length;j++)lengths.push(lengths.at(-1)+Math.hypot(...sub(loop[j%loop.length],loop[j-1])));
                const total=lengths.at(-1),n=Math.ceil(total/.14);
                for(let j=0;j<n;j++){const at=j/n*total;let i=0;while(lengths[i+1]<at)i++;const a=loop[i],b=loop[(i+1)%loop.length],t=(at-lengths[i])/(lengths[i+1]-lengths[i]),p=add(a,scale(sub(b,a),t)),normal=norm([0,b[2]-a[2],a[1]-b[1]]),F=CM.frame(p,[1,0,0],scale(norm(sub(b,a)),-1));
                    put('frame',CM.slab(CM.rect(0,0,.46,total/n*.93),F,.045,.010,true),'Linked track shoes');tube('metal',[add(p,[-.25,0,0]),add(p,[.25,0,0])],.013,'Track hinge pins');if(j%2===0)tube('metal',[add(add(p,[-.20,0,0]),scale(normal,.03)),add(add(p,[.20,0,0]),scale(normal,.03))],.014,'Track grousers');}
            }
        }else for(const z of axles)for(const side of [-1,1])k.wheel(side*W*.43,z,R,W*(heavy?.125:.13),(z>0?'Front':'Rear')+' '+(side>0?'left':'right')+' '+axles.indexOf(z)+' wheel');
        if(!crawler)for(const z of axles)for(const side of [-1,1]){
            const x=side*W*.43,rad=R*1.16,width=W*(heavy?.15:.15),g=new CM.Geo();
            for(let i=0;i<36;i++){
                const a=.06+i/36*(Math.PI-.12),b=.06+(i+1)/36*(Math.PI-.12);
                const at=(angle,dx)=>[x+dx,R+Math.sin(angle)*rad,z+Math.cos(angle)*rad];
                g.poly([at(a,-width/2),at(a,width/2),at(b,width/2),at(b,-width/2)],null,[0,Math.sin((a+b)/2),Math.cos((a+b)/2)]);
            }
            put('secondary',g.done(),'Formed salvaged fenders');
            for(const dx of [-width/2,width/2])tube('metal',Array.from({length:37},(_,i)=>{const a=.06+i/36*(Math.PI-.12);return[x+dx,R+Math.sin(a)*rad,z+Math.cos(a)*rad];}),.012,'Fender rolled edges');
            for(const dz of [-R*.55,R*.55])tube('frame',[[side*W*.27,deck,z+dz],[x,R+rad*.75,z+dz]],.018,'Fender mounting stays');
        }
        const cabFront=buggy?L*.22:interceptor?L*.15:L*.31,cabRear=buggy?-L*.26:interceptor?-L*.23:bus?-L*.41:L*.06;
        const floor=deck+.04,hip=floor+(interceptor?.26:.34),roof=Math.max(H*(bus?.82:.93),hip+(interceptor?.99:1.03)),belt=hip+(bus?.50:.29),half=W*.37,seatZ=cabFront-.78;
        box('frame',[0,floor-.035,(cabFront+cabRear)/2],[half*2,.07,cabFront-cabRear+.08],.025,'Occupied cabin floor');
        if(r.interior){for(const side of [1,-1])k.seat([side*W*.19,hip,seatZ],side>0);}
        if(bus&&r.interior)for(let j=0;j<5;j++)for(const side of [-1,1])k.seat([side*W*.23,hip,seatZ-.93*(j+1)]);
        c.craft.cabin={floor,roof,hip,halfWidth:half,front:cabFront,rear:cabRear};
        // A load-bearing cage is connected at the floor, sill and roof corners.
        for(const side of [-1,1]){
            tube('frame',[[side*half,floor,cabFront],[side*half,belt,cabFront],[side*half*.90,roof,cabFront-.28],[side*half*.92,roof,cabRear+.12],[side*half,floor,cabRear]],.043,'Welded occupant roll cage');
            tube('frame',[[side*half,floor,cabRear],[side*half,floor,cabFront]],.045,'Cabin rock sliders');
            if(!buggy){
                const zs=bus?Array.from({length:7},(_,i)=>cabRear+(cabFront-cabRear)*i/6):[cabRear,(cabFront+cabRear)*.5,cabFront];
                for(let j=0;j+1<zs.length;j++){
                    const a=zs[j]+.015,b=zs[j+1]-.015,p=[[side*half,floor,a],[side*half,floor,b],[side*half,belt,b],[side*half,belt,a]];
                    if(side>0)p.reverse();k.plate(j%2?'secondary':'paint',p,'Donor door panels');k.patch(p);
                    const roofAt=z=>roof+(belt-roof)*Math.max(0,Math.min(1,(z-(cabFront-.28))/.28)),sideAt=z=>half*(.91+.06*Math.max(0,Math.min(1,(z-(cabFront-.28))/.28))),za=Math.max(a+.04,cabRear+.12),zb=b-.04;
                    const glass=[[side*half*.97,belt+.05,a+.04],[side*half*.97,belt+.05,b-.04],[side*sideAt(zb),roofAt(zb)-.025,zb],[side*sideAt(za),roofAt(za)-.025,za]];
                    if(!r.cutaway)sheet('flightGlass',glass,.012,'Salvaged side glazing');
                    const sill=[[side*half,belt,a],[side*half,belt,b],[side*half*.97,belt+.055,b],[side*half*.97,belt+.055,a]];
                    sheet('frame',side>0?sill.reverse():sill,.030,'Welded glazing sills');
                    sheet('frame',[glass[3],glass[2],[side*sideAt(zb),roofAt(zb)+.02,zb],[side*sideAt(za),roofAt(za)+.02,za]],.035,'Glazing header channels');
                    for(const z of [a,b]){const top=Math.max(cabRear+.12,Math.min(cabFront-.28,z));sheet('frame',[[side*half,belt-.02,z-.04],[side*half,belt-.02,z+.04],[side*half*.91,roof,top+.04],[side*half*.91,roof,top-.04]],.035,'Bolted glazing mullions');}
                    if(r.armor>0&&r.details)for(let k0=0;k0<Math.ceil(r.armor*4);k0++){const z=a+.08+(b-a-.16)*(k0+.5)/Math.ceil(r.armor*4);tube('metal',[[side*(half+.025),belt+.02,z],[side*(sideAt(z)+.025),roofAt(z)-.01,z]],.012,'Window protective bars');}
                }
                tube('metal',[[side*(half+.02),belt-.10,cabFront-.15],[side*(half+.02),belt-.10,cabFront-.40]],.014,'Door pull handles');
            }
            // Open cage bays on the buggy are intentional access, not missing body faces.
            tube('metal',[[side*half,floor-.08,cabFront-.35],[side*(half+.18),floor-.08,cabFront-.35],[side*(half+.18),floor-.08,cabFront-.65],[side*half,floor-.08,cabFront-.65]],.025,'Boarding steps');
            tube('metal',[[side*half,belt+.15,cabFront-.08],[side*(half+.20),belt+.18,cabFront]],.022,'Mirror stalks');
            box('chrome',[side*(half+.20),belt+.18,cabFront],[.13,.13,.035],.02,'Reclaimed mirrors');
        }
        for(const z of [cabRear+.12,cabFront-.28])tube('frame',[[-half*.91,roof,z],[half*.91,roof,z]],.043,'Roof crossmembers');
        tube('frame',[[-half,floor,cabRear],[half,roof,cabRear]],.035,'Cage diagonal brace');
        if(!buggy&&!r.cutaway){
            box('secondary',[0,roof+.025,(cabFront+cabRear)/2],[half*1.84,.06,cabFront-cabRear-.23],.04,'Reclaimed cabin roof');
            sheet('flightGlass',[[-half,belt,cabFront],[half,belt,cabFront],[half*.90,roof,cabFront-.28],[-half*.90,roof,cabFront-.28]],.015,'Cabin windscreen');
            tube('metal',[[-half,belt,cabFront],[half,belt,cabFront]],.025,'Windscreen sill');
            k.plate('secondary',[[half,floor,cabRear],[-half,floor,cabRear],[-half,belt,cabRear],[half,belt,cabRear]],'Cabin rear bulkhead');
            sheet('flightGlass',[[half,belt,cabRear],[-half,belt,cabRear],[-half*.92,roof,cabRear+.12],[half*.92,roof,cabRear+.12]],.012,'Cabin rear glazing');
        }
        box('trim',[0,belt-.08,cabFront-.07],[half*1.8,.17,.28],.035,'Rewired dashboard');
        for(const x of [-.16,0,.16])k.ring('metal',[W*.19+x,belt-.05,cabFront-.217],.052,.009,'z','Analog instrument bezels');
        const nose=interceptor?L*.35:buggy?-L*.35:L*.41;
        k.engine([0,deck+.24,nose],interceptor?1.05:buggy?.78:heavy?1.2:.95);
        if(!buggy&&!interceptor)box('paint',[0,belt-.04,L*.39],[W*.69,.13,L*.17],.065,'Donor bonnet');
        if(interceptor){
            const shell=B.shell([[-L*.47,W*.32,deck+.21,.19],[-L*.28,W*.40,deck+.24,.25],[L*.12,W*.35,deck+.24,.19],[L*.43,W*.36,deck+.23,.18]],3.8,48);const opening=[[-half-.02,cabRear-.04],[half+.02,cabRear-.04],[half+.02,cabFront+.04],[-half-.02,cabFront+.04]];B.openSkin(shell,opening,floor+.01);put('paint',shell,'Chopped interceptor lower shell');
            // The cut-open body seen from the cabin: a dark lining just inside the skin, not a see-through back.
            const lining=B.shell([[-L*.47,W*.32,deck+.21,.19],[-L*.28,W*.40,deck+.24,.25],[L*.12,W*.35,deck+.24,.19],[L*.43,W*.36,deck+.23,.18]],3.8,48);B.openSkin(lining,opening,floor+.01);CM.transform(lining,p=>[p[0]*.99,p[1]-.004,p[2]*.995]);put('liner',lining,'Chopped interceptor lining');
            for(const side of [-1,1])tube('metal',[[side*W*.32,deck+.02,L*.19],[side*W*.43,deck+.04,-L*.38]],.045,'Side-exit exhaust pipes');
        }
        if(!bus&&!buggy&&!interceptor&&!tanker)k.bed(deck+.07,-L*.43,cabRear-.10);
        if(tanker){
            const a=-L*.42,b=cabRear-.18,radius=W*.32,cy=deck+radius+.13,F=CM.frame([0,cy,(a+b)/2],[1,0,0],[0,1,0]),len=b-a;
            put('secondary',CM.revolveOn(F,0,0,[[0,-len/2-.08],[radius*.7,-len/2-.07],[radius,-len/2+.10],[radius,len/2-.10],[radius*.7,len/2+.07],[0,len/2+.08]],64),'Reclaimed water pressure tank');
            for(let j=0;j<4;j++){const z=a+.20+(b-a-.40)*j/3;k.ring('metal',[0,cy,z],radius+.025,.045,'z','Tank retaining hoops');for(let band=0;band<16;band++){const a=(band/16-.5)*radius*1.44,b=((band+1)/16-.5)*radius*1.44,top=x=>cy-Math.sqrt(radius*radius-x*x)-.003;sheet('frame',[[a,deck+.02,z],[b,deck+.02,z],[b,top(b),z],[a,top(a),z]],.18,'Profiled tank cradle saddles');}}
            k.ring('metal',[0,cy+radius-.010,(a+b)/2],.17,.025,'y','Tank inspection neck');
            put('metal',CM.revolveOn(CM.frame([0,cy+radius+.002,(a+b)/2],[1,0,0],[0,0,-1]),0,0,[[0,0],[.18,0],[.18,.020],[0,.020]],40),'Tank inspection hatch cover');
            tube('metal',[[-.065,cy+radius+.02,(a+b)/2],[-.065,cy+radius+.08,(a+b)/2],[.065,cy+radius+.08,(a+b)/2],[.065,cy+radius+.02,(a+b)/2]],.012,'Tank hatch handle');
            for(const side of [-1,1])tube('metal',[[side*.22,deck,a-.10],[side*.22,cy+radius+.10,a-.10]],.025,'Tank ladder rails');
            for(let j=0;j<8;j++)tube('metal',[[-.22,deck+.12+j*(cy+radius-deck-.14)/7,a-.10],[.22,deck+.12+j*(cy+radius-deck-.14)/7,a-.10]],.019,'Tank ladder rungs');
            tube('metal',[[0,cy,a-.12],[0,deck+.15,a-.12],[W*.40,deck+.15,a-.12]],.045,'Tank discharge plumbing');k.ring('accent',[W*.42,deck+.15,a-.12],.10,.017,'x','Discharge valve wheel');
        }
        if(r.roofRack&&!r.cutaway&&!buggy){
            for(const x of [-half*.72,half*.72])tube('frame',[[x,roof,cabRear+.20],[x,roof+.14,cabRear+.20],[x,roof+.14,cabFront-.38],[x,roof,cabFront-.38]],.025,'Expedition rack rails');
            for(let j=0;j<6;j++){const z=cabRear+.25+(cabFront-cabRear-.65)*j/5;tube('metal',[[-half*.72,roof+.14,z],[half*.72,roof+.14,z]],.019,'Rack crossbars');}
            if(r.cargo>.2){k.can([half*.45,roof+.35,cabRear+.50]);box('cargo',[-half*.30,roof+.27,cabRear+.55],[.48,.24,.55],.035,'Roof equipment case');}
        }
        // Winch, fairlead and recovery shackles are mounted to the frame.
        if(r.bumper){
            const z=L*.49,y=deck+.03;
            tube('frame',[[-W*.41,y,z],[W*.41,y,z]],.065,'Recovery bumper');
            const F=CM.frame([0,y+.10,z-.08],[0,1,0],[0,0,1]);put('metal',CM.revolveOn(F,0,0,[[0,-.23],[.10,-.23],[.10,.23],[0,.23]],40),'Recovery winch drum');
            for(let j=0;j<18;j++)k.ring('trim',[-.19+j*.022,y+.10,z-.08],.105,.011,'x','Winch cable winding');
            tube('metal',[[-.15,y+.05,z+.08],[-.15,y+.15,z+.08],[.15,y+.15,z+.08],[.15,y+.05,z+.08]],.020,'Winch roller fairlead');
            if(r.armor>.3)for(const side of [-1,1])k.plate('armor',[[side*W*.10,deck-.06,z+.08],[side*W*.40,deck-.06,z+.04],[side*W*.34,deck+.30,z-.12],[side*W*.10,deck+.30,z-.12]],'Replaceable bumper armor',.035);
        }
        for(const side of [-1,1]){k.lamp([side*W*.28,belt-.18,L*.49],heavy?.12:.10);k.lamp([side*W*.30,deck+.10,-L*.46],.075,true);}
        if(r.details)for(const side of [-1,1]){
            tube('metal',[[side*W*.28,deck+.08,cabRear],[side*W*.40,deck+.08,cabRear],[side*W*.40,roof-.12,cabRear]],.040,'Raised exhaust stacks');
            k.ring('metal',[side*W*.40,roof-.10,cabRear],.048,.010,'y','Exhaust pipe lips');
        }
        c.craft.seats=c.mounts.seats?.length||0;return true;
    }
    const api={FORMS,IDS,DEFAULTS,kit,build};root.RRWastelandVehicle=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
