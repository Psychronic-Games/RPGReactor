/**
 * QuestImporter - reads another quest system's data into Reactor quests.
 *
 * Most quest systems are the same shape: a title, who gives it and where, a
 * description, objectives and rewards that can start hidden. Three are read:
 * VisuStella's Quest System stores its quests four JSON layers deep inside
 * one plugin parameter; Yanfly's Quest Journal keeps one JSON struct per
 * "Quest N" parameter; GS_QuestSystem keeps a data/Quests.json of its own.
 * Each comes back as plain Reactor records - keys intact where the source
 * has them, otherwise a key that names the source and its id - so an event
 * that named a quest keeps naming it. Reading writes nothing: the Quests
 * tab decides what to keep. When the tab makes VisuStella's Quest System the
 * game's quest log, syncQuestLog writes the quests back into that plugin.
 */
class QuestImporter {
    /** The sources an importer knows, by id, in the order the dialog lists them. */
    static SOURCES = {
        visustella: { plugin: 'VisuMZ_2_QuestSystem', label: 'VisuStella Quest System' },
        yanfly: { plugin: 'YEP_QuestJournal', label: 'Yanfly Quest Journal' },
        gs: { plugin: 'GS_QuestSystem', file: 'data/Quests.json', label: 'GS Quest System' }
    };

    /** The project's plugin manifest, as the runtime resolves it. */
    static manifestPath(projectPath) {
        const fs = require('fs');
        const path = require('path');
        const reactor = path.join(projectPath, 'js', 'reactor_plugins.js');
        if (fs.existsSync(path.join(projectPath, 'js', 'reactor_main.js')) && fs.existsSync(reactor)) return reactor;
        return path.join(projectPath, 'js', 'plugins.js');
    }

    /** The `$plugins` array of a manifest file, or [] when it cannot be read. */
    static readManifest(projectPath) {
        const fs = require('fs');
        try {
            const text = fs.readFileSync(QuestImporter.manifestPath(projectPath), 'utf8');
            return QuestImporter.parseManifest(text);
        } catch (error) {
            return [];
        }
    }

    static parseManifest(text) {
        const match = String(text || '').match(/\$plugins\s*=\s*(\[[\s\S]*\]);?\s*$/);
        if (!match) return [];
        try {
            const list = JSON.parse(match[1]);
            return Array.isArray(list) ? list : [];
        } catch (error) {
            return [];
        }
    }

    /** The VisuStella plugin's entry in a manifest, if any. */
    static visustellaEntry(plugins) {
        return (plugins || []).find(plugin => plugin && plugin.name === QuestImporter.SOURCES.visustella.plugin) || null;
    }

    /** One JSON layer: a string holding JSON becomes its value; anything else passes through. */
    static layer(value) {
        if (typeof value !== 'string') return value;
        try { return JSON.parse(value); } catch (error) { return value; }
    }

    /** A note[] entry: the plugin stores each as a JSON string of the text. */
    static noteList(value) {
        const list = QuestImporter.layer(value);
        if (!Array.isArray(list)) return [];
        return list.map(entry => {
            const text = QuestImporter.layer(entry);
            return typeof text === 'string' ? text : String(entry == null ? '' : entry);
        });
    }

    /** number[] entries arrive as strings; 1-based in the plugin. */
    static numberList(value) {
        const list = QuestImporter.layer(value);
        if (!Array.isArray(list)) return [];
        return list.map(Number).filter(n => Number.isFinite(n));
    }

    /** A struct's field by its declared name, with or without the `:type` suffix. */
    static field(struct, name) {
        if (!struct || typeof struct !== 'object') return undefined;
        const key = Object.keys(struct).find(k => k === name || k.split(':')[0] === name);
        return key === undefined ? undefined : struct[key];
    }

    /** Text-code-free text for names and categories, keeping icons as codes. */
    static clean(text) {
        return String(text == null ? '' : text).replace(/\\\\/g, '\\').trim();
    }

