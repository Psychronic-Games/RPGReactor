/**
 * SwitchVariablePicker - A modal picker for selecting switches/variables with tabbed ranges
 */
class SwitchVariablePicker {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.type = 'switch'; // 'switch' or 'variable'
        this.currentTab = 0;
        this.itemsPerTab = 50;
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
        this.currentTab = Math.floor((selectedId || 1) / this.itemsPerTab);

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
        this.modal.className = 'switch-variable-picker-modal';
        this.modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 10002;
            justify-content: center;
            align-items: center;
        `;

        // Create modal content container
        const container = document.createElement('div');
        container.className = 'picker-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 700px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        `;

        this.modal.appendChild(container);

        // Close on background click
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        document.body.appendChild(this.modal);
    }

    /**
     * Update modal content
     */
    updateModalContent(selectedId) {
        const container = this.modal.querySelector('.picker-container');
        container.innerHTML = '';

        const systemData = this.databaseManager.getSystem() || {};
        const dataArray = this.type === 'switch' ? (systemData.switches || []) : (systemData.variables || []);
        const maxCount = dataArray.length;
        const label = this.type === 'switch' ? 'Switch' : 'Variable';

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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Select ${label}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
        `;
        container.appendChild(header);

        // Close button handler
        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Create main content area (tabs + list)
        const mainContent = document.createElement('div');
        mainContent.style.cssText = `
            display: flex;
            flex: 1;
            overflow: hidden;
        `;

        // Tab container (vertical on the left)
        const tabBar = document.createElement('div');
        tabBar.className = 'tab-bar';
        tabBar.style.cssText = `
            width: 100px;
            background-color: var(--color-bg-list-item);
            border-right: 1px solid var(--color-border);
            display: flex;
            flex-direction: column;
            gap: 2px;
            overflow-y: auto;
            padding: 8px;
        `;

        // Create tabs - ensure we have at least one switch/variable to work with
        const effectiveMaxCount = Math.max(maxCount - 1, 100); // Show at least 100 to make tabs meaningful
        const numTabs = Math.ceil(effectiveMaxCount / this.itemsPerTab);

        console.log(`Creating ${numTabs} tabs for ${effectiveMaxCount} ${label.toLowerCase()}s`);

        for (let i = 0; i < numTabs; i++) {
            const startNum = i * this.itemsPerTab + 1;
            const endNum = Math.min((i + 1) * this.itemsPerTab, effectiveMaxCount);

            const tab = document.createElement('button');
            tab.className = 'range-tab';
            tab.textContent = `${startNum}-${endNum}`;
            tab.dataset.tabIndex = i;
            tab.style.cssText = `
                padding: 8px 10px;
                background-color: ${i === this.currentTab ? 'var(--color-link)' : 'var(--color-bg-input-alt)'};
                color: var(--color-text-strong);
                border: none;
                border-radius: 3px;
                cursor: pointer;
                font-size: 11px;
                transition: background-color 0.15s;
                white-space: nowrap;
                text-align: center;
                min-height: 32px;
            `;

            tab.addEventListener('click', () => {
                this.currentTab = i;
                this.updateTabHighlight();
                this.scrollToTab(i);
            });

            tab.addEventListener('mouseenter', () => {
                if (i !== this.currentTab) {
                    tab.style.backgroundColor = '#505050';
                }
            });

            tab.addEventListener('mouseleave', () => {
                if (i !== this.currentTab) {
                    tab.style.backgroundColor = 'var(--color-bg-input-alt)';
                }
            });

            tabBar.appendChild(tab);
        }

        mainContent.appendChild(tabBar);

        // List container
        const listContainer = document.createElement('div');
        listContainer.className = 'list-container';
        listContainer.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 8px;
            background-color: var(--color-bg-surface);
        `;

        // Create list items - use effectiveMaxCount to ensure we show items
        for (let i = 1; i <= effectiveMaxCount; i++) {
            const name = (dataArray[i] && dataArray[i].trim()) || `${label} ${String(i).padStart(4, '0')}`;

            const item = document.createElement('div');
            item.className = 'picker-item';
            item.dataset.id = i;
            item.style.cssText = `
                padding: 8px 12px;
                margin-bottom: 4px;
                background-color: ${i === selectedId ? 'var(--color-bg-selected)' : 'var(--color-bg-input)'};
                color: var(--color-text);
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                transition: background-color 0.15s;
            `;
            item.innerHTML = `<strong>#${String(i).padStart(4, '0')}:</strong> ${name}`;

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

            item.addEventListener('mouseenter', () => {
                if (i !== selectedId) {
                    item.style.backgroundColor = 'var(--color-bg-hover)';
                }
            });

            item.addEventListener('mouseleave', () => {
                if (i !== selectedId) {
                    item.style.backgroundColor = 'var(--color-bg-input)';
                }
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
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
        `;
        footer.innerHTML = `
            <div style="font-size: 12px; color: var(--color-text-muted);">Current max: ${effectiveMaxCount} ${label.toLowerCase()}s</div>
            <button class="set-max-btn" style="padding: 6px 16px; background-color: var(--color-bg-panel); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 12px; transition: background-color 0.15s;">Set Maximum...</button>
        `;
        container.appendChild(footer);

        // Set maximum button handler
        footer.querySelector('.set-max-btn').addEventListener('click', () => this.showSetMaxDialog());

        // Hover effect for set max button
        const setMaxBtn = footer.querySelector('.set-max-btn');
        setMaxBtn.addEventListener('mouseenter', () => setMaxBtn.style.backgroundColor = 'var(--color-bg-deep)');
        setMaxBtn.addEventListener('mouseleave', () => setMaxBtn.style.backgroundColor = 'var(--color-bg-panel)');

        // Scroll to current tab after a brief delay
        setTimeout(() => {
            this.scrollToTab(this.currentTab);
        }, 50);
    }

    /**
     * Update tab highlight
     */
    updateTabHighlight() {
        const tabs = this.modal.querySelectorAll('.range-tab');
        tabs.forEach((tab, index) => {
            if (index === this.currentTab) {
                tab.style.backgroundColor = 'var(--color-link)';
            } else {
                tab.style.backgroundColor = 'var(--color-bg-input-alt)';
            }
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
        const systemData = this.databaseManager.getSystem() || {};
        const dataArray = this.type === 'switch' ? (systemData.switches || []) : (systemData.variables || []);
        const currentMax = dataArray.length - 1;
        const label = this.type === 'switch' ? 'switches' : 'variables';

        const newMax = prompt(`Enter the maximum number of ${label} (current: ${currentMax}):`, currentMax);

        if (newMax !== null) {
            const maxNum = parseInt(newMax);
            if (!isNaN(maxNum) && maxNum > 0 && maxNum <= 5000) {
                this.setMaxCount(maxNum);
            } else {
                alert('Please enter a valid number between 1 and 5000.');
            }
        }
    }

    /**
     * Set the maximum count for switches/variables
     */
    async setMaxCount(maxCount) {
        const systemData = this.databaseManager.getSystem();
        if (!systemData) return;

        const arrayKey = this.type === 'switch' ? 'switches' : 'variables';
        const currentArray = systemData[arrayKey] || [];
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
        const currentProject = this.projectController.getCurrentProject ? this.projectController.getCurrentProject() : this.projectController.currentProject;
        if (currentProject && currentProject.path) {
            try {
                await this.databaseManager.saveJSON(currentProject.path, 'System.json', systemData);
                console.log(`Saved ${arrayKey} max count (${maxCount}) to System.json`);
            } catch (error) {
                console.error(`Error saving System.json:`, error);
                alert(`Failed to save changes to System.json: ${error.message}`);
            }
        }

        // Refresh the modal
        const selectedId = 1;
        this.updateModalContent(selectedId);
    }

    /**
     * Close the modal
     */
    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SwitchVariablePicker;
}
