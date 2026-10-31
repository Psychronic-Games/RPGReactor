/** Small physically scaled, repeatable finish maps. Color stays authored;
 * the relief and packed G-roughness/B-metalness maps describe construction. */
(function(root){
    'use strict';
    const cache=new Map();
    function maps(kind){
        if(cache.has(kind))return cache.get(kind);
        const n=['wood','leather','rubber'].includes(kind)?512:256,normal=new Uint8Array(n*n*4),surface=new Uint8Array(n*n*4),albedo=new Uint8Array(n*n*4);
        const noise=(x,y)=>{const v=Math.sin(x*127.1+y*311.7)*43758.5453;return v-Math.floor(v);};
        for(let y=0;y<n;y++)for(let x=0;x<n;x++){
            const i=(y*n+x)*4,a=noise(x,y),fiber=Math.sin(x*Math.PI/2),grain=Math.sin(x*Math.PI/16+Math.sin(y*Math.PI/128)*.4);
            const bend=.7*Math.sin(y/n*Math.PI*2)+.18*Math.sin(y/n*Math.PI*6),fine=Math.sin((x/n*94+bend)*Math.PI*2),pore=noise(Math.floor(x/2),Math.floor(y/2));
            const dx=kind==='fabric'?.12*fiber:kind==='wood'?.085*fine+.018*grain:kind==='leather'?.11*(a-.5)+.04*(pore-.5):kind==='velvet'?.025*(a-.5):kind==='rubber'?.07*(a-.5):.013*(a-.5),dy=kind==='fabric'?.12*Math.sin(y*Math.PI/2):kind==='wood'?.014*fine:.009*(noise(y,x)-.5),l=Math.hypot(dx,dy,1);
            normal.set([Math.round(128+dx/l*127),Math.round(128+dy/l*127),Math.round(128+127/l),255],i);
            const rough=kind==='metal'?.86+.12*noise(x,Math.floor(y/32)):kind==='fabric'?.93+.06*a:.91+.08*a;
            surface.set([255,Math.round(255*rough),255,255],i);const tone=Math.round(255*(kind==='wood'?.93+.035*grain+.025*fine+.010*(a-.5):.96+.012*(a-.5)));albedo.set([tone,tone,tone,255],i);
        }
        const out={albedo:{name:'construction-'+kind+'-albedo.png',width:n,height:n,data:albedo,repeat:true},normal:{name:'construction-'+kind+'-normal.png',width:n,height:n,data:normal,repeat:true},surface:{name:'construction-'+kind+'-surface.png',width:n,height:n,data:surface,repeat:true}};cache.set(kind,out);return out;
    }
    /** A finish needs real tangent coordinates; swatch coordinates collapse to a point.
     * Split only at planar chart boundaries, retaining smooth normals and skin weights. */
    function ensureUvs(p){
        const uv=p.uvs1||p.uvs,I=p.index;let valid=0;
        if(uv)for(let t=0;t<I.length;t+=3){const a=I[t]*2,b=I[t+1]*2,c=I[t+2]*2;valid+=Math.abs((uv[b]-uv[a])*(uv[c+1]-uv[a+1])-(uv[c]-uv[a])*(uv[b+1]-uv[a+1]))>1e-12;}
        if(valid>I.length/3*.97)return false;
        const P=p.positions,count=P.length/3,fields=Object.keys(p).filter(k=>k!=='index'&&ArrayBuffer.isView(p[k])&&p[k].length/count>=1&&p[k].length/count<=16&&Number.isInteger(p[k].length/count)),out=Object.fromEntries(fields.map(k=>[k,[]])),coords=[],ids=[],map=new Map();
        for(let t=0;t<I.length;t+=3){const a=I[t]*3,b=I[t+1]*3,c=I[t+2]*3,u=[0,1,2].map(k=>P[b+k]-P[a+k]),v=[0,1,2].map(k=>P[c+k]-P[a+k]),N=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],axis=N.map(Math.abs).indexOf(Math.max(...N.map(Math.abs))),axes=axis===0?[2,1]:axis===1?[0,2]:[0,1];for(let k=0;k<3;k++){const source=I[t+k],key=source+':'+axis;let id=map.get(key);if(id===undefined){id=map.size;map.set(key,id);for(const field of fields){const size=p[field].length/count;for(let j=0;j<size;j++)out[field].push(p[field][source*size+j]);}coords.push(P[source*3+axes[0]]*12,P[source*3+axes[1]]*12);}ids.push(id);}}
        for(const field of fields)p[field]=new p[field].constructor(out[field]);p.index=Uint32Array.from(ids);p.uvs1=Float32Array.from(coords);p.normalTexCoord=1;p.metallicRoughnessTexCoord=1;return true;
    }
    function apply(parts,textures,materialOf){
        for(const part of parts){const kind=materialOf(part);if(!kind)continue;const m=maps(kind);
            if(['wood','fabric','leather','rubber','velvet'].includes(kind)&&!part.texture){if(part.color&&!part.colors){const c=[1,3,5].map(i=>parseInt(part.color.slice(i,i+2),16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);part.colors=Float32Array.from({length:part.positions.length},(_,i)=>c[i%3]);}part.texture=m.albedo.name;textures[m.albedo.name]=m.albedo;}
            if(!part.normalTexture){part.normalTexture=m.normal.name;part.normalScale=kind==='fabric'?.5:.35;textures[m.normal.name]=m.normal;}
            part.metallicRoughnessTexture=m.surface.name;textures[m.surface.name]=m.surface;ensureUvs(part);if(part.uvs1){part.normalTexCoord=1;part.metallicRoughnessTexCoord=1;if(part.texture===m.albedo.name)part.uvs=Float32Array.from(part.uvs1);}
        }
    }
    const api={maps,apply,ensureUvs};root.RRConstructionSurface=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
