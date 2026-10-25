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
    const api={bank,matches,anchor,roundSides};root.RRConstructionPatterns=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
