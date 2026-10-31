/** Standalone armor has a fitted inner skin, with valid tangent coordinates on every face. */
(function(root){'use strict';
function repairUvs(part){
 if(!part.normalTexture)return;
 const F=root.RRCharacterFabric||(typeof require==='function'?require('../Character3D/CharacterFabric.js'):null);
 const span=part.fabric&&F.tile(part.fabric)?.span||[1/12,1/12];
 part.uvs1=F.surfaceUvs(part,span,part.uvs1);
 part.normalTexCoord=1;part.metallicRoughnessTexCoord=1;part.occlusionTexCoord=1;
}
function apply(parts,scale){
 for(const p of parts.slice()){
  if(!/^(Medieval (breastplate|pauldrons|greaves|vambraces|tassets)|Recon formed plating|Recon knee shells|Power armor plating|Cyber)/.test(p.name))continue;
  p.doubleSided=true;repairUvs(p);
  if(/edges|etching|straps|lights|hardware|tapes|seams/i.test(p.name))continue;
  const I=Uint32Array.from(p.index);for(let i=0;i<I.length;i+=3)[I[i+1],I[i+2]]=[I[i+2],I[i+1]];
  const q={...p,name:p.name+' fitted interior',positions:Float32Array.from(p.positions,(x,i)=>x-p.normals[i]*.0012*scale),normals:Float32Array.from(p.normals,x=>-x),index:I,rrLining:true,doubleSided:false,colors:p.colors?Float32Array.from(p.colors,x=>x*.66):undefined,roughness:.77,metalness:.18};parts.push(q);
 }
 return parts;
}
const api={apply,repairUvs};root.RRPropArmorInterior=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
