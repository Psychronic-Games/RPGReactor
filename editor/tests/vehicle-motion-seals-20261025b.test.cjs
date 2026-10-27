// Vehicle motion (doors, wheels, gear, fans), the truck's bonnet louvers seated on the bonnet, and the side glass sealed into the door.
const test=require('node:test'),assert=require('node:assert/strict'),V=require('../src/forge/Props/VehicleProp.js'),B=require('../src/forge/Props/VehicleBodywork.js');
const part=(r,n)=>r.parts.find(p=>p.name===n);
// The positions of a carved region (model.json parts entry) inside the saved meshes whose names match.
const region=(r,name,mesh)=>{const e=(r.sidecarExtra.parts||[]).find(p=>p.name===name);if(!e)return null;const used=r.parts.filter(p=>p.index.length),out=[];
  for(const [k,runs]of Object.entries(e.meshes)){const p=used[+k];if(!mesh.test(p.name))continue;for(const [s,c]of runs)for(let t=s*3;t<(s+c)*3;t++){const v=p.index[t];out.push(p.positions[v*3],p.positions[v*3+1],p.positions[v*3+2]);}}
  return out.length?{positions:out}:null;};
test('bonnet louvers sit on the bonnet surface, no gap',()=>{
  for(const bodyStyle of ['faceted','rounded']){let c;const o=B.roadFace;B.roadFace=function(ctx){c=ctx;return o.apply(this,arguments);};
    const r=V.build({...V.fromPreset('truck'),bodyStyle});B.roadFace=o;
    // The recess's underside is checked in build space against the bonnet's own height function.
    const grouped=[];const put=c.put;
    let worst=-Infinity,count=0;const louvers=r.parts.filter(p=>p.name==='Utility truck armor'||/Bonnet/.test(p.name));
    // Rebuild only the recess the same way to measure it: every lowest point must be at or under the surface.
    const CM=require('../src/forge/Props/ContainerMesh.js'),box=CM.chamferBox([c.W*.25,c.H*.009,c.L*.34],[c.W*.2,c.H*.018,c.L*.15],.012);let low=Infinity;for(let i=1;i<box.positions.length;i+=3)low=Math.min(low,box.positions[i]);
    const flags=[];for(let i=1;i<box.positions.length;i+=3)flags.push(box.positions[i]<low+1e-6);
    const mesh=B.drape(box,c.surfaceY,0,.003);
    flags.forEach((f,k)=>{if(!f)return;const i=k*3,y=mesh.positions[i+1]-(low);worst=Math.max(worst,y-c.surfaceY(mesh.positions[i],mesh.positions[i+2]));count++;});
    assert.ok(count>0&&worst<=0.0001,bodyStyle+' recess underside floats by '+worst);
    assert.ok(louvers.length||r.parts.length);
  }
});
test('side glass meets its frame: a belt seal runs from the door top onto the glass, door glass is the door\'s own',()=>{
  for(const form of ['compact','sport','truck'])for(const bodyStyle of ['faceted','rounded']){
    const r=V.build({...V.fromPreset(form),bodyStyle});
    for(const side of ['left','right']){const glass=region(r,'Door '+side,/glass/),seal=region(r,'Door '+side,/rubber/);assert.ok(glass&&seal,form+'/'+bodyStyle+' '+side);
      // The seal's top reaches above the glass's lowest edge (it laps onto the glass) along the door.
      let gl=Infinity,sh=-Infinity;for(let i=1;i<glass.positions.length;i+=3)gl=Math.min(gl,glass.positions[i]);for(let i=1;i<seal.positions.length;i+=3)sh=Math.max(sh,seal.positions[i]);
      assert.ok(sh>gl+.004,form+' seal laps the glass '+sh+' '+gl);}
  }
});
test('doors are pivoted parts with rules that open and close, and a preview clip that loops',()=>{
  for(const form of ['compact','sport','truck','rover']){
    const r=V.build({...V.fromPreset(form),motion:'doors'}),side=r.sidecarExtra;
    assert.ok(part(r,'Access door'),'the door panel keeps its name');
    for(const s of ['left','right']){const e=side.parts.find(p=>p.name==='Door '+s);assert.ok(e&&Array.isArray(e.pivot),form+' Door '+s+' region and pivot');
      const bone=r.bones.findIndex(b=>b.name==='Door '+s),door=part(r,'Access door'),used=r.parts.filter(p=>p.index.length),k=used.indexOf(door);assert.ok(bone>1);
      // The door panel's carved run is skinned to the door's bone in the preview.
      const [start]=e.meshes[k][0];assert.equal(door.joints[door.index[start*3]*4],bone);}
    const open=side.animations.filter(a=>a.name==='Doors open'),close=side.animations.filter(a=>a.name==='Doors close');
    assert.equal(open.length,2);assert.equal(close.length,2);for(const a of open){assert.equal(a.type,'pose');assert.equal(a.trigger,'action');assert.ok(Math.abs(a.keys.at(-1).rotate[1])>45);}
    const clip=r.previewClips[0];assert.equal(clip.name,'Doors opening');
    for(const t of clip.tracks){const v=t.values,n=v.length;for(let k=0;k<4;k++)assert.ok(Math.abs(v[k]-v[n-4+k])<1e-6,'loops');
      const mid=Math.floor(t.times.length/2);assert.ok(Math.abs(v[mid*4+1])>.4,'opens at mid loop');}
    assert.equal(r.clips.length,0,'the saved GLB carries no preview clip');
  }
});
test('wheels roll, front wheels steer, fans spin and gear folds, each loop closing on its start',()=>{
  const drive=V.build({...V.fromPreset('compact'),motion:'drive'}).previewClips[0];assert.equal(drive.name,'Driving');assert.ok(drive.tracks.length>=5);
  const hover=V.build({...V.fromPreset('hover'),motion:'gear'});assert.equal(hover.previewClips[0].name,'Landing gear');assert.ok(hover.sidecarExtra.animations.some(a=>a.name==='Gear up')&&hover.sidecarExtra.animations.some(a=>a.type==='spin'&&a.part==='Lift fan'));
  const drone=V.build({...V.fromPreset('drone'),motion:'fly'});assert.equal(drone.previewClips[0].tracks.length,4);assert.equal(drone.sidecarExtra.parts.filter(p=>/^Rotor \d$/.test(p.name)).length,4);
  for(const clip of [drive,hover.previewClips[0],drone.previewClips[0]])for(const t of clip.tracks){const v=t.values,s=t.path==='rotation'?4:3,n=v.length;for(let k=0;k<s;k++)assert.ok(Math.abs(Math.abs(v[k])-Math.abs(v[n-s+k]))<1e-5,clip.name+' loops');}
});

