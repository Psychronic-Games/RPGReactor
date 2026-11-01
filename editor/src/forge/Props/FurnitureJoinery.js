/** Furniture construction upgrades: shaped timber, real book blocks and fitted hardware. */
(function(root){
    'use strict';
    const CM=root.RRContainerMesh||(typeof require==='function'?require('./ContainerMesh.js'):null);
    const {add,norm}=CM.vec,TAU=Math.PI*2;
    const IDS=new Set(['throne','bookshelf','workbench','floorLamp']);
    function build(c){
        const {r,W,H,D,bar,pad,feet}=c,pieces=[],put=(kind,m)=>{pieces.push(m);return c.put(kind,m);},box=(...args)=>{const m=c.box(...args);pieces.push(m);return m;},tube=(kind,path,rad=.008)=>put(kind,CM.sweep(path,rad,16,true));
        const knob=(p,R=.015)=>put('metal',CM.transform(CM.revolve([[0,-R],[R*.80,-R*.65],[R,0],[R*.80,R*.65],[0,R]],32),q=>add(q,p)));
        function rim(p,w,h,role='wood',width=.018){
            const F=CM.frame(p,[1,0,0],[0,1,0]),b=CM.bezel(F,w,h,width*1.2,width,.004);put(role,b.housing);
        }
        if(r.form==='bookshelf'){
            for(const side of [-1,1])box('wood',[side*(W/2-.025),H*.50,0],[.05,H,D],.009);
            box('wood',[0,H*.50,-D*.48],[W-.07,H-.08,.035],.004);
            for(const y of [.025,H-.025])box('wood',[0,y,0],[W,.05,D],.010);
            box('frame',[0,H-.01,0],[W*1.06,.045,D*1.05],.010);
            for(let j=0;j<r.shelves;j++){
                const y=H*(.07+j*.88/r.shelves),span=H*.88/r.shelves;
                box('wood',[0,y,0],[W-.07,.032,D-.008],.004);
                if(!r.details)continue;
                const count=Math.round(9*r.bookFill),pitch=(W-.12)/10;
                for(let k=0;k<count;k++){
                    const x=-W*.40+k*pitch,w=pitch*(.50+.25*((k*7+j*3)%5)/4),h=span*(.57+.29*((k*3+j*7)%7)/6),depth=D*(.55+.12*((k+j)%3)),color=['bookRed','bookBlue','bookGreen','bookTan','bookDark'][(k+j*2)%5];
                    const g=[],addBox=(role,p,size,rad=.002)=>{const m=CM.chamferBox(p,size,rad);g.push(m);put(role,m);};
                    addBox('pages',[x,y+.018+h/2,.012],[w-.006,h-.010,depth-.012]);
                    for(const sx of [-1,1])addBox(color,[x+sx*w/2,y+.018+h/2,.012],[.004,h+.004,depth+.007]);
                    addBox(color,[x,y+.018+h/2,depth/2+.014],[w+.004,h+.004,.010],.004);
                    for(const t of [.14,.82])addBox('bookGold',[x,y+.018+h*t,depth/2+.020],[w*.78,.0025,.002],.0006);
                    for(let line=0;line<3;line++)addBox('bookGold',[x,y+.018+h*.60-line*.008,depth/2+.020],[w*(line===1?.50:.70),.002,.002],.0005);
                    // The paper block has actual recessed fore-edge grooves.
                    for(let q=0;q<5;q++)addBox('bookGroove',[x,y+.030+h*(q+1)/6,-depth/2+.009],[w-.009,.0008,.001],.0002);
                    if(k===count-1&&k>2){const a=-.10,pivot=[x,y+.018,.012],ca=Math.cos(a),sa=Math.sin(a);for(const m of g)CM.transform(m,p=>{const dx=p[0]-pivot[0],dy=p[1]-pivot[1];return[pivot[0]+dx*ca-dy*sa,pivot[1]+dx*sa+dy*ca,p[2]];},n=>[n[0]*ca-n[1]*sa,n[0]*sa+n[1]*ca,n[2]]);}
                }
                for(const side of [-1,1]){box('metal',[side*W*.44,y+.045,0],[.012,.07,D*.48],.003);box('metal',[side*W*.40,y+.020,0],[W*.08,.012,D*.48],.003);}
            }
            // Rustic adds a heavy crown and corner posts over the case; Sci-fi runs light strips up the uprights.
            if(r.style==='rustic'){box('frame',[0,H+.012,0],[W*1.10,.030,D*1.10],.010);for(const side of [-1,1])box('frame',[side*W*.46,H*.50,D*.49],[.05,H-.05,.035],.008);}
            if(r.style==='scifi')for(const side of [-1,1]){box('trim',[side*(W/2-.025),H*.50,D/2+.002],[.022,H*.88,.006],.002);box('light',[side*(W/2-.025),H*.50,D/2+.006],[.008,H*.84,.004],.001);}
            const base=Math.min(.065,H*.045);for(const m of pieces)CM.transform(m,p=>[p[0],base+p[1]*(H-base)/H,p[2]],n=>norm([n[0],n[1]*H/(H-base),n[2]]));
            if(r.style!=='modern')feet(base);
            else if(r.baseStyle==='plinth')box('frame',[0,base/2,0],[W*1.02,base,D*1.02],.008);
            else for(const x of [-1,1])for(const z of [-1,1])box('frame',[x*W*.40,base/2,z*D*.32],[.07,base,.07],.008);
            return true;
        }
        if(r.form==='throne'){
            const seat=H*.29,backZ=-D*.34,half=W*.40;
            for(const sx of [-1,1])for(const sz of [-1,1]){
                put('wood',CM.revolveOn(CM.frame([sx*W*.34,0,sz*D*.31],[1,0,0],[0,0,-1]),0,0,[[.055,0],[.065,.04],[.037,seat*.20],[.048,seat*.70],[.055,seat],[0,seat]],32));
                for(const y of [.045,seat*.68])put('metal',CM.revolveOn(CM.frame([sx*W*.34,y,sz*D*.31],[1,0,0],[0,0,-1]),0,0,[[.045,0],[.058,0],[.058,.014],[.045,.014],[.045,0]],32));
            }
            box('wood',[0,seat-.055,0],[W*.84,.11,D*.83],.025);pad([0,seat+.02,D*.015],[W*.72,.13,D*.70],.045);
            const outline=[[-half,seat-.04],[-half,H*.83],[-half*.78,H*.91],[-half*.36,H*.94],[0,H], [half*.36,H*.94],[half*.78,H*.91],[half,H*.83],[half,seat-.04]];
            put('wood',CM.slab(outline.flat(),CM.frame([0,0,backZ],[1,0,0],[0,1,0]),.07,.012,true));
            pad([0,H*.60,backZ+.057],[W*.61,H*.49,.065],.06);
            const arched=[[-W*.34,seat+.12,backZ+.08],[-W*.34,H*.79,backZ+.08],[-W*.27,H*.86,backZ+.08],[0,H*.92,backZ+.08],[W*.27,H*.86,backZ+.08],[W*.34,H*.79,backZ+.08],[W*.34,seat+.12,backZ+.08]];
            tube('metal',arched,.012);tube('wood',arched.map(p=>[p[0]*1.08,p[1],p[2]-.015]),.025);
            for(const s of [-1,1]){
                const arm=[[s*W*.39,seat+.20,D*.32],[s*W*.39,seat+.30,D*.23],[s*W*.39,seat+.31,-D*.04],[s*W*.39,seat+.28,backZ]];
                tube('wood',arm,.044);tube('metal',arm.map(p=>add(p,[0,.035,0])),.007);
                for(const z of [-D*.13,D*.25])put('wood',CM.revolveOn(CM.frame([s*W*.39,seat,z],[1,0,0],[0,0,-1]),0,0,[[.028,0],[.04,.035],[.025,.11],[.035,.20],[.03,.28],[0,.28]],24));
                knob([s*W*.27,H*.91,backZ+.035],.018);
            }
            if(r.details){
                for(let row=0;row<4;row++)for(let col=0;col<3;col++)knob([(col-1)*W*.17,H*(.42+row*.10),backZ+.102],.010);
                for(let j=0;j<25;j++){const x=(j-12)/12*W*.30;knob([x,seat-.035,D*.428],.004);}
                // Cast scrolls and a central crest sit against the backboard.
                for(const side of [-1,1])tube('metal',Array.from({length:41},(_,j)=>{const t=j/40,a=t*TAU*1.3,R=.045*(1-t)+.008;return[side*(W*.15+Math.cos(a)*R),H*.91+Math.sin(a)*R,backZ+.055];}),.006);
                put('metal',CM.slab([-.035,-.01,0,.045,.035,-.01,0,-.045],CM.frame([0,H*.93,backZ+.06],[1,0,0],[0,1,0]),.012,.003,true));
            }
            return true;
        }
        if(r.form==='workbench'){
            const top=H-.055;
            for(const x of [-1,1])for(const z of [-1,1])box('wood',[x*W*.41,top/2,z*D*.36],[W*.07,top,D*.11],.008);
            for(let j=0;j<9;j++)box('wood',[(j-4)*W*.108,top,0],[W*.104,.095,D],.009);
            for(const z of [-1,1])box('wood',[0,top-.12,z*D*.40],[W*.88,.19,.055],.007);
            box('wood',[0,H*.17,0],[W*.83,.045,D*.75],.006);
            const vx=W*.25,vz=D*.34,jawY=H+.09;
            box('iron',[vx,H+.012,vz-.05],[.24,.055,.29],.018);
            box('metal',[vx,jawY,vz-.14],[.22,.12,.045],.010);
            box('metal',[vx,jawY,vz+.08],[.22,.12,.055],.010);
            for(const z of [vz-.112,vz+.048])box('iron',[vx,jawY+.005,z],[.19,.075,.008],.002);
            bar('metal',[vx,H+.04,vz-.13],[vx,H+.04,vz+.23],.020);
            if(r.details)tube('iron',Array.from({length:161},(_,j)=>{const t=j/160,a=t*TAU*14;return[vx+Math.cos(a)*.021,H+.04+Math.sin(a)*.021,vz-.12+t*.34];}),.004);
            bar('metal',[vx-.095,H+.04,vz+.23],[vx+.095,H+.04,vz+.23],.009);knob([vx-.10,H+.04,vz+.23],.015);knob([vx+.10,H+.04,vz+.23],.015);
            for(const x of [-.085,.085])for(const z of [-.10,.06])knob([vx+x,H+.042,vz+z],.008);
            if(r.details){for(let j=0;j<7;j++)put('dark',CM.revolveOn(CM.frame([-W*.33+j*W*.095,H+.049,-D*.27],[1,0,0],[0,0,-1]),0,0,[[0,0],[.008,0],[.008,.001],[0,.001]],16));}
            return true;
        }
        if(r.form==='floorLamp'){
            const rad=Math.min(W,D)*.42,shadeLow=H*.72,shadeHigh=H*.96;
            put('frame',CM.revolve([[0,0],[rad*.65,0],[rad,.025],[rad,.045],[rad*.90,.060],[.04,.075],[.018,.12],[.018,shadeLow+.05],[0,shadeLow+.05]],64));
            // Open, double-walled shade; there is no solid cone blocking the bulb.
            put('shade',CM.revolve([[rad,shadeLow],[rad*.53,shadeHigh],[rad*.53-.006,shadeHigh],[rad-.006,shadeLow],[rad,shadeLow]],64));
            for(const [y,R]of [[shadeLow,rad],[shadeHigh,rad*.53]])tube('metal',Array.from({length:65},(_,i)=>[Math.cos(i/64*TAU)*R,y,Math.sin(i/64*TAU)*R]),.004);
            for(let j=0;j<3;j++){const a=j/3*TAU;bar('metal',[0,shadeLow+.07,0],[Math.cos(a)*rad*(1-.47*.07/(shadeHigh-shadeLow)),shadeLow+.07,Math.sin(a)*rad*(1-.47*.07/(shadeHigh-shadeLow))],.004);}
            put('metal',CM.revolve([[.020,shadeLow+.03],[.020,shadeLow+.10],[.014,shadeLow+.11],[0,shadeLow+.11]],32));
            put('bulb',CM.revolve([[0,shadeLow+.08],[.014,shadeLow+.08],[.032,shadeLow+.13],[.035,shadeLow+.16],[.024,shadeLow+.19],[0,shadeLow+.20]],40));
            if(r.details){tube('trim',[[.02,.08,0],[.03,.012,.04],[.08,.010,.17],[rad*.9,.010,rad*.6]],.003);
            box('trim',[rad*.75,.018,rad*.55],[.05,.025,.07],.010);}return true;
        }
        return false;
    }
    function details(c){
        const {r,W,H,D,put,box,bar}=c;if(!r.details)return;
        if(r.form==='cabinet')for(let j=0;j<r.sections;j++){
            const w=W*.96/r.sections,x=(j-(r.sections-1)/2)*W*.96/r.sections,z=D/2+.022;
            const F=CM.frame([x,H*.51,z],[1,0,0],[0,1,0]);put('wood',CM.bezel(F,w-.018,H*.83,.016,.025,.004).housing);
            put('frame',CM.bezel({...F,o:[x,H*.51,z+.006]},w-.080,H*.75,.006,.007,.002).housing);
            for(const y of [H*.22,H*.79]){box('metal',[x-w*.40,y,z+.003],[.016,.055,.015],.003);bar('metal',[x-w*.40,y-.025,z+.014],[x-w*.40,y+.025,z+.014],.004);}
        }
        if(['chair','bench','table','desk'].includes(r.form)){
            const y=r.form==='chair'?H*.38:r.form==='bench'?H*.50:H*.86;
            for(const side of [-1,1]){box(r.frameMaterial==='wood'?'wood':'metal',[side*W*.41,y,0],[.028,.055,D*.70],.006);}
            if(['table','desk','bench'].includes(r.form))for(const side of [-1,1])box('wood',[0,y,side*D*.36],[W*.83,.065,.025],.005);
        }
        if(r.form==='drawers')for(let j=0;j<3;j++){
            const y=H*(.18+j*.30),F=CM.frame([0,y,D*.504],[1,0,0],[0,1,0]);put('frame',CM.bezel(F,W*.92,H*.27,.008,.010,.002).housing);
        }
    }
    const api={IDS,build,details};root.RRFurnitureJoinery=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