    /**
     * A title's leading `\I[n]` as the quest's icon, and the title after it.
     * These plugins have no icon field, so the convention is to write the
     * icon into the title; Reactor draws `iconIndex` directly in front of the
     * name, so lifting it out reads the same in game and gives the Quests
     * tab's icon box and list something to show. Anything after the code,
     * spaces included, stays as written, and an icon later in a title stays put.
     */
    static leadingIcon(title) {
        const text = String(title == null ? '' : title);
        const match = /^\\I\[(\d+)\]/i.exec(text);
        return match ? { iconIndex: Number(match[1]), text: text.slice(match[0].length) } : { iconIndex: 0, text };
    }

    /**
     * The quest-system plugins a project has enabled, in dialog order, as
     * `{ source, label }`. Only the manifest's names and switches are read,
     * never the quests, and the answer is cached on the manifest's mtime, so
     * the Quests tab can ask on every render.
     */
    static enabledSystems(projectPath) {
        const fs = require('fs');
        const file = QuestImporter.manifestPath(projectPath);
        let stamp;
        try {
            stamp = fs.statSync(file).mtimeMs;
        } catch (error) {
            QuestImporter._systems = [];
            QuestImporter._enabledKey = '';
            return [];
        }
        const cacheKey = `${file}|${stamp}`;
        if (QuestImporter._enabledKey !== cacheKey) {
            const plugins = QuestImporter.readManifest(projectPath);
            QuestImporter._systems = Object.keys(QuestImporter.SOURCES)
                .map(source => ({ source, entry: plugins.find(plugin => plugin && plugin.name === QuestImporter.SOURCES[source].plugin) }))
                .filter(found => found.entry)
                .map(found => ({ source: found.source, label: QuestImporter.SOURCES[found.source].label, enabled: found.entry.status !== false }));
            QuestImporter._enabledKey = cacheKey;
        }
        return QuestImporter._systems.filter(entry => entry.enabled).map(entry => ({ source: entry.source, label: entry.label }));
    }

    /** Every quest-system plugin in the manifest, on or off, as { source, label, enabled }; cached like enabledSystems. */
    static installedSystems(projectPath) {
        QuestImporter.enabledSystems(projectPath);
        return (QuestImporter._systems || []).map(entry => Object.assign({}, entry));
    }

    /**
     * The quests of a VisuStella `Categories` parameter value (the raw
     * string from the manifest, or an already-parsed array), as Reactor
     * records without ids. Order is the plugin's: category by category.
     */
    static fromVisustellaCategories(value, knownKeys) {
        const categories = QuestImporter.layer(value);
        const known = new Set((knownKeys || []).map(key => String(key).toUpperCase().trim()));
        const quests = [];
        if (!Array.isArray(categories)) return quests;
        for (const rawCategory of categories) {
            const category = QuestImporter.layer(rawCategory);
            const categoryName = QuestImporter.clean(QuestImporter.field(category, 'CategoryName'));
            const list = QuestImporter.layer(QuestImporter.field(category, 'Quests'));
            if (!Array.isArray(list)) continue;
            for (const rawQuest of list) {
                const quest = QuestImporter.layer(rawQuest);
                if (!quest || typeof quest !== 'object') continue;
                const record = QuestImporter.fromVisustellaQuest(quest, categoryName);
                // Known at the start of a game in the plugin: appears at the start here.
                if (record.key && known.has(record.key.toUpperCase())) record.activation.type = 'start';
                quests.push(record);
            }
        }
        return quests;
    }

