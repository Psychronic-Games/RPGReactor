import numpy as np,os,sys
from PIL import Image,ImageDraw
def depth(V,F,box,size=256):
    x0,x1,y0,y1=box;sc=(size-1)/(x1-x0);H=int((y1-y0)*sc)+1
    X=(V[:,0]-x0)*sc;Y=(y1-V[:,1])*sc;Z=V[:,2]
    T=F[(X[F].max(1)>=0)&(X[F].min(1)<size)&(Y[F].max(1)>=0)&(Y[F].min(1)<H)]
    zb=np.full((H,size),-np.inf)
    # big triangles rasterized, tiny ones splatted
    tx=X[T];ty=Y[T];area=np.abs((tx[:,1]-tx[:,0])*(ty[:,2]-ty[:,0])-(tx[:,2]-tx[:,0])*(ty[:,1]-ty[:,0]))
    for t in T:
        ax,bx,cx=X[t];ay,by,cy=Y[t];az,bz,cz=Z[t]
        lx=max(int(np.floor(min(ax,bx,cx))),0);hx=min(int(np.ceil(max(ax,bx,cx))),size-1);ly=max(int(np.floor(min(ay,by,cy))),0);hy=min(int(np.ceil(max(ay,by,cy))),H-1)
        if hx<lx or hy<ly:continue
        d=(by-cy)*(ax-cx)+(cx-bx)*(ay-cy)
        if abs(d)<1e-9:continue
        gx,gy=np.meshgrid(np.arange(lx,hx+1),np.arange(ly,hy+1))
        l1=((by-cy)*(gx-cx)+(cx-bx)*(gy-cy))/d;l2=((cy-ay)*(gx-cx)+(ax-cx)*(gy-cy))/d;l3=1-l1-l2
        m=(l1>=-.02)&(l2>=-.02)&(l3>=-.02)
        if m.any():
            zz=(l1*az+l2*bz+l3*cz)[m];gxm=gx[m];gym=gy[m];np.maximum.at(zb,(gym,gxm),zz)
    return zb,sc
def smooth1(a,k=3):
    w=np.ones(k)/k;return np.convolve(np.pad(a,k,mode='edge'),w,mode='same')[k:-k]
