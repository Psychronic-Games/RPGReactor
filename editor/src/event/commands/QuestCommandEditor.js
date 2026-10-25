/**
 * The quest event commands - Reactor commands stored as MZ plugin commands
 * (code 357, plugin "RPGReactor") so the data stays loadable everywhere and
 * a stock MZ runtime simply ignores them.
 *
 *   QuestSet        discover / complete / fail / reset / track / untrack a quest
 *   QuestObjective  show / hide / complete / fail / reset one objective, or all
 *   QuestReward     show / hide / give one reward, or all
 *   OpenQuestLog    open the quest log, on a quest if one is named
 */
class QuestCommandEditor {
    static NAMES = ['QuestSet', 'QuestObjective', 'QuestReward', 'OpenQuestLog'];
    static LABELS = { QuestSet: 'Quest', QuestObjective: 'Quest Objective', QuestReward: 'Quest Reward', OpenQuestLog: 'Open Quest Log' };
    static ACTIONS = ['discover', 'complete', 'fail', 'reset', 'track', 'untrack'];
    static OBJECTIVE_STATES = ['complete', 'show', 'hide', 'fail', 'reset'];
    static REWARD_STATES = ['show', 'hide', 'give'];

    constructor(databaseManager) {
        this.databaseManager = databaseManager;
    }

    static supports(name) {
        return QuestCommandEditor.NAMES.includes(name);
    }

    _t(text) {
        return window.I18n ? window.I18n.tText(text) : text;
    }

    /** Every authored quest as [id, label]. */
    quests() {
        const manager = this.databaseManager || (window.reactor && window.reactor.databaseManager) || null;
        const list = manager && manager.getQuests ? manager.getQuests() : [];
        return list.filter(quest => quest && quest.id > 0).map(quest => [
            String(quest.id),
            String(quest.id).padStart(4, '0') + ': ' + (quest.name || '') + (quest.key ? ` (${quest.key})` : ''),
            quest
        ]);
    }

    /** A reward's line in the Reward list: its own text, or what it gives when it has none. */
    rewardLabel(entry) {
        const own = String((entry && entry.text) || '').replace(/\\[A-Za-z]+\[\d*\]/g, '').trim();
        if (own || !entry) return own;
        const manager = this.databaseManager || (window.reactor && window.reactor.databaseManager) || null;
        const system = (manager && manager.getSystem && manager.getSystem()) || {};
        const amount = Math.floor(Number(entry.amount)) || 1;
        switch (entry.give) {
            case 'gold': return `${amount} ${system.currencyUnit || 'G'}`;
            case 'exp': return `${amount} ${(system.terms && system.terms.basic && system.terms.basic[8]) || 'EXP'}`;
            case 'item': case 'weapon': case 'armor': {
                const getter = { item: 'getItem', weapon: 'getWeapon', armor: 'getArmor' }[entry.give];
                const record = manager && manager[getter] ? manager[getter](Number(entry.giveId)) : null;
                return record ? record.name + (amount !== 1 ? ' \u00d7' + amount : '') : '';
            }
            case 'commonEvent': {
                const event = manager && manager.getCommonEvent ? manager.getCommonEvent(Number(entry.giveId)) : null;
                return `${this._t('Common event')}: ${event && event.name ? event.name : '#' + String(entry.giveId || 0).padStart(4, '0')}`;
            }
            default: return '';
        }
    }

    /** The wording the actions carry in the list and the dialog. */
    actionLabel(name, value) {
        const table = {
            QuestSet: { discover: 'Discover', complete: 'Complete', fail: 'Fail', reset: 'Reset', track: 'Track', untrack: 'Stop tracking' },
            QuestObjective: { complete: 'Complete', show: 'Show', hide: 'Hide', fail: 'Fail', reset: 'Reset' },
            QuestReward: { show: 'Show', hide: 'Hide', give: 'Give now' }
        }[name] || {};
        return this._t(table[value] || value);
    }