    static fromVisustellaQuest(struct, categoryName) {
        const descriptions = QuestImporter.noteList(QuestImporter.field(struct, 'Description'));
        const objectiveTexts = QuestImporter.noteList(QuestImporter.field(struct, 'Objectives'));
        const visibleObjectives = QuestImporter.numberList(QuestImporter.field(struct, 'VisibleObjectives'));
        const rewardTexts = QuestImporter.noteList(QuestImporter.field(struct, 'Rewards'));
        const visibleRewards = QuestImporter.numberList(QuestImporter.field(struct, 'VisibleRewards'));
        const subtexts = QuestImporter.noteList(QuestImporter.field(struct, 'Subtext'));
        const quotes = QuestImporter.noteList(QuestImporter.field(struct, 'Quotes'));
        const title = QuestImporter.clean(QuestImporter.field(struct, 'Title'));
        const key = QuestImporter.clean(QuestImporter.field(struct, 'Key'));
        const noteLines = [];
        // VisuStella keeps several descriptions, subtexts and quotes per
        // quest and switches between them by plugin command. Reactor shows
        // one of each; the rest are kept in the note so nothing is lost.
        if (descriptions.length > 1) noteLines.push('<Import: other descriptions>', ...descriptions.slice(1), '</Import>');
        if (subtexts.filter(Boolean).length > 1) noteLines.push('<Import: other subtexts>', ...subtexts.slice(1), '</Import>');
        if (quotes.filter(Boolean).length > 1) noteLines.push('<Import: other quotes>', ...quotes.slice(1), '</Import>');
        const onLoad = QuestImporter.layer(QuestImporter.field(struct, 'OnLoadQuestJS'));
        if (typeof onLoad === 'string' && onLoad.trim() && !/^\/\/ Insert JavaScript code here\.?$/.test(onLoad.trim())) {
            noteLines.push('<Import: on-load script>', onLoad, '</Import>');
        }
        return {
            name: QuestImporter.leadingIcon(title).text || key || 'Quest',
            key: key || '',
            category: categoryName,
            iconIndex: QuestImporter.leadingIcon(title).iconIndex,
            difficulty: QuestImporter.clean(QuestImporter.field(struct, 'Difficulty')),
            from: QuestImporter.clean(QuestImporter.field(struct, 'From')),
            location: QuestImporter.clean(QuestImporter.field(struct, 'Location')),
            description: QuestImporter.clean(descriptions[0] || ''),
            objectives: objectiveTexts.map((text, index) => ({
                text: QuestImporter.clean(text), hidden: !visibleObjectives.includes(index + 1), switchId: 0
            })),
            rewards: rewardTexts.map((text, index) => ({
                text: QuestImporter.clean(text), hidden: !visibleRewards.includes(index + 1)
            })),
            subtext: QuestImporter.clean(subtexts.find(Boolean) || ''),
            quotes: QuestImporter.clean(quotes.find(Boolean) || ''),
            activation: { type: 'command', switchId: 0, variableId: 0, operator: '>=', value: 0 },
            completion: { type: 'command', switchId: 0 },
            note: noteLines.join('\n')
        };
    }

    /**
     * Everything importable from a project's VisuStella plugin: the quest
     * records and where they came from, or `null` when the plugin is not in
     * the manifest at all.
     */
    static readVisustella(projectPath) {
        const plugins = QuestImporter.readManifest(projectPath);
        const entry = QuestImporter.visustellaEntry(plugins);
        if (!entry) return null;
        const params = entry.parameters || {};
        const raw = params['Categories:arraystruct'] !== undefined ? params['Categories:arraystruct'] : params.Categories;
        return {
            source: 'visustella',
            enabled: entry.status !== false,
            quests: QuestImporter.fromVisustellaCategories(raw, QuestImporter.visustellaKnownKeys(params))
        };
    }

    // --- Yanfly Quest Journal -------------------------------------------

    /** The plugin's entry in a manifest, if any. */
    static yanflyEntry(plugins) {
        return (plugins || []).find(plugin => plugin && plugin.name === QuestImporter.SOURCES.yanfly.plugin) || null;
    }

    /**
     * The quests of a YEP_QuestJournal parameter set: one "Quest N" struct
     * per slot, in slot order. An untouched slot (no title, no text) is not
     * a quest. Yanfly names quests by number in its plugin commands, so the
     * slot number becomes the key and is kept in the note.
     */
    static fromYanflyParameters(params) {
        const quests = [];
        if (!params || typeof params !== 'object') return quests;
        const slots = Object.keys(params)
            .map(key => ({ key, n: Number((key.match(/^Quest (\d+)$/) || [])[1]) }))
            .filter(slot => slot.n > 0)
            .sort((a, b) => a.n - b.n);
        for (const slot of slots) {
            const struct = QuestImporter.layer(params[slot.key]);
            if (!struct || typeof struct !== 'object') continue;
            const record = QuestImporter.fromYanflyQuest(struct, slot.n);
            if (record) quests.push(record);
        }
        return quests;
    }