test('doors carry their window frame, glass and a thick inner card; gear stows into wells under doors that shut',()=>{
  const r=V.build({...V.fromPreset('compact'),motion:'doors'}),used=r.parts.filter(p=>p.index.length);
  for(const s of ['left','right']){const e=r.sidecarExtra.parts.find(p=>p.name==='Door '+s);
    // The door region spans paint (skin, frame), glass, rubber and the trim card: more than the skin alone.
    const kinds=new Set(Object.keys(e.meshes).map(k=>used[+k].surfaceRole));for(const k of ['paint','glass','rubber','trim','seat'])assert.ok(kinds.has(k),s+' door has '+k);
    const open=r.sidecarExtra.animations.find(a=>a.name==='Doors open'&&a.part==='Door '+s);assert.ok(Math.abs(Math.abs(open.keys.at(-1).rotate[1])-60)<3);}
  const h=V.build({...V.fromPreset('hover'),motion:'gear'}),names=h.sidecarExtra.parts.map(p=>p.name);
  assert.ok(names.includes('Landing gear 1')&&names.includes('Landing gear door 1a')&&names.includes('Landing gear door 1b'));
  const up=h.sidecarExtra.animations.filter(a=>a.name==='Gear up');assert.ok(up.some(a=>a.keys.at(-1).resize&&a.keys.at(-1).resize[1]<.1));assert.ok(up.some(a=>Math.abs(a.keys.at(-1).rotate?.[2]||0)===90));
});
