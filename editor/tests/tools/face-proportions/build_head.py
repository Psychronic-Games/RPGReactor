"""Build the shared human face. Usage: build_head.py REFERENCE DRIVER_JSON OUTPUT_JS.

The CC-BY Woman head by zhuoyi0904 supplies a starting surface, reworked here
into a shared sculpt with authored feminine/masculine endpoints. No reference
textures, hair, eyes or rig are shipped. Coordinates use eye-to-chin units,
y down, z toward the viewer. Keep this generator and the source attribution.
"""
import hashlib
import json
import os
import sys
from pathlib import Path
sys.dont_write_bytecode = True
import numpy as np
import glb

smooth = lambda a, b, x: (lambda t: t*t*(3-2*t))(np.clip((x-a)/(b-a), 0, 1))

def smoother(a, b, x):
    """A blend with zero first and second derivatives at both ends."""
    t = np.clip((x-a)/(b-a), 0, 1)
    return t*t*t*(t*(t*6-15)+10)

def fair_surface(points, index, amount, passes=20):
    """Remove transition ripples without flattening the facial features.

    Paired positive/negative Laplacian steps avoid the volume loss of repeated
    averaging. Fixed vertices include the eye/lip folds and the outside edge.
    The operation happens once in the generator, never while a slider moves.
    """
    edges = np.unique(np.sort(np.vstack([index[:,[0,1]], index[:,[1,2]], index[:,[2,0]]]), axis=1), axis=0)
    a, b = edges.T
    weight = 1/np.maximum(1e-5, np.linalg.norm(points[a]-points[b], axis=1))
    degree = np.bincount(np.r_[a,b], weights=np.r_[weight,weight], minlength=len(points))
    result = points.copy()
    for _ in range(passes):
        for step in (.5, -.53):
            total = np.zeros_like(result)
            np.add.at(total, a, result[b]*weight[:,None])
            np.add.at(total, b, result[a]*weight[:,None])
            mean = total/np.maximum(1e-12, degree[:,None])
            result += (mean-result)*(amount*step)[:,None]
    return result

def parts(file):
    g, data = glb.load(file)
    out = {}
    def walk(i, parent):
        n = g['nodes'][i]; m = parent @ glb.mat(n)
        if 'mesh' in n:
            for p in g['meshes'][n['mesh']]['primitives']:
                v = glb.acc(g, data, p['attributes']['POSITION']).astype(float)
                v = v @ m[:3, :3].T + m[:3, 3]
                name=g['materials'][p['material']]['name']
                out.setdefault(name, []).append((v, glb.acc(g, data, p['indices']).reshape(-1, 3)))
                n0=glb.acc(g,data,p['attributes']['NORMAL']).astype(float)@np.linalg.inv(m[:3,:3])
                n0/=np.maximum(1e-12,np.linalg.norm(n0,axis=1))[:,None]
                out.setdefault('_normals',{}).setdefault(name,[]).append(n0)
        for child in n.get('children', []): walk(child, m)
    for i in g['scenes'][g.get('scene', 0)]['nodes']: walk(i, np.eye(4))
    return out

def loops(index):
    counts = {}; neighbors = {}
    for tri in index:
        for a,b in ((tri[0],tri[1]),(tri[1],tri[2]),(tri[2],tri[0])):
            k = tuple(sorted((int(a),int(b)))); counts[k] = counts.get(k,0)+1
    for (a,b),count in counts.items():
        if count == 1: neighbors.setdefault(a,[]).append(b); neighbors.setdefault(b,[]).append(a)
    seen = set(); out = []
    for first in neighbors:
        if first in seen: continue
        row = [first]; seen.add(first)
        while True:
            following = [i for i in neighbors[row[-1]] if i not in seen]
            if not following: break
            row.append(following[0]); seen.add(row[-1])
        out.append(row)
    return out

def normals(p, index):
    n = np.zeros_like(p); f = np.cross(p[index[:,1]]-p[index[:,0]],p[index[:,2]]-p[index[:,0]])
    for k in range(3): np.add.at(n,index[:,k],-f)
    return n / np.maximum(1e-10,np.linalg.norm(n,axis=1))[:,None]


def nearest(q, points, count=1):
    ids = []
    for i in range(0,len(q),128):
        d = ((q[i:i+128,None]-points[None])**2).sum(2)
        ids.append(np.argsort(d,axis=1)[:,:count])
    return np.vstack(ids)

