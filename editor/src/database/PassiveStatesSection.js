/**
 * PassiveStatesSection - a Passive States list for the database records that
 * can grant one through VisuStella's notetags.
 *
 * VisuMZ_1_SkillsStatesCore reads `<Passive State: x>` from Actor, Class,
 * Skill, Weapon, Armor and Enemy notes and applies the state for as long as
 * the trait object applies to the battler (DataManager.getPassiveStatesFromObj,
 * Game_BattlerBase.addPassiveStatesByNotetag). VisuMZ_2_EquipPassiveSys reads
 * `<Learnable Equip Passive: x>` from Actor and Class notes and the Learned /
 * Already variants from Actor notes; VisuMZ_2_EquipBattleSkills reads
 * `<Equip State: x>` from Skill notes. All of them resolve a token either as
 * a state ID or, case-insensitively, as a state name, and drop anything else
 * without a word.
 *
 * This section is a structured view of those tags. It appears only when the
 * project's `js/reactor_plugins.js` enables Skills and States Core, offers
 * only the kinds whose plugin is enabled for the record type on screen, and
 * stores everything in the record's Note as the notetag the plugin already
 * parses - so damage formulas, `a.states().includes(...)`, `hasState`, and
 * every other consumer see the passive exactly as if the tag had been typed.
 * The note on disk carries nothing but that tag; there is no parallel field
 * to drift from it.
 *
 * Each parser here uses the regex the owning plugin applies, cited beside it,
 * so what the list shows is what the runtime will read: a same-line pair of
 * tags that the plugin's greedy `(.*)` swallows shows up as one unknown name,
 * and the second `<Learnable Equip Passive>` line the plugin never reads is
 * flagged rather than shown as live.
 *
 * Also shown, greyed and not editable, are the passives the battler gets from
 * elsewhere, so a duplicate is visible before a playtest: the Trait Sets
 * ElementStatusCore assigns from the note (or by default), the Global / Actor
 * / Enemy lists in Skills and States Core's parameters, an actor's class, an
 * enemy's action skills, and the Actor / Class Passives lists of
 * DA_EquipPassiveSys_EXT.
 *
 * The pure half (detect, parse, write, grants, analyze) has no DOM and is
 * what the tests drive; createSection builds the card.
 */
