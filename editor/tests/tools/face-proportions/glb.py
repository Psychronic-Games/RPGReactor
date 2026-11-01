import json,struct,sys,numpy as np,os
from PIL import Image
T={5120:np.int8,5121:np.uint8,5122:np.int16,5123:np.uint16,5125:np.uint32,5126:np.float32};N={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
def load(p):
    f=open(p,'rb');f.read(12);l,_=struct.unpack('<II',f.read(8));g=json.loads(f.read(l));l2,_=struct.unpack('<II',f.read(8));b=f.read(l2);return g,b
def acc(g,b,i):
    a=g['accessors'][i];v=g['bufferViews'][a['bufferView']];o=v.get('byteOffset',0)+a.get('byteOffset',0);n=N[a['type']];t=T[a['componentType']];s=v.get('byteStride',0) or np.dtype(t).itemsize*n
    arr=np.frombuffer(b,dtype=t,count=(a['count']*s)//np.dtype(t).itemsize,offset=o) if s==np.dtype(t).itemsize*n else None
    if arr is None:
        raw=np.frombuffer(b,dtype=np.uint8,count=a['count']*s,offset=o).reshape(a['count'],s)[:,:np.dtype(t).itemsize*n];arr=raw.tobytes();arr=np.frombuffer(arr,dtype=t)
    return arr.reshape(-1,n) if n>1 else arr
def mat(n):
    if 'matrix' in n:return np.array(n['matrix'],float).reshape(4,4).T
    t=np.array(n.get('translation',[0,0,0]),float);q=n.get('rotation',[0,0,0,1]);s=np.array(n.get('scale',[1,1,1]),float);x,y,z,w=q
    R=np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]]);M=np.eye(4);M[:3,:3]=R*s;M[:3,3]=t;return M
def geom(p):
    g,b=load(p);print(os.path.basename(p),'ext',g.get('extensionsUsed'),'meshes',len(g.get('meshes',[])),'skins',len(g.get('skins',[])))
    V=[];F=[];o=0
    def walk(i,P):
        nonlocal o
        n=g['nodes'][i];M=P@mat(n)
        if 'mesh' in n:
            for pr in g['meshes'][n['mesh']]['primitives']:
                if 'POSITION' not in pr['attributes'] or pr.get('extensions'):continue
                v=acc(g,b,pr['attributes']['POSITION']).astype(float);v=(M[:3,:3]@v.T).T+M[:3,3]
                f=acc(g,b,pr['indices']).astype(np.int64).reshape(-1,3) if 'indices' in pr else np.arange(len(v)).reshape(-1,3)
                V.append(v);F.append(f+o);o+=len(v)
        for c in n.get('children',[]):walk(c,M)
    for r in g['scenes'][g.get('scene',0)]['nodes']:walk(r,np.eye(4))
    return np.vstack(V),np.vstack(F)
def shade(V,F,u,v,w,size=420,span=None,c=None):
    fn=np.cross(V[F[:,1]]-V[F[:,0]],V[F[:,2]]-V[F[:,0]]);N_=np.zeros_like(V);
    for k in range(3):np.add.at(N_,F[:,k],fn)
    N_/=np.linalg.norm(N_,axis=1,keepdims=True)+1e-12
    x=V@u;y=V@v;z=V@w
    if span is None:span=max(np.ptp(x),np.ptp(y))
    cx=(x.max()+x.min())/2 if c is None else c[0];cy=(y.max()+y.min())/2 if c is None else c[1]
    # densify: triangles centroids plus vertices
    cent=V[F].mean(1);cn=fn/(np.linalg.norm(fn,axis=1,keepdims=True)+1e-12)
    X=np.r_[x,cent@u];Y=np.r_[y,cent@v];Z=np.r_[z,cent@w];Nn=np.r_[N_,cn]
    px=((X-cx)/span*size*.95+size/2).astype(int);py=(size/2-(Y-cy)/span*size*.95).astype(int)
    ok=(px>=0)&(px<size)&(py>=0)&(py<size);o=np.argsort(Z[ok]);px,py,Nn2=px[ok][o],py[ok][o],Nn[ok][o]
    L=np.array([.35,.5,.8]);L/=np.linalg.norm(L);lam=np.clip(Nn2@(L[0]*u+L[1]*v+L[2]*w),0,1)
    im=np.zeros((size,size));im[py,px]=.18+.82*lam
    from PIL import ImageFilter
    return Image.fromarray((im*255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))
if __name__=='__main__':
    D=sys.argv[1];out=sys.argv[2];rows=[]
    for f in sorted(os.listdir(D)):
        V,F=geom(os.path.join(D,f));print(' verts',len(V),'tris',len(F),'bbox',np.round(V.min(0),3),np.round(V.max(0),3))
        np.savez_compressed(os.path.join(out,f+'.npz'),V=V.astype(np.float32),F=F)
        ext=np.ptp(V,axis=0);up=int(np.argmax(ext)) if ext.max()>1.5*np.median(ext) else 1
        u=np.eye(3)
        imgs=[]
        axes=[0,1,2];axes.remove(up);a,b=axes
        vv=u[up]
        for w_,w in [('+a',u[a]),('-a',-u[a]),('+b',u[b]),('-b',-u[b])]:
            uu=np.cross(vv,w);imgs.append(shade(V,F,uu,vv,w,size=300))
        o=Image.new('L',(1200,300));[o.paste(m,(i*300,0)) for i,m in enumerate(imgs)];rows.append(o)
    o=Image.new('L',(1200,300*len(rows)));[o.paste(m,(0,i*300)) for i,m in enumerate(rows)];o.save(os.path.join(out,'all.png'))