def landmarks(zb,sc):
    """Everything by row and column of the depth map; returns dict in pixels."""
    H,W=zb.shape;fin=np.isfinite(zb);Z=np.where(fin,zb,np.nan)
    # Nose tip: the most forward point in the middle band
    mid=Z[:,W//4:3*W//4];iy,ix=np.unravel_index(np.nanargmax(mid),mid.shape);ix+=W//4;tip=(ix,iy)
    # Mirror axis near the tip: best left-right match of the face
    best=ix;score=1e18
    for c in range(ix-8,ix+9):
        n=min(c,W-1-c,int(30*sc/sc));s=0;cnt=0
        L=Z[max(0,iy-60):iy+60,c-n:c][:,::-1];R=Z[max(0,iy-60):iy+60,c+1:c+1+n];m=min(L.shape[1],R.shape[1]);d=L[:,:m]-R[:,:m];v=np.nanmean(np.abs(d))
        if v<score:score=v;best=c
    cx=best;prof=np.nanmean(Z[:,cx-1:cx+2],axis=1);ok=np.isfinite(prof);ys=np.where(ok)[0];prof=np.interp(np.arange(H),ys,prof[ys]);prof=smooth1(prof,3)
    # Nasion: deepest point above the tip, in the upper part of the nose
    up=np.arange(max(0,iy-int(.42*(iy))),iy-3)
    span=iy; 
    na=up[np.argmin(prof[up])] if len(up) else iy
    # below the tip: subnasale = deepest just under the tip, then upper lip peak, stomion, lower lip peak, labiomental, pogonion, menton
    low=np.arange(iy+2,H);d=np.diff(prof)
    sub=iy+2
    while sub+1<H and prof[sub+1]<prof[sub]-1e-9*0:sub+=1
    def next_max(i):
        while i+1<H and prof[i+1]>=prof[i]:i+=1
        return i
    def next_min(i):
        while i+1<H and prof[i+1]<=prof[i]:i+=1
        return i
    ul=next_max(sub);st=next_min(ul);ll=next_max(st);lm=next_min(ll);po=next_max(lm)
    # menton: below the chin the profile falls fast: where it drops under the chin by a margin before the neck
    me=po
    while me+1<H and prof[me+1]>prof[po]-(prof[tip[1]]-prof[sub])*1.1:me+=1
    return dict(tip=tip,cx=cx,na=na,sub=sub,ul=ul,st=st,ll=ll,lm=lm,po=po,me=me,prof=prof,Z=Z)

def measure(V,F,box,win=None,size=256):
    z,sc=depth(V,F,box,size);H,W=z.shape;Z=np.where(np.isfinite(z),z,np.nan)
    wx0,wx1,wy0,wy1=win or (.3,.7,.3,.85)
    a=Z[int(wy0*H):int(wy1*H),int(wx0*W):int(wx1*W)];iy,ix=np.unravel_index(np.nanargmax(a),a.shape);iy+=int(wy0*H);ix+=int(wx0*W)
    best=ix;score=1e18
    for c in range(ix-7,ix+8):
        n=min(c,W-1-c,70);L=Z[max(0,iy-50):iy+50,c-n:c][:,::-1];R=Z[max(0,iy-50):iy+50,c+1:c+1+n];m=min(L.shape[1],R.shape[1]);v=np.nanmean(np.abs(L[:,:m]-R[:,:m]))
        if v<score:score=v;best=c
    cx=best;prof=np.nanmean(Z[:,cx-1:cx+2],axis=1);ys=np.where(np.isfinite(prof))[0];prof=smooth1(np.interp(np.arange(H),ys,prof[ys]),3)
    def nmax(i):
        while i+1<H and prof[i+1]>=prof[i]:i+=1
        return i
    def nmin(i):
        while i+1<H and prof[i+1]<=prof[i]:i+=1
        return i
    sub=nmin(iy+1);ul=nmax(sub);st=nmin(ul);ll=nmax(st);lm=nmin(ll);po=nmax(lm)
    me=po;drop=(prof[iy]-prof[sub])*1.0
    while me+1<H and prof[me+1]>prof[po]-drop:me+=1
    E0=max(me-iy,int(.2*H))
    # Eye sockets: lower than the brow above and the cheek below, on both sides of the nose alike.
    d=max(4,int(.32*E0));best=-1e9;pock=None
    Zf=np.nan_to_num(Z,nan=-1e6)
    for y in range(max(d,iy-int(.98*E0)),iy-int(.42*E0)):
        for x in range(int(.34*E0),int(.85*E0)):
            if cx-x<0 or cx+x>=W:continue
            s=0
            for c in (cx-x,cx+x):s+=min(Zf[y-d,c],Zf[y+d,c])-Zf[y,c]
            s-=abs(Zf[y,cx-x]-Zf[y,cx+x])*2
            if s>best:best=s;pock=[(cx-x,y),(cx+x,y)]
    if pock is None:print('NO EYES iy',iy,'E0',E0,'d',d,'H',H,'cx',cx);pock=[(cx-30,iy-40),(cx+30,iy-40)]
    ey=pock[0][1];ipd=pock[1][0]-pock[0][0]
    upw=np.arange(max(0,ey-int(.3*E0)),ey+int(.35*E0));na=upw[np.argmin(prof[upw])]
    # Widths: the face's edge on a row: where depth falls away from the cheek (skips hair behind)
    def width(y):
        y=int(y);c0=np.nanmean(Z[y,cx-2:cx+3]);out=[]
        for side in (-1,1):
            x=cx;last=Z[y,x]
            while 0<x<W-1:
                nx=x+side;v=Z[y,nx]
                if not np.isfinite(v) or last-v>.16*E0/sc:break
                last=v;x=nx
            out.append(abs(x-cx))
        return 2*min(out)
    nw=0
    # nose width: at the wing row, where the surface leaves the cheek plane
    y=int(iy+(sub-iy)*.6);rowz=Z[y];base=np.nanmean([Z[y,cx-int(.42*E0)],Z[y,cx+int(.42*E0)]]);x=cx
    for side in (-1,1):
        x=cx
        while 0<x<W-1 and Z[y,x]>base+ .012*E0/sc*1.0:x+=side
        nw+=abs(x-cx)
    # mouth width: the crease on the stomion row against the rows above and below
    mw=0
    for side in (-1,1):
        x=cx
        while 0<x<W-1:
            crease=np.nanmean([Z[st-4,x],Z[st+4,x]])-Z[st,x]
            if abs(x-cx)>.12*E0 and crease<.0035*E0/sc:break
            x+=side
        mw+=abs(x-cx)
    u=1/float(me-ey) ;P=lambda d:d/( (me-ey)/sc )
    return dict(pts=dict(cx=cx,iy=iy,na=na,sub=sub,ul=ul,st=st,ll=ll,lm=lm,po=po,me=me,ey=ey,pock=pock),Z=Z,sc=sc,
      m={'ipd':ipd*u,'nose_len':(sub-na)*u,'nasion_y':(na-ey)*u,'tip_y':(iy-ey)*u,'sub_y':(sub-ey)*u,'mouth_y':(st-ey)*u,'upperlip':(st-ul)*u if False else (st-sub)*u,'lowerface':(me-st)*u,
         'chin_h':(me-lm)*u,'face_w_eye':width(ey)*u,'face_w_nose':width(sub)*u,'face_w_mouth':width(st)*u,'jaw_w':width(st+(me-st)*.5)*u,'chin_w':width(me-(me-st)*.18)*u,'nose_w':nw*u,'mouth_w':mw*u,
         'nose_proj':P(prof[iy]-prof[sub]),'nasion_dep':P(prof[iy]-prof[na]),'lip_proj':P(prof[ul]-prof[sub]),'chin_proj':P(prof[po]-prof[lm]),'chin_vs_lip':P(prof[po]-prof[ll])})
