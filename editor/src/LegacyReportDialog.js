/**
 * LegacyReportDialog - Tools › Import Report…: what an import from an older
 * engine did to this project, kept with the project so nothing about it is
 * hidden. Reads import-report.json (written by every import) and lists the
 * game's original scripts under legacy/Scripts in a read-only viewer, for the
 * author who ports what did not carry over.
 */
(function (root) {
    'use strict';
    const tt = (text) => (root.I18n ? root.I18n.tText(text) : text);

    /** The report's rows as label → text, in reading order. Pure, so tests read it. */
    function summarize(report) {
        const rows = [];
        if (!report) return rows;
        rows.push([tt('Imported from'), [report.engine, report.title ? `“${report.title}”` : ''].filter(Boolean).join(' · ')]);
        if (report.writtenAt) rows.push([tt('Imported on'), String(report.writtenAt).replace('T', ' ').slice(0, 16)]);
        if (report.source) rows.push([tt('Original folder'), report.source]);
        if (report.maps) rows.push([tt('Maps'), String(report.maps)]);
        if (report.files && Object.keys(report.files).length) rows.push([tt('Files'), Object.entries(report.files).map(([k, v]) => `${k} ${v}`).join(', ')]);
        const approx = report.approximations || {};
        const ruby = (approx.rubyScript || 0) + (approx.moveRouteScript || 0) + (approx.rubyCondition || 0) + (approx.rubyOperand || 0);
        if (approx.rubyTranslated || ruby) rows.push([tt('Ruby in events'), `${approx.rubyTranslated || 0} ${tt('translated to JavaScript')}, ${ruby} ${tt('kept as comments')}`]);
        const other = Object.entries(approx).filter(([k]) => !/^ruby|^moveRouteScript$/.test(k)).sort((a, b) => b[1] - a[1]);
        if (other.length) rows.push([tt('Converted or approximated'), other.map(([k, v]) => `${k} ${v}`).join(', ')]);
        if (report.scripts && report.scripts.custom) rows.push([tt('Original scripts'), `${report.scripts.custom} ${tt('sections')}, ${report.scripts.customLines} ${tt('lines')}`]);
        if (report.movies && (report.movies.converted || []).length) rows.push([tt('Movies converted'), report.movies.converted.join(', ')]);
        return rows;
    }

    function show(projectPath) {
        if (typeof require !== 'function' || !projectPath) return;
        const fs = require('fs'), path = require('path');
        const reportPath = path.join(projectPath, 'import-report.json');
        let report = null;
        try { report = JSON.parse(fs.readFileSync(reportPath, 'utf8')); } catch (_) { report = null; }
        const scriptsDir = path.join(projectPath, 'legacy', 'Scripts');
        const scripts = fs.existsSync(scriptsDir) ? fs.readdirSync(scriptsDir).filter(f => /\.rb$/i.test(f)).sort() : [];

        const overlay = document.createElement('div');
        overlay.className = 'rr-modal-overlay';
        overlay.id = 'rr-legacy-report-dialog';
        const modal = document.createElement('div');
        modal.className = 'rr-modal';
        modal.style.width = 'min(920px, 94vw)';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        const rows = summarize(report);
        const skipped = report && Array.isArray(report.skipped) ? report.skipped : [];
        modal.innerHTML = `
            <div class="rr-modal-header"><div class="rr-modal-title">${rrEscapeHtml(tt('Import Report'))}</div><button type="button" class="rr-modal-close" aria-label="${rrEscapeHtml(tt('Close'))}">×</button></div>
            <div class="rr-modal-body" style="display: flex; flex-direction: column; gap: 10px; max-height: 76vh; overflow: auto;">
                ${report ? `<table class="traits-table" style="width: 100%;"><tbody>${rows.map(([k, v]) => `<tr><td style="white-space: nowrap; color: var(--color-text-muted); font-size: 12px; vertical-align: top;">${rrEscapeHtml(k)}</td><td style="font-size: 12px; color: var(--color-text); word-break: break-word;">${rrEscapeHtml(v)}</td></tr>`).join('')}</tbody></table>`
                    : `<div style="color: var(--color-text-muted); font-size: 13px;">${rrEscapeHtml(tt('This project was not imported from an older engine.'))}</div>`}
                ${skipped.length ? `<details><summary style="cursor: pointer; font-size: 12px; color: var(--color-text);">${rrEscapeHtml(tt('Skipped'))} (${skipped.length})</summary><pre style="margin: 6px 0 0; max-height: 160px; overflow: auto; font-size: 11px; color: var(--color-text); background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; padding: 8px; white-space: pre-wrap;">${rrEscapeHtml(skipped.join('\n'))}</pre></details>` : ''}
                ${scripts.length ? `
                <div style="font-size: 13px; font-weight: 600; color: var(--color-text);">${rrEscapeHtml(tt('Original scripts'))} <span style="font-weight: 400; color: var(--color-text-muted); font-size: 12px;">legacy/Scripts</span></div>
                <div style="display: grid; grid-template-columns: minmax(180px, 1fr) 3fr; gap: 8px; min-height: 280px;">
                    <div class="rr-legacy-script-list audio-scroll" role="listbox" style="max-height: 340px; overflow: auto; border: 1px solid var(--color-border); border-radius: 4px; background: var(--color-bg-panel);">
                        ${scripts.map((f, i) => `<div role="option" tabindex="-1" class="rr-legacy-script-item" data-file="${rrEscapeHtml(f)}" style="padding: 4px 8px; font-size: 12px; cursor: pointer; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"${i === 0 ? ' aria-selected="true"' : ''}>${rrEscapeHtml(f.replace(/\.rb$/i, ''))}</div>`).join('')}
                    </div>
                    <pre class="rr-legacy-script-view audio-scroll" style="margin: 0; max-height: 340px; overflow: auto; font-family: Consolas, Monaco, monospace; font-size: 11px; line-height: 1.4; color: var(--color-text); background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px; padding: 8px; white-space: pre;"></pre>
                </div>` : ''}
            </div>
            <div class="rr-modal-footer">${scripts.length ? `<button type="button" class="rr-btn-secondary rr-legacy-open-folder">${rrEscapeHtml(tt('Open Folder'))}</button>` : ''}<button type="button" class="rr-button-primary rr-legacy-close">${rrEscapeHtml(tt('Close'))}</button></div>`;
        overlay.appendChild(modal);
        const close = () => { document.removeEventListener('keydown', onKey, true); overlay.remove(); };
        const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        modal.querySelector('.rr-modal-close').addEventListener('click', close);
        modal.querySelector('.rr-legacy-close').addEventListener('click', close);
        modal.querySelector('.rr-legacy-open-folder')?.addEventListener('click', () => { try { nw.Shell.openItem(scriptsDir); } catch (_) { /* no shell */ } });
        const view = modal.querySelector('.rr-legacy-script-view');
        const select = (item) => {
            modal.querySelectorAll('.rr-legacy-script-item').forEach(el => { const on = el === item; el.setAttribute('aria-selected', on ? 'true' : 'false'); el.style.background = on ? 'var(--color-bg-button)' : ''; });
            try { view.textContent = fs.readFileSync(path.join(scriptsDir, item.dataset.file), 'utf8'); } catch (error) { view.textContent = error.message; }
            view.scrollTop = 0;
        };
        modal.querySelectorAll('.rr-legacy-script-item').forEach(el => el.addEventListener('click', () => select(el)));
        const first = modal.querySelector('.rr-legacy-script-item');
        if (first) select(first);
        document.addEventListener('keydown', onKey, true);
        document.body.appendChild(overlay);
        root.RRKeyboardNavigation?.modal(overlay, { container: () => modal });
        modal.querySelector('.rr-legacy-close').focus();
    }

    const api = { show, summarize };
    root.RRLegacyReportDialog = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
