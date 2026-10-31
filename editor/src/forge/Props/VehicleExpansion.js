/** Aircraft, spacecraft and historic running gear, using the vehicle builder's shared materials and rig. */
(function(root){
'use strict';
const need=(n,f)=>root[n]||(typeof require==='function'?require(f):null),CM=need('RRContainerMesh','./ContainerMesh.js'),Craft=need('RRFlightCraft','./FlightCraft.js');
const {add,sub,scale,norm,cross}=CM.vec;
const FORMS=[['airliner','Passenger airliner',28.5,10.4,38],['jet','Jet aircraft',8,3.2,12],['helicopter','Helicopter',7.2,3.5,9],['rocket','Orbital rocket',3,12,3],['starfighter','Starfighter',8,3.5,11],['starship','Explorer starship',16,5.2,26],['freighter','Space freighter',12,5,22],['carriage','Horse-drawn carriage',2.1,2.7,3.8],['oxcart','Ox cart',1.8,1.7,2.8],['wagon','Covered wagon',2.2,2.8,4]];
const IDS=new Set(FORMS.map(f=>f[0])),HISTORIC=new Set(['carriage','oxcart','wagon']);
function build(c){
 const {r,W,H,L,box,tube,put,sheet}=c;if(!IDS.has(r.form))return;if(Craft.build(c))return;
 const round=(kind,p,rx,ry,rz,name)=>put(kind,CM.transform(CM.revolve([[0,-1],[.55,-.84],[.88,-.5],[1,0],[.9,.5],[.55,.84],[0,1]],40),q=>[p[0]+q[0]*rx,p[1]+q[1]*ry,p[2]+q[2]*rz],n=>norm([n[0]/rx,n[1]/ry,n[2]/rz])),name);
 const ring=(kind,p,R,width,axis='z',name)=>{const u=axis==='x'?[0,1,0]:[1,0,0],v=axis==='y'?[0,0,-1]:axis==='x'?[0,0,1]:[0,1,0];return put(kind,CM.revolveOn(CM.frame(p,u,v),0,0,[[R*.82,-width/2],[R,-width/2],[R,width/2],[R*.82,width/2],[R*.82,-width/2]],48),name);};
 const bolt=(p)=>{if(r.details)box('metal',p,[W*.012,W*.012,W*.006],W*.002);};
 const seam=(p,q)=>tube('trim',[p,q],Math.min(W,H)*.003);
 if(HISTORIC.has(r.form)){
  const R=H*(r.form==='oxcart'?.29:.22)*r.wheelSize,deck=R*1.45,track=W*.49,cabin=L*.62,ox=r.form==='oxcart';
  const zs=ox?[0]:[-L*.32,L*.32];
  for(const z of zs)for(const side of [-1,1]){
   const p=[side*track,R,z],name=(z>0?'Front':'Rear')+(side>0?' left':' right')+' wooden wheel';
   ring('secondary',p,R,W*.055,'x',name);ring('metal',p,R*1.008,W*.06,'x',name+' tire');
   put('secondary',CM.revolveOn(CM.frame(p,[0,1,0],[0,0,1]),0,0,[[0,-W*.05],[R*.13,-W*.05],[R*.13,W*.05],[0,W*.05]],24),name+' hub');
   for(let k=0;k<12;k++){const a=k/12*Math.PI*2;tube('secondary',[add(p,[0,Math.cos(a)*R*.12,Math.sin(a)*R*.12]),add(p,[0,Math.cos(a)*R*.88,Math.sin(a)*R*.88])],W*.012,name+' spokes');}
   c.wheels.push({part:name,with:[name+' tire',name+' hub',name+' spokes'],at:p.slice(),radius:R,side:side>0?'left':'right'});
  }
  for(const z of zs){tube('metal',[[-track,R,z],[track,R,z]],W*.025,'Carriage axle');for(const side of [-1,1])for(let j=0;j<4;j++)tube('trim',[[side*W*.32,deck-.06-j*.012,z-.28],[side*W*.32,deck-.12-j*.012,z],[side*W*.32,deck-.06-j*.012,z+.28]],W*.009,'Leaf springs');}
  box('trim',[0,deck-.08,0],[W*.77,.12,L*.9],.015,'Timber chassis');
  for(let k=0;k<9;k++)box('secondary',[(k-4)*W*.085,deck,0],[W*.081,.055,L*.86],.006,'Deck boards');
  const wall=ox?H*.34:H*.32,bodyZ=ox?0:-L*.12;
  for(const side of [-1,1]){for(let j=0;j<4;j++)box('paint',[side*W*.38,deck+wall*(j+.5)/4,bodyZ],[.06,wall/4-.008,cabin],.005,'Coach side panels');for(const z of [-1,1])box('trim',[side*W*.38,deck+wall/2,bodyZ+z*cabin*.48],[.07,wall+.06,.065],.008,'Corner posts');}
  box('paint',[0,deck+wall*.5,bodyZ-cabin*.5],[W*.78,wall,.055],.008,'Tailgate');
  if(r.form==='carriage'){
   const roof=H*.94;box('paint',[0,roof,bodyZ],[W*.9,H*.075,cabin*1.05],.06,'Coach roof');
   for(const side of [-1,1])for(const z of [-1,1])box('secondary',[side*W*.39,(roof+deck+wall)/2,bodyZ+z*cabin*.46],[.05,roof-deck-wall,.05],.009,'Coach pillars');
   for(const side of [-1,1])box('glass',[side*W*.39,deck+wall+(roof-deck-wall)*.52,bodyZ],[.018,roof-deck-wall-.13,cabin*.76],.008,'Coach windows');
   for(const z of [-1,1])box('seat',[0,deck+.17,bodyZ+z*cabin*.29],[W*.68,.15,.36],.04,'Passenger seat');
  }
  if(r.form==='wagon'){
   const z0=-L*.43,z1=L*.26,rows=32,pts=[];
   for(let j=0;j<=10;j++)for(let k=0;k<=rows;k++){const a=k/rows*Math.PI;pts.push([Math.cos(a)*W*.43,deck+wall+Math.sin(a)*(H-deck-wall),z0+(z1-z0)*j/10]);}
   const g=new CM.Geo();for(let j=0;j<10;j++)for(let k=0;k<rows;k++){const at=(jj,kk)=>pts[jj*(rows+1)+kk];g.poly([at(j,k),at(j+1,k),at(j+1,k+1),at(j,k+1)],null,[Math.cos((k+.5)/rows*Math.PI),Math.sin((k+.5)/rows*Math.PI),0]);}put('canvas',g.done(),'Canvas canopy');
   for(let j=0;j<=5;j++)tube('secondary',Array.from({length:33},(_,k)=>{const a=k/32*Math.PI;return[Math.cos(a)*W*.427,deck+wall+Math.sin(a)*(H-deck-wall)-.015,z0+(z1-z0)*j/5];}),W*.009,'Canopy bows');
  }
  const driver=[0,deck+.20,L*.32];box('seat',driver,[W*.72,.14,.40],.035,'Driver bench');box('trim',[0,deck+.40,L*.13],[W*.74,.39,.045],.02,'Driver backrest');
  for(const side of [-1,1]){tube('secondary',[[side*W*.30,deck,L*.35],[side*W*.30,deck-.08,L*.85],[side*(ox?.82:.78),H*.48,L*1.38]],W*.022,'Draft shafts');box('trim',[side*W*.47,deck-.24,L*.18],[.22,.06,.35],.015,'Coach steps');}
  c.mounts.seats=[{posture:'sit',seat:{at:add(driver,[0,.07,0])},handL:{at:add(driver,[.22,.22,.16])},handR:{at:add(driver,[-.22,.22,.16])},footL:{at:add(driver,[.20,-.38,.28])},footR:{at:add(driver,[-.20,-.38,.28])}}];c.mounts.controls=[];
  if(r.team){c.team=[];const animalH=ox?1.45:1.65,front=L*.92+animalH*.6;for(const side of [-1,1]){const at=[side*(ox?.44:.43),0,front];c.team.push({kind:ox?'bull':'horse',height:animalH,at});const body=[at[0],animalH*.78,at[2]];tube('trim',[[side*W*.31,deck-.06,L*.70],[body[0],body[1],body[2]-.4]],.018,'Trace harness');if(!ox)for(const z of [-.28,.36])ring('trim',[body[0],body[1]-.01,body[2]+z],animalH*.21,.035,'z','Harness collar');}
   if(ox){const dz=animalH*.31,y=draftContact('bull',animalH,dz)+.025,z=front+dz;tube('secondary',[[-.86,y,z],[-.63,y-.025,z],[-.44,y-.07,z],[-.23,y-.025,z],[0,y,z],[.23,y-.025,z],[.44,y-.07,z],[.63,y-.025,z],[.86,y,z]],.045,'Shoulder yoke');for(const side of [-1,1])tube('secondary',[[side*.61,y-.02,z],[side*.60,y-.30,z+.015],[side*.44,y-.39,z+.02],[side*.28,y-.30,z+.015],[side*.27,y-.02,z]],.017,'Neck yoke bows');}for(const side of [-1,1])tube('trim',[[side*.20,driver[1]+.2,driver[2]+.2],[side*.44,animalH*.92,front+.4]],.006,'Reins');}
  return;
 }
 if(r.form==='rocket'){
  const radius=W*.29,axis=CM.frame([0,0,0],[1,0,0],[0,0,-1]);
  put('paint',CM.revolve([[0,0],[radius*.7,0],[radius*.95,H*.04],[radius,H*.08],[radius,H*.68],[radius*.92,H*.76],[radius*.72,H*.84],[radius*.42,H*.92],[0,H]],64),'Rocket pressure shell');
  for(const y of [.12,.34,.58,.72])ring('trim',[0,H*y,0],radius*1.003,H*.008,'y','Stage separation collars');
  for(let k=0;k<4;k++){const a=(k/4+.125)*Math.PI*2,dx=Math.cos(a),dz=Math.sin(a);sheet('secondary',[[dx*radius*.90,H*.03,dz*radius*.90],[dx*W*.48,H*.01,dz*W*.48],[dx*W*.48,H*.22,dz*W*.48],[dx*radius,H*.35,dz*radius]],W*.02,'Stabilizer fins');}
  for(const [x,z]of [[0,0],[-radius*.4,0],[radius*.4,0],[0,radius*.4]]){put('metal',CM.revolveOn({...axis,o:[x,0,z]},0,0,[[radius*.20,0],[radius*.13,H*.04],[radius*.10,H*.07],[radius*.08,H*.07],[radius*.10,H*.04],[radius*.17,0],[radius*.20,0]],32),'Engine bells');}
  const doorY=H*.60,door=CM.frame([0,doorY,radius+.025],[1,0,0],[0,1,0]),dw=Math.min(.88,W*.28),dh=Math.min(1.8,H*.17);
  const skin=m=>CM.transform(CM.tessellate(m,.065),p=>[p[0],p[1],p[2]+Math.sqrt(Math.max(.0001,radius*radius-p[0]*p[0]))-radius],n=>n);
  const seal=skin(CM.slab(CM.rect(0,0,dw+.07,dh+.07),door,.018,.012,true));CM.smoothNormals(seal,.65);put('trim',seal,'Crew hatch seal');
  const hatch=skin(CM.slab(CM.rect(0,0,dw,dh),{...door,o:add(door.o,[0,0,.020])},.025,.015,true));CM.smoothNormals(hatch,.65);put('secondary',hatch,'Crew hatch');const viewport=CM.frame([0,doorY+dh*.23,radius+.060],[1,0,0],[0,1,0]);put('metal',CM.revolveOn(viewport,0,0,[[.11,0],[.145,0],[.145,.020],[.11,.020],[.11,0]],48),'Crew hatch porthole frame');put('flightGlass',CM.revolveOn(viewport,0,0,[[0,.01],[.108,.01],[.108,.015],[0,.015]],48),'Crew hatch porthole');
  for(const side of [-1,1]){const x=side*dw*.35,z=Math.sqrt(Math.max(.0001,radius*radius-x*x))+.065;box('metal',[x,doorY,z],[.045,.14,.035],.01,'Hatch locking handles');}
  const foot=doorY-dh*.5;
  for(const side of [-1,1]){const x=side*dw*.30;tube('metal',[[x,.10,radius+.10],[x,foot,radius+.10]],.014,'Crew ladder rails');for(const y of [.30,foot*.5,foot])tube('metal',[[x,y,radius-.02],[x,y,radius+.10]],.011,'Ladder wall brackets');}
  for(let j=0;j<=Math.floor((foot-.10)/.26);j++){const y=foot-j*.26;tube('metal',[[-dw*.30,y,radius+.10],[dw*.30,y,radius+.10]],.012,'Crew ladder');}
  box('metal',[0,foot-.04,radius+.10],[dw*.88,.055,.24],.018,'Crew boarding step');
  for(let k=0;k<2;k++){const a=k*Math.PI,x=Math.cos(a)*radius*1.35,z=Math.sin(a)*radius*.88,F=CM.frame([x,H*.13,z],[1,0,0],[0,0,-1]);
   put('secondary',CM.revolveOn(F,0,0,[[0,0],[W*.10,0],[W*.125,H*.025],[W*.125,H*.25],[W*.09,H*.30],[0,H*.33]],48),'Strap-on booster housings');
   for(const y of [.16,.32])tube('metal',[[x,H*y,z],[x*.65,H*y,z*.65]],.035,'Booster mounting struts');}
  if(r.details)for(const y of [.24,.47])box('dark',[0,H*y,radius+.004],[radius*.28,H*.04,.012],.008,'Service ports');return;
 }
 const helicopter=r.form==='helicopter',jet=r.form==='jet',capital=['starship','freighter'].includes(r.form),cy=H*.48,bodyW=W*(helicopter?.135:capital?.23:.125),bodyH=H*(capital?.32:.28);
 // A sampled pressure hull with a real cockpit bay. Separate sill, ribs and glazing
 // describe the enclosure rather than planting an opaque ellipsoid on another one.
 const stations=helicopter?[[-.30,.20],[-.24,.65],[-.12,.98],[.08,1],[.25,.88],[.38,.58],[.46,.18],[.48,0]]:
     capital?[[-.49,.28],[-.42,.82],[-.28,1],[.17,1],[.31,.82],[.44,.36],[.49,0]]:[[-.50,.12],[-.42,.45],[-.26,.85],[-.08,1],[.12,.96],[.29,.72],[.42,.38],[.50,0]];
 const radiusAt=z=>{const t=z/L;for(let j=0;j+1<stations.length;j++)if(t<=stations[j+1][0]){const [a,x]=stations[j],[b,y]=stations[j+1],u=Math.max(0,(t-a)/(b-a)),p=stations[Math.max(0,j-1)][1],q=stations[Math.min(stations.length-1,j+2)][1];return Math.max(0,Math.min(1.05,.5*((2*x)+(-p+y)*u+(2*p-5*x+4*y-q)*u*u+(-p+3*x-3*y+q)*u*u*u)));}return 0;};
 const front=capital?L*.31:L*(helicopter?.34:.31),back=capital?L*.16:L*(helicopter?-.08:.08),theta=capital?.82:1.12;
 const power=r.form==='freighter'?.58:capital?.78:1,shape=a=>[Math.sign(Math.sin(a))*Math.abs(Math.sin(a))**power,Math.sign(Math.cos(a))*Math.abs(Math.cos(a))**power];
 const hullAt=(z,a,offset=0)=>{const q=shape(a),f=radiusAt(z);return[q[0]*(bodyW*f+offset),cy+q[1]*(bodyH*f+offset),z];};
 const zs=[...new Set([...Array.from({length:65},(_,j)=>(stations[0][0]+(.5-stations[0][0])*j/64)*L),back,front])].sort((a,b)=>a-b),angles=[...new Set([...Array.from({length:65},(_,j)=>-Math.PI+j/64*Math.PI*2),-theta,theta])].sort((a,b)=>a-b);
 const hull=new CM.Geo();
 for(let j=0;j+1<zs.length;j++)for(let k=0;k+1<angles.length;k++){
  const z=(zs[j]+zs[j+1])/2,a=(angles[k]+angles[k+1])/2;if(z>back&&z<front&&Math.abs(a)<theta)continue;
  hull.poly([hullAt(zs[j],angles[k]),hullAt(zs[j+1],angles[k]),hullAt(zs[j+1],angles[k+1]),hullAt(zs[j],angles[k+1])],null,[Math.sin(a),Math.cos(a),z>0?.15:-.15]);
 }
 put('paint',CM.smoothNormals(hull.done(),.82),'Flight hull');
 const roofAt=(u,z)=>{const a=(u*2-1)*theta,p=hullAt(z,a,.012),end=Math.sin(Math.PI*(z-back)/(front-back));p[1]+=Math.max(0,end)*H*(capital?.06:.12)*Math.cos(a/theta*Math.PI/2);return p;};
 const glass=new CM.Geo();for(let j=0;j<18;j++)for(let k=0;k<32;k++){const z0=back+(front-back)*j/18,z1=back+(front-back)*(j+1)/18,a=(k+.5)/32*2-1;glass.poly([roofAt(k/32,z0),roofAt((k+1)/32,z0),roofAt((k+1)/32,z1),roofAt(k/32,z1)],null,[Math.sin(a*theta),Math.cos(a*theta),.08]);}
 put('flightGlass',CM.smoothNormals(glass.done(),.70),'Cockpit canopy');
 for(const z of [back,front])tube('trim',Array.from({length:49},(_,j)=>roofAt(j/48,z)),Math.max(.018,H*.009),'Canopy frames');
 for(const u of [0,.5,1])tube('trim',Array.from({length:33},(_,j)=>roofAt(u,back+(front-back)*j/32)),Math.max(.014,H*.006),'Canopy longerons');
 if(helicopter||capital)tube('trim',Array.from({length:49},(_,j)=>roofAt(j/48,back+(front-back)*.48)),H*.009,'Windshield divider');
 if(r.interior){
  const floor=cy-bodyH*.26,cabinZ=(front+back)/2,seatY=floor+.30,seatCount=helicopter||capital?2:1;
  box('liner',[0,floor,cabinZ],[bodyW*1.48,.055,front-back],.02,'Cockpit floor');
  for(let j=0;j<seatCount;j++){const x=(j-(seatCount-1)/2)*Math.min(.72,bodyW*.85),z=back+(front-back)*.38;
   box('seat',[x,seatY,z],[.46,.12,.46],.055,'Flight seat cushions');box('seat',[x,seatY+.30,z-.21],[.45,.65,.09],.045,'Flight seat backs');box('seat',[x,seatY+.61,z-.20],[.28,.16,.10],.035,'Flight headrests');
   for(const sign of [-1,1])tube('trim',[[x+sign*.11,seatY+.57,z-.145],[x+sign*.08,seatY+.10,z+.06]],.012,'Pilot restraints');
   tube('metal',[[x,seatY-.12,z+.24],[x,seatY+.16,z+.31]],.015,'Flight control sticks');
  }
  box('trim',[0,seatY+.32,front-(front-back)*.14],[bodyW*1.35,.25,.16],.035,'Flight instrument console');
  for(let j=0;j<3;j++)box('light',[(j-1)*bodyW*.34,seatY+.34,front-(front-back)*.14-.09],[bodyW*.24,.12,.012],.008,'Flight displays');
 }
 // Human-scale access doors follow the actual hull's curvature, with recessed
 // seals, separate hinged panels, latches and a ladder to the ground.
 const doorZ=helicopter?-L*.05:capital?-L*.02:-L*.015,doorH=Math.min(1.85,bodyH*1.65),doorW=capital?.94:helicopter?.80:.62,doorY=cy-bodyH*.08;
 for(const side of [-1,1]){
  const at=(z,y,gap=0)=>{const t=Math.max(-.98,Math.min(.98,(y-cy)/(bodyH*radiusAt(z)))),a=side*Math.acos(Math.sign(t)*Math.abs(t)**(1/power));return[hullAt(z,a,gap)[0],y,z];};
  const panel=new CM.Geo(),R=18,K=8,y0=doorY-doorH/2,z0=doorZ-doorW/2;
  for(let j=0;j<R;j++)for(let k=0;k<K;k++){const a=at(z0+doorW*k/K,y0+doorH*j/R,.018),b=at(z0+doorW*(k+1)/K,y0+doorH*j/R,.018),d=at(z0+doorW*(k+1)/K,y0+doorH*(j+1)/R,.018),e=at(z0+doorW*k/K,y0+doorH*(j+1)/R,.018);panel.poly([a,b,d,e],null,[side,0,0]);}
  const name=side>0?'Flight access left':'Flight access right';put('secondary',panel.done(),name);
  const outline=[];for(let j=0;j<=20;j++)outline.push(at(z0+doorW*j/20,y0,.024));for(let j=1;j<=30;j++)outline.push(at(z0+doorW,y0+doorH*j/30,.024));for(let j=1;j<=20;j++)outline.push(at(z0+doorW*(1-j/20),y0+doorH,.024));for(let j=1;j<=30;j++)outline.push(at(z0,y0+doorH*(1-j/30),.024));tube('trim',outline,.012,'Pressure door seals');
  const latch=at(doorZ-doorW*.30,doorY,.04);box('metal',latch,[.028,.045,.15],.012,'Access door handles');
  for(const y of [-.30,.30]){const hinge=at(z0+doorW,doorY+y*doorH,.04);tube('metal',[add(hinge,[0,-.07,0]),add(hinge,[0,.07,0])],.025,'Flight door hinges');}
  const step=at(doorZ,y0-.08,.14);box('metal',step,[.24,.045,doorW*.80],.018,'Boarding steps');
  if(side>0){for(const z of [-1,1])tube('metal',[[step[0]+.10,.08,doorZ+z*doorW*.29],[step[0]+.10,step[1],doorZ+z*doorW*.29]],.015,'Boarding ladder rails');for(let j=1;j<=Math.floor(step[1]/.27);j++)tube('metal',[[step[0]+.10,j*.27,doorZ-doorW*.29],[step[0]+.10,j*.27,doorZ+doorW*.29]],.012,'Boarding ladder rungs');}
 }
 const wingZ=capital?-L*.08:-L*.05,span=W*.5*r.wingSpan;
 if(!helicopter)for(const side of [-1,1]){
  sheet('secondary',[[side*bodyW*.8,cy,wingZ+L*.22],[side*span,cy-.03*H,wingZ-L*.12],[side*span*.94,cy-.04*H,wingZ-L*.22],[side*bodyW*.8,cy-.035*H,wingZ-L*.18]],H*.035,'Swept wings');
  sheet('paint',[[side*bodyW*.65,cy+bodyH*.35,-L*.29],[side*W*.29,cy+H*.16,-L*.42],[side*W*.25,cy+H*.10,-L*.48],[side*bodyW*.6,cy,-L*.42]],H*.025,'Tail planes');
  if(r.lights)box(side<0?'red':'light',[side*span*.96,cy-.025*H,wingZ-L*.16],[W*.018,H*.025,L*.025],H*.01,'Navigation lights');
 }
 if(!helicopter)for(const side of [-1,1]){
  tube('metal',[[side*bodyW*.85,cy+.012,wingZ+L*.215],[side*span*.97,cy-.03*H+.012,wingZ-L*.12]],H*.006,'Wing leading edges');
  for(let j=1;j<=5;j++){const t=j/6,x=side*(bodyW+(span-bodyW)*t),za=wingZ+L*(.20-.32*t),zb=wingZ-L*(.18+.04*t);tube('trim',[[x,cy-H*.03*t+.012,za],[x,cy-H*.035*t+.012,zb]],H*.0025,'Wing panel seams');}
 }
 const engines=capital?4:2;
 if(helicopter){
  tube('paint',[[0,cy,-L*.22],[0,cy+H*.10,-L*.43]],bodyW*.25,'Tail boom');sheet('secondary',[[0,cy,-L*.43],[0,H*.92,-L*.44],[0,H*.88,-L*.34],[0,cy+H*.04,-L*.33]],W*.015,'Tail fin');
  const hub=[0,H*.91,0];tube('metal',[[0,cy+bodyH*.7,0],hub],W*.015,'Rotor mast');
  for(let j=0;j<4;j++){const a=j/4*Math.PI*2,dir=[Math.cos(a),0,Math.sin(a)],across=cross(dir,[0,1,0]);sheet('trim',[add(hub,add(scale(dir,.12),scale(across,W*.015))),add(hub,add(scale(dir,W*.49*r.wingSpan),scale(across,W*.009))),add(hub,add(scale(dir,W*.49*r.wingSpan),scale(across,-W*.009))),add(hub,add(scale(dir,.12),scale(across,-W*.015)))],H*.009,'Main rotor');}
  c.rotors=[{name:'Main rotor',at:hub,axis:[0,1,0]}];const tail=[W*.04,H*.66,-L*.43];for(let j=0;j<4;j++){const a=j/4*Math.PI*2;tube('trim',[tail,add(tail,[0,Math.cos(a)*H*.19,Math.sin(a)*H*.19])],W*.009,'Tail rotor');}c.rotors.push({name:'Tail rotor',at:tail,axis:[1,0,0]});
  for(const side of [-1,1]){tube('metal',[[side*W*.12,H*.08,L*.25],[side*W*.12,H*.05,-L*.25]],W*.016,'Landing skids');for(const z of [-1,1])tube('metal',[[side*W*.05,cy-bodyH*.55,z*L*.17],[side*W*.12,H*.08,z*L*.17]],W*.009,'Skid struts');}
 }else{
  for(let j=0;j<engines;j++){const x=(j-(engines-1)/2)*W*(capital?.18:.33),z=-L*(capital?.32:.19),e=bodyH*(capital?.40:.50),len=L*(capital?.32:.29);
   const F=CM.frame([x,cy-.07*H,z],[1,0,0],[0,1,0]);put('secondary',CM.revolveOn(F,0,0,[[0,-len*.5],[e*.7,-len*.5],[e,-len*.38],[e,len*.34],[e*.92,len*.5],[e*.65,len*.5],[e*.65,len*.39],[e*.84,len*.32],[e*.84,-len*.35],[0,-len*.35]],40),'Turbine nacelles');
   ring('metal',[x,cy-.07*H,z-len*.5],e*.72,len*.035,'z','Engine nozzle rims');round('dark',[x,cy-.07*H,z-len*.48],e*.60,e*.60,.015,'Engine exhaust');if(r.lights)round('glow',[x,cy-.07*H,z-len*.50],e*.43,e*.43,.018,'Engine cores');
   if(r.details)for(let k=0;k<12;k++){const a=k/12*Math.PI*2;tube('metal',[[x+Math.cos(a)*e*.62,cy-.07*H+Math.sin(a)*e*.62,z+len*.496],[x+Math.cos(a+.35)*e*.18,cy-.07*H+Math.sin(a+.35)*e*.18,z+len*.50]],e*.025,'Intake blades');}
  }
  for(const x of [-1,1]){tube('metal',[[x*bodyW*.5,cy-bodyH*.8,L*.1],[x*bodyW*.7,H*.07,L*.1]],W*.01,'Landing gear legs');box('trim',[x*bodyW*.7,H*.05,L*.10],[W*.055,H*.045,L*.07],.02,'Landing feet');}
  sheet('secondary',[[0,cy+bodyH*.7,-L*.32],[0,H*.99,-L*.36],[0,H*.95,-L*.46],[0,cy,-L*.47]],W*.012,'Dorsal fin');
 }
 if(capital){
  box('secondary',[0,cy+bodyH*.91,-L*.12],[bodyW*1.15,H*.16,L*.23],H*.04,'Dorsal habitat deck');
  for(const side of [-1,1]){box('trim',[side*bodyW*.43,cy+bodyH*1.15,-L*.14],[W*.028,H*.28,L*.10],.03,'Communications pylons');for(let j=0;j<4;j++)box('metal',[side*bodyW*.90,cy+bodyH*.66,-L*.28+j*L*.075],[W*.055,H*.028,L*.055],.015,'Radiator banks');}
  for(const side of [-1,1])for(let j=0;j<5;j++){const x=side*bodyW*.585,y=cy+bodyH*.99,z=-L*.20+j*L*.035;box('dark',[x,y,z],[.024,H*.075,L*.025],.009,'Bridge side glazing');if(r.lights)box('light',[x+side*.014,y,z],[.012,H*.045,L*.016],.006,'Bridge cabin lights');}
  for(const side of [-1,1]){const x=side*bodyW*.51,y=cy+bodyH*1.08;tube('metal',[[x,y,-L*.21],[x,y,-L*.03]],.014,'Deck safety rails');for(const z of [-.21,-.12,-.03])tube('metal',[[x,y-H*.055,L*z],[x,y,L*z]],.009,'Deck rail posts');}
  const docking=CM.frame([0,cy+bodyH*1.05,-L*.12],[1,0,0],[0,0,-1]);put('metal',CM.revolveOn(docking,0,0,[[.45,0],[.62,0],[.62,.12],[.45,.12],[.45,0]],64),'Docking collar');put('secondary',CM.revolveOn(docking,0,0,[[0,.04],[.44,.04],[.44,.06],[0,.06]],64),'Docking hatch');

  const z0=-L*.22,z1=L*.14;
  for(const side of [-1,1])for(let j=0;j<8;j++){const z=z0+(z1-z0)*j/7;box('dark',[side*bodyW*.95,cy+bodyH*.05,z],[W*.007,H*.05,L*.019],.003,'Habitat windows');if(r.lights)box('light',[side*bodyW*.954,cy+bodyH*.05,z],[W*.007,H*.032,L*.012],.002,'Habitat window lights');}
  if(r.form==='freighter')for(const side of [-1,1])for(let j=0;j<3;j++){const z=-L*.18+j*L*.13;box('secondary',[side*W*.28,cy,z],[W*.18,H*.39,L*.12],H*.04,'Freight modules');for(const y of [-1,1])box('trim',[side*W*.28,cy+y*H*.15,z],[W*.19,H*.025,L*.125],.015,'Module clamps');}
 }
 if(r.details)for(const side of [-1,1]){for(let j=0;j<4;j++)box('trim',[side*bodyW*.9,cy+bodyH*.4,-L*.18+j*L*.08],[W*.008,H*.015,L*.045],.003,'Hull service slots');for(const z of [-.23,0,.23])bolt([side*bodyW*.91,cy,L*z]);}
}
const animalCache=new Map();
function animalSource(kind){let source=animalCache.get(kind);if(!source){const Creature=need('RRCreatureBody','../Character3D/CreatureBody.js');source=Creature.build({...Creature.kindRecipe(kind),fur:0,anatomy:{detail:false}},{quality:'preview',skinSize:256,hairBudget:.08});animalCache.set(kind,source);}return source;}
function draftContact(kind,height,dz){const source=animalSource(kind);let min=Infinity,max=-Infinity;for(const p of source.parts)for(let k=1;k<p.positions.length;k+=3){min=Math.min(min,p.positions[k]);max=Math.max(max,p.positions[k]);}const f=height/(max-min);let y=0;for(const p of source.parts)for(let k=0;k<p.positions.length;k+=3)if(Math.abs(p.positions[k]*f)<height*.075&&Math.abs(p.positions[k+2]*f-dz)<height*.035)y=Math.max(y,(p.positions[k+1]-min)*f);return y||height*.77;}
function animals(c,low){
 if(!c.team?.length)return {parts:[],textures:{}};
 const Creature=need('RRCreatureBody','../Character3D/CreatureBody.js'),parts=[],textures={};
 for(const [i,animal]of c.team.entries()){
  const source=animalSource(animal.kind);
  let min=Infinity,max=-Infinity;for(const p of source.parts)for(let k=1;k<p.positions.length;k+=3){min=Math.min(min,p.positions[k]);max=Math.max(max,p.positions[k]);}const f=animal.height/(max-min);
  for(const p of source.parts){const positions=Float32Array.from(p.positions,(v,k)=>k%3===0?v*f+animal.at[0]:k%3===1?(v-min)*f-low:v*f+animal.at[2]),q={...p,positions,index:p.index.slice(),name:'Draft '+animal.kind+' '+(i+1)+' '+p.name};CM.skin(q,0);parts.push(q);}Object.assign(textures,source.textures);
 }
 return {parts,textures};
}
const api={FORMS,IDS,HISTORIC,build,animals};root.RRVehicleExpansion=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
