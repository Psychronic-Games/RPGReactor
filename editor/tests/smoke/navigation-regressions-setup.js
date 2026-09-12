const done = arguments[arguments.length - 1];
(async () => {
    const pc=reactor.projectController,db=reactor.databaseEditorUI,dm=reactor.databaseManager;
    const checks=[],failures=[],measurements={};
    const check=(name,ok,detail)=>{checks.push(name);if(!ok)failures.push({name,detail});};
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const show=(type,id=1)=>{db.openDatabase(type);const entry=dm.data[type].find(e=>e&&e.id>=id);db._activeDatabaseList.selectIds([entry.id],entry.id);return entry;};
    // The clicked row and its text child must both respect a cancelled switch.
    const confirm=pc.confirmUnsavedChanges;pc.confirmUnsavedChanges=async()=>false;
    for(const child of [false,true]){
        pc.renderMapsList();const row=document.querySelector('#maps-list [data-map-id="2"]');
        (child?row.lastElementChild:row).click();await wait(10);
        const selected=[...document.querySelectorAll('#maps-list .selected')].map(e=>+e.dataset.mapId);
        check('cancelled map click '+child,pc.tilemapManager.currentMap.id===1&&selected.length===1&&selected[0]===1,selected);
    }
    pc.confirmUnsavedChanges=confirm;
    // Hovering the same coordinate must not move rows or create extra siblings.
    pc.currentProject.maps[2].parentId=1;pc.currentProject.maps[1].expanded=true;pc.renderMapsList();
    const from=document.querySelector('#maps-list [data-map-id="1"]'),to=document.querySelector('#maps-list [data-map-id="2"]');
    const transfer=new DataTransfer(),count=from.parentNode.children.length;
    from.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
    for(const target of [from,to]){
        const rect=target.getBoundingClientRect();
        for(let i=0;i<15;i++)target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientY:rect.top+2}));
        check('illegal drag stable '+target.dataset.mapId,target.getBoundingClientRect().top===rect.top&&from.parentNode.children.length===count,{before:rect.top,after:target.getBoundingClientRect().top});
        target.dispatchEvent(new DragEvent('dragleave',{dataTransfer:transfer}));
    }
    from.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));
    pc.currentProject.maps[2].parentId=0;pc.renderMapsList();
    const source=document.querySelector('#maps-list [data-map-id="2"]'),target=document.querySelector('#maps-list [data-map-id="1"]');
    source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:transfer}));
    for(const [position,fraction] of [['before',0.1],['child',0.5],['after',0.9]]){
        const rect=target.getBoundingClientRect(),siblings=target.parentNode.children.length;
        for(let i=0;i<15;i++)target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:transfer,clientY:rect.top+rect.height*fraction}));
        check('valid drag stable '+position,target.dataset.mapDrop===position&&target.getBoundingClientRect().top===rect.top&&target.parentNode.children.length===siblings);
        target.dispatchEvent(new DragEvent('dragleave',{dataTransfer:transfer,relatedTarget:target.lastElementChild}));
        check('drag label keeps feedback '+position,target.dataset.mapDrop===position);
    }
    source.dispatchEvent(new DragEvent('dragend',{bubbles:true,dataTransfer:transfer}));
    check('drag end clears feedback',!document.querySelector('[data-map-drop]'));
    // The transfer picker owns its selection separately from the main map tree.
    const picker=new TransferPlayerEditor(dm,pc),host=document.createElement('div');document.body.appendChild(host);
    const selection={mapId:1,x:0,y:0};
    picker.buildMapTreeForPicker(host,document.createElement('canvas'),document.createElement('div'),{value:''},async()=>{},selection,new Set([1]));
    host.querySelector('[data-map-id="1"]').click();host.querySelector('[data-map-id="2"] span:last-child').click();
    const highlighted=[...host.querySelectorAll('.tree-item')].filter(e=>e.classList.contains('selected')||e.style.backgroundColor==='var(--color-selection-deep)');
    check('transfer picker single selection',highlighted.length===1&&+highlighted[0].dataset.mapId===2,highlighted.map(e=>e.dataset.mapId));host.remove();
    // Boundary presses must preserve the live detail DOM, not rebuild it.
    for(const type of ['actors','classes','skills','items','weapons','armors','enemies','troops','states','tilesets','commonEvents','animations']){
        const entry=show(type);await wait(80);
        const detail=document.getElementById('database-detail'),node=detail.firstElementChild;
        for(let i=0;i<5;i++)document.getElementById('database-list').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}));
        check(type+' boundary keeps detail',detail.firstElementChild===node);
        db._activeDatabaseList.selectIds([entry.id],entry.id);
        check(type+' reselect keeps detail',detail.firstElementChild===node);
        const last=dm.data[type].filter(Boolean).at(-1);db._activeDatabaseList.selectIds([last.id],last.id);
        const lastNode=detail.firstElementChild;
        for(let i=0;i<5;i++)document.getElementById('database-list').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
        check(type+' lower boundary keeps detail',detail.firstElementChild===lastNode);
        // Compare General field geometry before and after deferred setup.
        if(['skills','items','weapons','armors','states','enemies'].includes(type)){
            const next=dm.data[type].find(e=>e&&e.id>entry.id);if(!next)continue;
            db._activeDatabaseList.selectIds([next.id],next.id);
            const field=detail.querySelector('[data-field="name"]');
            if(field){const a=field.getBoundingClientRect();await wait(100);const b=field.getBoundingClientRect();
                measurements[type]={dx:b.x-a.x,dy:b.y-a.y,dw:b.width-a.width,dh:b.height-a.height};
                check(type+' stable General layout',Math.abs(b.x-a.x)<1&&Math.abs(b.width-a.width)<1&&Math.abs(b.y-a.y)<1,measurements[type]);}
            db._activeDatabaseList.selectIds([entry.id],entry.id);
            db._activeDatabaseList.selectIds([next.id],next.id);
            db._activeDatabaseList.selectIds([entry.id],entry.id);
            await wait(80);
            const slot=detail.querySelector('[id*="-icon-container-"]');
            if(slot)check(type+' rapid revisit has one preview',slot.querySelectorAll('.database-preview').length===1,slot.querySelectorAll('.database-preview').length);
        }
    }
    show('tilesets');await wait(40);
    const editor=db.tilesetEditor.tilesetEditor;
    document.getElementById('database-list').focus();editor.showTilesetImagePicker(0,'A1');
    let file=document.querySelector('.rr-modal-overlay .rr-picker-file-item')||document.querySelector('.rr-picker-file-item');
    const overlay=file?.closest('.rr-modal-overlay');
    if(file){file.focus();file.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));await wait(30);
        check('tileset picker arrow stays open',file.isConnected&&(!overlay||overlay.isConnected));}
    else check('tileset picker exists',false);
    db.closeDatabaseViewer();
    for(const folder of ['characters','faces']){
        const actor=show('actors'),detail=document.getElementById('database-detail').firstElementChild;
        const files=['Alpha','Beta'];
        const fixture=pc.currentProject.path,fs=require('fs'),path=require('path');
        fs.mkdirSync(path.join(fixture,'img',folder),{recursive:true});
        const c=document.createElement('canvas');c.width=576;c.height=384;
        const ctx=c.getContext('2d');ctx.fillStyle='#f030a0';ctx.fillRect(0,0,c.width,c.height);
        for(const name of files)fs.writeFileSync(path.join(fixture,'img',folder,name+'.png'),Buffer.from(c.toDataURL().split(',')[1],'base64'));
        document.getElementById('database-list').focus();
        db.showImagePicker('Probe '+folder,files,()=>{},name=>RRAssetFiles.toUrl(path.join(fixture,'img',folder,name+'.png')),'Alpha');
        const picker=document.getElementById('image-picker-modal');
        const before=JSON.stringify(actor);
        document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));await wait(40);
        check(folder+' picker owns arrows',getComputedStyle(picker).display!=='none'&&document.activeElement.dataset.fileName==='Beta'&&document.getElementById('database-detail').firstElementChild===detail);
        check(folder+' preview does not commit',JSON.stringify(actor)===before);
        db._closeImagePicker();db.closeDatabaseViewer();
    }
    // World position beneath the pointer must survive an interior zoom.
    const tm=pc.tilemapManager,canvas=document.getElementById('canvas-container');
    const drifts=[];
    for(const scale of [1,1.5,2])for(const fraction of [0.15,0.5,0.85])for(const deltaY of [-100,100]){
        tm.setViewportTransform(-100,-100,scale);tm.applyViewportCrop();
        const rect=tm.app.canvas.getBoundingClientRect(),x=Math.min(rect.width-1,rect.width*fraction),y=rect.height*fraction;
        const before=[(x-tm.container.x)/scale,(y-tm.container.y)/scale];
        canvas.dispatchEvent(new WheelEvent('wheel',{clientX:rect.left+x,clientY:rect.top+y,deltaY,bubbles:true,cancelable:true}));
        const afterRect=tm.app.canvas.getBoundingClientRect(),newScale=tm.container.scale.x;
        const after=[(rect.left+x-afterRect.left-tm.container.x)/newScale,(rect.top+y-afterRect.top-tm.container.y)/newScale];
        const drift=Math.hypot(after[0]-before[0],after[1]-before[1]);drifts.push({scale,fraction,deltaY,drift});
    }
    measurements.zoom=drifts;
    check('cursor anchored zoom',drifts.every(d=>d.drift<0.01),drifts.filter(d=>d.drift>=0.01));
    const edgeDrifts=[];
    for(const edge of ['top-left','bottom-right'])for(const fraction of [0.15,0.5,0.85]){
        tm._zoomPadding=null;
        const scale=1,pan=tm.panBounds(scale);
        tm.setViewportTransform(edge==='top-left'?0:pan.minX,edge==='top-left'?0:pan.minY,scale);tm.applyViewportCrop();
        const rect=tm.app.canvas.getBoundingClientRect(),x=rect.width*fraction,y=rect.height*fraction;
        const before=[(x-tm.container.x)/scale,(y-tm.container.y)/scale];
        canvas.dispatchEvent(new WheelEvent('wheel',{clientX:rect.left+x,clientY:rect.top+y,deltaY:100,bubbles:true,cancelable:true}));
        const after=[(x-tm.container.x)/tm.container.scale.x,(y-tm.container.y)/tm.container.scale.x];
        edgeDrifts.push({edge,fraction,drift:Math.hypot(after[0]-before[0],after[1]-before[1])});
    }
    measurements.edgeZoom=edgeDrifts;
    check('cursor anchored zoom at map edges',edgeDrifts.every(d=>d.drift<0.01),edgeDrifts);
    const bounds=tm.panBounds();tm.setViewportTransform(100000,100000);
    check('panning cannot extend zoom margin',tm.container.x===bounds.maxX&&tm.container.y===bounds.maxY);
    tm.setViewportTransform(-100000,-100000);
    check('panning stops at opposite bounds',tm.container.x===bounds.minX&&tm.container.y===bounds.minY);
    for(const direction of ['horizontal','vertical']){
        const horizontal=direction==='horizontal',thumb=horizontal?tm.scrollbars.hThumb:tm.scrollbars.vThumb;
        tm.setViewportTransform(bounds.maxX,bounds.maxY);tm.updateScrollbars();
        const panel=canvas.getBoundingClientRect(),track=(horizontal?panel.width:panel.height)-14;
        // MouseEvent coordinates are integral; round outward to the track end.
        const travel=Math.ceil(track-parseFloat(horizontal?thumb.style.width:thumb.style.height));
        thumb.dispatchEvent(new MouseEvent('mousedown',{clientX:0,clientY:0,bubbles:true,cancelable:true}));
        document.dispatchEvent(new MouseEvent('mousemove',{clientX:horizontal?travel:0,clientY:horizontal?0:travel,bubbles:true}));
        document.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
        check(direction+' scrollbar reaches end',Math.abs((horizontal?tm.container.x:tm.container.y)-(horizontal?bounds.minX:bounds.minY))<0.01,{actual:horizontal?tm.container.x:tm.container.y,expected:horizontal?bounds.minX:bounds.minY});
    }
    await pc.loadMap(2,{skipDirtyCheck:true});
    check('map switch clears zoom padding',tm._zoomPadding===null);
    const view=reactor.mapEditor3D;
    check('3D view opens',await view.setEnabled(true));
    const zoom3D=[];
    for(const fx of [0.2,0.5,0.8])for(const fy of [0.25,0.6])for(const deltaY of [-100,100]){
        const rect=view.canvas.getBoundingClientRect(),x=rect.left+rect.width*fx,y=rect.top+rect.height*fy;
        const point=view.zoomAnchor(x,y);if(!point)continue;
        (view.inputSurface||view.canvas).dispatchEvent(new WheelEvent('wheel',{clientX:x,clientY:y,deltaY,bubbles:true,cancelable:true}));
        view.camera.updateMatrixWorld();const projected=point.clone().project(view.camera);
        zoom3D.push(Math.hypot(projected.x-(fx*2-1),projected.y-(-fy*2+1)));
    }
    measurements.zoom3D=zoom3D;
    check('3D cursor anchor across map',zoom3D.length===12&&zoom3D.every(d=>d<1e-7),zoom3D);
    await view.setEnabled(false);
    show('skills');await wait(100);
    return {checks,failures,measurements,errors:__keyErrors};
})().then(done,error=>done({error:String(error.stack)}));
