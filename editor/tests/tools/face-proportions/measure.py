import sys;sys.path.insert(0,sys.argv[1]);import face,numpy as np,json
from PIL import Image,ImageDraw
S=sys.argv[1];R=S+'/refs/std/'
C=[('male_head_base','M',0,.9,None),('male_officer','M',0,.17,None),('reality_scan_3d_male_character','M',0,.145,None),
   ('chun-li_street_fighter_6_nsfw','F',.03,.15,None),('female_elf_head','F',0,.9,None),('woman_head','F',.1,.6,(.36,.54,.5,.72)),('zero_suit_samus_fan_art_alt_pose','F',.012,.1,(.42,.58,.6,.92))]
def ours(n):
    b=open(S+'/refs/'+n+'.bin','rb').read();nv,nf=np.frombuffer(b,np.uint32,2);V=np.frombuffer(b,np.float32,nv*3,8).reshape(-1,3).astype(float);F=np.frombuffer(b,np.uint32,nf*3,8+nv*12).reshape(-1,3).astype(np.int64);return V,F
rows={};tiles=[]
def run(n,V,F,off,sp,win):
    ey=np.ptp(V[:,1]);top=V[:,1].max()-off*ey;span=sp*ey;m=(V[:,1]>top-span)&(V[:,1]<top);cx=np.median(V[m,0]);box=(cx-span*.62,cx+span*.62,top-span,top)
    r=face.measure(V,F,box,win);rows[n]=r['m'];Z=r['Z'];p=r['pts']
    im=np.nan_to_num((Z-np.nanpercentile(Z,5))/(np.nanmax(Z)-np.nanpercentile(Z,5)+1e-9)).clip(0,1);I=Image.fromarray((im*255).astype(np.uint8)).convert('RGB');g=ImageDraw.Draw(I)
    for k,c in [('na','#0ff'),('sub','#ff0'),('st','#f00'),('lm','#0f0'),('me','#f0f')]:g.line([(p['cx']-26,p[k]),(p['cx']+26,p[k])],fill=c)
    for q in p['pock']:g.ellipse([q[0]-3,q[1]-3,q[0]+3,q[1]+3],outline='#0f0')
    g.text((3,3),n[:16],fill='#fff');tiles.append(I.resize((220,int(I.height*220/I.width))))
for n,s,off,sp,win in C:
    d=np.load(R+n+'.glb.npz');run(n,d['V'].astype(float),d['F'].astype(np.int64),off,sp,win)
for n,sp in [('ours_male',.15),('ours_neutral',.155),('ours_female',.16)]:
    V,F=ours(n);run(n,V,F,0,sp,None)
M=[c[0] for c in C if c[1]=='M'];Fm=[c[0] for c in C if c[1]=='F'];keys=list(rows['ours_male'])
print('metric'.ljust(13),'refM  sd   oursM | refF  sd   oursF  oursN')
tgt={}
for k in keys:
    a=[rows[n][k] for n in M];b=[rows[n][k] for n in Fm if not ('_w' in k and k not in('nose_w','mouth_w') and n in('woman_head','zero_suit_samus_fan_art_alt_pose'))];tgt[k]=(float(np.median(a)),float(np.median(b)))
    print(k.ljust(13),'%.3f %.3f %.3f | %.3f %.3f %.3f %.3f'%(np.median(a),np.std(a),rows['ours_male'][k],np.median(b),np.std(b),rows['ours_female'][k],rows['ours_neutral'][k]))
json.dump({'rows':rows,'target':tgt},open(S+'/refs/metrics.json','w'))
h=max(t.height for t in tiles);o=Image.new('RGB',(220*5,h*2))
for i,t in enumerate(tiles):o.paste(t,(i%5*220,i//5*h))
o.save(S+'/refs/lm.png')
