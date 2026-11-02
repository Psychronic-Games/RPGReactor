/**
 * DatabaseCharacterCreationEditor - Database › Character Creation: how players
 * become their character, in single-player and online games alike. Kept in
 * data/ReactorCharacters.json, which only exists once a project has set something
 * here; without it a game plays its actors as authored.
 * The game reads these in runtime/reactor_character_creator.js; `rules` also go to
 * the Forge's CharacterControls and to the online server.
 */
class DatabaseCharacterCreationEditor {
    static DEFAULTS = Object.freeze({ mode: 'off', onNewGame: true, prompt: '', askName: true, nameLength: 16, quality: 'standard' });
    static RULES = Object.freeze({ species: 'human', body: true, face: true, hair: true, outfit: true, colors: true, extreme: false, anatomy: false });

    constructor(databaseManager) {
        this.databaseManager = databaseManager;
    }

    /** A copy with every field present. Nothing reaches the project until something is changed. */
    settings(saved) {
        const character = { ...DatabaseCharacterCreationEditor.DEFAULTS, ...saved };
        character.rules = { ...DatabaseCharacterCreationEditor.RULES, ...saved?.rules };
        character.actors = Array.isArray(saved?.actors) ? saved.actors.slice() : [];
        return character;
    }

    showDetail(container) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const settings = this.settings(this.databaseManager.getCharacterCreationSettings()), rules = settings.rules;
        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow-y: auto;';
        const title = document.createElement('div');
        title.style.cssText = 'background-color: var(--color-bg-deep); padding: 14px 20px; border-bottom: 2px solid var(--color-accent-border-mid); font-size: 20px; font-weight: 600; color: var(--color-text-strong);';
        title.textContent = tt('Character Creation');
        const body = document.createElement('div');
        body.style.cssText = 'display: flex; flex-direction: column; gap: 16px; padding: 16px; max-width: 760px;';
        wrapper.append(title, body);
        container.appendChild(wrapper);
        // Any change writes the whole settings object, the first one creating the project's file.
        wrapper.addEventListener('change', () => { this.databaseManager.data.characterCreation = settings; });

        const note = text => `<div style="color: var(--color-text-muted); font-size: 11px; line-height: 1.4; margin-top: 4px;">${text}</div>`;
        const check = (id, label, checked, help = '') => `<label style="display: flex; gap: 8px; align-items: flex-start; margin-bottom: 10px; cursor: pointer;">
            <input type="checkbox" id="${id}" class="system-checkbox" ${checked ? 'checked' : ''}>
            <span><span style="color: var(--color-text);">${label}</span>${help ? note(help) : ''}</span></label>`;
        const section = (parent, key, heading, content) => {
            const element = document.createElement('div');
            element.className = 'database-section';
            element.innerHTML = `<div class="database-section-header" data-section-key="${key}">${heading}</div><div class="database-section-content">${content}</div>`;
            parent.appendChild(element);
            return element;
        };
        const options = (list, value) => list.map(([id, label]) => `<option value="${id}" ${id === value ? 'selected' : ''}>${label}</option>`).join('');

