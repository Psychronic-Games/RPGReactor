import sys;S=sys.argv[1];sys.path.insert(0,S);import face,numpy as np,json,warnings
warnings.filterwarnings('ignore')
from PIL import Image
def G(a,s):
    sy,sx=(s if isinstance(s,tuple) else (s,s));o=a.astype(float)
    for ax,sg in ((0,sy),(1,sx)):
        if sg<=0:continue
        r=int(3*sg);k=np.exp(-.5*(np.arange(-r,r+1)/sg)**2);k/=k.sum();o=np.apply_along_axis(lambda m:np.convolve(np.pad(m,r,mode='edge'),k,mode='valid'),ax,o)
    return o
GU=np.linspace(-.9,.9,73);GV=np.linspace(-1.25,1.2,99)   # units: nose tip to chin; origin nose tip
def ours(p):
    b=open(p,'rb').read();nv,nf=np.frombuffer(b,np.uint32,2);V=np.frombuffer(b,np.float32,nv*3,8).reshape(-1,3).astype(float);F=np.frombuffer(b,np.uint32,nf*3,8+nv*12).reshape(-1,3).astype(np.int64);return V,F
def norm(V,F,off,sp,size=320):
    ey=np.ptp(V[:,1]);top=V[:,1].max()-off*ey;span=sp*ey;c=np.median(V[V[:,1]>top-span,0]);z,sc=face.depth(V,F,(c-span*.62,c+span*.62,top-span,top),size)
    H,W=z.shape;Z=np.where(np.isfinite(z),z,np.nan);q=Z[int(.3*H):int(.85*H),int(.3*W):int(.7*W)];iy,ix=np.unravel_index(np.nanargmax(q),q.shape);iy+=int(.3*H);ix+=int(.3*W)
    best=ix;b0=1e18
    for k in range(ix-8,ix+9):
        n=min(k,W-1-k,int(.2*W));y0=max(0,iy-int(.15*H));y1=iy+int(.12*H);L=Z[y0:y1,k-n:k][:,::-1];R=Z[y0:y1,k+1:k+1+n];m=min(L.shape[1],R.shape[1]);v=np.nanmean(np.abs(L[:,:m]-R[:,:m]))
        if v<b0:b0=v;best=k
    cx=best;prof=np.nanmean(Z[:,cx-1:cx+2],axis=1);ys=np.where(np.isfinite(prof))[0];prof=face.smooth1(np.interp(np.arange(H),ys,prof[ys]),5)
    def nmax(i):
        while i+1<H and prof[i+1]>=prof[i]:i+=1
        return i
    def nmin(i):
        while i+1<H and prof[i+1]<=prof[i]:i+=1
        return i
    sub=nmin(iy+1);ul=nmax(sub);st=nmin(ul);ll=nmax(st);lm=nmin(ll);po=nmax(lm);me=po;drop=prof[iy]-prof[sub]
    while me+1<H and prof[me+1]>prof[po]-drop:me+=1
    E=float(me-iy);rng=np.arange(int(iy-1.0*E),int(iy-.4*E));na=rng[np.argmin(prof[rng])]
    X,Y=np.meshgrid(np.clip(cx+GU*E,0,W-1.001),np.clip(iy+GV*E,0,H-1.001));x0=X.astype(int);y0=Y.astype(int);fx=X-x0;fy=Y-y0
    g=Z[y0,x0]*(1-fx)*(1-fy)+Z[y0,x0+1]*fx*(1-fy)+Z[y0+1,x0]*(1-fx)*fy+Z[y0+1,x0+1]*fx*fy
    g=(g-prof[iy])*sc/E;g=np.nanmean(np.stack([g,g[:,::-1]]),axis=0)
    return g,dict(na=(na-iy)/E,sub=(sub-iy)/E,st=(st-iy)/E,lm=(lm-iy)/E),E/sc
def align(t,o,lm):
    u,v=np.meshgrid(GU,GV);m=np.isfinite(t)&np.isfinite(o)&(np.abs(u)<.45)&(v>-.9)&(v<1);A=np.stack([np.ones(m.sum()),v[m]],1);c=np.linalg.lstsq(A,(o-t)[m],rcond=None)[0];return t+c[0]+c[1]*v
