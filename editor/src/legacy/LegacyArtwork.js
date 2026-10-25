/**
 * LegacyArtwork — offline cleanup of low-contrast, repeated palette dither.
 * No resizing, alpha changes, learned model or runtime filter. The detector
 * requires a repeated two-dimensional pattern; unmatched artwork is copied
 * unchanged. Call restore(image, category), using decoded RGBA pixels.
 */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RRLegacyArtwork=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
    'use strict';
    const VERSION=1;
    const MAX_PIXELS=4194304;
    const CATEGORIES=new Set(['Panorama','Backdrop','Picture','Picture 2']);
    function eligibility(image,category){
        if(!CATEGORIES.has(category))return 'protected-category';
        if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||!image.data||!ArrayBuffer.isView(image.data)||image.data.BYTES_PER_ELEMENT!==1||image.data.length!==image.width*image.height*4)return 'invalid-image';
        if(image.width<256||image.height<128||image.width*image.height<32768)return 'small-artwork';
        if(image.width*image.height>MAX_PIXELS)return 'image-budget';
        return null;
    }
    // Error-diffusion dither need not repeat exactly. Accept a two-colour,
    // low-contrast neighbourhood only when changes oscillate in both axes.
    // Single-pixel lines with a continuous direction are protected.
    function scattered(d,at,w){
        const offsets=[-w-1,-w,-w+1,-1,0,1,w-1,w,w+1];
        const low=[255,255,255],high=[0,0,0];
        let minL=Infinity,maxL=-Infinity;
        const levels=new Float64Array(9);
        for(let k=0;k<9;k++){
            const i=at+offsets[k]*4;if(d[i+3]!==255)return null;
            for(let c=0;c<3;c++){low[c]=Math.min(low[c],d[i+c]);high[c]=Math.max(high[c],d[i+c]);}
            const lum=(d[i]*77+d[i+1]*150+d[i+2]*29)/256;
            levels[k]=lum;minL=Math.min(minL,lum);maxL=Math.max(maxL,lum);
        }
        let range=0;for(let c=0;c<3;c++)range=Math.max(range,high[c]-low[c]);
        if(range<6||range>48||maxL-minL<5)return null;
        const labels=new Uint8Array(9),count=[0,0],sum=[0,0,0,0,0,0],mid=(minL+maxL)/2;
        for(let k=0;k<9;k++){
            const g=levels[k]>mid?1:0,i=at+offsets[k]*4;labels[k]=g;count[g]++;
            for(let c=0;c<3;c++)sum[g*3+c]+=d[i+c];
        }
        if(Math.min(...count)<3)return null;
        let hx=0,hy=0;
        for(let y=0;y<3;y++)for(let x=0;x<3;x++){
            const k=y*3+x;if(x<2&&labels[k]!==labels[k+1])hx++;if(y<2&&labels[k]!==labels[k+3])hy++;
        }
        if(hx<3||hy<3||hx+hy<7)return null;
        for(let k=0;k<9;k++)for(let c=0;c<3;c++)if(Math.abs(d[at+offsets[k]*4+c]-sum[labels[k]*3+c]/count[labels[k]])>8)return null;
        let directions=0;
        for(const [a,b]of [[0,8],[1,7],[2,6],[3,5]]){
            let delta=0;for(let c=0;c<3;c++)delta=Math.max(delta,Math.abs(d[at+offsets[a]*4+c]-d[at+c]),Math.abs(d[at+offsets[b]*4+c]-d[at+c]));
            if(delta<=5)directions++;
        }
        if(directions===1)return null;
        // Require the oscillation to continue beyond this one patch. This
        // protects corners/junctions where several thin strokes meet.
        const wide=new Uint8Array(25);
        for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
            const i=at+(oy*w+ox)*4,k=(oy+2)*5+ox+2;
            const lum=(d[i]*77+d[i+1]*150+d[i+2]*29)/256,g=lum>mid?1:0;
            wide[k]=g;
            for(let c=0;c<3;c++)if(Math.abs(d[i+c]-sum[g*3+c]/count[g])>8)return null;
        }
        let wx=0,wy=0;
        for(let y=0;y<5;y++)for(let x=0;x<5;x++){
            const k=y*5+x;if(x<4&&wide[k]!==wide[k+1])wx++;if(y<4&&wide[k]!==wide[k+5])wy++;
        }
        if(wx<9||wy<9||wx+wy<20)return null;
        const weight=[1,2,1,2,4,2,1,2,1],rgb=[0,0,0];
        for(let c=0;c<3;c++){
            let value=0;for(let k=0;k<9;k++)value+=d[at+offsets[k]*4+c]*weight[k];
            const target=Math.round(value/16);rgb[c]=Math.max(d[at+c]-16,Math.min(d[at+c]+16,target));
        }
        return rgb;
    }
    function restore(image,category){
        const reason=eligibility(image,category);
        const stats={version:VERSION,category,eligible:!reason,reason,detectedPixels:0,periodicPixels:0,scatteredPixels:0,changedPixels:0};
        if(reason)return {image,stats};
        const {width:w,height:h,data:d}=image;
        let output=null;
        const sums=new Float64Array(12),counts=new Uint8Array(4),means=new Float64Array(12);
        const periodic = at => {
            sums.fill(0);counts.fill(0);
            let opaque=true;
            for(let oy=-2;oy<=2&&opaque;oy++)for(let ox=-2;ox<=2;ox++){
                const i=at+(oy*w+ox)*4;
                if(d[i+3]!==255){opaque=false;break;}
                const group=((oy&1)<<1)|(ox&1),p=group*3;
                counts[group]++;sums[p]+=d[i];sums[p+1]+=d[i+1];sums[p+2]+=d[i+2];
            }
            if(!opaque)return null;
            let range=0;
            for(let c=0;c<3;c++){
                let low=255,high=0;
                for(let g=0;g<4;g++){const k=g*3+c;means[k]=sums[k]/counts[g];low=Math.min(low,means[k]);high=Math.max(high,means[k]);}
                range=Math.max(range,high-low);
            }
            if(range<6||range>48)return null;
            let dx=0,dy=0;
            for(let c=0;c<3;c++){
                dx=Math.max(dx,Math.abs(means[c]-means[3+c]),Math.abs(means[6+c]-means[9+c]));
                dy=Math.max(dy,Math.abs(means[c]-means[6+c]),Math.abs(means[3+c]-means[9+c]));
            }
            if(dx<4||dy<4)return null;
            let repeated=true;
            for(let oy=-2;oy<=2&&repeated;oy++)for(let ox=-2;ox<=2;ox++){
                const i=at+(oy*w+ox)*4,p=(((oy&1)<<1)|(ox&1))*3;
                for(let c=0;c<3;c++)if(Math.abs(d[i+c]-means[p+c])>4){repeated=false;break;}
                if(!repeated)break;
            }
            if(!repeated)return null;
            return [0,1,2].map(c=>Math.round((means[c]+means[3+c]+means[6+c]+means[9+c])/4));
        };
        for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
            const at=(y*w+x)*4;
            if(d[at+3]!==255)continue;
            const l=at-4,r=at+4,u=at-w*4,v=at+w*4;
            let horizontal=0,vertical=0,diagonal=0;
            for(let c=0;c<3;c++){
                horizontal=Math.max(horizontal,Math.abs(d[l+c]+d[r+c]-2*d[at+c]));
                vertical=Math.max(vertical,Math.abs(d[u+c]+d[v+c]-2*d[at+c]));
                diagonal=Math.max(diagonal,Math.abs(d[u-4+c]+d[v+4+c]-2*d[at+c]),Math.abs(d[u+4+c]+d[v-4+c]-2*d[at+c]));
            }
            if(horizontal<4&&vertical<4&&diagonal<4)continue;
            // No colour crosses a keyed/transparent edge or a nearby strong
            // outline. The two-pixel safety band is shared by both detectors.
            let safe=true;
            for(let oy=-2;oy<=2&&safe;oy++)for(let ox=-2;ox<=2;ox++){
                const i=at+(oy*w+ox)*4;
                if(d[i+3]!==255){safe=false;break;}
                for(let c=0;c<3;c++)if(Math.abs(d[i+c]-d[at+c])>48){safe=false;break;}
                if(!safe)break;
            }
            if(!safe)continue;
            let rgb=periodic(at);
            if(rgb)stats.periodicPixels++;
            else {rgb=scattered(d,at,w);if(rgb)stats.scatteredPixels++;}
            if(!rgb)continue;
            stats.detectedPixels++;
            if(rgb[0]===d[at]&&rgb[1]===d[at+1]&&rgb[2]===d[at+2])continue;
            if(!output)output=new Uint8Array(d);
            output[at]=rgb[0];output[at+1]=rgb[1];output[at+2]=rgb[2];stats.changedPixels++;
        }
        if(!output)stats.reason='no-confident-dither';
        return {image:output?{width:w,height:h,data:output}:image,stats};
    }
    return {VERSION,MAX_PIXELS,eligibility,restore};
});
