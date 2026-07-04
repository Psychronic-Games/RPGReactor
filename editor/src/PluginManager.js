/**
 * PluginManager - Manages project plugins, their configuration, and load order
 * Reads/writes to reactor_plugins.js or RPG Maker-compatible plugins.js
 */
class PluginManager {
    constructor(projectController) {
        this.projectController = projectController;
        this.container = null;
        this.plugins = []; // Array of plugin objects with {name, status, description, parameters}
        this.availablePlugins = []; // All plugins found in js/plugins folder
        this.selectedPluginIndex = -1;
        this.selectedPluginIndices = new Set();
        this.lastSelectedPluginIndex = -1;
        this._clipboard = null;  // {plugins, plugin, isCut, sourceIndices} for copy/cut/paste
        this._dragState = null;  // drag-and-drop state

        // Node.js modules
        if (typeof nw !== 'undefined') {
            this.fs = require('fs');
            this.path = require('path');
        }
    }

    /**
     * Show the plugin manager modal
     */
    show() {
        const modal = document.getElementById('plugin-manager-modal');
        if (!modal) {
            console.error('Plugin manager modal not found!');
            return;
        }

        // Create modal structure if not already created
        if (!modal.hasChildNodes()) {
            modal.style.cssText = `
                display: none;
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background-color: rgba(0, 0, 0, 0.4);
                z-index: 10000;
            `;

            // Floating, draggable, resizable window
            const defaultW = Math.min(1200, window.innerWidth - 80);
            const defaultH = Math.min(750, window.innerHeight - 80);
            const defaultX = Math.round((window.innerWidth - defaultW) / 2);
            const defaultY = Math.round((window.innerHeight - defaultH) / 2);

            const windowContainer = document.createElement('div');
            windowContainer.style.cssText = `
                position: absolute;
                left: ${defaultX}px;
                top: ${defaultY}px;
                width: ${defaultW}px;
                height: ${defaultH}px;
                min-width: 700px;
                min-height: 400px;
                background-color: var(--color-bg-surface);
                border: 1px solid var(--color-border-input);
                border-radius: 6px;
                display: flex;
                flex-direction: column;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.7);
                overflow: hidden;
            `;

            modal.appendChild(windowContainer);

            // Close when clicking the backdrop (not the window)
            modal.addEventListener('mousedown', (e) => {
                if (e.target === modal) {
                    this.hide();
                }
            });

            this.init(windowContainer);
            this._windowContainer = windowContainer;

            // Keyboard shortcuts for copy/cut/paste
            this._keyHandler = (e) => {
                if (modal.style.display === 'none') return;
                // Don't intercept when typing in an input/select
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
                if (e.ctrlKey || e.metaKey) {
                    if (e.key === 'c') {
                        if (this.getSelectedPluginIndices().length === 0) return;
                        e.preventDefault();
                        this._copyPlugin(this.selectedPluginIndex, false);
                    } else if (e.key === 'x') {
                        if (this.getSelectedPluginIndices().length === 0) return;
                        e.preventDefault();
                        this._copyPlugin(this.selectedPluginIndex, true);
                    } else if (e.key === 'v') {
                        e.preventDefault();
                        const pasteIndex = this.selectedPluginIndex >= 0 ? this.selectedPluginIndex : this.plugins.length;
                        this._pastePlugin(pasteIndex);
                    }
                } else if (e.key === 'Delete') {
                    if (this.getSelectedPluginIndices().length === 0) return;
                    e.preventDefault();
                    this._removeSelectedPlugins();
                }
            };
            document.addEventListener('keydown', this._keyHandler);
        } else {
            // Reload plugins when showing the modal again
            this.loadPlugins();
        }

        modal.style.display = 'block';
    }

    /**
     * Hide the plugin manager modal
     */
    hide() {
        const modal = document.getElementById('plugin-manager-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Recursively parse nested JSON strings
     */
    deepParseJSON(value) {
        if (typeof value === 'string') {
            // Try to parse as JSON
            try {
                const parsed = JSON.parse(value);
                // Recursively parse the result
                return this.deepParseJSON(parsed);
            } catch (e) {
                // Not JSON, return as-is
                return value;
            }
        } else if (Array.isArray(value)) {
            // Recursively parse array elements
            return value.map(item => this.deepParseJSON(item));
        } else if (value && typeof value === 'object') {
            // Recursively parse object properties
            const result = {};
            for (const [k, v] of Object.entries(value)) {
                result[k] = this.deepParseJSON(v);
            }
            return result;
        }
        return value;
    }

    /**
     * Show complex parameter editor for struct/array types
     * @param {Object} plugin - The plugin object
     * @param {string} key - The parameter key
     * @param {*} value - The parameter value
     * @param {Object} metadata - The parameter metadata
     * @param {Function} onSave - Optional callback when saved
     * @param {Object} structDefinitions - Optional pre-parsed struct definitions
     */
    showComplexParameterEditor(plugin, key, value, metadata, onSave = null, structDefinitions = null) {
        // Parse the current value with deep parsing for nested JSON strings
        let parsedValue;
        try {
            parsedValue = value ? this.deepParseJSON(value) : null;
        } catch (e) {
            console.error('Error parsing parameter value:', e);
            parsedValue = null;
        }

        // Determine if this is an array or struct
        const isArray = metadata.type && metadata.type.includes('[]');
        const isStruct = metadata.type && metadata.type.includes('struct<');

        // Parse struct definitions from plugin source if not provided
        if (!structDefinitions && plugin.name) {
            const currentProject = this.projectController.getCurrentProject();
            const projectPath = currentProject.path;
            const pluginPath = this.path.join(projectPath, 'js', 'plugins', `${plugin.name}.js`);
            const pluginSource = this.fs.readFileSync(pluginPath, 'utf8');
            structDefinitions = this.parseStructDefinitions(pluginSource);
        } else if (!structDefinitions) {
            structDefinitions = {};
        }

        // Extract struct name from type
        let structName = null;
        let structSchema = null;
        const structMatch = metadata.type.match(/struct<(\w+)>/);
        if (structMatch) {
            structName = structMatch[1];
            structSchema = structDefinitions[structName] || null;
        }

        // For arrays, ensure we have an array
        if (isArray) {
            if (!parsedValue) {
                parsedValue = [];
            } else if (!Array.isArray(parsedValue)) {
                console.warn('Expected array but got:', typeof parsedValue, parsedValue);
                // Try to wrap in array if it's a single object
                if (typeof parsedValue === 'object') {
                    parsedValue = [parsedValue];
                } else {
                    parsedValue = [];
                }
            }
        }

        // For structs, ensure we have an object
        if (isStruct && !isArray) {
            if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
                parsedValue = {};
            }
        }

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10001;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 8px;
            width: 80%;
            max-width: 900px;
            height: 70vh;
            max-height: 600px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            border-top-left-radius: 8px;
            border-top-right-radius: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        `;

        const title = document.createElement('h3');
        title.textContent = metadata.text || key;
        title.style.cssText = 'margin: 0; color: var(--color-text-strong); font-size: 16px;';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: var(--color-text-muted);
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            line-height: 1;
        `;
        closeBtn.addEventListener('click', () => document.body.removeChild(overlay));
        closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = 'var(--color-text-strong)');
        closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = 'var(--color-text-muted)');
        header.appendChild(closeBtn);

        modal.appendChild(header);

        // Tab buttons (Structure List / Text)
        const tabContainer = document.createElement('div');
        tabContainer.style.cssText = `
            display: flex;
            background-color: var(--color-bg-list-item);
            border-bottom: 1px solid var(--color-border);
            flex-shrink: 0;
        `;

        const structureTab = document.createElement('button');
        structureTab.textContent = isArray ? 'Structure List' : 'Structure';
        structureTab.style.cssText = `
            padding: 8px 16px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: none;
            border-right: 1px solid var(--color-border);
            cursor: pointer;
            font-size: 12px;
        `;

        const textTab = document.createElement('button');
        textTab.textContent = 'Text';
        textTab.style.cssText = `
            padding: 8px 16px;
            background-color: transparent;
            color: var(--color-text-muted);
            border: none;
            cursor: pointer;
            font-size: 12px;
        `;

        tabContainer.appendChild(structureTab);
        tabContainer.appendChild(textTab);
        modal.appendChild(tabContainer);

        // Content area
        const content = document.createElement('div');
        content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            background-color: var(--color-bg-surface);
            min-height: 0;
        `;

        // Structure view
        const structureView = document.createElement('div');
        structureView.style.cssText = `
            padding: 16px;
            display: block;
        `;

        if (isArray) {
            this.renderArrayStructureEditor(structureView, parsedValue, metadata, structDefinitions, structDefinitions);
        } else if (isStruct) {
            this.renderStructStructureEditor(structureView, parsedValue, metadata, structSchema, structDefinitions);
        }

        content.appendChild(structureView);

        // Text view (JSON editor)
        const textView = document.createElement('div');
        textView.style.cssText = `
            padding: 16px;
            display: none;
        `;

        const textarea = document.createElement('textarea');
        textarea.style.cssText = `
            width: 100%;
            height: 100%;
            min-height: 400px;
            padding: 12px;
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 3px;
            color: var(--color-text);
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 12px;
            resize: none;
            box-sizing: border-box;
        `;
        textarea.value = JSON.stringify(parsedValue, null, 2);
        textView.appendChild(textarea);

        content.appendChild(textView);
        modal.appendChild(content);

        // Tab switching
        structureTab.addEventListener('click', () => {
            structureTab.style.backgroundColor = 'var(--color-bg-input)';
            structureTab.style.color = 'var(--color-text)';
            textTab.style.backgroundColor = 'transparent';
            textTab.style.color = 'var(--color-text-muted)';
            structureView.style.display = 'block';
            textView.style.display = 'none';
        });

        textTab.addEventListener('click', () => {
            textTab.style.backgroundColor = 'var(--color-bg-input)';
            textTab.style.color = 'var(--color-text)';
            structureTab.style.backgroundColor = 'transparent';
            structureTab.style.color = 'var(--color-text-muted)';
            structureView.style.display = 'none';
            textView.style.display = 'block';

            // Update textarea with current structure data
            textarea.value = JSON.stringify(parsedValue, null, 2);
        });

        // Description
        if (metadata.desc) {
            const descDiv = document.createElement('div');
            descDiv.style.cssText = `
                padding: 12px 16px;
                background-color: var(--color-bg-list-item);
                border-top: 1px solid var(--color-border);
                color: var(--color-text-muted);
                font-size: 11px;
                line-height: 1.4;
                flex-shrink: 0;
            `;
            descDiv.textContent = metadata.desc;
            modal.appendChild(descDiv);
        }

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-top: 1px solid var(--color-border);
            border-bottom-left-radius: 8px;
            border-bottom-right-radius: 8px;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            flex-shrink: 0;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => document.body.removeChild(overlay));
        footer.appendChild(cancelBtn);

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'OK';
        saveBtn.style.cssText = `
            padding: 6px 16px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: 1px solid var(--color-accent);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        saveBtn.addEventListener('mouseenter', () => { saveBtn.style.backgroundColor = 'var(--color-accent-muted)'; });
        saveBtn.addEventListener('mouseleave', () => { saveBtn.style.backgroundColor = 'var(--color-accent)'; });
        saveBtn.addEventListener('click', () => {
            // Update from text view if active
            if (textView.style.display !== 'none') {
                try {
                    parsedValue = JSON.parse(textarea.value);
                } catch (e) {
                    alert('Invalid JSON format. Please fix the syntax errors.');
                    return;
                }
            }

            // Update the plugin parameter
            if (!plugin.parameters) {
                plugin.parameters = {};
            }
            plugin.parameters[key] = JSON.stringify(parsedValue);
            document.body.removeChild(overlay);

            // Call the onSave callback if provided
            if (onSave) {
                onSave(parsedValue);
            } else {
                // Refresh the details view (only for top-level edits)
                this.renderPluginDetails(plugin);
            }
        });
        footer.appendChild(saveBtn);

