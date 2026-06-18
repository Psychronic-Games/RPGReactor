/**
 * ScrollMapEditor - Editor for Scroll Map event command (code 204)
 */
class ScrollMapEditor {
    constructor(databaseManager, projectController) {
        this.databaseManager = databaseManager;
        this.projectController = projectController;
        this.modal = null;
        this.callback = null;

        // Parameters: [direction, distance, speed]
        this.direction = 2; // 2=Down, 4=Left, 6=Right, 8=Up
        this.distance = 1; // Number of tiles
        this.speed = 4; // 1=slowest, 6=fastest
    }

    show(command, callback) {
        this.callback = callback;

        if (command && command.code === 204) {
            const params = command.parameters;
            this.direction = params[0] || 2;
            this.distance = params[1] || 1;
            this.speed = params[2] || 4;
        } else {
            this.direction = 2;
            this.distance = 1;
            this.speed = 4;
        }

        if (!this.modal) {
            this.createModal();
        }

        this.renderContent();
        this.modal.style.display = 'flex';
    }

    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'scroll-map-editor-modal';
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
        container.className = 'scroll-map-container';
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

    renderContent() {
        const container = this.modal.querySelector('.scroll-map-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Scroll Map</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
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

        // Direction selector with visual arrows
        const directionSection = document.createElement('div');
        directionSection.style.cssText = 'display: flex; flex-direction: column; gap: 8px;';

        const dirLabel = document.createElement('div');
        dirLabel.textContent = 'Direction:';
        dirLabel.style.cssText = 'color: var(--color-text); font-size: 13px; font-weight: bold;';
        directionSection.appendChild(dirLabel);

        // Arrow grid for direction selection
        const arrowGrid = document.createElement('div');
        arrowGrid.style.cssText = `
            display: grid;
            grid-template-columns: repeat(3, 50px);
            grid-template-rows: repeat(3, 50px);
            gap: 4px;
            justify-content: center;
            margin: 8px 0;
        `;

        const directions = [
            { dir: null, arrow: '', row: 1, col: 1 },
            { dir: 8, arrow: '▲', row: 1, col: 2 },
            { dir: null, arrow: '', row: 1, col: 3 },
            { dir: 4, arrow: '◄', row: 2, col: 1 },
            { dir: null, arrow: '', row: 2, col: 2 },
            { dir: 6, arrow: '►', row: 2, col: 3 },
            { dir: null, arrow: '', row: 3, col: 1 },
            { dir: 2, arrow: '▼', row: 3, col: 2 },
            { dir: null, arrow: '', row: 3, col: 3 }
        ];

        directions.forEach(({ dir, arrow }) => {
            const btn = document.createElement('button');
            btn.textContent = arrow;
            btn.style.cssText = `
                width: 50px;
                height: 50px;
                background-color: ${dir === this.direction ? 'var(--color-link)' : (dir ? 'var(--color-bg-input)' : 'transparent')};
                color: ${dir ? 'var(--color-text-strong)' : 'transparent'};
                border: ${dir ? '1px solid var(--color-border-input)' : 'none'};
                border-radius: 3px;
                cursor: ${dir ? 'pointer' : 'default'};
                font-size: 20px;
                transition: background-color 0.15s;
            `;

            if (dir) {
                btn.addEventListener('click', () => {
                    this.direction = dir;
                    this.renderContent();
                });
                btn.addEventListener('mouseenter', () => {
                    if (dir !== this.direction) {
                        btn.style.backgroundColor = '#3d3d3d';
                    }
                });
                btn.addEventListener('mouseleave', () => {
                    if (dir !== this.direction) {
                        btn.style.backgroundColor = 'var(--color-bg-input)';
                    }
                });
            }

            arrowGrid.appendChild(btn);
        });

        directionSection.appendChild(arrowGrid);
        content.appendChild(directionSection);

        // Distance
        const distanceRow = document.createElement('div');
        distanceRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const distLabel = document.createElement('span');
        distLabel.textContent = 'Distance:';
        distLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const distInput = document.createElement('input');
        distInput.type = 'number';
        distInput.min = 1;
        distInput.max = 999;
        distInput.value = this.distance;
        distInput.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            width: 100px;
        `;
        distInput.addEventListener('input', (e) => {
            this.distance = parseInt(e.target.value) || 1;
        });

        const distUnit = document.createElement('span');
        distUnit.textContent = 'tiles';
        distUnit.style.cssText = 'color: var(--color-text-muted); font-size: 12px;';

        distanceRow.appendChild(distLabel);
        distanceRow.appendChild(distInput);
        distanceRow.appendChild(distUnit);
        content.appendChild(distanceRow);

        // Speed
        const speedRow = document.createElement('div');
        speedRow.style.cssText = 'display: flex; align-items: center; gap: 8px;';

        const speedLabel = document.createElement('span');
        speedLabel.textContent = 'Speed:';
        speedLabel.style.cssText = 'color: var(--color-text); font-size: 13px; min-width: 80px;';

        const speedSelect = document.createElement('select');
        speedSelect.style.cssText = `
            padding: 6px 10px;
            background-color: var(--color-bg-input);
            color: var(--color-text);
            border: 1px solid var(--color-border-input);
            border-radius: 3px;
            font-size: 12px;
            flex: 1;
        `;
        speedSelect.innerHTML = `
            <option value="1">${window.I18n ? window.I18n.tText('1: Slowest') : '1: Slowest'}</option>
            <option value="2">${window.I18n ? window.I18n.tText('2: Slower') : '2: Slower'}</option>
            <option value="3">${window.I18n ? window.I18n.tText('3: Slow') : '3: Slow'}</option>
            <option value="4">${window.I18n ? window.I18n.tText('4: Normal') : '4: Normal'}</option>
            <option value="5">${window.I18n ? window.I18n.tText('5: Fast') : '5: Fast'}</option>
            <option value="6">${window.I18n ? window.I18n.tText('6: Fastest') : '6: Fastest'}</option>
        `;
        speedSelect.value = this.speed.toString();
        speedSelect.addEventListener('change', (e) => {
            this.speed = parseInt(e.target.value);
        });

        speedRow.appendChild(speedLabel);
        speedRow.appendChild(speedSelect);
        content.appendChild(speedRow);

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
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'rr-btn-secondary';
        cancelBtn.addEventListener('click', () => this.close());

        const okBtn = document.createElement('button');
        okBtn.textContent = 'OK';
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

    buildCommand() {
        return {
            code: 204,
            indent: 0,
            parameters: [
                this.direction,
                this.distance,
                this.speed
            ]
        };
    }

    save() {
        if (this.callback) {
            const command = this.buildCommand();
            this.callback(command);
        }
        this.close();
    }

    close() {
        if (this.modal) {
            this.modal.style.display = 'none';
        }
    }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScrollMapEditor;
}
