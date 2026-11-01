import sys,json;S=sys.argv[1];sys.path.insert(0,S);import numpy as np,warnings
warnings.filterwarnings('ignore')
src=open(S+'/drape.py').read();exec(src[src.index('import sys'):src.index('\nout={}')].replace("S=sys.argv[1];sys.path.insert(0,S);",""))
D=sys.argv[3];out={}
def loops(I):
    e={}
    for t in I.tolist():
        for a,b in ((t[0],t[1]),(t[1],t[2]),(t[2],t[0])):
            k=(min(a,b),max(a,b));e[k]=e.get(k,0)+1
    nb={}
    for (a,b),c in e.items():
        if c==1:nb.setdefault(a,[]).append(b);nb.setdefault(b,[]).append(a)
    seen=set();res=[]
    for s_ in nb:
        if s_ in seen:continue
        l=[s_];seen.add(s_);cur=s_
        while True:
            nx=[q for q in nb[cur] if q not in seen]
            if not nx:break
            cur=nx[0];seen.add(cur);l.append(cur)
        res.append(l)
    return res
for tag,f,sk,e,key,refs in (('F','female_elf_head.glb','Face','Eyes','female_elf',['chun-li_st','female_elf','woman_head']),('M','male_head_base.glb','Cabeza','Esclera','male_head_',['reality_sc','male_offic','male_head_'])):
    T,Fc=target(D+'/'+f,sk,e,key);st=pts(key);mean=st
    # The reference's halves meet in unjoined seams: weld them, or the shading breaks down the middle of the face.
    rk={};wm=np.arange(len(T))
    for i,q in enumerate(np.round(T/.0006).astype(int)):
        wm[i]=rk.setdefault(tuple(q),i)
    Fc=wm[Fc];Fc=Fc[(Fc[:,0]!=Fc[:,1])&(Fc[:,1]!=Fc[:,2])&(Fc[:,0]!=Fc[:,2])]
    R=json.load(open(S+'/refs/final_'+tag+'.json'));V=np.array(R['P']).reshape(-1,3);tri=np.array(R['tri']).reshape(-1,3);eye=np.array(R['eye']);w=np.array(R['w'])
    y0=V[eye,1].mean();mid=(np.abs(V[:,0])<.012)&(V[:,1]<y0)&(V[:,1]>y0-.13)&(V[:,2]>0);tip=V[mid,2].max();chin=np.where((np.abs(V[:,0])<.012)&(V[:,2]>.02)&(w>.3),V[:,1],9).min();E=y0-chin
    O=np.c_[V[:,0]/E,(y0-V[:,1])/E,(V[:,2]-tip)/E]
    body=np.unique(tri);body=body[(w[body]>.01)|(O[body,1]>.8)];body=body[(O[body,1]<1.9)]
    keep=T[:,1]<1.32
    if tag=='F':
        ear=(np.abs(T[:,0])>.66)&(T[:,1]>-.25)&(T[:,1]<.72)&(T[:,2]<-.55);keep&=~ear
    remap=-np.ones(len(T),int);remap[keep]=np.arange(keep.sum());tk=keep[Fc].all(1);I=remap[Fc[tk]];Q=T[keep];
    mv=float(mean[-5:,1][1]) if False else float(np.mean(mean[[2,9],1]))
    if tag=='F':Q=Q.copy();Q[:,0]+=.0075     # (this reference stands a hair off its own middle: the two eyes came out unalike)
    # The lips' outline, read off the surface's shading (lipm.py draws it): across the mouth from its middle (t 0) to its corner (t 1), y down the face.
    # (The color runs on past the slit's end to the fold at the mouth's corner, closing there, so the two lips meet.)
    LIP={'F':dict(slit=.197,corner=.222,t=[0,.31,.55,.79,.89,1],up=[.566,.553,.574,.6225,.652,.688],line=[.656,.645,.66,.679,.683,.688],low=[.78,.775,.769,.7275,.706,.688]),
         'M':dict(slit=.227,corner=.25,t=[0,.27,.64,.86,.91,1],up=[.555,.54,.5625,.615,.622,.64],line=[.643,.641,.637,.6375,.638,.64],low=[.745,.742,.715,.672,.663,.64])}[tag]
    # The mouth at rest: corners a shade up. The reference's turn down, and a face that frowns at rest reads sour and older whatever else is right.
    cl={'F':.026,'M':.016}[tag];cornerUp=lambda x:cl*sm(.3,.95,np.abs(x)/LIP['slit'])*(1-sm(1.05,1.5,np.abs(x)/LIP['slit']))
    def curve(a):
        t=np.linspace(0,1,41);y=np.interp(t,LIP['t'],a)-cornerUp(t*LIP['corner'])
        for _ in range(6):y[1:-1]=(y[:-2]+2*y[1:-1]+y[2:])/4
        return y
    line00=np.interp(np.abs(Q[:,0])/LIP['corner'],LIP['t'],LIP['line']);Q=Q.copy();Q[:,1]-=cornerUp(Q[:,0])*np.exp(-((Q[:,1]-line00)/.14)**2)
    line0=curve(LIP['line']);mvAt=lambda x:np.interp(np.abs(x)/LIP['corner'],np.linspace(0,1,41),line0)
    # The mouth open: the reference's inner bag is cut away just behind the lips, leaving a real slit, so our teeth and tongue show and the lips can part.
    yq=Q[:,1]-mvAt(Q[:,0]);zone=np.where((np.abs(Q[:,0])<LIP['corner']*1.3)&(np.abs(yq)<.075))[0];bag=np.zeros(len(Q),bool);slit=LIP['slit']
    for i_ in zone:
        r_=np.hypot(Q[zone,0]-Q[i_,0],Q[zone,1]-Q[i_,1])<.022;bag[i_]=Q[zone[r_],2].max()-Q[i_,2]>.035    # behind the lips, seen from the front
    # and the lips parted along the mouth's line, corner to corner: no face joins the upper to the lower. Closed at rest, the two edges lie together on the line.
    across=(yq[I].min(1)<0)&(yq[I].max(1)>0)&(np.abs(Q[I,0]).max(1)<slit)&(np.abs(yq[I]).max(1)<.075)
    tk=~((bag[I].sum(1)>=2)|across);print(tag,'mouth bag verts',int(bag.sum()),'tris cut',int((~tk).sum()),'across',int(across.sum()));edge_v=np.unique(I[across]);I=I[tk]
    near_line=edge_v[np.abs(yq[edge_v])<.03];Q=Q.copy();Q[near_line,1]=mvAt(Q[near_line,0])+np.sign(yq[near_line])*.0015
    used=np.unique(I);re=-np.ones(len(Q),int);re[used]=np.arange(len(used));I=re[I];Q=Q[used]
    # Young skin: the folds beside the nose and the pouches under the eyes eased out of the cheeks; they age a face more than any other form. Nose, lips and lids stay.
    e_=np.vstack([I[:,[0,1]],I[:,[1,2]],I[:,[2,0]]]);e_=np.unique(np.vstack([e_,e_[:,::-1]]),axis=0);cn_=np.bincount(e_[:,0],minlength=len(Q));ax_=np.abs(Q[:,0])
    line00=np.interp(ax_/LIP['corner'],LIP['t'],LIP['line']);em=np.hypot(ax_/(LIP['corner']*1.12),(Q[:,1]-line00)/.2);wf=sm(.2,.3,ax_)*sm(.1,.22,Q[:,1])*(1-sm(.95,1.05,Q[:,1]))*sm(1,1.25,em)*{'F':.5,'M':.7}[tag]
    for _ in range({'F':24,'M':40}[tag]):
        su=np.zeros_like(Q);np.add.at(su,e_[:,0],Q[e_[:,1]]);m=cn_>0;Q[m]+=wf[m,None]*(su[m]/cn_[m,None]-Q[m])
    # Eyes as large as the finished references': opening about half the distance between the eyes, against our four tenths. Lids and socket scale with it; the ball is fitted later.
    for sd in (1,-1):
        l=max([l for l in loops(I) if len(l)>=12 and .14<sd*np.mean(Q[l,0])<.45 and abs(np.mean(Q[l,1]))<.12],key=len);c0=(Q[l].max(0)+Q[l].min(0))/2
        r_=np.hypot(Q[:,0]-c0[0],(Q[:,1]-c0[1])*1.3);k_=1-sm(.15,.36,r_);f_={'F':.22,'M':.14}[tag]
        Q[:,:2]=c0[:2]+(Q[:,:2]-c0[:2])*(1+f_*k_[:,None])
    # bind: the closest point of the driver's skin, by its triangle's corners, so a vertex with no offset lies exactly on our surface. Each lip only to its own side of the mouth.
    tb=tri[np.isin(tri,body).all(1)];Ta,Tb,Tc=O[tb[:,0]],O[tb[:,1]],O[tb[:,2]];Tm=(Ta+Tb+Tc)/3;k=6;ids=np.zeros((len(Q),k),int);ws=np.zeros((len(Q),k))
    Oz=O[body];fq=(1-sm(1.0,1.24,Q[:,1]))*sm(-.46,-.16,Q[:,1])*sm(-.82,-.5,Q[:,2])*(1-sm(.46,.62,np.abs(Q[:,0])))
    def closest(p,a,b,c):
        ab,ac=b-a,c-a;ap=p-a;d1=(ab*ap).sum(1);d2=(ac*ap).sum(1);d3=(ab*ab).sum(1);d4=(ab*ac).sum(1);d5=(ac*ac).sum(1);de=np.maximum(d3*d5-d4*d4,1e-14)
        v=(d5*d1-d4*d2)/de;w_=(d3*d2-d4*d1)/de
        # inside, else onto the nearest edge
        best=None
        for e0,e1 in ((a,b),(a,c),(b,c)):
            ed=e1-e0;t=np.clip(((p-e0)*ed).sum(1)/np.maximum((ed*ed).sum(1),1e-14),0,1);pt=e0+ed*t[:,None]
            if e0 is a and e1 is b:bary=[np.c_[1-t,t,0*t]]
            elif e0 is a:bary=[np.c_[1-t,0*t,t]]
            else:bary=[np.c_[0*t,1-t,t]]
            dd_=((p-pt)**2).sum(1)
            if best is None:best=(dd_,pt,bary[0])
            else:
                m=dd_<best[0];best=(np.where(m,dd_,best[0]),np.where(m[:,None],pt,best[1]),np.where(m[:,None],bary[0],best[2]))
        ins=(v>=0)&(w_>=0)&(v+w_<=1);pi=a+ab*v[:,None]+ac*w_[:,None];di=((p-pi)**2).sum(1);ins&=di<=best[0]+1e-12
        return np.where(ins,di,best[0]),np.where(ins[:,None],pi,best[1]),np.where(ins[:,None],np.c_[1-v-w_,v,w_],best[2])
    mouthBand=lambda a:(np.abs(a[...,0])<LIP['slit']*1.12)&(np.abs(a[...,1]-mvAt(a[...,0]))<.17)     # no further: past the corners the cheek is one skin
    jawDy=np.array(R['jaw']);lowerV=jawDy<-.0012*1;print(tag,'skin that drops with the jaw',int(lowerV.sum()));Oside=np.where(lowerV[body],1.,-1.);Tside=np.where(lowerV[tb].mean(1)>=.5,1.,-1.)
    for i in range(len(Q)):
        p=Q[i];d=((Tm-p)**2).sum(1);near_=((Oz-p)**2).sum(1)
        if mouthBand(p):
            sp=np.sign(p[1]-mvAt(p[0]));d=np.where(Tside*sp<0,9,d);near_=np.where(Oside*sp<0,9,near_)
        c_=np.argpartition(d,28)[:28];dd_,pt,ba=closest(np.repeat(p[None],28,0),Ta[c_],Tb[c_],Tc[c_]);b_=int(dd_.argmin());t_=tb[c_[b_]]
        o_=np.argsort(near_)[:16]
        o_=o_[[0,1,3,6,10,15]] if not mouthBand(p) else o_[:6]    # across the cheek a wider patch: following a few vertices it took every crease of the expression
        gw=np.exp(-near_[o_]/(2*.09**2))+1e-6;gw/=gw.sum();mix={}
        for v_,w_ in zip(t_.tolist(),(ba[b_]*(1-fq[i])).tolist()):mix[v_]=mix.get(v_,0)+w_
        for v_,w_ in zip(body[o_].tolist(),(gw*fq[i]).tolist()):mix[v_]=mix.get(v_,0)+w_
        top=sorted(mix.items(),key=lambda x:-x[1])[:6];top+=[(top[0][0],0.)]*(6-len(top));ids[i]=[x[0] for x in top];ws[i]=[x[1] for x in top]
    ws=np.round(ws,5);ws/=ws.sum(1,keepdims=True);cage=(O[ids]*ws[...,None]).sum(1);off=Q-cage
    # Color comes from outer skin only: the skin folded into the mouth and nostrils has its own places in the picture.
    fn=np.cross(V[tri[:,1]]-V[tri[:,0]],V[tri[:,2]]-V[tri[:,0]]);Nv=np.zeros_like(V)
    for c_ in range(3):np.add.at(Nv,tri[:,c_],fn)
    Nv/=np.linalg.norm(Nv,axis=1,keepdims=True)+1e-12
    faceZone=(O[body,1]>.2)&(O[body,1]<.95)&(np.abs(O[body,0])<.6);outer=body[~faceZone|(Nv[body,2]>.45)]
    # Each vertex's place in the skin picture: the middle of its nearest outer skin (one neighbor across a seam of the picture must not pull it there),
    # then eased along this surface, which is finer than the skin.
    UV=np.array(R['uv']).reshape(-1,2);outer=outer[UV[outer,0]>=0];kq=6;nk=np.zeros((len(Q),kq),int);dk=np.zeros((len(Q),kq))
    for i in range(0,len(Q),200):
        d=((Q[i:i+200,None]-O[outer][None])**2).sum(2);o_=np.argsort(d,axis=1)[:,:kq];nk[i:i+200]=outer[o_];dk[i:i+200]=np.take_along_axis(d,o_,1)
    uvn=UV[nk];pair=np.linalg.norm(uvn[:,:,None]-uvn[:,None],axis=3)<.1;best=(pair.sum(2)+(1-np.arange(kq)/kq)*.5).argmax(1);near_=pair[np.arange(len(Q)),best];wu=near_/(dk+.0004);uvb=(uvn*wu[...,None]).sum(1)/wu.sum(1,keepdims=True);assert np.isfinite(uvb).all()
    ea=np.vstack([I[:,[0,1]],I[:,[1,2]],I[:,[2,0]]])
    for _ in range(14):
        ok_=np.linalg.norm(uvb[ea[:,0]]-uvb[ea[:,1]],axis=1)<.14;su=np.zeros_like(uvb);cn=np.zeros(len(uvb))
        for a_,b_ in ((0,1),(1,0)):
            np.add.at(su,ea[ok_,a_],uvb[ea[ok_,b_]]);np.add.at(cn,ea[ok_,a_],1)
        m_=cn>0;uvb[m_]=uvb[m_]*.5+.5*su[m_]/cn[m_,None]
    # The face only, as a mask: forehead to under the chin, stopping in front of the ears, where it has come down onto our own skin. Scalp, ears and neck stay ours.
    fade=(1-sm(1.0,1.24,Q[:,1]))*sm(-.46,-.16,Q[:,1])*sm(-.82,-.5,Q[:,2])*(1-sm(.46,.62,np.abs(Q[:,0])));off=off*fade[:,None];pos=cage+off
    fn=np.cross(pos[I[:,1]]-pos[I[:,0]],pos[I[:,2]]-pos[I[:,0]]);Np=np.zeros_like(pos)
    for c_ in range(3):np.add.at(Np,I[:,c_],fn)
    Np/=np.linalg.norm(Np,axis=1,keepdims=True)+1e-12
    pos=pos+Np*(.004*(1-fade))[:,None];off=pos-cage   # a hair proud of the skin it lies on, so the two never fight over one surface
    tk=fade[I].max(1)>.01;I=I[tk];used=np.unique(I);re=-np.ones(len(Q),int);re[used]=np.arange(len(used));I=re[I]
    Q,pos,off,ids,ws,uvb,fade=Q[used],pos[used],off[used],ids[used],ws[used],uvb[used],fade[used]
    # the old skin goes only where the mask fully covers it
    j,dd=nearest(O[body],pos);box=(np.abs(O[body,0])<.34)&(O[body,1]>LIP['line'][0]-.2)&(O[body,1]<LIP['line'][0]+.16)&(O[body,2]>-.62)   # and our old mouth's lining: the lips and the dark behind them replace it
    own=(1-sm(1.0,1.24,O[body,1]))*sm(-.46,-.16,O[body,1])*sm(-.82,-.5,O[body,2])*(1-sm(.46,.62,np.abs(O[body,0])))    # the skin's own place under the mask, not its nearest mask point's: that left holes at the neck
    ox=np.abs(O[body,0]);_,dt=nearest(O[body],pos[I].mean(1));torn=(ox>=.42)&(own>.2)&(dt>.05)
    _,dn=nearest(O[body],O[body[torn]]) if torn.any() else (0,np.full(len(body),9.));print(tag,'torn skin points',int(torn.sum()))
    hide=body[(((dd<.24)&(own>.3))|((ox<.42)&(dd<.6)&(own>.7))|box)&(dn>.09)]     # well inside the mask, however far off; toward the temples only where the mask truly is, its edge there being torn by the reference's ear     # by what covers it, not how near: old skin standing proud of the mask would poke through
    # The lids' openings, and the eyeball seated behind them: wide enough to fill the opening, its front just behind the rims.
    # The reference's lids fold back under themselves: a lip whose inner edge is the mesh's boundary, hidden behind the edge you see. Those faces go, so the boundary IS the visible edge.
    for pass_ in range(3):
        tn=np.cross(pos[I[:,1]]-pos[I[:,0]],pos[I[:,2]]-pos[I[:,0]]);tn/=np.linalg.norm(tn,axis=1,keepdims=True)+1e-12;tc=pos[I].mean(1)
        back=np.zeros(len(I),bool)
        for sd in (1,-1):
            l=max([l for l in loops(I) if len(l)>=12 and .14<sd*np.mean(pos[l,0])<.45 and abs(np.mean(pos[l,1]))<.12],key=len);q=pos[l];c0=(q.max(0)+q.min(0))/2
            back|=(np.abs(tc[:,0]-c0[0])<(np.ptp(q[:,0])/2*{'F':.92,'M':.88}[tag] if pass_==0 else 0))&(np.abs(tc[:,1]-c0[1])<{'F':.13,'M':.085}[tag])&(-tn[:,2]<.3)    # (y runs down here, so a face's front is its -z)
        print(tag,'lid fold faces cut',int(back.sum()));I=I[~back]
    rims=[];lows=[];seat=[];opens=[];sockets=[]
    for sd in (1,-1):
        L_=[l for l in loops(I) if len(l)>=12 and abs(np.mean(pos[l,0])*1-sd*abs(np.mean(pos[l,0])))<1e-9 and .14<abs(np.mean(pos[l,0]))<.45 and abs(np.mean(pos[l,1]))<.12];l=max(L_,key=len);q=pos[l]
        o=eye[O[eye,0]*sd>0];oc=(O[o].max(0)+O[o].min(0))/2;orx=np.ptp(O[o,0])/2;front=O[o,2].max()
        c=(q.max(0)+q.min(0))/2;wide=np.ptp(q[:,0]);opens.append([int(l[int(np.argmax(q[:,0]))]),int(l[int(np.argmin(q[:,0]))]),float(wide)]);r=max(orx,wide/2*1.18);sc=r/orx
        # the ball the lids rest on: the sphere of this radius closest to the whole rim, then back if any of it would stand through a lid
        ce=np.array([c[0],c[1],c[2]-.06]);gap=.012
        for _ in range(60):
            v=q-ce;dist=np.linalg.norm(v,axis=1);J=-v/dist[:,None];e=dist-(r+gap);ce=ce-np.linalg.lstsq(J,e,rcond=None)[0]*.7
        ce[0]=c[0];ce[1]+={'F':.03,'M':.0}[tag]     # set a little low in the opening: the upper lid laps the iris and the lower just meets it, no white beneath
        poke=(r+gap*.5)-np.linalg.norm(q-ce,axis=1);ce[2]-=max(0,float(poke.max()))
        c=np.array([c[0],ce[1],c[2]]);tgt=float(ce[2])+r
        seat.append(dict(dx=float(c[0]-oc[0]),dy=float(c[1]-oc[1]),dz=float(tgt-(oc[2]+sc*(front-oc[2]))),s=float(sc)))
        # the upper rim, outer corner to inner
        a0=int(np.argmax(q[:,0]*sd));b0=int(np.argmin(q[:,0]*sd));n_=len(l);ring=[(a0+k)%n_ for k in range(n_)]
        one=[];
        for k in ring:
            one.append(k)
            if k==b0:break
        two=[(a0-k)%n_ for k in range(n_)];oth=[]
        for k in two:
            oth.append(k)
            if k==b0:break
        up=one if q[one,1].mean()<q[oth,1].mean() else oth
        rims.append([int(l[k]) for k in up])
        lows.append([int(l[k]) for k in (oth if up is one else one)])
        sockets.append((list(l),ce.copy(),r))
        print(tag,sd,'open',np.round(c,3),'wide',round(float(wide),3),'tall',round(float(np.ptp(q[:,1])),3),'ours',np.round(oc,3),'seat',{k:round(v,3) for k,v in seat[-1].items()},'rim',len(up))
    line_=curve(LIP['line']);zq=pos[:,2];mid=int(np.argmin((pos[:,0])**2+(pos[:,1]-line_[0])**2-.02*zq));lc=[int(np.argmin((pos[:,0]-sd*LIP['corner'])**2+(pos[:,1]-line_[-1])**2-.02*zq)) for sd in (1,-1)]
    lip=dict(corner=LIP['corner'],line=float(line_[0]),drop=np.round(line_-line_[0],4).tolist(),up=np.round(line_-curve(LIP['up']),4).tolist(),low=np.round(curve(LIP['low'])-line_,4).tolist(),mid=mid,midY=round(float(pos[mid,1]),4),ends=lc,endX=round(float((pos[lc[0],0]-pos[lc[1],0])/2),4))
    # The lids wrap back round the ball: each rim drawn in behind it as the lid's own thickness, and the small gaps at the tear ducts closed.
    edge_={}
    for t_ in I.tolist():
        for a_,b_ in ((t_[0],t_[1]),(t_[1],t_[2]),(t_[2],t_[0])):edge_[(a_,b_)]=1
    Pn=[pos];In=[I];src_=[];n0=len(pos)
    firstRing={};rimT={}
    # The lids rest on the ball: each rim drawn onto it, the skin round it following and easing out, so the lid's edge is where it meets the eye, as on a face.
    for l,ce,r_ in sockets:
        rv=np.array(l);low_=np.clip((pos[rv,1]-ce[1])/max(1e-6,(pos[rv,1]-ce[1]).max()),0,1)
        up_=np.clip((ce[1]-pos[rv,1])/max(1e-6,(ce[1]-pos[rv,1]).max()),0,1);lifted=pos[rv].copy();lifted[:,1]-={'F':.02,'M':.016}[tag]*up_     # the upper lid raised: half-shut reads tired
        lifted[:,1]-={'F':.012,'M':.004}[tag]*low_     # the lower lid up to touch the iris: white below it is a stare
        for _ in range(10):lifted=(np.roll(lifted,1,0)+2*lifted+np.roll(lifted,-1,0))/4     # the edge a smooth line: the cut left it following the old triangles
        to=ce+(lifted-ce)/np.linalg.norm(lifted-ce,axis=1,keepdims=True)*(r_+.004);dp=to-pos[rv]
        nr,dd_=nearest(pos,pos[rv]);pos=pos+dp[nr]*np.exp(-(dd_/.075)**2)[:,None]*(dd_<.2)[:,None]
        # and the lid's skin lies on the ball down to that edge, a thin even skin thickening away from it: no bulge standing forward of the edge, whatever the reference had
        nr,dd_=nearest(pos,pos[rv]);du=pos-ce;Rd=np.linalg.norm(du,axis=1);Rt=r_+.004+dd_*.22;wl=np.exp(-(dd_/.06)**2)*(dd_<.16)*(Rd>r_*.9)
        pos=pos+(ce+du/Rd[:,None]*Rt[:,None]-pos)*wl[:,None]
    # The sockets softened: the sculpted hollow between lid and brow is too sharp for our light, a hard dark band like painted shadow. Not at the lid's own edge.
    ed_=np.vstack([I[:,[0,1]],I[:,[1,2]],I[:,[2,0]]]);ed_=np.vstack([ed_,ed_[:,::-1]]);cn_=np.bincount(ed_[:,0],minlength=len(pos))
    allrim=np.array(sum([list(l) for l,_,_ in sockets],[]));nr,dr=nearest(pos,pos[allrim]);ws_=sm(.05,.1,dr)*(1-sm(.24,.36,dr))*.6
    for _ in range(16):
        su=np.zeros_like(pos);np.add.at(su,ed_[:,0],pos[ed_[:,1]]);m=cn_>0;pos[m]+=ws_[m,None]*(su[m]/cn_[m,None]-pos[m])
    # No skin inside the ball, anywhere round it: what the eye would poke through is lifted clear.
    for l,ce,r_ in sockets:
        used_=np.zeros(len(pos),bool);used_[np.unique(I)]=True;du=pos-ce;Rd=np.linalg.norm(du,axis=1);inside=used_&(Rd<r_+.006)&(du[:,2]>-.02)
        pos[inside]=ce+du[inside]/Rd[inside,None]*(r_+.006);print(tag,'lid points lifted off the ball',int(inside.sum()))
    for l,ce,r_ in sockets:
        loop_=l if (l[1],l[0]) in edge_ else l[::-1]     # walk the rim the way the open side runs
        n_=len(loop_);prev=loop_
        for a_ in (.35,.8):
            start=n0+sum(len(x) for x in Pn[1:]);ring=[start+k for k in range(n_)]
            Pn.append(pos[loop_]+(ce-pos[loop_])*a_);src_+=loop_
            if a_==.35:
                for k_,v_ in enumerate(loop_):
                    firstRing[v_]=ring[k_];rimT[v_]=float(np.clip(1-r_/np.linalg.norm(pos[v_]-ce),0,.34))/.35    # how far along the lid's thickness it meets the ball
            In.append(np.array([[prev[k],prev[(k+1)%n_],ring[(k+1)%n_]] for k in range(n_)]+[[prev[k],ring[(k+1)%n_],ring[k]] for k in range(n_)]));prev=ring
    for l in loops(I):
        if 4<=len(l)<20 and .1<abs(np.mean(pos[l,0]))<.45 and abs(np.mean(pos[l,1]))<.12:
            In.append(np.array([[l[0],l[k],l[k+1]] for k in range(1,len(l)-1)]+[[l[0],l[k+1],l[k]] for k in range(1,len(l)-1)]))
    # The nostrils' insides: everything of the nose's base that lies behind its own front, seen from below and ahead. They take shade below.
    # The nostrils' insides: skin with nose round it on every side, ahead, above and both ways across, however it happens to face. Darker the further up from the opening.
    zn=np.where((np.abs(pos[:,0])<.2)&(pos[:,1]>.28)&(pos[:,1]<.47))[0];nostril=[];Z=pos[zn]     # (the nose only: past its base the upper lip has skin round it too)
    for i_ in zn:
        p=pos[i_];d=Z-p;ax=np.abs(d)
        side=(ax[:,1]<.03)&(ax[:,2]<.03);ahead=(d[:,2]>.02)&(ax[:,0]<.03)&(ax[:,1]<.035);over=(d[:,1]<-.02)&(ax[:,0]<.03)&(ax[:,2]<.035)
        if not ((side&(d[:,0]>.012)).any() and (side&(d[:,0]<-.012)).any() and ahead.any() and over.any()):continue
        rim=Z[(ax[:,0]<.07)&(ax[:,2]<.07),1].max();d_=(rim-p[1]-.02)/.05
        if d_>0:nostril.append((int(i_),round(float(min(1,d_)),3)))
    print(tag,'nostril points',len(nostril))
    if src_:
        src_=np.array(src_);I=np.vstack(In);pos=np.vstack(Pn);add=len(src_)
        ids=np.vstack([ids,ids[src_]]);ws=np.vstack([ws,ws[src_]]);cage=(O[ids]*ws[...,None]).sum(1);off=pos-cage;uvb=np.vstack([uvb,uvb[src_]]);fade=np.r_[fade,np.ones(add)];Q=pos
    # The form's own creases: skin lying in a fold takes shade in proportion. The surface alone, lit softly, loses lid, nose wing and lip into one smoothness.
    fn_=np.cross(pos[I[:,1]]-pos[I[:,0]],pos[I[:,2]]-pos[I[:,0]]);nv=np.zeros_like(pos)
    for c_ in range(3):np.add.at(nv,I[:,c_],-fn_)
    nv/=np.linalg.norm(nv,axis=1,keepdims=True)+1e-12
    e2=np.unique(np.vstack([I[:,[0,1]],I[:,[1,2]],I[:,[2,0]],I[:,[1,0]],I[:,[2,1]],I[:,[0,2]]]),axis=0);cc=np.bincount(e2[:,0],minlength=len(pos));su=np.zeros_like(pos);np.add.at(su,e2[:,0],pos[e2[:,1]])
    cav=((su/np.maximum(cc,1)[:,None]-pos)*nv).sum(1);cav=np.where(cc>0,cav,0)
    for _ in range(2):
        t_=np.zeros(len(pos));np.add.at(t_,e2[:,0],cav[e2[:,1]]);cav=np.where(cc>0,.5*cav+.5*t_/np.maximum(cc,1),0)
    tone=1-np.clip(cav/.009,0,1)*.42*fade;print(tag,'crease tone min',round(float(tone.min()),2),'share below .9',round(float((tone<.9).mean()),3))
    # the two eyes alike in size and depth; each stays centered in its own opening
    for key_ in ('dy','dz','s'):
        m_=(seat[0][key_]+seat[1][key_])/2;seat[0][key_]=m_;seat[1][key_]=m_
    print(tag,'verts',len(Q),'tris',len(I),'hide',len(hide),'mean offset',round(float(np.linalg.norm(off,axis=1).mean()),3),'mouth v',round(mv,3))
    out[tag]=dict(lip=lip,uv=np.round(uvb.ravel(),5).tolist(),eye=[{k:round(v,4) for k,v in x.items()} for x in seat],rim=rims,lidFrom=int(n0),tone=np.round(tone,2).tolist(),nostril=nostril,fade=np.round(fade,3).tolist(),rimIn=[[firstRing[v] for v in r_] for r_ in rims],low=lows,lowIn=[[firstRing[v] for v in r_] for r_ in lows],opening=[[round(float(v),4) for v in q] for q in opens],off=np.round(off.ravel(),4).tolist(),index=I.ravel().tolist(),bind=ids.ravel().tolist(),w=np.round(ws.ravel(),5).tolist(),hide=hide.tolist())
txt="""/**
 * The human head's visible skin, one per sex: a surface reworked from reference heads (their proportions moved toward the average of several), each vertex
 * bound to the skin of the body's head, which still takes every slider and expression and drives this. off: offset from those skin vertices, in eyes-to-chin.
 * Base heads, CC-BY 4.0: "Male head base" by alkalor and "Female Elf Head" by Scol3D (see THIRD_PARTY_NOTICES.md). Generated by tests/tools/face-proportions/headmesh.py.
 */
(function (root) {
    const data = """+json.dumps(out,separators=(',',':'))+""";
    root.RR_HEAD_MESH = data;
    if (typeof module !== 'undefined' && module.exports) module.exports = data;
})(typeof window !== 'undefined' ? window : globalThis);
"""
open(sys.argv[2],'w').write(txt);print(len(txt)//1024,'KB')
