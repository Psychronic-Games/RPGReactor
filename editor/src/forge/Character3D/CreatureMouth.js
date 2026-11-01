/**
 * A real mouth on a creature, so it can talk. The body is one sculpted surface with a closed muzzle: here it is cut
 * along a lip line, a Jaw bone is added under the head, and everything on the lower jaw (skin, fur, whiskers) is
 * skinned to it. Behind the lips sit a lining, a tongue and teeth for the kind. Speech needs nothing else: the game
 * and the builder turn the Jaw bone, as they do any rig's.
 */
(function(root){
    'use strict';
    const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],mul=(a,k)=>[a[0]*k,a[1]*k,a[2]*k],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
    const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],norm=a=>{const l=Math.hypot(...a)||1;return[a[0]/l,a[1]/l,a[2]/l];};
    const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);},mix=(a,b,t)=>a+(b-a)*t;
    const LINING=[.20,.055,.065],LIP=[.05,.03,.03],TONGUE=[.52,.17,.19],TOOTH=[.82,.78,.66];
    const FANGED=new Set(['cat','lion','tiger','dog','wolf','fox','bear','drake']);
    /** How far the opening runs back along the head, as a share of its length, by snout. */
    const depthOf=r=>Math.max(.24,Math.min(.38,.22+.11*(r.snoutLength??1)));
    /** The Mouth open slider at full travel, and what one unit of speech turns the jaw: see reactor_3d_speech.js. */
    const OPEN_RADIANS=.5;

    /** Vertex attribute arrays of a part, by how many components each vertex has. */
    const attributes=p=>{const n=p.positions.length/3,out=[];for(const key of Object.keys(p)){const a=p[key];if(key==='index'||!ArrayBuffer.isView(a)||a.length%n)continue;out.push([key,a.length/n]);}return out;};

    /** Where the mouth lies, measured from the finished muzzle: this head's frame and its lip curve. */
    function measure(body,head,r){
        const origin=head.tail,forward=norm(sub(head.tail,head.head)),across=[1,0,0],up=norm(cross(forward,across)),length=Math.hypot(...sub(head.tail,head.head));
        const P=body.positions,n=P.length/3,F=new Float32Array(n),U=new Float32Array(n);
        let front=-Infinity,side=0;
        const onHead=new Uint8Array(n);
        for(let v=0;v<n;v++){
            const d=[P[v*3]-origin[0],P[v*3+1]-origin[1],P[v*3+2]-origin[2]];F[v]=dot(d,forward);U[v]=dot(d,up);
            for(let k=0;k<4;k++)if(body.joints[v*4+k]===head.index&&body.weights[v*4+k]>.5)onHead[v]=1;
            if(!onHead[v]||F[v]<-length*.6)continue;
            if(F[v]>front)front=F[v];
            if(Math.abs(P[v*3])>side)side=Math.abs(P[v*3]);
        }
        const depth=length*depthOf(r),corner=front-depth;
        // The muzzle's front, top to bottom, down its middle.
        let low=Infinity,high=-Infinity;
        for(let v=0;v<n;v++)if(onHead[v]&&Math.abs(P[v*3])<side*.14&&F[v]>front-length*.14){low=Math.min(low,U[v]);high=Math.max(high,U[v]);}
        if(!Number.isFinite(low)||!(front>corner))return null;
        const lipFront=low+(high-low)*.40,lipCorner=lipFront+length*.05;
        const lip=f=>mix(lipCorner,lipFront,Math.pow(Math.max(0,Math.min(1,(f-corner)/depth)),.7));
        const hinge=add(add(origin,mul(forward,corner-length*.10)),mul(up,lip(corner)));
        return{origin,forward,up,length,front,corner,depth,lip,hinge,F,U,onHead,side};
    }

    /**
     * Cut the skin along the lip. Each triangle the lip crosses is sliced where it crosses, so the edge follows the curve
     * and not the mesh; the new vertices come in pairs, one for each lip, so the two can part.
     */
    function cut(body,m){
        const P=body.positions,n=P.length/3,{F,U,onHead,corner,lip,front}=m,lower=new Uint8Array(n),off=new Float32Array(n);
        for(let v=0;v<n;v++)if(onHead[v]&&F[v]>=corner&&F[v]<=front+1e-6){off[v]=U[v]-lip(F[v]);lower[v]=off[v]<0?1:0;}
        const mouth=v=>onHead[v]&&F[v]>=corner,fields=attributes(body),extra=[],pairs=new Map();
        // A point on an edge, twice: [upper lip's vertex, lower lip's vertex].
        const pointOn=(a,b)=>{
            const key=a<b?a+':'+b:b+':'+a;
            let pair=pairs.get(key);
            if(!pair){const t=off[a]/(off[a]-off[b]);pair=[n+extra.length,n+extra.length+1];extra.push({a,b,t,side:0},{a,b,t,side:1});pairs.set(key,pair);}
            return pair;
        };
        const index=[];
        for(let t=0;t<body.index.length;t+=3){
            const tri=[body.index[t],body.index[t+1],body.index[t+2]],below=lower[tri[0]]+lower[tri[1]]+lower[tri[2]];
            if(!tri.every(mouth)||below===0||below===3){index.push(...tri);continue;}
            // Turned so the first corner stands alone on its side of the lip; the order keeps the facing.
            const alone=tri.findIndex(v=>(lower[v]===1)===(below===1)),[l,a,b]=[tri[alone],tri[(alone+1)%3],tri[(alone+2)%3]];
            const ea=pointOn(l,a),eb=pointOn(l,b),own=lower[l],rest=1-own;
            index.push(l,ea[own],eb[own],ea[rest],a,b,ea[rest],b,eb[rest]);
        }
        if(extra.length){
            const total=n+extra.length;
            for(const [key,size] of fields){
                const old=body[key],grown=new old.constructor(total*size);grown.set(old);
                const blend=old instanceof Float32Array&&key!=='weights';
                extra.forEach((e,i)=>{for(let k=0;k<size;k++)grown[(n+i)*size+k]=blend?mix(old[e.a*size+k],old[e.b*size+k],e.t):old[(e.t<.5?e.a:e.b)*size+k];});
                body[key]=grown;
            }
        }
        const N=body.normals;
        for(let v=n;v<n+extra.length;v++){const l=Math.hypot(N[v*3],N[v*3+1],N[v*3+2])||1;N[v*3]/=l;N[v*3+1]/=l;N[v*3+2]/=l;}
        body.index=Uint32Array.from(index);
        const isLower=new Uint8Array(n+extra.length);isLower.set(lower);
        extra.forEach((e,i)=>{isLower[n+i]=e.side;});
        return{lower:isLower,cutVertices:extra.length};
    }

    /** Hands the lower jaw of a part to the Jaw bone, fading into the head behind the corner of the mouth. */
    function skinJaw(part,m,jaw,headIndex,lower){
        const P=part.positions,n=P.length/3,{origin,forward,up,corner,depth,lip}=m;
        let count=0;
        for(let v=0;v<n;v++){
            let onHead=-1;for(let k=0;k<4;k++)if(part.joints[v*4+k]===headIndex&&part.weights[v*4+k]>.01)onHead=k;
            if(onHead<0)continue;
            const d=[P[v*3]-origin[0],P[v*3+1]-origin[1],P[v*3+2]-origin[2]],f=dot(d,forward),u=dot(d,up);
            const below=lower?lower[v]===1||f<corner&&u<lip(corner):u<lip(f);
            if(!below)continue;
            const w=smooth(corner-depth*.55,corner+depth*.02,f);
            if(w<=.003)continue;
            const held=part.weights[v*4+onHead];
            part.weights[v*4+onHead]=held*(1-w);
            let slot=-1;for(let k=0;k<4;k++)if(k!==onHead&&part.weights[v*4+k]===0){slot=k;break;}
            if(slot<0){part.weights[v*4+onHead]=held*(1-w);slot=onHead;part.weights[v*4+onHead]=held;part.joints[v*4+onHead]=jaw;}
            else{part.joints[v*4+slot]=jaw;part.weights[v*4+slot]=held*w;}
            count++;
        }
        return count;
    }

    /** A small mesh in the part format, smooth-shaded, all on one bone or by the `bone` the caller gives each vertex. */
    function Piece(){const o={positions:[],colors:[],joints:[],weights:[],index:[],
        vertex(p,c,w){o.positions.push(p[0],p[1],p[2]);o.colors.push(c[0],c[1],c[2]);o.joints.push(...w.joints);o.weights.push(...w.weights);return o.positions.length/3-1;},
        quad(a,b,c,d){o.index.push(a,b,c,a,c,d);}};return o;}
    function finishPiece(o,name,extra){
        const positions=Float32Array.from(o.positions),index=Uint32Array.from(o.index),normals=new Float32Array(positions.length);
        for(let t=0;t<index.length;t+=3){
            const [a,b,c]=[index[t],index[t+1],index[t+2]],p=i=>[positions[i*3],positions[i*3+1],positions[i*3+2]],f=cross(sub(p(b),p(a)),sub(p(c),p(a)));
            for(const v of [a,b,c])for(let k=0;k<3;k++)normals[v*3+k]+=f[k];
        }
        for(let v=0;v<normals.length;v+=3){const l=Math.hypot(normals[v],normals[v+1],normals[v+2])||1;normals[v]/=l;normals[v+1]/=l;normals[v+2]/=l;}
        return Object.assign({name,positions,normals,index,colors:Float32Array.from(o.colors),joints:Uint8Array.from(o.joints),weights:Float32Array.from(o.weights)},extra);
    }

    /** The inside of the mouth: lining, tongue and the kind's teeth, each jaw's on its own bone. */
    function interior(body,m,lower,jaw,headIndex,r){
        const {origin,forward,up,length,corner,depth,lip,front}=m,P=body.positions,n=P.length/3,rows=10,cols=8;
        const at=(x,u,f)=>add(add(add(origin,[x,0,0]),mul(forward,f)),mul(up,u));
        // The opening's half width, from the skin at the lip line, along the mouth.
        const widths=new Float32Array(rows+1);
        for(let v=0;v<n;v++){
            const d=[P[v*3]-origin[0],P[v*3+1]-origin[1],P[v*3+2]-origin[2]],f=dot(d,forward),u=dot(d,up),t=Math.round((f-corner)/depth*rows);
            if(t<0||t>rows||Math.abs(u-lip(f))>depth*.16)continue;
            widths[t]=Math.max(widths[t],Math.abs(P[v*3]));
        }
        for(let t=1;t<=rows;t++)if(!widths[t])widths[t]=widths[t-1];
        for(let t=rows-1;t>=0;t--)if(!widths[t])widths[t]=widths[t+1];
        const head={joints:[headIndex,0,0,0],weights:[1,0,0,0]},low={joints:[jaw,0,0,0],weights:[1,0,0,0]};
        // Each sheet meets the lip all round, so the pocket is closed and nothing shows through the muzzle.
        const lining=Piece(),arch=length*.05,inset=.90,grids=[[],[]];
        for(const [s,sign] of [[0,1],[1,-1]]){
            for(let t=0;t<=rows;t++){
                const q=t/rows,f=corner+depth*.93*q,row=[];
                for(let k=0;k<=cols;k++){
                    const c=k/cols*2-1,x=c*widths[t]*inset*Math.sqrt(1-.55*q*q*q*q),roof=(1-c*c)*arch*(1-q*q)*sign;
                    const edge=Math.max(smooth(.86,1,Math.abs(c)),smooth(.8,1,q)),shade=[0,1,2].map(i=>mix(LINING[i],LIP[i],edge));
                    row.push(lining.vertex(at(x,lip(f)+roof,f),shade,sign>0?head:low));
                }
                grids[s].push(row);
            }
            for(let t=0;t<rows;t++)for(let k=0;k<cols;k++){const g=grids[s],[a,b,c,d]=[g[t][k],g[t][k+1],g[t+1][k+1],g[t+1][k]];if(sign<0)lining.quad(a,b,c,d);else lining.quad(a,d,c,b);}
        }
        // The throat: the two sheets joined at the back, stretching as the jaw drops.
        for(let k=0;k<cols;k++)lining.quad(grids[0][0][k],grids[0][0][k+1],grids[1][0][k+1],grids[1][0][k]);
        const parts=[finishPiece(lining,'Mouth interior',{kind:'skin',roughness:.55,doubleSided:true})];
        // A flattened tongue on the floor of the mouth.
        const tongue=Piece(),rings=8,around=10,span=depth*.72,start=corner+depth*.08,top=length*.018;
        const ring=[];
        for(let t=0;t<=rings;t++){
            const q=t/rings,f=start+span*q,tip=Math.sqrt(Math.max(0,1-Math.pow(Math.max(0,q-.45)/.55,2.4))),half=widths[Math.min(rows,Math.round(q*.72*rows))]*.52*tip,row=[];
            for(let k=0;k<around;k++){const a=k/around*Math.PI*2,x=Math.cos(a)*(half+1e-5),h=Math.sin(a)*(top*tip+1e-5);row.push(tongue.vertex(at(x,lip(f)-arch*.55+h,f),TONGUE,low));}
            ring.push(row);
        }
        for(let t=0;t<rings;t++)for(let k=0;k<around;k++){const j=(k+1)%around;tongue.quad(ring[t][k],ring[t][j],ring[t+1][j],ring[t+1][k]);}
        parts.push(finishPiece(tongue,'Tongue',{kind:'skin',roughness:.42}));
        // Teeth: a cone from the gum, upper ones pointing down, lower ones up.
        const teeth=Piece(),tooth=(x,f,long,wide,upper)=>{
            const base=lip(f)+(upper?arch*.25:-arch*.25),sign=upper?-1:1,skin=upper?head:low,centre=teeth.vertex(at(x,base+sign*long,f),TOOTH,skin),rim=[];
            for(let k=0;k<6;k++){const a=k/6*Math.PI*2;rim.push(teeth.vertex(at(x+Math.cos(a)*wide,base,f+Math.sin(a)*wide),TOOTH,skin));}
            for(let k=0;k<6;k++){const a=rim[k],b=rim[(k+1)%6];if(upper)teeth.index.push(a,b,centre);else teeth.index.push(b,a,centre);}
        };
        const wide=widths[Math.round(rows*.88)]||widths[rows-1],f0=corner+depth*.90,fanged=FANGED.has(r.kind);
        for(const upper of [true,false]){
            const row=upper?1:.86;
            for(let i=0;i<6;i++){const c=(i-2.5)/2.5;tooth(c*wide*.34*row,f0-Math.abs(c)*depth*.03,length*.012,length*.009,upper);}
            if(fanged)for(const s of [-1,1])tooth(s*wide*.56*row,f0-depth*.09,length*(upper?.036:.03),length*.012,upper);
        }
        parts.push(finishPiece(teeth,'Teeth',{kind:'skin',roughness:.28}));
        return parts;
    }

    /** Sets a resting opening into the model itself, so a Mouth open slider is in the pose saved and in the portrait. */
    function rest(parts,jaw,hinge,angle){
        const c=Math.cos(angle),s=Math.sin(angle);
        for(const p of parts)for(let v=0;v<p.positions.length/3;v++){
            let w=0;for(let k=0;k<4;k++)if(p.joints[v*4+k]===jaw)w+=p.weights[v*4+k];
            if(w<=0)continue;
            const a=angle*w,ca=w===1?c:Math.cos(a),sa=w===1?s:Math.sin(a),y=p.positions[v*3+1]-hinge[1],z=p.positions[v*3+2]-hinge[2];
            p.positions[v*3+1]=hinge[1]+y*ca-z*sa;p.positions[v*3+2]=hinge[2]+y*sa+z*ca;
            const ny=p.normals[v*3+1],nz=p.normals[v*3+2];p.normals[v*3+1]=ny*ca-nz*sa;p.normals[v*3+2]=ny*sa+nz*ca;
        }
    }

    /** Gives a finished creature a mouth. Returns the mouth's facts, or null when this head has no muzzle to cut. */
    function apply(parts,bones,r){
        const body=parts.find(p=>p.name==='Body'),headIndex=bones.findIndex(b=>b.name==='Head');
        if(!body||headIndex<0||bones.some(b=>b.name==='Jaw'))return null;
        const head=Object.assign({index:headIndex},bones[headIndex]),m=measure(body,head,r);
        if(!m)return null;
        const {lower,cutVertices}=cut(body,m),jaw=bones.length;
        const chin=add(add(m.origin,mul(m.forward,m.front)),mul(m.up,m.lip(m.front)-m.length*.04));
        bones.push({name:'Jaw',parent:headIndex,head:m.hinge,tail:chin});
        skinJaw(body,m,jaw,headIndex,lower);
        for(const p of parts)if(p!==body&&!/^(Eyes|Horns?)/.test(p.name))skinJaw(p,m,jaw,headIndex,null);
        const inside=interior(body,m,lower,jaw,headIndex,r);
        parts.push(...inside);
        const open=Math.max(0,Math.min(1,r.mouthOpen||0));
        if(open>0)rest(parts,jaw,m.hinge,open*OPEN_RADIANS);
        return{jaw,hinge:m.hinge,cutVertices};
    }

    /** How far a letter opens the jaw, 0 to 1: the talking preview's table, as the game's by mouth shape. */
    function letterOpen(ch){
        const c=String(ch||'').toLowerCase();
        if('ao'.includes(c))return 1;if('eiuy'.includes(c))return .6;if('mbpfv'.includes(c))return .04;if(c>='a'&&c<='z')return .4;return 0;
    }
    /** What one full unit of talk turns the jaw, in radians: the game's own (reactor_3d_speech.js). */
    const TALK_RADIANS=.28,LINE='Hello there, traveler! Welcome to our village. Would you like to rest by the fire for a while?';

    const api={apply,letterOpen,OPEN_RADIANS,TALK_RADIANS,LINE};root.RRCreatureMouth=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
