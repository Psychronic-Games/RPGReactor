/** Aircraft and spacecraft with separate structural, habitation and boarding envelopes. */
(function(root){'use strict';
const CM=root.RRContainerMesh||(typeof require==='function'?require('./ContainerMesh.js'):null),{add,sub,scale,norm,cross}=CM.vec;
const IDS=new Set(['jet','helicopter','starfighter','starship','freighter','airliner']);
function build(c){const {r,W,H,L,put,box,tube,sheet}=c,f=r.form;if(!IDS.has(f))return false;
const round=(role,p,profile,N=64,axis='z',name=role)=>put(role,CM.revolveOn(CM.frame(p,axis==='x'?[0,1,0]:[1,0,0],axis==='y'?[0,0,-1]:axis==='x'?[0,0,1]:[0,1,0]),0,0,profile,N),name);
const ring=(role,p,R,t=.035,axis='z',name='Hull collars')=>round(role,p,[[R-t,-t],[R,-t],[R,t],[R-t,t],[R-t,-t]],96,axis,name);
const beam=(p,q,R=.025,name='Structural struts',role='metal')=>tube(role,[p,q],R,name);
const screw=(p,R=.012)=>round('metal',p,[[0,0],[R,0],[R,.005],[0,.005]],16,'z','Seated fasteners');
const lines=(x,y,z,w,n=12)=>{for(let j=0;j<n;j++)box('dark',[x+(j-(n-1)/2)*w/n,y,z],[w/n*.4,.035,.009],.002,'Cooling louvres');};
// Closed airfoil sections, with a rounded leading edge, finite trailing edge and spanwise taper.
const foil=(role,side,x0,x1,zf0,zb0,zf1,zb1,y0,y1,thick,name,vertical=false)=>{const g=new CM.Geo(),S=5,K=20,at=(j,k,upper)=>{const t=j/S,q=k/K,x=x0+(x1-x0)*t,zf=zf0+(zf1-zf0)*t,zb=zb0+(zb1-zb0)*t,profile=5*(.2969*Math.sqrt(q)-.126*q-.3516*q*q+.2843*q*q*q-.1036*q*q*q*q),dy=profile*thick*(1-.66*t)*(upper?1:-1)+.008*Math.abs(zf-zb)*Math.sin(Math.PI*q);return vertical?[side*(x0+(y1-y0)*t*.34+dy),y0+(y1-y0)*t,zf+(zb-zf)*q]:[side*x,y0+(y1-y0)*t+dy,zf+(zb-zf)*q];};for(const upper of [true,false])for(let j=0;j<S;j++)for(let k=0;k<K;k++)g.poly([at(j,k,upper),at(j+1,k,upper),at(j+1,k+1,upper),at(j,k+1,upper)],null,vertical?[side*(upper?1:-1),0,0]:[0,upper?1:-1,0]);for(const j of [0,S])g.poly([...Array.from({length:K+1},(_,k)=>at(j,k,true)),...Array.from({length:K+1},(_,k)=>at(j,K-k,false))],null,vertical?[0,j===0?-1:1,0]:[side*(j===0?-1:1),0,0]);put(role,CM.smoothNormals(g.done(),.72),name);};
let turbineSerial=0;
const pressurePanel=(w,h,r,F,depth)=>{const g=new CM.Geo(),A=8,B=20,rows=[];for(const front of [false,true]){const grid=[];for(let j=0;j<=B;j++){const y=(j/B-.5)*h,d=Math.max(0,Math.abs(y)-(h/2-r)),hw=w/2-r+Math.sqrt(Math.max(0,r*r-d*d));grid.push(Array.from({length:A+1},(_,k)=>add(add(add(F.o,scale(F.u,(k/A*2-1)*hw)),scale(F.v,y)),scale(F.n,front?depth:0))));}rows.push(grid);for(let j=0;j<B;j++)for(let k=0;k<A;k++)g.poly([grid[j][k],grid[j][k+1],grid[j+1][k+1],grid[j+1][k]],null,scale(F.n,front?1:-1));}const rim=[];for(let k=0;k<A;k++)rim.push([0,k]);for(let j=0;j<B;j++)rim.push([j,A]);for(let k=A;k>0;k--)rim.push([B,k]);for(let j=B;j>0;j--)rim.push([j,0]);for(let i=0;i<rim.length;i++){const [j,k]=rim[i],[y,x]=rim[(i+1)%rim.length];g.poly([rows[0][j][k],rows[0][y][x],rows[1][y][x],rows[1][j][k]],null,norm(sub(rows[0][j][k],F.o)));}return g.done();};
// `steps` coarsens the rounding for a whole cabin of seats; a cockpit's few seats stay fully rounded.
const seat=(p,s=1,name='Flight seat',steps=0)=>{const soft=(role,q,size,b,label)=>steps?put(role,CM.roundedBox(q,size,b,steps),label):box(role,q,size,b,label);put('trim',CM.chamferBox(add(p,[0,.010*s,0]),[.43*s,.04*s,.40*s],.008*s),name+' seat pan');soft('seat',add(p,[0,.09*s,0]),[.46*s,.15*s,.45*s],.045*s,name+' cushion');soft('seat',add(p,[0,.43*s,-.19*s]),[.46*s,.63*s,.10*s],.035*s,name+' back');soft('trim',add(p,[0,.76*s,-.18*s]),[.29*s,.17*s,.11*s],.035*s,name+' headrest');for(const sign of [-1,1]){put('trim',CM.roundedBox(add(p,[sign*.26*s,.32*s,.01*s]),[.045*s,.045*s,.35*s],.012*s,steps||2),name+' armrest');beam(add(p,[sign*.17*s,.015*s,0]),add(p,[sign*.17*s,-.30*s,0]),.015*s,name+' supports');beam(add(p,[sign*.25*s,.08*s,-.10*s]),add(p,[sign*.25*s,.32*s,-.10*s]),.012*s,name+' armrest supports');}return p;};
const instrument=(p,w=.65)=>{box('trim',p,[w,.27,.18],.025,'Flight instrument panel');for(let j=0;j<3;j++){box('dark',add(p,[(j-1)*w*.29,0,-.095]),[w*.25,.19,.008],.008,'Instrument bezels');box('light',add(p,[(j-1)*w*.29,0,-.101]),[w*.20,.14,.005],.005,'Flight displays');for(let k=0;k<4;k++)box('accent',add(p,[(j-1)*w*.29+(k-1.5)*w*.044,-.084,-.106]),[.012,.006,.005],.001,'Instrument switches');}};
// Section [z, half width, center y, half height]. The cockpit is an actual opening in the upper shell.
const loft=(sections,{role='paint',name='Pressure hull',N=64,skip=()=>false,cutaway=false}={})=>{
 const g=new CM.Geo(),at=(s,k)=>{const a=k/N*Math.PI*2;return[Math.sin(a)*s[1],s[2]+Math.cos(a)*s[3],s[0]];};
 for(let j=0;j+1<sections.length;j++)for(let k=0;k<N;k++){const a=(k+.5)/N*Math.PI*2,z=(sections[j][0]+sections[j+1][0])/2;if(skip(z,a)||cutaway&&(Math.sin(a)<0||Math.cos(a)>.45))continue;g.poly([at(sections[j],k),at(sections[j+1],k),at(sections[j+1],k+1),at(sections[j],k+1)],null,[Math.sin(a),Math.cos(a),0]);}
 if(!cutaway){g.poly(Array.from({length:N},(_,k)=>at(sections[0],k)),null,[0,0,-1]);g.poly(Array.from({length:N},(_,k)=>at(sections.at(-1),k)),null,[0,0,1]);}put(role,CM.smoothNormals(g.done(),.72),name);
};
// Every window is sampled from the same stations and angular grid as its skin cutout.
const sampleSection=(sections,z)=>{for(let j=0;j+1<sections.length;j++)if(z<=sections[j+1][0]){const a=sections[j],b=sections[j+1],t=(z-a[0])/(b[0]-a[0]);return[z,...[1,2,3].map(k=>a[k]+(b[k]-a[k])*t)];}return sections.at(-1);};
const skinPoint=(sections,z,a)=>{const q=sampleSection(sections,z);return[Math.sin(a)*q[1],q[2]+Math.cos(a)*q[3],z];};
const glazedOpening=(sections,zs,k0,k1,N,name)=>{
 const g=new CM.Geo(),at=(z,k)=>skinPoint(sections,z,k/N*Math.PI*2);
 for(let j=0;j+1<zs.length;j++)for(let k=k0;k<k1;k++)g.poly([at(zs[j],k),at(zs[j+1],k),at(zs[j+1],k+1),at(zs[j],k+1)],null,[Math.sin((k+.5)/N*Math.PI*2),Math.cos((k+.5)/N*Math.PI*2),.3]);
 put('flightGlass',CM.smoothNormals(g.done(),.72),name);
 for(const k of [k0,k1])tube('trim',zs.map(z=>at(z,k)),.018,name+' side reveal');
 for(const z of [zs[0],zs.at(-1)])tube('trim',Array.from({length:k1-k0+1},(_,i)=>at(z,k0+i)),.018,name+' sill');
};
const engine=(x,y,z,R,len,name='Engine')=>{R*=r.engineSize;len*=.85+.15*r.engineSize;round('secondary',[x,y,z],[[0,-len*.5],[R*.80,-len*.5],[R,-len*.36],[R,len*.35],[R*.85,len*.50],[R*.66,len*.50],[R*.66,len*.32],[R*.82,len*.25],[R*.82,-len*.35],[0,-len*.35]],80,'z',name+' casing');ring('metal',[x,y,z-len*.5],R*.82,R*.10,'z',name+' exhaust rim');round('dark',[x,y,z-len*.47],[[0,0],[R*.66,0],[R*.66,.015],[0,.015]],64,'z',name+' exhaust');round('glow',[x,y,z-len*.503],[[0,0],[R*.45,0],[R*.45,.008],[0,.008]],64,'z',name+' core');if(['starfighter','starship','freighter'].includes(f)){round('paint',[x,y,z+len*.495],[[0,0],[R*.65,0],[R*.66,.02],[0,.03]],64,'z',name+' sealed forward bulkhead');for(let k=0;k<8;k++){const a=k/8*Math.PI*2;round('metal',[x+Math.cos(a)*R*.48,y+Math.sin(a)*R*.48,z+len*.53],[[0,0],[.015,0],[.015,.01],[0,.01]],12,'z',name+' bulkhead fasteners');}}if(['airliner','jet','helicopter'].includes(f)){const fanName='Intake turbine '+(++turbineSerial),g=new CM.Geo();for(let j=0;j<22;j++){const a=j/22*Math.PI*2,at=(r,t)=>[x+Math.cos(a+t)*r,y+Math.sin(a+t)*r,z+len*.37+(r/R-.4)*.025];g.poly([at(R*.15,0),at(R*.66,-.18),at(R*.66,-.10),at(R*.15,.15)],null,[0,0,1]);}put('fanBlade',g.done(),fanName);round('metal',[x,y,z+len*.40],[[0,0],[R*.16,0],[R*.14,.06],[0,.12]],48,'z',name+' spinner');(c.rotors||=[]).push({name:fanName,at:[x,y,z+len*.37],axis:[0,0,1]});}
 round('metal',[x,y,z-len*.38],[[0,0],[R*.35,0],[R*.26,.06],[0,.12]],48,'z',name+' exhaust cone');
 for(let k=0;k<16;k++){const a=k/16*Math.PI*2;beam([x+Math.cos(a)*R*.96,y+Math.sin(a)*R*.96,z-len*.32],[x+Math.cos(a)*R*.78,y+Math.sin(a)*R*.78,z-len*.52],R*.028,name+' nozzle petals');}};
const hatch=(x,y,z,side=1)=>{const F=CM.frame([x,y,z],[0,0,-side],[0,1,0]),w=.82,h=1.75;put('trim',CM.slab(CM.rect(0,0,w+.10,h+.10),F,.025,.035,true),'Flight access hatch seal');put('secondary',CM.slab(CM.rect(0,0,w,h),{...F,o:add(F.o,[side*.027,0,0])},.025,.035,true),'Flight access pressure hatch');beam([x+side*.055,y-.1,z-.12],[x+side*.055,y+.1,z-.12],.014,'Flight access latch');for(const yy of [-.60,.60])box('metal',[x+side*.045,y+yy,z+.39],[.045,.09,.05],.012,'Flight access hinges');};
const ladder=(x,z,top,side=1)=>{for(const dz of [-.20,.20])tube('metal',[[x+side*.32,.04,z+dz],[x+side*.08,top,z+dz]],.016,'Boarding steps rails');const n=Math.ceil(top/.26);for(let j=0;j<n;j++){const y=.12+j*(top-.12)/Math.max(1,n-1),xx=x+side*(.32-.24*y/top);beam([xx,y,z-.20],[xx,y,z+.20],.014,'Boarding steps rungs');}for(const dz of [-.2,.2])beam([x,top-.06,z+dz],[x+side*.1,top-.06,z+dz],.018,'Boarding steps mounts');};
const gear=(x,z,top,R=.20)=>{beam([x,top,z],[x,Math.max(R+.16,top*.44),z],.070,'Landing gear upper cylinder');beam([x,top*.53,z],[x,R+.04,z],.043,'Landing gear oleo');beam([x,R+.16,z],[x+.12,R,z],.030,'Landing gear fork');beam([x,R+.16,z],[x-.12,R,z],.030,'Landing gear fork');beam([x,top*.48,z],[x+.24,top,z-.38],.036,'Landing gear brace');round('rubber',[x,R,z],[[0,-.08],[R*.88,-.08],[R,-.045],[R,.045],[R*.88,.08],[0,.08]],64,'x','Landing tires');round('metal',[x+.085,R,z],[[0,0],[R*.46,0],[R*.46,.015],[0,.015]],48,'x','Landing hubs');};
if(f==='jet'||f==='starfighter'){
 const jet=f==='jet',cy=H*.39,bh=H*.17,bw=jet?W*.12:W*.105,z0=L*.12,z1=L*.34;
 const sections=[[-.48,.20],[-.41,.88],[-.27,1],[-.08,1.10],[.12,.91],[.22,.76],[.34,.49],[.44,.22],[.50,0]].map(([z,w])=>[z*L,bw*w,cy,bh*(.25+.75*w)]);
 loft(sections,{name:jet?'Stealth fuselage':'Central spacecraft pressure hull',N:jet?32:64,skip:(z,a)=>z>z0&&z<z1&&(a<1.1||a>Math.PI*2-1.1)});
 const canopyAt=(u,v)=>{const z=z0+(z1-z0)*v,a=(u*2-1)*1.1,w=bw*(.91-(v*.42)),b=bh*(.25+.75*(.91-v*.42));return[Math.sin(a)*w,cy+Math.cos(a)*b+Math.sin(Math.PI*v)*H*.19*Math.cos((u*2-1)*Math.PI/2),z];};
 const g=new CM.Geo(),offset=[0,r.canopyOpen*.14,-r.canopyOpen*L*.14];for(let j=0;j<24;j++)for(let k=0;k<36;k++)g.poly([canopyAt(k/36,j/24),canopyAt((k+1)/36,j/24),canopyAt((k+1)/36,(j+1)/24),canopyAt(k/36,(j+1)/24)].map(p=>add(p,offset)),null,[Math.sin((k/36*2-1)*1.1),1,0]);put('flightGlass',CM.smoothNormals(g.done(),.8),'Sliding cockpit canopy');
 for(const v of [0,1])tube('trim',Array.from({length:49},(_,i)=>add(canopyAt(i/48,v),offset)),.018,'Canopy bows');for(const u of [0,1]){tube('trim',Array.from({length:33},(_,i)=>add(canopyAt(u,i/32),offset)),.019,'Canopy sill');const p=canopyAt(u,0);beam(add(p,[0,-.014,-L*.16]),add(p,[0,-.014,L*.18]),.014,'Canopy slide rails');}
 const floor=cy-bh*.5;if(r.interior){box('liner',[0,floor,L*.23],[bw*1.2,.045,L*.22],.015,'Cockpit tub');seat([0,floor+.22,L*.20],jet?1:Math.min(1,H*.32));instrument([0,floor+.62,L*.275],.70);beam([0,floor+.15,L*.25],[0,floor+.46,L*.27],.013,'Control stick');}
 ladder(-bw*.86,L*.235,cy+bh*.32,-1);
 if(jet){for(const side of [-1,1]){
   foil('paint',side,bw*.72,W*.49*r.wingSpan,L*.10,-L*.32,-L*.16,-L*.35,cy-.03,cy-.09,.11,'Diamond wing');
   foil('secondary',side,bw*.70,W*.26,-L*.30,-L*.46,-L*.41,-L*.49,cy,cy+.03,.07,'Tailplane');
   foil('paint',side,bw*.77,bw*.77,-L*.28,-L*.46,-L*.39,-L*.46,cy+bh*.65,H*.97,.065,'Canted vertical stabilizer',true);
   const x=side*bw*.87;box('trim',[x,cy-.06,L*.015],[bw*.60,bh*.80,L*.18],.05,'Recessed intake housing');box('dark',[x,cy-.06,L*.108],[bw*.45,bh*.62,.012],.025,'Engine intake throat');
   engine(side*bw*.53,cy,-L*.32,bh*.65,L*.30,'Twin turbine');
   for(let j=0;j<4;j++)beam([side*bw*(.95+j*.48),cy-.015,-L*(.10+j*.035)],[side*bw*(1.1+j*.48),cy-.015,-L*(.25+j*.018)],.003,'Control surface seams','trim');
  }}else{
   // Two separated drive hulls and an open prow make a ship silhouette, with no aircraft tail.
   for(const side of [-1,1]){const x=side*W*.30;box('frame',[side*W*.18,cy,-L*.12],[W*.25,.16,L*.35],.03,'Engine crossbeam');loft([[-.47,.50],[-.33,1],[-.04,.9],[.15,.52],[.28,.12]].map(([z,w])=>[z*L,W*.085*w,cy,H*.21*w]),{name:'Drive hull '+side});
    // Offset the newly built pod, retaining its own shell and collars.
    const lists=c.groups.get('paint|Drive hull '+side);if(lists)for(const m of lists)CM.transform(m,p=>add(p,[x,0,0]),n=>n);
    engine(x,cy,-L*.31,H*.16,L*.31,'Vector drive');sheet('armor',[[x-side*W*.03,cy+H*.03,L*.18],[x+side*W*.12,cy+H*.02,L*.31],[x+side*W*.06,cy+H*.10,L*.20],[x-side*W*.06,cy+H*.10,-L*.12]],.065,'Forward sensor prongs');
    for(let j=0;j<5;j++)box('metal',[x,cy+H*.19,-L*(.08+j*.045)],[W*.13,.015,L*.028],.005,'Radiator fins');box('glow',[x,cy+H*.06,L*.24],[W*.035,.025,.07],.006,'Navigation apertures');}
  }
 gear(-bw*.7,-L*.19,cy-bh*.55,.19);gear(bw*.7,-L*.19,cy-bh*.55,.19);gear(0,L*.31,cy-bh*.4,.15);
 c.craft={boarding:'sliding canopy',cockpitClearance:[bw*1.2,H*.49,L*.22]};return true;
}
if(f==='helicopter'){
 const cy=H*.43,bw=W*.16,bh=H*.25,z0=L*.10,z1=L*.36,N=96;
 const sections=[[-.32,.12,-.02,.35],[-.26,.65,0,.80],[-.17,.96,0,.98],[-.04,1,0,1],[.10,1,0,1],[.22,.90,-.02,.94],[.31,.70,-.08,.78],[.40,.20,-.16,.39],[.43,0,-.18,.08]].map(([z,w,y,h])=>[z*L,bw*w,cy+y*H,bh*h]);
 const frontZ=L*.26,sideK=10,outerK=20;
 const glassZ=[...Array.from({length:17},(_,i)=>z0+(frontZ-z0)*i/16),...Array.from({length:13},(_,i)=>frontZ+(z1-frontZ)*i/12)],zs=[...new Set([...sections.map(s=>s[0]),...glassZ])].sort((a,b)=>a-b),detailed=zs.map(z=>sampleSection(sections,z));
 const inPane=(z,a)=>{a=a>Math.PI?a-2*Math.PI:a;const k=Math.abs(a)*N/(Math.PI*2);return z>z0&&z<z1&&k>(z<frontZ?sideK:1)&&k<outerK;};
 loft(detailed,{name:'Rotorcraft cabin shell',N,skip:inPane});
 for(const side of [-1,1]){
  glazedOpening(sections,zs.filter(z=>z>=z0&&z<=frontZ),side<0?-outerK:sideK,side<0?-sideK:outerK,N,'Pilot side window');
  glazedOpening(sections,zs.filter(z=>z>=frontZ&&z<=z1),side<0?-outerK:1,side<0?-1:outerK,N,'Panoramic cockpit glazing');
 }
 tube('paint',zs.filter(z=>z>=frontZ&&z<=z1).map(z=>skinPoint(sections,z,0)),.034,'Windshield center structural post');
 for(const z of [frontZ,z1])for(const side of [-1,1])screw(skinPoint(sections,z,side*.38),.010);
 // The access door and its window are moulded onto the same curved cabin side.
 const sideAt=(side,y,z,gap=0)=>{const q=sampleSection(sections,z),u=Math.max(-.99,Math.min(.99,(y-q[2])/q[3]));return[side*(q[1]*Math.sqrt(1-u*u)+gap),y,z];};
 const conform=(m,side,gap)=>CM.smoothNormals(CM.transform(CM.tessellate(m,.07),p=>sideAt(side,p[1],p[2],gap+side*(p[0]-side*bw*1.005)),n=>n),.72);
 for(const side of [-1,1]){
  const F=CM.frame([side*bw*1.005,cy,-L*.055],[0,0,-side],[0,1,0]);put('trim',conform(CM.slab(CM.rect(0,0,.89,1.58),F,.018,.045,true),side,.010),'Flight access door gasket');put('paint',conform(CM.slab(CM.rect(0,0,.82,1.52),F,.018,.045,true),side,.024),'Flight access cabin door');
  tube('metal',[sideAt(side,cy-.17,-L*.055-.22,.065),sideAt(side,cy-.05,-L*.055-.22,.065)],.014,'Flight access door handle');
  const g=new CM.Geo();for(let j=0;j<8;j++){const at=(u,v)=>sideAt(side,cy+.30+(u-.5)*.40,-L*.06+(v-.5)*.61,.047);g.poly([at(j/8,0),at(j/8,1),at((j+1)/8,1),at((j+1)/8,0)],null,[side,0,0]);}put('flightGlass',g.done(),'Cabin door window');
  for(const z of [-L*.055-.30,-L*.055+.30])tube('metal',[sideAt(side,cy-bh*.70,z,.006),[side*(bw+.19),cy-bh,z]],.023,'Entry step supports');box('metal',[side*(bw+.19),cy-bh-.02,-L*.055],[.35,.035,.82],.018,'Boarding steps');
 }

 const mastZ=-L*.12,hub=[0,H*.96,mastZ];box('paint',[0,cy+bh*.85,mastZ],[bw*1.40,.44,L*.25],.12,'Transmission and engine cowling');beam([0,cy+bh*.95,mastZ],hub,.065,'Rotor mast');for(const side of [-1,1]){engine(side*bw*.57,cy+bh*.91,-L*.20,.21,L*.23,'Turboshaft');lines(side*bw*.58,cy+bh+ .21,-L*.09,bw*.60,11);}
 // The fixed gearbox supports a rotating hub, pitch links, cuffs and swept airfoil blades.
 for(const y of [-.16,-.07])ring('metal',add(hub,[0,y,0]),.17,.026,'y','Rotor swashplate');
 round('metal',hub,[[0,-.08],[.12,-.08],[.14,.04],[.10,.10],[0,.10]],48,'y','Rotor hub');
 for(let j=0;j<5;j++){
  const a=j/5*Math.PI*2,dir=[Math.cos(a),0,Math.sin(a)],v=cross(dir,[0,1,0]),g=new CM.Geo(),S=12,K=12;
  const at=(i,k,upper)=>{const t=i/S,q=k/K,reach=.27+(W*.70*r.wingSpan-.27)*t,chord=.23*(1-.32*t),sweep=Math.max(0,t-.78)*.30,th=.035*Math.sin(Math.PI*q)*(1-.35*t);return add(hub,add(scale(dir,reach),add(scale(v,(q-.5)*chord+sweep),[0,(upper?th:-th)-t*.035,0])));};
  for(const up of [true,false])for(let i=0;i<S;i++)for(let k=0;k<K;k++)g.poly([at(i,k,up),at(i+1,k,up),at(i+1,k+1,up),at(i,k+1,up)],null,[0,up?1:-1,0]);
  for(const i of [0,S])g.poly([...Array.from({length:K+1},(_,k)=>at(i,k,true)),...Array.from({length:K+1},(_,k)=>at(i,K-k,false))],null,scale(dir,i?1:-1));
  put('trim',CM.smoothNormals(g.done(),.7),'Main rotor');
  beam(add(hub,scale(dir,.08)),add(hub,scale(dir,.40)),.037,'Main rotor');
  beam(add(hub,add(scale(dir,.16),[0,-.15,0])),add(hub,add(scale(dir,.34),scale(v,.065))),.012,'Main rotor');
 }
 (c.rotors||=[]).push({name:'Main rotor',at:hub,axis:[0,1,0]});
 loft([[-.52,.055],[-.46,.09],[-.36,.15],[-.25,.34]].map(([z,w])=>[z*L,w,cy+(Math.abs(z)-.25)*.85,w*.88]),{name:'Tapered tail boom',N:48});
 sheet('secondary',[[0,cy,-L*.47],[0,H*.88,-L*.50],[0,H*.80,-L*.40],[0,cy+.1,-L*.38]],.065,'Tail stabilizer');
 const tail=[.30,H*.65,-L*.46];beam([0,tail[1],tail[2]],tail,.055,'Tail rotor drive shaft');
 round('secondary',tail,[[H*.16,-.09],[H*.19,-.09],[H*.20,-.05],[H*.20,.05],[H*.19,.09],[H*.16,.09],[H*.16,-.09]],80,'x','Enclosed tail rotor duct');
 for(let j=0;j<9;j++){const a=j/9*Math.PI*2,at=(R,da)=>add(tail,[0,Math.cos(a+da)*R,Math.sin(a+da)*R]);sheet('trim',[at(.07,0),at(H*.157,-.08),at(H*.157,.025),at(.07,.18)],.014,'Tail rotor');}
 round('metal',tail,[[0,-.07],[.08,-.07],[.085,.07],[0,.09]],48,'x','Tail rotor');c.rotors.push({name:'Tail rotor',at:tail,axis:[1,0,0]});
 for(const side of [-1,1]){
  foil('paint',side,.07,.85,-L*.39,-L*.47,-L*.43,-L*.49,cy+.17,cy+.20,.055,'Tail horizontal stabilizer');
  tube('metal',[sideAt(side,cy+.12,-L*.13,.012),sideAt(side,cy+.55,-L*.13,.012)],.012,'Cabin door hinge rail');
  for(let j=0;j<7;j++){const z=-L*.16+j*.09;box('dark',sideAt(side,cy+.60,z,.013),[.012,.10,.032],.003,'Transmission ventilation');}
 }
 for(const side of [-1,1]){tube('metal',[[side*bw*1.1,.14,L*.27],[side*bw*1.1,.055,L*.17],[side*bw*1.1,.055,-L*.22]],.040,'Landing skids');for(const z of [-.16,.15])beam([side*bw*.55,cy-bh*.70,L*z],[side*bw*1.1,.10,L*z],.035,'Skid struts');}
 if(r.interior){box('liner',[0,cy-bh*.65,-L*.005],[bw*1.75,.05,L*.53],.02,'Cabin floor');for(const side of [-1,1]){seat([side*.36,cy-bh*.65+.22,L*.18]);instrument([side*.36,cy+.15,L*.23],.62);for(let j=0;j<2;j++)seat([side*.41,cy-bh*.65+.22,-L*(.02+j*.10)],.85,'Cabin seat');}}
 // Riveted belly access panels sit on the skin, keeping the passenger cabin full width.
 for(const side of [-1,1])for(const z of [-L*.16,-L*.04]){
  const a=side*2.1,p=skinPoint(sections,z,a);box('secondary',p,[.12,.025,.32],.012,'Belly service fairing');
 }
 round('trim',[0,cy-bh*.76,L*.25],[[0,-.12],[.19,-.12],[.21,-.05],[.20,.10],[0,.12]],64,'y','Chin sensor gimbal');round('flightGlass',[0,cy-bh*.76,L*.25+.20],[[0,0],[.075,0],[.075,.008],[0,.008]],48,'z','Electro optical sensor');
 c.craft={boarding:'side cabin hatch',mastBehindGlazing:true};return true;
}
if(f==='airliner'){
 const R=1.85,cy=H*.43,floor=cy-.72,cabinStart=-L*.29,cabinEnd=L*.30;
 const sections=[[-.50,.10],[-.46,.40],[-.39,.83],[-.31,1],[-.15,1],[.15,1],[.31,1],[.39,.89],[.45,.58],[.49,.18],[.50,0]].map(([z,q])=>[z*L,R*q,cy,R*q]);
 const passengerDoor=(z,side)=>{const F=CM.frame([side*R,cy-.05,z],[0,0,-side],[0,1,0]),conform=m=>CM.smoothNormals(CM.transform(m,p=>[side*(Math.sqrt(Math.max(.02,R*R-(p[1]-cy)**2))+.018+side*(p[0]-side*R)),p[1],p[2]],n=>n),.8);put('trim',conform(pressurePanel(.91,1.73,.12,F,.015)),'Flight access pressure door seal');put('paint',conform(pressurePanel(.85,1.67,.11,{...F,o:add(F.o,[side*.025,0,0])},.020)),'Flight access plug door');const x=side*(Math.sqrt(R*R-.42*.42)+.052);round('flightGlass',[x,cy+.42,z],[[0,0],[.105,0],[.105,.008],[0,.008]],48,'x','Pressure door viewport');box('metal',[side*(R+.057),cy-.13,z+.23],[.018,.045,.16],.012,'Recessed pressure door handle');for(const dy of [-.68,.68])box('secondary',[side*(Math.sqrt(R*R-dy*dy)+.04),cy+dy,z-.35],[.055,.10,.08],.012,'Plug door hinge fairings');};
 const cockpitZ0=L*.425,cockpitZ1=L*.485,cockpitZ=Array.from({length:13},(_,i)=>cockpitZ0+(cockpitZ1-cockpitZ0)*i/12);
 const pitch=(cabinEnd-cabinStart)/24,windowCenters=Array.from({length:25},(_,j)=>cabinStart+j*pitch),zs=[...new Set([...sections.map(s=>s[0]),...windowCenters.flatMap(z=>[z-.17,z+.17]),...cockpitZ])].sort((a,b)=>a-b),detailed=zs.map(z=>sampleSection(sections,z));
 const cockpitSkip=(z,a)=>{a=a>Math.PI?a-2*Math.PI:a;return z>cockpitZ0&&z<cockpitZ1&&Math.abs(a)>Math.PI*2/96&&Math.abs(a)<17*Math.PI*2/96;};
 const windowSkip=(z,a)=>cockpitSkip(z,a)||Math.abs(Math.cos(a)*R-.30)<.28&&windowCenters.some(q=>Math.abs(q-z)<.171);
 loft(detailed,{name:'Airliner pressure shell',N:96,cutaway:r.cutaway,skip:windowSkip});
 // Cabin liner follows the exterior, with a removable port side/roof for inspection.
 loft(detailed.slice(2,-2).map(s=>[s[0],Math.max(.01,s[1]-.055),s[2],Math.max(.01,s[3]-.055)]),{role:'cabin',name:'Passenger cabin lining',N:96,cutaway:r.cutaway,skip:windowSkip});
 box('cabin',[0,floor,(cabinStart+cabinEnd)/2],[3.35,.08,cabinEnd-cabinStart+2.4],.015,'Full length cabin floor');
 c.cabinSeats=[];if(r.interior){
  const pitch=(cabinEnd-cabinStart)/24;for(let row=0;row<25;row++)for(const x of [-1.18,-.65,.65,1.18]){const p=[x,floor+.28,cabinStart+row*pitch];seat(p,.95,'Passenger seat',1);c.cabinSeats.push({row:row+1,side:x<0?'port':'starboard',at:p});box('trim',add(p,[0,.48,-.247]),[.28,.23,.015],.012,'Seatback tray');box('dark',add(p,[0,.65,-.249]),[.22,.12,.012],.008,'Seatback display');}
  for(const side of [-1,1]){if(!(r.cutaway&&side<0))for(let row=0;row<25;row++){const z=cabinStart+row*pitch;const at=(v,t)=>{const y=.30+(v-.5)*.58,rr=R+.006;return [side*Math.sqrt(rr*rr-y*y),cy+y,z+(t-.5)*.34];},g=new CM.Geo();for(let j=0;j<10;j++)g.poly([at(j/10,0),at(j/10,1),at((j+1)/10,1),at((j+1)/10,0)],null,[side,0,0]);put('flightGlass',g.done(),'Cabin windows');// The loop starts mid-side, so its two ends meet in line rather than across a corner.
const rim=[...Array.from({length:6},(_,j)=>at(.5+j/10,0)),...Array.from({length:11},(_,j)=>at(1-j/10,1)),...Array.from({length:6},(_,j)=>at(j/10,0))];tube('trim',rim,.009,'Window reveals');}
   if(!(r.cutaway&&side<0)){box('cabin',[side*1.10,cy+1.1,0],[.75,.35,cabinEnd-cabinStart+1.5],.12,'Overhead luggage bins');for(let j=0;j<25;j++)beam([side*.74,cy+.94,cabinStart+j*pitch-.3],[side*1.40,cy+.94,cabinStart+j*pitch-.3],.004,'Overhead bin seams','trim');}box('light',[side*.50,cy+1.20,0],[.025,.016,cabinEnd-cabinStart],.006,'Aisle lighting');}
  // Front and rear service areas, two toilets, attendant seats, galley carts and cockpit.
  for(const z of [cabinStart-1.20,cabinEnd+1.20]){for(const side of [-1,1]){box('cabin',[1.05+side*.51,floor+.88,z],[.03,1.76,.85],.008,'Lavatory side walls');if(!r.cutaway||side<0)box('cabin',[1.05,floor+.88,z+side*.41],[1.05,1.76,.03],.008,'Lavatory end walls');}if(!r.cutaway)box('cabin',[1.05,floor+1.75,z],[1.05,.035,.85],.008,'Lavatory ceiling');round('cabin',[1.10,floor,z-.10],[[0,0],[.12,0],[.13,.12],[.18,.35],[.20,.39],[.17,.42],[.14,.39],[.09,.28],[0,.28]],48,'y','Aircraft toilet');ring('trim',[1.10,floor+.42,z-.10],.19,.025,'y','Aircraft toilet seat');box('cabin',[1.33,floor+.84,z+.22],[.32,.07,.27],.035,'Lavatory sink');tube('metal',[[1.40,floor+.88,z+.22],[1.40,floor+.99,z+.22],[1.32,floor+.99,z+.22]],.007,'Lavatory faucet');box('metal',[1.55,floor+1.28,z+.22],[.008,.45,.31],.012,'Lavatory mirror');box('trim',[.51,floor+.88,z],[.035,1.65,.65],.015,'Lavatory door');box('metal',[.48,floor+.90,z+.22],[.02,.12,.025],.006,'Lavatory latch');box('secondary',[-1.05,floor+.59,z],[1.05,1.18,.75],.025,'Galley cabinet');for(let j=0;j<3;j++)box('trim',[-1.05,floor+.22+j*.34,z+.383],[.91,.29,.015],.008,'Galley service drawers');}
  sheet('cabin',[[-1.50,floor,cabinEnd+.65],[1.50,floor,cabinEnd+.65],[.66,floor,L*.455],[-.66,floor,L*.455]],.08,'Cockpit floor');
  for(const x of [-.40,.40]){seat([x,floor+.28,L*.405],.95,'Cockpit pilot seat');instrument([x,floor+.88,L*.44],.75);}box('cabin',[0,floor+.9,cabinEnd+2.15],[3.1,1.8,.06],.015,'Cockpit partition');
 }
 for(const side of [-1,1]){
  foil('paint',side,1.5,W*.49*r.wingSpan,L*.08,-L*.12,-L*.14,-L*.20,cy-.60,cy+.20,.22,'Swept passenger wing');
  for(let j=0;j<4;j++)beam([side*(2.0+j*2.8),cy-.55+j*.06,-L*.075-j*.50],[side*(2.8+j*2.8),cy-.55+j*.06,-L*.13-j*.50],.008,'Wing flap boundaries','trim');
  sheet('secondary',[[side*1.0,cy+.25,-L*.35],[side*W*.18,cy+1.0,-L*.46],[side*W*.16,cy+1.0,-L*.49],[side*1.0,cy+.3,-L*.45]],.08,'Horizontal stabilizers');
  const x=side*W*.16;beam([x,cy-.15,-L*.035],[x,cy-1.05,-L*.035],.16,'Engine pylon');engine(x,cy-1.65,-L*.025,1.03,3.35,'High bypass turbofan');
  if(!(r.cutaway&&side<0)){const z=cabinEnd+.65;passengerDoor(z,side);passengerDoor(cabinStart-.65,side);}
 }
 sheet('paint',[[0,cy+.9,-L*.35],[0,H*.98,-L*.44],[0,H*.96,-L*.49],[0,cy+.6,-L*.46]],.12,'Vertical stabilizer');
 for(const x of [-1,1]){gear(x*1.7,-L*.08,cy-1.1,.36);beam([x*1.7,.36,-L*.08-.40],[x*1.7,.36,-L*.08+.40],.065,'Main gear bogie beam');for(const dz of [-.40,.40])for(const side of [-1,1])round('rubber',[x*1.7+side*.20,.36,-L*.08+dz],[[0,-.09],[.32,-.09],[.36,-.05],[.36,.05],[.32,.09],[0,.09]],48,'x','Bogie tires');}gear(0,L*.34,cy-1.20,.28);
 // These panes replace the opaque nose shell; the cabin liner has identical openings.
 for(const side of [-1,1])glazedOpening(sections,zs.filter(z=>z>=cockpitZ0&&z<=cockpitZ1),side<0?-17:1,side<0?-1:17,96,'Cockpit windscreen');
 c.craft={passengers:100,seatRows:25,seatsPerRow:4,aisleWidth:.68,seatPitch:(cabinEnd-cabinStart)/24,cutaway:r.cutaway};return true;
}
// Capital craft: a habitat-ring explorer and an industrial open-frame cargo vessel.
const cy=H*.48;
if(f==='starship'){
 loft([[-.48,.40],[-.37,.65],[-.13,.72],[.13,.65],[.30,.60],[.43,.28],[.49,0]].map(([z,q])=>[z*L,W*.14*q,cy,H*.25*q]),{name:'Explorer central spine'});
 const radius=Math.min(W*.29,H*.49);for(const z of [-L*.16,-L*.07]){ring('secondary',[0,cy,z],radius,W*.022,'z','Warp drive field ring');ring('glow',[0,cy,z+.06],radius-W*.025,W*.004,'z','Warp field emitter');}ring('dark',[0,cy,-L*.12-.01],radius-W*.065,W*.012,'z','Habitat observation band');for(let j=0;j<8;j++){const a=j/8*Math.PI*2;beam([0,cy,-L*.12],[Math.cos(a)*radius*.87,cy+Math.sin(a)*radius*.87,-L*.12],W*.018,'Habitat spoke');for(let k=0;k<3;k++){const aa=a+k*.055;round('light',[Math.cos(aa)*(radius-W*.065),cy+Math.sin(aa)*(radius-W*.065),-L*.12+.20],[[0,0],[.026,0],[.026,.01],[0,.01]],16,'z','Habitat windows');}}
 loft([[.13,.10],[.19,.11],[.29,.09]].map(([z,w])=>[z*L,W*w,cy+H*.17,H*.12]),{name:'Streamlined exploration bridge',N:32});loft([[.2905,.089],[.33,.074],[.365,.040]].map(([z,w])=>[z*L,W*w,cy+H*.17,H*.118]),{role:'flightGlass',name:'Panoramic exploration bridge',N:32});for(const side of [-1,1]){beam([side*W*.07,cy,-L*.25],[side*W*.36,cy-H*.02,-L*.33],.15,'Drive outriggers');engine(side*W*.36,cy-H*.02,-L*.37,H*.18,L*.19,'Explorer fusion drive');beam([side*W*.07,cy+H*.10,-L*.25],[side*W*.24,cy+H*.215,-L*.25],.08,'Radiator mounting boom');for(let j=0;j<7;j++)box('metal',[side*W*.24,cy+H*.22,-L*.35+j*L*.025],[W*.18,.02,L*.016],.008,'Thermal radiator banks');}
 box('paint',[W*.075,cy+.15,L*.28],[W*.05,1.85,1.00],.10,'Bridge airlock vestibule');hatch(W*.10,cy+.15,L*.28);ladder(W*.10,L*.28,cy-.72,1);
}else{
 box('frame',[0,cy,0],[W*.12,H*.25,L*.84],.07,'Cargo vessel keel');
 for(const side of [-1,1])for(const yy of [-1,1]){const y=cy+yy*H*.15,x=side*W*.13;beam([x,y,-L*.40],[x,y,L*.33],.065,'Longitudinal cargo truss');for(let j=0;j<7;j++){const z=-L*.37+j*L*.10;beam([x,y,z],[x,cy-yy*H*.15,z+L*.10],.035,'Diagonal truss braces');}}
 for(const side of [-1,1])for(let j=0;j<4;j++){const x=side*W*.31,z=-L*.26+j*L*.14;box(j%2?'cargo':'secondary',[x,cy,z],[W*.27,H*.42,L*.12],.10,'Sealed freight module');for(const y of [-1,1])box('trim',[x,cy+y*H*.17,z],[W*.28,.065,L*.125],.018,'Cargo module clamps');for(let k=0;k<8;k++)box('metal',[x+(k-3.5)*W*.027,cy+H*.216,z],[.025,.018,L*.104],.006,'Container roof ribs');for(let k=0;k<8;k++)box('secondary',[x+side*W*.138,cy,z+(k-3.5)*L*.012],[.025,H*.32,L*.004],.005,'Cargo module side ribs');for(const offset of [-1,1]){beam([x+side*W*.14,cy-H*.13,z+offset*L*.05],[x+side*W*.14,cy+H*.13,z+offset*L*.05],.018,'Cargo locking rods');box('metal',[x+side*W*.145,cy-.12,z+offset*L*.05],[.045,.07,.06],.009,'Cargo door dogs');}for(const yy of [-1,1])for(const zz of [-1,1])box('metal',[x+side*W*.139,cy+yy*H*.195,z+zz*L*.056],[.08,.09,.09],.012,'Container corner castings');beam([side*W*.10,cy,z],[x,cy,z],.10,'Cargo locking gantry');}
 box('paint',[0,cy+H*.20,L*.36],[W*.24,H*.30,L*.16],.15,'Tug bridge');box('flightGlass',[0,cy+H*.26,L*.443],[W*.21,H*.11,.025],.035,'Bridge glazing');for(const side of [-1,1]){engine(side*W*.23,cy,-L*.44,H*.21,L*.16,'Heavy cargo drive');beam([0,cy,-L*.34],[side*W*.23,cy,-L*.39],.16,'Thrust frame');tube('metal',[[side*W*.10,cy-H*.22,-L*.32],[side*W*.14,cy-H*.22,L*.25]],.035,'External coolant main');}
 box('paint',[W*.085,cy+H*.12,L*.36],[W*.07,1.85,1.0],.10,'Bridge airlock vestibule');hatch(W*.12,cy+H*.12,L*.36);ladder(W*.12,L*.36,cy+H*.12-.90,1);
}
if(r.interior){const z=f==='starship'?L*.25:L*.36,y=cy+H*.15;box('liner',[0,y-.05,z],[W*.18,.06,L*.12],.03,'Bridge floor');for(const x of [-.4,.4]){seat([x,y+.12,z],1,'Bridge crew seat');instrument([x,y+.72,z+.50],.72);}box('secondary',[0,y+.15,z-.5],[.32,.70,.5],.025,'Navigation pedestal');}
for(const side of [-1,1]){box('trim',[side*W*.08,cy-H*.12,L*.10],[.15,.30,.60],.03,'RCS housing');for(const z of [-.2,.2])round('metal',[side*W*.08,cy-H*.13,L*.10+z],[[0,0],[.06,0],[.06,.02],[0,.02]],32,'y','Maneuvering thrusters');}c.craft={boarding:'forward pressure hatch'};return true;
}
const api={IDS,build};root.RRFlightCraft=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
