/** Style is an assembly choice: different joinery, upholstery and housings.
 * Rules use the same dimensions as the base shell, so trim has a real support. */
(function(root){
    'use strict';
    const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null),Patterns=need('RRConstructionPatterns','../Character3D/ConstructionPatterns.js'),CM=need('RRContainerMesh','./ContainerMesh.js');
    const rules=[];
    const rule=(id,when,controls,build,test)=>rules.push({id,when,controls,build,test});
    const edge=(c,kind,o,w,h,depth=.008,border=.012)=>{
        const {box}=c;box(kind,[o[0]-w/2+border/2,o[1],o[2]],[border,h,depth],.003);box(kind,[o[0]+w/2-border/2,o[1],o[2]],[border,h,depth],.003);
        for(const s of [-1,1])box(kind,[o[0],o[1]+s*(h-border)/2,o[2]],[w,border,depth],.003);
    };
    // Sci-fi appliances and electronics are their own builds (FurnitureProp scifiTech), so the
    // modern and rustic housings stay off them.
    const notSciTech=r=>r.style!=='scifi';
    rule('tabletop-edgeband',{form:['chair','bench','table','desk']},['color','frame','details'],c=>{
        const {r,W,H,D,box,bar}=c,y=r.form==='chair'?H*.47:r.form==='bench'?H-.07:H-.055;
        // A thin finish layer and continuous edge band meet the structural top.
        box('paint',[0,y+.025,0],[W-.008,.008,D-.008],.003);
        if(r.details){for(const sx of [-1,1])bar('accent',[sx*W*.485,y+.006,-D*.46],[sx*W*.485,y+.006,D*.46],.0015);
            for(const sx of [-1,1])for(const z of [-D*.32,D*.32])c.bolt([sx*W*.35,y-.065,z],[sx,0,0]);}
    });
    rule('rustic-table-joinery',{form:['chair','bench','table','desk'],style:'rustic'},['style'],c=>{
        const {W,H,D,r,box,bar}=c,y=r.form==='chair'?H*.47:r.form==='bench'?H-.07:H-.055;
        bar('wood',[-W*.38,y*.36,-D*.34],[W*.38,y*.36,-D*.34],.019);
        for(const sx of [-1,1])bar('wood',[sx*W*.38,y*.36,-D*.34],[sx*W*.38,y*.36,D*.34],.019);
        if(r.form==='chair')for(const sx of [-1,1])box('wood',[sx*W*.38,H-.04,-D*.44],[.052,.052,.056],.008);
        if(r.form!=='chair')for(let j=1;j<5;j++)box('dark',[0,y+.029,D*(j/5-.5)],[W*.98,.001,.0015],.0003);
    });
    rule('scifi-table-truss',{form:['chair','bench','table','desk'],style:'scifi'},['style'],c=>{
        const {r,W,H,D,box,bar,put}=c,y=r.form==='chair'?H*.47:r.form==='bench'?H-.07:H-.055;
        if(r.form==='chair'||r.form==='table'){
            // One pedestal: a tapered column on a domed foot ringed with light, a cap plate under the top.
            const F=CM.frame([0,0,0],[1,0,0],[0,0,-1]),foot=Math.min(W,D)*(r.form==='table'?.34:.36),col=Math.min(W,D)*(r.form==='table'?.07:.075);
            put('frame',CM.revolveOn(F,0,0,[[0,0],[foot,0],[foot,.012],[foot*.92,.03],[foot*.55,.05],[col*1.4,.07],[0,.07]],40));
            put('light',CM.revolveOn(F,0,0,[[foot*.93,.004],[foot+.004,.004],[foot+.004,.010],[foot*.93,.010],[foot*.93,.004]],40));
            put('trim',CM.revolveOn(F,0,0,[[0,.06],[col*1.3,.06],[col,.14],[col*.85,y-.09],[col*1.1,y-.06],[0,y-.06]],32));
            put('light',CM.revolveOn(F,0,0,[[col*.88,y*.55],[col*.96,y*.55],[col*.96,y*.62],[col*.88,y*.62],[col*.88,y*.55]],32));
            box('frame',[0,y-.04,0],[W*.6,.03,D*.55],.012);
            return;
        }
        for(const sx of [-1,1]){box('frame',[sx*W*.36,(y+.02)/2,0],[W*.075,y-.02+.008,D*.65],.018);box('trim',[sx*W*.36,.02,0],[W*.18,.04,D*.78],.012);box('accent',[sx*W*.401,y*.46,0],[.005,.014,D*.43],.002);}
        bar('metal',[-W*.36,y*.40,0],[W*.36,y*.40,0],.018);
    });
    rule('upholstery-binding',{form:['chair','bench','armchair','sofa','bed']},['details','accent'],c=>{
        const {r,W,H,D,bar}=c;if(!r.details)return;
        const y=r.form==='chair'?H*.47+.007+.06*r.padding:r.form==='bench'?H-.065+.07*r.padding:r.form==='bed'?H*(.387+.22*r.padding):H*.25;
        const z=r.form==='bed'?D*.465:r.form==='chair'?D*.42:D*.45;
        bar('accent',[-W*.43,y,z],[W*.43,y,z],.0018);
    });
    rule('exposed-upholstery-base',{form:['sofa','armchair']},['frameMaterial','frame','style'],c=>{
        const {r,W,H,D,box}=c;box('frame',[0,H*.16,0],[W*.92,H*.08,D*.91],.012);
        if(r.style==='rustic'){for(const sx of [-1,1]){box('frame',[sx*(W*.49+.006),H*.47,0],[W*.035,H*.58,D*.82],.008);box('frame',[sx*W*.49,H*.755,0],[W*.065,H*.055,D*.86],.012);}}
        if(r.style==='scifi')for(const sx of [-1,1]){box('frame',[sx*W*.505,H*.34,0],[W*.035,H*.30,D*.91],.025);box('accent',[sx*W*.525,H*.26,0],[.004,.012,D*.60],.003);}
    });
    rule('cabinet-panel-joinery',{form:'cabinet'},['color','details','accent','style'],c=>{
        const {r,W,H,D,box}=c;
        for(let j=0;j<r.sections;j++){const w=W*.96/r.sections,x=(j-(r.sections-1)/2)*W*.96/r.sections;
            if(r.style==='rustic'){edge(c,'frame',[x,H*.51,D/2+.023],w-.012,H*.83,.018,Math.min(.034,w*.12));box('paint',[x,H*.51,D/2+.020],[w*.67,H*.66,.008],.004);}
            if(r.style==='scifi'){box('frame',[x,H*.17,D/2+.024],[w*.88,H*.07,.022],.009);box('accent',[x,H*.19,D/2+.037],[w*.62,.008,.004],.002);}
            if(r.details){for(const y of [H*.19,H*.83])box('metal',[x-w*.42,y,D/2+.022],[.015,H*.045,.008],.003);box('accent',[x+w*.32,H*.53,D/2+.041],[.008,.014,.004],.002);}
        }
    });
    rule('shelf-spines',{form:'bookshelf'},['details','style'],c=>{
        const {r,W,H,D,box,bar}=c;
        if(r.details)for(let j=0;j<r.shelves;j++)for(let k=0;k<Math.round(7*r.bookFill);k++){
            const x=-W*.39+k*W*.12,y=H*(.10+j*.85/r.shelves),bh=H/r.shelves*(.50+.12*Math.sin(k*2+j)**2);
            for(const t of [.18,.79])box('accent',[x,y+.015+bh*t,D*.282],[W*.069,.0025,.001],.0002);
        }
        if(r.style==='rustic'){box('frame',[0,H-.014,0],[W*1.04,.035,D*1.05],.009);for(const s of [-1,1])bar('frame',[s*W*.45,.08,D*.47],[s*W*.45,H-.03,D*.47],.013);}
        if(r.style==='scifi')for(const s of [-1,1])box('accent',[s*W*.46,H*.50,D*.50],[.008,H*.85,.005],.002);
    });
    rule('bed-headboard-construction',{form:'bed'},['style','details'],c=>{
        const {r,W,H,D,box}=c;
        if(r.style==='modern')for(let j=0;j<4;j++)box('fabric',[(j-1.5)*W*.235,H*.69,-D*.426],[W*.225,H*.40,.018],.014);
        if(r.style==='rustic'){for(const s of [-1,1])box('frame',[s*W*.49,H*.59,-D*.47],[.065,H*.90,.085],.012);box('frame',[0,H*.98,-D*.47],[W*1.04,.055,.09],.012);}
        if(r.style==='scifi'){box('frame',[0,H*.72,-D*.42],[W*.92,H*.34,.035],.025);box('accent',[0,H*.83,-D*.397],[W*.72,.012,.007],.003);}
    });
    rule('appliance-casing',{form:['fridge','microwave']},['style','frameMaterial','frame','accent','details'],c=>{
        const {r,W,H,D,box,bar}=c;
        // Rear condenser and service panels have a closed backing and seated fins.
        box('frame',[0,H*.5,-D*.505],[W*.78,H*.79,.022],.01);
        if(r.style==='rustic'){for(const sx of [-1,1])box('frame',[sx*W*.493,H*.50,0],[.018,H*.91,D*.96],.014);box('frame',[0,H*.94,D*.51],[W*.90,.028,.012],.008);}
        if(r.style==='scifi'){for(const sx of [-1,1])for(const y of [H*.09,H*.91])box('frame',[sx*W*.44,y,D*.51],[W*.12,H*.12,.035],.014);box('accent',[0,H*.10,D*.533],[W*.62,.012,.005],.002);}
        if(r.details){const rows=r.form==='fridge'?15:7;for(let j=0;j<rows;j++)bar('metal',[-W*.33,H*(.16+j*.66/rows),-D*.522],[W*.33,H*(.16+j*.66/rows),-D*.522],.003);
            box('accent',[W*.30,H*.80,D*.55],[W*.10,.014,.005],.003);for(const s of [-1,1])c.bolt([s*W*.35,H*.12,-D*.524],[0,0,-1]);}
    },notSciTech);
    rule('television-housing',{form:'tv'},['style','color','frameMaterial','frame','accent','details'],c=>{
        const {r,W,H,D,box}=c,sy=H*.62,sh=H*.69;
        if(r.style==='modern')box('frame',[0,sy-sh*.48,-.018],[W*.90,.016,.069],.006);
        box('paint',[0,sy,-.061],[W*.94,sh*.92,.015],.009);
        if(r.style==='rustic'){box('frame',[0,sy,-.055],[W*1.04,sh*1.06,.13],.018);/* Screen is restored above this surround by its forward face. */}
        if(r.style==='scifi')for(const s of [-1,1])box('frame',[s*W*.49,sy,-.017],[W*.045,sh*1.04,.10],.018);
        if(r.details){box('accent',[0,sy-sh*.48,.017],[W*.035,.006,.004],.002);for(let j=0;j<12;j++)box('dark',[(j-5.5)*W*.047,sy,-.073],[W*.022,sh*.25,.003],.001);}
    },notSciTech);
    rule('computer-casework',{form:'computer'},['style','frameMaterial','frame','details'],c=>{
        const {r,W,H,D,box,bar}=c;
        for(const s of [-1,1])box('frame',[W*(.35+s*.121),H*.45,-D*.10],[.008,H*.80,D*.62],.006);
        if(r.style==='rustic')box('frame',[-W*.17,H*.66,-D*.18],[W*.66,H*.64,.05],.014);
        if(r.style==='scifi')for(const s of [-1,1])box('frame',[W*(.35+s*.10),H*.45,D*.25],[.022,H*.78,.026],.008);
        if(r.details){for(const y of [H*.20,H*.53]){const z=D*.24+.0005,F=CM.frame([W*.35,y,z],[1,0,0],[0,1,0]);c.put('dark',CM.revolveOn(F,0,0,[[0,0],[W*.065,0],[W*.065,.003],[0,.003]],32));for(let j=0;j<5;j++){const a=j*Math.PI*2/5;bar('metal',[W*.35,y,z+.004],[W*.35+Math.cos(a)*W*.052,y+Math.sin(a)*W*.052,z+.004],.0018);}}
            for(const x of [W*.31,W*.35])box('dark',[x,H*.66,D*.247],[.018,.007,.006],.001);}
    },notSciTech);
    rule('console-side-cheeks',{form:'console'},['style','frameMaterial','frame'],c=>{
        const {r,W,H,D,put}=c,a=r.deckAngle*Math.PI/180,reach=Math.min(D*.65,H*.65),o=[0,H*.62,D*.09],rear=o[2]-reach*.5*Math.cos(a),top=o[1]+reach*.5*Math.sin(a),front=D*.34,fy=o[1]-(front-o[2])*Math.tan(a)-.003;
        for(const s of [-1,1]){
            const F=CM.frame([s*W*.442,0,0],[0,0,-s],[0,1,0]),poly=[s*D*.35,H*.11,-s*front,H*.11,-s*front,Math.max(H*.15,fy-.025),-s*rear,top-.025,s*D*.35,top-.025];
            put('frame',CM.slab(poly,F,.014,.004,true));
            if(r.style==='scifi')c.box('accent',[s*W*.459,H*.27,0],[.004,.012,D*.46],.002);
        }
        if(r.style==='rustic')c.box('frame',[0,H*.14,D*.35],[W*.90,.035,.018],.006);
    },notSciTech);
    rule('wall-panel-chassis',{form:'wallPanel'},['style','frameMaterial','frame','details'],c=>{
        const {r,W,H,D,box}=c;
        if(r.style==='rustic')edge(c,'frame',[0,H*.5,D*.57],W*.96,H*.98,.025,.035);
        else for(const s of [-1,1])box('frame',[s*W*.46,H*.50,D*.53],[W*.035,H*.88,.022],.009);
        if(r.style==='scifi')for(const s of [-1,1])for(const y of [H*.08,H*.92])box('frame',[s*W*.39,y,D*.62],[W*.12,H*.04,.026],.007);
        if(r.details)for(let j=0;j<6;j++)box('dark',[-W*.12,H*(.34+j*.012),D*.60],[W*.56,.004,.003],.001);
    },notSciTech);
    rule('server-rack-chassis',{form:'serverRack'},['style','frameMaterial','frame','details'],c=>{
        const {r,W,H,D,box}=c;for(const s of [-1,1])box('frame',[s*W*.46,H*.51,D*.49],[.025,H*.93,.028],.006);
        if(r.style==='rustic'){for(const s of [-1,1])box('frame',[s*W*.495,H*.50,0],[.025,H*.97,D*.98],.007);box('frame',[0,H-.01,0],[W*1.04,.025,D*1.03],.005);}
        if(r.style==='scifi')for(const s of [-1,1])box('accent',[s*W*.41,H*.51,D*.525],[.006,H*.84,.004],.001);
        if(r.details)for(let j=0;j<18;j++)for(const s of [-1,1])c.bolt([s*W*.46,H*(.10+j*.046),D*.51]);
    },notSciTech);
    // Each style's signature on every type, beyond its finish: sci-fi light strips, seams and panel
    // lines on its shells; rustic blackened-iron straps, rivets and plank grooves.
    rule('scifi-light-and-seams',{style:'scifi'},['style','accent'],c=>{
        const {r,W,H,D,box}=c,f=r.form,L=(p,q)=>box('light',p,q,.002),G=(p,q)=>box('dark',p,q,.0005);
        const top=f==='chair'?H*.47:f==='bench'?H-.07:H-.055;
        if(['chair','bench','table','desk'].includes(f)){for(const z of [-1,1])L([0,top-.026,z*(D/2-.004)],[W*.86,.007,.004]);for(const x of [-1,1])L([x*(W/2-.004),top-.026,0],[.004,.007,D*.86]);
            if(f==='chair'){L([0,H-.012,-D*.44],[W*.7,.007,.05]);}}
        if(['sofa','armchair'].includes(f)){const arm=Math.min(.18*r.armSize,W*.22);for(const s of [-1,1])L([s*(W-arm)/2,H*.75+.004,D*.47],[arm*.6,.007,.006]);}
        if(f==='bed'){for(const s of [-1,1])L([s*(W/2+.004),H*.26,0],[.004,.01,D*.9]);L([0,H*.26,D/2+.004],[W*.9,.01,.004]);}
        if(f==='cabinet'){for(let j=1;j<r.sections;j++){const x=(j-r.sections/2)*W*.96/r.sections;L([x,H*.51,D/2+.019],[.006,H*.8,.006]);}
            for(const s of [-1,1])for(const y of [H*.3,H*.7])G([s*(W/2+.001),y,0],[.002,.006,D*.9]);L([0,H-.004,D/2-.01],[W*.9,.006,.006]);}
        if(f==='bookshelf')for(let j=0;j<r.shelves;j++){const y=H*(.10+j*.85/r.shelves);L([0,y-.017,D/2-.012],[W-.08,.006,.006]);}
    });
    rule('rustic-iron-and-planks',{style:'rustic'},['style'],c=>{
        const {r,W,H,D,box,bolt}=c,f=r.form,I=(p,q)=>box('iron',p,q,.002),rivet=p=>box('iron',p,[.012,.012,.008],.004);
        const strap=(y,z,w)=>{I([0,y,z],[w,.03,.006]);for(const x of [-w*.45,-w*.15,w*.15,w*.45])rivet([x,y,z+.004]);};
        if(f==='cabinet')for(const y of [H*.25,H*.77])strap(y,D/2+.04,W*.98);
        if(f==='fridge'){for(const y of [H*.2,H*.55,H*.88]){const w=W*.72;I([-W*.48+w/2,y,D/2+.046],[w,.03,.006]);for(const x of [-W*.44,-W*.25,-W*.06,W*.13])rivet([x,y,D/2+.05]);}box('accent',[0,H*.95,D/2+.048],[W*.3,.03,.006],.006);}
        if(f==='serverRack'){for(const y of [H*.06,H*.94])strap(y,D/2+.04,W*.98);}
        if(f==='bookshelf')for(let j=0;j<r.shelves;j++){const y=H*(.10+j*.85/r.shelves);for(const s of [-1,1])I([s*(W/2-.045),y-.03,D/2-.02],[.012,.05,.012]);}
        if(f==='bed'){for(let j=1;j<6;j++)box('dark',[(j/6-.5)*W,H*.60,-D*.47+.036],[.003,H*.7,.002],.0005);}
        if(['table','desk','bench'].includes(f)){const y=f==='bench'?H-.07:H-.055;for(const s of [-1,1])for(const z of [-1,1])I([s*W*.40,y-.04,z*D*.36],[.05,.012,.05]);}
        if(['microwave','tv','computer','wallPanel','console'].includes(f)){const y=f==='microwave'?H*.12:f==='tv'?H*.22:f==='console'?H*.16:f==='computer'?H*.12:H*.12;for(const s of [-1,1])rivet([s*W*.44,y,(f==='tv'?.03:f==='console'?D*.36:f==='computer'?D*.25:f==='wallPanel'?D*.63:D/2+.012)]);}
        void bolt;
    });
    const api=Patterns.bank(rules);root.RRFurnitureConstruction=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