def cavity_visibility(p,index,vertices):
    """Local hemispherical visibility: the native cage has different nostrils."""
    N=normals(p,index);centers=p[index].mean(1);visibility=np.ones(len(p))
    z=(np.arange(32)+.5)/32;angle=np.arange(32)*2.399963229728653
    disk=np.c_[np.sqrt(1-z*z)*np.cos(angle),np.sqrt(1-z*z)*np.sin(angle),z]
    for v in vertices:
        normal=N[v];axis=np.eye(3)[np.argmin(abs(normal))];tangent=np.cross(normal,axis);tangent/=np.linalg.norm(tangent)
        rays=disk@np.array([tangent,np.cross(normal,tangent),normal])
        local=index[np.linalg.norm(centers-p[v],axis=1)<.20]
        a=p[local[:,0]];e1=p[local[:,1]]-a;e2=p[local[:,2]]-a;delta=p[v]+normal*.001-a
        h=np.cross(rays[:,None],e2[None]);det=(h*e1).sum(2);inv=np.divide(1.,det,out=np.zeros_like(det),where=abs(det)>1e-12)
        u=inv*(delta[None]*h).sum(2);cross=np.cross(delta,e1);w=inv*(rays[:,None]*cross[None]).sum(2);distance=inv*(e2*cross).sum(1)[None]
        hit=(abs(det)>1e-12)&(u>=0)&(w>=0)&(u+w<=1)&(distance>.001)&(distance<.09)
        visibility[v]=1-hit.any(1).mean()
    return visibility

source, driver, output = sys.argv[1:]
ref = parts(source); p, index = ref['Face'][0]
eye = np.array([v.mean(0) for v,_ in ref['Sclera']]); center = eye.mean(0)
chin = p[(abs(p[:,0]-center[0])<np.ptp(eye[:,0])*.15)&(p[:,2]>center[2]),1].min()
unit = center[1]-chin
p = np.c_[(p[:,0]-center[0])/unit,(center[1]-p[:,1])/unit,(p[:,2]-center[2])/unit]
sourceP=p.copy();sourceN=ref['_normals']['Face'][0].copy();sourceN[:,1]*=-1
# Weld the source's UV splits; the new surface has its own skin mapping.
_, unique, inverse = np.unique(np.round(p/1e-5),axis=0,return_index=True,return_inverse=True)
p,index = p[unique],inverse[index]
index = index[(index[:,0]!=index[:,1])&(index[:,1]!=index[:,2])&(index[:,2]!=index[:,0])]
# The source's closed oral cap must not stretch between the two lip drivers.
# Retain the folded lip rolls, opening only faces that bridge the mouth line.
oral=index[(abs(p[index,0]).max(1)<.24)&(p[index,1].min(1)<.625)&(p[index,1].max(1)>.625)&(p[index,1].min(1)>.54)&(p[index,1].max(1)<.72)]
remove={tuple(t) for t in oral}
index=np.array([t for t in index if tuple(t) not in remove])
print('opened oral cap:',len(oral),'triangles',flush=True)
for row in loops(index):
    q=p[row]
    if abs(q[:,0].mean())<.04 and abs(q[:,0]).max()<.30 and q[:,1].min()>.50 and q[:,1].max()<.75:
        # Opposing inner lip rims meet at rest; the native upper/lower drivers
        # separate them during speech. Preserve a sub-millimetre dark slit.
        p[row,1]=.625+np.where(q[:,1]<.625,-.0015,.0015)
        print('closed lip rim:',len(row),'vertices',flush=True)

# Open the original ocular folds before adding the inward lining. Keeping
# both surfaces leaves overlapping triangles visible at the inner canthus.
cut = np.zeros(len(index),bool)
for side in (1,-1):
    e = (eye[0] if eye[0,0]*side>0 else eye[1]); c = np.array([(e[0]-center[0])/unit,(center[1]-e[1])/unit,(e[2]-center[2])/unit])
    d = (p-c)/[.148,.148,.123]
    inside = (d*d).sum(1)<1.012
    cut |= inside[index].sum(1)>=2
index = index[~cut]
used = np.unique(index); remap=np.full(len(p),-1);remap[used]=np.arange(len(used));p,index=p[used],remap[index]
# Identify both openings, retaining the original closed nose and mouth topology.
eye_loops=[]
for side in (1,-1):
    candidates=[l for l in loops(index) if len(l)>12 and .15<side*p[l,0].mean()<.5 and abs(p[l,1].mean())<.15]
    if not candidates: raise ValueError('No eye opening on side '+str(side))
    eye_loops.append(max(candidates,key=len))
