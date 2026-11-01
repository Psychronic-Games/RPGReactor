import sys,json;import numpy as np
from PIL import Image
S=sys.argv[1];s=open(sys.argv[2]).read();d=json.loads(s[s.index('const data = ')+13:s.index(';\n    root.RR_HEAD')])
R={};ims=[]
for t in 'FM':
    x=d[t]
    r=json.load(open(S+'/refs/final_'+t+'.json'));V=np.array(r['P']).reshape(-1,3);eye=np.array(r['eye']);w=np.array(r['w'])
    y0=V[eye,1].mean();mid=(np.abs(V[:,0])<.012)&(V[:,1]<y0)&(V[:,1]>y0-.13)&(V[:,2]>0);tip=V[mid,2].max();chin=np.where((np.abs(V[:,0])<.012)&(V[:,2]>.02)&(w>.3),V[:,1],9).min();E=y0-chin
    O=np.c_[V[:,0]/E,(y0-V[:,1])/E,(V[:,2]-tip)/E];K=4
    b=np.array(x['bind']).reshape(-1,K);wt=np.array(x['w']).reshape(-1,K);wt=wt/wt.sum(1,keepdims=True);Q=(O[b]*wt[...,None]).sum(1)+np.array(x['off']).reshape(-1,3)
    I=np.array(x['index']).reshape(-1,3)
    xs=np.arange(-.34,.3401,.003);ys=np.arange(.42,.9,.003);Z=np.full((len(ys),len(xs)),np.nan)
    for tri in Q[I]:
        if tri[:,2].min()<-.6 or tri[:,1].max()<.4 or tri[:,1].min()>.92 or np.abs(tri[:,0]).min()>.36:continue
        a,b_,c=tri;x0,x1=tri[:,0].min(),tri[:,0].max();y_0,y_1=tri[:,1].min(),tri[:,1].max()
        i0=max(0,int((x0+.34)/.003));i1=min(len(xs)-1,int((x1+.34)/.003)+1);j0=max(0,int((y_0-.42)/.003));j1=min(len(ys)-1,int((y_1-.42)/.003)+1)
        de=(b_[1]-c[1])*(a[0]-c[0])+(c[0]-b_[0])*(a[1]-c[1])
        if abs(de)<1e-9:continue
        for j in range(j0,j1+1):
            for i in range(i0,i1+1):
                l=((b_[1]-c[1])*(xs[i]-c[0])+(c[0]-b_[0])*(ys[j]-c[1]))/de;m=((c[1]-a[1])*(xs[i]-c[0])+(a[0]-c[0])*(ys[j]-c[1]))/de;n=1-l-m
                if min(l,m,n)>=-1e-6:
                    zz=l*a[2]+m*b_[2]+n*c[2]
                    if not Z[j,i]>=zz:Z[j,i]=zz
    Z=np.where(np.isnan(Z),-1.5,Z);np.save(S+'/refs/lipz_'+t+'.npy',Z)
    # shaded view
    gy,gx=np.gradient(Z,.003);sh=1/np.sqrt(1+gx**2+gy**2)*(1-.5*gy+.3*gx);im=Image.fromarray(np.clip(sh*180,0,255).astype('uint8')).resize((len(xs)*4,len(ys)*4));
    from PIL import ImageDraw
    im=im.convert('RGB');dr=ImageDraw.Draw(im);res={}
    zs=Z.copy()
    # column smoothing
    k=np.ones(3)/3
    zs=np.apply_along_axis(lambda a:np.convolve(np.pad(a,1,'edge'),k,'valid'),1,zs)
    line=[];up=[];low=[]
    prev=None
    guess=x['lip']['line']
    ci=np.argsort(np.abs(xs))
    cols={}
    for i in ci:
        ax=abs(xs[i])
        if ax>x['lip']['corner']*1.02:continue
        c0=prev if prev is not None and ax>.01 else guess
        rng=(ys>max(c0-.02,guess-.07))&(ys<min(c0+.02,guess+.05));idx=np.where(rng)[0];c=zs[:,i]
        jm=idx[np.argmin(c[idx])];prev=ys[jm] if prev is None else prev*.6+ys[jm]*.4
        cols[i]=jm
    for i,jm in cols.items():
        c=zs[:,i];cc=np.gradient(np.gradient(c,.003),.003)
        a=np.where((ys<ys[jm]-.018)&(ys>ys[jm]-.13))[0];j_up=a[np.argmax(cc[a])]
        a=np.where((ys>ys[jm]+.018)&(ys<ys[jm]+.15))[0];j_lo=a[np.argmax(cc[a])]
        line.append((xs[i],ys[jm],ys[j_up],ys[j_lo]))
        for q,col in ((jm,(255,255,0)),(j_up,(255,60,60)),(j_lo,(60,255,60))):dr.point((i*4+1,q*4+1),fill=col)
    ims.append(im);L=np.array(sorted(line));res=L
    print(t,'corner',x['lip']['corner'],'center line',L[np.abs(L[:,0])<.02,1].mean().round(3))
    for q in (0,.05,.1,.15,.2):
        m=np.abs(np.abs(L[:,0])-q)<.012;print('  x',q,'line',L[m,1].mean().round(3),'up',L[m,2].mean().round(3),'low',L[m,3].mean().round(3))
W=sum(i.width for i in ims);o=Image.new('RGB',(W,ims[0].height));xx=0
for i in ims:o.paste(i,(xx,0));xx+=i.width
o.save(S+'/lipm.png')