(function(root) {
    'use strict';

    const OBJECT_TYPES = ['actor', 'class', 'skill', 'weapon', 'armor', 'enemy'];

    // The ten Trait Set types ElementStatusCore keys its parameters by
    // (Game_BattlerBase.prototype.getTraitSetKeys).
    const TRAIT_TYPES = ['Element', 'SubElement', 'Gender', 'Race', 'Nature', 'Alignment', 'Blessing', 'Curse', 'Zodiac', 'Variant'];

    /**
     * One kind per notetag family. `pattern` is the plugin's own regex (with
     * the g flag added so every occurrence can be located); `everyMatch` says
     * whether the plugin reads every occurrence or, as EquipPassiveSys and
     * EquipBattleSkills do with a non-global `match`, only the first.
     */
    const KINDS = {
        passive: {
            plugin: 'VisuMZ_1_SkillsStatesCore',
            label: 'Passive State',
            objects: OBJECT_TYPES,
            // VisuMZ_1_SkillsStatesCore DataManager.getPassiveStatesFromObj:
            // /<PASSIVE (?:STATE|STATES):[ ](.*)>/gi, split on ',', trimmed.
            pattern: /<PASSIVE (?:STATE|STATES):[ ](.*)>/gi,
            everyMatch: true,
            tagName: count => count === 1 ? 'Passive State' : 'Passive States'
        },
        learnable: {
            plugin: 'VisuMZ_2_EquipPassiveSys',
            label: 'Learnable Equip Passive',
            objects: ['actor', 'class'],
            // VisuMZ_2_EquipPassiveSys RegExp.LearnableEquipPassivesA / B.
            pattern: /<LEARNABLE EQUIP(?:|PED) PASSIVE(?:|S):[ ](.*)>/gi,
            block: /<LEARNABLE EQUIP(?:|PED) PASSIVE>\s*([\s\S]*)\s*<\/LEARNABLE EQUIP(?:|PED) PASSIVE(?:|S)>/i,
            everyMatch: false,
            tagName: count => count === 1 ? 'Learnable Equip Passive' : 'Learnable Equip Passives'
        },
        learned: {
            plugin: 'VisuMZ_2_EquipPassiveSys',
            label: 'Learned Equip Passive',
            objects: ['actor'],
            // VisuMZ_2_EquipPassiveSys RegExp.LearnedEquipPassives.
            pattern: /<LEARNED EQUIP(?:|PED) PASSIVE(?:|S):[ ](.*)>/gi,
            everyMatch: false,
            tagName: count => count === 1 ? 'Learned Equip Passive' : 'Learned Equip Passives'
        },
        already: {
            plugin: 'VisuMZ_2_EquipPassiveSys',
            label: 'Already Equipped Passive',
            objects: ['actor'],
            // VisuMZ_2_EquipPassiveSys RegExp.AlreadyEquipPassives.
            pattern: /<ALREADY EQUIP(?:|PED) PASSIVE(?:|S):[ ](.*)>/gi,
            everyMatch: false,
            tagName: count => count === 1 ? 'Already Equip Passive' : 'Already Equip Passives'
        },
        equipState: {
            plugin: 'VisuMZ_2_EquipBattleSkills',
            label: 'Equip State',
            objects: ['skill'],
            // VisuMZ_2_EquipBattleSkills RegExp.equipPassives.
            pattern: /<EQUIP (?:PASSIVE |)(?:STATE|STATES):[ ](.*?)>/gi,
            everyMatch: false,
            tagName: count => count === 1 ? 'Equip State' : 'Equip States'
        }
    };

    const KIND_ORDER = ['passive', 'learnable', 'learned', 'already', 'equipState'];

    const asText = value => String(value == null ? '' : value);

    // ------------------------------------------------------------ manifest

    /** The enabled manifest entry named `name`, or null. Disabled is absent. */
    function enabledPlugin(manifest, name) {
        if (!Array.isArray(manifest)) return null;
        return manifest.find(plugin => plugin && plugin.name === name && plugin.status === true) || null;
    }

    /** VisuStella `:struct` text parsed, or `{}` when absent or malformed. */
    function parseStruct(raw) {
        if (raw && typeof raw === 'object') return raw;
        if (typeof raw !== 'string' || !raw.trim()) return {};
        try {
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (error) {
            return {};
        }
    }

    /** VisuStella `:arraystruct` text parsed to an array of structs. */
    function parseArrayStruct(raw) {
        if (typeof raw !== 'string' || !raw.trim()) return Array.isArray(raw) ? raw : [];
        try {
            const list = JSON.parse(raw);
            if (!Array.isArray(list)) return [];
            return list.map(entry => {
                const parsed = parseStruct(entry);
                return Object.keys(parsed).length ? parsed : null;
            }).filter(Boolean);
        } catch (error) {
            return [];
        }
    }

    /** A plugin's `:struct` parameter parsed, or `{}`. */
    function structParam(plugin, key) {
        return parseStruct(plugin?.parameters?.[key]);
    }

    /** A plugin's `:arraystruct` parameter parsed to an array of structs. */
    function arrayStructParam(plugin, key) {
        return parseArrayStruct(plugin?.parameters?.[key]);
    }

    /** A struct field that VisuMZ would eval as a boolean. */
    function evalFlag(value, fallback) {
        if (value === true || value === false) return value;
        if (typeof value !== 'string') return fallback;
        const text = value.trim().toLowerCase();
        if (text === 'true') return true;
        if (text === 'false') return false;
        return fallback;
    }

    /** An `:arraynum` field (JSON text or array) as positive integers. */
    function numberList(value) {
        let list = value;
        if (typeof value === 'string') {
            try {
                list = value.trim() ? JSON.parse(value) : [];
            } catch (error) {
                list = [];
            }
        }
        if (!Array.isArray(list)) return [];
        return list.map(Number).filter(n => Number.isInteger(n) && n > 0);
    }

    /**
     * Which of the plugins this section reads are enabled. Skills and States
     * Core is the gate: none of the others grant a passive without it, and
     * EquipPassiveSys declares it as a base.
     */
    function detect(manifest) {
        const on = name => !!enabledPlugin(manifest, name);
        const elementStatusCore = enabledPlugin(manifest, 'VisuMZ_1_ElementStatusCore');
        const traitSettings = structParam(elementStatusCore, 'TraitSetSettings:struct');
        return {
            skillsStatesCore: on('VisuMZ_1_SkillsStatesCore'),
            equipPassiveSys: on('VisuMZ_2_EquipPassiveSys'),
            equipPassiveExt: on('DA_EquipPassiveSys_EXT'),
            equipBattleSkills: on('VisuMZ_2_EquipBattleSkills'),
            elementStatusCore: !!elementStatusCore,
            // DataManager.traitSetsEnabled reads TraitSetSettings.Enable.
            traitSets: !!elementStatusCore && evalFlag(traitSettings['Enable:eval'], false)
        };
    }

    /** The kinds an editor for `objectType` can offer under these plugins. */
    function availableKinds(objectType, detected) {
        if (!detected || !detected.skillsStatesCore) return [];
        return KIND_ORDER.filter(id => {
            const kind = KINDS[id];
            if (!kind.objects.includes(objectType)) return false;
            if (kind.plugin === 'VisuMZ_1_SkillsStatesCore') return true;
            if (kind.plugin === 'VisuMZ_2_EquipPassiveSys') return detected.equipPassiveSys;
            if (kind.plugin === 'VisuMZ_2_EquipBattleSkills') return detected.equipBattleSkills;
            return false;
        });
    }

    // ------------------------------------------------------------- parsing

    /**
     * A name → id map the way DataManager.getStateIdWithName builds its
     * cache: upper-cased and trimmed, a later state with the same name
     * winning over an earlier one.
     */
    function stateNameIndex(states) {
        const index = new Map();
        for (const state of states || []) {
            if (!state || !(state.id > 0)) continue;
            index.set(asText(state.name).toUpperCase().trim(), state.id);
        }
        return index;
    }

    function stateById(states, id) {
        if (!Array.isArray(states)) return null;
        return states.find(state => state && state.id === id) || null;
    }

    /**
     * One token resolved as the plugin resolves it: `/^\d+$/` makes it an id,
     * anything else is looked up as a name, and an id of 0 - a literal `0`
     * or a name nobody has - is dropped by the plugin.
     */
    function resolveToken(token, states, nameIndex) {
        const numeric = /^\d+$/.test(token);
        let id = 0;
        if (numeric) {
            id = Number(token);
        } else {
            id = nameIndex.get(token.toUpperCase().trim()) || 0;
        }
        const state = id > 0 ? stateById(states, id) : null;
        return {
            token,
            numeric,
            id,
            state,
            // The plugin keeps a numeric id whether or not the state exists;
            // a name it cannot resolve is gone.
            resolved: id > 0,
            exists: !!state
        };
    }

    /**
     * Every entry of one kind in the note, in note order, as the owning
     * plugin would see it. Entries from a tag the plugin never reads (a
     * second line of a first-match-only family) carry `ignored: true`.
     */
    function parseKind(note, kindId, states) {
        const kind = KINDS[kindId];
        const text = asText(note);
        const nameIndex = stateNameIndex(states);
        const entries = [];
        const pattern = new RegExp(kind.pattern.source, 'gi');
        let match;
        let occurrence = 0;
        while ((match = pattern.exec(text))) {
            const ignored = !kind.everyMatch && occurrence > 0;
            const tokens = asText(match[1]).split(',').map(token => token.trim());
            tokens.forEach((token, position) => {
                if (!token) return;
                entries.push(Object.assign(resolveToken(token, states, nameIndex), {
                    kind: kindId,
                    form: 'line',
                    occurrence,
                    position,
                    ignored
                }));
            });
            occurrence++;
        }
        if (kind.block) {
            const block = text.match(kind.block);
            if (block) {
                // The plugin tests each raw line with /^\d+$/ before trimming,
                // so an indented number reads as a name; mirror that.
                asText(block[1]).split(/[\r\n]+/).forEach((line, position) => {
                    if (!line.trim()) return;
                    entries.push(Object.assign(resolveToken(line, states, nameIndex), {
                        kind: kindId,
                        form: 'block',
                        occurrence: 0,
                        position,
                        ignored: false
                    }));
                });
            }
        }
        return entries;
    }

    /** Every entry of every listed kind. */
    function parseAll(note, kindIds, states) {
        return kindIds.flatMap(kindId => parseKind(note, kindId, states));
    }

    // ------------------------------------------------------------- writing

    /**
     * Where each tag of `kindId` sits in the note. `tight` covers the tag
     * alone; `whole` widens to the full line when the tag is the only thing
     * on it, so removing it leaves no blank line behind.
     */
    function tagRanges(note, kindId) {
        const kind = KINDS[kindId];
        const text = asText(note);
        const ranges = [];
        const add = (start, end) => {
            let lineStart = text.lastIndexOf('\n', start - 1) + 1;
            let lineEnd = text.indexOf('\n', end);
            if (lineEnd === -1) lineEnd = text.length;
            const alone = !text.slice(lineStart, start).trim() && !text.slice(end, lineEnd).trim();
            let whole = { start, end };
            if (alone) {
                if (lineEnd < text.length) {
                    whole = { start: lineStart, end: lineEnd + 1 };
                } else if (lineStart > 0) {
                    whole = { start: lineStart - 1, end: lineEnd };
                } else {
                    whole = { start: lineStart, end: lineEnd };
                }
            }
            ranges.push({ tight: { start, end }, whole });
        };
        const pattern = new RegExp(kind.pattern.source, 'gi');
        let match;
        while ((match = pattern.exec(text))) add(match.index, match.index + match[0].length);
        if (kind.block) {
            const block = text.match(kind.block);
            if (block) add(block.index, block.index + block[0].length);
        }
        ranges.sort((a, b) => a.tight.start - b.tight.start);
        return ranges;
    }

    /** The tag line the plugin will read for these tokens. */
    function formatTag(kindId, tokens) {
        const kind = KINDS[kindId];
        return `<${kind.tagName(tokens.length)}: ${tokens.join(', ')}>`;
    }

    /**
     * The note with every tag of `kindId` replaced by one consolidated tag
     * carrying `tokens`, in the place the first one held; appended when there
     * was none; removed outright when `tokens` is empty. Tokens are written
     * as given, so an entry the author typed by name stays a name.
     */
    function writeKind(note, kindId, tokens) {
        const text = asText(note);
        const clean = (tokens || []).map(token => asText(token).trim()).filter(Boolean);
        const ranges = tagRanges(text, kindId);
        if (!ranges.length) {
            if (!clean.length) return text;
            const trimmed = text.replace(/\s+$/, '');
            return trimmed ? `${trimmed}\n${formatTag(kindId, clean)}` : formatTag(kindId, clean);
        }
        let result = text;
        for (let i = ranges.length - 1; i >= 0; i--) {
            const range = ranges[i];
            if (i === 0 && clean.length) {
                result = result.slice(0, range.tight.start) + formatTag(kindId, clean) + result.slice(range.tight.end);
            } else {
                result = result.slice(0, range.whole.start) + result.slice(range.whole.end);
            }
        }
        return result;
    }

    /** The tokens of `kindId` currently in the note, ignored tags included. */
    function kindTokens(note, kindId, states) {
        return parseKind(note, kindId, states).map(entry => entry.token);
    }

    /** The note after adding `token` to `kindId`. */
    function addToken(note, kindId, token, states) {
        return writeKind(note, kindId, kindTokens(note, kindId, states).concat([asText(token).trim()]));
    }

    /** The note after removing the entry at `entryIndex` of `kindId`. */
    function removeEntry(note, kindId, entryIndex, states) {
        const tokens = kindTokens(note, kindId, states);
        if (entryIndex < 0 || entryIndex >= tokens.length) return asText(note);
        tokens.splice(entryIndex, 1);
        return writeKind(note, kindId, tokens);
    }

    // ---------------------------------------------------------- trait sets

    /**
     * ElementStatusCore's Trait Set tables from the manifest, keyed the way
     * Scene_Boot.process_VisuMZ_ElementStatusCore_TraitSets keys them: by
     * upper-cased name, with the Default entry reachable as DEFAULT and under
     * its own name. Null when trait sets are off.
     */
    function traitSetTable(manifest) {
        const plugin = enabledPlugin(manifest, 'VisuMZ_1_ElementStatusCore');
        if (!plugin) return null;
        const settings = structParam(plugin, 'TraitSetSettings:struct');
        if (!evalFlag(settings['Enable:eval'], false)) return null;
        const table = {};
        for (const type of TRAIT_TYPES) {
            const struct = structParam(plugin, `${type}:struct`);
            const toSet = entry => ({
                name: asText(entry['Name:str']).trim(),
                passiveStates: numberList(entry['PassiveStates:arraynum']),
                randomValid: evalFlag(entry['RandomValid:eval'], true),
                randomWeight: Number(entry['RandomWeight:num']) || 0
            });
            const defaultSet = toSet(parseStruct(struct['Default:struct']));
            const sets = {};
            sets[defaultSet.name.toUpperCase()] = defaultSet;
            for (const entry of parseArrayStruct(struct['List:arraystruct'])) {
                const set = toSet(entry);
                sets[set.name.toUpperCase()] = set;
            }
            table[type] = {
                type,
                label: asText(struct['Label:str']).trim() || type,
                randomizeActor: evalFlag(struct['RandomizeActor:eval'], false),
                randomizeEnemy: evalFlag(struct['RandomizeEnemy:eval'], false),
                defaultSet,
                sets
            };
        }
        return table;
    }

    /** DataManager.traitSet: the named set, or the type's Default. */
    function lookupTraitSet(typeTable, name) {
        return typeTable.sets[asText(name).toUpperCase().trim()] || typeTable.defaultSet;
    }

    /**
     * The Trait Set candidates a battler built from this note would hold for
     * each type, in the order Game_BattlerBase.initElementStatusCore settles
     * them: randomised from the list when the type's Randomize flag is on,
     * then the <Trait Sets> block, then the singular tags (an
     * `<Element: a/b>` pair last), then the <Random type> blocks. A later
     * step replaces an earlier one, exactly as the runtime overwrites. More
     * than one candidate means the runtime picks at random.
     */
    function assignedTraitSets(note, objectType, table) {
        const text = asText(note);
        const result = {};
        if (!table) return result;
        for (const type of TRAIT_TYPES) result[type] = { candidates: [''], random: false };

        // Game_Actor/Game_Enemy.applyRandomTraitSets.
        if (!/<NO RANDOM TRAIT SETS>/i.test(text)) {
            for (const type of TRAIT_TYPES) {
                const typeTable = table[type];
                const randomize = objectType === 'enemy' ? typeTable.randomizeEnemy : typeTable.randomizeActor;
                if (!randomize) continue;
                const valid = Object.keys(typeTable.sets).filter(key => typeTable.sets[key].randomValid && typeTable.sets[key].randomWeight > 0);
                if (valid.length) result[type] = { candidates: valid.map(key => typeTable.sets[key].name), random: valid.length > 1 };
            }
        }

        // DataManager.getRandomTraitSetFromString: a comma list is random.
        const fromString = value => {
            const parts = asText(value).split(',').map(part => part.trim());
            return { candidates: parts, random: parts.length > 1 };
        };

        // DataManager.makeMassTraitSetFromNotetags.
        const mass = text.match(/<TRAIT SETS>\s*([\s\S]*)\s*<\/TRAIT SETS>/i);
        if (mass) {
            const byUpper = {};
            for (const type of TRAIT_TYPES) byUpper[type.toUpperCase()] = type;
            for (const line of asText(mass[1]).split(/[\r\n]+/)) {
                const pair = line.match(/(.*):[ ](.*)/i);
                if (!pair) continue;
                const type = byUpper[asText(pair[1]).toUpperCase().trim()];
                if (type) result[type] = fromString(pair[2]);
            }
        }

        // DataManager.makeSingularTraitSetFromNotetags.
        for (const type of TRAIT_TYPES) {
            const single = text.match(new RegExp(`<${type.toUpperCase()}:[ ](.*)>`, 'i'));
            if (single) result[type] = fromString(single[1]);
        }
        const pair = text.match(/<ELEMENT:[ ](.*)\/(.*)>/i);
        if (pair) {
            result.Element = { candidates: [asText(pair[1]).trim()], random: false };
            result.SubElement = { candidates: [asText(pair[2]).trim()], random: false };
        }

        // DataManager.makeRandomSingularTraitSetFromNotetags.
        for (const type of TRAIT_TYPES) {
            const block = text.match(new RegExp(`<RANDOM ${type.toUpperCase()}>\\s*([\\s\\S]*)\\s*<\\/RANDOM ${type.toUpperCase()}>`, 'i'));
            if (!block) continue;
            const names = asText(block[1]).split(/[\r\n]+/).filter(line => line !== '').map(line => {
                const weighted = line.match(/(.*):[ ](\d+\.?\d*)/i);
                return weighted ? asText(weighted[1]).trim() : line;
            });
            if (names.length) result[type] = { candidates: names, random: names.length > 1 };
        }
        return result;
    }

    /**
     * The passive states this actor or enemy gets from its Trait Sets
     * (Game_BattlerBase.addPassiveStatesTraitSets), one row per state per
     * candidate set. Empty for the other record types and when trait sets
     * are off.
     */
    function traitSetGrants(manifest, note, objectType) {
        if (objectType !== 'actor' && objectType !== 'enemy') return [];
        const table = traitSetTable(manifest);
        if (!table) return [];
        const assigned = assignedTraitSets(note, objectType, table);
        const rows = [];
        for (const type of TRAIT_TYPES) {
            const typeTable = table[type];
            const { candidates, random } = assigned[type];
            const seen = new Set();
            for (const candidate of candidates) {
                const set = lookupTraitSet(typeTable, candidate);
                if (seen.has(set.name)) continue;
                seen.add(set.name);
                for (const stateId of set.passiveStates) {
                    rows.push({ source: 'traitSet', type, typeLabel: typeTable.label, setName: set.name, random, stateId });
                }
            }
        }
        return rows;
    }

    // ---------------------------------------------------------- parameters

    /**
     * Passives granted by plugin parameters rather than by any record:
     * Skills and States Core's Global list for everyone and its Actor / Enemy
     * lists (Game_Actor/Game_Enemy.addPassiveStatesByPluginParameters), and
     * DA_EquipPassiveSys_EXT's per-actor and per-class learnable lists.
     */
    function parameterGrants(manifest, objectType, recordId) {
        const rows = [];
        const core = enabledPlugin(manifest, 'VisuMZ_1_SkillsStatesCore');
        if (core && (objectType === 'actor' || objectType === 'enemy')) {
            const settings = structParam(core, 'PassiveStates:struct');
            const push = (name, key) => {
                for (const stateId of numberList(settings[key])) {
                    rows.push({ source: 'parameter', plugin: 'VisuMZ_1_SkillsStatesCore', name, kind: 'passive', stateId });
                }
            };
            push('Global', 'Global:arraynum');
            if (objectType === 'actor') push('Actor', 'Actor:arraynum');
            if (objectType === 'enemy') push('Enemy', 'Enemy:arraynum');
        }
        const ext = enabledPlugin(manifest, 'DA_EquipPassiveSys_EXT');
        if (ext && enabledPlugin(manifest, 'VisuMZ_2_EquipPassiveSys')) {
            if (objectType === 'actor') {
                for (const entry of arrayStructParam(ext, 'ActorPassives:arraystruct')) {
                    if (Number(entry['ActorID:num']) !== Number(recordId)) continue;
                    for (const stateId of numberList(entry['PassiveIDs:arraynum'])) {
                        rows.push({ source: 'parameter', plugin: 'DA_EquipPassiveSys_EXT', name: 'Actor Passives', kind: 'learnable', stateId });
                    }
                }
            }
            if (objectType === 'class') {
                for (const entry of arrayStructParam(ext, 'ClassPassives:arraystruct')) {
                    if (Number(entry['ClassID:num']) !== Number(recordId)) continue;
                    for (const stateId of numberList(entry['LearnableIDs:arraynum'])) {
                        rows.push({ source: 'parameter', plugin: 'DA_EquipPassiveSys_EXT', name: 'Class Passives', kind: 'learnable', stateId });
                    }
                }
            }
        }
        return rows;
    }

    /**
     * Passives that reach the same battler from another record that is fixed
     * in the database: an actor's class, and an enemy's action skills
     * (Game_Actor/Game_Enemy.passiveStateObjects). Equipment and learned
     * skills are runtime state and are not guessed at.
     */
    function objectGrants(objectType, record, database) {
        const rows = [];
        const states = database?.states || [];
        const pushFrom = (kindLabel, other) => {
            if (!other) return;
            for (const entry of parseKind(other.note, 'passive', states)) {
                if (!entry.resolved) continue;
                rows.push({ source: 'object', objectType: kindLabel, objectId: other.id, objectName: asText(other.name), stateId: entry.id });
            }
        };
        if (objectType === 'actor') {
            pushFrom('class', (database?.classes || []).find(entry => entry && entry.id === record?.classId));
        }
        if (objectType === 'enemy') {
            const seen = new Set();
            for (const action of record?.actions || []) {
                const skillId = Number(action?.skillId);
                if (!skillId || seen.has(skillId)) continue;
                seen.add(skillId);
                pushFrom('skill', (database?.skills || []).find(entry => entry && entry.id === skillId));
            }
        }
        return rows;
    }

    // ------------------------------------------------------------ analysis

    /** Game_BattlerBase.isPassiveStateStackable: the state opts in by note. */
    function isStackable(state) {
        return !!state && /<PASSIVE STACKABLE>/i.test(asText(state.note));
    }

    /**
     * Everything the section shows for one record: the kinds it may add, the
     * explicit entries with their flags, and the inherited grants. Pure, so a
     * test can check a flag without a DOM.
     */
    function analyze(options) {
        const objectType = options.objectType;
        const record = options.record || {};
        const manifest = options.manifest;
        const database = options.database || {};
        const states = database.states || [];
        const detected = options.detected || detect(manifest);
        const kinds = availableKinds(objectType, detected);
        const note = asText(record.note);

        const inherited = []
            .concat(traitSetGrants(manifest, note, objectType))
            .concat(parameterGrants(manifest, objectType, record.id))
            .concat(objectGrants(objectType, record, database))
            .map(row => Object.assign(row, { kind: row.kind || 'passive', state: stateById(states, row.stateId) }));

        const entries = parseAll(note, kinds, states);
        entries.forEach((entry, index) => {
            const flags = [];
            const stackable = entry.kind === 'passive' && isStackable(entry.state);
            if (!entry.resolved) {
                flags.push({ level: 'error', code: entry.numeric ? 'missing' : 'unknown' });
            } else if (!entry.exists) {
                flags.push({ level: 'error', code: 'missing' });
            }
            if (entry.ignored) {
                flags.push({ level: 'warn', code: 'ignored', tag: `<${KINDS[entry.kind].tagName(1)}>` });
            }
            if (entry.resolved) {
                const earlier = entries.slice(0, index).find(other => other.kind === entry.kind && other.id === entry.id && !other.ignored);
                if (earlier && !entry.ignored) {
                    flags.push({ level: stackable ? 'info' : 'warn', code: stackable ? 'stackable' : 'duplicate' });
                }
                for (const grant of inherited) {
                    if (grant.kind !== entry.kind || grant.stateId !== entry.id) continue;
                    flags.push({ level: stackable ? 'info' : 'warn', code: 'granted', grant });
                }
                if (objectType === 'skill') {
                    const other = entry.kind === 'passive' ? 'equipState' : 'passive';
                    if (entries.some(candidate => candidate.kind === other && candidate.id === entry.id && !candidate.ignored)) {
                        flags.push({ level: 'warn', code: 'crossKind', kind: other });
                    }
                }
            }
            entry.flags = flags;
            entry.stackable = stackable;
        });

        return { objectType, detected, kinds, entries, inherited };
    }

    // ----------------------------------------------------------------- DOM

    const tt = text => (root.I18n ? root.I18n.tText(text) : text);
    // Through a local rather than indexing the table inside the translation
    // call: the i18n audit treats a catalog indexed there as one to inventory
    // whole, plugin names and all.
    const kindLabel = kindId => { const kind = KINDS[kindId]; return tt(kind.label); };
    const escape = text => (typeof root.rrEscapeHtml === 'function'
        ? root.rrEscapeHtml(text)
        : asText(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'));

    /** The manifest the running game will load, through the shared reader. */
    function readManifest(projectManager) {
        const project = projectManager?.getCurrentProject?.();
        if (!project?.path) return null;
        const reader = root.RRTextCodes?.readManifest;
        if (typeof reader !== 'function') return null;
        const plugins = reader(project.path);
        return Array.isArray(plugins) ? plugins : null;
    }

    function databaseSnapshot(databaseManager) {
        const list = name => (typeof databaseManager?.[name] === 'function' ? databaseManager[name]() : null) || [];
        return {
            states: list('getStates'),
            classes: list('getClasses'),
            skills: list('getSkills')
        };
    }

    function stateLabelHtml(state, id) {
        const url = state && root.RRIconCodes && state.iconIndex > 0 ? root.RRIconCodes.iconSetUrl() : '';
        const icon = url
            ? `<span class="rr-icon-code" style="${escape(root.RRIconCodes.cellCss(state.iconIndex, url))}"></span>`
            : '';
        const name = state ? escape(state.name) : '';
        return `<span style="color: var(--color-text-muted);">#${escape(String(id).padStart(4, '0'))}</span> ${icon}${name}`;
    }

    function grantSourceText(grant) {
        if (grant.source === 'traitSet') {
            const random = grant.random ? ` (${tt('Random')})` : '';
            return `${tt('Trait Set')}: ${grant.typeLabel} › ${grant.setName}${random}`;
        }
        if (grant.source === 'parameter') {
            return `${tt('Plugin parameter')}: ${grant.plugin} › ${grant.name}`;
        }
        if (grant.source === 'object') {
            return `${tt(grant.objectType === 'class' ? 'Class' : 'Skill')}: ${grant.objectName}`;
        }
        return '';
    }

    function flagText(flag) {
        switch (flag.code) {
            case 'missing': return tt('Missing state');
            case 'unknown': return tt('Unknown state name');
            case 'ignored': return tt('Only the first {tag} tag is read').replace('{tag}', flag.tag);
            case 'duplicate': return tt('Duplicate');
            case 'stackable': return tt('Stackable');
            case 'granted': return tt('Also granted by {source}').replace('{source}', grantSourceText(flag.grant));
            case 'crossKind': return tt('Also listed as {kind}').replace('{kind}', kindLabel(flag.kind));
            default: return '';
        }
    }

    const FLAG_COLORS = {
        error: 'var(--color-danger-bright)',
        warn: 'var(--color-warning)',
        info: 'var(--color-text-muted)'
    };

    /**
     * The Passive States card for one record, or null when the project does
     * not enable Skills and States Core (or has no readable manifest).
     *
     *   RRPassiveStates.createSection({
     *       objectType: 'enemy', record: enemy,
     *       databaseManager, projectManager
     *   })
     *
     * The card edits the record's Note textarea - found by its data-field and
     * data-<type>-id attributes once the editor has attached it - and fires a
     * `change` event on it, so the editor's own field listener persists the
     * note the way it persists a typed one. Typing in the textarea refreshes
     * the card.
     */
    function createSection(options) {
        if (typeof document === 'undefined') return null;
        const { objectType, record, databaseManager, projectManager } = options;
        if (!OBJECT_TYPES.includes(objectType) || !record) return null;
        const manifest = options.manifest !== undefined ? options.manifest : readManifest(projectManager);
        const detected = detect(manifest);
        if (!detected.skillsStatesCore) return null;

        const section = document.createElement('div');
        section.className = 'database-section passive-states-section';
        section.setAttribute('tabindex', '0');
        section.style.outline = 'none';
        section.innerHTML = `
            <div class="database-section-header">${tt('Passive States')}</div>
            <div class="database-section-content">
                <table class="traits-table passive-states-table">
                    <thead>
                        <tr>
                            <th style="width: 3px; padding: 0; border: none; background: transparent;"></th>
                            <th>${tt('Kind')}</th>
                            <th>${tt('State')}</th>
                            <th>${tt('Notes')}</th>
                        </tr>
                    </thead>
                    <tbody></tbody>
                </table>
                <div style="margin-top: 6px; font-size: 11px; color: var(--color-text-muted);">${tt('Stored in the Note as notetags.')}</div>
                <div class="trait-action-buttons">
                    <button type="button" class="passive-btn-add rr-btn-chip">${tt('Add')}</button>
                    <button type="button" class="passive-btn-delete rr-btn-chip" disabled>${tt('Delete')}</button>
                </div>
            </div>
        `;

        const tbody = section.querySelector('tbody');
        const addButton = section.querySelector('.passive-btn-add');
        const deleteButton = section.querySelector('.passive-btn-delete');
        let selected = null;
        let noteField = null;
        let analysis = null;

        const findNoteField = () => {
            if (noteField && noteField.isConnected) return noteField;
            const selector = `textarea[data-field="note"][data-${objectType}-id="${record.id}"]`;
            noteField = section.parentElement?.closest?.('#database-detail')?.querySelector(selector)
                || document.querySelector(selector);
            return noteField;
        };
        const currentNote = () => {
            const field = findNoteField();
            return field ? field.value : asText(record.note);
        };
        const commitNote = note => {
            record.note = note;
            const field = findNoteField();
            if (field) {
                field.value = note;
                field.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (typeof options.onNoteChange === 'function') {
                options.onNoteChange(note);
            }
            render();
        };

        const render = () => {
            const database = databaseSnapshot(databaseManager);
            analysis = analyze({ objectType, record: Object.assign({}, record, { note: currentNote() }), manifest, database, detected });
            const rows = [];
            analysis.entries.forEach((entry, index) => {
                const notes = entry.flags.map(flag => `<span style="color: ${FLAG_COLORS[flag.level]};">${escape(flagText(flag))}</span>`).join('<br>');
                const label = entry.resolved
                    ? stateLabelHtml(entry.state, entry.id)
                    : `<span style="color: ${FLAG_COLORS.error};">${escape(entry.token)}</span>`;
                const muted = entry.ignored ? ' opacity: 0.6;' : '';
                rows.push(`
                    <tr class="trait-row passive-row" data-entry-index="${index}" style="cursor: pointer;${muted}">
                        <td class="trait-indicator" style="width: 3px; padding: 0; border: none; background: transparent;"></td>
                        <td>${escape(kindLabel(entry.kind))}</td>
                        <td>${label}</td>
                        <td style="font-size: 11px;">${notes}</td>
                    </tr>
                `);
            });
            analysis.inherited.forEach(grant => {
                rows.push(`
                    <tr class="passive-inherited-row" style="opacity: 0.65; font-style: italic;">
                        <td style="width: 3px; padding: 0; border: none; background: transparent;"></td>
                        <td>${escape(grantSourceText(grant))}</td>
                        <td>${stateLabelHtml(grant.state, grant.stateId)}</td>
                        <td style="font-size: 11px;">${grant.state ? '' : `<span style="color: ${FLAG_COLORS.error};">${escape(tt('Missing state'))}</span>`}</td>
                    </tr>
                `);
            });
            tbody.innerHTML = rows.length
                ? rows.join('')
                : `<tr><td style="width: 3px; padding: 0; border: none; background: transparent;"></td><td colspan="3" style="text-align: center; color: var(--color-text-muted); font-style: italic; padding: 12px;">${tt('No passive states')}</td></tr>`;
            selected = null;
            updateButtons();
            tbody.querySelectorAll('.passive-row').forEach(row => {
                // The same hover and selection treatment the trait tables use.
                row.addEventListener('mouseenter', () => paintRow(row, true));
                row.addEventListener('mouseleave', () => { if (row !== selected) paintRow(row, false); });
                row.addEventListener('click', () => select(row));
            });
        };

        const paintRow = (row, on) => {
            const indicator = row.querySelector('.trait-indicator');
            if (indicator) indicator.style.setProperty('background-color', on ? 'var(--color-accent-bright)' : 'transparent', 'important');
            row.querySelectorAll('td:not(.trait-indicator)').forEach(cell => {
                cell.style.setProperty('background-color', on ? 'var(--color-bg-panel)' : '', 'important');
            });
        };
        const select = row => {
            tbody.querySelectorAll('.passive-row').forEach(other => {
                other.classList.remove('selected');
                paintRow(other, false);
            });
            selected = row;
            if (row) {
                row.classList.add('selected');
                paintRow(row, true);
                section.focus();
            }
            updateButtons();
        };
        const updateButtons = () => {
            deleteButton.disabled = !selected;
            addButton.disabled = !analysis || !analysis.kinds.length;
        };

        const removeSelected = () => {
            if (!selected || !analysis) return;
            const entry = analysis.entries[Number(selected.dataset.entryIndex)];
            if (!entry) return;
            const database = databaseSnapshot(databaseManager);
            const index = analysis.entries.filter(other => other.kind === entry.kind).indexOf(entry);
            commitNote(removeEntry(currentNote(), entry.kind, index, database.states));
        };

        addButton.addEventListener('click', () => {
            if (!analysis || !analysis.kinds.length) return;
            openAddDialog({
                kinds: analysis.kinds,
                states: databaseSnapshot(databaseManager).states,
                onPick: (kindId, stateId) => {
                    const database = databaseSnapshot(databaseManager);
                    commitNote(addToken(currentNote(), kindId, String(stateId), database.states));
                }
            });
        });
        deleteButton.addEventListener('click', removeSelected);
        section.addEventListener('keydown', event => {
            if (event.key === 'Delete' && selected) {
                event.preventDefault();
                removeSelected();
            }
        });

        // The editor attaches the Note textarea in the same pass; hook it
        // once the card is in the document.
        setTimeout(() => {
            const field = findNoteField();
            if (field) {
                let timer = null;
                field.addEventListener('input', () => {
                    clearTimeout(timer);
                    timer = setTimeout(render, 150);
                });
            }
            render();
        }, 0);
        render();
        return section;
    }

    /** The Add dialog: a kind (when more than one applies) and a state. */
    function openAddDialog(options) {
        const kinds = options.kinds || [];
        const states = (options.states || []).filter(state => state && state.id > 0);
        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay';
        const modal = document.createElement('div');
        modal.className = 'rr-modal passive-state-dialog';
        modal.style.cssText = 'width: 460px; max-width: 92vw;';
        const kindOptions = kinds.map((id, index) =>
            `<option value="${id}" ${index === 0 ? 'selected' : ''}>${escape(kindLabel(id))}</option>`).join('');
        modal.innerHTML = `
            <div class="rr-modal-header">
                <div class="rr-modal-title">${tt('Add Passive State')}</div>
                <button class="rr-modal-close passive-dialog-close" type="button">&times;</button>
            </div>
            <div class="rr-modal-body">
                <div class="db-form">
                    ${kinds.length > 1 ? `<label>${tt('Kind')}</label><select class="database-field-value passive-dialog-kind">${kindOptions}</select>` : ''}
                    <label>${tt('State')}</label>
                    <input type="text" class="database-field-value passive-dialog-filter" placeholder="${escape(tt('Search...'))}">
                </div>
                <div class="passive-dialog-list" style="margin-top: 8px; max-height: 280px; overflow-y: auto; border: 1px solid var(--color-border-input); border-radius: 3px; background: var(--color-bg-surface);"></div>
            </div>
            <div class="rr-modal-footer">
                <button type="button" class="passive-dialog-cancel rr-btn-secondary">${tt('Cancel')}</button>
                <button type="button" class="passive-dialog-ok rr-button-primary" disabled>${tt('OK')}</button>
            </div>
        `;
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const list = modal.querySelector('.passive-dialog-list');
        const filter = modal.querySelector('.passive-dialog-filter');
        const okButton = modal.querySelector('.passive-dialog-ok');
        const kindSelect = modal.querySelector('.passive-dialog-kind');
        let chosen = null;

        const close = () => overlay.remove();
        const confirm = () => {
            if (!chosen) return;
            const kindId = kindSelect ? kindSelect.value : kinds[0];
            close();
            options.onPick(kindId, chosen);
        };
        const paint = () => {
            const needle = filter.value.trim().toLowerCase();
            const visible = states.filter(state => !needle
                || String(state.id).includes(needle)
                || asText(state.name).toLowerCase().includes(needle));
            list.innerHTML = visible.map(state => `
                <div class="passive-dialog-row" data-state-id="${state.id}" style="padding: 4px 8px; cursor: pointer; display: flex; align-items: center; gap: 6px;${state.id === chosen ? ' background: var(--color-accent-bright); color: var(--color-accent-on);' : ''}">
                    ${stateLabelHtml(state, state.id)}
                </div>
            `).join('') || `<div style="padding: 8px; color: var(--color-text-muted); font-style: italic;">${tt('None')}</div>`;
            list.querySelectorAll('.passive-dialog-row').forEach(row => {
                row.addEventListener('click', () => {
                    chosen = Number(row.dataset.stateId);
                    okButton.disabled = false;
                    paint();
                });
                row.addEventListener('dblclick', () => {
                    chosen = Number(row.dataset.stateId);
                    confirm();
                });
            });
        };

        filter.addEventListener('input', paint);
        filter.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                const first = list.querySelector('.passive-dialog-row');
                if (first && !chosen) chosen = Number(first.dataset.stateId);
                confirm();
            }
            if (event.key === 'Escape') close();
        });
        modal.querySelector('.passive-dialog-close').addEventListener('click', close);
        modal.querySelector('.passive-dialog-cancel').addEventListener('click', close);
        okButton.addEventListener('click', confirm);
        // A click on the backdrop does not close the dialog: close deliberately.
        paint();
        setTimeout(() => filter.focus(), 0);
        return overlay;
    }

    const api = {
        OBJECT_TYPES,
        TRAIT_TYPES,
        KINDS,
        KIND_ORDER,
        enabledPlugin,
        structParam,
        detect,
        availableKinds,
        parseKind,
        parseAll,
        tagRanges,
        formatTag,
        writeKind,
        addToken,
        removeEntry,
        traitSetTable,
        assignedTraitSets,
        traitSetGrants,
        parameterGrants,
        objectGrants,
        isStackable,
        analyze,
        readManifest,
        createSection,
        openAddDialog
    };

    root.RRPassiveStates = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