print('surface',len(p),len(index),'eye loops',list(map(len,eye_loops)),flush=True)
# The volume cut crosses an irregular triangulation. Fair each opening's
# ordered rim before fitting the lids, so its edge is a curve rather than a
# row of tiny triangular teeth. This is part of the neutral sculpt.
for row in eye_loops:
    for _ in range(3):
        rim=p[row].copy()
        p[row]=.5*rim+.25*(np.roll(rim,1,axis=0)+np.roll(rim,-1,axis=0))
# Rework the source into our sculpt: fuller temples and cheek plane, a small
# independent chin, less pointed jaw; gender changes nose, orbit and jaw together.
female=p.copy(); x=abs(p[:,0]); y=p[:,1]
# Narrow the reference's tall frontal nostril recesses into restrained folds.
# Preserve its continuous floor and septum rather than opening disconnected
# rims above the upper lip. These folds use the skin material and lighting.
nostril=(smooth(.015,.035,x)*(1-smooth(.08,.12,x))*np.exp(-((y-.375)/.075)**4)*(1-smooth(.30,.34,p[:,2])))
female[:,1]+=(.380-female[:,1])*.65*nostril
# Recess only the two small lower-wall bulges. The philtrum and columella
# remain continuous; a broad central recess would carve a V above the lips.
floor=np.exp(-((x-.055)/.030)**4-((y-.425)/.035)**4)*(1-smooth(.28,.32,p[:,2]))*smooth(.018,.035,x)
female[:,2]-=.025*floor
female[:,0] *= 1.025 - .10*smooth(.40,.98,y)
cheek=np.exp(-((x-.42)/.18)**2-((y-.35)/.23)**2)
female[:,2] += .022*cheek
mouth=np.exp(-(x/.28)**6-((y-.63)/.16)**4)
female[:,0] *= 1-.07*mouth
female[:,1] -= .012*np.exp(-((x-.19)/.06)**4-((y-.63)/.09)**4)
male=female.copy()
jaw=smooth(.35,.85,y)*(1-smooth(1.05,1.3,y)); side=smooth(.12,.5,x)
male[:,0] *= 1.035 + .09*jaw*side
male[:,2] -= .008*cheek
# A wider nose and mouth, restrained lip volume, squarer chin and stronger brow.
nose=np.exp(-(x/.21)**4-((y-.34)/.28)**4)
male[:,0] *= 1+.26*nose
male[:,2] += .024*nose
male[:,0] *= 1-.02*mouth
male[:,1] = male[:,1]+(.628-male[:,1])*.24*mouth
male[:,2] -= .018*mouth
male[:,2] += .018*np.exp(-(x/.24)**4-((y-.91)/.13)**2)
male[:,2] += .022*np.exp(-((x-.31)/.22)**4-((y+.12)/.09)**2)
# Male eye-to-chin height is longer while the native skull is only slightly
# wider. Match its transverse scale so the face cannot overhang the scalp.
male[:,0] *= .91
# Relax the wide-open, circular gaze into an almond opening. Keep the brow,
# orbital rim and folded lids; their shared anchors still drive full blinks.
# This is an authored default, not an asserted universal attractiveness ratio.
socket=np.exp(-((x-.31)/.21)**6-(y/.18)**4)
female[:,1] *= 1-.25*socket
male[:,1] *= 1-.32*socket
# The old sculpt put the pupils 77-81 mm apart on a 114-116 mm face.
# Balance an adult-width skull with closer-set eyes and coordinated eye
# openings. Pallett et al.'s pupil/ear-root measure is a useful guide,
# not a universal score (their experiments used female frontal photographs).
for q, width, brow_depth in [(female,1.10,.035),(male,1.13,.025)]:
    q[:,0] *= width
    ax=abs(q[:,0])
    orbit=(1-smoother(.46,.70,ax))*np.exp(-((q[:,1]+.025)/.29)**4)
    # A positive transverse scale preserves ordering across the nasal bridge.
    # Translating each orbit independently can fold the strip between them.
    q[:,0] *= 1-.27*orbit
    # Shorten the overlong nose-to-mouth interval without scaling the lips or
    # changing the eye line. The chin follows, fading into the native neck.
    q[:,1] -= .060*smoother(.34,.58,q[:,1])*(1-smoother(.90,1.25,q[:,1]))
    # Ease the frontal bone back from the source's high brow projection;
    # the crown and native skull then meet along a rounded profile.
    q[:,2] -= .075*smoother(-.05,-.30,q[:,1])*(1-smoother(-.70,-1.0,q[:,1]))
    brow=smoother(-.055,-.14,q[:,1])*(1-smoother(-.22,-.38,q[:,1]))
    q[:,2] -= brow_depth*brow*np.exp(-((abs(q[:,0])-.25)/.28)**4)
    nasal=np.exp(-(abs(q[:,0])/.22)**4-((q[:,1]-.30)/.26)**4)
    q[:,0] *= 1-(.20 if q is female else .12)*nasal
    q[:,2] -= (.045 if q is female else .030)*nasal*smoother(.08,.24,q[:,2])
