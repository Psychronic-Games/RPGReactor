import sys,json;sys.path.insert(0,sys.argv[1]);import face,numpy as np,subprocess
S=sys.argv[1];J=S+'/refs/jac/';keys=json.loads(sys.argv[2])
d=json.load(open(S+'/refs/metrics.json'));rows=d['rows']
Mn=['male_head_base','male_officer','reality_scan_3d_male_character'];Fn=['chun-li_street_fighter_6_nsfw','female_elf_head']
use=['ipd','nose_len','tip_y','sub_y','mouth_y','upperlip','chin_h','face_w_nose','face_w_mouth','jaw_w','nose_w','mouth_w','nose_proj','lip_proj','chin_proj','chin_vs_lip']
scale=dict(ipd=.03,nose_len=.04,tip_y=.03,sub_y=.03,mouth_y=.03,upperlip=.03,chin_h=.04,face_w_nose=.08,face_w_mouth=.08,jaw_w=.08,nose_w=.04,mouth_w=.04,nose_proj=.012,lip_proj=.006,chin_proj=.01,chin_vs_lip=.012)
tg={'M':{k:float(np.median([rows[n][k] for n in Mn])) for k in use},'F':{k:float(np.median([rows[n][k] for n in Fn])) for k in use}}
def ours(p):
    b=open(p,'rb').read();nv,nf=np.frombuffer(b,np.uint32,2);V=np.frombuffer(b,np.float32,nv*3,8).reshape(-1,3).astype(float);F=np.frombuffer(b,np.uint32,nf*3,8+nv*12).reshape(-1,3).astype(np.int64);return V,F
def m(p):
    V,F=ours(p);ey=np.ptp(V[:,1]);top=V[:,1].max();span=.155*ey;c=np.median(V[V[:,1]>top-span,0]);return face.measure(V,F,(c-span*.62,c+span*.62,top-span,top),None)['m']
res={}
for s in 'FM':
    b=m(J+s+'_base.bin');Jm=np.zeros((len(use),len(keys)));
    for j,k in enumerate(keys):
        q=m(J+s+'_'+k+'.bin');Jm[:,j]=[(q[u]-b[u])/.3 for u in use]
    w=np.array([1/scale[u] for u in use]);r=np.array([tg[s][u]-b[u] for u in use])
    A=Jm*w[:,None];y=r*w;lam=1.2;x=np.linalg.solve(A.T@A+lam*np.eye(len(keys)),A.T@y);x=np.clip(x,-1,1)
    res[s]={k:round(float(v),2) for k,v in zip(keys,x) if abs(v)>=.04}
    print(s,'err before',round(float(np.sqrt(np.mean(y**2))),2),'predicted after',round(float(np.sqrt(np.mean((y-A@x)**2))),2));print(' ',res[s]);print('  gaps:',{u:round(tg[s][u]-b[u],3) for u in use if abs(tg[s][u]-b[u])>scale[u]})
json.dump(res,open(S+'/refs/solve.json','w'))
