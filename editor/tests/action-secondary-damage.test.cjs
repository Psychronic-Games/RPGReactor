/**
 * A secondary damage channel: the resource the primary type does not use,
 * moved by the same hit.
 *
 * `damage.secondary` is written only while a skill or item has one. These
 * tests evaluate the shipped runtime methods and the shipped editor module
 * verbatim, so the stored shape and the pass that reads it cannot drift
 * apart. They pin what makes the channel safe to add underneath apply():
 * an action without it takes exactly the path it always took, the item's
 * own fields are back to the primary's whatever the pass does, and each
 * resource is judged by its own type.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');
const read = relative => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

/** Pull one shipped `<head> ... };` definition verbatim. */
function definition(source, head) {
    const start = source.indexOf(head);
    assert.ok(start >= 0, `source defines ${head}`);
    const end = source.indexOf('\n};\n', start);
    assert.ok(end > start, `${head} terminates`);
    return source.slice(start, end + 4);
}

/** Pull one shipped single-statement line verbatim. */
function line(source, head) {
    const start = source.indexOf(head);
    assert.ok(start >= 0, `source defines ${head}`);
    return source.slice(start, source.indexOf('\n', start) + 1);
}

// --- runtime harness ------------------------------------------------------

const ACTION_METHODS = [
    'checkDamageType', 'isHpEffect', 'isMpEffect', 'isDamage', 'isRecover', 'isDrain',
    'isHpRecover', 'isMpRecover', 'testApply', 'testSecondaryRecover', 'hasItemAnyValidEffects',
    'apply', 'secondaryDamage', 'executeSecondaryDamage', 'evalDamageFormula',
    'executeDamage', 'executeHpDamage', 'executeMpDamage', 'gainDrainedHp', 'gainDrainedMp'
];

function loadRuntime() {
    const objects = read('runtime/reactor_objects.js');
    const context = {
        Game_Action: function () {},
        Game_ActionResult: function () { this.initialize(); },
        ReactorEvents: { emit() {} },
        $gameVariables: { _data: [] },
        $gameParty: { inBattle: () => true },
        console
    };
    vm.runInNewContext([
        line(objects, 'Game_Action.SECONDARY_DAMAGE_EFFECTS = '),
        definition(objects, 'Game_Action.damageTypeSign = function('),
        ...ACTION_METHODS.map(name => definition(objects, `Game_Action.prototype.${name} = function(`)),
        definition(objects, 'Game_ActionResult.prototype.initialize = function('),
        definition(objects, 'Game_ActionResult.prototype.clear = function('),
        definition(objects, 'Game_ActionResult.prototype.isHit = function(')
    ].join('\n'), context);

    function makeBattler({ hp = 500, mhp = 1000, mp = 50, mmp = 100 } = {}) {
        return {
            hp, mhp, mp, mmp,
            _result: new context.Game_ActionResult(),
            result() { return this._result; },
            clearResult() { this._result.clear(); },
            // The engine's own shape: the result records the requested
            // change, the pool is clamped.
            gainHp(value) {
                this._result.hpDamage = -value;
                this._result.hpAffected = true;
                this.hp = Math.max(0, Math.min(this.mhp, this.hp + value));
            },
            gainMp(value) {
                this._result.mpDamage = -value;
                this.mp = Math.max(0, Math.min(this.mmp, this.mp + value));
            },
            onDamage() {},
            isAlive() { return this.hp > 0; }
        };
    }

    /**
     * An action on `item` by `user`. makeDamageValue is the shipped formula
     * evaluation times three for a critical - enough to show which formula
     * and which sign a pass used without element or variance in the way.
     */
    function makeAction(item, user = makeBattler(), { critical = false } = {}) {
        const action = new context.Game_Action();
        action.item = () => item;
        action.subject = () => user;
        action.itemHit = () => 1;
        action.itemEva = () => 0;
        action.itemCri = () => (critical ? 1 : 0);
        action.isPhysical = () => false;
        action.makeSuccess = () => {};
        action.applyItemEffect = () => {};
        action.applyItemUserEffect = () => {};
        action.updateLastTarget = () => {};
        action.testLifeAndDeath = () => true;
        action.makeDamageValue = function (target, isCritical) {
            return Math.round(this.evalDamageFormula(target) * (isCritical ? 3 : 1));
        };
        return action;
    }

    function skill(type, formula, secondary) {
        const damage = { type, formula, elementId: 0, variance: 0, critical: true };
        if (secondary) damage.secondary = secondary;
        return { id: 1, damage, effects: [] };
    }

    return { context, makeBattler, makeAction, skill };
}

