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
        const { wrapper, form } = DatabaseFlowForm.page(container, tt('Character Creation'));
        // Any change writes the whole settings object, the first one creating the project's file.
        wrapper.addEventListener('change', () => { this.databaseManager.data.characterCreation = settings; });

        form.section('character-mode', tt('How players get their character'), `
            ${form.fields(form.choice('character-mode', '', [
                ['off', tt('Off: play the project\'s actors')],
                ['choose', tt('Choose from a list of characters')],
                ['build', tt('Build a character with sliders')]], settings.mode, '', true))}
            ${form.note(tt('Works in single-player and online games. The Character Creation event command opens it at any time.'))}`);
        const details = [form.section('character-start', tt('Starting a game'), `
            ${form.fields(
                form.choice('character-when', tt('When players get their character'), [
                    ['start', tt('As a new game starts')],
                    ['event', tt('When an event calls it')]], settings.onNewGame !== false ? 'start' : 'event', '', true),
                form.text('character-prompt', tt('Screen title')),
                form.number('character-name-length', tt('Longest name'), settings.nameLength, 1, 24),
                form.check('character-ask-name', tt('Ask for a name'), settings.askName !== false))}
            <div id="character-when-note">${form.note(tt('Put the Character Creation event command where your intro should hand over to it. Until then the player is the first actor.'))}</div>`)];
        const actorsSection = form.section('character-actors', tt('Characters to choose from'), `
            <div id="character-actors" class="audio-scroll rr-flow-list"></div>
            ${form.note(tt('With none ticked, players choose from the starting party. A built character plays as the first one, with that actor\'s class and stats.'))}`);
        const builderSection = form.section('character-rules', tt('What players can change'), `
            ${form.fields(
                form.check('character-body', tt('Body'), rules.body !== false),
                form.check('character-face', tt('Face'), rules.face !== false),
                form.check('character-hair', tt('Hair'), rules.hair !== false),
                form.check('character-outfit', tt('Outfit'), rules.outfit !== false),
                form.check('character-colors', tt('Colors'), rules.colors !== false),
                form.check('character-extreme', tt('Extreme proportions'), !!rules.extreme),
                form.check('character-anatomy', tt('Anatomical detail'), !!rules.anatomy, tt('Off by default. Consider who plays your game before turning this on.')),
                form.choice('character-species', tt('Species'), [['human', tt('Human only')], ['all', tt('All species')]], rules.species === 'all' ? 'all' : 'human'),
                form.choice('character-quality', tt('Model quality'), [['standard', tt('Standard: smaller and faster')], ['high', tt('High: more detail, larger files')]], settings.quality))}`);

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
            const on = settings.mode !== 'off';
            for (const section of details) section.style.display = on ? '' : 'none';
            builderSection.style.display = settings.mode === 'build' ? '' : 'none';
            actorsSection.style.display = on ? '' : 'none';
            field('character-when-note').style.display = on && settings.onNewGame === false ? '' : 'none';
        };
        showDetails();
        field('character-mode').addEventListener('change', event => { settings.mode = event.target.value; showDetails(); });
        field('character-when').addEventListener('change', event => { settings.onNewGame = event.target.value === 'start'; showDetails(); });
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