# Keep the reference's eyelid folds. The ocular surface is fitted to the
# original ellipsoid below, rather than pulling skin onto an oversized globe.

r=json.load(open(driver)); source_ids=np.array(r['source']); triangles=np.array(r['index']).reshape(-1,3)
triangle_uv=np.array(r['triangleUv']).reshape(-1,3,2)
P={t:np.array(r[t]).reshape(-1,3) for t in 'FM'}; head=np.array(r['head']); eyes=np.array(r['eye']); ears=np.array(r['ears'])
frames={}; O={}
for t in 'FM':
    v=P[t]; ey=v[eyes,1].mean(); chin=v[source_ids[(head[source_ids]>.3)&(abs(v[source_ids,0])<.012)&(v[source_ids,2]>.02)],1].min(); E=ey-chin
    # Match eye height and depth to the body's own eye pivot, not the tip of
    # an unrelated nose. This frame scales with head and height sliders.
    ez=v[eyes,2].mean();frames[t]=(ey,ez,E);O[t]=np.c_[v[:,0]/E,(ey-v[:,1])/E,(v[:,2]-ez)/E]
# Continuous, shared bindings. The rest offsets compensate each body's own
# shape exactly, so the driver's coarse triangles never emboss the neutral face.
mid=(O['F']+O['M'])/2
body=np.unique(source_ids); body=body[head[body]>.05]
N=normals(mid,triangles)
# Restrict texture sampling to the external skin, outside folded mouth/nose.
outer=body[N[body,2]>.05]  # outward-facing skin in the y-down frame
K=12
query=(female+male)/2
def face_fade(q):
    depth=smoother(-.35,-.08,q[:,2])*(1-smoother(.45,.60,abs(q[:,0]))*(1-smoother(-.05,.10,q[:,2])))
    # Keep a broad forehead transition below the crown, with flat derivatives
    # at each end. The source's upper forehead is fitted back to the skull.
    return (1-smoother(.98,1.20,q[:,1]))*smoother(-.70,-.15,q[:,1])*depth*(1-smoother(.67,.85,abs(q[:,0])))
# The reference scalp has large triangles. Even with vertices on the native
# skull, their flat interiors cut through its curved surface. Refine only the
# seam, with shared edge midpoints so no T-junctions can open at its boundary.
for _ in range(5):
    fade=face_fade(query);split={}
    for tri in index:
        if fade[tri].max()==0:continue
        for a,b in ((tri[0],tri[1]),(tri[1],tri[2]),(tri[2],tri[0])):
            if min(fade[a],fade[b])<.98 and np.linalg.norm(query[a]-query[b])>.10:
                split[tuple(sorted((int(a),int(b))))]=0
    if not split:break
    for j,key in enumerate(sorted(split)):split[key]=len(p)+j
    pairs=np.array(sorted(split))
    p=np.vstack([p,p[pairs].mean(1)]);female=np.vstack([female,female[pairs].mean(1)]);male=np.vstack([male,male[pairs].mean(1)])
    refined=[]
    for tri in index:
        pieces=[list(tri)]
        for a,b in ((tri[0],tri[1]),(tri[1],tri[2]),(tri[2],tri[0])):
            at=split.get(tuple(sorted((int(a),int(b)))))
            if at is None:continue
            next_pieces=[]
            for row in pieces:
                if a in row and b in row:
                    for k in range(3):
                        u,v,w=row[k],row[(k+1)%3],row[(k+2)%3]
                        if {u,v}=={a,b}:next_pieces.extend([[u,at,w],[at,v,w]]);break
                else:next_pieces.append(row)
            pieces=next_pieces
        refined.extend(pieces)
    index=np.array(refined);query=(female+male)/2
fade=face_fade(query)
index=index[fade[index].max(1)>0];used=np.unique(index);remap=np.full(len(query),-1);remap[used]=np.arange(len(used));index=remap[index]
eye_loops=[[int(remap[v]) for v in row] for row in eye_loops]
p,female,male,query,fade=p[used],female[used],male[used],query[used],fade[used]
bind=nearest(query,mid[body],K); bind=body[bind]
distance=((mid[bind]-query[:,None])**2).sum(2)
weight=np.exp(-distance/(2*.105**2))+1e-12
# Separate the two lip rolls by their positions above/below the mouth line.
line=.565; band=(abs(query[:,0])<.29)&(abs(query[:,1]-line)<.11)
for i in np.flatnonzero(band):
    lip_side=p[i,1]-.625
    candidates=body[(np.array(r['lower'])[body]>np.array(r['upper'])[body]) if lip_side>0 else (np.array(r['upper'])[body]>=np.array(r['lower'])[body])]
    chosen=nearest(query[i:i+1],mid[candidates],K)[0];bind[i]=candidates[chosen]
    distance[i]=((mid[bind[i]]-query[i])**2).sum(1);weight[i]=np.exp(-distance[i]/(2*.10**2))+1e-12
