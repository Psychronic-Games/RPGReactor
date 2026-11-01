# Our head's half-width at each height and the reference's, from crown to chin, in eyes-to-chin: the FACE_OUTLINE table in HumanBody.js.
import sys,json;S=sys.argv[1];sys.path.insert(0,S);import numpy as np,warnings
warnings.filterwarnings('ignore')
src=open(S+'/drape.py').read();exec(src[src.index('import sys'):src.index('\nout={}')].replace("S=sys.argv[1];sys.path.insert(0,S);",""))
D=sys.argv[2];ours=json.load(open(sys.argv[3]));ys=np.arange(-.8,1.11,.1);res={}
for tag,f,sk,e,key in (('F','female_elf_head.glb','Face','Eyes','female_elf'),('M','male_head_base.glb','Cabeza','Esclera','male_head_')):
    T,Fc=target(D+'/'+f,sk,e,key);Td,_=dense(T,Fc)
    o=ours[tag];p=np.array(o['pts']).reshape(-1,3);E={'F':.1137,'M':.1273}[tag];Q=np.c_[p[:,0]/E,(o['ey']-p[:,1])/E,(p[:,2]-o['tip'])/E]
    def pf(A):
        r=[]
        for y in ys:
            m=(np.abs(A[:,1]-y)<.04)&(A[:,2]>(-.72 if y>-.25 else -1.3))
            r.append(np.percentile(np.abs(A[m,0]),99.5) if m.sum()>4 else 0)
        return np.array(r)
    res[tag]=[pf(Td),pf(Q)]
    print(tag,'\n ref ',res[tag][0].round(3).tolist(),'\n ours',res[tag][1].round(3).tolist())
def sm_(a):
    a=a.copy()
    for _ in range(2):a[1:-1]=(a[:-2]+2*a[1:-1]+a[2:])/4
    return a
F0,F1=sm_(res['F'][1]),sm_(res['F'][0]);M0,M1=sm_(res['M'][1]),sm_(res['M'][0])
# a man's jaw from his own reference, drawn partway to the woman's taper: his is blocky
Mt=F1/F1.max()*M1.max();k=np.clip((ys-.5)/.3,0,1)*.45;M1=M1*(1-k)+Mt*k
json.dump({'F':[np.round(F0,3).tolist(),np.round(F1,3).tolist()],'M':[np.round(M0,3).tolist(),np.round(M1,3).tolist()]},open(S+'/outline.json','w'));print('ratio F',(F1/F0).round(2).tolist(),'\nratio M',(M1/M0).round(2).tolist())