// --- the stored shape -----------------------------------------------------

test('an effect lands on the resource the primary does not use', () => {
    const { makeAction, skill } = loadRuntime();
    const expected = {
        1: { damage: 2, recover: 4, drain: 6 },
        3: { damage: 2, recover: 4, drain: 6 },
        5: { damage: 2, recover: 4, drain: 6 },
        2: { damage: 1, recover: 3, drain: 5 },
        4: { damage: 1, recover: 3, drain: 5 },
        6: { damage: 1, recover: 3, drain: 5 }
    };
    for (const [primary, byEffect] of Object.entries(expected)) {
        for (const [effect, type] of Object.entries(byEffect)) {
            const action = makeAction(skill(Number(primary), '1', { effect, basis: 'rate', rate: 50, formula: '' }));
            assert.equal(action.secondaryDamage().type, type, `primary ${primary}, ${effect}`);
        }
    }
});

test('a block that cannot do anything reads as no secondary at all', () => {
    const { makeAction, skill } = loadRuntime();
    const cases = [
        [0, { effect: 'drain', basis: 'rate', rate: 50 }],
        [1, { effect: 'heal', basis: 'rate', rate: 50 }],
        [1, { effect: 'drain', basis: 'rate', rate: 0 }],
        [1, { effect: 'drain', basis: 'rate', rate: -10 }],
        [1, { effect: 'drain', basis: 'formula', formula: '   ' }],
        [1, null]
    ];
    for (const [type, secondary] of cases) {
        assert.equal(makeAction(skill(type, '1', secondary)).secondaryDamage(), null, JSON.stringify(secondary));
    }
    const unknownBasis = makeAction(skill(1, '1', { effect: 'drain', basis: 'bogus', rate: 30 })).secondaryDamage();
    assert.equal(unknownBasis.basis, 'rate', 'an unknown basis reads as a rate');
});

// --- apply ----------------------------------------------------------------

test('an action without a secondary takes exactly the path it always took', () => {
    const { makeBattler, makeAction, skill } = loadRuntime();
    const user = makeBattler({ hp: 100 });
    const target = makeBattler();
    const item = skill(5, '40');
    makeAction(item, user).apply(target);
    assert.equal(target.hp, 460);
    assert.equal(user.hp, 140);
    assert.equal(target.mp, 50, 'MP untouched');
    const result = target.result();
    assert.equal(result.drain, true);
    assert.equal(result.hpDrain, undefined);
    assert.equal(result.mpDrain, undefined);
    assert.deepEqual(Object.keys(item.damage).sort(), ['critical', 'elementId', 'formula', 'type', 'variance']);
});

test('HP Damage with a 25% MP Drain: the HP is dealt, not drained, and the MP moves to the user', () => {
    const { makeBattler, makeAction, skill } = loadRuntime();
    const user = makeBattler({ hp: 100, mp: 10 });
    const target = makeBattler({ mp: 50 });
    makeAction(skill(1, '100', { effect: 'drain', basis: 'rate', rate: 25, formula: '' }), user).apply(target);
    assert.equal(target.hp, 400);
    assert.equal(user.hp, 100, 'the HP half is damage: the user gains none');
    assert.equal(target.mp, 25);
    assert.equal(user.mp, 35);
    const result = target.result();
    assert.equal(result.hpDamage, 100);
    assert.equal(result.mpDamage, 25);
    assert.equal(result.hpDrain, false);
    assert.equal(result.mpDrain, true);
    assert.equal(result.drain, false, 'drain follows the HP line, so the HP hit still shakes');
});

test('an MP Drain primary with an HP Damage secondary still counts as drain on the MP line only', () => {
    const { makeBattler, makeAction, skill } = loadRuntime();
    const user = makeBattler({ hp: 100, mp: 10 });
    const target = makeBattler({ mp: 50 });
    makeAction(skill(6, '20', { effect: 'damage', basis: 'formula', rate: 100, formula: '70' }), user).apply(target);
    assert.equal(target.mp, 30);
    assert.equal(user.mp, 30);
    assert.equal(target.hp, 430);
    assert.equal(user.hp, 100);
    const result = target.result();
    assert.equal(result.mpDrain, true);
    assert.equal(result.hpDrain, false);
    assert.equal(result.drain, false);
});

