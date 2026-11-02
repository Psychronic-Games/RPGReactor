/**
 * DatabaseOnlineEditor - Database › Online: whether a project is a single-player or an
 * online game, and how an online game behaves: its server, accounts and chat. Kept in
 * data/ReactorOnline.json, which only exists once a project has set something here.
 * The game reads these in runtime/reactor_online.js; the server is given what it must
 * enforce at deploy time. Design: docs/DESIGN-ONLINE.md.
 */
class DatabaseOnlineEditor {
    static DEFAULTS = Object.freeze({ enabled: false, address: '', maxPlayers: 64, updatesPerSecond: 5, party: 'solo', showNames: true, showStatus: true, playtest: false });
    static ACCOUNTS = Object.freeze({ mode: 'none', registration: true, minPassword: 8, title: '', persist: true, autosave: 60, restart: true, sleepers: true, sleeperDays: 30 });
    static WORLD = Object.freeze({ switches: '', variables: '' });
    static ENGINE = Object.freeze({ enabled: true, rate: 15, movement: 'speed', maxSpeed: 16 });
    static VOICE = Object.freeze({ enabled: false, mode: 'push', key: 'V', range: 20, who: 'all', servers: 'stun:stun.l.google.com:19302' });
    static CHAT = Object.freeze({ enabled: true, who: 'all', world: true, bubbles: true, cooldown: 2, maxLength: 200, history: 50, key: 'T', blockedWords: '' });

    constructor(databaseManager) {
        this.databaseManager = databaseManager;
    }

    /** A copy with every field present. Nothing reaches the project until something is changed. */
    settings(saved) {
        return { ...DatabaseOnlineEditor.DEFAULTS, ...saved,
            accounts: { ...DatabaseOnlineEditor.ACCOUNTS, ...saved?.accounts }, chat: { ...DatabaseOnlineEditor.CHAT, ...saved?.chat }, world: { ...DatabaseOnlineEditor.WORLD, ...saved?.world }, engine: { ...DatabaseOnlineEditor.ENGINE, ...saved?.engine }, voice: { ...DatabaseOnlineEditor.VOICE, ...saved?.voice } };
    }