weight/=weight.sum(1,keepdims=True)
# Bind the seam by rays from inside the skull. Closest-point projections can
# switch between front and side triangles at adjacent vertices, folding the
# face patch over itself. A radial map gives the whole seam one continuous
# direction. The mask's depth cutoff keeps it in front of the outer ear.
native_tri=np.flatnonzero((head[triangles]>.02).any(1));Tb=triangles[native_tri]
A=mid[Tb[:,0]];B=mid[Tb[:,1]];C=mid[Tb[:,2]]
e1=B-A;e2=C-A;origin=np.array([0.,-.05,-.35]);delta=origin-A
seam_uv=np.full((len(query),2),np.nan)
for v in range(len(query)):
    direction=query[v]-origin;direction/=np.linalg.norm(direction)
    h=np.cross(direction,e2);det=(e1*h).sum(1)
    inv=np.divide(1.,det,out=np.zeros_like(det),where=abs(det)>1e-12)
    u=inv*(delta*h).sum(1);cross=np.cross(delta,e1);w0=inv*(cross*direction).sum(1);depth=inv*(cross*e2).sum(1)
    valid=(abs(det)>1e-12)&(u>=-1e-8)&(w0>=-1e-8)&(u+w0<=1+1e-8)&(depth>0)
    if not valid.any():raise ValueError('No native skull intersection for seam vertex '+str(v))
    at=int(np.where(valid,depth,-np.inf).argmax())
    barycentric=np.array([1-u[at]-w0[at],u[at],w0[at]])
    if fade[v]<.9999:
        bind[v,:3]=Tb[at];bind[v,3:]=bind[v,0];weight[v]=0;weight[v,:3]=barycentric
    seam_uv[v]=(triangle_uv[native_tri[at]]*barycentric[:,None]).sum(0)

# Map our surface to Reactor's original skin charts, retaining its colors and
# ancestry/marking controls. UV neighbors may never mix opposite chart islands.
UV=np.full((len(mid),2),-1.)
for v,uv in zip(source_ids,np.array(r['uv']).reshape(-1,2)):
    if UV[v,0]<0:UV[v]=uv
outer=body[(UV[body,0]>=0)&(N[body,2]>.05)]
uv_ids=outer[nearest(query,mid[outer],6)];ud=((mid[uv_ids]-query[:,None])**2).sum(2)
uvs=UV[uv_ids];compatible=np.linalg.norm(uvs-uvs[:,:1],axis=2)<.12
uw=compatible/(ud+.001);uv=(uvs*uw[:,:,None]).sum(1)/uw.sum(1,keepdims=True)
# Keep frontal sampling out of the native nose/lid chart folds. At the
# boundary use its exact triangle chart, blending only within one UV island.
# Rays over the entire face would introduce hundreds of unnecessary seams.
same_chart=np.linalg.norm(uv-seam_uv,axis=1)<.12
blend=np.where(same_chart,fade,smoother(.02,.18,fade))
uv=seam_uv*(1-blend[:,None])+uv*blend[:,None]
# Both sexes share the same outside edge and face triangles. Only a narrow
# seam band follows the original head, leaving the cheeks free of cage facets.
fade=face_fade(query)
# Keep the source sculpt's authored shading normals at rest. Recomputed
# area-weighted normals differ by 20-120 degrees on the eyelid/lip folds.
nearN=nearest(p,sourceP,3);nd=((p[:,None]-sourceP[nearN])**2).sum(2);nw=1/(nd+1e-12);nw/=nw.sum(1,keepdims=True)
authored=(sourceN[nearN]*nw[:,:,None]).sum(1);authored/=np.maximum(1e-12,np.linalg.norm(authored,axis=1))[:,None]
sourceGeo=normals(p,index)
nasal=(abs(p[:,0])<.13)&(p[:,1]>.30)&(p[:,1]<.47)
authored[nasal]=sourceGeo[nasal]
# Shared topology is the essential gender contract: scalar metadata and vertex
# offsets interpolate; indices, skin bindings and all feature anchors stay put.
out={'version':2,'K':K}; extended=[];rimIn={};edge_map={}
for t in index:
    for a,b in ((t[0],t[1]),(t[1],t[2]),(t[2],t[0])):edge_map[(int(a),int(b))]=1
