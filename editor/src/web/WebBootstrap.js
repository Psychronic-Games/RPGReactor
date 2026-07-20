(async function () {
    const tt = (text, replacements = {}) => {
        const translated = window.I18n && typeof window.I18n.tText === 'function'
            ? window.I18n.tText(text)
            : text;
        return Object.entries(replacements).reduce((result, [key, value]) => (
            result.split(`{${key}}`).join(String(value))
        ), translated);
    };

    try {
        await window.RPGReactorWebHost.initialize();
        const script = document.createElement('script');
        script.src = 'web/main.js';
        script.onerror = () => { throw new Error(tt('Could not load the RPG Reactor browser entry point.')); };
        document.body.appendChild(script);
    } catch (error) {
        console.error('RPG Reactor Web failed to start:', error);
        const message = document.createElement('div');
        message.style.cssText = 'position:fixed;inset:0;z-index:20000;display:grid;place-items:center;padding:30px;background:#171717;color:#f0d58a;font:16px sans-serif;text-align:center;';
        message.textContent = tt('RPG Reactor Web could not start: {error}', { error: error.message || error });
        document.body.appendChild(message);
    }
})();
