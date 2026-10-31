/** Recognizable dismantled machinery, with mounted components rather than loose primitive stacks. */
(function(root){
    'use strict';
    const CM=root.RRContainerMesh||(typeof require==='function'?require('./ContainerMesh.js'):null);
    const {add,sub,scale,norm}=CM.vec,TAU=Math.PI*2,IDS=new Set(['engine','generator','console']);
    function build(c){
        const {r,put,box,tube,rand}=c;
        function round(role,p,profile,axis='z',name){
            const F=CM.frame(p,axis==='x'?[0,0,-1]:[1,0,0],axis==='y'?[0,0,-1]:[0,1,0]);return put(role,CM.revolveOn(F,0,0,profile,48));
        }
        function ring(role,p,R,t,axis='z'){return round(role,p,[[R-t,-t/2],[R,-t/2],[R,t/2],[R-t,t/2],[R-t,-t/2]],axis);}
        function bolt(p,R=.012){round('metal',p,[[0,0],[R,0],[R,.009],[0,.009]]);}
        function engine(p,s=1){
            const at=q=>add(p,scale(q,s)),solid=(role,at,profile,axis)=>round(role,at,profile.map(([r,z])=>[r*s,z*s]),axis);
            box('rust',at([0,.26,0]),scale([.52,.38,.73],s),.04*s);
            box('metal',at([0,.055,0]),scale([.42,.15,.67],s),.035*s);
            for(const side of [-1,1]){
                const head=box('metal',at([side*.235,.49,0]),scale([.24,.26,.77],s),.035*s);
                const ca=Math.cos(side*.25),sa=Math.sin(side*.25),pivot=at([side*.14,.36,0]);
                CM.transform(head,q=>{const d=sub(q,pivot);return[pivot[0]+d[0]*ca-d[1]*sa,pivot[1]+d[0]*sa+d[1]*ca,q[2]];},n=>[n[0]*ca-n[1]*sa,n[0]*sa+n[1]*ca,n[2]]);
                for(let j=0;j<4;j++){
                    const z=(j-1.5)*.17;
                    tube('rust',[at([side*.27,.44,z]),at([side*.44,.39,z+.025]),at([side*.48,.20,z+.05])],.026*s);
                    tube('wire',[at([side*.23,.66,z]),at([side*.15,.73,z]),at([0,.70,-.30])],.006*s);
                    for(const dz of [-.035,.035])bolt(at([side*.25,.62,z+dz]),.008*s);
                }
                tube('rust',[at([side*.48,.20,-.22]),at([side*.48,.20,.36])],.042*s);
                for(let j=0;j<6;j++)box('dark',at([side*.37,.46,-.30+j*.12]),scale([.006,.11,.012],s),.001);
                tube('metal',[at([side*.22,.05,-.20]),at([side*.38,.03,-.20])],.025*s);
            }
            box('rust',at([0,.63,0]),scale([.25,.11,.52],s),.025*s);
            solid('metal',at([0,.75,0]),[[0,0],[.12,0],[.14,.025],[.14,.06],[0,.065]],'y');
            solid('rust',at([0,.28,-.43]),[[0,-.08],[.22,-.08],[.28,-.04],[.29,.04],[.23,.17],[.11,.20],[0,.20]]);
            ring('metal',at([0,.28,.39]),.19*s,.025*s);solid('metal',at([0,.28,.41]),[[0,0],[.07,0],[.07,.045],[0,.045]]);
            ring('trim',at([0,.28,.405]),.15*s,.015*s);
            const pulley=at([.30,.46,.40]);ring('metal',pulley,.10*s,.018*s);
            // The drive belt tangents meet both pulley rims.
            tube('trim',[at([-.11,.39,.41]),at([.23,.53,.41]),at([.34,.52,.41]),at([.39,.42,.41]),at([.11,.15,.41]),at([-.11,.15,.41]),at([-.18,.27,.41]),at([-.11,.39,.41])],.008*s);
            solid('metal',at([-.34,.28,.27]),[[0,0],[.085,0],[.085,.17],[.06,.19],[0,.19]]);
            tube('wire',[at([-.34,.36,.27]),at([-.42,.53,.21]),at([-.22,.64,-.20])],.007*s);
        }
        if(r.form==='engine'){
            engine([0,.09,0]);
            for(const z of [-.24,.24])box('trim',[0,.035,z],[.92,.07,.10],.012);
            for(const side of [-1,1])box('metal',[side*.34,.10,0],[.08,.13,.25],.015);
        }else if(r.form==='generator'){
            for(const z of [-.40,.40])box('rust',[0,.045,z],[1.14,.09,.10],.012);
            for(const x of [-.53,.53])tube('rust',[[x,.08,-.39],[x,.78,-.39],[x,.89,-.28],[x,.89,.28],[x,.78,.39],[x,.08,.39]],.027);
            for(const z of [-.36,.36])tube('rust',[[-.53,.08,z],[.53,.08,z]],.024);
            engine([-.19,.10,.02],.63);
            const A=[.31,.36,0];round('metal',A,[[0,-.24],[.17,-.24],[.20,-.18],[.20,.18],[.17,.23],[0,.23]],'x');
            for(const dx of [-.19,.18])ring('rust',add(A,[dx,0,0]),.205,.024,'x');
            // Alternator end guard with real radial ribs and copper stator loops.
            for(let j=0;j<12;j++){const a=j/12*TAU;tube('metal',[add(A,[.24,Math.cos(a)*.055,Math.sin(a)*.055]),add(A,[.24,Math.cos(a)*.18,Math.sin(a)*.18])],.008);}
            for(let j=0;j<6;j++){const a=j/6*TAU,p=add(A,[.18,Math.cos(a)*.12,Math.sin(a)*.12]);ring('wire',p,.046,.009,'x');}
            box('rust',[0,.76,-.03],[.75,.20,.55],.055);round('metal',[.22,.87,-.03],[[0,0],[.035,0],[.035,.025],[0,.025]],'y');
            box('trim',[-.13,.52,.38],[.59,.27,.035],.020);
            for(const x of [-.30,-.12,.06]){ring('metal',[x,.53,.404],.038,.008);round('dark',[x,.53,.409],[[0,0],[.027,0],[.027,.004],[0,.004]]);}
            box('plastic',[.10,.59,.412],[.035,.035,.012],.005);
            tube('wire',[[-.31,.43,.41],[-.45,.30,.49],[-.43,.05,.69],[-.12,.014,.79]],.012);
            for(const z of [-.35,.35])for(const x of [-.50,.50])box('trim',[x,.018,z],[.09,.035,.08],.010);
        }else if(r.form==='console'){
            box('rust',[0,.035,0],[.90,.07,.67],.020);
            for(const side of [-1,1])box('rust',[side*.41,.45,-.07],[.065,.82,.48],.018);
            box('rust',[0,.86,-.08],[.88,.07,.47],.018);box('trim',[0,.58,-.23],[.77,.47,.04],.012);
            box('plastic',[0,.58,-.195],[.70,.40,.012],.003);
            for(let row=0;row<4;row++)for(let col=0;col<5;col++){
                const x=(col-2)*.12,y=.43+row*.08;box('dark',[x,y,-.18],[.066,.042,.015],.002);
                for(const side of [-1,1])for(let j=0;j<4;j++)box('metal',[x+side*.037,y+(j-1.5)*.008,-.177],[.012,.002,.006],.0005);
            }
            const shards=[[[ -.35,-.20],[-.35,.20],[-.07,.20],[-.15,-.01]],[[.35,.20],[.05,.20],[.13,.03],[.35,-.09]],[[.35,-.20],[.17,-.20],[.10,-.03],[.35,-.12]]];
            const g=new CM.Geo();for(const shard of shards)g.poly(shard.map(([x,y])=>[x,.58+y,-.15]),null,[0,0,1]);put('glass',g.done());
            box('rust',[0,.35,.20],[.88,.05,.47],.010);
            for(let row=0;row<4;row++)for(let col=0;col<12;col++)if((row*13+col)%11!==0)box('trim',[(col-5.5)*.059,.39,.07+row*.065],[.050,.018,.052],.004);
            for(let j=0;j<6;j++){const x=(j-2.5)*.11;tube(j%2?'wire':'metal',[[x,.58,-.17],[x+.03,.43,.09],[x-.05,.21,.39],[x+.10,.018,.55]],.004+j*.0006);}
            for(const side of [-1,1])for(const y of [.10,.29])for(let j=0;j<7;j++)box('dark',[side*.445,y+j*.012,.01],[.005,.006,.18],.001);
        }else return false;
        for(let j=0;j<Math.round(r.clutter/2);j++){
            const x=(rand()-.5)*1.3,z=.50+rand()*.35;
            if(j%3===0)ring('metal',[x,.018,z],.018,.007,'y');
            else if(j%3===1)box('rust',[x,.015,z],[.07,.025,.03],.003);
            else tube('wire',[[x,.02,z],[x+.06,.025,z+.04],[x+.13,.014,z]],.003);
        }
        return true;
    }
    const api={IDS,build};root.RRSalvageCraft=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