    static fromYanflyQuest(struct, number) {
        const title = QuestImporter.clean(QuestImporter.field(struct, 'Title'));
        const descriptions = QuestImporter.noteList(QuestImporter.field(struct, 'Description'));
        const objectiveTexts = QuestImporter.noteList(QuestImporter.field(struct, 'Objectives List'));
        if (!title && !descriptions.some(Boolean) && !objectiveTexts.some(Boolean)) return null;
        const visibleObjectives = QuestImporter.numberList(QuestImporter.field(struct, 'Visible Objectives'));
        const rewardTexts = QuestImporter.noteList(QuestImporter.field(struct, 'Rewards List'));
        const visibleRewards = QuestImporter.numberList(QuestImporter.field(struct, 'Visible Rewards'));
        const subtexts = QuestImporter.noteList(QuestImporter.field(struct, 'Subtext'));
        const noteLines = [`<Import: YEP_QuestJournal quest ${number}>`];
        if (descriptions.length > 1) noteLines.push('<Import: other descriptions>', ...descriptions.slice(1), '</Import>');
        if (subtexts.filter(Boolean).length > 1) noteLines.push('<Import: other subtexts>', ...subtexts.slice(1), '</Import>');
        return {
            name: QuestImporter.leadingIcon(title).text || `Quest ${number}`,
            key: `yep${number}`,
            category: QuestImporter.clean(QuestImporter.field(struct, 'Type')),
            iconIndex: QuestImporter.leadingIcon(title).iconIndex,
            difficulty: QuestImporter.clean(QuestImporter.field(struct, 'Difficulty')),
            from: QuestImporter.clean(QuestImporter.field(struct, 'From')),
            location: QuestImporter.clean(QuestImporter.field(struct, 'Location')),
            description: QuestImporter.clean(descriptions[0] || ''),
            objectives: objectiveTexts.map((text, index) => ({
                text: QuestImporter.clean(text), hidden: !visibleObjectives.includes(index + 1), switchId: 0
            })),
            rewards: rewardTexts.map((text, index) => ({
                text: QuestImporter.clean(text), hidden: !visibleRewards.includes(index + 1)
            })),
            subtext: QuestImporter.clean(subtexts.find(Boolean) || ''),
            quotes: '',
            activation: { type: 'command', switchId: 0, variableId: 0, operator: '>=', value: 0 },
            completion: { type: 'command', switchId: 0 },
            note: noteLines.join('\n')
        };
    }

    static readYanfly(projectPath) {
        const entry = QuestImporter.yanflyEntry(QuestImporter.readManifest(projectPath));
        if (!entry) return null;
        return { source: 'yanfly', enabled: entry.status !== false, quests: QuestImporter.fromYanflyParameters(entry.parameters || {}) };
    }

    // --- GS_QuestSystem -------------------------------------------------

    /** Whether a parsed data/Quests.json is GS_QuestSystem's: a category list first, then quests. */
    static isGsData(data) {
        return Array.isArray(data) && data.length > 0 && Array.isArray(data[0])
            && data.slice(1).every(entry => entry === null || (entry && typeof entry === 'object' && !Array.isArray(entry)));
    }

    /**
     * The quests of a GS_QuestSystem file. A step is
     * [text, tracksVariable, variableId, maxValue, autoComplete, status, visible];
     * the plugin shows only the first step when a quest starts, whatever the
     * file says, so every later objective starts hidden. A reward is
     * [kind, idOrAmount, count, hidden] (a custom reward carries its text
     * in the count slot); `names(kind, id)` turns an item,
     * weapon or armor id into its name when the caller has the database.
     */
    static fromGsData(data, names) {
        const quests = [];
        if (!QuestImporter.isGsData(data)) return quests;
        const categories = data[0].map(name => QuestImporter.clean(name));
        for (const entry of data.slice(1)) {
            if (!entry || typeof entry !== 'object') continue;
            const id = Number(entry.id);
            const steps = Array.isArray(entry.steps) ? entry.steps : [];
            const rewards = Array.isArray(entry.rewards) ? entry.rewards : [];
            const noteLines = [`<Import: GS_QuestSystem quest ${id}>`];
            steps.forEach((step, index) => {
                if (Array.isArray(step) && step[1] === true) {
                    noteLines.push(`<Import: objective ${index + 1} tracks variable ${Number(step[2]) || 0} to ${Number(step[3]) || 0}>`);
                }
            });
            quests.push({
                name: QuestImporter.clean(entry.name) || `Quest ${id}`,
                key: `gs${id}`,
                category: categories[Number(entry.cat)] || '',
                iconIndex: Number(entry.icon) || 0,
                difficulty: '',
                from: '',
                location: '',
                description: QuestImporter.clean(entry.desc),
                objectives: steps.map((step, index) => ({
                    text: QuestImporter.clean(Array.isArray(step) ? step[0] : step), hidden: index > 0, switchId: 0
                })),
                rewards: rewards.map(reward => ({
                    text: QuestImporter.gsRewardText(reward, names), hidden: Array.isArray(reward) && reward[3] === true
                })),
                subtext: '',
                quotes: '',
                activation: { type: 'command', switchId: 0, variableId: 0, operator: '>=', value: 0 },
                completion: { type: 'command', switchId: 0 },
                note: noteLines.join('\n')
            });
        }
        return quests;
    }