test('each of the nine cross pairs sets one drain flag per resource', () => {
    const { makeBattler, makeAction, skill } = loadRuntime();
    for (const primary of [1, 3, 5]) {
        for (const effect of ['damage', 'recover', 'drain']) {
            const target = makeBattler();
            makeAction(skill(primary, '10', { effect, basis: 'rate', rate: 50, formula: '' })).apply(target);
            const result = target.result();
            assert.equal(result.hpDrain, primary === 5, `HP ${primary} + MP ${effect}`);
            assert.equal(result.mpDrain, effect === 'drain', `HP ${primary} + MP ${effect}`);
            assert.equal(result.drain, result.hpDrain);
        }
    }
});

test('by rate, the secondary carries the primary sign across, including an absorbed hit', () => {
    const { makeBattler, makeAction, skill } = loadRuntime();

    // HP Recover heals 100 (value -100); an MP Damage at 10% is +10.
    const healed = makeBattler({ hp: 500, mp: 50 });
    makeAction(skill(3, '100', { effect: 'damage', basis: 'rate', rate: 10, formula: '' })).apply(healed);
    assert.equal(healed.hp, 600);
    assert.equal(healed.mp, 40);

    // An HP Damage an element absorbed arrives as -40: the MP Damage at 50%
    // turns round with it into a 20 MP gain.
    const absorbing = makeBattler({ mp: 50 });
    const action = makeAction(skill(1, '40', { effect: 'damage', basis: 'rate', rate: 50, formula: '' }));
    action.makeDamageValue = () => -40;
    action.apply(absorbing);
    assert.equal(absorbing.hp, 540);
    assert.equal(absorbing.mp, 70);
});

test('by formula, the pass evaluates the secondary formula with the secondary sign, then puts the item back', () => {
    const { makeBattler, makeAction, skill } = loadRuntime();
    const target = makeBattler({ mp: 50 });
    const item = skill(1, '50', { effect: 'recover', basis: 'formula', rate: 100, formula: '30' });
    const action = makeAction(item);
    const seen = [];
    const evalDamageFormula = action.evalDamageFormula;
    action.evalDamageFormula = function (t) {
        seen.push([this.item().damage.type, this.item().damage.formula, this._rrDamageChannel]);
        return evalDamageFormula.call(this, t);
    };
    action.apply(target);
    assert.deepEqual(seen, [[1, '50', undefined], [4, '30', 'secondary']]);
    assert.equal(target.hp, 450);
    assert.equal(target.mp, 80, 'MP Recover: the formula came back negative and healed');
    assert.equal(item.damage.type, 1);
    assert.equal(item.damage.formula, '50');
    assert.equal(action._rrDamageChannel, undefined);
});

test('an exception inside the pass still puts the primary type and formula back', () => {
    const { makeBattler, makeAction, skill } = loadRuntime();
    const item = skill(1, '50', { effect: 'drain', basis: 'formula', rate: 100, formula: '9' });
    const action = makeAction(item);
    const executeDamage = action.executeDamage;
    action.executeDamage = function (target, value) {
        if (this._rrDamageChannel === 'secondary') throw new Error('plugin fault');
        return executeDamage.call(this, target, value);
    };
    assert.throws(() => action.apply(makeBattler()), /plugin fault/);
    assert.equal(item.damage.type, 1);
    assert.equal(item.damage.formula, '50');
    assert.equal(action._rrDamageChannel, undefined);
});

test('one critical roll for both, and a secondary of 0 does not take it away', () => {
    const { makeBattler, makeAction, skill } = loadRuntime();
    // The MP pass executes 0, and executeDamage clears the flag for a 0.
    const empty = makeBattler({ mp: 50 });
    makeAction(skill(1, '10', { effect: 'damage', basis: 'formula', rate: 100, formula: '0' }), undefined, { critical: true }).apply(empty);
    assert.equal(empty.mp, 50);
    assert.equal(empty.hp, 470, 'critical tripled the primary');
    assert.equal(empty.result().critical, true);

    // A primary of 0 clears the flag; a secondary that landed brings it back.
    const target = makeBattler({ mp: 50 });
    const zero = makeAction(skill(1, '0', { effect: 'damage', basis: 'formula', rate: 100, formula: '5' }), undefined, { critical: true });
    zero.apply(target);
    assert.equal(target.mp, 35, 'critical tripled the secondary');
    assert.equal(target.result().critical, true);
});

