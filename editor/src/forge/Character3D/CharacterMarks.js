/** Independent, editable garment prints; shared by cloth atlases and wearable accessories. */
(function(root){
    'use strict';
    const Paint=root.RRPropPaint||(typeof require==='function'?require('../Props/PropPaint.js'):null);
    const SHAPES=[['none','None'],['star','Star'],['shield','Shield'],['sun','Sun'],['crescent','Crescent'],['eagle','Eagle'],['cross','Cross'],['crown','Crown'],['sword','Sword'],['laurel','Laurel'],['gear','Gear'],['picture','Picture']];
    const PLACES=[['leftChest','Left chest'],['rightChest','Right chest'],['front','Front'],['back','Back']];
    const clamp=(x,a,b,d)=>Number.isFinite(+x)?Math.max(a,Math.min(b,+x)):d;
    function normalize(value={},place='leftChest'){
        const v=value&&typeof value==='object'?value:{};
        const picture=typeof v.picture==='string'&&v.picture.length<=512&&!/^(?:[a-z][a-z0-9+.-]*:|[\\/])|(?:^|[\\/])\.\.(?:[\\/]|$)|[\u0000-\u001f]/i.test(v.picture)?v.picture:'';
        return {shape:SHAPES.some(s=>s[0]===v.shape)?v.shape:'none',place:PLACES.some(s=>s[0]===v.place)?v.place:place,
            color:/^#[a-f0-9]{6}$/i.test(v.color)?v.color.toLowerCase():'#e8c76a',picture,recolor:!!v.recolor,
            size:clamp(v.size,.2,2.5,1),x:clamp(v.x,-.5,.5,0),y:clamp(v.y,-.5,.5,0),rotate:clamp(v.rotate,-180,180,0)};
    }
    const linear=v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4);
    function prepare(input,images,place){
        const m=normalize(input,place),angle=m.rotate*Math.PI/180;
        return {...m,cos:Math.cos(angle),sin:Math.sin(angle),rgb:Paint.hex(m.color).map(v=>linear(v/255)),image:images?.get?.(m.picture)||images?.[m.picture]};
    }
    function blend(base,m,x,y){
        if(!m||m.shape==='none')return base;
        const dx=x*m.cos+y*m.sin,dy=-x*m.sin+y*m.cos;
        if(Math.abs(dx)>1||Math.abs(dy)>1)return base;
        let alpha=0,color=m.rgb;
        if(m.shape==='picture'){
            if(!m.image)return base;
            const aspect=m.image.width/m.image.height,u=dx/(aspect<1?aspect:1),v=dy*(aspect>1?aspect:1);
            if(Math.abs(u)>1||Math.abs(v)>1)return base;
            const rgba=Paint.sampleImage(m.image,(u+1)/2,(v+1)/2,[0,0,0,0]);alpha=rgba[3]/255;
            if(!m.recolor)color=rgba.slice(0,3).map(v=>linear(v/255));
        }else alpha=Paint.EMBLEMS[m.shape]?.(dx,dy)?1:0;
        return alpha?base.map((v,k)=>v*(1-alpha)+color[k]*alpha):base;
    }
    function garment(base,m,p){
        if(!m||m.shape==='none'||p.fam!==0)return base;
        const back=m.place==='back',R=p.rest;if((back?-R[2]:R[2])<.025)return base;
        const small=m.place==='leftChest'||m.place==='rightChest',cx=m.place==='leftChest'?.085:m.place==='rightChest'?-.085:0;
        const half=(small?.038:.13)*m.size;
        return blend(base,m,((back?-R[0]:R[0])-cx-m.x*.3)/half,(1.255-R[1]-m.y*.4)/half);
    }
    function cloth(base,m,u,v,aspect=1){return blend(base,m,(u-.5-m.x)/(.25*m.size),(v-.43-m.y)*aspect/(.25*m.size));}
    const textures=new Map(),imageIds=new WeakMap();let serial=0;
    function texture(key,width,height,sample){
        if(textures.has(key))return textures.get(key);
        const data=new Uint8Array(width*height*4),toByte=v=>Math.round(255*(v<=.0031308?v*12.92:1.055*Math.pow(v,1/2.4)-.055));
        for(let y=0;y<height;y++)for(let x=0;x<width;x++){
            const sum=[0,0,0];for(const [dx,dy]of [[.25,.25],[.75,.25],[.25,.75],[.75,.75]]){const c=sample((x+dx)/width,(y+dy)/height);for(let k=0;k<3;k++)sum[k]+=c[k]*.25;}
            const at=(y*width+x)*4;for(let k=0;k<3;k++)data[at+k]=toByte(Math.max(0,Math.min(1,sum[k])));data[at+3]=255;
        }
        const out={name:key.split('|')[0]+'.png',width,height,data};textures.set(key,out);while(textures.size>12)textures.delete(textures.keys().next().value);return out;
    }
    function imageKey(image){if(!image)return '';if(!imageIds.has(image))imageIds.set(image,++serial);return imageIds.get(image)+':'+(image.version||0);}
    function supports(g,item){return !!g&&!g.modeled&&!g.transfer&&['top','over','dress','under','armor','mail'].includes(g.slot)&&g.pieces(item).some(p=>p.surface==='tights');}
    const icons=new Map();
    function icon(shape){
        if(icons.has(shape))return icons.get(shape);
        let body='';const test=Paint.EMBLEMS[shape],n=40;
        if(test)for(let y=0;y<n;y++){let run=-1;for(let x=0;x<=n;x++){const on=x<n&&test((x+.5)/n*2-1,(y+.5)/n*2-1);if(on&&run<0)run=x;if(!on&&run>=0){body+=`M${run} ${y}h${x-run}v1h-${x-run}z`;run=-1;}}}
        const out=`<svg class="rr-symbol-icon" viewBox="0 0 40 40" width="24" height="24" aria-hidden="true" focusable="false">${test?`<path fill="currentColor" d="${body}"/>`:shape==='picture'?'<rect x="4" y="5" width="32" height="30" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="13" cy="14" r="3" fill="currentColor"/><path d="M7 31l9-12 6 7 6-9 6 14z" fill="currentColor"/>':'<circle cx="20" cy="20" r="14" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 30l20-20" stroke="currentColor" stroke-width="2"/>'}</svg>`;
        icons.set(shape,out);return out;
    }
    function symbolChoices(choices){return choices.length>2&&choices.every(c=>Array.isArray(c)&&(c[0]==='none'||c[0]==='picture'||!!Paint.EMBLEMS[c[0]]));}
    function panel(builder,path,mark,{garment=false}={}){
        const m=normalize(mark),b=builder;let html=b._section('Emblem')+b._select(path+'.shape','Symbol',SHAPES);
        if(m.shape==='none')return html;
        if(garment)html+=b._select(path+'.place','Placement',PLACES);
        if(m.shape==='picture')html+=`<button class="rr-btn-chip" data-act="mark-picture" data-path="${path}">${b._t('Emblem picture')}: ${root.rrEscapeHtml(m.picture||b._t('Choose…'))}</button>`+b._check(path+'.recolor','Recolor');
        if(m.shape!=='picture'||m.recolor)html+=b._color(path+'.color','Color');
        return html+b._slider({path:path+'.size',label:'Size',range:[.2,2.5],natural:[.2,2.5],extreme:[.2,2.5],step:.01})+
            b._slider({path:path+'.x',label:'Horizontal position',range:[-.5,.5],natural:[-.5,.5],extreme:[-.5,.5],step:.01})+b._slider({path:path+'.y',label:'Vertical position',range:[-.5,.5],natural:[-.5,.5],extreme:[-.5,.5],step:.01})+
            b._slider({path:path+'.rotate',label:'Rotation',range:[-180,180],natural:[-180,180],extreme:[-180,180],step:1,format:'deg'});
    }
    const api={SHAPES,PLACES,normalize,prepare,blend,garment,cloth,texture,imageKey,supports,panel,icon,symbolChoices};root.RRCharacterMarks=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