        section(body, 'character-mode', tt('How players get their character'), `
            <select id="character-mode" class="rr-select">${options([
                ['off', tt('Off: play the project\'s actors')],
                ['choose', tt('Choose from a list of characters')],
                ['build', tt('Build a character with sliders')]], settings.mode)}</select>
            ${note(tt('Works in single-player and online games. The Character Creation event command opens it at any time.'))}`);
        const details = document.createElement('div');
        details.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
        body.appendChild(details);
        section(details, 'character-start', tt('Starting a game'), `
            ${check('character-new-game', tt('Open on New Game'), settings.onNewGame !== false)}
            <div style="margin-bottom: 10px;">
                <label for="character-prompt" style="display: block; color: var(--color-text); margin-bottom: 4px;">${tt('Screen title')}</label>
                <input type="text" id="character-prompt" class="rr-input" style="width: 100%; box-sizing: border-box;">
            </div>
            ${check('character-ask-name', tt('Ask for a name'), settings.askName !== false)}
            <div>
                <label for="character-name-length" style="display: block; color: var(--color-text); margin-bottom: 4px;">${tt('Longest name')}</label>
                <input type="number" id="character-name-length" class="rr-input" value="${settings.nameLength}" min="1" max="24" style="width: 110px;">
            </div>`);
        const actorsSection = section(details, 'character-actors', tt('Characters to choose from'), `
            <div id="character-actors" class="audio-scroll" style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px 10px; max-height: 220px; overflow-y: auto; padding: 8px; background: var(--color-bg-panel); border: 1px solid var(--color-border); border-radius: 4px;"></div>
            ${note(tt('With none ticked, players choose from the starting party. A built character plays as the first one, with that actor\'s class and stats.'))}`);
        const builderSection = section(details, 'character-rules', tt('What players can change'), `
            ${check('character-body', tt('Body'), rules.body !== false)}
            ${check('character-face', tt('Face'), rules.face !== false)}
            ${check('character-hair', tt('Hair'), rules.hair !== false)}
            ${check('character-outfit', tt('Outfit'), rules.outfit !== false)}
            ${check('character-colors', tt('Colors'), rules.colors !== false)}
            <div style="margin-bottom: 10px;">
                <label for="character-species" style="display: block; color: var(--color-text); margin-bottom: 4px;">${tt('Species')}</label>
                <select id="character-species" class="rr-select">${options([['human', tt('Human only')], ['all', tt('All species')]], rules.species === 'all' ? 'all' : 'human')}</select>
            </div>
            ${check('character-extreme', tt('Extreme proportions'), !!rules.extreme)}
            ${check('character-anatomy', tt('Anatomical detail'), !!rules.anatomy, tt('Off by default. Consider who plays your game before turning this on.'))}
            <div>
                <label for="character-quality" style="display: block; color: var(--color-text); margin-bottom: 4px;">${tt('Model quality')}</label>
                <select id="character-quality" class="rr-select">${options([['standard', tt('Standard: smaller and faster')], ['high', tt('High: more detail, larger files')]], settings.quality)}</select>
            </div>`);

        const list = container.querySelector('#character-actors');
        for (const actor of (this.databaseManager.getActors() || []).filter(entry => entry && entry.name)) {
            const row = document.createElement('label');
            row.style.cssText = 'display: flex; gap: 6px; align-items: center; cursor: pointer; color: var(--color-text); font-size: 12px; min-width: 0;';
            const box = document.createElement('input');
            box.type = 'checkbox';
            box.className = 'system-checkbox';
            box.checked = settings.actors.includes(actor.id);
            box.addEventListener('change', () => {
                const chosen = settings.actors.filter(id => id !== actor.id);
                if (box.checked) chosen.push(actor.id);
                settings.actors = chosen.sort((a, b) => a - b);
            });
            const name = document.createElement('span');
            name.textContent = actor.name;
            name.style.cssText = 'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
            row.append(box, name);
            list.appendChild(row);
        }

        const field = id => container.querySelector('#' + id);
        // The title is a person's text: set as a value, never written into the page's markup.
        field('character-prompt').value = settings.prompt || '';
        const showDetails = () => {
            details.style.display = settings.mode === 'off' ? 'none' : 'flex';
            builderSection.style.display = settings.mode === 'build' ? '' : 'none';
            actorsSection.style.display = settings.mode === 'off' ? 'none' : '';
        };
        showDetails();
        field('character-mode').addEventListener('change', event => { settings.mode = event.target.value; showDetails(); });
        field('character-new-game').addEventListener('change', event => { settings.onNewGame = event.target.checked; });
        field('character-prompt').addEventListener('change', event => { settings.prompt = event.target.value; });
        field('character-ask-name').addEventListener('change', event => { settings.askName = event.target.checked; });
        field('character-name-length').addEventListener('change', event => {
            const value = Math.round(Number(event.target.value));
            settings.nameLength = event.target.value = Number.isFinite(value) ? Math.max(1, Math.min(24, value)) : 16;
        });
        for (const key of ['body', 'face', 'hair', 'outfit', 'colors', 'extreme', 'anatomy']) {
            field('character-' + key).addEventListener('change', event => { rules[key] = event.target.checked; });
        }
        field('character-species').addEventListener('change', event => { rules.species = event.target.value; });
        field('character-quality').addEventListener('change', event => { settings.quality = event.target.value; });
    }
}

if (typeof window !== 'undefined') window.DatabaseCharacterCreationEditor = DatabaseCharacterCreationEditor;
