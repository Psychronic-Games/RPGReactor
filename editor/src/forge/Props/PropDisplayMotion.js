/** Exportable instruments: continuous skinned traces and independently driven meter bars. */
(function(root){'use strict';
const CM=root.RRContainerMesh||(typeof require==='function'?require('./ContainerMesh.js'):null),{add,sub,scale,norm,cross}=CM.vec;
function attach(result,plates,{color='#64e5ce',speed=1,name='Instrument telemetry'}={}){
 const duration=result.clips[0]?.times?.at(-1)||8,times=Float32Array.from({length:65},(_,i)=>i/64*duration),tracks=[],bones=result.bones,parts=[];
 for(const [screen,m]of plates.entries()){
  const at=i=>Array.from(m.positions.subarray(i*3,i*3+3)),a=at(0),b=at(1),c=at(2),u=norm(sub(b,a)),v=norm(sub(c,b)),n=norm(cross(u,v)),w=Math.hypot(...sub(b,a)),h=Math.hypot(...sub(c,b));
  const point=(x,y)=>add(add(add(a,scale(u,w*x)),scale(v,h*y)),scale(n,.0009)),p=[],N=[],uv=[],joints=[],weights=[],I=[];
  const vertex=(q,bone)=>{const id=p.length/3;p.push(...q);N.push(...n);uv.push(0,0);joints.push(bone,0,0,0);weights.push(1,0,0,0);return id;};
  const quad=(A,B,C,D)=>I.push(A,B,C,B,D,C);
  const offset=(bone,base,dy)=>tracks.push({bone,path:'translation',times,values:Float32Array.from(Array.from(times).flatMap(t=>add(base,scale(v,dy(t)))))});
  // A ribbon shares its endpoint joints: the waveform remains a connected trace in every frame.
  const rows=[];for(let k=0;k<=24;k++){const base=point(.40+k/24*.53,.47),bone=bones.length;bones.push({name:'Telemetry '+screen+' sample '+k,head:base,parent:0});
   offset(bone,base,t=>h*.15*Math.sin(k/24*Math.PI*4-t*Math.PI/2*speed)*(.58+.22*Math.cos(k*.8)));
   rows.push([vertex(add(base,scale(v,-h*.003)),bone),vertex(add(base,scale(v,h*.003)),bone)]);}
  for(let k=0;k<24;k++)quad(rows[k][0],rows[k+1][0],rows[k][1],rows[k+1][1]);
  for(let k=0;k<7;k++){const left=point(.075,.20+k*.075),base=add(left,scale(u,w*.26)),bone=bones.length;bones.push({name:'Telemetry '+screen+' meter '+k,head:base,parent:0});const top=scale(v,h*.025);quad(vertex(left,0),vertex(base,bone),vertex(add(left,top),0),vertex(add(base,top),bone));
   tracks.push({bone,path:'translation',times,values:Float32Array.from(Array.from(times).flatMap(t=>{const q=.35+.55*(.5+.5*Math.sin(t*Math.PI/2*speed+k*.9));return add(base,scale(u,w*.26*(q-1)));}))});}
  parts.push({name:'Live display '+screen,positions:Float32Array.from(p),normals:Float32Array.from(N),uvs:Float32Array.from(uv),joints:Uint8Array.from(joints),weights:Float32Array.from(weights),index:Uint32Array.from(I),color,emissive:color,emissiveIntensity:1.2,roughness:.4,metalness:0,doubleSided:true});
 }
 if(tracks.length){if(result.clips.length){const clip=result.clips[0];clip.tracks.push(...tracks);}else result.clips.push({id:'telemetry',name,times,tracks});result.parts.push(...parts);result.triangles+=parts.reduce((s,p)=>s+p.index.length/3,0);}
 return result;
}
const api={attach};root.RRPropDisplayMotion=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
