/** Purpose-built clinical equipment and electronics. All fittings meet supporting solids. */
(function(root){'use strict';
const CM=root.RRContainerMesh||(typeof require==='function'?require('./ContainerMesh.js'):null),HS=root.RRHardSurface||(typeof require==='function'?require('./HardSurface.js'):null),{add,sub,scale,norm}=CM.vec;
const IDS=new Set(['medBed','sink','toilet','smartToilet','cryoPod','fabricator','scanner','patientMonitor','surgicalLamp','holoTable','wallPanel','tv','computer','medStation']);
function build(c){const {r,W,H,D,box,bar,pad:padBase,put,screen}=c,f=r.form;if(!IDS.has(f))return null;
const pad=(p,s,b)=>padBase(p,[s[0],s[1]*r.padding,s[2]],b);
const round=(role,p,profile,N=64,u=[1,0,0],v=[0,0,-1])=>put(role,CM.revolveOn(CM.frame(p,u,v),0,0,profile,N));
const tube=(role,path,rad=.01,N=20)=>put(role,CM.sweep(path,rad,N,true));
const tilt=(angle,pivot,draw)=>{const before=new Map([...c.groups].map(([k,v])=>[k,v.length]));draw();const t=CM.pitch(angle,pivot);for(const [k,list]of c.groups)for(let j=before.get(k)||0;j<list.length;j++)CM.transform(list[j],t.point,t.normal);};
const screw=(p,n=[0,0,1],rad=.004)=>{if(!r.details)return;const F=CM.frame(p,n[0]?[0,0,-1]:[1,0,0],n[1]?[0,0,-1]:[0,1,0]);put('metal',CM.revolveOn(F,0,0,[[0,0],[rad,0],[rad,.002],[0,.002]],20));};
const wheel=(p,R=.04)=>{for(const side of [-1,1])round('trim',add(p,[0,0,side*.022]),[[0,-.008],[R*.8,-.008],[R,-.004],[R,.004],[R*.8,.008],[0,.008]],40,[1,0,0],[0,1,0]);bar('metal',add(p,[0,R*.75,-.035]),add(p,[0,R*.75,.035]),.009);bar('metal',add(p,[0,R*.75,0]),add(p,[0,R*1.7,0]),.011);};
const vents=(p,w,h,n=9)=>{if(!r.details)return;for(let j=0;j<n;j++)box('dark',[p[0]+(j-(n-1)/2)*w/n,p[1],p[2]],[w/n*.36,h,.004],.001);};
const display=(p,w,h)=>{box('paint',add(p,[0,0,-.025]),[w+.04,h+.04,.06],.018);screen(add(p,[0,0,.008]),[1,0,0],[0,1,0],w,h);if(r.details)for(let j=0;j<4;j++)box('keys',[p[0]+(j-1.5)*w*.15,p[1]-h/2-.023,p[2]+.016],[.018,.007,.004],.002);};
if(f==='medBed'){
 const deck=H*.55,base=H*.16;
 for(const z of [-1,1]){box('metal',[0,base,z*D*.33],[W*.88,.055,.10],.02);for(const x of [-1,1]){const p=[x*W*.37,.046,z*D*.33];wheel(p);bar('metal',add(p,[0,.065,0]),[p[0],base,p[2]],.018);}}
 box('paint',[0,H*.20,0],[W*.62,.11,D*.56],.035);for(const side of [-1,1]){bar('metal',[side*W*.22,H*.22,-D*.22],[side*W*.22,deck-.04,D*.21],.027);bar('metal',[side*W*.22,H*.22,D*.22],[side*W*.22,deck-.04,-D*.21],.027);}bar('metal',[0,H*.23,-D*.24],[0,deck-.05,D*.13],.043);box('paint',[0,deck,0],[W,.07,D*.95],.028);
 for(const z of [-.31,.12,.36])box('trim',[0,deck+.05,D*z],[W*.88,.012,.014],.004);
 box('paint',[0,deck+.065,D*.23],[W*.93,.05,D*.46],.022);pad([0,deck+.14,D*.23],[W*.88,.11,D*.46],.035);
 tilt(r.recline*Math.PI/180,[0,deck+.10,-D*.015],()=>{box('paint',[0,deck+.07,-D*.25],[W*.93,.05,D*.45],.025);pad([0,deck+.15,-D*.25],[W*.88,.11,D*.45],.035);pad([0,deck+.24,-D*.39],[W*.66,.085,D*.15],.03);});
 for(const x of [-1,1]){for(const z of [-.08,.32])bar('metal',[x*W*.48,deck,z*D],[x*W*.48,deck+.32,z*D],.012);tube('metal',[[x*W*.48,deck+.23,-D*.11],[x*W*.48,deck+.32,-D*.08],[x*W*.48,deck+.32,D*.32],[x*W*.48,deck+.23,D*.35]],.012);box('paint',[x*W*.48,deck+.13,D*.15],[.025,.16,D*.27],.018);}
 const poleX=-W*.5-.24,poleZ=-D*.39;bar('metal',[-W*.40,deck,poleZ],[poleX,deck,poleZ],.018);bar('metal',[poleX,deck-.04,poleZ],[poleX,deck+1.12,poleZ],.011);tube('metal',[[poleX-.12,deck+1.06,poleZ],[poleX-.12,deck+1.12,poleZ],[poleX+.12,deck+1.12,poleZ],[poleX+.12,deck+1.06,poleZ]],.005);
 box('fluid',[poleX-.08,deck+.89,poleZ],[.085,.25,.035],.018);tube('tube',[[poleX-.08,deck+.77,poleZ],[poleX-.12,deck+.64,poleZ],[poleX-.10,deck+.22,poleZ+.10]],.003,12);
 for(const z of [-1,1]){box('paint',[0,deck+.16,z*D*.48],[W*.94,.30,.035],.025);bar('metal',[-W*.30,deck+.25,z*D*.50],[W*.30,deck+.25,z*D*.50],.012);}
 display([W*.27,H*.38,D*.285],W*.28,H*.10);return {};
}
if(f==='sink'){
 const top=H-.025,hw=W*.34,hd=D*.29,bottom=top-.17;
 box('paint',[0,H*.38,0],[W*.98,H*.76,D*.98],.018);
 const wallBottom=H*.755,wallTop=top-.016,wallY=(wallBottom+wallTop)/2;for(const side of [-1,1]){box('paint',[side*W*.48,wallY,0],[W*.035,wallTop-wallBottom,D*.98],.006);box('paint',[0,wallY,side*D*.48],[W*.98,wallTop-wallBottom,D*.035],.006);}
 const hole=Array.from({length:96},(_,k)=>{const a=k/96*Math.PI*2;return[Math.sign(Math.cos(a))*Math.abs(Math.cos(a))**.40*hw*.985,Math.sign(Math.sin(a))*Math.abs(Math.sin(a))**.40*hd*.985];});put('metal',HS.plate(HS.round([[-W/2,-D/2],[W/2,-D/2],[W/2,D/2],[-W/2,D/2]],.012,4),.035,.004,{holes:[hole],frame:{o:[0,top,0],u:[1,0,0],v:[0,0,-1],n:[0,1,0]}}));
 for(const side of [-1,1]){box('paint',[side*W*.245,H*.41,D*.50],[W*.47,H*.69,.025],.012);bar('metal',[side*W*.08,H*.56,D*.53],[side*W*.08,H*.39,D*.53],.007);}
 const g=new CM.Geo(),N=96,profile=[[1,top+.012],[.96,top+.014],[.91,top-.012],[.82,bottom+.04],[.68,bottom],[0,bottom]];
 const at=(i,k)=>{const a=k/N*Math.PI*2,[t,y]=profile[i];return[Math.sign(Math.cos(a))*Math.abs(Math.cos(a))**.40*hw*t,y,Math.sign(Math.sin(a))*Math.abs(Math.sin(a))**.40*hd*t];};
 for(let i=0;i+1<profile.length;i++)for(let k=0;k<N;k++)g.poly([at(i,k),at(i,(k+1)%N),at(i+1,(k+1)%N),at(i+1,k)],null,[Math.cos((k+.5)/N*Math.PI*2)*(profile[i+1][1]-profile[i][1]),profile[i][0]-profile[i+1][0],Math.sin((k+.5)/N*Math.PI*2)*(profile[i+1][1]-profile[i][1])]);put('sinkInterior',CM.smoothNormals(g.done(),.75));
 round('metal',[0,bottom+.002,0],[[0,0],[.027,0],[.027,.004],[0,.004]],48);if(r.details)for(let j=0;j<6;j++){const a=j/6*Math.PI*2;round('dark',[Math.cos(a)*.015,bottom+.007,Math.sin(a)*.015],[[0,0],[.0025,0],[.0025,.001],[0,.001]],12);}
 tube('metal',[[0,top,-D*.37],[0,top+.21,-D*.37],[0,top+.27,-D*.27],[0,top+.26,-D*.12],[0,top+.20,-D*.09]],.013,32);round('metal',[0,top,-D*.37],[[0,0],[.032,0],[.028,.035],[0,.035]],48);bar('metal',[.025,top+.06,-D*.37],[.075,top+.10,-D*.37],.009);return {};
}
if(f==='toilet'||f==='smartToilet'){
 const future=f==='smartToilet',seatY=H*.57,center=D*.10;
 // The outer bowl and pedestal share one axis. A separate wash-basin finish
 // keeps chrome reflections from turning the water and cavity into a mirror.
 const body=CM.revolve([[W*.10,0],[W*.32,0],[W*.35,.025],[W*.34,.055],[W*.29,H*.22],[W*.25,H*.27],[W*.235,H*.30],[W*.25,H*.32],[W*.29,H*.34],[W*.35,H*.37],[W*.41,H*.42],[W*.46,H*.48],[W*.48,H*.52],[W*.48,H*.555],[W*.45,H*.57],[W*.39,H*.555]],96);
 put('ceramic',CM.transform(body,p=>[p[0],p[1],p[2]*1.35+center],n=>norm([n[0],n[1],n[2]/1.35])));
 // The inner profile drains into an open, rear-curving throat inside the pedestal.
 // There is no solid floor or decorative plug at the bottom of the bowl.
 const basinProfile=[[W*.39,H*.555],[W*.38,H*.48],[W*.33,H*.435],[W*.27,H*.40],[W*.22,H*.375],[W*.17,H*.345]];
 const throatProfile=[[W*.17,H*.345],[W*.125,H*.30],[W*.105,H*.255],[W*.10,H*.20],[W*.098,H*.16],[W*.09,H*.125],[W*.085,H*.11],[W*.095,H*.06],[W*.10,0]];
 const placeBasin=m=>CM.smoothNormals(CM.transform(m,p=>[p[0],p[1],p[2]*1.35+center-(p[1]>=H*.11?Math.max(0,H*.20-p[1])/(H*.09):Math.max(0,p[1])/(H*.11))*D*.12],n=>norm([n[0],n[1],n[2]/1.35])),.72);
 put('bowlInterior',placeBasin(CM.revolve(basinProfile,96)));
 put('drainInterior',placeBasin(CM.revolve(throatProfile,96)));
 const seat=CM.revolve([[W*.39,0],[W*.48,0],[W*.49,.009],[W*.48,.028],[W*.40,.028],[W*.39,.018],[W*.39,0]],96);put('seatShell',CM.transform(seat,p=>[p[0],p[1]+seatY,p[2]*1.35+center],n=>norm([n[0],n[1],n[2]/1.35])));
 box('ceramic',[0,H*.735,-D*.43],[W*.90,H*.45,D*.26],.045);box('seatShell',[0,H*.96+.009,-D*.43],[W*.94,.022,D*.28],.012);
 const hingeZ=-D*.265;box('seatShell',[0,seatY+.007,hingeZ],[W*.64,.032,.06],.012);for(const x of [-1,1]){box('metal',[x*W*.22,seatY+.02,hingeZ],[.035,.018,.04],.006);screw([x*W*.22,seatY+.031,hingeZ],[0,1,0]);if(!future){box('ceramic',[x*W*.27,.03,-D*.06],[.044,.03,.065],.009);screw([x*W*.27,.047,-D*.06],[0,1,0]);}}
 for(const x of [-1,1])round('metal',[x*.027,H*.96+.020,-D*.43],[[0,0],[.025,0],[.025,.004],[0,.004]],40);
 if(r.details){const lid=CM.revolve([[0,.010],[W*.15,.009],[W*.32,.004],[W*.45,0],[W*.47,.008],[W*.46,.024],[W*.36,.032],[W*.18,.037],[0,.038]],96),lift=CM.pitch(-Math.PI*.45,[0,seatY+.028,hingeZ]);CM.transform(lid,p=>[p[0],p[1]+seatY+.028,p[2]*1.35+center],n=>norm([n[0],n[1],n[2]/1.35]));CM.transform(lid,lift.point,lift.normal);put('seatShell',lid);}
 // One translucent surface meets the basin exactly at its waterline.
 const water=new CM.Geo(),waterY=H*.38,waterR=W*.23;
 for(let j=0;j<96;j++){
  const at=k=>{const a=k/96*Math.PI*2;return[Math.sin(a)*waterR,waterY,Math.cos(a)*waterR*1.35+center];};
  water.poly([[0,waterY,center],at(j),at(j+1)],null,[0,1,0]);
 }
 put('water',water.done());
 // The supply connection exits the rear of the tank toward the wall.
 const inlet=CM.frame([W*.24,H*.60,-D*.555],[-1,0,0],[0,1,0]);
 put('metal',CM.revolveOn(inlet,0,0,[[.008,0],[.018,0],[.018,.007],[.011,.012],[.010,D*.085],[.007,D*.085],[.007,.012],[.008,0]],48));
 if(future){
  const armY=H*.68,armThickness=H*.075,armTop=armY+armThickness/2,armBottom=armY-armThickness/2;
  for(const side of [-1,1]){
   const x=side*W*.65;
   // Recess both displays into one arm assembly; solid cantilever supports
   // replace the exposed round struts and oversized console mounting blocks.
   box('paint',[x,armY,D*.015],[W*.24,armThickness,D*.50],.023);
   box('paint',[side*W*.525,H*.55,-D*.10],[W*.29,H*.09,D*.12],.012);
   const bridgeBottom=H*.505;
   const support=CM.frame([x-W*.055,0,-D*.10],[0,0,-1],[0,1,0]);
   put('paint',CM.slab([-D*.06,armBottom+.009,D*.06,armBottom+.009,D*.035,bridgeBottom-.009,-D*.035,bridgeBottom-.009],support,W*.11,.006,true));
   box('paint',[x,armY+.020,D*.22],[W*.21,.080,D*.105],.016);
   const front=[x,H*.76,D*.28],width=W*.18,height=.085;
   tilt(-Math.PI/5,front,()=>{
    box('paint',add(front,[0,0,-.020]),[width+.018,height+.018,.045],.012);
    screen(add(front,[0,0,.003]),[1,0,0],[0,1,0],width,height);
   });
   // The long screen axis follows the armrest, mirrored toward the seated user.
   screen([x,armTop-.010,-D*.015],[0,0,side],[side,0,0],D*.28,W*.18);
  }
 }

 return {};
}
if(f==='cryoPod'){
 // Reclined, human-length sealed chamber with an open supporting cradle and a real glazed lid.
 const angle=.30,baseY=.55,halfD=D*.46;
 for(const z of [-.30,.30]){const wz=z*D,contact=baseY-.04/Math.cos(angle)-wz*Math.tan(angle),top=contact-.027;box('trim',[0,.09,wz],[W*.87,.18,D*.18],.04);box('metal',[0,(top+.15)/2,wz],[W*.68,top-.15,D*.12],.025);tilt(angle,[0,contact,wz],()=>box('metal',[0,contact-.012,wz],[W*.72,.035,D*.14],.012));}
 tilt(angle,[0,baseY,0],()=>{
  box('paint',[0,baseY+.05,0],[W,.18,D*.95],.085);pad([0,baseY+.17,0],[W*.69,.09,D*.80],.04);pad([0,baseY+.24,-D*.33],[W*.50,.07,D*.16],.03);
  for(const side of [-1,1]){box('paint',[side*W*.43,baseY+.27,0],[W*.13,.38,D*.89],.05);tube('light',[[side*W*.35,baseY+.42,-halfD*.85],[side*W*.35,baseY+.42,halfD*.85]],.006);}
  for(const z of [-1,1])box('paint',[0,baseY+.29,z*D*.45],[W*.90,.42,D*.09],.045);
  const g=new CM.Geo(),rows=36,cols=64,at=(j,k)=>{const a=k/cols*Math.PI,z=-D*.40+j/rows*D*.80,t=Math.sin(Math.PI*j/rows);return[Math.cos(a)*W*.38,baseY+.43+Math.sin(a)*W*.38*(.7+.3*t),z];};
  for(let j=0;j<rows;j++)for(let k=0;k<cols;k++)g.poly([at(j,k),at(j+1,k),at(j+1,k+1),at(j,k+1)],null,[Math.cos((k+.5)/cols*Math.PI),Math.sin((k+.5)/cols*Math.PI),0]);put('clearGlass',CM.smoothNormals(g.done(),.8));
  const frost=new CM.Geo();for(const j of [0,1,34,35])for(let k=0;k<cols;k++)frost.poly([at(j,k),at(j+1,k),at(j+1,k+1),at(j,k+1)].map(p=>[p[0]*1.001,p[1]+.0005,p[2]]),null,[Math.cos((k+.5)/cols*Math.PI),Math.sin((k+.5)/cols*Math.PI),0]);
  tube('metal',Array.from({length:65},(_,k)=>at(18,k)),.009);
  for(const side of [-1,1]){const cap=new CM.Geo();const points=[[W*.38,baseY+.43,side*D*.40],...Array.from({length:65},(_,k)=>[Math.cos(k/64*Math.PI)*W*.38,baseY+.43+Math.sin(k/64*Math.PI)*W*.266,side*D*.40])];cap.poly(points,null,[0,0,side]);put('clearGlass',cap.done());}
  for(const z of [-1,1])tube('metal',Array.from({length:49},(_,k)=>[Math.cos(k/48*Math.PI)*W*.39,baseY+.43+Math.sin(k/48*Math.PI)*W*.27,z*D*.40]),.018);for(const side of [-1,1])tube('metal',[[side*W*.39,baseY+.43,-D*.40],[side*W*.39,baseY+.43,D*.40]],.017);
  for(const side of [-1,1])for(const z of [-.30,.30]){box('metal',[side*W*.49,baseY+.27,z*D],[.045,.12,.08],.015);screw([side*W*.49,baseY+.28,z*D+.043]);}
 });
 for(const side of [-1,1]){for(let j=0;j<3;j++){const z=(-.24+j*.24)*D,y=baseY-.04-z*Math.tan(angle);box('secondary',[side*W*.49,y+.17,z],[W*.16,.23,D*.20],.035);vents([side*W*.49,y+.17,z+D*.105],W*.12,.09,7);for(const x of [-1,1])screw([side*W*.49+x*W*.05,y+.24,z+D*.105]);}tube('metal',[[side*W*.51,.20,-D*.29],[side*W*.53,.40,0],[side*W*.51,.24,D*.30]],.022);}
 tilt(angle,[0,baseY,0],()=>{for(const z of [-.28,0,.28]){box('metal',[0,baseY+.455+W*.38*(.7+.3*Math.sin(Math.PI*(z+.40)/.8)),z*D],[W*.09,.028,.12],.012);for(const side of [-1,1])tube('light',[[side*W*.36,baseY+.44,z*D-.03],[side*W*.36,baseY+.44,z*D+.03]],.004);}tube('metal',Array.from({length:33},(_,j)=>{const z=-D*.34+j/32*D*.68;return[0,baseY+.438+W*.38*(.7+.3*Math.sin(Math.PI*(z/D+.40)/.8)),z];}),.012);});
 display([W*.32,.42,D*.46+.05],W*.26,.15);
 const cradle=CM.pitch(angle,[0,baseY,0]);for(const side of [-1,1]){const port=cradle.point([side*W*.49,baseY+.22,D*.32]);tube('tube',[[side*W*.27,.17,D*.30],[side*W*.44,.20,D*.36],[side*W*.51,port[1]-.08,port[2]+.04],port],.012);box('metal',port,[.045,.055,.07],.009);}
 tilt(angle,[0,baseY,0],()=>{for(const side of [-1,1]){vents([side*W*.43,baseY+.25,D*.45+.048],W*.07,.12,5);}});return {};
}
if(f==='scanner'){
 const cy=H*.57,outer=W*.49,inner=W*.34,F=CM.frame([0,cy,-D*.19],[1,0,0],[0,1,0]);
 box('paint',[0,.14,-D*.04],[W*.83,.28,D*.46],.085);
 put('paint',CM.revolveOn(F,0,0,[[inner,-.32],[outer*.94,-.32],[outer,-.25],[outer,.23],[outer*.94,.32],[inner,.32],[inner*.97,.26],[inner*.97,-.26],[inner,-.32]],128));
 for(const z of [-.27,.27])put('metal',CM.revolveOn({...F,o:[0,cy,-D*.19+z]},0,0,[[inner,0],[inner+.026,0],[inner+.026,.015],[inner,.015],[inner,0]],128));
 for(let j=0;j<12;j++){const a=(j+.5)/12*Math.PI*2;round('light',[Math.cos(a)*(inner+.04),cy+Math.sin(a)*(inner+.04),-D*.19+.33],[[0,0],[.009,0],[.009,.004],[0,.004]],20,[1,0,0],[0,1,0]);}
 for(const side of [-1,1]){box('trim',[side*W*.43,H*.30,-D*.18],[W*.10,H*.34,D*.42],.035);display([side*W*.42,cy-D*.03,-D*.19+.35],W*.12,H*.12);vents([side*W*.44,H*.24,D*.05],W*.08,.09,7);}
 box('paint',[0,H*.27,D*.18],[W*.24,H*.30,D*.39],.04);box('metal',[0,H*.45,D*.17],[W*.31,.035,D*.78],.025);pad([0,H*.49,D*.17],[W*.30,.065,D*.76],.028);
 for(const side of [-1,1])bar('metal',[side*W*.14,H*.43,-D*.22],[side*W*.14,H*.43,D*.50],.009);for(let j=0;j<14;j++)box('dark',[-W*.12,H*.515,-D*.10+j*.07],[.012,.002,.002],.0005);return {};
}
if(f==='medStation'){
 box('paint',[0,.09,0],[W*.80,.18,D*.78],.045);box('paint',[0,H*.32,0],[W*.91,H*.57,D*.84],.055);box('metal',[0,H*.62,0],[W,.045,D],.024);
 for(let j=0;j<4;j++){const y=H*(.14+j*.105);box('trim',[-W*.17,y,D*.43],[W*.48,H*.084,.022],.009);bar('metal',[-W*.34,y+.02,D*.456],[0,y+.02,D*.456],.007);}box('paint',[W*.30,H*.35,D*.433],[W*.25,H*.45,.028],.012);bar('metal',[W*.36,H*.34,D*.46],[W*.36,H*.45,D*.46],.007);
 for(const side of [-1,1])bar('metal',[side*W*.28,H*.63,-D*.23],[side*W*.28,H*.80,-D*.23],.017);
 tilt(-.12,[0,H*.85,-D*.20],()=>display([0,H*.85,-D*.20],W*.68,H*.20));
 if(r.details){
  // A recessed sterile tray, supported probe cradle and individually routed leads.
  round('metal',[-W*.27,H*.645,D*.15],[[0,0],[.12,0],[.13,.012],[.13,.026],[.117,.029],[.105,.010],[0,.010]],64);
  for(let j=0;j<3;j++){const x=-W*.27+(j-1)*.045;bar('metal',[x,H*.666,D*.07],[x,H*.666,D*.23],.004);round('metal',[x,H*.666,D*.25],[[.009,0],[.013,0],[.013,.003],[.009,.003],[.009,0]],24);}
  box('paint',[W*.44,H*.70,D*.19],[.055,.14,.10],.015);
  box('trim',[W*.44,H*.775,D*.19],[.070,.016,.10],.008);
  bar('paint',[W*.44,H*.735,D*.19],[W*.45,H*.86,D*.20],.018);
  box('paint',[W*.45,H*.87,D*.20],[.061,.045,.024],.012);
  box('dark',[W*.45,H*.895,D*.20],[.048,.005,.020],.006);
  tube('tube',[[W*.44,H*.735,D*.19],[W*.52,H*.66,D*.19],[W*.53,H*.45,D*.11],[W*.49,H*.40,-D*.03],[W*.39,H*.70,-D*.22]],.004);
  for(let j=0;j<3;j++){const y=H*(.73+j*.065);round('trim',[W*.39,y,-D*.24],[[0,0],[.021,0],[.021,.009],[0,.009]],32,[1,0,0],[0,1,0]);tube('tube',[[W*.39,y,-D*.22],[W*(.45+j*.018),H*.60,-D*.08],[W*(.45+j*.018),H*(.48+j*.025),D*.04]],.003);}
 }

 return {};
}
if(f==='patientMonitor'){
 for(let j=0;j<5;j++){const a=j/5*Math.PI*2,p=[Math.cos(a)*W*.42,.035,Math.sin(a)*D*.42];wheel(p,.028);bar('metal',p,[0,.11,0],.014);}bar('metal',[0,.10,0],[0,H*.71,0],.014);box('paint',[0,H*.80,0],[W*.98,H*.34,.13],.035);display([-.025,H*.82,.075],W*.76,H*.25);
 tube('metal',[[-W*.22,H*.99,0],[-W*.22,H*1.035,0],[W*.22,H*1.035,0],[W*.22,H*.99,0]],.009);
 for(let j=0;j<4;j++){round(j?'accent':'trim',[W*.43,H*(.72+j*.045),.075],[[0,0],[.012,0],[.012,.008],[0,.008]],32,[1,0,0],[0,1,0]);screw([-W*.44,H*(.69+j*.06),.072]);}
 vents([0,H*.65,.074],W*.46,.025,15);box('trim',[0,H*.56,0],[W*.50,.035,D*.42],.012);tube('tube',[[W*.40,H*.73,0],[W*.50,H*.46,.03],[W*.28,H*.37,.12],[W*.16,H*.55,.15]],.004,16);return {};
}
if(f==='surgicalLamp'){
 for(let j=0;j<5;j++){const a=j/5*Math.PI*2,p=[Math.cos(a)*W*.38,.035,Math.sin(a)*D*.38];wheel(p,.028);bar('metal',p,[0,.12,0],.015);}bar('metal',[0,.10,0],[0,H*.70,0],.022);
 const A=[0,H*.70,0],B=[W*.23,H*.91,0],C=[W*.46,H*.88,D*.08];bar('paint',A,B,.035);bar('metal',add(A,[0,0,.035]),add(B,[0,0,.035]),.009);bar('paint',B,C,.030);
 for(const p of [A,B,C])round('trim',p,[[0,-.04],[.055,-.04],[.055,.04],[0,.04]],48,[1,0,0],[0,1,0]);
 const y=C[1]-.085,rad=W*.30;bar('metal',C,[C[0],y,C[2]],.018);round('paint',[C[0],y,C[2]],[[0,-.035],[rad*.90,-.035],[rad,-.015],[rad,.035],[rad*.88,.055],[0,.055]],96);
 for(let j=0;j<7;j++){const a=j/7*Math.PI*2,p=[C[0]+Math.cos(a)*rad*.60,y-.038,C[2]+Math.sin(a)*rad*.60];round('metal',p,[[0,0],[rad*.22,0],[rad*.22,.007],[0,.007]],40);round('light',add(p,[0,-.002,0]),[[0,0],[rad*.17,0],[rad*.17,.003],[0,.003]],40);}
 bar('metal',[C[0],y-.03,C[2]],[C[0],y-.20,C[2]],.011);round('trim',[C[0],y-.24,C[2]],[[0,0],[.025,0],[.025,.09],[0,.09]],40);tube('metal',[[C[0]-rad*.85,y,C[2]],[C[0]-rad*1.08,y-.04,C[2]],[C[0]-rad*1.08,y-.10,C[2]],[C[0]-rad*.85,y-.10,C[2]]],.008);return {};
}
if(f==='tv'||f==='computer'||f==='wallPanel'){
 if(f==='tv'){
  // Rustic: the set sits in a timber surround on splayed wooden legs.
  const rustic=r.style==='rustic',sw=rustic?Math.max(W*.7,W-.13):W*.97,sh=Math.min(H*.74,sw*9/16),y=H-sh/2-(rustic?.065:.015);box('trim',[0,y,0],[sw+.025,sh+.025,.045],.018);screen([0,y,.026],[1,0,0],[0,1,0],sw,sh);
  if(rustic){for(const s of [-1,1]){box('frame',[s*(sw/2+.034),y,-.006],[.062,sh+.13,.07],.008);box('frame',[0,y+s*(sh/2+.034),-.006],[sw+.006,.062,.07],.008);bar('frame',[s*W*.33,y-sh/2-.05,-.006],[s*W*.42,.016,D*.36],.017);bar('frame',[s*W*.33,y-sh/2-.05,-.006],[s*W*.42,.016,-D*.36],.017);}}
  else for(const x of [-1,1])tube('metal',[[x*W*.30,y-sh/2+.02,-.005],[x*W*.39,.025,D*.30],[x*W*.45,.018,D*.40]],.012);vents([0,y+sh*.35,-.026],W*.55,.012,21);box('keys',[0,y-sh/2-.008,.028],[.04,.008,.006],.003);return {};
 }
 if(f==='computer'){
  const mx=-W*.18,my=H*.65,mw=W*.59,mh=H*.57;box('trim',[mx,.025,D*.0],[W*.43,.035,D*.40],.025);bar('metal',[mx,.04,-D*.08],[mx,my-mh*.24,-D*.08],.022);display([mx,my,0],mw,mh);vents([mx,my+mh*.40,-.058],mw*.65,.012,17);
  box('paint',[W*.38,H*.43,-D*.06],[W*.25,H*.85,D*.65],.025);for(let j=0;j<2;j++){round('trim',[W*.38,H*(.28+j*.33),D*.273],[[0,0],[W*.085,0],[W*.085,.012],[0,.012]],64,[1,0,0],[0,1,0]);for(let k=0;k<12;k++){const a=k/12*Math.PI*2;bar('metal',[W*.38+Math.cos(a)*W*.04,H*(.28+j*.33)+Math.sin(a)*W*.04,D*.273+.014],[W*.38+Math.cos(a+.35)*W*.075,H*(.28+j*.33)+Math.sin(a+.35)*W*.075,D*.273+.014],.0025);}}
  for(let j=0;j<4;j++)box('dark',[W*.29+j*.022,H*.75,D*.275],[.012,.006,.004],.001);box('accent',[W*.42,H*.76,D*.277],[.005,.005,.004],.001);
  // Rustic: a timber-cased monitor and wooden cheeks on the tower.
  if(r.style==='rustic'){for(const s of [-1,1]){box('frame',[mx+s*(mw/2+.034),my,-.02],[.03,mh+.10,.075],.006);box('frame',[mx,my+s*(mh/2+.034),-.02],[mw+.04,.03,.075],.006);box('frame',[W*.38+s*(W*.125+.005),H*.43,-D*.06],[.012,H*.87,D*.67],.004);}}
  box('trim',[-W*.16,.025,D*.30],[W*.62,.032,D*.24],.015);
  // The same keycap assembly as a console: fitted modifiers, a space bar, legends and the Key rows setting.
  if(r.details)c.keycaps(CM.frame([-W*.16,.041,D*.30],[1,0,0],[0,0,-1]),W*.59,D*.21,.012);
  else{for(let row=0;row<4;row++)for(let k=0;k<13;k++)box('keys',[-W*.43+k*W*.044,.046,D*(.22+row*.047)],[W*.038,.012,D*.039],.003);box('keys',[-W*.17,.045,D*.42],[W*.22,.012,D*.034],.004);}
  box('trim',[W*.25,.025,D*.37],[.075,.045,.11],.025);return {};
 }
 // Recessed service panel with independently seated controls, vents, fasteners and conduit glands.
 box('trim',[0,H*.5,0],[W,H,D*.70],.04);box('paint',[0,H*.51,D*.36],[W*.92,H*.91,D*.08],.025);display([0,H*.72,D*.42],W*.78,H*.34);
 for(let j=0;j<3;j++){box('trim',[-W*.18,H*(.17+j*.12),D*.415],[W*.50,H*.085,.02],.008);for(let k=0;k<7;k++)box(k?'keys':r.style==='scifi'?'light':'accent',[-W*.38+k*W*.065,H*(.17+j*.12),D*.43],[W*.038,.012,.008],.003);}
 for(let j=0;j<5;j++)round(j%2?'accent':'metal',[W*.38,H*(.19+j*.075),D*.44],[[0,0],[.013,0],[.013,.012],[0,.012]],32,[1,0,0],[0,1,0]);for(const x of [-1,1])for(const y of [.07,.94])screw([x*W*.43,H*y,D*.42]);
 // Sci-fi is the panel as drawn. Modern trades the vents for slim metal rails and a kick plate; rustic is boxed in timber with iron corners.
 if(r.style==='modern'){for(const s of [-1,1])box('metal',[0,H*(.5+s*.468),D*.405],[W*.92,H*.012,.012],.003);box('metal',[0,H*.055,D*.41],[W*.70,H*.045,.01],.003);}
 else vents([0,H*.055,D*.42],W*.60,H*.025,23);
 if(r.style==='rustic')for(const s of [-1,1]){box('frame',[s*W*.46,H*.5,D*.40],[W*.08,H,D*.09],.008);box('frame',[0,H*(.5+s*.47),D*.40],[W*.84,H*.06,D*.09],.008);for(const t of [-1,1]){box('metal',[s*W*.46,H*(.5+t*.47),D*.448],[W*.085,H*.065,.004],.001);screw([s*W*.46,H*(.5+t*.47),D*.45]);}}
 return {};
}
if(f==='holoTable'){
 box('paint',[0,H*.27,0],[W*.72,H*.52,D*.72],.08);box('trim',[0,H*.55,0],[W,.10,D],.045);
 round('dark',[0,H*.615,0],[[0,0],[W*.34,0],[W*.34,.018],[0,.018]],96);for(const R of [.27,.32])round('light',[0,H*.64,0],[[W*R,0],[W*R+.004,0],[W*R+.004,.003],[W*R,.003],[W*R,0]],128);
 // A suspended wireframe terrain/urban planning display, projected from four emitters.
 if(r.hologram){const grid=new CM.Geo(),N=18,terrain=(x,z)=>H*.80+.06*H*Math.sin(x*10/W)*Math.cos(z*11/D);for(let j=0;j<=N;j++)for(let k=0;k<N;k++){
  const x=-W*.29+k/N*W*.58,z=-D*.28+j/N*D*.56;tube('hologram',[[x,terrain(x,z),z],[x+W*.58/N,terrain(x+W*.58/N,z),z]],.0015,6);tube('hologram',[[j/N*W*.58-W*.29,terrain(j/N*W*.58-W*.29,k/N*D*.56-D*.28),k/N*D*.56-D*.28],[j/N*W*.58-W*.29,terrain(j/N*W*.58-W*.29,(k+1)/N*D*.56-D*.28),(k+1)/N*D*.56-D*.28]],.0015,6);
 }
 for(const [x,z,h]of [[-.13,-.08,.10],[.07,.02,.16],[.18,-.11,.07]]){const cx=x*W,cz=z*D,low=terrain(cx,cz),hw=W*.04,hd=D*.04;for(const side of [-1,1])for(const sign of [-1,1])tube('hologram',[[cx+side*hw,low,cz+sign*hd],[cx+side*hw,low+h,cz+sign*hd]],.0015,6);for(const y of [low,low+h])tube('hologram',[[cx-hw,y,cz-hd],[cx+hw,y,cz-hd],[cx+hw,y,cz+hd],[cx-hw,y,cz+hd],[cx-hw,y,cz-hd]],.0015,6);}}
 for(const x of [-1,1])for(const z of [-1,1])round('light',[x*W*.40,H*.61,z*D*.40],[[0,0],[.018,0],[.018,.02],[0,.02]],40);display([0,H*.43,D*.365],W*.39,H*.12);return {};
}
if(f==='fabricator'){
 // Open manufacturing cell: rear bulkhead, side columns, roof, raised work platen.
 box('paint',[0,H*.15,0],[W,H*.30,D],.055);box('trim',[0,H*.50,-D*.43],[W*.96,H*.85,D*.10],.025);for(const x of [-1,1])box('paint',[x*W*.44,H*.58,0],[W*.12,H*.72,D*.91],.035);box('paint',[0,H*.96,0],[W,H*.08,D],.035);
 round('metal',[0,H*.33,0],[[0,0],[W*.28,0],[W*.28,.025],[0,.025]],80);box('metal',[0,H*.43,0],[W*.15,H*.16,D*.18],.018);
 const motion={bones:[{name:'Prop',head:[0,0,0],parent:-1}],roles:{},pivots:{},cables:{},rules:[]};
 for(const side of [-1,1]){
  const prefix=side<0?'robotL':'robotR',A=[side*W*.35,H*.63,-D*.27],B=[side*W*.23,H*.71,-D*.07],C=[side*W*.08,H*.49,D*.015];
  for(const [key,p,parent]of [[prefix+'Upper',A,0],[prefix+'Lower',B,motion.bones.length],[prefix+'Tool',C,motion.bones.length+1]]){motion.roles[key]=motion.bones.length;motion.bones.push({name:key,head:p,parent});motion.pivots[key]=p;}
  for(const [role,p,q]of [[prefix+'Upper',A,B],[prefix+'Lower',B,C]]){const d=norm(sub(q,p)),u=norm(CM.vec.cross(d,[0,0,1])),v=CM.vec.cross(u,d),length=Math.hypot(...sub(q,p)),m=CM.chamferBox([0,0,0],[.078,length*.76,.068],.012);CM.transform(m,x=>add(add(add(p,scale(d,length/2+x[1])),scale(u,x[0])),scale(v,x[2])),n=>norm(add(add(scale(u,n[0]),scale(d,n[1])),scale(v,n[2]))));put(role,m);}
  tube(prefix+'Upper',[A,B],.027);tube(prefix+'Lower',[B,C],.022);for(const [key,p]of [[prefix+'Upper',A],[prefix+'Lower',B],[prefix+'Tool',C]])round(key,p,[[0,-.03],[.042,-.03],[.042,.03],[0,.03]],48,[1,0,0],[0,1,0]);tube(prefix+'Tool',[C,add(C,[-side*.035,-.06,.02])],.012);motion.cables[prefix+'Cable']=[motion.roles[prefix+'Upper'],motion.roles[prefix+'Lower'],motion.roles[prefix+'Tool']];tube(prefix+'Cable',[add(A,[0,0,-.035]),add(B,[0,.035,-.035]),add(C,[0,0,-.035])],.008);
 }
 for(let j=0;j<15;j++){const a=j/15*Math.PI*2,R=.025+j%4*.01;bar('sparks',[Math.cos(a)*R,H*.51,Math.sin(a)*R],[Math.cos(a)*R*2.3,H*.55+(j%3)*.018,Math.sin(a)*R*2.3],.0015);}
 motion.roles.sparks=motion.bones.length;motion.bones.push({name:'sparks',head:[0,H*.51,0],parent:0});box('paint',[0,H*.85,D*.46],[W*.84,H*.15,.08],.018);display([0,H*.85,D*.51+.025],W*.72,H*.085);vents([0,H*.13,D*.505],W*.62,H*.055,17);return motion;
}
return {};
}
const api={IDS,build};root.RRFurnitureCraft=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
