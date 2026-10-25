/** Original room furniture, appliances and working-space equipment. Meter
 * dimensions, closed joinery, separate cushions/doors/controls and PBR finishes
 * share the Prop Builder's recipe, history, preview and GLB saving path. */
(function(root){
    'use strict';
    const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null);
    const CM=need('RRContainerMesh','./ContainerMesh.js'),CP=need('RRContainerPaint','./ContainerPaint.js'),Paint=need('RRPropPaint','./PropPaint.js'),Construction=need('RRFurnitureConstruction','./FurnitureConstruction.js'),Surface=need('RRConstructionSurface','../Character3D/ConstructionSurface.js'),Keycaps=need('RRPropKeycaps','./PropKeycaps.js');
    const {add,sub,scale,norm}=CM.vec;
    const FORMS=[
        ['chair','Dining chair','furniture',.50,.94,.55],['armchair','Armchair','furniture',.88,.90,.88],['sofa','Sofa','furniture',2.10,.88,.92],['bench','Bench','furniture',1.35,.48,.45],
        ['table','Dining table','furniture',1.50,.76,.90],['desk','Desk','furniture',1.35,.76,.68],['bed','Bed','furniture',1.55,.92,2.12],['cabinet','Cabinet','furniture',.90,1.05,.45],['bookshelf','Bookshelf','furniture',.92,1.85,.34],
        ['fridge','Refrigerator','appliances',.76,1.85,.72],['microwave','Microwave','appliances',.55,.34,.40],['tv','Television','electronics',1.25,.89,.25],['computer','Desktop computer','electronics',1.10,.64,.58],
        ['wallPanel','Sci-fi wall panel','scifi-interiors',1.10,1.70,.14],['console','Computer console','scifi-interiors',1.50,1.24,.85],['serverRack','Server rack','scifi-interiors',.72,1.82,.72]
    ];
    const BY_ID=new Map(FORMS.map(f=>[f[0],f])),STYLES=[['modern','Modern'],['rustic','Rustic'],['scifi','Sci-fi']];
    const clamp=(v,a,b,d)=>Number.isFinite(+v)?Math.max(a,Math.min(b,+v)):d;
    const color=(v,d)=>/^#[0-9a-f]{6}$/i.test(v)?v:d;
    function normalize(r={}){
        const form=BY_ID.has(r.form)?r.form:'chair',f=BY_ID.get(form);
        return{kind:'furniture',form,width:clamp(r.width,.25,4,f[3]),height:clamp(r.height,.20,3,f[4]),depth:clamp(r.depth,.08,2.5,f[5]),style:STYLES.some(s=>s[0]===r.style)?r.style:'modern',
            color:color(r.color,'#567a83'),frame:color(r.frame,'#765034'),trim:color(r.trim,'#272f36'),accent:color(r.accent,'#45bfd4'),details:r.details!==false,screen:r.screen!==false,screenText:CP.cleanText(typeof r.screenText==='string'?r.screenText:'REACTOR / SYSTEM READY',32),
            upholstery:['plain','tufted','channel'].includes(r.upholstery)?r.upholstery:'tufted',padding:clamp(r.padding,.65,1.5,1),roundness:clamp(r.roundness,.4,1.6,1),backHeight:clamp(r.backHeight,.65,1.2,1),armSize:clamp(r.armSize,.65,1.4,1),
            seats:Math.round(clamp(r.seats,1,5,3)),shelves:Math.round(clamp(r.shelves,2,7,4)),drawers:Math.round(clamp(r.drawers,1,5,3)),sections:Math.round(clamp(r.sections,1,4,2)),bookFill:clamp(r.bookFill,0,1,1),
            deckAngle:clamp(r.deckAngle,15,50,35),screens:Math.round(clamp(r.screens,1,3,2)),keyRows:Math.round(clamp(r.keyRows,3,6,4)),hardware:Math.round(clamp(r.hardware,0,6,3)),
            roughness:clamp(r.roughness,.2,.95,.55),frameMaterial:['wood','metal','painted'].includes(r.frameMaterial)?r.frameMaterial:'wood',
            baseStyle:['feet','plinth'].includes(r.baseStyle)?r.baseStyle:'feet',screenStyle:['status','radar','landscape'].includes(r.screenStyle)?r.screenStyle:form==='tv'?'landscape':'status'};
    }
    function fromPreset(id){const f=BY_ID.get(id)||FORMS[0],technical=['appliances','electronics','scifi-interiors'].includes(f[2]);return normalize({form:f[0],color:technical?'#b2bdc3':'#567a83',frame:technical?'#4a5662':'#765034',style:f[2]==='scifi-interiors'?'scifi':'modern'});}
    /** A rounded cushion, keeping planar centers and soft corners rather
     * than inflating an ellipsoid. Normals follow its actual rounded surface. */
    function cushion(center,size,radius,upholstery='plain'){
        const h=size.map(q=>q/2),r=Math.min(radius,...h.map(q=>q*.8)),P=[],N=[],T=[],I=[];
        for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
            const u=(axis+1)%3,v=(axis+2)%3,coords=k=>{const edge=[-h[k],-h[k]+r*.08,-h[k]+r*.3,-h[k]+r*.6,-h[k]+r];const middle=Array.from({length:11},(_,i)=>(h[k]-r)*(i/6-5/6));return edge.concat(middle,edge.map(v=>-v).reverse());},A=coords(u),B=coords(v),base=P.length/3;
            for(const b of B)for(const a of A){const p=[0,0,0];p[axis]=sign*h[axis];p[u]=a;p[v]=b;const q=p.map((x,k)=>Math.max(-h[k]+r,Math.min(h[k]-r,x))),n=norm(sub(p,q));const at=add(q,scale(n,r));
                if(axis===h.indexOf(Math.min(...h))&&sign>0&&Math.abs(p[u])<h[u]-r&&Math.abs(p[v])<h[v]-r){
                    let sink=0,du=0,dv=0;
                    const targets=upholstery==='tufted'?[-.5,0,.5]:upholstery==='channel'?[-.65,-.32,0,.32,.65]:[];
                    for(const tu of targets)for(const tv of upholstery==='tufted'?[-.45,.45]:[0]){
                        const dx=(p[u]/h[u]-tu),dy=upholstery==='channel'?0:p[v]/h[v]-tv,sigma=upholstery==='channel'?.025:.045;
                        const d=h[axis]*.18*Math.exp(-(dx*dx+dy*dy)/sigma);sink+=d;du+=d*(-2*dx/sigma)/h[u];dv+=d*(-2*dy/sigma)/h[v];
                    }
                    at[axis]-=sink;n[u]=du;n[v]=dv;n[axis]=1;
                }
                P.push(...add(center,at));N.push(...norm(n));T.push(a/size[u]+.5,b/size[v]+.5);}
            for(let j=0;j+1<B.length;j++)for(let i=0;i+1<A.length;i++){const a=base+j*A.length+i,b=a+1,c=a+A.length,d=c+1;if(sign>0)I.push(a,b,c,b,d,c);else I.push(a,c,b,b,c,d);}
        }
        return{positions:Float32Array.from(P),normals:Float32Array.from(N),uvs:Float32Array.from(T),index:Uint32Array.from(I)};
    }
    function screenPicture(mode,on,text){
        const width=1024,height=576,data=new Uint8Array(width*height*4),L=CP.layout(text);
        const textScale=Math.min(5,(width-112)/Math.max(1,L.width+1)),textX=56,textY=42;
        for(let py=0;py<height;py++)for(let px=0;px<width;px++){
            const x=px/2,y=py/2;
            let c=[7,17,27];
            if(on&&mode==='landscape'){
                const mountain=288*(.60+.09*Math.sin(x*.022)+.04*Math.sin(x*.051));
                c=y<mountain?[35+y*.20,62+y*.22,100+y*.24]:[25,48,59];if(Math.hypot(x-360,y-86)<34)c=[232,169,94];
                if(y>288*.81)c=[26,55+(y%3)*2,72];
            }else if(on&&mode==='radar'){
                const dx=x-256,dy=(y-144)*1.25,d=Math.hypot(dx,dy),a=Math.atan2(dy,dx);
                if(d<123){c=[7,28,28];if(Math.abs(d%30-15)<1||Math.abs(dx)<1||Math.abs(dy)<1)c=[30,83,77];if(a>.2&&a<.23)c=[78,195,152];}
                if([[204,109],[290,178],[335,112]].some(([a,b])=>Math.hypot(x-a,y-b)<3))c=[180,223,140];
            }else if(on){
                const line=x===18||x===512-19||y===18||y===288-19;
                if(line||y>48&&y<51)c=[40,134,157];
                // Header is composited below on every screen design.
                if(x>34&&x<210&&y>76&&y<234){const yy=(y-76)%28;if(yy<12&&x<70+Math.floor((y-76)/28)*22)c=[37,125,149];}
                if(x>252&&x<466&&y>81&&y<228){if(y%24<2||x%36<2)c=[18,54,71];if(Math.abs(y-(154+35*Math.sin(x*.04)))<2)c=[91,202,188];}
            }
            if(on&&text&&py<86){c=[7,17,27];const coverage=CP.coverage(L,(px-textX)/textScale,(py-textY)/textScale,.90,false,0,1/textScale);c=c.map((v,k)=>v+([170,234,242][k]-v)*coverage);}
            const i=(py*width+px)*4;data.set([...c.map(v=>Math.round(v)),255],i);
        }return{name:'furniture-screen.png',width,height,data};
    }
    function build(input,cache={},options={}){
        const r=normalize(input),W=r.width,H=r.height,D=r.depth,groups=new Map(),textures={};
        const put=(kind,m)=>{if(!groups.has(kind))groups.set(kind,[]);groups.get(kind).push(m);return m;};
        const box=(kind,p,s,b=.008)=>put(kind,Math.min(...s)>.025?CM.roundedBox(p,s,b*r.roundness):CM.chamferBox(p,s,b*r.roundness));
        const pad=(p,s,b=.04)=>{
            const mesh=put('fabric',cushion(p,s,b*r.roundness,(s.indexOf(Math.min(...s))===1&&p[1]>H*.3||s.indexOf(Math.min(...s))===2&&p[1]>H*.5)?r.upholstery:'plain'));
            if(r.details){const axis=s.indexOf(Math.min(...s)),u=(axis+1)%3,v=(axis+2)%3,rad=Math.min(b*r.roundness,...s.map(q=>q*.4)),path=[];
                for(let i=0;i<=64;i++){const a=i/64*Math.PI*2,q=p.slice(),x=Math.cos(a),y=Math.sin(a);q[axis]+=s[axis]*.36;q[u]+=Math.sign(x)*Math.abs(x)**.20*(s[u]/2-rad*.35);q[v]+=Math.sign(y)*Math.abs(y)**.20*(s[v]/2-rad*.35);path.push(q);}put('seam',CM.sweep(path,.0013,8,false));
            }return mesh;
        };
        const bar=(kind,a,b,rad=.014)=>put(kind,CM.sweep([a,b],rad,20,true));
        const frame=(kind,o,u,v,w,h,border,depth=.018)=>{
            const F=CM.frame(o,u,v),bezel=CM.bezel(F,w,h,depth,border,.005);put(kind,bezel.housing);put('dark',bezel.floor);return F;
        };
        const screen=(o,u,v,w,h)=>{
            const F=frame('trim',o,u,v,w,h,.014,.018),m=CM.plate(F,0,0,w-.03,h-.03,.015);put('screen',m);
        };
        const bolt=(p,n=[0,0,1])=>{if(r.details){const F=CM.frame(p,n[0]?[0,0,-n[0]]:[n[2],0,0],[0,1,0]);put('metal',CM.revolveOn(F,0,0,[[0,0],[.005,0],[.005,.002],[.004,.003],[0,.003]],16));put('dark',CM.slab(CM.rect(0,0,.005,.0008),{...F,o:add(F.o,scale(F.n,.0031))},.0004,0,true));}};
        const feet=(y=.07)=>{if(r.baseStyle==='plinth'){box('trim',[0,y/2,0],[W*.82,y,D*.78],.012);return;}for(const sx of [-1,1])for(const sz of [-1,1])box('trim',[sx*W*.40,y/2,sz*D*.38],[Math.min(.055,W*.10),y,Math.min(.055,D*.12)],.004);};
        const legs=(seatY)=>{if(r.style==='scifi')return;for(const sx of [-1,1])for(const sz of [-1,1]){
            const top=[sx*W*.37,seatY,sz*D*.34],bottom=[sx*W*.43,.018,sz*D*.40];if(r.style==='rustic'){const length=top[1]-bottom[1],rad=Math.min(.030,W*.06);put('frame',CM.revolveOn(CM.frame(bottom,[1,0,0],CM.vec.cross(norm(sub(top,bottom)),[1,0,0])),0,0,[[0,0],[rad*.70,0],[rad*.70,length*.09],[rad,length*.12],[rad*.80,length*.18],[rad*.65,length*.70],[rad,length*.77],[rad,length],[0,length]],32));}else bar('metal',bottom,top,Math.min(.023,W*.045));
            box('trim',[bottom[0],.009,bottom[2]],[.038,.018,.038],.004);
        }};
        const vent=(x,y,z,w,h,kind='dark')=>{if(r.details)for(let i=0;i<7;i++)box(kind,[x,y+(i-3)*h/8,z],[w,h/22,.006],.001);};
        if(['chair','bench','table','desk'].includes(r.form)){
            const seatY=r.form==='chair'?H*.47:r.form==='bench'?H-.07:H-.055;legs(seatY);
            box('wood',[0,seatY,0],[W,.045,D],.009);
            for(const sx of [-1,1])box('wood',[sx*W*.35,seatY-.06,0],[.035,.09,D*.72],.004);
            if(r.form==='chair'){
                for(const sx of [-1,1])bar('wood',[sx*W*.38,seatY,-D*.36],[sx*W*.38,H-.035,-D*.47],.021);
                box('wood',[0,H-.045,-D*.44],[W*.88,.075,.045],.012);
                if(r.style==='rustic')for(let j=-1;j<=1;j++)bar('wood',[j*W*.20,seatY+.04,-D*.38],[j*W*.20,H-.08,-D*.44],.014);
                else{pad([0,H*.74,-D*.40],[W*.76,H*.29,.065],.028);pad([0,seatY+.007+.03*r.padding,0],[W*.89,.06*r.padding,D*.88],.023);}
            }
            if(r.form==='bench')pad([0,seatY+.005+.035*r.padding,0],[W*.95,.07*r.padding,D*.89],.025);
            if(r.form==='desk'){
                box('wood',[W*.31,(H*.09+H-.065)/2,-D*.03],[W*.28,H-.065-H*.09,D*.85],.008);
                for(let j=0;j<r.drawers;j++){const step=H*.66/r.drawers,y=H*.14+step*(j+.5);box('wood',[W*.31,y,D*.405],[W*.255,step-.008,.022],.006);bar('metal',[W*.26,y,D*.431],[W*.36,y,D*.431],.006);}
            }
        }
        if(['sofa','armchair'].includes(r.form)){
            feet(H*.115+.008);const arm=Math.min(.18*r.armSize,W*.22),n=r.form==='sofa'?r.seats:1,inside=W-arm*2;
            pad([0,H*.25,0],[W-.025,H*.27,D-.03],.06);
            for(const s of [-1,1])pad([s*(W-arm)/2,H*.47,0],[arm,H*.56,D*.96],.055);
            pad([0,H*(.32+.32*r.backHeight),-D*.37],[W-arm*.7,H*.64*r.backHeight,D*.23],.055);
            for(let j=0;j<n;j++){
                const x=(j-(n-1)/2)*inside/n,cw=inside/n-.012;
                pad([x,H*.43,D*.055],[cw,H*.16*r.padding,D*.72],.045);
                pad([x,H*(.5+.23*r.backHeight),-D*.255],[cw,H*.47*r.backHeight,D*.19*r.padding],.045);
                if(r.details){const y=H*(.43+.08*r.padding)+.002,z=D*.055,ww=cw*.47,dd=D*.32,path=[];for(let k=0;k<=48;k++){const a=k/48*Math.PI*2,xx=Math.cos(a),zz=Math.sin(a);path.push([x+Math.sign(xx)*Math.abs(xx)**.23*ww,y,z+Math.sign(zz)*Math.abs(zz)**.23*dd]);}put('seam',CM.sweep(path,.0015,5,true));}
            }
        }
        if(r.form==='bed'){
            feet(H*.15+.008);box('wood',[0,H*.26,0],[W,H*.22,D],.015);box('wood',[0,H*.60,-D*.47],[W+.04,H*.8*r.backHeight,.07],.015);
            pad([0,H*(.32+.11*r.padding),0],[W*.97,H*.22*r.padding,D*.94],.065);pad([0,H*(.34+.22*r.padding),D*.11],[W*.99,H*.09,D*.72],.035);
            for(const s of [-1,1])pad([s*W*.24,H*(.39+.22*r.padding),-D*.30],[W*.43,H*.15,D*.22],.06);
            if(r.details)for(let j=0;j<8;j++)bar('seam',[-W*.46,H*(.387+.22*r.padding),D*(.01+j*.043)],[W*.46,H*(.387+.22*r.padding),D*(.01+j*.043)],.0013);
        }
        if(['cabinet','bookshelf'].includes(r.form)){
            feet(.06);for(const s of [-1,1])box('wood',[s*(W/2-.018),H/2+.03,0],[.036,H-.06,D],.005);
            box('wood',[0,H/2,-D/2+.012],[W-.04,H-.10,.025],.003);
            for(const y of [.08,H-.025])box('wood',[0,y,0],[W,.04,D],.006);
            if(r.form==='cabinet')for(let j=0;j<r.sections;j++){const w=W*.96/r.sections,x=(j-(r.sections-1)/2)*W*.96/r.sections;box('paint',[x,H*.51,D/2+.005],[w-.006,H*.85,.025],.006);bar('metal',[x+w*.32,H*.45,D/2+.034],[x+w*.32,H*.61,D/2+.034],.006);}
            else for(let j=0;j<r.shelves;j++){
                const y=H*(.10+j*.85/r.shelves);box('wood',[0,y,0],[W-.05,.028,D-.012],.003);
                if(r.details)for(let k=0;k<Math.round(7*r.bookFill);k++){const x=-W*.39+k*W*.12,bh=H/r.shelves*(.50+.12*Math.sin(k*2+j)**2);box(k%3===0?'accent':k%3===1?'frame':'fabric',[x,y+bh/2+.015,-D*.03],[W*.09,bh,D*.62],.002);}
            }
        }
        if(r.form==='fridge'){
            feet(.045);box('paint',[0,H/2,0],[W,H-.025,D],.018);
            for(const [low,high]of [[.055,.69],[.70,.985]]){
                const y=H*(low+high)/2,h=H*(high-low);box('dark',[0,y,D/2+.003],[W*.96,h,.015],.004);box('paint',[0,y,D/2+.023],[W*.94,h-.012,.04],.014);
                bar('metal',[W*.34,y-h*.24,D/2+.066],[W*.34,y+h*.24,D/2+.066],.009);
            }vent(0,H*.10,-D/2-.003,W*.75,H*.12);
            if(r.details)box('trim',[W*.25,H*.83,D/2+.045],[W*.22,.018,.003],.002);
        }
        if(r.form==='microwave'){
            feet(.02);box('paint',[0,H/2,0],[W,H-.02,D],.011);
            frame('trim',[-W*.08,H*.51,D/2+.006],[1,0,0],[0,1,0],W*.76,H*.79,.018,.018);
            box('glass',[-W*.08,H*.51,D/2+.025],[W*.65,H*.64,.004],.004);
            bar('metal',[W*.24,H*.27,D/2+.044],[W*.24,H*.76,D/2+.044],.006);
            screen([W*.405,H*.70,D/2+.006],[1,0,0],[0,1,0],W*.15,H*.24);
            for(let j=0;j<3;j++)for(let k=0;k<2;k++)box('trim',[W*(.365+k*.065),H*(.27+j*.105),D/2+.014],[W*.043,H*.055,.009],.002);
            vent(0,H*.59,-D/2-.002,W*.70,H*.45);
        }
        if(r.form==='tv'){
            const sy=H*.62,sh=H*.69;box('trim',[0,sy,-.025],[W,sh,.065],.014);screen([0,sy,.013],[1,0,0],[0,1,0],W*.97,sh*.94);
            for(const s of [-1,1]){bar('metal',[s*W*.30,.018,D*.30],[s*W*.25,H*.28,0],.014);bar('metal',[s*W*.30,.018,D*.30],[s*W*.19,.018,-D*.30],.012);}vent(0,sy,-.061,W*.76,sh*.22);
        }
        if(r.form==='computer'){
            const x=-W*.17,cy=H*.66,mw=W*.63,mh=H*.61;
            box('trim',[x,cy,-D*.13],[mw,mh,.045],.012);screen([x,cy,-D*.13+.025],[1,0,0],[0,1,0],mw*.96,mh*.94);
            box('trim',[x,(.029+cy-mh/2+.04)/2,-D*.16],[.055,cy-mh/2+.04-.029,.05],.008);box('trim',[x,.018,-D*.13],[mw*.45,.036,D*.37],.01);
            box('paint',[W*.35,H*.45,-D*.10],[W*.24,H*.88,D*.68],.013);vent(W*.35,H*.42,D*.245,W*.17,H*.42);
            box('accent',[W*.35,H*.75,D*.251],[.012,.012,.004],.003);
            box('trim',[-W*.16,.018,D*.32],[W*.59,.036,D*.27],.008);
            if(r.details)textures['furniture-key-legends.png']=Keycaps.build(CM.frame([-W*.16,.034,D*.32],[1,0,0],[0,0,-1]),W*.57,D*.24,r.keyRows,put,.012);
            put('trim',cushion([W*.20,.0275,D*.35],[.058,.055,.095],.025));
        }
        if(r.form==='console'){
            const angle=r.deckAngle*Math.PI/180,reach=Math.min(D*.65,H*.65),origin=[0,H*.62,D*.09],v=[0,Math.sin(angle),-Math.cos(angle)],normal=[0,Math.cos(angle),Math.sin(angle)],
                rear=origin[2]-reach*.5*Math.cos(angle),top=origin[1]+reach*.5*Math.sin(angle),front=D*.34,frontY=origin[1]-(front-origin[2])*Math.tan(angle)-.003;
            // The cabinet's top is the underside of this very deck. Feet use
            // the cabinet footprint, and terminate inside its lower sill.
            const side=CM.frame([W*.44,0,0],[0,0,1],[0,1,0]);
            put('paint',CM.slab([-D*.42,H*.06,front,H*.06,front,Math.max(H*.12,frontY),rear,top-.003,-D*.42,top-.003],side,W*.88,.012,true));
            box('trim',[0,H*.065,-D*.04],[W*.90,H*.045,D*.80],.012);
            if(r.baseStyle==='plinth')box('trim',[0,H*.035,-D*.04],[W*.82,H*.07,D*.72],.01);
            else for(const sx of [-1,1])for(const z of [-D*.31,D*.24])box('trim',[sx*W*.34,H*.04,z],[Math.min(.075,W*.10),H*.08,Math.min(.075,D*.15)],.005);
            const F=frame('trim',origin,[1,0,0],v,W,reach,.022,.03);
            put('dark',CM.slab(CM.rect(0,0,W-.045,reach-.045),F,.032,.004,true));
            if(r.details)textures['furniture-key-legends.png']=Keycaps.build({...F,o:add(F.o,scale(normal,.031))},W*.74,reach*.48,r.keyRows,put,.009);
            if(r.details)for(let j=0;j<r.hardware;j++)put('accent',CM.revolveOn({...F,o:add(F.o,scale(normal,.032))},(j-(r.hardware-1)/2)*W*.10,reach*.37,[[.012,0],[.012,.009],[.010,.012],[0,.012]],12));
            const sw=W*.92/r.screens,sh=Math.min(H*.27,sw*.62),sy=Math.max(H*.92,top+sh*.58);
            for(let j=0;j<r.screens;j++){
                const x=(j-(r.screens-1)/2)*sw;
                box('trim',[x,(top+sy)/2,-D*.30],[Math.min(.055,sw*.2),sy-top+.025,.05],.006);
                box('trim',[x,sy,-D*.30],[sw*.96,sh,.055],.014);
                screen([x,sy,-D*.30+.031],[1,0,0],[0,1,0],sw*.90,sh*.91);
            }
            vent(0,H*.30,front+.015,W*.65,H*.16);
            if(r.details){box('trim',[0,H*.27,front+.007],[W*.82,H*.35,.009],.008);for(const x of [-W*.37,W*.37])bolt([x,H*.40,front+.015]);}
        }
        if(r.form==='wallPanel'){
            box('trim',[0,H/2,0],[W,H,D],.025);box('paint',[0,H/2,D*.51],[W*.91,H*.94,.018],.018);
            screen([-W*.12,H*.66,D*.60],[1,0,0],[0,1,0],W*.56,H*.43);
            for(let j=0;j<4;j++){box('trim',[W*.32,H*(.50+j*.10),D*.61],[W*.12,.025,.012],.004);box('accent',[W*.32,H*(.50+j*.10),D*.68],[W*.08,.008,.003],.002);}
            vent(-W*.03,H*.24,D*.61,W*.68,H*.16);
            for(const s of [-1,1])for(const y of [H*.05,H*.95])bolt([s*W*.43,y,D*.64]);
        }
        if(r.form==='serverRack'){
            feet(.05);box('trim',[0,H/2,0],[W,H-.02,D],.016);
            for(let j=0;j<7;j++){const y=H*(.13+j*.12);box('paint',[0,y,D/2+.004],[W*.86,H*.10,.035],.007);vent(-W*.08,y,D/2+.025,W*.51,H*.075);for(let k=0;k<3;k++)box(k===0?'accent':'keys',[W*.32,y+(k-1)*.012,D/2+.025],[.008,.006,.004],.001);}
            for(const s of [-1,1])bar('metal',[s*W*.45,H*.12,D/2+.055],[s*W*.45,H*.88,D/2+.055],.009);
        }
        if(['sofa','armchair'].includes(r.form)&&r.style==='rustic'){
            box('wood',[0,H*.24,D*.45],[W*.92,H*.07,.035],.008);
            for(const sign of [-1,1])box('wood',[sign*W*.45,H*.24,0],[.035,H*.07,D*.88],.008);
        }
        if(['sofa','armchair','bed'].includes(r.form)&&r.style==='scifi')box('accent',[0,H*.22,D*.49],[W*.80,.012,.006],.003);
        const construction=Construction.assemble({recipe:r,r,W,H,D,box,bar,pad,put,bolt});
        const key=JSON.stringify([r.color,r.frame,r.trim,r.accent]);
        if(cache.surfaceKey!==key){
            const weave=CP.atlas(128,128),wood=CP.atlas(256,256),timber=CP.rgb(r.frame);
            // Periodic grain and weave tile without atlas gutters. Restrained
            // contrast keeps fine fibers from reading as painted plank stripes.
            CP.fill(wood,{x:0,y:0,w:256,h:256},(s,t,out)=>{
                const bend=.012*Math.sin(t*Math.PI*2)+.006*Math.sin(t*Math.PI*4),grain=Math.sin((s+bend)*Math.PI*36),fiber=Math.sin((s+bend*.4)*Math.PI*192);
                const value=.91+.035*grain+.012*fiber+.012*Math.sin(t*Math.PI*2+s*Math.PI*4);
                for(let k=0;k<3;k++)out[k]=timber[k]*value;
            });
            const base=CP.rgb(r.color);CP.fill(weave,{x:0,y:0,w:128,h:128},(s,t,out)=>{const v=.96+.018*Math.sin(s*Math.PI*64)*Math.cos(t*Math.PI*64);for(let k=0;k<3;k++)out[k]=base[k]*v;});
            const normal=new Uint8Array(128*128*4);for(let y=0;y<128;y++)for(let x=0;x<128;x++){const n=norm([.12*Math.sin(x*Math.PI/2),.12*Math.sin(y*Math.PI/2),1]);normal.set(n.map(v=>Math.round(128+v*127)).concat(255),(y*128+x)*4);}
            cache.surfaces={'furniture-wood.png':{...wood,name:'furniture-wood.png',repeat:true},'furniture-fabric.png':{...weave,name:'furniture-fabric.png',repeat:true},'furniture-fabric-normal.png':{width:128,height:128,data:normal,name:'furniture-fabric-normal.png',repeat:true}};cache.surfaceKey=key;
        }
        if(groups.has('screen')){
            const screenKey=JSON.stringify([r.screenStyle,r.screen,r.screenText]);
            if(cache.screenKey!==screenKey){cache.screenPicture=screenPicture(r.screenStyle,r.screen,r.screenText);cache.screenKey=screenKey;}
            cache.surfaces['furniture-screen.png']=cache.screenPicture;
        }
        const parts=[],materials={legends:{texture:'furniture-key-legends.png',cutout:true,alphaCutoff:.5,roughness:.82},wood:{texture:'furniture-wood.png',roughness:.67},fabric:{kind:'cloth',texture:'furniture-fabric.png',normalTexture:'furniture-fabric-normal.png',normalScale:.25,roughness:.94},seam:{color:r.color,roughness:.96},metal:{color:'#8d969e',roughness:.32,metalness:.75},trim:{color:r.trim,roughness:.52,metalness:.18},dark:{color:'#090f15',roughness:.78},paint:{color:r.color,roughness:.40,metalness:.23},frame:{texture:'furniture-wood.png',roughness:r.roughness},glass:{color:'#102129',roughness:.16,metalness:.18},keys:{color:'#343e46',roughness:.72},screen:{texture:'furniture-screen.png',emissive:'#ffffff',emissiveTexture:'furniture-screen.png',emissiveIntensity:r.screen?.45:0,roughness:.35},accent:{color:r.accent,roughness:.48,emissive:r.style==='scifi'?r.accent:null,emissiveIntensity:.25}};
        if(r.frameMaterial!=='wood')materials.frame=materials.wood={color:r.frame,roughness:r.roughness,metalness:r.frameMaterial==='metal'?.7:.12};
        materials.wood.roughness=r.roughness;materials.fabric.roughness=.75+r.roughness*.25;materials.paint.roughness=r.roughness;materials.paint.metalness=r.style==='scifi'?.45:r.style==='rustic'?0:.23;materials.trim.roughness=Math.min(.95,r.roughness+.10);
        for(const [kind,meshes]of groups){
            const m=CM.merge(meshes),material=materials[kind],density=kind==='fabric'?7:['wood','frame'].includes(kind)?1.8:1;
            if(['wood','frame','fabric'].includes(kind))CM.mapUv(m,(_,__,v)=>{const n=Array.from(m.normals.subarray(v*3,v*3+3),Math.abs),axis=n.indexOf(Math.max(...n)),A=axis===0?[2,1]:axis===1?[0,2]:[0,1];return A.map(k=>m.positions[v*3+k]*density);});
            CM.skin(m,0);parts.push({...m,...material,name:BY_ID.get(r.form)[1]+' '+kind,metalness:material.metalness??0});
            for(const name of [material.texture,material.normalTexture,material.emissiveTexture])if(name&&cache.surfaces[name])textures[name]=cache.surfaces[name];
        }
        Surface.apply(parts,textures,p=>p.name.endsWith(' fabric')?'fabric':p.name.endsWith(' wood')||p.name.endsWith(' frame')?(r.frameMaterial==='wood'?'wood':'metal'):/ (paint|metal|trim)$/.test(p.name)?'metal':null);
        let low=Infinity,high=-Infinity;for(const p of parts)for(let i=1;i<p.positions.length;i+=3){low=Math.min(low,p.positions[i]);high=Math.max(high,p.positions[i]);}for(const p of parts)for(let i=1;i<p.positions.length;i+=3)p.positions[i]-=low;
        return{kind:'furniture',recipe:r,construction,parts,textures,bones:[{name:'Prop',head:[0,0,0],parent:-1}],clips:[],height:high-low,cloth:null};
    }
    function random(seed,recipe,scope='all'){
        const r=normalize(recipe),rand=Paint.random(seed),all=scope==='all';if(all||scope==='shape')for(const k of ['width','height','depth'])r[k]*=.85+rand()*.3;
        if(all||scope==='colors'){r.color=['#567a83','#a0886a','#536449','#9b5947','#b6bdc4'][Math.floor(rand()*5)];r.frame=['#765034','#49362b','#a48658'][Math.floor(rand()*3)];}
        if(all||scope==='details'){r.details=rand()>.2;r.style=STYLES[Math.floor(rand()*STYLES.length)][0];r.seats=1+Math.floor(rand()*5);r.screens=1+Math.floor(rand()*3);r.shelves=2+Math.floor(rand()*6);r.drawers=1+Math.floor(rand()*5);r.hardware=Math.floor(rand()*7);r.deckAngle=20+rand()*25;r.padding=.8+rand()*.5;r.frameMaterial=['wood','metal','painted'][Math.floor(rand()*3)];r.baseStyle=rand()>.6?'plinth':'feet';r.screenStyle=['status','radar','landscape'][Math.floor(rand()*3)];}return normalize(r);
    }
    const api={FORMS,STYLES,normalize,fromPreset,build,random};root.RRFurnitureProp=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
    const Model=need('RRPropModel','./PropModel.js'),Catalog=need('RRPropCatalog','./PropCatalog.js');
    Model.register({id:'furniture',label:'Furniture',normalize,build,random,randomScopes:[['all','Everything'],['shape','Shape'],['colors','Colors'],['details','Details']]});
    for(const [id,label,order]of [['furniture','Furniture',50],['appliances','Appliances',51],['electronics','Electronics',52],['scifi-interiors','Sci-fi interiors',53]])Catalog.category({id,label,order});
    const icons={chair:'chair',armchair:'sofa',sofa:'sofa',bench:'table',table:'table',desk:'table',bed:'bed',cabinet:'cabinet',bookshelf:'cabinet',fridge:'appliance',microwave:'appliance',tv:'screen',computer:'screen',wallPanel:'console',console:'console',serverRack:'server'};
    for(const f of FORMS)Catalog.add({id:'furniture-'+f[0],label:f[1],kind:'furniture',category:f[2],icon:icons[f[0]],keywords:f[0]+' furniture room interior '+(f[0]==='sofa'?'couch lounge':f[0]==='fridge'?'fridge kitchen':f[0]==='tv'?'TV screen display':f[0]==='console'?'scifi terminal control panel':''),start:()=>fromPreset(f[0]),matches:r=>r.form===f[0]});
    Catalog.ui('furniture',{placeholder:'Furniture',tabs:[['shape','Shape'],['look','Look'],['details','Details']],panel(tab){
        if(tab==='shape')return this._section('Dimensions')+['width','height','depth'].map(k=>this._slider({path:k,label:k[0].toUpperCase()+k.slice(1),range:k==='height'?[.2,3]:k==='width'?[.25,4]:[.08,2.5],step:.01,format:'m'})).join('');
        if(tab==='look')return this._select('style','Style',STYLES)+this._select('frameMaterial','Frame material',[['wood','Wood'],['metal','Metal'],['painted','Painted']])+this._color('color','Color')+this._color('frame','Frame')+this._color('trim','Trim')+this._color('accent','Accent')+this._slider({path:'roughness',label:'Roughness',range:[.2,.95]})+this._slider({path:'roundness',label:'Edge rounding',range:[.4,1.6]});
        const f=this.recipe.form,slider=(path,label,range,step=.01)=>this._slider({path,label,range,step});
        let out=this._check('details','Details');
        if(['sofa','armchair','bed','bench','chair'].includes(f)&&!(f==='chair'&&this.recipe.style==='rustic'))out+=slider('padding','Cushion thickness',[.65,1.5])+this._select('upholstery','Upholstery',[['plain','Plain'],['tufted','Tufted'],['channel','Channel stitched']]);
        if(['sofa','armchair','bed'].includes(f))out+=slider('backHeight','Back height',[.65,1.2]);
        if(f==='sofa')out+=slider('seats','Seat cushions',[1,5],1);
        if(['sofa','armchair'].includes(f))out+=slider('armSize','Arm width',[.65,1.4]);
        if(f==='bookshelf')out+=slider('shelves','Shelves',[2,7],1)+(this.recipe.details?slider('bookFill','Book fill',[0,1]):'');
        if(f==='cabinet')out+=slider('sections','Doors',[1,4],1);
        if(f==='desk')out+=slider('drawers','Drawers',[1,5],1);
        if(['sofa','armchair','bed','cabinet','bookshelf','fridge','console','serverRack'].includes(f))out+=this._select('baseStyle','Base',[['feet','Feet'],['plinth','Plinth']]);
        if(f==='console')out+=slider('deckAngle','Keyboard angle',[15,50],1)+slider('screens','Screens',[1,3],1)+(this.recipe.details?slider('hardware','Control knobs',[0,6],1):'');
        if(this.recipe.details&&['computer','console'].includes(f))out+=slider('keyRows','Keyboard rows',[3,6],1);
        if(['tv','computer','console','wallPanel','microwave'].includes(f))out+=this._check('screen','Screen')+(this.recipe.screen?this._select('screenStyle','Screen design',[['status','Status display'],['radar','Radar'],['landscape','Landscape']])+`<label class="rr-c3d-row"><span class="rr-c3d-label">${this._t('Screen text')}</span><input type="text" class="rr-input rr-prop-text" data-path="screenText" maxlength="32" value="${this.recipe.screenText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}" spellcheck="false"></label>`:'');
        return out;
    },reset:r=>fromPreset(r.form),moves:()=>false});
})(typeof window!=='undefined'?window:globalThis);
