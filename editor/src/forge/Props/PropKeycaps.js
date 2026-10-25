/** Unit-based keyboard assemblies: fitted caps, real modifier widths and
 * alpha-cut engraved legends share one small atlas, including saved GLBs. */
(function(root){
    'use strict';
    const need=(name,file)=>root[name]||(typeof require==='function'?require(file):null),CM=need('RRContainerMesh','./ContainerMesh.js'),CP=need('RRContainerPaint','./ContainerPaint.js');
    const row=(prefix,letters,suffix)=>[...prefix,...letters.split('').map(key=>[key,1]),...suffix];
    const ALPHA=[row([['TAB',1.5]],'QWERTYUIOP',[['BACK',1.5]]),row([['CAPS',1.75]],'ASDFGHJKL',[['ENTER',2.25]]),row([['SHIFT',2.2]],'ZXCVBNM',[['SHIFT',3.8]])],BOTTOM=[['CTRL',1.5],['ALT',1.5],['SPACE',6],['ALT',1.5],['FN',1.5],['<',1],['>',1]],DIGITS=row([],'1234567890',[['-',1],['=',1],['BACK',2]]),FUNCTION=Array.from({length:12},(_,i)=>['F'+(i+1),1]);
    let atlas=null,tiles=null;
    function layout(count){return(count===3?ALPHA:count===4?[...ALPHA,BOTTOM]:count===5?[DIGITS,...ALPHA,BOTTOM]:[FUNCTION,DIGITS,...ALPHA,BOTTOM]);}
    function picture(){
        if(atlas)return atlas;tiles=new Map();const labels=[...new Set([FUNCTION,DIGITS,...ALPHA,BOTTOM].flat().map(k=>k[0]))],width=512,height=256,data=new Uint8Array(width*height*4);
        labels.forEach((label,i)=>{const x=i%8*64,y=Math.floor(i/8)*32,L=CP.layout(label),scale=Math.min(3,56/Math.max(1,L.width)),left=(64-L.width*scale)/2,top=(32-7*scale)/2;tiles.set(label,{x:x+left-1,y:y+top-1,w:L.width*scale+2,h:6*scale+2,aspect:Math.max(.7,L.width/6)});
            for(let yy=0;yy<32;yy++)for(let xx=0;xx<64;xx++){const alpha=CP.coverage(L,(xx-left)/scale,(yy-top)/scale,.95,false,0,1/scale);data.set([203,209,212,Math.round(alpha*255)],((y+yy)*width+x+xx)*4);}});
        atlas={name:'furniture-key-legends.png',width,height,data};return atlas;
    }
    function build(F,width,depth,count,put,capHeight=.009){
        const image=picture(),rows=layout(count),pitch=depth/rows.length;
        rows.forEach((row,j)=>{const total=row.reduce((n,k)=>n+k[1],0),unit=width/total,y=(rows.length-1-j-(rows.length-1)/2)*pitch;let cursor=-width/2;
            for(const [label,units]of row){const w=unit*units,x=cursor+w/2,gap=Math.min(.008,w*.12),cw=w-gap,ch=pitch*.80;cursor+=w;
                put('keys',CM.slab(CM.rect(x,y,cw,ch),F,capHeight,Math.min(.002,capHeight*.20),true));
                const tile=tiles.get(label),h=ch*.67,ww=Math.min(cw*.82,h*tile.aspect),L={...F,o:CM.vec.add(F.o,CM.vec.scale(F.n,capHeight+.0002))},legend=CM.slab(CM.rect(x,y,ww,h),L,.0001,0,true);
                CM.mapUv(legend,(_,__,i)=>{const d=CM.vec.sub(Array.from(legend.positions.subarray(i*3,i*3+3)),L.o),u=(CM.vec.dot(d,L.u)-x)/ww+.5,v=.5-(CM.vec.dot(d,L.v)-y)/h;return[(tile.x+u*tile.w)/image.width,(tile.y+v*tile.h)/image.height];});put('legends',legend);
            }
        });return image;
    }
    const api={layout,picture,build};root.RRPropKeycaps=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
