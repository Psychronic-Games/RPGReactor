// The shared map/workshop bar keeps icon group controls at wide and narrow sizes.
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {WebDriverClient}=require('./webdriver-client.cjs');
const root=path.resolve(__dirname,'../../..'),temp=fs.mkdtempSync(path.join(os.tmpdir(),'rr-build-bar-'));
const out=path.resolve(process.argv[2]||path.join(root,'scratchpad/build-bar-20261028'));
fs.mkdirSync(out,{recursive:true});let driver;
(async()=>{try{
 driver=new WebDriverClient(path.join(root,'nwjs-linux/chromedriver'));await driver.start();
 await driver.createSession({browserName:'chrome','goog:chromeOptions':{args:[`nwapp=${path.join(root,'editor')}`,`user-data-dir=${path.join(temp,'profile')}`,'no-first-run','js-flags=--max-old-space-size=1024']}});
 await driver.waitForScript('return !!window.reactor?.forgeManager;',[],{timeout:90000});
 await driver.execute(`
  window.__barErrors=[];addEventListener('error',e=>__barErrors.push(String(e.error?.stack||e.message)));
  const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;z-index:99999;background:#252831';document.body.append(host);
  const manager={level:0,mode:'select',kind:'floor',activate(){},setMode(mode){this.mode=mode;},setKind(kind){this.kind=kind;this.mode='place';}};
  window.__layoutBar=new BuildHotbar({pieceBuilderManager:manager});__layoutBar.currentMap=()=>({note:'<3d>',reactor3d:{version:1}});__layoutBar.renderPanel=()=>{};
  __layoutBar.mount(host);__layoutBar.visible=true;__layoutBar.root.style.display='flex';__layoutBar.render();
  window.__layoutHint={};MapEditor3D.prototype.createHint.call(__layoutHint,host);`);
 const reports=[];
 for(const [width,height] of [[1400,800],[1280,720],[1024,600],[1600,900]]){
  await driver.sessionRequest('POST','/window/rect',{width,height});
  const report=await driver.executeAsync(`const done=arguments[arguments.length-1];setTimeout(()=>{
   const bar=__layoutBar;bar.layout();bar.root.querySelector('[data-slot=wall]').click();
   const row=bar.root.querySelector('.rr-build-row'),groups=bar.root.querySelector('.rr-build-groups'),buttons=[...groups.children],slot=bar.root.querySelector('.rr-build-slot');
   document.documentElement.dataset.theme=innerWidth===1024?'light':'dark';
   const a=bar.root.getBoundingClientRect(),hint=__layoutHint.hint.getBoundingClientRect(),height=bar.root.querySelector('.rr-build-height'),help=bar.root.querySelector('.rr-build-hint'),style=getComputedStyle(help);
   done({placement:height.textContent,explanation:height.title,font:parseFloat(style.fontSize),background:style.backgroundColor,heightVisible:height.getBoundingClientRect().bottom<=help.getBoundingClientRect().bottom,theme:document.documentElement.dataset.theme,width:innerWidth,groups:getComputedStyle(groups).display,groupHeight:groups.getBoundingClientRect().height,slotHeight:slot.getBoundingClientRect().height,rowHeight:row.getBoundingClientRect().height,icons:buttons.every(b=>!!b.querySelector('svg')&&getComputedStyle(b.querySelector('span')).display==='none'),names:buttons.every(b=>!!b.getAttribute('aria-label')&&!!b.title),helpClear:hint.bottom<=a.top-4,kind:bar.manager().kind,errors:__barErrors});
  },150);`);
  reports.push(report);
  assert.match(report.placement,/Placement height: 0 above ground/);assert.match(report.explanation,/Q lowers it; E raises it/);assert.ok(report.font>=13);assert.notEqual(report.background,'rgba(0, 0, 0, 0)');assert.equal(report.heightVisible,true);
  assert.equal(report.groups,'grid');assert.equal(report.icons,true);assert.equal(report.names,true);
  assert.ok(report.groupHeight<=report.slotHeight+2,'group controls must not stretch the tool row');
  assert.ok(report.rowHeight<=76,'avoid a nearly empty wrapped row');
  assert.equal(report.helpClear,true);assert.equal(report.kind,'wall');assert.equal(report.errors.length,0);
  fs.writeFileSync(path.join(out,'bar-'+width+'.png'),Buffer.from(await driver.sessionRequest('GET','/screenshot'),'base64'));
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(reports,null,2)+'\n');console.log(JSON.stringify(reports));
}finally{await driver?.close();fs.rmSync(temp,{recursive:true,force:true});}})().catch(e=>{console.error(e);process.exitCode=1;});
