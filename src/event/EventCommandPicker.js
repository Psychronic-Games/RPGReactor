/**
 * EventCommandPicker - Modal for selecting event commands
 */
class EventCommandPicker {
    constructor() {
        this.modal = null;
        this.callback = null;
        this.currentTab = 0;

        // Define all command categories and their commands
        this.commandData = {
            tab1: {
                name: 'Message & Flow',
                columns: [
                    {
                        sections: [
                            {
                                title: 'Message',
                                commands: [
                                    { name: 'Show Text', code: 101 },
                                    { name: 'Show Choices', code: 102 },
                                    { name: 'Input Number', code: 103 },
                                    { name: 'Select Item', code: 104 },
                                    { name: 'Show Scrolling Text', code: 105 }
                                ]
                            },
                            {
                                title: 'Game Progression',
                                commands: [
                                    { name: 'Control Switches', code: 121 },
                                    { name: 'Control Variables', code: 122 },
                                    { name: 'Control Self Switch', code: 123 },
                                    { name: 'Control Timer', code: 124 }
                                ]
                            },
                            {
                                title: 'Flow Control',
                                commands: [
                                    { name: 'Conditional Branch', code: 111 },
                                    { name: 'Loop', code: 112 },
                                    { name: 'Break Loop', code: 113 },
                                    { name: 'Exit Event Processing', code: 115 },
                                    { name: 'Common Event', code: 117 },
                                    { name: 'Label', code: 118 },
                                    { name: 'Jump to Label', code: 119 },
                                    { name: 'Comment', code: 108 }
                                ]
                            }
                        ]
                    },
                    {
                        sections: [
                            {
                                title: 'Party',
                                commands: [
                                    { name: 'Change Gold', code: 125 },
                                    { name: 'Change Items', code: 126 },
                                    { name: 'Change Weapons', code: 127 },
                                    { name: 'Change Armors', code: 128 },
                                    { name: 'Change Party Members', code: 129 }
                                ]
                            },
                            {
                                title: 'Actor',
                                commands: [
                                    { name: 'Change HP', code: 311 },
                                    { name: 'Change MP', code: 312 },
                                    { name: 'Change TP', code: 326 },
                                    { name: 'Change State', code: 313 },
                                    { name: 'Recover All', code: 314 },
                                    { name: 'Change EXP', code: 315 },
                                    { name: 'Change Level', code: 316 },
                                    { name: 'Change Parameter', code: 317 },
                                    { name: 'Change Skill', code: 318 },
                                    { name: 'Change Equipment', code: 319 },
                                    { name: 'Change Name', code: 320 },
                                    { name: 'Change Class', code: 321 },
                                    { name: 'Change Nickname', code: 324 },
                                    { name: 'Change Profile', code: 325 }
                                ]
                            }
                        ]
                    }
                ]
            },
            tab2: {
                name: 'Map & Screen',
                columns: [
                    {
                        sections: [
                            {
                                title: 'Movement',
                                commands: [
                                    { name: 'Transfer Player', code: 201 },
                                    { name: 'Set Vehicle Location', code: 202 },
                                    { name: 'Set Event Location', code: 203 },
                                    { name: 'Scroll Map', code: 204 },
                                    { name: 'Set Movement Route', code: 205 },
                                    { name: 'Get on/off Vehicle', code: 206 }
                                ]
                            },
                            {
                                title: 'Character',
                                commands: [
                                    { name: 'Change Transparency', code: 211 },
                                    { name: 'Change Player Followers', code: 216 },
                                    { name: 'Gather Followers', code: 217 },
                                    { name: 'Show Animation', code: 212 },
                                    { name: 'Show Balloon Icon', code: 213 },
                                    { name: 'Erase Event', code: 214 }
                                ]
                            },
                            {
                                title: 'Picture',
                                commands: [
                                    { name: 'Show Picture', code: 231 },
                                    { name: 'Move Picture', code: 232 },
                                    { name: 'Rotate Picture', code: 233 },
                                    { name: 'Tint Picture', code: 234 },
                                    { name: 'Erase Picture', code: 235 }
                                ]
                            }
                        ]
                    },
                    {
                        sections: [
                            {
                                title: 'Timing',
                                commands: [
                                    { name: 'Wait', code: 230 }
                                ]
                            },
                            {
                                title: 'Screen',
                                commands: [
                                    { name: 'Fadeout Screen', code: 221 },
                                    { name: 'Fadein Screen', code: 222 },
                                    { name: 'Tint Screen', code: 223 },
                                    { name: 'Flash Screen', code: 224 },
                                    { name: 'Shake Screen', code: 225 },
                                    { name: 'Set Weather Effect', code: 236 }
                                ]
                            },
                            {
                                title: 'Audio & Video',
                                commands: [
                                    { name: 'Play BGM', code: 241 },
                                    { name: 'Fadeout BGM', code: 242 },
                                    { name: 'Save BGM', code: 243 },
                                    { name: 'Replay BGM', code: 244 },
                                    { name: 'Play BGS', code: 245 },
                                    { name: 'Fadeout BGS', code: 246 },
                                    { name: 'Play ME', code: 249 },
                                    { name: 'Play SE', code: 250 },
                                    { name: 'Stop SE', code: 251 },
                                    { name: 'Play Movie', code: 261 }
                                ]
                            }
                        ]
                    }
                ]
            },
            tab3: {
                name: 'Battle & System',
                columns: [
                    {
                        sections: [
                            {
                                title: 'Scene Control',
                                commands: [
                                    { name: 'Battle Processing', code: 301 },
                                    { name: 'Shop Processing', code: 302 },
                                    { name: 'Name Input Processing', code: 303 },
                                    { name: 'Open Menu Screen', code: 351 },
                                    { name: 'Open Save Screen', code: 352 },
                                    { name: 'Game Over', code: 353 },
                                    { name: 'Return to Title Screen', code: 354 }
                                ]
                            },
                            {
                                title: 'System Settings',
                                commands: [
                                    { name: 'Change Battle BGM', code: 132 },
                                    { name: 'Change Victory ME', code: 133 },
                                    { name: 'Change Save Access', code: 134 },
                                    { name: 'Change Menu Access', code: 135 },
                                    { name: 'Change Encounter', code: 136 },
                                    { name: 'Change Formation Access', code: 137 },
                                    { name: 'Change Window Color', code: 138 },
                                    { name: 'Change Defeat ME', code: 139 },
                                    { name: 'Change Vehicle BGM', code: 140 },
                                    { name: 'Change Actor Images', code: 322 },
                                    { name: 'Change Vehicle Image', code: 323 }
                                ]
                            }
                        ]
                    },
                    {
                        sections: [
                            {
                                title: 'Map',
                                commands: [
                                    { name: 'Change Map Name Display', code: 281 },
                                    { name: 'Change Tileset', code: 282 },
                                    { name: 'Change Battle Background', code: 283 },
                                    { name: 'Change Parallax', code: 284 },
                                    { name: 'Get Location Info', code: 285 }
                                ]
                            },
                            {
                                title: 'Battle',
                                commands: [
                                    { name: 'Change Enemy HP', code: 331 },
                                    { name: 'Change Enemy MP', code: 332 },
                                    { name: 'Change Enemy TP', code: 342 },
                                    { name: 'Change Enemy State', code: 333 },
                                    { name: 'Enemy Recover All', code: 334 },
                                    { name: 'Enemy Appear', code: 335 },
                                    { name: 'Enemy Transform', code: 336 },
                                    { name: 'Show Battle Animation', code: 337 },
                                    { name: 'Force Action', code: 339 },
                                    { name: 'Abort Battle', code: 340 }
                                ]
                            },
                            {
                                title: 'Advanced',
                                commands: [
                                    { name: 'Script', code: 355 },
                                    { name: 'Plugin Command', code: 356 }
                                ]
                            }
                        ]
                    }
                ]
            }
        };
    }