        modal.appendChild(footer);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Close on click outside
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });
    }

    /**
     * Show nested struct editor (simplified version without plugin file reading)
     * @param {string} fieldName - The field name
     * @param {*} value - The current value
     * @param {Object} fieldSchema - The field schema
     * @param {Function} onSave - Callback when saved
     */
    showNestedStructEditor(fieldName, value, fieldSchema, onSave) {
        // Parse the current value with deep parsing
        let parsedValue;
        try {
            parsedValue = typeof value === 'string' ? this.deepParseJSON(value) : value;
            if (!parsedValue || typeof parsedValue !== 'object' || Array.isArray(parsedValue)) {
                parsedValue = {};
            }
        } catch (e) {
            console.error('Error parsing nested struct value:', e);
            parsedValue = {};
        }

        // Extract struct name from type
        const structMatch = fieldSchema.type.match(/struct<(\w+)>/);
        if (!structMatch) {
            alert('Invalid struct type: ' + fieldSchema.type);
            return;
        }

        const structName = structMatch[1];

        // We need to get the struct definitions from the parent plugin
        // For now, we'll parse them from the current project's plugin
        const currentProject = this.projectController.getCurrentProject();
        const projectPath = currentProject.path;

        // Find the plugin file that contains this struct definition
        // We need to search through available plugins
        let structSchema = null;
        let structDefinitions = {};

        for (const pluginName of this.availablePlugins) {
            try {
                const pluginPath = this.path.join(projectPath, 'js', 'plugins', `${pluginName}.js`);
                if (this.fs.existsSync(pluginPath)) {
                    const pluginSource = this.fs.readFileSync(pluginPath, 'utf8');
                    const defs = this.parseStructDefinitions(pluginSource);
                    if (defs[structName]) {
                        structSchema = defs[structName];
                        structDefinitions = defs;
                        break;
                    }
                }
            } catch (e) {
                // Skip this plugin
            }
        }

        if (!structSchema) {
            alert('Could not find struct definition for: ' + structName);
            return;
        }

        // Create modal overlay
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.9);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10002;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 8px;
            width: 80%;
            max-width: 900px;
            height: 70vh;
            max-height: 600px;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            border-top-left-radius: 8px;
            border-top-right-radius: 8px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
        `;

        const title = document.createElement('h3');
        title.textContent = fieldSchema.text || fieldName;
        title.style.cssText = 'margin: 0; color: var(--color-text-strong); font-size: 16px;';
        header.appendChild(title);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: var(--color-text-muted);
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            line-height: 1;
        `;
        closeBtn.addEventListener('click', () => document.body.removeChild(overlay));
        closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = 'var(--color-text-strong)');
        closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = 'var(--color-text-muted)');
        header.appendChild(closeBtn);

        modal.appendChild(header);

        // Content area
        const content = document.createElement('div');
        content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            background-color: var(--color-bg-surface);
            min-height: 0;
        `;

        // Render struct editor
        this.renderStructStructureEditor(content, parsedValue, fieldSchema, structSchema, structDefinitions);

        modal.appendChild(content);

        // Description
        if (fieldSchema.desc) {
            const descDiv = document.createElement('div');
            descDiv.style.cssText = `
                padding: 12px 16px;
                background-color: var(--color-bg-list-item);
                border-top: 1px solid var(--color-border);
                color: var(--color-text-muted);
                font-size: 11px;
                line-height: 1.4;
                flex-shrink: 0;
            `;
            descDiv.textContent = fieldSchema.desc;
            modal.appendChild(descDiv);
        }

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-top: 1px solid var(--color-border);
            border-bottom-left-radius: 8px;
            border-bottom-right-radius: 8px;
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            flex-shrink: 0;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => document.body.removeChild(overlay));
        footer.appendChild(cancelBtn);

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'OK';
        saveBtn.style.cssText = `
            padding: 6px 16px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: 1px solid var(--color-accent);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        saveBtn.addEventListener('mouseenter', () => { saveBtn.style.backgroundColor = 'var(--color-accent-muted)'; });
        saveBtn.addEventListener('mouseleave', () => { saveBtn.style.backgroundColor = 'var(--color-accent)'; });
        saveBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
            onSave(parsedValue);
        });
        footer.appendChild(saveBtn);

        modal.appendChild(footer);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // Close on click outside
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                document.body.removeChild(overlay);
            }
        });
    }

    /**
     * Render array structure editor (table with rows)
     */
    renderArrayStructureEditor(container, arrayData, metadata, structDefinitions = {}, allStructDefinitions = {}) {
        // Parse struct type from metadata if it's struct<Name>[]
        let structType = null;
        let structSchema = null;
        const structMatch = metadata.type.match(/struct<(\w+)>\[\]/);
        if (structMatch) {
            structType = structMatch[1];
            structSchema = structDefinitions[structType] || null;
        }

        // Create table header
        const table = document.createElement('div');
        table.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 1px;
            background-color: var(--color-border);
            border: 1px solid var(--color-border);
        `;

        // Header row
        const headerRow = document.createElement('div');
        headerRow.style.cssText = `
            display: grid;
            grid-template-columns: 40px 1fr;
            background-color: var(--color-bg-input);
            font-weight: bold;
            color: var(--color-text);
            font-size: 12px;
        `;

        const indexHeader = document.createElement('div');
        indexHeader.style.cssText = 'padding: 8px; border-right: 1px solid var(--color-border);';
        indexHeader.textContent = '#';
        headerRow.appendChild(indexHeader);

        const valueHeader = document.createElement('div');
        valueHeader.style.cssText = 'padding: 8px;';
        valueHeader.textContent = 'Value';
        headerRow.appendChild(valueHeader);

        table.appendChild(headerRow);

        // Data rows
        arrayData.forEach((item, index) => {
            const row = document.createElement('div');
            row.style.cssText = `
                display: grid;
                grid-template-columns: 40px 1fr;
                background-color: var(--color-bg-list-item);
            `;

            const indexCell = document.createElement('div');
            indexCell.style.cssText = 'padding: 8px; border-right: 1px solid var(--color-border); color: var(--color-text-muted); font-size: 11px; text-align: center;';
            indexCell.textContent = index + 1;
            row.appendChild(indexCell);

            const valueCell = document.createElement('div');
            valueCell.style.cssText = 'padding: 4px 8px; color: var(--color-syntax-keyword); font-size: 11px; font-family: monospace; overflow: hidden; text-overflow: ellipsis;';
            valueCell.textContent = typeof item === 'object' ? JSON.stringify(item) : String(item);
            valueCell.style.cursor = 'pointer';
            valueCell.addEventListener('click', () => {
                // Open editor for this array element
                this.showArrayElementEditor(arrayData, index, metadata, structSchema, () => {
                    container.innerHTML = '';
                    this.renderArrayStructureEditor(container, arrayData, metadata, structDefinitions);
                });
            });
            row.appendChild(valueCell);

            table.appendChild(row);
        });

        container.appendChild(table);

        // Add button
        const addButton = document.createElement('button');
        addButton.textContent = '+ Add Element';
        addButton.style.cssText = `
            margin-top: 12px;
            padding: 8px 16px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: 1px solid var(--color-accent);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        addButton.addEventListener('mouseenter', () => { addButton.style.backgroundColor = 'var(--color-accent-muted)'; });
        addButton.addEventListener('mouseleave', () => { addButton.style.backgroundColor = 'var(--color-accent)'; });
        addButton.addEventListener('click', () => {
            // Add new element
            const newElement = structType ? {} : '';
            arrayData.push(newElement);

            // Re-render
            container.innerHTML = '';
            this.renderArrayStructureEditor(container, arrayData, metadata, structDefinitions);
        });
        container.appendChild(addButton);
    }

    /**
     * Render struct structure editor (name-value table)
     */
    renderStructStructureEditor(container, structData, metadata, structSchema = null, allStructDefinitions = {}) {
        // If we don't have a schema, fall back to simple editing
        if (!structSchema || Object.keys(structSchema).length === 0) {
            this.renderStructStructureEditorSimple(container, structData);
            return;
        }

        // Create table
        const table = document.createElement('div');
        table.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 1px;
            background-color: var(--color-border);
            border: 1px solid var(--color-border);
        `;

        // Header row
        const headerRow = document.createElement('div');
        headerRow.style.cssText = `
            display: grid;
            grid-template-columns: 250px 1fr;
            background-color: var(--color-bg-input);
            font-weight: bold;
            color: var(--color-text);
            font-size: 12px;
        `;

        const nameHeader = document.createElement('div');
        nameHeader.style.cssText = 'padding: 8px; border-right: 1px solid var(--color-border);';
        nameHeader.textContent = 'Name';
        headerRow.appendChild(nameHeader);

        const valueHeader = document.createElement('div');
        valueHeader.style.cssText = 'padding: 8px;';
        valueHeader.textContent = 'Value';
        headerRow.appendChild(valueHeader);

        table.appendChild(headerRow);

        // Data rows - iterate through schema fields
        for (const [fieldName, fieldSchema] of Object.entries(structSchema)) {
            const row = document.createElement('div');
            row.style.cssText = `
                display: grid;
                grid-template-columns: 250px 1fr;
                background-color: var(--color-bg-list-item);
            `;

            const nameCell = document.createElement('div');
            nameCell.style.cssText = 'padding: 8px; border-right: 1px solid var(--color-border); color: var(--color-syntax-function); font-size: 11px;';
            nameCell.textContent = fieldSchema.text || fieldName;

            // Add description tooltip if available
            if (fieldSchema.desc) {
                nameCell.title = fieldSchema.desc;
            }

            row.appendChild(nameCell);

            const valueCell = document.createElement('div');
            valueCell.style.cssText = 'padding: 8px;';

            // Get current value or use default
            const currentValue = structData[fieldName] !== undefined ? structData[fieldName] : fieldSchema.default;

            // Create appropriate input based on field type
            const input = this.createStructFieldInput(fieldName, currentValue, fieldSchema, structData, allStructDefinitions);
            valueCell.appendChild(input);
            row.appendChild(valueCell);

            table.appendChild(row);
        }

        container.appendChild(table);
    }

    /**
     * Create input field for a struct field based on its schema
     */
    createStructFieldInput(fieldName, value, fieldSchema, structData, allStructDefinitions = {}) {
        const type = fieldSchema.type;

        // Handle boolean
        if (type === 'boolean') {
            const select = document.createElement('select');
            select.style.cssText = `
                width: 100%;
                padding: 4px 8px;
                background-color: var(--color-border);
                color: var(--color-text);
                border: 1px solid var(--color-border-input);
                border-radius: 3px;
                font-size: 11px;
            `;

            const trueOpt = document.createElement('option');
            trueOpt.value = 'true';
            trueOpt.textContent = fieldSchema.on || 'true';
            trueOpt.selected = value === 'true' || value === true;

            const falseOpt = document.createElement('option');
            falseOpt.value = 'false';
            falseOpt.textContent = fieldSchema.off || 'false';
            falseOpt.selected = value === 'false' || value === false;

            select.appendChild(trueOpt);
            select.appendChild(falseOpt);

            select.addEventListener('change', (e) => {
                structData[fieldName] = e.target.value;
            });

            return select;
        }

        // Handle select/combo with options
        if ((type === 'select' || type === 'combo') && fieldSchema.options && fieldSchema.options.length > 0) {
            const select = document.createElement('select');
            select.style.cssText = `
                width: 100%;
                padding: 4px 8px;
                background-color: var(--color-border);
                color: var(--color-text);
                border: 1px solid var(--color-border-input);
                border-radius: 3px;
                font-size: 11px;
            `;

            for (const option of fieldSchema.options) {
                const opt = document.createElement('option');
                opt.value = option;
                opt.textContent = option;
                opt.selected = value === option;
                select.appendChild(opt);
            }

            select.addEventListener('change', (e) => {
                structData[fieldName] = e.target.value;
            });

            return select;
        }

        // Handle number
        if (type === 'number') {
            const input = document.createElement('input');
            input.type = 'number';
            input.value = value || 0;
            if (fieldSchema.min !== null) input.min = fieldSchema.min;
            if (fieldSchema.max !== null) input.max = fieldSchema.max;
            input.style.cssText = `
                width: 100%;
                padding: 4px 8px;
                background-color: var(--color-border);
                color: var(--color-text);
                border: 1px solid var(--color-border-input);
                border-radius: 3px;
                font-size: 11px;
            `;
            input.addEventListener('change', (e) => {
                structData[fieldName] = e.target.value;
            });
            return input;
        }

        // Handle nested struct
        if (type && type.includes('struct<')) {
            const button = document.createElement('button');
            button.textContent = `Edit ${fieldSchema.text || fieldName}...`;
            button.style.cssText = `
                padding: 6px 12px;
                background-color: var(--color-accent);
                color: var(--color-bg-deep);
                border: 1px solid var(--color-accent);
                border-radius: 3px;
                cursor: pointer;
                font-size: 11px;
                font-weight: bold;
            `;
            button.addEventListener('mouseenter', () => { button.style.backgroundColor = 'var(--color-accent-muted)'; });
            button.addEventListener('mouseleave', () => { button.style.backgroundColor = 'var(--color-accent)'; });
            button.addEventListener('click', (e) => {
                // Open nested struct editor
                // Get the current value or initialize as empty object
                const currentValue = structData[fieldName] || {};

                // We need to pass the struct definitions and avoid re-reading the plugin file
                // So we'll handle nested structs differently - without loading from file
                this.showNestedStructEditor(
                    fieldName,
                    currentValue,
                    fieldSchema,
                    (newValue) => {
                        // Update the parent struct with the new value
                        structData[fieldName] = newValue;
                    }
                );
            });
            return button;
        }

        // Default: text input
        const input = document.createElement('input');
        input.type = 'text';
        input.value = typeof value === 'object' ? JSON.stringify(value) : String(value || '');
        input.style.cssText = `
            width: 100%;
            padding: 4px 8px;
            background-color: var(--color-border);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 11px;
        `;
        input.addEventListener('change', (e) => {
            structData[fieldName] = e.target.value;
        });
        return input;
    }

    /**
     * Simple struct editor without schema (fallback)
     */
    renderStructStructureEditorSimple(container, structData) {
        // Create table
        const table = document.createElement('div');
        table.style.cssText = `
            display: flex;
            flex-direction: column;
            gap: 1px;
            background-color: var(--color-border);
            border: 1px solid var(--color-border);
        `;

        // Header row
        const headerRow = document.createElement('div');
        headerRow.style.cssText = `
            display: grid;
            grid-template-columns: 200px 1fr;
            background-color: var(--color-bg-input);
            font-weight: bold;
            color: var(--color-text);
            font-size: 12px;
        `;

        const nameHeader = document.createElement('div');
        nameHeader.style.cssText = 'padding: 8px; border-right: 1px solid var(--color-border);';
        nameHeader.textContent = 'Name';
        headerRow.appendChild(nameHeader);

        const valueHeader = document.createElement('div');
        valueHeader.style.cssText = 'padding: 8px;';
        valueHeader.textContent = 'Value';
        headerRow.appendChild(valueHeader);

        table.appendChild(headerRow);

        // Data rows
        for (const [name, value] of Object.entries(structData)) {
            const row = document.createElement('div');
            row.style.cssText = `
                display: grid;
                grid-template-columns: 200px 1fr;
                background-color: var(--color-bg-list-item);
            `;

            const nameCell = document.createElement('div');
            nameCell.style.cssText = 'padding: 8px; border-right: 1px solid var(--color-border); color: var(--color-syntax-function); font-size: 11px; font-family: monospace;';
            nameCell.textContent = name;
            row.appendChild(nameCell);

            const valueCell = document.createElement('div');
            valueCell.style.cssText = 'padding: 8px;';

            // Create input based on value type
            const input = document.createElement('input');
            input.type = 'text';
            input.value = typeof value === 'object' ? JSON.stringify(value) : String(value);
            input.style.cssText = `
                width: 100%;
                padding: 4px 8px;
                background-color: var(--color-border);
                color: var(--color-text);
                border: 1px solid var(--color-border-input);
                border-radius: 3px;
                font-size: 11px;
                font-family: monospace;
            `;
            input.addEventListener('change', (e) => {
                // Try to parse as JSON, otherwise use as string
                try {
                    structData[name] = JSON.parse(e.target.value);
                } catch (err) {
                    structData[name] = e.target.value;
                }
            });

            valueCell.appendChild(input);
            row.appendChild(valueCell);

            table.appendChild(row);
        }

        container.appendChild(table);
    }

    /**
     * Show editor for individual array element
     */
    showArrayElementEditor(arrayData, index, parentMetadata, structSchema, onSave) {
        const element = arrayData[index];

        // Create mini modal
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.8);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 10002;
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 600px;
            max-height: 70vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            border-top-left-radius: 6px;
            border-top-right-radius: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;

        const title = document.createElement('h3');
        title.textContent = `Element ${index + 1}`;
        title.style.cssText = 'margin: 0; color: var(--color-text-strong); font-size: 14px;';
        header.appendChild(title);

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Delete';
        deleteBtn.style.cssText = `
            padding: 4px 12px;
            background-color: var(--color-danger-soft);
            color: var(--color-text-strong);
            border: none;
            border-radius: 3px;
            cursor: pointer;
            font-size: 11px;
        `;
        deleteBtn.addEventListener('click', () => {
            if (confirm('Delete this element?')) {
                arrayData.splice(index, 1);
                document.body.removeChild(overlay);
                onSave();
            }
        });
        header.appendChild(deleteBtn);

        modal.appendChild(header);

        // Content
        const content = document.createElement('div');
        content.style.cssText = `
            padding: 16px;
            flex: 1;
            overflow-y: auto;
        `;

        if (typeof element === 'object' && !Array.isArray(element)) {
            // Render struct fields with schema
            this.renderStructStructureEditor(content, element, {}, structSchema);
        } else {
            // Simple value editor
            const input = document.createElement('textarea');
            input.style.cssText = `
                width: 100%;
                height: 200px;
                padding: 8px;
                background-color: var(--color-border);
                color: var(--color-text);
                border: 1px solid var(--color-border-input);
                border-radius: 3px;
                font-size: 12px;
                font-family: monospace;
                resize: vertical;
            `;
            input.value = typeof element === 'object' ? JSON.stringify(element, null, 2) : String(element);
            content.appendChild(input);

            input.addEventListener('change', (e) => {
                try {
                    arrayData[index] = JSON.parse(e.target.value);
                } catch (err) {
                    arrayData[index] = e.target.value;
                }
            });
        }

        modal.appendChild(content);

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

        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.cssText = `
            padding: 6px 16px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: 1px solid var(--color-accent);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            font-weight: bold;
        `;
        closeBtn.addEventListener('mouseenter', () => { closeBtn.style.backgroundColor = 'var(--color-accent-muted)'; });
        closeBtn.addEventListener('mouseleave', () => { closeBtn.style.backgroundColor = 'var(--color-accent)'; });
        closeBtn.addEventListener('click', () => {
            document.body.removeChild(overlay);
            onSave();
        });
        footer.appendChild(closeBtn);

        modal.appendChild(footer);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
    }

    /**
     * Initialize the plugin manager UI
     */
    init(container) {
        this.container = container;
        this.container.innerHTML = '';
        // Container is the windowContainer which is already positioned and sized in show()
        // Don't overwrite style.cssText — just clear contents and build the UI

        this.createUI();
        this.loadPlugins();
    }

    /**
     * Create the main UI structure
     */
    createUI() {
        // Header / title bar (draggable)
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 8px 16px;
            background-color: var(--color-bg-panel);
            border-bottom: 1px solid var(--color-border);
            border-top-left-radius: 6px;
            border-top-right-radius: 6px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-shrink: 0;
            cursor: grab;
            user-select: none;
        `;

        // Drag-to-move on title bar
        header.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON') return;
            const win = this.container;
            const startX = e.clientX - win.offsetLeft;
            const startY = e.clientY - win.offsetTop;
            header.style.cursor = 'grabbing';
            const onMove = (ev) => {
                win.style.left = (ev.clientX - startX) + 'px';
                win.style.top = (ev.clientY - startY) + 'px';
            };
            const onUp = () => {
                header.style.cursor = 'grab';
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });

        const title = document.createElement('h2');
        title.textContent = 'Plugin Manager';
        title.style.cssText = 'margin: 0; color: var(--color-text-strong); font-size: 16px; pointer-events: none;';
        header.appendChild(title);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save Changes';
        saveBtn.style.cssText = `
            padding: 6px 16px;
            background-color: var(--color-accent);
            color: var(--color-bg-deep);
            border: 1px solid var(--color-accent);
            border-radius: 3px;
            cursor: pointer;
            font-size: 13px;
            font-weight: bold;
        `;
        saveBtn.addEventListener('mouseenter', () => { saveBtn.style.backgroundColor = 'var(--color-accent-muted)'; });
        saveBtn.addEventListener('mouseleave', () => { saveBtn.style.backgroundColor = 'var(--color-accent)'; });
        saveBtn.addEventListener('click', () => this.savePlugins());
        buttonContainer.appendChild(saveBtn);

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.cssText = `
            background: none;
            border: none;
            color: var(--color-text-muted);
            font-size: 24px;
            cursor: pointer;
            padding: 0;
            width: 30px;
            height: 30px;
            line-height: 1;
        `;
        closeBtn.addEventListener('click', () => this.hide());
        closeBtn.addEventListener('mouseenter', () => closeBtn.style.color = 'var(--color-text-strong)');
        closeBtn.addEventListener('mouseleave', () => closeBtn.style.color = 'var(--color-text-muted)');
        buttonContainer.appendChild(closeBtn);

        header.appendChild(buttonContainer);
        this.container.appendChild(header);

        // Main content area - split into list and details
        const mainContent = document.createElement('div');
        mainContent.style.cssText = `
            display: flex;
            flex: 1;
            overflow: hidden;
            min-height: 0;
            min-width: 0;
        `;

        // Left side - Plugin list
        const listContainer = document.createElement('div');
        listContainer.style.cssText = `
            width: 280px;
            min-width: 220px;
            border-right: 1px solid var(--color-border);
            display: flex;
            flex-direction: column;
            flex-shrink: 0;
        `;

        const listHeader = document.createElement('div');
        listHeader.style.cssText = `
            padding: 8px 12px;
            background-color: var(--color-bg-list-item);
            border-bottom: 1px solid var(--color-border);
            color: var(--color-text);
            font-weight: bold;
            font-size: 13px;
        `;
        listHeader.textContent = 'Plugins (Load Order)';
        listContainer.appendChild(listHeader);

        this.pluginListContainer = document.createElement('div');
        this.pluginListContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            background-color: var(--color-bg-surface);
        `;
        listContainer.appendChild(this.pluginListContainer);

        mainContent.appendChild(listContainer);

        // Right side - Plugin details and parameters
        this.detailsContainer = document.createElement('div');
        this.detailsContainer.style.cssText = `
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            min-width: 0;
            min-height: 0;
        `;
        mainContent.appendChild(this.detailsContainer);

        this.container.appendChild(mainContent);

        // Resize handle at bottom-right corner
        const resizeHandle = document.createElement('div');
        resizeHandle.style.cssText = `
            position: absolute;
            bottom: 0;
            right: 0;
            width: 18px;
            height: 18px;
            cursor: nwse-resize;
            z-index: 10;
        `;
        // Draw a grip triangle
        resizeHandle.innerHTML = `<svg width="18" height="18" viewBox="0 0 18 18" style="display:block;">
            <path d="M 14 4 L 14 14 L 4 14" fill="none" stroke="var(--color-border-input)" stroke-width="1.5"/>
            <path d="M 17 7 L 17 17 L 7 17" fill="none" stroke="var(--color-border-input)" stroke-width="1.5"/>
        </svg>`;
        resizeHandle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const win = this.container;
            const startX = e.clientX;
            const startY = e.clientY;
            const startW = win.offsetWidth;
            const startH = win.offsetHeight;
            const onMove = (ev) => {
                const newW = Math.max(700, startW + (ev.clientX - startX));
                const newH = Math.max(400, startH + (ev.clientY - startY));
                win.style.width = newW + 'px';
                win.style.height = newH + 'px';
            };
            const onUp = () => {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
        this.container.appendChild(resizeHandle);

        this.renderEmptyDetails();
    }

    /**
     * Resolve the plugins file path for the current project.
     * If the project uses the Reactor corescript (has reactor_main.js), use reactor_plugins.js.
     * Otherwise use plugins.js (standard MV/MZ projects).
     */
    resolvePluginsPath(projectPath) {
        const usesReactorCorescript = this.fs.existsSync(this.path.join(projectPath, 'js', 'reactor_main.js'));
        const pluginsFile = usesReactorCorescript ? 'reactor_plugins.js' : 'plugins.js';
        const pluginsPath = this.path.join(projectPath, 'js', pluginsFile);
        if (this.fs.existsSync(pluginsPath)) {
            return pluginsPath;
        }
        return null;
    }

    /**
     * Load plugins from reactor_plugins.js (or plugins.js for MV/MZ projects)
     */
    async loadPlugins() {
        try {
            const currentProject = this.projectController.getCurrentProject();
            if (!currentProject || !currentProject.path) {
                console.error('No project loaded');
                return;
            }

            const projectPath = currentProject.path;
            const pluginsPath = this.resolvePluginsPath(projectPath);

            if (!pluginsPath) {
                const usesReactor = this.fs.existsSync(this.path.join(projectPath, 'js', 'reactor_main.js'));
                const defaultFile = usesReactor ? 'reactor_plugins.js' : 'plugins.js';
                console.warn(`No plugins file found, creating default ${defaultFile}`);
                this._pluginsFilePath = this.path.join(projectPath, 'js', defaultFile);
                this.plugins = [];
                this.savePlugins();
                return;
            }

            // Remember which file we loaded from so savePlugins writes back to the same one
            this._pluginsFilePath = pluginsPath;
            console.log('Loading plugins from:', pluginsPath);
            this.clearPluginSelection();

            const text = this.fs.readFileSync(pluginsPath, 'utf8');

            // Extract the $plugins array
            const pluginsMatch = text.match(/var\s+\$plugins\s*=\s*(\[[\s\S]*\]);/);
            if (pluginsMatch) {
                this.plugins = JSON.parse(pluginsMatch[1]);

                // Enrich plugins with descriptions and help from their source files
                for (const plugin of this.plugins) {
                    try {
                        const pluginPath = this.path.join(projectPath, 'js', 'plugins', `${plugin.name}.js`);
                        if (this.fs.existsSync(pluginPath)) {
                            const pluginSource = this.fs.readFileSync(pluginPath, 'utf8');
                                // Always re-read metadata from the source file so
                            // edits to the plugin are reflected immediately
                            plugin.description = this.parsePluginDescription(pluginSource) || plugin.description || '';
                            plugin.help = this.parsePluginHelp(pluginSource) || plugin.help || '';
                            plugin.author = this.parsePluginAuthor(pluginSource) || plugin.author || '';
                            plugin.url = this.parsePluginUrl(pluginSource) || plugin.url || '';
                        }
                    } catch (err) {
                        console.warn(`Could not load metadata for plugin ${plugin.name}:`, err);
                    }
                }
            } else {
                this.plugins = [];
            }

            // Load available plugins from js/plugins folder
            await this.scanAvailablePlugins(projectPath);

            this.renderPluginList();
        } catch (err) {
            console.error('Error loading plugins:', err);
        }
    }

    /**
     * Scan js/plugins folder for available plugins
     */
    async scanAvailablePlugins(projectPath) {
        try {
            const pluginsDir = this.path.join(projectPath, 'js', 'plugins');

            if (!this.fs.existsSync(pluginsDir)) {
                this.availablePlugins = [];
                return;
            }

            const files = this.fs.readdirSync(pluginsDir);
            this.availablePlugins = files
                .filter(f => f.endsWith('.js'))
                .map(f => f.replace('.js', ''));

            console.log('Found available plugins:', this.availablePlugins);
        } catch (err) {
            console.error('Error scanning plugins:', err);
            this.availablePlugins = [];
        }
    }

    clearPluginSelection() {
        this.selectedPluginIndices.clear();
        this.selectedPluginIndex = -1;
        this.lastSelectedPluginIndex = -1;
    }

    getSelectedPluginIndices() {
        return Array.from(this.selectedPluginIndices)
            .filter(index => index >= 0 && index < this.plugins.length)
            .sort((a, b) => a - b);
    }

    setPluginSelection(indices, primaryIndex = null) {
        const validIndices = indices
            .filter(index => index >= 0 && index < this.plugins.length)
            .sort((a, b) => a - b);
        this.selectedPluginIndices = new Set(validIndices);

        if (primaryIndex !== null && this.selectedPluginIndices.has(primaryIndex)) {
            this.selectedPluginIndex = primaryIndex;
        } else {
            this.selectedPluginIndex = validIndices.length > 0 ? validIndices[0] : -1;
        }

        this.lastSelectedPluginIndex = this.selectedPluginIndex;
    }

    selectPluginFromEvent(index, event = null) {
        const ctrlOrMeta = !!event && (event.ctrlKey || event.metaKey);
        const shift = !!event && event.shiftKey;

        if (shift && this.lastSelectedPluginIndex >= 0 && this.lastSelectedPluginIndex < this.plugins.length) {
            const start = Math.min(this.lastSelectedPluginIndex, index);
            const end = Math.max(this.lastSelectedPluginIndex, index);
            const range = [];
            for (let i = start; i <= end; i++) range.push(i);
            const nextSelection = ctrlOrMeta ? [...this.getSelectedPluginIndices(), ...range] : range;
            this.setPluginSelection(nextSelection, index);
        } else if (ctrlOrMeta) {
            const nextSelection = new Set(this.getSelectedPluginIndices());
            if (nextSelection.has(index)) {
                nextSelection.delete(index);
            } else {
                nextSelection.add(index);
            }
            this.setPluginSelection(Array.from(nextSelection), nextSelection.has(index) ? index : null);
        } else {
            this.setPluginSelection([index], index);
        }

        this.renderPluginList();
        this.renderSelectedPluginDetails();
    }

    renderSelectedPluginDetails() {
        const selectedIndices = this.getSelectedPluginIndices();
        if (selectedIndices.length === 0) {
            this.renderEmptyDetails();
            return;
        }

        if (selectedIndices.length > 1) {
            this.renderMultiPluginDetails(selectedIndices);
            return;
        }

        const index = selectedIndices[0];
        this.selectedPluginIndex = index;
        this.renderPluginDetails(this.plugins[index]);
    }

    renderMultiPluginDetails(selectedIndices) {
        this.detailsContainer.innerHTML = '';

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            padding: 16px;
            color: var(--color-text);
            overflow-y: auto;
        `;

        const title = document.createElement('h3');
        title.style.cssText = 'margin: 0 0 10px 0; color: var(--color-text-strong); font-size: 16px;';
        title.textContent = `${selectedIndices.length} plugins selected`;
        wrapper.appendChild(title);

        const hint = document.createElement('div');
        hint.style.cssText = 'color: var(--color-text-muted); font-size: 12px; margin-bottom: 12px; line-height: 1.4;';
        hint.textContent = 'Use Ctrl+C, Ctrl+X, Delete, or the buttons below to act on the selected group. Select one plugin to edit parameters.';
        wrapper.appendChild(hint);

        const list = document.createElement('div');
        list.style.cssText = `
            border: 1px solid var(--color-border);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 14px;
        `;
        for (const index of selectedIndices) {
            const plugin = this.plugins[index];
            const row = document.createElement('div');
            row.style.cssText = `
                padding: 7px 10px;
                border-bottom: 1px solid var(--color-border-subtle);
                background-color: var(--color-bg-list-item);
                font-size: 12px;
            `;
            row.textContent = `${index + 1}. ${plugin.name}`;
            list.appendChild(row);
        }
        wrapper.appendChild(list);

        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

        const makeButton = (label, background, action) => {
            const button = document.createElement('button');
            button.textContent = label;
            button.style.cssText = `
                padding: 6px 14px;
                background-color: ${background};
                color: var(--color-text-strong);
                border: none;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
            `;
            button.addEventListener('click', action);
            return button;
        };

        actions.appendChild(makeButton('Copy Selected', 'var(--color-border)', () => this._copyPlugin(this.selectedPluginIndex, false)));
        actions.appendChild(makeButton('Cut Selected', 'var(--color-border)', () => this._copyPlugin(this.selectedPluginIndex, true)));
        actions.appendChild(makeButton('Remove Selected', 'var(--color-danger-soft)', () => this._removeSelectedPlugins()));
        wrapper.appendChild(actions);

        this.detailsContainer.appendChild(wrapper);
    }

    /**
     * Render the plugin list
     */
    renderPluginList() {
        this.pluginListContainer.innerHTML = '';

        this.plugins.forEach((plugin, index) => {
            const item = this.createPluginListItem(plugin, index);
            this.pluginListContainer.appendChild(item);
        });

        // Add "Add Plugin" button at the bottom
        const addBtn = document.createElement('div');
        addBtn.style.cssText = `
            padding: 12px;
            color: var(--color-accent);
            cursor: pointer;
            text-align: center;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-list-item);
        `;
        addBtn.textContent = '+ Add Plugin';
        addBtn.addEventListener('click', () => this.showAddPluginDialog());
        addBtn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            this._showPluginContextMenu(e.clientX, e.clientY, this.plugins.length, { pasteOnly: true });
        });
        this.pluginListContainer.appendChild(addBtn);
    }

    /**
     * Create a plugin list item
     */
    createPluginListItem(plugin, index) {
        const item = document.createElement('div');
        const isSelected = this.selectedPluginIndices.has(index);

        item.style.cssText = `
            padding: 6px 8px;
            border-bottom: 1px solid var(--color-border);
            cursor: pointer;
            background-color: ${isSelected ? 'var(--color-selection-deep)' : 'var(--color-bg-surface)'};
            display: grid;
            grid-template-columns: 20px 1fr 50px;
            align-items: center;
            gap: 6px;
            position: relative;
        `;

        // Drag-and-drop support
        item.draggable = true;
        item.dataset.index = index;

        item.addEventListener('dragstart', (e) => {
            this._dragState = { fromIndex: index };
            item.style.opacity = '0.4';
            e.dataTransfer.effectAllowed = 'move';
        });
        item.addEventListener('dragend', () => {
            item.style.opacity = '1';
            this._dragState = null;
            // Clean up any drop indicators
            this.pluginListContainer.querySelectorAll('[data-drop-indicator]').forEach(el => el.remove());
        });
        item.addEventListener('dragover', (e) => {
            if (!this._dragState) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            // Show drop indicator
            const rect = item.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            const insertBefore = e.clientY < midY;
            // Remove old indicators
            this.pluginListContainer.querySelectorAll('[data-drop-indicator]').forEach(el => el.remove());
            const indicator = document.createElement('div');
            indicator.dataset.dropIndicator = '1';
            indicator.style.cssText = 'height: 2px; background-color: var(--color-link); pointer-events: none;';
            if (insertBefore) {
                item.parentNode.insertBefore(indicator, item);
            } else {
                item.parentNode.insertBefore(indicator, item.nextSibling);
            }
            this._dragState.toIndex = insertBefore ? index : index + 1;
        });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            if (!this._dragState) return;
            const from = this._dragState.fromIndex;
            let to = this._dragState.toIndex;
            if (to === undefined) return;
            // Adjust for removal shift
            if (from < to) to--;
            if (from !== to) {
                const [moved] = this.plugins.splice(from, 1);
                this.plugins.splice(to, 0, moved);
                this.remapSelectionAfterMove(from, to);
                this.renderPluginList();
                this.renderSelectedPluginDetails();
            }
        });

        // Context menu for copy/cut/paste
        item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if (!this.selectedPluginIndices.has(index)) {
                this.setPluginSelection([index], index);
                this.renderPluginList();
                this.renderSelectedPluginDetails();
            }
            this._showPluginContextMenu(e.clientX, e.clientY, index);
        });

        // Checkbox for enable/disable
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = plugin.status;
        checkbox.style.cssText = 'cursor: pointer; width: 16px; height: 16px;';
        checkbox.addEventListener('click', (e) => {
            e.stopPropagation();
            plugin.status = checkbox.checked;
        });
        item.appendChild(checkbox);

        // Plugin name
        const nameSpan = document.createElement('span');
        nameSpan.style.cssText = `
            color: ${plugin.status ? 'var(--color-text-strong)' : 'var(--color-text-muted)'};
            font-size: 13px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        `;
        nameSpan.textContent = plugin.name;
        nameSpan.title = plugin.name;
        item.appendChild(nameSpan);

        // Move up/down buttons container
        const btnContainer = document.createElement('div');
        btnContainer.style.cssText = `
            display: flex;
            gap: 2px;
            justify-content: flex-end;
            width: 50px;
        `;

        if (index > 0) {
            const upBtn = document.createElement('button');
            upBtn.textContent = '▲';
            upBtn.style.cssText = `
                padding: 2px 6px;
                background-color: var(--color-border);
                color: var(--color-text);
                border: none;
                cursor: pointer;
                font-size: 10px;
                width: 22px;
                height: 22px;
            `;
            upBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.movePlugin(index, -1);
            });
            btnContainer.appendChild(upBtn);
        } else {
            const spacer = document.createElement('div');
            spacer.style.cssText = 'width: 22px;';
            btnContainer.appendChild(spacer);
        }

        if (index < this.plugins.length - 1) {
            const downBtn = document.createElement('button');
            downBtn.textContent = '▼';
            downBtn.style.cssText = `
                padding: 2px 6px;
                background-color: var(--color-border);
                color: var(--color-text);
                border: none;
                cursor: pointer;
                font-size: 10px;
                width: 22px;
                height: 22px;
            `;
            downBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.movePlugin(index, 1);
            });
            btnContainer.appendChild(downBtn);
        } else {
            const spacer = document.createElement('div');
            spacer.style.cssText = 'width: 22px;';
            btnContainer.appendChild(spacer);
        }

        item.appendChild(btnContainer);

        // Click to select
        item.addEventListener('click', (e) => {
            this.selectPluginFromEvent(index, e);
        });

        return item;
    }

    /**
     * Move plugin up or down in load order
     */
    movePlugin(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.plugins.length) return;

        const temp = this.plugins[index];
        this.plugins[index] = this.plugins[newIndex];
        this.plugins[newIndex] = temp;

        this.remapSelectionAfterMove(index, newIndex);

        this.renderPluginList();
        this.renderSelectedPluginDetails();
    }

    remapSelectionAfterMove(from, to) {
        const remapped = this.getSelectedPluginIndices().map(selected => {
            if (selected === from) return to;
            if (from < to && selected > from && selected <= to) return selected - 1;
            if (from > to && selected >= to && selected < from) return selected + 1;
            return selected;
        });
        const primary = this.selectedPluginIndex === from ? to : remapped[0] ?? -1;
        this.setPluginSelection(remapped, primary);
    }

    /**
     * Show context menu for plugin list item
     */
    _showPluginContextMenu(x, y, index, options = {}) {
        // Remove any existing context menu
        this._hidePluginContextMenu();

        const menu = document.createElement('div');
        menu.id = 'plugin-context-menu';
        menu.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            background-color: var(--color-bg-list-item);
            border: 1px solid var(--color-border-input);
            border-radius: 4px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
            z-index: 20000;
            min-width: 160px;
            padding: 4px 0;
            font-size: 12px;
        `;

        const t = (key, params) => (window.I18n ? window.I18n.t(key, params) : key);
        const selectedCount = this.selectedPluginIndices.has(index) ? this.getSelectedPluginIndices().length : 1;
        const copyLabel = selectedCount > 1 ? t('pluginCtx.copyN', { n: selectedCount }) : t('common.copy');
        const cutLabel = selectedCount > 1 ? t('pluginCtx.cutN', { n: selectedCount }) : t('common.cut');
        const duplicateLabel = selectedCount > 1 ? t('pluginCtx.duplicateN', { n: selectedCount }) : t('common.duplicate');
        const removeLabel = selectedCount > 1 ? t('pluginCtx.removeN', { n: selectedCount }) : t('pluginCtx.removePlugin');

        const items = options.pasteOnly
            ? [{ label: t('pluginCtx.pastePlugin'), shortcut: 'Ctrl+V', action: () => this._pastePlugin(index) }]
            : [
                { label: copyLabel, shortcut: 'Ctrl+C', action: () => this._copyPlugin(index, false) },
                { label: cutLabel, shortcut: 'Ctrl+X', action: () => this._copyPlugin(index, true) },
                { label: t('pluginCtx.pasteAbove'), shortcut: 'Ctrl+V', action: () => this._pastePlugin(index) },
                null, // separator
                { label: duplicateLabel, action: () => this._duplicatePlugin(index) },
                { label: removeLabel, shortcut: 'Del', action: () => this._removeSelectedPlugins() },
            ];

        for (const entry of items) {
            if (entry === null) {
                const sep = document.createElement('div');
                sep.style.cssText = 'height: 1px; background-color: var(--color-border); margin: 4px 0;';
                menu.appendChild(sep);
                continue;
            }
            const row = document.createElement('div');
            row.style.cssText = `
                padding: 5px 12px;
                color: ${entry.disabled ? 'var(--color-border-input)' : 'var(--color-text)'};
                cursor: ${entry.disabled ? 'default' : 'pointer'};
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 16px;
            `;
            const labelSpan = document.createElement('span');
            labelSpan.textContent = entry.label;
            row.appendChild(labelSpan);
            if (entry.shortcut) {
                const shortcutSpan = document.createElement('span');
                shortcutSpan.textContent = entry.shortcut;
                shortcutSpan.style.cssText = 'color: var(--color-text-dim); font-size: 11px;';
                row.appendChild(shortcutSpan);
            }
            if (!entry.disabled) {
                row.addEventListener('mouseenter', () => row.style.backgroundColor = 'var(--color-accent-tint-25)');
                row.addEventListener('mouseleave', () => row.style.backgroundColor = '');
                row.addEventListener('click', () => {
                    this._hidePluginContextMenu();
                    entry.action();
                });
            }
            menu.appendChild(row);
        }

        document.body.appendChild(menu);

        // Close on click outside or escape
        const closeHandler = (e) => {
            if (!menu.contains(e.target)) {
                this._hidePluginContextMenu();
                document.removeEventListener('mousedown', closeHandler);
            }
        };
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this._hidePluginContextMenu();
                document.removeEventListener('keydown', escHandler);
            }
        };
        // Delay so the current click doesn't immediately close
        setTimeout(() => {
            document.addEventListener('mousedown', closeHandler);
            document.addEventListener('keydown', escHandler);
        }, 0);
    }

    _hidePluginContextMenu() {
        const existing = document.getElementById('plugin-context-menu');
        if (existing) existing.remove();
    }

    /**
     * Copy or cut a plugin to the clipboard
     */
    _copyPlugin(index, isCut) {
        const sourceIndices = this.selectedPluginIndices.has(index) ? this.getSelectedPluginIndices() : [index];
        const sourcePlugins = sourceIndices.map(sourceIndex => this.plugins[sourceIndex]).filter(Boolean);
        if (sourcePlugins.length === 0) return;

        const copiedPlugins = JSON.parse(JSON.stringify(sourcePlugins));
        // Deep clone plugins so paste is independent
        this._clipboard = {
            plugins: copiedPlugins,
            plugin: copiedPlugins[0],
            isCut: isCut,
            sourceIndices: sourceIndices
        };

        if (typeof ReactorClipboard !== 'undefined') {
            ReactorClipboard.write('plugin', {
                plugins: copiedPlugins,
                plugin: copiedPlugins[0],
                cut: isCut,
                sourceProjectPath: this.projectController.getCurrentProject()?.path || null
            });
        }

        if (isCut) {
            for (const sourceIndex of [...sourceIndices].sort((a, b) => b - a)) {
                this.plugins.splice(sourceIndex, 1);
            }
            this.clearPluginSelection();
            this.renderPluginList();
            this.renderEmptyDetails();
        }
    }

    /**
     * Paste plugin from clipboard at the given index
     */
    async _pastePlugin(index) {
        let clipboard = this._clipboard;

        if (!clipboard && typeof ReactorClipboard !== 'undefined') {
            const clipboardData = await ReactorClipboard.read('plugin');
            const plugins = clipboardData?.payload?.plugins || (clipboardData?.payload?.plugin ? [clipboardData.payload.plugin] : null);
            if (plugins && plugins.length > 0) {
                clipboard = {
                    plugins,
                    plugin: plugins[0],
                    isCut: !!clipboardData.payload.cut,
                    sourceIndices: null
                };
            }
        }

        const clipboardPlugins = clipboard?.plugins || (clipboard?.plugin ? [clipboard.plugin] : []);
        if (clipboardPlugins.length === 0) {
            alert('No plugin in clipboard to paste.');
            return;
        }

        const pastedPlugins = JSON.parse(JSON.stringify(clipboardPlugins));
        const pasteIndex = Math.max(0, Math.min(index, this.plugins.length));
        this.plugins.splice(pasteIndex, 0, ...pastedPlugins);
        // If it was a local cut, clear the in-memory clipboard (one-time move).
        // Cross-instance cut cannot remove from the source process after paste.
        if (clipboard === this._clipboard && this._clipboard.isCut) {
            this._clipboard = null;
        }
        const pastedIndices = pastedPlugins.map((_, offset) => pasteIndex + offset);
        this.setPluginSelection(pastedIndices, pasteIndex);
        this.renderPluginList();
        this.renderSelectedPluginDetails();
    }

    /**
     * Duplicate a plugin in place (insert copy right below)
     */
    _duplicatePlugin(index) {
        const sourceIndices = this.selectedPluginIndices.has(index) ? this.getSelectedPluginIndices() : [index];
        const copies = JSON.parse(JSON.stringify(sourceIndices.map(sourceIndex => this.plugins[sourceIndex]).filter(Boolean)));
        if (copies.length === 0) return;
        const insertIndex = Math.max(...sourceIndices) + 1;
        this.plugins.splice(insertIndex, 0, ...copies);
        const copiedIndices = copies.map((_, offset) => insertIndex + offset);
        this.setPluginSelection(copiedIndices, insertIndex);
        this.renderPluginList();
        this.renderSelectedPluginDetails();
    }

    _removeSelectedPlugins() {
        const selectedIndices = this.getSelectedPluginIndices();
        if (selectedIndices.length === 0) return;

        const label = selectedIndices.length === 1
            ? `Remove plugin "${this.plugins[selectedIndices[0]].name}"?`
            : `Remove ${selectedIndices.length} selected plugins?`;
        if (!confirm(label)) return;

        for (const index of [...selectedIndices].sort((a, b) => b - a)) {
            this.plugins.splice(index, 1);
        }
        this.clearPluginSelection();
        this.renderPluginList();
        this.renderEmptyDetails();
    }

    /**
     * Show dialog to add a new plugin
     */
    showAddPluginDialog() {
        // Get plugins not already in the list
        const unusedPlugins = this.availablePlugins.filter(name =>
            !this.plugins.find(p => p.name === name)
        );

        if (unusedPlugins.length === 0) {
            alert('All available plugins are already added!');
            return;
        }

        // Create simple selection dialog
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 10000;
            display: flex;
            justify-content: center;
            align-items: center;
        `;

        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 400px;
            max-height: 600px;
            display: flex;
            flex-direction: column;
        `;

        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-input);
            border-bottom: 1px solid var(--color-border);
            color: var(--color-text-strong);
            font-weight: bold;
        `;
        header.textContent = 'Add Plugin';
        dialog.appendChild(header);

        const listContainer = document.createElement('div');
        listContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 8px;
        `;

        unusedPlugins.forEach(name => {
            const item = document.createElement('div');
            item.style.cssText = `
                padding: 8px 12px;
                color: var(--color-text);
                cursor: pointer;
                border-radius: 3px;
            `;
            item.textContent = name;
            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = 'var(--color-bg-input)';
            });
            item.addEventListener('mouseleave', () => {
                item.style.backgroundColor = 'transparent';
            });
            item.addEventListener('click', () => {
                this.addPlugin(name);
                document.body.removeChild(modal);
            });
            listContainer.appendChild(item);
        });

        dialog.appendChild(listContainer);

        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-panel);
            display: flex;
            justify-content: flex-end;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        footer.appendChild(cancelBtn);

        dialog.appendChild(footer);
        modal.appendChild(dialog);
        document.body.appendChild(modal);
    }

    /**
     * Add a plugin to the list
     */
    async addPlugin(pluginName) {
        try {
            const currentProject = this.projectController.getCurrentProject();
            const projectPath = currentProject.path;
            const pluginPath = this.path.join(projectPath, 'js', 'plugins', `${pluginName}.js`);

            // Read plugin file to extract metadata and parameters
            const pluginSource = this.fs.readFileSync(pluginPath, 'utf8');
            const parameters = this.parsePluginParameters(pluginSource);
            const description = this.parsePluginDescription(pluginSource);
            const author = this.parsePluginAuthor(pluginSource);
            const url = this.parsePluginUrl(pluginSource);
            const help = this.parsePluginHelp(pluginSource);

            const newPlugin = {
                name: pluginName,
                status: true,
                description: description,
                author: author,
                url: url,
                help: help,
                parameters: parameters
            };

            this.plugins.push(newPlugin);
            this.renderPluginList();
        } catch (err) {
            console.error('Error adding plugin:', err);
            alert(`Error adding plugin: ${err.message}`);
        }
    }

    /**
     * Normalize a comment block line by stripping the optional leading `*` prefix.
     * Handles both ` * @param Foo` (Format A) and `@param Foo` (Format B).
     */
    normalizeAnnotationLine(line) {
        return line.trim().replace(/^\*\s?/, '');
    }

    /**
     * Parse plugin description from source
     */
    parsePluginDescription(source) {
        const commentBlock = source.match(/\/\*:([\s\S]*?)\*\//);
        if (!commentBlock) return '';
        const lines = commentBlock[1].split('\n');
        for (const line of lines) {
            const normalized = this.normalizeAnnotationLine(line);
            const match = normalized.match(/^@plugindesc\s+(.+)/);
            if (match) return match[1];
        }
        return '';
    }

    /**
     * Parse plugin help documentation from source
     */
    parsePluginHelp(source) {
        const commentBlock = source.match(/\/\*:([\s\S]*?)\*\//);
        if (!commentBlock) return '';
        const lines = commentBlock[1].split('\n');
        const cleanedLines = [];
        let inHelp = false;

        for (const line of lines) {
            const normalized = this.normalizeAnnotationLine(line);
            if (!inHelp) {
                if (normalized.match(/^@help/)) {
                    inHelp = true;
                    const afterHelp = normalized.replace(/^@help\s*/, '');
                    if (afterHelp) cleanedLines.push(afterHelp);
                }
            } else {
                if (normalized.match(/^@/)) break;
                cleanedLines.push(normalized);
            }
        }

        return cleanedLines.join('\n').trim();
    }

    /**
     * Parse plugin author from source
     */
    parsePluginAuthor(source) {
        const commentBlock = source.match(/\/\*:([\s\S]*?)\*\//);
        if (!commentBlock) return '';
        const lines = commentBlock[1].split('\n');
        for (const line of lines) {
            const normalized = this.normalizeAnnotationLine(line);
            const match = normalized.match(/^@author\s+(.+)/);
            if (match) return match[1].trim();
        }
        return '';
    }

    /**
     * Parse plugin URL from source
     */
    parsePluginUrl(source) {
        const commentBlock = source.match(/\/\*:([\s\S]*?)\*\//);
        if (!commentBlock) return '';
        const lines = commentBlock[1].split('\n');
        for (const line of lines) {
            const normalized = this.normalizeAnnotationLine(line);
            const match = normalized.match(/^@url\s+(.+)/);
            if (match) return match[1].trim();
        }
        return '';
    }

    /**
     * Parse plugin parameters from source (default values)
     * Only parses the main /*: block, not struct definitions
     */
    parsePluginParameters(source) {
        const params = {};

        // Match only the first comment block /*: ... */
        // This stops at the first */ which ends the main plugin header
        const commentBlock = source.match(/\/\*:([\s\S]*?)\*\//);

        if (!commentBlock) return params;

        const lines = commentBlock[0].split('\n');
        let currentParam = null;

        for (const line of lines) {
            const normalized = this.normalizeAnnotationLine(line);

            // @param defines a new parameter - capture everything including spaces
            const paramMatch = normalized.match(/^@param\s*(.*)/);
            if (paramMatch) {
                const paramName = paramMatch[1].trim();
                // Skip empty @param lines (used as separators in some plugins)
                if (paramName === '') {
                    currentParam = null;
                    continue;
                }
                currentParam = paramName;
                continue;
            }

            // @default sets the default value (allow empty)
            if (currentParam) {
                const defaultMatch = normalized.match(/^@default(?:\s+(.*))?$/);
                if (defaultMatch) {
                    params[currentParam] = defaultMatch[1] !== undefined ? defaultMatch[1] : '';
                }
            }
        }

        return params;
    }

    /**
     * Render empty details panel
     */
    renderEmptyDetails() {
        this.detailsContainer.innerHTML = '';

        const emptyMessage = document.createElement('div');
        emptyMessage.style.cssText = `
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100%;
            color: var(--color-text-dim);
            font-size: 14px;
        `;
        emptyMessage.textContent = 'Select a plugin to view details';
        this.detailsContainer.appendChild(emptyMessage);
    }

    /**
     * Render plugin details and parameter editor
     */
    renderPluginDetails(plugin) {
        this.detailsContainer.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.style.cssText = `
            padding: 12px 16px;
            background-color: var(--color-bg-list-item);
            border-bottom: 1px solid var(--color-border);
        `;

        const name = document.createElement('h3');
        name.style.cssText = 'margin: 0 0 8px 0; color: var(--color-text-strong); font-size: 16px;';
        name.textContent = plugin.name;
        header.appendChild(name);

        if (plugin.description) {
            const desc = document.createElement('div');
            desc.style.cssText = 'color: var(--color-text-muted); font-size: 12px; line-height: 1.4; margin-bottom: 8px;';
            desc.textContent = plugin.description;
            header.appendChild(desc);
        }

        // Author and URL info
        const metaInfo = document.createElement('div');
        metaInfo.style.cssText = 'display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px;';

        if (plugin.author) {
            const authorDiv = document.createElement('div');
            authorDiv.style.cssText = 'font-size: 13px;';

            const authorLabel = document.createElement('span');
            authorLabel.style.cssText = 'color: var(--color-text-muted);';
            authorLabel.textContent = 'Author: ';
            authorDiv.appendChild(authorLabel);

            const authorValue = document.createElement('span');
            authorValue.style.cssText = 'color: var(--color-text);';
            authorValue.textContent = plugin.author;
            authorDiv.appendChild(authorValue);

            metaInfo.appendChild(authorDiv);
        }

        if (plugin.url) {
            const urlDiv = document.createElement('div');
            urlDiv.style.cssText = 'font-size: 13px;';

            const urlLabel = document.createElement('span');
            urlLabel.style.cssText = 'color: var(--color-text-muted);';
            urlLabel.textContent = 'URL: ';
            urlDiv.appendChild(urlLabel);

            const urlLink = document.createElement('a');
            urlLink.href = plugin.url;
            urlLink.target = '_blank';
            urlLink.style.cssText = 'color: var(--color-link); text-decoration: none;';
            urlLink.textContent = plugin.url;
            urlLink.addEventListener('mouseenter', () => urlLink.style.textDecoration = 'underline');
            urlLink.addEventListener('mouseleave', () => urlLink.style.textDecoration = 'none');
            urlDiv.appendChild(urlLink);

            metaInfo.appendChild(urlDiv);
        }

        if (plugin.author || plugin.url) {
            header.appendChild(metaInfo);
        }

        this.detailsContainer.appendChild(header);

        // Help/Documentation section (if available)
        if (plugin.help) {
            const helpSection = document.createElement('details');
            helpSection.style.cssText = `
                padding: 12px 16px;
                background-color: var(--color-bg-list-item);
                border-bottom: 1px solid var(--color-border);
            `;

            const summary = document.createElement('summary');
            summary.style.cssText = `
                color: var(--color-link);
                cursor: pointer;
                font-size: 13px;
                font-weight: bold;
                margin-bottom: 8px;
            `;
            summary.textContent = 'Plugin Help & Documentation';
            helpSection.appendChild(summary);

            const helpContent = document.createElement('pre');
            helpContent.style.cssText = `
                margin: 8px 0 0 0;
                padding: 12px;
                background-color: var(--color-bg-surface);
                border: 1px solid var(--color-border);
                border-radius: 3px;
                color: var(--color-text);
                font-size: 11px;
                line-height: 1.6;
                white-space: pre-wrap;
                overflow-x: auto;
                max-height: 300px;
                overflow-y: auto;
            `;
            helpContent.textContent = plugin.help;
            helpSection.appendChild(helpContent);

            this.detailsContainer.appendChild(helpSection);
        }

        // Parameters section
        const paramsContainer = document.createElement('div');
        paramsContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 10px;
        `;

        const paramsTitle = document.createElement('h4');
        paramsTitle.style.cssText = 'margin: 0 0 8px 0; color: var(--color-text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 1px;';
        paramsTitle.textContent = 'Parameters';
        paramsContainer.appendChild(paramsTitle);

        // Always parse metadata from source to determine available parameters.
        // Stale plugin entries can reference files that no longer exist; keep
        // those entries removable instead of aborting the details panel render.
        const currentProject = this.projectController.getCurrentProject();
        const projectPath = currentProject.path;
        const pluginPath = this.path.join(projectPath, 'js', 'plugins', `${plugin.name}.js`);
        const pluginFileExists = this.fs.existsSync(pluginPath);
        const pluginSource = pluginFileExists ? this.fs.readFileSync(pluginPath, 'utf8') : '';
        const paramMetadata = pluginFileExists ? this.parsePluginParameterMetadata(pluginSource) : {};

        if (!pluginFileExists) {
            const missingFile = document.createElement('div');
            missingFile.style.cssText = `
                margin-bottom: 10px;
                padding: 10px 12px;
                background-color: rgba(255, 136, 0, 0.12);
                border: 1px solid rgba(255, 136, 0, 0.45);
                border-radius: 4px;
                color: #ffb366;
                font-size: 12px;
                line-height: 1.4;
            `;
            missingFile.textContent = `Plugin file missing: js/plugins/${plugin.name}.js. This entry can be removed and saved.`;
            paramsContainer.appendChild(missingFile);
        }

        if (Object.keys(paramMetadata).length === 0) {
            const noParams = document.createElement('div');
            noParams.style.cssText = 'color: var(--color-text-dim); font-size: 13px;';
            noParams.textContent = pluginFileExists ? 'This plugin has no configurable parameters.' : 'No parameters available because the plugin file is missing.';
            paramsContainer.appendChild(noParams);
        } else {
            // Build merged params: all metadata keys, using saved values where available,
            // falling back to @default from metadata
            const mergedParams = {};
            for (const key of Object.keys(paramMetadata)) {
                if (plugin.parameters.hasOwnProperty(key)) {
                    mergedParams[key] = plugin.parameters[key];
                } else {
                    mergedParams[key] = paramMetadata[key].default || '';
                }
            }

            // Organize parameters hierarchically
            const organizedParams = this.organizeParametersHierarchically(mergedParams, paramMetadata);

            // Render organized parameters
            this.renderParameterTree(paramsContainer, plugin, organizedParams, paramMetadata);
        }

        this.detailsContainer.appendChild(paramsContainer);

        // Footer with delete button
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            background-color: var(--color-bg-panel);
            display: flex;
            justify-content: flex-end;
        `;

        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = 'Remove Plugin';
        deleteBtn.style.cssText = `
            padding: 6px 16px;
            background-color: var(--color-danger-soft);
            color: var(--color-text-strong);
            border: none;
            border-radius: 3px;
            cursor: pointer;
        `;
        deleteBtn.addEventListener('click', () => {
            this._removeSelectedPlugins();
        });
        footer.appendChild(deleteBtn);

        this.detailsContainer.appendChild(footer);
    }

    /**
     * Organize parameters into hierarchical structure based on @parent relationships
     */
    organizeParametersHierarchically(parameters, metadata) {
        const result = [];
        const paramKeys = Object.keys(parameters);

        // Build a map of children for each parent
        const childrenMap = {};
        for (const key of paramKeys) {
            const meta = metadata[key];
            if (meta && meta.parent) {
                if (!childrenMap[meta.parent]) {
                    childrenMap[meta.parent] = [];
                }
                childrenMap[meta.parent].push(key);
            }
        }

        // Find root parameters (those without parents)
        const rootParams = paramKeys.filter(key => {
            const meta = metadata[key];
            return !meta || !meta.parent;
        });

        // Build tree recursively
        const buildNode = (key) => {
            return {
                key: key,
                children: (childrenMap[key] || []).map(childKey => buildNode(childKey))
            };
        };

        return rootParams.map(key => buildNode(key));
    }

    /**
     * Render parameter tree recursively
     */
    renderParameterTree(container, plugin, nodes, metadata, depth = 0) {
        for (const node of nodes) {
            const key = node.key;
            const meta = metadata[key] || {};
            const value = plugin.parameters.hasOwnProperty(key) ? plugin.parameters[key] : (meta.default || '');

            // Create parameter input with depth information
            const paramItem = this.createParameterInputWithDepth(plugin, key, value, meta, depth);
            container.appendChild(paramItem);

            // Render children
            if (node.children && node.children.length > 0) {
                this.renderParameterTree(container, plugin, node.children, metadata, depth + 1);
            }
        }
    }

    /**
     * Create parameter input field with depth information
     */
    createParameterInputWithDepth(plugin, key, value, metadata, depth) {
        // Check if this is a separator (text is '-' or '---' etc, or key is empty)
        const isSeparator = key === '' || metadata.text === '-' || /^-+$/.test(metadata.text);

        // Check if this is a header-only parameter (no @default annotation at all)
        // Header params are used for grouping and have children
        // null means no @default was declared; '' means @default with empty value (real param)
        const isHeaderOnly = metadata.default === null && !isSeparator;

        const container = document.createElement('div');

        // Calculate indentation based on depth
        const leftPadding = 12 + (depth * 20);

        // Separators are styled differently
        if (isSeparator) {
            container.style.cssText = `
                margin: 10px 0 4px ${leftPadding}px;
                padding: 0;
                border-bottom: 1px solid var(--color-border);
            `;
            return container;
        }

        // Header-only parameters (grouping labels)
        if (isHeaderOnly) {
            // Clean up display name: strip leading arrows/decorators
            const displayName = (metadata.text || key).replace(/^->\s*/, '').replace(/<+$/, '').trim();

            container.style.cssText = `
                margin: ${depth > 0 ? '6px' : '10px'} 0 2px 0;
                padding: 5px 10px 5px ${leftPadding}px;
                background: linear-gradient(90deg, #2a3a4a 0%, var(--color-bg-surface) 100%);
                border-left: 3px solid var(--color-syntax-keyword);
                border-radius: 0 3px 3px 0;
            `;

            const header = document.createElement('div');
            header.style.cssText = `
                color: #7cb8e4;
                font-weight: bold;
                font-size: 12px;
                text-transform: uppercase;
                letter-spacing: 0.5px;
            `;
            header.textContent = displayName;
            container.appendChild(header);

            if (metadata.desc) {
                const desc = document.createElement('div');
                desc.style.cssText = 'color: var(--color-text-muted); font-size: 10px; margin-top: 2px;';
                desc.textContent = metadata.desc;
                container.appendChild(desc);
            }

            return container;
        }

        // Regular parameter
        container.style.cssText = `
            margin-bottom: 4px;
            padding: 6px 8px;
            padding-left: ${leftPadding}px;
            background-color: ${depth > 0 ? '#262626' : 'var(--color-bg-list-item)'};
            border-radius: 2px;
            ${depth > 0 ? 'border-left: 2px solid var(--color-border-subtle);' : ''}
            display: flex;
            align-items: center;
            gap: 8px;
            min-height: 32px;
        `;

        const labelContainer = document.createElement('div');
        labelContainer.style.cssText = `
            flex: 0 0 35%;
            min-width: 150px;
        `;

        const label = document.createElement('div');
        label.style.cssText = 'color: var(--color-text); font-size: 12px; line-height: 1.3;';
        label.textContent = metadata.text || key;
        labelContainer.appendChild(label);

        if (metadata.desc) {
            const desc = document.createElement('div');
            desc.style.cssText = 'color: var(--color-text-muted); font-size: 11px; line-height: 1.2; margin-top: 1px;';
            desc.textContent = metadata.desc;
            labelContainer.appendChild(desc);
        }

        container.appendChild(labelContainer);

        // Input wrapper takes remaining space, capped at a reasonable width
        const inputWrapper = document.createElement('div');
        inputWrapper.style.cssText = 'flex: 1; min-width: 0; max-width: 500px;';

        // Shared input style
        const inputStyle = `
            width: 100%;
            padding: 4px 8px;
            background-color: var(--color-border);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 2px;
            font-size: 12px;
            box-sizing: border-box;
        `;

        // Check if this is a struct or array type
        const isStruct = metadata.type && metadata.type.includes('struct<');
        const isArray = metadata.type && metadata.type.includes('[]');
        const isComplexType = isStruct || (isArray && !metadata.type.startsWith('number') && !metadata.type.startsWith('string') && !metadata.type.startsWith('boolean'));

        if (isComplexType) {
            const editButton = document.createElement('button');
            editButton.textContent = `Edit...`;
            editButton.style.cssText = `
                padding: 4px 12px;
                background-color: var(--color-accent);
                color: var(--color-bg-deep);
                border: 1px solid var(--color-accent);
                border-radius: 2px;
                cursor: pointer;
                font-size: 11px;
                font-weight: bold;
            `;
            editButton.addEventListener('mouseenter', () => { editButton.style.backgroundColor = 'var(--color-accent-muted)'; });
            editButton.addEventListener('mouseleave', () => { editButton.style.backgroundColor = 'var(--color-accent)'; });
            editButton.addEventListener('click', () => {
                this.showComplexParameterEditor(plugin, key, value, metadata);
            });
            inputWrapper.appendChild(editButton);
            container.appendChild(inputWrapper);
            return container;
        }

        // Handle combo type (dropdown with predefined options)
        if (metadata.type === 'combo' && metadata.options && metadata.options.length > 0) {
            const select = document.createElement('select');
            select.style.cssText = inputStyle;

            for (const option of metadata.options) {
                const opt = document.createElement('option');
                opt.value = option;
                opt.textContent = option;
                opt.selected = value === option;
                select.appendChild(opt);
            }

            select.addEventListener('change', (e) => {
                plugin.parameters[key] = e.target.value;
            });

            inputWrapper.appendChild(select);
            container.appendChild(inputWrapper);
            return container;
        }

        // Handle select type (same as combo)
        if (metadata.type === 'select' && metadata.options && metadata.options.length > 0) {
            const select = document.createElement('select');
            select.style.cssText = inputStyle;

            for (const option of metadata.options) {
                const opt = document.createElement('option');
                opt.value = option;
                opt.textContent = option;
                opt.selected = value === option;
                select.appendChild(opt);
            }

            select.addEventListener('change', (e) => {
                plugin.parameters[key] = e.target.value;
            });

            inputWrapper.appendChild(select);
            container.appendChild(inputWrapper);
            return container;
        }

        // Handle boolean type
        if (metadata.type === 'boolean') {
            const select = document.createElement('select');
            select.style.cssText = inputStyle;

            const trueOpt = document.createElement('option');
            trueOpt.value = 'true';
            trueOpt.textContent = metadata.on || 'true';
            trueOpt.selected = value === 'true';

            const falseOpt = document.createElement('option');
            falseOpt.value = 'false';
            falseOpt.textContent = metadata.off || 'false';
            falseOpt.selected = value === 'false';

            select.appendChild(trueOpt);
            select.appendChild(falseOpt);

            select.addEventListener('change', (e) => {
                plugin.parameters[key] = e.target.value;
            });

            inputWrapper.appendChild(select);
            container.appendChild(inputWrapper);
            return container;
        }

        // Handle number type
        if (metadata.type === 'number') {
            const input = document.createElement('input');
            input.type = 'number';
            input.value = value;
            if (metadata.min !== null) input.min = metadata.min;
            if (metadata.max !== null) input.max = metadata.max;
            input.style.cssText = inputStyle;
            input.addEventListener('change', (e) => {
                plugin.parameters[key] = e.target.value;
            });
            inputWrapper.appendChild(input);
            container.appendChild(inputWrapper);
            return container;
        }

        // Handle file type - scan directory and show dropdown
        if (metadata.type && metadata.type === 'file' && metadata.dir) {
            const select = document.createElement('select');
            select.style.cssText = inputStyle;

            // Add empty/none option
            const noneOpt = document.createElement('option');
            noneOpt.value = '';
            noneOpt.textContent = '(none)';
            noneOpt.selected = !value;
            select.appendChild(noneOpt);

            // Scan the directory for files
            try {
                const currentProject = this.projectController.getCurrentProject();
                const dirPath = this.path.join(currentProject.path, metadata.dir);
                if (this.fs.existsSync(dirPath)) {
                    const files = this.fs.readdirSync(dirPath);
                    const imageExts = ['.png', '.jpg', '.jpeg', '.webp', '.bmp'];
                    const audioExts = ['.ogg', '.m4a', '.wav', '.mp3'];
                    const validExts = metadata.dir.includes('img') ? imageExts : audioExts;
                    const filtered = files
                        .filter(f => validExts.some(ext => f.toLowerCase().endsWith(ext)))
                        .map(f => f.replace(/\.[^.]+$/, ''))
                        .sort();
                    for (const fileName of filtered) {
                        const opt = document.createElement('option');
                        opt.value = fileName;
                        opt.textContent = fileName;
                        opt.selected = value === fileName;
                        select.appendChild(opt);
                    }
                }
            } catch (e) {
                // Fallback: if directory scan fails, allow text input
                console.warn('Could not scan directory:', metadata.dir, e);
            }

            select.addEventListener('change', (e) => {
                plugin.parameters[key] = e.target.value;
            });

            inputWrapper.appendChild(select);
            container.appendChild(inputWrapper);
            return container;
        }

        // Handle other file-like types (animation, common_event, switch, variable, file[])
        if (metadata.type && (metadata.type.includes('file') || metadata.type.includes('animation') || metadata.type.includes('common_event') || metadata.type.includes('switch') || metadata.type.includes('variable'))) {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = value || '';
            input.style.cssText = inputStyle;
            input.placeholder = metadata.dir || '';
            input.addEventListener('change', (e) => {
                plugin.parameters[key] = e.target.value;
            });

            inputWrapper.appendChild(input);
            container.appendChild(inputWrapper);
            return container;
        }

        // Default: text input
        const input = document.createElement('input');
        input.type = 'text';
        input.value = value || '';
        input.style.cssText = inputStyle;
        input.addEventListener('change', (e) => {
            plugin.parameters[key] = e.target.value;
        });

        inputWrapper.appendChild(input);
        container.appendChild(inputWrapper);
        return container;
    }

    /**
     * Parse struct definitions from plugin source
     */
    parseStructDefinitions(source) {
        const structs = {};

        // Match all struct definition blocks: /*~struct~StructName:
        const structBlocks = source.match(/\/\*~struct~(\w+):([\s\S]*?)(?=\/\*~struct~|\*\/\s*$)/g);

        if (!structBlocks) return structs;

        for (const block of structBlocks) {
            const nameMatch = block.match(/\/\*~struct~(\w+):/);
            if (!nameMatch) continue;

            const structName = nameMatch[1];
            structs[structName] = {};

            const lines = block.split('\n');
            let currentParam = null;

            for (const line of lines) {
                const normalized = this.normalizeAnnotationLine(line);

                const paramMatch = normalized.match(/^@param\s*(.*)/);
                if (paramMatch) {
                    const paramName = paramMatch[1].trim();
                    // Skip empty @param lines (used as separators)
                    if (paramName === '') {
                        currentParam = null;
                        continue;
                    }
                    currentParam = paramName;
                    structs[structName][currentParam] = {
                        text: '',
                        desc: '',
                        type: 'string',
                        default: '',
                        min: null,
                        max: null,
                        options: [],
                        on: null,
                        off: null
                    };
                    continue;
                }

                if (currentParam && structs[structName][currentParam]) {
                    const textMatch = normalized.match(/^@text\s+(.+)/);
                    if (textMatch) {
                        structs[structName][currentParam].text = textMatch[1];
                        continue;
                    }

                    const descMatch = normalized.match(/^@desc\s+(.+)/);
                    if (descMatch) {
                        const descText = descMatch[1];
                        if (structs[structName][currentParam].desc) {
                            structs[structName][currentParam].desc += ' ' + descText;
                        } else {
                            structs[structName][currentParam].desc = descText;
                        }
                        continue;
                    }

                    const typeMatch = normalized.match(/^@type\s+(.+)/);
                    if (typeMatch) {
                        structs[structName][currentParam].type = typeMatch[1];
                        continue;
                    }

                    const defaultMatch = normalized.match(/^@default(?:\s+(.*))?$/);
                    if (defaultMatch) {
                        structs[structName][currentParam].default = defaultMatch[1] !== undefined ? defaultMatch[1] : '';
                        continue;
                    }

                    const minMatch = normalized.match(/^@min\s+(\S+)/);
                    if (minMatch) {
                        structs[structName][currentParam].min = minMatch[1];
                        continue;
                    }

                    const maxMatch = normalized.match(/^@max\s+(\S+)/);
                    if (maxMatch) {
                        structs[structName][currentParam].max = maxMatch[1];
                        continue;
                    }

                    const optionMatch = normalized.match(/^@option\s+(.+)/);
                    if (optionMatch) {
                        structs[structName][currentParam].options.push(optionMatch[1]);
                        continue;
                    }

                    const onMatch = normalized.match(/^@on\s+(.+)/);
                    if (onMatch) {
                        structs[structName][currentParam].on = onMatch[1];
                        continue;
                    }

                    const offMatch = normalized.match(/^@off\s+(.+)/);
                    if (offMatch) {
                        structs[structName][currentParam].off = offMatch[1];
                        continue;
                    }
                }
            }
        }

        return structs;
    }

    /**
     * Parse plugin parameter metadata (type, text, desc, etc.)
     * Only parses the main /*: block, not struct definitions
     */
    parsePluginParameterMetadata(source) {
        const metadata = {};

        // Match only the first comment block /*: ... */
        // This stops at the first */ which ends the main plugin header
        const commentBlock = source.match(/\/\*:([\s\S]*?)\*\//);

        if (!commentBlock) return metadata;

        const lines = commentBlock[0].split('\n');
        let currentParam = null;

        for (const line of lines) {
            const normalized = this.normalizeAnnotationLine(line);

            // Reset currentParam if we hit a @command or @arg (plugin commands)
            // This prevents plugin command args from polluting parameter metadata
            if (normalized.match(/^@command\s+/) || normalized.match(/^@arg\s+/)) {
                currentParam = null;
                continue;
            }

            const paramMatch = normalized.match(/^@param\s*(.*)/);
            if (paramMatch) {
                const paramName = paramMatch[1].trim();
                // Skip empty @param lines (used as separators in some plugins)
                if (paramName === '') {
                    currentParam = null;
                    continue;
                }
                currentParam = paramName;
                metadata[currentParam] = {
                    text: '',
                    desc: '',
                    descLines: [], // Support multi-line descriptions
                    type: 'string',
                    default: null, // null = no @default annotation; '' = @default with empty value
                    parent: null,
                    on: null,  // For boolean labels
                    off: null, // For boolean labels
                    min: null,
                    max: null,
                    dir: null, // For file[] types
                    options: [] // For combo/select types
                };
                continue;
            }

            if (currentParam && metadata[currentParam]) {
                const textMatch = normalized.match(/^@text\s+(.+)/);
                if (textMatch) {
                    metadata[currentParam].text = textMatch[1];
                    continue;
                }

                const descMatch = normalized.match(/^@desc\s+(.+)/);
                if (descMatch) {
                    const descText = descMatch[1];
                    // Append to existing description
                    if (metadata[currentParam].desc) {
                        metadata[currentParam].desc += ' ' + descText;
                    } else {
                        metadata[currentParam].desc = descText;
                    }
                    metadata[currentParam].descLines.push(descText);
                    continue;
                }

                const typeMatch = normalized.match(/^@type\s+(.+)/);
                if (typeMatch) {
                    metadata[currentParam].type = typeMatch[1];
                    continue;
                }

                const parentMatch = normalized.match(/^@parent\s+(.+)/);
                if (parentMatch) {
                    metadata[currentParam].parent = parentMatch[1].trim();
                    continue;
                }

                const defaultMatch = normalized.match(/^@default(?:\s+(.*))?$/);
                if (defaultMatch) {
                    metadata[currentParam].default = defaultMatch[1] !== undefined ? defaultMatch[1] : '';
                    continue;
                }

                const onMatch = normalized.match(/^@on\s+(.+)/);
                if (onMatch) {
                    metadata[currentParam].on = onMatch[1];
                    continue;
                }

                const offMatch = normalized.match(/^@off\s+(.+)/);
                if (offMatch) {
                    metadata[currentParam].off = offMatch[1];
                    continue;
                }

                const minMatch = normalized.match(/^@min\s+(\S+)/);
                if (minMatch) {
                    metadata[currentParam].min = minMatch[1];
                    continue;
                }

                const maxMatch = normalized.match(/^@max\s+(\S+)/);
                if (maxMatch) {
                    metadata[currentParam].max = maxMatch[1];
                    continue;
                }

                const dirMatch = normalized.match(/^@dir\s+(.+)/);
                if (dirMatch) {
                    metadata[currentParam].dir = dirMatch[1];
                    continue;
                }

                const optionMatch = normalized.match(/^@option\s+(.+)/);
                if (optionMatch) {
                    metadata[currentParam].options.push(optionMatch[1]);
                    continue;
                }
            }
        }

        return metadata;
    }


    /**
     * Save plugins to the project's plugins file (reactor_plugins.js or plugins.js)
     */
    async savePlugins() {
        try {
            const currentProject = this.projectController.getCurrentProject();
            if (!currentProject || !currentProject.path) {
                alert('No project loaded');
                return;
            }

            const projectPath = currentProject.path;
            // Use the path we loaded from, or default to reactor_plugins.js
            const pluginsPath = this._pluginsFilePath || this.path.join(projectPath, 'js', 'reactor_plugins.js');
            const isRpgMakerPluginsFile = this.path.basename(pluginsPath) === 'plugins.js';
            const pluginsToWrite = isRpgMakerPluginsFile
                ? this.serializeRpgMakerPlugins(this.plugins)
                : this.plugins;
            const header = isRpgMakerPluginsFile
                ? '// Generated by RPG Maker.\n// Do not edit this file directly.\n'
                : '// Generated by RPG Reactor Plugin Manager\n// Do not edit this file directly - use the Plugin Manager instead\n';

            // Generate the file content
            const content = `${header}
var $plugins =
${JSON.stringify(pluginsToWrite, null, 4)};
`;

            this.fs.writeFileSync(pluginsPath, content, 'utf8');
            alert('Plugins saved successfully!');
        } catch (err) {
            console.error('Error saving plugins:', err);
            alert(`Error saving plugins: ${err.message}`);
        }
    }

    serializeRpgMakerPlugins(plugins) {
        return (plugins || []).map(plugin => ({
            name: String(plugin.name || ''),
            status: !!plugin.status,
            description: String(plugin.description || ''),
            parameters: this.serializeRpgMakerPluginParameters(plugin.parameters)
        }));
    }

    serializeRpgMakerPluginParameters(parameters) {
        const result = {};
        if (!parameters || typeof parameters !== 'object') {
            return result;
        }

        for (const [key, value] of Object.entries(parameters)) {
            result[key] = value == null ? '' : String(value);
        }

        return result;
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PluginManager;
}
