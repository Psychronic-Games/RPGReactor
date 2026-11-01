import sys,os,numpy as np
sys.path.insert(0,sys.argv[1]);import glb
D,S=sys.argv[2],sys.argv[3]
from PIL import Image
sheet=[]
for f in sorted(x for x in os.listdir(D) if x.endswith('.glb')):
    try:
        V,F=glb.geom(os.path.join(D,f))
    except Exception as e:
        print('FAIL',f,repr(e)[:100]);continue
    np.savez(os.path.join(S,f+'.npz'),V=V.astype(np.float32),F=F.astype(np.int32))
    ext=np.ptp(V,axis=0);print(' ',f[:34].ljust(34),'v',len(V),'f',len(F),'ext',np.round(ext,3),flush=True)
    idx=np.random.default_rng(1).choice(len(V),min(len(V),60000),replace=False);P=V[idx]
    tiles=[]
    for a,b in [(0,1),(2,1)]:
        im=np.zeros((300,300),np.uint8);r=ext.max();x=((P[:,a]-(P[:,a].max()+P[:,a].min())/2)/r*280+150).astype(int);y=(150-(P[:,b]-(P[:,b].max()+P[:,b].min())/2)/r*280).astype(int);ok=(x>=0)&(x<300)&(y>=0)&(y<300);im[y[ok],x[ok]]=255;tiles.append(im)
    sheet.append(np.hstack(tiles))
n=len(sheet);cols=3;rows=(n+cols-1)//cols;canvas=np.zeros((rows*300,cols*600),np.uint8)
for i,t in enumerate(sheet):canvas[(i//cols)*300:(i//cols+1)*300,(i%cols)*600:(i%cols+1)*600]=t
Image.fromarray(canvas).save(os.path.join(S,'sheet.png'))
