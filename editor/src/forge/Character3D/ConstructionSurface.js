/** Small physically scaled, repeatable finish maps. Color stays authored;
 * the relief and packed G-roughness/B-metalness maps describe construction. */
(function(root){
    'use strict';
    const cache=new Map();
    function maps(kind){
        if(cache.has(kind))return cache.get(kind);
        const n=256,normal=new Uint8Array(n*n*4),surface=new Uint8Array(n*n*4),albedo=new Uint8Array(n*n*4);
        const noise=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
        for(let y=0;y<n;y++)for(let x=0;x<n;x++){
            const i=(y*n+x)*4,a=noise(x,y),fiber=Math.sin(x*Math.PI/2),grain=Math.sin(x*Math.PI/16+Math.sin(y*Math.PI/128)*.4);
            const dx=kind==='fabric'?.12*fiber:kind==='wood'?.035*grain:kind==='leather'?.075*(a-.5):kind==='velvet'?.025*(a-.5):kind==='rubber'?.035*(a-.5):.013*(a-.5),dy=kind==='fabric'?.12*Math.sin(y*Math.PI/2):.009*(noise(y,x)-.5),l=Math.hypot(dx,dy,1);
            normal.set([Math.round(128+dx/l*127),Math.round(128+dy/l*127),Math.round(128+127/l),255],i);
            const rough=kind==='metal'?.86+.12*noise(x,Math.floor(y/32)):kind==='fabric'?.93+.06*a:.91+.08*a;
            surface.set([255,Math.round(255*rough),255,255],i);const tone=Math.round(255*(.93+.035*grain+.008*(a-.5)));albedo.set([tone,tone,tone,255],i);
        }
        const out={albedo:{name:'construction-'+kind+'-albedo.png',width:n,height:n,data:albedo,repeat:true},normal:{name:'construction-'+kind+'-normal.png',width:n,height:n,data:normal,repeat:true},surface:{name:'construction-'+kind+'-surface.png',width:n,height:n,data:surface,repeat:true}};cache.set(kind,out);return out;
    }
    function apply(parts,textures,materialOf){
        for(const part of parts){const kind=materialOf(part);if(!kind)continue;const m=maps(kind);
            if(kind==='wood'&&!part.texture){part.texture=m.albedo.name;textures[m.albedo.name]=m.albedo;}
            if(!part.normalTexture){part.normalTexture=m.normal.name;part.normalScale=kind==='fabric'?.5:.35;textures[m.normal.name]=m.normal;}
            part.metallicRoughnessTexture=m.surface.name;textures[m.surface.name]=m.surface;
        }
    }
    const api={maps,apply};root.RRConstructionSurface=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