    show(command, callback, nameHint) {
        const params = (command && command.parameters) || [];
        const name = QuestCommandEditor.supports(params[1]) ? params[1] : (nameHint || 'QuestSet');
        const args = (params[3] && typeof params[3] === 'object') ? params[3] : {};
        const quests = this.quests();
        const currentQuest = String(args.questId != null ? args.questId : '');
        if (currentQuest && !quests.some(([value]) => value === currentQuest)) {
            quests.unshift([currentQuest, String(currentQuest).padStart(4, '0') + ': ' + this._t('(Missing)'), null]);
        }
        const selectedQuest = currentQuest || (quests.length ? quests[0][0] : '');
        const escape = value => String(value == null ? '' : value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        const selectCss = 'flex:1;padding:4px 6px;background:var(--color-bg-surface);color:var(--color-text);border:1px solid var(--color-border-input);border-radius:3px;';
        const row = (label, inner) => `<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--color-text);"><span style="flex:0 0 90px;">${label}</span>${inner}</label>`;
        const options = (list, current) => list.map(([value, label]) => `<option value="${escape(value)}"${value === current ? ' selected' : ''}>${escape(label)}</option>`).join('');

        let body = row(this._t('Quest'), `<select class="qc-quest" style="${selectCss}">${quests.length ? options(quests, selectedQuest) : `<option value="">${this._t('No quests in the database yet')}</option>`}</select>`);
        if (name === 'QuestSet') {
            body += row(this._t('Action'), `<select class="qc-action" style="${selectCss}">${options(QuestCommandEditor.ACTIONS.map(a => [a, this.actionLabel(name, a)]), String(args.action || 'discover'))}</select>`);
        } else if (name === 'QuestObjective') {
            body += row(this._t('Objective'), `<select class="qc-index" style="${selectCss}"></select>`);
            body += row(this._t('Set to'), `<select class="qc-action" style="${selectCss}">${options(QuestCommandEditor.OBJECTIVE_STATES.map(a => [a, this.actionLabel(name, a)]), String(args.state || 'complete'))}</select>`);
        } else if (name === 'QuestReward') {
            body += row(this._t('Reward'), `<select class="qc-index" style="${selectCss}"></select>`);
            body += row(this._t('Set to'), `<select class="qc-action" style="${selectCss}">${options(QuestCommandEditor.REWARD_STATES.map(a => [a, this.actionLabel(name, a)]), String(args.state || 'show'))}</select>`);
        } else {
            body = row(this._t('Open on'), `<select class="qc-quest" style="${selectCss}"><option value=""${selectedQuest && currentQuest ? '' : ' selected'}>${this._t('(the log itself)')}</option>${options(quests, currentQuest)}</select>`);
        }

        const modal = document.createElement('div');
        modal.className = 'rr-modal-overlay rr-command-editor-modal';
        modal.style.zIndex = '21000';
        const title = window.I18n && window.I18n.tEventCommandName
            ? window.I18n.tEventCommandName(QuestCommandEditor.LABELS[name]) : QuestCommandEditor.LABELS[name];
        modal.innerHTML = `
            <div class="rr-modal" style="width:min(460px,90vw);display:flex;flex-direction:column;">
                <div class="rr-modal-header">
                    <div class="rr-modal-title">${escape(title)}</div>
                    <button type="button" class="rr-modal-close qc-cancel">&times;</button>
                </div>
                <div class="rr-modal-body" style="display:flex;flex-direction:column;gap:10px;">${body}</div>
                <div class="rr-modal-footer" style="display:flex;justify-content:flex-end;gap:8px;padding:10px 14px;">
                    <button type="button" class="rr-btn-secondary qc-cancel">${window.I18n ? window.I18n.t('common.cancel') : 'Cancel'}</button>
                    <button type="button" class="rr-button-primary qc-ok">${window.I18n ? window.I18n.t('common.ok') : 'OK'}</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        // The objective or reward list follows the chosen quest.
        const questSelect = modal.querySelector('.qc-quest');
        const indexSelect = modal.querySelector('.qc-index');
        const fillIndexes = () => {
            if (!indexSelect) return;
            const chosen = quests.find(([value]) => value === questSelect.value);
            const record = chosen && chosen[2];
            const entries = record ? (name === 'QuestObjective' ? record.objectives : record.rewards) || [] : [];
            const current = String(args[name === 'QuestObjective' ? 'objective' : 'reward'] || 'all');
            const list = [['all', this._t('All')]].concat(entries.map((entry, index) => [String(index + 1), `${index + 1}: ${(name === 'QuestReward' ? this.rewardLabel(entry) : (entry && entry.text ? String(entry.text) : '').replace(/\\[A-Za-z]+\[\d*\]/g, '')).slice(0, 48)}`]));
            indexSelect.innerHTML = options(list, list.some(([value]) => value === current) ? current : 'all');
        };
        fillIndexes();
        questSelect.addEventListener('change', fillIndexes);
        const okButton = modal.querySelector('.qc-ok');
        const updateAvailability = () => {
            okButton.disabled = name !== 'OpenQuestLog' && !questSelect.value;
        };
        questSelect.addEventListener('change', updateAvailability);
        updateAvailability();

        const close = () => { if (modal.parentNode) modal.parentNode.removeChild(modal); };
        modal.querySelectorAll('.qc-cancel').forEach(button => button.addEventListener('click', () => { close(); callback(null); }));
        okButton.addEventListener('click', () => {
            const questId = questSelect.value;
            if (name !== 'OpenQuestLog' && !questId) return;
            const built = {};
            if (questId) built.questId = questId;
            if (name === 'QuestSet') built.action = modal.querySelector('.qc-action').value;
            if (name === 'QuestObjective') { built.objective = indexSelect.value; built.state = modal.querySelector('.qc-action').value; }
            if (name === 'QuestReward') { built.reward = indexSelect.value; built.state = modal.querySelector('.qc-action').value; }
            close();
            callback(QuestCommandEditor.build(name, built, (command && command.indent) || 0, this));
        });
    }

    /** What the command does, in one line ("Discover: Herb Hunt"); quest names are read as they are now. */
    static summary(name, args, editor = null) {
        args = args || {};
        let quest = null;
        try { quest = editor ? editor.quests().find(([value]) => value === String(args.questId)) : null; } catch (_) { quest = null; }
        const questName = quest ? (quest[2] && quest[2].name) || quest[1] : (args.questId ? `#${args.questId}` : '');
        const all = editor ? editor._t('All') : 'All';
        if (name === 'QuestSet') return `${editor ? editor.actionLabel(name, args.action) : args.action}: ${questName}`;
        if (name === 'QuestObjective') return `${questName} ${args.objective === 'all' ? all : '#' + args.objective} → ${editor ? editor.actionLabel(name, args.state) : args.state}`;
        if (name === 'QuestReward') return `${questName} ${args.reward === 'all' ? all : '#' + args.reward} → ${editor ? editor.actionLabel(name, args.state) : args.state}`;
        return questName;
    }

    /** The command as stored: params[2] keeps a readable label for other tools. */
    static build(name, args, indent = 0, editor = null) {
        const label = QuestCommandEditor.LABELS[name] || name;
        const detail = QuestCommandEditor.summary(name, args, editor);
        return {
            code: 357,
            indent,
            parameters: ['RPGReactor', name, detail ? `${label}: ${detail}` : label, args]
        };
    }
}

if (typeof globalThis !== 'undefined') globalThis.QuestCommandEditor = QuestCommandEditor;
if (typeof module !== 'undefined' && module.exports) module.exports = QuestCommandEditor;
