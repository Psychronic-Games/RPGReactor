/**
 * DatabaseQuestEditor - Database > Quests.
 *
 * A quest is a record in data/ReactorQuests.json (Reactor's own file, beside the
 * MZ database): who gives it and where, a description, objectives and
 * rewards that can start hidden, and the rules that make it appear and
 * complete. The runtime (reactor_quests.js) reads this shape as it is.
 */
class DatabaseQuestEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
        this._pickers = null;
    }

    _t(text, params) {
        let value = window.I18n ? window.I18n.tText(text) : text;
        for (const [key, replacement] of Object.entries(params || {})) value = value.split(`{${key}}`).join(String(replacement));
        return value;
    }

    _project() {
        const own = this.projectManager && this.projectManager.getCurrentProject
            ? this.projectManager.getCurrentProject() : (this.projectManager && this.projectManager.currentProject);
        return own || (this.parentEditor && this.parentEditor.currentProject) || null;
    }

    /** A record with every field the runtime may read, old or new. */
    static normalize(quest) {
        if (!quest) return quest;
        quest.name = quest.name || '';
        quest.key = quest.key || '';
        quest.category = quest.category || '';
        quest.iconIndex = Number(quest.iconIndex) || 0;
        quest.difficulty = quest.difficulty || '';
        quest.from = quest.from || '';
        quest.location = quest.location || '';
        quest.description = quest.description || '';
        quest.objectives = Array.isArray(quest.objectives) ? quest.objectives : [];
        quest.rewards = Array.isArray(quest.rewards) ? quest.rewards : [];
        quest.subtext = quest.subtext || '';
        quest.quotes = quest.quotes || '';
        quest.activation = Object.assign({ type: 'command', switchId: 0, variableId: 0, operator: '>=', value: 0 }, quest.activation || {});
        quest.completion = Object.assign({ type: 'command', switchId: 0 }, quest.completion || {});
        quest.note = quest.note || '';
        return quest;
    }

    /** The project's quest log settings, stored on System.json. */
    settings() {
        const system = this.databaseManager.getSystem() || {};
        if (!system.reactorQuests || typeof system.reactorQuests !== 'object') system.reactorQuests = {};
        const stored = system.reactorQuests;
        if (stored.menuCommand === undefined) stored.menuCommand = true;
        if (!stored.commandName) stored.commandName = 'Quests';
        return stored;
    }

    switchName(id) {
        const list = (this.databaseManager.getSystem() || {}).switches || [];
        return id > 0 ? `#${String(id).padStart(4, '0')}${list[id] ? ' ' + list[id] : ''}` : this._t('(none)');
    }

    variableName(id) {
        const list = (this.databaseManager.getSystem() || {}).variables || [];
        return id > 0 ? `#${String(id).padStart(4, '0')}${list[id] ? ' ' + list[id] : ''}` : this._t('(none)');
    }

    iconHtml(index) {
        const codes = window.RRIconCodes;
        if (!codes || !(index > 0)) return `<span style="display:inline-block;width:32px;height:32px;border:1px dashed var(--color-border);border-radius:3px;"></span>`;
        return `<span class="rr-icon-code" style="${rrEscapeHtml(codes.cellCss(index, codes.iconSetUrl(), 32))}"></span>`;
    }

    /** Lines an objective or reward box opens at: every line of its text, up to eight. */
    rowsFor(text) {
        return Math.max(1, Math.min(8, String(text == null ? '' : text).split('\n').length));
    }

    /**
     * The other quest systems this project has enabled, by label. Each runs a
     * quest log of its own, with its own quests and progress, so an author
     * should know these records are not what that log shows.
     */
    otherQuestSystems() {
        const project = this._project();
        if (!project || !project.path || typeof QuestImporter === 'undefined' || !QuestImporter.enabledSystems) return [];
        return QuestImporter.enabledSystems(project.path).map(entry => this._t(entry.label));
    }

    showQuestDetail(container, quest) {
        const tt = text => this._t(text);
        DatabaseQuestEditor.normalize(quest);
        const settings = this.settings();
        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'database-detail-wrapper db-page';

        // The quest log's own settings and the importer sit above every quest:
        // they are the project's, not this record's.
        const others = this.otherQuestSystems();
        const strip = document.createElement('div');
        strip.className = 'database-section';
        strip.innerHTML = `
            <div class="database-section-header">${tt('Quest Log')}</div>
            <div class="database-section-content"><div class="db-form">
                <div class="db-row-cols">
                    <span class="db-col">
                        <label>${tt('Show in the main menu')}</label>
                        <input type="checkbox" class="system-checkbox" data-quest-setting="menuCommand" ${settings.menuCommand !== false ? 'checked' : ''}>
                    </span>
                    <span class="db-col">
                        <label>${tt('Menu command name')}</label>
                        <input type="text" class="database-field-value" data-quest-setting="commandName" value="${rrEscapeHtml(settings.commandName)}">
                    </span>
                    <span class="db-col" style="align-self:end;">
                        <button type="button" class="rr-btn-secondary quest-import" title="${rrEscapeHtml(tt('Read the quests another plugin stores in this project and add them here.'))}">${tt('Import…')}</button>
                    </span>
                </div>
                ${others.map(label => `<div class="quest-other-system" style="grid-column:1 / -1;margin-top:6px;font-size:12px;color:var(--color-text-muted);">${rrEscapeHtml(this._t('{source} is also enabled. It runs its own quest log, with its own quests and progress: these quests do not appear in it, and its plugin commands do not change them.', { source: label }))}</div>`).join('')}
            </div></div>`;
        wrapper.appendChild(strip);

        const grid = document.createElement('div');
        grid.className = 'db-page-grid';

        // Every text the log draws goes through drawTextEx, so each of these
        // takes text codes and shows a preview line once it carries one.
        const general = document.createElement('div');
        general.className = 'database-section';
        general.innerHTML = `
            <div class="database-section-header">${tt('General')}</div>
            <div class="database-section-content"><div class="db-general-grid">
                <div style="display:flex;flex-direction:column;align-items:center;gap:6px;">
                    <label style="font-size:11px;color:var(--color-text-muted);font-weight:600;">${tt('Icon')}</label>
                    <div class="quest-icon" style="cursor:pointer;" title="${rrEscapeHtml(tt('Click to choose an icon'))}">${this.iconHtml(quest.iconIndex)}</div>
                </div>
                <div class="db-form db-fill">
                    <div class="db-row-cols">
                        <span class="db-col"><label>${tt('Name')}</label><input type="text" class="database-field-value" value="${rrEscapeHtml(quest.name)}" data-field="name" data-quest-id="${quest.id}" data-rr-textcodes="help" data-rr-textcodes-preview></span>
                        <span class="db-col"><label>${tt('Key')}</label><input type="text" class="database-field-value" value="${rrEscapeHtml(quest.key)}" data-field="key" data-quest-id="${quest.id}" placeholder="${rrEscapeHtml(tt('for scripts and imports'))}"></span>
                    </div>
                    <div class="db-row-cols">
                        <span class="db-col"><label>${tt('Category')}</label><input type="text" class="database-field-value" value="${rrEscapeHtml(quest.category)}" data-field="category" data-quest-id="${quest.id}" data-rr-textcodes="help" data-rr-textcodes-preview list="quest-categories-${quest.id}"><datalist id="quest-categories-${quest.id}">${this.categoryOptions()}</datalist></span>
                        <span class="db-col"><label>${tt('Difficulty')}</label><input type="text" class="database-field-value" value="${rrEscapeHtml(quest.difficulty)}" data-field="difficulty" data-quest-id="${quest.id}" data-rr-textcodes="help" data-rr-textcodes-preview></span>
                    </div>
                    <div class="db-row-cols">
                        <span class="db-col"><label>${tt('From')}</label><input type="text" class="database-field-value" value="${rrEscapeHtml(quest.from)}" data-field="from" data-quest-id="${quest.id}" data-rr-textcodes="help" data-rr-textcodes-preview></span>
                        <span class="db-col"><label>${tt('Location')}</label><input type="text" class="database-field-value" value="${rrEscapeHtml(quest.location)}" data-field="location" data-quest-id="${quest.id}" data-rr-textcodes="help" data-rr-textcodes-preview></span>
                    </div>
                </div>
            </div></div>`;
        grid.appendChild(general);

        const rules = document.createElement('div');
        rules.className = 'database-section';
        rules.innerHTML = `
            <div class="database-section-header">${tt('Rules')}</div>
            <div class="database-section-content"><div class="db-form">
                <div class="db-row-cols">
                    <span class="db-col">
                        <label>${tt('Appears')}</label>
                        <select class="database-field-value" data-field="activation.type" data-quest-id="${quest.id}">
                            ${this.options([['command', tt('Only by event command')], ['start', tt('At the start of the game')], ['switch', tt('When a switch is ON')], ['variable', tt('When a variable reaches a value')]], quest.activation.type)}
                        </select>
                    </span>
                    <span class="db-col quest-when-switch" ${quest.activation.type === 'switch' ? '' : 'hidden'}>
                        <label>${tt('Switch')}</label>
                        <button type="button" class="rr-btn-secondary quest-pick" data-pick="switch" data-target="activation.switchId">${rrEscapeHtml(this.switchName(quest.activation.switchId))}</button>
                    </span>
                    <span class="db-col quest-when-variable" ${quest.activation.type === 'variable' ? '' : 'hidden'}>
                        <label>${tt('Variable')}</label>
                        <button type="button" class="rr-btn-secondary quest-pick" data-pick="variable" data-target="activation.variableId">${rrEscapeHtml(this.variableName(quest.activation.variableId))}</button>
                    </span>
                    <span class="db-col quest-when-variable" ${quest.activation.type === 'variable' ? '' : 'hidden'}>
                        <label>${tt('Is')}</label>
                        <select class="database-field-value" data-field="activation.operator" data-quest-id="${quest.id}">
                            ${this.options([['>=', '≥'], ['==', '='], ['<=', '≤'], ['>', '>'], ['<', '<'], ['!=', '≠']], quest.activation.operator)}
                        </select>
                    </span>
                    <span class="db-col quest-when-variable" ${quest.activation.type === 'variable' ? '' : 'hidden'}>
                        <label>${tt('Value')}</label>
                        <input type="number" class="database-field-value" value="${rrEscapeHtml(quest.activation.value)}" data-field="activation.value" data-quest-id="${quest.id}">
                    </span>
                </div>
                <div class="db-row-cols">
                    <span class="db-col">
                        <label>${tt('Completes')}</label>
                        <select class="database-field-value" data-field="completion.type" data-quest-id="${quest.id}">
                            ${this.options([['command', tt('Only by event command')], ['objectives', tt('When every shown objective is complete')], ['switch', tt('When a switch is ON')]], quest.completion.type)}
                        </select>
                    </span>
                    <span class="db-col quest-done-switch" ${quest.completion.type === 'switch' ? '' : 'hidden'}>
                        <label>${tt('Switch')}</label>
                        <button type="button" class="rr-btn-secondary quest-pick" data-pick="switch" data-target="completion.switchId">${rrEscapeHtml(this.switchName(quest.completion.switchId))}</button>
                    </span>
                </div>
            </div></div>`;
        grid.appendChild(rules);

        const description = document.createElement('div');
        description.className = 'database-section';
        description.innerHTML = `
            <div class="database-section-header">${tt('Description')}</div>
            <div class="database-section-content"><div class="db-form">
                <div class="db-row-cols">
                    <span class="db-col">
                        <label>${tt('Description')}</label>
                        <textarea class="database-field-value" rows="5" data-field="description" data-quest-id="${quest.id}" data-rr-textcodes="help" data-rr-textcodes-preview>${rrEscapeHtml(quest.description)}</textarea>
                        <div data-rr-textcodes-panel="help" style="margin-top:4px;"></div>
                    </span>
                </div>
            </div></div>`;
        grid.appendChild(description);

        grid.appendChild(this.listSection(quest, 'objectives', tt('Objectives'), tt('Add Objective')));
        grid.appendChild(this.listSection(quest, 'rewards', tt('Rewards'), tt('Add Reward')));

        const more = document.createElement('div');
        more.className = 'database-section';
        more.innerHTML = `
            <div class="database-section-header">${tt('Extra Text')}</div>
            <div class="database-section-content"><div class="db-form">
                <div class="db-row-cols">
                    <span class="db-col"><label>${tt('Subtext')}</label><textarea class="database-field-value" rows="3" data-field="subtext" data-quest-id="${quest.id}" data-rr-textcodes="help" data-rr-textcodes-preview>${rrEscapeHtml(quest.subtext)}</textarea></span>
                </div>
                <div class="db-row-cols">
                    <span class="db-col"><label>${tt('Quotes')}</label><textarea class="database-field-value" rows="3" data-field="quotes" data-quest-id="${quest.id}" data-rr-textcodes="help" data-rr-textcodes-preview>${rrEscapeHtml(quest.quotes)}</textarea></span>
                </div>
            </div></div>`;
        grid.appendChild(more);

        const note = document.createElement('div');
        note.className = 'database-section';
        note.innerHTML = `
            <div class="database-section-header">${tt('Note')}</div>
            <div class="database-section-content"><div class="db-form">
                <div class="db-row-cols">
                    <span class="db-col">
                        <label>${tt('Note')}</label>
                        <textarea class="database-field-value" rows="4" data-field="note" data-quest-id="${quest.id}">${rrEscapeHtml(quest.note)}</textarea>
                    </span>
                </div>
            </div></div>`;
        grid.appendChild(note);

        wrapper.appendChild(grid);
        container.appendChild(wrapper);
        this.attachListeners(container, quest);
    }

    options(pairs, current) {
        return pairs.map(([value, label]) => `<option value="${rrEscapeHtml(value)}"${String(value) === String(current) ? ' selected' : ''}>${rrEscapeHtml(label)}</option>`).join('');
    }

    categoryOptions() {
        const seen = new Set();
        for (const quest of this.databaseManager.getQuests()) {
            const name = String((quest && quest.category) || '').trim();
            if (name) seen.add(name);
        }
        return Array.from(seen).map(name => `<option value="${rrEscapeHtml(name)}"></option>`).join('');
    }

    /**
     * Objectives and rewards: a row each, in the order the player sees them.
     * The text is a box rather than a one-line input: a text input strips
     * line breaks from its value, and an imported objective often has them,
     * so the first edit of such a row used to write the breaks away.
     */
    listSection(quest, kind, title, addLabel) {
        const tt = text => this._t(text);
        const section = document.createElement('div');
        section.className = 'database-section';
        section.dataset.questList = kind;
        const rows = (quest[kind] || []).map((entry, index) => `
            <div class="quest-row" data-index="${index}" style="display:grid;grid-template-columns:22px minmax(0,1fr) auto auto auto auto;gap:8px;align-items:center;">
                <span style="color:var(--color-text-muted);font-size:11px;text-align:right;">${index + 1}.</span>
                <div style="display:flex;flex-direction:column;gap:2px;min-width:0;">
                    <textarea class="database-field-value quest-row-text" rows="${this.rowsFor(entry && entry.text)}" style="width:100%;min-width:0;resize:vertical;" data-list="${kind}" data-index="${index}" data-prop="text" data-rr-textcodes="help" data-rr-textcodes-preview>${rrEscapeHtml(entry && entry.text ? entry.text : '')}</textarea>
                </div>
                <label style="display:flex;align-items:center;gap:4px;font-size:11px;white-space:nowrap;color:var(--color-text-muted);" title="${rrEscapeHtml(tt('Not shown until an event command or a switch reveals it.'))}">
                    <input type="checkbox" class="system-checkbox" ${entry && entry.hidden ? 'checked' : ''} data-list="${kind}" data-index="${index}" data-prop="hidden">${tt('Hidden at first')}
                </label>
                ${kind === 'objectives' ? `<button type="button" class="rr-btn-secondary quest-pick" data-pick="switch" data-target="objectives.${index}.switchId" style="font-size:11px;" title="${rrEscapeHtml(tt('Completes on its own when this switch turns ON.'))}">${rrEscapeHtml(entry && entry.switchId > 0 ? this.switchName(entry.switchId) : tt('Switch…'))}</button>` : '<span></span>'}
                <span style="display:flex;gap:2px;">
                    <button type="button" class="rr-btn-secondary quest-move" data-list="${kind}" data-index="${index}" data-dir="-1" title="${rrEscapeHtml(tt('Move up'))}">▲</button>
                    <button type="button" class="rr-btn-secondary quest-move" data-list="${kind}" data-index="${index}" data-dir="1" title="${rrEscapeHtml(tt('Move down'))}">▼</button>
                </span>
                <button type="button" class="rr-btn-secondary quest-remove" data-list="${kind}" data-index="${index}" title="${rrEscapeHtml(tt('Remove'))}">✕</button>
            </div>`).join('');
        section.innerHTML = `
            <div class="database-section-header" style="display:flex;align-items:center;gap:8px;"><span style="flex:1;">${title}</span>
                <button type="button" class="rr-btn-secondary quest-add" data-list="${kind}">${addLabel}</button></div>
            <div class="database-section-content"><div class="quest-list" style="display:flex;flex-direction:column;gap:6px;padding:4px 0;">${rows || `<div style="color:var(--color-text-muted);font-size:12px;">${kind === 'objectives' ? tt('No objectives yet. A quest with none completes only by event command.') : tt('No rewards listed.')}</div>`}</div></div>`;
        return section;
    }

    /**
     * Wire the text-code menus, reference panel and previews again after this
     * editor re-renders itself. DatabaseEditorUI decorates once per selection,
     * so a row added, moved or removed here - or a rule changed - came back as
     * plain fields. The detach handle stays on the parent, which owns it.
     */
    decorateTextCodes(container) {
        const parent = this.parentEditor;
        if (typeof window === 'undefined' || !window.RRDatabaseTextCodes || !parent) return;
        if (parent._textCodeDetach) parent._textCodeDetach();
        parent._textCodeDetach = window.RRDatabaseTextCodes.decorate(container, {
            projectPath: () => ((this._project() || {}).path) || '',
            databaseManager: this.databaseManager,
            projectController: { getCurrentProject: () => this._project() }
        });
    }

    attachListeners(container, quest) {
        const rerender = () => {
            this.showQuestDetail(container, this.databaseManager.getQuest(quest.id) || quest);
            this.decorateTextCodes(container);
        };
        container.querySelectorAll('[data-field][data-quest-id]').forEach(field => {
            field.addEventListener('change', event => {
                const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
                this.updateQuestField(quest.id, event.target.dataset.field, value);
                if (event.target.dataset.field === 'activation.type' || event.target.dataset.field === 'completion.type') rerender();
                if (event.target.dataset.field === 'name') this.parentEditor.refreshDatabaseListEntry?.(quest, 'quests');
            });
        });
        container.querySelectorAll('[data-quest-setting]').forEach(field => {
            field.addEventListener('change', event => {
                const settings = this.settings();
                const key = event.target.dataset.questSetting;
                settings[key] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
                if (key === 'commandName' && !settings.commandName.trim()) settings.commandName = 'Quests';
                this.databaseManager.mutationGeneration++;
            });
        });
        container.querySelectorAll('[data-list][data-prop]').forEach(field => {
            field.addEventListener('change', event => {
                const { list, index, prop } = event.target.dataset;
                const entries = quest[list] || [];
                const entry = entries[Number(index)];
                if (!entry) return;
                entry[prop] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
                this.databaseManager.updateQuest(quest.id, quest);
            });
        });
        // A row's box grows with its text, so no line hides behind a scrollbar.
        container.querySelectorAll('.quest-row-text').forEach(field => {
            field.addEventListener('input', () => { field.rows = this.rowsFor(field.value); });
        });
        container.querySelectorAll('.quest-add').forEach(button => button.addEventListener('click', () => {
            const kind = button.dataset.list;
            quest[kind] = quest[kind] || [];
            quest[kind].push(kind === 'objectives' ? { text: '', hidden: false, switchId: 0 } : { text: '', hidden: false });
            this.databaseManager.updateQuest(quest.id, quest);
            rerender();
            const last = container.querySelector(`[data-list="${kind}"][data-prop="text"][data-index="${quest[kind].length - 1}"]`);
            if (last) last.focus();
        }));
        container.querySelectorAll('.quest-remove').forEach(button => button.addEventListener('click', () => {
            const { list, index } = button.dataset;
            (quest[list] || []).splice(Number(index), 1);
            this.databaseManager.updateQuest(quest.id, quest);
            rerender();
        }));
        container.querySelectorAll('.quest-move').forEach(button => button.addEventListener('click', () => {
            const { list, index, dir } = button.dataset;
            const entries = quest[list] || [];
            const from = Number(index);
            const to = from + Number(dir);
            if (to < 0 || to >= entries.length) return;
            [entries[from], entries[to]] = [entries[to], entries[from]];
            this.databaseManager.updateQuest(quest.id, quest);
            rerender();
        }));
        container.querySelectorAll('.quest-pick').forEach(button => button.addEventListener('click', () => {
            const kind = button.dataset.pick;
            const target = button.dataset.target;
            const current = this.readPath(quest, target);
            this.pickSwitchOrVariable(kind, current, id => {
                this.writePath(quest, target, id);
                this.databaseManager.updateQuest(quest.id, quest);
                button.textContent = kind === 'switch' ? this.switchName(id) : this.variableName(id);
                if (target.startsWith('objectives.') && !(id > 0)) button.textContent = this._t('Switch…');
            });
        }));
        const icon = container.querySelector('.quest-icon');
        if (icon) icon.addEventListener('click', () => {
            if (!this.parentEditor || !this.parentEditor.showIconPicker) return;
            // The picker loads whatever sheet it is handed; without the
            // project's, it reported IconSet.png missing on every project.
            const project = this._project();
            const picker = typeof window !== 'undefined' ? window.RRIconPicker : null;
            const sheet = project && project.path && picker && picker.iconSetPathFor ? picker.iconSetPathFor(project.path) : null;
            this.parentEditor.showIconPicker(quest.iconIndex || 0, index => {
                quest.iconIndex = index;
                this.databaseManager.updateQuest(quest.id, quest);
                icon.innerHTML = this.iconHtml(index);
                this.parentEditor.refreshDatabaseListEntry?.(quest, 'quests');
            }, sheet);
        });
        const importButton = container.querySelector('.quest-import');
        if (importButton) importButton.addEventListener('click', () => this.importQuests());
    }

    readPath(object, path) {
        return path.split('.').reduce((value, part) => (value == null ? undefined : value[part]), object);
    }

    writePath(object, path, value) {
        const parts = path.split('.');
        let target = object;
        for (const part of parts.slice(0, -1)) {
            if (target[part] == null) target[part] = /^\d+$/.test(part) ? [] : {};
            target = target[part];
        }
        target[parts[parts.length - 1]] = value;
    }

    pickSwitchOrVariable(kind, current, callback) {
        if (typeof SwitchVariablePicker === 'undefined') {
            const typed = window.prompt(this._t(kind === 'switch' ? 'Switch number (0 for none)' : 'Variable number (0 for none)'), String(current || 0));
            if (typed !== null) callback(Math.max(0, parseInt(typed, 10) || 0));
            return;
        }
        if (!this._pickers) this._pickers = new SwitchVariablePicker(this.databaseManager, this.projectManager);
        this._pickers.show(kind, current || 1, id => callback(Number(id) || 0));
    }

    updateQuestField(questId, fieldName, value) {
        const quest = this.databaseManager.getQuest(questId);
        if (!quest) return;
        DatabaseQuestEditor.normalize(quest);
        if (fieldName === 'activation.value') value = parseInt(value, 10) || 0;
        if (fieldName === 'key') value = String(value || '').trim();
        this.writePath(quest, fieldName, value);
        this.databaseManager.updateQuest(questId, quest);
        return this.readPath(quest, fieldName);
    }

    /** Ask which quest system to read from, then add the quests this database lacks. */
    importQuests() {
        const project = this._project();
        if (!project || !project.path || typeof QuestImporter === 'undefined') return;
        const sources = QuestImporter.available(project.path);
        this.showImportDialog(sources, source => this.importFrom(source));
    }

    /**
     * The source picker: one row per quest system the importer knows, with
     * how many quests it holds here or that it is not in this project. Only
     * a present source can be chosen; the first one with quests is preselected.
     */
    showImportDialog(sources, onImport) {
        const tt = text => this._t(text);
        document.querySelectorAll('.quest-import-overlay').forEach(node => node.remove());
        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay quest-import-overlay';
        overlay.style.cssText = 'position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 10500;';
        const preselected = sources.find(entry => entry.present && entry.count > 0) || sources.find(entry => entry.present) || null;
        const rows = sources.map(entry => {
            const detail = entry.present
                ? tt('{count} quest(s) found').replace('{count}', String(entry.count))
                : tt('not in this project');
            const disabled = entry.present ? '' : ' disabled';
            const checked = preselected && preselected.source === entry.source ? ' checked' : '';
            return `<label class="quest-import-row" style="display: grid; grid-template-columns: auto 1fr auto; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 6px; cursor: ${entry.present ? 'pointer' : 'default'}; opacity: ${entry.present ? '1' : '0.55'};">
                <input type="radio" name="quest-import-source" value="${rrEscapeHtml(entry.source)}"${checked}${disabled}>
                <span>${rrEscapeHtml(tt(entry.label))}</span>
                <span style="font-size: 12px; opacity: 0.75;">${rrEscapeHtml(detail)}</span>
            </label>`;
        }).join('');
        overlay.innerHTML = `
            <div class="rr-modal" role="dialog" aria-modal="true" style="width: min(440px, calc(100vw - 24px)); background: var(--color-bg-panel); border: 1px solid var(--color-border-subtle); border-radius: 8px; box-shadow: 0 12px 40px rgba(0,0,0,0.45);">
                <div class="rr-modal-header" style="padding: 14px 18px; border-bottom: 1px solid var(--color-border-subtle); display: flex; align-items: center; justify-content: space-between;">
                    <div class="rr-modal-title" style="font-size: 16px; font-weight: 600;">${rrEscapeHtml(tt('Import Quests'))}</div>
                    <button type="button" class="rr-modal-close" aria-label="${rrEscapeHtml(tt('Cancel'))}" style="background: none; border: none; font-size: 18px; cursor: pointer; color: inherit;">×</button>
                </div>
                <div class="rr-modal-body" style="padding: 14px 18px; display: flex; flex-direction: column; gap: 4px;">
                    <div style="font-size: 12px; opacity: 0.8; margin-bottom: 8px;">${rrEscapeHtml(tt('Choose the quest system to read from. Only the quests this database lacks are added, matched by key.'))}</div>
                    ${rows}
                </div>
                <div class="rr-modal-footer" style="padding: 12px 18px; border-top: 1px solid var(--color-border-subtle); display: flex; justify-content: flex-end; gap: 8px;">
                    <button type="button" class="rr-btn-secondary quest-import-cancel">${rrEscapeHtml(tt('Cancel'))}</button>
                    <button type="button" class="rr-btn-chip quest-import-ok" style="padding: 6px 18px; color: var(--color-accent-bright);"${preselected ? '' : ' disabled'}>${rrEscapeHtml(tt('Import'))}</button>
                </div>
            </div>`;
        const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey, true); };
        const chosen = () => {
            const input = overlay.querySelector('input[name="quest-import-source"]:checked');
            return input && !input.disabled ? input.value : null;
        };
        const ok = overlay.querySelector('.quest-import-ok');
        const confirm = () => {
            const source = chosen();
            if (!source) return;
            close();
            onImport(source);
        };
        const onKey = event => {
            if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
            else if (event.key === 'Enter' && !ok.disabled) { event.preventDefault(); event.stopPropagation(); confirm(); }
        };
        overlay.querySelectorAll('input[name="quest-import-source"]').forEach(input => {
            input.addEventListener('change', () => { ok.disabled = !chosen(); });
        });
        overlay.querySelector('.rr-modal-close').addEventListener('click', close);
        overlay.querySelector('.quest-import-cancel').addEventListener('click', close);
        ok.addEventListener('click', confirm);
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(overlay);
        this.commonUI?.databaseEditor?.registerDetailModal(overlay);
        const first = overlay.querySelector('input[name="quest-import-source"]:checked') || ok;
        if (first && first.focus) first.focus();
        return overlay;
    }

    /** Read one source's quests and add the ones this database lacks, matched by key. */
    importFrom(source) {
        const project = this._project();
        if (!project || !project.path || typeof QuestImporter === 'undefined') return;
        const label = this._t((QuestImporter.SOURCES[source] || {}).label || source);
        const found = QuestImporter.read(project.path, source);
        const say = message => window.alert ? window.alert(message) : console.log(message);
        if (!found) return say(this._t('{source} is not in this project.', { source: label }));
        if (!found.quests.length) return say(this._t('{source} has no quests to import.', { source: label }));
        const existing = this.databaseManager.getQuests();
        const taken = new Set(existing.map(quest => quest && quest.key).filter(Boolean));
        const fresh = found.quests.filter(quest => !quest.key || !taken.has(quest.key));
        if (!fresh.length) return say(this._t('Every quest from {source} is already here (matched by key).', { source: label }));
        const skipped = found.quests.length - fresh.length;
        const question = this._t('Import {count} quest(s) from {source}?', { count: fresh.length, source: label })
            + (skipped ? ' ' + this._t('{count} already here will be left alone.', { count: skipped }) : '');
        if (!window.confirm(question)) return;
        let last = null;
        for (const record of fresh) {
            record.key = QuestImporter.uniqueKey(record.key || record.name, taken);
            taken.add(record.key);
            last = this.databaseManager.addQuest(record);
        }
        if (this.parentEditor && this.parentEditor.openDatabase) {
            this.parentEditor.openDatabase('quests');
            if (last && this.parentEditor.showDatabaseDetail) this.parentEditor.showDatabaseDetail(last, 'quests');
        }
    }
}

if (typeof globalThis !== 'undefined') globalThis.DatabaseQuestEditor = DatabaseQuestEditor;
if (typeof module !== 'undefined' && module.exports) module.exports = DatabaseQuestEditor;
