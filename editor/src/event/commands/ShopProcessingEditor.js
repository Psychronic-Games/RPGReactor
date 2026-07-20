/**
 * ShopProcessingEditor - Editor for Shop Processing event command (code 302)
 * Handles multi-command format with continuation goods (code 605)
 */
class ShopProcessingEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;
        this.goods = [];
        this.purchaseOnly = false;
    }

    /**
     * Show editor for a shop processing command
     * @param {object} command - The command to edit (or null for new)
     * @param {function} callback - Callback when done editing
     * @param {Array} pageList - The full page command list (for reading continuation lines)
     * @param {number} commandIndex - Index of this command in the page list
     */
    show(command, callback, pageList, commandIndex) {
        this.callback = callback;
        this.goods = [];
        this.purchaseOnly = false;

        if (command && command.code === 302) {
            const p = command.parameters;
            this.goods.push({itemType: p[0], itemId: p[1], priceMode: p[2], price: p[3]});
            this.purchaseOnly = p[4] || false;

            // Gather continuation lines (605)
            if (pageList && commandIndex != null) {
                for (let i = commandIndex + 1; i < pageList.length; i++) {
                    if (pageList[i].code === 605) {
                        const cp = pageList[i].parameters;
                        this.goods.push({itemType: cp[0], itemId: cp[1], priceMode: cp[2], price: cp[3]});
                    } else {
                        break;
                    }
                }
            }
        }

        if (this.goods.length === 0) {
            this.goods.push({itemType: 0, itemId: 1, priceMode: 0, price: 0});
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    /**
     * Create modal structure
     */
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'shop-processing-editor-modal';
        this.modal.style.cssText = 'display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 10005; justify-content: center; align-items: center;';

        const container = document.createElement('div');
        container.className = 'shop-processing-container';
        container.style.cssText = 'background-color: var(--color-bg-surface); border: 1px solid var(--color-border); border-radius: 6px; width: 600px; display: flex; flex-direction: column; box-shadow: 0 4px 20px rgba(0,0,0,0.5);';

        this.modal.appendChild(container);

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.close();
            }
        });

        document.body.appendChild(this.modal);
    }

    /**
     * Get items list for a given item type
     */
    getItemsForType(itemType) {
        const t = text => window.I18n ? window.I18n.tText(text) : text;
        const items = [];
        let data = null;

        if (itemType === 0) {
            data = this.databaseManager.data.items;
        } else if (itemType === 1) {
            data = this.databaseManager.data.weapons;
        } else if (itemType === 2) {
            data = this.databaseManager.data.armors;
        }

        if (data) {
            for (let i = 1; i < data.length; i++) {
                if (data[i]) {
                    items.push({ id: i, name: data[i].name || t('Unnamed') });
                }
            }
        }

        return items;
    }

    /**
     * Render modal content
     */
    renderContent() {
        const t = text => window.I18n ? window.I18n.tText(text) : text;
        const container = this.modal.querySelector('.shop-processing-container');
        container.innerHTML = '';

        // Header
        const header = document.createElement('div');
        header.style.cssText = 'padding: 12px 16px; background-color: var(--color-bg-panel); border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; border-top-left-radius: 6px; border-top-right-radius: 6px;';
        header.innerHTML = `
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">${t('Shop Processing')}</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">\u00d7</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Content
        const content = document.createElement('div');
        content.style.cssText = 'padding: 16px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; flex: 1; max-height: 400px;';

        // Goods list
        const goodsLabel = document.createElement('span');
        goodsLabel.textContent = t('Goods:');
        goodsLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        content.appendChild(goodsLabel);

        this.goods.forEach((good, index) => {
            const goodRow = document.createElement('div');
            goodRow.style.cssText = 'display: flex; flex-direction: column; gap: 6px; padding: 10px; background-color: var(--color-bg-list-item); border: 1px solid var(--color-border); border-radius: 3px;';

            // Top row: item type, item, remove button
            const topRow = document.createElement('div');
            topRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            // Item type dropdown
            const typeSelect = document.createElement('select');
            typeSelect.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; width: 100px;';
            typeSelect.innerHTML = `
                <option value="0" ${good.itemType === 0 ? 'selected' : ''}>${t('Item')}</option>
                <option value="1" ${good.itemType === 1 ? 'selected' : ''}>${t('Weapon')}</option>
                <option value="2" ${good.itemType === 2 ? 'selected' : ''}>${t('Armor')}</option>
            `;
            typeSelect.addEventListener('change', (e) => {
                good.itemType = parseInt(e.target.value);
                good.itemId = 1;
                this.renderContent();
            });

            // Item dropdown
            const itemSelect = document.createElement('select');
            itemSelect.style.cssText = 'padding: 6px 10px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; flex: 1;';

            const items = this.getItemsForType(good.itemType);
            items.forEach(item => {
                const option = document.createElement('option');
                option.value = item.id;
                option.textContent = `${item.id.toString().padStart(4, '0')}: ${item.name}`;
                if (item.id === good.itemId) {
                    option.selected = true;
                }
                itemSelect.appendChild(option);
            });

            itemSelect.addEventListener('change', (e) => {
                good.itemId = parseInt(e.target.value);
            });

            // Remove button
            const removeBtn = document.createElement('button');
            removeBtn.textContent = 'X';
            removeBtn.style.cssText = 'padding: 4px 8px; background-color: #5a1d1d; color: var(--color-text-strong); border: 1px solid #8b3030; border-radius: 3px; cursor: pointer; font-size: 12px;';
            removeBtn.addEventListener('click', () => {
                if (this.goods.length > 1) {
                    this.goods.splice(index, 1);
                    this.renderContent();
                }
            });

            topRow.appendChild(typeSelect);
            topRow.appendChild(itemSelect);
            topRow.appendChild(removeBtn);
            goodRow.appendChild(topRow);

            // Bottom row: price mode and custom price
            const bottomRow = document.createElement('div');
            bottomRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

            const priceLabel = document.createElement('span');
            priceLabel.textContent = t('Price:');
            priceLabel.style.cssText = 'color: var(--color-text); font-size: 12px; min-width: 40px;';

            // Standard radio
            const stdRadio = document.createElement('input');
            stdRadio.type = 'radio';
            stdRadio.name = `price-mode-${index}`;
            stdRadio.value = '0';
            stdRadio.checked = good.priceMode === 0;
            stdRadio.addEventListener('change', () => {
                good.priceMode = 0;
                this.renderContent();
            });

            const stdLabel = document.createElement('label');
            stdLabel.textContent = t('Standard');
            stdLabel.style.cssText = 'color: var(--color-text); font-size: 12px; cursor: pointer;';
            stdLabel.addEventListener('click', () => { stdRadio.checked = true; stdRadio.dispatchEvent(new Event('change')); });

            // Custom radio
            const customRadio = document.createElement('input');
            customRadio.type = 'radio';
            customRadio.name = `price-mode-${index}`;
            customRadio.value = '1';
            customRadio.checked = good.priceMode === 1;
            customRadio.addEventListener('change', () => {
                good.priceMode = 1;
                this.renderContent();
            });

            const customLabel = document.createElement('label');
            customLabel.textContent = t('Custom');
            customLabel.style.cssText = 'color: var(--color-text); font-size: 12px; cursor: pointer;';
            customLabel.addEventListener('click', () => { customRadio.checked = true; customRadio.dispatchEvent(new Event('change')); });

            bottomRow.appendChild(priceLabel);
            bottomRow.appendChild(stdRadio);
            bottomRow.appendChild(stdLabel);
            bottomRow.appendChild(customRadio);
            bottomRow.appendChild(customLabel);

            // Custom price input
            if (good.priceMode === 1) {
                const priceInput = document.createElement('input');
                priceInput.type = 'number';
                priceInput.min = 0;
                priceInput.value = good.price;
                priceInput.style.cssText = 'padding: 4px 6px; background-color: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; font-size: 12px; width: 80px;';
                priceInput.addEventListener('input', (e) => {
                    good.price = parseInt(e.target.value) || 0;
                });
                bottomRow.appendChild(priceInput);
            }

            goodRow.appendChild(bottomRow);
            content.appendChild(goodRow);
        });

        // Add good button
        const addBtn = document.createElement('button');
        addBtn.textContent = t('+ Add Good');
        addBtn.style.cssText = 'padding: 6px 16px; background-color: var(--color-bg-panel); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px; cursor: pointer; font-size: 12px; align-self: flex-start;';
        addBtn.addEventListener('click', () => {
            this.goods.push({itemType: 0, itemId: 1, priceMode: 0, price: 0});
            this.renderContent();
        });
        content.appendChild(addBtn);

        // Purchase Only checkbox
        const purchaseRow = document.createElement('div');
        purchaseRow.style.cssText = 'display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px solid var(--color-border);';

        const purchaseCheckbox = document.createElement('input');
        purchaseCheckbox.type = 'checkbox';
        purchaseCheckbox.id = 'shop-purchase-only';
        purchaseCheckbox.checked = this.purchaseOnly;
        purchaseCheckbox.addEventListener('change', (e) => {
            this.purchaseOnly = e.target.checked;
        });

        const purchaseLabel = document.createElement('label');
        purchaseLabel.htmlFor = 'shop-purchase-only';
        purchaseLabel.textContent = t('Purchase Only');
        purchaseLabel.style.cssText = 'color: var(--color-text); font-size: 13px; cursor: pointer;';

        purchaseRow.appendChild(purchaseCheckbox);
        purchaseRow.appendChild(purchaseLabel);
        content.appendChild(purchaseRow);

        container.appendChild(content);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = 'padding: 12px 16px; border-top: 1px solid var(--color-border); background-color: var(--color-bg-panel); display: flex; justify-content: flex-end; gap: 8px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = t('Cancel');
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = t('OK');
        okBtn.style.cssText = 'padding: 6px 20px; background-color: var(--color-accent); color: var(--color-bg-deep); border: none; border-radius: 3px; cursor: pointer; font-size: 12px; font-weight: bold;';
        okBtn.addEventListener('click', () => this.save());

        footer.appendChild(cancelBtn);
        footer.appendChild(okBtn);
        container.appendChild(footer);
    }

    /**
     * Build command from current data
     * Returns an array of commands (302 + 605 continuation lines)
     */
    buildCommand() {
        const commands = [];
        this.goods.forEach((good, i) => {
            if (i === 0) {
                commands.push({
                    code: 302,
                    indent: 0,
                    parameters: [good.itemType, good.itemId, good.priceMode, good.price, this.purchaseOnly]
                });
            } else {
                commands.push({
                    code: 605,
                    indent: 0,
                    parameters: [good.itemType, good.itemId, good.priceMode, good.price]
                });
            }
        });
        return commands;
    }

    /**
     * Save and return command
     */
    save() {
        if (this.callback) {
            const commands = this.buildCommand();
            this.callback(commands);
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
    module.exports = ShopProcessingEditor;
}
