/** Original coachwork and fitted assemblies. Dimensions are in meters; +z is
 * forward. Surfaces are lofted from design sections, rather than rounded boxes.
 * No reference mesh, texture, UV or insignia is included. */
(function(root){
    'use strict';
    const CM=root.RRContainerMesh||(typeof require==='function'?require('./ContainerMesh.js'):null);
    const HW=root.RRVehicleHardware||(typeof require==='function'?require('./VehicleHardware.js'):null),HS=root.RRHardSurface||(typeof require==='function'?require('./HardSurface.js'):null);
    const {add,sub,scale,norm,cross,dot}=CM.vec,pi=Math.PI;
    const mix=(a,b,t)=>a+(b-a)*t;
    // Smooth section interpolation without the overshoot of a cubic spline.
    // Straight between stations: faceted bodies are flat panels between knots.
    function lin(points,z){let i=0;while(i+1<points.length-1&&z>points[i+1][0])i++;const a=points[i],b=points[i+1],t=Math.max(0,Math.min(1,(z-a[0])/(b[0]-a[0])));return mix(a[1],b[1],t);}
    // Fillet half-width of a faceted knot, as a fraction of the half-length.
    const FILLET=.05;
    /** The polyline `lin` averaged over [t-e, t+e]: flat spans stay flat and
     * every kink becomes a smooth quadratic roll of width 2e. */
    function soft(points,t,e){let sum=0;const n=8;for(let i=0;i<n;i++)sum+=lin(points,t-e+(i+.5)/n*2*e);return sum/n;}
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
    function shellRound(sections,exponent,sides){return shell(sections,exponent,sides);}
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
    // `span` [u0,u1]: the frame around only that stretch of the pane (a door's own window, a quarter light),
    // its sides as thick as its top and bottom, on the whole pane's curvature.
    function windowFrame(c,corners,bulge,name='Window aperture',margin=.07,span=null){
        const [a,b,d,e]=corners,normal=norm(cross(sub(b,a),sub(e,a))),thickness=Math.min(c.W*.010,c.H*.016),at=(u,v,depth)=>add(add(scale(add(scale(a,1-u),scale(b,u)),1-v),scale(add(scale(e,1-u),scale(d,u)),v)),scale(normal,bulge*Math.sin(pi*u)*Math.sin(pi*v)+depth));
        const [u0,u1]=span||[0,1],ku=span?Math.hypot(...sub(e,a))/Math.max(1e-6,Math.hypot(...sub(b,a))*(u1-u0)):1,U=x=>u0+(u1-u0)*x;
        // A stretch too short for its frame's sides (they would cross) gets none: the dividers frame it.
        if(span&&ku*(margin+.06)>.42)return normal;
        const loop=(inset,radius,depth)=>{const pts=[],lo=inset,hi=1-inset,lx=inset*ku,hx=1-inset*ku,rx=radius*ku;for(const [x,y,start]of [[hx-rx,lo+radius,-pi/2],[hx-rx,hi-radius,0],[lx+rx,hi-radius,pi/2],[lx+rx,lo+radius,pi]])for(let j=0;j<=6;j++){const t=start+j/6*pi/2;pts.push(at(U(x+rx*Math.cos(t)),y+radius*Math.sin(t),depth));}return pts;};
        const centre=at(U(.5),.5,0);
        const ring=(kind,inner,outer,front,back,label)=>{const g=new CM.Geo(),A=loop(outer,.035,front),B=loop(inner,.045,front),C=loop(outer,.035,back),D=loop(inner,.045,back);
            for(let j=0;j<A.length;j++){const k=(j+1)%A.length;g.poly([A[j],A[k],B[k],B[j]],null,normal);g.poly([C[j],D[j],D[k],C[k]],null,scale(normal,-1));
                const outside=norm(sub(scale(add(A[j],A[k]),.5),centre));g.poly([A[j],C[j],C[k],A[k]],null,outside);g.poly([B[j],B[k],D[k],D[j]],null,scale(outside,-1));}
            c.put(kind,CM.smoothNormals(g.done(),.8),label);
        };
        ring('paint',margin,0,thickness*.45,-thickness*.55,name+' formed surround');
        ring('trim',margin+.012,margin-.006,thickness*.52,0,name+' glazing gasket');
        return normal;
    }
    /** An armored upper hull: the glasshouse quad as opaque wall panels with
     * small, deep-set windows cut in it. us: window spans across (0..1),
     * vs: their common bottom and top (0..1 up the quad). */
    function apertures(c,quad,us,vs,name){
        const [a,b,d,e]=quad,P=(u,v)=>add(scale(add(scale(a,1-u),scale(b,u)),1-v),scale(add(scale(e,1-u),scale(d,u)),v)),W=c.W;
        const n=norm(cross(sub(b,a),sub(e,a))),centre=[0,a[1],(a[2]+d[2])/2],inward=dot(n,sub(centre,P(.5,.5)))>0?n:scale(n,-1),t=Math.max(.02,W*.012);
        const ub=[0,...us.flat(),1],vb=[0,vs[0],vs[1],1];
        for(let i=0;i+1<ub.length;i++)for(let j=0;j+1<vb.length;j++){
            if(ub[i+1]-ub[i]<1e-4)continue;const open=j===1&&us.some(([u0,u1])=>Math.abs(u0-ub[i])<1e-6&&Math.abs(u1-ub[i+1])<1e-6);if(open)continue;
            c.sheet('paint',[P(ub[i],vb[j]),P(ub[i+1],vb[j]),P(ub[i+1],vb[j+1]),P(ub[i],vb[j+1])].map(p=>add(p,scale(inward,t*.5))),t,'Hull upper walls');
        }
        for(const [u0,u1]of us){const q=[P(u0,vs[0]),P(u1,vs[0]),P(u1,vs[1]),P(u0,vs[1])];c.put('glass',c.glazing(q.map(p=>add(p,scale(inward,t*1.6))),0),name+' glass');windowFrame(c,q,0,name,.10);}
    }
    /** Where the door's glass stops ahead (0..1 along the side pane): the
     * hinge line, so the glass swings with the door and never through the pillar. */
    function doorGlassFront(c){const {front,rear,door}=c;return Math.max(doorGlassRear(c),Math.min(1,(door.front-.012-rear)/Math.max(1e-6,front-rear)));}
    function doorGlassRear(c){const {rf,rr,L}=c,z=Math.max(rr+(.12*(rf-rr)),Math.min(rf-.12*(rf-rr),c.door.rear));return (z-rr)/(rf-rr);}
    /** Flat side glass in three panes: the rear quarter, the door's own glass
     * (its own part, "Door left glass" / "Door right glass") and, when the door
     * stops short of the pillar, a fixed front quarter light. */
    function sideGlass(c,p,sign,bulge=0){
        const [a,b,d,e]=p,n=norm(cross(sub(b,a),sub(e,a))),forward=b[2]>a[2],ur=doorGlassRear(c),uf=doorGlassFront(c),U=t=>forward?t:1-t,thick=.006;
        // The whole pane's laminated shape, cut into spans along u: each span keeps the pane's own curvature.
        const at=(u,v,back)=>{const bottom=add(scale(a,1-u),scale(b,u)),top=add(scale(e,1-u),scale(d,u));return add(add(scale(bottom,1-v),scale(top,v)),scale(n,bulge*Math.sin(u*pi)*Math.sin(v*pi)-(back?thick:0)));};
        const span=(u0,u1)=>{const g=new CM.Geo(),su=Math.max(2,Math.round(12*(u1-u0))),sv=12,uu=i=>u0+(u1-u0)*i/su;
            for(let j=0;j<sv;j++)for(let i=0;i<su;i++){const v=j/sv,vv=(j+1)/sv,f=[at(uu(i),v),at(uu(i+1),v),at(uu(i+1),vv),at(uu(i),vv)];let nn=norm(cross(sub(f[1],f[0]),sub(f[3],f[0])));if(dot(nn,n)<0)nn=scale(nn,-1);g.poly(f,null,nn);g.poly([at(uu(i),v,1),at(uu(i),vv,1),at(uu(i+1),vv,1),at(uu(i+1),v,1)],null,scale(nn,-1));}
            const edge=(P,Q,out)=>g.poly([P(false),Q(false),Q(true),P(true)],null,out);
            for(let i=0;i<su;i++){edge(k=>at(uu(i),0,k),k=>at(uu(i+1),0,k),norm(sub(a,e)));edge(k=>at(uu(i+1),1,k),k=>at(uu(i),1,k),norm(sub(e,a)));}
            for(let j=0;j<sv;j++){edge(k=>at(u0,(j+1)/sv,k),k=>at(u0,j/sv,k),norm(sub(a,b)));edge(k=>at(u1,j/sv,k),k=>at(u1,(j+1)/sv,k),norm(sub(b,a)));}
            return CM.smoothNormals(g.done(),.9);};
        const spans=[[0,ur,''],[ur,uf,'door'],[uf,1,'']].filter(([u0,u1])=>u1-u0>.01);
        for(const [u0,u1,kind]of spans){const A=U(u0),B=U(u1);c.put('glass',span(Math.min(A,B),Math.max(A,B)),kind?'Door '+(sign>0?'left':'right')+' glass':undefined);}
    }
    /** Belt-line weatherstrip: a rubber channel from the door's top edge onto
     * the glass, hiding the ledge and shut line between them, so the glass
     * is sealed into the door. The door's length is its own part. */
    function beltSeal(c,sign){
        const {W,H,hood,bw,rw,roofY,front,rear,door,bodyProfile:p,put}=c;if(!p)return;
        const glassX=y=>bw+(rw-bw)*(y-hood)/Math.max(1e-6,roofY-hood),ur=doorGlassRear(c),uf=doorGlassFront(c);
        const z0=rear+.08,z1=front-.04,zr=mix(rear,front,ur),zf=mix(rear,front,uf);
        const run=(a,b,name)=>{
            // Only where there is a ledge to seal: a tapering tail has the glass meeting the flank directly.
            while(a<b&&p.width(a)*.95<bw+.03)a+=.01;while(b>a&&p.width(b)*.95<bw+.03)b-=.01;
            if(b-a<.25)return;const n=Math.max(4,Math.ceil((b-a)/.05)),rings=[];
            for(let i=0;i<=n;i++){
                const z=a+(b-a)*i/n,w=p.width(z),yg=c.surfaceY(bw,z),xg=glassX(yg),xo=Math.max(w*Math.min(.975,(p.faceted?.945:.95)+.018),xg+.014),yo=c.surfaceY(xo,z),t=Math.min(.008,H*.006);
                // A convex section (an ellipse sheared along the ledge): always a simple outline, so the strip and
                // its caps wind one way. Its inner end swallows the glass's foot; its outer end covers the shut line.
                const cx=(xo+xg)/2,hw=(xo-xg)/2+.003,slope=(yo-yg)/Math.max(1e-6,xo-xg),cy=(yo+yg)/2+t*.5;
                rings.push(Array.from({length:12},(_,j)=>{const ang=j/12*2*pi,x=cx+hw*Math.cos(ang);return[sign*x,cy+(x-cx)*slope+t*Math.sin(ang),z];}));
            }
            const g=new CM.Geo(),m=rings[0].length;
            // One winding for the whole strip: the section's turning sense (signed area in x, y) says which side is out.
            let area=0;for(let j=0;j<m;j++){const a=rings[0][j],b=rings[0][(j+1)%m];area+=a[0]*b[1]-b[0]*a[1];}const out=area>0?1:-1;
            for(let i=0;i<n;i++)for(let j=0;j<m;j++){const k=(j+1)%m,q=[rings[i][j],rings[i][k],rings[i+1][k],rings[i+1][j]];if(out<0)q.reverse();g.poly(q,null,norm(cross(sub(q[1],q[0]),sub(q[3],q[0]))));}
            // End caps fanned from the section's centre, one triangle at a time.
            for(const [ring,dir]of [[rings[0],-1],[rings[n],1]]){const ctr=scale(ring.reduce((s,q)=>add(s,q),[0,0,0]),1/m);for(let j=0;j<m;j++){const k=(j+1)%m,t=(dir<0)===(out>0)?[ctr,ring[k],ring[j]]:[ctr,ring[j],ring[k]];g.poly(t,null,[0,0,dir]);}}
            // A closed strip faces out when its signed volume is positive; turned the other way, every face is reversed.
            const mesh=g.done(),P=mesh.positions,I=mesh.index;let vol=0;
            for(let t=0;t<I.length;t+=3){const a=I[t]*3,b=I[t+1]*3,d=I[t+2]*3;vol+=P[a]*(P[b+1]*P[d+2]-P[b+2]*P[d+1])-P[a+1]*(P[b]*P[d+2]-P[b+2]*P[d])+P[a+2]*(P[b]*P[d+1]-P[b+1]*P[d]);}
            if(vol<0){for(let t=0;t<I.length;t+=3){const x=I[t+1];I[t+1]=I[t+2];I[t+2]=x;}for(let k=0;k<mesh.normals.length;k++)mesh.normals[k]=-mesh.normals[k];}
            put('rubber',CM.smoothNormals(mesh,.6),name);
        };
        const side=sign>0?'left':'right';
        run(z0,zr-.004,'Belt weatherstrip');run(zr+.004,Math.min(zf-.004,door.front-.006),'Door '+side+' belt seal');run(zf+.004,z1,'Belt weatherstrip');
    }
    function roadWindows(c){
        const {W,H,hood,front,rear,rf,rr,rw,bw,roofY,r,put,glazing,sheet}=c;
        const lf=[-bw,hood,front],rfb=[bw,hood,front],lft=[-rw,roofY,rf],rft=[rw,roofY,rf],lrb=[-bw,hood,rear],rrb=[bw,hood,rear],lrt=[-rw,roofY,rr],rrt=[rw,roofY,rr];
        const panes=[[lf,rfb,rft,lft],[rrb,lrb,lrt,rrt],[lrb,lf,lft,lrt],[rfb,rrb,rrt,rft]],margin=r.form==='rover'||r.bodyStyle==='armored'?.11:r.form==='sport'?.075:.085;
        const flat=(r.bodyStyle||'rounded')!=='rounded';
        const small=!!(DESIGN[r.form]&&DESIGN[r.form].smallWindows);
        for(let i=0;i<panes.length;i++){const p=panes[i],bulge=flat?0:i===0?W*.025:i<2?0:W*.008;
            if(small&&i>0){apertures(c,p,i===1?[[.34,.66]]:[[.07,.24],[.35,.52],[.69,.87]].map(([a,b])=>i===3?[1-b,1-a]:[a,b]).sort((x,y)=>x[0]-y[0]),i===1?[.42,.84]:[.30,.80],['Windscreen','Rear window','Right window','Left window'][i]);continue;}
            if(i<2){put('glass',glazing(p,bulge));windowFrame(c,p,bulge,['Windscreen','Rear window'][i],margin);continue;}
            // Side panes: the rear quarter, the door's window (glass and frame go with the door) and a front quarter light.
            const sign=i===3?1:-1,side=sign>0?'left':'right',forward=p[1][2]>p[0][2],ur=doorGlassRear(c),uf=doorGlassFront(c);
            sideGlass(c,p,sign,bulge);
            for(const [a0,a1,label]of [[0,ur,['Right window','Left window'][i-2]],[ur,uf,'Door '+side+' window'],[uf,1,['Right window','Left window'][i-2]+' quarter']])if(a1-a0>.01){const A=forward?a0:1-a1,B=forward?a1:1-a0;windowFrame(c,p,bulge,label,margin,[A,B]);}}
        // Armored: slatted guards over the side glass, standing off the frame.
        if(r.bodyStyle==='armored'&&!small)for(const i of [2,3]){const [a,b,d,e]=panes[i],n=norm(cross(sub(b,a),sub(e,a))),out=dot(n,[a[0],0,0])<0?scale(n,-1):n,off=scale(out,W*.022),P=(u,v)=>add(add(scale(add(scale(a,1-u),scale(b,u)),1-v),scale(add(scale(e,1-u),scale(d,u)),v)),off);
            for(const v of [.25,.5,.75])c.tube('trim',[P(.05,v),P(.95,v)],W*.0065,'Window guards');for(const u of [.04,.96]){c.tube('trim',[P(u,.04),P(u,.96)],W*.008,'Window guards');for(const v of [.04,.96])c.tube('trim',[add(P(u,v),scale(out,-W*.02)),P(u,v)],W*.006,'Window guard posts');}}
        for(const sign of [-1,1]){
            const z=Math.max(rr+(.12*(rf-rr)),Math.min(rf-.12*(rf-rr),c.door.rear)),t=(z-rr)/(rf-rr),bottom=[sign*bw,hood,mix(rear,front,t)],top=[sign*rw,roofY,z],half=Math.min(c.L*.022,(front-rear)*.06);
            sheet('paint',[[bottom[0],bottom[1],bottom[2]-half],[bottom[0],bottom[1],bottom[2]+half],[top[0],top[1],top[2]+half],[top[0],top[1],top[2]-half]],W*.014,'Door window divider');
            const F=CM.frame([sign*W*.56,hood+H*.11,front-c.L*.055],[0,0,-sign],[0,1,0]);put('glass',CM.slab(CM.rect(0,0,c.L*.026,H*.052),F,W*.004,.005,true),'Mirror glass');
            const uf=doorGlassFront(c);
            if(uf<.985&&!small){const zb=mix(rear,front,uf),zt=mix(rr,rf,uf);sheet('paint',[[sign*bw,hood,zb-half*.7],[sign*bw,hood,zb+half*.7],[sign*rw,roofY,zt+half*.7],[sign*rw,roofY,zt-half*.7]],W*.014,'Door window divider');}
            if(!small)beltSeal(c,sign);
        }
    }
    /** Road vehicle classes, reverse-engineered from real proportions.
     * Heights are fractions of the recipe height H, stations fractions of
     * the length L; widths/tops (body plan and the line of the bonnet and
     * deck under the glass) are keyed by z/(0.49 L). cab: windscreen base,
     * roof front, roof rear and rear-glass base as fractions of L.
     *   compact: a hatchback city car; wheels at the corners, steep rake,
     *            near-vertical hatch, glass a third of the side.
     *   sport:   a low mid-engine wedge; big wheels, tight arches, a short
     *            cab-forward glasshouse and a long engine deck.
     *   truck:   a pickup; long flat bonnet, a separate cab, a gap, a bed.
     *   rover:   an armored patrol truck (MRAP): tall flat-sided hull on a
     *            V-shaped belly, short sloped bonnet over a big grille, small
     *            deep-set windows, big wheels well outboard. */
    const DESIGN={
        compact:{R:.205,floor:.10,belt:.60,roof:.975,wheelbase:.64,tire:.115,track:.43,cab:[.21,.035,-.36,-.465],bw:.435,rw:.355,
            widths:[[-1,.86],[-.82,.985],[0,1],[.66,.985],[1,.84]],tops:[[-1,-.035],[-.93,0],[.43,0],[.64,-.075],[1,-.175]]},
        sport:{R:.26,floor:.075,belt:.62,roof:.975,wheelbase:.60,tire:.135,track:.44,cab:[.13,-.035,-.17,-.37],bw:.42,rw:.30,
            widths:[[-1,.90],[-.62,1],[-.08,.92],[.55,1],[1,.86]],tops:[[-1,-.03],[-.78,0],[.26,0],[.56,-.03],[.80,-.075],[1,-.17]]},
        truck:{R:.235,floor:.16,belt:.64,roof:.975,wheelbase:.62,tire:.12,track:.435,cab:[.18,.095,-.11,-.135],bw:.445,rw:.405,
            widths:[[-1,.97],[-.92,1],[0,1],[.75,1],[1,.91]],tops:[[-1,0],[.36,0],[.6,-.025],[.92,-.055],[1,-.105]]},
        rover:{R:.21,floor:.17,belt:.68,roof:.975,wheelbase:.60,tire:.16,track:.43,cab:[.225,.17,-.465,-.48],bw:.445,rw:.415,vhull:true,smallWindows:true,
            widths:[[-1,.90],[-.93,.93],[0,.93],[.78,.93],[1,.86]],tops:[[-1,0],[.46,0],[.52,-.035],[1,-.21]]}
    };
    function roadProfile(r,q){
        const {W,H,L}= {W:r.width,H:r.height,L:r.length},D=DESIGN[r.form]||DESIGN.compact,widths=D.widths,tops=D.tops;
        // Faceted panels stay flat between knots, but each knot crease is
        // rolled over a short fillet (a box-filtered polyline), the way a
        // pressed panel turns a corner: no knife edges, no faceted silhouette.
        const faceted=(r.bodyStyle||'rounded')!=='rounded',e=FILLET,interp=faceted?(pts,t)=>soft(pts,t,e):section;
        const width=z=>W*.49*interp(widths,z/(L*.49)),top=z=>q.hood+H*interp(tops,z/(L*.49));
        const crown=[[0,.047],[.35,.045],[.68,.040],[.85,.032],[.95,.017],[.99,-.014],[1,-.10]];
        // Faceted: a flat, slightly peaked deck and a bevelled shoulder.
        const crownF=[[0,.034],[.34,.030],[.70,.019],[.735,.017],[.945,.003],[.955,-.001],[1,-.085]];
        const topFace=(z,f)=>top(z)+H*(faceted?lin(crownF,Math.abs(f)):contour(crown,Math.abs(f)));
        const knots=faceted?[...new Set([...widths,...tops].map(p=>p[0]).flatMap(k=>[k-e,k-e*.5,k,k+e*.5,k+e]))].filter(k=>Math.abs(k)<.999).map(k=>k*L*.49):[];
        return{width,top,topFace,faceted,knots,vhull:!!D.vhull};
    }
    /** Section anchors of a road body at station z, from the floor center up
     * the +x side to the roof center: [x, y, f, tag]. f is the fraction of
     * the station half-width. Rocker and shoulder are character creases;
     * door, bonnet and deck-lid edges are shut-line anchors. */
    function roadAnchors(c,p,z){
        const {H,R,base,axleZ}=c,w=p.width(z),top=p.top(z),reach=R*1.09;
        const opening=Math.max(base,...axleZ.map(a=>Math.abs(z-a)<=reach?R+Math.sqrt(Math.max(0,reach*reach-(z-a)**2)):base));
        // An armored hull's belly is a shallow V up to the chines.
        const vh=p.vhull?base+H*.075:base,low=Math.max(vh,Math.min(opening,top-H*.018)),rocker=Math.max(low,c.door.low),shoulder=Math.max(low,top-H*(p.faceted?.085:.10));
        const belly=p.vhull?[[0,base,'floor'],[.45,base+H*.035,''],[.82,vh,'']]:[[0,base,'floor'],[.80,base,'']];
        if(p.faceted){
            // Two flat flank facets meeting at a waist crease, a bevelled
            // shoulder and a flat deck: every corner is a crease.
            const out=[...belly,[.905,low,'crease'],[.94,rocker,'rocker'],[.975,mix(rocker,shoulder,.40),'crease'],[1,shoulder,'crease']];
            for(const f of [.955,.945,.85,.735,.70,.48,.34,.20,0])out.push([f,Math.max(low,p.topFace(z,f)),f===.955?'crease':f===.945?'doorTop':f===.735?'hood':f===.70?'deck':f===.34?'press':'']);
            return out.map(([f,y,tag])=>[f*w,y,f,tag]);
        }
        const out=[...belly,[.905,low,'crease'],[.94,rocker,'rocker']];
        // A slightly hollow flank: the panel leans out to a crisp shoulder line.
        for(const t of [1/3,2/3])out.push([.94+.06*t**1.3,mix(rocker,shoulder,t),'']);
        out.push([1,shoulder,'crease']);
        for(const f of [.996,.99,.975,.95,.92,.885,.85,.80,.735,.70,.60,.48,.34,.20,.10,0])out.push([f,Math.max(low,p.topFace(z,f)),f===.95?'doorTop':f===.735?'hood':f===.70?'deck':f===.34?'press':'']);
        return out.map(([f,y,tag])=>[f*w,y,f,tag]);
    }
    /** Shut-line and pressing anchors receive two neighbours at a fixed arc
     * distance, so every groove has the same width along a curved section. */
    function withNeighbours(points,gap){
        const out=[];
        for(let k=0;k<points.length;k++){
            const q=points[k],g=gap[q[3]];
            if(!g||k===0||k===points.length-1){out.push(q);continue;}
            const a=points[k-1],b=points[k+1],la=Math.hypot(q[0]-a[0],q[1]-a[1])||1,lb=Math.hypot(b[0]-q[0],b[1]-q[1])||1,ta=Math.min(g,la*.4)/la,tb=Math.min(g,lb*.4)/lb;
            out.push([mix(q[0],a[0],ta),mix(q[1],a[1],ta),mix(q[2],a[2],ta),q[3]+'-'],q,[mix(q[0],b[0],tb),mix(q[1],b[1],tb),mix(q[2],b[2],tb),q[3]+'+']);
        }
        return out;
    }
    /** A split normal under 8 degrees reads as banding, not a crease: weld it. */
    function weldFaint(mesh){
        const P=mesh.positions,N=mesh.normals,groups=new Map();
        for(let i=0;i<P.length/3;i++){const k=Math.round(P[i*3]*1e5)+','+Math.round(P[i*3+1]*1e5)+','+Math.round(P[i*3+2]*1e5);let g=groups.get(k);if(!g)groups.set(k,g=[]);g.push(i);}
        const cos=Math.cos(8*pi/180);
        for(const g of groups.values()){if(g.length<2)continue;let close=true,sum=[0,0,0];for(const a of g){for(const b of g)if(N[a*3]*N[b*3]+N[a*3+1]*N[b*3+1]+N[a*3+2]*N[b*3+2]<cos){close=false;break;}if(!close)break;for(let k=0;k<3;k++)sum[k]+=N[a*3+k];}
            if(!close)continue;const n=norm(sum);for(const a of g)for(let k=0;k<3;k++)N[a*3+k]=n[k];}
        return mesh;
    }
    /** Lofted coachwork with creases, shut-line grooves and fitted panels.
     * One continuous surface; quads inside the door and bonnet outlines
     * become their own parts, meeting the shell in a shallow V groove. */
    function roadBody(c){
        const {r,W,H,L,R,base,hood,axleZ,put,door}=c,p=roadProfile(r,c);
        const gap=Math.max(.0035,W*.0028),depth=Math.max(.003,W*.0022),rise=Math.min(H*.004,W*.003),press=W*.012;
        const cabinRear=c.cabinZ-c.cabinL*.5,cabinFront=c.cabinZ+c.cabinL*.5;
        const z0=Math.min(L*.43,cabinFront+L*.06),z1=L*.472,deck=['compact','sport','rover'].includes(r.form)&&cabinRear-L*.06>-L*.468+L*.05?[-L*.468,cabinRear-L*.06]:null;
        // A pickup's bed is its own box behind the cab: a gap, real depth over the axle.
        const bed=r.form==='truck'?{rear:-L*.474,front:cabinRear-L*.03,fade:L*.008,floor:Math.max(hood-H*.24,2*R+H*.02),gap:cabinRear-L*.012}:null;
        c.cabinFloor=Math.max(base+H*.035,hood-H*.16);c.panels={z0,z1,deck,bed,gap,depth};const seating=roadSeating(c);
        // Stations: even spacing, arch refinements, square arch legs and
        // the exact door/bonnet/deck shut lines with their groove shoulders.
        const features=[],tag=new Map(),mark=(z,t)=>{features.push(z);tag.set(z,t);};
        for(const [z,t]of [[door.rear,'doorR'],[door.front,'doorF'],[z0,'hood0'],[z1,'hood1'],...(deck?[[deck[0],'deck0'],[deck[1],'deck1']]:[])]){mark(z,t);mark(z-gap,t+'-');mark(z+gap,t+'+');}
        for(const a of axleZ)for(const s of [-1,1]){const z=a+s*(R*1.09+.002);if(Math.abs(z)<L*.49)mark(z,'');}
        if(seating.low<seating.high){const e=Math.min(.10,(seating.z1-seating.z0)/4);for(const z of [seating.z0,seating.z0+e*.5,seating.z0+e,seating.z1-e,seating.z1-e*.5,seating.z1])mark(z,'');}
        if(bed){for(const z of [bed.rear,bed.rear+bed.fade,bed.front-bed.fade,bed.front])mark(z,'');for(const z of [bed.gap-.022,bed.gap+.022])mark(z,'gap');}
        for(const z of p.knots)if(features.every(f=>Math.abs(f-z)>gap*3)){features.push(z);tag.set(z,'knot');}
        const nLoose=p.faceted?33:57,loose=[...Array.from({length:nLoose},(_,i)=>-L*.49+L*.98*i/(nLoose-1))];
        for(const a of axleZ)for(let i=-12;i<=12;i++){const z=a+i/12*R*1.09;if(Math.abs(z)<L*.49)loose.push(z);}
        const Z=[...new Set([...features,...loose.filter(z=>(Math.abs(z)>=L*.49-1e-9||features.every(f=>Math.abs(f-z)>gap*1.6)))])].sort((a,b)=>a-b);
        const neighbourGap={rocker:gap,doorTop:gap,hood:gap,deck:gap,press};
        const rings=[],cols=[];
        for(const z of Z){
            const half=withNeighbours(roadAnchors(c,p,z),neighbourGap),top=p.top(z);
            const fade=Math.min(1,Math.max(0,(z-cabinRear)/(L*.045)),Math.max(0,(cabinFront-z)/(L*.045))),cabin=r.interior?fade*fade*(3-2*fade):0;
            const tub=bed?Math.min(1,Math.max(0,(z-bed.rear)/bed.fade),Math.max(0,(bed.front-z)/bed.fade)):0;
            const lift=(f,y)=>{if(!(y>top-H*.03&&f<=.85))return y;if(tub)return y+(bed.floor-y)*tub;return y+(floorAt(seating,z)-y)*cabin;};
            const full=half.concat(half.slice(1,-1).reverse().map(([x,y,f,t])=>[-x,y,f,t]));
            if(!cols.length)for(let j=0;j<full.length;j++)cols.push(full[j][3]);
            rings.push(full.map(([x,y,f])=>[x,lift(f,y),z]));
        }
        const n=rings.length,m=cols.length,half=(m+2)/2,mirror=j=>(m-j)%m;
        const colOf=t=>cols.indexOf(t),rowOf=t=>Z.findIndex(z=>tag.get(z)===t);
        // Smooth reference normals, before any groove is pressed in.
        const N0=rings.map((ring,i)=>ring.map((_,j)=>norm(cross(sub(ring[(j+1)%m],ring[(j+m-1)%m]),sub(rings[Math.min(n-1,i+1)][j],rings[Math.max(0,i-1)][j])))));
        const shift=rings.map(ring=>ring.map(()=>0)),creaseI=rings.map(ring=>ring.map(()=>false)),creaseJ=rings.map(ring=>ring.map(()=>false));
        // Character lines split their normals only where the section really
        // bends (10 degrees or more); a fading crease melts into the surface.
        for(let i=0;i<n;i++)for(let j=0;j<m;j++)if(cols[j]==='crease'||cols[j]==='rocker'){const a=norm(sub(rings[i][j],rings[i][(j+m-1)%m])),b=norm(sub(rings[i][(j+1)%m],rings[i][j]));if(dot(a,b)<Math.cos(pi/18))creaseJ[i][j]=true;}
        // The cab and the bed meet at a recessed vertical gap.
        for(let i=1;i+1<n;i++)if(tag.get(Z[i])==='gap')for(let j=0;j<m;j++){shift[i][j]=-Math.max(.03,W*.016);creaseI[i][j]=creaseI[i-1][j]=creaseI[i+1][j]=true;}
        // Faceted bodies fold across the knot stations too.
        for(let i=1;i+1<n;i++)if(tag.get(Z[i])==='knot')for(let j=0;j<m;j++){const tu=sub(rings[i][(j+1)%m],rings[i][(j+m-1)%m]),n1=norm(cross(tu,sub(rings[i][j],rings[i-1][j]))),n2=norm(cross(tu,sub(rings[i+1][j],rings[i][j])));if(dot(n1,n2)<Math.cos(pi/20))creaseI[i][j]=true;}
        const lines=[];
        // A rectangle of shut lines: two station lines and two section lines.
        const outline=(i0,i1,j0,j1)=>{
            if(i0<0||i1<0||i1<=i0)return;
            for(const i of [i0,i1])for(let j=j0;j<=j1;j++){shift[i][j]=-depth;creaseI[i][j]=true;for(const d of [-1,1])creaseI[i+d][j]=true;}
            for(const j of [j0,j1])for(let i=i0;i<=i1;i++){shift[i][j]=-depth;creaseJ[i][j]=true;for(const d of [-1,1])creaseJ[i][(j+d+m)%m]=true;}
            for(const i of [i0,i1])for(let j=j0;j<j1;j++)lines.push([[i,j],[i,j+1],'i']);
            for(const j of [j0,j1])for(let i=i0;i<i1;i++)lines.push([[i,j],[i+1,j],'j']);
        };
        const dR=rowOf('doorR'),dF=rowOf('doorF'),rock=colOf('rocker'),doorTop=colOf('doorTop');
        outline(dR,dF,rock,doorTop);outline(dR,dF,mirror(doorTop),mirror(rock));
        const h0=rowOf('hood0'),h1=rowOf('hood1'),hoodCol=colOf('hood');outline(h0,h1,hoodCol,mirror(hoodCol));
        if(deck){const d0=rowOf('deck0'),d1=rowOf('deck1'),deckCol=colOf('deck');outline(d0,d1,deckCol,mirror(deckCol));}
        // Two long bonnet pressings rise from the panel and fade at its ends.
        for(const j of [colOf('press'),mirror(colOf('press'))])for(let i=h0+2;i<=h1-2;i++){const t=(Z[i]-z0)/(z1-z0),ease=Math.min(1,t/.12,(1-t)/.12);shift[i][j]=rise*ease*ease*(3-2*ease);creaseJ[i][j]=true;}
        const P=rings.map((ring,i)=>ring.map((v,j)=>add(v,scale(N0[i][j],shift[i][j]))));
        const inDoor=(i,j)=>i>=dR&&i<dF&&((j>=rock&&j<doorTop)||(j>=mirror(doorTop)&&j<mirror(rock)));
        const inHood=(i,j)=>i>=h0&&i<h1&&j>=hoodCol&&j<mirror(hoodCol);
        const shellGeo=new CM.Geo(),doorGeo=new CM.Geo(),hoodGeo=new CM.Geo();
        const normal=(i,a,j,b)=>{
            const tu=creaseJ[a][b]?sub(P[a][(j+1)%m],P[a][j]):sub(P[a][(b+1)%m],P[a][(b+m-1)%m]);
            const tv=creaseI[a][b]?sub(P[i+1][b],P[i][b]):sub(P[Math.min(n-1,a+1)][b],P[Math.max(0,a-1)][b]);
            return norm(cross(tu,tv));
        };
        for(let i=0;i+1<n;i++)for(let j=0;j<m;j++){
            const k=(j+1)%m,g=inDoor(i,j)?doorGeo:inHood(i,j)?hoodGeo:shellGeo,ids=[[i,j],[i,k],[i+1,k],[i+1,j]].map(([a,b])=>g.vert(P[a][b],normal(i,a,j,b)));
            g.I.push(ids[0],ids[1],ids[2],ids[0],ids[2],ids[3]);
        }
        shellGeo.poly(P[0],null,[0,0,-1]);shellGeo.poly(P[n-1],null,[0,0,1]);
        put('paint',weldFaint(shellGeo.done()),'Sculpted body shell');put('paint',doorGeo.done(),'Access door');put('paint',hoodGeo.done(),'Formed bonnet panel');
        // A dark strip in the floor of each groove reads as the panel gap.
        const gaps=new CM.Geo();
        for(const [[ia,ja],[ib,jb],dir]of lines){
            const across=(i,j)=>norm(dir==='i'?sub(rings[i+1][j],rings[i-1][j]):sub(rings[i][(j+1)%m],rings[i][(j+m-1)%m]));
            const at=(i,j,s)=>add(add(P[i][j],scale(N0[i][j],depth*.42)),scale(across(i,j),s*gap*.36));
            gaps.poly([at(ia,ja,-1),at(ib,jb,-1),at(ib,jb,1),at(ia,ja,1)],null,scale(add(N0[ia][ja],N0[ib][jb]),.5));
        }
        put('dark',gaps.done(),'Panel shut lines');
        c.bodyProfile=p;
        // Height of the painted top surface (bonnet, deck, roof line) at x, z, for parts seated on it.
        c.surfaceY=(x,z)=>p.topFace(z,Math.min(1,Math.abs(x)/Math.max(1e-6,p.width(z))));
        // Surface x of the +x flank at a station and height, for fittings.
        c.sideAt=(z,y)=>{const pts=roadAnchors(c,p,z);for(let k=2;k+1<pts.length;k++){const a=pts[k],b=pts[k+1];if(y<=b[1]||b[3]==='doorTop'){if(y<=a[1])return a[0];const t=(y-a[1])/Math.max(1e-9,b[1]-a[1]);return mix(a[0],b[0],Math.min(1,t));}}return pts[2][0];};
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
    function paneRail(c,corners,bulge,radius,kind,name){
        const [a,b,d,e]=corners,n=norm(cross(sub(b,a),sub(e,a))),points=[];
        for(let j=0;j<=32;j++){const t=j/32,bottom=scale(add(a,b),.5),top=scale(add(e,d),.5);points.push(add(add(scale(bottom,1-t),scale(top,t)),scale(n,bulge*Math.sin(pi*t)+radius*.7)));}
        c.tube(kind,points,radius,name);
    }
    /** Where people sit in a road cab: the front row a leg's length behind
     * the windscreen base over a footwell sunk between the wheel wells, and
     * a raised second row for hatch and rover bodies. Shared by the body
     * shell (its floor) and the cabin fit-out. Meters, +z forward. */
    function roadSeating(c){
        if(c.seating)return c.seating;
        const {r,H,R,base,hood,axleZ}=c,front=c.cabinZ+c.cabinL*.5,rear=c.cabinZ-c.cabinL*.5,high=Math.max(base+H*.035,hood-H*.16);
        const hip=front-Math.min(1.05,c.cabinL*.40);
        let z0=Math.max(rear+.05,hip-.62),z1=front-.04;
        for(const a of axleZ){if(a<hip)z0=Math.max(z0,a+R*1.22);else z1=Math.min(z1,a-R*1.22);}
        const want=Math.min(high,Math.max(base+H*.05,hood-.62)),sunk=r.interior&&z1-z0>.35&&high-want>.04;
        const second=r.form==='compact'&&hip-1.12>rear?hip-.80:null;
        return c.seating={front,rear,hip,second,high,low:sunk?want:high,z0,z1};
    }
    function floorAt(s,z){if(s.low>=s.high)return s.high;const e=Math.min(.10,(s.z1-s.z0)/4),t=Math.min(1,Math.max(0,(z-s.z0)/e),Math.max(0,(s.z1-z)/e)),u=t*t*(3-2*t);return s.high+(s.low-s.high)*u;}
    /** Road cab fit-out: shaped seats, a dash with instruments, a raked
     * steering wheel, pedals and a centre console. Returns the seat block
     * (driver first) in the runtime's `vehicle.seats` form. */
    function cabin(c){
        const {r,W,H,L,hood,roofY,front,bw,put,tube}=c;if(!r.interior)return null;const rise=roofY-hood,width=bw*2,box=(kind,center,size,bevel,name)=>put(kind,CM.roundedBox(center,size,bevel,2),name);
        const S=roadSeating(c),low=S.low,hipZ=S.hip;
        // Floor: a mat over the sunk footwell and the raised rear deck.
        const fl=new CM.Geo(),steps=24,fz0=S.rear+.04,fz1=front-.05,hwF=width*.45;
        for(let i=0;i<steps;i++){const a=fz0+(fz1-fz0)*i/steps,b=fz0+(fz1-fz0)*(i+1)/steps,ya=floorAt(S,a)+.006,yb=floorAt(S,b)+.006;fl.poly([[-hwF,ya,a],[hwF,ya,a],[hwF,yb,b],[-hwF,yb,b]],null,[0,1,0]);}
        put('dark',solidify(fl.done(),.012),'Cabin floor');
        const k=Math.max(.6,Math.min(1,(roofY-low-.05)/1.17,width/1.45)),hipY=low+.27*k,driverX=width*.23,seats=[];
        for(const sign of [-1,1]){const at=[sign*driverX,hipY,hipZ];seatUnit(c,at,{k,width:.52,floor:floorAt(S,hipZ),recline:.36});if(sign>0)seats.unshift({posture:'seated',seat:{at}});else seats.push({posture:'seated',seat:{at}});}
        if(S.second!=null){
            const z=S.second,y=Math.max(floorAt(S,z)+.10*k,low+.27*k),k2=Math.max(.55,Math.min(k,(roofY-y-.04)/.90));
            for(const sign of [-1,1]){const at=[sign*width*.25,y,z];seatUnit(c,at,{k:k2,width:.52,floor:floorAt(S,z),recline:.30});seats.push({posture:'seated',seat:{at}});}
        }
        if(r.form==='rover'){
            // Troop bay: inward-facing seats along both walls behind the cab.
            const kb=Math.max(.6,Math.min(1,(roofY-S.high-.45)/.85));
            // One padded bench per wall (a seat place every 0.62 m), not a row of separate chairs.
            const zs=[];for(let z=hipZ-.95*kb;z>S.rear+.40*kb;z-=.62*kb)zs.push(z);
            if(zs.length)for(const sign of [-1,1]){const mid=(zs[0]+zs.at(-1))/2,y=S.high+.42*kb,len=zs[0]-zs.at(-1)+.56*kb,at=[sign*(width*.45-.24*kb),y,mid];
                seatUnit(c,at,{k:kb,width:len/kb,floor:S.high,recline:.12,yaw:-sign*pi/2,headrest:false});
                for(const z of zs)seats.push({posture:'seated',seat:{at:[at[0],y,z]}});}
        }
        // Wheel: raked toward the driver, a forearm ahead of the chest.
        const R=Math.min(.19*k,width*.12),wheel=[driverX,hipY+.36*k,Math.min(hipZ+.50*k,front-.30)],F=CM.frame(wheel,[1,0,0],[0,-.88,-.475]);
        put('rubber',CM.revolveOn(F,0,0,[[R*.86,-R*.07],[R,-R*.07],[R*1.02,0],[R,R*.07],[R*.86,R*.07],[R*.84,0],[R*.86,-R*.07]],40),'Cabin steering wheel');
        // Hub and spokes belong to the wheel part, so the whole wheel turns with the steer control.
        put('rubber',CM.revolveOn(F,0,0,[[0,-R*.05],[R*.24,-R*.05],[R*.24,R*.06],[0,R*.06]],24),'Cabin steering wheel');
        for(let j=0;j<3;j++){const a=j/3*Math.PI*2+Math.PI/2;const p=add(F.o,add(scale(F.u,Math.cos(a)*R*.85),scale(F.v,Math.sin(a)*R*.85)));put('rubber',CM.sweep([F.o,p],R*.045,12,true),'Cabin steering wheel');}
        // Dash: from the windscreen base back to just ahead of the wheel.
        // Upper dash slab with a knee cavity below; a centre stack carries it down to the console.
        const dashRear=wheel[2]+.10*k,dashTop=Math.min(hood+rise*.16,roofY-.25),dashH=Math.min(.20*k,dashTop-hipY),dashY=dashTop-dashH/2;
        box('trim',[0,dashY,(dashRear+front-.03)/2],[width*.94,Math.max(.06,dashH),Math.max(.10,front-.03-dashRear)],Math.min(.04,dashH*.3),'Dashboard housing');
        box('trim',[0,(hipY+.10*k+dashTop-dashH)/2,dashRear+.10],[.26*k,Math.max(.04,dashTop-dashH-hipY-.10*k),.16],.025,'Dashboard housing');
        box('dark',[0,dashTop+.004,front-.10],[width*.80,.008,.08],.003,'Defroster grille');
        tube('dark',[[driverX,dashY,dashRear+.04],wheel],R*.10,'Steering column');
        const instruments=CM.frame([driverX,dashTop-.06*k,dashRear-.002],[1,0,0],[0,.95,-.312]);
        put('dark',CM.slab(CM.rect(0,0,R*1.6,.09*k),instruments,.005,.002,true),'Instrument binnacle');
        for(const sign of [-1,1]){
            const frame={...instruments,o:add(instruments.o,add(scale(instruments.u,sign*R*.42),scale(instruments.n,.006)))},radius=.035*k;
            put('metal',CM.revolveOn(frame,0,0,[[radius*.88,0],[radius,0],[radius,.002],[radius*.88,.002],[radius*.88,0]],32),'Instrument dial bezels');
            put(r.lights?'light':'glass',CM.revolveOn(frame,0,0,[[0,.001],[radius*.85,.001],[radius*.85,.002],[0,.002]],32),'Instrument faces');
            tube('dark',[frame.o,add(frame.o,add(scale(frame.u,radius*.50),scale(frame.v,radius*.25)))],Math.max(.0008,radius*.04),'Instrument needles');
        }
        box('dark',[0,dashTop-.07*k,dashRear-.004],[width*.16,.11*k,.008],.003,'Center dashboard display');
        for(let j=0;j<3;j++)box(r.lights?'glow':'metal',[0,dashTop-.10*k+j*.026*k,dashRear-.010],[width*.12,.008,.002],.0004,'Dashboard status strips');
        // Console between the front seats, with a selector; pedals in the footwell.
        const conL=Math.max(.2,dashRear+.10-hipZ);put('trim',standing(CM.roundedBox([0,(floorAt(S,hipZ)+hipY+.10*k)/2,hipZ+conL/2-.15],[.16*k,hipY+.10*k-floorAt(S,hipZ),conL],.03,2)),'Center console');
        tube('metal',[[0,hipY+.10*k,hipZ+.25*k],[0,hipY+.20*k,hipZ+.23*k]],.008,'Gear selector');box('accent',[0,hipY+.21*k,hipZ+.23*k],[.035,.035,.04],.012,'Gear selector knob');
        const pedalZ=Math.min(hipZ+.85*k,front-.12),pedalY=floorAt(S,pedalZ)+.09*k,feet=[];
        for(const [dx,w]of [[-.09,.06],[.07,.09]]){box('metal',[driverX+dx*k,pedalY,pedalZ],[w*k,.07*k,.015],.004,'Pedals');tube('dark',[[driverX+dx*k,pedalY+.03*k,pedalZ],[driverX+dx*k,dashY,pedalZ+.08]],.006,'Pedal arms');feet.push([driverX+dx*k,pedalY,pedalZ-.03]);}
        const hand=s=>add(F.o,scale(F.u,s*R*.92));
        Object.assign(seats[0],{handL:{at:hand(1)},handR:{at:hand(-1)},footL:{at:feet[1]},footR:{at:feet[0]}});
        const axis=norm(cross(F.u,F.v));
        return{seats,controls:[{input:'steer',shape:'wheel',part:'Cabin steering wheel',at:wheel.slice(),axis:axis[1]<0?scale(axis,-1):axis,degrees:90,degreesAtSpeed:90}]};
    }
    /** A one-sided sheet made into a closed thin plate: a back face `t`
     * behind every face, and strips along the sheet's open edges, so it
     * holds from behind and has a real volume. */
    function solidify(mesh,t){
        const P=mesh.positions,N=mesh.normals,I=mesh.index,key=i=>Math.round(P[i*3]*1e5)+','+Math.round(P[i*3+1]*1e5)+','+Math.round(P[i*3+2]*1e5),edges=new Map(),g=new CM.Geo();
        const at=i=>[P[i*3],P[i*3+1],P[i*3+2]],back=i=>sub(at(i),scale([N[i*3],N[i*3+1],N[i*3+2]],t));
        for(let k=0;k<I.length;k+=3){const ids=[I[k],I[k+1],I[k+2]],n=norm(cross(sub(at(ids[1]),at(ids[0])),sub(at(ids[2]),at(ids[0]))));
            g.poly(ids.map(at),null,n);g.poly(ids.map(back),null,scale(n,-1));
            for(let e=0;e<3;e++){const a=ids[e],b=ids[(e+1)%3],ka=key(a),kb=key(b),id=ka<kb?ka+'|'+kb:kb+'|'+ka,list=edges.get(id);if(list)list.push([a,b,n]);else edges.set(id,[[a,b,n]]);}}
        for(const list of edges.values())if(list.length===1){const [a,b,n]=list[0],out=norm(cross(sub(at(b),at(a)),n));g.poly([at(a),at(b),back(b),back(a)],null,out);}
        return CM.smoothNormals(g.done(),.9);
    }
    /** A skin with a hole cut in it, given a back skin `t` behind and a
     * rim round the hole's edge, so the cut reads as a panel of real
     * thickness from inside. The front faces keep their own normals. */
    function backed(mesh,t){
        const P=mesh.positions,N=mesh.normals,I=mesh.index,key=i=>Math.round(P[i*3]*1e5)+','+Math.round(P[i*3+1]*1e5)+','+Math.round(P[i*3+2]*1e5),edges=new Map(),g=new CM.Geo();
        const at=i=>[P[i*3],P[i*3+1],P[i*3+2]],back=i=>sub(at(i),scale([N[i*3],N[i*3+1],N[i*3+2]],t));
        for(let k=0;k<I.length;k+=3){const ids=[I[k],I[k+1],I[k+2]],n=norm(cross(sub(at(ids[1]),at(ids[0])),sub(at(ids[2]),at(ids[0]))));if(!n.every(Number.isFinite))continue;
            g.poly(ids.map(back),null,scale(n,-1));
            for(let e=0;e<3;e++){const a=ids[e],b=ids[(e+1)%3],ka=key(a),kb=key(b),id=ka<kb?ka+'|'+kb:kb+'|'+ka,list=edges.get(id);if(list)list.push([a,b,n]);else edges.set(id,[[a,b,n]]);}}
        for(const list of edges.values())if(list.length===1){const [a,b,n]=list[0],out=norm(cross(sub(at(b),at(a)),n));g.poly([at(a),at(b),back(b),back(a)],null,out);}
        const m=CM.merge([mesh,g.done()]);return{positions:m.positions,normals:m.normals,uvs:m.uvs,index:m.index};
    }
    /** Drops the downward faces at a mesh's lowest level: the hidden
     * underside of a box that stands on a floor. */
    function standing(mesh){
        const P=mesh.positions,I=mesh.index;let low=Infinity;for(let i=1;i<P.length;i+=3)low=Math.min(low,P[i]);const out=[];
        for(let k=0;k<I.length;k+=3){const a=I[k]*3,b=I[k+1]*3,c=I[k+2]*3;if(Math.max(P[a+1],P[b+1],P[c+1])<low+.004){const e1=[P[b]-P[a],P[b+1]-P[a+1],P[b+2]-P[a+2]],e2=[P[c]-P[a],P[c+1]-P[a+1],P[c+2]-P[a+2]],ny=e1[2]*e2[0]-e1[0]*e2[2];if(ny<0)continue;}out.push(I[k],I[k+1],I[k+2]);}
        mesh.index=Uint32Array.from(out);return mesh;
    }
    /** A shaped seat for one person, built facing +z round its hip point
     * (the top of the cushion under the rider's hip), then turned by `yaw`
     * about y and moved to `at`. Human sized in meters; `k` scales it to a
     * cramped cabin. Cushion and backrest carry side bolsters; the back
     * leans by `recline` radians. Returns where the rider's hip sits. */
    function seatUnit(c,at,o={}){
        const {put,tube}=c,k=o.k??1,w=(o.width??.50)*k,floor=o.floor,yaw=o.yaw||0,recline=o.recline??.30,back=(o.back??.60)*k,list=[],trims=[],metal=[];
        const rb=(center,size,radius)=>CM.roundedBox(center,size,Math.min(radius,...size.map(v=>v*.45)),2);
        const tilt=(m,pivot,a)=>CM.transform(m,p=>{const d=sub(p,pivot);return add(pivot,[d[0],d[1]*Math.cos(a)-d[2]*Math.sin(a),d[1]*Math.sin(a)+d[2]*Math.cos(a)]);},n=>[n[0],n[1]*Math.cos(a)-n[2]*Math.sin(a),n[1]*Math.sin(a)+n[2]*Math.cos(a)]);
        const depth=.46*k,cushion=.10*k;
        // Cushion: a centre pad between raised side bolsters, nose tipped up.
        const pad=rb([0,-cushion/2,depth*.42],[w*.70,cushion,depth],.035*k);tilt(pad,[0,0,-.05*k],-.07);list.push(pad);
        for(const s of [-1,1]){const b=rb([s*w*.41,-cushion*.36,depth*.40],[w*.19,cushion*1.28,depth*.96],.045*k);tilt(b,[0,0,-.05*k],-.07);list.push(b);}
        // Backrest: lumbar pad between wing bolsters, leaning back from the hip.
        const pivot=[0,-.02*k,-.06*k],lean=m=>tilt(m,pivot,-recline);
        list.push(lean(rb([0,back*.48,-.11*k],[w*.70,back*.92,.09*k],.035*k)));
        for(const s of [-1,1])list.push(lean(rb([s*w*.41,back*.44,-.085*k],[w*.19,back*.88,.15*k],.05*k)));
        if(o.headrest!==false){list.push(lean(rb([0,back+.12*k,-.12*k],[w*.52,.18*k,.09*k],.04*k)));for(const s of [-1,1])metal.push(lean(CM.sweep([[s*w*.15,back*.90,-.12*k],[s*w*.15,back+.05*k,-.12*k]],.008*k,8,true)));}
        // Pedestal or bench frame down to the floor.
        if(floor!=null){const drop=Math.max(.02,at[1]-cushion-floor);trims.push(standing(rb([0,-cushion-drop/2,depth*.36],[w*.62,drop,depth*.70],.02*k)));}
        const place=m=>CM.transform(m,p=>[at[0]+p[0]*Math.cos(yaw)+p[2]*Math.sin(yaw),at[1]+p[1],at[2]-p[0]*Math.sin(yaw)+p[2]*Math.cos(yaw)],n=>[n[0]*Math.cos(yaw)+n[2]*Math.sin(yaw),n[1],-n[0]*Math.sin(yaw)+n[2]*Math.cos(yaw)]);
        put('seat',place(CM.merge(list)),'Cabin seat upholstery');
        if(trims.length)put('trim',place(CM.merge(trims)),'Seat frames');
        if(metal.length)put('metal',place(CM.merge(metal)),'Headrest posts');
        return at;
    }
    /** A plan outline in the turning sense openSkin() expects. */
    function ccw(poly){let a=0;for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];a+=p[0]*q[1]-q[0]*p[1];}return a<0?poly.slice().reverse():poly;}
    /** Cuts a hole in a skin: the part of every face above `minY` that
     * lies inside the convex plan outline `region` ([[x, z], ...],
     * counter-clockwise seen from above) is removed. Faces are clipped
     * exactly along the outline, so neighbours share their cut points and
     * the skin stays watertight round the hole. In place. */
    function openSkin(mesh,region,minY){
        const P=Array.from(mesh.positions),N=Array.from(mesh.normals),I=mesh.index,out=[];
        const lo=[Math.min(...region.map(q=>q[0])),Math.min(...region.map(q=>q[1]))],hi=[Math.max(...region.map(q=>q[0])),Math.max(...region.map(q=>q[1]))];
        const vert=i=>({p:[P[i*3],P[i*3+1],P[i*3+2]],n:[N[i*3],N[i*3+1],N[i*3+2]],i});
        const side=(a,b,v)=>(b[0]-a[0])*(v.p[2]-a[1])-(b[1]-a[1])*(v.p[0]-a[0]);
        const cut=(poly,a,b,keepInside)=>{const res=[];for(let j=0;j<poly.length;j++){const u=poly[j],w=poly[(j+1)%poly.length],su=side(a,b,u)*(keepInside?-1:1),sw=side(a,b,w)*(keepInside?-1:1);if(su<=0)res.push(u);if((su<0&&sw>0)||(su>0&&sw<0)){const t=su/(su-sw);res.push({p:u.p.map((x,k)=>x+(w.p[k]-x)*t),n:u.n.map((x,k)=>x+(w.n[k]-x)*t),i:-1});}}return res;};
        const emit=poly=>{if(poly.length<3)return;const ids=poly.map(v=>{if(v.i>=0)return v.i;P.push(...v.p);N.push(...norm(v.n));return v.i=P.length/3-1;});for(let j=1;j+1<ids.length;j++){const A=poly[0].p,B=poly[j].p,C=poly[j+1].p;if(Math.hypot(...cross(sub(B,A),sub(C,A)))<1e-12)continue;out.push(ids[0],ids[j],ids[j+1]);}};
        for(let t=0;t<I.length;t+=3){
            const tri=[vert(I[t]),vert(I[t+1]),vert(I[t+2])];
            if(tri.some(v=>v.p[1]<=minY)||Math.max(...tri.map(v=>v.p[0]))<lo[0]||Math.min(...tri.map(v=>v.p[0]))>hi[0]||Math.max(...tri.map(v=>v.p[2]))<lo[1]||Math.min(...tri.map(v=>v.p[2]))>hi[1]){out.push(I[t],I[t+1],I[t+2]);continue;}
            // The parts outside each outline edge are kept; what is inside them all is the hole.
            let rest=tri;
            for(let e=0;e<region.length&&rest.length>=3;e++){const a=region[e],b=region[(e+1)%region.length];emit(cut(rest,a,b,false));rest=cut(rest,a,b,true);}
        }
        mesh.positions=Float32Array.from(P);mesh.normals=Float32Array.from(N);mesh.uvs=new Float32Array(P.length/3*2);mesh.index=Uint32Array.from(out);
        return mesh;
    }
    /** The flight cabin under the canopy: the hull is opened inside the
     * canopy's sill, a tub drops to a floor near the keel, and a pilot row
     * (yoke, console, displays) sits ahead of passenger rows. */
    function flightCabin(c,hull,cp,o){
        const {r,W,H,L,put,tube}=c,{zRear,zFront,cy}=o,span=zFront-zRear,lipK=.90,edge=.035;
        const z0=zRear+.035,z1=zRear+span*.90,hw=z=>cp.halfW(z)*lipK,sill=(z,x)=>cp.sill(z,x)+.012;
        // Plan outline of the opening, counter-clockwise from above (+x right, +z down the page).
        const outline=[];for(let i=0;i<=24;i++){const z=z0+(z1-z0)*i/24;outline.push([-hw(z),z]);}for(let i=24;i>=0;i--){const z=z0+(z1-z0)*i/24;outline.push([hw(z),z]);}
        openSkin(hull,ccw(outline),cy);
        const floor=Math.max(cy-H*.20,H*.27),rows=36;
        const Z=Array.from({length:rows+1},(_,i)=>z0+(z1-z0)*i/rows);
        // Coaming: a formed lip over the cut edge, then the tub walls.
        const lip=new CM.Geo(),wall=new CM.Geo(),lipW=edge*1.6;
        const sideAt=(z,s,off)=>{const x=s*(hw(z)+off);return[x,sill(z,x),z];};
        for(const s of [-1,1])for(let i=0;i<rows;i++){
            const a=Z[i],b=Z[i+1],inA=sideAt(a,s,-lipW*.45),inB=sideAt(b,s,-lipW*.45),outA=sideAt(a,s,lipW),outB=sideAt(b,s,lipW),up=[0,1,0];
            lip.poly([inA,outA,outB,inB],null,up);lip.poly([inA,inB,add(inB,[0,-.03,0]),add(inA,[0,-.03,0])],null,[-s,0,0]);
            const wa=[inA[0],floor,a],wb=[inB[0],floor,b];wall.poly([add(inA,[0,-.03,0]),add(inB,[0,-.03,0]),wb,wa],null,[-s,0,0]);
        }
        for(const [z,face]of [[z0,1],[z1,-1]]){
            const pts=[];for(let j=0;j<=16;j++){const x=-hw(z)+lipW*.45+(2*hw(z)-lipW*.9)*j/16;pts.push([x,sill(z,x)-.03,z]);}
            for(let j=0;j<16;j++){wall.poly([pts[j],pts[j+1],[pts[j+1][0],floor,z],[pts[j][0],floor,z]],null,[0,0,face]);lip.poly([pts[j],pts[j+1],add(pts[j+1],[0,.03,-face*lipW*1.4]),add(pts[j],[0,.03,-face*lipW*1.4])],null,[0,1,0]);}
        }
        put('trim',solidify(lip.done(),.008),'Cockpit coaming');
        put('secondary',solidify(wall.done(),.012),'Cockpit tub liner');
        // Floor plate, slightly narrower than the tub.
        const fl=new CM.Geo();for(let i=0;i<rows;i++){const a=Z[i],b=Z[i+1];fl.poly([[-hw(a)+.01,floor+.005,a],[hw(a)-.01,floor+.005,a],[hw(b)-.01,floor+.005,b],[-hw(b)+.01,floor+.005,b]],null,[0,1,0]);}
        put('dark',solidify(fl.done(),.012),'Cabin floor');
        // Rows: the pilot ahead, passengers behind at a fixed pitch.
        // Rows are laid from the aft bulkhead forward; the pilot row is the
        // last that still leaves leg room ahead of it, and the dash sits at
        // the pilot's knees with the glare shield running on into the nose.
        const crownAt=z=>cp.crown(z),hipUp=.15,mid=(z0+z1)/2;
        const k=Math.max(.62,Math.min(1,(crownAt(mid)-floor-hipUp-.06)/.80,hw(mid)/.56));
        const pitch=.74*k,aft=z0+.30*k,legs=.64*k,count=Math.max(1,Math.floor((z1-.06-legs-aft)/pitch)+1);
        const front=count>1?aft+(count-1)*pitch:Math.min(z1-.06-legs,mid),dashZ=front+legs;
        const across=n=>{const room=hw(front)*2-.04;return Array.from({length:n},(_,i)=>(i-(n-1)/2)*Math.min(.56*k,room/n));};
        const seatRows=Array.from({length:count},(_,i)=>front-i*pitch);
        o.seats=[];
        seatRows.forEach((z,row)=>{const n=row===0?2:Math.max(2,Math.min(3,Math.floor((hw(z)*2-.04)/(.50*k))));for(const x of across(n)){seatUnit(c,[x,floor+hipUp*k+.10*k,z],{k:k*(row===0?1:.96),width:.50,floor,recline:.32});o.seats.push([x,floor+hipUp*k+.10*k,z]);}});
        // Pilot station: a dash under the canopy nose, two displays, a yoke
        // ahead of the left seat and a throttle console between the seats.
        const pilotX=across(2)[1],dashTop=Math.min(crownAt(dashZ)-.07,floor+.62*k),dashW=hw(dashZ)*1.8;
        put('trim',CM.roundedBox([0,(floor+dashTop)/2+.08,dashZ+.02],[dashW,dashTop-floor-.16,.26],.03,3),'Dashboard housing');
        // Glare shield / avionics deck from the dash into the nose glass.
        if(z1-dashZ>.2){const deck=new CM.Geo(),n=10,y=z=>Math.min(dashTop,crownAt(z)-.06);for(let i=0;i<n;i++){const a=dashZ+.13+(z1-dashZ-.13)*i/n,b=dashZ+.13+(z1-dashZ-.13)*(i+1)/n;deck.poly([[-hw(a)+.02,y(a),a],[hw(a)-.02,y(a),a],[hw(b)-.02,y(b),b],[-hw(b)+.02,y(b),b]],null,[0,1,0]);}put('trim',solidify(deck.done(),.012),'Dashboard housing');
            // Nav and systems screens laid into the deck ahead of each seat.
            for(const s of [-1,1]){const z=dashZ+.13+(z1-dashZ-.13)*.35,w=Math.min(.26*k,hw(z)*.7),F=CM.frame([s*hw(z)*.42,y(z)+.004,z],[1,0,0],[0,0,-1]);put('dark',CM.slab(CM.rect(0,0,w,.16*k),F,.004,.0015,true),'Instrument binnacle');put(r.lights?'glow':'metal',CM.slab(CM.rect(0,0,w*.86,.13*k),{...F,o:add(F.o,[0,.0045,0])},.001,.0004,true),'Console display');}}
        const face=CM.frame([0,dashTop-.07,dashZ-.10],[1,0,0],[0,.80,.60]);
        for(const s of [-1,1]){
            put('dark',CM.slab(CM.rect(s*dashW*.22,0,dashW*.34,.11*k),face,.012,.004,true),'Instrument binnacle');
            put(r.lights?'glow':'metal',CM.slab(CM.rect(s*dashW*.22,0,dashW*.30,.08*k),{...face,o:add(face.o,scale(face.n,.013))},.002,.0006,true),'Dashboard status strips');
        }
        const col=[pilotX,dashTop-.10,dashZ-.12],hub=[pilotX,dashTop-.05,dashZ-.30*k];tube('dark',[col,hub],.022,'Steering column');
        const yoke=[[pilotX-.15*k,hub[1]+.05,hub[2]],[pilotX-.13*k,hub[1],hub[2]],[pilotX+.13*k,hub[1],hub[2]],[pilotX+.15*k,hub[1]+.05,hub[2]]];
        tube('trim',yoke.slice(1,3),.016,'Steering hub');
        for(const s of [0,1]){const a=yoke[s*2],b=yoke[s*2+1];tube('rubber',[s?b:a,add(s?b:a,[0,.09*k,-.01])],.019,'Cabin steering wheel');}
        tube('rubber',[yoke[0],yoke[1]],.017,'Cabin steering wheel');tube('rubber',[yoke[2],yoke[3]],.017,'Cabin steering wheel');
        const conZ=front+.10*k,conH=.30*k;put('trim',CM.roundedBox([0,floor+conH/2,conZ],[.14*k,conH,.62*k],.03,3),'Center console');
        for(const s of [-1,1]){const base=[s*.025,floor+conH,conZ+.10*k];tube('metal',[base,add(base,[0,.10*k,.03])],.006,'Throttle levers');put('accent',CM.roundedBox(add(base,[0,.11*k,.035]),[.03,.03,.04],.01,2),'Throttle grips');}
        put(r.lights?'glow':'dark',CM.roundedBox([0,floor+conH+.003,conZ-.12*k],[.09*k,.006,.16*k],.002,2),'Console display');
        return o.seats;
    }
    /** Convex 2D outlines raised by `height` with chamfered top edges, then
     * bent onto a surface: warp([u, v, h]) -> point. Faces are re-shaded
     * flat afterwards, so chamfers catch light as separate bands. */
    function bentBlocks(outlines,height,bevel,warp){
        const flat={o:[0,0,0],u:[1,0,0],v:[0,1,0],n:[0,0,1]},list=[];
        for(const poly of outlines){const m=CM.slab(poly,flat,height,bevel,true),P=m.positions;for(let i=0;i<P.length;i+=3){const q=warp([P[i],P[i+1],P[i+2]]);P[i]=q[0];P[i+1]=q[1];P[i+2]=q[2];}list.push(m);}
        return CM.smoothNormals(CM.merge(list),.94);
    }
    /** A tread block on a quad [s0,d0, s1,d0, s1',d1, s0',d1], cut into
     * `slices` across the tread so its top follows the tire's shoulder.
     * Chamfered top edges; the open base sinks into the carcass. */
    function treadBlock(g,quad,slices,height,bevel,warp){
        const [a0,a1,b0,b1]=[[quad[0],quad[1]],[quad[2],quad[3]],[quad[6],quad[7]],[quad[4],quad[5]]];
        const left=t=>[mix(a0[0],b0[0],t),mix(a0[1],b0[1],t)],right=t=>[mix(a1[0],b1[0],t),mix(a1[1],b1[1],t)];
        const span=Math.abs(b0[1]-a0[1])||1,bt=Math.min(.3,bevel/span),wide=t=>Math.abs(right(t)[0]-left(t)[0])||1;
        const lerp=(p,q,t)=>[mix(p[0],q[0],t),mix(p[1],q[1],t)];
        // Built flat in (along, across, up), wound outward there, then bent:
        // the bend keeps orientation, so the block stays a closed solid.
        const outerL=[],outerR=[],topL=[],topR=[],baseL=[],baseR=[];
        for(let k=0;k<=slices;k++){
            const t=k/slices,tt=mix(bt,1-bt,t),L=left(t),R=right(t),Li=left(tt),Ri=right(tt),f=Math.min(.3,bevel/wide(tt));
            outerL.push([...L,height-bevel]);outerR.push([...R,height-bevel]);baseL.push([...L,0]);baseR.push([...R,0]);
            topL.push([...lerp(Li,Ri,f),height]);topR.push([...lerp(Ri,Li,f),height]);
        }
        const faces=[];
        for(let k=0;k<slices;k++){
            const j=k+1;
            faces.push([topL[k],topR[k],topR[j],topL[j]]);
            faces.push([outerL[k],topL[k],topL[j],outerL[j]]);faces.push([topR[k],outerR[k],outerR[j],topR[j]]);
            faces.push([baseL[k],outerL[k],outerL[j],baseL[j]]);faces.push([outerR[k],baseR[k],baseR[j],outerR[j]]);
            faces.push([baseL[k],baseL[j],baseR[j],baseR[k]]);
        }
        const e=slices;
        faces.push([outerR[0],outerL[0],topL[0],topR[0]]);faces.push([baseR[0],baseL[0],outerL[0],outerR[0]]);
        faces.push([outerL[e],outerR[e],topR[e],topL[e]]);faces.push([baseL[e],baseR[e],outerR[e],outerL[e]]);
        const pts=[...topL,...topR,...baseL,...baseR],c=scale(pts.reduce((m,p)=>add(m,p),[0,0,0]),1/pts.length);
        for(const q of faces){const n=cross(sub(q[2],q[0]),sub(q[3],q[1])),m=scale(add(add(q[0],q[1]),add(q[2],q[3])),.25),o=dot(n,sub(m,c))<0?q.slice().reverse():q;g.push(o.map(warp));}
    }
    const RIM_STYLES={compact:'split',sport:'turbofan',truck:'steel',rover:'beadlock',motorcycle:'split'};
    /** Wheel and tire kit. Tire: a 14-ring carcass (no hidden rings) with
     * chamfered tread blocks in a road, all-terrain or mud pattern. Rim: a
     * deep dish behind a rolled lip, pocketed spokes in the vehicle's style,
     * hub, cap and nuts. Brake: a hatted, vented disc (drilled or slotted)
     * that turns with the wheel; the caliper is fixed to the body. */
    function wheel(c,x,z,R,width,name){
        const {r,put}=c,side=x<0?-1:1,F=CM.frame([x,R,z],[0,0,-side],[0,1,0]),w=width,bike=r.form==='motorcycle';
        const tyre=name+' tire',rimName=name+' rim',brakeName=name+' brake',style=RIM_STYLES[r.form]||'split',pattern=r.treadPattern||'road',lugs=r.details&&r.tread>0;
        const at=(rho,a,d)=>add(F.o,add(scale(F.u,Math.cos(a)*rho),add(scale(F.v,Math.sin(a)*rho),scale(F.n,d))));
        const lh=lugs?R*(bike&&pattern==='road'?.007+.022*r.tread:{road:.004+.014*r.tread,allTerrain:.006+.024*r.tread,mud:.010+.034*r.tread}[pattern]):0,Rc=R-lh*.55;
        // Carcass: outer contour [radius, depth] across the tread, then the beads.
        let outer,beads;
        if(bike){outer=Array.from({length:15},(_,i)=>{const a=-Math.PI/2+i/14*Math.PI;return[Rc-R*.18*(1-Math.cos(a)),w*.55*Math.sin(a)];});beads=[[R*(.82-.18*Math.sin(pi/6)),w*.55*Math.cos(pi/6)],[R*(.82-.18*Math.sin(pi/3)),w*.55*Math.cos(pi/3)]];}
        else{outer=[[R*.78,-w*.555],[Rc-R*.045,-w*.515],[Rc-R*.014,-w*.44],[Rc-R*.003,-w*.32],[Rc,-w*.16],[Rc,w*.16],[Rc-R*.003,w*.32],[Rc-R*.014,w*.44],[Rc-R*.045,w*.515],[R*.78,w*.555]];beads=[[R*.73,w*.562],[R*.70,w*.574],[R*.66,w*.50],[R*.60,w*.42]];}
        let crown=outer;
        if(lugs&&pattern==='road'&&!bike){const t=lh;crown=[...outer.slice(0,4),[Rc,-w*.165],[Rc+t,-w*.145],[Rc+t,-w*.05],[Rc+t*.35,-w*.035],[Rc+t*.35,w*.035],[Rc+t,w*.05],[Rc+t,w*.145],[Rc,w*.165],...outer.slice(6)];}
        const profile=[...beads.slice().reverse().map(([a,b])=>[a,-b]),...crown,...beads,[beads.at(-1)[0],-beads.at(-1)[1]]];
        const tires=[],putTire=m=>{tires.push(m);put('rubber',m,tyre);};
        putTire(CM.revolveOn(F,0,0,profile,bike?48:52,.72));
        const carcass=d=>{if(d<=outer[0][1])return outer[0][0];for(let k=0;k+1<outer.length;k++)if(d<=outer[k+1][1]){const t=(d-outer[k][1])/(outer[k+1][1]-outer[k][1]);return mix(outer[k][0],outer[k+1][0],t);}return outer.at(-1)[0];};
        if(lugs){
            const N=bike?30:pattern==='mud'?22:pattern==='allTerrain'?30:40,pitch=2*pi*Rc/N,blocks=[],quad=(s0,s1,d0,d1,slant=0,s2=s0,s3=s1)=>[s0,d0,s1,d0,s3+slant,d1,s2+slant,d1];
            if(bike)for(const s of [-1,1])blocks.push([quad(-.20*pitch,.20*pitch,s*w*.04,s*w*.40,s*.55*pitch),.5*(s+1)*.5]);
            else if(pattern==='road')for(const s of [-1,1])blocks.push([quad(-.34*pitch,.34*pitch,s*w*.19,s*w*.505,s*.20*pitch),s>0?.5:0]);
            else if(pattern==='allTerrain'){for(const s of [-1,1]){blocks.push([quad(-.38*pitch,.30*pitch,s*w*.03,s*w*.25,s*.12*pitch),s>0?0:.5]);blocks.push([quad(-.36*pitch,.36*pitch,s*w*.30,s*w*.505,s*.06*pitch),s>0?.5:0]);}}
            else for(const s of [-1,1]){blocks.push([quad(-.20*pitch,.16*pitch,s*w*.03,s*w*.505,s*.40*pitch,-.20*pitch,.26*pitch),s>0?0:.5]);blocks.push([quad(-.14*pitch,.14*pitch,s*w*.36,s*w*.505,0),s>0?.5:0]);}
            const sink=Math.max(lh*.35,R*.004),quads=[];
            for(let k=0;k<N;k++)for(const [poly,phase]of blocks){
                const a0=(k+phase)*2*pi/N,slices=bike?1:Math.max(1,Math.min(3,Math.round(Math.abs(poly[5]-poly[1])/(w*.17))));
                treadBlock(quads,poly,slices,lh,Math.min(lh*.38,pitch*.06),([s,d,h])=>at(carcass(d)+h-sink*(1-h/lh),a0+s/Rc,d));
            }
            // Each face is turned away from its block's centre.
            const g=new CM.Geo();for(const q of quads)g.poly(q,null,null);
            const meshes=[CM.smoothNormals(g.done(),.94)];
            putTire(CM.merge(meshes));
        }
        // Rim: rolled lip and a deep dish down to the spoke face.
        const kind=style==='beadlock'?'trim':'metal',lip=w*.53,dish=w*({split:.16,turbofan:.10,steel:.20,beadlock:.22}[style]||.14)*(bike?.35:1),face=lip-dish;
        const rh=R*.19,rs=R*.585,tS=R*(bike?.045:.06),concave=w*({split:.05,turbofan:.0,steel:-.02,beadlock:.03}[style]||0),hub=face-concave;
        put(kind,CM.revolveOn(F,0,0,[[R*.605,w*.40],[R*.645,w*.465],[R*.668,w*.50],[R*.664,w*.522],[R*.650,lip],[R*.606,lip],[R*.594,lip-w*.012],[R*.580,face],[R*.562,face-w*.012],[R*.558,-w*.38],[R*.605,-w*.38],[R*.605,w*.40]],bike?48:52,.6),rimName);
        const depthAt=rho=>mix(hub,face,Math.max(0,Math.min(1,(rho-rh)/(rs-rh))));
        const warp=([u,v,h])=>{const rho=Math.hypot(u,v);return add(F.o,add(scale(F.u,u),add(scale(F.v,v),scale(F.n,depthAt(rho)-tS+h))));};
        const polar=(rho,a)=>[Math.cos(a)*rho,Math.sin(a)*rho],poly=(...pts)=>pts.flat();
        const count=r.spokes,spokes=[],webs=[];
        for(let k=0;k<count;k++){
            const a=k/count*2*pi+(side<0?pi/count:0);
            if(style==='split'){
                // Twin rails diverge into a Y; a lower web between them is the pocket.
                const d=pi/count*.50;
                for(const s of [-1,1])spokes.push(poly(polar(rh,a+s*.035),polar(rh,a+s*.14),polar(rs,a+s*(d+.055)),polar(rs,a+s*(d-.045))));
                webs.push(poly(polar(rh*1.25,a-.09),polar(rh*1.25,a+.09),polar(rs*.93,a+d-.03),polar(rs*.93,a-d+.03)));
            }else if(style==='turbofan'){
                for(const t of [0,.5]){const b=a+t*2*pi/count;spokes.push(poly(polar(rh*1.05,b),polar(rh*1.05,b+.16),polar(rs,b+.62),polar(rs,b+.44)));}
            }else if(style==='steel'){
                const d=pi/count*.66;spokes.push(poly(polar(rh,a-.20),polar(rh,a+.20),polar(rs*.86,a+d),polar(rs*.86,a-d)));
            }else{
                const d=pi/count*.40;
                for(const s of [-1,1])spokes.push(poly(polar(rh,a+s*.10),polar(rh,a+s*.20),polar(rs,a+s*(d+.06)),polar(rs,a+s*(d-.04))));
                webs.push(poly(polar(rh*1.2,a-.17),polar(rh*1.2,a+.17),polar(rs*.94,a+d-.02),polar(rs*.94,a-d+.02)));
            }
        }
        put(kind,bentBlocks(spokes,tS,tS*.22,warp),rimName);
        if(webs.length)put(kind,bentBlocks(webs,tS*.38,tS*.10,warp),rimName);
        if(style==='steel'){
            // Stamped outer band and raised center: the windows are the gaps.
            put(kind,CM.revolveOn(F,0,0,[[R*.565,face-tS],[R*.565,face],[R*.50,face+w*.012],[R*.44,face],[R*.44,face-tS]],64,.6),rimName);
            put(kind,CM.revolveOn(F,0,0,[[R*.30,hub-tS],[R*.30,hub],[R*.26,hub+w*.012]],48,.6),rimName);
        }
        if(style==='turbofan')put(kind,CM.revolveOn(F,0,0,[[R*.585,face-tS*.4],[R*.585,face],[R*.50,face],[R*.50,face-tS*.4],[R*.585,face-tS*.4]],56,.6),rimName);
        if(style==='beadlock'){
            const ring=lip+w*.016;put(kind,CM.revolveOn(F,0,0,[[R*.676,lip-w*.004],[R*.676,ring],[R*.606,ring],[R*.606,lip-w*.004]],64,.6),rimName);
            if(r.details)for(let k=0;k<16;k++){const a=k/16*2*pi,G={...F,o:at(R*.641,a,ring)};put(kind,CM.revolveOn(G,0,0,[[R*.016,0],[R*.016,R*.014],[R*.011,R*.019],[0,R*.019]],6,.5),rimName);}
        }
        // Hub face, centre cap and lug nuts.
        put(kind,CM.revolveOn(F,0,0,[[R*.215,hub-tS],[R*.215,hub],[R*.185,hub+R*.012],[R*.125,hub+R*.012],[R*.125,hub-tS],[R*.215,hub-tS]],32,.6),rimName);
        put(kind,CM.revolveOn(F,0,0,[[R*.125,hub+R*.012],[R*.125,hub+R*.030],[R*.095,hub+R*.046],[R*.05,hub+R*.053],[0,hub+R*.055],[0,hub+R*.012],[R*.125,hub+R*.012]],24,.6),rimName);
        const nuts=bike?0:r.form==='rover'?8:r.form==='truck'?6:5;
        if(r.details)for(let k=0;k<nuts;k++){const a=k/nuts*2*pi+.3,G={...F,o:at(R*.158,a,hub+R*.012)};put(kind,CM.revolveOn(G,0,0,[[0,0],[R*.024,0],[R*.024,R*.024],[R*.017,R*.032],[0,R*.032]],6,.5),rimName);}
        // Brake disc: friction ring with a vent band, hat to the hub.
        const t=R*(bike?.02:.055),hatTop=hub-tS-R*.006,dF=hatTop-R*(bike?.01:.04),dB=dF-t,ro=R*(bike?.47:.50),ri=R*(bike?.30:.27);
        put('metal',CM.revolveOn(F,0,0,[[ro,dB],[ro,dB+t*.35],[ro,dB+t*.65],[ro,dF],[ri,dF],[ri-R*.02,hatTop],[R*.13,hatTop],[R*.13,dB],[ro,dB]],bike?32:48,.6),brakeName);
        const marks=[],drilled=bike||r.form==='sport',slotted=r.form==='rover'||r.form==='truck';
        if(r.details&&drilled)for(let k=0;k<24;k++){const a=k/24*2*pi,rho=mix(ri,ro,k%2?.38:.70),G={...F,o:at(rho,a,dF+.0004)};marks.push(CM.revolveOn(G,0,0,[[R*.016,0],[0,0]],8));}
        if(r.details&&slotted)for(let k=0;k<8;k++){const a=k/8*2*pi,g=new CM.Geo(),seg=4;for(let j=0;j<seg;j++){const p0=mix(ri*1.08,ro*.94,j/seg),p1=mix(ri*1.08,ro*.94,(j+1)/seg),a0=a+.28*j/seg,a1=a+.28*(j+1)/seg,hw=R*.008;g.poly([at(p0,a0-hw/p0,dF+.0004),at(p1,a1-hw/p1,dF+.0004),at(p1,a1+hw/p1,dF+.0004),at(p0,a0+hw/p0,dF+.0004)],null,F.n);}marks.push(g.done());}
        if(marks.length)put('metal',CM.merge(marks),brakeName);
        // Holes, slots and the vent band are dark in the vertex colors.
        const tints=c.tints||(c.tints=new Map()),local=p=>{const d=sub(p,F.o);return[Math.hypot(dot(d,F.u),dot(d,F.v)),dot(d,F.n)];};
        tints.set(brakeName,p=>{const [rho,d]=local(p);if(rho<ri+1e-4&&d>dF-1e-4)return .55;if(d>dF+.0002)return .10;if(rho>ro-1e-4&&d>dB+t*.2&&d<dF-t*.2)return .12;return 1;});
        if(kind==='trim')tints.set(rimName,p=>{const [rho,d]=local(p);if(rho<R*.21&&d>hub+R*.011)return[.42,.45,.47];if(rho>R*.60&&d>lip+w*.016+R*.002)return[.42,.45,.47];if(rho>R*.60&&d>lip-w*.003)return 2.4;return 1;});
        // Caliper: a fixed arc block straddling the disc's outer edge.
        if(!bike){
            const ac=side>0?2.35:pi-2.35,span=.36,r0=R*.39,r1=R*.545,steps=6,back=dB-R*.025;
            let front=dF+R*.045;for(let k=0;k<=8;k++){const rho=mix(r0,r1,k/8);front=Math.min(front,depthAt(rho)-tS-.004);}
            const g=new CM.Geo(),ch=R*.012,sec=[[r0+ch,back],[r1-ch,back],[r1,back+ch],[r1,front-ch],[r1-ch,front],[r0+ch,front],[r0,front-ch],[r0,back+ch]];
            const ring=a=>sec.map(([rho,d])=>at(rho,a,d));
            const middle=a=>at((r0+r1)/2,a,(back+front)/2);
            for(let j=0;j<steps;j++){const a0=ac-span+2*span*j/steps,a1=ac-span+2*span*(j+1)/steps,A=ring(a0),B=ring(a1),centre=middle((a0+a1)/2);for(let k=0;k<sec.length;k++){const kk=(k+1)%sec.length;g.poly([A[k],A[kk],B[kk],B[k]],null,sub(scale(add(add(A[k],A[kk]),add(B[k],B[kk])),.25),centre));}}
            for(const [a,s]of [[ac-span,-1],[ac+span,1]])g.poly(ring(a),null,scale(add(scale(F.u,-Math.sin(a)),scale(F.v,Math.cos(a))),s));
            put('accent',CM.smoothNormals(g.done(),.9),'Brake calipers');
        }
        let radius=0;
        for(const mesh of tires)for(let i=0;i<mesh.positions.length;i+=3)radius=Math.max(radius,Math.hypot(mesh.positions[i+1]-R,mesh.positions[i+2]-z));
        return{part:tyre,with:[rimName,brakeName],at:[x,R,z],radius,side:side>0?'left':'right'};
    }
    const hexLinear=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
    /** Armored coachwork: bolted chamfered plates on every free flank span
     * (between the wheel arches and the door cuts; the door carries its own
     * plate), two bonnet plates either side of a dark ridge, all over a dark
     * under-frame. The shell itself takes the darker under-frame tone. */
    function roadArmor(c){
        const {r,W,H,L,R,axleZ,door,bodyProfile:p,panels}=c,t=H*(.004+.010*r.armor)+.008,lo=door.low+H*.035,hiAt=z=>p.top(z)-H*.11;
        const cuts=axleZ.map(a=>[a-R*1.24,a+R*1.24]).concat([[door.rear-.02,door.rear+.02],[door.front-.02,door.front+.02]]).sort((a,b)=>a[0]-b[0]);
        const spans=[];let z=-L*.455;for(const [a,b]of cuts){if(a-z>.22)spans.push([z,a]);z=Math.max(z,b);}if(L*.43-z>.22)spans.push([z,L*.43]);
        for(const s of [-1,1])for(const [z0,z1]of spans){
            const onDoor=z0>=door.rear-.03&&z1<=door.front+.03,P=(zz,y)=>[s*c.sideAt(zz,y),y,zz],a=z0+.015,b=z1-.015;
            if(hiAt(a)-lo<.12||hiAt(b)-lo<.12)continue;
            HW.armorPlate(c,[P(a,lo),P(b,lo),P(b,hiAt(b)),P(a,hiAt(a))],{kind:'armor',name:onDoor?'Door armor plates':'Bolted armor plates',out:[s,0,0],thickness:t,boltPitch:.32,probe:(u,v)=>{const zz=mix(a,b,u);return P(zz,mix(lo,hiAt(zz),v));}});
        }
        const z0=panels.z0+L*.025,z1=panels.z1-L*.035,top=(x,zz)=>[x,p.topFace(zz,Math.min(1,Math.abs(x)/p.width(zz))),zz];
        for(const s of [-1,1]){const xi=s*W*.035,xo=zz=>s*p.width(zz)*.68;
            HW.armorPlate(c,[top(xi,z0),top(xo(z0),z0),top(xo(z1),z1),top(xi,z1)],{kind:'armor',name:'Bonnet armor plates',out:[0,1,0],thickness:t*.8,boltPitch:.34,probe:(u,v)=>{const zz=mix(z0,z1,v);return top(mix(xi,xo(zz),u),zz);}});}
        const paint=hexLinear(r.paint),frame=hexLinear('#22282c'),dark=paint.map((v,k)=>mix(v,frame[k],.62));
        if(c.zones)for(const name of ['Sculpted body shell','Access door','Formed bonnet panel'])c.zones.set(name,()=>dark);
    }
    /** Fitting anchors on road bodies; Detail density picks among them. */
    function roadFittings(c){
        const {r,W,H,L,R,hood,base,roofY,rf,rr,rw}=c;if(!r.details)return;
        const anchors=[],yRoof=roofY+H*.035,rc=(rr+rf)/2,utility=['truck','rover'].includes(r.form)||r.bodyStyle==='armored';
        for(const s of [-1,1]){
            if(utility)anchors.push({kind:'lightCage',F:CM.frame([s*rw*.72,yRoof+H*.05,rf-L*.02],[1,0,0],[0,1,0]),size:[H*.09,H*.09],face:'roof',priority:.7,post:H*.05});
            if(r.form!=='sport'&&!(r.form==='rover'&&r.bodyStyle!=='armored'))anchors.push({kind:'antenna',F:CM.frame([s*rw*.75,yRoof,rr+L*.04],[1,0,0],[0,0,-1]),size:[W*.035,H*.28],face:'roof',priority:s>0?.8:.35});
        }
        if(!r.roofRack&&r.form!=='sport')anchors.push({kind:'rack',F:CM.frame([0,yRoof,rc],[1,0,0],[0,0,-1]),size:[rw*1.55,(rf-rr)*.78],face:'roof',priority:utility?.6:.4});
        if(r.form==='rover'){
            const back=-L*.49-.004,yc=mix(base,hood,.62),sr=Math.min(R*.92,(hood-base)*.62),lampInner=W*.34-W*.0375-.02;
            anchors.push({kind:'spareWheel',F:CM.frame([0,yc,back],[-1,0,0],[0,1,0]),size:[sr*2,sr*2],face:'rear',priority:1});
            const jw=Math.min(.26,lampInner-sr-.03);
            if(jw>.16)for(const s of [-1,1])anchors.push({kind:'jerrycan',F:CM.frame([s*(sr+.03+jw/2),yc-sr*.25,back],[-1,0,0],[0,1,0]),size:[jw,jw*1.5],face:'rear',priority:.85});
        }
        HW.fittings(c,anchors,r.detailDensity??.6,3);
    }
    /** Lays a part built over y=0 onto a surface: every point rises by the
     * surface height under it, less `sink` (so its underside is buried, never
     * floating). `base` is the y the part was built on. Returns the mesh. */
    function drape(mesh,surface,base=0,sink=0){
        const P=mesh.positions;for(let i=0;i<P.length;i+=3)P[i+1]+=surface(P[i],P[i+2])-base-sink;return mesh;
    }
    /** A closed slab between two matching point grids (outer O and inner I, [i][j]): faces, edges, and
     * the whole turned to face out by its signed volume. */
    function gridSlab(O,I){
        const g=new CM.Geo(),n=O.length,m=O[0].length,quad=q=>g.poly(q,null,norm(cross(sub(q[1],q[0]),sub(q[3],q[0]))));
        for(let i=0;i+1<n;i++)for(let j=0;j+1<m;j++){quad([O[i][j],O[i+1][j],O[i+1][j+1],O[i][j+1]]);quad([I[i][j],I[i][j+1],I[i+1][j+1],I[i+1][j]]);}
        for(let i=0;i+1<n;i++){quad([O[i][0],I[i][0],I[i+1][0],O[i+1][0]]);quad([O[i][m-1],O[i+1][m-1],I[i+1][m-1],I[i][m-1]]);}
        for(let j=0;j+1<m;j++){quad([O[0][j],O[0][j+1],I[0][j+1],I[0][j]]);quad([O[n-1][j],I[n-1][j],I[n-1][j+1],O[n-1][j+1]]);}
        const mesh=g.done(),P=mesh.positions,X=mesh.index;let vol=0;
        for(let t=0;t<X.length;t+=3){const a=X[t]*3,b=X[t+1]*3,d=X[t+2]*3;vol+=P[a]*(P[b+1]*P[d+2]-P[b+2]*P[d+1])-P[a+1]*(P[b]*P[d+2]-P[b+2]*P[d])+P[a+2]*(P[b]*P[d+1]-P[b+1]*P[d]);}
        if(vol<0){for(let t=0;t<X.length;t+=3){const x=X[t+1];X[t+1]=X[t+2];X[t+2]=x;}for(let k=0;k<mesh.normals.length;k++)mesh.normals[k]=-mesh.normals[k];}
        return CM.smoothNormals(mesh,.7);
    }
    /** The door's body behind its skin: a full-thickness inner door card (trim panel) with an armrest,
     * a pull handle and a speaker grille, all the door's own parts ("Door left card", ...), so an
     * open door reads as a door edge-on and from inside the cabin. */
    function doorCard(c,sign){
        const {W,H,door,put,box,bodyProfile:p}=c;if(!p||!c.sideAt)return;
        const side=sign>0?'left':'right',T=Math.max(.05,W*.035),gap=Math.max(.004,W*.003),z0=door.rear+gap*2,z1=door.front-gap*2,low=door.low+gap*2;
        const top=z=>c.surfaceY(p.width(z)*(p.faceted?.94:.945),z)-gap,nz=12,ny=8,O=[],I=[];
        for(let i=0;i<=nz;i++){const z=z0+(z1-z0)*i/nz,yt=top(z),o=[],q=[];for(let j=0;j<=ny;j++){const y=low+(yt-low)*j/ny,x=c.sideAt(z,y);o.push([sign*(x-.003),y,z]);q.push([sign*(x-T),y,z]);}O.push(o);I.push(q);}
        put('trim',gridSlab(O,I),'Door '+side+' card');
        const at=(fz,fy,inset)=>{const z=z0+(z1-z0)*fz,y=low+(top(z)-low)*fy;return[sign*(c.sideAt(z,y)-T-inset),y,z];};
        const arm=at(.5,.56,.025);box('seat',arm,[.05,Math.min(.06,H*.04),(z1-z0)*.55],.012,'Door '+side+' armrest');
        const pull=at(.80,.70,.012);box('metal',pull,[.018,.022,Math.min(.12,(z1-z0)*.14)],.006,'Door '+side+' pull handle');
        const sp=at(.78,.24,0),F=CM.frame(sp,[0,0,sign>0?1:-1],[0,1,0]),R=Math.min(.075,(top(z1)-low)*.16);
        put('metal',CM.revolveOn(F,0,0,[[R*1.12,-.002],[R*1.12,.006],[R*.98,.008],[R*.98,-.002]],28),'Door '+side+' speaker grille');
        put('dark',CM.revolveOn(F,0,0,[[0,.004],[R,.004],[R,.006],[0,.006]],28),'Door '+side+' speaker grille');
    }
    function roadDetails(c){
        const {r,W,H,L,R,hood,base,roofY,rf,rr,rw,bw,cabinZ,cabinL,door,box,tube,sheet,put,bodyProfile:p}=c;
        const sport=r.form==='sport',utility=['truck','rover'].includes(r.form);
        // Character lines follow the coachwork, including the changing width.
        if(r.interior!==false)for(const s of [-1,1])doorCard(c,s);
        for(const s of [-1,1]){
            // The door is cut from the shell itself: its shut lines and the
            // shoulder crease replace the former pasted skin and seal tubes.
            const lo=door.low;
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
            if(utility)for(const t of [.22,.70]){const z=door.front-.025,y=mix(lo,hood,t);box('metal',[s*(c.sideAt(z,y)+.010),y,z],[.024,H*.037,.035],.006,'Door hinges');}
            box('metal',[s*W*.56,hood+H*.11,cabinZ+cabinL*.5-L*.055-.019],[W*.105,H*.048,.004],.004,'Mirror glass');
            // Rolled sill and rear quarter intake: short details stay between
            // the wheel openings instead of stretching through the tires.
            const sillWidth=door.width*.9;
            const sillY=mix(base,lo,.42);box('trim',[s*(c.sideAt(door.z,sillY)+W*.006),sillY,door.z],[W*.018,(lo-base)*.42,sillWidth],.006,'Rocker molding');
            if(sport){
                const F=CM.frame([s*(W*.49+.012),hood-H*.065,door.rear+door.width*.10],[0,0,-s],[0,1,0]);
                put('dark',CM.slab(CM.rect(0,0,door.width*.16,H*.075),F,.004,.002,true),'Quarter cooling inlet');
                for(let j=0;j<3;j++)tube('metal',[[F.o[0]+s*.007,hood-H*(.09-j*.022),door.rear+door.width*.025],[F.o[0]+s*.007,hood-H*(.09-j*.022),door.rear+door.width*.175]],W*.002,'Inlet vanes');
            }
            if(r.form==='rover'&&r.bodyStyle!=='armored'){
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
        if(r.aero>0&&['compact','sport'].includes(r.form)){
            const y=p.top(-L*.40)+H*.065+H*.09*r.aero;
            for(const s of [-1,1])sheet('trim',[[s*W*.27,p.top(-L*.40),-L*.40],[s*W*.27,y,-L*.43],[s*W*.27,y,-L*.40],[s*W*.27,p.top(-L*.35),-L*.35]],W*.014,'Spoiler pylons');
            put('paint',shell([[-L*.46,W*.44,y,H*.008],[-L*.42,W*.46,y+H*.005,H*.014],[-L*.37,W*.43,y,H*.006]],2.7,32),'Aero rear wing');
        }
        if(r.bodyStyle==='armored')roadArmor(c);
        roadFittings(c);
        if(!r.details)return;
        if(utility&&r.bodyStyle!=='armored'){
            // Seated on the bonnet: each piece is laid on the panel's own
            // crown and slope (drape), its underside sunk a little into it.
            for(const s of [-1,1]){
                const z=L*.34,t=H*.018,sink=Math.min(.004,t*.2);
                drape(box('trim',[s*W*.25,t/2,z],[W*.20,t,L*.15],.012,'Bonnet cooling recess'),c.surfaceY,0,sink);
                for(let j=0;j<7;j++)drape(box('armor',[s*W*.25,t+H*.005-.002,z+(j-3)*L*.016],[W*.17,H*.010,L*.009],.004,'Bonnet louvers'),c.surfaceY,0,sink);
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
            const bed=c.panels.bed,bz=(bed.rear+bed.front)/2,bedL=bed.front-bed.rear;
            for(let j=0;j<9;j++)box('metal',[(j-4)*W*.072,bed.floor+H*.0045,bz],[W*.016,H*.009,bedL*.90],.003,'Bed floor ribs');
            // Tie-down loops stand on the rails' inner faces; the latch sits on the tailgate's outer skin.
            for(const s of [-1,1])for(const zz of [-L*.44,-L*.18])tube('metal',[[s*W*.383,hood+H*.10,zz-L*.008],[s*W*.362,hood+H*.10,zz-L*.006],[s*W*.355,hood+H*.10,zz],[s*W*.362,hood+H*.10,zz+L*.006],[s*W*.383,hood+H*.10,zz+L*.008]],W*.007,'Bed tie-downs');
            box('trim',[0,hood+H*.10,bed.rear-.005],[W*.16,H*.025,.014],.006,'Tailgate latch');
        }
    }
    /** Lamp kit: a pocket in a housing, then for each lamp a bezel ring,
     * a parabolic reflector at least a quarter of its radius deep, an
     * emissive element and a lens. F lies on the mounting face, n outward.
     * Styles: round, caged, projector, bar (LED cells), ladder and stack
     * (rear). Returns the pocket floor frame. */
    function lampUnit(c,F,w,h,style,rear){
        const {r,put,tube}=c,lit=r.lights,depth=rear?Math.max(.03,c.H*.015+.02):Math.max(.04,Math.min(.07,h*.32)),border=Math.min(h*.13,w*.08,.016),recess=depth*.78;
        const b=CM.bezel(F,w,h,depth,border,recess),iw=b.width,ih=b.height,at=(u,v,d)=>add(F.o,add(scale(F.u,u),add(scale(F.v,v),scale(F.n,d))));
        const tag=rear?'Tail lamp':'Headlamp',floor=depth-recess,lens=depth-.002;
        put('trim',b.housing,tag+' housings');put('dark',b.floor,tag+' pockets');
        const on=kind=>lit?kind:'dark',spot=(cu,cv)=>({...F,o:at(cu,cv,0)});
        // Round reflector pod standing on the pocket floor, its lip flush
        // with the housing face. The bowl is a parabola 0.4 r deep.
        const pod=(cu,cv,radius,element='light',projector=false)=>{
            const G=spot(cu,cv),top=depth-.003,bowl=radius*.40,base=top-bowl;
            put('metal',CM.revolveOn(G,0,0,[[radius*1.16,floor],[radius*1.16,top-radius*.04],[radius*1.10,top+radius*.02],[radius*1.02,top+radius*.015],[radius*.99,top]],40),tag+' bezels');
            put('chrome',CM.revolveOn(G,0,0,[.99,.86,.68,.46,.24].map(f=>[radius*f,base+bowl*(f*f-.0576)/(.9801-.0576)]).concat([[radius*.17,base]]),40,.9),tag+' reflectors');
            if(projector){
                put('chrome',CM.revolveOn(G,0,0,[[radius*.62,base+bowl*.3],[radius*.62,base+bowl*.75],[radius*.56,base+bowl*.8]],24),tag+' projector barrels');
                put('glass',CM.revolveOn(G,0,0,[[radius*.56,base+bowl*.78],[radius*.48,base+bowl*.98],[radius*.30,base+bowl*1.10],[0,base+bowl*1.16]],24,.6),tag+' projector lenses');
                put(on('light'),CM.revolveOn(G,0,0,[[radius*1.07,top+radius*.025],[radius*1.07,top+radius*.045],[radius*.97,top+radius*.045],[radius*.97,top+radius*.025]],40),tag+' halo rings');
            }else put(on(element),CM.revolveOn(G,0,0,[[radius*.17,base],[radius*.17,base+radius*.10],[radius*.12,base+radius*.20],[0,base+radius*.24]],16),tag+' elements');
            put('lens',CM.revolveOn(G,0,0,[[radius*1.0,top+radius*.01],[radius*.72,top+radius*.08],[radius*.38,top+radius*.12],[0,top+radius*.13]],40,.4),tag+' lenses');
            return G;
        };
        if(style==='round'||style==='caged'||style==='projector'){
            const count=iw/ih>1.7?2:1,radius=Math.min(ih*.42,iw/count*.40)*(style==='projector'?.82:1);
            for(let k=0;k<count;k++){
                const cu=count===1?0:(k-.5)*iw*.50;pod(cu,0,radius,'light',style==='projector');
                if(style==='caged')for(const v of [-.45,0,.45])tube('metal',[at(cu-radius*1.1,v*radius,depth+radius*.20),at(cu+radius*1.1,v*radius,depth+radius*.20)],radius*.045,'Lamp guards');
                if(style==='caged')for(const s of [-1,1])tube('metal',[at(cu+s*radius*1.1,-radius*.6,depth),at(cu+s*radius*1.1,-radius*.6,depth+radius*.20),at(cu+s*radius*1.1,radius*.6,depth+radius*.20),at(cu+s*radius*1.1,radius*.6,depth)],radius*.05,'Lamp guards');
            }
            if(style==='projector')put(on('light'),CM.slab(CM.rect(0,ih*.5-border*.2,iw*.86,ih*.07),{...F,o:at(0,0,floor+.001)},depth-floor-.004,.001,true),tag+' running lights');
        }else if(style==='bar'){
            // Square LED cells: each a stepped reflector cup with a lamp die.
            const cells=Math.max(3,Math.min(7,Math.round(iw/ih*1.6))),pitch=iw/cells,s=Math.min(pitch,ih)*.40;
            for(let k=0;k<cells;k++){
                const G=spot((k-(cells-1)/2)*pitch,ih*.08),top=depth-.004,bowl=s*.55;
                put('chrome',CM.revolveOn({...G,u:norm(add(G.u,G.v)),v:norm(sub(G.v,G.u))},0,0,[[s*1.30,top],[s*.95,top-bowl*.55],[s*.55,top-bowl],[s*.30,top-bowl]],4,.9),tag+' reflectors');
                put(on('light'),CM.slab(CM.rect(0,0,s*.55,s*.55),{...G,o:at((k-(cells-1)/2)*pitch,ih*.08,top-bowl)},s*.12,s*.03,true),tag+' elements');
            }
            put(on('light'),CM.slab(CM.rect(0,-ih*.36,iw*.92,ih*.08),{...F,o:at(0,0,floor+.001)},depth-floor-.005,.001,true),tag+' running lights');
            put('lens',CM.slab(CM.rect(0,0,iw*.995,ih*.995),{...F,o:at(0,0,lens-.002)},.005,.0015,true),tag+' lenses');
        }else if(style==='ladder'||style==='stack'){
            // Rear: segmented emitters with dark dividers behind a lens.
            const cells=style==='stack'?3:4,vertical=style==='stack',pitch=(vertical?ih:ih)/cells;
            for(let k=0;k<cells;k++){
                const v=(k-(cells-1)/2)*pitch,kind=vertical?(k===cells-1?'red':k===1?'glow':'light'):'red',rw=vertical?iw*.80:iw*(.92-.10*Math.abs(k-(cells-1)/2)),G={...F,o:at(0,v,floor+.001)};
                put('chrome',CM.slab(CM.rect(0,0,rw,pitch*.86),G,recess*.30,.001,true),tag+' reflectors');
                put(on(kind),CM.slab(CM.rect(0,0,rw*.90,pitch*.46),{...G,o:add(G.o,scale(F.n,recess*.30))},recess*.16,pitch*.06,true),tag+' elements');
                if(vertical&&k<cells-1)put('lens',CM.slab(CM.rect(0,0,iw*.995,pitch*.99),{...F,o:at(0,v,lens-.002)},.005,.0015,true),tag+' clear lenses');
            }
            const lensH=vertical?pitch:ih,lensV=vertical?(cells-1)/2*pitch:0;
            put('redlens',CM.slab(CM.rect(0,lensV,iw*.995,lensH*.99),{...F,o:at(0,0,lens-.002)},.005,.0015,true),'Tail lamp lens');
        }
        return{...F,o:at(0,0,floor)};
    }
    function roadFace(c){
        const {r,W,H,L,hood,base,box,tube,put,bodyProfile:p}=c,sport=r.form==='sport',style=r.bodyStyle||'rounded',utility=['truck','rover'].includes(r.form)||style==='armored',front=L*.49,y=p.top(front)-H*.035;
        // A layered fascia: three recessed bays (lamps, radiator, lamps)
        // with real pocket depth, mounted on the nose cap.
        const fh=H*(utility?.16:.13),cy=y-H*.027,depth=utility?.06:.05,border=Math.min(.018,fh*.11),recess=depth*.74,mount=front-.008;
        const at=(x,yy)=>CM.frame([x,yy,mount],[1,0,0],[0,1,0]),lampW=W*.215,lampX=W*.2675,grilleW=2*(lampX-lampW/2);
        const g=CM.bezel(at(0,cy),grilleW,fh,depth,border,recess);put('trim',g.housing,'Front fascia');put('dark',g.floor,'Radiator cavity');
        const slats=utility?7:6,inner=fh-border*2;
        if(utility)for(let j=0;j<9;j++)box('metal',[(j-4)*g.width/9,cy,mount+depth-recess+recess*.47],[g.width/9*.22,inner*1.01,recess*.96],.003,'Radiator grille');
        for(let j=0;j<slats;j++)box(utility?'trim':'metal',[0,cy+(j-(slats-1)/2)*inner/slats,mount+depth-recess*.505],[g.width*1.012,inner/slats*.30,recess*.98],.002,'Radiator grille');
        // Lamps match the body style: Rounded keeps each form's own, Faceted
        // wears LED bars (projectors on the coupe), Armored caged lamps.
        const lamps=style==='armored'?'caged':style==='faceted'?(sport?'projector':'bar'):r.form==='sport'?'projector':r.form==='truck'?'bar':r.form==='rover'?'caged':'round';
        for(const s of [-1,1])lampUnit(c,at(s*lampX,cy),lampW,fh,lamps,false);
        for(const s of [-1,1]){
            const by=base+H*.05,duct=CM.bezel(at(s*W*.30,by),W*.16,H*.05,.035,.008,.026);
            put('trim',duct.housing,'Brake duct');put('dark',duct.floor,'Brake duct');
            for(let j=0;j<3;j++)box('trim',[s*W*.30,by+H*(j-1)*.013,mount+.035-.014],[duct.width*.96,H*.004,.018],.002,'Brake duct vanes');
        }
        // Rear lamps sit on the tail cap; the lens stands proud of the body.
        const back=(x,yy)=>CM.frame([x,yy,-front+.006],[-1,0,0],[0,1,0]);
        if(utility)for(const s of [-1,1])lampUnit(c,back(s*W*(r.form==='truck'?.39:.34),hood-H*.10),W*.075,H*.15,'stack',true);
        else for(const s of [-1,1])lampUnit(c,back(s*W*(sport?.29:.265),hood-H*.06),W*(sport?.17:.20),H*(sport?.05:.07),'ladder',true);
        if(sport){
            const d=Math.max(.03,H*.015+.02),F=back(0,hood-H*.06),bar=CM.bezel(F,W*.40,H*.024,d,.004,.012);
            put('trim',bar.housing,'Tail lamp housings');put('dark',bar.floor,'Tail lamp pockets');
            put(r.lights?'red':'dark',CM.slab(CM.rect(0,0,bar.width*.96,bar.height*.5),{...F,o:add(F.o,scale(F.n,d-.011))},.005,.001,true),'Tail lamp elements');
            put('redlens',CM.slab(CM.rect(0,0,bar.width*.995,bar.height*.99),{...F,o:add(F.o,scale(F.n,d-.004))},.005,.0015,true),'Tail lamp lens');
        }
        if(r.bumper){
            const yy=base+H*.015;
            if(style==='rounded'){put('trim',shell([[front-L*.025,W*.43,yy,H*.042],[front+L*.010,W*.43,yy,H*.032],[front+L*.020,W*.39,yy,H*.021]],3,32),'Contoured front bumper');box('trim',[0,yy,-L*.50],[W*.80,H*.065,L*.035],.020,'Rear bumper');}
            else{
                // Chamfered beam bumpers on short brackets.
                const beam=(z,dir,name)=>{put('trim',HS.plate(HS.cut(HS.rect(-W*.44,-H*.042,W*.44,H*.042),[H*.03,H*.012,H*.012,H*.03]),L*.032,H*.010,{frame:CM.frame([0,yy,z+dir*L*.016],[dir,0,0],[0,1,0])}),name);for(const x of [-W*.26,W*.26])put('frame',HS.plate(HS.rect(-W*.03,-H*.025,W*.03,H*.025),L*.07,0,{frame:CM.frame([x,yy,z-dir*L*.04],[dir,0,0],[0,1,0])}),name+' brackets');};
                beam(front-L*.012,1,'Contoured front bumper');beam(-L*.488,-1,'Rear bumper');
            }
            if(utility){
                // Grille guard: two posts on the bay seams and a top hoop, clear of the lamps.
                const gx=grilleW/2,gz=mount+depth+.03,gt=cy+fh/2+H*.012;
                for(const s of [-1,1])tube('metal',[[s*gx,yy,front+.050],[s*gx,cy-fh*.35,gz],[s*gx,gt-H*.02,gz],[s*gx*.92,gt,gz]],W*.012,'Brush guard');
                tube('metal',[[-gx*.92,gt,gz],[gx*.92,gt,gz]],W*.011,'Brush guard');tube('metal',[[-gx,cy-fh*.10,gz],[gx,cy-fh*.10,gz]],W*.008,'Brush guard');
                const skidZ=front+L*.026-.013;box('metal',[0,yy-H*.01,skidZ],[W*.35,H*.085,.020],.010,'Front skid plate');
                if(r.details)for(let j=0;j<5;j++)box('dark',[(j-2)*W*.052,yy-H*.01,skidZ+.0095],[W*.025,H*.040,.002],.003,'Skid plate slots');
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
    /** Flight craft. The pressure hull is a smooth superellipse loft
     * (Rounded) or a chined wedge of flat panels (Faceted, Armored; Armored
     * adds bolted side plates over a dark under-frame). Every style carries a
     * sealed, pressurised one-piece canopy faired into the hull with a seal
     * ring, framed bows and a rear spine fairing: no open back, no roof slab. */
    function flight(c){
        const {r,W,H,L,put,box,tube,sheet}=c,shuttle=r.form==='shuttle',bw=W*(shuttle?.235:.29),cy=H*.51,style=r.bodyStyle||'rounded';
        // A deep hull with the cockpit sunk into it: the canopy is a low, long fighter bubble, not a dome.
        const widths=[[-.50,.46],[-.38,.92],[-.15,1],[.12,.95],[.32,.70],[.49,.12]],heights=[[-.50,.16],[-.34,.28],[0,.28],[.23,.20],[.49,.05]];
        const yAt=z=>cy+H*.015*Math.sin((z/L+.5)/.99*pi);
        let skin,hullMesh;
        if(style==='rounded'){
            const rings=[];for(let j=0;j<=64;j++){const z=-L*.5+L*.99*j/64;rings.push([z,bw*section(widths,z/L),cy+H*.015*Math.sin(j/64*pi),H*section(heights,z/L)]);}
            hullMesh=put('paint',shell(rings,2.7,64),'Formed pressure hull');
            put('trim',shell([[-L*.46,bw*.45,H*.32,H*.06],[-L*.18,bw*.80,H*.29,H*.055],[L*.25,bw*.66,H*.34,H*.045],[L*.46,bw*.10,H*.46,H*.01]],2.6),'Ventral keel');
            skin=(z,a,offset=0)=>{const w=bw*section(widths,z/L),h=H*section(heights,z/L),y=yAt(z),co=Math.cos(a),si=Math.sin(a);return[Math.sign(co)*Math.abs(co)**(2/2.7)*(w+offset),y+Math.sign(si)*Math.abs(si)**(2/2.7)*(h+offset),z];};
        }else{
            // Few stations, straight between them: flat panels meeting at chines.
            // Each chine between flat panels is rolled over a short fillet (see soft()).
            const knots=[-.50,-.46,-.40,-.34,-.24,-.15,0,.12,.22,.30,.37,.43,.49],e=.012,poly=f=>knots.map(k=>[k,f(k)]),PW=poly(k=>bw*section(widths,k)),PY=poly(k=>yAt(L*k)),PH=poly(k=>H*section(heights,k));
            const rolled=[...new Set(knots.flatMap((k,i)=>i===0||i===knots.length-1?[k]:[k-e,k-e*.5,k,k+e*.5,k+e]))].sort((a,b)=>a-b);
            const stations=rolled.map(k=>({z:L*k,w:soft(PW,k,e),y:soft(PY,k,e),h:soft(PH,k,e)}));
            hullMesh=put('paint',HW.facetedLoft(stations,HW.HULL_SECTION),'Formed pressure hull');
            const keel=[[-.46,.45,.32,.06],[-.30,.70,.30,.058],[-.18,.80,.29,.055],[.25,.66,.34,.045],[.46,.10,.46,.012]].map(([z,w,y,h])=>({z:L*z,w:bw*w,y:H*y,h:H*h}));
            put('frame',HW.facetedLoft(keel,HW.BOX_SECTION),'Ventral keel');
            skin=HW.loftSkin(stations,HW.HULL_SECTION);
        }
        c.hullSkin=skin;
        const top=(z,x)=>HW.topOf(skin,z,x);
        // Cabin interior under a sealed bubble canopy.
        const roof=H*(.87+.35*(r.cabinHeight-1));
        const cp=HW.canopy(c,{skin,zRear:-L*.14,zFront:L*.335,zPeak:-L*.01,peakY:roof+H*.05,width:bw*.72,spineLength:L*(shuttle?.21:.15),bows:shuttle?[L*.17]:[L*.17,-L*.03],seal:H*.011,spineKind:style==='armored'?'armor':'secondary'});
        if(r.interior)c.cabinSeats=flightCabin(c,hullMesh,cp,{zRear:-L*.14,zFront:L*.335,cy});
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
                const x=s*bw*.82,up=[x,H*.40,z],knee=[x+s*W*.025,H*.17,z-L*.025],foot=[x+s*W*.04,H*.045,z];const xm=(x+foot[0])/2,hw=W*.07,wl=L*.13,yb=up[1];
                // A gear well in the belly and two doors hung from its long edges: open beside the leg while it
                // stands, swung shut under it once the leg has drawn up into the hull.
                box('dark',[xm,yb+.003,z],[hw*2,.008,wl],.003,'Landing gear wells');
                for(const e of [-1,1])box('paint',[xm+e*hw,yb-hw/2,z],[.012,hw,wl*.96],.004,'Landing gear doors');
                (c.struts||(c.struts=[])).push({at:up.slice(),pad:[foot[0],H*.026,z],reach:Math.max(W*.08,L*.07),well:{x:xm,y:yb,z,hw,lift:yb-H*.004}});
                tube('trim',[up,knee],H*.025,'Landing strut housings');tube('metal',[knee,foot],H*.014,'Landing pistons');
                tube('metal',[[x,H*.32,z-L*.045],foot],H*.009,'Landing braces');box('trim',[foot[0],H*.026,z],[W*.095,H*.052,L*.095],.025,'Landing feet');
                if(r.details&&style!=='rounded')HW.pistonPair(c,[x,H*.36,z+L*.03],[foot[0],H*.07,z+L*.012],H*.007,[0,0,1],'Landing gear dampers');
            }
            if(shuttle){
                stabilizer(c,s,bw);
                tube('accent',[[s*bw*.80,H*1.13,-L*.39],[s*bw*.80,H*1.13,-L*.46]],H*.003,'Stabilizer tips');
            }else{
                // Downward lift ducts integrated into each side chine.
                for(const z of [-L*.16,L*.14]){
                    const x=s*W*.285,F=CM.frame([x,H*.40,z],[1,0,0],[0,0,-1]),rr=Math.min(W*.115,L*.08)*r.engineSize;(c.fans||(c.fans=[])).push({at:F.o.slice(),radius:rr});
                    round(c,'paint',F,[[rr*.75,-H*.09],[rr,-H*.07],[rr,H*.015],[rr*.84,H*.035],[rr*.75,H*.02],[rr*.75,-H*.09]],'Lift fan shrouds');
                    round(c,'dark',F,[[0,-H*.05],[rr*.77,-H*.05]],'Lift fan wells');
                    round(c,'metal',F,[[0,-H*.04],[rr*.17,-H*.04],[rr*.17,H*.016],[0,H*.016]],'Lift fan hubs');
                    if(r.details)for(let j=0;j<8;j++){const a=j/8*2*pi;const pts=[[.18,-.08],[.72,-.13],[.79,.07],[.23,.10]].map(([u,v])=>add(F.o,add(scale(F.u,rr*(u*Math.cos(a)-v*Math.sin(a))),add(scale(F.v,rr*(u*Math.sin(a)+v*Math.cos(a))),scale(F.n,-H*.019)))));sheet('metal',pts,H*.006,'Lift fan blades');}
                    if(r.details)for(let j=0;j<4;j++){const a=j/4*2*pi+pi/4;tube('metal',[add(F.o,add(scale(F.u,Math.cos(a)*rr*.2),scale(F.v,Math.sin(a)*rr*.2))),add(F.o,add(scale(F.u,Math.cos(a)*rr*.93),scale(F.v,Math.sin(a)*rr*.93)))],H*.004,'Lift fan guards');}
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
        const panelContext={...c,patchCenter:[0,cy,0]};
        for(const s of [-1,1]){
            const angle=t=>s===1?t:pi-t;
            if(style==='armored'){
                // Bolted side plates; the equipment-bay name keeps lettering and fasteners.
                for(const [z0,z1]of [[-.33,-.12],[-.10,.04],[.06,.28]]){const A=L*z0,B=L*z1,lo=angle(-.17),hi=angle(.25);
                    HW.armorPlate(c,[skin(A,lo),skin(B,lo),skin(B,hi),skin(A,hi)],{kind:'secondary',name:'Formed side equipment bays',out:[s,0,0],thickness:H*.016,probe:(u,v)=>skin(mix(A,B,u),angle(mix(-.17,.25,v))),boltPitch:.28});}
            }else{
                patch(panelContext,'trim',(u,v)=>skin(mix(-L*.34,L*.29,u),angle(mix(-.24,.32,v)),H*.007),'Side equipment bay seals');
                patch(panelContext,'secondary',(u,v)=>skin(mix(-L*.33,L*.28,u),angle(mix(-.21,.29,v)),H*.010),'Formed side equipment bays');
            }
            patch(panelContext,'trim',(u,v)=>skin(mix(L*.33,L*.448,u),angle(mix(.43,1.10,v)),H*.006),'Nose panel seal');
            patch(panelContext,'secondary',(u,v)=>skin(mix(L*.334,L*.444,u),angle(mix(.46,1.07,v)),H*.009),'Nose access panels');
            tube(r.lights?'light':'dark',Array.from({length:25},(_,i)=>skin(mix(L*.36,L*.425,i/24),angle(.20),H*.015)),H*.0055,'Nose running lights');
            if(r.details){
                for(let j=0;j<6;j++)tube('metal',Array.from({length:13},(_,k)=>skin(-L*(.19+j*.018),angle(mix(-.10,.20,k/12)),H*.014+(style==='armored'?H*.02:0))),H*.0025,'Equipment bay cooling ribs');
                const p=skin(L*.02,angle(.035),H*.017+(style==='armored'?H*.018:0));box('trim',p,[W*.012,H*.025,L*.055],.006,'Equipment bay handles');
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
                // Flush maintenance tiles on the dorsal engine deck, beside the spine.
                const z=-L*.30,x=s*bw*.58,y=top(z,Math.abs(x)+bw*.12);box('trim',[x,y+H*.006,z],[bw*.26,H*.025,L*.11],.012,'Dorsal service recess');
                for(let j=0;j<7;j++)box('metal',[x,y+H*.022,z+(j-3)*L*.013],[bw*.21,H*.006,L*.005],.002,'Heat exchanger fins');
                tube('dark',[[s*bw*.68,H*.67,-L*.32],[s*bw*.83,H*.70,-L*.29],[s*bw*.83,H*.70,-L*.16]],H*.008,'Coolant lines');
            }
        }
        if(r.cargo>.05){const z=-L*.40,y=top(z,0);box('trim',[0,y+H*.005,z],[bw*.7,H*.025,L*.14],.012,'Cargo deck mount');box('cargo',[0,y+H*(.02+.06*r.cargo),z],[bw*.62,H*.12*r.cargo,L*.12],.025,'Deck cargo');}
        // Fitting anchors: what Detail density may add.
        const up=(z,x)=>CM.frame([x,top(z,Math.abs(x)),z],[1,0,0],[0,0,-1]),side=(z,a,s,off=0)=>{const p=skin(z,s>0?a:pi-a,off),q=skin(z,(s>0?a:pi-a)+(s>0?.01:-.01),off),n=norm([p[0]*(s>0?1:1),0,0]),v=norm(sub(q,p));return CM.frame(p,[0,0,-s],norm(sub(v,scale(n,dot(v,n)))));};
        const anchors=[];
        for(const s of [-1,1]){
            anchors.push({kind:'antenna',F:up(-L*.20,s*bw*.34),size:[H*.05,H*.30],face:'dorsal',priority:.9});
            anchors.push({kind:'vent',F:up(-L*.40,s*bw*.45),size:[bw*.30,L*.07],face:'dorsal',priority:.6});
            anchors.push({kind:'cable',F:side(-L*.05,-.42,s,H*.002),size:[L*.30,H*.02],face:'flank'+s,priority:.5});
            anchors.push({kind:'handle',F:side(-L*.42,.05,s,H*.004),size:[L*.06,H*.04],face:'aft'+s,priority:.7});
            anchors.push({kind:'lightCage',F:CM.frame(skin(L*.30,s>0?-.95:pi+.95,H*.003),[0,0,1],[-1,0,0]),size:[H*.07,H*.07],face:'chin',priority:.55});
        }
        anchors.push({kind:'sensor',F:CM.frame(skin(L*.38,-pi/2,H*.002),[1,0,0],[0,0,1]),size:[bw*.22,L*.05],face:'chin',priority:.85});
        HW.fittings(c,anchors,r.detailDensity??.6,2);
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
        const {r,W,H,L,R,seat,engine,box,tube,sheet,put,glazing}=c,styled=(r.bodyStyle||'rounded')!=='rounded';
        // Faceted and Armored fairings are chined flat panels instead of soft shells.
        const shell=(sections,e,sides)=>styled?HW.facetedLoft(sections.map(([z,w,y,h])=>({z,w,y,h})),HW.HULL_SECTION):shellRound(sections,e,sides);
        // Shaped tail, radiator, swingarm and final drive add a hierarchy of
        // real mechanical assemblies beneath the tank and body fairings.
        put('secondary',shell([[-L*.345,W*.045,seat+H*.010,H*.018],[-L*.27,W*.145,seat+H*.005,H*.037],[-L*.14,W*.16,seat-H*.025,H*.028]],2.7),'Sculpted tail cowl');
        const radiator=CM.frame([0,H*.51,L*.105],[1,0,0],[0,1,0]);
        put('trim',CM.slab(CM.rect(0,0,W*.40,H*.18),radiator,.018,.007,true),'Radiator surround');
        for(let j=0;j<11;j++)box('metal',[0,H*.51+(j-5)*H*.013,L*.105+.016],[W*.35,H*.003,.007],.002,'Radiator fins');
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
        // Armored: bolted guard plates over the tank flanks.
        if(r.bodyStyle==='armored')for(const s of [-1,1]){const x=s*W*.235,y0=seat-H*.11,y1=seat-H*.005,z0=-L*.05,z1=L*.10;HW.armorPlate(c,[[x,y0,z0],[x,y0,z1],[x,y1,z1],[x,y1,z0]],{kind:'armor',name:'Tank guard plates',out:[s,0,0],thickness:W*.02,gap:.006,boltPitch:.12,boltRadius:.006,standoff:.006});}
        if(r.fairing==='naked')return;
        // The nose sits ahead of the steering head and its bars, wrapping the headlamps; the screen rises from its top.
        put('paint',shell([[L*.225,W*.12,H*.79,H*.085],[L*.28,W*.29,H*.785,H*.12],[L*.335,W*.26,H*.785,H*.065],[L*.365,W*.20,H*.78,H*.040]],2.4),'Sculpted nose fairing');
        put('glass',glazing([[-W*.23,H*.855,L*.325],[W*.23,H*.855,L*.325],[W*.19,H*.975,L*.225],[-W*.19,H*.975,L*.225]],H*.014),'Curved windscreen');
        for(const s of [-1,1]){
            const sections=r.fairing==='full'?[[-L*.04,W*.035,H*.52,H*.12],[L*.08,W*.060,H*.53,H*.19],[L*.16,W*.055,H*.65,H*.20],[L*.23,W*.018,H*.78,H*.07]]:[[-L*.04,W*.025,H*.72,H*.035],[L*.08,W*.052,H*.72,H*.065],[L*.17,W*.040,H*.76,H*.09],[L*.23,W*.020,H*.80,H*.055]];
            const m=shell(sections,2.8,40);CM.transform(m,p=>add(p,[s*W*.235,0,0]));put('paint',m,'Side fairings');
            tube('accent',[[s*W*.28,H*.74,-L*.02],[s*W*.29,H*.77,L*.12],[s*W*.25,H*.78,L*.22]],W*.005,'Fairing character line');
            const F=CM.frame([s*W*.10,H*.78,L*.366],[1,0,0],[0,1,0]);round(c,'trim',F,[[0,0],[H*.028,0],[H*.028,.008],[0,.008]],'Fairing headlamp mounts',40);round(c,r.lights?'light':'dark',F,[[0,.009],[H*.021,.009],[H*.021,.012],[0,.012]],'Fairing headlamps',40);
        }
    }
    function drone(c){
        const {r,W,H,L,put,box,tube,sheet}=c,R=Math.min(W,L)*.17*r.engineSize,body=H*.55;c.motors=[];
        const styled=(r.bodyStyle||'rounded')!=='rounded',S=v=>({z:v[0],w:v[1],y:v[2],h:v[3]});
        const hull=[[-L*.24,W*.055,H*.49,H*.045],[-L*.15,W*.15,H*.51,H*.12],[0,W*.17,H*.52,H*.15],[L*.20,W*.115,H*.50,H*.10],[L*.28,W*.035,H*.48,H*.025]],belly=[[-L*.20,W*.09,H*.40,H*.035],[0,W*.155,H*.39,H*.045],[L*.21,W*.09,H*.41,H*.025]];
        // Armored: bolted plates over the shell's flanks and a belly guard.
        if(r.bodyStyle==='armored'){const st=[[-L*.25,W*.05,H*.49,H*.04],[-L*.20,W*.12,H*.50,H*.09],[-L*.12,W*.16,H*.51,H*.125],[L*.06,W*.17,H*.52,H*.15],[L*.18,W*.12,H*.505,H*.10],[L*.27,W*.045,H*.48,H*.03]].map(S),sk=HW.loftSkin(st,HW.HULL_SECTION);
            for(const s of [-1,1]){const A=-L*.12,B=L*.12,lo=s>0?-.25:pi+.25,hi=s>0?.45:pi-.45;HW.armorPlate(c,[sk(A,lo),sk(B,lo),sk(B,hi),sk(A,hi)],{kind:'armor',name:'Shell armor plates',out:[s,0,0],thickness:H*.025,gap:.006,boltPitch:.10,boltRadius:.005,cut:.02,probe:(u,v)=>sk(mix(A,B,u),s>0?mix(-.25,.45,v):pi-mix(-.25,.45,v))});}
            put('frame',CM.chamferBox([0,H*.335,0],[W*.20,H*.03,L*.30],H*.01),'Belly guard');}
        if(styled){put('paint',HW.facetedLoft([[-L*.25,W*.05,H*.49,H*.04],[-L*.20,W*.12,H*.50,H*.09],[-L*.12,W*.16,H*.51,H*.125],[L*.06,W*.17,H*.52,H*.15],[L*.18,W*.12,H*.505,H*.10],[L*.27,W*.045,H*.48,H*.03]].map(S),HW.HULL_SECTION),'Formed avionics shell');put('secondary',HW.facetedLoft(belly.map(S),HW.BOX_SECTION),'Avionics belly');}
        else{put('paint',shell(hull,2.9),'Formed avionics shell');put('secondary',shell(belly,3),'Avionics belly');}
        for(const sx of [-1,1])for(const sz of [-1,1]){
            const x=sx*(W*.5-R*.95),z=sz*(L*.5-R*.95),F=CM.frame([x,body,z],[1,0,0],[0,0,-1]);c.motors.push([x,body,z]);
            const a=[sx*W*.10,H*.51,sz*L*.10],b=[x,body-H*.015,z];
            if(styled){put('frame',beam(a,b,H*.07,H*.05),'Carbon motor booms');put('metal',beam(add(a,[0,-H*.04,0]),add(b,[0,-H*.04,0]),H*.02,H*.016),'Boom lower rails');}
            else{tube('trim',[a,b],H*.038,'Carbon motor booms');tube('metal',[add(a,[0,-H*.027,0]),add(b,[0,-H*.027,0])],H*.012,'Boom lower rails');}
            round(c,'trim',F,[[0,-H*.07],[R*.21,-H*.07],[R*.23,H*.018],[R*.16,H*.045],[0,H*.045]],'Brushless motor bodies',48);
            round(c,'metal',F,[[R*.205,-H*.025],[R*.225,-H*.025],[R*.225,H*.010],[R*.205,H*.010],[R*.205,-H*.025]],'Motor cooling collars',48);
            if(r.rotorGuard!=='open'){
                round(c,'paint',F,[[R*.90,-H*.055],[R,-H*.045],[R,H*.048],[R*.94,H*.067],[R*.89,H*.052],[R*.89,-H*.055],[R*.90,-H*.055]],'Rolled rotor ducts',80);
                if(styled){
                    // Flat stator vanes under the rotor, and a guard over it.
                    for(let j=0;j<4;j++){const a=j/4*2*pi+pi/4,dir=[Math.cos(a),0,Math.sin(a)],mid=[x+dir[0]*R*.56,body-H*.035,z+dir[2]*R*.56];put('frame',HS.plate(HS.rect(-R*.34,-H*.022,R*.34,H*.022),H*.008,H*.002,{frame:CM.frame(mid,dir,[0,1,0])}),'Motor support stators');}
                    if(r.rotorGuard==='ring')for(let j=0;j<6;j++){const a=j/6*2*pi;tube('metal',[[x+Math.cos(a)*R*.22,body+H*.062,z+Math.sin(a)*R*.22],[x+Math.cos(a)*R*.93,body+H*.062,z+Math.sin(a)*R*.93]],H*.0045,'Rotor guards');}
                    if(r.rotorGuard==='ring')tube('metal',Array.from({length:33},(_,k)=>{const a=k/32*2*pi;return[x+Math.cos(a)*R*.55,body+H*.062,z+Math.sin(a)*R*.55];}),H*.0045,'Rotor guards');
                }else for(let j=0;j<3;j++){const a=j/3*2*pi;tube('trim',[[x,body-H*.03,z],[x+Math.cos(a)*R*.91,body-H*.03,z+Math.sin(a)*R*.91]],H*.009,'Motor support stators');}
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
        const anchors=[];for(const s of [-1,1]){anchors.push({kind:'antenna',F:CM.frame([s*W*.05,H*.66,-L*.17],[1,0,0],[0,0,-1]),size:[W*.02,H*.30],face:'top',priority:s>0?.7:.3});anchors.push({kind:'cable',F:CM.frame([s*W*.27,H*.53,s*L*.27],norm([s*W*.6,0,s*L*.6]),[0,0,0].map((_,k)=>k===1?0:0).map((v,k)=>[-s*L*.6,0,s*W*.6][k])),size:[Math.hypot(W,L)*.18,H*.02],face:'boom'+s,priority:.5});}
        HW.fittings(c,anchors,r.detailDensity??.6,2);
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
    /** A straight chamfered beam (box section) from a to b; `up` orients its height. */
    function beam(a,b,w,h,up=[0,1,0],section=BOX){
        const axis=norm(sub(b,a)),len=Math.hypot(...sub(b,a)),u0=cross(up,axis),u=Math.hypot(...u0)<1e-6?norm(cross([1,0,0],axis)):norm(u0),v=cross(axis,u);
        const m=HW.facetedLoft([{z:0,w:w/2,y:0,h:h/2},{z:len,w:w/2,y:0,h:h/2}],section);
        const turn=p=>add(add(scale(u,p[0]),scale(v,p[1])),scale(axis,p[2]));CM.transform(m,p=>add(a,turn(p)),turn);return m;
    }
    const BOX=[[0,-1],[.72,-1],[1,-.72],[1,.72],[.72,1],[0,1]];
    /** Faceted/Armored limb: a dark chamfered under-frame beam carrying
     * chamfered cover plates on its front and outer side (Armored adds the
     * inner side too), seated off the frame with a shadow gap. */
    function plateLimb(c,a,b,width,depth,name,kind='paint',coverName=name+' cover plates'){
        const {r,put}=c,axis=norm(sub(b,a)),len=Math.hypot(...sub(b,a)),u=[1,0,0],v=norm(cross(axis,u)),side=Math.sign(a[0])||1;
        put('frame',beam(add(a,scale(axis,len*.06)),add(a,scale(axis,len*.92)),width*1.1,depth*1.05,v),name+' frames');
        const P=(t,x,y)=>add(add(a,scale(axis,len*t)),add(scale(u,x),scale(v,y)));
        const t=Math.max(.012,depth*.10),plate=(o,n,uu,outline,label,k=kind)=>{const vv=cross(n,uu);put(k,HS.plate(HS.cut(outline,Math.min(.05,width*.25)),t,t*.35,{frame:CM.frame(o,uu,vv)}),label);};
        // Front cover: tapered, from just below the upper joint to above the lower one.
        const front=v,fu=cross(axis,front);
        plate(P(.48,0,depth*.62+t/2),front,fu,[[-width*.60,-len*.33],[width*.60,-len*.33],[width*.48,len*.30],[-width*.48,len*.30]].map(([x,y])=>[x,-y]),coverName,kind);
        const sides=r.bodyStyle==='armored'?[-1,1]:[side];
        for(const s of sides){const n=scale(u,s),su=cross(axis,n);plate(P(.50,s*(width*.62+t/2),depth*.05),n,su,[[-depth*.55,-len*.28],[depth*.55,-len*.28],[depth*.42,len*.26],[-depth*.42,len*.26]],name+' side plates','secondary');}
        if(r.details)for(const s of [-1,1])for(const tt of [.26,.70])HW.bolt(c,CM.frame(P(tt,s*width*.42,depth*.62+t),[1,0,0],cross(front,[1,0,0])),Math.max(.007,width*.05));
    }
    /** Faceted/Armored walker: chamfered torso casting on a dark frame, plated
     * limbs, bolt-capped joint drums, piston pairs, vent banks and louvered
     * pauldrons. Names that carry lettering and fasteners are kept. */
    /** A one-seat cockpit pod sunk into the walker's torso behind its
     * windscreen: the skin under the glass is opened, a lined pod drops to
     * a floor on the lower frame, with a seat, twin control sticks on side
     * consoles and a dash under the glass. */
    function walkerCockpit(c,torso){
        const {r,W,H,L,put,tube}=c;if(!r.interior)return;
        const zb=L*.292,zt=L*.085,yb=H*.76,yt=H*.87,glassY=z=>yb+(yt-yb)*(zb-z)/(zb-zt),xw=W*.205,zf=zb-.03,zr=zt+.03;
        openSkin(torso,ccw([[-xw,zr],[xw,zr],[xw,zf],[-xw,zf]]),H*.68);Object.assign(torso,backed(torso,.02));
        const floor=H*.60,back=-L*.22,front=zf,top=z=>glassY(z)-.01,g=new CM.Geo(),lip=new CM.Geo();
        // Pod: side walls up to the glass line, a back wall, a front kick panel.
        const n=12;
        for(const s of [-1,1])for(let i=0;i<n;i++){const a=back+(front-back)*i/n,b=back+(front-back)*(i+1)/n,ya=Math.min(top(Math.max(a,zr)),H*.84),yb2=Math.min(top(Math.max(b,zr)),H*.84);g.poly([[s*xw,floor,a],[s*xw,floor,b],[s*xw,yb2,b],[s*xw,ya,a]],null,[-s,0,0]);}
        g.poly([[-xw,floor,back],[xw,floor,back],[xw,H*.84,back],[-xw,H*.84,back]],null,[0,0,1]);
        g.poly([[-xw,floor,front],[xw,floor,front],[xw,top(front),front],[-xw,top(front),front]],null,[0,0,-1]);
        // Ceiling over the rear of the pod, up to the opening's back edge.
        g.poly([[-xw,H*.84,back],[xw,H*.84,back],[xw,H*.84,zr],[-xw,H*.84,zr]],null,[0,-1,0]);
        put('secondary',solidify(g.done(),.012),'Cockpit tub liner');
        // Coaming round the opening, over the cut skin.
        const edge=[[-xw,top(zr)+.012,zr],[xw,top(zr)+.012,zr],[xw,top(zf)+.012,zf],[-xw,top(zf)+.012,zf]];
        for(let i=0;i<4;i++){const a=edge[i],b=edge[(i+1)%4],o=scale(norm(sub(scale(add(a,b),.5),[0,(a[1]+b[1])/2,(zr+zf)/2])),.06);lip.poly([a,b,add(b,o),add(a,o)],null,[0,1,.4]);}
        put('trim',solidify(lip.done(),.008),'Cockpit coaming');
        put('dark',CM.roundedBox([0,floor+.01,(back+front)/2],[xw*1.9,.02,front-back-.02],.006,2),'Cabin floor');
        const k=Math.max(.6,Math.min(1,(H*.84-floor-.30)/.92,xw/.40)),hip=[0,floor+.30*k,back+.34*k];
        seatUnit(c,hip,{k,width:.54,floor,recline:.22});
        for(const s of [-1,1]){
            const con=[s*(xw-.10*k),floor+.30*k,hip[2]+.30*k];
            put('trim',CM.roundedBox([con[0],(floor+con[1]+.12*k)/2,con[2]],[.14*k,con[1]+.12*k-floor,.40*k],.03,2),'Center console');
            const base=[con[0],con[1]+.12*k,con[2]+.10*k];tube('metal',[base,add(base,[0,.10*k,.02])],.010,'Throttle levers');
            put('rubber',CM.roundedBox(add(base,[0,.14*k,.025]),[.045*k,.09*k,.05*k],.018,2),'Cabin steering wheel');
        }
        const dashZ=front-.10,dashY=Math.min(top(dashZ)-.06,floor+.75*k);
        put('trim',CM.roundedBox([0,dashY-.08*k,dashZ],[xw*1.8,.16*k,.18],.03,2),'Dashboard housing');
        const face=CM.frame([0,dashY-.05*k,dashZ-.092],[1,0,0],[0,.9,.43]);
        for(const s of [-1,0,1])put(r.lights?'glow':'metal',CM.slab(CM.rect(s*xw*.55,0,xw*.42,.07*k),face,.002,.0006,true),'Dashboard status strips');
    }
    function walkerStyled(c){
        const {r,W,H,L,put,box,tube,sheet,glazing}=c,hip=H*.43,knee=H*.25,ankle=H*.09,spread=W*.22*r.stance,armored=r.bodyStyle==='armored';
        put('frame',beam([0,hip,-L*.19],[0,hip,L*.19],W*.45,H*.065),'Hip cradle');
        const waist=CM.frame([0,H*.50,0],[1,0,0],[0,0,-1]);
        round(c,'metal',waist,[[0,-H*.055],[W*.19,-H*.055],[W*.19,-H*.015],[W*.16,0],[W*.16,H*.025],[0,H*.025]],'Waist bearing');
        put('frame',beam([0,H*.505,0],[0,H*.60,0],W*.16,W*.16,[0,0,1]),'Torso load spine');
        for(const s of [-1,1])HW.pistonPair(c,[s*W*.09,H*.51,-L*.04],[s*W*.15,H*.60,-L*.07],H*.007,[0,0,1],'Torso stabilizers');
        round(c,'trim',waist,[[W*.16,-H*.011],[W*.18,-H*.011],[W*.18,H*.001],[W*.16,H*.001],[W*.16,-H*.011]],'Waist bearing seal');
        const torso=[[-.33,.24,.70,.085],[-.25,.33,.70,.135],[-.15,.345,.70,.14],[.10,.35,.71,.14],[.22,.31,.69,.10],[.29,.26,.675,.070],[.33,.20,.665,.060]].map(([z,w,y,h])=>({z:L*z,w:W*w,y:H*y,h:H*h}));
        const torsoMesh=put('paint',HW.facetedLoft(torso,HW.BOX_SECTION),'Cast torso housing');walkerCockpit(c,torsoMesh);
        put('frame',HW.facetedLoft([{z:-L*.29,w:W*.21,y:H*.59,h:H*.025},{z:L*.17,w:W*.29,y:H*.59,h:H*.035},{z:L*.28,w:W*.20,y:H*.63,h:H*.025}],HW.BOX_SECTION),'Torso lower frame');
        const skin=HW.loftSkin(torso,HW.BOX_SECTION);
        const windshield=[[-W*.245,H*.76,L*.292],[W*.245,H*.76,L*.292],[W*.22,H*.87,L*.085],[-W*.22,H*.87,L*.085]];
        put('glass',glazing(windshield,H*.006),'Walker cockpit glass');
        windowFrame(c,windshield,H*.006,'Cockpit',.075);paneRail(c,windshield,H*.006,H*.005,'trim','Cockpit mullion');
        sheet('secondary',[[-W*.27,H*.65,L*.325],[W*.27,H*.65,L*.325],[W*.24,H*.748,L*.31],[-W*.24,H*.748,L*.31]],H*(.008+.013*r.armor),'Sloped chest plate');
        const eye=CM.frame([0,H*.696,L*.35],[1,0,0],[0,1,0]);round(c,'metal',eye,[[H*.025,0],[H*.032,.010],[H*.030,.026],[H*.021,.030],[H*.021,.007],[H*.025,0]],'Survey optic bezel');round(c,r.lights?'glow':'glass',eye,[[0,.021],[H*.020,.021],[H*.020,.024],[0,.024]],'Survey optic');
        for(const s of [-1,1]){
            // Torso side armor (Armored) or a vent bank either way, aft.
            if(armored){const A=-L*.20,B=L*.08,y0=H*.625,y1=H*.795,P=(z,y)=>[s*skin(z,0)[0],y,z];
                HW.armorPlate(c,[P(A,y0),P(B,y0),P(B,y1),P(A,y1)],{kind:'armor',name:'Torso armor plates',out:[s,0,0],thickness:H*(.008+.008*r.armor),probe:(u,v)=>P(mix(A,B,u),mix(y0,y1,v)),boltPitch:.22});
                const zt0=-L*.29,zt1=-L*.04,x0=s*W*.03,x1=s*W*.27,T=(x,z)=>[x,skin(z,pi/2)[1],z];
                HW.armorPlate(c,[T(x0,zt0),T(x1,zt0),T(x1,zt1),T(x0,zt1)],{kind:'armor',name:'Torso armor plates',out:[0,1,0],thickness:H*.010,boltPitch:.24});}
            const vz=-L*.27,vx=skin(vz,0)[0];HW.ventBank(c,CM.frame([s*(vx+.002),H*.70,vz],[0,0,-s],[0,1,0]),L*.075,H*.10,5,'Walker side vent banks');
            const a=[s*spread,hip,0],b=[s*spread*1.08,knee,L*.10],d=[s*spread,ankle,-L*.05],shoulder=[s*W*.40,H*.75,0],elbow=[s*W*.44,H*.58,L*.04],hand=[s*W*.43,H*.48,L*.20];
            plateLimb(c,a,b,W*(.11+.03*r.armor),L*.16,'Tapered thigh armor');plateLimb(c,b,d,W*(.12+.03*r.armor),L*.17,'Tapered shin armor','armor','Tapered shin armor cover plates');
            for(const p of [a,b,d])HW.joint(c,[p[0]+s*W*.085,p[1],p[2]],[s,0,0],H*.05,W*.14);
            // Hip faulds: angled plates hanging off the cradle over the thigh roots.
            for(const z of [L*.20,-L*.20]){const dir=Math.sign(z),u=[dir,0,0],v=norm([0,1,dir*.28]);put('armor',HS.plate(HS.cut(HS.rect(-W*.10,-H*.055,W*.10,H*.055),W*.03),H*.016,H*.005,{frame:CM.frame([s*W*.13,hip-H*.035,z+dir*L*.03],u,v)}),'Hip faulds');}
            // Piston pairs behind each leg segment.
            if(r.details)for(const [p,q]of [[a,b],[b,d]]){const ax=norm(sub(q,p)),back=scale(norm(cross(ax,[1,0,0])),-L*.10);HW.pistonPair(c,add(add(p,scale(sub(q,p),.12)),back),add(add(p,scale(sub(q,p),.86)),back),H*.009,[1,0,0],'Leg hydraulics');}
            const kneeFrame=CM.frame([b[0],b[1],b[2]+L*.16],[1,0,0],[0,1,0]);put('frame',HS.plate(HS.cut(HS.rect(-W*.085,-H*.027,W*.085,H*.027),W*.02),H*.014,H*.003,{frame:kneeFrame}),'Knee cap seals');put('armor',HS.plate(HS.cut(HS.rect(-W*.075,-H*.022,W*.075,H*.022),W*.025),H*(.010+.012*r.armor),H*.004,{frame:{...kneeFrame,o:add(kneeFrame.o,[0,0,H*.014])}}),'Knee caps');
            put('trim',CM.chamferBox([d[0],H*.030,-L*.04],[W*.29,H*.060,L*.40],H*.012),'Foot soles');
            put('paint',(()=>{const m=HW.facetedLoft([{z:-L*.23,w:W*.11,y:H*.072,h:H*.022},{z:-L*.09,w:W*.135,y:H*.087,h:H*.040},{z:L*.12,w:W*.14,y:H*.067,h:H*.024},{z:L*.20,w:W*.125,y:H*.060,h:H*.015}],HW.RIDGE_SECTION);CM.transform(m,p=>add(p,[d[0],0,0]));return m;})(),'Foot instep armor');
            for(let j=0;j<3;j++){const x=d[0]+(j-1)*W*.083;put('metal',CM.chamferBox([x,H*.047,L*.215],[W*.076,H*.055,L*.14],H*.008),'Articulated toes');put('trim',CM.chamferBox([x,H*.022,L*.22],[W*.072,H*.012,L*.12],H*.003),'Toe pads');}
            tube('metal',[[s*W*.25,H*.75,0],shoulder],H*.030,'Shoulder axle');
            plateLimb(c,shoulder,elbow,W*.10,L*.13,'Upper arm castings');plateLimb(c,elbow,hand,W*.072,L*.10,'Forearm castings','armor');
            // Louvered pauldron: stacked, angled chamfered plates over a dark cowl frame.
            put('frame',beam([shoulder[0],H*.765,-L*.20],[shoulder[0],H*.765,L*.20],W*.15,H*.09),'Pauldron frames');
            for(let k=0;k<3;k++){const th=.30+.42*k,n=norm([s*Math.sin(th),Math.cos(th),0]),u=[0,0,1],v=cross(n,u),o=[shoulder[0]+s*W*(.010+.045*k),H*(.815-.034*k),0];
                put('paint',HS.plate(HS.cut(HS.rect(-L*(.235-.02*k),-W*.055,L*(.235-.02*k),W*.055),W*.03),H*.016,H*.005,{frame:CM.frame(o,u,v)}),'Louvered pauldrons');}
            const shoulderFace=CM.frame([shoulder[0],H*.75,L*.223],[1,0,0],[0,1,0]);
            put('trim',CM.slab(CM.rect(0,0,W*.15,H*.062),shoulderFace,H*.003,.013,true),'Shoulder service seals');
            put('secondary',CM.slab(CM.rect(0,0,W*.13,H*.052),{...shoulderFace,o:add(shoulderFace.o,[0,0,H*.004])},H*.004,.012,true),'Shoulder service plates');
            if(r.details)for(const dx of [-1,1])for(const dy of [-1,1])c.bolt([shoulder[0]+dx*W*.043,H*(.75+dy*.016),L*.223+H*.009]);
            for(const p of [elbow,hand])HW.joint(c,p,[s,0,0],H*.028,W*.075,{name:'Arm bearings'});
            if(r.tool==='claw'){
                put('trim',CM.chamferBox(hand,[W*.12,H*.04,L*.11],H*.008),'Claw wrist');
                for(const t of [-1,1]){const p=add(hand,[t*W*.038,-H*.03,L*.025]),q=add(hand,[t*W*.065,-H*.065,L*.09]),tip=add(hand,[t*W*.025,-H*.11,L*.15]);put('metal',beam(p,q,H*.022,H*.016,[t,0,0]),'Articulated claw fingers');put('metal',beam(q,tip,H*.018,H*.013,[t,0,0]),'Articulated claw fingers');tube('trim',[add(hand,[0,-H*.015,0]),q],H*.008,'Claw actuator rods');}
            }else if(r.tool==='welder'){
                tube('trim',[hand,add(hand,[0,-H*.015,L*.17])],H*.023,'Welding tool');const F=CM.frame(add(hand,[0,-H*.015,L*.17]),[1,0,0],[0,1,0]);round(c,'metal',F,[[H*.024,0],[H*.027,.020],[H*.016,.040],[H*.010,.040],[H*.016,.020],[H*.024,0]],'Welding nozzle');round(c,r.lights?'glow':'dark',F,[[0,.025],[H*.010,.025]],'Welding emitter');
            }
            if(r.details){
                tube('dark',Array.from({length:33},(_,j)=>{const t=j/32;return[s*mix(W*.25,W*.43,t),H*(.77-.17*t)+Math.sin(pi*t)*H*.045,-L*.12-Math.sin(pi*t)*L*.06];}),H*.009,'Arm service hoses');
                grille(c,CM.frame([s*W*.14,H*.70,-L*.33+H*.0001],[1,0,0],[0,-1,0]),W*.15,H*.10,H*.012,7,'Walker rear cooling grille');
                box('trim',[s*W*.15,H*.693,L*.346],[W*.12,H*.045,.009],.010,'Chest service recess');for(let j=0;j<3;j++)box('metal',[s*W*.15,H*.693+(j-1)*H*.011,L*.352],[W*.10,H*.003,.006],.002,'Chest cooling slats');
            }
        }
        // Fittings: aerials, a sensor pod, a work lamp and cable runs.
        const topY=z=>skin(z,pi/2)[1],anchors=[];
        for(const s of [-1,1]){anchors.push({kind:'antenna',F:CM.frame([s*W*.19,topY(-L*.22),-L*.22],[1,0,0],[0,0,-1]),size:[W*.03,H*.13],face:'top',priority:.9});
            anchors.push({kind:'handle',F:CM.frame([s*skin(-L*.05,0)[0],H*.80,-L*.05],[0,0,-s],[0,1,0]),size:[L*.09,H*.03],face:'side'+s,priority:.4});}
        anchors.push({kind:'sensor',F:CM.frame([0,topY(L*.04)+.002,L*.03],[1,0,0],[0,0,-1]),size:[W*.09,L*.07],face:'top',priority:.8});
        anchors.push({kind:'lightCage',F:CM.frame([W*.20,topY(L*.0),L*.06],[1,0,0],[0,1,0]),size:[H*.05,H*.05],face:'top',priority:.6,post:H*.012});
        anchors.push({kind:'cable',F:CM.frame([0,topY(-L*.30),-L*.30],[1,0,0],[0,0,-1]),size:[W*.30,H*.02],face:'aft',priority:.5});
        HW.fittings(c,anchors,r.detailDensity??.6,3);
    }
    function walker(c){
        if((c.r.bodyStyle||'rounded')!=='rounded')return walkerStyled(c);
        const {r,W,H,L,put,box,tube,sheet,glazing}=c,hip=H*.43,knee=H*.25,ankle=H*.09,spread=W*.22*r.stance;
        // A turntable waist with a load-bearing spine and a cast hip cradle.
        box('trim',[0,hip,0],[W*.45,H*.065,L*.38],.06,'Hip cradle');
        const waist=CM.frame([0,H*.50,0],[1,0,0],[0,0,-1]);
        round(c,'metal',waist,[[0,-H*.055],[W*.19,-H*.055],[W*.19,-H*.015],[W*.16,0],[W*.16,H*.025],[0,H*.025]],'Waist bearing');
        tube('trim',[[0,H*.51,0],[0,H*.59,0]],W*.105,'Torso load spine');
        for(const s of [-1,1])tube('metal',[[s*W*.09,H*.51,-L*.03],[s*W*.15,H*.60,-L*.06]],H*.014,'Torso stabilizers');
        round(c,'trim',waist,[[W*.16,-H*.011],[W*.18,-H*.011],[W*.18,H*.001],[W*.16,H*.001],[W*.16,-H*.011]],'Waist bearing seal');
        walkerCockpit(c,put('paint',shell([[-L*.33,W*.24,H*.70,H*.085],[-L*.23,W*.34,H*.70,H*.14],[L*.10,W*.35,H*.71,H*.14],[L*.29,W*.26,H*.675,H*.070],[L*.33,W*.20,H*.665,H*.060]],5.0,64),'Cast torso housing'));
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
    const api={DESIGN,drape,shell,loft,pressed,filletBox,contour,windowFrame,roadWindows,roadProfile,roadBody,roadAnchors,lampUnit,wheel,RIM_STYLES,roadDetails,roadFace,section,flight,seatUnit,openSkin,turbine,round,bike,drone,walker,grille,cabin};root.RRVehicleBodywork=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
