const done=arguments[arguments.length-1];
(async()=>{
 const db=window.__auditDatabase||reactor.databaseEditorUI,dm=reactor.databaseManager,dialogs=[];
 const clone=x=>JSON.parse(JSON.stringify(x)), wait=ms=>new Promise(r=>setTimeout(r,ms));
 const first=type=>clone(dm.data[type].find(e=>e&&e.id>0));
 const run=async(name,show,entry,save=false)=>{
  const row={name},before=entry&&JSON.stringify(entry),errors=__previewErrors.length;
  const existing=new Set(document.querySelectorAll('body *'));let saved=false;
  try{
   show(()=>{saved=true;});await wait(10);
   const overlays=[...document.querySelectorAll('[class*="modal"]')].filter(e=>e.getClientRects().length);
   row.controls=overlays.reduce((n,e)=>n+e.querySelectorAll('input,select,textarea').length,0);
   if(window.__auditTheme)row.theme=window.__auditTheme();
   const buttons=[...document.querySelectorAll('button')].filter(e=>e.getClientRects().length&&!e.disabled);
   const button=buttons.filter(e=>(save?/^(OK|Save|Apply)$/:/^(Cancel|Close)$/).test(e.textContent.trim())).at(-1);
   if(button){button.click();await wait(5);}else row.noCloseButton=true;
   if(save)row.saved=saved;
   else if(entry)row.cancelPreserved=before===JSON.stringify(entry);
  }catch(e){row.error=String(e.stack);}
  row.errors=__previewErrors.slice(errors);dialogs.push(row);
  // Remove new roots only, preserving the underlying database and its controls.
  for(const e of document.querySelectorAll('body > *'))if(!existing.has(e)&&!['SCRIPT','STYLE'].includes(e.tagName))e.remove();
 };
 for(const code of [11,12,13,14,21,22,23,31,32,33,34,41,42,43,44,51,52,53,54,55,61,62,63,64]){
  const entry=first('classes');entry.traits=[{code,dataId:1,value:1}];
  await run(`Trait ${code}`,cb=>{db.classEditor.traitEditor.showTraitEditorModal(entry,0,cb);document.querySelector('input[name="trait-type"]:checked')?.dispatchEvent(new Event('change'));},entry,true);
 }
 for(const code of [11,12,13,21,22,31,32,33,34,41,42,43,44]){
  const entry=first('items');entry.effects=[{code,dataId:1,value1:1,value2:0}];
  await run(`Effect ${code}`,cb=>db.itemEditor.effectEditor.showEffectEditorModal(entry,0,cb),entry,true);
 }
 const cls=first('classes');
 for(let i=0;i<8;i++)await run(`Parameter curve ${i}`,()=>db.classEditor.showParameterCurveModal(cls,i,'Parameter','#cf5f5f'),cls);
 await run('EXP curve',()=>db.classEditor.showExpCurveModal(cls),cls);
 await run('Class learning',()=>db.classEditor.showLearningEditorModal(cls,-1),cls);
 const enemy=first('enemies');
 for(let i=0;i<7;i++)await run(`Enemy action condition ${i}`,()=>db.enemyEditor.showActionEditorModal(enemy,-1,{skillId:1,rating:5,conditionType:i,conditionParam1:0,conditionParam2:0}),enemy);
 const troop=first('troops');db.troopEditor.currentTroop=troop;
 await run('Troop conditions',()=>db.troopEditor.showConditionsModal(troop.pages[0]),troop);
 const anim={id:1,name:'Audit sprite',animation1Name:'',animation2Name:'',frames:[[[0,0,0,100,0,0,255,0]]],timings:[]};
 await run('Animation cell',()=>db.animationEditor.showCellPropertiesModal(anim,0,0,()=>{}),anim);
 return {dialogs};
})().then(done,e=>done({error:String(e.stack)}));
