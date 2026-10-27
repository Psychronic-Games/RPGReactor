/**
 * DatabaseFeaturesEditor - Database › Reactor Features.
 *
 * Every addition of Reactor's over MZ that a plugin may also provide
 * (ReactorFeatures), Basic first, each with a tick that turns it on or off.
 * When an enabled plugin in the project's list does the same job, the row
 * says which and offers to turn Reactor's version off. A feature turned off
 * keeps its data; its fields leave the Database's pages and the game behaves
 * as MZ does.
 */
class DatabaseFeaturesEditor {
    constructor(databaseManager, projectManager, commonUI, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.commonUI = commonUI;
        this.parentEditor = parentEditor;
    }

    /** The project's plugins ({name, status}), read fresh each time the page is drawn. */
    projectPlugins() {
        const project = this.projectManager?.getCurrentProject?.();
        if (!project?.path || typeof require !== 'function' || typeof ReactorFeatures === 'undefined') return [];
        return ReactorFeatures.readProjectPlugins(project.path, require('fs'), require('path'));
    }

    showFeaturesDetail(container) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const system = this.databaseManager.getSystem();
        if (!system || typeof ReactorFeatures === 'undefined') {
            container.innerHTML = `<p style="color: var(--color-text-muted); text-align: center; margin-top: 100px;">${tt('System data not loaded')}</p>`;
            return;
        }
        this._container = container;
        const plugins = this.projectPlugins();

        const wrapper = document.createElement('div');
        wrapper.className = 'rr-features-page';
        wrapper.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow-y: auto;';

        const banner = document.createElement('div');
        banner.style.cssText = `background-color: var(--color-bg-deep); padding: 14px 20px; border-bottom: 2px solid var(--color-accent-border-mid);
            font-size: 20px; font-weight: 600; color: var(--color-text-strong);`;
        banner.textContent = tt('Reactor Features');
        wrapper.appendChild(banner);

        const body = document.createElement('div');
        body.style.cssText = 'display: flex; flex-direction: column; gap: 16px; padding: 16px; max-width: 900px;';
        const note = document.createElement('div');
        note.style.cssText = 'font-size: 12px; color: var(--color-text-muted);';
        note.textContent = tt("Reactor's own additions to MZ. Turn one off when a plugin does the same job: its Database fields are hidden, the game behaves as MZ does, and data already entered is kept.");
        body.appendChild(note);

        const features = ReactorFeatures.listed();
        for (const tier of ['basic', 'advanced']) {
            const rows = features.filter(feature => (feature.tier === 'basic') === (tier === 'basic'));
            if (!rows.length) continue;
            const section = document.createElement('div');
            section.className = 'database-section';
            section.innerHTML = `<div class="database-section-header" data-section-key="features-${tier}">${tt(tier === 'basic' ? 'Basic' : 'Advanced')}</div>
                <div class="database-section-content">${rows.map(feature => this.rowHtml(feature, system, plugins)).join('')}</div>`;
            body.appendChild(section);
        }
        wrapper.appendChild(body);
        container.appendChild(wrapper);
        this.wire(wrapper, system);
    }

    rowHtml(feature, system, plugins) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const enabled = ReactorFeatures.on(feature.id, system);
        const by = ReactorFeatures.providers(feature.id, plugins);
        const provided = by.length ? `
            <div class="rr-feature-provided" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; font-size: 11px; color: var(--color-warning-text, var(--color-accent));">
                <span>${tt('Provided by plugin:')} ${by.map(name => `<b>${rrEscapeHtml(name)}</b>`).join(', ')}</span>
                ${enabled ? `<button type="button" class="rr-btn-secondary rr-feature-turn-off" data-feature="${feature.id}" style="font-size: 11px; padding: 2px 8px;">${tt("Turn off Reactor's version")}</button>` : ''}
            </div>` : '';
        return `<div class="rr-feature-row" data-feature="${feature.id}" style="padding: 8px 0; border-bottom: 1px solid var(--color-border-subtle, var(--color-border));">
            <label style="display: flex; align-items: center; gap: 8px; color: var(--color-text); font-size: 13px; cursor: pointer;">
                <input type="checkbox" class="system-checkbox rr-feature-toggle" data-feature="${feature.id}"${enabled ? ' checked' : ''}>
                <span>${tt(feature.label)}</span>
            </label>
            <div style="font-size: 11px; color: var(--color-text-muted); margin: 2px 0 0 26px;">${tt(feature.description)}</div>
            ${provided ? `<div style="margin-left: 26px;">${provided}</div>` : ''}
        </div>`;
    }

    wire(root, system) {
        root.querySelectorAll('.rr-feature-toggle').forEach(box => {
            box.addEventListener('change', () => this.apply(system, box.dataset.feature, box.checked));
        });
        root.querySelectorAll('.rr-feature-turn-off').forEach(button => {
            button.addEventListener('click', () => this.apply(system, button.dataset.feature, false));
        });
    }

    /** Switch one feature, and redraw what shows it: this page and the Database's page list. */
    apply(system, id, enabled) {
        if (!ReactorFeatures.set(id, enabled, system)) return;
        this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
        this.parentEditor?.setupDatabaseNavigation?.();
        if (this._container) {
            const scroll = this._container.querySelector('.rr-features-page')?.scrollTop || 0;
            this._container.innerHTML = '';
            this.showFeaturesDetail(this._container);
            const page = this._container.querySelector('.rr-features-page');
            if (page) page.scrollTop = scroll;
        }
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = DatabaseFeaturesEditor;
