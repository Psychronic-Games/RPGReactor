/*:
 * @target MZ
 * @plugindesc GTBS battlers, actions and AI (VX Ace), with Pinnacle's battle rules, for imported games
 * @author GubiD (GTBS 1.5.1.4) and the game's author; ported for RPG Reactor
 * @url https://github.com/Psychronic-Games/RPG-Reactor
 * @base RR_PinnacleGtbs
 * @orderAfter RR_PinnacleGtbs
 *
 * @help RR_PinnacleGtbsBattlers.js
 *
 * Actors and enemies as units on the battle map: where they stand, which way
 * they face, how they walk a route tile by tile (with footsteps on foot, horse
 * or snake, on grass or in water), the tiles they can reach and attack, how
 * they hit (Ace's item rules as the game changed them) and what the AI picks:
 * every action from every reachable tile at every target in range, rated by
 * its tactic (default, attack, defend, healer, …) and chosen at random by
 * rating among the best.
 *
 * Installed by File › Import Project… when the imported game carried the
 * original script; its settings were read from the game's copy.
 */
(() => {
    'use strict';
    const R = window.RRGtbs;
    if (!R) return;
    const { G, U, GT, text, rand } = R;
    const get = R.get;
    const table = R.tableOf, list = R.listOf, idiv = R.idiv;
    const scene = () => R.scene();
    const inTbs = () => R.inBattle();

    // Positions are [x, y] pairs; GTBS compared them by value.
    const P = R.P = {
        key: (x, y) => x + ',' + y,
        eq: (a, b) => !!a && !!b && a[0] === b[0] && a[1] === b[1],
        includes: (arr, pos) => !!pos && arr.some(p => p && p[0] === pos[0] && p[1] === pos[1]),
        /** Array#- */
        minus: (a, b) => { const s = new Set(b.map(p => P.key(p[0], p[1]))); return a.filter(p => !s.has(P.key(p[0], p[1]))); },
        /** Array#| */
        union: (a, b) => { const s = new Set(a.map(p => P.key(p[0], p[1]))); const out = a.slice(); for (const p of b) { const k = P.key(p[0], p[1]); if (!s.has(k)) { s.add(k); out.push(p); } } return out; },
        /** Array#& */
        and: (a, b) => { const s = new Set(b.map(p => P.key(p[0], p[1]))); const seen = new Set(); return a.filter(p => { const k = P.key(p[0], p[1]); if (!s.has(k) || seen.has(k)) return false; seen.add(k); return true; }); },
        uniq: (a) => { const s = new Set(); return a.filter(p => { const k = P.key(p[0], p[1]); if (s.has(k)) return false; s.add(k); return true; }); }
    };
    const uniqObjects = (a) => a.filter((x, i) => a.indexOf(x) === i);
    const andObjects = (a, b) => uniqObjects(a.filter(x => b.includes(x)));
    R.uniqObjects = uniqObjects;
    R.andObjects = andObjects;

    // $game_map.distance (GTBS): city-block distance, a third of it when either has state 45.
    const distance = R.distance = (p1, p2) => {
        let mult = 1;
        if (p1 instanceof Game_Battler && p2 instanceof Game_Battler && (p1.isStateAffected(45) || p2.isStateAffected(45))) mult = 3;
        return idiv(Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y), mult);
    };
    const TEST_DIR = [[2, 0, 1], [4, -1, 0], [6, 1, 0], [8, 0, -1]];
    R.TEST_DIR = TEST_DIR;
    // Battlers and map events, asked the same questions.
    R.atXy = (e, x, y) => (e instanceof Game_Battler ? e.tbsAtXy(x, y) : e.x === x && e.y === y);
    R.isThrough = (e) => (e instanceof Game_Battler ? !!e._tbsThrough : e.isThrough());
    R.charName = (e) => (e instanceof Game_Battler ? e.tbsCharacterName() : e.characterName());
    // $game_map.add_cost_move: the terrain tag of the tile left (1–3) adds to the step, unless the unit
    // flies or its traverse type ignores it.
    R.addCostMove = (bat, x, y) => {
        let tt = $gameMap.terrainTag(x, y);
        const type = bat.isActor() ? GT.actTraverse(bat._actorId) : GT.enTraverse(bat._enemyId);
        if (bat.tbsFlyingUnit()) tt = 0;
        if (type === 1 && tt === 1) tt = 0;
        else if (type === 2 && tt === 2) tt = 0;
        else if (type === 3 && (tt === 1 || tt === 2)) tt = 0;
        if (tt > 3) tt = 0;
        return tt;
    };
    // $game_map.occupied_by?: the unit standing (or lying, if bodies stay) on a tile.
    R.occupiedBy = (x, y) => {
        const sc = scene();
        if (!sc) return null;
        const removeDead = get('REMOVE_DEAD', 2);
        for (const b of sc.tacticsAll()) {
            if (b.isDeathStateAffected() && removeDead === 2) continue;
            if (b.isDeathStateAffected() && b.isEnemy() && removeDead > 0) continue;
            if (b.tbsAtXy(x, y)) return b;
        }
        return null;
    };

    //=========================================================================
    // Game_Battler as a character on the map (GTBS Game_Battler-A/B)
    //=========================================================================
    const GB = Game_Battler.prototype;
    const _gbInit = GB.initMembers;
    GB.initMembers = function() {
        _gbInit.call(this);
        this.rrInitTbsMembers();
    };
    GB.rrInitTbsMembers = function() {
        // Game_Battler (the game's)
        this._affection = 0;
        this._maxaffection = 100;
        this._flags = [];
        this._lastHitBy = '';
        this._homeland = '';
        this._lastLevel = 0;
        this._animationId = 0;
        this._animationMirror = false;
        this._spriteEffectType = null;
        // Game_CharacterBase, copied into the battler
        this._tbsX = 0; this._tbsY = 0; this._tbsRealX = 0; this._tbsRealY = 0;
        this._tbsTileId = 0; this._tbsMoveSpeed = 4; this._tbsWalkAnime = true; this._tbsStepAnime = false;
        this._tbsDirectionFix = false; this._tbsOpacity = 255; this._tbsBlendType = 0; this._tbsDirection = 2; this._tbsPattern = 1;
        this._tbsPriorityType = 1; this._tbsThrough = false; this._tbsBushDepth = 0; this._tbsBalloonId = 0; this._tbsTransparent = false;
        this._tbsStepWait = 0; this._tbsOriginalPattern = 1; this._tbsAnimeCount = 0; this._tbsStopCount = 0;
        this._tbsJumpCount = 0; this._tbsJumpPeak = 0; this._tbsMoveSucceed = true;
        // GTBS
        this._tbsNeutral = false; this._tbsAtb = 0; this._tbsSkillcasting = 0; this._tbsSkillCast = null;
        this._tbsMoved = false; this._tbsTilesMoved = 0; this._tbsPerfAction = false; this._tbsUsedRapid = false; this._tbsExtraMove = false;
        this._tbsCollapsed = false; this._tbsPause = false; this._tbsPath = []; this._tbsOffset = 0; this._tbsDodgeCount = 0;
        this._tbsBattler = false; this._tbsOriginallyNeutral = false; this._tbsPose = 0; this._tbsTimer = 0; this._tbsMoveActions = [];
        this._tbsDamage = null; this._tbsDamagePop = false; this._tbsCostForMove = 0; this._tbsTempTeam = null; this._tbsTempTactic = null;
        this._tbsFloatingDir = null; this._tbsFloatOffset = null; this._tbsWepCheck = 0; this._tbsTargeted = null; this._tbsDoomCounter = null;
        this._team = this.isEnemy() ? 'enemy' : 'actor';
        // VE Damage Popup
        this._damaged = false; this._counter = false; this._reflect = false; this._covered = false; this._missed = false; this._noDmg = false;
    };
    // Accessors the game's scripts and damage formulas use (a.x, b.moved = false, a.perf_action = false …).
    Object.defineProperties(GB, {
        x: { get() { return this._tbsX || 0; }, configurable: true },
        y: { get() { return this._tbsY || 0; }, configurable: true },
        affection: { get() { return this._affection || 0; }, set(v) { this._affection = v; }, configurable: true },
        maxaffection: { get() { return this._maxaffection ?? 100; }, set(v) { this._maxaffection = v; }, configurable: true },
        flags: { get() { return this._flags || (this._flags = []); }, set(v) { this._flags = v; }, configurable: true },
        homeland: { get() { return this._homeland || ''; }, set(v) { this._homeland = v; }, configurable: true },
        lastHitBy: { get() { return this._lastHitBy || ''; }, set(v) { this._lastHitBy = v; }, configurable: true },
        lastLevel: { get() { return this._lastLevel || 0; }, set(v) { this._lastLevel = v; }, configurable: true },
        tilesMoved: { get() { return this._tbsTilesMoved || 0; }, set(v) { this._tbsTilesMoved = v; }, configurable: true },
        moved: { get() { return !!this._tbsMoved; }, set(v) { this._tbsMoved = v; }, configurable: true },
        perfAction: { get() { return !!this._tbsPerfAction; }, set(v) { this.tbsSetPerfAction(v); }, configurable: true },
        usedRapid: { get() { return !!this._tbsUsedRapid; }, set(v) { this._tbsUsedRapid = v; }, configurable: true },
        extraMove: { get() { return !!this._tbsExtraMove; }, set(v) { this._tbsExtraMove = v; }, configurable: true },
        neutral: { get() { return !!this._tbsNeutral; }, set(v) { this._tbsNeutral = v; }, configurable: true },
        animationId: { get() { return this._animationId || 0; }, set(v) { this._animationId = v == null ? 0 : v; }, configurable: true },
        damaged: { get() { return !!this._damaged; }, set(v) { this._damaged = v; }, configurable: true },
        missed: { get() { return !!this._missed; }, set(v) { this._missed = v; }, configurable: true },
        // Damage formulas made only of names and arithmetic keep their Ruby spelling (b.flying_unit_effectiveness).
        flying_unit_effectiveness: { get() { return this.tbsFlyingUnitEffectiveness(); }, configurable: true },
        infantry_effectiveness: { get() { return this.tbsInfantryEffectiveness(); }, configurable: true },
        terrain_def: { get() { return this.tbsTerrainDef(); }, configurable: true },
        terrain_eva: { get() { return this.tbsTerrainEva(); }, configurable: true },
        tiles_moved: { get() { return this.tilesMoved; }, set(v) { this.tilesMoved = v; }, configurable: true },
        actor_id: { get() { return this.isActor() ? this.actorId() : 0; }, configurable: true }
    });
    GB.tbsPos = function() { return [this.x, this.y]; };
    GB.tbsRealX = function() { return this._tbsRealX || 0; };
    GB.tbsRealY = function() { return this._tbsRealY || 0; };
    GB.tbsDirection = function() { return this._tbsDirection || 2; };
    GB.tbsPattern = function() { return this._tbsPattern ?? 1; };
    GB.tbsMoving = function() { return this._tbsRealX !== this._tbsX || this._tbsRealY !== this._tbsY; };
    GB.tbsJumping = function() { return this._tbsJumpCount > 0; };
    GB.tbsJumpHeight = function() {
        const p = this._tbsJumpPeak, c = this._tbsJumpCount;
        return idiv(p * p - Math.pow(Math.abs(c - p), 2), 2);
    };
    GB.tbsRealMoveSpeed = function() { return R.goFast() ? 8 : this._tbsMoveSpeed; };
    GB.tbsDistancePerFrame = function() { return Math.pow(2, this.tbsRealMoveSpeed()) / 256; };
    GB.tbsStraighten = function() {
        if (this._tbsWalkAnime || this._tbsStepAnime) this._tbsPattern = 1;
        this._tbsAnimeCount = 0;
    };
    GB.tbsReverseDir = function(d) { return 10 - d; };
    GB.tbsMoveto = function(x, y) {
        this._tbsX = ((x % $gameMap.width()) + $gameMap.width()) % $gameMap.width();
        this._tbsY = ((y % $gameMap.height()) + $gameMap.height()) % $gameMap.height();
        this._tbsRealX = this._tbsX;
        this._tbsRealY = this._tbsY;
        this.tbsStraighten();
        this.tbsUpdateBushDepth();
    };
    GB.tbsSetDirection = function(d) {
        if (!this._tbsDirectionFix && d !== 0) this._tbsDirection = d;
        this._tbsStopCount = 0;
    };
    GB.tbsObjectCharacter = function() { return this._tbsTileId > 0 || this.tbsCharacterName().charAt(0) === '!'; };
    GB.tbsShiftY = function() { return this.tbsObjectCharacter() ? 0 : 4; };
    GB.tbsScreenX = function() { return $gameMap.adjustX(this._tbsRealX) * $gameMap.tileWidth() + $gameMap.tileWidth() / 2; };
    GB.tbsScreenY = function() {
        return $gameMap.adjustY(this._tbsRealY) * $gameMap.tileHeight() + $gameMap.tileHeight() - this.tbsShiftY() - this.tbsJumpHeight();
    };
    GB.tbsScreenZ = function() { return this._tbsPriorityType * 100; };
    GB.tbsUpdate = function() {
        this.tbsUpdateAnimation();
        if (this.tbsJumping()) this.tbsUpdateJump();
        else if (this.tbsMoving()) this.tbsUpdateMove();
        else this.tbsUpdateStop();
        // GTBS: walk the route a tile at a time, dodge, float.
        if (this._tbsPath && this._tbsPath.length > 0 && !this.tbsMoving()) this.tbsRunPath();
        this.tbsUpdateDodge();
        this.tbsUpdateFloating();
    };
    GB.tbsUpdateJump = function() {
        this._tbsJumpCount--;
        this._tbsRealX = (this._tbsRealX * this._tbsJumpCount + this._tbsX) / (this._tbsJumpCount + 1);
        this._tbsRealY = (this._tbsRealY * this._tbsJumpCount + this._tbsY) / (this._tbsJumpCount + 1);
        this.tbsUpdateBushDepth();
        if (this._tbsJumpCount === 0) { this._tbsRealX = this._tbsX = $gameMap.roundX(this._tbsX); this._tbsRealY = this._tbsY = $gameMap.roundY(this._tbsY); }
    };
    // The game's footsteps: horse classes and snakes their own, grass and water by region.
    GB.tbsUpdateMove = function() {
        if (this._tbsStepWait < 0 && !this.tbsFlyingUnit()) {
            const classId = this.isActor() ? this._classId : null;
            const enemyId = this.isEnemy() ? this._enemyId : null;
            let sound = [7].includes(classId) ? 'Step-horse' : 'Step-foot';
            const region = $gameMap.regionId(Math.trunc(this._tbsRealX), Math.trunc(this._tbsRealY));
            if ([17, 18].includes(enemyId) || [37].includes(classId)) sound = 'Step-snake';
            if ([17, 5].includes(region)) sound = 'Step-grass';
            if ([7].includes(region)) sound = 'Step-water';
            if (this.tbsMoving()) AudioManager.playSe({ name: sound, volume: 80, pitch: 100 + Graphics.frameCount % 20, pan: 0 });
            this._tbsStepWait = 15;
        }
        const d = this.tbsDistancePerFrame();
        if (this._tbsX < this._tbsRealX) this._tbsRealX = Math.max(this._tbsRealX - d, this._tbsX);
        if (this._tbsX > this._tbsRealX) this._tbsRealX = Math.min(this._tbsRealX + d, this._tbsX);
        if (this._tbsY < this._tbsRealY) this._tbsRealY = Math.max(this._tbsRealY - d, this._tbsY);
        if (this._tbsY > this._tbsRealY) this._tbsRealY = Math.min(this._tbsRealY + d, this._tbsY);
        if (!this.tbsMoving()) this.tbsUpdateBushDepth();
        this._tbsStepWait--;
        // GTBS: the walk cycles faster than the step.
        if (this._tbsWalkAnime) this._tbsAnimeCount += 3.0;
        else if (this._tbsStepAnime) this._tbsAnimeCount += 2.0;
    };
    GB.tbsUpdateStop = function() { this._tbsStopCount++; };
    GB.tbsUpdateAnimation = function() {
        if (this.tbsMoving() && this._tbsWalkAnime) this._tbsAnimeCount += 1.5;
        else if (this._tbsStepAnime || this._tbsPattern !== this._tbsOriginalPattern) this._tbsAnimeCount += 1;
        if (this._tbsAnimeCount > 18 - this.tbsRealMoveSpeed() * 2) {
            if (!this._tbsStepAnime && this._tbsStopCount > 0) this._tbsPattern = this._tbsOriginalPattern;
            else this._tbsPattern = (this._tbsPattern + 1) % 4;
            this._tbsAnimeCount = 0;
        }
    };
    GB.tbsUpdateBushDepth = function() {
        if (this._tbsPriorityType === 1 && !this.tbsObjectCharacter() && $gameMap.isBush(this._tbsX, this._tbsY) && !this.tbsJumping()) {
            if (!this.tbsMoving()) this._tbsBushDepth = 8;
        } else {
            this._tbsBushDepth = 0;
        }
    };
    GB.tbsIncreaseSteps = function() {
        if ($gameMap.isLadder(this._tbsX, this._tbsY)) this.tbsSetDirection(8);
        this._tbsStopCount = 0;
        this.tbsUpdateBushDepth();
    };
    GB.tbsMoveStraight = function(d, turnOk = true) {
        this._tbsMoveSucceed = this.tbsPassable(this._tbsX, this._tbsY, d);
        if (this._tbsMoveSucceed) {
            this.tbsSetDirection(d);
            this._tbsX = $gameMap.roundXWithDirection(this._tbsX, d);
            this._tbsY = $gameMap.roundYWithDirection(this._tbsY, d);
            this._tbsRealX = $gameMap.xWithDirection(this._tbsX, this.tbsReverseDir(d));
            this._tbsRealY = $gameMap.yWithDirection(this._tbsY, this.tbsReverseDir(d));
            this.tbsIncreaseSteps();
        } else if (turnOk) {
            this.tbsSetDirection(d);
        }
    };
    GB.tbsTurnTowardCharacter = function(character) {
        const sx = this._tbsX - character.x, sy = this._tbsY - character.y;
        if (Math.abs(sx) > Math.abs(sy)) this.tbsSetDirection(sx > 0 ? 4 : 6);
        else if (sy !== 0) this.tbsSetDirection(sy > 0 ? 8 : 2);
    };

    //=========================================================================
    // GTBS Game_Battler-C
    //=========================================================================
    GB.tbsTeam = function() { return this._tbsTempTeam != null ? this._tbsTempTeam : (this._team || (this.isEnemy() ? 'enemy' : 'actor')); };
    GB.tbsSetTeam = function(value) { this._tbsTempTeam = null; this._team = value; };
    GB.tbsCharacterName = function() { return ''; };
    GB.tbsCharacterIndex = function() { return 0; };
    GB.tbsCharacterHue = function() { return 0; };
    GB.tbsUnitSize = function() { return 1; };
    GB.tbsAnimated = function() { return false; };
    GB.tbsViewRange = function() {
        let range;
        if (!this.isActor()) {
            if (this.isStateAffected(37)) range = 4;
            else if (this.isStateAffected(39)) range = 2;
            else if (this.isStateAffected(38)) range = 12;
            else range = GT.viewRange(this._enemyId);
        } else {
            range = GT.viewRange(this._classId, true);
        }
        for (const stateId of this._states) range += table('STATE_VIEW_INFO')[stateId] || 0;
        return range;
    };
    GB.tbsPositions = function(x = this.x, y = this.y) {
        const size = this.tbsUnitSize();
        if (size === 1) return [[x, y]];
        const tiles = [];
        for (let ox = x; ox < x + size; ox++) for (let oy = y; oy < y + size; oy++) tiles.push([ox, oy]);
        return tiles;
    };
    GB.tbsAtXy = function(x, y) {
        const size = this.tbsUnitSize();
        if (size === 1) return this.x === x && this.y === y;
        return x >= this.x && x <= this.x + size - 1 && y >= this.y && y <= this.y + size - 1;
    };
    GB.tbsHidden = function() { return !!this._hidden; };
    // Counter: an opponent (or a team-mate, if allowed) in reach of its weapon counters at its CNT chance.
    GB.tbsCounter = function(attacker, preview = false) {
        if (this === attacker || this.isDeathStateAffected()) return null;
        if (!get('COUNTER_TEAM', false) && attacker.tbsFriends().includes(this)) return null;
        for (const state of this.states()) {
            if (!get('COUNTER_WHEN_CHARMED', false) && state.id === get('CHARM_ID', 0)) return null;
            if (!get('COUNTER_WHEN_KNOCKED_BACK', false) && list('KNOCK_BACK_STATES').includes(state.id)) return null;
        }
        const [max, min] = this.tbsWeaponRange();
        const atkPos = this.tbsCalcPosAttack(max, min, [this.tbsPos()]);
        const atkPositions = preview ? attacker.tbsPositions(preview[0], preview[1]) : attacker.tbsPositions();
        if (!P.and(atkPos, atkPositions).length) return null;
        if (get('COUNTER_ALL', false)) return this;
        if (preview) return this.cnt;
        return rand(100) < this.cnt ? this : null;
    };
    GB.tbsHasDoom = function() {
        for (const id of this._states) {
            if (id === get('DOOM_ID', 0) && get('DOOM_ID', 0) !== 0 && this._tbsDoomCounter != null) {
                this._tbsDoomCounter--;
                if (this._tbsDoomCounter < 0) {
                    this._tbsDoomCounter = null;
                    this.setHp(0);
                    this._result.doom = R.V.DOOM || 'Doom!';
                    this.rrDamageFlag();
                    this.tbsPerformDeath();
                    return;
                }
                this._result.doom = String(this._tbsDoomCounter).padStart(2, ' ');
                this.rrDamageFlag();
            }
        }
    };
    GB.rrDamageFlag = function() { this._result.used = true; this._damaged = true; this._missed = false; };
    GB.tbsSetPose = function(type) {
        // Charset battlers have no pose table: the pose stays as it was.
        if (typeof type === 'number') this._tbsPose = type;
        this.refresh();
    };
    GB.tbsPose = function() { return this._tbsPose || 0; };
    GB.tbsIsSlow = function() { return this.isStateAffected(get('SLOW_ID', 0)); };
    GB.tbsIsHaste = function() { return this.isStateAffected(get('HASTE_ID', 0)); };
    GB.tbsKnockBack = function(direction) {
        this._tbsTilesMoved = 0;
        if (direction === 2) this._tbsY += 1;
        else if (direction === 4) this._tbsX -= 1;
        else if (direction === 6) this._tbsX += 1;
        else if (direction === 8) this._tbsY -= 1;
        if (this.isActor() && this.hasSkill(297)) $gameTemp.pathfinderLocations[this._actorId] = [this._tbsX, this._tbsY];
    };
    // Skill 10's formula: the target lands on the nearest free tile around the user.
    GB.tbsTeleToClosestLoc = function(x, y) {
        const pos = this.tbsClosestLocation(x, y);
        if (pos) this.tbsMoveto(pos[0], pos[1]);
        if (this.isActor() && this.hasSkill(297)) $gameTemp.pathfinderLocations[this._actorId] = [this._tbsX, this._tbsY];
    };
    GB.tbsClosestLocation = function(x, y) {
        let positions = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(d => [x + d[0], y + d[1]]);
        let guard = 0;
        while (positions.length > 0 && guard++ < 10000) {
            for (const pos of positions.slice()) {
                if (this.tbsValidTelepos(pos[0], pos[1]) && !this.tbsCollideWithAnyBattlers(pos[0], pos[1])) return pos;
                if (this.tbsValidTelepos(pos[0], pos[1])) for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) positions.push([pos[0] + d[0], pos[1] + d[1]]);
                else positions = positions.filter(p => !P.eq(p, pos));
            }
        }
        return null;
    };
    GB.tbsCollideWithAnyBattlers = function(x, y) {
        for (const event of $gameSystem.tbsTacticalEvents()) {
            if (event === this) continue;
            if (!R.atXy(event, x, y)) continue;
            if (R.isThrough(event) || R.charName(event) === '') continue;
            if (event instanceof Game_Event) return true;
            if (event instanceof Game_Battler) return (get('REMOVE_DEAD', 2) > 0 && event.isDeathStateAffected()) ? false : true;
        }
        return false;
    };
    GB.tbsValidTelepos = function(x, y) {
        if (!$gameMap.isValid(x, y)) return false;
        if (this.tbsPassableRegions().includes($gameMap.regionId(x, y))) return true;
        return false;
    };
    // Casting (only in ATB battles, where skills can take time).
    GB.tbsSetupSkill = function() { this._tbsSkillcasting = GT.skillWait(this._tbsSkillCast[0].id)[0]; };
    GB.tbsCasting = function() { return this._tbsSkillcasting > 0; };
    GB.tbsCast = function() { return this._tbsSkillCast; };
    GB.tbsUpCast = function(reset = false) { if (!reset) this._tbsSkillcasting -= this.mat; else this._tbsSkillcasting = 0; };
    GB.tbsCheckCasting = function() {
        const id = get('CASTING_ID', 0);
        if (this.tbsCasting() && !this.tbsMuted()) this.addState(id); else this.removeState(id);
    };
    GB.tbsMovedQ = function() { return !!this._tbsMoved; };
    GB.tbsPerfactionQ = function() { return !!this._tbsPerfAction; };
    GB.tbsSetPerfAction = function(bool) {
        this._tbsPerfAction = bool;
        if (bool === true && get('FORCE_MOVE_THEN_ACT', true)) this._tbsMoved = true;
    };
    // ATB (unused by the game's team mode, kept for its Act List).
    GB.tbsAtbUpdate = function() { this._tbsAtb++; };
    GB.tbsPromptness = function() { return this.agi * (this.tbsCasting() ? GT.skillWait(this._tbsSkillCast[0].id)[1] / 100 : 1.0); };
    GB.tbsRecuperationTime = function() { return Math.trunc(4096 / this.tbsPromptness()); };
    GB.tbsResetAtb = function() { this._tbsAtb = 0; return 0; };
    GB.tbsSetupAtb = function(atb) { this._tbsAtb = idiv(this.tbsRecuperationTime() * atb, 100); };

    // Passability: only the regions a unit may walk (0, 10, 17, 63 and its "pass N" notes), flies over, or
    // the pathfinder's own tiles. The map's own passage table never lets anyone through.
    GB.tbsPassableOne = function(x, y, d, ignoreBattlers = false) {
        const x2 = $gameMap.roundXWithDirection(x, d), y2 = $gameMap.roundYWithDirection(y, d);
        if (!$gameMap.isValid(x2, y2)) return false;
        if (this._tbsThrough) return true;
        if (this.tbsCollideWithBattlers(x2, y2) && !ignoreBattlers) return false;
        if (this.tbsCanFlyOver(x2, y2)) return true;
        if (this.tbsCanWalkOver(x2, y2)) return true;
        return false;
    };
    GB.tbsPassable = function(x, y, d, ignoreBattlers = false) {
        for (const [ux, uy] of this.tbsPositions(x, y)) {
            if (this.tbsPassableOne(ux, uy, d, ignoreBattlers) === false) return false;
        }
        return true;
    };
    GB.tbsCanFlyOver = function(x, y) { return this.tbsFlyingUnit() && this.tbsFlyableRegions().includes($gameMap.regionId(x, y)); };
    GB.tbsCanWalkOver = function(x, y) {
        if (this.isActor() && R.pathfinderIncludes(x, y)) return true;
        return this.tbsPassableRegions().includes($gameMap.regionId(x, y));
    };
    GB.tbsNotes = function() { return ''; };
    const passRegions = (base, notes) => {
        const regions = base.slice();
        for (const line of String(notes).split('\n')) { const m = /pass (.+)/i.exec(line); if (m) regions.push(parseInt(m[1], 10) || 0); }
        return regions;
    };
    GB.tbsPassableRegions = function() { return passRegions([0, 10, 17, 63], this.tbsNotes()); };
    GB.tbsFlyableRegions = function() { return passRegions([3, 4, 5, 6, 7, 9, 11, 12, 13], this.tbsNotes()); };
    GB.tbsCanOccupy = function(pos) {
        for (const ps of this.tbsPositions(pos[0], pos[1])) {
            const occ = R.occupiedBy(ps[0], ps[1]);
            if (occ && occ !== this) return false;
        }
        return true;
    };
    // TEAM_THROUGH: team-mates walk through each other; structures (skill 143) block everyone.
    GB.tbsCollideWithBattlers = function(x, y) {
        const removeDead = get('REMOVE_DEAD', 2);
        for (const event of $gameSystem.tbsTacticalEvents()) {
            if (event === this) continue;
            if (!R.atXy(event, x, y)) continue;
            if (R.isThrough(event) || R.charName(event) === '') continue;
            if (event instanceof Game_Event) return event._priorityType === 1;
            if (get('TEAM_THROUGH', true)) {
                if (event.hasSkill(143)) return true;
                if (this.tbsTeam() === event.tbsTeam()) return false;
            }
            if (event.isEnemy()) return (removeDead > 0 && event.isDeathStateAffected()) ? false : true;
            if (event.isActor()) return (removeDead > 1 && event.isDeathStateAffected()) ? false : true;
            return !(event.isDeathStateAffected() && removeDead === 2);
        }
        return false;
    };
    GB.tbsRunRoute = function(route) {
        this.tbsSetPose('Walk');
        this._tbsPath = (route || []).slice();
    };
    GB.tbsRunPath = function() {
        if (this._tbsPath.length > 0) {
            const dir = this._tbsPath.shift();
            this._tbsTilesMoved++;
            this.tbsMoveStraight(dir);
        }
    };
    GB.tbsResetTilesMoved = function() { this._tbsTilesMoved = 0; };
    const turnBy = (self, sx, sy) => {
        if (sx === 0 && sy === 0) return 0;
        if (Math.abs(sx) > Math.abs(sy)) { self._tbsDirection = sx > 0 ? 4 : 6; return Math.abs(sx); }
        self._tbsDirection = sy > 0 ? 8 : 2;
        return Math.abs(sy);
    };
    GB.tbsTurnTo = function(who) { if (!who) return undefined; return turnBy(this, this.x - who.x, this.y - who.y); };
    GB.tbsTurnToPos = function(x, y) { return turnBy(this, this.x - x, this.y - y); };
    GB.tbsTurnToMidpoint = function(array) {
        if (!array) return undefined;
        let mx = 0, my = 0;
        for (const t of array) { mx += t.x; my += t.y; }
        mx = idiv(mx, array.length); my = idiv(my, array.length);
        return turnBy(this, this.x - mx, this.y - my);
    };
    GB.tbsClassName = function() { return this.isActor() ? this.currentClass().name : ''; };
    GB.tbsApplyXDodgeOffset = function(val) { const d = this._tbsDirection; return val + (d === 8 ? this._tbsOffset : d === 6 ? -this._tbsOffset : 0); };
    GB.tbsApplyYDodgeOffset = function(val) { const d = this._tbsDirection; return val + (d === 6 ? this._tbsOffset : d === 4 ? -this._tbsOffset : 0); };
    GB.tbsResetFloat = function() { this._tbsFloatingDir = null; this._tbsFloatOffset = null; };
    GB.tbsFloating = function() { return this._tbsFloatOffset != null; };
    GB.tbsFloatCount = function() { return this._tbsFloatOffset; };
    GB.tbsFlyingUnit = function() {
        if (this.isActor()) {
            if (list('FlyingActors').includes(this._actorId) || list('FlyingClasses').includes(this._classId)) return true;
            for (const wep of this.weapons()) if (list('WeaponCausesFlight').includes(wep.id)) return true;
            for (const arm of this.armors()) if (list('EquipCausesFlight').includes(arm.id)) return true;
        } else if (list('EnemiesWhoFly').includes(this._enemyId)) {
            return true;
        }
        for (const id of this._states) if (list('StateCausesFlight').includes(id)) return true;
        return false;
    };
    GB.tbsFlyingUnitEffectiveness = function() { return this.tbsFlyingUnit() ? 2 : 1; };
    GB.tbsMountedUnit = function() { return this.attackElements().includes(15); };
    GB.tbsInfantryEffectiveness = function() {
        if (this.tbsFlyingUnit() || this.tbsMountedUnit() || this.hasSkill(143)) return 1;
        return 2;
    };
    GB.tbsUpdateFloating = function() {
        if (!this.tbsFlyingUnit()) return;
        if (this._tbsFloatingDir == null) { this._tbsFloatingDir = 1; this._tbsFloatOffset = 0; }
        if (Graphics.frameCount % 5 === 0) {
            if (this._tbsFloatingDir === 0) { this._tbsFloatOffset--; if (this._tbsFloatOffset === 2) this._tbsFloatingDir = 1; }
            else { this._tbsFloatOffset++; if (this._tbsFloatOffset === 6) this._tbsFloatingDir = 0; }
        }
    };
    GB.tbsDodge = function() { this._tbsOffset = 0; this._tbsDodgeCount = 30; };
    GB.tbsUpdateDodge = function() {
        const c = this._tbsDodgeCount;
        if (c >= 5 && c <= 13) this._tbsOffset--;
        else if (c >= 17 && c <= 25) this._tbsOffset++;
        this._tbsDodgeCount--;
    };
    GB.tbsSkillCanUse = function(skill) {
        const result = this.canUse(skill);
        if (result && this.tbsTbsSkillCanUse(skill) === false) return false;
        return result;
    };
    GB.tbsTbsSkillCanUse = function(skill) {
        const sc = scene();
        if (!sc) return true;
        const sum = GT.isSummon(skill.id, this.isActor());
        if (sum > 0) {
            const name = String($gameActors.actor(sum).name());
            const maxAmount = get('SUMMON_GAIN_EXP', true) ? 1 : GT.summonInstanceCount(sum);
            let n = 0;
            for (const bat of $gameParty.tbsExistingMembers().concat($gameTroop.tbsExistingMembers(), $gameParty.tbsNeutrals())) if (String(bat.name()) === name) n++;
            if (n >= maxAmount) return false;
        }
        if (U.forDeadFriend(skill) && sc.tacticsDead().length === 0) return false;
        return true;
    };
    // The side a hit comes from (attacker relative to target).
    const directionFrom = (ax, ay, tx, ty) => {
        if (ax === tx) return ay > ty ? 2 : ay === ty ? 0 : 8;
        const coef = (ay - ty) / (ax - tx);
        if (ax > tx) return coef < -1 ? 8 : coef > 1 ? 2 : 6;
        return coef < -1 ? 2 : coef > 1 ? 8 : 4;
    };
    R.directionFrom = directionFrom;
    GB.tbsGetDirection = function(attacker, target = this) { return directionFrom(attacker.x, attacker.y, target.x, target.y); };
    GB.tbsFromBack = function(attacker) {
        if (this.isStateAffected(33) || this.hasSkill(143) || this.hasSkill(149)) return false;
        return this._tbsDirection === 10 - this.tbsGetDirection(attacker);
    };
    GB.tbsFromFront = function(attacker) {
        if (this.isStateAffected(33) || this.hasSkill(143) || this.hasSkill(149)) return true;
        return this._tbsDirection === this.tbsGetDirection(attacker);
    };
    GB.tbsFromSide = function(attacker) {
        if (this.isStateAffected(33) || this.hasSkill(143) || this.hasSkill(149)) return false;
        return !this.tbsFromFront(attacker) && !this.tbsFromBack(attacker);
    };
    // Hits from behind ×1.5 (×2 with skill 144), from the front × GRD, from the side ×1.2.
    GB.tbsApplyDirection = function(damage, attacker) {
        if (this.tbsFromBack(attacker)) damage *= attacker.hasSkill(144) ? 2 : 1.5;
        else if (this.tbsFromFront(attacker)) damage *= this.grd;
        else damage *= 1.2;
        return Math.trunc(damage);
    };
    GB.tbsReduceAt = function() {
        if ($gameSystem.tbsCustBattle() === 'ATB' && get('REDUCE_AT_PERC', 5) > 0) this._tbsAtb -= idiv(this._tbsAtb * get('REDUCE_AT_PERC', 5), 100);
    };
    GB.tbsSkillRange = function(skillId) {
        let base = GT.skillRange(skillId).slice();
        if (list('Prevent_Skill_Range_Mod').includes(skillId)) return base;
        base = this.tbsSkillRangeMod(base);
        return this.tbsAdjustRangeForSummon(base, skillId);
    };
    GB.tbsAdjustRangeForSummon = function(range, skillId) {
        if (range[1] > 0 && GT.isSummon(skillId, this.isActor()) > 0) range[1] = 0;
        return range;
    };
    GB.tbsSkillRangeMod = function(range) {
        let [max, field] = [range[0], range[1]];
        let min = range[4], vRange = range[5], vAoe = range[6];
        const add = (data) => { max += data[0]; min += data[1]; field += data[2]; vRange += data[3]; vAoe += data[4]; };
        for (const state of this.states()) add(GT.stateSkillRangeModification(state.id));
        if (this.isActor()) {
            for (const arm of this.armors()) if (arm) add(GT.equipSkillRangeModification(arm.id));
            for (const wep of this.weapons()) add(GT.equipSkillRangeModification(wep.id, 1));
        }
        range[0] = Math.max(0, max);
        range[4] = Math.max(0, Math.min(min, max));
        range[1] = Math.max(0, field);
        range[5] = vRange;
        range[6] = vAoe;
        return range;
    };
    GB.tbsOpponents = function() { const sc = scene(); return sc ? sc.opponentsOf(this) : []; };
    GB.tbsFriends = function() { const sc = scene(); return sc ? sc.friendsOf(this) : []; };
    GB.tbsDeadFriends = function() { const sc = scene(); return sc ? sc.deadFriendsOf(this) : []; };
    GB.tbsCanTeleport = function() {
        const a = get('TELEPORT1_ID', 0), b = get('TELEPORT2_ID', 0);
        return (b > 0 && this.isStateAffected(b)) || (a > 0 && this.isStateAffected(a));
    };
    GB.tbsTeleportChance = function(pos) {
        const dist = Math.abs(this.x - pos.x) + Math.abs(this.y - pos.y);
        let chance;
        if (dist > 10) chance = 30 - dist * rand(5);
        else if (dist > 8) chance = 40 - dist * rand(5);
        else if (dist > 6) chance = 60 - dist * rand(5);
        else if (dist > 4) chance = 80 - dist * rand(5);
        else chance = 100 - (dist * rand(2) + 5);
        if (this.isStateAffected(get('TELEPORT2_ID', 0))) chance += 30;
        return rand(100) < chance;
    };
    GB.tbsEncounterEnemy = function() { return false; };
    GB.tbsAdjustSpecialStates = function() { this.tbsResetFloat(); };
    GB.tbsGtbsEntrance = function(x, y) {
        this.tbsMoveto(x, y);
        this._tbsDamage = null;
        this._tbsDamagePop = false;
        this._tbsTilesMoved = 0;
        this.appear();
        this._tbsBattler = true;
        this._tbsStepAnime = get('STOPPED_ANIM', true);
        this.tbsAdjustSpecialStates();
    };
    GB.tbsClosestEnemy = function() {
        const ops = this.tbsOpponents();
        let best;
        for (const e of ops) if (best === undefined || distance(this, e) < distance(this, best)) best = e;
        return best;
    };
    GB.tbsFaceClosestEnemy = function() { this.tbsTurnTo(this.tbsClosestEnemy()); };

    //------------------------------------------------------------------------
    // Ranges
    //------------------------------------------------------------------------
    // Every tile within move_range by the cheapest route (a step costs 1 plus the terrain tag of the tile
    // left: 1 forest, 2 rocky, 3; fliers and the unit's traverse type ignore theirs).
    GB.tbsCalcPosMove = function(moveRange = this.tbsBaseMoveRange()) {
        const start = this.tbsPos();
        const route = new Map([[P.key(start[0], start[1]), { pos: start, route: [] }]]);
        const cost = new Map([[P.key(start[0], start[1]), 0]]);
        const more = [start];
        for (let i = 0; i < more.length; i++) {
            const [x, y] = more[i];
            const k = P.key(x, y);
            const c = cost.get(k);
            for (const [dir, dx, dy] of TEST_DIR) {
                const nx = x + dx, ny = y + dy, nk = P.key(nx, ny);
                if (!this.tbsPassable(x, y, dir)) continue;
                const nuCost = c + 1 + R.addCostMove(this, x, y);
                if (nuCost > moveRange) continue;
                const old = cost.get(nk);
                if (old === undefined || old > nuCost) {
                    route.set(nk, { pos: [nx, ny], route: route.get(k).route.concat([dir]) });
                    cost.set(nk, nuCost);
                    if (nuCost < moveRange) more.push([nx, ny]);
                } else if (old === nuCost) {
                    if (rand(2) === 0) route.set(nk, { pos: [nx, ny], route: route.get(k).route.concat([dir]) });
                }
            }
        }
        for (const [k] of cost) {
            const entry = route.get(k);
            if (entry && !this.tbsCanOccupy(entry.pos)) route.delete(k);
        }
        return [route, cost];
    };
    R.routeKeys = (route) => [...route.values()].map(e => e.pos);
    R.routeOf = (route, pos) => { const e = route.get(P.key(pos[0], pos[1])); return e ? e.route : null; };
    R.costOf = (cost, pos) => cost.get(P.key(pos[0], pos[1]));
    GB.tbsSetTeleportPositions = function() {
        const out = [];
        for (let x = 0; x < $gameMap.width(); x++) for (let y = 0; y < $gameMap.height(); y++) {
            if ($gameMap.isPassable(x, y, 2) && this.tbsCanOccupy([x, y])) out.push([x, y]);
        }
        return out;
    };
    // Bows: everything within max (city blocks) and not under min.
    GB.tbsCalcPosBow = function(max, min, movePositions = [this.tbsPos()]) {
        if (max == null) return [];
        let all = [];
        for (const [x, y] of movePositions) {
            for (const [ox, oy] of this.tbsPositions(x, y)) {
                const atk = [], rem = [];
                for (let mx = -max; mx <= max; mx++) {
                    for (let my = -max + Math.abs(mx); my <= max - Math.abs(mx); my++) {
                        const nx = ox + mx, ny = oy + my;
                        if (!$gameMap.isValid(nx, ny)) continue;
                        if (Math.abs(mx) + Math.abs(my) < min) { rem.push([nx, ny]); continue; }
                        if (Math.abs(mx) + Math.abs(my) <= max) atk.push([nx, ny]);
                    }
                }
                all = P.union(all, P.minus(atk, rem));
            }
        }
        return all;
    };
    // Weapons and line skills: straight lines from each side of the unit.
    GB.tbsCalcPosAttack = function(max, min, movePositions = [this.tbsPos()]) {
        if (max == null) return [];
        const positions = [];
        for (const [x, y] of movePositions) {
            const bp = this.tbsPositions(x, y);
            if (max === 0 && min === 0) positions.push(bp);
            for (const [ox, oy] of bp) {
                const testDir = [];
                const around = [[ox, oy + 1], [ox, oy - 1], [ox - 1, oy], [ox + 1, oy]];
                for (let i = 0; i < 4; i++) if (!P.includes(bp, around[i])) testDir.push(i);
                for (let r = min + 1; r <= max; r++) {
                    for (const i of testDir) {
                        const t = [[ox, oy + r], [ox, oy - r], [ox - r, oy], [ox + r, oy]][i];
                        if (!$gameMap.isValid(t[0], t[1])) continue;
                        if (!P.includes(positions, t)) positions.push(t);
                    }
                }
            }
        }
        return positions;
    };
    // Spells and items: a diamond within max, less the diamond inside min.
    GB.tbsCalcPosSpell = function(max, min, movePositions = [this.tbsPos()]) {
        if (max == null) return [];
        if (max === 0) return this.tbsPositions();
        const rem = [];
        const positions = [];
        for (const [mx0, my0] of movePositions) {
            for (const [x, y] of this.tbsPositions(mx0, my0)) {
                for (let i = 0; i <= max; i++) {
                    const it = max - i;
                    for (let oy = 0; oy <= i; oy++) {
                        if (it + oy < min) continue;
                        for (const p of [[x - it, y - oy], [x - it, y + oy], [x + it, y + oy], [x + it, y - oy]]) {
                            if ($gameMap.isValid(p[0], p[1]) && !P.includes(positions, p)) positions.push(p);
                        }
                    }
                }
                for (let mx = -min; mx <= min; mx++) {
                    for (let my = -min + Math.abs(mx) + 1; my <= min - Math.abs(mx) - 1; my++) rem.push([x + mx, y + my]);
                }
            }
        }
        return P.minus(positions, rem);
    };
    // The tiles an action used at act_pos from move_pos hits.
    GB.tbsTargetZone = function(movePos = this.tbsPos(), actPos = this.currentAction().position, type = null) {
        if (!Array.isArray(type) || type[0] == null) return [];
        const [line, field, range, excludeCaster, vAoe] = type;
        let result;
        if (line) {
            result = [];
            const d = directionFrom(actPos[0], actPos[1], movePos[0], movePos[1]);
            const size = this.tbsUnitSize();
            for (const [x, y] of range) {
                if ((d === 2 && y > movePos[1] + (size - 1)) || (d === 6 && x > movePos[0] + (size - 1)) || (d === 4 && x < movePos[0]) || (d === 8 && y < movePos[1])) {
                    if (get('LARGE_LINE', true) || x === actPos[0] || y === actPos[1]) result.push([x, y]);
                }
            }
        } else {
            result = R.calculateAoe(field, 0, actPos[0], actPos[1], vAoe);
        }
        if (excludeCaster) result = P.minus(result, this.tbsPositions(movePos[0], movePos[1]));
        return result;
    };
    GB.tbsGetTargets = function() { return this.currentAction().tbsMakeTargets(); };
    GB.tbsHideMove = function() { return false; };
    GB.tbsStartTurn = function() {
        this._spriteEffectType = 'whiten';
        if (this.tbsCasting()) {
            if (GT.skillWait(this._tbsSkillCast[0].id)[2]) this._tbsMoved = true;
            this._tbsPerfAction = true;
        }
        if (get('DONT_ACT_ID', 0) && this.isStateAffected(get('DONT_ACT_ID', 0))) this._tbsPerfAction = true;
        if (get('DONT_MOVE_ID', 0) && this.isStateAffected(get('DONT_MOVE_ID', 0))) this._tbsMoved = true;
        this.clearActions();
        this._actions.push(new Game_Action(this));
    };
    // Waiting without having acted guards (the guard skill applied to oneself).
    GB.tbsSetWait = function() {
        this.tbsHasDoom();
        if (!this.tbsPerfactionQ() && get('AUTO_DEFEND', true)) {
            this.currentAction().setGuard();
            this.rrAceItemApply(this, $dataSkills[this.guardSkillId()]);
        }
        this.tbsClearTbsActions();
    };
    GB.tbsCountSkillUsage = function(spell) {
        if (GT.skillWait(spell.id)[2]) { this.tbsSetPerfAction(true); this._tbsMoved = true; }
        else if (GT.skillUseAction(spell.id)) this.tbsSetPerfAction(true);
        else this.tbsSetSkillTurnUsage(this.tbsSkillTurnUsage() + 1);
    };
    GB.tbsSkillTurnUsage = function() { return 0; };
    GB.tbsSetSkillTurnUsage = function() {};
    GB.tbsPerformDeath = function() {
        if (!this.isDead()) return;
        this._tbsSkillCast = null;
        this.tbsUpCast(true);
        if (this.tbsWillCollapse()) { const sc = scene(); if (sc) sc.queueCollapse(this); }
    };
    GB.tbsWillCollapse = function() { return false; };
    GB.tbsClearTbsActions = function() {
        this.clearActions();
        this._actions.push(new Game_Action(this));
    };
    GB.tbsSetCurrentAction = function(action) { this._actions = [action]; };
    GB.tbsApplyMoveCost = function(move) {
        const value = move * get('REQUIRED_TP_FOR_MOVE', 0);
        this.setTp(this.tp - Math.trunc(value));
    };
    GB.tbsMoveActionWaiting = function() { return this._tbsMoveActions.length > 0; };
    GB.tbsAtkAnimationId1 = function() { return 0; };
    GB.tbsAtkAnimationId2 = function() { return 0; };
    GB.tbsResetWepCheck = function() { this._tbsWepCheck = 0; };
    GB.tbsOnReact = function() {
        if (inTbs() && $gameSystem.tbsTeamMode()) {
            const acted = $gameSystem.tbsActed();
            const i = acted.indexOf(this);
            if (i >= 0) acted.splice(i, 1);
        }
    };
    GB.tbsApplyFloatEffect = function(val) { return this._tbsFloatOffset != null ? val - this._tbsFloatOffset : val; };
    GB.tbsWeaponName = function() { const w = this.weapons ? this.weapons()[0] : null; return w ? w.name : null; };
    // The attack skill: the first weapon's attack_skill note; army classes their own.
    const CLASS_SKILL_ID = { 30: 205, 31: 205, 32: 205, 33: 204, 34: 205, 35: 205, 36: 209, 37: 220, 38: 205, 39: 205, 40: 205, 41: 204, 42: 205 };
    GB.attackSkillId = function() {
        let result = 1;
        if (this.isActor() && this.isArmy() && CLASS_SKILL_ID[this._classId]) result = CLASS_SKILL_ID[this._classId];
        const weapons = this.tbsWeapons();
        if (weapons == null) return result;
        for (const wep of weapons) {
            if (!wep) continue;
            const id = table('WEAPON_ATTACK_SKILL_ID')[wep.id];
            if (id != null) { result = id; break; }
        }
        return result;
    };
    GB.tbsWeapons = function() { return []; };
    // Experience the battle gives (actors only; armies none).
    GB.tbsCalculateExp = function() { return 0; };
    // The preview the status window and the AI read: [hit %, damage, variance, added states, removed states, mp?, critical %].
    GB.tbsMakeDmgPreviewData = function(user, item) {
        let value;
        if (U.toMp(item)) {
            value = 0;
        } else {
            value = U.evalDamage(item, user, this);
            const sign = value < 0 ? -1 : 1;
            if (user.hasSkill(159) && U.isItem(item)) value += idiv(user.mat, 2) * sign;
            if (user.hasSkill(153) && U.isSkill(item) && U.physical(item)) value += idiv(user.tilesMoved, 2);
        }
        if (!U.recover(item)) value -= this.tbsTerrainDef();
        value += (this.rrItemElementRate(user, item) - 1) * 10;
        if (!U.recover(item)) value = Math.max(value, 0);
        if (U.physical(item)) value *= this.pdr;
        if (U.magical(item)) value *= this.mdr;
        if (U.recover(item)) value *= this.rec;
        if (user.isArmy()) value *= user.level;
        if (this.rrApplyDirectionOk(item) && !U.recover(item)) value = this.tbsApplyDirection(value, user);
        let hit = Math.trunc(this.rrItemHit(user, item) * 100) - Math.trunc(this.rrItemEva(user, item) * 100);
        const amp = Math.trunc(Math.max(100 * item.damage.variance / 100, 0)) + '%';
        const result = new Game_ActionResult();
        result.clear();
        makeDamageInt(result, this, Math.trunc(value), item);
        if (result.hpDamage >= 0 && this.rrApplyDirectionOk(item)) result.hpDamage = this.tbsApplyDirection(result.hpDamage, user);
        for (const effect of item.effects) {
            if (effect.code === 21 && !this.isStateAffected(effect.dataId)) result.addedStates.push(effect.dataId);
            if (effect.code === 22 && this.isStateAffected(effect.dataId)) result.removedStates.push(effect.dataId);
        }
        const mp = result.mpDamage !== 0;
        const cri = Math.trunc(this.rrItemCri(user, item) * 100);
        return [hit, Math.trunc(value), amp, result.addedStates, result.removedStates, mp, cri];
    };
    const makeDamageInt = (result, battler, value, item) => R.makeDamage(result, battler, value, item);
    GB.rrApplyDirectionOk = function(item) { return U.isSkill(item) ? !GT.skillIgnoreDmgDir(item.id) : true; };
    GB.tbsClearTbsPos = function() {
        this.tbsMoveto(0, 0);
        this.tbsSetDirection(2);
        this.onTurnEnd();
    };
    GB.tbsWanderPosition = function(sx, sy) {
        const dir = [2, 4, 6, 8][rand(4)];
        const x = $gameMap.roundXWithDirection(sx, dir), y = $gameMap.roundYWithDirection(sy, dir);
        if (this.tbsPassable(x, y, 0) && get('ALLOW_AI_WANDER', false) && !this.tbsMovedQ() && this.tbsAllowWander()) return [x, y];
        return [sx, sy];
    };
    GB.tbsAllowWander = function() { return true; };

    //=========================================================================
    // Game_Battler: the game's rules (Ace's item handling, as Pinnacle edited it)
    //=========================================================================
    const BASE_STATES = [57, 62, 86];
    const PROGRESSIVE = { 57: [57, 58, 59, 60, 61], 62: [62, 63, 64, 65, 66], 86: [86, 87, 88, 89, 90] };
    // A progressive state steps up: each held step is removed and the next one up added.
    GB.addState = function(stateId) {
        if (!this.isStateAddable(stateId)) return;
        if (BASE_STATES.includes(stateId)) {
            let step = stateId;
            PROGRESSIVE[stateId].forEach((st, i) => {
                const x = Math.min(i + 1, 4);
                if (this.isStateAffected(st)) step = PROGRESSIVE[stateId][x];
                if (this.isStateAffected(st)) this.removeState(st);
            });
            stateId = step;
        }
        if (!this.isStateAffected(stateId)) this.rrAddNewState(stateId);
        this.resetStateCounts(stateId);
        if (!this._result.addedStates.includes(stateId)) this._result.addedStates.push(stateId);
    };
    GB.rrAddNewState = function(stateId) {
        if (stateId === this.deathStateId()) this.die();
        this._states.push(stateId);
        if (this.restriction() > 0) this.onRestrict();
        this.sortStates();
        this.refresh();
    };
    GB.maximizeStateCounts = function(stateId) {
        this._stateTurns[stateId] = 99;
    };
    GB.isStateAddable = function(stateId) {
        if ([30, 45, 86].includes(stateId)) return true;
        if (stateId !== 1 && this.hasSkill(143)) return false;
        return this.isAlive() && !!$dataStates[stateId] && !this.isStateResist(stateId) &&
            !this._result.removedStates.includes(stateId) && !this.isStateRestrict(stateId);
    };
    // Removing K.O. does not revive.
    GB.removeState = function(stateId) {
        if (this.isStateAffected(stateId)) {
            this.eraseState(stateId);
            this.refresh();
            if (!this._result.removedStates.includes(stateId)) this._result.removedStates.push(stateId);
        }
    };
    const _die = Game_BattlerBase.prototype.die;
    GB.die = function() {
        _die.call(this);
        if (this.isActor() && $gameTemp.pathfinderLocations) $gameTemp.pathfinderLocations.splice(this._actorId, 1);
    };
    const ACTOR_DEATH_CE = { 2: 52, 3: 53, 4: 54, 5: 55, 6: 56, 11: 57, 8: 58, 12: 59, 13: 60, 7: 61, 9: 63, 15: 64, 16: 65 };
    const ENEMY_DEATH_CE = { 19: 62 };
    GB.rrCallDeathCommonEvent = function() {
        const id = this.isActor() ? ACTOR_DEATH_CE[this._actorId] : ENEMY_DEATH_CE[this._enemyId];
        if (id) $gameTemp.reserveCommonEvent(id);
    };
    // Buffs are points: a buff adds the user's MAT/4 (at least 1), up to the parameter's own size (a debuff
    // half of it); the active unit gets one more. Only in the grid battle; structures (skill 143) take none.
    GB.addBuff = function(paramId, turns, magnitude = 1) {
        if (this.hasSkill(143) || !this.isAlive() || !inTbs()) return;
        if (!this.isMaxBuffAffected(paramId)) this._buffs[paramId] += magnitude;
        this._buffs[paramId] = Math.trunc(Math.min(this._buffs[paramId], this.buffMax(paramId)));
        if (this === scene().activeBattler()) this._buffs[paramId] += 1;
        if (this._buffs[paramId] < 0) this.eraseBuff(paramId);
        this.overwriteBuffTurns(paramId, turns);
        if (!this._result.addedBuffs.includes(paramId)) this._result.addedBuffs.push(paramId);
        this.refresh();
    };
    GB.addDebuff = function(paramId, turns, magnitude = 1) {
        if (this.hasSkill(143) || !this.isAlive() || !inTbs()) return;
        if (!this.isMaxDebuffAffected(paramId)) this._buffs[paramId] -= magnitude;
        this._buffs[paramId] = Math.trunc(Math.max(this._buffs[paramId], -idiv(this.buffMax(paramId), 2)));
        if (this === scene().activeBattler()) this._buffs[paramId] -= 1;
        if (this._buffs[paramId] > 0) this.eraseBuff(paramId);
        this.overwriteBuffTurns(paramId, turns);
        if (!this._result.addedDebuffs.includes(paramId)) this._result.addedDebuffs.push(paramId);
        this.refresh();
    };
    GB.removeBuff = function(paramId) {
        if (!this.isAlive() || this._buffs[paramId] === 0) return;
        this.eraseBuff(paramId);
        this._buffTurns[paramId] = 0;
        if (!this._result.removedBuffs.includes(paramId)) this._result.removedBuffs.push(paramId);
        this.refresh();
    };
    GB.overwriteBuffTurns = function(paramId, turns) { if ((this._buffTurns[paramId] || 0) < turns) this._buffTurns[paramId] = turns; };
    // Buff points fade by one at each turn end (debuffs by two with skill 290).
    GB.updateBuffTurns = function() {
        for (let i = 0; i < this._buffs.length; i++) {
            let buff = this._buffs[i];
            if (buff < 0) buff += 1;
            if (buff > 0) buff -= 1;
            if (buff < 0 && this.isActor() && this.hasSkill(290)) buff += 1;
            this._buffs[i] = buff;
        }
        this.refresh();
    };
    GB.removeBuffsAuto = function() {
        for (let i = 0; i < this._buffs.length; i++) {
            if (this._buffs[i] === 0 || (this._buffTurns[i] || 0) > 0) continue;
            this.removeBuff(i);
        }
    };
    GB.removeStatesAuto = function(timing) {
        const oldStates = this._states.slice();
        for (const state of this.states()) {
            if (this._stateTurns[state.id] === 0 && state.autoRemovalTiming === timing) this.removeState(state.id);
        }
        // VE Damage Popup: states wearing off show.
        this._damaged = this._damaged || ($gameParty.inBattle() && oldStates.join() !== this._states.join());
        this._noDmg = this._result.hpDamage === 0 || this._result.rrMpDrain === 0;
    };
    GB.removeStatesByDamage = function() {
        for (const state of this.states()) if (state.removeByDamage && rand(100) < state.chanceByDamage) this.removeState(state.id);
    };
    GB.rrItemElementRate = function(user, item) {
        let result;
        if (item.damage.elementId < 0) {
            const els = user.attackElements();
            result = els.length === 0 ? 1.0 : this.rrElementsMaxRate(els);
        } else {
            result = this.elementRate(item.damage.elementId);
        }
        // VE Damage Popup: the weakness/resistance the hit shows.
        if (result > 1.0) this._result.resist = 'weakness';
        if (result < 1.0 && result > 0.0) this._result.resist = 'resist';
        if (result === 0.0) this._result.resist = 'imune';
        if (result < 0.0) this._result.resist = 'absorb';
        return result;
    };
    // The game's elements_max_rate deletes neutral elements while it iterates (Ruby skips the one after each delete).
    GB.rrElementsMaxRate = function(elements) {
        const els = elements.slice();
        for (let i = 0; i < els.length; i++) {
            if (els.length > 1 && this.elementRate(els[i]) === 1.0) els.splice(i, 1);
        }
        return Math.max(0.0, ...els.map(e => this.elementRate(e)));
    };
    GB.rrMakeDamageValue = function(user, item) {
        let value = U.evalDamage(item, user, this);
        if (user.hasSkill(159) && U.isItem(item)) { const sign = value < 0 ? -1 : 1; value += idiv(user.mat, 2) * sign; }
        if (user.hasSkill(153) && U.isSkill(item) && U.physical(item)) value += idiv(user.tilesMoved, 2);
        value += (this.rrItemElementRate(user, item) - 1) * 10;
        if (U.physical(item)) value *= this.pdr;
        if (U.magical(item)) value *= this.mdr;
        if (U.recover(item)) value *= this.rec;
        if (user.isArmy()) {
            if (!U.recover(item)) value -= this.tbsTerrainDef() * user.level;
        } else {
            if (!U.recover(item)) value -= this.tbsTerrainDef();
            if (value < 1 && !U.recover(item) && U.toHp(item)) value = 1;
        }
        if (this._result.critical) value *= 3;
        if (user.isArmy()) value *= user.level;
        R.makeDamage(this._result, this, Math.trunc(value), item);
        // GTBS: the hit's direction.
        if (this._result.hpDamage > 0 && this.rrApplyDirectionOk(item)) this._result.hpDamage = this.tbsApplyDirection(this._result.hpDamage, user);
    };
    // Army units lose a level for each HP-worth of damage past their HP; healing gives levels back.
    GB.rrExecuteDamage = function(user) {
        $gameVariables.setValue(1001, 0);
        $gameVariables.setValue(1002, 0);
        if (this._result.hpDamage > 0) this.rrOnDamage(this._result.hpDamage);
        if (this.isArmy()) {
            let dmg = this._result.hpDamage;
            if (dmg >= (this.level - 1) * this.mhp + this.hp) {
                $gameVariables.setValue(1001, this.level);
                this.addState(this.deathStateId());
                dmg = 0;
            } else {
                if (dmg > 0) {
                    while (dmg >= this.hp && !this.isDead()) {
                        $gameVariables.setValue(1001, $gameVariables.value(1001) + 1);
                        this.levelDown();
                        this.setHp(this.mhp);
                        dmg -= this.mhp;
                        dmg = Math.max(0, dmg);
                    }
                } else if (dmg < 0) {
                    const missing = this.mhp - this.hp;
                    while (dmg < -missing && this.level < this.lastLevel) {
                        $gameVariables.setValue(1002, $gameVariables.value(1002) + 1);
                        this.levelUp();
                        dmg += this.mhp;
                        dmg = Math.min(0, dmg);
                    }
                }
                this.setHp(this.hp - dmg);
            }
        } else {
            if (this.hasSkill(154) && !this.isStateAffected(85) && this.hp <= this._result.hpDamage) {
                this.setHp(1);
                this.addState(84);
                this.addState(85);
                this.animationId = 87;
            } else {
                this.setHp(this.hp - this._result.hpDamage);
                if (this._result.hpDamage > 0 && this.hasSkill(157)) this.addBuff(2, 1);
            }
            this.setMp(this.mp - this._result.mpDamage);
            user.setHp(user.hp + this._result.rrHpDrain);
            user.setMp(user.mp + this._result.rrMpDrain);
        }
        // VE Damage Popup: drains show on the user.
        if (this._result.rrHpDrain !== 0 || this._result.rrMpDrain !== 0) {
            user._damaged = true;
            user._result.hpDamage = -this._result.rrHpDrain;
            user._result.mpDamage = -this._result.rrMpDrain;
        }
        // GTBS: what follows a hit (secret hunt, capture/charm/invite, ally kills).
        if (user.currentAction()) this.tbsExecutePostDmgEvents(user);
    };
    GB.rrOnDamage = function(value) {
        this.removeStatesByDamage();
        this.setTp(this.tp + 50 * (value / this.mhp) * this.tcr);
        this.tbsReduceAt();
    };
    GB.tbsExecutePostDmgEvents = function(user) {
        const a = user.currentAction();
        if (a && !a.tbsItemQ() && !a.tbsGuardQ() && inTbs() && a.item()) {
            this.tbsSecretHuntResults(user, a.item());
            this.tbsCaptureResults(user, a.item());
        }
        const varId = get('Increment_Variable_Friendly_Kill', 0);
        if (inTbs() && varId > 0 && this.isDead() && user.tbsFriends().includes(this)) $gameVariables.setValue(varId, $gameVariables.value(varId) + 1);
    };
    GB.tbsSecretHuntResults = function(user, skill) {
        if (!(this.isDead() && this._result.hpDamage > 0 && user.isActor() && this.isEnemy() && GT.skillHasSecretHunt(skill.id))) return;
        const items = GT.secretHuntResult(this._enemyId);
        const perc = rand(100);
        for (let i = -(items.length - 1); i <= 0; i++) {
            const item = items[(i + items.length) % items.length];
            if (!item || !item.length || !(perc < item[2])) continue;
            const obj = [$dataItems, $dataWeapons, $dataArmors][item[0]][item[1]];
            if (!obj) continue;
            $gameParty.gainItem(obj, 1);
            $gameMessage.add(TextManager.obtainItem.format(obj.name));
            break;
        }
    };
    GB.tbsCaptureResults = function(user, skill) {
        if (this.isDead() || this._result.missed || this._result.evaded) return;
        if (GT.skillHasCapture(skill.id)) {
            this.tbsSetTeam(user.tbsTeam());
            this.hide();
            scene().disposeCharacter(this);
            scene().playMapAnimation(this.x, this.y, 3, get('CAPTURE_ANIMATION', 0));
        } else if (GT.skillHasCharm(skill.id)) {
            if (user.tbsTeam() === (this._tbsTempTeam != null ? this._tbsTempTeam : this.tbsTeam())) {
                this.removeState(get('CHARM_ID', 0));
            } else {
                this.addState(get('CHARM_ID', 0));
                this._tbsTempTeam = user.tbsTeam();
                this._stateTurns[get('CHARM_ID', 0)] = GT.charmTurns(skill.id);
            }
        } else if (GT.skillHasInvite(skill.id)) {
            if (GT.preventInvite(this, this.isEnemy())) { scene().playMapAnimation(this.x, this.y, 0); return; }
            scene().playMapAnimation(this.x, this.y, 3, get('CAPTURE_ANIMATION', 0));
            this.tbsSetTeam(user.tbsTeam());
        }
    };
    // Use: pay the cost or the item, and the rapid skills (120, 127) let the unit act once more.
    GB.rrAceUseItem = function(item) {
        if (U.isSkill(item)) this.paySkillCost(item);
        if (U.isItem(item)) this.consumeItem(item);
        for (const effect of item.effects) if (effect.code === 44) $gameTemp.reserveCommonEvent(effect.dataId);
        if (list('Reset_Action_Flag_Skills').includes(item.id)) {
            if (this._tbsUsedRapid) this.tbsSetPerfAction(true);
            else {
                this.tbsSetPerfAction(false);
                const acted = $gameSystem.tbsActed();
                const i = acted.indexOf(this);
                if (i >= 0) acted.splice(i, 1);
            }
            this._tbsUsedRapid = true;
            this.tbsOnReact();
        }
    };
    GB.rrItemTest = function(user, item) {
        if (U.forDeadFriend(item) !== this.isDead()) return false;
        if ($gameParty.inBattle()) return true;
        if (U.forOpponent(item)) return true;
        if (U.recover(item) && U.toHp(item) && this.hp < this.mhp) return true;
        if (U.recover(item) && U.toMp(item) && this.mp < this.mmp) return true;
        return item.effects.some(e => this.rrItemEffectTest(user, item, e));
    };
    // Hit: success rate plus the user's HIT (status skills: plus MAT), +20% from behind, +10% from the side;
    // the command skills (167–170) hit by affection.
    GB.rrItemHit = function(user, item) {
        let rate;
        if ([167, 168, 169, 170].includes(item.id)) {
            rate = (this.affection * 2 + item.successRate) * 0.01;
        } else {
            if (U.forOpponent(item) && U.none(item)) rate = item.successRate * 0.01 + user.mat * 0.01;
            else if (U.forFriend(item)) rate = 1;
            else rate = user.hit + item.successRate * 0.01 + (this.rrItemElementRate(user, item) - 1);
            if (this.tbsFromBack(user)) rate += 0.2;
            if (this.tbsFromSide(user)) rate += 0.1;
            if (U.physical(item) && this.hasSkill(296)) rate -= 0.1;
            if (U.magical(item) && this.hasSkill(285)) rate -= 0.1;
        }
        return rate;
    };
    GB.rrItemEva = function(user, item) {
        if (U.forOpponent(item) && U.none(item)) return this.tbsTerrainEva() + this.mdf * 0.01 + (this.luk - user.luk) * 0.01;
        if (U.physical(item)) return this.tbsTerrainEva() + this.eva + (this.agi - user.agi) * 0.02 + (this.luk - user.luk) * 0.01;
        if (U.magical(item)) return this.tbsTerrainEva() + this.mev + (this.agi - user.agi) * 0.02 + (this.luk - user.luk) * 0.01;
        return 0;
    };
    GB.rrItemCri = function(user, item) {
        let cri = item.damage.critical ? user.cri + (user.luk - this.luk) * 0.01 + (user.agi - this.agi) * 0.0025 : 0;
        if (distance(this, user) === 1 && user.hasSkill(158) && item.damage.critical) cri += 0.1;
        return cri;
    };
    GB.tbsTerrainEva = function() {
        if (this.tbsFlyingUnit()) return 0;
        const mult = this.hasSkill(295) ? 2 : 1;
        return R.terrainValue('eva', $gameMap.regionId(this.x, this.y)) * mult;
    };
    GB.tbsTerrainDef = function() {
        if (this.tbsFlyingUnit()) return 0;
        const mult = this.hasSkill(295) ? 2 : 1;
        return R.terrainValue('def', $gameMap.regionId(this.x, this.y)) * mult;
    };
    /**
     * Game_Battler#item_apply as the game had it: hit and evasion in one roll, no variance, no guard
     * halving; a predicted result (the attack's "predict" step) keeps its roll.
     */
    GB.rrAceItemApply = function(user, item, options = {}) {
        if (!this._result.predetermined) this._result.clear();
        this._result.used = this.rrItemTest(user, item);
        if (!this._result.predetermined) this._result.missed = Math.random() >= (this.rrItemHit(user, item) - this.rrItemEva(user, item));
        if (this._result.isHit()) {
            if (!U.none(item)) {
                if (!this._result.predetermined) this._result.critical = Math.random() < this.rrItemCri(user, item);
                this.rrMakeDamageValue(user, item);
                this.rrExecuteDamage(user);
            }
            for (const effect of item.effects) this.rrItemEffectApply(user, item, effect, options);
            this.rrItemUserEffect(user, item);
        }
        if (this.hp === 0) this.rrCallDeathCommonEvent();
        this._result.predetermined = false;
        // VE Damage Popup
        this._damaged = $gameParty.inBattle() && this._result.isHit();
        this._missed = $gameParty.inBattle() && this.isAlive() && !this._result.isHit();
        this._noDmg = U.none(item);
    };
    // The attack's "predict" step rolls the hit and the critical before the animation; a critical by an
    // actor slides in their portrait.
    GB.rrItemPredictResult = function(user, item) {
        this._result.clear();
        this._result.predetermined = true;
        this._result.missed = Math.random() >= (this.rrItemHit(user, item) - this.rrItemEva(user, item));
        if (!this._result.missed && !U.none(item)) this._result.critical = Math.random() < this.rrItemCri(user, item);
        if (this._result.critical) this.rrDisplayCriticalEffect(scene() ? scene().activeBattler() : user);
    };
    GB.rrDisplayCriticalEffect = function(actor) {
        if (!actor) return;
        if (rand(2) === 0) actor.affection += 1;
        const faceName = actor.faceName ? actor.faceName() : '';
        const filename = '§' + faceName + 'CritPortrait';
        if (!R.pictureExists(filename)) return;
        AudioManager.playSe({ name: 'Wind11', volume: 70, pitch: 100, pan: 0 });
        $gameScreen.showPicture(1, filename, 0, -100, 80, 100, 100, 255, 0);
        $gameScreen.picture(1).rrMoveWithAccel?.(0, Graphics.width, 100, 80, 100, 255, 0, 40) ??
            $gameScreen.movePicture(1, 0, Graphics.width, 100, 80, 100, 255, 0, 40, 1);
    };
    GB.rrItemEffectTest = function(user, item, effect) {
        switch (effect.code) {
            case 11: return this.hp < this.mhp || effect.value1 < 0 || effect.value2 < 0;
            case 12: return this.mp < this.mmp || effect.value1 < 0 || effect.value2 < 0;
            case 21: return !this.isStateAffected(effect.dataId);
            case 22: return this.isStateAffected(effect.dataId);
            case 31: return !this.isMaxBuffAffected(effect.dataId);
            case 32: return !this.isMaxDebuffAffected(effect.dataId);
            case 33: return this._buffs[effect.dataId] > 0;
            case 34: return this._buffs[effect.dataId] < 0;
            case 43: return this.isActor() && !this.hasSkill(effect.dataId);
            case 42: return this.isActor() && this._paramPlus[effect.dataId] < this.paramCap(effect.dataId);
            default: return true;
        }
    };
    GB.rrItemEffectApply = function(user, item, effect, options = {}) {
        const r = this._result;
        switch (effect.code) {
            case 11: {
                let value = (this.mhp * effect.value1 + effect.value2) * this.rec;
                if (U.isItem(item)) value *= user.pha;
                value = Math.trunc(value);
                r.hpDamage -= value; r.success = true;
                this.setHp(this.hp + value);
                break;
            }
            case 12: {
                let value = (this.mmp * effect.value1 + effect.value2) * this.rec;
                if (U.isItem(item)) value *= user.pha;
                value = Math.trunc(value);
                r.mpDamage -= value; if (value !== 0) r.success = true;
                this.setMp(this.mp + value);
                break;
            }
            case 13: {
                const value = Math.trunc(effect.value1);
                r.tpDamage -= value; if (value !== 0) r.success = true;
                this.setTp(this.tp + value);
                break;
            }
            case 21:
                if (effect.dataId === 0) {
                    for (const stateId of user.attackStates()) {
                        let chance = effect.value1 * this.stateRate(stateId) * user.attackStatesRate(stateId) * this.rrLukEffectRate(user);
                        if (Math.random() < chance) { this.addState(stateId); r.success = true; }
                    }
                } else {
                    let chance = effect.value1;
                    if (this.rrOpposite(user)) chance *= this.stateRate(effect.dataId) * this.rrLukEffectRate(user);
                    if (Math.random() < chance) { this.addState(effect.dataId); r.success = true; }
                }
                break;
            case 22:
                if (Math.random() < effect.value1) { this.removeState(effect.dataId); r.success = true; }
                break;
            case 31:
                this.addBuff(effect.dataId, effect.value1, Math.max(1, user.mat * 0.25));
                r.success = true;
                break;
            case 32:
                if (Math.random() < this.debuffRate(effect.dataId) * this.rrLukEffectRate(user)) {
                    this.addDebuff(effect.dataId, effect.value1, Math.max(1, user.mat * 0.25));
                    r.success = true;
                }
                break;
            case 33: if (this._buffs[effect.dataId] > 0) this.removeBuff(effect.dataId); r.success = true; break;
            case 34: if (this._buffs[effect.dataId] < 0) this.removeBuff(effect.dataId); r.success = true; break;
            case 41: if (effect.dataId === 0) this.escape(); r.success = true; break;
            case 42:
                if (this._paramPlus[effect.dataId] < this.paramCap(effect.dataId)) { this.addParam(effect.dataId, Math.trunc(effect.value1)); r.success = true; }
                break;
            case 43: if (this.isActor()) this.learnSkill(effect.dataId); r.success = true; break;
            default: break;
        }
    };
    // GTBS: the reset_move skills let the unit move again; the user gains the skill's TP.
    GB.rrItemUserEffect = function(user, item) {
        if ($gameSystem.tbsTeamMode() && U.isSkill(item) && list('Reset_Move_Flag_Skills').includes(item.id)) {
            user._tbsMoved = false;
            const acted = $gameSystem.tbsActed(); const i = acted.indexOf(user); if (i >= 0) acted.splice(i, 1);
            user.tbsOnReact();
        }
        user.setTp(user.tp + item.tpGain * user.tcr);
    };
    GB.rrLukEffectRate = function(user) { return Math.max(1.0 + (user.luk - this.luk) * 0.001, 0.0); };
    GB.rrOpposite = function(battler) { return this.isActor() !== battler.isActor() || !!battler._magicReflection; };
    // Regeneration: HRG is a flat 100×rate (armies ×level/2), +4 in bushes (region 5) with skill 148.
    GB.regenerateHp = function() {
        let damage = this.isArmy() ? -Math.trunc(this.hrg * 100 * this.level / 2) : -Math.trunc(this.hrg * 100);
        if ($gameMap.regionId(this.x, this.y) === 5 && this.hasSkill(148)) damage -= 4;
        this._result.hpDamage = Math.min(damage, this.maxSlipDamage());
        this.rrExecuteDamage(this);
        this._damaged = this._damaged || ($gameParty.inBattle() && this.rrDamagedQ());
    };
    GB.regenerateMp = function() {
        this._result.mpDamage = -Math.trunc(this.mmp * this.mrg);
        this.setMp(this.mp - this._result.mpDamage);
        this._damaged = this._damaged || ($gameParty.inBattle() && this.rrDamagedQ());
    };
    GB.regenerateTp = function() {
        this.setTp(this.tp + 100 * this.trg);
        this._result.tpDamage = -100 * this.trg;
        this._damaged = this._damaged || ($gameParty.inBattle() && this.rrDamagedQ());
    };
    GB.rrDamagedQ = function() { return this._result.hpDamage !== 0 || this._result.mpDamage !== 0 || this._result.tpDamage !== 0; };
    GB.clearDamageFlags = function() {
        this._damaged = false; this._counter = false; this._reflect = false; this._covered = false; this._missed = false; this._noDmg = false;
    };
    GB.onBattleStart = function() {
        this.lastLevel = this.level;
        if (!this.isPreserveTp()) this.setTp(Math.random() * 25);
    };
    // End of a unit's turn (Ace's on_turn_end with the game's and GTBS's additions).
    GB.onTurnEnd = function() {
        this._result.clear();
        this.regenerateAll();
        this.updateStateTurns();
        this.updateBuffTurns();
        this.removeStatesAuto(2);
        $gameVariables.setValue(21, 4);
        $gameVariables.setValue(22, 0);
        if (this.isActor() && this.hasSkill(297)) $gameTemp.pathfinderLocations[this._actorId] = [this.x, this.y];
        this._spriteEffectType = null;
        this._tbsMoved = false;
        this._tbsTilesMoved = 0;
        this._tbsPerfAction = false;
        this._tbsUsedRapid = false;
        this._tbsExtraMove = false;
    };
    GB.tbsOnActionEnd = function() {
        this._result.clear();
        this.removeStatesAuto(1);
        this.removeBuffsAuto();
    };
    GB.onBattleEnd = function() {
        this._result.clear();
        for (const state of this.states()) if (state.removeAtBattleEnd) this.removeState(state.id);
        for (let i = 0; i < this._buffs.length; i++) this.removeBuff(i);
        this.clearActions();
        if (!this.isPreserveTp()) this.setTp(0);
        this.appear();
    };
    GB.onDamage = function(value) { this.rrOnDamage(value); };

    //=========================================================================
    // Game_Actor
    //=========================================================================
    const GA = Game_Actor.prototype;
    const _actorSetup = GA.setup;
    GA.setup = function(actorId) {
        _actorSetup.call(this, actorId);
        this._gender = this.rrDefaultGender(actorId);
        this._flags = [];
    };
    // The note's first line says male (1) or female (2); anything else is 3.
    GA.rrDefaultGender = function(id) {
        const note = ($dataActors[id] && $dataActors[id].note) || '';
        const line = note.split('\n')[0];
        if (line === 'male') return 1;
        if (line === 'female') return 2;
        return 3;
    };
    Object.defineProperty(GA, 'gender', { get() { return this._gender ?? this.rrDefaultGender(this._actorId); }, set(v) { this._gender = v; }, configurable: true });
    GA.setGender = function(g) { this._gender = g; };
    GA.tbsSkills = function() { return this.skills(); };
    GA.tbsWeapons = function() { return this.weapons(); };
    GA.tbsNotes = function() {
        let notes = this.actor().note || '';
        notes += this.currentClass().note || '';
        for (const e of this.equips()) if (e) notes += e.note || '';
        for (const s of this.states()) notes += s.note || '';
        for (const s of this.skills()) notes += s.note || '';
        return (this.actor().note || '') + notes;
    };
    GA.tbsCharacterName = function() {
        if (this.isDeathStateAffected() && $gameSystem.tbsActorsBodies() && !this.tbsAnimated()) return this._characterName + '_down';
        return this._characterName;
    };
    GA.tbsCharacterIndex = function() { return this._characterIndex; };
    GA.tbsUnitSize = function() { return table('Act_large_units')[this._actorId] || 1; };
    GA.tbsConfused = function() { return this.isStateAffected(get('CONFUSE_ID', 5)); };
    GA.tbsAiControlled = function() {
        return !!(this._tbsNeutral || this.tbsConfused() || (this.tbsTeam() !== 'actor' && !get('Allow_User_Control_For_All_Teams', false)));
    };
    GA.tbsIsSummoned = function() { return list('ACTOR_SUMMONS').includes(this._actorId); };
    GA.tbsHideInfo = function() { return false; };
    GA.tbsSetPerfAction = function(bool) {
        if (bool === false) this._tbsSkillUsageTurn = 0;
        GB.tbsSetPerfAction.call(this, bool);
    };
    GA.tbsSkillTurnUsage = function() { return this._tbsSkillUsageTurn || 0; };
    GA.tbsSetSkillTurnUsage = function(val) {
        if (val >= get('Max_Turn_Skill_Usage', 2)) this.tbsSetPerfAction(true);
        this._tbsSkillUsageTurn = val;
    };
    GA.tbsBaseMoveRange = function() {
        let move = GT.moveRange(this._classId);
        if (move > 3) move += 1;
        if (move > 0) move += 1;
        for (const arm of this.armors()) move += GT.equipMoveInfo(arm.id);
        for (const wep of this.weapons()) move += GT.weaponMoveInfo(wep.id);
        for (const id of this._states) move += GT.stateMoveInfo(id);
        move = Math.max(0, move);
        const tpMove = get('REQUIRED_TP_FOR_MOVE', 0);
        if (tpMove > 0) { const can = idiv(this.tp, tpMove); if (move > can) return can; }
        return move;
    };
    // Weapon range: the attack skill's range when the weapon names one; skill 158 lifts the minimum.
    GA.tbsWeaponRange = function() {
        const atk = this.attackSkillId();
        if (![1, 3, 4, 5, 6].includes(atk)) return GT.skillRange(atk);
        const weapon = this.weapons()[0];
        const range = GT.weaponRange(weapon ? weapon.id : 0);
        if (weapon && this.hasSkill(158)) range[1] = 0;
        if (!get('BOW_LSHAPE', true)) range[2] = false;
        return range;
    };
    GA.tbsAttackSkillRange = function() {
        const max = [], min = [];
        for (const id of this._skills) {
            const skill = $dataSkills[id];
            if (skill && U.forOpponent(skill)) { const rng = GT.skillRange(id); max.push(rng[0] + rng[1]); min.push(Math.max(rng[4] - rng[1], 0)); }
        }
        return [max.length ? Math.max(...max) : null, min.length ? Math.min(...min) : null];
    };
    GA.tbsHelpSkillRange = function() {
        const out = [];
        for (const id of this._skills) {
            const skill = $dataSkills[id];
            if (skill && !U.forOpponent(skill)) { const rng = GT.skillRange(id); out.push(rng[0] + rng[1]); }
        }
        return out.length ? Math.max(...out) : null;
    };
    GA.tbsItemRange = function(itemId) {
        const range = GT.itemRange(itemId);
        const chem = table('CHEMIST_CLASS_ITEM_ACTOR')[this._classId];
        if (chem && chem[itemId]) range[0] += chem[itemId];
        return range;
    };
    GA.tbsWillCollapse = function() {
        if (this._tbsNeutral) { if (!$gameSystem.tbsNeutralsBodies()) return true; }
        else if (!$gameSystem.tbsActorsBodies()) return true;
        return this.tbsIsSummoned();
    };
    GA.tbsGtbsEntrance = function(x, y, neutral = false) {
        GB.tbsGtbsEntrance.call(this, x, y);
        if (neutral) {
            this._tbsNeutral = neutral;
            $gameParty.tbsAddNeutral(this._actorId);
            this._tbsOriginallyNeutral = neutral;
        }
        this._hidden = false;
    };
    GA.tbsRecoverAfterBattle = function() {
        const mode = get('Recover_HPMP_After_Battle', 2);
        if (mode === 2 || (mode === 1 && this._tbsNeutral)) {
            if ($gameSwitches.value(105)) return;
            this._hp = this.mhp;
            this._mp = this.mmp;
        }
    };
    GA.tbsAtkAnimationId1 = function() { return this.attackAnimationId1(); };
    GA.tbsAtkAnimationId2 = function() { return this.attackAnimationId2(); };
    // Experience: per target (once each), 10 + twice the level difference (at least 1) shared among the
    // targets, plus ten times the difference (at least 1) for a kill; 100 at most. Armies gain none.
    GA.tbsCalculateExp = function(targets) {
        if (this.isArmy()) return 0;
        let exp = 0;
        if (get('EXP_PER_HIT', false)) {
            for (const t of targets) {
                let pre = 0;
                const amount = t.level - this.level;
                if (amount <= -10) pre += 1; else pre += 10 + amount;
                if (t.isDeathStateAffected()) pre *= 2;
                exp += pre;
            }
        } else {
            const uniq = uniqObjects(targets);
            for (const t of uniq) {
                exp += idiv(Math.max(1, 10 + (t.level - this.level) * 2), targets.length);
                if (t.isDeathStateAffected()) exp += Math.max(1, (t.level - this.level) * 10);
                exp = Math.min(100, exp);
            }
        }
        return exp;
    };
    GA.tbsStartTurn = function() { GB.tbsStartTurn.call(this); };
    GA.tbsAiTactic = function() { return this._tbsTempTactic || table('Actor_AI')[this._actorId]; };
    GA.tbsConditionsMet = function() { return true; };
    GA.tbsAllowWander = function() { return !list('PREVENT_ACT_WANDER').includes(this._actorId); };
    GA.index = function() { return $gameParty.allMembers().indexOf(this); };
    GA.tbsPossibleActions = function() {
        const out = [];
        for (const skill of this.usableSkills()) out.push({ skillId: skill.id, rating: 5 });
        out.push({ skillId: this.attackSkillId(), rating: 5 });
        return out;
    };
    // The game's actor: equipment slots, parameters, levels every 100 experience.
    GA.equipSlots = function() { return this.isDualWield() ? [2, 5, 5] : [1, 2, 4, 5, 5]; };
    // Ace put the database's starting equipment by type (each into the first free slot of its type), which
    // matters now the slots are not one of each type.
    GA.initEquips = function(equips) {
        const slots = this.equipSlots();
        this._equips = slots.map(() => new Game_Item());
        equips.forEach((itemId, i) => {
            const etypeId = this.isDualWield() && i === 1 ? 1 : i + 1;
            const list = slots.map((e, j) => (e === etypeId ? j : -1)).filter(j => j >= 0);
            const slotId = list.find(j => this._equips[j].isNull()) ?? list[0];
            if (slotId != null) this._equips[slotId].setEquip(etypeId === 1, itemId);
        });
        this.releaseUnequippableItems(true);
        this.refresh();
    };
    GA.paramMax = function(paramId) { return paramId === 0 ? 9999 : Game_BattlerBase.prototype.paramMax.call(this, paramId); };
    GA.paramBase = function(paramId) {
        const base = this.currentClass().params[paramId][1];
        if (this.isArmy()) return base;
        let bonus = 0;
        if (this.hasSkill(paramId + 51)) bonus += 3;
        if (this.hasSkill(paramId + 59)) bonus -= 3;
        return 5 + Math.trunc(base * 0.1) + bonus;
    };
    GA.paramPlus = function(paramId) { return this._paramPlus[paramId]; };
    GA.paramEquips = function(paramId) {
        let value = 0;
        for (const item of this.equips()) if (item) value += item.params[paramId];
        return value;
    };
    const CLASS_ANIM_ID = { 30: 9, 31: 9, 32: 9 };
    GA.attackAnimationId1 = function() {
        if (this.isArmy() && CLASS_ANIM_ID[this._classId]) return CLASS_ANIM_ID[this._classId];
        const weapons = this.weapons();
        if (this.isDualWield()) return weapons[0] ? weapons[0].animationId : (weapons[1] ? 0 : 1);
        return weapons[0] ? weapons[0].animationId : 1;
    };
    GA.attackAnimationId2 = function() {
        const weapons = this.weapons();
        return this.isDualWield() && weapons[1] ? weapons[1].animationId : 0;
    };
    GA.currentLevelExp = function() { return (this._level - 1) * 100; };
    GA.nextLevelExp = function() { return this._level * 100; };
    GA.expForLevel = function(level) { return (level - 1) * 100; };
    GA.maxLevel = function() { return this.isArmy() ? 9999 : Math.max(1, Number(this.actor().maxLevel) || 99); };
    const _actorRefresh = GA.refresh;
    GA.refresh = function() {
        if (this._maxaffection == null) this._maxaffection = 100;
        this._affection = Math.min(this._affection || 0, this._maxaffection);
        _actorRefresh.call(this);
    };
    GA.changeExp = function(exp, show) {
        this._exp[this._classId] = Math.max(exp, 0);
        const lastLevel = this._level;
        const lastSkills = this.skills();
        while (!this.isMaxLevel() && this.currentExp() >= this.nextLevelExp()) this.levelUp();
        while (this.currentExp() < this.currentLevelExp()) this.levelDown();
        if (show && this._level > lastLevel) this.displayLevelUp(this.findNewSkills(lastSkills));
        this.refresh();
    };
    // A level up: +2 affection, the level-up sound and message, and each parameter grows by chance
    // (the class's level-1 value as a percentage, ±15 with the growth skills, +4 with skill 286).
    GA.levelUp = function() {
        this.affection += 2;
        const hide = $gameSwitches.value(104);
        if (!hide && !this.isArmy()) { $gameVariables.setValue(21, 9); $gameVariables.setValue(22, 350); }
        if (this.isArmy()) { this._level++; return; }
        if (!hide) SoundManager.playSystemSound(16);
        this._level++;
        if (!hide) $gameMessage.add(R.sprintf(text('[258'), this._name, this._level));
        for (let paramId = 0; paramId <= 7; paramId++) {
            let chance = this.currentClass().params[paramId][1];
            if (this.hasSkill(paramId + 51)) chance += 15;
            if (this.hasSkill(paramId + 59)) chance -= 15;
            if (this.hasSkill(286)) chance += 4;
            let increment = 0;
            while (chance > 0) {
                if (rand(100) < chance && this._paramPlus[paramId] < this.paramCap(paramId)) increment++;
                chance -= 100;
            }
            this.addParam(paramId, increment);
            if (paramId === 0) this._hp += increment;
            if (paramId === 1) this._mp += increment;
            if (increment > 0 && !hide) $gameMessage.add(R.sprintf(text('[259'), TextManager.param(paramId), increment));
        }
    };
    GA.levelDown = function() { this._level--; };
    GA.displayLevelUp = function(newSkills) {
        for (const skill of newSkills) $gameMessage.add(TextManager.obtainSkill.format(skill.name));
    };
    GA.gainExp = function(exp) {
        this.changeExp(Math.max(this.currentExp() + Math.trunc(exp * this.finalExpRate()), this.currentLevelExp()), true);
    };
    GA.changeLevel = function(level, show) {
        level = Math.max(Math.min(level, this.maxLevel()), 1);
        this.changeExp((level - 1) * 100, show);
    };
    Object.defineProperty(GA, 'exp', { get() { return this.currentExp(); }, configurable: true });

    //=========================================================================
    // Game_Enemy
    //=========================================================================
    const GE = Game_Enemy.prototype;
    const _enemySetup = GE.setup;
    GE.setup = function(enemyId, x, y) {
        _enemySetup.call(this, enemyId, x, y);
        this._team = 'enemy';
        this._level = table('Enemy_Levels')[enemyId] ?? get('DEFAULT_EN_LVL', 1);
    };
    Object.defineProperty(GE, 'level', { get() { return this._level ?? 1; }, set(v) { this._level = v; }, configurable: true });
    GE.levelDown = function() { this._level--; };
    GE.levelUp = function() { this._level++; this.rrAdjustLevel(1); };
    GE.rrAdjustLevel = function(adj) {
        for (let i = 0; i < this._permabuffs.length; i++) {
            const bonus = this.enemy().params[i] * 0.10;
            this._permabuffs[i] += Math.trunc(bonus * adj);
            if (i === 0) this._hp += bonus;
            if (i === 1) this._mp += bonus;
            this._hp = Math.trunc(this._hp);
            this._mp = Math.trunc(this._mp);
        }
    };
    GE.paramBuffRate = function(paramId) { return this._buffs[paramId] + (this._permabuffs ? this._permabuffs[paramId] : 0); };
    GE.paramBase = function(paramId) {
        if (this.isArmy()) return this.enemy().params[paramId];
        return this.enemy().params[paramId] + this._paramPlus[paramId];
    };
    GE.paramPlus = function(paramId) { return this._paramPlus[paramId]; };
    // VE Basic: an enemy's skills are its action list's.
    GE.tbsSkills = function() { return this.enemy().actions.map(a => $dataSkills[a.skillId]); };
    GE.tbsNotes = function() {
        let notes = this.enemy().note || '';
        for (const s of this.states()) notes += s.note || '';
        for (const s of this.tbsSkills()) if (s) notes += s.note || '';
        return (this.enemy().note || '') + notes;
    };
    // GTBS's enemy weapons were never found ("@weapons.delete(nil)" returned nil): no weapons.
    GE.tbsWeapons = function() { return null; };
    GE.tbsCharacterName = function() {
        const name = this.enemy().battlerName;
        if (this.isDeathStateAffected() && $gameSystem.tbsEnemiesBodies() && !this.tbsAnimated()) return '$' + name + '_down';
        return name;
    };
    GE.tbsCharacterIndex = function() { return 0; };
    GE.tbsCharacterHue = function() { return this.enemy().battlerHue || 0; };
    GE.tbsUnitSize = function() { return table('En_large_units')[this._enemyId] || 1; };
    GE.tbsAiControlled = function() { return true; };
    GE.tbsIsSummoned = function() { return list('SUMMON_ENID').includes(this._enemyId); };
    GE.tbsHideInfo = function() { return list('Unknown_HP_MP').includes(this._enemyId); };
    GE.tbsHideMove = function() { return get('HIDE_EN_MOVE', false); };
    GE.tbsWillCollapse = function() { return !$gameSystem.tbsEnemiesBodies() || this.tbsIsSummoned(); };
    GE.tbsWeaponRange = function() {
        const range = GT.monsterRange(this._enemyId);
        if (!get('BOW_LSHAPE', true)) range[2] = false;
        return range;
    };
    GE.tbsBaseMoveRange = function() {
        let move = GT.enemyMove(this._enemyId);
        if (move > 3) move += 1;
        if (move > 0) move += 1;
        move = Math.max(0, move);
        const tpMove = get('REQUIRED_TP_FOR_MOVE', 0);
        if (tpMove > 0) { const can = idiv(this.tp, tpMove); if (move > can) return can; }
        return move;
    };
    GE.tbsActionList = function() {
        const out = [];
        for (const action of this.enemy().actions) {
            if (!this.meetsCondition(action)) continue;
            if (action.skillId && !this.tbsSkillCanUse($dataSkills[action.skillId])) continue;
            out.push(action);
        }
        if (!out.length) out.push({ skillId: 1, rating: 5 });
        return out;
    };
    GE.tbsAttackSkillRange = function() {
        const max = [], min = [];
        for (const act of this.tbsActionList()) {
            const skill = $dataSkills[act.skillId];
            if (skill && U.forOpponent(skill)) { const rng = GT.skillRange(act.skillId); max.push(rng[0] + rng[1]); min.push(Math.max(rng[4] - rng[1], 0)); }
        }
        return [max.length ? Math.max(...max) : null, min.length ? Math.min(...min) : null];
    };
    // Ace's enemy actions had a kind (1 for skills); MZ's are all skills, so none count here, as none did.
    GE.tbsHelpSkillRange = function() { return null; };
    GE.tbsItemRange = function(itemId) {
        const range = GT.itemRange(itemId);
        const info = table('CHEMIST_CLASS_ITEM_ENEMY')[this._enemyId];
        if (info && info[itemId] != null) range[0] = range[0] + info[itemId];
        return range;
    };
    GE.tbsGtbsEntrance = function(x, y) {
        GB.tbsGtbsEntrance.call(this, x, y);
        this._hidden = false;
    };
    GE.tbsAiTactic = function() { return this._tbsTempTactic || table('AI_Tactic')[this._enemyId]; };
    GE.tbsConditionsMet = function(action) { return this.meetsCondition(action); };
    GE.tbsAllowWander = function() { return !list('PREVENT_EN_WANDER').includes(this._enemyId); };
    GE.tbsPossibleActions = function() { return this.enemy().actions; };
    GE.tbsAtkAnimationId1 = function() { return 0; };
    GE.tbsClassName = function() { return table('Enemy_Classes')[this._enemyId] || get('DEFAULT_ENEMY_CLASS', ''); };
    GE.tbsDescription = function() { return table('EN_Descriptions')[this._enemyId] || get('EN_Desc_Default', ''); };
    GE.faceName = function() { return table('Enemy_Face')[this._enemyId] || get('DEFAULT_EN_FACE', ''); };
    GE.faceIndex = function() { return table('Enemy_Face_Index')[this._enemyId] ?? get('DEFAULT_EN_FACE_INDEX', 0); };
    GE.nickname = function() { return ''; };
    // The game's enemies: no equipment.
    GE.paramEquips = function() { return 0; };

    //=========================================================================
    // Game_Action (GTBS)
    //=========================================================================
    const GAc = Game_Action.prototype;
    const _actionClear = GAc.clear;
    GAc.clear = function() {
        this.position = [];
        this.targets = [];
        this.tactic = 0;
        this.movePos = [];
        this.rating = 0;
        this.beforeMove = false;
        this.itemSkill = null;
        _actionClear.call(this);
    };
    const _actionSetItem = GAc.setItem;
    GAc.setItem = function(itemId) {
        const skillId = GT.itemRange(itemId)[2];
        if (skillId > 0) this.itemSkill = $dataSkills[skillId];
        _actionSetItem.call(this, itemId);
    };
    GAc.tbsGuardQ = function() { return this.item() === $dataSkills[this.subject().guardSkillId()]; };
    GAc.tbsAttackQ = function() { return this.item() === $dataSkills[this.subject().attackSkillId()]; };
    GAc.tbsItemQ = function() { return this._item.isItem(); };
    GAc.tbsSkillQ = function() { return !(this.tbsItemQ() || this.tbsAttackQ() || this.tbsGuardQ()); };
    GAc.tbsDetermineTactic = function() {
        if (this.tbsAttackQ()) this.tactic = 1;
        else if (this.tbsSkillQ()) { if (this.item()) this.tactic = 2; }
        else this.tactic = 3;
    };
    GAc.tbsClone = function() {
        const a = Object.create(Game_Action.prototype);
        Object.assign(a, this);
        a._item = new Game_Item(this.item());
        return a;
    };
    GAc.tbsMakeTargets = function() {
        if (this.tbsAttackQ()) return this.tbsMakeAttackTargets();
        if (this.tbsSkillQ()) return this.tbsMakeObjTargets(this.item());
        if (this.tbsItemQ()) return this.tbsMakeObjTargets(this.item());
        return undefined;
    };
    const cursor = () => R.cursor();
    GAc.tbsMakeAttackTargets = function() {
        const subject = this.subject();
        let targets = subject.tbsOpponents().concat(subject.tbsFriends());
        if (!get('ATTACK_ALLIES', false)) targets = andObjects(targets, subject.tbsOpponents());
        targets = andObjects(targets, cursor().targetedBattlers());
        return targets.filter(t => !t.isDead());
    };
    const randomTarget = (possible) => {
        const sum = possible.reduce((r, m) => r + m.tgr, 0);
        let tgrRand = Math.random() * sum;
        for (const m of possible) { tgrRand -= m.tgr; if (tgrRand < 0) return m; }
        return possible[0];
    };
    const closest = (arr) => {
        let best;
        for (const b of arr) if (best === undefined || cursor().distance(b) < cursor().distance(best)) best = b;
        return best;
    };
    GAc.tbsMakeObjTargets = function(obj) {
        const subject = this.subject();
        let targets = [];
        const c = cursor();
        if (U.forAll(obj)) {
            targets = targets.concat(c.targetedBattlers());
        } else if (U.forOpponent(obj)) {
            if (U.forRandom(obj)) {
                for (let n = 0; n < obj.scope - 2; n++) targets.push(randomTarget(c.targetedBattlers()));
            } else if (U.forOne(obj)) {
                let possible = c.targetedBattlers();
                if (!get('ATTACK_ALLIES', false)) possible = andObjects(possible, subject.tbsOpponents());
                targets.push(closest(possible));
            } else {
                targets = targets.concat(c.targetedBattlers());
                if (!get('ATTACK_ALLIES', false)) targets = andObjects(targets, subject.tbsOpponents());
            }
        } else if (U.forUser(obj)) {
            if (P.and(subject.tbsPositions(), c.targetPositions).length) targets.push(subject);
        } else if (U.forDeadFriend(obj)) {
            if (U.forOne(obj)) targets.push(closest(andObjects(subject.tbsDeadFriends(), c.targetedBattlers())));
            else targets = targets.concat(andObjects(subject.tbsDeadFriends(), c.targetedBattlers()));
        } else if (U.forFriend(obj)) {
            if (U.forOne(obj)) {
                let possible = c.targetedBattlers();
                if (!get('ATTACK_ALLIES', false)) possible = andObjects(possible, subject.tbsFriends());
                targets.push(closest(possible));
            } else {
                targets = targets.concat(c.targetedBattlers());
                if (!get('ATTACK_ALLIES', false)) targets = andObjects(targets, subject.tbsFriends());
            }
        }
        if (U.isSkill(obj)) {
            if (U.forOpponent(obj)) targets = andObjects(targets, subject.tbsOpponents());
            if (list('TARGET_FIENDLY_ONLY_SKILLS').includes(obj.id)) targets = andObjects(targets, subject.tbsFriends());
        }
        if (!U.forDeadFriend(obj)) targets = targets.filter(t => t != null && !t.isDead());
        return targets.filter(t => t != null);
    };
    // The action's reach from a tile.
    GAc.tbsRange = function(pos = this.movePos) {
        const b = this.subject();
        if (this.tbsAttackQ()) {
            const [max, min, bow] = b.tbsWeaponRange();
            return bow ? b.tbsCalcPosBow(max, min, [pos]) : b.tbsCalcPosAttack(max, min, [pos]);
        }
        if (this.tbsSkillQ()) {
            const r = b.tbsSkillRange(this.item().id);
            return r[2] ? b.tbsCalcPosAttack(r[0], r[4], [pos]) : b.tbsCalcPosSpell(r[0], r[4], [pos]);
        }
        if (this.tbsItemQ()) {
            const r = b.tbsItemRange(this.item().id);
            return b.tbsCalcPosSpell(r[0], 0, [pos]);
        }
        return [];
    };
    GAc.tbsMovePosEvaluate = function() {
        this._movePosValue = 0;
        const b = this.subject();
        const dist = b.tbsViewRange() + 3;
        for (const bat of b.tbsOpponents().filter(m => distance(m, b) < dist)) {
            if (distance(bat, b) > dist) continue;
            const atk = this.otherBatAttack && this.otherBatAttack.get(bat);
            if (atk && P.and(atk, b.tbsPositions(this.movePos[0], this.movePos[1])).length) this._movePosValue++;
        }
    };
    // Rates every target the action reaches: hit chance, damage relative to what is left, states, counters.
    GAc.tbsEvaluate = function() {
        if (this.tbsItemQ()) { this._effectPreview = new Map(); this.targets = []; }
        else { this._effectPreview = this.tbsEvaluateSkill(); this.targets = [...this._effectPreview.keys()]; }
        if (!this.targets.length) return;
        this.tbsTacticRate();
    };
    GAc.tbsEvaluateSkill = function() {
        const out = new Map();
        const b = this.subject();
        for (const target of this.targets) {
            const [hit, dmg, , hitStates, remStates, mp] = target.tbsMakeDmgPreviewData(b, this.item());
            if (!(hit && hit > 0)) continue;
            const rateStates = this.tbsEvaluateStates(target, hitStates, remStates);
            out.set(target, [hit, this.tbsAdjustDamage(target, dmg, mp), mp, rateStates, this.tbsRateCounter(target)]);
        }
        return out;
    };
    GAc.tbsRateCounter = function(target) {
        let c = target.tbsCounter(this.subject(), this.movePos);
        if (c == null) return 0;
        if (c instanceof Game_Battler) c = 100;
        const pd = target.tbsMakeDmgPreviewData(this.subject(), this.item());
        return c / 100.0 * pd[0] / 100.0 * pd[1] / this.subject().hp;
    };
    GAc.tbsAdjustDamage = function(target, damage, mp) {
        let ref;
        if (mp) { damage = Math.max(Math.min(damage, target.mp), target.mp - target.mmp); ref = damage > 0 ? target.mp : target.mmp; }
        else { damage = Math.max(Math.min(damage, target.hp), target.hp - target.mhp); ref = damage > 0 ? target.hp : target.mhp; }
        return [damage, ref, this.subject().tbsFriends().includes(target)];
    };
    // The removed states use the last added state's id, as the original's loop variable did.
    GAc.tbsEvaluateStates = function(target, hitStates, remStates) {
        let result = 0, stateId;
        for (stateId of hitStates) { if (stateId === 0) continue; result += stateAiEffect(stateId); }
        for (let i = 0; i < remStates.length; i++) { if (stateId == null || stateId === 0) continue; result += stateAiEffect(stateId); }
        return result;
    };
    const stateAiEffect = (id) => table('STATE_RATE_EFFECT')[id] ?? 10;
    GAc.tbsTacticRate = function() {
        const b = this.subject();
        const tactics = R.config.tactics || {};
        const tactic = tactics[b.tbsAiTactic() || 'default'] || tactics.default || {};
        let value = 0;
        if (this._effectPreview.size === 0) { this.rating = value; return; }
        for (const [target, effect] of this._effectPreview) {
            const [hitChance, dmgEval, , rateStates] = effect;
            const [damage, ref, ally] = dmgEval;
            const damageFrac = damage / ref;
            let dmgRate = tactic.hp_damage;
            const targetRate = Math.max(0.01, (b.tbsViewRange() / distance(b, target)) * target.tgr);
            if (ally) {
                const pained = target.hp / target.mhp < 0.80 ? 1.0 + tactic.team_rate : 1.0;
                const deathUnlike = Math.max(damageFrac * (1.0 + tactic.team_rate), 1.0);
                if (damage < 0) dmgRate = tactic.hp_heal;
                value -= (hitChance / 100.0) * damageFrac * dmgRate * deathUnlike * pained;
                value += rateStates * tactic.state * tactic.team_rate * pained;
            } else {
                if (tactic.force_approach) value += 10;
                value += 1.0 * (hitChance / 100.0 * damage / ref * dmgRate) * tactic.death_like * targetRate;
                value += rateStates * tactic.state * targetRate;
            }
            if (this.tbsSkillQ()) value -= b.skillMpCost(this.item());
        }
        if (value > 0) this.rating += Math.trunc(value * (this.tbsSkillQ() ? GT.skillRating(this.item().id) : 1));
        else this.rating = 0;
    };
    GAc.tbsAssignRandomMovementAndTargets = function(movePositions, type) {
        const b = this.subject();
        this.movePos = !b.tbsMovedQ() ? movePositions[rand(movePositions.length)] : b.tbsPos();
        if (type != null) {
            const actRange = this.tbsRange();
            this.position = actRange[rand(actRange.length)];
            cursor().moveto(this.movePos);
            cursor().setTargetPositions(b.tbsTargetZone(this.movePos, this.position, type));
            this.targets = this.tbsMakeTargets();
        } else {
            this.position = b.tbsPos();
            this.targets = [b];
        }
    };

    //=========================================================================
    // The AI: every action from every reachable tile at every tile in reach,
    // rated, then one picked at random weighted by rating among the best.
    // A generator: it lets frames pass while it thinks, as GTBS did.
    //=========================================================================
    GB.tbsMakeTbsAction = function* (movePositions, moveCost, findApproach = false) {
        const sc = scene();
        const [sx, sy] = this.tbsPos();
        this.tbsClearTbsActions();
        this.currentAction().movePos = [sx, sy];
        if (!this.canMove()) return;
        // Every unit in sight: where it can attack from where it stands. "Off the map" wraps to the far
        // corner (moveto takes the position modulo the map), where this unit stands while they are measured.
        this.tbsMoveto(-this.tbsUnitSize(), -this.tbsUnitSize());
        const otherBatAttack = new Map();
        for (const bat of sc.tacticsAlive()) {
            if (distance(this, bat) > this.tbsViewRange()) continue;
            const wr = bat.tbsWeaponRange();
            otherBatAttack.set(bat, bat.tbsCalcPosAttack(wr[0], wr[1]));
        }
        this.tbsMoveto(sx, sy);
        const enAlive = this.tbsOpponents();
        const allyAlive = this.tbsFriends();
        const ce = this.tbsClosestEnemy();
        const closestDist = ce ? distance(ce, this) : 9999;
        if (closestDist > this.tbsViewRange()) {
            this.tbsClearTbsActions();
            this.currentAction().movePos = this.tbsWanderPosition(sx, sy);
            if (!(get('IGNORE_VIEW_OUTNUMBERED', false) && enAlive.length <= allyAlive.length)) return;
        }
        const available = [];
        let ratingMax = 0;
        let debut = performance.now();
        for (const action of this.tbsPossibleActions()) {
            if (!this.tbsConditionsMet(action)) continue;
            let line, field, excludeCaster, vAoe;
            const isAttack = action.skillId === this.attackSkillId();
            const isGuard = action.skillId === this.guardSkillId();
            if (isAttack) {
                const wr = this.tbsWeaponRange();
                line = wr[3]; field = wr[4]; excludeCaster = true; vAoe = wr[6];
            } else if (!isGuard) {
                if (!this.tbsSkillCanUse($dataSkills[action.skillId])) continue;
                const sr = this.tbsSkillRange(action.skillId);
                field = sr[1]; line = sr[2]; excludeCaster = sr[3]; vAoe = sr[6];
            } else {
                continue;
            }
            const tbsAction = new Game_Action(this);
            tbsAction.rating = action.rating;
            tbsAction.setSkill(action.skillId);
            tbsAction.otherBatAttack = otherBatAttack;
            for (const movePos of movePositions) {
                tbsAction.movePos = movePos;
                const actRange = tbsAction.tbsRange();
                tbsAction.tbsMovePosEvaluate();
                for (const actPos of actRange) {
                    if (performance.now() - debut > 15) {
                        yield* sc.gUpdateThinking();
                        sc.clearTrSprites();
                        debut = performance.now();
                    }
                    tbsAction.position = actPos;
                    tbsAction.rating = action.rating;
                    const type = [line, field, actRange, excludeCaster, vAoe];
                    cursor().moveto(actPos);
                    cursor().setTargetPositions(this.tbsTargetZone(movePos, actPos, type));
                    tbsAction.targets = tbsAction.tbsMakeTargets();
                    // GTBS evaluated twice (the first in an empty if), so the rating counts the targets twice.
                    tbsAction.tbsEvaluate();
                    tbsAction.tbsEvaluate();
                    if (tbsAction.rating === 0 || !tbsAction.targets.length) continue;
                    ratingMax = Math.max(ratingMax, tbsAction.rating);
                    available.push(tbsAction.tbsClone());
                }
            }
        }
        this._actions = [];
        let ratingsTotal = 0;
        const ratingZero = Math.max(ratingMax - 3, 0);
        for (const a of available) if (a.rating > ratingZero) ratingsTotal += a.rating - ratingZero;
        if (ratingsTotal === 0) {
            if (findApproach || this.tbsMovedQ()) {
                const a = new Game_Action(this);
                a.movePos = this.tbsPos();
                this.tbsSetCurrentAction(a);
            } else {
                // Nothing to do this turn: plan from where it could stand next turn, then walk that way.
                const [approachRoutes, approachCost] = this.tbsCalcPosMove(2 * 4 * this.tbsBaseMoveRange());
                const approachPositions = P.minus(R.routeKeys(approachRoutes), movePositions);
                yield* this.tbsMakeTbsAction(approachPositions, approachCost, true);
                const approachPos = this.tbsFindApproachMove(this.currentAction().movePos, movePositions);
                const a = new Game_Action(this);
                a.setAttack();
                a.movePos = approachPos;
                this.tbsSetCurrentAction(a);
            }
            return;
        }
        let value = rand(ratingsTotal);
        for (const a of available) {
            if (a.rating <= ratingZero) continue;
            if (value < a.rating - ratingZero) {
                this.tbsSetCurrentAction(a);
                a.beforeMove = P.eq(a.movePos, this.tbsPos()) && !this.tbsMovedQ();
                return;
            }
            value -= a.rating - ratingZero;
        }
        if (!this.currentAction()) {
            const [ex, ey] = this.tbsWanderPosition(sx, sy);
            this.tbsClearTbsActions();
            this.currentAction().movePos = [ex, ey];
        }
    };
    // Of the tiles in reach, the one whose approach to the target is smallest ("min" of the rates, as written).
    GB.tbsFindApproachMove = function(tPos, movePositions) {
        const [sx, sy] = this.tbsPos();
        let best = null, bestRate = Infinity;
        for (const pos of movePositions) {
            const approachRate = (Math.abs(tPos[0] - sx) + Math.abs(tPos[1] - sy)) - (Math.abs(pos[0] - sx) + Math.abs(pos[1] - sy));
            const rate = Math.max(approachRate, 0);
            if (rate < bestRate) { bestRate = rate; best = pos; }
        }
        this.tbsMoveto(sx, sy);
        return best;
    };
    GB.tbsMakeTbsConfusedAction = function(movePositions) {
        this.tbsClearTbsActions();
        this.currentAction().movePos = this.tbsPos();
        if (!this.canMove()) return;
        const available = [];
        for (const action of this.tbsPossibleActions()) {
            if (!this.tbsConditionsMet(action)) continue;
            const isAttack = action.skillId === this.attackSkillId(), isGuard = action.skillId === this.guardSkillId();
            if (!isAttack && !isGuard && !this.tbsSkillCanUse($dataSkills[action.skillId])) continue;
            available.push(action);
        }
        const action = available[rand(available.length)];
        if (!action) return;
        this.currentAction().setSkill(action.skillId);
        let type = null;
        if (action.skillId === this.attackSkillId()) {
            const wr = this.tbsWeaponRange();
            type = [wr[3], wr[4], this.currentAction().tbsRange(), true, wr[6]];
        } else if (action.skillId !== this.guardSkillId()) {
            const sr = this.tbsSkillRange(action.skillId);
            type = [sr[2], sr[1], this.currentAction().tbsRange(), sr[3], sr[6]];
        }
        this.currentAction().tbsAssignRandomMovementAndTargets(movePositions, type);
    };
})();