    /**
     * Show the command picker
     */
    show(callback) {
        this.callback = callback;

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
        this.modal.className = 'event-command-picker-modal';
        this.modal.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.7);
            z-index: 10003;
            justify-content: center;
            align-items: center;
        `;

        const container = document.createElement('div');
        container.className = 'command-picker-container';
        container.style.cssText = `
            background-color: var(--color-bg-surface);
            border: 1px solid var(--color-border);
            border-radius: 6px;
            width: 850px;
            height: 90vh;
            max-height: 900px;
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
     * Render modal content
     */
    renderContent() {
        const container = this.modal.querySelector('.command-picker-container');
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
            <h3 style="margin: 0; color: var(--color-text-strong); font-size: 16px;">Select Event Command</h3>
            <button class="close-btn" style="background: none; border: none; color: var(--color-text-strong); font-size: 20px; cursor: pointer; padding: 0; width: 24px; height: 24px;">×</button>
        `;
        container.appendChild(header);

        header.querySelector('.close-btn').addEventListener('click', () => this.close());

        // Tabs
        const tabBar = document.createElement('div');
        tabBar.style.cssText = `
            display: flex;
            background-color: var(--color-bg-list-item);
            border-bottom: 1px solid var(--color-border);
            gap: 2px;
            padding: 4px;
        `;

        const tabs = ['tab1', 'tab2', 'tab3'];
        tabs.forEach((tabKey, index) => {
            const tab = document.createElement('button');
            tab.textContent = this.commandData[tabKey].name;
            tab.style.cssText = `
                padding: 8px 16px;
                background-color: ${index === this.currentTab ? 'var(--color-accent-bright)' : 'var(--color-bg-input-alt)'};
                color: ${index === this.currentTab ? 'var(--color-accent-on)' : 'var(--color-text-strong)'};
                border: none;
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                transition: background-color 0.15s;
            `;

            tab.addEventListener('click', () => {
                this.currentTab = index;
                this.renderContent();
            });

            tab.addEventListener('mouseenter', () => {
                if (index !== this.currentTab) {
                    tab.style.backgroundColor = 'var(--color-bg-hover)';
                }
            });

            tab.addEventListener('mouseleave', () => {
                if (index !== this.currentTab) {
                    tab.style.backgroundColor = 'var(--color-bg-input-alt)';
                }
            });

            tabBar.appendChild(tab);
        });

        container.appendChild(tabBar);

        // Content area with columns
        const contentArea = document.createElement('div');
        contentArea.style.cssText = `
            flex: 1;
            overflow-y: auto;
            padding: 12px;
            display: flex;
            gap: 12px;
        `;

        const currentTabKey = tabs[this.currentTab];
        const tabData = this.commandData[currentTabKey];

        tabData.columns.forEach(column => {
            const columnDiv = document.createElement('div');
            columnDiv.style.cssText = `
                flex: 1;
                display: flex;
                flex-direction: column;
                gap: 12px;
            `;

            column.sections.forEach(section => {
                const sectionDiv = this.createSection(section);
                columnDiv.appendChild(sectionDiv);
            });

            contentArea.appendChild(columnDiv);
        });

        container.appendChild(contentArea);

        // Footer
        const footer = document.createElement('div');
        footer.style.cssText = `
            padding: 12px 16px;
            border-top: 1px solid var(--color-border);
            display: flex;
            justify-content: flex-end;
        `;
        footer.innerHTML = `
            <button class="cancel-btn rr-btn-secondary">Cancel</button>
        `;
        container.appendChild(footer);

        footer.querySelector('.cancel-btn').addEventListener('click', () => this.close());
    }

    /**
     * Create a section with commands
     */
    createSection(section) {
        const sectionDiv = document.createElement('div');
        sectionDiv.style.cssText = `
            background-color: var(--color-bg-panel);
            border-radius: 4px;
            padding: 8px;
        `;

        const title = document.createElement('div');
        title.textContent = section.title;
        title.style.cssText = `
            font-weight: bold;
            font-size: 13px;
            margin-bottom: 6px;
            color: var(--color-text-strong);
        `;
        sectionDiv.appendChild(title);

        section.commands.forEach(command => {
            const commandBtn = document.createElement('button');
            commandBtn.textContent = command.name;
            commandBtn.style.cssText = `
                width: 100%;
                padding: 6px 10px;
                margin-bottom: 4px;
                background-color: var(--color-bg-surface);
                color: var(--color-text);
                border: 1px solid var(--color-border-input);
                border-radius: 3px;
                cursor: pointer;
                font-size: 12px;
                text-align: left;
                transition: background-color 0.15s;
            `;

            commandBtn.addEventListener('mouseenter', () => {
                commandBtn.style.backgroundColor = 'var(--color-bg-hover)';
            });

            commandBtn.addEventListener('mouseleave', () => {
                commandBtn.style.backgroundColor = 'var(--color-bg-surface)';
            });

            commandBtn.addEventListener('click', () => {
                if (this.callback) {
                    this.callback(command);
                }
                this.close();
            });

            sectionDiv.appendChild(commandBtn);
        });

        return sectionDiv;
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

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = EventCommandPicker;
}
