/**
 * EventEditor - Main event editor panel
 * Handles the overall event editing interface
 */
class EventEditor {
    constructor(mapManager, databaseManager, projectController) {
        this.mapManager = mapManager;
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.currentEvent = null;
        this.currentPageIndex = 0;
        this.clipboard = null; // For copy/paste event pages
        this.commandList = new EventCommandList(this); // Command list manager
    }

    /**
     * Show event editor panel
     */
    showEventEditor(container, event) {
        this.currentEvent = event;
        this.currentPageIndex = 0;

        // Ensure event has at least one page
        if (!event.pages || event.pages.length === 0) {
            event.pages = [this.createDefaultPage()];
        }

        // Clear container
        container.innerHTML = '';
        container.className = 'event-editor-container';
        container.style.cssText = `
            display: flex;
            flex-direction: column;
            height: 100%;
            overflow: hidden;
        `;

        // Create header
        const header = this.createHeader(event);
        container.appendChild(header);

        // Create main content area
        const contentArea = document.createElement('div');
        contentArea.className = 'event-editor-content';
        contentArea.style.cssText = `
            display: flex;
            gap: 12px;
            padding: 12px;
            flex: 1;
            overflow: hidden;
            min-height: 0;
        `;

        // Create left column (event page configuration)
        const leftColumn = this.createLeftColumn(event);
        leftColumn.style.flex = '0 0 400px';
        leftColumn.style.minWidth = '400px';
        leftColumn.style.height = '100%';
        contentArea.appendChild(leftColumn);

        // Create right column (event commands/contents)
        const rightColumn = this.createRightColumn(event);
        rightColumn.style.flex = '1';
        rightColumn.style.minWidth = '400px';
        rightColumn.style.height = '100%';
        contentArea.appendChild(rightColumn);

        container.appendChild(contentArea);

        // Render current page
        this.renderCurrentPage();
    }

    /**
     * Save changes and close editor
     */
    saveAndClose() {
        // Changes are already saved in real-time
        this.closeEditor();
    }

    /**
     * Apply changes without closing
     */
    applyChanges() {
        // Changes are already saved in real-time
        console.log('Changes applied');
        // Could add visual feedback here
    }

