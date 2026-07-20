/**
 * CommonEventEditor - Editor for Common Event event command (code 117)
 */
class CommonEventEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.targetType = 'commonEvent';
        this.designation = 'direct';
        this.commonEventId = 1;
        this.commonEventVariableId = 1;
        this.mapEventId = 1;
        this.mapPageNumber = 1;
        this.mapEventVariableId = 1;
        this.mapPageVariableId = 1;
    }

    /**
     * Show editor for a common event command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     */
    show(command, callback) {
        this.callback = callback;

        this.resetToDefaults();
        if (command) this.parseCommand(command);

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    resetToDefaults() {
        this.targetType = 'commonEvent';
        this.designation = 'direct';
        this.commonEventId = 1;
        this.commonEventVariableId = 1;
        this.mapEventId = 1;
        this.mapPageNumber = 1;
        this.mapEventVariableId = 1;
        this.mapPageVariableId = 1;
    }

    parseCommand(command) {
        if (command.code === 117 && Array.isArray(command.parameters)) {
            this.commonEventId = command.parameters[0] ?? 1;
            return true;
        }

        const codec = this._codec();
        if (!codec || command.code !== 355) return false;
        let parsed;
        try {
            parsed = codec.parseCommand(command, 'eventCall');
        } catch (e) {
            return false;
        }
        const data = parsed && parsed.data;
        if (!this._isValidEventCallData(data)) return false;
        if (parsed.body !== this._eventCallBody(data)) return false;

        this.targetType = data.target;
        this.designation = data.designation;
        if (data.target === 'commonEvent') {
            this.commonEventVariableId = data.variableId;
        } else if (data.designation === 'direct') {
            this.mapEventId = data.eventId;
            this.mapPageNumber = data.pageNumber;
        } else {
            this.mapEventVariableId = data.eventVariableId;
            this.mapPageVariableId = data.pageVariableId;
        }
        return true;
    }

    /**
     * Create modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'common-event-editor-modal';
        this.modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 10005;
            justify-content: center;
            align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'common-event-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 450px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        document.body.appendChild(this.modal);
    }

    /**
     * Render modal content
     */
    renderContent() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.common-event-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top-left-radius: 6px;
            border-top-right-radius: 6px;
        `;
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${tt('Common Event')}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">\u00d7</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 12px;
        `;

        content.appendChild(this._createSelectRow(tt('Target:'), [
            { value: 'commonEvent', label: tt('Common Event') },
            { value: 'mapEventPage', label: tt('Current Map Event Page') }
        ], this.targetType, value => {
            this.targetType = value;
            this.renderContent();
        }));
        content.appendChild(this._createSelectRow(tt('Designation:'), [
            { value: 'direct', label: tt('Direct') },
            { value: 'variable', label: tt('Variable') }
        ], this.designation, value => {
            this.designation = value;
            this.renderContent();
        }));

        if (this.targetType === 'commonEvent') {
            if (this.designation === 'direct') {
                content.appendChild(this._createCommonEventRow());
            } else {
                content.appendChild(this._createNumberRow(tt('Common Event ID Variable:'),
                    this.commonEventVariableId, value => { this.commonEventVariableId = value; }));
            }
        } else if (this.designation === 'direct') {
            content.appendChild(this._createMapEventRow());
            content.appendChild(this._createPageRow());
        } else {
            content.appendChild(this._createNumberRow(tt('Event ID Variable:'),
                this.mapEventVariableId, value => { this.mapEventVariableId = value; }));
            content.appendChild(this._createNumberRow(tt('Page Variable:'),
                this.mapPageVariableId, value => { this.mapPageVariableId = value; }));
        }

        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-panel);
            display: flex;
            justify-content: flex-end;
            gap: 8px;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = tt('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = tt('OK');
        okBtn.style.cssText = `
            padding: 6px 20px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        okBtn.addEventListener('click', () => this.save());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);
    }

    _styleControl(control) {
        control.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
            min-width: 0;
        `;
        return control;
    }

    _createRow(labelText, control) {
        const row = document.createElement('div');
        row.style.cssText = 'display: flex; align-items: center; gap: 8px;';
        const label = document.createElement('span');
        label.textContent = labelText;
        label.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 150px;';
        row.appendChild(label);
        row.appendChild(control);
        return row;
    }

    _createSelectRow(labelText, options, value, onChange) {
        const select = this._styleControl(document.createElement('select'));
        for (const entry of options) {
            const option = document.createElement('option');
            option.value = String(entry.value);
            option.textContent = entry.label;
            select.appendChild(option);
        }
        select.value = String(value);
        select.addEventListener('change', event => onChange(event.target.value));
        return this._createRow(labelText, select);
    }

    _createNumberRow(labelText, value, onChange) {
        const input = this._styleControl(document.createElement('input'));
        input.type = 'number';
        input.min = 1;
        input.value = value;
        input.addEventListener('input', event => {
            const parsed = parseInt(event.target.value, 10);
            if (!Number.isNaN(parsed)) onChange(parsed);
        });
        return this._createRow(labelText, input);
    }

    _createCommonEventRow() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const commonEvents = this.databaseManager?.data?.commonEvents || [];
        const options = [];
        let hasCurrent = false;
        for (let index = 1; index < commonEvents.length; index++) {
            const commonEvent = commonEvents[index];
            if (!commonEvent) continue;
            const id = commonEvent.id ?? index;
            options.push({ value: id, label: `${String(id).padStart(4, '0')}: ${commonEvent.name || ''}` });
            if (id === this.commonEventId) hasCurrent = true;
        }
        if (!hasCurrent) {
            options.push({ value: this.commonEventId,
                label: `${String(this.commonEventId).padStart(4, '0')}: ${tt('Missing')}` });
        }
        return this._createSelectRow(tt('Common Event:'), options, this.commonEventId,
            value => { this.commonEventId = parseInt(value, 10); });
    }

    _currentMapEvents() {
        try {
            const controller = this.projectController;
            const tilemap = controller?.getTilemapManager?.() || controller?.tilemapManager;
            const eventManager = controller?.eventManager;
            const map = tilemap?.currentMap || eventManager?.currentMap ||
                eventManager?.currentMapData || eventManager?.mapData;
            return map && Array.isArray(map.events) ? map.events : [];
        } catch (e) {
            return [];
        }
    }

    _selectedMapEvent() {
        return this._currentMapEvents().find((event, index) => event &&
            (event.id ?? index) === this.mapEventId) || null;
    }

    _createMapEventRow() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const options = [];
        let hasCurrent = false;
        this._currentMapEvents().forEach((event, index) => {
            if (!event) return;
            const id = event.id ?? index;
            if (id <= 0) return;
            options.push({ value: id,
                label: `${String(id).padStart(3, '0')}: ${event.name || tt('Unnamed')}` });
            if (id === this.mapEventId) hasCurrent = true;
        });
        if (!hasCurrent) {
            options.push({ value: this.mapEventId,
                label: `${String(this.mapEventId).padStart(3, '0')}: ${tt('Missing')}` });
        }
        return this._createSelectRow(tt('Map Event:'), options, this.mapEventId, value => {
            this.mapEventId = parseInt(value, 10);
            this.renderContent();
        });
    }

    _createPageRow() {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const pages = this._selectedMapEvent()?.pages || [];
        const options = pages.map((page, index) => ({
            value: index + 1,
            label: `${tt('Page')} ${index + 1}`
        }));
        if (!options.some(option => option.value === this.mapPageNumber)) {
            options.push({ value: this.mapPageNumber,
                label: `${tt('Page')} ${this.mapPageNumber} (${tt('Missing')})` });
        }
        return this._createSelectRow(tt('Page:'), options, this.mapPageNumber,
            value => { this.mapPageNumber = parseInt(value, 10); });
    }

    /**
     * Build command from current data
     */
    buildCommand() {
        if (this.targetType === 'commonEvent' && this.designation === 'direct') {
            return {
                code: 117,
                indent: 0,
                parameters: [this.commonEventId]
            };
        }

        const codec = this._codec();
        if (!codec) throw new Error('ReactorEventCommandCodec is unavailable');
        const data = this._eventCallData();
        return codec.createScriptCommand('eventCall', data, this._eventCallBody(data));
    }

    _eventCallData() {
        if (this.targetType === 'commonEvent') {
            return {
                target: 'commonEvent',
                designation: 'variable',
                variableId: this.commonEventVariableId
            };
        }
        if (this.designation === 'direct') {
            return {
                target: 'mapEventPage',
                designation: 'direct',
                eventId: this.mapEventId,
                pageNumber: this.mapPageNumber
            };
        }
        return {
            target: 'mapEventPage',
            designation: 'variable',
            eventVariableId: this.mapEventVariableId,
            pageVariableId: this.mapPageVariableId
        };
    }

    _eventCallBody(data) {
        if (data.target === 'commonEvent') {
            return `var commonEventId = Number($gameVariables.value(${data.variableId}));\n` +
                'var commonEvent = commonEventId > 0 && commonEventId === Math.floor(commonEventId) && $dataCommonEvents[commonEventId];\n' +
                'if (commonEvent && commonEvent.list) this.setupChild(commonEvent.list, this._eventId || 0);';
        }

        const eventId = data.designation === 'direct' ? String(data.eventId) :
            `Number($gameVariables.value(${data.eventVariableId}))`;
        const pageNumber = data.designation === 'direct' ? String(data.pageNumber) :
            `Number($gameVariables.value(${data.pageVariableId}))`;
        return `var eventId = ${eventId};\n` +
            `var pageNumber = ${pageNumber};\n` +
            'var mapEvent = eventId > 0 && eventId === Math.floor(eventId) && $dataMap && $dataMap.events && $dataMap.events[eventId];\n' +
            'var page = pageNumber > 0 && pageNumber === Math.floor(pageNumber) && mapEvent && mapEvent.pages && mapEvent.pages[pageNumber - 1];\n' +
            'if (page && page.list) this.setupChild(page.list, eventId);';
    }

    _isValidEventCallData(data) {
        const positiveInteger = value => Number.isInteger(value) && value > 0;
        if (!data || (data.designation !== 'direct' && data.designation !== 'variable')) return false;
        if (data.target === 'commonEvent') {
            return data.designation === 'variable' && positiveInteger(data.variableId);
        }
        if (data.target !== 'mapEventPage') return false;
        if (data.designation === 'direct') {
            return positiveInteger(data.eventId) && positiveInteger(data.pageNumber);
        }
        return positiveInteger(data.eventVariableId) && positiveInteger(data.pageVariableId);
    }

    _codec() {
        if (typeof globalThis !== 'undefined' && globalThis.ReactorEventCommandCodec) {
            return globalThis.ReactorEventCommandCodec;
        }
        if (typeof require === 'function') {
            try {
                return require('./ReactorEventCommandCodec.js');
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    /**
     * Save and return command
     */
    save() {
        if (this.callback) {
            const command = this.buildCommand();
            this.callback(command);
        }
        this.close();
    }

    /**
     * Close modal
     */
    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CommonEventEditor;
}
