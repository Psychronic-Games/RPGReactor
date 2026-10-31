/** Additional domestic, workshop, fantasy and spacecraft furnishings. Shared meters and material roles. */
(function(root){
'use strict';const need=(n,f)=>root[n]||(typeof require==='function'?require(f):null),CM=need('RRContainerMesh','./ContainerMesh.js');
const FORMS=[['stove','Cooking range','appliances',.76,.93,.66],['washer','Washing machine','appliances',.65,.87,.65],['dishwasher','Dishwasher','appliances',.62,.85,.62],['sink','Kitchen sink','appliances',1.1,.92,.62],['toilet','Toilet','appliances',.43,.79,.70],['smartToilet','Smart toilet','appliances',.52,.84,.74,'scifi'],['bath','Bathtub','appliances',.78,.62,1.8],['stool','Bar stool','furniture',.48,.80,.48],['officeChair','Office chair','furniture',.66,1.18,.70],['drawers','Chest of drawers','furniture',.95,1.04,.48],['coffeeTable','Coffee table','furniture',1.1,.43,.62],['workbench','Workbench','furniture',1.7,.92,.72],['throne','Throne','furniture',.92,1.85,.83,'fantasy'],['tavernTable','Tavern table','furniture',1.8,.79,.92,'fantasy'],['cryoPod','Cryogenic pod','medical',1.05,1.3,2.4,'scifi'],['medBed','Medical bed','medical',.95,.95,2.15,'scifi'],['fabricator','Fabricator','appliances',1.22,1.72,.94,'scifi'],['holoTable','Holographic table','electronics',1.5,1.15,1.05,'scifi'],['floorLamp','Floor lamp','electronics',.5,1.75,.5],['barCounter','Curved bar counter','furniture',3.4,1.12,1.2],['ivStand','IV infusion stand','medical',.65,2,.65],['patientMonitor','Patient monitor','medical',.58,1.38,.55],['medTrolley','Medical instrument trolley','medical',.78,.94,.52],['surgicalLamp','Surgical examination lamp','medical',.95,2.25,.95],['scanner','Diagnostic scanner','medical',2.0,2.5,2.35,'scifi'],['medStation','Medical treatment station','medical',1.35,1.9,.75,'scifi']];
const IDS=new Set(FORMS.map(f=>f[0]));
function build(c){
const {r,W,H,D,box,bar,pad,put,bolt,screen}=c,f=r.form;if(!IDS.has(f))return;
const round=(kind,p,profile,sides=48)=>put(kind,CM.revolveOn(CM.frame(p,[1,0,0],[0,0,-1]),0,0,profile,sides));
const bezel=(p,w,h,b=.015)=>{const F=CM.frame(p,[1,0,0],[0,1,0]),g=CM.bezel(F,w,h,.018,b,.004);put('metal',g.housing);put('dark',g.floor);return F;};
const handle=(p,w)=>{bar('metal',[p[0]-w/2,p[1],p[2]],[p[0]+w/2,p[1],p[2]],.009);for(const s of [-1,1])bar('metal',[p[0]+s*w/2,p[1],p[2]],[p[0]+s*w/2,p[1],p[2]-.022],.007);};
const tilt=(angle,pivot,draw)=>{const sizes=new Map([...c.groups].map(([k,v])=>[k,v.length]));draw();const tr=CM.pitch(angle,pivot);for(const [k,v]of c.groups)for(let i=sizes.get(k)||0;i<v.length;i++)CM.transform(v[i],tr.point,tr.normal);};
const caster=(p,radius=.035)=>{const F=CM.frame(p,[1,0,0],[0,1,0]);for(const side of [-1,1])put('trim',CM.revolveOn({...F,o:[p[0],p[1],p[2]+side*.024]},0,0,[[0,-.009],[radius*.82,-.009],[radius,-.005],[radius,.005],[radius*.82,.009],[0,.009]],32));bar('metal',[p[0],p[1],p[2]],[p[0],p[1]+radius*1.4,p[2]],.009);};
const legs=(top,material='frame',spread=.40)=>{for(const x of [-1,1])for(const z of [-1,1])box(material,[x*W*spread,top/2,z*D*spread],[W*.055,top,D*.075],.008);};
const service=()=>{if(!r.details)return;for(let k=0;k<7;k++)box('dark',[(k-3)*W*.055,H*.06,D*.503],[W*.025,.004,.003],.001);for(const x of [-1,1])bolt([x*W*.44,H*.10,D*.505]);};
if(['stove','washer','dishwasher','sink'].includes(f)){
 box('paint',[0,H*(f==='sink'?.40:.49),0],[W*.98,H*(f==='sink'?.77:.94),D*.98],.022);box('trim',[0,H*.04,D*.46],[W*.94,H*.07,.05],.008);box('metal',[0,H*.965,0],[W,H*.045,D],.014);service();
 if(f==='stove'){
  bezel([0,H*.48,D*.5],W*.82,H*.60,.024);box('glass',[0,H*.46,D*.515],[W*.68,H*.45,.012],.02);handle([0,H*.76,D*.545],W*.64);
  for(const x of [-1,1])for(const z of [-1,1]){const p=[x*W*.24,H*.995,z*D*.22],rad=Math.min(W,D)*.15;round('dark',p,[[0,0],[rad,0],[rad,.008],[0,.008]]);round('metal',p,[[rad*.82,.009],[rad*.92,.009],[rad*.92,.014],[rad*.82,.014],[rad*.82,.009]]);for(const a of [0,Math.PI/2])bar('trim',[p[0]-Math.cos(a)*rad,p[1]+.015,p[2]-Math.sin(a)*rad],[p[0]+Math.cos(a)*rad,p[1]+.015,p[2]+Math.sin(a)*rad],.003);}
  for(let k=0;k<4;k++)put('metal',CM.revolveOn(CM.frame([(k-1.5)*W*.19,H*.88,D*.51],[1,0,0],[0,1,0]),0,0,[[0,0],[W*.027,0],[W*.027,.017],[0,.017]],24));
 }
 if(f==='washer'){
  const F=CM.frame([0,H*.45,D*.50],[1,0,0],[0,1,0]),R=W*.33;put('metal',CM.revolveOn(F,0,0,[[R*.79,0],[R,0],[R,.035],[R*.79,.035],[R*.79,0]],64));put('glass',CM.revolveOn(F,0,0,[[0,.014],[R*.78,.014],[R*.78,.017],[0,.017]],48));
  handle([W*.28,H*.45,D*.56],W*.08);box('trim',[-W*.23,H*.85,D*.51],[W*.34,H*.09,.018],.005);screen([W*.15,H*.86,D*.514],[1,0,0],[0,1,0],W*.3,H*.10);
 }
 if(f==='dishwasher'){box('metal',[0,H*.52,D*.506],[W*.91,H*.86,.016],.014);handle([0,H*.83,D*.545],W*.68);for(let k=0;k<5;k++)box('accent',[(k-2)*W*.085,H*.93,D*.52],[.012,.006,.004],.001);}
 if(f==='sink'){
  // Open basin: four walls meet a recessed bottom; no full countertop covers its opening.
  const y=H*.99,hw=W*.36,hd=D*.32;box('metal',[0,y-.13,0],[hw*1.9,.018,hd*1.9],.024);for(const x of [-1,1])box('metal',[x*hw,y-.06,0],[.025,.14,hd*2],.01);for(const z of [-1,1])box('metal',[0,y-.06,z*hd],[hw*2,.14,.025],.01);
  // Remove the generic full top added above; keep the casing's rim visible around the bowl.
  const metal=c.groups?.get('metal');if(metal)metal.splice(0,1);
  for(const x of [-1,1])box('paint',[x*W*.24,H*.46,D*.505],[W*.46,H*.80,.018],.009);for(const x of [-1,1])handle([x*W*.10,H*.62,D*.54],W*.08);
  bar('metal',[0,y,-D*.35],[0,y+.24,-D*.35],.014);bar('metal',[0,y+.24,-D*.35],[0,y+.24,0],.014);bar('metal',[0,y+.24,0],[0,y+.20,0],.014);round('trim',[0,y-.114,0],[[0,0],[.021,0],[.021,.004],[0,.004]],24);
 }
 return;
}
if(f==='toilet'){
 // A closed ceramic pedestal and a separate open, elliptical bowl with a rounded rim.
 round('ceramic',[0,0,-D*.03],[[0,0],[W*.31,0],[W*.34,.025],[W*.29,H*.24],[W*.24,H*.30],[0,H*.30]],64);
 const bowl=CM.revolve([[0,0],[W*.25,0],[W*.43,H*.12],[W*.48,H*.20],[W*.48,H*.235],[W*.44,H*.25],[W*.39,H*.23],[W*.34,H*.10],[W*.18,H*.055],[0,H*.055]],80);
 put('ceramic',CM.transform(bowl,p=>[p[0],p[1]+H*.32,p[2]*1.35+D*.10],n=>CM.vec.norm([n[0],n[1],n[2]/1.35])));
 const seat=CM.revolve([[W*.39,0],[W*.48,0],[W*.49,.008],[W*.48,.026],[W*.40,.026],[W*.39,.016],[W*.39,0]],80);
 put('seatShell',CM.transform(seat,p=>[p[0],p[1]+H*.573,p[2]*1.35+D*.10],n=>CM.vec.norm([n[0],n[1],n[2]/1.35])));
 box('ceramic',[0,H*.74,-D*.29],[W*.91,H*.46,D*.28],.035);box('seatShell',[0,H*.98,-D*.29],[W*.95,.025,D*.30],.014);
 for(const x of [-1,1])bar('metal',[x*W*.22,H*.59,-D*.12],[x*W*.22,H*.61,-D*.12],.012);
 box('metal',[W*.25,H*.91,-D*.135],[.055,.017,.012],.004);round('metal',[0,H*.38,D*.10],[[0,0],[.020,0],[.020,.002],[0,.002]],32);return;
}
if(f==='bath'){
 const g=new CM.Geo(),n=96,profile=[[.82,.025],[.91,.025],[.98,H*.14],[1,H*.88],[.99,H*.97],[.96,H],[.88,H],[.85,H*.96],[.81,H*.32],[.72,H*.18],[.65,H*.16]];
 const at=(i,k)=>{const a=k/n*Math.PI*2,[v,y]=profile[i],co=Math.cos(a),si=Math.sin(a);return[Math.sign(co)*Math.abs(co)**.38*W*.5*v,y,Math.sign(si)*Math.abs(si)**.38*D*.5*v];};
 for(let i=0;i+1<profile.length;i++)for(let k=0;k<n;k++){
  const mid=(k+.5)/n*Math.PI*2,dy=profile[i+1][1]-profile[i][1],dr=profile[i+1][0]-profile[i][0];
  g.poly([at(i,k),at(i,(k+1)%n),at(i+1,(k+1)%n),at(i+1,k)],null,[dy*Math.cos(mid)/W,-dr,dy*Math.sin(mid)/D]);
 }
 g.poly(Array.from({length:n},(_,k)=>at(profile.length-1,k)),null,[0,1,0]);g.poly(Array.from({length:n},(_,k)=>at(0,k)),null,[0,-1,0]);put('ceramic',CM.smoothNormals(g.done(),.72));
 round('metal',[0,H*.162,-D*.25],[[0,0],[.024,0],[.024,.003],[0,.003]],40);
 for(const x of [-1,1]){bar('metal',[x*.07,H*.98,-D*.38],[x*.07,H+.08,-D*.38],.012);round('metal',[x*.07,H+.08,-D*.38],[[0,0],[.024,0],[.024,.014],[0,.014]],32);}
 bar('metal',[0,H*.99,-D*.40],[0,H+.24,-D*.40],.015);put('metal',CM.sweep([[0,H+.24,-D*.40],[0,H+.27,-D*.38],[0,H+.27,-D*.25],[0,H+.25,-D*.22]],.014,24,true));return;
}
if(['stool','officeChair','throne'].includes(f)){
 const sy=H*(f==='stool'?.93:f==='throne'?.28:.43);
 if(f==='officeChair'){
  // Gas lift, five swept spokes and upright twin casters; sculpted executive upholstery.
  bar('metal',[0,.11,0],[0,sy-.08,0],.024);round('trim',[0,.16,0],[[0,0],[.045,0],[.045,sy-.22],[0,sy-.22]],40);
  for(let j=0;j<5;j++){const a=j/5*Math.PI*2,u=[Math.cos(a),0,Math.sin(a)],p=[u[0]*W*.43,.055,u[2]*D*.43];bar('metal',[0,.15,0],[p[0],.09,p[2]],.023);
   const F=CM.frame(p,u,[0,1,0]);for(const t of [-1,1])put('trim',CM.revolveOn({...F,o:CM.vec.add(p,CM.vec.scale(F.n,t*.022))},0,0,[[0,-.008],[.029,-.008],[.034,-.004],[.034,.004],[.029,.008],[0,.008]],32));bar('metal',[p[0],.055,p[2]],[p[0],.11,p[2]],.009);}
  pad([0,sy,0],[W*.82,.105*r.padding,D*.72],.04);box('trim',[0,sy-.075,0],[W*.62,.035,D*.54],.015);
  tilt(-.10,[0,sy,-D*.27],()=>{pad([0,H*.73,-D*.31],[W*.75,H*.50,.115],.045);pad([0,H*.94,-D*.26],[W*.49,H*.13,.10],.035);pad([0,H*.60,-D*.24],[W*.53,H*.10,.07],.025);});
  for(const x of [-1,1]){put('metal',CM.sweep([[x*W*.32,sy-.05,-D*.17],[x*W*.40,sy+.13,-D*.12],[x*W*.40,sy+.21,D*.10]],.014,24,true));pad([x*W*.40,sy+.21,0],[.075,.045,D*.48],.019);}
  bar('metal',[W*.18,sy-.10,0],[W*.36,sy-.10,D*.06],.009);
 }else if(f==='stool'){
  for(let j=0;j<4;j++){const a=Math.PI/4+j*Math.PI/2,x=Math.cos(a),z=Math.sin(a);bar('frame',[x*W*.44,.025,z*D*.44],[x*W*.30,sy-.045,z*D*.30],.021);round('trim',[x*W*.44,0,z*D*.44],[[0,0],[.024,0],[.024,.025],[0,.025]],24);}
  const ringY=sy*.37,R=W*(.44-(.44-.30)*(ringY-.025)/(sy-.07));put('metal',CM.sweep(Array.from({length:97},(_,j)=>[Math.cos(j/96*Math.PI*2)*R,ringY,Math.sin(j/96*Math.PI*2)*R*D/W]),.012,16,false));
  round('frame',[0,sy-.045,0],[[0,0],[W*.46,0],[W*.48,.025],[W*.46,.045],[0,.045]],64);pad([0,sy+.014,0],[W*.86,.085,D*.86],.040);
 }else{
  legs(sy-.04);pad([0,sy,0],[W*.94,.10,D*.90],.035);box('frame',[0,H*.62,-D*.39],[W*.98,H*.76,.11],.025);pad([0,H*.65,-D*.32],[W*.70,H*.53,.06],.028);
  for(const x of [-1,1]){box('frame',[x*W*.45,H*.56,0],[W*.08,H*.52,D*.85],.018);round('metal',[x*W*.45,H*.99,-D*.39],[[0,0],[W*.04,0],[W*.04,.025],[0,.07]],24);}for(let j=0;j<5;j++)round('metal',[(j-2)*W*.14,H*.95,-D*.39],[[0,0],[.012,0],[0,.06+(j===2?.05:0)]],16);
 }return;
}
if(f==='barCounter'){
 // Bowed customer face, solid overhanging worktop and open bartender shelving.
 const front=z=>D*(.23+.23*Math.sqrt(Math.max(0,1-(z/(W*.51))**2))),N=48,g=new CM.Geo();
 for(let j=0;j<N;j++){const x0=-W*.5+W*j/N,x1=-W*.5+W*(j+1)/N,z0=front(x0),z1=front(x1);g.poly([[x0,.06,z0],[x1,.06,z1],[x1,H-.10,z1],[x0,H-.10,z0]],null,[0,0,1]);g.poly([[x0,.06,z0-.065],[x1,.06,z1-.065],[x1,H-.10,z1-.065],[x0,H-.10,z0-.065]],null,[0,0,-1]);}
 put('wood',g.done());const outline=[[-W*.51,-D*.45],[W*.51,-D*.45],...Array.from({length:N+1},(_,j)=>{const x=W*.51-W*1.02*j/N;return[x,front(x)+.045];})];
 const F=CM.frame([0,H-.08,0],[1,0,0],[0,0,-1]);put('frame',CM.slab(outline.flatMap(([x,z])=>[x,-z]),F,.08,.012,true));
 for(const x of [-1,1])box('wood',[x*W*.475,H*.45,-D*.06],[.05,H*.84,D*.68],.008);
 for(const y of [.12,.49])box('wood',[0,y,-D*.15],[W*.91,.035,D*.55],.008);
 const foot=Array.from({length:49},(_,j)=>{const x=-W*.44+W*.88*j/48;return[x,.22,front(x)+.13];});put('metal',CM.sweep(foot,.016,20,true));for(const x of [-.4,0,.4])bar('metal',[x*W,.12,front(x*W)],[x*W,.22,front(x*W)+.13],.012);return;
}
if(['drawers','coffeeTable','workbench','tavernTable'].includes(f)){
 if(f==='drawers'){box('frame',[0,H*.52,0],[W,H*.94,D],.015);for(let j=0;j<r.drawers;j++){const h=H*.86/r.drawers,y=H*.1+h*(j+.5);box('wood',[0,y,D*.51],[W*.92,h-.012,.035],.008);handle([0,y,D*.56],W*.35);}box('wood',[0,H*.98,0],[W*1.04,.045,D*1.05],.01);}
 else {legs(H-.06);for(let j=0;j<7;j++)box('wood',[(j-3)*W/7,H-.027,0],[W/7-.004,.054,D],.008);for(const z of [-1,1])bar('frame',[-W*.41,H*.23,z*D*.40],[W*.41,H*.23,z*D*.40],.025);if(f==='workbench'){box('frame',[0,H*.31,0],[W*.86,.035,D*.82],.006);box('metal',[W*.33,H+.05,D*.33],[W*.13,.12,D*.16],.01);bar('metal',[W*.33,H+.12,D*.33],[W*.52,H+.12,D*.33],.009);}}
 return;
}
if(f==='cryoPod'){
 box('paint',[0,H*.5,0],[W,H,D*.80],.10);box('trim',[0,H*.52,D*.415],[W*.87,H*.86,.08],.055);box('glass',[0,H*.54,D*.468],[W*.70,H*.73,.032],.07);pad([0,H*.54,D*.37],[W*.64,H*.70,.04],.035);for(const x of [-1,1])box('light',[x*W*.42,H*.50,D*.47],[.014,H*.81,.012],.004);screen([0,H*.10,D*.47],[1,0,0],[0,1,0],W*.49,H*.08);for(const x of [-1,1])for(const y of [.12,.88])bolt([x*W*.43,H*y,D*.46]);return;
}
if(f==='medBed'){
 box('trim',[0,H*.25,0],[W*.70,H*.34,D*.63],.045);box('paint',[0,H*.49,0],[W*.94,H*.13,D*.94],.04);
 for(const x of [-1,1])for(const z of [-1,1])caster([x*W*.35,.045,z*D*.34],.038);
 box('paint',[0,H*.60,D*.22],[W*.96,.065,D*.49],.025);pad([0,H*.68,D*.22],[W*.87,H*.12,D*.48],.035);
 tilt(r.recline*Math.PI/180,[0,H*.66,-D*.04],()=>{box('paint',[0,H*.60,-D*.265],[W*.96,.065,D*.45],.025);pad([0,H*.68,-D*.265],[W*.87,H*.12,D*.45],.035);pad([0,H*.79,-D*.38],[W*.65,H*.10,D*.17],.03);});
 for(const x of [-1,1]){for(const z of [-.10,.32])bar('metal',[x*W*.48,H*.53,z*D],[x*W*.48,H*.92,z*D],.012);bar('metal',[x*W*.48,H*.92,-D*.10],[x*W*.48,H*.92,D*.32],.012);box('light',[x*W*.485,H*.49,0],[.01,.012,D*.78],.003);}
 bar('metal',[-W*.40,H*.5,-D*.38],[-W*.40,H*1.8,-D*.38],.009);bar('metal',[-W*.52,H*1.8,-D*.38],[-W*.28,H*1.8,-D*.38],.009);screen([W*.27,H*.48,D*.48],[1,0,0],[0,1,0],W*.30,H*.10);return;
}
if(['ivStand','patientMonitor','surgicalLamp'].includes(f)){
 const stem=f==='ivStand'?H*.96:f==='patientMonitor'?H*.70:H*.68;
 for(let j=0;j<5;j++){const a=j/5*Math.PI*2,p=[Math.cos(a)*W*.42,.038,Math.sin(a)*D*.42];bar('metal',[0,.10,0],p,.014);caster(p,.026);}
 bar('metal',[0,.09,0],[0,stem,0],.014);
 if(f==='ivStand'){
  for(const side of [-1,1]){put('metal',CM.sweep([[0,stem-.02,0],[side*W*.22,stem+.035,0],[side*W*.27,stem,0],[side*W*.27,stem-.05,0]],.005,12,true));box('fluid',[side*W*.25,stem-.21,0],[W*.16,H*.15,.035],.015);put('tube',CM.sweep([[side*W*.25,stem-.35,0],[side*W*.28,H*.45,.02],[side*W*.18,H*.22,.04]],.003,10,true));}
  box('paint',[0,H*.55,.055],[.10,.13,.06],.015);screen([0,H*.56,.09],[1,0,0],[0,1,0],.07,.065);
 }else if(f==='patientMonitor'){
  box('paint',[0,H*.82,0],[W*.92,H*.34,.12],.026);screen([0,H*.83,.065],[1,0,0],[0,1,0],W*.75,H*.24);for(let k=0;k<3;k++)round('accent',[(k-1)*W*.19,H*.68,.065],[[0,0],[.009,0],[.009,.005],[0,.005]],20);
  handle([0,H*1.01,0],W*.35);put('tube',CM.sweep([[W*.41,H*.75,0],[W*.46,H*.43,.05],[W*.32,H*.28,.11]],.004,12,true));
 }else{
  put('metal',CM.sweep([[0,stem,0],[W*.18,H*.83,0],[W*.36,H*.91,D*.10]],.022,24,true));
  const F=CM.frame([W*.30,H*.90,D*.12],[1,0,0],[0,0,1]);put('paint',CM.revolveOn(F,0,0,[[0,-.045],[W*.27,-.045],[W*.29,0],[W*.25,.04],[0,.04]],64));for(let j=0;j<6;j++){const a=j/6*Math.PI*2;put('light',CM.revolveOn({...F,o:[W*.30+Math.cos(a)*W*.16,H*.90-.043,D*.12+Math.sin(a)*W*.16]},0,0,[[0,0],[W*.065,0],[W*.065,.006],[0,.006]],32));}
 }return;
}
if(f==='medTrolley'){
 for(const x of [-1,1])for(const z of [-1,1]){caster([x*W*.42,.04,z*D*.39]);bar('metal',[x*W*.42,.07,z*D*.39],[x*W*.42,H*.98,z*D*.39],.013);}
 for(const y of [.22,.59,.93]){box('metal',[0,H*y,0],[W,.028,D],.012);for(const z of [-1,1])bar('metal',[-W*.48,H*y+.035,z*D*.46],[W*.48,H*y+.035,z*D*.46],.007);}
 box('paint',[0,H*.72,0],[W*.85,H*.20,D*.84],.015);handle([0,H*.73,D*.45],W*.38);box('ceramic',[-W*.20,H*.97,0],[W*.24,.035,D*.45],.012);round('metal',[W*.22,H*.95,0],[[0,0],[W*.11,0],[W*.11,.085],[0,.085]],40);return;
}
if(f==='scanner'){
 box('paint',[0,.09,0],[W,.18,D*.85],.08);const F=CM.frame([0,H*.57,-D*.12],[1,0,0],[0,1,0]);put('paint',CM.revolveOn(F,0,0,[[W*.36,-.28],[W*.49,-.28],[W*.50,.25],[W*.47,.32],[W*.36,.32],[W*.34,.25],[W*.34,-.22],[W*.36,-.28]],96));put('light',CM.revolveOn(F,0,0,[[W*.341,.18],[W*.35,.18],[W*.35,.205],[W*.341,.205],[W*.341,.18]],96));box('trim',[0,H*.25,D*.18],[W*.30,H*.40,D*.56],.03);pad([0,H*.47,D*.18],[W*.33,.07,D*.76],.025);screen([W*.38,H*.55,D*.32],[1,0,0],[0,1,0],W*.12,H*.12);return;
}
if(f==='medStation'){
 box('paint',[0,H*.48,0],[W,H*.93,D],.055);box('trim',[0,H*.08,D*.49],[W*.89,.09,.04],.01);screen([0,H*.76,D*.51],[1,0,0],[0,1,0],W*.73,H*.23);
 for(const x of [-1,1])box('light',[x*W*.46,H*.60,D*.51],[.015,H*.65,.012],.005);
 for(let j=0;j<3;j++){box('trim',[-W*.15,H*(.20+j*.13),D*.51],[W*.53,H*.105,.026],.012);handle([-W*.15,H*(.20+j*.13),D*.55],W*.28);}
 for(let j=0;j<3;j++){const y=H*(.22+j*.15);box('glass',[W*.30,y,D*.515],[W*.18,H*.12,.03],.018);box('light',[W*.30,y-H*.045,D*.537],[W*.12,.008,.008],.003);}return;
}
if(f==='fabricator'){
 box('paint',[0,H*.5,0],[W,H,D],.055);box('dark',[0,H*.51,D*.505],[W*.77,H*.61,.018],.025);box('metal',[0,H*.24,D*.42],[W*.69,.035,D*.10],.01);for(const x of [-1,1])bar('metal',[x*W*.30,H*.25,D*.42],[x*W*.30,H*.79,D*.42],.012);bar('metal',[-W*.30,H*.64,D*.43],[W*.30,H*.64,D*.43],.02);box('trim',[0,H*.59,D*.46],[W*.11,H*.11,.06],.008);box('light',[0,H*.52,D*.46],[W*.028,H*.018,.03],.004);screen([0,H*.91,D*.51],[1,0,0],[0,1,0],W*.58,H*.10);return;
}
if(f==='holoTable'){
 box('paint',[0,H*.28,0],[W*.70,H*.52,D*.70],.08);box('trim',[0,H*.56,0],[W,H*.10,D],.055);box('screen',[0,H*.614,0],[W*.85,.008,D*.82],.018);for(const x of [-1,1])box('light',[x*W*.46,H*.62,0],[.012,.014,D*.87],.003);round('light',[0,H*.63,0],[[0,0],[W*.11,0],[W*.07,H*.17],[0,H*.25]],32);return;
}
if(f==='floorLamp'){
 round('metal',[0,0,0],[[0,0],[W*.48,0],[W*.48,.028],[W*.38,.04],[0,.04]],48);bar('metal',[0,.02,0],[0,H*.83,0],W*.025);round('paint',[0,H*.76,0],[[W*.49,0],[W*.28,H*.22],[W*.24,H*.22],[W*.45,0],[W*.49,0]],64);round('light',[0,H*.80,0],[[0,0],[W*.15,0],[W*.15,.02],[0,.03]],32);
}
}
const api={FORMS,IDS,build};root.RRFurnitureExpansion=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