test('a primary that was dodged takes its secondary with it', () => {
    const { makeBattler, makeAction, skill } = loadRuntime();
    const target = makeBattler({ mp: 50 });
    const action = makeAction(skill(1, '10', { effect: 'drain', basis: 'rate', rate: 100, formula: '' }));
    const executeDamage = action.executeDamage;
    action.executeDamage = function (t, value) {
        if (this._rrDamageChannel !== 'secondary') {
            t.result().dodged = true;
            return;
        }
        return executeDamage.call(this, t, value);
    };
    action.apply(target);
    assert.equal(target.mp, 50);
    assert.equal(target.result().mpDrain, undefined);
});

test('a secondary Recover makes the action usable from the menu, as a primary one does', () => {
    const { context, makeBattler, makeAction, skill } = loadRuntime();
    context.$gameParty.inBattle = () => false;
    const hurt = makeBattler({ hp: 10 });
    const full = makeBattler({ hp: 1000 });
    const action = makeAction(skill(2, '5', { effect: 'recover', basis: 'formula', rate: 100, formula: '50' }));
    assert.equal(action.testApply(hurt), true);
    assert.equal(action.testApply(full), false);
    assert.equal(makeAction(skill(2, '5')).testApply(hurt), false, 'without it, MP Damage alone is not usable');
});

// --- presentation ---------------------------------------------------------

test('a stock battler shows an HP and an MP number for a hit that moved both', () => {
    const sprites = read('runtime/reactor_sprites.js');
    const context = {
        Sprite_Battler: function () {},
        Sprite_Damage: function () { this.shown = []; },
        console
    };
    vm.runInNewContext([
        definition(sprites, 'Sprite_Battler.prototype.setupDamagePopup = function('),
        definition(sprites, 'Sprite_Battler.prototype.createDamageSprite = function('),
        definition(sprites, 'Sprite_Damage.prototype.setup = function(')
    ].join('\n'), context);
    Object.assign(context.Sprite_Damage.prototype, {
        createMiss() { this.shown.push('miss'); },
        createDigits(value) { this.shown.push([this._colorType, value]); },
        setupCriticalEffect() { this.shown.push('critical'); }
    });
    const popups = result => {
        const battler = {
            _result: result,
            requested: true,
            isDamagePopupRequested() { return this.requested; },
            isSpriteVisible: () => true,
            isAlive: () => true,
            result() { return this._result; },
            clearDamagePopup() { this.requested = false; },
            clearResult() {}
        };
        const sprite = Object.create(context.Sprite_Battler.prototype);
        Object.assign(sprite, {
            _battler: battler, _damages: [], x: 0, y: 0,
            damageOffsetX: () => 0, damageOffsetY: () => 0,
            parent: { addChild() {} }
        });
        sprite.setupDamagePopup();
        return sprite._damages.map(d => d.shown);
    };
    const base = { missed: false, evaded: false, critical: false, hpAffected: false, hpDamage: 0, mpDamage: 0 };
    assert.deepEqual(popups({ ...base, hpAffected: true, hpDamage: 100, mpDamage: 25 }), [[[0, 100]], [[2, 25]]]);
    assert.deepEqual(popups({ ...base, hpAffected: true, hpDamage: 100 }), [[[0, 100]]], 'HP alone: one number');
    assert.deepEqual(popups({ ...base, mpDamage: 25 }), [[[2, 25]]], 'MP alone: one number');
    assert.deepEqual(popups({ ...base, missed: true }), [['miss']]);
});

test('the battle log words each resource by its own drain flag', () => {
    const windows = read('runtime/reactor_windows.js');
    const context = {
        Window_BattleLog: function () {},
        TextManager: { mp: 'MP', actorDrain: '%1 drained %2 %3', enemyDrain: '%1 drained %2 %3', actorLoss: '%1 lost %2 %3', enemyLoss: '%1 lost %2 %3', actorRecovery: '%1 gained %2 %3', enemyRecovery: '%1 gained %2 %3' },
        console
    };
    vm.runInNewContext('String.prototype.format = function(...a) { return this.replace(/%(\\d+)/g, (s, n) => a[Number(n) - 1]); };\n' +
        definition(windows, 'Window_BattleLog.prototype.makeMpDamageText = function('), context);
    const log = Object.create(context.Window_BattleLog.prototype);
    const text = result => log.makeMpDamageText({ isActor: () => false, name: () => 'Slime', result: () => result });
    assert.equal(text({ mpDamage: 5, drain: true }), 'Slime drained MP 5', 'no per-resource flag: drain as before');
    assert.equal(text({ mpDamage: 5, drain: false, mpDrain: true }), 'Slime drained MP 5');
    assert.equal(text({ mpDamage: 5, drain: true, mpDrain: false }), 'Slime lost MP 5', 'an HP drain does not word the MP line');
});