base_count=len(query);indices=[index];rims=[];lows=[];opening=[]
for k,l in enumerate(eye_loops):
    side=1 if k==0 else -1;q=query[l];a=int(np.argmax(q[:,0]*side));b=int(np.argmin(q[:,0]*side));n=len(l)
    paths=[]
    for step in (1,-1):
        row=[]
        for j in range(n):
            at=(a+step*j)%n;row.append(l[at])
            if at==b:break
        paths.append(row)
    up,low=sorted(paths,key=lambda row:query[row,1].mean());rims.append(up);lows.append(low);opening.append([l[a],l[b],float(np.ptp(q[:,0]))])
    loop=l if (l[1],l[0]) in edge_map else l[::-1]
    previous=loop
    for depth in (.35,.8):
        ring=list(range(base_count+len(extended),base_count+len(extended)+len(loop)))
        for v in loop:
            if depth==.35:rimIn[v]=base_count+len(extended)
            extended.append((v,k,depth))
        indices.append(np.array([(previous[j],previous[(j+1)%n],ring[(j+1)%n]) for j in range(n)]+[(previous[j],ring[(j+1)%n],ring[j]) for j in range(n)]))
        previous=ring
index=np.vstack(indices)
for t,q in [('F',female),('M',male)]:
    cage=(O[t][bind]*weight[:,:,None]).sum(1)
    # Move the outermost mask to the original skin; the authored centre remains
    # unchanged. This band lies by the temples, chin and hairline.
    pos=cage+(q-cage)*fade[:,None]
    # A broad, fair temporal plane joins orbit, forehead and cheek. Leave the
    # eyelid folds, lips and outermost native boundary exactly where laid.
    temporal=smoother(.34,.48,abs(query[:,0]))*(1-smoother(.62,.76,abs(query[:,0])))
    temporal*=smoother(-.85,-.50,query[:,1])*(1-smoother(.50,.78,query[:,1]))
    frontal=(1-smoother(.32,.50,abs(query[:,0])))*(1-smoother(-.32,-.18,query[:,1]))
    cheek=smoother(.22,.34,abs(query[:,0]))*(1-smoother(.56,.72,abs(query[:,0])))
    cheek*=smoother(.08,.25,query[:,1])*(1-smoother(.80,1.02,query[:,1]))
    fair=np.maximum(np.maximum(temporal,frontal),cheek)*smoother(.01,.12,fade)
    # Keep the folded lids and their immediate neighbors exact. The broad
    # temporal/forehead plane can be faired even where the sculpt owns it all.
    pinned=set(v for row in eye_loops for v in row)
    for _ in range(2):
        previous=pinned.copy()
        pinned.update(int(v) for tri in indices[0] if any(int(i) in previous for i in tri) for v in tri)
    fair[list(pinned)]=0
    pos=fair_surface(pos,indices[0],fair,passes=40)
    # Along the same radial field, keep the seam outside the skull. Projecting
    # on unrelated local tangent planes can create folds on a curved forehead.
    nativeN=normals(O[t],triangles)
    direction=cage-origin;direction/=np.maximum(1e-12,np.linalg.norm(direction,axis=1))[:,None]
    clearance=((pos-cage)*direction).sum(1)
    # Clearance tends continuously to zero at the authored face. A constant
    # offset switched at fade==1 left a narrow raised line around the patch.
    pos+=direction*(np.maximum(0,.003*(1-fade)**2-clearance)*(1-smoother(.98,1,fade)))[:,None]
    # A sphere behind each opening. Its front intersects the upper and lower
    # edges naturally; the lid's thickness supplies its stable centre.
    centers=[]
    for l in eye_loops:
        v=pos[l];c=(v.max(0)+v.min(0))/2;radius=np.ptp(v[:,0])*.525
        # A lid opening is narrower vertically than the ball. Place its centre
        # behind the mean lid by the depth implied by the horizontal radius.
        c[1]=0.;c[2]=0. if t=='F' else .003
        centers.append(c)
    pos0=pos.copy();pos=np.vstack([pos]+[ (pos[v]+(centers[k]-pos[v])*a)[None] for v,k,a in extended])
    ids=np.vstack([bind,bind[[v for v,k,a in extended]]]);w=np.vstack([weight,weight[[v for v,k,a in extended]]])
    C=(O[t][ids]*w[:,:,None]).sum(1);off=pos-C
    uv2=np.vstack([uv,uv[[v for v,k,a in extended]]]);fade2=np.r_[fade,np.ones(len(extended))]
    # Hide only skin under the mask. The rear skull, ears and neck stay native.
    # Hide only native skin actually covered by the new surface. A rectangular
    # head-domain test removed ears/temples where the mask had no triangles.
    from PIL import Image,ImageDraw,ImageFilter
    size=768;coverage=Image.new('L',(size,size));draw=ImageDraw.Draw(coverage)
    project=lambda z:np.c_[(z[:,0]+1.1)/2.2*(size-1),(z[:,1]+1.3)/2.8*(size-1)]
    xy=project(pos0)
    for tri in index[:len(indices[0])]:draw.polygon([tuple(xy[i]) for i in tri],fill=255)
    # The native eye folds stay hidden behind the replacement's open sockets.
    # Otherwise opening the mask resurrects a second set of lids and exports
    # all their unused expression deltas.
    for row in eye_loops:draw.polygon([tuple(xy[i]) for i in row],fill=255)
    coverage=np.array(coverage.filter(ImageFilter.MinFilter(5)))
    z=O[t][source_ids];sample=np.rint(project(z)).astype(int);valid=(sample[:,0]>=0)&(sample[:,0]<size)&(sample[:,1]>=0)&(sample[:,1]<size)&(z[:,2]>-.48)
    own=np.zeros(len(source_ids),bool);own[valid]=coverage[sample[valid,1],sample[valid,0]]>0
    # Keep the posterior skull, but remove folded native lids and mouth skin
    # under the face too. A normal-facing test retains those hidden folds and
    # needlessly exports their expression deltas alongside the replacement.
    hide=np.unique(source_ids[own & (ears[source_ids]<.02) & (z[:,2]>-.16)])
    # Lip paint comes from the sculpt's outer roll. These proportions are shared
    # with the feature mesh rather than baked onto the hidden driver's mouth.
    corner=(.192 if t=='F' else .182)*(1.10 if t=='F' else 1.10*.91*1.13);line=.565
    ts=np.linspace(0,1,41);drop=-.010*np.sin(ts*np.pi)-.006*ts**4
    up=(.064 if t=='F' else .050)*(1-ts**1.8);low=(.077 if t=='F' else .058)*(1-ts**2.2)
    lip_ids=np.flatnonzero((abs(pos0[:,0])<.02)&(abs(pos0[:,1]-line)<.08))
    mid_id=int(lip_ids[np.argmax(pos0[lip_ids,2])]);ends=[int(np.argmin((pos0[:,0]-s*corner)**2+(pos0[:,1]-line)**2)) for s in (1,-1)]
    lip=dict(corner=corner,line=line,drop=drop.tolist(),up=up.tolist(),low=low.tolist(),mid=mid_id,midY=float(pos0[mid_id,1]),ends=ends,endX=float(abs(pos0[ends[0],0]-pos0[ends[1],0])/2))
    # Keep the authored folds without the earlier curvature-darkening band
    # over the eyes. Only local nasal visibility and the oral interior tint
    # supplement the native cage's occlusion.
    restN=normals(pos,index)
    # Retain the reference's folded eye/lip shading, but do not carry its
    # unrelated temple curvature onto the newly fitted skull transition.
    detail=(1-smoother(.30,.50,abs(query[:,0])))*smoother(-.10,.10,query[:,2])
    detail[list(pinned)]=1
    chosen=normals(pos0,indices[0])+(authored-sourceGeo)*detail[:,None]
    # Broad cheek and forehead planes need a continuous shading field, while
    # the eyelids, nostrils and lip folds retain their authored detail.
    soft=smoother(.20,.34,abs(query[:,0]))*(1-smoother(.56,.72,abs(query[:,0])))
    soft*=smoother(.10,.25,query[:,1])*(1-smoother(.80,1.02,query[:,1]))
    soft=np.maximum(soft,(1-smoother(.42,.62,abs(query[:,0])))*(1-smoother(-.35,-.15,query[:,1])))
    soft*=smoother(.05,.25,fade);soft[list(pinned)]=0
    edges=np.unique(np.sort(np.vstack([indices[0][:,[0,1]],indices[0][:,[1,2]],indices[0][:,[2,0]]]),axis=1),axis=0)
    a,b=edges.T;degree=np.bincount(np.r_[a,b],minlength=base_count)
    for _ in range(4):
        total=np.zeros_like(chosen);np.add.at(total,a,chosen[b]);np.add.at(total,b,chosen[a])
        chosen+=(total/np.maximum(1,degree[:,None])-chosen)*(soft*.55)[:,None]
    chosen=chosen*fade[:,None]+restN[:base_count]*(1-fade[:,None]);chosen=np.vstack([chosen,restN[base_count:]])
    chosen/=np.maximum(1e-12,np.linalg.norm(chosen,axis=1))[:,None];chosen[:,1]*=-1;restN[:,1]*=-1
    tone0=np.ones(len(p))
    # Native AO misses the sculpt's small nasal folds, leaving their floors
    # conspicuously bright. Use bounded local visibility, retaining skin color
    # and a soft floor rather than the older near-black nostril paint.
    nasal_visibility=cavity_visibility(pos0,indices[0],np.flatnonzero(nasal))
    tone0[nasal]=.4+.6*np.sqrt(nasal_visibility[nasal])
    # Only inward mouth folds receive cavity color; external lip rolls retain
    # skin/lip controls. Painting the folded interior as lips makes a pink cap
    # across an open mouth.
    oral=(abs(p[:,0])<.26)&(abs(p[:,1]-.62)<.09)&(authored[:,2]<-.10)
    tone0[oral]=.12
    tone_all=np.r_[tone0,np.ones(len(extended))]
    out[t]=dict(authoredNormals=np.round(chosen.ravel(),6).tolist(),restNormals=np.round(restN.ravel(),6).tolist(),off=np.round(off.ravel(),6).tolist(),bind=ids.ravel().tolist(),w=np.round(w.ravel(),7).tolist(),uv=np.round(uv2.ravel(),6).tolist(),index=index.ravel().tolist(),hide=hide.tolist(),fade=np.round(fade2,5).tolist(),lidFrom=base_count,tone=np.round(tone_all,5).tolist(),nostril=[],lip=lip,rim=rims,low=lows,rimIn=[[rimIn[v] for v in row] for row in rims],lowIn=[[rimIn[v] for v in row] for row in lows],opening=opening,radii=[[.145*(1.10 if t=='F' else 1.13)*.73,.148*.82,.123*.90]]*2,eyeHeight=[float(np.ptp(pos0[l,1])) for l in eye_loops],eye=[dict(s=1,dx=0,dy=0,dz=0)]*2)
    print(t,'vertices',len(pos),'triangles',len(index),'hidden',len(hide),flush=True)
