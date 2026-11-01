import sys,json,re;S=sys.argv[1];sys.path.insert(0,S);import glb,numpy as np,warnings
warnings.filterwarnings('ignore')
src=open(S+'/wrap.py').read();exec(src[src.index('L={'):src.index('def blur')])
sm=lambda a,b,x:(lambda t:t*t*(3-2*t))(np.clip((x-a)/(b-a),0,1))
def parts(f):
    g,b=glb.load(f);out={}
    def walk(i,P):
        n=g['nodes'][i];M=P@glb.mat(n)
        if 'mesh' in n:
            for pr in g['meshes'][n['mesh']]['primitives']:
                v=glb.acc(g,b,pr['attributes']['POSITION']).astype(float);v=(M[:3,:3]@v.T).T+M[:3,3];F=glb.acc(g,b,pr['indices']).astype(np.int64).reshape(-1,3);name=g['materials'][pr['material']]['name']
                out.setdefault(name,[]).append((v,F))
        for c in n.get('children',[]):walk(c,M)
    for r in g['scenes'][g.get('scene',0)]['nodes']:walk(r,np.eye(4))
    return out
def target(f,skin,eyes,key):
    p=parts(f);V,Fc=p[skin][0];E=np.vstack([v for v,_ in p[eyes]]);l=np.array([E[E[:,0]<np.median(E[:,0])].mean(0),E[E[:,0]>=np.median(E[:,0])].mean(0)])
    d=l[1]-l[0];L_=np.hypot(d[0],d[2]);c,s=d[0]/L_,d[2]/L_;rot=lambda a:np.c_[a[:,0]*c+a[:,2]*s,a[:,1],-a[:,0]*s+a[:,2]*c];V=rot(V);l=rot(l)
    dm=np.load(S+'/refs/dm_'+key+'.npz');sc=float(dm['sc']);k=L[key];Dw=float(k[11]-k[1])/sc;xm=l[:,0].mean();ye=l[:,1].mean()
    mid=(np.abs(V[:,0]-xm)<.02*Dw/.09)&(V[:,1]<ye)&(V[:,1]>ye-Dw*.7);tip=V[mid,2].max()
    q=np.c_[(V[:,0]-xm)/Dw,(ye-V[:,1])/Dw,(V[:,2]-tip)/Dw];global EYES;EYES=np.c_[(l[:,0]-xm)/Dw,(ye-l[:,1])/Dw,(l[:,2]-tip)/Dw];print(key,'Dw',round(Dw,4),'eye half',round(float(d[0]/2/Dw),3),'tip v',round(float(q[mid][np.argmax(q[mid,2]),1]),3));return q,Fc
def dense(Q,Fc):
    n=np.cross(Q[Fc[:,1]]-Q[Fc[:,0]],Q[Fc[:,2]]-Q[Fc[:,0]]);a=np.linalg.norm(n,axis=1,keepdims=True);n=n/(a+1e-12)
    N=np.zeros_like(Q)
    for k in range(3):np.add.at(N,Fc[:,k],n*a)
    N/=np.linalg.norm(N,axis=1,keepdims=True)+1e-12
    pts=[Q,Q[Fc].mean(1)];nor=[N,N[Fc].mean(1)]
    for a_,b_ in ((0,1),(1,2),(2,0)):pts.append((Q[Fc[:,a_]]+Q[Fc[:,b_]])/2);nor.append((N[Fc[:,a_]]+N[Fc[:,b_]])/2)
    return np.vstack(pts),np.vstack(nor)
def nearest(q,T,chunk=300):
    idx=np.zeros(len(q),int);dd=np.zeros(len(q))
    for i in range(0,len(q),chunk):
        d=((q[i:i+chunk,None]-T[None])**2).sum(2);j=d.argmin(1);idx[i:i+chunk]=j;dd[i:i+chunk]=np.sqrt(d[np.arange(len(j)),j])
    return idx,dd
