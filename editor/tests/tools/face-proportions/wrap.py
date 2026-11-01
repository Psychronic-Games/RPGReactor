import sys,json;S=sys.argv[1];import numpy as np,warnings
warnings.filterwarnings('ignore')
L={ # mid, eyeY, eyeCx, wingx,wingy, mouthx,mouthy, tipy,suby,liptop,lipbot,chin, faceAtMouth, jawHalf
'ours_F':(256,180,58,25,258,46,308,240,262,296,328,378,88,62),'ours_M':(256,206,55,25,273,47,326,265,283,318,348,413,102,75),
'chun-li_st':(261,175,67.5,27,252,44,304,240,262,290,322,362,84,60),'female_elf':(258,235,75,33,320,48,368,300,327,355,385,442,86,58),'woman_head':(230,243,78,30,326,50,388,318,336,378,408,473,100,76),
'reality_sc':(258,227,76.5,42,320,60,380,305,335,372,400,478,112,76),'male_offic':(256,182,62.5,41,262,51,310,250,272,300,325,382,94,70),'male_head_':(264,235,77,50,330,65,410,318,345,392,442,506,116,84)}
def pts(k):
    m,ye,ex,wx,wy,mx,my,yt,ys,lt,lb,yc,fm,fj=L[k];D=float(yc-ye)
    out=[]
    for s in (-1,1):out+= [(s*ex,ye),(s*wx,wy),(s*mx,my),(s*fm,my),(s*fj,(my+yc)/2),(s*ex*1.05,ye-.5*D),(s*ex*1.9,ye)]
    out+=[(0,yt),(0,ys),(0,lt),(0,my),(0,lb),(0,yc),(0,ye-.6*D)]
    p=np.array(out,float);p[:,1]-=ye;return p/D   # origin: between the eyes; unit: eyes to chin
def tps(src,dst):
    K=lambda a,b:(lambda r:np.where(r>0,r*r*np.log(r+1e-12),0))(np.linalg.norm(a[:,None]-b[None],axis=2))
    n=len(src);A=np.zeros((n+3,n+3));A[:n,:n]=K(src,src)+1e-5*np.eye(n);Pm=np.c_[np.ones(n),src];A[:n,n:]=Pm;A[n:,:n]=Pm.T
    c=np.linalg.solve(A,np.r_[dst,np.zeros((3,2))])
    return lambda q:K(q,src)@c[:n]+np.c_[np.ones(len(q)),q]@c[n:]
def blur(z,r=2):
    k=np.ones(2*r+1)/(2*r+1);m=np.isfinite(z).astype(float);a=np.nan_to_num(z)
    for ax in (0,1):a=np.apply_along_axis(lambda v:np.convolve(v,k,'same'),ax,a);m=np.apply_along_axis(lambda v:np.convolve(v,k,'same'),ax,m)
    return np.where(m>.6,a/np.maximum(m,1e-6),np.nan)
def sampler(k):
    d=np.load(S+'/refs/dm_'+k+'.npz');z=blur(d['z']);sc=float(d['sc']);l=L[k];D=float(l[11]-l[1]);tip=np.nanmax(z[int(l[7])-3:int(l[7])+4,int(l[0])-3:int(l[0])+4])
    def at(q):
        x=q[:,0]*D+l[0];y=q[:,1]*D+l[1];xi=np.clip(x,0,510);yi=np.clip(y,0,509);i=xi.astype(int);j=yi.astype(int);fx=xi-i;fy=yi-j
        return (z[j,i]*(1-fx)*(1-fy)+z[j,i+1]*fx*(1-fy)+z[j+1,i]*(1-fx)*fy+z[j+1,i+1]*fx*fy-tip)/(D/sc)
    return at
