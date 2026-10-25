/* Room-local event characters and interpreter targets inside Scene_Battle. */
(function(root){
    'use strict';
    const P=root.ReactorBattlePresentation;
    function RoomEvent(room,data){this.initialize(room,data);}
    RoomEvent.prototype=Object.create(Game_Character.prototype);RoomEvent.prototype.constructor=RoomEvent;
    RoomEvent.prototype.initialize=function(room,data){Game_Character.prototype.initialize.call(this);this._room=room;this._roomData=data;this._eventId=data.id;this._erased=false;this.locate(data.x,data.y);this.refresh();};
    RoomEvent.prototype.refreshBushDepth=function(){this._bushDepth=0;};
    RoomEvent.prototype.isOnLadder=function(){return false;};
    RoomEvent.prototype.isOnBush=function(){return false;};
    RoomEvent.prototype.isNearTheScreen=function(){return true;};
    RoomEvent.prototype.deltaXFrom=function(x){return this.x-x;};
    RoomEvent.prototype.deltaYFrom=function(y){return this.y-y;};
    RoomEvent.prototype.regionId=function(){return this._room.map.data[(5*this._room.map.height+this.y)*this._room.map.width+this.x]||0;};
    RoomEvent.prototype.terrainTag=function(){return 0;};
    RoomEvent.prototype.updateJump=function(){this._jumpCount--;this._realX=(this._realX*this._jumpCount+this._x)/(this._jumpCount+1);this._realY=(this._realY*this._jumpCount+this._y)/(this._jumpCount+1);if(!this._jumpCount){this._realX=this._x;this._realY=this._y;}};
    for(const name of ['moveTowardPlayer','moveAwayFromPlayer','turnTowardPlayer','turnAwayFromPlayer'])RoomEvent.prototype[name]=function(){P.warn('Player-relative movement is unavailable for room events; choose a room event or a fixed direction.');};
    RoomEvent.prototype.eventId=function(){return this._eventId;};
    RoomEvent.prototype.event=function(){return this._roomData;};
    RoomEvent.prototype.page=function(){return this._roomData.pages[this._pageIndex];};
    RoomEvent.prototype.isTile=function(){return this._tileId>0;};
    RoomEvent.prototype.isObjectCharacter=function(){return ImageManager.isObjectCharacter(this._characterName);};
    RoomEvent.prototype.isStarting=function(){return false;};
    RoomEvent.prototype.canPass=function(x,y,d){const nx=x+(d===6?1:d===4?-1:0),ny=y+(d===2?1:d===8?-1:0);return nx>=0&&ny>=0&&nx<this._room.map.width&&ny<this._room.map.height;};
    RoomEvent.prototype.moveStraight=function(d){this.setMovementSuccess(this.canPass(this._x,this._y,d));this.setDirection(d);if(this.isMovementSucceeded()){this._x+=d===6?1:d===4?-1:0;this._y+=d===2?1:d===8?-1:0;this.increaseSteps();}};
    RoomEvent.prototype.moveDiagonally=function(h,v){if(this.canPass(this._x,this._y,h)&&this.canPass(this._x,this._y,v)){this._x+=h===6?1:-1;this._y+=v===2?1:-1;this.increaseSteps();}};
    RoomEvent.prototype.screenX=function(){return this._room.project({x:this._realX,y:this._realY,z:0}).x;};
    RoomEvent.prototype.screenY=function(){return this._room.project({x:this._realX,y:this._realY,z:0}).y;};
    RoomEvent.prototype.screenZ=function(){return this._priorityType*2+1;};
    RoomEvent.prototype.erase=function(){this._erased=true;this.refresh();};
    RoomEvent.prototype.refresh=function(){
        let index=-1;
        if(!this._erased)for(let i=this._roomData.pages.length-1;i>=0;i--){const c=this._roomData.pages[i].conditions||{};
            if(c.switch1Valid&&!$gameSwitches.value(c.switch1Id)||c.switch2Valid&&!$gameSwitches.value(c.switch2Id)||c.variableValid&&$gameVariables.value(c.variableId)<c.variableValue||c.selfSwitchValid&&!this._room.selfSwitches[this._eventId+':'+c.selfSwitchCh]||c.itemValid&&!$gameParty.hasItem($dataItems[c.itemId])||c.actorValid&&!$gameParty.members().some(a=>a.actorId()===c.actorId))continue;
            index=i;break;}
        if(this._pageIndex===index)return;this._pageIndex=index;const page=this.page();
        if(!page){this.setTransparent(true);return;}this.setTransparent(false);const image=page.image;
        if(image.tileId)this.setTileImage(image.tileId);else this.setImage(image.characterName,image.characterIndex);
        this.setDirection(image.direction);this.setPattern(image.pattern);this.setMoveSpeed(page.moveSpeed);this.setMoveFrequency(page.moveFrequency);this.setPriorityType(page.priorityType);this.setWalkAnime(page.walkAnime);this.setStepAnime(page.stepAnime);this.setDirectionFix(page.directionFix);this.setThrough(page.through);
    };
    function RoomEventSprite(event){const sprite=new Sprite_Character(event);sprite.update=RoomEventSprite.prototype.update;return sprite;}
    RoomEventSprite.prototype=Object.create(Sprite_Character.prototype);RoomEventSprite.prototype.constructor=RoomEventSprite;
    RoomEventSprite.prototype.update=function(){
        Sprite.prototype.update.call(this);const event=this._character,room=event._room;
        if(this._tileId!==event.tileId()||this._characterName!==event.characterName()||this._characterIndex!==event.characterIndex()){
            this._tileId=event.tileId();this._characterName=event.characterName();this._characterIndex=event.characterIndex();
            if(this._tileId){const n=5+Math.floor(this._tileId/256);this.bitmap=ImageManager.loadTileset(room.tileset.tilesetNames[n]);}else this.setCharacterBitmap();
        }
        this.updateFrame();this.x=event.screenX()-this.parent.x;this.y=event.screenY()-this.parent.y;this.updateOther();this.visible=!event.isTransparent();
    };
    P.setupRoomEvents=function(room,ss){
        room.events=new Map();room.selfSwitches={};room.interpreters=[];room.eventSprites=new Map();room.balloons=[];
        for(const data of room.map.events||[])if(data){const event=new RoomEvent(room,data),sprite=new RoomEventSprite(event);room.events.set(data.id,event);room.eventSprites.set(data.id,sprite);ss._battleField.addChild(sprite);}
        room.callEvent=function(id){const event=this.events.get(Number(id));if(!event?.page())return null;const interpreter=new Game_Interpreter();interpreter._reactorRoom=this;interpreter.setup(event.page().list,event.eventId());this.interpreters.push(interpreter);return interpreter;};
        for(const [id,mode] of Object.entries(room.settings.eventModes||{}))if(mode==='enter')room.callEvent(id);
        $gameTroop._interpreter._reactorRoom=room;
    };
    P.updateRoomEvents=function(room){
        for(const [id,event] of room.events||[]){event.refresh();event.update();const sprite=room.eventSprites.get(id),p={x:event._realX,y:event._realY,z:event.jumpHeight()/(room.assets.tileSize||48),facing:({2:0,4:90,6:-90,8:180})[event.direction()]||0};
            const model=Reactor3D.eventModelSpec(room.map,id,event._pageIndex)||Reactor3D.modelSpecFromNote(event.event().note);
            if(model){room.addModel('event:'+id,model,p);room.place('event:'+id,p);}
            else if(sprite.bitmap?.isReady())room.billboard('event:'+id,sprite.bitmap.canvas,sprite._frame,p,Math.max(.5,sprite._frame.height/48),sprite.bitmap);
            const record=room.models.get('event:'+id)||room.billboards.get('event:'+id);if(record)record.object.visible=!event.isTransparent();
            if(sprite.texture)P.drawnInRoom(sprite);
            if(room.settings.eventModes?.[id]==='parallel'&&!room.interpreters.some(i=>i._eventId===id&&i.isRunning()))room.callEvent(id);
        }
        const scroll=room.scroll;
        if(scroll){const amount=Math.min(scroll.remaining,Math.pow(2,scroll.speed)/256),camera=room.settings.camera;camera.x+=scroll.direction===6?amount:scroll.direction===4?-amount:0;camera.y+=scroll.direction===2?amount:scroll.direction===8?-amount:0;scroll.remaining-=amount;if(scroll.remaining<=0)room.scroll=null;}
        for(const balloon of room.balloons||[])if(!balloon.isPlaying()){balloon._roomCharacter.endBalloon();balloon.removeFromParent();balloon.destroy();}
        room.balloons=(room.balloons||[]).filter(b=>!b.destroyed);
        for(const interpreter of room.interpreters||[])interpreter.update();
        room.interpreters=(room.interpreters||[]).filter(i=>i.isRunning());
    };
    P.installRoomEvents=function(){
        const character=Game_Interpreter.prototype.character;
        Game_Interpreter.prototype.character=function(id){return this._reactorRoom&&!this._reactorRoom.disposed?(id<0?null:this._reactorRoom.events.get(id>0?id:this._eventId)||null):character.call(this,id);};
        const child=Game_Interpreter.prototype.setupChild;
        Game_Interpreter.prototype.setupChild=function(...args){child.apply(this,args);if(this._childInterpreter)this._childInterpreter._reactorRoom=this._reactorRoom;};
        const wait=Game_Interpreter.prototype.updateWaitMode;
        Game_Interpreter.prototype.updateWaitMode=function(){if(this._reactorRoom?.disposed){this._waitMode='';this.terminate();return false;}if(this._reactorRoom&&this._waitMode==='scroll'){if(this._reactorRoom.scroll)return true;this._waitMode='';return false;}return wait.call(this);};
        const route=Game_Interpreter.prototype.command205;
        Game_Interpreter.prototype.command205=function(params){if(!this._reactorRoom)return route.call(this,params);this._characterId=params[0];this._character=this.character(params[0]);if(this._character){this._character.forceMoveRoute(params[1]);if(params[1].wait)this.setWaitMode('route');}return true;};
        const self=Game_Interpreter.prototype.command123;
        Game_Interpreter.prototype.command123=function(params){if(!this._reactorRoom)return self.call(this,params);this._reactorRoom.selfSwitches[this._eventId+':'+params[0]]=params[1]===0;return true;};
        const branch=Game_Interpreter.prototype.command111;
        Game_Interpreter.prototype.command111=function(params){if(!this._reactorRoom||params[0]!==2)return branch.call(this,params);const result=!!this._reactorRoom.selfSwitches[this._eventId+':'+params[1]]===(params[2]===0);this._branch[this._indent]=result;if(!result)this.skipBranch();return true;};
        const erase=Game_Interpreter.prototype.command214;
        Game_Interpreter.prototype.command214=function(...args){if(!this._reactorRoom)return erase.apply(this,args);this.character(0)?.erase();return true;};
        const scroll=Game_Interpreter.prototype.command204;
        Game_Interpreter.prototype.command204=function(params){if(!this._reactorRoom)return scroll.call(this,params);if(this._reactorRoom.scroll){this.setWaitMode('scroll');return false;}this._reactorRoom.scroll={direction:params[0],remaining:Math.max(0,params[1]),speed:Math.max(1,Math.min(6,params[2]))};if(params[3])this.setWaitMode('scroll');return true;};
        const balloon=Game_Interpreter.prototype.command213;
        Game_Interpreter.prototype.command213=function(params){if(!this._reactorRoom)return balloon.call(this,params);this._characterId=params[0];const event=this.character(params[0]);if(event){const sprite=new Sprite_Balloon();sprite.setup(this._reactorRoom.eventSprites.get(event.eventId()),params[1]);sprite._roomCharacter=event;event.startBalloon();SceneManager._scene._spriteset._effectsContainer.addChild(sprite);this._reactorRoom.balloons.push(sprite);if(params[2])this.setWaitMode('balloon');}return true;};
        const location=Game_Interpreter.prototype.command285;
        Game_Interpreter.prototype.command285=function(params){if(!this._reactorRoom)return location.call(this,params);const room=this._reactorRoom,character=params[2]===2?this.character(params[3]):null,x=character?character.x:params[2]===1?$gameVariables.value(params[3]):params[3],y=character?character.y:params[2]===1?$gameVariables.value(params[4]):params[4];let value=0;
            if(x>=0&&y>=0&&x<room.map.width&&y<room.map.height){const tile=z=>room.map.data[(z*room.map.height+y)*room.map.width+x]||0;if(params[1]===1)value=[...room.events.values()].find(e=>e.x===x&&e.y===y)?.eventId()||0;else if(params[1]>=2&&params[1]<=5)value=tile(params[1]-2);else if(params[1]>5)value=tile(5);else for(let z=3;z>=0;z--){const tag=(room.tileset.flags[tile(z)]||0)>>12;if(tag){value=tag;break;}}}$gameVariables.setValue(params[0],value);return true;};
        for(const code of [201,202,206,216,217,282,283,301]){const original=Game_Interpreter.prototype['command'+code];if(!original)continue;Game_Interpreter.prototype['command'+code]=function(...args){if(!this._reactorRoom)return original.apply(this,args);P.warn('Map command '+code+' is unavailable inside a Battle Room.');return true;};}
        const target=Spriteset_Battle.prototype.findTargetSprite;
        Spriteset_Battle.prototype.findTargetSprite=function(battler){if(battler instanceof RoomEvent)return this._reactorRoom?.eventSprites.get(battler.eventId());return target.call(this,battler);};
        PluginManager.registerCommand('RPGReactor','BattleRoomEvent',function(args){const room=SceneManager._scene?._spriteset?._reactorRoom;const event=room?.events.get(Number(args.eventId));if(event?.page()){this._reactorRoom=room;this.setupChild(event.page().list,event.eventId());}});
    };
})(globalThis);
