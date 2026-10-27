/** Bodywork, running gear and service assemblies fitted to vehicle anchors. */
(function(root){
    'use strict';
    const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null),Patterns=need('RRConstructionPatterns','../Character3D/ConstructionPatterns.js'),CM=need('RRContainerMesh','./ContainerMesh.js');
    const {add,sub,scale,norm,cross}=CM.vec;
    const rules=[
        {id:'road-body-shut-lines',when:{form:['compact','sport','truck','rover']},controls:['details','accent'],build(c){
            c.bodywork.roadDetails(c);
        }},
        {id:'motorcycle-engine-and-suspension',when:{form:'motorcycle'},controls:['details','accent'],build(c){
            const {r,W,H,L,R,seat,engine,box,tube,put}=c;
            for(const s of [-1,1]){
                const F=CM.frame([s*W*.21,engine[1],engine[2]],[0,0,-s],[0,1,0]);
                put('metal',CM.revolveOn(F,0,0,[[0,0],[H*.10,0],[H*.105,.013],[H*.088,.026],[0,.026]],48));
                put('accent',CM.revolveOn({...F,o:add(F.o,scale(F.n,.026))},0,0,[[0,0],[H*.025,0],[H*.025,.002],[0,.002]],24));
                if(!r.details)continue;
                for(let j=0;j<6;j++){const a=j/6*Math.PI*2;c.bolt(add(F.o,add(scale(F.u,Math.cos(a)*H*.075),add(scale(F.v,Math.sin(a)*H*.075),scale(F.n,.027)))),F.u,F.v);}
                const lower=[s*W*.17,R,-L*.33],upper=[s*W*.17,seat-H*.02,-L*.17],d=sub(upper,lower),unit=norm(d),u=norm(cross(unit,[1,0,0])),v=cross(unit,u),pts=[];
                tube('metal',[lower,upper],H*.014);for(let j=0;j<=100;j++){const t=j/100,a=t*Math.PI*16;pts.push(add(add(lower,scale(d,.10+t*.72)),add(scale(u,Math.cos(a)*H*.031),scale(v,Math.sin(a)*H*.031))));}tube('trim',pts,H*.005);
                for(const p of [lower,upper])put('metal',CM.revolveOn(CM.frame(p,[0,0,-s],[0,1,0]),0,0,[[0,-W*.018],[H*.025,-W*.018],[H*.025,W*.018],[0,W*.018]],24));
                const cable=[[s*W*.39,H*.82,L*.19],[s*W*.25,H*.70,L*.20],[s*W*.19,H*.43,L*.27],[s*W*.16,R,L*.35]];tube('dark',cable,W*.005);
            }
        }},
        {id:'flight-pressure-hull-and-equipment',when:{form:['hover','shuttle']},controls:['details'],build(c){
            c.bodywork.flight(c);
        }},
        {id:'drone-motor-collars',when:{form:'drone'},controls:['details'],build(c){
            const {r,W,H,L,box,put}=c;if(!r.details)return;
            for(const center of c.motors){
                const F=CM.frame(center,[1,0,0],[0,0,-1]);
                put('metal',CM.revolveOn(F,0,0,[[0,-H*.05],[H*.045,-H*.05],[H*.045,H*.025],[0,H*.025]],32));
                for(const s of [-1,1])box('accent',[center[0]+s*H*.025,center[1]+H*.027,center[2]],[H*.008,.003,H*.008],.001);
            }
        }},
        {id:'walker-hydraulics-and-guards',when:{form:'walker'},controls:['details','stance'],build(c){
            const {r,W,H,L,box,tube,put}=c;if(!r.details||(r.bodyStyle||'rounded')!=='rounded')return;
            const spread=W*.22*r.stance,hip=H*.43,knee=H*.25,ankle=H*.09;
            for(const s of [-1,1]){
                const points=[[s*spread,hip,-L*.13],[s*spread*1.08,knee,-L*.02],[s*spread,ankle,-L*.15]];
                for(let k=0;k<2;k++){const a=points[k],b=points[k+1],d=sub(b,a),end=add(a,scale(d,.62));tube('trim',[a,end],H*.022);tube('metal',[end,b],H*.012);for(const t of [.10,.60]){const at=add(a,scale(d,t)),F=CM.frame(at,[1,0,0],cross(norm(d),[1,0,0]));put('metal',CM.revolveOn(F,0,0,[[H*.023,0],[H*.023,H*.006],[H*.019,H*.006],[H*.019,0],[H*.023,0]],32));}}
                for(const [y,zz]of [[hip,0],[knee,L*.10],[ankle,-L*.05]]){const x=s*(y===knee?spread*1.08:spread),F=CM.frame([x+s*W*.07,y,zz],[0,0,-s],[0,1,0]);put('metal',CM.revolveOn(F,0,0,[[0,0],[H*.034,0],[H*.034,H*.008],[H*.022,H*.014],[0,H*.014]],40));}
                // Foot armor and shin markings are fitted by the castings;
                // do not add the former free-floating bars in front of them.
            }
        }}
    ];
    const api=Patterns.bank(rules);root.RRVehicleConstruction=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
