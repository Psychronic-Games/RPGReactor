/**
 * DatabaseMusicSequenceEditor - Database > Music Sequences.
 *
 * The project's library of BGM sequences, stored on System.json as
 * `reactorMusicSequences: [null, { id, name, sequence }]`. A map can play an
 * entry as its music, and a troop, a map or Change Battle BGM can name one as
 * battle music; the runtime (reactor_managers.js) reads this shape as it is.
 * The rows are the shared RRBgmSequenceEditor that Map Properties uses for a
 * sequence stored on a single map, so the two surfaces cannot drift apart.
 */
class DatabaseMusicSequenceEditor {
    constructor(databaseManager, projectManager, parentEditor) {
        this.databaseManager = databaseManager;
        this.projectManager = projectManager;
        this.parentEditor = parentEditor;
        this.sequenceEditor = null;
    }

    _tt(text) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.tText(text) : text;
    }

    _t(key, params) {
        return typeof window !== 'undefined' && window.I18n ? window.I18n.t(key, params) : key;
    }

    _project() {
        return this.projectManager && this.projectManager.getCurrentProject
            ? this.projectManager.getCurrentProject() : null;
    }

    /** A record with every field the runtime reads. A library sequence is always on. */
    static normalize(record) {
        if (!record) return record;
        record.name = typeof record.name === 'string' ? record.name : '';
        record.sequence = Object.assign(RRBgmSequenceEditor.normalize(record.sequence), { enabled: true });
        return record;
    }

    show(container, record) {
        const tt = text => this._tt(text);
        // Edits land on the stored record, not on whatever copy the list handed over.
        const live = this.databaseManager.getMusicSequence(record.id) || record;
        DatabaseMusicSequenceEditor.normalize(live);

        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.className = 'database-detail-wrapper db-page';
        wrapper.innerHTML = `
            <div class="database-section">
                <div class="database-section-header">${rrEscapeHtml(tt('General'))}</div>
                <div class="database-section-content"><div class="db-form">
                    <div class="db-row-cols">
                        <span class="db-col"><label>${rrEscapeHtml(tt('Name'))}</label><input type="text" class="database-field-value music-sequence-name" data-field="name" value="${rrEscapeHtml(live.name)}"></span>
                    </div>
                </div></div>
            </div>
            <div class="database-section">
                <div class="database-section-header">${rrEscapeHtml(tt('Sequence'))}</div>
                <div class="database-section-content">
                    <div style="font-size: 11px; color: var(--color-text-muted); line-height: 1.5; margin-bottom: 6px;">${rrEscapeHtml(tt('A sequence here can play as a map’s music, or as battle music for a troop, a map or Change Battle BGM.'))}</div>
                    <div class="music-sequence-rows"></div>
                    <div class="music-sequence-problem" style="font-size: 11px; color: var(--color-danger-bright); line-height: 1.5; margin-top: 6px;"></div>
                </div>
            </div>`;
        container.appendChild(wrapper);

        // There is no OK here, so a fault is shown as it happens rather than blocking a save.
        const problem = wrapper.querySelector('.music-sequence-problem');
        const showProblem = sequence => {
            problem.textContent = RRBgmSequenceEditor.validate(sequence, text => this._tt(text)) || '';
        };

        wrapper.querySelector('.music-sequence-name').addEventListener('input', event => {
            live.name = event.target.value;
            this.markChanged();
            this.parentEditor?.refreshDatabaseListEntry?.(live, 'musicSequences');
        });

        this.sequenceEditor = new RRBgmSequenceEditor({
            container: wrapper.querySelector('.music-sequence-rows'),
            tt: text => this._tt(text),
            t: (key, params) => this._t(key, params),
            pickTrack: options => this.pickTrack(options),
            listTracks: () => this.bgmTrackNames(),
            onEdit: sequence => {
                live.sequence = Object.assign(sequence, { enabled: true });
                this.markChanged();
                showProblem(live.sequence);
            }
        });
        this.sequenceEditor.load(live.sequence);
        showProblem(live.sequence);
    }

    markChanged() {
        this.databaseManager.mutationGeneration = (this.databaseManager.mutationGeneration || 0) + 1;
    }

    /** The project's BGM track names, which the list's starters are filled from. */
    bgmTrackNames() {
        const project = this._project();
        if (!project?.path || typeof RRAssetFiles === 'undefined') return [];
        try {
            const folder = require('path').join(project.path, 'audio', 'bgm');
            return RRAssetFiles.listUnique(folder, RRAssetFiles.AUDIO_EXTENSIONS).map(file => file.name).filter(Boolean);
        } catch (error) {
            return [];
        }
    }

    /** A track for a row or a pool, through the shared audio picker. */
    pickTrack(options) {
        return new Promise(resolve => {
            const project = this._project();
            if (!project?.path || typeof RRAudioPickerModal === 'undefined' || typeof RRAssetFiles === 'undefined') return resolve(null);
            const path = require('path');
            RRAudioPickerModal.open({
                title: `${this._tt('Select')} BGM ${this._tt('File')}`,
                folderLabel: 'BGM',
                files: RRAssetFiles.listUnique(path.join(project.path, 'audio', 'bgm'), RRAssetFiles.AUDIO_EXTENSIONS),
                selected: options.selected || '',
                levels: options.levels || null,
                previewLevels: options.previewLevels || undefined,
                loopDefault: false,
                zIndex: 10010,
                onOk: result => resolve(result),
                onCancel: () => resolve(null)
            });
        });
    }
}

if (typeof module !== 'undefined' && module.exports) module.exports = DatabaseMusicSequenceEditor;
