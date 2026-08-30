/**
 * DatabaseReferenceFinder - answers "what else in the database points at this
 * entry?" for the database list's Referenced by command.
 *
 * Scope is deliberately narrow: structured fields of the database records
 * themselves. Two things are out on purpose.
 *   - Note boxes. A note is free text whose meaning belongs to whichever
 *     plugin reads it, so nothing here could resolve `<Aura State: 12>` to
 *     state 12 without guessing at a syntax the editor does not own.
 *   - Map events. They live in Map###.json, not in the database, and would
 *     mean reading every map file off disk to answer one context-menu click.
 *
 * Command parameter layouts are taken from the Reactor runtime's own
 * Game_Interpreter (runtime/reactor_objects.js), not from memory of MZ.
 */
class DatabaseReferenceFinder {

    /** Types a lookup can be run on. */
    static get targetTypes() {
        return ['actors', 'classes', 'skills', 'items', 'weapons', 'armors',
            'enemies', 'troops', 'states', 'animations', 'tilesets', 'commonEvents'];
    }

    /**
     * Trait codes that carry a database id in `dataId`. The rest either carry
     * a System type id (elements, skill/weapon/armor/equip types) or no id at
     * all, and System types are not list entries.
     */
    static get traitRefs() {
        return {
            13: { type: 'states', where: 'State Rate' },
            14: { type: 'states', where: 'State Resist' },
            32: { type: 'states', where: 'Attack State' },
            35: { type: 'skills', where: 'Attack Skill' },
            43: { type: 'skills', where: 'Add Skill' },
            44: { type: 'skills', where: 'Seal Skill' }
        };
    }

    /** Effect codes that carry a database id in `dataId`. */
    static get effectRefs() {
        return {
            21: { type: 'states', where: 'Add State' },
            22: { type: 'states', where: 'Remove State' },
            43: { type: 'skills', where: 'Learn Skill' },
            44: { type: 'commonEvents', where: 'Common Event' }
        };
    }

    /** Enemy drop `kind`, 1-based, as Game_Enemy.makeDropItems reads it. */
    static get dropKinds() {
        return { 1: 'items', 2: 'weapons', 3: 'armors' };
    }

    constructor(databaseManager) {
        this.databaseManager = databaseManager;
    }

    /**
     * Every database record that references (targetType, targetId).
     *
     * @returns {Array<{type: string, id: number, where: string,
     *                  whereKind: 'text'|'eventCommand', page: number|null,
     *                  count: number}>}
     *   `type`/`id` locate the referring record ('system' with id 0 for
     *   System.json). `where` is an English phrase naming the field, which
     *   the caller translates through the matching I18n entry point:
     *   tEventCommandName for 'eventCommand', tText otherwise. Repeats of the
     *   same site collapse into one row with `count` above 1.
     */
    findReferences(targetType, targetId) {
        const id = Number(targetId);
        if (!DatabaseReferenceFinder.targetTypes.includes(targetType)) return [];
        if (!Number.isInteger(id) || id <= 0) return [];

        const found = new Map();
        this.scan((hit) => {
            if (hit.refType !== targetType || hit.refId !== id) return;
            // Self-reference is noise: a skill whose effect learns itself
            // still is not "referenced by" anything the author can navigate to.
            if (hit.type === targetType && hit.id === id) return;
            // JSON rather than a joined string: `where` is a phrase with
            // spaces in it, so no plain separator is safely outside the parts.
            const key = JSON.stringify([hit.type, hit.id, hit.where, hit.page ?? null]);
            const existing = found.get(key);
            if (existing) { existing.count++; return; }
            found.set(key, {
                type: hit.type,
                id: hit.id,
                where: hit.where,
                whereKind: hit.whereKind || 'text',
                page: hit.page ?? null,
                count: 1
            });
        });
        return Array.from(found.values());
    }

