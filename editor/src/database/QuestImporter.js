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
 * that named a quest keeps naming it. Nothing is written here: the Quests
 * tab decides what to keep.
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
            return [];
        }
        const cacheKey = `${file}|${stamp}`;
        if (QuestImporter._enabledKey !== cacheKey) {
            const plugins = QuestImporter.readManifest(projectPath);
            QuestImporter._enabled = Object.keys(QuestImporter.SOURCES)
                .filter(source => plugins.some(plugin => plugin && plugin.name === QuestImporter.SOURCES[source].plugin && plugin.status !== false))
                .map(source => ({ source, label: QuestImporter.SOURCES[source].label }));
            QuestImporter._enabledKey = cacheKey;
        }
        return QuestImporter._enabled.map(entry => Object.assign({}, entry));
    }

    /**
     * The quests of a VisuStella `Categories` parameter value (the raw
     * string from the manifest, or an already-parsed array), as Reactor
     * records without ids. Order is the plugin's: category by category.
     */
    static fromVisustellaCategories(value) {
        const categories = QuestImporter.layer(value);
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
                quests.push(QuestImporter.fromVisustellaQuest(quest, categoryName));
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
            quests: QuestImporter.fromVisustellaCategories(raw)
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