    showOnlineDetail(container) {
        const tt = text => window.I18n ? window.I18n.tText(text) : text;
        const settings = this.settings(this.databaseManager.getOnlineSettings());
        const accounts = settings.accounts, chat = settings.chat, world = settings.world, engine = settings.engine, voice = settings.voice;
        container.innerHTML = '';
        const wrapper = document.createElement('div');
        wrapper.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow-y: auto;';
        const title = document.createElement('div');
        title.style.cssText = 'background-color: var(--color-bg-deep); padding: 14px 20px; border-bottom: 2px solid var(--color-accent-border-mid); font-size: 20px; font-weight: 600; color: var(--color-text-strong);';
        title.textContent = tt('Online');
        const body = document.createElement('div');
        body.style.cssText = 'display: flex; flex-direction: column; gap: 16px; padding: 16px; max-width: 760px;';
        wrapper.append(title, body);
        container.appendChild(wrapper);
        // Any change writes the whole settings object, the first one creating the project's file.
        wrapper.addEventListener('change', () => { this.databaseManager.data.online = settings; });

        const note = text => `<div style="color: var(--color-text-muted); font-size: 11px; line-height: 1.4; margin-top: 4px;">${text}</div>`;
        const check = (id, label, checked, help = '') => `<label style="display: flex; gap: 8px; align-items: flex-start; margin-bottom: 10px; cursor: pointer;">
            <input type="checkbox" id="${id}" class="system-checkbox" ${checked ? 'checked' : ''}>
            <span><span style="color: var(--color-text);">${label}</span>${help ? note(help) : ''}</span></label>`;
        const number = (id, label, value, min, max, help = '') => `<div style="margin-bottom: 10px;">
            <label for="${id}" style="display: block; color: var(--color-text); margin-bottom: 4px;">${label}</label>
            <input type="number" id="${id}" class="rr-input" value="${value}" min="${min}" max="${max}" style="width: 110px;">${help ? note(help) : ''}</div>`;
        const choice = (id, label, list, value, help = '') => `<div style="margin-bottom: 10px;">
            <label for="${id}" style="display: block; color: var(--color-text); margin-bottom: 4px;">${label}</label>
            <select id="${id}" class="rr-select">${list.map(([option, text]) => `<option value="${option}" ${option === value ? 'selected' : ''}>${text}</option>`).join('')}</select>${help ? note(help) : ''}</div>`;
        const text = (id, label, placeholder, help = '') => `<div style="margin-bottom: 10px;">
            <label for="${id}" style="display: block; color: var(--color-text); margin-bottom: 4px;">${label}</label>
            <input type="text" id="${id}" class="rr-input" spellcheck="false" autocomplete="off" placeholder="${placeholder}" style="width: 100%; box-sizing: border-box;">${help ? note(help) : ''}</div>`;
        const section = (parent, key, heading, content) => {
            const element = document.createElement('div');
            element.className = 'database-section';
            element.innerHTML = `<div class="database-section-header" data-section-key="${key}">${heading}</div><div class="database-section-content">${content}</div>`;
            parent.appendChild(element);
            return element;
        };

        section(body, 'online-type', tt('Game type'), `
            <label style="display: flex; gap: 8px; margin-bottom: 8px; cursor: pointer;"><input type="radio" name="online-type" value="single" class="system-radio" ${settings.enabled ? '' : 'checked'}>
                <span style="color: var(--color-text);">${tt('Single player')}</span></label>
            <label style="display: flex; gap: 8px; cursor: pointer;"><input type="radio" name="online-type" value="online" class="system-radio" ${settings.enabled ? 'checked' : ''}>
                <span style="color: var(--color-text);">${tt('Online')}</span></label>
            ${note(tt('Online games add other players to the map. Single-player games run no online code.'))}`);
        const details = document.createElement('div');
        details.style.cssText = 'display: flex; flex-direction: column; gap: 16px;';
        body.appendChild(details);
        section(details, 'online-server', tt('Server'), `
            ${text('online-address', tt('Public address'), 'https://example.com', tt('Where the game is hosted. Desktop builds use it to find the server.'))}
            ${number('online-max', tt('Most players'), settings.maxPlayers, 1, 1024, tt('A server with no room left turns new players away. Takes effect the next time you deploy.'))}
            ${number('online-rate', tt('Updates per second'), settings.updatesPerSecond, 1, 20, tt('Higher is more responsive and works the server harder. 5 suits most web hosts.'))}
            ${check('online-playtest', tt('Connect during playtest'), settings.playtest, tt('Playtests stay offline unless this is on.'))}`);
        section(details, 'online-engine', tt('Fast connection'), `
            ${check('online-engine-on', tt('Use a fast connection where the host allows it'), engine.enabled !== false, tt('Needs Node.js and a WebSocket proxy on the server. Without them, the game connects the ordinary way.'))}
            ${number('online-engine-rate', tt('Updates per second, fast connection'), engine.rate, 5, 30)}
            ${choice('online-engine-movement', tt('Server checks movement'), [['off', tt('Off')], ['speed', tt('Speed')], ['walls', tt('Speed and walls')]], engine.movement, tt('Refuses moves a player\'s game could not have made. Checking walls uses the tileset\'s passage settings, so leave it off if a plugin changes where players can walk.'))}
            ${number('online-engine-speed', tt('Fastest speed, in tiles per second'), engine.maxSpeed, 4, 64, tt('Raise this if a vehicle or plugin moves players faster.'))}`);
        section(details, 'online-players', tt('Players'), `
            ${choice('online-party', tt('Party'), [['solo', tt('Each player alone')], ['party', tt('Each player leads the starting party')]], settings.party === 'party' ? 'party' : 'solo')}
            ${check('online-names', tt('Show names above players'), settings.showNames !== false)}
            ${check('online-status', tt('Show connection label'), settings.showStatus !== false)}`);
        section(details, 'online-accounts', tt('Accounts'), `
            ${choice('online-account-mode', tt('Signing in'), [['none', tt('Guests only, no accounts')], ['optional', tt('Accounts or guests')], ['required', tt('Accounts required')]], accounts.mode, tt('An account keeps a player\'s character across devices. Use https, because passwords travel to your server.'))}
            ${check('online-registration', tt('Allow new accounts'), accounts.registration !== false)}
            ${number('online-min-password', tt('Shortest password'), accounts.minPassword, 6, 32)}
            ${text('online-account-title', tt('Sign-in screen title'), '')}
            ${check('online-persist', tt('Keep progress on the server'), accounts.persist !== false, tt('Players with accounts wake up where they signed off, on any device.'))}
            ${number('online-autosave', tt('Seconds between saves'), accounts.autosave, 10, 600)}
            ${check('online-restart', tt('Let players start over'), accounts.restart !== false)}
            ${check('online-sleepers', tt('Show sleeping players'), accounts.sleepers !== false, tt('Players who signed off stay in the world, lying where they stopped.'))}
            ${number('online-sleeper-days', tt('Days a sleeper stays'), accounts.sleeperDays, 1, 365)}`);
        section(details, 'online-world', tt('Shared with every player'), `
            ${note(tt('Events run the same as in a single-player game. Whatever you list here is shared: when one player\'s game changes it, every player\'s game changes too. Everything else stays personal to each player.'))}
            <div style="height: 8px;"></div>
            ${text('online-world-switches', tt('Switches'), '1-5, 12')}
            ${text('online-world-variables', tt('Variables'), '20, 21')}
            ${note(tt('To share an event\'s self switches, so a chest opens once for everybody, add <world> to its note.').replace('<', '&lt;').replace('>', '&gt;'))}`);
        section(details, 'online-chat', tt('Chat'), `
            ${check('online-chat-on', tt('Players can chat'), chat.enabled !== false)}
            ${choice('online-chat-who', tt('Who can chat'), [['all', tt('Everyone')], ['accounts', tt('Signed-in players only')]], chat.who === 'accounts' ? 'accounts' : 'all')}
            ${check('online-chat-world', tt('Allow a world channel'), chat.world !== false, tt('Otherwise players only reach others on their map.'))}
            ${check('online-chat-bubbles', tt('Show speech above heads'), chat.bubbles !== false)}
            ${text('online-chat-key', tt('Chat key'), 'T')}
            ${number('online-chat-cooldown', tt('Seconds between messages'), chat.cooldown, 0, 60)}
            ${number('online-chat-length', tt('Longest message'), chat.maxLength, 20, 500)}
            ${number('online-chat-history', tt('Messages kept per channel'), chat.history, 10, 500)}
            <div>
                <label for="online-chat-blocked" style="display: block; color: var(--color-text); margin-bottom: 4px;">${tt('Blocked words')}</label>
                <textarea id="online-chat-blocked" class="rr-input" rows="3" spellcheck="false" style="width: 100%; box-sizing: border-box; resize: vertical;"></textarea>
                ${note(tt('Separated by spaces or commas. They become stars, and cannot be account names. The server enforces this.'))}
            </div>`);

        section(details, 'online-voice', tt('Voice'), `
            ${check('online-voice-on', tt('Players can speak as their characters'), voice.enabled, tt('Nearby players hear each other, and a 3D character\'s mouth moves with the sound. Sound goes directly between players, so each sees the other\'s internet address. A player connects only after pressing the voice key.'))}
            ${choice('online-voice-mode', tt('Speaking'), [['push', tt('Hold a key to speak')], ['open', tt('Microphone stays open')]], voice.mode === 'open' ? 'open' : 'push')}
            ${text('online-voice-key', tt('Voice key'), 'V')}
            ${number('online-voice-range', tt('Hearing range, in tiles'), voice.range, 5, 100)}
            ${choice('online-voice-who', tt('Who can use voice'), [['all', tt('Everyone')], ['accounts', tt('Signed-in players only')]], voice.who === 'accounts' ? 'accounts' : 'all')}
            <div>
                <label for="online-voice-servers" style="display: block; color: var(--color-text); margin-bottom: 4px;">${tt('Connection servers')}</label>
                <textarea id="online-voice-servers" class="rr-input" rows="2" spellcheck="false" style="width: 100%; box-sizing: border-box; resize: vertical;"></textarea>
                ${note(tt('One a line. These help players find each other, and the default is a public Google server. A TURN server, written as "turn:host:port user password", also reaches players a home router would block.'))}
            </div>`);

        const field = id => container.querySelector('#' + id);
        // People's text is set as a value, never written into the page's markup.
        field('online-address').value = settings.address || '';
        field('online-account-title').value = accounts.title || '';
        field('online-world-switches').value = world.switches || '';
        field('online-world-variables').value = world.variables || '';
        field('online-chat-key').value = chat.key || 'T';
        field('online-voice-key').value = voice.key || 'V';
        field('online-voice-servers').value = voice.servers || '';
        field('online-chat-blocked').value = chat.blockedWords || '';
        const showDetails = () => { details.style.display = settings.enabled ? 'flex' : 'none'; };
        showDetails();
        container.querySelectorAll('input[name="online-type"]').forEach(radio => radio.addEventListener('change', () => {
            settings.enabled = radio.value === 'online' && radio.checked;
            showDetails();
        }));
        const whole = (input, low, high, fallback) => {
            const value = Math.round(Number(input.value));
            const held = Number.isFinite(value) && input.value !== '' ? Math.max(low, Math.min(high, value)) : fallback;
            input.value = held;
            return held;
        };
        const on = (id, apply) => field(id).addEventListener('change', event => apply(event.target));
        on('online-address', input => { settings.address = input.value.trim(); });
        on('online-max', input => { settings.maxPlayers = whole(input, 1, 1024, 64); });
        on('online-rate', input => { settings.updatesPerSecond = whole(input, 1, 20, 5); });
        on('online-voice-on', input => { voice.enabled = input.checked; });
        on('online-voice-mode', input => { voice.mode = input.value; });
        on('online-voice-key', input => { voice.key = input.value.trim().slice(0, 1).toUpperCase() || 'V'; input.value = voice.key; });
        on('online-voice-range', input => { voice.range = whole(input, 5, 100, 20); });
        on('online-voice-who', input => { voice.who = input.value; });
        on('online-voice-servers', input => { voice.servers = input.value.trim(); });
        on('online-engine-on', input => { engine.enabled = input.checked; });
        on('online-engine-rate', input => { engine.rate = whole(input, 5, 30, 15); });
        on('online-engine-movement', input => { engine.movement = input.value; });
        on('online-engine-speed', input => { engine.maxSpeed = whole(input, 4, 64, 16); });
        on('online-party', input => { settings.party = input.value; });
        on('online-playtest', input => { settings.playtest = input.checked; });
        on('online-names', input => { settings.showNames = input.checked; });
        on('online-status', input => { settings.showStatus = input.checked; });
        on('online-account-mode', input => { accounts.mode = input.value; });
        on('online-registration', input => { accounts.registration = input.checked; });
        on('online-min-password', input => { accounts.minPassword = whole(input, 6, 32, 8); });
        on('online-account-title', input => { accounts.title = input.value; });
        on('online-persist', input => { accounts.persist = input.checked; });
        on('online-autosave', input => { accounts.autosave = whole(input, 10, 600, 60); });
        on('online-restart', input => { accounts.restart = input.checked; });
        on('online-sleepers', input => { accounts.sleepers = input.checked; });
        on('online-sleeper-days', input => { accounts.sleeperDays = whole(input, 1, 365, 30); });
        on('online-world-switches', input => { world.switches = input.value.trim(); });
        on('online-world-variables', input => { world.variables = input.value.trim(); });
        on('online-chat-on', input => { chat.enabled = input.checked; });
        on('online-chat-who', input => { chat.who = input.value; });
        on('online-chat-world', input => { chat.world = input.checked; });
        on('online-chat-bubbles', input => { chat.bubbles = input.checked; });
        on('online-chat-key', input => { chat.key = (input.value.trim() || 'T').slice(0, 1).toUpperCase(); input.value = chat.key; });
        on('online-chat-cooldown', input => { chat.cooldown = whole(input, 0, 60, 2); });
        on('online-chat-length', input => { chat.maxLength = whole(input, 20, 500, 200); });
        on('online-chat-history', input => { chat.history = whole(input, 10, 500, 50); });
        on('online-chat-blocked', input => { chat.blockedWords = input.value; });
    }
}

if (typeof window !== 'undefined') window.DatabaseOnlineEditor = DatabaseOnlineEditor;