    /**
     * Close the editor
     */
    closeEditor() {
        const modal = document.getElementById('event-editor-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    }

    /**
     * Create header with event name and basic info
     */
    createHeader(event) {
        const header = document.createElement('div');
        header.className = 'event-editor-header';
        header.style.padding = '8px 12px';
        header.style.backgroundColor = 'var(--color-bg-list-item-alt)';
        header.style.borderBottom = '1px solid var(--color-border)';
        header.style.display = 'flex';
        header.style.flexDirection = 'column';
        header.style.gap = '6px';
        header.style.flexShrink = '0';

        // Top row - Name, Position, and Page Management Buttons
        const topRow = document.createElement('div');
        topRow.style.display = 'flex';
        topRow.style.alignItems = 'center';
        topRow.style.gap = '16px';
        topRow.innerHTML = `
            <div style="flex: 1; display: flex; align-items: center; gap: 16px;">
                <div>
                    <label style="font-weight: bold; margin-right: 8px;">Event Name:</label>
                    <input type="text"
                           class="event-name-input"
                           value="${event.name || ''}"
                           style="width: 200px; padding: 4px 8px;"
                           data-event-id="${event.id}">
                </div>
                <div>
                    <label style="font-weight: bold; margin-right: 8px;">Position:</label>
                    <span>X: ${event.x}, Y: ${event.y}</span>
                </div>
            </div>
        `;

        // Add page management buttons to top row
        const pageButtons = this.createPageButtons();
        pageButtons.style.flexShrink = '0';
        topRow.appendChild(pageButtons);

        // Bottom row - Note
        const noteRow = document.createElement('div');
        noteRow.style.display = 'flex';
        noteRow.style.alignItems = 'flex-start';
        noteRow.style.gap = '8px';
        noteRow.innerHTML = `
            <label style="font-weight: bold; min-width: 80px; flex-shrink: 0;">Note:</label>
            <textarea class="event-note-input"
                      style="flex: 1; padding: 4px 8px; min-height: 40px; resize: vertical; font-family: monospace; font-size: 11px; background: var(--color-bg-surface); color: var(--color-text); border: 1px solid var(--color-border-input);"
                      data-event-id="${event.id}">${event.note || ''}</textarea>
        `;

        header.appendChild(topRow);
        header.appendChild(noteRow);

        // Add event listener for name changes
        setTimeout(() => {
            const nameInput = header.querySelector('.event-name-input');
            if (nameInput) {
                nameInput.addEventListener('change', (e) => {
                    event.name = e.target.value;
                });
            }

            const noteInput = header.querySelector('.event-note-input');
            if (noteInput) {
                noteInput.addEventListener('change', (e) => {
                    event.note = e.target.value;
                });
            }
        }, 0);

        return header;
    }

    /**
     * Create left column with page tabs and configuration
     */
    createLeftColumn(event) {
        const column = document.createElement('div');
        column.className = 'event-left-column';
        column.style.display = 'flex';
        column.style.flexDirection = 'column';
        column.style.gap = '6px';
        column.style.minHeight = '0';

        // Page tabs
        const pageTabs = this.createPageTabs(event);
        column.appendChild(pageTabs);

        // Page configuration container (will be populated by renderCurrentPage)
        const pageConfig = document.createElement('div');
        pageConfig.className = 'event-page-config';
        pageConfig.style.flex = '1';
        pageConfig.style.overflowY = 'auto';
        pageConfig.style.overflowX = 'hidden';
        pageConfig.style.minHeight = '0';
        column.appendChild(pageConfig);

        return column;
    }

    /**
     * Create page management buttons
     */
    createPageButtons() {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'event-page-buttons';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.flexWrap = 'wrap';

        const buttonStyle = `
            padding: 6px 12px;
            background-color: var(--color-bg-panel);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.15s;
        `;

        const buttons = [
            { label: 'New Event Page', action: 'new' },
            { label: 'Copy Event Page', action: 'copy' },
            { label: 'Paste Event Page', action: 'paste' },
            { label: 'Delete Event Page', action: 'delete' },
            { label: 'Clear Event Page', action: 'clear' }
        ];

        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.textContent = btn.label;
            button.className = 'event-page-button';
            button.dataset.action = btn.action;
            button.style.cssText = buttonStyle;

            // Hover and click effects
            button.addEventListener('mouseenter', () => button.style.backgroundColor = 'var(--color-bg-deep)');
            button.addEventListener('mouseleave', () => button.style.backgroundColor = 'var(--color-bg-panel)');
            button.addEventListener('mousedown', () => button.style.backgroundColor = 'var(--color-bg-deep)');
            button.addEventListener('mouseup', () => button.style.backgroundColor = 'var(--color-bg-deep)');

            buttonContainer.appendChild(button);
        });

        // Add event listeners
        buttonContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('event-page-button')) {
                this.handlePageButtonClick(e.target.dataset.action);
            }
        });

        return buttonContainer;
    }

    /**
     * Create page tabs
     */
    createPageTabs(event) {
        const tabContainer = document.createElement('div');
        tabContainer.className = 'event-page-tabs';
        tabContainer.style.display = 'flex';
        tabContainer.style.gap = '4px';
        tabContainer.style.flexWrap = 'wrap';
        tabContainer.style.padding = '4px';
        tabContainer.style.backgroundColor = 'var(--color-bg-input)';
        tabContainer.style.borderRadius = '4px';
        tabContainer.style.flexShrink = '0';

        event.pages.forEach((page, index) => {
            const tab = document.createElement('button');
            tab.textContent = `Page ${index + 1}`;
            tab.className = 'event-page-tab';
            tab.dataset.pageIndex = index;
            const active = index === this.currentPageIndex;
            tab.style.padding = '4px 10px';
            tab.style.fontSize = '11px';
            tab.style.fontWeight = '600';
            tab.style.backgroundColor = active ? 'var(--color-accent-tint-30)' : 'var(--color-bg-deep)';
            tab.style.color = active ? 'var(--color-text-strong)' : 'var(--color-text-muted)';
            tab.style.border = `1px solid ${active ? 'var(--color-accent-bright)' : 'var(--color-border-input)'}`;
            tab.style.borderRadius = '3px';
            tab.style.cursor = 'pointer';
            tab.style.transition = 'color 0.15s, border-color 0.15s';

            tab.addEventListener('click', () => {
                this.switchToPage(index);
            });

            tabContainer.appendChild(tab);
        });

        return tabContainer;
    }

    /**
     * Create right column for event commands/contents
     */
    createRightColumn(event) {
        const column = document.createElement('div');
        column.className = 'event-right-column';
        column.style.display = 'flex';
        column.style.flexDirection = 'column';
        column.style.minHeight = '0';
        column.style.flex = '1';

        const header = document.createElement('div');
        header.style.fontWeight = 'bold';
        header.style.fontSize = '14px';
        header.style.padding = '6px 8px';
        header.style.backgroundColor = 'var(--color-bg-input)';
        header.style.borderRadius = '4px';
        header.style.marginBottom = '6px';
        header.style.flexShrink = '0';
        header.textContent = 'Contents';

        const contentsArea = document.createElement('div');
        contentsArea.className = 'event-contents-area';
        contentsArea.style.flex = '1';
        contentsArea.style.backgroundColor = 'var(--color-bg-surface)';
        contentsArea.style.border = '1px solid var(--color-bg-input-alt)';
        contentsArea.style.borderRadius = '4px 4px 0 0';
        contentsArea.style.borderBottom = 'none';
        contentsArea.style.padding = '8px';
        contentsArea.style.overflowY = 'auto';
        contentsArea.style.minHeight = '0';

        // Placeholder content
        const currentPage = event.pages[this.currentPageIndex];
        if (currentPage && currentPage.list && currentPage.list.length > 0) {
            contentsArea.innerHTML = `
                <div style="color: var(--color-text-muted);">
                    Event commands list (${currentPage.list.length} commands)
                    <br><br>
                    Command editor interface will be implemented here.
                </div>
            `;
        } else {
            contentsArea.innerHTML = '<div style="color: var(--color-text-muted);">No commands defined yet.</div>';
        }

        column.appendChild(header);
        column.appendChild(contentsArea);

        // Add action buttons at the bottom of this column
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'event-action-buttons';
        buttonContainer.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding: 8px;
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-bg-input-alt);
            border-top: none;
            border-radius: 0 0 4px 4px;
            flex-shrink: 0;
        `;

        const buttonStyle = `
            padding: 6px 20px;
            background-color: var(--color-bg-panel);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            cursor: pointer;
            font-size: 12px;
            transition: background-color 0.15s;
        `;

        // OK button
        const okButton = document.createElement('button');
        okButton.textContent = 'OK';
        okButton.style.cssText = buttonStyle;
        okButton.addEventListener('mouseenter', () => okButton.style.backgroundColor = 'var(--color-accent-tint-25)');
        okButton.addEventListener('mouseleave', () => okButton.style.backgroundColor = 'var(--color-bg-panel)');
        okButton.addEventListener('click', () => {
            this.saveAndClose();
        });

        // Cancel button
        const cancelButton = document.createElement('button');
        cancelButton.textContent = 'Cancel';
        cancelButton.style.cssText = buttonStyle;
        cancelButton.addEventListener('mouseenter', () => cancelButton.style.backgroundColor = 'var(--color-accent-tint-25)');
        cancelButton.addEventListener('mouseleave', () => cancelButton.style.backgroundColor = 'var(--color-bg-panel)');
        cancelButton.addEventListener('click', () => {
            this.closeEditor();
        });

        // Apply button
        const applyButton = document.createElement('button');
        applyButton.textContent = 'Apply';
        applyButton.style.cssText = buttonStyle;
        applyButton.addEventListener('mouseenter', () => applyButton.style.backgroundColor = 'var(--color-accent-tint-25)');
        applyButton.addEventListener('mouseleave', () => applyButton.style.backgroundColor = 'var(--color-bg-panel)');
        applyButton.addEventListener('click', () => {
            this.applyChanges();
            applyButton.style.backgroundColor = 'var(--color-accent)';
            applyButton.style.color = 'var(--color-bg-deep)';
            setTimeout(() => {
                applyButton.style.backgroundColor = 'var(--color-bg-panel)';
                applyButton.style.color = 'var(--color-text)';
            }, 200);
        });

        buttonContainer.appendChild(okButton);
        buttonContainer.appendChild(cancelButton);
        buttonContainer.appendChild(applyButton);

        column.appendChild(buttonContainer);

        return column;
    }

    /**
     * Render the current page configuration
     */
    renderCurrentPage() {
        const pageConfig = document.querySelector('.event-page-config');
        if (!pageConfig) return;

        pageConfig.innerHTML = '';

        const currentPage = this.currentEvent.pages[this.currentPageIndex];
        if (!currentPage) return;

        // Import EventPageEditor
        const pageEditor = new EventPageEditor(
            this.databaseManager,
            this.projectController,
            this
        );

        pageEditor.renderPageConfiguration(pageConfig, currentPage, this.currentPageIndex);

        // Update right column
        this.updateContentsColumn();

        // Update tab highlighting
        this.updateTabHighlighting();
    }

    /**
     * Update contents column with current page data
     */
    updateContentsColumn() {
        const contentsArea = document.querySelector('.event-contents-area');
        if (!contentsArea) return;

        const currentPage = this.currentEvent.pages[this.currentPageIndex];

        contentsArea.innerHTML = '';

        // Create header with info
        const header = document.createElement('div');
        header.style.cssText = 'color: var(--color-text-muted); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--color-border);';
        header.textContent = `Event Commands (${currentPage.list ? currentPage.list.length : 0} total)`;
        contentsArea.appendChild(header);

        // Render interactive command list
        const commandListContainer = document.createElement('div');
        contentsArea.appendChild(commandListContainer);

        this.commandList.renderCommandList(commandListContainer, currentPage, this.currentPageIndex);
    }


    /**
     * Update tab highlighting
     */
    updateTabHighlighting() {
        const tabs = document.querySelectorAll('.event-page-tab');
        tabs.forEach((tab, index) => {
            const active = index === this.currentPageIndex;
            tab.style.backgroundColor = active ? 'var(--color-accent-tint-30)' : 'var(--color-bg-deep)';
            tab.style.color = active ? 'var(--color-text-strong)' : 'var(--color-text-muted)';
            tab.style.borderColor = active ? 'var(--color-accent-bright)' : 'var(--color-border-input)';
        });
    }

    /**
     * Switch to a different page
     */
    switchToPage(pageIndex) {
        this.currentPageIndex = pageIndex;
        this.renderCurrentPage();
    }

    /**
     * Handle page button clicks
     */
    handlePageButtonClick(action) {
        switch (action) {
            case 'new':
                this.addNewPage();
                break;
            case 'copy':
                this.copyCurrentPage();
                break;
            case 'paste':
                this.pasteEventPage();
                break;
            case 'delete':
                this.deleteCurrentPage();
                break;
            case 'clear':
                this.clearCurrentPage();
                break;
        }
    }

    /**
     * Add a new event page
     */
    addNewPage() {
        const newPage = this.createDefaultPage();
        this.currentEvent.pages.push(newPage);
        this.currentPageIndex = this.currentEvent.pages.length - 1;

        // Refresh the entire editor
        const container = document.querySelector('.event-editor-container');
        if (container) {
            this.showEventEditor(container, this.currentEvent);
        }
    }

    /**
     * Copy current page to clipboard
     */
    copyCurrentPage() {
        const currentPage = this.currentEvent.pages[this.currentPageIndex];
        this.clipboard = JSON.parse(JSON.stringify(currentPage)); // Deep clone
        if (typeof ReactorClipboard !== 'undefined') {
            ReactorClipboard.write('eventPage', { page: this.clipboard });
        }
        console.log('Page copied to clipboard');
    }

    /**
     * Paste event page from clipboard
     */
    async pasteEventPage() {
        let pageData = this.clipboard;
        if (!pageData && typeof ReactorClipboard !== 'undefined') {
            const clipboardData = await ReactorClipboard.read('eventPage');
            pageData = clipboardData?.payload?.page || null;
        }

        if (!pageData) {
            alert('No page in clipboard to paste.');
            return;
        }

        const pastedPage = JSON.parse(JSON.stringify(pageData)); // Deep clone
        this.currentEvent.pages.push(pastedPage);
        this.currentPageIndex = this.currentEvent.pages.length - 1;

        // Refresh the entire editor
        const container = document.querySelector('.event-editor-container');
        if (container) {
            this.showEventEditor(container, this.currentEvent);
        }
    }

    /**
     * Delete current page
     */
    deleteCurrentPage() {
        if (this.currentEvent.pages.length <= 1) {
            alert('Cannot delete the last page. An event must have at least one page.');
            return;
        }

        if (confirm('Are you sure you want to delete this page?')) {
            this.currentEvent.pages.splice(this.currentPageIndex, 1);
            this.currentPageIndex = Math.max(0, this.currentPageIndex - 1);

            // Refresh the entire editor
            const container = document.querySelector('.event-editor-container');
            if (container) {
                this.showEventEditor(container, this.currentEvent);
            }
        }
    }

    /**
     * Clear current page (reset to defaults)
     */
    clearCurrentPage() {
        if (confirm('Are you sure you want to clear this page? All settings will be reset.')) {
            this.currentEvent.pages[this.currentPageIndex] = this.createDefaultPage();
            this.renderCurrentPage();
        }
    }

    /**
     * Create a default event page structure
     */
    createDefaultPage() {
        return {
            conditions: {
                actorId: 1,
                actorValid: false,
                itemId: 1,
                itemValid: false,
                selfSwitchCh: 'A',
                selfSwitchValid: false,
                switch1Id: 1,
                switch1Valid: false,
                switch2Id: 1,
                switch2Valid: false,
                variableId: 1,
                variableValid: false,
                variableValue: 0
            },
            directionFix: false,
            image: {
                tileId: 0,
                characterName: '',
                direction: 2,
                pattern: 0,
                characterIndex: 0
            },
            moveFrequency: 3,
            moveRoute: {
                list: [{ code: 0, indent: null, parameters: [] }],
                repeat: true,
                skippable: false,
                wait: false
            },
            moveSpeed: 3,
            moveType: 0,
            priorityType: 1,
            stepAnime: false,
            through: false,
            trigger: 0,
            walkAnime: true,
            list: [{ code: 0, indent: 0, parameters: [] }]
        };
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventEditor;
}