# Hide the same native vertices and use the same feature anchors at every gender.
shared_hide=sorted(set(out['F']['hide']) & set(out['M']['hide']))
for t in 'FM':
    out[t]['hide']=shared_hide
    out[t]['lip']['mid']=out['F']['lip']['mid']
    out[t]['lip']['ends']=out['F']['lip']['ends']
common_keys=['bind','w','uv','index','hide','fade','lidFrom','rim','low','rimIn','lowIn','opening','eye']
out['common']={key:out['F'][key] for key in common_keys}
for t in 'FM':
    for key in common_keys:del out[t][key]
# Reject incomplete topology/metadata before atomically replacing working data.
count=len(out['F']['off'])//3
for field in ['rim','low','rimIn','lowIn']:
    assert all(0<=v<count for row in out['common'][field] for v in row),field
assert all(0<=v<count for v in out['common']['index'])
assert all(0<=v<count and 0<=w<count and span>0 for v,w,span in out['common']['opening'])
out['provenance']={'title':'Woman head','author':'zhuoyi0904','license':'CC-BY-4.0','source':'https://sketchfab.com/3d-models/woman-head-34af2e5bf1464a5fa87ef37db5389f23','sourceSha256':hashlib.sha256(Path(source).read_bytes()).hexdigest(),'driverSha256':hashlib.sha256(Path(driver).read_bytes()).hexdigest(),'generatorSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
text='''/** Shared human face sculpt, generated by tests/tools/face-proportions/build_head.py.
 * Derived/reworked from Woman head by zhuoyi0904, CC-BY 4.0. See THIRD_PARTY_NOTICES.md.
 * The two endpoints share topology and bindings. No reference textures or rig are included. */
(function(root) { const data = '''+json.dumps(out,separators=(',',':'),allow_nan=False)+''';
root.RR_HEAD_MESH = data;
if (typeof module !== 'undefined' && module.exports) module.exports = data;
})(typeof window !== 'undefined' ? window : globalThis);
'''
target=Path(output)
staged=target.with_name(target.name+'.'+str(os.getpid())+'.tmp')
try:
    staged.write_text(text)
    staged.replace(target)
finally:
    staged.unlink(missing_ok=True)
print('Wrote',output,len(text),'bytes; SHA256',hashlib.sha256(text.encode()).hexdigest(),flush=True)