    /**
     * Walk every structured reference in the database once, reporting each as
     * {type, id, refType, refId, where, whereKind, page}. Kept separate from
     * findReferences so the traversal can be exercised on its own.
     */
    scan(visit) {
        const emit = (type, id, refType, refId, where, options = {}) => {
            if (!refType || !Number.isInteger(refId) || refId <= 0) return;
            visit({ type, id, refType, refId, where, whereKind: options.whereKind || 'text', page: options.page ?? null });
        };

        this._records('actors').forEach(actor => {
            emit('actors', actor.id, 'classes', actor.classId, 'Class');
            this._equipBindings(actor).forEach(({ etypeId, slotIndex }) => {
                // initEquips binds slot to $dataWeapons when the slot's equip
                // type is 1, and to $dataArmors otherwise.
                emit('actors', actor.id, etypeId === 1 ? 'weapons' : 'armors',
                    Number(actor.equips?.[slotIndex]), 'Equipment');
            });
            this._traits('actors', actor, emit);
        });

        this._records('classes').forEach(klass => {
            (klass.learnings || []).forEach(learning => {
                emit('classes', klass.id, 'skills', Number(learning?.skillId), 'Learnable Skills');
            });
            this._traits('classes', klass, emit);
        });

        for (const type of ['skills', 'items']) {
            this._records(type).forEach(entry => {
                emit(type, entry.id, 'animations', Number(entry.animationId), 'Animation');
                (entry.effects || []).forEach(effect => {
                    const ref = DatabaseReferenceFinder.effectRefs[effect?.code];
                    // dataId 0 on Add/Remove State means the attacker's own
                    // normal-attack state, which is not a state id.
                    if (ref) emit(type, entry.id, ref.type, Number(effect.dataId), ref.where);
                });
            });
        }

        this._records('weapons').forEach(weapon => {
            emit('weapons', weapon.id, 'animations', Number(weapon.animationId), 'Animation');
            this._traits('weapons', weapon, emit);
        });

        this._records('armors').forEach(armor => this._traits('armors', armor, emit));
        this._records('states').forEach(state => this._traits('states', state, emit));

        this._records('enemies').forEach(enemy => {
            (enemy.actions || []).forEach(action => {
                emit('enemies', enemy.id, 'skills', Number(action?.skillId), 'Action Patterns');
            });
            (enemy.dropItems || []).forEach(drop => {
                const type = DatabaseReferenceFinder.dropKinds[drop?.kind];
                if (type) emit('enemies', enemy.id, type, Number(drop.dataId), 'Drop Items');
            });
            this._traits('enemies', enemy, emit);
        });

        this._records('troops').forEach(troop => {
            (troop.members || []).forEach(member => {
                emit('troops', troop.id, 'enemies', Number(member?.enemyId), 'Members');
            });
            (troop.pages || []).forEach((page, index) => {
                const pageNumber = index + 1;
                if (page?.conditions?.actorValid) {
                    emit('troops', troop.id, 'actors', Number(page.conditions.actorId),
                        'Conditions', { page: pageNumber });
                }
                this._commands('troops', troop.id, page?.list, emit, pageNumber);
            });
        });

        this._records('commonEvents').forEach(event => {
            this._commands('commonEvents', event.id, event.list, emit, null);
        });

        const system = this.databaseManager?.getSystem?.();
        (system?.partyMembers || []).forEach(actorId => {
            emit('system', 0, 'actors', Number(actorId), 'Starting Party');
        });
    }

    /** Live records of one list type, skipping the reserved id-0 slot. */
    _records(type) {
        const list = this.databaseManager?.data?.[type];
        if (!Array.isArray(list)) return [];
        return list.filter(entry => entry && Number.isInteger(entry.id) && entry.id > 0);
    }

    _traits(type, entry, emit) {
        (entry.traits || []).forEach(trait => {
            const ref = DatabaseReferenceFinder.traitRefs[trait?.code];
            if (ref) emit(type, entry.id, ref.type, Number(trait.dataId), ref.where);
        });
    }

    /**
     * An actor's {etypeId, slotIndex} pairs. Uses the shared resolver so a
     * class `<equip slots>` note and Dual Wield land on the same slots the
     * actor editor shows; falls back to the engine default when the helper
     * is not loaded (tests that exercise the finder alone).
     */
    _equipBindings(actor) {
        const equips = Array.isArray(actor?.equips) ? actor.equips : [];
        if (typeof RREquipSlots !== 'undefined' && RREquipSlots.resolveInitialBindings) {
            return RREquipSlots.resolveInitialBindings(
                this.databaseManager, null, actor, this._isDualWield(actor));
        }
        return equips.map((_, slotIndex) => ({ etypeId: slotIndex + 1, slotIndex }));
    }

    /** Trait 55 (Slot Type) with dataId 1 is Dual Wield, on actor or class. */
    _isDualWield(actor) {
        const dualWield = traits => (traits || []).some(t => t && t.code === 55 && t.dataId === 1);
        if (dualWield(actor?.traits)) return true;
        return dualWield(this.databaseManager?.getClass?.(actor?.classId)?.traits);
    }

