/**
 * Clothing that knows what it is worn over. Every garment is laid and draped from the body's clothing helpers, which
 * can't follow every proportion or detail; this is the last word. Going out from the skin, each garment finds the
 * nearest point of the real surface under it (the finished skin, then the garments already settled) and any part that
 * dips in, or lies closer than a hair's breadth, moves out. The move spreads through the cloth so it lifts like fabric
 * over a shape instead of spiking. It only ever adds room, so a body of any proportions, and any garment, is covered
 * by the same rule. Pieces of one garment are sewn together and never push each other.
 */
(function(root){
    'use strict';
    const CELL=.04,SKIN_GAP=.0012,LAYER_GAP=.0016,TUCK_GAP=.006,SPREAD=.8,ROUNDS=8,SMOOTH=6;
    const key=(x,y,z)=>((x+1024)*2048+(y+1024))*2048+(z+1024);

    /**
     * Triangles on a grid: each listed in every cell within reach of it, so a point reads one cell. A cell lists
     * hundreds of a fine skin's triangles; each is kept in flat arrays with a bounding sphere, and one whose sphere
     * lies farther than the nearest found so far is passed over (it can't be nearer), so a query reads a few closely.
     */
    function Surface(){
        // The grid is made when the surface is first asked (`grid`), in one pass over every triangle's box of cells:
        // each cell's triangles in the order they were added, read by index. (Listed into a map of arrays as each was
        // added, sorting a garment into its grid cost a quarter of what asking it did, and a garment is sorted anew
        // for every round of every layer.)
        const T=[],N=[],F=[],B=[];
        let made=null;
        const grid=()=>{
            const count=N.length,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
            for(let i=0;i<B.length;i+=6)for(let k=0;k<3;k++){if(B[i+k]<lo[k])lo[k]=B[i+k];if(B[i+3+k]>hi[k])hi[k]=B[i+3+k];}
            const nx=count?hi[0]-lo[0]+1:0,ny=count?hi[1]-lo[1]+1:0,nz=count?hi[2]-lo[2]+1:0,total=nx*ny*nz;
            // (A surface too far-flung for a box of cells, a stray point a kilometer off: its cells in a map, as before.)
            if(!(total<=2e7)){
                const map=new Map();
                for(let id=0;id<count;id++){const o=id*6;for(let x=B[o];x<=B[o+3];x++)for(let y=B[o+1];y<=B[o+4];y++)for(let z=B[o+2];z<=B[o+5];z++){const k=key(x,y,z);let list=map.get(k);if(!list)map.set(k,list=[]);list.push(id);}}
                return (made={map});
            }
            const starts=new Int32Array(total+1);
            for(let id=0;id<count;id++){const o=id*6;for(let x=B[o]-lo[0];x<=B[o+3]-lo[0];x++)for(let y=B[o+1]-lo[1];y<=B[o+4]-lo[1];y++){const row=(x*ny+y)*nz-lo[2];for(let z=B[o+2];z<=B[o+5];z++)starts[row+z+1]++;}}
            for(let c=0;c<total;c++)starts[c+1]+=starts[c];
            const next=starts.slice(0,total),ids=new Int32Array(starts[total]);
            for(let id=0;id<count;id++){const o=id*6;for(let x=B[o]-lo[0];x<=B[o+3]-lo[0];x++)for(let y=B[o+1]-lo[1];y<=B[o+4]-lo[1];y++){const row=(x*ny+y)*nz-lo[2];for(let z=B[o+2];z<=B[o+5];z++)ids[next[row+z]++]=id;}}
            return (made={lo,nx,ny,nz,starts,ids});
        };
        const add=(a,b,c,flip,face)=>{
            const e1=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],e2=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
            let n=[e1[1]*e2[2]-e1[2]*e2[1],e1[2]*e2[0]-e1[0]*e2[2],e1[0]*e2[1]-e1[1]*e2[0]];
            const l=Math.hypot(n[0],n[1],n[2]);if(l<1e-12)return;
            const s=(flip?-1:1)/l;n=[n[0]*s,n[1]*s,n[2]*s];
            const id=N.length,d11=e1[0]*e1[0]+e1[1]*e1[1]+e1[2]*e1[2],d12=e1[0]*e2[0]+e1[1]*e2[1]+e1[2]*e2[2],d22=e2[0]*e2[0]+e2[1]*e2[1]+e2[2]*e2[2];
            // The sphere round the corners, its radius padded so rounding can never pass over a nearer triangle.
            const cx=(a[0]+b[0]+c[0])/3,cy=(a[1]+b[1]+c[1])/3,cz=(a[2]+b[2]+c[2])/3;
            const r=Math.sqrt(Math.max((a[0]-cx)**2+(a[1]-cy)**2+(a[2]-cz)**2,(b[0]-cx)**2+(b[1]-cy)**2+(b[2]-cz)**2,(c[0]-cx)**2+(c[1]-cy)**2+(c[2]-cz)**2))*(1+1e-6)+1e-9;
            T.push(a[0],a[1],a[2],e1[0],e1[1],e1[2],e2[0],e2[1],e2[2],d11,d12,d22,d11*d22-d12*d12,cx,cy,cz,r);N.push(n);F.push(face);
            // Its box of cells (every cell within reach of it), kept for the grid.
            B.push(Math.floor((Math.min(a[0],b[0],c[0])-CELL)/CELL),Math.floor((Math.min(a[1],b[1],c[1])-CELL)/CELL),Math.floor((Math.min(a[2],b[2],c[2])-CELL)/CELL),
                Math.floor((Math.max(a[0],b[0],c[0])+CELL)/CELL),Math.floor((Math.max(a[1],b[1],c[1])+CELL)/CELL),Math.floor((Math.max(a[2],b[2],c[2])+CELL)/CELL));
            made=null;
        };
        /** The nearest surface point's signed distance (below 0: inside) and its outward normal, or null with nothing near. */
        const nearest=(x,y,z,out)=>{
            const g=made||grid();
            let list,from,end;
            if(g.map){list=g.map.get(key(Math.floor(x/CELL),Math.floor(y/CELL),Math.floor(z/CELL)));if(!list)return false;from=0;end=list.length;}
            else{
                const gx=Math.floor(x/CELL)-g.lo[0],gy=Math.floor(y/CELL)-g.lo[1],gz=Math.floor(z/CELL)-g.lo[2];
                if(!(gx>=0&&gy>=0&&gz>=0&&gx<g.nx&&gy<g.ny&&gz<g.nz))return false;
                const cell=(gx*g.ny+gy)*g.nz+gz;list=g.ids;from=g.starts[cell];end=g.starts[cell+1];
            }
            let best=Infinity,found=false;
            for(let i=from;i<end;i++){
                const o=list[i]*17;
                const sx=x-T[o+13],sy=y-T[o+14],sz=z-T[o+15],gap=Math.sqrt(sx*sx+sy*sy+sz*sz)-T[o+16];
                if(gap>0&&gap*gap>best)continue;
                const px=x-T[o],py=y-T[o+1],pz=z-T[o+2];
                const d=T[o+3]*px+T[o+4]*py+T[o+5]*pz,e=T[o+6]*px+T[o+7]*py+T[o+8]*pz,d11=T[o+9],d12=T[o+10],d22=T[o+11],det=T[o+12];
                let u=d22*d-d12*e,v=d11*e-d12*d;
                const over=u>=0&&v>=0&&u+v<=det;
                if(u<0)u=0;if(v<0)v=0;if(u+v>det){const k=det/(u+v);u*=k;v*=k;}
                u/=det||1;v/=det||1;
                const qx=px-T[o+3]*u-T[o+6]*v,qy=py-T[o+4]*u-T[o+7]*v,qz=pz-T[o+5]*u-T[o+8]*v,dd=qx*qx+qy*qy+qz*qz;
                if(dd<best){const id=list[i],n=N[id];best=dd;found=true;out.d=qx*n[0]+qy*n[1]+qz*n[2];out.n=n;out.over=over;out.face=F[id];}
            }
            if(found&&best>CELL*CELL)return false;
            return found;
        };
        return{add,nearest};
    }

    /**
     * A garment's triangles into the surface, outward by the skin: a piece's own winding isn't reliable (a skirt's faces
     * turn either way), and a face taken backwards would push the next layer in. Far from any skin, the winding stands.
     */
    function addLaid(surface,skin,laid){
        const P=laid.positions,I=laid.index,at=v=>[P[v*3],P[v*3+1],P[v*3+2]],hit={d:0,n:null};
        for(let t=0;t<I.length;t+=3){
            const a=at(I[t]),b=at(I[t+1]),c=at(I[t+2]),m=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];
            const n=[(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]),(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])];
            surface.add(a,b,c,skin.nearest(m[0],m[1],m[2],hit)&&n[0]*hit.n[0]+n[1]*hit.n[1]+n[2]*hit.n[2]<0,t);
        }
    }

    /** Whether anything in `parts` lies over `point`, within `reach` along `normal`. */
    function covered(point,normal,parts,reach=.05){
        const [px,py,pz]=point,[nx,ny,nz]=normal;
        for(const part of parts){
            const P=part.positions,I=part.index;
            if(!P||!I||part.opacity<1)continue;
            for(let t=0;t<I.length;t+=3){
                const i=I[t]*3,j=I[t+1]*3,k=I[t+2]*3,ax=P[i]-px,ay=P[i+1]-py,az=P[i+2]-pz;
                // Off to one side altogether: all three corners, as a large face's first corner can lie far away.
                if(Math.min(P[i],P[j],P[k])>px+reach||Math.max(P[i],P[j],P[k])<px-reach||Math.min(P[i+1],P[j+1],P[k+1])>py+reach||Math.max(P[i+1],P[j+1],P[k+1])<py-reach)continue;
                const ex=P[j]-P[i],ey=P[j+1]-P[i+1],ez=P[j+2]-P[i+2],fx=P[k]-P[i],fy=P[k+1]-P[i+1],fz=P[k+2]-P[i+2];
                const qx=ny*fz-nz*fy,qy=nz*fx-nx*fz,qz=nx*fy-ny*fx,det=ex*qx+ey*qy+ez*qz;
                if(Math.abs(det)<1e-12)continue;
                const tx=-ax,ty=-ay,tz=-az,u=(tx*qx+ty*qy+tz*qz)/det;
                if(u<0||u>1)continue;
                const rx=ty*ez-tz*ey,ry=tz*ex-tx*ez,rz=tx*ey-ty*ex,v=(nx*rx+ny*ry+nz*rz)/det;
                if(v<0||u+v>1)continue;
                const d=(fx*rx+fy*ry+fz*rz)/det;
                if(d>0&&d<reach)return true;
            }
        }
        return false;
    }

    /**
     * One garment piece against everything under it. Each surface is asked on its own: a vertex under the shirt can
     * still lie nearer the skin, and the nearest surface alone would never mention the shirt. The largest move wins.
     * A bump is a height over the skin, not a surface: a point inside one may be nearer the skin beside it.
     */
    /** A move evened out so it has no steps for the light to catch, and no spikes: each vertex keeps at least what it needed. */
    function soften(I,n,move,needed){
        const need=needed.slice(),sum=new Float32Array(n*3),count=new Uint16Array(n);
        for(let round=0;round<SMOOTH;round++){
            sum.fill(0);count.fill(0);
            for(let t=0;t<I.length;t+=3)for(let e=0;e<3;e++){const a=I[t+e],b=I[t+(e+1)%3];count[a]++;count[b]++;for(let k=0;k<3;k++){sum[a*3+k]+=move[b*3+k];sum[b*3+k]+=move[a*3+k];}}
            for(let v=0;v<n;v++){
                if(!count[v])continue;
                const x=sum[v*3]/count[v],y=sum[v*3+1]/count[v],z=sum[v*3+2]/count[v],m=Math.hypot(x,y,z),keep=m<need[v]&&m>1e-7?need[v]/m:1;
                move[v*3]=x*keep;move[v*3+1]=y*keep;move[v*3+2]=z*keep;
            }
        }
    }

    /**
     * Thin cloth shows the point under it. A shirt is a rounded shell that passes clear over a nipple however close it lies on
     * the breast, and tight cloth bridges the skin's hollows rather than following them, so it keeps that shell and rises
     * where the point's axis meets it: by the point's measured height, on a soft shoulder, as cloth tents over anything.
     */
    function tent(laid,bumps,surfaces,point=.022,shoulder=.045){
        const P=laid.positions,n=P.length/3,hit={d:0,n:null},part=[0,0];
        const axial=(v,b)=>{
            const dx=P[v*3]-b.at[0],dy=P[v*3+1]-b.at[1],dz=P[v*3+2]-b.at[2],along=dx*b.normal[0]+dy*b.normal[1]+dz*b.normal[2];
            part[0]=along;part[1]=Math.hypot(dx-b.normal[0]*along,dy-b.normal[1]*along,dz-b.normal[2]*along);
        };
        for(const b of bumps){
            const clear=[];
            for(let v=0;v<n;v++){
                axial(v,b);
                if(part[0]<-.05||part[0]>.08||part[1]<b.radius||part[1]>b.radius*1.5)continue;
                let least=Infinity;
                for(const s of surfaces)if(s.nearest(P[v*3],P[v*3+1],P[v*3+2],hit))least=Math.min(least,hit.d);
                if(Number.isFinite(least))clear.push(least);
            }
            if(clear.length<4)continue;
            // Hanging well off the breast, a loose cut shows nothing.
            if(clear.sort((x,y)=>x-y)[clear.length>>1]>.03)continue;
            const height=(b.height-.0012)*1.3;
            for(let v=0;v<n;v++){
                axial(v,b);
                if(part[0]<-.03||part[0]>.06||part[1]>=shoulder)continue;
                const q=Math.max(0,1-part[1]/point),soft=1-part[1]/shoulder,k=height*(.7*q*q*(3-2*q)+.3*soft*soft);
                for(let c=0;c<3;c++)P[v*3+c]+=b.normal[c]*k;
            }
        }
    }

    function settlePiece(laid,surfaces,bumps,gap){
        const P=laid.positions,n=P.length/3,move=new Float32Array(n*3),size=new Float32Array(n),hit={d:0,n:null};
        let moved=0,deepest=0;
        for(let v=0;v<n;v++){
            const x=P[v*3],y=P[v*3+1],z=P[v*3+2];
            let most=0;
            for(let s=0;s<surfaces.length;s++){
                // (Far "inside" isn't: that's cloth in a fold or a cleavage reading the other side of it, and pushing would tear it across.)
                if(!surfaces[s].nearest(x,y,z,hit)||hit.d>=gap||hit.d<-.028)continue;
                const k=gap-hit.d;
                if(k>most){most=k;move[v*3]=hit.n[0]*k;move[v*3+1]=hit.n[1]*k;move[v*3+2]=hit.n[2]*k;}
                if(hit.d<deepest)deepest=hit.d;
            }
            for(const b of bumps){
                const dx=x-b.at[0],dy=y-b.at[1],dz=z-b.at[2],along=dx*b.normal[0]+dy*b.normal[1]+dz*b.normal[2],r=Math.hypot(dx-b.normal[0]*along,dy-b.normal[1]*along,dz-b.normal[2]*along);
                if(r>=b.radius||along<-.004)continue;
                const q=1-r/b.radius,k=b.height*q*q+gap-along;
                if(k>most){most=k;move[v*3]=b.normal[0]*k;move[v*3+1]=b.normal[1]*k;move[v*3+2]=b.normal[2]*k;}
            }
            if(most>0){size[v]=most;moved++;}
        }
        // The cloth's own peak: its nearest vertex stands right over the point, however far apart the cloth's vertices are.
        // Only ever outward: cloth already clear of the point is not pulled in to it.
        const peaks=[];
        for(const b of bumps){
            let tip=-1,closest=b.radius*.35;
            for(let v=0;v<n;v++){
                const dx=P[v*3]-b.at[0],dy=P[v*3+1]-b.at[1],dz=P[v*3+2]-b.at[2],along=dx*b.normal[0]+dy*b.normal[1]+dz*b.normal[2];
                if(along<-.02||along>.05)continue;
                const r=Math.hypot(dx-b.normal[0]*along,dy-b.normal[1]*along,dz-b.normal[2]*along);
                if(r<closest){closest=r;tip=v;}
            }
            if(tip<0)continue;
            const to=[0,1,2].map(k=>b.at[k]+b.normal[k]*(b.height+gap)-P[tip*3+k]);
            if(to[0]*b.normal[0]+to[1]*b.normal[1]+to[2]*b.normal[2]>0)peaks.push([tip,to]);
        }
        if(!moved&&!peaks.length)return{moved,deepest};
        // Spread through the cloth: each neighbor takes most of the move, so a bump rises from a soft shoulder.
        const I=laid.index;
        // A lift spreads only to cloth it lifts: under a full bust the skin pushes down and back, and passing that on would drive the
        // cloth in front of it through the body. (Outward: the way the piece was laid off the body, when that's known.)
        const M=laid.normals,B=laid.base;
        let out=0;
        if(M&&B)for(let v=0;v<Math.min(n,B.length/3);v++)out+=(P[v*3]-B[v*3])*M[v*3]+(P[v*3+1]-B[v*3+1])*M[v*3+1]+(P[v*3+2]-B[v*3+2])*M[v*3+2]<0?-1:1;
        const carries=(x,y)=>!out||(move[x*3]*M[y*3]+move[x*3+1]*M[y*3+1]+move[x*3+2]*M[y*3+2])*out>=0;
        for(let round=0;round<ROUNDS;round++)for(let t=0;t<I.length;t+=3)for(let e=0;e<3;e++){
            const a=I[t+e],b=I[t+(e+1)%3];
            for(const [x,y] of [[a,b],[b,a]]){const k=size[x]*SPREAD;if(k>size[y]&&k>1e-5&&carries(x,y)){const s=SPREAD;size[y]=k;move[y*3]=move[x*3]*s;move[y*3+1]=move[x*3+1]*s;move[y*3+2]=move[x*3+2]*s;}}
        }
        soften(I,n,move,size);
        for(const [v,to] of peaks){move[v*3]=to[0];move[v*3+1]=to[1];move[v*3+2]=to[2];}
        for(let i=0;i<P.length;i++)P[i]+=move[i];
        return{moved,deepest};
    }

    /**
     * The check the other way round, and the last word on skin. Vertices alone can't see it: a finger or a knuckle is finer than
     * the cloth over it, so skin comes through the middle of a face with every corner of that face outside. Each skin point
     * under a face that lies too close lifts that face, and then no cloth vertex is left inside the skin, whatever moved it.
     */
    function hug(laid,under,bare,gaps,skinNormals,rounds=3){
        const P=laid.positions,I=laid.index,n=P.length/3,hit={d:0,n:null,over:false,face:0},lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
        for(let v=0;v<n;v++)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],P[v*3+k]);hi[k]=Math.max(hi[k],P[v*3+k]);}
        const near=[];
        for(const [u,S] of under.entries())for(let v=0;v<S.length/3;v++)if(S[v*3]>lo[0]-.02&&S[v*3]<hi[0]+.02&&S[v*3+1]>lo[1]-.02&&S[v*3+1]<hi[1]+.02&&S[v*3+2]>lo[2]-.02&&S[v*3+2]<hi[2]+.02)near.push(S[v*3],S[v*3+1],S[v*3+2],u?gaps[1]:gaps[0],u?.03:.012,u||!skinNormals?0:skinNormals[v*3],u||!skinNormals?0:skinNormals[v*3+1],u||!skinNormals?0:skinNormals[v*3+2]);
        const move=new Float32Array(n*3),size=new Float32Array(n);
        for(let round=0;round<rounds;round++){
            const surface=Surface();addLaid(surface,bare,laid);
            move.fill(0);size.fill(0);
            let lifted=0;
            for(let i=0;i<near.length;i+=8){
                const gap=near[i+3];
                // (A little past the face is a finger through it; far past is another part of the body in a fold, nothing to lift for. Cloth under cloth reaches further.)
                if(!surface.nearest(near[i],near[i+1],near[i+2],hit)||!hit.over||hit.d<=-gap||hit.d>near[i+4])continue;
                // Skin through cloth faces the way the cloth does (a finger under a glove). Skin turned aside (a cleavage, a fold) is only passing behind it.
                if((near[i+5]||near[i+6]||near[i+7])&&near[i+5]*hit.n[0]+near[i+6]*hit.n[1]+near[i+7]*hit.n[2]<.35)continue;
                const k=hit.d+gap,t=hit.face;
                for(let c=0;c<3;c++){const q=I[t+c];if(k>size[q]){size[q]=k;move[q*3]=hit.n[0]*k;move[q*3+1]=hit.n[1]*k;move[q*3+2]=hit.n[2]*k;}}
                lifted++;
            }
            if(!lifted)break;
            soften(I,n,move,size);
            for(let i=0;i<P.length;i++)P[i]+=move[i];
        }
        for(let v=0;v<n;v++)if(bare.nearest(P[v*3],P[v*3+1],P[v*3+2],hit)&&hit.d<gaps[0]&&hit.d>-.028){const k=gaps[0]-hit.d;P[v*3]+=hit.n[0]*k;P[v*3+1]+=hit.n[1]*k;P[v*3+2]+=hit.n[2]*k;}
    }

    /**
     * The other half of a layer pair. An outer garment's vertices can all clear what's under it while a fold of that cloth
     * rises through the middle of one of its faces, where no vertex looks. So each cloth under a garment is pressed
     * back beneath it, as a coat presses a shirt; only under its faces, and never into the skin.
     */
    function tuck(laid,outer,skin,gap){
        const P=laid.positions,n=P.length/3,hit={d:0,n:null,over:false},under={d:0,n:null},move=new Float32Array(n*3),size=new Float32Array(n);
        let tucked=0;
        for(let v=0;v<n;v++){
            const x=P[v*3],y=P[v*3+1],z=P[v*3+2];
            if(!outer.nearest(x,y,z,hit)||!hit.over||hit.d<-gap)continue;
            let room=hit.d+gap;
            if(skin.nearest(x,y,z,under))room=Math.min(room,Math.max(0,under.d-.0008));
            if(room<=0)continue;
            move[v*3]=-hit.n[0]*room;move[v*3+1]=-hit.n[1]*room;move[v*3+2]=-hit.n[2]*room;size[v]=room;tucked++;
        }
        if(!tucked)return 0;
        soften(laid.index,n,move,size);
        for(let i=0;i<P.length;i++)P[i]+=move[i];
        return tucked;
    }

    /** Settles `entries` on the finished skin: innermost first, by what each garment is. `bumps`: raised skin details. */
    function settle(entries,skin,triangleNormals,bumps,rankOf,clings,quick=false){
        const bare=Surface(),P=skin.positions,I=skin.index,at=v=>[P[v*3],P[v*3+1],P[v*3+2]];
        for(let t=0;t<I.length;t+=3)bare.add(at(I[t]),at(I[t+1]),at(I[t+2]),false);
        const beneath=[bare];
        // Vertices at one place in pieces of a garment are stitched: they move together, or a seam opens.
        const stitched=list=>{
            const seen=new Map();
            for(const e of list){const P=e.laid.positions;for(let v=0;v<P.length/3;v++){const k=Math.round(P[v*3]*1e5)+':'+Math.round(P[v*3+1]*1e5)+':'+Math.round(P[v*3+2]*1e5);let spot=seen.get(k);if(!spot)seen.set(k,spot=[]);spot.push([P,v]);}}
            return [...seen.values()].filter(spot=>spot.length>1);
        };
        const sew=(seams)=>{
            for(const spot of seams){
                let best=null,most=-1;
                for(const [P,v] of spot){const [o]=[P.__before];const m=Math.hypot(P[v*3]-o[v*3],P[v*3+1]-o[v*3+1],P[v*3+2]-o[v*3+2]);if(m>most){most=m;best=[P[v*3],P[v*3+1],P[v*3+2]];}}
                for(const [P,v] of spot){P[v*3]=best[0];P[v*3+1]=best[1];P[v*3+2]=best[2];}
            }
        };
        const groups=new Map();
        for(const e of entries){const k=e.garment;if(!groups.has(k))groups.set(k,{layer:e.laid.layer??0,rank:rankOf?rankOf(e):0,list:[]});groups.get(k).list.push(e);}
        const report=[],finished=[];
        const order=[...groups.values()].sort((a,b)=>a.rank-b.rank||a.layer-b.layer);
        for(const [turn,group] of order.entries()){
            // Under a coat a point shows through nothing: only what is on top of it tents.
            const over=order.slice(turn+1).flatMap(g=>g.list.map(e=>e.laid)),open=(bumps||[]).filter(b=>!covered(b.at.map((c,k)=>c+b.normal[k]*b.height),b.normal,over,.1));
            let moved=0,deepest=0;
            const seams=group.list.length>1?stitched(group.list):[];
            for(const e of group.list){
                if(seams.length)Object.defineProperty(e.laid.positions,'__before',{value:e.laid.positions.slice(),configurable:true});
                // A hanging skirt is left as it hangs, and a lining stays with its garment: the cloth rig measures both from where they
                // were laid. They still count as surfaces.
                if(e.skirt||e.lining)continue;
                if(open.length&&clings?.(e))tent(e.laid,open,beneath);
                const r=settlePiece(e.laid,beneath,bumps||[],report.length?LAYER_GAP:SKIN_GAP);
                // (`quick`, a catalog picture: skin finer than the cloth's own faces is not looked for.)
                if(!quick)hug(e.laid,[skin.positions,...finished.flatMap(g=>g.list.filter(x=>!x.lining).map(x=>x.laid.positions))],bare,[SKIN_GAP,LAYER_GAP],skin.normals);
                moved+=r.moved;deepest=Math.min(deepest,r.deepest);
            }
            if(seams.length)sew(seams);
            if(triangleNormals)for(const e of group.list)e.laid.normals=triangleNormals(e.laid.positions,e.laid.index);
            // This layer alone, to press what it covers under it.
            const own=Surface();
            for(const e of group.list)addLaid(own,bare,e.laid);
            beneath.push(own);
            let tucked=0;
            for(const done of finished)for(const e of done.list){const k=tuck(e.laid,own,bare,TUCK_GAP);if(k&&triangleNormals)e.laid.normals=triangleNormals(e.laid.positions,e.laid.index);tucked+=k;}
            finished.push(group);
            report.push({garment:group.list[0].garment,moved,deepest,tucked});
        }
        // Tucking is measured against the cloth over it, so skin has the last word once more.
        const hit={d:0,n:null};
        for(const e of entries){
            if(e.skirt||e.lining)continue;
            const Q=e.laid.positions;
            for(let v=0;v<Q.length/3;v++)if(bare.nearest(Q[v*3],Q[v*3+1],Q[v*3+2],hit)&&hit.d<SKIN_GAP&&hit.d>-.028){const k=SKIN_GAP-hit.d;Q[v*3]+=hit.n[0]*k;Q[v*3+1]+=hit.n[1]*k;Q[v*3+2]+=hit.n[2]*k;}
            if(triangleNormals)e.laid.normals=triangleNormals(Q,e.laid.index);
        }
        return report;
    }

    /**
     * Skin kept near every opening. Hidden skin spares the drawing under clothes, but at a neckline or an armhole it left a
     * hollow to look straight through; cloth clears the skin now, so what shows there can simply stay.
     */
    function reveal(hidden,shaped,entries,keep,reach=.022){
        const cell=reach,near=new Set(),cellOf=(x,y,z)=>key(Math.floor(x/cell),Math.floor(y/cell),Math.floor(z/cell));
        for(const e of entries){
            // A skirt's top and the bodice's hem are sewn or lap each other, inside the garment: no opening there to see through.
            if(e.skirt)continue;
            const I=e.laid.index,P=e.laid.positions,edges=new Map(),sewn=entries.some(o=>o.garment===e.garment&&o.skirt);
            let low=Infinity,high=-Infinity;
            if(sewn)for(let i=1;i<P.length;i+=3){low=Math.min(low,P[i]);high=Math.max(high,P[i]);}
            for(let t=0;t<I.length;t+=3)for(let k=0;k<3;k++){const a=I[t+k],b=I[t+(k+1)%3],id=a<b?a*4294967296+b:b*4294967296+a;edges.set(id,(edges.get(id)||0)+1);}
            for(const [id,count] of edges){if(count>1)continue;const v=Math.floor(id/4294967296);if(sewn&&P[v*3+1]<(low+high)/2)continue;for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)near.add(cellOf(P[v*3]+x*cell,P[v*3+1]+y*cell,P[v*3+2]+z*cell));}
        }
        for(const v of [...hidden])if(!keep?.has(v)&&near.has(cellOf(shaped[v*3],shaped[v*3+1],shaped[v*3+2])))hidden.delete(v);
    }

    const api={settle,covered,reveal,Surface};root.RRCharacterFit=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
