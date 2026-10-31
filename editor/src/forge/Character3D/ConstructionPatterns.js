/** Deterministic construction rules shared by procedural equipment and props.
 * A pattern matches recipe traits, consumes named controls and builds against
 * semantic anchors supplied by its owner. Geometry stays in the owner's units. */
(function(root){
    'use strict';
    const matches=(traits,recipe)=>Object.entries(traits||{}).every(([key,value])=>Array.isArray(value)?value.includes(recipe[key]):recipe[key]===value);
    function bank(definitions){
        const ids=new Set();
        for(const rule of definitions){if(!rule.id||ids.has(rule.id)||typeof rule.build!=='function')throw Error('Invalid construction pattern: '+rule.id);ids.add(rule.id);}
        const rules=definitions.map(rule=>Object.freeze({...rule,controls:Object.freeze([...(rule.controls||[])])}));
        return Object.freeze({rules:Object.freeze(rules),
            plan(recipe){return rules.filter(rule=>matches(rule.when,recipe)&&(!rule.test||rule.test(recipe)));},
            assemble(context){
                const trace=[];
                for(const rule of this.plan(context.recipe)){rule.build(context);trace.push(rule.id);}
                return trace;
            }
        });
    }
    function anchor(anchors,name,offset=[0,0,0]){
        const at=anchors[name];if(!at||at.length!==3||!at.every(Number.isFinite))throw Error('Missing construction anchor: '+name);
        return at.map((value,k)=>value+offset[k]);
    }
    /** Sides around a round part of radius `r` (meters): the polygon stays within 0.2 mm of the true circle (under a pixel at the builders' closest zoom); even, 8 to 64. */
    function roundSides(r){const n=Math.PI*Math.sqrt(Math.max(0,r)/.0004);return Math.min(64,Math.max(8,2*Math.ceil(n/2)));}
    /** Remove redundant strap stations, bounding center/edge error and skinned spans. */
    function simplifySurfacePath(path,width,thickness){
        if(path.length<4)return path;
        const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((s,v,k)=>s+v*b[k],0),length=a=>Math.hypot(...a),mix=(a,b,t)=>a.map((v,k)=>v+(b[k]-v)*t);
        const tolerance=Math.min(width*.006,thickness*.1),span=width*.8,keep=new Set([0,path.length-1]);
        const reduce=(a,b)=>{
            if(b-a<2)return;
            const A=path[a],B=path[b],delta=sub(B.p,A.p),length2=dot(delta,delta);let worst=0,pick=-1;
            for(let j=a+1;j<b;j++){
                const q=path[j],t=length2?Math.max(0,Math.min(1,dot(sub(q.p,A.p),delta)/length2)):0,normal=mix(A.n,B.n,t),norm=length(normal)||1;
                const deviation=Math.max(length(sub(q.p,mix(A.p,B.p,t))),length(sub(q.n,normal.map(v=>v/norm)))*(width/2+thickness));
                if(deviation>worst){worst=deviation;pick=j;}
            }
            if(worst<=tolerance){if(Math.sqrt(length2)<=span)return;pick=(a+b)>>1;}
            keep.add(pick);reduce(a,pick);reduce(pick,b);
        };
        reduce(0,path.length-1);return [...keep].sort((a,b)=>a-b).map(i=>path[i]);
    }
    const api={bank,matches,anchor,roundSides,simplifySurfacePath};root.RRConstructionPatterns=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