    static gsRewardText(reward, names) {
        if (!Array.isArray(reward)) return QuestImporter.clean(reward);
        const [kind, value, count] = reward;
        const amount = Number(value) || 0;
        switch (kind) {
            case 'xp': return `${amount} EXP`;
            case 'gold': return `${amount} Gold`;
            case 'item': case 'weapon': case 'armor': {
                const name = (typeof names === 'function' && names(kind, amount)) || `${kind} #${amount}`;
                const n = Number(count) || 1;
                return n > 1 ? `${name} x${n}` : name;
            }
            // A custom reward is free text in the third slot.
            case 'custom': return QuestImporter.clean(count !== undefined ? count : value);
            default: return QuestImporter.clean([kind, value, count].filter(v => v !== undefined).join(' '));
        }
    }

    /** The GS file of a project, parsed, or null when absent or not GS's. */
    static readGsFile(projectPath) {
        const fs = require('fs');
        const path = require('path');
        try {
            const data = JSON.parse(fs.readFileSync(path.join(projectPath, QuestImporter.SOURCES.gs.file), 'utf8'));
            return QuestImporter.isGsData(data) ? data : null;
        } catch (error) {
            return null;
        }
    }

    static readGs(projectPath) {
        const data = QuestImporter.readGsFile(projectPath);
        if (!data) return null;
        const fs = require('fs');
        const path = require('path');
        const tables = {};
        const names = (kind, id) => {
            const file = { item: 'Items.json', weapon: 'Weapons.json', armor: 'Armors.json' }[kind];
            if (!file) return '';
            if (!(file in tables)) {
                try { tables[file] = JSON.parse(fs.readFileSync(path.join(projectPath, 'data', file), 'utf8')); } catch (error) { tables[file] = null; }
            }
            const record = tables[file] && tables[file][id];
            return record && record.name ? String(record.name) : '';
        };
        const entry = QuestImporter.readManifest(projectPath).find(plugin => plugin && plugin.name === QuestImporter.SOURCES.gs.plugin);
        return { source: 'gs', enabled: !!entry && entry.status !== false, quests: QuestImporter.fromGsData(data, names) };
    }

    // --- any source -----------------------------------------------------

    /** Everything importable from one source, or null when it is not in the project. */
    static read(projectPath, source) {
        switch (source) {
            case 'visustella': return QuestImporter.readVisustella(projectPath);
            case 'yanfly': return QuestImporter.readYanfly(projectPath);
            case 'gs': return QuestImporter.readGs(projectPath);
            default: return null;
        }
    }

    /**
     * Every known source with whether this project has it and how many
     * quests it holds, in dialog order. A source that is not present still
     * appears, so the dialog can say so.
     */
    static available(projectPath) {
        return Object.keys(QuestImporter.SOURCES).map(source => {
            const found = QuestImporter.read(projectPath, source);
            return {
                source,
                label: QuestImporter.SOURCES[source].label,
                present: !!found,
                enabled: !!found && found.enabled,
                count: found ? found.quests.length : 0
            };
        });
    }

    // --- writing VisuStella's Quest System ----------------------------------

    /** The quest keys the plugin's General settings make known at the start of a game. */
    static visustellaKnownKeys(params) {
        const general = QuestImporter.layer((params || {})['General:struct']);
        const list = QuestImporter.layer(QuestImporter.field(general, 'KnownQuests'));
        return Array.isArray(list) ? list.map(key => String(key)) : [];
    }

