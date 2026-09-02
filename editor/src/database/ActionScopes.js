/**
 * ActionScopes - the Scope dropdown for Skills and Items.
 *
 * A skill's Scope is stored as a bare integer, so this array's ORDER is the
 * data format: moving an entry rewrites the meaning of every record already
 * authored. Scopes 0-14 are RPG Maker MZ's and keep MZ's exact meaning; 15-22
 * are Reactor's either-side scopes.
 *
 * Skills and Items write the same integer into the same field, so they must
 * offer the same list. They used to hold a copy each, and the copies were both
 * wrong in the same way - kept here once so there is nothing left to drift.
 */
class ActionScopes {
    /** The option labels, in stored-value order. Index is the scope integer. */
    static labels() {
        const tt = text => (window.I18n ? window.I18n.tText(text) : text);
        const scopeNames = ['None', 'One Enemy', 'All Enemies',
            'One Random Enemy', 'Two Random Enemies', 'Three Random Enemies', 'Four Random Enemies',
            'One Ally', 'All Allies', 'One Ally (Dead)', 'All Allies (Dead)', 'User',
            'One Ally (Unconditional)', 'All Allies (Unconditional)', 'All Enemies & Allies',
            'One Ally or Enemy', 'One Enemy or Ally', 'All Allies or All Enemies',
            'All Allies but User',
            'One Random (Any Side)', 'Two Random (Any Side)', 'Three Random (Any Side)', 'Four Random (Any Side)'].map(tt);
        return scopeNames;
    }

    /**
     * One sentence per scope saying who it actually reaches. A label can say
     * "One Ally" but not whether a fallen one counts, who does the choosing, or
     * whether a random roll can land twice on the same battler - and those are
     * exactly the three things that separate scopes which read alike.
     */
    static hints() {
        const tt = text => (window.I18n ? window.I18n.tText(text) : text);
        const scopeHints = [
            'No target. Effects still run, but no battler is touched.',
            'One living enemy, chosen by the player.',
            'Every living enemy.',
            'One roll against the living enemies.',
            'Two rolls against the living enemies. One enemy can come up twice.',
            'Three rolls against the living enemies. One enemy can come up more than once.',
            'Four rolls against the living enemies. One enemy can come up more than once.',
            'One living party member, chosen by the player.',
            'Every living party member.',
            'One fallen party member, chosen by the player.',
            'Every fallen party member.',
            'Only the battler using the skill.',
            'One party member, chosen by the player, alive or fallen.',
            'Every party member, the fallen included.',
            'Every living battler on both sides.',
            'One living battler from either side. The cursor opens on the party.',
            'One living battler from either side. The cursor opens on the enemies.',
            'Pick one battler; the whole living side it stands on is targeted.',
            'Every living party member except the one using the skill.',
            'One roll. Each roll picks a side first, then a living battler on it.',
            'Two rolls. Each roll picks a side first, then a living battler on it.',
            'Three rolls. Each roll picks a side first, then a living battler on it.',
            'Four rolls. Each roll picks a side first, then a living battler on it.'
        ].map(tt);
        return scopeHints;
    }

    /**
     * The dropdown's markup. The hint rides on each option's `title`, which
     * SelectThemingShim renders as a second line in the popup and keeps as the
     * closed control's tooltip.
     */
    static optionsHtml(selectedScope) {
        const escape = value => (typeof globalThis.rrEscapeHtml === 'function'
            ? globalThis.rrEscapeHtml(value)
            : String(value == null ? '' : value)
                .replaceAll('&', '&amp;').replaceAll('<', '&lt;')
                .replaceAll('>', '&gt;').replaceAll('"', '&quot;'));

        const labels = ActionScopes.labels();
        const hints = ActionScopes.hints();
        return labels.map((name, index) => {
            const selected = selectedScope === index ? ' selected' : '';
            const hint = hints[index] ? ` title="${escape(hints[index])}"` : '';
            return `<option value="${index}"${hint}${selected}>${escape(name)}</option>`;
        }).join('');
    }
}

if (typeof globalThis !== 'undefined') {
    globalThis.ActionScopes = ActionScopes;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ActionScopes;
}
