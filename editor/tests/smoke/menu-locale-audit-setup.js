const done=arguments[arguments.length-1];
(async()=>{
 const db=reactor.databaseEditorUI, rows=[];
 const languages=I18n.languages().map(l=>l.id);
 const themes=['dark','light',...['bubblegum','ocean','cascadia','underworld','creamsicle','royalty'].flatMap(p=>[`${p}-dark`,`${p}-light`])];
 const cases=[...themes.map(theme=>[theme,'en']),...languages.map(language=>['light',language])];
 for(const [theme,language] of cases){
  I18n.setLanguage(language,{persist:false});document.documentElement.setAttribute('data-theme',theme);
  let invoked=false;
  db.showDatabaseActionMenu(innerWidth-2,innerHeight-2,[
   {label:I18n.tText('Copy'),shortcut:'Ctrl+C',action:()=>{invoked=true;}},
   {label:I18n.tText('Paste'),shortcut:'Ctrl+V',action:()=>{}},
   {separator:true},{label:I18n.tText('Delete'),enabled:false}
  ]);
  const menu=db._databaseActionMenu,rect=menu.getBoundingClientRect(),buttons=[...menu.querySelectorAll('button')];
  const row={theme,language,labels:buttons.map(b=>b.querySelector('span').textContent),inViewport:(view=>rect.left>=0&&rect.top>=0&&rect.right<=view.innerWidth&&rect.bottom<=view.innerHeight)(menu.ownerDocument.defaultView)};
  row.localized=row.labels[0]===I18n.tText('Copy')&&(language==='en'||row.labels[0]!=='Copy');
  if(window.__auditTheme)row.sample=window.__auditTheme();
  buttons[0].click();row.actionInvoked=invoked;row.dismissed=!menu.isConnected;
  rows.push(row);
 }
 I18n.setLanguage('en',{persist:false});
 return {menus:rows};
})().then(done,e=>done({error:String(e.stack)}));
