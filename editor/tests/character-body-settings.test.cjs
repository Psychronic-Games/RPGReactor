'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const Q=require('./helpers/character-quality-matrix.cjs');
const scope={window:{RRMerfolkBody:Q.Merfolk},console,RRCreatureBody:Q.Creature,RRCharacterSpecies:Q.Species,RRHumanBody:Q.Body,RRSlimeBody:Q.Slime,RRMerfolkBody:Q.Merfolk};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../src/forge/Character3D/Character3DBuilder.js'),'utf8'),scope);
function ui(recipe){const b=Object.create(scope.window.Character3DBuilder.prototype);return Object.assign(b,{recipe,_t:s=>s,_section:s=>'['+s+']',_tile:()=>'',_select:(key,label,choices)=>'{'+key+':'+choices.map(c=>c[0]).join(',')+'}',_slider:s=>'{'+s.path+'}',_color:key=>'{'+key+'}',_toggle:key=>'{'+key+'}',_extremeToggle:()=>'',_bodyHairSection:()=>''});}

test('all creature types keep their selectors and dimensions in Body, with no stale species controls',()=>{
 const b=ui(Q.Creature.kindRecipe('shark'));
 for(const k of Q.Creature.KINDS){b.recipe=Q.Creature.kindRecipe(k.kind);const picker=b._speciesTab(),body=b._bodyTab();assert.ok(!picker.includes('{'),'species picker only chooses a species');assert.ok(!body.includes('{morphology:'),'catalog entries keep their own body family');assert.ok(!body.includes('[Features]'));
  for(const v of Q.Creature.variantsFor(b.recipe)){assert.ok(body.includes('{'+v.key+':'));for(const [choice]of v.choices){b.recipe=Q.Creature.withVariant(b.recipe,v.key,choice);assert.ok(b._bodyTab().includes('{'+v.key+':'));}}
 }
 b.recipe=Q.Creature.kindRecipe('whale');assert.ok(!b._bodyTab().includes('sharkType'));b.recipe=Q.Creature.kindRecipe('worm');assert.ok(!b._bodyTab().includes('whaleType'));
});

test('type choices sit beside their own sliders and inactive part dimensions disappear',()=>{
 const r=Q.Creature.normalizeRecipe({...Q.Creature.kindRecipe('horse'),horns:'none',ears:'none',tail:'none',wings:'none',mane:'none'}),b=ui(r),html=b._bodyTab();
 for(const key of ['hornSize','earSize','earDroop','tailLength','tailThickness','tailCurl','wingSize','maneSize'])assert.ok(!html.includes('{'+key+'}'),key);
 b.recipe={...r,horns:'bull',ears:'pointed',tail:'long',wings:'bat',mane:'horse'};const shown=b._bodyTab();
 for(const [section,key]of [['Head','earSize'],['Tail','tailLength'],['Horns','hornSize'],['Wings','wingSize']]){const start=shown.indexOf('['+section+']'),next=shown.indexOf('[',start+1);assert.ok(shown.slice(start,next<0?undefined:next).includes('{'+key+'}'),section+'/'+key);}
});

test('humanoid, merfolk and slime customization belongs to their Body tab',()=>{
 const b=ui(Q.Model.withSpecies({},'insectfolk'));let body=b._bodyTab();assert.ok(body.includes('{features.arms.size}'));assert.ok(body.includes('{features.antennae.size}'));assert.ok(!b._speciesTab().includes('{features.'));assert.ok(!body.includes('[Features]'));
 b.recipe=Q.Model.withSpecies({},'human');body=b._bodyTab();assert.ok(!body.includes('{features.arms.size}'));assert.ok(body.includes('{features.arms.type:'));
 b.recipe=Q.Model.withSpecies({},'merfolk');body=b._bodyTab();assert.ok(body.includes('{merfolk.fin:'));assert.ok(!body.includes('{features.tail.type:'));
 b.recipe=Q.Model.normalize({plan:'slime'});assert.ok(b._tabs().some(t=>t[0]==='body'));assert.ok(b._bodyTab().includes('{form}'));assert.ok(!b._speciesTab().includes('{form}'));
});


test('plain coats hide pattern dimensions and fixed arthropod shells hide segment counts',()=>{
 const b=ui(Q.Creature.normalizeRecipe({...Q.Creature.kindRecipe('beetle'),pattern:'solid'}));
 assert.ok(!b._bodyTab().includes('{segments}'));assert.ok(!b._colorsTab().includes('{patternScale}'));assert.ok(!b._colorsTab().includes('{patternAmount}'));
 b.recipe={...b.recipe,pattern:'stripes'};assert.ok(b._colorsTab().includes('{patternScale}'));assert.ok(b._colorsTab().includes('{patternAmount}'));
 b.recipe={...Q.Creature.kindRecipe('jellyfish'),appendages:0};assert.ok(!b._bodyTab().includes('{appendageLength}'));
 b.recipe={...Q.Creature.kindRecipe('shark'),jawOpen:0};assert.ok(!b._bodyTab().includes('{toothSize}'));
 b.recipe=Q.Creature.withVariant(Q.Creature.kindRecipe('worm'),'wormType','roundworm');assert.ok(!b._bodyTab().includes('{headSize}'));
 b.recipe=Q.Creature.withVariant(b.recipe,'wormType','goauld');assert.ok(!b._colorsTab().includes('{pattern:'));
 b.recipe=Q.Creature.kindRecipe('centipede');assert.ok(b._bodyTab().includes('{segments}'));
 b.recipe={...Q.Creature.kindRecipe('horse'),feet:'hoof'};assert.ok(!b._bodyTab().includes('{plantigrade}'));
});


test('discrete creature counts display as counts rather than percentages',()=>{
 const b=ui(Q.Creature.kindRecipe('jellyfish'));assert.equal(b._format('count',12),'12');assert.equal(b._format('count',2),'2');assert.equal(b._format('count',0),'0');
 let countControls=0;b._slider=s=>{if(['appendages','eyeCount'].includes(s.path)){assert.equal(s.format,'count');countControls++;}return '';};b._bodyTab();assert.equal(countControls,2);
});