    /** A quest's key in the plugin: its own, or one made from its id (reactor_quests.js makes the same). */
    static visustellaKeyOf(quest) {
        const key = String((quest && quest.key) || '').trim();
        return key || 'ReactorQuest' + (quest ? quest.id : 0);
    }

    /** A note[] parameter value from a list of texts. */
    static noteParam(texts) {
        return JSON.stringify(texts.map(text => JSON.stringify(String(text == null ? '' : text))));
    }

    /**
     * A plugin text list with Reactor's one text put back where the importer
     * took it from - the first entry for a description, the first non-empty
     * one for a subtext or quote - keeping every other entry, which are the
     * alternates the plugin switches to by command.
     */
    static mergeTexts(previous, text, firstNonEmpty) {
        const list = QuestImporter.noteList(previous);
        const value = String(text == null ? '' : text);
        if (!list.length && !value) return '[]';
        let at = firstNonEmpty ? list.findIndex(Boolean) : 0;
        if (at < 0) at = 0;
        list[at] = value;
        return QuestImporter.noteParam(list);
    }

    /**
     * One Reactor quest as the plugin's quest struct. Fields Reactor has no
     * place for - alternate texts, the on-load script, anything a later
     * version adds - are kept from the struct the plugin held for this key.
     */
    static toVisustellaQuest(quest, previous) {
        const base = previous && typeof previous === 'object' ? previous : {};
        const kept = (name, fallback) => (base[name] !== undefined ? base[name] : fallback);
        const icon = Number(quest.iconIndex) > 0 ? '\\i[' + Number(quest.iconIndex) + ']' : '';
        const objectives = Array.isArray(quest.objectives) ? quest.objectives : [];
        const rewards = Array.isArray(quest.rewards) ? quest.rewards : [];
        const texts = entries => QuestImporter.noteParam(entries.map(entry => (entry && entry.text) || ''));
        const visible = entries => JSON.stringify(entries
            .map((entry, index) => (entry && !entry.hidden ? String(index + 1) : null))
            .filter(Boolean));
        const struct = {
            'Key:str': QuestImporter.visustellaKeyOf(quest),
            'Header': kept('Header', ''),
            'Title:str': icon + String(quest.name || ''),
            'Difficulty:str': String(quest.difficulty || ''),
            'From:str': String(quest.from || ''),
            'Location:str': String(quest.location || ''),
            'Description:arrayjson': QuestImporter.mergeTexts(base['Description:arrayjson'], quest.description, false),
            'Lists': kept('Lists', ''),
            'Objectives:arrayjson': texts(objectives),
            'VisibleObjectives:arraynum': visible(objectives),
            'Rewards:arrayjson': texts(rewards),
            'VisibleRewards:arraynum': visible(rewards),
            'Footer': kept('Footer', ''),
            'Subtext:arrayjson': QuestImporter.mergeTexts(base['Subtext:arrayjson'], quest.subtext, true),
            'Quotes:arrayjson': QuestImporter.mergeTexts(base['Quotes:arrayjson'], quest.quotes, true),
            'JavaScript': kept('JavaScript', ''),
            'OnLoadQuestJS:func': kept('OnLoadQuestJS:func', JSON.stringify('// Insert JavaScript code here.'))
        };
        for (const name of Object.keys(base)) if (!(name in struct)) struct[name] = base[name];
        return struct;
    }