sets={'F':['chun-li_st','female_elf','woman_head'],'M':['reality_sc','male_offic','male_head_']}
out={}
for tag in 'FM':
    R=json.load(open(S+'/refs/raw_'+tag+'.json'));P=np.array(R['P']).reshape(-1,3);w=np.array(R['w']);eye=np.array(R['eye']);n=R['n'];tri=np.array(R['tri']).reshape(-1,3)
    dm=np.load(S+'/refs/dm_ours_'+('femal' if tag=='F' else 'male')+'.npz');box=dm['box'];sc=float(dm['sc']);l=L['ours_'+tag];D=float(l[11]-l[1]);Dw=D/sc
    # ours: world to landmark space
    xo=(box[0]+l[0]/sc);yeo=box[3]-l[1]/sc
    q=np.c_[(P[:,0]-xo)/Dw,(yeo-P[:,1])/Dw]
    tipz=P[np.argmin(np.hypot(q[:,0],q[:,1]-(l[7]-l[1])/D)+(-P[:,2]+P[:,2].max())*0+1e3*(w<.5)),2]
    so=pts('ours_'+tag);refs=sets[tag];ps=[pts(k) for k in refs];mean=np.mean(ps,axis=0);mean[:,0]=(mean[:,0]-mean[::-1,0]*0)
    # symmetric landmarks by construction
    tomean=tps(so,mean)(q);d_xy=tomean-q
    Z=[]
    u=q[:,0];v=q[:,1];zo=(P[:,2]-tipz)/Dw
    front=(w>.1)&(zo>-1.0)
    core=front&(np.abs(u)<.42)&(v>-.35)&(v<1.0)
    for k,p in zip(refs,ps):
        at=sampler(k);zr=np.full(len(q),np.nan);zr[front]=at(tps(so,p)(q[front]))
        A=np.c_[np.ones(core.sum()),v[core]];ok=np.isfinite(zr[core]);c=np.linalg.lstsq(A[ok],(zo[core]-zr[core])[ok],rcond=None)[0];zr=zr+c[0]+c[1]*v;Z.append(zr)
    zt=np.nanmedian(np.stack(Z),axis=0) if len(Z)>2 else np.nanmean(np.stack(Z),axis=0)
    dz=zt-zo;bad=~np.isfinite(dz)|(np.abs(dz)>.14)
    # Only skin you can see from the front takes the surface. The mouth's inside and anything turned aside would be dragged out to it.
    fn=np.cross(P[tri[:,1]]-P[tri[:,0]],P[tri[:,2]]-P[tri[:,0]]);Nv=np.zeros_like(P)
    for c_ in range(3):np.add.at(Nv,tri[:,c_],fn)
    Nv/=np.linalg.norm(Nv,axis=1,keepdims=True)+1e-12
    zm=dm['z'];px=np.clip(((P[:,0]-box[0])*sc).astype(int),0,510);py=np.clip(((box[3]-P[:,1])*sc).astype(int),0,509)
    seen=(np.abs(np.nan_to_num(zm[py,px],nan=-9)-P[:,2])<.02*Dw)&(Nv[:,2]>.05)
    good=front&seen&~bad
    gu=np.clip(((u+1)/2*63).astype(int),0,63);gv=np.clip(((v+.8)/2.2*87).astype(int),0,87);G=np.zeros((88,64));Gw=np.zeros((88,64))
    np.add.at(G,(gv[good],gu[good]),dz[good]);np.add.at(Gw,(gv[good],gu[good]),1)
    k=np.exp(-.5*(np.arange(-6,7)/2.2)**2);k/=k.sum()
    for ax in (0,1):
        G=np.apply_along_axis(lambda m:np.convolve(m,k,'same'),ax,G);Gw=np.apply_along_axis(lambda m:np.convolve(m,k,'same'),ax,Gw)
    Gs=G/np.maximum(Gw,1e-4);dz=np.where(good,dz,Gs[gv,gu])
    # The broad part of the move, spread far: left to stop at the face's edge it stood as a ledge at the cheek and under the chin.
    k2=np.exp(-.5*(np.arange(-24,25)/8.)**2);k2/=k2.sum();Gb=G.copy();Wb=Gw.copy()
    for ax in (0,1):
        Gb=np.apply_along_axis(lambda m:np.convolve(np.pad(m,24,mode='edge'),k2,'valid'),ax,Gb);Wb=np.apply_along_axis(lambda m:np.convolve(np.pad(m,24,mode='edge'),k2,'valid'),ax,Wb)
    low=(Gb/np.maximum(Wb,1e-4))[gv,gu]
    cy=.5;e=np.hypot(u/.62,(v-cy)/.82);sm=lambda a,b,x:(lambda t:t*t*(3-2*t))(np.clip((x-a)/(b-a),0,1))
    wz=(1-sm(.62,.9,e))*sm(-.42,-.2,v)*front*sm(.25,.7,Nv[:,2]+(~seen)*1.0)*(1-sm(.82,1.0,v));wxy=(1-sm(.9,1.25,e))*(w>.05)*(zo>-1.3)
    wlow=(1-sm(1.0,1.5,e))*sm(-.5,-.2,v)*(w>.02)*sm(-1.5,-1.1,zo)
    D3=np.c_[d_xy[:,0]*wxy,d_xy[:,1]*wxy,low*wlow+(dz-low)*wz]
    # the eyes move whole with their lids
    for side in (1,-1):
        own=eye[P[eye,0]*side>0];c=P[own].mean(0);r=np.linalg.norm(P[own]-c,axis=1).max();ci=np.argmin(np.hypot(P[:,0]-c[0],P[:,1]-c[1])+1e3*(w<.5)+1e3*(P[:,0]*side<0)+1e3*np.isin(np.arange(n),eye))
        ring=np.where((w>.3)&(np.abs(np.hypot(P[:,0]-c[0],P[:,1]-c[1])-1.5*r)<.3*r)&(P[:,2]>c[2]-r))[0]
        de=D3[ring].mean(0);de[2]=np.median(D3[ring,2])
        dist=np.hypot(P[:,0]-c[0],P[:,1]-c[1]);hold=1-sm(1.6*r,3*r,dist);hold=hold*(P[:,2]>c[2]-2.5*r)
        D3=D3+(de-D3)*hold[:,None];D3[own]=de
    # eased over the skin
    nb=[[] for _ in range(n)]
    for a,b,c_ in tri:nb[a]+=[b,c_];nb[b]+=[a,c_];nb[c_]+=[a,b]
    idx=np.where(np.abs(D3).sum(1)>1e-5)[0];ey=set(eye.tolist())
    for _ in range(3):
        N=D3.copy()
        for i in idx:
            if nb[i] and i not in ey:N[i]=.5*D3[i]+.5*D3[nb[i]].mean(0)
        D3=N
    print(tag,'moved',len(idx),'rms xy',round(float(np.sqrt((D3[idx,:2]**2).mean())),3),'z',round(float(np.sqrt((D3[idx,2]**2).mean())),3),'max',np.round(np.abs(D3).max(0),3))
    out[tag]=dict(ids=idx.tolist(),d=np.round(D3[idx].ravel(),4).tolist())
txt="""/**
 * The human face's form: each vertex's move, per sex, onto the averaged surface of reference heads (eyes to chin is 1; x, y up... see faceField).
 * Generated by tests/tools/face-proportions/wrap.py from hand-placed landmarks. An average of several heads, so it follows none of them.
 */
(function (root) {
    const data = """+json.dumps(out,separators=(',',':'))+""";
    root.RR_FACE_FIELD = data;
    if (typeof module !== 'undefined' && module.exports) module.exports = data;
})(typeof window !== 'undefined' ? window : globalThis);
"""
open(sys.argv[2],'w').write(txt);print(len(txt)//1024,'KB')
