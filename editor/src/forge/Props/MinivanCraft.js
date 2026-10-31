/** Seven-seat modern minivan. Real openings, occupied footwells and authored
 * sliding doors/liftgate share the same geometry in preview and export. */
(function(root){
    'use strict';
    const need=(n,f)=>root[n]||(typeof require==='function'?require(f):null);
    const CM=need('RRContainerMesh','./ContainerMesh.js'),Salvage=need('RRWastelandVehicle','./WastelandVehicle.js');
    const {add,sub,norm,scale}=CM.vec;
    const FORMS=[['minivan','Seven-seat minivan',2.04,1.98,5.25]];
    const DEFAULTS={paint:'#344e67',secondary:'#344e67',seatColor:'#777b80',finish:'enamel',wear:.025,grime:.025,corrosion:0,roughness:.26,windowOpacity:.34,bodyStyle:'rounded',livery:'plain',markings:'',roofRack:false,cargo:0,armor:0,tread:.32,treadPattern:'road'};

    function build(c){
        const {r,W,H,L,put,box,tube,sheet,bodywork:B}=c;if(r.form!=='minivan')return false;
        const k=Salvage.kit(c),R=Math.min(.355*r.wheelSize,H*.215),track=W*.39,axles=[-L*.315,L*.315],floor=H*.205,hip=floor+.36,roof=H*.952,belt=H*.565;
        const front=L*.315,rear=-L*.428,half=W*.47,roofHalf=W*.388,roofFront=L*.205,roofRear=rear;
        const bonnetSections=[[front-.015,half*.99,belt-.12,.14],[L*.41,W*.42,belt-.18,.16],[L*.475,W*.37,belt-.23,.12]],bonnetAt=z=>{let i=0;while(i<bonnetSections.length-2&&z>bonnetSections[i+1][0])i++;const a=bonnetSections[i],b=bonnetSections[i+1],t=Math.max(0,Math.min(1,(z-a[0])/(b[0]-a[0])));return a.map((v,k)=>v+(b[k]-v)*t);};
        const columns=[rear,-L*.20,L*.035,L*.20,front],rowZ=[L*.155,-L*.040,-L*.238];
        c.craft={family:'modern',form:'minivan',seats:7,cabin:{floor,hip,roof,halfWidth:half,front,rear:-L*.46},rowPitch:rowZ.slice(1).map((z,i)=>rowZ[i]-z),doorAperture:{width:L*.235,height:roof-floor-.12},slidingDoorOpen:r.sideDoorOpen,liftgateOpen:r.tailgateOpen};
        for(const z of axles){
            for(const s of [-1,1])k.wheel(s*track,z,R,.23,(z>0?'Front':'Rear')+' '+(s>0?'left':'right')+' wheel');
            tube('frame',[[-track,R,z],[track,R,z]],.035,'Minivan suspension crossmembers');
            for(const s of [-1,1]){tube('metal',[[s*track,R,z],[s*W*.29,floor+.11,z]],.028,'Suspension struts');tube('frame',[[s*W*.21,floor-.04,z-.18],[s*track,R,z]],.027,'Lower suspension arms');}
        }
        // The floor steps around the wheel bays instead of cutting through
        // the tires. Enclosed steel tubs keep road wheels out of the cabin.
        const wheelBay=R*1.17,innerX=track-.115-.035,outerX=half-.045,zmin=-L*.46,zmax=front;
        box('frame',[0,floor-.075,(zmin+zmax)/2],[innerX*2,.12,zmax-zmin],.020,'Minivan floor pan');
        box('trim',[0,floor-.006,(zmin+zmax)/2],[innerX*2,.04,zmax-zmin],.015,'Flat passenger footwell');
        const floorCuts=[zmin,zmax,...axles.flatMap(z=>[z-wheelBay,z+wheelBay])].filter(z=>z>=zmin&&z<=zmax).sort((a,b)=>a-b);
        for(let j=0;j+1<floorCuts.length;j++){
            const a=floorCuts[j],b=floorCuts[j+1],mid=(a+b)/2;if(axles.some(z=>Math.abs(mid-z)<wheelBay))continue;
            for(const side of [-1,1]){box('frame',[side*(innerX+outerX)/2,floor-.075,mid],[outerX-innerX,.12,b-a],.015,'Minivan outer floor supports');box('trim',[side*(innerX+outerX)/2,floor-.006,mid],[outerX-innerX,.04,b-a],.010,'Passenger floor wings');}
        }
        for(const z of axles)for(const side of [-1,1]){
            const angle=Math.asin(Math.max(-.95,Math.min(.95,(floor-R)/wheelBay))),point=(a,x,rad=wheelBay)=>[side*x,R+Math.sin(a)*rad,z+Math.cos(a)*rad],shell=new CM.Geo(),liner=new CM.Geo();
            const arc=Array.from({length:33},(_,j)=>angle+j/32*(Math.PI-2*angle));
            for(let j=0;j<32;j++){
                const a=arc[j],b=arc[j+1],n=[0,Math.sin((a+b)/2),Math.cos((a+b)/2)];
                shell.poly([point(a,innerX),point(a,outerX),point(b,outerX),point(b,innerX)],null,n);
                liner.poly([point(a,innerX,wheelBay-.012),point(b,innerX,wheelBay-.012),point(b,outerX,wheelBay-.012),point(a,outerX,wheelBay-.012)],null,n.map(v=>-v));
            }
            shell.poly(arc.map(a=>point(a,innerX)),null,[-side,0,0]);
            put('cabin',shell.done(),'Enclosed passenger wheel housings');put('liner',liner.done(),'Road-facing wheel arch liners');
        }
        for(const side of [-1,1]){
            // Curved side skin is clipped above each tire; no wheel sits
            // inside an opaque rectangular body or painted-on arch.
            const g=new CM.Geo(),steps=80,z0=-L*.46,z1=L*.46,stations=[...new Set([...Array.from({length:81},(_,j)=>z0+(z1-z0)*j/80),columns[1],columns[2],front,front+.10])].sort((a,b)=>a-b);
            const edge=z=>{const end=Math.abs(z)/(L*.5),hood=bonnetAt(z),blend=Math.max(0,Math.min(1,(z-front)/.10)),w=z>front?half+(hood[1]-half)*blend:half*(1-(z<0?.025:0)*Math.max(0,(end-.70)/.25)**2),high=belt+(hood[2]-belt)*blend;let low=floor-.10;
                for(const axle of axles){const d=z-axle,rad=R*1.13;if(Math.abs(d)<rad)low=Math.max(low,R+Math.sqrt(rad*rad-d*d));}return{w,low,high};};
            for(let j=0;j+1<stations.length;j++){
                const a=stations[j],b=stations[j+1],A=edge(a),C=edge(b),points=[[side*A.w,A.low,a],[side*C.w,C.low,b],[side*C.w,belt,b],[side*A.w,belt,a]];
                // Leave the sliding-door bay to its separately moving panel.
                const mid=(a+b)/2;if(mid>columns[1]&&mid<columns[2])continue;
                for(let band=0;band<8;band++){
                    const at=(E,z,t)=>[side*E.w*(.965+.035*t+.014*Math.sin(t*Math.PI)),E.low+(E.high-E.low)*t,z];
                    const q=[at(A,a,band/8),at(C,b,band/8),at(C,b,(band+1)/8),at(A,a,(band+1)/8)];
                    g.poly(side>0?q.reverse():q,null,[side,0,0]);
                }
            }
            const skin=g.done();put('paint',skin,'Minivan formed side skin');
            // A continuous inward skin and bottom return give the shell thickness.
            const inner=CM.copy(skin);for(let i=0;i<inner.positions.length;i+=3)inner.positions[i]-=side*.032;for(let i=0;i<inner.normals.length;i++)inner.normals[i]*=-1;for(let i=0;i<inner.index.length;i+=3){const t=inner.index[i+1];inner.index[i+1]=inner.index[i+2];inner.index[i+2]=t;}put('cabin',inner,'Minivan inner side panels');
            const boundary=new Map(),key=p=>p.map(v=>Math.round(v*1e6)).join(',');
            for(let j=0;j<skin.index.length;j+=3)for(let e=0;e<3;e++){
                const p=Array.from(skin.positions.subarray(skin.index[j+e]*3,skin.index[j+e]*3+3)),q=Array.from(skin.positions.subarray(skin.index[j+(e+1)%3]*3,skin.index[j+(e+1)%3]*3+3)),k=[key(p),key(q)].sort().join('|');
                if(boundary.has(k))boundary.get(k).count++;else boundary.set(k,{p,q,count:1});
            }
            const returns=new CM.Geo(),inward=[-side*.032,0,0];
            for(const {p,q,count}of boundary.values())if(count===1)returns.poly([p,add(p,inward),add(q,inward),q],null,norm(CM.vec.cross(inward,sub(q,p))));
            put('paint',returns.done(),'Minivan body edge returns');
            // The narrow fender shoulder bridges the side wall into the bonnet,
            // retaining the driver's window sill while the nose drops forward.
            const shoulder=new CM.Geo();for(let j=0;j<8;j++){
                const za=front+j*.10/8,zb=front+(j+1)*.10/8,A=edge(za),B0=edge(zb),ha=bonnetAt(za),hb=bonnetAt(zb);
                const q=[[side*A.w,A.high,za],[side*B0.w,B0.high,zb],[side*hb[1],hb[2],zb],[side*ha[1],ha[2],za]];
                shoulder.poly(side>0?q.reverse():q,null,[side,0,0]);
            }put('paint',shoulder.done(),'Minivan formed front fender shoulders');
            tube('chrome',[[side*half*.970,floor-.055,axles[0]+R*1.2],[side*half*.970,floor-.055,axles[1]-R*1.2]],.014,'Rocker brightwork');
            for(const axle of axles){const points=Array.from({length:41},(_,j)=>{const a=j/40*Math.PI,z= axle+Math.cos(a)*R*1.13;return[side*(edge(z).w*.965+.004),R+Math.sin(a)*R*1.13,z];});tube('paint',points,.018,'Rolled wheel arch lips');}
            // Rear quarter and driver windows. The middle bay is a real
            // sliding door, including its glazing, trim, latch and inner panel.
            for(let j=0;j+1<columns.length;j++){
                const a=columns[j],b=columns[j+1],moving=j===1;
                const shift=p=>moving?[p[0]+side*.20*Math.min(1,r.sideDoorOpen/.15),p[1],p[2]-L*.20*Math.max(0,(r.sideDoorOpen-.15)/.85)]:p;
                const glassName=moving?'Minivan sliding door glazing':'Minivan side glazing';
                const quarter=j===columns.length-2,topAt=z=>roof+(belt+.03-roof)*Math.max(0,(z-roofFront)/(front-roofFront)),topX=z=>roofHalf+(half-roofHalf)*Math.max(0,(z-roofFront)/(front-roofFront));
                const za=a+.045,zb=b-.045,zt=quarter?b-.16:zb;
                const face=[[side*(half-.015),belt+.045,za],[side*(half-.015),belt+.045,zb],[side*topX(zt),topAt(zt)-.045,zt],[side*topX(za),topAt(za)-.045,za]];
                if(!(r.cutaway&&side<0))sheet('flightGlass',face.map(shift),.012,glassName);
                for(const z of [a+.01,b-.01])if(!(quarter&&z>b-.03))tube('trim',[[side*half,belt,z],[side*topX(z),topAt(z)+.025,z]].map(shift),.032,moving?'Minivan sliding door pillars':'Minivan window pillars');
                const band=(role,q,name)=>sheet(role,(side>0?q.reverse():q).map(shift),.020,name);
                band('trim',[[side*half,belt,a],[side*half,belt,b],[side*(half-.015),belt+.05,b],[side*(half-.015),belt+.05,a]],moving?'Minivan sliding door belt sill':'Minivan glazing belt sills');
                band('paint',[face[3],face[2],[side*topX(zt),topAt(zt)+(quarter?0:.025),zt],[side*topX(za),topAt(za)+(quarter?0:.025),za]],moving?'Minivan sliding door header':'Minivan window headers');
                if(quarter)band('trim',[face[1],face[2],[side*topX(zt),topAt(zt),zt],[side*topX(zb),topAt(zb),zb]],'Minivan quarter window forward seals');
                tube('trim',[...face,face[0]].map(shift),.010,moving?'Minivan sliding door belt seal':'Minivan belt seals');
                if(moving){
                    const panel=[[side*half,floor,a],[side*half,floor,b],[side*half,belt,b],[side*half,belt,a]].map(shift);
                    const surface=new CM.Geo(),at=(z,t)=>shift([side*half*(.965+.035*t+.014*Math.sin(t*Math.PI)),floor+(belt-floor)*t,z]);
                    for(let band=0;band<8;band++){
                        const q=[at(a,band/8),at(b,band/8),at(b,(band+1)/8),at(a,(band+1)/8)];if(side>0)q.reverse();surface.poly(q,null,[side,0,0]);
                    }
                    const skin=CM.smoothNormals(surface.done(),.90),inside=CM.copy(skin);
                    for(let i=0;i<inside.positions.length;i+=3)inside.positions[i]-=side*.032;
                    for(let i=0;i<inside.normals.length;i++)inside.normals[i]*=-1;
                    for(let i=0;i<inside.index.length;i+=3){const n=inside.index[i+1];inside.index[i+1]=inside.index[i+2];inside.index[i+2]=n;}
                    put('paint',skin,'Minivan sliding door lower panels');put('cabin',inside,'Minivan sliding door inner shells');
                    const returns=new CM.Geo(),close=(p,q,n)=>returns.poly([p,q,[q[0]-side*.032,q[1],q[2]],[p[0]-side*.032,p[1],p[2]]],null,n);
                    for(let band=0;band<8;band++){close(at(a,band/8),at(a,(band+1)/8),[0,0,-1]);close(at(b,(band+1)/8),at(b,band/8),[0,0,1]);}
                    close(at(a,0),at(b,0),[0,-1,0]);close(at(b,1),at(a,1),[0,1,0]);put('paint',returns.done(),'Minivan sliding door edge returns');
                    box('cabin',shift([side*(half-.065),(floor+belt)/2,(a+b)/2]),[.11,.065,(b-a)*.70],.018,'Minivan sliding door armrests');
                    tube('chrome',[[side*(half+.026),belt-.09,b-.19],[side*(half+.026),belt-.09,b-.39]].map(shift),.012,'Minivan sliding door handles');
                    const seam=[...Array.from({length:9},(_,i)=>at(a+.01,i/8)),...Array.from({length:9},(_,i)=>at(b-.01,1-i/8))].map(p=>[p[0]+side*.003,p[1],p[2]]);tube('trim',seam,.003,'Minivan sliding door shut lines');
                }
            }
            tube('paint',[[side*half,belt+.03,front],[side*roofHalf,roof+.025,roofFront]],.036,'Minivan swept A pillars');
            sheet('paint',[[side*edge(-L*.46).w,belt,-L*.46],[side*half,belt,rear],[side*roofHalf,roof,roofRear]],.030,'Minivan rear pillar panels');
            // Track and roller brackets stay on the body while the door slides.
            tube('metal',[[side*(half+.024),belt-.22,-L*.35],[side*(half+.024),belt-.22,L*.03]],.012,'Sliding door guide tracks');
            const z=columns[2]+L*.075;
            tube('chrome',[[side*(half+.025),belt-.09,z-.07],[side*(half+.025),belt-.09,z+.09]],.012,'Front door handles');
            tube('trim',[[side*(half+.006),floor+.04,columns[2]],[side*(half+.006),belt,columns[2]]],.004,'Front door rear shut lines');
            tube('trim',[[side*half,belt+.11,front-.05],[side*(half+.15),belt+.12,front-.11]],.018,'Minivan mirror supports');
            box('paint',[side*(half+.15),belt+.15,front-.12],[.22,.13,.12],.045,'Minivan mirror housings');
            box('chrome',[side*(half+.15),belt+.15,front-.185],[.19,.095,.008],.015,'Minivan mirror lenses');
        }
        // A shallow domed roof spans the cabin without filling it.
        if(!r.cutaway)put('paint',B.shell(Array.from({length:25},(_,i)=>{const t=i/24;return[roofRear+(roofFront-roofRear)*t,roofHalf*(1+.01*Math.sin(t*Math.PI)),roof+.025,.032];}),3.5,48),'Minivan crowned roof');
        const wind=[[-half,belt+.03,front],[half,belt+.03,front],[roofHalf,roof,roofFront],[-roofHalf,roof,roofFront]];
        sheet('flightGlass',wind,.012,'Minivan panoramic windscreen');
        tube('trim',[...wind,wind[0]],.018,'Minivan windscreen gasket');
        for(const s of [-1,1])tube('trim',[[s*W*.18,belt+.055,front+.020],[s*W*.06,belt+.18,front-.095]],.008,'Minivan windscreen wipers');
        put('paint',B.shell(bonnetSections,4,48),'Minivan sculpted bonnet');
        for(let j=0;j<32;j++){const a=(j/32-.5)*half*2,b=((j+1)/32-.5)*half*2,hood=bonnetAt(front),at=x=>[x,hood[2]+hood[3]*Math.max(0,1-(Math.abs(x)/hood[1])**4)**.25,front+.012];sheet('paint',[at(a),at(b),[b,belt+.03,front],[a,belt+.03,front]],.014,'Minivan windscreen cowl');}
        put('secondary',B.shell([[L*.425,W*.415,floor+.21,.21],[L*.478,W*.385,floor+.21,.20],[L*.491,W*.33,floor+.22,.15]],3.2,64),'Minivan wrapped front fascia');
        box('trim',[0,floor+.25,L*.491],[W*.55,.19,.018],.025,'Minivan grille recess');
        for(let j=0;j<5;j++)box(j%2?'chrome':'metal',[0,floor+.19+j*.035,L*.503],[W*.50,.012,.012],.004,'Minivan grille slats');
        for(const s of [-1,1]){
            const F=CM.frame([s*W*.32,belt-.18,L*.476],[1,0,0],[0,1,0]);
            const profile=[-.22,-.025,-.19,.055,.19,.055,.22,.015,.14,-.055,-.16,-.055];
            put('trim',CM.slab(profile,F,.038,.012,true),'Minivan swept headlamp housings');
            put('glass',CM.slab(profile.map(v=>v*.87),{...F,o:add(F.o,[0,0,.039])},.008,.003,true),'Minivan headlamp lenses');
            tube(r.lights?'light':'chrome',[[-.18,.032],[.16,.032],[.19,0]].map(([x,y])=>add(F.o,[x,y,.052])),.008,'Swept LED signatures');
            for(const x of [-.10,.04])k.ring('chrome',add(F.o,[x,0,.049]),.029,.006,'z','Headlamp projector rings');
            box('trim',[s*W*.29,floor+.18,L*.487],[.19,.11,.02],.025,'Fog light recesses');
            k.lamp([s*W*.29,floor+.18,L*.494],.035);
        }
        // Liftgate rotates as one assembly about the roof hinge; the cabin
        // remains open when raised, rather than hiding a second rear wall.
        const before=new Map([...c.groups].map(([key,v])=>[key,v.length])),back=-L*.46,pivot=[0,roof,roofRear];
        box('paint',[0,(floor+belt)/2,back],[half*1.96,belt-floor,.045],.025,'Minivan liftgate lower shell');
        box('cabin',[0,(floor+belt)/2,back+.035],[half*1.87,belt-floor-.08,.020],.020,'Minivan liftgate inner panel');
        const rearGlass=[[-half*.95,belt+.04,back],[half*.95,belt+.04,back],[roofHalf,roof-.035,roofRear],[-roofHalf,roof-.035,roofRear]];sheet('flightGlass',rearGlass,.012,'Minivan liftgate glass');tube('trim',[...rearGlass,rearGlass[0]],.012,'Minivan liftgate window seal');
        box('paint',[0,belt+.025,back],[half*1.96,.06,.045],.015,'Minivan liftgate window sill');
        tube('paint',[[-half, floor,back],[-half,belt,back],[-roofHalf,roof,roofRear],[roofHalf,roof,roofRear],[half,belt,back],[half,floor,back]],.035,'Minivan liftgate frame');
        box('chrome',[0,belt-.10,back-.030],[.23,.023,.024],.009,'Minivan liftgate pull');
        box('trim',[0,belt-.27,back-.028],[.34,.12,.010],.008,'Rear registration recess');
        const angle=r.tailgateOpen*Math.PI*.52,ca=Math.cos(angle),sa=Math.sin(angle);
        for(const [key,list]of c.groups)for(const m of list.slice(before.get(key)||0))CM.transform(m,p=>{const d=sub(p,pivot);return[p[0],pivot[1]+d[1]*ca-d[2]*sa,pivot[2]+d[1]*sa+d[2]*ca];},n=>[n[0],n[1]*ca-n[2]*sa,n[1]*sa+n[2]*ca]);
        for(const side of [-1,1]){
            const fixed=[side*half*.88,roof-.35,roofRear+.025],d=[0,-.48,back+.025-roofRear],moving=[side*half*.88,roof+d[1]*ca-d[2]*sa,roofRear+d[1]*sa+d[2]*ca],mid=fixed.map((v,i)=>v+(moving[i]-v)*.58);
            tube('trim',[fixed,mid],.020,'Liftgate gas cylinders');tube('metal',[mid,moving],.010,'Liftgate gas piston rods');
        }
        box('secondary',[0,floor+.04,back-.025],[W*.94,.15,.17],.045,'Minivan rear bumper');
        for(const side of [-1,1]){
            box('trim',[side*half*.97,belt-.04,back-.022],[.10,.43,.04],.025,'Rear lamp housings');
            for(let j=0;j<7;j++)box(r.lights?'red':'redlens',[side*half*.97,belt-.20+j*.047,back-.048],[.065,.023,.014],.007,'LED rear lamp bars');
        }
        if(r.interior){
            const seatPositions=[[W*.225,hip,rowZ[0]],[-W*.225,hip,rowZ[0]],[W*.235,hip,rowZ[1]],[-W*.235,hip,rowZ[1]],[-W*.245,hip,rowZ[2]],[0,hip,rowZ[2]],[W*.245,hip,rowZ[2]]];
            c.mounts.seats=[];
            for(let i=0;i<seatPositions.length;i++){
                const at=seatPositions[i];B.seatUnit(c,at,{width:i>=4?.45:.51,floor,recline:.20});
                const seat={posture:'seated',seat:{at},footL:{at:add(at,[.10,floor-hip+.055,.58])},footR:{at:add(at,[-.10,floor-hip+.055,.58])}};
                if(i>0){seat.handL={at:add(at,[.14,.09,.26])};seat.handR={at:add(at,[-.14,.09,.26])};}
                c.mounts.seats.push(seat);if(i===0)k.controls(at,seat);
                for(const s of [-1,1])box('metal',add(at,[s*.16,-.26,.11]),[.018,.025,.43],.006,'Passenger seat rails');
                const beltX=at[0]+(at[0]>=0?.22:-.22);tube('trim',[[beltX,hip+.59,at[2]-.11],[at[0]-.17,hip+.02,at[2]+.12]],.013,'Passenger shoulder belts');
                box('accent',add(at,[-.18,-.015,.11]),[.035,.045,.027],.006,'Seatbelt release buckles');
            }
            box('trim',[0,belt-.05,front-.16],[W*.80,.19,.33],.04,'Minivan molded dashboard');
            box('dark',[W*.225,belt+.025,front-.34],[.31,.12,.035],.018,'Driver instrument cluster');
            box('glass',[0,belt-.02,front-.339],[.22,.15,.015],.015,'Center navigation display');
            for(const s of [-1,1])for(let j=0;j<5;j++)box('metal',[s*.24,belt-.03+j*.018,front-.335],[.14,.005,.012],.002,'Dashboard ventilation slats');
            box('trim',[0,floor+.22,rowZ[0]+.31],[.20,.32,.48],.03,'Front center console');
            for(const z of [rowZ[0]+.20,rowZ[0]+.35])k.ring('trim',[0,floor+.39,z],.041,.008,'y','Cup holder lips');
            for(const s of [-1,1])tube('cabin',[[s*W*.33,roof-.09,rowZ[1]],[s*W*.33,roof-.16,rowZ[1]],[s*W*.33,roof-.16,rowZ[1]-.15],[s*W*.33,roof-.09,rowZ[1]-.15]],.014,'Passenger grab handles');
            for(const z of [rowZ[0],rowZ[1],rowZ[2]])box(r.lights?'light':'cabin',[0,roof-.032,z],[.12,.012,.10],.015,'Passenger reading lights');
            c.cabinSeats=seatPositions.map((p,i)=>({name:i===0?'Driver':'Passenger '+i,at:p.slice(),width:i>=4?.45:.51}));
        }
        if(r.roofRack&&!r.cutaway)for(const side of [-1,1]){for(const z of [-L*.31,L*.12])box('trim',[side*W*.29,roof+.035,z],[.06,.06,.15],.015,'Roof rail feet');tube('chrome',[[side*W*.29,roof+.06,-L*.34],[side*W*.29,roof+.08,-L*.29],[side*W*.29,roof+.08,L*.12],[side*W*.29,roof+.05,L*.17]],.019,'Minivan roof rails');}
        if(r.cargo>0){const count=Math.ceil(r.cargo*3);for(let j=0;j<count;j++){const x=(j-1)*.32;box('cargo',[x,floor+.16,-L*.38],[.28,.30,.36],.035,'Luggage behind third row');tube('trim',[[x-.06,floor+.31,-L*.38],[x-.06,floor+.36,-L*.38],[x+.06,floor+.36,-L*.38],[x+.06,floor+.31,-L*.38]],.010,'Luggage handles');}}
        return true;
    }
    const api={FORMS,DEFAULTS,build};root.RRMinivanCraft=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
