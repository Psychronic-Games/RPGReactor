import sys,json;S=sys.argv[1];sys.path.insert(0,S);import numpy as np,warnings
warnings.filterwarnings('ignore')
from PIL import Image,ImageDraw
src=open(S+'/drape.py').read();exec(src[src.index('import sys'):src.index('\nout={}')].replace("S=sys.argv[1];sys.path.insert(0,S);",""))
D=sys.argv[2];W,H=300,400;SC=135
def draw(tri,yaw):
    c,s=np.cos(yaw),np.sin(yaw);R=tri.copy();R[...,0]=tri[...,0]*c-tri[...,2]*s;R[...,2]=tri[...,0]*s+tri[...,2]*c
    z=np.full((H,W),-1e9);im=np.zeros((H,W))
    p=np.stack([R[...,0]*SC+W/2,R[...,1]*SC+125,R[...,2]*SC],-1);n=np.cross(p[:,1]-p[:,0],p[:,2]-p[:,0]);n/=np.linalg.norm(n,axis=1,keepdims=True)+1e-9
    n=n*np.sign(n[:,2])[:,None];li=np.array([-.35,-.55,.75]);li/=np.linalg.norm(li);lum=np.clip(.25+.8*(n@li),0,1)
    for t,l in zip(p,lum):
        x0,x1=int(max(0,t[:,0].min())),int(min(W-1,t[:,0].max()+1));y0,y1=int(max(0,t[:,1].min())),int(min(H-1,t[:,1].max()+1))
        if x0>x1 or y0>y1:continue
        X,Y=np.meshgrid(np.arange(x0,x1+1),np.arange(y0,y1+1));a,b,c_=t;de=(b[1]-c_[1])*(a[0]-c_[0])+(c_[0]-b[0])*(a[1]-c_[1])
        if abs(de)<1e-9:continue
        u=((b[1]-c_[1])*(X-c_[0])+(c_[0]-b[0])*(Y-c_[1]))/de;v=((c_[1]-a[1])*(X-c_[0])+(a[0]-c_[0])*(Y-c_[1]))/de;w=1-u-v;m=(u>=-.01)&(v>=-.01)&(w>=-.01);zz=u*a[2]+v*b[2]+w*c_[2]
        cur=z[y0:y1+1,x0:x1+1];m&=zz>cur;cur[m]=zz[m];im[y0:y1+1,x0:x1+1][m]=l
    return Image.fromarray((im*255).astype('uint8')).convert('RGB')
rows=[]
ours=json.load(open(sys.argv[3]))
for tag,f,sk,e,key in (('F','female_elf_head.glb','Face','Eyes','female_elf'),('M','male_head_base.glb','Cabeza','Esclera','male_head_')):
    T,Fc=target(D+'/'+f,sk,e,key);keep=(T[Fc,1].max(1)<1.5);rt=T[Fc[keep]]
    o=ours[tag];t=np.array(o['tris']).reshape(-1,3,3);E={'F':.1137,'M':.1273}[tag];q=np.stack([t[...,0]/E,(o['ey']-t[...,1])/E,t[...,2]/E],-1);q=q[q[...,1].max(1)<1.5];q[...,2]-=q[...,2].max()*1
    fr=q[np.abs(q[...,0]).max(1)<.15];q[...,2]-=fr[...,2].max()-q[...,2].max()*0
    row=[]
    for name,tr in (('REF',rt),('OURS',q)):
        for yaw in (0,.6,1.45):
            im=draw(tr.astype(float),yaw);ImageDraw.Draw(im).text((5,3),tag+' '+name,fill=(255,255,0));row.append(im)
    rows.append(row)
o=Image.new('RGB',(W*6,H*2))
for r,row in enumerate(rows):
    for c,im in enumerate(row):o.paste(im,(c*W,r*H))
o.save(S+'/raster.png')