// --- editor ---------------------------------------------------------------

function loadModule() {
    const context = { window: {}, console, rrEscapeHtml: value => String(value) };
    context.globalThis = context;
    vm.runInNewContext(read('editor/src/database/ActionSecondaryDamage.js') + '\n;globalThis.__ASD = ActionSecondaryDamage;', context);
    return context.__ASD;
}

const TYPE_NAMES = ['None', 'HP Damage', 'MP Damage', 'HP Recover', 'MP Recover', 'HP Drain', 'MP Drain'];

test('the editor writes the block only while an effect is chosen, and None deletes it', () => {
    const ASD = loadModule();
    const damage = { type: 1, formula: 'a.atk', elementId: 0, variance: 20, critical: false };
    assert.equal(ASD.write(damage, 'rate', '50'), undefined, 'no block, nothing to write into');
    assert.equal('secondary' in damage, false);

    assert.equal(ASD.write(damage, 'effect', 'drain'), 'drain');
    assert.equal(JSON.stringify(damage.secondary), JSON.stringify({ effect: 'drain', basis: 'rate', rate: 100, formula: '' }));

    assert.equal(ASD.write(damage, 'rate', '25.5'), 25.5);
    assert.equal(ASD.write(damage, 'rate', '-3'), 0);
    assert.equal(ASD.write(damage, 'rate', '99999'), 1000);
    assert.equal(ASD.write(damage, 'formula', 'b.mmp * 0.1'), 'b.mmp * 0.1');
    assert.equal(ASD.write(damage, 'basis', 'formula'), 'formula');
    assert.equal(ASD.write(damage, 'basis', 'rate'), 'rate');
    assert.equal(damage.secondary.formula, 'b.mmp * 0.1', 'switching basis keeps the formula');

    assert.equal(ASD.write(damage, 'effect', 'recover'), 'recover');
    assert.equal(damage.secondary.rate, 1000, 'changing the effect keeps the amount');
    assert.equal(damage.secondary.formula, 'b.mmp * 0.1');

    assert.equal(ASD.write(damage, 'effect', ''), '');
    assert.equal('secondary' in damage, false);
});

test('the option names follow the primary, and so the stored effect crosses resources with it', () => {
    const ASD = loadModule();
    const names = damage => [...ASD.rowHTML(damage, 'data-skill-id', 1, TYPE_NAMES).matchAll(/<option value="(damage|recover|drain)"[^>]*>([^<]*)</g)].map(m => m[2]);
    assert.deepEqual(names({ type: 1 }), ['MP Damage', 'MP Recover', 'MP Drain']);
    assert.deepEqual(names({ type: 6 }), ['HP Damage', 'HP Recover', 'HP Drain']);
    assert.deepEqual(names({ type: 0 }), ['MP Damage', 'MP Recover', 'MP Drain'], 'no primary: MP names, row disabled');
    const html = ASD.rowHTML({ type: 5, secondary: { effect: 'drain', basis: 'formula', rate: 40, formula: 'a.mat' } }, 'data-item-id', 7, TYPE_NAMES);
    assert.match(html, /<option value="drain" selected>MP Drain</);
    assert.match(html, /<option value="formula" selected>/);
    assert.match(html, /value="40" data-field="damage\.secondary\.rate" data-item-id="7"/);
    assert.match(html, /value="a\.mat" data-field="damage\.secondary\.formula" data-item-id="7"/);
});

test('the editor stores exactly what the runtime reads', () => {
    const ASD = loadModule();
    const { makeAction } = loadRuntime();
    for (const primary of [1, 2, 3, 4, 5, 6]) {
        for (const effect of ASD.EFFECTS) {
            const damage = { type: primary, formula: '1', elementId: 0, variance: 0, critical: false };
            ASD.write(damage, 'effect', effect);
            const read = makeAction({ id: 1, damage, effects: [] }).secondaryDamage();
            assert.equal(read.type, ASD.typeFor(primary, effect), `primary ${primary}, ${effect}`);
            assert.equal(read.basis, 'rate');
            assert.equal(read.rate, 100);
        }
    }
});
