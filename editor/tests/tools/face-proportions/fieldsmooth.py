# The face field's edge eased where the mask doesn't cover it: its outer rim otherwise leaves a crease in our own skin at the jaw's angle.
import sys,json;import numpy as np
S,F=sys.argv[1],sys.argv[2];s=open(F).read();i=s.index('const data = ')+13;j=s.index(';\n    root.RR_FACE_FIELD');d=json.loads(s[i:j])
sm=lambda a,b,x:(lambda t:t*t*(3-2*t))(np.clip((x-a)/(b-a),0,1))
for t in 'FM':
    r=json.load(open(S+'/refs/final_'+t+'.json'));V=np.array(r['P']).reshape(-1,3);tri=np.array(r['tri']).reshape(-1,3);eye=np.array(r['eye']);w=np.array(r['w']);n=len(V)
    y0=V[eye,1].mean();mid=(np.abs(V[:,0])<.012)&(V[:,1]<y0)&(V[:,1]>y0-.13)&(V[:,2]>0);tip=V[mid,2].max();chin=np.where((np.abs(V[:,0])<.012)&(V[:,2]>.02)&(w>.3),V[:,1],9).min();E=y0-chin
    O=np.c_[V[:,0]/E,(y0-V[:,1])/E,(V[:,2]-tip)/E]
    fade=(1-sm(1.0,1.24,O[:,1]))*sm(-.46,-.16,O[:,1])*sm(-.82,-.5,O[:,2])*(1-sm(.46,.62,np.abs(O[:,0])))
    a=(1-fade)*(w>.01);D=np.zeros((n,3));x=d[t];ids=np.array(x['ids']);D[ids]=np.array(x['d']).reshape(-1,3)
    e=np.vstack([tri[:,[0,1]],tri[:,[1,2]],tri[:,[2,0]]]);e=np.vstack([e,e[:,::-1]]);e=np.unique(e,axis=0);cn=np.bincount(e[:,0],minlength=n);m=cn>0
    for _ in range(90):
        su=np.zeros_like(D);np.add.at(su,e[:,0],D[e[:,1]]);D[m]+= (.5*a[m])[:,None]*(su[m]/cn[m,None]-D[m])
    keep=np.where(np.abs(D).max(1)>1e-4)[0];d[t]={'ids':keep.tolist(),'d':np.round(D[keep].ravel(),4).tolist()};print(t,len(ids),'->',len(keep))
open(F,'w').write(s[:i]+json.dumps(d,separators=(',',':'))+s[j:])