R=S+'/refs/std/';sets={'F':(('chun-li_street_fighter_6_nsfw',.03,.15),('female_elf_head',0,.9)),'M':(('male_head_base',0,.9),('male_officer',0,.17),('reality_scan_3d_male_character',0,.145))}
res={};pics=[]
for tag,refs,o in (('F',sets['F'],'ours_female'),('M',sets['M'],'ours_male')):
    V,F=ours(S+'/refs/'+o+'.bin');O,lo,Es=norm(V,F,0,.155);print(tag,'ours',{k:round(v,3) for k,v in lo.items()},'E m',round(Es,4))
    Ts=[];Ls=[]
    for n,a,b in refs:
        d=np.load(R+n+'.glb.npz');T,l,_=norm(d['V'].astype(float),d['F'].astype(np.int64),a,b);print('  ',n[:18],{k:round(v,3) for k,v in l.items()});Ts.append((T,l));Ls.append(l)
    avg={k:float(np.mean([l[k] for l in Ls])) for k in lo}
    if tag=='F':
        lo=dict(lo);lo['na']=-.8;lo['lm']=.7
        for T_,l in Ts:
            for k in lo:l[k]=lo[k]
        avg=dict(lo)   # the female landmarks were not reliable: compare row for row, no warp
    else:
        for T_,l in Ts:l['na']=-.8
        lo=dict(lo);lo['na']=-.8;avg['na']=-.8
    knots_o=[-2,lo['na'],0,lo['sub'],lo['st'],lo['lm'],1,2];knots_t=[-2+(avg['na']-lo['na']),avg['na'],0,avg['sub'],avg['st'],avg['lm'],1,2]
    wv=np.interp(GV,knots_o,knots_t)            # ours row v goes to target row wv(v)
    # target surface on ours' rows
    aligned=[]
    for T,l in Ts:
        kt=[-2+(l['na']-avg['na']),l['na'],0,l['sub'],l['st'],l['lm'],1,2];rows=np.interp(wv,knots_t,kt);ri=np.interp(rows,GV,np.arange(len(GV)));i0=np.clip(ri.astype(int),0,len(GV)-2);f=(ri-i0)[:,None];aligned.append(T[i0]*(1-f)+T[i0+1]*f)
    O2=O
    aligned=[align(a,O2,lo) for a in aligned];T=np.nanmean(np.stack(aligned),axis=0)
    D=T-O2;u,v=np.meshgrid(GU,GV);conf=(np.isfinite(D)&(np.abs(D)<(.12 if tag=='F' else .22))&(v>(-.72 if tag=='F' else -1.0))&(v<(.96 if tag=='F' else 1.02))&(np.abs(u)<(.7 if tag=='F' else .82))).astype(float);D0=np.nan_to_num(D)*conf
    sig=2.2;DZ=G(D0,sig)/(G(conf,sig)+1e-3);fade=np.clip(G(conf,3)*1.6,0,1);DZ=DZ*fade
    DZ=DZ-0  # depth correction
    dy=(wv-GV)[:,None]*np.ones_like(u);dy=G(dy,(2,0))*fade
    res[tag]=dict(z=DZ,y=dy);print(tag,'landmarks target',{k:round(v,3) for k,v in avg.items()},'rms dz %',round(float(np.sqrt(np.mean((DZ*fade)**2))*100),2),'max',round(float(np.abs(DZ).max()),3))
    pics.append(np.clip(.5+DZ/.3,0,1))
json.dump(dict(u0=float(GU[0]),u1=float(GU[-1]),v0=float(GV[0]),v1=float(GV[-1]),nu=len(GU),nv=len(GV),F=dict(z=np.round(res['F']['z'].ravel(),4).tolist(),y=np.round(res['F']['y'].ravel(),4).tolist()),M=dict(z=np.round(res['M']['z'].ravel(),4).tolist(),y=np.round(res['M']['y'].ravel(),4).tolist())),open(S+'/refs/field.json','w'))
Image.fromarray((np.hstack(pics)*255).astype(np.uint8)).resize((584,396)).save(S+'/refs/field.png')
