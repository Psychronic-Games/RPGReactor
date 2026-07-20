/**
 * SwitchVariablePicker - A modal picker for selecting switches/variables with tabbed ranges
 */
class SwitchVariablePicker {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        SwitchVariablePicker.nextInputScope = (SwitchVariablePicker.nextInputScope || 0) + 1;
        this.inputScope = `switch-variable-picker-${SwitchVariablePicker.nextInputScope}`;
        this.modal = null;
        this.callback = null;
        this.type = 'switch'; // 'switch' or 'variable'
        this.currentTab = 0;
        this.itemsPerTab = 50;
        this.scrollTimer = null;
    }

    /**
     * Show the picker modal
     * @param {string} type - 'switch' or 'variable'
     * @param {number} selectedId - Currently selected ID
     * @param {function} callback - Callback function when selection is made
     */
    show(type, selectedId, callback) {
        this.type = type;
        this.callback = callback;
        this.previouslyFocused = document.activeElement;
        this.currentTab = Math.floor((Math.max(1, selectedId || 1) - 1) / this.itemsPerTab);

        // Create modal if it doesn't exist
        if (!this.modal) {
            this.createModal();
        }

        // Update modal content
        this.updateModalContent(selectedId);

        // Show modal
        this.modal.style.display = 'flex';
    }

    /**
     * Create the modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'switch-variable-picker-modal rr-modal-overlay rr-nested-picker-modal';
        this.modal.style.display = 'none';
        this.modal.setAttribute('role', 'dialog');
        this.modal.setAttribute('aria-modal', 'true');
        this.modal.setAttribute('aria-labelledby', `${this.inputScope}-title`);

        // Create modal content container
        const container = document.createElement('div');
        container.className = 'picker-container rr-modal rr-switch-variable-picker';

        this.modal.appendChild(container);

        // Close on background click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });
        this.modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') this.close();
        });

        document.body.appendChild(this.modal);
    }

    /**
     * Update modal content
     */
    updateModalContent(selectedId) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.picker-container');
        container.innerHTML = '';

        const systemData = this.databaseManager.getSystem() || {};
        const dataArray = this.type === 'switch' ? (systemData.switches || []) : (systemData.variables || []);
        const maxCount = dataArray.length;
        const label = this.type === 'switch' ? 'Switch' : 'Variable';
        const pluralLabel = this.type === 'switch' ? 'Switches' : 'Variables';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('div');
        title.className = 'rr-modal-title';
        title.id = `${this.inputScope}-title`;
        title.textContent = `${tt('Select')} ${tt(label)}`;
        const closeButton = document.createElement('button');
        closeButton.className = 'close-btn rr-modal-close';
        closeButton.setAttribute('aria-label', tt('Close'));
        closeButton.textContent = '×';
        header.appendChild(title);
        header.appendChild(closeButton);
        container.appendChild(header);

        // Close button handler
        closeButton.addEventListener('click', () => this.close());

        // Create main content area (tabs + list)
        const mainContent = document.createElement('div');
        mainContent.className = 'rr-picker-workspace';

        // Tab container (vertical on the left)
        const tabBar = document.createElement('div');
        tabBar.className = 'tab-bar rr-picker-tabs';

        const effectiveMaxCount = Math.max(maxCount - 1, 1);
        const numTabs = Math.ceil(effectiveMaxCount / this.itemsPerTab);
        this.currentTab = Math.min(this.currentTab, numTabs - 1);

        for (let i = 0; i < numTabs; i++) {
            const startNum = i * this.itemsPerTab + 1;
            const endNum = Math.min((i + 1) * this.itemsPerTab, effectiveMaxCount);

            const tab = document.createElement('button');
            tab.className = `range-tab rr-picker-range-tab${i === this.currentTab ? ' is-active' : ''}`;
            tab.textContent = `${startNum}-${endNum}`;
            tab.dataset.tabIndex = i;

            tab.addEventListener('click', () => {
                this.currentTab = i;
                this.updateTabHighlight();
                this.scrollToTab(i);
            });

            tabBar.appendChild(tab);
        }

        mainContent.appendChild(tabBar);

        // List container
        const listContainer = document.createElement('div');
        listContainer.className = 'list-container rr-picker-list';

        // Create list items - use effectiveMaxCount to ensure we show items
        for (let i = 1; i <= effectiveMaxCount; i++) {
            const name = (dataArray[i] && dataArray[i].trim()) || `${tt(label)} ${String(i).padStart(4, '0')}`;

            const item = document.createElement('button');
            item.type = 'button';
            item.className = `picker-item rr-picker-item${i === selectedId ? ' is-selected' : ''}`;
            item.dataset.id = i;
            const id = document.createElement('span');
            id.className = 'rr-picker-id';
            id.textContent = `#${String(i).padStart(4, '0')}`;
            const itemName = document.createElement('span');
            itemName.textContent = name;
            item.appendChild(id);
            item.appendChild(itemName);

            // Mark the start of each tab range for scroll detection
            if ((i - 1) % this.itemsPerTab === 0) {
                item.dataset.tabStart = Math.floor((i - 1) / this.itemsPerTab);
            }

            item.addEventListener('click', () => {
                if (this.callback) {
                    this.callback(i, name);
                }
                this.close();
            });

            listContainer.appendChild(item);
        }

        // Scroll event to update active tab
        listContainer.addEventListener('scroll', () => {
            this.updateActiveTabFromScroll(listContainer);
        });

        mainContent.appendChild(listContainer);
        container.appendChild(mainContent);

        // Footer with max count button
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        const status = document.createElement('div');
        status.className = 'rr-picker-footer-status';
        status.textContent = `${tt('Current max:')} ${effectiveMaxCount} ${tt(pluralLabel)}`;
        const setMaxButton = document.createElement('button');
        setMaxButton.className = 'set-max-btn rr-btn-secondary';
        setMaxButton.textContent = tt('Set Maximum...');
        footer.appendChild(status);
        footer.appendChild(setMaxButton);
        container.appendChild(footer);

        // Set maximum button handler
        setMaxButton.addEventListener('click', () => this.showSetMaxDialog());

        // Scroll to current tab after a brief delay
        if (this.scrollTimer) clearTimeout(this.scrollTimer);
        const renderedModal = this.modal;
        this.scrollTimer = setTimeout(() => {
            this.scrollTimer = null;
            if (this.modal === renderedModal) {
                this.scrollToTab(this.currentTab);
                const selected = this.modal.querySelector('.rr-picker-item.is-selected');
                if (selected) selected.focus({ preventScroll: true });
            }
        }, 50);
    }

    /**
     * Update tab highlight
     */
    updateTabHighlight() {
        const tabs = this.modal.querySelectorAll('.range-tab');
        tabs.forEach((tab, index) => {
            tab.classList.toggle('is-active', index === this.currentTab);
        });
    }

    /**
     * Scroll to a specific tab's content
     */
    scrollToTab(tabIndex) {
        const listContainer = this.modal.querySelector('.list-container');
        const startId = tabIndex * this.itemsPerTab + 1;
        const targetItem = listContainer.querySelector(`[data-id="${startId}"]`);

        if (targetItem) {
            targetItem.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
    }

    /**
     * Update active tab based on scroll position
     */
    updateActiveTabFromScroll(listContainer) {
        const items = listContainer.querySelectorAll('[data-tab-start]');
        const scrollTop = listContainer.scrollTop;
        const containerTop = listContainer.getBoundingClientRect().top;

        let newTab = this.currentTab;

        items.forEach(item => {
            const itemTop = item.getBoundingClientRect().top;
            if (itemTop - containerTop <= 100) { // Within 100px of top
                newTab = parseInt(item.dataset.tabStart);
            }
        });

        if (newTab !== this.currentTab) {
            this.currentTab = newTab;
            this.updateTabHighlight();
        }
    }

    /**
     * Show dialog to set maximum count
     */
    showSetMaxDialog() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const systemData = this.databaseManager.getSystem() || {};
        const dataArray = this.type === 'switch' ? (systemData.switches || []) : (systemData.variables || []);
        const currentMax = dataArray.length - 1;
        const label = this.type === 'switch' ? 'switches' : 'variables';

        const newMax = prompt(`${tt('Enter the maximum number of')} ${tt(label)} (${tt('current:')} ${currentMax}):`, currentMax);

        if (newMax !== null) {
            const maxNum = parseInt(newMax);
            if (!isNaN(maxNum) && maxNum > 0 && maxNum <= 5000) {
                this.setMaxCount(maxNum);
            } else {
                alert(window.I18n ? window.I18n.tText('Please enter a valid number between 1 and 5000.') : 'Please enter a valid number between 1 and 5000.');
            }
        }
    }

    /**
     * Set the maximum count for switches/variables
     */
    async setMaxCount(maxCount) {
        const systemData = this.databaseManager.getSystem();
        if (!systemData) return;
        const renderedModal = this.modal;
        const currentProject = this.projectController.getCurrentProject
            ? this.projectController.getCurrentProject()
            : this.projectController.currentProject;
        if (!currentProject || !currentProject.path) return;

        const arrayKey = this.type === 'switch' ? 'switches' : 'variables';
        const currentArray = systemData[arrayKey] || [];
        const previousArray = currentArray.slice();
        const newArray = new Array(maxCount + 1); // +1 because index 0 is unused

        // Copy existing values
        for (let i = 0; i < Math.min(currentArray.length, newArray.length); i++) {
            newArray[i] = currentArray[i] || '';
        }

        // Fill remaining with empty strings
        for (let i = currentArray.length; i < newArray.length; i++) {
            newArray[i] = '';
        }

        systemData[arrayKey] = newArray;

        // Save to System.json
        try {
            await this.databaseManager.saveJSON(currentProject.path, 'System.json', systemData);
            console.log(`Saved ${arrayKey} max count (${maxCount}) to System.json`);
        } catch (error) {
            const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
            systemData[arrayKey] = previousArray;
            console.error(`Error saving System.json:`, error);
            alert(`${tt('Failed to save changes to System.json:')} ${tt(error.message)}`);
        }

        // Refresh the modal
        if (this.modal === renderedModal) this.updateModalContent(1);
    }

    /**
     * Close the modal
     */
    close() {
        if (this.scrollTimer) {
            clearTimeout(this.scrollTimer);
            this.scrollTimer = null;
        }
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
        if (this.previouslyFocused && this.previouslyFocused.isConnected) {
            this.previouslyFocused.focus();
        }
        this.previouslyFocused = null;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SwitchVariablePicker;
}
