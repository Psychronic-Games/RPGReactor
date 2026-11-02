/**
 * DatabaseFlowForm - the settings pages that are nothing but options. Their cards flow
 * into as many columns as the window has room for and cascade down as it narrows, and
 * within a card short fields sit side by side. `.rr-flow-page` in styles.css does it.
 * Help that a label doesn't need is the field's tooltip, so a page reads at a glance.
 */
class DatabaseFlowForm {
    constructor(parent) {
        this.parent = parent;
    }

    /** An element with a heading above a flowing page, filling `container`. */
    static page(container, heading) {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow-y: auto;';
        const title = document.createElement('div');
        title.style.cssText = 'background-color: var(--color-bg-deep); padding: 14px 20px; border-bottom: 2px solid var(--color-accent-border-mid); font-size: 20px; font-weight: 600; color: var(--color-text-strong);';
        title.textContent = heading;
        const flow = document.createElement('div');
        flow.className = 'rr-flow-page';
        wrapper.append(title, flow);
        container.appendChild(wrapper);
        return { wrapper, form: new DatabaseFlowForm(flow) };
    }

    tip(text) {
        return text ? ` title="${String(text).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}"` : '';
    }

    note(text) {
        return `<div class="rr-flow-note">${text}</div>`;
    }

    check(id, label, checked, tip = '') {
        return `<label class="rr-flow-check"${this.tip(tip)}><input type="checkbox" id="${id}" class="system-checkbox" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
    }

    number(id, label, value, min, max, tip = '') {
        return `<div class="rr-flow-field"${this.tip(tip)}><label for="${id}">${label}</label><input type="number" id="${id}" class="rr-input" value="${value}" min="${min}" max="${max}"></div>`;
    }

    choice(id, label, list, value, tip = '', wide = false) {
        const options = list.map(([option, text]) => `<option value="${option}" ${option === value ? 'selected' : ''}>${text}</option>`).join('');
        return `<div class="rr-flow-field${wide ? ' rr-flow-wide' : ''}"${this.tip(tip)}>${label ? `<label for="${id}">${label}</label>` : ''}<select id="${id}" class="rr-select">${options}</select></div>`;
    }

    text(id, label, placeholder = '', tip = '', wide = false) {
        return `<div class="rr-flow-field${wide ? ' rr-flow-wide' : ''}"${this.tip(tip)}><label for="${id}">${label}</label><input type="text" id="${id}" class="rr-input" spellcheck="false" autocomplete="off" placeholder="${placeholder}"></div>`;
    }

    area(id, label, rows, tip = '') {
        return `<div class="rr-flow-field rr-flow-wide"${this.tip(tip)}><label for="${id}">${label}</label><textarea id="${id}" class="rr-input" rows="${rows}" spellcheck="false"></textarea></div>`;
    }

    fields(...cells) {
        return `<div class="rr-flow-fields">${cells.join('')}</div>`;
    }

    section(key, heading, content) {
        const element = document.createElement('div');
        element.className = 'database-section';
        element.innerHTML = `<div class="database-section-header" data-section-key="${key}">${heading}</div><div class="database-section-content">${content}</div>`;
        this.parent.appendChild(element);
        return element;
    }

    /** Greys out what has no effect while its switch is off, and keeps the values. */
    static enable(root, ids, on) {
        for (const id of ids) {
            const input = root.querySelector('#' + id);
            if (!input) continue;
            input.disabled = !on;
            (input.closest('.rr-flow-field, .rr-flow-check') || input).classList.toggle('rr-flow-off', !on);
        }
    }
}

if (typeof window !== 'undefined') window.DatabaseFlowForm = DatabaseFlowForm;
