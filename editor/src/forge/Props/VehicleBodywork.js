/** Original coachwork and fitted assemblies. Dimensions are in meters; +z is
 * forward. Surfaces are lofted from design sections, rather than rounded boxes.
 * No reference mesh, texture, UV or insignia is included. */
(function(root){
    'use strict';
    const CM=root.RRContainerMesh||(typeof require==='function'?require('./ContainerMesh.js'):null);
    const {add,sub,scale,norm,cross,dot}=CM.vec,pi=Math.PI;
    const mix=(a,b,t)=>a+(b-a)*t;
    // Smooth section interpolation without the overshoot of a cubic spline.
    function section(points,z){let i=0;while(i+1<points.length-1&&z>points[i+1][0])i++;const a=points[i],b=points[i+1],t=Math.max(0,Math.min(1,(z-a[0])/(b[0]-a[0]))),u=t*t*(3-2*t);return mix(a[1],b[1],u);}
    function loft(rings){
        const g=new CM.Geo(),count=rings[0].length;
        // Parametric derivatives avoid area-weighted weld normals changing
        // between short/long adjacent stations (visible vertical banding).
        const normal=(i,j)=>norm(cross(sub(rings[i][(j+1)%count],rings[i][(j+count-1)%count]),sub(rings[Math.min(rings.length-1,i+1)][j],rings[Math.max(0,i-1)][j])));
        for(let i=0;i+1<rings.length;i++)for(let j=0;j<count;j++){
            const k=(j+1)%count,ids=[[i,j],[i,k],[i+1,k],[i+1,j]].map(([row,col])=>g.vert(rings[row][col],normal(row,col)));
            g.I.push(ids[0],ids[1],ids[2],ids[0],ids[2],ids[3]);
        }
        g.poly(rings[0],null,[0,0,-1]);g.poly(rings.at(-1),null,[0,0,1]);return g.done();
    }
    /** Rounded superellipse sections, useful for fairings and pressure hulls.
     * sections: [z, halfWidth, centerY, halfHeight], increasing z. */
    function shell(sections,exponent=2.6,sides=48){
        const rings=sections.map(([z,w,y,h])=>Array.from({length:sides},(_,j)=>{const a=j/sides*2*pi,c=Math.cos(a),s=Math.sin(a);return[Math.sign(c)*Math.abs(c)**(2/exponent)*w,y+Math.sign(s)*Math.abs(s)**(2/exponent)*h,z];}));
        // This order gives outward normals for increasing z.
        return loft(rings,.72);
    }
    /** Six flat panels, twelve circular edge strips and eight spherical
     * corners. Subdivision belongs to the fillets, not the large flat faces. */
    function filletBox(center,size,radius,steps=4){
        const h=size.map(v=>Math.abs(v)/2),r=Math.max(0,Math.min(radius,...h.map(v=>v*.95)));if(r<1e-6)return CM.chamferBox(center,size,0);
        const g=new CM.Geo(),emit=(points,normals)=>{const ids=points.map((p,i)=>g.vert(add(center,p),normals[i]));g.I.push(ids[0],ids[1],ids[2]);if(ids.length===4)g.I.push(ids[0],ids[2],ids[3]);};
        for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){const u=(axis+1)%3,v=(axis+2)%3,n=[0,0,0];n[axis]=sign;const pts=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{const p=[0,0,0];p[axis]=sign*h[axis];p[u]=a*(h[u]-r);p[v]=b*(h[v]-r);return p;});emit(pts,pts.map(()=>n));}
        for(let axis=0;axis<3;axis++)for(const s of [-1,1])for(const t of [-1,1]){const u=(axis+1)%3,v=(axis+2)%3,at=(j,end)=>{const angle=j/steps*pi/2,n=[0,0,0],p=[0,0,0];n[u]=s*Math.cos(angle);n[v]=t*Math.sin(angle);p[axis]=end*(h[axis]-r);p[u]=s*(h[u]-r)+n[u]*r;p[v]=t*(h[v]-r)+n[v]*r;return{p,n};};for(let j=0;j<steps;j++){const q=[at(j,-1),at(j+1,-1),at(j+1,1),at(j,1)];emit(q.map(v=>v.p),q.map(v=>v.n));}}
        for(const sx of [-1,1])for(const sy of [-1,1])for(const sz of [-1,1]){const at=(row,col)=>{const theta=row/steps*pi/2,phi=col/steps*pi/2,n=[sx*Math.sin(theta)*Math.cos(phi),sy*Math.sin(theta)*Math.sin(phi),sz*Math.cos(theta)],p=n.map((v,k)=>[sx,sy,sz][k]*(h[k]-r)+v*r);return{p,n};};for(let j=0;j<steps;j++)for(let k=0;k<steps;k++){const q=j===0?[at(j,k),at(j+1,k+1),at(j+1,k)]:[at(j,k),at(j,k+1),at(j+1,k+1),at(j+1,k)];emit(q.map(v=>v.p),q.map(v=>v.n));}}
        return CM.orientOutward(g.done());
    }
    // Shape-preserving cubic section. Continuous shoulder tangents eliminate
    // the broad faceted bands between the former handful of cross-section points.
    function contour(points,x){
        let i=0;while(i+1<points.length-1&&x>points[i+1][0])i++;
        const slope=j=>(points[j+1][1]-points[j][1])/(points[j+1][0]-points[j][0]),tangent=j=>{
            if(j===0)return slope(0);if(j===points.length-1)return slope(j-1);
            const a=slope(j-1),b=slope(j);return a*b<=0?0:2*a*b/(a+b);
        },a=points[i],b=points[i+1],d=b[0]-a[0],t=Math.max(0,Math.min(1,(x-a[0])/d));
        return (2*t*t*t-3*t*t+1)*a[1]+(t*t*t-2*t*t+t)*d*tangent(i)+(-2*t*t*t+3*t*t)*b[1]+(t*t*t-t*t)*d*tangent(i+1);
    }
    /** Pressed window aperture: structural surround, rolled edge and seated
     * gasket. The broad pillars are sheet bodywork instead of round scaffold. */
    function windowFrame(c,corners,bulge,name='Window aperture',margin=.07){
        const [a,b,d,e]=corners,normal=norm(cross(sub(b,a),sub(e,a))),thickness=Math.min(c.W*.010,c.H*.016),at=(u,v,depth)=>add(add(scale(add(scale(a,1-u),scale(b,u)),1-v),scale(add(scale(e,1-u),scale(d,u)),v)),scale(normal,bulge*Math.sin(pi*u)*Math.sin(pi*v)+depth));
        const loop=(inset,radius,depth)=>{const pts=[],lo=inset,hi=1-inset;for(const [x,y,start]of [[hi-radius,lo+radius,-pi/2],[hi-radius,hi-radius,0],[lo+radius,hi-radius,pi/2],[lo+radius,lo+radius,pi]])for(let j=0;j<=6;j++){const t=start+j/6*pi/2;pts.push(at(x+radius*Math.cos(t),y+radius*Math.sin(t),depth));}return pts;};
        const ring=(kind,inner,outer,front,back,label)=>{const g=new CM.Geo(),A=loop(outer,.035,front),B=loop(inner,.045,front),C=loop(outer,.035,back),D=loop(inner,.045,back);
            for(let j=0;j<A.length;j++){const k=(j+1)%A.length;g.poly([A[j],A[k],B[k],B[j]],null,normal);g.poly([C[j],D[j],D[k],C[k]],null,scale(normal,-1));
                const outside=norm(sub(scale(add(A[j],A[k]),.5),scale(add(a,d),.5)));g.poly([A[j],C[j],C[k],A[k]],null,outside);g.poly([B[j],B[k],D[k],D[j]],null,scale(outside,-1));}
            c.put(kind,CM.smoothNormals(g.done(),.8),label);
        };
        ring('paint',margin,0,thickness*.45,-thickness*.55,name+' formed surround');
        ring('trim',margin+.012,margin-.006,thickness*.52,0,name+' glazing gasket');
        return normal;
    }
    function roadWindows(c){
        const {W,H,hood,front,rear,rf,rr,rw,bw,roofY,r,put,glazing,sheet}=c;
        const lf=[-bw,hood,front],rfb=[bw,hood,front],lft=[-rw,roofY,rf],rft=[rw,roofY,rf],lrb=[-bw,hood,rear],rrb=[bw,hood,rear],lrt=[-rw,roofY,rr],rrt=[rw,roofY,rr];
        const panes=[[lf,rfb,rft,lft],[rrb,lrb,lrt,rrt],[lrb,lf,lft,lrt],[rfb,rrb,rrt,rft]],margin=r.form==='rover'?.11:r.form==='sport'?.075:.085;
        for(let i=0;i<panes.length;i++){const p=panes[i],bulge=i===0?W*.025:i<2?0:W*.008;put('glass',glazing(p,bulge));windowFrame(c,p,bulge,['Windscreen','Rear window','Right window','Left window'][i],margin);}
        for(const sign of [-1,1]){
            const z=Math.max(rr+(.12*(rf-rr)),Math.min(rf-.12*(rf-rr),c.door.rear)),t=(z-rr)/(rf-rr),bottom=[sign*bw,hood,mix(rear,front,t)],top=[sign*rw,roofY,z],half=Math.min(c.L*.022,(front-rear)*.06);
            sheet('paint',[[bottom[0],bottom[1],bottom[2]-half],[bottom[0],bottom[1],bottom[2]+half],[top[0],top[1],top[2]+half],[top[0],top[1],top[2]-half]],W*.014,'Door window divider');
            const F=CM.frame([sign*W*.56,hood+H*.11,front-c.L*.055],[0,0,-sign],[0,1,0]);put('glass',CM.slab(CM.rect(0,0,c.L*.026,H*.052),F,W*.004,.005,true),'Mirror glass');
        }
    }
    function roadProfile(r,q){
        const {W,H,L}= {W:r.width,H:r.height,L:r.length},sport=r.form==='sport',truck=r.form==='truck',rover=r.form==='rover';
        const widths=rover?[[-1,.83],[-.72,.98],[0,.98],[.63,1],[1,.80]]:truck?[[-1,.91],[-.68,1],[0,.97],[.62,1],[1,.83]]:sport?[[-1,.83],[-.66,1],[0,.91],[.62,1],[1,.83]]:[[-1,.78],[-.65,1],[-.08,.96],[.63,1],[1,.79]];
        const tops=rover?[[-1,-.035],[-.67,.04],[0,0],[.65,.015],[1,-.13]]:truck?[[-1,-.03],[-.65,0],[0,0],[.61,.025],[1,-.085]]:sport?[[-1,-.04],[-.64,.07],[-.05,-.015],[.62,.065],[1,-.085]]:[[-1,-.055],[-.64,.035],[0,0],[.62,.035],[1,-.105]];
        const width=z=>W*.49*section(widths,z/(L*.49)),top=z=>q.hood+H*section(tops,z/(L*.49));
        const crown=[[0,.047],[.35,.045],[.68,.040],[.85,.032],[.95,.017],[.99,-.014],[1,-.10]];
        const topFace=(z,f)=>top(z)+H*contour(crown,Math.abs(f));
        return{width,top,topFace};
    }
    function roadBody(c){
        const {r,W,H,L,R,base,hood,axleZ,put}=c,p=roadProfile(r,c),rings=[];
        // A true shoulder, rolled upper edge and tucked rocker. The outer
        // sill rises around each wheel; the inner floor remains continuous.
        const stations=new Set(Array.from({length:65},(_,i)=>-L*.49+L*.98*i/64));
        for(const z of axleZ)for(let i=-16;i<=16;i++){const zz=z+i/16*R*1.09;if(Math.abs(zz)<L*.49)stations.add(zz);}
        for(const z of [...stations].sort((a,b)=>a-b)){
            const w=p.width(z),top=p.top(z),opening=Math.max(base,...axleZ.map(a=>Math.abs(z-a)<R*1.09?R+Math.sqrt(Math.max(0,(R*1.09)**2-(z-a)**2)):base)),low=Math.min(opening,top-H*.018);
            const ring=[];
            // Closed cross section; many samples follow the broad stamped
            // surfaces, rather than adding a huge bevel to a flat cuboid.
            const outline=[[0,base],[.76,base],[.91,low],[.98,Math.max(low,base+(top-base)*.20)],[1,Math.max(low,top-H*.10)],[.99,top-H*.014],[.95,top+H*.017],[.85,top+H*.032],[.68,top+H*.040],[.35,top+H*.045],[0,top+H*.047]];
            const upper=[1,.99,.95,.85,.68,.35,0],rounded=outline.slice(0,5);for(let j=0;j<upper.length-1;j++)for(let k=1;k<=3;k++){const f=mix(upper[j],upper[j+1],k/3);rounded.push([f,Math.max(low,p.topFace(z,f))]);}const full=rounded.concat(rounded.slice(1,-1).reverse().map(([x,y])=>[-x,y]));
            // Counterclockwise section order gives outward faces along +z.
            const rear=c.cabinZ-c.cabinL*.5,front=c.cabinZ+c.cabinL*.5,fade=Math.min(1,Math.max(0,(z-rear)/(L*.045)),Math.max(0,(front-z)/(L*.045))),cabinOpening=r.interior?fade*fade*(3-2*fade):0;
            for(const [x,y]of full){const cabinTop=y>top-H*.03&&Math.abs(x)<=.85,yy=cabinTop?y+(base+H*.035-y)*cabinOpening:y;ring.push([x*w,yy,z]);}rings.push(ring);
        }
        put('paint',loft(rings,.55),'Sculpted body shell');c.bodyProfile=p;
    }
    /** Closed laminate patch between four corners; the skin bows with a
     * pressed character line. Used for visibly separate, fitted body panels. */
    function pressed(c,kind,corners,bulge,name){
        const {put}=c,g=new CM.Geo(),[a,b,d,e]=corners,normal=norm(cross(sub(b,a),sub(e,a))),n=10;
        const at=(u,v,back=false)=>add(add(scale(add(scale(a,1-u),scale(b,u)),1-v),scale(add(scale(e,1-u),scale(d,u)),v)),scale(normal,bulge*Math.sin(pi*u)*Math.sin(pi*v)-(back?.006:0)));
        for(let j=0;j<n;j++)for(let i=0;i<n;i++){const u=i/n,v=j/n,uu=(i+1)/n,vv=(j+1)/n;g.poly([at(u,v),at(uu,v),at(uu,vv),at(u,vv)],null,normal);g.poly([at(u,v,true),at(u,vv,true),at(uu,vv,true),at(uu,v,true)],null,scale(normal,-1));}
        for(const [a,b]of [[corners[0],corners[1]],[corners[1],corners[2]],[corners[2],corners[3]],[corners[3],corners[0]]])g.poly([a,b,add(b,scale(normal,-.006)),add(a,scale(normal,-.006))]);
        put(kind,CM.smoothNormals(g.done(),.75),name);
    }
    function doorSkin(c,s){
        const {r,W,H,hood,door,bodyProfile:p,put}=c,g=new CM.Geo(),rows=12,cols=16;
        const at=(u,v,back=false)=>{const z=mix(door.rear,door.front,u),y=mix(door.low,door.high,v),x=p.width(z)*.992+W*.006+W*.004*Math.sin(pi*v)-(back?W*.006:0);return[s*x,y,z];};
        for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const u=i/cols,uu=(i+1)/cols,v=j/rows,vv=(j+1)/rows;g.poly([at(u,v),at(uu,v),at(uu,vv),at(u,vv)],null,[s,0,0]);g.poly([at(u,v,true),at(u,vv,true),at(uu,vv,true),at(uu,v,true)],null,[-s,0,0]);}
        for(const side of [0,1])for(let i=0;i<cols;i++)g.poly([at(i/cols,side),at((i+1)/cols,side),at((i+1)/cols,side,true),at(i/cols,side,true)],null,[0,side?1:-1,0]);
        for(const side of [0,1])for(let j=0;j<rows;j++)g.poly([at(side,j/rows),at(side,(j+1)/rows),at(side,(j+1)/rows,true),at(side,j/rows,true)],null,[0,0,side?1:-1]);
        put('paint',CM.smoothNormals(g.done(),.75),'Access door');
    }
    function paneRail(c,corners,bulge,radius,kind,name){
        const [a,b,d,e]=corners,n=norm(cross(sub(b,a),sub(e,a))),points=[];
        for(let j=0;j<=32;j++){const t=j/32,bottom=scale(add(a,b),.5),top=scale(add(e,d),.5);points.push(add(add(scale(bottom,1-t),scale(top,t)),scale(n,bulge*Math.sin(pi*t)+radius*.7)));}
        c.tube(kind,points,radius,name);
    }
    function cabin(c){
        const {r,W,H,L,hood,roofY,front,rear,bw,put,tube}=c;if(!r.interior)return;const rise=roofY-hood,width=bw*2,seatZ=(front+rear)*.5-L*.045,box=(kind,center,size,bevel,name)=>put(kind,CM.roundedBox(center,size,bevel,2),name);
        box('dark',[0,c.base?c.base+H*.045:hood-H*.015,(front+rear)*.5],[width*.90,H*.012,(front-rear)*.86],.01,'Cabin floor');
        for(const sign of [-1,1]){
            const x=sign*width*.23,low=hood-H*.085,top=hood+rise*.63,seat=CM.roundedBox([x,(low+top)/2,seatZ],[width*.36,top-low,L*.036],Math.min(width*.035,L*.012),2);
            const anchor=[x,low,seatZ],angle=-.11,turn=p=>[p[0],p[1]*Math.cos(angle)-p[2]*Math.sin(angle),p[1]*Math.sin(angle)+p[2]*Math.cos(angle)];
            CM.transform(seat,p=>add(anchor,turn(sub(p,anchor))),turn);put('seat',seat,'Cabin seat upholstery');
            box('seat',[x,hood-H*.065,seatZ+L*.045],[width*.36,H*.055,L*.13],Math.min(H*.02,L*.016),'Cabin seat upholstery');
            box('seat',[x,hood+rise*.775,seatZ-rise*.08],[width*.23,rise*.23,L*.035],Math.min(rise*.035,L*.010),'Cabin headrests');
            for(const side of [-1,1])tube('metal',[[x+side*width*.05,hood+rise*.60,seatZ-rise*.07],[x+side*width*.05,hood+rise*.72,seatZ-rise*.08]],Math.min(W*.003,rise*.014),'Headrest posts');
            // A padded center channel and stitched edges remain distinct from
            // the hard trim and metal steering hardware.
            box('seat',[x,hood+rise*.25,seatZ+L*.022],[width*.28,rise*.45,L*.008],L*.003,'Seat center channels');
            for(const side of [-1,1])tube('trim',[[x+side*width*.14,low+H*.02,seatZ+L*.022],[x+side*width*.14,hood+rise*.51,seatZ+L*.009]],Math.min(W*.0017,rise*.009),'Seat piping');
        }
        box('trim',[0,hood+rise*.20,front-L*.080],[width*.94,rise*.12,L*.050],Math.min(rise*.025,L*.008),'Dashboard housing');
        const driverX=width*.23,wheel=[driverX,hood+rise*.35,front-L*.14],F=CM.frame(wheel,[1,0,0],[0,-.88,-.475]),R=Math.min(width*.12,rise*.36);
        put('rubber',CM.revolveOn(F,0,0,[[R*.86,-R*.06],[R,-R*.06],[R,R*.06],[R*.86,R*.06],[R*.86,-R*.06]],48),'Cabin steering wheel');
        put('trim',CM.revolveOn(F,0,0,[[0,-R*.05],[R*.24,-R*.05],[R*.24,R*.06],[0,R*.06]],24),'Steering hub');
        for(let j=0;j<3;j++){const a=j/3*Math.PI*2;const p=add(F.o,add(scale(F.u,Math.cos(a)*R*.85),scale(F.v,Math.sin(a)*R*.85)));tube('metal',[F.o,p],R*.035,'Steering spokes');}
        tube('dark',[[driverX,hood+rise*.18,front-L*.08],wheel],R*.10,'Steering column');
        const instruments=CM.frame([driverX,hood+rise*.255,front-L*.108],[1,0,0],[0,-.95,-.312]);
        put('dark',CM.slab(CM.rect(0,0,width*.28,rise*.16),instruments,.005,.002,true),'Instrument binnacle');
        for(const sign of [-1,1]){
            const frame={...instruments,o:add(instruments.o,add(scale(instruments.u,sign*width*.072),scale(instruments.n,.006)))},radius=rise*.055;
            put('metal',CM.revolveOn(frame,0,0,[[radius*.88,0],[radius,0],[radius,.002],[radius*.88,.002],[radius*.88,0]],32),'Instrument dial bezels');
            put(r.lights?'light':'glass',CM.revolveOn(frame,0,0,[[0,.001],[radius*.85,.001],[radius*.85,.002],[0,.002]],32),'Instrument faces');
            tube('dark',[frame.o,add(frame.o,add(scale(frame.u,radius*.50),scale(frame.v,radius*.25)))],Math.max(.0008,radius*.04),'Instrument needles');
        }
        box('dark',[-width*.13,hood+rise*.25,front-L*.108],[width*.18,rise*.16,L*.005],.003,'Center dashboard display');
        for(let j=0;j<3;j++)box(r.lights?'glow':'metal',[-width*.13,hood+rise*(.22+j*.026),front-L*.112],[width*.14,rise*.009,.002],.0004,'Dashboard status strips');
    }
    function roadDetails(c){
        const {r,W,H,L,R,hood,base,roofY,rf,rr,rw,bw,cabinZ,cabinL,door,box,tube,sheet,put,bodyProfile:p}=c;
        const sport=r.form==='sport',utility=['truck','rover'].includes(r.form);
        // Character lines follow the coachwork, including the changing width.
        for(const s of [-1,1]){
            const z0=Math.max(-L*.45,door.rear),z1=Math.min(L*.45,door.front);
            const path=Array.from({length:33},(_,i)=>{const z=z0+(z1-z0)*i/32;return[s*(p.width(z)+W*.003),hood-H*.04,z];});tube('trim',path,W*.0016,'Pressed belt line');
            const x=s*(W*.49+W*.018),lo=door.low,hi=door.high;
            // Door remains within the actual wheel bay, including short and
            // three-axle recipes. A fine seal surrounds its separate skin.
            const seal=[];for(const v of [1,0])for(let j=0;j<=24;j++){const u=v?j/24:1-j/24,z=mix(door.rear,door.front,u);seal.push([s*(p.width(z)*.992+W*.007),v?hi:lo,z]);}tube('dark',seal,W*.0014,'Door seal');
            const sideGlass=(z,y)=>s*(bw+(rw-bw)*(y-hood)/(roofY-hood));
            const pillarZ=Math.max(rr+L*.025,Math.min(rf-L*.025,door.rear));
            sheet('paint',[[sideGlass(pillarZ,hood),hood,pillarZ-L*.012],[sideGlass(pillarZ,roofY),roofY,pillarZ-L*.012],[sideGlass(pillarZ,roofY),roofY,pillarZ+L*.012],[sideGlass(pillarZ,hood),hood,pillarZ+L*.012]],W*.012,'Cabin pillars');
            // Rear sail panels give the roof a real body-colored attachment.
            sheet('paint',[[s*bw,hood,cabinZ-cabinL*.5],[s*rw,roofY,rr],[s*(rw+W*.025),roofY,rr+L*.035],[s*(bw+W*.018),hood,cabinZ-cabinL*.5+L*.055]],W*.014,'Rear sail panels');
            if(utility){
                for(const z of [door.rear+door.width*.18,door.front-door.width*.18])tube('metal',[[s*W*.40,lo,z],[s*W*.55,lo-H*.10,z]],H*.012,'Step supports');
                box('trim',[s*W*.53,lo-H*.10,door.z],[W*.14,H*.024,door.width*.84],.008,'Access step');
                for(let j=0;j<9;j++)box('metal',[s*W*.53,lo-H*.087,door.z+(j-4)*door.width*.078],[W*.12,.004,door.width*.025],.002,'Step tread');
            }
            if(!r.details)continue;
            if(utility)for(const y of [lo+(hi-lo)*.22,lo+(hi-lo)*.80])box('metal',[s*(p.width(door.front-.025)*.992+W*.017),y,door.front-.025],[.024,H*.037,.035],.006,'Door hinges');
            box('metal',[s*W*.56,hood+H*.11,cabinZ+cabinL*.5-L*.055-.019],[W*.105,H*.048,.004],.004,'Mirror glass');
            // Rolled sill and rear quarter intake: short details stay between
            // the wheel openings instead of stretching through the tires.
            const sillWidth=door.width*.9;
            box('trim',[s*W*.475,base+H*.018,door.z],[W*.046,H*.035,sillWidth],.018,'Rocker molding');
            if(sport){
                const F=CM.frame([s*(W*.49+.012),hood-H*.065,door.rear+door.width*.10],[0,0,-s],[0,1,0]);
                put('dark',CM.slab(CM.rect(0,0,door.width*.16,H*.075),F,.004,.002,true),'Quarter cooling inlet');
                for(let j=0;j<3;j++)tube('metal',[[F.o[0]+s*.007,hood-H*(.09-j*.022),door.rear+door.width*.025],[F.o[0]+s*.007,hood-H*(.09-j*.022),door.rear+door.width*.175]],W*.002,'Inlet vanes');
            }
            if(r.form==='rover'){
                const antenna=[s*W*.29,roofY+.035,cabinZ-cabinL*.23];box('trim',antenna,[W*.035,H*.025,W*.035],.012,'Antenna base');tube('metal',[antenna,add(antenna,[0,H*.27,0])],W*.0024,'Radio antenna');
                const F=CM.frame([s*W*.47,hood+H*.09,cabinZ-cabinL*.32],[0,0,-s],[0,1,0]);
                put('trim',CM.slab(CM.rect(0,0,cabinL*.20,H*.15),F,.015,.005,true),'Armor backing');
                put('armor',CM.slab(CM.rect(0,0,cabinL*.18,H*.13),{...F,o:add(F.o,scale(F.n,.017))},W*(.004+.014*r.armor),.012,true),'Replaceable armor');
            }
        }
        if(r.form==='rover'){
            const front=cabinZ+cabinL*.5;
            paneRail(c,[[-bw,hood,front],[bw,hood,front],[rw,roofY,rf],[-rw,roofY,rf]],W*.025,W*.013,'armor','Armored windscreen divider');
            if(r.details){
                const F=CM.frame([0,roofY+H*.028,(rf+rr)*.5],[1,0,0],[0,0,-1]);
                put('trim',CM.slab(CM.rect(0,0,W*.33,(rf-rr)*.56),F,H*.012,.025,true),'Roof hatch gasket');
                put('armor',CM.slab(CM.rect(0,0,W*.30,(rf-rr)*.52),{...F,o:add(F.o,[0,H*.015,0])},H*.012,.022,true),'Roof access hatch');
                const w=W*.06,bend=Math.min(H*.008,W*.018),y0=roofY+H*.054,y1=roofY+H*.082,z=(rf+rr)*.5,points=[[-w,y0,z],[-w,y1-bend,z]];
                for(let j=1;j<=12;j++){const a=pi-j/12*pi/2;points.push([-w+bend+Math.cos(a)*bend,y1-bend+Math.sin(a)*bend,z]);}
                points.push([w-bend,y1,z]);for(let j=1;j<=12;j++){const a=pi/2-j/12*pi/2;points.push([w-bend+Math.cos(a)*bend,y1-bend+Math.sin(a)*bend,z]);}points.push([w,y0,z]);
                tube('metal',points,Math.min(W*.004,H*.003,bend*.30),'Hatch grip');
            }
        }
        // Bonnet has a fitted perimeter and two long pressed creases.
        const z0=Math.min(L*.43,cabinZ+cabinL*.5),z1=L*.475;
        patch(c,'trim',(u,v)=>{const z=mix(z0,z1,u),f=mix(-.735,.735,v);return[f*p.width(z),p.topFace(z,f)+H*.0015,z];},'Bonnet perimeter seal');
        patch(c,'paint',(u,v)=>{const z=mix(z0+L*.002,z1-L*.002,u),f=mix(-.725,.725,v);return[f*p.width(z),p.topFace(z,f)+H*.003,z];},'Formed bonnet panel');
        for(const s of [-1,1])for(const f of [.34]){
            const points=Array.from({length:33},(_,i)=>{const z=mix(z0,z1,i/32);return[s*p.width(z)*f,p.topFace(z,f)+H*.004,z];});tube(f===.75?'dark':'paint',points,W*(f===.75?.0010:.0024),'Bonnet pressings');
        }
        if(r.aero>0&&['compact','sport'].includes(r.form)){
            const y=p.top(-L*.40)+H*.065+H*.09*r.aero;
            for(const s of [-1,1])sheet('trim',[[s*W*.27,p.top(-L*.40),-L*.40],[s*W*.27,y,-L*.43],[s*W*.27,y,-L*.40],[s*W*.27,p.top(-L*.35),-L*.35]],W*.014,'Spoiler pylons');
            put('paint',shell([[-L*.46,W*.44,y,H*.008],[-L*.42,W*.46,y+H*.005,H*.014],[-L*.37,W*.43,y,H*.006]],2.7,32),'Aero rear wing');
        }
        if(!r.details)return;
        if(utility){
            for(const s of [-1,1]){
                const y=hood+H*.034,z=L*.34;
                box('trim',[s*W*.25,y,z],[W*.20,H*.018,L*.15],.012,'Bonnet cooling recess');
                for(let j=0;j<7;j++)box('armor',[s*W*.25,y+H*.013,z+(j-3)*L*.016],[W*.17,H*.010,L*.009],.004,'Bonnet louvers');
            }
        }
        const z=-L*.497;
        if(sport){
            box('dark',[0,base+H*.025,z],[W*.68,H*.085,L*.035],.015,'Rear diffuser');
            for(let j=0;j<5;j++)box('trim',[(j-2)*W*.12,base+H*.025,z-L*.015],[W*.012,H*.08,L*.07],.003,'Diffuser fins');
            for(const s of [-1,1]){
                const F=CM.frame([s*W*.29,base+H*.025,z-L*.04],[1,0,0],[0,-1,0]);
                put('metal',CM.revolveOn(F,0,0,[[H*.035,-.05],[H*.035,0],[H*.029,.008],[H*.025,0],[H*.025,-.05],[H*.035,-.05]],40),'Exhaust tips');
                put('dark',CM.revolveOn(F,0,0,[[0,-.049],[H*.026,-.049],[H*.026,-.048],[0,-.048]],32),'Exhaust throats');
            }
        }
        if(r.form==='truck'){
            const z=-L*.31;
            for(let j=0;j<9;j++)box('metal',[(j-4)*W*.072,hood-H*.028,z],[W*.016,H*.009,L*.28],.003,'Bed floor ribs');
            for(const s of [-1,1])for(const zz of [-L*.44,-L*.18])tube('metal',[[s*W*.39,hood+H*.09,zz],[s*W*.36,hood+H*.11,zz],[s*W*.34,hood+H*.09,zz]],W*.007,'Bed tie-downs');
            box('trim',[0,hood+H*.10,-L*.488],[W*.16,H*.025,.014],.006,'Tailgate latch');
        }
    }
    function roadFace(c){
        const {r,W,H,L,hood,base,box,tube,put,bodyProfile:p}=c,sport=r.form==='sport',utility=['truck','rover'].includes(r.form),front=L*.49,y=p.top(front)-H*.035;
        // A layered fascia: dark inset, separate slats, body-color perimeter,
        // optical housings and lenses. Nothing is drawn onto a blurry atlas.
        const fasciaWidth=W*.77,fasciaH=H*(utility?.16:.13);
        box('trim',[0,y-H*.027,front+.003],[fasciaWidth,fasciaH,.045],.025,'Recessed front fascia');
        const centerW=W*(utility?.38:.34);
        box('dark',[0,y-H*.025,front+.027],[centerW,H*.10,.010],.015,'Radiator cavity');
        for(let j=0;j<6;j++)box('metal',[0,y-H*.065+j*H*.014,front+.034],[centerW*.92,H*.0035,.006],.002,'Radiator grille');
        for(const s of [-1,1]){
            const x=s*W*.267,F=CM.frame([x,y+H*.008,front+.030],[1,0,0],[0,1,0]),rw=W*.108,rh=H*.042;
            put('dark',CM.slab(CM.rect(0,0,rw*2,rh*2),F,.008,.005,true),'Headlamp recess');
            for(const dx of [-.48,.42]){
                const radius=Math.min(rh*.71,rw*.40),at=dx*rw;
                put('metal',CM.revolveOn({...F,o:add(F.o,[0,0,.010])},at,0,[[radius,0],[radius,.012],[radius*.78,.016],[radius*.63,.009],[radius,0]],48),'Headlamp reflectors');
                put('glass',CM.revolveOn({...F,o:add(F.o,[0,0,.010])},at,0,[[0,.011],[radius*.65,.011],[radius*.65,.015],[0,.015]],48),'Headlamp lenses');
                put(r.lights?'light':'dark',CM.revolveOn({...F,o:add(F.o,[0,0,.010])},at,0,[[0,.017],[radius*.39,.017],[radius*.39,.019],[0,.019]],32),'Headlamp optics');
            }
            tube(r.lights?'light':'metal',[[x-rw*.84,y+rh*.78,front+.048],[x+rw*.84,y+rh*.78,front+.048]],H*.0025,'Running lights');
            const by=base+H*.045;
            box('dark',[s*W*.30,by,front+.022],[W*.16,H*.045,.040],.013,'Brake duct');
            for(let j=0;j<3;j++)box('trim',[s*W*.30,by+H*(j-1)*.012,front+.045],[W*.14,H*.004,.006],.002,'Brake duct vanes');
            // The gasket embeds into the rear cap; the lens sits outward of
            // its face. Bending the strip forward here buried it in the body.
            const path=Array.from({length:25},(_,i)=>{const t=i/24;return[s*W*(.16+.20*t),hood-H*.06+H*.008*Math.sin(pi*t),-L*.49-H*.010];});
            tube('trim',path,H*.014,'Tail lamp housing');tube(r.lights?'red':'dark',path.map(p=>add(p,[0,0,-H*.015])),H*.007,'Tail lamp lens');
        }
        if(r.bumper){
            const yy=base+H*.015;
            put('trim',shell([[front-L*.025,W*.43,yy,H*.042],[front+L*.010,W*.43,yy,H*.032],[front+L*.020,W*.39,yy,H*.021]],3,32),'Contoured front bumper');
            box('trim',[0,yy,-L*.50],[W*.80,H*.065,L*.035],.020,'Rear bumper');
            if(utility){
                for(const s of [-1,1])tube('metal',[[s*W*.30,yy,front+.055],[s*W*.30,y-H*.025,front+.070],[s*W*.22,y+H*.005,front+.070]],W*.012,'Brush guard');
                box('metal',[0,yy-H*.01,front+L*.026],[W*.35,H*.085,.020],.010,'Front skid plate');
                if(r.details)for(let j=0;j<5;j++)box('dark',[(j-2)*W*.052,yy-H*.01,front+L*.028+.012],[W*.025,H*.040,.002],.003,'Skid plate slots');
            }
        }
    }
    function grille(c,F,width,height,depth,rows,name){
        const border=Math.min(width*.065,height*.10),recess=depth*.72,b=CM.bezel(F,width,height,depth,border,recess);
        c.put('trim',b.housing,name+' frame');c.put('dark',b.floor,name+' cavity');
        for(let j=0;j<rows;j++){
            const y=(j-(rows-1)/2)*(height-border*2)/rows;
            c.put('metal',CM.slab(CM.rect(0,y,width-border*2.6,(height-border*2)/rows*.20),{...F,o:add(F.o,scale(F.n,depth-recess+.001))},depth*.18,.001,true),name+' louvers');
        }
    }
    function round(c,kind,frame,profile,name,segments=64){
        // A blind bore ends in a thin solid disc, facing out of the assembly.
        // A two-point radius fan alone faces inward and disappears from behind.
        if(profile.length===2&&profile.some(p=>p[0]===0)){
            const outer=profile.find(p=>p[0]>0),R=outer[0],y=outer[1],t=Math.min(.002,R*.05);
            profile=[[0,y-t],[R,y-t],[R,y],[0,y]];
        }
        c.put(kind,CM.revolveOn(frame,0,0,profile,segments),name);
    }
    function turbine(c,center,radius,length){
        const {r,H,put,tube}=c,F=CM.frame(center,[1,0,0],[0,-1,0]),R=radius;
        // The rim, casing, throat and blades are separate radial surfaces.
        round(c,'paint',F,[[R*.70,-length*.48],[R*.94,-length*.37],[R,-length*.20],[R,0],[R*.94,length*.08],[R*.79,length*.09],[R*.72,-length*.02],[R*.70,-length*.48]],'Turbine casings');
        round(c,'metal',F,[[R*.82,-.002],[R*.94,.006],[R*.92,.027],[R*.80,.032],[R*.72,.008],[R*.82,-.002]],'Nozzle lips');
        round(c,'dark',F,[[R*.73,-length*.22],[R*.73,.006],[R*.63,.010],[R*.53,-length*.22],[R*.73,-length*.22]],'Nozzle throats');
        round(c,r.lights?'glow':'dark',F,[[R*.22,-length*.19],[R*.53,-length*.19],[R*.53,-length*.18],[R*.22,-length*.18],[R*.22,-length*.19]],'Turbine core');
        round(c,'metal',F,[[0,-length*.23],[R*.18,-length*.23],[R*.22,-length*.19],[R*.12,-length*.14],[0,-length*.14]],'Turbine center cone');
        if(r.details)for(let j=0;j<12;j++){const a=j/12*pi*2,at=(rr,angle,depth)=>add(F.o,add(scale(F.u,Math.cos(angle)*rr),add(scale(F.v,Math.sin(angle)*rr),scale(F.n,depth))));c.sheet('metal',[at(R*.21,a,-length*.19),at(R*.52,a+.23,-length*.18),at(R*.52,a+.30,-length*.18),at(R*.21,a+.10,-length*.19)],R*.006,'Turbine core vanes');}
        if(r.details)for(let j=0;j<18;j++){
            const a=j/18*2*pi,at=(rr,aa,d)=>add(F.o,add(scale(F.u,rr*Math.cos(aa)),add(scale(F.v,rr*Math.sin(aa)),scale(F.n,d))));
            c.sheet('metal',[at(R*.59,a,-length*.15),at(R*.80,a+.10,-.010),at(R*.80,a+.16,-.010),at(R*.59,a+.11,-length*.15)],R*.008,'Nozzle guide vanes');
            const p=at(R*1.002,a,-length*.25),q=at(R*1.002,a,-length*.07);tube('trim',[p,q],Math.min(H*.003,R*.020),'Engine casing flutes');
        }
    }
    function wing(c,s,rootX,tipX,z0,z1,y){
        const {W,H,L,put}=c,rings=[],n=32;
        // A closed airfoil swept outward and aft. The leading edge is round;
        // the trailing edge is thin, with no slab through the fuselage.
        for(let j=0;j<=n;j++){
            const t=j/n,x=s*mix(rootX,tipX,t),front=mix(z1,z1-L*.15,t),back=mix(z0,z0-L*.05,t),thick=H*mix(.027,.009,t),ring=[];
            for(let k=0;k<48;k++){const a=k/48*2*pi,u=(1+Math.cos(a))/2;ring.push([x,y+H*.035*t+Math.sin(a)*thick,back+(front-back)*u]);}rings.push(ring);
        }
        // Custom axis loft: the end normals are ±x rather than ±z.
        const g=new CM.Geo();for(let j=0;j<n;j++)for(let k=0;k<48;k++){const kk=(k+1)%48,p=[rings[j][k],rings[j+1][k],rings[j+1][kk],rings[j][kk]],v=norm(cross(sub(p[1],p[0]),sub(p[3],p[0])));g.poly(p,null,scale(v,s));}
        g.poly(rings[0],null,[-s,0,0]);g.poly(rings.at(-1),null,[s,0,0]);put('paint',CM.smoothNormals(g.done(),.7),'Swept airfoil wings');
        c.tube('trim',Array.from({length:25},(_,i)=>{const t=i/24;return[s*mix(rootX,tipX,t),y+H*.035*t+H*.002,mix(z0,z0-L*.05,t)];}),H*.003,'Wing trailing edge');
    }
    function stabilizer(c,sign,bw){
        const {W,H,L,put,tube}=c,g=new CM.Geo(),rows=16,sides=32,at=(j,k)=>{const t=j/rows,a=k/sides*pi*2,front=mix(-L*.31,-L*.39,t),back=-L*.46,x=sign*bw*mix(.85,.80,t),thickness=W*mix(.012,.004,t);return[x+Math.sin(a)*thickness,H*mix(.63,1.13,t),back+(front-back)*(1+Math.cos(a))/2];};
        for(let j=0;j<rows;j++)for(let k=0;k<sides;k++){const pts=[at(j,k),at(j,k+1),at(j+1,k+1),at(j+1,k)],mid=scale(add(pts[0],pts[2]),.5),center=[sign*bw*mix(.85,.80,(j+.5)/rows),mid[1],mix(-L*.385,-L*.425,(j+.5)/rows)];g.poly(pts,null,norm(sub(mid,center)));}
        g.poly(Array.from({length:sides},(_,k)=>at(0,k)),null,[0,-1,0]);g.poly(Array.from({length:sides},(_,k)=>at(rows,k)),null,[0,1,0]);put('paint',CM.smoothNormals(g.done(),.8),'Swept stabilizers');
        const seam=Array.from({length:25},(_,j)=>{const t=.18+j/24*.76,front=mix(-L*.31,-L*.39,t);return[sign*(bw*mix(.85,.80,t)+W*mix(.012,.004,t)*.80),H*mix(.63,1.13,t),mix(-L*.46,front,.20)];});tube('trim',seam,H*.0017,'Stabilizer control seams');
    }
    function flight(c){
        const {r,W,H,L,put,box,tube,sheet,glazing}=c,shuttle=r.form==='shuttle',bw=W*(shuttle?.235:.29),cy=H*.51;
        const widths=[[-.50,.44],[-.38,.90],[-.15,1],[.12,.95],[.32,.70],[.49,.12]],heights=[[-.50,.13],[-.34,.24],[0,.24],[.23,.17],[.49,.045]],rings=[];
        for(let j=0;j<=64;j++){const z=-L*.5+L*.99*j/64;rings.push([z,bw*section(widths,z/L),cy+H*.015*Math.sin(j/64*pi),H*section(heights,z/L)]);}
        put('paint',shell(rings,2.7,64),'Formed pressure hull');
        put('trim',shell([[-L*.46,bw*.45,H*.32,H*.06],[-L*.18,bw*.80,H*.29,H*.055],[L*.25,bw*.66,H*.34,H*.045],[L*.46,bw*.10,H*.46,H*.01]],2.6),'Ventral keel');
        const roof=H*(.91+.35*(r.cabinHeight-1)),canopyFront=L*.28,canopyRear=-L*.12,roofFront=L*.06,roofRear=-L*.085,cb=bw*.74,cr=bw*.62,deck=H*.69;
        const lf=[-cb,deck,canopyFront],rf=[cb,deck,canopyFront],lt=[-cr,roof,roofFront],rt=[cr,roof,roofFront],lb=[-cb,H*.74,canopyRear],rb=[cb,H*.74,canopyRear],lrt=[-cr,roof,roofRear],rrt=[cr,roof,roofRear];
        put('glass',glazing([lf,rf,rt,lt],H*.025),'Flight canopy');
        put('glass',glazing([lb,lf,lt,lrt],W*.006),'Flight side glass');put('glass',glazing([rf,rb,rrt,rt],W*.006),'Flight side glass');
        cabin({...c,hood:deck,roofY:roof,front:canopyFront,rear:canopyRear,bw:cb});
        put('secondary',shell([[roofRear-L*.012,cr*.99,roof,H*.018],[(roofRear+roofFront)*.5,cr*1.02,roof+H*.016,H*.022],[roofFront+L*.006,cr,roof,H*.016]],2.8,48),'Canopy crown');
        for(const [i,p]of [[lf,rf,rt,lt],[lb,lf,lt,lrt],[rf,rb,rrt,rt]].entries())windowFrame(c,p,i===0?H*.025:W*.006,'Canopy '+i,.065);
        paneRail(c,[lf,rf,rt,lt],H*.025,H*.006,'trim','Windscreen mullion');
        for(const s of [-1,1]){
            const engineX=s*W*(shuttle?.35:.36)*r.wingSpan,engineY=H*.45,engineZ=-L*.32,R=H*(shuttle?.18:.17)*r.engineSize;
            wing(c,s,bw*.64,Math.abs(engineX)+R*.55,-L*.28,L*(shuttle?.14:.09),H*.46);
            tube('metal',[[s*bw*.65,H*.41,-L*.19],[engineX,H*.41,-L*.19]],H*.033,'Engine pylons');
            turbine(c,[engineX,engineY,engineZ],R,L*.34);
            // An intake with a real rolled lip and shadowed inner throat.
            const intake=CM.frame([engineX,engineY,engineZ+L*.34*.48],[1,0,0],[0,1,0]);
            round(c,'metal',intake,[[R*.71,-.015],[R*.76,0],[R*.70,.015],[R*.57,.017],[R*.51,-.020],[R*.71,-.015]],'Engine intake lips');
            round(c,'dark',intake,[[0,-.025],[R*.55,-.025]],'Engine intake throats');
            for(const z of [-L*.26,L*.23]){
                const x=s*bw*.82,up=[x,H*.40,z],knee=[x+s*W*.025,H*.17,z-L*.025],foot=[x+s*W*.04,H*.045,z];
                tube('trim',[up,knee],H*.025,'Landing strut housings');tube('metal',[knee,foot],H*.014,'Landing pistons');
                tube('metal',[[x,H*.32,z-L*.045],foot],H*.009,'Landing braces');box('trim',[foot[0],H*.026,z],[W*.095,H*.052,L*.095],.025,'Landing feet');
            }
            if(shuttle){
                stabilizer(c,s,bw);
                tube('accent',[[s*bw*.80,H*1.13,-L*.39],[s*bw*.80,H*1.13,-L*.46]],H*.003,'Stabilizer tips');
            }else{
                // Downward lift ducts integrated into each side chine.
                for(const z of [-L*.16,L*.14]){
                    const x=s*W*.285,F=CM.frame([x,H*.40,z],[1,0,0],[0,0,-1]),rr=Math.min(W*.115,L*.08)*r.engineSize;
                    round(c,'paint',F,[[rr*.75,-H*.09],[rr,-H*.07],[rr,H*.015],[rr*.84,H*.035],[rr*.75,H*.02],[rr*.75,-H*.09]],'Lift fan shrouds');
                    round(c,'dark',F,[[0,-H*.05],[rr*.77,-H*.05]],'Lift fan wells');
                    round(c,'metal',F,[[0,-H*.04],[rr*.17,-H*.04],[rr*.17,H*.016],[0,H*.016]],'Lift fan hubs');
                    if(r.details)for(let j=0;j<8;j++){const a=j/8*2*pi;const pts=[[.18,-.08],[.72,-.13],[.79,.07],[.23,.10]].map(([u,v])=>add(F.o,add(scale(F.u,rr*(u*Math.cos(a)-v*Math.sin(a))),add(scale(F.v,rr*(u*Math.sin(a)+v*Math.cos(a))),scale(F.n,-H*.019)))));sheet('metal',pts,H*.006,'Lift fan blades');}
                }
            }
            if(r.flightFit==='interceptor'){
                sheet('armor',[[engineX,H*.45,-L*.25],[engineX+s*W*.16,H*.49,-L*.30],[engineX+s*W*.17,H*.50,-L*.44],[engineX,H*.45,-L*.43]],H*.023,'Interceptor outriggers');
                turbine(c,[engineX+s*R*1.48,H*.43,-L*.35],R*.40,L*.15);
            }else if(r.flightFit==='cargo'){
                const m=shell([[-L*.33,W*.080,H*.43,H*.105],[-L*.25,W*.10,H*.43,H*.12],[L*.08,W*.10,H*.43,H*.12],[L*.14,W*.075,H*.43,H*.09]],3.6,40);const podX=s*(Math.abs(engineX)+R+W*.105);CM.transform(m,p=>add(p,[podX,0,0]));put('cargo',m,'Outboard cargo pods');
                for(const z of [-L*.24,L*.04])tube('trim',[[s*bw*.9,H*.45,z],[podX,H*.45,z]],H*.025,'Cargo pod mounts');
            }
        }
        // Panels and running lamps use the hull's own parameterization. This
        // keeps them seated on curved skin when dimensions change.
        const skin=(z,a,offset=0)=>{
            const w=bw*section(widths,z/L),h=H*section(heights,z/L),y=cy+H*.015*Math.sin((z/L+.5)/.99*pi),co=Math.cos(a),si=Math.sin(a);
            return[Math.sign(co)*Math.abs(co)**(2/2.7)*(w+offset),y+Math.sign(si)*Math.abs(si)**(2/2.7)*(h+offset),z];
        };
        const panelContext={...c,patchCenter:[0,cy,0]};
        for(const s of [-1,1]){
            const angle=t=>s===1?t:pi-t;
            patch(panelContext,'trim',(u,v)=>skin(mix(-L*.34,L*.29,u),angle(mix(-.24,.32,v)),H*.007),'Side equipment bay seals');
            patch(panelContext,'secondary',(u,v)=>skin(mix(-L*.33,L*.28,u),angle(mix(-.21,.29,v)),H*.010),'Formed side equipment bays');
            patch(panelContext,'trim',(u,v)=>skin(mix(L*.31,L*.448,u),angle(mix(.43,1.15,v)),H*.006),'Nose panel seal');
            patch(panelContext,'secondary',(u,v)=>skin(mix(L*.314,L*.444,u),angle(mix(.46,1.12,v)),H*.009),'Nose access panels');
            tube(r.lights?'light':'dark',Array.from({length:25},(_,i)=>skin(mix(L*.36,L*.425,i/24),angle(.56),H*.015)),H*.0045,'Nose running lights');
            if(r.details){
                for(let j=0;j<6;j++)tube('metal',Array.from({length:13},(_,k)=>skin(-L*(.19+j*.018),angle(mix(-.10,.20,k/12)),H*.014)),H*.0025,'Equipment bay cooling ribs');
                const p=skin(L*.02,angle(.035),H*.017);box('trim',p,[W*.012,H*.025,L*.055],.006,'Equipment bay handles');
            }
        }
        // Rear access hatch is layered on the pressure hull end, with a seal,
        // formed skin, hinge blocks and a latch rather than a naked flat box.
        const hatch=CM.frame([0,H*.51,-L*.502],[1,0,0],[0,-1,0]);
        put('trim',CM.slab(CM.rect(0,0,bw*.77,H*.23),hatch,.012,.010,true),'Rear hatch seal');
        put('paint',CM.slab(CM.rect(0,0,bw*.70,H*.20),{...hatch,o:add(hatch.o,scale(hatch.n,.014))},.009,.009,true),'Rear hatch');
        for(const s of [-1,1])box('metal',[s*bw*.30,H*.51,-L*.525],[W*.015,H*.045,.018],.005,'Hatch hinges');
        box('trim',[0,H*.51,-L*.531],[bw*.26,H*.020,.010],.005,'Hatch latch');
        if(r.details){
            for(const s of [-1,1]){
                // Flush maintenance tiles on the dorsal engine deck.
                const y=H*.77,z=-L*.26;box('trim',[s*bw*.36,y,z],[bw*.43,H*.025,L*.13],.012,'Dorsal service recess');
                for(let j=0;j<8;j++)box('metal',[s*bw*.36,y+H*.016,z+(j-3.5)*L*.013],[bw*.36,H*.006,L*.005],.002,'Heat exchanger fins');
                tube('dark',[[s*bw*.68,H*.67,-L*.32],[s*bw*.83,H*.70,-L*.29],[s*bw*.83,H*.70,-L*.16]],H*.008,'Coolant lines');
            }
        }
        if(r.cargo>.05){box('trim',[0,H*.77,-L*.24],[bw*.9,H*.025,L*.20],.012,'Cargo deck mount');box('cargo',[0,H*(.795+.07*r.cargo),-L*.24],[bw*.85,H*.14*r.cargo,L*.18],.025,'Deck cargo');}
    }
    /** A closed, fitted curved panel. Its sampled face normals derive from
     * the surface, so a stretched recipe changes both geometry and lighting. */
    function patch(c,kind,at,name){
        const g=new CM.Geo(),n=16;
        const normal=(u,v)=>{let n=norm(cross(sub(at(Math.min(1,u+.001),v),at(Math.max(0,u-.001),v)),sub(at(u,Math.min(1,v+.001)),at(u,Math.max(0,v-.001)))));const p=at(u,v);if(dot(n,c.patchFacing?c.patchFacing:c.patchCenter?[p[0]-c.patchCenter[0],p[1]-c.patchCenter[1],0]:[0,1,0])<0)n=scale(n,-1);return n;};
        const point=(u,v,back=false)=>back?add(at(u,v),scale(normal(u,v),-.004)):at(u,v);
        for(let j=0;j<n;j++)for(let i=0;i<n;i++){
            const u=i/n,v=j/n,uu=(i+1)/n,vv=(j+1)/n,p=[point(u,v),point(uu,v),point(uu,vv),point(u,vv)];
            const facing=normal((u+uu)/2,(v+vv)/2);g.poly(p,null,facing);g.poly([point(u,v,true),point(u,vv,true),point(uu,vv,true),point(uu,v,true)],null,scale(facing,-1));
        }
        for(const s of [0,1])for(let j=0;j<n;j++)for(const edge of [0,1]){const a=edge?[s,j/n]:[j/n,s],b=edge?[s,(j+1)/n]:[(j+1)/n,s];const m=[(a[0]+b[0])/2,(a[1]+b[1])/2],tangent=edge?sub(at(Math.min(1,m[0]+.001),m[1]),at(Math.max(0,m[0]-.001),m[1])):sub(at(m[0],Math.min(1,m[1]+.001)),at(m[0],Math.max(0,m[1]-.001)));g.poly([point(...a),point(...b),point(...b,true),point(...a,true)],null,scale(tangent,s?1:-1));}
        c.put(kind,CM.smoothNormals(g.done(),.7),name);
    }
    function bike(c){
        const {r,W,H,L,R,seat,engine,box,tube,sheet,put,glazing}=c;
        // Shaped tail, radiator, swingarm and final drive add a hierarchy of
        // real mechanical assemblies beneath the tank and body fairings.
        put('secondary',shell([[-L*.345,W*.045,seat+H*.010,H*.018],[-L*.27,W*.145,seat+H*.005,H*.037],[-L*.14,W*.16,seat-H*.025,H*.028]],2.7),'Sculpted tail cowl');
        const radiator=CM.frame([0,H*.51,L*.105],[1,0,0],[0,1,0]);
        put('trim',CM.slab(CM.rect(0,0,W*.40,H*.18),radiator,.018,.007,true),'Radiator surround');
        for(let j=0;j<11;j++)box('metal',[0,H*.51+(j-5)*H*.013,L*.118],[W*.35,H*.003,.007],.002,'Radiator fins');
        for(const s of [-1,1]){
            const z0=-L*.35,z1=-L*.065;
            tube('trim',[[s*W*.17,R,z0],[s*W*.18,H*.35,z1]],W*.041,'Box section swingarm');
            const F=CM.frame([s*W*.165,R,z0],[0,0,-s],[0,1,0]),rs=R*.29;
            round(c,'metal',F,[[0,0],[rs,0],[rs,.012],[rs*.75,.018],[0,.018]],'Rear sprocket',48);
            if(s<0){
                for(const dy of [-rs,rs])tube('dark',[[s*W*.185,R+dy,z0],[s*W*.185,H*.35+dy*.5,z1]],W*.009,'Drive chain');
                if(r.details)for(let j=0;j<21;j++)for(const dy of [-rs,rs]){const t=j/20,p=[s*W*.19,mix(R+dy,H*.35+dy*.5,t),mix(z0,z1,t)];box('metal',p,[W*.006,H*.007,L*.008],.002,'Chain links');}
            }
            // Separate front brake calipers remain attached to the fork.
            box('accent',[s*W*.13,R+R*.16,L*.35-R*.32],[W*.052,H*.065,L*.035],.010,'Front brake calipers');
            if(r.details){
                tube('dark',[[s*W*.18,H*.59,L*.04],[s*W*.24,H*.48,L*.11],[s*W*.18,H*.40,L*.10]],W*.011,'Coolant hoses');
                const E=CM.frame([s*W*.245,H*.28,-L*.34],[1,0,0],[0,-1,0]);round(c,'metal',E,[[W*.044,-L*.08],[W*.055,-L*.04],[W*.055,.004],[W*.045,.012],[W*.033,.010],[W*.033,-L*.08],[W*.044,-L*.08]],'Silencer shells',48);round(c,'dark',E,[[0,-.010],[W*.034,-.010]],'Silencer throats',32);
            }
        }
        if(r.fairing==='naked')return;
        put('paint',shell([[L*.14,W*.12,H*.85,H*.085],[L*.22,W*.29,H*.84,H*.12],[L*.29,W*.26,H*.84,H*.065],[L*.325,W*.20,H*.835,H*.040]],2.4),'Sculpted nose fairing');
        put('glass',glazing([[-W*.23,H*.93,L*.27],[W*.23,H*.93,L*.27],[W*.19,H*1.04,L*.15],[-W*.19,H*1.04,L*.15]],H*.014),'Curved windscreen');
        for(const s of [-1,1]){
            const sections=r.fairing==='full'?[[-L*.04,W*.035,H*.52,H*.12],[L*.08,W*.060,H*.53,H*.19],[L*.16,W*.055,H*.65,H*.20],[L*.23,W*.018,H*.78,H*.07]]:[[-L*.04,W*.025,H*.72,H*.035],[L*.08,W*.052,H*.72,H*.065],[L*.17,W*.040,H*.76,H*.09],[L*.23,W*.020,H*.80,H*.055]];
            const m=shell(sections,2.8,40);CM.transform(m,p=>add(p,[s*W*.235,0,0]));put('paint',m,'Side fairings');
            tube('accent',[[s*W*.28,H*.74,-L*.02],[s*W*.29,H*.77,L*.12],[s*W*.24,H*.83,L*.22]],W*.005,'Fairing character line');
            const F=CM.frame([s*W*.10,H*.835,L*.326],[1,0,0],[0,1,0]);round(c,'trim',F,[[0,0],[H*.028,0],[H*.028,.008],[0,.008]],'Fairing headlamp mounts',40);round(c,r.lights?'light':'dark',F,[[0,.009],[H*.021,.009],[H*.021,.012],[0,.012]],'Fairing headlamps',40);
        }
    }
    function drone(c){
        const {r,W,H,L,put,box,tube,sheet}=c,R=Math.min(W,L)*.17*r.engineSize,body=H*.55;c.motors=[];
        put('paint',shell([[-L*.24,W*.055,H*.49,H*.045],[-L*.15,W*.15,H*.51,H*.12],[0,W*.17,H*.52,H*.15],[L*.20,W*.115,H*.50,H*.10],[L*.28,W*.035,H*.48,H*.025]],2.9),'Formed avionics shell');
        put('secondary',shell([[-L*.20,W*.09,H*.40,H*.035],[0,W*.155,H*.39,H*.045],[L*.21,W*.09,H*.41,H*.025]],3),'Avionics belly');
        for(const sx of [-1,1])for(const sz of [-1,1]){
            const x=sx*(W*.5-R*.95),z=sz*(L*.5-R*.95),F=CM.frame([x,body,z],[1,0,0],[0,0,-1]);c.motors.push([x,body,z]);
            const a=[sx*W*.10,H*.51,sz*L*.10],b=[x,body-H*.015,z];
            tube('trim',[a,b],H*.038,'Carbon motor booms');tube('metal',[add(a,[0,-H*.027,0]),add(b,[0,-H*.027,0])],H*.012,'Boom lower rails');
            round(c,'trim',F,[[0,-H*.07],[R*.21,-H*.07],[R*.23,H*.018],[R*.16,H*.045],[0,H*.045]],'Brushless motor bodies',48);
            round(c,'metal',F,[[R*.205,-H*.025],[R*.225,-H*.025],[R*.225,H*.010],[R*.205,H*.010],[R*.205,-H*.025]],'Motor cooling collars',48);
            if(r.rotorGuard!=='open'){
                round(c,'paint',F,[[R*.90,-H*.055],[R,-H*.045],[R,H*.048],[R*.94,H*.067],[R*.89,H*.052],[R*.89,-H*.055],[R*.90,-H*.055]],'Rolled rotor ducts',80);
                for(let j=0;j<3;j++){const a=j/3*2*pi;tube('trim',[[x,body-H*.03,z],[x+Math.cos(a)*R*.91,body-H*.03,z+Math.sin(a)*R*.91]],H*.009,'Motor support stators');}
            }
            for(let j=0;j<3;j++){
                const a=j/3*2*pi,blade=new CM.Geo(),n=16,at=(t,v)=>{const rad=R*(.16+.68*t),sweep=.15*t*t,aa=a+sweep+v*(.12-.045*t);return[x+rad*Math.cos(aa),body+H*(.018+v*.022*(1-t*.5)),z+rad*Math.sin(aa)];};
                for(let k=0;k<n;k++){const u=k/n,v=(k+1)/n;blade.poly([at(u,-1),at(v,-1),at(v,1),at(u,1)],null,[0,1,0]);blade.poly([add(at(u,-1),[0,-H*.008,0]),add(at(u,1),[0,-H*.008,0]),add(at(v,1),[0,-H*.008,0]),add(at(v,-1),[0,-H*.008,0])],null,[0,-1,0]);}
                for(const edge of [-1,1])for(let k=0;k<n;k++){const a=at(k/n,edge),b=at((k+1)/n,edge);const aa=j/3*2*pi+.15*((k+.5)/n)**2;blade.poly([a,b,add(b,[0,-H*.008,0]),add(a,[0,-H*.008,0])],null,[-Math.sin(aa)*edge,0,Math.cos(aa)*edge]);}
                for(const t of [0,1]){const a=at(t,-1),b=at(t,1);const aa=j/3*2*pi+.15*t*t;blade.poly([a,b,add(b,[0,-H*.008,0]),add(a,[0,-H*.008,0])],null,[Math.cos(aa)*(t?1:-1),0,Math.sin(aa)*(t?1:-1)]);}
                put('dark',CM.smoothNormals(blade.done(),.7),'Twisted rotor blades');
            }
            if(r.rotorGuard==='cage')for(let j=0;j<3;j++){
                const a=j/3*pi,points=Array.from({length:25},(_,k)=>{const t=k/24*pi,rr=R*.94*Math.cos(t);return[x+Math.cos(a)*rr,body+H*.07+Math.sin(t)*R*.48,z+Math.sin(a)*rr];});tube('metal',points,H*.006,'Rotor safety cages');
            }
            const foot=[x*.82,H*.035,z*.83];tube('trim',[[x,body-H*.06,z],foot],H*.016,'Landing legs');box('rubber',[foot[0],H*.018,foot[2]],[R*.28,H*.036,R*.24],.009,'Landing pads');
        }
        // Two-axis camera yoke, a separate optical barrel and lens elements.
        const lens=[0,H*.28,L*.20],F=CM.frame(lens,[1,0,0],[0,1,0]);
        tube('trim',[[0,H*.43,L*.13],[0,H*.31,L*.13]],H*.032,'Camera yaw mount');
        for(const s of [-1,1])tube('metal',[[s*W*.065,H*.36,L*.12],[s*W*.065,H*.28,L*.14],[s*W*.045,H*.28,L*.20]],H*.012,'Camera gimbal yoke');
        round(c,'trim',F,[[0,-L*.08],[H*.065,-L*.08],[H*.080,-L*.035],[H*.080,.010],[H*.062,.018],[0,.018]],'Camera optical housing',64);
        round(c,'metal',F,[[H*.065,.016],[H*.071,.020],[H*.071,.030],[H*.056,.034],[H*.052,.026],[H*.065,.016]],'Camera lens rim',64);
        round(c,'glass',F,[[0,.028],[H*.054,.028],[H*.054,.031],[0,.031]],'Camera glass',64);
        if(r.details){
            box('trim',[0,H*.672,-L*.04],[W*.15,H*.020,L*.22],.012,'Battery cartridge');
            for(const s of [-1,1])box('metal',[s*W*.066,H*.687,-L*.04],[W*.014,H*.006,L*.12],.003,'Battery latches');
            for(let j=0;j<6;j++)box('dark',[0,H*.690,-L*.09+j*L*.019],[W*.09,H*.003,L*.005],.002,'Avionics cooling slots');
            tube('metal',[[W*.06,H*.63,-L*.17],[W*.06,H*.86,-L*.19]],H*.007,'Telemetry antenna');
        }
        box(r.lights?'glow':'dark',[0,H*.712,L*.01],[W*.036,H*.010,L*.025],.004,'Navigation beacon');
    }
    function limb(c,a,b,width,depth,name,kind='paint'){
        const axis=norm(sub(b,a)),u=[1,0,0],v=norm(cross(axis,u)),len=Math.hypot(...sub(b,a)),profile=[[.12,.68],[.20,1],[.56,.91],[.78,.65],[.83,.48]],sections=profile.map(([t,w])=>[len*t,width*w,0,depth*(.7+.3*w)]),m=shell(sections,5.2,48);
        const turn=p=>add(add(scale(u,p[0]),scale(v,p[1])),scale(axis,p[2]));CM.transform(m,p=>add(a,turn(p)),turn);c.put(kind,m,name);
        // Layered cover plates follow the exact ruled casting surface. Their
        // seam stays seated across changed proportions and articulated axes.
        const cover={...c,patchFacing:v},shape=t=>{let i=0;while(i+1<profile.length-1&&t>profile[i+1][0])i++;const p=profile[i],q=profile[i+1];return mix(p[1],q[1],(t-p[0])/(q[0]-p[0]));};
        const at=(t,angle,offset)=>{const w=shape(t),co=Math.cos(angle),si=Math.sin(angle);return add(add(a,turn([Math.sign(co)*Math.abs(co)**(2/5.2)*width*w,Math.sign(si)*Math.abs(si)**(2/5.2)*depth*(.7+.3*w),len*t])),scale(v,offset));};
        patch(cover,'trim',(u,v)=>at(mix(.24,.74,u),mix(.94,pi-.94,v),.002),name+' seals');
        patch(cover,'secondary',(u,v)=>at(mix(.25,.73,u),mix(.99,pi-.99,v),.005),name+' cover plates');
    }
    function walker(c){
        const {r,W,H,L,put,box,tube,sheet,glazing}=c,hip=H*.43,knee=H*.25,ankle=H*.09,spread=W*.22*r.stance;
        // A turntable waist with a load-bearing spine and a cast hip cradle.
        box('trim',[0,hip,0],[W*.45,H*.065,L*.38],.06,'Hip cradle');
        const waist=CM.frame([0,H*.50,0],[1,0,0],[0,0,-1]);
        round(c,'metal',waist,[[0,-H*.055],[W*.19,-H*.055],[W*.19,-H*.015],[W*.16,0],[W*.16,H*.025],[0,H*.025]],'Waist bearing');
        tube('trim',[[0,H*.51,0],[0,H*.59,0]],W*.105,'Torso load spine');
        for(const s of [-1,1])tube('metal',[[s*W*.09,H*.51,-L*.03],[s*W*.15,H*.60,-L*.06]],H*.014,'Torso stabilizers');
        round(c,'trim',waist,[[W*.16,-H*.011],[W*.18,-H*.011],[W*.18,H*.001],[W*.16,H*.001],[W*.16,-H*.011]],'Waist bearing seal');
        put('paint',shell([[-L*.33,W*.24,H*.70,H*.085],[-L*.23,W*.34,H*.70,H*.14],[L*.10,W*.35,H*.71,H*.14],[L*.29,W*.26,H*.675,H*.070],[L*.33,W*.20,H*.665,H*.060]],5.0,64),'Cast torso housing');
        put('trim',shell([[-L*.29,W*.21,H*.59,H*.025],[L*.17,W*.29,H*.59,H*.035],[L*.28,W*.20,H*.63,H*.025]],3.2),'Torso lower frame');
        const windshield=[[-W*.245,H*.76,L*.292],[W*.245,H*.76,L*.292],[W*.22,H*.87,L*.085],[-W*.22,H*.87,L*.085]];
        put('glass',glazing(windshield,H*.012),'Walker cockpit glass');
        windowFrame(c,windshield,H*.012,'Cockpit',.075);paneRail(c,windshield,H*.012,H*.005,'trim','Cockpit mullion');
        sheet('secondary',[[-W*.27,H*.65,L*.325],[W*.27,H*.65,L*.325],[W*.24,H*.748,L*.31],[-W*.24,H*.748,L*.31]],H*(.008+.013*r.armor),'Sloped chest plate');
        const eye=CM.frame([0,H*.696,L*.35],[1,0,0],[0,1,0]);round(c,'metal',eye,[[H*.025,0],[H*.032,.010],[H*.030,.026],[H*.021,.030],[H*.021,.007],[H*.025,0]],'Survey optic bezel');round(c,r.lights?'glow':'glass',eye,[[0,.021],[H*.020,.021],[H*.020,.024],[0,.024]],'Survey optic');
        for(const s of [-1,1]){
            const a=[s*spread,hip,0],b=[s*spread*1.08,knee,L*.10],d=[s*spread,ankle,-L*.05],shoulder=[s*W*.40,H*.75,0],elbow=[s*W*.44,H*.58,L*.04],hand=[s*W*.43,H*.48,L*.20];
            tube('trim',[a,b,d],H*.023,'Leg load beams');
            limb(c,a,b,W*(.085+.025*r.armor),L*.13,'Tapered thigh armor');limb(c,b,d,W*(.095+.025*r.armor),L*.14,'Tapered shin armor','armor');
            for(const p of [a,b,d]){
                const F=CM.frame([p[0]+s*W*.067,p[1],p[2]],[0,0,-s],[0,1,0]),R=H*.039;
                round(c,'trim',F,[[0,-W*.12],[R,-W*.12],[R,W*.008],[0,W*.008]],'Joint drums');
                round(c,'metal',F,[[R*.76,W*.008],[R*.90,W*.012],[R*.90,W*.025],[R*.70,W*.028],[R*.70,W*.010],[R*.76,W*.008]],'Joint bearing rings');
                round(c,'paint',F,[[0,W*.008],[R*.61,W*.008],[R*.61,W*.023],[0,W*.023]],'Joint end caps');
                if(r.details)for(let j=0;j<6;j++){const a=j/6*2*pi;c.bolt(add(F.o,add(scale(F.u,R*.75*Math.cos(a)),add(scale(F.v,R*.75*Math.sin(a)),scale(F.n,W*.028)))),F.u,F.v);}
            }
            // A separate knee cap and a segmented foot, with a heel and toes.
            const kneeFrame=CM.frame([b[0],b[1],b[2]+L*.16],[1,0,0],[0,1,0]);put('trim',CM.slab(CM.rect(0,0,W*.17,H*.053),kneeFrame,H*.012,.012,true),'Knee cap seals');put('armor',CM.slab(CM.rect(0,0,W*.15,H*.044),{...kneeFrame,o:add(kneeFrame.o,[0,0,H*.013])},H*(.008+.012*r.armor),.012,true),'Knee caps');
            box('trim',[d[0],H*.030,-L*.04],[W*.29,H*.060,L*.40],.05,'Foot soles');
            put('paint',(()=>{const m=shell([[-L*.23,W*.11,H*.072,H*.022],[-L*.09,W*.135,H*.087,H*.040],[L*.12,W*.14,H*.067,H*.024],[L*.20,W*.125,H*.060,H*.015]],3,48);CM.transform(m,p=>add(p,[d[0],0,0]));return m;})(),'Foot instep armor');
            for(let j=0;j<3;j++){const x=d[0]+(j-1)*W*.083;box('metal',[x,H*.047,L*.215],[W*.076,H*.055,L*.14],.020,'Articulated toes');box('trim',[x,H*.022,L*.22],[W*.072,H*.012,L*.12],.004,'Toe pads');}
            tube('metal',[[s*W*.25,H*.75,0],shoulder],H*.030,'Shoulder axle');
            limb(c,shoulder,elbow,W*.10,L*.13,'Upper arm castings');limb(c,elbow,hand,W*.072,L*.10,'Forearm castings','armor');
            put('paint',(()=>{const m=shell([[-L*.23,W*.10,H*.765,H*.040],[-L*.16,W*.16,H*.765,H*.075],[L*.12,W*.15,H*.765,H*.070],[L*.22,W*.09,H*.75,H*.045]],5.2,64);CM.transform(m,p=>add(p,[shoulder[0],0,0]));return m;})(),'Formed shoulder cowls');
            const shoulderFace=CM.frame([shoulder[0],H*.75,L*.223],[1,0,0],[0,1,0]);
            put('trim',CM.slab(CM.rect(0,0,W*.15,H*.062),shoulderFace,H*.003,.013,true),'Shoulder service seals');
            put('secondary',CM.slab(CM.rect(0,0,W*.13,H*.052),{...shoulderFace,o:add(shoulderFace.o,[0,0,H*.004])},H*.004,.012,true),'Shoulder service plates');
            if(r.details)for(const dx of [-1,1])for(const dy of [-1,1])c.bolt([shoulder[0]+dx*W*.043,H*(.75+dy*.016),L*.223+H*.009]);
            for(const p of [elbow,hand]){const F=CM.frame(p,[0,0,-s],[0,1,0]);round(c,'metal',F,[[0,-W*.075],[H*.025,-W*.075],[H*.025,W*.075],[0,W*.075]],'Arm bearings');}
            if(r.tool==='claw'){
                box('trim',hand,[W*.12,H*.04,L*.11],.015,'Claw wrist');
                for(const t of [-1,1]){const p=add(hand,[t*W*.038,-H*.03,L*.025]),q=add(hand,[t*W*.065,-H*.065,L*.09]),tip=add(hand,[t*W*.025,-H*.11,L*.15]);tube('metal',[p,q,tip],H*.010,'Articulated claw fingers');tube('trim',[add(hand,[0,-H*.015,0]),q],H*.008,'Claw actuator rods');}
            }else if(r.tool==='welder'){
                tube('trim',[hand,add(hand,[0,-H*.015,L*.17])],H*.023,'Welding tool');const F=CM.frame(add(hand,[0,-H*.015,L*.17]),[1,0,0],[0,1,0]);round(c,'metal',F,[[H*.024,0],[H*.027,.020],[H*.016,.040],[H*.010,.040],[H*.016,.020],[H*.024,0]],'Welding nozzle');round(c,r.lights?'glow':'dark',F,[[0,.025],[H*.010,.025]],'Welding emitter');
            }
            if(r.details){
                // Flexible service loop joins the torso to the arm housing.
                tube('dark',Array.from({length:33},(_,j)=>{const t=j/32;return[s*mix(W*.25,W*.43,t),H*(.77-.17*t)+Math.sin(pi*t)*H*.045,-L*.12-Math.sin(pi*t)*L*.06];}),H*.009,'Arm service hoses');
                grille(c,CM.frame([s*W*.14,H*.70,-L*.33+H*.0001],[1,0,0],[0,-1,0]),W*.15,H*.10,H*.012,7,'Walker rear cooling grille');
                const base=[s*W*.19,H*.82,-L*.20];tube('metal',[base,add(base,[0,H*.11,-L*.025])],H*.0025,'Walker telemetry aerials');
                box('trim',[s*W*.15,H*.693,L*.346],[W*.12,H*.045,.009],.010,'Chest service recess');for(let j=0;j<3;j++)box('metal',[s*W*.15,H*.693+(j-1)*H*.011,L*.352],[W*.10,H*.003,.006],.002,'Chest cooling slats');
            }
        }
    }
    const api={shell,loft,pressed,filletBox,contour,windowFrame,roadWindows,roadProfile,roadBody,doorSkin,roadDetails,roadFace,section,flight,turbine,round,bike,drone,walker,grille,cabin};root.RRVehicleBodywork=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
