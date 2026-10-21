/**
 * SwitchVariablePicker - the window a switch or a variable is chosen in.
 *
 * A list of every switch (or variable) by number and name, a rail of ranges of fifty beside it, and a field
 * that finds one: a number jumps to that ID, words find a name. Arrows, Page Up and Page Down, Home and End
 * walk the rows, Enter picks, Escape closes; a letter or a digit typed on the list goes to the field. Opened from a field inside a dialog it
 * stands in the middle of the window; opened from a docked panel or a page it stands beside that field.
 *
 *   new SwitchVariablePicker(databaseManager, projectController).show('switch' | 'variable', selectedId, (id, name) => …)
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
        // The IDs of the rows the field leaves in the list, top to bottom; null while it leaves them all.
        this.found = null;
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
        this.openerAddress = SwitchVariablePicker.addressOf(this.previouslyFocused);
        this.currentTab = Math.floor((Math.max(1, selectedId || 1) - 1) / this.itemsPerTab);

        // Create modal if it doesn't exist
        if (!this.modal) {
            this.createModal();
        }

        // Update modal content
        this.updateModalContent(selectedId);

        // Show modal
        this.modal.style.display = 'flex';
        this.place(this.previouslyFocused);
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

        // Escape closes; a click on the backdrop does not.
        this.modal.addEventListener('keydown', event => {
            if (event.key === 'Escape') this.close();
        });
        // Tab stays inside the picker; the owner already handles Escape and focus return.
        window.RRKeyboardNavigation?.modal(this.modal, { container: () => container });

        document.body.appendChild(this.modal);
    }

    /**
     * The dialog a control is in, or null for a control of a docked panel or a page. The editor's dialogs
     * are told by what they wear: the shared overlay or dialog role, or a root named "…-modal", which
     * every command editor has whether or not it wears the shared classes.
     */
    static dialogOf(element) {
        for (let node = element; node && node !== document.body; node = node.parentElement) {
            const names = `${typeof node.className === 'string' ? node.className : ''} ${typeof node.id === 'string' ? node.id : ''}`;
            if (/(^|\s)(\S+-modal|rr-modal-overlay)(\s|$)/.test(names)) return node;
            if (typeof node.getAttribute === 'function' && node.getAttribute('role') === 'dialog') return node;
        }
        return null;
    }

    /**
     * Where the window stands. A field inside a dialog gets it in the middle of the window, over that
     * dialog. A field of a docked panel or of a page gets it beside the panel or the column the field is
     * in, level with the field, on the side with more room, so what the field belongs to stays in view;
     * when it fits on neither side it stands in the middle.
     */
    place(opener) {
        const container = this.modal && this.modal.querySelector('.picker-container');
        if (!container) return;
        container.style.position = '';
        container.style.left = '';
        container.style.top = '';
        this.modal.classList.remove('is-beside');
        if (!opener || opener === document.body || typeof opener.getBoundingClientRect !== 'function') return;
        if (SwitchVariablePicker.dialogOf(opener)) return;
        const field = opener.getBoundingClientRect();
        if (!field.width || !field.height) return;
        // The panel or column around the field: its widest ancestor that is still a side of the window, not the page.
        let side = field;
        for (let node = opener.parentElement; node && node !== document.body; node = node.parentElement) {
            const rect = node.getBoundingClientRect();
            if (!rect.width || !rect.height) continue;
            if (rect.width > window.innerWidth * 0.45) break;
            side = rect;
        }
        const box = container.getBoundingClientRect(), gap = 12, edge = 16;
        const fitsLeft = side.left - gap - box.width >= edge;
        const fitsRight = side.right + gap + box.width <= window.innerWidth - edge;
        if (!fitsLeft && !fitsRight) return;
        const onLeft = fitsLeft && (!fitsRight || side.left >= window.innerWidth - side.right);
        const left = onLeft ? side.left - gap - box.width : side.right + gap;
        const top = Math.max(edge, Math.min(window.innerHeight - box.height - edge, field.top + field.height / 2 - box.height / 2));
        container.style.position = 'absolute';
        container.style.left = `${Math.round(left)}px`;
        container.style.top = `${Math.round(top)}px`;
        this.modal.classList.add('is-beside');
    }

    /**
     * Where a control stands: the dialog it is in (the page when it is in none), and the place among its
     * parent's children at each step down to it. What is chosen here is often shown by drawing the
     * dialog's controls again; the control that opened the window is then a new element in the old place.
     */
    static addressOf(element) {
        if (!element || element === document.body || !element.parentElement) return null;
        const root = SwitchVariablePicker.dialogOf(element) || document.body;
        const steps = [];
        for (let node = element; node !== root; node = node.parentElement) {
            if (!node.parentElement) return null;
            steps.unshift(Array.prototype.indexOf.call(node.parentElement.children, node));
        }
        return { root, steps, tag: element.tagName, className: element.className };
    }

    /** The control now standing at an address, when it is one of the same kind; else null. */
    static controlAt(address) {
        if (!address || !address.root.isConnected) return null;
        let node = address.root;
        for (const index of address.steps) {
            node = node.children[index];
            if (!node) return null;
        }
        return node.tagName === address.tag && node.className === address.className ? node : null;
    }

    /** Text as it is compared: without accents, in one case. */
    static searchKey(text) {
        return String(text || '').normalize('NFKD').replace(/\p{M}/gu, '').toUpperCase();
    }

    /**
     * Whether a row is left in the list by what the field holds: a number finds the IDs it is written in
     * ("12" finds 0012 and 0120), words find a name. An empty field leaves every row.
     */
    static matches(id, name, query) {
        const text = String(query || '').trim();
        if (!text) return true;
        if (/^\d+$/.test(text) && String(id).padStart(4, '0').includes(text)) return true;
        return SwitchVariablePicker.searchKey(name).includes(SwitchVariablePicker.searchKey(text));
    }

    /**
     * Update modal content
     */
    updateModalContent(selectedId) {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.picker-container');
        container.replaceChildren();
        this.found = null;

        const systemData = this.databaseManager.getSystem() || {};
        const dataArray = this.type === 'switch' ? (systemData.switches || []) : (systemData.variables || []);
        const maxCount = dataArray.length;
        const label = this.type === 'switch' ? 'Switch' : 'Variable';

        // Header
        const header = document.createElement('div');
        header.className = 'rr-modal-header';
        const title = document.createElement('div');
        title.className = 'rr-modal-title';
        title.id = `${this.inputScope}-title`;
        title.textContent = this.type === 'switch' ? tt('Select Switch') : tt('Select Variable');
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.className = 'close-btn rr-modal-close';
        closeButton.setAttribute('aria-label', tt('Close'));
        closeButton.textContent = '×';
        header.appendChild(title);
        header.appendChild(closeButton);
        container.appendChild(header);

        // Close button handler
        closeButton.addEventListener('click', () => this.close());

        // The field that finds a row: a number jumps to that ID, words find a name.
        const find = document.createElement('div');
        find.className = 'rr-picker-find';
        const findInput = document.createElement('input');
        findInput.type = 'text';
        findInput.className = 'rr-picker-find-input';
        findInput.placeholder = tt('Type a number or a name');
        findInput.setAttribute('aria-label', tt('Type a number or a name'));
        findInput.autocomplete = 'off';
        findInput.spellcheck = false;
        const findClear = document.createElement('button');
        findClear.type = 'button';
        findClear.className = 'rr-picker-find-clear';
        findClear.textContent = '×';
        findClear.title = tt('Clear search');
        findClear.setAttribute('aria-label', tt('Clear search'));
        findClear.hidden = true;
        find.appendChild(findInput);
        find.appendChild(findClear);
        container.appendChild(find);

        // Create main content area (tabs + list)
        const mainContent = document.createElement('div');
        mainContent.className = 'rr-picker-workspace';

        // Tab container (vertical on the left)
        const tabBar = document.createElement('div');
        tabBar.className = 'tab-bar rr-picker-tabs rr-accent-scrollbar';

        const effectiveMaxCount = Math.max(maxCount - 1, 1);
        const numTabs = Math.ceil(effectiveMaxCount / this.itemsPerTab);
        this.currentTab = Math.min(this.currentTab, numTabs - 1);
        // One range is the whole list: the rail would hold a single button that goes nowhere.
        if (numTabs < 2) mainContent.classList.add('is-single-range');
        // Past 999 a range is written with four digits a side: the rail is wider, so each stays on one line.
        if (effectiveMaxCount > 999) mainContent.classList.add('is-wide');

        for (let i = 0; i < numTabs; i++) {
            const startNum = i * this.itemsPerTab + 1;
            const endNum = Math.min((i + 1) * this.itemsPerTab, effectiveMaxCount);

            const tab = document.createElement('button');
            tab.type = 'button';
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
        listContainer.className = 'list-container rr-picker-list rr-accent-scrollbar';

        // Create list items - use effectiveMaxCount to ensure we show items
        for (let i = 1; i <= effectiveMaxCount; i++) {
            const name = (dataArray[i] && dataArray[i].trim()) || `${tt(label)} ${String(i).padStart(4, '0')}`;

            const item = document.createElement('button');
            item.type = 'button';
            item.className = `picker-item rr-picker-item${i === selectedId ? ' is-selected' : ''}`;
            item.dataset.id = String(i);
            const id = document.createElement('span');
            id.className = 'rr-picker-id';
            id.textContent = String(i).padStart(4, '0');
            const itemName = document.createElement('span');
            itemName.className = 'rr-picker-name';
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
        const empty = document.createElement('div');
        empty.className = 'rr-picker-empty';
        empty.textContent = tt('No matches');
        empty.hidden = true;
        listContainer.appendChild(empty);

        const select = item => {
            listContainer.querySelectorAll('.rr-picker-item.is-selected').forEach(row => row.classList.remove('is-selected'));
            if (item) item.classList.add('is-selected');
        };

        // Scroll event to update active tab
        listContainer.addEventListener('scroll', () => {
            this.updateActiveTabFromScroll(listContainer);
        });
        // Arrows walk the rows; Enter on the focused row picks it (the row's own click).
        const roving = window.RRKeyboardNavigation?.roving(listContainer, {
            orientation: 'vertical',
            items: () => listContainer.querySelectorAll('.rr-picker-item'),
            isSelected: item => item.classList.contains('is-selected'),
            select: item => {
                select(item);
                item.scrollIntoView({ block: 'nearest' });
            }
        });

        // What the field holds leaves the rows that match; the ID typed whole, else the first row left, is the
        // one Enter picks.
        const filter = () => {
            const query = findInput.value;
            const rows = listContainer.querySelectorAll('.rr-picker-item');
            const wanted = /^\d+$/.test(query.trim()) ? Number(query.trim()) : 0;
            const ids = [];
            let first = null, exact = null;
            rows.forEach(row => {
                const id = Number(row.dataset.id);
                const shown = SwitchVariablePicker.matches(id, row.querySelector('.rr-picker-name').textContent, query);
                row.hidden = !shown;
                if (!shown) return;
                ids.push(id);
                if (!first) first = row;
                if (id === wanted) exact = row;
            });
            const filtered = !!query.trim();
            this.found = filtered ? ids : null;
            findClear.hidden = !filtered;
            empty.hidden = ids.length > 0;
            const target = filtered ? (exact || first) : (listContainer.querySelector(`[data-id="${selectedId}"]`) || first);
            select(target);
            roving?.sync();
            if (target) target.scrollIntoView({ block: filtered ? 'nearest' : 'center' });
            this.updateActiveTabFromScroll(listContainer);
        };
        findInput.addEventListener('input', filter);
        findInput.addEventListener('keydown', event => {
            // The marked row is always one the field left in the list: filter() moves the mark, or takes it away.
            const chosen = listContainer.querySelector('.rr-picker-item.is-selected');
            if (event.key === 'Enter') {
                event.preventDefault();
                if (chosen) chosen.click();
            } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                // Into the list, on the row Enter would pick; the arrows walk on from there.
                event.preventDefault();
                if (chosen) chosen.focus({ preventScroll: true });
            }
        });
        findClear.addEventListener('click', () => {
            findInput.value = '';
            filter();
            findInput.focus();
        });
        // A letter or a digit typed on the list is meant for the field: it takes the keyboard before the
        // key is written, so the key lands in it.
        listContainer.addEventListener('keydown', event => {
            if (event.ctrlKey || event.metaKey || event.altKey) return;
            if (event.key === 'PageDown' || event.key === 'PageUp') {
                // A page is the rows that fit in the list, less one that stays in view: the mark and the
                // keyboard go with it, so the next arrow walks on from what is shown.
                const rows = Array.from(listContainer.querySelectorAll('.rr-picker-item')).filter(row => !row.hidden);
                if (!rows.length) return;
                event.preventDefault();
                const held = rows.indexOf(document.activeElement);
                const from = held >= 0 ? held : Math.max(0, rows.findIndex(row => row.classList.contains('is-selected')));
                const page = Math.max(1, Math.floor((listContainer.clientHeight || 0) / (rows[0].offsetHeight || 26)) - 1);
                const target = rows[Math.max(0, Math.min(rows.length - 1, from + (event.key === 'PageDown' ? page : -page)))];
                select(target);
                roving?.sync();
                target.focus({ preventScroll: true });
                target.scrollIntoView({ block: 'nearest' });
                return;
            }
            const typed = event.key.length === 1 && event.key !== ' ';
            if (typed || (event.key === 'Backspace' && findInput.value)) findInput.focus();
        });

        mainContent.appendChild(listContainer);
        container.appendChild(mainContent);

        // Footer with max count button
        const footer = document.createElement('div');
        footer.className = 'rr-modal-footer';
        const status = document.createElement('div');
        status.className = 'rr-picker-footer-status';
        status.textContent = (this.type === 'switch' ? tt('Number of switches: {count}') : tt('Number of variables: {count}')).replace('{count}', String(effectiveMaxCount));
        const setMaxButton = document.createElement('button');
        setMaxButton.type = 'button';
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
                const selected = this.modal.querySelector('.rr-picker-item.is-selected');
                // The chosen row in the middle of the list, with its neighbors on both sides; none chosen, the range's first row.
                if (selected) selected.scrollIntoView({ behavior: 'auto', block: 'center' });
                else this.scrollToTab(this.currentTab);
                this.updateActiveTabFromScroll(listContainer);
                this.showActiveTab();
                // The keyboard starts on the chosen row, where the arrows walk from; with none chosen, in the field.
                if (selected) selected.focus({ preventScroll: true });
                else findInput.focus({ preventScroll: true });
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
     * Scroll to a specific tab's content: the range's first row, or the first row at or after it that the
     * field has left in the list.
     */
    scrollToTab(tabIndex) {
        const listContainer = this.modal.querySelector('.list-container');
        const startId = tabIndex * this.itemsPerTab + 1;
        const wantedId = this.found ? this.found.find(id => id >= startId) : startId;
        const targetItem = wantedId ? listContainer.querySelector(`[data-id="${wantedId}"]`) : null;

        if (targetItem) {
            targetItem.scrollIntoView({ behavior: 'auto', block: 'start' });
        }
    }

    /**
     * Update active tab based on scroll position: the range of the row at the top of the list. Rows are
     * all one height, so the row is worked out from the scroll and nothing is measured row by row.
     */
    updateActiveTabFromScroll(listContainer) {
        const first = this.found ? this.found[0] : 1;
        const row = first ? listContainer.querySelector(`[data-id="${first}"]`) : null;
        const height = row ? row.offsetHeight : 0;
        if (!height) return;
        const index = Math.max(0, Math.round(listContainer.scrollTop / height));
        const id = this.found ? this.found[Math.min(index, this.found.length - 1)] : index + 1;
        if (!id) return;
        const newTab = Math.floor((id - 1) / this.itemsPerTab);

        if (newTab !== this.currentTab) {
            this.currentTab = newTab;
            this.updateTabHighlight();
            this.showActiveTab();
        }
    }

    /** The rail follows the list: the lit range is brought into view among many. */
    showActiveTab() {
        const active = this.modal ? this.modal.querySelector('.range-tab.is-active') : null;
        if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
    }

    /**
     * Show dialog to set maximum count
     */
    async showSetMaxDialog() {
        const tt = (text) => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        const systemData = this.databaseManager.getSystem() || {};
        const dataArray = this.type === 'switch' ? (systemData.switches || []) : (systemData.variables || []);
        const currentMax = dataArray.length - 1;
        const renderedModal = this.modal;
        const valid = text => {
            const maxNum = parseInt(text);
            return !isNaN(maxNum) && maxNum > 0 && maxNum <= 5000;
        };

        // The field starts on the current maximum.
        const newMax = await RRDialog.prompt(this.type === 'switch' ? tt('Maximum number of switches') : tt('Maximum number of variables'), {
            title: tt('Set Maximum'),
            value: String(currentMax),
            validate: text => (valid(text) ? '' : tt('Please enter a valid number between 1 and 5000.'))
        });

        // The answer is for the picker that asked.
        if (newMax === null || this.modal !== renderedModal || !valid(newMax)) return;
        this.setMaxCount(parseInt(newMax));
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
            await RRDialog.alert(`${tt('Failed to save changes to System.json:')} ${tt(error.message)}`, { title: tt('Set Maximum'), kind: 'error' });
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
        const opener = this.previouslyFocused, address = this.openerAddress;
        this.previouslyFocused = null;
        this.openerAddress = null;
        if (opener && opener.isConnected) {
            opener.focus();
            return;
        }
        // What was chosen drew the opener again: the keyboard goes to the control in its place, so Escape and
        // Tab still reach the dialog. A caller that has given the keyboard to a control of its own keeps it there.
        const active = document.activeElement;
        if (active && active !== document.body && active.isConnected) return;
        const again = SwitchVariablePicker.controlAt(address);
        if (again && typeof again.focus === 'function') again.focus();
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SwitchVariablePicker;
}