    _commands(type, id, list, emit, page) {
        if (!Array.isArray(list)) return;
        list.forEach(command => {
            if (!command || !Array.isArray(command.parameters)) return;
            const name = DatabaseReferenceFinder.commandNames[command.code];
            if (!name) return;
            DatabaseReferenceFinder.commandReferences(command.code, command.parameters)
                .forEach(ref => emit(type, id, ref.type, ref.id, name, { whereKind: 'eventCommand', page }));
        });
    }

    /**
     * Event command names, as EventCommandList prints them, for the commands
     * this finder reads. tEventCommandName translates them.
     */
    static get commandNames() {
        return {
            111: 'Conditional Branch', 117: 'Common Event', 126: 'Change Items',
            127: 'Change Weapons', 128: 'Change Armors', 129: 'Change Party Member',
            212: 'Show Animation', 282: 'Change Tileset', 301: 'Battle Processing',
            302: 'Shop Processing', 605: 'Shop Processing', 303: 'Name Input Processing',
            311: 'Change HP', 312: 'Change MP', 313: 'Change State', 314: 'Recover All',
            315: 'Change EXP', 316: 'Change Level', 317: 'Change Parameter',
            318: 'Change Skill', 319: 'Change Equipment', 320: 'Change Name',
            321: 'Change Class', 322: 'Change Actor Images', 324: 'Change Nickname',
            325: 'Change Profile', 326: 'Change TP', 333: 'Change Enemy State',
            336: 'Enemy Transform', 337: 'Show Battle Animation', 339: 'Force Action'
        };
    }

    /**
     * Database ids one event command names directly. Commands that reach a
     * record through a variable are skipped: the id is not in the data.
     */
    static commandReferences(code, params) {
        const refs = [];
        const push = (type, id) => {
            const value = Number(id);
            if (Number.isInteger(value) && value > 0) refs.push({ type, id: value });
        };
        // Change HP/MP/TP/EXP/Level/Parameter/State/Skill/Recover All share a
        // leading (0 = direct actor id, 1 = variable) selector.
        const actorEx = () => { if (params[0] === 0) push('actors', params[1]); };

        switch (code) {
            case 111:
                switch (params[0]) {
                    case 4: // Actor
                        push('actors', params[1]);
                        if (params[2] === 2) push('classes', params[3]);
                        else if (params[2] === 3) push('skills', params[3]);
                        else if (params[2] === 4) push('weapons', params[3]);
                        else if (params[2] === 5) push('armors', params[3]);
                        else if (params[2] === 6) push('states', params[3]);
                        break;
                    case 5: if (params[2] === 1) push('states', params[3]); break; // Enemy state
                    case 8: push('items', params[1]); break;
                    case 9: push('weapons', params[1]); break;
                    case 10: push('armors', params[1]); break;
                }
                break;
            case 117: push('commonEvents', params[0]); break;
            case 126: push('items', params[0]); break;
            case 127: push('weapons', params[0]); break;
            case 128: push('armors', params[0]); break;
            case 129: push('actors', params[0]); break;
            case 212: push('animations', params[1]); break;
            case 282: push('tilesets', params[0]); break;
            case 301: if (params[0] === 0) push('troops', params[1]); break;
            case 302: case 605: {
                const goods = { 0: 'items', 1: 'weapons', 2: 'armors' }[params[0]];
                if (goods) push(goods, params[1]);
                break;
            }
            case 303: push('actors', params[0]); break;
            case 311: case 312: case 314: case 315: case 316: case 317: case 326:
                actorEx();
                break;
            case 313: actorEx(); push('states', params[3]); break;
            case 318: actorEx(); push('skills', params[3]); break;
            case 319:
                push('actors', params[0]);
                // changeEquipById picks weapons only for a slot whose equip
                // type is 1; without the actor's slot list that is the honest
                // approximation, and it is right for every default layout.
                push(params[1] === 1 ? 'weapons' : 'armors', params[2]);
                break;
            case 320: case 322: case 324: case 325: push('actors', params[0]); break;
            case 321: push('actors', params[0]); push('classes', params[1]); break;
            case 333: push('states', params[2]); break;
            case 336: push('enemies', params[1]); break;
            case 337: push('animations', params[1]); break;
            case 339:
                if (params[0] === 1) push('actors', params[1]);
                push('skills', params[2]);
                break;
        }
        return refs;
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = DatabaseReferenceFinder;
