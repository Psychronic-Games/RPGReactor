'use strict';const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),W=require('../src/forge/Character3D/CharacterWardrobe.js');
test('the actual outfit tab starts with Basics and Everyday and keeps all outfit tiles',()=>{
 const context={window:{},sessionStorage:{getItem:()=>null},RRCharacterWardrobe:W,RRCharacterModel:{fitsGarment:()=>true},rrEscapeHtml:s=>s};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/forge/Character3D/Character3DBuilder.js'),'utf8')+'\nglobalThis.B=Character3DBuilder;',context);
 const b=Object.create(context.B.prototype);Object.assign(b,{recipe:{outfit:[]},_loadOutfitEmblems(){},_bindOutfitActions(){},_project:()=>null,_t:s=>s,_tile:(act,id)=>'<tile id="'+id+'">',_section:s=>s,_addPicker:()=>'',_heldModels:()=>[]});
 const html=b._outfitTab(),groups=[...html.matchAll(/rr-c3d-subhead">([^<]+)/g)].map(m=>m[1]);assert.deepEqual(groups.slice(0,2),['Basics','Everyday']);assert.ok(groups.indexOf('Everyday')<groups.indexOf('Sci-fi'));for(const p of W.PRESETS)assert.ok(html.includes('id="'+p.id+'"'),p.id);
});