out={}
for tag,f,skin,eyes,key,refs in (('F',sys.argv[3]+'/female_elf_head.glb','Face','Eyes','female_elf',['chun-li_st','female_elf','woman_head']),('M',sys.argv[3]+'/male_head_base.glb','Cabeza','Esclera','male_head_',['reality_sc','male_offic','male_head_'])):
    R=json.load(open(S+'/refs/raw_'+tag+'.json'));P=np.array(R['P']).reshape(-1,3);w=np.array(R['w']);eye=np.array(R['eye']);n=R['n'];tri=np.array(R['tri']).reshape(-1,3)
    dm=np.load(S+'/refs/dm_ours_'+('femal' if tag=='F' else 'male')+'.npz');box=dm['box'];sc=float(dm['sc']);l=L['ours_'+tag];Dw=float(l[11]-l[1])/sc
    ec=P[eye];xo=0.;yeo=ec[:,1].mean()
    fn=np.cross(P[tri[:,1]]-P[tri[:,0]],P[tri[:,2]]-P[tri[:,0]]);Nv=np.zeros_like(P)
    for k in range(3):np.add.at(Nv,tri[:,k],fn)
    Nv/=np.linalg.norm(Nv,axis=1,keepdims=True)+1e-12
    u=(P[:,0]-xo)/Dw;v=(yeo-P[:,1])/Dw
    tipi=np.argmax(np.where((w>.5)&(np.abs(u)<.1)&(v>0)&(v<.7),P[:,2],-9));z=(P[:,2]-P[tipi,2])/Dw
    q=np.c_[u,v,z];mean=pts(key);so=pts('ours_'+tag)   # our own proportions: halfway to the average of several heads
    so[:,1]+=(l[1]-(box[3]-yeo)*sc)/(l[11]-l[1])*-1 if False else 0
    T,Fc=target(f,skin,eyes,key);st=pts(key)
    warp=tps(st,mean);T[:,:2]=warp(T[:,:2]);EYES[:,:2]=warp(EYES[:,:2]);Td,Tn=dense(T,Fc)
    o=np.c_[tps(so,mean)(q[:,:2]),q[:,2]];start=q.copy()
    e=np.hypot(o[:,0]/.82,(o[:,1]-.3)/1.0);active=(w>.02)&(e<1.15)&(o[:,2]>-1.25)
    A=np.where(active)[0];front=Nv[:,2]>-.1
    # Skin seen from the front: not the mouth's inside, not under the jaw. Hidden skin follows its neighbors.
    zm=np.nan_to_num(dm['z'],nan=-9);H_,W_=zm.shape;zmax=zm.copy()
    for dy in (-1,0,1):
        for dx in (-1,0,1):zmax=np.maximum(zmax,np.roll(np.roll(zm,dy,0),dx,1))
    px=np.clip(((P[:,0]-box[0])*sc).astype(int),0,W_-1);py=np.clip(((box[3]-P[:,1])*sc).astype(int),0,H_-1);seen=P[:,2]>zmax[py,px]-.09*Dw
    front=front&seen&(Nv[:,1]>-.85)
    nb=[[] for _ in range(n)]
    for a,b,c_ in tri:nb[a]+=[b,c_];nb[b]+=[a,c_];nb[c_]+=[a,b]
    nb=[np.array(sorted(set(x)),int) for x in nb];D=np.zeros((n,3))
    ey=np.zeros(n,bool);ey[eye]=True
    for it,(passes,gain) in enumerate(((30,.7),(20,.8),(12,.9),(6,1),(3,1),(1,1),(1,1),(0,1))):
        cur=o+D;idx,dist=nearest(cur[A],Td);tp=Td[idx];tn=Tn[idx]
        if it==0:print(tag,'dist p50',round(float(np.median(dist)),3),'dot mean',round(float((tn*Nv[A]).sum(1).mean()),3))
        tn=tn*np.sign((tn*Nv[A]).sum(1))[:,None]
        along=((tp-cur[A])*tn).sum(1);ok=(dist<.3)&((tn*Nv[A]).sum(1)>.25)&front[A]&~ey[A]&(np.abs(P[A,2]-0)>=0)
        d=np.zeros((n,3));m=np.zeros(n);ai=A[ok];d[ai]=tn[ok]*along[ok,None]*gain+(tp[ok]-cur[ai])*(.25*gain);m[ai]=1
        for _ in range(passes):
            nd=d.copy();nm=m.copy()
            for i in A:
                if len(nb[i]):
                    c_=m[nb[i]].sum()
                    if c_>0:
                        keep=m[i]*1.0;nd[i]=(d[i]*keep*1+(d[nb[i]]*m[nb[i],None]).sum(0))/(keep+c_);nm[i]=max(m[i],min(1,c_/len(nb[i])))
            d=nd;m=nm
        D+=d;print(tag,'iter',it,'ok',int(ok.sum()),'of',len(A),'mean |gap|',round(float(np.abs(along[ok]).mean()),4),flush=True)
    final=o+D;mask=1-sm(.92,1.12,np.hypot(final[:,0]/.82,(final[:,1]-.3)/1.0));mask=mask*(w>.02)*sm(-1.25,-1.0,final[:,2])
    for _ in range(14):
        nm=mask.copy()
        for i in np.where((mask>0)|(w>.02))[0]:
            if len(nb[i]):nm[i]=.5*mask[i]+.5*mask[nb[i]].mean()
        mask=nm
    D3=(final-start)*mask[:,None]
    # The jaw's edge and under it: hidden skin only follows here, and the outline came out jagged. Evened out along the skin.
    band=np.where((start[:,1]>.98)&(start[:,1]<1.5)&(mask>.01)&(np.abs(start[:,0])<1.1))[0]
    for _ in range(10):
        nD=D3.copy()
        for i in band:
            if len(nb[i]):nD[i]=.35*D3[i]+.65*D3[nb[i]].mean(0)
        D3=nD
    # each eye moves whole, with its lids
    for side in (1,-1):
        own=eye[P[eye,0]*side>0];c=P[own].mean(0);r=np.linalg.norm(P[own]-c,axis=1).max();dist=np.hypot(P[:,0]-c[0],P[:,1]-c[1])
        ring=np.where((w>.3)&(np.abs(dist-1.6*r)<.25*r)&(P[:,2]>c[2]-r)&~ey)[0];de=np.median(D3[ring],axis=0);hold=(1-sm(1.05*r,1.5*r,dist))*(P[:,2]>c[2]-2.5*r)
        D3=D3+(de-D3)*hold[:,None]
        # The eye sits in the reference's socket, a little back so the lids close over it.
        eyeAt=EYES[0 if side<0 else 1].copy();eyeAt[0]=side*abs(EYES[:,0]).mean();eyeAt[2]-=.012
        D3[own]=eyeAt-start[own].mean(0)
    # both sides alike
    rows={}
    for i in np.where(np.abs(D3).sum(1)>1e-5)[0]:rows[i]=1
    L_=np.where(P[:,0]>1e-4)[0];Rr=np.where(P[:,0]<-1e-4)[0];mir=P[Rr]*[-1,1,1];j,dd=nearest(P[L_],mir)
    for a,b_,dv in zip(L_,Rr[j],dd):
        if dv<.002:
            av=(D3[a]*[1,1,1]+D3[b_]*[-1,1,1])/2;D3[a]=av;D3[b_]=av*[-1,1,1]
    D3[np.abs(P[:,0])<1e-4,0]=0
    idx=np.where(np.abs(D3).sum(1)>1e-5)[0];print(tag,'moved',len(idx),'max',np.round(np.abs(D3).max(0),3));out[tag]=dict(ids=idx.tolist(),d=np.round(D3[idx].ravel(),4).tolist())
txt="""/**
 * The human face's form: each vertex's move, per sex, draped onto a sculpted head's surface after that head's proportions were moved to the average of
 * several heads (eyes to chin is 1). Base heads, both CC-BY 4.0: "male head base" by alkalor and "female elf head" by Scol3D (Sketchfab).
 * Generated by tests/tools/face-proportions/drape.py.
 */
(function (root) {
    const data = """+json.dumps(out,separators=(',',':'))+""";
    root.RR_FACE_FIELD = data;
    if (typeof module !== 'undefined' && module.exports) module.exports = data;
})(typeof window !== 'undefined' ? window : globalThis);
"""
open(sys.argv[2],'w').write(txt);print(len(txt)//1024,'KB')