    /**
     * The plugin's Categories parameter for a set of Reactor quests: one
     * category per Reactor category, in the order the plugin already had them
     * and then in the order new ones first appear, each quest built over what
     * the plugin held for its key. Quests and categories no longer here are
     * dropped: with this log chosen, the Quests tab is the source.
     */
    static toVisustellaCategories(quests, previousValue) {
        const previous = QuestImporter.layer(previousValue);
        const oldCategories = [];
        const oldQuests = new Map();
        for (const raw of Array.isArray(previous) ? previous : []) {
            const category = QuestImporter.layer(raw);
            if (!category || typeof category !== 'object') continue;
            oldCategories.push(category);
            const list = QuestImporter.layer(QuestImporter.field(category, 'Quests'));
            for (const rawQuest of Array.isArray(list) ? list : []) {
                const struct = QuestImporter.layer(rawQuest);
                if (!struct || typeof struct !== 'object') continue;
                const key = String(QuestImporter.field(struct, 'Key') || '').toUpperCase().trim();
                if (key && !oldQuests.has(key)) oldQuests.set(key, struct);
            }
        }
        const groups = new Map();
        for (const quest of quests || []) {
            if (!quest) continue;
            const name = String(quest.category || '').trim() || 'Quests';
            if (!groups.has(name)) groups.set(name, []);
            groups.get(name).push(QuestImporter.toVisustellaQuest(quest, oldQuests.get(QuestImporter.visustellaKeyOf(quest).toUpperCase())));
        }
        const nameOf = category => String(QuestImporter.field(category, 'CategoryName') || '').trim();
        const order = oldCategories.map(nameOf).filter((name, index, all) => groups.has(name) && all.indexOf(name) === index);
        for (const name of groups.keys()) if (!order.includes(name)) order.push(name);
        return JSON.stringify(order.map(name => {
            const kept = oldCategories.find(category => nameOf(category) === name);
            const category = kept ? Object.assign({}, kept) : { 'CategoryName:str': name };
            category['Quests:arraystruct'] = JSON.stringify(groups.get(name).map(struct => JSON.stringify(struct)));
            return JSON.stringify(category);
        }));
    }

    /**
     * Carry Database > Quests' choice of in-game quest log into the plugin
     * list. "visustella": the Quest System is turned on, its quest list
     * becomes these quests, and the ones that appear at the start of the game
     * become the ones it knows at the start. "reactor": it is turned off, so
     * the game has one log. No choice yet, no such plugin in the manifest, or
     * nothing that would change: the file is left alone. The rest of the
     * manifest is written back as the Plugin Manager writes it.
     */
    static syncQuestLog(projectPath, quests, setting) {
        const mode = setting && setting.log;
        if (mode !== 'visustella' && mode !== 'reactor') return { ok: true, changed: false };
        const fs = require('fs');
        const file = QuestImporter.manifestPath(projectPath);
        if (!fs.existsSync(file)) return { ok: true, changed: false };
        const text = fs.readFileSync(file, 'utf8');
        const plugins = QuestImporter.parseManifest(text);
        const entry = QuestImporter.visustellaEntry(plugins);
        if (!entry) return { ok: true, changed: false };
        const before = JSON.stringify(entry);
        if (mode === 'reactor') {
            entry.status = false;
        } else {
            entry.status = true;
            if (!entry.parameters || typeof entry.parameters !== 'object') entry.parameters = {};
            const params = entry.parameters;
            params['Categories:arraystruct'] = QuestImporter.toVisustellaCategories(quests, params['Categories:arraystruct']);
            const general = QuestImporter.layer(params['General:struct']);
            if (general && typeof general === 'object') {
                general['KnownQuests:arraystr'] = JSON.stringify((quests || [])
                    .filter(quest => quest && quest.activation && quest.activation.type === 'start')
                    .map(quest => QuestImporter.visustellaKeyOf(quest)));
                params['General:struct'] = JSON.stringify(general);
            }
        }
        if (JSON.stringify(entry) === before) return { ok: true, changed: false };
        const at = text.search(/var\s+\$plugins\s*=/);
        const header = at > 0 ? text.slice(0, at) : '';
        const temp = file + '.tmp';
        fs.writeFileSync(temp, header + 'var $plugins =\n' + JSON.stringify(plugins, null, 4) + ';\n', 'utf8');
        fs.renameSync(temp, file);
        return { ok: true, changed: true };
    }

    /** A key nobody else has: the wanted one, or it with a number after it. */
    static uniqueKey(wanted, taken) {
        const base = String(wanted || '').trim() || 'quest';
        if (!taken.has(base)) return base;
        let n = 2;
        while (taken.has(`${base}${n}`)) n++;
        return `${base}${n}`;
    }
}

if (typeof globalThis !== 'undefined') globalThis.QuestImporter = QuestImporter;
if (typeof module !== 'undefined' && module.exports) module.exports = QuestImporter;
