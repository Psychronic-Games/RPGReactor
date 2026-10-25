const phase=arguments[0],done=arguments[arguments.length-1];
(async()=>{
 const db=reactor.databaseEditorUI,dm=reactor.databaseManager,wait=ms=>new Promise(r=>setTimeout(r,ms));
 const __cancelDb=async()=>{const c=reactor.databaseEditorUI.callbacks,o=c.showConfirm;c.showConfirm=async()=>true;try{document.getElementById('database-cancel-btn').click();await new Promise(r=>setTimeout(r,30));}finally{c.showConfirm=o;}};
 db.setCurrentProject(reactor.projectController.currentProject);
 const failures=[],checks=[];
 const check=(name,ok,detail)=>{checks.push(name);if(!ok)failures.push({name,detail});};
 const entry=type=>dm.data[type]?.find?.(e=>e&&e.id>0);
 const show=type=>{db.openDatabase(type);const e=entry(type);if(e)db.showDatabaseDetail(e,type);return e;};
 if(phase==='workflows'){
  const types=['actors','classes','skills','items','weapons','armors','enemies','troops','states','animations','tilesets','commonEvents','userInterfaces','quests'];
  if(!entry('quests'))dm.data.quests=[null,DatabaseQuestEditor.normalize({id:1,name:'Audit quest'})];
  for(const type of types){
   const record=show(type),name=record.name,id=record.id;
   const findName=()=>[...document.querySelectorAll('#database-detail input')].find(e=>e.type==='text'&&e.value===record.name);
   const field=findName();if(!field){check(`${type} name field`,false);continue;}
   field.value=`Sequence ${type}`;field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));
   show(type==='items'?'actors':'items');show(type);await wait(25);
   const found=[...document.querySelectorAll('#database-detail input')].some(e=>e.value===`Sequence ${type}`);
   check(`${type}: edit → leave → return`,dm.data[type][id].name===`Sequence ${type}`&&found);
   await __cancelDb();
   check(`${type}: Cancel restores original`,dm.data[type][id].name===name);
  }
  // Apply becomes the next Cancel baseline, verified in the disposable files.
  let actor=show('actors');const oldName=actor.name;actor.name='Applied sequence';
  const oldSave=db.callbacks.saveProject;
  try{
   db.callbacks.saveProject=()=>dm.saveAllData(db.currentProject.path);
   await document.getElementById('database-apply-btn').onclick();
   const saved=JSON.parse(require('fs').readFileSync(require('path').join(db.currentProject.path,'data/Actors.json'),'utf8'));
   check('Apply writes database',saved[actor.id].name==='Applied sequence');
   actor.name='Cancelled after Apply';show('items');const item=dm.data.items[1],itemName=item.name;item.name='Cancelled item';
   await __cancelDb();
   check('Apply → edit another section → Cancel',dm.data.actors[actor.id].name==='Applied sequence'&&dm.data.items[1].name===itemName);
  }finally{db.callbacks.saveProject=oldSave;dm.data.actors[actor.id].name=oldName;}
  // Interface undo belongs only to the currently selected interface.
  show('userInterfaces');const ui=db.userInterfaceEditor,a=ui.current;
  if(a.nodes?.length){ui.pushUndo();a.nodes[0].x+=17;ui.touch();const b=dm.data.userInterfaces.find(e=>e&&e.id!==a.id);
   if(b){db.showDatabaseDetail(b,'userInterfaces');const before=JSON.stringify(ui.current);ui.undo();ui.redo();check('interface undo after record switch',JSON.stringify(ui.current)===before);}
  }
  await __cancelDb();
  return {checks,failures};
 }
 if(phase==='races'){
  // A delayed paste must not revive a cancelled actor draft.
  let a=show('actors');const before=JSON.stringify(a),originalRead=DatabaseRowClipboard.read;
  let resolve;DatabaseRowClipboard.read=()=>new Promise(r=>resolve=r);
  try{
   a.name='Cancelled actor draft';const pending=db.actorEditor.pasteTrait(a,null);
   await __cancelDb();
   resolve({row:{code:21,dataId:2,value:1.5}});await pending;
   check('actor paste after Cancel',JSON.stringify(dm.data.actors[a.id])===before);
  }finally{DatabaseRowClipboard.read=originalRead;dm.data.actors[a.id]=JSON.parse(before);}
  // Common-event commands must not write after leaving their section.
  show('commonEvents');const e=db.commonEventEditor.currentEvent,beforeEvent=JSON.stringify(e),old=ReactorClipboard.read;
  try{
   ReactorClipboard.read=()=>new Promise(r=>resolve=r);
   const pending=db.commonEventEditor.pasteCommands(e,document.querySelector('.common-event-command-list'));
   show('items');resolve({payload:{commands:[{code:118,indent:0,parameters:['late paste']}]}});await pending;
   check('common-event paste after section switch',JSON.stringify(dm.data.commonEvents[e.id])===beforeEvent);
  }finally{ReactorClipboard.read=old;dm.data.commonEvents[e.id]=JSON.parse(beforeEvent);}
  // Animation-owned global listeners must be released on leaving the editor.
  show('animations');await wait(80);const n=db.animationEditor._detailCleanups?.length||0;
  show('items');check('animation resources released on section switch',!(db.animationEditor._detailCleanups?.length),{before:n,after:db.animationEditor._detailCleanups?.length});
  const animation=show('animations');
  db.animationEditor.showEffectFilePicker(animation,document.getElementById('database-detail'));
  const effectPicker=document.getElementById('effect-picker-modal');
  db.animationEditor.showEffectFilePicker(animation,document.getElementById('database-detail'));
  check('superseded effect picker released',!effectPicker.isConnected);
  const nextPicker=document.getElementById('effect-picker-modal');show('items');
  check('effect picker retired on section switch',!nextPicker.isConnected);
  // Interface drag listeners and observers must not outlive the detail.
  show('userInterfaces');show('skills');check('interface listeners released on section switch',!db.userInterfaceEditor._onMouseMove&&!db.userInterfaceEditor._resizeObserver);
  // A retired modal must not commit into the next record or section.
  const actor=show('actors'),originalActor=JSON.stringify(actor);
  db.actorEditor.addTrait(actor);const retired=document.querySelector('.trait-editor-modal');
  const save=retired.querySelector('.ok-btn');show('classes');save.click();
  check('trait dialog retired on section switch',!retired.isConnected&&JSON.stringify(dm.data.actors[actor.id])===originalActor);
  const cls=dm.data.classes[1],beforeClass=JSON.stringify(cls),beforeOtherClass=JSON.stringify(dm.data.classes[2]);
  db.classEditor.traitEditor.showTraitEditorModal(cls,-1,()=>{});const oldOK=document.querySelector('.trait-editor-modal .ok-btn');
  db.classEditor.traitEditor.showTraitEditorModal(dm.data.classes[2],-1,()=>{});oldOK.click();
  check('superseded trait dialog cannot save',JSON.stringify(cls)===beforeClass&&JSON.stringify(dm.data.classes[2])===beforeOtherClass);
  show('items');let picks=0;
  db.showImagePicker('Sequence picker',[],()=>picks++,()=>'',null,{allowNone:true});
  show('actors');check('image picker retired on section switch',document.getElementById('image-picker-modal').style.display==='none'&&picks===0);
  db.showChangeMaximumModal('Actors','actors',dm.getMaxEntries('actors'),()=>picks++);
  const maximum=[...document.querySelectorAll('body > div')].find(e=>e.querySelector('.rr-database-maximum-input'));
  const maximumOK=maximum.querySelector('.rr-button-primary');show('items');maximumOK.click();
  check('maximum dialog retired on section switch',!maximum.isConnected&&picks===0);
  const icon=db.showIconPicker(0,()=>picks++,require('path').join(db.currentProject.path,'img/system/IconSet.png'));
  const iconOK=icon.querySelector('.rr-button-primary');show('actors');iconOK.click();
  check('icon picker retired on section switch',!icon.isConnected&&picks===0);
  db.closeDatabaseViewer();
  check('closed detail detached',document.getElementById('database-detail').children.length===0);
  return {checks,failures};
 }
 const targets=['actors','classes','skills','items','weapons','armors','enemies','troops','states','animations','tilesets','commonEvents','userInterfaces','quests','system1','system2','types','terms','reactor3d'];
 for(const target of targets){
  show(phase);show(target);await wait(20);
  const active=document.querySelector('.database-nav-item.active')?.dataset.type;
  const detail=document.getElementById('database-detail');
  check(`${phase} → ${target}`,active===target&&detail.children.length>0,{active,children:detail.children.length});
  // Cancel must roll back changes made before and after a section transition.
  if(phase==='classes'&&target==='items'){
   const a=dm.data.classes[1],b=dm.data.items[1],names=[a.name,b.name];a.name='Sequence class';b.name='Sequence item';
   await __cancelDb();show(target);
   check('cross-section Cancel',dm.data.classes[1].name===names[0]&&dm.data.items[1].name===names[1]);
  }
 }
 db.closeDatabaseViewer();return {checks:checks.length,failures};
})().then(done,e=>done({error:String(e.stack)}));
