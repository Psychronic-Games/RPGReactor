/**
 * RRBattleMusic - the battle music a map, a troop or Change Battle BGM names.
 *
 * One stored shape everywhere, the audio object Change Battle BGM has always
 * held: `{ name, volume, pitch, pan }` plays that track, and an added
 * `sequence: "library:<id>"` plays that entry of Database > Music Sequences,
 * with the track kept as its fallback. The runtime reads the same shape in
 * AudioManager.battleMusicBgm (runtime/reactor_managers.js).
 */
class RRBattleMusic {
    /** The library id an audio object names, or 0. */
    static sequenceId(audio) {
        const match = audio && typeof audio.sequence === 'string' ? /^library:(\d+)$/.exec(audio.sequence) : null;
        return match ? Number(match[1]) : 0;
    }

    /** A clean copy to store, or null when it names neither a track nor a sequence. */
    static normalize(audio) {
        if (!audio || typeof audio !== 'object') return null;
        const number = (value, fallback) => {
            if (value === null || value === undefined || value === '') return fallback;
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : fallback;
        };
        const result = {
            name: typeof audio.name === 'string' ? audio.name : '',
            volume: number(audio.volume, 90),
            pitch: number(audio.pitch, 100),
            pan: number(audio.pan, 0)
        };
        const id = RRBattleMusic.sequenceId(audio);
        if (id > 0) result.sequence = `library:${id}`;
        return result.name || id > 0 ? result : null;
    }

    /** What a form shows: the sequence by name, the track, or `(None)`. */
    static label(audio, databaseManager, tt) {
        const say = tt || (text => text);
        const id = RRBattleMusic.sequenceId(audio);
        if (id > 0) {
            const entry = databaseManager && typeof databaseManager.getMusicSequence === 'function'
                ? databaseManager.getMusicSequence(id) : null;
            return `${say('Music sequence')}: ${entry ? entry.name : say('(missing)')}`;
        }
        return audio && audio.name ? audio.name : say('(None)');
    }

    /**
     * The Music sequence row that sits above the audio picker: { row, select },
     * or null when there is nothing to choose and nothing is named. A host adds
     * choices of its own after (None) with `extraOptions` (Map Properties' "Stored
     * on this map"), and says what they mean with `hint`.
     */
    static sequenceRow(databaseManager, selectedId, tt, { extraOptions = [], hint } = {}) {
        const say = tt || (text => text);
        const escape = text => typeof rrEscapeHtml === 'function' ? rrEscapeHtml(text) : String(text);
        const entries = databaseManager && typeof databaseManager.getMusicSequences === 'function'
            ? databaseManager.getMusicSequences() : [];
        const selected = extraOptions.some(option => String(option.value) === String(selectedId))
            ? String(selectedId) : (Number(selectedId) || 0);
        if (!entries.length && !selected && !extraOptions.length) return null;
        if (typeof document === 'undefined' || typeof RRBgmSequenceEditor === 'undefined') return null;
        const row = document.createElement('div');
        row.className = 'audio-command-sequence-row';
        row.style.cssText = 'display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px;';
        row.innerHTML = `
            <label style="display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--color-text);">
                <span style="flex: 0 0 auto;">${escape(say('Music sequence'))}</span>
                <select class="audio-command-sequence-select" style="flex: 1; min-width: 0; padding: 4px 6px; font-size: 12px; background: var(--color-bg-input); color: var(--color-text); border: 1px solid var(--color-border-input); border-radius: 3px;">${RRBgmSequenceEditor.libraryOptions(entries, selected, say('(None)'), say('(missing)'), extraOptions)}</select>
            </label>
            <div style="font-size: 11px; color: var(--color-text-muted); line-height: 1.5;">${escape(hint || say('A sequence from Database › Music Sequences plays instead of the track below, which stays as its fallback.'))}</div>`;
        return { row, select: row.querySelector('select') };
    }

    /** The audio object an OK in the picker stands for. */
    static fromPicker(result, sequenceRow) {
        const audio = { name: result.name, volume: result.volume, pitch: result.pitch, pan: result.pan };
        const id = sequenceRow ? Number(sequenceRow.select.value) || 0 : 0;
        if (id > 0) audio.sequence = `library:${id}`;
        return audio;
    }

    /**
     * Choose battle music in the shared audio picker, a track or (from the row
     * on top) a library sequence. `onOk` receives the audio object. Returns
     * false when there is no project to pick from.
     */
    static open({ databaseManager, projectPath, current, zIndex, onOk }) {
        const tt = text => (typeof window !== 'undefined' && window.I18n) ? window.I18n.tText(text) : text;
        if (!projectPath || typeof RRAudioPickerModal === 'undefined' || typeof RRAssetFiles === 'undefined') return false;
        const path = require('path');
        const fs = require('fs');
        const folder = path.join(projectPath, 'audio', 'bgm');
        const audio = current || {};
        const sequenceRow = RRBattleMusic.sequenceRow(databaseManager, RRBattleMusic.sequenceId(audio), tt);
        RRAudioPickerModal.open({
            title: `${tt('Select')} BGM ${tt('File')}`,
            folderLabel: 'BGM',
            files: fs.existsSync(folder) ? RRAssetFiles.listUnique(folder, RRAssetFiles.AUDIO_EXTENSIONS) : [],
            selected: audio.name || '',
            levels: {
                volume: audio.volume !== undefined ? audio.volume : 90,
                pitch: audio.pitch !== undefined ? audio.pitch : 100,
                pan: audio.pan !== undefined ? audio.pan : 0
            },
            loopDefault: true,
            zIndex: zIndex || 10010,
            extraControls: sequenceRow ? sequenceRow.row : undefined,
            onOk: result => onOk(RRBattleMusic.fromPicker(result, sequenceRow))
        });
        return true;
    }
}

if (typeof globalThis !== 'undefined') globalThis.RRBattleMusic = RRBattleMusic;
if (typeof module !== 'undefined' && module.exports) module.exports = RRBattleMusic;
